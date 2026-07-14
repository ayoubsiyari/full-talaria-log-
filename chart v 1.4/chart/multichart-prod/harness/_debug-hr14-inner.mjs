import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints } from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';
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
const frame = panelFrameMap(page)['B'];

// Simulate Ctrl+drag INSIDE iframe document
const result = await frame.evaluate(() => {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return { ok: false, reason: 'no canvas' };
  const r = canvas.getBoundingClientRect();
  const x1 = r.left + r.width * 0.18;
  const y1 = r.top + r.height * 0.22;
  const x2 = r.left + r.width * 0.72;
  const y2 = r.top + r.height * 0.78;
  const mk = (type, x, y) => {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      ctrlKey: true,
      button: 0,
      buttons: type === 'mousedown' ? 1 : (type === 'mouseup' ? 0 : 1),
    });
    canvas.dispatchEvent(ev);
    document.dispatchEvent(ev);
  };
  mk('mousedown', x1, y1);
  mk('mousemove', x2, y2);
  const during = window.chart?.ctrlMarqueeSelect;
  const w = during ? Math.abs(during.endX - during.startX) : 0;
  const h = during ? Math.abs(during.endY - during.startY) : 0;
  mk('mouseup', x2, y2);
  const sel = window.chart?.drawingManager?.selectedDrawings?.map((d) => d.id) || [];
  return {
    ok: true,
    during: { active: !!during?.active, w, h },
    selected: sel,
    dragType: window.chart?.drag?.type,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
await stack.close();
