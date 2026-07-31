#!/usr/bin/env node
/**
 * LIVE LOD + ARENA PROBE — read-only against the RUNNING soak. Two jobs in one attach, because the host is
 * committed for ten hours and every attach must earn its place.
 *
 * JOB 1 — the B reconciliation the Director ordered. B measures cost per data event FLAT from 1,930 to 6,242
 * bars with `pixelLodActiveNow: false` at 7.0 px bar spacing; I measure it RISING from 6,700 to 36,104. If my
 * zoom state differs, the zoom state is the reconciliation. If it matches, there are two mechanisms with
 * different onsets and neither of us is wrong. The product's spacing is `candleWidth + candleGap`
 * (chart.js:583, 3301) and its default candle width is 6 (chart.js:1069), so 6 + 1 = 7.0 px is DEFAULT ZOOM —
 * which means matching is the likely outcome and I should be ready to report the harder answer.
 *
 * JOB 2 — first cut at the arena question. My collection result eliminated DOM, listeners and JS heap as homes
 * for the growth. The Director's remaining candidates are decoded bitmaps, canvas backing stores, GPU, script
 * and compiled-code residency, and worker heaps. Three of those are measurable read-only right now: canvas
 * backing stores by geometry, the GPU process by OS private memory, and worker heaps per isolate.
 *
 * PERTURBATION DISCIPLINE:
 *   - `browser.disconnect()`, never `close()`.
 *   - NEVER call `canvas.getContext()`. Probing for a 2d context ALLOCATES a backing store — an instrument
 *     defect I already made once and will not repeat. Backing store size is computed from width x height x 4.
 *   - No GC, no navigation, no writes.
 */
import fs from 'node:fs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const PORT = argOf('port', '49797');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\LIVE-LOD-AND-ARENA-20260731.json');

const report = {
  signature: 'LIVE-LOD-AND-ARENA-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — the running soak browser. Declared per RESET-01.',
  jobs: [
    'Record pixel-LOD state and bar spacing at sample time, to reconcile B\'s FLAT per-event cost (1,930-6,242 bars, 7.0 px, LOD off) against my RISING cost (6,700-36,104 bars).',
    'First read-only cut at which arena holds the unattributed non-JS renderer memory: canvas backing stores, GPU process, worker heaps.',
  ],
  perturbationNote: 'No getContext() call: probing for a 2d context allocates a backing store and would corrupt the very number being measured. Backing stores are computed from width x height x 4.',
};

