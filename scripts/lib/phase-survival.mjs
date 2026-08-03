/**
 * PHASE-SURVIVAL-01 — a criterion, not a judgement call, for which published readings survive the
 * discovery that 27 of 37 instruments collect on a live page.
 *
 * I stated the distinction on the board — absolutes are dead, differences within one curve may
 * survive — and "may" is not a standard anyone can apply twice and get the same answer. This turns it
 * into four conditions with an arithmetic test, so the 108.2 MB method gap either stands or does not
 * for a stated reason.
 *
 * THE PHYSICS THIS ENCODES
 * A no-pause reading samples a sawtooth at unknown phase. Its error is not measurement noise, it is
 * an unknown offset of up to the sawtooth amplitude A. For a DIFFERENCE of two such readings the
 * offsets partly cancel — but only if they were drawn from the SAME sawtooth. That requires:
 *
 *   S1  SAME SESSION.       Different sessions have different heaps, datasets and phase histories.
 *   S2  SAME PHASE REGIME.  Both readings taken under the same playback state and speed. A reading
 *                           taken while playing and one taken after a pause are not a matched pair.
 *   S3  ORDERED AND CLOSE.  Both from one monotone curve with no intervening event that changes the
 *                           allocation regime.
 *   S4  SIGNAL EXCEEDS RESIDUAL.  Even after cancellation, a residual remains. The difference must
 *                           be large relative to it or it is not distinguishable from phase.
 *
 * THE RESIDUAL. Two independent draws from the same distribution have a difference whose spread is
 * sqrt(2) times the single-draw spread. Cancellation from shared session and regime is credited
 * conservatively at 50%, so:
 *
 *   residual = A * sqrt(2) * 0.5
 *
 * with A taken from the measured sawtooth amplitude. A difference SURVIVES when |delta| >= 2 * residual.
 * The factor of two is the same discipline as a 2-sigma bar: it is the level at which the claim is
 * not routinely produced by phase alone.
 */

/**
 * Measured sawtooth amplitude on the JS heap, from CONF01-BASELINE-GATE b120 rep 3: the live read
 * caught the trough at 135.27 MB and the read 3 s later caught 318.67 MB, with the isolate count
 * unchanged. That is a single-session, single-configuration lower bound on A.
 */
export const HEAP_SAWTOOTH_AMPLITUDE_MB = 183.4;

/**
 * Amplitude on the process TOTAL, which is what floors are quoted on. From the same five reps: the
 * post-GC totals span 1,052.1 to 1,240.3 MB. This is an upper bound conflating phase with real
 * between-rep variation, and it is used deliberately — the conservative direction for a survival test
 * is to overstate the noise.
 */
export const TOTAL_SAWTOOTH_AMPLITUDE_MB = 188.2;

export const CANCELLATION_CREDIT = 0.5;
export const SURVIVAL_SIGMA = 2;

/**
 * Amplitude is PER QUANTITY, and only two are measured.
 *
 * Phase noise on the JS heap does not automatically propagate to GPU-backed canvas memory: those are
 * different allocators with different lifecycles, and a canvas backing store is not freed by a scavenge.
 * Applying the JS-heap sawtooth to a canvas reclaim would manufacture a red the way using one
 * process's roots against all processes' total manufactured the 59.84% coverage figure. Where the
 * amplitude for a quantity has never been measured, the claim is UNGRADED — which is a different fact
 * from dead, and it names the measurement that would settle it.
 */
export const MEASURED_AMPLITUDES_MB = {
  jsHeap: HEAP_SAWTOOTH_AMPLITUDE_MB,
  total: TOTAL_SAWTOOTH_AMPLITUDE_MB,
};

export function residualMB(amplitudeMB) {
  return +(amplitudeMB * Math.SQRT2 * CANCELLATION_CREDIT).toFixed(1);
}

