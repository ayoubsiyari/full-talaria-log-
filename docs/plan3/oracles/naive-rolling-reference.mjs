/**
 * Reference rolling averages for DIFFERENTIAL-PARITY-ORACLE-V1 (A7 / M5 canary families).
 * Owned by Manager C. Never loaded from product code, and never loads product code.
 *
 * INDEPENDENCE LEDGER — read before crediting any parity GREEN from these references.
 * A parity GREEN is only as strong as the independence of the reference it was measured
 * against. Per family, exactly what is independent and what is a shared claim:
 *
 * | family | reference algorithm                                   | product algorithm                        | independence |
 * |--------|-------------------------------------------------------|------------------------------------------|--------------|
 * | SMA    | O(n·p) full-window resum, ascending order              | O(n) incremental running sum (add/subtract) | ALGORITHM — different arithmetic, different error accumulation |
 * | WMA    | O(n·p) full-window weighted resum, descending order    | O(n·p) full-window weighted resum, descending order | CODE-CLONE — structurally identical; divergence is 0 by construction |
 * | EMA    | closed-form geometric expansion, compensated ascending sum | in-place recurrence `ema += (v - ema)·α` | NUMERICS — different evaluation of the same definition |
 * | DEMA   | 2·EMA₁ − EMA(EMA₁) over closed-form EMA stages         | 2·EMA₁ − EMA(EMA₁) over recurrence EMA stages | NUMERICS — decomposition is shared spec (see below) |
 *
 * What these references CANNOT catch, stated plainly:
 *  - WMA: nothing. `rollingWmaFast` and `naiveRollingWma` are the same algorithm written
 *    twice, so PARITY-WMA-* is a code-clone equivalence check and DRIFT-WMA-CONTROL is a
 *    harness control (it proves the ladder is not unconditionally RED), not evidence about
 *    WMA numerics. Labelled `code-clone` on every cell it produces.
 *  - EMA/DEMA: a defect in the *definition* Talaria implements. The seed convention
 *    (SMA of the first `period` bars, emitted at index period−1), the smoothing constant
 *    α = 2/(period+1), the non-finite-bar policy (emit null, do NOT advance the recurrence
 *    state), and DEMA's decomposition into 2·EMA₁ − EMA(EMA₁) over a pseudo-series whose
 *    warm-up holes fall back to the raw source value — all of that is Talaria's
 *    specification, cloned here on purpose because a reference that used a different
 *    definition would report divergence that is not a defect. What is independent is the
 *    *evaluation*: the closed form never runs the product's recurrence, so a recurrence,
 *    ordering, or accumulation defect in the product is visible as divergence.
 *
 * The recurrence-shaped EMA/DEMA (`recursiveEmaSpecClone` / `recursiveDemaSpecClone`) are
 * retained ONLY as a self-consistency cross-check of the closed form in the test suite.
 * They are NOT the parity reference: they share the product's recurrence and would be blind
 * to exactly the defect class the closed form exists to catch.
 */

/**
 * Ratio at which the geometric tail of the EMA expansion is truncated.
 * Terms older than `emaTailCutoffTerms(period)` accepted bars carry total remaining weight
 * ≤ 2⁻⁶⁴ ≈ 5.4e-20, so their combined contribution is bounded by 5.4e-20·max|x|, which for
 * any series inside double range is orders of magnitude below one ulp of the result.
 * `emaClosedFormReference(..., { tailCutoff: false })` disables it; the test suite asserts
 * the truncated and full expansions agree, so the bound is proven, not assumed.
 */
export const EMA_TAIL_WEIGHT_CUTOFF = Math.pow(2, -64);

/** @param {ArrayLike<number>} arr @param {number} period */
export function naiveRollingSma(arr, period) {
  const p = Math.max(1, period | 0);
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  if (n < p) return out;

  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    let valid = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const v = arr[j];
      if (v != null && !Number.isNaN(v)) {
        sum += v;
        valid++;
      }
    }
    if (valid === p) out[i] = sum / p;
  }
  return out;
}

