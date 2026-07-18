/**
 * interactive-helpers.mjs — T0 Lane 4 page-object helpers for drawing-tool
 * interactive flows on the multichart harness host (tile A).
 *
 * Used by H-S32 (first-click-fails), H-S33 (ghost-after-delete), and the
 * T0 step-7 RC-4 multichart interaction-parity family (H-S45+). Operates on
 * the real engine via page.evaluate / puppeteer mouse events — no forked harness.
 */

import { panelFrameMap, sleep } from './harness-lib.mjs';

export function chartTarget(page, panelId = 'A') {
  return panelId === 'A' ? page : panelFrameMap(page)[panelId];
}

/** Snapshot drawing-manager + UI state for assertions. */
export async function readInteractiveState(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!dm) return { ok: false, reason: 'no drawingManager' };
    const sel = dm.selectedDrawings || [];
    const toolbar = dm.toolbar || null;
    const settings = dm.settingsPanel || null;
    const panelEl = settings && settings.panel;
    const tvModal = document.querySelector('.tv-settings-modal');
    const settingsPanelEl = document.querySelector('.settings-panel');
    const axisHighlights = document.querySelectorAll('[class*="axis-highlight"]').length
      + (ch.svg ? ch.svg.selectAll('[class*="axis-highlight"]').size() : 0);
    const labelGroups = dm.labelsGroup ? dm.labelsGroup.selectAll('*').size() : 0;
    return {
      ok: true,
      drawingCount: (dm.drawings || []).length,
      selectedIds: sel.map((d) => d && d.id).filter(Boolean),
      selectedTypes: sel.map((d) => d && d.type).filter(Boolean),
      toolbarVisible: !!(toolbar && toolbar.visible),
      toolbarDrawingId: toolbar && toolbar.currentDrawing ? toolbar.currentDrawing.id : null,
      settingsOpen: !!(
        (panelEl && panelEl.parentNode)
        || (tvModal && tvModal.offsetParent !== null)
        || (settingsPanelEl && settingsPanelEl.classList.contains('open'))
      ),
      settingsDrawingId: settings && settings.currentDrawing ? settings.currentDrawing.id : null,
      axisHighlightCount: axisHighlights,
      labelNodeCount: labelGroups,
      renders: ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0,
      currentTool: dm.currentTool || null,
      isDrawing: !!(dm.drawingState && dm.drawingState.isDrawing),
    };
  }).catch(() => null);
}

export async function installParentSettingsProbe(page) {
  return page.evaluate(() => {
    window.__harnessDrawingSettingsMessages = [];
    window.__harnessParentSettingsOpen = false;
    window.__harnessParentSettingsClosed = false;
    window.__harnessD032StyleSeen = false;
    window.__harnessD032ModalTeardown = false;
    if (window.__harnessDrawingSettingsProbeInstalled) return true;
    window.__harnessDrawingSettingsProbeInstalled = true;
    const scanStyleModal = () => {
      try {
        const modal = document.querySelector('.tv-settings-modal');
        const root = document.getElementById('multichart-global-settings-root');
        const text = String((modal && modal.innerText) || (root && root.innerText) || '');
        if (modal && modal.offsetParent !== null && /\bstyle\b/i.test(text)) {
          window.__harnessD032StyleSeen = true;
        }
      } catch (_) { /* ignore */ }
    };
    window.addEventListener('message', (ev) => {
      const msg = ev && ev.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'multichart-open-drawing-settings') {
        window.__harnessParentSettingsOpen = true;
        window.__harnessParentSettingsClosed = false;
        scanStyleModal();
        window.__harnessDrawingSettingsMessages.push({
          type: msg.type,
          source: msg.source || null,
          drawingId: msg.drawingId != null ? String(msg.drawingId) : null,
        });
      }
      if (msg.type === 'multichart-close-drawing-settings') {
        if (window.__harnessD032StyleSeen) window.__harnessD032ModalTeardown = true;
        window.__harnessParentSettingsOpen = false;
        window.__harnessParentSettingsClosed = true;
        window.__harnessDrawingSettingsMessages.push({
          type: msg.type,
          source: msg.source || null,
          drawingId: msg.drawingId != null ? String(msg.drawingId) : null,
        });
      }
      if (msg.type === 'multichart-drawing-deselected') {
        window.__harnessDrawingSettingsMessages.push({
          type: msg.type,
          source: msg.source || null,
          drawingId: msg.drawingId != null ? String(msg.drawingId) : null,
        });
      }
      if (msg.type === 'multichart-drawing-selected') {
        window.__harnessDrawingSettingsMessages.push({
          type: msg.type,
          source: msg.source || null,
          drawingId: msg.drawingId != null ? String(msg.drawingId) : null,
        });
      }
    }, true);
    try {
      const root = document.getElementById('multichart-global-settings-root') || document.body;
      const obs = new MutationObserver(() => { scanStyleModal(); });
      obs.observe(root, { childList: true, subtree: true, characterData: true });
      window.__harnessD032StyleObserver = obs;
    } catch (_) { /* ignore */ }
    return true;
  });
}

export async function readParentSettingsProbe(page) {
  return page.evaluate(() => ({
    open: !!window.__harnessParentSettingsOpen,
    closed: !!window.__harnessParentSettingsClosed,
    messages: Array.isArray(window.__harnessDrawingSettingsMessages)
      ? window.__harnessDrawingSettingsMessages.slice()
      : [],
  }));
}

/**
 * Programmatically place a completed drawing (host panel). Returns stable ref.
 * points: [{x: barIndex, y: price}, ...] in chart data space.
 */
