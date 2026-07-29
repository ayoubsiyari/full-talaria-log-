/**
 * HEAP-CYCLE-DATASET-CONFIG-V1 — control and *verify* the dataset count the
 * heap-cycle workload actually exercises.
 *
 * Residue is governed by how many independent (symbol, timeframe) datasets the
 * grid holds, not by panel count: four panels on one dataset share a pipeline,
 * four panels on four datasets each build their own bar store, resample caches
 * and worker state. Measuring the identical configuration while the PO measures
 * the distinct one under-reads growth, so the mode is explicit here and the
 * observed per-panel state is read back rather than assumed.
 *
 * The read-back matters: a host timeframe pick fans out to every panel when
 * Interval sync is on, which silently collapses a "distinct" plan back to one
 * dataset. Only the observed pairs may be reported.
 */

export const HEAP_CYCLE_DATASET_CONFIG_SIGNATURE = 'HEAP-CYCLE-DATASET-CONFIG-V1';

/** Distinct store resolutions (each is a native QuestDB pre-aggregate). */
export const HEAP_CYCLE_DISTINCT_TIMEFRAMES = Object.freeze(['1m', '5m', '15m', '1h']);

export const HEAP_CYCLE_DATASET_MODE_DISTINCT = 'distinct';
export const HEAP_CYCLE_DATASET_MODE_IDENTICAL = 'identical';

export const HEAP_CYCLE_DATASET_MODES = Object.freeze([
  HEAP_CYCLE_DATASET_MODE_DISTINCT,
  HEAP_CYCLE_DATASET_MODE_IDENTICAL,
]);

function datasetKey(fileId, timeframe) {
  return `${String(fileId)}|${String(timeframe)}`;
}

/**
 * Build the per-panel dataset plan for one cycle.
 *
 * distinct  → panel i gets fileIds[i] at timeframes[i] (4 independent datasets)
 * identical → every panel gets fileIds[0] at timeframes[0] (1 shared dataset)
 *
 * @returns {{ mode: string, expectedDistinctDatasets: number, panels: Array<{panelId: string, fileId: (number|string), timeframe: string}> }}
 */
export function buildDatasetPlan({
  mode = HEAP_CYCLE_DATASET_MODE_DISTINCT,
  panelIds = ['A', 'B', 'C', 'D'],
  fileIds = [],
  timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES,
} = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!HEAP_CYCLE_DATASET_MODES.includes(normalizedMode)) {
    throw new Error(
      `unknown dataset mode ${JSON.stringify(mode)} `
      + `(expected ${HEAP_CYCLE_DATASET_MODES.join('|')})`,
    );
  }
  const ids = Array.isArray(fileIds) ? fileIds.filter((id) => id != null) : [];
  if (!ids.length) throw new Error('buildDatasetPlan requires at least one fileId');
  const tfs = Array.isArray(timeframes) && timeframes.length
    ? timeframes
    : HEAP_CYCLE_DISTINCT_TIMEFRAMES;

  const panels = panelIds.map((panelId, index) => {
    if (normalizedMode === HEAP_CYCLE_DATASET_MODE_IDENTICAL) {
      return { panelId, fileId: ids[0], timeframe: String(tfs[0]) };
    }
    return {
      panelId,
      fileId: ids[index % ids.length],
      timeframe: String(tfs[index % tfs.length]),
    };
  });

  const expectedDistinctDatasets = new Set(
    panels.map((p) => datasetKey(p.fileId, p.timeframe)),
  ).size;

  return { mode: normalizedMode, expectedDistinctDatasets, panels };
}

/**
 * Grade observed per-panel datasets against the plan.
 *
 * `ok` is false when the plan asked for more distinct datasets than the product
 * actually ended up holding — that is the harness lying to itself about which
 * configuration it measured, and it must invalidate the run rather than be
 * reported as the expensive config.
 *
 * @param {{expectedDistinctDatasets: number, mode: string, panels: object[]}} plan
 * @param {Array<{panelId: string, fileId: any, timeframe: string, ok?: boolean}>} observed
 */
export function assessDatasetDistinctness(plan, observed) {
  const rows = Array.isArray(observed) ? observed : [];
  const readable = rows.filter((r) => r && r.fileId != null && r.timeframe);
  const pairs = new Set(readable.map((r) => datasetKey(r.fileId, r.timeframe)));
  const observedDistinctDatasets = pairs.size;
  const observedDistinctFileIds = new Set(readable.map((r) => String(r.fileId))).size;
  const observedDistinctTimeframes = new Set(readable.map((r) => String(r.timeframe))).size;
  const expected = Number(plan?.expectedDistinctDatasets) || 0;

  const mismatches = [];
  const planById = new Map((plan?.panels || []).map((p) => [p.panelId, p]));
  for (const row of rows) {
    const want = planById.get(row?.panelId);
    if (!want) continue;
    if (String(row?.fileId) !== String(want.fileId)
      || String(row?.timeframe) !== String(want.timeframe)) {
      mismatches.push({
        panelId: row.panelId,
        wantFileId: want.fileId,
        gotFileId: row?.fileId ?? null,
        wantTimeframe: want.timeframe,
        gotTimeframe: row?.timeframe ?? null,
      });
    }
  }

  const panelsRead = readable.length;
  const ok = panelsRead === rows.length
    && panelsRead > 0
    && observedDistinctDatasets >= expected;

  return {
    signature: HEAP_CYCLE_DATASET_CONFIG_SIGNATURE,
    mode: plan?.mode || null,
    ok,
    panelsRead,
    panelsRequested: rows.length,
    expectedDistinctDatasets: expected,
    observedDistinctDatasets,
    observedDistinctFileIds,
    observedDistinctTimeframes,
    datasets: [...pairs].sort(),
    mismatches,
  };
}

/**
 * Worst-case distinctness across every cycle: the run may only claim the
 * configuration its weakest cycle actually held.
 */
export function summarizeDatasetConfig(cycleAssessments) {
  const rows = (Array.isArray(cycleAssessments) ? cycleAssessments : []).filter(Boolean);
  if (!rows.length) {
    return {
      signature: HEAP_CYCLE_DATASET_CONFIG_SIGNATURE,
      ok: false,
      cycles: 0,
      reason: 'no dataset assessments recorded',
    };
  }
  const minObserved = Math.min(...rows.map((r) => Number(r.observedDistinctDatasets) || 0));
  const maxExpected = Math.max(...rows.map((r) => Number(r.expectedDistinctDatasets) || 0));
  return {
    signature: HEAP_CYCLE_DATASET_CONFIG_SIGNATURE,
    ok: rows.every((r) => r.ok === true),
    mode: rows[0].mode || null,
    cycles: rows.length,
    expectedDistinctDatasets: maxExpected,
    minObservedDistinctDatasets: minObserved,
    cyclesWithFullDistinctness: rows.filter(
      (r) => (Number(r.observedDistinctDatasets) || 0) >= (Number(r.expectedDistinctDatasets) || 0),
    ).length,
    mismatchCycles: rows.filter((r) => (r.mismatches || []).length > 0).length,
  };
}
