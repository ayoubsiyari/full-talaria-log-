/**
 * M24 order identity gate.
 * GREEN: node m24-order-id-allocator.test.mjs
 * RED:   TALARIA_TEST_DISABLE_M24_ORDER_ID_ALLOCATOR=1 node m24-order-id-allocator.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disableAllocator = process.env.TALARIA_TEST_DISABLE_M24_ORDER_ID_ALLOCATOR === '1';

global.window = {
    __TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1: disableAllocator,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeManager() {
    const om = Object.create(OrderManager.prototype);
    om.orderIdCounter = 4; // stale after restore: next legacy order collides with id 4
    om.pendingOrders = [{ id: 4, status: 'PENDING' }];
    om.openPositions = [{ id: 7, status: 'OPEN' }];
    om.closedPositions = [];
    om.orders = [];
    om.tradeJournal = [{ id: 3, tradeId: 3 }, { id: 42, tradeId: 42 }];
    om.orderService = {
        pendingOrders: [{ id: 5 }],
        openPositions: [{ id: 61 }],
    };
    om._m20A1ScheduleRetainedSweep = () => {};
    return om;
}

function stubSplitPlacement(om) {
    om.orderSide = 'BUY';
    om.orderType = 'limit';
    om.positionSizeMode = 'risk-usd';
    om._getActiveTicker = () => 'EURUSD';
    om._getActiveInstrumentSettings = () => ({});
    om._chartSourceFileId = () => 'synthetic';
    om._getCurrentTickSnapshot = () => ({ tick: 1 });
    om.getCurrentCandle = () => ({ t: 1000 });
    om._consumeV9RailDraftForOrder = () => {};
    om._applyPreTradeVariablesFromOrderPanel = () => {};
    om._freezePlannedRRAtEntry = () => {};
    om._seedOrderLifecycleEvent = () => {};
    om.drawPendingOrderLine = () => {};
    om.drawPendingOrderTargets = () => {};
    om.drawMultiTPAvgLine = () => {};
    om.positionPendingOrderTargets = () => {};
    om.updatePositionsPanel = () => {};
}

const om = makeManager();
const allocated = om._allocateOrderId();
assert.equal(allocated, 62, 'allocator advances past all restored pending/open/journal ids');
assert.equal(om.orderIdCounter, 63, 'counter advances after reserving the reconciled id');

const upsert = om.upsertJournalEntry({ id: allocated, tradeId: allocated, ticker: 'EURUSD' }, { skipIfExists: true });
assert.equal(upsert.inserted, true, 'newly allocated trade is not skipped as duplicate journal id');
assert.equal(om.tradeJournal.length, 3, 'closed trade reaches history instead of disappearing');

const splitOm = makeManager();
stubSplitPlacement(splitOm);
splitOm.orderService = null;
const splitId = splitOm.placePendingOrderWithSplit(
    1.101,
    0.1,
    1.111,
    1.091,
    10,
    false,
    null,
    null,
    [],
    1000,
    77,
    1,
    2,
    'limit'
);
assert.equal(splitId, 43, 'split pending placement returns the reconciled allocated id');
assert.equal(splitOm.pendingOrders.at(-1).id, splitId, 'split pending row stores the same allocated id');

console.log(disableAllocator
    ? 'RED — switch OFF reproduced stale-counter duplicate trade loss'
    : 'GREEN — M24 order id allocator reconciles stale restored counters');
