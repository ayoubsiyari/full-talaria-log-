import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const INDICATORS = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-indicators-full.js');
const INDICATORS_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'chart-indicators-full.js');
const PRESENCE = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'module-presence-runtime.js');
const PRESENCE_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'module-presence-runtime.js');
const P3_SWITCH = '__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1';
const P4_SWITCH = '__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1';

const indicatorSource = fs.readFileSync(INDICATORS, 'utf8');
const presenceSource = fs.readFileSync(PRESENCE, 'utf8');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function replaceOnce(text, needle, replacement) {
  assert.ok(text.includes(needle), `mutation anchor missing: ${needle}`);
  return text.replace(needle, replacement);
}

function replaceNth(text, needle, replacement, nth) {
  let seen = 0;
  return text.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
    seen++;
    return seen === nth ? replacement : match;
  });
}

function assertThrowsOracle(name, fn) {
  assert.throws(fn, undefined, `${name} must be killed by the acceptance oracle`);
}

function callMatches(text) {
  return (text.match(/_indicatorPerf\(\)/g) || []).length - 1;
}

function assertJsonEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function assertIndicatorRouting(text = indicatorSource) {
  const helper = "function _indicatorPerf() {\n        return (typeof window !== 'undefined' && window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 === true)\n            ? null\n            : global.IndicatorPerf;\n    }";
  assert.ok(text.includes(helper), 'P3 helper reads the runtime flag without caching');
  const withoutHelper = text.replace(helper, '');
  assert.equal((withoutHelper.match(/global\.IndicatorPerf/g) || []).length, 0,
    'no call site may read global.IndicatorPerf directly');
  assert.equal(callMatches(text), 10,
    '10 helper call sites cover the 14 original textual reads across 12 lines');
}

const indicatorPerfSites = [
  ['rollingSmaNullable', 'rollingSmaFast'],
  ['rollingWmaNullable', 'rollingWmaFast'],
  ['recalculateIndicatorsAsync packBarsCompact', 'packBarsCompact'],
  ['_indicatorParamsHash', 'hashIndicatorParams'],
  ['_m19iB62AtomicMergeSet', 'mergeIndicatorTailWindow'],
  ['tailMeta mergeWindow', 'mergeIndicatorTailWindow'],
  ['_m19iExactTailPaint estimateTailLookback', 'estimateTailLookback'],
  ['_m19ifApplyCoherentBridge merge', 'mergeIndicatorTailWindow'],
  ['recalculateIndicatorsIncremental estimateTailLookback', 'estimateTailLookback'],
  ['legacy incremental estimateTailLookback', 'estimateTailLookback'],
];

function makeBars(count) {
  return Array.from({ length: count }, (_, i) => {
    const v = i + 1;
    return { t: 1_700_000_000_000 + i * 60_000, o: v, h: v, l: v, c: v, close: v, volume: 10 };
  });
}

