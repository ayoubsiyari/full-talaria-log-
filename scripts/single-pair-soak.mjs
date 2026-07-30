/**
 * SINGLE-PAIR-SOAK-V1 — hours, one pair, one chart, orders being placed.
 *
 * The shape gap this closes: every measurement in the plan is 30 seconds to a few
 * cycles, and the PO's testers work in sessions measured in hours. This asks
 * whether memory stays bounded over hours on a single pair. It does NOT assume a
 * leak: bounded is a result, unbounded is a result, and both close a row.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - JS heap AFTER a forced collection, which is the only heap figure comparable
 *     across samples (a live reading also measures allocation timing)
 *   - the live heap alongside it, so the uncollected fraction is visible per sample
 *   - DOM census: attached elements across frames, Nodes, Documents, Frames,
 *     JSEventListeners
 *   - OS process footprints for every Chrome process (private bytes, the column
 *     Task Manager calls "Memory footprint"), so growth outside the JS heap shows
 *   - renderer allocator composition periodically (v8, blink_gc, web_cache, malloc,
 *     partition_alloc)
 *   - session progress: replay index, resident bars, open orders, so growth can be
 *     normalised per tick and per order rather than only per hour
 * WHAT IT CANNOT SEE:
 *   - worker isolate heaps; the GPU process appears only as an OS footprint
 *   - a real user's exact route: this is the dist-v9 chart shell, headless
 *
 * PROTOCOL: boot once, replay playing, one market order with SL and TP every N
 * samples, sample every --interval-ms, two forced collections before every heap
 * reading, incremental JSON written after each sample so a kill loses one sample.
 *
 * Usage: node scripts/single-pair-soak.mjs --hours=6 --interval-ms=120000 --out=x.json
 */
import fs from 'node:fs';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { collectMemoryDump, readOsFootprints } from './process-memory-census.mjs';
import { pickPageRenderer } from './session-reload-census.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const MB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withDeadline(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); }),
  ]);
}

/**
 * Least squares over (hours, value). A soak answers "bounded or not", so the slope
 * and the residual scatter are the answer, not the endpoints — a sawtooth can put
 * its last sample anywhere.
 */
export function describeTrend(points, { label = '', flatBandPerHour = 0 } = {}) {
  const rows = (points || []).filter((p) => Number.isFinite(p?.hours) && Number.isFinite(p?.value));
  if (rows.length < 3) return { label, verdict: 'INSUFFICIENT', n: rows.length };
  const n = rows.length;
  const meanX = rows.reduce((s, p) => s + p.hours, 0) / n;
  const meanY = rows.reduce((s, p) => s + p.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of rows) {
    sxy += (p.hours - meanX) * (p.value - meanY);
    sxx += (p.hours - meanX) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of rows) {
    ssRes += (p.value - (intercept + slope * p.hours)) ** 2;
    ssTot += (p.value - meanY) ** 2;
  }
  const values = rows.map((p) => p.value);
  const spanHours = rows[rows.length - 1].hours - rows[0].hours;
  const band = flatBandPerHour || Math.max(Math.abs(meanY) * 0.02, 1);
  return {
    label,
    n,
    spanHours: +spanHours.toFixed(2),
    first: +values[0].toFixed(2),
    last: +values[n - 1].toFixed(2),
    min: +Math.min(...values).toFixed(2),
    max: +Math.max(...values).toFixed(2),
    perHour: +slope.toFixed(3),
    rSquared: ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(3) : null,
    // A slope inside the band, or one the scatter does not support, is not growth.
    verdict: Math.abs(slope) <= band ? 'BOUNDED' : (slope > 0 ? 'CLIMBS' : 'FALLS'),
    flatBandPerHour: +band.toFixed(3),
  };
}

const CENSUS_FN = () => ({
  elements: document.querySelectorAll('*').length,
  iframes: document.querySelectorAll('iframe').length,
});

const SESSION_STATE_FN = () => {
  const chart = window.chart;
  const rs = chart && chart.replaySystem;
  const om = chart && (chart.orderManager || window.orderManager);
  const service = om && om.orderService;
  return {
    residentBars: chart && Array.isArray(chart.data) ? chart.data.length : null,
    replayActive: !!(rs && rs.isActive),
    replayPlaying: !!(rs && rs.isPlaying),
    replayIndex: rs && rs.currentIndex != null ? Number(rs.currentIndex) : null,
    openPositions: service && Array.isArray(service.openPositions) ? service.openPositions.length : null,
    orders: service && Array.isArray(service.orders) ? service.orders.length : null,
    closedTrades: service && Array.isArray(service.closedTrades) ? service.closedTrades.length : null,
    orderLines: om && Array.isArray(om.orderLines) ? om.orderLines.length : null,
  };
};

