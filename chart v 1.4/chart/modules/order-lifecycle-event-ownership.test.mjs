/**
 * M10 / TAL-01815, TAL-01798, TAL-01800 — order lifecycle mutations may
 * consume only future canonical replay price events, never view recomputes.
 *
 * GREEN:
 *   node --test "chart v 1.4/chart/modules/order-lifecycle-event-ownership.test.mjs"
 *
 * RED-again (kill-switch):
 *   TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1=1 node --test \
 *     "chart v 1.4/chart/modules/order-lifecycle-event-ownership.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const KILL_SWITCH = process.env.TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1 === '1';

function defaultWindow() {
    return KILL_SWITCH
        ? { __TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1: true }
        : {};
}

function orderManagerFor(replaySystem) {
    const manager = Object.create(OrderManager.prototype);
    manager._playbackReplaySystem = () => replaySystem;
    manager.getCurrentCandle = () => ({ t: 1_721_600_000_000, o: 100, h: 115, l: 95, c: 100 });
    return manager;
}

test('candle-mode placement owns a future-candle boundary', () => {
    global.window = defaultWindow();
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        animatingCandle: null,
        tickProgress: 0,
    };
    const manager = orderManagerFor(replay);
    manager._resolveTickAnimReplaySystem = () => replay;
    const snapshot = manager._getCurrentTickSnapshot();

    assert.equal(snapshot.tick, Infinity,
        'a market/pending activation must not consume stale high/low from its current candle');
    assert.equal(
        manager._tickAnimOverridesGuard(snapshot.tick, manager.getCurrentCandle(), 110, 'above'),
        false,
        'even a stale full-candle high beyond TP cannot close the newly activated order',
    );
    assert.equal(
        manager._isNoTriggerGuardActive(snapshot.t, snapshot.tick, { t: snapshot.t + 60_000 }),
        false,
        'the barrier expires when replay advances to a later candle',
    );
});

test('tick-mode placement owns price action after the current tick', () => {
    global.window = defaultWindow();
    const replay = {
        isActive: true,
        playbackMode: 'tick',
        getPlaybackMode: () => 'tick',
        animatingCandle: { t: 1_721_600_000_000 },
        tickProgress: 27,
    };
    const snapshot = orderManagerFor(replay)._getCurrentTickSnapshot();

    assert.deepEqual(snapshot, { t: 1_721_600_000_000, tick: 27 });
});

test('viewport and timeframe recomputes cannot replay one market event', () => {
    global.window = defaultWindow();
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: 1_721_600_000_000,
        currentIndex: 10,
        fullRawData: [{ t: 1_721_600_000_000 }],
        animatingCandle: null,
    };
    const manager = orderManagerFor(replay);
    manager.replaySystem = replay;
    const position = {};
    const oneMinuteBar = { t: 1_721_600_000_000 };
    const fifteenMinuteResample = { t: 1_721_599_100_000 };
    const newlyPlaced = {};
    manager._seedOrderLifecycleEvent(newlyPlaced, oneMinuteBar);
    assert.equal(Object.keys(newlyPlaced).includes('_lastOrderLifecycleEventKey'), false,
        'internal execution watermark must not leak into persisted order records');
    assert.equal(manager._claimOrderLifecycleEvent(newlyPlaced, oneMinuteBar), false,
        'placement seeds the current event so activation cannot consume it');

    assert.equal(manager._claimOrderLifecycleEvent(position, oneMinuteBar), false,
        'first observation establishes a non-executing baseline');
    assert.equal(manager._claimOrderLifecycleEvent(position, oneMinuteBar), false,
        'pan/reset on the same replay event cannot execute it again');
    assert.equal(manager._claimOrderLifecycleEvent(position, fifteenMinuteResample), false,
        'a TF-dependent display-candle timestamp cannot create a new market event');

    replay.replayTimestamp += 60_000;
    assert.equal(manager._claimOrderLifecycleEvent(newlyPlaced, { t: replay.replayTimestamp }), true,
        'a newly placed order is eligible on the first future event');
    assert.equal(manager._claimOrderLifecycleEvent(position, { t: replay.replayTimestamp }), true,
        'real replay advancement owns exactly one execution opportunity');
    assert.equal(manager._claimOrderLifecycleEvent(position, { t: replay.replayTimestamp }), false,
        'the advanced event cannot be replayed by another chart-state recompute');

    replay.replayTimestamp += 60_000;
    manager.openPositions = [position];
    manager.pendingOrders = [];
    manager._refreshAllGuardsToTimestamp(replay.replayTimestamp, Infinity);
    assert.equal(manager._claimOrderLifecycleEvent(position, { t: replay.replayTimestamp }), false,
        'TF/seek guard refresh rebases ownership instead of executing the destination OHLC');
});

test('updatePositions closes only after canonical replay time advances', () => {
    global.window = defaultWindow();
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: 1_721_600_000_000,
        currentIndex: 10,
        fullRawData: [],
        animatingCandle: null,
    };
    let candle = { t: replay.replayTimestamp, o: 100, h: 115, l: 95, c: 100 };
    const manager = orderManagerFor(replay);
    const chart = { currentFileId: 'file-eur', currentSymbol: 'EURUSD', replaySystem: replay };
    manager.replaySystem = replay;
    manager.chart = chart;
    manager.getCurrentCandle = () => candle;
    manager.pendingOrders = [];
    manager.openPositions = [{
        id: 7,
        ticker: 'EURUSD',
        sourceFileId: 'file-eur',
        type: 'BUY',
        openPrice: 100,
        openTime: candle.t,
        quantity: 1,
        status: 'OPEN',
        stopLoss: 90,
        takeProfit: 110,
    }];
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
    manager._barQuotesForSltp = (_position, high, low) => ({
        bidHigh: high,
        bidLow: low,
        askHigh: high,
        askLow: low,
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
    const closes = [];
    manager.closePositionAtPrice = (...args) => closes.push(args);
    manager._seedOrderLifecycleEvent(manager.openPositions[0], candle);

    manager.updatePositions();
    assert.equal(closes.length, 0,
        'placement/render on the current candle cannot consume its stale TP-crossing high');

    replay.replayTimestamp += 60_000;
    candle = { ...candle, t: replay.replayTimestamp };
    manager.updatePositions();
    assert.deepEqual(closes[0]?.slice(0, 3), [7, 110, 'TP'],
        'the same TP closes normally after real replay advancement');

    manager.updatePositions();
    assert.equal(closes.length, 1,
        'a pan/reset/render repeat at the advanced timestamp cannot close again');
});

test('pending activation also requires a future canonical event', () => {
    global.window = defaultWindow();
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: 1_721_600_000_000,
        currentIndex: 10,
        fullRawData: [],
        animatingCandle: null,
    };
    let candle = { t: replay.replayTimestamp, o: 100, h: 101, l: 98, c: 100 };
    const manager = orderManagerFor(replay);
    manager.replaySystem = replay;
    manager.chart = { currentFileId: 'file-eur', currentSymbol: 'EURUSD', replaySystem: replay };
    manager.getCurrentCandle = () => candle;
    manager._getActiveTicker = () => 'EURUSD';
    manager._normalizeTicker = (value) => String(value || '').replace('/', '').toUpperCase();
    manager._getBackgroundBarForTicker = () => null;
    manager.pendingOrders = [{
        id: 8,
        status: 'PENDING',
        ticker: 'EURUSD',
        orderType: 'limit',
        direction: 'BUY',
        entryPrice: 99,
        _noFillBeforeTime: candle.t,
        _noFillBeforeTick: Infinity,
    }];
    const fills = [];
    manager.executePendingOrder = (...args) => fills.push(args);
    manager._seedOrderLifecycleEvent(manager.pendingOrders[0], candle);

    manager.checkPendingOrders(candle);
    assert.equal(fills.length, 0,
        'a pending order cannot activate from the candle already visible at placement');

    replay.replayTimestamp += 60_000;
    candle = { ...candle, t: replay.replayTimestamp };
    manager.checkPendingOrders(candle);
    assert.equal(fills.length, 1, 'the pending order activates on the first future crossing event');
    assert.equal(manager.pendingOrders.length, 0, 'activation removes the pending record exactly once');
});

test('kill-switch reconstructs the stale-candle failure class', () => {
    global.window = { __TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1: true };
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        animatingCandle: null,
        tickProgress: 0,
    };
    const manager = orderManagerFor(replay);
    const snapshot = manager._getCurrentTickSnapshot();

    assert.equal(snapshot.tick, -1,
        'legacy candle-mode guard exposes the full current OHLC to immediate execution');
    const position = {};
    assert.equal(manager._claimOrderLifecycleEvent(position, manager.getCurrentCandle()), true);
    assert.equal(manager._claimOrderLifecycleEvent(position, manager.getCurrentCandle()), true,
        'legacy mode re-evaluates the same market event');
});

test('non-replay pricing keeps the legacy no-tick sentinel', () => {
    global.window = defaultWindow();
    const snapshot = orderManagerFor({ isActive: false })._getCurrentTickSnapshot();
    assert.deepEqual(snapshot, { t: null, tick: -1 });
});
