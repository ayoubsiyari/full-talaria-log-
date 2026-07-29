/**
 * Cluster G / TAL-01904 order type classification.
 * GREEN: node order-type-one-tick-pending.test.mjs
 * RED:   TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1=0 node order-type-one-tick-pending.test.mjs
 */
import assert from 'node:assert/strict';
import {
    classifyOrderTypeForPrice,
    orderTypeOneTickPendingV1Enabled,
} from './order-entry-aggregates.mjs';

const disabled = process.env.TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1 === '0';
const opts = { tickSize: 0.0001, pipSize: 0.0001, mainOrderType: 'market' };

assert.equal(orderTypeOneTickPendingV1Enabled(), !disabled, 'one-tick pending switch state');
assert.equal(classifyOrderTypeForPrice('BUY', 1.1000, 1.1000, opts), 'market', 'exact market stays market');
assert.equal(classifyOrderTypeForPrice('SELL', 1.1000, 1.1000, opts), 'market', 'exact market stays market for sell');
assert.equal(classifyOrderTypeForPrice('BUY', 1.1001, 1.1000, opts), 'stop', 'BUY one tick above market is a stop');
assert.equal(classifyOrderTypeForPrice('BUY', 1.0999, 1.1000, opts), 'limit', 'BUY one tick below market is a limit');
assert.equal(classifyOrderTypeForPrice('SELL', 1.0999, 1.1000, opts), 'stop', 'SELL one tick below market is a stop');
assert.equal(classifyOrderTypeForPrice('SELL', 1.1001, 1.1000, opts), 'limit', 'SELL one tick above market is a limit');

console.log(disabled
    ? 'RED — switch OFF reproduces one-tick pending entries as market'
    : 'GREEN — one-tick-away entries classify as pending orders');
