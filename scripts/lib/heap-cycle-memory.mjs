/**
 * HEAP-CYCLE-MEMORY-V1 — three multichart cycles with DISTINCT symbols,
 * usedJSHeapSize after forced GC, and Detached <div> counts from heap snapshots.
 *
 * Detached-div growth is the superior/mandatory gate. Footprint is non-grading.
 * PO calibration (clean 54 MB baseline): R1 106, R2 152, R3 204 (~50 MB/cycle);
 * detached +21_699 divs/cycle.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
} from './heap-memory-instrument.mjs';

export const HEAP_CYCLE_SIGNATURE = 'TALARIA_HEAP_CYCLE_MEMORY_V1';
export const HEAP_CYCLE_STATUS_SKIP = 'SKIP';

export const HEAP_CYCLE_COUNT = 3;
export const HEAP_CYCLE_PANEL_IDS = Object.freeze(['A', 'B', 'C', 'D']);
/** Distinct harness fileIds available from serve.mjs FILES. */
export const HEAP_CYCLE_DISTINCT_FILE_IDS = Object.freeze([25, 27, 28, 29]);

/** PO reference floor after each return-to-single (MB). */
export const HEAP_CYCLE_PO_FLOOR_MB = Object.freeze([106, 152, 204]);
export const HEAP_CYCLE_PO_BASELINE_MB = 54;
export const HEAP_CYCLE_PO_PER_CYCLE_MB = 50;
/** PO exact expected detached HTMLDivElement growth per cycle. */
export const HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE = 21_699;

/** GREEN only when mean per-cycle detached/retained-div growth stays at/below this. */
export const HEAP_CYCLE_DETACHED_STABLE_MAX = 1;
/** GREEN only when mean per-cycle heap floor growth stays at/below this. */
export const HEAP_CYCLE_HEAP_GROWTH_MAX_BYTES = 8 * 1024 * 1024;
/** Fixture/live "today's leak" recognition band around PO detached magnitude. */
export const HEAP_CYCLE_DETACHED_LEAK_MIN = 10_000;

function cell(name, pass, detail, extra = {}) {
  const status = extra.status || (pass === true ? 'GREEN' : 'RED');
  return {
    name,
    pass: pass === true,
    status,
    detail,
    ...extra,
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function defaultHeapCycleGate01FixtureDir() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/heap-cycle/gate01-red',
  );
}

/** Sealed PO-shaped report: must grade RED on unfixed product (GATE-01). */
export function synthesizePoLeakHeapCycleReport() {
  const mb = (n) => Math.round(n * 1024 * 1024);
  const baselineBytes = mb(HEAP_CYCLE_PO_BASELINE_MB);
  const floors = HEAP_CYCLE_PO_FLOOR_MB.map((value) => mb(value));
  let detached = 1_200;
  let htmlDivs = 4_000;
  const cycles = floors.map((floorBytes, index) => {
    detached += HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE;
    htmlDivs += HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE;
    const fileIds = HEAP_CYCLE_DISTINCT_FILE_IDS.slice();
    return {
      index: index + 1,
      fileIds,
      distinctSymbols: true,
      fourPeak: {
        exposed: true,
        metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
        usedJSHeapSize: floorBytes + mb(80),
        forcedGcAttempted: true,
        forcedGcAvailable: true,
        htmlDivElementCount: htmlDivs + 5_000,
      },
      returnSingle: {
        exposed: true,
        metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
        usedJSHeapSize: floorBytes,
        forcedGcAttempted: true,
        forcedGcAvailable: true,
        htmlDivElementCount: htmlDivs,
      },
      detachedDivCount: detached,
      detachedDivDelta: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
      htmlDivElementCount: htmlDivs,
      retainedHtmlDivDelta: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
    };
  });
  return {
    signature: HEAP_CYCLE_SIGNATURE,
    ok: true,
    meta: {
      cycles: HEAP_CYCLE_COUNT,
      memoryInstrument: 'usedJSHeapSize+forcedGc',
      footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
      detachedGateMandatory: true,
      poCalibration: {
        baselineMb: HEAP_CYCLE_PO_BASELINE_MB,
        floorsMb: HEAP_CYCLE_PO_FLOOR_MB.slice(),
        detachedDivsPerCycle: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
      },
      fixture: 'gate01-red-po-leak',
    },
    baseline: {
      exposed: true,
      metric: HEAP_METRIC_USED_JS_HEAP_SIZE,
      usedJSHeapSize: baselineBytes,
      forcedGcAttempted: true,
      forcedGcAvailable: true,
      detachedDivCount: 1_200,
      htmlDivElementCount: 4_000,
    },
    cycles,
  };
}

