#!/usr/bin/env node
/**
 * Non-auth control for the disclosed legacy-index.html isPanel risk.
 *
 * A's packet disclosed that the only shell reaching the new constructor
 * isPanel path is legacy-index.html. This gate is static on purpose: the page
 * itself redirects to login, but the shell wiring can be checked without auth.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const LEGACY_INDEX_PANEL_PATH_SIGNATURE = 'TALARIA_LEGACY_INDEX_PANEL_PATH_V1';

const LEGACY_INDEX_PATH = 'chart v 1.4/chart/legacy-index.html';
const INDEX_PATH = 'chart v 1.4/chart/index.html';
const CHART_JS_PATH = 'chart v 1.4/chart/chart.js';

function readRepoFile(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

export function evaluateLegacyIndexPanelPath({
  indexSource = readRepoFile(INDEX_PATH),
  legacyIndexSource = readRepoFile(LEGACY_INDEX_PATH),
  chartJsSource = readRepoFile(CHART_JS_PATH),
} = {}) {
  const indexLinksLegacyShell = /href\s*=\s*["']\/chart\/legacy-index\.html["']/.test(indexSource);
  const legacyAuthRedirectPresent = /fetch\s*\(\s*['"]\/api\/auth\/me['"][\s\S]*?redirectToLogin/.test(legacyIndexSource);
  const panelConstructorCall = /new\s+Chart\s*\(\s*panel\.canvas\s*,\s*panel\.svg\s*,\s*\{\s*panelIndex\s*:\s*panel\.index\s*\}\s*\)/.test(legacyIndexSource);
  const explicitPanelFlag = /panelChart\.isPanel\s*=\s*true/.test(legacyIndexSource);
  const constructorCanvasArgSetsPanel = /constructor\s*\(\s*canvasElement\s*=\s*null[\s\S]*?if\s*\(\s*canvasElement\s*\)\s*\{[\s\S]*?this\.canvas\s*=\s*canvasElement\s*;[\s\S]*?this\.isPanel\s*=\s*true\s*;/m.test(chartJsSource);
  const failures = [];
  if (!indexLinksLegacyShell) failures.push('chart/index.html no longer links to /chart/legacy-index.html');
  if (!legacyAuthRedirectPresent) failures.push('legacy-index auth redirect marker missing');
  if (!panelConstructorCall) failures.push('legacy-index does not construct panels via new Chart(panel.canvas, panel.svg, { panelIndex })');
  if (!explicitPanelFlag) failures.push('legacy-index no longer explicitly marks panelChart.isPanel = true');
  if (!constructorCanvasArgSetsPanel) failures.push('Chart constructor no longer sets this.isPanel=true for canvasElement path');

  return {
    signature: LEGACY_INDEX_PANEL_PATH_SIGNATURE,
    cell: 'LEGACY-INDEX-ISPANEL-PATH',
    status: failures.length ? 'RED' : 'GREEN',
    files: [INDEX_PATH, LEGACY_INDEX_PATH, CHART_JS_PATH],
    indexLinksLegacyShell,
    legacyAuthRedirectPresent,
    panelConstructorCall,
    explicitPanelFlag,
    constructorCanvasArgSetsPanel,
    authRequired: false,
    limitation: 'Static shell wiring gate. It covers the legacy-index isPanel path without auth; it does not prove browser resize behavior.',
    failures,
  };
}

export function runLegacyIndexPanelPathRedControls() {
  const legacy = readRepoFile(LEGACY_INDEX_PATH);
  const index = readRepoFile(INDEX_PATH);
  const chart = readRepoFile(CHART_JS_PATH);
  const controls = [
    {
      cell: 'RED-LEGACY-INDEX-LINK-REMOVED',
      report: evaluateLegacyIndexPanelPath({
        indexSource: index.replace(/href\s*=\s*["']\/chart\/legacy-index\.html["']/, 'href="/chart/missing-legacy-index.html"'),
        legacyIndexSource: legacy,
        chartJsSource: chart,
      }),
    },
    {
      cell: 'RED-LEGACY-PANEL-CONSTRUCTOR-REMOVED',
      report: evaluateLegacyIndexPanelPath({
        indexSource: index,
        legacyIndexSource: legacy.replace(/new\s+Chart\s*\(\s*panel\.canvas\s*,\s*panel\.svg\s*,\s*\{\s*panelIndex\s*:\s*panel\.index\s*\}\s*\)/, 'new Chart()'),
        chartJsSource: chart,
      }),
    },
    {
      cell: 'RED-CHART-CONSTRUCTOR-DOES-NOT-SET-ISPANEL',
      report: evaluateLegacyIndexPanelPath({
        indexSource: index,
        legacyIndexSource: legacy,
        chartJsSource: chart.replace(/this\.isPanel\s*=\s*true\s*;/, 'this.isPanel = false;'),
      }),
    },
  ];
  return controls.map((control) => ({
    ...control,
    status: control.report.status === 'RED' ? 'GREEN' : 'RED',
    expected: 'RED',
    reportStatus: control.report.status,
  }));
}

export function runLegacyIndexPanelPathGate() {
  const green = evaluateLegacyIndexPanelPath();
  const redControls = runLegacyIndexPanelPathRedControls();
  const redControlFailures = redControls.filter((c) => c.status !== 'GREEN');
  const status = green.status === 'GREEN' && redControlFailures.length === 0 ? 'GREEN' : 'RED';
  return {
    signature: LEGACY_INDEX_PANEL_PATH_SIGNATURE,
    status,
    green,
    redControls,
    limitation: 'Non-auth static control only. Browser reproduction remains A/product territory.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runLegacyIndexPanelPathGate();
  const outPath = process.env.LEGACY_INDEX_PANEL_PATH_OUT
    ? resolve(root, process.env.LEGACY_INDEX_PANEL_PATH_OUT)
    : resolve(root, 'docs/plan3/LEGACY-INDEX-ISPANEL-PATH-GATE-20260731.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  mkdirSync(resolve(root, '../_evidence/manager-D'), { recursive: true });
  writeFileSync(resolve(root, '../_evidence/manager-D/LEGACY-INDEX-ISPANEL-PATH-GATE-20260731.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
