import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints, ctrlDragMarquee } from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser();
const page = await browser.newPage();
await installBuiltProductBoot(page);
await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
await waitForReactMultichartReady(page);
const pts1 = await reactDefaultTrendlinePoints(page, 'A');
const pts2 = pts1.map((p, i) => ({ x: p.x + 40, y: p.y - (i === 0 ? 0.002 : 0.001) }));
await placeTool(page, 'A', 'trendline', pts1);
await placeTool(page, 'A', 'trendline', pts2);
await focusReactPanel(page, 'A');
const drag = await ctrlDragMarquee(page, 'A');
console.log(JSON.stringify(drag, null, 2));
await browser.close();
await stack.close();
