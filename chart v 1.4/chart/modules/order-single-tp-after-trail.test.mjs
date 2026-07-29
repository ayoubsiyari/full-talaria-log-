/**
 * Cluster G / TAL-01933 single TP after trailing SL.
 * GREEN: node order-single-tp-after-trail.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL=1 node order-single-tp-after-trail.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1: disabled,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

assert.equal(
    om._singleTakeProfitExecutable({ type: 'BUY' }, 1.1000, 1.1050),
    true,
    'BUY single TP remains executable after SL trails above TP'
);
assert.equal(
    om._singleTakeProfitExecutable({ type: 'SELL' }, 1.1000, 1.0950),
    true,
    'SELL single TP remains executable after SL trails below TP'
);
assert.equal(
    om._singleTakeProfitExecutable({ type: 'BUY' }, 0, 1.1050),
    false,
    'missing TP is never executable'
);

console.log(disabled
    ? 'RED — switch OFF reproduces single TP skipped after trailing SL crosses it'
    : 'GREEN — single TP stays executable after trailing SL crosses it');
