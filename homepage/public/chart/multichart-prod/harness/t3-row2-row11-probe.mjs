import { startServer } from './serve.mjs';
import {
  bootLayout,
  launchBrowser,
  panelFrameMap,
  sleep,
  waitBootSettled,
} from './harness-lib.mjs';
import {
  defaultTrendlinePoints,
  placeTool,
} from './interactive-helpers.mjs';

function roundRect(r) {
  if (!r) return null;
  const out = {};
  for (const k of Object.keys(r)) {
    const v = r[k];
    out[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
  }
  return out;
}

async function installParentRow2Probe(page) {
  await page.evaluate(() => {
    window.__t3Row2ParentLog = [];
    const log = (event, detail) => {
      try {
        window.__t3Row2ParentLog.push({
          event,
          t: Math.round(performance.now() * 10) / 10,
          detail: detail || {},
        });
      } catch (_) {}
    };
    window.addEventListener('message', (ev) => {
      const m = ev && ev.data;
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'panel-focus'
        || m.type === 'multichart-drawing-selected'
        || m.type === 'multichart-drawing-deselected'
        || m.type === 'multichart-open-drawing-settings') {
        log('message:' + m.type, { source: m.source || null, drawingId: m.drawingId || null });
      }
    }, true);

    const install = () => {
      const grid = window.__multichartGrid;
      if (!grid || grid.__t3Row2ProbeInstalled) return false;
      grid.__t3Row2ProbeInstalled = true;
      const wrap = (name) => {
        if (typeof grid[name] !== 'function') return;
        const orig = grid[name].bind(grid);
        grid[name] = function wrappedGridFn(...args) {
          log(name, { args: args.map((a) => (a && typeof a === 'object' ? JSON.stringify(a).slice(0, 120) : a)) });
          return orig(...args);
        };
      };
      wrap('clearDrawingUiOnOtherPanels');
      wrap('deselectDrawingsOnNonFocusedPanels');
      wrap('focusPanelById');
      return true;
    };
    install();
    window.__t3Row2InstallParentGridProbe = install;
  });
}

