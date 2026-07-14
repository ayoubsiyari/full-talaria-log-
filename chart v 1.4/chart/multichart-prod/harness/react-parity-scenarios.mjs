/**
 * react-parity-scenarios.mjs — T0 step 8 automated MULTICHART-PARITY-CHECKLIST
 * rows against the real React MultichartGrid (dev:live mount).
 *
 * IDs H-R01..H-R09 map to checklist rows 1..9 (host tile A + iframe panel B).
 * H-R12 = T1 step 12 iframe panel-B gear → parent settings (proven GREEN).
 */

import {
  makeChecks,
  runWithReact,
  focusReactPanel,
  seedDrawing,
  singleClickDrawing,
  doubleClickDrawing,
  ctrlClickDrawing,
  ctrlDragMarquee,
  readSelectionChrome,
  readParentReactSettings,
  pressEscapeReact,
  waitForIframeGearReady,
  clickIframeGear,
  waitForPanelSettle,
  panelFrameMap,
  reactDefaultTrendlinePoints,
  reactDefaultRectanglePoints,
  FALLBACK_TRENDLINE_POINTS,
} from './react-parity-lib.mjs';
import {
  chartTarget,
  placeTool,
  readInteractiveState,
  readRenderCount,
  assertCanvasRepainted,
  assertMenuState,
  assertNoGhostAfterDelete,
  readParentSettingsProbe,
  openSettings,
  deleteToolViaSettings,
} from './interactive-helpers.mjs';

async function forPanels(fn) {
  return { host: await fn('A'), panelB: await fn('B') };
}

