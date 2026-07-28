import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  M6_REPLAY_LEAK_SIGNATURE,
  applyM6ReplayTeardownReversal,
  assertM6ReplayLeakCounts,
} from './lib/m6-replay-leak-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_SYSTEM_PATH = path.resolve(__dirname, '..', 'chart v 1.4', 'chart', 'modules', 'replay-system.js');

export const M6_REPLAY_LEAK_STATUS_SKIP = 'SKIP';
export const DEFAULT_M6_CYCLES = 5;
export const DEFAULT_M6_TIMEOUT_MS = 60_000;

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

function escapeHtmlAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function m6ReplayLeakHostHtml({ cycles = DEFAULT_M6_CYCLES } = {}) {
  const safeCycles = Math.max(1, Math.min(20, Number(cycles) || DEFAULT_M6_CYCLES));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>M6 replay leak live gate</title>
  <style>
    html, body, iframe { margin:0; width:100%; height:100%; border:0; background:#07080e; }
  </style>
</head>
<body>
  <iframe id="harness" src="/harness/host.html?panels=1&tf=1m&pair=same"></iframe>
  <script type="module">
    import {
      findM20Q6ReplaySystems,
      connectedIframeCount,
      isLiveM20Q6ReplaySystem
    } from '/m6-probe.mjs';

    const cycles = ${safeCycles};
    // Strong {frame, replay} pairs only. WeakRef / contentWindow-null prune
    // would hide detached panel documents (W55-class soft pass on the PO leak).
    const trackedPanels = [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function harnessWindow() {
      return document.getElementById('harness').contentWindow;
    }

    function snapshot(label) {
      const win = harnessWindow();
      const connectedLive = findM20Q6ReplaySystems(win).filter(isLiveM20Q6ReplaySystem);
      const seen = new WeakSet(connectedLive);
      const orphanLive = countTrackedLiveOrphans(seen);
      return {
        label,
        liveReplaySystems: connectedLive.length + orphanLive,
        connectedIframes: connectedIframeCount(win),
        detachedTrackedIframes: countDetachedLivePanels(),
        trackedIframes: trackedPanels.length,
        q6States: collectQ6States(win)
      };
    }

    function frameReplaySystem(frame) {
      try {
        return frame && frame.contentWindow && frame.contentWindow.chart && frame.contentWindow.chart.replaySystem;
      } catch (_) {
        return null;
      }
    }

    function trackPanel(frame, replay) {
      if (!frame || !replay) return;
      if (trackedPanels.some((entry) => entry.frame === frame || entry.replay === replay)) return;
      trackedPanels.push({ frame, replay });
    }

    function countTrackedLiveOrphans(seen) {
      let count = 0;
      for (const entry of trackedPanels) {
        const replay = entry && entry.replay;
        if (!replay || seen.has(replay)) continue;
        if (!isLiveM20Q6ReplaySystem(replay)) continue;
        seen.add(replay);
        count += 1;
      }
      return count;
    }

    function countDetachedLivePanels() {
      return trackedPanels.filter((entry) => {
        const frame = entry && entry.frame;
        const replay = entry && entry.replay;
        return frame && frame.isConnected === false && isLiveM20Q6ReplaySystem(replay);
      }).length;
    }

    function pruneDrainedPanels(win) {
      const current = (() => {
        try { return win.chart && win.chart.replaySystem; } catch (_) { return null; }
      })();
      for (let index = trackedPanels.length - 1; index >= 0; index -= 1) {
        const entry = trackedPanels[index];
        const replay = entry && entry.replay;
        if (!replay || replay === current || !isLiveM20Q6ReplaySystem(replay)) {
          trackedPanels.splice(index, 1);
        }
      }
    }

    function collectQ6States(win) {
      const states = [];
      const seen = new WeakSet();
      function add(rs, where) {
        if (!rs || typeof rs !== 'object' || seen.has(rs)) return;
        seen.add(rs);
        if (Object.prototype.hasOwnProperty.call(rs, '_m20Q6LifecycleState')) {
          states.push({ where, state: String(rs._m20Q6LifecycleState || '') });
        }
      }
      try { add(win.chart && win.chart.replaySystem, 'host'); } catch (_) {}
      try {
        const mgr = win.__harnessManager || win.__multichartManagerRef;
        if (mgr && mgr.charts) {
          mgr.charts.forEach((entry, id) => {
            try { add(entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart && entry.frame.contentWindow.chart.replaySystem, 'panel-' + id); } catch (_) {}
          });
        }
      } catch (_) {}
      return states;
    }

    async function waitFor(predicate, label, timeoutMs = 30000) {
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

    function manager() {
      const win = harnessWindow();
      return win.__harnessManager || win.__multichartManagerRef;
    }

    async function openPanelB() {
      const win = harnessWindow();
      const mgr = manager();
      if (!mgr || typeof mgr.addChart !== 'function') throw new Error('multichart manager missing addChart');
      let cell = win.document.querySelector('[data-cell="B"]');
      if (!cell) {
        cell = win.document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('data-cell', 'B');
        win.document.getElementById('grid').appendChild(cell);
      }
      try {
        win.document.getElementById('grid').style.gridTemplateColumns = 'repeat(2, 1fr)';
        win.document.getElementById('grid').style.gridTemplateRows = 'repeat(1, 1fr)';
      } catch (_) {}
      mgr.addChart({ id: 'B', tf: '1m', fileId: 25 }, cell);
      await waitFor(() => {
        const entry = manager().charts && manager().charts.get('B');
        return entry && entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart
          && entry.frame.contentWindow.chart.replaySystem
          && entry.frame.contentWindow.chart.replaySystem._m20Q6LifecycleState === 'active';
      }, 'panel B active replay system');
      try {
        const entry = manager().charts && manager().charts.get('B');
        trackPanel(entry && entry.frame, entry && entry.frame && frameReplaySystem(entry.frame));
      } catch (_) {}
      await sleep(250);
    }

    async function closePanelB() {
      const win = harnessWindow();
      const mgr = manager();
      if (!mgr || typeof mgr.removeChart !== 'function') throw new Error('multichart manager missing removeChart');
      try {
        const entry = mgr.charts && mgr.charts.get('B');
        trackPanel(entry && entry.frame, entry && entry.frame && frameReplaySystem(entry.frame));
      } catch (_) {}
      mgr.removeChart('B');
      try {
        const cell = win.document.querySelector('[data-cell="B"]');
        if (cell) cell.remove();
        win.document.getElementById('grid').style.gridTemplateColumns = 'repeat(1, 1fr)';
      } catch (_) {}
      await waitFor(() => !(manager().charts && manager().charts.has('B')), 'panel B removed');
      if (window.gc) { try { window.gc(); } catch (_) {} }
      if (win.gc) { try { win.gc(); } catch (_) {} }
      await sleep(750);
      pruneDrainedPanels(win);
    }

    async function run() {
      const startedAt = new Date().toISOString();
      try {
        await waitFor(() => {
          const win = harnessWindow();
          return win && win.__harnessManager && win.chart && win.chart.replaySystem
            && win.chart.replaySystem._m20Q6LifecycleState === 'active'
            && !win.__harnessBootError;
        }, 'single chart active replay system');
        await sleep(500);
        const baseline = snapshot('baseline');
        if (baseline.liveReplaySystems !== 1) {
          throw new Error('M20 Q6 replay lifecycle unavailable or not single-owner at baseline: live=' + baseline.liveReplaySystems);
        }
        const cycleSnapshots = [];
        for (let index = 0; index < cycles; index += 1) {
          await openPanelB();
          cycleSnapshots.push(snapshot('cycle-' + (index + 1) + '-open'));
          await closePanelB();
          cycleSnapshots.push(snapshot('cycle-' + (index + 1) + '-closed'));
        }
        await sleep(1000);
        const final = snapshot('final');
        await postReport({ ok: true, startedAt, finishedAt: new Date().toISOString(), cycles, baseline, final, cycleSnapshots });
      } catch (error) {
        await postReport({ ok: false, startedAt, finishedAt: new Date().toISOString(), cycles, error: String(error && error.message || error), baseline: safeSnapshot('baseline-error'), final: safeSnapshot('final-error') });
      }
    }

    function safeSnapshot(label) {
      try { return snapshot(label); } catch (_) { return null; }
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

async function proxyRequest({ harness, request, response, mutatedReplaySource }) {
  const sourceUrl = new URL(request.url || '/', harness.url);
  if (sourceUrl.pathname === '/chart/modules/replay-system.js' && mutatedReplaySource) {
    send(response, 200, mutatedReplaySource, 'text/javascript; charset=utf-8');
    return;
  }

  const upstream = await fetch(sourceUrl, {
    method: request.method,
    headers: { 'cache-control': 'no-store' },
  });
  const body = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

export async function startM6ReplayLeakServer({ mutant = false, cycles = DEFAULT_M6_CYCLES, onReport } = {}) {
  const harness = await startHarnessServer(0);
  const mutatedReplaySource = mutant
    ? applyM6ReplayTeardownReversal(fs.readFileSync(REPLAY_SYSTEM_PATH, 'utf8'))
    : null;

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
      if (url.pathname === '/' || url.pathname === '/m6-host.html') {
        send(response, 200, m6ReplayLeakHostHtml({ cycles }), 'text/html; charset=utf-8');
        return;
      }
      if (url.pathname === '/m6-probe.mjs') {
        send(response, 200, fs.readFileSync(path.join(__dirname, 'lib', 'm6-replay-leak-probe.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
        return;
      }
      await proxyRequest({ harness, request, response, mutatedReplaySource });
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
        mutant,
        harness,
        close: async () => {
          await new Promise((r) => server.close(() => r()));
          await harness.close();
        },
      });
    });
  });
}

function validateReport(report) {
  if (!report || typeof report !== 'object') return 'report must be object';
  if (typeof report.cycles !== 'number') return 'report.cycles must be number';
  if (!report.baseline || !report.final) return 'report must include baseline and final snapshots';
  return null;
}

export async function runM6ReplayLeakGate({
  cycles = DEFAULT_M6_CYCLES,
  timeoutMs = DEFAULT_M6_TIMEOUT_MS,
  requireBrowser = false,
  mutant = false,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const startedAt = new Date().toISOString();
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      status: requireBrowser ? 'RED' : M6_REPLAY_LEAK_STATUS_SKIP,
      signature: M6_REPLAY_LEAK_SIGNATURE,
      error: 'no Chromium-based browser found (Edge/Chrome)',
      report: null,
      cells: [],
      meta: { startedAt, browserPath: null, requireBrowser },
    };
  }

  let serverHandle;
  let resolveReport;
  const reportPromise = new Promise((resolve) => { resolveReport = resolve; });
  try {
    serverHandle = await startM6ReplayLeakServer({ cycles, mutant, onReport: resolveReport });
    const url = `${serverHandle.url}/m6-host.html`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: mutant ? 'talaria-m6-replay-mutant-' : 'talaria-m6-replay-',
    });
    const report = browserRun.report || null;
    if (!report || browserRun.timedOut) {
      return {
        ok: false,
        status: 'RED',
        signature: M6_REPLAY_LEAK_SIGNATURE,
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        cells: [],
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, timedOut: true, stderrTail: browserRun.stderrTail || '' },
      };
    }
    const shapeError = validateReport(report);
    if (shapeError) {
      return {
        ok: false,
        status: 'RED',
        signature: M6_REPLAY_LEAK_SIGNATURE,
        error: shapeError,
        report,
        cells: [],
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url },
      };
    }
    const cells = assertM6ReplayLeakCounts({ baseline: report.baseline, final: report.final, mutant });
    const ok = report.ok === true && cells.every((cell) => cell.pass === true);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: M6_REPLAY_LEAK_SIGNATURE,
      error: ok ? null : (report.error || cells.filter((cell) => cell.pass === false).map((cell) => `${cell.name}: ${cell.detail}`).join('; ')),
      report,
      cells,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, mutant, cycles, stderrTail: browserRun.stderrTail || '' },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: M6_REPLAY_LEAK_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      cells: [],
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, mutant, cycles },
    };
  } finally {
    if (serverHandle) await serverHandle.close().catch(() => {});
  }
}

