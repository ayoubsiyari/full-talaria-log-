/**
 * Cluster G / TAL-01810: spread-side exits anchor to the hit candle (close/fill path).
 * GREEN: node order-exit-marker-spread-column.test.mjs
 * RED:   TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1=1 node order-exit-marker-spread-column.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1 === '1';
if (disabled) {
    global.window = { __TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1: true };
} else {
    global.window = {};
}
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const T0 = 1_700_000_000_000;
const bars = [
    { t: T0, l: 1.1010, h: 1.1020 },
    { t: T0 + 60_000, l: 1.1000, h: 1.1010 },
    { t: T0 + 120_000, l: 1.0995, h: 1.1005 },
];

const chart = {
    data: bars,
    replaySystem: { isActive: true },
    currentSymbol: 'EURUSD',
};

const om = Object.create(OrderManager.prototype);
om.chart = chart;
om._playbackReplaySystem = () => chart.replaySystem;
om._isMarkerTimeVisibleInReplay = () => true;
om._getCurrentCandleForChart = () => bars[2];
om._chartPlayheadBucketIndex = () => 2;
om._getActiveTicker = () => 'EURUSD';
om._positionTicker = () => 'EURUSD';
om._isPositionForActiveChart = () => true;
om.getCurrentCandle = () => bars[2];
om._evalCandleForPosition = () => bars[2];
om.balance = 10_000;
om.equity = 10_000;
om.estimateOpenLegPnLSlice = () => -10;
om._roundTripCommissionForLots = () => 0;
om.closedPositions = [];
om.pendingOrders = [];
om.tradeJournal = [];
om.scaledTrades = new Map();
om.splitTrades = new Map();
om.playOrderSound = () => {};
om._syncOrderServiceOpenAfterClose = () => {};
om._m20A1ScheduleRetainedSweep = () => {};
om.persistRuntimeOrderState = () => {};
om._freezeInTradeExcursionSnapshot = () => {};
om._exitMarkerAnchorTimeMsFromClose = OrderManager.prototype._exitMarkerAnchorTimeMsFromClose;
om._applyRealizedPnLToBalance = () => {};
om.removeOrderLine = () => {};
om.removeSLTPLines = () => {};
om.removeEntryMarker = () => {};
om.removeMultiTPAvgLine = () => {};
om.removeMfeMaeMarkers = () => {};
om._cleanupOrderVisualsAfterClose = () => {};
om.updatePositionsPanel = () => {};
om.upsertJournalEntry = () => ({ inserted: false, index: -1 });
om.persistJournal = () => {};
om.persistRuntimeOrderState = () => {};
om.updateJournalTab = () => {};
om.showNotification = () => {};
om.showTradeJournalModal = () => {};
om._enrichJournalEntryForPersistence = () => {};
om.openPositions = [{
    id: 5,
    type: 'BUY',
    ticker: 'EURUSD',
    openPrice: 1.1020,
    openTime: T0,
    entryMarkerTimeMs: T0,
    quantity: 1,
    status: 'OPEN',
}];
om.closedPositions = [];

let paintedIndex = null;
om.drawExitMarker = function paintedExit(order, closeData, targetChart) {
    const ch = targetChart || this.chart;
    const exitRef = {
        closeTime: closeData.closeTime,
        closePrice: closeData.closePrice,
        exitMarkerTimeMs: closeData.exitMarkerTimeMs ?? order.exitMarkerTimeMs,
        openTime: order.openTime,
        entryMarkerTimeMs: order.entryMarkerTimeMs,
    };
    paintedIndex = this._chartIndexForExitMarkerOnChart(ch, exitRef);
};

om.closePositionAtPrice(5, 1.0994, 'SL', null, null, T0 + 120_000);

assert.equal(
    paintedIndex,
    2,
    'SL close must paint exit marker on hit candle column, not entry',
);

console.log(disabled
    ? 'RED — legacy price refinement drifts spread-side exits back toward entry'
    : 'GREEN — canonical projection anchors spread-side exits to hit time on close');
