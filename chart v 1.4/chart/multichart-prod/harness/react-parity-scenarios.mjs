/**
 * react-parity-scenarios.mjs — T0 step 8b/9 automated MULTICHART-PARITY-CHECKLIST
 * rows against the REAL built-product MultichartGrid (dist-v9 + mcLayout=2v).
 *
 * Step 9: H-R01..H-R09 use real mouse hit-tests on loaded bars + parent V9 bar
 * visibility (not legacy iframe toolbar.visible).
 */

import {
  makeChecks,
  runWithReact,
  focusReactPanel,
  focusReactPanelSoft,
  seedDrawing,
  singleClickDrawing,
  singleClickCanvasBackground,
  doubleClickDrawing,
  ctrlClickDrawing,
  ctrlDragMarquee,
  readSelectionChrome,
  readParentReactSettings,
  waitForParentDrawingSettingsOpen,
  pressEscapeReact,
  awaitParentChromeAfterPanelSelect,
  waitForV9QuickBarReady,
  clickV9QuickBarGear,
  waitForPanelSettle,
  panelFrameMap,
  reactDefaultTrendlinePoints,
  reactDefaultRectanglePoints,
  readIframeToolbarState,
  readReactParityState,
  waitForReactSelection,
  assertReactMenuState,
  deleteSelectedViaKeyboard,
  sleep,
  disarmDrawTool,
  drawingExists,
  isDrawingSelected,
  waitForPanelData,
  waitForReactMultichartReady,
} from './react-parity-lib.mjs';
import {
  chartTarget,
  placeTool,
  readInteractiveState,
  readRenderCount,
  assertCanvasRepainted,
  assertNoGhostAfterDelete,
  readParentSettingsProbe,
  seedChartPanelState,
  readParentTopbarActiveTf,
  readPanelEngineTf,
} from './interactive-helpers.mjs';
import { hostSetTimeframe } from './harness-lib.mjs';

async function runPanelClickRow(page, checks, prefix, panelId, toolType = 'trendline') {
  const label = panelId === 'A' ? 'host' : 'panelB';
  const tool = await seedDrawing(page, panelId, toolType);
  checks.check(`${prefix} setup (${label}): ${toolType} placed on real bars`, tool && tool.id, tool ? tool.id : 'null');
  await focusReactPanel(page, panelId);
  await disarmDrawTool(page, panelId);
  const before = await readReactParityState(page, panelId);
  checks.check(`${prefix} setup (${label}): not selected before click`,
    before && before.selectedIds.length === 0, JSON.stringify(before?.selectedIds));
  const click = await singleClickDrawing(page, panelId, tool.id);
  checks.check(`${prefix} probe (${label}): single click dispatched`, click && click.ok, click?.reason || '');
  const after = await waitForReactSelection(page, panelId, [tool.id]);
  await assertReactMenuState(checks, `${prefix} CORE (${label}): first click selects + V9 quick menu`, {
    selectedIds: [tool.id],
    toolbarVisible: true,
  }, after, page, panelId);
  return { tool, label, panelId };
}

// ── H-R01 — Row 1: single-click select (host + panel B) ─────────────────
async function hR01(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    checks.check('H-R01 L1: build id on host + panel B iframe', boot.buildIds.ok,
      JSON.stringify(boot.buildIds));
    checks.check('H-R01 L1: iframe boundary (no parent __multichartGrid in panel B)',
      boot.boundary && boot.boundary.ok, JSON.stringify(boot.boundary));
    checks.check('H-R01 L1: real bar data in panel B iframe', boot.iframeBars > 50,
      `dataLen=${boot.iframeBars}`);

    await runPanelClickRow(page, checks, 'H-R01', 'A');
    await runPanelClickRow(page, checks, 'H-R01', 'B');
    return checks;
  });
}

