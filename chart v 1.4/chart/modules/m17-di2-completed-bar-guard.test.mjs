/**
 * M17-DI2 / TAL-01918 — completed-bar close guard for canonical replay mark.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-concurrency=1 m17-di2-completed-bar-guard.test.mjs
 *
 * Behavioural cells ahead of white-box checks so on-disk mutants die on
 * behaviour (house rule). Extraction + fake-chart harness pattern matches
 * cover-loop-safety / countdown-null-guard in this directory.
 *
 * Kill-switch: window/global.__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1
 *   Absent/falsy = guard ON; truthy = tip unguarded write. Read per call.
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SWITCH = '__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1';
const MARK = 1.38555;
const T0 = Date.UTC(2024, 0, 2, 14, 0, 0);
const M1 = 60_000;
const M5 = 5 * M1;
const M15 = 15 * M1;
const H1 = 60 * M1;
const H4 = 4 * H1;

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    const gitPath = path.join(cursor, '.git');
    if (fs.existsSync(chart) && fs.existsSync(gitPath)) return cursor;
    if (fs.existsSync(chart)
      && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const REPLAY_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const REPLAY_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const BRIDGE_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'panel-cmd-bridge.js');
const BRIDGE_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'panel-cmd-bridge.js');
const CHART_SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const BRIDGE_SOURCE = fs.readFileSync(BRIDGE_JS, 'utf8');
global.window = global.window || {};
const ReplaySystem = require('./replay-system.js');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function methodSource(text, name, { optional = false } = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    if (optional) return '';
    throw new Error(`method ${name} missing from chart.js`);
  }
  return match[0].replace(/\n+$/, '\n');
}

/**
 * Extract a module-scope `function name(...) { ... }` by brace matching.
 *
 * B-0195: the guard's kill-switch is read through a realm-climbing predicate that
 * lives at module scope, outside the class. The extraction harness evaluates single
 * methods, so the real predicate has to be evaluated alongside them — injecting a
 * stub would let a host-only regression pass here while the panels ignored the flip
 * on the wire, which is the exact defect these cells exist to catch.
 */
function moduleFunctionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `module-scope function ${name} must exist`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const CHART_FLAG_PREDICATE = moduleFunctionSource(CHART_SOURCE, '_talariaDisableFlagTruthy');
const BRIDGE_FLAG_PREDICATE = moduleFunctionSource(BRIDGE_SOURCE, 'talariaDisableFlagTruthy');

