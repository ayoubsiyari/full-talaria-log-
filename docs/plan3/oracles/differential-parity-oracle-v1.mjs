/**
 * DIFFERENTIAL-PARITY-ORACLE-V1
 * Signature: TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1
 *
 * Coverage (W29 / A7 drift slice only): running-sum SMA drift ladder vs naive
 * fallback reference; WMA full-recompute control; short parity sanity;
 * NC-PARITY-EPSILON-INVERTED. PARITY-ROLLING-SUBTRACTION full family matrix
 * and painted tier are follow-up packets — not in this oracle.
 *
 * EXPECTED-RED: DRIFT-SMA-* cells may RED on live product because
 * rollingSmaFast uses uncompensated running sum (sum -= leaving; sum += entering).
 * Do not widen epsilon to GREEN; fail closed on length-dependent divergence growth.
 *
 * Measured maxRel ladder (live IndicatorPerf, DRIFT_SEED, DRIFT_SCALE=1e6, p=20):
 *   100K → 1.5896223785226764e-14
 *   500K → 4.661277616719828e-14  (~2.93× vs 100K)
 *   1M   → 5.424285154704246e-14  (~3.41× vs 100K)
 * Absolute parity: all lengths ≤ EPS-ROLLING-NONRECURSIVE (1e-9).
 * Length-dependent growth: RED (exceeds LENGTH_GROWTH_FACTOR cap from raw 100K baseline).
 *
 * Fallback reference (naive O(n·p)) always executes in CI alongside optimized path
 * loaded read-only from chart v 1.4/chart/modules/indicator-performance.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildDriftLadderSeries } from '../fixtures/a7-prng-series.mjs';
import { naiveRollingSma, naiveRollingWma } from './naive-rolling-reference.mjs';

export const DIFFERENTIAL_PARITY_ORACLE_SIGNATURE = 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1';

/** Relative tolerance for non-recursive rolling vs naive on short series — not fitted to drift. */
// Justification: double-precision unit roundoff ~2e-16; naive full-window recompute per bar
// should match another full recompute (WMA) or a fresh sum (reference) within ~1e-9 relative.
export const EPS_ROLLING_NONRECURSIVE = 1e-9;

/** Multiplicative cap on max relative divergence across the length ladder (drift detector). */
export const LENGTH_GROWTH_FACTOR = 1e-3;

/** Baseline noise floor for growth compare only (~few ulps); not parity EPS. */
export const GROWTH_BASE_NOISE_FLOOR = 1e-15;

export const DRIFT_LADDER_LENGTHS = [100_000, 500_000, 1_000_000];
export const DRIFT_PERIOD = 20;
export const DRIFT_SEED = 0xa7_2026_07;
/** Large-magnitude stress (JPY-scale) applied to all drift-ladder runs. */
export const DRIFT_SCALE = 1e6;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const INDICATOR_PERF_REL = path.join(
  REPO_ROOT,
  'chart v 1.4/chart/modules/indicator-performance.js',
);

/**
 * @returns {{ rollingSmaFast: Function, rollingWmaFast: Function }}
 */
export function loadIndicatorPerf(root = REPO_ROOT) {
  const perfPath = path.join(root, 'chart v 1.4/chart/modules/indicator-performance.js');
  if (!fs.existsSync(perfPath)) {
    throw new Error(`DIFFERENTIAL-PARITY-ORACLE-V1: missing IndicatorPerf at ${perfPath}`);
  }
  const code = fs.readFileSync(perfPath, 'utf8');
  const window = {};
  const context = vm.createContext({
    window,
    self: window,
    global: window,
  });
  vm.runInContext(code, context);
  const perf = window.IndicatorPerf;
  if (!perf || typeof perf.rollingSmaFast !== 'function' || typeof perf.rollingWmaFast !== 'function') {
    throw new Error(
      'DIFFERENTIAL-PARITY-ORACLE-V1: IndicatorPerf missing rollingSmaFast / rollingWmaFast',
    );
  }
  return perf;
}

/**
 * @param {ArrayLike<number>|null} ref
 * @param {ArrayLike<number>|null} opt
 * @param {number} period
 */
