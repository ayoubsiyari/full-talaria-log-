/**
 * SETTLE-PROTOCOL-V1 — checklist item 2.
 *
 * Protocol, fixed: EVENT -> SETTLE 2–3 min -> FORCED COLLECTION -> READ.
 *
 * Why the settle exists. The advisor's lazy-decommit mechanism says a reading taken immediately
 * after a release can show memory the allocator has already logically freed but not yet returned to
 * the OS. My own 19.6 MB combined-canvas number is under exactly that suspicion, and my first
 * combined run read -25.6 MB purely because it sampled before the pair-switch load had settled.
 * A reading without a settle is not a cheap reading; it is a different quantity.
 *
 * Every reading carries its settle metadata (`settleMs`, `settleWaitedMs`, `forcedGcOk`,
 * `protocolCompliant`) so a non-compliant reading can never be mistaken for a compliant one
 * downstream. A reading that skipped the settle is still recorded — labelled, not discarded.
 */

export const SETTLE_MIN_MS = 120_000;   // 2 min
export const SETTLE_DEFAULT_MS = 150_000; // 2.5 min, mid-band
export const SETTLE_MAX_MS = 180_000;   // 3 min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Force collection on the page's isolate. Reports whether the CDP route was actually available. */
export async function forceCollection(page, { rounds = 3, gapMs = 400, tailMs = 1500 } = {}) {
  let cdp = null;
  let heapProfilerOk = false;
  let runtimeOk = false;
  let pageGcOk = false;
  try {
    cdp = await page.createCDPSession();
    await cdp.send('HeapProfiler.enable').catch(() => {});
    for (let i = 0; i < rounds; i++) {
      try { await cdp.send('HeapProfiler.collectGarbage'); heapProfilerOk = true; } catch (_) {}
      try { await cdp.send('Runtime.collectGarbage'); runtimeOk = true; } catch (_) {}
      try {
        const got = await page.evaluate(() => {
          if (typeof gc === 'function') { try { gc(); return true; } catch (_) { return false; } }
          return false;
        });
        pageGcOk = pageGcOk || got === true;
      } catch (_) {}
      await sleep(gapMs);
    }
    await sleep(tailMs);
  } catch (e) {
    return { forcedGcOk: false, why: String(e?.message || e).slice(0, 160), heapProfilerOk, runtimeOk, pageGcOk, rounds };
  } finally {
    try { if (cdp) await cdp.detach(); } catch (_) {}
  }
  return {
    forcedGcOk: heapProfilerOk || runtimeOk || pageGcOk,
    heapProfilerOk,
    runtimeOk,
    pageGcOk,
    rounds,
    // A forced GC that only ever hit the page-level `gc()` is weaker than one that reached the
    // HeapProfiler; the difference matters when a floor looks surprisingly high.
    route: heapProfilerOk ? 'HeapProfiler.collectGarbage' : (runtimeOk ? 'Runtime.collectGarbage' : (pageGcOk ? 'page gc()' : 'none')),
  };
}

/**
 * Grade a settle without performing it — used by self-tests and by readers validating an artifact.
 */
export function gradeSettle({ settleWaitedMs, forcedGcOk, minMs = SETTLE_MIN_MS, maxMs = SETTLE_MAX_MS }) {
  const waited = Number(settleWaitedMs);
  const longEnough = Number.isFinite(waited) && waited >= minMs;
  const withinBand = Number.isFinite(waited) && waited <= maxMs;
  const compliant = longEnough && forcedGcOk === true;
  return {
    protocolCompliant: compliant,
    settleLongEnough: longEnough,
    settleWithinBand: withinBand,
    why: compliant
      ? null
      : (!longEnough
        ? `settle ${Number.isFinite(waited) ? Math.round(waited / 1000) : '?'}s is under the ${minMs / 1000}s floor; the reading may include memory the allocator has not yet decommitted.`
        : 'forced collection did not run, so this is a pause reading and pause has been shown to release nothing.'),
    // Over-band is not non-compliance, but it is worth naming: a very long settle on a PLAYING
    // session is also more delivered bars, which moves the thing being measured.
    overBandNote: (longEnough && !withinBand)
      ? `settle ${Math.round(waited / 1000)}s exceeds the ${maxMs / 1000}s ceiling; on a playing session the extra time also delivers bars.`
      : null,
  };
}

/**
 * Run the full protocol around a reading.
 *
 * @param {object} o
 * @param {import('puppeteer').Page} o.page
 * @param {() => Promise<any>} o.read the actual measurement (arena dump, footprint, whatever)
 * @param {() => Promise<any>} [o.event] the event being measured (release, switch, ...). Optional:
 *   a periodic soak sample has no event, only a settle since the previous sample.
 * @param {number} [o.settleMs]
 * @param {(msg: string) => void} [o.log]
 */
export async function readUnderSettleProtocol({
  page,
  read,
  event = null,
  settleMs = SETTLE_DEFAULT_MS,
  label = 'reading',
  log = () => {},
  skipSettle = false,
}) {
  const t0 = Date.now();
  let eventResult = null;
  if (event) {
    log(`${label}: event`);
    eventResult = await event();
  }
  const eventAt = Date.now();

  let waited = 0;
  if (!skipSettle) {
    log(`${label}: settle ${(settleMs / 1000).toFixed(0)}s`);
    await sleep(settleMs);
    waited = Date.now() - eventAt;
  }

  log(`${label}: forced collection`);
  const gc = await forceCollection(page);

  log(`${label}: read`);
  const value = await read();

  const grade = gradeSettle({ settleWaitedMs: waited, forcedGcOk: gc.forcedGcOk });
  return {
    label,
    protocol: 'SETTLE-PROTOCOL-V1',
    order: 'event -> settle -> forced collection -> read',
    at: new Date().toISOString(),
    eventResult,
    settleMs,
    settleWaitedMs: waited,
    skipSettle,
    ...gc,
    ...grade,
    totalElapsedMs: Date.now() - t0,
    value,
  };
}
