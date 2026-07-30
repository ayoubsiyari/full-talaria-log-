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

class DeadlineError extends Error {}

/**
 * A wedged renderer makes page.evaluate hang until the protocol timeout, which
 * silently costs five minutes per poll. Every page-side step gets its own
 * deadline so a wedge is recorded as data instead of stalling the run.
 */
function withDeadline(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(`${label} exceeded ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Distinguishes the two things a hang can mean. CDP's Performance domain is
 * served off the renderer's main thread, so metrics that still arrive while
 * page.evaluate hangs mean the main thread is BUSY IN A LONG TASK, not dead.
 */
async function probeWedge(page, cdp, browserCdp = null, browser = null, url = null) {
  const out = { pageEvaluateResponds: false, cdpMetricsRespond: false };
  try {
    const { metrics } = await withDeadline(cdp.send('Performance.getMetrics'), 15_000, 'wedge metrics');
    out.cdpMetricsRespond = true;
    const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
    out.metrics = {
      nodes: g('Nodes'),
      documents: g('Documents'),
      frames: g('Frames'),
      jsHeapUsedMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null,
      taskDuration: g('TaskDuration'),
    };
  } catch (error) {
    out.metricsError = String(error?.message || error);
  }
  try {
    await withDeadline(page.evaluate(() => 1), 10_000, 'wedge evaluate');
    out.pageEvaluateResponds = true;
  } catch (error) {
    out.evaluateError = String(error?.message || error);
  }
  out.pageClosed = typeof page.isClosed === 'function' ? page.isClosed() : null;
  // The browser process answering while the tab does not separates a dead tab
  // from a dead browser, which is the difference between a product defect and a
  // harness one.
  if (browserCdp) {
    try {
      const info = await withDeadline(browserCdp.send('SystemInfo.getProcessInfo'), 15_000, 'wedge browser');
      out.browserProcessResponds = true;
      out.chromeProcessCount = (info.processInfo || []).length;
    } catch (error) {
      out.browserProcessResponds = false;
      out.browserError = String(error?.message || error);
    }
  }
  // A fresh tab loading the same URL while the first is wedged says the wedge is
  // bound to that tab's history, not to the build or the machine.
  if (browser && url && out.browserProcessResponds) {
    let fresh = null;
    try {
      fresh = await withDeadline(browser.newPage(), 20_000, 'wedge fresh tab');
      await withDeadline(fresh.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }), 50_000, 'wedge fresh goto');
      const ready = await withDeadline(waitForDistV9SingleReady(fresh, 60_000), 65_000, 'wedge fresh ready')
        .then(() => true).catch(() => false);
      out.freshTabLoads = ready;
      out.freshTabElements = ready
        ? await fresh.evaluate(() => document.querySelectorAll('*').length).catch(() => null)
        : null;
    } catch (error) {
      out.freshTabLoads = false;
      out.freshTabError = String(error?.message || error);
    } finally {
      if (fresh) await fresh.close().catch(() => {});
    }
  }
  if (out.cdpMetricsRespond && !out.pageEvaluateResponds) {
    out.interpretation = 'renderer alive, main thread occupied by a long task';
  } else if (!out.cdpMetricsRespond && out.browserProcessResponds && out.freshTabLoads) {
    out.interpretation = 'this tab is dead while the browser and a fresh tab are healthy';
  } else if (!out.cdpMetricsRespond && out.browserProcessResponds) {
    out.interpretation = 'tab dead, and a fresh tab could not load either';
  } else if (!out.cdpMetricsRespond) {
    out.interpretation = 'browser-wide stall, cannot attribute to the page';
  } else {
    out.interpretation = 'responsive at probe time';
  }
  return out;
}

/**
 * The page renderer, not a spare one. Picking by v8 alone chose a process with
 * 1.25 MB of Blink GC and no web_cache in the first run; the page's renderer is
 * the one carrying DOM and caches, so score on those together.
 */
export function pickPageRenderer(dumpsByPid) {
  let best = null;
  for (const [pid, alloc] of dumpsByPid || []) {
    if (!alloc) continue;
    const score = (alloc.v8 || 0) + (alloc.blink_gc || 0) + (alloc.web_cache || 0) + (alloc.partition_alloc || 0);
    if (!best || score > best.score) best = { pid, score, alloc };
  }
  return best ? { pid: best.pid, ...best.alloc } : null;
}

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
  const o = { loads: 5, out: null, settleMs: 8_000, distinctSessions: false };
  for (const a of argv) {
    if (a.startsWith('--loads=')) o.loads = Number(a.split('=')[1]) || 5;
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--settle-ms=')) o.settleMs = Number(a.split('=')[1]) || 8_000;
    else if (a === '--distinct-sessions') o.distinctSessions = true;
  }
  return o;
}

export async function runSessionReloadCensus({
  loads = 5, settleMs = 8_000, outPath = null, loadDeadlineMs = 150_000, distinctSessions = false,
} = {}) {
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
    // "Aw, Snap" and uncaught page errors are the difference between a hang and a
    // crash, and neither shows up in a timeout message.
    const crashEvents = [];
    page.on('error', (e) => crashEvents.push({ kind: 'target-crash', message: String(e?.message || e) }));
    page.on('pageerror', (e) => crashEvents.push({ kind: 'page-error', message: String(e?.message || e).slice(0, 300) }));

    for (let i = 1; i <= loads; i += 1) {
      const row = { load: i };
      // One deadline around the whole load: a wedge can surface in navigation,
      // in readiness, or in any later page.evaluate, and per-step deadlines let
      // the later ones hang for the full protocol timeout.
      const measureOneLoad = async () => {
        if (distinctSessions && i > 1) {
          // Same tab, same range, new session id: separates "reloading a session"
          // from "loading any session again in this browser".
          await page.evaluate((sid) => {
            const raw = localStorage.getItem('u1_backtestingSession');
            const parsed = raw ? JSON.parse(raw) : {};
            parsed.session_id = sid;
            localStorage.setItem('u1_backtestingSession', JSON.stringify(parsed));
          }, `${sessionId}-${i}`);
        }
        await withDeadline(
          page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }),
          100_000,
          `load ${i} navigation`,
        );
        if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
          await dismissCookieBanner(page);
          await uiLoginDeployed(page, origin, email, password);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        }
        await dismissCookieBanner(page).catch(() => {});
        await withDeadline(waitForDistV9SingleReady(page, 90_000), 100_000, `load ${i} readiness`);
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
        row.rendererAllocators = pickPageRenderer(dumps);
      };
      try {
        await withDeadline(measureOneLoad(), loadDeadlineMs, `load ${i}`);
      } catch (error) {
        row.error = String(error?.message || error);
        // A wedge is a measurement, not the end of the run: probe it, then keep
        // loading so the load-count series still has points after it.
        row.wedge = await probeWedge(page, cdp, browserCdp, browser, url)
          .catch((e) => ({ probeError: String(e?.message || e) }));
        row.crashEvents = crashEvents.slice();
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
