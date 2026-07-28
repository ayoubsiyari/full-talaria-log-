/**
 * DIFFERENTIAL-PARITY-ORACLE-V1
 * Signature: TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1
 *
 * Coverage (M5 canary slice): optimized-vs-reference parity for SMA, WMA, EMA, DEMA at
 * period DRIFT_PERIOD on short + medium fixtures at two magnitude scales; the
 * DRIFT-SMA-100K/500K/1M length-growth ladder with its reference-self-error control;
 * DRIFT-WMA-CONTROL; and the NC-PARITY-* negative controls.
 * Bollinger / Donchian / stochastic and the full PARITY-ROLLING-SUBTRACTION matrix are
 * post-conclusion.
 *
 * CPU performance claims are NOT covered here — acceptance for any CPU claim is
 * docs/plan3/PO-PROTOCOL-CPU-AB-20260728.md. This oracle is value correctness (parity + drift).
 *
 * ── Fail-closed posture ─────────────────────────────────────────────────────────────────
 * A parity cell has exactly three outcomes and GREEN is the hardest to reach:
 *   GREEN    the two paths were compared over the full expected span and every compared
 *            pair agreed within EPS-ROLLING-NONRECURSIVE;
 *   RED      they were compared and disagreed;
 *   UNPROVEN nothing trustworthy was compared — zero compared values, a length mismatch, a
 *            null on one side only, a non-finite compared value, fewer compared values than
 *            the span requires, or a comparison that discriminated nothing because every
 *            compared pair was bit-identical on a path where the reference is supposed to be
 *            independent. UNPROVEN never counts as parity evidence.
 * An all-null optimized output therefore cannot produce GREEN: it fails closed as UNPROVEN.
 *
 * ── What each family's GREEN is worth ───────────────────────────────────────────────────
 * The independence of each reference is declared per family in PARITY_FAMILY_INDEPENDENCE
 * and reproduced on every cell this oracle emits. In particular `rollingWmaFast` and
 * `naiveRollingWma` are the same algorithm written twice, so PARITY-WMA-* is a code-clone
 * equivalence check and its divergence is identically zero by construction — it is not
 * evidence about WMA numerics, and DRIFT-WMA-CONTROL inherits that limit. See the
 * independence ledger at the top of naive-rolling-reference.mjs.
 *
 * ── Fixture scales ──────────────────────────────────────────────────────────────────────
 * The UNIT-scale fixture is exactly representable: its prices are integer multiples of 2⁻³¹
 * below 2⁹, so every 20-bar window sum is computed without rounding and the running-sum and
 * resum SMA paths agree bit-for-bit. A GREEN there is structural agreement only, which is
 * why every family also runs at the JPY scale (1e6), where window sums do round and the
 * comparison has bit patterns to discriminate. Cells report `evidenceClass` ('numeric' when
 * the compare saw differing bit patterns, 'bit-exact' when it did not) and fail closed to
 * UNPROVEN when numeric evidence is required for that family/scale and was not obtained.
 *
 * ── EXPECTED-RED ────────────────────────────────────────────────────────────────────────
 * DRIFT-SMA-* RED on live product: rollingSmaFast uses an uncompensated running sum
 * (sum -= leaving; sum += entering). Do not widen epsilon to GREEN.
 *
 * Measured maxRel ladder (live IndicatorPerf, DRIFT_SEED, DRIFT_SCALE=1e6, p=20):
 *   100K → 1.5896223785226764e-14
 *   500K → 4.661277616719828e-14  (~2.93× vs 100K)
 *   1M   → 5.424285154704246e-14  (~3.41× vs 100K)
 * Absolute parity: all lengths ≤ EPS-ROLLING-NONRECURSIVE (1e-9).
 * Length-dependent growth: RED (exceeds LENGTH_GROWTH_FACTOR cap from raw 100K baseline).
 *
 * That growth is attributed to the product, not to the harness, by the reference-self-error
 * control measured at the same rungs (naive resum vs compensated resum):
 *   100K → 6.82e-16, 500K → 7.77e-16, 1M → 7.77e-16 — flat within REF_SELF_ERROR_GROWTH_CAP,
 * and 23×–70× below the measured divergence. A stateless reference cannot drift with length;
 * the running sum can, and does.
 *
 * Product paths are loaded read-only: SMA/WMA from
 * chart v 1.4/chart/modules/indicator-performance.js, EMA/DEMA from chart-indicators-full.js
 * (IndicatorPerf has no rollingEmaFast / rollingDemaFast).
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildDriftLadderSeries } from '../fixtures/a7-prng-series.mjs';
import {
  loadChartIndicatorsEmaDema,
  seriesToCloseBars,
} from '../fixtures/a7-chart-indicators-ema-dema-loader.mjs';
import {
  NC_INJECTED_RELATIVE_ERROR,
  injectAllNull,
  injectNonFinite,
  injectRelativeError,
  injectTruncated,
} from '../fixtures/a7-parity-mutations.mjs';
import {
  compensatedRollingSma,
  demaClosedFormReference,
  emaClosedFormReference,
  naiveRollingSma,
  naiveRollingWma,
} from './naive-rolling-reference.mjs';

export const DIFFERENTIAL_PARITY_ORACLE_SIGNATURE = 'TALARIA_DIFFERENTIAL_PARITY_ORACLE_V1';

/** Relative tolerance for non-recursive rolling vs reference on short series — not fitted to drift. */
// Justification: double-precision unit roundoff ~2e-16; a full-window recompute should match
// another full recompute or a closed-form expansion within ~1e-9 relative.
export const EPS_ROLLING_NONRECURSIVE = 1e-9;

