import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mc = path.join(root, 'tests/evidence/b70-stage5/mc-restore-authenticated-ab-runner.mjs');
const component = path.join(root,
  'chart v 1.4/chart/multichart-prod/harness/m23-3-indicator-ledger-short-cell.mjs');
const fixture = path.join(root, 'scripts/tests/fixtures/session849-mc-restore.json');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('authenticated MC_RESTORE command dry-run validates session849 fixture safely', () => {
  const secret = 'not-for-output-9f2c';
  const result = spawnSync(process.execPath, [mc, '--dry-run', `--fixture=${fixture}`], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, TEST_EMAIL: 'qa@example.invalid', TEST_PASSWORD: secret },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.layout, '3v');
  assert.equal(plan.topology, 'host+2-iframes');
  assert.equal(plan.fixture.assignmentCount, 3);
  assert.deepEqual(plan.arms.map((arm) => arm.expected), ['RED', 'GREEN']);
  assert.equal(plan.arms[1].reloads, 10);
  assert.match(plan.cleanup, /release.*close browser/);
});

test('runner contracts pin identity, claims, cleanup, and reject old layout', () => {
  const source = fs.readFileSync(mc, 'utf8');
  assert.match(source, /mcLayout=3v/);
  assert.doesNotMatch(source, /mcLayout=3(?:[&"`'])/);
  assert.match(source, /api\/chart\/windows\/claim/);
  assert.match(source, /api\/chart\/windows\/release/);
  assert.match(source, /const entries = \[\{ id: 'A', host: true \}, \.\.\.iframeEntries\]/);
  assert.match(source, /pollExternally/);
  assert.match(source, /evaluateTimeoutMs: 5_000/);
  assert.match(source, /classifyArmPanel/);
  assert.match(source, /classifyOffDeadline/);
  assert.match(source, /isTerminal: \(\) => false/);
  assert.match(source, /__talaria_mc_ab_arm/);
  assert.match(source, /transitionAbState/);
  assert.match(source, /result\.state, 'COMPLETE'/);
  assert.match(source, /MC snapshot timeout stage=/);
  assert.match(source, /strictIdentity/);
  assert.match(source, /nonblack/);
  assert.match(source, /exercisePlayback/);
  assert.match(source, /finally/);
});

test('runner closure and reviewed version hashes are exact', () => {
  const pins = JSON.parse(fs.readFileSync(path.join(root,
    'scripts/acceptance-runner-pins.json'), 'utf8'));
  assert.equal(sha(mc), pins.mcRestoreAuthenticatedAb.sha256);
  assert.equal(sha(component), pins.indicatorLedgerShortCell.sha256);
  for (const pinName of [
    'mcRestoreEvidenceModel', 'mcSnapshotContract', 'mcSnapshotContractTest',
    'puppeteerExternalPoll', 'sealedBrowserRuntime', 'browserRuntimePins',
  ]) {
    assert.equal(sha(path.join(root, pins[pinName].path)), pins[pinName].sha256);
  }
  assert.deepEqual(pins.diagnosticSource.lineage, ['877fb093f', '33733b9e7', '98a41b602']);
  assert.equal(pins.diagnosticSource.upstreamRunnerSha256,
    'ffbb3cd99646348089baae6c72f524b66a82c8e44014793664778a34b5299bfd');
  for (const dependency of pins.minimalClosure) {
    assert.equal(fs.existsSync(path.join(root, dependency)), true, dependency);
  }
});
