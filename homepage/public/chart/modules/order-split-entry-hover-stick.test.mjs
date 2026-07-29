/**
 * Cluster G / TAL-01750: split-entry handles ignore hover/micro-drags.
 * GREEN: node order-split-entry-hover-stick.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK=1 node order-split-entry-hover-stick.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK_V1: disabled,
};
global.document = {
    getElementById() { return null; },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

assert.equal(
    om._shouldIgnoreSplitHandleDrag(2, 0.0002),
    true,
    'sub-threshold pixel movement should not add a split entry even if price changes',
);
assert.equal(
    om._shouldIgnoreSplitHandleDrag(8, 0.0002),
    false,
    'intentional split-handle drag is still accepted',
);
assert.equal(
    om._shouldIgnoreSplitHandleDrag(8, 0.000001),
    true,
    'near-zero price movement still does not add a split entry',
);

console.log(disabled
    ? 'RED — switch OFF lets hover/micro-drag add split entries'
    : 'GREEN — split handles require intentional drag distance');