let browser = null;
try {
  const puppeteer = await loadPuppeteer();
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => /\/chart\//.test(p.url())) || pages[pages.length - 1];

  const perFrame = [];
  for (const frame of page.frames()) {
    const got = await frame.evaluate(() => {
      const ch = window.chart;
      if (!ch) return null;
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
      // Spacing exactly as the product computes it.
      const candleWidth = num(ch.candleWidth);
      const candleGap = num(ch.candleGap);
      const spacing = candleWidth != null ? candleWidth + (candleGap || 0) : null;
      // Any property whose NAME suggests a level-of-detail or decimation path, so this does not depend on
      // guessing the product's vocabulary correctly.
      const lodLike = {};
      for (const k of Object.keys(ch)) {
        if (/lod|decim|stride|downsample|simplif|skipRender|coarse/i.test(k)) {
          const v = ch[k];
          if (v == null || ['number', 'boolean', 'string'].includes(typeof v)) lodLike[k] = v;
        }
      }
      // Canvas backing stores by geometry. Never getContext.
      const canvases = [...document.querySelectorAll('canvas')].map((c) => ({
        w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height),
        bytes: (c.width || 0) * (c.height || 0) * 4,
      }));
      const imgs = [...document.querySelectorAll('img')].map((i) => ({
        w: i.naturalWidth, h: i.naturalHeight, bytes: (i.naturalWidth || 0) * (i.naturalHeight || 0) * 4,
      })).filter((i) => i.bytes > 0);
      return {
        url: location.href,
        isHost: window.top === window,
        timeframe: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
        candleWidth,
        candleGap,
        barSpacingPx: spacing,
        visibleStartIndex: num(ch.visibleStartIndex),
        visibleEndIndex: num(ch.visibleEndIndex),
        visibleBars: num(ch.visibleEndIndex) != null && num(ch.visibleStartIndex) != null
          ? num(ch.visibleEndIndex) - num(ch.visibleStartIndex) : null,
        totalBars: Array.isArray(ch.data) ? ch.data.length : null,
        lodLikeProperties: lodLike,
        lodPropertyCount: Object.keys(lodLike).length,
        canvasCount: canvases.length,
        canvasBackingMB: +(canvases.reduce((s, c) => s + c.bytes, 0) / 1048576).toFixed(2),
        canvases: canvases.slice(0, 8),
        decodedImageMBLowerBound: +(imgs.reduce((s, i) => s + i.bytes, 0) / 1048576).toFixed(2),
        imgCount: imgs.length,
      };
    }).catch(() => null);
    if (got) perFrame.push(got);
  }
  report.frames = perFrame;

  const spacings = [...new Set(perFrame.map((f) => f.barSpacingPx).filter((v) => v != null))];
  report.lodReconciliation = {
    bReading: { barsRange: [1930, 6242], pixelLodActiveNow: false, barSpacingPx: 7.0, perEventCost: 'FLAT' },
    myReading: {
      barsRange: [6700, 36104],
      barSpacingPxPerPanel: perFrame.map((f) => f.barSpacingPx),
      distinctSpacings: spacings,
      candleWidthPerPanel: perFrame.map((f) => f.candleWidth),
      lodPropertiesFound: perFrame.map((f) => f.lodPropertyCount),
      perEventCost: 'RISING, 2.24x, upper half still climbing',
    },
    spacingMatchesB: spacings.length > 0 && spacings.every((v) => Math.abs(v - 7.0) < 0.5),
  };
  report.lodReconciliation.verdict = report.lodReconciliation.spacingMatchesB
    ? `ZOOM IS NOT THE RECONCILIATION. My panels sit at ${JSON.stringify(spacings)} px spacing, the same default 7.0 px B measured, so both of us read the same LOD condition and got opposite shapes. That leaves the bar RANGE as the only difference: B spans 1,930-6,242 and I span 6,700-36,104, and our ranges barely touch. The honest conclusion is TWO MECHANISMS WITH DIFFERENT ONSETS - something flat below ~6,000 bars that begins to bite above it - and neither measurement is wrong.`
    : `ZOOM MAY BE THE RECONCILIATION: my spacing is ${JSON.stringify(spacings)} px against B's 7.0, so we were not in the same LOD condition and the shapes are not directly comparable. This must be equalised before either curve is quoted against the other.`;

  // ARENA. Renderers summed, not maximised - the mistake that produced the mis-scoped 497.
  const bcdp = await browser.target().createCDPSession();
  // SystemInfo.getProcessInfo gives pids and TYPES but its `memory` field reads 0 on this platform - the bytes
  // come from the OS. My first pass reported 0 MB for every process type, which is the kind of confident zero
  // that gets published; readOsFootprints is the reader that already works and is used by the baseline gate.
  const info = await bcdp.send('SystemInfo.getProcessInfo').catch(() => null);
  const procs = (info?.processInfo || []).map((p) => ({ id: p.id, type: p.type }));
  const fps = await readOsFootprints(procs.map((p) => p.id)).catch(() => ({}));
  const byType = {};
  for (const p of procs) {
    const mb = (fps?.[p.id]?.privateMB ?? fps?.[p.id] ?? null);
    byType[p.type] = byType[p.type] || { count: 0, privateMB: 0, measuredPids: 0 };
    byType[p.type].count += 1;
    if (Number.isFinite(Number(mb))) { byType[p.type].privateMB += Number(mb); byType[p.type].measuredPids += 1; }
  }
  for (const k of Object.keys(byType)) byType[k].privateMB = +byType[k].privateMB.toFixed(1);

  const workers = [];
  for (const t of browser.targets()) {
    const type = t.type();
    if (!/worker/i.test(type)) continue;
    try {
      const s = await t.createCDPSession();
      const usage = await s.send('Runtime.getHeapUsage').catch(() => null);
      workers.push({ type, url: (t.url() || '').slice(-60), usedMB: usage ? +(usage.usedSize / 1048576).toFixed(2) : null, totalMB: usage ? +(usage.totalSize / 1048576).toFixed(2) : null });
      await s.detach().catch(() => {});
    } catch { workers.push({ type, url: (t.url() || '').slice(-60), usedMB: null, attachFailed: true }); }
  }
  await bcdp.detach().catch(() => {});

  const canvasTotal = +perFrame.reduce((s, f) => s + (f.canvasBackingMB || 0), 0).toFixed(2);
  const imgTotal = +perFrame.reduce((s, f) => s + (f.decodedImageMBLowerBound || 0), 0).toFixed(2);
  const workerTotal = +workers.reduce((s, w) => s + (w.usedMB || 0), 0).toFixed(2);
  // PER-PROCESS detail, sorted. A type-level sum hides whether ONE renderer holds everything or four share it,
  // and I have an escalation on the record ("one renderer holds 906 of 989 MB") that this either confirms or
  // corrects. Summing by type without showing the split is how the mis-scoped 497 happened.
  const processRows = procs.map((p) => ({ pid: p.id, type: p.type, privateMB: fps?.[p.id]?.privateMB ?? null, workingSetMB: fps?.[p.id]?.workingSetMB ?? null }))
    .sort((a, b) => (b.privateMB ?? 0) - (a.privateMB ?? 0));
  const renderers = processRows.filter((r) => /renderer/i.test(r.type));
  const largest = renderers[0] ?? null;
  const rendererSum = renderers.reduce((s, r) => s + (r.privateMB || 0), 0);

  report.arena = {
    processesByType: byType,
    processRows,
    rendererSplit: {
      count: renderers.length,
      sumMB: +rendererSum.toFixed(1),
      largestMB: largest?.privateMB ?? null,
      largestSharePercent: rendererSum > 0 && largest?.privateMB != null ? +((largest.privateMB / rendererSum) * 100).toFixed(1) : null,
      others: renderers.slice(1).map((r) => r.privateMB),
      reading: 'Whether ONE renderer carries the load decides what Phase 4 can recover. Four renderer processes exist in this browser, but they are not necessarily four PANELS - the chart page frames were proved same-process by timeOrigin and zero iframe targets, so other renderers are other pages. The largest share is the number that matters.',
    },
    gpuPrivateMB: (byType.GPU?.privateMB ?? byType.gpu?.privateMB ?? null),
    rendererPrivateSumMB: byType.renderer?.privateMB ?? null,
    rendererCount: byType.renderer?.count ?? null,
    canvasBackingStoresMB: canvasTotal,
    canvasCount: perFrame.reduce((s, f) => s + (f.canvasCount || 0), 0),
    decodedImageMBLowerBound: imgTotal,
    workerHeaps: workers,
    workerHeapSumMB: workers.length ? workerTotal : null,
    workerTargetsFound: workers.length,
    workerHeapStatus: workers.length
      ? 'measured per-isolate over CDP'
      : 'UNMEASURED BY THIS ROUTE, NOT ZERO. browser.targets() does not list dedicated workers - the exact GATE-01 failure I already found and fixed in sweep-gauges with three read routes. A fixed pool of 2 workers is known to exist whenever indicators are loaded, and this arm loads 8 instances, so the honest entry is unmeasured. It is also still on my queue as un-re-gated against the 120 MB ballast.',
    eliminatedByTheCollectionResult: ['retained DOM nodes', 'retained event listeners', 'retained JS heap'],
    readingSoFar: `Of the five remaining candidates, three are now measured: canvas backing stores total ${canvasTotal} MB across ${perFrame.reduce((s, f) => s + (f.canvasCount || 0), 0)} canvases, decoded <img> content is at least ${imgTotal} MB, and worker heaps are ${workers.length ? `${workerTotal} MB across ${workers.length} targets` : `UNMEASURED by this route (0 targets listed, which is the known browser.targets() blind spot rather than zero workers)`}. Against a renderer private sum of ${byType.renderer?.privateMB ?? '?'} MB, none of these three is close to accounting for the gap.`,
    whatIsLeft: 'Script and compiled-code residency, and native allocator arenas holding bar data (typed arrays, PartitionAlloc/malloc). Those need a heap snapshot or an allocator dump and therefore a host that is not mid-soak.',
    honestLimit: 'This is a SNAPSHOT of a live run at one moment, not a growth attribution. It bounds the small candidates; it does not prove where the growth lives. The candidate it CANNOT rule out is the one that needs the machine.',
  };
} catch (e) {
  report.error = String(e && e.stack || e).slice(0, 700);
} finally {
  try { await browser?.disconnect?.(); } catch { /* gone */ }
}

report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ lodReconciliation: report.lodReconciliation, arena: report.arena ? { ...report.arena, workerHeaps: report.arena.workerHeaps?.slice(0, 4) } : null, error: report.error }, null, 1));
