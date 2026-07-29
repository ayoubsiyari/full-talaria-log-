import http from 'node:http';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startServer as startHarnessServer } from '../../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  HEAP_COLLAPSE_MIN_EXPAND_BYTES,
  HEAP_COLLAPSE_RELEASE_FRACTION,
  HEAP_COLLAPSE_RETENTION_MAX_BYTES,
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
  summarizeCollapseHeap,
} from './heap-memory-instrument.mjs';

export const PO_CPU_AB_SIGNATURE = 'TALARIA_PO_CPU_AB_BENCHMARK_V1';
export const PO_CPU_AB_STATUS_SKIP = 'SKIP';
export const PO_CPU_AB_STATUS_SHORT = 'SHORT';
export const DEFAULT_PO_CPU_AB_TIMEOUT_MS = 600_000;
export const PO_CPU_AB_P1_IDLE_WORK_RATIO_MAX = 0.12;
export const PO_CPU_AB_P2_IDLE_WORK_RATIO_MAX = 0.14;
export const PO_CPU_AB_P7_IDLE_WORK_RATIO_MAX = 0.12;
export const PO_CPU_AB_P6_REPLAY_WORK_RATIO_MARGIN = 0.03;
export const PO_CPU_AB_P4_PEER_WORK_RATIO_MARGIN = 0.003;
/** 1m bar interval used for configured bars/sec under tick-mode speed. */
export const PO_CPU_AB_LAG_BAR_INTERVAL_MS = 60_000;
/** Relative gap required to pick throughput vs smoothness mechanism hint. */
export const PO_CPU_AB_LAG_MECHANISM_MARGIN = 0.08;
export {
  HEAP_COLLAPSE_MIN_EXPAND_BYTES,
  HEAP_COLLAPSE_RELEASE_FRACTION,
  HEAP_COLLAPSE_RETENTION_MAX_BYTES,
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
  summarizeCollapseHeap,
};

export const DEFAULT_PHASE_TIMINGS = Object.freeze({
  p1SettleMs: 10_000,
  p1ObserveMs: 30_000,
  p2IdleMs: 120_000,
  p2ObserveMs: 30_000,
  lagSingleObserveMs: 30_000,
  p4ObserveMs: 30_000,
  p6ObserveMs: 30_000,
  p7SettleMs: 30_000,
  p7ObserveMs: 30_000,
  shortened: false,
});

export const SHORT_PHASE_TIMINGS = Object.freeze({
  p1SettleMs: 1_000,
  p1ObserveMs: 3_000,
  p2IdleMs: 10_000,
  p2ObserveMs: 3_000,
  // 10x on 1m ≈ 0.167 bars/sec; 15s yields ~2.5 expected bars for lag ratios.
  lagSingleObserveMs: 15_000,
  p4ObserveMs: 15_000,
  p6ObserveMs: 3_000,
  p7SettleMs: 1_000,
  p7ObserveMs: 3_000,
  shortened: true,
});

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'self'",
].join('; ');

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy': CSP,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function jsonResponse(response, value, status = 200) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function poCpuAbProbeScript() {
  return `(function () {
  if (window.__poCpuAbProbe) return;
  var nativeSetInterval = window.setInterval.bind(window);
  var nativeSetTimeout = window.setTimeout.bind(window);
  var nativeRequestAnimationFrame = window.requestAnimationFrame && window.requestAnimationFrame.bind(window);
  var state = {
    startedAt: performance.now(),
    intervalCallbacks: 0,
    timeoutCallbacks: 0,
    rafCallbacks: 0,
    rafFrameSequence: 0,
    rafLastFrameAt: null,
    rafFrameIntervalSamples: [],
    rafFrameIntervalSamplesTruncated: false,
    callbackBusyMs: 0,
    maxCallbackMs: 0,
    callbackSequence: 0,
    callbackMaxSamples: [],
    callbackMaxSamplesTruncated: false,
    longTaskCount: 0,
    longTaskDurationMs: 0,
    // Ceiling-profile: aggregate expensive callback stacks + canvas paint proxies.
    stackMsByKey: Object.create(null),
    canvasPaintMs: 0,
    canvasPaintCalls: 0
  };
  function stackKeyFromError() {
    try {
      var err = new Error('po-cpu-ab-stack');
      var raw = String(err.stack || '');
      var lines = raw.split('\\n').map(function (line) { return line.trim(); }).filter(Boolean);
      // Drop Error message + this wrapper frames; keep first 4 product frames.
      var product = [];
      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i];
        if (/po-cpu-ab-stack|poCpuAbProbe|stackKeyFromError|account\\(|wrap\\(|window\\.setTimeout|window\\.setInterval|window\\.requestAnimationFrame|nativeSetTimeout|nativeSetInterval|nativeRequestAnimationFrame/.test(line)) continue;
        if (/harness\\/host\\.html/.test(line) && !/chart\\.js|replay-system|drawing-tools|modules\\//.test(line)) continue;
        product.push(line.replace(/^at\\s+/, ''));
        if (product.length >= 4) break;
      }
      return product.length ? product.join(' | ') : '(unknown)';
    } catch (_) {
      return '(unknown)';
    }
  }
  function account(kind, startedAt, pathKey) {
    var dt = Math.max(0, performance.now() - startedAt);
    state.callbackBusyMs += dt;
    state.callbackSequence += 1;
    state.maxCallbackMs = Math.max(state.maxCallbackMs, dt);
    if (state.callbackMaxSamples.length < 5000) {
      state.callbackMaxSamples.push({ sequence: state.callbackSequence, durationMs: dt });
    } else {
      state.callbackMaxSamplesTruncated = true;
    }
    // Path key is captured at schedule-time (who requested the timer/rAF).
    if (dt >= 0.5) {
      var key = pathKey || (kind + ' :: (unknown)');
      state.stackMsByKey[key] = (state.stackMsByKey[key] || 0) + dt;
    }
    if (kind === 'interval') state.intervalCallbacks += 1;
    else if (kind === 'timeout') state.timeoutCallbacks += 1;
    else if (kind === 'raf') state.rafCallbacks += 1;
  }
  function wrapCanvasMethod(proto, name) {
    if (!proto || typeof proto[name] !== 'function') return;
    var native = proto[name];
    proto[name] = function () {
      var startedAt = performance.now();
      try {
        return native.apply(this, arguments);
      } finally {
        var dt = Math.max(0, performance.now() - startedAt);
        state.canvasPaintMs += dt;
        state.canvasPaintCalls += 1;
      }
    };
  }
  try {
    wrapCanvasMethod(CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, 'fillRect');
    wrapCanvasMethod(CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, 'fill');
    wrapCanvasMethod(CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, 'stroke');
    wrapCanvasMethod(CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, 'drawImage');
    wrapCanvasMethod(CanvasRenderingContext2D && CanvasRenderingContext2D.prototype, 'putImageData');
  } catch (_) {}
  function wrap(kind, fn, scheduledStack) {
    if (typeof fn !== 'function') return fn;
    var fnLabel = fn.name || 'anonymous';
    var pathKey = kind + ' :: ' + fnLabel + ' << ' + (scheduledStack || '(no-schedule-stack)');
    return function () {
      var startedAt = performance.now();
      try {
        return fn.apply(this, arguments);
      } finally {
        account(kind, startedAt, pathKey);
      }
    };
  }
  window.setInterval = function (fn, delay) {
    return nativeSetInterval(wrap('interval', fn, stackKeyFromError()), delay);
  };
  window.setTimeout = function (fn, delay) {
    return nativeSetTimeout(wrap('timeout', fn, stackKeyFromError()), delay);
  };
  function pushRafFrameInterval(timestamp) {
    var at = Number(timestamp);
    if (!Number.isFinite(at)) at = performance.now();
    if (Number.isFinite(state.rafLastFrameAt)) {
      var dt = Math.max(0, at - state.rafLastFrameAt);
      state.rafFrameSequence += 1;
      if (state.rafFrameIntervalSamples.length < 5000) {
        state.rafFrameIntervalSamples.push({ sequence: state.rafFrameSequence, intervalMs: dt });
      } else {
        state.rafFrameIntervalSamplesTruncated = true;
      }
    }
    state.rafLastFrameAt = at;
  }
  if (nativeRequestAnimationFrame) {
    window.requestAnimationFrame = function (fn) {
      if (typeof fn !== 'function') return nativeRequestAnimationFrame(fn);
      var scheduledStack = stackKeyFromError();
      var wrapped = wrap('raf', fn, scheduledStack);
      return nativeRequestAnimationFrame(function (ts) {
        pushRafFrameInterval(ts);
        return wrapped.apply(this, arguments);
      });
    };
  }
  try {
    var observer = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        state.longTaskCount += 1;
        state.longTaskDurationMs += Number(entry.duration) || 0;
      });
    });
    observer.observe({ type: 'longtask', buffered: true });
    state.longTaskObserver = true;
  } catch (_) {
    state.longTaskObserver = false;
  }
  window.__poCpuAbProbe = {
    signature: '${PO_CPU_AB_SIGNATURE}',
    snapshot: function () {
      var stackRows = Object.keys(state.stackMsByKey).map(function (key) {
        return { key: key, selfMs: state.stackMsByKey[key] };
      }).sort(function (a, b) { return b.selfMs - a.selfMs; }).slice(0, 40);
      return {
        at: performance.now(),
        intervalCallbacks: state.intervalCallbacks,
        timeoutCallbacks: state.timeoutCallbacks,
        rafCallbacks: state.rafCallbacks,
        rafFrameSequence: state.rafFrameSequence,
        rafFrameIntervalSamples: state.rafFrameIntervalSamples.slice(),
        rafFrameIntervalSamplesTruncated: state.rafFrameIntervalSamplesTruncated,
        callbackBusyMs: state.callbackBusyMs,
        maxCallbackMs: state.maxCallbackMs,
        callbackSequence: state.callbackSequence,
        callbackMaxSamples: state.callbackMaxSamples.slice(),
        callbackMaxSamplesTruncated: state.callbackMaxSamplesTruncated,
        longTaskCount: state.longTaskCount,
        longTaskDurationMs: state.longTaskDurationMs,
        longTaskObserver: state.longTaskObserver,
        canvasPaintMs: state.canvasPaintMs,
        canvasPaintCalls: state.canvasPaintCalls,
        stackRows: stackRows
      };
    }
  };
})();`;
}

export function poCpuAbReplayArmingHelpersSource() {
  return `function replayStartPending(rs) {
      if (!rs) return false;
      if (rs.isPlayStarting === true) return true;
      try {
        if (typeof rs.getPlaybackLoopKind === 'function') {
          const kind = rs.getPlaybackLoopKind();
          return kind === 'tick' || kind === 'candle';
        }
      } catch (_) {}
      return false;
    }

    function attemptReplayStart(rs, toggleState) {
      if (!rs || rs.isPlaying || replayStartPending(rs)) return false;
      try {
        if (typeof rs.play === 'function') {
          rs.play();
          return true;
        }
        if (!toggleState.usedToggle && typeof rs.togglePlay === 'function') {
          toggleState.usedToggle = true;
          rs.togglePlay();
          return true;
        }
      } catch (_) {}
      return false;
    }`;
}

function injectProbeIntoHarnessHtml(body) {
  const needle = '<head>';
  const probeTag = `<script>${poCpuAbProbeScript()}</script>`;
  if (!body.includes(needle)) return `${probeTag}${body}`;
  return body.replace(needle, `${needle}\n${probeTag}`);
}

function phaseTimings({ short = false, timings = {} } = {}) {
  const merged = { ...(short ? SHORT_PHASE_TIMINGS : DEFAULT_PHASE_TIMINGS), ...timings };
  if (short || timings.p2Override === true) merged.shortened = true;
  return merged;
}