async function installFrameRow2Probe(frame) {
  await frame.evaluate(() => {
    window.__t3Row2FrameLog = [];
    const log = (event, detail) => {
      try {
        window.__t3Row2FrameLog.push({
          event,
          t: Math.round(performance.now() * 10) / 10,
          detail: detail || {},
        });
      } catch (_) {}
    };
    const snapshotDrawing = (drawing) => {
      if (!drawing) return null;
      let bbox = null;
      try {
        const node = drawing.group && drawing.group.node && drawing.group.node();
        if (node && node.getBBox) {
          const b = node.getBBox();
          bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      } catch (_) {}
      return {
        id: drawing.id != null ? String(drawing.id) : null,
        type: drawing.type || null,
        selected: !!drawing.selected,
        points: Array.isArray(drawing.points)
          ? drawing.points.map((p) => ({
            x: Number.isFinite(p && p.x) ? Math.round(p.x * 100) / 100 : p && p.x,
            y: Number.isFinite(p && p.y) ? Math.round(p.y * 100000) / 100000 : p && p.y,
            timestamp: p && (p.timestamp != null ? p.timestamp : p.t),
            price: p && (p.price != null ? p.price : null),
          }))
          : [],
        bbox,
      };
    };
    const snapshotAll = () => {
      const dm = window.chart && window.chart.drawingManager;
      return {
        selectedIds: dm && Array.isArray(dm.selectedDrawings)
          ? dm.selectedDrawings.map((d) => d && String(d.id))
          : [],
        guardUntil: window.__v9DrawingSelectionGuardUntil || null,
        drawings: dm && Array.isArray(dm.drawings) ? dm.drawings.map(snapshotDrawing) : [],
      };
    };

    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    if (ch && typeof ch.receiveDrawingChange === 'function' && !ch.__t3Row2ReceiveWrapped) {
      const origReceive = ch.receiveDrawingChange.bind(ch);
      ch.__t3Row2ReceiveWrapped = true;
      ch.receiveDrawingChange = function wrappedReceive(action, drawing, drawingIndex) {
        log('receiveDrawingChange:before', {
          action,
          incomingId: drawing && drawing.id != null ? String(drawing.id) : null,
          incomingPoints: drawing && Array.isArray(drawing.points) ? drawing.points : null,
        });
        const ret = origReceive(action, drawing, drawingIndex);
        log('receiveDrawingChange:after', snapshotAll());
        return ret;
      };
    }
    if (dm && typeof dm.selectDrawing === 'function' && !dm.__t3Row2SelectWrapped) {
      const origSelect = dm.selectDrawing.bind(dm);
      dm.__t3Row2SelectWrapped = true;
      dm.selectDrawing = function wrappedSelect(drawing, addToSelection, options) {
        log('selectDrawing:before', {
          id: drawing && drawing.id != null ? String(drawing.id) : null,
          addToSelection: !!addToSelection,
          snapshot: snapshotAll(),
        });
        const ret = origSelect(drawing, addToSelection, options);
        log('selectDrawing:after', snapshotAll());
        return ret;
      };
    }
  });
}

async function snapshotFrameDrawings(frame) {
  return frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return { ok: false, reason: 'no drawingManager' };
    const drawings = (dm.drawings || []).map((d) => {
      let bbox = null;
      let client = null;
      try {
        const node = d.group && d.group.node && d.group.node();
        if (node && node.getBBox) {
          const b = node.getBBox();
          bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
          const r = node.getBoundingClientRect();
          client = {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
          };
        }
      } catch (_) {}
      return {
        id: String(d.id),
        type: d.type,
        selected: !!d.selected,
        points: Array.isArray(d.points) ? d.points.map((p) => ({
          x: p && p.x,
          y: p && p.y,
          timestamp: p && (p.timestamp != null ? p.timestamp : p.t),
          price: p && (p.price != null ? p.price : null),
        })) : [],
        bbox,
        client,
      };
    });
    return {
      ok: true,
      selectedIds: (dm.selectedDrawings || []).map((d) => d && String(d.id)),
      drawings,
    };
  });
}

async function waitForPanelDrawingCount(frame, count, budgetMs = 5000) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshotFrameDrawings(frame);
    if (last && last.ok && last.drawings.length >= count) return last;
    await sleep(100);
  }
  return last;
}

