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
  aggregateM6SchedulingCensus,
  installM6SchedulingCensus,
  summarizeM6SchedulingCensus,
} from './lib/m6-replay-leak-probe.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_SYSTEM_PATH = path.resolve(__dirname, '..', 'chart v 1.4', 'chart', 'modules', 'replay-system.js');

export const M6_REPLAY_LEAK_STATUS_SKIP = 'SKIP';
export const DEFAULT_M6_CYCLES = 5;
export const DEFAULT_M6_TIMEOUT_MS = 240_000;
export const M6_SCHEDULER_SOAK_MS = 60_000;
export const M6_PANEL_IDS = ['B', 'C', 'D'];
export const M6_PO_INDICATORS = [
  ['sma', { period: 20 }],
  ['ema', { period: 50 }],
  ['rsi', { period: 14 }],
  ['macd', { fast: 12, slow: 26, signal: 9 }],
];

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

export function m6ReplayLeakHostHtml({ cycles = DEFAULT_M6_CYCLES, schedulerOrphanInterval = false } = {}) {
  const safeCycles = Math.max(1, Math.min(20, Number(cycles) || DEFAULT_M6_CYCLES));
  const indicatorJson = JSON.stringify(M6_PO_INDICATORS);
  const panelIdsJson = JSON.stringify(M6_PANEL_IDS);
  const schedulerOrphanIntervalJson = JSON.stringify(!!schedulerOrphanInterval);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>M6 replay leak PO-workload gate</title>
  <style>
    html, body, iframe { margin:0; width:100%; height:100%; border:0; background:#07080e; }
  </style>
</head>
<body>
  <iframe id="harness" src="/harness/host.html?panels=4&tf=1m&pair=same&hostFile=25"></iframe>
  <script type="module">
    import {
      findM20Q6ReplaySystems,
      connectedIframeCount,
      isLiveM20Q6ReplaySystem,
      aggregateM6SchedulingCensus,
      installM6SchedulingCensus,
      summarizeM6SchedulingCensus
    } from '/m6-probe.mjs';

    const cycles = ${safeCycles};
    const PANEL_IDS = ${panelIdsJson};
    const INDICATORS = ${indicatorJson};
    const SCHEDULER_ORPHAN_INTERVAL = ${schedulerOrphanIntervalJson};
    // Strong {frame, replay} pairs only. WeakRef / contentWindow-null prune
    // would hide detached panel documents (W55-class soft pass on the PO leak).
    const trackedPanels = [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function harnessWindow() {
      return document.getElementById('harness').contentWindow;
    }

    function installHarnessCensus() {
      installM6SchedulingCensus(harnessWindow(), 'A-harness');
    }

    function installAllSchedulingCensus() {
      installHarnessCensus();
      for (const entry of chartWindows()) {
        installM6SchedulingCensus(entry.win, entry.id === 'A' ? 'A-harness' : 'panel-' + entry.id);
      }
    }

    function collectSchedulingCensus() {
      const rows = [];
      for (const entry of chartWindows()) {
        rows.push(summarizeM6SchedulingCensus(entry.win, entry.id === 'A' ? 'A-harness' : 'panel-' + entry.id));
      }
      return {
        rows,
        totals: aggregateM6SchedulingCensus(rows)
      };
    }

    function installSchedulerOrphanInterval() {
      if (!SCHEDULER_ORPHAN_INTERVAL) return null;
      const win = harnessWindow();
      installM6SchedulingCensus(win, 'A-harness');
      if (win.__talariaM6SchedulerOrphanInterval) {
        return { installed: true, reused: true };
      }
      win.__talariaM6SchedulerOrphanInterval = win.setInterval(() => {}, 30000);
      return { installed: true, reused: false };
    }

    function snapshot(label) {
      const win = harnessWindow();
      installAllSchedulingCensus();
      const connectedLive = findM20Q6ReplaySystems(win).filter(isLiveM20Q6ReplaySystem);
      const seen = new WeakSet(connectedLive);
      const orphanLive = countTrackedLiveOrphans(seen);
      return {
        label,
        liveReplaySystems: connectedLive.length + orphanLive,
        connectedIframes: connectedIframeCount(win),
        detachedTrackedIframes: countDetachedLivePanels(),
        trackedIframes: trackedPanels.length,
        q6States: collectQ6States(win),
        replayPlaying: collectReplayPlaying(win),
        panelCount: countManagedPanels(win),
        schedulingCensus: collectSchedulingCensus()
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

    function collectReplayPlaying(win) {
      const out = [];
      function push(rs, where) {
        if (!rs) return;
        out.push({ where, isActive: !!rs.isActive, isPlaying: !!rs.isPlaying });
      }
      try { push(win.chart && win.chart.replaySystem, 'host'); } catch (_) {}
      try {
        const mgr = win.__harnessManager || win.__multichartManagerRef;
        if (mgr && mgr.charts) {
          mgr.charts.forEach((entry, id) => {
            try {
              push(entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart && entry.frame.contentWindow.chart.replaySystem, 'panel-' + id);
            } catch (_) {}
          });
        }
      } catch (_) {}
      return out;
    }

    function countManagedPanels(win) {
      try {
        const mgr = win.__harnessManager || win.__multichartManagerRef;
        return mgr && mgr.charts ? mgr.charts.size : 0;
      } catch (_) {
        return 0;
      }
    }

    async function waitFor(predicate, label, timeoutMs = 45000) {
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

    function chartWindows() {
      const win = harnessWindow();
      const out = [{ id: 'A', win }];
      const mgr = manager();
      if (mgr && mgr.charts) {
        for (const id of PANEL_IDS) {
          const entry = mgr.charts.get(id);
          try {
            if (entry && entry.frame && entry.frame.contentWindow) {
              out.push({ id, win: entry.frame.contentWindow, frame: entry.frame });
            }
          } catch (_) {}
        }
      }
      return out;
    }

    function trackAllManagedPanels() {
      const mgr = manager();
      if (!mgr || !mgr.charts) return;
      for (const id of PANEL_IDS) {
        const entry = mgr.charts.get(id);
        if (!entry || !entry.frame) continue;
        trackPanel(entry.frame, frameReplaySystem(entry.frame));
      }
    }

    function armIndicators(chart) {
      const added = [];
      if (!chart || typeof chart.addIndicator !== 'function') {
        return { ok: false, reason: 'addIndicator missing', added };
      }
      for (const [type, params] of INDICATORS) {
        try {
          const ind = chart.addIndicator(type, params);
          added.push({ type, id: ind && ind.id || null, ok: true });
        } catch (error) {
          added.push({ type, id: null, ok: false, error: String(error && error.message || error) });
        }
      }
      const active = (chart.indicators && chart.indicators.active) || [];
      const ok = added.filter((row) => row.ok).length >= 3 && active.length >= 3;
      return { ok, added, activeCount: active.length };
    }

    function ensureReplayActive(chart) {
      const rs = chart && chart.replaySystem;
      if (!rs) return { ok: false, reason: 'no replaySystem' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
      } catch (error) {
        return { ok: false, reason: 'enterReplayMode failed: ' + String(error && error.message || error) };
      }
      return { ok: !!rs.isActive, isActive: !!rs.isActive };
    }

    async function startReplayPlaying(chart) {
      const rs = chart && chart.replaySystem;
      if (!rs || !rs.isActive) return { ok: false, reason: 'replay not active' };
      try {
        // Seek off session end so play() is not a no-op.
        if (typeof rs.goToReplayTimestamp === 'function' && Array.isArray(chart.data) && chart.data.length > 50) {
          const mid = chart.data[Math.floor(chart.data.length * 0.2)];
          if (mid && mid.t != null) rs.goToReplayTimestamp(Number(mid.t));
        }
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        else if (!rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
      } catch (error) {
        return { ok: false, reason: 'play failed: ' + String(error && error.message || error) };
      }
      // play() arms isPlaying on a double-rAF; wait for the real flag.
      const started = Date.now();
      while (Date.now() - started < 3000) {
        if (rs.isPlaying) return { ok: true, isPlaying: true };
        await sleep(50);
      }
      return { ok: !!rs.isPlaying, isPlaying: !!rs.isPlaying };
    }

    function placeHostOrder(hostWin) {
      try { hostWin.alert = () => {}; } catch (_) {}
      const chart = hostWin.chart;
      const om = chart && (chart.orderManager || hostWin.orderManager);
      const service = om && om.orderService;
      const candle = chart && Array.isArray(chart.data) && chart.data.length
        ? chart.data[chart.data.length - 1]
        : null;
      const price = candle && Number(candle.c);
      if (!service || typeof service.submitOrder !== 'function' || !Number.isFinite(price)) {
        return { ok: false, reason: 'orderService.submitOrder unavailable', openCount: 0 };
      }
      // Real placed market order via the product order service (PO session had an order).
      const submitted = service.submitOrder({
        orderType: 'market',
        direction: 'BUY',
        side: 'BUY',
        quantity: 1,
        entryPrice: price,
        timestamp: candle && candle.t != null ? Number(candle.t) : Date.now(),
        stopLoss: price * 0.99,
        takeProfit: price * 1.01,
      });
      const openCount = Array.isArray(service.openPositions) ? service.openPositions.length
        : (Array.isArray(service.orders) ? service.orders.length : 0);
      return {
        ok: !!(submitted && submitted.id) || openCount > 0,
        result: submitted ? { id: submitted.id, status: submitted.status } : null,
        openCount,
        via: 'orderService.submitOrder'
      };
    }

    async function armPoWorkload() {
      const win = harnessWindow();
      try { win.alert = () => {}; } catch (_) {}
      const perPanel = [];
      for (const entry of chartWindows()) {
        const chart = entry.win.chart;
        await waitFor(() => {
          return chart && Array.isArray(chart.data) && chart.data.length > 0
            && chart.replaySystem
            && chart.replaySystem._m20Q6LifecycleState === 'active';
        }, 'panel ' + entry.id + ' chart+replay ready', 60000);
        const replay = ensureReplayActive(chart);
        const indicators = armIndicators(chart);
        perPanel.push({
          id: entry.id,
          replay,
          indicators,
          indicatorCount: indicators.activeCount || 0
        });
        if (entry.frame) trackPanel(entry.frame, frameReplaySystem(entry.frame));
      }
      const hostReplay = ensureReplayActive(win.chart);
      if (!hostReplay.ok) throw new Error('host replay not active for order placement');
      const order = placeHostOrder(win);
      const playing = [];
      for (const entry of chartWindows()) {
        let row = { id: entry.id, ...(await startReplayPlaying(entry.win.chart)) };
        if (!row.ok) {
          // One retry — panel D occasionally misses the first double-rAF arm.
          await sleep(100);
          row = { id: entry.id, ...(await startReplayPlaying(entry.win.chart)) };
        }
        playing.push(row);
      }
      // Hold a short live-play window (PO session had replay running). Do not
      // require play to still be true after a long idle — cadence can settle.
      let observedPlaying = 0;
      const playWindowStarted = Date.now();
      while (Date.now() - playWindowStarted < 800) {
        observedPlaying = Math.max(
          observedPlaying,
          collectReplayPlaying(win).filter((row) => row.isPlaying).length
        );
        if (observedPlaying >= 3) break;
        await sleep(50);
      }
      const stillPlaying = collectReplayPlaying(win).filter((row) => row.isPlaying).length;
      const indicatorsOk = perPanel.every((row) => row.indicators && row.indicators.ok);
      const replayOk = perPanel.every((row) => row.replay && row.replay.ok);
      const playingArmed = playing.filter((row) => row.ok).length >= 3 || observedPlaying >= 3;
      const armed = indicatorsOk && replayOk && order.ok && playingArmed && perPanel.length >= 4;
      return {
        armed,
        panels: perPanel.length,
        indicatorsOk,
        replayOk,
        order,
        playing,
        stillPlaying,
        observedPlaying,
        perPanel
      };
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
      await waitFor(() => {
        const m = manager();
        return PANEL_IDS.every((id) => {
          const entry = m.charts && m.charts.get(id);
          return entry && entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart
            && entry.frame.contentWindow.chart.replaySystem
            && entry.frame.contentWindow.chart.replaySystem._m20Q6LifecycleState === 'active';
        });
      }, 'panels B/C/D active replay systems', 60000);
      trackAllManagedPanels();
    }

    async function collapseToSingle() {
      const win = harnessWindow();
      const mgr = manager();
      if (!mgr || typeof mgr.removeChart !== 'function') throw new Error('multichart manager missing removeChart');
      trackAllManagedPanels();
      for (const id of PANEL_IDS) {
        if (mgr.charts && mgr.charts.has(id)) mgr.removeChart(id);
        try {
          const cell = win.document.querySelector('[data-cell="' + id + '"]');
          if (cell) cell.remove();
        } catch (_) {}
      }
      setGridLayout(1);
      await waitFor(() => {
        const m = manager();
        return PANEL_IDS.every((id) => !(m.charts && m.charts.has(id)));
      }, 'panels B/C/D removed', 30000);
      if (window.gc) { try { window.gc(); } catch (_) {} }
      if (win.gc) { try { win.gc(); } catch (_) {} }
      await sleep(900);
      pruneDrainedPanels(win);
    }

    async function run() {
      const startedAt = new Date().toISOString();
      let workload = null;
      try {
        installHarnessCensus();
        await waitFor(() => {
          const win = harnessWindow();
          installM6SchedulingCensus(win, 'A-harness');
          return win && win.__harnessManager && win.chart && win.chart.replaySystem
            && win.chart.replaySystem._m20Q6LifecycleState === 'active'
            && !win.__harnessBootError;
        }, 'host chart active replay system', 60000);
        await waitFor(() => {
          installAllSchedulingCensus();
          const m = manager();
          return PANEL_IDS.every((id) => {
            const entry = m && m.charts && m.charts.get(id);
            return entry && entry.frame && entry.frame.contentWindow && entry.frame.contentWindow.chart
              && entry.frame.contentWindow.chart.replaySystem
              && entry.frame.contentWindow.chart.replaySystem._m20Q6LifecycleState === 'active';
          });
        }, 'boot four-panel B/C/D active', 60000);
        trackAllManagedPanels();
        workload = await armPoWorkload();
        if (!workload.armed) {
          throw new Error('PO workload arm failed: ' + JSON.stringify(workload));
        }
        const armed = snapshot('armed-four-panel');
        if (armed.liveReplaySystems < 4) {
          throw new Error('armed four-panel live count below 4: live=' + armed.liveReplaySystems);
        }
        await collapseToSingle();
        await sleep(${M6_SCHEDULER_SOAK_MS});
        const baseline = snapshot('baseline-single-after-60s');
        const schedulerOrphan = installSchedulerOrphanInterval();
        const cycleSnapshots = [armed];
        for (let index = 0; index < cycles; index += 1) {
          await expandToFourPanels();
          const rearm = await armPoWorkload();
          if (!rearm.armed) throw new Error('PO workload re-arm failed at cycle ' + (index + 1));
          workload = rearm;
          await sleep(800);
          cycleSnapshots.push(snapshot('cycle-' + (index + 1) + '-open'));
          await collapseToSingle();
          cycleSnapshots.push(snapshot('cycle-' + (index + 1) + '-closed'));
        }
        await sleep(1000);
        const finalImmediate = snapshot('final-immediate');
        await sleep(${M6_SCHEDULER_SOAK_MS});
        const final = snapshot('final-after-60s');
        await postReport({
          ok: true,
          startedAt,
          finishedAt: new Date().toISOString(),
          cycles,
          workload,
          schedulerOrphan,
          baseline,
          final,
          finalImmediate,
          schedulerSoakMs: ${M6_SCHEDULER_SOAK_MS},
          cycleSnapshots
        });
      } catch (error) {
        await postReport({
          ok: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          cycles,
          workload,
          error: String(error && error.message || error),
          baseline: safeSnapshot('baseline-error'),
          final: safeSnapshot('final-error')
        });
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

export async function startM6ReplayLeakServer({
  mutant = false,
  cycles = DEFAULT_M6_CYCLES,
  schedulerOrphanInterval = false,
  onReport,
} = {}) {
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
        send(response, 200, m6ReplayLeakHostHtml({ cycles, schedulerOrphanInterval }), 'text/html; charset=utf-8');
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
  schedulerOrphanInterval = false,
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
    serverHandle = await startM6ReplayLeakServer({
      cycles,
      mutant,
      schedulerOrphanInterval,
      onReport: resolveReport,
    });
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
    const cells = assertM6ReplayLeakCounts({
      baseline: report.baseline,
      final: report.final,
      mutant,
      workload: report.workload || null,
      cycles: Number(report.cycles) || cycles,
    });
    if (schedulerOrphanInterval) {
      const instrumented = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED');
      const scheduler = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE');
      const orphanDelta = Number(scheduler?.metrics?.deltas?.pendingIntervals) || 0;
      cells.push({
        name: 'NC-M6-SCHEDULER-ORPHAN-INTERVAL',
        blocking: true,
        pass: instrumented?.pass === true
          && scheduler?.pass === false
          && scheduler?.metrics?.soundChannelRed === true
          && orphanDelta > 0
          && report.schedulerOrphan?.installed === true,
        detail: `installed=${report.schedulerOrphan?.installed === true}; pendingIntervalDelta=${orphanDelta}; soundChannelRed=${scheduler?.metrics?.soundChannelRed === true}; schedulerPass=${scheduler?.pass === true}`,
      });
    }
    const ok = report.ok === true && cells.every((cell) => cell.pass === true);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: M6_REPLAY_LEAK_SIGNATURE,
      error: ok ? null : (report.error || cells.filter((cell) => cell.pass === false).map((cell) => `${cell.name}: ${cell.detail}`).join('; ')),
      report,
      cells,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, mutant, schedulerOrphanInterval, cycles, stderrTail: browserRun.stderrTail || '' },
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
  // Director 1652 / charter: a gate that cannot reproduce the PO-confirmed
  // defect (4→17) must not mint GREEN. live=1 after the PO workload is
  // UNPROVEN escalate — not ship credit. Opt in only after the defect is
  // first shown RED, then fixed: TALARIA_M6_LEAK_FIXED=1.
  const finalLive = acceptance.report?.final?.liveReplaySystems;
  const censusInstrumented = acceptance.cells?.some((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED' && cell.pass === true);
  const schedulerCell = acceptance.cells?.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE');
  const attributableSchedulerRed = schedulerCell?.pass === false && schedulerCell?.metrics?.attributableDefectCredit === true;
  const workerBelowCredit = schedulerCell?.pass === false && schedulerCell?.metrics?.workerResidueWithoutCredit === true;
  const defectReproduced = censusInstrumented === true && (finalLive > 1 || attributableSchedulerRed);
  if (process.env.TALARIA_M6_LEAK_FIXED !== '1') {
    if (acceptance.ok && finalLive === 1) {
      return {
        ok: false,
        status: 'UNPROVEN',
        signature: M6_REPLAY_LEAK_SIGNATURE,
        acceptance,
        mutant: null,
        error: 'ESCALATE-TO-DIRECTOR: PO workload (4 panels+indicators+order+live replay) returned live=1; defect not reproduced; not a pass',
      };
    }
    if (!acceptance.ok && !defectReproduced) {
      if (acceptance.report) {
        const workerDelta = Number(schedulerCell?.metrics?.deltas?.workers) || 0;
        const workerCreditThreshold = Number(schedulerCell?.metrics?.workerCreditThreshold) || cycles;
        const workerCreditText = workerBelowCredit
          ? `worker-only growth delta ${workerDelta} below attribution threshold ${workerCreditThreshold} is RED residue but not PO defect reproduced`
          : `worker-only growth requires magnitude >= cycles for PO defect credit (threshold ${workerCreditThreshold})`;
        return {
          ok: false,
          status: 'UNPROVEN',
          signature: M6_REPLAY_LEAK_SIGNATURE,
          acceptance,
          mutant: null,
          error: `M6 defect unproven: requires instrumented census plus live growth or attributable scheduler-channel RED; absent/blind census is not PO defect reproduced; listener-only drift is not PO defect reproduced; ${workerCreditText}`,
        };
      }
      return { ok: false, status: acceptance.status, signature: M6_REPLAY_LEAK_SIGNATURE, acceptance, mutant: null };
    }
    if (defectReproduced) {
      // Instrument is pointed at the defect. Ship stays blocked until fix + FIXED=1.
      return {
        ok: false,
        status: 'RED',
        signature: M6_REPLAY_LEAK_SIGNATURE,
        acceptance,
        mutant: null,
        error: `PO defect reproduced (final live=${finalLive}; attributableSchedulerRed=${attributableSchedulerRed === true}; creditStatus=${schedulerCell?.metrics?.attributableCreditStatus || 'NONE'}); ship blocked until fix (TALARIA_M6_LEAK_FIXED=1)`,
      };
    }
  }
  if (!acceptance.ok) {
    return { ok: false, status: acceptance.status, signature: M6_REPLAY_LEAK_SIGNATURE, acceptance, mutant: null };
  }
  const mutant = await runM6ReplayLeakGate({ ...options, mutant: true });
  const mutantOk = mutant.status === 'RED'
    && mutant.cells.some((cell) => cell.name === 'NC-M6-TEARDOWN-REVERSAL' && cell.pass === true);
  const schedulerMutant = await runM6ReplayLeakGate({ ...options, mutant: false, schedulerOrphanInterval: true });
  const schedulerMutantOk = schedulerMutant.status === 'RED'
    && schedulerMutant.cells.some((cell) => cell.name === 'NC-M6-SCHEDULER-ORPHAN-INTERVAL' && cell.pass === true);
  return {
    ok: mutantOk && schedulerMutantOk,
    status: mutantOk && schedulerMutantOk ? 'GREEN' : 'RED',
    signature: M6_REPLAY_LEAK_SIGNATURE,
    acceptance,
    mutant,
    schedulerMutant,
    error: mutantOk && schedulerMutantOk ? null : 'M6 negative controls did not prove acceptance cells go RED',
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