// ── H-R02 — Row 2: blue selection/preview border (host + panel B) ───────
async function hR02(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const tool = await seedDrawing(page, pid, 'rectangle');
      checks.check(`H-R02 setup (${label}): rectangle placed`, tool && tool.id, tool ? tool.id : 'null');
      let storeSel = false;
      for (let attempt = 0; attempt < 2 && !storeSel; attempt += 1) {
        if (attempt > 0) await waitForPanelSettle(page, pid, 2000);
        if (ctx.hr02ActuationMiss) {
          await singleClickCanvasBackground(page, pid);
        } else {
          await singleClickDrawing(page, pid, tool.id);
        }
        await waitForReactSelection(page, pid, [tool.id], 10000);
        await waitForPanelSettle(page, pid, 3000);
        storeSel = await isDrawingSelected(page, pid, tool.id);
      }
      const chrome = await readSelectionChrome(page, pid, tool.id);
      checks.check(`H-R02 CORE (${label}): drawing selected in engine store`,
        storeSel,
        JSON.stringify(chrome));
      checks.check(`H-R02 CORE (${label}): selection chrome visible when store-selected`,
        !storeSel || (chrome && chrome.ok && chrome.hasBlueBorder),
        JSON.stringify(chrome));
    }
    return checks;
  });
}

// ── H-R03 — Row 3: Ctrl-click multi-select (host + panel B) ─────────────
async function hR03(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
      const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
      const first = await placeTool(page, pid, 'trendline', pts1);
      const second = await placeTool(page, pid, 'trendline', pts2);
      checks.check(`H-R03 setup (${label}): two trendlines placed`,
        first && first.id && second && second.id, `${first?.id},${second?.id}`);
      await focusReactPanel(page, pid);
      await disarmDrawTool(page, pid);
      await singleClickDrawing(page, pid, first.id);
      await waitForReactSelection(page, pid, [first.id]);
      await ctrlClickDrawing(page, pid, second.id);
      await waitForReactSelection(page, pid, [first.id, second.id]);
      await waitForPanelSettle(page, pid);
      const selFirst = await isDrawingSelected(page, pid, first.id);
      const selSecond = await isDrawingSelected(page, pid, second.id);
      checks.check(`H-R03 CORE (${label}): Ctrl-select keeps both (no double-toggle)`,
        selFirst && selSecond,
        `first=${selFirst} second=${selSecond}`);
    }
    return checks;
  });
}

// ── H-R04 — Row 4: settings open and stay (host + panel B) ──────────────
async function hR04(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const tool = await seedDrawing(page, pid, 'rectangle');
      await disarmDrawTool(page, pid);
      await singleClickDrawing(page, pid, tool.id);
      await waitForReactSelection(page, pid, [tool.id]);
      await waitForV9QuickBarReady(page, tool.id, pid === 'B' ? 8000 : 4000);
      let dbl = await doubleClickDrawing(page, pid, tool.id);
      checks.check(`H-R04 probe (${label}): double-click dispatched`, dbl && dbl.ok, dbl?.reason || '');
      let settingsWait = await waitForParentDrawingSettingsOpen(page, pid === 'B' ? 8000 : 5000);
      if (!settingsWait.ok && pid === 'B') {
        await sleep(500);
        await waitForPanelSettle(page, pid);
        dbl = await doubleClickDrawing(page, pid, tool.id);
        settingsWait = await waitForParentDrawingSettingsOpen(page, 8000);
      }
      checks.check(`H-R04 CORE (${label}): settings open after real dbl-click`,
        settingsWait.ok && settingsWait.settings && !settingsWait.settings.quickBarShellOnly
          && settingsWait.settings.hasStyleSection,
        JSON.stringify(settingsWait.settings));
      await pressEscapeReact(page, pid);
    }
    return checks;
  });
}

