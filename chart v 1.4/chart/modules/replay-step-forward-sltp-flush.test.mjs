/**
 * Tick-mode manual step-forward must flush remaining intrabar SL/TP before
 * abandoning animatingCandle — otherwise a same-bar SELL SL wick is skipped
 * while a later-bar TP still closes.
 *
 *   node --test "chart v 1.4/chart/modules/replay-step-forward-sltp-flush.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
global.window = global.window || {};
const OrderManager = require('./order-manager.js');
const ReplaySystem = require('./replay-system.js');

function buildManager(replay, candle, closes) {
    const manager = Object.create(OrderManager.prototype);
    const chart = {
        currentFileId: 'file-es',
        currentSymbol: 'ES',
        replaySystem: replay,
    };
    manager.replaySystem = replay;
    manager.chart = chart;
    manager._playbackReplaySystem = () => replay;
    manager._resolveTickAnimReplaySystem = () => replay;
    manager.getCurrentCandle = () => candle;
    manager.pendingOrders = [];
    manager.openPositions = [{
        id: 42,
        ticker: 'ES',
        sourceFileId: 'file-es',
        type: 'SELL',
        openPrice: 4018.5,
        openTime: candle.t,
        quantity: 1,
        status: 'OPEN',
        stopLoss: 4022,
        takeProfit: 4010,
        _slNoTriggerBeforeTime: candle.t,
        _slNoTriggerBeforeTick: 10,
        _tpNoTriggerBeforeTime: candle.t,
        _tpNoTriggerBeforeTick: 10,
    }];
    manager.mfeMaeTrackingPositions = [];
    manager.balance = 50_000;
    manager.equity = 50_000;
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
    manager._calculatePositionPnL = () => 0;
    manager._barQuotesForSltp = (_position, high, low) => ({
        bidHigh: high,
        bidLow: low,
        askHigh: high,
        askLow: low,
    });
    manager._appendExcursionSnapshot = () => {};
    manager._updatePositionPriceExtremes = () => {};
    manager._gapFill = (level) => level;
    manager._stopLossFillPrice = (sl) => sl;
    manager.updateMfeMaeTracking = () => {};
    manager._finalizeOrderVisualsAfterBatchClose = () => {};
    manager._scheduleClosedJournalMarkerRedraw = () => {};
    manager._pauseReplayIfPlaying = () => {};
    manager._maybeLiquidateOnStopOut = () => {};
    manager.updatePositionsPanel = () => {};
    manager._pushSplitGroupSlClosesFromHit = (position, fillPx, positionsToClose) => {
        positionsToClose.push({ id: position.id, closePrice: fillPx, type: 'SL' });
    };
    manager.closePositionAtPrice = (...args) => closes.push(args);
    manager._seedOrderLifecycleEvent(manager.openPositions[0], candle);
    // Re-arm same-bar guards after seed (seed uses current lifecycle key).
    const pos = manager.openPositions[0];
    pos._slNoTriggerBeforeTime = candle.t;
    pos._slNoTriggerBeforeTick = 10;
    pos._tpNoTriggerBeforeTime = candle.t;
    pos._tpNoTriggerBeforeTick = 10;
    return manager;
}

test('step-forward flush closes SELL on remaining same-bar SL wick', () => {
    global.window = {};
    const t0 = 1_721_600_000_000;
    const candle = { t: t0, o: 4018, h: 4023.5, l: 4016, c: 4017 };
    // Path stays below SL until after placement tick 10, then wicked above SL.
    const path = new Array(72).fill(4018);
    for (let i = 0; i <= 10; i++) path[i] = 4018.2;
    for (let i = 11; i < 40; i++) path[i] = 4019;
    path[25] = 4022.5; // SL touch after guard
    for (let i = 41; i < 72; i++) path[i] = 4017;

    const replay = Object.create(ReplaySystem.prototype);
    replay.isActive = true;
    replay.playbackMode = 'tick';
    replay.getPlaybackMode = () => 'tick';
    replay.ticksPerCandle = 72;
    replay.tickProgress = 0;
    replay.tickElapsedMs = 0;
    replay._savedTickState = {
        animatingCandle: {
            t: t0,
            open: candle.o,
            high: 4019,
            low: candle.l,
            close: 4018.5,
            target: candle,
            cachedPath: path,
        },
        tickProgress: 12,
        tickElapsedMs: 0,
    };
    replay.animatingCandle = replay._savedTickState.animatingCandle;
    replay.getTickPath = () => path;
    replay.fullRawData = [
        { t: t0, o: 4018, h: 4023.5, l: 4016, c: 4017 },
        { t: t0 + 60_000, o: 4017, h: 4018, l: 4010, c: 4011 },
    ];
    replay.currentIndex = 0;
    replay.replayTimestamp = t0;
    replay.sessionStartIndex = 0;
    replay.isPlaying = false;
    replay.stepForward = () => { replay.currentIndex = 1; replay.replayTimestamp = t0 + 60_000; };
    replay._onFinestTfCadencePanelsChanged = () => {};
    replay.pause = () => {};

    const closes = [];
    const manager = buildManager(replay, candle, closes);
    replay.chart = { orderManager: manager };

    replay.requestStepForward();

    assert.equal(closes.length, 1, 'SL must close before the bar-step abandons the tick path');
    assert.equal(closes[0][0], 42);
    assert.equal(closes[0][2], 'SL');
    assert.equal(replay.animatingCandle, null, 'step still clears animating candle after flush');
});

test('paused mid-candle tick snapshot uses _savedTickState progress', () => {
    global.window = {};
    const replay = {
        isActive: true,
        playbackMode: 'tick',
        getPlaybackMode: () => 'tick',
        animatingCandle: { t: 1_721_600_000_000 },
        tickProgress: 0, // pause() zeroes this
        _savedTickState: {
            animatingCandle: { t: 1_721_600_000_000 },
            tickProgress: 27,
            tickElapsedMs: 1000,
        },
    };
    const manager = Object.create(OrderManager.prototype);
    manager._playbackReplaySystem = () => replay;
    manager.getCurrentCandle = () => ({ t: 1_721_600_000_000 });

    assert.deepEqual(manager._getCurrentTickSnapshot(), { t: 1_721_600_000_000, tick: 27 });
});

test('guarded BUY TP fires on piercing bar when anim was cleared', () => {
    global.window = {};
    const t0 = 1_721_600_000_000;
    const candle = { t: t0, o: 1.086, h: 1.091, l: 1.084, c: 1.088 };
    const path = new Array(72).fill(1.086);
    for (let i = 0; i <= 10; i++) path[i] = 1.0865;
    path[30] = 1.0905; // TP touch after guard
    path[71] = 1.088;

    const replay = {
        isActive: true,
        playbackMode: 'tick',
        getPlaybackMode: () => 'tick',
        animatingCandle: null, // cleared after pause/step bookkeeping
        tickProgress: 0,
        _savedTickState: null,
        getTickPath: () => path,
    };
    const manager = Object.create(OrderManager.prototype);
    manager._resolveTickAnimReplaySystem = () => replay;
    manager._playbackReplaySystem = () => replay;
    manager._sessionTradingCostsEnabled = () => false;

    assert.equal(
        manager._tickAnimOverridesGuard(10, candle, 1.09032, 'above', { type: 'BUY' }),
        true,
        'same-bar TP wick must count after guard even without a live animatingCandle',
    );
});
