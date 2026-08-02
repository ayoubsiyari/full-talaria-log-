/**
 * Self-test for the EXHAUSTION-PROBE graders.
 *
 * Both verdicts feed a decision about whether the ten-hour soak is meaningful, so the cases that matter
 * are the ones where a lazy grader would agree with the hypothesis it is testing: a fetch-forward session
 * must NOT read as exhausted, and a floor that rises while bars are still being delivered must NOT read as
 * "the floor rises with zero bars".
 */

process.argv.push('--noRun');
const { gradeExhaustion, gradeZeroDeliveryFloor } = await import('./exhaustion-probe.mjs');

let pass = 0; let fail = 0;
const check = (name, got, want) => {
  if (got === want) { pass++; console.log(`  PASS  ${name}  -> ${got}`); }
  else { fail++; console.log(`  FAIL  ${name}  -> got ${got}, want ${want}`); }
};

const mk = (rows) => rows.map((panels, i) => ({ atMs: 1000 + i * 15000, panels }));
const P = (playhead, masterLen, realm = 'host', tf = '1m') => ({ realm, tf, playhead, masterLen });

console.log('EXHAUSTION-PROBE grader self-test\n');

// Playhead climbs and pins at the end of a master that never grows.
check('pinned playhead on a static master reads EXHAUSTED',
  gradeExhaustion(mk([[P(100, 4000)], [P(2000, 4000)], [P(3999, 4000)], [P(3999, 4000)], [P(3999, 4000)], [P(3999, 4000)]]), { pinSamples: 4 }).state,
  'EXHAUSTED');

// The master grows to stay ahead: this is a healthy session and must not be called exhausted.
check('growing master ahead of the playhead reads FETCH_FORWARD',
  gradeExhaustion(mk([[P(100, 2000)], [P(900, 3000)], [P(1800, 4200)], [P(2700, 5500)], [P(3600, 6800)]]), { pinSamples: 4 }).state,
  'FETCH_FORWARD');

check('still climbing, never pinned, reads STILL_RUNNING',
  gradeExhaustion(mk([[P(100, 9000)], [P(900, 9000)], [P(1800, 9000)], [P(2700, 9000)]]), { pinSamples: 4 }).state,
  'STILL_RUNNING');

check('one panel pinned of two reads PARTIALLY_EXHAUSTED',
  gradeExhaustion(mk([
    [P(3999, 4000), P(100, 9000, 'frame0', '5m')],
    [P(3999, 4000), P(900, 9000, 'frame0', '5m')],
    [P(3999, 4000), P(1800, 9000, 'frame0', '5m')],
    [P(3999, 4000), P(2700, 9000, 'frame0', '5m')],
  ]), { pinSamples: 4 }).state,
  'PARTIALLY_EXHAUSTED');

check('a brief pin that resumes does not count',
  gradeExhaustion(mk([[P(3999, 4000)], [P(3999, 4000)], [P(4100, 6000)], [P(5000, 6000)]]), { pinSamples: 4 }).state,
  'FETCH_FORWARD');

{
  const g = gradeExhaustion(mk([[P(100, 4000)], [P(2000, 4000)], [P(3999, 4000)], [P(3999, 4000)], [P(3999, 4000)], [P(3999, 4000)]]), { pinSamples: 4 });
  check('bars delivered counted, index re-base not counted as negative', g.perPanel.host.barsDelivered, 3899);
  check('minutes-to-pin reported', typeof g.perPanel.host.minutesToPin, 'number');
}

// ---- phase B
const pt = (i, minutes, floorMB, barsSinceLast = 0) => ({ i, minutes, floorMB, barsSinceLast });

check('flat collected floor with zero delivery reads NO_RISE_DETECTED',
  gradeZeroDeliveryFloor([pt(0, 0, 700), pt(1, 2, 701), pt(2, 4, 699.5), pt(3, 6, 700.5), pt(4, 8, 700)]).verdict,
  'NO_RISE_DETECTED');

check('a real rise with zero delivery is reported as such',
  gradeZeroDeliveryFloor([pt(0, 0, 700), pt(1, 2, 715), pt(2, 4, 731), pt(3, 6, 744), pt(4, 8, 760)]).verdict,
  'FLOOR_RISES_WITH_ZERO_BARS');

check('BARS STILL FLOWING must VOID, not confirm',
  gradeZeroDeliveryFloor([pt(0, 0, 700), pt(1, 2, 715, 120), pt(2, 4, 731, 120), pt(3, 6, 744, 120), pt(4, 8, 760, 120)]).verdict,
  'VOID');

check('too few points reads INSUFFICIENT',
  gradeZeroDeliveryFloor([pt(0, 0, 700), pt(1, 2, 715)]).verdict, 'INSUFFICIENT');

check('a small drift under the MB floor is not called a rise',
  gradeZeroDeliveryFloor([pt(0, 0, 700), pt(1, 2, 701), pt(2, 4, 702), pt(3, 6, 703), pt(4, 8, 704)]).verdict,
  'NO_RISE_DETECTED');

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
