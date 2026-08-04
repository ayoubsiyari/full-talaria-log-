import fs from 'node:fs';
import path from 'node:path';

/**
 * COV-01, the four-moment verdict.
 *
 * WHAT WAS ACTUALLY MISSING. The capture has been wired at E's four moments since 08-03 and the basis
 * was corrected the same night, but E's parser consumes ONE file as ONE moment and says so:
 * `AGGREGATION_NOT_IN_E_PARSER`. Nothing anywhere read the four rows together and emitted a pass or a
 * fail, so COV-01 could not have gone green no matter how many soaks ran. The RED row was not waiting
 * on host time. It was waiting on this function.
 *
 * The four moments span TWO processes — the soak takes one arm per invocation and writes
 * `<arm>:start` and `<arm>:end` — so the aggregation reads artifacts off disk rather than holding
 * state in memory. An in-process aggregate could only ever have seen half the set.
 *
 * THE WORST MOMENT IS THE VERDICT, never the mean. Four moments averaging 95% can be 99, 99, 99 and
 * 83, and the 83 is the one where a floor number would be quoted over a sixth of unnamed memory.
 * Averaging is how a coverage figure launders its own worst case.
 */

export const COV01_FLOOR_PCT = 95;
export const COV01_MOMENTS = ['trades:start', 'trades:end', 'zerotrade:start', 'zerotrade:end'];

/** E's artifact contract: `<moment>.detailed-dump.json`, with the moment sanitised for a filename. */
export const momentFileName = (moment) => `${String(moment).replace(/[^\w.@-]+/g, '_')}.detailed-dump.json`;

/**
 * Read whatever four-moment artifacts exist in a dump directory. A moment with no file is reported
 * as absent rather than skipped — the difference between "not measured" and "measured badly" is the
 * whole point, and a loader that silently drops missing files erases it.
 */
export function loadMoments(dumpDir, { expected = COV01_MOMENTS } = {}) {
  return expected.map((moment) => {
    const file = path.join(dumpDir, momentFileName(moment));
    if (!fs.existsSync(file)) return { moment, present: false, why: `no artifact at ${file}` };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const row = parsed.row || {};
      return {
        moment,
        present: true,
        file,
        coveragePct: row.arenaCoveragePct ?? null,
        namedMB: row.arenaNamedTotalMB ?? null,
        totalMB: parsed.totalPrivateMB ?? row.totalPrivateMB ?? null,
        totalBasis: parsed.totalBasis ?? null,
        sizeBasis: row.sizeBasis ?? null,
        processCount: row.processCount ?? null,
        covState: row.covState ?? null,
        captureError: row.captureError ?? null,
        singlePidCoverage: parsed.singlePidCoverage ?? null,
      };
    } catch (e) {
      return { moment, present: false, why: `artifact unreadable: ${String(e?.message || e).slice(0, 120)}` };
    }
  });
}

/**
 * @param {object} o
 * @param {Array} o.moments   records from `loadMoments`, or capture results shaped like them
 * @param {number} [o.floorPct]
 * @param {string[]} [o.expected]
 */
export function assessCov01({ moments = [], floorPct = COV01_FLOOR_PCT, expected = COV01_MOMENTS } = {}) {
  const base = {
    check: 'COV-01',
    floorPct,
    expectedMoments: expected,
    method: 'all-process named roots over all-Chrome private footprint, graded on the worst of four moments',
  };

  const byName = new Map(moments.filter(Boolean).map((m) => [m.moment, m]));
  const missing = expected.filter((m) => !byName.get(m)?.present);
  if (missing.length) {
    return {
      ...base,
      state: 'MOMENTS_MISSING',
      pass: false,
      quotable: false,
      missing,
      present: expected.filter((m) => byName.get(m)?.present),
      why: `${missing.length} of ${expected.length} moments have no artifact (${missing.join(', ')}). `
        + 'COV-01 is unmeasured, which is not the same as failing and is not a pass either.',
    };
  }

  const rows = expected.map((m) => byName.get(m));

  const failed = rows.filter((r) => r.covState === 'CAPTURE_FAILED' || r.captureError);
  if (failed.length) {
    return {
      ...base,
      state: 'CAPTURE_FAILED',
      pass: false,
      quotable: false,
      failedMoments: failed.map((r) => ({ moment: r.moment, error: r.captureError ?? null })),
      why: `${failed.length} moment(s) failed to capture. A failed capture carries a null coverage, and `
        + 'a null must never be read as a zero or averaged away.',
    };
  }

  /**
   * BASIS-GUARD-01, applied where the original error happened. The published 59.84% was one renderer's
   * named roots divided by every Chrome process's memory. Any moment not carrying the corrected
   * all-process basis is refused rather than graded, because the arithmetic would succeed.
   */
  const wrongBasis = rows.filter((r) => r.totalBasis !== 'all-chrome-process-private'
    || !(Number(r.processCount) > 1));
  if (wrongBasis.length) {
    return {
      ...base,
      state: 'BASIS_REJECTED',
      pass: false,
      quotable: false,
      offending: wrongBasis.map((r) => ({
        moment: r.moment, totalBasis: r.totalBasis ?? null, processCount: r.processCount ?? null,
      })),
      why: `${wrongBasis.length} moment(s) do not carry all-process named roots over an all-Chrome total. `
        + 'That is the single-pid basis that produced 59.84%, and it divides one renderer by the whole browser.',
    };
  }

  // `Number(null)` is 0 and 0 is finite, so null must be excluded before the numeric test. This is the
  // same null-as-zero slip that made the capture report full coverage on an empty dump.
  const unreadable = rows.filter((r) => r.coveragePct == null || r.coveragePct === ''
    || !Number.isFinite(Number(r.coveragePct)));
  if (unreadable.length) {
    return {
      ...base,
      state: 'COVERAGE_UNREADABLE',
      pass: false,
      quotable: false,
      offending: unreadable.map((r) => r.moment),
      why: `${unreadable.length} moment(s) carry no coverage figure despite capturing. Unmeasured is not a pass.`,
    };
  }

  const perMoment = rows.map((r) => ({
    moment: r.moment,
    coveragePct: +Number(r.coveragePct).toFixed(2),
    namedMB: r.namedMB ?? null,
    totalMB: r.totalMB ?? null,
    processCount: r.processCount ?? null,
    // Carried so the corrected basis can always be checked against the one it replaced.
    singlePidCoverage: r.singlePidCoverage ?? null,
  }));
  const worst = perMoment.reduce((a, b) => (b.coveragePct < a.coveragePct ? b : a));
  const best = perMoment.reduce((a, b) => (b.coveragePct > a.coveragePct ? b : a));
  const pass = worst.coveragePct >= floorPct;

  return {
    ...base,
    state: pass ? 'COV01_GREEN' : 'COVERAGE_BELOW_FLOOR',
    pass,
    quotable: pass,
    perMoment,
    worstMoment: worst,
    bestMoment: best,
    // Reported because a wide spread across four moments is itself a finding, never as the grade.
    spreadPct: +(best.coveragePct - worst.coveragePct).toFixed(2),
    meanPct: +(perMoment.reduce((s, r) => s + r.coveragePct, 0) / perMoment.length).toFixed(2),
    meanNote: 'recorded, never graded on — four moments averaging above the floor can contain one below it',
    why: pass ? null
      : `the worst of four moments covers ${worst.coveragePct}% against a ${floorPct}% floor `
        + `(${worst.moment}: ${worst.namedMB} MB named of ${worst.totalMB} MB). No floor number may be `
        + 'quoted as covered until every moment clears the floor.',
  };
}
