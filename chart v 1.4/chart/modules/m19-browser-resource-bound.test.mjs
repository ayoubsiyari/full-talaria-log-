/**
 * M19-G — browser resource bounds for long replay with orders.
 *
 * Canonical:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-browser-resource-bound.test.mjs"
 *
 * RED-again:
 *   TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1=1 node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-browser-resource-bound.test.mjs"
 *   TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1=1 node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-browser-resource-bound.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const TICK_CACHE_KILL =
  String(process.env.TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1 || '').trim() === '1';
const HOT_LOG_KILL =
  String(process.env.TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 || '').trim() === '1';

function installWindow() {
  global.window = {
    __TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1: TICK_CACHE_KILL,
    __TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1: HOT_LOG_KILL,
    __TALARIA_DEBUG: false,
    __TALARIA_M19_HOTPATH_LOGS: false,
    __ORDER_MANAGER_DEBUG__: false,
    addEventListener() {},
    removeEventListener() {},
    location: { href: 'http://local.test/chart?sessionId=m19-g' },
  };
}

installWindow();
const ReplaySystem = require('./replay-system.js');
const OrderManager = require('./order-manager.js');

function makeCandles(count) {
  const t0 = 1_700_000_000_000;
  return Array.from({ length: count }, (_, i) => {
    const open = 1.1 + (i % 100) * 0.000001;
    return {
      t: t0 + i * 60_000,
      o: open,
      h: open + 0.0004,
      l: open - 0.0004,
      c: open + 0.00005,
    };
  });
}

test('three-month tick paths stay lazy, bounded, and deterministic', () => {
  installWindow();
  const replay = Object.create(ReplaySystem.prototype);
  replay.ticksPerCandle = 72;
  replay.fullRawData = makeCandles(130_000);

  replay.buildTickPathCache();
  assert.equal(Object.keys(replay.tickPathCache).length, 0,
    'entering replay must not eagerly retain a path for every loaded minute');

  const firstExpected = replay.getTickPath(replay.fullRawData[0]).slice();
  for (const candle of replay.fullRawData) replay.getTickPath(candle);

  const keys = Object.keys(replay.tickPathCache);
  const max = replay._tickPathCacheMaxEntries();
  assert.ok(keys.length <= max,
    `tick path cache must stay at or below ${max}; got ${keys.length}`);
  assert.ok(!Object.prototype.hasOwnProperty.call(
    replay.tickPathCache,
    String(replay.fullRawData[0].t),
  ), 'old paths must be evicted during a long forward replay');
  assert.ok(keys.length * replay.ticksPerCandle * 8 <= max * 72 * 8,
    'retained numeric path payload must remain constant-size');

  const firstRegenerated = replay.getTickPath(replay.fullRawData[0]);
  assert.deepEqual(firstRegenerated, firstExpected,
    'eviction must not change deterministic tick order or prices');

  // Existing chart/panel reset contracts replace the object directly.
  replay.tickPathCache = {};
  replay.getTickPath(replay.fullRawData.at(-1));
  assert.equal(Object.keys(replay.tickPathCache).length, 1,
    'direct cache replacement must also reset the FIFO index');
});

test('diagnostic tick-cache kill reconstructs eager all-history retention', () => {
  installWindow();
  const previous = window.__TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1;
  window.__TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1 = true;
  try {
    const replay = Object.create(ReplaySystem.prototype);
    replay.ticksPerCandle = 72;
    replay.fullRawData = makeCandles(2_000);
    replay.buildTickPathCache();
    assert.equal(Object.keys(replay.tickPathCache).length, replay.fullRawData.length);
  } finally {
    window.__TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1 = previous;
  }
});

function makeOrderHotPath() {
  const candle = {
    t: 1_700_000_000_000,
    o: 1,
    h: 1.1,
    l: 0.9,
    c: 1,
  };
  const chart = {
    currentFileId: 'm19-g-file',
    currentSymbol: 'EURUSD',
  };
  const position = {
    id: 1,
    type: 'BUY',
    ticker: 'EURUSD',
    sourceFileId: 'm19-g-file',
    quantity: 1,
    openPrice: 1,
    openTime: candle.t - 60_000,
    stopLoss: 0.5,
    takeProfit: 2,
    tpTargets: [{ id: 1, price: 2, percentage: 100, hit: false }],
    autoBreakeven: false,
    trailingStop: null,
    unrealizedPnL: 0,
  };
  const om = Object.create(OrderManager.prototype);
  Object.assign(om, {
    chart,
    replaySystem: { isActive: true, isPlaying: true },
    openPositions: [position],
    pendingOrders: [],
    mfeMaeTrackingPositions: [],
    balance: 10_000,
    equity: 10_000,
    orderService: null,
  });
  om._usesHostProjectedOrderRuntime = () => false;
  om._shouldDeferOrderExecutionForTimeframeTransition = () => false;
  om._oiMaybeCancelProvisionalOnReplayStop = () => {};
  om._getMultichartParentGuardCandle = () => null;
  om.getCurrentCandle = () => candle;
  om.checkPendingOrders = () => false;
  om._syncPreviewToReplayPrice = () => {};
  om._getActiveTicker = () => 'EURUSD';
  om._getOrderContextChart = () => chart;
  om._positionTicker = () => 'EURUSD';
  om._positionNeedsBackgroundBar = () => false;
  om._evalCandleForPosition = (_p, c) => c;
  om._resolveUnrealizedMarkPrice = (_p, c) => c.c;
  om._calculatePositionPnL = () => 0;
  om._claimOrderLifecycleEvent = () => true;
  om._appendExcursionSnapshot = () => {};
  om._barQuotesForSltp = (_p, high, low, open) => ({
    bidHigh: high,
    bidLow: low,
    askHigh: high,
    askLow: low,
    open,
  });
  om._updatePositionPriceExtremes = () => {};
  om._oiShouldSuppressSltpHits = () => false;
  om._shouldSkipSlTpAfterBeThisBar = () => false;
  om._shouldSkipSLOnFillCandle = () => false;
  om._isNoTriggerGuardActive = () => false;
  om._tickAnimOverridesGuard = () => false;
  om.updateMfeMaeTracking = () => {};
  om._maybeLiquidateOnStopOut = () => {};
  om._schedulePositionsPanelRuntimeUpdate = () => {};
  return { om, candle };
}

test('active multi-TP replay does not flood the retained browser console', () => {
  installWindow();
  const { om, candle } = makeOrderHotPath();
  const originalLog = console.log;
  let logCalls = 0;
  console.log = () => { logCalls += 1; };
  try {
    for (let i = 0; i < 5_000; i++) {
      candle.t += 60_000;
      OrderManager.prototype.updatePositions.call(om);
    }
  } finally {
    console.log = originalLog;
  }
  assert.equal(logCalls, 0,
    'normal replay must not retain per-order, per-minute debug messages');
});
