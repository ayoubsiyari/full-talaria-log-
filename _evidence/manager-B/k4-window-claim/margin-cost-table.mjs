/**
 * The no-regression clause needs a non-inferiority margin: how much drift on the untargeted arm counts
 * as "did not worsen". That is a judgement, not a measurement, so it is the Director's to set — but the
 * choice has a price in repeats, and the price should be visible before the choice is made.
 *
 * A perfectly flat arm certifies when the half-width of the difference interval fits inside the margin:
 *   2 * cv * sqrt(2/n) <= margin
 * Each repeat is a ~120 s measurement window, and each arm needs before and after, in two regimes.
 */
const CV = 0.073;              // measured, blocked ms/s, unchanging build, n=8
const SECONDS_PER_REPEAT = 120;

console.log(`cv = ${(100 * CV).toFixed(1)}%  (measured on an unchanging build across 8 windows)\n`);
console.log('margin   repeats/arm   windows total   wall clock   verdict');
for (const m of [0.02, 0.05, 0.10, 0.15, 0.20]) {
  let n = 2;
  while (2 * CV * Math.sqrt(2 / n) > m) n++;
  const windows = n * 2 * 2;                            // before/after x two regimes
  const mins = (windows * SECONDS_PER_REPEAT) / 60;
  const note = mins > 240 ? 'impractical' : mins > 90 ? 'expensive but possible' : 'cheap';
  console.log(
    `${String((m * 100).toFixed(0) + '%').padStart(5)}   ${String(n).padStart(8)}   `
    + `${String(windows).padStart(13)}   ${String(mins.toFixed(0) + ' min').padStart(10)}   ${note}`
  );
}
console.log('\nn is floored at 3 by the oracle regardless, because below that the spread cannot be');
console.log('estimated from the run at all.');
console.log('\nRecommendation: 10%. It is the widest margin that is still narrower than the 20.6% a');
console.log('single-run check would silently allow, and it fits in a 40-minute slot. A 5% margin needs');
console.log('18 repeats per arm and roughly two and a half hours, which will not survive contact with a');
console.log('release night. Better a 10% bar that is actually run than a 5% bar that gets skipped.');
