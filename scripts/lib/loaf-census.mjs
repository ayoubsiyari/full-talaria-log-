/**
 * LoAF per-script attribution census, installed via CDP and NEVER via product bytes.
 *
 * THE BINDING RULE: an instrument that edits the served files changes the digest, and the soak then
 * measures a build nobody sealed - SOAK-SEAL defeated through the instrument instead of the code. So this
 * goes in through Page.addScriptToEvaluateOnNewDocument (Puppeteer's evaluateOnNewDocument), which runs
 * in the page and is not of the page. The served bytes are untouched and the digest is unchanged.
 *
 * WHAT IT COSTS, stated because instrument innocence is a standing requirement here: the observer keeps
 * NO entry objects. Every LoAF entry is folded immediately into fixed-width counters keyed by
 * script identity, the key set is capped, and nothing references a PerformanceEntry after the callback
 * returns. Reading is destructive - the harness takes and resets - so nothing accumulates between samples.
 *
 * The prior long-task observer in this codebase reported an impossible 1,019 ms/s because buffered:true
 * replays entries from before the window. This one does not use buffered, records its own window start,
 * and drops anything starting before it.
 */

/** Runs INSIDE the page. Kept self-contained: it is serialised to a string and injected. */
function installer() {
  if (window.__C_LOAF__) return;
  const MAX_KEYS = 400;
  const state = {
    windowStart: performance.now(),
    frames: 0,
    totalDurationMs: 0,
    totalBlockingMs: 0,
    totalStyleLayoutMs: 0,
    longest: 0,
    scripts: new Map(),   // key -> {ms, n, forcedLayoutMs}
    droppedKeys: 0,
    overflowed: false,
  };
  window.__C_LOAF__ = state;

  const fold = (key, ms, forced) => {
    let row = state.scripts.get(key);
    if (!row) {
      if (state.scripts.size >= MAX_KEYS) { state.droppedKeys += 1; state.overflowed = true; return; }
      row = { ms: 0, n: 0, forcedLayoutMs: 0 };
      state.scripts.set(key, row);
    }
    row.ms += ms; row.n += 1; row.forcedLayoutMs += forced || 0;
  };

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.startTime < state.windowStart) continue;   // never replay pre-window entries
        state.frames += 1;
        state.totalDurationMs += e.duration || 0;
        state.totalBlockingMs += Math.max(0, (e.blockingDuration ?? 0));
        if (e.duration > state.longest) state.longest = e.duration;
        const renderStart = e.renderStart || 0;
        const styleStart = e.styleAndLayoutStart || 0;
        if (styleStart && renderStart) state.totalStyleLayoutMs += Math.max(0, (e.startTime + e.duration) - styleStart);
        for (const s of (e.scripts || [])) {
          // Identity is source + invoker, because the same file appears under several invokers and the
          // deliverable is WHO RUNS IT, not merely what is hot.
          const src = s.sourceURL || s.name || 'unknown';
          const fn = s.sourceFunctionName || '';
          const inv = s.invoker || s.invokerType || '';
          fold(`${src}|${fn}|${inv}`, s.duration || 0, s.forcedStyleAndLayoutDuration || 0);
        }
        // Deliberately no reference to `e` survives this iteration.
      }
    });
    obs.observe({ type: 'long-animation-frame', buffered: false });
    state.supported = true;
  } catch (err) {
    state.supported = false;
    state.error = String(err).slice(0, 200);
  }
}

/** Runs INSIDE the page. Take-and-reset, so nothing accumulates across samples. */
function reader() {
  const s = window.__C_LOAF__;
  if (!s) return null;
  const now = performance.now();
  const windowMs = now - s.windowStart;
  const scripts = [...s.scripts.entries()]
    .map(([k, v]) => { const [sourceURL, fn, invoker] = k.split('|'); return { sourceURL, fn, invoker, ms: +v.ms.toFixed(1), calls: v.n, forcedLayoutMs: +v.forcedLayoutMs.toFixed(1) }; })
    .sort((a, b) => b.ms - a.ms).slice(0, 25);
  const out = {
    supported: s.supported !== false,
    error: s.error ?? null,
    windowMs: +windowMs.toFixed(0),
    frames: s.frames,
    framesPerSec: windowMs > 0 ? +((s.frames / windowMs) * 1000).toFixed(2) : null,
    loafMsPerSec: windowMs > 0 ? +((s.totalDurationMs / windowMs) * 1000).toFixed(1) : null,
    blockingMsPerSec: windowMs > 0 ? +((s.totalBlockingMs / windowMs) * 1000).toFixed(1) : null,
    longestMs: +s.longest.toFixed(1),
    distinctScripts: s.scripts.size,
    keySetOverflowed: s.overflowed,
    droppedKeys: s.droppedKeys,
    topScripts: scripts,
  };
  s.windowStart = now; s.frames = 0; s.totalDurationMs = 0; s.totalBlockingMs = 0;
  s.totalStyleLayoutMs = 0; s.longest = 0; s.scripts.clear();
  return out;
}

