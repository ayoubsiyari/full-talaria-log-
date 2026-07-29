import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldGradeInProcess,
  realmSurvivalCommandFor,
} from '../heap-cycle-memory-gate.mjs';

test('unit: a process already holding parsed snapshots does not grade in-line', () => {
  assert.equal(shouldGradeInProcess(2_400_000_000), false);
  assert.equal(shouldGradeInProcess(1_500_000_000), false);
});

test('unit: a small process grades in-line', () => {
  assert.equal(shouldGradeInProcess(120_000_000), true);
});

test('unit: an unmeasurable heap is treated as unaffordable rather than assumed safe', () => {
  assert.equal(shouldGradeInProcess(null), false);
  assert.equal(shouldGradeInProcess(NaN), false);
  assert.equal(shouldGradeInProcess(undefined), false);
});

test('unit: a skip still names the exact command that grades the snapshot', () => {
  const cmd = realmSurvivalCommandFor('/tmp/run.cycle3.heapsnapshot');
  assert.match(cmd, /realm-survival-gate\.mjs/);
  assert.match(cmd, /--snapshot=\/tmp\/run\.cycle3\.heapsnapshot/);
  assert.match(cmd, /--max-old-space-size/);
});
