/**
 * Cluster G / TAL-01809 account balance floor via user close path.
 * GREEN: node order-balance-floor.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_BALANCE_FLOOR=1 node order-balance-floor.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_BALANCE_FLOOR === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1: disabled,
};
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const barT = 1_721_600_000_000;
const candle = { t: barT, c: 1.1 };

const om = Object.create(OrderManager.prototype);
om.balance = 100;
om.initialBalance = 100;
om.equity = 100;
om.openPositions = [{
    id: 7,
    type: 'BUY',
    ticker: 'EURUSD',
    quantity: 1,
    openPrice: 1.1,
    openTime: barT,
    status: 'OPEN',
}];
om.closedPositions = [];
om.pendingOrders = [];
om.tradeJournal = [];
om.playOrderSound = () => {};
om.persistRuntimeOrderState = () => {};
om._syncOrderServiceOpenAfterClose = () => {};
om._m20A1ScheduleRetainedSweep = () => {};
om.removeOrderLine = () => {};
om.removeSLTPLines = () => {};
om.removeMultiTPAvgLine = () => {};
om.removeMfeMaeMarkers = () => {};
om._cleanupOrderVisualsAfterClose = () => {};
om.scaledTrades = new Map();
om.splitTrades = new Map();
om.chart = { currentSymbol: 'EURUSD', replaySystem: { isActive: true } };
om.getCurrentCandle = () => candle;
om._getActiveTicker = () => 'EURUSD';
om._positionTicker = () => 'EURUSD';
om._applyHalfSpreadExitPrice = (px) => px;
om.estimateOpenLegPnLSlice = () => -250;
om._roundTripCommissionForLots = () => 0;
om._exitMarkerAnchorTimeMsFromClose = () => barT;
om.drawExitMarker = () => {};
om.removeEntryMarker = () => {};
om.updatePositionsPanel = () => {};
om.upsertJournalEntry = () => ({ inserted: false });
om.showTradeJournalModal = () => {};
om._syncReplayHeaderStatsFromAccount = OrderManager.prototype._syncReplayHeaderStatsFromAccount;
om.recomputeAccountFromJournal = OrderManager.prototype.recomputeAccountFromJournal;

om.closePosition(7);
assert.equal(om.balance, 0, 'manual close loss must floor balance at zero');

om.balance = 100;
om.tradeJournal = [{ id: 1, netPnL: -175 }];
om.recomputeAccountFromJournal();
assert.equal(om.balance, 0, 'journal recompute must floor balance at zero');

console.log(disabled
    ? 'RED — switch OFF allows negative account balance'
    : 'GREEN — user close and journal recompute floor balance at zero');