/**
 * Install on every future document AND into every live frame. addScriptToEvaluateOnNewDocument alone
 * only reaches documents created after the call, and this soak's documents already exist by the time the
 * boot gate passes - registering it alone would have produced a census of nothing all night.
 */
export async function installLoafCensus(page) {
  const src = `(${installer.toString()})()`;
  let onNewDocument = false;
  try { await page.evaluateOnNewDocument(src); onNewDocument = true; } catch { /* recorded below */ }
  let live = 0;
  for (const f of page.frames()) {
    try { await f.evaluate(src); live += 1; } catch { /* cross-origin or torn-down frame */ }
  }
  return { onNewDocument, liveFramesInjected: live, viaProductBytes: false };
}

/** Read and reset across all frames. Per-realm, because the host carries most of the load here. */
export async function readLoafCensus(page) {
  const src = `(${reader.toString()})()`;
  const realms = [];
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate(src);
      if (r) realms.push({ url: (f.url() || '').slice(0, 80), ...r });
    } catch { /* frame gone between enumeration and read */ }
  }
  if (!realms.length) return { ok: false, why: 'no realm returned a census', realms: [] };

  const total = realms.reduce((a, r) => a + (r.loafMsPerSec || 0), 0);
  // ATTRIBUTION INVARIANT. Script time attributed inside animation frames cannot exceed the time those
  // frames occupied. The rehearsal read 25.7 s of script inside 18.0 s of frames, so this census is NOT
  // safe to quote as a ms/s decomposition until that is understood - LoAF script durations appear to
  // include time the entry is not exclusively on-thread. Same discipline as the >1000 ms/s rule that
  // caught three instrument defects: publish the violation, never the ratio.
  const frameMsTotal = realms.reduce((a, r) => a + ((r.loafMsPerSec || 0) * (r.windowMs || 0) / 1000), 0);
  const scriptMsTotal = realms.reduce((a, r) => a + r.topScripts.reduce((b, s) => b + s.ms, 0), 0);
  const overAttributed = frameMsTotal > 0 && scriptMsTotal > frameMsTotal * 1.05;
  const merged = new Map();
  for (const r of realms) {
    for (const s of r.topScripts) {
      const k = `${s.sourceURL}|${s.fn}|${s.invoker}`;
      const row = merged.get(k) || { ...s, ms: 0, calls: 0, forcedLayoutMs: 0 };
      row.ms += s.ms; row.calls += s.calls; row.forcedLayoutMs += s.forcedLayoutMs;
      merged.set(k, row);
    }
  }
  return {
    ok: true,
    realmCount: realms.length,
    loafMsPerSecAllRealms: +total.toFixed(1),
    hostSharePercent: realms.length && total > 0 ? +(((realms[0].loafMsPerSec || 0) / total) * 100).toFixed(1) : null,
    anyUnsupported: realms.some((r) => !r.supported),
    anyOverflowed: realms.some((r) => r.keySetOverflowed),
    scriptMsTotal: +scriptMsTotal.toFixed(0),
    frameMsTotal: +frameMsTotal.toFixed(0),
    attributionRatio: frameMsTotal > 0 ? +(scriptMsTotal / frameMsTotal).toFixed(2) : null,
    overAttributed,
    attributionNote: overAttributed
      ? 'ATTRIBUTED SCRIPT TIME EXCEEDS FRAME TIME. Use this census for RANKING and for naming who calls what; do NOT quote its ms/s as a share of the thread until the overlap is explained.'
      : null,
    topScripts: [...merged.values()].sort((a, b) => b.ms - a.ms).slice(0, 15),
    perRealm: realms.map((r) => ({ url: r.url, loafMsPerSec: r.loafMsPerSec, blockingMsPerSec: r.blockingMsPerSec, frames: r.frames, longestMs: r.longestMs })),
  };
}
