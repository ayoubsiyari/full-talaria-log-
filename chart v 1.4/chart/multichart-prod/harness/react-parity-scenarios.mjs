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
  waitForParentV9ChromeDomReady,
  readParentQuickBarLagSignature,
  readParentV9BarVisible,
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
  defaultVolumeAnchorPoints,
  waitForAvVolumeProfileSettingsOpen,
  openAvVolumeProfileSettings,
  clickAvSettingsTab,
  clickAvLabelCheckbox,
  readAvVpLabelBridgeProbe,
  readAvVpCoordTabFields,
  readAvVpAnchorGeometryProbe,
  editAvCoordFieldViaSpinner,
  resolveAnchoredVpAnchorHandlePagePoint,
  actuateAnchoredVpHandleDragInPanel,
  dragPointerPath,
  reactPanelLoadFile,
  readReactPanelFileIds,
  reactSwitchMultichartLayout,
  waitForMountViewportPanelReady,
  pollMountOffsetCommits,
  readAxisMarginCrushProbe,
  waitForVpDrawingSettle,
  ensureDrawingAnchorInPlotView,
  readProductionFocusedPanelId,
  probeMultichartGridChartResolver,
  armPanelDrawToolViaProductionSync,
  twoClickRectangleLive,
  readPanelSelectionOutlineCount,
  currentReactBuildId,
  openV9LayersPanel,
  countV9LayerSelectedRows,
  countV9LayerInventoryRows,
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
  if (panelId === 'B') {
    await focusReactPanelSoft(page, panelId);
    await waitForPanelSettle(page, panelId);
  }
  const domBudget = panelId === 'B' ? 12_000 : 4000;
  const domReady = await waitForParentV9ChromeDomReady(page, panelId, tool.id, domBudget);
  checks.check(`${prefix} probe (${label}): parent V9 chrome DOM ready`,
    domReady.ok, JSON.stringify(domReady.detail));
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

    await runPanelClickRow(page, checks, 'H-R01', 'B');
    await runPanelClickRow(page, checks, 'H-R01', 'A');
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
      if (pid === 'B') {
        await focusReactPanelSoft(page, pid);
        await waitForPanelSettle(page, pid);
      }
      const domBudget = pid === 'B' ? 12_000 : 4000;
      const domReady = await waitForParentV9ChromeDomReady(page, pid, tool.id, domBudget);
      checks.check(`H-R04 probe (${label}): parent V9 chrome DOM ready before dbl-click`,
        domReady.ok, JSON.stringify(domReady.detail));
      let dbl = await doubleClickDrawing(page, pid, tool.id);
      checks.check(`H-R04 probe (${label}): double-click dispatched`, dbl && dbl.ok, dbl?.reason || '');
      let settingsWait = await waitForParentDrawingSettingsOpen(page, pid === 'B' ? 8000 : 5000);
      if (!settingsWait.ok && pid === 'B') {
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
      await disarmDrawTool(page, pid);
      await singleClickDrawing(page, pid, tool.id);
      await waitForReactSelection(page, pid, [tool.id]);
      if (pid === 'B') {
        await focusReactPanelSoft(page, pid);
        await waitForPanelSettle(page, pid);
      }
      const domBudget = pid === 'B' ? 12_000 : 4000;
      const domReady = await waitForParentV9ChromeDomReady(page, pid, tool.id, domBudget);
      checks.check(`H-R05 probe (${label}): parent V9 chrome DOM ready before dbl-click`,
        domReady.ok, JSON.stringify(domReady.detail));
      await doubleClickDrawing(page, pid, tool.id);
      let settingsBefore = await waitForParentDrawingSettingsOpen(page, pid === 'B' ? 8000 : 5000);
      if (!settingsBefore.ok && pid === 'B') {
        await waitForPanelSettle(page, pid);
        await doubleClickDrawing(page, pid, tool.id);
        settingsBefore = await waitForParentDrawingSettingsOpen(page, 8000);
      }
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
      if (pid === 'B') {
        await focusReactPanelSoft(page, pid);
        await waitForPanelSettle(page, pid);
      }
      const domBudgetSingle = pid === 'B' ? 12_000 : 4000;
      const domReadySingle = await waitForParentV9ChromeDomReady(page, pid, tool.id, domBudgetSingle);
      checks.check(`H-R09 probe (${label}): parent V9 chrome DOM ready after single click`,
        domReadySingle.ok, JSON.stringify(domReadySingle.detail));
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

// ── H-R09-LR — panel-B live-resolve lag pin (H-R09 contingency proof) ───
async function hR09Lr(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const pid = 'B';
    const label = 'panelB';

    const tool = await seedDrawing(page, pid, 'trendline');
    await disarmDrawTool(page, pid);
    const click1 = await singleClickDrawing(page, pid, tool.id);
    checks.check(`H-R09-LR probe (${label}): single click`, click1 && click1.ok, click1?.reason || '');
    const afterSingle = await waitForReactSelection(page, pid, [tool.id]);
    await focusReactPanelSoft(page, pid);
    await waitForPanelSettle(page, pid);
    const domReadySingle = await waitForParentV9ChromeDomReady(page, pid, tool.id, 12_000);
    checks.check(`H-R09-LR probe (${label}): parent V9 chrome DOM ready after single click`,
      domReadySingle.ok, JSON.stringify(domReadySingle.detail));
    const lag = await readParentQuickBarLagSignature(page, pid, tool.id);
    checks.check(`H-R09-LR LAG-PIN (${label}): split-brain diagnostic`,
      true, JSON.stringify(lag));
    await assertReactMenuState(checks, `H-R09-LR CORE (${label}): single click selects + quick menu`, {
      selectedIds: [tool.id],
      toolbarVisible: true,
    }, afterSingle, page, pid);
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

// ── H-A7b-R2 — D-029 R2: multichart anchored VP must not crush price/time axes ─
async function hA7bR2(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    checks.check('H-A7b-R2 L1: build id on host + panel B iframe', boot.buildIds.ok,
      JSON.stringify(boot.buildIds));
    checks.check('H-A7b-R2 L1: iframe boundary (panel B embed)', boot.boundary && boot.boundary.ok,
      JSON.stringify(boot.boundary));
    checks.check('H-A7b-R2 L1: real bar data in panel B iframe', boot.iframeBars > 50,
      `dataLen=${boot.iframeBars}`);

    await reactPanelLoadFile(page, 'B', '27');
    await waitForPanelData(page, 'B', 60_000);
    const fileDeadline = Date.now() + 30_000;
    let fileIds = await readReactPanelFileIds(page);
    while (Date.now() < fileDeadline && fileIds.B !== '27') {
      await sleep(250);
      fileIds = await readReactPanelFileIds(page);
    }
    checks.check('H-A7b-R2 setup: independent pair A=file25 B=file27',
      fileIds.A === '25' && fileIds.B === '27', JSON.stringify(fileIds));

    const dataDeadline = Date.now() + 30_000;
    let bBars = 0;
    while (Date.now() < dataDeadline) {
      const frameB = panelFrameMap(page).B;
      bBars = frameB
        ? await frameB.evaluate(() => (window.chart && window.chart.data ? window.chart.data.length : 0))
        : 0;
      if (bBars > 50) break;
      await sleep(200);
    }
    checks.check('H-A7b-R2 setup: panel B bars loaded after file27 switch', bBars > 50, `len=${bBars}`);

    await focusReactPanel(page, 'B');
    await waitForPanelSettle(page, 'B');
    // Multichart-topology stress amplifier (D-029 §4.2): resize cycle before VP.
    await page.setViewport({ width: 1280, height: 720 });
    await waitForPanelSettle(page, 'B', 2000);
    await page.setViewport({ width: 1440, height: 960 });
    await waitForPanelSettle(page, 'B', 2000);
    let pts;
    try {
      pts = await defaultVolumeAnchorPoints(page, 1, 'B');
    } catch (err) {
      checks.check('H-A7b-R2 setup: anchor points resolved', false, String(err && err.message || err));
      return checks;
    }
    const placed = await placeTool(page, 'B', 'anchored-volume-profile', pts);
    checks.check('H-A7b-R2 setup: anchored VP placed on panel B', placed && placed.id,
      placed ? placed.id : 'null');
    await waitForVpDrawingSettle(page, 'B', placed.id, 3000);
    await waitForPanelSettle(page, 'B', 1500);

    const probe = await readAxisMarginCrushProbe(page, 'B');
    const switchOff = !!ctx.axisMarginFloorOff;
    checks.check('H-A7b-R2 CORE: axes not crushed after anchored VP (multichart topology)',
      switchOff ? !(probe && probe.ok) : (probe && probe.ok), JSON.stringify(probe));
    checks.check('H-A7b-R2 CORE: margin floor contract (price side >=60, b >=24)',
      switchOff ? !(probe && probe.floorOk) : (probe && probe.floorOk), JSON.stringify(probe));

    const frameB = panelFrameMap(page).B;
    const i13 = frameB ? await frameB.evaluate((off) => {
      const ch = window.chart;
      if (!ch || typeof ch._enforceAxisMarginFloor !== 'function') {
        return { ok: false, reason: 'no _enforceAxisMarginFloor' };
      }
      ch.margin.r = 5;
      ch._enforceAxisMarginFloor();
      const after = Number(ch.margin.r);
      if (off) {
        return {
          ok: after <= 10,
          after,
          switchOff: window.__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX === true,
        };
      }
      return { ok: after >= 60, after };
    }, switchOff) : { ok: false, reason: 'no frame B' };
    if (switchOff) {
      checks.check('H-A7b-R2 I13: _enforceAxisMarginFloor no-op when switch OFF',
        i13 && i13.ok && i13.switchOff, JSON.stringify(i13));
    } else {
      checks.check('H-A7b-R2 I13: _enforceAxisMarginFloor clamps margin.r when switch ON',
        i13 && i13.ok, JSON.stringify(i13));
    }
    return checks;
  });
}