// ── H-R05 — Row 5: Esc closes settings + deselects (host + panel B) ───
async function hR05(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const tool = await seedDrawing(page, pid, 'rectangle');
      await singleClickDrawing(page, pid, tool.id);
      await waitForReactSelection(page, pid, [tool.id]);
      await doubleClickDrawing(page, pid, tool.id);
      const settingsBefore = await waitForParentDrawingSettingsOpen(page, 5000);
      checks.check(`H-R05 setup (${label}): settings open before Esc`,
        settingsBefore.ok, JSON.stringify(settingsBefore.settings));
      await pressEscapeReact(page, pid);
      const after = await readReactParityState(page, pid);
      const parent = await readParentReactSettings(page);
      const deselected = !(await isDrawingSelected(page, pid, tool.id));
      checks.check(`H-R05 CORE (${label}): Esc deselects drawing in store`,
        deselected, JSON.stringify(after?.selectedIds));
      checks.check(`H-R05 CORE (${label}): Esc closes settings surfaces`,
        !parent.open && !parent.hasStyleSection,
        `parentOpen=${parent.open} hasStyle=${parent.hasStyleSection}`);
    }
    return checks;
  });
}

// ── H-R06 — Row 6: delete repaints without ghost (host + panel B) ───────
async function hR06(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const tool = await seedDrawing(page, pid, 'rectangle');
      await disarmDrawTool(page, pid);
      await singleClickDrawing(page, pid, tool.id);
      await waitForReactSelection(page, pid, [tool.id]);
      const rendersBefore = await readRenderCount(page, pid);
      const delRes = await deleteSelectedViaKeyboard(page, pid);
      checks.check(`H-R06 probe (${label}): Delete key dispatched`, delRes && delRes.ok, delRes?.reason || '');
      await waitForPanelSettle(page, pid);
      const removed = !(await drawingExists(page, pid, tool.id));
      const after = await readReactParityState(page, pid);
      const rendersAfter = await readRenderCount(page, pid);
      checks.check(`H-R06 CORE (${label}): placed drawing removed from store`,
        removed, `id=${tool.id} stillExists=${!removed} count=${after?.drawingCount}`);
      assertCanvasRepainted(checks, `H-R06 CORE (${label}): delete schedules repaint`, rendersBefore, rendersAfter);
      assertNoGhostAfterDelete(checks, `H-R06 CORE (${label}): no ghost artifacts`, tool, after);
    }
    return checks;
  });
}

// ── H-R07 — Row 7: peer isolation (panel B select does not orphan host UI) ─
async function hR07(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    const hostTool = await placeTool(page, 'A', 'trendline', await reactDefaultTrendlinePoints(page, 'A', 0));
    checks.check('H-R07 setup: host trendline placed', hostTool && hostTool.id, hostTool ? hostTool.id : 'null');
    const panelTool = await placeTool(page, 'B', 'rectangle', await reactDefaultRectanglePoints(page, 'B', 0));
    checks.check('H-R07 setup: panel-B rectangle placed', panelTool && panelTool.id, panelTool ? panelTool.id : 'null');
    await disarmDrawTool(page, 'A');
    await singleClickDrawing(page, 'A', hostTool.id);
    await waitForReactSelection(page, 'A', [hostTool.id]);
    await focusReactPanel(page, 'B');
    await disarmDrawTool(page, 'B');
    await singleClickDrawing(page, 'B', panelTool.id);
    await waitForReactSelection(page, 'B', [panelTool.id]);

    const hostSel = await isDrawingSelected(page, 'A', hostTool.id);
    const panelSel = await isDrawingSelected(page, 'B', panelTool.id);
    const host = await readReactParityState(page, 'A');
    const panel = await readReactParityState(page, 'B');
    checks.check(
      'H-R07 CORE: exactly one selected drawing globally after cross-panel select',
      !hostSel && panelSel,
      `A.selected=${hostSel} B.selected=${panelSel}`,
    );
    checks.check(
      'H-R07 CORE: host quick menu cleared when panel B owns selection',
      !host?.toolbarVisible && !host?.v9QuickBarVisible,
      `A.toolbarVisible=${host?.toolbarVisible} v9=${host?.v9QuickBarVisible}`,
    );
    return checks;
  });
}

