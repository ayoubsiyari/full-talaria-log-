#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { MUTATING_METHODS } from './b75-po-v4-network-policy.mjs';
import { configuredSessionAssignments } from './mc-restore-session-fixture.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const expectedBuild = String(process.env.MC_RESTORE_EXPECTED_BUILD || '20260726b75');
const requestedSessionId = String(process.env.B75_QA_SESSION_ID || '');
const speeds = String(process.env.B75_PO_V5_SPEEDS || '1,5,15,30')
  .split(',').map(Number).filter((value) => Number.isFinite(value) && value > 0);
const cellMs = Math.min(10_000, Math.max(1_500, Number(process.env.B75_PO_V5_CELL_MS || 3_000)));
const output = path.resolve(process.env.B75_PO_V5_EVIDENCE
  || path.join(os.tmpdir(), `b75-po-v5-1d-tick-speed-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  headless: 'new',
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b75-po-v5-')),
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run', '--enable-precise-memory-info'],
});
const page = await browser.newPage();
const cdp = await page.target().createCDPSession();
await cdp.send('Performance.enable');
let ownerScopeValidated = false;
let sessionId = '';
const mutations = [];
const evidence = {
  evidenceClass: 'authenticated-owner-scoped-b75-po-v5-1d-tick-speed-read-only-red',
  generatedAt: new Date().toISOString(),
  expectedBuild,
  browserProfile: 'fresh-ephemeral',
  configuredSpeeds: speeds,
  cellMs,
  sessionDiscovery: null,
  cells: [],
  transition: null,
  mutations,
  pageErrors: [],
  liveEvidenceStatus: 'pending-chart-readiness',
};
page.on('pageerror', (error) => evidence.pageErrors.push(String(error?.message || error).slice(0, 500)));

await page.setRequestInterception(true);
page.on('request', async (request) => {
  const method = request.method().toUpperCase();
  let url;
  try { url = new URL(request.url()); } catch (_) {}
  if (!url || url.origin !== new URL(origin).origin || !MUTATING_METHODS.includes(method)
      || url.pathname === '/api/auth/login') {
    await request.continue().catch(() => {});
    return;
  }
  const record = {
    method,
    pathSha256: createHash('sha256').update(url.pathname).digest('hex'),
    sessionScoped: /^\/api\/sessions\/[^/]+\/state$/.test(url.pathname),
    ownerScopeValidated,
    disposition: 'prevented-read-only',
  };
  mutations.push(record);
  await request.respond({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, diagnosticWritePrevented: true }),
  }).catch(() => {});
});

await page.evaluateOnNewDocument(() => {
  const probe = window.__poV5 = {
    timers: new Map(), rafs: new Map(), workers: [], timerEvents: [], rafEvents: [],
    orderEvents: [], replayEvents: [], nextId: 1,
  };
  const trim = (rows, max = 4000) => { if (rows.length > max) rows.splice(0, rows.length - max); };
  const originalTimeout = window.setTimeout;
  const originalInterval = window.setInterval;
  const originalClearTimeout = window.clearTimeout;
  const originalClearInterval = window.clearInterval;
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;
  const wrapTimer = (kind, original) => function wrapped(callback, delay, ...args) {
    const probeId = probe.nextId++;
    const record = { probeId, kind, delay: Number(delay) || 0, armedAt: performance.now(), fires: 0 };
    const wrappedCallback = (...callbackArgs) => {
      record.fires += 1;
      probe.timerEvents.push({ probeId, at: performance.now() });
      trim(probe.timerEvents);
      if (kind === 'timeout') probe.timers.delete(handle);
      return typeof callback === 'function' ? callback(...callbackArgs) : undefined;
    };
    const handle = original.call(this, wrappedCallback, delay, ...args);
    record.handle = Number(handle);
    probe.timers.set(handle, record);
    return handle;
  };
  window.setTimeout = wrapTimer('timeout', originalTimeout);
  window.setInterval = wrapTimer('interval', originalInterval);
  window.clearTimeout = (handle) => { probe.timers.delete(handle); return originalClearTimeout(handle); };
  window.clearInterval = (handle) => { probe.timers.delete(handle); return originalClearInterval(handle); };
  window.requestAnimationFrame = function wrappedRaf(callback) {
    const probeId = probe.nextId++;
    const handle = originalRaf.call(this, (timestamp) => {
      probe.rafs.delete(handle);
      probe.rafEvents.push({ probeId, at: performance.now() });
      trim(probe.rafEvents);
      callback(timestamp);
    });
    probe.rafs.set(handle, { probeId, armedAt: performance.now() });
    return handle;
  };
  window.cancelAnimationFrame = (handle) => { probe.rafs.delete(handle); return originalCancelRaf(handle); };
  const NativeWorker = window.Worker;
  if (NativeWorker) {
    window.Worker = class ObservedWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        probe.workers.push({ createdAt: performance.now(), url: String(url).split('?')[0], terminatedAt: null });
        const row = probe.workers.at(-1);
        const terminate = this.terminate;
        this.terminate = function observedTerminate() {
          row.terminatedAt = performance.now();
          return terminate.call(this);
        };
      }
    };
  }
  const patch = () => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const om = chart?.orderManager;
    if (replay && !replay.__poV5Patched) {
      replay.__poV5Patched = true;
      for (const name of ['play', 'pause', 'stopAllPlayback', '_finishPlaybackAtSessionEnd',
        'startTickAnimation', 'startCandleByCandle', 'scheduleNextTick', 'animateTick']) {
        if (typeof replay[name] !== 'function') continue;
        const original = replay[name];
        replay[name] = function observedReplay(...args) {
          probe.replayEvents.push({ at: performance.now(), name, index: this.currentIndex,
            timestamp: this.replayTimestamp, playing: this.isPlaying });
          trim(probe.replayEvents);
          return original.apply(this, args);
        };
      }
    }
    if (om && !om.__poV5Patched) {
      om.__poV5Patched = true;
      for (const name of ['updatePositions', 'checkPendingOrders', 'closePosition', 'executeOrder']) {
        if (typeof om[name] !== 'function') continue;
        const original = om[name];
        om[name] = function observedOrder(...args) {
          probe.orderEvents.push({ at: performance.now(), name,
            replayTimestamp: chart?.replaySystem?.replayTimestamp ?? null,
            orderId: args[0]?.id ?? args[0] ?? null });
          trim(probe.orderEvents);
          return original.apply(this, args);
        };
      }
    }
  };
  originalInterval(patch, 10);
});

async function fetchJson(url, init = {}) {
  return page.evaluate(async ({ target, options }) => {
    const response = await fetch(target, { credentials: 'include', cache: 'no-store', ...options });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { target: url, options: init });
}

function sessionTime(row) {
  for (const key of ['created_at', 'createdAt', 'updated_at', 'updatedAt']) {
    const value = Date.parse(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

async function memorySnapshot() {
  const [{ metrics }, processes] = await Promise.all([
    cdp.send('Performance.getMetrics'),
    cdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] })),
  ]);
  const picked = Object.fromEntries(metrics
    .filter(({ name }) => /^(JSHeapUsedSize|JSHeapTotalSize|Nodes|Documents|Frames|JSEventListeners|TaskDuration|ScriptDuration|LayoutDuration|RecalcStyleDuration)$/.test(name))
    .map(({ name, value }) => [name, value]));
  return {
    ...picked,
    processes: (processes.processInfo || []).map((row) => ({
      type: row.type, cpuTime: row.cpuTime,
    })),
  };
}

async function snapshot(label) {
  const runtime = await page.evaluate((snapLabel) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const om = chart?.orderManager;
    const probe = window.__poV5;
    const summarizeOrder = (row) => ({
      id: row?.id ?? null, status: row?.status ?? null,
      createdAt: row?.createdAt ?? row?.timestamp ?? row?.entryTimestamp ?? null,
      triggeredAt: row?.triggeredAt ?? row?.openTimestamp ?? row?.entryTime ?? null,
      closedAt: row?.closedAt ?? row?.closeTimestamp ?? row?.exitTimestamp ?? row?.exitTime ?? null,
      closeReason: row?.closeReason ?? row?.exitReason ?? row?.reason ?? null,
    });
    const timerRows = [...(probe?.timers?.values() || [])];
    const rawMs = replay?._getRawBarPeriodMs?.() ?? null;
    const effective = replay?.getEffectivePlaybackSpeed?.() ?? null;
    const subdivisions = replay?._finestTfCadenceSubdivisions?.() ?? null;
    const realCandleMs = Number.isFinite(rawMs) && Number.isFinite(effective)
      ? rawMs / effective / Math.max(1, Number(subdivisions) || 1) : null;
    return {
      label: snapLabel,
      at: performance.now(),
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      timeframe: chart?.currentTimeframe ?? null,
      configuredSpeed: replay?.speed ?? null,
      effectiveSpeed: effective,
      playbackMode: replay?.getPlaybackMode?.() ?? replay?.playbackMode ?? null,
      shouldUseTickAnimation: replay?._shouldUseTickAnimation?.() ?? null,
      loopKind: replay?.getPlaybackLoopKind?.() ?? null,
      isPlaying: replay?.isPlaying ?? null,
      currentIndex: replay?.currentIndex ?? null,
      dataEndIndex: Array.isArray(replay?.fullRawData) ? replay.fullRawData.length - 1 : null,
      replayTimestamp: replay?.replayTimestamp ?? null,
      tickElapsedMs: replay?.tickElapsedMs ?? null,
      tickProgress: replay?.tickProgress ?? null,
      ticksPerCandle: replay?.currentTicksPerCandle ?? replay?.ticksPerCandle ?? null,
      rawCandleMs: rawMs,
      orderExecutionCadenceMs: replay?._getOrderExecutionCadenceMs?.() ?? null,
      finestCadenceMs: replay?._getFinestReplayCadenceMs?.() ?? null,
      cadenceSubdivisions: subdivisions,
      computedWallCandleMs: realCandleMs,
      scheduler: {
        fastMode: replay?.fastMode ?? null,
        fastModeInterval: replay?.fastModeInterval ?? null,
        tickBaseInterval: replay?.volumeTickData?.baseInterval ?? null,
        activeTimers: timerRows.length,
        timerDelays: timerRows.map((row) => row.delay).sort((a, b) => a - b),
        activeRafs: probe?.rafs?.size ?? null,
        timerFires: probe?.timerEvents?.length ?? null,
        rafFires: probe?.rafEvents?.length ?? null,
      },
      resources: {
        chartBars: Array.isArray(chart?.data) ? chart.data.length : null,
        rawBars: Array.isArray(replay?.fullRawData) ? replay.fullRawData.length : null,
        tickPathCacheKeys: replay?.tickPathCache ? Object.keys(replay.tickPathCache).length : null,
        workersCreated: probe?.workers?.length ?? null,
        workersAlive: probe?.workers?.filter((row) => row.terminatedAt == null).length ?? null,
        jsHeapUsed: performance.memory?.usedJSHeapSize ?? null,
        jsHeapTotal: performance.memory?.totalJSHeapSize ?? null,
      },
      orders: {
        pending: (om?.pendingOrders || []).map(summarizeOrder),
        open: (om?.openPositions || []).map(summarizeOrder),
        closed: (om?.closedPositions || []).map(summarizeOrder),
        events: probe?.orderEvents?.slice(-200) || [],
      },
      replayEvents: probe?.replayEvents?.slice(-200) || [],
    };
  }, label);
  runtime.cdpMemory = await memorySnapshot();
  return runtime;
}

try {
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const login = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const [me, sessions] = await Promise.all([fetchJson('/api/auth/me'), fetchJson('/api/sessions')]);
  const rows = sessions.body?.sessions || [];
  if (login.status !== 200 || me.status !== 200 || !me.body?.user || !Array.isArray(rows) || !rows.length) {
    throw new Error('authenticated owner session discovery failed');
  }
  const sorted = [...rows].sort((a, b) => sessionTime(b) - sessionTime(a) || Number(b.id) - Number(a.id));
  const selected = requestedSessionId
    ? sorted.find((row) => String(row.id) === requestedSessionId)
    : sorted[0];
  if (!selected) throw new Error('configured QA session is not owner-scoped');
  sessionId = String(selected.id);
  const [detail, files] = await Promise.all([
    fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}`),
    fetchJson('/api/files?session_ready=1'),
  ]);
  if (detail.status !== 200 || !detail.body?.session) throw new Error('owner session detail unavailable');
  const fileRows = Array.isArray(files.body) ? files.body : (files.body?.files || files.body?.data || []);
  const [assignment] = configuredSessionAssignments(detail.body.session, fileRows, 1);
  if (!assignment) throw new Error('owner session lacks a session-ready configured file');
  ownerScopeValidated = true;
  evidence.sessionDiscovery = {
    strategy: requestedSessionId ? 'explicit-owner-scoped' : 'newest-owner-scoped-read-only',
    exactSessionId: sessionId,
    ownerListStatus: sessions.status,
    detailStatus: detail.status,
    candidateCount: rows.length,
    selectedCreatedAt: selected.created_at ?? selected.createdAt ?? null,
    selectedUpdatedAt: selected.updated_at ?? selected.updatedAt ?? null,
    assignment: { fileId: 'owner-file-1', ticker: 'owner-symbol-1' },
  };

  await page.evaluate(({ sid, row }) => {
    localStorage.setItem('active_trading_session_id', sid);
    localStorage.setItem('chart_panel_state', JSON.stringify({
      layout: '1', selectedPanelIndex: 0, sessionId: sid,
      panels: [{
        index: 0, isMainChart: true, timeframe: '1d',
        fileId: row.fileId, symbol: row.ticker, ticker: row.ticker,
      }],
    }));
  }, { sid: sessionId, row: assignment });
  await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&sessionId=${encodeURIComponent(sessionId)}`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.chart?.replaySystem
    && window.chart?.data?.length > 10, { timeout: 120_000 });
  const readiness = await page.evaluate((build) => ({
    actualBuild: window.__TALARIA_CHART_BUILD_ID || null,
    expectedBuild: build,
    buildMatches: !build || window.__TALARIA_CHART_BUILD_ID === build,
    replayInitiallyActive: !!window.chart.replaySystem.isActive,
    chartBars: window.chart.data.length,
  }), expectedBuild);
  evidence.readiness = readiness;
  await page.evaluate(() => {
    const replay = window.chart.replaySystem;
    if (!replay.isActive) replay.enterReplayMode({ preservePlayhead: true });
  });
  await page.waitForFunction(() => window.chart?.replaySystem?.isActive
    && window.chart.replaySystem.fullRawData?.length > 10, { timeout: 30_000 });
  await page.evaluate(() => window.chart.setTimeframe('1d'));
  await page.waitForFunction(() => window.chart?.currentTimeframe === '1d'
    && window.chart?.data?.length > 2, { timeout: 90_000 });

  for (const speed of speeds) {
    await page.evaluate((value) => {
      const replay = window.chart.replaySystem;
      replay.pause();
      replay.setPlaybackMode('tick', { restartPlayback: false });
      replay.setSpeed(value);
    }, speed);
    const before = await snapshot(`speed-${speed}-before`);
    await page.evaluate(() => window.chart.replaySystem.play());
    await sleep(cellMs);
    const live = await snapshot(`speed-${speed}-live`);
    await page.evaluate(() => window.chart.replaySystem.pause());
    const after = await snapshot(`speed-${speed}-after`);
    evidence.cells.push({
      speed, before, live, after,
      wallMs: live.at - before.at,
      marketMs: Number(live.replayTimestamp) - Number(before.replayTimestamp),
      indexDelta: Number(live.currentIndex) - Number(before.currentIndex),
      closedDelta: live.orders.closed.length - before.orders.closed.length,
    });
    if (live.currentIndex >= live.dataEndIndex || !live.isPlaying) break;
  }

  const transitionBefore = await snapshot('tf-transition-1d');
  await page.evaluate(() => window.chart.setTimeframe('1h'));
  await page.waitForFunction(() => window.chart?.currentTimeframe === '1h'
    && window.chart?.data?.length > 2, { timeout: 90_000 });
  const transitionAfter = await snapshot('tf-transition-1h');
  evidence.transition = { before: transitionBefore, after: transitionAfter };
  evidence.verdict = evidence.cells.some((cell) =>
    cell.live.playbackMode === 'tick'
    && cell.live.shouldUseTickAnimation === true
    && cell.live.cadenceSubdivisions === 1440
    && cell.marketMs > cell.wallMs * cell.speed * 2)
    ? 'RED_1D_TICK_SUBDIVIDED_FAST'
    : 'NOT_REPRODUCED';
  evidence.liveEvidenceStatus = 'captured';
} catch (error) {
  evidence.verdict = 'BLOCKED';
  evidence.reason = String(error?.stack || error);
  evidence.liveEvidenceStatus = sessionId === '849'
    ? 'authenticated-session-849-chart-readiness-blocked-no-live-order-or-heap-claim'
    : 'chart-readiness-blocked-no-live-order-or-heap-claim';
} finally {
  evidence.captureComplete = {
    ownerScopeValidated,
    sameOriginMutationsPrevented: mutations.length,
    mutationPolicy: 'default-block-except-auth-login',
  };
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close().catch(() => {});
  process.stdout.write(`${JSON.stringify({
    verdict: evidence.verdict,
    reason: evidence.reason || null,
    exactSessionId: evidence.sessionDiscovery?.exactSessionId || null,
    evidencePath: output,
    cells: evidence.cells.map((cell) => ({
      speed: cell.speed, wallMs: cell.wallMs, marketMs: cell.marketMs,
      indexDelta: cell.indexDelta, closedDelta: cell.closedDelta,
      effectiveSpeed: cell.live.effectiveSpeed,
      loopKind: cell.live.loopKind,
      shouldUseTickAnimation: cell.live.shouldUseTickAnimation,
      orderExecutionCadenceMs: cell.live.orderExecutionCadenceMs,
      tickBaseInterval: cell.live.scheduler.tickBaseInterval,
      heapUsed: cell.live.resources.jsHeapUsed,
    })),
  }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'BLOCKED' ? 2 : 0;
}
