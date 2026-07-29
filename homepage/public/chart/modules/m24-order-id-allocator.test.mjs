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

const om = makeManager();
const allocated = om._allocateOrderId();
assert.equal(allocated, 62, 'allocator advances past all restored pending/open/journal ids');
assert.equal(om.orderIdCounter, 63, 'counter advances after reserving the reconciled id');

const upsert = om.upsertJournalEntry({ id: allocated, tradeId: allocated, ticker: 'EURUSD' }, { skipIfExists: true });
assert.equal(upsert.inserted, true, 'newly allocated trade is not skipped as duplicate journal id');
assert.equal(om.tradeJournal.length, 3, 'closed trade reaches history instead of disappearing');

console.log(disableAllocator
    ? 'RED — switch OFF reproduced stale-counter duplicate trade loss'
    : 'GREEN — M24 order id allocator reconciles stale restored counters');
