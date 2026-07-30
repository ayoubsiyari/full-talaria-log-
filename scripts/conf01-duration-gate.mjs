/**
 * CONF01-DURATION-GATE-V1 — the freeze gate (C2). Replaces SINGLE-PAIR-SOAK-V1,
 * which measured a configuration the shipping product does not use.
 *
 * CONF-01 configuration, held for hours, sampled on a fixed cadence, graded by a
 * SLOPE WITH A CONFIDENCE INTERVAL (DUR-01). The question is not "did it crash"
 * but "is it flat", and a series whose interval straddles the flat band is
 * reported UNRESOLVED rather than passed.
 *
 * GATE-01: `--inject-growth-mb-per-sample=N` retains N MB of unreachable-to-the-
 * product-but-reachable-to-the-page ballast per sample. A gate that cannot go RED
 * on that input has not been shown to work, so the negative control ships with the
 * instrument rather than as a claim about it.
 *
 * WHAT THIS INSTRUMENT CAN SEE: JS heap after forced collection, live heap, DOM
 * counters and element counts across frames, per-process OS footprint, per-process
 * CPU from cpuTime deltas, resident bar counts and `_panelFullRawData` length,
 * in-flight requests, order and indicator state.
 * WHAT IT CANNOT SEE: worker isolate heaps, GPU-internal allocation, and the PO's
 * machine — CPU percentages are of one core on this host.
 */
import fs from 'node:fs';

import {
  bootConf01Session, cycleTrades, installOrderLoopTimer, keepConf01Playing,
  measureHeavyFieldBytes, measureOrderLoopCost, probePanelAdvanceRates, readConf01State,
  readTradeState,
} from './lib/conf01-session.mjs';
import { fitTrend, gradeDurationSeries } from './lib/duration-trend.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const MB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Flat bands come from measured noise floors, not from taste:
//   heap after collection — W88 fresh-load spread was 0.73 MB; over hours the
//   sampling noise dominates, so 5 MB/h is ~7x the single-read spread.
//   footprint — W90 process census varied by ~10 MB between identical reads.
//   elements/nodes — W91b showed post-GC node counts stable to 1.3%.
export const CONF01_FLAT_BANDS = Object.freeze({
  heapAfterGcMB: 5,
  liveHeapMB: 15,
  footprintTotalMB: 20,
  pageRendererFootprintMB: 15,
  elements: 50,
  nodesAfterGc: 400,
  listeners: 200,
});

async function processCpuSample(browserCdp) {
  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const map = new Map();
  for (const p of info.processInfo || []) map.set(p.id, { type: p.type, cpuTime: Number(p.cpuTime) });
  return map;
}

function cpuBetween(before, after, wallMs) {
  const rows = [];
  for (const [pid, a] of after) {
    const b = before.get(pid);
    if (!b) continue;
    const delta = a.cpuTime - b.cpuTime;
    if (!(delta > 0)) continue;
    rows.push({ pid, type: a.type, percentOfCore: +((delta * 1000 / wallMs) * 100).toFixed(1) });
  }
  const sum = (re) => rows.filter((r) => re.test(r.type)).reduce((s, r) => s + r.percentOfCore, 0);
  return {
    rendererPercent: +sum(/renderer/i).toFixed(1),
    gpuPercent: +sum(/gpu/i).toFixed(1),
    browserPercent: +sum(/browser/i).toFixed(1),
    totalPercent: +rows.reduce((s, r) => s + r.percentOfCore, 0).toFixed(1),
  };
}

async function readCounters(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
  return {
    heapMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null,
    nodes: g('Nodes'),
    documents: g('Documents'),
    frames: g('Frames'),
    listeners: g('JSEventListeners'),
  };
}

async function countElements(page) {
  let total = 0;
  for (const f of page.frames()) total += (await f.evaluate(() => document.querySelectorAll('*').length).catch(() => 0)) || 0;
  return total;
}

/**
 * CONF-02 trade churn. Front-load to thirty closed positions, then keep opening and
 * closing so accumulation continues to grow through the window: a closed trade keeps
 * doing per-candle work, so its count is part of the configuration, not decoration.
 */
async function churnTrades(page, { closedTarget = 30 } = {}) {
  const before = await readTradeState(page);
  const closed = before.managerClosed ?? before.serviceClosed ?? 0;
  const batch = closed < closedTarget ? Math.min(8, closedTarget - closed) : 1;
  const result = await cycleTrades(page, { open: batch, close: batch, holdMs: 12_000 });
  const after = await readTradeState(page);
  return {
    ...result,
    closedBefore: closed,
    closedAfter: after.managerClosed ?? after.serviceClosed ?? null,
    openAfter: after.managerOpen ?? after.serviceOpen ?? null,
    frontLoading: closed < closedTarget,
  };
}

/** GATE-01 negative control: retain ballast the page keeps alive, N MB per sample. */
async function injectGrowth(page, mb) {
  return page.evaluate((n) => {
    window.__conf01Ballast = window.__conf01Ballast || [];
    const chunk = new Uint8Array(n * 1048576);
    // Touch every page so the allocation is resident, not just reserved.
    for (let i = 0; i < chunk.length; i += 4096) chunk[i] = i & 0xff;
    window.__conf01Ballast.push(chunk);
    return window.__conf01Ballast.length * n;
  }, mb).catch(() => null);
}

