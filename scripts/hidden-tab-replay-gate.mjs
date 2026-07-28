import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  HIDDEN_TAB_REPLAY_SIGNATURE,
  HIDDEN_TAB_REPLAY_STATUS_SKIP,
  assertHiddenTabReplayCells,
  forceDocumentHidden,
  playheadAdvanced,
  readReplayPlayhead,
} from './lib/hidden-tab-replay.mjs';

export {
  HIDDEN_TAB_REPLAY_SIGNATURE,
  HIDDEN_TAB_REPLAY_STATUS_SKIP,
  assertHiddenTabReplayCells,
  forceDocumentHidden,
  playheadAdvanced,
  readReplayPlayhead,
};

export const DEFAULT_HIDDEN_TAB_TIMEOUT_MS = 90_000;
export const DEFAULT_HIDDEN_OBSERVE_MS = 1_800;

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

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function hiddenTabReplayHostHtml({
  observeMs = DEFAULT_HIDDEN_OBSERVE_MS,
  pauseShim = false,
} = {}) {
  const safeObserve = Math.max(500, Math.min(10_000, Number(observeMs) || DEFAULT_HIDDEN_OBSERVE_MS));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hidden-tab replay gate</title>
  <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07080e}</style>
</head>
<body>
  <iframe id="harness" src="/harness/host.html?panels=1&tf=1m&pair=same&hostFile=25"></iframe>
  <script type="module">
    const observeMs = ${safeObserve};
    const pauseShim = ${pauseShim ? 'true' : 'false'};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function harnessWindow() {
      return document.getElementById('harness').contentWindow;
    }

    function forceHidden(doc, hidden) {
      Object.defineProperty(doc, 'hidden', { configurable: true, enumerable: true, get: () => !!hidden });
      Object.defineProperty(doc, 'visibilityState', {
        configurable: true,
        enumerable: true,
        get: () => (hidden ? 'hidden' : 'visible'),
      });
      doc.dispatchEvent(new Event('visibilitychange'));
      return { hidden: !!doc.hidden, visibilityState: String(doc.visibilityState || '') };
    }

    function playhead(rs) {
      return {
        isActive: !!(rs && rs.isActive),
        isPlaying: !!(rs && rs.isPlaying),
        currentIndex: rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
        replayTimestamp: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      };
    }

    async function waitFor(pred, label, timeoutMs = 45000) {
      const started = Date.now();
      let last = null;
      while (Date.now() - started < timeoutMs) {
        try { if (pred()) return; } catch (e) { last = e; }
        await sleep(100);
      }
      throw new Error('timeout waiting for ' + label + (last ? ': ' + last.message : ''));
    }

    async function armPlaying() {
      const win = harnessWindow();
      try { win.alert = () => {}; } catch (_) {}
      const chart = win.chart;
      const rs = chart && chart.replaySystem;
      if (!rs) throw new Error('replaySystem missing');
      if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
        rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
      }
      if (typeof rs.goToReplayTimestamp === 'function' && Array.isArray(chart.data) && chart.data.length > 80) {
        const mid = chart.data[Math.floor(chart.data.length * 0.2)];
        if (mid && mid.t != null) rs.goToReplayTimestamp(Number(mid.t));
      }
      try {
        if (typeof rs.setPlaybackMode === 'function') rs.setPlaybackMode('candle', { restartPlayback: false });
      } catch (_) {}
      try {
        if (typeof rs.setSpeed === 'function') rs.setSpeed(20);
      } catch (_) {}
      if (typeof rs.play === 'function') rs.play();
      await waitFor(() => rs.isPlaying === true, 'replay isPlaying', 8000);
      // Wait for the deferred double-rAF play start + at least one candle tick.
      await sleep(250);
      return rs;
    }

    async function run() {
      const startedAt = new Date().toISOString();
      try {
        await waitFor(() => {
          const win = harnessWindow();
          return win && win.chart && win.chart.replaySystem
            && win.chart.replaySystem._m20Q6LifecycleState === 'active'
            && Array.isArray(win.chart.data) && win.chart.data.length > 50
            && !win.__harnessBootError;
        }, 'host chart ready', 60000);

        const rs = await armPlaying();
        // Prove playhead can move while visible before the hidden probe.
        const visibleBefore = playhead(rs);
        await waitFor(() => {
          const now = playhead(rs);
          return (now.currentIndex ?? 0) > (visibleBefore.currentIndex ?? 0)
            || (now.replayTimestamp ?? 0) > (visibleBefore.replayTimestamp ?? 0);
        }, 'playhead advances while visible', 8000);
        const visibleAfter = playhead(rs);

        if (pauseShim) {
          const win = harnessWindow();
          win.document.addEventListener('visibilitychange', () => {
            try {
              if (win.document.hidden && win.chart && win.chart.replaySystem
                  && typeof win.chart.replaySystem.pause === 'function') {
                win.chart.replaySystem.pause();
              }
            } catch (_) {}
          });
        }

        const before = playhead(rs);
        const hiddenState = forceHidden(harnessWindow().document, true);
        await sleep(observeMs);
        const after = playhead(rs);

        await fetch('/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: true,
            signature: '${HIDDEN_TAB_REPLAY_SIGNATURE}',
            startedAt,
            finishedAt: new Date().toISOString(),
            observeMs,
            pauseShim,
            visibleBefore,
            visibleAfter,
            before,
            after,
            hiddenState,
          }),
        });
      } catch (error) {
        await fetch('/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: false,
            signature: '${HIDDEN_TAB_REPLAY_SIGNATURE}',
            startedAt,
            finishedAt: new Date().toISOString(),
            error: String(error && error.message || error),
          }),
        });
      }
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
  const body = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

