/**
 * Cluster G / TAL-01751: BE trigger keeps its preview/place anchor.
 * GREEN: node order-be-place-anchor.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_BE_PLACE_ANCHOR=1 node order-be-place-anchor.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_BE_PLACE_ANCHOR === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_BE_PLACE_ANCHOR_V1: disabled,
};
global.document = {
    getElementById() { return null; },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

const settings = {
    mode: 'rr',
    value: 0.5,
    triggerPrice: 1.1125,
};

const movedFallback = () => 1.1150;
assert.equal(
    om._resolveBreakevenTriggerPrice(settings, movedFallback),
    1.1125,
    'stored place-time BE trigger wins over pending/open recomputation',
);

settings.triggerPrice = 1.1135;
assert.equal(
    om._resolveBreakevenTriggerPrice(settings, movedFallback),
    1.1135,
    'manual BE drag updates the persisted trigger anchor',
);

console.log(disabled
    ? 'RED — switch OFF lets BE recompute from a moved post-place anchor'
    : 'GREEN — BE trigger keeps its preview/place anchor');
