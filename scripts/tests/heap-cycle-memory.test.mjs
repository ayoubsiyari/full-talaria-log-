import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
  HEAP_CYCLE_SIGNATURE,
  assertHeapCycleMemoryReport,
  defaultHeapCycleGate01FixtureDir,
  summarizeHeapCycleReport,
  synthesizePoLeakHeapCycleReport,
} from '../lib/heap-cycle-memory.mjs';
import {
  countDetachedDivsFromHeapSnapshot,
  synthesizeHeapSnapshotWithDetachedDivs,
} from '../lib/heap-snapshot-detached.mjs';
import {
  aggregateHeapSnapshotByConstructor,
  synthesizeHeapSnapshotWithConstructors,
} from '../lib/heap-snapshot-aggregates.mjs';
import {
  assessGrowthCensusCalibration,
  buildGrowthCensus,
  HEAP_GROWTH_CENSUS_SIGNATURE,
} from '../lib/heap-growth-census.mjs';
import {
  parseHeapCycleMemoryArgs,
  runHeapCycleMemoryGate,
} from '../heap-cycle-memory-gate.mjs';

test('unit: detached div counter reads detachedness on HTMLDivElement', () => {
  const snap = synthesizeHeapSnapshotWithDetachedDivs(21_699, { attachedDivCount: 40 });
  const counted = countDetachedDivsFromHeapSnapshot(snap);
  assert.equal(counted.detachedDivCount, 21_699);
  assert.equal(counted.detachednessField, true);
  assert.ok(counted.htmlDivElementCount >= 21_699);
});

test('unit: constructor aggregate prefixes Detached and sums size', () => {
  const snap = synthesizeHeapSnapshotWithConstructors([
    { name: 'HTMLDivElement', count: 10, selfSize: 100, detached: true },
    { name: 'HTMLDivElement', count: 3, selfSize: 100, detached: false },
    { name: 'UniqueElementData', count: 5, selfSize: 40, detached: false },
  ]);
  const agg = aggregateHeapSnapshotByConstructor(snap);
  assert.equal(agg.get('Detached HTMLDivElement')?.count, 10);
  assert.equal(agg.get('Detached HTMLDivElement')?.size, 1000);
  assert.equal(agg.get('HTMLDivElement')?.count, 3);
  assert.equal(agg.get('UniqueElementData')?.count, 5);
});

test('unit: serialized Detached <div style=...> collapses to Detached <div>', () => {
  const snap = synthesizeHeapSnapshotWithConstructors([
    { name: 'Detached <div style="color:red">', count: 100, selfSize: 64, detached: true },
    { name: 'Detached <div style="color:blue">', count: 50, selfSize: 64, detached: true },
    { name: 'Detached <span style="x">', count: 7, selfSize: 32, detached: true },
  ]);
  const agg = aggregateHeapSnapshotByConstructor(snap);
  assert.equal(agg.get('Detached <div>')?.count, 150);
  assert.equal(agg.get('Detached <span>')?.count, 7);
});

test('unit: monotonic A-list requires growth in all cycles', () => {
  const mk = (divs, other) => new Map([
    ['Detached HTMLDivElement', { constructor: 'Detached HTMLDivElement', count: divs, size: divs * 64 }],
    ['OneOffNoise', { constructor: 'OneOffNoise', count: other, size: other * 10 }],
  ]);
  // Detached grows every cycle; OneOffNoise only grows cycle 1 then shrinks.
  const census = buildGrowthCensus([
    mk(100, 10),
    mk(100 + 21_699, 500),
    mk(100 + 21_699 * 2, 200),
    mk(100 + 21_699 * 3, 50),
    mk(100 + 21_699 * 4, 40),
    mk(100 + 21_699 * 5, 30),
    mk(100 + 21_699 * 6, 20),
  ]);
  assert.equal(census.signature, HEAP_GROWTH_CENSUS_SIGNATURE);
  assert.equal(census.meta.cycleCount, 6);
  assert.ok(census.monotonicHoarders.some((r) => r.constructor === 'Detached HTMLDivElement'));
  assert.ok(!census.monotonicHoarders.some((r) => r.constructor === 'OneOffNoise'));
  assert.equal(census.monotonicHoarders[0].constructor, 'Detached HTMLDivElement');
  assert.ok(census.topBySizeDelta.length <= 40);
});

