import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  drawingHitLocalPoint,
  localToPagePoint,
  singleClickDrawing,
  ctrlClickDrawing,
  focusReactPanel,
  disarmDrawTool,
  isDrawingSelected,
  waitForReactSelection,
  dismissClickBlockers,
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
  const hit1 = await drawingHitLocalPoint(page, pid, first.id);
  const hit2 = await drawingHitLocalPoint(page, pid, second.id);
  await singleClickDrawing(page, pid, first.id);
  await waitForReactSelection(page, pid, [first.id]);
  const after1 = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  const ctrl = await ctrlClickDrawing(page, pid, second.id);
  await waitForReactSelection(page, pid, [first.id, second.id], 3000).catch(() => {});
  const after2 = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
  const frame = chartTarget(page, pid);
  const overlap = await frame.evaluate((id1, id2) => {
    const dm = window.chart?.drawingManager;
    const d1 = dm?.drawings?.find((d) => d.id === id1);
    const d2 = dm?.drawings?.find((d) => d.id === id2);
    return { d1Type: d1?.type, d2Type: d2?.type, sel: (dm?.selectedDrawings || []).map((d) => d.id) };
  }, first.id, second.id);
  console.log(JSON.stringify({ hit1, hit2, after1, ctrl, after2, overlap }, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