/** @param {ArrayLike<number>} arr @param {number} period */
export function naiveRollingWma(arr, period) {
  const p = Math.max(2, period | 0);
  const denom = (p * (p + 1)) / 2;
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  if (n < p) return out;

  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < p; j++) {
      const v = arr[i - j];
      if (v == null || Number.isNaN(v)) {
        ok = false;
        break;
      }
      sum += v * (p - j);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

/**
 * Near-exact rolling mean: full-window resum with Neumaier compensation.
 *
 * NOT the parity reference. Its only job is to bound the error of `naiveRollingSma` itself,
 * so the drift ladder can say which side of the comparison the divergence came from. The
 * compensated sum is accurate to ~1 ulp of the window mean at any window content, and — like
 * `naiveRollingSma` and unlike the product's running sum — it carries no state between
 * windows, so its error cannot grow with series length by construction.
 *
 * @param {ArrayLike<number>} arr @param {number} period
 */
export function compensatedRollingSma(arr, period) {
  const p = Math.max(1, period | 0);
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  if (n < p) return out;

  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    let comp = 0;
    let valid = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const v = arr[j];
      if (v == null || Number.isNaN(v)) continue;
      const t = sum + v;
      comp += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
      sum = t;
      valid++;
    }
    if (valid === p) out[i] = (sum + comp) / p;
  }
  return out;
}

/**
 * Number of trailing accepted bars the EMA expansion must retain for the truncated tail to
 * carry total weight ≤ EMA_TAIL_WEIGHT_CUTOFF.
 * @param {number} period
 */
export function emaTailCutoffTerms(period) {
  const p = Math.max(1, period | 0);
  const decay = 1 - 2 / (p + 1);
  if (!(decay > 0) || decay >= 1) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(Math.log(EMA_TAIL_WEIGHT_CUTOFF) / Math.log(decay));
}

/**
 * EMA by closed-form geometric expansion — independent evaluation of Talaria's EMA
 * definition, sharing none of the product's recurrence.
 *
 *   EMAₖ = decay^k · seed + Σ_{j=1..k} α · decay^(k−j) · x_j
 *
 * where seed is the SMA of the first `period` bars, α = 2/(period+1), decay = 1−α, and
 * x_1..x_k are the accepted (finite) bars after the seed bar. Terms are accumulated
 * smallest-weight-first with Neumaier compensation, so the reference is accurate to a few
 * ulps regardless of series length, while the product's recurrence carries its own history.
 *
 * Spec clone (deliberate, see file header): seed convention, α, and the non-finite-bar
 * policy — a non-finite bar emits null and does NOT advance the recurrence state, so it is
 * dropped from the accepted subsequence rather than treated as a zero.
 *
 * @param {ArrayLike<number>} arr
 * @param {number} period
 * @param {{ tailCutoff?: boolean }} [opts]
 * @returns {Array<number|null>}
 */
