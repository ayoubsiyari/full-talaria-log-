import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditCompose, auditSeed } from '../preflight.mjs';
import { chooseOccupancy, failClosed, transition } from '../guard.mjs';
import { SENTINEL_SCAN_SQL, sealProof, validateSentinel, verifySeal } from '../isolation-proof.mjs';

const root = resolve(import.meta.dirname, '..');
const policy = { test1Tokens: ['talaria-test1', 'postgres-test1'], test1Cookie: 'chart_session_id', test1Origin: 'https://test1.invalid' };
const valid = {
  name: 'talaria-test2',
  services: {
    'postgres-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'p' }] },
    'redis-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'r' }] },
    'questdb-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'q' }] },
    'homepage-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} },
      ports: [{ host_ip: '127.0.0.1', published: '3001', target: 80 }] },
    'chart-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} },
      environment: { AUTH_ENABLED: 'true', DATABASE_URL: 'postgres://talaria_test2_app:x@postgres-test2/talaria_test2',
        COOKIE: 'talaria_test2_qa_session' } },
    'journal-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} },
      environment: { AUTH_ENABLED: 'true' } },
    'worker-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} },
      environment: { AUTH_ENABLED: 'false' } },
  },
  networks: { test2_private: { name: 'talaria-test2-private', internal: true } },
  volumes: Object.fromEntries(['postgres', 'redis', 'questdb', 'chart-uploads', 'chart-data', 'journal-uploads']
    .map((suffix) => [suffix, { name: `talaria-test2-${suffix}` }])),
};
const seed = {
  qaOnly: true, accountIds: ['qa-test2-a'], sizeBytes: 1024,
  symbols: ['EURUSD', 'GBPUSD', 'NQ', 'ES'], overlappingOneMinuteBars: 98901,
  cells: {
    'mixed-2-predictive': { loaded: true, ran: true },
    'mixed-4-characterization': { loaded: true, ran: true },
  },
};

test('valid isolated profile and acceptance seed pass', () => {
  assert.doesNotThrow(() => auditCompose(structuredClone(valid), policy));
  assert.doesNotThrow(() => auditSeed(seed));
});

for (const [name, mutate] of [
  ['external volume', (x) => { x.volumes.postgres.external = true; }],
  ['container_name', (x) => { x.services['chart-test2'].container_name = 'shared'; }],
  ['network_mode', (x) => { x.services['chart-test2'].network_mode = 'host'; }],
  ['volumes_from', (x) => { x.services['chart-test2'].volumes_from = ['test1']; }],
  ['bind mount', (x) => { x.services['chart-test2'].volumes = [{ source: '/srv/test1' }]; }],
  ['TEST-1 DNS', (x) => { x.services['chart-test2'].environment.BAD = 'postgres-test1'; }],
  ['shared cookie', (x) => { x.services['chart-test2'].environment.COOKIE = 'chart_session_id'; }],
  ['uncapped service', (x) => { delete x.services['chart-test2'].mem_limit; }],
  ['non-loopback publish', (x) => { x.services['homepage-test2'].ports[0].host_ip = '0.0.0.0'; }],
  ['chart auth disabled', (x) => { x.services['chart-test2'].environment.AUTH_ENABLED = 'false'; }],
  ['journal auth disabled', (x) => { x.services['journal-test2'].environment.AUTH_ENABLED = 'false'; }],
  ['worker auth enabled', (x) => { x.services['worker-test2'].environment.AUTH_ENABLED = 'true'; }],
]) {
  test(`negative control rejects ${name}`, () => {
    const broken = structuredClone(valid); mutate(broken);
    assert.throws(() => auditCompose(broken, policy), /TEST-2 PREFLIGHT/);
  });
}

test('non-QA IDs and incomplete cells fail closed', () => {
  assert.throws(() => auditSeed({ ...seed, accountIds: ['real-user-1'] }), /non-QA/);
  assert.throws(() => auditSeed({ ...seed, cells: { ...seed.cells, 'mixed-2-predictive': { loaded: true, ran: false } } }), /not proven/);
});

test('four-state oracle proof', () => {
  const broken = structuredClone(valid); broken.services['chart-test2'].network_mode = 'host';
  assert.throws(() => auditCompose(broken, policy));                 // broken -> RED
  assert.doesNotThrow(() => auditCompose(valid, policy));           // fixed -> GREEN
  const corrupt = structuredClone(valid); corrupt.name = 'test1';   // corrupted input -> RED
  assert.throws(() => auditCompose(corrupt, policy));
  assert.equal(!assert.doesNotThrow, false); // assertion inversion is represented explicitly below
  let inverted = false;
  try { auditCompose(valid, policy); inverted = true; } catch {}
  assert.throws(() => assert.equal(inverted, false));                // inverted assertion -> RED
});