async function panelFrameRect(page, panelId) {
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

async function ctrlClickFrameDrawings(page, panelId, snapshot, count = 2) {
  const draws = (snapshot.drawings || []).filter((d) => d.client && d.client.width >= 0);
  if (draws.length < count) return { ok: false, reason: `need ${count} client bboxes, got ${draws.length}` };
  const frameRect = await panelFrameRect(page, panelId);
  if (!frameRect) return { ok: false, reason: `no frame rect for panel ${panelId}` };
  await page.keyboard.down('Control');
  try {
    for (const d of draws.slice(0, count)) {
      await page.mouse.click(
        Math.round(frameRect.left + d.client.cx),
        Math.round(frameRect.top + d.client.cy),
        { delay: 30 },
      );
      await sleep(160);
    }
  } finally {
    await page.keyboard.up('Control');
  }
  return {
    ok: true,
    clicked: draws.slice(0, count).map((d) => ({
      id: d.id,
      frameLocalX: Math.round(d.client.cx),
      frameLocalY: Math.round(d.client.cy),
      pageX: Math.round(frameRect.left + d.client.cx),
      pageY: Math.round(frameRect.top + d.client.cy),
    })),
  };
}

function centerDistance(a, b) {
  if (!a || !b || !a.client || !b.client) return null;
  const dx = a.client.cx - b.client.cx;
  const dy = a.client.cy - b.client.cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function hasLocalDoubleToggle(frameLog) {
  const events = (frameLog || []).filter((e) => e && /^selectDrawing:/.test(e.event));
  for (let i = 0; i < events.length - 1; i++) {
    const a = events[i];
    const b = events[i + 1];
    if (a.event !== 'selectDrawing:after' || b.event !== 'selectDrawing:before') continue;
    const aIds = (a.detail && a.detail.selectedIds) || [];
    const bSnapIds = (b.detail && b.detail.snapshot && b.detail.snapshot.selectedIds) || [];
    const sameDrawing = b.detail && aIds.length === 1 && String(b.detail.id) === String(aIds[0]);
    if (!sameDrawing) continue;
    if (JSON.stringify(aIds) !== JSON.stringify(bSnapIds)) continue;
    const c = events[i + 2];
    const cIds = (c && c.detail && c.detail.selectedIds) || [];
    if (c && c.event === 'selectDrawing:after' && cIds.length === 0 && (c.t - a.t) < 20) {
      return true;
    }
  }
  return false;
}

async function measurePlotRects(page, frame) {
  const host = await page.evaluate(() => {
    const ch = window.chart;
    const canvas = document.getElementById('chartCanvas');
    const wrapper = document.getElementById('chartWrapper');
    const margin = ch && ch.margin ? ch.margin : { l: 0, r: 0, t: 0, b: 0 };
    const cr = canvas ? canvas.getBoundingClientRect() : null;
    const wr = wrapper ? wrapper.getBoundingClientRect() : null;
    const plot = cr ? {
      left: cr.left + margin.l,
      top: cr.top + margin.t,
      width: (ch && Number.isFinite(ch.w) ? ch.w : cr.width) - margin.l - margin.r,
      height: (ch && Number.isFinite(ch.h) ? ch.h : cr.height) - margin.t - margin.b,
    } : null;
    return {
      panel: 'A',
      chartW: ch && ch.w,
      chartH: ch && ch.h,
      margin,
      canvasRect: cr && { left: cr.left, top: cr.top, width: cr.width, height: cr.height },
      wrapperRect: wr && { left: wr.left, top: wr.top, width: wr.width, height: wr.height },
      plotRect: plot,
      offsetX: ch && ch.offsetX,
      candleSpacing: ch && typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : null,
    };
  });
  const frameLocal = await frame.evaluate(() => {
    const ch = window.chart;
    const canvas = document.getElementById('chartCanvas');
    const margin = ch && ch.margin ? ch.margin : { l: 0, r: 0, t: 0, b: 0 };
    const cr = canvas ? canvas.getBoundingClientRect() : null;
    const plot = cr ? {
      left: cr.left + margin.l,
      top: cr.top + margin.t,
      width: (ch && Number.isFinite(ch.w) ? ch.w : cr.width) - margin.l - margin.r,
      height: (ch && Number.isFinite(ch.h) ? ch.h : cr.height) - margin.t - margin.b,
    } : null;
    return {
      panel: 'B',
      chartW: ch && ch.w,
      chartH: ch && ch.h,
      margin,
      canvasRect: cr && { left: cr.left, top: cr.top, width: cr.width, height: cr.height },
      plotRect: plot,
      offsetX: ch && ch.offsetX,
      candleSpacing: ch && typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : null,
    };
  });
  const frameBox = await page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll('iframe'));
    for (const el of frames) {
      try {
        const u = new URL(el.src, location.href);
        if (u.searchParams.get('panelId') === 'B') {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        }
      } catch (_) {}
    }
    return null;
  });
  const iframe = { ...frameLocal, frameRect: frameBox };
  if (iframe.plotRect && frameBox) {
    iframe.globalPlotRect = {
      left: frameBox.left + iframe.plotRect.left,
      top: frameBox.top + iframe.plotRect.top,
      width: iframe.plotRect.width,
      height: iframe.plotRect.height,
    };
  }
  return { host, iframe };
}

