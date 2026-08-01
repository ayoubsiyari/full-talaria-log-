/**
 * REGIME-01 oracle.
 *
 *   A fix passes if it moves its declared regime and does not regress the other.
 *   Both arms measured, one must improve, neither may worsen.
 *
 * The no-regression half is the reason this is code rather than a paragraph. "Did not worsen" is a claim
 * about a difference, and a difference only means something against the instrument's spread. Measured on
 * an unchanging build across eight windows: sd is ~7.3% of the mean for blocked ms/s. At n=1 per arm
 * nothing below ~21% is visible, so a single-run no-regression check would wave through a real 20%
 * regression. Derivation: derive-noise-floor.mjs.
 *
 * Note which way the risk runs. A noisy instrument makes an improvement HARDER to prove, which is safe.
 * It makes a regression EASIER to miss, which is not. So the repeat count is load-bearing for the
 * no-regression clause specifically, and the oracle refuses to return a pass without it.
 *
 * Pure function: no page, no host. Feed it numbers from any harness.
 *
 *   verdict(
 *     { zeroTrade: { before: [...], after: [...] }, tradeBearing: { before: [...], after: [...] } },
 *     { declaredRegime: 'zeroTrade', lowerIsBetter: true, minRepeats: 3 }
 *   )
 */

const CV = 0.073;          // measured coefficient of variation, blocked ms/s, unchanging build
const MIN_REPEATS = 3;     // below this the no-regression clause cannot be evaluated
const TOLERANCE = 0.10;    // non-inferiority margin: how much drift counts as "did not worsen".
                           // Director's to set. At cv 7.3% this margin needs n>=5 for a flat arm to
                           // certify; a tighter margin costs more repeats. See the doc for the table.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Smallest difference this instrument can resolve between two arms of n samples each. */
export function detectableDelta(baselineMean, n, cv = CV) {
  return 2 * (cv * baselineMean) * Math.sqrt(2 / n);
}

function compareArm(name, arm, lowerIsBetter, minRepeats, tolerance) {
  if (!arm || !Array.isArray(arm.before) || !Array.isArray(arm.after)) {
    return { name, status: 'NOT MEASURED', detail: 'arm absent - REGIME-01 requires both arms' };
  }
  const n = Math.min(arm.before.length, arm.after.length);
  const mb = mean(arm.before), ma = mean(arm.after);

  // Never let a run claim better precision than the instrument has been shown to have. Three samples
  // that happen to agree closely will understate the spread, and my first version trusted that: it
  // certified a 2.5% change as real because the sd of three tight numbers was 2. The published cv comes
  // from eight windows across varied bars and load, which is a better prior than three points.
  const observed = [sd(arm.before), sd(arm.after)].filter((x) => x != null);
  const sdObs = observed.length ? Math.max(...observed) : 0;
  const sdFloor = CV * mb;
  const sdUsed = Math.max(sdObs, sdFloor);
  const halfWidth = 2 * sdUsed * Math.sqrt(2 / Math.max(1, n));   // ~95% half-width on the difference
  const change = ma - mb;                                          // signed, in metric units
  const worse = lowerIsBetter ? change : -change;                  // positive = worse
  const margin = tolerance * mb;                                   // non-inferiority margin

  // The two halves need opposite tests, which is the thing I had wrong.
  //   IMPROVED    : the whole interval sits on the better side of zero.
  //   REGRESSED   : the whole interval sits on the worse side of zero.
  //   NOT CERTIFIED: we merely FAILED TO DETECT a regression. With a noisy instrument that is nearly
  //                  automatic, so it must not count as "did not worsen". Certifying no-regression is a
  //                  claim of equivalence and needs the upper bound of the change to sit inside the
  //                  margin - which under-powered runs cannot do, correctly.
  let status;
  if (n < minRepeats) status = 'INSUFFICIENT REPEATS';
  else if (worse + halfWidth < 0) status = 'IMPROVED';
  else if (worse - halfWidth > 0) status = 'REGRESSED';
  else if (worse + halfWidth <= margin) status = 'NO-REGRESSION CERTIFIED';
  else status = 'NOT CERTIFIED';

  return {
    name, status, n,
    beforeMean: +mb.toFixed(1), afterMean: +ma.toFixed(1),
    change: +change.toFixed(1),
    changePct: +(100 * change / mb).toFixed(1),
    worstCase: +(worse + halfWidth).toFixed(1),
    marginAllowed: +margin.toFixed(1),
    halfWidth: +halfWidth.toFixed(1),
    sdUsed: +sdUsed.toFixed(1),
    sdSource: sdObs > sdFloor ? 'observed in this run' : 'floor: published cv 7.3%',
  };
}

