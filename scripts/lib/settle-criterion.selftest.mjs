import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSettled, assessReplication, EPS_SPREAD_MB } from './settle-criterion.mjs';

/**
 * THE MUTANT IS NOT SYNTHETIC. These are the five reps of CONF01-BASELINE-GATE-20260731.json, b120,
 * verbatim: one total reading each after `HeapProfiler.collectGarbage` plus a 3-second sleep, taken on
 * a page that was never paused (the gate contains no setPlaying/pause call anywhere).
 */
const B120_REPS = [
  { rep: 1, total: 1052.1, heapBefore: 279.69, heapAfter: 234.14 },
  { rep: 2, total: 1240.3, heapBefore: 283.99, heapAfter: 357.06 },
  { rep: 3, total: 1189.0, heapBefore: 135.27, heapAfter: 318.67 },
  { rep: 4, total: 1140.6, heapBefore: 250.39, heapAfter: 340.59 },
  { rep: 5, total: 1176.4, heapBefore: 324.41, heapAfter: 330.64 },
];

const asReading = (r) => ({
  reads: [r.total], rungMs: 3_000, quiescent: false, forcedGcOk: true,
  heapBeforeGcMB: r.heapBefore, heapAfterGcMB: r.heapAfter, label: `b120 rep ${r.rep}`,
});

test('MUTANT — every one of the five b120 reps is refused, and none is graded settled', () => {
  for (const r of B120_REPS) {
    const v = assessSettled(asReading(r));
    assert.equal(v.settled, false, `rep ${r.rep} must not grade settled`);
  }
});

test('MUTANT — the refusal names the live page and the missing curve, separately', () => {
  const v = assessSettled(asReading(B120_REPS[0]));
  assert.ok(v.failedConditions.includes('Q'), 'the page was streaming during the collection');
  assert.ok(v.failedConditions.includes('F'), 'one reading is not a curve');
  assert.match(v.why, /sawtooth/);
  assert.match(v.why, /single point cannot show/);
});

test('MUTANT — the four reps whose heap ROSE across collection are caught by condition C', () => {
  const caught = B120_REPS
    .filter((r) => assessSettled(asReading(r)).failedConditions.includes('C'))
    .map((r) => r.rep);
  assert.deepEqual(caught, [2, 3, 4, 5], 'rep 1 is the only one whose heap actually fell');
  const rep3 = assessSettled(asReading(B120_REPS[2]));
  assert.match(rep3.why, /rose 183\.4 MB across the collection/);
  assert.match(rep3.why, /post-dates the collection without reflecting it/);
});

test('the five reps fail replication with the spread that started this', () => {
  const v = assessReplication(B120_REPS.map((r) => r.total));
  assert.equal(v.replicated, false);
  assert.equal(v.spreadMB, 188.2);
  assert.equal(v.state, 'SPREAD_EXCEEDS_BOUND');
});

test('DISCRIMINATION — a compliant curve grades SETTLED, so the flag is not a constant NO', () => {
  const v = assessSettled({
    reads: [690.4, 676.2, 674.9], rungMs: 600_000, quiescent: true, forcedGcOk: true,
    heapBeforeGcMB: 210.0, heapAfterGcMB: 168.4, label: 'b126 canonical floor',
  });
  assert.equal(v.settled, true, 'the b126 floor shape must pass or the criterion is unusable');
  assert.equal(v.state, 'SETTLED');
  assert.equal(v.lastIntervalMB, -1.3, 'the 1.3 MB last interval this was calibrated against');
});

test('DISCRIMINATION — the four conditions fail independently, one at a time', () => {
  const base = { reads: [690.4, 676.2, 674.9], rungMs: 600_000, quiescent: true, forcedGcOk: true,
    heapBeforeGcMB: 210.0, heapAfterGcMB: 168.4 };
  assert.deepEqual(assessSettled({ ...base, quiescent: false }).failedConditions, ['Q']);
  assert.deepEqual(assessSettled({ ...base, forcedGcOk: false }).failedConditions, ['C']);
  assert.deepEqual(assessSettled({ ...base, heapAfterGcMB: 260.0 }).failedConditions, ['C']);
  assert.deepEqual(assessSettled({ ...base, rungMs: 60_000 }).failedConditions, ['F']);
  assert.deepEqual(assessSettled({ ...base, reads: [690.4, 676.2, 660.0] }).failedConditions, ['F'],
    'still descending is STILL_MOVING, not RISING');
});

test('a curve that descends then lifts fails M, and is a different state from still descending', () => {
  const v = assessSettled({ reads: [690.4, 670.0, 676.5], rungMs: 600_000, quiescent: true,
    forcedGcOk: true, heapBeforeGcMB: 210, heapAfterGcMB: 168 });
  assert.ok(v.failedConditions.includes('M'));
  assert.match(v.why, /rose 6\.5 MB mid-settle/, 'the boot curve failed by hand at exactly this');
});

test('an unrecorded quiescence field is not a pass', () => {
  const v = assessSettled({ reads: [690.4, 676.2, 674.9], rungMs: 600_000, forcedGcOk: true });
  assert.equal(v.settled, false);
  assert.match(v.why, /absence of the field is not a pass/);
});

test('one rep is unreplicated rather than replicated-with-zero-spread', () => {
  const v = assessReplication([674.9]);
  assert.equal(v.replicated, null, 'null, not true: the spread is unmeasured, not zero');
  assert.equal(v.state, 'UNREPLICATED_SINGLE_REP');
  assert.equal(EPS_SPREAD_MB, 6.0);
});
