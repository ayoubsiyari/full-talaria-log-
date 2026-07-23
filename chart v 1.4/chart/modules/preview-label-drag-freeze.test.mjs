/**
 * Preview Entry/SL/TP toasts must keep a frozen left-edge X for the whole drag.
 * Re-aligning from live text width shoves labels right, then snaps back on release.
 *
 *   node --test "chart v 1.4/chart/modules/preview-label-drag-freeze.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function sharedBaseX(chartW, maxRowWidth, marginRight) {
  return chartW - maxRowWidth - marginRight;
}

function alignDuringDrag({ isDragging, frozenXs, widths, chartW, marginRight }) {
  if (isDragging) {
    return frozenXs.slice();
  }
  const maxW = Math.max(...widths);
  const base = sharedBaseX(chartW, maxW, marginRight);
  return widths.map(() => base);
}

test('during drag keep frozen X even when sibling text width shrinks', () => {
  const frozen = [820, 820, 820]; // Entry / SL / TP shared column
  const wide = [180, 160, 170];
  const narrow = [140, 120, 130]; // P&L digits shrink mid-drag
  const chartW = 1000;
  const margin = 18;

  const before = alignDuringDrag({
    isDragging: false,
    frozenXs: frozen,
    widths: wide,
    chartW,
    marginRight: margin,
  });
  const midDrag = alignDuringDrag({
    isDragging: true,
    frozenXs: frozen,
    widths: narrow,
    chartW,
    marginRight: margin,
  });
  const afterRelease = alignDuringDrag({
    isDragging: false,
    frozenXs: frozen,
    widths: narrow,
    chartW,
    marginRight: margin,
  });

  assert.deepEqual(midDrag, frozen, 'drag must not recompute from live widths');
  assert.notDeepEqual(afterRelease, before, 'release may reflow to new max width');
  // Without freeze, mid-drag would jump right toward afterRelease.
  assert.ok(afterRelease[0] > frozen[0], 'narrower text would push column right if unfrozen');
});
