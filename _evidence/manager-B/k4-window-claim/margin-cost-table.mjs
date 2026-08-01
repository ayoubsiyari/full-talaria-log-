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
// Measured, not assumed. The falsifier ran 8 windows in 309 s wall clock end to end, with WINDOW_MS at
// 25000 - so 25 s of measurement plus ~14 s of seek and settle per window, one browser reused. My first
// version of this table guessed 120 s and overstated every row by ~3x, which would have pushed the
// margin ruling toward a looser bar than the evidence requires. The cv above was itself measured on
// 25 s windows, so this is the repeat length the noise floor actually describes.
const SECONDS_PER_REPEAT = 39;
const RESTART_S = 90;          // container restart between flag arms
const FIXED_OVERHEAD_MIN = 5;  // preflight + post-run verification

console.log(`cv = ${(100 * CV).toFixed(1)}%  (measured on an unchanging build across 8 windows)`);
console.log(`repeat = ${SECONDS_PER_REPEAT} s (measured: 309 s wall clock / 8 windows, WINDOW_MS=25000)\n`);
console.log('                    FULL REGIME-01 (4 cells)      ONE REGIME (2 cells)');
console.log('margin  repeats/arm  windows  wall clock          windows  wall clock');
for (const m of [0.02, 0.05, 0.10, 0.15, 0.20]) {
  let n = 2;
  while (2 * CV * Math.sqrt(2 / n) > m) n++;
  const cost = (cells) => (cells * n * SECONDS_PER_REPEAT + 2 * RESTART_S) / 60 + FIXED_OVERHEAD_MIN;
  const full = cost(4), half = cost(2);
  const note = full > 240 ? '  impractical' : full > 90 ? '  expensive' : '';
  console.log(
    `${String((m * 100).toFixed(0) + '%').padStart(5)}  ${String(n).padStart(10)}  `
    + `${String(4 * n).padStart(7)}  ${String(full.toFixed(0) + ' min').padStart(10)}          `
    + `${String(2 * n).padStart(7)}  ${String(half.toFixed(0) + ' min').padStart(10)}${note}`
  );
}
console.log('\nn is floored at 3 by the oracle regardless, because below that the spread cannot be');
console.log('estimated from the run at all.');
console.log('\nRevised recommendation: 5%, not 10%. On the corrected repeat length a 5% margin costs');
console.log('about 55 minutes for a full two-regime A/B rather than the two and a half hours my first');
console.log('table claimed, and that fits an exclusive window. 10% remains the fallback when a fix has');
console.log('to be graded inside a shared slot. I argued for 10% off arithmetic that was wrong by 3x,');
console.log('and the looser bar is exactly the kind of thing that quietly stays looser forever.');
