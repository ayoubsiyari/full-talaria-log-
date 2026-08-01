/**
 * mirror-paint-occupancy-gate.mjs — the host mirror paint fix, priced in ms/s of main-thread
 * occupancy, in a real browser, in BOTH regimes.
 *
 * WHY THIS EXISTS. The engine-level cadence oracle proved 1 paint per tick against 2. A count is
 * not a cost: C's profiler put painting at 0.6% of freeze time while B put render at 200 ms/s of a
 * ~700 ms/s floor, which price the same count at 0.3% or 14%. We have made that substitution twice
 * already (a scheduler rate read as an event rate; a thresholded excess read as an occupancy). So
 * this gate measures wall-clock milliseconds inside chart.render() on a live 4-panel multichart and
 * publishes ms/s, A/B against the shipped kill-switch.
 *
 * WHAT IT WITNESSES. Real Edge, real chart, real replay, real multichart grid — so
 * window.__multichartGrid is genuinely present and _finishMultichartMirrorRender genuinely runs.
 * It is not a model. It times render() entry to exit, which is the unit the redundant paint costs,
 * rather than a downstream proxy such as fillRect.
 *
 * REGIME-01. Two arms: zero trades, and trades seeded into orderManager.closedPositions. The trade
 * arm verifies its own seeding and fails loudly if the seed did not take, because an unseeded
 * "trade-bearing" arm silently measures a second zero-trade session — the exact hole REGIME-01
 * found in the engine oracle's first draft.
 *
 * Usage: node scripts/mirror-paint-occupancy-gate.mjs [--observe-ms=8000] [--trades=43] [--json]
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

export const MIRROR_PAINT_OCCUPANCY_SIGNATURE = 'TALARIA_MIRROR_PAINT_OCCUPANCY_V1';
const FLAG = '__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1';

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

/** Everything that is not our own page is forwarded to the harness, so we stay same-origin. */
function proxyToHarness(harness, req, res) {
    const target = new URL(req.url, harness.url);
    const upstream = http.request(
        { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
        (up) => {
            res.writeHead(up.statusCode || 502, up.headers);
            up.pipe(res);
        }
    );
    upstream.on('error', (e) => { try { send(res, 502, `proxy error: ${e.message}`); } catch { /* headers sent */ } });
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
        if (url.pathname === '/' || url.pathname === '/paint-host.html') {
            send(res, 200, hostHtml, 'text/html; charset=utf-8');
            return;
        }
        proxyToHarness(harness, req, res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: async () => {
                    await new Promise((r) => server.close(() => r()));
                    await harness.close?.();
                }
            });
        });
    });
}

/* ------------------------------------------------------------------ the page */

function hostPageHtml({ observeMs, trades, settleMs, tf = '15m' }) {
    const TF = encodeURIComponent(tf);
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>mirror paint occupancy</title>
<style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07080e}</style></head>
<body>
<iframe id="harness" src="/harness/host.html?panels=4&tf=${TF}&pair=same&hostFile=25"></iframe>
<script>
const OBSERVE_MS = ${Number(observeMs)};
const SETTLE_MS  = ${Number(settleMs)};
const TRADES     = ${Number(trades)};
let   SPEED      = 60;
const SPEED_CANDIDATES = [1, 2, 5, 10, 30, 60];
const FLAG       = ${JSON.stringify(FLAG)};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hw = () => document.getElementById('harness').contentWindow;

async function waitReady(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const w = hw();
      if (w && w.chart && Array.isArray(w.chart.data) && w.chart.data.length > 50
          && w.chart.replaySystem && w.__multichartGrid) return true;
    } catch (_e) { /* iframe not ready */ }
    await sleep(250);
  }
  return false;
}

/**
 * Every realm that owns a chart: the host plus each multichart panel iframe. The host only
 * self-mirrors in tick playback mode; the panels mirror on every broadcast in any mode, so the
 * fan-out cost lives in the panels and a host-only probe reports zero while the path runs 3x.
 */
