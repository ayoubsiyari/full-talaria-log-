/**
 * CPU-THREAD-CENSUS-V1 — attribute CPU across *threads*, not just main-thread JS.
 *
 * The PO's single-chart ceiling is ~111% of a core. Anything above 100% cannot
 * be main-thread JavaScript by definition, so a setTimeout/rAF callback probe
 * can never explain it: the excess lives on compositor, raster, GPU or worker
 * threads. This census sums Chrome trace events per thread so the total is
 * allowed to exceed one core, which is the shape that has to be reproduced.
 *
 * Nested trace events (a parent 'X' event containing children) must not be
 * double counted — that alone would manufacture a >100% reading out of an idle
 * browser. Per-thread busy time is therefore the *union* of event intervals.
 */

export const CPU_THREAD_CENSUS_SIGNATURE = 'CPU-THREAD-CENSUS-V1';

/** Trace categories that carry per-thread work for renderer + compositor + GPU. */
export const CPU_THREAD_CENSUS_CATEGORIES = Object.freeze([
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'toplevel',
  'blink',
  'cc',
  'gpu',
]);

function threadKey(pid, tid) {
  return `${pid}:${tid}`;
}

/**
 * Union of [start, end) intervals, in trace microseconds.
 * @returns {number} covered microseconds
 */
function mergedCoverageUs(intervals) {
  return mergedCoverage(intervals).coveredUs;
}

/**
 * Union of [start, end) intervals plus the largest single merged run.
 *
 * The largest run is what separates work from waiting: a thread that blocks on
 * an event (GpuVSyncThread waits for vsync) emits one slice spanning the whole
 * window, which is 100% "busy" by coverage and 0% CPU in reality.
 */
function mergedCoverage(intervals) {
  if (!intervals.length) return { coveredUs: 0, longestRunUs: 0, runs: 0 };
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let longest = 0;
  let runs = 0;
  let [curStart, curEnd] = intervals[0];
  const closeRun = () => {
    const run = curEnd - curStart;
    covered += run;
    if (run > longest) longest = run;
    runs += 1;
  };
  for (let i = 1; i < intervals.length; i += 1) {
    const [s, e] = intervals[i];
    if (s > curEnd) {
      closeRun();
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  closeRun();
  return { coveredUs: covered, longestRunUs: longest, runs };
}

/**
 * Threads whose trace slices measure blocking, not computation. Counting these
 * manufactures ~100% of a core per thread out of an idle browser.
 */
export const CPU_THREAD_CENSUS_WAIT_THREADS = Object.freeze([
  'GpuVSyncThread',
  'Chrome_IOThread',
  'MemoryInfra',
]);

/**
 * A single slice covering the window is *flagged*, never excluded: on a wait
 * thread it means blocking, but on CrRendererMain it means one enormous task,
 * which is the pathology this census exists to catch.
 */
const LONG_RUN_FRACTION = 0.9;

/**
 * Summarize per-thread CPU from raw Chrome trace events.
 *
 * @param {object[]} events raw Tracing.dataCollected events
 * @param {{wallMs?: number}} [opts] observation wall time; defaults to trace span
 */
export function summarizeTraceThreadCpu(events, { wallMs = null } = {}) {
  const rows = Array.isArray(events) ? events : [];
  const threadNames = new Map();
  const processNames = new Map();
  const intervalsByThread = new Map();
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const ev of rows) {
    if (!ev || ev.pid == null) continue;
    if (ev.ph === 'M') {
      if (ev.name === 'thread_name' && ev.args?.name) {
        threadNames.set(threadKey(ev.pid, ev.tid), String(ev.args.name));
      } else if (ev.name === 'process_name' && ev.args?.name) {
        processNames.set(String(ev.pid), String(ev.args.name));
      }
      continue;
    }
    // Only complete events carry a duration we can attribute to a thread.
    if (ev.ph !== 'X') continue;
    const dur = Number(ev.dur);
    const ts = Number(ev.ts);
    if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(ts)) continue;
    const key = threadKey(ev.pid, ev.tid);
    if (!intervalsByThread.has(key)) intervalsByThread.set(key, []);
    intervalsByThread.get(key).push([ts, ts + dur]);
    if (ts < minTs) minTs = ts;
    if (ts + dur > maxTs) maxTs = ts + dur;
  }

  const traceSpanMs = Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > minTs
    ? (maxTs - minTs) / 1000
    : 0;
  const effectiveWallMs = Number.isFinite(wallMs) && wallMs > 0 ? wallMs : traceSpanMs;

  const threads = [];
  for (const [key, intervals] of intervalsByThread) {
    const { coveredUs, longestRunUs, runs } = mergedCoverage(intervals);
    const busyMs = coveredUs / 1000;
    const longestRunMs = longestRunUs / 1000;
    const [pid, tid] = key.split(':');
    const threadName = threadNames.get(key) || null;
    const waitDominated = CPU_THREAD_CENSUS_WAIT_THREADS.includes(threadName);
    const singleRunSpansWindow = effectiveWallMs > 0
      && longestRunMs >= effectiveWallMs * LONG_RUN_FRACTION;
    threads.push({
      pid: Number(pid),
      tid: Number(tid),
      threadName,
      processName: processNames.get(pid) || null,
      busyMs: +busyMs.toFixed(3),
      ratioOfCore: effectiveWallMs > 0 ? +(busyMs / effectiveWallMs).toFixed(6) : null,
      events: intervals.length,
      longestRunMs: +longestRunMs.toFixed(3),
      runs,
      waitDominated,
      singleRunSpansWindow,
    });
  }
  threads.sort((a, b) => b.busyMs - a.busyMs);

  const counted = threads.filter((t) => !t.waitDominated);
  const totalBusyMs = counted.reduce((sum, t) => sum + t.busyMs, 0);
  const busyMsIncludingWaits = threads.reduce((sum, t) => sum + t.busyMs, 0);
  const mainThread = counted.find((t) => t.threadName === 'CrRendererMain') || null;

  return {
    signature: CPU_THREAD_CENSUS_SIGNATURE,
    wallMs: +effectiveWallMs.toFixed(3),
    traceSpanMs: +traceSpanMs.toFixed(3),
    threadCount: threads.length,
    countedThreadCount: counted.length,
    // Excluded from the total: blocking waits, not CPU. Reported so the
    // exclusion is auditable rather than silent.
    waitDominatedThreads: threads
      .filter((t) => t.waitDominated)
      .map((t) => ({ threadName: t.threadName, tid: t.tid, busyMs: t.busyMs })),
    totalBusyMs: +totalBusyMs.toFixed(3),
    busyMsIncludingWaits: +busyMsIncludingWaits.toFixed(3),
    totalPercentIncludingWaits: effectiveWallMs > 0
      ? +((busyMsIncludingWaits / effectiveWallMs) * 100).toFixed(2)
      : null,
    // May exceed 1.0 — that is the point: >100% of a core means multi-thread.
    totalCpuRatio: effectiveWallMs > 0 ? +(totalBusyMs / effectiveWallMs).toFixed(6) : null,
    totalCpuPercent: effectiveWallMs > 0 ? +((totalBusyMs / effectiveWallMs) * 100).toFixed(2) : null,
    mainThreadBusyMs: mainThread ? mainThread.busyMs : null,
    mainThreadPercent: mainThread && effectiveWallMs > 0
      ? +((mainThread.busyMs / effectiveWallMs) * 100).toFixed(2)
      : null,
    threads,
  };
}

