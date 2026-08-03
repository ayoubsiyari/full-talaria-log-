/**
 * COV-01-VALIDITY — is this memory number quotable at all?
 *
 * Ruled 2026-08-03 16:26+01:00: **the authoritative memory number is not quotable without ≥95% named
 * coverage.** Coverage has been measured since ARENA-COLUMNS landed — every row already carries
 * `arenaCoveragePct` and `arenaCoverageMeets95` — but nothing consumed it, so a number with 55%
 * coverage published exactly like a number with 99%. Measuring a validity condition and then not
 * binding it to the thing it validates is the defect SEAL-EVIDENCE-01 was written for, sitting in my
 * own lane.
 *
 * What coverage means here: the fraction of total private memory that lands in a NAMED allocator
 * row. At 55% coverage, nearly half the number being quoted is a quantity nobody can attribute, so
 * "the floor moved 40 MB" cannot be distinguished from "the unattributed remainder moved 40 MB".
 * The number may still be perfectly correct — it is the *explanation* that is missing, and a floor
 * is quoted to explain.
 *
 * Deliberately NOT a boolean. A caller has to be able to tell "coverage is 55%" from "coverage could
 * not be computed", because the second is a broken instrument and the first is a known gap, and
 * collapsing them is how a broken instrument gets read as a product finding.
 */

/** The ruled threshold. One place, so it cannot drift between instruments. */
export const COV01_MIN_PCT = 95;

/**
 * @param {object} o
 * @param {number|null|undefined} o.coveragePct       named/total * 100, or null if not computable
 * @param {boolean} [o.hasTotalRow]                   TOTAL-01: a delta without its total is not quotable
 * @param {number|null} [o.unattributedMB]            the remainder, for the message
 * @param {string} [o.what]                           what is being judged, for the message
 * @returns {{state:string, quotable:boolean, coveragePct:number|null, reason:string, threshold:number}}
 */
export function assessQuotability({ coveragePct, hasTotalRow = true, unattributedMB = null, what = 'this memory number' } = {}) {
  const base = { coveragePct: coveragePct ?? null, threshold: COV01_MIN_PCT };

  if (!hasTotalRow) {
    // TOTAL-01 first: without a total there is no denominator, so coverage cannot even be judged.
    return { ...base, state: 'NOT_QUOTABLE_NO_TOTAL', quotable: false,
      reason: `TOTAL-01: ${what} has no total row, so there is no denominator and coverage cannot be judged` };
  }
  if (coveragePct == null || !Number.isFinite(coveragePct)) {
    return { ...base, state: 'COVERAGE_UNKNOWN', quotable: false,
      reason: `COV-01: coverage could not be computed for ${what}. This is a broken or unbound instrument, `
        + 'NOT a low-coverage reading, and must not be reported as one' };
  }
  if (coveragePct < COV01_MIN_PCT) {
    const remainder = unattributedMB == null ? '' : ` ${unattributedMB} MB sits in the unattributed remainder.`;
    return { ...base, state: 'NOT_QUOTABLE_COVERAGE', quotable: false,
      reason: `COV-01: ${what} attributes ${coveragePct}% of total private memory to named rows, below the `
        + `${COV01_MIN_PCT}% required to quote it.${remainder} The number may be correct; the explanation is missing, `
        + 'and a floor is quoted to explain' };
  }
  return { ...base, state: 'QUOTABLE', quotable: true,
    reason: `COV-01: ${coveragePct}% named coverage, at or above the ${COV01_MIN_PCT}% threshold` };
}

/**
 * Stamp a verdict object with its validity, so an artifact carries the judgement rather than leaving
 * every reader to re-derive it — and so a reader who does not know COV-01 exists still sees it.
 */
export function withValidity(verdict, args) {
  const validity = assessQuotability(args);
  return { ...verdict, cov01: validity, quotable: validity.quotable };
}
