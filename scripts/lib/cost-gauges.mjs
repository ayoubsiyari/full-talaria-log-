/**
 * The three gauges an A8 cost-neutrality comparison is judged on: blocking ms/s, allocation rate and
 * the heap series behind a slope.
 *
 * EXTRACTED RATHER THAN RESTATED. The pre-amendment baseline and the post-amendment build must be read
 * by the SAME code, or the difference between them includes the difference between two implementations
 * of the same idea. This is the readFootprint lesson: a second copy of a gauge produced two digests for
 * one build once already.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Blocking milliseconds per wall-second, from longtask entries, thresholded at 50 ms.
 *
 * Carries three defences learned the hard way: buffered entries from before the window are excluded by
 * start time (they once produced 1,019 ms/s), the physical ceiling of 1,000 ms/s per thread voids the
 * reading rather than publishing it, and the observer is disconnected so repeated calls cannot pile up.
 */
export async function measureBlocking(page, windowMs = 5000, key = '__C_COST_LT') {
  const installed = await page.evaluate((k) => {
    if (window[k]) return 'already-installed';
    window[k] = { entries: [], dropped: 0, startedAt: performance.now() };
    window[k].observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (window[k].entries.length < 5000) window[k].entries.push([Math.round(e.startTime), Math.round(e.duration)]);
        else window[k].dropped += 1;
      }
    });
    window[k].observer.observe({ type: 'longtask', buffered: true });
    return 'installed';
  }, key).catch((e) => `install-failed: ${String(e && e.message).slice(0, 80)}`);
  if (!/installed/.test(installed)) return { blockingMsPerSec: null, blockingNote: installed };

  await sleep(windowMs);

  const got = await page.evaluate((k) => {
    const lt = window[k];
    if (!lt) return null;
    const out = { entries: lt.entries.slice(), dropped: lt.dropped, startedAt: lt.startedAt, observedMs: performance.now() - lt.startedAt };
    try { lt.observer.disconnect(); } catch { /* already gone */ }
    delete window[k];
    return out;
  }, key).catch(() => null);
  if (!got || !Array.isArray(got.entries)) return { blockingMsPerSec: null, blockingNote: 'observer produced no readable result' };

  const live = got.entries.filter(([st]) => st >= got.startedAt);
  const d = live.map(([, du]) => du);
  const sec = got.observedMs / 1000;
  const blocking = sec > 0 ? +(d.reduce((s, x) => s + Math.max(0, x - 50), 0) / sec).toFixed(1) : null;
  const totalLt = sec > 0 ? +(d.reduce((s, x) => s + x, 0) / sec).toFixed(1) : null;
  const possible = (totalLt ?? 0) <= 1000;
  return {
    blockingMsPerSec: possible ? blocking : null,
    totalLongTaskMsPerSec: possible ? totalLt : null,
    longTasksOver500: d.filter((x) => x > 500).length,
    longTasksOver50: d.length,
    blockingWindowSec: +sec.toFixed(1),
    blockingPreWindowExcluded: got.entries.length - live.length,
    blockingEntriesDropped: got.dropped,
    blockingNote: possible ? null : `IMPOSSIBLE READING VOIDED: ${totalLt} ms/s of long-task time in one second on one thread. Recorded as null rather than published.`,
  };
}

/**
 * Bytes allocated per wall-second, via V8's sampling heap profiler.
 *
 * ALLOCATION RATE IS NOT HEAP GROWTH. This counts bytes handed out, including everything collected
 * moments later; the heap slope counts what survives. An animation contract that allocates hard per
 * frame and frees it all shows here and nowhere else, which is exactly the cost A8 is asked about.
 *
 * Sampled, not exhaustive, so it is an estimate scaled from a sampling interval - fine for comparing
 * two builds on the same interval, not a byte count.
 */
export async function measureAllocationRate(cdp, windowMs = 10000, { samplingIntervalBytes = 32768 } = {}) {
  try {
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: samplingIntervalBytes });
  } catch (err) {
    return { allocBytesPerSec: null, allocNote: `could not start sampling: ${String(err && err.message).slice(0, 90)}` };
  }
  const t0 = Date.now();
  await sleep(windowMs);
  let profile = null;
  try {
    const res = await cdp.send('HeapProfiler.stopSampling');
    profile = res && res.profile;
  } catch (err) {
    return { allocBytesPerSec: null, allocNote: `could not stop sampling: ${String(err && err.message).slice(0, 90)}` };
  }
  const sec = (Date.now() - t0) / 1000;
  if (!profile || !profile.head || !(sec > 0)) return { allocBytesPerSec: null, allocNote: 'sampler returned no profile' };

  // The profile is a call tree; total allocation is the sum of selfSize over every node. Top callers are
  // kept because "which build allocates more" is far less useful than "and here is what is doing it".
  const byFn = new Map();
  let total = 0;
  const walk = (node) => {
    const self = node.selfSize || 0;
    total += self;
    if (self > 0 && node.callFrame) {
      const cf = node.callFrame;
      const name = `${cf.functionName || '(anonymous)'} @ ${String(cf.url || '').split('/').pop()}:${cf.lineNumber ?? '?'}`;
      byFn.set(name, (byFn.get(name) || 0) + self);
    }
    for (const c of node.children || []) walk(c);
  };
  walk(profile.head);

  const top = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([fn, bytes]) => ({ fn, mbPerSec: +(bytes / 1048576 / sec).toFixed(3), share: total > 0 ? +(100 * bytes / total).toFixed(1) : null }));

  return {
    allocBytesPerSec: Math.round(total / sec),
    allocMBPerSec: +(total / 1048576 / sec).toFixed(3),
    allocWindowSec: +sec.toFixed(1),
    allocSamplingIntervalBytes: samplingIntervalBytes,
    allocTopCallers: top,
    allocNote: null,
  };
}