export function maxRelativeDivergence(ref, opt, period) {
  const n = ref.length;
  let maxRel = 0;
  for (let i = period - 1; i < n; i++) {
    const r = ref[i];
    const o = opt[i];
    if (r == null || o == null || Number.isNaN(r) || Number.isNaN(o)) continue;
    const denom = Math.max(Math.abs(r), 1e-12);
    const rel = Math.abs(o - r) / denom;
    if (rel > maxRel) maxRel = rel;
  }
  return maxRel;
}

/**
 * Every ladder rung must stay within absolute parity EPS (independent of growth check).
 * @param {Record<number, number>} maxByLength
 * @param {number} [eps]
 */
export function assertWithinAbsoluteEpsilon(maxByLength, eps = EPS_ROLLING_NONRECURSIVE) {
  const violations = [];
  for (const [lenKey, maxRel] of Object.entries(maxByLength)) {
    const len = Number(lenKey);
    if (maxRel > eps) {
      violations.push({ len, maxRel, eps });
    }
  }
  return { ok: violations.length === 0, violations, eps };
}

/**
 * Divergence must not grow with series length (raw shortest maxRel baseline + tiny noise floor).
 * @param {Record<number, number>} maxByLength
 */
export function assertNoLengthDependentGrowth(maxByLength, lengths = DRIFT_LADDER_LENGTHS) {
  const sorted = [...lengths].sort((a, b) => a - b);
  const shortest = sorted[0];
  const rawBase = maxByLength[shortest];
  const base = Math.max(rawBase, GROWTH_BASE_NOISE_FLOOR);
  const violations = [];
  for (const len of sorted.slice(1)) {
    const m = maxByLength[len];
    const cap = base * (1 + LENGTH_GROWTH_FACTOR);
    if (m > cap) {
      violations.push({ len, maxRel: m, cap, baseLen: shortest, rawBase, base });
    }
  }
  return { ok: violations.length === 0, violations, base, rawBase, shortest };
}

/**
 * @param {object} perf
 * @param {number} length
 */
export function measureSmaDriftAtLength(perf, length) {
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: DRIFT_SCALE });
  const naive = naiveRollingSma(series, DRIFT_PERIOD);
  const optimized = perf.rollingSmaFast(series, DRIFT_PERIOD);
  const maxRel = maxRelativeDivergence(naive, optimized, DRIFT_PERIOD);
  return { length, maxRel, period: DRIFT_PERIOD };
}

/**
 * @param {object} perf
 * @param {number} length
 */
export function measureWmaControlAtLength(perf, length) {
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: DRIFT_SCALE });
  const naive = naiveRollingWma(series, DRIFT_PERIOD);
  const optimized = perf.rollingWmaFast(series, DRIFT_PERIOD);
  const maxRel = maxRelativeDivergence(naive, optimized, DRIFT_PERIOD);
  return { length, maxRel, period: DRIFT_PERIOD };
}

/** @param {object} perf @param {{ invertEpsilon?: boolean }} [opts] */
export function runSanityRollingShort(perf, opts = {}) {
  const length = 512;
  const period = DRIFT_PERIOD;
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: 1 });
  const smaNaive = naiveRollingSma(series, period);
  const smaOpt = perf.rollingSmaFast(series, period);
  const wmaNaive = naiveRollingWma(series, period);
  const wmaOpt = perf.rollingWmaFast(series, period);
  const smaMax = maxRelativeDivergence(smaNaive, smaOpt, period);
  const wmaMax = maxRelativeDivergence(wmaNaive, wmaOpt, period);
  const within =
    smaMax <= EPS_ROLLING_NONRECURSIVE && wmaMax <= EPS_ROLLING_NONRECURSIVE;
  if (opts.invertEpsilon) {
    return {
      cell: 'NC-PARITY-EPSILON-INVERTED',
      pass: within,
      status: within ? 'RED' : 'GREEN',
      smaMax,
      wmaMax,
      epsilon: EPS_ROLLING_NONRECURSIVE,
      note: 'Inverted epsilon: RED when short series would pass normal parity (proves gate).',
    };
  }
  const pass = within;
  return {
    cell: 'SANITY-ROLLING-SHORT',
    pass,
    status: pass ? 'GREEN' : 'RED',
    smaMax,
    wmaMax,
    epsilon: EPS_ROLLING_NONRECURSIVE,
    note: 'Short fixtures can pass while multi-year ranges fail; drift ladder is authoritative.',
  };
}