function cloneBar(b) {
  return { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
}

/** Multi-bar 1m series + coarse 15m display bars (exercises series/index period end). */
function makeResampledFixture() {
  const fine = [];
  for (let i = 0; i < 45; i++) {
    const c = 1.37000 + i * 0.00001;
    fine.push({
      t: T0 + i * M1,
      o: c,
      h: c + 0.00020,
      l: c - 0.00020,
      c,
      v: 10 + i,
    });
  }
  // Three completed 15m buckets from the fine series, then a fourth forming bucket.
  const coarse = [];
  for (let bucket = 0; bucket < 3; bucket++) {
    const slice = fine.slice(bucket * 15, bucket * 15 + 15);
    coarse.push({
      t: slice[0].t,
      o: slice[0].o,
      h: Math.max(...slice.map((b) => b.h)),
      l: Math.min(...slice.map((b) => b.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((s, b) => s + b.v, 0),
    });
  }
  // Fourth coarse bar: only first 8 of 15 fine minutes present → FORMING when
  // playhead is inside (T0+45m .. T0+60m), COMPLETE when playhead >= T0+60m-1.
  // periodEnd for last bar with no next sibling = bar.t + periodMs = T0+45m+15m.
  const formingFine = fine.slice(0, 8); // reuse prices; timestamps for last bucket
  const lastBucketStart = T0 + 3 * M15;
  const lastFine = [];
  for (let i = 0; i < 8; i++) {
    const c = 1.38000 + i * 0.00001;
    lastFine.push({
      t: lastBucketStart + i * M1,
      o: c,
      h: c + 0.00015,
      l: c - 0.00015,
      c,
      v: 1,
    });
  }
  coarse.push({
    t: lastBucketStart,
    o: lastFine[0].o,
    h: Math.max(...lastFine.map((b) => b.h)),
    l: Math.min(...lastFine.map((b) => b.l)),
    c: lastFine[lastFine.length - 1].c,
    v: lastFine.reduce((s, b) => s + b.v, 0),
  });
  // Multi-bar series where periodEnd for an interior bar comes from next.t
  // (series/index path), not only bar.t+periodMs.
  const multiBarCoarse = coarse.map(cloneBar);
  return {
    fine,
    coarse: multiBarCoarse,
    lastBucketStart,
    periodEndLast: lastBucketStart + M15,
    // Interior bar (index 1): periodEnd = coarse[2].t via series[barIdx+1].t
    interiorIdx: 1,
    interiorPeriodEnd: multiBarCoarse[2].t,
    completedClose: multiBarCoarse[multiBarCoarse.length - 1].c,
  };
}

function makeBoundaryFixture(periodMs) {
  const start = T0 + 10 * H4;
  const prior = {
    t: start - periodMs,
    o: 10,
    h: 11,
    l: 9,
    c: 10.5,
    v: 100,
  };
  const last = {
    t: start,
    o: 20,
    h: 21,
    l: 19,
    c: 20.5,
    v: 200,
  };
  return {
    data: [prior, last],
    formingPlayhead: start + Math.max(1, Math.floor(periodMs / 2)),
    completedPlayhead: start + periodMs,
  };
}

const REAL_METHODS = [
  '_applyCanonicalMarkToFormingBar',
  '_getBarPeriodEndMs',
  '_getReplayPlayheadMs',
  'parseTimeframe',
  'resolveEffectiveCurrentPrice',
];

function makeChartHarness(opts = {}) {
  const {
    source = CHART_SOURCE,
    kill = undefined,
    playheadMs = null,
    timeframe = '15m',
    data = null,
    liveMark = MARK,
    embed = true,
  } = opts;

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Map,
    Set,
    Infinity,
    NaN,
    isNaN,
    Date,
  };
  sandbox.globalThis = sandbox;
  const parentChart = {
    currentFileId: 'file-gbpusd',
    _mcCanonicalReplayMark: liveMark,
    replaySystem: {
      isActive: true,
      _resolveCanonicalReplayMark() { return liveMark; },
    },
  };
  const win = {
    [SWITCH]: kill,
    parent: null,
  };
  // Embed: window.parent !== window
  win.parent = { chart: parentChart };
  sandbox.window = win;

  const body = REAL_METHODS.map((n) => methodSource(source, n)).join('\n');
  const playheadLiteral = Number.isFinite(playheadMs)
    ? String(playheadMs)
    : (playheadMs !== null && playheadMs !== undefined ? 'NaN' : 'null');
  vm.createContext(sandbox);
  vm.runInContext(`
${CHART_FLAG_PREDICATE}
class ChartHarness {
    constructor() {
        this.currentTimeframe = ${JSON.stringify(timeframe)};
        this.currentFileId = 'file-gbpusd';
        this.data = null;
        this._mcCanonicalReplayMark = null;
        this.replaySystem = { isActive: true, replayTimestamp: null, fullRawData: null, currentIndex: 0 };
        this._playheadOverride = ${playheadLiteral};
        this._forcePeriodEndNull = false;
        this._embed = ${embed ? 'true' : 'false'};
        this._usePlayheadOverride = ${playheadMs !== null && playheadMs !== undefined ? 'true' : 'false'};
    }
    _getPaintedLastClose() { return 1.11; }
    _isMultichartEmbedPanel() { return this._embed; }
${body}
}
const _protoEnd = ChartHarness.prototype._getBarPeriodEndMs;
ChartHarness.prototype._getBarPeriodEndMs = function(barStart, series, barIdx, periodMs) {
    if (this._forcePeriodEndNull) return null;
    return _protoEnd.call(this, barStart, series, barIdx, periodMs);
};
const _protoPh = ChartHarness.prototype._getReplayPlayheadMs;
ChartHarness.prototype._getReplayPlayheadMs = function() {
    if (this._usePlayheadOverride) return this._playheadOverride;
    return _protoPh.call(this);
};
globalThis.__chart = new ChartHarness();
`, sandbox);

  const chart = sandbox.__chart;
  chart.data = (data || []).map(cloneBar);
  if (Number.isFinite(playheadMs)) {
    chart.replaySystem.replayTimestamp = playheadMs;
  }
  return { chart, window: win, sandbox, parentChart };
}

function extractBridgeApply() {
  const start = BRIDGE_SOURCE.indexOf('function applyCanonicalReplayMarkToPanel(ch, mark)');
  assert.notEqual(start, -1, 'applyCanonicalReplayMarkToPanel must exist');
  const brace = BRIDGE_SOURCE.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < BRIDGE_SOURCE.length; i++) {
    if (BRIDGE_SOURCE[i] === '{') depth += 1;
    if (BRIDGE_SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > brace, 'bridge apply function closed');
  return BRIDGE_SOURCE.slice(start, end);
}

function makeBridgeFn(opts = {}) {
  const { kill = undefined, sameSymbol = true, hostFileId = 'file-gbpusd' } = opts;
  const fnSrc = extractBridgeApply();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Infinity,
    NaN,
    isNaN,
  };
  sandbox.global = {
    [SWITCH]: kill,
    __TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1: false,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`
${BRIDGE_FLAG_PREDICATE}
function isSameSymbolAsHost(ch) { return ${sameSymbol ? 'true' : 'false'}; }
function readParentHostFileId() { return ${JSON.stringify(hostFileId)}; }
${fnSrc}
globalThis.__apply = applyCanonicalReplayMarkToPanel;
`, sandbox);
  return {
    apply: sandbox.__apply,
    global: sandbox.global,
    setKill(v) { sandbox.global[SWITCH] = v; },
  };
}

function attachRealHelpers(chart, source = CHART_SOURCE) {
  const names = [
    '_applyCanonicalMarkToFormingBar',
    '_getBarPeriodEndMs',
    '_getReplayPlayheadMs',
    'parseTimeframe',
  ];
  const body = names.map((n) => methodSource(source, n)).join('\n');
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Object, Array, Number, String, Boolean, Error, Infinity, NaN, isNaN, Date,
    window: global.window || {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`
${CHART_FLAG_PREDICATE}
class HelperHost {
    constructor() {
        this.currentTimeframe = '15m';
        this.data = null;
        this.replaySystem = null;
    }
${body}
}
globalThis.__HelperHost = HelperHost;
`, sandbox);
  const proto = sandbox.__HelperHost.prototype;
  for (const n of names) {
    chart[n] = proto[n];
  }
  // Bind so `this` is the chart object.
  for (const n of names) {
    const fn = chart[n];
    chart[n] = function (...args) { return fn.apply(chart, args); };
  }
  return chart;
}

function snapshotOhlc(bar) {
  return { t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v };
}

function assertUnchanged(before, after, label) {
  assert.deepEqual(after, before, label);
}

function assertMarkExpanded(last, mark, label) {
  assert.equal(last.c, mark, `${label}: close stamped`);
  assert.ok(last.h >= mark, `${label}: high expanded`);
  assert.ok(last.l <= mark, `${label}: low expanded`);
}

function assertSimTag(last, label) {
  assert.equal(last.__talariaFormingSim, true, `${label}: SIM tag present`);
  assert.equal(typeof last.__talariaFormingSimSource, 'string', `${label}: SIM source present`);
}

function assertNoSimTag(last, label) {
  assert.notEqual(last.__talariaFormingSim, true, `${label}: completed bar must not be SIM-tagged`);
}

// ─── Cell 1: COMPLETED last bar, guard ON, all three sites ───────────────

test('cell1: completed last bar — all three sites leave OHLC unchanged, stamp mark, site1 returns live', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast; // at period end → COMPLETE
  const data = fx.coarse.map(cloneBar);
  const beforeLast = snapshotOhlc(data[data.length - 1]);

  // Site 1: resolveEffectiveCurrentPrice
  const { chart: c1 } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: MARK,
  });
  const before1 = snapshotOhlc(c1.data[c1.data.length - 1]);
  const ret = c1.resolveEffectiveCurrentPrice(c1.data);
  assert.equal(ret, MARK, 'site1 must still return the live mark (TAL-01798)');
  assert.equal(c1._mcCanonicalReplayMark, MARK, 'site1 stamps _mcCanonicalReplayMark');
  assertUnchanged(before1, snapshotOhlc(c1.data[c1.data.length - 1]), 'site1 must not mutate completed bar');
  assertNoSimTag(c1.data[c1.data.length - 1], 'site1 completed');

  // Site 2: replay-system._applyCanonicalReplayMarkFromDetail
  const c2 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: null,
  };
  attachRealHelpers(c2);
  c2.replaySystem = {
    isActive: true,
    replayTimestamp: playhead,
    fullRawData: fx.fine,
    currentIndex: fx.fine.length - 1,
  };
  global.window = global.window || {};
  delete global.window[SWITCH];
  const rs2 = Object.create(ReplaySystem.prototype);
  rs2.chart = c2;
  rs2.isActive = true;
  rs2.animatingCandle = null;
  c2.replaySystem = Object.assign(c2.replaySystem, { isActive: true });
  // Helpers read playhead from chart.replaySystem
  c2._getReplayPlayheadMs = function () { return playhead; };
  const before2 = snapshotOhlc(c2.data[c2.data.length - 1]);
  rs2._applyCanonicalReplayMarkFromDetail({
    canonicalMark: MARK,
    hostFileId: 'file-gbpusd',
  });
  assert.equal(c2._mcCanonicalReplayMark, MARK, 'site2 stamps _mcCanonicalReplayMark');
  assertUnchanged(before2, snapshotOhlc(c2.data[c2.data.length - 1]), 'site2 must not mutate completed bar');
  assertNoSimTag(c2.data[c2.data.length - 1], 'site2 completed');

  // Site 3: bridge fallback (no _applyCanonicalReplayMarkFromDetail)
  const c3 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: { isActive: true }, // present but method absent
  };
  attachRealHelpers(c3);
  c3._getReplayPlayheadMs = function () { return playhead; };
  const before3 = snapshotOhlc(c3.data[c3.data.length - 1]);
  const bridge = makeBridgeFn();
  bridge.apply(c3, MARK);
  assert.equal(c3._mcCanonicalReplayMark, MARK, 'site3 stamps _mcCanonicalReplayMark');
  assertUnchanged(before3, snapshotOhlc(c3.data[c3.data.length - 1]), 'site3 must not mutate completed bar');
  assertNoSimTag(c3.data[c3.data.length - 1], 'site3 completed');

  void beforeLast;
});

