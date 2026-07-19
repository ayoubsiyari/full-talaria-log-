/**
 * serve.mjs — Phase-4 harness static + stub-API server (Task 4.1).
 *
 * ZERO runtime dependencies (Node built-ins only). Two jobs:
 *
 *  1. Static-serve the REAL canonical chart tree so the harness always tests
 *     the exact code being edited. Everything under `/chart/*` is mapped 1:1
 *     onto the sibling `chart v 1.4/chart/` directory:
 *         /chart/chart.js            -> ../../chart.js
 *         /chart/modules/*           -> ../../modules/*
 *         /chart/multichart-prod/*   -> ../../multichart-prod/*   (bridges, embed html)
 *         /chart/dist-v9/*           -> ../../dist-v9/*
 *         /chart/vendor/*            -> ../../vendor/*             (d3, lz-string)
 *         /chart/fonts/*             -> ../../fonts/*
 *
 *  2. Emulate the API endpoints the engine calls during boot with deterministic
 *     synthetic 1-minute candles (~90 days), matching the REAL response shapes
 *     read by chart.js (verified against chart.js + api_server.py):
 *         GET /api/file/{id}/bars    -> { file_id, resolution, bars:[{t,o,h,l,c,v}],
 *                                         returned, has_more_left, has_more_right, source }
 *         GET /api/file/{id}/smart   -> { timeframe, total, returned, has_more_left,
 *                                         has_more_right, first_cursor, last_cursor,
 *                                         source, candles:[{t,o,h,l,c,v}] }
 *         GET /api/file/{id}/meta    -> { file_id, original_name, raw_row_count,
 *                                         start_ts, end_ts, timeframes:{...} }
 *         GET /api/file/{id}/candles -> { data:{t,o,h,l,c,v (columnar)}, has_more_left,
 *                                         has_more_right, prev_cursor, next_cursor, source }
 *         GET /api/auth/me           -> { user:{ id, ... } }   (chart-embed auth gate)
 *     Two file ids are provided (25 and 27) for independent-pair scenarios.
 *
 * EVERY /api hit is logged with its query params (Task 4.2 fetch-count
 * assertions depend on this). `getApiLog()` exposes the structured log.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// harness/ -> multichart-prod/ (..) -> chart/ (../..): the canonical tree root.
const CHART_ROOT = path.resolve(__dirname, '..', '..');

const MIN_MS = 60_000;
const SYNTH_DAYS = 90;
const SYNTH_COUNT = SYNTH_DAYS * 24 * 60; // 129,600 one-minute candles

// H-S20 (BL-14) needs a MUCH deeper 1m history so that a coarse (1D) viewport
// spans ~months while the host's replay 1m master only ever covers ~a couple of
// days around the playhead — i.e. a real coverage gap. This depth (in DAYS) is
// per-file so the existing 90-day instruments (25/27) are untouched and every
// pre-BL-14 scenario keeps its exact data extent.
const DEEP_SYNTH_DAYS = 400;

// Two 90-day instruments for same-pair / independent-pair scenarios, plus one
// DEEP 400-day instrument (28) used only by the coarse-panel-display scenario.
const FILES = {
  25: { originalName: 'EURUSD.csv', basePrice: 1.08000, decimals: 5 },
  27: { originalName: 'GBPUSD.csv', basePrice: 1.27000, decimals: 5 },
  28: { originalName: 'DEEPFX.csv', basePrice: 1.15000, decimals: 5, synthDays: DEEP_SYNTH_DAYS },
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const TF_MS = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic synthetic 1m OHLCV. Values are seeded per file id so runs are
 * reproducible; the window END is anchored to "now" (rounded to the minute) so
 * the engine's live end-anchored fetch (toMs = Date.now()) lands on real data.
 */
const _candleCache = new Map();
function getCandles(fileId) {
  if (_candleCache.has(fileId)) return _candleCache.get(fileId);
  const meta = FILES[fileId];
  if (!meta) return null;
  const rnd = mulberry32(1000 + fileId * 7919);
  const count = (Number.isFinite(meta.synthDays) ? meta.synthDays : SYNTH_DAYS) * 24 * 60;
  const endMinute = Math.floor(Date.now() / MIN_MS) * MIN_MS;
  const startMs = endMinute - (count - 1) * MIN_MS;
  const factor = Math.pow(10, meta.decimals);
  const round = (x) => Math.round(x * factor) / factor;
  const candles = new Array(count);
  let price = meta.basePrice;
  for (let i = 0; i < count; i++) {
    const t = startMs + i * MIN_MS;
    const drift = (rnd() - 0.5) * meta.basePrice * 0.0008;
    const o = price;
    const c = Math.max(0.0001, o + drift);
    const wick = meta.basePrice * 0.0004 * rnd();
    const h = Math.max(o, c) + wick;
    const l = Math.min(o, c) - wick;
    const v = Math.round(100 + rnd() * 900);
    candles[i] = { t, o: round(o), h: round(h), l: round(l), c: round(c), v };
    price = c;
  }
  _candleCache.set(fileId, candles);
  return candles;
}

