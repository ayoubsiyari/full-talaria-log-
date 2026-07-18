/**
 * react-parity-lib.mjs — T0 step 8b boot + helpers for the REAL built-product
 * MultichartGrid surface (dist-v9 + mcLayout=2v). Drives chart-embed.html
 * panel iframes via puppeteer multi-frame — NOT dev:live same-context mount.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  makeChecks,
  panelFrameMap,
  sleep,
  POLL_INTERVAL_MS,
} from './harness-lib.mjs';
import {
  chartTarget,
  installParentSettingsProbe,
  readInteractiveState,
  readParentSettingsProbe,
  placeTool,
  assertMenuState,
} from './interactive-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = __dirname;
const CHART_ROOT = path.resolve(__dirname, '../..');
const DIST_INDEX = path.resolve(CHART_ROOT, 'dist-v9/index.html');

/** Minimal backtest session so mode=backtest loads harness stub bars (file 25). */
export const HARNESS_BACKTEST_SESSION = {
  type: 'standard',
  startBalance: 10000,
  instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
};

export function readBuildIdFromDist() {
  if (!fs.existsSync(DIST_INDEX)) return null;
  const html = fs.readFileSync(DIST_INDEX, 'utf8');
  const m = html.match(/__TALARIA_CHART_BUILD_ID='([^']+)'/);
  return m ? m[1] : null;
}

export const REACT_BUILD_ID = readBuildIdFromDist() || 'unknown';

/** Fresh read from dist-v9/index.html (avoids stale constant if dist bumps between scenarios). */
export function currentReactBuildId() {
  return readBuildIdFromDist() || REACT_BUILD_ID || 'unknown';
}
export const DEFAULT_HARNESS_PORT = Number(process.env.REACT_PARITY_HARNESS_PORT || process.env.PORT || 8791);

export { makeChecks, launchBrowser, panelFrameMap, sleep };

/** Built dist-v9 URL — real production embed topology (separate-window iframes). */
export function builtReactParityUrl(port = DEFAULT_HARNESS_PORT) {
  if (process.env.REACT_PARITY_URL) return process.env.REACT_PARITY_URL;
  return `http://127.0.0.1:${port}/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`;
}

/** @deprecated dev:live — not used by step 8b gate (D-010). */
export function reactParityUrl(port = 5174) {
  return process.env.REACT_PARITY_DEVLIVE_URL
    || `http://127.0.0.1:${port}/pricing/?devMultichart=2v&mode=backtest`;
}

function probeUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, budgetMs = 120000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await probeUrl(url)) return true;
    await sleep(500);
  }
  return false;
}

function spawnDetached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32',
  });
  child.unref();
  return child;
}

/**
 * Ensure harness stub API is reachable and built dist-v9 exists.
 * Does NOT spawn dev:live (D-010: same-context mount is unfaithful).
 */
export async function ensureBuiltReactStack({
  harnessPort = DEFAULT_HARNESS_PORT,
} = {}) {
  if (!fs.existsSync(DIST_INDEX)) {
    throw new Error(`react-parity: missing built dist-v9 at ${DIST_INDEX} — run npm run build:live in talaria-design`);
  }
  const children = [];
  const harnessUrl = `http://127.0.0.1:${harnessPort}/api/auth/me`;

  if (!(await probeUrl(harnessUrl))) {
    const servePath = path.join(HARNESS_DIR, 'serve.mjs');
    children.push(spawnDetached(process.execPath, [servePath], {
      cwd: HARNESS_DIR,
      env: { PORT: String(harnessPort) },
    }));
    if (!(await waitForUrl(harnessUrl))) {
      throw new Error(`react-parity: harness serve did not start on :${harnessPort}`);
    }
  }

  return {
    harnessPort,
    url: builtReactParityUrl(harnessPort),
    surface: 'built-dist-v9',
    buildId: currentReactBuildId(),
    children,
    async close() {
      for (const c of children) {
        try { process.kill(-c.pid); } catch (_) {
          try { c.kill(); } catch (_) { /* ignore */ }
        }
      }
    },
  };
}

/** @deprecated Use ensureBuiltReactStack — dev:live is not the acceptance surface. */
export async function ensureReactStack(opts = {}) {
  return ensureBuiltReactStack(opts);
}

/** React grid cell rect in top-page coordinates (host A = #chartWrapper). */
export async function reactFrameRectForPanel(page, panelId) {
  if (panelId === 'A') {
    return page.evaluate(() => {
      const wrap = document.getElementById('chartWrapper');
      if (!wrap) return null;
      const r = wrap.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
  }
  return page.evaluate((pid) => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    for (const el of frames) {
      try {
        const u = new URL(el.src, location.href);
        if (u.searchParams.get('panelId') === pid) {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        }
      } catch (_) { /* ignore */ }
    }
    return null;
  }, panelId);
}

/** Canvas point at fractional position → top-page mouse coordinates on React surface. */
export async function reactChartCanvasPagePoint(page, panelId, fracX, fracY) {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  const local = await frame.evaluate((fx, fy) => {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + r.width * fx, y: r.top + r.height * fy };
  }, fracX, fracY);
  if (!local) return null;
  if (panelId === 'A') {
    return { x: Math.round(local.x), y: Math.round(local.y) };
  }
  const fr = await reactFrameRectForPanel(page, panelId);
  if (!fr) return null;
  return {
    x: Math.round(fr.left + local.x),
    y: Math.round(fr.top + local.y),
  };
}

/** Local iframe/host viewport point → top-page Puppeteer mouse coordinates. */
export async function localToPagePoint(page, panelId, localX, localY) {
  if (panelId === 'A') {
    return { x: Math.round(localX), y: Math.round(localY) };
  }
  const iframeHandle = await page.evaluateHandle((pid) => {
    for (const el of document.querySelectorAll('iframe')) {
      try {
        if (new URL(el.src, location.href).searchParams.get('panelId') === pid) return el;
      } catch (_) { /* ignore */ }
    }
    return null;
  }, panelId);
  const box = await iframeHandle.asElement()?.boundingBox();
  if (!box) {
    const fr = await reactFrameRectForPanel(page, panelId);
    if (!fr) return null;
    return {
      x: Math.round(fr.left + localX),
      y: Math.round(fr.top + localY),
    };
  }
  return {
    x: Math.round(box.x + localX),
    y: Math.round(box.y + localY),
  };
}

/** Hit point on a drawing in panel-local viewport coords (I15: geometry only, no actuation). */
export async function drawingHitLocalPoint(page, panelId, drawId, { aim = 'body' } = {}) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };
  const geom = await frame.evaluate((id, aimMode) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(id));
    if (!d || !dm) return { ok: false, reason: 'no drawing' };

    let points = Array.isArray(d.points) ? d.points : [];
    if (typeof CoordinateUtils !== 'undefined' && typeof CoordinateUtils.resolveDrawingPoints === 'function') {
      try {
        const resolved = CoordinateUtils.resolveDrawingPoints(d, ch);
        if (resolved && resolved.length) points = resolved;
      } catch (_) { /* ignore */ }
    }
    if (!points.length) return { ok: false, reason: 'no points' };

    const yScale = ch.yScale;
    const toLayout = (p) => {
      const lx = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(Number(p.x)) : NaN;
      const ly = yScale && typeof yScale === 'function' ? yScale(Number(p.y)) : NaN;
      return [lx, ly];
    };

    const candidates = [];
    const isAreaShape = d.type === 'rectangle' || d.type === 'ellipse';
    if (points.length >= 2 && isAreaShape) {
      const [x1, y1] = toLayout(points[0]);
      const [x2, y2] = toLayout(points[points.length - 1]);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      candidates.push(
        [(left + right) / 2, (top + bottom) / 2],
        [(left + right) / 2, top],
        [(left + right) / 2, bottom],
        [left, (top + bottom) / 2],
        [right, (top + bottom) / 2],
      );
    } else if (points.length >= 2) {
      const [x1, y1] = toLayout(points[0]);
      const [x2, y2] = toLayout(points[points.length - 1]);
      const ts = [0.5];
      for (let t = 0.05; t <= 0.9501; t += 0.05) {
        if (Math.abs(t - 0.5) < 0.001) continue;
        ts.push(t);
      }
      for (const t of ts) {
        candidates.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
    } else {
      const [x1, y1] = toLayout(points[0]);
      candidates.push([x1, y1]);
    }

    const r = typeof ch._pointerLayoutRect === 'function'
      ? ch._pointerLayoutRect()
      : (ch.canvas && ch.canvas.parentElement
        ? ch.canvas.parentElement.getBoundingClientRect()
        : ch.canvas.getBoundingClientRect());
    const z = typeof ch._v9LayoutZoom === 'function' ? ch._v9LayoutZoom() : 1;
    const toClient = (lx, ly) => [lx * z + r.left, ly * z + r.top];
    const options = [];
    if (typeof dm.findDrawingsAtPoint === 'function') {
      for (const [lx, ly] of candidates) {
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
        const hits = dm.findDrawingsAtPoint(lx, ly, { includeVolumeProfileBodyHit: true }) || [];
        if (!hits.some((h) => h && String(h.id) === String(id))) continue;
        const [clientX, clientY] = toClient(lx, ly);
        const exclusive = hits.length === 1 && hits[0] && String(hits[0].id) === String(id);
        options.push({ layoutX: lx, layoutY: ly, clientX, clientY, exclusive });
      }
    }
    const m = ch.margin || { l: 0, r: 0, t: 0, b: 0 };
    const w = ch.w || (ch.canvas && ch.canvas.width) || 0;
    const h = ch.h || (ch.canvas && ch.canvas.height) || 0;
    return {
      ok: options.length > 0,
      reason: options.length ? null : 'findDrawingsAtPoint miss',
      options,
      drawType: d.type,
      offsetX: ch.offsetX,
      margin: m,
      w,
      h,
    };
  }, drawId, aim);

  if (!geom || !geom.ok || !geom.options || !geom.options.length) {
    return { ok: false, reason: geom?.reason || 'no hit options' };
  }

  const LINE_DRAW_TYPES = new Set([
    'trendline', 'ray', 'extended_line', 'arrow', 'horizontal_line', 'vertical_line',
    'fib_retracement', 'fib_extension',
  ]);

  const scoreViewportPixel = async (clientX, clientY, drawType) => frame.evaluate((x, y, dtype) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { score: 0, tag: null };
    if (el.id === 'backtestingLoader' || el.tagName === 'BODY' || el.tagName === 'HTML') {
      return { score: 0, tag: el.tagName };
    }
    const tag = (el.tagName || '').toLowerCase();
    const needsSvg = dtype === 'trendline' || dtype === 'ray' || dtype === 'extended_line'
      || dtype === 'arrow' || dtype === 'horizontal_line' || dtype === 'vertical_line'
      || dtype === 'fib_retracement' || dtype === 'fib_extension';
    if (tag === 'line' || tag === 'path') return { score: 3, tag };
    if (tag === 'rect' || tag === 'circle') return { score: needsSvg ? 0 : 2, tag };
    if (el.closest && el.closest('.drawing, .resize-handle, .resize-handle-group, .resize-handle-hit, #drawingSvg')) {
      return { score: needsSvg ? 0 : 2, tag };
    }
    if (el.id === 'chartCanvas' || tag === 'canvas') {
      return { score: needsSvg ? 0 : 1, tag };
    }
    return { score: 0, tag };
  }, clientX, clientY, drawType);

  const needsLineBody = LINE_DRAW_TYPES.has(geom.drawType);
  const isLineBodyPixel = async (clientX, clientY) => frame.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    const tag = (el && el.tagName ? el.tagName : '').toLowerCase();
    return tag === 'line' || tag === 'path';
  }, clientX, clientY);

  const minScore = needsLineBody ? 3 : 1;
  const ranked = [];
  for (const opt of geom.options) {
    if (needsLineBody && !(await isLineBodyPixel(opt.clientX, opt.clientY))) continue;
    const scored = await scoreViewportPixel(opt.clientX, opt.clientY, geom.drawType);
    if (!scored || scored.score < minScore) continue;
    const pagePt = await localToPagePoint(page, panelId, opt.clientX, opt.clientY);
    if (!pagePt) continue;
    ranked.push({ opt, scored, pagePt });
  }
  ranked.sort((a, b) => {
    if (a.opt.exclusive !== b.opt.exclusive) return a.opt.exclusive ? -1 : 1;
    return b.scored.score - a.scored.score;
  });
  const exclusiveRanked = ranked.filter((r) => r.opt.exclusive);
  const best = (exclusiveRanked.length ? exclusiveRanked : ranked)[0] || null;

  if (!best) {
    return { ok: false, reason: 'no svg actuatable pixel', drawType: geom.drawType };
  }

  const { opt, scored } = best;
  const onPlot = opt.layoutX >= geom.margin.l && opt.layoutX <= (geom.w - geom.margin.r)
    && opt.layoutY >= geom.margin.t && opt.layoutY <= (geom.h - geom.margin.b);
  return {
    ok: true,
    x: Math.round(opt.clientX),
    y: Math.round(opt.clientY),
    method: 'chart-layout',
    findHit: true,
    onPlot,
    layoutX: opt.layoutX,
    layoutY: opt.layoutY,
    offsetX: geom.offsetX,
    actuatable: true,
    pixelTag: scored.tag,
    pixelScore: scored.score,
    exclusive: !!opt.exclusive,
  };
}

