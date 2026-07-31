#!/usr/bin/env node
/**
 * E-FOCUS-DESTROY-CORRECTNESS-V1
 *
 * Model correctness controls for two Phase 4 hazards:
 * 1. Focus-aware keyboard/mouse routing in a single realm.
 * 2. Destroy-time indicator behavior: after teardown, indicator state is gone
 *    and cannot resurrect from late events.
 *
 * This is the behavior half only. D owns bytes/heap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_E_FOCUS_DESTROY_CORRECTNESS_V1';

const PANELS = Object.freeze([
  { id: 'A', symbol: 'XAUUSD', timeframe: '1m', canvasLeft: 0 },
  { id: 'B', symbol: 'HOG', timeframe: '5m', canvasLeft: 1981 },
  { id: 'C', symbol: 'ETHBTC', timeframe: '15m', canvasLeft: 760 },
  { id: 'D', symbol: 'BTCEUR', timeframe: '1h', canvasLeft: 1260 },
]);

function makePanel(cfg) {
  return {
    ...cfg,
    destroyed: false,
    keyboardCount: 0,
    mouseCount: 0,
    mouseX: null,
    canvasRect: { left: cfg.canvasLeft, width: 700 },
    indicators: {
      smaTip: { ownerPanelId: cfg.id, symbol: cfg.symbol, value: cfg.id.charCodeAt(0) },
      openingRange: { ownerPanelId: cfg.id, symbol: cfg.symbol, high: 100 + cfg.id.charCodeAt(0), low: 90 },
    },
  };
}

function makeState(focusedPanelId = 'B') {
  return {
    focusedPanelId,
    windowChartId: 'A',
    panels: Object.fromEntries(PANELS.map((cfg) => [cfg.id, makePanel(cfg)])),
    events: [],
  };
}

function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

function snapshotPanels(state) {
  return JSON.stringify(stable(Object.fromEntries(Object.entries(state.panels).map(([id, panel]) => [
    id,
    {
      destroyed: panel.destroyed,
      keyboardCount: panel.keyboardCount,
      mouseCount: panel.mouseCount,
      mouseX: panel.mouseX,
      indicators: panel.indicators,
    },
  ]))));
}

function routeKeyboard(state, mode) {
  const targetId = mode === 'windowChartKeyboard' ? state.windowChartId : state.focusedPanelId;
  state.events.push({ type: 'keyboard', focusedPanelId: state.focusedPanelId, targetId });
  state.panels[targetId].keyboardCount += 1;
}

function routeMouse(state, mode) {
  const clientX = 1188;
  if (mode === 'broadcastMouse') {
    state.events.push({ type: 'mouse', focusedPanelId: state.focusedPanelId, targetId: 'ALL' });
    for (const panel of Object.values(state.panels)) {
      panel.mouseCount += 1;
      panel.mouseX = clientX - panel.canvasRect.left;
    }
    return;
  }
  const targetId = mode === 'windowChartMouse' ? state.windowChartId : state.focusedPanelId;
  const rectSourceId = mode === 'wrongRectMouse' ? state.windowChartId : targetId;
  state.events.push({ type: 'mouse', focusedPanelId: state.focusedPanelId, targetId, rectSourceId, clientX });
  state.panels[targetId].mouseCount += 1;
  state.panels[targetId].mouseX = clientX - state.panels[rectSourceId].canvasRect.left;
}

function focusRoutingFailures(state, eventKind) {
  const failures = [];
  for (const [id, panel] of Object.entries(state.panels)) {
    const count = eventKind === 'keyboard' ? panel.keyboardCount : panel.mouseCount;
    if (id === state.focusedPanelId) {
      if (count !== 1) failures.push({ panelId: id, reason: `${eventKind}-missed-focused-instance`, count });
      if (eventKind === 'mouse' && count === 1) {
        const expectedMouseX = 1188 - panel.canvasRect.left;
        if (panel.mouseX !== expectedMouseX) {
          failures.push({
            panelId: id,
            reason: 'mouse-coordinate-wrong-instance',
            observedMouseX: panel.mouseX,
            expectedMouseX,
          });
        }
      }
    } else if (count !== 0) {
      failures.push({ panelId: id, reason: `${eventKind}-leaked-to-peer`, count });
    }
  }
  return failures;
}

export function runFocusRoutingSuite(mode = 'scoped') {
  const keyboardState = makeState('B');
  routeKeyboard(keyboardState, mode);
  const keyboardFailures = focusRoutingFailures(keyboardState, 'keyboard');

  const mouseState = makeState(mode === 'wrongRectMouse' ? 'B' : 'C');
  routeMouse(mouseState, mode);
  const mouseFailures = focusRoutingFailures(mouseState, 'mouse');

  return {
    mode,
    status: keyboardFailures.length || mouseFailures.length ? 'RED' : 'GREEN',
    keyboard: {
      focusedPanelId: keyboardState.focusedPanelId,
      windowChartId: keyboardState.windowChartId,
      failures: keyboardFailures,
      snapshot: snapshotPanels(keyboardState),
    },
    mouse: {
      focusedPanelId: mouseState.focusedPanelId,
      windowChartId: mouseState.windowChartId,
      failures: mouseFailures,
      snapshot: snapshotPanels(mouseState),
    },
  };
}

function destroyPanel(state, panelId, mode) {
  const panel = state.panels[panelId];
  if (mode === 'withDestroy') {
    panel.destroyed = true;
    panel.indicators = null;
    panel.keyboardCount = 0;
    panel.mouseCount = 0;
  } else {
    panel.destroyed = true;
    // Legacy/no destroy: instance state remains reachable after panel removal.
  }
}

function lateIndicatorEvent(state, panelId, mode) {
  const panel = state.panels[panelId];
  state.events.push({ type: 'late-indicator-recalc', panelId });
  if (mode === 'withDestroy') return;
  if (!panel.indicators) panel.indicators = {};
  panel.indicators.smaTip = { ownerPanelId: panelId, symbol: panel.symbol, value: 9999, resurrected: true };
}

function destroyFailures(state, panelId) {
  const panel = state.panels[panelId];
  const failures = [];
  if (!panel.destroyed) failures.push({ panelId, reason: 'panel-not-destroyed' });
  if (panel.indicators && Object.keys(panel.indicators).length) {
    failures.push({ panelId, reason: 'destroy-indicator-resurrected', indicators: panel.indicators });
  }
  return failures;
}

export function runDestroyIndicatorSuite(mode = 'noDestroy') {
  const state = makeState('B');
  destroyPanel(state, 'C', mode);
  lateIndicatorEvent(state, 'C', mode);
  const failures = destroyFailures(state, 'C');
  return {
    mode,
    status: failures.length ? 'RED' : 'GREEN',
    destroyedPanelId: 'C',
    failures,
    snapshot: snapshotPanels(state),
  };
}

export function runRedControls() {
  const controls = [
    {
      cell: 'FOCUS-KEYBOARD-WINDOW-CHART',
      report: runFocusRoutingSuite('windowChartKeyboard'),
      expectedFailureReason: 'keyboard-missed-focused-instance',
    },
    {
      cell: 'FOCUS-MOUSE-WINDOW-CHART',
      report: runFocusRoutingSuite('windowChartMouse'),
      expectedFailureReason: 'mouse-missed-focused-instance',
    },
    {
      cell: 'FOCUS-MOUSE-WRONG-RECT',
      report: runFocusRoutingSuite('wrongRectMouse'),
      expectedFailureReason: 'mouse-coordinate-wrong-instance',
    },
    {
      cell: 'FOCUS-MOUSE-BROADCAST',
      report: runFocusRoutingSuite('broadcastMouse'),
      expectedFailureReason: 'mouse-leaked-to-peer',
    },
    {
      cell: 'DESTROY-NO-DESTROY-RESURRECTS-INDICATOR',
      report: runDestroyIndicatorSuite('noDestroy'),
      expectedFailureReason: 'destroy-indicator-resurrected',
    },
  ];
  return controls.map((control) => ({
    ...control,
    status: control.report.status === 'RED'
      && JSON.stringify(control.report).includes(control.expectedFailureReason)
      ? 'GREEN'
      : 'RED',
  }));
}

export function runGreenControls() {
  return [
    {
      cell: 'FOCUS-SCOPED-ROUTING',
      report: runFocusRoutingSuite('scoped'),
      status: runFocusRoutingSuite('scoped').status === 'GREEN' ? 'GREEN' : 'RED',
    },
    {
      cell: 'DESTROY-WITH-DESTROY-CLEARS-INDICATORS',
      report: runDestroyIndicatorSuite('withDestroy'),
      status: runDestroyIndicatorSuite('withDestroy').status === 'GREEN' ? 'GREEN' : 'RED',
    },
  ];
}

export function runFocusDestroyCorrectnessOracle() {
  const redControls = runRedControls();
  const greenControls = runGreenControls();
  const status = redControls.every((c) => c.status === 'GREEN')
    && greenControls.every((c) => c.status === 'GREEN')
    ? 'GREEN'
    : 'RED';
  return {
    signature: SIGNATURE,
    status,
    redControls,
    greenControls,
    limitation: 'Model behavior oracle; wire into real single-realm input routing and Chart.destroy once A lands product code.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runFocusDestroyCorrectnessOracle();
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(outDir, 'focus-destroy-correctness-red.json');
  fs.writeFileSync(outPath, `${JSON.stringify({ ...report, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(JSON.stringify({
    outPath,
    status: report.status,
    redControls: report.redControls.map((c) => ({
      cell: c.cell,
      status: c.status,
      reportStatus: c.report.status,
      expectedFailureReason: c.expectedFailureReason,
    })),
    greenControls: report.greenControls.map((c) => ({
      cell: c.cell,
      status: c.status,
      reportStatus: c.report.status,
    })),
  }, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
