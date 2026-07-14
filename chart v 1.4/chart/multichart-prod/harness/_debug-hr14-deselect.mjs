import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints, ctrlDragMarquee, waitForPanelSettle } from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';
import { panelFrameMap } from './harness-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser();
const page = await browser.newPage();
await installBuiltProductBoot(page);
await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
await waitForReactMultichartReady(page);
const frameB = panelFrameMap(page).B;

const pts1 = await reactDefaultTrendlinePoints(page, 'B');
const pts2 = pts1.map((p, i) => ({ x: p.x + 40, y: p.y - (i === 0 ? 0.002 : 0.001) }));
await placeTool(page, 'B', 'trendline', pts1);
await placeTool(page, 'B', 'trendline', pts2);
await focusReactPanel(page, 'B');

const before = await frameB.evaluate(() => {
  const dm = window.chart.drawingManager;
  return { selected: (dm.selectedDrawings || []).map(d => d.id) };
});
console.log('before (no deselect)', before);
let drag = await ctrlDragMarquee(page, 'B');
console.log('drag no deselect', drag);

await frameB.evaluate(() => {
  const dm = window.chart.drawingManager;
  if (dm && typeof dm.deselectAll === 'function') dm.deselectAll();
});
await waitForPanelSettle(page, 'B');
drag = await ctrlDragMarquee(page, 'B');
console.log('drag after deselect', drag);
const after = await frameB.evaluate(() => {
  const dm = window.chart.drawingManager;
  return { selected: (dm.selectedDrawings || []).map(d => d.id) };
});
console.log('after deselect drag', after);

await browser.close();
await stack.close();
