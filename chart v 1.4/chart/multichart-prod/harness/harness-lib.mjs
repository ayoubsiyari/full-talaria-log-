/**
 * harness-lib.mjs — Phase-4 Task 4.2 shared plumbing.
 *
 * Boot + gesture + diagnostics helpers reused by every scenario in
 * scenarios.mjs. Keeps run.mjs (the orchestrator) and scenarios.mjs
 * (the assertions) small.
 *
 * TOPOLOGY (Task 4.2 fidelity fix): the harness now mirrors PRODUCTION exactly.
 * Tile A is the PARENT page's REAL in-process `window.chart` (the top main
 * frame), registered with the MultichartManager as the HOST panel via
 * `addHostChart` with the sync-bridge installed on it (see serve.mjs
 * hostPageHtml). Tiles B/C/D are `chart-embed.html` IFRAMES. This makes the
 * host→panel mirror/clone path (embed-bridge `_multichartMirrorViewportFromHost`)
 * and the host-replay / host-TF fan-out paths LIVE, which the previous
 * "all four are iframes" topology left inert.
 *
 * Consequently:
 *   • The HOST (A) lives in the top window — read/drive it via `page.evaluate`
 *     (main-frame context), NOT via an iframe Frame. Its diag.panelId is 'HOST'
 *     (chart.js derives 'HOST' for a non-embed document); helpers relabel it 'A'.
 *   • Only B/C/D are discoverable as iframe Frames (panelFrameMap).
 *   • Same-pair panels mirror the host in-memory → no self /bars fetch; the
 *     host is the single owner that fetches. The deliberate-bug kill-switches
 *     (`__TALARIA_DISABLE_SHARED_BAR_STORE`, `__TALARIA_MC_DISABLE_*`) are
 *     EXISTING engine flags that disable those no-fetch paths, reverting to the
 *     per-panel fetch behaviour for the H-S12 bug proof.
 */

import puppeteer from 'puppeteer';

export const PAINT_TIMEOUT_MS = 90_000;
export const POLL_INTERVAL_MS = 250;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Presentation-only subresources the harness intentionally does not bundle
// (web fonts + favicon). They never touch the engine's data/paint path.
const PRESENTATION_ASSET_RE = /\.(woff2?|ttf|otf|eot)(\?|$)|\/favicon\.ico$/i;
const DATA_REQUEST_RE = /\/api\/file\/[^/]+\/(?:bars|smart|candles)(?:\?|$)/i;

function isIgnorableConsoleError(text, url) {
  if (url && PRESENTATION_ASSET_RE.test(url)) return true;
  return /Failed to load resource/i.test(text) && /\.woff2?(\?|$)/i.test(text);
}