/**
 * Denominator floor for the relative-divergence ratio, so a reference value at or near zero
 * cannot divide by zero. It converts the comparison to absolute below |ref| = 1e-12: with
 * EPS = 1e-9 that masks only absolute differences under 1e-21, which is far below the
 * representable resolution of any series this oracle runs.
 */
export const DIVERGENCE_DENOM_FLOOR = 1e-12;

/** Multiplicative cap on max relative divergence across the length ladder (drift detector). */
export const LENGTH_GROWTH_FACTOR = 1e-3;

/** Baseline noise floor for growth compare only (~few ulps); not parity EPS. */
export const GROWTH_BASE_NOISE_FLOOR = 1e-15;

/**
 * The reference's own error is bounded by p·ulp per window regardless of series length, so any
 * growth across the ladder is the max order statistic over more samples of a bounded, stationary
 * distribution. A 10× sample increase cannot double such a max; 2× is generous headroom and
 * still excludes the ~3.4× the product path shows.
 */
export const REF_SELF_ERROR_GROWTH_CAP = 2;

/**
 * The measured divergence must exceed the reference's own error by this factor at every rung,
 * otherwise the ladder is reporting harness noise and the drift claim is not attributable.
 */
export const REF_SELF_ERROR_DOMINANCE_MIN = 10;

export const DRIFT_LADDER_LENGTHS = [100_000, 500_000, 1_000_000];
export const DRIFT_PERIOD = 20;
export const DRIFT_SEED = 0xa7_2026_07;
/** Large-magnitude stress (JPY-scale) applied to all drift-ladder runs. */
export const DRIFT_SCALE = 1e6;

/** M5 canary parity fixture lengths (deterministic PRNG series). */
export const PARITY_SHORT_LENGTH = 512;
export const PARITY_MEDIUM_LENGTH = 8192;

export const M5_CANARY_FAMILIES = ['SMA', 'WMA', 'EMA', 'DEMA'];

/**
 * Magnitude scales every canary family runs at. `arithmetic` records whether the fixture's
 * window sums round — see the header note on exact representability.
 */
export const PARITY_SCALES = [
  { id: 'UNIT', scale: 1, arithmetic: 'exactly-representable', suffix: '' },
  { id: 'JPY', scale: DRIFT_SCALE, arithmetic: 'rounding-exercised', suffix: '-JPY' },
];

export const PARITY_TIERS = [
  { id: 'SHORT', length: PARITY_SHORT_LENGTH },
  { id: 'MEDIUM', length: PARITY_MEDIUM_LENGTH },
];

/**
 * Per-family declaration of what the reference shares with the product, mirrored onto every
 * cell so a GREEN is never read as stronger evidence than its reference supports.
 * `numericEvidenceRequired`: 'always' | 'rounding-exercised' | 'never' — when the compare must
 * see differing bit patterns for the cell to count as parity evidence rather than a tautology.
 */
export const PARITY_FAMILY_INDEPENDENCE = {
  SMA: {
    class: 'independent-algorithm',
    reference: 'naiveRollingSma — O(n·p) full-window resum, stateless',
    product: 'IndicatorPerf.rollingSmaFast — O(n) incremental running sum',
    numericEvidenceRequired: 'rounding-exercised',
    note: 'Different arithmetic and different error accumulation; the ladder measures this gap.',
  },
  WMA: {
    class: 'code-clone',
    reference: 'naiveRollingWma — O(n·p) weighted resum',
    product: 'IndicatorPerf.rollingWmaFast — structurally identical weighted resum',
    numericEvidenceRequired: 'never',
    note: 'Same algorithm written twice: divergence is identically zero by construction. Harness control only, not evidence about WMA numerics.',
  },
  EMA: {
    class: 'independent-numerics',
    reference: 'emaClosedFormReference — closed-form geometric expansion, compensated',
    product: 'chart-indicators calculateEMA — in-place recurrence',
    numericEvidenceRequired: 'always',
    note: 'Definition (SMA seed, α, non-finite-bar policy) is shared spec; evaluation is independent.',
  },
  DEMA: {
    class: 'independent-numerics',
    reference: 'demaClosedFormReference — 2·EMA₁ − EMA(EMA₁) over closed-form stages',
    product: 'chart-indicators calculateDEMA — same decomposition over recurrence stages',
    numericEvidenceRequired: 'always',
    note: 'Decomposition and pseudo-series fallback are shared spec; evaluation is independent.',
  },
};

/** Fail-closed reasons this oracle can report. UNPROVEN is never parity evidence. */
export const UNPROVEN_REASONS = Object.freeze({
  REFERENCE_NOT_ARRAY: 'reference-not-array-like',
  OPTIMIZED_NOT_ARRAY: 'optimized-not-array-like',
  INVALID_PERIOD: 'invalid-period',
  LENGTH_MISMATCH: 'length-mismatch',
  SERIES_SHORTER_THAN_PERIOD: 'series-shorter-than-period',
  NULL_ALIGNMENT_MISMATCH: 'null-alignment-mismatch',
  NON_NUMERIC: 'non-numeric-compared-value',
  NON_FINITE: 'non-finite-compared-value',
  NO_COMPARED_VALUES: 'no-compared-values',
  INSUFFICIENT_COMPARED: 'insufficient-compared-count',
  BIT_EXACT_NO_EVIDENCE: 'bit-exact-comparison-no-numeric-evidence',
  PRODUCT_PATH_UNAVAILABLE: 'product-path-unavailable',
});

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

