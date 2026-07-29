/**
 * HEAP-GROWTH-CENSUS-V1 — monotonic N-cycle constructor growth ranking.
 *
 * A) constructors that grew in ALL cycles and never shrank (sizeDelta>0 ×N),
 *    ranked by total bytes — the hoarder list.
 * B) raw top ~40 by total size delta (baseline→final) for context.
 *
 * One-off growth is noise; growth every cycle with no release is the hunt signature.
 * Default N follows HEAP-CYCLE-MEMORY-V1 (6; 3 retired).
 */

import { compareConstructorAggregates } from './heap-snapshot-aggregates.mjs';

export const HEAP_GROWTH_CENSUS_SIGNATURE = 'TALARIA_HEAP_GROWTH_CENSUS_V1';
export const HEAP_GROWTH_CENSUS_TOP_N = 40;

/** PO manual comparison magnitudes on real product (order-of-magnitude pins). */
export const HEAP_GROWTH_PO_CALIBRATION = Object.freeze({
  detachedDivPerCycle: 21_699,
  uniqueElementDataPerCycle: 30_565,
  cssPropertyValueBackingPerCycle: 22_209,
  approxFurtherDetachedRows: 20,
  /** PO canary hand 2026-07-29: ~13 MB/cycle (75→…→155 over 6 cycles). */
  approxTotalMbPerCycle: 13,
  /** Fail closed if mean Detached <div>/HTMLDivElement growth is below this. */
  minDetachedDivOrder: 5_000,
  /**
   * Fail closed if mean heap floor growth is below this (bytes).
   * Layout-only under-read (~0.7 MB) must NOT pass; PO hand ~13 MB/cycle must.
   */
  minHeapFloorOrderBytes: 10 * 1024 * 1024,
});

/**
 * @param {Array<Map<string, { constructor: string, count: number, size: number }>>} snapshots
 *   length === cycleCount+1: [baseline, afterCycle1, …, afterCycleN] return-to-single aggregates
 */
export function buildGrowthCensus(snapshots, {
  topN = HEAP_GROWTH_CENSUS_TOP_N,
} = {}) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) {
    throw new Error('growth census requires baseline + ≥1 return-to-single aggregates');
  }
  const cycleCount = snapshots.length - 1;
  const cycleComparisons = [];
  for (let i = 0; i < cycleCount; i += 1) {
    cycleComparisons.push({
      cycle: i + 1,
      rows: compareConstructorAggregates(snapshots[i], snapshots[i + 1]),
    });
  }

  /** @type {Map<string, { constructor: string, countDeltas: number[], sizeDeltas: number[], totalCountDelta: number, totalSizeDelta: number }>} */
  const byCtor = new Map();
  for (let c = 0; c < cycleCount; c += 1) {
    for (const row of cycleComparisons[c].rows) {
      let entry = byCtor.get(row.constructor);
      if (!entry) {
        entry = {
          constructor: row.constructor,
          countDeltas: Array.from({ length: cycleCount }, () => 0),
          sizeDeltas: Array.from({ length: cycleCount }, () => 0),
          totalCountDelta: 0,
          totalSizeDelta: 0,
        };
        byCtor.set(row.constructor, entry);
      }
      entry.countDeltas[c] = row.countDelta;
      entry.sizeDeltas[c] = row.sizeDelta;
    }
  }
  for (const entry of byCtor.values()) {
    entry.totalCountDelta = entry.countDeltas.reduce((a, b) => a + b, 0);
    entry.totalSizeDelta = entry.sizeDeltas.reduce((a, b) => a + b, 0);
  }

  const monotonicHoarders = [...byCtor.values()]
    .filter((entry) => entry.sizeDeltas.every((d) => d > 0))
    .sort((a, b) => b.totalSizeDelta - a.totalSizeDelta
      || b.totalCountDelta - a.totalCountDelta
      || String(a.constructor).localeCompare(String(b.constructor)));

  const topBySizeDelta = [...byCtor.values()]
    .filter((entry) => entry.totalSizeDelta !== 0 || entry.totalCountDelta !== 0)
    .sort((a, b) => b.totalSizeDelta - a.totalSizeDelta
      || b.totalCountDelta - a.totalCountDelta
      || String(a.constructor).localeCompare(String(b.constructor)))
    .slice(0, topN);

  const fullBaselineToFinal = compareConstructorAggregates(
    snapshots[0],
    snapshots[snapshots.length - 1],
  );

  return {
    signature: HEAP_GROWTH_CENSUS_SIGNATURE,
    cycleComparisons: cycleComparisons.map((block) => ({
      cycle: block.cycle,
      rowCount: block.rows.length,
      // Full table — triage uses A/B surfaces; JSON keeps every constructor.
      rows: block.rows,
    })),
    fullBaselineToFinal,
    /** A) grew in all cycles, never shrank — ranked by total bytes. */
    monotonicHoarders,
    /** B) raw top N by total size delta for context. */
    topBySizeDelta,
    meta: {
      topN,
      cycleCount,
      ranking: `monotonic-growth-across-all-${cycleCount}-cycles`,
      note: 'One-off growth is noise; A-list is the hoarder signature.',
    },
  };
}

function findCtorDelta(rows, predicates) {
  for (const row of rows || []) {
    const name = String(row.constructor || '');
    if (predicates.some((fn) => fn(name))) return row;
  }
  return null;
}

