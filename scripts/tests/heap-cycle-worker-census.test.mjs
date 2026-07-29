import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HEAP_CYCLE_WORKER_CENSUS_SIGNATURE,
  summarizeWorkerCycleDeltas,
} from '../lib/heap-cycle-worker-census.mjs';

test('unit: worker census +1/cycle shape is detected', () => {
  const summary = summarizeWorkerCycleDeltas([
    { label: 'baseline', liveTotal: 1, createdTotal: 1, cdpCount: 1 },
    { label: 'cycle1-returnSingle', liveTotal: 2, createdTotal: 5, cdpCount: 2 },
    { label: 'cycle2-returnSingle', liveTotal: 3, createdTotal: 9, cdpCount: 3 },
    { label: 'cycle3-returnSingle', liveTotal: 4, createdTotal: 13, cdpCount: 4 },
  ]);
  assert.equal(summary.signature, HEAP_CYCLE_WORKER_CENSUS_SIGNATURE);
  assert.equal(summary.plusOnePerCycle, true);
  assert.ok(Math.abs(summary.meanLiveDeltaPerCycle - 1) < 1e-9);
});

test('unit: stable worker count is not +1/cycle', () => {
  const summary = summarizeWorkerCycleDeltas([
    { label: 'baseline', liveTotal: 4, createdTotal: 4 },
    { label: 'cycle1-returnSingle', liveTotal: 4, createdTotal: 4 },
    { label: 'cycle2-returnSingle', liveTotal: 4, createdTotal: 4 },
  ]);
  assert.equal(summary.plusOnePerCycle, false);
  assert.equal(summary.meanLiveDeltaPerCycle, 0);
});
