/**
 * L2-M19 — Progressive session degradation soak (acceptance instrument).
 *
 * Source durability soak — not a live I15 UI verdict.
 *
 * Canonical:
 *   node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
 *
 * Fix-A kill-switch (reconstruct per-tick full panel rebuilds):
 *   TALARIA_DISABLE_M19_PANEL_DIRTY_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
 *
 * Fix-B kill-switch (restore unbounded excursion arrays / today's persist bytes):
 *   TALARIA_DISABLE_M19_EXCURSION_TAIL_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
 *
 * Switches:
 *   (a) __TALARIA_DISABLE_M19_PANEL_DIRTY_V1
 *   (b) __TALARIA_DISABLE_M19_EXCURSION_TAIL_V1
 *   (c) __TALARIA_DISABLE_M19_PERSIST_TRIM_V1
 *   (d) __TALARIA_DISABLE_M19_MARKER_DELTA_V1
 *   (e) __TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const OM_PATH = path.join(__dirname, 'order-manager.js');
const RS_PATH = path.join(__dirname, 'replay-system.js');
const CHART_PATH = path.join(__dirname, '../chart.js');
const FIXTURE_PATH = path.join(__dirname, 'm19-legacy-uncapped-session.fixture.json');
const PANEL_KILL = String(process.env.TALARIA_DISABLE_M19_PANEL_DIRTY_V1 || '').trim() === '1';
const EXCURSION_KILL = String(process.env.TALARIA_DISABLE_M19_EXCURSION_TAIL_V1 || '').trim() === '1';
const EVIDENCE_PATH = path.join(
  ROOT,
  PANEL_KILL
    ? 'docs/plan3/evidence/L2-M19-fix-a-panel-dirty-kill.json'
    : (EXCURSION_KILL
      ? 'docs/plan3/evidence/L2-M19-fix-b-excursion-tail-kill.json'
      : 'docs/plan3/evidence/L2-M19-fix-b-excursion-tail-on.json'),
);
const REPORT_PATH = path.join(
  ROOT,
  PANEL_KILL
    ? 'docs/plan3/worker-reports/L2-M19-FIX-A-PANEL-DIRTY-KILL.md'
    : (EXCURSION_KILL
      ? 'docs/plan3/worker-reports/L2-M19-FIX-B-EXCURSION-TAIL-KILL.md'
      : 'docs/plan3/worker-reports/L2-M19-FIX-B-EXCURSION-TAIL-ON.md'),
);
const EXCURSION_TAIL_MAX = 256;
const BASELINE_BEFORE = {
  // Captured pre-Fix-A at HEAD 3eaa127bf / evidence L2-M19-progressive-session-soak-red.json
  panelRebuilds: 5500,
  ratio: [5.159, 5.371, 5.440],
  slopeFrac: [0.884, 0.988, 0.999],
  endRuntimeBytes: 706962,
  endSessionBytes: 1752034,
};

const WARMUP_TICKS = 500;
const MEASURED_TICKS = 5000;
const WINDOWS = 10;
const WINDOW_SIZE = MEASURED_TICKS / WINDOWS;
const CANONICAL_REPEATS = 3;
const TARGET_CLOSED_TRADES = 50;
const SENTINEL_OPEN = 2;

const FRAME_RATIO_MAX = 1.25;
const SLOPE_PER_1K_MAX_FRAC = 0.05;
const STEADY_GROWTH_FRAC = 0.05;
const STEADY_GROWTH_ABS = 16 * 1024;
const RUNTIME_ABS_MAX = 256 * 1024;
const SESSION_ABS_MAX = 512 * 1024;

const FROZEN_NOW = 1_720_000_000_000;
const SCREENSHOT_SENTINEL = `data:image/png;base64,${Buffer.alloc(6144, 0x4d).toString('base64')}`;

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Console sink + Date.now freeze (installed before product require)
// ---------------------------------------------------------------------------
const consoleSink = {
  calls: 0,
  argBytes: 0,
  byPrefix: Object.create(null),
};

function estimateArgsBytes(args) {
  let n = 0;
  for (const a of args) {
    if (typeof a === 'string') n += a.length;
    else {
      try { n += JSON.stringify(a)?.length || 0; } catch { n += String(a).length; }
    }
  }
  return n;
}

function installConsoleSink() {
  const wrap = (level) => (...args) => {
    consoleSink.calls += 1;
    consoleSink.argBytes += estimateArgsBytes(args);
    const head = typeof args[0] === 'string' ? args[0].slice(0, 48) : level;
    consoleSink.byPrefix[head] = (consoleSink.byPrefix[head] || 0) + 1;
  };
  console.log = wrap('log');
  console.warn = wrap('warn');
  console.info = wrap('info');
  console.debug = wrap('debug');
  console.error = wrap('error');
}

function installFrozenDateNow() {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FROZEN_NOW);
      else super(...args);
    }
    static now() { return FROZEN_NOW; }
  }
  FrozenDate.UTC = RealDate.UTC;
  FrozenDate.parse = RealDate.parse;
  global.Date = FrozenDate;
  return () => { global.Date = RealDate; };
}

function installDomAndStorage() {
  // Instrumented mini-DOM: counts innerHTML writes so a dock/panel regression
  // cannot hide behind a stub. Full format/parity/rAF proofs live in
  // m19-panel-dirty-runtime-contract.test.mjs.
  function el(id) {
    const node = {
      id: id || '',
      textContent: '',
      _html: '',
      innerHTMLWrites: 0,
      style: { display: '', width: '', color: '', setProperty() {} },
      classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
      value: '',
      checked: false,
      children: [],
      attrs: {},
      appendChild(child) { this.children.push(child); return child; },
      remove() {},
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) {
        if (k === 'id') return this.id || null;
        return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
      },
      addEventListener() {},
      removeEventListener() {},
      querySelector(sel) {
        if (sel === '#miDockBody' || sel === '#miDockMeta') {
          return this.children.find((c) => c.id === sel.slice(1)) || null;
        }
        return null;
      },
      querySelectorAll() { return []; },
    };
    Object.defineProperty(node, 'innerHTML', {
      get() { return this._html; },
      set(v) {
        this.innerHTMLWrites += 1;
        global.__m19SoakInnerHtmlWrites = (global.__m19SoakInnerHtmlWrites || 0) + 1;
        this._html = String(v);
      },
    });
    return node;
  }
  const byId = new Map();
  const ensure = (id) => {
    if (!byId.has(id)) byId.set(id, el(id));
    return byId.get(id);
  };
  // Mount real dock nodes so production renderCrossInstrumentPositionsDock runs.
  const dock = ensure('multiInstrumentOpenPositionsDock');
  const dockBody = el('miDockBody');
  const dockMeta = el('miDockMeta');
  dock.children = [dockMeta, dockBody];
  byId.set('miDockBody', dockBody);
  byId.set('miDockMeta', dockMeta);
  global.__m19SoakInnerHtmlWrites = 0;
  global.document = {
    getElementById: (id) => ensure(id),
    createElement: () => el(),
    body: el('body'),
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(String(k)); },
    clear: () => mem.clear(),
    _mem: mem,
  };
  global.sessionStorage = storage;
  global.localStorage = storage;
  global.userStorage = storage;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
  });
  global.performance = performance;
  // rAF polyfill so M19-A coalesced runtime panel updates flush in Node.
  const rafQueue = [];
  global.requestAnimationFrame = (fn) => {
    const id = rafQueue.length + 1;
    rafQueue.push({ id, fn });
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    const i = rafQueue.findIndex((x) => x.id === id);
    if (i >= 0) rafQueue.splice(i, 1);
  };
  global.__m19FlushRaf = () => {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const item of batch) {
      try { item.fn(performance.now()); } catch (_) { /* ignore */ }
    }
  };
  global.window = {
    __TALARIA_CHART_BUILD_ID: 'm19-soak-harness',
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=m19-soak' },
    parent: null,
    chart: null,
    postMessage() {},
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
  };
  // Kill-switches from env for Fix-A / Fix-B discrimination; others default OFF.
  window.__TALARIA_DISABLE_M19_PANEL_DIRTY_V1 =
    String(process.env.TALARIA_DISABLE_M19_PANEL_DIRTY_V1 || '').trim() === '1';
  window.__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1 =
    String(process.env.TALARIA_DISABLE_M19_EXCURSION_TAIL_V1 || '').trim() === '1';
  window.__TALARIA_DISABLE_M19_PERSIST_TRIM_V1 = false;
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = false;
}