export async function placeTool(page, panelId, toolType, points) {
  const frame = chartTarget(page, panelId);
  if (!frame) throw new Error(`placeTool: no frame for panel ${panelId}`);
  return frame.evaluate((type, pts) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (!dm || !dm.toolRegistry[type]) throw new Error(`unknown tool ${type}`);
    const info = dm.toolRegistry[type];
    if (!Array.isArray(pts) || pts.length < info.points) {
      throw new Error(`need ${info.points} points for ${type}`);
    }
    const drawing = new info.class(pts.map((p) => ({ x: Number(p.x), y: Number(p.y) })), {});
    drawing.type = type;
    dm.clearTool(true);
    dm.addDrawing(drawing);
    if (ch.scheduleRender) ch.scheduleRender();
    return { id: drawing.id, type: drawing.type };
  }, toolType, points);
}

/** Resolve drawing ref (id string or {id}) to live object metadata. */
async function resolveDrawing(page, panelId, ref) {
  const id = typeof ref === 'string' ? ref : ref && ref.id;
  const frame = chartTarget(page, panelId);
  return frame.evaluate((drawId) => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return null;
    const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (!d) return null;
    return { id: d.id, type: d.type, selected: !!d.selected };
  }, id);
}

/** Click the stroke midpoint (real mouse) or call selectDrawing when click=false. */
export async function selectTool(page, panelId, ref, { click = true } = {}) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const frame = chartTarget(page, panelId);
  if (!click) {
    return frame.evaluate((drawId) => {
      const dm = window.chart.drawingManager;
      const d = dm.drawings.find((x) => String(x.id) === String(drawId));
      if (!d) return { ok: false, reason: 'drawing not found' };
      dm.selectDrawing(d, false);
      return { ok: true, selectedIds: dm.selectedDrawings.map((x) => x.id) };
    }, id);
  }

  const hit = await frame.evaluate((drawId) => {
    const ch = window.chart;
    const dm = ch.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(drawId));
    if (!d || !d.group) return { ok: false, reason: 'no group' };
    const node = d.group.node();
    if (!node || !node.getBBox) return { ok: false, reason: 'no bbox' };
    const bb = node.getBBox();
    const svg = dm.svg && dm.svg.node();
    if (!svg) return { ok: false, reason: 'no svg' };
    const sr = svg.getBoundingClientRect();
    const cx = sr.left + bb.x + bb.width / 2;
    const cy = sr.top + bb.y + bb.height / 2;
    return { ok: true, x: Math.round(cx), y: Math.round(cy) };
  }, id);
  if (!hit || !hit.ok) return hit;

  await page.mouse.click(hit.x, hit.y, { clickCount: 1, delay: 30 });
  await sleep(120);
  return { ok: true, clicked: { x: hit.x, y: hit.y } };
}

/** Open the drawing settings panel for ref (in-process host path). */
export async function openSettings(page, panelId, ref) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const frame = chartTarget(page, panelId);
  return frame.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(drawId));
    if (!d) return { ok: false, reason: 'drawing not found' };
    dm.selectDrawing(d, false);
    if (typeof dm.editDrawing === 'function') {
      dm.editDrawing(d, 100, 100);
    } else if (dm.settingsPanel && typeof dm.settingsPanel.show === 'function') {
      dm.settingsPanel.show(d, 100, 100, (updated) => {
        dm.renderDrawing(updated);
        dm.saveDrawings();
      }, (toDelete) => dm.deleteDrawing(toDelete));
    } else {
      return { ok: false, reason: 'no settings opener' };
    }
    return { ok: true };
  }, id);
}

export async function pressEscape(page, panelId = 'A') {
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
  await sleep(180);
  return { ok: true };
}

/** Delete drawing via manager deleteDrawing (direct path). */
export async function deleteTool(page, panelId, ref) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const frame = chartTarget(page, panelId);
  return frame.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(drawId));
    if (!d) return { ok: false, reason: 'drawing not found' };
    dm.deleteDrawing(d);
    if (window.chart.scheduleRender) window.chart.scheduleRender();
    return { ok: true };
  }, id);
}

/** Delete drawing via settings-panel delete callback (TAL-00157 path). */
export async function deleteToolViaSettings(page, panelId, ref) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const frame = chartTarget(page, panelId);
  return frame.evaluate((drawId) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(drawId));
    if (!d) return { ok: false, reason: 'drawing not found' };
    const sp = dm.settingsPanel;
    if (sp && typeof sp.onDelete === 'function') {
      sp.onDelete(d);
    } else if (typeof dm.deleteDrawing === 'function') {
      dm.deleteDrawing(d);
    } else {
      return { ok: false, reason: 'no delete path' };
    }
    if (window.chart.scheduleRender) window.chart.scheduleRender();
    return { ok: true, via: sp && sp.onDelete ? 'settings-onDelete' : 'manager' };
  }, id);
}

/** Click empty chart canvas to deselect (background). */
export async function deselectAllViaCanvas(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  const pt = await frame.evaluate(() => {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: Math.round(r.left + r.width * 0.08), y: Math.round(r.top + r.height * 0.75) };
  });
  if (!pt) return { ok: false };
  await page.mouse.click(pt.x, pt.y, { clickCount: 1, delay: 20 });
  await sleep(150);
  return { ok: true, ...pt };
}

export async function readRenderCount(page, panelId = 'A') {
  const st = await readInteractiveState(page, panelId);
  return st && st.ok ? st.renders : null;
}

/** Assert render counter increased since `before` (invalidation / repaint signal). */
export function assertCanvasRepainted(checks, label, before, after) {
  return checks.check(
    label,
    before != null && after != null && after > before,
    `renders before=${before} after=${after}`,
  );
}

