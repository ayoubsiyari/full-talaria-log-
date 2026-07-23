/**
 * Long/Short Position order chrome (STOP BUY / SL / TP) must stay visible while
 * the tool is armed or Place Order is open — not only when the drawing is selected.
 *
 *   node --test "chart v 1.4/chart/modules/rr-order-chrome-visibility.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function shouldShowRrOrderDetails({
  selected,
  isPreview,
  currentTool,
  placeOrderOpen,
}) {
  if (selected || isPreview) return true;
  if (currentTool === 'long-position' || currentTool === 'short-position') return true;
  if (placeOrderOpen) return true;
  return false;
}

test('order chrome stays on when Long Position tool is armed after deselect', () => {
  assert.equal(shouldShowRrOrderDetails({
    selected: false,
    isPreview: false,
    currentTool: 'long-position',
    placeOrderOpen: true,
  }), true);
});

test('order chrome stays on when Short Position tool is armed', () => {
  assert.equal(shouldShowRrOrderDetails({
    selected: false,
    isPreview: false,
    currentTool: 'short-position',
    placeOrderOpen: false,
  }), true);
});

test('order chrome hides when idle and Place Order closed', () => {
  assert.equal(shouldShowRrOrderDetails({
    selected: false,
    isPreview: false,
    currentTool: null,
    placeOrderOpen: false,
  }), false);
});

test('order chrome shows when drawing is selected', () => {
  assert.equal(shouldShowRrOrderDetails({
    selected: true,
    isPreview: false,
    currentTool: null,
    placeOrderOpen: false,
  }), true);
});
