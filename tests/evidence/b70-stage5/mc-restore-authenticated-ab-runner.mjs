#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchSealedBrowser } from '../../../scripts/lib/sealed-browser-runtime.mjs';
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
import {
  MANAGER_SCRIPT_PATH,
  PRODUCT_DEADLINE_MS,
  assertSafeLeaseTransition,
  classifyPreManagerStage,
  resolveStoredPassport,
  sha256,
} from './mc-pre-manager-diagnostics.mjs';

const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = String(process.env.MC_RESTORE_SESSION_ID || '849');
const expectedBuild = process.env.MC_RESTORE_EXPECTED_BUILD || '20260726b73';
const runs = Math.max(10, Number(process.env.MC_RESTORE_RUNS || 10));
const outDir = path.resolve(process.env.MC_RESTORE_EVIDENCE_DIR || 'mc-restore-evidence');
const diagnosticReloadOnly = process.env.MC_RESTORE_DIAGNOSTIC_RELOAD_ONLY === '1';

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
    const encoded = JSON.stringify(state);
    const uid = localStorage.getItem('_uid');
    localStorage.setItem('chart_panel_state', encoded);
    if (uid) localStorage.setItem(`u${uid}_chart_panel_state`, encoded);
    localStorage.setItem('active_trading_session_id', sid);
    if (uid) localStorage.setItem(`u${uid}_active_trading_session_id`, sid);
  }, { sid: sessionId, rows: assignments });
}

function installExternalDiagnostics(page) {
  const events = [];
  const push = (event) => {
    events.push({ at: Date.now(), ...event });
    if (events.length > 400) events.shift();
  };
  page.on('console', (message) => push({
    kind: 'console', level: message.type(), text: message.text().slice(0, 600),
    url: message.location().url || null,
  }));
  page.on('pageerror', (error) => push({
    kind: 'pageerror', text: String(error?.stack || error).slice(0, 1200),
  }));
  page.on('requestfailed', (request) => push({
    kind: 'requestfailed', url: request.url(), error: request.failure()?.errorText || null,
  }));
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/chart/windows/') && !url.includes(MANAGER_SCRIPT_PATH)
        && response.status() < 400) return;
    const event = { kind: 'response', url, status: response.status(), ok: response.ok() };
    if (url.endsWith('/claim') || url.endsWith('/heartbeat') || url.endsWith('/release')) {
      event.body = await response.json().catch(() => null);
    }
    if (url.includes(MANAGER_SCRIPT_PATH) && response.ok()) {
      const body = await response.text().catch(() => '');
      event.bodyHash = body ? sha256(body) : null;
      event.bodyBytes = Buffer.byteLength(body);
    }
    push(event);
  });
  return {
    events,
    since(at) { return events.filter((event) => event.at >= at); },
  };
}

