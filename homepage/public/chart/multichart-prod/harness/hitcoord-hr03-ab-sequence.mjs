import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  singleClickDrawing,
  ctrlClickDrawing,
  focusReactPanel,
  disarmDrawTool,
  isDrawingSelected,
  waitForReactSelection,
} from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  // Simulate H-R03 order: host first, then panel B
  for (const pid of ['A', 'B']) {
    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    await focusReactPanel(page, pid);
    await disarmDrawTool(page, pid);
    const c1 = await singleClickDrawing(page, pid, first.id);
    await waitForReactSelection(page, pid, [first.id]);
    const before = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
    const c2 = await ctrlClickDrawing(page, pid, second.id);
    const after = { f: await isDrawingSelected(page, pid, first.id), s: await isDrawingSelected(page, pid, second.id) };
    console.log(pid, JSON.stringify({ c1: c1?.ok ? c1 : c1, c2: c2?.ok ? c2 : c2, before, after }));
  }
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