/**
 * Calibration vs PO manual DevTools comparison on the real product.
 * If magnitudes are not of that order, the harness is not exercising the product.
 */
export function assessGrowthCensusCalibration(census, {
  meanHeapFloorDeltaBytes = null,
  meanDetachedDivDelta = null,
  poWorkloadArmed = false,
  poHandShapeOk = false,
} = {}) {
  const cycle1 = census?.cycleComparisons?.[0]?.rows || [];
  const detached = findCtorDelta(cycle1, [
    (n) => /^Detached\s+HTMLDivElement$/i.test(n),
    (n) => /^Detached\s*<div>$/i.test(n),
  ]);
  // Prefer aggregated Detached <div>; fall back to instrument mean.
  const detachedDelta = detached?.countDelta
    ?? (Number.isFinite(meanDetachedDivDelta) ? meanDetachedDivDelta : null);

  const uniqueElement = findCtorDelta(cycle1, [
    (n) => /UniqueElementData/i.test(n),
  ]);
  const cssBacking = findCtorDelta(cycle1, [
    (n) => /HeapVectorBacking.*CSSPropertyValue/i.test(n),
    (n) => /CSSPropertyValue/i.test(n) && /HeapVectorBacking/i.test(n),
  ]);
  const detachedRows = (cycle1 || []).filter((row) => String(row.constructor).startsWith('Detached')
    && row.countDelta > 0);

  const detachedOrderOk = detachedDelta != null
    && detachedDelta >= HEAP_GROWTH_PO_CALIBRATION.minDetachedDivOrder;
  const heapOrderOk = meanHeapFloorDeltaBytes != null
    && meanHeapFloorDeltaBytes >= HEAP_GROWTH_PO_CALIBRATION.minHeapFloorOrderBytes;
  const uniqueOrderOk = uniqueElement?.countDelta != null
    && uniqueElement.countDelta >= 10_000;
  const cssOrderOk = cssBacking?.countDelta != null
    && cssBacking.countDelta >= 10_000;

  const pinsMatched = [detachedOrderOk, uniqueOrderOk, cssOrderOk, heapOrderOk]
    .filter(Boolean).length;
  // Real product: classic DOM pins (≥2), OR PO workload armed with heap-order
  // / hand-shape (layout-only ~0.7 MB/cycle is decorative — GATE-01).
  const surfaceExercisesRealProduct = pinsMatched >= 2
    || (poWorkloadArmed === true && (heapOrderOk || poHandShapeOk));

  return {
    surfaceExercisesRealProduct,
    pinsMatched,
    detachedOrderOk,
    uniqueOrderOk,
    cssOrderOk,
    heapOrderOk,
    poWorkloadArmed: poWorkloadArmed === true,
    poHandShapeOk: poHandShapeOk === true,
    detachedDivCountDeltaCycle1: detachedDelta,
    uniqueElementDataDeltaCycle1: uniqueElement?.countDelta ?? null,
    cssPropertyValueBackingDeltaCycle1: cssBacking?.countDelta ?? null,
    detachedRowGrowthCountCycle1: detachedRows.length,
    meanHeapFloorDeltaBytes,
    po: HEAP_GROWTH_PO_CALIBRATION,
    finding: surfaceExercisesRealProduct
      ? null
      : `HARNESS-NOT-REAL-PRODUCT: PO pins matched ${pinsMatched}/4 (Detached<div>Δ=${detachedDelta}, UniqueElementDataΔ=${uniqueElement?.countDelta ?? null}, CSSPropertyBackingΔ=${cssBacking?.countDelta ?? null}, heapMeanBytes=${meanHeapFloorDeltaBytes}, poWorkloadArmed=${poWorkloadArmed}, poHandShapeOk=${poHandShapeOk}). Need ≥2 DOM pins OR (PO workload armed ∧ heap≳10MB/cycle or PO hand late-jump shape). PO hand ~${HEAP_GROWTH_PO_CALIBRATION.approxTotalMbPerCycle} MB/cycle.`,
  };
}

export function formatGrowthCensusSummary(census) {
  const lines = [`${HEAP_GROWTH_CENSUS_SIGNATURE}`];
  if (census?.calibration?.finding) {
    lines.push(`CALIBRATION-FAIL: ${census.calibration.finding}`);
  }
  const n = census?.meta?.cycleCount || census?.cycleComparisons?.length || '?';
  lines.push(`A) monotonic hoarders (grew all ${n} cycles): ${census.monotonicHoarders.length}`);
  for (const row of (census.monotonicHoarders || []).slice(0, 25)) {
    lines.push(
      `  ${row.constructor} totalBytes=${row.totalSizeDelta} deltas=${row.sizeDeltas.join(',')} counts=${row.countDeltas.join(',')}`,
    );
  }
  lines.push(`B) top ${HEAP_GROWTH_CENSUS_TOP_N} by total size delta:`);
  for (const row of (census.topBySizeDelta || []).slice(0, HEAP_GROWTH_CENSUS_TOP_N)) {
    lines.push(
      `  ${row.constructor} totalBytes=${row.totalSizeDelta} deltas=${row.sizeDeltas.join(',')}`,
    );
  }
  return lines.join('\n');
}