export function verdict(arms, opts = {}) {
  const lowerIsBetter = opts.lowerIsBetter !== false;
  const minRepeats = opts.minRepeats ?? MIN_REPEATS;
  const tolerance = opts.tolerance ?? TOLERANCE;
  const declared = opts.declaredRegime || null;

  const results = {
    zeroTrade: compareArm('zeroTrade (LAG-ZT)', arms.zeroTrade, lowerIsBetter, minRepeats, tolerance),
    tradeBearing: compareArm('tradeBearing', arms.tradeBearing, lowerIsBetter, minRepeats, tolerance),
  };
  const all = Object.values(results);

  const notMeasured = all.filter((r) => r.status === 'NOT MEASURED');
  const underpowered = all.filter((r) => r.status === 'INSUFFICIENT REPEATS');
  const regressed = all.filter((r) => r.status === 'REGRESSED');
  const uncertified = all.filter((r) => r.status === 'NOT CERTIFIED');
  const improved = all.filter((r) => r.status === 'IMPROVED');

  let pass = false, reason;
  if (notMeasured.length) {
    reason = `both arms must be measured; missing: ${notMeasured.map((r) => r.name).join(', ')}`;
  } else if (underpowered.length) {
    reason = `n<${minRepeats} on ${underpowered.map((r) => r.name).join(', ')}: `
      + 'the no-regression clause cannot be evaluated, and a run that cannot see a regression is not '
      + 'evidence that there is none';
  } else if (regressed.length) {
    reason = `REGRESSION in ${regressed.map((r) => `${r.name} (${r.changePct > 0 ? '+' : ''}${r.changePct}%)`).join(', ')}`;
  } else if (!improved.length) {
    reason = 'no arm improved beyond the detectable delta';
  } else if (declared && results[declared] && results[declared].status !== 'IMPROVED') {
    reason = `the declared regime (${declared}) did not improve; another arm did, `
      + 'so the fix may not be doing what it claims';
  } else if (uncertified.length) {
    reason = `${improved.map((r) => r.name).join(' and ')} improved, but no-regression is NOT CERTIFIED on `
      + `${uncertified.map((r) => `${r.name} (worst case ${r.worstCase > 0 ? '+' : ''}${r.worstCase} `
        + `against a ${r.marginAllowed} margin)`).join(', ')}: failing to detect a regression is not the `
      + 'same as showing there is none. Add repeats.';
  } else {
    pass = true;
    reason = `${improved.map((r) => r.name).join(' and ')} improved, and no-regression is certified on the rest`;
  }
  return { pass, reason, results, minRepeats, tolerance, lowerIsBetter };
}

export function printVerdict(v, label = '') {
  const L = [];
  L.push(`--------- REGIME-01 ORACLE ${label} ---------`);
  for (const r of Object.values(v.results)) {
    if (r.status === 'NOT MEASURED') { L.push(`${r.name.padEnd(20)} ${r.status}  <- ${r.detail}`); continue; }
    L.push(`${r.name.padEnd(20)} ${r.status.padEnd(23)} `
      + `${r.beforeMean} -> ${r.afterMean} (${r.change > 0 ? '+' : ''}${r.changePct}%)  n=${r.n}  `
      + `worst case ${r.worstCase > 0 ? '+' : ''}${r.worstCase} vs margin ${r.marginAllowed} `
      + `[+/-${r.halfWidth}, sd ${r.sdUsed} ${r.sdSource}]`);
  }
  L.push(`VERDICT: ${v.pass ? 'PASS' : 'FAIL'} - ${v.reason}`);
  L.push('NOTE: a passing fix does not close a defect. LAG-ZT and the trade-heavy row close only when');
  L.push('      every declared regime meets its bar, whichever fix got it there.');
  L.push('-'.repeat(52));
  const out = L.join('\n');
  console.log(out);
  return out;
}
