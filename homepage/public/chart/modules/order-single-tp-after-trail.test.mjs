/**
 * Cluster G / TAL-01933 single TP after trailing SL (updatePositions fill path).
 * GREEN: node order-single-tp-after-trail.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL=1 node order-single-tp-after-trail.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1: disabled,
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function managerForBar(barT, candle) {
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: barT,
        animatingCandle: null,
        tickProgress: 0,
    };
    const chart = { currentSymbol: 'EURUSD', currentFileId: 'FILE_EUR', replaySystem: replay };
    const manager = Object.create(OrderManager.prototype);
    manager._playbackReplaySystem = () => replay;
    manager.replaySystem = replay;
    manager.chart = chart;
    manager.getCurrentCandle = () => candle;
    manager.pendingOrders = [];
    manager.mfeMaeTrackingPositions = [];
    manager.balance = 10_000;
    manager.equity = 10_000;
    manager._shouldDeferOrderExecutionForTimeframeTransition = () => false;
    manager._oiMaybeCancelProvisionalOnReplayStop = () => {};
    manager._getMultichartParentGuardCandle = () => null;
    manager._syncPreviewToReplayPrice = () => {};
    manager._getActiveTicker = () => 'EURUSD';
    manager._getOrderContextChart = () => chart;
    manager._oiShouldSuppressSltpHits = () => false;
    manager._positionTicker = () => 'EURUSD';
    manager._positionNeedsBackgroundBar = () => false;
    manager._evalCandleForPosition = () => candle;
    manager._resolveUnrealizedMarkPrice = () => candle.c;
    manager._calculatePositionPnL = () => 0;
    manager._barQuotesForSltp = (_position, high, low, open) => ({
        bidHigh: high, bidLow: low, askHigh: high, askLow: low, midOpen: open,
    });
    manager._appendExcursionSnapshot = () => {};
    manager._updatePositionPriceExtremes = () => {};
    manager._gapFill = (level) => level;
    manager._stopLossFillPrice = (level) => level;
    manager._slCloseHitType = () => 'SL';
    manager._sessionTradingCostsEnabled = () => false;
    manager.updateMfeMaeTracking = () => {};
    manager._finalizeOrderVisualsAfterBatchClose = () => {};
    manager._scheduleClosedJournalMarkerRedraw = () => {};
    manager._pauseReplayIfPlaying = () => {};
    manager._maybeLiquidateOnStopOut = () => {};
    manager.updatePositionsPanel = () => {};
    manager.checkPendingOrders = () => false;
    manager._pushSplitGroupSlClosesFromHit = (position, fillPx, positionsToClose) => {
        positionsToClose.push({ id: position.id, closePrice: fillPx, type: 'SL' });
    };
    manager._claimOrderLifecycleEvent = OrderManager.prototype._claimOrderLifecycleEvent;
    manager._currentOrderLifecycleEventKey = OrderManager.prototype._currentOrderLifecycleEventKey;
    manager._isNoTriggerGuardActive = () => false;
    manager._shouldSkipSlTpAfterBeThisBar = () => false;
    manager._shouldSkipSLOnFillCandle = () => false;
    manager._tickAnimOverridesGuard = () => false;
    manager._recordSlTriggerDiag = () => {};
    manager.suppressTpHitsWhileDraggingTp = false;
    return manager;
}

{
    const barT = 1_721_600_000_000;
    const candle = { t: barT, o: 1.099, h: 1.1015, l: 1.0985, c: 1.1005 };
    const manager = managerForBar(barT, candle);
    const position = {
        id: 42,
        ticker: 'EURUSD',
        type: 'BUY',
        openPrice: 1.098,
        openTime: barT - 60_000,
        quantity: 1,
        status: 'OPEN',
        takeProfit: 1.1000,
        stopLoss: 1.1050,
        _trailSlBarT: barT,
    };
    const positionsToClose = [];
    manager._collectBackgroundSLTPTouches(
        position,
        candle,
        positionsToClose,
        new Set(),
        new Set(),
    );

    assert.equal(positionsToClose.length, 1, 'trailed SL past TP must still TP on hit bar');
    assert.equal(positionsToClose[0].id, 42);
    assert.equal(positionsToClose[0].type, 'TP');
}

console.log(disabled
    ? 'RED — switch OFF reproduces single TP skipped after trailing SL crosses it'
    : 'GREEN — single TP stays executable after trailing SL crosses it');
