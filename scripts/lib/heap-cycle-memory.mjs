/**
 * HEAP-CYCLE-MEMORY-V1 — multichart cycles with DISTINCT symbols,
 * usedJSHeapSize after forced GC, and Detached <div> counts from heap snapshots.
 *
 * Detached-div growth is the superior/mandatory gate. Footprint is non-grading.
 * Default cycle count is 6 (3 retired — PO b85 was flat ×3 then jumped on cycle 5).
 * PO calibration (clean 54 MB baseline): ~50 MB/cycle; detached +21_699 divs/cycle.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HEAP_FOOTPRINT_NON_GRADING,
  HEAP_METRIC_USED_JS_HEAP_SIZE,
} from './heap-memory-instrument.mjs';
import {
  assessGrowthCensusCalibration,
  buildGrowthCensus,
  HEAP_GROWTH_CENSUS_SIGNATURE,
  HEAP_GROWTH_CENSUS_TOP_N,
  HEAP_GROWTH_PO_CALIBRATION,
} from './heap-growth-census.mjs';
import {
  aggregateRetainerPaths,
  formatRetainerPathsSummary,
  HEAP_RETAINER_PATHS_SIGNATURE,
  synthesizeRetainerSnapshotFixture,
} from './heap-retainer-paths.mjs';

export const HEAP_CYCLE_SIGNATURE = 'TALARIA_HEAP_CYCLE_MEMORY_V1';
export const HEAP_CYCLE_STATUS_SKIP = 'SKIP';

/** Minimum / default live cycles. Three-cycle runs are retired. */
export const HEAP_CYCLE_COUNT = 6;
export const HEAP_CYCLE_COUNT_MIN = 6;
export const HEAP_CYCLE_PANEL_IDS = Object.freeze(['A', 'B', 'C', 'D']);
/** Distinct harness fileIds available from serve.mjs FILES. */
export const HEAP_CYCLE_DISTINCT_FILE_IDS = Object.freeze([25, 27, 28, 29]);

/** PO reference floor after each return-to-single (MB) — extended to 6 cycles. */
export const HEAP_CYCLE_PO_FLOOR_MB = Object.freeze([106, 152, 204, 254, 304, 354]);
export const HEAP_CYCLE_PO_BASELINE_MB = 54;
/** PO canary hand mean ≈13 MB/cycle (2026-07-29). Legacy ~50 was Task Manager / denser residue. */
export const HEAP_CYCLE_PO_PER_CYCLE_MB = 13;
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

function poCtorAgg(detachedDivs, uniqueElementData, cssBacking, noiseBytes = 0) {
  return new Map([
    ['Detached HTMLDivElement', {
      constructor: 'Detached HTMLDivElement',
      count: detachedDivs,
      size: detachedDivs * 64,
    }],
    ['UniqueElementData', {
      constructor: 'UniqueElementData',
      count: uniqueElementData,
      size: uniqueElementData * 48,
    }],
    ['HeapVectorBacking<CSSPropertyValue>', {
      constructor: 'HeapVectorBacking<CSSPropertyValue>',
      count: cssBacking,
      size: cssBacking * 32,
    }],
    ['Detached HTMLSpanElement', {
      constructor: 'Detached HTMLSpanElement',
      count: Math.floor(detachedDivs / 20),
      size: Math.floor(detachedDivs / 20) * 40,
    }],
    ['(system)', {
      constructor: '(system)',
      count: 100,
      size: 1_000_000 + noiseBytes,
    }],
  ]);
}