/** Resample ascending 1m candles into a coarser timeframe bucket. */
function resample(candles, tf) {
  const tfMs = TF_MS[tf];
  if (!tfMs || tf === '1m') return candles;
  const out = [];
  let bucketStart = -1;
  let cur = null;
  for (const c of candles) {
    const b = Math.floor(c.t / tfMs) * tfMs;
    if (b !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = b;
      cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Mirror api_server.bar_budget.choose_resolution just enough for the harness. */
function chooseResolution(fromMs, toMs, resolution, limit) {
  const r = String(resolution || 'auto').toLowerCase().trim();
  if (r !== 'auto' && TF_MS[r]) return r;
  const span = Math.max(MIN_MS, (toMs || Date.now()) - (fromMs || 0));
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w']) {
    if (span / TF_MS[tf] <= limit) return tf;
  }
  return '1w';
}

// ── API log (Task 4.2 fetch-count assertions read this) ───────────────────
const apiLog = [];
function logApi(method, url, endpoint, fileId) {
  const entry = {
    ts: Date.now(),
    method,
    endpoint,
    fileId: fileId != null ? String(fileId) : null,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
  apiLog.push(entry);
  const qs = url.search || '';
  console.log(`[api] ${method} ${url.pathname}${qs}`);
  return entry;
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// ── API handlers ──────────────────────────────────────────────────────────
function handleBars(res, url, fileId) {
  const candles = getCandles(fileId);
  if (!candles) return sendJson(res, { detail: 'File not found' }, 404);
  const limit = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '2000', 10)));
  const fromMs = url.searchParams.has('from') ? parseInt(url.searchParams.get('from'), 10) : null;
  const toMs = url.searchParams.has('to') ? parseInt(url.searchParams.get('to'), 10) : null;
  const chosen = chooseResolution(fromMs, toMs, url.searchParams.get('resolution'), limit);

  let win = candles;
  if (fromMs != null || toMs != null) {
    win = candles.filter((c) => (fromMs == null || c.t >= fromMs) && (toMs == null || c.t <= toMs));
  }
  win = resample(win, chosen);

  // anchor="start" truncation at limit (matches _tiles_read_window/_build_bars_payload).
  let hasMoreRight = false;
  if (win.length > limit) {
    win = win.slice(0, limit);
    hasMoreRight = true;
  }
  let hasMoreLeft = false;
  if (win.length) {
    const firstT = win[0].t;
    const lastT = win[win.length - 1].t;
    hasMoreLeft = firstT > candles[0].t && (fromMs == null || firstT > fromMs);
    hasMoreRight = hasMoreRight
      || (lastT < candles[candles.length - 1].t && (toMs == null || lastT < toMs));
  }
  sendJson(res, {
    file_id: fileId,
    resolution: chosen,
    bars: win,
    returned: win.length,
    has_more_left: hasMoreLeft,
    has_more_right: hasMoreRight,
    source: 'harness-tiles',
  });
}

function handleSmart(res, url, fileId) {
  const candles = getCandles(fileId);
  if (!candles) return sendJson(res, { detail: 'File not found' }, 404);
  const timeframe = url.searchParams.get('timeframe') || '1m';
  const anchor = (url.searchParams.get('anchor') || 'end').toLowerCase();
  const responseFormat = (url.searchParams.get('response_format') || 'csv').toLowerCase();
  const limit = Math.max(100, Math.min(100000, parseInt(url.searchParams.get('limit') || '2000', 10)));
  const startTs = url.searchParams.has('start_ts') ? parseInt(url.searchParams.get('start_ts'), 10) : null;
  const endTs = url.searchParams.has('end_ts') ? parseInt(url.searchParams.get('end_ts'), 10) : null;

  let series = resample(candles, timeframe);
  if (startTs != null || endTs != null) {
    series = series.filter((c) => (startTs == null || c.t >= startTs) && (endTs == null || c.t <= endTs));
  }
  const total = series.length;
  let hasMoreLeft = false;
  let hasMoreRight = false;
  if (total > limit) {
    if (anchor === 'start') { series = series.slice(0, limit); hasMoreRight = true; }
    else { series = series.slice(-limit); hasMoreLeft = true; }
  }
  const base = {
    timeframe,
    resolution: timeframe,
    total,
    returned: series.length,
    has_more_left: hasMoreLeft,
    has_more_right: hasMoreRight,
    first_cursor: series.length ? String(series[0].t) : null,
    last_cursor: series.length ? String(series[series.length - 1].t) : null,
    source: 'harness-smart',
  };
  if (responseFormat === 'candles') {
    base.candles = series;
    return sendJson(res, base);
  }
  let csv = 'time,open,high,low,close,volume\n';
  for (const c of series) csv += `${c.t},${c.o},${c.h},${c.l},${c.c},${c.v}\n`;
  base.data = csv;
  sendJson(res, base);
}

function handleCandlesCursor(res, url, fileId) {
  const candles = getCandles(fileId);
  if (!candles) return sendJson(res, { detail: 'File not found' }, 404);
  const timeframe = url.searchParams.get('timeframe') || '1m';
  const direction = (url.searchParams.get('direction') || 'backward').toLowerCase();
  const limit = Math.max(100, Math.min(10000, parseInt(url.searchParams.get('limit') || '2000', 10)));
  const cursor = url.searchParams.has('cursor') ? parseInt(url.searchParams.get('cursor'), 10) : null;

  const series = resample(candles, timeframe);
  let slice;
  let hasMoreLeft = false;
  let hasMoreRight = false;
  if (direction === 'forward') {
    const after = cursor == null ? series : series.filter((c) => c.t > cursor);
    slice = after.slice(0, limit);
    hasMoreRight = after.length > limit;
    hasMoreLeft = cursor != null;
  } else {
    const before = cursor == null ? series : series.filter((c) => c.t < cursor);
    slice = before.slice(-limit);
    hasMoreLeft = before.length > limit;
    hasMoreRight = cursor != null;
  }
  const col = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (const c of slice) { col.t.push(c.t); col.o.push(c.o); col.h.push(c.h); col.l.push(c.l); col.c.push(c.c); col.v.push(c.v); }
  sendJson(res, {
    data: col,
    has_more_left: hasMoreLeft,
    has_more_right: hasMoreRight,
    prev_cursor: slice.length ? String(slice[0].t) : null,
    next_cursor: slice.length ? String(slice[slice.length - 1].t) : null,
    elapsed_ms: 0,
    source: 'harness-candles',
  });
}

function handleMeta(res, fileId) {
  const candles = getCandles(fileId);
  const meta = FILES[fileId];
  if (!candles || !meta) return sendJson(res, { detail: 'File not found' }, 404);
  const startTs = candles[0].t;
  const endTs = candles[candles.length - 1].t;
  const timeframes = {};
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w']) {
    timeframes[tf] = {
      status: 'ready',
      row_count: resample(candles, tf).length,
      start_ts: startTs,
      end_ts: endTs,
      source: 'precomputed',
    };
  }
  sendJson(res, {
    file_id: fileId,
    original_name: meta.originalName,
    raw_row_count: candles.length,
    start_ts: startTs,
    end_ts: endTs,
    timeframes,
  });
}

