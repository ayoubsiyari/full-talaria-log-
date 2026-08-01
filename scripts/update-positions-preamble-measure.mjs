#!/usr/bin/env node
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const OrderManager = require(path.resolve(root, 'chart v 1.4/chart/modules/order-manager.js'));

export const UPDATE_POSITIONS_PREAMBLE_SIGNATURE = 'TALARIA_UPDATE_POSITIONS_PREAMBLE_MEASURE_V1';
export const TWO_MINUTE_TICKS = 120 * 60;
export const CHARTS = 4;

const MEASURED_METHODS = [
  'updatePositions',
  '_usesHostProjectedOrderRuntime',
  '_shouldDeferOrderExecutionForTimeframeTransition',
  '_oiMaybeCancelProvisionalOnReplayStop',
  '_getMultichartParentGuardCandle',
  'getCurrentCandle',
  '_tradeEvictV1SyncPlayhead',
  'checkPendingOrders',
  '_syncPreviewToReplayPrice',
];

function makeStats() {
  return Object.fromEntries(MEASURED_METHODS.map((name) => [name, { calls: 0, selfMs: 0 }]));
}

function timed(stats, name, fn) {
  return function measured(...args) {
    const t0 = performance.now();
    try {
      return fn.apply(this, args);
    } finally {
      const row = stats[name];
      row.calls += 1;
      row.selfMs += performance.now() - t0;
    }
  };
}

function makeCandle(i) {
  return { t: 1700000000000 + i * 60000, o: 100, h: 101, l: 99, c: 100.5 };
}

function makeOrderManager({ state, chartIndex }) {
  const stats = makeStats();
  const om = Object.create(OrderManager.prototype);
  om.__measureStats = stats;
  om.chart = { currentFileId: 100 + chartIndex };
  om.orderService = { multiInstrumentSession: { current_time: null } };
  om.pendingOrders = [];
  om.orders = [];
  om.openPositions = [];
  om.closedPositions = [];
  om.tradeJournal = [];
  om.mfeMaeTrackingPositions = [];
  om.mfeMaeTrackingEnabled = false;
  om.replaySystem = { isActive: true };
  om._measureTick = 0;

  if (state === 'fiveClosedZeroOpen') {
    om.tradeJournal = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, status: 'CLOSED', closeTime: makeCandle(i).t }));
    om.closedPositions = om.tradeJournal.map((row) => ({ ...row }));
    om.orders = [];
  }
  if (state === 'oneOpen') {
    om.openPositions = [{
      id: 1,
      status: 'OPEN',
      type: 'BUY',
      ticker: 'EURUSD',
      sourceFileId: String(100 + chartIndex),
      openPrice: 100,
      quantity: 1,
      stopLoss: null,
      takeProfit: null,
      tpTargets: [],
      mfeMaeTrackingEnabled: false,
    }];
  }

  om._usesHostProjectedOrderRuntime = timed(stats, '_usesHostProjectedOrderRuntime', () => false);
  om._shouldDeferOrderExecutionForTimeframeTransition = timed(stats, '_shouldDeferOrderExecutionForTimeframeTransition', () => false);
  om._oiMaybeCancelProvisionalOnReplayStop = timed(stats, '_oiMaybeCancelProvisionalOnReplayStop', () => {});
  const realParentGuard = OrderManager.prototype._getMultichartParentGuardCandle;
  om._getMultichartParentGuardCandle = timed(stats, '_getMultichartParentGuardCandle', function measuredParentGuard() {
    return realParentGuard.call(this);
  });
  om.getCurrentCandle = timed(stats, 'getCurrentCandle', function getMeasuredCandle() { return makeCandle(this._measureTick); });
  const realTradeEvictSync = OrderManager.prototype._tradeEvictV1SyncPlayhead;
  om._tradeEvictV1SyncPlayhead = timed(stats, '_tradeEvictV1SyncPlayhead', function measuredTradeEvictSync(playheadMs) {
    return realTradeEvictSync.call(this, playheadMs);
  });
  const realCheckPendingOrders = OrderManager.prototype.checkPendingOrders;
  om.checkPendingOrders = timed(stats, 'checkPendingOrders', function measuredCheckPendingOrders(candle) {
    return realCheckPendingOrders.call(this, candle);
  });
  om._syncPreviewToReplayPrice = timed(stats, '_syncPreviewToReplayPrice', () => {});

  // One-open path stubs after the zero-order preamble.
  om._getActiveTicker = () => 'EURUSD';
  om._getOrderContextChart = () => om.chart;
  om._oiShouldSuppressSltpHits = () => false;
  om._positionTicker = (position) => position?.ticker || '';
  om._positionNeedsBackgroundBar = () => false;
  om._resolveUnrealizedMarkPrice = (_position, candle) => Number(candle?.c);
  om._calculatePositionPnL = () => 0;
  om._claimOrderLifecycleEvent = () => false;
  om._shouldSkipSlTpAfterBeThisBar = () => false;
  om._getSplitGroupOpenPositions = (position) => [position];
  om._getPositionSL = (position) => position.stopLoss;
  om._getPositionTP = (position) => position.takeProfit;
  om._checkAutoBreakeven = () => false;
  om._checkTrailingStop = () => false;
  om._updatePositionMfeMae = () => {};
  om.updateMfeMaeTracking = () => {};
  om.updatePositionsPanel = () => {};
  om.updateBalanceDisplay = () => {};
  om.drawSLTPLines = () => {};
  om.removeOrderLine = () => {};
  om.closePosition = () => {};
  om.showNotification = () => {};

  const realUpdatePositions = OrderManager.prototype.updatePositions;
  om.updatePositions = timed(stats, 'updatePositions', function measuredUpdatePositions() {
    return realUpdatePositions.call(this);
  });
  return om;
}

function normalizeStats(stats) {
  return Object.fromEntries(Object.entries(stats).map(([name, row]) => [
    name,
    {
      calls: row.calls,
      selfMs: Number(row.selfMs.toFixed(3)),
      avgSelfUs: row.calls ? Number(((row.selfMs * 1000) / row.calls).toFixed(3)) : 0,
    },
  ]));
}

export function runUpdatePositionsPreambleMeasure({ ticks = TWO_MINUTE_TICKS, charts = CHARTS } = {}) {
  const states = ['zeroOrdersEver', 'fiveClosedZeroOpen', 'oneOpen'];
  const results = {};
  for (const state of states) {
    const managers = Array.from({ length: charts }, (_, chartIndex) => makeOrderManager({ state, chartIndex }));
    for (let tick = 0; tick < ticks; tick++) {
      for (const om of managers) {
        om._measureTick = tick;
        om.updatePositions();
      }
    }
    const totals = makeStats();
    for (const om of managers) {
      for (const name of MEASURED_METHODS) {
        totals[name].calls += om.__measureStats[name].calls;
        totals[name].selfMs += om.__measureStats[name].selfMs;
      }
    }
    results[state] = normalizeStats(totals);
  }
  return {
    signature: UPDATE_POSITIONS_PREAMBLE_SIGNATURE,
    simulatedWindow: { ticks, charts, updatePositionCalls: ticks * charts },
    status: 'MEASURED',
    results,
    namedLineItems: {
      parentGuard: '_getMultichartParentGuardCandle',
      tradeEvictPlayhead: '_tradeEvictV1SyncPlayhead',
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(JSON.stringify(runUpdatePositionsPreambleMeasure(), null, 2));
}
