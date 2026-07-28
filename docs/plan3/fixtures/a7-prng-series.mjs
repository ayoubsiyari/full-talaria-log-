/**
 * Deterministic price-like series for A7 differential parity fixtures.
 */

/** @param {number} seed */
export function createPrng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} length
 * @param {number} seed
 * @param {{ scale?: number, base?: number }} [opts]
 * @returns {Float64Array}
 */
export function buildDriftLadderSeries(length, seed, { scale = 1, base = 100 } = {}) {
  const rnd = createPrng(seed);
  const arr = new Float64Array(length);
  let price = base * scale;
  const step = 0.02 * scale * base;
  for (let i = 0; i < length; i++) {
    price += (rnd() - 0.5) * step;
    arr[i] = price;
  }
  return arr;
}