function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','file','25','bars']
  // /api/auth/me — chart-embed.html auth gate (redirects to /login on non-OK).
  if (parts[1] === 'auth' && parts[2] === 'me') {
    logApi(req.method, url, 'auth.me', null);
    // has_journal_access / admin role required for mode=backtest (chart.js subscription gate).
    return sendJson(res, {
      user: {
        id: 1,
        email: 'harness@talaria.local',
        name: 'Harness',
        role: 'admin',
        has_journal_access: true,
      },
    });
  }
  if (parts[1] === 'file' && parts[2] != null) {
    const fileId = parseInt(parts[2], 10);
    const endpoint = parts[3] || '';
    if (endpoint === 'bars') { logApi(req.method, url, 'file.bars', fileId); return handleBars(res, url, fileId); }
    if (endpoint === 'smart') { logApi(req.method, url, 'file.smart', fileId); return handleSmart(res, url, fileId); }
    if (endpoint === 'meta') { logApi(req.method, url, 'file.meta', fileId); return handleMeta(res, fileId); }
    if (endpoint === 'candles') { logApi(req.method, url, 'file.candles', fileId); return handleCandlesCursor(res, url, fileId); }
  }
  // chart preferences: engine GETs on boot, mirrors known fields into storage.
  if (url.pathname === '/api/chart/preferences') {
    logApi(req.method, url, 'chart.preferences', null);
    return sendJson(res, req.method === 'GET' ? {} : { ok: true });
  }
  // Safe default for any other /api call so boot never sees a network failure.
  logApi(req.method, url, 'other', null);
  return sendJson(res, {});
}