async function placeMarketOrder(page) {
  return page.evaluate(() => {
    try { window.alert = () => {}; } catch (_) {}
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const service = om && om.orderService;
    const candle = chart && Array.isArray(chart.data) && chart.data.length
      ? chart.data[chart.data.length - 1]
      : null;
    const price = candle && Number(candle.c);
    if (!service || typeof service.submitOrder !== 'function' || !Number.isFinite(price)) {
      return { ok: false, reason: 'orderService.submitOrder unavailable' };
    }
    const submitted = service.submitOrder({
      orderType: 'market',
      direction: Math.random() < 0.5 ? 'BUY' : 'SELL',
      side: Math.random() < 0.5 ? 'BUY' : 'SELL',
      quantity: 1,
      entryPrice: price,
      timestamp: candle.t != null ? Number(candle.t) : Date.now(),
      stopLoss: price * 0.995,
      takeProfit: price * 1.005,
    });
    return { ok: !!(submitted && submitted.id), id: submitted ? submitted.id : null };
  });
}

async function sampleOnce(page, cdp, browserCdp, { withDump = false } = {}) {
  const readMetrics = async () => {
    const { metrics } = await withDeadline(cdp.send('Performance.getMetrics'), 20_000, 'metrics');
    const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
    return {
      nodes: g('Nodes'),
      documents: g('Documents'),
      frames: g('Frames'),
      listeners: g('JSEventListeners'),
      cdpHeapUsedMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null,
      cdpHeapTotalMB: g('JSHeapTotalSize') != null ? +(g('JSHeapTotalSize') / MB).toFixed(2) : null,
    };
  };
  const perfMemory = () => page.evaluate(() => (performance.memory
    ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) }
    : null));

  const live = { ...(await readMetrics()), perf: await withDeadline(perfMemory(), 20_000, 'perf.memory') };
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(400);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(1500);
  const collected = { ...(await readMetrics()), perf: await withDeadline(perfMemory(), 20_000, 'perf.memory') };

  let elements = null;
  try {
    const host = await withDeadline(page.evaluate(CENSUS_FN), 20_000, 'census');
    elements = host.elements;
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      const got = await f.evaluate(CENSUS_FN).catch(() => null);
      if (got) elements += got.elements;
    }
  } catch (_) { /* recorded as null */ }

  const session = await withDeadline(page.evaluate(SESSION_STATE_FN), 20_000, 'session state').catch(() => null);
  // A soak that quietly stops playing measures an idle chart for hours. Playback
  // is re-armed whenever it is not running, and the re-arm is recorded so a
  // stalled session cannot be mistaken for a calm one.
  let reArm = null;
  if (session && !session.replayPlaying) {
    reArm = await withDeadline(page.evaluate(async () => {
      const chart = window.chart;
      const rs = chart && chart.replaySystem;
      if (!rs) return { ok: false, reason: 'no replaySystem' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: false, userInitiated: true });
        }
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        else if (!rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
        // play() starts across two animation frames (_playStartRaf1/_playStartRaf2),
        // so isPlaying lags the call and must be waited for, not read immediately.
        const started = Date.now();
        while (Date.now() - started < 5_000 && !rs.isPlaying) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return {
          ok: !!rs.isPlaying, isPlaying: !!rs.isPlaying, idx: rs.currentIndex,
          bars: Array.isArray(chart.data) ? chart.data.length : null,
        };
      } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
    }), 20_000, 're-arm').catch((e) => ({ ok: false, reason: String(e?.message || e) }));
  }

  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const pids = (info.processInfo || []).map((p) => p.id);
  const footprints = await readOsFootprints(pids).catch(() => ({}));
  const os = { totalPrivateMB: 0, byType: {} };
  for (const p of info.processInfo || []) {
    const fp = footprints[p.id];
    if (!fp) continue;
    os.totalPrivateMB += fp.privateMB;
    const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
    os.byType[key] = +((os.byType[key] || 0) + fp.privateMB).toFixed(2);
  }
  os.totalPrivateMB = +os.totalPrivateMB.toFixed(2);
  // The page renderer specifically, not the sum: that is the row a user sees.
  let pageRendererPrivateMB = null;
  for (const p of info.processInfo || []) {
    if (!/renderer/i.test(p.type)) continue;
    const fp = footprints[p.id];
    if (fp && (pageRendererPrivateMB == null || fp.privateMB > pageRendererPrivateMB)) {
      pageRendererPrivateMB = fp.privateMB;
    }
  }

  let allocators = null;
  if (withDump) {
    const dumps = await collectMemoryDump(browserCdp).catch(() => new Map());
    allocators = pickPageRenderer(dumps);
  }

  return {
    live,
    collected,
    uncollectedAtReadMB: live.cdpHeapUsedMB != null && collected.cdpHeapUsedMB != null
      ? +(live.cdpHeapUsedMB - collected.cdpHeapUsedMB).toFixed(2)
      : null,
    elements,
    session,
    reArm,
    os,
    pageRendererPrivateMB,
    allocators,
  };
}