function isArrayLike(v) {
  return v != null && typeof v.length === 'number' && Number.isInteger(v.length) && v.length >= 0;
}

function unproven(reason, detail = {}) {
  return {
    ok: false,
    reason,
    maxRel: null,
    comparedCount: detail.comparedCount ?? 0,
    bitExactCount: detail.bitExactCount ?? 0,
    differingCount: detail.differingCount ?? 0,
    skippedBothNull: detail.skippedBothNull ?? 0,
    ...detail,
  };
}

/**
 * Max relative divergence between a reference and an optimized series, with the compared
 * population reported so a caller can tell "agreed everywhere" from "compared nothing".
 *
 * Fails closed (ok=false, maxRel=null) rather than returning 0 when the comparison cannot be
 * trusted: length mismatch, a null on one side only, a non-finite or non-numeric compared
 * value, zero compared values, or fewer compared values than `minComparedCount`. A maxRel of 0
 * is only ever returned when at least one pair was actually compared.
 *
 * @param {ArrayLike<number|null>|null} ref
 * @param {ArrayLike<number|null>|null} opt
 * @param {number} period comparison starts at index period-1
 * @param {{ minComparedCount?: number }} [opts]
 * @returns {{ ok: boolean, reason: string|null, maxRel: number|null, comparedCount: number,
 *   bitExactCount: number, differingCount: number, skippedBothNull: number,
 *   maxRelIndex: number|null, failureIndex?: number, length?: number, startIndex?: number }}
 */
export function maxRelativeDivergence(ref, opt, period, opts = {}) {
  if (!isArrayLike(ref)) return unproven(UNPROVEN_REASONS.REFERENCE_NOT_ARRAY);
  if (!isArrayLike(opt)) return unproven(UNPROVEN_REASONS.OPTIMIZED_NOT_ARRAY);
  if (!Number.isFinite(period) || period < 1) {
    return unproven(UNPROVEN_REASONS.INVALID_PERIOD, { period });
  }
  if (ref.length !== opt.length) {
    return unproven(UNPROVEN_REASONS.LENGTH_MISMATCH, {
      referenceLength: ref.length,
      optimizedLength: opt.length,
    });
  }

  const n = ref.length;
  const startIndex = Math.floor(period) - 1;
  if (n <= startIndex) {
    return unproven(UNPROVEN_REASONS.SERIES_SHORTER_THAN_PERIOD, { length: n, startIndex });
  }

  let maxRel = 0;
  let maxRelIndex = null;
  let comparedCount = 0;
  let bitExactCount = 0;
  let skippedBothNull = 0;

  for (let i = startIndex; i < n; i++) {
    const r = ref[i];
    const o = opt[i];
    const rNull = r === null || r === undefined;
    const oNull = o === null || o === undefined;
    if (rNull && oNull) {
      skippedBothNull++;
      continue;
    }
    if (rNull !== oNull) {
      return unproven(UNPROVEN_REASONS.NULL_ALIGNMENT_MISMATCH, {
        failureIndex: i,
        nullSide: rNull ? 'reference' : 'optimized',
        comparedCount,
        bitExactCount,
        differingCount: comparedCount - bitExactCount,
        skippedBothNull,
        length: n,
        startIndex,
      });
    }
    if (typeof r !== 'number' || typeof o !== 'number') {
      return unproven(UNPROVEN_REASONS.NON_NUMERIC, {
        failureIndex: i,
        referenceType: typeof r,
        optimizedType: typeof o,
        comparedCount,
        bitExactCount,
        differingCount: comparedCount - bitExactCount,
        skippedBothNull,
        length: n,
        startIndex,
      });
    }
    if (!Number.isFinite(r) || !Number.isFinite(o)) {
      return unproven(UNPROVEN_REASONS.NON_FINITE, {
        failureIndex: i,
        referenceValue: r,
        optimizedValue: o,
        comparedCount,
        bitExactCount,
        differingCount: comparedCount - bitExactCount,
        skippedBothNull,
        length: n,
        startIndex,
      });
    }

    comparedCount++;
    if (r === o) bitExactCount++;
    const denom = Math.max(Math.abs(r), DIVERGENCE_DENOM_FLOOR);
    const rel = Math.abs(o - r) / denom;
    if (rel > maxRel) {
      maxRel = rel;
      maxRelIndex = i;
    }
  }

  const differingCount = comparedCount - bitExactCount;
  const shared = {
    comparedCount,
    bitExactCount,
    differingCount,
    skippedBothNull,
    length: n,
    startIndex,
  };

  if (comparedCount === 0) {
    return unproven(UNPROVEN_REASONS.NO_COMPARED_VALUES, shared);
  }
  const minCompared = opts.minComparedCount;
  if (Number.isFinite(minCompared) && comparedCount < minCompared) {
    return unproven(UNPROVEN_REASONS.INSUFFICIENT_COMPARED, {
      ...shared,
      minComparedCount: minCompared,
    });
  }

  return { ok: true, reason: null, maxRel, maxRelIndex, ...shared };
}

/**
 * Every ladder rung must stay within absolute parity EPS (independent of growth check).
 * A missing or unproven rung is a violation, never a pass.
 * @param {Record<number, number|null>} maxByLength
 * @param {number} [eps]
 */
