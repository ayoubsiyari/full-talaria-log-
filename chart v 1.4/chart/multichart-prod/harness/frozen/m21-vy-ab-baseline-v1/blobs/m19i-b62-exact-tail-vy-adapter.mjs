/**
 * M19-I / b62 — A/B adapter over W5's painted VALUE/Y oracle (W1-owned wrapper).
 *
 * STATUS: PRELIMINARY-PENDING-GPT56-RED-ACCEPTANCE — no GREEN state exists.
 *
 * Ownership discipline:
 *   - W5 OWNS the oracle and every threshold. This adapter never sets
 *     M21_VY_MAX_Y_PX / M21_VY_MIN_EVALUATED / any gate env — the probe's own
 *     defaults (and only the PO's explicit env) decide gates.
 *   - The W5 probe file is spawned UNCHANGED as a child process; its integrity
 *     is hash-verified against both trees before any run.
 *   - Gate numbers surfaced by this adapter are READ from W5's published b61
 *     evidence JSON, purely for reporting.
 *
 * Modes:
 *   node m19i-b62-exact-tail-vy-adapter.mjs plan
 *   node m19i-b62-exact-tail-vy-adapter.mjs red
 *   node m19i-b62-exact-tail-vy-adapter.mjs ab-on | ab-off
 *
 * W5 pre-document hook (harness-ready):
 *   M21_VY_PREDOC_FLAGS='{"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}'
 *   → injected via evaluateOnNewDocument before app code.
 *
 *   ab-on  → M21_VY_PREDOC_FLAGS={} or unset (fix ON)
 *   ab-off → M21_VY_PREDOC_FLAGS={"__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1":true}
 *   red    → omit M21_VY_PREDOC_FLAGS
 *
 * b62 painted GREEN remains blocked until Manager product land + exact deployed digest.
 * ab-on/ab-off may LAUNCH the W5 probe for harness smoke on current b61 (expect RED
 * signal until b62 lands); they do not claim GREEN.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repo root not found from ' + start);
}
const ROOT = findRepoRoot(__dirname);

const PROBE = {
  homepage: path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'harness',
    'm21-painted-endpoint-value-y-red-probe.mjs'),
  v14: path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'harness',
    'm21-painted-endpoint-value-y-red-probe.mjs'),
};
const PREDOC_MOD = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'harness',
  'm21-vy-predoc-flags.mjs');
const FROZEN_CONTRACT = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'harness',
  'frozen', 'm21-vy-ab-baseline-v1', 'CONTRACT.json');
const W5_EVIDENCE = path.join(ROOT, 'docs', 'plan3', 'evidence',
  'W5-M21-PAINTED-ENDPOINT-VALUE-Y-b61-RED.PRELIMINARY.json');

const W5_GATE_ENVS = [
  'M21_VY_MAX_Y_PX', 'M21_VY_MAX_VALUE_ABS', 'M21_VY_MAX_VALUE_REL',
  'M21_VY_MIN_EVALUATED', 'M21_VY_PLAY_MS_60X', 'M21_VY_PLAY_MS_100X',
];

const KILL = '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1';

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function loadFrozenContract() {
  if (!fs.existsSync(FROZEN_CONTRACT)) {
    return { ok: false, error: 'frozen CONTRACT.json missing', contract: null };
  }
  try {
    return { ok: true, error: null, contract: JSON.parse(fs.readFileSync(FROZEN_CONTRACT, 'utf8')) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), contract: null };
  }
}

function verifyProbeProvenance() {
  const h = sha256(PROBE.homepage);
  const v = sha256(PROBE.v14);
  const predocH = fs.existsSync(PREDOC_MOD) ? sha256(PREDOC_MOD) : null;
  const src = fs.readFileSync(PROBE.homepage, 'utf8');
  const predocSrc = fs.existsSync(PREDOC_MOD) ? fs.readFileSync(PREDOC_MOD, 'utf8') : '';
  const frozen = loadFrozenContract();
  const pin = frozen.contract?.pins || null;
  const probeMatchesFrozen = Boolean(pin && h === pin.probeSha256 && v === pin.probeSha256);
  const predocMatchesFrozen = Boolean(pin && predocH && predocH === pin.predocSha256);
  const gateEnvPresent = W5_GATE_ENVS.filter((k) => process.env[k] != null);
  return {
    homepageSha256: h,
    v14Sha256: v,
    predocSha256: predocH,
    dualTreeIdentical: h === v,
    frozenContractId: frozen.contract?.contractId || null,
    frozenProbeSha256: pin?.probeSha256 || null,
    frozenPredocSha256: pin?.predocSha256 || null,
    probeMatchesFrozenPin: probeMatchesFrozen,
    predocMatchesFrozenPin: predocMatchesFrozen,
    thresholdHashPinned: frozen.contract?.thresholdEvidenceSha256 || null,
    continuityWithAcceptedB61Red: frozen.contract?.eligibility?.continuityWithAcceptedB61Red
      || 'UNKNOWN',
    w5OwnershipBanner: src.includes('PRELIMINARY-PENDING-GPT56') || src.includes('PRELIMINARY-HARNESS-READY'),
    thresholdOwner: src.includes('M21_VY_MAX_Y_PX') ? 'W5 probe env/defaults' : 'UNKNOWN',
    predocHookReady: src.includes('M21_VY_PREDOC_FLAGS')
      && src.includes('composePredocWithProbe')
      && predocSrc.includes('parsePredocFlagsEnv'),
    adapterSetsGateEnvs: gateEnvPresent.length > 0
      ? 'PO-provided passthrough only'
      : 'none (probe defaults own the gates)',
    abModeChangesOnlyAllowlistedSwitch: true,
    frozenLoadError: frozen.error,
  };
}

function readW5Gates() {
  if (!fs.existsSync(W5_EVIDENCE)) {
    return { source: null, thresholds: null, b61Verdict: null, note: 'W5 evidence missing' };
  }
  const ev = JSON.parse(fs.readFileSync(W5_EVIDENCE, 'utf8'));
  return {
    source: path.relative(ROOT, W5_EVIDENCE).replace(/\\/g, '/'),
    thresholds: ev.thresholds || null,
    b61Verdict: ev.verdict,
  };
}

function cellPlan(provenance) {
  const pinOk = provenance.probeMatchesFrozenPin && provenance.predocMatchesFrozenPin
    && provenance.dualTreeIdentical;
  return {
    stamp: 'PRELIMINARY-PENDING-GPT56-BASELINE-ACCEPTANCE',
    oneToggle: KILL,
    stagedSpeeds: [15, 60, 100],
    frozenContractId: provenance.frozenContractId,
    requiredProbeSha256: provenance.frozenProbeSha256,
    requiredPredocSha256: provenance.frozenPredocSha256,
    thresholdEvidenceSha256: provenance.thresholdHashPinned,
    pinOk,
    note: 'red/ab-on/ab-off must preserve identical probe+predoc+threshold pins; only allowlisted switch differs',
    w5PredocHook: provenance.predocHookReady
      ? 'READY — M21_VY_PREDOC_FLAGS via evaluateOnNewDocument'
      : 'MISSING',
    invocation: {
      red: 'node m19i-b62-exact-tail-vy-adapter.mjs red',
      abOn: 'node m19i-b62-exact-tail-vy-adapter.mjs ab-on',
      abOff: 'node m19i-b62-exact-tail-vy-adapter.mjs ab-off',
      directAbOff: `M21_VY_PREDOC_FLAGS={"${KILL}":true} node homepage/public/chart/multichart-prod/harness/m21-painted-endpoint-value-y-red-probe.mjs`,
      directAbOn: 'M21_VY_PREDOC_FLAGS={} node homepage/public/chart/multichart-prod/harness/m21-painted-endpoint-value-y-red-probe.mjs',
      frozenBaseline: 'node frozen/m21-vy-ab-baseline-v1/run-baseline.mjs',
    },
    cells: [
      {
        id: 'RED-b61',
        product: 'unchanged b61',
        toggle: 'n/a (omit M21_VY_PREDOC_FLAGS)',
        expected: 'VALUE/Y RED signal under frozen probe pin (not accepted RED)',
        runnableNow: pinOk,
        blockedOn: pinOk ? [] : ['FROZEN-PROBE-PIN-MISMATCH'],
      },
      {
        id: 'AB-ON-b62',
        product: 'b62 landed (post Manager gate + exact digest)',
        toggle: 'unset / {} (fix ON)',
        expected: '15/60/100: painted TEMA tip inside W5 gates after b62 land — NOT claimable on b61',
        runnableNow: provenance.predocHookReady && pinOk,
        launchOnB61: 'harness smoke only (expect RED until b62 digest)',
        blockedGreenOn: [
          'MANAGER-B62-LAND',
          'EXACT-DEPLOYED-DIGEST',
          'GPT56-BASELINE-ACCEPTANCE',
          'BLOCKED-PROVENANCE-IF-PIN-DRIFTS',
        ],
      },
      {
        id: 'AB-OFF-b62',
        product: 'b62 landed',
        toggle: `M21_VY_PREDOC_FLAGS={"${KILL}":true}`,
        expected: 'reproduces b61 VALUE/Y RED signal (kill discriminator) after b62 land',
        runnableNow: provenance.predocHookReady && pinOk,
        launchOnB61: 'harness smoke — kill switch polarity on current build',
        blockedGreenOn: [
          'MANAGER-B62-LAND',
          'EXACT-DEPLOYED-DIGEST',
          'GPT56-BASELINE-ACCEPTANCE',
          'BLOCKED-PROVENANCE-IF-PIN-DRIFTS',
        ],
      },
    ],
  };
}

function spawnProbe(extraEnv = {}) {
  // Never override W5 gate envs here.
  const env = { ...process.env, ...extraEnv };
  for (const k of W5_GATE_ENVS) {
    // If adapter accidentally inherited overrides from a prior cell, leave PO's env;
    // do not set gates ourselves.
    void k;
  }
  const res = spawnSync(process.execPath, [PROBE.homepage], {
    cwd: path.dirname(PROBE.homepage),
    stdio: 'inherit',
    env,
  });
  return res.status == null ? 2 : res.status;
}

function refuseUnlessFrozenPin(provenance, mode) {
  if (!provenance.dualTreeIdentical) {
    process.stderr.write('B62-ADAPTER-FAIL: W5 probe mirrors diverged — refuse to run.\n');
    return false;
  }
  if (!provenance.frozenContractId || !provenance.frozenProbeSha256) {
    process.stderr.write('B62-ADAPTER-FAIL: frozen A/B baseline CONTRACT missing — refuse to run.\n');
    return false;
  }
  if (!provenance.probeMatchesFrozenPin || !provenance.predocMatchesFrozenPin) {
    process.stderr.write(
      `B62-ADAPTER-FAIL: probe/predoc hash ≠ frozen pin (${provenance.frozenContractId}) — refuse ${mode}.\n`
      + `  liveProbe=${provenance.homepageSha256}\n`
      + `  pinProbe=${provenance.frozenProbeSha256}\n`,
    );
    return false;
  }
  if (W5_GATE_ENVS.some((k) => process.env[k] != null)) {
    process.stderr.write(
      'B62-ADAPTER-FAIL: gate env overrides present — A/B cells must use identical frozen thresholds.\n',
    );
    return false;
  }
  return true;
}

function main() {
  const mode = String(process.argv[2] || 'plan').toLowerCase();
  const provenance = verifyProbeProvenance();

  if (mode === 'plan') {
    const plan = cellPlan(provenance);
    process.stdout.write(`${JSON.stringify({
      ticket: 'M19I-B62-EXACT-TAIL-VY-ADAPTER',
      mode,
      provenance,
      w5Gates: readW5Gates(),
      plan,
      abEnvDeltaOnly: {
        red: 'M21_VY_PREDOC_FLAGS unset',
        'ab-on': 'M21_VY_PREDOC_FLAGS={}',
        'ab-off': `M21_VY_PREDOC_FLAGS={"${KILL}":true}`,
        probeSha256IdenticalAcrossModes: true,
        thresholdHashIdenticalAcrossModes: true,
      },
      signature: 'W1 — PRELIMINARY-PENDING-GPT56-BASELINE-ACCEPTANCE',
    }, null, 2)}\n`);
    return;
  }

  if (!refuseUnlessFrozenPin(provenance, mode)) {
    process.exitCode = 2;
    return;
  }

  if (mode === 'red') {
    const env = { ...process.env };
    delete env.M21_VY_PREDOC_FLAGS; // red cell: no kill-switch injection
    process.exitCode = spawnProbe(env);
    return;
  }

  if (mode === 'ab-on' || mode === 'ab-off') {
    if (!provenance.predocHookReady) {
      process.stderr.write('B62-ADAPTER-BLOCKED: W5 pre-document flag hook missing.\n');
      process.exitCode = 3;
      return;
    }
    process.stderr.write(
      `[b62-adapter] ${mode}: frozen pin ${provenance.frozenProbeSha256.slice(0, 16)}… `
      + 'thresholds unchanged; only allowlisted predoc switch differs '
      + '(PRELIMINARY — no GREEN; continuity BLOCKED-PROVENANCE until GPT56 baseline acceptance).\n',
    );
    const flags = mode === 'ab-off'
      ? JSON.stringify({ [KILL]: true })
      : JSON.stringify({});
    process.exitCode = spawnProbe({ M21_VY_PREDOC_FLAGS: flags });
    return;
  }

  process.stderr.write(`B62-ADAPTER-FAIL: unknown mode ${mode}\n`);
  process.exitCode = 2;
}

main();
