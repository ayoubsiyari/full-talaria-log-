/**
 * PROCESS-MEMORY-CENSUS-V1 — the whole tab, not the JS heap.
 *
 * WHAT THIS INSTRUMENT CAN SEE (stated first, per the 10:00 standing requirement):
 *   - every Chrome process, its type, and its OS memory footprint: 100% of the
 *     browser's process-level cost, which is what Task Manager's rows show
 *   - inside each process, the allocator composition from Chrome's own
 *     memory-infra dumps: malloc, PartitionAlloc, Blink GC (Oilpan, where DOM
 *     nodes live), V8, Skia, cc tiles, GPU textures and shared images, the web
 *     cache, discardable memory
 *   - the JS heap of the page's renderer, so the fraction every previous
 *     instrument could see is reported explicitly as a ratio
 * WHAT IT CANNOT SEE:
 *   - memory the OS attributes to the GPU driver outside Chrome's processes
 *   - anything in other browser profiles or extensions not launched here
 *   - it runs HEADED because a headless GPU process is not representative; it is
 *     still not the PO's machine, so absolute GPU figures are indicative and the
 *     per-configuration DELTA is the trustworthy part
 *
 * SETTLE PROTOCOL: fresh profile, login-then-seed boot, wait for chart data,
 * fixed settle, then one process census + one detailed memory dump per arm.
 *
 * Usage: node scripts/process-memory-census.mjs --out=x.json [--heaviest=16]
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
  applyDistV9LayoutViaUi,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';
const MB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Task Manager's "Memory footprint" column tracks private, not working set. */
export async function readOsFootprints(pids) {
  if (!pids.length) return {};
  const { stdout } = await execFileAsync('powershell', [
    '-NoProfile', '-Command',
    `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue `
    + '| Select-Object Id,PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress',
  ], { maxBuffer: 8 * 1024 * 1024 });
  let parsed;
  try { parsed = JSON.parse(stdout.trim() || '[]'); } catch (_) { return {}; }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out = {};
  for (const r of rows) {
    out[r.Id] = {
      privateMB: +(Number(r.PrivateMemorySize64) / MB).toFixed(2),
      workingSetMB: +(Number(r.WorkingSet64) / MB).toFixed(2),
    };
  }
  return out;
}

/**
 * Reduce a memory-infra dump to top-level allocator totals.
 * Only names without a '/' are kept: those are the roots that already total
 * their children, so nothing is double counted.
 */
export function summariseAllocators(allocators) {
  const out = {};
  for (const [name, node] of Object.entries(allocators || {})) {
    if (name.includes('/')) continue;
    const raw = node?.attrs?.size?.value;
    if (raw == null) continue;
    const bytes = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw);
    if (!Number.isFinite(bytes)) continue;
    out[name] = +(bytes / MB).toFixed(2);
  }
  return out;
}

/** Collect one detailed memory dump for every process, via the browser session. */
export async function collectMemoryDump(browserCdp) {
  const events = [];
  const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  browserCdp.on('Tracing.dataCollected', onData);
  const complete = new Promise((resolve) => browserCdp.once('Tracing.tracingComplete', resolve));
  await browserCdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: ['disabled-by-default-memory-infra'],
      memoryDumpConfig: {},
    },
  });
  await sleep(500);
  await browserCdp.send('Tracing.requestMemoryDump', {
    deterministic: true,
    levelOfDetail: 'detailed',
  });
  await sleep(1500);
  await browserCdp.send('Tracing.end');
  await complete;
  browserCdp.off('Tracing.dataCollected', onData);

  const byPid = new Map();
  for (const e of events) {
    if (e.ph !== 'v' || !e.args?.dumps) continue;
    const allocators = e.args.dumps.allocators;
    if (!allocators) continue;
    // Keep the last dump per process: the detailed one.
    byPid.set(e.pid, summariseAllocators(allocators));
  }
  return byPid;
}

/** The point of the whole exercise: say what fraction of the tab a gauge sees. */
export function describeVisibility({ jsHeapMB, rendererMB, gpuMB, totalMB }) {
  const pct = (a, b) => (b > 0 ? +((a / b) * 100).toFixed(1) : null);
  return {
    jsHeapMB,
    rendererMB,
    gpuMB,
    totalChromeMB: totalMB,
    jsHeapAsPercentOfRenderer: pct(jsHeapMB, rendererMB),
    jsHeapAsPercentOfRendererPlusGpu: pct(jsHeapMB, rendererMB + gpuMB),
    jsHeapAsPercentOfAllChrome: pct(jsHeapMB, totalMB),
    nonJsRendererMB: +(rendererMB - jsHeapMB).toFixed(2),
  };
}