// ── H-A7b-R2b — D-029 R2b: VP anchor handle resize survives axis-margin floor ─
async function hA7bR2b(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const switchOff = !!ctx.vpHandleCanvasRoutingOff;
    checks.check('H-A7b-R2b L1: build id on host + panel B iframe', boot.buildIds.ok,
      JSON.stringify(boot.buildIds));

    await reactPanelLoadFile(page, 'B', '27');
    await waitForPanelData(page, 'B', 60_000);
    await focusReactPanel(page, 'B');
    await waitForPanelSettle(page, 'B');
    await page.setViewport({ width: 1280, height: 720 });
    await waitForPanelSettle(page, 'B', 2000);
    await page.setViewport({ width: 1440, height: 960 });
    await waitForPanelSettle(page, 'B', 2000);

    let pts;
    try {
      pts = await defaultVolumeAnchorPoints(page, 1, 'B');
    } catch (err) {
      checks.check('H-A7b-R2b setup: anchor points resolved', false, String(err && err.message || err));
      return checks;
    }
    const placed = await placeTool(page, 'B', 'anchored-volume-profile', pts);
    checks.check('H-A7b-R2b setup: anchored VP placed on panel B', placed && placed.id,
      placed ? placed.id : 'null');
    await waitForVpDrawingSettle(page, 'B', placed.id, 3000);
    await waitForPanelSettle(page, 'B', 1500);
    await disarmDrawTool(page, 'B');
    await singleClickDrawing(page, 'B', placed.id);
    await waitForReactSelection(page, 'B', [placed.id]);
    await waitForPanelSettle(page, 'B', 800);

    const axisProbe = await readAxisMarginCrushProbe(page, 'B');
    checks.check('H-A7b-R2b guard: axes not crushed (R2 floor intact)',
      axisProbe && axisProbe.ok && axisProbe.floorOk, JSON.stringify(axisProbe));

    const geoBefore = await readAvVpAnchorGeometryProbe(page, 'B', placed.id);
    checks.check('H-A7b-R2b setup: anchor geometry probe', geoBefore.ok, JSON.stringify(geoBefore));

    await ensureDrawingAnchorInPlotView(page, 'B', placed.id);
    await waitForPanelSettle(page, 'B', 400);

    const drag = await actuateAnchoredVpHandleDragInPanel(page, 'B', placed.id, -160, 24);
    checks.check('H-A7b-R2b probe: routing fix starts handle drag when ON',
      switchOff ? !(drag && drag.ok) : !!(drag && drag.ok), JSON.stringify(drag || null));
    await sleep(300);

    const geoAfter = await readAvVpAnchorGeometryProbe(page, 'B', placed.id);
    const moved = !!(drag && drag.moved) || (geoAfter.ok && geoBefore.ok
      && (Math.abs(geoAfter.barIndex - geoBefore.barIndex) >= 0.5
        || Math.abs(geoAfter.price - geoBefore.price) >= 1e-5));
    checks.check('H-A7b-R2b CORE: anchor handle drag re-anchors VP',
      switchOff ? !moved : moved, JSON.stringify({ geoBefore, geoAfter, drag, switchOff }));

    const axisAfter = await readAxisMarginCrushProbe(page, 'B');
    checks.check('H-A7b-R2b guard: axes still intact after handle drag',
      axisAfter && axisAfter.ok && axisAfter.floorOk, JSON.stringify(axisAfter));

    const frameB = panelFrameMap(page).B;
    const i13 = frameB ? await frameB.evaluate((off) => {
      const ch = window.chart;
      if (!ch || typeof ch._enforceAxisMarginFloor !== 'function') {
        return { ok: false, reason: 'no _enforceAxisMarginFloor' };
      }
      ch.margin.r = 5;
      ch._enforceAxisMarginFloor();
      const after = Number(ch.margin.r);
      if (off) {
        return {
          ok: after <= 10,
          after,
          switchOff: window.__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX === true,
        };
      }
      return { ok: after >= 60, after };
    }, !!ctx.axisMarginFloorOff) : { ok: false, reason: 'no frame B' };
    if (!ctx.axisMarginFloorOff) {
      checks.check('H-A7b-R2b I13: R2 floor still enforced after resize',
        i13 && i13.ok, JSON.stringify(i13));
    }

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

// ── H-A8-VP-1 — Anchored VP V9 label bridge (TAL-01662) ────────────────
async function hA8Vp1(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const panelId = 'A';

    await waitForPanelSettle(page, panelId);
    const pts = await defaultVolumeAnchorPoints(page, 1, panelId);
    const placed = await placeTool(page, panelId, 'anchored-volume-profile', pts);
    checks.check('H-A8-VP-1 setup: anchored VP placed', placed && placed.id, placed ? placed.id : 'null');
    if (!placed?.id) return checks;

    await disarmDrawTool(page, panelId);
    await singleClickDrawing(page, panelId, placed.id);
    await waitForReactSelection(page, panelId, [placed.id]);
    await waitForParentV9ChromeDomReady(page, panelId, placed.id, 4000);
    const opened = await openAvVolumeProfileSettings(page, panelId, placed.id);
    checks.check('H-A8-VP-1 probe: settings open actuation', opened.ok, JSON.stringify(opened));

    const open = opened.open || await waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored', timeoutMs: 1000 });
    checks.check('H-A8-VP-1 setup: AV settings open', open.ok, JSON.stringify(open));
    checks.check('H-A8-VP-1 setup: Labels row present', open.hasLabelsRow, open.snippet || '');
    if (!open.ok) return checks;

    await clickAvSettingsTab(page, 'style');

    await clickAvLabelCheckbox(page, 'price');
    await sleep(150);
    let probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Price OFF → engine showPriceLabel false',
      probe.ok && probe.showPriceLabel === false,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'price');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Price ON → highlights visible',
      probe.ok && probe.showPriceLabel === true && probe.highlightsVisible === true,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'time');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Time OFF → engine showTimeLabel false',
      probe.ok && probe.showTimeLabel === false,
      JSON.stringify(probe));

    await clickAvLabelCheckbox(page, 'time');
    await sleep(150);
    probe = await readAvVpLabelBridgeProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-1 CORE: Time ON → highlights visible',
      probe.ok && probe.showTimeLabel === true && probe.highlightsVisible === true,
      JSON.stringify(probe));

    return checks;
  });
}

