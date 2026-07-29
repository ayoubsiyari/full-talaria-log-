/**
 * Cluster G / TAL-01932: full-size opposing pending fills close existing positions.
 * GREEN: node order-pending-close-netting.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_PENDING_CLOSE_NETTING=1 node order-pending-close-netting.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_PENDING_CLOSE_NETTING === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_PENDING_CLOSE_NETTING_V1: disabled,
};
global.document = {
    getElementById() { return null; },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeOrderManager() {
    const om = Object.create(OrderManager.prototype);
    om.closeCalls = [];
    om.cleaned = [];
    om.openPositions = [{
        id: 7,
        type: 'BUY',
        ticker: 'EURUSD',
        sourceFileId: 'file-a',
        quantity: 5,
    }];
    om.orderService = null;
    om.chart = null;
    om._getActiveTicker = () => 'EURUSD';
    om.formatPrice = (v) => String(v);
    om.removePendingOrderLine = (id) => om.cleaned.push(['line', id]);
    om.removePendingSLTPLines = (id) => om.cleaned.push(['targets', id]);
    om.removeMultiTPAvgLine = (id) => om.cleaned.push(['avg', id]);
    om._removeSplitGroupTPAvgIfEmpty = (gid, id) => om.cleaned.push(['split-avg', gid, id]);
    om._collectLayoutCharts = () => [];
    om.closePositionAtPrice = (...args) => om.closeCalls.push(args);
    om.showNotification = () => {};
    return om;
}

const pendingClose = {
    id: 32,
    direction: 'SELL',
    orderType: 'limit',
    ticker: 'EURUSD',
    sourceFileId: 'file-a',
    quantity: 5,
};

let om = makeOrderManager();
const executedAsClose = om._executePendingCloseIfNeeded(pendingClose, 1.125, { t: 1700000000000 });

assert.equal(executedAsClose, true, 'full-size opposing pending fill should close the open position');
assert.deepEqual(
    om.closeCalls,
    [[7, 1.125, 'PENDING_CLOSE', null, null, 1700000000000]],
    'pending close uses existing closePositionAtPrice journal/balance path',
);
assert.deepEqual(
    om.cleaned,
    [['line', 32], ['targets', 32], ['avg', 32]],
    'pending close removes pending visuals instead of drawing a new open position',
);

om = makeOrderManager();
const partialOpposing = { ...pendingClose, id: 33, quantity: 2.5 };
assert.equal(
    om._executePendingCloseIfNeeded(partialOpposing, 1.126, { t: 1700000001000 }),
    false,
    'partial-size opposing pending orders are not netted by the exact TAL-01932 fix',
);
assert.deepEqual(om.closeCalls, [], 'non-exact close size leaves legacy behavior untouched');

console.log(disabled
    ? 'RED — switch OFF converts full-size opposing pending fills into new positions'
    : 'GREEN — full-size opposing pending fills close the existing position');