// ── H-R01 — Row 1: single-click select (host + panel B) ─────────────────
async function hR01(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    checks.check('H-R01 L1: build id on host + panel B', boot.buildIds.ok,
      JSON.stringify(boot.buildIds));

    const seeded = await forPanels(async (pid) => {
      const tool = await seedDrawing(page, pid, 'trendline');
      await focusReactPanel(page, pid);
      const frame = chartTarget(page, pid);
      const armed = await frame.evaluate(() => {
        const dm = window.chart && window.chart.drawingManager;
        if (!dm) return null;
        dm.setTool('trendline');
        return dm.currentTool;
      });
      return { tool, armed };
    });

    for (const [label, side] of [['host', seeded.host], ['panelB', seeded.panelB]]) {
      const { tool, armed } = side;
      checks.check(`H-R01 setup (${label}): trendline placed`, tool && tool.id, tool ? tool.id : 'null');
      checks.check(`H-R01 setup (${label}): draw tool re-armed`, armed === 'trendline', `tool=${armed}`);
      const before = await readInteractiveState(page, label === 'host' ? 'A' : 'B');
      checks.check(`H-R01 setup (${label}): not selected before click`,
        before && before.selectedIds.length === 0, JSON.stringify(before?.selectedIds));
      const pid = label === 'host' ? 'A' : 'B';
      const click = await singleClickDrawing(page, pid, tool.id);
      checks.check(`H-R01 probe (${label}): single click dispatched`, click && click.ok, click?.reason || '');
      const after = await readInteractiveState(page, pid);
      assertMenuState(checks, `H-R01 CORE (${label}): first click selects + shows Quick Menu`, {
        selectedIds: [tool.id],
        toolbarVisible: true,
      }, after);
    }
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
      await singleClickDrawing(page, pid, tool.id);
      const chrome = await readSelectionChrome(page, pid, tool.id);
      checks.check(`H-R02 CORE (${label}): drawing selected with visible chrome`,
        chrome && chrome.ok && chrome.selected && chrome.hasBlueBorder,
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
      const pts1 = await reactDefaultTrendlinePoints(page, pid);
      const pts2 = pts1.map((p, i) => ({ x: p.x + 30, y: p.y - (i === 0 ? 0.001 : 0.0008) }));
      const first = await placeTool(page, pid, 'trendline', pts1);
      const second = await placeTool(page, pid, 'trendline', pts2);
      checks.check(`H-R03 setup (${label}): two trendlines placed`,
        first && first.id && second && second.id, `${first?.id},${second?.id}`);
      await focusReactPanel(page, pid);
      await singleClickDrawing(page, pid, first.id);
      await ctrlClickDrawing(page, pid, second.id);
      await waitForPanelSettle(page, pid);
      const after = await readInteractiveState(page, pid);
      const expected = [String(first.id), String(second.id)].sort();
      const actual = (after?.selectedIds || []).map(String).sort();
      checks.check(`H-R03 CORE (${label}): Ctrl-select keeps both (no double-toggle)`,
        expected.length === 2 && actual.length === 2 && expected.every((id, i) => id === actual[i]),
        `selected=${JSON.stringify(after?.selectedIds)} expected=${JSON.stringify(expected)}`);
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
      await singleClickDrawing(page, pid, tool.id);
      const openRes = await openSettings(page, pid, tool);
      checks.check(`H-R04 probe (${label}): settings open invoked`, openRes && openRes.ok, openRes?.reason || '');
      await waitForPanelSettle(page, pid);
      const parent = await readParentReactSettings(page);
      const local = await readInteractiveState(page, pid);
      const settingsOpen = parent.open || (local && local.settingsOpen);
      checks.check(`H-R04 CORE (${label}): settings stay open after open`,
        !!settingsOpen,
        `parent=${JSON.stringify(parent)} local.settingsOpen=${local?.settingsOpen}`);
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
      await openSettings(page, pid, tool);
      await waitForPanelSettle(page, pid);
      await pressEscapeReact(page, pid);
      const after = await readInteractiveState(page, pid);
      const parent = await readParentSettingsProbe(page);
      checks.check(`H-R05 CORE (${label}): Esc deselects drawing`,
        after && after.selectedIds.length === 0, JSON.stringify(after?.selectedIds));
      checks.check(`H-R05 CORE (${label}): Esc closes settings surfaces`,
        !after?.toolbarVisible && !parent.open,
        `toolbar=${after?.toolbarVisible} parentOpen=${parent.open}`);
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
      await singleClickDrawing(page, pid, tool.id);
      await openSettings(page, pid, tool);
      await waitForPanelSettle(page, pid);
      const rendersBefore = await readRenderCount(page, pid);
      const delRes = await deleteToolViaSettings(page, pid, tool);
      checks.check(`H-R06 probe (${label}): delete invoked`, delRes && delRes.ok, delRes?.reason || '');
      await waitForPanelSettle(page, pid);
      const after = await readInteractiveState(page, pid);
      const rendersAfter = await readRenderCount(page, pid);
      checks.check(`H-R06 CORE (${label}): drawing removed from store`,
        after && after.drawingCount === 0, `count=${after?.drawingCount}`);
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

    const hostTool = await placeTool(page, 'A', 'trendline', await reactDefaultTrendlinePoints(page, 'A'));
    checks.check('H-R07 setup: host trendline placed', hostTool && hostTool.id, hostTool ? hostTool.id : 'null');
    await singleClickDrawing(page, 'A', hostTool.id);
    await waitForPanelSettle(page, 'A');

    const panelTool = await placeTool(page, 'B', 'rectangle', await reactDefaultRectanglePoints(page, 'B'));
    checks.check('H-R07 setup: panel-B rectangle placed', panelTool && panelTool.id, panelTool ? panelTool.id : 'null');
    await focusReactPanel(page, 'B');
    await singleClickDrawing(page, 'B', panelTool.id);
    await waitForPanelSettle(page, 'B');

    const host = await readInteractiveState(page, 'A');
    const panel = await readInteractiveState(page, 'B');
    const totalSelected = (host?.selectedIds?.length || 0) + (panel?.selectedIds?.length || 0);
    checks.check(
      'H-R07 CORE: exactly one selected drawing globally after cross-panel select',
      totalSelected === 1 && host?.selectedIds?.length === 0 && panel?.selectedIds?.[0] === panelTool.id,
      `A.selected=${JSON.stringify(host?.selectedIds)} B.selected=${JSON.stringify(panel?.selectedIds)}`,
    );
    checks.check(
      'H-R07 CORE: host quick menu cleared when panel B owns selection',
      !host?.toolbarVisible,
      `A.toolbarVisible=${host?.toolbarVisible}`,
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
      const pts1 = await reactDefaultTrendlinePoints(page, pid);
      const pts2 = pts1.map((p, i) => ({ x: p.x + 25, y: p.y - (i === 0 ? 0.001 : 0.0008) }));
      await placeTool(page, pid, 'trendline', pts1);
      await placeTool(page, pid, 'trendline', pts2);
      await focusReactPanel(page, pid);
      const frame = pid === 'A' ? page : panelFrameMap(page)[pid];
      await frame.evaluate(() => {
        const dm = window.chart.drawingManager;
        if (typeof dm.deselectAll === 'function') dm.deselectAll();
      });
      await waitForPanelSettle(page, pid);
      const drag = await ctrlDragMarquee(page, pid);
      checks.check(`H-R08 probe (${label}): Ctrl+drag dispatched`, drag && drag.ok, drag?.reason || '');
      checks.check(`H-R08 CORE (${label}): blue marquee border draws during Ctrl+drag`,
        drag && drag.during && drag.during.active && drag.during.w > 8 && drag.during.h > 8,
        JSON.stringify(drag?.during));
      const after = await readInteractiveState(page, pid);
      checks.check(`H-R08 CORE (${label}): marquee multi-selects enclosed tools`,
        after && after.selectedIds.length >= 2,
        `selected=${JSON.stringify(after?.selectedIds)}`);
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
      const click1 = await singleClickDrawing(page, pid, tool.id);
      checks.check(`H-R09 probe (${label}): single click`, click1 && click1.ok, click1?.reason || '');
      const afterSingle = await readInteractiveState(page, pid);
      assertMenuState(checks, `H-R09 CORE (${label}): single click selects + quick menu`, {
        selectedIds: [tool.id],
        toolbarVisible: true,
      }, afterSingle);

      const dbl = await doubleClickDrawing(page, pid, tool.id);
      checks.check(`H-R09 probe (${label}): double click`, dbl && dbl.ok, dbl?.reason || '');
      await waitForPanelSettle(page, pid);
      const settings = await readParentReactSettings(page);
      const localSettings = await readInteractiveState(page, pid);
      const settingsOpen = settings.open || (localSettings && localSettings.settingsOpen);
      checks.check(`H-R09 CORE (${label}): double click opens settings`,
        !!settingsOpen, JSON.stringify(settings));

      await pressEscapeReact(page, pid);
      const afterEsc = await readInteractiveState(page, pid);
      const parent = await readParentSettingsProbe(page);
      checks.check(`H-R09 CORE (${label}): Esc deselects after chain`,
        afterEsc && afterEsc.selectedIds.length === 0, JSON.stringify(afterEsc?.selectedIds));
      checks.check(`H-R09 CORE (${label}): Esc closes settings after chain`,
        !afterEsc?.toolbarVisible && !parent.open,
        `toolbar=${afterEsc?.toolbarVisible} parentOpen=${parent.open}`);
    }
    return checks;
  });
}