// ── H-A8-VP-2 — Anchored VP coord tab ↔ canvas sync (TAL-01664) ─────────
async function hA8Vp2(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const panelId = 'A';

    await waitForPanelSettle(page, panelId);
    const placed = await placeTool(page, panelId, 'anchored-volume-profile',
      await defaultVolumeAnchorPoints(page, 1, panelId));
    checks.check('H-A8-VP-2 setup: placed', placed?.id, placed?.id || 'null');
    if (!placed?.id) return checks;

    await disarmDrawTool(page, panelId);
    await singleClickDrawing(page, panelId, placed.id);
    await waitForReactSelection(page, panelId, [placed.id]);
    await waitForParentV9ChromeDomReady(page, panelId, placed.id, 4000);
    const opened = await openAvVolumeProfileSettings(page, panelId, placed.id);
    checks.check('H-A8-VP-2 setup: settings open actuation', opened.ok, JSON.stringify(opened));
    const open = opened.open || await waitForAvVolumeProfileSettingsOpen(page, { kind: 'anchored', timeoutMs: 1000 });
    checks.check('H-A8-VP-2 setup: settings open', open.ok, JSON.stringify(open));
    if (!open.ok) return checks;

    await clickAvSettingsTab(page, 'coordinates');
    // Prime avCoordBridge (first user edit after boot is skipped by avCoordBridgeReady).
    await editAvCoordFieldViaSpinner(page, 'anchorBar', +1);
    await sleep(250);
    const fields0 = await readAvVpCoordTabFields(page);
    const geo0 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    checks.check('H-A8-VP-2 setup: coord fields readable', fields0.ok, JSON.stringify(fields0));
    checks.check('H-A8-VP-2 setup: initial tab/geo bar match',
      fields0.ok && geo0.ok && Math.abs(parseFloat(fields0.anchorBar) - geo0.barIndex) < 0.05,
      `tab=${fields0.anchorBar} geo=${geo0.barIndex}`);

    const barBefore = geo0.barIndex;
    await editAvCoordFieldViaSpinner(page, 'anchorBar', +10);
    await sleep(200);
    const geo1 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    const fields1 = await readAvVpCoordTabFields(page);
    const dBar = geo1.barIndex - barBefore;
    checks.check('H-A8-VP-2 CORE-A: coord tab Bar +10 moves anchor',
      geo1.ok && Math.abs(dBar - 10) <= 0.05,
      `dBar=${dBar} geo1=${JSON.stringify(geo1)}`);
    checks.check('H-A8-VP-2 CORE-A′: tab Bar field matches geometry',
      fields1.ok && Math.abs(parseFloat(fields1.anchorBar) - geo1.barIndex) <= 0.05,
      JSON.stringify({ fields1, geo1 }));

    const handle = await resolveAnchoredVpAnchorHandlePagePoint(page, panelId, placed.id);
    checks.check('H-A8-VP-2 setup: anchor handle resolved', handle?.ok, JSON.stringify(handle || null));
    if (handle?.ok) {
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await dragPointerPath(page, handle.x, handle.y, handle.x - 70, handle.y + 18, { steps: 12 });
      await page.mouse.up();
      await sleep(250);
    }
    const geo2 = await readAvVpAnchorGeometryProbe(page, panelId, placed.id);
    let fields2 = await readAvVpCoordTabFields(page);
    if (!fields2.ok && fields2.reason === 'panel closed') {
      await openAvVolumeProfileSettings(page, panelId, placed.id);
      await clickAvSettingsTab(page, 'coordinates');
      await sleep(200);
      fields2 = await readAvVpCoordTabFields(page);
    }
    const moved = geo2.ok && (Math.abs(geo2.barIndex - geo1.barIndex) >= 0.5
      || Math.abs(geo2.price - geo1.price) >= 1e-5);
    checks.check('H-A8-VP-2 CORE-B: canvas drag moves anchor', moved, JSON.stringify({ geo1, geo2 }));
    const priceTick = 1e-5;
    checks.check('H-A8-VP-2 CORE-B′: coord tab tracks canvas drag',
      fields2.ok && geo2.ok
        && Math.abs(parseFloat(fields2.anchorBar) - geo2.barIndex) <= 0.05
        && Math.abs(parseFloat(fields2.anchorPrice) - geo2.price) <= priceTick,
      JSON.stringify({ fields1, fields2, geo2 }));

    return checks;
  });
}