export async function startHiddenTabReplayServer({
  observeMs = DEFAULT_HIDDEN_OBSERVE_MS,
  pauseShim = false,
  onReport,
} = {}) {
  const harness = await startHarnessServer(0);
  const hostHtml = hiddenTabReplayHostHtml({ observeMs, pauseShim });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === '/report') {
        const report = await readRequestJson(request);
        if (onReport) onReport(report);
        send(response, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');
        return;
      }
      if (url.pathname === '/m6-probe.mjs' || url.pathname === '/hidden-tab-probe.mjs') {
        // not used; keep path free
      }
      if (url.pathname === '/m6-host.html' || url.pathname === '/hidden-tab-host.html') {
        send(response, 200, hostHtml, 'text/html; charset=utf-8');
        return;
      }
      await proxyRequest({ harness, request, response });
    } catch (error) {
      send(response, 500, String(error?.message || error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await harness.close();
    },
  };
}

function validateReport(report) {
  if (!report || typeof report !== 'object') return 'report must be object';
  if (report.signature !== HIDDEN_TAB_REPLAY_SIGNATURE) return 'bad signature';
  if (!report.before || !report.after || !report.hiddenState) return 'missing before/after/hiddenState';
  return null;
}

export async function runHiddenTabReplayGate({
  observeMs = DEFAULT_HIDDEN_OBSERVE_MS,
  timeoutMs = DEFAULT_HIDDEN_TAB_TIMEOUT_MS,
  requireBrowser = false,
  pauseShim = false,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const startedAt = new Date().toISOString();
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      status: requireBrowser ? 'RED' : HIDDEN_TAB_REPLAY_STATUS_SKIP,
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
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
    serverHandle = await startHiddenTabReplayServer({
      observeMs,
      pauseShim,
      onReport: resolveReport,
    });
    const url = `${serverHandle.url}/hidden-tab-host.html`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: pauseShim ? 'talaria-hidden-tab-shim-' : 'talaria-hidden-tab-',
    });
    const report = browserRun.report || null;
    if (!report || browserRun.timedOut) {
      return {
        ok: false,
        status: 'RED',
        signature: HIDDEN_TAB_REPLAY_SIGNATURE,
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        cells: [],
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, timedOut: true },
      };
    }
    const shapeError = validateReport(report);
    if (shapeError) {
      return {
        ok: false,
        status: 'RED',
        signature: HIDDEN_TAB_REPLAY_SIGNATURE,
        error: shapeError,
        report,
        cells: [],
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url },
      };
    }
    const cells = assertHiddenTabReplayCells({
      before: report.before,
      after: report.after,
      hiddenState: report.hiddenState,
      mutant: pauseShim,
    });
    const ok = report.ok === true && cells.every((cell) => cell.pass === true);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
      error: ok ? null : (report.error || cells.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join('; ')),
      report,
      cells,
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        browserPath,
        url,
        pauseShim,
        observeMs,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      cells: [],
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, pauseShim },
    };
  } finally {
    if (serverHandle) await serverHandle.close().catch(() => {});
  }
}

