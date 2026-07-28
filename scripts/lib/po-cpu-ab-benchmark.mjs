import http from 'node:http';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startServer as startHarnessServer } from '../../chart v 1.4/chart/multichart-prod/harness/serve.mjs';

export const PO_CPU_AB_SIGNATURE = 'TALARIA_PO_CPU_AB_BENCHMARK_V1';
export const PO_CPU_AB_STATUS_SKIP = 'SKIP';
export const DEFAULT_PO_CPU_AB_TIMEOUT_MS = 300_000;

export const DEFAULT_PHASE_TIMINGS = Object.freeze({
  p1SettleMs: 10_000,
  p1ObserveMs: 30_000,
  p2IdleMs: 120_000,
  p2ObserveMs: 30_000,
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
    callbackBusyMs: 0,
    maxCallbackMs: 0,
    longTaskCount: 0,
    longTaskDurationMs: 0
  };
  function account(kind, startedAt) {
    var dt = Math.max(0, performance.now() - startedAt);
    state.callbackBusyMs += dt;
    state.maxCallbackMs = Math.max(state.maxCallbackMs, dt);
    if (kind === 'interval') state.intervalCallbacks += 1;
    else if (kind === 'timeout') state.timeoutCallbacks += 1;
    else if (kind === 'raf') state.rafCallbacks += 1;
  }
  function wrap(kind, fn) {
    if (typeof fn !== 'function') return fn;
    return function () {
      var startedAt = performance.now();
      try {
        return fn.apply(this, arguments);
      } finally {
        account(kind, startedAt);
      }
    };
  }
  window.setInterval = function (fn, delay) {
    return nativeSetInterval(wrap('interval', fn), delay);
  };
  window.setTimeout = function (fn, delay) {
    return nativeSetTimeout(wrap('timeout', fn), delay);
  };
  if (nativeRequestAnimationFrame) {
    window.requestAnimationFrame = function (fn) {
      return nativeRequestAnimationFrame(wrap('raf', fn));
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
      return {
        at: performance.now(),
        intervalCallbacks: state.intervalCallbacks,
        timeoutCallbacks: state.timeoutCallbacks,
        rafCallbacks: state.rafCallbacks,
        callbackBusyMs: state.callbackBusyMs,
        maxCallbackMs: state.maxCallbackMs,
        longTaskCount: state.longTaskCount,
        longTaskDurationMs: state.longTaskDurationMs,
        longTaskObserver: state.longTaskObserver
      };
    }
  };
})();`;
}

function injectProbeIntoHarnessHtml(body) {
  const needle = '<head>';
  const probeTag = `<script>${poCpuAbProbeScript()}</script>`;
  if (!body.includes(needle)) return `${probeTag}${body}`;
  return body.replace(needle, `${needle}\n${probeTag}`);
}

function phaseTimings({ short = false, timings = {} } = {}) {
  return { ...(short ? SHORT_PHASE_TIMINGS : DEFAULT_PHASE_TIMINGS), ...timings };
}

export function poCpuAbHostHtml({ timings = DEFAULT_PHASE_TIMINGS, mutant = false } = {}) {
  const configJson = JSON.stringify({ timings, mutant, signature: PO_CPU_AB_SIGNATURE });
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

    function probe() {
      const win = harnessWindow();
      return win && win.__poCpuAbProbe;
    }

    function memorySnapshot(win) {
      const mem = win && win.performance && win.performance.memory;
      if (!mem) return { exposed: false };
      return {
        exposed: true,
        usedJSHeapSize: Number(mem.usedJSHeapSize) || 0,
        totalJSHeapSize: Number(mem.totalJSHeapSize) || 0,
        jsHeapSizeLimit: Number(mem.jsHeapSizeLimit) || 0
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
      const observedMs = Math.max(1, durationMs);
      return {
        label,
        durationMs,
        observedMs,
        callbackBusyMs,
        longTaskDurationMs,
        workMs: callbackBusyMs + longTaskDurationMs,
        workRatio: (callbackBusyMs + longTaskDurationMs) / observedMs,
        intervalCallbacks,
        timeoutCallbacks,
        rafCallbacks,
        timerCallbacks: intervalCallbacks + timeoutCallbacks + rafCallbacks,
        longTaskCount,
        maxCallbackMs: Math.max(0, end.maxCallbackMs),
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

    async function collectPhase(label, durationMs) {
      const win = harnessWindow();
      const p = probe();
      if (!p || typeof p.snapshot !== 'function') throw new Error('PO CPU probe missing in harness window');
      performance.mark(label + ':start');
      const start = p.snapshot();
      const startMemory = memorySnapshot(win);
      await sleep(durationMs);
      const end = p.snapshot();
      const endMemory = memorySnapshot(win);
      performance.mark(label + ':end');
      performance.measure(label, label + ':start', label + ':end');
      return deltaMetrics(label, durationMs, start, end, startMemory, endMemory);
    }

    function replayState() {
      const rs = replaySystem();
      if (!rs) return { present: false };
      return {
        present: true,
        isActive: !!rs.isActive,
        isPlaying: !!rs.isPlaying,
        speed: Number(rs.speed),
        playbackMode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : String(rs.playbackMode || '')
      };
    }

    function ensureReplayActive() {
      const ch = chart();
      const rs = replaySystem();
      if (!ch || !rs) return { ok: false, reason: 'chart or replaySystem missing' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.goToReplayTimestamp === 'function' && Array.isArray(ch.data) && ch.data.length > 50) {
          const row = ch.data[Math.floor(ch.data.length * 0.2)];
          if (row && row.t != null) rs.goToReplayTimestamp(Number(row.t));
        } else if (typeof rs.seekTo === 'function' && Array.isArray(rs.fullRawData) && rs.fullRawData.length > 50) {
          rs.seekTo(Math.floor(rs.fullRawData.length * 0.2));
        }
      } catch (error) {
        return { ok: false, reason: 'activate/seek failed: ' + String(error && error.message || error) };
      }
      return { ok: !!rs.isActive, state: replayState() };
    }

    async function startReplay10x() {
      const active = ensureReplayActive();
      if (!active.ok) return { ok: false, requestedSpeed: 10, nearestSpeed: null, reason: active.reason, state: replayState() };
      const rs = replaySystem();
      let method = 'unavailable';
      try {
        if (typeof rs.setSpeed === 'function') {
          rs.setSpeed(10);
          method = 'setSpeed';
        } else if ('speed' in rs) {
          rs.speed = 10;
          method = 'speed-property';
        }
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        else if (!rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
      } catch (error) {
        return { ok: false, requestedSpeed: 10, nearestSpeed: Number(rs.speed) || null, method, reason: String(error && error.message || error), state: replayState() };
      }
      const started = Date.now();
      let observedPlaying = false;
      while (Date.now() - started < 4000) {
        observedPlaying = observedPlaying || !!rs.isPlaying;
        if (observedPlaying) break;
        await sleep(50);
      }
      return {
        ok: observedPlaying,
        requestedSpeed: 10,
        nearestSpeed: Number.isFinite(Number(rs.speed)) ? Number(rs.speed) : null,
        method,
        state: replayState()
      };
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
      return { ok: !rs.isPlaying, state: replayState() };
    }

    function armPauseMutant() {
      if (!CONFIG.mutant) return null;
      const win = harnessWindow();
      return win.setInterval(function poCpuAbPauseMutant() {
        const until = win.performance.now() + 80;
        while (win.performance.now() < until) {}
      }, 100);
    }

    async function run() {
      const startedAt = new Date().toISOString();
      const phases = {};
      let replay10x = null;
      let pause = null;
      let mutantInterval = null;
      try {
        await waitFor(() => {
          const win = harnessWindow();
          return win && win.__harnessHostReady && !win.__harnessBootError
            && win.chart && Array.isArray(win.chart.data) && win.chart.data.length > 0
            && win.chart.replaySystem && probe();
        }, 'single chart harness with probe');

        await sleep(CONFIG.timings.p1SettleMs);
        phases.P1 = await collectPhase('P1-idle-single-chart', CONFIG.timings.p1ObserveMs);

        await sleep(CONFIG.timings.p2IdleMs);
        phases.P2 = await collectPhase('P2-idle-soak', CONFIG.timings.p2ObserveMs);

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
            harness: 'multichart serve.mjs single-chart host',
            observables: ['performance.now callback timing', 'PerformanceObserver longtask', 'performance.memory when exposed']
          },
          replay: { p6: replay10x, p7: pause },
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
          meta: { shortened: !!CONFIG.timings.shortened, timings: CONFIG.timings, mutant: !!CONFIG.mutant },
          replay: { p6: replay10x, p7: pause },
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

async function proxyRequest({ harness, request, response }) {
  const sourceUrl = new URL(request.url || '/', harness.url);
  const upstream = await fetch(sourceUrl, {
    method: request.method,
    headers: { 'cache-control': 'no-store' },
  });
  let body = Buffer.from(await upstream.arrayBuffer());
  let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  if (sourceUrl.pathname === '/harness/host.html' && contentType.includes('text/html')) {
    body = Buffer.from(injectProbeIntoHarnessHtml(body.toString('utf8')), 'utf8');
    contentType = 'text/html; charset=utf-8';
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
        send(response, 200, poCpuAbHostHtml({ timings, mutant }), 'text/html; charset=utf-8');
        return;
      }
      await proxyRequest({ harness, request, response });
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

function cell(name, pass, detail, extra = {}) {
  return {
    name,
    pass: pass === true,
    status: pass === true ? 'GREEN' : 'RED',
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
  const required = ['P1', 'P2', 'P6', 'P7'];
  const missing = required.filter((name) => !phases[name]);
  cells.push(cell(
    'PO-CPU-AB-PHASES-PRESENT',
    missing.length === 0 && report.signature === PO_CPU_AB_SIGNATURE,
    missing.length ? `missing phases: ${missing.join(', ')}` : 'P1/P2/P6/P7 present with signature',
    { signature: report.signature },
  ));
  if (missing.length) return cells;

  const p1 = phases.P1;
  const p2 = phases.P2;
  const p6 = phases.P6;
  const p7 = phases.P7;
  const p1Ratio = phaseWorkRatio(p1);
  const p2Ratio = phaseWorkRatio(p2);
  const p7Ratio = phaseWorkRatio(p7);
  const floorRatio = Math.max(0.12, p1Ratio * 2.5);
  const p2MaxRatio = Math.max(0.14, p1Ratio * 3);
  const p2MemoryDelta = phaseMemoryDelta(p2);

  cells.push(cell(
    'P1-IDLE-SINGLE-CHART-OBSERVED',
    Number.isFinite(p1Ratio) && p1.durationMs > 0,
    `P1 workRatio=${Number.isFinite(p1Ratio) ? p1Ratio.toFixed(4) : 'n/a'}`,
    { phase: 'P1', workRatio: p1Ratio },
  ));
  cells.push(cell(
    'P2-IDLE-STABLE-NO-UNBOUNDED-WORK',
    Number.isFinite(p2Ratio) && p2Ratio <= p2MaxRatio,
    `P2 workRatio=${Number.isFinite(p2Ratio) ? p2Ratio.toFixed(4) : 'n/a'} max=${p2MaxRatio.toFixed(4)}`,
    { phase: 'P2', workRatio: p2Ratio, maxRatio: p2MaxRatio, shortened: !!report.meta?.shortened },
  ));
  cells.push(cell(
    'P2-IDLE-MEMORY-NOT-GROWING',
    p2MemoryDelta == null || p2MemoryDelta <= 64 * 1024 * 1024,
    p2MemoryDelta == null ? 'performance.memory not exposed' : `usedJSHeapSize delta=${p2MemoryDelta}`,
    { phase: 'P2', usedDeltaBytes: p2MemoryDelta },
  ));

  const replay = report.replay?.p6 || {};
  const replayObserved = replay.ok === true || Number(p6.timerCallbacks) > 0 || Number(p6.workMs) > 0;
  cells.push(cell(
    'P6-REPLAY-10X-OR-NEAREST-OBSERVED',
    replayObserved,
    replay.nearestSpeed === 10
      ? '10x replay observed'
      : `requested 10x; nearest=${replay.nearestSpeed ?? 'unknown'} via ${replay.method || 'unknown'}`,
    { phase: 'P6', replay, workRatio: phaseWorkRatio(p6) },
  ));

  const pause = report.replay?.p7 || {};
  const p7Paused = pause.ok !== false && pause.state?.isPlaying !== true;
  cells.push(cell(
    'P7-PAUSE-STATE-NOT-PLAYING',
    p7Paused,
    `pause ok=${pause.ok !== false}; isPlaying=${pause.state?.isPlaying === true}`,
    { phase: 'P7', pause },
  ));
  cells.push(cell(
    'P7-WORK-RETURNS-TO-P1-FLOOR',
    Number.isFinite(p7Ratio) && p7Ratio <= floorRatio,
    `P7 workRatio=${Number.isFinite(p7Ratio) ? p7Ratio.toFixed(4) : 'n/a'} floor=${floorRatio.toFixed(4)}`,
    { phase: 'P7', workRatio: p7Ratio, floorRatio, p1Ratio },
  ));

  if (mutant || report.meta?.mutant) {
    const p7Cell = cells.find((row) => row.name === 'P7-WORK-RETURNS-TO-P1-FLOOR');
    cells.push(cell(
      'NC-P7-SPINNING-INTERVAL-MUST-RED',
      p7Cell?.status === 'RED',
      p7Cell?.status === 'RED'
        ? 'pause mutant kept work above floor and P7 went RED'
        : 'pause mutant did not force P7 RED',
      { ncExpect: 'RED on setInterval spin after pause' },
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
      onReport: resolveReport,
    });
    const url = `${serverHandle.url}/po-cpu-ab-host.html`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: mutant ? 'talaria-po-cpu-ab-mutant-' : 'talaria-po-cpu-ab-',
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
    const ok = report.ok === true && cells.every((row) => row.pass === true);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: PO_CPU_AB_SIGNATURE,
      error: ok ? null : (report.error || cells.filter((row) => row.pass === false).map((row) => `${row.name}: ${row.detail}`).join('; ')),
      report,
      cells,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, mutant, short: resolvedTimings.shortened, stderrTail: browserRun.stderrTail || '' },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: PO_CPU_AB_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      cells: [],
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, mutant },
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
  const mutant = await runPoCpuAbBenchmarkGate({ ...options, mutant: true });
  const ncOk = mutant.status === 'RED'
    && mutant.cells.some((row) => row.name === 'NC-P7-SPINNING-INTERVAL-MUST-RED' && row.pass === true);
  return {
    ok: ncOk,
    status: ncOk ? 'GREEN' : 'RED',
    signature: PO_CPU_AB_SIGNATURE,
    acceptance,
    mutant,
    error: ncOk ? null : 'NC-P7-SPINNING-INTERVAL-MUST-RED did not prove P7 goes RED',
  };
}
