/**
 * SETTLE-CRITERION-V2 — "settled" as a testable criterion rather than a word.
 *
 * WHY THIS EXISTS
 * `gradeSettle()` in settle-protocol.mjs grades the PROCEDURE: did you wait long enough, did forced
 * collection run. Both can be true of a reading that is not settled, and both were true of readings
 * we published. The b120 baseline gate took `collectGarbage` plus a 3-second sleep for settled and
 * produced a 135 MB spread across five reps of one configuration. Procedure compliance is not
 * quiescence.
 *
 * THE CRITERION. Four conditions, all required.
 *
 *   Q — QUIESCENT.  Playback is stopped and verified stopped before the collection. Without this the
 *       other three conditions measure the phase of a running sawtooth, not a floor. This is the
 *       condition the old protocol never had: 4 of ~30 forced-GC instruments pause; the rest collect
 *       on a live, streaming, allocating page.
 *
 *   C — COLLECTION EFFECTIVE.  Forced collection ran AND the JS heap did not RISE across it. A heap
 *       that is larger after collection than before means the sample landed in re-allocation, so the
 *       reading post-dates the collection but does not reflect it.
 *
 *   F — FLAT.  A CURVE of at least MIN_READS reads at rungs of at least RUNG_MIN_MS, whose last
 *       interval moves no more than EPS_RUNG_MB. One reading is not a curve and can never be settled:
 *       a single point cannot show you that it has stopped moving.
 *
 *   M — NOT RISING.  No interval in the tail window rises by more than EPS_RISE_MB. A curve that
 *       descends and then lifts is not settled at its lowest point; it is doing something else.
 *
 * Replication is graded separately and is advisory: one rep cannot self-certify, and the b120 spread
 * is what an unreplicated claim looks like when it is finally replicated.
 *
 * Thresholds are calibrated against readings we already have graded by hand: the b126 canonical floor
 * passed with a last interval of 1.3 MB, and the boot curve was failed for rising 6.5 MB mid-settle.
 */

/** A rung shorter than this cannot demonstrate flatness; the allocator decommits lazily. */
export const RUNG_MIN_MS = 600_000;
/** Fewer reads than this is not a curve. Three reads give two intervals: one to fall, one to be flat. */
export const MIN_READS = 3;
/** Last-interval movement allowed. The b126 floor passed at 1.3 MB. */
export const EPS_RUNG_MB = 2.0;
/** Any tail rise above this fails. The boot curve was failed by hand at 6.5 MB. */
export const EPS_RISE_MB = 1.0;
/** Cross-rep spread above this is reported as unreplicated, not as settled. */
export const EPS_SPREAD_MB = 6.0;

const round = (v) => (v == null ? null : +Number(v).toFixed(1));

/**
 * @param {object} o
 * @param {number[]} o.reads            footprint (or heap) readings in order, one per rung
 * @param {number} o.rungMs             the settle interval between consecutive reads
 * @param {boolean|null} o.quiescent    playback verified stopped before collection
 * @param {boolean|null} o.forcedGcOk   forced collection ran
 * @param {number|null} o.heapBeforeGcMB
 * @param {number|null} o.heapAfterGcMB
 */
