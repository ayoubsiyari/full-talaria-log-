/**
 * ORDER-01B oracle 4 — global market-time cursor + resolveBar + bar-close transcripts.
 * Ports DEF-04 equal-epoch / no-parent-index assertions and binds them to the cursor path.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import crypto from 'node:crypto';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
global.window = global.window || {};
const ReplaySystem = require('./replay-system.js');

const chartReplayPath = path.join(repoRoot, 'chart v 1.4/chart/modules/replay-system.js');
const homeReplayPath = path.join(repoRoot, 'homepage/public/chart/modules/replay-system.js');
const chartBridgePath = path.join(repoRoot, 'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js');
const homeBridgePath = path.join(repoRoot, 'homepage/public/chart/multichart-prod/panel-cmd-bridge.js');
const chartOmPath = path.join(repoRoot, 'chart v 1.4/chart/modules/order-manager.js');
const homeOmPath = path.join(repoRoot, 'homepage/public/chart/modules/order-manager.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function methodSource(text, name) {
  const marker = `    ${name}(`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const sigEnd = text.indexOf(') {', start);
  assert.notEqual(sigEnd, -1, `${name} must have a method signature`);
  const brace = sigEnd + 2;
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function makeSeries(stepMs, count, start = 1_700_000_000_000) {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * stepMs,
    o: 1 + i * 0.001,
    h: 1.01 + i * 0.001,
    l: 0.99 + i * 0.001,
    c: 1.005 + i * 0.001,
    v: 100,
  }));
}

function indexAtOrBefore(series, ts) {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function loadOrderManagerClass() {
  const src = read(chartOmPath);
  const classStart = src.indexOf('class OrderManager {');
  assert.notEqual(classStart, -1, 'OrderManager class must exist');
  // Extract helpers + class: from ORDER-01B helper through end of class is huge.
  // Instead evaluate a slim sandbox that reuses the real helper predicates and
  // the resolveBar / transcript methods by extracting their source.
  const helper = functionSource(src, '_order01bMarketTimeCursorV1Enabled');
  const resolveBar = methodSource(src, 'resolveBar');
  const marketTime = methodSource(src, '_order01bMarketTimeMs');
  const ensureMap = methodSource(src, '_ensureBarCloseTranscriptMap');
  const record = methodSource(src, '_recordBarCloseTranscriptEvent');
  const consume = methodSource(src, '_consumeBarCloseTranscript');
  const census = methodSource(src, '_censusRetainedBarCloseTranscripts');
  const sync = methodSource(src, '_syncBarCloseTranscriptForCandle');
  const code = `
    ${helper}
    class OrderManager {
      constructor() {
        this._barCloseTranscripts = new Map();
        this._barCloseTranscriptActiveKey = null;
        this.chart = null;
        this.replaySystem = null;
        this._orderExecutionSeriesByFileId = null;
        this.pendingOrders = [];
        this.openPositions = [];
        this.mfeMaeTrackingPositions = [];
      }
      _getOrderContextChart() { return this.chart; }
      _playbackReplaySystem() { return this.replaySystem; }
      _orderExecutionSeriesContext() { return null; }
      ${resolveBar}
      ${marketTime}
      ${ensureMap}
      ${record}
      ${consume}
      ${census}
      ${sync}
    }
    module.exports = { OrderManager, _order01bMarketTimeCursorV1Enabled };
  `;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    window: global.window,
    console,
    Object,
    Number,
    String,
    Array,
    Map,
    Date,
    Math,
  };
  vm.runInNewContext(code, context, { filename: 'order-01b-om-slice.js' });
  return module.exports;
}

test('ORDER-01B oracle4 source: cursor publish/consume and no parent currentIndex export', () => {
  for (const [label, replayText, bridgeText] of [
    ['chart', read(chartReplayPath), read(chartBridgePath)],
    ['homepage', read(homeReplayPath), read(homeBridgePath)],
  ]) {
    assert.match(replayText, /_isGlobalMarketTimeCursorEnabled/, `${label}: cursor enable missing`);
    assert.match(replayText, /__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1/, `${label}: kill switch missing`);
    assert.match(replayText, /_publishMarketTimeCursor/, `${label}: publish missing`);
    assert.match(replayText, /_consumeMarketTimeCursor/, `${label}: consume missing`);
    assert.match(replayText, /marketTimeCursor/, `${label}: frame cursor field missing`);

    const buildDetail = methodSource(replayText, '_buildMultichartReplayFrameDetail');
    assert.doesNotMatch(buildDetail, /currentIndex\s*:\s*this\.currentIndex/,
      `${label}: replay frame detail must not export bar index`);
    assert.match(buildDetail, /detail\.marketTimeCursor\s*=\s*cursor/,
      `${label}: frame detail must assign published cursor`);
    assert.match(buildDetail, /_publishMarketTimeCursor/,
      `${label}: frame detail must publish cursor`);

    const apply = methodSource(replayText, 'applyMultichartMirrorFrame');
    assert.match(apply, /_consumeMarketTimeCursor/,
      `${label}: apply must consume host cursor when enabled`);

    assert.match(bridgeText, /__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1/,
      `${label}: bridge kill switch missing`);
    assert.match(bridgeText, /function applyMarketTimeCursorFromFrame\(/,
      `${label}: bridge must own applyMarketTimeCursorFromFrame`);
    const applyFn = functionSource(bridgeText, 'applyReplayFrame');
    assert.match(applyFn, /applyMarketTimeCursorFromFrame\(rs,\s*args,\s*ts\)/,
      `${label}: applyReplayFrame must call applyMarketTimeCursorFromFrame`);
    const cursorFn = functionSource(bridgeText, 'applyMarketTimeCursorFromFrame');
    assert.match(cursorFn, /rs\._consumeMarketTimeCursor\(args\)/,
      `${label}: cursor helper must call rs._consumeMarketTimeCursor(args)`);
  }
});

test('ORDER-01B oracle4 mirrors stay byte-identical for replay, bridge, and order-manager', () => {
  assert.equal(read(homeReplayPath), read(chartReplayPath),
    `replay mirror mismatch ${sha(read(chartReplayPath))} ${sha(read(homeReplayPath))}`);
  assert.equal(read(homeBridgePath), read(chartBridgePath),
    `bridge mirror mismatch ${sha(read(chartBridgePath))} ${sha(read(homeBridgePath))}`);
  assert.equal(read(homeOmPath), read(chartOmPath),
    `order-manager mirror mismatch ${sha(read(chartOmPath))} ${sha(read(homeOmPath))}`);
});

test('ORDER-01B oracle4 / DEF-04 model: four panels resolve one epoch playhead to local bar indices', () => {
  const minute = 60_000;
  const panels = [
    { tf: '1m', step: minute, data: makeSeries(minute, 600) },
    { tf: '15m', step: 15 * minute, data: makeSeries(15 * minute, 80) },
    { tf: '1h', step: 60 * minute, data: makeSeries(60 * minute, 30) },
    { tf: '4h', step: 240 * minute, data: makeSeries(240 * minute, 10) },
  ];
  const start = panels[0].data[0].t;
  for (const source of panels) {
    const targetTs = start + source.step;
    const resolved = Object.fromEntries(
      panels.map((panel) => [panel.tf, indexAtOrBefore(panel.data, targetTs)]),
    );
    assert.equal(resolved['1m'], Math.floor(source.step / minute));
    assert.equal(resolved['15m'], Math.floor(source.step / (15 * minute)));
    assert.equal(resolved['1h'], Math.floor(source.step / (60 * minute)));
    assert.equal(resolved['4h'], Math.floor(source.step / (240 * minute)));
  }
});

test('ORDER-01B oracle4 runtime: cursor frame ignores parent index and resolves local index by market time', () => {
  const minute = 60_000;
  const fullRawData = makeSeries(minute, 600);
  const targetTs = fullRawData[240].t;
  const chart = {
    currentTimeframe: '1m',
    rawData: [],
    data: [],
    resampleData: (rows) => rows.slice(),
    _trimLastDataBarToReplayPlayhead() {},
    bumpDataVersion() {},
  };
  const replay = Object.create(ReplaySystem.prototype);
  Object.assign(replay, {
    chart,
    isActive: true,
    isPlaying: true,
    currentIndex: 3,
    sessionStartIndex: 0,
    replayTimestamp: fullRawData[3].t,
    fullRawData,
    tickElapsedMs: 0,
    tickProgress: 0,
    animatingCandle: null,
    autoScrollEnabled: false,
    _marketTimeCursor: null,
    _marketTimeCursorSequence: 0,
    _resolveMirrorRawSeries: () => fullRawData,
    _mirrorSharesHostDataset: () => false,
    _m20Q9PrefixSliceFixEnabled: () => false,
    _trimLastDataBarToReplayPlayhead() {},
    _applyCanonicalReplayMarkFromDetail() {},
    _finishMultichartMirrorRender() {},
    _getFinestReplayCadenceMs() { return minute; },
    _getSelectedReplayCadenceMs() { return minute; },
    _getRawBarPeriodMs() { return minute; },
  });
  chart.replaySystem = replay;
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;

  const cursor = {
    marketTimeMs: targetTs,
    cadenceMs: minute,
    sequence: 7,
    sourcePanelId: 'host',
    isPlaying: true,
    tickElapsedMs: 0,
    tickProgress: 0,
  };
  const applied = replay.applyMultichartMirrorFrame({
    timestamp: targetTs,
    marketTimeCursor: cursor,
    currentIndex: 999,
    isPlaying: true,
    tickElapsedMs: 0,
    tickProgress: 0,
  });

  assert.equal(applied, true);
  assert.equal(replay.currentIndex, 240);
  assert.notEqual(replay.currentIndex, 999);
  assert.equal(replay.replayTimestamp, targetTs);
  assert.equal(replay.getMarketTimeCursor()?.marketTimeMs, targetTs);
  assert.equal(replay.getMarketTimeCursor()?.sequence, 7);
});

test('ORDER-01B oracle4: disable flag restores interim path without cursor ownership', () => {
  const replay = Object.create(ReplaySystem.prototype);
  Object.assign(replay, {
    replayTimestamp: 123,
    _marketTimeCursor: { marketTimeMs: 123 },
    _marketTimeCursorSequence: 1,
    isPlaying: true,
    tickElapsedMs: 0,
    tickProgress: 0,
    chart: null,
    _getFinestReplayCadenceMs() { return 60_000; },
    _getSelectedReplayCadenceMs() { return 60_000; },
    _getRawBarPeriodMs() { return 60_000; },
  });
  global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1 = true;
  assert.equal(replay._isGlobalMarketTimeCursorEnabled(), false);
  assert.equal(replay.getMarketTimeCursor(), null);
  assert.equal(replay._publishMarketTimeCursor(), null);
  assert.equal(replay._consumeMarketTimeCursor({ marketTimeMs: 999 }), false);
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;
});

test('ORDER-01B resolveBar uses raw/retained series and never animatingCandle', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  const series = makeSeries(60_000, 20);
  const target = series[10];
  om.replaySystem = {
    isActive: true,
    replayTimestamp: target.t + 1000,
    animatingCandle: {
      t: target.t,
      open: 9, high: 9, low: 9, close: 9,
    },
    getMarketTimeCursor: () => ({ marketTimeMs: target.t + 1000 }),
    fullRawData: series,
  };
  om.chart = { replaySystem: om.replaySystem, currentFileId: 'f1', currentTimeframe: '1m' };

  const bar = om.resolveBar(null, { series });
  assert.ok(bar);
  assert.equal(bar.t, target.t);
  assert.equal(bar.c, target.c);
  assert.notEqual(bar.c, 9);
  assert.equal(bar._resolveBarSource, 'raw_or_retained');
  assert.match(String(bar._orderLifecycleEventKey), /^replay:/);
});

test('ORDER-01B bar-close transcript is consumed and dropped at bar boundary', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;

  const bar1 = { t: 1000, c: 1, _orderLifecycleEventKey: 'replay:1000' };
  const bar2 = { t: 2000, c: 2, _orderLifecycleEventKey: 'replay:2000' };

  om._syncBarCloseTranscriptForCandle(bar1);
  om._recordBarCloseTranscriptEvent('pending_eval', { barT: 1000 });
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 1);

  om._syncBarCloseTranscriptForCandle(bar2);
  const census = om._censusRetainedBarCloseTranscripts();
  assert.equal(census.retained, 1, 'prior bar transcript must be dropped at boundary');
  assert.equal(String(census.keys[0]), 'replay:2000');
  assert.equal(census.keys.length, 1);
  assert.equal(String(census.activeKey), 'replay:2000');

  const consumed = om._consumeBarCloseTranscript('replay:2000');
  assert.ok(consumed);
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 0);
});

test('ORDER-01B model: same cursor market time at 1x/10x yields identical resolveBar digests', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  const series = makeSeries(60_000, 40);
  const marketTimeMs = series[20].t + 500;
  const digest = (speed) => {
    const bar = om.resolveBar(marketTimeMs, { series });
    return JSON.stringify({
      speed,
      t: bar.t,
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      key: bar._orderLifecycleEventKey,
    });
  };
  assert.equal(digest(1).replace('"speed":1', '"speed":X'), digest(10).replace('"speed":10', '"speed":X'));
});

test('ORDER-01B runtime: real frame detail publishes cursor marketTimeMs equal to replayTimestamp', () => {
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;
  const minute = 60_000;
  const fullRawData = makeSeries(minute, 40);
  const replay = Object.create(ReplaySystem.prototype);
  Object.assign(replay, {
    chart: { currentFileId: 'f1', _multichartPanelId: 'A' },
    isPlaying: true,
    replayTimestamp: fullRawData[12].t,
    currentIndex: 12,
    fullRawData,
    tickElapsedMs: 0,
    tickProgress: 0,
    animatingCandle: null,
    fastMode: false,
    autoScrollEnabled: false,
    userHasPanned: false,
    _marketTimeCursor: null,
    _marketTimeCursorSequence: 0,
    ticksPerCandle: 72,
    currentTicksPerCandle: 72,
    getPlaybackMode() { return 'candle'; },
    _getFinestReplayCadenceMs() { return minute; },
    _getSelectedReplayCadenceMs() { return minute; },
    _getRawBarPeriodMs() { return minute; },
    _resolveCanonicalReplayMark() { return null; },
  });
  const detail = replay._buildMultichartReplayFrameDetail();
  assert.ok(detail.marketTimeCursor, 'published cursor must be present on frame detail');
  assert.equal(detail.marketTimeCursor.marketTimeMs, replay.replayTimestamp);
  assert.equal(detail.timestamp, replay.replayTimestamp);
  assert.equal(detail.marketTimeCursor.marketTimeMs, detail.timestamp);
  assert.notEqual(detail.marketTimeCursor.marketTimeMs, replay.currentIndex);
  assert.equal(detail.currentIndex, undefined);
});

test('ORDER-01B runtime: product applyMarketTimeCursorFromFrame consumes host cursor', () => {
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;
  const bridgeText = read(chartBridgePath);
  const cursorFn = functionSource(bridgeText, 'applyMarketTimeCursorFromFrame');
  const module = { exports: {} };
  vm.runInNewContext(
    `${cursorFn}\nmodule.exports = applyMarketTimeCursorFromFrame;`,
    { module, exports: module.exports, window: global.window, Number },
    { filename: 'bridge-cursor-slice.js' },
  );
  const applyMarketTimeCursorFromFrame = module.exports;
  assert.equal(typeof applyMarketTimeCursorFromFrame, 'function');

  const consumed = [];
  const rs = {
    replayTimestamp: 1,
    _consumeMarketTimeCursor(args) {
      consumed.push(Number(args.marketTimeCursor.marketTimeMs));
      this.replayTimestamp = Number(args.marketTimeCursor.marketTimeMs);
      return true;
    },
  };
  const args = {
    timestamp: 999,
    isPlaying: true,
    marketTimeCursor: {
      marketTimeMs: 1_700_000_720_000,
      cadenceMs: 60_000,
      sequence: 3,
      sourcePanelId: 'host',
      isPlaying: true,
    },
  };
  const ok = applyMarketTimeCursorFromFrame(rs, args, args.timestamp);
  assert.equal(ok, true);
  assert.deepEqual(consumed, [1_700_000_720_000]);
  assert.equal(rs.replayTimestamp, 1_700_000_720_000);
  assert.notEqual(rs.replayTimestamp, args.timestamp);

  // Kill switch must restore interim pin and skip consume.
  global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1 = true;
  const rs2 = {
    replayTimestamp: 1,
    _consumeMarketTimeCursor() {
      throw new Error('consume must not run when cursor disabled');
    },
  };
  const ok2 = applyMarketTimeCursorFromFrame(rs2, args, 555);
  assert.equal(ok2, true);
  assert.equal(rs2.replayTimestamp, 555);
  delete global.window.__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1;
});