/**
 * Grade a census against a claimed OS-level ceiling.
 *
 * `reproducesCeiling` is only true when the measured multi-thread total gets
 * within tolerance of the claim; a main-thread-only probe that lands far below
 * must be reported as an inadequate instrument rather than a refutation.
 */
export function assessCpuCeiling(census, {
  claimedPercent = 111,
  tolerancePercent = 20,
} = {}) {
  // Guard null explicitly: Number(null) is 0 and would grade an empty trace as
  // a real 0% reading instead of no data.
  const rawTotal = census?.totalCpuPercent;
  const rawMain = census?.mainThreadPercent;
  const total = rawTotal == null ? NaN : Number(rawTotal);
  const main = rawMain == null ? NaN : Number(rawMain);
  const measured = Number.isFinite(total) ? total : null;
  const reproducesCeiling = measured != null
    && measured >= claimedPercent - tolerancePercent;
  const exceedsOneCore = measured != null && measured > 100;
  return {
    signature: CPU_THREAD_CENSUS_SIGNATURE,
    claimedPercent,
    measuredPercent: measured,
    mainThreadPercent: Number.isFinite(main) ? main : null,
    offCoreThreadPercent: measured != null && Number.isFinite(main)
      ? +(measured - main).toFixed(2)
      : null,
    exceedsOneCore,
    reproducesCeiling,
    verdict: measured == null
      ? 'NO-DATA'
      : (reproducesCeiling
        ? (exceedsOneCore ? 'CEILING-REPRODUCED-MULTITHREAD' : 'CEILING-REPRODUCED-SINGLE-CORE')
        : 'BELOW-CLAIM'),
    note: measured != null && !reproducesCeiling
      ? `measured ${measured}% vs claimed ${claimedPercent}% — instrument or workload does not reproduce the PO surface`
      : null,
  };
}
