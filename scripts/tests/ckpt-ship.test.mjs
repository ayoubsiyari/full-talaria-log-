import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shipPath = path.join(root, 'scripts/ckpt-ship.sh');
const enginePath = path.join(root, 'scripts/deploy-test-checkpoint.sh');

function shPath(value) {
  return value.replaceAll('\\', '/').replace(
    /^([A-Za-z]):/,
    (_, drive) => `/mnt/${drive.toLowerCase()}`,
  );
}

function makeHarness(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-ship-'));
  t.after(() => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(fixture, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt === 9) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  });
  const repo = path.join(fixture, 'repo');
  const scripts = path.join(repo, 'scripts');
  const bin = path.join(fixture, 'bin');
  const state = path.join(fixture, 'state');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(state, '20260725b68'), { recursive: true });
  fs.copyFileSync(shipPath, path.join(scripts, 'ckpt-ship.sh'));
  fs.writeFileSync(path.join(state, '20260725b68', 'CKPT-68.provenance.json'), '{}\n');
  fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env bash
case "$*" in
  "status --porcelain --untracked-files=all") exit 0 ;;
  "rev-parse HEAD"|"rev-parse @{u}") printf '%040d\\n' 0 ;;
  "ls-remote --tags origin refs/tags/*-20260725b69-source^{}")
    printf '%040d\\trefs/tags/d034-20260725b69-source^{}\\n' 1 ;;
  *) printf 'unexpected git: %s\\n' "$*" >&2; exit 9 ;;
esac
`);
  fs.writeFileSync(path.join(scripts, 'deploy-test-checkpoint.sh'), `#!/usr/bin/env bash
set -eu
build= checkpoint= state= plan=0
for arg in "$@"; do case "$arg" in
  --build-id=*) build="\${arg#*=}" ;;
  --checkpoint=*) checkpoint="\${arg#*=}" ;;
  --state-root=*) state="\${arg#*=}" ;;
  --dry-run) plan=1 ;;
esac; done
printf '%s\\n' "$*" >>"\${HARNESS_CALLS}"
(( plan )) && { printf 'DRY RUN: mocked complete chain\\n'; exit 0; }
mkdir -p "$state/$build"
printf '{}\\n' >"$state/$build/$checkpoint.provenance.json"
printf '{}\\n' >"$state/$build/runtime.json"
if [[ -n "\${FAIL_ONCE:-}" && ! -e "\${FAIL_ONCE}" ]]; then touch "\${FAIL_ONCE}"; exit 17; fi
`);
  for (const file of [path.join(bin, 'git'), path.join(scripts, 'deploy-test-checkpoint.sh')]) {
    fs.chmodSync(file, 0o755);
  }
  return { fixture, repo, state, bin, calls: path.join(fixture, 'calls') };
}

function invoke(harness, extra = [], env = {}) {
  const bash = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'bash.exe');
  const args = [
    shPath(path.join(harness.repo, 'scripts', 'ckpt-ship.sh')),
    '--checkpoint=CKPT-69', '--build-id=20260725b69',
    `--state-root=${shPath(harness.state)}`, ...extra,
  ];
  const quoted = args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
  const failOnce = env.FAIL_ONCE ? ` FAIL_ONCE='${env.FAIL_ONCE}'` : '';
  const command = `export PATH='${shPath(harness.bin)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' HARNESS_CALLS='${shPath(harness.calls)}'${failOnce}; exec bash ${quoted}`;
  return spawnSync(bash, ['-c', command], {
    cwd: harness.fixture,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME || process.env.USERPROFILE,
      ROOT: shPath(harness.repo),
      HARNESS_CALLS: shPath(harness.calls),
      ...env,
    },
  });
}

test('cold-shell plan and full mocked chain use exact TEST profile', (t) => {
  const harness = makeHarness(t);
  const plan = invoke(harness, ['--plan', '--no-build']);
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /DRY RUN: mocked complete chain/);
  let calls = fs.readFileSync(harness.calls, 'utf8');
  assert.match(calls, /--public-origin=http:\/\/31\.97\.192\.82:3000/);
  assert.match(calls, /--compose-project=talaria/);
  assert.match(calls, /--no-build/);

  const full = invoke(harness);
  assert.equal(full.status, 0, full.stderr);
  assert.match(full.stdout, /SHIP COMPLETE/);
  assert.ok(fs.existsSync(path.join(
    harness.state, '20260725b69', 'SHIP-LOG-20260725b69.txt',
  )));
  calls = fs.readFileSync(harness.calls, 'utf8');
  assert.match(calls, /--rollback-manifest=.*CKPT-68\.provenance\.json/);
});

test('interrupted command resumes with identical source-aware arguments', (t) => {
  const harness = makeHarness(t);
  const marker = shPath(path.join(harness.fixture, 'failed-once'));
  const first = invoke(harness, [], { FAIL_ONCE: marker });
  assert.equal(first.status, 17);
  const second = invoke(harness, [], { FAIL_ONCE: marker });
  assert.equal(second.status, 0, second.stderr);
  const calls = fs.readFileSync(harness.calls, 'utf8').trim().split(/\r?\n/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
});

test('wrong digest prints the underlying manifest refusal verbatim', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-wrong-digest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'scripts/fixtures/checkpoint-provenance/green-manifest.json'), 'utf8',
  ));
  manifest.images.chart.digest = `sha256:${'f'.repeat(64)}`;
  const target = path.join(dir, 'wrong.json');
  fs.writeFileSync(target, JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/checkpoint-provenance.mjs'),
    'validate-manifest', `--manifest=${target}`,
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /images\.chart\.digest differs from its ref/);
});

test('stable command and engine expose no guard bypass', () => {
  const ship = fs.readFileSync(shipPath, 'utf8');
  const engine = fs.readFileSync(enginePath, 'utf8');
  assert.match(ship, /--provenance-guard-off\|--force.*prohibited/);
  assert.match(engine, /validate manifest and run fail-closed preflight/);
  assert.match(engine, /sha256sum --check --status/);
  assert.doesNotMatch(`${ship}\n${engine}`, /DISABLE_PROD_SECURITY_CHECK|guard-off=.*1/);
});