function allChartWindows(hostWin) {
  const out = [{ id: 'host', win: hostWin }];
  let frames = [];
  try { frames = Array.from(hostWin.document.querySelectorAll('iframe')); } catch (_e) { frames = []; }
  frames.forEach((f, i) => {
    let cw = null;
    try { cw = f.contentWindow; } catch (_e) { cw = null; }
    if (cw && cw.chart && cw.chart.replaySystem) out.push({ id: 'panel' + (i + 1), win: cw });
  });
  return out;
}

/** Time render() entry to exit. Not fillRect: the redundant paint costs the whole render. */
function installProbe(w) {
  if (w.__paintProbe) return w.__paintProbe;
  const chart = w.chart;
  const rs = chart.replaySystem;
  // Reachability counters. Without these, a path that never executes is indistinguishable from a
  // path that executes and costs nothing, and the A/B difference is then pure noise reported as a
  // result. finEntries answers "did the code under test run at all".
  const st = {
    renderMs: 0, renderCalls: 0, mirrorMs: 0, mirrorCalls: 0, depth: 0,
    finEntries: 0, applyEntries: 0, broadcastEntries: 0, hasAnimTrue: 0, gridSeen: 0,
    playbackMode: null, isActive: null
  };
  const origRender = chart.render.bind(chart);
  chart.render = function () {
    const t0 = w.performance.now();
    try { return origRender(); }
    finally {
      const dt = w.performance.now() - t0;
      st.renderMs += dt; st.renderCalls += 1;
      if (st.depth > 0) { st.mirrorMs += dt; st.mirrorCalls += 1; }
    }
  };
  if (typeof rs._finishMultichartMirrorRender === 'function') {
    const origFin = rs._finishMultichartMirrorRender.bind(rs);
    rs._finishMultichartMirrorRender = function (c, o) {
      st.finEntries += 1; st.depth += 1;
      try { return origFin(c, o); } finally { st.depth -= 1; }
    };
  }
  if (typeof rs.applyMultichartMirrorFrame === 'function') {
    const origApply = rs.applyMultichartMirrorFrame.bind(rs);
    rs.applyMultichartMirrorFrame = function (d) { st.applyEntries += 1; return origApply(d); };
  }
  if (typeof rs._multichartBroadcastReplayFrame === 'function') {
    const origBc = rs._multichartBroadcastReplayFrame.bind(rs);
    rs._multichartBroadcastReplayFrame = function () {
      st.broadcastEntries += 1;
      if (w.__multichartGrid) st.gridSeen += 1;
      try {
        const d = typeof rs._buildMultichartReplayFrameDetail === 'function'
          ? rs._buildMultichartReplayFrameDetail() : null;
        if (d && d.animatedCandle && Number.isFinite(Number(d.animatedCandle.t))) st.hasAnimTrue += 1;
      } catch (_e) { /* detail build is best-effort diagnostics */ }
      return origBc();
    };
  }
  w.__paintProbe = st;
  return st;
}

function resetProbe(w) {
  const st = w.__paintProbe;
  st.renderMs = 0; st.renderCalls = 0; st.mirrorMs = 0; st.mirrorCalls = 0;
  st.finEntries = 0; st.applyEntries = 0; st.broadcastEntries = 0; st.hasAnimTrue = 0; st.gridSeen = 0;
  return st;
}

/** Sum every realm's probe: main-thread occupancy is shared across host and panels on one thread. */
function aggregate(hostWin) {
  const realms = hostWin.__probeRealms || [{ id: 'host', win: hostWin }];
  const t = {
    renderMs: 0, renderCalls: 0, mirrorMs: 0, mirrorCalls: 0,
    finEntries: 0, applyEntries: 0, broadcastEntries: 0, hasAnimTrue: 0, perRealm: []
  };
  for (const r of realms) {
    const st = r.win.__paintProbe;
    if (!st) continue;
    t.renderMs += st.renderMs; t.renderCalls += st.renderCalls;
    t.mirrorMs += st.mirrorMs; t.mirrorCalls += st.mirrorCalls;
    t.finEntries += st.finEntries; t.applyEntries += st.applyEntries;
    t.broadcastEntries += st.broadcastEntries; t.hasAnimTrue += st.hasAnimTrue;
    t.perRealm.push({
      id: r.id, renderMs: Number(st.renderMs.toFixed(1)), renderCalls: st.renderCalls,
      mirrorMs: Number(st.mirrorMs.toFixed(1)), mirrorCalls: st.mirrorCalls, finEntries: st.finEntries
    });
  }
  return t;
}