function makeIndicatorContext(text = indicatorSource) {
  const calls = {
    rollingSmaFast: 0,
    rollingWmaFast: 0,
    packBarsCompact: 0,
    packBarsRangeCompact: 0,
    hashIndicatorParams: 0,
    mergeIndicatorTailWindow: 0,
    estimateTailLookback: 0,
  };
  const workers = [];
  class Chart {}
  const document = {
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { id: '', textContent: '', style: {}, setAttribute() {} }; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
  const window = {
    Chart,
    document,
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {},
    clearTimeout() {},
    alert() {},
    IndicatorPerf: {
      rollingSmaFast() { calls.rollingSmaFast++; return ['FAST_SMA']; },
      rollingWmaFast() { calls.rollingWmaFast++; return ['FAST_WMA']; },
      packBarsCompact() { calls.packBarsCompact++; return new Float64Array([1, 2, 3]); },
      packBarsRangeCompact(_bars, start, end) { calls.packBarsRangeCompact++; return new Float64Array([start, end]); },
      hashIndicatorParams() { calls.hashIndicatorParams++; return 'FAST_HASH'; },
      mergeIndicatorTailWindow(_existing, fresh) { calls.mergeIndicatorTailWindow++; return fresh; },
      estimateTailLookback() { calls.estimateTailLookback++; return 7; },
    },
  };
  function Worker(url) {
    const worker = {
      url,
      posts: [],
      onmessage: null,
      onerror: null,
      postMessage(message, transfer) {
        this.posts.push({ message, transfer });
      },
    };
    workers.push(worker);
    return worker;
  }
  const context = vm.createContext({
    window,
    self: window,
    document,
    console: window.console,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    alert: window.alert,
    Worker,
    Date,
    Math,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
  });
  vm.runInContext(text, context, { filename: 'chart-indicators-full.js' });
  return { window, Chart, calls, workers };
}

function makeChart(Chart) {
  const chart = new Chart();
  chart.data = makeBars(5);
  chart.currentTimeframe = '1m';
  chart.indicators = {
    active: [
      { id: 'sma-smooth-sma', type: 'sma', params: { period: 1, source: 'close', smoothingType: 'SMA', smoothingLength: 2 }, visible: true },
      { id: 'sma-smooth-wma', type: 'sma', params: { period: 1, source: 'close', smoothingType: 'WMA', smoothingLength: 2 }, visible: true },
    ],
    data: {},
  };
  chart.updateOHLCIndicators = function () {};
  chart.scheduleRender = function () {};
  chart._setAllIndicatorsCalculating = function () {};
  chart.bumpIndicatorRenderVersion = function () {};
  return chart;
}

function makeWorkerChart(Chart, count = 300) {
  const chart = new Chart();
  chart.data = makeBars(count);
  chart.currentTimeframe = '1m';
  chart.dataVersion = 0;
  chart.indicators = {
    active: [
      { id: 'sma-worker', type: 'sma', params: { period: 2, source: 'close' }, style: {}, visible: true },
    ],
    data: { 'sma-worker': { line: new Array(count).fill(1) } },
  };
  chart.updateOHLCIndicators = function () {};
  chart.scheduleRender = function () { this._scheduled = (this._scheduled || 0) + 1; };
  chart._setAllIndicatorsCalculating = function () {};
  chart._clearIndicatorCalculatingFlags = function () {};
  chart._markIndicatorRecalcComplete = function () { this._markedComplete = (this._markedComplete || 0) + 1; };
  chart.bumpIndicatorRenderVersion = function () {
    this._indicatorRenderVersion = (this._indicatorRenderVersion || 0) + 1;
  };
  chart.recalculateIndicatorsAsync = Chart.prototype.recalculateIndicatorsAsync;
  return chart;
}

function latestPost(workers) {
  const worker = workers[workers.length - 1];
  assert.ok(worker, 'worker was constructed');
  assert.ok(worker.posts.length > 0, 'worker received a post');
  return worker.posts[worker.posts.length - 1];
}

function assertIndicatorDefaultOracle(text = indicatorSource) {
  const { window, Chart, calls } = makeIndicatorContext(text);
  delete window[P3_SWITCH];
  const chart = makeChart(Chart);
  chart.recalculateIndicators();
  assertJsonEqual(chart.indicators.data['sma-smooth-sma'].ma, ['FAST_SMA']);
  assertJsonEqual(chart.indicators.data['sma-smooth-wma'].ma, ['FAST_WMA']);
  assert.equal(calls.rollingSmaFast, 1);
  assert.equal(calls.rollingWmaFast, 1);
}

function assertIndicatorKillOracle(text = indicatorSource) {
  const { window, Chart, calls } = makeIndicatorContext(text);
  window[P3_SWITCH] = true;
  const chart = makeChart(Chart);
  chart.recalculateIndicators();
  assertJsonEqual(chart.indicators.data['sma-smooth-sma'].ma, [null, 1.5, 2.5, 3.5, 4.5]);
  assertJsonEqual(chart.indicators.data['sma-smooth-wma'].ma, [null, 1.6666666666666667, 2.6666666666666665, 3.6666666666666665, 4.666666666666667]);
  assert.equal(calls.rollingSmaFast, 0);
  assert.equal(calls.rollingWmaFast, 0);
}

function assertIndicatorFlipOracle(text = indicatorSource) {
  const { window, Chart, calls } = makeIndicatorContext(text);
  window[P3_SWITCH] = true;
  const chart = makeChart(Chart);
  chart.recalculateIndicators();
  assert.equal(calls.rollingSmaFast, 0);
  window[P3_SWITCH] = false;
  chart.recalculateIndicators();
  assert.equal(calls.rollingSmaFast, 1);
  assertJsonEqual(chart.indicators.data['sma-smooth-sma'].ma, ['FAST_SMA']);
}

function mutateIndicatorPerfCall(text, callSiteNumber) {
  return replaceNth(text, '_indicatorPerf()', 'global.IndicatorPerf', callSiteNumber + 1);
}

function assertParamsHashOracle(text = indicatorSource) {
  const { window, Chart } = makeIndicatorContext(text);
  const chart = makeChart(Chart);
  delete window[P3_SWITCH];
  assert.equal(chart._indicatorParamsHash(), 'FAST_HASH');
  window[P3_SWITCH] = true;
  assert.equal(chart._indicatorParamsHash(), 'sma-smooth-sma:101|sma-smooth-wma:101');
}

function assertAsyncPackOracle(text = indicatorSource) {
  let env = makeIndicatorContext(text);
  delete env.window[P3_SWITCH];
  let chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsAsync();
  let payload = latestPost(env.workers).message.payload;
  assert.equal(env.calls.packBarsCompact, 1);
  assert.equal(payload.bars, null);
  assert.ok(payload.barsPacked instanceof Float64Array);

  env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = true;
  chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsAsync();
  payload = latestPost(env.workers).message.payload;
  assert.equal(env.calls.packBarsCompact, 0);
  assert.equal(payload.barsPacked, null);
  assert.equal(payload.bars, chart.data);
}

function runApplyTailOracle(text, { kill, exactTail = true } = {}) {
  const env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = !!kill;
  if (!exactTail) env.window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 = true;
  const chart = makeWorkerChart(env.Chart, 5);
  chart._indicatorWorkerSeq = 1;
  const ret = chart._applyIndicatorWorkerResults(
    { 'sma-worker': { line: [2, 3, 4, 5, 6] } },
    1,
    null,
    { tailStart: 0, fromIndex: 0, totalLength: 5, markComplete: true, timeframe: '1m' },
  );
  return { ...env, chart, ret };
}

function assertAtomicMergeOracle(text = indicatorSource) {
  let env = runApplyTailOracle(text, { kill: false, exactTail: true });
  assert.equal(env.ret, true);
  assert.equal(env.calls.mergeIndicatorTailWindow, 1);
  assert.notEqual(env.chart._m19iCoalesceFullAsync, true);

  env = runApplyTailOracle(text, { kill: true, exactTail: true });
  assert.equal(env.ret, true);
  assert.equal(env.calls.mergeIndicatorTailWindow, 0);
  assert.equal(env.chart._m19iCoalesceFullAsync, true);
  assert.equal(env.chart._indicatorWorkerCoalesce, true);
}

function assertApplyWorkerLegacyMergeOracle(text = indicatorSource) {
  let env = runApplyTailOracle(text, { kill: false, exactTail: false });
  assert.equal(env.ret, true);
  assert.equal(env.calls.mergeIndicatorTailWindow, 1);
  assert.notEqual(env.chart._m19iCoalesceFullAsync, true);

  env = runApplyTailOracle(text, { kill: true, exactTail: false });
  assert.equal(env.ret, true);
  assert.equal(env.calls.mergeIndicatorTailWindow, 0);
  assert.equal(env.chart._m19iCoalesceFullAsync, true);
  assert.equal(env.chart._indicatorWorkerCoalesce, true);
}

function assertExactTailPaintOracle(text = indicatorSource) {
  let env = makeIndicatorContext(text);
  delete env.window[P3_SWITCH];
  let chart = makeWorkerChart(env.Chart);
  chart._m19iExactTailPaint();
  assert.equal(env.calls.estimateTailLookback, 1);

  env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = true;
  chart = makeWorkerChart(env.Chart);
  assert.equal(chart._m19iExactTailPaint(), false);
  assert.equal(env.calls.estimateTailLookback, 0);
}

function assertCoherentBridgeOracle(text = indicatorSource) {
  let env = makeIndicatorContext(text);
  delete env.window[P3_SWITCH];
  let chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsIncremental(300);
  assert.equal(env.calls.mergeIndicatorTailWindow, 1);
  assert.equal(chart._m19ifStats.bridgedSeries, 1);

  env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = true;
  chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsIncremental(300);
  assert.equal(env.calls.mergeIndicatorTailWindow, 0);
  assert.equal(chart._m19ifStats.uncoveredSeries, 1);
}

function assertIncrementalPayloadOracle(text = indicatorSource) {
  let env = makeIndicatorContext(text);
  delete env.window[P3_SWITCH];
  let chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsIncremental(300);
  let payload = latestPost(env.workers).message.payload;
  assert.equal(payload.lookback, 7);
  assert.equal(payload.tailStart, 291);
  assert.equal(payload.fromIndex, 298);
  assert.ok(payload.barsPacked instanceof Float64Array);
  assert.equal(payload.bars, null);

  env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = true;
  chart = makeWorkerChart(env.Chart);
  chart.recalculateIndicatorsIncremental(300);
  payload = latestPost(env.workers).message.payload;
  assert.equal(payload.lookback, 256);
  assert.equal(payload.tailStart, 42);
  assert.equal(payload.fromIndex, 298);
  assert.equal(payload.barsPacked, null);
  assert.equal(payload.bars.length, 258);
}

function assertLegacyIncrementalPayloadOracle(text = indicatorSource) {
  let env = makeIndicatorContext(text);
  delete env.window[P3_SWITCH];
  let chart = makeWorkerChart(env.Chart);
  chart._recalculateIndicatorsIncrementalLegacy(300);
  let payload = latestPost(env.workers).message.payload;
  assert.equal(payload.lookback, 7);
  assert.equal(payload.fromIndex, 293);
  assert.ok(payload.barsPacked instanceof Float64Array);
  assert.equal(payload.bars, null);

  env = makeIndicatorContext(text);
  env.window[P3_SWITCH] = true;
  chart = makeWorkerChart(env.Chart);
  chart._recalculateIndicatorsIncrementalLegacy(300);
  payload = latestPost(env.workers).message.payload;
  assert.equal(payload.lookback, 256);
  assert.equal(payload.fromIndex, 44);
  assert.equal(payload.barsPacked, null);
  assert.equal(payload.bars, chart.data);
}

const p3BehaviorSites = [
  ['recalculateIndicatorsAsync packBarsCompact', 3, assertAsyncPackOracle],
  ['_indicatorParamsHash', 4, assertParamsHashOracle],
  ['_m19iB62AtomicMergeSet', 5, assertAtomicMergeOracle],
  ['_applyIndicatorWorkerResults tail mergeWindow', 6, assertApplyWorkerLegacyMergeOracle],
  ['_m19iExactTailPaint estimateTailLookback', 7, assertExactTailPaintOracle],
  ['_m19ifApplyCoherentBridge merge', 8, assertCoherentBridgeOracle],
  ['recalculateIndicatorsIncremental estimateTailLookback', 9, assertIncrementalPayloadOracle],
  ['_recalculateIndicatorsIncrementalLegacy estimateTailLookback', 10, assertLegacyIncrementalPayloadOracle],
];

function makePresenceDocument({ providerBeforeConsumer = false } = {}) {
  const ids = new Map();
  const body = { children: [], appendChild(node) { ids.set(node.id, node); this.children.push(node); return node; } };
  const documentElement = { children: [], appendChild(node) { ids.set(node.id, node); this.children.push(node); return node; } };
  const provider = { compareDocumentPosition: () => (providerBeforeConsumer ? 4 : 0) };
  const consumer = {};
  const listeners = new Map();
  return {
    readyState: 'complete',
    body,
    documentElement,
    createElement(tag) { return { tagName: tag, id: '', style: {}, textContent: '', setAttribute() {} }; },
    getElementById(id) { return ids.get(id) || null; },
    querySelector(sel) {
      if (sel.includes('chart-indicators-full.js')) return consumer;
      if (sel.includes('indicator-performance.js')) return provider;
      return null;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    listeners(type) { return listeners.get(type) || []; },
  };
}

function makePresenceContext(text = presenceSource, {
  kill = false,
  providerBeforeConsumer = false,
  perf = null,
  seedDegraded = false,
  seedLoaded = false,
} = {}) {
  const timers = [];
  const events = [];
  const document = makePresenceDocument({ providerBeforeConsumer });
  const sentinelA = { active: false, degradedModules: [] };
  const sentinelB = { active: false, degradedModules: sentinelA.degradedModules };
  const sentinelC = { active: false, degradedModules: sentinelA.degradedModules };
  const loadedSentinel = [];
  const window = {
    document,
    console: { log() {}, warn() {}, error() {} },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    dispatchEvent(event) { events.push(event); return true; },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
  };
  if (seedDegraded) {
    window.__TALARIA_DEGRADED_STATE = sentinelA;
    window.__TALARIA_DEGRADED_STATE__ = sentinelB;
    window.__TALARIA_DEGRADED_MODE__ = sentinelC;
  }
  if (seedLoaded) window.__TALARIA_LOADED_MODULES = loadedSentinel;
  if (kill) window[P4_SWITCH] = true;
  else delete window[P4_SWITCH];
  if (perf) window.IndicatorPerf = perf;
  const context = vm.createContext({
    window,
    self: window,
    document,
    console: window.console,
    Node: window.Node,
    CustomEvent: window.CustomEvent,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
  });
  vm.runInContext(text, context, { filename: 'module-presence-runtime.js' });
  function flushTimers(max = 40) {
    let runs = 0;
    while (timers.length && runs < max) {
      const item = timers.shift();
      item.fn();
      runs++;
    }
    return runs;
  }
  return { window, document, timers, events, flushTimers, sentinelA, sentinelB, sentinelC, loadedSentinel };
}

function assertPresenceDefaultOracle(text = presenceSource) {
  const env = makePresenceContext(text);
  assert.ok(env.timers.length > 0, 'default absent schedules the current tripwire');
  env.flushTimers();
  assert.ok(env.document.getElementById('talaria-degraded-indicator'), 'default failed tripwire draws badge');
  assert.equal(env.events.filter((event) => event.type === 'talaria:correctness-degraded').length, 1);
  assert.notEqual(env.window.__TALARIA_DEGRADED_STATE, env.sentinelA);
  assertJsonEqual(env.window.__TALARIA_DEGRADED_STATE.degradedModules, ['IndicatorPerf']);
}

function assertPresenceKillOracle(text = presenceSource) {
  const env = makePresenceContext(text, { kill: true });
  assert.equal(env.timers.length, 0, 'kill mode schedules no timer');
  assert.equal(env.document.listeners('DOMContentLoaded').length, 0, 'kill mode installs no scheduling listener');
  assert.equal(env.window.__TALARIA_LOADED_MODULES, undefined);
  assert.equal(env.window.__TALARIA_DEGRADED_STATE, undefined);
  assert.equal(env.window.__TALARIA_DEGRADED_STATE__, undefined);
  assert.equal(env.window.__TALARIA_DEGRADED_MODE__, undefined);
  assert.equal(typeof env.window.__talariaRegisterModule, 'function');
  assert.equal(env.document.getElementById('talaria-degraded-indicator'), null);
  assert.equal(env.events.length, 0);
}

function assertPresenceFlipOracle(text = presenceSource) {
  const env = makePresenceContext(text, { kill: true });
  assert.equal(env.window.__TALARIA_DEGRADED_STATE, undefined);
  assert.equal(env.timers.length, 0);
  env.window[P4_SWITCH] = false;
  env.window.__talariaMarkMissingModule('IndicatorPerf');
  assert.ok(env.window.__TALARIA_LOADED_MODULES, 'ON->OFF publishes module ledger lazily');
  assert.ok(env.window.__TALARIA_DEGRADED_STATE, 'ON->OFF publishes Lane-5 contract lazily');
  assert.equal(env.window.__TALARIA_DEGRADED_STATE, env.window.__TALARIA_DEGRADED_STATE__);
  assert.equal(env.window.__TALARIA_DEGRADED_MODE__.active, true);
  assertJsonEqual(env.window.__TALARIA_DEGRADED_STATE.degradedModules, ['IndicatorPerf']);
  assert.ok(env.timers.length > 0, 'ON->OFF re-arms automatic tripwire detection');
  assert.ok(env.document.getElementById('talaria-degraded-indicator'), 'ON->OFF permits observation again');
  assert.equal(env.events.filter((event) => event.type === 'talaria:correctness-degraded').length, 1);
}

function assertPresenceRearmOracle(text = presenceSource) {
  const env = makePresenceContext(text, { kill: true });
  env.window[P4_SWITCH] = false;
  env.window.__talariaMarkMissingModule('SessionCalendar');
  assertJsonEqual(env.window.__TALARIA_DEGRADED_STATE.degradedModules, ['SessionCalendar']);
  assert.ok(env.timers.length > 0, 'first post-disable markMissing re-arms tripwire');
  env.flushTimers();
  assertJsonEqual(env.window.__TALARIA_DEGRADED_STATE.degradedModules, ['SessionCalendar', 'IndicatorPerf']);
  assert.equal(env.events.filter((event) => event.type === 'talaria:correctness-degraded').length, 2);
}

function assertPresenceSeededValuesOracle(text = presenceSource) {
  const env = makePresenceContext(text, { seedDegraded: true, seedLoaded: true });
  assert.equal(env.window.__TALARIA_LOADED_MODULES, env.loadedSentinel);
  assert.equal(env.window.__TALARIA_DEGRADED_STATE, env.sentinelA);
  env.flushTimers();
  assert.equal(env.window.__TALARIA_DEGRADED_STATE, env.sentinelA);
  assertJsonEqual(env.sentinelA.degradedModules, ['IndicatorPerf']);
}

function assertPresenceExternalReportOracle(text = presenceSource) {
  const env = makePresenceContext(text, { kill: true });
  env.window.__talariaMarkMissingModule('SessionCalendar');
  assert.ok(env.document.getElementById('talaria-degraded-indicator'));
  assertJsonEqual(env.window.__TALARIA_DEGRADED_STATE.degradedModules, ['SessionCalendar']);
  assert.equal(env.events[0].detail.module, 'SessionCalendar');
}

test('R3 mirror parity and hash evidence', () => {
  const mirrorIndicators = fs.readFileSync(INDICATORS_MIRROR, 'utf8');
  const mirrorPresence = fs.readFileSync(PRESENCE_MIRROR, 'utf8');
  assert.equal(indicatorSource, mirrorIndicators);
  assert.equal(presenceSource, mirrorPresence);
  assert.ok(sha256(indicatorSource));
  assert.ok(sha256(presenceSource));
});

test('P3 routes every IndicatorPerf read through the runtime helper', () => {
  assertIndicatorRouting();
  assert.equal((indicatorSource.match(/global\.IndicatorPerf/g) || []).length, 1,
    'only the helper may read global.IndicatorPerf');
  assert.equal((indicatorSource.match(/_indicatorPerf\(\)/g) || []).length, 11,
    'function definition plus 10 call sites');
  assert.deepEqual(indicatorPerfSites.map((site) => site[0]), [
    'rollingSmaNullable',
    'rollingWmaNullable',
    'recalculateIndicatorsAsync packBarsCompact',
    '_indicatorParamsHash',
    '_m19iB62AtomicMergeSet',
    'tailMeta mergeWindow',
    '_m19iExactTailPaint estimateTailLookback',
    '_m19ifApplyCoherentBridge merge',
    'recalculateIndicatorsIncremental estimateTailLookback',
    'legacy incremental estimateTailLookback',
  ]);
});

test('P3 default absent uses current IndicatorPerf fast path', () => {
  assertIndicatorDefaultOracle();
});

test('P3 flag-on runs fallback implementations and ON-to-OFF is reversible', () => {
  assertIndicatorKillOracle();
  assertIndicatorFlipOracle();
});

test('P3 reviewed IndicatorPerf sites have behavioural kill-switch oracles', () => {
  for (const [_name, _callSite, oracle] of p3BehaviorSites) oracle();
  for (const [name, callSite, oracle] of p3BehaviorSites) {
    assertThrowsOracle(`P3 behavioural unroute mutant: ${name}`, () => {
      oracle(mutateIndicatorPerfCall(indicatorSource, callSite));
    });
  }
});

test('P4 default absent keeps current fail-loud behavior', () => {
  assertPresenceDefaultOracle();
});

test('P4 flag-on has no degraded side effects and ON-to-OFF is reversible', () => {
  assertPresenceKillOracle();
  assertPresenceFlipOracle();
  assertPresenceRearmOracle();
  assertPresenceSeededValuesOracle();
  assertPresenceExternalReportOracle();
});

test('R3 mutation oracles pass unmutated product first, then kill required mutants', () => {
  assertIndicatorRouting();
  assertIndicatorDefaultOracle();
  assertIndicatorKillOracle();
  assertIndicatorFlipOracle();
  for (const [_name, _callSite, oracle] of p3BehaviorSites) oracle();
  assertPresenceDefaultOracle();
  assertPresenceKillOracle();
  assertPresenceFlipOracle();
  assertPresenceRearmOracle();
  assertPresenceSeededValuesOracle();
  assertPresenceExternalReportOracle();

  assertThrowsOracle('P3 deleted flag read', () => assertIndicatorKillOracle(
    replaceOnce(indicatorSource,
      "return (typeof window !== 'undefined' && window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 === true)\n            ? null\n            : global.IndicatorPerf;",
      'return global.IndicatorPerf;'),
  ));
  assertThrowsOracle('P3 inverted flag read', () => assertIndicatorKillOracle(
    replaceOnce(indicatorSource, 'window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 === true',
      'window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 !== true'),
  ));
  assertThrowsOracle('P3 inverted defaulting', () => assertIndicatorDefaultOracle(
    replaceOnce(indicatorSource, 'window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 === true',
      'window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 !== false'),
  ));
  for (let i = 1; i <= callMatches(indicatorSource); i++) {
    assertThrowsOracle(`P3 unrouted call site ${i}`, () => assertIndicatorRouting(
      replaceNth(indicatorSource, '_indicatorPerf()', 'global.IndicatorPerf', i + 1),
    ));
  }
  for (const [name, callSite, oracle] of p3BehaviorSites) {
    assertThrowsOracle(`P3 behavioural unrouted site ${name}`, () => {
      oracle(mutateIndicatorPerfCall(indicatorSource, callSite));
    });
  }

  assertThrowsOracle('P4 deleted flag read', () => assertPresenceKillOracle(
    replaceOnce(presenceSource,
      "return typeof window !== 'undefined'\n            && window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 === true;",
      'return false;'),
  ));
  assertThrowsOracle('P4 inverted flag read', () => assertPresenceKillOracle(
    replaceOnce(presenceSource, 'window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 === true',
      'window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 !== true'),
  ));
  assertThrowsOracle('P4 inverted defaulting', () => assertPresenceDefaultOracle(
    replaceOnce(presenceSource, 'window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 === true',
      'window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 !== false'),
  ));
  assertThrowsOracle('P4 lazy contract publication removed', () => assertPresenceFlipOracle(
    replaceOnce(presenceSource,
      'publishRuntimeContracts();\n        armTripwire();',
      'armTripwire();'),
  ));
  assertThrowsOracle('P4 lazy tripwire re-arm removed', () => assertPresenceRearmOracle(
    replaceOnce(presenceSource,
      'publishRuntimeContracts();\n        armTripwire();',
      'publishRuntimeContracts();'),
  ));
  assertThrowsOracle('P4 external degraded reporting over-suppressed', () => assertPresenceExternalReportOracle(
    replaceOnce(presenceSource,
      "if (modulePresenceTripwireDisabled() && source === 'module-presence-tripwire') return;",
      'if (modulePresenceTripwireDisabled()) return;'),
  ));
});
