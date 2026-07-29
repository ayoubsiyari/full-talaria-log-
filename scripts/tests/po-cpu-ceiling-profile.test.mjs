import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCeilingProfileReport,
  categoriesFromProbeDelta,
  classifyTimelineEventName,
  deltaProbeSnapshots,
  formatCeilingProfileSummary,
  PO_CPU_CEILING_SIGNATURE,
  summarizeCpuProfile,
  summarizeTimelineCategories,
} from '../lib/po-cpu-ceiling-profile.mjs';

test('unit: timeline event names map to scripting/rendering/painting', () => {
  assert.equal(classifyTimelineEventName('FunctionCall'), 'scripting');
  assert.equal(classifyTimelineEventName('V8.StackGuard'), 'scripting');
  assert.equal(classifyTimelineEventName('Layout'), 'rendering');
  assert.equal(classifyTimelineEventName('RecalculateStyles'), 'rendering');
  assert.equal(classifyTimelineEventName('Paint'), 'painting');
  assert.equal(classifyTimelineEventName('CompositeLayers'), 'painting');
});

test('unit: summarizeTimelineCategories ranks buckets by duration', () => {
  const events = [
    { ph: 'X', name: 'FunctionCall', dur: 50_000 },
    { ph: 'X', name: 'FunctionCall', dur: 50_000 },
    { ph: 'X', name: 'Layout', dur: 20_000 },
    { ph: 'X', name: 'Paint', dur: 10_000 },
  ];
  const summary = summarizeTimelineCategories(events);
  assert.ok(summary.categories.scripting.ratio > summary.categories.rendering.ratio);
  assert.ok(summary.categories.rendering.ratio > summary.categories.painting.ratio);
  assert.equal(summary.topEvents[0].name, 'FunctionCall');
});

test('unit: summarizeCpuProfile aggregates identical callUIDs', () => {
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: 'drawCandles', url: 'chart.js', lineNumber: 9 }, hitCount: 2 },
      { id: 2, callFrame: { functionName: 'drawCandles', url: 'chart.js', lineNumber: 9 }, hitCount: 1 },
      { id: 3, callFrame: { functionName: 'tick', url: 'replay-system.js', lineNumber: 1 }, hitCount: 1 },
    ],
    samples: [1, 1, 2, 3],
    timeDeltas: [1000, 1000, 1000, 1000],
  };
  const summary = summarizeCpuProfile(profile);
  assert.equal(summary.sampleCount, 4);
  assert.equal(summary.topCalls[0].functionName, 'drawCandles');
  assert.ok(summary.topCalls[0].selfMs >= summary.topCalls[1].selfMs);
});

test('unit: probe delta splits scripting vs canvas painting', () => {
  const delta = deltaProbeSnapshots(
    {
      at: 1000,
      callbackBusyMs: 10,
      longTaskDurationMs: 0,
      canvasPaintMs: 1,
      canvasPaintCalls: 10,
      stackRows: [{ key: 'raf :: draw()', selfMs: 5 }],
    },
    {
      at: 2000,
      callbackBusyMs: 410,
      longTaskDurationMs: 50,
      canvasPaintMs: 81,
      canvasPaintCalls: 110,
      stackRows: [
        { key: 'raf :: draw()', selfMs: 305 },
        { key: 'interval :: tick()', selfMs: 20 },
      ],
    },
  );
  assert.equal(delta.wallMs, 1000);
  assert.equal(delta.callbackBusyMs, 400);
  assert.equal(delta.canvasPaintMs, 80);
  assert.equal(delta.stackRows[0].key, 'raf :: draw()');
  assert.equal(delta.stackRows[0].selfMs, 300);
  const cats = categoriesFromProbeDelta(delta);
  assert.ok(cats.categories.scripting.ratio > cats.categories.painting.ratio);
});

test('unit: assertCeilingProfileReport GREENs shaped fixture', () => {
  const report = {
    signature: PO_CPU_CEILING_SIGNATURE,
    meta: { speedNearest: 60 },
    arm: { ok: true, nearestSpeed: 60 },
    timeline: {
      categories: {
        scripting: { ms: 80, ratio: 0.8 },
        rendering: { ms: 15, ratio: 0.15 },
        painting: { ms: 5, ratio: 0.05 },
        system: { ms: 0, ratio: 0 },
        other: { ms: 0, ratio: 0 },
      },
      topEvents: [{ name: 'FunctionCall', bucket: 'scripting', ms: 80, count: 2, ratio: 0.8 }],
      totalCategoryMs: 100,
    },
    profile: {
      sampleCount: 100,
      totalSelfMs: 10,
      topCalls: [{ functionName: 'drawCandles', url: 'chart.js', lineNumber: 10, selfMs: 8, ratio: 0.8 }],
    },
  };
  const cells = assertCeilingProfileReport(report);
  assert.ok(cells.every((c) => c.pass), JSON.stringify(cells));
  assert.match(formatCeilingProfileSummary(report), /scripting/);
});