export function summarizeHeapCycleReport(report) {
  const baseline = report?.baseline || null;
  const cycles = Array.isArray(report?.cycles) ? report.cycles : [];
  const heapSamplesOk = !!baseline
    && baseline.exposed === true
    && baseline.metric === HEAP_METRIC_USED_JS_HEAP_SIZE
    && baseline.forcedGcAttempted === true
    && cycles.length === HEAP_CYCLE_COUNT
    && cycles.every((row) => row?.returnSingle?.exposed === true
      && row.returnSingle.metric === HEAP_METRIC_USED_JS_HEAP_SIZE
      && row.returnSingle.forcedGcAttempted === true
      && Number.isFinite(Number(row.detachedDivCount)));

  const forcedGcAvailable = baseline?.forcedGcAvailable === true
    && cycles.every((row) => row?.returnSingle?.forcedGcAvailable === true);

  const distinctOk = cycles.length === HEAP_CYCLE_COUNT
    && cycles.every((row) => {
      const ids = Array.isArray(row.fileIds) ? row.fileIds.map(Number) : [];
      const unique = new Set(ids);
      return ids.length === 4
        && unique.size === 4
        && HEAP_CYCLE_DISTINCT_FILE_IDS.every((id) => unique.has(id));
    });

  const detachedDeltas = cycles.map((row, index) => {
    if (Number.isFinite(Number(row.detachedDivDelta))) return Number(row.detachedDivDelta);
    const prev = index === 0
      ? Number(baseline?.detachedDivCount)
      : Number(cycles[index - 1]?.detachedDivCount);
    const cur = Number(row.detachedDivCount);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) return null;
    return cur - prev;
  });
  const meanDetachedDelta = detachedDeltas.every((value) => value != null)
    ? detachedDeltas.reduce((sum, value) => sum + value, 0) / detachedDeltas.length
    : null;

  // When CDP detachedness is vacuous (all 0) but HTMLDivElement counts still
  // ratchet after return-to-single, grade that retain signal — same class as
  // DevTools "Detached <div>" on denser product surfaces.
  const retainedDivDeltas = cycles.map((row, index) => {
    if (Number.isFinite(Number(row.retainedHtmlDivDelta))) return Number(row.retainedHtmlDivDelta);
    const prev = index === 0
      ? Number(baseline?.htmlDivElementCount)
      : Number(cycles[index - 1]?.returnSingle?.htmlDivElementCount
        ?? cycles[index - 1]?.htmlDivElementCount);
    const cur = Number(row.returnSingle?.htmlDivElementCount ?? row.htmlDivElementCount);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) return null;
    return cur - prev;
  });
  const meanRetainedDivDelta = retainedDivDeltas.every((value) => value != null)
    ? retainedDivDeltas.reduce((sum, value) => sum + value, 0) / retainedDivDeltas.length
    : null;
  const gradedDetachedDelta = (meanDetachedDelta != null && meanDetachedDelta > 0)
    ? meanDetachedDelta
    : meanRetainedDivDelta;
  const detachedSignal = (meanDetachedDelta != null && meanDetachedDelta > 0)
    ? 'cdp-detachedness'
    : 'retained-htmlDivElement';

  const floors = cycles.map((row) => finiteOrNull(row?.returnSingle?.usedJSHeapSize));
  const baselineHeap = finiteOrNull(baseline?.usedJSHeapSize);
  const heapDeltas = floors.map((floor, index) => {
    const prev = index === 0 ? baselineHeap : floors[index - 1];
    if (floor == null || prev == null) return null;
    return floor - prev;
  });
  const meanHeapDelta = heapDeltas.every((value) => value != null)
    ? heapDeltas.reduce((sum, value) => sum + value, 0) / heapDeltas.length
    : null;

  const detachedStable = gradedDetachedDelta != null
    && gradedDetachedDelta <= HEAP_CYCLE_DETACHED_STABLE_MAX;
  const heapBounded = meanHeapDelta != null
    && meanHeapDelta <= HEAP_CYCLE_HEAP_GROWTH_MAX_BYTES;
  const matchesPoLeakShape = (meanDetachedDelta != null
    && meanDetachedDelta >= HEAP_CYCLE_DETACHED_LEAK_MIN)
    || (meanHeapDelta != null && meanHeapDelta >= 16 * 1024 * 1024);

  return {
    heapSamplesOk,
    forcedGcAvailable,
    distinctOk,
    detachedDeltas,
    meanDetachedDelta,
    retainedDivDeltas,
    meanRetainedDivDelta,
    gradedDetachedDelta,
    detachedSignal,
    heapDeltas,
    meanHeapDelta,
    detachedStable,
    heapBounded,
    matchesPoLeakShape,
    cycleCount: cycles.length,
  };
}

/**
 * Grade a heap-cycle report.
 * GREEN ship requires detached stability + bounded heap floor (product fixed).
 * GATE-01: sealed PO-leak fixture and today's unfixed build must be RED.
 */