// ── H-R08 — Row 8: Ctrl+drag marquee (host + panel B) ───────────────────
async function hR08(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
      const pts2 = [
        { x: pts1[0].x + 20, y: pts1[0].y - 0.0005 },
        { x: pts1[1].x + 20, y: pts1[1].y - 0.0003 },
      ];
      const t1 = await placeTool(page, pid, 'trendline', pts1);
      const t2 = await placeTool(page, pid, 'trendline', pts2);
      checks.check(`H-R08 setup (${label}): two trendlines placed`, t1 && t1.id && t2 && t2.id, `${t1?.id},${t2?.id}`);
      await focusReactPanel(page, pid);
      const frame = pid === 'A' ? page : panelFrameMap(page)[pid];
      await frame.evaluate(() => {
        try {
          const dm = window.chart && window.chart.drawingManager;
          if (dm && typeof dm.deselectAll === 'function') dm.deselectAll();
        } catch (_) { /* ignore */ }
      });
      await waitForPanelSettle(page, pid);
      const drag = await ctrlDragMarquee(page, pid);
      checks.check(`H-R08 probe (${label}): Ctrl+drag dispatched`, drag && drag.ok, drag?.reason || '');
      checks.check(`H-R08 CORE (${label}): blue marquee border draws during Ctrl+drag`,
        drag && drag.during && drag.during.active && drag.during.w > 8 && drag.during.h > 8,
        JSON.stringify(drag?.during));
      const after = await waitForReactSelection(page, pid, [t1.id, t2.id], 4000);
      const sel1 = await isDrawingSelected(page, pid, t1.id);
      const sel2 = await isDrawingSelected(page, pid, t2.id);
      checks.check(`H-R08 CORE (${label}): marquee multi-selects enclosed tools`,
        sel1 && sel2,
        `t1=${sel1} t2=${sel2} dm.selected=${JSON.stringify(after?.selectedIds)}`);
    }
    return checks;
  });
}

// ── H-R09 — Row 9: single→double-click chain + Esc (host + panel B) ───
async function hR09(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (const [label, pid] of [['host', 'A'], ['panelB', 'B']]) {
      const tool = await seedDrawing(page, pid, 'trendline');
      await disarmDrawTool(page, pid);
      const click1 = await singleClickDrawing(page, pid, tool.id);
      checks.check(`H-R09 probe (${label}): single click`, click1 && click1.ok, click1?.reason || '');
      const afterSingle = await waitForReactSelection(page, pid, [tool.id]);
      await assertReactMenuState(checks, `H-R09 CORE (${label}): single click selects + quick menu`, {
        selectedIds: [tool.id],
        toolbarVisible: true,
      }, afterSingle, page, pid);

      const dbl = await doubleClickDrawing(page, pid, tool.id);
      checks.check(`H-R09 probe (${label}): double click`, dbl && dbl.ok, dbl?.reason || '');
      const settingsWait = await waitForParentDrawingSettingsOpen(page, 5000);
      checks.check(`H-R09 CORE (${label}): double click opens real settings`,
        settingsWait.ok && settingsWait.settings && !settingsWait.settings.quickBarShellOnly
          && settingsWait.settings.hasStyleSection,
        JSON.stringify(settingsWait.settings));

      await pressEscapeReact(page, pid);
      const afterEsc = await readReactParityState(page, pid);
      const parent = await readParentReactSettings(page);
      const deselected = !(await isDrawingSelected(page, pid, tool.id));
      checks.check(`H-R09 CORE (${label}): Esc deselects after chain (store)`,
        deselected, JSON.stringify(afterEsc?.selectedIds));
      checks.check(`H-R09 CORE (${label}): Esc closes settings after chain`,
        !parent.open && !parent.hasStyleSection,
        `parentOpen=${parent.open} hasStyle=${parent.hasStyleSection}`);
    }
    return checks;
  });
}

