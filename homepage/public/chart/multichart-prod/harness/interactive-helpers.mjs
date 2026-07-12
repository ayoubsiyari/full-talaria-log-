/**
 * interactive-helpers.mjs — T0 Lane 4 page-object helpers for drawing-tool
 * interactive flows on the multichart harness host (tile A).
 *
 * Used by H-S32 (first-click-fails) and H-S33 (ghost-after-delete) and future
 * symptom-family suites. Operates on the real engine via page.evaluate /
 * puppeteer mouse events — no forked harness.
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
    };
  }).catch(() => null);
}

export async function installParentSettingsProbe(page) {
  return page.evaluate(() => {
    window.__harnessDrawingSettingsMessages = [];
    window.__harnessParentSettingsOpen = false;
    window.__harnessParentSettingsClosed = false;
    if (window.__harnessDrawingSettingsProbeInstalled) return true;
    window.__harnessDrawingSettingsProbeInstalled = true;
    window.addEventListener('message', (ev) => {
      const msg = ev && ev.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'multichart-open-drawing-settings') {
        window.__harnessParentSettingsOpen = true;
        window.__harnessParentSettingsClosed = false;
        window.__harnessDrawingSettingsMessages.push({
          type: msg.type,
          source: msg.source || null,
          drawingId: msg.drawingId != null ? String(msg.drawingId) : null,
        });
      }
      if (msg.type === 'multichart-close-drawing-settings') {
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
    }, true);
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

export { resolveDrawing };
