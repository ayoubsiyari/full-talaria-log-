/**
 * M24 skipped-id / gap after hydrate (Rayan #8 class).
 * CONF-01: gap reconcile scans mixed-symbol journal rows (per shared order manager).
 * GREEN: node m24-order-id-gap-after-hydrate.test.mjs
 * RED:   TALARIA_TEST_DISABLE_M24_ORDER_ID_GAP_RECONCILE=1 node …  (exit ≠ 0)
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const gapKill = process.env.TALARIA_TEST_DISABLE_M24_ORDER_ID_GAP_RECONCILE === '1';

global.window = {
    __TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1: false,
    __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1: gapKill,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.tradeJournal = [
    { id: 5, tradeId: 5, ticker: 'EURUSD' },
    { id: 6, tradeId: 6, ticker: 'GBPUSD' },
    { id: 7, tradeId: 7, ticker: 'USDJPY' },
];
om.pendingOrders = [];
om.openPositions = [];
om.closedPositions = [];
om.orders = [];
om.orderIdCounter = 9; // stale: pending #8 lost on hydrate
om._m19NoteJournalStructuralMutation = () => {};
om._m20A1ScheduleRetainedSweep = () => {};
om._invalidateM19MarkerDeltaCache = () => {};

om._m24ReconcileOrderIdCounter();
const nextId = om._allocateOrderId();

// Always assert fixed behaviour — kill must make this fail (GATE-01).
assert.equal(nextId, 8, 'after hydrate, next mint must fill skipped #8 (not jump to stale 9)');
console.log('GREEN — M24 gap reconcile reuses skipped id after hydrate');