// ── H-R12 — burned-fix: iframe panel-B gear → parent settings (real iframe) ─
async function hR12(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const frameB = panelFrameMap(page).B;

    checks.check('H-R12 L1: build id inside panel-B iframe',
      boot.buildIds.ok && boot.buildIds.frames && boot.buildIds.frames.B === boot.buildIds.expectedId,
      JSON.stringify(boot.buildIds));
    checks.check('H-R12 L1: iframe boundary (separate window)',
      boot.boundary && boot.boundary.ok, JSON.stringify(boot.boundary));

    await focusReactPanel(page, 'B');
    const pts = await reactDefaultTrendlinePoints(page, 'B');
    const placed = await placeTool(page, 'B', 'trendline', pts);
    checks.check('H-R12 setup: panel-B trendline placed on real bars', placed && placed.id, placed ? placed.id : 'null');

    await singleClickDrawing(page, 'B', placed.id);
    await waitForReactSelection(page, 'B', [placed.id]);

    const iframeToolbar = await readIframeToolbarState(frameB);
    checks.check('H-R12 probe: panel-B iframe toolbar state',
      iframeToolbar && iframeToolbar.dataLen > 50, JSON.stringify(iframeToolbar));
    checks.check('H-R12 CORE: no legacy #drawing-toolbar inside panel-B iframe (step-14 litmus)',
      iframeToolbar && !iframeToolbar.legacyVisible, JSON.stringify(iframeToolbar));

    let ready = await awaitParentChromeAfterPanelSelect(page, 'B', placed.id);
    if (!ready.ok) {
      await focusReactPanel(page, 'B');
      ready = await awaitParentChromeAfterPanelSelect(page, 'B', placed.id, { timeoutMs: 12_000 });
    }
    if (!ready.ok) {
      await sleep(600);
      await focusReactPanelSoft(page, 'B');
      ready = await awaitParentChromeAfterPanelSelect(page, 'B', placed.id, { timeoutMs: 15_000 });
    }
    checks.check('H-R12 probe: parent V9 quick-bar gear-ready settle signal',
      ready && ready.ok, JSON.stringify(ready?.detail || ready));

    const click = await clickV9QuickBarGear(page);
    checks.check('H-R12 probe: parent #tl-sett gear click', click && click.ok, click?.reason || '');

    const settingsWait = await waitForParentDrawingSettingsOpen(page, 5000);
    checks.check('H-R12 CORE: parent settings open after panel-B gear route',
      settingsWait.ok, JSON.stringify(settingsWait.settings));
    checks.check('H-R12 CORE: gear opened real settings modal (not quick-bar shell only)',
      settingsWait.ok && settingsWait.settings && !settingsWait.settings.quickBarShellOnly
        && settingsWait.settings.hasStyleSection,
      JSON.stringify(settingsWait.settings));

    await pressEscapeReact(page, 'B');
    await page.evaluate(() => {
      const root = document.getElementById('multichart-global-settings-root');
      if (root) root.replaceChildren();
    }).catch(() => {});
    await waitForPanelSettle(page, 'B');
    return checks;
  });
}

// ── H-R12A — burned-fix: host panel-A gear → parent settings (real product) ─
async function hR12a(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    await focusReactPanel(page, 'A');
    const pts = await reactDefaultTrendlinePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'trendline', pts);
    checks.check('H-R12A setup: panel-A trendline placed', placed && placed.id, placed ? placed.id : 'null');

    await singleClickDrawing(page, 'A', placed.id);
    await waitForReactSelection(page, 'A', [placed.id]);

    const ready = await waitForV9QuickBarReady(page, placed.id);
    checks.check('H-R12A probe: parent V9 quick-bar gear-ready settle signal',
      ready && ready.ok, JSON.stringify(ready?.detail || ready));

    const click = await clickV9QuickBarGear(page);
    checks.check('H-R12A probe: parent #tl-sett gear click (panel A)', click && click.ok, click?.reason || '');

    const settingsWait = await waitForParentDrawingSettingsOpen(page, 5000);
    checks.check('H-R12A CORE: parent settings open after panel-A gear route',
      settingsWait.ok, JSON.stringify(settingsWait.settings));
    checks.check('H-R12A CORE: gear opened real settings modal (not quick-bar shell only)',
      settingsWait.ok && settingsWait.settings && !settingsWait.settings.quickBarShellOnly
        && settingsWait.settings.hasStyleSection,
      JSON.stringify(settingsWait.settings));

    await pressEscapeReact(page, 'A');
    await page.evaluate(() => {
      const root = document.getElementById('multichart-global-settings-root');
      if (root) root.replaceChildren();
    }).catch(() => {});
    await waitForPanelSettle(page, 'A');
    return checks;
  });
}

