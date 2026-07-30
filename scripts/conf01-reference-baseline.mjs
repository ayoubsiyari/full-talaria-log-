/**
 * CONF01-REFERENCE-BASELINE-V1 — the only baseline that counts (C1), carrying the
 * renderer/GPU/browser CPU split (C4).
 *
 * Every gauge, one run, in the configuration the PO named: four panels, four
 * symbols, four timeframes, indicators loaded, orders open. Measured IDLE and
 * PLAYING, because the defect the 14:30 ruling names is the idle-to-playing heap
 * delta (TradeZella 133 -> 104 MB, falls; Talaria 247 -> 586 MB, +339).
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - CPU per Chrome process from cpuTime deltas (category-independent), split by
 *     thread role inside the renderer and GPU processes
 *   - JS heap after forced collection, and live alongside it
 *   - tab footprint as OS private bytes per process (Task Manager's column)
 *   - nodes, documents, frames, listeners, attached elements across frames
 *   - renderer allocator composition
 *   - and a CONF-01 compliance verdict, without which no number here is an
 *     acceptance
 * WHAT IT CANNOT SEE:
 *   - worker isolate heaps; GPU internals beyond its OS footprint and thread CPU
 *   - the PO's machine: his core count differs, so CPU shares travel and absolute
 *     percentages are indicative
 */
import fs from 'node:fs';

import {
  bootConf01Session, keepConf01Playing, probePanelAdvanceRates, readConf01State,
} from './lib/conf01-session.mjs';
import { summarizeTraceThreadCpu } from './lib/cpu-thread-census.mjs';
import { diffProcessCpu, summariseCpuByRole } from './cpu-process-census.mjs';
import { collectMemoryDump, readOsFootprints } from './process-memory-census.mjs';
import { pickPageRenderer } from './session-reload-census.mjs';

const MB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACE_CATEGORIES = ['toplevel', 'cc', 'gpu', 'viz', 'blink', 'devtools.timeline'];

async function processCpuSample(browserCdp) {
  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const map = new Map();
  for (const p of info.processInfo || []) map.set(p.id, { type: p.type, cpuTime: Number(p.cpuTime) });
  return map;
}

async function measureCpu(browserCdp, windowMs) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  const before = await processCpuSample(browserCdp);
  const started = Date.now();
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: TRACE_CATEGORIES },
  });
  await sleep(windowMs);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - started;
  const after = await processCpuSample(browserCdp);
  const processCpu = diffProcessCpu(before, after, wallMs);
  const census = summarizeTraceThreadCpu(events, { wallMs, topEventsPerThread: 8 });
  const byRole = summariseCpuByRole(census.threads, wallMs);
  // The three rows the PO reads, named separately as C4 requires.
  const sumType = (re) => processCpu.perProcess
    .filter((p) => re.test(p.type)).reduce((s, p) => s + (p.cpuPercentOfCore || 0), 0);
  return {
    wallMs,
    rendererCpuPercent: +sumType(/renderer/i).toFixed(1),
    gpuProcessCpuPercent: +sumType(/gpu/i).toFixed(1),
    browserCpuPercent: +sumType(/browser/i).toFixed(1),
    tracingServiceOwnCostPercent: +sumType(/tracing/i).toFixed(1),
    totalCpuPercent: processCpu.totalPercentOfCore,
    perProcess: processCpu.perProcess.filter((p) => (p.cpuPercentOfCore || 0) > 0.5),
    threadRoles: byRole.roles,
    tracedTotalPercent: byRole.totalPercentOfCore,
    traceCoverageNote: 'trace categories do not cover all renderer work; process-level figures above are the ground truth',
  };
}

async function measureMemory(page, cdp, browserCdp) {
  const read = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
    return {
      jsHeapMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null,
      nodes: g('Nodes'),
      documents: g('Documents'),
      frames: g('Frames'),
      listeners: g('JSEventListeners'),
    };
  };
  const live = await read();
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(500);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(1500);
  const collected = await read();

  let elements = 0;
  for (const f of page.frames()) {
    const got = await f.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
    elements += got || 0;
  }

  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const footprints = await readOsFootprints((info.processInfo || []).map((p) => p.id)).catch(() => ({}));
  const byType = {};
  let totalPrivateMB = 0;
  let pageRendererPrivateMB = 0;
  for (const p of info.processInfo || []) {
    const fp = footprints[p.id];
    if (!fp) continue;
    totalPrivateMB += fp.privateMB;
    const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
    byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(2);
    if (/renderer/i.test(p.type) && fp.privateMB > pageRendererPrivateMB) pageRendererPrivateMB = fp.privateMB;
  }
  const allocators = pickPageRenderer(await collectMemoryDump(browserCdp).catch(() => new Map()));

  return {
    liveJsHeapMB: live.jsHeapMB,
    jsHeapAfterCollectionMB: collected.jsHeapMB,
    uncollectedAtReadMB: live.jsHeapMB != null && collected.jsHeapMB != null
      ? +(live.jsHeapMB - collected.jsHeapMB).toFixed(2) : null,
    nodes: collected.nodes,
    nodesLive: live.nodes,
    documents: collected.documents,
    frames: collected.frames,
    listeners: collected.listeners,
    elementsAllFrames: elements,
    tabFootprint: { totalChromePrivateMB: +totalPrivateMB.toFixed(2), pageRendererPrivateMB, byType },
    rendererAllocators: allocators,
  };
}

