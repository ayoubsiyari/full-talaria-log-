/**
 * hitcoord-diagnostic.mjs — probe drawing hit coords + store after real click
 */
import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  seedDrawing,
  drawingHitLocalPoint,
  localToPagePoint,
  singleClickDrawing,
  readDrawingSelectedInStore,
  waitForPanelSettle,
} from './react-parity-lib.mjs';
import { chartTarget } from './interactive-helpers.mjs';

async function probePanel(boot, panelId) {
  const { page } = boot;
  const tool = await seedDrawing(page, panelId, 'rectangle');
  const hit = await drawingHitLocalPoint(page, panelId, tool.id);
  const pagePt = hit.ok ? await localToPagePoint(page, panelId, hit.x, hit.y) : null;

  const frame = chartTarget(page, panelId);
  const chartState = await frame.evaluate(() => {
    const ch = window.chart;
    return {
      offsetX: ch ? ch.offsetX : null,
      phase1Off: !!window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE,
      lifecycleOff: !!window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2,
      legacyOff: !!window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2,
      dataLen: ch && ch.data ? ch.data.length : 0,
    };
  });

  const onScreen = pagePt ? await page.evaluate((x, y) => {
    const el = document.elementFromPoint(x, y);
    return { ok: !!el, tag: el ? el.tagName : null, id: el && el.id };
  }, pagePt.x, pagePt.y) : null;

  const click = await singleClickDrawing(page, panelId, tool.id);
  await waitForPanelSettle(page, panelId);
  const afterStore = await readDrawingSelectedInStore(page, panelId, tool.id);

  const prog = await frame.evaluate((id) => {
    const dm = window.chart && window.chart.drawingManager;
    const d = dm && dm.drawings.find((x) => x && String(x.id) === String(id));
    if (!d || typeof dm.selectDrawing !== 'function') return { ok: false };
    dm.selectDrawing(d, false);
    const sel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    return { ok: true, selected: sel };
  }, tool.id);

  return { panelId, toolId: tool.id, hit, pagePt, chartState, onScreen, click, afterStore, prog };
}

async function main() {
  const stack = await ensureBuiltReactStack();
  const browser = await launchBrowser({ headful: false });
  try {
    for (const phase1Off of [false, true]) {
      console.log(`\n=== phase1Off=${phase1Off} ===`);
      const boot = await bootReactMultichart(browser, stack, { phase1Off });
      console.log(JSON.stringify(await probePanel(boot, 'A'), null, 2));
      console.log(JSON.stringify(await probePanel(boot, 'B'), null, 2));
      await boot.close();
    }
  } finally {
    await browser.close();
    await stack.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