// ── Static file serving ────────────────────────────────────────────────────
function serveStatic(res, relPath) {
  const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(CHART_ROOT, safe);
  if (!filePath.startsWith(CHART_ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + relPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Faithful host page mirroring PRODUCTION MultichartGrid topology:
//
//   • Tile A is the PARENT page's REAL in-process `window.chart` — the exact
//     engine (chart.js + modules) booted in this top window, NOT an iframe.
//     The MultichartManager registers it via `addHostChart` and the host
//     bridge (sync-bridge.js `installBridge`) is installed on it, exactly as
//     MultichartGrid.jsx does (see `ensureHostBridge` + `addHostChart` +
//     `setSyncModeGate`). This makes the host→panel mirror/clone and
//     host-replay fan-out paths LIVE.
//   • Tiles B/C/D are `chart-embed.html` iframes owned by the same manager
//     via `mgr.addChart`. Same-pair panels mirror the host in-memory (no
//     self /bars fetch) through embed-bridge's `_multichartMirrorViewportFromHost`.
//
// The engine module list + boot bridges below are the exact set chart-embed.html
// loads (the lightest faithful boot of the real engine), minus the iframe-only
// bridges (embed-bridge.js / panel-cmd-bridge.js) which do not belong on the
// parent — and WITHOUT the `multichart-embed` class / `__TALARIA_EMBED_LITE`
// flag, since the host is the parent page (matches dist-v9/index.html: those
// are only set for `?multichart=1` iframe panels).
//
// Layout is CONFIGURABLE via query params (unchanged contract):
//   ?pair=same|independent   independent → panel B loads fileId 27, rest 25
//   ?panels=4|1              1 → single host tile A only (H-S11 "single chart")
//   ?tf=1m                   initial timeframe for host + every panel
// Sync toggles are driven at runtime through window.__harnessManager
// (mirrors how the real MultichartGrid calls manager.setSyncMode).

// Exact engine script list chart-embed.html injects (real engine + modules).
const ENGINE_MODULE_PATHS = [
  '/chart/modules/preferences-sync.js',
  '/chart/modules/preferences-init.js',
  '/chart/modules/market-calculations.js',
  '/chart/modules/chart-env.defaults.js',
  '/chart/modules/chart-env.generated.js',
  '/chart/modules/drawing-tools-base.js',
  '/chart/modules/drawing-tools-lines.js',
  '/chart/modules/drawing-tools-shapes.js',
  '/chart/modules/drawing-tools-fibonacci.js',
  '/chart/modules/drawing-tools-text.js',
  '/chart/modules/drawing-tools-emoji.js',
  '/chart/modules/drawing-tools-image.js',
  '/chart/modules/emoji-picker.js',
  '/chart/modules/emoji-picker-simple.js',
  '/chart/modules/drawing-tools-advanced-volume.js',
  '/chart/modules/drawing-tools-advanced.js',
  '/chart/modules/drawing-tools-extended.js',
  '/chart/modules/drawing-tools-patterns.js',
  '/chart/modules/drawing-tools-fib-gann.js',
  '/chart/modules/drawing-tools-channels.js',
  '/chart/modules/drawing-tools-ui.js',
  '/chart/modules/color-picker.js',
  '/chart/modules/drawing-toolbar.js',
  '/chart/modules/undo-redo-manager.js',
  '/chart/modules/tool-lifecycle-store.js',
  '/chart/modules/drawing-tools-manager.js',
  '/chart/modules/favorites-manager.js',
  '/chart/modules/keyboard-shortcuts.js',
  '/chart/modules/timezone-manager.js',
  '/chart/modules/viewport-data-manager.js',
  '/chart/modules/chart-data-pipeline.js',
  '/chart/modules/talaria-toast-stack.js',
  '/chart/chart.js',
  '/chart/modules/v9-theme-bridge.js',
  '/chart/modules/replay-system.js',
  '/chart/modules/replay-dashboard-sync.js',
  '/chart/modules/order-event-bus.js',
  '/chart/modules/order-service.js',
  '/chart/modules/order-manager.js',
  '/chart/modules/indicator-performance.js',
  '/chart/modules/indicator-persist-rehydrate.js',
  '/chart/modules/indicator-settings-apply.js',
  '/chart/modules/indicator-visibility.js',
  '/chart/modules/indicator-replay-ui-sync.js',
  '/chart/modules/indicator-lifecycle-store.js',
  '/chart/modules/chart-indicators-full.js',
  '/chart/modules/indicator-ui.js',
];

function hostPageHtml(query) {
  const q = query || new URLSearchParams();
  const pair = (q.get('pair') || 'same').toLowerCase();
  const panels = Math.max(1, Math.min(4, parseInt(q.get('panels') || '4', 10) || 4));
  const tf = q.get('tf') || '1m';
  // hostFile lets a scenario pick the instrument the HOST (and same-pair panels)
  // load — default 25 keeps every pre-BL-14 scenario on the 90-day instrument.
  // H-S20 passes hostFile=28 (the deep 400-day instrument) to create a real
  // coarse-viewport-vs-fine-master coverage gap.
  const hostFileId = parseInt(q.get('hostFile') || '25', 10) || 25;
  const independentFileId = 27;
  const independentFileIdC = 28;
  const allIds = ['A', 'B', 'C', 'D'];
  const ids = allIds.slice(0, panels);
  const iframeIds = ids.slice(1); // B/C/D — the host (A) is in-process.
  // Per-panel fileId map (independent-pair → B on its own instrument;
  // multi-independent → B=file27, C=file28 for ≥2 distinct symbols in 2v+).
  const fileIds = {};
  for (const id of ids) fileIds[id] = hostFileId;
  if ((pair === 'independent' || pair === 'multi-independent') && fileIds.B != null) {
    fileIds.B = independentFileId;
  }
  if (pair === 'multi-independent' && fileIds.C != null) {
    fileIds.C = independentFileIdC;
  }
  const cols = panels === 1 ? 1 : 2;
  const rows = panels <= 2 ? 1 : 2;
  const buildId = '20260717b79';

  const cfg = { pair, panels, tf, ids, iframeIds, fileIds, hostFileId, cols, rows };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Talaria multichart harness host</title>
  <script>
    // Host is the PARENT page (dist-v9 parent equivalent): NOT an embed panel,
    // NOT embed-lite. Only ?multichart=1 iframe panels set those.
    window.__TALARIA_CHART_BUILD_ID = '${buildId}';
  </script>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #07080E; overflow: hidden; }
    #grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: 2px; }
    .cell { position: relative; overflow: hidden; background: #000; }
    /* Host chart DOM fills tile A (matches chart-embed.html base rules). */
    #chart-container, #chartWrapper { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; touch-action: none; }
    #chartCanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: transparent; }
    #drawingSvg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; overflow: hidden; }
    #priceAxisZone { position: absolute; right: 0; top: 5px; bottom: 30px; width: 14px; background: transparent; z-index: 5; cursor: ns-resize; }
    #timeAxisZone { position: absolute; left: 0; right: 60px; bottom: 0; height: 10px; background: transparent; z-index: 5; cursor: ew-resize; }
    .crosshair-vertical, .crosshair-horizontal { position: absolute; pointer-events: none; z-index: 10; display: none; }
    .price-label, .time-label { position: absolute; pointer-events: none; z-index: 20; display: none; }
    #orderPanel { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; visibility: hidden; pointer-events: none; }
  </style>
  <!-- Parent bridge stack (order matters: manager needs MultichartGuards).
       engine-api-guards → window.MultichartGuards
       sync-bridge       → window.MultichartBridge.installBridge (host bridge)
       multichart-manager→ window.MultichartManager (+ addHostChart)
       These are the SAME parent scripts MultichartGrid.loadParentBridge loads
       (embed-bridge.js / panel-cmd-bridge.js are iframe-only; excluded). -->
  <script>
  (function () {
    function inject(src) { var s = document.createElement('script'); s.src = src; s.async = false; document.head.appendChild(s); }
    inject('/chart/multichart-prod/engine-api-guards.js');
    inject('/chart/multichart-prod/sync-bridge.js');
    inject('/chart/multichart-prod/multichart-manager.js');
  })();
  </script>
  <!-- Auth gate + user-scoped storage stub (same as chart-embed.html). -->
  <script>
  (function () {
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.user && d.user.id) {
          window.__talariaUserId = d.user.id;
          try { localStorage.setItem('_uid', String(d.user.id)); } catch (e) {}
        }
      })
      .catch(function () {});
    var uid = null;
    try { uid = localStorage.getItem('_uid'); } catch (e) {}
    window.userKey = function (key) {
      var id = uid || window.__talariaUserId;
      if (!id) { try { id = localStorage.getItem('_uid'); } catch (e) {} }
      if (id) { uid = id; return 'u' + id + '_' + key; }
      return key;
    };
    window.userStorage = {
      getItem: function (key) { var s = localStorage.getItem(window.userKey(key)); return s !== null ? s : localStorage.getItem(key); },
      setItem: function (key, val) { localStorage.setItem(window.userKey(key), val); },
      removeItem: function (key) { localStorage.removeItem(window.userKey(key)); },
    };
  })();
  </script>
  <script>
    window.waitForD3 = new Promise(function (resolve, reject) { window.__resolveD3 = resolve; window.__rejectD3 = reject; });
  </script>
  <script src="/chart/vendor/d3.min.js" onload="window.__resolveD3 && window.__resolveD3();" onerror="window.__rejectD3 && window.__rejectD3(new Error('d3 load failed'));"></script>
  <script defer src="/chart/vendor/lz-string.min.js"></script>
  <!-- Real engine + modules (exact chart-embed.html list) via deferred scripts.
       chart.js auto-inits window.chart on DOMContentLoaded once #chartCanvas
       (statically present in tile A below) exists and d3 has resolved. -->
  <script>
  (function () {
    var paths = ${JSON.stringify(ENGINE_MODULE_PATHS)};
    for (var i = 0; i < paths.length; i++) {
      document.write('<script defer src="' + paths[i] + '"><\\/script>');
    }
  })();
  </script>
  <script>
    if (typeof window.getActiveChart !== 'function') { window.getActiveChart = function () { return window.chart || null; }; }
    if (!window.panelDrawingSync) {
      window.panelDrawingSync = {
        enabled: false,
        hasSameSymbol: function () { return true; },
        syncDrawing: function () {}, syncAllDrawings: function () {},
        isSameDrawing: function () { return false; },
        normalizeDrawingForTarget: function (d) { return d; },
      };
    }
  </script>
</head>
<body>
  <div id="grid">
    <!-- Tile A = the PARENT's real in-process window.chart (host), not an
         iframe. Its chart DOM is static so chart.js auto-init finds #chartCanvas. -->
    <div class="cell" data-cell="A">
      <div id="chart-container">
        <div id="chartWrapper" class="chart-wrapper">
          <canvas id="chartCanvas"></canvas>
          <svg id="drawingSvg"></svg>
          <div id="priceAxisZone" class="axis-cursor-zone price-axis-zone"></div>
          <div id="timeAxisZone" class="axis-cursor-zone time-axis-zone"></div>
          <div class="crosshair-vertical"></div>
          <div class="crosshair-horizontal"></div>
          <div class="price-label"></div>
          <div class="time-label"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="orderPanel" aria-hidden="true">
    <input id="orderEntryPrice" type="hidden" value="0" />
    <input id="orderQuantity" type="hidden" value="1" />
  </div>
  <!-- Replay toolbar stub (same as chart-embed.html). The host is NOT
       embed-lite, so replay-system.js requires #replayToolbar + #replayModeBtn
       to exist or it logs "Replay toolbar elements missing". -->
  <div id="replayToolbar" aria-hidden="true" style="display:none">
    <div id="replayToolbarHandle" style="display:none;"></div>
    <button type="button" id="replayModeBtn" tabindex="-1"></button>
  </div>
  <!-- T8 step 9: harness topbar TF pill stub (mirrors V9 data-tf active pill). -->
  <button type="button" id="harnessTopbarTf" data-tf="1m"
    style="position:fixed;top:6px;right:8px;z-index:99999;font:12px sans-serif;font-weight:500;padding:4px 8px;background:rgba(74,106,255,0.08);border:none;color:#8af;pointer-events:none">1m</button>
  <script>
  (function () {
    var CFG = ${JSON.stringify(cfg)};
    window.__harnessConfig = CFG;
    var TF = CFG.tf;
    var grid = document.getElementById('grid');
    // Tile A already exists statically (holds the host chart DOM).
    window.__harnessCells = { A: grid.querySelector('[data-cell="A"]') };
    window.__harnessHostId = 'A';
    window.__harnessHostFileId = CFG.hostFileId;
    window.__harnessPanelIds = CFG.iframeIds.slice(); // iframe panels only (B/C/D)
    window.__mgrLog = [];
    window.__harnessHostReady = false;
    window.__harnessBootError = null;

    function pollFor(pred, intervalMs, maxMs, onReady, onTimeout) {
      var t0 = Date.now();
      (function tick() {
        var ok = false;
        try { ok = pred(); } catch (e) {}
        if (ok) { onReady(); return; }
        if (Date.now() - t0 >= maxMs) { onTimeout(); return; }
        setTimeout(tick, intervalMs);
      })();
    }

    // ── Step 1: wait for the real host chart (auto-inited by chart.js) +
    //            the parent bridge globals, then LOAD the host's file. ──
    pollFor(function () {
      return !!window.chart && typeof window.chart.loadFileData === 'function'
        && !!window.MultichartGuards && !!window.MultichartBridge && !!window.MultichartManager;
    }, 100, 60000, bootHost, function () {
      window.__harnessBootError = 'host chart / bridge globals never appeared';
      try { console.error('[harness-host] ' + window.__harnessBootError); } catch (e) {}
    });

    function bootHost() {
      var ch = window.chart;
      // Boot the host owner exactly like a live parent pair-load: hint the tf,
      // set the fileId, then loadFileData (no mode= → no auto-load, so this is
      // the single owner acquisition for fileId ${hostFileId}).
      try { ch.currentFileId = String(CFG.hostFileId); } catch (e) {}
      try { if (typeof ch.currentTimeframe === 'string') ch.currentTimeframe = TF; } catch (e) {}
      var p;
      try { p = ch.loadFileData(String(CFG.hostFileId)); } catch (e) {
        window.__harnessBootError = 'host loadFileData threw: ' + (e && e.message || e);
        return;
      }
      var afterHostLoad = function () {
        try { if (typeof ch.render === 'function') ch.render(); } catch (e) {}
        wireManager(ch);
      };
      if (p && typeof p.then === 'function') p.then(afterHostLoad, function (err) {
        window.__harnessBootError = 'host loadFileData failed: ' + (err && err.message || err);
      });
      else afterHostLoad();
    }

    // ── Step 2: create the manager, install + register the host bridge on
    //            window.chart, then add B/C/D as chart-embed iframes. ──
    function wireManager(ch) {
      var mgr = new window.MultichartManager({
        container: grid,
        silentPanelBoot: true,
        deferInitialRangeSync: false,
        iframeSrcBuilder: function (cfg2, params) {
          params.set('multichart', '1');
          // Diag reporter derives panelId from ?panelId=; manager sets ?id=.
          params.set('panelId', cfg2.id);
          return '/chart/multichart-prod/chart-embed.html?' + params.toString();
        },
        onLog: function (e) { window.__mgrLog.push(e); },
        onState: function (id, state) {
          harnessFocusMirrorOnState(id, state);
        },
      });
      window.__harnessManager = mgr;
      window.__harnessFocusedPanelId = 'A';
      window.__harnessLastFocusMirrorKey = '';

      function mcPanelTfLabelSyncEnabled() {
        return window.__TALARIA_MC_PANEL_TF_LABEL_SYNC !== false;
      }
      function chartTfToV9Harness(cTf) {
        if (!cTf) return null;
        var s = String(cTf).toLowerCase().trim();
        if (s === '1mo') return '1M';
        if (/^\\d+h$/.test(s)) return s.toUpperCase();
        if (/^\\d+d$/.test(s) || /^\\d+w$/.test(s)) return s.toUpperCase();
        return s;
      }
      function readPanelStateHarness(panelId) {
        if (panelId === 'A') {
          var host = window.chart;
          if (!host) return null;
          return { timeframe: host.currentTimeframe || null };
        }
        var ent = mgr.charts && mgr.charts.get(panelId);
        if (!ent || !ent.state) return null;
        return { timeframe: ent.state.timeframe || null };
      }
      function setHarnessTopbarTf(v9tf) {
        if (!v9tf) return;
        window.__harnessTopbarTf = v9tf;
        var el = document.getElementById('harnessTopbarTf');
        if (el) {
          el.setAttribute('data-tf', v9tf);
          el.textContent = v9tf;
          el.style.fontWeight = '700';
        }
      }
      function dispatchHarnessFocusChanged(panelId, force) {
        if (!mcPanelTfLabelSyncEnabled()) return;
        var st = readPanelStateHarness(panelId);
        var key = String(panelId) + '|' + String(st && st.timeframe || '');
        if (!force && key === window.__harnessLastFocusMirrorKey) return;
        window.__harnessLastFocusMirrorKey = key;
        var mapped = chartTfToV9Harness(st && st.timeframe);
        if (mapped) setHarnessTopbarTf(mapped);
        try {
          window.dispatchEvent(new CustomEvent('multichartFocusChanged', {
            detail: { panelId: panelId, timeframe: st && st.timeframe || null },
          }));
        } catch (_) {}
      }
      window.harnessFocusMirrorOnState = function (id, state) {
        if (!mcPanelTfLabelSyncEnabled()) return;
        if (id !== window.__harnessFocusedPanelId) return;
        if (state && state.timeframe && Number(state.candleCount) > 0) {
          window.__harnessLastFocusMirrorKey = '';
        }
        dispatchHarnessFocusChanged(id, !!(state && state.timeframe && Number(state.candleCount) > 0));
      };
      window.harnessSetFocusedPanel = function (panelId) {
        window.__harnessFocusedPanelId = panelId || 'A';
        window.__harnessLastFocusMirrorKey = '';
        dispatchHarnessFocusChanged(window.__harnessFocusedPanelId, true);
      };

      // Install the host bridge on window.chart and register it as the HOST
      // panel — mirrors MultichartGrid ensureHostBridge + addHostChart +
      // setSyncModeGate. The manager now treats A as the in-process host, so
      // every fan-out (crosshair / range / replay) includes it.
      try {
        var hostBridge = window.MultichartBridge.installBridge(ch, { chartId: 'A', parentOrigin: '*', verbose: false });
        window.__harnessHostBridge = hostBridge;
        mgr.addHostChart({ id: 'A', tf: TF, fileId: CFG.hostFileId }, hostBridge);
        if (hostBridge && typeof hostBridge.setSyncModeGate === 'function') {
          hostBridge.setSyncModeGate(mgr.syncMode);
        }
      } catch (e) {
        window.__harnessBootError = 'host bridge install/register failed: ' + (e && e.message || e);
        try { console.error('[harness-host] ' + window.__harnessBootError); } catch (_) {}
      }

      // Row 13: hydrate panel count from chart_panel_state when URL panels=1.
      var iframeIds = CFG.iframeIds.slice();
      try {
        if (!window.__TALARIA_DISABLE_LAYOUT_PERSIST_V2) {
          var rawLayout = localStorage.getItem('chart_panel_state');
          if (rawLayout) {
            var stLayout = JSON.parse(rawLayout);
            var ly = stLayout && stLayout.layout != null ? String(stLayout.layout) : '';
            if (ly === '2v' || ly === '2h' || ly === '2') {
              if (iframeIds.indexOf('B') < 0) iframeIds.push('B');
            }
          }
        }
      } catch (e) { /* corrupt blob → silent single */ }

      iframeIds.forEach(function (id) {
        if (window.__harnessCells[id]) return;
        if (id === 'B' && iframeIds.length > 0) {
          grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
          grid.style.gridTemplateRows = 'repeat(1, 1fr)';
        }
        var d = document.createElement('div');
        d.className = 'cell';
        d.setAttribute('data-cell', id);
        grid.appendChild(d);
        window.__harnessCells[id] = d;
        var fid = CFG.fileIds[id] != null ? CFG.fileIds[id] : CFG.hostFileId;
        mgr.addChart({ id: id, tf: TF, fileId: fid }, d);
      });

      // Faithful multichart replay fan-out: host replay-system gates broadcast on
      // __multichartGrid (see replay-system.js _multichartBroadcastReplayFrame).
      function tfToMs(tf) {
        if (!tf) return null;
        var ch = window.chart;
        if (ch && typeof ch.parseTimeframe === 'function') {
          var p = Number(ch.parseTimeframe(tf));
          if (isFinite(p) && p > 0) return p;
        }
        var map = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
          '1h': 3600000, '4h': 14400000, '1d': 86400000 };
        var k = String(tf).toLowerCase().trim();
        return map[k] != null ? map[k] : null;
      }
      function finestReplayCadenceMs() {
        if (window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE) return null;
        var minMs = null;
        function consider(ch) {
          if (!ch || !ch.currentTimeframe) return;
          var ms = tfToMs(ch.currentTimeframe);
          if (isFinite(ms) && ms > 0) minMs = minMs == null ? ms : Math.min(minMs, ms);
        }
        consider(window.chart);
        if (mgr && mgr.charts && typeof mgr.charts.values === 'function') {
          mgr.charts.forEach(function (c) {
            if (!c || c.host) return;
            try { consider(c.frame && c.frame.contentWindow && c.frame.contentWindow.chart); } catch (e) {}
          });
        }
        return minMs;
      }
      function refreshFinestReplayCadence() {
        if (window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE) return;
        try {
          var rs = window.chart && window.chart.replaySystem;
          if (rs && typeof rs._onFinestTfCadencePanelsChanged === 'function') {
            rs._onFinestTfCadencePanelsChanged();
          }
        } catch (e) {}
      }
      // MC-PEER-DESELECT-SCOPE: mirror MultichartGrid cancelScheduledPeerDeselect export + guarded handlers.
      var _peerDeselectTimers = {};
      function cancelScheduledPeerDeselect(panelId) {
        var pid = panelId != null ? String(panelId) : '';
        if (_peerDeselectTimers[pid]) {
          clearTimeout(_peerDeselectTimers[pid]);
          delete _peerDeselectTimers[pid];
        }
      }
      function focusPanelById(panelId) {
        if (panelId != null && typeof window.harnessSetFocusedPanel === 'function') {
          window.harnessSetFocusedPanel(String(panelId));
        }
      }
      function multichartPeerDeselectV1Enabled() {
        return !(typeof window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1 === 'boolean'
          && window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1 === true);
      }
      window.addEventListener('message', function (ev) {
        try {
          var msg = ev.data;
          if (!msg || typeof msg !== 'object' || !msg.type) return;
          if (msg.type === 'multichart-clear-drawing-ui') {
            var sourceId = msg.source != null ? String(msg.source) : null;
            var grid = window.__multichartGrid;
            if (multichartPeerDeselectV1Enabled() && sourceId && grid
              && typeof grid.cancelScheduledPeerDeselect === 'function') {
              grid.cancelScheduledPeerDeselect(sourceId);
            }
            if (grid && typeof grid.focusPanelById === 'function' && sourceId) {
              grid.focusPanelById(sourceId);
            }
            return;
          }
          if (msg.type === 'multichart-drawing-selected') {
            var src = msg.source != null ? String(msg.source) : null;
            var g = window.__multichartGrid;
            if (g && typeof g.cancelScheduledPeerDeselect === 'function' && src) {
              g.cancelScheduledPeerDeselect(src);
            }
            if (g && typeof g.focusPanelById === 'function' && src) {
              g.focusPanelById(src);
            }
          }
        } catch (_) {}
      });
      function getChartForPanelId(panelId) {
        var pid = panelId != null ? String(panelId) : (window.__harnessFocusedPanelId || 'A');
        if (pid === 'A') return window.chart || null;
        var ent = mgr.charts && mgr.charts.get(pid);
        if (!ent || ent.host || !ent.frame) return null;
        try {
          var cw = ent.frame.contentWindow;
          return (cw && cw.chart) || null;
        } catch (_) {
          return null;
        }
      }
      window.__multichartGrid = {
        hostPanelId: 'A',
        getPanelIds: function () { return ['A'].concat(iframeIds); },
        getFocusedPanelId: function () { return window.__harnessFocusedPanelId || 'A'; },
        getChartForPanelId: getChartForPanelId,
        getChartForPanel: getChartForPanelId,
        getFinestReplayCadenceMs: finestReplayCadenceMs,
        refreshFinestReplayCadence: refreshFinestReplayCadence,
        cancelScheduledPeerDeselect: cancelScheduledPeerDeselect,
        focusPanelById: focusPanelById,
      };

      window.__harnessHostReady = true;
    }
  })();
  </script>
</body>
</html>`;
}

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch (_e) {
      res.writeHead(400); res.end('Bad request'); return;
    }
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/harness/host.html') {
      const body = hostPageHtml(url.searchParams);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }
    if (pathname.startsWith('/api/')) { handleApi(req, res, url); return; }
    if (pathname.startsWith('/chart/')) { serveStatic(res, pathname.slice('/chart/'.length)); return; }
    if (pathname === '/login/' || pathname.startsWith('/login')) {
      // chart-embed redirects here only when auth fails; should never happen.
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>login stub</title>login');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + pathname);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
        getApiLog: () => apiLog.slice(),
        // Task 4.2: each scenario counts only the fetches IT triggered, so the
        // runner clears the log after boot / before the gesture under test.
        resetApiLog: () => { apiLog.length = 0; },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// Allow `node serve.mjs` for standalone debugging.
const invokedDirectly = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (invokedDirectly) {
  const port = parseInt(process.env.PORT || '8791', 10);
  startServer(port).then((h) => {
    console.log(`[serve] canonical chart tree: ${CHART_ROOT}`);
    console.log(`[serve] listening on ${h.url}`);
    console.log(`[serve] host page: ${h.url}/harness/host.html`);
  });
}
