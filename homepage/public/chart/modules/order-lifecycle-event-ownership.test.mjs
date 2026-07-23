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
 *
 * M19-F RED-again (restore order-present playback slowdown):
 *   TALARIA_DISABLE_ORDER_MONEY_PATH_BATCH_V1=1 node --test \
 *     "chart v 1.4/chart/modules/order-lifecycle-event-ownership.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
global.window = {};
const ReplaySystem = require('./replay-system.js');
const KILL_SWITCH = process.env.TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1 === '1';
const MONEY_PATH_BATCH_KILL = process.env.TALARIA_DISABLE_ORDER_MONEY_PATH_BATCH_V1 === '1';

function defaultWindow() {
    const out = KILL_SWITCH
        ? { __TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1: true }
        : {};
    if (MONEY_PATH_BATCH_KILL) {
        out.__TALARIA_DISABLE_ORDER_MONEY_PATH_BATCH_V1 = true;
    }
    return out;
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

test('tick identity wins over fine-execution replay:<barT> stamp', () => {
    global.window = defaultWindow();
    const barT = 1_721_600_000_000;
    const replay = {
        isActive: true,
        playbackMode: 'tick',
        getPlaybackMode: () => 'tick',
        animatingCandle: { t: barT },
        tickProgress: 27,
        replayTimestamp: barT,
        currentIndex: 0,
        fullRawData: [{ t: barT }],
    };
    const manager = orderManagerFor(replay);
    manager.replaySystem = replay;
    const executionCandle = {
        t: barT,
        o: 1.08,
        h: 1.091,
        l: 1.079,
        c: 1.085,
        _orderLifecycleEventKey: `replay:${barT}`,
    };
    const position = {};
    manager._seedOrderLifecycleEvent(position, executionCandle);
    assert.equal(
        manager._currentOrderLifecycleEventKey(executionCandle),
        `tick:${barT}:27`,
        'tick playback must not collapse to a bar-stable replay key',
    );
    assert.equal(manager._claimOrderLifecycleEvent(position, executionCandle), false,
        'seeded placement tick is not executable');
    replay.tickProgress = 40;
    assert.equal(manager._claimOrderLifecycleEvent(position, executionCandle), true,
        'a later tick on the same bar is a new market event (TP/SL can fire)');
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

test('1m order execution candle survives a 1D display switch', () => {
    global.window = defaultWindow();
    const dayStart = 1_721_563_200_000;
    const fineBars = [
        { t: dayStart + 60_000, o: 1140, h: 1141, l: 1139, c: 1140.5 },
        { t: dayStart + 120_000, o: 1140.5, h: 1142, l: 1134.75, c: 1138 },
    ];
    const dailyBar = { t: dayStart, o: 1140, h: 1155.75, l: 1130, c: 1155.75 };
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: fineBars[1].t,
        currentIndex: 0,
        fullRawData: [dailyBar],
        animatingCandle: null,
    };
    const chart = {
        currentFileId: 'file-es',
        currentSymbol: 'ES',
        currentTimeframe: '1d',
        replaySystem: replay,
        rawData: [dailyBar],
        data: [dailyBar],
        parseTimeframe: (tf) => (tf === '1m' ? 60_000 : 86_400_000),
        _getNativeRawStepMs: () => 86_400_000,
        _getBtTfDataCache: (_fileId, tf) => (tf === '1m' ? { rawData: fineBars } : null),
    };
    const manager = orderManagerFor(replay);
    manager.replaySystem = replay;
    manager.chart = chart;
    manager.openPositions = [{ id: 1 }];
    manager.pendingOrders = [{ id: 2 }];

    assert.equal(manager.getOrderExecutionCadenceMs(), 60_000,
        'active orders pin execution to the finest retained source series');
    assert.deepEqual(manager._getCurrentCandleForChart(chart), fineBars[1],
        'order decisions must read the exact 1m bar, never the full 1D high/low');
});

test('placement retains its 1m execution feed before the display master is replaced', () => {
    global.window = defaultWindow();
    const t0 = 1_721_563_200_000;
    const fineBars = [
        { t: t0, o: 1140, h: 1141, l: 1139, c: 1140.5 },
        { t: t0 + 60_000, o: 1140.5, h: 1142, l: 1134.75, c: 1138 },
    ];
    const replay = {
        isActive: true,
        playbackMode: 'candle',
        getPlaybackMode: () => 'candle',
        replayTimestamp: t0,
        currentIndex: 0,
        fullRawData: fineBars,
        rawTimeframe: '1m',
        animatingCandle: null,
    };
    const chart = {
        currentFileId: 'file-es',
        currentSymbol: 'ES',
        currentTimeframe: '1m',
        _nativeRawFetchTf: '1m',
        replaySystem: replay,
        rawData: fineBars,
        data: fineBars,
        parseTimeframe: (tf) => (tf === '1m' ? 60_000 : 86_400_000),
        _getNativeRawStepMs: () => (chart.currentTimeframe === '1m' ? 60_000 : 86_400_000),
        _getBtTfDataCache: () => null,
    };
    const manager = orderManagerFor(replay);
    manager.replaySystem = replay;
    manager.chart = chart;
    manager.openPositions = [];
    manager.pendingOrders = [];
    manager.mfeMaeTrackingPositions = [];
    const pending = { id: 3, status: 'PENDING' };

    manager._seedOrderLifecycleEvent(pending, fineBars[0]);
    manager.pendingOrders.push(pending);

    const dailyBars = [
        { t: t0, o: 1140, h: 1155.75, l: 1130, c: 1155.75 },
        { t: t0 + 86_400_000, o: 1156, h: 1160, l: 1145, c: 1150 },
    ];
    chart.currentTimeframe = '1d';
    chart._nativeRawFetchTf = '1d';
    chart.rawData = [dailyBars[0]];
    chart.data = [dailyBars[0]];
    replay.fullRawData = dailyBars;
    replay.rawTimeframe = '1d';
    replay.replayTimestamp = fineBars[1].t;

    assert.equal(manager.getOrderExecutionCadenceMs(), 60_000);
    assert.deepEqual(manager._getCurrentCandleForChart(chart), fineBars[1],
        'bounded display caches may evict data, but an active order keeps its placement feed');
});

test('replay batches paint while retaining every fine order-lifecycle event', () => {
    global.window = defaultWindow();
    const replay = Object.create(ReplaySystem.prototype);
    replay.chart = {
        currentTimeframe: '1d',
        orderManager: {
            getOrderExecutionCadenceMs: () => (
                KILL_SWITCH ? null : 60_000
            ),
        },
    };
    replay.fullRawData = [
        { t: 1_721_563_200_000 },
        { t: 1_721_649_600_000 },
    ];
    replay.isPlaying = true;
    replay.isActive = true;
    replay.speed = 60;
    replay.playbackMode = 'tick';
    replay.getPlaybackMode = () => replay.playbackMode;
    replay.stepTimeframeOverride = null;

    assert.equal(replay._isFinestTfReplayCadenceEnabled(), true);
    assert.equal(replay._getFinestReplayCadenceMs(), 60_000);
    assert.equal(replay._finestTfCadenceSubdivisions(), 1440);
    assert.equal(replay._shouldUseTickAnimation(), false,
        'a synthetic daily tick path must not replace the retained chronological 1m feed');
    replay.playbackMode = 'candle';
    for (const speed of [1, 60, 100]) {
        replay.speed = speed;
        const cadence = replay.getCandlePlaybackCadence();
        const coarseCandlesPerSecond = (
            cadence.stepsPerTick * (1000 / cadence.intervalMs)
        ) / 1440;
        assert.ok(Math.abs(coarseCandlesPerSecond - speed) / speed < 0.02,
            `order path must retain ${speed} selected-TF candle(s)/sec; got ${coarseCandlesPerSecond}`);
    }
    replay.currentIndex = 0;
    replay.replayTimestamp = replay.fullRawData[0].t;
    replay._advanceReplayPlayheadOneStep();
    assert.equal(replay.replayTimestamp, replay.fullRawData[0].t + 60_000,
        'one Play step advances the money path by one retained 1m event, not one day');
    assert.equal(replay.currentIndex, 0,
        'the 1D display candle remains forming while the 1m execution clock advances');
});

function batchedMoneyPathReplay({ stopAtStep = null } = {}) {
    const t0 = 1_721_563_200_000;
    const replay = Object.create(ReplaySystem.prototype);
    const evaluated = [];
    let paints = 0;
    replay.chart = {
        currentTimeframe: '1d',
        orderManager: {
            getOrderExecutionCadenceMs: () => 60_000,
            updatePositions: () => {
                evaluated.push(replay.replayTimestamp);
                if (stopAtStep != null
                    && replay.replayTimestamp === t0 + stopAtStep * 60_000) {
                    replay.isPlaying = false;
                }
            },
        },
    };
    replay.fullRawData = [
        { t: t0 },
        { t: t0 + 86_400_000 },
    ];
    replay.currentIndex = 0;
    replay.replayTimestamp = t0;
    replay.isPlaying = true;
    replay.isActive = true;
    replay.speed = 60;
    replay.playbackMode = 'candle';
    replay.getPlaybackMode = () => replay.playbackMode;
    replay.stepTimeframeOverride = null;
    replay.autoScrollEnabled = true;
    replay._shouldAutoScrollChartUpdate = () => true;
    replay.getCandlePlaybackCadence = () => ({
        intervalMs: 16,
        stepsPerTick: 4,
        orderMoneyPath: true,
    });
    replay.updateChartData = (_autoScroll, options = {}) => {
        paints++;
        if (!options.skipOrderUpdate) replay.chart.orderManager.updatePositions();
    };
    return {
        replay,
        t0,
        evaluated,
        getPaints: () => paints,
    };
}

test('batched order playback evaluates every hidden fine step and paints once', () => {
    global.window = defaultWindow();
    const run = batchedMoneyPathReplay();

    run.replay._runCandlePlaybackTick();

    assert.deepEqual(run.evaluated, [1, 2, 3, 4].map((step) => run.t0 + step * 60_000),
        'every retained 1m bar must reach pending/active order evaluation');
    assert.equal(run.getPaints(), 1,
        'four money-path evaluations should produce one chart paint, not four');
});

test('batched order playback stops and paints on the exact lifecycle event', () => {
    global.window = defaultWindow();
    const run = batchedMoneyPathReplay({ stopAtStep: 2 });

    run.replay._runCandlePlaybackTick();

    assert.deepEqual(run.evaluated, [run.t0 + 60_000, run.t0 + 120_000],
        'no fine event after the fill/SL/TP pause may be consumed');
    assert.equal(run.replay.replayTimestamp, run.t0 + 120_000,
        'playhead must stop on the exact triggering fine bar');
    assert.equal(run.getPaints(), 1,
        'a hidden lifecycle pause must force one final visible paint');
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