/** Seed real closed positions so the trade arm actually carries trades. Verified by the caller. */
function seedTrades(w, n) {
  const om = w.chart && w.chart.orderManager;
  if (!om) return { ok: false, reason: 'no orderManager', count: 0 };
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
      entryTime: Number(bar.t), closeTime: Number(bar.t) + 60000,
      openTime: Number(bar.t), lotSize: 0.1, size: 0.1,
      pnl: 1, profit: 1, status: 'closed', closed: true
    });
  }
  return { ok: om.closedPositions.length === before + n, count: om.closedPositions.length };
}

function clearTrades(w) {
  const om = w.chart && w.chart.orderManager;
  if (om && Array.isArray(om.closedPositions)) om.closedPositions.length = 0;
  return (om && om.closedPositions && om.closedPositions.length) || 0;
}

async function playFor(w, ms) {
  const rs = w.chart.replaySystem;
  if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
    rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
    await sleep(600);
  }
  if (typeof rs.seekToIndex === 'function') {
    rs.seekToIndex(Math.max(10, Math.floor(w.chart.data.length * 0.1)));
  }
  if (typeof rs.setSpeed === 'function') rs.setSpeed(SPEED); else rs.speed = SPEED;
  const idx0 = rs.currentIndex;
  if (typeof rs.play === 'function') rs.play();
  else if (typeof rs.togglePlay === 'function') rs.togglePlay();
  await sleep(SETTLE_MS);
  for (const r of (w.__probeRealms || [{ id: 'host', win: w }])) resetProbe(r.win);
  const t0 = w.performance.now();
  await sleep(ms);
  const wallMs = w.performance.now() - t0;
  const st = aggregate(w);
  const idx1 = rs.currentIndex;
  if (typeof rs.pause === 'function') rs.pause();
  else if (typeof rs.togglePlay === 'function') rs.togglePlay();
  await sleep(200);
  return {
    wallMs,
    renderMs: st.renderMs, renderCalls: st.renderCalls,
    mirrorMs: st.mirrorMs, mirrorCalls: st.mirrorCalls, perRealm: st.perRealm,
    finEntries: st.finEntries, applyEntries: st.applyEntries,
    broadcastEntries: st.broadcastEntries, hasAnimTrue: st.hasAnimTrue,
    playbackMode: rs.playbackMode, isActive: !!rs.isActive, tickAnimationEnabled: !!rs.tickAnimationEnabled,
    indexAdvanced: idx1 - idx0,
    isPlayingAtEnd: !!rs.isPlaying
  };
}

async function arm(w, { regime, tradeCount, legacy }) {
  // Set it in EVERY realm, not just the host. The predicate climbs self->parent->top, but a host-
  // only write leaves the panels' read path unproven, and the panels are where the mirror runs --
  // an A/B whose legacy arm silently ran the fix is worse than no A/B.
  const realms = w.__probeRealms || [{ id: 'host', win: w }];
  const flagReadPerRealm = [];
  for (const r of realms) {
    try {
      if (legacy) r.win[FLAG] = true;
      else { try { delete r.win[FLAG]; } catch (_e) { r.win[FLAG] = undefined; } }
    } catch (_e) { /* realm may be gone */ }
  }
  for (const r of realms) {
    let seen = null;
    try { seen = !!r.win[FLAG]; } catch (_e) { seen = 'unreadable'; }
    flagReadPerRealm.push({ id: r.id, seen });
  }
  clearTrades(w);
  let seed = { ok: true, count: 0 };
  if (tradeCount > 0) seed = seedTrades(w, tradeCount);
  const run = await playFor(w, OBSERVE_MS);
  const seconds = run.wallMs / 1000;
  return {
    regime, tradeCount, legacy,
    seedOk: seed.ok, tradesOnChart: seed.count,
    flagReadBack: !!w[FLAG], flagReadPerRealm,
    ...run,
    renderMsPerSec: Number((run.renderMs / seconds).toFixed(2)),
    mirrorMsPerSec: Number((run.mirrorMs / seconds).toFixed(2)),
    renderCallsPerSec: Number((run.renderCalls / seconds).toFixed(2))
  };
}