/**
 * Compare menu/selection state against expected partial object.
 * expected: { selectedIds?, toolbarVisible?, settingsOpen? }
 */
export function assertMenuState(checks, label, expected, actual) {
  let ok = true;
  const parts = [];
  if (expected.selectedIds != null) {
    const a = (actual && actual.selectedIds) || [];
    const match = expected.selectedIds.length === a.length
      && expected.selectedIds.every((id, i) => String(id) === String(a[i]));
    if (!match) ok = false;
    parts.push(`selected=${JSON.stringify(a)} expected=${JSON.stringify(expected.selectedIds)}`);
  }
  if (expected.toolbarVisible != null) {
    if (!!actual?.toolbarVisible !== !!expected.toolbarVisible) ok = false;
    parts.push(`toolbarVisible=${actual?.toolbarVisible} expected=${expected.toolbarVisible}`);
  }
  if (expected.settingsOpen != null) {
    if (!!actual?.settingsOpen !== !!expected.settingsOpen) ok = false;
    parts.push(`settingsOpen=${actual?.settingsOpen} expected=${expected.settingsOpen}`);
  }
  return checks.check(label, ok, parts.join('; '));
}

/**
 * After delete: no settings dialog, toolbar, axis highlights, or labels for ref.
 */
export function assertNoGhostAfterDelete(checks, label, ref, state) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const ghosts = [];
  if (state.settingsOpen) ghosts.push('settingsOpen');
  if (state.toolbarVisible) ghosts.push('toolbarVisible');
  if (state.settingsDrawingId && String(state.settingsDrawingId) === String(id)) ghosts.push('settingsDrawingId');
  if (state.toolbarDrawingId && String(state.toolbarDrawingId) === String(id)) ghosts.push('toolbarDrawingId');
  if (state.axisHighlightCount > 0) ghosts.push(`axisHighlights=${state.axisHighlightCount}`);
  if (state.labelNodeCount > 0) ghosts.push(`labelNodes=${state.labelNodeCount}`);
  if ((state.selectedIds || []).includes(id)) ghosts.push('stillSelected');
  return checks.check(label, ghosts.length === 0, ghosts.length ? ghosts.join(', ') : 'clean');
}

export async function waitForDrawing(page, panelId, drawId, budgetMs = 5000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const d = await resolveDrawing(page, panelId, drawId);
    if (d) return d;
    await sleep(100);
  }
  return null;
}

/** Build default placement points near visible chart center. */
export async function defaultTrendlinePoints(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  return frame.evaluate(() => {
    const ch = window.chart;
    const n = ch.data.length;
    const i0 = Math.max(0, n - 80);
    const i1 = Math.max(0, n - 40);
    const p0 = ch.data[i0];
    const p1 = ch.data[i1];
    const y0 = (p0.h + p0.l) / 2;
    const y1 = (p1.h + p1.l) / 2;
    return [{ x: i0, y: y0 }, { x: i1, y: y1 }];
  });
}

export async function defaultRectanglePoints(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  return frame.evaluate(() => {
    const ch = window.chart;
    const n = ch.data.length;
    const i0 = Math.max(0, n - 70);
    const i1 = Math.max(0, n - 50);
    const p0 = ch.data[i0];
    const p1 = ch.data[i1];
    const yTop = Math.max(p0.h, p1.h);
    const yBot = Math.min(p0.l, p1.l);
    return [{ x: i0, y: yTop }, { x: i1, y: yBot }];
  });
}

/** Iframe / host cell rect in top-page coordinates (harness grid cell). */
export async function frameRectForPanel(page, panelId) {
  if (panelId === 'A') {
    return page.evaluate(() => {
      const cell = window.__harnessCells && window.__harnessCells.A;
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
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
      } catch (_) {}
    }
    return null;
  }, panelId);
}

/** Click a panel body to raise panel-focus (mirrors user focusing a tile). */
export async function focusPanelByClick(page, panelId = 'B') {
  const pt = await chartCanvasPagePoint(page, panelId, 0.42, 0.48);
  if (!pt) return { ok: false, reason: `no canvas point for panel ${panelId}` };
  await page.mouse.click(pt.x, pt.y, { delay: 25 });
  await sleep(200);
  await page.evaluate((pid) => {
    if (typeof window.harnessSetFocusedPanel === 'function') {
      window.harnessSetFocusedPanel(pid);
    }
  }, panelId).catch(() => {});
  await sleep(100);
  return { ok: true, ...pt };
}

/** Canvas point at fractional position → top-page mouse coordinates. */
export async function chartCanvasPagePoint(page, panelId, fracX, fracY) {
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
  const fr = await frameRectForPanel(page, panelId);
  if (!fr) return null;
  return {
    x: Math.round(fr.left + local.x),
    y: Math.round(fr.top + local.y),
  };
}

/** Live drawing-manager flags for first-click / in-gesture asserts. */
export async function readDrawingManagerLiveState(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  return frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return { ok: false, reason: 'no drawingManager' };
    return {
      ok: true,
      currentTool: dm.currentTool || null,
      isDrawing: !!(dm.drawingState && dm.drawingState.isDrawing),
      drawingCount: (dm.drawings || []).length,
    };
  }).catch(() => null);
}

/**
 * Arm tool on host A and mirror production sync: host dm armed, peer iframes cleared.
 */
export async function armHostDrawToolForMultichartSync(page, tool = 'rectangle') {
  return armPanelDrawToolForMultichartSync(page, 'A', tool);
}

/**
 * Arm tool on a panel and mirror production sync: focused panel dm armed, peers cleared.
 */
