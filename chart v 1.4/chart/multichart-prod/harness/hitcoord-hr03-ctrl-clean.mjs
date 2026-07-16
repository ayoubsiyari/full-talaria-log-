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
  waitForPanelSettle,
} from './react-parity-lib.mjs';
import { placeTool, chartTarget } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  const pid = 'A';
  const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
  const pts2 = [
    { x: pts1[0].x + 22, y: pts1[0].y - 0.0006 },
    { x: pts1[1].x + 22, y: pts1[1].y - 0.0004 },
  ];
  const first = await placeTool(page, pid, 'trendline', pts1);
  const second = await placeTool(page, pid, 'trendline', pts2);
  await focusReactPanel(page, pid);
  await disarmDrawTool(page, pid);
  const frame = chartTarget(page, pid);
  await frame.evaluate(() => {
    window.__md = [];
    const fn = (e) => window.__md.push({
      type: e.type, ctrl: e.ctrlKey, tag: e.target?.tagName, cx: e.clientX, cy: e.clientY,
    });
    document.addEventListener('mousedown', fn, true);
    document.addEventListener('pointerdown', fn, true);
  });
  await singleClickDrawing(page, pid, first.id);
  await waitForReactSelection(page, pid, [first.id]);
  const before = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  const ctrl = await ctrlClickDrawing(page, pid, second.id);
  await waitForPanelSettle(page, pid);
  const md = await frame.evaluate(() => window.__md.filter((e) => e.type === 'mousedown'));
  const after = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  const selIds = await frame.evaluate(() => (window.chart?.drawingManager?.selectedDrawings || []).map((d) => d.id));
  const pass = after.f && after.s;
  console.log(JSON.stringify({ pass, ctrlClicked: ctrl.clicked, md, before, after, selIds }));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