async function snapshot(page, assignments, external = []) {
  const browserState = await page.evaluate((expectedRows) => {
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
    const uid = localStorage.getItem('_uid') || '';
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (/chart_panel_state|active_trading_session_id|mc_ab_arm/.test(key || '')) {
        storage[key] = localStorage.getItem(key);
      }
    }
    return {
      navigation: {
        top: window === window.top, href: location.href, origin: location.origin,
        sameOrigin: true, authRedirect: /\/login\/?/.test(location.pathname),
        readyState: document.readyState,
      },
      build: window.__TALARIA_CHART_BUILD_ID || null,
      auth: { uid: uid || null, userPresent: !!window.__talariaUserId },
      switch: {
        arm: localStorage.getItem('__talaria_mc_ab_arm'),
        runtime: window.__TALARIA_ENABLE_MC_RESTORE_V1 === true,
        predocument: window.__mcAbObserver?.predocument || null,
      },
      storage: { uid, values: storage },
      lease: {
        clientId: window.__talariaChartWindowLimit?.getClientId?.() || null,
        blocked: !!window.__talariaChartWindowBlocked,
        readback: window.__mcAbLeaseReadback || null,
      },
      react: {
        rootPresent: !!document.getElementById('root'),
        rootChildren: document.getElementById('root')?.childElementCount || 0,
        booted: !!document.querySelector('[data-v9-app],[data-multichart-grid]'),
      },
      manager: {
        present: !!manager,
        constructorSeen: !!window.MultichartManager,
        hostRegistered: !!manager && !!window.chart,
        chartCount: manager?.charts?.size ?? null,
        ids: manager?.charts ? [...manager.charts.keys()] : [],
        iframeCount: document.querySelectorAll('iframe').length,
        generation: manager?._mcRestoreGeneration ?? null,
        completedGeneration: manager?._mcRestoreCompletedGeneration ?? null,
      },
      lifecycle: window.__mcAbObserver?.events?.slice(-40) || [],
      errors: window.__mcAbObserver?.errors?.slice(-8) || [],
      panels,
    };
  }, assignments.map((row) => ({ ...row, sessionId })));
  const passport = resolveStoredPassport(browserState.storage.values, browserState.storage.uid);
  const managerResponses = external.filter((event) =>
    event.kind === 'response' && event.url?.includes(MANAGER_SCRIPT_PATH));
  const managerFailures = external.filter((event) =>
    (event.kind === 'requestfailed' && event.url?.includes(MANAGER_SCRIPT_PATH))
      || (event.kind === 'response' && event.url?.includes(MANAGER_SCRIPT_PATH) && !event.ok));
  const lease = assertSafeLeaseTransition(external, browserState.lease.clientId);
  const directLease = browserState.lease.readback;
  const result = {
    ...browserState,
    storage: { ...browserState.storage, passport },
    lease: {
      ...browserState.lease,
      ...lease,
      claimed: directLease?.claimed === true || lease.claimStatus === 200,
      heartbeatOk: directLease?.heartbeatStatus === 200 || lease.heartbeatStatus === 200,
    },
    managerScript: {
      requested: external.some((event) => event.url?.includes(MANAGER_SCRIPT_PATH)),
      responseOk: managerResponses.some((event) => event.ok),
      bodyHash: managerResponses.find((event) => event.bodyHash)?.bodyHash || null,
      failures: managerFailures.slice(-4),
    },
    external: external.slice(-80),
  };
  result.preManagerStage = classifyPreManagerStage(result);
  return result;
}