(async () => {
  const out = { signature: ${JSON.stringify(MIRROR_PAINT_OCCUPANCY_SIGNATURE)}, arms: [], error: null };
  try {
    const ready = await waitReady(120000);
    if (!ready) throw new Error('chart/grid not ready in harness iframe');
    const w = hw();
    // Panels boot after the host; give the grid a moment before enumerating realms.
    await sleep(3000);
    let realms = allChartWindows(w);
    for (const r of realms) installProbe(r.win);
    out.realms = realms.map((r) => r.id);
    w.__probeRealms = realms;
    // PREFLIGHT. The mirror only applies when the broadcast detail carries an animated candle
    // (replay-system.js:8693). If no speed produces one, the path under test is dormant and any
    // A/B difference is noise — so find a live speed before measuring, or fail saying so.
    out.speedProbe = [];
    for (const s of SPEED_CANDIDATES) {
      const rs = w.chart.replaySystem;
      if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
        rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        await sleep(500);
      }
      if (typeof rs.seekToIndex === 'function') rs.seekToIndex(Math.max(10, Math.floor(w.chart.data.length * 0.1)));
      if (typeof rs.setSpeed === 'function') rs.setSpeed(s); else rs.speed = s;
      for (const r of (w.__probeRealms||[{id:'host',win:w}])) resetProbe(r.win);
      // Sample the three conditions at replay-system.js:8656 mid-play. Guessing which of them
      // fails is how you end up "fixing" the wrong one.
      const cond = { samples: 0, animating: 0, notFast: 0, tickMode: 0, allThree: 0 };
      const sampler = w.setInterval(() => {
        cond.samples += 1;
        const a = !!rs.animatingCandle;
        const nf = !rs.fastMode;
        const tm = (typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : rs.playbackMode) === 'tick';
        if (a) cond.animating += 1;
        if (nf) cond.notFast += 1;
        if (tm) cond.tickMode += 1;
        if (a && nf && tm) cond.allThree += 1;
      }, 20);
      if (typeof rs.play === 'function') rs.play();
      await sleep(1200);
      if (typeof rs.pause === 'function') rs.pause();
      w.clearInterval(sampler);
      await sleep(150);
      const st = aggregate(w);
      out.speedProbe.push({
        speed: s, broadcastEntries: st.broadcastEntries, hasAnimTrue: st.hasAnimTrue,
        applyEntries: st.applyEntries, finEntries: st.finEntries, cond
      });
    }
    const live = out.speedProbe.filter((r) => r.finEntries > 0).sort((a, b) => b.finEntries - a.finEntries)[0];
    out.chosenSpeed = live ? live.speed : null;
    SPEED = live ? live.speed : SPEED;
    out.gridPresent = !!w.__multichartGrid;
    out.barCount = w.chart.data.length;
    out.symbol = w.chart.currentSymbol;
    // Order matters only for fairness: alternate so drift cannot favour one flag state.
    for (const tradeCount of [0, TRADES]) {
      for (const legacy of [false, true]) {
        out.arms.push(await arm(w, {
          regime: tradeCount === 0 ? 'LAG-ZT' : 'trade-bearing', tradeCount, legacy
        }));
      }
    }
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  await fetch('/report', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out)
  });
})();
</script></body></html>`;
}

/* ------------------------------------------------------------------ assertions */

function cell(name, pass, detail) { return { name, pass, detail }; }

export function assertOccupancyReport(report) {
    const cells = [];
    const arms = (report && report.arms) || [];
    const find = (regime, legacy) => arms.find((a) => a.regime === regime && a.legacy === legacy);

    cells.push(cell('P0 grid present so the mirror path is live', !!report?.gridPresent,
        `__multichartGrid=${report?.gridPresent}`));
    cells.push(cell('P1 four arms measured', arms.length === 4, `arms=${arms.length}`));

    for (const regime of ['LAG-ZT', 'trade-bearing']) {
        const fix = find(regime, false);
        const legacy = find(regime, true);
        if (!fix || !legacy) { cells.push(cell(`P2 ${regime} both flag states present`, false, 'missing arm')); continue; }

        cells.push(cell(`P2 ${regime} replay actually advanced in both arms`,
            fix.indexAdvanced > 0 && legacy.indexAdvanced > 0,
            `fix=${fix.indexAdvanced} legacy=${legacy.indexAdvanced}`));

        cells.push(cell(`P3 ${regime} kill-switch read back as set`,
            fix.flagReadBack === false && legacy.flagReadBack === true,
            `fix=${fix.flagReadBack} legacy=${legacy.flagReadBack}`));

        // P4 is only meaningful once P7 proves the modified block ran. Asserting a sign on a
        // difference between two runs of the SAME code is how noise gets published as a saving.
        const saved = Number((legacy.renderMsPerSec - fix.renderMsPerSec).toFixed(2));
        const blockRan = (fix.mirrorMs || 0) > 0 || (legacy.mirrorMs || 0) > 0;
        cells.push(cell(`P4 ${regime} fix reduces render occupancy`, blockRan ? saved > 0 : true,
            blockRan
                ? `${legacy.renderMsPerSec} -> ${fix.renderMsPerSec} ms/s (saved ${saved})`
                : `NOT ASSERTED - block never executed (see P7); observed delta ${saved} ms/s is noise`));
    }

    const trade = find('trade-bearing', false);
    cells.push(cell('P5 REGIME-01 the trade arm really carried trades', !!trade?.seedOk && (trade?.tradesOnChart || 0) > 0,
        `seedOk=${trade?.seedOk} trades=${trade?.tradesOnChart}`));
    const zt = find('LAG-ZT', false);
    cells.push(cell('P6 REGIME-01 the zero-trade arm really carried none', (zt?.tradesOnChart || 0) === 0,
        `trades=${zt?.tradesOnChart}`));

    // THE REAL BLOCKER. finEntries > 0 proves _finishMultichartMirrorRender runs; mirrorMs > 0 is
    // what proves the paint block INSIDE it runs. Zero means every call took skipRender, so the
    // lines this gate exists to price were never executed and no ms/s figure can be published.
    const anyMirrorMs = arms.some((a) => (a.mirrorMs || 0) > 0);
    const anyFin = arms.some((a) => (a.finEntries || 0) > 0);
    cells.push(cell('P7 the modified paint block actually executed', anyMirrorMs,
        `finEntries>0=${anyFin} (function runs) but mirrorMs>0=${anyMirrorMs} (paint block runs)`));

    return { ok: cells.every((c) => c.pass), cells };
}

export function formatOccupancy(report) {
    const lines = [];
    lines.push('');
    lines.push('Host mirror paint — main-thread occupancy inside chart.render(), live browser');
    lines.push(`  grid=${report.gridPresent}  bars=${report.barCount}  symbol=${report.symbol}`);
    lines.push('');
    lines.push('  regime          trades  flag     render ms/s   mirror ms/s   render/s   idx+');
    for (const a of report.arms || []) {
        lines.push(`  ${String(a.regime).padEnd(15)}${String(a.tradeCount).padStart(4)}   `
            + `${(a.legacy ? 'LEGACY' : 'FIX').padEnd(7)}${String(a.renderMsPerSec).padStart(10)}    `
            + `${String(a.mirrorMsPerSec).padStart(10)}    ${String(a.renderCallsPerSec).padStart(7)}`
            + `${String(a.indexAdvanced).padStart(7)}`);
    }
    lines.push('');
    for (const regime of ['LAG-ZT', 'trade-bearing']) {
        const fix = (report.arms || []).find((a) => a.regime === regime && !a.legacy);
        const leg = (report.arms || []).find((a) => a.regime === regime && a.legacy);
        if (!fix || !leg) continue;
        const saved = leg.renderMsPerSec - fix.renderMsPerSec;
        const pct = leg.renderMsPerSec > 0 ? (saved / leg.renderMsPerSec) * 100 : 0;
        lines.push(`  ${regime}: ${saved.toFixed(1)} ms/s returned to the main thread `
            + `(${pct.toFixed(0)}% of this path's render cost)`);
    }
    return lines.join('\n');
}

