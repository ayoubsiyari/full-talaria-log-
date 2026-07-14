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
    buildId: REACT_BUILD_ID,
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

/** Seed harness backtest session + optional I13 switch before chart boots. */
export async function installBuiltProductBoot(page, { switchOffGearFix = false } = {}) {
  const off = switchOffGearFix || process.env.REACT_PARITY_GEAR_FIX_OFF === '1';
  await page.evaluateOnNewDocument((sess, switchOff) => {
    if (switchOff) window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true;
    try {
      localStorage.setItem('_uid', '1');
      const sid = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('u1_backtestingSession', JSON.stringify({ ...sess, session_id: sid }));
    } catch (_) { /* ignore */ }
  }, HARNESS_BACKTEST_SESSION, off);
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

  return { hostReady, bReady: true };
}

/** L1 — build id must match on host and every iframe panel. */
export async function assertBuildIds(page, expectedId = REACT_BUILD_ID) {
  const hostId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
  const frames = {};
  for (const [pid, frame] of Object.entries(panelFrameMap(page))) {
    frames[pid] = await frame.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
  }
  const hostOk = String(hostId) === String(expectedId);
  const frameOk = Object.values(frames).every((id) => String(id) === String(expectedId));
  return {
    ok: hostOk && frameOk,
    expectedId,
    hostId,
    frames,
  };
}

export async function focusReactPanel(page, panelId) {
  await page.evaluate((pid) => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.focusPanelById === 'function') grid.focusPanelById(pid);
  }, panelId);
  const pt = await reactChartCanvasPagePoint(page, panelId, 0.45, 0.5);
  if (pt) await page.mouse.click(pt.x, pt.y, { delay: 25 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, panelId };
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

export async function readParentReactSettings(page) {
  return page.evaluate(() => {
    const root = document.getElementById('multichart-global-settings-root');
    const modal = document.querySelector('.tv-settings-modal');
    const open = !!(
      window.__harnessParentSettingsOpen
      || (root && root.childElementCount > 0)
      || (modal && modal.offsetParent !== null)
    );
    const text = String((root && root.innerText) || (modal && modal.innerText) || '').trim();
    return {
      open,
      textSnippet: text.slice(0, 240),
      hasStyleSection: /\bstyle\b/i.test(text),
    };
  });
}

export async function readSelectionChrome(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };
  return frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(id));
    if (!d) return { ok: false, reason: 'drawing not found' };
    const node = d.group && d.group.node && d.group.node();
    const handles = node
      ? node.querySelectorAll('.resize-handle, .resize-handle-group circle, .custom-handle').length
      : 0;
    const axisHl = document.querySelectorAll('[class*="axis-highlight"]').length;
    const inSel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    const hasBlueBorder = handles > 0 || axisHl > 0;
    return {
      ok: true,
      selected: !!d.selected || inSel || hasBlueBorder,
      handleCount: handles,
      axisHighlightCount: axisHl,
      hasBlueBorder,
    };
  }, drawId);
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
  return page.evaluate(() => {
    const gear = document.querySelector('[data-v9-tl-btn="tl-sett"], #tl-sett');
    if (!gear) return { ok: false, reason: 'no #tl-sett' };
    const rect = gear.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, reason: 'v9 gear not visible', rect: { w: rect.width, h: rect.height } };
    }
    gear.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return { ok: true };
  });
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
  const frame = chartTarget(page, panelId);
  const hit = await frame.evaluate((id) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => x && String(x.id) === String(id));
    if (!d || !d.group) return { ok: false, reason: 'no group' };
    const node = d.group.node();
    if (!node || !node.getBBox) return { ok: false, reason: 'no bbox' };
    const bb = node.getBBox();
    const svg = dm.svg && dm.svg.node();
    if (!svg) return { ok: false, reason: 'no svg' };
    const sr = svg.getBoundingClientRect();
    // Aim at line body (upper-left of bbox), not center — avoids handle clusters / overlap.
    return {
      ok: true,
      x: Math.round(sr.left + bb.x + Math.max(4, bb.width * 0.22)),
      y: Math.round(sr.top + bb.y + Math.max(4, bb.height * 0.35)),
    };
  }, drawId);
  if (!hit || !hit.ok) return hit;
  const pagePt = panelId === 'A'
    ? hit
    : await (async () => {
      const fr = await reactFrameRectForPanel(page, panelId);
      if (!fr) return null;
      return { x: Math.round(fr.left + hit.x), y: Math.round(fr.top + hit.y) };
    })();
  if (!pagePt) return { ok: false, reason: 'no page point' };
  await page.mouse.click(pagePt.x, pagePt.y, { clickCount: 1, delay: 30 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, clicked: pagePt };
}