// ── H-R13 — burned-fix: settings-flash (panel B iframe, settings must stay) ─
async function hR13(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    await focusReactPanel(page, 'B');
    const tool = await seedDrawing(page, 'B', 'trendline');
    checks.check('H-R13 setup: panel-B trendline placed', tool && tool.id, tool ? tool.id : 'null');
    const dbl = await doubleClickDrawing(page, 'B', tool.id);
    checks.check('H-R13 probe: double-click dispatched in iframe panel', dbl && dbl.ok, dbl?.reason || '');
    const immediate = await waitForParentDrawingSettingsOpen(page, 5000);
    checks.check('H-R13 CORE: settings open immediately after dbl-click',
      immediate.ok, JSON.stringify(immediate.settings));
    await sleep(400);
    const after = await readParentReactSettings(page);
    checks.check('H-R13 CORE: settings still open after 400ms (no flash-close race)',
      after.open && !after.quickBarShellOnly && after.hasStyleSection, JSON.stringify(after));
    await pressEscapeReact(page, 'B');
    await page.evaluate(() => {
      const root = document.getElementById('multichart-global-settings-root');
      if (root) root.replaceChildren();
    }).catch(() => {});
    await waitForPanelSettle(page, 'B');
    return checks;
  });
}

// ── H-R14 — burned-fix: Ctrl+drag marquee inside panel-B iframe ───────────
async function hR14(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    const pts1 = await reactDefaultTrendlinePoints(page, 'A');
    const pts2 = pts1.map((p, i) => ({ x: p.x + 40, y: p.y - (i === 0 ? 0.002 : 0.001) }));
    const first = await placeTool(page, 'B', 'trendline', pts1);
    const second = await placeTool(page, 'B', 'trendline', pts2);
    checks.check('H-R14 setup: two trendlines in panel-B iframe',
      first && first.id && second && second.id, `${first?.id},${second?.id}`);
    await focusReactPanel(page, 'B');
    const frameB = panelFrameMap(page).B;
    await frameB.evaluate(() => {
      try {
        const ch = window.chart;
        const dm = ch && ch.drawingManager;
        if (ch) ch.tool = null;
        if (dm && typeof dm.clearTool === 'function') dm.clearTool(true);
        if (dm && typeof dm.deselectAll === 'function') dm.deselectAll();
      } catch (_) { /* ignore */ }
    });
    await waitForPanelSettle(page, 'B');
    const drag = await ctrlDragMarquee(page, 'B');
    checks.check('H-R14 probe: Ctrl+drag marquee in panel-B iframe', drag && drag.ok, drag?.reason || '');
    checks.check('H-R14 CORE: marquee border active during drag (w/h > 8px)',
      drag && drag.during && drag.during.active && drag.during.w > 8 && drag.during.h > 8,
      JSON.stringify(drag?.during));
    const sel1 = await isDrawingSelected(page, 'B', first.id);
    const sel2 = await isDrawingSelected(page, 'B', second.id);
    checks.check('H-R14 CORE: marquee multi-selects drawings in panel-B iframe (store)',
      sel1 && sel2,
      `t1=${sel1} t2=${sel2}`);
    return checks;
  });
}

