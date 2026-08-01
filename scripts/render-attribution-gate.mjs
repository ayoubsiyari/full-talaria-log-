/**
 * render-attribution-gate.mjs — where do the ~240 ms/s of render occupancy actually go?
 *
 * The mirror-paint occupancy gate established, in a live 4-panel browser session, that chart
 * render costs 234-259 ms/s of main-thread occupancy across host+panels. That corroborates B's
 * 200 ms/s and refutes the 0.6%-of-freeze reading. It did not say WHICH work inside render owns
 * it, so this gate breaks the number down per function, per realm, per REGIME-01 arm.
 *
 * SELF TIME, NOT INCLUSIVE. Every instrumented function maintains a call stack: on exit a frame
 * reports (elapsed - time spent in tracked children), and adds its own elapsed to its parent's
 * child total. Inclusive timing would show drawIndicators at 200 ms/s and its callee at 190 ms/s
 * and invite fixing the wrong one. Work in untracked helpers is attributed to the nearest tracked
 * ancestor, so a large self time means "here or below here, and nothing tracked below".
 *
 * REGIME-01: both arms, zero trades and trades seeded into closedPositions and verified.
 *
 * Usage: node scripts/render-attribution-gate.mjs [--observe-ms=8000] [--trades=43] [--json]
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    findLocalChromiumBrowser,
    runHeadlessUrl,
    browserVersionLabel
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';

export const RENDER_ATTRIBUTION_SIGNATURE = 'TALARIA_RENDER_ATTRIBUTION_V1';

/** Timed on the chart. Absent methods simply report zero, so over-listing is safe. */
const CHART_METHODS = [
    'render', 'calculateScales', 'drawGrid', 'drawCandles', 'drawKline', 'drawLineChart',
    'drawIndicators', 'drawIndicatorsOptimized', 'renderSeparatePanelIndicators',
    'drawAxes', 'drawPriceLine', 'drawCurrentPriceLabel', 'redrawDrawings',
    'drawEconomicCalendarAxisMarkers', 'syncOverlayIndicatorSelectionOverlay',
    '_syncOrderOverlaysDuringPan', '_paintSeparatePanelStackBackground', 'constrainOffset',
    'getDisplaySeries', 'getResampledSeries', 'drawVolumeBars', 'drawCrosshair',
    '_paintEmptyChartPlaceholder', 'updateChartData', 'updateChartWithAnimatedCandle'
];

/** Timed on the order manager: the trades x bars term lives here. */
const OM_METHODS = [
    'updatePositions', 'drawOrderLines', 'updateOrderLines', 'drawExitMarker',
    'drawPositionMarkers', '_chartIndexForCloseMarkerOnChart', 'drawTradeMarkers',
    'renderOrderOverlays', 'updateOrderOverlayPositions'
];

/* ------------------------------------------------------------------ server */

function send(res, code, body, type = 'text/plain; charset=utf-8') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
}

async function readRequestJson(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

function proxyToHarness(harness, req, res) {
    const target = new URL(req.url, harness.url);
    const upstream = http.request(
        { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
        (up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); }
    );
    upstream.on('error', (e) => { try { send(res, 502, `proxy error: ${e.message}`); } catch { /* sent */ } });
    req.pipe(upstream);
}

async function startGateServer({ harness, hostHtml, onReport }) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (req.method === 'POST' && url.pathname === '/report') {
            const report = await readRequestJson(req);
            if (onReport) onReport(report);
            res.writeHead(204, { 'Cache-Control': 'no-store' });
            res.end();
            return;
        }
        if (url.pathname === '/' || url.pathname === '/attr-host.html') {
            send(res, 200, hostHtml, 'text/html; charset=utf-8');
            return;
        }
        proxyToHarness(harness, req, res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                url: `http://127.0.0.1:${server.address().port}`,
                close: async () => {
                    await new Promise((r) => server.close(() => r()));
                    await harness.close?.();
                }
            });
        });
    });
}