// Boundary cell for M8 (off-by-one): playhead === periodEnd - 1 is COMPLETE.
test('cell1b: boundary playhead === periodEnd-1 is completed (kills off-by-one)', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast - 1;
  const { chart } = makeChartHarness({
    playheadMs: playhead,
    data: fx.coarse.map(cloneBar),
    liveMark: MARK,
  });
  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  const ret = chart.resolveEffectiveCurrentPrice(chart.data);
  assert.equal(ret, MARK);
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'playhead === periodEnd-1 must skip write (trim predicate)');
});

// Also exercise series/index periodEnd (interior next.t), not only last+periodMs.
test('cell1c: multi-bar series/index periodEnd — completed interior-style last via next.t path', () => {
  const fx = makeResampledFixture();
  // Use first two coarse bars as data; last = coarse[1], periodEnd = coarse[2].t via series.
  const data = fx.coarse.slice(0, 2).map(cloneBar);
  const playhead = fx.interiorPeriodEnd; // === data[1] period end via next bar
  const { chart } = makeChartHarness({
    playheadMs: playhead,
    data,
    liveMark: MARK,
  });
  // Prove _getBarPeriodEndMs uses series[barIdx+1].t
  const end = chart._getBarPeriodEndMs(data[1].t, chart.data, 1, M15);
  assert.equal(end, fx.interiorPeriodEnd, 'periodEnd from next bar timestamp');
  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  chart._applyCanonicalMarkToFormingBar(MARK);
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'series/index complete bar must not be rewritten');
  assert.equal(chart.data.length >= 2, true, 'multi-bar series required');
});

