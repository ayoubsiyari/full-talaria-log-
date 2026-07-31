/**
 * SWEEP-GAUGES-V1 — the full gauge set SWEEP-01 asks for at every sweep point, "even when it
 * isn't the question", because the expensive part is the run and not the reading.
 *
 * MEAS-02 scope, stated once here so every sweep artifact can point at it:
 *
 * COLLECTED
 *   renderer private memory at OS level, per process type (browser/renderer/gpu)
 *   GPU process private memory (this is what "GPU memory" means on this harness — it is the
 *     GPU process's private footprint, not a graphics-driver allocation figure)
 *   JS heap live and after two forced collections, per realm and summed
 *   DOM elements, DOM nodes, listeners, documents, frames, workers
 *   copies-per-bar: bar-like array slots, identity-distinct bar objects, resident bars
 *   per-tick wall time: CPU-ms per advanced bar, and bars/second
 *   recalc cadence and cost (when the counter has been installed)
 *   paints per second and paints per advanced bar (the honest proxy for "renders per commit")
 *   storage: localStorage bytes, StorageManager estimate, service-worker cache count
 *   network: request count and transferred bytes since boot
 *   renderer and GPU CPU percent
 *
 * NOT COLLECTED, and no sweep may claim them
 *   true main-thread share by category — that needs a trace, which costs more than a sweep point.
 *     Renderer CPU percent is reported instead and is NOT the same number.
 *   "renders per commit" as a ratio to React commits — paints/sec and paints/bar are proxies.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Installs cheap in-page counters. Idempotent: safe to call after a re-arm. */
export async function installSweepCounters(page) {
  const source = () => {
    if (window.__sweepCounters) return { already: true };
    const c = { paints: 0, rafs: 0, longTaskMs: 0, installedAt: Date.now() };
    window.__sweepCounters = c;
    const ch = window.chart;
    // Paints: wrap whatever the chart calls to draw. Names differ across builds, so wrap every
    // candidate that exists and count them all rather than guessing one.
    for (const name of ['draw', 'render', 'redraw', '_draw', 'paint']) {
      if (ch && typeof ch[name] === 'function' && !ch[name].__sweepWrapped) {
        const orig = ch[name].bind(ch);
        const wrapped = function (...a) { c.paints += 1; return orig(...a); };
        wrapped.__sweepWrapped = true;
        try { ch[name] = wrapped; } catch (_) { /* frozen */ }
      }
    }
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) c.longTaskMs += e.duration;
      });
      po.observe({ entryTypes: ['longtask'] });
      c.longTaskObserved = true;
    } catch (_) { c.longTaskObserved = false; }
    return { already: false, wrapped: true };
  };
  const out = [];
  for (const frame of page.frames()) {
    try { out.push(await frame.evaluate(source)); } catch { /* frame gone */ }
  }
  return out;
}

