/**
 * Deterministic price-like series for A7 differential parity fixtures.
 *
 * SCALE MATTERS, and not only for magnitude coverage. `createPrng` returns k/2³², so each
 * price increment is `(k/2³² − ½)·0.02·scale·base`. At scale = 1 every price is an integer
 * multiple of 2⁻³¹ and stays below 2⁹, so every 20-bar window sum is representable exactly:
 * an incremental running sum and a full-window resum then produce bit-identical output, and
 * an SMA parity cell measured there is structural agreement rather than numeric evidence.
 * At scale = 1e6 (JPY magnitude) the window sums no longer land on representable values, the
 * two paths round differently, and the comparison has bit patterns to discriminate.
 *
 * DIFFERENTIAL-PARITY-ORACLE-V1 therefore runs every canary family at both scales and labels
 * each cell `exactly-representable` or `rounding-exercised` accordingly.
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