/**
 * Until TALARIA_HIDDEN_TAB_FIXED=1:
 *   product arm must RED (playhead advances while hidden) — else GATE-WRONG if GREEN,
 *   pause-shim arm must GREEN (positive control that the cell can pass).
 * Ship preflight stays blocked (ok:false). After FIXED=1, product must GREEN.
 */
export async function runHiddenTabReplayPreflight(options = {}) {
  const product = await runHiddenTabReplayGate({ ...options, pauseShim: false });
  const pauseCell = product.cells?.find((c) => c.name === 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE');
  const advancedWhileHidden = product.status === 'RED'
    && pauseCell
    && pauseCell.pass === false
    && /advanced=true/.test(String(pauseCell.detail || ''));

  if (process.env.TALARIA_HIDDEN_TAB_FIXED !== '1') {
    if (product.ok) {
      return {
        ok: false,
        status: 'RED',
        signature: HIDDEN_TAB_REPLAY_SIGNATURE,
        product,
        shim: null,
        error: 'GATE-WRONG: GREEN on unfixed code (replay has zero visibility handling)',
      };
    }
    const shim = await runHiddenTabReplayGate({ ...options, pauseShim: true });
    const shimOk = shim.ok === true;
    if (advancedWhileHidden && shimOk) {
      return {
        ok: false,
        status: 'RED',
        signature: HIDDEN_TAB_REPLAY_SIGNATURE,
        product,
        shim,
        error: 'hidden-tab defect reproduced (instrument LIVE); ship blocked until TALARIA_HIDDEN_TAB_FIXED=1',
      };
    }
    return {
      ok: false,
      status: 'UNPROVEN',
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
      product,
      shim,
      error: `instrument incomplete: defectSeen=${advancedWhileHidden}; shimGreen=${shimOk}`,
    };
  }

  if (!product.ok) {
    return {
      ok: false,
      status: product.status,
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
      product,
      shim: null,
      error: product.error,
    };
  }
  return {
    ok: true,
    status: 'GREEN',
    signature: HIDDEN_TAB_REPLAY_SIGNATURE,
    product,
    shim: null,
    error: null,
  };
}

export function parseHiddenTabReplayArgs(argv = process.argv.slice(2)) {
  const options = {
    observeMs: DEFAULT_HIDDEN_OBSERVE_MS,
    timeoutMs: DEFAULT_HIDDEN_TAB_TIMEOUT_MS,
    requireBrowser: false,
    pauseShim: false,
    acceptanceOnly: false,
  };
  for (const arg of argv) {
    if (arg === '--require-browser') options.requireBrowser = true;
    else if (arg === '--pause-shim') options.pauseShim = true;
    else if (arg === '--acceptance-only') options.acceptanceOnly = true;
    else if (arg.startsWith('--observe-ms=')) options.observeMs = Number(arg.slice('--observe-ms='.length));
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result;
  try {
    const options = parseHiddenTabReplayArgs();
    result = options.acceptanceOnly || options.pauseShim
      ? await runHiddenTabReplayGate(options)
      : await runHiddenTabReplayPreflight(options);
  } catch (error) {
    result = {
      ok: false,
      status: 'RED',
      signature: HIDDEN_TAB_REPLAY_SIGNATURE,
      error: String(error?.message || error),
    };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
