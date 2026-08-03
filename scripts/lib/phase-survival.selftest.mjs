import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSurvival, sweepPublishedSet, residualMB, MEASURED_AMPLITUDES_MB, SURVIVAL_SIGMA } from './phase-survival.mjs';

const matched = { sameSession: true, samePhaseRegime: true, sameCurveOrdered: true };

test('the 108.2 MB method gap stands, and for a stated reason rather than a judgement call', () => {
  const v = assessSurvival({ claim: 'method gap', kind: 'difference', valueMB: 108.2,
    quiescent: true, quantity: 'total', ...matched });
  assert.equal(v.verdict, 'UNAFFECTED');
  assert.equal(v.survives, true);
  assert.match(v.why, /verifiably paused page/, 'it was taken on a paused page, so it was never a sawtooth sample');
});

test('an absolute from a non-quiescent instrument is dead, with the amplitude as its error bar', () => {
  const v = assessSurvival({ claim: 'CONF-01 post-GC', kind: 'absolute', valueMB: 1159.7,
    quiescent: false, quantity: 'total' });
  assert.equal(v.verdict, 'DEAD_ABSOLUTE');
  assert.equal(v.errorBarMB, 188.2);
  assert.match(v.why, /at best an upper bound/);
});

test('a difference across sessions does NOT get the cancellation credit', () => {
  const v = assessSurvival({ claim: 'cross-session', kind: 'difference', valueMB: 500,
    quiescent: false, quantity: 'total', sameSession: false, samePhaseRegime: true, sameCurveOrdered: true });
  assert.equal(v.verdict, 'DEAD_UNMATCHED_PAIR');
  assert.match(v.why, /noisier than either reading, not less noisy/,
    'a difference of unmatched readings is worse than either, and must not read as better');
});

test('a matched difference above the bar survives; below it does not', () => {
  const bar = residualMB(MEASURED_AMPLITUDES_MB.total) * SURVIVAL_SIGMA;
  const over = assessSurvival({ claim: 'big', kind: 'difference', valueMB: bar + 1,
    quiescent: false, quantity: 'total', ...matched });
  const under = assessSurvival({ claim: 'small', kind: 'difference', valueMB: bar - 1,
    quiescent: false, quantity: 'total', ...matched });
  assert.equal(over.verdict, 'SURVIVES');
  assert.equal(under.verdict, 'DEAD_BELOW_RESIDUAL');
  assert.match(under.why, /Re-take under quiescence/);
});

test('sign does not decide survival — a negative difference is judged on magnitude', () => {
  const bar = residualMB(MEASURED_AMPLITUDES_MB.total) * SURVIVAL_SIGMA;
  const v = assessSurvival({ claim: 'negative', kind: 'difference', valueMB: -(bar + 1),
    quiescent: false, quantity: 'total', ...matched });
  assert.equal(v.verdict, 'SURVIVES');
});

test('a quantity with no measured amplitude is UNGRADED, not dead', () => {
  const v = assessSurvival({ claim: 'canvas reclaim', kind: 'difference', valueMB: 61.52,
    quiescent: false, quantity: 'gpu', ...matched });
  assert.equal(v.verdict, 'UNGRADED_AMPLITUDE_UNMEASURED');
  assert.equal(v.survives, null, 'neither confirmed nor killed');
  assert.match(v.whatWouldSettleIt, /peak-to-trough spread/);
});

test('the JS-heap amplitude is never silently borrowed for another quantity', () => {
  const gpu = assessSurvival({ claim: 'x', kind: 'absolute', valueMB: 100, quiescent: false, quantity: 'gpu' });
  assert.notEqual(gpu.verdict, 'DEAD_ABSOLUTE',
    'borrowing an amplitude across allocators is how the 59.84% coverage defect happened');
  assert.equal(gpu.verdict, 'UNGRADED_AMPLITUDE_UNMEASURED');
});

test('the residual is sqrt(2) scaled and half-credited, and the bar is two of them', () => {
  assert.equal(residualMB(188.2), 133.1);
  assert.equal(+(residualMB(188.2) * SURVIVAL_SIGMA).toFixed(1), 266.2);
});

test('the sweep tallies the published set without needing a human to arbitrate', () => {
  const s = sweepPublishedSet([
    { claim: 'a', kind: 'absolute', valueMB: 1, quiescent: true },
    { claim: 'b', kind: 'absolute', valueMB: 1, quiescent: false, quantity: 'total' },
    { claim: 'c', kind: 'difference', valueMB: 1, quiescent: false, quantity: 'gpu', ...matched },
  ]);
  assert.equal(s.rows.length, 3);
  assert.equal(s.tally.UNAFFECTED, 1);
  assert.equal(s.tally.DEAD_ABSOLUTE, 1);
  assert.equal(s.tally.UNGRADED_AMPLITUDE_UNMEASURED, 1);
});