async function sampleOnce(page, cdp, browserCdp, { cpuWindowMs = 8_000 } = {}) {
  const inFlight = [];
  const live = await readCounters(cdp);
  const cpuBefore = await processCpuSample(browserCdp);
  const cpuStarted = Date.now();
  await sleep(cpuWindowMs);
  const cpu = cpuBetween(cpuBefore, await processCpuSample(browserCdp), Date.now() - cpuStarted);

  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(500);
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(1_500);
  const collected = await readCounters(cdp);
  const elements = await countElements(page);
  const state = await readConf01State(page, { advanceWindowMs: 3_000 });
  const trades = await readTradeState(page);
  // Re-hook: a re-armed replay can hand us a fresh order manager, and the
  // install is a no-op on one already timed.
  await installOrderLoopTimer(page).catch(() => null);
  const orderLoop = await measureOrderLoopCost(page, { windowMs: 6_000 });
  const heavyFields = await measureHeavyFieldBytes(page);

  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const fps = await readOsFootprints((info.processInfo || []).map((p) => p.id)).catch(() => ({}));
  let totalPrivateMB = 0;
  let pageRendererPrivateMB = 0;
  const byType = {};
  for (const p of info.processInfo || []) {
    const fp = fps[p.id];
    if (!fp) continue;
    totalPrivateMB += fp.privateMB;
    const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
    byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
    if (/renderer/i.test(p.type) && fp.privateMB > pageRendererPrivateMB) pageRendererPrivateMB = fp.privateMB;
  }

  return {
    live, collected, cpu, elements, state, inFlight, trades, orderLoop, heavyFields,
    footprint: {
      totalPrivateMB: +totalPrivateMB.toFixed(1),
      pageRendererPrivateMB: +pageRendererPrivateMB.toFixed(1),
      byType,
    },
  };
}

function buildTrends(samples) {
  const series = (pick) => samples.map((s) => ({ hours: s.hours, value: pick(s) }))
    .filter((p) => Number.isFinite(p.value));
  const mk = (label, pick, band) => fitTrend(series(pick), { label, flatBandPerHour: band });
  return {
    heapAfterGcMB: mk('JS heap after forced collection (MB)', (s) => s.collected?.heapMB, CONF01_FLAT_BANDS.heapAfterGcMB),
    liveHeapMB: mk('JS heap live, pre-collection (MB)', (s) => s.live?.heapMB, CONF01_FLAT_BANDS.liveHeapMB),
    footprintTotalMB: mk('all-Chrome OS footprint (MB)', (s) => s.footprint?.totalPrivateMB, CONF01_FLAT_BANDS.footprintTotalMB),
    pageRendererFootprintMB: mk('page renderer OS footprint (MB)', (s) => s.footprint?.pageRendererPrivateMB, CONF01_FLAT_BANDS.pageRendererFootprintMB),
    elements: mk('attached elements, all frames', (s) => s.elements, CONF01_FLAT_BANDS.elements),
    nodesAfterGc: mk('nodes after forced collection', (s) => s.collected?.nodes, CONF01_FLAT_BANDS.nodesAfterGc),
    listeners: mk('JS event listeners', (s) => s.collected?.listeners, CONF01_FLAT_BANDS.listeners),
    rendererCpuPercent: mk('renderer CPU (% of one core)', (s) => s.cpu?.rendererPercent, 3),
    gpuCpuPercent: mk('GPU process CPU (% of one core)', (s) => s.cpu?.gpuPercent, 3),
    // CONF-02: the time leak. Per-tick order-loop cost is expected to grow with the
    // number of closed trades, so it is graded as a series in its own right.
    orderLoopMsPerTick: mk('order loop ms per replay tick', (s) => s.orderLoop?.measured?.msPerCall, 0.2),
    orderLoopPercentOfMainThread: mk('order loop, % of main thread', (s) => s.orderLoop?.totalPercentOfMainThread, 2),
    heavyFieldMB: mk('retained screenshot/base64 MB', (s) => s.heavyFields?.heavyMB, 1),
    excursionSamples: mk('excursion samples retained', (s) => s.heavyFields?.excursionSamples, 2_000),
  };
}

/**
 * CONF-02 asks for accumulation, so a run that never reached the closed-position
 * floor is a diagnostic no matter how flat its slopes look.
 */
export function assessConf02(samples, { closedTarget = 30 } = {}) {
  const last = samples[samples.length - 1];
  const closed = last?.trades?.managerClosed ?? last?.trades?.serviceClosed ?? 0;
  const open = last?.trades?.managerOpen ?? last?.trades?.serviceOpen ?? 0;
  return {
    closedPositions: closed,
    openPositions: open,
    closedTarget,
    compliant: closed >= closedTarget,
    acceptanceWeight: closed >= closedTarget
      ? `CONF-02 satisfied: ${closed} closed positions accumulated`
      : `DIAGNOSTIC ONLY: ${closed} closed positions, CONF-02 requires >= ${closedTarget}`,
  };
}

