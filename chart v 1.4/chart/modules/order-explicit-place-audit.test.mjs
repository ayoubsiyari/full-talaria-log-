/**
 * Rayan #8 self-open — surprise open adoption without place/pending-fill.
 * GREEN: node order-explicit-place-audit.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT=1 node …  (exit ≠ 0)
 *
 * Hypothesis: ghost pending rows fill via checkPendingOrders → executePendingOrder.
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

const surprise = { id: 42, symbol: 'EURUSD', ticker: 'EURUSD', type: 'SELL', status: 'OPEN' };

// Fixed behaviour: surprise adoption must throw. Kill leaves this green → GATE-01 fail.
assert.throws(
    () => om._pushOpenPosition(surprise, 'surprise'),
    /ORDER_EXPLICIT_PLACE_AUDIT:surprise/,
    'surprise open must throw under strict audit',
);
assert.equal(om.openPositions.length, 0, 'surprise open must not land');

const fill = { id: 43, symbol: 'EURUSD', ticker: 'EURUSD', type: 'SELL', status: 'OPEN' };
om._pushOpenPosition(fill, 'pending-fill');
assert.equal(om.openPositions.length, 1, 'pending-fill adoption remains allowed');
console.log('GREEN — explicit-place audit blocks surprise open, allows pending-fill');
