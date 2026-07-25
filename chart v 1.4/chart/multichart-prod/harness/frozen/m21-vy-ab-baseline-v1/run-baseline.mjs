/**
 * Run the frozen A/B probe baseline (bounded 15/60/100 @ playMs=20000).
 *
 * STATUS: PRELIMINARY-PENDING-GPT56-BASELINE-ACCEPTANCE
 * Refuses if live probe/predoc diverge from CONTRACT pins.
 * No product edits. No GREEN/accepted-RED claim. No auth.
 *
 *   node frozen/m21-vy-ab-baseline-v1/run-baseline.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(__dirname, '..', '..');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(__dirname, 'CONTRACT.json'), 'utf8'));

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function assertPin(label, filePath, expected) {
  const got = sha256(filePath);
  if (got !== expected) {
    throw new Error(
      `BASELINE-PROVENANCE-FAIL: ${label} hash mismatch\n  expected ${expected}\n  got      ${got}\n  path     ${filePath}`,
    );
  }
}

const probe = path.join(HARNESS, 'm21-painted-endpoint-value-y-red-probe.mjs');
const predoc = path.join(HARNESS, 'm21-vy-predoc-flags.mjs');
const frozenProbe = path.join(__dirname, 'blobs', 'm21-painted-endpoint-value-y-red-probe.mjs');
const frozenPredoc = path.join(__dirname, 'blobs', 'm21-vy-predoc-flags.mjs');

assertPin('live-probe', probe, CONTRACT.pins.probeSha256);
assertPin('frozen-probe-blob', frozenProbe, CONTRACT.pins.probeSha256);
assertPin('live-predoc', predoc, CONTRACT.pins.predocSha256);
assertPin('frozen-predoc-blob', frozenPredoc, CONTRACT.pins.predocSha256);

const repoRoot = path.resolve(HARNESS, '..', '..', '..', '..', '..');
const outRel = 'docs/plan3/evidence/W5-M21-VY-AB-BASELINE-v1-b61.PRELIMINARY-PENDING-GPT56-BASELINE-ACCEPTANCE.json';
const outPath = path.join(repoRoot, outRel);
const runlog = path.join(repoRoot, 'docs/plan3/evidence/W5-M21-VY-AB-BASELINE-v1-b61.runlog.txt');

const env = {
  ...process.env,
  M19_EXPECTED_BUILD_ID: CONTRACT.buildPin.expectedBuildId,
  M19_DEPLOYED_ORIGIN: CONTRACT.buildPin.deployedOrigin,
  M21_VY_BOUNDED_MATRIX: '1',
  M21_VY_BOUNDED_MAX: '5',
  M21_VY_BOUNDED_TARGET_OK: '3',
  M21_VY_OUT: outPath,
  M21_VY_PRIMARY_TYPE: CONTRACT.protocol.primaryType,
};
// Red baseline: no predoc injection
delete env.M21_VY_PREDOC_FLAGS;
delete env.M21_VY_PREP_MATRIX;
delete env.M21_VY_DENSITY_DIAG;
// Do not override gates — probe defaults / CONTRACT thresholds
for (const k of [
  'M21_VY_MAX_Y_PX', 'M21_VY_MAX_VALUE_ABS', 'M21_VY_MAX_VALUE_REL',
  'M21_VY_MIN_EVALUATED', 'M21_VY_PLAY_MS_60X', 'M21_VY_PLAY_MS_100X',
]) {
  delete env[k];
}

process.stderr.write(
  `[frozen-baseline] contract=${CONTRACT.contractId} probe=${CONTRACT.pins.probeSha256.slice(0, 16)}… `
  + `build=${CONTRACT.buildPin.expectedBuildId} playMs=${CONTRACT.protocol.playMsFixed}\n`,
);

const res = spawnSync(process.execPath, [probe], {
  cwd: HARNESS,
  env,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

const combined = `${res.stdout || ''}${res.stderr || ''}`;
fs.writeFileSync(runlog, combined);
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');

if (fs.existsSync(outPath)) {
  const ev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  ev.frozenBaselineContract = {
    contractId: CONTRACT.contractId,
    status: CONTRACT.status,
    probeSha256: CONTRACT.pins.probeSha256,
    predocSha256: CONTRACT.pins.predocSha256,
    thresholdEvidenceSha256: CONTRACT.thresholdEvidenceSha256,
    continuityWithAcceptedB61Red: CONTRACT.eligibility.continuityWithAcceptedB61Red,
    acceptedProbeRecovered: false,
  };
  ev.status = CONTRACT.status;
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
}

process.exitCode = res.status == null ? 2 : res.status;
