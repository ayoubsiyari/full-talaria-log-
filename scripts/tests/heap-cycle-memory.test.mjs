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
  assert.match(byName['HEAP-CYCLE-DETACHED-DIV-STABLE']?.detail || '', new RegExp(String(HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE)));
});

test('unit: synthesizePoLeak report matches PO calibration deltas', () => {
  const report = synthesizePoLeakHeapCycleReport();
  const summary = summarizeHeapCycleReport(report);
  assert.equal(summary.meanDetachedDelta, HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE);
  assert.equal(summary.detachedStable, false);
  assert.equal(summary.heapBounded, false);
  assert.equal(summary.matchesPoLeakShape, true);
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
  const cells = assertHeapCycleMemoryReport(report);
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.status, 'GREEN');
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-HEAP-FLOOR-BOUNDED')?.status, 'GREEN');
  assert.equal(cells.find((cell) => cell.name === 'M26-REGRADE-ON-HEAP-CYCLE')?.status, 'ADEQUATE');
});

test('fault-injection: soft-pass detached threshold cannot swallow PO magnitude', () => {
  const report = synthesizePoLeakHeapCycleReport();
  const summary = summarizeHeapCycleReport(report);
  assert.ok(summary.meanDetachedDelta > 1);
  const cells = assertHeapCycleMemoryReport(report);
  assert.equal(cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.pass, false);
});

test('unit: CLI exposes fixture and require-browser', () => {
  const args = parseHeapCycleMemoryArgs(['--fixture', '--require-browser', '--timeout-ms=120000']);
  assert.ok(args.fixtureDir);
  assert.equal(args.requireBrowser, true);
  assert.equal(args.timeoutMs, 120_000);
});

test('fault-injection: injected browser leak report stays RED', async () => {
  const result = await runHeapCycleMemoryGate({
    requireBrowser: true,
    runBrowser: async () => synthesizePoLeakHeapCycleReport(),
  });
  assert.equal(result.status, 'RED');
  assert.equal(result.cells.find((cell) => cell.name === 'HEAP-CYCLE-DETACHED-DIV-STABLE')?.status, 'RED');
});