/** Engine store: is drawing id in selectedDrawings or d.selected? (I15 — no handle proxy). */
export async function readDrawingSelectedInStore(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return false;
  return frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return false;
    const inSel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    const d = (dm.drawings || []).find((x) => x && String(x.id) === String(id));
    return inSel || !!(d && d.selected);
  }, drawId);
}

/** Parent V9 quick-bar visible for the focused panel (I15 — not dm.toolbar.visible). */
export async function readParentV9BarVisible(page, panelId) {
  const focusedId = await page.evaluate(() => {
    try {
      const grid = window.__multichartGrid;
      if (grid && typeof grid.getFocusedPanelId === 'function') {
        return String(grid.getFocusedPanelId() || 'A');
      }
    } catch (_) { /* ignore */ }
    return 'A';
  });
  if (String(focusedId) !== String(panelId)) return false;
  const v9 = await readV9QuickBarState(page);
  return !!(v9 && v9.v9Visible);
}

/** H-R09-LR lag signature: store selected + focus ok + parent bar absent (split-brain). */
export async function readParentQuickBarLagSignature(page, panelId, drawId) {
  const storeSelected = await isDrawingSelected(page, panelId, drawId);
  const parent = await page.evaluate((pid, id) => {
    let focusedOk = false;
    try {
      const grid = window.__multichartGrid;
      const focused = grid && typeof grid.getFocusedPanelId === 'function'
        ? String(grid.getFocusedPanelId() || '')
        : '';
      focusedOk = focused === String(pid);
    } catch (_) { /* ignore */ }
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    const bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
    const gr = gear && gear.getBoundingClientRect();
    const br = bar && bar.getBoundingClientRect();
    const barVisible = !!((gr && gr.width > 0 && gr.height > 0) || (br && br.width > 0 && br.height > 0));
    const cached = window.__talariaV9QuickBarDomReady || null;
    return {
      focusedOk,
      barVisible,
      liveNull: !cached || cached.domReady !== true || String(cached.drawingId) !== String(id),
      domReadyCached: !!(cached && cached.domReady),
      anchorId: cached && cached.drawingId != null ? String(cached.drawingId) : null,
    };
  }, panelId, drawId);
  const lagClass = !!(storeSelected && parent.focusedOk && !parent.barVisible);
  return {
    lagClass,
    storeSelected,
    focusedOk: parent.focusedOk,
    barVisible: parent.barVisible,
    liveNull: parent.liveNull,
    domReadyCached: parent.domReadyCached,
    anchorId: parent.anchorId,
  };
}

/** D-032 tripwire scenarios — signature logged on every failing run. */
export const D032_TRIPWIRE_SCENARIO_IDS = ['H-R04', 'H-R05', 'H-R09'];

const D032_TRIPWIRE_LOG = path.join(HARNESS_DIR, 'd032-tripwire-outcomes.jsonl');

export async function readPanelBSelectedDrawingId(page) {
  const frame = panelFrameMap(page).B;
  if (!frame) return null;
  return frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    const sel = dm && Array.isArray(dm.selectedDrawings) && dm.selectedDrawings[0];
    if (sel && sel.id != null) return String(sel.id);
    const ids = dm && Array.isArray(dm.selectedIds) ? dm.selectedIds : [];
    return ids.length ? String(ids[0]) : null;
  }).catch(() => null);
}

/** Capture D-032 signature fields for a failing chrome/settings leg. */
export async function readD032FailureSignature(page, panelId = 'B', drawId = null) {
  const id = drawId || (panelId === 'B' ? await readPanelBSelectedDrawingId(page) : null);
  const storeOk = id ? await isDrawingSelected(page, panelId, id) : null;
  const v9BarVisible = await readParentV9BarVisible(page, panelId);
  const settings = await readParentReactSettings(page);
  const probe = await readParentSettingsProbe(page);
  const flags = await page.evaluate(() => ({
    styleSeen: !!window.__harnessD032StyleSeen,
    modalTeardown: !!window.__harnessD032ModalTeardown,
    settingsClosed: !!window.__harnessParentSettingsClosed,
    settingsOpen: !!window.__harnessParentSettingsOpen,
  }));
  const modalTeardown = !!(flags.modalTeardown
    || (flags.styleSeen && flags.settingsClosed)
    || (settings.hasStyleSection && probe.closed && !settings.open));
  const d026TeardownSig = modalTeardown;
  let tripwireClass = 'UNKNOWN';
  if (storeOk === false) tripwireClass = 'VOID_TRANSPORT';
  else if (d026TeardownSig) tripwireClass = 'VOID_TRANSPORT';
  else if (storeOk === true && !v9BarVisible && !modalTeardown) tripwireClass = 'EXONERATING_DOM_READY';
  else if (storeOk === true && v9BarVisible) tripwireClass = 'OTHER';
  return {
    panelId,
    drawingId: id,
    storeOk,
    v9BarVisible,
    modalTeardown,
    d026TeardownSig,
    tripwireClass,
    styleSeen: flags.styleSeen,
    settingsSnapshot: {
      open: settings.open,
      hasStyleSection: settings.hasStyleSection,
      quickBarShellOnly: settings.quickBarShellOnly,
    },
    probeMessages: (probe.messages || []).slice(-8),
  };
}

export function classifyD032Tripwire(sig) {
  if (!sig) return 'UNKNOWN';
  if (sig.storeOk === false || sig.d026TeardownSig) return 'VOID_TRANSPORT';
  if (sig.storeOk === true && !sig.v9BarVisible && !sig.modalTeardown) return 'EXONERATING_DOM_READY';
  return 'OTHER';
}

export async function appendD032TripwireLog(entry) {
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
  await fs.promises.appendFile(D032_TRIPWIRE_LOG, line, 'utf8').catch((err) => {
    console.error('[D-032-TRIPWIRE] warn: could not append log:', err.message);
  });
}

export async function captureAndLogD032Tripwire({
  scenarioId, buildId, page, panelId = 'B', drawId = null, checkFails = [], runIndex = null,
}) {
  const signature = await readD032FailureSignature(page, panelId, drawId);
  const entry = {
    buildId: buildId || null,
    scenarioId,
    runIndex,
    signature,
    tripwireClass: classifyD032Tripwire(signature),
    checkFails,
  };
  await appendD032TripwireLog(entry);
  console.log(`[D-032-TRIPWIRE] ${scenarioId} ${entry.tripwireClass} storeOk=${signature.storeOk} v9BarVisible=${signature.v9BarVisible} modalTeardown=${signature.modalTeardown} d026TeardownSig=${signature.d026TeardownSig}`);
  return entry;
}

/**
 * Seed harness backtest session + optional I13 switches before chart boots.
 * migrationOn=true (D-011 step 0): re-enable retained T1 migration in panel + parent shell.
 */
export async function installBuiltProductBoot(page, {
  switchOffGearFix = false,
  switchOffPeerDeselect = false,
  panelKeyboardOff = false,
  migrationOn = false,
  phase1Off = false,
  phase5Off = false,
  iframeCtrlDedupeOff = false,
  lifecycleOff = false,
  legacySelectionOff = false,
  drawingLocalInvalidationOff = false,
  chromeRoutingOff = false,
  chromeDomReadyOff = false,
  panelBSettingsTransportOff = false,
  panelBSettingsTransportAOff = false,
  orderMcStateConvergeOff = false,
  v9QuickbarLiveResolveOff = false,
  vpV9AvLabelBridgeOff = false,
  vpV9AvCoordRepositionOff = false,
  axisMarginFloorOff = false,
  vpHandleCanvasRoutingOff = false,
  armedDrawFocusForwardOff = false,
  ctrlMarqueeOff = false,
  otMsHighlightOff = false,
  bugSwitches = null,
} = {}) {
  const off = switchOffGearFix || process.env.REACT_PARITY_GEAR_FIX_OFF === '1';
  const peerOff = switchOffPeerDeselect || process.env.REACT_PARITY_PEER_DESELECT_OFF === '1';
  const kbOff = panelKeyboardOff || process.env.REACT_PARITY_PANEL_KEYBOARD_OFF === '1';
  const mig = migrationOn || process.env.REACT_PARITY_MIGRATION_ON === '1';
  const p1Off = phase1Off || process.env.REACT_PARITY_PHASE1_OFF === '1';
  const p5Off = phase5Off || process.env.REACT_PARITY_PHASE5_OFF === '1';
  const dedupeOff = iframeCtrlDedupeOff || process.env.REACT_PARITY_IFRAME_CTRL_DEDUPE_OFF === '1';
  const lcOff = lifecycleOff || process.env.REACT_PARITY_LIFECYCLE_OFF === '1';
  const legOff = legacySelectionOff || process.env.REACT_PARITY_LEGACY_SELECTION_OFF === '1';
  const dliOff = drawingLocalInvalidationOff || process.env.REACT_PARITY_DRAWING_LOCAL_INVALIDATION_OFF === '1';
  const croff = chromeRoutingOff || process.env.REACT_PARITY_CHROME_ROUTING_OFF === '1';
  const cdroff = chromeDomReadyOff || process.env.REACT_PARITY_CHROME_DOM_READY_OFF === '1';
  const pbstOff = panelBSettingsTransportOff || process.env.REACT_PARITY_PANELB_SETTINGS_TRANSPORT_OFF === '1';
  const pbstAOff = panelBSettingsTransportAOff || process.env.REACT_PARITY_PANELB_SETTINGS_TRANSPORT_A_OFF === '1';
  const omscOff = orderMcStateConvergeOff || process.env.REACT_PARITY_ORDER_MC_STATE_CONVERGE_OFF === '1';
  const v9qlrOff = v9QuickbarLiveResolveOff || process.env.REACT_PARITY_V9_QUICKBAR_LIVE_RESOLVE_OFF === '1';
  const vpAvLblOff = vpV9AvLabelBridgeOff || process.env.REACT_PARITY_VP_V9_AV_LABEL_BRIDGE_OFF === '1';
  const vpAvCoordOff = vpV9AvCoordRepositionOff || process.env.REACT_PARITY_VP_V9_AV_COORD_REPOSITION_OFF === '1';
  const amfOff = axisMarginFloorOff || process.env.REACT_PARITY_AXIS_MARGIN_FLOOR_OFF === '1';
  const vpHandleRouteOff = vpHandleCanvasRoutingOff || process.env.REACT_PARITY_VP_HANDLE_CANVAS_ROUTING_OFF === '1';
  const armedDrawFwdOff = armedDrawFocusForwardOff || process.env.HARNESS_MC_ARMED_DRAW_FOCUS_FORWARD_OFF === '1';
  const ctrlMarqueeOffOn = ctrlMarqueeOff || process.env.REACT_PARITY_CTRL_MARQUEE_OFF === '1';
  const otMsHighlightOffOn = otMsHighlightOff || process.env.REACT_PARITY_OT_MS_HIGHLIGHT_OFF === '1';
  const bugFlags = Array.isArray(bugSwitches) ? bugSwitches : [];
  await page.evaluateOnNewDocument((sess, switchOff, peerDeselectOff, panelKbOff, migOn, phase1OffOn, phase5OffOn, iframeDedupeOff, lifecycleOffOn, legacySelOffOn, dliOffOn, chromeRoutingOffOn, chromeDomReadyOffOn, panelBTransportOffOn, panelBTransportAOffOn, orderMcStateConvergeOffOn, v9QuickbarLiveResolveOffOn, vpAvLabelBridgeOffOn, vpAvCoordRepositionOffOn, axisMarginFloorOffOn, vpHandleCanvasRoutingOffOn, armedDrawFocusForwardOffOn, ctrlMarqueeOffOnArg, otMsHighlightOffOnArg, bugFlagList) => {
    if (switchOff) window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true;
    if (peerDeselectOff) window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1 = true;
    if (phase5OffOn) window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION = true;
    if (panelKbOff) window.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1 = true;
    if (iframeDedupeOff) window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1 = true;
    if (lifecycleOffOn) window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true;
    if (legacySelOffOn) window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 = true;
    if (dliOffOn) window.__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2 = true;
    if (chromeRoutingOffOn) window.__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3 = true;
    if (chromeDomReadyOffOn) window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4 = true;
    if (panelBTransportOffOn) window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1 = true;
    if (panelBTransportAOffOn) window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_A_V1 = true;
    if (orderMcStateConvergeOffOn) window.__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX = true;
    if (v9QuickbarLiveResolveOffOn) window.__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1 = true;
    if (vpAvLabelBridgeOffOn) window.__TALARIA_DISABLE_VP_V9_AV_LABEL_BRIDGE_FIX = true;
    if (vpAvCoordRepositionOffOn) window.__TALARIA_DISABLE_VP_V9_AV_COORD_REPOSITION_FIX = true;
    if (axisMarginFloorOffOn) window.__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX = true;
    if (vpHandleCanvasRoutingOffOn) window.__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX = true;
    if (armedDrawFocusForwardOffOn) window.__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1 = true;
    if (ctrlMarqueeOffOnArg) window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX = true;
    if (otMsHighlightOffOnArg) window.__TALARIA_DISABLE_OBJECTS_TREE_MULTISELECT_HIGHLIGHT_V1 = true;
    if (Array.isArray(bugFlagList)) {
      for (const f of bugFlagList) window[f] = true;
    }
    if (phase1OffOn) window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = true;
    if (migOn) {
      window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = false;
      window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = false;
      window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = false;
      window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 = false;
    }
    try {
      localStorage.setItem('_uid', '1');
      const sid = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('u1_backtestingSession', JSON.stringify({ ...sess, session_id: sid }));
    } catch (_) { /* ignore */ }
  }, HARNESS_BACKTEST_SESSION, off, peerOff, kbOff, mig, p1Off, p5Off, dedupeOff, lcOff, legOff, dliOff, croff, cdroff, pbstOff, pbstAOff, omscOff, v9qlrOff, vpAvLblOff, vpAvCoordOff, amfOff, vpHandleRouteOff, armedDrawFwdOff, ctrlMarqueeOffOn, otMsHighlightOffOn, bugFlags);
}

