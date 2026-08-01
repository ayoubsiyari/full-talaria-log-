/**
 * REGIME-01 now says: both arms measured, one must improve, NEITHER MAY WORSEN.
 *
 * The no-regression half needs a number or it cannot be applied. "Did not worsen" is a claim about a
 * difference, and a difference is only meaningful against the spread of the instrument measuring it. The
 * saturation sweep is an ideal source for that spread: eight windows, one unchanging build, one session,
 * nothing under test, deliberately varied bars and host load. Whatever it scatters by is the floor below
 * which no regression can be seen at all.
 *
 * Prints the arithmetic rather than a conclusion, so the recommended threshold can be argued with.
 */
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('/root/b-tal01891/saturation-falsifier.json', 'utf8'));
const rows = raw.results;

const stats = (xs) => {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, cv: sd / mean, min: Math.min(...xs), max: Math.max(...xs) };
};

const metrics = {
  'blocked ms/s': rows.map((r) => r.blockedMsPerSec),
  'occupancy ms/s': rows.map((r) => r.occupancyMsPerSec),
  'events/s': rows.map((r) => r.eventsPerSec),
  'ms/event': rows.map((r) => r.msPerEvent),
};

console.log('=== spread of an UNCHANGING build across 8 windows (bars 625-6900, load 0.72-11.49) ===');
console.log('metric            n     mean       sd      cv%      min      max   max/min');
for (const [name, xs] of Object.entries(metrics)) {
  const s = stats(xs);
  console.log(`${name.padEnd(16)} ${s.n}  ${s.mean.toFixed(1).padStart(7)}  ${s.sd.toFixed(1).padStart(7)}  `
    + `${(100 * s.cv).toFixed(1).padStart(5)}  ${s.min.toFixed(1).padStart(7)}  ${s.max.toFixed(1).padStart(7)}  `
    + `${(s.max / s.min).toFixed(2)}`);
}

console.log('\n=== smallest difference detectable between two arms, by repeat count ===');
console.log('Two-arm comparison, difference of means. se_diff = sd*sqrt(2/n). Calling a difference real at');
console.log('2*se_diff (~95% for this purpose). Anything smaller is inside the instrument.');
console.log('\n            blocked ms/s                 occupancy ms/s');
console.log(' n/arm    min detectable   as %      min detectable   as %');
const b = stats(metrics['blocked ms/s']);
const o = stats(metrics['occupancy ms/s']);
for (const n of [1, 2, 3, 5, 8]) {
  const db = 2 * b.sd * Math.sqrt(2 / n);
  const dobs = 2 * o.sd * Math.sqrt(2 / n);
  console.log(`   ${String(n).padStart(2)}     ${db.toFixed(1).padStart(9)} ms/s  ${(100 * db / b.mean).toFixed(1).padStart(5)}%    `
    + `${dobs.toFixed(1).padStart(9)} ms/s  ${(100 * dobs / o.mean).toFixed(1).padStart(5)}%`);
}

console.log('\n=== the consequence for REGIME-01 ===');
const n1 = 2 * b.sd * Math.sqrt(2 / 1), n3 = 2 * b.sd * Math.sqrt(2 / 3);
console.log(`At n=1 per arm nothing below ${(100 * n1 / b.mean).toFixed(0)}% is visible, so a single-run`);
console.log(`no-regression check would pass a real regression of up to ${(100 * n1 / b.mean).toFixed(0)}%.`);
console.log(`At n=3 the floor is ${(100 * n3 / b.mean).toFixed(0)}%, which is the cheapest defensible bar.`);
console.log('\nNote the direction of the risk: for the IMPROVEMENT half a noisy instrument makes a fix');
console.log('harder to prove, which is safe. For the NO-REGRESSION half it makes a regression easier to');
console.log('miss, which is not. The clause needs the repeat count more than the improvement half does.');