/* ------------------------------------------------------------------ runner */

export async function runMirrorPaintOccupancyGate({
    observeMs = 8000,
    settleMs = 1500,
    trades = 43,
    tf = '15m',
    timeoutMs = 240_000,
    requireBrowser = false,
    findBrowser = findLocalChromiumBrowser,
    runBrowser = runHeadlessUrl
} = {}) {
    const startedAt = new Date().toISOString();
    const browserPath = findBrowser();
    if (!browserPath) {
        return {
            ok: false, status: requireBrowser ? 'RED' : 'SKIP',
            signature: MIRROR_PAINT_OCCUPANCY_SIGNATURE,
            error: 'no Chromium-based browser found (Edge/Chrome)', report: null, cells: []
        };
    }
    let handle;
    let resolveReport;
    const reportPromise = new Promise((r) => { resolveReport = r; });
    try {
        const harness = await startHarnessServer(0);
        handle = await startGateServer({
            harness,
            hostHtml: hostPageHtml({ observeMs, trades, settleMs, tf }),
            onReport: resolveReport
        });
        const run = await runBrowser({
            browserPath,
            url: `${handle.url}/paint-host.html`,
            reportPromise,
            timeoutMs,
            profilePrefix: 'talaria-mirror-paint-'
        });
        const report = run.report;
        if (!report || run.timedOut) {
            return {
                ok: false, status: 'RED', signature: MIRROR_PAINT_OCCUPANCY_SIGNATURE,
                error: `no /report within ${timeoutMs}ms`, report: null, cells: [],
                meta: { startedAt, browserPath, stderrTail: run.stderrTail }
            };
        }
        if (report.error) {
            return {
                ok: false, status: 'RED', signature: MIRROR_PAINT_OCCUPANCY_SIGNATURE,
                error: report.error, report, cells: [], meta: { startedAt, browserPath }
            };
        }
        const verdict = assertOccupancyReport(report);
        return {
            ok: verdict.ok, status: verdict.ok ? 'GREEN' : 'RED',
            signature: MIRROR_PAINT_OCCUPANCY_SIGNATURE,
            error: null, report, cells: verdict.cells,
            meta: {
                startedAt, finishedAt: new Date().toISOString(), browserPath,
                browser: browserVersionLabel(browserPath), observeMs, settleMs, trades
            }
        };
    } finally {
        await handle?.close?.();
    }
}

const isMain = process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (n, d) => {
        const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
        return hit ? Number(hit.split('=')[1]) : d;
    };
    const result = await runMirrorPaintOccupancyGate({
        observeMs: arg('observe-ms', 8000),
        trades: arg('trades', 43),
        requireBrowser: true
    });
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        if (result.report) console.log(formatOccupancy(result.report));
        console.log('');
        for (const c of result.cells) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
        console.log(`\n${result.status}${result.error ? `: ${result.error}` : ''}`);
    }
    process.exit(result.ok ? 0 : 1);
}
