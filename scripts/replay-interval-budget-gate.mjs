#!/usr/bin/env node
/**
 * REPLAY-INTERVAL-BUDGET-V1 gate.
 *
 * Drives deployed MultichartGrid, arms PO workload (replay playing), and
 * asserts no setInterval callback exceeds the budget (default 50ms).
 *
 *   node scripts/replay-interval-budget-gate.mjs --require-browser --deployed --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { applyDistV9LayoutViaUi } from './lib/heap-cycle-browser.mjs';
import { armHeapCyclePoWorkload } from './lib/heap-cycle-po-workload.mjs';
import {
  REPLAY_INTERVAL_BUDGET_SIGNATURE,
  REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
  REPLAY_INTERVAL_OBSERVE_MS,
  assertReplayIntervalBudget,
  installReplayIntervalBudgetProbeSource,
  summarizeReplayIntervalBudget,
} from './lib/replay-interval-budget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_PKG = path.resolve(
  __dirname,
  '../chart v 1.4/chart/multichart-prod/harness/package.json',
);
const require = createRequire(HARNESS_PKG);
const DEFAULT_ORIGIN = 'http://31.97.192.82:3000';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    requireBrowser: false,
    json: true,
    deployed: true,
    timeoutMs: 300_000,
    observeMs: REPLAY_INTERVAL_OBSERVE_MS,
    budgetMs: REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
    outPath: null,
    requireBuild: null,
  };
  for (const arg of argv) {
    if (arg === '--require-browser') options.requireBrowser = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--deployed') options.deployed = true;
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice(13));
    else if (arg.startsWith('--observe-ms=')) options.observeMs = Number(arg.slice(13));
    else if (arg.startsWith('--budget-ms=')) options.budgetMs = Number(arg.slice(12));
    else if (arg.startsWith('--out=')) options.outPath = path.resolve(arg.slice(6));
    else if (arg.startsWith('--require-build=')) options.requireBuild = arg.slice(16).trim();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function uiLogin(page, origin, email, password) {
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  for (let i = 0; i < 8; i += 1) {
    const clicked = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, [role="button"]')];
      for (const el of nodes) {
        const t = (el.textContent || '').trim();
        if (/قبول الكل|Accept all|Allow all|Accept/i.test(t)) {
          el.click();
          return t;
        }
      }
      return null;
    });
    if (clicked) break;
    await sleep(200);
  }
  await page.waitForSelector('#email', { visible: true, timeout: 60_000 });
  await page.click('#email', { clickCount: 3 });
  await page.type('#email', email, { delay: 8 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 15_000 });
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', password, { delay: 8 });
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, [role="button"]')];
    for (const el of nodes) {
      const t = (el.textContent || '').trim();
      if (/log ?in|sign ?in|دخول|تسجيل/i.test(t)) {
        el.click();
        return;
      }
    }
  });
  await page.waitForFunction(() => !/\/login\/?/i.test(location.pathname), { timeout: 120_000 });
  return { url: page.url() };
}

export async function runReplayIntervalBudgetGate(options = {}) {
  const startedAt = new Date().toISOString();
  const email = String(process.env.TEST_EMAIL || '').trim();
  const password = String(process.env.TEST_PASSWORD || '').trim();
  const origin = String(process.env.TEST_VPS_URL || DEFAULT_ORIGIN).replace(/\/$/, '');
  if (!email || !password) {
    return {
      ok: false,
      status: options.requireBrowser ? 'RED' : 'SKIP',
      signature: REPLAY_INTERVAL_BUDGET_SIGNATURE,
      error: 'TEST_EMAIL/TEST_PASSWORD required',
      cells: [],
    };
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    return {
      ok: false,
      status: options.requireBrowser ? 'RED' : 'SKIP',
      signature: REPLAY_INTERVAL_BUDGET_SIGNATURE,
      error: String(error?.message || error),
      cells: [],
    };
  }

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: Math.max(300_000, options.timeoutMs || 300_000),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
    defaultViewport: { width: 1440, height: 960 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(Math.min(180_000, options.timeoutMs || 180_000));
    await page.evaluateOnNewDocument(installReplayIntervalBudgetProbeSource({
      budgetMs: options.budgetMs || REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
    }));
    await uiLogin(page, origin, email, password);
    await page.evaluate(() => {
      try {
        localStorage.setItem('_uid', '1');
        if (!localStorage.getItem('u1_backtestingSession')) {
          localStorage.setItem('u1_backtestingSession', JSON.stringify({
            type: 'standard',
            startBalance: 10000,
            session_id: `interval-budget-${Date.now()}`,
            instruments: { EURUSD: { ticker: 'EURUSD', fileId: 25 } },
          }));
        }
      } catch (_) {}
    });
    const url = reactParityUrlWithLayout(`${origin}/chart/dist-v9/index.html?mode=backtest`, '1');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    if (/\/login\/?/i.test(new URL(page.url()).pathname)) {
      await uiLogin(page, origin, email, password);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    }
    await page.waitForFunction(
      () => !!(window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 20),
      { timeout: 180_000 },
    );
    await applyDistV9LayoutViaUi(page, 4, 0);
    await page.waitForFunction(() => {
      const ids = new Set();
      for (const el of document.querySelectorAll('iframe')) {
        try {
          const pid = new URL(el.src, location.href).searchParams.get('panelId');
          if (pid) ids.add(pid);
        } catch (_) {}
      }
      return !!(window.__multichartGrid && ids.has('B') && ids.has('C') && ids.has('D'));
    }, { timeout: 120_000 });

    // Re-install probe on host after nav (evaluateOnNewDocument covers future docs;
    // host may already be live).
    await page.evaluate(installReplayIntervalBudgetProbeSource({
      budgetMs: options.budgetMs || REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
    }));

    const workload = await armHeapCyclePoWorkload(page, {
      playHoldMs: Math.max(2_000, Math.min(4_000, options.observeMs || 8_000)),
      replaySpeed: 60,
    });
    if (!workload.armed) {
      return {
        ok: false,
        status: 'RED',
        signature: REPLAY_INTERVAL_BUDGET_SIGNATURE,
        error: `PO workload not armed: ${JSON.stringify({
          indicatorsOk: workload.indicatorsOk,
          order: workload.order?.ok,
          playing: workload.observedPlaying,
        })}`,
        cells: [],
        workload,
      };
    }

    await sleep(options.observeMs || REPLAY_INTERVAL_OBSERVE_MS);
    const raw = await page.evaluate(() => window.__talariaReplayIntervalBudget || null);
    const buildId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null);
    const summary = summarizeReplayIntervalBudget(raw, {
      budgetMs: options.budgetMs || REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
    });
    const cells = assertReplayIntervalBudget(summary);
    if (options.requireBuild) {
      const pinOk = buildId === options.requireBuild;
      cells.unshift({
        name: 'REPLAY-INTERVAL-BUILD-PIN',
        pass: pinOk,
        status: pinOk ? 'GREEN' : 'RED',
        detail: `buildId=${buildId || 'MISSING'} required=${options.requireBuild}`,
        blocking: true,
      });
    }
    const ok = cells.every((c) => c.pass === true || c.nonBlocking === true);
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: REPLAY_INTERVAL_BUDGET_SIGNATURE,
      error: ok ? null : cells.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`).join('; '),
      cells,
      summary,
      workload: {
        armed: workload.armed,
        observedPlaying: workload.observedPlaying,
        orderOk: workload.order?.ok,
      },
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        buildId,
        origin,
        observeMs: options.observeMs,
        budgetMs: options.budgetMs,
      },
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseArgs();
  const result = await runReplayIntervalBudgetGate(options);
  const text = JSON.stringify(result, null, 2);
  if (options.outPath) {
    fs.writeFileSync(options.outPath, text);
    console.error(`wrote ${options.outPath}`);
  }
  console.log(text);
  process.exit(result.ok ? 0 : 1);
}
