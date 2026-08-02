/**
 * Self-test for the A8 hoard-slope grader. Imports gradeHoardSlope from the runner, so these checks
 * exercise the code the two-hour run calls rather than a restatement of it.
 *
 * The check that earns its place is STALL-READS-AS-FLAT: a stalled product produces a flat hoard, which
 * is the most attractive wrong answer this instrument can give. If that one does not VOID, the whole
 * measurement is worthless no matter how the arithmetic reads.
 */

import { gradeHoardSlope } from './a8-hoard-slope.mjs';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const probe = (label, { running, floor, t, verdict = 'MEASURED' }) => ({
  verdict,
  label,
  runningMB: running,
  hoardFloorMB: floor,
  frothPercentOfRunning: running > 0 && floor != null ? +(((running - floor) / running) * 100).toFixed(1) : null,
  steps: [{ stage: 'running', atMs: t - 660_000 }, { stage: 'after-reclaim-10min', atMs: t }],
});

const MOVED = { moved: true, indexAdvance: 12_000, timestampAdvanceMs: 720_000_000 };
const STALLED = { moved: false, indexAdvance: 0, timestampAdvanceMs: 0 };
const HOUR = 3_600_000;
const t0 = Date.UTC(2026, 7, 2, 12, 0, 0);

console.log('A8 HOARD-SLOPE grader self-test\n');

// 1. Retention: the floor itself climbs while the product genuinely advances.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1050, floor: 900, t: t0 }),
    probeB: probe('B', { running: 1450, floor: 1200, t: t0 + HOUR / 2 }),
    advance: MOVED,
  });
  check('retention case grades MEASURED', g.verdict === 'MEASURED', g.why);
  check('hoard slope is +600 MB/h', g.result.hoardSlopeMBPerHour === 600, String(g.result?.hoardSlopeMBPerHour));
  check('running slope is +800 MB/h', g.result.runningSlopeMBPerHour === 800, String(g.result?.runningSlopeMBPerHour));
  check('retained share is 75% of the climb', g.result.retainedPercentOfRunningClimb === 75, String(g.result?.retainedPercentOfRunningClimb));
  check('projection reports hours to the bar', g.tenHourConsequence.hoursToBarAtThisSlope !== null);
}

// 2. Froth: running climbs hard, the floor does not move. This is the outcome that clears the ten-hour arm.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1050, floor: 900, t: t0 }),
    probeB: probe('B', { running: 1450, floor: 905, t: t0 + HOUR / 2 }),
    advance: MOVED,
  });
  check('froth case grades MEASURED', g.verdict === 'MEASURED');
  check('froth case reports a small hoard slope', g.result.hoardSlopeMBPerHour === 10, String(g.result?.hoardSlopeMBPerHour));
  check('froth case retains ~1% of the climb', g.result.retainedPercentOfRunningClimb === 1.3, String(g.result?.retainedPercentOfRunningClimb));
}

// 3. THE ONE THAT MATTERS: a stall produces a perfectly flat hoard. It must VOID, not clear the arm.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1050, floor: 900, t: t0 }),
    probeB: probe('B', { running: 1051, floor: 900, t: t0 + HOUR / 2 }),
    advance: STALLED,
  });
  check('STALL with a flat hoard VOIDs', g.verdict === 'VOID', `graded ${g.verdict}`);
  check('stall reason names the false all-clear', /stall|did not advance/i.test(g.why || ''), g.why);
  check('stall emits no result to quote', g.result === undefined);
}

// 4. A drain that never verified its pause cannot contribute a floor.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1050, floor: null, t: t0, verdict: 'VOID' }),
    probeB: probe('B', { running: 1450, floor: 1200, t: t0 + HOUR / 2 }),
    advance: MOVED,
  });
  check('unverified pause VOIDs the run', g.verdict === 'VOID');
  check('names which probe failed', /A VOID/.test(g.why || ''), g.why);
}

// 5. Uncomputable slope must never report a pass — my relief valve failed open exactly here.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1050, floor: 900, t: t0 }),
    probeB: probe('B', { running: 1450, floor: 1200, t: t0 }), // zero elapsed between floors
    advance: MOVED,
  });
  check('zero elapsed between floors VOIDs rather than dividing by zero', g.verdict === 'VOID', g.why);
  check('no Infinity reaches the artifact', g.result === undefined);
}

// 6. A floor already over the bar is stated as such, not hidden behind a projection.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1200, floor: 1030, t: t0 }),
    probeB: probe('B', { running: 1300, floor: 1100, t: t0 + HOUR / 2 }),
    advance: MOVED,
  });
  check('floor over the bar is flagged', g.tenHourConsequence.alreadyOverBar === true);
  check('hoard slope still reported alongside', g.result.hoardSlopeMBPerHour === 140, String(g.result?.hoardSlopeMBPerHour));
}

// 7. A falling floor must not produce a negative hours-to-bar that reads like a deadline.
{
  const g = gradeHoardSlope({
    probeA: probe('A', { running: 1200, floor: 1000, t: t0 }),
    probeB: probe('B', { running: 1210, floor: 940, t: t0 + HOUR / 2 }),
    advance: MOVED,
  });
  check('falling floor gives null hours-to-bar, not a negative deadline', g.tenHourConsequence.hoursToBarAtThisSlope === null, String(g.tenHourConsequence?.hoursToBarAtThisSlope));
  check('falling floor reports a negative slope honestly', g.result.hoardSlopeMBPerHour === -120, String(g.result?.hoardSlopeMBPerHour));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
