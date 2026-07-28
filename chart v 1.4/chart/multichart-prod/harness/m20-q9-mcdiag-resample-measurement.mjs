/**
 * M20-Q9 — per-tick full-resample MEASUREMENT harness (Manager A, critical path).
 *
 * Purpose (Director §A9.3, "measure before building"): confirm or exclude the
 * hypothesis that ReplaySystem's M20-Q9 correction (`_m20Q9DropConsumerResampleCache`
 * on every `_installPlayheadPrefix`) defeats ChartDataPipeline's incremental
 * O(1) resample branch, so every replay tick performs a FULL resample of the
 * whole sliced raw history.
 *
 * WHAT IS REAL HERE (no product file is modified by this harness):
 *   - `chart v 1.4/chart/chart.js`                     → real `Chart` class, loaded in a
 *     node:vm sandbox with a stub DOM. Real `resampleData`, `_resampleDataFull`,
 *     `_prepareBarsForResampling`, `parseTimeframe`, `_ensureMcDiag`,
 *     `_mcDiagIsFullArrayResample`, `_mcDiagWrapReplaySystem`,
 *     `_trimLastDataBarToReplayPlayhead`, `bumpDataVersion`.
 *   - `chart v 1.4/chart/modules/chart-data-pipeline.js` → real `ChartDataPipeline`,
 *     real `getResampledSeries`, real `_tryIncrementalResample`, real
 *     `invalidateResampleCache`.
 *   - `chart v 1.4/chart/modules/replay-system.js`      → real `ReplaySystem.prototype`,
 *     real `updateChartData` (the production replay tick entry point), real
 *     `_installPlayheadPrefix`, `_m20Q9PrefixSliceFixEnabled`,
 *     `_m20Q9DropConsumerResampleCache`.
 *
 * WHAT IS STUBBED (declared, and listed in the evidence file):
 *   - DOM/render/UI/persistence/panel-sync methods reached by `updateChartData`
 *     AFTER the prefix-install + resample work. See STUBBED_REPLAY_METHODS.
 *   - The playhead is advanced by `currentIndex += 1` per tick rather than through
 *     `_advanceReplayPlayheadOneStep()` (which needs peer/cadence state). The
 *     resample-relevant input, `sliceEnd = currentIndex + 1`, is identical.
 *
 * Counters are attached by instance-level wrapping of real methods; the real
 * function body always executes.
 *
 * Run:
 *   node "chart v 1.4/chart/multichart-prod/harness/m20-q9-mcdiag-resample-measurement.mjs"
 *   node ... --json out.json      write machine-readable evidence
 *   node ... --ticks 300 --raw 3000 --start 1500 --repeats 3
 *
 * Determinism (§A5): synthetic dataset is a pure function of its index; no
 * wall-clock, UUID or float-equality inside any reported count. Wall-clock ms
 * is reported separately and explicitly labelled advisory-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_DIR = path.resolve(__dirname, '..', '..'); // chart v 1.4/chart
const KS_Q9 = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';

// ── CLI ──────────────────────────────────────────────────────────────────────

function argv(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
}

const CONFIG = {
  rawBars: Number(argv('raw', 3000)),
  startIndex: Number(argv('start', 1500)),
  ticks: Number(argv('ticks', 300)),
  repeats: Number(argv('repeats', 3)),
  jsonOut: typeof argv('json', null) === 'string' ? String(argv('json', null)) : null,
};

// ── Stub DOM sandbox ─────────────────────────────────────────────────────────

function stubEl() {
  return new Proxy({
    style: new Proxy({}, {
      get(t, k) {
        if (k === 'setProperty' || k === 'removeProperty' || k === 'getPropertyValue') return () => '';
        return t[k];
      },
      set(t, k, v) { t[k] = v; return true; },
    }),
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dataset: {},
    children: [],
    childNodes: [],
    tagName: 'DIV',
  }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return function () { return null; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function stubDocument() {
  const el = stubEl();
  return {
    readyState: 'loading', // keeps chart.js auto-init from firing
    documentElement: stubEl(),
    body: el,
    head: el,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return el; },
    createDocumentFragment() { return el; },
    createEvent() { return { initEvent() {} }; },
    cookie: '', hidden: false, visibilityState: 'visible',
  };
}

/** Load the three real product files into one vm context. */
function loadProductSandbox() {
  const ctx = {};
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.document = stubDocument();
  ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {}, table() {}, group() {}, groupEnd() {} };
  ctx.navigator = { userAgent: 'talaria-node-harness', platform: 'node', maxTouchPoints: 0, language: 'en-US' };
  ctx.location = {
    href: 'http://localhost/harness', search: '', hash: '',
    origin: 'http://localhost', pathname: '/harness', protocol: 'http:',
  };
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {}, key() { return null; }, length: 0 };
  ctx.sessionStorage = ctx.localStorage;
  ctx.performance = { now: () => Number(process.hrtime.bigint()) / 1e6 };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.setInterval = setInterval; ctx.clearInterval = clearInterval;
  ctx.requestAnimationFrame = (cb) => setTimeout(() => cb(ctx.performance.now()), 0);
  ctx.cancelAnimationFrame = clearTimeout;
  ctx.queueMicrotask = queueMicrotask;
  ctx.CustomEvent = class CustomEvent { constructor(type, o = {}) { this.type = type; this.detail = o && o.detail; } };
  ctx.Event = class Event { constructor(type) { this.type = type; } };
  ctx.EventTarget = class EventTarget { addEventListener() {} removeEventListener() {} dispatchEvent() { return true; } };
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  ctx.dispatchEvent = () => true;
  ctx.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  ctx.fetch = () => Promise.reject(new Error('harness: network disabled'));
  ctx.devicePixelRatio = 1;
  ctx.innerWidth = 1280; ctx.innerHeight = 800;
  ctx.URL = URL; ctx.URLSearchParams = URLSearchParams;
  ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
  ctx.Worker = class Worker { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} };
  ctx.indexedDB = null;
  ctx.crypto = { getRandomValues: (a) => a, randomUUID: () => '00000000-0000-4000-8000-000000000000' };

  vm.createContext(ctx);

  const files = ['modules/chart-data-pipeline.js', 'modules/replay-system.js', 'chart.js'];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(CHART_DIR, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  if (typeof ctx.Chart !== 'function') throw new Error('product Chart class not loaded');
  if (typeof ctx.ReplaySystem !== 'function') throw new Error('product ReplaySystem not loaded');
  if (typeof ctx.ChartDataPipeline !== 'function') throw new Error('product ChartDataPipeline not loaded');
  return ctx;
}

