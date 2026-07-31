/**
 * ARTIFACT-CONTRACT — the two publishing disciplines RESET-01 made mandatory, enforced in code.
 *
 * Both exist because of failures on the single most consequential claim of 31 July:
 *
 *   1. `bfcacheState` is now a REQUIRED field on every harness artifact, exactly like a build stamp. An
 *      undeclared back-forward cache turned a browser feature into a leak on paper, twice.
 *   2. The signature must match the filename. A stale output path in a shell made one run overwrite
 *      another run's artifact, and the destroyed file kept a name that promised different contents. A
 *      finding was published whose evidence, on disk, was a different instrument's payload.
 *
 * These are checks, not conventions, because a convention is what failed.
 */

/** Normalise for comparison: letters only, version suffix dropped. */
const key = (s) => String(s || '').replace(/-V\d+(-.*)?$/i, '').replace(/[^A-Za-z]/g, '').toUpperCase();

/**
 * Verify an artifact is safe to publish. Returns { ok, problems[] } and never throws, so a contract
 * failure cannot itself void a completed measurement — it reports and lets the caller decide.
 */
export function checkArtifactContract(report, outPath, { requireBfcache = true } = {}) {
  const problems = [];
  const file = String(outPath || '').split(/[\\/]/).pop() || '';
  const stem = file.replace(/\.json$/i, '').replace(/-2026\d{4}(-\d{4})?.*$/, '');

  if (!report || typeof report !== 'object') {
    return { ok: false, problems: ['report is not an object'] };
  }
  if (!report.signature) {
    problems.push('missing `signature` field, so no artifact can be matched to the instrument that wrote it');
  } else {
    // Filenames legitimately carry an arm or variant the signature does not (RETURN-AXIS-PROBE-V1 writing
    // RETURN-AXIS-DEFAULT-*.json), so require a shared leading token pair rather than containment. What
    // must be impossible is a MONOTONIC-BARS-GATE payload sitting in a SESSION-RESET file.
    const tokens = (s) => String(s).replace(/\.json$/i, '').replace(/-V\d+$/i, '').split('-').filter(Boolean);
    const sigHead = tokens(report.signature).slice(0, 2).join('').toUpperCase();
    const fileHead = tokens(stem || file).slice(0, 2).join('').toUpperCase();
    if (sigHead && fileHead && sigHead !== fileHead) {
      problems.push(`signature ${report.signature} does not correspond to filename ${file} — this is the shape that let one run's payload sit in another run's file`);
    }
  }
  if (requireBfcache && (report.bfcacheState == null || report.bfcacheState === '')) {
    problems.push('missing `bfcacheState`, which RESET-01 made a required field on every harness artifact');
  }
  // MEAS-01 asks for the build read off the page, not for a particular field name. Instruments record it
  // in several places and a check that only knows one of them produces false alarms — and an audit that
  // cries wolf is an audit nobody reads, which is how the original discipline lapsed.
  const anyRow = (arr, fn) => Array.isArray(arr) && arr.some(fn);
  const rowStamp = (r) => r?.buildStamp || r?.build || r?.conf01?.buildId;
  const stampFound = report.buildStamp
    || report.buildId
    || report.build
    || report.conf01?.buildId
    || report.conf01?.buildStamp
    // An offline analysis inherits the stamp of the artifact it read, provided it says which.
    || report.sourceArtifactBuildStamp
    || anyRow(report.points, rowStamp)
    || anyRow(report.pointSummaries, rowStamp)
    || anyRow(report.scenarios, rowStamp)
    || anyRow(report.sessions, rowStamp)
    || anyRow(report.samples, rowStamp)
    || anyRow(report.exits, (e) => rowStamp(e?.heavyState) || rowStamp(e?.reEntryFirstPaint));
  // Analyses and validations that never load the product page cannot stamp a product build. They must say
  // so in `buildStampNotApplicable` rather than simply omitting it.
  const exempt = /scan|correlation|regrade|read|manifest|queue|curve|validation/i.test(String(report.signature || ''))
    || report.buildStampNotApplicable;
  if (!stampFound && !exempt) {
    problems.push('no build stamp found in `buildStamp`, `build`, `buildId`, `conf01.buildId`, or per-point/per-sample rows; MEAS-01 requires the build read off the page');
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Write an artifact only after checking it, and record the check inside the artifact itself so a reader
 * can see the contract was applied rather than trusting that it was.
 */
export function writeCheckedArtifact(fs, outPath, report, opts = {}) {
  const check = checkArtifactContract(report, outPath, opts);
  const stamped = { ...report, artifactContract: { ...check, checkedAtIso: new Date().toISOString(), file: String(outPath).split(/[\\/]/).pop() } };
  fs.writeFileSync(outPath, JSON.stringify(stamped, null, 1));
  if (!check.ok) {
    for (const p of check.problems) console.error(`[artifact-contract] ${p}`);
  }
  return check;
}
