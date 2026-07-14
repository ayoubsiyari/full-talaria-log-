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
await focusReactPanel(page, 'B');

const diag = await frameB.evaluate((ids) => {
  const ch = window.chart;
  const dm = ch.drawingManager;
  const canvas = ch.canvas;
  const rect = canvas.getBoundingClientRect();
  const x1 = rect.width * 0.12;
  const y1 = rect.height * 0.18;
  const x2 = rect.width * 0.78;
  const y2 = rect.height * 0.82;
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);
  const info = ids.map((id) => {
    const d = dm.drawings.find((x) => String(x.id) === String(id));
    const inRect = dm.isDrawingInRectangle(d, rx, ry, rw, rh);
    const node = d && d.group && d.group.node();
    const bb = node && node.getBBox ? node.getBBox() : null;
    return { id, inRect, bb };
  });
  const mk = (type, x, y, buttons) => new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window,
    clientX: rect.left + x, clientY: rect.top + y, button: 0,
    buttons: buttons ?? (type === 'mouseup' ? 0 : 1), ctrlKey: true,
  });
  canvas.dispatchEvent(mk('mousedown', x1, y1, 1));
  for (let step = 1; step <= 12; step++) {
    const fx = x1 + ((x2 - x1) * step) / 12;
    const fy = y1 + ((y2 - y1) * step) / 12;
    document.dispatchEvent(mk('mousemove', fx, fy, 1));
  }
  document.dispatchEvent(mk('mouseup', x2, y2, 0));
  return {
    rect: { rx, ry, rw, rh },
    info,
    selected: (dm.selectedDrawings || []).map((d) => d.id),
    marquee: ch.ctrlMarqueeSelect,
  };
}, [first.id, second.id]);
console.log(JSON.stringify(diag, null, 2));

await browser.close();
await stack.close();