test('cell1d: A7 fixture-only 1m intra-bar arm is not credited to production reachability', () => {
  // Production finest data is 1m for every symbol, so a sub-minute "newsreader"
  // forming read cannot be reached by the served dataset. Keep this as an
  // explicit fixture arm so the forming half cannot pass vacuously.
  const fx = makeBoundaryFixture(M1);
  const mark = 25;

  const { chart: forming } = makeChartHarness({
    timeframe: '1m',
    playheadMs: fx.data[1].t + 30_000,
    data: fx.data.map(cloneBar),
    liveMark: mark,
  });
  forming._applyCanonicalMarkToFormingBar(mark);
  assertMarkExpanded(forming.data[forming.data.length - 1], mark, 'fixture-only 1m forming');
  assertSimTag(forming.data[forming.data.length - 1], 'fixture-only 1m forming');

  const { chart: completed } = makeChartHarness({
    timeframe: '1m',
    playheadMs: fx.completedPlayhead,
    data: fx.data.map(cloneBar),
    liveMark: mark,
  });
  const before = snapshotOhlc(completed.data[completed.data.length - 1]);
  completed._applyCanonicalMarkToFormingBar(mark);
  assertUnchanged(before, snapshotOhlc(completed.data[completed.data.length - 1]),
    'fixture-only 1m completed bar remains immutable');
  assertNoSimTag(completed.data[completed.data.length - 1], 'fixture-only 1m completed');
});

test('cell1e: A7 boundary holds across 5m, 15m, 1h, and 4h display buckets', () => {
  for (const { tf, ms } of [
    { tf: '5m', ms: M5 },
    { tf: '15m', ms: M15 },
    { tf: '1h', ms: H1 },
    { tf: '4h', ms: H4 },
  ]) {
    const fx = makeBoundaryFixture(ms);
    const mark = 1000 + ms / M1;
    const { chart: forming } = makeChartHarness({
      timeframe: tf,
      playheadMs: fx.formingPlayhead,
      data: fx.data.map(cloneBar),
      liveMark: mark,
    });
    forming._applyCanonicalMarkToFormingBar(mark);
    assertMarkExpanded(forming.data[forming.data.length - 1], mark, `${tf} forming`);
    assertSimTag(forming.data[forming.data.length - 1], `${tf} forming`);

    const { chart: completed } = makeChartHarness({
      timeframe: tf,
      playheadMs: fx.completedPlayhead,
      data: fx.data.map(cloneBar),
      liveMark: mark,
    });
    const before = snapshotOhlc(completed.data[completed.data.length - 1]);
    completed._applyCanonicalMarkToFormingBar(mark);
    assertUnchanged(before, snapshotOhlc(completed.data[completed.data.length - 1]),
      `${tf} completed bar remains immutable`);
    assertNoSimTag(completed.data[completed.data.length - 1], `${tf} completed`);
  }
});

// ─── Cell 2: FORMING last bar, guard ON, all three sites ─────────────────

test('cell2: forming last bar — all three sites stamp close and expand h/l', () => {
  const fx = makeResampledFixture();
  const playhead = fx.lastBucketStart + 8 * M1; // strictly inside period
  assert.ok(playhead < fx.periodEndLast - 1, 'playhead inside forming window');
  const data = fx.coarse.map(cloneBar);
  // Ensure mark is outside current h/l so expansion is observable.
  const mark = Math.max(...data.map((b) => b.h)) + 0.01;

  // Site 1
  const { chart: c1 } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  const ret = c1.resolveEffectiveCurrentPrice(c1.data);
  assert.equal(ret, mark, 'site1 returns live');
  assertMarkExpanded(c1.data[c1.data.length - 1], mark, 'site1');
  assertSimTag(c1.data[c1.data.length - 1], 'site1');

  // Site 2
  const c2 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
  };
  attachRealHelpers(c2);
  c2._getReplayPlayheadMs = function () { return playhead; };
  const rs2 = Object.create(ReplaySystem.prototype);
  rs2.chart = c2;
  rs2.animatingCandle = null;
  rs2._applyCanonicalReplayMarkFromDetail({
    canonicalMark: mark,
    hostFileId: 'file-gbpusd',
  });
  assert.equal(c2._mcCanonicalReplayMark, mark);
  assertMarkExpanded(c2.data[c2.data.length - 1], mark, 'site2');
  assertSimTag(c2.data[c2.data.length - 1], 'site2');

  // Site 3 fallback
  const c3 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: {},
  };
  attachRealHelpers(c3);
  c3._getReplayPlayheadMs = function () { return playhead; };
  makeBridgeFn().apply(c3, mark);
  assert.equal(c3._mcCanonicalReplayMark, mark);
  assertMarkExpanded(c3.data[c3.data.length - 1], mark, 'site3');
  assertSimTag(c3.data[c3.data.length - 1], 'site3');
});