export async function armPanelDrawToolForMultichartSync(page, panelId, tool = 'rectangle') {
  const focusRes = await focusPanelByClick(page, panelId);
  if (!focusRes || !focusRes.ok) return focusRes || { ok: false, reason: `focus ${panelId} failed` };
  await sleep(150);

  let res;
  if (panelId === 'A') {
    res = await page.evaluate(async (toolName) => {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm || typeof dm.setTool !== 'function') return { ok: false, reason: 'no host setTool' };
      dm.setTool(toolName);
      const grid = window.__multichartGrid;
      if (grid && typeof grid.syncDrawingToolAcrossPanels === 'function') {
        await grid.syncDrawingToolAcrossPanels(toolName);
      }
      return { ok: true, hostTool: dm.currentTool || null };
    }, tool);
    await sleep(200);
    const frameB = chartTarget(page, 'B');
    if (frameB) {
      await frameB.evaluate(() => {
        const dm = window.chart && window.chart.drawingManager;
        if (!dm) return;
        if (typeof dm.clearTool === 'function') dm.clearTool(true);
        else dm.currentTool = null;
      }).catch(() => {});
    }
  } else {
    const frame = chartTarget(page, panelId);
    if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };
    res = await frame.evaluate(async (toolName) => {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm || typeof dm.setTool !== 'function') return { ok: false, reason: 'no setTool' };
      dm.setTool(toolName);
      try {
        const grid = window.parent && window.parent.__multichartGrid;
        if (grid && typeof grid.syncDrawingToolAcrossPanels === 'function') {
          await grid.syncDrawingToolAcrossPanels(toolName);
        }
      } catch (_) { /* ignore */ }
      return { ok: true, tool: dm.currentTool || null };
    }, tool);
    await sleep(200);
    await page.evaluate(() => {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm) return;
      if (typeof dm.clearTool === 'function') dm.clearTool(true);
      else dm.currentTool = null;
    }).catch(() => {});
  }
  await sleep(100);
  return res;
}

/** Two-click rectangle without pre-focus — unfocused-tile first-click family. */
export async function twoClickRectangleOnPanel(page, panelId) {
  const p1 = await chartCanvasPagePoint(page, panelId, 0.32, 0.38);
  const p2 = await chartCanvasPagePoint(page, panelId, 0.58, 0.62);
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
  const st = await readInteractiveState(page, panelId);
  return {
    ok: true,
    midIsDrawing: !!(mid && mid.isDrawing),
    midCurrentTool: mid && mid.currentTool,
    drawingCount: st && st.ok ? st.drawingCount : null,
  };
}

export async function armDrawTool(page, panelId, toolType) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };
  return frame.evaluate((tool) => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm || typeof dm.setTool !== 'function') return { ok: false, reason: 'no setTool' };
    dm.setTool(tool);
    return { ok: true, tool: dm.currentTool };
  }, toolType);
}

/** Complete a rectangle via real mouse clicks on the panel canvas. */
export async function drawRectangleViaMouse(page, panelId) {
  const armed = await armDrawTool(page, panelId, 'rectangle');
  if (!armed || !armed.ok) return armed || { ok: false, reason: 'arm failed' };
  await sleep(120);
  const p1 = await chartCanvasPagePoint(page, panelId, 0.32, 0.38);
  const p2 = await chartCanvasPagePoint(page, panelId, 0.58, 0.62);
  if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
  await page.mouse.click(p1.x, p1.y, { delay: 35 });
  await sleep(150);
  await page.mouse.click(p2.x, p2.y, { delay: 35 });
  await sleep(350);
  const st = await readInteractiveState(page, panelId);
  return {
    ok: true,
    drawingCount: st && st.ok ? st.drawingCount : null,
    selectedIds: st && st.ok ? st.selectedIds : [],
    toolbarVisible: st && st.ok ? st.toolbarVisible : false,
  };
}

/** Complete a trendline via real mouse clicks on the panel canvas. */
export async function drawTrendlineViaMouse(page, panelId) {
  const armed = await armDrawTool(page, panelId, 'trendline');
  if (!armed || !armed.ok) return armed || { ok: false, reason: 'arm failed' };
  await sleep(120);
  const p1 = await chartCanvasPagePoint(page, panelId, 0.28, 0.42);
  const p2 = await chartCanvasPagePoint(page, panelId, 0.62, 0.55);
  if (!p1 || !p2) return { ok: false, reason: 'no canvas points' };
  await page.mouse.click(p1.x, p1.y, { delay: 35 });
  await sleep(150);
  await page.mouse.click(p2.x, p2.y, { delay: 35 });
  await sleep(350);
  const st = await readInteractiveState(page, panelId);
  return {
    ok: true,
    drawingCount: st && st.ok ? st.drawingCount : null,
    selectedIds: st && st.ok ? st.selectedIds : [],
    toolbarVisible: st && st.ok ? st.toolbarVisible : false,
  };
}

export async function readIndicatorState(page, panelId = 'A') {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    const ind = ch && ch.indicators;
    if (!ind) return { ok: false, reason: 'no indicators object' };
    const active = (ind.active || []).map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name,
    }));
    return { ok: true, count: active.length, active };
  }).catch(() => null);
}

export async function addIndicator(page, panelId, type, params = {}) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };
  return frame.evaluate((t, p) => {
    const ch = window.chart;
    if (!ch || typeof ch.addIndicator !== 'function') return { ok: false, reason: 'no addIndicator' };
    try {
      ch.addIndicator(t, p);
      const active = (ch.indicators && ch.indicators.active) || [];
      return {
        ok: true,
        count: active.length,
        types: active.map((i) => i.type),
        ids: active.map((i) => i.id),
      };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }, type, params);
}