export async function runM6ReplayLeakPreflight(options = {}) {
  const acceptance = await runM6ReplayLeakGate({ ...options, mutant: false });
  if (!acceptance.ok) {
    return { ok: false, status: acceptance.status, signature: M6_REPLAY_LEAK_SIGNATURE, acceptance, mutant: null };
  }
  const mutant = await runM6ReplayLeakGate({ ...options, mutant: true });
  const mutantOk = mutant.status === 'RED'
    && mutant.cells.some((cell) => cell.name === 'NC-M6-TEARDOWN-REVERSAL' && cell.pass === true);
  return {
    ok: mutantOk,
    status: mutantOk ? 'GREEN' : 'RED',
    signature: M6_REPLAY_LEAK_SIGNATURE,
    acceptance,
    mutant,
    error: mutantOk ? null : 'NC-M6-TEARDOWN-REVERSAL did not prove acceptance cells go RED',
  };
}

export function parseM6ReplayLeakArgs(argv = process.argv.slice(2)) {
  const options = { cycles: DEFAULT_M6_CYCLES, timeoutMs: DEFAULT_M6_TIMEOUT_MS, requireBrowser: false };
  for (const arg of argv) {
    if (arg === '--require-browser') options.requireBrowser = true;
    else if (arg === '--mutant') options.mutant = true;
    else if (arg === '--acceptance-only') options.acceptanceOnly = true;
    else if (arg.startsWith('--cycles=')) options.cycles = Number(arg.slice('--cycles='.length));
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.cycles) || options.cycles <= 0) throw new Error('invalid --cycles');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid --timeout-ms');
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result;
  try {
    const options = parseM6ReplayLeakArgs();
    result = options.acceptanceOnly || options.mutant
      ? await runM6ReplayLeakGate(options)
      : await runM6ReplayLeakPreflight(options);
  } catch (error) {
    result = { ok: false, status: 'RED', signature: M6_REPLAY_LEAK_SIGNATURE, error: String(error?.message || error) };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

