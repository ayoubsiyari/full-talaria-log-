#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { deriveSessionAssignments, readBackPanelPassports } from './session-assignment-contract.mjs';
import { classifyPanel, strictIdentity, summarizeAb, validateLayout } from './mc-restore-evidence-model.mjs';
import {
  classifyArmPanel,
  classifyOffDeadline,
  observableReady,
  stageForSnapshot,
  transitionAbState,
} from './mc-snapshot-contract.mjs';
import { ExternalPollTimeoutError, pollExternally } from './puppeteer-external-poll.mjs';

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
    const iframeEntries = manager?.charts
      ? [...manager.charts.values()].filter((entry) => !entry.host)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      : [];
    const entries = [{ id: 'A', host: true }, ...iframeEntries];
    const panels = entries.map((entry, index) => {
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
        errors: win?.__mcAbObserver?.errors?.slice(-8) || [],
        expected: expectedRows[index],
      };
    });
    return {
      navigation: { top: window === window.top, href: location.href },
      layout: JSON.parse(localStorage.getItem('chart_panel_state') || 'null')?.layout || null,
      manager: {
        present: !!manager,
        chartCount: manager?.charts?.size ?? null,
        ids: manager?.charts ? [...manager.charts.keys()] : [],
        generation: manager?._mcRestoreGeneration ?? null,
        completedGeneration: manager?._mcRestoreCompletedGeneration ?? null,
      },
      lifecycle: window.__mcAbObserver?.events?.slice(-40) || [],
      errors: window.__mcAbObserver?.errors?.slice(-8) || [],
      panels,
    };
  }, assignments.map((row) => ({ ...row, sessionId })));
}

async function waitOnSnapshot(page, assignments) {
  const started = Date.now();
  let result;
  try {
    result = await pollExternally({
      evaluate: () => snapshot(page, assignments),
      isTerminal: observableReady,
      timeoutMs: 10_000,
      intervalMs: 100,
      evaluateTimeoutMs: 5_000,
    });
  } catch (error) {
    if (!(error instanceof ExternalPollTimeoutError)) throw error;
    const last = error.observations.at(-1)?.value || null;
    throw new Error(`MC snapshot timeout stage=${stageForSnapshot(last)} diagnostics=${JSON.stringify({
      navigation: last?.navigation, layout: last?.layout, manager: last?.manager,
      panels: last?.panels, lifecycle: last?.lifecycle,
      contextErrors: error.observations.filter((row) => row.error).slice(-8),
    })}`, { cause: error });
  }
  return result.value.panels.map((panel) => ({
    ...panel,
    paintMs: Date.now() - started,
    pass: classifyArmPanel({ ...panel, paintMs: Date.now() - started }, true,
      strictIdentity, classifyPanel),
  }));
}

