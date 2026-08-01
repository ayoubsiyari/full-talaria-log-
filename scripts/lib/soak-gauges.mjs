/**
 * The two decision functions of the sealed soak's memory and lag gauges.
 *
 * They live here rather than inside sealed-two-arm-soak.mjs for one reason: that script executes its run on
 * import, so a self-test importing it would fire a ten-hour soak. Splitting them means the self-test can
 * exercise THE CODE THE LOOP CALLS instead of a restatement of it.
 *
 * That distinction is the point. The 09:35 ruling names four unwired-fix instances, and the fourth is an
 * oracle that passed against a model of the code rather than the code, so it would have gone green whatever
 * shipped. A test that re-implements the rule it is checking has the same defect.
 */

/**
 * LEVEL and SLOPE, kept apart, with field names that say which is which.
 *
 * The trap: total-footprint-over-bars is a LEVEL. It carries the ~1.1 GB fixed baseline, so it reads around
 * 196 where the published SLOPES read 23.98 (zero-trade), 24.55 (with trades) and 25.35 (soak segment 1) -
 * the same unit, eight times the value - and it FALLS as bars accumulate. Published under the slope's name
 * it would have shown an eight-fold regression that then appeared to steadily cure itself.
 */
export function perBarFields(footprintTotalMB, residentBars, prevSample) {
  const level = footprintTotalMB != null && residentBars > 0
    ? +((footprintTotalMB / residentBars) * 1000).toFixed(2)
    : null;
  let slope = null;
  if (footprintTotalMB != null && prevSample) {
    const dB = residentBars - prevSample.bars;
    // Bars must move meaningfully, or the ratio is noise divided by a rounding error.
    if (dB >= 200) slope = +(((footprintTotalMB - prevSample.mb) / dB) * 1000).toFixed(2);
  }
  return { footprintPerKbarLEVEL: level, localSlopeMbPerKbar: slope };
}

/**
 * The gauge guard. A gauge that silently stops reading is worse than one that never existed, because the
 * artifact still looks like a measurement: ten hours of nulls reads as a completed run. One miss is
 * tolerated (a single failed process read is not a broken gauge); two consecutive stops the run.
 */
export function evaluateGauges(misses, footprint, blocking) {
  const next = {
    footprint: footprint.footprintTotalMB == null ? misses.footprint + 1 : 0,
    blocking: blocking.blockingMsPerSec == null ? misses.blocking + 1 : 0,
  };
  const stop = next.footprint >= 2 || next.blocking >= 2;
  return {
    misses: next,
    stop,
    why: stop
      ? `Gauge failure: ${next.footprint >= 2 ? 'footprint' : 'blocking'} returned null on two consecutive samples`
        + `${footprint.footprintReadFailed ? ` (${footprint.footprintReadFailed})` : ''}${blocking.blockingNote ? ` (${blocking.blockingNote})` : ''}.`
        + ' Stopping rather than filling ten hours with a column of nulls that reads as a completed run.'
      : null,
  };
}
