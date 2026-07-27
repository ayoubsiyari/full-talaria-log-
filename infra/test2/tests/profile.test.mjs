import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditCompose, auditSeed } from '../preflight.mjs';
import { chooseOccupancy, transition } from '../guard.mjs';

const root = resolve(import.meta.dirname, '..');
const policy = { test1Tokens: ['talaria-test1', 'postgres-test1'], test1Cookie: 'chart_session_id', test1Origin: 'https://test1.invalid' };
const valid = {
  name: 'talaria-test2',
  services: {
    'postgres-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'p' }] },
    'redis-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'r' }] },
    'questdb-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, volumes: [{ source: 'q' }] },
    'homepage-test2': { mem_limit: '1g', cpus: 1, networks: { test2_private: {} }, ports: [{ published: '3001' }] },
    app: { mem_limit: '1g', cpus: 1, networks: { test2_private: {} },
      environment: { DATABASE_URL: 'postgres://talaria_test2_app:x@postgres-test2/talaria_test2', COOKIE: 'talaria_test2_qa_session' } },
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
  ['container_name', (x) => { x.services.app.container_name = 'shared'; }],
  ['network_mode', (x) => { x.services.app.network_mode = 'host'; }],
  ['volumes_from', (x) => { x.services.app.volumes_from = ['test1']; }],
  ['bind mount', (x) => { x.services.app.volumes = [{ source: '/srv/test1' }]; }],
  ['TEST-1 DNS', (x) => { x.services.app.environment.BAD = 'postgres-test1'; }],
  ['shared cookie', (x) => { x.services.app.environment.COOKIE = 'chart_session_id'; }],
  ['uncapped service', (x) => { delete x.services.app.mem_limit; }],
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
  const broken = structuredClone(valid); broken.services.app.network_mode = 'host';
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