// ── MC-DRAW-FIRSTCLICK-R — dist-v9 live topology: A armed → draw B click 1 ─
async function mcDrawFirstclickLive(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitForReactMultichartReady(page);
    await waitForPanelData(page, 'B');
    await sleep(400);

    const gridApi = await probeMultichartGridChartResolver(page);
    checks.check('MC-DRAW-FIRSTCLICK-R probe: production grid resolver API',
      gridApi && gridApi.hasGetFocusedPanelId && gridApi.hasGetChartForPanel,
      JSON.stringify(gridApi || null));
    const buildId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null);
    checks.check('MC-DRAW-FIRSTCLICK-R probe: build id stamped',
      !!buildId, `build=${buildId} dist=${currentReactBuildId()}`);

    const armRes = await armPanelDrawToolViaProductionSync(page, 'A', 'rectangle');
    checks.check('MC-DRAW-FIRSTCLICK-R setup: syncDrawingToolAcrossPanels on A',
      armRes && armRes.ok, JSON.stringify(armRes || null));

    const preB = await readReactParityState(page, 'B');
    const focused = await readProductionFocusedPanelId(page);
    checks.check('MC-DRAW-FIRSTCLICK-R setup: focus remains A before B draw',
      focused === 'A', `focused=${focused}`);
    checks.check('MC-DRAW-FIRSTCLICK-R setup: B has no local tool before draw',
      preB && !preB.currentTool, `B.tool=${preB?.currentTool}`);

    const drawRes = await twoClickRectangleLive(page, 'B');
    checks.check('MC-DRAW-FIRSTCLICK-R probe: two-click rectangle on B',
      drawRes && drawRes.ok, JSON.stringify(drawRes || null));
    checks.check('MC-DRAW-FIRSTCLICK-R probe: click-1 entered draw on B',
      drawRes && drawRes.midIsDrawing === true && drawRes.midCurrentTool === 'rectangle',
      `mid=${JSON.stringify({ isDrawing: drawRes?.midIsDrawing, tool: drawRes?.midCurrentTool })}`);

    const afterB = await readReactParityState(page, 'B');
    checks.check(
      'MC-DRAW-FIRSTCLICK-R CORE: rectangle lands on B after first session',
      afterB && afterB.drawingCount >= 1,
      `B.count=${afterB?.drawingCount}`,
    );
    return checks;
  });
}

