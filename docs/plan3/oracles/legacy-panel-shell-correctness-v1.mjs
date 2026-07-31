#!/usr/bin/env node
/**
 * E-LEGACY-PANEL-SHELL-CORRECTNESS-V1
 *
 * Correctness control for A's disclosed risk: the in-page legacy multichart shell
 * is the only shell that constructs secondary charts with a canvas argument, so it
 * is the only shell exercising Chart's `isPanel=true` constructor path.
 *
 * The executable gate lives in tracked oracles/ per PLACE-01. Its JSON output
 * remains local evidence under docs/plan3/evidence/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_E_LEGACY_PANEL_SHELL_CORRECTNESS_V1';

const oracleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(oracleDir, '../../..');
const evidenceDir = path.join(repoRoot, 'docs/plan3/evidence/E-LEGACY-PANEL-SHELL-CORRECTNESS-20260731');

const SOURCE_LEGACY = 'chart v 1.4/chart/legacy-index.html';
const PUBLIC_LEGACY = 'homepage/public/chart/legacy-index.html';
const CHART_JS = 'chart v 1.4/chart/chart.js';

function readRel(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function findLine(text, needle) {
  const index = text.indexOf(needle);
  if (index < 0) return null;
  return text.slice(0, index).split(/\r?\n/).length;
}

function stable(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => stable(item, seen));
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key], seen);
  return out;
}

function inspectStaticReachability() {
  const chartJs = readRel(CHART_JS);
  const sourceLegacy = readRel(SOURCE_LEGACY);
  const publicLegacy = readRel(PUBLIC_LEGACY);

  const constructorPanelPath =
    /constructor\(canvasElement = null, svgElement = null, options = \{\}\)[\s\S]*?if \(canvasElement\) \{[\s\S]*?this\.isPanel = true;[\s\S]*?\} else \{[\s\S]*?document\.getElementById\('chartCanvas'\)[\s\S]*?this\.isPanel = false;/m;
  const legacyPanelCtor =
    /new Chart\(panel\.canvas,\s*panel\.svg,\s*\{\s*panelIndex:\s*panel\.index\s*\}\)/m;
  const legacyPanelGuard =
    /if \(!panel\.canvas \|\| !panel\.svg\) \{[\s\S]*?return;[\s\S]*?\}/m;
  const activeChartRouter =
    /window\.getActiveChart = function\(\) \{[\s\S]*?panel\.chartInstance[\s\S]*?return panel\.chartInstance;/m;

  return {
    chartConstructor: {
      path: CHART_JS,
      reachesCanvasPanelPath: constructorPanelPath.test(chartJs),
      constructorLine: findLine(chartJs, 'constructor(canvasElement = null, svgElement = null, options = {})'),
      panelTrueLine: findLine(chartJs, 'this.isPanel = true;'),
      mainFalseLine: findLine(chartJs, 'this.isPanel = false;'),
    },
    legacySource: {
      path: SOURCE_LEGACY,
      constructsPanelWithCanvas: legacyPanelCtor.test(sourceLegacy),
      requiresPanelCanvasAndSvg: legacyPanelGuard.test(sourceLegacy),
      routesActivePanelChart: activeChartRouter.test(sourceLegacy),
      constructorLine: findLine(sourceLegacy, 'const panelChart = new Chart(panel.canvas, panel.svg, { panelIndex: panel.index });'),
      manualPanelLine: findLine(sourceLegacy, 'panelChart.isPanel = true;'),
      activeChartLine: findLine(sourceLegacy, 'window.getActiveChart = function()'),
    },
    legacyPublicMirror: {
      path: PUBLIC_LEGACY,
      constructsPanelWithCanvas: legacyPanelCtor.test(publicLegacy),
      requiresPanelCanvasAndSvg: legacyPanelGuard.test(publicLegacy),
      routesActivePanelChart: activeChartRouter.test(publicLegacy),
      constructorLine: findLine(publicLegacy, 'const panelChart = new Chart(panel.canvas, panel.svg, { panelIndex: panel.index });'),
      manualPanelLine: findLine(publicLegacy, 'panelChart.isPanel = true;'),
      activeChartLine: findLine(publicLegacy, 'window.getActiveChart = function()'),
    },
  };
}

function constructChart({ canvas, svg, options = {}, mode = 'normal' }) {
  const isPanelAtConstructor = mode === 'forceMainAtConstructor' ? false : !!canvas;
  return {
    isPanel: isPanelAtConstructor,
    canvasId: canvas ? canvas.id : 'chartCanvas',
    svgId: svg ? svg.id : 'drawingSvg',
    panelIndex: options.panelIndex,
    sideEffects: isPanelAtConstructor
      ? ['panel-drawing-manager', 'panel-context-menu']
      : ['main-toolbar', 'main-settings-menu', 'main-replay-system', 'global-axis-forwarders'],
  };
}

function initLegacyPanel(mode = 'normal') {
  const panel = {
    id: 'legacy-panel-1',
    index: 1,
    isMainChart: false,
    canvas: mode === 'missingCanvas' ? null : { id: 'legacy-panel-1-canvas' },
    svg: { id: 'legacy-panel-1-svg' },
    chartInstance: null,
  };

  if (panel.isMainChart) return { panel, chart: panel.chartInstance, failures: [] };
  if (!panel.canvas || !panel.svg) {
    return {
      panel,
      chart: null,
      failures: [{ reason: 'legacy-panel-unconstructed', detail: 'panel canvas/svg guard returned before Chart construction' }],
    };
  }

  const chart = constructChart({
    canvas: panel.canvas,
    svg: panel.svg,
    options: { panelIndex: panel.index },
    mode,
  });
  chart.panel = panel;
  chart.panelIndex = panel.index;

  // Legacy sets this manually after construction, but this cannot undo main-only
  // constructor side effects if the constructor entered the main path.
  if (mode !== 'normalNoManualPanelFlag') chart.isPanel = true;

  panel.chartInstance = chart;
  return { panel, chart, failures: legacyPanelFailures(chart) };
}

function legacyPanelFailures(chart) {
  const failures = [];
  if (!chart) {
    failures.push({ reason: 'legacy-panel-unconstructed' });
    return failures;
  }
  if (chart.isPanel !== true) {
    failures.push({ reason: 'legacy-panel-not-panel-mode', observed: chart.isPanel });
  }
  if (chart.panelIndex !== 1) {
    failures.push({ reason: 'legacy-panel-index-missing', observed: chart.panelIndex });
  }
  if (chart.canvasId === 'chartCanvas') {
    failures.push({ reason: 'legacy-panel-bound-to-main-canvas', observed: chart.canvasId });
  }
  const mainEffects = chart.sideEffects.filter((effect) => effect.startsWith('main-') || effect.startsWith('global-'));
  if (mainEffects.length) {
    failures.push({ reason: 'legacy-panel-main-side-effects', sideEffects: mainEffects });
  }
  return failures;
}

function routeLegacyTool(mode = 'activePanel') {
  const mainChart = { id: 'main', drawingTool: null };
  const { chart: panelChart } = initLegacyPanel('normal');
  const selectedPanel = { chartInstance: panelChart };
  const target = mode === 'fallbackMain' ? mainChart : selectedPanel.chartInstance;
  target.drawingTool = 'trendline';
  return {
    mode,
    mainChart,
    panelChart,
    failures: target === panelChart && mainChart.drawingTool === null && panelChart.drawingTool === 'trendline'
      ? []
      : [{ reason: 'legacy-panel-action-routed-to-main', mainDrawingTool: mainChart.drawingTool, panelDrawingTool: panelChart.drawingTool }],
  };
}

function runBehaviorCase(cell, report, expected = 'GREEN', expectedFailureReason = null) {
  const failures = report.failures || [];
  const reportStatus = failures.length ? 'RED' : 'GREEN';
  const snapshot = stable(report);
  const status = expected === 'GREEN'
    ? (reportStatus === 'GREEN' ? 'GREEN' : 'RED')
    : (reportStatus === 'RED' && JSON.stringify(snapshot).includes(expectedFailureReason) ? 'GREEN' : 'RED');
  return { cell, status, expected, expectedFailureReason, report: snapshot };
}

export function runLegacyPanelShellCorrectnessOracle() {
  const staticReachability = inspectStaticReachability();
  const staticFailures = [];

  if (!staticReachability.chartConstructor.reachesCanvasPanelPath) {
    staticFailures.push({ reason: 'chart-constructor-panel-path-not-found', path: CHART_JS });
  }
  for (const entry of [staticReachability.legacySource, staticReachability.legacyPublicMirror]) {
    if (!entry.constructsPanelWithCanvas) staticFailures.push({ reason: 'legacy-panel-chart-constructor-not-found', path: entry.path });
    if (!entry.requiresPanelCanvasAndSvg) staticFailures.push({ reason: 'legacy-panel-canvas-svg-guard-not-found', path: entry.path });
    if (!entry.routesActivePanelChart) staticFailures.push({ reason: 'legacy-active-chart-router-not-found', path: entry.path });
  }

  const greenControls = [
    runBehaviorCase('LEGACY-PANEL-CONSTRUCTOR-PATH', initLegacyPanel('normal'), 'GREEN'),
    runBehaviorCase('LEGACY-ACTIVE-PANEL-ROUTING', routeLegacyTool('activePanel'), 'GREEN'),
  ];
  const redControls = [
    runBehaviorCase('LEGACY-PANEL-MISSING-CANVAS', initLegacyPanel('missingCanvas'), 'RED', 'legacy-panel-unconstructed'),
    runBehaviorCase('LEGACY-PANEL-CONSTRUCTED-AS-MAIN', initLegacyPanel('forceMainAtConstructor'), 'RED', 'legacy-panel-main-side-effects'),
    runBehaviorCase('LEGACY-ACTIVE-CHART-FALLBACK-MAIN', routeLegacyTool('fallbackMain'), 'RED', 'legacy-panel-action-routed-to-main'),
  ];

  const status = staticFailures.length === 0
    && greenControls.every((control) => control.status === 'GREEN')
    && redControls.every((control) => control.status === 'GREEN')
    ? 'GREEN'
    : 'RED';

  return {
    signature: SIGNATURE,
    status,
    staticReachability,
    staticFailures,
    greenControls,
    redControls,
    limitation: 'Static plus model behavior oracle. It proves legacy shell reachability and failure controls; it is not a browser reproduction of the 791x849 to 449x700 resize case.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runLegacyPanelShellCorrectnessOracle();
  fs.mkdirSync(evidenceDir, { recursive: true });
  const outPath = path.join(evidenceDir, 'legacy-panel-shell-correctness-red.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