/* ------------------------------------------------------------------ page */

function hostPageHtml({ observeMs, settleMs, trades, speed, tf }) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>render attribution</title>
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07080e}</style></head>
<body>
<iframe id="harness" src="/harness/host.html?panels=4&tf=${encodeURIComponent(tf)}&pair=same&hostFile=25"></iframe>
<script>
const OBSERVE_MS = ${Number(observeMs)};
const SETTLE_MS  = ${Number(settleMs)};
const TRADES     = ${Number(trades)};
const SPEED      = ${Number(speed)};
const CHART_METHODS = ${JSON.stringify(CHART_METHODS)};
const OM_METHODS = ${JSON.stringify(OM_METHODS)};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hw = () => document.getElementById('harness').contentWindow;

async function waitReady(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const w = hw();
      if (w && w.chart && Array.isArray(w.chart.data) && w.chart.data.length > 50 && w.chart.replaySystem) return true;
    } catch (_e) { /* booting */ }
    await sleep(250);
  }
  return false;
}

function chartWindows(hostWin) {
  const out = [{ id: 'host', win: hostWin }];
  let frames = [];
  try { frames = Array.from(hostWin.document.querySelectorAll('iframe')); } catch (_e) { frames = []; }
  frames.forEach((f, i) => {
    let cw = null;
    try { cw = f.contentWindow; } catch (_e) { cw = null; }
    if (cw && cw.chart) out.push({ id: 'panel' + (i + 1), win: cw });
  });
  return out;
}

/** Self-time accounting: a frame's elapsed minus time spent inside tracked children. */
function installAttribution(w) {
  if (w.__attr) return w.__attr;
  const st = { rows: Object.create(null), stack: [], wrapped: [] };
  const bump = (name, selfMs) => {
    const r = st.rows[name] || (st.rows[name] = { selfMs: 0, calls: 0 });
    r.selfMs += selfMs; r.calls += 1;
  };
  const wrap = (obj, name, label) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name].bind(obj);
    obj[name] = function (...args) {
      const frame = { t0: w.performance.now(), childMs: 0 };
      st.stack.push(frame);
      try {
        return orig(...args);
      } finally {
        st.stack.pop();
        const elapsed = w.performance.now() - frame.t0;
        bump(label, elapsed - frame.childMs);
        const parent = st.stack[st.stack.length - 1];
        if (parent) parent.childMs += elapsed;
      }
    };
    st.wrapped.push(label);
  };
  for (const m of CHART_METHODS) wrap(w.chart, m, m);
  const om = w.chart && w.chart.orderManager;
  for (const m of OM_METHODS) wrap(om, m, 'om.' + m);
  w.__attr = st;
  return st;
}

function resetAttribution(w) {
  const st = w.__attr;
  if (!st) return;
  st.rows = Object.create(null);
  st.stack.length = 0;
}

function collect(hostWin) {
  const realms = hostWin.__attrRealms || [];
  const total = Object.create(null);
  const perRealm = [];
  for (const r of realms) {
    const st = r.win.__attr;
    if (!st) continue;
    const rows = [];
    for (const k of Object.keys(st.rows)) {
      const v = st.rows[k];
      rows.push({ name: k, selfMs: Number(v.selfMs.toFixed(2)), calls: v.calls });
      const t = total[k] || (total[k] = { selfMs: 0, calls: 0 });
      t.selfMs += v.selfMs; t.calls += v.calls;
    }
    rows.sort((a, b) => b.selfMs - a.selfMs);
    perRealm.push({ id: r.id, rows: rows.slice(0, 12), wrapped: st.wrapped.length });
  }
  const totals = Object.keys(total)
    .map((k) => ({ name: k, selfMs: Number(total[k].selfMs.toFixed(2)), calls: total[k].calls }))
    .sort((a, b) => b.selfMs - a.selfMs);
  return { totals, perRealm };
}

