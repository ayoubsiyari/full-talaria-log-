/**
 * Canonical memory instrument for Manager C gates.
 *
 * Metric: performance.memory.usedJSHeapSize (after forced GC).
 * Task Manager / process RSS / "footprint" are diagnostic only and must never
 * grade M26, FIX3, or collapse-release claims (Director 2026-07-29: footprint
 * over-reported ~2.9× and could not show tens-of-MB releases).
 */

export const HEAP_METRIC_USED_JS_HEAP_SIZE = 'usedJSHeapSize';
export const HEAP_FOOTPRINT_NON_GRADING = true;

/** Minimum expand delta before collapse release can be graded (else UNPROVEN). */
export const HEAP_COLLAPSE_MIN_EXPAND_BYTES = 8 * 1024 * 1024;

/** Collapse must release at least this fraction of the expand delta. */
export const HEAP_COLLAPSE_RELEASE_FRACTION = 0.35;

/** Post-collapse retention above single baseline beyond this is residual. */
export const HEAP_COLLAPSE_RETENTION_MAX_BYTES = 64 * 1024 * 1024;

export function heapSampleShape(sample) {
  if (!sample || typeof sample !== 'object') return false;
  if (sample.exposed !== true) return false;
  if (!Number.isFinite(Number(sample.usedJSHeapSize))) return false;
  return true;
}

export function summarizeCollapseHeap(heap, {
  minExpandBytes = HEAP_COLLAPSE_MIN_EXPAND_BYTES,
  releaseFraction = HEAP_COLLAPSE_RELEASE_FRACTION,
  retentionMaxBytes = HEAP_COLLAPSE_RETENTION_MAX_BYTES,
} = {}) {
  const instrument = heap?.instrument && typeof heap.instrument === 'object' ? heap.instrument : null;
  const metricOk = instrument?.metric === HEAP_METRIC_USED_JS_HEAP_SIZE
    && instrument?.footprintNonGrading === true;
  const single = heap?.singleBaseline;
  const four = heap?.fourPeak;
  const post = heap?.postCollapse;
  const samplesOk = heapSampleShape(single) && heapSampleShape(four) && heapSampleShape(post);
  const forcedGcOk = single?.forcedGcAttempted === true
    && four?.forcedGcAttempted === true
    && post?.forcedGcAttempted === true;
  const forcedGcAvailable = single?.forcedGcAvailable === true
    && four?.forcedGcAvailable === true
    && post?.forcedGcAvailable === true;

  const singleBytes = samplesOk ? Number(single.usedJSHeapSize) : null;
  const fourBytes = samplesOk ? Number(four.usedJSHeapSize) : null;
  const postBytes = samplesOk ? Number(post.usedJSHeapSize) : null;
  const expandDeltaBytes = samplesOk ? fourBytes - singleBytes : null;
  const releaseBytes = samplesOk ? fourBytes - postBytes : null;
  const retentionBytes = samplesOk ? postBytes - singleBytes : null;

  const expandable = expandDeltaBytes != null && expandDeltaBytes >= minExpandBytes;
  const releaseOk = expandable
    && releaseBytes != null
    && releaseBytes >= releaseFraction * expandDeltaBytes
    && retentionBytes != null
    && retentionBytes <= retentionMaxBytes;

  let collapseStatus = 'RED';
  if (!metricOk || !samplesOk || !forcedGcOk) collapseStatus = 'RED';
  else if (!expandable) collapseStatus = 'UNPROVEN';
  else if (releaseOk) collapseStatus = 'GREEN';
  else collapseStatus = 'RED';

  return {
    metricOk,
    samplesOk,
    forcedGcOk,
    forcedGcAvailable,
    expandDeltaBytes,
    releaseBytes,
    retentionBytes,
    expandable,
    releaseOk,
    collapseStatus,
    instrumentOk: metricOk && samplesOk && forcedGcOk,
  };
}