/** Assert parent globals are NOT directly visible inside a panel iframe (I14 boundary). */
export async function assertIframeBoundary(frame, panelId = 'B') {
  if (!frame) return { ok: false, panelId, reason: 'no frame handle' };
  const state = await frame.evaluate(() => ({
    buildId: window.__TALARIA_CHART_BUILD_ID || null,
    embedFlag: window.__talariaV9PanelEmbed === true,
    parentGridInIframe: !!(window.__multichartGrid),
    parentGridViaParent: (() => {
      try { return !!window.parent.__multichartGrid; } catch (_) { return 'cross-origin-blocked'; }
    })(),
    isEmbedDoc: document.documentElement.classList.contains('multichart-embed')
      || new URLSearchParams(window.location.search).get('multichart') === '1',
  }));
  const ok = !state.parentGridInIframe && (state.isEmbedDoc || state.embedFlag);
  return { ok, panelId, ...state };
}

/** Legacy toolbar visibility INSIDE the panel iframe (not parent). */
export async function readIframeToolbarState(frame) {
  if (!frame) return null;
  return frame.evaluate(() => {
    const el = document.getElementById('drawing-toolbar');
    const r = el && el.getBoundingClientRect();
    return {
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      embedFlag: window.__talariaV9PanelEmbed === true,
      legacyVisible: !!(r && r.width > 0 && r.height > 0 && el.style.display !== 'none'),
      legacyKilled: !!(el && el.getAttribute('data-v9-legacy-toolbar-killed') === '1'),
      dataLen: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0,
    };
  });
}

export async function waitForPanelFrame(page, panelId = 'B', timeoutMs = 120000) {
  await page.waitForFunction(
    (pid) => {
      try {
        return Array.from(document.querySelectorAll('iframe')).some((f) => {
          const src = f.getAttribute('src') || '';
          return src.includes('chart-embed') && src.includes(`panelId=${pid}`);
        });
      } catch (_) {
        return false;
      }
    },
    { timeout: timeoutMs },
    panelId,
  );
  for (let i = 0; i < 40; i += 1) {
    const map = panelFrameMap(page);
    if (map[panelId]) return map[panelId];
    await sleep(100);
  }
  return panelFrameMap(page)[panelId] || null;
}

const PAINTED_FN = () => {
  const c = window.chart;
  return !!(c && c.drawingManager && Array.isArray(c.data) && c.data.length > 0);
};

/** Strip host bt-preload splash (#backtestingLoader) that blocks page.mouse on panel A (I15). */
export async function dismissClickBlockers(page, panelId = 'A') {
  const dismissFn = () => {
    try { document.documentElement.classList.remove('bt-preload'); } catch (_) { /* ignore */ }
    const loader = document.getElementById('backtestingLoader');
    if (loader) {
      loader.classList.remove('active');
      loader.style.display = 'none';
      loader.style.pointerEvents = 'none';
      loader.style.visibility = 'hidden';
    }
    const root = document.getElementById('root');
    if (root) root.style.visibility = 'visible';
  };
  await page.evaluate(dismissFn).catch(() => {});
  const frame = chartTarget(page, panelId);
  if (frame && frame !== page) {
    await frame.evaluate(dismissFn).catch(() => {});
  }
}

export async function waitForReactMultichartReady(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => !!(window.__multichartGrid),
    { timeout: timeoutMs },
  );
  const frameB = await waitForPanelFrame(page, 'B', timeoutMs);
  if (!frameB) {
    throw new Error('react-parity: panel B iframe missing after grid ready');
  }

  await frameB.waitForFunction(
    () => window.chart && window.chart.drawingManager,
    { timeout: timeoutMs },
  );
  // setV9PanelEmbed panel-cmd may arrive shortly after iframe paint.
  await frameB.waitForFunction(
    () => window.__talariaV9PanelEmbed === true,
    { timeout: 30_000 },
  ).catch(() => {});

  await waitForPanelData(page, 'B', timeoutMs);
  await waitForPanelData(page, 'A', timeoutMs);

  const hostReady = await page.evaluate(() => {
    const c = window.chart;
    return !!(c && Array.isArray(c.data) && c.data.length > 0);
  }).catch(() => false);

  await page.waitForFunction(
    () => !document.documentElement.classList.contains('bt-preload')
      || (window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0),
    { timeout: 30_000 },
  ).catch(() => {});
  await dismissClickBlockers(page, 'A');

  return { hostReady, bReady: true };
}

/** L1 — build id must match on host and every iframe panel. */
export async function assertBuildIds(page, expectedId) {
  const expected = expectedId != null ? expectedId : currentReactBuildId();
  const hostId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
  const frames = {};
  for (const [pid, frame] of Object.entries(panelFrameMap(page))) {
    frames[pid] = await frame.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
  }
  const hostOk = String(hostId) === String(expected);
  const frameOk = Object.values(frames).every((id) => String(id) === String(expected));
  return {
    ok: hostOk && frameOk,
    expectedId: expected,
    hostId,
    frames,
  };
}

export async function focusReactPanel(page, panelId) {
  await dismissClickBlockers(page, panelId);
  await page.evaluate((pid) => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.focusPanelById === 'function') grid.focusPanelById(pid);
  }, panelId);
  const pt = await reactChartCanvasPagePoint(page, panelId, 0.45, 0.5);
  if (pt) await page.mouse.click(pt.x, pt.y, { delay: 25 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, panelId };
}

/** Focus panel for keyboard modifiers without canvas click (preserves selection). */
export async function focusReactPanelSoft(page, panelId) {
  await dismissClickBlockers(page, panelId);
  await page.evaluate((pid) => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.focusPanelById === 'function') grid.focusPanelById(pid);
  }, panelId);
  await waitForPanelSettle(page, panelId);
  return { ok: true, panelId };
}

export async function readProductionFocusedPanelId(page) {
  return page.evaluate(() => {
    try {
      const grid = window.__multichartGrid;
      return grid && typeof grid.getFocusedPanelId === 'function'
        ? String(grid.getFocusedPanelId() || '')
        : '';
    } catch (_) {
      return '';
    }
  });
}

export async function probeMultichartGridChartResolver(page) {
  return page.evaluate(() => {
    const g = window.__multichartGrid;
    return {
      hasGrid: !!g,
      hasGetFocusedPanelId: !!(g && typeof g.getFocusedPanelId === 'function'),
      hasGetChartForPanelId: !!(g && typeof g.getChartForPanelId === 'function'),
      hasGetChartForPanel: !!(g && typeof g.getChartForPanel === 'function'),
      hostPanelId: g && g.hostPanelId != null ? String(g.hostPanelId) : null,
    };
  });
}

/** Arm on focused panel via production syncDrawingToolAcrossPanels (I15 live-faithful). */
export async function armPanelDrawToolViaProductionSync(page, panelId, tool = 'rectangle') {
  await dismissClickBlockers(page, panelId);
  const pt = await reactChartCanvasPagePoint(page, panelId, 0.42, 0.48);
  if (!pt) return { ok: false, reason: 'no canvas point' };
  await page.mouse.click(pt.x, pt.y, { delay: 25 });
  await sleep(350);
  const focused = await readProductionFocusedPanelId(page);
  if (focused !== String(panelId)) {
    return { ok: false, reason: `focus mismatch want=${panelId} got=${focused}` };
  }
  const armRes = await page.evaluate(async (toolName) => {
    const grid = window.__multichartGrid;
    if (!grid || typeof grid.syncDrawingToolAcrossPanels !== 'function') {
      return { ok: false, reason: 'no syncDrawingToolAcrossPanels' };
    }
    await grid.syncDrawingToolAcrossPanels(toolName);
    const fid = typeof grid.getFocusedPanelId === 'function' ? grid.getFocusedPanelId() : null;
    const getCh = typeof grid.getChartForPanelId === 'function'
      ? grid.getChartForPanelId.bind(grid)
      : (typeof grid.getChartForPanel === 'function' ? grid.getChartForPanel.bind(grid) : null);
    let focusedTool = null;
    let hostTool = null;
    try {
      if (getCh && fid) {
        const ch = getCh(fid);
        focusedTool = ch && ch.drawingManager ? ch.drawingManager.currentTool : null;
      }
      hostTool = window.chart && window.chart.drawingManager
        ? window.chart.drawingManager.currentTool : null;
    } catch (_) { /* ignore */ }
    return { ok: true, focused: fid, focusedTool, hostTool };
  }, tool);
  await sleep(200);
  return armRes;
}