async function waitOffWitness(page, assignments) {
  const started = Date.now();
  let observations;
  try {
    await pollExternally({
      evaluate: () => snapshot(page, assignments),
      isTerminal: () => false,
      timeoutMs: 10_000,
      intervalMs: 100,
      evaluateTimeoutMs: 5_000,
    });
    throw new Error('OFF bounded observer returned before its deadline');
  } catch (error) {
    if (!(error instanceof ExternalPollTimeoutError)) throw error;
    observations = error.observations;
  }
  const verdict = classifyOffDeadline(observations);
  if (!verdict.pass) {
    const last = observations.at(-1)?.value || null;
    throw new Error(`MC OFF deadline failure reason=${verdict.reason} stage=${stageForSnapshot(last)} diagnostics=${JSON.stringify({
      elapsedMs: Date.now() - started,
      observationCount: observations.length,
      navigation: last?.navigation,
      layout: last?.layout,
      manager: last?.manager,
      panels: last?.panels,
      lifecycle: last?.lifecycle,
      errors: last?.errors,
      observationErrors: observations.filter((row) => row.error).slice(-8),
    })}`);
  }
  return {
    verdict: 'RED',
    reason: verdict.reason,
    elapsedMs: Date.now() - started,
    stableMs: verdict.stableMs,
    firstStableAtMs: verdict.firstStableAtMs,
    deadlineAtMs: verdict.deadlineAtMs,
    observationCount: observations.length,
    observations,
    snapshot: verdict.snapshot,
  };
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

async function runAbProfile(browser, repetitions, assignments) {
  const page = await browser.newPage();
  let claimedClientId;
  let claimStatus;
  let state = 'OFF_ARMED';
  try {
    await page.evaluateOnNewDocument(() => {
      window.__TALARIA_ENABLE_MC_RESTORE_V1
        = localStorage.getItem('__talaria_mc_ab_arm') === 'on';
      window.__mcAbObserver = { events: [], errors: [] };
      const record = (type, detail = {}) => {
        window.__mcAbObserver.events.push({ type, at: performance.now(), ...detail });
      };
      const recordError = (value) => {
        window.__mcAbObserver.errors.push(String(value?.message || value || '').slice(0, 300));
      };
      addEventListener('error', (event) => recordError(event.error || event.message));
      addEventListener('unhandledrejection', (event) => recordError(event.reason));
      addEventListener('DOMContentLoaded', () => record('domcontentloaded'));
      addEventListener('load', () => record('load'));
      addEventListener('pageshow', (event) => record('pageshow', { persisted: event.persisted }));
      addEventListener('pagehide', (event) => record('pagehide', { persisted: event.persisted }));
      addEventListener('message', (event) => {
        const data = event.data;
        if (data && typeof data === 'object' && /ready|restore|state/i.test(String(data.type || ''))) {
          record('message', { messageType: String(data.type || ''), source: data.source || null });
        }
      });
    });
    await login(page);
    await page.evaluate(() => {
      localStorage.setItem('__talaria_mc_ab_arm', 'off');
      window.__TALARIA_ENABLE_MC_RESTORE_V1 = false;
    });
    await seed(page, assignments);
    const claim = page.waitForResponse((response) =>
      response.url() === `${origin}/api/chart/windows/claim`
        && response.request().method() === 'POST', { timeout: 30_000 });
    const target = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=3v&sessionId=${sessionId}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const claimResponse = await claim;
    const claimBody = await claimResponse.json().catch(() => null);
    assert.equal(claimResponse.ok(), true);
    assert.equal((claimBody?.evicted_client_ids || []).length, 0);
    claimStatus = claimResponse.status();
    claimedClientId = await page.evaluate(() =>
      window.__talariaChartWindowLimit?.getClientId?.() || null);
    assert.ok(claimedClientId, 'claim must expose releasable client identity');
    await page.waitForFunction((build) => window.__TALARIA_CHART_BUILD_ID === build,
      { timeout: 60_000 }, expectedBuild);

    const off = await waitOffWitness(page, assignments);
    state = transitionAbState(state, 'OFF_RED_WITNESSED');
    const switchReadback = await page.evaluate(() => {
      localStorage.setItem('__talaria_mc_ab_arm', 'on');
      window.__TALARIA_ENABLE_MC_RESTORE_V1 = true;
      return {
        stored: localStorage.getItem('__talaria_mc_ab_arm'),
        runtime: window.__TALARIA_ENABLE_MC_RESTORE_V1,
      };
    });
    assert.deepEqual(switchReadback, { stored: 'on', runtime: true });
    state = transitionAbState(state, 'ON_SWITCH_READBACK');

    const snapshots = [];
    for (let index = 0; index < repetitions; index += 1) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction((build) => window.__TALARIA_CHART_BUILD_ID === build,
        { timeout: 60_000 }, expectedBuild);
      const onReadback = await page.evaluate(() => ({
        stored: localStorage.getItem('__talaria_mc_ab_arm'),
        runtime: window.__TALARIA_ENABLE_MC_RESTORE_V1,
      }));
      assert.deepEqual(onReadback, { stored: 'on', runtime: true });
      snapshots.push(await waitOnSnapshot(page, assignments));
    }
    state = transitionAbState(state, 'ON_GREEN');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chart_panel_state') || 'null'));
    const passports = readBackPanelPassports(saved, assignments);
    const playback = await exercisePlayback(page);
    return {
      state,
      claimStatus,
      passports,
      switchReadback,
      off,
      on: { enabled: true, snapshots, playback },
    };
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
    const result = await runAbProfile(browser, runs, assignments);
    const summary = summarizeAb([{ pass: false }, { pass: false }, { pass: false }],
      result.on.snapshots);
    assert.equal(summary.offRed, true, 'OFF must reproduce RED');
    assert.equal(summary.onGreen, true, 'ON must sustain ten GREEN reloads');
    assert.equal(result.on.playback?.pass, true, 'play/pause-resume must advance');
    assert.equal(result.state, 'COMPLETE', 'A/B state machine must complete in one profile');
    const evidence = sanitize({ verdict: 'PASS', summary, ...result });
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