test('GATE-01: sealed PO-leak fixture is RED on today’s unfixed shape', async () => {
  const result = await runHeapCycleMemoryGate({
    fixtureDir: defaultHeapCycleGate01FixtureDir(),
  });
  assert.equal(result.signature, HEAP_CYCLE_SIGNATURE);
  assert.equal(result.status, 'RED');
  assert.equal(result.ok, false);
  const byName = Object.fromEntries(result.cells.map((cell) => [cell.name, cell]));
  assert.equal(byName['HEAP-CYCLE-INSTRUMENT-COMPLETE']?.status, 'GREEN');
  assert.equal(byName['HEAP-CYCLE-DISTINCT-FILEIDS']?.status, 'GREEN');
  assert.equal(byName['HEAP-CYCLE-DETACHED-DIV-STABLE']?.status, 'RED');
  assert.equal(byName['HEAP-CYCLE-HEAP-FLOOR-BOUNDED']?.status, 'RED');
  assert.equal(byName['M26-REGRADE-ON-HEAP-CYCLE']?.status, 'INSUFFICIENT');
  assert.equal(byName['FIX3-REGRADE-ON-HEAP-CYCLE']?.status, 'INSUFFICIENT');
  assert.equal(byName['HEAP-GROWTH-CENSUS-EMITTED']?.status, 'GREEN');
  assert.equal(byName['HEAP-GROWTH-MONOTONIC-HOARDERS']?.status, 'GREEN');
  assert.equal(byName['HEAP-GROWTH-TOP40-CONTEXT']?.status, 'GREEN');
  assert.equal(byName['HEAP-GROWTH-SURFACE-CALIBRATION']?.status, 'GREEN');
  assert.equal(byName['HEAP-RETAINER-PATHS-AGGREGATED']?.status, 'GREEN');
  assert.match(byName['HEAP-CYCLE-DETACHED-DIV-STABLE']?.detail || '', new RegExp(String(HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE)));
  assert.ok(byName['HEAP-GROWTH-MONOTONIC-HOARDERS']?.topHoarders?.length > 0);
  assert.ok(
    (byName['HEAP-RETAINER-PATHS-AGGREGATED']?.topPaths || [])
      .some((b) => (b.paths || []).some((p) => (p.suspect || []).includes('_tfDataCache'))),
  );
});

test('unit: synthesizePoLeak report matches PO calibration deltas', () => {
  const report = synthesizePoLeakHeapCycleReport();
  const summary = summarizeHeapCycleReport(report);
  assert.equal(summary.meanDetachedDelta, HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE);
  assert.equal(summary.detachedStable, false);
  assert.equal(summary.heapBounded, false);
  assert.equal(summary.matchesPoLeakShape, true);
  assert.equal(report.growthCensus?.calibration?.surfaceExercisesRealProduct, true);
});

test('fault-injection: stable detached + bounded heap can GREEN', () => {
  const report = synthesizePoLeakHeapCycleReport();
  let detached = report.baseline.detachedDivCount;
  let htmlDivs = report.baseline.htmlDivElementCount;
  report.cycles = report.cycles.map((row, index) => {
    detached += 0;
    htmlDivs += 0;
    return {
      ...row,
      returnSingle: {
        ...row.returnSingle,
        usedJSHeapSize: report.baseline.usedJSHeapSize + ((index + 1) * 1024 * 1024),
        htmlDivElementCount: htmlDivs,
      },
      detachedDivCount: detached,
      detachedDivDelta: 0,
      htmlDivElementCount: htmlDivs,
      retainedHtmlDivDelta: 0,
    };
  });
  const stable = new Map([
    ['HTMLDivElement', { constructor: 'HTMLDivElement', count: 100, size: 6400 }],
  ]);
  report.growthCensus = {
    ...buildGrowthCensus([stable, stable, stable, stable]),
    ok: true,
    calibration: assessGrowthCensusCalibration(
      buildGrowthCensus([stable, stable, stable, stable]),
      { meanHeapFloorDeltaBytes: 1024 * 1024, meanDetachedDivDelta: 0 },
    ),
  };
  const cells = assertHeapCycleMemoryReport(report);
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.status, 'GREEN');
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-HEAP-FLOOR-BOUNDED')?.status, 'GREEN');
  assert.equal(cells.find((cell) => cell.name === 'M26-REGRADE-ON-HEAP-CYCLE')?.status, 'ADEQUATE');
  assert.equal(cells.find((cell) => cell.name === 'HEAP-GROWTH-SURFACE-CALIBRATION')?.status, 'GREEN');
});