// ── MC-DRAW-FIRSTCLICK-2-R — reverse live: B armed → draw A click 1 ───────
async function mcDrawFirstclickReverseLive(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitForReactMultichartReady(page);
    await waitForPanelData(page, 'B');
    await sleep(400);

    const armRes = await armPanelDrawToolViaProductionSync(page, 'B', 'rectangle');
    checks.check('MC-DRAW-FIRSTCLICK-2-R setup: syncDrawingToolAcrossPanels on B',
      armRes && armRes.ok && armRes.focusedTool === 'rectangle',
      JSON.stringify(armRes || null));

    const preA = await readReactParityState(page, 'A');
    const focused = await readProductionFocusedPanelId(page);
    checks.check('MC-DRAW-FIRSTCLICK-2-R setup: focus remains B before A draw',
      focused === 'B', `focused=${focused}`);
    checks.check('MC-DRAW-FIRSTCLICK-2-R setup: host A has no local tool',
      preA && !preA.currentTool, `A.tool=${preA?.currentTool}`);

    const drawRes = await twoClickRectangleLive(page, 'A');
    checks.check('MC-DRAW-FIRSTCLICK-2-R probe: two-click rectangle on A',
      drawRes && drawRes.ok, JSON.stringify(drawRes || null));
    checks.check('MC-DRAW-FIRSTCLICK-2-R probe: click-1 entered draw on A (mid-gesture)',
      drawRes && drawRes.midIsDrawing === true && drawRes.midCurrentTool === 'rectangle',
      `mid=${JSON.stringify({ isDrawing: drawRes?.midIsDrawing, tool: drawRes?.midCurrentTool })}`);

    const afterA = await readReactParityState(page, 'A');
    checks.check(
      'MC-DRAW-FIRSTCLICK-2-R CORE: rectangle lands on A after first session (not focus-then-draw)',
      afterA && afterA.drawingCount >= 1,
      `A.count=${afterA?.drawingCount}`,
    );
    return checks;
  });
}

