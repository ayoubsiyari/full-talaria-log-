/**
 * SESSION-RELOAD-CENSUS-V1 — does node count climb with LOAD COUNT at fixed range?
 *
 * The 11:20 finding reports 51,303 -> 97,488 -> 137,834 nodes across successive
 * in-tab session loads, but those readings varied the data range as well as the
 * load count. This holds the session, the range and the tab FIXED and varies only
 * the number of loads, which is the one thing that decides it.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - attached elements per frame (querySelectorAll), and Chrome's Nodes counter
 *     which also includes detached nodes awaiting collection
 *   - the renderer's allocator composition per load (web_cache = script and image
 *     caches, blink_gc = Oilpan where DOM lives, v8, malloc, PartitionAlloc)
 *   - the JS heap BEFORE and AFTER a forced collection, so allocation-not-yet-
 *     collected is never reported as retention (11:20 Finding 1)
 *   - the renderer process id per load, so "same process" is verified not assumed
 * WHAT IT CANNOT SEE:
 *   - the GPU process (not read here; see PROCESS-MEMORY-CENSUS-V1)
 *   - the PO's machine or his exact route
 *
 * SETTLE PROTOCOL: one tab for the whole run. Per load: navigate, wait for chart
 * data, settle 8s, read counters, force two collections, read again, dump memory.
 *
 * Usage: node scripts/session-reload-census.mjs --loads=5 --out=x.json
 */
import fs from 'node:fs';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { collectMemoryDump } from './process-memory-census.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const MB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Monotonic climb with load count is the whole question; say it in one field. */
export function classifyLoadSeries(series, { tolerance = 0.05 } = {}) {
  const xs = (series || []).filter((v) => Number.isFinite(v));
  if (xs.length < 3) return { verdict: 'INSUFFICIENT', n: xs.length };
  const first = xs[0];
  const last = xs[xs.length - 1];
  const band = Math.max(Math.abs(first) * tolerance, 1);
  const monotonic = xs.every((v, i) => i === 0 || v >= xs[i - 1] - band);
  const growth = last - first;
  const perLoad = growth / (xs.length - 1);
  let verdict;
  if (growth > band && monotonic) verdict = 'CLIMBS-WITH-LOAD-COUNT';
  else if (growth > band) verdict = 'RISES-NON-MONOTONIC';
  else if (Math.abs(growth) <= band) verdict = 'FLAT';
  else verdict = 'FALLS';
  return {
    verdict,
    n: xs.length,
    series: xs,
    first,
    last,
    growth: +growth.toFixed(2),
    perLoad: +perLoad.toFixed(2),
    ratioLastOverFirst: first ? +(last / first).toFixed(2) : null,
    toleranceBand: +band.toFixed(2),
  };
}

const COUNT_ELEMENTS = () => ({
  elements: document.querySelectorAll('*').length,
  documentsInDom: document.querySelectorAll('iframe').length + 1,
});

async function readCounters(page, cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
  const host = await page.evaluate(COUNT_ELEMENTS);
  let elementsAllFrames = host.elements;
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    const got = await f.evaluate(COUNT_ELEMENTS).catch(() => null);
    if (got) elementsAllFrames += got.elements;
  }
  return {
    nodes: g('Nodes'),
    documents: g('Documents'),
    frames: g('Frames'),
    listeners: g('JSEventListeners'),
    jsHeapUsedMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null,
    jsHeapTotalMB: g('JSHeapTotalSize') != null ? +(g('JSHeapTotalSize') / MB).toFixed(2) : null,
    elementsHost: host.elements,
    elementsAllFrames,
  };
}

function parseArgs(argv) {
  const o = { loads: 5, out: null, settleMs: 8_000 };
  for (const a of argv) {
    if (a.startsWith('--loads=')) o.loads = Number(a.split('=')[1]) || 5;
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--settle-ms=')) o.settleMs = Number(a.split('=')[1]) || 8_000;
  }
  return o;
}

