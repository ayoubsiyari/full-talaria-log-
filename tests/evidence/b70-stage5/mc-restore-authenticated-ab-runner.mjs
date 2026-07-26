#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deriveSessionAssignments, readBackPanelPassports } from './session-assignment-contract.mjs';
import { classifyPanel, strictIdentity, summarizeAb, validateLayout } from './mc-restore-evidence-model.mjs';

const require = createRequire(new URL(
  '../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url,
));
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = String(process.env.MC_RESTORE_SESSION_ID || '849');
const expectedBuild = process.env.MC_RESTORE_EXPECTED_BUILD || '20260726b73';
const runs = Math.max(10, Number(process.env.MC_RESTORE_RUNS || 10));
const outDir = path.resolve(process.env.MC_RESTORE_EVIDENCE_DIR || 'mc-restore-evidence');

const sanitize = (value) => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|cookie|authorization|email|token/i.test(key))
    .map(([key, item]) => [key, sanitize(item)]));
};

async function login(page) {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const response = await page.evaluate(async ({ user, pass }) => {
    const loginResult = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user, password: pass }),
    });
    return loginResult.status;
  }, { user: email, pass: password });
  assert.equal(response, 200, `authentication failed with HTTP ${response}`);
}

async function fixture(page) {
  const detail = await page.evaluate(async (sid) => {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sid)}`, {
      credentials: 'include', cache: 'no-store',
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, sessionId);
  assert.equal(detail.status, 200, `session${sessionId} unavailable`);
  const session = detail.body?.session || detail.body;
  return deriveSessionAssignments(session);
}

async function seed(page, assignments) {
  await page.evaluate(({ sid, rows }) => {
    const state = {
      layout: '3v', selectedPanelIndex: 0, sessionId: sid,
      panels: rows.map((row, index) => ({
        index, isMainChart: index === 0, symbol: row.ticker,
        fileId: row.fileId, timeframe: row.timeframe, offsetX: 0, candleWidth: 6,
      })),
    };
    localStorage.setItem('chart_panel_state', JSON.stringify(state));
    localStorage.setItem('active_trading_session_id', sid);
  }, { sid: sessionId, rows: assignments });
}

async function snapshot(page, assignments) {
  return page.evaluate((expectedRows) => {
    const manager = window.__multichartManagerRef || window.__mcManager || window.__harnessManager;
    const entries = manager?.charts ? [...manager.charts.values()].sort((left, right) => {
      if (!!left.host !== !!right.host) return left.host ? -1 : 1;
      return String(left.id).localeCompare(String(right.id));
    }) : [];
    return entries.map((entry, index) => {
      const win = entry.host ? window : entry.frame?.contentWindow;
      const chart = win?.chart;
      const canvas = win?.document?.querySelector('#chartCanvas,canvas');
      let nonblack = 0;
      if (canvas?.width && canvas?.height) {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const step = Math.max(4, Math.floor(pixels.length / 32768 / 4) * 4);
        for (let offset = 0; offset + 2 < pixels.length; offset += step) {
          if (pixels[offset] || pixels[offset + 1] || pixels[offset + 2]) nonblack += 1;
        }
      }
      const generation = manager?._mcRestoreGeneration;
      return {
        id: entry.id, host: !!entry.host,
        ticker: String(chart?.currentSymbol || ''),
        fileId: String(chart?.currentFileId || ''),
        sessionId: String(chart?.activeTradingSessionId || ''),
        timeframe: String(chart?.currentTimeframe || ''),
        generation,
        appliedGeneration: entry.host ? manager?._mcRestoreCompletedGeneration
          : entry._mcRestoreAppliedGeneration,
        bars: Array.isArray(chart?.data) ? chart.data.length : 0,
        nonblack,
        expected: expectedRows[index],
      };
    });
  }, assignments.map((row) => ({ ...row, sessionId })));
}

async function waitSnapshot(page, assignments) {
  await page.waitForFunction(() => {
    const manager = window.__multichartManagerRef || window.__mcManager || window.__harnessManager;
    return manager?.charts?.size === 3
      && [...manager.charts.values()].filter((entry) => !entry.host).length === 2;
  }, { timeout: 30_000 });
  const started = Date.now();
  let panels;
  do {
    panels = await snapshot(page, assignments);
    if (panels.length === 3 && panels.every((panel) => panel.bars > 0 && panel.nonblack > 0)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() - started < 10_000);
  return panels.map((panel) => ({
    ...panel,
    paintMs: Date.now() - started,
    pass: strictIdentity(panel, panel.expected, panel.generation)
      && classifyPanel({ ...panel, nonblank: panel.nonblack > 0, paintMs: Date.now() - started },
        panel.expected).pass,
  }));
}

async function exercisePlayback(page) {
  return page.evaluate(async () => {
    const chart = window.chart;
    const replay = chart?.replaySystem || chart?.replay;
    if (!replay) return { pass: false, reason: 'replay unavailable' };
    const before = Number(replay.currentIndex);
    await replay.play?.();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const played = Number(replay.currentIndex);
    replay.pause?.();
    const paused = Number(replay.currentIndex);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await replay.play?.();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    replay.pause?.();
    const resumed = Number(replay.currentIndex);
    return { before, played, paused, resumed, pass: played > before && resumed > paused };
  });
}

async function runArm(browser, enabled, repetitions, assignments) {
  const page = await browser.newPage();
  let claimedClientId;
  let claimStatus;
  try {
    await page.evaluateOnNewDocument((flag) => {
      window.__TALARIA_ENABLE_MC_RESTORE_V1 = flag;
    }, enabled);
    await login(page);
    await seed(page, assignments);
    const claim = page.waitForResponse((response) =>
      response.url() === `${origin}/api/chart/windows/claim`
        && response.request().method() === 'POST', { timeout: 30_000 });
    const target = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=3v&sessionId=${sessionId}`;
    const snapshots = [];
    for (let index = 0; index < repetitions; index += 1) {
      if (index === 0) {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        const claimResponse = await claim;
        const claimBody = await claimResponse.json().catch(() => null);
        assert.equal(claimResponse.ok(), true);
        assert.equal((claimBody?.evicted_client_ids || []).length, 0);
        claimStatus = claimResponse.status();
        claimedClientId = await page.evaluate(() =>
          window.__talariaChartWindowLimit?.getClientId?.() || null);
        assert.ok(claimedClientId, 'claim must expose releasable client identity');
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      }
      await page.waitForFunction((build) => window.__TALARIA_CHART_BUILD_ID === build,
        { timeout: 60_000 }, expectedBuild);
      snapshots.push(await waitSnapshot(page, assignments));
    }
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chart_panel_state') || 'null'));
    const passports = readBackPanelPassports(saved, assignments);
    const playback = enabled ? await exercisePlayback(page) : null;
    return { enabled, claimStatus, passports, snapshots, playback };
  } finally {
    if (claimedClientId) {
      await page.evaluate(async (clientId) => {
        await fetch('/api/chart/windows/release', {
          method: 'POST', credentials: 'include', keepalive: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: clientId }),
        });
      }, claimedClientId).catch(() => {});
    }
    await page.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  validateLayout('3v');
  if (argv.includes('--dry-run')) {
    const fixtureArg = argv.find((value) => value.startsWith('--fixture='));
    const fixturePath = fixtureArg ? path.resolve(fixtureArg.slice('--fixture='.length)) : null;
    const fixtureAssignments = fixturePath
      ? deriveSessionAssignments(JSON.parse(fs.readFileSync(fixturePath, 'utf8')))
      : null;
    process.stdout.write(`${JSON.stringify({
      verdict: 'DRY_RUN', sessionId, layout: '3v', topology: 'host+2-iframes',
      fixture: fixtureAssignments ? { assignmentCount: fixtureAssignments.length } : null,
      arms: [{ restore: 'OFF', expected: 'RED', reloads: 1 },
        { restore: 'ON', expected: 'GREEN', reloads: runs }],
      credentials: email || password ? 'provided-redacted' : 'required-at-runtime',
      cleanup: 'release chart-window claim and close browser',
    })}\n`);
    return;
  }
  if (!origin || !email || !password) throw new Error('TEST_VPS_URL, TEST_EMAIL and TEST_PASSWORD are required');
  const puppeteer = require('puppeteer');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const bootstrap = await browser.newPage();
    await login(bootstrap);
    const assignments = await fixture(bootstrap);
    await bootstrap.close();
    const off = await runArm(browser, false, 1, assignments);
    const on = await runArm(browser, true, runs, assignments);
    const offClassified = off.snapshots[0].map((panel) => ({ pass: panel.pass }));
    const summary = summarizeAb(offClassified, on.snapshots);
    assert.equal(summary.offRed, true, 'OFF must reproduce RED');
    assert.equal(summary.onGreen, true, 'ON must sustain ten GREEN reloads');
    assert.equal(on.playback?.pass, true, 'play/pause-resume must advance');
    const evidence = sanitize({ verdict: 'PASS', summary, off, on });
    fs.writeFileSync(path.join(outDir, 'mc-restore-authenticated-ab.json'),
      `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