/** Per-realm reading. Everything here is one evaluation, no forced GC. */
function realmGaugeSource() {
  const ch = window.chart;
  const rs = ch && ch.replaySystem;
  const c = window.__sweepCounters;
  const isBarLike = (o) => {
    if (!o || typeof o !== 'object') return false;
    const ok = ('o' in o && 'c' in o) || ('open' in o && 'close' in o);
    if (!ok) return false;
    const v = o.o ?? o.open;
    return typeof v === 'number';
  };
  // Copies-per-bar, restricted to the arrays B3 proved carry the mass. The full graph walk is
  // B3's job; a sweep point wants the same numbers cheaply.
  const named = [
    ['replaySystem.fullRawData', rs && rs.fullRawData],
    ['replaySystem.fullData', rs && rs.fullData],
    ['chart.rawData', ch && ch.rawData],
    ['chart.data', ch && ch.data],
    ['dataPipeline._resampleCache.result', ch && ch.dataPipeline && ch.dataPipeline._resampleCache && ch.dataPipeline._resampleCache.result],
    ['chart.displaySeries', ch && ch.displaySeries],
  ];
  const seen = new WeakSet();
  let slots = 0;
  let distinct = 0;
  const arrays = [];
  for (const [path, arr] of named) {
    if (!Array.isArray(arr) || !arr.length || !isBarLike(arr[0])) continue;
    slots += arr.length;
    arrays.push({ path, slots: arr.length });
    const cap = Math.min(arr.length, 60_000);
    for (let i = 0; i < cap; i += 1) {
      const el = arr[i];
      if (el && typeof el === 'object' && !seen.has(el)) { seen.add(el); distinct += 1; }
    }
  }
  return {
    realm: `${location.pathname}${location.search}`.slice(-46),
    timeframe: ch && ch.currentTimeframe ? String(ch.currentTimeframe) : null,
    mode: rs && typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: rs && typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    playing: !!(rs && rs.isPlaying),
    replayIndex: rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
    residentBars: Array.isArray(ch && ch.data) ? ch.data.length : null,
    visibleStartIndex: ch && Number.isFinite(ch.visibleStartIndex) ? ch.visibleStartIndex : null,
    visibleEndIndex: ch && Number.isFinite(ch.visibleEndIndex) ? ch.visibleEndIndex : null,
    visibleBars: (ch && Number.isFinite(ch.visibleStartIndex) && Number.isFinite(ch.visibleEndIndex))
      ? ch.visibleEndIndex - ch.visibleStartIndex : null,
    indicatorsActive: ((ch && ch.indicators && ch.indicators.active) || []).length,
    barSlots: slots,
    distinctBarObjects: distinct,
    barArrays: arrays,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
    elements: document.querySelectorAll('*').length,
    paints: c ? c.paints : null,
    longTaskMs: c ? +c.longTaskMs.toFixed(0) : null,
    countersAgeSec: c ? +((Date.now() - c.installedAt) / 1000).toFixed(1) : null,
  };
}

/** Storage and network, read once on the host frame. */
async function readStorageAndNetwork(page) {
  return page.evaluate(async () => {
    let lsBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        lsBytes += (k || '').length + (localStorage.getItem(k) || '').length;
      }
    } catch (_) { lsBytes = -1; }
    let estimate = null;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        estimate = { usageMB: +((e.usage || 0) / 1048576).toFixed(2), quotaMB: +((e.quota || 0) / 1048576).toFixed(0) };
      }
    } catch (_) { /* unavailable */ }
    let cacheCount = null;
    try { if (window.caches) cacheCount = (await caches.keys()).length; } catch (_) { /* unavailable */ }
    const res = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
    return {
      localStorageKB: lsBytes >= 0 ? +(lsBytes / 1024).toFixed(1) : null,
      storageEstimate: estimate,
      serviceWorkerCaches: cacheCount,
      networkRequests: res.length,
      networkTransferredMB: +(res.reduce((t, r) => t + (r.transferSize || 0), 0) / 1048576).toFixed(2),
    };
  }).catch(() => ({}));
}

async function readCounters(cdp) {
  const out = { documents: null, frames: null, nodes: null, listeners: null, jsHeapMB: null };
  try {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    out.documents = m.Documents ?? null;
    out.frames = m.Frames ?? null;
    out.nodes = m.Nodes ?? null;
    out.listeners = m.JSEventListeners ?? null;
    out.jsHeapMB = m.JSHeapUsedSize ? +(m.JSHeapUsedSize / 1048576).toFixed(2) : null;
  } catch { /* no metrics domain */ }
  return out;
}

/**
 * Worker realms, WITH their heaps. Counting workers was never the gap — the gap was that a worker
 * heap lives in its own V8 isolate, so neither `usedJSHeapSize` nor `Performance.getMetrics` on the
 * page can see a byte of it.
 *
 * `performance.measureUserAgentSpecificMemory()` is the documented route and is tried first, but it
 * requires cross-origin isolation (COOP/COEP) which this server does not send, so it is expected to
 * be unavailable and its unavailability is recorded rather than assumed. The route that works
 * regardless: attach to each worker target over CDP and ask that isolate directly.
 */