export async function runSessionReloadCensus({ loads = 5, settleMs = 8_000, outPath = null } = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('census requires TEST_EMAIL and TEST_PASSWORD');
  // One fixed session id and one fixed instrument for the whole run: load count is
  // the only variable, which is exactly what the 11:20 readings could not isolate.
  const sessionId = `reload-census-${Date.now()}`;

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
    defaultViewport: { width: 1440, height: 960 },
  });
  const rows = [];
  const save = (extra = {}) => {
    if (outPath) fs.writeFileSync(outPath, JSON.stringify({ partial: true, sessionId, loads: rows, ...extra }, null, 1));
  };
  try {
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await uiLoginDeployed(page, origin, email, password);
    await page.evaluate((sid) => {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: sid,
        instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
      }));
    }, sessionId);
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');

    for (let i = 1; i <= loads; i += 1) {
      const row = { load: i };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
          await dismissCookieBanner(page);
          await uiLoginDeployed(page, origin, email, password);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        }
        await dismissCookieBanner(page);
        await waitForDistV9SingleReady(page, 180_000);
        await sleep(settleMs);

        row.rendererPid = await page.evaluate(() => null).then(async () => {
          const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
          const renderers = (info.processInfo || []).filter((p) => /renderer/i.test(p.type));
          return renderers.length ? renderers.map((p) => p.id).join(',') : null;
        });
        row.beforeGc = await readCounters(page, cdp);
        // 11:20 Finding 1: a reading without a forced collection measures allocation
        // as much as retention. Both are reported so the gap is visible, not hidden.
        await cdp.send('HeapProfiler.collectGarbage');
        await sleep(400);
        await cdp.send('HeapProfiler.collectGarbage');
        await sleep(1200);
        row.afterGc = await readCounters(page, cdp);
        row.uncollectedAtReadMB = row.beforeGc.jsHeapUsedMB != null && row.afterGc.jsHeapUsedMB != null
          ? +(row.beforeGc.jsHeapUsedMB - row.afterGc.jsHeapUsedMB).toFixed(2)
          : null;
        row.residentBars = await page.evaluate(
          () => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null),
        ).catch(() => null);

        const dumps = await collectMemoryDump(browserCdp).catch(() => new Map());
        // The page renderer is the process with the largest v8 allocation.
        let best = null;
        for (const [pid, alloc] of dumps) {
          if (!alloc) continue;
          if (!best || (alloc.v8 || 0) > (best.alloc.v8 || 0)) best = { pid, alloc };
        }
        row.rendererAllocators = best ? { pid: best.pid, ...best.alloc } : null;
      } catch (error) {
        row.error = String(error?.message || error);
      }
      rows.push(row);
      save();
      console.error(
        `[reload-census] load ${i}: elements=${row.afterGc?.elementsAllFrames} `
        + `nodes(before)=${row.beforeGc?.nodes} nodes(after)=${row.afterGc?.nodes} `
        + `docs=${row.afterGc?.documents} listeners=${row.afterGc?.listeners} `
        + `jsAfterGc=${row.afterGc?.jsHeapUsedMB}MB uncollected=${row.uncollectedAtReadMB}MB `
        + `webCache=${row.rendererAllocators?.web_cache}MB blinkGc=${row.rendererAllocators?.blink_gc}MB `
        + `pids=${row.rendererPid}` + (row.error ? ` ERROR ${row.error}` : ''),
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const ok = rows.filter((r) => !r.error && r.afterGc);
  const pick = (fn) => ok.map(fn);
  return {
    signature: 'SESSION-RELOAD-CENSUS-V1',
    sessionId,
    protocol: {
      oneTabForTheWholeRun: true,
      sessionHeldFixed: true,
      rangeHeldFixed: 'same instrument and fileId every load',
      onlyVariable: 'number of in-tab loads',
      readingsTakenAfterForcedCollection: true,
      settleMs,
    },
    loads: rows,
    verdicts: {
      elementsAllFrames: classifyLoadSeries(pick((r) => r.afterGc.elementsAllFrames)),
      nodesAfterGc: classifyLoadSeries(pick((r) => r.afterGc.nodes)),
      nodesBeforeGc: classifyLoadSeries(pick((r) => r.beforeGc?.nodes)),
      documents: classifyLoadSeries(pick((r) => r.afterGc.documents)),
      listeners: classifyLoadSeries(pick((r) => r.afterGc.listeners)),
      jsHeapAfterGcMB: classifyLoadSeries(pick((r) => r.afterGc.jsHeapUsedMB)),
      webCacheMB: classifyLoadSeries(pick((r) => r.rendererAllocators?.web_cache)),
      blinkGcMB: classifyLoadSeries(pick((r) => r.rendererAllocators?.blink_gc)),
      mallocMB: classifyLoadSeries(pick((r) => r.rendererAllocators?.malloc)),
    },
  };
}

const invokedDirectly = process.argv[1] && /session-reload-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runSessionReloadCensus({ ...opts, outPath: opts.out });
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
  console.error(`[reload-census] verdicts ${JSON.stringify(report.verdicts, null, 1)}`);
}
