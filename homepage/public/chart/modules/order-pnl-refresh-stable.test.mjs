/**
 * Cluster E / TAL-01903: journal restore keeps PnL/balance stable after refresh.
 * GREEN: node order-pnl-refresh-stable.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_PNL_RESTORE_STABLE=1 node order-pnl-refresh-stable.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_PNL_RESTORE_STABLE === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_PNL_RESTORE_STABLE_V1: disabled,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.initialBalance = 10000;
om.balance = 12000; // stale account_runtime value from an earlier hot patch
om.equity = 12000;
om.openPositions = [];
om.orderService = { balance: null, equity: null };
om._m20A1ScheduleRetainedSweep = () => {};
om._invalidateM19MarkerDeltaCache = () => {};
om._syncReplayHeaderStatsFromAccount = OrderManager.prototype._syncReplayHeaderStatsFromAccount;

om._m19CommitJournalArray([
    { id: 1, netPnL: 125, pnl: 999 },
    { id: 2, realizedPnL: -50, pnl: -500 },
], 'restore-hydrate');

assert.equal(om.balance, 10075, 'journal restore recomputes balance from canonical PnL fields');
assert.equal(om.realizedPnL, 75, 'header realized PnL stays tied to restored journal sum');
assert.equal(om.equity, 10075, 'equity is stable when no open positions exist after restore');
assert.equal(om.orderService.balance, 10075, 'shared order service sees restored account state');

console.log(disabled
    ? 'RED — switch OFF leaves stale account_runtime PnL after journal restore'
    : 'GREEN — journal restore is the account/PnL authority after refresh');