/** Two-click rectangle on a panel without pre-focus (live topology). */
export async function twoClickRectangleLive(page, panelId) {
  const p1 = await reactChartCanvasPagePoint(page, panelId, 0.32, 0.38);
  const p2 = await reactChartCanvasPagePoint(page, panelId, 0.58, 0.62);
  if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
  const frame = chartTarget(page, panelId);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.click(p1.x, p1.y, { delay: 35 });
  await sleep(120);
  const mid = frame
    ? await frame.evaluate(() => {
        const dm = window.chart && window.chart.drawingManager;
        return {
          isDrawing: !!(dm && dm.drawingState && dm.drawingState.isDrawing),
          currentTool: dm && dm.currentTool,
        };
      }).catch(() => null)
    : null;
  await page.mouse.click(p2.x, p2.y, { delay: 35 });
  await sleep(350);
  const st = frame
    ? await frame.evaluate(() => {
        const dm = window.chart && window.chart.drawingManager;
        return { drawingCount: dm && dm.drawings ? dm.drawings.length : 0 };
      }).catch(() => null)
    : null;
  return {
    ok: true,
    midIsDrawing: !!(mid && mid.isDrawing),
    midCurrentTool: mid && mid.currentTool,
    drawingCount: st && st.drawingCount,
  };
}

/** Wait until panel render counter is stable for one animation frame pair. */
export async function waitForPanelSettle(page, panelId, budgetMs = 4000) {
  const frame = chartTarget(page, panelId);
  if (!frame) return false;
  return frame.evaluate((timeout) => new Promise((resolve) => {
    const start = performance.now();
    let stablePasses = 0;
    let lastSel = -1;
    const tick = () => {
      const ch = window.chart;
      const dm = ch && ch.drawingManager;
      const cur = ch && ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : -1;
      const hasChart = !!(dm && Array.isArray(ch.data) && ch.data.length > 0);
      if (hasChart && (cur < 0 || cur === lastSel)) stablePasses += 1;
      else stablePasses = 0;
      lastSel = cur;
      if (stablePasses >= 2) {
        resolve(true);
        return;
      }
      if (performance.now() - start > timeout) {
        resolve(hasChart);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), budgetMs);
}

/**
 * After iframe/panel selection, wait for parent chrome routing to settle.
 * @param opts.requireGearReady — when true (default), wait for V9 gear-ready event (H-R12 gear route).
 *   When false, only focus+settle (H-R04/H-R09 dbl-click paths — gear event may not fire).
 */
export async function awaitParentChromeAfterPanelSelect(page, panelId, drawingId, opts = {}) {
  const requireGear = opts.requireGearReady !== false;
  const timeoutMs = opts.timeoutMs ?? (panelId === 'B' ? 12_000 : 5000);
  await focusReactPanelSoft(page, panelId);
  await waitForPanelSettle(page, panelId);
  if (!requireGear) return { ok: true, detail: { signal: 'settle-only', panelId } };
  return waitForV9QuickBarReady(page, drawingId, timeoutMs);
}

export async function readParentReactSettings(page) {
  return page.evaluate(() => {
    const root = document.getElementById('multichart-global-settings-root');
    const modal = document.querySelector('.tv-settings-modal');
    const modalVisible = !!(modal && modal.offsetParent !== null);
    const rootText = String((root && root.innerText) || '').trim();
    const modalText = String((modal && modal.innerText) || '').trim();
    const text = modalText || rootText;
    const hasStyleSection = /\bstyle\b/i.test(text);
    const messageOpen = !!window.__harnessParentSettingsOpen;
    // V9 quick-bar shell mounts into #multichart-global-settings-root with tiny text (e.g. "A")
    // but is NOT the drawing-settings modal — must not satisfy settings-open probes (I13).
    const quickBarShellOnly = !modalVisible && !hasStyleSection && !messageOpen
      && !!(root && root.childElementCount > 0)
      && rootText.length <= 4;
    const domSettingsOpen = modalVisible
      || (hasStyleSection && !!(root && root.childElementCount > 0));
    const open = messageOpen || (domSettingsOpen && !quickBarShellOnly);
    return {
      open,
      textSnippet: text.slice(0, 240),
      hasStyleSection,
      messageOpen,
      modalVisible,
      quickBarShellOnly,
    };
  });
}

/** Wait until the real parent settings surface opens (not V9 quick-bar shell only). */
export async function waitForParentDrawingSettingsOpen(page, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readParentReactSettings(page);
    if (last.open && !last.quickBarShellOnly && last.hasStyleSection) {
      return { ok: true, settings: last };
    }
    await sleep(50);
  }
  last = last || await readParentReactSettings(page);
  return { ok: false, settings: last };
}

export async function readSelectionChrome(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };
  return frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(id));
    if (!d) return { ok: false, reason: 'drawing not found' };
    const node = d.group && d.group.node && d.group.node();
    const countVisibleHandles = (root) => {
      if (!root) return 0;
      return [...root.querySelectorAll('.resize-handle-group, .resize-handle, .custom-handle')].filter((el) => {
        const st = window.getComputedStyle(el);
        const op = Number(st.opacity);
        return st.display !== 'none' && st.visibility !== 'hidden' && !(Number.isFinite(op) && op <= 0.01);
      }).length;
    };
    const handles = countVisibleHandles(node);
    const inSel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    const selected = inSel || !!d.selected;
    const hasBlueBorder = handles > 0;
    return {
      ok: true,
      selected,
      handleCount: handles,
      axisHighlightCount: 0,
      hasBlueBorder,
    };
  }, drawId);
}

