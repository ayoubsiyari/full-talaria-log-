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
import { placeTool } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
let fails = 0;
try {
  for (let i = 0; i < 20; i++) {
    const boot = await bootReactMultichart(browser, stack, {});
    const { page } = boot;
    const pid = 'A';
    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    await focusReactPanel(page, pid);
    await disarmDrawTool(page, pid);
    await singleClickDrawing(page, pid, first.id);
    await waitForReactSelection(page, pid, [first.id]);
    await ctrlClickDrawing(page, pid, second.id);
    const f = await isDrawingSelected(page, pid, first.id);
    const s = await isDrawingSelected(page, pid, second.id);
    if (!f || !s) {
      fails++;
      console.log(`run ${i + 1} FAIL f=${f} s=${s}`);
    }
    await boot.close();
  }
  console.log(`host-only 20 runs: ${20 - fails}/20 pass, ${fails} fail`);
} finally {
  await browser.close();
  await stack.close();
}
