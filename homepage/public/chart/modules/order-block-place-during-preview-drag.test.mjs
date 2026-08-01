/**
 * Cluster G / drag family: do not place while preview drag is active.
 * GREEN: node order-block-place-during-preview-drag.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_BLOCK_PLACE_DURING_PREVIEW_DRAG=1 node order-block-place-during-preview-drag.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_BLOCK_PLACE_DURING_PREVIEW_DRAG === '1';

global.window = {
  __TALARIA_DISABLE_ORDER_BLOCK_PLACE_DURING_PREVIEW_DRAG_V1: disabled,
};
global.alert = () => {};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.isDraggingPreviewLine = true;
om._orderProvisionalEdit = { phase: 'idle' };

assert.equal(typeof om._shouldBlockPlaceDuringPreviewDrag, 'function');
assert.equal(om._shouldBlockPlaceDuringPreviewDrag(), true, 'drag flag blocks placement');

let result = om.placeAdvancedOrder({ keepPanelOpen: true });
assert.deepEqual(result, { ok: false, reason: 'preview_drag_active' }, 'drag flag exits before using committed inputs');

om.isDraggingPreviewLine = false;
om._orderProvisionalEdit = {
  phase: 'preview',
  lineKind: 'sl',
  provisionalPrice: 90,
  committedPrice: 95,
};
assert.equal(om._shouldBlockPlaceDuringPreviewDrag(), true, 'preview provisional state blocks placement');
result = om.placeAdvancedOrder({ keepPanelOpen: true });
assert.deepEqual(result, { ok: false, reason: 'preview_drag_active' }, 'preview provisional exits before using committed inputs');

om.isDraggingPreviewLine = false;
om._orderProvisionalEdit = { phase: 'idle' };
assert.equal(om._shouldBlockPlaceDuringPreviewDrag(), false, 'idle draft can place normally');
result = om.placeAdvancedOrder({ keepPanelOpen: true });
assert.deepEqual(result, { ok: false, reason: 'replay_not_active' }, 'idle draft reaches the next placement guard');

console.log(disabled
  ? 'RED — switch OFF allows place while preview drag is active'
  : 'GREEN — place is blocked until preview drag commits or cancels');
process.exit(0);
