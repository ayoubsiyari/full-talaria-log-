/**
 * BUFFER-PARTITION-DISCRIMINATOR-V1
 *
 * Three-arm settled allocator discriminator for partition_alloc/partitions/buffer:
 *  - fetch-only: product smart-window fetches with rendering suppressed
 *  - render-only: repeated chart renders with fetch disabled
 *  - indicator-only: repeated indicator recalculation with fetch and render suppressed
 *  - idle-control: no workload, used to estimate the shared boot/decommit floor
 */
import fs from 'node:fs';

import { startServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import { embedFrames, sleep } from '../chart v 1.4/chart/multichart-prod/harness/harness-lib.mjs';
import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';
import { summariseAllocatorDetail } from './lib/blink-allocator-detail.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=').slice(1).join('=')
  || '_evidence/manager-E/buffer-partition-discriminator-20260802.json';
const SETTLE_MS = Number(process.argv.find((a) => a.startsWith('--settle-ms='))?.split('=').pop() || 120000);
const ARM_ITERATIONS = Number(process.argv.find((a) => a.startsWith('--iterations='))?.split('=').pop() || 30);
const SELECTED_ARMS = (process.argv.find((a) => a.startsWith('--arms='))?.split('=').pop() || 'idle-control,fetch-only,render-only,indicator-only')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function log(...args) {
  console.error(`[buffer-discriminator ${new Date().toISOString()}]`, ...args);
}