/** @param {object} perf */
export function runDriftSmaCell(perf, length) {
  const { maxRel } = measureSmaDriftAtLength(perf, length);
  return {
    cell: `DRIFT-SMA-${length >= 1_000_000 ? '1M' : length >= 500_000 ? '500K' : '100K'}`,
    length,
    maxRel,
    status: 'PENDING_LADDER',
  };
}

/** @param {object} perf @param {number[]} [lengths] */
export function runDriftSmaLadder(perf, lengths = DRIFT_LADDER_LENGTHS) {
  const maxByLength = {};
  const cells = [];
  for (const length of lengths) {
    const partial = runDriftSmaCell(perf, length);
    maxByLength[length] = partial.maxRel;
    cells.push(partial);
  }
  const growth = assertNoLengthDependentGrowth(maxByLength, lengths);
  const absolute = assertWithinAbsoluteEpsilon(maxByLength);
  for (const c of cells) {
    const withinEps = c.maxRel <= EPS_ROLLING_NONRECURSIVE;
    c.withinAbsoluteEpsilon = withinEps;
    c.status = growth.ok && absolute.ok && withinEps ? 'GREEN' : 'RED';
    c.growth = growth;
    c.absolute = absolute;
  }
  return { cells, growth, absolute, maxByLength };
}

/** @param {object} perf @param {number[]} [lengths] */
export function runDriftWmaControl(perf, lengths = [100_000, 500_000]) {
  const maxByLength = {};
  const cells = [];
  for (const length of lengths) {
    const { maxRel } = measureWmaControlAtLength(perf, length);
    maxByLength[length] = maxRel;
    cells.push({
      cell: length === lengths[0] ? 'DRIFT-WMA-CONTROL' : `DRIFT-WMA-CONTROL-${length}`,
      length,
      maxRel,
    });
  }
  const growth = assertNoLengthDependentGrowth(maxByLength, lengths);
  const absolute = assertWithinAbsoluteEpsilon(maxByLength);
  const status =
    growth.ok && absolute.ok && cells.every((c) => c.maxRel <= EPS_ROLLING_NONRECURSIVE)
      ? 'GREEN'
      : 'RED';
  for (const c of cells) {
    c.withinAbsoluteEpsilon = c.maxRel <= EPS_ROLLING_NONRECURSIVE;
    c.status = status;
  }
  return { cells, growth, absolute, maxByLength, status };
}

/** @param {object} [opts] @param {string} [opts.root] */
export function runAllCells(opts = {}) {
  const perf = loadIndicatorPerf(opts.root ?? REPO_ROOT);
  const sanity = runSanityRollingShort(perf);
  const ncInverted = runSanityRollingShort(perf, { invertEpsilon: true });
  const smaLadder = runDriftSmaLadder(perf);
  const wmaControl = runDriftWmaControl(perf);
  return {
    signature: DIFFERENTIAL_PARITY_ORACLE_SIGNATURE,
    indicatorPerfPath: INDICATOR_PERF_REL,
    epsRollingNonRecursive: EPS_ROLLING_NONRECURSIVE,
    sanity,
    ncInverted,
    smaLadder,
    wmaControl,
  };
}

/** CLI report when invoked directly */
export function formatReport(report) {
  const lines = [
    report.signature,
    `EPS-ROLLING-NONRECURSIVE=${report.epsRollingNonRecursive}`,
    '',
    `${report.sanity.cell}: ${report.sanity.status} (smaMax=${report.sanity.smaMax}, wmaMax=${report.sanity.wmaMax})`,
    `${report.ncInverted.cell}: ${report.ncInverted.status}`,
  ];
  for (const c of report.smaLadder.cells) {
    lines.push(`${c.cell}: ${c.status} maxRel=${c.maxRel}`);
  }
  for (const c of report.wmaControl.cells) {
    lines.push(`${c.cell}: ${c.status} maxRel=${c.maxRel}`);
  }
  if (!report.smaLadder.growth.ok) {
    lines.push(`SMA ladder growth violations: ${JSON.stringify(report.smaLadder.growth.violations)}`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const report = runAllCells();
  console.log(formatReport(report));
}
