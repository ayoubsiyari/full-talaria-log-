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
/**
 * Same underlying file (symbol) at four timeframes. Distinct as (fileId|tf) pairs —
 * four independent resample/pipeline states — but a SHARED market-time window so
 * multi-TF playhead sync can advance every panel. `distinct` with four different
 * files whose ranges do not overlap parks three panels on their last bar forever.
 */
export const HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL = 'same-symbol';

export const HEAP_CYCLE_DATASET_MODES = Object.freeze([
  HEAP_CYCLE_DATASET_MODE_DISTINCT,
  HEAP_CYCLE_DATASET_MODE_IDENTICAL,
  HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
]);

function datasetKey(fileId, timeframe) {
  return `${String(fileId)}|${String(timeframe)}`;
}

/**
 * Build the per-panel dataset plan for one cycle.
 *
 * distinct     → panel i gets fileIds[i] at timeframes[i] (4 independent datasets)
 * identical    → every panel gets fileIds[0] at timeframes[0] (1 shared dataset)
 * same-symbol  → every panel gets fileIds[0] at timeframes[i] (4 TF views of one window)
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
    if (normalizedMode === HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL) {
      return { panelId, fileId: ids[0], timeframe: String(tfs[index % tfs.length]) };
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
 * CONF01-COMMON-WINDOW-V1 — A's hand-across (docs/plan3/A-TO-C-CONF01-COMMON-WINDOW.md).
 *
 * FOUR DISTINCT (fileId, tf) PAIRS IS NECESSARY AND NOT SUFFICIENT. `assessDatasetDistinctness`
 * above grades identity; it cannot see calendar. Measured under a plan that only asserted identity:
 * the 1m host held 18–23 Jun while the peers held 17 Apr – 18 May, so multi-TF sync resolved
 * `_findLastRawIndexAtOrBefore(peerData, hostTs)` to the final bar on every tick — the 1999/2000,
 * 3909/3910 and 2493/2494 pins. Three inert tenants under a four-panel label.
 *
 * The existing delivery gate catches this, but only as a SYMPTOM and only after arming: it counts
 * panels that failed to advance. This grades the CAUSE, before arming, from the loaded ranges.
 *
 * THREE OUTCOMES, KEPT DISTINCT ON PURPOSE (BIND-01). A gate that cannot say which of these it saw
 * sends people to debug the wrong thing:
 *   WINDOW_UNREADABLE   the ranges could not be read — a broken extraction point, NOT evidence
 *                       about the data. Fails closed, but must never be reported as "no overlap".
 *   NO_COMMON_WINDOW    ranges read cleanly and genuinely do not share the host's session start.
 *                       This is the live defect A measured.
 *   COMMON_WINDOW_OK    every panel's [dataFirst, dataLast] contains the host session start.
 */
export const CONF01_COMMON_WINDOW_SIGNATURE = 'CONF01-COMMON-WINDOW-V1';

const DAY_MS = 86_400_000;

/**
 * How much MARKET time a run will consume — the second half of A's exhaustion finding.
 *
 * Overlap and runway are different failures and the gate must not conflate them. Overlap asks
 * "do the panels share the host's session start"; runway asks "is there enough shared data AHEAD
 * of that start to reach the end of the run". A seed can pass the first and still park every
 * panel an hour in, which is the dataset exhaustion the soak kept hitting.
 *
 * The arithmetic is the product's own: the SPEED-01 ladder is BARS PER SECOND, so a run consumes
 *   wallSeconds x barsPerSecond x secondsPerBar
 * of market time. It is worth seeing the size of this before trusting any long run — ten hours at
 * speed 10 on 1m bars is 36,000 x 10 x 60 = 21.6 million market seconds, or **250 days**. No file
 * on this deployment holds that, which is precisely why the soak wraps rather than plays through.
 *
 * @param {{wallMs: number, barsPerSecond: number, barSeconds?: number}} input
 */
export function computeRequiredRunwayMs({ wallMs, barsPerSecond, barSeconds = 60 } = {}) {
  const wall = Number(wallMs);
  const rate = Number(barsPerSecond);
  const perBar = Number(barSeconds);
  if (!Number.isFinite(wall) || !Number.isFinite(rate) || !Number.isFinite(perBar)) return null;
  if (wall <= 0 || rate <= 0 || perBar <= 0) return 0;
  return (wall / 1000) * rate * perBar * 1000;
}