export function assertHeapCycleMemoryReport(report) {
  const cells = [];
  if (!report || typeof report !== 'object') {
    return [cell('HEAP-CYCLE-REPORT-SHAPE', false, 'report must be object')];
  }
  cells.push(cell(
    'HEAP-CYCLE-REPORT-SHAPE',
    report.signature === HEAP_CYCLE_SIGNATURE || report.meta?.fixture != null,
    `signature=${report.signature || 'missing'}`,
  ));

  const summary = summarizeHeapCycleReport(report);
  cells.push(cell(
    'HEAP-CYCLE-INSTRUMENT-COMPLETE',
    summary.heapSamplesOk === true && summary.forcedGcAvailable === true,
    summary.heapSamplesOk
      ? `usedJSHeapSize+forcedGc samples for baseline+${HEAP_CYCLE_COUNT} cycles; detached counts present`
      : 'missing usedJSHeapSize forced-GC samples or detachedDivCount',
    { summary, footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING },
  ));
  cells.push(cell(
    'HEAP-CYCLE-DISTINCT-FILEIDS',
    summary.distinctOk === true,
    summary.distinctOk
      ? `each cycle used distinct fileIds ${HEAP_CYCLE_DISTINCT_FILE_IDS.join(',')}`
      : 'cycle fileIds must be the four distinct harness symbols',
    { fileIds: HEAP_CYCLE_DISTINCT_FILE_IDS.slice() },
  ));
  cells.push(cell(
    'HEAP-CYCLE-DETACHED-DIV-STABLE',
    summary.detachedStable === true,
    summary.gradedDetachedDelta == null
      ? 'detached/retained div deltas missing'
      : `gradedDetachedDelta=${Math.round(summary.gradedDetachedDelta)} signal=${summary.detachedSignal} cdpDetachedMean=${summary.meanDetachedDelta} retainedHtmlDivMean=${summary.meanRetainedDivDelta} maxStable=${HEAP_CYCLE_DETACHED_STABLE_MAX} poPerCycle=${HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE}`,
    {
      superiorGate: true,
      meanDetachedDelta: summary.meanDetachedDelta,
      meanRetainedDivDelta: summary.meanRetainedDivDelta,
      gradedDetachedDelta: summary.gradedDetachedDelta,
      detachedSignal: summary.detachedSignal,
      detachedDeltas: summary.detachedDeltas,
      retainedDivDeltas: summary.retainedDivDeltas,
      poDetachedDivsPerCycle: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
    },
  ));
  cells.push(cell(
    'HEAP-CYCLE-HEAP-FLOOR-BOUNDED',
    summary.heapBounded === true,
    summary.meanHeapDelta == null
      ? 'heap floor deltas missing'
      : `meanHeapFloorDelta=${summary.meanHeapDelta} max=${HEAP_CYCLE_HEAP_GROWTH_MAX_BYTES} po≈${HEAP_CYCLE_PO_PER_CYCLE_MB}MB/cycle`,
    {
      meanHeapDelta: summary.meanHeapDelta,
      heapDeltas: summary.heapDeltas,
      poFloorsMb: HEAP_CYCLE_PO_FLOOR_MB.slice(),
    },
  ));

  // Regrade: footprint verdicts void. M26 is correct-but-insufficient when leak remains.
  const instrumentReady = summary.heapSamplesOk === true;
  const leakStillPresent = summary.matchesPoLeakShape === true
    || summary.detachedStable === false
    || summary.heapBounded === false;
  cells.push(cell(
    'M26-REGRADE-ON-HEAP-CYCLE',
    instrumentReady,
    !instrumentReady
      ? 'cannot regrade M26 without heap-cycle instrument'
      : (leakStillPresent
        ? 'INSUFFICIENT: leak remains on usedJSHeapSize+detached-div instrument (M26 correct but insufficient; footprint fail void)'
        : 'ADEQUATE: heap-cycle leak cleared under proper instrument'),
    {
      status: !instrumentReady ? 'RED' : (leakStillPresent ? 'INSUFFICIENT' : 'ADEQUATE'),
      regrades: ['M26'],
      footprintVerdictVoid: true,
    },
  ));
  cells.push(cell(
    'FIX3-REGRADE-ON-HEAP-CYCLE',
    instrumentReady,
    !instrumentReady
      ? 'cannot regrade FIX3 without heap-cycle instrument'
      : (leakStillPresent
        ? 'INSUFFICIENT: leak remains on usedJSHeapSize+detached-div instrument (FIX3 footprint fail void)'
        : 'ADEQUATE: heap-cycle leak cleared under proper instrument'),
    {
      status: !instrumentReady ? 'RED' : (leakStillPresent ? 'INSUFFICIENT' : 'ADEQUATE'),
      regrades: ['FIX3'],
      footprintVerdictVoid: true,
    },
  ));

  return cells;
}

export function formatHeapCycleMemoryReport(report) {
  const lines = [
    `${HEAP_CYCLE_SIGNATURE} status=${report.status} ok=${report.ok}`,
  ];
  if (report.error) lines.push(`error: ${report.error}`);
  for (const row of report.cells || []) {
    lines.push(`- ${row.status} ${row.name}: ${row.detail}`);
  }
  return lines.join('\n');
}