// ── MC-DRAW-FIRSTCLICK-2-R-SEL — reverse live + peer stale selection chrome ─
async function mcDrawFirstclickReverseLivePeerSel(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitForReactMultichartReady(page);
    await waitForPanelData(page, 'A');
    await waitForPanelData(page, 'B');
    await sleep(400);

    const peerTool = await placeTool(page, 'A', 'trendline', await reactDefaultTrendlinePoints(page, 'A', 0));
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL setup: peer trendline on A',
      peerTool && peerTool.id, peerTool ? peerTool.id : 'null');
    await disarmDrawTool(page, 'A');
    const baselineChrome = await readSelectionChrome(page, 'A', peerTool.id);
    const baselineHandles = baselineChrome && baselineChrome.handleCount != null ? baselineChrome.handleCount : 0;
    const selClick = await singleClickDrawing(page, 'A', peerTool.id);
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL setup: select peer drawing on A',
      selClick && selClick.ok, selClick?.reason || '');
    const preChrome = await readSelectionChrome(page, 'A', peerTool.id);
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL setup: peer selection chrome visible before draw',
      preChrome && preChrome.ok && preChrome.selected === true,
      JSON.stringify({ preChrome, baselineHandles }));

    const armRes = await armPanelDrawToolViaProductionSync(page, 'B', 'rectangle');
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL setup: syncDrawingToolAcrossPanels on B',
      armRes && armRes.ok && armRes.focusedTool === 'rectangle',
      JSON.stringify(armRes || null));
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL setup: focus remains B before A draw',
      (await readProductionFocusedPanelId(page)) === 'B',
      `focused=${await readProductionFocusedPanelId(page)}`);

    const drawRes = await twoClickRectangleLive(page, 'A');
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL probe: two-click rectangle on A',
      drawRes && drawRes.ok && drawRes.midIsDrawing === true && drawRes.drawingCount >= 2,
      JSON.stringify(drawRes || null));

    await sleep(200);
    const peerChrome = await readSelectionChrome(page, 'A', peerTool.id);
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL CORE: peer drawing selection chrome cleared',
      peerChrome && peerChrome.ok && peerChrome.selected === false
        && peerChrome.handleCount <= (preChrome?.handleCount ?? baselineHandles),
      JSON.stringify({ peerChrome, baselineHandles, preChrome }));
    const outline = await readPanelSelectionOutlineCount(page, 'A', null);
    const peerStale = (outline && outline.details || []).find((d) => String(d.id) === String(peerTool.id));
    checks.check('MC-DRAW-FIRSTCLICK-2-R-SEL CORE: peer-panel stale selection outline count == 0',
      peerChrome && peerChrome.selected === false
        && (!peerStale || peerStale.inSel === false)
        && peerChrome.handleCount <= (preChrome?.handleCount ?? baselineHandles),
      JSON.stringify({ baselineHandles, preChrome, peerStale, peerChrome, outline: outline?.details }));
    return checks;
  });
}

// ── OT-MS-01 — V9 Layers multi-select highlight via Ctrl+click ───────────
async function otMs01(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const pid = 'B';

    checks.check('OT-MS-01 L1: build ids match',
      boot.buildIds.ok, JSON.stringify(boot.buildIds));

    // Prime host panel (H-R03 runs host before panel B — matches live multichart focus topology).
    const hostPts1 = await reactDefaultTrendlinePoints(page, 'A', 0);
    const hostPts2 = await reactDefaultTrendlinePoints(page, 'A', 55);
    await placeTool(page, 'A', 'trendline', hostPts1);
    await placeTool(page, 'A', 'trendline', hostPts2);
    await focusReactPanel(page, 'A');
    await disarmDrawTool(page, 'A');

    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = await reactDefaultTrendlinePoints(page, pid, 55);
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    checks.check('OT-MS-01 setup: two trendlines on panel B',
      first && first.id && second && second.id, `${first?.id},${second?.id}`);

    await focusReactPanel(page, pid);
    await disarmDrawTool(page, pid);
    await singleClickDrawing(page, pid, first.id);
    await waitForReactSelection(page, pid, [first.id]);
    const ctrl = await ctrlClickDrawing(page, pid, second.id);
    checks.check('OT-MS-01 probe: Ctrl+click second trendline', ctrl && ctrl.ok, ctrl?.reason || '');
    await waitForReactSelection(page, pid, [first.id, second.id]);
    await waitForPanelSettle(page, pid);
    const preSel1 = await isDrawingSelected(page, pid, first.id);
    const preSel2 = await isDrawingSelected(page, pid, second.id);
    checks.check('OT-MS-01 probe: store has both before Layers open',
      preSel1 && preSel2, `t1=${preSel1} t2=${preSel2}`);

    const layersOpen = await openV9LayersPanel(page);
    checks.check('OT-MS-01 probe: Layers panel opened', layersOpen && layersOpen.ok, layersOpen?.reason || '');
    await sleep(300);

    const domSel = await countV9LayerSelectedRows(page, 2, 5000);
    checks.check('OT-MS-01 CORE: ≥2 V9 layer rows highlighted (parent DOM)',
      domSel.ok && domSel.count >= 2, `count=${domSel.count}`);
    const sel1 = await isDrawingSelected(page, pid, first.id);
    const sel2 = await isDrawingSelected(page, pid, second.id);
    checks.check('OT-MS-01 CORE: dm.selectedDrawings has both ids (store)',
      sel1 && sel2, `t1=${sel1} t2=${sel2}`);
    return checks;
  });
}