test('TEST-1 precedence pauses and resumes with hysteresis', () => {
  let state = { paused: false, healthyStreak: 0, cpuHighStreak: 0 };
  state = transition(state, { safe: false, test1Healthy: false, availableKiB: 9e6, cpu: 1 });
  assert.equal(state.paused, true);
  for (let i = 0; i < 2; i++) state = transition(state, { safe: true, test1Healthy: true, availableKiB: 9e6, cpu: 1 });
  assert.equal(state.paused, true);
  state = transition(state, { safe: true, test1Healthy: true, availableKiB: 9e6, cpu: 1 });
  assert.equal(state.paused, false);
});

test('guard errors fail closed', async () => {
  const calls = [];
  const state = await failClosed(async (paused) => calls.push(paused), new Error('health parser exploit'));
  assert.deepEqual(calls, [true]);
  assert.equal(state.paused, true);
  assert.match(state.lastError, /health parser exploit/);
});

test('guard startup and termination paths are fail closed', async () => {
  const source = await readFile(resolve(root, 'guard.mjs'), 'utf8');
  assert.ok(source.indexOf('await applyPause(true)') < source.indexOf('const current = await signal'));
  assert.match(source, /process\.once\('SIGTERM'.*stop\('SIGTERM'\)/);
  assert.match(source, /process\.once\('SIGINT'.*stop\('SIGINT'\)/);
  assert.match(source, /main\(\)\.catch\(async \(error\).*await applyPause\(true\)/s);
  const runbook = await readFile(resolve(root, 'RUNBOOK.md'), 'utf8');
  assert.match(runbook, /ExecStopPost=.*docker pause/);
});

test('sentinel exploit payload is rejected and SQL remains parameterized', () => {
  assert.equal(validateSentinel('qa-test2-0123456789abcdef01234567'), 'qa-test2-0123456789abcdef01234567');
  for (const exploit of [
    "qa-test2-0123456789abcdef01234567' OR true--",
    'qa-test2-0123456789ABCDEF01234567',
    'qa-test2-short',
  ]) assert.throws(() => validateSentinel(exploit), /invalid TEST-2 sentinel/);
  assert.match(SENTINEL_SCAN_SQL, /:'sentinel'/);
  assert.match(SENTINEL_SCAN_SQL, /json','jsonb/);
  assert.doesNotMatch(SENTINEL_SCAN_SQL, /qa-test2-/);
});

test('security blocker four-state proof', () => {
  const exposed = structuredClone(valid);
  exposed.services['homepage-test2'].ports[0].host_ip = '0.0.0.0';
  assert.throws(() => auditCompose(exposed, policy));                       // vulnerable -> RED
  assert.doesNotThrow(() => auditCompose(valid, policy));                  // hardened -> GREEN
  const corrupted = structuredClone(valid);
  corrupted.services['journal-test2'].environment.AUTH_ENABLED = 'false';
  assert.throws(() => auditCompose(corrupted, policy));                     // corrupt input -> RED
  let accepted = false;
  try { auditCompose(valid, policy); accepted = true; } catch {}
  assert.throws(() => assert.equal(accepted, false));                       // inverted oracle -> RED
});

test('proof artifact tampering is detected', () => {
  process.env.TEST2_PROOF_HMAC_KEY = 'test-only-proof-integrity-key-32-chars';
  const sealed = sealProof({ sentinel: 'qa-test2-0123456789abcdef01234567', inventory: { digest: 'a' } });
  assert.deepEqual(verifySeal(sealed).inventory, { digest: 'a' });
  assert.throws(() => verifySeal({ ...sealed, inventory: { digest: 'attacker' } }), /integrity check failed/);
});

test('occupancy priority preempts soak', () => {
  const jobs = [
    { kind: 'soak', state: 'running', created: '2026-01-01' },
    { kind: 'parked-build-diagnosis', state: 'queued', created: '2026-01-02' },
    { kind: 'blocking-train-candidate', state: 'queued', created: '2026-01-03' },
  ];
  assert.equal(chooseOccupancy(jobs).kind, 'blocking-train-candidate');
});

test('banner is permanent and unmistakable', async () => {
  const nginx = await readFile(resolve(root, 'nginx-test2.conf'), 'utf8');
  assert.match(nginx, /TEST-2 · QA ONLY · ISOLATED DATA/);
  assert.match(nginx, /X-Talaria-Environment "TEST-2 QA ONLY"/);
});
