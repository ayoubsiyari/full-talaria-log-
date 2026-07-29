/**
 * Cluster G / TAL-01809 account balance floor.
 * GREEN: node order-balance-floor.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_BALANCE_FLOOR=1 node order-balance-floor.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_BALANCE_FLOOR === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1: disabled,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.balance = 100;
om.initialBalance = 100;
om.openPositions = [];
om.orderService = { balance: null, equity: null };
om._syncReplayHeaderStatsFromAccount = OrderManager.prototype._syncReplayHeaderStatsFromAccount;

om._applyRealizedPnLToBalance(-150);
assert.equal(om.balance, 0, 'realized close loss cannot drive balance below zero');

om.balance = 100;
om.tradeJournal = [{ id: 1, netPnL: -175 }];
om.recomputeAccountFromJournal();
assert.equal(om.balance, 0, 'journal recompute cannot drive balance below zero');

assert.equal(om._floorAccountBalance(-25), 0, 'restored negative balance is floored');

console.log(disabled
    ? 'RED — switch OFF allows negative account balance'
    : 'GREEN — realized losses and recompute floor balance at zero');
