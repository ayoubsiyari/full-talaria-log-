/**
 * 30s protocol bridge on FROZEN probe pin (does NOT modify frozen blobs).
 *
 * STATUS: PENDING-GPT-FRESH-BASELINE-ACCEPTANCE
 *
 * BOUNDED_MATRIX hardcodes playMs=20000 inside the frozen probe. To keep exact
 * bytes SHA b1a5438d…, this runner uses the same probe file's DENSITY_DIAG path
 * with M21_VY_PLAY_MS_FIXED=30000 and 5 attempts/speed (superset of
 * max-5-until-3-density-OK). Post-processes bounded-equivalent counts.
 *
 *   node frozen/m21-vy-ab-baseline-v1/run-30s-bridge.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(__dirname, '..', '..');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(__dirname, 'CONTRACT.json'), 'utf8'));
const FROZEN_PROBE_SHA = 'b1a5438d1e57f85f7fd9dd2d09dc3e7337c6e8eedff43b1fc0876cc1bfdbe984';

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function assertPin(label, filePath, expected) {
  const got = sha256(filePath);
  if (got !== expected) {
    throw new Error(`30S-BRIDGE-PIN-FAIL: ${label}\n  expected ${expected}\n  got ${got}`);
  }
}

const probe = path.join(HARNESS, 'm21-painted-endpoint-value-y-red-probe.mjs');
const predoc = path.join(HARNESS, 'm21-vy-predoc-flags.mjs');
const frozenProbe = path.join(__dirname, 'blobs', 'm21-painted-endpoint-value-y-red-probe.mjs');

if (CONTRACT.pins.probeSha256 !== FROZEN_PROBE_SHA) {
  throw new Error('CONTRACT probe pin drifted from declared b1a5438d… — refuse');
}
assertPin('live-probe', probe, FROZEN_PROBE_SHA);
assertPin('frozen-probe-blob', frozenProbe, FROZEN_PROBE_SHA);
assertPin('live-predoc', predoc, CONTRACT.pins.predocSha256);

const repoRoot = path.resolve(HARNESS, '..', '..', '..', '..', '..');
const outPath = path.join(
  repoRoot,
  'docs/plan3/evidence/W5-M21-VY-AB-BASELINE-v1-b61-30S-BRIDGE.PENDING-GPT-FRESH-BASELINE-ACCEPTANCE.json',
);
const runlog = path.join(
  repoRoot,
  'docs/plan3/evidence/W5-M21-VY-AB-BASELINE-v1-b61-30S-BRIDGE.runlog.txt',
);

const env = {
  ...process.env,
  M19_EXPECTED_BUILD_ID: CONTRACT.buildPin.expectedBuildId,
  M19_DEPLOYED_ORIGIN: CONTRACT.buildPin.deployedOrigin,
  M21_VY_DENSITY_DIAG: '1',
  M21_VY_PLAY_MS_FIXED: '30000',
  M21_VY_CTRL_SPEED: '15',
  M21_VY_DENSITY_REPEATS_CTRL: '5',
  M21_VY_DENSITY_REPEATS_60: '5',
  M21_VY_DENSITY_REPEATS_100: '5',
  M21_VY_OUT: outPath,
  M21_VY_PRIMARY_TYPE: CONTRACT.protocol.primaryType,
};
delete env.M21_VY_PREDOC_FLAGS;
delete env.M21_VY_BOUNDED_MATRIX;
delete env.M21_VY_PREP_MATRIX;
for (const k of [
  'M21_VY_MAX_Y_PX', 'M21_VY_MAX_VALUE_ABS', 'M21_VY_MAX_VALUE_REL',
  'M21_VY_MIN_EVALUATED', 'M21_VY_PLAY_MS_60X', 'M21_VY_PLAY_MS_100X',
]) {
  delete env[k];
}

process.stderr.write(
  `[30s-bridge] frozenPin=${FROZEN_PROBE_SHA.slice(0, 16)}… playMs=30000 `
  + `attempts=5/speed build=${CONTRACT.buildPin.expectedBuildId}\n`
  + '[30s-bridge] note: uses DENSITY_DIAG path (env playMs) because BOUNDED_MATRIX '
  + 'hardcodes 20000 inside frozen bytes — probe SHA unchanged.\n',
);

const res = spawnSync(process.execPath, [probe], {
  cwd: HARNESS,
  env,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

fs.writeFileSync(runlog, `${res.stdout || ''}${res.stderr || ''}`);
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');

/** Reduce a full 5-attempt series to bounded-equivalent (stop after 3 densOk). */
function boundedEquivalent(runs, speed) {
  const attempts = [];
  let densOk = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    attempts.push({
      attemptIndex: i + 1,
      label: r.label,
      speed: r.speed ?? speed,
      playMs: r.playMs ?? 30000,
      evaluatedCount: r.evaluatedCount,
      densityOk: r.densityOk === true,
      densityClass: r.densityClass?.class || r.densityClass || null,
      paintedRed: r.paintedRed === true,
      maxPrimaryAbsYPx: r.maxPrimaryAbsYPx ?? r.maxTemaAbsYPx,
      staleRatio: r.staleRatio,
    });
    if (r.densityOk === true) densOk += 1;
    if (densOk >= 3) break;
  }
  const used = attempts;
  const ok = used.filter((a) => a.densityOk);
  return {
    speed,
    playMs: 30000,
    attemptsRecordedFullSeries: runs.length,
    attemptsUntilStop: used.length,
    densityOk: ok.length,
    densityShort: used.filter((a) => !a.densityOk).length,
    paintedFailAmongDensityOk: ok.filter((a) => a.paintedRed).length,
    paintedPassAmongDensityOk: ok.filter((a) => !a.paintedRed).length,
    stoppedReason: ok.length >= 3 ? 'REACHED_3_DENSITY_OK' : 'MAX_ATTEMPTS_OR_SHORT',
    attempts: used,
    allAttempts: runs.map((r, i) => ({
      attemptIndex: i + 1,
      label: r.label,
      densityOk: r.densityOk === true,
      paintedRed: r.paintedRed === true,
      evaluatedCount: r.evaluatedCount,
      maxPrimaryAbsYPx: r.maxPrimaryAbsYPx ?? r.maxTemaAbsYPx,
      staleRatio: r.staleRatio,
      densityClass: r.densityClass?.class || r.densityClass || null,
    })),
  };
}