export function emaClosedFormReference(arr, period, opts = {}) {
  const tailCutoff = opts.tailCutoff !== false;
  const p = Math.max(1, period | 0);
  const alpha = 2 / (p + 1);
  const decay = 1 - alpha;
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  if (n < p) return out;

  // Seed: SMA of the first p bars. Ascending + compensated; the product sums descending and
  // uncompensated, so even the seed is an independent evaluation.
  let seedSum = 0;
  let seedComp = 0;
  for (let j = 0; j < p; j++) {
    const v = arr[j];
    if (!Number.isFinite(v)) return out; // product leaves ema null forever once the seed fails
    const t = seedSum + v;
    seedComp += Math.abs(seedSum) >= Math.abs(v) ? seedSum - t + v : v - t + seedSum;
    seedSum = t;
  }
  const seed = (seedSum + seedComp) / p;
  out[p - 1] = seed;

  const accepted = [];
  for (let i = p; i < n; i++) {
    if (Number.isFinite(arr[i])) accepted.push(i);
  }
  const m = accepted.length;
  if (m === 0) return out;

  const pow = new Float64Array(m + 1);
  pow[0] = 1;
  for (let d = 1; d <= m; d++) pow[d] = pow[d - 1] * decay;

  const keep = tailCutoff ? emaTailCutoffTerms(p) : Number.MAX_SAFE_INTEGER;

  for (let k = 1; k <= m; k++) {
    const from = keep >= k ? 1 : k - keep + 1;
    let sum = 0;
    let comp = 0;
    if (from === 1) {
      // Seed still inside the retained window; it carries the smallest weight, so add first.
      sum = pow[k] * seed;
    }
    for (let j = from; j <= k; j++) {
      const term = alpha * pow[k - j] * arr[accepted[j - 1]];
      const t = sum + term;
      comp += Math.abs(sum) >= Math.abs(term) ? sum - t + term : term - t + sum;
      sum = t;
    }
    out[accepted[k - 1]] = sum + comp;
  }
  return out;
}

/**
 * DEMA = 2·EMA₁ − EMA(EMA₁) with both stages evaluated by the closed-form expansion.
 * The decomposition and the pseudo-series warm-up fallback are Talaria's specification
 * (see file header); only the numeric evaluation is independent.
 * @param {ArrayLike<number>} arr
 * @param {number} period
 * @param {{ tailCutoff?: boolean }} [opts]
 */
export function demaClosedFormReference(arr, period, opts = {}) {
  const p = Math.max(1, period | 0);
  const n = arr.length;
  const ema1 = emaClosedFormReference(arr, p, opts);
  const pseudo = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = ema1[i];
    pseudo[i] = v != null ? v : arr[i];
  }
  const ema2 = emaClosedFormReference(pseudo, p, opts);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    out[i] = e1 == null || e2 == null ? null : 2 * e1 - e2;
  }
  return out;
}

/**
 * Recurrence-shaped EMA — a deliberate clone of the product's evaluation order.
 * NOT the parity reference: it shares the recurrence under test and would be blind to a
 * recurrence defect. Retained so the test suite can cross-check the closed form against the
 * shape everyone recognises, and so the clone-equivalence claim stays visible in code.
 * @param {ArrayLike<number>} arr @param {number} period
 */
export function recursiveEmaSpecClone(arr, period) {
  const p = Math.max(1, period | 0);
  const mult = 2 / (p + 1);
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  let ema = null;

  for (let i = 0; i < n; i++) {
    if (i < p - 1) {
      continue;
    }
    if (i === p - 1) {
      let sum = 0;
      let ok = true;
      for (let j = 0; j < p; j++) {
        const v = arr[j];
        if (!Number.isFinite(v)) {
          ok = false;
          break;
        }
        sum += v;
      }
      if (!ok) {
        ema = null;
      } else {
        ema = sum / p;
        out[i] = ema;
      }
      continue;
    }
    const v = arr[i];
    if (!Number.isFinite(v) || ema == null) {
      out[i] = null;
    } else {
      ema = (v - ema) * mult + ema;
      out[i] = ema;
    }
  }
  return out;
}

/**
 * Recurrence-shaped DEMA clone. Same standing as `recursiveEmaSpecClone`: cross-check only.
 * @param {ArrayLike<number>} arr @param {number} period
 */
export function recursiveDemaSpecClone(arr, period) {
  const p = Math.max(1, period | 0);
  const ema1 = recursiveEmaSpecClone(arr, p);
  const n = arr.length;
  const pseudo = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = ema1[i];
    pseudo[i] = v != null ? v : arr[i];
  }
  const ema2 = recursiveEmaSpecClone(pseudo, p);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    out[i] = e1 == null || e2 == null ? null : 2 * e1 - e2;
  }
  return out;
}
