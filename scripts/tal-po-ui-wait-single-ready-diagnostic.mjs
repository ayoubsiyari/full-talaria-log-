#!/usr/bin/env node
/**
 * Focused diagnostic for TAL PO UI boot stalls.
 *
 * This is intentionally not the full mutant suite. It opens the sealed b126
 * surface, waits only for the single-chart ready predicate, and records the
 * exact page state each time the predicate is still false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
} from './lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  matchCoordinatePairs,
  readCandidateCoordinates,
} from './lib/a3-speed-fill-journal-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', process.env.TAL_PO_UI_EXPECT_BADGE || '20260803b126')),
  digest: String(argOf('expect-digest', process.env.TAL_PO_UI_EXPECT_DIGEST || '')),
  sourceCommitSha: String(argOf('expect-sha', process.env.TAL_PO_UI_EXPECT_SHA || '')),
};
const OUT_JSON = path.resolve(repoRoot, argOf('out', 'docs/plan3/evidence/tal-po-ui-wait-single-ready-diagnostic-b126.json'));
const TIMEOUT_MS = Math.max(5_000, Number(argOf('timeout-ms', '30000')) || 30_000);
const INTERVAL_MS = Math.max(250, Number(argOf('interval-ms', '1000')) || 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boundedGoto(page, url, timeoutMs = 15_000) {
  let settled = false;
  const nav = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 })
    .then(() => { settled = true; return { state: 'GOTO_DONE' }; })
    .catch((e) => { settled = true; return { state: 'GOTO_NONFATAL', error: String(e?.message || e) }; });
  const result = await Promise.race([
    nav,
    sleep(timeoutMs).then(() => ({ state: 'GOTO_TIMEOUT', timeoutMs })),
  ]);
  if (!settled) {
    const client = await page.target().createCDPSession().catch(() => null);
    if (client) {
      await client.send('Page.stopLoading').catch(() => {});
      await client.detach().catch(() => {});
    }
  }
  return result;
}

async function ensureLoggedIn(page, origin) {
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  if (!email || !password) throw new Error('wait-single-ready diagnostic requires TEST_EMAIL and TEST_PASSWORD');
  await uiLoginDeployed(page, origin, email, password);
  await page.evaluate(() => {
    try {
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `tal-po-ui-ready-diag-${Date.now()}`,
        instruments: {
          ES: { ticker: 'ES', fileId: 21, tradable: true },
          NQ: { ticker: 'NQ', fileId: 22, view_only: true, tradable: false },
        },
        supporting_tickers: ['NQ'],
      }));
    } catch (_) { /* ignore */ }
  });
}

async function sampleReadyState(page) {
  return page.evaluate(() => {
    const chart = window.chart || null;
    const data = chart && Array.isArray(chart.data) ? chart.data : null;
    const root = document.querySelector('#root');
    const app = document.querySelector('.app, .chart-container, svg, canvas');
    const bodyText = String(document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400);
    const frames = Array.from(document.querySelectorAll('iframe')).map((el) => ({
      src: String(el.getAttribute('src') || el.src || '').slice(0, 180),
      id: el.id || null,
      className: el.className || null,
    }));
    return {
      url: location.href,
      readyState: document.readyState,
      title: document.title,
      hasRoot: !!root,
      hasVisibleAppNode: !!app,
      iframeCount: frames.length,
      frames,
      hasChart: !!chart,
      chartDataIsArray: Array.isArray(chart?.data),
      chartDataLength: data ? data.length : null,
      chartFileId: chart?.currentFileId ?? chart?.fileId ?? null,
      chartTimeframe: chart?.currentTimeframe ?? chart?.timeframe ?? null,
      hasOrderManager: !!chart?.orderManager,
      hasMultichartGrid: !!window.__multichartGrid,
      hasMultichartManager: !!window.__multichartManagerRef,
      harnessHostReady: !!window.__harnessHostReady,
      harnessBootError: window.__harnessBootError ? String(window.__harnessBootError).slice(0, 300) : null,
      localStorageKeys: Object.keys(localStorage || {}).filter((k) => /backtest|session|_uid/i.test(k)).slice(0, 20),
      bodyText,
      predicate: !!(chart && Array.isArray(chart.data) && chart.data.length > 200),
    };
  }).catch((e) => ({ evaluateError: String(e?.message || e), predicate: false }));
}

async function main() {
  const surface = await readCandidateCoordinates(ORIGIN);
  const expected = {
    badge: EXPECT.badge || surface.badge,
    digest: EXPECT.digest || surface.digest,
    sourceCommitSha: EXPECT.sourceCommitSha || surface.sourceCommitSha,
  };
  const identity = matchCoordinatePairs(surface, expected);
  if (!identity.ok) {
    throw new Error(`served surface identity mismatch: ${JSON.stringify(identity.pairs)}`);
  }

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1000'],
    defaultViewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();
  const consoleRows = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (msg) => consoleRows.push({ type: msg.type(), text: msg.text().slice(0, 500) }));
  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err).slice(0, 800)));
  page.on('requestfailed', (req) => requestFailures.push({
    url: req.url().slice(0, 240),
    failure: req.failure()?.errorText || null,
  }));

  const samples = [];
  let verdict = 'FAILED';
  let gotoResult = null;
  let cookieResult = null;
  try {
    await ensureLoggedIn(page, ORIGIN);
    const url = reactParityUrlWithLayout(`${ORIGIN}/chart/dist-v9/index.html?mode=backtest&tal=po-ui-ready-diag`, '1');
    gotoResult = await boundedGoto(page, url);
    cookieResult = await dismissCookieBanner(page, { timeoutMs: 3000 });
    const started = Date.now();
    while (Date.now() - started <= TIMEOUT_MS) {
      const sample = await sampleReadyState(page);
      sample.elapsedMs = Date.now() - started;
      samples.push(sample);
      console.error(`WAIT_SINGLE_READY_DIAG elapsedMs=${sample.elapsedMs} predicate=${sample.predicate} chartDataLength=${sample.chartDataLength} readyState=${sample.readyState} url=${sample.url}`);
      if (sample.predicate) {
        verdict = 'PASSED';
        break;
      }
      await sleep(INTERVAL_MS);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const report = {
    signature: 'TAL-PO-UI-WAIT-SINGLE-READY-DIAGNOSTIC-V1',
    at: new Date().toISOString(),
    origin: ORIGIN,
    expected,
    surface,
    identity,
    timeoutMs: TIMEOUT_MS,
    intervalMs: INTERVAL_MS,
    verdict,
    gotoResult,
    cookieResult: cookieResult || 'none',
    samples,
    lastSample: samples[samples.length - 1] || null,
    consoleTail: consoleRows.slice(-40),
    pageErrors,
    requestFailures: requestFailures.slice(-40),
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    verdict,
    out: path.relative(repoRoot, OUT_JSON).replace(/\\/g, '/'),
    lastSample: report.lastSample,
  }, null, 2));
  process.exitCode = verdict === 'PASSED' ? 0 : 2;
}

main().catch((error) => {
  console.error(`WAIT_SINGLE_READY_DIAG_FAILED ${String(error?.stack || error)}`);
  process.exitCode = 1;
});