// ─── Cell 3: INDETERMINATE — write still happens ─────────────────────────

test('cell3: indeterminate playhead / null periodEnd — write preserved', () => {
  const fx = makeResampledFixture();
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.02;

  // Non-finite playhead
  const { chart: cNaN } = makeChartHarness({
    playheadMs: NaN,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  cNaN.resolveEffectiveCurrentPrice(cNaN.data);
  assertMarkExpanded(cNaN.data[cNaN.data.length - 1], mark, 'non-finite playhead');

  // periodEnd null
  const { chart: cNull } = makeChartHarness({
    playheadMs: fx.periodEndLast,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  cNull._forcePeriodEndNull = true;
  // Direct helper (site-agnostic indeterminate via periodEnd)
  const before = snapshotOhlc(cNull.data[cNull.data.length - 1]);
  cNull._applyCanonicalMarkToFormingBar(mark);
  assert.notDeepEqual(snapshotOhlc(cNull.data[cNull.data.length - 1]), before,
    'null periodEnd must still write');
  assertMarkExpanded(cNull.data[cNull.data.length - 1], mark, 'null periodEnd');
});

// ─── Cell 4: KILL SWITCH truthy — completed bar mutated again ────────────

test('cell4: kill switch truthy — completed bar mutated at all three sites', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.03;

  // Site 1
  const { chart: c1, window: w1 } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
    kill: true,
  });
  assert.equal(!!w1[SWITCH], true);
  c1.resolveEffectiveCurrentPrice(c1.data);
  assertMarkExpanded(c1.data[c1.data.length - 1], mark, 'site1 kill');

  // Site 2
  const c2 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
  };
  global.window = { [SWITCH]: 1 }; // truthy, not === true
  attachRealHelpers(c2);
  c2._getReplayPlayheadMs = function () { return playhead; };
  const rs2 = Object.create(ReplaySystem.prototype);
  rs2.chart = c2;
  rs2.animatingCandle = null;
  rs2._applyCanonicalReplayMarkFromDetail({
    canonicalMark: mark,
    hostFileId: 'file-gbpusd',
  });
  assertMarkExpanded(c2.data[c2.data.length - 1], mark, 'site2 kill');
  delete global.window[SWITCH];

  // Site 3 — bridge inline path reads global. (Helper path would read window.)
  const c3 = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: {},
    parseTimeframe(tf) {
      const m = String(tf).match(/(\d+)m/);
      return m ? Number(m[1]) * M1 : M15;
    },
    _getReplayPlayheadMs() { return playhead; },
    _getBarPeriodEndMs(barStart, series, barIdx, periodMs) {
      if (Array.isArray(series) && barIdx + 1 < series.length) {
        return Number(series[barIdx + 1].t);
      }
      return barStart + periodMs;
    },
  };
  const bridge = makeBridgeFn({ kill: 'yes' });
  bridge.apply(c3, mark);
  assertMarkExpanded(c3.data[c3.data.length - 1], mark, 'site3 kill');
});

// ─── Cell 5: Bridge fallback vs delegate ─────────────────────────────────

test('cell5: bridge fallback when apply absent; delegates without double-write when present', () => {
  const fx = makeResampledFixture();
  const playhead = fx.lastBucketStart + 5 * M1; // forming
  const mark = 9.999;

  // Fallback path
  const cFall = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: { /* no _applyCanonicalReplayMarkFromDetail */ },
  };
  attachRealHelpers(cFall);
  cFall._getReplayPlayheadMs = function () { return playhead; };
  let helperCalls = 0;
  const orig = cFall._applyCanonicalMarkToFormingBar;
  cFall._applyCanonicalMarkToFormingBar = function (m) {
    helperCalls += 1;
    return orig.call(this, m);
  };
  makeBridgeFn().apply(cFall, mark);
  assert.equal(helperCalls, 1, 'fallback uses chart helper');
  assert.equal(cFall.data[cFall.data.length - 1].c, mark);

  // Delegate path — bridge must NOT also write
  let detailCalls = 0;
  let helperCalls2 = 0;
  const cDel = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: {
      _applyCanonicalReplayMarkFromDetail(detail) {
        detailCalls += 1;
        this.chart._mcCanonicalReplayMark = detail.canonicalMark;
        // Simulate site2 helper call once
        this.chart._applyCanonicalMarkToFormingBar(detail.canonicalMark);
      },
    },
  };
  cDel.replaySystem.chart = cDel;
  attachRealHelpers(cDel);
  cDel._getReplayPlayheadMs = function () { return playhead; };
  const orig2 = cDel._applyCanonicalMarkToFormingBar;
  cDel._applyCanonicalMarkToFormingBar = function (m) {
    helperCalls2 += 1;
    return orig2.call(this, m);
  };
  const before = snapshotOhlc(cDel.data[cDel.data.length - 1]);
  makeBridgeFn().apply(cDel, mark);
  assert.equal(detailCalls, 1, 'delegates to replay-system');
  assert.equal(helperCalls2, 1, 'single write via delegate — no bridge double-write');
  assert.equal(cDel.data[cDel.data.length - 1].c, mark);
  assert.notDeepEqual(snapshotOhlc(cDel.data[cDel.data.length - 1]), before);
});