export async function launchBrowser({ headful = false } = {}) {
  return puppeteer.launch({
    headless: !headful,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
}

/**
 * Boot one layout of the harness host page and wait for all panels to paint.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {{url:string}} srv           server handle from serve.mjs
 * @param {object} opts
 *   pair    'same' | 'independent' | 'multi-independent'
 *   panels  1..4
 *   tf      initial timeframe
 *   bug     when true, inject the __TALARIA_DISABLE_SHARED_BAR_STORE
 *           kill-switch into every document BEFORE chart.js boots (the
 *           deliberate-bug proof: re-enables the per-panel fetch path).
 * @returns {Promise<{page, consoleErrors, pageErrors, expectedPanels, close}>}
 */
// Default kill-switch set for the deliberate-bug proof. These are EXISTING
// engine flags (not added by the harness) that DISABLE the panel no-fetch /
// mirror optimizations, reverting to the per-panel fetch behavior the harness
// exists to catch. Enabling them should INCREASE fetches on the paths that are
// otherwise fetch-free.
export const DEFAULT_BUG_SWITCHES = [
  '__TALARIA_DISABLE_SHARED_BAR_STORE',
  '__TALARIA_MC_DISABLE_LAZY_REPLAY_MASTER',
  '__TALARIA_MC_DISABLE_SAMETF_REMIRROR',
];

export async function bootLayout(browser, srv, opts = {}) {
  const { pair = 'same', panels = 4, tf = '1m', bug = false, bugSwitches = null, hostFile = null } = opts;
  const params = new URLSearchParams();
  params.set('pair', pair);
  params.set('panels', String(panels));
  params.set('tf', tf);
  // Optional: pick the HOST/same-pair instrument (default 25). H-S20 uses the
  // deep 400-day instrument (28) to get a coarse-viewport vs fine-master gap.
  if (hostFile != null) params.set('hostFile', String(hostFile));
  const hostUrl = `${srv.url}/harness/host.html?${params.toString()}`;

  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const inFlightDataRequests = new WeakSet();
  let inFlightDataRequestCount = 0;

  const switches = bug ? (bugSwitches && bugSwitches.length ? bugSwitches : DEFAULT_BUG_SWITCHES) : [];
  await page.evaluateOnNewDocument(() => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (/^u\d+_chart_drawings_/.test(key) || /^chart_drawings_/.test(key))) {
          keys.push(key);
        }
      }
      keys.forEach((key) => {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_meta`);
      });
    } catch (_) {}
  });
  if (switches.length) {
    // Runs in EVERY document (host + each iframe) before its own scripts,
    // so the engine sees the flags before chart.js constructs a chart.
    await page.evaluateOnNewDocument((flags) => {
      for (const f of flags) window[f] = true;
    }, switches);
  }

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (DATA_REQUEST_RE.test(url)) {
      inFlightDataRequests.add(req);
      inFlightDataRequestCount++;
    }
    if (PRESENTATION_ASSET_RE.test(url)) {
      req.respond({ status: 200, contentType: 'font/woff2', body: '' }).catch(() => {});
      return;
    }
    req.continue().catch(() => {});
  });
  const markDataRequestDone = (req) => {
    if (!inFlightDataRequests.has(req)) return;
    inFlightDataRequests.delete(req);
    inFlightDataRequestCount = Math.max(0, inFlightDataRequestCount - 1);
  };
  page.on('requestfinished', markDataRequestDone);
  page.on('requestfailed', markDataRequestDone);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const loc = msg.location() || {};
    if (isIgnorableConsoleError(text, loc.url)) return;
    consoleErrors.push(text + (loc.url ? ` @ ${loc.url}` : ''));
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String((err && err.stack) || err));
  });

  await page.goto(hostUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Painted predicate for any chart window (host main-frame or iframe panel).
  const PAINTED_FN = () => {
    const c = window.chart;
    return !!(c && Array.isArray(c.data) && c.data.length > 0 && c._mcDiag && c._mcDiag.renders > 0);
  };
  // Tile A is the in-process HOST; only B/C/D are iframe panels.
  const expectedIframes = Math.max(0, panels - 1);

  const deadline = Date.now() + PAINT_TIMEOUT_MS;
  let hostPainted = false;
  let iframePainted = 0;
  while (Date.now() < deadline) {
    // Host lives in the top window: must be wired AND painted.
    const hostReady = await page.evaluate(() => !!window.__harnessHostReady).catch(() => false);
    hostPainted = hostReady && (await page.evaluate(PAINTED_FN).catch(() => false));
    // Surface a host-side boot error early instead of timing out silently.
    const bootErr = await page.evaluate(() => window.__harnessBootError || null).catch(() => null);
    if (bootErr) throw new Error(`boot: host error — ${bootErr}`);

    let n = 0;
    for (const f of embedFrames(page)) {
      const ok = await f.evaluate(PAINTED_FN).catch(() => false);
      if (ok) n++;
    }
    iframePainted = n;
    if (hostPainted && iframePainted >= expectedIframes) break;
    await sleep(POLL_INTERVAL_MS);
  }
  if (!hostPainted || iframePainted < expectedIframes) {
    throw new Error(`boot: host painted=${hostPainted}, iframe panels ${iframePainted}/${expectedIframes} before timeout`);
  }

  return {
    page,
    consoleErrors,
    pageErrors,
    expectedPanels: panels,
    getInFlightDataRequests: () => inFlightDataRequestCount,
    close: () => page.close().catch(() => {}),
  };
}

export function embedFrames(page) {
  return page.frames().filter((f) => f.url().includes('chart-embed.html'));
}

/** Map panelId ('A'/'B'/…) → puppeteer Frame, derived from the ?panelId= url. */
export function panelFrameMap(page) {
  const map = {};
  for (const f of embedFrames(page)) {
    let id = null;
    try { id = new URL(f.url()).searchParams.get('panelId'); } catch (_) {}
    if (id) map[id] = f;
  }
  return map;
}

/** Per-panel engine snapshot used by every assertion. */
const SNAPSHOT_FN = () => {
  const c = window.chart;
  if (!c) return null;
  const d = Array.isArray(c.data) ? c.data : [];
  const rd = Array.isArray(c.rawData) ? c.rawData : [];
  const rs = c.replaySystem || null;
  // In replay the loaded window is the replay master (fullRawData); rawData is
  // just the display slice up to the playhead. _serverCursors track the loaded
  // window, so the cursor↔edge invariant must compare against the master.
  const full = rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length ? rs.fullRawData : null;
  const cur = c._serverCursors || null;
  const diag = c._mcDiag || {};
  return {
    panelId: diag.panelId || null,
    fileId: c.currentFileId != null ? String(c.currentFileId) : '',
    tf: c.currentTimeframe != null ? String(c.currentTimeframe) : '',
    dataLen: d.length,
    rawLen: rd.length,
    firstBarT: d.length ? Number(d[0].t) : null,
    lastBarT: d.length ? Number(d[d.length - 1].t) : null,
    rawFirstT: rd.length ? Number(rd[0].t) : null,
    rawLastT: rd.length ? Number(rd[rd.length - 1].t) : null,
    // Loaded-window edges used for the cursor invariant (replay master when in
    // replay, else the plain rawData array).
    loadedFirstT: full ? Number(full[0].t) : (rd.length ? Number(rd[0].t) : null),
    loadedLastT: full ? Number(full[full.length - 1].t) : (rd.length ? Number(rd[rd.length - 1].t) : null),
    offsetX: Number(c.offsetX),
    candleWidth: Number(c.candleWidth),
    fetches: Number(diag.fetches) || 0,
    fetchedBars: Number(diag.fetchedBars) || 0,
    ownerFetches: Number(diag.ownerFetches) || 0,
    renders: Number(diag.renders) || 0,
    seams: Number(diag.seams) || 0,
    cursorFirst: cur && cur.firstTs != null ? Number(cur.firstTs) : null,
    cursorLast: cur && cur.lastTs != null ? Number(cur.lastTs) : null,
    hasCursors: !!cur,
    hasMoreLeft: cur ? cur.hasMoreLeft !== false : null,
    panLoading: !!c._panLoading,
    replayActive: !!(rs && rs.isActive),
    replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
    // Replay master (fullRawData) extent — the loaded window replay can seek
    // within WITHOUT a network round-trip. Used by H-S8 to keep the accelerated
    // play strictly inside loaded data (production plays through loaded bars;
    // seeking PAST the last loaded bar is a harness driving artifact that makes
    // the real host clamp while peers over-advance).
    replayMasterFirstT: rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length ? Number(rs.fullRawData[0].t) : null,
    replayMasterLastT: rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length ? Number(rs.fullRawData[rs.fullRawData.length - 1].t) : null,
    // Viewport boot/mirror settle window (embed-bridge markViewportBootSettle /
    // panel-cmd-bridge afterLoadFile). While `perfNow < viewportSettleUntil` the
    // panel DROPS replayTick seeks (unless the parent is actively playing), so a
    // deterministic harness must wait this out before sampling — this exposes
    // the real settled signal instead of guessing with a fixed sleep.
    viewportSettleUntil: Number.isFinite(c._multichartViewportSettleUntil) ? Number(c._multichartViewportSettleUntil) : null,
    perfNow: (typeof performance !== 'undefined' && performance.now) ? Number(performance.now()) : Date.now(),
  };
};

/** True when a panel snapshot is at a quiescent point (no seek/fetch mid-flight). */
export function isPanelQuiescent(p) {
  if (!p) return false;
  if (p.panLoading) return false;
  if (p.viewportSettleUntil != null && p.perfNow != null && p.perfNow < p.viewportSettleUntil) return false;
  return true;
}

/**
 * Snapshot the in-process HOST chart (tile A) from the top main frame.
 * chart.js labels a non-embed document's diag panelId 'HOST'; relabel to 'A'
 * so scenarios can treat the host uniformly with iframe panels B/C/D.
 */
export async function readHost(page) {
  const snap = await page.evaluate(SNAPSHOT_FN).catch(() => null);
  if (snap) snap.panelId = 'A';
  return snap;
}

/** Read every panel's snapshot, keyed by panelId (A = in-process host). */
export async function readPanels(page) {
  const out = {};
  const host = await readHost(page);
  if (host) out.A = host;
  const map = panelFrameMap(page); // iframe panels B/C/D
  for (const [id, f] of Object.entries(map)) {
    out[id] = await f.evaluate(SNAPSHOT_FN).catch(() => null);
  }
  return out;
}

export async function readPanel(page, id) {
  if (id === 'A') return readHost(page);
  const f = panelFrameMap(page)[id];
  if (!f) return null;
  return f.evaluate(SNAPSHOT_FN).catch(() => null);
}

/** Reset the Phase-0 diagnostics counters across host + all iframes. */
export async function resetDiag(page) {
  return page.evaluate(() => {
    if (typeof window.__mcDiagReset === 'function') return window.__mcDiagReset();
    return 0;
  });
}

/** Read the aggregated diag table (host + iframes). */
export async function diagReport(page) {
  return page.evaluate(() => {
    if (typeof window.__mcDiagReport === 'function') return window.__mcDiagReport();
    return null;
  });
}

async function diagRowsByPanelId(page) {
  const rows = await diagReport(page).catch(() => []);
  const out = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const rawId = row && row.panelId != null ? String(row.panelId) : '';
    const id = rawId === 'HOST' ? 'A' : rawId;
    if (id) out[id] = row;
  }
  return out;
}

async function managerBootState(page, ids) {
  return page.evaluate((panelIds) => {
    const mgr = window.__harnessManager;
    const out = {
      hostReady: !!window.__harnessHostReady,
      bootError: window.__harnessBootError || null,
      managerReady: false,
      readyIds: [],
      pendingIds: [],
      cmdPendingIds: [],
      noRevealHold: true,
    };
    if (!mgr || !mgr.charts) return out;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const revealAfter = Number(window.__multichartBootRevealAfter || 0);
    out.noRevealHold = !Number.isFinite(revealAfter) || revealAfter <= now;
    for (const id of panelIds) {
      const entry = mgr.charts.get(id);
      if (entry && entry.ready) out.readyIds.push(id);
      else out.pendingIds.push(id);
      if (entry && !entry.host && !entry.cmdReady) out.cmdPendingIds.push(id);
    }
    out.managerReady = out.hostReady
      && out.pendingIds.length === 0
      && out.cmdPendingIds.length === 0
      && out.noRevealHold;
    return out;
  }, ids).catch((err) => ({
    hostReady: false,
    bootError: err && err.message ? err.message : String(err),
    managerReady: false,
    readyIds: [],
    pendingIds: ids.slice(),
    cmdPendingIds: [],
    noRevealHold: false,
  }));
}

/** Drive the manager's sync toggles the way the real MultichartGrid does. */
export async function setSync(page, on) {
  return page.evaluate((flag) => {
    const mgr = window.__harnessManager;
    if (!mgr || typeof mgr.setSyncMode !== 'function') return false;
    mgr.setSyncMode({
      crosshair: flag,
      visibleRange: flag,
      timeSync: flag,
      symbol: false, // symbol sync stays off — pairs are fixed per scenario
      drawings: flag,
    });
    return true;
  }, !!on);
}

/** Set the manager's interval/timeframe sync intent (used by H-S7). */
export async function setIntervalSync(page, on) {
  // The manager has no dedicated 'interval' flag; interval fan-out is a
  // MultichartGrid concern driven by the topbar. In this harness we model
  // "interval sync OFF" as: the runner simply does NOT broadcast a TF change
  // to peers (it targets a single panel). This helper records intent so a
  // scenario can assert against it, and keeps symbol/visibleRange untouched.
  return page.evaluate((flag) => {
    window.__harnessIntervalSync = !!flag;
    return true;
  }, !!on);
}

/** Cell rect (top-page coords) for a panel. */
async function cellRect(page, id) {
  return page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
}

/**
 * Real-mouse pan into HISTORY on a panel ("drag right" in the Phase-0 matrix
 * sense: reveal older bars). In this engine, panning into the past drives
 * offsetX UP toward maxOffset, which is what triggers a backward load-more; a
 * mouse drag from ~85% → ~15% of the cell width produces that. One stroke pans
 * ~0.7 cell widths, so `screens` strokes pan roughly `screens` screen-widths of
 * history into view.
 *
 * Returns diagnostics captured DURING the last stroke:
 *   offsetBeforeUp — dragged panel's offsetX at the final move (button down)
 *   offsetAfterUp  — offsetX after mouse.up (settle)
 *   midSample      — dragged panel snapshot mid-gesture (for "grows during drag")
 *   endSample      — dragged panel snapshot after release
 */
export async function dragCellRight(page, id, opts = {}) {
  const { screens = 1, stepsPerStroke = 30 } = opts;
  const rect = await cellRect(page, id);
  if (!rect) throw new Error(`dragCellRight: no cell for panel ${id}`);
  // Tile A is the in-process host (main frame); B/C/D are iframe Frames. Both
  // expose the same `.evaluate` interface, so offset/snapshot sampling reads
  // window.chart in the correct context either way.
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  const vw = await page.evaluate(() => window.innerWidth);
  const y = Math.round(rect.y + rect.h * 0.5);
  // Mouse-DOWN must land on this panel's canvas (start the pan on it); the
  // engine sets pointer-capture on mousedown, so subsequent moves may travel
  // ACROSS the whole viewport (even over sibling cells) and still pan THIS
  // panel. Rightward motion increases offsetX → pans into history (older
  // bars), which is what triggers the backward load-more.
  const xStart = Math.round(rect.x + Math.min(rect.w * 0.15, 40));
  const xEnd = Math.max(xStart + 50, vw - 12);

  const strokes = Math.max(1, Math.round(screens));
  let offsetBeforeUp = null;
  let offsetAfterUp = null;
  let midSample = null;

  for (let s = 0; s < strokes; s++) {
    await page.mouse.move(xStart, y);
    await page.mouse.down();
    for (let i = 1; i <= stepsPerStroke; i++) {
      const x = Math.round(xStart + ((xEnd - xStart) * i) / stepsPerStroke);
      await page.mouse.move(x, y);
      // Sample offset mid-gesture on the last stroke (button still down).
      if (s === strokes - 1 && i === Math.floor(stepsPerStroke / 2) && frame) {
        midSample = await frame.evaluate(SNAPSHOT_FN).catch(() => null);
      }
    }
    // Capture offset with the button still down, just before release.
    if (s === strokes - 1 && frame) {
      offsetBeforeUp = await frame
        .evaluate(() => (window.chart ? Number(window.chart.offsetX) : null))
        .catch(() => null);
    }
    await page.mouse.up();
    await sleep(150); // let the burst/settle + backward load-more path run
  }
  // Let any post-release fetch/settle finish.
  await sleep(600);
  if (frame) {
    offsetAfterUp = await frame
      .evaluate(() => (window.chart ? Number(window.chart.offsetX) : null))
      .catch(() => null);
  }
  const endSample = frame ? await frame.evaluate(SNAPSHOT_FN).catch(() => null) : null;
  return { offsetBeforeUp, offsetAfterUp, midSample, endSample };
}

/** Send a panel-cmd to one iframe panel and await its reply. */
export async function panelCmd(page, panelId, cmd, args = {}) {
  return page.evaluate(
    async (pid, c, a) => {
      const mgr = window.__harnessManager;
      if (!mgr || typeof mgr.sendCommand !== 'function') throw new Error('no manager');
      return mgr.sendCommand(pid, c, a);
    },
    panelId,
    cmd,
    args,
  );
}

/** Fire-and-forget panel-cmd broadcast to every iframe panel. */
export async function broadcastCmd(page, cmd, args = {}) {
  return page.evaluate(
    (c, a) => {
      const mgr = window.__harnessManager;
      if (!mgr || !mgr.charts) return 0;
      let n = 0;
      for (const ch of mgr.charts.values()) {
        if (ch.host || !ch.frame) continue;
        try { mgr.sendCommandNoReply(ch.id, c, a); n++; } catch (_) {}
      }
      return n;
    },
    cmd,
    args,
  );
}

// ── host-drive helpers (tile A is the in-process window.chart) ──────────────
//
// The host does NOT run panel-cmd-bridge — production drives it in-process
// (MultichartGrid calls window.chart directly). These helpers reproduce that:
// they apply replay/TF actions to the host's real engine in the main frame,
// exactly as MultichartGrid's applyHostCommand / replay fan-out does.

/** Enter (paused) replay on the HOST chart at ts, matching applyReplayEnter. */
export async function hostReplayEnter(page, ts) {
  return page.evaluate((t) => {
    const ch = window.chart;
    if (!ch) return false;
    let rs = ch.replaySystem;
    if (!rs && typeof ch.initReplaySystem === 'function') {
      try { ch.initReplaySystem(); } catch (_) {}
      rs = ch.replaySystem;
    }
    if (!rs) return false;
    if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
      try { rs.enterReplayMode({ startAtBeginning: true, suppressInitialUpdateChartData: true }); } catch (_) {}
    }
    if (rs.isActive && Number.isFinite(t) && typeof rs.goToReplayTimestamp === 'function') {
      try { rs.goToReplayTimestamp(t, { centerOnCandle: true }); } catch (_) {}
    }
    return !!rs.isActive;
  }, ts);
}

/** Seek the HOST replay playhead to ts (matches replayTick → goToReplayTimestamp). */
export async function hostReplaySeek(page, ts) {
  return page.evaluate((t) => {
    const ch = window.chart;
    const rs = ch && ch.replaySystem;
    if (!rs || !rs.isActive || typeof rs.goToReplayTimestamp !== 'function') return false;
    try { rs.goToReplayTimestamp(t, { centerOnCandle: true }); } catch (_) { return false; }
    return true;
  }, ts);
}

/** Change the HOST chart's timeframe in-process (mirrors host fan-out step 1). */
export async function hostSetTimeframe(page, tf) {
  return page.evaluate((t) => {
    const ch = window.chart;
    if (!ch || typeof ch.setTimeframe !== 'function') return false;
    if (ch.currentTimeframe !== t) { try { ch.setTimeframe(t); } catch (_) { return false; } }
    return true;
  }, tf);
}

/**
 * Interval fan-out driven by the HOST (mirrors MultichartGrid onState host
 * fan-out, lines 3805-3816): host changes its own TF in-process, then pushes
 * setTimeframe (with __fromHostFanout) to every iframe peer.
 */
export async function fanOutTf(page, tf) {
  await hostSetTimeframe(page, tf);
  return broadcastCmd(page, 'setTimeframe', { tf, __fromHostFanout: true });
}

// ── fetch-log helpers (serve.mjs per-hit log) ───────────────────────────────

const DATA_ENDPOINTS = new Set(['file.bars', 'file.smart', 'file.candles']);

/** Count DATA fetches (bars/smart/candles) grouped by fileId. Ignores meta/auth. */
export function countFetchesByFile(apiLog) {
  const by = {};
  for (const e of apiLog) {
    if (!DATA_ENDPOINTS.has(e.endpoint)) continue;
    const fid = e.fileId || 'null';
    by[fid] = (by[fid] || 0) + 1;
  }
  return by;
}

export function totalDataFetches(apiLog) {
  return apiLog.filter((e) => DATA_ENDPOINTS.has(e.endpoint)).length;
}

// ── deterministic convergence / settle waits ────────────────────────────────
//
// These replace fixed sleeps + single-sample reads. Every wait polls a REAL
// engine signal (playhead, panLoading, viewport-settle, diag.fetches) and has a
// HARD budget: if the signal never reaches the expected state, the caller FAILS
// LOUDLY with the observed numbers — a pass is never granted by timing alone.

/**
 * Wait until every panel in `ids` reports replay ACTIVE and its playhead
 * (replayTs) has settled to `ts` (± exact), with no fetch/settle in flight.
 * Deterministic entry gate for replay scenarios.
 */
export async function waitReplayQuiescent(page, ids, ts, budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs;
  let last = {};
  let lastDiag = {};
  while (Date.now() < deadline) {
    lastDiag = await diagRowsByPanelId(page);
    const p = await readPanels(page);
    last = p;
    const ready = ids.every((i) => {
      const s = p[i];
      return s && lastDiag[i] && s.replayActive && s.replayTs === ts && isPanelQuiescent(s);
    });
    if (ready) return { ok: true, detail: `all panels active+settled @ ${ts}` };
    await sleep(POLL_INTERVAL_MS);
  }
  const detail = ids
    .map((i) => `${i}:active=${last[i]?.replayActive} ts=${last[i]?.replayTs} panLoad=${last[i]?.panLoading} diagFetch=${lastDiag[i]?.fetches}`)
    .join(' ');
  return { ok: false, detail: `replay never quiescent @ ${ts} within ${budgetMs}ms — ${detail}` };
}

/**
 * Seek every panel to `target` and poll until they CONVERGE: all panels report
 * replayTs === target, stable across two consecutive reads, none loading. The
 * host (tile A) is seeked in-process; iframe peers via the replayTick fan-out,
 * RE-broadcast each poll so a tick dropped during a settle window is retried.
 * Hard budget → FAIL LOUDLY (no pass-by-timing).
 */
export async function seekAllAndConverge(page, ids, target, budgetMs = 8_000) {
  const deadline = Date.now() + budgetMs;
  let prevHeads = null;
  let last = {};
  let lastDiag = {};
  let lastSend = 0;
  while (Date.now() < deadline) {
    if (Date.now() - lastSend >= 200) {
      await hostReplaySeek(page, target);
      await broadcastCmd(page, 'replayTick', { timestamp: target });
      lastSend = Date.now();
    }
    lastDiag = await diagRowsByPanelId(page);
    const p = await readPanels(page);
    last = p;
    const heads = ids.map((i) => p[i]?.replayTs);
    const allAtTarget = heads.every((h) => h === target);
    const quiescent = ids.every((i) => lastDiag[i] && isPanelQuiescent(p[i]));
    const stable = prevHeads && heads.every((h, k) => h === prevHeads[k]);
    if (allAtTarget && quiescent && stable) {
      return { ok: true, detail: `converged @ ${target}` };
    }
    prevHeads = heads;
    await sleep(120);
  }
  const heads = ids.map((i) => `${i}=${last[i]?.replayTs}`).join('/');
  const fetches = ids.map((i) => `${i}.fetches=${lastDiag[i]?.fetches}`).join('/');
  return { ok: false, detail: `no converge @ ${target}: ${heads}; ${fetches}` };
}

/**
 * Build an accelerated-play plan of `steps` evenly-spaced playhead targets that
 * stay strictly INSIDE the loaded replay master (so every target lands on a
 * loaded candle and the host never has to clamp/refetch). Targets are snapped
 * to the candle grid so goToReplayTimestamp resolves to exactly the target.
 */
export async function computePlayPlan(page, ts0, steps, candleMs = 60_000) {
  const host = await readHost(page);
  const lastT = host && host.replayMasterLastT;
  if (!Number.isFinite(lastT) || !Number.isFinite(ts0) || lastT <= ts0) {
    return { ok: false, detail: `no forward-loaded master: ts0=${ts0} masterLast=${lastT}`, targets: [] };
  }
  const usable = lastT - ts0;
  // Divide by (steps+1) and floor to the candle grid → the final target is
  // ts0 + steps*perStep < lastT, i.e. a full candle-grid margin inside data.
  let perStep = Math.floor(usable / (steps + 1) / candleMs) * candleMs;
  if (perStep < candleMs) perStep = candleMs;
  const targets = [];
  for (let k = 1; k <= steps; k++) {
    const t = ts0 + k * perStep;
    if (t > lastT) break;
    targets.push(t);
  }
  if (targets.length === 0) {
    return { ok: false, detail: `forward span too small: usable=${usable}ms`, targets: [] };
  }
  return { ok: true, detail: `${targets.length} targets, perStep=${perStep}ms, master forward span=${usable}ms`, targets };
}

/**
 * Anchor a cold-boot read to a DETERMINISTIC settled signal: wait until every
 * panel is painted (bootLayout guarantees), no fetch is in flight, the viewport
 * boot/mirror settle window has expired, AND per-panel diag.fetches is STABLE
 * across two spaced reads (no boot self-fetch still to come). Only THEN is the
 * fetch count read, so the same lifecycle point is sampled every session.
 * Returns settled state; on timeout the caller still reads (a perpetually
 * unsettled boot is itself the defect and its fetch count is reported).
 */
export async function waitBootSettled(page, ids, budgetMs = 20_000, getInFlightDataRequests = () => 0) {
  const deadline = Date.now() + budgetMs;
  let prevFetches = null;
  let last = {};
  let lastDiag = {};
  let lastManager = null;
  let lastInFlight = 0;
  while (Date.now() < deadline) {
    lastDiag = await diagRowsByPanelId(page);
    const p = await readPanels(page);
    last = p;
    lastManager = await managerBootState(page, ids);
    lastInFlight = Number(getInFlightDataRequests()) || 0;
    const painted = ids.every((i) => (p[i]?.dataLen || 0) > 0 && (p[i]?.renders || 0) > 0);
    const quiescent = ids.every((i) => isPanelQuiescent(p[i]));
    const fetches = ids.map((i) => lastDiag[i]?.fetches ?? p[i]?.fetches ?? 0);
    const stable = prevFetches && fetches.every((f, k) => f === prevFetches[k]);
    if (painted && lastManager.managerReady && lastInFlight === 0 && quiescent && stable) {
      return { ok: true, detail: `boot settled: fetches=${fetches.join('/')} inFlight=${lastInFlight}`, panels: p };
    }
    prevFetches = fetches;
    await sleep(300);
  }
  const detail = ids
    .map((i) => `${i}:fetches=${lastDiag[i]?.fetches ?? last[i]?.fetches} panLoad=${last[i]?.panLoading} painted=${(last[i]?.dataLen || 0) > 0 && (last[i]?.renders || 0) > 0}`)
    .join(' ');
  const managerDetail = lastManager
    ? ` managerReady=${lastManager.managerReady} pending=${lastManager.pendingIds.join(',')} cmdPending=${lastManager.cmdPendingIds.join(',')} hostReady=${lastManager.hostReady} revealDone=${lastManager.noRevealHold}`
    : ' managerReady=false';
  return { ok: false, detail: `boot never settled within ${budgetMs}ms — ${detail}; inFlight=${lastInFlight};${managerDetail}`, panels: last };
}

// ── assertion collector ─────────────────────────────────────────────────────

export function makeChecks() {
  const items = [];
  return {
    check(label, ok, detail) {
      items.push({ label, ok: !!ok, detail: detail == null ? '' : String(detail) });
      return !!ok;
    },
    get items() { return items; },
    get passed() { return items.every((i) => i.ok); },
    failures() { return items.filter((i) => !i.ok); },
  };
}

/**
 * H-INV: run after EVERY test. seams=0 on every panel; no console/page errors;
 * _serverCursors edges == rawData edges on every panel that has fetched.
 */
export async function invariantCheck(page, ctx) {
  const checks = makeChecks();
  const panels = await readPanels(page);
  for (const [id, p] of Object.entries(panels)) {
    if (!p) { checks.check(`INV ${id} snapshot`, false, 'null snapshot'); continue; }
    checks.check(`INV ${id} seams=0`, p.seams === 0, `seams=${p.seams}`);
    // Cursor↔loaded-window edge equality (I2). Compares against the replay
    // master when in replay, else rawData (see snapshot). Only checked when the
    // panel has both server cursors and a loaded array.
    if (p.hasCursors && p.loadedFirstT != null && p.cursorFirst != null && p.cursorLast != null) {
      checks.check(
        `INV ${id} _serverCursors.firstTs==loaded[0].t`,
        p.cursorFirst === p.loadedFirstT,
        `cursorFirst=${p.cursorFirst} loadedFirstT=${p.loadedFirstT}`,
      );
      checks.check(
        `INV ${id} _serverCursors.lastTs==loaded[last].t`,
        p.cursorLast === p.loadedLastT,
        `cursorLast=${p.cursorLast} loadedLastT=${p.loadedLastT}`,
      );
    }
  }
  const ce = (ctx && ctx.consoleErrors) || [];
  const pe = (ctx && ctx.pageErrors) || [];
  checks.check('INV no console errors', ce.length === 0, ce.slice(0, 3).join(' | '));
  checks.check('INV no page errors', pe.length === 0, pe.slice(0, 3).join(' | '));
  return checks;
}