function seedTrades(w, n) {
  const om = w.chart && w.chart.orderManager;
  if (!om) return { ok: false, count: 0 };
  if (!Array.isArray(om.closedPositions)) om.closedPositions = [];
  const data = w.chart.data;
  const before = om.closedPositions.length;
  for (let i = 0; i < n; i++) {
    const bar = data[Math.floor(data.length * (0.1 + 0.8 * (i / Math.max(1, n))))] || data[0];
    const px = Number(bar.c) || 1;
    om.closedPositions.push({
      id: 'seed-' + i, ticker: w.chart.currentSymbol, symbol: w.chart.currentSymbol,
      direction: i % 2 ? 'buy' : 'sell', type: i % 2 ? 'buy' : 'sell',
      entryPrice: px, exitPrice: px * 1.001, price: px,
      entryTime: Number(bar.t), closeTime: Number(bar.t) + 60000, openTime: Number(bar.t),
      lotSize: 0.1, size: 0.1, pnl: 1, profit: 1, status: 'closed', closed: true
    });
  }
  return { ok: om.closedPositions.length === before + n, count: om.closedPositions.length };
}

async function arm(w, { regime, tradeCount }) {
  const realms = w.__attrRealms;
  for (const r of realms) {
    const om = r.win.chart && r.win.chart.orderManager;
    if (om && Array.isArray(om.closedPositions)) om.closedPositions.length = 0;
  }
  let seeded = 0;
  if (tradeCount > 0) {
    // Seed in EVERY realm: the panels are where the drawing happens, and a host-only seed would
    // report a trade-bearing arm whose panels are empty.
    for (const r of realms) seeded += seedTrades(r.win, tradeCount).count;
  }
  const rs = w.chart.replaySystem;
  if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
    rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
    await sleep(600);
  }
  if (typeof rs.seekToIndex === 'function') rs.seekToIndex(Math.max(10, Math.floor(w.chart.data.length * 0.1)));
  if (typeof rs.setSpeed === 'function') rs.setSpeed(SPEED); else rs.speed = SPEED;
  const idx0 = rs.currentIndex;
  if (typeof rs.play === 'function') rs.play();
  await sleep(SETTLE_MS);
  for (const r of realms) resetAttribution(r.win);
  const t0 = w.performance.now();
  await sleep(OBSERVE_MS);
  const wallMs = w.performance.now() - t0;
  const snap = collect(w);
  if (typeof rs.pause === 'function') rs.pause();
  await sleep(200);
  const seconds = wallMs / 1000;
  return {
    regime, tradeCount, seededTotal: seeded, wallMs: Math.round(wallMs),
    indexAdvanced: rs.currentIndex - idx0,
    totals: snap.totals.map((r) => ({ ...r, msPerSec: Number((r.selfMs / seconds).toFixed(2)) })),
    perRealm: snap.perRealm
  };
}

