#!/usr/bin/env node
/**
 * M8 load-toll budget gate.
 *
 * M1's app-ready lower bound named the defect. M8 acceptance is stricter: the
 * budget sample must begin at navigation start so the peak cannot hide before
 * the harness begins observing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  B_M1_MEASUREMENT_STAMP,
  B_HOST_TRANSIENT_LOWER_BOUND,
  runLiveNavigationStartHarness,
} from './m1-b120-load-transient-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const M8_LOAD_TOLL_BUDGET_SIGNATURE = 'TALARIA_M8_LOAD_TOLL_BUDGET_V1';
export const M8_LOAD_TOLL_DEFAULT_BUDGET_MB = 50;

function decodedMB(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 100) / 100;
}

function hasNavigationStartSample(samples, sampleMs = 250) {
  return (samples || []).some((sample) => (
    sample
    && sample.sampleOrigin === 'navigation-start'
    && Number.isFinite(Number(sample.elapsedMs))
    && Number(sample.elapsedMs) <= sampleMs
  ));
}

export function classifyM8LoadTollBudget(samples, opts = {}) {
  const budgetMB = opts.budgetMB ?? M8_LOAD_TOLL_DEFAULT_BUDGET_MB;
  const sampleMs = opts.sampleMs ?? 250;
  const rows = (samples || []).filter(Boolean);
  if (!rows.length) {
    return { status: 'RED', reason: 'no-load-toll-samples', budgetMB };
  }
  const peak = rows.reduce((best, row) => (
    Number(row.decodedPixelFloorBytes || 0) > Number(best.decodedPixelFloorBytes || 0) ? row : best
  ), rows[0]);
  const peakDecodedMB = decodedMB(peak.decodedPixelFloorBytes);
  if (!hasNavigationStartSample(rows, sampleMs)) {
    return {
      status: 'RED',
      reason: 'sample-window-not-navigation-start',
      budgetMB,
      peak,
      peakDecodedMB,
    };
  }
  if (peakDecodedMB > budgetMB) {
    return {
      status: 'RED',
      reason: 'load-toll-budget-exceeded',
      budgetMB,
      peak,
      peakDecodedMB,
    };
  }
  return {
    status: 'GREEN',
    reason: 'load-toll-within-budget-from-navigation-start',
    budgetMB,
    peak,
    peakDecodedMB,
  };
}

export function runKnownBHostLowerBoundControl() {
  const samples = [
    { ...B_HOST_TRANSIENT_LOWER_BOUND.appReady, sampleOrigin: 'app-ready' },
    { ...B_HOST_TRANSIENT_LOWER_BOUND.plus1500ms, sampleOrigin: 'app-ready-plus-1500ms' },
    { ...B_HOST_TRANSIENT_LOWER_BOUND.steady, sampleOrigin: 'steady' },
  ];
  const verdict = classifyM8LoadTollBudget(samples);
  return {
    cell: 'M8-LOAD-TOLL-B120-B-HOST-LOWER-BOUND',
    status: verdict.status,
    expected: 'RED',
    verdict,
    samples,
    note:
      'B host artifact starts at app-ready after decoding began. It proves a 141.57 MB lower-bound toll, but it is not an M8 acceptance sample because it did not start at navigation start.',
  };
}

export function runSyntheticControls() {
  const green = classifyM8LoadTollBudget([
    {
      label: 'nav-start',
      sampleOrigin: 'navigation-start',
      elapsedMs: 0,
      decodedPixelFloorBytes: 12 * 1024 * 1024,
      fullResolutionImages: 0,
    },
    {
      label: '+250ms',
      sampleOrigin: 'navigation-start',
      elapsedMs: 250,
      decodedPixelFloorBytes: 24 * 1024 * 1024,
      fullResolutionImages: 0,
    },
  ]);
  const red = classifyM8LoadTollBudget([
    {
      label: 'nav-start',
      sampleOrigin: 'navigation-start',
      elapsedMs: 0,
      decodedPixelFloorBytes: 80 * 1024 * 1024,
      fullResolutionImages: 10,
    },
  ]);
  return [
    {
      cell: 'GREEN-M8-LOAD-TOLL-UNDER-BUDGET',
      status: green.status === 'GREEN' ? 'GREEN' : 'RED',
      verdict: green,
      expected: 'GREEN',
    },
    {
      cell: 'RED-M8-LOAD-TOLL-OVER-BUDGET',
      status: red.status === 'RED' && red.reason === 'load-toll-budget-exceeded' ? 'GREEN' : 'RED',
      reportStatus: red.status,
      verdict: red,
      expected: 'RED',
    },
  ];
}

export async function runM8LoadTollBudgetGate({ live = false } = {}) {
  const current = live
    ? await runLiveNavigationStartHarness()
    : runKnownBHostLowerBoundControl();
  const verdict = live
    ? classifyM8LoadTollBudget(current.samples || [])
    : current.verdict;
  const controls = runSyntheticControls();
  return {
    signature: M8_LOAD_TOLL_BUDGET_SIGNATURE,
    status: verdict.status === 'GREEN' && controls.every((control) => control.status === 'GREEN')
      ? 'GREEN'
      : 'RED',
    budgetMB: M8_LOAD_TOLL_DEFAULT_BUDGET_MB,
    measurementStamp: B_M1_MEASUREMENT_STAMP,
    sampleRequirement: 'Samples must begin at navigation start; app-ready lower bounds are evidence, not acceptance.',
    mode: live ? 'live-navigation-start' : 'known-b-host-lower-bound',
    current,
    verdict,
    controls,
    releaseAuthority: {
      resetDependsOn: true,
      statement: verdict.status === 'GREEN'
        ? 'M8 load toll is within budget from navigation start.'
        : 'M8 load toll acceptance is not met until a navigation-start sample is within budget.',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runM8LoadTollBudgetGate({ live: process.argv.includes('--live') });
  const outPath = resolve(root, 'docs/plan3/M8-LOAD-TOLL-BUDGET-20260731.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
