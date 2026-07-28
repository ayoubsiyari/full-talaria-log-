/**
 * Pure reference rolling averages — O(n·p) full window recompute per index.
 * Owned by Manager C (A7); not loaded from product code.
 */

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
 * EMA with SMA seed at bar (period-1), matching chart-indicators calculateEMA on close-only bars.
 * Independent loop structure from product (parity reference, not IndicatorPerf — no fast EMA there).
 * @param {ArrayLike<number>} arr @param {number} period
 */
export function naiveRollingEma(arr, period) {
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

/** DEMA = 2·EMA₁ − EMA(EMA₁), same structure as chart-indicators calculateDEMA. */
export function naiveRollingDema(arr, period) {
  const p = Math.max(1, period | 0);
  const ema1 = naiveRollingEma(arr, p);
  const n = arr.length;
  const pseudo = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = ema1[i];
    pseudo[i] = v != null ? v : arr[i];
  }
  const ema2 = naiveRollingEma(pseudo, p);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = null;
  for (let i = 0; i < n; i++) {
    const e1 = ema1[i];
    const e2 = ema2[i];
    if (e1 == null || e2 == null) continue;
    out[i] = 2 * e1 - e2;
  }
  return out;
}