export function assertWithinAbsoluteEpsilon(maxByLength, eps = EPS_ROLLING_NONRECURSIVE) {
  const violations = [];
  const entries = Object.entries(maxByLength);
  if (entries.length === 0) {
    return { ok: false, violations: [{ reason: 'empty-ladder' }], eps };
  }
  for (const [lenKey, maxRel] of entries) {
    const len = Number(lenKey);
    if (typeof maxRel !== 'number' || !Number.isFinite(maxRel)) {
      violations.push({ len, maxRel, eps, reason: 'unproven-measurement' });
      continue;
    }
    if (maxRel > eps) {
      violations.push({ len, maxRel, eps, reason: 'exceeds-epsilon' });
    }
  }
  return { ok: violations.length === 0, violations, eps };
}

/**
 * Divergence must not grow with series length (raw shortest maxRel baseline + tiny noise floor).
 * A missing or unproven rung fails closed.
 * @param {Record<number, number|null>} maxByLength
 */
export function assertNoLengthDependentGrowth(maxByLength, lengths = DRIFT_LADDER_LENGTHS) {
  const sorted = [...lengths].sort((a, b) => a - b);
  const shortest = sorted[0];
  const rawBase = maxByLength[shortest];
  const violations = [];
  if (typeof rawBase !== 'number' || !Number.isFinite(rawBase)) {
    return {
      ok: false,
      violations: [{ len: shortest, maxRel: rawBase, reason: 'unproven-baseline' }],
      base: null,
      rawBase,
      shortest,
    };
  }
  const base = Math.max(rawBase, GROWTH_BASE_NOISE_FLOOR);
  for (const len of sorted.slice(1)) {
    const m = maxByLength[len];
    if (typeof m !== 'number' || !Number.isFinite(m)) {
      violations.push({ len, maxRel: m, baseLen: shortest, reason: 'unproven-measurement' });
      continue;
    }
    const cap = base * (1 + LENGTH_GROWTH_FACTOR);
    if (m > cap) {
      violations.push({ len, maxRel: m, cap, baseLen: shortest, rawBase, base, reason: 'growth' });
    }
  }
  const longest = sorted[sorted.length - 1];
  const longestMax = maxByLength[longest];
  const growthRatio =
    Number.isFinite(longestMax) && rawBase > 0 ? longestMax / rawBase : null;
  return { ok: violations.length === 0, violations, base, rawBase, shortest, growthRatio };
}

/**
 * One SMA ladder rung: the gating divergence (product vs stateless resum reference) plus the
 * reference-self-error control (that same reference vs a compensated resum) which says how
 * much of the gating number the harness could possibly account for.
 * @param {object} perf
 * @param {number} length
 */
export function measureSmaDriftAtLength(perf, length) {
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: DRIFT_SCALE });
  const naive = naiveRollingSma(series, DRIFT_PERIOD);
  const optimized = perf.rollingSmaFast(series, DRIFT_PERIOD);
  const compensated = compensatedRollingSma(series, DRIFT_PERIOD);
  const expectedCompared = length - (DRIFT_PERIOD - 1);
  const divergence = maxRelativeDivergence(naive, optimized, DRIFT_PERIOD, {
    minComparedCount: expectedCompared,
  });
  const referenceSelfError = maxRelativeDivergence(compensated, naive, DRIFT_PERIOD, {
    minComparedCount: expectedCompared,
  });
  return {
    length,
    period: DRIFT_PERIOD,
    maxRel: divergence.maxRel,
    divergence,
    referenceSelfError,
  };
}

/**
 * @param {object} perf
 * @param {number} length
 */
export function measureWmaControlAtLength(perf, length) {
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: DRIFT_SCALE });
  const naive = naiveRollingWma(series, DRIFT_PERIOD);
  const optimized = perf.rollingWmaFast(series, DRIFT_PERIOD);
  const divergence = maxRelativeDivergence(naive, optimized, DRIFT_PERIOD, {
    minComparedCount: length - (DRIFT_PERIOD - 1),
  });
  return { length, period: DRIFT_PERIOD, maxRel: divergence.maxRel, divergence };
}

/** @param {object} perf @param {{ invertEpsilon?: boolean }} [opts] */
export function runSanityRollingShort(perf, opts = {}) {
  const length = 512;
  const period = DRIFT_PERIOD;
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale: DRIFT_SCALE });
  const expectedCompared = length - (period - 1);
  const smaDiv = maxRelativeDivergence(
    naiveRollingSma(series, period),
    perf.rollingSmaFast(series, period),
    period,
    { minComparedCount: expectedCompared },
  );
  const wmaDiv = maxRelativeDivergence(
    naiveRollingWma(series, period),
    perf.rollingWmaFast(series, period),
    period,
    { minComparedCount: expectedCompared },
  );

  const measured = smaDiv.ok && wmaDiv.ok;
  const smaMax = smaDiv.maxRel;
  const wmaMax = wmaDiv.maxRel;
  const within = measured && smaMax <= EPS_ROLLING_NONRECURSIVE && wmaMax <= EPS_ROLLING_NONRECURSIVE;

  if (opts.invertEpsilon) {
    return {
      cell: 'NC-PARITY-EPSILON-INVERTED',
      pass: measured && within,
      status: !measured ? 'UNPROVEN' : within ? 'RED' : 'GREEN',
      unprovenReason: measured ? null : smaDiv.reason ?? wmaDiv.reason,
      smaMax,
      wmaMax,
      comparedCount: smaDiv.comparedCount,
      epsilon: EPS_ROLLING_NONRECURSIVE,
      note: 'Inverted epsilon: RED when short series would pass normal parity (proves gate).',
    };
  }
  return {
    cell: 'SANITY-ROLLING-SHORT',
    pass: within,
    status: !measured ? 'UNPROVEN' : within ? 'GREEN' : 'RED',
    unprovenReason: measured ? null : smaDiv.reason ?? wmaDiv.reason,
    smaMax,
    wmaMax,
    comparedCount: smaDiv.comparedCount,
    epsilon: EPS_ROLLING_NONRECURSIVE,
    note: 'Short fixtures can pass while multi-year ranges fail; drift ladder is authoritative.',
  };
}

