import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints, ctrlDragMarquee } from './react-parity-lib.mjs';
import { placeTool, readInteractiveState } from './interactive-helpers.mjs';
import { panelFrameMap } from './harness-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser();
const page = await browser.newPage();
await installBuiltProductBoot(page);
await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
await waitForReactMultichartReady(page);
const pts1 = await reactDefaultTrendlinePoints(page, 'B');
const pts2 = pts1.map((p, i) => ({ x: p.x + 40, y: p.y - (i === 0 ? 0.002 : 0.001) }));
await placeTool(page, 'B', 'trendline', pts1);
await placeTool(page, 'B', 'trendline', pts2);
await focusReactPanel(page, 'B');
const drag = await ctrlDragMarquee(page, 'B');
const state = await readInteractiveState(page, 'B');
const frame = panelFrameMap(page)['B'];
const diag = await frame.evaluate(() => ({
  embed: window.__talariaV9PanelEmbed,
  tool: window.chart?.tool,
  cursorMode: window.chart?.drawingManager?._isCursorSelectMode?.(),
  marquee: window.chart?.ctrlMarqueeSelect,
  drag: window.chart?.drag,
  tracking: !!window.chart?._ctrlMarqueeDocumentTracking,
  fix: !window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX,
  overlay: !!window.chart?._ctrlMarqueeOverlaySvg,
}));
console.log(JSON.stringify({ drag, selected: state?.selectedIds, diag }, null, 2));
await browser.close();
await stack.close();
