import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  drawingHitLocalPoint,
  singleClickDrawing,
  ctrlClickDrawing,
  focusReactPanel,
  disarmDrawTool,
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
  await singleClickDrawing(page, pid, first.id);
  const hit2 = await drawingHitLocalPoint(page, pid, second.id);
  const pagePt = { x: hit2.x, y: hit2.y };
  const frame = chartTarget(page, pid);
  await dismissClickBlockers(page, pid);
  await frame.evaluate(() => {
    window.__md = [];
    document.addEventListener('mousedown', (e) => {
      window.__md.push({
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        tag: e.target?.tagName,
        id: e.target?.id || '',
        cx: e.clientX,
        cy: e.clientY,
      });
    }, true);
  });
  await page.keyboard.down('Control');
  await page.mouse.click(pagePt.x, pagePt.y, { delay: 30 });
  await page.keyboard.up('Control');
  const md = await frame.evaluate(() => window.__md);
  const sel = await frame.evaluate(() => (window.chart?.drawingManager?.selectedDrawings || []).map((d) => d.id));
  const prog = await frame.evaluate((id) => {
    const dm = window.chart?.drawingManager;
    const d = dm?.drawings?.find((x) => x.id === id);
    if (!d) return { ok: false };
    dm.selectDrawing(d, true);
    return { sel: (dm.selectedDrawings || []).map((x) => x.id) };
  }, second.id);
  console.log(JSON.stringify({ pagePt, md, sel, prog }, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
