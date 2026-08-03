/**
 * BASIS-GUARD-01 — cross-basis borrowing, refused in code rather than watched for.
 *
 * THE CLASS. Taking a figure measured on one quantity/scope and using it against another, where the
 * arithmetic is valid but the meaning is not. It has cost us twice in one day:
 *
 *   1. COV-01 read 59.84% coverage. The numerator was ONE renderer's allocator roots; the denominator
 *      was ALL Chrome processes' private memory. Both numbers were correct. The ratio was meaningless,
 *      and it blocked the 674.9 MB floor for a day of scheduling.
 *
 *   2. PHASE-SURVIVAL-01 nearly killed three canvas reclaims by applying the JS-HEAP sawtooth
 *      amplitude (183.4 MB, measured on V8's heap) to GPU-backed canvas memory — a different
 *      allocator with a different lifecycle, where a scavenge does not free a backing store.
 *
 * Both are the same move: a number borrowed across a basis boundary because the units matched. MB is
 * not a basis. "MB of what, over what scope, measured how" is a basis.
 *
 * The guard is deliberately unhelpful: it will not coerce, infer or default a basis. An untagged
 * figure is refused, because the failure mode is precisely that everything looks like a plain number.
 */

/** A basis is the triple that has to match before two figures may be combined. */
export function basis({ quantity, scope, method = null }) {
  if (!quantity || !scope) throw new TypeError('a basis needs at least a quantity and a scope');
  return { quantity, scope, method };
}

export function tag(valueMB, b) {
  return { valueMB, basis: b };
}

export function basisKey(b) {
  return b ? `${b.quantity}@${b.scope}${b.method ? `/${b.method}` : ''}` : 'UNTAGGED';
}

function describe(b) {
  return b ? `${b.quantity} over ${b.scope}${b.method ? ` (${b.method})` : ''}` : 'an untagged figure';
}

/**
 * The core refusal. Returns a verdict rather than throwing, so gates can report it in an artifact
 * the way every other check in this lane does.
 */
export function checkSameBasis(a, b, { operation = 'combine' } = {}) {
  if (!a?.basis || !b?.basis) {
    return {
      ok: false, state: 'UNTAGGED_FIGURE',
      why: `cannot ${operation} figures when ${!a?.basis ? 'the first' : 'the second'} carries no basis. `
        + 'MB is not a basis; an untagged number is exactly how a cross-basis borrow gets through.',
    };
  }
  if (a.basis.quantity !== b.basis.quantity) {
    return {
      ok: false, state: 'QUANTITY_MISMATCH',
      why: `cannot ${operation} ${describe(a.basis)} with ${describe(b.basis)}: different QUANTITIES. `
        + 'This is the JS-heap amplitude applied to GPU canvas memory — different allocators, '
        + 'different lifecycles, and a scavenge does not free a backing store.',
    };
  }
  if (a.basis.scope !== b.basis.scope) {
    return {
      ok: false, state: 'SCOPE_MISMATCH',
      why: `cannot ${operation} ${describe(a.basis)} with ${describe(b.basis)}: different SCOPES. `
        + 'This is the 59.84% coverage defect — one renderer\'s roots over all processes\' total. '
        + 'Both numbers correct, the ratio meaningless.',
    };
  }
  if (a.basis.method && b.basis.method && a.basis.method !== b.basis.method) {
    return {
      ok: false, state: 'METHOD_MISMATCH',
      why: `cannot ${operation} ${describe(a.basis)} with ${describe(b.basis)}: different METHODS. `
        + 'A 3-second read and a 600-second settled curve are not the same measurement of the same '
        + 'thing; the gap between them was measured at 108.2 MB.',
    };
  }
  return { ok: true, state: 'SAME_BASIS', basis: basisKey(a.basis) };
}

/** A ratio that refuses to be computed across a basis boundary. */
export function ratio(numerator, denominator) {
  const c = checkSameBasis(numerator, denominator, { operation: 'take a ratio of' });
  if (!c.ok) return { ...c, value: null };
  const d = Number(denominator.valueMB);
  if (!(d > 0)) {
    return { ok: false, state: 'NO_DENOMINATOR', value: null,
      why: 'the denominator is zero, null or negative; a coverage figure computed against it would be '
        + 'a number rather than a measurement' };
  }
  return { ok: true, state: 'SAME_BASIS', basis: basisKey(numerator.basis),
    value: +((Number(numerator.valueMB) / d) * 100).toFixed(2) };
}

/** A difference that refuses to be taken across a basis boundary. */
export function difference(a, b) {
  const c = checkSameBasis(a, b, { operation: 'subtract' });
  if (!c.ok) return { ...c, valueMB: null };
  return { ok: true, state: 'SAME_BASIS', basis: basisKey(a.basis),
    valueMB: +(Number(a.valueMB) - Number(b.valueMB)).toFixed(2) };
}

/**
 * Borrowing an error bar, amplitude or calibration measured on one quantity for use on another. The
 * named case from PHASE-SURVIVAL-01, refused by default and only permitted with a written
 * justification that lands in the artifact.
 */
export function borrowAcrossBasis(sourceBasis, targetBasis, { justification = null } = {}) {
  const same = checkSameBasis(tag(0, sourceBasis), tag(0, targetBasis), { operation: 'borrow between' });
  if (same.ok) return { ok: true, state: 'NO_BORROW_NEEDED', basis: basisKey(sourceBasis) };
  if (!justification || String(justification).trim().length < 40) {
    return {
      ...same,
      ok: false,
      state: 'BORROW_REFUSED',
      mismatch: same.state,
      why: `${same.why} A borrow may be permitted, but only with a written justification of at least `
        + '40 characters saying why the two bases behave alike. Silence is not a justification.',
    };
  }
  return { ok: true, state: 'BORROW_JUSTIFIED', from: basisKey(sourceBasis), to: basisKey(targetBasis),
    justification: String(justification).trim() };
}

/** Common bases, named once so callers stop inventing spellings that will not compare equal. */
export const BASES = {
  allChromePrivate: basis({ quantity: 'private-memory', scope: 'all-chrome-processes', method: 'os-footprint' }),
  onePidPrivate: basis({ quantity: 'private-memory', scope: 'single-process', method: 'os-footprint' }),
  allChromeRoots: basis({ quantity: 'allocator-roots', scope: 'all-chrome-processes', method: 'effective_size' }),
  onePidRoots: basis({ quantity: 'allocator-roots', scope: 'single-process', method: 'effective_size' }),
  jsHeap: basis({ quantity: 'js-heap', scope: 'all-isolates', method: 'heap-profiler' }),
  gpuMemory: basis({ quantity: 'gpu-memory', scope: 'gpu-process', method: 'os-footprint' }),
};
