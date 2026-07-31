#!/usr/bin/env node
/**
 * E-DESTROY-INDICATOR-CORRECTNESS-V1
 *
 * Behavior half of destroy(): after panel teardown, indicator state is gone and
 * cannot resurrect from late indicator events. D owns bytes/heap; this oracle
 * owns observable state correctness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_E_DESTROY_INDICATOR_CORRECTNESS_V1';

const oracleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(oracleDir, '../../..');
const evidenceDir = path.join(repoRoot, 'docs/plan3/evidence/E-DESTROY-INDICATOR-CORRECTNESS-20260731');

const PANELS = Object.freeze([
  { id: 'A', symbol: 'XAUUSD', timeframe: '1m' },
  { id: 'B', symbol: 'HOG', timeframe: '5m' },
  { id: 'C', symbol: 'ETHBTC', timeframe: '15m' },
  { id: 'D', symbol: 'BTCEUR', timeframe: '1h' },
]);

function makePanel(cfg) {
  return {
    ...cfg,
    destroyed: false,
    indicators: {
      smaTip: { ownerPanelId: cfg.id, symbol: cfg.symbol, value: cfg.id.charCodeAt(0) },
      openingRange: { ownerPanelId: cfg.id, symbol: cfg.symbol, high: 100 + cfg.id.charCodeAt(0), low: 90 },
    },
  };
}

function makeState() {
  return {
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
      indicators: panel.indicators,
    },
  ]))));
}

function destroyPanel(state, panelId, mode) {
  const panel = state.panels[panelId];
  if (mode === 'withDestroy') {
    panel.destroyed = true;
    panel.indicators = null;
  } else {
    panel.destroyed = true;
    // Legacy/no destroy: instance indicator state remains reachable after panel removal.
  }
}

function lateIndicatorEvent(state, panelId, mode) {
  const panel = state.panels[panelId];
  state.events.push({ type: 'late-indicator-recalc', panelId });
  if (mode === 'withDestroy') return;
  if (!panel.indicators) panel.indicators = {};
  panel.indicators.smaTip = {
    ownerPanelId: panelId,
    symbol: panel.symbol,
    value: 9999,
    resurrected: true,
  };
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
  const state = makeState();
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

function runControl(cell, report, expected = 'GREEN', expectedReason = null) {
  const status = expected === 'GREEN'
    ? (report.status === 'GREEN' ? 'GREEN' : 'RED')
    : (report.status === 'RED' && JSON.stringify(report).includes(expectedReason) ? 'GREEN' : 'RED');
  return { cell, status, expected, expectedReason, report };
}

export function runDestroyIndicatorCorrectnessOracle() {
  const redControls = [
    runControl(
      'DESTROY-NO-DESTROY-RESURRECTS-INDICATOR',
      runDestroyIndicatorSuite('noDestroy'),
      'RED',
      'destroy-indicator-resurrected',
    ),
  ];
  const greenControls = [
    runControl(
      'DESTROY-WITH-DESTROY-CLEARS-INDICATORS',
      runDestroyIndicatorSuite('withDestroy'),
      'GREEN',
    ),
  ];
  const status = redControls.every((control) => control.status === 'GREEN')
    && greenControls.every((control) => control.status === 'GREEN')
    ? 'GREEN'
    : 'RED';
  return {
    signature: SIGNATURE,
    status,
    redControls,
    greenControls,
    limitation: 'Model behavior oracle only. D owns retained bytes/heap; A or D product destroy code should wire this behavior into the real panel teardown once available.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runDestroyIndicatorCorrectnessOracle();
  fs.mkdirSync(evidenceDir, { recursive: true });
  const outPath = path.join(evidenceDir, 'destroy-indicator-correctness-red.json');
  fs.writeFileSync(outPath, `${JSON.stringify({ ...report, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(JSON.stringify({
    outPath,
    status: report.status,
    redControls: report.redControls.map((control) => ({
      cell: control.cell,
      status: control.status,
      reportStatus: control.report.status,
      expectedReason: control.expectedReason,
    })),
    greenControls: report.greenControls.map((control) => ({
      cell: control.cell,
      status: control.status,
      reportStatus: control.report.status,
    })),
  }, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
