import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  reactDefaultTrendlinePoints,
  drawingHitLocalPoint,
  singleClickDrawing,
  focusReactPanel,
  disarmDrawTool,
  dismissClickBlockers,
  isDrawingSelected,
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
  const frame = chartTarget(page, pid);
  const runClick = async (label, withCtrl) => {
    await dismissClickBlockers(page, pid);
    await frame.evaluate(() => {
      window.__md = [];
      document.addEventListener('mousedown', (e) => {
        window.__md.push({ ctrl: e.ctrlKey, tag: e.target?.tagName, cx: e.clientX, cy: e.clientY });
      }, true);
    });
    if (withCtrl) await page.keyboard.down('Control');
    await page.mouse.click(hit2.x, hit2.y, { delay: 30 });
    if (withCtrl) await page.keyboard.up('Control');
    const md = await frame.evaluate(() => window.__md);
    const el = await page.evaluate((x, y) => {
      const e = document.elementFromPoint(x, y);
      return { tag: e?.tagName, id: e?.id };
    }, hit2.x, hit2.y);
    const sel = {
      f: await isDrawingSelected(page, pid, first.id),
      s: await isDrawingSelected(page, pid, second.id),
    };
    console.log(label, JSON.stringify({ hit2: { x: hit2.x, y: hit2.y }, el, md, sel }));
  };
  await runClick('plain-second', false);
  await singleClickDrawing(page, pid, first.id);
  await runClick('ctrl-second', true);
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