function driftCellName(length) {
  return `DRIFT-SMA-${length >= 1_000_000 ? '1M' : length >= 500_000 ? '500K' : '100K'}`;
}

/** @param {object} perf */
export function runDriftSmaCell(perf, length) {
  const measured = measureSmaDriftAtLength(perf, length);
  return {
    cell: driftCellName(length),
    length,
    maxRel: measured.maxRel,
    divergence: measured.divergence,
    referenceSelfError: measured.referenceSelfError,
    status: 'PENDING_LADDER',
  };
}

/**
 * The control that makes the SMA drift claim attributable: the reference's own error must not
 * grow across the ladder, and the gating divergence must dominate it at every rung. Without
 * this, a growing max could be harness noise or a max-over-more-samples artifact.
 * @param {Array<{ cell: string, length: number, maxRel: number|null, referenceSelfError: object }>} cells
 */
export function assertReferenceSelfErrorControl(cells) {
  const violations = [];
  const byLength = {};
  for (const c of cells) {
    const selfErr = c.referenceSelfError;
    if (!selfErr || !selfErr.ok || !Number.isFinite(selfErr.maxRel)) {
      violations.push({
        len: c.length,
        reason: 'unproven-self-error',
        detail: selfErr ? selfErr.reason : 'missing',
      });
      continue;
    }
    byLength[c.length] = selfErr.maxRel;
    if (!Number.isFinite(c.maxRel)) {
      violations.push({ len: c.length, reason: 'unproven-divergence' });
      continue;
    }
    const dominance = selfErr.maxRel > 0 ? c.maxRel / selfErr.maxRel : Infinity;
    if (dominance < REF_SELF_ERROR_DOMINANCE_MIN) {
      violations.push({
        len: c.length,
        reason: 'reference-noise-not-dominated',
        dominance,
        required: REF_SELF_ERROR_DOMINANCE_MIN,
        selfError: selfErr.maxRel,
        maxRel: c.maxRel,
      });
    }
  }

  const lengths = Object.keys(byLength).map(Number).sort((a, b) => a - b);
  let selfGrowthRatio = null;
  if (lengths.length >= 2) {
    const base = byLength[lengths[0]];
    const longest = byLength[lengths[lengths.length - 1]];
    selfGrowthRatio = base > 0 ? longest / base : null;
    if (selfGrowthRatio != null && selfGrowthRatio > REF_SELF_ERROR_GROWTH_CAP) {
      violations.push({
        reason: 'reference-self-error-grows-with-length',
        selfGrowthRatio,
        cap: REF_SELF_ERROR_GROWTH_CAP,
      });
    }
  }

  return {
    cell: 'DRIFT-SMA-REFERENCE-SELF-ERROR',
    ok: violations.length === 0,
    status: violations.length === 0 ? 'GREEN' : 'RED',
    violations,
    selfErrorByLength: byLength,
    selfGrowthRatio,
    dominanceMin: REF_SELF_ERROR_DOMINANCE_MIN,
    growthCap: REF_SELF_ERROR_GROWTH_CAP,
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
  const referenceControl = assertReferenceSelfErrorControl(cells);
  for (const c of cells) {
    const measured = c.divergence.ok && Number.isFinite(c.maxRel);
    const withinEps = measured && c.maxRel <= EPS_ROLLING_NONRECURSIVE;
    c.withinAbsoluteEpsilon = withinEps;
    c.independence = PARITY_FAMILY_INDEPENDENCE.SMA;
    c.comparedCount = c.divergence.comparedCount;
    c.differingCount = c.divergence.differingCount;
    if (!measured) {
      c.status = 'UNPROVEN';
      c.unprovenReason = c.divergence.reason;
    } else {
      c.status = growth.ok && absolute.ok && withinEps ? 'GREEN' : 'RED';
      c.unprovenReason = null;
    }
    c.growth = growth;
    c.absolute = absolute;
    c.referenceControl = referenceControl;
  }
  return { cells, growth, absolute, referenceControl, maxByLength };
}

/** @param {object} perf @param {number[]} [lengths] */
export function runDriftWmaControl(perf, lengths = [100_000, 500_000]) {
  const maxByLength = {};
  const cells = [];
  for (const length of lengths) {
    const { maxRel, divergence } = measureWmaControlAtLength(perf, length);
    maxByLength[length] = maxRel;
    cells.push({
      cell: length === lengths[0] ? 'DRIFT-WMA-CONTROL' : `DRIFT-WMA-CONTROL-${length}`,
      length,
      maxRel,
      divergence,
      comparedCount: divergence.comparedCount,
      differingCount: divergence.differingCount,
      independence: PARITY_FAMILY_INDEPENDENCE.WMA,
    });
  }
  const growth = assertNoLengthDependentGrowth(maxByLength, lengths);
  const absolute = assertWithinAbsoluteEpsilon(maxByLength);
  const allMeasured = cells.every((c) => c.divergence.ok && Number.isFinite(c.maxRel));
  const status = !allMeasured
    ? 'UNPROVEN'
    : growth.ok && absolute.ok && cells.every((c) => c.maxRel <= EPS_ROLLING_NONRECURSIVE)
      ? 'GREEN'
      : 'RED';
  for (const c of cells) {
    c.withinAbsoluteEpsilon = Number.isFinite(c.maxRel) && c.maxRel <= EPS_ROLLING_NONRECURSIVE;
    c.status = status;
    c.unprovenReason = c.divergence.ok ? null : c.divergence.reason;
  }
  return { cells, growth, absolute, maxByLength, status };
}

/**
 * Reference + optimized series for one canary family, or the reason the product path is
 * unavailable. Computed once per (family, tier, scale) and shared by the parity cell and
 * every negative control derived from it.
 *
 * @param {object} perf
 * @param {{ calculateEMA?: Function, calculateDEMA?: Function } | null} chartCalcs
 * @param {'SMA'|'WMA'|'EMA'|'DEMA'} family
 * @param {number} length
 * @param {number} scale
 */
export function computeM5Pair(perf, chartCalcs, family, length, scale = 1) {
  const period = DRIFT_PERIOD;
  const series = buildDriftLadderSeries(length, DRIFT_SEED, { scale });

  switch (family) {
    case 'SMA':
      return {
        period,
        reference: naiveRollingSma(series, period),
        optimized: perf.rollingSmaFast(series, period),
        optimizedPath: 'IndicatorPerf.rollingSmaFast',
        unprovenReason: null,
      };
    case 'WMA':
      return {
        period,
        reference: naiveRollingWma(series, period),
        optimized: perf.rollingWmaFast(series, period),
        optimizedPath: 'IndicatorPerf.rollingWmaFast',
        unprovenReason: null,
      };
    case 'EMA':
      if (!chartCalcs?.calculateEMA) {
        return {
          period,
          reference: null,
          optimized: null,
          optimizedPath: null,
          unprovenReason:
            'IndicatorPerf has no rollingEmaFast; chart-indicators calculateEMA not loaded',
        };
      }
      return {
        period,
        reference: emaClosedFormReference(series, period),
        optimized: chartCalcs.calculateEMA(seriesToCloseBars(series), period, 'close'),
        optimizedPath: 'chart-indicators calculateEMA (read-only extract)',
        unprovenReason: null,
      };
    case 'DEMA':
      if (!chartCalcs?.calculateDEMA) {
        return {
          period,
          reference: null,
          optimized: null,
          optimizedPath: null,
          unprovenReason:
            'IndicatorPerf has no rollingDemaFast; chart-indicators calculateDEMA not loaded',
        };
      }
      return {
        period,
        reference: demaClosedFormReference(series, period),
        optimized: chartCalcs.calculateDEMA(seriesToCloseBars(series), period, 'close'),
        optimizedPath: 'chart-indicators calculateDEMA (read-only extract)',
        unprovenReason: null,
      };
    default:
      throw new Error(`DIFFERENTIAL-PARITY-ORACLE-V1: unknown M5 family ${family}`);
  }
}

function numericEvidenceRequiredFor(family, arithmetic) {
  const rule = PARITY_FAMILY_INDEPENDENCE[family]?.numericEvidenceRequired ?? 'never';
  if (rule === 'always') return true;
  if (rule === 'rounding-exercised') return arithmetic === 'rounding-exercised';
  return false;
}

/**
 * Grading metadata for one canary cell. Single source of truth so a parity cell and the
 * negative controls derived from it are always graded under identical rules.
 * @param {'SMA'|'WMA'|'EMA'|'DEMA'} family
 * @param {{ id: string, length: number }} tier
 * @param {{ id: string, arithmetic: string, suffix: string }} scaleSpec
 * @param {string|null} optimizedPath
 */
export function parityCellMeta(family, tier, scaleSpec, optimizedPath) {
  return {
    cell: `PARITY-${family}-${tier.id}${scaleSpec.suffix}`,
    family,
    length: tier.length,
    tier: tier.id,
    scaleId: scaleSpec.id,
    arithmetic: scaleSpec.arithmetic,
    optimizedPath,
    expectedComparedCount: tier.length - (DRIFT_PERIOD - 1),
    requireNumericEvidence: numericEvidenceRequiredFor(family, scaleSpec.arithmetic),
  };
}

/**
 * Grade one reference/optimized pair into GREEN / RED / UNPROVEN.
 * @param {{ reference: any, optimized: any, period: number, unprovenReason: string|null }} pair
 * @param {object} meta
 */
export function evaluateParityPair(pair, meta) {
  const {
    cell,
    family,
    length,
    tier,
    scaleId,
    arithmetic,
    optimizedPath,
    expectedComparedCount,
    requireNumericEvidence,
  } = meta;
  const base = {
    cell,
    family,
    length,
    tier,
    scaleId,
    arithmetic,
    optimizedPath,
    epsilon: EPS_ROLLING_NONRECURSIVE,
    independence: PARITY_FAMILY_INDEPENDENCE[family],
  };

  if (pair.unprovenReason) {
    return {
      ...base,
      status: 'UNPROVEN',
      pass: false,
      unprovenReason: pair.unprovenReason,
      reasonCode: UNPROVEN_REASONS.PRODUCT_PATH_UNAVAILABLE,
    };
  }

  const div = maxRelativeDivergence(pair.reference, pair.optimized, pair.period, {
    minComparedCount: expectedComparedCount,
  });

  const shared = {
    ...base,
    maxRel: div.maxRel,
    comparedCount: div.comparedCount,
    expectedComparedCount,
    bitExactCount: div.bitExactCount,
    differingCount: div.differingCount,
    evidenceClass: div.differingCount > 0 ? 'numeric' : 'bit-exact',
    numericEvidenceRequired: !!requireNumericEvidence,
  };

  if (!div.ok) {
    return {
      ...shared,
      status: 'UNPROVEN',
      pass: false,
      reasonCode: div.reason,
      unprovenReason: `${div.reason}${div.failureIndex != null ? ` at index ${div.failureIndex}` : ''}`,
    };
  }

  if (requireNumericEvidence && div.differingCount === 0) {
    return {
      ...shared,
      status: 'UNPROVEN',
      pass: false,
      reasonCode: UNPROVEN_REASONS.BIT_EXACT_NO_EVIDENCE,
      unprovenReason:
        'every compared pair was bit-identical, so an independent reference discriminated nothing',
    };
  }

  const within = div.maxRel <= EPS_ROLLING_NONRECURSIVE;
  return {
    ...shared,
    withinAbsoluteEpsilon: within,
    status: within ? 'GREEN' : 'RED',
    pass: within,
    reasonCode: null,
    unprovenReason: null,
  };
}

/**
 * @param {object} perf IndicatorPerf from loadIndicatorPerf
 * @param {{ calculateEMA?: Function, calculateDEMA?: Function } | null} chartCalcs
 * @param {'SMA'|'WMA'|'EMA'|'DEMA'} family
 * @param {number} length
 * @param {'SHORT'|'MEDIUM'} tier
 * @param {{ id: string, scale: number, arithmetic: string, suffix: string }} [scaleSpec]
 */
export function runM5ParityCell(perf, chartCalcs, family, length, tier, scaleSpec = PARITY_SCALES[0]) {
  const pair = computeM5Pair(perf, chartCalcs, family, length, scaleSpec.scale);
  return evaluateParityPair(pair, parityCellMeta(family, { id: tier, length }, scaleSpec, pair.optimizedPath));
}

/**
 * Negative controls derived from an already-graded pair.
 *
 * Value defect → the cell must go RED. Shape defects (all-null optimized, length mismatch,
 * non-finite value, both sides null) → the cell must go UNPROVEN. Each control reports
 * `mutatedStatus` (what the graded cell became) and `pass` (whether the gate reacted as
 * required); `status` is the health of the control itself, GREEN when the gate reacted.
 *
 * @param {object} pair from computeM5Pair
 * @param {object} meta same shape as evaluateParityPair meta
 */
export function runParityNegativeControls(pair, meta) {
  const cells = [];
  const startIndex = pair.period - 1;

  const grade = (name, mutatedPair, expect, detail) => {
    const graded = evaluateParityPair(mutatedPair, { ...meta, cell: name });
    const pass = graded.status === expect;
    cells.push({
      cell: name,
      family: meta.family,
      tier: meta.tier,
      scaleId: meta.scaleId,
      expect,
      mutatedStatus: graded.status,
      mutatedMaxRel: graded.maxRel ?? null,
      mutatedReason: graded.reasonCode ?? graded.unprovenReason ?? null,
      comparedCount: graded.comparedCount ?? 0,
      pass,
      status: pass ? 'GREEN' : 'RED',
      ...detail,
    });
    return graded;
  };

  if (pair.unprovenReason) {
    cells.push({
      cell: `NC-PARITY-${meta.family}-${meta.tier}-UNAVAILABLE`,
      family: meta.family,
      tier: meta.tier,
      scaleId: meta.scaleId,
      expect: 'UNPROVEN',
      mutatedStatus: 'UNPROVEN',
      pass: false,
      status: 'RED',
      mutatedReason: pair.unprovenReason,
      note: 'Product path unavailable: negative controls could not be exercised.',
    });
    return cells;
  }

  const injected = injectRelativeError(pair.optimized, {
    startIndex,
    relativeError: NC_INJECTED_RELATIVE_ERROR,
  });
  grade(
    `NC-PARITY-${meta.family}-${meta.tier}-INJECTED-REL-ERROR`,
    { ...pair, optimized: injected.mutated },
    'RED',
    {
      injectedRelativeError: injected.relativeError,
      injectedAtIndex: injected.index,
      epsilon: EPS_ROLLING_NONRECURSIVE,
    },
  );

  grade(
    `NC-PARITY-${meta.family}-${meta.tier}-ALL-NULL-OPTIMIZED`,
    { ...pair, optimized: injectAllNull(pair.optimized).mutated },
    'UNPROVEN',
    { note: 'All-null optimized output must never read as parity.' },
  );

  grade(
    `NC-PARITY-${meta.family}-${meta.tier}-NONFINITE-OPTIMIZED`,
    { ...pair, optimized: injectNonFinite(pair.optimized, { startIndex }).mutated },
    'UNPROVEN',
    { note: 'A non-finite compared value must fail closed, not be skipped.' },
  );

  grade(
    `NC-PARITY-${meta.family}-${meta.tier}-LENGTH-MISMATCH`,
    { ...pair, optimized: injectTruncated(pair.optimized).mutated },
    'UNPROVEN',
    { note: 'A shorter optimized span must fail closed, not compare the overlap.' },
  );

  grade(
    `NC-PARITY-${meta.family}-${meta.tier}-ZERO-COMPARED`,
    {
      ...pair,
      reference: injectAllNull(pair.reference).mutated,
      optimized: injectAllNull(pair.optimized).mutated,
    },
    'UNPROVEN',
    { note: 'comparedCount===0 must fail closed (no vacuous GREEN on an empty compare).' },
  );

  return cells;
}

/** @param {object} perf @param {string} [root] */
export function runM5CanaryParity(perf, root = REPO_ROOT) {
  let chartCalcs = null;
  let chartCalcsError = null;
  try {
    chartCalcs = loadChartIndicatorsEmaDema(root);
  } catch (err) {
    chartCalcsError = err instanceof Error ? err.message : String(err);
  }

  const cells = [];
  const ncCells = [];
  for (const family of M5_CANARY_FAMILIES) {
    for (const scaleSpec of PARITY_SCALES) {
      for (const tier of PARITY_TIERS) {
        const pair = computeM5Pair(perf, chartCalcs, family, tier.length, scaleSpec.scale);
        const meta = parityCellMeta(family, tier, scaleSpec, pair.optimizedPath);
        cells.push(evaluateParityPair(pair, meta));
        // Negative controls run on the rounding-exercised fixture, where the compare has bit
        // patterns to discriminate — a control that only ever ran on exact arithmetic would
        // prove less than the cell it guards.
        if (scaleSpec.arithmetic === 'rounding-exercised') {
          ncCells.push(...runParityNegativeControls(pair, meta));
        }
      }
    }
  }

  const vacuous = cells.filter(
    (c) => c.numericEvidenceRequired && c.evidenceClass === 'bit-exact',
  );
  const ncFailures = ncCells.filter((c) => !c.pass);

  return {
    cells,
    ncCells,
    ncFailures,
    vacuous,
    chartCalcsError,
    chartCalcsSource: chartCalcs?.sourceRel ?? null,
  };
}

/** @param {object} [opts] @param {string} [opts.root] */
export function runAllCells(opts = {}) {
  const root = opts.root ?? REPO_ROOT;
  const perf = loadIndicatorPerf(root);
  const sanity = runSanityRollingShort(perf);
  const ncInverted = runSanityRollingShort(perf, { invertEpsilon: true });
  const smaLadder = runDriftSmaLadder(perf);
  const wmaControl = runDriftWmaControl(perf);
  const m5Parity = runM5CanaryParity(perf, root);
  return {
    signature: DIFFERENTIAL_PARITY_ORACLE_SIGNATURE,
    indicatorPerfPath: INDICATOR_PERF_REL,
    epsRollingNonRecursive: EPS_ROLLING_NONRECURSIVE,
    cpuAcceptanceDoc: 'docs/plan3/PO-PROTOCOL-CPU-AB-20260728.md',
    sanity,
    ncInverted,
    smaLadder,
    wmaControl,
    m5Parity,
  };
}

const fmt = (v) => (v === null || v === undefined ? 'n/a' : String(v));

/** CLI report when invoked directly */
export function formatReport(report) {
  const lines = [
    report.signature,
    `EPS-ROLLING-NONRECURSIVE=${report.epsRollingNonRecursive}`,
    '',
    `${report.sanity.cell}: ${report.sanity.status} (smaMax=${fmt(report.sanity.smaMax)}, wmaMax=${fmt(report.sanity.wmaMax)}, compared=${report.sanity.comparedCount})`,
    `${report.ncInverted.cell}: ${report.ncInverted.status} (pass=${report.ncInverted.pass})`,
  ];
  for (const c of report.smaLadder.cells) {
    lines.push(
      `${c.cell}: ${c.status} maxRel=${fmt(c.maxRel)} compared=${fmt(c.comparedCount)} refSelfError=${fmt(c.referenceSelfError?.maxRel)}`,
    );
  }
  const rc = report.smaLadder.referenceControl;
  lines.push(
    `${rc.cell}: ${rc.status} selfGrowthRatio=${fmt(rc.selfGrowthRatio)} (cap ${rc.growthCap}), divergence growthRatio=${fmt(report.smaLadder.growth.growthRatio)}`,
  );
  for (const c of report.wmaControl.cells) {
    lines.push(
      `${c.cell}: ${c.status} maxRel=${fmt(c.maxRel)} compared=${fmt(c.comparedCount)} differing=${fmt(c.differingCount)} [${c.independence.class}]`,
    );
  }
  if (report.m5Parity?.cells) {
    lines.push('');
    lines.push('M5 canary parity (values only; CPU → PO-PROTOCOL-CPU-AB-20260728.md):');
    for (const c of report.m5Parity.cells) {
      if (c.status === 'UNPROVEN') {
        lines.push(`${c.cell}: UNPROVEN (${c.unprovenReason})`);
      } else {
        lines.push(
          `${c.cell}: ${c.status} maxRel=${fmt(c.maxRel)} compared=${c.comparedCount} differing=${c.differingCount} evidence=${c.evidenceClass} [${c.independence.class}]`,
        );
      }
    }
    lines.push('');
    lines.push('Negative controls (GREEN = the gate reacted as required):');
    for (const c of report.m5Parity.ncCells) {
      lines.push(
        `${c.cell}: ${c.status} expected=${c.expect} got=${c.mutatedStatus}${c.mutatedReason ? ` (${c.mutatedReason})` : ''}`,
      );
    }
  }
  if (!report.smaLadder.growth.ok) {
    lines.push('');
    lines.push(`SMA ladder growth violations: ${JSON.stringify(report.smaLadder.growth.violations)}`);
  }
  if (report.m5Parity?.vacuous?.length) {
    lines.push(`Vacuous parity cells: ${report.m5Parity.vacuous.map((c) => c.cell).join(', ')}`);
  }
  if (report.m5Parity?.ncFailures?.length) {
    lines.push(`Negative-control failures: ${report.m5Parity.ncFailures.map((c) => c.cell).join(', ')}`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const report = runAllCells();
  console.log(formatReport(report));
}
