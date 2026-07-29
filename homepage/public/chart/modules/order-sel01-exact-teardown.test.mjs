/**
 * Cluster G / SEL-01 pending TP teardown selectors.
 * GREEN: node order-sel01-exact-teardown.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SEL01_EXACT_TEARDOWN=1 node order-sel01-exact-teardown.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SEL01_EXACT_TEARDOWN === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1: disabled,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

const pctSelector = om._pendingTpPctControlsSelector(1);
const deleteSelector = om._pendingTpDeleteSelector(1);

assert.equal(pctSelector.includes('[class*='), false, 'pct controls selector avoids prefix substring matching');
assert.equal(deleteSelector.includes('[class*='), false, 'delete selector avoids prefix substring matching');
assert.ok(pctSelector.includes('.pending-tp-pct-control.pending-tp-1'), 'pct controls select exact order class');
assert.equal(pctSelector.includes('pending-tp-12'), false, 'order 1 selector does not name order 12');
assert.equal(deleteSelector, '.pending-tp-delete.pending-tp-1', 'delete selector is exact compound class');

console.log(disabled
    ? 'RED — switch OFF uses prefix substring selectors that can catch order 12 while removing 1'
    : 'GREEN — per-order pending TP teardown uses exact class selectors');