export async function doubleClickDrawing(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  const hit = await frame.evaluate((id) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(id));
    if (!d || !d.group) return { ok: false, reason: 'no group' };
    const node = d.group.node();
    if (!node || !node.getBBox) return { ok: false, reason: 'no bbox' };
    const bb = node.getBBox();
    const svg = dm.svg && dm.svg.node();
    if (!svg) return { ok: false, reason: 'no svg' };
    const sr = svg.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(sr.left + bb.x + bb.width / 2),
      y: Math.round(sr.top + bb.y + bb.height / 2),
    };
  }, drawId);
  if (!hit || !hit.ok) return hit;
  const pagePt = panelId === 'A'
    ? hit
    : await (async () => {
      const fr = await reactFrameRectForPanel(page, panelId);
      if (!fr) return null;
      return { x: Math.round(fr.left + hit.x), y: Math.round(fr.top + hit.y) };
    })();
  if (!pagePt) return { ok: false, reason: 'no page point' };
  await page.mouse.click(pagePt.x, pagePt.y, { clickCount: 2, delay: 40 });
  await waitForPanelSettle(page, panelId);
  return { ok: true, clicked: pagePt };
}

export async function ctrlClickDrawing(page, panelId, drawId) {
  await page.keyboard.down('Control');
  try {
    return await singleClickDrawing(page, panelId, drawId);
  } finally {
    await page.keyboard.up('Control');
  }
}

/** Ctrl+drag marquee inside an iframe panel (page.keyboard ctrlKey does not cross the boundary). */
async function ctrlDragMarqueeInIframe(page, panelId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };
  const result = await frame.evaluate(() => {
    const ch = window.chart;
    const canvas = ch && ch.canvas;
    if (!canvas) return { ok: false, reason: 'no canvas' };
    const dm = ch.drawingManager;
    const cRect = canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const absorb = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };
    (dm && dm.drawings ? dm.drawings : []).forEach((d) => {
      const node = d && d.group && d.group.node ? d.group.node() : null;
      if (!node) return;
      node.querySelectorAll('line').forEach((line) => {
        absorb(parseFloat(line.getAttribute('x1')), parseFloat(line.getAttribute('y1')));
        absorb(parseFloat(line.getAttribute('x2')), parseFloat(line.getAttribute('y2')));
      });
    });
    const pad = 16;
    let lx1;
    let ly1;
    let lx2;
    let ly2;
    if (Number.isFinite(minX) && Number.isFinite(maxX)) {
      lx1 = minX - pad;
      ly1 = minY - pad;
      lx2 = maxX + pad;
      ly2 = maxY + pad;
    } else {
      lx1 = cRect.width * 0.12;
      ly1 = cRect.height * 0.18;
      lx2 = cRect.width * 0.78;
      ly2 = cRect.height * 0.82;
    }
    const x1 = cRect.left + lx1;
    const y1 = cRect.top + ly1;
    const x2 = cRect.left + lx2;
    const y2 = cRect.top + ly2;
    const mk = (type, x, y, buttons) => new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: buttons ?? (type === 'mouseup' ? 0 : 1),
      ctrlKey: true,
    });
    canvas.dispatchEvent(mk('mousedown', x1, y1, 1));
    let during = { active: false, w: 0, h: 0 };
    for (let step = 1; step <= 12; step += 1) {
      const fx = x1 + ((x2 - x1) * step) / 12;
      const fy = y1 + ((y2 - y1) * step) / 12;
      document.dispatchEvent(mk('mousemove', fx, fy, 1));
      const m = ch.ctrlMarqueeSelect;
      const w = Math.abs(Number(m.endX || 0) - Number(m.startX || 0));
      const h = Math.abs(Number(m.endY || 0) - Number(m.startY || 0));
      const snap = { active: !!m.active, w, h };
      if (snap.active && snap.w > during.w) during = { ...snap };
      else if (snap.active && snap.w === during.w && snap.h > during.h) during = { ...snap };
      else if (!during.active && (snap.w > during.w || snap.h > during.h)) during = snap;
    }
    document.dispatchEvent(mk('mouseup', x2, y2, 0));
    return { ok: true, during, p1: { x: Math.round(x1), y: Math.round(y1) }, p2: { x: Math.round(x2), y: Math.round(y2) } };
  });
  await waitForPanelSettle(page, panelId);
  return result;
}

