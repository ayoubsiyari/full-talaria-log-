import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessDatasetDistinctness,
  buildDatasetPlan,
  HEAP_CYCLE_DISTINCT_TIMEFRAMES,
  summarizeDatasetConfig,
} from '../lib/heap-cycle-dataset-config.mjs';

const FILE_IDS = [11, 22, 33, 44];

test('unit: distinct mode plans four independent (symbol, timeframe) datasets', () => {
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  assert.equal(plan.expectedDistinctDatasets, 4);
  assert.deepEqual(plan.panels.map((p) => p.fileId), FILE_IDS);
  assert.deepEqual(
    plan.panels.map((p) => p.timeframe),
    [...HEAP_CYCLE_DISTINCT_TIMEFRAMES],
  );
});

test('unit: identical mode plans one shared dataset (the cheap configuration)', () => {
  const plan = buildDatasetPlan({ mode: 'identical', fileIds: FILE_IDS });
  assert.equal(plan.expectedDistinctDatasets, 1);
  assert.deepEqual(new Set(plan.panels.map((p) => p.fileId)), new Set([11]));
  assert.deepEqual(new Set(plan.panels.map((p) => p.timeframe)), new Set(['1m']));
});

test('unit: same-symbol mode plans one file at four timeframes (common window)', () => {
  const plan = buildDatasetPlan({ mode: 'same-symbol', fileIds: FILE_IDS });
  assert.equal(plan.expectedDistinctDatasets, 4);
  assert.deepEqual(new Set(plan.panels.map((p) => p.fileId)), new Set([11]));
  assert.deepEqual(
    plan.panels.map((p) => p.timeframe),
    [...HEAP_CYCLE_DISTINCT_TIMEFRAMES],
  );
});

test('unit: unknown dataset mode is refused rather than silently defaulted', () => {
  assert.throws(
    () => buildDatasetPlan({ mode: 'four-panels', fileIds: FILE_IDS }),
    /unknown dataset mode/,
  );
});

test('unit: observed four distinct datasets grades ok', () => {
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  const observed = plan.panels.map((p) => ({
    panelId: p.panelId,
    fileId: String(p.fileId),
    timeframe: p.timeframe,
    bars: 5000,
  }));
  const got = assessDatasetDistinctness(plan, observed);
  assert.equal(got.ok, true);
  assert.equal(got.observedDistinctDatasets, 4);
  assert.equal(got.observedDistinctTimeframes, 4);
  assert.deepEqual(got.mismatches, []);
});

test('unit: host timeframe fan-out collapsing panels to one tf fails distinctness', () => {
  // Interval sync on: every panel ends up on the host tf despite the plan.
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  const observed = plan.panels.map((p) => ({
    panelId: p.panelId,
    fileId: String(p.fileId),
    timeframe: '1m',
    bars: 5000,
  }));
  const got = assessDatasetDistinctness(plan, observed);
  assert.equal(got.observedDistinctDatasets, 4, 'distinct fileIds still make distinct datasets');
  assert.equal(got.observedDistinctTimeframes, 1);
  assert.equal(got.mismatches.length, 3, 'B/C/D lost their planned timeframes');
});

test('unit: panels collapsed onto one dataset cannot pass a distinct plan', () => {
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  const observed = plan.panels.map((p) => ({
    panelId: p.panelId,
    fileId: '11',
    timeframe: '1m',
    bars: 5000,
  }));
  const got = assessDatasetDistinctness(plan, observed);
  assert.equal(got.ok, false);
  assert.equal(got.observedDistinctDatasets, 1);
});

test('unit: unreadable panel cannot pass — absence of evidence is not distinctness', () => {
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  const observed = plan.panels.map((p, i) => ({
    panelId: p.panelId,
    fileId: i === 3 ? null : String(p.fileId),
    timeframe: i === 3 ? null : p.timeframe,
  }));
  const got = assessDatasetDistinctness(plan, observed);
  assert.equal(got.ok, false);
  assert.equal(got.panelsRead, 3);
  assert.equal(got.panelsRequested, 4);
});

test('unit: run summary reports the weakest cycle, not the best', () => {
  const plan = buildDatasetPlan({ mode: 'distinct', fileIds: FILE_IDS });
  const good = assessDatasetDistinctness(
    plan,
    plan.panels.map((p) => ({ panelId: p.panelId, fileId: String(p.fileId), timeframe: p.timeframe })),
  );
  const collapsed = assessDatasetDistinctness(
    plan,
    plan.panels.map((p) => ({ panelId: p.panelId, fileId: '11', timeframe: '1m' })),
  );
  const summary = summarizeDatasetConfig([good, good, collapsed]);
  assert.equal(summary.ok, false);
  assert.equal(summary.minObservedDistinctDatasets, 1);
  assert.equal(summary.cyclesWithFullDistinctness, 2);
  assert.equal(summary.cycles, 3);
});

test('unit: no assessments recorded is not a pass', () => {
  assert.equal(summarizeDatasetConfig([]).ok, false);
});
