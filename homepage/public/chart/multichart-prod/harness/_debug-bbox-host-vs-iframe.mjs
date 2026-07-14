import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, reactDefaultTrendlinePoints } from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';
import { panelFrameMap } from './harness-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser();
const page = await browser.newPage();
await installBuiltProductBoot(page);
await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
await waitForReactMultichartReady(page);

for (const pid of ['A', 'B']) {
  const frame = panelFrameMap(page)[pid] || page;
  const pts = await reactDefaultTrendlinePoints(page, pid);
  const placed = await placeTool(page, pid, 'trendline', pts);
  const diag = await frame.evaluate((id) => {
    const dm = window.chart.drawingManager;
    const d = dm.drawings.find((x) => String(x.id) === String(id));
    const node = d?.group?.node?.();
    let bb = null;
    try { bb = node?.getBBox?.(); } catch (e) { bb = { err: String(e) }; }
    const line = node?.querySelector?.('line');
    let lineAttrs = null;
    if (line) lineAttrs = { x1: line.getAttribute('x1'), y1: line.getAttribute('y1'), x2: line.getAttribute('x2'), y2: line.getAttribute('y2') };
    return { panel: new URLSearchParams(location.search).get('panelId') || 'A', bb, lineAttrs, points: d?.points };
  }, placed.id);
  console.log(pid, diag);
}

await browser.close();
await stack.close();