/** Strict: only a finite number is a timestamp. `null`, `''` and `undefined` are unreadable. */
function ms(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const isoOrNull = (v) => (v == null ? null : new Date(v).toISOString());

/**
 * @param {{hostSessionStartMs: number, panels: Array<{panelId?: string, timeframe?: string,
 *   fileId?: any, dataFirstMs?: number, dataLastMs?: number}>, requiredRunwayMs?: number}} input
 */
export function assessCommonWindow({ hostSessionStartMs, panels = [], requiredRunwayMs = 0 } = {}) {
  const rows = Array.isArray(panels) ? panels : [];
  const start = ms(hostSessionStartMs);
  const runway = Math.max(0, Number(requiredRunwayMs) || 0);

  const graded = rows.map((p) => {
    const first = ms(p?.dataFirstMs);
    const last = ms(p?.dataLastMs);
    const readable = first != null && last != null;
    const covers = readable && start != null && start >= first && start <= last;
    return {
      panelId: p?.panelId ?? null,
      timeframe: p?.timeframe ?? null,
      fileId: p?.fileId ?? null,
      dataFirstMs: first,
      dataLastMs: last,
      dataFirstIso: isoOrNull(first),
      dataLastIso: isoOrNull(last),
      readable,
      coversHostSessionStart: covers,
      // Signed: positive means the host starts AFTER this panel's data ends, which is A's case.
      shortByDays: readable && start != null && !covers
        ? Number(((start > last ? start - last : first - start) / DAY_MS).toFixed(2))
        : null,
    };
  });

  const unreadable = graded.filter((g) => !g.readable);
  const base = {
    signature: CONF01_COMMON_WINDOW_SIGNATURE,
    hostSessionStartMs: start,
    hostSessionStartIso: isoOrNull(start),
    panelsRequested: rows.length,
    panelsReadable: graded.length - unreadable.length,
    panels: graded,
    requiredRunwayMs: runway,
  };

  if (rows.length === 0) {
    return { ...base, state: 'WINDOW_UNREADABLE', ok: false, reason: 'no panel ranges supplied; nothing was graded' };
  }
  if (unreadable.length > 0) {
    return {
      ...base,
      state: 'WINDOW_UNREADABLE',
      ok: false,
      reason: `could not read the loaded range for ${unreadable.length}/${rows.length} panel(s) `
        + `(${unreadable.map((u) => u.panelId ?? u.timeframe ?? '?').join(', ')}). `
        + 'This is a broken read, not a statement about the data — do not report it as a window failure.',
    };
  }
  if (start == null) {
    return { ...base, state: 'NO_HOST_SESSION_START', ok: false, reason: 'host session start was not readable; the gate has no reference point to grade against' };
  }

  const intersectionStartMs = Math.max(...graded.map((g) => g.dataFirstMs));
  const intersectionEndMs = Math.min(...graded.map((g) => g.dataLastMs));
  const intersectionMs = Math.max(0, intersectionEndMs - intersectionStartMs);
  const withIntersection = {
    ...base,
    intersectionStartMs,
    intersectionEndMs,
    intersectionStartIso: isoOrNull(intersectionStartMs),
    intersectionEndIso: isoOrNull(intersectionEndMs),
    intersectionMs,
    intersectionDays: Number((intersectionMs / DAY_MS).toFixed(2)),
  };

  const missing = graded.filter((g) => !g.coversHostSessionStart);
  if (missing.length > 0) {
    return {
      ...withIntersection,
      state: 'NO_COMMON_WINDOW',
      ok: false,
      offendingPanels: missing,
      reason: `${missing.length}/${rows.length} panel(s) do not hold the host session start `
        + `${isoOrNull(start)}: ${missing.map((m) => `${m.timeframe ?? m.panelId} file ${m.fileId} covers `
        + `${m.dataFirstIso} -> ${m.dataLastIso}, short by ${m.shortByDays} days`).join('; ')}`,
    };
  }
  // Runway is graded from the host start forward: bars behind it cannot be replayed into.
  const runwayAheadMs = intersectionEndMs - start;
  /**
   * Reported on EVERY outcome, not only the failing one. A run that fits with three days to spare
   * and a run that fits with three minutes to spare are both "ok", and the difference decides
   * whether the next person may lengthen the run. Silence here is how the exhaustion was
   * rediscovered three times.
   */
  const runwayReport = {
    requiredRunwayMs: runway,
    runwayAheadMs,
    runwayAheadDays: Number((runwayAheadMs / DAY_MS).toFixed(2)),
    runwayDeficitMs: runway > 0 ? Math.max(0, runway - runwayAheadMs) : 0,
    // How many times the run will exhaust the shared window and be re-seeded. >1 means the
    // "N-hour run" covers the same market data N times, which is a different measurement.
    wrapsExpected: runway > 0 && runwayAheadMs > 0
      ? Number((runway / runwayAheadMs).toFixed(2))
      : null,
  };
  if (runway > 0 && runwayAheadMs < runway) {
    return {
      ...withIntersection,
      ...runwayReport,
      state: 'INSUFFICIENT_RUNWAY',
      ok: false,
      reason: `every panel holds the host session start, but only ${(runwayAheadMs / DAY_MS).toFixed(2)} days `
        + `of shared data lie ahead of it (required ${(runway / DAY_MS).toFixed(2)}). The session would run off the common window `
        + `and be re-seeded about ${runwayReport.wrapsExpected ?? '?'} time(s), so it would re-measure the same market data rather than play through it.`,
    };
  }
  return {
    ...withIntersection,
    ...runwayReport,
    state: 'COMMON_WINDOW_OK',
    ok: true,
    reason: `all ${rows.length} panels hold the host session start; shared window `
      + `${isoOrNull(intersectionStartMs)} -> ${isoOrNull(intersectionEndMs)} (${withIntersection.intersectionDays} days)`,
  };
}

/**
 * FAIL CLOSED. A's requirement is that boot does not arm under a broken window, so this throws
 * rather than returning a flag a caller can forget to read.
 *
 * The message pushes toward fixing the SEED rather than relabelling the arm as one-panel: the
 * 1,024 MB bar is written against four live panels, and a run relabelled down is not comparable
 * to it.
 */
export function assertCommonWindow(assessment) {
  if (assessment?.ok === true) return assessment;
  const state = assessment?.state || 'WINDOW_UNREADABLE';
  const fix = state === 'WINDOW_UNREADABLE'
    ? 'Fix the range read before drawing any conclusion about the dataset.'
    : `Fix the seed — pick files/fetch windows that overlap, or use datasetMode='${HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL}'. `
      + 'Do NOT relabel the arm as one-panel: the 1,024 MB bar is written against four live panels.';
  const error = new Error(`CONF-01 common-window gate [${state}]: ${assessment?.reason || 'no reason recorded'}. ${fix}`);
  error.name = 'CommonWindowRefusal';
  error.state = state;
  error.assessment = assessment;
  throw error;
}

/**
 * What a caller should DO with an assessment — extracted from the boot path so the wiring can be
 * tested without a browser.
 *
 * The rule this encodes, and the reason it is a function rather than an `if` inside a 200-line
 * async boot: overlap and runway fail for different reasons and must not share an outcome.
 *   REFUSE  — overlap is broken, or an unreadable range, or the caller demanded single-pass data.
 *   DECLARE — the seed overlaps but is too short; the run may proceed and must say so.
 *   PROCEED — nothing to report.
 *
 * @param {{assessment: object, runwayPolicy?: 'declare'|'require'}} input
 */
export function decideCommonWindowAction({ assessment, runwayPolicy = 'declare' } = {}) {
  const state = assessment?.state || 'WINDOW_UNREADABLE';
  if (assessment?.ok === true) {
    return { action: 'PROCEED', state, reason: assessment?.reason || null };
  }
  if (state === 'INSUFFICIENT_RUNWAY' && String(runwayPolicy) !== 'require') {
    return {
      action: 'DECLARE',
      state,
      wrapsExpected: assessment?.wrapsExpected ?? null,
      runwayAheadDays: assessment?.runwayAheadDays ?? null,
      reason: assessment?.reason || null,
    };
  }
  return { action: 'REFUSE', state, reason: assessment?.reason || null };
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