// Bridge inline guard when helper absent but playhead/periodEnd helpers exist.
test('cell5b: bridge inline guard when helper missing but period helpers present', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast; // completed
  const c = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: {},
    parseTimeframe(tf) {
      const m = String(tf).match(/(\d+)m/);
      return m ? Number(m[1]) * M1 : M15;
    },
    _getReplayPlayheadMs() { return playhead; },
    _getBarPeriodEndMs(barStart, series, barIdx, periodMs) {
      if (Array.isArray(series) && barIdx + 1 < series.length) {
        return Number(series[barIdx + 1].t);
      }
      return barStart + periodMs;
    },
  };
  // Deliberately NO _applyCanonicalMarkToFormingBar
  const before = snapshotOhlc(c.data[c.data.length - 1]);
  makeBridgeFn().apply(c, MARK);
  assert.equal(c._mcCanonicalReplayMark, MARK);
  assertUnchanged(before, snapshotOhlc(c.data[c.data.length - 1]),
    'inline bridge guard skips completed bar');
});

// ─── Cell 6: site2 fallback when chart helper absent (m2-style) ───────────

test('cell6: helper-absent site2 fallback stamps close (m2-style indeterminate)', () => {
  // Matches m2-canonical-replay-mark.test.mjs coarsePanel: no chart helper,
  // no playhead/period helpers → indeterminate ⇒ write must still happen.
  global.window = global.window || {};
  delete global.window[SWITCH];
  const completedClose = 1.37365;
  const chart = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: [{
      t: T0,
      o: 1.37300,
      h: 1.37400,
      l: 1.37200,
      c: completedClose,
    }],
    _mcCanonicalReplayMark: null,
  };
  assert.equal(typeof chart._applyCanonicalMarkToFormingBar, 'undefined');
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.animatingCandle = null;
  rs._applyCanonicalReplayMarkFromDetail({
    canonicalMark: MARK,
    hostFileId: 'file-gbpusd',
  });
  assert.equal(chart._mcCanonicalReplayMark, MARK, 'mark stamped');
  assert.equal(chart.data[0].c, MARK, 'fallback must write when helper absent');
  assert.ok(chart.data[0].h >= MARK);
  assert.ok(chart.data[0].l <= MARK);
});

test('cell6b: helper-absent site2 fallback skips completed when period helpers present', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  global.window = global.window || {};
  delete global.window[SWITCH];
  const chart = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
    parseTimeframe(tf) {
      const m = String(tf).match(/(\d+)m/);
      return m ? Number(m[1]) * M1 : M15;
    },
    _getReplayPlayheadMs() { return playhead; },
    _getBarPeriodEndMs(barStart, series, barIdx, periodMs) {
      if (Array.isArray(series) && barIdx + 1 < series.length) {
        return Number(series[barIdx + 1].t);
      }
      return barStart + periodMs;
    },
  };
  assert.equal(typeof chart._applyCanonicalMarkToFormingBar, 'undefined');
  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.animatingCandle = null;
  rs._applyCanonicalReplayMarkFromDetail({
    canonicalMark: MARK,
    hostFileId: 'file-gbpusd',
  });
  assert.equal(chart._mcCanonicalReplayMark, MARK);
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'fallback must skip completed bar when period helpers present');
});

// ─── Cell 7: site 4 mirror-frame animated-candle tip write ───────────────

function runMirrorFrameSite4({ playheadMs, data, animClose }) {
  global.window = global.window || {};
  delete global.window[SWITCH];
  // Isolate from any parent-window embed fast path.
  global.window.parent = global.window;

  const fx = makeResampledFixture();
  const formBar = fx.fine[fx.fine.length - 1];
  const anim = {
    t: formBar.t,
    o: formBar.o,
    h: Math.max(formBar.h, animClose) + 0.005,
    l: Math.min(formBar.l, animClose) - 0.005,
    c: animClose,
    v: 99,
  };

  const chart = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: data.map(cloneBar),
    rawData: [],
    resampleData(sliced) { return sliced.map(cloneBar); },
  };
  attachRealHelpers(chart);
  chart._getReplayPlayheadMs = function () { return playheadMs; };

  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.isActive = true;
  rs.fullRawData = fx.fine.map(cloneBar);
  rs.sessionStartIndex = 0;
  rs.currentIndex = 0;
  rs.tickProgress = 5; // > 1 → in-place tip patch path (site 4)
  rs.tickElapsedMs = 100;
  rs.autoScrollEnabled = false;
  rs.userHasPanned = true;
  rs.animatingCandle = null;
  rs._finishMultichartMirrorRender = function () {};

  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  const ok = rs.applyMultichartMirrorFrame({
    timestamp: playheadMs,
    tickElapsedMs: 100,
    tickProgress: 5,
    hostFileId: 'file-gbpusd',
    isPlaying: true,
    animatedCandle: anim,
    canonicalMark: animClose,
  });
  return { ok, chart, before, anim, fx };
}

test('cell7: mirror-path forming bar — animated close write happens', () => {
  const fx = makeResampledFixture();
  const playhead = fx.lastBucketStart + 8 * M1;
  assert.ok(playhead < fx.periodEndLast - 1, 'forming window');
  const animClose = Math.max(...fx.coarse.map((b) => b.h)) + 0.02;
  const { ok, chart, before } = runMirrorFrameSite4({
    playheadMs: playhead,
    data: fx.coarse.map(cloneBar),
    animClose,
  });
  assert.equal(ok, true, 'mirror frame applied');
  assert.notDeepEqual(snapshotOhlc(chart.data[chart.data.length - 1]), before,
    'forming mirror tip must mutate');
  assert.equal(chart.data[chart.data.length - 1].c, animClose,
    'animated close stamped on forming bar');
  assertSimTag(chart.data[chart.data.length - 1], 'site4 mirror forming');
});

