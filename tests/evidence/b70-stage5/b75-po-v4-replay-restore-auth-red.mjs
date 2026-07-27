#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  decideMutation,
  diagnosticExitCode,
  MUTATING_METHODS,
} from './b75-po-v4-network-policy.mjs';
import { summarizeReplayRestoreMatrix } from './b75-po-v4-replay-restore-oracle.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = String(process.env.MC_RESTORE_SESSION_ID || '849');
const expectedBuild = String(process.env.MC_RESTORE_EXPECTED_BUILD || '20260726b75');
const allowCheckpointWrites = process.env.B75_ALLOW_QA_CHECKPOINT_WRITES === 'true';
const qaSessionId = String(process.env.B75_QA_SESSION_ID || '');
const expectedScopeSessionId = qaSessionId || sessionId;
const checkpointWriteCap = Math.max(0, Number(process.env.B75_QA_CHECKPOINT_WRITE_CAP || 0));
if (allowCheckpointWrites && (
  !qaSessionId || qaSessionId !== sessionId
  || !Number.isInteger(checkpointWriteCap) || checkpointWriteCap < 1
)) {
  throw new Error('write-enabled capture requires matching B75_QA_SESSION_ID and positive B75_QA_CHECKPOINT_WRITE_CAP');
}
const output = path.resolve(process.env.B75_PO_V4_EVIDENCE
  || path.join(os.tmpdir(), `b75-po-v4-replay-restore-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({
  headless: 'new',
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b75-po-v4-')),
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run'],
});
const page = await browser.newPage();
let ownerScopeValidated = false;
let allowedCheckpointWriteCount = 0;
const interceptedMutations = [];
const fatalUnknownMutations = [];
const targetOrigin = new URL(origin).origin;
await page.setRequestInterception(true);
page.on('request', async (request) => {
  const method = request.method().toUpperCase();
  let requestUrl = null;
  try { requestUrl = new URL(request.url()); } catch (_) {}
  const sameOrigin = requestUrl?.origin === targetOrigin;
  if (!sameOrigin || !MUTATING_METHODS.includes(method)) {
    await request.continue().catch(() => {});
    return;
  }
  const pathname = requestUrl.pathname;
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/state$/);
  const observedSessionId = match ? decodeURIComponent(match[1]) : null;
  const bodyText = request.postData() || '';
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch (_) {}
  const decision = decideMutation({
    method,
    pathname,
    sameOrigin,
    allowWrites: allowCheckpointWrites,
    expectedQaSessionId: expectedScopeSessionId,
    observedSessionId,
    ownerValidated: ownerScopeValidated,
    writeCap: checkpointWriteCap,
    allowedWriteCount: allowedCheckpointWriteCount,
  });
  const record = {
    method,
    endpoint: match ? '/api/sessions/[target-owner]/state' : pathname,
    endpointSha256: createHash('sha256').update(pathname).digest('hex'),
    observedScope: match
      ? (String(observedSessionId) === expectedScopeSessionId ? 'target-session' : 'unexpected-session')
      : 'not-session-scoped',
    ownerValidated: ownerScopeValidated,
    payloadSha256: createHash('sha256').update(bodyText).digest('hex'),
    payloadBytes: Buffer.byteLength(bodyText),
    payloadCategories: parsed && typeof parsed === 'object' ? Object.keys(parsed).sort() : ['unparsed'],
    stateCategories: parsed?.state && typeof parsed.state === 'object'
      ? Object.keys(parsed.state).sort() : [],
    disposition: decision.disposition,
    fatal: decision.fatal,
    reason: decision.reason || null,
  };
  interceptedMutations.push(record);
  if (decision.fatal) fatalUnknownMutations.push(record);
  if (decision.allowed) {
    if (decision.disposition === 'allowed-bounded-qa-write') {
      allowedCheckpointWriteCount += 1;
    }
    await request.continue().catch(() => {});
    return;
  }
  if (decision.disposition === 'allowed-auth-safe') {
    // Defensive: decideMutation currently reports auth-safe as allowed.
    await request.continue().catch(() => {});
    return;
  }
  if (decision.disposition === 'allowed-bounded-qa-write') {
    allowedCheckpointWriteCount += 1;
    await request.continue().catch(() => {});
    return;
  }
  await request.respond({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, diagnosticWritePrevented: true }),
  }).catch(() => {});
});
const evidence = {
  evidenceClass: allowCheckpointWrites
    ? 'authenticated-owner-scoped-b75-po-v4-bounded-qa-checkpoint-write-diagnostic'
    : 'authenticated-owner-scoped-b75-po-v4-network-observe-write-prevented-diagnostic',
  generatedAt: new Date().toISOString(),
  expectedBuild,
  browserProfile: 'fresh-ephemeral',
  sessionId: 'target-owner-session',
  cells: [],
  writes: [],
  lifecycle: [],
  pageErrors: [],
  networkPolicy: {
    mode: allowCheckpointWrites ? 'explicit-bounded-qa-checkpoint-writes' : 'prevent-session-state-writes',
    qaSessionId: qaSessionId ? 'qa-session-[configured]' : null,
    checkpointWriteCap,
  },
};
page.on('pageerror', (error) => evidence.pageErrors.push(String(error?.message || error).slice(0, 500)));

await page.evaluateOnNewDocument(({ allowWrites, expectedQaSessionId, writeCap }) => {
  const probe = window.__poV4 = {
    writes: [], lifecycle: [], allowedWriteCount: 0, preventedWriteCount: 0,
  };
  const sha256 = async (text) => {
    if (!crypto?.subtle) return null;
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  };
  for (const type of ['pagehide', 'beforeunload', 'unload', 'pageshow', 'visibilitychange']) {
    const target = type === 'visibilitychange' ? document : window;
    target.addEventListener(type, () => probe.lifecycle.push({
      type, at: performance.now(), visibilityState: document.visibilityState,
    }));
  }
  const originalFetch = window.fetch;
  window.fetch = async function observedFetch(input, init = {}) {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const method = String(init.method || 'GET').toUpperCase();
    const match = new URL(url, location.href).pathname.match(/^\/api\/sessions\/([^/]+)\/state$/);
    if (method === 'PATCH' && match) {
      const bodyText = String(init.body || '');
      let parsed = null;
      try { parsed = JSON.parse(bodyText); } catch (_) {}
      const replay = parsed?.state?.replay || parsed?.replay || null;
      const observedSessionId = decodeURIComponent(match[1]);
      const ownerValidated = sessionStorage.getItem('__b75PoV4OwnerSession') === observedSessionId;
      const boundedQaWrite = allowWrites
        && ownerValidated
        && observedSessionId === expectedQaSessionId
        && probe.allowedWriteCount < writeCap;
      const record = {
        at: performance.now(),
        method,
        endpoint: '/api/sessions/[qa-owner]/state',
        observedScope: observedSessionId === expectedQaSessionId ? 'configured-qa-session' : 'unexpected-session',
        ownerValidated,
        payloadSha256: await sha256(bodyText),
        payloadBytes: new TextEncoder().encode(bodyText).byteLength,
        payloadCategories: parsed && typeof parsed === 'object' ? Object.keys(parsed).sort() : ['unparsed'],
        stateCategories: parsed?.state && typeof parsed.state === 'object'
          ? Object.keys(parsed.state).sort() : [],
        disposition: boundedQaWrite ? 'allowed-bounded-qa-write' : 'prevented',
        replay: replay && {
          keys: Object.keys(replay).sort(),
          replayTimestamp: replay.replayTimestamp ?? null,
          currentIndex: replay.currentIndex ?? null,
          tickElapsedMs: replay.tickElapsedMs ?? null,
          playbackMode: replay.playbackMode ?? null,
          isPlaying: replay.isPlaying ?? null,
          hasAnimatingCandle: Object.hasOwn(replay, 'animatingCandle'),
          hasTickProgress: Object.hasOwn(replay, 'tickProgress'),
          hasTickPath: Object.hasOwn(replay, 'tickPath'),
        },
      };
      probe.writes.push(record);
      if (boundedQaWrite) probe.allowedWriteCount += 1;
      else probe.preventedWriteCount += 1;
    }
    return originalFetch.apply(this, arguments);
  };
}, {
  allowWrites: allowCheckpointWrites,
  expectedQaSessionId: expectedScopeSessionId,
  writeCap: checkpointWriteCap,
});

const chartUrl = `${origin}/chart/dist-v9/index.html?mode=backtest&sessionId=${encodeURIComponent(sessionId)}`;

async function ownerPreflight() {
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const result = await page.evaluate(async ({ loginEmail, loginPassword, sid }) => {
    const request = async (url, init = {}) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const identity = await request('/api/auth/me', { headers: { accept: 'application/json' } });
    const sessions = await request('/api/sessions', { headers: { accept: 'application/json' } });
    const rows = sessions.body?.sessions;
    return {
      loginStatus: login.status,
      identityStatus: identity.status,
      sessionsStatus: sessions.status,
      authenticated: !!identity.body?.user,
      ownerSessionDiscovered: Array.isArray(rows)
        && rows.some((row) => String(row?.id) === String(sid)),
    };
  }, { loginEmail: email, loginPassword: password, sid: sessionId });
  if (result.loginStatus !== 200 || result.identityStatus !== 200
    || result.sessionsStatus !== 200 || !result.authenticated || !result.ownerSessionDiscovered) {
    throw new Error(`authenticated owner preflight rejected: ${JSON.stringify(result)}`);
  }
  const cookies = await page.cookies(origin);
  const rootHttpOnly = cookies.filter((cookie) => cookie.httpOnly && cookie.path === '/');
  if (!rootHttpOnly.length) throw new Error('authenticated owner preflight lacks root HttpOnly cookie');
  return {
    ...result,
    sessionId: 'owner-session-849',
    cookieMetadata: rootHttpOnly.map(({ domain, path: cookiePath, secure, httpOnly, sameSite }) => ({
      name: '[auth-cookie]', domain, path: cookiePath, secure, httpOnly, sameSite,
    })),
  };
}

async function waitReady() {
  await page.waitForFunction((build) => {
    const chart = window.chart;
    return chart?.replaySystem?.isActive
      && Array.isArray(chart.replaySystem.fullRawData)
      && chart.replaySystem.fullRawData.length > 10
      && (!build || window.__TALARIA_CHART_BUILD_ID === build);
  }, { timeout: 120_000 }, expectedBuild);
}

async function snapshot(label) {
  return page.evaluate((snapLabel) => {
    const chart = window.chart;
    const replay = chart?.replaySystem;
    const forming = replay?.animatingCandle;
    const last = Array.isArray(chart?.data) ? chart.data.at(-1) : null;
    const raw = replay?.fullRawData?.[replay.currentIndex] || null;
    const localKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (/session|replay/i.test(key || '')) localKeys.push(key.replace(/\d+/g, '[id]'));
    }
    return {
      label: snapLabel,
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      replayMode: replay?.getPlaybackMode?.() || replay?.playbackMode || null,
      playPauseState: replay?.isPlaying ? 'playing' : 'paused',
      loopKind: replay?.getPlaybackLoopKind?.() || null,
      currentIndex: replay?.currentIndex ?? null,
      committedCandleIndex: replay?.animatingCandle ? Number(replay.currentIndex) - 1 : replay?.currentIndex ?? null,
      replayTimestamp: replay?.replayTimestamp ?? null,
      tickElapsedMs: replay?.tickElapsedMs ?? null,
      tickProgress: replay?.tickProgress ?? null,
      rawTickTimestamp: Number.isFinite(Number(replay?.replayTimestamp))
        ? Number(replay.replayTimestamp) + Math.max(0, Number(replay.tickElapsedMs) || 0) : null,
      rawCandle: raw && { timestamp: raw.t, open: raw.o, high: raw.h, low: raw.l, close: raw.c },
      formingCandle: forming && {
        timestamp: forming.t, open: forming.o, high: forming.h, low: forming.l, close: forming.c,
      },
      displayedLastCandle: last && {
        timestamp: last.t, open: last.o, high: last.h, low: last.l, close: last.c,
      },
      hover: {
        timestamp: chart?.currentCrosshairTimestamp ?? null,
        label: chart?._getCrosshairOverlayElements?.().timeLabel?.textContent || null,
        sourceDataIndex: chart?._multichartCrosshairSourceDataIndex ?? null,
      },
      persistence: {
        localStorageKeys: [...new Set(localKeys)].sort(),
        writes: window.__poV4?.writes || [],
        lifecycle: window.__poV4?.lifecycle || [],
      },
    };
  }, label);
}

async function setMode(mode) {
  await page.evaluate((nextMode) => window.chart.replaySystem.setPlaybackMode(nextMode), mode);
}

async function setOneHour() {
  await page.evaluate(() => window.chart.setTimeframe('1h'));
  await page.waitForFunction(() => window.chart?.currentTimeframe === '1h'
    && Array.isArray(window.chart?.data) && window.chart.data.length > 2, { timeout: 90_000 });
}

async function reachMidTick({ pause = true } = {}) {
  await setMode('tick');
  await page.evaluate(() => {
    const replay = window.chart.replaySystem;
    replay.setSpeed?.(60);
    if (!replay.isPlaying) replay.play();
  });
  await page.waitForFunction(() => {
    const replay = window.chart?.replaySystem;
    return replay?.isPlaying && replay.animatingCandle
      && Number(replay.tickProgress) >= 3
      && Number(replay.tickProgress) < Number(replay.currentTicksPerCandle || replay.ticksPerCandle || 72) - 2;
  }, { timeout: 30_000 });
  const live = await snapshot('mid-forming-before-pause');
  if (pause) {
    await page.evaluate(() => window.chart.replaySystem.pause());
    const paused = await snapshot('mid-forming-paused');
    return {
      ...paused,
      livePlayPauseState: live.playPauseState,
      rawTickTimestamp: live.rawTickTimestamp,
      tickElapsedMs: live.tickElapsedMs,
      tickProgress: live.tickProgress,
      formingCandle: live.formingCandle || paused.formingCandle,
    };
  }
  return live;
}

async function reloadAndReady() {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitReady();
}

async function addCell(kind, action) {
  const result = await action();
  evidence.cells.push({ kind, ...result });
}

try {
  evidence.preflight = await ownerPreflight();
  ownerScopeValidated = true;
  await page.evaluate((sid) => sessionStorage.setItem('__b75PoV4OwnerSession', sid), sessionId);
  await page.goto(chartUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitReady();
  await setOneHour();

  await addCell('candle-mode-control', async () => {
    await setMode('candle');
    await page.evaluate(() => {
      const replay = window.chart.replaySystem;
      if (!replay.isPlaying) replay.play();
    });
    await sleep(1300);
    await page.evaluate(() => window.chart.replaySystem.pause());
    const before = await snapshot('candle-paused-before-refresh');
    await reloadAndReady();
    return { before, after: await snapshot('candle-after-refresh') };
  });

  await addCell('paused-tick-refresh', async () => {
    const before = await reachMidTick();
    before.label = 'tick-paused-before-refresh';
    await reloadAndReady();
    return { before, after: await snapshot('tick-paused-after-refresh') };
  });

  await addCell('tick-exit-reentry', async () => {
    const before = await reachMidTick();
    before.label = 'tick-paused-before-exit';
    await page.evaluate(() => {
      const replay = window.chart.replaySystem;
      const timestamp = replay.replayTimestamp;
      replay.exitReplayMode();
      replay.enterReplayMode({ preservePlayhead: true, initialReplayTimestamp: timestamp });
    });
    await page.waitForFunction(() => window.chart?.replaySystem?.isActive, { timeout: 30_000 });
    return { before, after: await snapshot('tick-after-exit-reentry') };
  });

  await addCell('playing-refresh', async () => {
    await reachMidTick({ pause: false });
    await sleep(900);
    const before = await snapshot('playing-before-refresh');
    await reloadAndReady();
    return { before, after: await snapshot('playing-after-refresh') };
  });

  await addCell('forming-candle-hover', async () => {
    await reachMidTick();
    await page.evaluate(() => {
      const chart = window.chart;
      const index = chart.data.length - 1;
      const x = chart.dataIndexToPixel?.(index) ?? (chart.w - chart.margin.r - 5);
      const y = chart.h / 2;
      const rect = chart.canvas.getBoundingClientRect();
      chart.updateCrosshair({ clientX: rect.left + x, clientY: rect.top + y });
    });
    const before = await snapshot('forming-hover');
    return { before, after: before };
  });

  evidence.matrix = summarizeReplayRestoreMatrix(evidence.cells);
  evidence.verdict = evidence.matrix.verdict;
  evidence.mutations = interceptedMutations;
  evidence.captureComplete = {
    complete: fatalUnknownMutations.length === 0,
    sameOriginMutatingMethods: [...MUTATING_METHODS],
    interceptionInstalledBeforeFirstNavigation: true,
    requestRecords: interceptedMutations.length,
    fatalUnknownMutations: fatalUnknownMutations.length,
  };
  evidence.writes = interceptedMutations.filter((record) =>
    record.disposition === 'allowed-bounded-qa-write');
  if (fatalUnknownMutations.length) {
    evidence.verdict = 'BLOCKED_UNKNOWN_MUTATION';
    evidence.reason = `${fatalUnknownMutations.length} unknown or scope-invalid mutation(s) prevented`;
  }
  evidence.lifecycle = evidence.cells.flatMap((cell) => [
    ...(cell.before?.persistence?.lifecycle || []),
    ...(cell.after?.persistence?.lifecycle || []),
  ]);
} catch (error) {
  evidence.verdict = 'BLOCKED';
  evidence.reason = String(error?.stack || error);
} finally {
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close().catch(() => {});
  process.stdout.write(`${JSON.stringify({
    verdict: evidence.verdict,
    reason: evidence.reason || null,
    evidencePath: output,
    mechanisms: evidence.matrix?.mechanisms || null,
    cells: evidence.matrix?.cells?.map((cell) => ({
      kind: cell.kind, verdict: cell.oracle.verdict, secondsLost: cell.oracle.secondsLost,
    })) || [],
  }, null, 2)}\n`);
  process.exitCode = diagnosticExitCode({
    verdict: evidence.verdict,
    captureComplete: evidence.captureComplete?.complete === true,
    fatalMutationCount: evidence.captureComplete?.fatalUnknownMutations ?? 0,
  });
}
