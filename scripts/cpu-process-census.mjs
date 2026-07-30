/**
 * CPU-PROCESS-CENSUS-V1 — split the renderer's CPU into main thread, compositor,
 * raster and GPU, across processes.
 *
 * "186%" is not aimable. Whether the off-thread majority is RASTER (tile workers
 * painting), COMPOSITING (layer work) or JAVASCRIPT decides whether the fix is
 * fewer DOM nodes, fewer canvas surfaces or less script.
 *
 * WHAT THIS INSTRUMENT CAN SEE:
 *   - process-level ground truth: SystemInfo.getProcessInfo cpuTime sampled twice
 *     across a fixed window, so every Chrome process gets a CPU% independent of
 *     any tracing category choice
 *   - thread-level attribution inside those processes from a browser-wide trace,
 *     by MERGED BUSY COVERAGE per thread (overlapping slices counted once) and by
 *     SELF time per event name, so a wrapper slice cannot absorb its children
 *   - both numbers side by side: if the trace buckets do not add up to the
 *     process-level figure, the shortfall is reported rather than hidden
 * WHAT IT CANNOT SEE:
 *   - work the enabled categories do not instrument; the process-level figure is
 *     the check on that
 *   - the PO's machine: this is a different core count, so treat the SHARES as
 *     the finding and the absolute percentages as indicative
 *
 * SETTLE PROTOCOL: boot, arm the workload, let it run 5s, then trace a fixed
 * 10s window with no interaction inside it.
 */
import fs from 'node:fs';

import {
  applyDistV9LayoutViaUi,
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { summarizeTraceThreadCpu } from './lib/cpu-thread-census.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACE_CATEGORIES = [
  'toplevel',
  'cc',
  'gpu',
  'viz',
  'blink',
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
];

/** Which lever a thread's time belongs to. The bucket IS the recommendation. */
export function bucketThreadRole({ threadName, processName }) {
  const t = String(threadName || '');
  const p = String(processName || '');
  const inGpu = /GPU Process|Gpu/i.test(p);
  const inBrowser = /Browser/i.test(p);
  if (/^CrRendererMain$/.test(t)) return 'renderer-main-js-and-layout';
  if (/^Compositor$/.test(t)) return 'renderer-compositor';
  if (/^CompositorTileWorker/.test(t)) return 'renderer-raster';
  if (/^ThreadPool/.test(t)) return 'renderer-threadpool';
  if (/^CrGpuMain$/.test(t)) return 'gpu-process-main';
  if (/^VizCompositor/.test(t)) return 'gpu-viz-compositor';
  if (/^CrBrowserMain$/.test(t) || inBrowser) return 'browser';
  if (inGpu) return 'gpu-other';
  if (/^CrRendererMain|Renderer/i.test(p)) return 'renderer-other';
  return 'other';
}

/** Aggregate per-thread busy time into roles, as a share of one core. */
export function summariseCpuByRole(threads, wallMs) {
  const roles = new Map();
  for (const th of threads || []) {
    if (th.waitDominated) continue;
    const role = bucketThreadRole(th);
    const prev = roles.get(role) || { role, busyMs: 0, threads: 0, topEvents: [] };
    prev.busyMs += th.busyMs || 0;
    prev.threads += 1;
    for (const e of th.topEvents || []) prev.topEvents.push({ name: e.name, selfMs: e.selfMs });
    roles.set(role, prev);
  }
  const totalBusy = [...roles.values()].reduce((a, r) => a + r.busyMs, 0);
  const rows = [...roles.values()].map((r) => {
    const merged = new Map();
    for (const e of r.topEvents) merged.set(e.name, (merged.get(e.name) || 0) + e.selfMs);
    return {
      role: r.role,
      threads: r.threads,
      busyMs: +r.busyMs.toFixed(1),
      percentOfCore: wallMs > 0 ? +((r.busyMs / wallMs) * 100).toFixed(1) : null,
      shareOfTotal: totalBusy > 0 ? +((r.busyMs / totalBusy) * 100).toFixed(1) : null,
      topEvents: [...merged.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, selfMs]) => ({ name, selfMs: +selfMs.toFixed(1) })),
    };
  }).sort((a, b) => b.busyMs - a.busyMs);
  return {
    roles: rows,
    totalPercentOfCore: wallMs > 0 ? +((totalBusy / wallMs) * 100).toFixed(1) : null,
  };
}

async function processCpuSample(browserCdp) {
  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const map = new Map();
  for (const p of info.processInfo || []) map.set(p.id, { type: p.type, cpuTime: Number(p.cpuTime) });
  return map;
}

/** Ground truth: CPU% per process from cpuTime deltas over the same window. */
export function diffProcessCpu(before, after, wallMs) {
  const rows = [];
  for (const [pid, a] of after) {
    const b = before.get(pid);
    if (!b) continue;
    const deltaSec = a.cpuTime - b.cpuTime;
    if (!Number.isFinite(deltaSec)) continue;
    rows.push({
      pid,
      type: a.type,
      cpuPercentOfCore: wallMs > 0 ? +((deltaSec * 1000 / wallMs) * 100).toFixed(1) : null,
    });
  }
  rows.sort((x, y) => (y.cpuPercentOfCore || 0) - (x.cpuPercentOfCore || 0));
  const total = rows.reduce((s, r) => s + (r.cpuPercentOfCore || 0), 0);
  return { perProcess: rows, totalPercentOfCore: +total.toFixed(1) };
}