test('cell7b: mirror-path completed bar — animated close write skipped', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast; // COMPLETE
  const animClose = Math.max(...fx.coarse.map((b) => b.h)) + 0.03;
  const { ok, chart, before } = runMirrorFrameSite4({
    playheadMs: playhead,
    data: fx.coarse.map(cloneBar),
    animClose,
  });
  assert.equal(ok, true, 'mirror frame applied');
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'completed mirror tip must not mutate OHLC');
  assert.notEqual(chart.data[chart.data.length - 1].c, animClose);
  assertNoSimTag(chart.data[chart.data.length - 1], 'site4 mirror completed');
});

// ─── Cell 8: FLAG-01/02 realm reach (B-0195) ─────────────────────────────
//
// All four guarded sites run inside multichart panel iframes. Every one of them
// used to read the switch from its own realm only. An operator flips the switch on
// the page in front of them — the host — so the panels never saw it: the guard
// stayed ON, the flip presented as "no change", and the reading available to us was
// "the fix does nothing". A negative control that cannot reach the code it aims at
// is worse than no control, because it produces a confident wrong answer.

test('cell8: site1 — switch set on the HOST realm reaches the panel (parent climb)', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast; // completed ⇒ guard ON would skip the write
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.03;

  const { chart, window: win } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
    kill: undefined, // own realm clean, exactly as a panel sees it
  });
  assert.equal(!!win[SWITCH], false, 'panel realm must not carry the switch');
  win.parent[SWITCH] = true; // operator typed it on the host

  chart.resolveEffectiveCurrentPrice();
  assertMarkExpanded(chart.data[chart.data.length - 1], mark,
    'host-set switch must disable the guard inside the panel');
});

test('cell8b: site1 — switch on TOP reaches a nested panel realm', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.03;

  const { chart, window: win } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  // Grid inside a dashboard shell: panel → grid host → top. Only top carries it.
  win.top = { [SWITCH]: 1 };
  chart.resolveEffectiveCurrentPrice();
  assertMarkExpanded(chart.data[chart.data.length - 1], mark,
    'top-set switch must disable the guard inside the panel');
});

test('cell8c: site3 bridge — host-set switch reaches the panel bridge', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const mark = Math.max(...fx.coarse.map((b) => b.h)) + 0.03;
  const bridge = makeBridgeFn({ kill: undefined });
  bridge.global.parent = { [SWITCH]: true };

  const chart = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
    replaySystem: {},
    _getReplayPlayheadMs() { return playhead; },
    _getBarPeriodEndMs(_i) { return fx.periodEndLast; },
    parseTimeframe() { return 15 * M1; },
  };
  bridge.apply(chart, mark);
  assertMarkExpanded(chart.data[chart.data.length - 1], mark,
    'host-set switch must disable the guard inside the panel bridge');
});

test('cell8d: site2 replay-system — host-set switch reaches the panel module', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const mark = Math.max(...fx.coarse.map((b) => b.h)) + 0.03;
  const chart = {
    currentFileId: 'file-gbpusd',
    currentTimeframe: '15m',
    data: fx.coarse.map(cloneBar),
    _mcCanonicalReplayMark: null,
  };
  // Panel realm: own window clean, switch on the host above it.
  global.window = { parent: { [SWITCH]: true } };
  attachRealHelpers(chart);
  chart._getReplayPlayheadMs = function () { return playhead; };
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.animatingCandle = null;
  rs._applyCanonicalReplayMarkFromDetail({ canonicalMark: mark, hostFileId: 'file-gbpusd' });
  assertMarkExpanded(chart.data[chart.data.length - 1], mark,
    'host-set switch must disable the guard in replay-system');
  global.window = {};
});

test('cell8e: guard stays ON when no realm carries the switch — climb is not a leak', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.03;
  const { chart, window: win } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  win.top = {};
  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  chart.resolveEffectiveCurrentPrice();
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'a clean realm chain must leave the guard ON');
});

test('cell8f: an unreadable cross-origin realm must not disable the guard', () => {
  const fx = makeResampledFixture();
  const playhead = fx.periodEndLast;
  const data = fx.coarse.map(cloneBar);
  const mark = Math.max(...data.map((b) => b.h)) + 0.03;
  const { chart, window: win } = makeChartHarness({
    playheadMs: playhead,
    data: data.map(cloneBar),
    liveMark: mark,
  });
  // A cross-origin parent throws on property access. That is no instruction, so the
  // shipped default (guard ON) must stand rather than the switch appearing set.
  Object.defineProperty(win, 'parent', {
    get() { throw new Error('cross-origin'); },
    configurable: true,
  });
  const before = snapshotOhlc(chart.data[chart.data.length - 1]);
  assert.doesNotThrow(() => chart.resolveEffectiveCurrentPrice());
  assertUnchanged(before, snapshotOhlc(chart.data[chart.data.length - 1]),
    'unreadable realm must not read as switch-set');
});