test('fault-injection: soft-pass detached threshold cannot swallow PO magnitude', () => {
  const report = synthesizePoLeakHeapCycleReport();
  const summary = summarizeHeapCycleReport(report);
  assert.ok(summary.meanDetachedDelta > 1);
  const cells = assertHeapCycleMemoryReport(report);
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.pass, false);
});

test('fault-injection: thin-host magnitudes fail surface calibration', () => {
  const report = synthesizePoLeakHeapCycleReport();
  // ~20 MB/cycle + tiny detached — the thin-host under-read signature.
  const thinMb = 20 * 1024 * 1024;
  report.baseline.usedJSHeapSize = 40 * 1024 * 1024;
  report.cycles = report.cycles.map((row, index) => ({
    ...row,
    returnSingle: {
      ...row.returnSingle,
      usedJSHeapSize: 40 * 1024 * 1024 + (index + 1) * thinMb,
      htmlDivElementCount: report.baseline.htmlDivElementCount + (index + 1) * 3,
    },
    detachedDivCount: report.baseline.detachedDivCount + (index + 1) * 3,
    detachedDivDelta: 3,
    retainedHtmlDivDelta: 3,
  }));
  const tiny = (n) => new Map([
    ['HTMLDivElement', { constructor: 'HTMLDivElement', count: 100 + n, size: (100 + n) * 64 }],
  ]);
  const census = buildGrowthCensus([tiny(0), tiny(3), tiny(6), tiny(9)]);
  report.growthCensus = {
    ...census,
    ok: true,
    calibration: assessGrowthCensusCalibration(census, {
      meanHeapFloorDeltaBytes: thinMb,
      meanDetachedDivDelta: 3,
    }),
  };
  const cells = assertHeapCycleMemoryReport(report);
  assert.equal(cells.find((cell) => cell.name === 'HEAP-GROWTH-SURFACE-CALIBRATION')?.status, 'RED');
  assert.match(
    cells.find((cell) => cell.name === 'HEAP-GROWTH-SURFACE-CALIBRATION')?.detail || '',
    /HARNESS-NOT-REAL-PRODUCT/,
  );
});

test('unit: CLI exposes fixture, require-browser, and dist-v9 surface', () => {
  const args = parseHeapCycleMemoryArgs([
    '--fixture',
    '--require-browser',
    '--timeout-ms=120000',
    '--surface=dist-v9',
  ]);
  assert.ok(args.fixtureDir);
  assert.equal(args.requireBrowser, true);
  assert.equal(args.timeoutMs, 120_000);
  assert.equal(args.surface, 'dist-v9');
});

test('unit: CLI exposes --po-hand-sample and --play-hold-ms', () => {
  const args = parseHeapCycleMemoryArgs([
    '--deployed',
    '--po-hand-sample',
    '--play-hold-ms=20000',
    '--require-build=20260729b85',
  ]);
  assert.equal(args.surface, 'deployed');
  assert.equal(args.poHandSample, true);
  assert.equal(args.playHoldMs, 20_000);
  assert.equal(args.requireBuild, '20260729b85');
  const off = parseHeapCycleMemoryArgs(['--deployed', '--no-po-hand-sample']);
  assert.equal(off.poHandSample, false);
});

test('fault-injection: injected browser leak report stays RED', async () => {
  const result = await runHeapCycleMemoryGate({
    requireBrowser: true,
    runBrowser: async () => synthesizePoLeakHeapCycleReport(),
  });
  assert.equal(result.status, 'RED');
  assert.equal(result.cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.status, 'RED');
  assert.equal(result.cells.find((cell) => cell.name === 'HEAP-GROWTH-CENSUS-EMITTED')?.status, 'GREEN');
});