async function armReplayEverywhere(page, speed = 60) {
  const out = [];
  for (const f of page.frames()) {
    const got = await f.evaluate((s) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return { ok: false, reason: 'no replaySystem' };
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        return { ok: !!rs.isPlaying, active: !!rs.isActive };
      } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
    }, speed).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
    out.push(got);
  }
  return out;
}

async function traceArm({
  label, page, browserCdp, windowMs = 10_000,
}) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  const before = await processCpuSample(browserCdp);
  const startedAt = Date.now();
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: TRACE_CATEGORIES },
  });
  await sleep(windowMs);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);
  const wallMs = Date.now() - startedAt;
  const after = await processCpuSample(browserCdp);

  const census = summarizeTraceThreadCpu(events, { wallMs, topEventsPerThread: 8 });
  const byRole = summariseCpuByRole(census.threads, wallMs);
  const processCpu = diffProcessCpu(before, after, wallMs);
  const pageState = await page.evaluate(() => ({
    elements: document.querySelectorAll('*').length,
    canvases: document.querySelectorAll('canvas').length,
    replayPlaying: !!(window.chart && window.chart.replaySystem && window.chart.replaySystem.isPlaying),
    residentBars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null,
  })).catch(() => ({}));

  const arm = {
    label,
    wallMs,
    traceEventCount: events.length,
    processCpu,
    byRole,
    traceTotalPercentOfCore: census.totalCpuPercent,
    mainThreadPercent: census.mainThreadPercent,
    waitDominatedExcluded: census.waitDominatedThreads,
    pageState,
  };
  console.error(
    `[cpu-census] ${label}: processTotal=${processCpu.totalPercentOfCore}% `
    + `traceTotal=${census.totalCpuPercent}% roles=`
    + arm.byRole.roles.map((r) => `${r.role}:${r.percentOfCore}%`).join(' '),
  );
  return arm;
}

function parseArgs(argv) {
  const o = { out: null, windowMs: 10_000, panels: 4 };
  for (const a of argv) {
    if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--window-ms=')) o.windowMs = Number(a.split('=')[1]) || 10_000;
    else if (a.startsWith('--panels=')) o.panels = Number(a.split('=')[1]) || 4;
  }
  return o;
}

export async function runCpuProcessCensus({ windowMs = 10_000, panels = 4, outPath = null } = {}) {
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('census requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    // Headed: raster and the GPU process are the subject, and headless changes both.
    headless: false,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
  });
  const arms = [];
  const save = () => {
    if (outPath) fs.writeFileSync(outPath, JSON.stringify({ partial: true, arms }, null, 1));
  };
  try {
    const browserCdp = await browser.target().createCDPSession();
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await uiLoginDeployed(page, origin, email, password);
    await page.evaluate(() => {
      localStorage.setItem('_uid', '1');
      if (!localStorage.getItem('u1_backtestingSession')) {
        localStorage.setItem('u1_backtestingSession', JSON.stringify({
          type: 'standard',
          startBalance: 10000,
          session_id: `cpu-census-${Date.now()}`,
          instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
        }));
      }
    });
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page);
    await waitForDistV9SingleReady(page, 180_000);
    await sleep(8_000);

    arms.push(await traceArm({ label: 'single-chart-idle', page, browserCdp, windowMs }));
    save();

    const armed1 = await armReplayEverywhere(page, 60);
    console.error(`[cpu-census] single-chart replay armed: ${JSON.stringify(armed1)}`);
    await sleep(5_000);
    arms.push(await traceArm({ label: 'single-chart-replay-60x', page, browserCdp, windowMs }));
    save();

    try {
      await applyDistV9LayoutViaUi(page, panels, 0);
      await sleep(15_000);
      const armed2 = await armReplayEverywhere(page, 60);
      console.error(`[cpu-census] ${panels}-panel replay armed: ${JSON.stringify(armed2)}`);
      await sleep(5_000);
      arms.push(await traceArm({ label: `${panels}-panel-replay-60x`, page, browserCdp, windowMs }));
    } catch (error) {
      arms.push({ label: `${panels}-panel-replay-60x`, error: String(error?.message || error) });
    }
    save();

    return {
      signature: 'CPU-PROCESS-CENSUS-V1',
      scope: {
        canSee: 'CPU% per Chrome process from cpuTime deltas (category-independent), plus per-thread busy coverage and per-event self time inside those processes',
        cannotSee: 'work not covered by the enabled trace categories — the process-level figure is the check on that; and not the PO\'s core count, so shares travel and absolute percentages do not',
        headed: true,
      },
      arms,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && /cpu-process-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runCpuProcessCensus({ ...opts, outPath: opts.out });
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
}
