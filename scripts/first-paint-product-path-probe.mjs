#!/usr/bin/env node
/**
 * Cheap first-paint candidate probe.
 *
 * Purpose: separate "product path is slow" from "the harness included login".
 * This is not a CONF-01 slot; it is a front-door check before asking C to spend one.
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(root, 'chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer'));

export const FIRST_PAINT_PRODUCT_PATH_SIGNATURE = 'TALARIA_FIRST_PAINT_PRODUCT_PATH_PROBE_V1';

const url = process.env.FIRST_PAINT_URL
  || 'http://127.0.0.1:8791/chart/dist-v9/index.html?mode=backtest&mcLayout=2v';
const runs = Math.max(1, Number(process.env.FIRST_PAINT_RUNS || 3));
const outPath = process.env.FIRST_PAINT_OUT
  ? resolve(root, process.env.FIRST_PAINT_OUT)
  : resolve(root, 'docs/plan3/FIRST-PAINT-PRODUCT-PATH-PROBE-20260731.json');

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

export function classify(samples) {
  if (samples.some((s) => s.gotoError || /^chrome-error:/.test(String(s.finalUrl || '')))) {
    return { status: 'UNPROVEN_NO_PRODUCT_PATH', reason: 'target URL did not load product page' };
  }
  if (samples.some((s) => s.loginLike)) {
    return { status: 'UNPROVEN_LOGIN_PATH', reason: 'final page looked like login' };
  }
  const positive = (values) => median(values.filter((v) => Number.isFinite(v) && v > 0));
  const fcp = positive(samples.map((s) => s.firstContentfulPaintMs));
  const load = positive(samples.map((s) => s.loadEventEndMs));
  const dcl = positive(samples.map((s) => s.domContentLoadedMs));
  const wall = positive(samples.map((s) => s.wallMs));
  const firstApi = positive(samples.map((s) => s.firstApiMs));
  const anchor = fcp ?? load ?? dcl ?? wall;
  if (!Number.isFinite(anchor)) return { status: 'UNPROVEN', reason: 'no paint or load timing collected' };
  if (anchor >= 10_000) {
    return {
      status: 'RED_CANDIDATE',
      reason: 'product path first paint/load/wall >= 10s',
      medianMs: anchor,
      medians: { fcp, load, dcl, wall, firstApi },
    };
  }
  return {
    status: 'NOT_REPRODUCED',
    reason: 'product path below 10s candidate threshold',
    medianMs: anchor,
    medians: { fcp, load, dcl, wall, firstApi },
  };
}

async function readProbeViaCdp(page) {
  const session = await page.target().createCDPSession();
  try {
    const result = await session.send('Runtime.evaluate', {
      expression: 'window.__TALARIA_FIRST_PAINT_PROBE ? JSON.stringify(window.__TALARIA_FIRST_PAINT_PROBE) : null',
      returnByValue: true,
      awaitPromise: false,
      timeout: 3000,
    });
    const raw = result?.result?.value;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  } finally {
    await session.detach().catch(() => {});
  }
}

async function sample(browser, targetUrl, run) {
  const page = await browser.newPage();
  const started = Date.now();
  let error = null;
  const networkMarks = [];
  page.on('response', (res) => {
    try {
      const u = res.url();
      if (/\/api\/(files|auth\/me|chart\/windows\/claim)/.test(u) || /dist-v9|chart-embed/.test(u)) {
        networkMarks.push({
          t: Date.now() - started,
          status: res.status(),
          url: u.replace(/^https?:\/\/[^/]+/, ''),
        });
      }
    } catch (_) { /* ignore */ }
  });
  try {
    await page.evaluateOnNewDocument(() => {
      const probe = {
        finalUrl: null,
        buildId: null,
        firstPaintMs: null,
        firstContentfulPaintMs: null,
        domContentLoadedMs: null,
        loadEventEndMs: null,
        loginLike: false,
        frameCount: 1,
        updatedAt: 0,
      };
      window.__TALARIA_FIRST_PAINT_PROBE = probe;
      const stamp = () => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const fp = paints.find((p) => p.name === 'first-paint');
        const fcp = paints.find((p) => p.name === 'first-contentful-paint');
        probe.finalUrl = location.href;
        probe.buildId = window.__TALARIA_CHART_BUILD_ID || null;
        probe.firstPaintMs = fp ? fp.startTime : probe.firstPaintMs;
        probe.firstContentfulPaintMs = fcp ? fcp.startTime : probe.firstContentfulPaintMs;
        probe.domContentLoadedMs = nav ? nav.domContentLoadedEventEnd : probe.domContentLoadedMs;
        probe.loadEventEndMs = nav ? nav.loadEventEnd : probe.loadEventEndMs;
        probe.loginLike = /login|sign.?in/i.test(location.href)
          || !!document.querySelector('input[type="password"]');
        probe.frameCount = window.frames.length + 1;
        probe.updatedAt = Date.now();
      };
      document.addEventListener('DOMContentLoaded', stamp);
      window.addEventListener('load', stamp);
      try {
        new PerformanceObserver(() => stamp()).observe({ type: 'paint', buffered: true });
      } catch (_) { /* ignore */ }
      setInterval(stamp, 250);
    });

    try {
      await Promise.race([
        page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }),
        new Promise((resolveWait) => setTimeout(resolveWait, 15_000)),
      ]);
    } catch (e) {
      error = e.message;
    }

    let timing = null;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      timing = await readProbeViaCdp(page);
      if (timing && (Number.isFinite(timing.firstContentfulPaintMs) || Number.isFinite(timing.domContentLoadedMs))) {
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }

    return {
      run,
      wallMs: Date.now() - started,
      gotoError: error,
      finalUrl: timing?.finalUrl || null,
      buildId: timing?.buildId || null,
      firstPaintMs: timing?.firstPaintMs ?? null,
      firstContentfulPaintMs: timing?.firstContentfulPaintMs ?? null,
      domContentLoadedMs: timing?.domContentLoadedMs ?? null,
      loadEventEndMs: timing?.loadEventEndMs ?? null,
      loginLike: !!timing?.loginLike,
      frameCount: timing?.frameCount ?? null,
      firstApiMs: networkMarks[0]?.t ?? null,
      networkMarks: networkMarks.slice(0, 12),
      probeSource: timing ? 'cdp-injected' : 'none',
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function runFirstPaintProbe() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  const samples = [];
  try {
    for (let i = 1; i <= runs; i += 1) {
      samples.push(await sample(browser, url, i));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const report = {
    signature: FIRST_PAINT_PRODUCT_PATH_SIGNATURE,
    measuredAt: new Date().toISOString(),
    url,
    runs,
    verdict: classify(samples),
    samples,
    note: 'Harness/product path without login. Candidacy uses FCP, else loadEventEnd, else wallMs.',
  };
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(resolve(root, '../_evidence/manager-D'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(root, '../_evidence/manager-D/FIRST-PAINT-PRODUCT-PATH-PROBE-20260731.json'),
    JSON.stringify(report, null, 2),
  );
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFirstPaintProbe().then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict.status === 'RED_CANDIDATE' ? 1 : 0);
  }).catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