/**
 * @param {object} o
 * @param {string} o.claim
 * @param {'absolute'|'difference'} o.kind
 * @param {number} o.valueMB          the published figure (for a difference, its magnitude)
 * @param {boolean} o.quiescent       was the page verifiably paused for the reading(s)
 * @param {boolean} [o.sameSession]
 * @param {boolean} [o.samePhaseRegime]
 * @param {boolean} [o.sameCurveOrdered]
 * @param {number}  [o.amplitudeMB]
 */
export function assessSurvival({
  claim, kind, valueMB, quiescent, quantity = 'total',
  sameSession = null, samePhaseRegime = null, sameCurveOrdered = null,
  amplitudeMB = MEASURED_AMPLITUDES_MB[quantity] ?? null,
} = {}) {
  // A quiescent reading was never phase-corrupt; this criterion does not apply to it.
  if (quiescent === true) {
    return { claim, verdict: 'UNAFFECTED', survives: true,
      why: 'taken on a verifiably paused page, so it was never a sawtooth sample' };
  }

  if (amplitudeMB == null) {
    return {
      claim, verdict: 'UNGRADED_AMPLITUDE_UNMEASURED', survives: null, valueMB, quantity,
      why: `the sawtooth amplitude for '${quantity}' has never been measured, and the JS-heap or total `
        + 'amplitude cannot stand in for it — different allocators, different lifecycles. This claim '
        + 'is neither confirmed nor killed.',
      whatWouldSettleIt: `sample '${quantity}' repeatedly within one unpaused session and take the `
        + 'peak-to-trough spread; that is the amplitude, and this criterion then applies unchanged.',
    };
  }

  if (kind === 'absolute') {
    return {
      claim, verdict: 'DEAD_ABSOLUTE', survives: false, valueMB,
      errorBarMB: amplitudeMB,
      why: `an absolute from a non-quiescent instrument is one random-phase sample; its error bar is `
        + `the sawtooth amplitude, +/-${amplitudeMB} MB. Not a measurement — at best an upper bound.`,
    };
  }

  const failed = [];
  if (sameSession !== true) failed.push('S1 same session');
  if (samePhaseRegime !== true) failed.push('S2 same phase regime');
  if (sameCurveOrdered !== true) failed.push('S3 one ordered curve, no intervening regime change');
  if (failed.length) {
    return {
      claim, verdict: 'DEAD_UNMATCHED_PAIR', survives: false, valueMB, failedConditions: failed,
      why: `a difference only cancels phase if both readings came from the same sawtooth. Failed: `
        + `${failed.join('; ')}. Without those, the two offsets are independent and the difference is `
        + 'noisier than either reading, not less noisy.',
    };
  }

  const residual = residualMB(amplitudeMB);
  const threshold = +(residual * SURVIVAL_SIGMA).toFixed(1);
  const survives = Math.abs(valueMB) >= threshold;
  return {
    claim, verdict: survives ? 'SURVIVES' : 'DEAD_BELOW_RESIDUAL', survives, valueMB,
    residualMB: residual, thresholdMB: threshold, amplitudeMB,
    why: survives
      ? `${valueMB} MB is at or above the ${threshold} MB bar (${SURVIVAL_SIGMA} x ${residual} MB `
        + `residual after 50% cancellation on a ${amplitudeMB} MB amplitude), so it is not routinely `
        + 'producible by phase alone'
      : `${valueMB} MB is under the ${threshold} MB bar (${SURVIVAL_SIGMA} x ${residual} MB residual), `
        + 'so phase alone produces a difference this size often enough that the claim is not '
        + 'distinguishable from it. Re-take under quiescence.',
  };
}

/** Sweep a published set and return the roster plus a tally. */
export function sweep(claims = []) {
  const rows = claims.map((c) => ({ ...assessSurvival(c), kind: c.kind }));
  const tally = rows.reduce((m, r) => { m[r.verdict] = (m[r.verdict] || 0) + 1; return m; }, {});
  return { rows, tally, survivors: rows.filter((r) => r.survives).length, dead: rows.filter((r) => !r.survives).length };
}