export function assessSettled({
  reads = [], rungMs = null, quiescent = null, forcedGcOk = null,
  heapBeforeGcMB = null, heapAfterGcMB = null, label = 'reading',
} = {}) {
  const failures = [];
  const series = (reads || []).filter((v) => Number.isFinite(v));

  // --- Q ---
  if (quiescent !== true) {
    failures.push({
      condition: 'Q',
      state: quiescent === false ? 'NOT_QUIESCENT' : 'QUIESCENCE_UNKNOWN',
      why: quiescent === false
        ? 'playback was running during the collection, so this samples the phase of a sawtooth, not a floor'
        : 'the instrument did not record whether playback was stopped; absence of the field is not a pass',
    });
  }

  // --- C ---
  if (forcedGcOk !== true) {
    failures.push({ condition: 'C', state: 'NO_FORCED_COLLECTION',
      why: 'no forced collection ran, and pause alone has been shown to release nothing' });
  } else if (heapBeforeGcMB != null && heapAfterGcMB != null && (heapAfterGcMB - heapBeforeGcMB) > 0) {
    failures.push({ condition: 'C', state: 'COLLECTION_INEFFECTIVE_OR_RESAMPLED',
      why: `the JS heap rose ${round(heapAfterGcMB - heapBeforeGcMB)} MB across the collection `
        + '(before ' + round(heapBeforeGcMB) + ' MB, after ' + round(heapAfterGcMB) + ' MB), so the '
        + 'sample landed in re-allocation: it post-dates the collection without reflecting it' });
  }

  // --- F ---
  let lastIntervalMB = null;
  if (series.length < MIN_READS) {
    failures.push({ condition: 'F', state: 'NO_CURVE',
      why: `${series.length} reading(s) is not a curve; a single point cannot show that it has stopped `
        + 'moving, so it can never be graded settled however long the sleep before it was' });
  } else if (!(Number(rungMs) >= RUNG_MIN_MS)) {
    failures.push({ condition: 'F', state: 'RUNG_TOO_SHORT',
      why: `rungs of ${rungMs == null ? 'unrecorded' : Math.round(Number(rungMs) / 1000) + ' s'} are `
        + `under the ${RUNG_MIN_MS / 1000} s minimum; the allocator decommits lazily and a short rung `
        + 'reads flat because nothing has had time to move' });
  } else {
    lastIntervalMB = round(series[series.length - 1] - series[series.length - 2]);
    if (Math.abs(lastIntervalMB) > EPS_RUNG_MB) {
      failures.push({ condition: 'F', state: 'STILL_MOVING',
        why: `the last interval moved ${lastIntervalMB} MB, over the ${EPS_RUNG_MB} MB flatness bound` });
    }
  }

  // --- M --- evaluated whenever there are intervals at all, independent of rung length: a rise is a
  // rise, and it is a different finding from a curve that is merely still descending.
  let maxRiseMB = null;
  if (series.length >= 2) {
    const intervals = series.slice(1).map((v, i) => v - series[i]);
    maxRiseMB = round(Math.max(...intervals));
    if (maxRiseMB > EPS_RISE_MB) {
      failures.push({ condition: 'M', state: 'RISING',
        why: `the curve rose ${maxRiseMB} MB mid-settle, over the ${EPS_RISE_MB} MB bound; a curve that `
          + 'lifts is not settled at its lowest point' });
    }
  }

  // Whether condition C's across-collection heap check actually ran. An instrument that reads
  // footprint but not per-isolate heap cannot detect the re-allocation sample, and saying so is
  // different from passing.
  const heapCheck = (heapBeforeGcMB != null && heapAfterGcMB != null) ? 'MEASURED' : 'NOT_MEASURED';

  const settled = failures.length === 0;
  return {
    criterion: 'SETTLE-CRITERION-V2',
    label,
    settled,
    heapCheck,
    // Distinct states, not one collapsed RED: a missing curve, a live page and an ineffective
    // collection are three different defects with three different fixes.
    state: settled ? 'SETTLED' : failures.map((f) => f.state).join('+'),
    failedConditions: failures.map((f) => f.condition),
    failures,
    lastIntervalMB,
    maxRiseMB,
    readCount: series.length,
    rungMs: rungMs ?? null,
    why: settled
      ? `quiescent, collection effective, ${series.length} reads at ${Math.round(Number(rungMs) / 1000)} s `
        + `rungs, last interval ${lastIntervalMB} MB, no rise above ${EPS_RISE_MB} MB`
      : failures.map((f) => `[${f.condition}] ${f.why}`).join(' | '),
  };
}

/**
 * Replication is a separate question from settledness and is graded separately: five reps of one
 * configuration spanning 135 MB is the shape of a claim that was never replicated until it was.
 */
export function assessReplication(values = [], { epsMB = EPS_SPREAD_MB } = {}) {
  const v = (values || []).filter((x) => Number.isFinite(x));
  if (v.length < 2) {
    return { replicated: null, state: 'UNREPLICATED_SINGLE_REP', spreadMB: null, reps: v.length,
      why: 'one rep cannot self-certify; the spread is unmeasured, not zero' };
  }
  const spread = round(Math.max(...v) - Math.min(...v));
  const ok = spread <= epsMB;
  return {
    replicated: ok, reps: v.length, spreadMB: spread, epsMB,
    state: ok ? 'REPLICATED' : 'SPREAD_EXCEEDS_BOUND',
    why: ok ? `${v.length} reps spread ${spread} MB, within ${epsMB} MB`
      : `${v.length} reps spread ${spread} MB, over the ${epsMB} MB bound; the number carries an `
        + 'uncertainty larger than most of the fixes being argued about',
  };
}