async function readWorkers(browserCdp, page) {
  const out = { workers: null, workerTypes: [], workerHeaps: [], workerHeapTotalMB: null, uaSpecificMemory: null };
  try {
    const { targetInfos } = await browserCdp.send('Target.getTargets');
    const workers = (targetInfos || []).filter((t) => /worker/i.test(t.type));
    out.workers = workers.length;
    out.workerTypes = [...new Set(workers.map((w) => w.type))];

    // The first version of this reached workers through browser.targets(), on the assumption that a
    // browser-level session cannot answer Runtime.getHeapUsage for another isolate. GATE-01 failed it
    // against a 120 MB in-worker ballast: browser.targets() does not list DEDICATED workers at all, so
    // zero heaps were read. CDP does see them, so the working route is to attach to the target id from
    // Target.getTargets with a flattened session and talk to it over the same browser connection.
    // Three routes are tried in order and the one that answered is recorded, because a gauge that
    // silently changes how it reads is not a gauge.
    let total = 0;
    let measured = 0;
    const browser = page?.browser?.();
    const routesTried = [];

    const readViaFlattenedSession = async (targetId) => {
      const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId, flatten: true });
      const conn = typeof browserCdp.connection === 'function' ? browserCdp.connection() : null;
      const session = conn && typeof conn.session === 'function' ? conn.session(sessionId) : null;
      if (!session) throw new Error('no flattened session from connection');
      try {
        return await session.send('Runtime.getHeapUsage');
      } finally {
        await browserCdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
    };

    for (const w of workers) {
      const row = {
        type: w.type, url: String(w.url || '').slice(-70), heapUsedMB: null, heapTotalMB: null,
        via: null, why: null,
      };
      let usage = null;
      try {
        usage = await readViaFlattenedSession(w.targetId);
        row.via = 'flattened-session';
      } catch (err) {
        row.why = `flattened: ${String(err?.message || err).slice(0, 60)}`;
      }
      // Fallback: Puppeteer's own WebWorker list, which does cover dedicated workers even when
      // browser.targets() omits them.
      if (!usage && page && typeof page.workers === 'function') {
        for (const pw of page.workers()) {
          if (!String(pw.url() || '').includes(String(w.url || '').slice(-30))) continue;
          try {
            const client = pw.client ?? pw._client;
            if (client && typeof client.send === 'function') {
              usage = await client.send('Runtime.getHeapUsage');
              row.via = 'page.workers';
            }
          } catch (err) { row.why = `${row.why || ''} pageWorkers: ${String(err?.message || err).slice(0, 50)}`; }
          if (usage) break;
        }
      }
      // Last resort: the Puppeteer target list, which was the original and weakest route.
      if (!usage && browser && typeof browser.targets === 'function') {
        const t = browser.targets().find((x) => /worker/i.test(x.type()) && x.url() === w.url);
        if (t) {
          let session = null;
          try {
            session = await t.createCDPSession();
            usage = await session.send('Runtime.getHeapUsage');
            row.via = 'puppeteer-target';
          } catch (err) { row.why = `${row.why || ''} target: ${String(err?.message || err).slice(0, 50)}`; }
          finally { if (session) await session.detach().catch(() => {}); }
        }
      }
      if (usage) {
        row.heapUsedMB = +(usage.usedSize / 1048576).toFixed(2);
        row.heapTotalMB = +(usage.totalSize / 1048576).toFixed(2);
        total += row.heapUsedMB;
        measured += 1;
      }
      if (row.via) routesTried.push(row.via);
      out.workerHeaps.push(row);
    }
    out.workerHeapTotalMB = measured > 0 ? +total.toFixed(2) : null;
    out.workerHeapsMeasured = measured;
    out.workerHeapRoutes = [...new Set(routesTried)];
    out.workerTargetsSeenByPuppeteer = (browser && typeof browser.targets === 'function')
      ? browser.targets().filter((t) => /worker/i.test(t.type())).length : null;
    if (out.workers > 0 && measured === 0) {
      out.workerHeapGap = `CDP reports ${out.workers} worker target(s) and NONE of the three read routes answered, so their heaps are unmeasured rather than zero`;
    } else if (out.workers > measured) {
      out.workerHeapGap = `${measured} of ${out.workers} worker heaps read; the remainder are unmeasured, not zero`;
    }
  } catch { /* leave nulls */ }

  if (page) {
    out.uaSpecificMemory = await page.evaluate(async () => {
      if (typeof performance.measureUserAgentSpecificMemory !== 'function') {
        return { available: false, reason: 'not a function on this surface', crossOriginIsolated: !!self.crossOriginIsolated };
      }
      try {
        const r = await performance.measureUserAgentSpecificMemory();
        const byScope = {};
        for (const b of r.breakdown || []) {
          for (const a of b.attribution || []) {
            const k = a.scope || 'unknown';
            byScope[k] = +(((byScope[k] || 0) + b.bytes) / 1048576).toFixed(2);
          }
          if (!(b.attribution || []).length && b.bytes) {
            byScope[(b.types || ['unattributed']).join('+')] = +(((byScope.unattributed || 0) + b.bytes) / 1048576).toFixed(2);
          }
        }
        return { available: true, totalMB: +(r.bytes / 1048576).toFixed(2), byScope, crossOriginIsolated: !!self.crossOriginIsolated };
      } catch (err) {
        return { available: false, reason: String(err?.message || err).slice(0, 120), crossOriginIsolated: !!self.crossOriginIsolated };
      }
    }).catch((err) => ({ available: false, reason: String(err).slice(0, 120) }));
  }
  return out;
}

