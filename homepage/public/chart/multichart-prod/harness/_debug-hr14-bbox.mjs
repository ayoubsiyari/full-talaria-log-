import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints } from './react-parity-lib.mjs';
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
const first = await placeTool(page, 'B', 'trendline', pts1);
const second = await placeTool(page, 'B', 'trendline', pts2);

const diag = await frameB.evaluate((ids) => {
  const dm = window.chart.drawingManager;
  return ids.map((id) => {
    const d = dm.drawings.find((x) => String(x.id) === String(id));
    const node = d && d.group && d.group.node();
    let bb = null;
    try { bb = node && node.getBBox ? node.getBBox() : null; } catch (e) { bb = { err: String(e) }; }
    const cr = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    return {
      id,
      hasGroup: !!d?.group,
      hasNode: !!node,
      bb,
      cr,
      points: d?.points,
      x1: d?.x1, y1: d?.y1, x2: d?.x2, y2: d?.y2,
    };
  });
}, [first.id, second.id]);
console.log(JSON.stringify(diag, null, 2));

await browser.close();
await stack.close();
