import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HEAP_COLLAPSE_MIN_EXPAND_BYTES,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
  summarizeCollapseHeap,
} from '../lib/heap-memory-instrument.mjs';

function sample(usedJSHeapSize, {
  forcedGcAttempted = true,
  forcedGcAvailable = true,
} = {}) {
  return {
    exposed: true,
    metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
    usedJSHeapSize,
    forcedGcAttempted,
    forcedGcAvailable,
  };
}

test('unit: summarizeCollapseHeap GREEN on usedJSHeapSize release after forced GC', () => {
  const summary = summarizeCollapseHeap({
    instrument: {
      metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
      footprintNonGrading: true,
    },
    singleBaseline: sample(100_000_000),
    fourPeak: sample(200_000_000),
    postCollapse: sample(110_000_000),
  });
  assert.equal(summary.collapseStatus, 'GREEN');
  assert.equal(summary.instrumentOk, true);
  assert.equal(summary.releaseBytes, 90_000_000);
});

test('unit: summarizeCollapseHeap rejects footprint metric and missing forced GC', () => {
  const summary = summarizeCollapseHeap({
    instrument: { metric: 'taskManagerFootprint', footprintNonGrading: false },
    singleBaseline: sample(100_000_000, { forcedGcAttempted: false }),
    fourPeak: sample(200_000_000, { forcedGcAttempted: false }),
    postCollapse: sample(110_000_000, { forcedGcAttempted: false }),
  });
  assert.equal(summary.instrumentOk, false);
  assert.equal(summary.collapseStatus, 'RED');
});

test('unit: summarizeCollapseHeap UNPROVEN below min expand', () => {
  const tiny = HEAP_COLLAPSE_MIN_EXPAND_BYTES - 1;
  const summary = summarizeCollapseHeap({
    instrument: {
      metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
      footprintNonGrading: true,
    },
    singleBaseline: sample(100_000_000),
    fourPeak: sample(100_000_000 + tiny),
    postCollapse: sample(100_000_000),
  });
  assert.equal(summary.collapseStatus, 'UNPROVEN');
  assert.equal(summary.expandable, false);
});