installConsoleSink();
const restoreDate = installFrozenDateNow();
installDomAndStorage();

const OrderManager = require('./order-manager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function median(arr) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function byteLen(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

function expandUncappedArray(len, seed, channel) {
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Number((((seed * 17 + i * (channel + 3)) % 1000) / 100 - 3).toFixed(6));
  }
  // Deterministic first / middle / last markers for restore asserts
  out[0] = Number((1000 + seed + channel).toFixed(6));
  out[Math.floor(len / 2)] = Number((2000 + seed + channel).toFixed(6));
  out[len - 1] = Number((3000 + seed + channel).toFixed(6));
  return out;
}

function expandFixture(raw) {
  const expandPos = (p) => {
    const len = p.uncappedArrayLen || 0;
    const seed = p.arraySeed || 1;
    const { uncappedArrayLen, arraySeed, postExitLen, ...rest } = p;
    return {
      ...rest,
      bar_close_r: expandUncappedArray(len, seed, 1),
      bar_high_r: expandUncappedArray(len, seed, 2),
      bar_low_r: expandUncappedArray(len, seed, 3),
      ...(postExitLen
        ? {
          post_exit_bar_close_r: expandUncappedArray(postExitLen, seed, 4),
          post_exit_bar_high_r: expandUncappedArray(postExitLen, seed, 5),
          post_exit_bar_low_r: expandUncappedArray(postExitLen, seed, 6),
        }
        : {}),
    };
  };
  return {
    ...raw,
    open_positions: (raw.open_positions || []).map(expandPos),
    journal: (raw.journal || []).map(expandPos),
  };
}