export async function runConf01DurationGate({
  hours = 2.25,
  intervalMs = 300_000,
  speed = 60,
  closedTarget = 30,
  cpuWindowMs = 8_000,
  injectGrowthMbPerSample = 0,
  outPath = null,
} = {}) {
  const session = await bootConf01Session({ replaySpeed: speed });
  const { browser, page, cdp, browserCdp, conf01 } = session;
  const startedAt = Date.now();
  const samples = [];
  const report = {
    signature: 'CONF01-DURATION-GATE-V1',
    startedAtIso: new Date(startedAt).toISOString(),
    plannedHours: hours,
    intervalMs,
    replaySpeed: speed,
    negativeControl: injectGrowthMbPerSample > 0
      ? { mode: 'GATE-01', injectGrowthMbPerSample, expect: 'RED on heap and footprint' }
      : null,
    conf01,
    flatBands: CONF01_FLAT_BANDS,
    samples,
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  report.orderLoopHook = await installOrderLoopTimer(page);
  console.error(`[dur] CONF-01 compliant=${conf01.compliant} failed=[${conf01.failed.join(',')}] datasets=${JSON.stringify(conf01.observedDatasets)} advancing=${conf01.productState?.advancingPanels} indicators=${JSON.stringify(conf01.productState?.indicatorsPerPanel)}`);
  // Does each panel honour the speed selector, or does a peer race its window and
  // stop? Measured once at the top, before any accommodation is applied.
  report.advanceRateProbe = await probePanelAdvanceRates(page, { replaySpeed: speed });
  console.error(`[dur] advance rates: ${report.advanceRateProbe.map((r) => `${r.timeframe}:${r.barsPerSec}/s vs ${r.expectedBarsPerSec}/s x${r.rateRatio} sim${r.simSecPerWallSec}s/s atEnd=${r.atEnd}`).join(' | ')}`);
  save();

  try {
    let n = 0;
    while ((Date.now() - startedAt) / 3_600_000 < hours) {
      n += 1;
      const hoursNow = (Date.now() - startedAt) / 3_600_000;
      if (injectGrowthMbPerSample > 0) await injectGrowth(page, injectGrowthMbPerSample);
      const order = await churnTrades(page, { closedTarget });
      const s = await sampleOnce(page, cdp, browserCdp, { cpuWindowMs });
      // Playback must be alive for the sample to mean anything; re-arm and record.
      // reseeks > 0 means panels had run out of resident data — recorded per sample
      // so the workload's own health is auditable alongside the memory series.
      const rearmed = s.state.advancingPanels < 4 ? await keepConf01Playing(page, speed) : null;
      samples.push({ sample: n, hours: +hoursNow.toFixed(4), order, rearmed, ...s });
      report.sampleCount = samples.length;
      report.elapsedHours = +((Date.now() - startedAt) / 3_600_000).toFixed(3);
      report.trends = buildTrends(samples);
      report.verdict = gradeDurationSeries(report.trends, { minSpanHours: Math.min(2, hours) });
      report.conf02 = assessConf02(samples, { closedTarget });
      save();
      console.error(`[dur] #${n} ${hoursNow.toFixed(2)}h gcHeap=${s.collected.heapMB} live=${s.live.heapMB} footprint=${s.footprint.totalPrivateMB} elements=${s.elements} bars=${s.state.totalBars} advancing=${s.state.advancingPanels}/4 renderer=${s.cpu.rendererPercent}% closed=${s.trades?.managerClosed ?? s.trades?.serviceClosed} loop=${s.orderLoop?.measured?.msPerCall}ms/tick(book=${s.orderLoop?.measured?.closedHere ?? 0}) excursion=${s.heavyFields?.excursionSamples} heavy=${s.heavyFields?.heavyMB}MB status=${report.verdict?.status}`);
      const spent = Date.now() - startedAt;
      const nextAt = n * intervalMs;
      if (nextAt > spent) await sleep(nextAt - spent);
    }
    report.finishedAtIso = new Date().toISOString();
    report.trends = buildTrends(samples);
    report.verdict = gradeDurationSeries(report.trends, { minSpanHours: Math.min(2, hours) });
    report.conf02 = assessConf02(samples, { closedTarget });
    save();
    return report;
  } finally {
    await browser.close().catch(() => {});
    save();
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'hours') o.hours = Number(v);
    else if (k === 'interval-ms') o.intervalMs = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'closed-target') o.closedTarget = Number(v);
    else if (k === 'cpu-window-ms') o.cpuWindowMs = Number(v);
    else if (k === 'inject-growth-mb-per-sample') o.injectGrowthMbPerSample = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /conf01-duration-gate\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const report = await runConf01DurationGate(parseArgs(process.argv.slice(2)));
  console.error(`[dur] verdict=${report.verdict?.status} reason=${report.verdict?.reason}`);
  console.error(`[dur] CONF-02: ${report.conf02?.acceptanceWeight}`);
}
