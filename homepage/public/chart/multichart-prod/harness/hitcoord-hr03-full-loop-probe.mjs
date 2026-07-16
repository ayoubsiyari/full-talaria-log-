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
} from './react-parity-lib.mjs';
import { placeTool, chartTarget } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  const results = {};
  for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
    if (label === 'panelB') {
      const hostFrame = chartTarget(page, 'A');
      if (hostFrame) {
        await hostFrame.evaluate(() => {
          const dm = window.chart && window.chart.drawingManager;
          if (dm && typeof dm.deselectAll === 'function') dm.deselectAll();
        });
      }
    }
    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    await focusReactPanel(page, pid);
    await disarmDrawTool(page, pid);
    await singleClickDrawing(page, pid, first.id);
    await waitForReactSelection(page, pid, [first.id]);
    const frame = chartTarget(page, pid);
    const beforeCtrl = frame ? await frame.evaluate(() => ({
      sel: (window.chart?.drawingManager?.selectedDrawings || []).map((d) => d && d.id),
      drawings: (window.chart?.drawingManager?.drawings || []).map((d) => d && d.id),
    })) : null;
    await ctrlClickDrawing(page, pid, second.id);
    const internal = frame ? await frame.evaluate((ids) => {
      const dm = window.chart && window.chart.drawingManager;
      const sel = (dm && dm.selectedDrawings || []).map((d) => d && d.id);
      const vis = (dm && dm.drawings || []).filter((d) => d && d.selected).map((d) => d.id);
      return {
        selectedDrawings: sel,
        visuallySelected: vis,
        suppress: dm && dm._suppressNextIframeCtrlSelectToggle,
        dedupeOn: typeof window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1 === 'undefined',
        embed: typeof isMultichartIframeEmbed === 'function' ? isMultichartIframeEmbed() : null,
        want: ids,
      };
    }, [first.id, second.id]) : null;
    const immediate = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
    await waitForReactSelection(page, pid, [first.id, second.id]);
    const selFirst = await isDrawingSelected(page, pid, first.id);
    const selSecond = await isDrawingSelected(page, pid, second.id);
    results[label] = { selFirst, selSecond, immediate, beforeCtrl, internal, first: first.id, second: second.id };
  }
  console.log(JSON.stringify(results, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