// ── Deterministic dataset (pure function of index) ────────────────────────────

const EPOCH = Date.UTC(2024, 0, 2, 0, 0, 0); // fixed; never Date.now()
const RAW_STEP_MS = 60_000; // native raw feed = 1m bars (Rayan's §A9 cell)

function makeRawSeries(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i / 17) * 3 + Math.cos(i / 53) * 5;
    const o = 1000 + wave;
    const c = 1000 + Math.sin((i + 1) / 17) * 3 + Math.cos((i + 1) / 53) * 5;
    out[i] = {
      t: EPOCH + i * RAW_STEP_MS,
      o,
      h: Math.max(o, c) + ((i * 37) % 11) / 10,
      l: Math.min(o, c) - ((i * 53) % 13) / 10,
      c,
      v: 100 + (i % 97),
    };
  }
  return out;
}

// ── Harness chart / replay construction ──────────────────────────────────────

/**
 * ReplaySystem methods stubbed at INSTANCE level (prototype untouched).
 * All of them run AFTER (or beside) the prefix-install + resample work in
 * updateChartData; none of them can change the resample counters.
 */
const STUBBED_REPLAY_METHODS = [
  '_clampCurrentIndexToReplayTimestamp',
  'updateSliderRange',
  'updateSlider',
  'updateTimeDisplay',
  '_syncCompareOverlaysForReplay',
  '_scheduleReplayIndicatorRecalc',
  'syncReplayViewportToPlayhead',
  '_applyPlaybackViewportLock',
  '_renderReplayChartUpdate',
  'syncPanelCharts',
  'updateAutoScrollIndicator',
  '_persistReplayStateThrottled',
  '_resolveCanonicalReplayMark',
  '_multichartBroadcastReplayFrame',
];

const STUBBED_CHART_METHODS = [
  'constrainOffset',
  '_markScalesDirty',
  '_invalidateIndicatorLayerCache',
  '_syncReplayPlayheadCrosshairValues',
];

