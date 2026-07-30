/**
 * FRESH-LOAD-CENSUS-V1 — Criterion 0.
 *
 * Characterises the noise floor of the fresh-load state, because a threshold
 * below your own variance grades nothing. Reports median and spread for the
 * cross-frame heap total and the document count, and ENUMERATES every document
 * by URL so a 13-versus-18 count becomes a diff instead of a mystery.
 *
 * PROTOCOL (cite this with any number it produces):
 *   - one fresh page per load, same URL, cache disabled, cookies reused
 *   - boot path identical to the memory harness (session bootstrap, cookie
 *     banner, wait for chart data) so the app reaches a live state; a bespoke
 *     loader that merely fires `load` leaves the renderer unresponsive
 *   - fixed settle delay after readiness, default 10s
 *   - cross-frame total = Performance.getMetrics JSHeapUsedSize, the figure
 *     DevTools' Performance Monitor displays, read on a dedicated CDP session
 *   - no forced GC, and nothing but booleans/numbers ever crosses the bridge,
 *     so the inspector holds no page objects (the W81 inflation mechanism)
 *
 * Usage:
 *   node scripts/fresh-load-census.mjs --loads=10 --settle-ms=10000 --out=census.json
 */
import fs from 'node:fs';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';

export function describeSpread(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return { n: 0 };
  const mid = xs.length / 2;
  const median = xs.length % 2 ? xs[Math.floor(mid)] : (xs[mid - 1] + xs[mid]) / 2;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1
    ? Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1))
    : 0;
  return {
    n: xs.length,
    median: +median.toFixed(2),
    mean: +mean.toFixed(2),
    min: xs[0],
    max: xs[xs.length - 1],
    spread: +(xs[xs.length - 1] - xs[0]).toFixed(2),
    sd: +sd.toFixed(2),
  };
}

/** Diff two frame-URL lists so a differing document count names itself. */
export function diffFrameLists(low, high) {
  const norm = (rows) => (rows || []).map((r) => r.url);
  const a = norm(low);
  const b = norm(high);
  const counts = (list) => list.reduce((m, u) => m.set(u, (m.get(u) || 0) + 1), new Map());
  const ca = counts(a);
  const cb = counts(b);
  const onlyInHigh = [];
  for (const [url, n] of cb) {
    const extra = n - (ca.get(url) || 0);
    if (extra > 0) onlyInHigh.push({ url, extra });
  }
  const onlyInLow = [];
  for (const [url, n] of ca) {
    const extra = n - (cb.get(url) || 0);
    if (extra > 0) onlyInLow.push({ url, extra });
  }
  return { lowCount: a.length, highCount: b.length, onlyInHigh, onlyInLow };
}

function parseArgs(argv) {
  const opts = { loads: 10, settleMs: 10_000, out: null };
  for (const arg of argv) {
    if (arg.startsWith('--loads=')) opts.loads = Number(arg.split('=')[1]) || 10;
    else if (arg.startsWith('--settle-ms=')) opts.settleMs = Number(arg.split('=')[1]) || 10_000;
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readCounters(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
  return {
    crossFrameUsedMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / 1048576).toFixed(2) : null,
    crossFrameTotalMB: g('JSHeapTotalSize') != null ? +(g('JSHeapTotalSize') / 1048576).toFixed(2) : null,
    documents: g('Documents'),
    frames: g('Frames'),
    nodes: g('Nodes'),
    listeners: g('JSEventListeners'),
  };
}

async function readFrameUrls(cdp, origin) {
  const tree = await cdp.send('Page.getFrameTree').catch(() => null);
  const rows = [];
  const walk = (node, depth) => {
    if (!node) return;
    rows.push({
      depth,
      url: String(node.frame?.url || '(none)').replace(origin, '<origin>'),
      name: node.frame?.name || null,
    });
    for (const c of node.childFrames || []) walk(c, depth + 1);
  };
  walk(tree?.frameTree, 0);
  return rows;
}

export async function runFreshLoadCensus({ loads = 10, settleMs = 10_000 } = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('deployed census requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
    defaultViewport: { width: 1440, height: 960 },
  });
  const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
  const rows = [];
  try {
    const boot = await browser.newPage();
    await boot.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(boot.url()).pathname)) {
      await dismissCookieBanner(boot);
      await uiLoginDeployed(boot, origin, email, password);
    }
    await boot.close();

    for (let i = 1; i <= loads; i += 1) {
      const page = await browser.newPage();
      const row = { load: i, startedAt: new Date().toISOString() };
      try {
        await page.setCacheEnabled(false);
        await page.evaluateOnNewDocument(() => {
          try {
            if (!localStorage.getItem('u1_backtestingSession')) {
              localStorage.setItem('u1_backtestingSession', JSON.stringify({
                type: 'standard',
                startBalance: 10000,
                session_id: `fresh-load-${Date.now()}`,
                instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
              }));
            }
          } catch (_) {}
        });
        const cdp = await page.createCDPSession();
        await cdp.send('Performance.enable');
        const t0 = Date.now();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
        await dismissCookieBanner(page);
        await waitForDistV9SingleReady(page, 180_000);
        row.readyMs = Date.now() - t0;
        await sleep(settleMs);
        Object.assign(row, await readCounters(cdp));
        row.perfMemoryMB = await page.evaluate(() => {
          const m = performance.memory;
          return m ? Math.round((Number(m.usedJSHeapSize) / 1048576) * 100) / 100 : null;
        }).catch(() => null);
        row.frameUrls = await readFrameUrls(cdp, origin);
      } catch (err) {
        row.error = String(err?.message || err);
      }
      rows.push(row);
      console.error(
        `[fresh-load-census] load ${i}: crossFrameUsedMB=${row.crossFrameUsedMB} `
        + `perfMemoryMB=${row.perfMemoryMB} docs=${row.documents} frames=${row.frames} `
        + `nodes=${row.nodes} listeners=${row.listeners} readyMs=${row.readyMs}`
        + (row.error ? ` ERROR ${row.error}` : ''),
      );
      await page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const ok = rows.filter((r) => !r.error && r.crossFrameUsedMB != null);
  const byDocs = [...ok].sort((a, b) => a.documents - b.documents);
  return {
    signature: 'FRESH-LOAD-CENSUS-V1',
    protocol: {
      url,
      loads,
      settleMs,
      consoleAttached: false,
      forcedGc: false,
      crossFrameMetric: 'Performance.getMetrics JSHeapUsedSize (Performance Monitor figure)',
      secondGauge: 'performance.memory.usedJSHeapSize, reported alongside, never instead',
    },
    loads: rows,
    summary: {
      crossFrameUsedMB: describeSpread(ok.map((r) => r.crossFrameUsedMB)),
      perfMemoryMB: describeSpread(ok.map((r) => r.perfMemoryMB)),
      documents: describeSpread(ok.map((r) => r.documents)),
      nodes: describeSpread(ok.map((r) => r.nodes)),
      listeners: describeSpread(ok.map((r) => r.listeners)),
      readyMs: describeSpread(ok.map((r) => r.readyMs)),
      failures: rows.filter((r) => r.error).length,
    },
    frameDiffLowestVsHighestDocuments: byDocs.length >= 2
      ? diffFrameLists(byDocs[0].frameUrls, byDocs[byDocs.length - 1].frameUrls)
      : null,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runFreshLoadCensus(opts);
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
  console.error(`[fresh-load-census] summary ${JSON.stringify(report.summary)}`);
}
