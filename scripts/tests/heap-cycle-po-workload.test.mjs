import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HEAP_CYCLE_PO_HAND_BASELINE_MB,
  HEAP_CYCLE_PO_HAND_FLOORS_MB,
  assessPoHandHeapShape,
} from '../lib/heap-cycle-po-workload.mjs';

test('unit: PO hand floors grade as PO-LIKE late-climb shape', () => {
  const mb = (n) => Math.round(n * 1024 * 1024);
  const shape = assessPoHandHeapShape({
    baselineBytes: mb(HEAP_CYCLE_PO_HAND_BASELINE_MB),
    floorBytes: HEAP_CYCLE_PO_HAND_FLOORS_MB.map(mb),
  });
  assert.equal(shape.ok, true);
  assert.ok(shape.meanDeltaMb > 10 && shape.meanDeltaMb < 20);
  assert.ok(shape.lateJumpMb >= 40);
});

test('unit: flat ~0.7 MB/cycle layout-only shape is NOT PO hand', () => {
  const mb = (n) => Math.round(n * 1024 * 1024);
  const floors = [76.95, 76.77, 77.44, 77.5, 77.6, 77.7].map(mb);
  const shape = assessPoHandHeapShape({
    baselineBytes: mb(75.38),
    floorBytes: floors,
  });
  assert.equal(shape.ok, false);
  assert.match(shape.reason || '', /PO-HAND-SHAPE miss/);
});
