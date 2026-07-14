import { ensureBuiltReactStack, installBuiltProductBoot, launchBrowser, waitForReactMultichartReady, focusReactPanel, reactDefaultTrendlinePoints, doubleClickDrawing, readParentReactSettings } from './react-parity-lib.mjs';
import { placeTool } from './interactive-helpers.mjs';
import { panelFrameMap } from './harness-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser();
const page = await browser.newPage();
await installBuiltProductBoot(page);
await page.goto(stack.url, { waitUntil: 'networkidle2', timeout: 180000 });
await waitForReactMultichartReady(page);
const frameB = panelFrameMap(page).B;

const embed = await frameB.evaluate(() => ({
  embed: window.__talariaV9PanelEmbed,
  parentGrid: (() => { try { return !!window.parent.__multichartGrid; } catch (e) { return 'err'; } })(),
  panelId: new URLSearchParams(location.search).get('panelId'),
}));
console.log('embed state', embed);

await focusReactPanel(page, 'B');
const pts = await reactDefaultTrendlinePoints(page, 'B');
const placed = await placeTool(page, 'B', 'trendline', pts);
console.log('placed', placed.id);

const pre = await frameB.evaluate(() => {
  const dm = window.chart.drawingManager;
  return { selected: (dm.selectedDrawings || []).map(d => d.id), embed: window.__talariaV9PanelEmbed };
});
console.log('pre dbl', pre);

const dbl = await doubleClickDrawing(page, 'B', placed.id);
console.log('dbl', dbl);

const post = await readParentReactSettings(page);
console.log('settings immediate', post);

const postIframe = await frameB.evaluate(() => {
  let parentCalled = false;
  try {
    parentCalled = typeof window.parent.__multichartGrid?.openDrawingSettingsForPanel === 'function';
  } catch (_) {}
  return { parentCalled, embed: window.__talariaV9PanelEmbed };
});
console.log('post iframe', postIframe);

await browser.close();
await stack.close();