export function poCpuAbHostHtml({ timings = DEFAULT_PHASE_TIMINGS, mutant = false, p4NoFanout = false } = {}) {
  const configJson = JSON.stringify({ timings, mutant, p4NoFanout, signature: PO_CPU_AB_SIGNATURE });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>PO CPU A/B benchmark gate</title>
  <style>
    html, body, iframe { margin:0; width:100%; height:100%; border:0; background:#07080e; }
  </style>
</head>
<body>
  <iframe id="harness" src="/harness/host.html?panels=1&tf=1m&pair=same&hostFile=25"></iframe>
  <script type="module">
    const CONFIG = ${configJson};
    const PANEL_IDS = ['B', 'C', 'D'];
    const P4_ADVANCE_RATE_CEILING_MULTIPLIER = 12;
    const P4_MIN_ADVANCE_OBSERVE_MS = 500;
    const P4_MIN_TIMESTAMP_MS_PER_INDEX = 1000;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function harnessWindow() {
      return document.getElementById('harness').contentWindow;
    }

    function chart() {
      return harnessWindow().chart;
    }

    function replaySystem() {
      const ch = chart();
      return ch && ch.replaySystem;
    }

    function probe(win = harnessWindow()) {
      return win && win.__poCpuAbProbe;
    }

    function manager() {
      const win = harnessWindow();
      return win.__harnessManager || win.__multichartManagerRef;
    }

    const REQUIRED_PANEL_IDS = ['A', 'B', 'C', 'D'];
    ${poCpuAbReplayArmingHelpersSource()}

    function normalizePanelIds(ids) {
      const out = [];
      for (const rawId of Array.isArray(ids) ? ids : []) {
        const id = rawId != null ? String(rawId) : '';
        if (id && !out.includes(id)) out.push(id);
      }
      return out;
    }

    function duplicatePanelIds(ids) {
      const seen = new Set();
      const dupes = [];
      for (const rawId of Array.isArray(ids) ? ids : []) {
        const id = rawId != null ? String(rawId) : '';
        if (!id) continue;
        if (seen.has(id) && !dupes.includes(id)) dupes.push(id);
        seen.add(id);
      }
      return dupes;
    }

    function hasDistinctRequiredPanelIds(ids) {
      const raw = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
      const normalized = normalizePanelIds(raw);
      return raw.length === normalized.length
        && REQUIRED_PANEL_IDS.every((id) => normalized.includes(id));
    }

    function sameRequiredPanelSet(left, right) {
      const l = normalizePanelIds(left).filter((id) => REQUIRED_PANEL_IDS.includes(id)).sort().join(',');
      const r = normalizePanelIds(right).filter((id) => REQUIRED_PANEL_IDS.includes(id)).sort().join(',');
      return l === REQUIRED_PANEL_IDS.slice().sort().join(',') && l === r;
    }

    function refreshHarnessTopology() {
      const win = harnessWindow();
      const mgr = manager();
      const grid = win.__multichartGrid;
      if (!mgr || !mgr.charts || !grid || grid.__poCpuAbTopologyPatched) return;
      const originalGetChartForPanelId = typeof grid.getChartForPanelId === 'function' ? grid.getChartForPanelId.bind(grid) : null;
      const originalGetChartForPanel = typeof grid.getChartForPanel === 'function' ? grid.getChartForPanel.bind(grid) : null;
      function chartForPanelId(panelId) {
        const id = panelId != null ? String(panelId) : 'A';
        try {
          const originalChart = originalGetChartForPanelId
            ? originalGetChartForPanelId(id)
            : (originalGetChartForPanel ? originalGetChartForPanel(id) : null);
          if (originalChart) return originalChart;
        } catch (_) {}
        if (id === 'A') return win.chart || null;
        try {
          const entry = mgr.charts.get(id);
          return entry && entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart || null;
        } catch (_) {
          return null;
        }
      }
      if (typeof grid.getChartForPanelId !== 'function') grid.getChartForPanelId = chartForPanelId;
      if (typeof grid.getChartForPanel !== 'function') grid.getChartForPanel = chartForPanelId;
      grid.__poCpuAbTopologyPatched = true;
    }

    function productTopologyEvidence() {
      const win = harnessWindow();
      refreshHarnessTopology();
      const mgr = manager();
      const grid = win.__multichartGrid;
      const evidence = {
        gridPresent: !!grid,
        gridHasGetPanelIds: !!(grid && typeof grid.getPanelIds === 'function'),
        gridIds: [],
        gridDuplicateIds: [],
        gridMissingIds: REQUIRED_PANEL_IDS.slice(),
        gridComplete: false,
        managerIds: [],
        managerDuplicateIds: [],
        managerComplete: false,
        managerGridConsistent: false,
        windowIds: []
      };
      try {
        if (mgr && mgr.charts && typeof mgr.charts.keys === 'function') {
          const managerRawIds = Array.from(mgr.charts.keys()).map((id) => String(id));
          if (!managerRawIds.includes('A') && win.chart) managerRawIds.unshift('A');
          evidence.managerDuplicateIds = duplicatePanelIds(managerRawIds);
          evidence.managerIds = normalizePanelIds(managerRawIds);
          evidence.managerComplete = hasDistinctRequiredPanelIds(managerRawIds);
        }
      } catch (_) {}
      try {
        if (grid && typeof grid.getPanelIds === 'function') {
          const gridRawIds = (grid.getPanelIds() || []).map((id) => String(id));
          evidence.gridDuplicateIds = duplicatePanelIds(gridRawIds);
          evidence.gridIds = normalizePanelIds(gridRawIds);
        }
      } catch (error) {
        evidence.gridError = String(error && error.message || error);
      }
      evidence.gridMissingIds = REQUIRED_PANEL_IDS.filter((id) => !evidence.gridIds.includes(id));
      evidence.gridComplete = evidence.gridPresent && evidence.gridHasGetPanelIds
        && evidence.gridDuplicateIds.length === 0
        && REQUIRED_PANEL_IDS.every((id) => evidence.gridIds.includes(id));
      evidence.managerGridConsistent = evidence.gridComplete && evidence.managerComplete
        && sameRequiredPanelSet(evidence.gridIds, evidence.managerIds);
      return evidence;
    }

    function chartWindows() {
      const win = harnessWindow();
      refreshHarnessTopology();
      const out = [];
      const seen = new Set();
      function push(id, panelWin, frame) {
        if (!id || seen.has(id) || !panelWin) return;
        seen.add(id);
        out.push({ id, win: panelWin, frame });
      }
      push('A', win, null);
      const grid = win.__multichartGrid;
      if (grid && typeof grid.getPanelIds === 'function') {
        for (const rawId of grid.getPanelIds()) {
          const id = String(rawId);
          try {
            const ch = typeof grid.getChartForPanelId === 'function'
              ? grid.getChartForPanelId(id)
              : (typeof grid.getChartForPanel === 'function' ? grid.getChartForPanel(id) : null);
            if (ch) push(id, ch.window || (id === 'A' ? win : null), null);
          } catch (_) {}
        }
      }
      const mgr = manager();
      if (mgr && mgr.charts) {
        for (const id of PANEL_IDS) {
          const entry = mgr.charts.get(id);
          try {
            if (entry && entry.frame && entry.frame.contentWindow) {
              push(id, entry.frame.contentWindow, entry.frame);
            }
          } catch (_) {}
        }
      }
      try {
        const topology = productTopologyEvidence();
        topology.windowIds = out.map((entry) => entry.id);
      } catch (_) {}
      return out;
    }

    function memorySnapshot(win) {
      const mem = win && win.performance && win.performance.memory;
      if (!mem) return { exposed: false, metric: 'usedJSHeapSize' };
      return {
        exposed: true,
        metric: 'usedJSHeapSize',
        usedJSHeapSize: Number(mem.usedJSHeapSize) || 0,
        totalJSHeapSize: Number(mem.totalJSHeapSize) || 0,
        jsHeapSizeLimit: Number(mem.jsHeapSizeLimit) || 0
      };
    }

    async function forceGcBestEffort(win) {
      const target = win || window;
      let available = false;
      try {
        if (typeof target.gc === 'function') { target.gc(); available = true; }
      } catch (_) {}
      try {
        if (win !== window && typeof window.gc === 'function') { window.gc(); available = true; }
      } catch (_) {}
      await sleep(80);
      return available;
    }

    /** Canonical heap sample: forced GC then performance.memory.usedJSHeapSize. */
    async function memorySnapshotForced(win) {
      const availableA = await forceGcBestEffort(win);
      const availableB = await forceGcBestEffort(win);
      const snap = memorySnapshot(win);
      return {
        ...snap,
        forcedGcAttempted: true,
        forcedGcAvailable: availableA === true || availableB === true
      };
    }

    async function waitFor(predicate, label, timeoutMs = 60000) {
      const started = Date.now();
      let lastError = null;
      while (Date.now() - started < timeoutMs) {
        try {
          if (predicate()) return;
        } catch (error) {
          lastError = error;
        }
        await sleep(100);
      }
      throw new Error('timeout waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
    }

    function deltaMetrics(label, durationMs, start, end, startMemory, endMemory) {
      const callbackBusyMs = Math.max(0, end.callbackBusyMs - start.callbackBusyMs);
      const longTaskDurationMs = Math.max(0, end.longTaskDurationMs - start.longTaskDurationMs);
      const intervalCallbacks = Math.max(0, end.intervalCallbacks - start.intervalCallbacks);
      const timeoutCallbacks = Math.max(0, end.timeoutCallbacks - start.timeoutCallbacks);
      const rafCallbacks = Math.max(0, end.rafCallbacks - start.rafCallbacks);
      const longTaskCount = Math.max(0, end.longTaskCount - start.longTaskCount);
      const startCallbackSequence = Number(start.callbackSequence) || 0;
      const endCallbackSequence = Number(end.callbackSequence) || 0;
      const phaseCallbackSamples = Array.isArray(end.callbackMaxSamples)
        ? end.callbackMaxSamples.filter((sample) => {
          const sequence = Number(sample && sample.sequence);
          return Number.isFinite(sequence) && sequence > startCallbackSequence && sequence <= endCallbackSequence;
        })
        : [];
      const maxCallbackMs = phaseCallbackSamples.reduce((max, sample) => {
        const duration = Number(sample && sample.durationMs);
        return Number.isFinite(duration) ? Math.max(max, duration) : max;
      }, 0);
      const startRafSequence = Number(start.rafFrameSequence) || 0;
      const endRafSequence = Number(end.rafFrameSequence) || 0;
      const phaseFrameIntervals = Array.isArray(end.rafFrameIntervalSamples)
        ? end.rafFrameIntervalSamples
          .filter((sample) => {
            const sequence = Number(sample && sample.sequence);
            return Number.isFinite(sequence) && sequence > startRafSequence && sequence <= endRafSequence;
          })
          .map((sample) => Number(sample && sample.intervalMs))
          .filter((value) => Number.isFinite(value) && value >= 0)
        : [];
      const frameTiming = summarizeFrameIntervals(phaseFrameIntervals);
      const observedMs = Math.max(1, durationMs);
      const workMs = Math.max(callbackBusyMs, longTaskDurationMs);
      return {
        label,
        durationMs,
        observedMs,
        callbackBusyMs,
        longTaskDurationMs,
        workMs,
        workRatio: workMs / observedMs,
        intervalCallbacks,
        timeoutCallbacks,
        rafCallbacks,
        timerCallbacks: intervalCallbacks + timeoutCallbacks + rafCallbacks,
        longTaskCount,
        maxCallbackMs,
        frameIntervalCount: phaseFrameIntervals.length,
        p50FrameMs: frameTiming.p50FrameMs,
        p95FrameMs: frameTiming.p95FrameMs,
        maxFrameMs: frameTiming.maxFrameMs,
        memory: {
          start: startMemory,
          end: endMemory,
          usedDeltaBytes: startMemory.exposed && endMemory.exposed
            ? endMemory.usedJSHeapSize - startMemory.usedJSHeapSize
            : null
        },
        probe: {
          longTaskObserver: !!end.longTaskObserver,
          start,
          end
        }
      };
    }

    function summarizeFrameIntervals(values) {
      if (!Array.isArray(values) || values.length === 0) {
        return { p50FrameMs: null, p95FrameMs: null, maxFrameMs: null };
      }
      const sorted = values.slice().sort((a, b) => a - b);
      const at = (q) => {
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
        return sorted[index];
      };
      return {
        p50FrameMs: at(0.5),
        p95FrameMs: at(0.95),
        maxFrameMs: sorted[sorted.length - 1]
      };
    }

    async function collectProbeRows() {
      const rows = [];
      for (const entry of chartWindows()) {
        const p = probe(entry.win);
        if (!p || typeof p.snapshot !== 'function') continue;
        rows.push({ id: entry.id, snapshot: p.snapshot(), memory: await memorySnapshotForced(entry.win) });
      }
      return rows;
    }

    function aggregateProbeRows(label, durationMs, startRows, endRows) {
      const startsById = new Map(startRows.map((row) => [row.id, row]));
      const perWindow = [];
      let callbackBusyMs = 0;
      let longTaskDurationMs = 0;
      let intervalCallbacks = 0;
      let timeoutCallbacks = 0;
      let rafCallbacks = 0;
      let longTaskCount = 0;
      let maxCallbackMs = 0;
      let memoryDelta = 0;
      let memoryExposed = true;
      for (const endRow of endRows) {
        const startRow = startsById.get(endRow.id);
        if (!startRow) continue;
        const row = deltaMetrics(label + ':' + endRow.id, durationMs, startRow.snapshot, endRow.snapshot, startRow.memory, endRow.memory);
        perWindow.push({ id: endRow.id, ...row });
        callbackBusyMs += row.callbackBusyMs;
        longTaskDurationMs += row.longTaskDurationMs;
        intervalCallbacks += row.intervalCallbacks;
        timeoutCallbacks += row.timeoutCallbacks;
        rafCallbacks += row.rafCallbacks;
        longTaskCount += row.longTaskCount;
        maxCallbackMs = Math.max(maxCallbackMs, row.maxCallbackMs);
        if (row.memory.usedDeltaBytes == null) memoryExposed = false;
        else memoryDelta += row.memory.usedDeltaBytes;
      }
      const observedMs = Math.max(1, durationMs);
      const workMs = Math.max(callbackBusyMs, longTaskDurationMs);
      const frameIntervalCount = perWindow.reduce((sum, row) => sum + (Number(row.frameIntervalCount) || 0), 0);
      const p50FrameMs = percentile(perWindow.map((row) => Number(row.p50FrameMs)).filter((value) => Number.isFinite(value)), 0.5);
      const p95FrameMs = percentile(perWindow.map((row) => Number(row.p95FrameMs)).filter((value) => Number.isFinite(value)), 0.5);
      const maxFrameMs = perWindow.reduce((max, row) => {
        const value = Number(row.maxFrameMs);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0) || null;
      return {
        label,
        durationMs,
        observedMs,
        callbackBusyMs,
        longTaskDurationMs,
        workMs,
        workRatio: workMs / observedMs,
        intervalCallbacks,
        timeoutCallbacks,
        rafCallbacks,
        timerCallbacks: intervalCallbacks + timeoutCallbacks + rafCallbacks,
        longTaskCount,
        maxCallbackMs,
        frameIntervalCount,
        p50FrameMs,
        p95FrameMs,
        maxFrameMs,
        memory: { start: null, end: null, usedDeltaBytes: memoryExposed ? memoryDelta : null },
        probe: { windowCount: perWindow.length, windows: perWindow }
      };
    }

    function percentile(values, q) {
      if (!Array.isArray(values) || values.length === 0) return null;
      const sorted = values.slice().sort((a, b) => a - b);
      const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
      return sorted[index];
    }

    async function collectPhase(label, durationMs) {
      if (!probe() || typeof probe().snapshot !== 'function') throw new Error('PO CPU probe missing in harness window');
      performance.mark(label + ':start');
      const startRows = await collectProbeRows();
      await sleep(durationMs);
      const endRows = await collectProbeRows();
      performance.mark(label + ':end');
      performance.measure(label, label + ':start', label + ':end');
      return aggregateProbeRows(label, durationMs, startRows, endRows);
    }

    function replayStateForChart(ch) {
      const rs = ch && ch.replaySystem;
      if (!rs) return { present: false };
      const passivePlayActive = !!(ch && ch._multichartPassivePlayActive);
      const replayTimestamp = rs.replayTimestamp != null ? Number(rs.replayTimestamp) : null;
      const rawCurrentTimestamp = Array.isArray(rs.fullRawData) && rs.fullRawData[rs.currentIndex] && rs.fullRawData[rs.currentIndex].t != null
        ? Number(rs.fullRawData[rs.currentIndex].t)
        : null;
      const hasReplayTimestamp = Number.isFinite(replayTimestamp);
      const hasRawCurrentTimestamp = Number.isFinite(rawCurrentTimestamp);
      return {
        present: true,
        lifecycleState: Object.prototype.hasOwnProperty.call(rs, '_m20Q6LifecycleState')
          ? String(rs._m20Q6LifecycleState || '')
          : null,
        isActive: !!rs.isActive,
        isPlaying: !!(rs.isPlaying || passivePlayActive),
        rawIsPlaying: !!rs.isPlaying,
        passivePlayActive,
        currentIndex: Number.isFinite(Number(rs.currentIndex)) ? Number(rs.currentIndex) : null,
        currentTimestamp: hasReplayTimestamp ? replayTimestamp : (hasRawCurrentTimestamp ? rawCurrentTimestamp : null),
        rawCurrentTimestamp: hasRawCurrentTimestamp ? rawCurrentTimestamp : null,
        currentTimestampSource: hasReplayTimestamp ? 'replayTimestamp' : (hasRawCurrentTimestamp ? 'fullRawData[currentIndex]' : null),
        speed: Number(rs.speed),
        playbackMode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : String(rs.playbackMode || '')
      };
    }

    function replayLifecycleReadyForChart(ch) {
      const rs = ch && ch.replaySystem;
      if (!rs) return false;
      if (!Object.prototype.hasOwnProperty.call(rs, '_m20Q6LifecycleState')) return true;
      return String(rs._m20Q6LifecycleState || '') === 'active';
    }

    async function waitForReplayLifecycleForChart(ch, label, timeoutMs = 60000) {
      await waitFor(() => replayLifecycleReadyForChart(ch), label + ' replay lifecycle active', timeoutMs);
    }

    async function waitForReplayTimestampBaselineForChart(ch, label, timeoutMs = 3000) {
      let state = replayStateForChart(ch);
      await waitFor(() => {
        state = replayStateForChart(ch);
        return state.present === true
          && state.isActive === true
          && state.currentTimestampSource === 'replayTimestamp'
          && Number.isFinite(Number(state.currentTimestamp))
          && Number.isFinite(Number(state.currentIndex));
      }, label + ' settled replayTimestamp baseline', timeoutMs);
      await sleep(100);
      state = replayStateForChart(ch);
      if (state.currentTimestampSource !== 'replayTimestamp' || !Number.isFinite(Number(state.currentTimestamp))) {
        throw new Error(label + ' replayTimestamp baseline changed before playback arm');
      }
      return state;
    }

    function seekReplayOffEndForChart(ch) {
      const rs = ch && ch.replaySystem;
      try {
        if (typeof rs.seekTo === 'function' && Array.isArray(rs.fullRawData) && rs.fullRawData.length > 50) {
          const minIdx = Number.isFinite(Number(rs.sessionStartIndex)) ? Number(rs.sessionStartIndex) : 0;
          const targetIndex = Math.min(Math.max(minIdx + 1, Math.floor(rs.fullRawData.length * 0.05)), rs.fullRawData.length - 2);
          rs.seekTo(targetIndex);
          return true;
        }
        if (typeof rs.goToReplayTimestamp === 'function' && Array.isArray(rs.fullRawData) && rs.fullRawData.length > 50) {
          const minIdx = Number.isFinite(Number(rs.sessionStartIndex)) ? Number(rs.sessionStartIndex) : 0;
          const targetIndex = Math.min(Math.max(minIdx + 1, Math.floor(rs.fullRawData.length * 0.05)), rs.fullRawData.length - 2);
          const row = rs.fullRawData[targetIndex];
          if (row && row.t != null) {
            rs.goToReplayTimestamp(Number(row.t));
            return true;
          }
        }
      } catch (_) {}
      return false;
    }

    function replayState() {
      return replayStateForChart(chart());
    }

    function timestampSourceChanged(beforeState, afterState) {
      const beforeSource = beforeState && beforeState.currentTimestampSource;
      const afterSource = afterState && afterState.currentTimestampSource;
      return beforeState && afterState
        && beforeState.currentTimestamp != null
        && afterState.currentTimestamp != null
        && beforeSource != null
        && afterSource != null
        && String(beforeSource) !== String(afterSource);
    }

    function effectivelyPlayingForAdvance(state) {
      if (!state || state.isPlaying !== true) return false;
      const hasRawFlag = Object.prototype.hasOwnProperty.call(state, 'rawIsPlaying');
      const hasPassiveFlag = Object.prototype.hasOwnProperty.call(state, 'passivePlayActive');
      if (hasRawFlag || hasPassiveFlag) {
        return state.rawIsPlaying === true || state.passivePlayActive === true;
      }
      return true;
    }

    function replayAdvance(beforeState, afterState, options = {}) {
      const beforeIndex = beforeState && beforeState.currentIndex;
      const afterIndex = afterState && afterState.currentIndex;
      const beforeTimestamp = beforeState && beforeState.currentTimestamp;
      const afterTimestamp = afterState && afterState.currentTimestamp;
      const indexDelta = beforeIndex != null && afterIndex != null ? afterIndex - beforeIndex : null;
      const timestampDelta = beforeTimestamp != null && afterTimestamp != null ? afterTimestamp - beforeTimestamp : null;
      const sourceChanged = timestampSourceChanged(beforeState, afterState);
      const elapsedMs = Number.isFinite(Number(options.elapsedMs)) ? Math.max(0, Number(options.elapsedMs)) : null;
      const speed = Number.isFinite(Number(options.speed)) && Number(options.speed) > 0
        ? Number(options.speed)
        : (Number.isFinite(Number(afterState && afterState.speed)) && Number(afterState.speed) > 0
          ? Number(afterState.speed)
          : (Number.isFinite(Number(beforeState && beforeState.speed)) && Number(beforeState.speed) > 0 ? Number(beforeState.speed) : null));
      const maxTimestampDelta = elapsedMs != null && speed != null
        ? speed * elapsedMs * P4_ADVANCE_RATE_CEILING_MULTIPLIER
        : null;
      const playingSamplesRequired = options.requirePlayingSamples === true;
      const samplesWhilePlaying = !playingSamplesRequired
        || (effectivelyPlayingForAdvance(beforeState) && effectivelyPlayingForAdvance(afterState));
      const observedLongEnough = elapsedMs == null || elapsedMs >= P4_MIN_ADVANCE_OBSERVE_MS;
      const rateCoherent = maxTimestampDelta == null
        || (Number.isFinite(timestampDelta) && timestampDelta <= maxTimestampDelta);
      const indexTimestampCoherent = Number.isFinite(indexDelta)
        && Number.isFinite(timestampDelta)
        && indexDelta > 0
        && timestampDelta > 0
        && timestampDelta >= indexDelta * P4_MIN_TIMESTAMP_MS_PER_INDEX;
      const contradiction = sourceChanged
        || (Number.isFinite(indexDelta) && Number.isFinite(timestampDelta)
          && ((indexDelta > 0 && timestampDelta <= 0) || (indexDelta < 0 && timestampDelta > 0)));
      const advanced = Number.isFinite(timestampDelta)
        && timestampDelta > 0
        && !sourceChanged
        && !contradiction
        && samplesWhilePlaying
        && observedLongEnough
        && rateCoherent
        && indexTimestampCoherent;
      return {
        indexDelta,
        timestampDelta,
        sourceChanged,
        samplesWhilePlaying,
        observedLongEnough,
        elapsedMs,
        speed,
        maxTimestampDelta,
        rateCoherent,
        indexTimestampCoherent,
        contradiction,
        advanced
      };
    }

    function ensureReplayActiveForChart(ch) {
      const rs = ch && ch.replaySystem;
      if (!ch || !rs) return { ok: false, reason: 'chart or replaySystem missing' };
      if (!replayLifecycleReadyForChart(ch)) {
        return { ok: false, reason: 'replay lifecycle not active', state: replayStateForChart(ch) };
      }
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        seekReplayOffEndForChart(ch);
      } catch (error) {
        return { ok: false, reason: 'activate/seek failed: ' + String(error && error.message || error) };
      }
      return { ok: !!rs.isActive, state: replayStateForChart(ch) };
    }

    function ensureReplayActive() {
      return ensureReplayActiveForChart(chart());
    }

    async function prepareReplay10xForChart(ch) {
      try {
        await waitForReplayLifecycleForChart(ch, 'panel', 60000);
      } catch (error) {
        return { ok: false, requestedSpeed: 10, nearestSpeed: null, reason: String(error && error.message || error), state: replayStateForChart(ch) };
      }
      const active = ensureReplayActiveForChart(ch);
      if (!active.ok) return { ok: false, requestedSpeed: 10, nearestSpeed: null, reason: active.reason, state: replayStateForChart(ch) };
      const rs = ch && ch.replaySystem;
      let method = 'unavailable';
      try {
        if (typeof rs.setSpeed === 'function') {
          rs.setSpeed(10);
          method = 'setSpeed';
        } else if ('speed' in rs) {
          rs.speed = 10;
          method = 'speed-property';
        }
        seekReplayOffEndForChart(ch);
      } catch (error) {
        return { ok: false, requestedSpeed: 10, nearestSpeed: Number(rs.speed) || null, method, reason: String(error && error.message || error), state: replayStateForChart(ch) };
      }
      let beforeState;
      try {
        beforeState = await waitForReplayTimestampBaselineForChart(ch, 'panel', 3000);
      } catch (error) {
        return { ok: false, requestedSpeed: 10, nearestSpeed: Number(rs.speed) || null, method, reason: String(error && error.message || error), state: replayStateForChart(ch) };
      }
      return {
        ok: true,
        ch,
        rs,
        requestedSpeed: 10,
        nearestSpeed: Number.isFinite(Number(rs.speed)) ? Number(rs.speed) : null,
        method,
        beforeState
      };
    }

    async function observePreparedReplay10x(prepared, observeMs = 4000) {
      const ch = prepared && prepared.ch;
      const rs = prepared && prepared.rs;
      const beforeState = prepared && prepared.beforeState;
      const method = prepared && prepared.method || 'unavailable';
      if (!prepared || prepared.ok !== true || !rs) {
        return prepared && typeof prepared === 'object' ? prepared : { ok: false, requestedSpeed: 10, nearestSpeed: null, reason: 'replay preparation failed', state: replayStateForChart(ch) };
      }
      const started = Date.now();
      let observedPlaying = false;
      let observedActive = !!rs.isActive;
      let afterState = replayStateForChart(ch);
      let advance = replayAdvance(beforeState, afterState);
      let stickyAdvance = advance.advanced ? advance : null;
      const toggleState = { usedToggle: false };
      while (Date.now() - started < 4000) {
        attemptReplayStart(rs, toggleState);
        observedActive = observedActive || !!rs.isActive;
        observedPlaying = observedPlaying || !!rs.isPlaying;
        afterState = replayStateForChart(ch);
        advance = replayAdvance(beforeState, afterState);
        if (advance.advanced) stickyAdvance = stickyAdvance || advance;
        if (observedPlaying && stickyAdvance) break;
        await sleep(50);
      }
      if (observedPlaying && stickyAdvance && !afterState.isPlaying && !rs.isPlaying) {
        seekReplayOffEndForChart(ch);
        const rearmStarted = Date.now();
        const rearmToggleState = { usedToggle: false };
        while (Date.now() - rearmStarted < 1000) {
          attemptReplayStart(rs, rearmToggleState);
          if (rs.isPlaying) break;
          await sleep(50);
        }
        afterState = replayStateForChart(ch);
      }
      const evidenceAdvance = stickyAdvance || advance;
      return {
        ok: observedActive && observedPlaying && !!stickyAdvance,
        requestedSpeed: 10,
        nearestSpeed: Number.isFinite(Number(rs.speed)) ? Number(rs.speed) : null,
        method,
        activeObserved: observedActive,
        playingObserved: observedPlaying,
        advancedObserved: !!stickyAdvance,
        indexDelta: evidenceAdvance.indexDelta,
        timestampDelta: evidenceAdvance.timestampDelta,
        advanceContradiction: !!evidenceAdvance.contradiction,
        beforeState,
        state: afterState
      };
    }

    async function startReplay10xForChart(ch) {
      const prepared = await prepareReplay10xForChart(ch);
      return observePreparedReplay10x(prepared);
    }

    async function startReplay10x() {
      return startReplay10xForChart(chart());
    }

    function sendProductReplayPlayToPeers(speed, mode) {
      if (CONFIG.p4NoFanout) {
        return {
          ok: false,
          sent: [],
          payload: null,
          noFanoutControl: true,
          reason: 'P4 no-fan-out negative control neutered replayPlay peer sends'
        };
      }
      const mgr = manager();
      if (!mgr || typeof mgr.sendCommandNoReply !== 'function') {
        return { ok: false, reason: 'multichart manager missing sendCommandNoReply' };
      }
      const sent = [];
      const payload = {
        speed: Number.isFinite(Number(speed)) ? Number(speed) : 10,
        mode: typeof mode === 'string' && mode ? mode : 'candle'
      };
      for (const entry of chartWindows()) {
        if (entry.id === 'A') continue;
        try {
          mgr.sendCommandNoReply(entry.id, 'replayPlay', payload);
          sent.push(entry.id);
        } catch (_) {}
      }
      return { ok: sent.length >= 3, sent, payload };
    }

    function normalizeFourPanelReplayRows(runtimeRows) {
      return runtimeRows.map((row) => {
        if (row.ok !== true && !row.rs) return row;
        const state = row.afterState || replayStateForChart(row.ch);
        const computedAdvance = replayAdvance(row.beforeState, state);
        const evidenceAdvance = row.advanceEvidence || row.stickyAdvance || computedAdvance;
        const advanceContradiction = computedAdvance.contradiction === true;
        const advancedObserved = evidenceAdvance && evidenceAdvance.advanced === true;
        return {
          id: row.id,
          ok: row.ok === true
            && row.observedActive === true
            && state && state.isPlaying === true
            && advancedObserved
            && !advanceContradiction,
          requestedSpeed: 10,
          nearestSpeed: Number.isFinite(Number(row.rs && row.rs.speed)) ? Number(row.rs.speed) : row.nearestSpeed,
          method: row.method,
          activeObserved: row.observedActive === true,
          playingObserved: row.observedPlaying === true || (state && state.isPlaying === true),
          advancedObserved,
          indexDelta: evidenceAdvance && evidenceAdvance.indexDelta,
          timestampDelta: evidenceAdvance && evidenceAdvance.timestampDelta,
          advanceContradiction,
          advanceStartState: row.advanceStartState || null,
          advanceStartAt: row.advanceStartAt || null,
          advanceEndState: row.advanceEndState || state,
          advanceEndAt: row.advanceEndAt || null,
          advanceElapsedMs: evidenceAdvance && evidenceAdvance.elapsedMs,
          advanceEvidence: evidenceAdvance || null,
          productReplayPlayFanout: row.productReplayPlayFanout || null,
          p4ObserveBaselineRequired: row.p4ObserveBaselineRequired === true,
          p4ObserveBaselineCaptured: row.p4ObserveBaselineCaptured === true,
          beforeState: row.beforeState,
          state,
          computedAdvance
        };
      });
    }

    function fourPanelReplayResultFromRows(runtimeRows, extras = {}) {
      const normalizedRows = normalizeFourPanelReplayRows(runtimeRows);
      const topology = productTopologyEvidence();
      topology.windowIds = normalizedRows.map((row) => row.id);
      topology.windowDuplicateIds = duplicatePanelIds(topology.windowIds);
      topology.windowComplete = hasDistinctRequiredPanelIds(topology.windowIds);
      topology.selfConsistent = topology.managerGridConsistent === true
        && sameRequiredPanelSet(topology.gridIds, topology.windowIds)
        && sameRequiredPanelSet(topology.managerIds, topology.windowIds);
      const playingCount = normalizedRows.filter((row) => row.playingObserved === true && row.state && row.state.isPlaying).length;
      const advancedCount = normalizedRows.filter((row) => row.advancedObserved === true).length;
      const ok = topology.selfConsistent === true
        && normalizedRows.length >= 4
        && playingCount >= 4
        && advancedCount >= 4
        && normalizedRows.every((row) => row.ok === true);
      const armingFailure = ok ? null : [
        topology.selfConsistent === true ? null : 'topology did not expose distinct self-consistent A/B/C/D panels',
        playingCount >= 4 ? null : 'not every panel stayed playing',
        advancedCount >= 4 ? null : 'not every panel advanced by forward replay timestamp'
      ].filter(Boolean).join('; ');
      return {
        ok,
        panelCount: normalizedRows.length,
        playingCount,
        advancedCount,
        requestedSpeed: 10,
        armingFailure,
        topology,
        rows: normalizedRows,
        ...extras
      };
    }

    function currentRuntimeRowsFromReplayRows(rows) {
      const windowsById = new Map(chartWindows().map((entry) => [entry.id, entry]));
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const entry = windowsById.get(row.id);
        const ch = entry && entry.win && entry.win.chart;
        const rs = ch && ch.replaySystem;
        const afterState = replayStateForChart(ch);
        const advance = replayAdvance(row.beforeState, afterState);
        const now = Date.now();
        const requiresObserveBaseline = row.p4ObserveBaselineRequired === true;
        const advanceStartState = row.advanceStartState
          || (!requiresObserveBaseline && effectivelyPlayingForAdvance(afterState) ? afterState : null);
        const advanceStartAt = Number.isFinite(Number(row.advanceStartAt))
          ? Number(row.advanceStartAt)
          : (advanceStartState && !requiresObserveBaseline ? now : null);
        const advanceEvidence = advanceStartState && effectivelyPlayingForAdvance(afterState)
          ? replayAdvance(advanceStartState, afterState, {
            requirePlayingSamples: true,
            elapsedMs: now - advanceStartAt,
            speed: rs && rs.speed
          })
          : row.advanceEvidence || null;
        return {
          ...row,
          ch,
          rs,
          observedActive: row.activeObserved === true || !!(rs && rs.isActive),
          observedPlaying: row.playingObserved === true || afterState.isPlaying === true,
          afterState,
          advance,
          stickyAdvance: advanceEvidence && advanceEvidence.advanced ? advanceEvidence : null,
          advanceStartState,
          advanceStartAt,
          advanceEndState: afterState,
          advanceEndAt: now,
          advanceEvidence,
          p4ObserveBaselineRequired: requiresObserveBaseline,
          p4ObserveBaselineCaptured: row.p4ObserveBaselineCaptured === true || (requiresObserveBaseline && !!advanceStartState)
        };
      });
    }

    async function startFourPanelReplay10x() {
      const preparedRows = [];
      for (const entry of chartWindows()) {
        preparedRows.push({
          id: entry.id,
          ...(await prepareReplay10xForChart(entry.win && entry.win.chart))
        });
        await sleep(50);
      }
      const runtimeRows = preparedRows.map((row) => ({
        ...row,
        toggleState: { usedToggle: false },
        observedPlaying: false,
        observedActive: !!(row.rs && row.rs.isActive),
        afterState: replayStateForChart(row.ch),
        advance: replayAdvance(row.beforeState, replayStateForChart(row.ch)),
        stickyAdvance: null,
        advanceStartState: null,
        advanceStartAt: null,
        advanceEndState: null,
        advanceEndAt: null,
        advanceEvidence: null
      }));
      const started = Date.now();
      while (Date.now() - started < 6000) {
        const hostRow = runtimeRows.find((row) => row.id === 'A' && row.ok === true && row.rs);
        const hostMode = hostRow && hostRow.rs && typeof hostRow.rs.getPlaybackMode === 'function'
          ? hostRow.rs.getPlaybackMode()
          : 'candle';
        const fanout = sendProductReplayPlayToPeers(10, hostMode);
        for (const row of runtimeRows) {
          if (row.ok !== true || !row.rs) continue;
          if (row.id === 'A') attemptReplayStart(row.rs, row.toggleState);
          row.observedActive = row.observedActive || !!row.rs.isActive;
          row.afterState = replayStateForChart(row.ch);
          row.observedPlaying = row.observedPlaying || row.afterState.isPlaying === true;
          row.advance = replayAdvance(row.beforeState, row.afterState);
          const now = Date.now();
          if (effectivelyPlayingForAdvance(row.afterState)) {
            if (!row.advanceStartState) {
              row.advanceStartState = row.afterState;
              row.advanceStartAt = now;
            } else {
              row.advanceEndState = row.afterState;
              row.advanceEndAt = now;
              row.advanceEvidence = replayAdvance(row.advanceStartState, row.advanceEndState, {
                requirePlayingSamples: true,
                elapsedMs: row.advanceEndAt - row.advanceStartAt,
                speed: row.rs && row.rs.speed
              });
              if (row.advanceEvidence.advanced) row.stickyAdvance = row.advanceEvidence;
            }
          }
          row.productReplayPlayFanout = fanout;
        }
        if (runtimeRows.every((row) => row.ok !== true
          || (row.observedPlaying && row.advanceEvidence && row.advanceEvidence.advanced && row.afterState && row.afterState.isPlaying === true))) break;
        await sleep(50);
      }
      return fourPanelReplayResultFromRows(runtimeRows, {
        productPlayProtocol: 'host-replayPlay-fanout',
        noFanoutControl: CONFIG.p4NoFanout === true,
        noFanoutMutationApplied: CONFIG.p4NoFanout === true
      });
    }

    function markP4ObserveBaselines(replay4) {
      if (!replay4 || !Array.isArray(replay4.rows)) return replay4;
      const now = Date.now();
      const runtimeRows = currentRuntimeRowsFromReplayRows(replay4.rows).map((row) => {
        const state = replayStateForChart(row.ch);
        return {
          ...row,
          advanceStartState: effectivelyPlayingForAdvance(state) ? state : null,
          advanceStartAt: effectivelyPlayingForAdvance(state) ? now : null,
          advanceEndState: null,
          advanceEndAt: null,
          advanceEvidence: null,
          stickyAdvance: null,
          p4ObserveBaselineRequired: true,
          p4ObserveBaselineCaptured: effectivelyPlayingForAdvance(state)
        };
      });
      return fourPanelReplayResultFromRows(runtimeRows, {
        productPlayProtocol: replay4.productPlayProtocol || 'host-replayPlay-fanout',
        noFanoutControl: replay4.noFanoutControl === true,
        noFanoutMutationApplied: replay4.noFanoutMutationApplied === true,
        p4ObserveBaselineRequired: true
      });
    }

    function refreshFourPanelReplayObservation(replay4) {
      if (!replay4 || !Array.isArray(replay4.rows)) return replay4;
      return fourPanelReplayResultFromRows(currentRuntimeRowsFromReplayRows(replay4.rows), {
        productPlayProtocol: replay4.productPlayProtocol || 'host-replayPlay-fanout',
        observedAfterP4Window: true,
        noFanoutControl: replay4.noFanoutControl === true,
        noFanoutMutationApplied: replay4.noFanoutMutationApplied === true,
        p4ObserveBaselineRequired: replay4.p4ObserveBaselineRequired === true
      });
    }

    function pauseReplay() {
      const rs = replaySystem();
      if (!rs) return { ok: false, reason: 'replaySystem missing', state: replayState() };
      try {
        if (typeof rs.pause === 'function') rs.pause();
        else if (typeof rs.stop === 'function') rs.stop();
        else if (rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
      } catch (error) {
        return { ok: false, reason: String(error && error.message || error), state: replayState() };
      }
      return {
        ok: !rs.isPlaying,
        state: replayState(),
        mutantApplied: !!(harnessWindow() && harnessWindow().__PO_CPU_AB_PAUSE_MUTANT_APPLIED)
      };
    }

    function pauseAllReplay() {
      const rows = [];
      for (const entry of chartWindows()) {
        const ch = entry.win && entry.win.chart;
        const rs = ch && ch.replaySystem;
        if (!rs) {
          rows.push({ id: entry.id, ok: false, reason: 'replaySystem missing' });
          continue;
        }
        try {
          if (typeof rs.pause === 'function') rs.pause();
          else if (typeof rs.stop === 'function') rs.stop();
          else if (rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
          rows.push({ id: entry.id, ok: !rs.isPlaying, state: replayStateForChart(ch) });
        } catch (error) {
          rows.push({ id: entry.id, ok: false, reason: String(error && error.message || error), state: replayStateForChart(ch) });
        }
      }
      return { ok: rows.every((row) => row.ok), rows };
    }

    function setGridLayout(panelCount) {
      const win = harnessWindow();
      const grid = win.document.getElementById('grid');
      if (!grid) return;
      if (panelCount <= 1) {
        grid.style.gridTemplateColumns = 'repeat(1, 1fr)';
        grid.style.gridTemplateRows = 'repeat(1, 1fr)';
      } else if (panelCount === 2) {
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gridTemplateRows = 'repeat(1, 1fr)';
      } else {
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gridTemplateRows = 'repeat(2, 1fr)';
      }
    }

    async function expandToFourPanels() {
      const win = harnessWindow();
      const mgr = manager();
      if (!mgr || typeof mgr.addChart !== 'function') throw new Error('multichart manager missing addChart');
      setGridLayout(4);
      for (const id of PANEL_IDS) {
        if (mgr.charts && mgr.charts.has(id)) continue;
        let cell = win.document.querySelector('[data-cell="' + id + '"]');
        if (!cell) {
          cell = win.document.createElement('div');
          cell.className = 'cell';
          cell.setAttribute('data-cell', id);
          win.document.getElementById('grid').appendChild(cell);
        }
        mgr.addChart({ id, tf: '1m', fileId: 25 }, cell);
      }
      refreshHarnessTopology();
      if (win.__multichartGrid && typeof win.__multichartGrid.refreshFinestReplayCadence === 'function') {
        try { win.__multichartGrid.refreshFinestReplayCadence(); } catch (_) {}
      }
      await waitFor(() => {
        const windows = chartWindows();
        const windowIds = windows.map((entry) => entry.id);
        return windows.length >= 4
          && REQUIRED_PANEL_IDS.every((id) => windowIds.includes(id))
          && windows.every((entry) => entry.win && entry.win.chart && entry.win.chart.replaySystem
            && replayLifecycleReadyForChart(entry.win.chart) && probe(entry.win));
      },
        'four panels with probes',
        60000);
    }

    async function collapseToSingle() {
      const win = harnessWindow();
      const mgr = manager();
      if (!mgr || typeof mgr.removeChart !== 'function') throw new Error('multichart manager missing removeChart');
      pauseAllReplay();
      for (const id of PANEL_IDS) {
        if (mgr.charts && mgr.charts.has(id)) mgr.removeChart(id);
        try {
          const cell = win.document.querySelector('[data-cell="' + id + '"]');
          if (cell) cell.remove();
        } catch (_) {}
      }
      setGridLayout(1);
      await waitFor(() => chartWindows().length === 1, 'return to single chart', 30000);
      await forceGcBestEffort(win);
      await forceGcBestEffort(win);
    }

    function armPauseMutant() {
      if (!CONFIG.mutant) return null;
      return null;
    }

    const LAG_CONTENT_SPECS = [
      { type: 'sma', params: { period: 20 } },
      { type: 'ema', params: { period: 20 } },
      { type: 'wma', params: { period: 20 } }
    ];
    const LAG_BAR_INTERVAL_MS = 60000;

    function indicatorTypesOnChart(ch) {
      const active = ch && ch.indicators && Array.isArray(ch.indicators.active) ? ch.indicators.active : [];
      return active.map((row) => String(row && row.type || '').toLowerCase()).filter(Boolean);
    }

    function armContentOnChart(ch) {
      if (!ch || typeof ch.addIndicator !== 'function') {
        return { ok: false, reason: 'content-missing', types: [], detail: 'addIndicator unavailable' };
      }
      for (const spec of LAG_CONTENT_SPECS) {
        try {
          ch.addIndicator(spec.type, spec.params || {});
        } catch (error) {
          return {
            ok: false,
            reason: 'content-missing',
            types: indicatorTypesOnChart(ch),
            detail: String(error && error.message || error)
          };
        }
      }
      const types = indicatorTypesOnChart(ch);
      const ok = ['sma', 'ema', 'wma'].every((type) => types.includes(type));
      return { ok, reason: ok ? null : 'content-missing', types, detail: ok ? null : 'required MA types absent' };
    }

    function armContentOnWindows(entries) {
      const panels = [];
      for (const entry of entries) {
        const ch = entry.win && entry.win.chart ? entry.win.chart : (entry.id === 'A' ? chart() : null);
        const armed = armContentOnChart(ch);
        panels.push({ id: entry.id, ...armed });
      }
      const ok = panels.length > 0 && panels.every((row) => row.ok === true);
      return { ok, reason: ok ? null : 'content-missing', panels };
    }

    function lagPanelFromStates(id, beforeState, afterState, windowRow, observedMs) {
      const beforeIndex = Number(beforeState && beforeState.currentIndex);
      const afterIndex = Number(afterState && afterState.currentIndex);
      const indexDelta = Number.isFinite(beforeIndex) && Number.isFinite(afterIndex) ? afterIndex - beforeIndex : null;
      const speed = Number(afterState && afterState.speed);
      // No speed-10 vacuity: missing/non-positive speed leaves configured rate null.
      const resolvedSpeed = Number.isFinite(speed) && speed > 0 ? speed : null;
      const wallSec = Math.max(0.001, (Number(observedMs) || 1) / 1000);
      const achievedBarsPerSec = Number.isFinite(indexDelta) ? indexDelta / wallSec : null;
      const configuredBarsPerSec = resolvedSpeed != null
        ? (resolvedSpeed * 1000) / LAG_BAR_INTERVAL_MS
        : null;
      const throughputRatio = Number.isFinite(achievedBarsPerSec) && configuredBarsPerSec > 0
        ? achievedBarsPerSec / configuredBarsPerSec
        : null;
      const p50FrameMs = windowRow && Number.isFinite(Number(windowRow.p50FrameMs)) ? Number(windowRow.p50FrameMs) : null;
      const p95FrameMs = windowRow && Number.isFinite(Number(windowRow.p95FrameMs)) ? Number(windowRow.p95FrameMs) : null;
      const maxFrameMs = windowRow && Number.isFinite(Number(windowRow.maxFrameMs)) ? Number(windowRow.maxFrameMs) : null;
      const frameIntervalCount = windowRow && Number.isFinite(Number(windowRow.frameIntervalCount))
        ? Number(windowRow.frameIntervalCount)
        : 0;
      const longTaskCount = windowRow && Number.isFinite(Number(windowRow.longTaskCount)) ? Number(windowRow.longTaskCount) : null;
      const longTaskDurationMs = windowRow && Number.isFinite(Number(windowRow.longTaskDurationMs))
        ? Number(windowRow.longTaskDurationMs)
        : null;
      const longTaskPerSec = longTaskCount != null ? longTaskCount / wallSec : null;
      return {
        id,
        observedMs: Number(observedMs) || null,
        indexDelta,
        speed: resolvedSpeed,
        achievedBarsPerSec,
        configuredBarsPerSec,
        throughputRatio,
        frameIntervalCount,
        p50FrameMs,
        p95FrameMs,
        maxFrameMs,
        longTaskCount,
        longTaskDurationMs,
        longTaskPerSec
      };
    }

    function buildLagConfigCapture(label, panelIds, beforeById, afterById, phase) {
      const windowsById = new Map((phase && phase.probe && Array.isArray(phase.probe.windows) ? phase.probe.windows : [])
        .map((row) => [String(row.id), row]));
      const panels = panelIds.map((id) => lagPanelFromStates(
        id,
        beforeById[id],
        afterById[id],
        windowsById.get(id) || (panelIds.length === 1 ? phase : null),
        phase && phase.durationMs
      ));
      const throughputRatios = panels.map((row) => row.throughputRatio).filter((value) => Number.isFinite(value));
      const p95Values = panels.map((row) => row.p95FrameMs).filter((value) => Number.isFinite(value));
      const longTaskRates = panels.map((row) => row.longTaskPerSec).filter((value) => Number.isFinite(value));
      return {
        label,
        observedMs: phase && phase.durationMs || null,
        panels,
        medianThroughputRatio: percentile(throughputRatios, 0.5),
        medianP95FrameMs: percentile(p95Values, 0.5),
        medianLongTaskPerSec: percentile(longTaskRates, 0.5)
      };
    }

    function lagMechanismHint(throughputRetention, smoothnessRetention) {
      if (!Number.isFinite(throughputRetention) || !Number.isFinite(smoothnessRetention)) return 'ambiguous';
      if (throughputRetention + 0.08 < smoothnessRetention) return 'throughput';
      if (smoothnessRetention + 0.08 < throughputRetention) return 'smoothness';
      return 'ambiguous';
    }

    async function run() {
      const startedAt = new Date().toISOString();
      const phases = {};
      let replay4 = null;
      let replay10x = null;
      let pause = null;
      let mutantInterval = null;
      let lag = null;
      let heap = null;
      try {
        await waitFor(() => {
          const win = harnessWindow();
          return win && win.__harnessHostReady && !win.__harnessBootError
            && win.chart && Array.isArray(win.chart.data) && win.chart.data.length > 0
            && win.chart.replaySystem && replayLifecycleReadyForChart(win.chart) && probe();
        }, 'single chart harness with probe');

        await sleep(CONFIG.timings.p1SettleMs);
        phases.P1 = await collectPhase('P1-idle-single-chart', CONFIG.timings.p1ObserveMs);

        await sleep(CONFIG.timings.p2IdleMs);
        phases.P2 = await collectPhase('P2-idle-soak', CONFIG.timings.p2ObserveMs);

        const contentSingle = armContentOnWindows([{ id: 'A', win: harnessWindow() }]);
        const preparedSingle = await prepareReplay10xForChart(chart());
        const lagSingleToggle = { usedToggle: false };
        if (preparedSingle && preparedSingle.ok === true) {
          const armDeadline = Date.now() + 4000;
          while (Date.now() < armDeadline) {
            attemptReplayStart(preparedSingle.rs, lagSingleToggle);
            const armedState = replayStateForChart(chart());
            if (armedState.isPlaying === true || armedState.passivePlayActive === true) break;
            await sleep(50);
          }
        }
        // Snapshot immediately before the observe window so indexDelta matches wall time.
        const lagSingleBefore = { A: replayStateForChart(chart()) };
        phases.LAG_SINGLE = await collectPhase(
          'LAG-SINGLE-content-replay-10x-or-nearest',
          CONFIG.timings.lagSingleObserveMs || CONFIG.timings.p4ObserveMs
        );
        const lagSingleAfter = { A: replayStateForChart(chart()) };
        const lagSingleCapture = buildLagConfigCapture(
          'single',
          ['A'],
          lagSingleBefore,
          lagSingleAfter,
          phases.LAG_SINGLE
        );
        pauseAllReplay();

        const heapSingleBaseline = await memorySnapshotForced(harnessWindow());
        await expandToFourPanels();
        const contentFour = armContentOnWindows(chartWindows().filter((entry) => ['A', 'B', 'C', 'D'].includes(entry.id)));
        replay4 = await startFourPanelReplay10x();
        replay4 = markP4ObserveBaselines(replay4);
        const lagFourBefore = {};
        for (const row of (replay4 && Array.isArray(replay4.rows) ? replay4.rows : [])) {
          lagFourBefore[String(row.id)] = row.advanceStartState || row.beforeState || null;
        }
        phases.P4 = await collectPhase('P4-four-panel-replay-10x-or-nearest', CONFIG.timings.p4ObserveMs);
        replay4 = refreshFourPanelReplayObservation(replay4);
        const lagFourAfter = {};
        for (const row of (replay4 && Array.isArray(replay4.rows) ? replay4.rows : [])) {
          lagFourAfter[String(row.id)] = row.advanceEndState || row.state || null;
        }
        const lagFourCapture = buildLagConfigCapture(
          'four',
          ['A', 'B', 'C', 'D'],
          lagFourBefore,
          lagFourAfter,
          phases.P4
        );
        const throughputRetention = Number.isFinite(lagSingleCapture.medianThroughputRatio)
          && Number.isFinite(lagFourCapture.medianThroughputRatio)
          && lagSingleCapture.medianThroughputRatio > 0
          ? lagFourCapture.medianThroughputRatio / lagSingleCapture.medianThroughputRatio
          : null;
        const p95Retention = Number.isFinite(lagSingleCapture.medianP95FrameMs)
          && Number.isFinite(lagFourCapture.medianP95FrameMs)
          && lagFourCapture.medianP95FrameMs > 0
          ? lagSingleCapture.medianP95FrameMs / lagFourCapture.medianP95FrameMs
          : null;
        // FIX1 grades frame cadence. Shared process longtasks must not drive the ratio
        // or be credited as independent per-panel smoothness.
        const ltPanels = Array.isArray(lagFourCapture.panels) ? lagFourCapture.panels : [];
        const longTaskSharedAcrossPanels = ltPanels.length >= 2
          && Number(ltPanels[0] && ltPanels[0].longTaskCount) > 0
          && ltPanels.every((panel) => panel
            && Number(panel.longTaskCount) === Number(ltPanels[0].longTaskCount)
            && Number(panel.longTaskDurationMs) === Number(ltPanels[0].longTaskDurationMs));
        const longTaskRetention = !longTaskSharedAcrossPanels
          && Number.isFinite(lagSingleCapture.medianLongTaskPerSec)
          && Number.isFinite(lagFourCapture.medianLongTaskPerSec)
          && lagSingleCapture.medianLongTaskPerSec > 0
          && lagFourCapture.medianLongTaskPerSec > 0
          ? lagSingleCapture.medianLongTaskPerSec / lagFourCapture.medianLongTaskPerSec
          : null;
        // Smoothness retention is p95-only — never min(LT, p95).
        const smoothnessRetention = Number.isFinite(p95Retention) ? p95Retention : null;
        lagFourCapture.longTaskSharedAcrossPanels = longTaskSharedAcrossPanels;
        lagFourCapture.longTaskAttribution = longTaskSharedAcrossPanels
          ? 'host-shared'
          : (longTaskRetention != null ? 'per-panel' : 'absent');
        lag = {
          content: {
            single: contentSingle,
            four: contentFour,
            ok: contentSingle.ok === true && contentFour.ok === true
          },
          single: lagSingleCapture,
          four: lagFourCapture,
          ratios: {
            throughputRetention,
            smoothnessRetention,
            p95Retention,
            longTaskRetention,
            smoothnessSource: 'p95FrameMs',
            mechanismHint: lagMechanismHint(throughputRetention, smoothnessRetention)
          }
        };
        const heapFourPeak = await memorySnapshotForced(harnessWindow());
        await collapseToSingle();
        const heapPostCollapse = await memorySnapshotForced(harnessWindow());
        heap = {
          instrument: {
            metric: 'usedJSHeapSize',
            forcedGc: true,
            footprintNonGrading: true,
            note: 'Task Manager / process RSS must not grade M26 or FIX3'
          },
          singleBaseline: heapSingleBaseline,
          fourPeak: heapFourPeak,
          postCollapse: heapPostCollapse,
          expandDeltaBytes: heapFourPeak.exposed && heapSingleBaseline.exposed
            ? heapFourPeak.usedJSHeapSize - heapSingleBaseline.usedJSHeapSize
            : null,
          collapseReleaseBytes: heapFourPeak.exposed && heapPostCollapse.exposed
            ? heapFourPeak.usedJSHeapSize - heapPostCollapse.usedJSHeapSize
            : null,
          retentionBytes: heapPostCollapse.exposed && heapSingleBaseline.exposed
            ? heapPostCollapse.usedJSHeapSize - heapSingleBaseline.usedJSHeapSize
            : null
        };

        replay10x = await startReplay10x();
        phases.P6 = await collectPhase('P6-replay-10x-or-nearest', CONFIG.timings.p6ObserveMs);

        pause = pauseReplay();
        mutantInterval = armPauseMutant();
        await sleep(CONFIG.timings.p7SettleMs);
        phases.P7 = await collectPhase('P7-pause-return-to-floor', CONFIG.timings.p7ObserveMs);

        if (mutantInterval != null) {
          try { harnessWindow().clearInterval(mutantInterval); } catch (_) {}
        }

        await postReport({
          signature: CONFIG.signature,
          ok: true,
          startedAt,
          finishedAt: new Date().toISOString(),
          meta: {
            shortened: !!CONFIG.timings.shortened,
            timings: CONFIG.timings,
            mutant: !!CONFIG.mutant,
            p4NoFanout: !!CONFIG.p4NoFanout,
            harness: 'multichart serve.mjs single-chart host',
            memoryInstrument: 'usedJSHeapSize+forcedGc',
            observables: [
              'performance.now callback timing',
              'PerformanceObserver longtask',
              'rAF frame intervals',
              'replay index throughput',
              'performance.memory.usedJSHeapSize after forced GC (not Task Manager footprint)'
            ]
          },
          replay: { p4: replay4, p6: replay10x, p7: pause },
          lag,
          heap,
          phases,
          measures: performance.getEntriesByType('measure').slice(-12).map((m) => ({
            name: m.name,
            duration: m.duration
          }))
        });
      } catch (error) {
        if (mutantInterval != null) {
          try { harnessWindow().clearInterval(mutantInterval); } catch (_) {}
        }
        await postReport({
          signature: CONFIG.signature,
          ok: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          meta: { shortened: !!CONFIG.timings.shortened, timings: CONFIG.timings, mutant: !!CONFIG.mutant, p4NoFanout: !!CONFIG.p4NoFanout, memoryInstrument: 'usedJSHeapSize+forcedGc' },
          replay: { p4: replay4, p6: replay10x, p7: pause },
          heap,
          phases,
          error: String(error && error.message || error)
        });
      }
    }

    function postReport(report) {
      return fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
    }

    run();
  </script>
</body>
</html>`;
}

export function mutatePoCpuAbReplaySystemForPauseTeardownNC(body) {
  const needle = `    pause() {
        this._cancelDeferredPlayStart();`;
  const replacement = `    pause() {
        try { window.__PO_CPU_AB_PAUSE_MUTANT_APPLIED = true; } catch (_) {}
        return;
        this._cancelDeferredPlayStart();`;
  if (!body.includes(needle)) {
    throw new Error('replay-system.js pause() boundary not found for PO CPU A/B negative control');
  }
  return body.replace(needle, replacement);
}

async function proxyRequest({ harness, request, response, mutant = false }) {
  const sourceUrl = new URL(request.url || '/', harness.url);
  const upstream = await fetch(sourceUrl, {
    method: request.method,
    headers: { 'cache-control': 'no-store' },
  });
  let body = Buffer.from(await upstream.arrayBuffer());
  let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  if (contentType.includes('text/html')) {
    body = Buffer.from(injectProbeIntoHarnessHtml(body.toString('utf8')), 'utf8');
    contentType = 'text/html; charset=utf-8';
  } else if (mutant && sourceUrl.pathname.endsWith('/modules/replay-system.js')) {
    body = Buffer.from(mutatePoCpuAbReplaySystemForPauseTeardownNC(body.toString('utf8')), 'utf8');
    contentType = 'text/javascript; charset=utf-8';
  }
  response.writeHead(upstream.status, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

export async function startPoCpuAbBenchmarkServer({
  timings = DEFAULT_PHASE_TIMINGS,
  mutant = false,
  p4NoFanout = false,
  onReport,
} = {}) {
  const harness = await startHarnessServer(0);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === '/report') {
        const report = await readRequestJson(request);
        if (onReport) onReport(report);
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, 405, 'method not allowed');
        return;
      }
      if (url.pathname === '/' || url.pathname === '/po-cpu-ab-host.html') {
        send(response, 200, poCpuAbHostHtml({ timings, mutant, p4NoFanout }), 'text/html; charset=utf-8');
        return;
      }
      await proxyRequest({ harness, request, response, mutant });
    } catch (error) {
      jsonResponse(response, { error: String(error?.message || error) }, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        harness,
        close: async () => {
          await new Promise((r) => server.close(() => r()));
          await harness.close();
        },
      });
    });
  });
}

function phaseWorkRatio(phase) {
  if (!phase || !Number.isFinite(Number(phase.workRatio))) return Number.POSITIVE_INFINITY;
  return Number(phase.workRatio);
}

function phaseMemoryDelta(phase) {
  const delta = phase?.memory?.usedDeltaBytes;
  return Number.isFinite(Number(delta)) ? Number(delta) : null;
}

function phaseWindowsById(phase) {
  const rows = Array.isArray(phase?.probe?.windows) ? phase.probe.windows : [];
  const out = new Map();
  for (const row of rows) {
    const id = row?.id != null ? String(row.id) : '';
    if (id && !out.has(id)) out.set(id, row);
  }
  return out;
}

const REQUIRED_P4_PANEL_IDS = Object.freeze(['A', 'B', 'C', 'D']);
const PO_CPU_AB_P4_ADVANCE_RATE_CEILING_MULTIPLIER = 12;
const PO_CPU_AB_P4_MIN_TIMESTAMP_MS_PER_INDEX = 1000;
/** @deprecated absolute ±2 floor retained for analysis; W62l grades via relative epsilon + ceiling. */
export const PO_CPU_AB_P4_MIRROR_COMPONENT_SPREAD_TOLERANCE = 2;
/** Relative epsilon for near-shared mirror spreads (max-min vs component magnitude). */
export const PO_CPU_AB_P4_MIRROR_REL_EPSILON = 1e-4;
/** Absolute floor so tiny magnitudes still need near-exact equality. */
export const PO_CPU_AB_P4_MIRROR_ABS_FLOOR = 1;
/** Hard ceiling — mutants that widen tolerance to soft-pass 2ms staggers must fail pins. */
export const PO_CPU_AB_P4_MIRROR_ABS_CEILING = 8;

function finiteNumberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lagPanelThroughputEmitted(panel) {
  const indexDelta = finiteNumberOrNull(panel?.indexDelta);
  const speed = finiteNumberOrNull(panel?.speed);
  const configured = finiteNumberOrNull(panel?.configuredBarsPerSec);
  const expectedConfigured = speed != null && speed > 0 ? (speed * 1000) / PO_CPU_AB_LAG_BAR_INTERVAL_MS : null;
  return !!panel
    && indexDelta != null
    && indexDelta > 0
    && speed != null
    && speed > 0
    && configured != null
    && expectedConfigured != null
    && Math.abs(configured - expectedConfigured) <= 1e-9
    && finiteNumberOrNull(panel.achievedBarsPerSec) != null
    && finiteNumberOrNull(panel.throughputRatio) != null;
}

const REQUIRED_LAG_CONTENT_TYPES = Object.freeze(['sma', 'ema', 'wma']);

function lagContentPanelCovered(panel) {
  if (!panel || panel.ok !== true) return false;
  const types = Array.isArray(panel.types)
    ? panel.types.map((type) => String(type || '').toLowerCase()).filter(Boolean)
    : [];
  return REQUIRED_LAG_CONTENT_TYPES.every((type) => types.includes(type));
}

function lagContentCoverageOk(lag) {
  const singlePanels = Array.isArray(lag?.content?.single?.panels) ? lag.content.single.panels : [];
  const fourPanels = Array.isArray(lag?.content?.four?.panels) ? lag.content.four.panels : [];
  const singleA = singlePanels.find((row) => String(row?.id) === 'A') || singlePanels[0] || null;
  const fourRequired = ['A', 'B', 'C', 'D'].map((id) => fourPanels.find((row) => String(row?.id) === id) || null);
  return lagContentPanelCovered(singleA) && fourRequired.every((panel) => lagContentPanelCovered(panel));
}

export function mirrorSpreadTolerance(magnitude, {
  relEpsilon = PO_CPU_AB_P4_MIRROR_REL_EPSILON,
  absFloor = PO_CPU_AB_P4_MIRROR_ABS_FLOOR,
  absCeiling = PO_CPU_AB_P4_MIRROR_ABS_CEILING,
} = {}) {
  const mag = Math.max(1, Math.abs(Number(magnitude) || 0));
  return Math.min(absCeiling, Math.max(absFloor, relEpsilon * mag));
}

export function mirrorComponentNearShared(spread, magnitude, options) {
  if (!Number.isFinite(spread)) return false;
  return spread <= mirrorSpreadTolerance(magnitude, options);
}

function lagPanelSmoothnessEmitted(panel) {
  // Frame samples are mandatory — longtask-only payloads cannot mint smoothness.
  return !!panel
    && finiteNumberOrNull(panel.p95FrameMs) != null
    && finiteNumberOrNull(panel.longTaskCount) != null
    && Number(panel.frameIntervalCount) > 0;
}

/** True when A/B/C/D report identical long-task totals (host/process signal ×N). */
export function lagLongTaskSharedAcrossPanels(panels, { countTolerance = 0, durationToleranceMs = 0 } = {}) {
  const rows = (Array.isArray(panels) ? panels : [])
    .filter((panel) => panel && finiteNumberOrNull(panel.longTaskCount) != null);
  if (rows.length < 2) return false;
  const baseCount = Number(rows[0].longTaskCount);
  const baseDuration = finiteNumberOrNull(rows[0].longTaskDurationMs);
  if (!(baseCount > 0)) return false;
  return rows.every((panel) => {
    const count = Number(panel.longTaskCount);
    const duration = finiteNumberOrNull(panel.longTaskDurationMs);
    if (!Number.isFinite(count) || Math.abs(count - baseCount) > countTolerance) return false;
    if (baseDuration == null || duration == null) return baseDuration == null && duration == null;
    return Math.abs(duration - baseDuration) <= durationToleranceMs;
  });
}

export function lagMechanismHintFromRetentions(throughputRetention, smoothnessRetention, margin = PO_CPU_AB_LAG_MECHANISM_MARGIN) {
  if (!Number.isFinite(throughputRetention) || !Number.isFinite(smoothnessRetention)) return 'ambiguous';
  if (throughputRetention + margin < smoothnessRetention) return 'throughput';
  if (smoothnessRetention + margin < throughputRetention) return 'smoothness';
  return 'ambiguous';
}

function recomputeLagP95Retention(singlePanel, fourPanels) {
  const singleP95 = finiteNumberOrNull(singlePanel?.p95FrameMs);
  const fourP95Values = (Array.isArray(fourPanels) ? fourPanels : [])
    .map((panel) => finiteNumberOrNull(panel?.p95FrameMs))
    .filter((value) => value != null && value > 0);
  if (singleP95 == null || fourP95Values.length === 0) return null;
  const sorted = fourP95Values.slice().sort((a, b) => a - b);
  const medianFour = sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.5 * sorted.length) - 1))];
  if (!(medianFour > 0)) return null;
  return singleP95 / medianFour;
}

function recomputeLagThroughputRetention(singlePanel, fourPanels) {
  const singleRatio = finiteNumberOrNull(singlePanel?.throughputRatio);
  const fourRatios = (Array.isArray(fourPanels) ? fourPanels : [])
    .map((panel) => finiteNumberOrNull(panel?.throughputRatio))
    .filter((value) => value != null);
  if (!(singleRatio > 0) || fourRatios.length === 0) return null;
  const sorted = fourRatios.slice().sort((a, b) => a - b);
  const medianFour = sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.5 * sorted.length) - 1))];
  if (!(Number.isFinite(medianFour))) return null;
  return medianFour / singleRatio;
}

export function evaluateLagDualMetric(report, { sharedMirrorOnly = false } = {}) {
  const lag = report?.lag && typeof report.lag === 'object' ? report.lag : null;
  const contentFlagsOk = lag?.content?.ok === true
    && lag?.content?.single?.ok === true
    && lag?.content?.four?.ok === true;
  const contentTypesOk = lagContentCoverageOk(lag);
  const contentOk = contentFlagsOk && contentTypesOk;
  const singlePanels = Array.isArray(lag?.single?.panels) ? lag.single.panels : [];
  const fourPanels = Array.isArray(lag?.four?.panels) ? lag.four.panels : [];
  const singlePanel = singlePanels.find((row) => String(row?.id) === 'A') || singlePanels[0] || null;
  const fourRequired = ['A', 'B', 'C', 'D'].map((id) => fourPanels.find((row) => String(row?.id) === id) || null);
  const throughputSingleOk = lagPanelThroughputEmitted(singlePanel);
  const throughputFourEmitted = fourRequired.every((panel) => lagPanelThroughputEmitted(panel));
  // Four-panel lag credit is not independent when P4 grades sharedMirrorOnly.
  const p4HonestyOk = sharedMirrorOnly !== true;
  const throughputFourOk = throughputFourEmitted && p4HonestyOk;
  const smoothnessSingleOk = lagPanelSmoothnessEmitted(singlePanel);
  const framesFourOk = fourRequired.every((panel) => lagPanelSmoothnessEmitted(panel));
  const sharedLt = lagLongTaskSharedAcrossPanels(fourRequired);
  const reportedShared = lag?.four?.longTaskSharedAcrossPanels === true
    || lag?.four?.longTaskAttribution === 'host-shared';
  // Shared LT credited as independent per-panel smoothness is RED unless attributed.
  const sharedLtHonest = !sharedLt || reportedShared;
  const smoothnessFourOk = framesFourOk && sharedLtHonest && p4HonestyOk;
  const throughputRetentionReported = finiteNumberOrNull(lag?.ratios?.throughputRetention);
  const throughputRetentionRecomputed = recomputeLagThroughputRetention(singlePanel, fourRequired);
  const throughputRetentionMatch = throughputRetentionReported != null
    && throughputRetentionRecomputed != null
    && Math.abs(throughputRetentionReported - throughputRetentionRecomputed) <= 1e-9;
  const throughputRetention = throughputRetentionMatch ? throughputRetentionReported : null;
  const p95RetentionReported = finiteNumberOrNull(lag?.ratios?.p95Retention);
  const p95RetentionRecomputed = recomputeLagP95Retention(singlePanel, fourRequired);
  const p95RetentionMatch = p95RetentionReported != null
    && p95RetentionRecomputed != null
    && Math.abs(p95RetentionReported - p95RetentionRecomputed) <= 1e-9;
  const p95Retention = p95RetentionMatch ? p95RetentionReported : null;
  const smoothnessRetention = finiteNumberOrNull(lag?.ratios?.smoothnessRetention);
  const smoothnessSource = lag?.ratios?.smoothnessSource;
  // FIX1-facing smoothness ratio must be the frame p95 retention, never LT-only/min(LT,p95).
  const framePrimaryOk = smoothnessRetention != null
    && p95Retention != null
    && Math.abs(smoothnessRetention - p95Retention) <= 1e-9
    && (smoothnessSource == null || smoothnessSource === 'p95FrameMs');
  const ratiosOk = throughputRetention != null
    && smoothnessRetention != null
    && framePrimaryOk
    && p4HonestyOk;
  const hint = lag?.ratios?.mechanismHint;
  const hintOk = hint === 'throughput' || hint === 'smoothness' || hint === 'ambiguous';
  // Hint must be graded from frame-primary smoothness, not a contaminated LT blend.
  const recomputedHint = lagMechanismHintFromRetentions(throughputRetention, p95Retention);
  const hintConsistent = hintOk
    && hint === recomputedHint
    && (hint !== 'smoothness' || (p95Retention != null && framePrimaryOk));
  return {
    contentOk,
    contentTypesOk,
    throughputSingleOk,
    throughputFourOk,
    throughputFourEmitted,
    smoothnessSingleOk,
    smoothnessFourOk,
    framesFourOk,
    p4HonestyOk,
    sharedMirrorOnly: sharedMirrorOnly === true,
    sharedLongTaskAcrossPanels: sharedLt,
    sharedLongTaskHonest: sharedLtHonest,
    framePrimaryOk,
    ratiosOk,
    hintOk,
    hint,
    recomputedHint,
    hintConsistent,
    singlePanel,
    fourPanels: fourRequired,
    throughputRetention,
    throughputRetentionReported,
    throughputRetentionRecomputed,
    smoothnessRetention,
    p95Retention,
    p95RetentionReported,
    p95RetentionRecomputed,
  };
}

function uniquePanelIds(ids) {
  const out = [];
  for (const rawId of Array.isArray(ids) ? ids : []) {
    const id = rawId != null ? String(rawId) : '';
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function panelIdsHaveDistinctRequired(ids) {
  const raw = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
  const unique = uniquePanelIds(raw);
  return raw.length === unique.length && REQUIRED_P4_PANEL_IDS.every((id) => unique.includes(id));
}

function sameRequiredPanelIds(left, right) {
  const normalize = (ids) => uniquePanelIds(ids)
    .filter((id) => REQUIRED_P4_PANEL_IDS.includes(id))
    .sort()
    .join(',');
  const required = REQUIRED_P4_PANEL_IDS.slice().sort().join(',');
  return normalize(left) === required && normalize(left) === normalize(right);
}

function replayTimestampSourceChanged(beforeState, afterState) {
  const beforeSource = beforeState?.currentTimestampSource;
  const afterSource = afterState?.currentTimestampSource;
  return beforeState?.currentTimestamp != null
    && afterState?.currentTimestamp != null
    && beforeSource != null
    && afterSource != null
    && String(beforeSource) !== String(afterSource);
}

function effectivelyPlayingState(state) {
  if (!state || state.isPlaying !== true) return false;
  const hasRawFlag = Object.prototype.hasOwnProperty.call(state, 'rawIsPlaying');
  const hasPassiveFlag = Object.prototype.hasOwnProperty.call(state, 'passivePlayActive');
  if (hasRawFlag || hasPassiveFlag) {
    return state.rawIsPlaying === true || state.passivePlayActive === true;
  }
  return true;
}

function replaySpeedForRow(row, beforeState, afterState) {
  const candidates = [
    row?.nearestSpeed,
    row?.requestedSpeed,
    row?.advanceEvidence?.speed,
    beforeState?.speed,
    afterState?.speed,
  ];
  for (const candidate of candidates) {
    const speed = finiteNumberOrNull(candidate);
    if (speed != null && speed > 0) return speed;
  }
  return null;
}

function rowReplayAdvanceEvidence(row, { observeMs = null, requireObserveBaseline = false } = {}) {
  const indexDelta = finiteNumberOrNull(row?.indexDelta);
  const timestampDelta = finiteNumberOrNull(row?.timestampDelta);
  const sample = row?.advanceEvidence && typeof row.advanceEvidence === 'object'
    ? row.advanceEvidence
    : null;
  const sampleBeforeState = sample?.beforeState || sample?.startState || row?.advanceStartState || null;
  const sampleAfterState = sample?.afterState || sample?.endState || row?.advanceEndState || null;
  const oracleIndexDelta = sampleBeforeState?.currentIndex != null && sampleAfterState?.currentIndex != null
    ? finiteNumberOrNull(Number(sampleAfterState.currentIndex) - Number(sampleBeforeState.currentIndex))
    : null;
  const oracleTimestampDelta = sampleBeforeState?.currentTimestamp != null && sampleAfterState?.currentTimestamp != null
    ? finiteNumberOrNull(Number(sampleAfterState.currentTimestamp) - Number(sampleBeforeState.currentTimestamp))
    : null;
  const stateIndexDelta = row?.beforeState?.currentIndex != null && row?.state?.currentIndex != null
    ? finiteNumberOrNull(Number(row.state.currentIndex) - Number(row.beforeState.currentIndex))
    : null;
  const stateTimestampDelta = row?.beforeState?.currentTimestamp != null && row?.state?.currentTimestamp != null
    ? finiteNumberOrNull(Number(row.state.currentTimestamp) - Number(row.beforeState.currentTimestamp))
    : null;
  const sourceChanged = replayTimestampSourceChanged(row?.beforeState, row?.state);
  const contradicts = (idx, ts) => Number.isFinite(idx) && Number.isFinite(ts)
    && ((idx > 0 && ts <= 0) || (idx < 0 && ts > 0));
  const advanceContradiction = row?.advanceContradiction === true
    || sourceChanged
    || contradicts(indexDelta, timestampDelta)
    || contradicts(stateIndexDelta, stateTimestampDelta)
    || replayTimestampSourceChanged(sampleBeforeState, sampleAfterState);
  const samplesWhilePlaying = effectivelyPlayingState(sampleBeforeState) && effectivelyPlayingState(sampleAfterState);
  const elapsedMs = finiteNumberOrNull(sample?.elapsedMs ?? sample?.wallTimeDeltaMs ?? row?.advanceElapsedMs) ?? finiteNumberOrNull(observeMs);
  const speed = replaySpeedForRow(row, sampleBeforeState, sampleAfterState);
  const maxTimestampDelta = elapsedMs != null && speed != null
    ? elapsedMs * speed * PO_CPU_AB_P4_ADVANCE_RATE_CEILING_MULTIPLIER
    : null;
  const rateCoherent = maxTimestampDelta != null
    && Number.isFinite(oracleTimestampDelta)
    && oracleTimestampDelta <= maxTimestampDelta;
  const indexTimestampCoherent = Number.isFinite(oracleIndexDelta)
    && Number.isFinite(oracleTimestampDelta)
    && oracleIndexDelta > 0
    && oracleTimestampDelta > 0
    && oracleTimestampDelta >= oracleIndexDelta * PO_CPU_AB_P4_MIN_TIMESTAMP_MS_PER_INDEX;
  const forwardTimestamp = Number.isFinite(oracleTimestampDelta) && oracleTimestampDelta > 0;
  const observeBaselineRequired = requireObserveBaseline === true || row?.p4ObserveBaselineRequired === true;
  const observeBaselineOk = observeBaselineRequired
    ? row?.p4ObserveBaselineCaptured === true && !!sampleBeforeState
    : true;
  return {
    indexDelta,
    timestampDelta,
    oracleIndexDelta,
    oracleTimestampDelta,
    stateIndexDelta,
    stateTimestampDelta,
    sourceChanged,
    samplesWhilePlaying,
    elapsedMs,
    speed,
    maxTimestampDelta,
    rateCoherent,
    indexTimestampCoherent,
    observeBaselineRequired,
    observeBaselineOk,
    sampleBeforeState,
    sampleAfterState,
    advanceContradiction,
    advanced: forwardTimestamp
      && samplesWhilePlaying
      && observeBaselineOk
      && rateCoherent
      && indexTimestampCoherent
      && !advanceContradiction,
  };
}

function cell(name, pass, detail, extra = {}) {
  const status = extra.status || (pass === true ? 'GREEN' : 'RED');
  return {
    name,
    pass: pass === true,
    status,
    detail,
    ...extra,
  };
}

export function assertPoCpuAbBenchmarkReport(report, { mutant = false } = {}) {
  const cells = [];
  if (!report || typeof report !== 'object') {
    return [cell('PO-CPU-AB-REPORT-SHAPE', false, 'report must be object')];
  }
  const phases = report.phases || {};
  const required = ['P1', 'P2', 'P4', 'P6', 'P7'];
  const missing = required.filter((name) => !phases[name]);
  cells.push(cell(
    'PO-CPU-AB-PHASES-PRESENT',
    missing.length === 0 && report.signature === PO_CPU_AB_SIGNATURE,
    missing.length ? `missing phases: ${missing.join(', ')}` : 'P1/P2/P4/P6/P7 present with signature',
    { signature: report.signature },
  ));
  if (missing.length) return cells;

  const p1 = phases.P1;
  const p2 = phases.P2;
  const p4 = phases.P4;
  const p6 = phases.P6;
  const p7 = phases.P7;
  const p1Ratio = phaseWorkRatio(p1);
  const p2Ratio = phaseWorkRatio(p2);
  const p6Ratio = phaseWorkRatio(p6);
  const p7Ratio = phaseWorkRatio(p7);
  const floorRatio = Math.min(PO_CPU_AB_P7_IDLE_WORK_RATIO_MAX, p1Ratio * 2.5);
  const p2MaxRatio = Math.min(PO_CPU_AB_P2_IDLE_WORK_RATIO_MAX, p1Ratio * 3);
  const p2MemoryDelta = phaseMemoryDelta(p2);

  cells.push(cell(
    'P1-IDLE-SINGLE-CHART-OBSERVED',
    Number.isFinite(p1Ratio) && p1.durationMs > 0 && p1Ratio <= PO_CPU_AB_P1_IDLE_WORK_RATIO_MAX,
    `P1 workRatio=${Number.isFinite(p1Ratio) ? p1Ratio.toFixed(4) : 'n/a'} max=${PO_CPU_AB_P1_IDLE_WORK_RATIO_MAX.toFixed(4)}`,
    { phase: 'P1', workRatio: p1Ratio, maxRatio: PO_CPU_AB_P1_IDLE_WORK_RATIO_MAX },
  ));
  cells.push(cell(
    'P2-IDLE-STABLE-NO-UNBOUNDED-WORK',
    Number.isFinite(p2Ratio) && p2Ratio <= p2MaxRatio,
    `P2 workRatio=${Number.isFinite(p2Ratio) ? p2Ratio.toFixed(4) : 'n/a'} max=${p2MaxRatio.toFixed(4)} absoluteMax=${PO_CPU_AB_P2_IDLE_WORK_RATIO_MAX.toFixed(4)}`,
    { phase: 'P2', workRatio: p2Ratio, maxRatio: p2MaxRatio, absoluteMaxRatio: PO_CPU_AB_P2_IDLE_WORK_RATIO_MAX, p1Ratio, shortened: !!report.meta?.shortened },
  ));
  cells.push(cell(
    'P2-IDLE-MEMORY-NOT-GROWING',
    p2MemoryDelta == null || p2MemoryDelta <= 64 * 1024 * 1024,
    p2MemoryDelta == null
      ? 'performance.memory.usedJSHeapSize not exposed'
      : `usedJSHeapSize delta=${p2MemoryDelta} (forced-GC samples; Task Manager footprint non-grading)`,
    { phase: 'P2', usedDeltaBytes: p2MemoryDelta, metric: HEAP_METRIC_USED_JS_HEAP_SIZE },
  ));

  const heapSummary = summarizeCollapseHeap(report.heap);
  cells.push(cell(
    'HEAP-INSTRUMENT-USED-JS-HEAP',
    heapSummary.instrumentOk,
    heapSummary.instrumentOk
      ? 'usedJSHeapSize samples present after forced GC; footprint non-grading'
      : 'heap instrument missing usedJSHeapSize+forcedGc samples (cannot grade M26/FIX3)',
    {
      metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
      footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
      heap: report.heap || null,
      summary: heapSummary,
    },
  ));
  cells.push(cell(
    'HEAP-FORCED-GC-AVAILABLE',
    heapSummary.forcedGcAvailable === true,
    heapSummary.forcedGcAvailable
      ? 'window.gc available (--js-flags=--expose-gc)'
      : 'window.gc unavailable — launch with preciseMemory / --js-flags=--expose-gc',
    { forcedGcAvailable: heapSummary.forcedGcAvailable },
  ));
  const collapsePass = heapSummary.collapseStatus === 'GREEN';
  const collapseUnproven = heapSummary.collapseStatus === 'UNPROVEN';
  cells.push(cell(
    'M26-FIX3-COLLAPSE-HEAP-RELEASE',
    collapsePass,
    collapseUnproven
      ? `UNPROVEN: expandDelta=${heapSummary.expandDeltaBytes} < minExpand=${HEAP_COLLAPSE_MIN_EXPAND_BYTES} (cannot grade release)`
      : (collapsePass
        ? `heap release demonstrated release=${heapSummary.releaseBytes} retention=${heapSummary.retentionBytes}`
        : `heap residue after collapse release=${heapSummary.releaseBytes} retention=${heapSummary.retentionBytes} expand=${heapSummary.expandDeltaBytes}`),
    {
      status: heapSummary.collapseStatus,
      // UNPROVEN must not mint ship GREEN or false RED for M26/FIX3.
      blocking: !collapseUnproven,
      regrades: ['M26', 'FIX3'],
      expandDeltaBytes: heapSummary.expandDeltaBytes,
      releaseBytes: heapSummary.releaseBytes,
      retentionBytes: heapSummary.retentionBytes,
      releaseFraction: HEAP_COLLAPSE_RELEASE_FRACTION,
      retentionMaxBytes: HEAP_COLLAPSE_RETENTION_MAX_BYTES,
    },
  ));

  const replay4 = report.replay?.p4 || {};
  const p4WindowCount = Number(p4.probe?.windowCount) || 0;
  const p4Rows = Array.isArray(replay4.rows) ? replay4.rows : [];
  const p4PanelCount = p4Rows.length;
  const p4RowIds = p4Rows.map((row) => row?.id).filter((id) => id != null).map((id) => String(id));
  const p4RowsDistinctRequired = panelIdsHaveDistinctRequired(p4RowIds);
  const p4ObserveBaselineRequired = true;
  const p4RowAdvances = p4Rows.map((row) => rowReplayAdvanceEvidence(row, {
    observeMs: p4.durationMs,
    requireObserveBaseline: p4ObserveBaselineRequired,
  }));
  const p4ObserveBaselinesCaptured = replay4.p4ObserveBaselineRequired === true
    && p4Rows.length >= 4
    && p4Rows.every((row) => row?.p4ObserveBaselineRequired === true && row?.p4ObserveBaselineCaptured === true);
  const p4RowsEveryOk = p4Rows.length > 0 && p4Rows.every((row, index) => row.ok === true
    && row.advancedObserved === true
    && p4RowAdvances[index].advanced === true);
  const p4AdvancedCount = p4Rows.filter((row, index) => row.advancedObserved === true
    && p4RowAdvances[index].advanced === true).length;
  const p4PlayingCount = p4Rows.filter((row) => row.playingObserved === true && row.state?.isPlaying === true).length;
  const p4WorkById = phaseWindowsById(p4);
  const p4PeerWorkRows = ['B', 'C', 'D'].map((id) => {
    const row = p4WorkById.get(id) || null;
    const observedMs = Math.max(1, finiteNumberOrNull(row?.observedMs) ?? finiteNumberOrNull(row?.durationMs) ?? finiteNumberOrNull(p4.durationMs) ?? 1);
    const callbackBusyMs = finiteNumberOrNull(row?.callbackBusyMs);
    const callbackWorkRatio = callbackBusyMs != null ? callbackBusyMs / observedMs : null;
    const timerCallbacks = finiteNumberOrNull(row?.timerCallbacks);
    const minWorkRatio = Number.isFinite(p1Ratio) ? p1Ratio + PO_CPU_AB_P4_PEER_WORK_RATIO_MARGIN : null;
    return {
      id,
      present: !!row,
      callbackWorkRatio,
      callbackBusyMs,
      timerCallbacks,
      minWorkRatio,
      pass: !!row
        && minWorkRatio != null
        && callbackWorkRatio != null
        && callbackWorkRatio >= minWorkRatio
        && callbackBusyMs != null
        && callbackBusyMs > 0
        && timerCallbacks != null
        && timerCallbacks > 0,
    };
  });
  const p4PeerWorkOk = p4PeerWorkRows.every((row) => row.pass === true);
  const p4MirrorVectors = p4Rows.map((row, index) => {
    const advance = p4RowAdvances[index];
    const before = advance.sampleBeforeState;
    const after = advance.sampleAfterState;
    if (!advance.advanced || !before || !after) return null;
    return {
      id: row?.id != null ? String(row.id) : '',
      values: [
        advance.oracleIndexDelta,
        advance.oracleTimestampDelta,
        before.currentIndex,
        before.currentTimestamp,
        after.currentIndex,
        after.currentTimestamp,
      ].map((value) => finiteNumberOrNull(value)),
    };
  });
  const p4PeerMirrorVectors = ['B', 'C', 'D']
    .map((id) => p4MirrorVectors.find((vector) => vector?.id === id) || null);
  const mirrorComponentSpreads = (vectors, componentIndexes) => {
    if (!Array.isArray(vectors) || vectors.length === 0 || vectors.some((vector) => !vector)) return null;
    return componentIndexes.map((componentIndex) => {
      const values = vectors.map((vector) => vector.values[componentIndex]);
      if (values.some((value) => value == null)) return null;
      return Math.max(...values) - Math.min(...values);
    });
  };
  const spreadsWithinTolerance = (spreads) => Array.isArray(spreads)
    && spreads.length > 0
    && spreads.every((spread) => Number.isFinite(spread) && spread <= PO_CPU_AB_P4_MIRROR_COMPONENT_SPREAD_TOLERANCE);
  const mirrorComponentMagnitudes = (vectors, componentIndexes) => {
    if (!Array.isArray(vectors) || vectors.length === 0 || vectors.some((vector) => !vector)) return null;
    return componentIndexes.map((componentIndex) => {
      const values = vectors.map((vector) => Math.abs(Number(vector.values[componentIndex])));
      if (values.some((value) => !Number.isFinite(value))) return null;
      return Math.max(...values, 1);
    });
  };
  const spreadsNearSharedRelative = (spreads, magnitudes) => Array.isArray(spreads)
    && Array.isArray(magnitudes)
    && spreads.length > 0
    && spreads.length === magnitudes.length
    && spreads.every((spread, index) => mirrorComponentNearShared(spread, magnitudes[index]));
  const p4PeerDeltaSpreads = mirrorComponentSpreads(p4PeerMirrorVectors, [0, 1]);
  const p4PeerAbsoluteBaselineSpreads = mirrorComponentSpreads(p4PeerMirrorVectors, [2, 3, 4, 5]);
  const p4PeerDeltaMagnitudes = mirrorComponentMagnitudes(p4PeerMirrorVectors, [0, 1]);
  const p4PeerAbsoluteBaselineMagnitudes = mirrorComponentMagnitudes(p4PeerMirrorVectors, [2, 3, 4, 5]);
  // W62l: either fingerprint is sufficient (OR). Relative epsilon + absolute floor/ceiling.
  const p4PeerDeltasNearShared = spreadsNearSharedRelative(p4PeerDeltaSpreads, p4PeerDeltaMagnitudes);
  const p4PeerAbsoluteBaselinesNearShared = spreadsNearSharedRelative(
    p4PeerAbsoluteBaselineSpreads,
    p4PeerAbsoluteBaselineMagnitudes,
  );
  const p4SharedMirrorOnly = p4RowsDistinctRequired
    && p4Rows.length >= 4
    && (p4PeerDeltasNearShared || p4PeerAbsoluteBaselinesNearShared);
  const p4MirrorAnalysis = {
    peerIds: ['B', 'C', 'D'],
    rule: 'either-fingerprint',
    tolerance: PO_CPU_AB_P4_MIRROR_COMPONENT_SPREAD_TOLERANCE,
    relEpsilon: PO_CPU_AB_P4_MIRROR_REL_EPSILON,
    absFloor: PO_CPU_AB_P4_MIRROR_ABS_FLOOR,
    absCeiling: PO_CPU_AB_P4_MIRROR_ABS_CEILING,
    deltaSpreads: p4PeerDeltaSpreads,
    absoluteBaselineSpreads: p4PeerAbsoluteBaselineSpreads,
    deltaMagnitudes: p4PeerDeltaMagnitudes,
    absoluteBaselineMagnitudes: p4PeerAbsoluteBaselineMagnitudes,
    deltasNearShared: p4PeerDeltasNearShared,
    absoluteBaselinesNearShared: p4PeerAbsoluteBaselinesNearShared,
    // Legacy absolute±2 kept for analysis only; not the grading conjunction.
    legacyAbsoluteAndWouldMatch: spreadsWithinTolerance(p4PeerDeltaSpreads)
      && spreadsWithinTolerance(p4PeerAbsoluteBaselineSpreads),
  };
  const p4Topology = replay4.topology || {};
  const p4GridIds = Array.isArray(p4Topology.gridIds) ? p4Topology.gridIds.map((id) => String(id)) : [];
  const p4ManagerIds = Array.isArray(p4Topology.managerIds) ? p4Topology.managerIds.map((id) => String(id)) : [];
  const p4WindowIds = Array.isArray(p4Topology.windowIds) ? p4Topology.windowIds.map((id) => String(id)) : [];
  const p4TopologyOk = p4Topology.gridComplete === true
    && p4Topology.managerComplete === true
    && (p4Topology.selfConsistent === true || p4Topology.managerGridConsistent === true)
    && panelIdsHaveDistinctRequired(p4GridIds)
    && panelIdsHaveDistinctRequired(p4ManagerIds)
    && panelIdsHaveDistinctRequired(p4WindowIds.length ? p4WindowIds : p4RowIds)
    && sameRequiredPanelIds(p4GridIds, p4ManagerIds)
    && sameRequiredPanelIds(p4GridIds, p4WindowIds.length ? p4WindowIds : p4RowIds);
  const p4ReplayObserved = replay4.ok === true
    && p4TopologyOk
    && p4RowsEveryOk
    && p4RowsDistinctRequired
    && p4PanelCount >= 4
    && p4PlayingCount >= 4
    && p4AdvancedCount >= 4
    && p4WindowCount >= 4
    && p4PeerWorkOk
    && !p4SharedMirrorOnly
    && p4ObserveBaselinesCaptured
    && (Number(p4.timerCallbacks) > 0 || Number(p4.workMs) > 0);
  const p4ArmingDetail = replay4.armingFailure
    ? `${replay4.armingFailure}; `
    : '';
  const p4Cell = cell(
    'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED',
    p4ReplayObserved,
    `${p4ArmingDetail}panels=${p4PanelCount} playing=${p4PlayingCount} advanced=${p4AdvancedCount} probeWindows=${p4WindowCount} gridIds=${p4GridIds.length ? p4GridIds.join(',') : 'missing'} managerIds=${p4ManagerIds.length ? p4ManagerIds.join(',') : 'missing'} windowIds=${p4WindowIds.length ? p4WindowIds.join(',') : (p4RowIds.length ? p4RowIds.join(',') : 'missing')} peerWork=${p4PeerWorkOk ? 'ok' : 'missing-or-idle'} observeBaselines=${p4ObserveBaselinesCaptured ? 'captured' : 'missing'} sharedMirrorOnly=${p4SharedMirrorOnly} workRatio=${Number.isFinite(phaseWorkRatio(p4)) ? phaseWorkRatio(p4).toFixed(4) : 'n/a'}`,
    { phase: 'P4', replay: replay4, probeWindowCount: p4WindowCount, playingCount: p4PlayingCount, advancedCount: p4AdvancedCount, panelCount: p4PanelCount, rowsEveryOk: p4RowsEveryOk, rowsDistinctRequired: p4RowsDistinctRequired, topologyOk: p4TopologyOk, workRatio: phaseWorkRatio(p4), rowAdvances: p4RowAdvances, peerWorkOk: p4PeerWorkOk, peerWorkRows: p4PeerWorkRows, observeBaselinesCaptured: p4ObserveBaselinesCaptured, sharedMirrorOnly: p4SharedMirrorOnly, mirrorAnalysis: p4MirrorAnalysis },
  );
  cells.push(p4Cell);

  if (report.meta?.p4NoFanout || replay4.noFanoutControl === true) {
    const noFanoutRows = p4Rows.filter((row) => row?.productReplayPlayFanout?.noFanoutControl === true);
    const noFanoutPeerRows = noFanoutRows
      .map((row) => row?.id != null ? String(row.id) : '')
      .filter((id) => ['B', 'C', 'D'].includes(id));
    const mutationApplied = replay4.noFanoutControl === true
      && replay4.noFanoutMutationApplied === true
      && noFanoutPeerRows.length >= 3;
    const ncKilledP4 = mutationApplied && p4Cell.status === 'RED';
    cells.push(cell(
      'NC-P4-NO-FANOUT-MUST-RED',
      ncKilledP4,
      ncKilledP4
        ? 'neutered replayPlay fan-out made P4 RED'
        : 'neutered replayPlay fan-out did not prove P4 goes RED',
      { ncExpect: 'RED on P4 when replayPlay peer fan-out is neutered', mutationApplied, p4Status: p4Cell.status, peerWorkRows: p4PeerWorkRows, noFanoutPeerRows },
    ));
  }

  const replay = report.replay?.p6 || {};
  const p6ReplayStateOk = replay.ok === true
    && replay.activeObserved === true
    && replay.playingObserved === true
    && replay.state?.isActive === true
    && replay.state?.isPlaying === true;
  const p6SpeedKnown = replay.nearestSpeed != null && Number.isFinite(Number(replay.nearestSpeed));
  const p6IndexDelta = finiteNumberOrNull(replay.indexDelta);
  const p6TimestampDelta = finiteNumberOrNull(replay.timestampDelta);
  const p6StateIndexDelta = replay.beforeState?.currentIndex != null && replay.state?.currentIndex != null
    ? Number(replay.state.currentIndex) - Number(replay.beforeState.currentIndex)
    : null;
  const p6StateTimestampDelta = replay.beforeState?.currentTimestamp != null && replay.state?.currentTimestamp != null
    ? Number(replay.state.currentTimestamp) - Number(replay.beforeState.currentTimestamp)
    : null;
  const p6TimestampSourceChanged = replayTimestampSourceChanged(replay.beforeState, replay.state);
  const p6AdvanceContradiction = replay.advanceContradiction === true
    || p6TimestampSourceChanged
    || (Number.isFinite(p6IndexDelta) && Number.isFinite(p6TimestampDelta)
      && ((p6IndexDelta > 0 && p6TimestampDelta <= 0) || (p6IndexDelta < 0 && p6TimestampDelta > 0)))
    || (Number.isFinite(p6StateIndexDelta) && Number.isFinite(p6StateTimestampDelta)
      && ((p6StateIndexDelta > 0 && p6StateTimestampDelta <= 0) || (p6StateIndexDelta < 0 && p6StateTimestampDelta > 0)));
  const p6PlayheadAdvanced = replay.advancedObserved === true
    && !p6AdvanceContradiction
    && ((Number.isFinite(p6TimestampDelta) && p6TimestampDelta > 0)
      || (Number.isFinite(p6StateTimestampDelta) && p6StateTimestampDelta > 0));
  const p6WorkExceedsP1 = Number.isFinite(p6Ratio)
    && Number.isFinite(p1Ratio)
    && p6Ratio >= p1Ratio + PO_CPU_AB_P6_REPLAY_WORK_RATIO_MARGIN;
  const replayObserved = p6ReplayStateOk && p6SpeedKnown && p6PlayheadAdvanced && p6WorkExceedsP1;
  cells.push(cell(
    'P6-REPLAY-10X-OR-NEAREST-OBSERVED',
    replayObserved,
    `requested 10x; nearest=${replay.nearestSpeed ?? 'unknown'} via ${replay.method || 'unknown'}; playing=${replay.playingObserved === true}; advanced=${p6PlayheadAdvanced}; workDeltaVsP1=${Number.isFinite(p6Ratio) && Number.isFinite(p1Ratio) ? (p6Ratio - p1Ratio).toFixed(4) : 'n/a'}`,
    { phase: 'P6', replay, workRatio: p6Ratio, p1Ratio, workMargin: PO_CPU_AB_P6_REPLAY_WORK_RATIO_MARGIN, workExceedsP1: p6WorkExceedsP1, playheadAdvanced: p6PlayheadAdvanced, advanceContradiction: p6AdvanceContradiction, timestampSourceChanged: p6TimestampSourceChanged },
  ));

  const pause = report.replay?.p7 || {};
  const p7Paused = pause.ok === true && pause.state?.isPlaying !== true;
  cells.push(cell(
    'P7-PAUSE-STATE-NOT-PLAYING',
    p7Paused,
    `pause ok=${pause.ok === true}; isPlaying=${pause.state?.isPlaying === true}`,
    { phase: 'P7', pause },
  ));
  cells.push(cell(
    'P7-WORK-RETURNS-TO-P1-FLOOR',
    Number.isFinite(p7Ratio) && p7Ratio <= floorRatio,
    `P7 workRatio=${Number.isFinite(p7Ratio) ? p7Ratio.toFixed(4) : 'n/a'} floor=${floorRatio.toFixed(4)} absoluteMax=${PO_CPU_AB_P7_IDLE_WORK_RATIO_MAX.toFixed(4)}`,
    { phase: 'P7', workRatio: p7Ratio, floorRatio, absoluteMaxRatio: PO_CPU_AB_P7_IDLE_WORK_RATIO_MAX, p1Ratio },
  ));

  const lagEval = evaluateLagDualMetric(report, { sharedMirrorOnly: p4SharedMirrorOnly });
  cells.push(cell(
    'LAG-CONTENT-ARMED',
    lagEval.contentOk,
    lagEval.contentOk
      ? 'SMA/EMA/WMA period 20 armed on single and four-panel configs (types[] coverage)'
      : (lagEval.contentTypesOk === false
        ? 'content types[] missing sma/ema/wma coverage on single or four-panel panels'
        : 'content-missing on lag configs'),
    { lag: report.lag?.content || null, contentTypesOk: lagEval.contentTypesOk },
  ));
  cells.push(cell(
    'LAG-THROUGHPUT-SINGLE-EMITTED',
    lagEval.throughputSingleOk,
    lagEval.throughputSingleOk
      ? `A achieved/configured=${Number(lagEval.singlePanel.throughputRatio).toFixed(4)}`
      : 'single-panel achieved vs configured tick rate missing (requires forward indexDelta + real speed)',
    { panel: lagEval.singlePanel },
  ));
  cells.push(cell(
    'LAG-THROUGHPUT-FOUR-EMITTED',
    lagEval.throughputFourOk,
    lagEval.throughputFourOk
      ? `A/B/C/D throughput ratios emitted`
      : (!lagEval.p4HonestyOk
        ? 'P4 sharedMirrorOnly blocks independent four-panel lag throughput credit'
        : 'four-panel per-panel achieved vs configured tick rate missing (requires forward indexDelta + real speed)'),
    { panels: lagEval.fourPanels, p4HonestyOk: lagEval.p4HonestyOk, sharedMirrorOnly: lagEval.sharedMirrorOnly },
  ));
  cells.push(cell(
    'LAG-SMOOTHNESS-SINGLE-EMITTED',
    lagEval.smoothnessSingleOk,
    lagEval.smoothnessSingleOk
      ? `A p95FrameMs=${Number(lagEval.singlePanel.p95FrameMs).toFixed(2)} longTaskCount=${lagEval.singlePanel.longTaskCount}`
      : 'single-panel frame timing + long-task count missing',
    { panel: lagEval.singlePanel },
  ));
  cells.push(cell(
    'LAG-SMOOTHNESS-FOUR-EMITTED',
    lagEval.smoothnessFourOk,
    lagEval.smoothnessFourOk
      ? (lagEval.sharedLongTaskAcrossPanels
        ? 'A/B/C/D frame timing emitted; longTask host-shared (not per-panel credit)'
        : 'A/B/C/D frame timing + long-task counts emitted')
      : (!lagEval.p4HonestyOk
        ? 'P4 sharedMirrorOnly blocks independent four-panel lag smoothness credit'
        : (!lagEval.framesFourOk
          ? 'four-panel frame timing + long-task count missing'
          : 'shared long-task totals credited per panel without host-shared attribution')),
    {
      panels: lagEval.fourPanels,
      sharedLongTaskAcrossPanels: lagEval.sharedLongTaskAcrossPanels,
      sharedLongTaskHonest: lagEval.sharedLongTaskHonest,
      p4HonestyOk: lagEval.p4HonestyOk,
      sharedMirrorOnly: lagEval.sharedMirrorOnly,
    },
  ));
  cells.push(cell(
    'LAG-SINGLE-TO-FOUR-RATIO-EMITTED',
    lagEval.ratiosOk,
    lagEval.ratiosOk
      ? `throughputRetention=${lagEval.throughputRetention.toFixed(4)} smoothnessRetention=${lagEval.smoothnessRetention.toFixed(4)} (p95FrameMs)`
      : (!lagEval.p4HonestyOk
        ? 'P4 sharedMirrorOnly blocks independent single→four lag retention credit'
        : (lagEval.framePrimaryOk === false
          ? 'smoothnessRetention not frame-primary (p95FrameMs); host-longtask-only/contaminated ratio rejected'
          : 'single→four retentions missing or disagree with panel recompute')),
    {
      throughputRetention: lagEval.throughputRetention,
      throughputRetentionRecomputed: lagEval.throughputRetentionRecomputed,
      smoothnessRetention: lagEval.smoothnessRetention,
      p95Retention: lagEval.p95Retention,
      p95RetentionRecomputed: lagEval.p95RetentionRecomputed,
      framePrimaryOk: lagEval.framePrimaryOk,
      p4HonestyOk: lagEval.p4HonestyOk,
    },
  ));
  cells.push(cell(
    'LAG-MECHANISM-HINT-EMITTED',
    lagEval.hintOk && lagEval.hintConsistent && lagEval.p4HonestyOk,
    lagEval.hintOk && lagEval.hintConsistent && lagEval.p4HonestyOk
      ? `mechanismHint=${lagEval.hint} (throughput→FIX2, smoothness→FIX1 via p95FrameMs)`
      : (!lagEval.p4HonestyOk
        ? 'P4 sharedMirrorOnly blocks independent lag mechanismHint credit'
        : `mechanismHint missing, LT-contaminated, or inconsistent (got=${lagEval.hint}, recomputed=${lagEval.recomputedHint}, framePrimary=${lagEval.framePrimaryOk})`),
    {
      hint: lagEval.hint,
      recomputedHint: lagEval.recomputedHint,
      framePrimaryOk: lagEval.framePrimaryOk,
      p95Retention: lagEval.p95Retention,
      p4HonestyOk: lagEval.p4HonestyOk,
    },
  ));

  if (mutant || report.meta?.mutant) {
    const p7Cell = cells.find((row) => row.name === 'P7-WORK-RETURNS-TO-P1-FLOOR');
    const p7StateCell = cells.find((row) => row.name === 'P7-PAUSE-STATE-NOT-PLAYING');
    const mutationApplied = pause.mutantApplied === true;
    const ncKilledStateCell = mutationApplied && p7StateCell?.status === 'RED';
    cells.push(cell(
      'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED',
      ncKilledStateCell,
      ncKilledStateCell
        ? 'served replay-system.js pause reversal applied and made P7 state RED'
        : 'served replay-system.js pause reversal did not prove P7 state RED',
      { ncExpect: 'RED on served replay-system.js pause teardown reversal state cell', mutationApplied, p7WorkStatus: p7Cell?.status, p7StateStatus: p7StateCell?.status },
    ));
  }

  return cells;
}

export async function runPoCpuAbBenchmarkGate({
  timeoutMs = DEFAULT_PO_CPU_AB_TIMEOUT_MS,
  requireBrowser = false,
  short = false,
  timings,
  mutant = false,
  p4NoFanout = false,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const startedAt = new Date().toISOString();
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      status: requireBrowser ? 'RED' : PO_CPU_AB_STATUS_SKIP,
      signature: PO_CPU_AB_SIGNATURE,
      error: 'no Chromium-based browser found (Edge/Chrome)',
      report: null,
      cells: [],
      meta: { startedAt, browserPath: null, requireBrowser },
    };
  }

  let serverHandle;
  let resolveReport;
  const reportPromise = new Promise((resolve) => { resolveReport = resolve; });
  const resolvedTimings = phaseTimings({ short, timings });
  try {
    serverHandle = await startPoCpuAbBenchmarkServer({
      timings: resolvedTimings,
      mutant,
      p4NoFanout,
      onReport: resolveReport,
    });
    const url = `${serverHandle.url}/po-cpu-ab-host.html`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: mutant ? 'talaria-po-cpu-ab-mutant-' : 'talaria-po-cpu-ab-',
      preciseMemory: true,
    });
    const report = browserRun.report || null;
    if (!report || browserRun.timedOut) {
      return {
        ok: false,
        status: 'RED',
        signature: PO_CPU_AB_SIGNATURE,
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        cells: [],
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, timedOut: true, stderrTail: browserRun.stderrTail || '' },
      };
    }
    const cells = assertPoCpuAbBenchmarkReport(report, { mutant });
    const cellsOk = report.ok === true && cells.every((row) => row.blocking === false || row.pass === true);
    const shortened = resolvedTimings.shortened === true || report.meta?.shortened === true;
    const ok = cellsOk && !shortened;
    const status = cellsOk ? (shortened ? PO_CPU_AB_STATUS_SHORT : 'GREEN') : 'RED';
    return {
      ok,
      status,
      signature: PO_CPU_AB_SIGNATURE,
      error: ok ? null : (shortened && cellsOk
        ? 'shortened PO CPU A/B run is non-ship evidence'
        : (report.error || cells.filter((row) => row.pass === false).map((row) => `${row.name}: ${row.detail}`).join('; '))),
      report,
      cells,
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        browserPath,
        url,
        mutant,
        p4NoFanout,
        short: resolvedTimings.shortened,
        shortened,
        p2Override: resolvedTimings.p2Override === true,
        stderrTail: browserRun.stderrTail || ''
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: PO_CPU_AB_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      cells: [],
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, mutant, p4NoFanout },
    };
  } finally {
    if (serverHandle) await serverHandle.close().catch(() => {});
  }
}

export async function runPoCpuAbBenchmarkPreflight(options = {}) {
  const acceptance = await runPoCpuAbBenchmarkGate({ ...options, mutant: false });
  if (!acceptance.ok) {
    return {
      ok: false,
      status: acceptance.status,
      signature: PO_CPU_AB_SIGNATURE,
      acceptance,
      mutant: null,
      error: acceptance.error,
    };
  }
  const noFanout = await runPoCpuAbBenchmarkGate({ ...options, mutant: false, p4NoFanout: true });
  const noFanoutOk = noFanout.status === 'RED'
    && noFanout.cells.some((row) => row.name === 'NC-P4-NO-FANOUT-MUST-RED' && row.pass === true);
  if (!noFanoutOk) {
    return {
      ok: false,
      status: 'RED',
      signature: PO_CPU_AB_SIGNATURE,
      acceptance,
      noFanout,
      mutant: null,
      error: 'NC-P4-NO-FANOUT-MUST-RED did not prove P4 goes RED',
    };
  }
  const mutant = await runPoCpuAbBenchmarkGate({ ...options, mutant: true });
  const ncOk = mutant.status === 'RED'
    && mutant.cells.some((row) => row.name === 'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED' && row.pass === true);
  return {
    ok: ncOk,
    status: ncOk ? 'GREEN' : 'RED',
    signature: PO_CPU_AB_SIGNATURE,
    acceptance,
    noFanout,
    mutant,
    error: ncOk ? null : 'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED did not prove P7 goes RED',
  };
}
