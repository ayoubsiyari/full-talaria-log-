/**
 * Rayan #8 self-open — surprise open adoption without place/pending-fill.
 * CONF-01: EURUSD ghost/pending must not act as GBPUSD panel fills.
 * GREEN: node order-explicit-place-audit.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT=1 node …  (exit ≠ 0)
 *
 * Hypothesis: ghost pending rows fill via checkPendingOrders → executePendingOrder.
 * GATE-01: CONF-01 cross-panel cells run first so kill reverses those asserts (not only
 * the single-panel baseline).
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const auditKill = process.env.TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT === '1';

global.window = {
    __TALARIA_ORDER_EXPLICIT_PLACE_AUDIT_STRICT: true,
    __TALARIA_ORDER_EXPLICIT_PLACE_AUDIT_THROW: true,
    __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1: auditKill,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.openPositions = [];
om.orders = [];
om.orderService = null;
om.attachStrategyVariablesToOrder = () => {};
om._registerSplitTradeGroupEntry = () => {};
om._freezePlannedRRAtEntry = () => {};
om._armPendingFillSameBarSltpGuards = () => {};
om.enablePositionScaling = false;
om.showNotification = () => {};
om.formatPrice = (p) => String(p);
om._applyHalfSpreadEntryPrice = (p) => p;
om.replaySystem = { animatingCandle: null, tickProgress: 0 };
om._normalizeTicker = (t) => String(t || '').toUpperCase();
om._getBackgroundBarForTicker = () => null;
om._getOrderContextChart = () => om.chart;
om._claimOrderLifecycleEvent = () => true;
om._isNoTriggerGuardActive = () => false;
om._tickAnimOverridesGuard = () => false;

const surprise = { id: 42, symbol: 'EURUSD', ticker: 'EURUSD', type: 'SELL', status: 'OPEN' };

// CONF-01 cross-panel first — kill must reverse these (GATE-01).
om.chart = { currentSymbol: 'GBPUSD', currentFileId: 'FILE_GBP' };
om._getActiveTicker = () => 'GBPUSD';
om.executePendingOrder = () => {
    throw new Error('EURUSD pending must not fill from GBPUSD panel candle');
};
om.openPositions = [];
om.pendingOrders = [{
    id: 44,
    ticker: 'EURUSD',
    symbol: 'EURUSD',
    status: 'PENDING',
    orderType: 'limit',
    direction: 'BUY',
    entryPrice: 1.0,
}];
const gbpCandle = { t: 1, o: 1.25, h: 1.3, l: 1.2, c: 1.25 };
om.checkPendingOrders(gbpCandle);
assert.equal(om.openPositions.length, 0, 'CONF-01: EURUSD pending must not open on GBPUSD panel');
assert.equal(om.pendingOrders.length, 1, 'CONF-01: EURUSD pending remains until its symbol bar crosses');

// Always assert fixed audit — kill lets surprise land on the foreign panel (GATE-01 / CONF-01).
assert.throws(
    () => om._pushOpenPosition(surprise, 'surprise'),
    /ORDER_EXPLICIT_PLACE_AUDIT:surprise/,
    'CONF-01: surprise EURUSD open still blocked while GBPUSD panel active',
);
assert.equal(om.openPositions.length, 0, 'CONF-01: surprise EURUSD must not land on GBPUSD panel');

// Single-panel baseline (still kill-covered).
om.openPositions = [];
om.pendingOrders = [];
om.chart = { currentSymbol: 'EURUSD', currentFileId: 'FILE_EUR' };
om._getActiveTicker = () => 'EURUSD';
assert.throws(
    () => om._pushOpenPosition({ ...surprise, id: 42 }, 'surprise'),
    /ORDER_EXPLICIT_PLACE_AUDIT:surprise/,
    'surprise open must throw under strict audit',
);
assert.equal(om.openPositions.length, 0, 'surprise open must not land');

const fill = { id: 43, symbol: 'EURUSD', ticker: 'EURUSD', type: 'SELL', status: 'OPEN' };
om._pushOpenPosition(fill, 'pending-fill');
assert.equal(om.openPositions.length, 1, 'pending-fill adoption remains allowed');

console.log('GREEN — explicit-place audit blocks surprise open, allows pending-fill');