if (fs.existsSync(outPath)) {
  const ev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const ctrlRuns = Array.isArray(ev.controlRuns) ? ev.controlRuns : [];
  const runs60 = Array.isArray(ev.runs60x) ? ev.runs60x : [];
  const runs100 = Array.isArray(ev.runs100x) ? ev.runs100x : [];

  const bridge = {
    status: 'PENDING-GPT-FRESH-BASELINE-ACCEPTANCE',
    historicalContinuity: 'HISTORICAL-CONTINUITY-UNRECOVERED',
    frozenProbeSha256: FROZEN_PROBE_SHA,
    playMs: 30000,
    protocolNote:
      'DENSITY_DIAG with M21_VY_PLAY_MS_FIXED=30000; 5 attempts/speed retained; '
      + 'boundedEquivalent stops count at 3 densOk for comparison to 20s BOUNDED_MATRIX. '
      + 'Frozen probe bytes untouched (BOUNDED_MATRIX hardcodes 20000).',
    fullSeriesCounts: {
      x15: {
        attempts: ctrlRuns.length,
        densityOk: ctrlRuns.filter((r) => r.densityOk).length,
        paintedFailAmongDensityOk: ctrlRuns.filter((r) => r.densityOk && r.paintedRed).length,
        paintedPassAmongDensityOk: ctrlRuns.filter((r) => r.densityOk && !r.paintedRed).length,
      },
      x60: {
        attempts: runs60.length,
        densityOk: runs60.filter((r) => r.densityOk).length,
        paintedFailAmongDensityOk: runs60.filter((r) => r.densityOk && r.paintedRed).length,
        paintedPassAmongDensityOk: runs60.filter((r) => r.densityOk && !r.paintedRed).length,
      },
      x100: {
        attempts: runs100.length,
        densityOk: runs100.filter((r) => r.densityOk).length,
        paintedFailAmongDensityOk: runs100.filter((r) => r.densityOk && r.paintedRed).length,
        paintedPassAmongDensityOk: runs100.filter((r) => r.densityOk && !r.paintedRed).length,
      },
    },
    countsBoundedEquivalent: {
      x15: boundedEquivalent(ctrlRuns, 15),
      x60: boundedEquivalent(runs60, 60),
      x100: boundedEquivalent(runs100, 100),
    },
  };

  ev.bridge30s = bridge;
  ev.status = 'PENDING-GPT-FRESH-BASELINE-ACCEPTANCE';
  ev.frozenBaselineContract = {
    contractId: CONTRACT.contractId,
    probeSha256: FROZEN_PROBE_SHA,
    playMsBridge: 30000,
    frozenBytesAltered: false,
  };
  fs.writeFileSync(outPath, JSON.stringify(ev, null, 2));
  const be = bridge.countsBoundedEquivalent;
  process.stderr.write(
    `[30s-bridge] densOk full 15/60/100=${bridge.fullSeriesCounts.x15.densityOk}/`
    + `${bridge.fullSeriesCounts.x60.densityOk}/${bridge.fullSeriesCounts.x100.densityOk} `
    + `boundedEq attempts ${be.x15.attemptsUntilStop}/${be.x60.attemptsUntilStop}/${be.x100.attemptsUntilStop}\n`,
  );
}

// verify pin unchanged after run
assertPin('live-probe-post', probe, FROZEN_PROBE_SHA);
assertPin('frozen-blob-post', frozenProbe, FROZEN_PROBE_SHA);

process.exitCode = res.status == null ? 2 : res.status;
