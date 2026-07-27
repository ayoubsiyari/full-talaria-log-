#!/usr/bin/env node
/**
 * Authenticated, owner-scoped V5 memory diagnostic.
 *
 * Raw Chromium heaps are written only below os.tmpdir() and are removed after
 * sanitized aggregate extraction. This lane never changes product code.
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
const requestedSessionId = String(process.env.B75_QA_SESSION_ID || '');
const output = path.resolve(process.env.B75_V5_MEMORY_EVIDENCE
  || path.join(os.tmpdir(), `b75-v5-symbol-timeframe-memory-${Date.now()}.json`));
const checkpoints = Object.freeze([0, 10, 25, 50]);
const settleMs = Math.max(500, Number(process.env.B75_V5_SETTLE_MS || 1500));
const loadTimeoutMs = Math.max(30_000, Number(process.env.B75_V5_LOAD_TIMEOUT_MS || 120_000));
const arms = String(process.env.B75_V5_ARMS || 'churn,no-churn,symbol-only,timeframe-only')
  .split(',').map((v) => v.trim()).filter(Boolean);
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const thresholds = Object.freeze({
  declarationTiming: 'fixed-in-source-before-capture',
  minimumCycles: 50,
  leak: {
    minPostGcRetainedSlopeBytesPerCycle: 2 * 1024 * 1024,
    minPostGcGrowthBytes: 100 * 1024 * 1024,
    minOutgoingGenerationsStronglyReachable: 5,
    maxTeardownReleaseFraction: 0.80,
  },
  expectedBounded: {
    maxPostGcRetainedSlopeBytesPerCycle: 256 * 1024,
    maxPostGcGrowthBytes: 32 * 1024 * 1024,
    minTeardownReleaseFraction: 0.80,
  },
});
const operationalMutationAllowlist = new Set([
  'POST /api/auth/login',
  'POST /api/chart/windows/claim',
  'POST /api/chart/windows/heartbeat',
  'POST /api/chart/windows/release',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aliasHash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const heapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-v5-memory-heaps-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-v5-memory-profile-'));
const evidence = {
  schema: 'talaria-v5-symbol-timeframe-memory-v1',
  generatedAt: new Date().toISOString(),
  hypothesis: 'Repeated A-B-C-A symbol changes combined with 1m-1D timeframe switches may retain memory; causality is not assumed.',
  thresholds,
  ownerScope: null,
  readinessMutationClassification: {
    path: '/api/chart/windows/claim',
    method: 'POST',
    class: 'operational-authenticated-window-concurrency-lease',
    dataMutation: false,
    requiredBecause: 'heavy /api/file and session-state reads are gated on ensureClaimed() and its window id header',
    priorRunLimitation: 'synthetic interception did not establish a server-recognized lease; readiness therefore could not be attributed to chart data',
  },
  mutationPolicy: {
    mode: 'default-block',
    allowed: [...operationalMutationAllowlist],
    note: 'Only authentication and disposable chart-window lease lifecycle are allowed; session, trading, drawing, preference, and settings writes remain blocked.',
  },
  arms: [],
  blockedMutations: [],
  pageErrors: [],
  rawHeapPolicy: {
    committed: false,
    location: 'ephemeral OS temp directory',
    disposition: 'deleted after sanitized aggregate extraction',
  },
  verdict: 'INCONCLUSIVE',
};

function linearSlope(samples) {
  const rows = samples.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y));
  if (rows.length < 2) return null;
  const mx = rows.reduce((s, r) => s + r.x, 0) / rows.length;
  const my = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const denominator = rows.reduce((s, r) => s + ((r.x - mx) ** 2), 0);
  return denominator ? rows.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0) / denominator : null;
}

function classifyArm(arm) {
  const samples = arm.snapshots.filter((s) => checkpoints.includes(s.cycle));
  const baseline = samples.find((s) => s.cycle === 0);
  const last = samples.find((s) => s.cycle === 50);
  if (!baseline || !last) return { verdict: 'INCONCLUSIVE', reason: 'required checkpoints incomplete' };
  const slope = linearSlope(samples.map((s) => ({ x: s.cycle, y: s.cdp.JSHeapUsedSize })));
  const growth = last.cdp.JSHeapUsedSize - baseline.cdp.JSHeapUsedSize;
  const release = arm.teardown && Number.isFinite(last.cdp.JSHeapUsedSize)
    ? Math.max(0, last.cdp.JSHeapUsedSize - arm.teardown.cdp.JSHeapUsedSize) / Math.max(1, last.cdp.JSHeapUsedSize)
    : null;
  const outgoingStrong = last.generations?.stronglyReachableOutgoing ?? null;
  if (slope >= thresholds.leak.minPostGcRetainedSlopeBytesPerCycle
      && growth >= thresholds.leak.minPostGcGrowthBytes
      && outgoingStrong >= thresholds.leak.minOutgoingGenerationsStronglyReachable
      && release < thresholds.leak.maxTeardownReleaseFraction) {
    return { verdict: 'LEAK', slopeBytesPerCycle: slope, growthBytes: growth, teardownReleaseFraction: release };
  }
  if (slope <= thresholds.expectedBounded.maxPostGcRetainedSlopeBytesPerCycle
      && growth <= thresholds.expectedBounded.maxPostGcGrowthBytes
      && release >= thresholds.expectedBounded.minTeardownReleaseFraction
      && outgoingStrong === 0) {
    return { verdict: 'EXPECTED_BOUNDED_WORKING_SET', slopeBytesPerCycle: slope, growthBytes: growth, teardownReleaseFraction: release };
  }
  return { verdict: 'INCONCLUSIVE', slopeBytesPerCycle: slope, growthBytes: growth, teardownReleaseFraction: release };
}

async function newInstrumentedPage(browser) {
  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await Promise.all([cdp.send('Performance.enable'), cdp.send('HeapProfiler.enable')]);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    let url;
    try { url = new URL(request.url()); } catch {}
    const method = request.method().toUpperCase();
    const key = `${method} ${url?.pathname || ''}`;
    const sameOrigin = url?.origin === new URL(origin).origin;
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!sameOrigin || !mutating || operationalMutationAllowlist.has(key)) {
      return request.continue().catch(() => {});
    }
    evidence.blockedMutations.push({
      method,
      pathSha256: createHash('sha256').update(url.pathname).digest('hex'),
      disposition: 'prevented',
    });
    return request.respond({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ detail: { code: 'diagnostic_mutation_prevented' } }),
    }).catch(() => {});
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(String(error?.message || error).slice(0, 400)));
  await page.evaluateOnNewDocument(() => {
    const p = window.__v5MemoryProbe = {
      timers: new Map(), workers: [], fetches: [], controllers: [], generations: [], sequence: 0,
    };
    const ot = window.setTimeout;
    const oi = window.setInterval;
    const oct = window.clearTimeout;
    const oci = window.clearInterval;
    const wrap = (kind, original) => function (callback, delay, ...args) {
      let handle;
      const row = { kind, delay: Number(delay) || 0, createdAt: performance.now() };
      handle = original.call(this, (...cbArgs) => {
        if (kind === 'timeout') p.timers.delete(handle);
        return typeof callback === 'function' ? callback(...cbArgs) : undefined;
      }, delay, ...args);
      p.timers.set(handle, row);
      return handle;
    };
    window.setTimeout = wrap('timeout', ot);
    window.setInterval = wrap('interval', oi);
    window.clearTimeout = (h) => { p.timers.delete(h); return oct(h); };
    window.clearInterval = (h) => { p.timers.delete(h); return oci(h); };
    const NativeWorker = window.Worker;
    if (NativeWorker) {
      window.Worker = class ObservedWorker extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          const row = { urlClass: String(url).split('/').at(-1).split('?')[0], createdAt: performance.now(), terminatedAt: null };
          p.workers.push(row);
          const terminate = this.terminate;
          this.terminate = function () { row.terminatedAt = performance.now(); return terminate.call(this); };
        }
      };
    }
    const NativeAbortController = window.AbortController;
    if (NativeAbortController) {
      window.AbortController = class ObservedAbortController extends NativeAbortController {
        constructor() {
          super();
          const row = { createdAt: performance.now(), abortedAt: null };
          p.controllers.push(row);
          this.signal.addEventListener('abort', () => { row.abortedAt = performance.now(); }, { once: true });
        }
      };
    }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function observedFetch(input, init) {
      const row = { startedAt: performance.now(), settledAt: null, aborted: false };
      p.fetches.push(row);
      try {
        const response = await nativeFetch(input, init);
        row.settledAt = performance.now();
        return response;
      } catch (error) {
        row.settledAt = performance.now();
        row.aborted = error?.name === 'AbortError';
        throw error;
      }
    };
    window.__v5RememberGeneration = () => {
      const chart = window.chart;
      const raw = chart?.rawData;
      const processed = chart?.data;
      const symbolAlias = p.fileAliases?.[String(chart?.currentFileId)] || 'symbol-unknown';
      const timeframe = chart?.currentTimeframe ?? null;
      p.generations.push({
        id: ++p.sequence,
        symbolAlias,
        timeframe,
        rawLength: raw?.length ?? null,
        processedLength: processed?.length ?? null,
        raw: raw ? new WeakRef(raw) : null,
        processed: processed ? new WeakRef(processed) : null,
      });
      if (p.generations.length > 256) p.generations.splice(0, p.generations.length - 256);
    };
  });
  return { page, cdp };
}

async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics
    .filter(({ name }) => /^(JSHeapUsedSize|JSHeapTotalSize|Nodes|Documents|Frames|JSEventListeners)$/.test(name))
    .map(({ name, value }) => [name, value]));
}

async function takeRawHeap(cdp, label) {
  const file = path.join(heapDir, `${label}.heapsnapshot`);
  const stream = fs.createWriteStream(file);
  let bytes = 0;
  const digest = createHash('sha256');
  const onChunk = ({ chunk }) => {
    bytes += Buffer.byteLength(chunk);
    digest.update(chunk);
    stream.write(chunk);
  };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
  }
  fs.rmSync(file, { force: true });
  return { bytes, sha256: digest.digest('hex'), rawDeleted: true };
}

async function snapshot(page, cdp, label, cycle) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(settleMs);
  const runtime = await page.evaluate(({ snapLabel, snapCycle }) => {
    const chart = window.chart;
    const p = window.__v5MemoryProbe;
    const generations = p.generations.map((g) => ({
      id: g.id,
      symbolAlias: g.symbolAlias,
      timeframe: g.timeframe,
      rawAlive: !!g.raw?.deref(),
      processedAlive: !!g.processed?.deref(),
      rawLength: g.rawLength,
      processedLength: g.processedLength,
    }));
    const currentAlias = p.fileAliases?.[String(chart?.currentFileId)] || 'symbol-unknown';
    const aliveOutgoing = generations.filter((g) =>
      (g.rawAlive || g.processedAlive)
      && !(g.symbolAlias === currentAlias && g.timeframe === chart?.currentTimeframe));
    const cacheSizes = {};
    for (const key of Object.keys(chart || {}).filter((k) => /cache|buffer|store/i.test(k)).slice(0, 100)) {
      const value = chart[key];
      cacheSizes[key] = value instanceof Map || value instanceof Set
        ? value.size : (Array.isArray(value) ? value.length : (value && typeof value === 'object' ? Object.keys(value).length : null));
    }
    return {
      label: snapLabel,
      cycle: snapCycle,
      symbolAlias: p.fileAliases?.[String(chart?.currentFileId)] || 'symbol-unknown',
      timeframe: chart?.currentTimeframe ?? null,
      datasets: {
        raw: chart?.rawData?.length ?? null,
        processed: chart?.data?.length ?? null,
        replayRaw: chart?.replaySystem?.fullRawData?.length ?? null,
        panelRaw: chart?._panelFullRawData?.length ?? null,
      },
      resources: {
        domElements: document.getElementsByTagName('*').length,
        canvases: document.querySelectorAll('canvas').length,
        canvasPixels: [...document.querySelectorAll('canvas')].reduce((n, c) => n + c.width * c.height, 0),
        timers: p.timers.size,
        workersCreated: p.workers.length,
        workersAlive: p.workers.filter((w) => w.terminatedAt == null).length,
        fetchesStarted: p.fetches.length,
        fetchesPending: p.fetches.filter((f) => f.settledAt == null).length,
        fetchesAborted: p.fetches.filter((f) => f.aborted).length,
        abortControllers: p.controllers.length,
        abortControllersAborted: p.controllers.filter((c) => c.abortedAt != null).length,
        arrayBufferBytes: null,
        typedArrayBytes: null,
      },
      caches: cacheSizes,
      generations: {
        total: generations.length,
        stronglyReachableOutgoing: aliveOutgoing.length,
        outgoing: aliveOutgoing.slice(-20),
        note: 'WeakRef liveness after explicit GC is used as the strong-reachability oracle; raw heaps are not committed.',
      },
    };
  }, { snapLabel: label, snapCycle: cycle });
  runtime.cdp = await cdpMetrics(cdp);
  runtime.heap = await takeRawHeap(cdp, label);
  return runtime;
}

async function waitReady(page, expectedFileId, expectedTf) {
  await page.waitForFunction(({ fid, tf }) => {
    const chart = window.chart;
    return chart && String(chart.currentFileId) === String(fid)
      && chart.currentTimeframe === tf
      && Array.isArray(chart.data) && chart.data.length > 2;
  }, { timeout: loadTimeoutMs }, { fid: expectedFileId, tf: expectedTf });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function performStep(page, fileId, tf, alias) {
  const loaded = await page.evaluate(({ fid, timeframe, symbolAlias }) => {
    window.__v5RememberGeneration();
    window.__v5ExpectedGeneration = { symbolAlias, timeframe };
    return window.chart.loadFileData(fid);
  }, { fid: fileId, timeframe: tf, symbolAlias: alias });
  if (loaded !== true) {
    const state = await page.evaluate((target) => ({
      currentMatchesTarget: String(window.chart?.currentFileId || '') === String(target),
      timeframe: window.chart?.currentTimeframe ?? null,
      bars: window.chart?.data?.length ?? null,
    }), fileId);
    throw new Error(`product loadFileData rejected symbol switch (${JSON.stringify(state)})`);
  }
  await waitReady(page, fileId, await page.evaluate(() => window.chart.currentTimeframe));
  await page.evaluate((timeframe) => window.chart.setTimeframe(timeframe), tf);
  await waitReady(page, fileId, tf);
}

async function runArm(browser, armName, sessionId, assignments, matchedElapsedMs = null) {
  const { page, cdp } = await newInstrumentedPage(browser);
  const arm = { name: armName, startedAt: new Date().toISOString(), snapshots: [], teardown: null, completedCycles: 0 };
  try {
    const initial = assignments[0];
    await page.evaluateOnNewDocument(({ sid, row, fileAliases }) => {
      window.__v5MemoryProbe.fileAliases = fileAliases;
      localStorage.setItem('active_trading_session_id', sid);
      localStorage.setItem('chart_panel_state', JSON.stringify({
        layout: '1', selectedPanelIndex: 0, sessionId: sid,
        panels: [{ index: 0, isMainChart: true, timeframe: '1m', fileId: row.fileId, symbol: row.ticker, ticker: row.ticker }],
      }));
    }, {
      sid: sessionId,
      row: initial,
      fileAliases: Object.fromEntries(assignments.map((assignment, index) => [
        String(assignment.fileId), `symbol-${String.fromCharCode(65 + index)}`,
      ])),
    });
    await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&sessionId=${encodeURIComponent(sessionId)}`,
      { waitUntil: 'domcontentloaded', timeout: loadTimeoutMs });
    await page.waitForFunction(() => window.chart
      && Array.isArray(window.chart.data) && window.chart.data.length > 2,
    { timeout: loadTimeoutMs });
    await performStep(page, initial.fileId, '1m', aliasHash(initial.fileId));
    arm.snapshots.push(await snapshot(page, cdp, `${armName}-cycle-0`, 0));
    const began = Date.now();
    for (let cycle = 1; cycle <= 50; cycle++) {
      if (armName === 'no-churn') {
        await sleep(Math.max(settleMs, Math.ceil((matchedElapsedMs || 50_000) / 50)));
      } else if (armName === 'symbol-only') {
        for (const row of [...assignments.slice(1), assignments[0]]) {
          await performStep(page, row.fileId, '1m', aliasHash(row.fileId));
        }
      } else if (armName === 'timeframe-only') {
        await performStep(page, initial.fileId, '1d', aliasHash(initial.fileId));
        await performStep(page, initial.fileId, '1m', aliasHash(initial.fileId));
      } else {
        const sequence = [assignments[1], assignments[2], assignments[0]];
        let tf = '1m';
        for (const row of sequence) {
          tf = tf === '1m' ? '1d' : '1m';
          await performStep(page, row.fileId, tf, aliasHash(row.fileId));
          tf = tf === '1m' ? '1d' : '1m';
          await performStep(page, row.fileId, tf, aliasHash(row.fileId));
        }
      }
      arm.completedCycles = cycle;
      if (checkpoints.includes(cycle)) {
        arm.snapshots.push(await snapshot(page, cdp, `${armName}-cycle-${cycle}`, cycle));
      }
    }
    arm.elapsedMs = Date.now() - began;
    await page.goto('about:blank', { waitUntil: 'load' });
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(settleMs);
    arm.teardown = { cdp: await cdpMetrics(cdp), heap: await takeRawHeap(cdp, `${armName}-teardown`) };
    arm.classification = classifyArm(arm);
  } catch (error) {
    arm.blocker = String(error?.message || error).replaceAll(sessionId, '[owner-qa-session]');
    arm.classification = { verdict: 'INCONCLUSIVE', reason: 'arm did not complete' };
  } finally {
    await page.close().catch(() => {});
  }
  return arm;
}

const browser = await puppeteer.launch({
  headless: 'new',
  userDataDir: profileDir,
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
try {
  const discovery = await browser.newPage();
  await discovery.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: loadTimeoutMs });
  const discovered = await discovery.evaluate(async ({ e, p, requested }) => {
    const login = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
    const sessionsResponse = await fetch('/api/sessions', { credentials: 'include', cache: 'no-store' });
    const filesResponse = await fetch('/api/files?session_ready=1', { credentials: 'include', cache: 'no-store' });
    const sessionsBody = await sessionsResponse.json();
    const filesBody = await filesResponse.json();
    const sessions = sessionsBody.sessions || [];
    const selected = requested
      ? sessions.find((row) => String(row.id) === requested)
      : [...sessions].sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (!selected) throw new Error('owner-scoped QA session unavailable');
    const detailResponse = await fetch(`/api/sessions/${encodeURIComponent(selected.id)}`, { credentials: 'include', cache: 'no-store' });
    return {
      statuses: [login.status, sessionsResponse.status, filesResponse.status, detailResponse.status],
      session: (await detailResponse.json()).session,
      files: Array.isArray(filesBody) ? filesBody : (filesBody.files || filesBody.data || []),
    };
  }, { e: email, p: password, requested: requestedSessionId });
  await discovery.close();
  if (discovered.statuses.some((status) => status !== 200)) throw new Error(`owner discovery failed (${discovered.statuses.join(',')})`);
  const assignments = configuredSessionAssignments(discovered.session, discovered.files, 3);
  const sessionId = String(discovered.session.id);
  evidence.ownerScope = {
    validated: true,
    sessionAlias: 'owner-qa-session-1',
    assignmentAliases: assignments.map((row, i) => ({ symbol: `symbol-${String.fromCharCode(65 + i)}`, file: `file-${i + 1}` })),
  };
  for (const armName of arms) {
    const churnElapsed = evidence.arms.find((arm) => arm.name === 'churn')?.elapsedMs ?? null;
    evidence.arms.push(await runArm(browser, armName, sessionId, assignments, churnElapsed));
  }
  const churn = evidence.arms.find((arm) => arm.name === 'churn');
  evidence.verdict = churn?.classification?.verdict || 'INCONCLUSIVE';
  evidence.controlComparison = Object.fromEntries(evidence.arms.map((arm) => [
    arm.name,
    {
      completedCycles: arm.completedCycles,
      elapsedMs: arm.elapsedMs ?? null,
      verdict: arm.classification?.verdict,
      slopeBytesPerCycle: arm.classification?.slopeBytesPerCycle ?? null,
    },
  ]));
} catch (error) {
  evidence.blocker = String(error?.message || error);
  evidence.verdict = 'INCONCLUSIVE';
} finally {
  evidence.rawHeapPolicy.cleanupComplete = true;
  await browser.close().catch(() => {});
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  try { fs.rmSync(heapDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  process.stdout.write(`${JSON.stringify({ verdict: evidence.verdict, output, blocker: evidence.blocker || null }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'INCONCLUSIVE' ? 2 : 0;
}
