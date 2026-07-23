/**
 * Candle step-forward: a Limit SELL fill + SL wick on the SAME bar must
 * activate the order first, then hit SL in that same updatePositions pass.
 *
 *   node --test "chart v 1.4/chart/modules/pending-fill-same-bar-sltp.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
global.window = {};

function orderManagerFor(replay) {
    const manager = Object.create(OrderManager.prototype);
    manager._playbackReplaySystem = () => replay;
    manager.replaySystem = replay;
    manager._resolveTickAnimReplaySystem = () => replay;
    manager._retainCurrentOrderExecutionSeries = () => {};
    manager.getCurrentCandle = () => ({ t: replay.replayTimestamp, o: 1854, h: 1861, l: 1853, c: 1854.25 });
    return manager;
}

test('_armPendingFillSameBarSltpGuards uses -1 (not Infinity) in candle mode', () => {
    global.window = {};
    const barT = 1_721_600_000_000;
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: barT,
        currentIndex: 0,
        fullRawData: [{ t: barT }],
        animatingCandle: null,
        tickProgress: 0,
    };
    const manager = orderManagerFor(replay);
    const candle = { t: barT, o: 1854, h: 1861, l: 1853, c: 1854.25 };
    const order = {
        id: 9,
        type: 'SELL',
        tpTargets: [{ id: 1, price: 1842, percentage: 100 }],
    };

    manager._armPendingFillSameBarSltpGuards(order, candle);

    assert.equal(order._slNoTriggerBeforeTick, -1,
        'fill must not keep placement Infinity — that blocks same-bar SL');
    assert.equal(order._tpNoTriggerBeforeTick, -1);
    assert.equal(order.tpTargets[0]._noTriggerBeforeTick, -1);
    assert.equal(
        manager._tickAnimOverridesGuard(order._slNoTriggerBeforeTick, candle, 1858.5, 'above'),
        true,
        'SELL SL above entry must see the fill candle high after arming',
    );

    const key = manager._currentOrderLifecycleEventKey(candle);
    assert.equal(order._lastOrderLifecycleEventKey, `__pre_fill__:${key}`);
    assert.equal(manager._claimOrderLifecycleEvent(order, candle), true,
        'same updatePositions pass must be able to claim once for SL after fill');
    assert.equal(manager._claimOrderLifecycleEvent(order, candle), false,
        'repeat claim on the same event must still be blocked');
});

test('updatePositions closes Limit SELL on fill candle when high pierces SL', () => {
    global.window = {};
    const barT = 1_721_600_000_000;
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: barT,
        currentIndex: 0,
        fullRawData: [{ t: barT }],
        animatingCandle: null,
        tickProgress: 0,
    };
    const candle = { t: barT, o: 1854, h: 1861, l: 1853, c: 1854.25 };
    const manager = orderManagerFor(replay);
    const chart = { currentFileId: 'file-es', currentSymbol: 'ES', replaySystem: replay };
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
    manager._getActiveTicker = () => 'ES';
    manager._getOrderContextChart = () => chart;
    manager._oiShouldSuppressSltpHits = () => false;
    manager._positionTicker = () => 'ES';
    manager._positionNeedsBackgroundBar = () => false;
    manager._evalCandleForPosition = () => candle;
    manager._resolveUnrealizedMarkPrice = () => candle.c;
    manager._calculatePositionPnL = () => 700;
    manager._barQuotesForSltp = (_position, high, low, open) => ({
        bidHigh: high, bidLow: low, askHigh: high, askLow: low, midOpen: open,
    });
    manager._appendExcursionSnapshot = () => {};
    manager._updatePositionPriceExtremes = () => {};
    manager._gapFill = (level) => level;
    manager._stopLossFillPrice = (level) => level;
    manager._slCloseHitType = () => 'SL';
    manager._sessionTradingCostsEnabled = () => false;
    manager._askFromMid = (px) => px;
    manager._bidFromMid = (px) => px;
    manager._pushSplitGroupSlClosesFromHit = (position, fillPx, positionsToClose) => {
        positionsToClose.push({ id: position.id, closePrice: fillPx, type: 'SL' });
    };
    manager.updateMfeMaeTracking = () => {};
    manager._finalizeOrderVisualsAfterBatchClose = () => {};
    manager._scheduleClosedJournalMarkerRedraw = () => {};
    manager._pauseReplayIfPlaying = () => {};
    manager._maybeLiquidateOnStopOut = () => {};
    manager.updatePositionsPanel = () => {};
    manager.checkPendingOrders = () => false;

    const position = {
        id: 9,
        ticker: 'ES',
        sourceFileId: 'file-es',
        type: 'SELL',
        openPrice: 1856,
        openTime: barT,
        quantity: 8,
        status: 'OPEN',
        stopLoss: 1858.5,
        takeProfit: 1842,
        _fillCandleTime: barT,
        _fillOrderType: 'limit',
    };
    manager.openPositions = [position];
    manager._armPendingFillSameBarSltpGuards(position, candle);

    const closes = [];
    manager.closePositionAtPrice = (...args) => closes.push(args);

    manager.updatePositions();

    assert.equal(closes.length, 1, 'fill candle that pierces SL must close in the same pass');
    assert.equal(closes[0][0], 9);
    assert.equal(closes[0][2], 'SL');
});

test('legacy seed+Infinity would leave the position open (documents the bug class)', () => {
    global.window = {};
    const barT = 1_721_600_000_000;
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: barT,
        currentIndex: 0,
        fullRawData: [{ t: barT }],
        animatingCandle: null,
        tickProgress: 0,
    };
    const candle = { t: barT, o: 1854, h: 1861, l: 1853, c: 1854.25 };
    const manager = orderManagerFor(replay);
    const chart = { currentFileId: 'file-es', currentSymbol: 'ES', replaySystem: replay };
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
    manager._getActiveTicker = () => 'ES';
    manager._getOrderContextChart = () => chart;
    manager._oiShouldSuppressSltpHits = () => false;
    manager._positionTicker = () => 'ES';
    manager._positionNeedsBackgroundBar = () => false;
    manager._evalCandleForPosition = () => candle;
    manager._resolveUnrealizedMarkPrice = () => candle.c;
    manager._calculatePositionPnL = () => 700;
    manager._barQuotesForSltp = (_position, high, low, open) => ({
        bidHigh: high, bidLow: low, askHigh: high, askLow: low, midOpen: open,
    });
    manager._appendExcursionSnapshot = () => {};
    manager._updatePositionPriceExtremes = () => {};
    manager._gapFill = (level) => level;
    manager.updateMfeMaeTracking = () => {};
    manager._finalizeOrderVisualsAfterBatchClose = () => {};
    manager._scheduleClosedJournalMarkerRedraw = () => {};
    manager._pauseReplayIfPlaying = () => {};
    manager._maybeLiquidateOnStopOut = () => {};
    manager.updatePositionsPanel = () => {};
    manager.checkPendingOrders = () => false;

    const position = {
        id: 9,
        ticker: 'ES',
        sourceFileId: 'file-es',
        type: 'SELL',
        openPrice: 1856,
        openTime: barT,
        quantity: 8,
        status: 'OPEN',
        stopLoss: 1858.5,
        takeProfit: 1842,
        _fillCandleTime: barT,
        _fillOrderType: 'limit',
        _slNoTriggerBeforeTime: barT,
        _slNoTriggerBeforeTick: Infinity,
        _tpNoTriggerBeforeTime: barT,
        _tpNoTriggerBeforeTick: Infinity,
    };
    manager.openPositions = [position];
    manager._seedOrderLifecycleEvent(position, candle);

    const closes = [];
    manager.closePositionAtPrice = (...args) => closes.push(args);
    manager.updatePositions();

    assert.equal(closes.length, 0,
        'pre-fix seed+Infinity must not close on the fill candle (bug class)');
});