async function setPlayback(page, playing, replaySpeed) {
  if (playing) return { playingPanels: await keepConf01Playing(page, replaySpeed) };
  let paused = 0;
  for (const f of page.frames()) {
    const got = await f.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs || !rs.isActive) return null;
      try {
        if (rs.isPlaying) {
          if (typeof rs.pause === 'function') rs.pause();
          else if (typeof rs.togglePlay === 'function') rs.togglePlay();
        }
        return { playing: !!rs.isPlaying };
      } catch (_) { return null; }
    }).catch(() => null);
    if (got && !got.playing) paused += 1;
  }
  return { pausedPanels: paused };
}

function parseArgs(argv) {
  const o = { out: null, cpuWindowMs: 12_000, speed: 60 };
  for (const a of argv) {
    if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--cpu-window-ms=')) o.cpuWindowMs = Number(a.split('=')[1]) || 12_000;
    else if (a.startsWith('--speed=')) o.speed = Number(a.split('=')[1]) || 60;
  }
  return o;
}

export async function runConf01ReferenceBaseline({ cpuWindowMs = 12_000, speed = 60, outPath = null } = {}) {
  const session = await bootConf01Session({ replaySpeed: speed });
  const {
    browser, page, cdp, browserCdp, conf01,
  } = session;
  const arms = {};
  const save = (extra = {}) => {
    if (outPath) {
      fs.writeFileSync(outPath, JSON.stringify({
        signature: 'CONF01-REFERENCE-BASELINE-V1', conf01, arms, ...extra,
      }, null, 1));
    }
  };
  console.error(`[conf01] compliance=${conf01.compliant} failed=[${conf01.failed.join(',')}] symbols=${conf01.symbols.join(',')} datasets=${JSON.stringify(conf01.observedDatasets)}`);
  save();
  try {
    // IDLE first: pausing after playing leaves allocations the collector has seen,
    // which is the honest idle for a session that has been played.
    await setPlayback(page, false, speed);
    await sleep(15_000);
    arms.idle = {
      playback: 'paused',
      session: await readConf01State(page),
      memory: await measureMemory(page, cdp, browserCdp),
      cpu: await measureCpu(browserCdp, cpuWindowMs),
    };
    console.error(`[conf01] idle: liveJS=${arms.idle.memory.liveJsHeapMB} afterGc=${arms.idle.memory.jsHeapAfterCollectionMB} renderer=${arms.idle.cpu.rendererCpuPercent}% gpu=${arms.idle.cpu.gpuProcessCpuPercent}% tab=${arms.idle.memory.tabFootprint.totalChromePrivateMB}MB`);
    save();

    const resumed = await setPlayback(page, true, speed);
    await sleep(20_000);
    const advanceRates = await probePanelAdvanceRates(page, { replaySpeed: speed });
    console.error(`[conf01] advance rates: ${advanceRates.map((r) => `${r.timeframe}:${r.barsPerSec}/s vs ${r.expectedBarsPerSec}/s x${r.rateRatio} atEnd=${r.atEnd}`).join(' | ')}`);
    arms.playing = {
      playback: `playing at ${speed}x`,
      resumed,
      advanceRates,
      session: await readConf01State(page),
      memory: await measureMemory(page, cdp, browserCdp),
      cpu: await measureCpu(browserCdp, cpuWindowMs),
    };
    console.error(`[conf01] playing: liveJS=${arms.playing.memory.liveJsHeapMB} afterGc=${arms.playing.memory.jsHeapAfterCollectionMB} renderer=${arms.playing.cpu.rendererCpuPercent}% gpu=${arms.playing.cpu.gpuProcessCpuPercent}% tab=${arms.playing.memory.tabFootprint.totalChromePrivateMB}MB`);
    save();

    const idleToPlaying = {
      liveJsHeapMB: +((arms.playing.memory.liveJsHeapMB || 0) - (arms.idle.memory.liveJsHeapMB || 0)).toFixed(2),
      jsHeapAfterCollectionMB: +((arms.playing.memory.jsHeapAfterCollectionMB || 0) - (arms.idle.memory.jsHeapAfterCollectionMB || 0)).toFixed(2),
      tabFootprintMB: +((arms.playing.memory.tabFootprint.totalChromePrivateMB || 0) - (arms.idle.memory.tabFootprint.totalChromePrivateMB || 0)).toFixed(2),
      rendererCpuPercent: +((arms.playing.cpu.rendererCpuPercent || 0) - (arms.idle.cpu.rendererCpuPercent || 0)).toFixed(1),
      note: 'the 14:30 ruling names this delta as the defect: TradeZella falls when it plays, we climb',
    };
    const report = {
      signature: 'CONF01-REFERENCE-BASELINE-V1',
      takenAt: new Date().toISOString(),
      conf01,
      arms,
      idleToPlaying,
    };
    if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
    return report;
  } finally {
    await browser.close().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && /conf01-reference-baseline\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runConf01ReferenceBaseline({ ...opts, outPath: opts.out });
  if (!opts.out) console.log(JSON.stringify(report, null, 1));
  console.error(`[conf01] idle->playing ${JSON.stringify(report.idleToPlaying)}`);
}
