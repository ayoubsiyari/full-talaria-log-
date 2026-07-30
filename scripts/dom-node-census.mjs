/**
 * DOM-NODE-CENSUS-V1 — what the fifty-one thousand nodes ARE, and what they scale with.
 *
 * Cheap counters only. No heap snapshots: this instrument answers composition and
 * scaling from the DOM itself, and attribution by snapshot is a separate step.
 *
 * INSTRUMENT
 *   - element census in-page: every element grouped by tag, by tag+class
 *     signature, and by ancestor-path signature, plus the highest-fan-out parents
 *     with their subtree sizes. A loop emitting one element per bar or per tick
 *     shows up as a parent with thousands of same-signature children.
 *   - node totals split three ways (elements / text / comments / all nodes),
 *     because Performance Monitor's "Nodes" counts text and comment nodes and
 *     document.querySelectorAll('*') does not. The PO's 51,303 is the former.
 *   - Performance.getMetrics read at the same instant for Nodes / Documents /
 *     Frames / JSEventListeners, so the census reconciles against the PO's gauge.
 *   - resident bar count is chart.data.length, read in the same evaluate.
 *
 * SETTLE PROTOCOL
 *   fresh page, harness boot, wait for chart data, fixed settle, then census.
 *   Idle-growth arm takes three censuses across 60s of replay with NO
 *   interaction between them: growth there is a leak, flatness is a design cost.
 *
 * Usage:
 *   node scripts/dom-node-census.mjs --out=census.json [--panels=4] [--replay-seconds=60]
 */
import fs from 'node:fs';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
  applyDistV9LayoutViaUi,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rank groups descending by count and keep the head, so reports stay readable. */
