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

/**
 * QUIESCE-01 — the omission this module propagated to 26 instruments, fixed here rather than in them.
 *
 * V1 forced collection and waited, and never stopped the page. Every instrument that inherited the
 * protocol inherited that: it collected on a live, allocating session and read afterwards, so the
 * pair of readings around the collection were two random-phase samples of a running sawtooth. The
 * five b120 reps show the signature — post-GC totals spanning 188.2 MB across one configuration, and
 * a JS heap that read HIGHER after collection in four of five.
 *
 * The four instruments that got this right each wrote their own local `pauseAll`, because there was
 * no shared one to call. That is the whole mechanism of the failure: correctness was available only
 * to whoever thought of it. It is now the default, and opting out is loud.
 *
 * Pauses the host realm and every child frame, reporting per-realm before/after so a pause that did
 * not take is visible rather than assumed.
 */
export async function quiesce(page) {
  const realms = await page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || w.chart?.replaySystem;
        if (!rs) return;
        const before = !!rs.isPlaying;
        if (typeof rs.pause === 'function') rs.pause();
        else if (typeof rs.togglePlayPause === 'function' && before) rs.togglePlayPause();
        out.push({ realm: label, before, after: !!rs.isPlaying });
      } catch (e) { out.push({ realm: label, error: String(e).slice(0, 80) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i += 1) {
      try { visit(window.frames[i], `frame${i}`); } catch (_) { /* cross-origin */ }
    }
    return out;
  }).catch((e) => [{ realm: 'host', error: String(e?.message || e).slice(0, 120) }]);

  const found = Array.isArray(realms) ? realms.filter((r) => !r.error) : [];
  // Verified means: we found replay systems AND every one of them reports stopped. Finding none is
  // NOT quiescence — it is an unknown, and an unknown must not read as a pass.
  const verified = found.length > 0 && found.every((r) => r.after === false);
  return {
    quiescent: verified,
    realms,
    realmsFound: found.length,
    wasPlaying: found.some((r) => r.before === true),
    why: verified ? null
      : (found.length === 0
        ? 'no replay system found in any realm, so quiescence could not be established or ruled out'
        : 'at least one realm still reports playing after the pause'),
  };
}

/**
 * The counterpart to `quiesce`. Lives here for the same reason `quiesce` does: an instrument that
 * pauses mid-run to take a settled reading has to put the page back, and a locally-written resume is
 * how you get a ten-hour arm that spent nine of them stopped. Reports per-realm so a resume that did
 * not take is visible at the moment it fails rather than at the end of the arm.
 */
export async function resumePlay(page) {
  const realms = await page.evaluate(() => {
    const out = [];
    const visit = (w, label) => {
      try {
        const rs = w.replaySystem || w.chart?.replaySystem;
        if (!rs) return;
        const before = !!rs.isPlaying;
        if (typeof rs.play === 'function') rs.play();
        else if (typeof rs.togglePlayPause === 'function' && !before) rs.togglePlayPause();
        out.push({ realm: label, before, after: !!rs.isPlaying });
      } catch (e) { out.push({ realm: label, error: String(e).slice(0, 80) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i += 1) {
      try { visit(window.frames[i], `frame${i}`); } catch (_) { /* cross-origin */ }
    }
    return out;
  }).catch((e) => [{ realm: 'host', error: String(e?.message || e).slice(0, 120) }]);

  const found = Array.isArray(realms) ? realms.filter((r) => !r.error) : [];
  const resumed = found.length > 0 && found.some((r) => r.after === true);
  return {
    resumed,
    realms,
    realmsFound: found.length,
    why: resumed ? null
      : (found.length === 0
        ? 'no replay system found in any realm, so playback could not be restarted'
        : 'no realm reports playing after the resume; the arm would continue on a stopped page'),
  };
}

/** Read total JS heap across the page's isolates, for the across-collection check in condition C. */
async function readHeapMB(page) {
  try {
    const v = await page.evaluate(() => (performance?.memory?.usedJSHeapSize ?? null));
    return v == null ? null : +(v / (1024 * 1024)).toFixed(2);
  } catch { return null; }
}

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
  /**
   * QUIESCE-01. Pausing before the settle is the DEFAULT, because a reading taken on a playing page
   * is a different quantity and 26 instruments were silently taking it. Opting out is deliberate and
   * requires a reason, which is recorded on the reading — an instrument that genuinely measures a
   * live session (arena sampling during play) says so in the artifact rather than looking identical
   * to one that forgot.
   */
  quiesceFirst = true,
  quiesceOptOutReason = null,
}) {
  const t0 = Date.now();
  let eventResult = null;
  if (event) {
    log(`${label}: event`);
    eventResult = await event();
  }
  const eventAt = Date.now();

  let quiescence;
  if (quiesceFirst) {
    log(`${label}: quiesce`);
    quiescence = await quiesce(page);
    if (!quiescence.quiescent) log(`${label}: QUIESCENCE NOT VERIFIED — ${quiescence.why}`);
  } else {
    quiescence = {
      quiescent: false,
      optedOut: true,
      why: quiesceOptOutReason
        || 'quiesceFirst=false with no reason given; this reading samples a live page and its '
           + 'error bar is the sawtooth amplitude, not the measurement precision',
    };
    log(`${label}: NOT quiescing — ${quiescence.why}`);
  }

  let waited = 0;
  if (!skipSettle) {
    log(`${label}: settle ${(settleMs / 1000).toFixed(0)}s`);
    await sleep(settleMs);
    waited = Date.now() - eventAt;
  }

  // Condition C needs both sides of the collection. Taken here so every inheriting instrument gets
  // the re-allocation check without writing it.
  const heapBeforeGcMB = await readHeapMB(page);
  log(`${label}: forced collection`);
  const gc = await forceCollection(page);
  const heapAfterGcMB = await readHeapMB(page);

  log(`${label}: read`);
  const value = await read();

  const grade = gradeSettle({ settleWaitedMs: waited, forcedGcOk: gc.forcedGcOk });
  const heapRoseMB = (heapBeforeGcMB != null && heapAfterGcMB != null)
    ? +(heapAfterGcMB - heapBeforeGcMB).toFixed(2) : null;
  return {
    label,
    protocol: 'SETTLE-PROTOCOL-V2',
    order: 'event -> quiesce -> settle -> forced collection -> read',
    at: new Date().toISOString(),
    eventResult,
    settleMs,
    settleWaitedMs: waited,
    skipSettle,
    // The fields SETTLE-CRITERION-V2 grades on. Present on every reading now, so an artifact can be
    // judged phase-clean or phase-corrupt after the fact instead of by reading the instrument.
    quiescent: quiescence.quiescent,
    quiescence,
    heapBeforeGcMB,
    heapAfterGcMB,
    heapRoseAcrossCollectionMB: heapRoseMB,
    collectionResampled: heapRoseMB == null ? null : heapRoseMB > 0,
    ...gc,
    ...grade,
    totalElapsedMs: Date.now() - t0,
    value,
  };
}