export async function ctrlDragMarquee(page, panelId) {
  await focusReactPanel(page, panelId);
  if (panelId !== 'A') {
    return ctrlDragMarqueeInIframe(page, panelId);
  }
  await page.keyboard.down('Control');
  try {
    const p1 = await reactChartCanvasPagePoint(page, panelId, 0.12, 0.18);
    const p2 = await reactChartCanvasPagePoint(page, panelId, 0.78, 0.82);
    if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    let during = { active: false, w: 0, h: 0 };
    for (let step = 1; step <= 12; step += 1) {
      const fx = p1.x + ((p2.x - p1.x) * step) / 12;
      const fy = p1.y + ((p2.y - p1.y) * step) / 12;
      await page.mouse.move(Math.round(fx), Math.round(fy), { steps: 1 });
      const snap = await readCtrlMarqueeState(page, panelId);
      if (snap && snap.active && snap.w > 8 && snap.h > 8) {
        during = snap;
        break;
      }
      if (snap && (snap.w > during.w || snap.h > during.h)) during = snap;
    }
    await page.mouse.up();
    await waitForPanelSettle(page, panelId);
    return { ok: true, during, p1, p2 };
  } finally {
    await page.keyboard.up('Control');
  }
}

export async function pressEscapeReact(page, panelId) {
  const frame = chartTarget(page, panelId);
  await page.keyboard.press('Escape');
  await frame.evaluate(() => {
    const ev = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  }).catch(() => {});
  await waitForPanelSettle(page, panelId);
  return { ok: true };
}

export async function deleteSelectedViaKeyboard(page, panelId) {
  await focusReactPanel(page, panelId);
  await page.keyboard.press('Delete');
  await waitForPanelSettle(page, panelId);
  return { ok: true };
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
  const v9 = await readV9QuickBarState(page);
  const toolbarVisible = !!(v9 && v9.v9Visible) || !!(local && local.toolbarVisible);
  return {
    ...local,
    toolbarVisible,
    v9QuickBarVisible: !!(v9 && v9.v9Visible),
    parentLegacyVisible: !!(v9 && v9.legacyVisible),
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
  const chrome = await readSelectionChrome(page, panelId, drawId);
  if (chrome && chrome.ok && chrome.selected) return true;
  const st = await readReactParityState(page, panelId);
  return (st?.selectedIds || []).map(String).includes(String(drawId));
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

/** V9 multichart: dm.selectedDrawings may lag; chrome handles + parent V9 bar are authoritative. */
export async function assertReactMenuState(checks, label, expected, actual, page, panelId) {
  const merged = {
    ...actual,
    toolbarVisible: !!(actual?.v9QuickBarVisible || actual?.toolbarVisible),
  };
  const parts = [];
  let ok = true;
  if (expected.selectedIds != null) {
    for (const id of expected.selectedIds) {
      if (!(await isDrawingSelected(page, panelId, id))) ok = false;
    }
    parts.push(`selectedIds=${JSON.stringify(actual?.selectedIds)} chromeOk=${ok}`);
  }
  if (expected.toolbarVisible != null && !!merged.toolbarVisible !== !!expected.toolbarVisible) {
    ok = false;
    parts.push(`toolbarVisible=${merged.toolbarVisible} expected=${expected.toolbarVisible}`);
  }
  if (expected.selectedIds == null && expected.toolbarVisible == null) {
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
    const n = ch.data.length;
    const skew = pid === 'B' ? 40 : 0;
    const i0 = Math.max(0, n - 105 - skew - offset);
    const i1 = Math.max(0, n - 58 - skew - offset);
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
    const n = ch.data.length;
    const skew = pid === 'B' ? 40 : 0;
    const i0 = Math.max(0, n - 92 - skew - offset);
    const i1 = Math.max(0, n - 62 - skew - offset);
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

/**
 * Boot one cold React multichart page (2v layout) for a scenario.
 */
export async function bootReactMultichart(browser, stack, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await installBuiltProductBoot(page, { switchOffGearFix: !!opts.switchOffGearFix });
  await installParentSettingsProbe(page);
  await page.goto(stack.url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await waitForReactMultichartReady(page);
  await clearPanelDrawings(page, 'A');
  await clearPanelDrawings(page, 'B');
  const buildIds = await assertBuildIds(page, REACT_BUILD_ID);
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
  try {
    checks = await body(boot, notes);
  } finally {
    await boot.close();
  }
  return { checks: checks || makeChecks(), inv: makeChecks(), notes };
}
