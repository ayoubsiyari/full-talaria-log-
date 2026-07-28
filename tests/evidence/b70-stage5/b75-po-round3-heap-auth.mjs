#!/usr/bin/env node
/**
 * B75 PO Round 3 authenticated multichart heap investigation.
 * Diagnostic only: all non-auth/lease mutations are blocked. Raw heaps are
 * temporary and deleted; committed output contains sanitized aggregates only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { configuredSessionAssignments } from './mc-restore-session-fixture.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const requested = String(process.env.B75_QA_SESSION_ID || 'QA 123');
const cycles = Math.max(5, Number(process.env.B75_HEAP_CYCLES || 5));
const playMs = Math.max(10_000, Number(process.env.B75_HEAP_PLAY_MS || 30_000));
const settleMs = Math.max(1_000, Number(process.env.B75_HEAP_SETTLE_MS || 5_000));
const delayedGcMs = Math.max(5_000, Number(process.env.B75_HEAP_DELAYED_GC_MS || 15_000));
const output = path.resolve(process.env.B75_HEAP_EVIDENCE
  || path.join(os.tmpdir(), `b75-po-round3-heap-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const allow = new Set([
  'POST /api/auth/login',
  'POST /api/chart/windows/claim',
  'POST /api/chart/windows/heartbeat',
  'POST /api/chart/windows/release',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const heapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b75-round3-heaps-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b75-round3-profile-'));
const evidence = {
  schema: 'talaria-b75-po-round3-heap-v1',
  generatedAt: new Date().toISOString(),
  run: { cycles, speed: 60, playMs, settleMs, delayedGcMs },
  controls: ['four-panel-none', 'four-panel-sma20', 'four-panel-sma20-local-orders'],
  mutationPolicy: { mode: 'default-block', allowed: [...allow], i16CleanRequired: true },
  blockedMutations: [],
  pageErrors: [],
  arms: [],
  rawHeapPolicy: { committed: false, ephemeral: true, cleanupComplete: false },
  verdict: 'INCONCLUSIVE',
};

function slope(values) {
  const rows = values.map((y, x) => ({ x, y })).filter((r) => Number.isFinite(r.y));
  if (rows.length < 2) return null;
  const mx = rows.reduce((n, r) => n + r.x, 0) / rows.length;
  const my = rows.reduce((n, r) => n + r.y, 0) / rows.length;
  const den = rows.reduce((n, r) => n + (r.x - mx) ** 2, 0);
  return den ? rows.reduce((n, r) => n + (r.x - mx) * (r.y - my), 0) / den : null;
}

function classify(arm) {
  if (arm.cycles.length < cycles || arm.blocker) return 'INCONCLUSIVE';
  const floors = arm.cycles.map((c) => c.returnSingleForcedGc?.cdp?.JSHeapUsedSize);
  const floorSlope = slope(floors);
  const growth = floors.at(-1) - floors[0];
  const releases = arm.cycles.map((c) => c.teardown?.cdp?.JSHeapUsedSize)
    .filter(Number.isFinite);
  if (floorSlope > 20 * 1024 * 1024 && growth > 100 * 1024 * 1024) return 'LEAK';
  if (Math.abs(floorSlope) <= 2 * 1024 * 1024 && growth <= 32 * 1024 * 1024) {
    const firstStep = floors[0] - arm.baseline.cdp.JSHeapUsedSize;
    return firstStep > 32 * 1024 * 1024 ? 'ONE_TIME_WORKING_SET' : 'EXPECTED_BOUNDED';
  }
  if (releases.length === cycles && releases.at(-1) < floors.at(-1) * 0.25) return 'EXPECTED_BOUNDED';
  return 'INCONCLUSIVE';
}

async function instrument(page) {
  await page.evaluateOnNewDocument(() => {
    const p = window.__b75Heap = {
      timers: new Map(), workers: [], listenerAdds: 0, listenerRemoves: 0,
      generations: [], sequence: 0,
    };
    const st = window.setTimeout, si = window.setInterval;
    const ct = window.clearTimeout, ci = window.clearInterval;
    const wrap = (kind, native) => function (callback, delay, ...args) {
      let id;
      id = native.call(this, (...cbArgs) => {
        if (kind === 'timeout') p.timers.delete(id);
        return typeof callback === 'function' ? callback(...cbArgs) : undefined;
      }, delay, ...args);
      p.timers.set(id, { kind, delay: Number(delay) || 0 });
      return id;
    };
    window.setTimeout = wrap('timeout', st);
    window.setInterval = wrap('interval', si);
    window.clearTimeout = (id) => { p.timers.delete(id); return ct(id); };
    window.clearInterval = (id) => { p.timers.delete(id); return ci(id); };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args) {
      p.listenerAdds++; return add.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      p.listenerRemoves++; return remove.apply(this, args);
    };
    const NativeWorker = window.Worker;
    if (NativeWorker) window.Worker = class ObservedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        const row = { alive: true };
        p.workers.push(row);
        const terminate = this.terminate;
        this.terminate = function () { row.alive = false; return terminate.call(this); };
      }
    };
  });
}

async function metrics(cdp) {
  const { metrics: rows } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(rows.filter(({ name }) =>
    /^(JSHeapUsedSize|JSHeapTotalSize|Nodes|Documents|Frames|JSEventListeners|TaskDuration)$/.test(name))
    .map(({ name, value }) => [name, value]));
}

async function heapAggregate(cdp, label) {
  const file = path.join(heapDir, `${label}.heapsnapshot`);
  const stream = fs.createWriteStream(file);
  let bytes = 0;
  const hash = createHash('sha256');
  const onChunk = ({ chunk }) => { bytes += Buffer.byteLength(chunk); hash.update(chunk); stream.write(chunk); };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
  }
  fs.rmSync(file, { force: true });
  return { serializedBytes: bytes, sha256: hash.digest('hex'), rawDeleted: true };
}

async function snapshot(page, cdp, label, { gc = false, heap = false } = {}) {
  if (gc) await cdp.send('HeapProfiler.collectGarbage');
  if (gc) await sleep(settleMs);
  const runtime = await page.evaluate(() => {
    const manager = window.__multichartManagerRef || window.__mcManager;
    const entries = manager?.charts ? [...manager.charts.values()] : [];
    const windows = entries.length
      ? entries.map((entry) => entry.host ? window : entry.frame?.contentWindow).filter(Boolean)
      : [window];
    const panels = windows.map((win, index) => {
      const chart = win.chart;
      const probe = win.__b75Heap;
      const indicators = chart?.indicators;
      const queueKeys = Object.keys(chart || {}).filter((key) => /queue|pending|frame/i.test(key)).slice(0, 40);
      return {
        panel: String.fromCharCode(65 + index),
        raw: chart?.rawData?.length ?? null,
        processed: chart?.data?.length ?? null,
        replayRaw: chart?.replaySystem?.fullRawData?.length ?? null,
        indicatorSeries: indicators?.data ? Object.keys(indicators.data).length : null,
        indicatorActive: indicators?.active?.length ?? null,
        queues: Object.fromEntries(queueKeys.map((key) => {
          const value = chart[key];
          return [key, Array.isArray(value) ? value.length
            : (value instanceof Map || value instanceof Set ? value.size : (value ? 1 : 0))];
        })),
        generation: chart?._renderGeneration ?? chart?._indicatorRenderVersion ?? null,
        replayGeneration: chart?.replaySystem?._generation ?? chart?.replaySystem?._ownerGeneration ?? null,
        canvases: win.document.querySelectorAll('canvas').length,
        canvasPixels: [...win.document.querySelectorAll('canvas')].reduce((n, c) => n + c.width * c.height, 0),
        timers: probe?.timers?.size ?? null,
        workersCreated: probe?.workers?.length ?? null,
        workersAlive: probe?.workers?.filter((w) => w.alive).length ?? null,
        listenerBalance: probe ? probe.listenerAdds - probe.listenerRemoves : null,
      };
    });
    return {
      panels,
      resources: {
        panelCount: panels.length,
        canvases: panels.reduce((n, p) => n + (p.canvases || 0), 0),
        canvasPixels: panels.reduce((n, p) => n + (p.canvasPixels || 0), 0),
        timers: panels.reduce((n, p) => n + (p.timers || 0), 0),
        workersAlive: panels.reduce((n, p) => n + (p.workersAlive || 0), 0),
        detachedIframes: [...document.querySelectorAll('iframe')].filter((f) => !f.isConnected).length,
      },
    };
  });
  runtime.label = label;
  runtime.cdp = await metrics(cdp);
  const usage = await cdp.send('Runtime.getHeapUsage');
  runtime.arrayBuffers = { measured: false, reason: 'CDP does not expose reliable backing-store bytes by panel' };
  runtime.heapUsage = usage;
  if (heap) runtime.heap = await heapAggregate(cdp, label);
  return runtime;
}

async function setLayout(page, sessionId, assignments, layout) {
  if (!page.url().startsWith(`${origin}/`)) {
    await page.goto(`${origin}/login/`,
      { waitUntil: 'domcontentloaded', timeout: 120_000 });
  }
  await page.evaluate(({ sid, rows, nextLayout }) => {
    const count = nextLayout === '4' ? 4 : 1;
    localStorage.setItem('active_trading_session_id', sid);
    localStorage.setItem('chart_panel_state', JSON.stringify({
      layout: nextLayout, selectedPanelIndex: 0, sessionId: sid,
      panels: rows.slice(0, count).map((row, index) => ({
        index, isMainChart: index === 0, timeframe: '1m',
        fileId: row.fileId, symbol: row.ticker, ticker: row.ticker,
      })),
    }));
  }, { sid: sessionId, rows: assignments, nextLayout: layout });
  await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=${layout}&sessionId=${encodeURIComponent(sessionId)}`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction((count) => {
    const manager = window.__multichartManagerRef || window.__mcManager;
    if (count === 1) return window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 2;
    return manager?.charts?.size === count
      && [...manager.charts.values()].every((entry) => entry.ready);
  }, { timeout: 120_000 }, Number(layout));
}

async function configureArm(page, armName) {
  await page.evaluate((name) => {
    const manager = window.__multichartManagerRef || window.__mcManager;
    for (const entry of manager.charts.values()) {
      const win = entry.host ? window : entry.frame?.contentWindow;
      const chart = win?.chart;
      if (!chart) continue;
      chart.indicators.active = name === 'none' ? [] : [{
        id: 'b75-round3-sma20', type: 'sma', name: 'SMA(20)',
        params: { period: 20 }, style: { color: '#2962ff', lineWidth: 1 },
      }];
      chart.indicators.data = {};
      chart.recalculateIndicators?.();
      if (name === 'sma20-local-orders') {
        // Visual-only synthetic state: never invoke order services or persistence.
        chart.__b75SyntheticOrderVisuals = [
          { id: 'local-1', side: 'buy', price: chart.data.at(-1)?.c, localOnly: true },
          { id: 'local-2', side: 'sell', price: chart.data.at(-2)?.c, localOnly: true },
        ];
      }
    }
  }, armName);
}

async function runArm(browser, sessionId, assignments, armName) {
  const page = await browser.newPage();
  await instrument(page);
  const cdp = await page.target().createCDPSession();
  await Promise.all([cdp.send('Performance.enable'), cdp.send('HeapProfiler.enable')]);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let url;
    try { url = new URL(request.url()); } catch {}
    const key = `${request.method().toUpperCase()} ${url?.pathname || ''}`;
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method().toUpperCase());
    if (!mutating || url?.origin !== new URL(origin).origin || allow.has(key)) return request.continue().catch(() => {});
    evidence.blockedMutations.push({ arm: armName, method: request.method(), pathHash: createHash('sha256').update(url.pathname).digest('hex'), disposition: 'prevented' });
    // Acknowledge locally so product boot is not coupled to persistence, while
    // preventing the request from reaching the server (I16-clean).
    return request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"diagnosticIntercepted":true}' }).catch(() => {});
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(String(error?.message || error).slice(0, 400)));
  const arm = { name: armName, cycles: [] };
  try {
    await setLayout(page, sessionId, assignments, '1');
    arm.baseline = await snapshot(page, cdp, `${armName}-baseline-single`, { gc: true, heap: true });
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const row = { cycle };
      await setLayout(page, sessionId, assignments, '4');
      await configureArm(page, armName);
      row.fourPanelPaused = await snapshot(page, cdp, `${armName}-c${cycle}-four-paused`, { gc: true });
      await page.evaluate(() => {
        const manager = window.__multichartManagerRef || window.__mcManager;
        for (const entry of manager.charts.values()) {
          const replay = (entry.host ? window.chart : entry.frame?.contentWindow?.chart)?.replaySystem;
          replay?.setPlaybackMode?.('tick');
          replay?.setSpeed?.(60);
          replay?.play?.();
        }
      });
      row.start60x = await snapshot(page, cdp, `${armName}-c${cycle}-60x-start`);
      await sleep(Math.floor(playMs / 2));
      row.peak60x = await snapshot(page, cdp, `${armName}-c${cycle}-60x-peak`);
      await sleep(Math.ceil(playMs / 2));
      row.steady60x = await snapshot(page, cdp, `${armName}-c${cycle}-60x-steady`);
      await page.evaluate(() => {
        const manager = window.__multichartManagerRef || window.__mcManager;
        for (const entry of manager.charts.values()) {
          const chart = entry.host ? window.chart : entry.frame?.contentWindow?.chart;
          chart?.replaySystem?.pause?.();
        }
      });
      await setLayout(page, sessionId, assignments, '1');
      row.returnSingle = await snapshot(page, cdp, `${armName}-c${cycle}-single`);
      row.returnSingleForcedGc = await snapshot(page, cdp, `${armName}-c${cycle}-single-gc`, { gc: true, heap: true });
      await sleep(delayedGcMs);
      row.delayedGcSettle = await snapshot(page, cdp, `${armName}-c${cycle}-delayed-gc`, { gc: true });
      await page.goto('about:blank', { waitUntil: 'load' });
      row.teardown = await snapshot(page, cdp, `${armName}-c${cycle}-teardown`, { gc: true });
      arm.cycles.push(row);
    }
    arm.heapFloorSlopeBytesPerCycle = slope(arm.cycles.map((c) => c.returnSingleForcedGc.cdp.JSHeapUsedSize));
    arm.cpuTaskDurationSlopeSecondsPerCycle = slope(arm.cycles.map((c) => c.steady60x.cdp.TaskDuration));
    arm.peakHeapBytes = Math.max(...arm.cycles.flatMap((c) =>
      [c.start60x, c.peak60x, c.steady60x].map((s) => s.cdp.JSHeapUsedSize)));
    arm.classification = classify(arm);
  } catch (error) {
    arm.blocker = String(error?.message || error).replaceAll(sessionId, '[owner-qa-session]');
    arm.classification = 'INCONCLUSIVE';
  } finally {
    await page.close().catch(() => {});
  }
  return arm;
}

const browser = await puppeteer.launch({
  headless: 'new', userDataDir: profileDir,
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const discovery = await page.evaluate(async ({ e, p, wanted }) => {
    const login = await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) });
    const sessionsResponse = await fetch('/api/sessions', { credentials: 'include', cache: 'no-store' });
    const filesResponse = await fetch('/api/files?session_ready=1', { credentials: 'include', cache: 'no-store' });
    const sessions = (await sessionsResponse.json()).sessions || [];
    const filesBody = await filesResponse.json();
    const exact = sessions.find((row) => String(row.id) === wanted || String(row.name || row.title || '').trim() === wanted);
    const candidates = exact ? [exact] : sessions;
    return { statuses: [login.status, sessionsResponse.status, filesResponse.status], candidates, files: Array.isArray(filesBody) ? filesBody : (filesBody.files || filesBody.data || []) };
  }, { e: email, p: password, wanted: requested });
  if (discovery.statuses.some((status) => status !== 200)) throw new Error(`owner discovery failed (${discovery.statuses.join(',')})`);
  let selected = null;
  for (const candidate of discovery.candidates) {
    const detail = await page.evaluate(async (id) => {
      const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    }, candidate.id);
    if (detail.status !== 200) continue;
    try {
      const assignments = configuredSessionAssignments(detail.body.session, discovery.files, 4);
      if (new Set(assignments.map((row) => String(row.fileId))).size === 4) {
        selected = { id: String(candidate.id), assignments, exactQa123: candidate === discovery.candidates[0] && !!discovery.candidates.find((row) => row === candidate && (String(row.id) === requested || String(row.name || row.title || '').trim() === requested)) };
        break;
      }
    } catch {}
  }
  await page.close();
  if (!selected) throw new Error('QA 123 did not validate four distinct session-ready files and no eligible owner QA fallback was used');
  evidence.ownerScope = { validated: true, sessionAlias: 'owner-qa-session', requestedQa123: requested === 'QA 123', exactQa123Validated: selected.exactQa123, files: ['file-A', 'file-B', 'file-C', 'file-D'] };
  for (const armName of ['none', 'sma20', 'sma20-local-orders']) {
    evidence.arms.push(await runArm(browser, selected.id, selected.assignments, armName));
  }
  const verdicts = evidence.arms.map((arm) => arm.classification);
  evidence.verdict = verdicts.includes('LEAK') ? 'LEAK'
    : (verdicts.every((v) => v === 'EXPECTED_BOUNDED') ? 'EXPECTED_BOUNDED'
      : (verdicts.every((v) => ['EXPECTED_BOUNDED', 'ONE_TIME_WORKING_SET'].includes(v)) ? 'ONE_TIME_WORKING_SET' : 'INCONCLUSIVE'));
  evidence.i16Clean = evidence.blockedMutations.every((row) => row.disposition === 'prevented');
} catch (error) {
  evidence.blocker = String(error?.message || error);
  evidence.verdict = 'INCONCLUSIVE';
} finally {
  evidence.rawHeapPolicy.cleanupComplete = true;
  await browser.close().catch(() => {});
  fs.rmSync(heapDir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ verdict: evidence.verdict, output, blocker: evidence.blocker || null }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'INCONCLUSIVE' ? 2 : 0;
}