// ── OT-MS-02 — V9 Layers multi-select highlight via Ctrl+marquee ───────────
async function otMs02(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const pid = 'B';

    const pts1 = await reactDefaultTrendlinePoints(page, pid, 0);
    const pts2 = [
      { x: pts1[0].x + 20, y: pts1[0].y - 0.0005 },
      { x: pts1[1].x + 20, y: pts1[1].y - 0.0003 },
    ];
    const first = await placeTool(page, pid, 'trendline', pts1);
    const second = await placeTool(page, pid, 'trendline', pts2);
    checks.check('OT-MS-02 setup: two trendlines on panel B',
      first && first.id && second && second.id, `${first?.id},${second?.id}`);

    await focusReactPanel(page, pid);
    const drag = await ctrlDragMarquee(page, pid);
    checks.check('OT-MS-02 probe: Ctrl+marquee dispatched', drag && drag.ok, drag?.reason || '');
    checks.check('OT-MS-02 probe: marquee border during drag',
      drag && drag.during && drag.during.active && drag.during.w > 8,
      JSON.stringify(drag?.during));
    await waitForReactSelection(page, pid, [first.id, second.id]);

    const layersOpen = await openV9LayersPanel(page);
    checks.check('OT-MS-02 probe: Layers panel opened', layersOpen && layersOpen.ok, layersOpen?.reason || '');
    await sleep(300);

    const domSel = await countV9LayerSelectedRows(page, 2, 5000);
    checks.check('OT-MS-02 CORE: ≥2 V9 layer rows highlighted (parent DOM)',
      domSel.ok && domSel.count >= 2, `count=${domSel.count}`);
    const sel1 = await isDrawingSelected(page, pid, first.id);
    const sel2 = await isDrawingSelected(page, pid, second.id);
    checks.check('OT-MS-02 CORE: dm.selectedDrawings has both ids (store)',
      sel1 && sel2, `t1=${sel1} t2=${sel2}`);
    return checks;
  });
}

// ── OT-MS-03 — PLAN2-FOUND#3 dedupe regression fence (4-up) ─────────────
async function otMs03(ctx) {
  const localCtx = { ...ctx, mcLayout: '4v' };
  return runWithReact(localCtx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    await focusReactPanel(page, 'A');
    const pts = await reactDefaultRectanglePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'rectangle', pts);
    checks.check('OT-MS-03 setup: one rectangle on panel A (4-up)',
      placed && placed.id, placed ? placed.id : 'null');
    await waitForPanelSettle(page, 'A');

    const layersOpen = await openV9LayersPanel(page);
    checks.check('OT-MS-03 probe: Layers panel opened', layersOpen && layersOpen.ok, layersOpen?.reason || '');
    await sleep(400);
    await page.evaluate(() => {
      if (typeof window.__rebuildObjectsTree === 'function') window.__rebuildObjectsTree();
    });
    await sleep(200);
    const rowCount = await countV9LayerInventoryRows(page);
    checks.check('OT-MS-03 CORE: exactly one inventory row for one shape (dedupe ON)',
      rowCount === 1, `rowCount=${rowCount}`);
    return checks;
  });
}

