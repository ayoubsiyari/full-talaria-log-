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

const diag = await frameB.evaluate(async () => {
  const ch = window.chart;
  const dm = ch.drawingManager;
  const wrap = ch.canvas && ch.canvas.parentElement;
  const rect = ch.canvas.getBoundingClientRect();
  const mx = rect.width * 0.12;
  const my = rect.height * 0.18;
  const hits = dm.findDrawingsAtPoint(mx, my, { includeVolumeProfileBodyHit: true });
  const nearSel = dm._isPointNearAnySelectedDrawing ? dm._isPointNearAnySelectedDrawing(mx, my) : null;
  const selAt = dm._getSelectedDrawingsAtPoint ? dm._getSelectedDrawingsAtPoint(mx, my) : null;
  const mode = ch.detectCursorMode ? ch.detectCursorMode(mx, my) : 'n/a';
  return {
    selected: (dm.selectedDrawings || []).map(d => d.id),
    hits: hits.map(d => d.id),
    nearSel,
    selAt: selAt && selAt.map(d => d.id),
    mode,
    cursorMode: dm._isCursorSelectMode ? dm._isCursorSelectMode() : null,
    ctrlFix: !window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX,
    embed: window.__talariaV9PanelEmbed,
  };
});
console.log('diag', diag);

const p1 = await reactChartCanvasPagePoint(page, 'B', 0.12, 0.18);
await page.keyboard.down('Control');
await page.mouse.move(p1.x, p1.y);
await page.mouse.down();
await new Promise(r => setTimeout(r, 50));
const during = await frameB.evaluate(() => {
  const m = window.chart.ctrlMarqueeSelect;
  return { active: m.active, startX: m.startX, startY: m.startY, drag: window.chart.drag };
});
console.log('during mousedown', during);
await page.mouse.up();
await page.keyboard.up('Control');

await browser.close();
await stack.close();
