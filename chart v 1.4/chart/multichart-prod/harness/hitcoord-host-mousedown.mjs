import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  seedDrawing,
  drawingHitLocalPoint,
  localToPagePoint,
  waitForPanelSettle,
} from './react-parity-lib.mjs';
import { chartTarget } from './interactive-helpers.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  const pid = 'A';
  const tool = await seedDrawing(page, pid, 'rectangle');
  const hit = await drawingHitLocalPoint(page, pid, tool.id);
  const pagePt = await localToPagePoint(page, pid, hit.x, hit.y);
  const frame = chartTarget(page, pid);
  await frame.evaluate(() => {
    const l = document.getElementById('backtestingLoader');
    if (l) {
      l.style.display = 'none';
      l.style.pointerEvents = 'none';
      l.classList.remove('active');
    }
  });
  const stackInfo = await page.evaluate((x, y) => {
    const els = [];
    let el = document.elementFromPoint(x, y);
    let n = 0;
    while (el && n < 8) {
      els.push({
        tag: el.tagName,
        id: el.id || '',
        cls: (el.className || '').toString().slice(0, 60),
        pe: getComputedStyle(el).pointerEvents,
      });
      el = el.parentElement;
      n += 1;
    }
    const canvas = document.getElementById('chartCanvas');
    const wrap = document.getElementById('chartWrapper');
    const cr = canvas?.getBoundingClientRect();
    const wr = wrap?.getBoundingClientRect();
    return {
      els,
      cr: cr ? { l: cr.left, t: cr.top, w: cr.width, h: cr.height } : null,
      wr: wr ? { l: wr.left, t: wr.top, w: wr.width, h: wr.height } : null,
      x,
      y,
    };
  }, pagePt.x, pagePt.y);
  await frame.evaluate(() => {
    window.__md = [];
    const fn = (e) => window.__md.push({
      tag: e.target?.tagName,
      id: e.target?.id,
      cx: e.clientX,
      cy: e.clientY,
    });
    document.addEventListener('mousedown', fn, true);
    const canvas = document.getElementById('chartCanvas');
    if (canvas) {
      canvas.addEventListener('mousedown', (e) => {
        window.__md.push({ canvas: true, cx: e.clientX, cy: e.clientY });
      }, true);
    }
  });
  await page.mouse.click(pagePt.x, pagePt.y, { delay: 30 });
  await waitForPanelSettle(page, pid);
  const md = await frame.evaluate(() => window.__md);
  const store2 = await frame.evaluate((id, lx, ly) => {
    const dm = window.chart?.drawingManager;
    const inSel = (dm?.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    const hits = dm?.findDrawingsAtPoint(lx, ly);
    return { inSel, hits: (hits || []).map((d) => d?.id) };
  }, tool.id, hit.layoutX, hit.layoutY);
  console.log(JSON.stringify({ hit, pagePt, stackInfo, md, store2 }, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
