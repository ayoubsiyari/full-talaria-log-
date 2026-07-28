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