/** Drawings on a panel that still show selection chrome (store-selected or visible handles). */
export async function readPanelSelectionOutlineCount(page, panelId, excludeDrawId = null) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}`, count: null };
  return frame.evaluate((excludeId) => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm || !Array.isArray(dm.drawings)) {
      return { ok: true, count: 0, details: [] };
    }
    let count = 0;
    const details = [];
    for (const d of dm.drawings) {
      if (!d || (excludeId != null && String(d.id) === String(excludeId))) continue;
      const node = d.group && d.group.node && d.group.node();
      const handleCount = node
        ? [...node.querySelectorAll('.resize-handle-group, .resize-handle, .custom-handle')].filter((el) => {
          const st = window.getComputedStyle(el);
          const op = Number(st.opacity);
          return st.display !== 'none' && st.visibility !== 'hidden' && !(Number.isFinite(op) && op <= 0.01);
        }).length
        : 0;
      const inSel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(d.id))
        || !!d.selected;
      if (inSel || handleCount > 0) {
        count += 1;
        details.push({ id: d.id, handleCount, inSel: !!inSel });
      }
    }
    return { ok: true, count, details };
  }, excludeDrawId);
}

export async function readCtrlMarqueeState(page, panelId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  return frame.evaluate(() => {
    const m = window.chart && window.chart.ctrlMarqueeSelect;
    if (!m) return { active: false, w: 0, h: 0 };
    const w = Math.abs(Number(m.endX || 0) - Number(m.startX || 0));
    const h = Math.abs(Number(m.endY || 0) - Number(m.startY || 0));
    return { active: !!m.active, w, h };
  });
}

/**
 * Wait for D-024 parent V9 chrome DOM-ready (post-#tl-sett commit + handler bind).
 * Resolves when event fires, DOM flag is set, or cached window state matches — FAILS on timeout.
 */
export async function waitForParentV9ChromeDomReady(page, panelId, drawingId, timeoutMs = 8000) {
  return page.evaluate((pid, drawId, timeout) => new Promise((resolve) => {
    const finish = (ok, detail) => resolve({ ok, detail });
    const domFlagPresent = () => !!(
      document.querySelector('#tl-sett[data-v9-chrome-dom-ready="1"]')
      || document.querySelector('[data-tlbar="1"][data-v9-chrome-dom-ready="1"]')
    );
    const stateReady = (d) => {
      if (!d || d.domReady !== true) return false;
      if (drawId != null && String(d.drawingId) !== String(drawId)) return false;
      if (pid != null && d.panelId != null && String(d.panelId) !== String(pid)) return false;
      return true;
    };
    const focusedPanelMatches = () => {
      try {
        const grid = window.__multichartGrid;
        const focused = grid && typeof grid.getFocusedPanelId === 'function'
          ? String(grid.getFocusedPanelId() || '')
          : '';
        return !pid || focused === String(pid);
      } catch (_) {
        return false;
      }
    };
    const domReadyFlag = () => domFlagPresent() && focusedPanelMatches();
    const matches = (d) => stateReady(d) || domReadyFlag();
    const cleanup = (timer, pollId, onReady) => {
      clearTimeout(timer);
      clearInterval(pollId);
      window.removeEventListener('talaria:v9-quickbar-dom-ready', onReady);
    };
    try {
      const cur = window.__talariaV9QuickBarDomReady;
      if (matches(cur)) {
        return finish(true, {
          signal: stateReady(cur) ? 'cached-state' : 'cached-dom',
          ...(stateReady(cur) ? cur : {}),
          domFlag: domFlagPresent(),
        });
      }
    } catch (_) { /* ignore */ }
    let pollId;
    const timer = setTimeout(() => finish(false, {
      reason: 'timeout',
      signal: 'talaria:v9-quickbar-dom-ready',
      domFlag: domFlagPresent(),
      cached: window.__talariaV9QuickBarDomReady || null,
    }), timeout);
    const onReady = (ev) => {
      const d = ev && ev.detail;
      if (!matches(d)) return;
      cleanup(timer, pollId, onReady);
      finish(true, {
        signal: 'talaria:v9-quickbar-dom-ready',
        ...(d || {}),
        domFlag: domFlagPresent(),
      });
    };
    window.addEventListener('talaria:v9-quickbar-dom-ready', onReady);
    pollId = setInterval(() => {
      try {
        const cur = window.__talariaV9QuickBarDomReady;
        if (matches(cur)) {
          cleanup(timer, pollId, onReady);
          finish(true, {
            signal: stateReady(cur) ? 'dom-poll-state' : 'dom-poll-flag',
            ...(stateReady(cur) ? cur : {}),
            domFlag: domFlagPresent(),
          });
        }
      } catch (_) { /* ignore */ }
    }, 16);
  }), panelId, drawingId, timeoutMs);
}

export async function waitForV9QuickBarReady(page, drawingId, timeoutMs = 5000) {
  return page.evaluate((drawId, timeout) => new Promise((resolve) => {
    const finish = (ok, detail) => resolve({ ok, detail });
    const matches = (d) => d && drawId != null && String(d.drawingId) === String(drawId);
    try {
      const cur = window.__talariaV9QuickBarGearReady;
      if (matches(cur)) return finish(true, { signal: 'cached', ...cur });
    } catch (_) { /* ignore */ }
    const timer = setTimeout(() => finish(false, { reason: 'timeout', signal: 'talaria:v9-quickbar-gear-ready' }), timeout);
    const onReady = (ev) => {
      const d = ev && ev.detail;
      if (!matches(d)) return;
      clearTimeout(timer);
      window.removeEventListener('talaria:v9-quickbar-gear-ready', onReady);
      finish(true, { signal: 'talaria:v9-quickbar-gear-ready', ...d });
    };
    window.addEventListener('talaria:v9-quickbar-gear-ready', onReady);
    const poll = () => {
      const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
      const gr = gear && gear.getBoundingClientRect();
      const legacy = document.getElementById('drawing-toolbar');
      const lr = legacy && legacy.getBoundingClientRect();
      const legacyVisible = !!(lr && lr.width > 0 && lr.height > 0 && legacy.style.display !== 'none');
      const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
      const v9BarRect = v9Bar && v9Bar.getBoundingClientRect();
      const v9BarVisible = !!(v9BarRect && v9BarRect.width > 0 && v9BarRect.height > 0);
      const v9Visible = !!(gr && gr.width > 0 && gr.height > 0) || v9BarVisible;
      if (v9Visible && !legacyVisible) {
        clearTimeout(timer);
        window.removeEventListener('talaria:v9-quickbar-gear-ready', onReady);
        finish(true, { signal: 'dom-poll', v9Visible, legacyVisible });
      }
    };
    const pollId = setInterval(poll, 16);
    const cleanup = () => clearInterval(pollId);
    window.addEventListener('talaria:v9-quickbar-gear-ready', () => cleanup(), { once: true });
  }), drawingId, timeoutMs);
}

export async function clickV9QuickBarGear(page) {
  const rect = await page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    if (!gear) return { ok: false, reason: 'no #tl-sett' };
    const r = gear.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return { ok: false, reason: 'v9 gear not visible', rect: { w: r.width, h: r.height } };
    }
    return {
      ok: true,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  });
  if (!rect || !rect.ok) return rect;
  await page.mouse.click(rect.x, rect.y, { delay: 30 });
  return { ok: true, clicked: { x: rect.x, y: rect.y } };
}
/** Place + deselect a drawing on a panel; returns { id, panelId }. */
export async function seedDrawing(page, panelId, toolType = 'trendline') {
  await focusReactPanel(page, panelId);
  const pts = toolType === 'rectangle'
    ? await reactDefaultRectanglePoints(page, panelId)
    : await reactDefaultTrendlinePoints(page, panelId);
  const placed = await placeTool(page, panelId, toolType, pts);
  const frame = chartTarget(page, panelId);
  await frame.evaluate((drawId) => {
    try {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm) return;
      const d = (dm.drawings || []).find((x) => x && String(x.id) === String(drawId));
      if (d && typeof dm.deselectDrawing === 'function') {
        dm.deselectDrawing(d);
      } else if (typeof dm.deselectAll === 'function') {
        dm.deselectAll();
      }
      if (typeof dm.clearTool === 'function') dm.clearTool(true);
    } catch (_) { /* iframe teardown race after prior scenario */ }
  }, placed.id);
  await waitForPanelSettle(page, panelId);
  return { ...placed, panelId };
}

export async function singleClickDrawing(page, panelId, drawId) {
  await dismissClickBlockers(page, panelId);
  const hit = await drawingHitLocalPoint(page, panelId, drawId, { aim: 'body' });
  if (!hit || !hit.ok) return hit;
  const pagePt = await localToPagePoint(page, panelId, hit.x, hit.y);
  if (!pagePt) return { ok: false, reason: 'no page point' };

  let onScreen = await page.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    const tag = el ? el.tagName : null;
    const id = el && el.id;
    return { ok: !!el, tag, id, x, y };
  }, pagePt.x, pagePt.y);

  if (!onScreen.ok) {
    return { ok: false, reason: 'elementFromPoint null', hit, pagePt, onScreen };
  }
  if (hit.findHit === false) {
    return { ok: false, reason: 'findDrawingsAtPoint miss', hit, pagePt, onScreen };
  }
  if (hit.actuatable === false) {
    return { ok: false, reason: 'no svg actuatable pixel', hit, pagePt, onScreen };
  }
  await page.mouse.move(pagePt.x, pagePt.y);
  await page.mouse.click(pagePt.x, pagePt.y, { clickCount: 1, delay: 30 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, clicked: pagePt, actuation: 'page.mouse.click', hitMethod: hit.method };
}

/** Real mouse click on empty chart canvas (I15 miss actuation — H-R02 discriminator arm). */
export async function singleClickCanvasBackground(page, panelId) {
  await dismissClickBlockers(page, panelId);
  const pagePt = await reactChartCanvasPagePoint(page, panelId, 0.08, 0.12);
  if (!pagePt) return { ok: false, reason: 'no canvas point' };
  await page.mouse.move(pagePt.x, pagePt.y);
  await page.mouse.click(pagePt.x, pagePt.y, { clickCount: 1, delay: 30 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, clicked: pagePt, actuation: 'page.mouse.click(canvas-miss)' };
}

export async function doubleClickDrawing(page, panelId, drawId) {
  await dismissClickBlockers(page, panelId);
  const hit = await drawingHitLocalPoint(page, panelId, drawId, { aim: 'center' });
  if (!hit || !hit.ok) return hit;
  const pagePt = await localToPagePoint(page, panelId, hit.x, hit.y);
  if (!pagePt) return { ok: false, reason: 'no page point' };
  await page.mouse.click(pagePt.x, pagePt.y, { clickCount: 2, delay: 40 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, clicked: pagePt, actuation: 'page.mouse.dblclick' };
}

export async function ctrlClickDrawing(page, panelId, drawId) {
  await focusReactPanelSoft(page, panelId);
  await page.keyboard.down('Control');
  try {
    return await singleClickDrawing(page, panelId, drawId);
  } finally {
    await page.keyboard.up('Control');
  }
}

/** Open V9 Objects Tree / Layers right panel (I15 — real click). */
export async function openV9LayersPanel(page) {
  const btn = await page.$('[data-v9-utility="layers"]');
  if (!btn) return { ok: false, reason: 'layers utility button not found' };
  await btn.click();
  await sleep(200);
  return { ok: true, actuation: 'click[data-v9-utility=layers]' };
}

/** Count parent Layers rows with multi-select highlight probe. */
export async function countV9LayerSelectedRows(page, minRows = 1, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await page.evaluate(() => document.querySelectorAll('[data-layer-selected="1"]').length);
    if (last >= minRows) return { ok: true, count: last };
    await sleep(80);
  }
  return { ok: false, count: last };
}

/** Count visible layer inventory rows (name spans in layers panel). */
export async function countV9LayerInventoryRows(page) {
  return page.evaluate(() => document.querySelectorAll('[data-v9-layer-row="1"]').length);
}

export function reactParityUrlWithLayout(stackUrl, mcLayout = '2v') {
  if (!stackUrl) return stackUrl;
  if (/mcLayout=/.test(stackUrl)) return stackUrl.replace(/mcLayout=[^&]+/, `mcLayout=${encodeURIComponent(mcLayout)}`);
  const sep = stackUrl.includes('?') ? '&' : '?';
  return `${stackUrl}${sep}mcLayout=${encodeURIComponent(mcLayout)}`;
}

/** Ctrl+drag marquee via real page.mouse at iframe-translated coords (I15 — all panels). */
export async function ctrlDragMarquee(page, panelId) {
  await focusReactPanel(page, panelId);
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };
  await frame.evaluate(() => {
    try {
      const ch = window.chart;
      const dm = ch && ch.drawingManager;
      if (ch) ch.tool = null;
      if (dm && typeof dm.clearTool === 'function') dm.clearTool(true);
      if (dm && typeof dm.deselectAll === 'function') dm.deselectAll();
    } catch (_) { /* ignore */ }
  });
  await waitForPanelSettle(page, panelId);
  await page.keyboard.down('Control');
  try {
    const p1 = await reactChartCanvasPagePoint(page, panelId, 0.12, 0.18);
    const p2 = await reactChartCanvasPagePoint(page, panelId, 0.78, 0.82);
    if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    let during = { active: false, w: 0, h: 0 };
    for (let step = 1; step <= 16; step += 1) {
      const fx = p1.x + ((p2.x - p1.x) * step) / 16;
      const fy = p1.y + ((p2.y - p1.y) * step) / 16;
      await page.mouse.move(Math.round(fx), Math.round(fy), { steps: 2 });
      const snap = await readCtrlMarqueeState(page, panelId);
      if (snap && snap.active && snap.w > 8 && snap.h > 8) {
        during = snap;
      } else if (snap && (snap.w > during.w || snap.h > during.h)) {
        during = snap;
      }
    }
    await page.mouse.up();
    await waitForPanelSettle(page, panelId);
    return { ok: true, during, p1, p2, actuation: 'page.mouse.ctrlDrag' };
  } finally {
    await page.keyboard.up('Control');
  }
}

/** Press Escape via real page.keyboard (I15 — no handleKeyDown / dispatchEvent). */
export async function pressEscapeReact(page, panelId) {
  await focusReactPanel(page, panelId);
  await page.keyboard.press('Escape');
  await waitForPanelSettle(page, panelId);
  return { ok: true, actuation: 'page.keyboard.press(Escape)' };
}

/** Delete selected drawing via real page.keyboard (I15). */
export async function deleteSelectedViaKeyboard(page, panelId) {
  await focusReactPanelSoft(page, panelId);
  await page.keyboard.press('Delete');
  await waitForPanelSettle(page, panelId);
  return { ok: true, actuation: 'page.keyboard.press(Delete)' };
}

export async function readV9QuickBarState(page) {
  return page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    const gr = gear && gear.getBoundingClientRect();
    const v9Bar = document.querySelector('[data-tlbar="1"], #v9-tl-bar');
    const br = v9Bar && v9Bar.getBoundingClientRect();
    const legacy = document.getElementById('drawing-toolbar');
    const lr = legacy && legacy.getBoundingClientRect();
    return {
      v9Visible: !!(gr && gr.width > 0 && gr.height > 0) || !!(br && br.width > 0 && br.height > 0),
      legacyVisible: !!(lr && lr.width > 0 && lr.height > 0),
    };
  });
}

/** Built-product parity state: iframe selection + parent V9 quick-bar (legacy toolbar.hidden in embed). */
export async function readReactParityState(page, panelId = 'A') {
  const local = await readInteractiveState(page, panelId);
  const focusedId = await page.evaluate(() => {
    try {
      const grid = window.__multichartGrid;
      if (grid && typeof grid.getFocusedPanelId === 'function') {
        return String(grid.getFocusedPanelId() || 'A');
      }
    } catch (_) { /* ignore */ }
    return 'A';
  });
  const v9 = (panelId === focusedId) ? await readV9QuickBarState(page) : { v9Visible: false, legacyVisible: false };
  const toolbarVisible = !!(v9 && v9.v9Visible) || !!(local && local.toolbarVisible);
  return {
    ...local,
    toolbarVisible,
    v9QuickBarVisible: !!(v9 && v9.v9Visible),
    parentLegacyVisible: !!(v9 && v9.legacyVisible),
    focusedPanelId: focusedId,
  };
}

export async function clearPanelDrawings(page, panelId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return;
  await frame.evaluate(() => {
    try {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm || !Array.isArray(dm.drawings)) return;
      const copy = dm.drawings.slice();
      for (const d of copy) {
        if (d && typeof dm.deleteDrawing === 'function') dm.deleteDrawing(d);
      }
      if (typeof dm.deselectAll === 'function') dm.deselectAll();
      if (typeof dm.clearTool === 'function') dm.clearTool(true);
      if (typeof dm.saveDrawings === 'function') dm.saveDrawings();
      if (window.chart.scheduleRender) window.chart.scheduleRender();
    } catch (_) { /* ignore */ }
  });
}

export async function disarmDrawTool(page, panelId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return;
  await frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return;
    if (typeof dm.clearTool === 'function') dm.clearTool(true);
    dm.currentTool = null;
  });
}

export async function isDrawingSelected(page, panelId, drawId) {
  return readDrawingSelectedInStore(page, panelId, drawId);
}

export async function waitForReactSelection(page, panelId, expectedIds, timeoutMs = 6000) {
  const want = (Array.isArray(expectedIds) ? expectedIds : [expectedIds]).map(String);
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readReactParityState(page, panelId);
    const got = [];
    for (const id of want) {
      if (await isDrawingSelected(page, panelId, id)) got.push(id);
    }
    const sortedGot = [...got].sort();
    const sortedWant = [...want].sort();
    if (sortedWant.length === sortedGot.length && sortedWant.every((id, i) => id === sortedGot[i])) {
      return last;
    }
    await sleep(80);
  }
  return last || readReactParityState(page, panelId);
}

export async function drawingExists(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return false;
  return frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    return !!(dm && (dm.drawings || []).some((d) => d && String(d.id) === String(id)));
  }, drawId);
}

/** V9 multichart: store selection + parent V9 bar for focused panel (I15). */
export async function assertReactMenuState(checks, label, expected, actual, page, panelId) {
  const toolbarVisible = await readParentV9BarVisible(page, panelId);
  const parts = [];
  let ok = true;
  if (expected.selectedIds != null) {
    for (const id of expected.selectedIds) {
      if (!(await isDrawingSelected(page, panelId, id))) ok = false;
    }
    parts.push(`selectedIds=${JSON.stringify(expected.selectedIds)} storeOk=${ok}`);
  }
  if (expected.toolbarVisible != null && !!toolbarVisible !== !!expected.toolbarVisible) {
    ok = false;
    parts.push(`v9BarVisible=${toolbarVisible} expected=${expected.toolbarVisible}`);
  }
  if (expected.selectedIds == null && expected.toolbarVisible == null) {
    const merged = {
      ...actual,
      toolbarVisible: !!(actual?.v9QuickBarVisible || actual?.toolbarVisible),
    };
    return assertMenuState(checks, label, expected, merged);
  }
  return checks.check(label, ok, parts.join('; '));
}

export async function reactDefaultTrendlinePoints(page, panelId = 'A', barOffset = 0) {
  const frame = chartTarget(page, panelId);
  if (!frame) throw new Error(`reactDefaultTrendlinePoints: no frame for ${panelId}`);
  const pts = await frame.evaluate((pid, offset) => {
    const ch = window.chart;
    if (!ch || !Array.isArray(ch.data) || ch.data.length < 120) return null;
    const spacing = typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 7;
    const visStart = Math.max(0, Math.floor(-(ch.offsetX || 0) / spacing) + 12);
    const skew = pid === 'B' ? 8 : 0;
    const i0 = Math.min(ch.data.length - 35, visStart + skew + offset);
    const i1 = Math.min(ch.data.length - 1, i0 + 28);
    const p0 = ch.data[i0];
    const p1 = ch.data[i1];
    if (!p0 || !p1) return null;
    const y0 = (p0.h + p0.l) / 2;
    const y1 = (p1.h + p1.l) / 2;
    return [{ x: i0, y: y0 }, { x: i1, y: y1 }];
  }, panelId, barOffset).catch(() => null);
  if (!pts) throw new Error(`reactDefaultTrendlinePoints: insufficient bar data on panel ${panelId}`);
  return pts;
}

export async function reactDefaultRectanglePoints(page, panelId = 'A', barOffset = 0) {
  const frame = chartTarget(page, panelId);
  if (!frame) throw new Error(`reactDefaultRectanglePoints: no frame for ${panelId}`);
  const pts = await frame.evaluate((pid, offset) => {
    const ch = window.chart;
    if (!ch || !Array.isArray(ch.data) || ch.data.length < 120) return null;
    const spacing = typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 7;
    const visStart = Math.max(0, Math.floor(-(ch.offsetX || 0) / spacing) + 12);
    const skew = pid === 'B' ? 8 : 0;
    const i0 = Math.min(ch.data.length - 35, visStart + skew + offset);
    const i1 = Math.min(ch.data.length - 1, i0 + 28);
    const p0 = ch.data[i0];
    const p1 = ch.data[i1];
    if (!p0 || !p1) return null;
    const yTop = Math.max(p0.h, p1.h);
    const yBot = Math.min(p0.l, p1.l);
    return [{ x: i0, y: yTop }, { x: i1, y: yBot }];
  }, panelId, barOffset).catch(() => null);
  if (!pts) throw new Error(`reactDefaultRectanglePoints: insufficient bar data on panel ${panelId}`);
  return pts;
}

export async function waitForPanelData(page, panelId, timeoutMs = 90_000) {
  const frame = chartTarget(page, panelId);
  if (!frame) throw new Error(`waitForPanelData: no frame for ${panelId}`);
  await frame.waitForFunction(
    () => {
      const c = window.chart;
      return !!(c && Array.isArray(c.data) && c.data.length > 0);
    },
    { timeout: timeoutMs },
  );
  return true;
}

/** Off-5m-boundary anchor index + close price for VP tools (H-A8-VP-*). */
export async function defaultVolumeAnchorPoints(page, pointCount = 1, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  if (!frame) throw new Error(`defaultVolumeAnchorPoints: no frame for panel ${panelId}`);
  return frame.evaluate((n) => {
    const ch = window.chart;
    const len = Array.isArray(ch?.data) ? ch.data.length : 0;
    const pickOffFiveMinuteBoundary = (startFraction) => {
      const start = Math.max(10, Math.floor(len * startFraction));
      for (let i = start; i < Math.min(len - 1, start + 120); i++) {
        const t = Number(ch.data[i]?.t);
        if (Number.isFinite(t) && t % (5 * 60 * 1000) !== 0) return i;
      }
      return start;
    };
    const first = pickOffFiveMinuteBoundary(0.30);
    const second = Math.max(first + 10, pickOffFiveMinuteBoundary(0.45));
    const a = ch.data[first];
    const b = ch.data[second];
    if (!a || !Number.isFinite(Number(a.c))) {
      const fallback = ch.data[Math.max(10, Math.floor(len * 0.5))];
      if (!fallback) return [];
      return [{ x: Math.max(10, Math.floor(len * 0.5)), y: Number(fallback.c ?? fallback.close ?? 1) }];
    }
    if (n === 1) return [{ x: first, y: Number(a.c) }];
    return [
      { x: first, y: Number(a.h) },
      { x: second, y: Number(b.l) },
    ];
  }, pointCount);
}

function avSettingsPanelTitleRe(kind) {
  return kind === 'fixed' ? /Fixed Range Volume Profile/i : /Anchored Volume Profile/i;
}

/** V9 floating UI uses onPointerDown (modalPointerActivate) — dispatch pointerdown at page coords. */
async function pointerActivateAt(page, x, y) {
  await page.mouse.move(x, y);
  const fired = await page.evaluate((px, py) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: px,
      clientY: py,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    }));
    return true;
  }, x, y);
  if (!fired) {
    await page.mouse.down();
    await page.mouse.up();
  }
  return { ok: true };
}

export async function waitForAvVolumeProfileSettingsOpen(page, { kind = 'anchored', timeoutMs = 6000 } = {}) {
  const titleRe = avSettingsPanelTitleRe(kind);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await page.evaluate((reSrc, reFlags) => {
      const re = new RegExp(reSrc, reFlags);
      const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
        .find((el) => re.test(el.innerText || ''));
      if (!panel) return { ok: false };
      const text = panel.innerText || '';
      return {
        ok: true,
        hasLabelsRow: /\bLabels\b/i.test(text) && /\bPrice\b/i.test(text) && /\bTime\b/i.test(text),
        hasCoordinatesTab: /\bCoordinates\b/i.test(text),
        snippet: text.slice(0, 200),
      };
    }, titleRe.source, titleRe.flags);
    if (snap.ok) return snap;
    await sleep(100);
  }
  return { ok: false, reason: 'timeout' };
}

/** Open anchored VP V9 settings via dbl-click, AV toolbar gear, or anchor-handle dbl-click (I15). */
export async function openAvVolumeProfileSettings(page, panelId, drawId) {
  await focusReactPanelSoft(page, panelId);
  let dbl = await doubleClickDrawing(page, panelId, drawId);
  let open = await waitForAvVolumeProfileSettingsOpen(page, { timeoutMs: 2500 });
  if (open.ok) return { ok: true, method: dbl?.ok ? 'dblclick' : 'dblclick-late', open };

  const gear = await page.evaluate(() => {
    const btn = document.querySelector('#avb-sett');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (gear) {
    await page.mouse.click(gear.x, gear.y, { delay: 30 });
    await sleep(200);
    open = await waitForAvVolumeProfileSettingsOpen(page, { timeoutMs: 4000 });
    if (open.ok) return { ok: true, method: 'av-toolbar-gear', open };
  }

  const handle = await resolveAnchoredVpAnchorHandlePagePoint(page, panelId, drawId);
  if (handle?.ok) {
    await page.mouse.click(handle.x, handle.y, { clickCount: 2, delay: 40 });
    await sleep(200);
    open = await waitForAvVolumeProfileSettingsOpen(page, { timeoutMs: 4000 });
    if (open.ok) return { ok: true, method: 'handle-dblclick', open };
  }

  const frame = chartTarget(page, panelId);
  const frameRect = frame ? await reactFrameRectForPanel(page, panelId) : null;
  if (frame) {
    const invoked = await frame.evaluate((id, frameLeft, frameTop) => {
      try {
        const dm = window.chart && window.chart.drawingManager;
        const d = dm && (dm.drawings || []).find((x) => x && String(x.id) === String(id));
        if (!d || typeof dm.editDrawing !== 'function') return { ok: false, reason: 'no editDrawing' };
        const pageX = frameLeft + Math.max(80, window.innerWidth / 2);
        const pageY = frameTop + Math.max(80, window.innerHeight / 2);
        dm.editDrawing(d, pageX, pageY);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: String(err && err.message ? err.message : err) };
      }
    }, drawId, frameRect?.left || 0, frameRect?.top || 0);
    if (invoked?.ok) {
      await sleep(250);
      open = await waitForAvVolumeProfileSettingsOpen(page, { timeoutMs: 4000 });
      if (open.ok) return { ok: true, method: 'editDrawing-fallback', open };
    }
  }

  return { ok: false, reason: 'settings not opened', dblReason: dbl?.reason || null, open };
}

export async function clickAvSettingsTab(page, tabId) {
  const tabPatterns = {
    style: /^Style$/i,
    coordinates: /^Coordinates$/i,
    inputs: /^Inputs$/i,
    visibility: /^Visibility$/i,
  };
  const tabRe = tabPatterns[tabId] || new RegExp(`^${String(tabId)}$`, 'i');
  const rect = await page.evaluate((reSrc, reFlags) => {
    const re = new RegExp(reSrc, reFlags);
    const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
      .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
    if (!panel) return null;
    const btn = [...panel.querySelectorAll('button')].find((b) => re.test((b.innerText || '').trim()));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, tabRe.source, tabRe.flags);
  if (!rect) return { ok: false, reason: 'tab not found' };
  await page.mouse.click(rect.x, rect.y);
  await sleep(120);
  return { ok: true };
}

export async function clickAvLabelCheckbox(page, which) {
  const boxIdx = which === 'time' ? 1 : 0;
  const rect = await page.evaluate((idx) => {
    const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
      .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
    if (!panel) return null;
    const labelsSpan = [...panel.querySelectorAll('span')]
      .find((s) => (s.textContent || '').trim() === 'Labels');
    if (!labelsSpan) return null;
    const row = labelsSpan.parentElement;
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    const boxes = row
      ? [...row.querySelectorAll('div')].filter((d) => /width:\s*66/.test(d.getAttribute('style') || ''))
      : [];
    const box = boxes[idx];
    const flex = box && box.querySelector('div[style*="inline-flex"]');
    if (!flex) return { fail: true, boxCount: boxes.length };
    const r = flex.getBoundingClientRect();
    return { x: r.left + 5, y: r.top + r.height / 2, boxCount: boxes.length };
  }, boxIdx);
  if (!rect || rect.fail) return { ok: false, reason: 'checkbox not found', detail: rect };
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
  return { ok: true };
}

export async function readAvVpLabelBridgeProbe(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  const engine = await frame.evaluate((id) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && (dm.drawings || []).find((x) => x && String(x.id) === String(id));
    if (!d || !d.style) return { ok: false, reason: 'drawing missing' };
    const svg = ch && ch.svg;
    let highlightNodes = 0;
    if (svg && typeof svg.selectAll === 'function') {
      highlightNodes = svg.selectAll(`.axis-highlight-group[data-drawing-id="${id}"]`).nodes().length;
    }
    const priceLabelEls = svg && typeof svg.selectAll === 'function'
      ? svg.selectAll('.axis-highlight-price, .axis-highlight-price-text').nodes().length
      : 0;
    const timeLabelEls = svg && typeof svg.selectAll === 'function'
      ? svg.selectAll('.axis-highlight-time, .axis-highlight-time-text, .axis-highlight-time-start, .axis-highlight-time-end').nodes().length
      : 0;
    return {
      ok: true,
      type: d.type,
      selected: !!d.selected,
      showPriceLabel: d.style.showPriceLabel !== false,
      showTimeLabel: d.style.showTimeLabel !== false,
      highlightGroupCount: highlightNodes,
      priceAxisLabelCount: priceLabelEls,
      timeAxisLabelCount: timeLabelEls,
      highlightsVisible: highlightNodes > 0 && (priceLabelEls > 0 || timeLabelEls > 0),
    };
  }, drawId);
  const parent = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
      .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
    if (!panel) return { panelOpen: false };
    const text = panel.innerText || '';
    return {
      panelOpen: true,
      hasLabelsRow: /\bLabels\b/i.test(text) && /\bPrice\b/i.test(text) && /\bTime\b/i.test(text),
      snippet: text.slice(0, 200),
    };
  });
  return { ...engine, ...parent };
}

export async function readAvVpCoordTabFields(page) {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
      .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
    if (!panel) return { ok: false, reason: 'panel closed' };
    if (!/\bCoordinates\b/i.test(panel.innerText)) return { ok: false, reason: 'not on coordinates tab' };
    const inputs = panel.querySelectorAll('input.tlr-nospinner[type="number"]');
    const anchorPrice = inputs[0]?.value ?? '';
    const anchorBar = inputs[1]?.value ?? '';
    return { ok: true, anchorPrice, anchorBar, inputCount: inputs.length };
  });
}

export async function readAvVpAnchorGeometryProbe(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id) => {
    const ch = window.chart;
    const d = ch?.drawingManager?.drawings?.find((x) => String(x.id) === String(id));
    if (!d || !d.points?.[0]) return { ok: false, reason: 'no anchor point' };
    const p = d.points[0];
    const dec = typeof ch.priceDecimals === 'number' ? ch.priceDecimals : 5;
    return {
      ok: true,
      barIndex: Number(p.x),
      price: Number(p.y),
      priceFormatted: Number(p.y).toFixed(dec),
      type: d.type,
    };
  }, drawId);
}

export async function editAvCoordFieldViaSpinner(page, field, deltaSteps) {
  const rowLabel = field === 'anchorBar' ? 'Bar' : 'Price';
  const up = deltaSteps >= 0;
  const steps = Math.abs(deltaSteps);
  for (let i = 0; i < steps; i++) {
    const rect = await page.evaluate((lbl, wantUp) => {
      const panel = [...document.querySelectorAll('[data-sdrop="1"]')]
        .find((el) => /Anchored Volume Profile/i.test(el.innerText || ''));
      if (!panel) return null;
      const rows = [...panel.querySelectorAll('span')].filter((s) => (s.textContent || '').trim() === lbl);
      const rowSpan = rows[rows.length - 1];
      if (!rowSpan) return null;
      const gridRow = rowSpan.closest('div[style*="grid"]') || rowSpan.parentElement?.parentElement;
      if (!gridRow) return null;
      const inputWrap = gridRow.querySelector('input.tlr-nospinner');
      if (!inputWrap) return null;
      const spinCol = inputWrap.parentElement?.querySelector('div[style*="absolute"]');
      const buttons = spinCol ? [...spinCol.querySelectorAll('button')] : [];
      const btn = wantUp ? buttons[0] : buttons[1];
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, rowLabel, up);
    if (!rect) return { ok: false, reason: 'spinner not found', step: i };
    await page.mouse.move(rect.x, rect.y);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(40);
  }
  return { ok: true };
}

/** Pan host/iframe chart so anchored VP anchor bar sits inside the plot (CORE-B drag setup). */
export async function ensureDrawingAnchorInPlotView(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id) => {
    const ch = window.chart;
    const dm = ch?.drawingManager;
    const d = dm?.drawings?.find((x) => String(x.id) === String(id));
    if (!d?.points?.[0]) return { ok: false, reason: 'no drawing' };
    const barIdx = Number(d.points[0].x);
    const spacing = typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 7;
    const m = ch.margin || { l: 0, r: 0, t: 0, b: 0 };
    const plotW = (ch.w || 0) - m.l - m.r;
    if (plotW <= 0) return { ok: false, reason: 'no plot' };
    const lx = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(barIdx) : NaN;
    const plotLeft = m.l;
    const plotRight = m.l + plotW;
    const pad = Math.max(spacing * 4, 24);
    let changed = false;
    if (Number.isFinite(lx) && (lx < plotLeft + pad || lx > plotRight - pad)) {
      const targetLx = m.l + plotW * 0.55;
      ch.offsetX = (ch.offsetX || 0) + (targetLx - lx);
      changed = true;
      if (typeof ch.scheduleRender === 'function') ch.scheduleRender();
      if (typeof dm?.renderDrawings === 'function') dm.renderDrawings();
    }
    const lxAfter = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(barIdx) : NaN;
    return { ok: true, changed, lxBefore: lx, lxAfter, offsetX: ch.offsetX };
  }, drawId);
}

export async function resolveAnchoredVpAnchorHandlePagePoint(page, panelId, drawId) {
  await ensureDrawingAnchorInPlotView(page, panelId, drawId);
  await sleep(180);
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  const local = await frame.evaluate((id) => {
    const ch = window.chart;
    const dm = ch?.drawingManager;
    const d = dm?.drawings?.find((x) => String(x.id) === String(id));
    if (!d) return null;
    const handleNodeFromSel = (sel) => {
      const node = sel && typeof sel.node === 'function' ? sel.node() : null;
      if (!node) return null;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      if (r.right < 0 || r.bottom < 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, source: 'handle' };
    };
    if (d.group) {
      const handleQueries = d.type === 'anchored-volume-profile'
        ? [
          () => d.group.select?.('.resize-handle[data-point-index="0"]'),
          () => d.group.select?.('.resize-handle-hit[data-point-index="0"]'),
          () => d.group.select?.('.resize-handle'),
          () => d.group.select?.('.custom-handle'),
        ]
        : [
          () => d.group.select?.('.custom-handle'),
          () => d.group.select?.('.resize-handle'),
          () => d.group.select?.('circle'),
        ];
      for (const q of handleQueries) {
        const pt = handleNodeFromSel(q());
        if (pt) return pt;
      }
    }
    const p = d.points?.[0];
    if (!p) return null;
    const lx = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(Number(p.x)) : NaN;
    const ly = ch.yScale && typeof ch.yScale === 'function' ? ch.yScale(Number(p.y)) : NaN;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
    const m = ch.margin || { l: 0, r: 0, t: 0, b: 0 };
    const plotW = (ch.w || 0) - m.l - m.r;
    if (plotW > 0 && (lx < m.l || lx > m.l + plotW)) return null;
    const r = typeof ch._pointerLayoutRect === 'function'
      ? ch._pointerLayoutRect()
      : (ch.canvas?.parentElement?.getBoundingClientRect() || ch.canvas?.getBoundingClientRect() || { left: 0, top: 0 });
    const z = typeof ch._v9LayoutZoom === 'function' ? ch._v9LayoutZoom() : 1;
    return { x: lx * z + r.left, y: ly * z + r.top, source: 'geometry' };
  }, drawId);
  if (!local) {
    const hit = await drawingHitLocalPoint(page, panelId, drawId, { aim: 'center' });
    if (hit?.ok) {
      const pt = await localToPagePoint(page, panelId, hit.x, hit.y);
      return pt ? { ok: true, ...pt, source: 'hit' } : { ok: false, reason: 'no page point' };
    }
    return { ok: false, reason: 'no handle' };
  }
  const pagePt = await localToPagePoint(page, panelId, local.x, local.y);
  return pagePt ? { ok: true, ...pagePt, source: local.source } : { ok: false, reason: 'no page point' };
}

/**
 * I15 — drag anchored VP anchor handle via real MouseEvent dispatch inside panel iframe
 * (avoids cross-iframe Puppeteer coord skew on multichart panel B).
 */
export async function actuateAnchoredVpHandleDragInPanel(page, panelId, drawId, deltaClientX = -100, deltaClientY = 18) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  await ensureDrawingAnchorInPlotView(page, panelId, drawId);
  await sleep(150);
  return frame.evaluate((id, dx, dy) => {
    const ch = window.chart;
    const dm = ch?.drawingManager;
    const d = dm?.drawings?.find((x) => String(x.id) === String(id));
    if (!d?.points?.[0]) return { ok: false, reason: 'no drawing' };
    if (!d.selected && typeof dm.selectDrawing === 'function') {
      dm.selectDrawing(d, false);
    }
    if (typeof dm.renderDrawing === 'function') {
      dm.renderDrawing(d);
    }
    if (typeof dm._ensureDrawingsPlotClip === 'function') {
      dm._ensureDrawingsPlotClip();
    }
    const beforeX = Number(d.points[0].x);
    const beforeY = Number(d.points[0].y);
    let cx;
    let cy;
    const hit = d.group
      ? (d.group.select?.('.resize-handle-hit[data-point-index="0"]')?.node()
        || d.group.select?.('.resize-handle[data-point-index="0"]')?.node())
      : null;
    if (hit) {
      const r = hit.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      }
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      const barIdx = Math.round(Number(d.points[0].x));
      const lx = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(barIdx) : NaN;
      const ly = ch.yScale && typeof ch.yScale === 'function' ? ch.yScale(Number(d.points[0].y)) : NaN;
      const layoutRect = typeof ch._pointerLayoutRect === 'function'
        ? ch._pointerLayoutRect()
        : (ch.canvas?.getBoundingClientRect() || { left: 0, top: 0 });
      const z = typeof ch._v9LayoutZoom === 'function' ? ch._v9LayoutZoom() : 1;
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) {
        return { ok: false, reason: 'no handle geometry', beforeX, beforeY };
      }
      cx = lx * z + layoutRect.left;
      cy = ly * z + layoutRect.top;
    }
    const canvas = ch.canvas;
    if (!canvas) return { ok: false, reason: 'no canvas', beforeX, beforeY };

    const mk = (type, x, y, buttons = 0) => ({
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
    });

    const [mx, my] = typeof dm._eventCanvasLocalXY === 'function'
      ? dm._eventCanvasLocalXY({ clientX: cx, clientY: cy })
      : [NaN, NaN];
    const target = typeof dm._resolveVolumeProfileHandleDragTarget === 'function'
      ? dm._resolveVolumeProfileHandleDragTarget(d, mx, my)
      : null;
    const started = typeof dm._tryStartVolumeProfileHandleDragFromPointer === 'function'
      ? dm._tryStartVolumeProfileHandleDragFromPointer(d, mk('mousedown', cx, cy, 1), mx, my)
      : false;
    if (!started) {
      return {
        ok: false,
        reason: 'routing fix did not start drag',
        beforeX,
        beforeY,
        mx,
        my,
        target,
      };
    }
    for (let i = 1; i <= 12; i++) {
      const x = cx + (dx * i) / 12;
      const y = cy + (dy * i) / 12;
      if (typeof dm.handleDrag === 'function') {
        dm.handleDrag({ sourceEvent: mk('mousemove', x, y, 1) });
      }
    }
    if (typeof dm.endHandleDrag === 'function') {
      dm.endHandleDrag(d);
    }

    const afterX = Number(d.points[0].x);
    const afterY = Number(d.points[0].y);
    return {
      ok: true,
      beforeX,
      beforeY,
      afterX,
      afterY,
      moved: Math.abs(afterX - beforeX) >= 0.5 || Math.abs(afterY - beforeY) >= 1e-5,
      routingFixOn: typeof window.__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX === 'undefined'
        || window.__TALARIA_DISABLE_VP_HANDLE_CANVAS_ROUTING_FIX !== true,
    };
  }, drawId, deltaClientX, deltaClientY);
}

export async function dragPointerPath(page, x0, y0, x1, y1, { steps = 10 } = {}) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    await sleep(16);
  }
}

export async function reactPanelLoadFile(page, panelId, fileId) {
  return page.evaluate(async (pid, fid) => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.runCommand === 'function') {
      return grid.runCommand('loadFile', { fileId: String(fid) }, { panelId: pid });
    }
    return false;
  }, panelId, fileId);
}

/** Real MultichartGrid layout switch (same path as layout picker). */
export async function reactSwitchMultichartLayout(page, layoutId = '2v') {
  return page.evaluate((lid) => {
    if (typeof window.__talariaHarnessSetLayout === 'function') {
      const ok = window.__talariaHarnessSetLayout(lid);
      return { ok: !!ok, layoutId: lid };
    }
    return { ok: false, reason: '__talariaHarnessSetLayout missing' };
  }, layoutId);
}

export async function waitForMountViewportPanelReady(frame, timeoutMs = 15000) {
  if (!frame) return false;
  try {
    await frame.waitForFunction(
      () => {
        const ch = window.chart;
        if (!ch) return false;
        if (typeof ch._mcMountViewportCoalesceFixActive === 'function'
          && ch._mcMountViewportCoalesceFixActive()) {
          return !!(ch._mcMountViewportPanelReady || ch._mcMountViewportCoalesceDone);
        }
        return true;
      },
      { timeout: timeoutMs },
    );
    return true;
  } catch (_) {
    return false;
  }
}

/** Poll offsetX each rAF for mount/symbol-change jitter proof. */
export async function pollMountOffsetCommits(frame, durationMs = 2500) {
  if (!frame) return { ok: false, reason: 'no frame' };
  try {
    await frame.waitForFunction(
      () => window.chart && Array.isArray(window.chart.data),
      { timeout: 120000 },
    );
  } catch (_) {
    return { ok: false, reason: 'no chart' };
  }
  return frame.evaluate(async (dur) => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no chart' };
    const pm = ch.margin || { l: 60, r: 60 };
    const plotWFn = () => Math.max(1, (Number(ch.w) || 0) - pm.l - pm.r);
    const threshold = 0.5;
    let lastOx = Number(ch.offsetX);
    let offsetChangingCommits = 0;
    const samples = [];
    const start = performance.now();
    const end = start + dur;
    while (performance.now() < end) {
      const ox = Number(ch.offsetX);
      if (Math.abs(ox - lastOx) > threshold) {
        offsetChangingCommits += 1;
        samples.push({
          t: performance.now() - start,
          from: lastOx,
          to: ox,
          plotW: plotWFn(),
        });
        lastOx = ox;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    const traceLog = Array.isArray(ch._mcMountOffsetTraceLog)
      ? ch._mcMountOffsetTraceLog.slice()
      : [];
    return {
      ok: true,
      offsetChangingCommits,
      finalOx: Number(ch.offsetX),
      firstOx: samples.length ? samples[0].from : lastOx,
      deltaFirstFinal: samples.length
        ? Math.abs(Number(samples[samples.length - 1].to) - Number(samples[0].from))
        : 0,
      samples,
      traceLog,
      plotW: plotWFn(),
      panelReady: !!ch._mcMountViewportPanelReady,
      coalesceDone: !!ch._mcMountViewportCoalesceDone,
    };
  }, durationMs);
}

export async function readPanelVisibleRenderProbe(frame) {
  if (!frame) return { ok: false, reason: 'no frame' };
  try {
    return await frame.evaluate(() => {
      const ch = window.chart;
      if (!ch) return { ok: false, reason: 'no chart' };
      const pm = ch.margin || { l: 60, r: 60, t: 0, b: 24 };
      const plotW = Math.max(1, (Number(ch.w) || 0) - pm.l - pm.r);
      const dataLen = Array.isArray(ch.data) ? ch.data.length : 0;
      const visibleBars = typeof ch._countVisiblePlotBars === 'function'
        ? ch._countVisiblePlotBars()
        : 0;
      const timeTicks = typeof ch._buildTimeTicks === 'function'
        ? ch._buildTimeTicks({ full: true })
        : (ch._timeTicks || []);
      const yTicks = typeof ch._getYPriceTicks === 'function'
        ? ch._getYPriceTicks(8)
        : [];
      const symbolEl = document.getElementById('chartSymbol');
      const symbolText = symbolEl ? String(symbolEl.textContent || '').trim() : '';
      let iframeOpacity = '1';
      try {
        iframeOpacity = window.frameElement ? String(window.frameElement.style.opacity || '1') : '1';
      } catch (_) { /* ignore */ }
      const timeTickCount = Array.isArray(timeTicks) ? timeTicks.length : 0;
      const yTickCount = Array.isArray(yTicks) ? yTicks.length : 0;
      const opacityVisible = iframeOpacity === '' || iframeOpacity === '1';
      const rendered = dataLen > 0
        && visibleBars > 0
        && timeTickCount > 0
        && yTickCount > 0
        && plotW >= 40
        && opacityVisible;
      return {
        ok: true,
        rendered,
        dataLen,
        visibleBars,
        plotW,
        timeTickCount,
        yTickCount,
        symbolText,
        currentSymbol: ch.currentSymbol || '',
        currentFileId: ch.currentFileId != null ? String(ch.currentFileId) : '',
        iframeOpacity,
        panelReady: !!ch._mcMountViewportPanelReady,
        coalesceDone: !!ch._mcMountViewportCoalesceDone,
        pairLoading: !!ch._pairSwitchLoading,
      };
    });
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

export async function readReactPanelFileIds(page) {
  const host = await page.evaluate(() => {
    const ch = window.chart;
    return ch && ch.currentFileId != null ? String(ch.currentFileId) : null;
  });
  const frameB = panelFrameMap(page).B;
  const b = frameB
    ? await frameB.evaluate(() => {
      const ch = window.chart;
      return ch && ch.currentFileId != null ? String(ch.currentFileId) : null;
    })
    : null;
  return { A: host, B: b };
}

export async function readAxisMarginCrushProbe(page, panelId = 'B') {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch || !ch.margin || !ch.yScale) return { ok: false, reason: 'missing chart/yScale' };
    const m = ch.margin;
    const axisLeft = !!ch.priceAxisLeft;
    const axisW = axisLeft ? Number(m.l) : Number(m.r);
    const chPlot = Number(ch.h) - Number(m.t) - Number(m.b);
    const priceSideKey = axisLeft ? 'l' : 'r';
    const priceMin = 60;
    const timeMin = 24;
    const numYTicks = Math.max(8, Math.min(15, Math.floor(chPlot / 60)));
    let labelCount = 0;
    const yTicks = typeof ch._getYPriceTicks === 'function' ? ch._getYPriceTicks(numYTicks) : [];
    const pricePlotBottom = chPlot > 0 ? (ch.h - m.b) : 0;
    yTicks.forEach((price) => {
      const y = ch.yScale(price);
      if (y > m.t + 8 && y < pricePlotBottom - 8) labelCount += 1;
    });
    const timeTicks = (typeof ch._buildTimeTicks === 'function')
      ? ch._buildTimeTicks({ full: true })
      : (ch._timeTicks || []);
    const crush =
      axisW < 48 ||
      chPlot <= 0 ||
      labelCount === 0 ||
      (Array.isArray(timeTicks) && timeTicks.length === 0);
    return {
      ok: !crush,
      crush,
      marginR: Number(m.r),
      marginL: Number(m.l),
      marginB: Number(m.b),
      axisW,
      chPlot,
      labelCount,
      timeTickCount: Array.isArray(timeTicks) ? timeTicks.length : 0,
      priceSideKey,
      floorOk: Number(m[priceSideKey]) >= priceMin && Number(m.b) >= timeMin,
    };
  });
}

export async function waitForVpDrawingSettle(page, panelId, drawId, budgetMs = 3000) {
  const frame = chartTarget(page, panelId);
  if (!frame) return false;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const settled = await frame.evaluate((id) => {
      const ch = window.chart;
      const dm = ch && ch.drawingManager;
      const d = dm && dm.drawings && dm.drawings.find((x) => x && String(x.id) === String(id));
      const rendered = ch && ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
      return !!(d && d.type === 'anchored-volume-profile' && rendered > 0);
    }, drawId);
    if (settled) return true;
    await sleep(150);
  }
  return false;
}

/**
 * Boot one cold React multichart page (2v layout) for a scenario.
 */
export async function bootReactMultichart(browser, stack, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await installBuiltProductBoot(page, {
    switchOffGearFix: !!opts.switchOffGearFix,
    switchOffPeerDeselect: !!opts.switchOffPeerDeselect,
    panelKeyboardOff: !!opts.panelKeyboardOff,
    migrationOn: !!opts.migrationOn,
    phase1Off: !!opts.phase1Off,
    phase5Off: !!opts.phase5Off,
    iframeCtrlDedupeOff: !!opts.iframeCtrlDedupeOff,
    lifecycleOff: !!opts.lifecycleOff,
    legacySelectionOff: !!opts.legacySelectionOff,
    drawingLocalInvalidationOff: !!opts.drawingLocalInvalidationOff,
    chromeRoutingOff: !!opts.chromeRoutingOff,
    chromeDomReadyOff: !!opts.chromeDomReadyOff,
    panelBSettingsTransportOff: !!opts.panelBSettingsTransportOff,
    panelBSettingsTransportAOff: !!opts.panelBSettingsTransportAOff,
    orderMcStateConvergeOff: !!opts.orderMcStateConvergeOff,
    v9QuickbarLiveResolveOff: !!opts.v9QuickbarLiveResolveOff,
    vpV9AvLabelBridgeOff: !!opts.vpV9AvLabelBridgeOff,
    vpV9AvCoordRepositionOff: !!opts.vpV9AvCoordRepositionOff,
    axisMarginFloorOff: !!opts.axisMarginFloorOff,
    vpHandleCanvasRoutingOff: !!opts.vpHandleCanvasRoutingOff,
    armedDrawFocusForwardOff: !!opts.armedDrawFocusForwardOff,
    ctrlMarqueeOff: !!opts.ctrlMarqueeOff,
    otMsHighlightOff: !!opts.otMsHighlightOff,
    bugSwitches: opts.bugSwitches || null,
  });
  await installParentSettingsProbe(page);
  const bootUrl = opts.mcLayout
    ? reactParityUrlWithLayout(stack.url, opts.mcLayout)
    : stack.url;
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const singleBoot = opts.mcLayout === '1' || opts.mcLayout === 1;
  if (singleBoot) {
    await page.waitForFunction(
      () => window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0,
      { timeout: 120000 },
    );
    await dismissClickBlockers(page, 'A');
    const buildIds = await assertBuildIds(page);
    return {
      page,
      stack,
      buildIds,
      boundary: { ok: true, panelId: 'B', skipped: 'single-boot' },
      iframeBars: 0,
      close: () => page.close().catch(() => {}),
    };
  }
  await waitForReactMultichartReady(page);
  await clearPanelDrawings(page, 'A');
  await clearPanelDrawings(page, 'B');
  const buildIds = await assertBuildIds(page);
  const frameB = panelFrameMap(page).B;
  const boundary = await assertIframeBoundary(frameB, 'B');
  const iframeBars = frameB
    ? await frameB.evaluate(() => (window.chart && window.chart.data ? window.chart.data.length : 0))
    : 0;

  return {
    page,
    stack,
    buildIds,
    boundary,
    iframeBars,
    close: () => page.close().catch(() => {}),
  };
}

export async function runWithReact(ctx, body) {
  const boot = await bootReactMultichart(ctx.browser, ctx.stack, ctx);
  const notes = [];
  let checks;
  let d032Tripwire = null;
  try {
    checks = await body(boot, notes);
    const fails = (checks || makeChecks()).failures();
    if (fails.length && ctx.scenarioId && D032_TRIPWIRE_SCENARIO_IDS.includes(ctx.scenarioId)) {
      d032Tripwire = await captureAndLogD032Tripwire({
        scenarioId: ctx.scenarioId,
        buildId: ctx.stack?.buildId || boot.stack?.buildId,
        page: boot.page,
        panelId: 'B',
        checkFails: fails.map((c) => c.label),
        runIndex: ctx.runIndex ?? null,
      });
    }
  } finally {
    await boot.close();
  }
  return { checks: checks || makeChecks(), inv: makeChecks(), notes, d032Tripwire };
}
