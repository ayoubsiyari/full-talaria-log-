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
export function compareArms(a, b, {
  tradeKnobs = TRADE_KNOBS,
  notConditions = NOT_CONDITIONS,
  durationField = 'hours',
  /**
   * MATCHED-WINDOW RECONCILIATION, ruled 2026-08-03 19:10+01:00.
   *
   * The arms are 10 h and 3.5 h. Rather than spend 6.5 more hours of exclusive host window making
   * them equal, the between-arm delta is taken over the first N hours of BOTH arms — both are
   * measured from boot, so the windows are directly comparable.
   *
   * This does not WAIVE the duration difference, it NARROWS THE CLAIM: the trade arm still certifies
   * the full ten hours, and the attribution is stated over the declared window only. A waiver would
   * let someone difference hour nine of one arm against nothing; declaring the window means the
   * artifact records the narrower claim and the analysis cannot quietly use the full run.
   *
   * Undeclared, a duration difference is still a confound and still refuses.
   */
  comparisonWindowHours = null,
  /**
   * PO RULING, option (b), 2026-08-03 22:46+01:00. The matched window is not merely *a* reconciliation
   * that may be declared — it is THE passing condition for a duration-mismatched pair:
   *
   *   - the 3.5 h control is RETAINED (no 6.5 h of extra host window is bought);
   *   - attribution compares the matched FIRST 3.5 h OF BOTH ARMS, measured FROM BOOT;
   *   - the trade arm still CERTIFIES its full 10 h, as a separate claim over a separate span.
   *
   * Two things that were previously unchecked and are now conditions, because each would satisfy the
   * old code while violating the ruling:
   *
   *   1. Any window shorter than the control passed. A 1 h window against a 3.5 h control is not the
   *      ruled comparison — it silently narrows attribution below what was approved. The window must
   *      BE the shorter arm, not merely fit inside it.
   *   2. The window origin was never stated. "The first 3.5 h of both arms" is only meaningful from a
   *      common origin; the same 3.5 h taken from hour 6 of one arm and hour 0 of the other is a
   *      different experiment wearing the same number.
   */
  windowOrigin = 'boot',
  windowMatchToleranceHours = 0.01,
} = {}) {
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

  // Duration, reconciled by a declared window rather than waived.
  let window = null;
  const durationDiff = differences.find((d) => d.field === durationField);
  if (durationDiff && comparisonWindowHours != null) {
    const win = Number(comparisonWindowHours);
    const shortest = Math.min(Number(durationDiff.a), Number(durationDiff.b));
    if (!Number.isFinite(win) || win <= 0) {
      return { state: 'ARMS_WINDOW_UNSATISFIABLE', comparable: false, differences, contrast, window: { declared: comparisonWindowHours },
        reason: `the declared comparison window (${comparisonWindowHours}) is not a positive number of hours` };
    }
    if (win > shortest) {
      // Declaring a window longer than the shorter arm is a claim about data that does not exist.
      return { state: 'ARMS_WINDOW_UNSATISFIABLE', comparable: false, differences, contrast,
        window: { declaredHours: win, shortestArmHours: shortest },
        reason: `the declared comparison window is ${win} h but the shorter arm runs only ${shortest} h. `
          + 'A window that does not fit inside both arms differences real samples against absent ones.' };
    }
    if (windowOrigin !== 'boot') {
      return { state: 'ARMS_WINDOW_ORIGIN_INVALID', comparable: false, differences, contrast,
        window: { declaredHours: win, origin: windowOrigin },
        reason: `the comparison window is declared from '${windowOrigin}', but the ruling is the first `
          + `${win} h of BOTH arms measured FROM BOOT. The same span taken from different origins in `
          + 'the two arms is a different experiment wearing the same number.' };
    }
    if (Math.abs(win - shortest) > Number(windowMatchToleranceHours)) {
      return { state: 'ARMS_WINDOW_NOT_MATCHED', comparable: false, differences, contrast,
        window: { declaredHours: win, shortestArmHours: shortest },
        reason: `the declared window is ${win} h but the control arm runs ${shortest} h. The ruled `
          + 'comparison is the matched window — the window must BE the shorter arm, not merely fit '
          + 'inside it. A shorter window silently narrows the attribution below what was approved.' };
    }
    window = {
      declaredHours: win,
      shortestArmHours: shortest,
      reconciles: durationField,
      origin: windowOrigin,
      matchedToControl: true,
    };
    // Reconciled: remove it from the confound list, and say so in the state below.
    differences.splice(differences.indexOf(durationDiff), 1);
  }

  if (differences.length > 0) {
    return {
      state: 'ARMS_DIFFER', comparable: false, differences, contrast, window,
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
  const contrastText = contrast.map((c) => `${c.field} (${c.a} vs ${c.b})`).join(', ');
  if (window) {
    const longest = Math.max(Number(a[durationField]), Number(b[durationField]));
    return {
      state: 'ARMS_COMPARABLE_IN_WINDOW', comparable: true, differences, contrast, window,
      /**
       * The two claims are recorded separately, because they are different claims over different
       * spans and collapsing them is how the full run gets quietly differenced.
       */
      claims: {
        attribution: {
          spanHours: window.declaredHours,
          from: window.origin,
          arms: 'both',
          what: 'the between-arm delta, valid over the matched window ONLY',
        },
        certification: {
          spanHours: longest,
          from: window.origin,
          arms: 'the longer arm alone',
          what: 'single-arm certification over the full duration; NOT differenceable against the control',
        },
      },
      reason: `the arms differ only in the trade knob [${contrastText}] once ${durationField} is reconciled by the `
        + `matched ${window.declaredHours} h window from ${window.origin}, which is the full control arm. `
        + `Attribution is the between-arm delta over that window ONLY; the ${longest} h arm still certifies `
        + 'its full duration as a separate single-arm claim, and nothing outside the window may be differenced.',
    };
  }
  return {
    state: 'ARMS_COMPARABLE', comparable: true, differences, contrast, window: null,
    reason: `the arms differ only in the trade knob: ${contrastText}`,
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
