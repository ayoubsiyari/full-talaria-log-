/**
 * A3 daily money-path boundary arm.
 *
 * A3's original canary is intraday. This arm applies the same money-path
 * properties to FX daily bars after session-day bucketing moved from UTC midnight
 * to 17:00 America/New_York.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as H from './m22-session-calendar-harness.mjs';

// SEAL-EVIDENCE-01: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[SEAL-EVIDENCE-01] STATIC_ONLY_SOURCE_GATE A3 daily bucketing on session day \u2014 reads source; served behaviour unobserved");

/**
 * Walk up to the repo root instead of counting directory levels, and reach the
 * subject through the root rather than through a relative specifier.
 *
 * The fixed '../../../scripts/lib/...' this replaced resolved to
 * `homepage/scripts/lib/` from the mirror location, so the mirrored copy of this
 * gate died at import and had never run — while reading in a sweep exactly like
 * a gate that passed.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.resolve(findRoot(__dirname), 'scripts/lib/a3-speed-fill-journal-parity.mjs');
if (!fs.existsSync(libPath)) throw new Error(`SUBJECT_ABSENT: ${libPath}`);

const {
  A3_PLAYBACK_COORDINATES,
  buildTranscripts,
  compareCoordinateTranscripts,
  normalizeMoneyRow,
} = await import(pathToFileURL(libPath).href);

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
global.window = global.window || {};
global.window.marketCalcEngine = global.window.marketCalcEngine || {};
global.window.marketCalcEngine.calcPnL = global.window.marketCalcEngine.calcPnL || ((side, entry, exitPx, quantity) => {
  const diff = String(side).toUpperCase() === 'SELL' ? entry - exitPx : exitPx - entry;
  return diff * 100_000 * Number(quantity || 0);
});

const FX = 'EURUSD';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function makeHarness() {
  return H.makeHarness({ mode: H.MODES.PRODUCT, symbol: FX });
}

function bar(t, price, extra = {}) {
  const p = Number(price);
  return {
    t,
    o: p,
    h: Number.isFinite(extra.h) ? extra.h : p,
    l: Number.isFinite(extra.l) ? extra.l : p,
    c: Number.isFinite(extra.c) ? extra.c : p,
    v: Number.isFinite(extra.v) ? extra.v : 1,
  };
}

function bucketStart(SC, t, timeframe = '1d') {
  return SC.bucketStart(t, timeframe, {
    timeframeMs: timeframe === '1w' ? 7 * DAY_MS : DAY_MS,
    instrumentClass: 'fx',
  });
}

function sessionLabel(SC, t, timeframe = '1d') {
  return SC.sessionLabel(t, timeframe, { instrumentClass: 'fx' });
}

function dailySeriesFor(raw) {
  const { chart, SC } = makeHarness();
  const daily = chart.resampleData(raw, '1d');
  return { chart, SC, daily };
}

function dailyBucketForTime(daily, SC, t) {
  const bucket = bucketStart(SC, t, '1d');
  const found = daily.find((b) => Number(b.t) === Number(bucket));
  return { bucket, found };
}

function makeCloseHarness(closeCandle) {
  const om = Object.create(OrderManager.prototype);
  Object.assign(om, {
    chart: { currentSymbol: FX, backtestingSession: { trading_costs_enabled: false }, render() {} },
    replaySystem: null,
    orders: [],
    pendingOrders: [],
    openPositions: [],
    closedPositions: [],
    tradeJournal: [],
    scaledTrades: new Map(),
    splitTrades: new Map(),
    balance: 10_000,
    equity: 10_000,
    getCurrentCandle: () => closeCandle,
    _n5BeginFullClose: () => true,
    _n5EndFullClose: () => {},
    _resolveOwningPanelMidMarkPrice: () => Number(closeCandle.c),
    _exitMarkerAnchorTimeMsFromClose: (_chart, closeTime) => closeTime,
    _applyRealizedPnLToBalance(pnl) { this.balance += Number(pnl) || 0; },
    _syncOrderServiceOpenAfterClose: () => {},
    _m20A1ScheduleRetainedSweep: () => {},
    playOrderSound: () => {},
    _resolvePositionOrderType: () => 'market',
    _getActiveTicker: () => FX,
    _getSymbol: () => FX,
    _getSessionDefaultTradeSetup: () => null,
    _m19MaxExcursionR: () => null,
    _enrichJournalEntryForPersistence: () => {},
    _m19EnsureJournalArray() { if (!Array.isArray(this.tradeJournal)) this.tradeJournal = []; },
    _m19AppendJournalRecord(row) { this.tradeJournal.push(row); return this.tradeJournal.length - 1; },
    persistJournal: () => {},
    persistRuntimeOrderState: () => {},
    updateJournalTab: () => {},
    drawExitMarker: () => {},
    removeEntryMarker: () => {},
    removeOrderLine: () => {},
    removeSLTPLines: () => {},
    removeMultiTPAvgLine: () => {},
    removeMfeMaeMarkers: () => {},
    removePreviewLines: () => {},
    _cleanupOrderVisualsAfterClose: () => {},
    _cleanupOrphanedYAxisHighlights: () => {},
    _ensurePendingTargetsSurvive: () => {},
    updatePositionsPanel: () => {},
    showTradeJournalModal: () => {},
    _cancelPendingOrdersInSplitGroup: () => {},
    _splitGroupHasAnyOpenLeg: () => false,
  });
  return om;
}

function productCloseTranscript({ id, openTime, openPrice, closeCandle, sourceFileId = 25 }) {
  const om = makeCloseHarness(closeCandle);
  om.openPositions = [{
    id,
    type: 'BUY',
    direction: 'BUY',
    ticker: FX,
    symbol: FX,
    sourceFileId,
    quantity: 1,
    openPrice,
    openTime,
    stopLoss: openPrice - 0.05,
    takeProfit: Number(closeCandle.c),
    status: 'OPEN',
  }];

  om.closePosition(id);
  assert.equal(om.openPositions.length, 0, 'product closePosition must remove open position');
  assert.equal(om.closedPositions.length, 1, 'product closePosition must emit a closed position');
  assert.equal(om.tradeJournal.length, 1, 'product closePosition must emit a journal row');

  const normalized = {
    closed: om.closedPositions.map(normalizeMoneyRow),
    journal: om.tradeJournal.map(normalizeMoneyRow),
  };
  return {
    status: 'OBSERVED',
    manager: om,
    normalized,
    transcripts: buildTranscripts(normalized),
  };
}

test('daily money path: fills at 16:58 and 17:02 New York land in different daily bars', () => {
  // 2026-01-02 is EST: 16:58 local = 21:58Z, 17:02 local = 22:02Z.
  const before = Date.UTC(2026, 0, 2, 21, 58);
  const after = Date.UTC(2026, 0, 2, 22, 2);
  const { SC, daily } = dailySeriesFor([
    bar(before, 1.1),
    bar(after, 1.2),
  ]);

  assert.equal(daily.length, 2);
  assert.notEqual(daily[0].t, daily[1].t);
  assert.equal(daily[0].t, bucketStart(SC, before));
  assert.equal(daily[1].t, bucketStart(SC, after));
  const beforeFill = productCloseTranscript({
    id: 1,
    openTime: before,
    openPrice: Number(daily[0].o),
    closeCandle: daily[0],
  });
  const afterFill = productCloseTranscript({
    id: 2,
    openTime: after,
    openPrice: Number(daily[1].o),
    closeCandle: daily[1],
  });

  assert.equal(beforeFill.normalized.journal[0].openTime, before);
  assert.equal(afterFill.normalized.journal[0].openTime, after);
  assert.notEqual(
    bucketStart(SC, beforeFill.normalized.journal[0].openTime),
    bucketStart(SC, afterFill.normalized.journal[0].openTime),
    'product journal rows must resolve to different daily bar keys',
  );
  console.log('GREEN — daily boundary split: RESOLVER_CALLED_AND_RIGHT');
});

test('daily money path: DST changes move the UTC boundary, not the local 17:00 open', () => {
  const cases = [
    {
      name: 'spring-before',
      before: Date.UTC(2026, 2, 6, 21, 58), // EST, boundary 22:00Z
      after: Date.UTC(2026, 2, 6, 22, 2),
      expectedUtcHour: 22,
    },
    {
      name: 'spring-after',
      before: Date.UTC(2026, 2, 9, 20, 58), // EDT, boundary 21:00Z
      after: Date.UTC(2026, 2, 9, 21, 2),
      expectedUtcHour: 21,
    },
    {
      name: 'fall-before',
      before: Date.UTC(2026, 9, 30, 20, 58), // EDT, boundary 21:00Z
      after: Date.UTC(2026, 9, 30, 21, 2),
      expectedUtcHour: 21,
    },
    {
      name: 'fall-after',
      before: Date.UTC(2026, 10, 2, 21, 58), // EST, boundary 22:00Z
      after: Date.UTC(2026, 10, 2, 22, 2),
      expectedUtcHour: 22,
    },
  ];

  for (const c of cases) {
    const { SC, daily } = dailySeriesFor([bar(c.before, 1.1), bar(c.after, 1.2)]);
    assert.equal(daily.length, 2, `${c.name}: fill pair must split`);
    assert.equal(new Date(daily[1].t).getUTCHours(), c.expectedUtcHour, `${c.name}: UTC boundary hour`);
    assert.equal(daily[0].t, bucketStart(SC, c.before));
    assert.equal(daily[1].t, bucketStart(SC, c.after));
  }
  console.log('GREEN — daily DST boundary: RESOLVER_CALLED_AND_RIGHT');
});

test('daily money path: weekend gap has no Saturday bar and held position resolves both sides', () => {
  // The M22 FX fixture encodes the PO-observed 2013 weekend closures.
  const { SC, daily } = dailySeriesFor(
    H.fxBars(Date.UTC(2013, 0, 4, 20), Date.UTC(2013, 0, 7, 4), HOUR_MS),
  );
  const labels = daily.map((b) => sessionLabel(SC, b.t));
  const keys = labels.map((l) => l.key);
  const weekdays = labels.map((l) => l.weekday);

  assert.equal(weekdays.includes('Sat'), false, `unexpected Saturday bar: ${keys.join(',')}`);
  assert.equal(weekdays.includes('Sun'), false, `unexpected Sunday bar: ${keys.join(',')}`);

  const openTime = Date.UTC(2013, 0, 4, 21); // Friday 16:00 NY, before close.
  const closeTime = Date.UTC(2013, 0, 6, 23); // Sunday 18:00 NY, after reopen.
  const open = dailyBucketForTime(daily, SC, openTime);
  const close = dailyBucketForTime(daily, SC, closeTime);

  assert.ok(open.found, 'held position open side must resolve to a daily bar');
  assert.ok(close.found, 'held position close side must resolve to a daily bar');
  assert.notEqual(open.bucket, close.bucket);

  const closed = productCloseTranscript({
    id: 3,
    openTime,
    openPrice: Number(open.found.c),
    closeCandle: close.found,
  });
  assert.equal(closed.normalized.closed[0].openTime, openTime);
  assert.equal(closed.normalized.closed[0].closeTime, close.bucket);
  assert.equal(closed.normalized.journal[0].openTime, openTime);
  assert.equal(closed.normalized.journal[0].closeTime, close.bucket);
  console.log('GREEN — daily weekend gap held position: RESOLVER_CALLED_AND_RIGHT');
});

test('daily money path: bar-close transcript drops the prior daily bar at session boundary', () => {
  const before = Date.UTC(2026, 0, 2, 21, 58);
  const after = Date.UTC(2026, 0, 2, 22, 2);
  const { daily } = dailySeriesFor([bar(before, 1.1), bar(after, 1.2)]);
  assert.equal(daily.length, 2);

  const om = Object.create(OrderManager.prototype);
  om._barCloseTranscripts = new Map();
  om._barCloseTranscriptActiveKey = null;

  om._syncBarCloseTranscriptForCandle(daily[0]);
  om._recordBarCloseTranscriptEvent('daily_pending_eval', { barT: daily[0].t });
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 1);

  om._syncBarCloseTranscriptForCandle(daily[1]);
  const census = om._censusRetainedBarCloseTranscripts();
  assert.equal(census.retained, 1, 'prior daily transcript must be dropped at boundary');
  assert.equal(String(census.keys[0]), `replay:${daily[1].t}`);

  const consumed = om._consumeBarCloseTranscript(`replay:${daily[1].t}`);
  assert.ok(consumed);
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 0);
  console.log('GREEN — daily bar-close transcript: RESOLVER_CALLED_AND_RIGHT');
});

test('daily money path: A3 coordinate invariance holds on daily bars', () => {
  const raw = [
    bar(Date.UTC(2026, 0, 4, 23), 1.10, { h: 1.101, l: 1.09 }),
    bar(Date.UTC(2026, 0, 5, 23), 1.11, { h: 1.112, l: 1.10 }),
    bar(Date.UTC(2026, 0, 6, 23), 1.12, { h: 1.121, l: 1.11 }),
    bar(Date.UTC(2026, 0, 7, 23), 1.13, { h: 1.145, l: 1.12 }),
    bar(Date.UTC(2026, 0, 8, 23), 1.14, { h: 1.141, l: 1.13 }),
  ];
  const { daily } = dailySeriesFor(raw);
  assert.ok(daily.length >= 4);

  const arms = A3_PLAYBACK_COORDINATES.map((speed) => {
    const result = productCloseTranscript({
      id: 10 + speed,
      openTime: Number(daily[1].t),
      openPrice: Number(daily[1].c),
      closeCandle: daily[3],
    });
    return {
      speed,
      status: result.status,
      normalized: result.normalized,
      transcripts: result.transcripts,
    };
  });
  const comparison = compareCoordinateTranscripts(arms);

  assert.equal(comparison.ok, true, comparison.reason);
  assert.deepEqual(comparison.speeds, [1, 5, 10]);
  for (const pair of comparison.pairs) {
    assert.equal(pair.equal, true, `${pair.name} daily transcript must be byte-equal`);
  }

  const mutantArms = arms.map((arm) => {
    const normalized = {
      closed: arm.normalized.closed.map((row) => ({ ...row, pnl: row.pnl * arm.speed })),
      journal: arm.normalized.journal.map((row) => ({ ...row, pnl: row.pnl * arm.speed })),
    };
    return {
      speed: arm.speed,
      status: 'OBSERVED',
      normalized,
      transcripts: buildTranscripts(normalized),
    };
  });
  assert.equal(
    compareCoordinateTranscripts(mutantArms).ok,
    false,
    'RED control: speed leaking into product-derived money rows must fail',
  );
  console.log('GREEN — daily A3 coordinate invariance: RESOLVER_CALLED_AND_RIGHT');
});