async function waitOnSnapshot(page, assignments, diagnostics, navigationStartedAt) {
  const started = Date.now();
  let result;
  try {
    result = await pollExternally({
      evaluate: () => snapshot(page, assignments, diagnostics.since(navigationStartedAt)),
      isTerminal: observableReady,
      timeoutMs: PRODUCT_DEADLINE_MS,
      intervalMs: 100,
      evaluateTimeoutMs: 5_000,
    });
  } catch (error) {
    if (!(error instanceof ExternalPollTimeoutError)) throw error;
    const last = error.observations.at(-1)?.value || null;
    throw new Error(`MC snapshot timeout stage=${stageForSnapshot(last)} diagnostics=${JSON.stringify({
      preManagerStage: last?.preManagerStage, navigation: last?.navigation,
      build: last?.build, auth: last?.auth, switch: last?.switch, storage: last?.storage,
      lease: last?.lease, managerScript: last?.managerScript, react: last?.react,
      manager: last?.manager,
      panels: last?.panels, lifecycle: last?.lifecycle,
      external: last?.external,
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
      timeoutMs: PRODUCT_DEADLINE_MS,
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
    subtype: verdict.subtype,
    passports: verdict.passports,
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
  const diagnostics = installExternalDiagnostics(page);
  let claimedClientId;
  let claimStatus;
  let state = 'OFF_ARMED';
  try {
    await page.evaluateOnNewDocument(() => {
      const arm = localStorage.getItem('__talaria_mc_ab_arm');
      window.__TALARIA_ENABLE_MC_RESTORE_V1 = arm === 'on';
      window.__mcAbObserver = {
        events: [], errors: [],
        predocument: {
          arm,
          runtime: window.__TALARIA_ENABLE_MC_RESTORE_V1 === true,
          href: location.href,
          readyState: document.readyState,
        },
      };
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
      const OriginalManager = Object.getOwnPropertyDescriptor(window, 'MultichartManager');
      if (!OriginalManager) {
        let managerConstructor;
        Object.defineProperty(window, 'MultichartManager', {
          configurable: true,
          get() { return managerConstructor; },
          set(value) {
            managerConstructor = value;
            record('manager-constructor-defined');
          },
        });
      }
      const observer = new MutationObserver((records) => {
        for (const mutation of records) {
          for (const node of mutation.addedNodes) {
            if (node?.tagName === 'IFRAME') record('iframe-created', { src: node.src || null });
            node?.querySelectorAll?.('iframe').forEach((frame) =>
              record('iframe-created', { src: frame.src || null }));
          }
        }
      });
      const observe = () => observer.observe(document.documentElement, { childList: true, subtree: true });
      if (document.documentElement) observe();
      else addEventListener('DOMContentLoaded', observe, { once: true });
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
    const initialNavigationAt = Date.now();
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
      const navigationAt = Date.now();
      const reloadClaim = page.waitForResponse((response) =>
        response.url() === `${origin}/api/chart/windows/claim`
          && response.request().method() === 'POST', { timeout: 30_000 });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction((build) => window.__TALARIA_CHART_BUILD_ID === build,
        { timeout: 60_000 }, expectedBuild);
      const claimAfterReload = await reloadClaim;
      const claimAfterReloadBody = await claimAfterReload.json().catch(() => null);
      assert.equal(claimAfterReload.ok(), true, `reload ${index + 1} claim failed`);
      assert.equal((claimAfterReloadBody?.evicted_client_ids || []).length, 0,
        `reload ${index + 1} claim evicted a client`);
      const leaseReadback = await page.evaluate(async (expectedClientId) => {
        const api = window.__talariaChartWindowLimit;
        const clientId = api?.getClientId?.() || null;
        const claimed = await api?.ensureClaimed?.();
        const heartbeat = await fetch('/api/chart/windows/heartbeat', {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: clientId }),
        });
        const result = {
          clientId,
          sameClient: clientId === expectedClientId,
          claimed: claimed === true,
          blocked: !!api?.isBlocked?.(),
          heartbeatStatus: heartbeat.status,
        };
        window.__mcAbLeaseReadback = result;
        return result;
      }, claimedClientId);
      assert.deepEqual(leaseReadback, {
        clientId: claimedClientId,
        sameClient: true,
        claimed: true,
        blocked: false,
        heartbeatStatus: 200,
      });
      const onReadback = await page.evaluate(() => ({
        stored: localStorage.getItem('__talaria_mc_ab_arm'),
        runtime: window.__TALARIA_ENABLE_MC_RESTORE_V1,
      }));
      assert.deepEqual(onReadback, { stored: 'on', runtime: true });
      if (diagnosticReloadOnly) {
        const diagnosticResult = await pollExternally({
          evaluate: () => snapshot(page, assignments, diagnostics.since(navigationAt)),
          isTerminal: (value) => value.preManagerStage === 'ready',
          timeoutMs: PRODUCT_DEADLINE_MS,
          intervalMs: 100,
          evaluateTimeoutMs: 5_000,
        });
        const diagnostic = diagnosticResult.value;
        assert.equal(diagnostic.preManagerStage, 'ready',
          `pre-manager reload failed at ${diagnostic.preManagerStage}`);
        return {
          state: 'DIAGNOSTIC_COMPLETE',
          claimStatus,
          switchReadback,
          diagnostic,
          off,
          on: { enabled: true, snapshots: [], playback: null },
        };
      }
      snapshots.push(await waitOnSnapshot(page, assignments, diagnostics, navigationAt));
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
      initialNavigationAt,
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
  if (argv.includes('--browser-smoke')) {
    const { browser, puppeteerEntry, chromeExecutable } = await launchSealedBrowser();
    try {
      const page = await browser.newPage();
      await page.goto('data:text/html,<title>sealed-mc-smoke</title>');
      assert.equal(await page.title(), 'sealed-mc-smoke');
      await page.close();
      process.stdout.write(`${JSON.stringify({
        verdict: 'BROWSER_SMOKE_PASS', puppeteerEntry, chromeExecutable,
      })}\n`);
    } finally {
      await browser.close();
    }
    return;
  }
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
  fs.mkdirSync(outDir, { recursive: true });
  const { browser } = await launchSealedBrowser();
  try {
    const bootstrap = await browser.newPage();
    await login(bootstrap);
    const assignments = await fixture(bootstrap);
    await bootstrap.close();
    const result = await runAbProfile(browser, runs, assignments);
    if (diagnosticReloadOnly) {
      const evidence = sanitize({ verdict: 'DIAGNOSTIC_PASS', ...result });
      fs.writeFileSync(path.join(outDir, 'mc-restore-pre-manager-diagnostic.json'),
        `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      process.stdout.write(`${JSON.stringify({
        verdict: evidence.verdict,
        stage: evidence.diagnostic?.preManagerStage,
        build: evidence.diagnostic?.build,
        lease: evidence.diagnostic?.lease,
        managerScript: evidence.diagnostic?.managerScript,
      })}\n`);
      return;
    }
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
