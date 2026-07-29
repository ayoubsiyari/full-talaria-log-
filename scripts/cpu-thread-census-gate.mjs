#!/usr/bin/env node
/**
 * CPU-THREAD-CENSUS-V1 gate — measure the single-chart replay CPU ceiling on the
 * surface the PO measured, across ALL threads.
 *
 * The PO reports ~111% of a core for a single chart at 60x. Above 100% cannot be
 * main-thread JavaScript, so the existing callback/rAF probe (which only samples
 * CrRendererMain, and reads ~7% on the hermetic harness) structurally cannot
 * account for it. This drives the deployed product, traces every thread, and
 * reports a total that is allowed to exceed one core.
 *
 * Usage:
 *   node scripts/cpu-thread-census-gate.mjs --json [--speed=60] [--observe-ms=10000]
 *                                           [--surface=deployed] [--panels=1]
 * Requires TEST_EMAIL / TEST_PASSWORD (+ optional TEST_VPS_URL) for deployed.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  assessCpuCeiling,
  CPU_THREAD_CENSUS_CATEGORIES,
  CPU_THREAD_CENSUS_SIGNATURE,
  summarizeTraceThreadCpu,
} from './lib/cpu-thread-census.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';

const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(...args) {
  console.error(`[cpu-thread-census ${new Date().toISOString()}]`, ...args);
}

export function parseCpuThreadCensusArgs(argv = []) {
  const options = {
    json: false,
    speed: 60,
    observeMs: 10_000,
    claimedPercent: 111,
    outPath: null,
    idle: false,
  };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--idle') options.idle = true;
    else if (arg.startsWith('--speed=')) options.speed = Number(arg.slice('--speed='.length));
    else if (arg.startsWith('--observe-ms=')) options.observeMs = Number(arg.slice('--observe-ms='.length));
    else if (arg.startsWith('--claimed-percent=')) options.claimedPercent = Number(arg.slice('--claimed-percent='.length));
    else if (arg.startsWith('--out=')) options.outPath = path.resolve(arg.slice('--out='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/** Enter replay at the requested speed and start playing, on the host chart. */
async function armSingleChartReplay(page, speed) {
  return page.evaluate(async (spd) => {
    const sleepLocal = (ms) => new Promise((r) => setTimeout(r, ms));
    try { window.alert = () => {}; } catch (_) {}
    const chart = window.chart;
    if (!chart) return { ok: false, reason: 'no chart' };
    const rs = chart.replaySystem;
    if (!rs) return { ok: false, reason: 'no replaySystem' };
    try {
      if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
        rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
      }
      if (typeof rs.setSpeed === 'function') rs.setSpeed(spd);
      else if (rs.speed != null) rs.speed = spd;
      if (typeof rs.goToReplayTimestamp === 'function'
        && Array.isArray(chart.data) && chart.data.length > 50) {
        const mid = chart.data[Math.floor(chart.data.length * 0.2)];
        if (mid && mid.t != null) rs.goToReplayTimestamp(Number(mid.t));
      }
      if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
      else if (!rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
      const started = Date.now();
      while (Date.now() - started < 5000) {
        if (rs.isPlaying) break;
        await sleepLocal(50);
      }
      return {
        ok: !!rs.isPlaying,
        isActive: !!rs.isActive,
        isPlaying: !!rs.isPlaying,
        speed: rs.speed ?? spd,
        bars: Array.isArray(chart.data) ? chart.data.length : 0,
      };
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  }, speed);
}

/** Collect a Chrome trace over the observation window. */
async function traceWindow(page, { observeMs }) {
  const cdp = await page.createCDPSession();
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => {
    if (Array.isArray(value)) events.push(...value);
  });
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    categories: CPU_THREAD_CENSUS_CATEGORIES.join(','),
    options: 'sampling-frequency=10000',
  });
  const startedAt = Date.now();
  await sleep(observeMs);
  const wallMs = Date.now() - startedAt;
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach().catch(() => {});
  return { events, wallMs };
}