/**
 * Canvas and GPU surface accounting. The GPU process footprint is an OS number that says nothing
 * about WHAT is in it; this counts the surfaces the page actually asks for and prices them at
 * 4 bytes per device pixel, which is the floor for an RGBA backing store. A canvas is also
 * double-buffered while compositing, so the true cost is at least this and possibly twice it —
 * stated as a floor, never as the total.
 */
const canvasCensusSource = () => {
  const dpr = window.devicePixelRatio || 1;
  const list = [...document.querySelectorAll('canvas')];
  let bytes = 0;
  let pixels = 0;
  const sizes = [];
  for (const c of list) {
    const w = c.width || 0;
    const h = c.height || 0;
    pixels += w * h;
    bytes += w * h * 4;
    if (sizes.length < 12) sizes.push(`${w}x${h}`);
  }
  // Deliberately NOT probing getContext(): on a canvas that has no context yet, asking for one
  // allocates a backing store, so the probe would inflate the very number being measured.
  return {
    canvases: list.length,
    devicePixelRatio: dpr,
    totalPixels: pixels,
    backingStoreFloorMB: +(bytes / 1048576).toFixed(2),
    largestSizes: sizes,
    zeroSizedCanvases: list.filter((c) => !c.width || !c.height).length,
  };
};

async function readCanvasCensus(page) {
  const perFrame = [];
  for (const [i, f] of page.frames().entries()) {
    try {
      const r = await f.evaluate(canvasCensusSource);
      if (r && r.canvases > 0) perFrame.push({ frameIndex: i, ...r });
    } catch { /* frame gone */ }
  }
  const total = perFrame.reduce((t, r) => t + r.backingStoreFloorMB, 0);
  return {
    frames: perFrame.length,
    canvasesTotal: perFrame.reduce((t, r) => t + r.canvases, 0),
    backingStoreFloorTotalMB: +total.toFixed(2),
    note: 'Floor only: 4 bytes per device pixel of declared canvas size. Excludes compositor double-buffering, layer tiles and decoded images, so the GPU process footprint should exceed it.',
    perFrame,
  };
}

async function cpuSample(browserCdp) {
  try {
    const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
    return { at: Date.now(), procs: (processInfo || []).map((p) => ({ id: p.id, type: p.type, cpuTime: p.cpuTime })) };
  } catch { return null; }
}

function cpuBetween(a, b) {
  if (!a || !b) return {};
  const wall = (b.at - a.at) / 1000;
  if (!(wall > 0)) return {};
  const byType = {};
  for (const pb of b.procs) {
    const pa = a.procs.find((x) => x.id === pb.id);
    if (!pa) continue;
    const key = /renderer/i.test(pb.type) ? 'renderer' : (/gpu/i.test(pb.type) ? 'gpu' : (/browser/i.test(pb.type) ? 'browser' : 'other'));
    byType[key] = (byType[key] || 0) + (pb.cpuTime - pa.cpuTime);
  }
  const out = {};
  for (const [k, v] of Object.entries(byType)) out[`${k}CpuPercent`] = +((v / wall) * 100).toFixed(1);
  return out;
}

