/**
 * Cluster G / TAL-01941: SL non-trigger reports need bounded diagnostics, not a speculative fill fix.
 * GREEN: node order-sl-trigger-diagnostics.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SL_TRIGGER_DIAG=1 node order-sl-trigger-diagnostics.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SL_TRIGGER_DIAG === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SL_TRIGGER_DIAG_V1: disabled,
};
global.document = {
    getElementById() { return null; },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);
om._getActiveTicker = () => 'EURUSD';

const position = {
    id: 1941,
    type: 'BUY',
    ticker: 'GBPUSD',
    sourceFileId: 'file-gbp',
    stopLoss: 1.201,
    openPrice: 1.205,
    _slNoTriggerBeforeTime: 1721600000000,
    _slNoTriggerBeforeTick: 12,
};

const ok = om._recordSlTriggerDiag(position, {
    reason: 'guarded-touch-miss',
    barTime: 1721600060000,
    guarded: true,
    rawTouched: true,
    effectiveExtreme: 1.2008,
    bidLow: 1.2008,
    bidHigh: 1.206,
    askLow: 1.201,
    askHigh: 1.2062,
    midOpen: 1.204,
});

assert.equal(ok, true, 'diagnostics should record when enabled');
assert.equal(window.__talariaOrderSlTriggerDiag.length, 1, 'global diagnostic ring receives the row');
assert.equal(om._slTriggerDiag.length, 1, 'manager diagnostic ring receives the row');
assert.equal(window.__talariaOrderSlTriggerDiag[0].reason, 'guarded-touch-miss');
assert.equal(window.__talariaOrderSlTriggerDiag[0].orderId, 1941);
assert.equal(window.__talariaOrderSlTriggerDiag[0].ticker, 'GBPUSD');
assert.equal(window.__talariaOrderSlTriggerDiag[0].rawTouched, true);
assert.equal(window.__talariaOrderSlTriggerDiag[0].guardTick, 12);

for (let i = 0; i < 90; i++) {
    om._recordSlTriggerDiag({ ...position, id: i }, { reason: 'hit', barTime: i, fillPrice: 1.2 });
}
assert.equal(window.__talariaOrderSlTriggerDiag.length, 80, 'global diagnostic ring is bounded');
assert.equal(om._slTriggerDiag.length, 80, 'manager diagnostic ring is bounded');

console.log(disabled
    ? 'RED - SL trigger diagnostics disabled'
    : 'GREEN - SL trigger diagnostics capture bounded decision evidence');