// ── H-R12 — T1 step 12: iframe panel-B gear → parent settings (GREEN) ───
async function hR12(ctx) {
  return runWithReact(ctx, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    await focusReactPanel(page, 'B');
    const placed = await placeTool(page, 'B', 'trendline', [
      { x: 30, y: 100 },
      { x: 50, y: 120 },
    ]);
    checks.check('H-R12 setup: panel-B trendline placed', placed && placed.id, placed ? placed.id : 'null');

    const frameB = panelFrameMap(page).B;
    await frameB.evaluate((drawId) => {
      const dm = window.chart.drawingManager;
      const d = dm.drawings.find((x) => x && String(x.id) === String(drawId));
      if (!d) throw new Error(`drawing ${drawId} not found`);
      dm.selectDrawing(d, false);
    }, placed.id);

    const ready = await waitForIframeGearReady(frameB, placed.id);
    checks.check('H-R12 probe: gear-ready settle signal',
      ready && ready.ok, JSON.stringify(ready?.detail || ready));

    const click = await clickIframeGear(frameB);
    checks.check('H-R12 probe: immediate gear click', click && click.ok, click?.reason || '');

    const settings = await readParentReactSettings(page);
    checks.check('H-R12 CORE: parent settings open after iframe gear click',
      settings.open && settings.hasStyleSection,
      JSON.stringify(settings));

    return checks;
  });
}

export function reactScenarioList() {
  return [
    { id: 'H-R12', title: 'T1 step 12: iframe panel-B gear opens parent settings', run: hR12 },
    { id: 'H-R01', title: 'parity row 1: single-click select (host + panel B)', run: hR01 },
    { id: 'H-R02', title: 'parity row 2: blue selection border (host + panel B)', run: hR02 },
    { id: 'H-R03', title: 'parity row 3: Ctrl-click multi-select (host + panel B)', run: hR03 },
    { id: 'H-R04', title: 'parity row 4: settings open/stays (host + panel B)', run: hR04 },
    { id: 'H-R05', title: 'parity row 5: Esc closes settings + deselects (host + panel B)', run: hR05 },
    { id: 'H-R06', title: 'parity row 6: delete repaints without ghost (host + panel B)', run: hR06 },
    { id: 'H-R07', title: 'parity row 7: peer isolation on cross-panel select', run: hR07 },
    { id: 'H-R08', title: 'parity row 8: Ctrl+drag marquee (host + panel B)', run: hR08 },
    { id: 'H-R09', title: 'parity row 9: single→double-click chain + Esc (host + panel B)', run: hR09 },
  ];
}
