#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { authenticatedSessionPreflight } from './authenticated-session-preflight.mjs';
import {
  B75_ROWS, classifyFocusJitter, classifyReplayStartFreeze,
  classifySaturationRecurrence, classifySymbolLatency, classifyTimeframePersistence,
  triageOrder,
} from './b75-new-mechanism-oracles.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const sessionId = String(process.env.B75_QA_SESSION_ID || '123');
const captureMs = Math.max(20_000, Number(process.env.B75_CAPTURE_MS || 75_000));
const output = path.resolve(process.env.B75_NEW_ROWS_EVIDENCE
  || path.join(os.tmpdir(), `b75-five-new-mechanisms-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const allowedMutations = new Set([
  'POST /api/auth/login',
  'POST /api/chart/windows/claim',
  'POST /api/chart/windows/heartbeat',
  'POST /api/chart/windows/release',
]);
const switchNames = Object.freeze([
  '__TALARIA_DISABLE_M19I_TAIL_SEND_V1',
  '__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1',
  '__TALARIA_DISABLE_M19I_WORKER_PORT_V1',
  '__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1',
  '__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1',
  '__TALARIA_DISABLE_M19I_TICK_COHERENT_V1',
  '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence = {
  schema: 'talaria-b75-five-new-mechanisms-v1',
  generatedAt: new Date().toISOString(),
  buildExpected: process.env.B75_EXPECTED_BUILD || null,
  lineage: { batch: 'B75', newRows: B75_ROWS, doesNotModify: ['B70 closed rows'] },
  requestedSession: 'QA-123',
  mutationPolicy: { mode: 'default-block', allowed: [...allowedMutations] },
  blockedMutations: [],
  causalTrace: [],
  switchNames,
  classifications: {},
  triageOrder: triageOrder(),
  verdict: 'INCONCLUSIVE',
};

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run'],
});
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (request) => {
  let url;
  try { url = new URL(request.url()); } catch {}
  const key = `${request.method().toUpperCase()} ${url?.pathname || ''}`;
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method().toUpperCase());
  if (!mutating || url?.origin !== origin || allowedMutations.has(key)) {
    return request.continue().catch(() => {});
  }
  evidence.blockedMutations.push({ method: request.method(), path: url.pathname, disposition: 'blocked' });
  return request.respond({ status: 409, contentType: 'application/json',
    body: '{"detail":{"code":"b75_diagnostic_mutation_blocked"}}' }).catch(() => {});
});

await page.evaluateOnNewDocument((names) => {
  const p = window.__b75NewProbe = {
    startedAt: performance.now(), raf: [], focus: [], fetches: [], aborts: [],
    storage: [], replay: [], frames: [], longTasks: [], sequence: 0,
  };
  const stamp = (kind, detail = {}) => ({ kind, at: performance.now(), seq: ++p.sequence, ...detail });
  const nativeRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function observedRaf(callback) {
    const requestedAt = performance.now();
    return nativeRaf.call(this, (at) => {
      p.raf.push(stamp('raf', { requestedAt, firedAt: at, gapMs: at - requestedAt,
        focused: document.hasFocus(), visibility: document.visibilityState }));
      if (p.raf.length > 10_000) p.raf.shift();
      callback(at);
    });
  };
  for (const type of ['focus', 'blur', 'visibilitychange', 'pointerdown']) {
    addEventListener(type, () => p.focus.push(stamp(type, {
      focused: document.hasFocus(), visibility: document.visibilityState,
    })), true);
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const generation = ++p.sequence;
    const row = stamp('fetch:start', { generation, path: url.pathname,
      panelId: window.chart?.panelId ?? null, aborted: false });
    p.fetches.push(row);
    if (init.signal) init.signal.addEventListener('abort', () => {
      row.aborted = true; row.abortAt = performance.now();
      p.aborts.push(stamp('fetch:abort', { generation, path: url.pathname }));
    }, { once: true });
    try {
      const response = await nativeFetch(input, init);
      row.settledAt = performance.now(); row.status = response.status;
      return response;
    } catch (error) {
      row.settledAt = performance.now(); row.error = error?.name || 'Error';
      throw error;
    }
  };
  for (const method of ['setItem', 'removeItem', 'clear']) {
    const native = Storage.prototype[method];
    Storage.prototype[method] = function observedStorage(...args) {
      const key = method === 'clear' ? '*' : String(args[0]);
      p.storage.push(stamp(`storage:${method}`, {
        area: this === localStorage ? 'local' : 'session', key,
        timeframeRelated: /timeframe|panel.state|multichart/i.test(key),
      }));
      return native.apply(this, args);
    };
  }
  if (window.PerformanceObserver) {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((entry) =>
        p.longTasks.push(stamp('longtask', { duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    } catch {}
  }
  window.__b75SwitchState = Object.fromEntries(names.map((name) => [name, window[name] === true]));
}, switchNames);

async function runtimeSnapshot(label) {
  return page.evaluate((snapshotLabel) => {
    const manager = window.__multichartManagerRef || window.__mcManager;
    const entries = manager?.charts ? [...manager.charts.values()] : [];
    const panels = entries.map((entry, index) => {
      const win = entry.host ? window : entry.frame?.contentWindow;
      const chart = win?.chart;
      const replay = chart?.replaySystem;
      return {
        panelId: entry.id ?? index, owner: entry.host ? 'host' : 'iframe',
        ready: entry.ready ?? null, fileIdPresent: chart?.currentFileId != null,
        timeframe: chart?.currentTimeframe ?? entry.state?.timeframe ?? null,
        replayIndex: replay?.currentIndex ?? null, replayPlaying: replay?.isPlaying ?? null,
        dataVersion: chart?.dataVersion ?? null, frameQueueDepth:
          chart?._frameQueue?.length ?? chart?._renderQueue?.length ?? chart?._pendingFrames ?? null,
        workerBusy: chart?._indicatorWorkerBusy ?? null,
        barrier: chart?._replayBarrier ?? chart?._restoreBarrier ?? null,
      };
    });
    const probe = window.__b75NewProbe;
    return {
      label: snapshotLabel, at: performance.now(), focused: document.hasFocus(),
      visibility: document.visibilityState, panels,
      manager: {
        pendingCommands: manager?._pendingCmds?.size ?? null,
        restoreGeneration: manager?._mcRestoreGeneration ?? null,
        restoreCompletedGeneration: manager?._mcRestoreCompletedGeneration ?? null,
      },
      switchState: window.__b75SwitchState,
      probeCounts: Object.fromEntries(['raf', 'focus', 'fetches', 'aborts', 'storage', 'longTasks']
        .map((key) => [key, probe[key].length])),
    };
  }, label);
}

try {
  const preflight = await authenticatedSessionPreflight(page, { origin, email, password, sessionId });
  if (preflight.sessionId !== '123') throw new Error('QA 123 exact-session validation failed');
  evidence.authentication = { valid: true, ownerSession: 'QA-123', endpoints: preflight.endpoints };
  const url = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=4&sessionId=123`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => {
    const m = window.__multichartManagerRef || window.__mcManager;
    return m?.charts?.size === 4 && [...m.charts.values()].every((entry) => entry.ready);
  }, { timeout: 90_000 });
  evidence.causalTrace.push(await runtimeSnapshot('baseline'));
  const started = Date.now();
  while (Date.now() - started < captureMs) {
    await sleep(250);
    evidence.causalTrace.push(await runtimeSnapshot('sample'));
  }
  const raw = await page.evaluate(() => {
    const p = window.__b75NewProbe;
    return { raf: p.raf, focus: p.focus, fetches: p.fetches, aborts: p.aborts,
      storage: p.storage, longTasks: p.longTasks };
  });
  evidence.rawTrace = raw;
  evidence.classifications = {
    'B75-N1': classifySymbolLatency({}),
    'B75-N2': classifyFocusJitter({}),
    'B75-N3': classifyReplayStartFreeze({}),
    'B75-N4': classifyTimeframePersistence({
      panelCount: 4, storageScope: 'observed-only',
      savedPanelTimeframes: evidence.causalTrace[0].panels.map((p) => p.timeframe),
      reopenedPanelTimeframes: null,
    }),
    'B75-N5': classifySaturationRecurrence({ cureOn: {}, cureOff: {}, control: {} }),
  };
  evidence.verdict = 'CAPTURE_COMPLETE_ORACLES_REQUIRE_TRIGGER_ARMS';
} catch (error) {
  evidence.blocker = String(error?.message || error).replaceAll(email, '[redacted]');
  evidence.verdict = 'BLOCKED';
} finally {
  await browser.close().catch(() => {});
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ verdict: evidence.verdict, output,
    blocker: evidence.blocker || null }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'BLOCKED' ? 2 : 0;
}