export function topGroups(counts, limit = 12) {
  const rows = counts instanceof Map ? [...counts.entries()] : Object.entries(counts || {});
  return rows
    .map(([key, value]) => (typeof value === 'number' ? { key, count: value } : { key, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Does a series grow while nothing is being done to it?
 * A leak grows monotonically across idle samples; a design cost stays flat.
 */
export function classifyIdleSeries(series, { tolerance = 50 } = {}) {
  const xs = (series || []).filter((v) => Number.isFinite(v));
  if (xs.length < 2) return { verdict: 'INSUFFICIENT', n: xs.length };
  const delta = xs[xs.length - 1] - xs[0];
  const monotonic = xs.every((v, i) => i === 0 || v >= xs[i - 1] - tolerance);
  let verdict;
  if (delta > tolerance && monotonic) verdict = 'GROWING-WHILE-IDLE (leak-shaped)';
  else if (Math.abs(delta) <= tolerance) verdict = 'FLAT (design cost)';
  else if (delta > tolerance) verdict = 'RISING-NON-MONOTONIC';
  else verdict = 'FALLING';
  return {
    verdict, n: xs.length, first: xs[0], last: xs[xs.length - 1], delta, tolerance, monotonic,
  };
}

/** The in-page census. Runs in the host frame; panel frames are censused separately. */
/* c8 ignore start — executes in the browser */
const CENSUS_FN = () => {
  const all = document.querySelectorAll('*');
  const norm = (cls) => String(cls || '')
    .split(/\s+/)
    .filter(Boolean)
    // Collapse per-instance suffixes so 1,000 copies of one component group as one.
    .map((c) => c.replace(/\d{2,}/g, '#').replace(/^([a-zA-Z-]+)__[a-zA-Z0-9_-]{6,}$/, '$1__hash'))
    .slice(0, 3)
    .join('.');
  const sig = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = norm(el.getAttribute && el.getAttribute('class'));
    return cls ? `${tag}.${cls}` : tag;
  };
  const pathSig = (el, depth = 6) => {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement && parts.length < depth) {
      parts.unshift(sig(cur));
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const byTag = new Map();
  const bySig = new Map();
  const byPath = new Map();
  const fanout = new Map();
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    byTag.set(tag, (byTag.get(tag) || 0) + 1);
    const s = sig(el);
    bySig.set(s, (bySig.get(s) || 0) + 1);
    const p = pathSig(el);
    byPath.set(p, (byPath.get(p) || 0) + 1);
    const n = el.childElementCount;
    if (n >= 50) fanout.set(el, n);
  }

  // Single pass for subtree sizes of the high-fan-out parents only.
  const subtreeSize = (el) => el.querySelectorAll('*').length;
  const topFanout = [...fanout.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([el, childCount]) => {
      const kids = [...el.children];
      const kidSigs = new Map();
      for (const k of kids) kidSigs.set(sig(k), (kidSigs.get(sig(k)) || 0) + 1);
      const modal = [...kidSigs.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
      return {
        path: pathSig(el, 8),
        childCount,
        subtreeElements: subtreeSize(el),
        modalChildSignature: modal[0],
        modalChildCount: modal[1],
        distinctChildSignatures: kidSigs.size,
      };
    });

  let textNodes = 0;
  let commentNodes = 0;
  const walker = document.createTreeWalker(
    document, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT, null,
  );
  while (walker.nextNode()) {
    if (walker.currentNode.nodeType === Node.TEXT_NODE) textNodes += 1;
    else commentNodes += 1;
  }

  const chart = window.chart;
  const rs = chart && chart.replaySystem;
  const chartApi = chart
    ? Object.keys(chart).filter((k) => /zoom|visible|range|scroll|view|bars|candle/i.test(k)).slice(0, 40)
    : [];
  const chartProto = chart
    ? Object.getOwnPropertyNames(Object.getPrototypeOf(chart) || {})
      .filter((k) => /zoom|visible|range|scroll|view|bars/i.test(k)).slice(0, 40)
    : [];

  return {
    totals: {
      elements: all.length,
      textNodes,
      commentNodes,
      allNodes: all.length + textNodes + commentNodes + 1,
      canvases: document.querySelectorAll('canvas').length,
      svgs: document.querySelectorAll('svg').length,
      iframes: document.querySelectorAll('iframe').length,
      styleSheets: document.styleSheets ? document.styleSheets.length : null,
    },
    byTag: [...byTag.entries()].map(([key, count]) => ({ key, count })),
    bySignature: [...bySig.entries()].map(([key, count]) => ({ key, count })),
    byPath: [...byPath.entries()].map(([key, count]) => ({ key, count })),
    topFanout,
    chartState: {
      residentBars: chart && Array.isArray(chart.data) ? chart.data.length : null,
      replayActive: !!(rs && rs.isActive),
      replayPlaying: !!(rs && rs.isPlaying),
      replayIndex: rs && rs.currentIndex != null ? rs.currentIndex : null,
      indicatorCount: chart && chart.indicators && Array.isArray(chart.indicators.active)
        ? chart.indicators.active.length : null,
      candidateZoomApi: [...new Set([...chartApi, ...chartProto])],
    },
  };
};
/* c8 ignore stop */

async function readMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
  return {
    perfMonitorNodes: g('Nodes'),
    documents: g('Documents'),
    frames: g('Frames'),
    listeners: g('JSEventListeners'),
    crossFrameUsedMB: g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / 1048576).toFixed(2) : null,
  };
}

async function censusEverywhere(page, cdp, label) {
  const host = await page.evaluate(CENSUS_FN);
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  const panels = [];
  for (const f of frames) {
    const got = await f.evaluate(CENSUS_FN).catch(() => null);
    if (got) panels.push({ url: String(f.url()).slice(-60), totals: got.totals, residentBars: got.chartState.residentBars });
  }
  const metrics = await readMetrics(cdp);
  const elementsAllFrames = host.totals.elements + panels.reduce((a, p) => a + p.totals.elements, 0);
  const row = {
    label,
    metrics,
    hostTotals: host.totals,
    panelFrames: panels,
    elementsAllFrames,
    byTag: topGroups(host.byTag, 12),
    bySignature: topGroups(host.bySignature, 12),
    byPath: topGroups(host.byPath, 12),
    topFanout: host.topFanout,
    chartState: host.chartState,
  };
  console.error(
    `[dom-census] ${label}: elements(host)=${host.totals.elements} elements(all frames)=${elementsAllFrames} `
    + `perfMonitorNodes=${metrics.perfMonitorNodes} docs=${metrics.documents} frames=${metrics.frames} `
    + `listeners=${metrics.listeners} residentBars=${host.chartState.residentBars} `
    + `replay=${host.chartState.replayPlaying ? 'playing' : 'idle'}`,
  );
  return row;
}

function parseArgs(argv) {
  const o = { out: null, panels: 4, replaySeconds: 60, settleMs: 10_000 };
  for (const a of argv) {
    if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--panels=')) o.panels = Number(a.split('=')[1]) || 4;
    else if (a.startsWith('--replay-seconds=')) o.replaySeconds = Number(a.split('=')[1]) || 60;
    else if (a.startsWith('--settle-ms=')) o.settleMs = Number(a.split('=')[1]) || 10_000;
  }
  return o;
}

export async function runDomNodeCensus(opts = {}) {
  const {
    panels = 4, replaySeconds = 60, settleMs = 10_000, outPath = null,
  } = opts;
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('deployed census requires TEST_EMAIL and TEST_PASSWORD');
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
    defaultViewport: { width: 1440, height: 960 },
  });
  const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
  const arms = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await page.setCacheEnabled(false);
    // Boot order matters: log in on the app origin FIRST, then seed the session
    // there. Seeding a u1_-prefixed session without _uid leaves the chart with no
    // data and readiness never arrives.
    await uiLoginDeployed(page, origin, email, password);
    await page.evaluate(() => {
      try {
        localStorage.setItem('_uid', '1');
        if (!localStorage.getItem('u1_backtestingSession')) {
          localStorage.setItem('u1_backtestingSession', JSON.stringify({
            type: 'standard',
            startBalance: 10000,
            session_id: `dom-census-${Date.now()}`,
            instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
          }));
        }
      } catch (_) {}
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page);
    await waitForDistV9SingleReady(page, 180_000);
    await sleep(settleMs);
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    // Write after every arm: stdout/stderr redirection is buffered until exit in
    // some shells, so the JSON file is the only live progress signal.
    const record = async (label) => {
      arms.push(await censusEverywhere(page, cdp, label));
      if (outPath) fs.writeFileSync(outPath, JSON.stringify({ partial: true, arms }, null, 1));
    };

    // ARM 1 — fresh single chart, untouched. This is the figure to compare with the PO's.
    await record('fresh-single-chart');

    // ARM 2 — idle replay. No interaction between the three censuses.
    const armed = await page.evaluate((speed) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { ok: false, reason: 'no replaySystem' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.setSpeed === 'function') rs.setSpeed(speed);
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        return { ok: !!rs.isPlaying, active: !!rs.isActive };
      } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
    }, 60).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
    console.error(`[dom-census] replay armed: ${JSON.stringify(armed)}`);
    await record(`replay-t0 (armed=${armed.ok})`);
    await sleep(Math.round((replaySeconds * 1000) / 2));
    await record('replay-t30-idle');
    await sleep(Math.round((replaySeconds * 1000) / 2));
    await record('replay-t60-idle');

    // ARM 3 — four panels, to settle whether 51,303 is one chart or four.
    try {
      await applyDistV9LayoutViaUi(page, panels, 0);
      await sleep(settleMs);
      await record(`layout-${panels}-panels`);
    } catch (error) {
      arms.push({ label: `layout-${panels}-panels`, error: String(error?.message || error) });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const idleSeries = arms
    .filter((a) => /replay-t/.test(a.label || ''))
    .map((a) => a.elementsAllFrames);
  const nodeSeries = arms
    .filter((a) => /replay-t/.test(a.label || ''))
    .map((a) => a.metrics?.perfMonitorNodes);
  return {
    signature: 'DOM-NODE-CENSUS-V1',
    surface: url,
    protocol: {
      settleMs,
      replaySeconds,
      interactionBetweenIdleCensuses: 'none',
      elementMetric: "document.querySelectorAll('*').length, host frame and every panel frame",
      nodeMetric: 'Performance.getMetrics Nodes (counts text and comment nodes too)',
      residentBarsMetric: 'chart.data.length',
    },
    arms,
    idleGrowth: {
      elementsAllFrames: classifyIdleSeries(idleSeries),
      perfMonitorNodes: classifyIdleSeries(nodeSeries),
    },
  };
}

const invokedDirectly = process.argv[1] && /dom-node-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runDomNodeCensus({ ...opts, outPath: opts.out });
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
  console.error(`[dom-census] idle growth: ${JSON.stringify(report.idleGrowth)}`);
}
