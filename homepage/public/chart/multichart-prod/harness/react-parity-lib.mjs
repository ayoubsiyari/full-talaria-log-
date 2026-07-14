/**
 * react-parity-lib.mjs — T0 step 8 boot + helpers for the production React
 * MultichartGrid surface (dev:live ?devMultichart=2v). Drives the real
 * MultichartGrid.jsx mount, not multichart-manager.js.
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
  defaultTrendlinePoints,
  defaultRectanglePoints,
} from './interactive-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = __dirname;
const DESIGN_DIR = path.resolve(__dirname, '../../../talaria-design');
const CHART_ROOT = path.resolve(__dirname, '../..');

export const REACT_BUILD_ID = '20260712b8';
export const DEFAULT_HARNESS_PORT = Number(process.env.PORT || 8791);
export const DEFAULT_VITE_PORT = Number(process.env.REACT_PARITY_VITE_PORT || 5174);

export { makeChecks, launchBrowser, panelFrameMap, sleep };

export function reactParityUrl(port = DEFAULT_VITE_PORT) {
  const base = process.env.REACT_PARITY_URL
    || `http://127.0.0.1:${port}/pricing/?devMultichart=2v&mode=backtest`;
  return base;
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
 * Ensure harness stub API + Vite dev:live are reachable.
 * Spawns missing services; returns handles for optional teardown.
 */
export async function ensureReactStack({
  harnessPort = DEFAULT_HARNESS_PORT,
  vitePort = DEFAULT_VITE_PORT,
} = {}) {
  const children = [];
  const harnessUrl = `http://127.0.0.1:${harnessPort}/api/auth/me`;
  const viteUrl = `http://127.0.0.1:${vitePort}/`;

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

  if (!(await probeUrl(viteUrl))) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    children.push(spawnDetached(npmCmd, [
      'run', 'dev:live', '--', '--host', '127.0.0.1', '--port', String(vitePort),
    ], {
      cwd: DESIGN_DIR,
      env: {
        USE_LOCAL_CHART: '1',
        CHART_BACKEND: `http://127.0.0.1:${harnessPort}`,
      },
    }));
    if (!(await waitForUrl(viteUrl))) {
      throw new Error(`react-parity: dev:live did not start on :${vitePort}`);
    }
  }

  return {
    harnessPort,
    vitePort,
    url: reactParityUrl(vitePort),
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
  return !!(c && Array.isArray(c.data) && c.data.length > 0 && c._mcDiag && c._mcDiag.renders > 0);
};

export async function waitForReactMultichartReady(page, timeoutMs = 120000) {
  await page.waitForFunction(
    () => !!(window.__multichartGrid),
    { timeout: timeoutMs },
  );
  await waitForPanelFrame(page, 'B', timeoutMs);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hostPainted = await page.evaluate(PAINTED_FN).catch(() => false);
    const frameB = panelFrameMap(page).B;
    const bPainted = frameB ? await frameB.evaluate(PAINTED_FN).catch(() => false) : false;
    if (hostPainted && bPainted) return { hostPainted, bPainted };
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('react-parity: host/panel B did not paint before timeout');
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
    let last = -1;
    const tick = () => {
      const cur = window.chart && window.chart._mcDiag ? Number(window.chart._mcDiag.renders) || 0 : 0;
      if (cur > 0 && cur === last) {
        resolve(true);
        return;
      }
      last = cur;
      if (performance.now() - start > timeout) {
        resolve(cur > 0);
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
    return {
      ok: true,
      selected: !!d.selected,
      handleCount: handles,
      axisHighlightCount: axisHl,
      hasBlueBorder: handles > 0 || axisHl > 0,
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

export async function waitForIframeGearReady(frame, drawingId, timeoutMs = 4000) {
  return frame.evaluate((drawId, timeout) => new Promise((resolve) => {
    const finish = (ok, detail) => resolve({ ok, detail });
    try {
      const cur = window.__talariaIframeToolbarGearReady;
      if (cur && drawId != null && String(cur.drawingId) === String(drawId)) {
        return finish(true, { signal: 'cached', ...cur });
      }
    } catch (_) { /* ignore */ }
    const timer = setTimeout(() => finish(false, { reason: 'timeout', signal: 'talaria:iframe-toolbar-gear-ready' }), timeout);
    const onReady = (ev) => {
      const d = ev && ev.detail;
      if (!d || drawId == null || String(d.drawingId) !== String(drawId)) return;
      clearTimeout(timer);
      window.removeEventListener('talaria:iframe-toolbar-gear-ready', onReady);
      finish(true, { signal: 'talaria:iframe-toolbar-gear-ready', ...d });
    };
    window.addEventListener('talaria:iframe-toolbar-gear-ready', onReady);
  }), drawingId, timeoutMs);
}

export async function clickIframeGear(frame) {
  return frame.evaluate(() => {
    const gear = document.getElementById('tb-settings');
    if (!gear) return { ok: false, reason: 'no #tb-settings' };
    const rect = gear.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, reason: 'gear not visible', rect: { w: rect.width, h: rect.height } };
    }
    gear.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return { ok: true };
  });
}

/** Place + deselect a drawing on a panel; returns { id, panelId }. */
export async function seedDrawing(page, panelId, toolType = 'trendline') {
  await focusReactPanel(page, panelId);
  const pts = toolType === 'rectangle'
    ? await defaultRectanglePoints(page, panelId)
    : await defaultTrendlinePoints(page, panelId);
  const placed = await placeTool(page, panelId, toolType, pts);
  const frame = chartTarget(page, panelId);
  await frame.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (d && typeof dm.deselectDrawing === 'function') dm.deselectDrawing(d);
    else if (typeof dm.deselectAll === 'function') dm.deselectAll();
    if (dm.clearTool) dm.clearTool(true);
  }, placed.id);
  await waitForPanelSettle(page, panelId);
  return { ...placed, panelId };
}

export async function singleClickDrawing(page, panelId, drawId) {
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

export async function ctrlDragMarquee(page, panelId) {
  await page.keyboard.down('Control');
  try {
    const p1 = await reactChartCanvasPagePoint(page, panelId, 0.18, 0.22);
    const p2 = await reactChartCanvasPagePoint(page, panelId, 0.72, 0.78);
    if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 10 });
    const during = await readCtrlMarqueeState(page, panelId);
    await page.mouse.up();
    await waitForPanelSettle(page, panelId);
    return { ok: true, during, p1, p2 };
  } finally {
    await page.keyboard.up('Control');
  }
}

export async function pressEscapeReact(page, panelId) {
  const frame = chartTarget(page, panelId);
  await frame.evaluate(() => {
    const ev = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  });
  await waitForPanelSettle(page, panelId);
  return { ok: true };
}

/**
 * Boot one cold React multichart page (2v layout) for a scenario.
 */
export async function bootReactMultichart(browser, stack, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  if (opts.switchOffGearFix) {
    await page.evaluateOnNewDocument(() => {
      window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2 = true;
    });
  }

  await installParentSettingsProbe(page);
  await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
  await waitForReactMultichartReady(page);
  const buildIds = await assertBuildIds(page, REACT_BUILD_ID);

  return {
    page,
    stack,
    buildIds,
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
