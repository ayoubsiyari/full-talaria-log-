/**
 * ARM-EQUALITY-01 — the two soak arms must differ in the trade knob and in nothing else.
 *
 * Why this is a gate and not an assumption. Separability *inside* the trade arm is predicted to fail
 * (see `RECIPE-SEALED-SOAK-FROZEN-20260803.md` §2.4): a governor held steady at 30/h makes closed
 * trades almost perfectly collinear with wall clock, so no within-arm regression can split the trade
 * term from the time term. When that fails, **the entire attribution rests on the difference between
 * the two arms**. A between-arm delta is only interpretable if the arms are identical in everything
 * except trades — one second difference is a confound, and there is no within-arm regression left in
 * reserve to rescue it.
 *
 * So the asymmetry has to be caught *before* twenty hours of host time is spent, not discovered in
 * the analysis. This compares the effective config of both arms field by field and refuses the fire.
 *
 * Three kinds of field, and conflating them is the whole difficulty:
 *   - TRADE KNOBS      the permitted difference. This is what the experiment varies.
 *   - NOT CONDITIONS   output paths, log names, labels. They differ by necessity and change nothing
 *                      about what the browser does.
 *   - CONDITIONS       everything else. Any difference here is a confound.
 *
 * Note the fourth state below. Two arms that are identical in the trade knob as well are not "safe" —
 * they measure nothing at all, because the contrast the pair exists to create is absent. A gate that
 * only looked for differences would pass that case cleanly.
 */

/** The one thing the two arms are allowed to differ in. */
export const TRADE_KNOBS = ['closesPerHour'];

/** Fields that are bookkeeping rather than experimental conditions. */
export const NOT_CONDITIONS = ['out', 'outPath', 'log', 'logFile', 'label', 'arm', 'name', 'prefix'];

/**
 * @param {object|null} a effective config of arm A
 * @param {object|null} b effective config of arm B
 * @returns {{state:string, comparable:boolean, differences:Array, contrast:Array, reason:string}}
 */
export function compareArms(a, b, { tradeKnobs = TRADE_KNOBS, notConditions = NOT_CONDITIONS } = {}) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return { state: 'ARM_CONFIG_MISSING', comparable: false, differences: [], contrast: [],
      reason: 'one or both arm configs could not be read; a pair that cannot be compared must not be fired' };
  }

  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const differences = [];
  const contrast = [];

  for (const f of fields) {
    if (notConditions.includes(f)) continue;
    // Compared as strings: '10' and 10 describe the same run, and a gate that failed on the type
    // would be noise that teaches people to bypass it.
    const av = a[f] == null ? null : String(a[f]);
    const bv = b[f] == null ? null : String(b[f]);
    if (av === bv) continue;
    (tradeKnobs.includes(f) ? contrast : differences).push({ field: f, a: av, b: bv });
  }

  if (differences.length > 0) {
    return {
      state: 'ARMS_DIFFER', comparable: false, differences, contrast,
      reason: `the arms differ in ${differences.length} condition(s) beyond the trade knob: `
        + `${differences.map((d) => `${d.field} (${d.a} vs ${d.b})`).join(', ')}. `
        + 'A between-arm delta with a second difference in it is uninterpretable, and with within-arm '
        + 'separability predicted to fail there is no regression left to rescue it.',
    };
  }
  if (contrast.length === 0) {
    return {
      state: 'NO_CONTRAST', comparable: false, differences, contrast,
      reason: `the arms are identical in the trade knob (${tradeKnobs.join(', ')}) as well, so the pair `
        + 'creates no contrast and its delta is zero by construction. This is not a safe pair, it is an empty one.',
    };
  }
  return {
    state: 'ARMS_COMPARABLE', comparable: true, differences, contrast,
    reason: `the arms differ only in the trade knob: ${contrast.map((c) => `${c.field} (${c.a} vs ${c.b})`).join(', ')}`,
  };
}

/**
 * Refusal wrapper for the fire path. Returns the verdict; the caller decides how loudly to die, so
 * this stays testable without spawning a process.
 */
export function assertArmsComparable(a, b, opts) {
  const v = compareArms(a, b, opts);
  return { ...v, shouldRefuse: !v.comparable };
}
