import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  ctrlClickDrawing,
  singleClickDrawing,
  focusReactPanel,
  disarmDrawTool,
  isDrawingSelected,
  waitForReactSelection,
  drawingHitLocalPoint,
} from './react-parity-lib.mjs';
import { placeTool, chartTarget } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  const results = {};
  for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    await focusReactPanel(page, pid);
    await disarmDrawTool(page, pid);
    await singleClickDrawing(page, pid, first.id);
    await waitForReactSelection(page, pid, [first.id]);
    const frame = chartTarget(page, pid);
    const hit2 = await drawingHitLocalPoint(page, pid, second.id);
    const beforeCtrl = frame ? await frame.evaluate(() => ({
      sel: (window.chart?.drawingManager?.selectedDrawings || []).map((d) => d && d.id),
      drawings: (window.chart?.drawingManager?.drawings || []).map((d) => d && d.id),
    })) : null;
    await frame.evaluate(() => {
      const dm = window.chart && window.chart.drawingManager;
      if (!dm) return;
      const orig = dm.selectDrawing.bind(dm);
      dm.__selLog = [];
      dm.selectDrawing = function (drawing, add, opts) {
        dm.__selLog.push({
          id: drawing && drawing.id,
          add,
          suppress: dm._suppressNextIframeCtrlSelectToggle,
          stack: (new Error()).stack.split('\n').slice(1, 4).join(' | '),
        });
        return orig(drawing, add, opts);
      };
    });
    await ctrlClickDrawing(page, pid, second.id);
    const internal = frame ? await frame.evaluate((wantSecond) => {
      const dm = window.chart && window.chart.drawingManager;
      const geo = dm && typeof dm.findDrawingsAtPoint === 'function'
        ? (dm.findDrawingsAtPoint(wantSecond.x, wantSecond.y, { includeVolumeProfileBodyHit: true }) || []).map((d) => d && d.id)
        : [];
      return {
        selectedDrawings: (dm?.selectedDrawings || []).map((d) => d && d.id),
        drawings: (dm?.drawings || []).map((d) => d && d.id),
        selLog: dm?.__selLog || [],
        geoHits: geo,
        suppress: dm?._suppressNextIframeCtrlSelectToggle,
        embed: typeof isMultichartIframeEmbed === 'function' ? isMultichartIframeEmbed() : null,
      };
    }, hit2) : null;
    const selFirst = await isDrawingSelected(page, pid, first.id);
    const selSecond = await isDrawingSelected(page, pid, second.id);
    results[label] = { selFirst, selSecond, beforeCtrl, internal, first: first.id, second: second.id, hit2 };
  }
  console.log(JSON.stringify(results, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
