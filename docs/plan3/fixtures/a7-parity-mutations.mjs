/**
 * Mutation injectors for DIFFERENTIAL-PARITY-ORACLE-V1 negative controls (A7 / M5).
 *
 * Every injector returns a NEW array and never mutates its input: the negative-control
 * cells are evaluated against the very same reference/optimized pair that produced the
 * positive parity cell, so a caught mutation is evidence about that cell and not about a
 * separately constructed toy series.
 *
 * Two mutation classes, matching the two ways a parity gate can lie:
 *   1. `injectRelativeError` — a value defect large enough that the cell MUST go RED.
 *      Any injector in this class that comes back GREEN means the epsilon comparison is
 *      not load-bearing.
 *   2. `injectAllNull` / `injectNonFinite` / `injectTruncated` — shape defects that leave
 *      nothing (or nothing trustworthy) to compare. These MUST come back UNPROVEN, never
 *      GREEN: an optimized path that emitted no comparable values has not been proven
 *      equal to anything.
 */

/**
 * Relative error injected by the value-defect negative controls: 1000× EPS-ROLLING-NONRECURSIVE.
 * Chosen far above epsilon so the control cannot be explained by rounding, and far below 1 so
 * it stays inside the regime a real optimization defect would live in.
 */
export const NC_INJECTED_RELATIVE_ERROR = 1e-6;

/** @param {ArrayLike<number|null>} values */
function toArray(values) {
  return Array.prototype.slice.call(values);
}

/**
 * Index of the compared element the injectors target: the first comparable slot at or after
 * `atFraction` through the compared range, so the defect always lands on a value the cell
 * actually inspects.
 * @param {ArrayLike<number|null>} values
 * @param {number} startIndex first compared index (period - 1)
 * @param {number} atFraction
 */
export function pickInjectionIndex(values, startIndex, atFraction = 0.5) {
  const n = values.length;
  const from = Math.max(0, startIndex | 0);
  const target = from + Math.floor((n - from) * Math.min(Math.max(atFraction, 0), 0.999));
  for (let i = target; i < n; i++) {
    if (Number.isFinite(values[i])) return i;
  }
  for (let i = from; i < n; i++) {
    if (Number.isFinite(values[i])) return i;
  }
  return -1;
}

/**
 * Scale one compared value by (1 + relativeError) — a known value defect above epsilon.
 * @param {ArrayLike<number|null>} values
 * @param {{ startIndex: number, relativeError?: number, atFraction?: number }} opts
 */
export function injectRelativeError(values, opts) {
  const relativeError = opts.relativeError ?? NC_INJECTED_RELATIVE_ERROR;
  const index = pickInjectionIndex(values, opts.startIndex, opts.atFraction ?? 0.5);
  const mutated = toArray(values);
  if (index < 0) {
    return { mutated, index, relativeError, from: null, to: null, applied: false };
  }
  const from = mutated[index];
  // Sign-safe: a non-zero value moves by exactly `relativeError` in relative terms; a zero
  // value cannot be perturbed multiplicatively, so fall back to an absolute nudge that the
  // divergence denominator floor still reports as a large relative error.
  const to = from !== 0 ? from * (1 + relativeError) : relativeError;
  mutated[index] = to;
  return { mutated, index, relativeError, from, to, applied: true };
}

/** Replace every element with null — the "optimized path produced nothing" defect. */
export function injectAllNull(values) {
  return { mutated: new Array(values.length).fill(null), applied: true };
}

/**
 * Replace one compared value with a non-finite value (NaN by default).
 * @param {ArrayLike<number|null>} values
 * @param {{ startIndex: number, value?: number, atFraction?: number }} opts
 */
export function injectNonFinite(values, opts) {
  const index = pickInjectionIndex(values, opts.startIndex, opts.atFraction ?? 0.5);
  const mutated = toArray(values);
  const value = opts.value === undefined ? NaN : opts.value;
  if (index < 0) return { mutated, index, value, applied: false };
  mutated[index] = value;
  return { mutated, index, value, applied: true };
}

/**
 * Drop trailing elements — the "optimized path returned a different span" defect.
 * @param {ArrayLike<number|null>} values
 * @param {{ drop?: number }} [opts]
 */
export function injectTruncated(values, opts = {}) {
  const drop = Math.max(1, opts.drop ?? 1);
  return { mutated: toArray(values).slice(0, Math.max(0, values.length - drop)), drop, applied: true };
}