/** Sealed PO-shaped report: must grade RED on unfixed product (GATE-01). */
export function synthesizePoLeakHeapCycleReport() {
  const mb = (n) => Math.round(n * 1024 * 1024);
  const baselineBytes = mb(HEAP_CYCLE_PO_BASELINE_MB);
  const floors = HEAP_CYCLE_PO_FLOOR_MB.map((value) => mb(value));
  let detached = 1_200;
  let htmlDivs = 4_000;
  let unique = 2_000;
  let css = 1_500;
  const aggregateSnapshots = [poCtorAgg(detached, unique, css)];
  const cycles = floors.map((floorBytes, index) => {
    detached += HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE;
    htmlDivs += HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE;
    unique += HEAP_GROWTH_PO_CALIBRATION.uniqueElementDataPerCycle;
    css += HEAP_GROWTH_PO_CALIBRATION.cssPropertyValueBackingPerCycle;
    aggregateSnapshots.push(poCtorAgg(detached, unique, css, (index + 1) * 1000));
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
        hasConstructorAggregates: true,
      },
      detachedDivCount: detached,
      detachedDivDelta: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
      htmlDivElementCount: htmlDivs,
      retainedHtmlDivDelta: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
    };
  });
  const growthCensus = buildGrowthCensus(aggregateSnapshots);
  const calibration = assessGrowthCensusCalibration(growthCensus, {
    meanHeapFloorDeltaBytes: mb(HEAP_CYCLE_PO_PER_CYCLE_MB),
    meanDetachedDivDelta: HEAP_CYCLE_PO_DETACHED_DIVS_PER_CYCLE,
  });
  const retainerPaths = {
    ...aggregateRetainerPaths(synthesizeRetainerSnapshotFixture(), {
      constructors: ['system / ExternalStringData'],
    }),
    ok: true,
  };
  retainerPaths.summaryText = formatRetainerPathsSummary(retainerPaths);

  return {
    signature: HEAP_CYCLE_SIGNATURE,
    ok: true,
    meta: {
      cycles: HEAP_CYCLE_COUNT,
      surface: 'dist-v9',
      memoryInstrument: 'usedJSHeapSize+forcedGc',
      footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING,
      detachedGateMandatory: true,
      growthCensus: true,
      retainerPaths: true,
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
      hasConstructorAggregates: true,
    },
    cycles,
    growthCensus: {
      ...growthCensus,
      ok: true,
      calibration,
    },
    retainerPaths,
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

  const surface = report?.meta?.surface || null;
  const poWorkloadArmed = report?.poWorkload?.armedEveryCycle === true
    || (Array.isArray(cycles) && cycles.length > 0
      && cycles.every((row) => row?.poWorkload?.armed === true));
  // PO session uses the same symbol on all four panels. Distinct-fileId
  // rotation was an earlier under-reading harness habit — accept either.
  const distinctOk = cycles.length === HEAP_CYCLE_COUNT
    && cycles.every((row) => {
      const ids = Array.isArray(row.fileIds) ? row.fileIds.map(Number) : [];
      if (ids.length !== 4 || !ids.every((id) => Number.isFinite(id))) return false;
      const unique = new Set(ids);
      if (unique.size === 1) return true; // PO same-symbol mode
      if (unique.size !== 4) return false;
      if (surface === 'deployed') return true;
      return HEAP_CYCLE_DISTINCT_FILE_IDS.every((id) => unique.has(id));
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
      ? `usedJSHeapSize+forcedGc samples for baseline+${summary.cycleCount} cycles; detached counts present`
      : `missing usedJSHeapSize forced-GC samples or detachedDivCount (need ≥${HEAP_CYCLE_COUNT_MIN} cycles)`,
    { summary, footprintNonGrading: HEAP_FOOTPRINT_NON_GRADING },
  ));

  // Late-cycle jump detector (PO b85: flat ×3 then +45 MB on cycle 5).
  const heapDeltas = summary.heapDeltas || [];
  const early = heapDeltas.slice(0, 3).filter((d) => d != null);
  const late = heapDeltas.slice(3).filter((d) => d != null);
  const earlyMean = early.length
    ? early.reduce((a, b) => a + b, 0) / early.length
    : null;
  const lateMax = late.length ? Math.max(...late) : null;
  const lateJumpMb = lateMax != null ? lateMax / (1024 * 1024) : null;
  const earlyMeanMb = earlyMean != null ? earlyMean / (1024 * 1024) : null;
  const poLateJumpShape = lateMax != null
    && earlyMean != null
    && lateMax >= 30 * 1024 * 1024
    && lateMax >= earlyMean + 20 * 1024 * 1024;
  cells.push(cell(
    'HEAP-CYCLE-LATE-JUMP-SHAPE',
    summary.cycleCount >= HEAP_CYCLE_COUNT_MIN,
    summary.cycleCount < HEAP_CYCLE_COUNT_MIN
      ? `need ≥${HEAP_CYCLE_COUNT_MIN} cycles to observe PO late-jump (got ${summary.cycleCount})`
      : (poLateJumpShape
        ? `PO-LIKE late jump: earlyMean=${earlyMeanMb?.toFixed(2)}MB lateMax=${lateJumpMb?.toFixed(2)}MB deltasMb=${heapDeltas.map((d) => (d == null ? null : +(d / (1024 * 1024)).toFixed(2)))}`
        : `NO late jump of PO magnitude (+45MB on cycle≥4): earlyMean=${earlyMeanMb?.toFixed(2)}MB lateMax=${lateJumpMb?.toFixed(2)}MB deltasMb=${heapDeltas.map((d) => (d == null ? null : +(d / (1024 * 1024)).toFixed(2)))}`),
    {
      status: summary.cycleCount < HEAP_CYCLE_COUNT_MIN
        ? 'RED'
        : (poLateJumpShape ? 'PO-LIKE' : 'ABSENT'),
      earlyMeanMb,
      lateMaxMb: lateJumpMb,
      heapDeltasMb: heapDeltas.map((d) => (d == null ? null : d / (1024 * 1024))),
      nonBlocking: true,
      pass: summary.cycleCount >= HEAP_CYCLE_COUNT_MIN,
    },
  ));
  cells.push(cell(
    'HEAP-CYCLE-DISTINCT-FILEIDS',
    summary.distinctOk === true,
    summary.distinctOk
      ? 'each cycle loaded four panel fileIds (same-symbol PO mode or four distinct)'
      : 'cycle fileIds must be four finite ids (same-symbol or four distinct)',
    { fileIds: HEAP_CYCLE_DISTINCT_FILE_IDS.slice() },
  ));

  const workload = report.poWorkload;
  const workloadArmed = workload?.armedEveryCycle === true
    || (Array.isArray(report.cycles)
      && report.cycles.length > 0
      && report.cycles.every((row) => row?.poWorkload?.armed === true));
  // Live MultichartGrid surfaces must arm PO workload. Sealed fixtures skip.
  const workloadRequired = report.meta?.fixture == null
    && (report.meta?.poWorkload === true
      || report.meta?.surface === 'deployed'
      || report.meta?.surface === 'dist-v9');
  cells.push(cell(
    'HEAP-CYCLE-PO-WORKLOAD-ARMED',
    !workloadRequired || workloadArmed,
    !workloadRequired
      ? 'PO workload not required on this surface'
      : (workloadArmed
        ? `PO workload armed every cycle (indicators+order+live replay); arms=${workload?.arms?.length || report.cycles?.length}`
        : 'PO workload NOT armed — layout-only cycles cannot grade (GATE-01)'),
    {
      blocking: workloadRequired,
      workload,
    },
  ));

  const hand = report.poHandShape;
  cells.push(cell(
    'HEAP-CYCLE-PO-HAND-SHAPE',
    hand?.ok === true || !workloadRequired,
    !workloadRequired
      ? 'PO hand shape not required'
      : (hand?.ok
        ? `PO-HAND matched: meanΔ=${hand.meanDeltaMb?.toFixed?.(2) ?? hand.meanDeltaMb}MB lateJump=${hand.lateJumpMb?.toFixed?.(2) ?? hand.lateJumpMb}MB`
        : (hand?.reason || 'PO hand shape missing — cannot reproduce ~13 MB/cycle late-climb')),
    {
      status: !workloadRequired ? 'SKIP' : (hand?.ok ? 'PO-LIKE' : 'MISS'),
      // Non-blocking report cell: calibration/workload cells block ship.
      nonBlocking: true,
      pass: true,
      hand,
    },
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

  // W68 — full growth census (monotonic A-list + top-40 B-list).
  const census = report.growthCensus;
  const censusOk = !!census
    && census.signature === HEAP_GROWTH_CENSUS_SIGNATURE
    && Array.isArray(census.monotonicHoarders)
    && Array.isArray(census.topBySizeDelta)
    && Array.isArray(census.cycleComparisons)
    && census.cycleComparisons.length === HEAP_CYCLE_COUNT;
  cells.push(cell(
    'HEAP-GROWTH-CENSUS-EMITTED',
    censusOk,
    censusOk
      ? `full constructor tables ×${HEAP_CYCLE_COUNT}; A-list=${census.monotonicHoarders.length}; B-top=${census.topBySizeDelta.length}`
      : 'growthCensus missing or incomplete (need cycleComparisons + monotonicHoarders + topBySizeDelta)',
    { growthCensusSignature: HEAP_GROWTH_CENSUS_SIGNATURE },
  ));

  const expectedCycleCount = summary.cycleCount || HEAP_CYCLE_COUNT;
  const hoardersRanked = censusOk
    && census.monotonicHoarders.every((row, index, arr) => {
      if (!row.sizeDeltas || row.sizeDeltas.length !== expectedCycleCount) return false;
      if (!row.sizeDeltas.every((d) => d > 0)) return false;
      if (index === 0) return true;
      return arr[index - 1].totalSizeDelta >= row.totalSizeDelta;
    });
  cells.push(cell(
    'HEAP-GROWTH-MONOTONIC-HOARDERS',
    censusOk && hoardersRanked,
    !censusOk
      ? 'census missing'
      : `A-list size=${census.monotonicHoarders.length} rankedByTotalBytes=${hoardersRanked} (grew all ${expectedCycleCount} cycles, never shrank)`,
    {
      topHoarders: (census?.monotonicHoarders || []).slice(0, 15).map((row) => ({
        constructor: row.constructor,
        totalSizeDelta: row.totalSizeDelta,
        sizeDeltas: row.sizeDeltas,
        countDeltas: row.countDeltas,
      })),
    },
  ));

  const top40Ok = censusOk
    && census.topBySizeDelta.length <= HEAP_GROWTH_CENSUS_TOP_N;
  cells.push(cell(
    'HEAP-GROWTH-TOP40-CONTEXT',
    top40Ok,
    !censusOk
      ? 'census missing'
      : `B-list length=${census.topBySizeDelta.length} max=${HEAP_GROWTH_CENSUS_TOP_N}`,
    {
      topBySizeDelta: (census?.topBySizeDelta || []).slice(0, 10).map((row) => ({
        constructor: row.constructor,
        totalSizeDelta: row.totalSizeDelta,
      })),
    },
  ));

  const calibration = census?.calibration
    || (censusOk
      ? assessGrowthCensusCalibration(census, {
        meanHeapFloorDeltaBytes: summary.meanHeapDelta,
        meanDetachedDivDelta: summary.gradedDetachedDelta,
        poWorkloadArmed: workloadArmed,
        poHandShapeOk: hand?.ok === true,
      })
      : null);
  const leakCleared = summary.detachedStable === true && summary.heapBounded === true;
  const calibrationOk = !!calibration
    && (calibration.surfaceExercisesRealProduct === true || leakCleared);
  cells.push(cell(
    'HEAP-GROWTH-SURFACE-CALIBRATION',
    calibrationOk,
    !calibration
      ? 'calibration missing'
      : (calibration.finding
        || (calibrationOk
          ? `surface ok pins=${calibration.pinsMatched}/4 detachedΔ≈${calibration.detachedDivCountDeltaCycle1} uniqueElementΔ≈${calibration.uniqueElementDataDeltaCycle1} cssBackingΔ≈${calibration.cssPropertyValueBackingDeltaCycle1} heapMean=${calibration.meanHeapFloorDeltaBytes}`
          : 'HARNESS-NOT-REAL-PRODUCT')),
    {
      superiorWhenLeakPresent: true,
      reportFirstWhenRed: !calibrationOk,
      calibration,
      po: HEAP_GROWTH_PO_CALIBRATION,
    },
  ));

  // W69 — aggregated retainer paths for A-list tops (holder naming).
  const retainers = report.retainerPaths;
  const retainersOk = !!retainers
    && retainers.signature === HEAP_RETAINER_PATHS_SIGNATURE
    && retainers.ok === true
    && Array.isArray(retainers.byConstructor)
    && retainers.byConstructor.length > 0
    && retainers.byConstructor.every((block) => Array.isArray(block.paths));
  const suspectHits = retainersOk
    ? retainers.byConstructor.flatMap((block) => block.cacheSuspectHits || [])
    : [];
  const esd = retainersOk
    ? retainers.byConstructor.find((b) => /ExternalStringData/i.test(b.constructor))
    : null;
  const esdClass = esd?.classBytes || null;
  const esdTop = (esd?.paths || []).slice(0, 5);
  cells.push(cell(
    'HEAP-RETAINER-PATHS-AGGREGATED',
    retainersOk,
    !retainers
      ? 'retainerPaths missing (run live browser session)'
      : (retainersOk
        ? `aggregated paths for ${retainers.byConstructor.map((b) => b.constructor).join(', ')}; cacheSuspectPathLines=${suspectHits.length}; ExternalStringData classBytes=${JSON.stringify(esdClass)} topPath=${esdTop[0]?.path || 'none'}`
        : (retainers.error || 'retainer path aggregation incomplete')),
    {
      topPaths: retainersOk
        ? retainers.byConstructor.map((block) => ({
          constructor: block.constructor,
          totalSelfBytes: block.totalSelfBytes,
          classBytes: block.classBytes || null,
          paths: (block.paths || []).slice(0, 8).map((p) => ({
            bytes: p.totalSelfBytes,
            n: p.instanceCount,
            class: p.class,
            path: p.path,
            suspect: p.suspectTokens,
          })),
        }))
        : null,
      externalStringData: esd
        ? {
          totalSelfBytes: esd.totalSelfBytes,
          classBytes: esd.classBytes,
          topPaths: esdTop.map((p) => ({
            bytes: p.totalSelfBytes,
            n: p.instanceCount,
            class: p.class,
            path: p.path,
            suspect: p.suspectTokens,
          })),
        }
        : null,
      cacheSuspectHits: suspectHits.length,
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
  const census = report.report?.growthCensus || report.growthCensus;
  if (census?.summaryText) {
    lines.push('');
    lines.push(census.summaryText);
  } else if (census?.monotonicHoarders) {
    lines.push('');
    lines.push(`${HEAP_GROWTH_CENSUS_SIGNATURE} A-hoarders=${census.monotonicHoarders.length} B-top=${census.topBySizeDelta?.length || 0}`);
    for (const row of (census.monotonicHoarders || []).slice(0, 12)) {
      lines.push(`  A ${row.constructor} totalBytes=${row.totalSizeDelta} Δ=${(row.sizeDeltas || []).join(',')}`);
    }
  }
  const retainers = report.report?.retainerPaths || report.retainerPaths;
  if (retainers?.summaryText) {
    lines.push('');
    lines.push(retainers.summaryText);
  }
  return lines.join('\n');
}
