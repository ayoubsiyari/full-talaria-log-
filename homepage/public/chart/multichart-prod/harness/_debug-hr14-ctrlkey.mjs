import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints, reactChartCanvasPagePoint } from './react-parity-lib.mjs';
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

// Test A: page.keyboard + page.mouse
await page.keyboard.down('Control');
const p1 = await reactChartCanvasPagePoint(page, 'B', 0.12, 0.18);
const p2 = await reactChartCanvasPagePoint(page, 'B', 0.78, 0.82);
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await page.mouse.move(p2.x, p2.y, { steps: 5 });
const a = await frameB.evaluate(() => {
  const m = window.chart.ctrlMarqueeSelect;
  return { active: m.active, w: Math.abs(m.endX - m.startX), h: Math.abs(m.endY - m.startY) };
});
await page.mouse.up();
await page.keyboard.up('Control');
console.log('page.keyboard+mouse', a);

// Test B: synthetic in-iframe events with ctrlKey
const b = await frameB.evaluate(() => {
  const ch = window.chart;
  const canvas = ch.canvas;
  const rect = canvas.getBoundingClientRect();
  const x1 = rect.left + rect.width * 0.12;
  const y1 = rect.top + rect.height * 0.18;
  const x2 = rect.left + rect.width * 0.78;
  const y2 = rect.top + rect.height * 0.82;
  const mk = (type, x, y) => new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, ctrlKey: true,
  });
  canvas.dispatchEvent(mk('mousedown', x1, y1));
  document.dispatchEvent(mk('mousemove', x2, y2));
  const m = ch.ctrlMarqueeSelect;
  const snap = { active: m.active, w: Math.abs(m.endX - m.startX), h: Math.abs(m.endY - m.startY) };
  document.dispatchEvent(mk('mouseup', x2, y2));
  const sel = (ch.drawingManager.selectedDrawings || []).map(d => d.id);
  return { snap, sel };
});
console.log('iframe synthetic', b);

await browser.close();
await stack.close();