async function censusArm({
  label, browser, browserCdp, pageCdp, page,
}) {
  const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const processInfo = info.processInfo || [];
  const footprints = await readOsFootprints(processInfo.map((p) => p.id)).catch(() => ({}));
  const dumps = await collectMemoryDump(browserCdp).catch((e) => {
    console.error(`[process-census] memory dump failed: ${e?.message || e}`);
    return new Map();
  });

  const { metrics } = await pageCdp.send('Performance.getMetrics');
  const g = (n) => { const r = metrics.find((m) => m.name === n); return r ? Number(r.value) : null; };
  const jsHeapMB = g('JSHeapUsedSize') != null ? +(g('JSHeapUsedSize') / MB).toFixed(2) : null;

  const pageState = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    canvases: [...document.querySelectorAll('canvas')].map((c) => ({
      w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width),
      cssH: Math.round(c.getBoundingClientRect().height),
      backingMB: +((c.width * c.height * 4) / 1048576).toFixed(2),
    })),
    elements: document.querySelectorAll('*').length,
    residentBars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null,
  })).catch(() => ({}));
  // Panel frames own their own canvases; count them too.
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    const got = await f.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => ({
      w: c.width, h: c.height, backingMB: +((c.width * c.height * 4) / 1048576).toFixed(2),
    }))).catch(() => null);
    if (got) (pageState.panelCanvases ||= []).push(...got);
  }

  const rows = processInfo.map((p) => ({
    pid: p.id,
    type: p.type,
    ...(footprints[p.id] || {}),
    allocators: dumps.get(p.id) || null,
  }));
  const renderers = rows.filter((r) => /renderer/i.test(r.type));
  const gpu = rows.find((r) => /gpu/i.test(r.type)) || null;
  // The page's own renderer is the biggest one; spare renderers sit near-empty.
  const pageRenderer = [...renderers].sort((a, b) => (b.privateMB || 0) - (a.privateMB || 0))[0] || null;
  const totalMB = +rows.reduce((a, r) => a + (r.privateMB || 0), 0).toFixed(2);

  const arm = {
    label,
    rendererRowCount: renderers.length,
    processes: rows.map((r) => ({
      pid: r.pid, type: r.type, privateMB: r.privateMB, workingSetMB: r.workingSetMB,
    })),
    pageRenderer: pageRenderer
      ? { pid: pageRenderer.pid, privateMB: pageRenderer.privateMB, allocators: pageRenderer.allocators }
      : null,
    gpuProcess: gpu ? { pid: gpu.pid, privateMB: gpu.privateMB, allocators: gpu.allocators } : null,
    jsHeapMB,
    pageState,
    visibility: describeVisibility({
      jsHeapMB: jsHeapMB || 0,
      rendererMB: pageRenderer?.privateMB || 0,
      gpuMB: gpu?.privateMB || 0,
      totalMB,
    }),
  };
  console.error(
    `[process-census] ${label}: renderers=${arm.rendererRowCount} `
    + `pageRenderer=${pageRenderer?.privateMB}MB gpu=${gpu?.privateMB}MB jsHeap=${jsHeapMB}MB `
    + `jsAsPctOfRenderer=${arm.visibility.jsHeapAsPercentOfRenderer}% `
    + `jsAsPctOfAllChrome=${arm.visibility.jsHeapAsPercentOfAllChrome}%`,
  );
  return arm;
}

function parseArgs(argv) {
  const o = { out: null, heaviest: null, settleMs: 12_000 };
  for (const a of argv) {
    if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--heaviest=')) o.heaviest = Number(a.split('=')[1]) || null;
    else if (a.startsWith('--settle-ms=')) o.settleMs = Number(a.split('=')[1]) || 12_000;
  }
  return o;
}

export async function runProcessMemoryCensus(opts = {}) {
  const { heaviest = null, settleMs = 12_000, outPath = null } = opts;
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('census requires TEST_EMAIL and TEST_PASSWORD');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    // Headed: a headless GPU process is not representative of the PO's 263 MB.
    headless: false,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
    defaultViewport: null,
  });
  const arms = [];
  const save = (extra = {}) => {
    if (outPath) fs.writeFileSync(outPath, JSON.stringify({ partial: true, arms, ...extra }, null, 1));
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
          session_id: `process-census-${Date.now()}`,
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
    await sleep(settleMs);
    const pageCdp = await page.createCDPSession();
    await pageCdp.send('Performance.enable');

    arms.push(await censusArm({
      label: 'single-chart', browser, browserCdp, pageCdp, page,
    }));
    save();

    // Which layouts does this build actually offer? Ask, do not assume 15 exists.
    const offered = await page.evaluate(() => {
      const btn = document.querySelector('[data-v9-utility="layout"]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      return new Promise((resolve) => setTimeout(() => {
        const labels = [...document.querySelectorAll('div')]
          .filter((el) => el.childElementCount === 0 && /^\d+$/.test(String(el.textContent || '').trim()))
          .map((el) => Number(String(el.textContent).trim()))
          .filter((n) => n >= 1 && n <= 32);
        resolve([...new Set(labels)].sort((a, b) => a - b));
      }, 1200));
    }).catch(() => []);
    console.error(`[process-census] layouts offered: ${offered.join(',') || 'none found'}`);
    const target = heaviest || (offered.length ? offered[offered.length - 1] : 4);

    try {
      await applyDistV9LayoutViaUi(page, target, 0);
      await sleep(settleMs * 2);
      arms.push(await censusArm({
        label: `heaviest-layout-${target}`, browser, browserCdp, pageCdp, page,
      }));
    } catch (error) {
      arms.push({ label: `heaviest-layout-${target}`, error: String(error?.message || error) });
    }
    save({ layoutsOffered: offered, heaviestAttempted: target });

    return {
      signature: 'PROCESS-MEMORY-CENSUS-V1',
      scope: {
        canSee: 'all Chrome process footprints (OS private bytes) and their internal allocator composition, plus the page renderer JS heap',
        cannotSee: 'GPU driver allocations outside Chrome processes; other profiles; this is not the PO\'s machine so absolute GPU figures are indicative',
        headed: true,
      },
      layoutsOffered: offered,
      arms,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && /process-memory-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  const report = await runProcessMemoryCensus({ ...opts, outPath: opts.out });
  const json = JSON.stringify(report, null, 1);
  if (opts.out) fs.writeFileSync(opts.out, json);
  else console.log(json);
}
