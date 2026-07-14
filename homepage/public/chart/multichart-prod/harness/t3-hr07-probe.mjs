#!/usr/bin/env node
/** One-off H-R07 diagnostic — dumps host/B selection state after cross-panel select. */
import {
  ensureBuiltReactStack,
  launchBrowser,
  runWithReact,
  makeChecks,
  focusReactPanel,
  disarmDrawTool,
  singleClickDrawing,
  waitForReactSelection,
  readSelectionChrome,
  reactDefaultTrendlinePoints,
  reactDefaultRectanglePoints,
} from './react-parity-lib.mjs';
import {
  placeTool,
  readInteractiveState,
} from './interactive-helpers.mjs';

async function main() {
  const stack = await ensureBuiltReactStack();
  const browser = await launchBrowser({ headful: false });
  try {
    const ctx = { browser, stack, migrationOn: false };
    await runWithReact(ctx, async (boot) => {
      const { page } = boot;
      const hostTool = await placeTool(page, 'A', 'trendline', await reactDefaultTrendlinePoints(page, 'A', 0));
      await disarmDrawTool(page, 'A');
      await singleClickDrawing(page, 'A', hostTool.id);
      await waitForReactSelection(page, 'A', [hostTool.id]);

      const panelTool = await placeTool(page, 'B', 'rectangle', await reactDefaultRectanglePoints(page, 'B', 0));
      await focusReactPanel(page, 'B');
      await disarmDrawTool(page, 'B');
      await singleClickDrawing(page, 'B', panelTool.id);
      await waitForReactSelection(page, 'B', [panelTool.id]);

      await page.evaluate(() => {
        const dm = window.chart && window.chart.drawingManager;
        if (!dm) return;
        (dm.drawings || []).forEach((d) => {
          if (!d) return;
          if (typeof d.deselect === 'function') d.deselect();
          if (typeof dm.renderDrawing === 'function') dm.renderDrawing(d, { skipInteraction: true });
        });
        if (typeof dm.redrawAll === 'function') dm.redrawAll();
        const root = dm.svg && dm.svg.node();
        if (root) {
          root.querySelectorAll('.resize-handle, .resize-handle-group, .custom-handle').forEach((el) => {
            try { el.remove(); } catch (_) {}
          });
        }
        if (window.chart && typeof window.chart.render === 'function') window.chart.render();
      });

      const hostChrome = await readSelectionChrome(page, 'A', hostTool.id);
      const panelChrome = await readSelectionChrome(page, 'B', panelTool.id);
      const host = await readInteractiveState(page, 'A');
      const panel = await readInteractiveState(page, 'B');
      const meta = await page.evaluate((hostId) => {
        const dm = window.chart && window.chart.drawingManager;
        const d = dm && dm.drawings.find((x) => x && String(x.id) === String(hostId));
        const grid = window.__multichartGrid;
        const drawings = (dm && dm.drawings || []).map((x) => {
          let handles = 0;
          try {
            const node = x.group && x.group.node && x.group.node();
            if (node) {
              handles = node.querySelectorAll('.resize-handle, .resize-handle-group circle, .custom-handle').length;
            }
          } catch (_) {}
          return {
            id: x && x.id,
            type: x && x.type,
            selected: !!(x && x.selected),
            handles,
          };
        });
        return {
          focused: grid && grid.getFocusedPanelId ? grid.getFocusedPanelId() : null,
          peerOff: !!window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1,
          hostDmSel: dm ? (dm.selectedDrawings || []).map((x) => x && x.id) : [],
          dSelected: d ? !!d.selected : null,
          guardUntil: window.__v9DrawingSelectionGuardUntil || null,
          now: performance.now(),
          drawings,
        };
      }, hostTool.id);

      console.log(JSON.stringify({
        hostChrome,
        panelChrome,
        host,
        panel,
        meta,
        hostToolId: hostTool.id,
        panelToolId: panelTool.id,
      }, null, 2));
      return makeChecks();
    });
  } finally {
    await browser.close();
    await stack.close();
  }
}

await main();