async function run() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful: process.argv.includes('--headful') });
  const result = { row2: {}, row11: {}, errors: [] };
  try {
    const boot = await bootLayout(browser, srv, { pair: 'same', panels: 2, tf: '1m' });
    const { page } = boot;
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    const frames = panelFrameMap(page);
    const frameB = frames.B;
    if (!frameB) throw new Error('panel B iframe not found');

    await installParentRow2Probe(page);
    await installFrameRow2Probe(frameB);

    const pts1 = await defaultTrendlinePoints(page, 'A');
    const pts2 = pts1.map((p, i) => ({ x: p.x + 35, y: p.y - (i === 0 ? 0.0012 : 0.001) }));
    const a1 = await placeTool(page, 'A', 'trendline', pts1);
    await sleep(350);
    const a2 = await placeTool(page, 'A', 'trendline', pts2);
    const before = await waitForPanelDrawingCount(frameB, 2, 5000);
    const beforeDistance = before && before.ok && before.drawings.length >= 2
      ? centerDistance(before.drawings[0], before.drawings[1])
      : null;
    const clickRes = before && before.ok ? await ctrlClickFrameDrawings(page, 'B', before, 2) : { ok: false, reason: 'no before snapshot' };
    await sleep(500);
    const after = await snapshotFrameDrawings(frameB);
    const afterDistance = after && after.ok && after.drawings.length >= 2
      ? centerDistance(after.drawings[0], after.drawings[1])
      : null;
    const frameLog = await frameB.evaluate(() => window.__t3Row2FrameLog || []);
    const parentLog = await page.evaluate(() => window.__t3Row2ParentLog || []);

    let implicated = 'not-reproduced';
    const beforeCollapsed = beforeDistance != null && beforeDistance < 12;
    const afterCollapsed = afterDistance != null && afterDistance < 12;
    const selectedAfter = after && after.selectedIds ? after.selectedIds.length : 0;
    const clearAfterSelect = parentLog.some((e) => /clearDrawingUiOnOtherPanels|deselectDrawingsOnNonFocusedPanels/.test(e.event));
    const localDoubleToggle = hasLocalDoubleToggle(frameLog);
    if (beforeCollapsed) {
      implicated = 'a';
    } else if (!beforeCollapsed && afterCollapsed) {
      implicated = 'a';
    } else if (!beforeCollapsed && selectedAfter < 2 && clearAfterSelect) {
      implicated = 'b';
    } else if (!beforeCollapsed && selectedAfter < 2 && localDoubleToggle) {
      implicated = 'c-local-double-toggle';
    } else if (!beforeCollapsed && clickRes.ok && selectedAfter >= 2 && !afterCollapsed) {
      implicated = 'not-reproduced';
    } else if (!beforeCollapsed && selectedAfter < 2 && !clearAfterSelect) {
      implicated = 'undetermined-selection-event';
    }

    result.row2 = {
      setup: { hostPlaced: [a1, a2] },
      beforeDistancePx: beforeDistance,
      afterDistancePx: afterDistance,
      clickRes,
      implicated,
      localDoubleToggle,
      before,
      after,
      parentLog,
      frameLog,
    };

    const rects = await measurePlotRects(page, frameB);
    const hostPlot = rects.host && rects.host.plotRect;
    const iframePlot = rects.iframe && (rects.iframe.globalPlotRect || rects.iframe.plotRect);
    const delta = hostPlot && iframePlot ? {
      width: Math.round((hostPlot.width - iframePlot.width) * 100) / 100,
      height: Math.round((hostPlot.height - iframePlot.height) * 100) / 100,
      left: Math.round((hostPlot.left - iframePlot.left) * 100) / 100,
      top: Math.round((hostPlot.top - iframePlot.top) * 100) / 100,
    } : null;
    const violates = delta && (Math.abs(delta.width) > 2 || Math.abs(delta.height) > 2)
      ? (Math.abs(delta.width) > 2 || Math.abs(delta.height) > 2 ? 'host-vs-iframe-plot-size-mismatch' : 'none')
      : 'none-measured';
    result.row11 = { rects, delta, violates };

    await boot.close();
  } catch (e) {
    result.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}

run();