test('MUTANT own-realm-only predicate: cell8 dies, proving the climb is load-bearing', () => {
  // The shipped predicate and the pre-B-0195 predicate, on the same realm chain a
  // panel actually sees. If both agreed, cell8 would pass with the defect present.
  const sandbox = { console: { log() {}, warn() {}, error() {} }, Object, Error };
  sandbox.globalThis = sandbox;
  sandbox.window = { parent: { [SWITCH]: true } };
  vm.createContext(sandbox);
  vm.runInContext(`
${CHART_FLAG_PREDICATE}
function _hostOnlyMutant(flagName) {
    return typeof window !== 'undefined' && !!window[flagName];
}
globalThis.__shipped = _talariaDisableFlagTruthy(${JSON.stringify(SWITCH)});
globalThis.__mutant = _hostOnlyMutant(${JSON.stringify(SWITCH)});
`, sandbox);
  assert.equal(sandbox.__shipped, true, 'shipped predicate must see the host switch');
  assert.equal(sandbox.__mutant, false, 'the mutant is blind — this is the defect fixed');
});

// ─── White-box / mirror anchors (after behavioural cells) ────────────────

test('anchor: all four guarded sites read the switch through a realm climb', () => {
  // Named per file because the defect was not uniform: replay-system already had a
  // climbing helper for sixteen other switches and this one switch bypassed it.
  assert.match(CHART_SOURCE, /function _talariaDisableFlagTruthy\(/);
  assert.match(
    methodSource(CHART_SOURCE, '_applyCanonicalMarkToFormingBar'),
    /_talariaDisableFlagTruthy\(\s*'__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1'/,
  );
  const replaySrc = fs.readFileSync(REPLAY_JS, 'utf8');
  assert.match(
    moduleFunctionSource(replaySrc, '_completedBarCloseGuardDisabled'),
    /_talariaDisableFlagTruthy\(/,
  );
  assert.match(BRIDGE_SOURCE, /function talariaDisableFlagTruthy\(/);
  for (const [label, src] of [
    ['chart.js', CHART_SOURCE],
    ['replay-system.js', replaySrc],
    ['panel-cmd-bridge.js', BRIDGE_SOURCE],
  ]) {
    for (const realm of ['parent', 'top']) {
      assert.ok(src.includes(`function ${label === 'panel-cmd-bridge.js' ? 'talariaDisableFlagTruthy' : '_talariaDisableFlagTruthy'}(`),
        `${label} must define the climbing predicate`);
      assert.ok(new RegExp(`\\.${realm}\\b`).test(src), `${label} must reach .${realm}`);
    }
  }
});


test('anchor: helper + kill-switch present; four sites guarded; mirrors byte-identical', () => {
  assert.match(CHART_SOURCE, /_applyCanonicalMarkToFormingBar\s*\(/);
  assert.match(CHART_SOURCE, /__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1/);
  assert.match(methodSource(CHART_SOURCE, '_applyCanonicalMarkToFormingBar'),
    /playhead\s*>=\s*periodEnd\s*-\s*1/);
  assert.match(methodSource(CHART_SOURCE, 'resolveEffectiveCurrentPrice'),
    /_applyCanonicalMarkToFormingBar\s*\(\s*live\s*\)/);
  const replaySrc = fs.readFileSync(REPLAY_JS, 'utf8');
  // D's gate slice: first call-site `_applyCanonicalReplayMarkFromDetail(detail)`
  // through `_buildMultichartReplayFrameDetail` — must be free of tip OHLC writes.
  const applyStart = replaySrc.indexOf('_applyCanonicalReplayMarkFromDetail(detail)');
  const applySlice = replaySrc.slice(
    applyStart,
    replaySrc.indexOf('_buildMultichartReplayFrameDetail', applyStart),
  );
  assert.match(applySlice, /_applyCanonicalMarkToFormingBar/);
  assert.match(applySlice, /applyAnimatedCandleToFormingBar/);
  assert.match(applySlice, /applyCanonicalMarkToFormingBarFallback/);
  assert.equal(/\blast\.c\s*=/.test(applySlice), false);
  assert.equal(/\blast\.h\s*=/.test(applySlice), false);
  assert.equal(/\blast\.l\s*=/.test(applySlice), false);
  // No `.call(this, detail)` re-anchors — product call sites stay original form.
  assert.equal(/_applyCanonicalReplayMarkFromDetail\.call\s*\(/.test(replaySrc), false);
  assert.match(replaySrc, /function applyCanonicalMarkToFormingBarFallback\s*\(/);
  assert.match(replaySrc, /function applyAnimatedCandleToFormingBar\s*\(/);
  assert.match(CHART_SOURCE, /__talariaFormingSim/);
  assert.match(replaySrc, /__talariaFormingSim/);
  assert.match(BRIDGE_SOURCE, /_applyCanonicalMarkToFormingBar/);
  assert.match(BRIDGE_SOURCE, /__TALARIA_DISABLE_COMPLETED_BAR_CLOSE_GUARD_V1/);

  assert.equal(sha256(fs.readFileSync(CHART_JS)), sha256(fs.readFileSync(CHART_MIRROR)));
  assert.equal(sha256(fs.readFileSync(REPLAY_JS)), sha256(fs.readFileSync(REPLAY_MIRROR)));
  assert.equal(sha256(fs.readFileSync(BRIDGE_JS)), sha256(fs.readFileSync(BRIDGE_MIRROR)));
});