async function forceCollect(page) {
  const cdp = await page.createCDPSession();
  try {
    await cdp.send('HeapProfiler.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    for (let i = 0; i < 3; i++) {
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      await cdp.send('Runtime.collectGarbage').catch(() => {});
      await page.evaluate(() => { try { if (typeof gc === 'function') gc(); } catch (_) {} }).catch(() => {});
      await sleep(400);
    }
    await sleep(1000);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function collectPageAllocator(browserCdp, page) {
  const marker = `talaria-buffer-discriminator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['disabled-by-default-memory-infra', 'blink.user_timing', 'devtools.timeline'],
      memoryDumpConfig: {},
    },
  });
  await page.evaluate((name) => {
    try { performance.mark(name); } catch (_) {}
    try { console.timeStamp(name); } catch (_) {}
  }, marker).catch(() => {});
  await sleep(400);
  await browserCdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
  await sleep(1500);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  let pagePid = null;
  const byPid = new Map();
  for (const e of events) {
    if (pagePid == null && JSON.stringify({ name: e.name, cat: e.cat, args: e.args }).includes(marker)) {
      pagePid = e.pid;
    }
    if (e.ph === 'v' && e.args?.dumps?.allocators) {
      byPid.set(e.pid, summariseAllocatorDetail(e.args.dumps.allocators, { maxChildren: 120 }));
    }
  }
  let detail = pagePid != null ? byPid.get(pagePid) : null;
  let pagePidFallback = false;
  if (!detail && byPid.size) {
    let best = null;
    for (const [pid, candidate] of byPid.entries()) {
      const mb = bufferMB(candidate) || 0;
      if (!best || mb > best.mb) best = { pid, mb, candidate };
    }
    if (best) {
      pagePid = best.pid;
      detail = best.candidate;
      pagePidFallback = true;
    }
  }
  return { marker, pagePid, pagePidFallback, detail };
}

async function processMemory(browser) {
  const cdp = await browser.target().createCDPSession();
  try {
    const info = await cdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
    const rows = info.processInfo || [];
    const fp = await readOsFootprints(rows.map((p) => p.id)).catch(() => ({}));
    const processes = rows.map((p) => ({ pid: p.id, type: p.type, privateMB: fp[p.id]?.privateMB ?? null }));
    return {
      totalPrivateMB: +processes.reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      rendererPrivateMB: +processes.filter((p) => /renderer/i.test(p.type)).reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      gpuPrivateMB: +processes.filter((p) => /gpu/i.test(p.type)).reduce((s, p) => s + (Number(p.privateMB) || 0), 0).toFixed(3),
      processes,
    };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

function bufferRows(detail) {
  return (detail?.childrenByRoot?.partition_alloc || [])
    .filter((r) => /partitions\/buffer/.test(r.name))
    .slice(0, 40);
}

function bufferMB(detail) {
  const root = bufferRows(detail).find((r) => r.name === 'partition_alloc/partitions/buffer');
  return root ? root.mb : null;
}

function diffRows(beforeRows, afterRows) {
  const b = new Map((beforeRows || []).map((r) => [r.name, r.mb]));
  const a = new Map((afterRows || []).map((r) => [r.name, r.mb]));
  return [...new Set([...b.keys(), ...a.keys()])]
    .map((name) => ({
      name,
      beforeMB: b.get(name) || 0,
      afterMB: a.get(name) || 0,
      deltaMB: +((a.get(name) || 0) - (b.get(name) || 0)).toFixed(3),
    }))
    .sort((x, y) => Math.abs(y.deltaMB) - Math.abs(x.deltaMB));
}

async function boot(page, url) {
  await page.goto(`${url}/harness/host.html?pair=same&panels=4&tf=1m&hostFile=25`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const deadline = Date.now() + 45000;
  let state = null;
  while (Date.now() < deadline) {
    state = {
      hostChart: await page.evaluate(() => !!window.chart).catch(() => false),
      iframeCharts: 0,
      iframeCount: embedFrames(page).length,
    };
    for (const f of embedFrames(page)) {
      if (await f.evaluate(() => !!window.chart).catch(() => false)) state.iframeCharts += 1;
    }
    if (state.hostChart && state.iframeCharts >= 3) return state;
    await sleep(250);
  }
  return state;
}

async function sample(label, { browser, browserCdp, page }) {
  await forceCollect(page);
  const [allocator, process] = await Promise.all([
    collectPageAllocator(browserCdp, page),
    processMemory(browser),
  ]);
  return {
    label,
    at: new Date().toISOString(),
    process,
    allocatorCoverage: {
      pagePid: allocator.pagePid,
      pagePidFallback: allocator.pagePidFallback,
      hasPageAllocator: !!allocator.detail,
    },
    rootsMB: allocator.detail?.rootsMB || null,
    partitionBufferMB: bufferMB(allocator.detail),
    partitionBufferTop: bufferRows(allocator.detail).slice(0, 12),
  };
}

async function patchFetchDisabled(frame) {
  return frame.evaluate(() => {
    window.__bufferDiscriminatorOriginalFetch = window.fetch;
    window.fetch = async () => { throw new Error('BUFFER_DISCRIMINATOR_FETCH_DISABLED'); };
    return true;
  }).catch((e) => ({ error: String(e?.message || e) }));
}

async function patchRenderDisabled(frame) {
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no chart' };
    ch.__bufferDiscriminatorOriginalRender = ch.render;
    ch.__bufferDiscriminatorOriginalScheduleRender = ch.scheduleRender;
    ch.render = function bufferDiscriminatorRenderNoop() {};
    ch.scheduleRender = function bufferDiscriminatorScheduleRenderNoop() {};
    return { ok: true };
  }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
}

async function runFetchOnly(page) {
  const rows = [];
  for (const frame of [page.mainFrame(), ...embedFrames(page)]) {
    rows.push(await frame.evaluate(async (iterations) => {
      const ch = window.chart;
      if (!ch || typeof ch._fetchSmartWindow !== 'function') return { ok: false, reason: 'missing _fetchSmartWindow' };
      ch.render = function bufferDiscriminatorRenderNoop() {};
      ch.scheduleRender = function bufferDiscriminatorScheduleRenderNoop() {};
      let ok = 0;
      let bytes = 0;
      const series = Array.isArray(ch.rawData) && ch.rawData.length ? ch.rawData
        : (Array.isArray(ch.data) && ch.data.length ? ch.data : []);
      const lastT = Number(series[series.length - 1]?.t);
      const firstT = Number(series[0]?.t);
      const stepMs = 15 * 60 * 1000;
      const fallbackNow = Date.now();
      for (let i = 0; i < iterations; i++) {
        const endTs = Number.isFinite(lastT)
          ? Math.max(firstT || 0, lastT - i * stepMs)
          : fallbackNow - i * stepMs;
        const startTs = Math.max(firstT || 0, endTs - 2000 * 60 * 1000);
        const result = await ch._fetchSmartWindow(
          ch.currentFileId || 25,
          '1m',
          ch.backtestingSession || null,
          'end',
          { startTs, endTs },
          { skipSessionDates: true, limit: 2000, allowHighLimit: false, skipBars: true },
        );
        if (result && Array.isArray(result.candles)) {
          ok += 1;
          bytes += JSON.stringify(result.candles).length;
        }
      }
      return {
        ok: true,
        fetches: ok,
        approxPayloadBytes: bytes,
        anchorFirstT: firstT,
        anchorLastT: lastT,
        smartCacheSize: ch._smartPrefetchCache?.size ?? null,
        barsInflightSize: ch._barsInflight?.size ?? null,
      };
    }, ARM_ITERATIONS).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function runRenderOnly(page) {
  const rows = [];
  for (const frame of [page.mainFrame(), ...embedFrames(page)]) {
    await patchFetchDisabled(frame);
    rows.push(await frame.evaluate(async (iterations) => {
      const ch = window.chart;
      if (!ch || typeof ch.render !== 'function') return { ok: false, reason: 'missing chart.render' };
      let renders = 0;
      for (let i = 0; i < iterations * 10; i++) {
        ch.render();
        renders += 1;
        if (i % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return { ok: true, renders };
    }, ARM_ITERATIONS).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function ensureIndicatorSet(frame) {
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch || !ch.indicators) return { ok: false, reason: 'missing indicators' };
    const set = [
      { id: 'bd-ema', type: 'ema', params: { period: 20, source: 'close' }, style: {}, visible: true },
      { id: 'bd-vwap', type: 'vwap', params: { source: 'hlc3', anchorPeriod: 'session' }, style: {}, visible: true },
      { id: 'bd-rsi', type: 'rsi', params: { period: 14, source: 'close' }, style: {}, visible: true },
      { id: 'bd-macd', type: 'macd', params: { fast: 12, slow: 26, signal: 9, source: 'close' }, style: {}, visible: true },
    ];
    ch.indicators.list = set;
    ch.indicators.active = set;
    ch.indicators.data = {};
    return {
      ok: true,
      listLength: ch.indicators.list.length,
      activeLength: ch.indicators.active.length,
      dataLength: Array.isArray(ch.data) ? ch.data.length : null,
    };
  }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
}

async function runIndicatorOnly(page) {
  const rows = [];
  for (const frame of [page.mainFrame(), ...embedFrames(page)]) {
    await patchFetchDisabled(frame);
    await patchRenderDisabled(frame);
    await ensureIndicatorSet(frame);
    rows.push(await frame.evaluate(async (iterations) => {
      const ch = window.chart;
      if (!ch || typeof ch.recalculateIndicators !== 'function') return { ok: false, reason: 'missing recalculateIndicators' };
      let recalcs = 0;
      for (let i = 0; i < iterations; i++) {
        ch.recalculateIndicators();
        recalcs += 1;
        if (i % 5 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return {
        ok: true,
        recalcs,
        indicators: Array.isArray(ch.indicators?.list) ? ch.indicators.list.length : null,
        active: Array.isArray(ch.indicators?.active) ? ch.indicators.active.length : null,
        dataKeys: ch.indicators?.data ? Object.keys(ch.indicators.data).length : null,
      };
    }, ARM_ITERATIONS).catch((e) => ({ ok: false, reason: String(e?.message || e) })));
  }
  return rows;
}

async function runIdleControl(page) {
  return [{
    ok: true,
    waited: false,
    frames: 1 + embedFrames(page).length,
  }];
}

function makeSummary(arm) {
  const before = arm.before;
  const postOperation = arm.postOperation;
  const after = arm.after;
  return {
    partitionBufferBeforeMB: before.partitionBufferMB,
    partitionBufferPostOperationMB: postOperation.partitionBufferMB,
    partitionBufferAfterSettleMB: after.partitionBufferMB,
    partitionBufferPostOperationDeltaMB: +(postOperation.partitionBufferMB - before.partitionBufferMB).toFixed(3),
    partitionBufferAfterSettleDeltaMB: +(after.partitionBufferMB - before.partitionBufferMB).toFixed(3),
    totalPrivatePostOperationDeltaMB: +(postOperation.process.totalPrivateMB - before.process.totalPrivateMB).toFixed(3),
    totalPrivateAfterSettleDeltaMB: +(after.process.totalPrivateMB - before.process.totalPrivateMB).toFixed(3),
    rendererPrivatePostOperationDeltaMB: +(postOperation.process.rendererPrivateMB - before.process.rendererPrivateMB).toFixed(3),
    rendererPrivateAfterSettleDeltaMB: +(after.process.rendererPrivateMB - before.process.rendererPrivateMB).toFixed(3),
    gpuPrivatePostOperationDeltaMB: +(postOperation.process.gpuPrivateMB - before.process.gpuPrivateMB).toFixed(3),
    gpuPrivateAfterSettleDeltaMB: +(after.process.gpuPrivateMB - before.process.gpuPrivateMB).toFixed(3),
    bufferBucketPostOperationDeltas: diffRows(before.partitionBufferTop, postOperation.partitionBufferTop).slice(0, 12),
    bufferBucketAfterSettleDeltas: diffRows(before.partitionBufferTop, after.partitionBufferTop).slice(0, 12),
  };
}

async function runArm(label, operation, srvUrl) {
  let browser;
  const arm = { label, startedAt: new Date().toISOString() };
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 240000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
      defaultViewport: { width: 1440, height: 960 },
    });
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    arm.boot = await boot(page, srvUrl);
    arm.before = await sample('before', { browser, browserCdp, page });
    arm.operation = await operation(page);
    arm.postOperationAt = new Date().toISOString();
    arm.postOperation = await sample('post-operation', { browser, browserCdp, page });
    await sleep(SETTLE_MS);
    arm.after = await sample('post-settle', { browser, browserCdp, page });
    arm.summary = makeSummary(arm);
    await browserCdp.detach().catch(() => {});
    await page.close().catch(() => {});
  } catch (e) {
    arm.error = String(e?.stack || e);
  } finally {
    try { await browser?.close(); } catch (_) {}
  }
  return arm;
}

const report = {
  signature: 'BUFFER-PARTITION-DISCRIMINATOR-V1',
  at: new Date().toISOString(),
  method: {
    arms: ['idle-control', 'fetch-only', 'render-only', 'indicator-only'],
    settleMs: SETTLE_MS,
    iterations: ARM_ITERATIONS,
    allocator: 'PID-marked memory-infra detailed dump from the page renderer before, post-operation, and post-settle for each arm',
  },
};

let srv;
try {
  fs.mkdirSync(OUT.split(/[\\/]/).slice(0, -1).join('/') || '.', { recursive: true });
  srv = await startServer(0);
  const armFns = new Map([
    ['idle-control', runIdleControl],
    ['fetch-only', runFetchOnly],
    ['render-only', runRenderOnly],
    ['indicator-only', runIndicatorOnly],
  ]);
  report.arms = [];
  for (const armName of SELECTED_ARMS) {
    const armFn = armFns.get(armName);
    if (!armFn) {
      report.arms.push({ label: armName, error: `unknown arm: ${armName}` });
    } else {
      report.arms.push(await runArm(armName, armFn, srv.url));
    }
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  }
  const control = report.arms.find((a) => a.label === 'idle-control');
  const controlPost = control?.summary?.partitionBufferPostOperationDeltaMB || 0;
  const controlSettle = control?.summary?.partitionBufferAfterSettleDeltaMB || 0;
  report.ranking = report.arms
    .filter((a) => a.label !== 'idle-control')
    .map((a) => ({
      label: a.label,
      postOperationDeltaMB: a.summary?.partitionBufferPostOperationDeltaMB ?? null,
      afterSettleDeltaMB: a.summary?.partitionBufferAfterSettleDeltaMB ?? null,
      controlAdjustedPostOperationDeltaMB: a.summary ? +(a.summary.partitionBufferPostOperationDeltaMB - controlPost).toFixed(3) : null,
      controlAdjustedAfterSettleDeltaMB: a.summary ? +(a.summary.partitionBufferAfterSettleDeltaMB - controlSettle).toFixed(3) : null,
      error: a.error || null,
    }))
    .sort((a, b) => Math.abs(b.controlAdjustedPostOperationDeltaMB || 0)
      - Math.abs(a.controlAdjustedPostOperationDeltaMB || 0));
} catch (e) {
  report.error = String(e?.stack || e);
} finally {
  try { await srv?.close?.(); } catch (_) {}
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  out: OUT,
  ranking: report.ranking,
  arms: report.arms?.map((a) => ({
    label: a.label,
    error: a.error || null,
    operation: a.operation,
    summary: a.summary,
  })),
  error: report.error || null,
}, null, 2));