function parseArgs(argv) {
  const o = {
    hours: 6, intervalMs: 120_000, speed: 10, orderEverySamples: 1, dumpEverySamples: 5, out: null,
  };
  for (const a of argv) {
    if (a.startsWith('--hours=')) o.hours = Number(a.split('=')[1]) || 6;
    else if (a.startsWith('--interval-ms=')) o.intervalMs = Number(a.split('=')[1]) || 120_000;
    else if (a.startsWith('--speed=')) o.speed = Number(a.split('=')[1]) || 10;
    else if (a.startsWith('--order-every=')) o.orderEverySamples = Number(a.split('=')[1]) || 1;
    else if (a.startsWith('--dump-every=')) o.dumpEverySamples = Number(a.split('=')[1]) || 5;
    else if (a.startsWith('--out=')) o.out = a.slice(6);
  }
  return o;
}

export async function runSinglePairSoak({
  hours = 6, intervalMs = 120_000, speed = 10, orderEverySamples = 1,
  dumpEverySamples = 5, outPath = null,
} = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('soak requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info',
      // Hours-long unattended run: nothing may be throttled for being unfocused,
      // or the soak silently measures a paused chart.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });

  const samples = [];
  const orders = { attempted: 0, accepted: 0, failed: 0 };
  const startedAt = Date.now();
  const meta = {
    signature: 'SINGLE-PAIR-SOAK-V1',
    startedAtIso: new Date(startedAt).toISOString(),
    plannedHours: hours,
    intervalMs,
    replaySpeed: speed,
    pair: 'EURUSD',
    layout: 'single chart, one pair, no multichart cycling',
    headless: true,
    protocol: 'two forced collections before every heap reading; live reading kept alongside so the uncollected fraction is visible',
    scope: {
      canSee: 'post-collection JS heap, DOM census, OS private bytes per Chrome process, renderer allocators periodically, session progress (replay index, resident bars, orders)',
      cannotSee: 'worker isolate heaps; GPU internals (OS footprint only); the PO\'s exact route',
    },
  };
  const save = (extra = {}) => {
    if (!outPath) return;
    fs.writeFileSync(outPath, JSON.stringify({
      ...meta,
      running: true,
      elapsedHours: +((Date.now() - startedAt) / 3_600_000).toFixed(3),
      orders,
      sampleCount: samples.length,
      samples,
      ...extra,
    }, null, 1));
  };

  let consecutiveFailures = 0;
  const progress = { ticks: 0, reArms: 0, lastIndex: null };
  try {
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await uiLoginDeployed(page, origin, email, password);
    await page.evaluate(() => {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `soak-${Date.now()}`,
        instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
      }));
    });
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page).catch(() => {});
    await waitForDistV9SingleReady(page, 180_000);
    await sleep(10_000);

    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    page.on('error', (e) => { meta.targetCrash = String(e?.message || e); });
    // A hung gated fetch is already known to exist on this build (the window-claim
    // hang), and it would stall replay silently. Long-pending requests are recorded
    // per sample so a stalled soak is diagnosable rather than just flat.
    const inFlight = new Map();
    page.on('request', (r) => inFlight.set(r.url() + Date.now(), { url: r.url(), startedAt: Date.now() }));
    const settle = (r) => { for (const [k, v] of inFlight) if (v.url === r.url()) inFlight.delete(k); };
    page.on('requestfinished', settle);
    page.on('requestfailed', settle);
    const pendingSnapshot = () => {
      const rows = [...inFlight.values()]
        .map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ''), pendingMs: Date.now() - r.startedAt }))
        .filter((r) => r.pendingMs > 5_000)
        .sort((a, b) => b.pendingMs - a.pendingMs);
      return { count: rows.length, oldest: rows.slice(0, 3) };
    };

    meta.replayArmed = await page.evaluate((s) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { ok: false, reason: 'no replaySystem' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
        else if (rs.speed != null) rs.speed = s;
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        return { ok: !!rs.isPlaying, active: !!rs.isActive };
      } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
    }, speed);
    console.error(`[soak] armed ${JSON.stringify(meta.replayArmed)} — sampling every ${intervalMs}ms for ${hours}h`);
    save();

    const deadline = startedAt + hours * 3_600_000;
    let i = 0;
    while (Date.now() < deadline) {
      await sleep(intervalMs);
      i += 1;
      const row = { sample: i, hours: +((Date.now() - startedAt) / 3_600_000).toFixed(3) };
      try {
        if (orderEverySamples > 0 && i % orderEverySamples === 0) {
          orders.attempted += 1;
          const placed = await withDeadline(placeMarketOrder(page), 30_000, 'place order');
          row.order = placed;
          if (placed?.ok) orders.accepted += 1; else { orders.failed += 1; }
        }
        row.pendingRequests = pendingSnapshot();
        Object.assign(row, await withDeadline(
          sampleOnce(page, cdp, browserCdp, { withDump: dumpEverySamples > 0 && i % dumpEverySamples === 0 }),
          120_000,
          `sample ${i}`,
        ));
        consecutiveFailures = 0;
      } catch (error) {
        row.error = String(error?.message || error);
        consecutiveFailures += 1;
      }
      // Ticks processed, accumulated across loops, is the workload unit growth
      // should be normalised against.
      const idx = row.session?.replayIndex;
      if (Number.isFinite(idx)) {
        if (Number.isFinite(progress.lastIndex) && idx > progress.lastIndex) progress.ticks += idx - progress.lastIndex;
        progress.lastIndex = idx;
      }
      if (row.reArm) progress.reArms += 1;
      row.ticksProcessed = progress.ticks;
      row.reArmCount = progress.reArms;
      samples.push(row);
      save();
      console.error(
        `[soak] ${row.hours}h #${i}: heapAfterGc=${row.collected?.cdpHeapUsedMB}MB `
        + `live=${row.live?.cdpHeapUsedMB}MB renderer=${row.pageRendererPrivateMB}MB `
        + `chrome=${row.os?.totalPrivateMB}MB nodes=${row.collected?.nodes} elements=${row.elements} `
        + `bars=${row.session?.residentBars} idx=${row.session?.replayIndex} `
        + `open=${row.session?.openPositions} orders=${orders.accepted}/${orders.attempted}`
        + (row.error ? ` ERROR ${row.error}` : ''),
      );
      // Five failed samples in a row means the page is gone; stop rather than
      // write hours of nulls.
      if (consecutiveFailures >= 5) { meta.abortedReason = 'five consecutive failed samples'; break; }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const ok = samples.filter((s) => !s.error);
  const series = (fn) => ok.map((s) => ({ hours: s.hours, value: fn(s) })).filter((p) => Number.isFinite(p.value));
  const report = {
    ...meta,
    running: false,
    finishedAtIso: new Date().toISOString(),
    elapsedHours: +((Date.now() - startedAt) / 3_600_000).toFixed(3),
    orders,
    sampleCount: samples.length,
    trends: {
      heapAfterCollectionMB: describeTrend(series((s) => s.collected?.cdpHeapUsedMB), { label: 'JS heap after forced collection' }),
      heapLiveMB: describeTrend(series((s) => s.live?.cdpHeapUsedMB), { label: 'JS heap live (allocation-sensitive)' }),
      pageRendererPrivateMB: describeTrend(series((s) => s.pageRendererPrivateMB), { label: 'page renderer OS private bytes' }),
      allChromePrivateMB: describeTrend(series((s) => s.os?.totalPrivateMB), { label: 'all Chrome processes OS private bytes' }),
      nodes: describeTrend(series((s) => s.collected?.nodes), { label: 'Nodes after collection' }),
      elements: describeTrend(series((s) => s.elements), { label: 'attached elements' }),
      listeners: describeTrend(series((s) => s.collected?.listeners), { label: 'JS event listeners' }),
      documents: describeTrend(series((s) => s.collected?.documents), { label: 'documents' }),
      residentBars: describeTrend(series((s) => s.session?.residentBars), { label: 'resident bars' }),
      orderLines: describeTrend(series((s) => s.session?.orderLines), { label: 'order lines' }),
    },
    samples,
  };
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  return report;
}

const invokedDirectly = process.argv[1] && /single-pair-soak\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runSinglePairSoak({ ...opts, outPath: opts.out });
  console.error(`[soak] trends ${JSON.stringify(report.trends, null, 1)}`);
  if (!opts.out) console.log(JSON.stringify(report, null, 1));
}