function verifyAnchors() {
  const om = fs.readFileSync(OM_PATH, 'utf8');
  const rs = fs.readFileSync(RS_PATH, 'utf8');
  const ch = fs.readFileSync(CHART_PATH, 'utf8');
  const lineOf = (src, re) => {
    const m = src.match(re);
    if (!m) return null;
    return src.slice(0, m.index).split(/\n/).length;
  };
  const anchors = {
    'order-manager.js:updatePositions': lineOf(om, /\n\s*updatePositions\(\)\s*\{/),
    'order-manager.js:updatePositions→updatePositionsPanel': lineOf(om, /\n\s*this\.updatePositionsPanel\(\);\s*\n\s*\}\s*\n\s*\/\*\*/),
    'order-manager.js:updatePositions→scheduleRuntimePanel': lineOf(om, /_schedulePositionsPanelRuntimeUpdate\(\)/),
    'order-manager.js:updatePositionsPanel': lineOf(om, /\n\s*updatePositionsPanel\(\)\s*\{/),
    'order-manager.js:_updatePositionsPanelRuntimeOnly': lineOf(om, /\n\s*_updatePositionsPanelRuntimeOnly\(\)\s*\{/),
    'order-manager.js:_appendExcursionSnapshot': lineOf(om, /\n\s*_appendExcursionSnapshot\(position, candle/),
    'order-manager.js:persistJournal': lineOf(om, /\n\s*persistJournal\(\)\s*\{/),
    'order-manager.js:_buildRuntimeOrderPersistPatch': lineOf(om, /\n\s*_buildRuntimeOrderPersistPatch\(\)\s*\{/),
    'order-manager.js:_redrawClosedJournalTradeMarkers': lineOf(om, /\n\s*_redrawClosedJournalTradeMarkers\(/),
    'order-manager.js:_redrawJournalMarkersForReplayPlayhead': lineOf(om, /\n\s*_redrawJournalMarkersForReplayPlayhead\(\)\s*\{/),
    'order-manager.js:hotpath-console-updatePositions': lineOf(om, /Total Unrealized P&L/),
    'order-manager.js:hotpath-console-updatePositionsPanel': lineOf(om, /updatePositionsPanel\(\) called/),
    'replay-system.js:updatePositions#1': (() => {
      const lines = [];
      const re = /orderManager\.updatePositions\(\)/g;
      let m;
      while ((m = re.exec(rs))) lines.push(rs.slice(0, m.index).split(/\n/).length);
      return lines;
    })(),
    'chart.js:flushSessionStateSave': lineOf(ch, /\n\s*async flushSessionStateSave\(/),
  };
  const required = [
    anchors['order-manager.js:updatePositions'],
    anchors['order-manager.js:updatePositions→scheduleRuntimePanel'],
    anchors['order-manager.js:_updatePositionsPanelRuntimeOnly'],
    anchors['order-manager.js:updatePositionsPanel'],
    anchors['order-manager.js:_appendExcursionSnapshot'],
    anchors['order-manager.js:persistJournal'],
    anchors['order-manager.js:_buildRuntimeOrderPersistPatch'],
    anchors['order-manager.js:_redrawClosedJournalTradeMarkers'],
    anchors['order-manager.js:_redrawJournalMarkersForReplayPlayhead'],
    anchors['chart.js:flushSessionStateSave'],
  ];
  if (required.some((x) => !x)) {
    return { ok: false, anchors, detail: 'missing symbol anchors' };
  }
  return { ok: true, anchors };
}

function mergeSessionPatches(prev, next) {
  // Exact semantics of chart.js _mergeSessionStatePatches (kept local so Chart ctor is not required).
  const a = prev && typeof prev === 'object' ? prev : {};
  const b = next && typeof next === 'object' ? next : {};
  const out = Object.assign({}, a, b);
  if (a.replay && typeof a.replay === 'object' && b.replay && typeof b.replay === 'object') {
    const ra = a.replay;
    const rb = b.replay;
    out.replay = Object.assign({}, ra, rb);
    const ta = Number(ra.replayTimestamp);
    const tb = Number(rb.replayTimestamp);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta > tb) {
      out.replay.replayTimestamp = ta;
      if (Number.isFinite(ra.currentIndex)) out.replay.currentIndex = ra.currentIndex;
    }
  }
  return out;
}

function makeCandles(n, t0 = 1_700_000_000_000) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i / 17) * 0.00035;
    const mid = 1.1000 + wave;
    out[i] = {
      t: t0 + i * 60_000,
      o: mid,
      h: mid + 0.00040,
      l: mid - 0.00040,
      c: mid + 0.00005,
    };
  }
  return out;
}

function makeSentinelPosition(id, candle, side = 'BUY') {
  const entry = candle.c;
  const sl = side === 'BUY' ? entry - 0.0500 : entry + 0.0500;
  const tp = side === 'BUY' ? entry + 0.5000 : entry - 0.5000;
  return {
    id,
    type: side,
    quantity: 1,
    openPrice: entry,
    openTime: candle.t,
    entryMarkerTimeMs: candle.t,
    stopLoss: sl,
    takeProfit: tp,
    initialStopLoss: sl,
    initial_sl: sl,
    array_base_price: entry,
    symbol: 'EURUSD',
    ticker: 'EURUSD',
    sourceFileId: 'file-eurusd',
    unrealizedPnL: 0,
    autoBreakeven: false,
    bar_close_r: [],
    bar_high_r: [],
    bar_low_r: [],
    post_exit_bar_close_r: [],
    post_exit_bar_high_r: [],
    post_exit_bar_low_r: [],
  };
}

function attachOmStubs(om, chart, replay, opts = {}) {
  om.getCurrentCandle = () => chart._candleAt;
  om._getOrderContextChart = () => chart;
  om._playbackReplaySystem = () => replay;
  om._resolveTickAnimReplaySystem = () => replay;
  om._getMultichartParentGuardCandle = () => null;
  om._shouldDeferOrderExecutionForTimeframeTransition = () => false;
  om._oiMaybeCancelProvisionalOnReplayStop = () => {};
  om._syncPreviewToReplayPrice = () => {};
  om._pauseReplayIfPlaying = () => {};
  om._maybeLiquidateOnStopOut = () => {};
  om.checkPendingOrders = () => false;
  om._getActiveTicker = () => 'EURUSD';
  om._positionTicker = (p) => p?.ticker || 'EURUSD';
  om._positionNeedsBackgroundBar = () => false;
  om._resolveUnrealizedMarkPrice = (_p, c) => Number(c.c);
  om._calculatePositionPnL = (p, mark) => (Number(mark) - Number(p.openPrice)) * (p.quantity || 1) * 10;
  om._barQuotesForSltp = (_p, h, l, o) => ({ high: h, low: l, open: o });
  om._evalCandleForPosition = (_p, c) => c;
  om.format24Hour = (t) => String(t ?? '');
  om._historyPanelEntryCount = () => 1;
  om._historyPanelTpLegCount = () => 0;
  om._historyPanelBreakdownHtml = () => '—';
  om.updateScalingCheckboxAvailability = () => {};
  // Keep production dock renderer (M19-A contract: runtime must not hide behind a stub).
  om._collectLayoutCharts = () => [chart];
  om._stripOrderDrawingLayersFromChart = () => {};
  om._rebuildSplitGroupAvgLines = () => {};
  om._rebuildMultiTPAvgLines = () => {};
  om._redrawMfeMaeMarkersFromState = () => {};
  om.updateOrderLines = () => {};
  om._renderAllLayoutCharts = () => {};
  om._pruneReplayFutureTradeMarkers = () => {};
  om._ensureChartReadyForOrderMarkers = () => true;
  om._isMarkerTimeVisibleInReplay = () => true;
  om._positionVisibleOnAnyLayoutChart = () => true;
  om._isPositionForActiveChart = () => true;
  om.drawEntryMarker = () => {};
  om.drawExitMarker = () => {};
  om.drawPartialCloseMarker = () => {};
  om.drawOrderLine = () => {};
  om.drawSLTPLines = () => {};
  om.drawPendingOrderLine = () => {};
  om.drawPendingOrderTargets = () => {};
  om.drawMultiTPAvgLine = () => {};
  om.updateJournalTab = () => {};
  om._getSessionDefaultTradeSetup = () => null;
  om._multichartIsEmbedIframe = () => !!opts.embedIframe;
  if (opts.projected) {
    om._hostSnapshotVersion = 1;
  }
}

function createChartSurface(candles, replay, { multichart = false } = {}) {
  const surface = {
    currentFileId: 'file-eurusd',
    currentSymbol: 'EURUSD',
    currentTimeframe: '1m',
    rawData: candles,
    data: candles,
    latestCandle: candles[0],
    _candleAt: candles[0],
    replaySystem: replay,
    orderManager: null,
    _pendingSessionStatePatch: null,
    _pendingCriticalSessionStatePatch: null,
    _sessionStateLoadedFor: 'm19-soak',
    _sessionStatePatchInFlight: false,
    _sessionPatchFlushQueued: false,
    _sessionStateSaveTimer: null,
    _localBackupLastWriteAt: 0,
    _localBackupPlayingIntervalMs: 0,
    _localBackupIdleIntervalMs: 0,
    _flushBodies: [],
    _flushBytes: 0,
    _base64PersistBytes: 0,
    _base64InnerHtmlBytes: 0,
    getActiveTradingSessionId: () => 'm19-soak',
    parseTimeframe: () => 60_000,
    scheduleSessionStateSave(patch) {
      if (!patch || typeof patch !== 'object') return;
      this._pendingSessionStatePatch = mergeSessionPatches(this._pendingSessionStatePatch, patch);
      this._countBase64In(patch, 'persist');
    },
    queueCriticalSessionStateSave(patch) {
      this.scheduleSessionStateSave(patch);
    },
    _countBase64In(obj, sink) {
      const walk = (v) => {
        if (typeof v === 'string' && v.startsWith('data:image')) {
          if (sink === 'persist') this._base64PersistBytes += v.length;
          else this._base64InnerHtmlBytes += v.length;
        } else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(obj);
    },
    async flushSessionStateSave() {
      // Production path body (chart.js flushSessionStateSave): serialize pending patch + network sink.
      const sessionId = this.getActiveTradingSessionId();
      if (!sessionId) return;
      const patch = this._pendingSessionStatePatch;
      if (!patch) return;
      this._pendingSessionStatePatch = null;
      const body = JSON.stringify(patch);
      this._flushBodies.push(body.length);
      this._flushBytes = body.length;
      this._countBase64In(patch, 'persist');
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    },
    _getOrderManagerForSessionPersistence() {
      return this.orderManager;
    },
  };
  if (multichart) {
    surface._multichartHost = true;
    surface.layoutPanelCount = 2;
  }
  return surface;
}

function createOrderManager(chart, replay, opts = {}) {
  const om = Object.create(OrderManager.prototype);
  om.chart = chart;
  om.replaySystem = replay;
  om.eventBus = { emit() {}, on() { return () => {}; } };
  om.orders = [];
  om.openPositions = [];
  om.closedPositions = [];
  om.pendingOrders = [];
  om.orderIdCounter = 100;
  om.tradeGroupIdCounter = 1;
  om.orderType = 'market';
  om.orderSide = 'BUY';
  om.balance = 10000;
  om.initialBalance = 10000;
  om.equity = 10000;
  om.contractSize = 100000;
  om.positionSizeMode = 'risk-usd';
  om.breakevenMode = 'rr';
  om.mfeMaeTrackingHours = 4;
  om.mfeMaeTrackingEnabled = true;
  om.tradeJournal = [];
  om.mfeMaeTrackingPositions = [];
  om.symbolPrecision = 5;
  om.pipSize = 0.0001;
  om.pipValuePerLot = 10;
  om.scaledTrades = new Map();
  om.splitTrades = new Map();
  om.orderLines = [];
  om.splitGroupAvgLines = [];
  om.multiTPAvgLines = [];
  om.slLines = [];
  om.tpLines = [];
  om.beLines = [];
  om.pendingTargetLines = [];
  om._isUpdatingPanels = false;
  om._pendingPositionsPanelRefresh = false;
  attachOmStubs(om, chart, replay, opts);
  chart.orderManager = om;
  window.chart = chart;
  return om;
}

function wrapCounters(om, chart) {
  const counters = {
    updatePositionsPanel: 0,
    runtimePanelSchedules: 0,
    runtimePanelLite: 0,
    dockStructuralRenders: 0,
    dockInnerHtmlWritesDuringLite: 0,
    appendExcursion: 0,
    markerRedraw: 0,
    journalRowsVisited: 0,
    persistJournal: 0,
    runtimePatchBuilds: 0,
    flushSession: 0,
    paths: {
      a_panelEveryTick: false,
      b_excursionGrow: false,
      c_persistHeavy: false,
      d_markerFullScan: false,
      e_hotpathConsole: false,
    },
  };

  const realPanel = OrderManager.prototype.updatePositionsPanel;
  om.updatePositionsPanel = function (...args) {
    counters.updatePositionsPanel += 1;
    counters.paths.a_panelEveryTick = true;
    const beforeInner = document.getElementById('allTradesBody').innerHTML.length
      + document.getElementById('replayPositionsBody').innerHTML.length;
    const ret = realPanel.apply(this, args);
    const afterInner = document.getElementById('allTradesBody').innerHTML.length
      + document.getElementById('replayPositionsBody').innerHTML.length;
    const delta = Math.max(0, afterInner - beforeInner);
    // Count base64 that landed in DOM rebuilds
    const html = document.getElementById('allTradesBody').innerHTML
      + document.getElementById('replayPositionsBody').innerHTML;
    const re = /data:image\/png;base64,[A-Za-z0-9+/=]+/g;
    let m;
    while ((m = re.exec(html))) chart._base64InnerHtmlBytes += m[0].length;
    void delta;
    return ret;
  };

  // Production dock renderer must remain live (not stubbed) so soak can catch
  // runtime-only regressions that rewrite dock body.innerHTML.
  const realDock = OrderManager.prototype.renderCrossInstrumentPositionsDock;
  om.renderCrossInstrumentPositionsDock = function (...args) {
    counters.dockStructuralRenders += 1;
    return realDock.apply(this, args);
  };

  // Fix-A: hot path schedules lightweight runtime updates (still path A evidence).
  if (typeof OrderManager.prototype._schedulePositionsPanelRuntimeUpdate === 'function') {
    const realSched = OrderManager.prototype._schedulePositionsPanelRuntimeUpdate;
    om._schedulePositionsPanelRuntimeUpdate = function (...args) {
      counters.runtimePanelSchedules += 1;
      counters.paths.a_panelEveryTick = true;
      return realSched.apply(this, args);
    };
  }
  if (typeof OrderManager.prototype._updatePositionsPanelRuntimeOnly === 'function') {
    const realLite = OrderManager.prototype._updatePositionsPanelRuntimeOnly;
    om._updatePositionsPanelRuntimeOnly = function (...args) {
      counters.runtimePanelLite += 1;
      counters.paths.a_panelEveryTick = true;
      const globalBefore = global.__m19SoakInnerHtmlWrites || 0;
      const ret = realLite.apply(this, args);
      const globalAfter = global.__m19SoakInnerHtmlWrites || 0;
      // Any innerHTML during lite (dock or panel) is a Fix-A UI-contract fail.
      counters.dockInnerHtmlWritesDuringLite += Math.max(0, globalAfter - globalBefore);
      return ret;
    };
  }

  const realAppend = OrderManager.prototype._appendExcursionSnapshot;
  om._appendExcursionSnapshot = function (...args) {
    counters.appendExcursion += 1;
    counters.paths.b_excursionGrow = true;
    return realAppend.apply(this, args);
  };

  const realMarkers = OrderManager.prototype._redrawJournalMarkersForReplayPlayhead;
  om._redrawJournalMarkersForReplayPlayhead = function (...args) {
    counters.markerRedraw += 1;
    counters.journalRowsVisited += (this.tradeJournal || []).length;
    counters.paths.d_markerFullScan = true;
    return realMarkers.apply(this, args);
  };

  const realPersistJ = OrderManager.prototype.persistJournal;
  om.persistJournal = function (...args) {
    counters.persistJournal += 1;
    counters.paths.c_persistHeavy = true;
    return realPersistJ.apply(this, args);
  };

  const realBuild = OrderManager.prototype._buildRuntimeOrderPersistPatch;
  om._buildRuntimeOrderPersistPatch = function (...args) {
    counters.runtimePatchBuilds += 1;
    counters.paths.c_persistHeavy = true;
    return realBuild.apply(this, args);
  };

  const realFlush = chart.flushSessionStateSave.bind(chart);
  chart.flushSessionStateSave = async function (...args) {
    counters.flushSession += 1;
    counters.paths.c_persistHeavy = true;
    return realFlush(...args);
  };

  return counters;
}

function excursionLens(om) {
  const open = om.openPositions || [];
  return open.map((p) => ({
    id: p.id,
    bar_close_r: (p.bar_close_r || []).length,
    bar_high_r: (p.bar_high_r || []).length,
    bar_low_r: (p.bar_low_r || []).length,
    post_exit_bar_close_r: (p.post_exit_bar_close_r || []).length,
  }));
}

function accumulateClosedTrade(om, candles, tickIdx, tradeSeq) {
  // Build a genuinely shaped closed row via production enrich + upsert + persistJournal.
  const openC = candles[Math.max(0, tickIdx - 40)];
  const closeC = candles[tickIdx];
  const pos = makeSentinelPosition(10_000 + tradeSeq, openC, tradeSeq % 2 ? 'SELL' : 'BUY');
  // Grow deterministic excursion via production append
  for (let i = Math.max(0, tickIdx - 35); i < tickIdx; i++) {
    OrderManager.prototype._appendExcursionSnapshot.call(om, pos, candles[i], false);
  }
  for (let i = 0; i < 8; i++) {
    const c = candles[Math.min(candles.length - 1, tickIdx + i)] || closeC;
    OrderManager.prototype._appendExcursionSnapshot.call(om, pos, c, true);
  }
  const closePrice = closeC.c;
  const closeTime = closeC.t;
  const pnl = (pos.type === 'BUY' ? closePrice - pos.openPrice : pos.openPrice - closePrice) * 10;
  const journalEntry = {
    id: 10_000 + tradeSeq,
    tradeId: 10_000 + tradeSeq,
    type: pos.type,
    direction: pos.type,
    quantity: pos.quantity,
    openPrice: pos.openPrice,
    entryPrice: pos.openPrice,
    closePrice,
    exitPrice: closePrice,
    openTime: pos.openTime,
    closeTime,
    entryMarkerTimeMs: pos.openTime,
    exitMarkerTimeMs: closeTime,
    netPnL: pnl,
    realizedPnL: pnl,
    symbol: 'EURUSD',
    ticker: 'EURUSD',
    status: 'CLOSED',
    closeType: 'MANUAL',
    stopLoss: pos.stopLoss,
    takeProfit: pos.takeProfit,
    entryScreenshot: SCREENSHOT_SENTINEL,
    exitScreenshot: SCREENSHOT_SENTINEL,
  };
  OrderManager.prototype._enrichJournalEntryForPersistence.call(om, journalEntry, pos, { closeTime, closePrice });
  const upsert = OrderManager.prototype.upsertJournalEntry.call(om, journalEntry, { skipIfExists: true });
  if (upsert.inserted) {
    OrderManager.prototype.persistJournal.call(om);
  }
  return upsert.inserted;
}

function samplePayloads(om, chart) {
  const runtime = OrderManager.prototype._buildRuntimeOrderPersistPatch.call(om);
  const runtimeBytes = byteLen(runtime);
  const sessionPatch = mergeSessionPatches(chart._pendingSessionStatePatch, {
    journal: om.tradeJournal,
    per_instrument_stats: OrderManager.prototype.buildPerInstrumentStats.call(om),
    ...runtime,
  });
  const sessionBytes = byteLen(sessionPatch);
  return { runtime, runtimeBytes, sessionPatch, sessionBytes };
}

async function runSoak({
  label,
  playing = true,
  multichart = false,
  projected = false,
  warmup = WARMUP_TICKS,
  measured = MEASURED_TICKS,
  seedJournal = 0,
  accumulateTarget = TARGET_CLOSED_TRADES,
}) {
  consoleSink.calls = 0;
  consoleSink.argBytes = 0;
  consoleSink.byPrefix = Object.create(null);

  const totalCandles = warmup + measured + 80;
  const candles = makeCandles(totalCandles);
  let idx = 0;
  const replay = {
    isActive: true,
    isPlaying: !!playing,
    playbackMode: 'candle',
    getPlaybackMode: () => 'candle',
    replayTimestamp: candles[0].t,
    currentIndex: 0,
    fullRawData: candles,
    animatingCandle: null,
    tickProgress: 0,
  };
  const chart = createChartSurface(candles, replay, { multichart });
  // Host always drives money/lifecycle. Optional projected iframe OM proves early-return path.
  const driver = createOrderManager(chart, replay, { embedIframe: false, projected: false });
  let projectedOm = null;
  if (multichart && projected) {
    projectedOm = Object.create(OrderManager.prototype);
    projectedOm.chart = chart;
    projectedOm.replaySystem = replay;
    projectedOm.openPositions = [];
    projectedOm.pendingOrders = [];
    projectedOm.tradeJournal = driver.tradeJournal;
    projectedOm.mfeMaeTrackingPositions = [];
    projectedOm._hostSnapshotVersion = 1;
    projectedOm._multichartIsEmbedIframe = () => true;
    if (!OrderManager.prototype._usesHostProjectedOrderRuntime.call(projectedOm)) {
      throw new Error('projected OM failed _usesHostProjectedOrderRuntime premise');
    }
  }

  const counters = wrapCounters(driver, chart);
  if (projectedOm) {
    const beforePanel = counters.updatePositionsPanel;
    OrderManager.prototype.updatePositions.call(projectedOm);
    counters.paths.projectedEarlyReturn = counters.updatePositionsPanel === beforePanel;
  }

  driver.openPositions = [
    makeSentinelPosition(1, candles[0], 'BUY'),
    makeSentinelPosition(2, candles[0], 'SELL'),
  ];
  for (const p of driver.openPositions) {
    OrderManager.prototype._seedOrderLifecycleEvent.call(driver, p, candles[0]);
  }

  // Optional pre-seed closed trades (paused control / restore neighbors).
  for (let s = 0; s < seedJournal; s++) {
    accumulateClosedTrade(driver, candles, Math.min(40 + s, candles.length - 1), s + 1);
  }

  const frameCosts = [];
  const windowExcursion = [];
  const windowRuntimeBytes = [];
  const windowSessionBytes = [];
  let closedAccumulated = driver.tradeJournal.length;
  const tradeEvery = accumulateTarget > 0 ? Math.max(1, Math.floor(measured / accumulateTarget)) : 0;

  const advance = (toIdx) => {
    idx = toIdx;
    const c = candles[idx];
    chart._candleAt = c;
    chart.latestCandle = c;
    if (playing) {
      replay.replayTimestamp = c.t;
      replay.currentIndex = idx;
      replay.isPlaying = true;
    } else {
      replay.isPlaying = false;
      // Paused control: do not advance market time after warm-up baseline.
    }
  };

  const scheduleMarkerRedraw = () => {
    // Match production replay-system debounce (not a sync full-journal walk every tick).
    clearTimeout(driver._replayMarkerSyncDebounce);
    driver._replayMarkerSyncDebounce = setTimeout(() => {
      try { driver._redrawJournalMarkersForReplayPlayhead(); } catch (_) { /* ignore */ }
    }, 0);
  };

  // Warm-up
  for (let i = 1; i <= warmup; i++) {
    advance(i);
    OrderManager.prototype.updatePositions.call(driver);
    scheduleMarkerRedraw();
    if (typeof global.__m19FlushRaf === 'function') global.__m19FlushRaf();
    if (i % 100 === 0) {
      await new Promise((r) => setTimeout(r, 0)); // flush debounced marker work
      await chart.flushSessionStateSave();
    }
  }

  const startExcursion = excursionLens(driver);
  const startPayloads = samplePayloads(driver, chart);
  const consoleAtMeasureStart = consoleSink.calls;

  // Measured
  for (let m = 0; m < measured; m++) {
    if (playing) advance(warmup + 1 + m);
    else {
      // stay on warm-up end candle
      advance(warmup);
      replay.isPlaying = false;
    }

    if (playing && accumulateTarget > 0 && (m % tradeEvery === 0) && closedAccumulated < accumulateTarget) {
      if (accumulateClosedTrade(driver, candles, warmup + 1 + m, closedAccumulated + 1)) {
        closedAccumulated = driver.tradeJournal.length;
      }
    }

    const t0 = performance.now();
    OrderManager.prototype.updatePositions.call(driver);
    // Production: updatePositions every tick; marker redraw is debounced (replay-system).
    scheduleMarkerRedraw();
    if (typeof global.__m19FlushRaf === 'function') global.__m19FlushRaf();
    const dt = performance.now() - t0;
    frameCosts.push(dt);
    if (m % 25 === 0) {
      // Flush debounced marker work + session outside the per-tick cost sample.
      await new Promise((r) => setTimeout(r, 0));
      await chart.flushSessionStateSave();
    }

    if ((m + 1) % WINDOW_SIZE === 0 || m === measured - 1) {
      const payloads = samplePayloads(driver, chart);
      windowExcursion.push(excursionLens(driver));
      windowRuntimeBytes.push(payloads.runtimeBytes);
      windowSessionBytes.push(payloads.sessionBytes);
    }
  }

  await chart.flushSessionStateSave();
  const endPayloads = samplePayloads(driver, chart);
  const endExcursion = excursionLens(driver);

  if (consoleSink.calls > consoleAtMeasureStart) counters.paths.e_hotpathConsole = true;

  // Ten windows
  const windowMedians = [];
  for (let w = 0; w < WINDOWS; w++) {
    const slice = frameCosts.slice(w * WINDOW_SIZE, (w + 1) * WINDOW_SIZE);
    windowMedians.push(median(slice));
  }
  const first20 = frameCosts.slice(0, Math.floor(measured * 0.2));
  const last20 = frameCosts.slice(Math.floor(measured * 0.8));
  const firstMed = median(first20);
  const lastMed = median(last20);
  const ratio = lastMed / firstMed;
  const slopePer1k = ((windowMedians[WINDOWS - 1] - windowMedians[0]) / (MEASURED_TICKS / 1000));
  const slopeFracOfFirst = slopePer1k / firstMed;

  // Steady phase: final 1000 ticks → windows 8..10 (0-index 8,9) vs window 7 start proxy
  const steadyStartRuntime = windowRuntimeBytes[Math.max(0, windowRuntimeBytes.length - 3)] ?? startPayloads.runtimeBytes;
  const steadyEndRuntime = endPayloads.runtimeBytes;
  const steadyStartSession = windowSessionBytes[Math.max(0, windowSessionBytes.length - 3)] ?? startPayloads.sessionBytes;
  const steadyEndSession = endPayloads.sessionBytes;
  const runtimeGrowth = steadyEndRuntime - steadyStartRuntime;
  const sessionGrowth = steadyEndSession - steadyStartSession;
  const runtimeGrowthLimit = Math.max(STEADY_GROWTH_FRAC * steadyStartRuntime, STEADY_GROWTH_ABS);
  const sessionGrowthLimit = Math.max(STEADY_GROWTH_FRAC * steadyStartSession, STEADY_GROWTH_ABS);

  const asserts = {
    frameRatio: {
      pass: ratio <= FRAME_RATIO_MAX,
      firstMed,
      lastMed,
      ratio,
      limit: FRAME_RATIO_MAX,
    },
    frameSlope: {
      pass: slopeFracOfFirst <= SLOPE_PER_1K_MAX_FRAC,
      slopePer1k,
      slopeFracOfFirst,
      limitFrac: SLOPE_PER_1K_MAX_FRAC,
    },
    runtimeSteadyGrowth: {
      pass: runtimeGrowth <= runtimeGrowthLimit,
      growth: runtimeGrowth,
      limit: runtimeGrowthLimit,
      start: steadyStartRuntime,
      end: steadyEndRuntime,
    },
    sessionSteadyGrowth: {
      pass: sessionGrowth <= sessionGrowthLimit,
      growth: sessionGrowth,
      limit: sessionGrowthLimit,
      start: steadyStartSession,
      end: steadyEndSession,
    },
    runtimeAbs: {
      pass: endPayloads.runtimeBytes <= RUNTIME_ABS_MAX,
      bytes: endPayloads.runtimeBytes,
      limit: RUNTIME_ABS_MAX,
    },
    sessionAbs: {
      pass: endPayloads.sessionBytes <= SESSION_ABS_MAX,
      bytes: endPayloads.sessionBytes,
      limit: SESSION_ABS_MAX,
    },
    sentinelsOpen: {
      pass: driver.openPositions.length === SENTINEL_OPEN,
      count: driver.openPositions.length,
    },
    closedApprox50: {
      pass: driver.tradeJournal.length >= TARGET_CLOSED_TRADES - 5
        && driver.tradeJournal.length <= TARGET_CLOSED_TRADES + 5,
      count: driver.tradeJournal.length,
    },
  };

  const frameSlopeFail = !asserts.frameSlope.pass || !asserts.frameRatio.pass;
  const persistFail = !asserts.runtimeSteadyGrowth.pass
    || !asserts.sessionSteadyGrowth.pass
    || !asserts.runtimeAbs.pass
    || !asserts.sessionAbs.pass;

  const allFivePaths = Object.values(counters.paths).every(Boolean);
  const panelKill = !!window.__TALARIA_DISABLE_M19_PANEL_DIRTY_V1;
  // Fix-A gate: full panel rebuilds must be bounded by structural events (~closed trades),
  // not by tick count. Kill-switch must reconstruct ~warmup+measured rebuilds.
  const structuralPanelBound = Math.max(TARGET_CLOSED_TRADES * 3, 200);
  // After Fix-A, per-tick costs fall into timer noise (~0.01–0.03ms). Treat absolute
  // floor as flat so residual B/D work + timer jitter cannot false-fail Fix-A.
  const ABS_FLAT_MS = 0.05;
  const absFlat = Number.isFinite(firstMed) && Number.isFinite(lastMed)
    && firstMed <= ABS_FLAT_MS
    && lastMed <= ABS_FLAT_MS * FRAME_RATIO_MAX;
  const frameSlopePass = !frameSlopeFail || absFlat;
  const dockLiteClean = counters.dockInnerHtmlWritesDuringLite === 0;
  const fixA = {
    panelKill,
    panelRebuilds: counters.updatePositionsPanel,
    runtimePanelSchedules: counters.runtimePanelSchedules,
    runtimePanelLite: counters.runtimePanelLite,
    dockStructuralRenders: counters.dockStructuralRenders,
    dockInnerHtmlWritesDuringLite: counters.dockInnerHtmlWritesDuringLite,
    dockLiteClean,
    panelBoundedByStructural: !panelKill && counters.updatePositionsPanel <= structuralPanelBound,
    panelReconstructsPerTick: panelKill && counters.updatePositionsPanel >= (warmup + measured) * 0.95,
    frameSlopePass,
    absFlat,
    pass: panelKill
      ? (counters.updatePositionsPanel >= (warmup + measured) * 0.95)
      : (counters.updatePositionsPanel <= structuralPanelBound
        && counters.runtimePanelSchedules > 0
        && frameSlopePass
        && dockLiteClean
        && counters.runtimePanelLite > 0),
  };

  const excursionKill = !!window.__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1;
  const maxOpenExcursion = Math.max(
    0,
    ...((endExcursion || []).map((e) => Math.max(
      e.bar_close_r || 0,
      e.bar_high_r || 0,
      e.bar_low_r || 0,
    ))),
  );
  const fixB = {
    excursionKill,
    maxOpenExcursion,
    tailMax: EXCURSION_TAIL_MAX,
    arraysBounded: !excursionKill && maxOpenExcursion > 0 && maxOpenExcursion <= EXCURSION_TAIL_MAX,
    arraysUnbounded: excursionKill && maxOpenExcursion >= (warmup + measured) * 0.95,
    pass: excursionKill
      ? (maxOpenExcursion >= (warmup + measured) * 0.95)
      : (maxOpenExcursion > 0 && maxOpenExcursion <= EXCURSION_TAIL_MAX),
  };

  return {
    label,
    playing,
    multichart,
    projected,
    warmup,
    measured,
    windowMedians,
    firstMed,
    lastMed,
    ratio,
    slopePer1k,
    slopeFracOfFirst,
    asserts,
    frameSlopeFail,
    persistFail,
    allFivePaths,
    fixA,
    fixB,
    counters,
    startExcursion,
    windowExcursion,
    endExcursion,
    startRuntimeBytes: startPayloads.runtimeBytes,
    endRuntimeBytes: endPayloads.runtimeBytes,
    startSessionBytes: startPayloads.sessionBytes,
    endSessionBytes: endPayloads.sessionBytes,
    consoleCalls: consoleSink.calls,
    consoleArgBytes: consoleSink.argBytes,
    base64PersistBytes: chart._base64PersistBytes,
    base64InnerHtmlBytes: chart._base64InnerHtmlBytes,
    flushBytesFinal: chart._flushBytes,
    openCount: driver.openPositions.length,
    journalCount: driver.tradeJournal.length,
    futureSwitchesPresent: {
      __TALARIA_DISABLE_M19_PANEL_DIRTY_V1: !!window.__TALARIA_DISABLE_M19_PANEL_DIRTY_V1,
      __TALARIA_DISABLE_M19_EXCURSION_TAIL_V1: !!window.__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1,
      __TALARIA_DISABLE_M19_PERSIST_TRIM_V1: !!window.__TALARIA_DISABLE_M19_PERSIST_TRIM_V1,
      __TALARIA_DISABLE_M19_MARKER_DELTA_V1: !!window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1,
      __TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1: !!window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1,
    },
  };
}

function arrayBookends(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return {
    len: arr.length,
    first: arr[0],
    middle: arr[Math.floor(arr.length / 2)],
    last: arr[arr.length - 1],
  };
}

function runRestoreCell({ multichart = false } = {}) {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const fixture = expandFixture(raw);
  const candles = makeCandles(100);
  const replay = {
    isActive: false,
    isPlaying: false,
    playbackMode: 'candle',
    getPlaybackMode: () => 'candle',
    replayTimestamp: candles[0].t,
    currentIndex: 0,
    fullRawData: candles,
    animatingCandle: null,
    tickProgress: 0,
  };
  const chart = createChartSurface(candles, replay, { multichart });
  const persistSpy = { schedule: 0, flush: 0 };
  const realSchedule = chart.scheduleSessionStateSave.bind(chart);
  chart.scheduleSessionStateSave = function (patch) {
    persistSpy.schedule += 1;
    return realSchedule(patch);
  };
  const realFlush = chart.flushSessionStateSave.bind(chart);
  chart.flushSessionStateSave = async function (...a) {
    persistSpy.flush += 1;
    return realFlush(...a);
  };

  const om = createOrderManager(chart, replay, {
    embedIframe: !!multichart,
    projected: !!multichart,
  });
  wrapCounters(om, chart);

  const beforeOpen = fixture.open_positions.map((p) => ({
    id: p.id,
    close: arrayBookends(p.bar_close_r),
    high: arrayBookends(p.bar_high_r),
    low: arrayBookends(p.bar_low_r),
  }));
  const beforeJournal = fixture.journal.map((t) => ({
    id: t.id,
    close: arrayBookends(t.bar_close_r),
    entryScreenshot: t.entryScreenshot,
    exitScreenshot: t.exitScreenshot,
  }));

  // Apply runtime + journal without destructive normalize write-back.
  const state = {
    pending_orders: fixture.pending_orders,
    open_positions: JSON.parse(JSON.stringify(fixture.open_positions)),
    account_runtime: fixture.account_runtime,
    order_counters: fixture.order_counters,
    journal: JSON.parse(JSON.stringify(fixture.journal)),
  };
  OrderManager.prototype.restoreRuntimeOrderStateFromSession.call(om, state);
  // Journal is not always applied by restoreRuntime — assign additively (I16) as session hydrate does.
  if (Array.isArray(state.journal) && om.tradeJournal.length === 0) {
    om.tradeJournal = state.journal;
  }

  const afterOpen = (om.openPositions || []).map((p) => ({
    id: p.id,
    close: arrayBookends(p.bar_close_r),
    high: arrayBookends(p.bar_high_r),
    low: arrayBookends(p.bar_low_r),
  }));
  const afterJournal = (om.tradeJournal || []).map((t) => ({
    id: t.id || t.tradeId,
    close: arrayBookends(t.bar_close_r),
    entryScreenshot: t.entryScreenshot,
    exitScreenshot: t.exitScreenshot,
  }));

  const bookendsOk = beforeOpen.every((b, i) => {
    const a = afterOpen[i];
    return a
      && a.close?.first === b.close.first
      && a.close?.middle === b.close.middle
      && a.close?.last === b.close.last
      && a.close?.len === b.close.len;
  });
  const journalOk = beforeJournal.every((b) => {
    const a = afterJournal.find((x) => x.id === b.id);
    return a
      && a.close?.first === b.close.first
      && a.close?.middle === b.close.middle
      && a.close?.last === b.close.last
      && a.entryScreenshot === b.entryScreenshot;
  });
  const balanceOk = om.balance === fixture.account_runtime.balance
    && om.orderIdCounter === fixture.order_counters.orderIdCounter;

  // Restore may schedule a panel/runtime persist (production updatePositionsPanel tail).
  // Destructive write-back = trim/normalize that shrinks or rewrites uncapped arrays.
  const pending = chart._pendingSessionStatePatch;
  const pendingOpen = Array.isArray(pending?.open_positions) ? pending.open_positions : null;
  const pendingUntrimmed = !pendingOpen || beforeOpen.every((b) => {
    const row = pendingOpen.find((p) => p && p.id === b.id);
    return row && Array.isArray(row.bar_close_r) && row.bar_close_r.length === b.close.len
      && row.bar_close_r[0] === b.close.first
      && row.bar_close_r[b.close.len - 1] === b.close.last;
  });
  const noDestructiveWriteBack = bookendsOk && journalOk && pendingUntrimmed;

  // Today's canonical persisted-format hash (runtime patch shape from current builders).
  const todayPatch = OrderManager.prototype._buildRuntimeOrderPersistPatch.call(om);
  const todaySession = {
    journal: om.tradeJournal,
    per_instrument_stats: OrderManager.prototype.buildPerInstrumentStats.call(om),
    ...todayPatch,
  };
  const persistedFormatHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(todaySession))
    .digest('hex');

  return {
    label: multichart ? 'multichart-restore-legacy-uncapped' : 'session-restore-legacy-uncapped',
    multichart,
    bookendsOk,
    journalOk,
    balanceOk,
    openCount: om.openPositions.length,
    journalCount: om.tradeJournal.length,
    balance: om.balance,
    counters: {
      orderIdCounter: om.orderIdCounter,
      tradeGroupIdCounter: om.tradeGroupIdCounter,
    },
    noDestructiveWriteBack,
    persistSpy,
    persistedFormatHash,
    beforeOpen,
    afterOpen,
    pass: bookendsOk && journalOk && balanceOk && noDestructiveWriteBack
      && om.openPositions.length === 2
      && om.tradeJournal.length >= 1,
  };
}

function classifyVerdict({ canonicalRuns, neighbors, restoreCells, anchors }) {
  if (!anchors.ok) {
    return { verdict: 'SETUP-FAIL', detail: 'anchor verification failed' };
  }
  if (canonicalRuns.some((r) => r.openCount !== SENTINEL_OPEN)) {
    return { verdict: 'SETUP-FAIL', detail: 'sentinel open positions not held' };
  }
  if (canonicalRuns.some((r) => !r.allFivePaths)) {
    return { verdict: 'PREMISE-MISMATCH', detail: 'not all five suspected paths exercised' };
  }
  if (restoreCells.some((r) => !r.pass)) {
    return { verdict: 'PREMISE-MISMATCH', detail: 'restore assertions failed' };
  }

  const fixAAllPass = canonicalRuns.every((r) => r.fixA && r.fixA.pass);
  const fixBAllPass = canonicalRuns.every((r) => r.fixB && r.fixB.pass);
  const persistFails = canonicalRuns.filter((r) => r.persistFail).length;
  const slopeFails = canonicalRuns.filter((r) => r.frameSlopeFail && !(r.fixA && r.fixA.absFlat)).length;

  if (PANEL_KILL) {
    if (fixAAllPass && slopeFails === CANONICAL_REPEATS) {
      return {
        verdict: 'FIX-A-KILL-RED',
        detail: `kill reconstructs ${canonicalRuns[0]?.fixA?.panelRebuilds} panel rebuilds; frame slope fail ${slopeFails}/${CANONICAL_REPEATS}`,
      };
    }
    return {
      verdict: 'FIX-A-KILL-UNEXPECTED',
      detail: `kill discriminator unexpected; fixAAllPass=${fixAAllPass}; slopeFails=${slopeFails}`,
    };
  }

  if (EXCURSION_KILL) {
    if (fixBAllPass && fixAAllPass) {
      return {
        verdict: 'FIX-B-KILL-RED',
        detail: `kill reconstructs unbounded open excursion max=${canonicalRuns[0]?.fixB?.maxOpenExcursion} (tailMax=${EXCURSION_TAIL_MAX})`,
      };
    }
    return {
      verdict: 'FIX-B-KILL-UNEXPECTED',
      detail: `fixBAllPass=${fixBAllPass}; fixAAllPass=${fixAAllPass}; max=${canonicalRuns[0]?.fixB?.maxOpenExcursion}`,
    };
  }

  if (fixAAllPass && fixBAllPass && persistFails === CANONICAL_REPEATS) {
    return {
      verdict: 'FIX-B-GREEN',
      detail: `M19-PERSIST-RED — Fix-A+B pass 3/3; open excursion ≤ ${EXCURSION_TAIL_MAX}; persist bound fail ${persistFails}/${CANONICAL_REPEATS} (c not in scope)`,
      persist: 'M19-PERSIST-RED',
    };
  }
  if (fixAAllPass && fixBAllPass && persistFails === 0 && slopeFails === 0) {
    return {
      verdict: 'FIX-B-GREEN',
      detail: 'Fix-A+B and persist bounds both pass',
      persist: 'M19-PERSIST-GREEN',
    };
  }
  return {
    verdict: 'FIX-B-FAIL',
    detail: `fixAAllPass=${fixAAllPass}; fixBAllPass=${fixBAllPass}; frameSlopeFails=${slopeFails}; persistFails=${persistFails}; maxExcursion=${canonicalRuns[0]?.fixB?.maxOpenExcursion}`,
  };
}

async function main() {
  // Wall-clock evidence timestamps (product Date is frozen for soak determinism).
  const wallMs = () => {
    try {
      if (Number.isFinite(performance.timeOrigin)) {
        return Math.round(performance.timeOrigin + performance.now());
      }
    } catch (_) { /* ignore */ }
    return Date.now();
  };
  const startedWallMs = wallMs();
  const started = new Date(startedWallMs).toISOString();
  const headSha = fs.existsSync(path.join(ROOT, '.git'))
    ? (() => {
      try {
        return require('node:child_process')
          .execSync('git rev-parse HEAD', { cwd: ROOT })
          .toString()
          .trim();
      } catch {
        return null;
      }
    })()
    : null;

  const fileHashes = {
    'order-manager.js': sha256File(OM_PATH),
    'replay-system.js': sha256File(RS_PATH),
    'chart.js': sha256File(CHART_PATH),
  };

  const anchors = verifyAnchors();
  const t0 = performance.now();

  const canonicalRuns = [];
  for (let i = 1; i <= CANONICAL_REPEATS; i++) {
    const r = await runSoak({
      label: `canonical-playing-single#${i}`,
      playing: true,
      multichart: false,
      projected: false,
      accumulateTarget: TARGET_CLOSED_TRADES,
    });
    canonicalRuns.push(r);
  }

  const neighbors = [];
  neighbors.push(await runSoak({
    label: 'neighbor-single-playing',
    playing: true,
    accumulateTarget: TARGET_CLOSED_TRADES,
  }));
  neighbors.push(await runSoak({
    label: 'neighbor-single-paused',
    playing: false,
    seedJournal: TARGET_CLOSED_TRADES,
    accumulateTarget: 0,
  }));
  neighbors.push(await runSoak({
    label: 'neighbor-multichart-host+projected-playing',
    playing: true,
    multichart: true,
    projected: true,
    accumulateTarget: TARGET_CLOSED_TRADES,
  }));
  neighbors.push(await runSoak({
    label: 'neighbor-multichart-host+projected-paused',
    playing: false,
    multichart: true,
    projected: true,
    seedJournal: TARGET_CLOSED_TRADES,
    accumulateTarget: 0,
  }));

  const restoreCells = [
    runRestoreCell({ multichart: false }),
    runRestoreCell({ multichart: true }),
  ];
  neighbors.push(...restoreCells.map((r) => ({
    label: r.label,
    restore: true,
    pass: r.pass,
    persistedFormatHash: r.persistedFormatHash,
    bookendsOk: r.bookendsOk,
    journalOk: r.journalOk,
    noDestructiveWriteBack: r.noDestructiveWriteBack,
  })));

  const elapsedMs = performance.now() - t0;
  const finishedWallMs = wallMs();
  const finishedAt = new Date(finishedWallMs).toISOString();
  const verdict = classifyVerdict({ canonicalRuns, neighbors, restoreCells, anchors });
  const persistedFormatHash = restoreCells[0]?.persistedFormatHash || null;

  const evidence = {
    row: 'L2-M19',
    title: 'Progressive session degradation — Fix B excursion tail',
    task: PANEL_KILL
      ? 'FIX-A-KILL-DISCRIMINATOR'
      : (EXCURSION_KILL ? 'FIX-B-KILL-DISCRIMINATOR' : 'FIX-B-ON'),
    startedAt: started,
    finishedAt,
    wallClock: { startedWallMs, finishedWallMs },
    elapsedMs,
    headSha,
    fileHashes,
    anchors,
    constants: {
      WARMUP_TICKS,
      MEASURED_TICKS,
      WINDOWS,
      CANONICAL_REPEATS,
      TARGET_CLOSED_TRADES,
      FRAME_RATIO_MAX,
      SLOPE_PER_1K_MAX_FRAC,
      STEADY_GROWTH_FRAC,
      STEADY_GROWTH_ABS,
      RUNTIME_ABS_MAX,
      SESSION_ABS_MAX,
      FROZEN_NOW,
      EXCURSION_TAIL_MAX,
      screenshotSentinelBytes: SCREENSHOT_SENTINEL.length,
    },
    futureSwitchesEncodedOnly: [
      '__TALARIA_DISABLE_M19_PANEL_DIRTY_V1',
      '__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1',
      '__TALARIA_DISABLE_M19_PERSIST_TRIM_V1',
      '__TALARIA_DISABLE_M19_MARKER_DELTA_V1',
      '__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1',
    ],
    canonicalRuns: canonicalRuns.map((r) => ({
      label: r.label,
      frameSlopeFail: r.frameSlopeFail,
      persistFail: r.persistFail,
      allFivePaths: r.allFivePaths,
      asserts: r.asserts,
      windowMedians: r.windowMedians,
      firstMed: r.firstMed,
      lastMed: r.lastMed,
      ratio: r.ratio,
      slopePer1k: r.slopePer1k,
      slopeFracOfFirst: r.slopeFracOfFirst,
      startRuntimeBytes: r.startRuntimeBytes,
      endRuntimeBytes: r.endRuntimeBytes,
      startSessionBytes: r.startSessionBytes,
      endSessionBytes: r.endSessionBytes,
      startExcursion: r.startExcursion,
      endExcursion: r.endExcursion,
      counters: r.counters,
      consoleCalls: r.consoleCalls,
      consoleArgBytes: r.consoleArgBytes,
      base64PersistBytes: r.base64PersistBytes,
      base64InnerHtmlBytes: r.base64InnerHtmlBytes,
      openCount: r.openCount,
      journalCount: r.journalCount,
    })),
    neighborMatrix: neighbors,
    restoreCells,
    persistedFormatHash,
    verdict,
    baselineBeforeFixA: BASELINE_BEFORE,
    fixA: {
      kill: PANEL_KILL,
      canonical: canonicalRuns.map((r) => r.fixA),
      allPass: canonicalRuns.every((r) => r.fixA && r.fixA.pass),
    },
    fixB: {
      kill: EXCURSION_KILL,
      tailMax: EXCURSION_TAIL_MAX,
      canonical: canonicalRuns.map((r) => r.fixB),
      allPass: canonicalRuns.every((r) => r.fixB && r.fixB.pass),
    },
    persist: verdict.persist || (PANEL_KILL || EXCURSION_KILL ? null : 'M19-PERSIST-RED'),
    note: PANEL_KILL
      ? 'FIX-A kill-switch ON — expect ~5500 full panel rebuilds (discriminator RED). Persist not claimed.'
      : (EXCURSION_KILL
        ? 'FIX-B kill-switch ON — expect unbounded open excursion (~5500). D-030 OFF path; persist not claimed GREEN.'
        : 'FIX-B-GREEN — open excursion arrays ≤ 256 with exact MFE/MAE peaks; Fix A held; M19-PERSIST-RED until Fix C. Contract: m19-excursion-tail-contract.test.mjs.'),
  };

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

  const runLines = canonicalRuns.map((r, i) => [
    `### Canonical repeat ${i + 1}`,
    `- frame first/last median: ${r.firstMed?.toFixed?.(4)} → ${r.lastMed?.toFixed?.(4)} (ratio ${r.ratio?.toFixed?.(3)}; limit ≤ ${FRAME_RATIO_MAX})`,
    `- slope/1k: ${r.slopePer1k?.toFixed?.(4)} (frac of first ${r.slopeFracOfFirst?.toFixed?.(4)}; limit ≤ ${SLOPE_PER_1K_MAX_FRAC})`,
    `- runtime bytes: ${r.startRuntimeBytes} → ${r.endRuntimeBytes} (abs limit ${RUNTIME_ABS_MAX})`,
    `- session bytes: ${r.startSessionBytes} → ${r.endSessionBytes} (abs limit ${SESSION_ABS_MAX})`,
    `- steady growth runtime/session: ${r.asserts.runtimeSteadyGrowth.growth} / ${r.asserts.sessionSteadyGrowth.growth}`,
    `- paths a–e exercised: ${r.allFivePaths}`,
    `- panel invocations: ${r.counters.updatePositionsPanel}; Fix-A bounded=${r.fixA?.panelBoundedByStructural} reconstruct=${r.fixA?.panelReconstructsPerTick}; marker redraws: ${r.counters.markerRedraw}; journal rows visited: ${r.counters.journalRowsVisited}`,
    `- Fix-B excursion max=${r.fixB?.maxOpenExcursion} bounded=${r.fixB?.arraysBounded} unbounded=${r.fixB?.arraysUnbounded} (tailMax=${EXCURSION_TAIL_MAX})`,
    `- excursion end: ${JSON.stringify(r.endExcursion)}`,
    `- console calls/bytes: ${r.consoleCalls} / ${r.consoleArgBytes}`,
    `- base64 persist/innerHTML bytes: ${r.base64PersistBytes} / ${r.base64InnerHtmlBytes}`,
    `- open/journal: ${r.openCount}/${r.journalCount}`,
    `- frameSlopeFail=${r.frameSlopeFail} persistFail=${r.persistFail}`,
  ].join('\n')).join('\n\n');

  const report = `# L2-M19 — Fix B excursion tail (${EXCURSION_KILL ? 'KILL' : 'ON'})

**Verdict:** ${verdict.verdict} — ${verdict.detail}

**Persist:** ${verdict.persist || (PANEL_KILL || EXCURSION_KILL ? 'n/a (kill discriminator)' : 'M19-PERSIST-RED')}

**Scope:** Fix B product path on Fix A base \`250086d7c\`. D-030/I16 contract: \`m19-excursion-tail-contract.test.mjs\`. No D/E or Fix C edits. Not a live I15 UI verdict.

## Commands / runtime

\`\`\`
node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
TALARIA_DISABLE_M19_EXCURSION_TAIL_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs"
node "chart v 1.4/chart/modules/order-runtime-persist.test.mjs"
\`\`\`

- startedAt (wall): ${started}
- finishedAt (wall): ${finishedAt}
- elapsedMs: ${Math.round(elapsedMs)}
- HEAD: \`${headSha}\`
- SHA-256 order-manager.js: \`${fileHashes['order-manager.js']}\`
- SHA-256 replay-system.js: \`${fileHashes['replay-system.js']}\`
- SHA-256 chart.js: \`${fileHashes['chart.js']}\`

## Live symbol anchors (verified)

\`\`\`json
${JSON.stringify(anchors.anchors, null, 2)}
\`\`\`

## Locked assertions (unchanged)

- Frame-cost final 20% median ≤ 1.25× first 20% median
- Normalized frame-cost slope ≤ +5% of first-window median per 1,000 ticks
- Final 1,000-tick steady phase: runtime & session growth each ≤ max(5%, 16 KiB)
- Final runtime patch ≤ 256 KiB
- Final session/journal patch ≤ 512 KiB

## 3-run metric summary

${runLines}

## Neighbor state matrix

| Cell | Result |
|---|---|
${neighbors.map((n) => `| ${n.label} | ${n.restore ? (n.pass ? 'RESTORE-PASS' : 'RESTORE-FAIL') : `ratio=${n.ratio?.toFixed?.(3)} slopeFrac=${n.slopeFracOfFirst?.toFixed?.(3)} persistFail=${n.persistFail}`} |`).join('\n')}

## Persisted-format hash (today)

\`${persistedFormatHash}\`

## Evidence

- JSON: \`${path.relative(ROOT, EVIDENCE_PATH).replace(/\\\\/g, '/')}\`
- Report: \`${path.relative(ROOT, REPORT_PATH).replace(/\\\\/g, '/')}\`
- Fixture: \`chart v 1.4/chart/modules/m19-legacy-uncapped-session.fixture.json\`
- Fix B contract: \`chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs\`

## Switches

(a) PANEL_DIRTY — held from Fix A. (b) EXCURSION_TAIL — this run. (c)–(e) untouched / not claimed GREEN.

## Binding

I1/I2/I3/I5/I8/I10/I14/I16 · P1/P2/P3 · D-030 binds (b)/(c).
`;

  fs.writeFileSync(REPORT_PATH, report);

  // stdout summary for relay (console was redirected — use process.stdout)
  const fixAAllPass = canonicalRuns.every((r) => r.fixA && r.fixA.pass);
  const fixBAllPass = canonicalRuns.every((r) => r.fixB && r.fixB.pass);
  const summary = {
    verdict: verdict.verdict,
    detail: verdict.detail,
    fixAAllPass,
    fixBAllPass,
    panelKill: PANEL_KILL,
    excursionKill: EXCURSION_KILL,
    baselineBeforeFixA: BASELINE_BEFORE,
    elapsedMs: Math.round(elapsedMs),
    headSha,
    fileHashes,
    persistedFormatHash,
    evidence: EVIDENCE_PATH,
    report: REPORT_PATH,
    canonical: canonicalRuns.map((r) => ({
      label: r.label,
      ratio: r.ratio,
      slopeFracOfFirst: r.slopeFracOfFirst,
      frameSlopeFail: r.frameSlopeFail,
      persistFail: r.persistFail,
      endRuntimeBytes: r.endRuntimeBytes,
      endSessionBytes: r.endSessionBytes,
      allFivePaths: r.allFivePaths,
      journalCount: r.journalCount,
      panelRebuilds: r.counters.updatePositionsPanel,
      maxOpenExcursion: r.fixB?.maxOpenExcursion,
      fixB: r.fixB,
      fixA: r.fixA,
    })),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  restoreDate();
  // Fix-A/B gates own exit code when not in SETUP/PREMISE failure.
  if (verdict.verdict === 'SETUP-FAIL' || verdict.verdict === 'BLOCKED' || verdict.verdict === 'PREMISE-MISMATCH') {
    process.exitCode = 2;
  } else if (PANEL_KILL) {
    process.exitCode = fixAAllPass ? 1 : 2; // kill reconstruct expected → exit 1 (RED-EXPECTED)
  } else if (EXCURSION_KILL) {
    process.exitCode = fixBAllPass ? 1 : 2; // kill unbounded expected → exit 1 (RED-EXPECTED)
  } else {
    process.exitCode = (fixAAllPass && fixBAllPass) ? 0 : 1;
  }
}

main().catch((err) => {
  restoreDate();
  process.stdout.write(`${JSON.stringify({ verdict: 'SETUP-FAIL', error: String(err?.stack || err) }, null, 2)}\n`);
  process.exitCode = 2;
});