export async function removeAllIndicators(page, panelId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };
  return frame.evaluate(() => {
    const ch = window.chart;
    const ind = ch && ch.indicators;
    if (!ind || !Array.isArray(ind.active)) return { ok: false, reason: 'no indicators.active' };
    const ids = ind.active.map((i) => i.id);
    ids.slice().forEach((id) => {
      if (typeof ch.removeIndicator === 'function') ch.removeIndicator(id);
    });
    if (ch.scheduleRender) ch.scheduleRender();
    const remaining = (ch.indicators && ch.indicators.active) || [];
    return { ok: true, removed: ids.length, remaining: remaining.length };
  });
}

/** Commit a style patch inside a panel frame and read render counter delta. */
export async function commitDrawingStyleInPanel(page, panelId, ref, stylePatch) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };
  const id = typeof ref === 'string' ? ref : ref.id;
  return frame.evaluate(async (drawId, patch) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const drawing = dm && dm.drawings.find((d) => d && String(d.id) === String(drawId));
    if (!drawing) return { ok: false, reason: 'drawing not found' };
    const before = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
    Object.assign(drawing.style, patch);
    dm.renderDrawing(drawing);
    dm.saveDrawings();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
    return { ok: true, before, after, style: { ...drawing.style } };
  }, id, stylePatch);
}

/**
 * Drag a selected drawing handle while moving the cursor past the tile bounds.
 * Models the pointer-capture / mouseleave path (TAL-01491 / TAL-01587).
 */