export async function runCpuThreadCensusGate({
  speed = 60,
  observeMs = 10_000,
  claimedPercent = 111,
  idle = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  if (!email || !password) {
    throw new Error('deployed surface requires TEST_EMAIL and TEST_PASSWORD');
  }

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    log(`login ${origin}`);
    // Login on the deployed box can stall behind the cookie notice; report where.
    const watchdog = setInterval(() => {
      page.evaluate(() => ({
        url: location.href,
        title: document.title,
        hasEmail: !!document.querySelector('#email'),
        ready: document.readyState,
      })).then((s) => log(`watchdog ${JSON.stringify(s)}`)).catch((e) => log(`watchdog eval failed: ${e?.message}`));
    }, 15_000);
    try {
      await uiLoginDeployed(page, origin, email, password);
    } finally {
      clearInterval(watchdog);
    }
    // Required: mode=backtest loads no bars without a seeded session, and the
    // chart then never becomes ready.
    await page.evaluate(() => {
      try {
        localStorage.setItem('_uid', '1');
        const prev = localStorage.getItem('u1_backtestingSession');
        if (!prev) {
          localStorage.setItem('u1_backtestingSession', JSON.stringify({
            type: 'standard',
            startBalance: 10000,
            session_id: `deployed-cpu-${Date.now()}`,
            instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
          }));
        }
      } catch (_) {}
    });

    // Same surface the heap gate drives, pinned to a single panel.
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await dismissCookieBanner(page);
      await uiLoginDeployed(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await dismissCookieBanner(page);
    await waitForDistV9SingleReady(page, 180_000);
    const buildId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null)
      .catch(() => null);
    log(`chart ready build=${buildId}`);

    let replay = { ok: false, skipped: idle };
    if (!idle) {
      replay = await armSingleChartReplay(page, speed);
      log(`replay armed ok=${replay.ok} playing=${replay.isPlaying} speed=${replay.speed} bars=${replay.bars}`);
      if (!replay.ok) {
        throw new Error(`single-chart replay not playing (${replay.reason || 'unknown'}) — cannot measure the ceiling`);
      }
      // Let the replay reach steady state before tracing.
      await sleep(3_000);
    } else {
      log('idle mode: no replay, measuring the floor');
      await sleep(3_000);
    }

    log(`tracing ${observeMs}ms across all threads`);
    const { events, wallMs } = await traceWindow(page, { observeMs });
    log(`trace events=${events.length} wallMs=${wallMs}`);

    const census = summarizeTraceThreadCpu(events, { wallMs });
    const ceiling = assessCpuCeiling(census, { claimedPercent });
    const stillPlaying = idle ? null : await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return rs ? { isPlaying: !!rs.isPlaying, speed: rs.speed ?? null } : null;
    }).catch(() => null);

    return {
      signature: CPU_THREAD_CENSUS_SIGNATURE,
      ok: ceiling.verdict !== 'NO-DATA',
      status: ceiling.reproducesCeiling ? 'CEILING-REPRODUCED' : ceiling.verdict,
      startedAt,
      finishedAt: new Date().toISOString(),
      meta: {
        surface: 'deployed',
        origin,
        url,
        buildId,
        panels: 1,
        speed: idle ? 0 : speed,
        idle,
        observeMs,
        wallMs,
        traceCategories: CPU_THREAD_CENSUS_CATEGORIES.slice(),
        traceEventCount: events.length,
      },
      replay,
      stillPlayingAfterTrace: stillPlaying,
      ceiling,
      census: {
        ...census,
        // Keep the top threads only; the full list is long and mostly idle.
        threads: census.threads.slice(0, 15),
        threadCountTotal: census.threadCount,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const options = parseCpuThreadCensusArgs(process.argv.slice(2));
  let report;
  try {
    report = await runCpuThreadCensusGate(options);
  } catch (error) {
    report = {
      signature: CPU_THREAD_CENSUS_SIGNATURE,
      ok: false,
      status: 'ERROR',
      error: String(error?.message || error),
    };
  }
  if (options.outPath) fs.writeFileSync(options.outPath, JSON.stringify(report, null, 2));
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`${report.signature} status=${report.status} ok=${report.ok}`);
    if (report.census) {
      console.log(`total=${report.census.totalCpuPercent}% main=${report.census.mainThreadPercent}%`);
      for (const t of report.census.threads || []) {
        console.log(`  ${String(t.threadName || `tid${t.tid}`).padEnd(28)} ${String(t.busyMs).padStart(10)}ms ${((t.ratioOfCore || 0) * 100).toFixed(1)}%`);
      }
    }
    if (report.error) console.log(`error: ${report.error}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('cpu-thread-census-gate.mjs')) {
  main();
}