/**
 * One full gauge reading. `cpuWindowMs` is the window over which CPU is differenced; the caller
 * usually already has a longer measurement window, so keep this short.
 */
export async function readSweepGauges(page, cdp, browserCdp, {
  cpuWindowMs = 6_000, forceGc = true, readOsFootprints = null,
} = {}) {
  const cpu0 = await cpuSample(browserCdp);
  const live = await readCounters(cdp);
  await sleep(cpuWindowMs);
  const cpu = cpuBetween(cpu0, await cpuSample(browserCdp));

  let collected = null;
  if (forceGc) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await sleep(400);
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await sleep(1_200);
    collected = await readCounters(cdp);
  }

  const realms = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length; i += 1) {
    try {
      const r = await frames[i].evaluate(realmGaugeSource);
      if (r && (r.residentBars != null || r.barSlots > 0)) {
        realms.push({ ...r, frameIndex: i, realmKey: `f${i}|${r.timeframe || '?'}` });
      }
    } catch { /* frame gone */ }
  }

  const workers = await readWorkers(browserCdp, page);
  const canvas = await readCanvasCensus(page);
  const storage = await readStorageAndNetwork(page);

  let footprint = {};
  if (typeof readOsFootprints === 'function') {
    try {
      const info = await browserCdp.send('SystemInfo.getProcessInfo');
      const fps = await readOsFootprints((info.processInfo || []).map((p) => p.id));
      let total = 0;
      let pageRenderer = 0;
      const byType = {};
      for (const p of info.processInfo || []) {
        const fp = fps[p.id];
        if (!fp) continue;
        total += fp.privateMB;
        const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
        byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
        if (/renderer/i.test(p.type) && fp.privateMB > pageRenderer) pageRenderer = fp.privateMB;
      }
      footprint = {
        totalPrivateMB: +total.toFixed(1),
        pageRendererPrivateMB: +pageRenderer.toFixed(1),
        gpuProcessPrivateMB: byType.gpu ?? null,
        byType,
      };
    } catch { /* keep empty */ }
  }

  const sum = (k) => realms.reduce((t, r) => t + (r[k] || 0), 0);
  const residentSum = sum('residentBars');
  return {
    atIso: new Date().toISOString(),
    cpu,
    counters: { live, collected },
    workers,
    canvas,
    storage,
    footprint,
    realms,
    summed: {
      realms: realms.length,
      residentBars: residentSum,
      barSlots: sum('barSlots'),
      distinctBarObjects: sum('distinctBarObjects'),
      copiesPerResidentBar: residentSum > 0 ? +(sum('barSlots') / residentSum).toFixed(2) : null,
      elements: sum('elements'),
      heapMB: +sum('heapMB').toFixed(1),
      indicatorsActive: sum('indicatorsActive'),
      paints: sum('paints'),
      longTaskMs: sum('longTaskMs'),
      modes: realms.map((r) => r.mode),
      loopKinds: realms.map((r) => r.loopKind),
    },
  };
}

export const SWEEP_GAUGE_SCOPE_NOTE = 'Collected: OS private memory by process type, GPU process private memory, worker realm heaps read per-isolate over CDP (Runtime.getHeapUsage against each attached worker target, which needs no cross-origin isolation) with measureUserAgentSpecificMemory attempted and its availability recorded, canvas backing-store floor at 4 bytes per device pixel per frame, JS heap live and post-GC, elements/nodes/listeners/documents/frames/workers, copies-per-bar, CPU-ms per bar, bars/sec, paints/sec and paints/bar, recalc cadence and cost where installed, localStorage and StorageManager estimate and SW cache count, network count and bytes, renderer and GPU CPU percent. NOT collected: true main-thread share by category (needs a trace; renderer CPU percent is reported instead and is a different number) and renders-per-React-commit (paints/sec and paints/bar are the proxies).';