function buildCell(ctx, {
  timeframe, killSwitchOn, raw, startIndex, wrapReplayForMcDiag, neutralizeCacheDrop,
}) {
  ctx.window[KS_Q9] = killSwitchOn ? true : undefined;
  if (!killSwitchOn) delete ctx.window[KS_Q9];

  const chart = Object.create(ctx.Chart.prototype);
  chart.currentTimeframe = timeframe;
  chart.dataVersion = 0;
  chart.data = [];
  chart.rawData = null;
  chart.isLoading = false;
  chart.offsetX = 0;
  chart.autoScale = true;
  chart.chartSettings = {};
  // Replay implies backtest mode, which is what makes _shouldUseDisplayPipeline()
  // return true unconditionally (chart.js:25413) — i.e. the render path really
  // does re-enter the pipeline on every frame during replay.
  chart.isBacktestMode = true;
  chart.w = 1280;
  chart.h = 800;
  chart.margin = { l: 60, r: 60, t: 20, b: 30 };
  chart.candleWidth = 6;
  chart.dataPipeline = new ctx.ChartDataPipeline(chart);
  for (const m of STUBBED_CHART_METHODS) chart[m] = function () {};

  const replay = Object.create(ctx.ReplaySystem.prototype);
  replay.chart = chart;
  replay.fullRawData = raw;
  replay.currentIndex = startIndex;
  replay.sessionStartIndex = 0;
  replay.isActive = true;
  replay.isPlaying = true;
  replay.autoScrollEnabled = false;   // avoids viewport math; no resample effect
  replay.userHasPanned = false;
  replay.replayTimestamp = raw[startIndex].t;
  replay.tickElapsedMs = 0;
  replay.tickProgress = 0;
  replay.animatingCandle = null;
  replay._timeframeChanging = false;
  for (const m of STUBBED_REPLAY_METHODS) replay[m] = function () { return null; };

  // POSITIVE CONTROL ONLY — not a product configuration. Neutralizes the
  // M20-Q9 correction's per-install cache drop so the pipeline's incremental
  // branch becomes reachable. Proves the branch counters can register a hit
  // (§A5 four-state proof) and measures the headroom the drop currently costs.
  // The correction exists for a real correctness reason (playhead-trimmed
  // stale bucket, see replay-system.js _m20Q9DropConsumerResampleCache docblock);
  // this cell is NOT a proposed fix.
  if (neutralizeCacheDrop) replay._m20Q9DropConsumerResampleCache = function () {};

  chart.replaySystem = replay;
  chart._ensureMcDiag();                      // real product counter object
  if (wrapReplayForMcDiag) chart._mcDiagWrapReplaySystem(); // real product wrapper

  // ── instrumentation ──────────────────────────────────────────────────────
  // The PRIMARY numbers come from the separated in-product counters added by
  // this packet (_mcDiag.replayTicks / .fullResamples / .incrementalResamples).
  // The wraps below are an INDEPENDENT second instrument over the same real
  // functions; agreement between the two is reported per cell.
  const m = {
    ticks: 0,
    getResampledSeriesCalls: 0,
    resampleDataCalls: 0,
    fullArrayResampleDataCalls: 0,     // calls where _mcDiagIsFullArrayResample() true
    incrementalAttempts: 0,
    incrementalSuccesses: 0,
    fullResamples: 0,                  // real _resampleDataFull invocations
    fullResampleOutputBars: 0,         // resampled output objects emitted
    preparedBarObjects: 0,             // _prepareBarsForResampling output objects
    cacheDrops: 0,                     // invalidateResampleCache() calls
    cacheHitReturns: 0,                // getResampledSeries served from cache untouched
    incrementalCopiedBars: 0,          // prevResampled.slice() elements copied per hit
    lastOutputBars: 0,
    outputBarsFirstTick: 0,
    outputBarsLastTick: 0,
  };

  const pipeline = chart.dataPipeline;

  const realGet = pipeline.getResampledSeries.bind(pipeline);
  pipeline.getResampledSeries = function (...args) {
    m.getResampledSeriesCalls += 1;
    const beforeFull = m.fullResamples;
    const beforeInc = m.incrementalSuccesses;
    const out = realGet(...args);
    if (m.fullResamples === beforeFull && m.incrementalSuccesses === beforeInc) m.cacheHitReturns += 1;
    m.lastOutputBars = Array.isArray(out) ? out.length : 0;
    return out;
  };

  const realTryInc = pipeline._tryIncrementalResample.bind(pipeline);
  pipeline._tryIncrementalResample = function (source, prevResampled, ...rest) {
    m.incrementalAttempts += 1;
    const out = realTryInc(source, prevResampled, ...rest);
    if (out) {
      m.incrementalSuccesses += 1;
      // chart-data-pipeline.js `_tryIncrementalResample` opens with
      // `const out = prevResampled.slice()` — a full-length copy of the whole
      // previous resampled series. Measure what it copies so "incremental
      // fired" is never read as "O(1)".
      m.incrementalCopiedBars += Array.isArray(prevResampled) ? prevResampled.length : 0;
    }
    return out;
  };

  const realInvalidate = pipeline.invalidateResampleCache.bind(pipeline);
  pipeline.invalidateResampleCache = function (...args) {
    m.cacheDrops += 1;
    return realInvalidate(...args);
  };

  const realResampleData = chart.resampleData.bind(chart);
  chart.resampleData = function (data, tf) {
    m.resampleDataCalls += 1;
    if (chart._mcDiagIsFullArrayResample(data)) m.fullArrayResampleDataCalls += 1;
    return realResampleData(data, tf);
  };

  const realFull = chart._resampleDataFull.bind(chart);
  chart._resampleDataFull = function (data, tf) {
    m.fullResamples += 1;
    const out = realFull(data, tf);
    m.fullResampleOutputBars += Array.isArray(out) ? out.length : 0;
    return out;
  };

  const realPrepare = chart._prepareBarsForResampling.bind(chart);
  chart._prepareBarsForResampling = function (data) {
    const out = realPrepare(data);
    m.preparedBarObjects += Array.isArray(out) ? out.length : 0;
    return out;
  };

  return { chart, replay, metrics: m };
}

