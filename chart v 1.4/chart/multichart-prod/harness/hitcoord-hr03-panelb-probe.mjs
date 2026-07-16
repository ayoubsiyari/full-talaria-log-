import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  drawingHitLocalPoint,
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
  const pid = 'B';
  const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
  const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
  const first = await placeTool(page, pid, 'trendline', pts1);
  const second = await placeTool(page, pid, 'trendline', pts2);
  await focusReactPanel(page, pid);
  await disarmDrawTool(page, pid);
  const hit1 = await drawingHitLocalPoint(page, pid, first.id);
  const hit2 = await drawingHitLocalPoint(page, pid, second.id);
  const frame = chartTarget(page, pid);
  await frame.evaluate(() => {
    window.__md = [];
    const fn = (e) => window.__md.push({
      type: e.type, ctrl: e.ctrlKey, tag: e.target?.tagName, cx: e.clientX, cy: e.clientY,
    });
    document.addEventListener('mousedown', fn, true);
  });
  const click1 = await singleClickDrawing(page, pid, first.id);
  await waitForReactSelection(page, pid, [first.id]);
  const before = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  const ctrl = await ctrlClickDrawing(page, pid, second.id);
  const md = await frame.evaluate(() => window.__md.filter((e) => e.type === 'mousedown'));
  const after = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  console.log(JSON.stringify({ hit1, hit2, click1, before, ctrl, md, after }, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