// ── H-MC-MOUNT-JITTER-R1 — mount + symbol-change offset commit coalesce ───
async function hMcMountJitterR1(ctx) {
  const coalesceOff = !!(ctx.bugSwitches && ctx.bugSwitches.length);
  const localCtx = { ...ctx, mcLayout: '1' };
  return runWithReact(localCtx, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    checks.check('H-MC-MOUNT-JITTER-R1 L1: build id on host + panel B iframe', boot.buildIds.ok,
      JSON.stringify(boot.buildIds));

    await page.evaluate(() => {
      window.__TALARIA_MC_ENABLE_MOUNT_OFFSET_TRACE_V1 = true;
    });

    await page.waitForFunction(
      () => window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0,
      { timeout: 120000 },
    );

    const switchRes = await reactSwitchMultichartLayout(page, '2v');
    checks.check('H-MC-MOUNT-JITTER-R1 setup: single→2v via layout control',
      switchRes && switchRes.ok, JSON.stringify(switchRes));

    const frameB = await waitForPanelFrame(page, 'B');
    checks.check('H-MC-MOUNT-JITTER-R1 setup: panel B iframe present', !!frameB, 'missing B');
    if (!frameB) return checks;

    await waitForPanelData(page, 'B');
    await waitForMountViewportPanelReady(frameB);

    const phaseA = await pollMountOffsetCommits(frameB, 2500);
    checks.check('H-MC-MOUNT-JITTER-R1 phase-A probe constructed', phaseA && phaseA.ok,
      phaseA ? (phaseA.reason || '') : 'no probe');

    if (coalesceOff) {
      checks.check('H-MC-MOUNT-JITTER-R1 RED phase-A: offsetChangingCommits >= 3 (coalesce OFF)',
        phaseA && phaseA.offsetChangingCommits >= 3,
        `commits=${phaseA?.offsetChangingCommits}`);
    } else {
      checks.check('H-MC-MOUNT-JITTER-R1 CORE phase-A: offsetChangingCommits <= 1 after settle',
        phaseA && phaseA.offsetChangingCommits <= 1,
        `commits=${phaseA?.offsetChangingCommits} traceLen=${phaseA?.traceLog?.length ?? 0}`);
    }

    await focusReactPanel(page, 'B');
    const fileIds = await readReactPanelFileIds(page);
    const altId = fileIds.A === '27' ? '25' : '27';
    await reactPanelLoadFile(page, 'B', altId);
    await waitForPanelData(page, 'B');
    await waitForMountViewportPanelReady(frameB);

    const phaseB = await pollMountOffsetCommits(frameB, 2000);
    checks.check('H-MC-MOUNT-JITTER-R1 phase-B probe constructed', phaseB && phaseB.ok,
      phaseB ? (phaseB.reason || '') : 'no probe');

    if (coalesceOff) {
      checks.check('H-MC-MOUNT-JITTER-R1 RED phase-B: symbol swap offsetChangingCommits >= 3',
        phaseB && phaseB.offsetChangingCommits >= 3,
        `commits=${phaseB?.offsetChangingCommits}`);
    } else {
      checks.check('H-MC-MOUNT-JITTER-R1 CORE phase-B: symbol swap offsetChangingCommits <= 1',
        phaseB && phaseB.offsetChangingCommits <= 1,
        `commits=${phaseB?.offsetChangingCommits} traceLen=${phaseB?.traceLog?.length ?? 0}`);
    }

    notes.push(`H-MC-MOUNT-JITTER-R1 mount coalesce ${coalesceOff ? 'OFF' : 'ON'}: `
      + `phaseA commits=${phaseA?.offsetChangingCommits} phaseB commits=${phaseB?.offsetChangingCommits} `
      + `traceA=${phaseA?.traceLog?.length ?? 0} traceB=${phaseB?.traceLog?.length ?? 0}`);
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
    { id: 'H-R09-LR', title: 'H-R09 live-resolve lag pin (panel B single-click + parent bar)', run: hR09Lr },
    { id: 'H-A7b-R2', title: 'D-029 R2: multichart anchored VP must not crush price/time axes', run: hA7bR2 },
    { id: 'H-A7b-R2b', title: 'D-029 R2b: VP anchor handle resize survives axis-margin floor', run: hA7bR2b },
    { id: 'H-S80', title: 'PLAN2-FOUND#6: panel TF label sync after refresh (built V9)', run: hS80React },
    { id: 'H-A8-VP-1', title: 'A8-VP-1: anchored VP V9 label bridge (Price/Time toggles → engine + axis highlights)', run: hA8Vp1 },
    { id: 'H-A8-VP-2', title: 'A8-VP-2: anchored VP coord tab ↔ canvas anchor sync', run: hA8Vp2 },
    { id: 'MC-DRAW-FIRSTCLICK-R', title: 'live dist-v9: A armed → unfocused B draw click 1', run: mcDrawFirstclickLive },
    { id: 'MC-DRAW-FIRSTCLICK-2-R', title: 'live dist-v9: B armed → unfocused A draw click 1', run: mcDrawFirstclickReverseLive },
    { id: 'MC-DRAW-FIRSTCLICK-2-R-SEL', title: 'live dist-v9: B armed → draw A clears peer selection chrome', run: mcDrawFirstclickReverseLivePeerSel },
    { id: 'OT-MS-01', title: 'OT-MS: V9 Layers multi-select highlight via Ctrl+click', run: otMs01 },
    { id: 'OT-MS-02', title: 'OT-MS: V9 Layers multi-select highlight via Ctrl+marquee', run: otMs02 },
    { id: 'OT-MS-03', title: 'OT-MS: 4-up dedupe fence — one shape → one inventory row', run: otMs03 },
    { id: 'H-MC-MOUNT-JITTER-R1', title: 'MC-MOUNT-JITTER: single→multi + symbol swap offset coalesce (react-parity)', run: hMcMountJitterR1 },
  ];
}