(async () => {
  const out = { signature: ${JSON.stringify(RENDER_ATTRIBUTION_SIGNATURE)}, arms: [], error: null };
  try {
    if (!await waitReady(120000)) throw new Error('chart not ready');
    const w = hw();
    await sleep(3000);
    const realms = chartWindows(w);
    for (const r of realms) installAttribution(r.win);
    w.__attrRealms = realms;
    out.realms = realms.map((r) => r.id);
    out.barCount = w.chart.data.length;
    for (const tradeCount of [0, TRADES]) {
      out.arms.push(await arm(w, { regime: tradeCount === 0 ? 'LAG-ZT' : 'trade-bearing', tradeCount }));
    }
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  await fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
})();
</script></body></html>`;
}

/* ------------------------------------------------------------------ output */

export function formatAttribution(report) {
    const lines = [];
    lines.push('');
    lines.push(`Render attribution — self time, live 4-panel browser, realms: ${(report.realms || []).join(', ')}`);
    lines.push(`bars=${report.barCount}`);
    for (const a of report.arms || []) {
        const total = (a.totals || []).reduce((s, r) => s + r.msPerSec, 0);
        lines.push('');
        lines.push(`  ${a.regime}  trades=${a.tradeCount} (seeded ${a.seededTotal} across realms)  `
            + `wall=${a.wallMs}ms  idx+${a.indexAdvanced}  TOTAL TRACKED ${total.toFixed(1)} ms/s`);
        lines.push('    function                                  ms/s     calls   share');
        for (const r of (a.totals || []).slice(0, 14)) {
            if (r.msPerSec < 0.05) continue;
            const share = total > 0 ? (r.msPerSec / total) * 100 : 0;
            lines.push(`    ${r.name.padEnd(40)}${String(r.msPerSec).padStart(8)}${String(r.calls).padStart(9)}`
                + `${share.toFixed(1).padStart(8)}%`);
        }
    }
    const zt = (report.arms || []).find((a) => a.regime === 'LAG-ZT');
    const tb = (report.arms || []).find((a) => a.regime === 'trade-bearing');
    if (zt && tb) {
        lines.push('');
        lines.push('  REGIME-01 delta (trade-bearing minus zero-trade), the trades x bars term:');
        const byName = new Map(zt.totals.map((r) => [r.name, r.msPerSec]));
        const deltas = tb.totals
            .map((r) => ({ name: r.name, d: Number((r.msPerSec - (byName.get(r.name) || 0)).toFixed(2)) }))
            .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
            .slice(0, 8);
        for (const d of deltas) {
            if (Math.abs(d.d) < 0.05) continue;
            lines.push(`    ${d.name.padEnd(40)}${(d.d > 0 ? '+' : '') + d.d} ms/s`);
        }
    }
    return lines.join('\n');
}

/* ------------------------------------------------------------------ runner */

export async function runRenderAttributionGate({
    observeMs = 8000, settleMs = 1500, trades = 43, speed = 60, tf = '15m',
    timeoutMs = 240_000, requireBrowser = false,
    findBrowser = findLocalChromiumBrowser, runBrowser = runHeadlessUrl
} = {}) {
    const browserPath = findBrowser();
    if (!browserPath) {
        return { ok: false, status: requireBrowser ? 'RED' : 'SKIP', signature: RENDER_ATTRIBUTION_SIGNATURE, error: 'no Chromium browser', report: null };
    }
    let handle;
    let resolveReport;
    const reportPromise = new Promise((r) => { resolveReport = r; });
    try {
        const harness = await startHarnessServer(0);
        handle = await startGateServer({
            harness,
            hostHtml: hostPageHtml({ observeMs, settleMs, trades, speed, tf }),
            onReport: resolveReport
        });
        const run = await runBrowser({
            browserPath, url: `${handle.url}/attr-host.html`, reportPromise, timeoutMs,
            profilePrefix: 'talaria-render-attr-'
        });
        const report = run.report;
        if (!report || run.timedOut) {
            return { ok: false, status: 'RED', signature: RENDER_ATTRIBUTION_SIGNATURE, error: `no /report within ${timeoutMs}ms`, report: null };
        }
        return {
            ok: !report.error, status: report.error ? 'RED' : 'GREEN',
            signature: RENDER_ATTRIBUTION_SIGNATURE, error: report.error || null, report,
            meta: { browserPath, browser: browserVersionLabel(browserPath), observeMs, trades, speed, tf }
        };
    } finally {
        await handle?.close?.();
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (n, d) => {
        const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
        return hit ? Number(hit.split('=')[1]) : d;
    };
    const result = await runRenderAttributionGate({
        observeMs: arg('observe-ms', 8000), trades: arg('trades', 43), speed: arg('speed', 60), requireBrowser: true
    });
    if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
        if (result.report) console.log(formatAttribution(result.report));
        console.log(`\n${result.status}${result.error ? `: ${result.error}` : ''}`);
    }
    process.exit(result.ok ? 0 : 1);
}