export async function probeDrawingDragPastTile(page, panelId, ref) {
  const id = typeof ref === 'string' ? ref : ref.id;
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for panel ${panelId}` };

  const cellBox = await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, panelId);
  if (!cellBox) return { ok: false, reason: 'no cell box' };

  const hit = await frame.evaluate((drawId) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(drawId));
    if (!d || !d.group) return { ok: false, reason: 'drawing not found' };
    dm.selectDrawing(d, false);
    const node = d.group.node();
    if (!node || !node.getBBox) return { ok: false, reason: 'no bbox' };
    const bb = node.getBBox();
    const svg = dm.svg && dm.svg.node();
    if (!svg) return { ok: false, reason: 'no svg' };
    const sr = svg.getBoundingClientRect();
    const localX = bb.x + bb.width * 0.75;
    const localY = bb.y + bb.height * 0.5;
    const startY = d.points && d.points[0] ? Number(d.points[0].y) : null;
    return {
      ok: true,
      pageX: Math.round(sr.left + localX),
      pageY: Math.round(sr.top + localY),
      startY,
    };
  }, id);
  if (!hit || !hit.ok) return hit;

  let startX = hit.pageX;
  let startY = hit.pageY;
  if (panelId !== 'A') {
    const fr = await frameRectForPanel(page, panelId);
    if (!fr) return { ok: false, reason: 'no iframe rect' };
    // frame-local evaluate already returns iframe-viewport coords; translate to page.
    const local = await frame.evaluate((drawId) => {
      const dm = window.chart && window.chart.drawingManager;
      const d = dm && dm.drawings.find((x) => x && String(x.id) === String(drawId));
      if (!d || !d.group) return null;
      const node = d.group.node();
      const bb = node.getBBox();
      const svg = dm.svg && dm.svg.node();
      const sr = svg.getBoundingClientRect();
      return {
        x: sr.left + bb.x + bb.width * 0.75,
        y: sr.top + bb.y + bb.height * 0.5,
      };
    }, id);
    if (!local) return { ok: false, reason: 'no iframe-local hit' };
    startX = Math.round(fr.left + local.x);
    startY = Math.round(fr.top + local.y);
  }

  const outsideX = Math.round(cellBox.left - 40);
  const outsideY = startY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.move(outsideX, outsideY, { steps: 18 });
  await sleep(80);

  await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (cell) {
      try { cell.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true })); } catch (_) {}
    }
  }, panelId);
  await frame.evaluate(() => {
    const canvas = document.getElementById('chartCanvas');
    if (canvas) {
      try { canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true })); } catch (_) {}
    }
  }).catch(() => null);
  await sleep(120);

  const mid = await frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return { ok: false };
    const d = dm.draggingDrawing;
    const y0 = d && d.points && d.points[0] ? Number(d.points[0].y) : null;
    return {
      ok: true,
      isDragging: !!dm.isDragging,
      draggingId: d && d.id != null ? String(d.id) : null,
      pointY: y0,
    };
  }).catch(() => null);

  await page.mouse.up();
  await sleep(200);

  const after = await frame.evaluate((drawId) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(drawId));
    const y0 = d && d.points && d.points[0] ? Number(d.points[0].y) : null;
    return {
      isDragging: !!(dm && dm.isDragging),
      pointY: y0,
    };
  }, id).catch(() => null);

  return {
    ok: true,
    start: { x: startX, y: startY },
    outside: { x: outsideX, y: outsideY },
    mid,
    after,
    startPointY: hit.startY,
    movedDuringDrag: mid && hit.startY != null && mid.pointY != null
      && Math.abs(mid.pointY - hit.startY) > 0.00001,
    stillDraggingOutside: !!(mid && mid.isDragging),
  };
}

/**
 * Pan a panel while the cursor travels past the tile's left edge; sample whether
 * offsetX still moves (pointer-capture) vs dies at the frame box.
 */
export async function probePanDragPastTile(page, panelId = 'A') {
  const cellBox = await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, panelId);
  if (!cellBox) return { ok: false, reason: 'no cell box' };

  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: `no frame for ${panelId}` };

  const y = Math.round(cellBox.top + cellBox.height * 0.5);
  const xStart = Math.round(cellBox.left + cellBox.width * 0.55);
  const xMid = Math.round(cellBox.left + cellBox.width * 0.2);
  const xOutside = Math.round(cellBox.left - 50);

  const offsetStart = await frame.evaluate(() => Number(window.chart && window.chart.offsetX)).catch(() => null);
  await page.mouse.move(xStart, y);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.move(xMid, y, { steps: 8 });
  await sleep(60);
  const offsetMid = await frame.evaluate(() => Number(window.chart && window.chart.offsetX)).catch(() => null);
  await page.mouse.move(xOutside, y, { steps: 12 });
  await sleep(60);
  await page.evaluate(() => {
    try { document.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true, cancelable: true })); } catch (_) {}
  });
  await sleep(80);
  const offsetOutside = await frame.evaluate(() => Number(window.chart && window.chart.offsetX)).catch(() => null);
  await page.mouse.up();
  await sleep(150);
  const offsetEnd = await frame.evaluate(() => Number(window.chart && window.chart.offsetX)).catch(() => null);

  const deltaInside = (offsetStart != null && offsetMid != null) ? Math.abs(offsetMid - offsetStart) : 0;
  const deltaOutside = (offsetMid != null && offsetOutside != null) ? Math.abs(offsetOutside - offsetMid) : 0;
  return {
    ok: true,
    offsetStart,
    offsetMid,
    offsetOutside,
    offsetEnd,
    deltaInside,
    deltaOutside,
    continuedOutside: deltaOutside > 2,
  };
}

/** Map persisted layout id → expected panel count (D-008 row 13 contract). */
export function layoutIdToPanelCount(layoutId) {
  const id = String(layoutId || '').trim().toLowerCase();
  if (!id || id === '1') return 1;
  if (id === '2' || id === '2v' || id === '2h') return 2;
  if (id === '3') return 3;
  if (id === '4' || id === '2x2') return 4;
  if (/^[5-8]$/.test(id)) return parseInt(id, 10);
  return 1;
}

/** Write chart_panel_state blob (panel-managerv2 schema) for layout persistence probes. */
export async function seedChartPanelState(page, layoutId) {
  return page.evaluate((layout) => {
    const blob = {
      layout: String(layout),
      selectedPanelIndex: 0,
      panels: [],
    };
    try {
      localStorage.setItem('chart_panel_state', JSON.stringify(blob));
      return { ok: true, layout: blob.layout };
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }, layoutId);
}

/** Read persisted layout + live harness panel count after refresh. */
export async function readLayoutPersistenceProbe(page) {
  return page.evaluate(() => {
    let savedLayout = null;
    let parseOk = true;
    try {
      const raw = localStorage.getItem('chart_panel_state');
      if (raw) {
        const state = JSON.parse(raw);
        savedLayout = state && state.layout != null ? String(state.layout) : null;
      }
    } catch (_) {
      parseOk = false;
    }
    const appliedPanels = (window.__harnessManager && window.__harnessManager.charts)
      ? window.__harnessManager.charts.size
      : 1;
    return {
      savedLayout,
      parseOk,
      appliedPanels,
      bootError: window.__harnessBootError || null,
    };
  });
}

/** Cell vs canvas geometry for tile clip probes (row 14). */
export async function readTileGeometryProbe(page, panelId) {
  if (panelId === 'A') {
    return page.evaluate(() => {
      const cell = window.__harnessCells && window.__harnessCells.A;
      const ch = window.chart;
      if (!cell || !ch || !ch.canvas) return { ok: false, reason: 'no host cell/canvas' };
      const cellR = cell.getBoundingClientRect();
      const canvasR = ch.canvas.getBoundingClientRect();
      const cellH = Math.max(1, cellR.height);
      const canvasH = Math.max(0, canvasR.height);
      return {
        ok: true,
        panelId: 'A',
        cellH,
        canvasH,
        bufferH: Number(ch.h) || 0,
        gapBottom: Math.max(0, cellR.bottom - canvasR.bottom),
        fillRatio: canvasH / cellH,
        bufferRatio: (Number(ch.h) || 0) / cellH,
      };
    });
  }
  return page.evaluate((pid) => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    let ifr = null;
    for (const el of frames) {
      try {
        const u = new URL(el.src, location.href);
        if (u.searchParams.get('panelId') === pid) { ifr = el; break; }
      } catch (_) {}
    }
    if (!ifr) return { ok: false, reason: 'no iframe for ' + pid };
    const cell = ifr.parentElement;
    const ch = ifr.contentWindow && ifr.contentWindow.chart;
    if (!cell || !ch || !ch.canvas) return { ok: false, reason: 'no cell/canvas for ' + pid };
    const cellR = cell.getBoundingClientRect();
    const canvasR = ch.canvas.getBoundingClientRect();
    const cellH = Math.max(1, cellR.height);
    const canvasH = Math.max(0, canvasR.height);
    return {
      ok: true,
      panelId: pid,
      cellH,
      canvasH,
      bufferH: Number(ch.h) || 0,
      gapBottom: Math.max(0, cellR.bottom - canvasR.bottom),
      fillRatio: canvasH / cellH,
      bufferRatio: (Number(ch.h) || 0) / cellH,
    };
  }, panelId);
}

/** Per-panel fileId map from harness manager state. */
export async function readPanelFileIds(page) {
  return page.evaluate(() => {
    const out = {};
    const mgr = window.__harnessManager;
    if (!mgr || !mgr.charts) return out;
    for (const c of mgr.charts.values()) {
      if (!c) continue;
      if (c.host && window.chart && window.chart.currentFileId != null) {
        out[c.id] = String(window.chart.currentFileId);
      } else if (c.state && c.state.fileId != null) {
        out[c.id] = String(c.state.fileId);
      }
    }
    return out;
  });
}

/** Flip symbol sync OFF→ON on harness manager (row 15 toggle-edge probe). */
export async function enableHarnessSymbolSync(page) {
  return page.evaluate(() => {
    const mgr = window.__harnessManager;
    if (!mgr || typeof mgr.setSyncMode !== 'function') {
      return { ok: false, reason: 'no harness manager' };
    }
    const prev = !!(mgr.syncMode && mgr.syncMode.symbol);
    mgr.setSyncMode(Object.assign({}, mgr.syncMode || {}, { symbol: true }));
    try {
      const hostBridge = window.__harnessHostBridge;
      if (hostBridge && typeof hostBridge.setSyncModeGate === 'function') {
        hostBridge.setSyncModeGate(mgr.syncMode);
      }
    } catch (_) {}
    return { ok: true, wasOn: prev, nowOn: !!(mgr.syncMode && mgr.syncMode.symbol) };
  });
}

/** Focused panel id from harness manager selection (proxy for V9 focusedPanelId). */
export async function readHarnessFocusedPanelId(page) {
  return page.evaluate(() => {
    const mgr = window.__harnessManager;
    if (!mgr) return null;
    if (mgr.focusedPanelId != null) return String(mgr.focusedPanelId);
    if (mgr.selectedPanelId != null) return String(mgr.selectedPanelId);
    return 'A';
  });
}

/** Parent V9 topbar active TF pill (`data-tf` with active font-weight). */
export async function readParentTopbarActiveTf(page) {
  return page.evaluate(() => {
    const stub = document.getElementById('harnessTopbarTf');
    if (stub && stub.getAttribute('data-tf')) {
      return stub.getAttribute('data-tf');
    }
    const pills = document.querySelectorAll('[data-tf]');
    for (const el of pills) {
      const fw = window.getComputedStyle(el).fontWeight;
      if (fw === '700' || Number(fw) >= 700) {
        return el.getAttribute('data-tf');
      }
    }
    for (const el of pills) {
      const bg = el.style.background || '';
      if (bg.includes('74,106,255') || bg.includes('4a6aff')) {
        return el.getAttribute('data-tf');
      }
    }
    return window.__harnessTopbarTf || null;
  });
}

/** chart.currentTimeframe inside a panel iframe (or host when panelId A). */
export async function readPanelEngineTf(page, panelId = 'B') {
  const frame = chartTarget(page, panelId);
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    return ch && ch.currentTimeframe != null ? String(ch.currentTimeframe) : null;
  }).catch(() => null);
}

/** MC-PEER-DESELECT-SCOPE: probe grid export for cancelScheduledPeerDeselect. */
export async function readGridPeerDeselectScope(page) {
  return page.evaluate(() => {
    const grid = window.__multichartGrid;
    return {
      hasGrid: !!grid,
      hasCancel: !!(grid && typeof grid.cancelScheduledPeerDeselect === 'function'),
      peerDeselectOff: !!(typeof window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1 === 'boolean'
        && window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1 === true),
    };
  });
}

/** Fire parent-shell multichart message (panel-select / drawing-selected paths). */
export async function fireMultichartParentMessage(page, type, panelId = 'B', extra = {}) {
  return page.evaluate(({ msgType, pid, payload }) => {
    window.postMessage({
      type: msgType,
      source: pid,
      drawingId: payload.drawingId || 'harness-probe-drawing',
      drawingType: payload.drawingType || 'trendline',
    }, '*');
    return { ok: true, type: msgType, panelId: pid };
  }, { msgType: type, pid: panelId, payload: extra });
}

/** Scope-break probe: delete export, fire handler, restore — must not throw ReferenceError. */
export async function probePeerDeselectScopeGuard(page, panelId = 'B') {
  return page.evaluate((pid) => {
    const grid = window.__multichartGrid;
    if (!grid) return { ok: false, reason: 'no-grid' };
    const saved = grid.cancelScheduledPeerDeselect;
    try {
      delete grid.cancelScheduledPeerDeselect;
      window.postMessage({
        type: 'multichart-drawing-selected',
        source: pid,
        drawingId: 'scope-break-probe',
        drawingType: 'trendline',
      }, '*');
      return { ok: true, hadExport: typeof saved === 'function' };
    } catch (err) {
      return { ok: false, reason: String(err && err.message || err) };
    } finally {
      if (typeof saved === 'function') {
        grid.cancelScheduledPeerDeselect = saved;
      }
    }
  }, panelId);
}

export function filterPeerDeselectScopeErrors(pageErrors) {
  const list = Array.isArray(pageErrors) ? pageErrors : [];
  return list.filter((e) => /ReferenceError|cancelScheduledPeerDeselect/i.test(String(e)));
}

/** Linear puppeteer mouse path (A8-* I15 actuation). */
export async function dragPointerPath(page, x0, y0, x1, y1, { steps = 10 } = {}) {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    await sleep(20);
  }
}

export async function resolveResizeHandlePagePoint(page, panelId, drawId, role = 'corner-br') {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  const local = await frame.evaluate((id, handleRole) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d || !d.group) return { ok: false, reason: 'no group' };
    const sel = d.group.select(`.resize-handle-group[data-handle-role="${handleRole}"]`);
    const node = sel.empty() ? null : sel.node();
    if (!node || !node.getBoundingClientRect) {
      return { ok: false, reason: `handle ${handleRole} not found` };
    }
    const r = node.getBoundingClientRect();
    return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, role: handleRole };
  }, drawId, role);
  if (!local || !local.ok) return local;
  if (panelId === 'A') return local;
  const fr = await frameRectForPanel(page, panelId);
  if (!fr) return { ok: false, reason: 'no frame rect' };
  return { ok: true, x: fr.left + local.x, y: fr.top + local.y, role };
}

export async function resolveBodyHitPagePoint(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  const local = await frame.evaluate((id) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d || !d.group) return { ok: false, reason: 'no group' };
    const node = d.group.node();
    if (!node || !node.getBBox) return { ok: false, reason: 'no bbox' };
    const bb = node.getBBox();
    const svg = dm.svg && dm.svg.node();
    if (!svg) return { ok: false, reason: 'no svg' };
    const sr = svg.getBoundingClientRect();
    return {
      ok: true,
      x: sr.left + bb.x + bb.width / 2,
      y: sr.top + bb.y + bb.height / 2,
    };
  }, drawId);
  if (!local || !local.ok) return local;
  if (panelId === 'A') return local;
  const fr = await frameRectForPanel(page, panelId);
  if (!fr) return { ok: false, reason: 'no frame rect' };
  return { ok: true, x: fr.left + local.x, y: fr.top + local.y };
}

export async function lockDrawingViaManager(page, panelId, drawId, locked = true) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id, flag) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d) return { ok: false, reason: 'not found' };
    d.locked = !!flag;
    if (typeof dm.renderDrawing === 'function') dm.renderDrawing(d);
    if (typeof dm.setupDrawingInteraction === 'function') dm.setupDrawingInteraction(d);
    if (typeof dm._broadcastDrawingStateSync === 'function') dm._broadcastDrawingStateSync(d);
    if (typeof dm.saveDrawings === 'function') dm.saveDrawings();
    return { ok: true, locked: !!d.locked };
  }, drawId, locked);
}

export async function readDrawingShiftSquareProbe(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d || !Array.isArray(d.points) || d.points.length < 2 || !ch.yScale) {
      return { ok: false, reason: 'missing drawing/scales' };
    }
    const y0 = Number(d.points[0].y);
    const y1 = Number(d.points[1].y);
    const priceSpan = Math.abs(y0 - y1);
    const yDom = ch.yScale.domain();
    const visibleSpan = Math.abs(Number(yDom[1]) - Number(yDom[0]));
    const ratio = visibleSpan > 0 ? priceSpan / visibleSpan : 0;
    const xL = Math.min(d.points[0].x, d.points[1].x);
    const xR = Math.max(d.points[0].x, d.points[1].x);
    const pxW = Math.abs(ch.dataIndexToPixel(xR) - ch.dataIndexToPixel(xL));
    const pxH = Math.abs(ch.yScale(y0) - ch.yScale(y1));
    const aspect = pxW > 1 ? pxH / pxW : null;
    const aspectOk = aspect != null && aspect > 0.65 && aspect < 1.35;
    const jump = ratio > 0.42;
    return { ok: true, priceSpan, visibleSpan, ratio, aspect, aspectOk, jump };
  }, drawId);
}

export async function readDrawingGhostMidDragProbe(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id) => {
    const start = window.__hA82Start;
    const START_POINTS = start && String(start.id) === String(id) ? start.points : null;
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d || !d.group || !START_POINTS || !ch.yScale) return { ok: false, reason: 'missing' };
    const transform = d.group.attr('transform') || '';
    const hasTransform = transform && transform !== 'null' && !/^translate\(0[, ]0\)/.test(transform);
    const p0s = START_POINTS[0];
    const p0c = d.points && d.points[0];
    if (!p0s || !p0c) return { ok: false, reason: 'no points' };
    const dataMoved = Math.hypot(p0c.x - p0s.x, p0c.y - p0s.y) > 0.0005;
    const node = d.group.node();
    const bb = node.getBBox();
    const svg = dm.svg.node();
    const sr = svg.getBoundingClientRect();
    const bboxCx = sr.left + bb.x + bb.width / 2;
    const bboxCy = sr.top + bb.y + bb.height / 2;
    const startCx = sr.left + ch.dataIndexToPixel((START_POINTS[0].x + START_POINTS[1].x) / 2);
    const startCy = sr.top + ch.yScale((START_POINTS[0].y + START_POINTS[1].y) / 2);
    const curCx = sr.left + ch.dataIndexToPixel((d.points[0].x + d.points[1].x) / 2);
    const curCy = sr.top + ch.yScale((d.points[0].y + d.points[1].y) / 2);
    const bboxNearOrigin = Math.hypot(bboxCx - startCx, bboxCy - startCy) < 12;
    const dataNearCurrent = Math.hypot(bboxCx - curCx, bboxCy - curCy) < 20;
    const ghost = dataMoved && bboxNearOrigin && !dataNearCurrent;
    const staleTransform = dataMoved && hasTransform;
    return { ok: true, dataMoved, hasTransform, ghost, staleTransform, transform };
  }, drawId);
}

export async function readDrawingTimestampAnchors(page, panelId, drawId) {
  const frame = chartTarget(page, panelId);
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => String(x.id) === String(id));
    if (!d) return { ok: false, reason: 'no drawing' };
    const pts = Array.isArray(d.timestampPoints) && d.timestampPoints.length ? d.timestampPoints : null;
    const barPts = Array.isArray(d.points) ? d.points : [];
    const tf = window.chart.currentTimeframe || null;
    return {
      ok: true,
      tf,
      timestampPoints: pts,
      barPoints: barPts,
      p0ts: pts && pts[0] ? Number(pts[0].timestamp) : null,
      p0price: pts && pts[0] ? Number(pts[0].price) : null,
      p0bar: barPts[0] ? Number(barPts[0].x) : null,
    };
  }, drawId);
}

export { resolveDrawing };