// ── H-S80 — PLAN2-FOUND#6: panel TF label sync after refresh (built V9) ───
const H_S80_LABEL_SYNC_SWITCH = '__TALARIA_MC_PANEL_TF_LABEL_SYNC';

async function reactPanelSetTimeframe(page, panelId, tf) {
  return page.evaluate(async (pid, t) => {
    const grid = window.__multichartGrid;
    if (grid && typeof grid.runCommand === 'function') {
      return grid.runCommand('setTimeframe', { tf: t }, { panelId: pid });
    }
    const mgr = window.__harnessManager;
    if (mgr && typeof mgr.sendCommand === 'function') {
      return mgr.sendCommand(pid, 'setTimeframe', { tf: t });
    }
    return false;
  }, panelId, tf);
}

async function waitPanelEngineTf(page, panelId, wantTf, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const cur = await readPanelEngineTf(page, panelId);
    if (cur === wantTf) return cur;
    await sleep(200);
  }
  return readPanelEngineTf(page, panelId);
}

async function hS80React(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await hostSetTimeframe(page, '15m');
    await reactPanelSetTimeframe(page, 'B', '15m');
    await waitForPanelData(page, 'B');
    await waitPanelEngineTf(page, 'B', '15m');
    await focusReactPanel(page, 'B');
    await sleep(500);
    const preEngine = await readPanelEngineTf(page, 'B');
    checks.check('H-S80 setup (react): B engine 15m before reload', preEngine === '15m', `engine=${preEngine}`);
    await seedChartPanelState(page, '2v');
    await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
    await waitForReactMultichartReady(page);
    await waitForPanelData(page, 'B');
    await hostSetTimeframe(page, '15m');
    await reactPanelSetTimeframe(page, 'B', '15m');
    await waitPanelEngineTf(page, 'B', '15m');
    await focusReactPanel(page, 'B');
    await sleep(1200);
    const engineTf = await readPanelEngineTf(page, 'B');
    const topbarTf = await readParentTopbarActiveTf(page);
    checks.check('H-S80 CORE (react): B engine TF is 15m', engineTf === '15m', `engine=${engineTf}`);
    checks.check('H-S80 CORE (react): parent topbar pill is 15m', topbarTf === '15m',
      `topbar=${topbarTf} engine=${engineTf}`);
    return checks;
  });
}

export function reactScenarioList() {
  return [
    { id: 'H-R13', title: 'burned-fix: panel-B settings stays open (no flash)', run: hR13 },
    { id: 'H-R14', title: 'burned-fix: Ctrl+drag marquee inside panel-B iframe', run: hR14 },
    { id: 'H-R12', title: 'burned-fix: iframe panel-B gear opens parent settings', run: hR12 },
    { id: 'H-R12A', title: 'burned-fix: host panel-A gear opens parent settings', run: hR12a },
    { id: 'H-R01', title: 'parity row 1: single-click select (host + panel B)', run: hR01 },
    { id: 'H-R02', title: 'parity row 2: blue selection border (host + panel B)', run: hR02 },
    { id: 'H-R03', title: 'parity row 3: Ctrl-click multi-select (host + panel B)', run: hR03 },
    { id: 'H-R04', title: 'parity row 4: settings open/stays (host + panel B)', run: hR04 },
    { id: 'H-R05', title: 'parity row 5: Esc closes settings + deselects (host + panel B)', run: hR05 },
    { id: 'H-R06', title: 'parity row 6: delete repaints without ghost (host + panel B)', run: hR06 },
    { id: 'H-R07', title: 'parity row 7: peer isolation on cross-panel select', run: hR07 },
    { id: 'H-R08', title: 'parity row 8: Ctrl+drag marquee (host + panel B)', run: hR08 },
    { id: 'H-R09', title: 'parity row 9: single→double-click chain + Esc (host + panel B)', run: hR09 },
    { id: 'H-S80', title: 'PLAN2-FOUND#6: panel TF label sync after refresh (built V9)', run: hS80React },
  ];
}