// ── Cell runner ──────────────────────────────────────────────────────────────

function runCell(ctx, {
  timeframe, killSwitchOn, wrapReplayForMcDiag = true, neutralizeCacheDrop = false,
  renderFramePerTick = false,
}) {
  const raw = makeRawSeries(CONFIG.rawBars);
  const { chart, replay, metrics } = buildCell(ctx, {
    timeframe,
    killSwitchOn,
    raw,
    startIndex: CONFIG.startIndex,
    wrapReplayForMcDiag,
    neutralizeCacheDrop,
  });

  const fixEnabledObserved = replay._m20Q9PrefixSliceFixEnabled();
  const diag = chart._mcDiag;

  // One render frame, exactly as chart.js render() does it: drop the per-frame
  // memo, then let getDisplaySeries() → buildDisplaySeries() run for real.
  const renderFrame = () => {
    chart._frameDisplaySeries = null;
    chart.getDisplaySeries();
  };

  // One priming tick establishes chart.rawData / pipeline cache, exactly as the
  // first replay frame does. Counters are read AFTER priming so the measured
  // window is steady-state replay only.
  replay.updateChartData(false);
  if (renderFramePerTick) renderFrame();

  const primedDiag = { ...diag };
  const primed = { ...metrics };

  const prefixIdentities = new Set();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < CONFIG.ticks; i++) {
    replay.currentIndex += 1;
    replay.replayTimestamp = raw[replay.currentIndex].t;
    replay.updateChartData(false);
    if (renderFramePerTick) renderFrame();
    prefixIdentities.add(chart.rawData);
    metrics.ticks += 1;
    if (i === 0) metrics.outputBarsFirstTick = metrics.lastOutputBars;
    if (i === CONFIG.ticks - 1) metrics.outputBarsLastTick = metrics.lastOutputBars;
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const d = (k) => metrics[k] - primed[k];
  const dDiag = (k) => diag[k] - primedDiag[k];

  // Primary (separated in-product counters)
  const productReplayTicks = dDiag('replayTicks');
  const productFullResamples = dDiag('fullResamples');
  const productIncremental = dDiag('incrementalResamples');

  return {
    timeframe,
    killSwitch: killSwitchOn ? `${KS_Q9}=true` : `${KS_Q9} absent`,
    m20Q9FixEnabledObserved: fixEnabledObserved,
    cacheDropNeutralizedPositiveControl: !!neutralizeCacheDrop,
    renderFramePerTick: !!renderFramePerTick,
    ticksDriven: CONFIG.ticks,
    rawBarsAtStart: CONFIG.startIndex + 2,
    rawBarsAtEnd: CONFIG.startIndex + 1 + CONFIG.ticks,

    // ── PRIMARY: separated product counters ────────────────────────────────
    product_replayTicks: productReplayTicks,
    product_fullResamples: productFullResamples,
    product_incrementalResamples: productIncremental,
    product_fullResamplesPerTick: productReplayTicks
      ? Number((productFullResamples / productReplayTicks).toFixed(4)) : null,
    product_incrementalPerTick: productReplayTicks
      ? Number((productIncremental / productReplayTicks).toFixed(4)) : null,

    // ── legacy field, reported only to show WHY it is unusable ─────────────
    legacy_mcDiagResamplesDelta: dDiag('resamples'),
    legacy_mcDiagResamplesPerTick: productReplayTicks
      ? Number((dDiag('resamples') / productReplayTicks).toFixed(4)) : null,
    legacyFieldComposition: 'resamples = updateChartData wrapper hits + resampleData(full-array) hits',
    mcDiagWrapperInstalled: !!wrapReplayForMcDiag,

    // ── independent second instrument (harness wraps of the same functions) ─
    wrap_fullResamples: d('fullResamples'),
    wrap_incrementalSuccesses: d('incrementalSuccesses'),
    wrap_incrementalAttempts: d('incrementalAttempts'),
    instrumentsAgree: d('fullResamples') === productFullResamples
      && d('incrementalSuccesses') === productIncremental,

    // ── mechanism / allocation scale ───────────────────────────────────────
    resampleDataCalls: d('resampleDataCalls'),
    fullArrayResampleDataCalls: d('fullArrayResampleDataCalls'),
    getResampledSeriesCalls: d('getResampledSeriesCalls'),
    cacheDrops: d('cacheDrops'),
    cacheHitReturns: d('cacheHitReturns'),
    fullResampleOutputBars: d('fullResampleOutputBars'),
    outputBarsPerFullResample: d('fullResamples')
      ? Number((d('fullResampleOutputBars') / d('fullResamples')).toFixed(1)) : null,
    preparedBarObjects: d('preparedBarObjects'),
    incrementalCopiedBars: d('incrementalCopiedBars'),
    copiedBarsPerIncrementalHit: d('incrementalSuccesses')
      ? Number((d('incrementalCopiedBars') / d('incrementalSuccesses')).toFixed(1)) : null,
    outputBarsFirstTick: metrics.outputBarsFirstTick,
    outputBarsLastTick: metrics.outputBarsLastTick,
    distinctRawDataIdentities: prefixIdentities.size,

    advisoryElapsedMs: Math.round(elapsedMs * 100) / 100,
    advisoryMsPerTick: Math.round((elapsedMs / CONFIG.ticks) * 1000) / 1000,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const CELLS = [
  // Required 2×2 matrix, tick path only (no render frame).
  { id: 'A1  1m / fix-ON  (switch absent)', timeframe: '1m', killSwitchOn: false },
  { id: 'A2  1m / fix-OFF (switch=true)', timeframe: '1m', killSwitchOn: true },
  { id: 'A3  1h / fix-ON  (switch absent)', timeframe: '1h', killSwitchOn: false },
  { id: 'A4  1h / fix-OFF (switch=true)', timeframe: '1h', killSwitchOn: true },
  // Same matrix WITH the per-frame render path, which re-enters the pipeline
  // via getDisplaySeries() → buildDisplaySeries() → getResampledSeries().
  { id: 'B1  1m / fix-ON  + render frame', timeframe: '1m', killSwitchOn: false, renderFramePerTick: true },
  { id: 'B2  1m / fix-OFF + render frame', timeframe: '1m', killSwitchOn: true, renderFramePerTick: true },
  { id: 'B3  1h / fix-ON  + render frame', timeframe: '1h', killSwitchOn: false, renderFramePerTick: true },
  { id: 'B4  1h / fix-OFF + render frame', timeframe: '1h', killSwitchOn: true, renderFramePerTick: true },
  // Legacy-field composition witness: same cell as A1 with the product's
  // updateChartData wrapper NOT installed.
  { id: 'C1  1m / fix-ON  (no mcDiag tick wrapper)', timeframe: '1m', killSwitchOn: false, wrapReplayForMcDiag: false },
  // Positive controls (NOT product configurations): prove the incremental
  // counter can register hits, and size the headroom the cache drop costs.
  { id: 'D1  CONTROL 1m fix-ON, cache-drop neutralized', timeframe: '1m', killSwitchOn: false, neutralizeCacheDrop: true },
  { id: 'D2  CONTROL 1h fix-ON, cache-drop neutralized', timeframe: '1h', killSwitchOn: false, neutralizeCacheDrop: true },
  { id: 'D3  CONTROL 1m fix-ON, cache-drop neutralized + render frame', timeframe: '1m', killSwitchOn: false, neutralizeCacheDrop: true, renderFramePerTick: true },
];

const COUNT_KEYS = [
  'product_replayTicks', 'product_fullResamples', 'product_incrementalResamples',
  'legacy_mcDiagResamplesDelta', 'wrap_fullResamples', 'wrap_incrementalSuccesses',
  'wrap_incrementalAttempts', 'resampleDataCalls', 'fullArrayResampleDataCalls',
  'getResampledSeriesCalls', 'cacheDrops', 'cacheHitReturns',
  'fullResampleOutputBars', 'preparedBarObjects', 'incrementalCopiedBars',
  'outputBarsFirstTick', 'outputBarsLastTick', 'distinctRawDataIdentities',
];

function main() {
  const runs = [];
  for (let r = 0; r < CONFIG.repeats; r++) {
    const ctx = loadProductSandbox(); // fresh sandbox per repeat
    const cells = {};
    for (const cell of CELLS) {
      cells[cell.id] = runCell(ctx, cell);
    }
    runs.push(cells);
  }

  // Repeat determinism
  const determinism = {};
  for (const id of Object.keys(runs[0])) {
    const mismatches = [];
    for (const key of COUNT_KEYS) {
      const vals = runs.map((run) => run[id][key]);
      if (new Set(vals).size !== 1) mismatches.push({ key, values: vals });
    }
    determinism[id] = { identicalAcrossRepeats: mismatches.length === 0, mismatches };
  }

  const out = {
    harness: 'm20-q9-mcdiag-resample-measurement',
    manager: 'A',
    row: 'M20-Q9 per-tick full resample measurement',
    packet: 'mcdiag-resample-measurement',
    node: process.version,
    config: CONFIG,
    dataset: {
      rawBars: CONFIG.rawBars,
      rawStepMs: RAW_STEP_MS,
      epochUtc: new Date(EPOCH).toISOString(),
      deterministic: true,
    },
    counters: {
      primary: [
        '_mcDiag.replayTicks          (chart.js mcDiagUpdateChartDataWrapper + mcDiagUpdateChartDataFastWrapper)',
        '_mcDiag.fullResamples        (chart.js _resampleDataFull body — counts EVERY caller, including '
          + 'ChartDataPipeline.getResampledSeries\'s direct chart._resampleDataFull() call)',
        '_mcDiag.incrementalResamples (chart-data-pipeline.js getResampledSeries incremental branch success)',
      ],
      legacyLeftUntouched: '_mcDiag.resamples — still increments from both chart.js:mcDiagUpdateChartDataWrapper '
        + 'and chart.js:resampleData(full-array). Reported only to document why it cannot answer '
        + 'resamples-per-tick: 1/tick means ZERO full resamples, 2/tick means one full resample per tick, '
        + 'and pipeline-internal full resamples never reach it at all.',
    },
    incrementalBranchIsNotO1: {
      site: 'chart-data-pipeline.js _tryIncrementalResample',
      firstStatement: 'const out = prevResampled.slice();',
      meaning: 'the incremental branch copies the ENTIRE previous resampled series on every hit, '
        + 'so it is O(display bars), not O(1). "incremental fired" does NOT imply "cheap". '
        + 'Measured per cell as copiedBarsPerIncrementalHit.',
    },
    killSwitchPolarity: {
      switch: KS_Q9,
      helper: '_m20Q9PrefixSliceFixEnabled()',
      sourceOfTruth: 'chart v 1.4/chart/modules/replay-system.js',
      rule: `${KS_Q9} !== true  ⇒  fix ENABLED (prefix reuse + per-install resample-cache drop). `
        + `${KS_Q9} === true ⇒ fix DISABLED (legacy master.slice per install, no cache drop).`,
    },
    realProductCodePaths: [
      'ReplaySystem.prototype.updateChartData (production replay tick)',
      'ReplaySystem.prototype._installPlayheadPrefix',
      'ReplaySystem.prototype._m20Q9PrefixSliceFixEnabled',
      'ReplaySystem.prototype._m20Q9DropConsumerResampleCache',
      'ChartDataPipeline.prototype.getResampledSeries',
      'ChartDataPipeline.prototype._tryIncrementalResample',
      'ChartDataPipeline.prototype.invalidateResampleCache',
      'Chart.prototype.resampleData',
      'Chart.prototype._resampleDataFull',
      'Chart.prototype._prepareBarsForResampling',
      'Chart.prototype._mcDiagIsFullArrayResample',
      'Chart.prototype._mcDiagWrapReplaySystem',
      'Chart.prototype._ensureMcDiag',
      'Chart.prototype._trimLastDataBarToReplayPlayhead',
      'Chart.prototype.bumpDataVersion',
    ],
    stubbed: {
      replayInstanceMethods: STUBBED_REPLAY_METHODS,
      chartInstanceMethods: STUBBED_CHART_METHODS,
      playheadAdvance: 'currentIndex += 1 per tick (not _advanceReplayPlayheadOneStep)',
      dom: 'node:vm stub DOM; no canvas, no rAF-driven scheduler, no panels',
    },
    runs,
    determinism,
    verdictCell: runs[0],
  };

  // Console report
  const first = runs[0];
  const pad = (s, n) => String(s).padEnd(n);
  process.stdout.write(`\nM20-Q9 per-tick resample measurement — ticks=${CONFIG.ticks} `
    + `rawBars=${CONFIG.rawBars} startIndex=${CONFIG.startIndex} repeats=${CONFIG.repeats}\n\n`);
  const W = 52;
  process.stdout.write('SEPARATED PRODUCT COUNTERS (primary)\n');
  process.stdout.write(`${pad('CELL', W)}${pad('replayTicks', 13)}${pad('fullResamples', 15)}`
    + `${pad('incrResamples', 15)}${pad('full/tick', 11)}${pad('incr/tick', 11)}${pad('agree?', 8)}\n`);
  for (const id of Object.keys(first)) {
    const c = first[id];
    process.stdout.write(`${pad(id, W)}${pad(c.product_replayTicks, 13)}${pad(c.product_fullResamples, 15)}`
      + `${pad(c.product_incrementalResamples, 15)}${pad(c.product_fullResamplesPerTick, 11)}`
      + `${pad(c.product_incrementalPerTick, 11)}${pad(c.instrumentsAgree ? 'yes' : 'NO', 8)}\n`);
  }

  process.stdout.write('\nLEGACY _mcDiag.resamples (reported only to show it is unusable)\n');
  for (const id of Object.keys(first)) {
    const c = first[id];
    process.stdout.write(`  ${pad(id, W)} delta=${pad(c.legacy_mcDiagResamplesDelta, 8)}`
      + ` per-tick=${pad(c.legacy_mcDiagResamplesPerTick, 8)} tickWrapper=${c.mcDiagWrapperInstalled}\n`);
  }

  process.stdout.write('\nALLOCATION SCALE per cell\n');
  for (const id of Object.keys(first)) {
    const c = first[id];
    process.stdout.write(`  ${pad(id, W)} outBars/fullResample=${pad(c.outputBarsPerFullResample, 9)}`
      + ` preparedObjs=${pad(c.preparedBarObjects, 10)}`
      + ` copiedBars/incrHit=${pad(c.copiedBarsPerIncrementalHit, 9)}`
      + ` rawDataIds=${pad(c.distinctRawDataIdentities, 6)}`
      + ` advisory ms/tick=${c.advisoryMsPerTick}\n`);
  }

  process.stdout.write('\nDETERMINISM across repeats\n');
  for (const [id, d] of Object.entries(determinism)) {
    process.stdout.write(`  ${pad(id, W)} ${d.identicalAcrossRepeats ? 'IDENTICAL' : `DIVERGED ${JSON.stringify(d.mismatches)}`}\n`);
  }

  if (CONFIG.jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(CONFIG.jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(CONFIG.jsonOut), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    process.stdout.write(`\nJSON → ${path.resolve(CONFIG.jsonOut)}\n`);
  }
  return out;
}

main();
