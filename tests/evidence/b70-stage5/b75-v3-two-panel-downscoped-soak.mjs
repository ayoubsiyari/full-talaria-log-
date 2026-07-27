#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { classifyOrganicTopology } from './b75-v3-two-panel-topology-contract.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const output = path.resolve(process.env.V3_TWO_PANEL_EVIDENCE
  || 'docs/plan3/evidence/V3-QA123-TWO-PANEL-DOWNSCOPED-20260727-RERUN.json');
const totalMs = Math.max(1_800_000, Number(process.env.V3_SOAK_MS || 1_800_000));
const readinessMs = Number(process.env.V3_READINESS_MS || 120_000);
const sampleMs = Number(process.env.V3_SAMPLE_MS || 1_000);
const clientId = randomUUID();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const execFileAsync = promisify(execFile);
const allowed = new Set([
  'POST /api/auth/login',
  'POST /api/chart/windows/claim',
  'POST /api/chart/windows/heartbeat',
  'POST /api/chart/windows/release',
]);
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const evidence = {
  schema: 'talaria-v3-two-panel-downscoped-soak-v2',
  evidenceClass: 'TWO-PANEL DOWNSCOPED',
  fourPanelAcceptance: false,
  generatedAt: new Date().toISOString(),
  plannedDurationMs: totalMs,
  conditionsRequired: ['no-indicators', 'representative-sma-ema-wma'],
  topologyContract: 'host A validated separately; manager owns N-1 organic peer iframes',
  mutationPolicy: {
    mode: 'default-block',
    operationalAllowed: [...allowed],
    productCustomerWritesAllowed: false,
    i16Clean: true,
  },
  blockedMutations: [],
  readiness: { reached: false, stage: 'not-started' },
  conditions: [],
  errors: [],
  verdict: 'BLOCKED',
};

const profile = fs.mkdtempSync(path.join(process.env.TEMP || process.cwd(), 'v3-2p-'));
const browser = await puppeteer.launch({
  headless: 'new', userDataDir: profile,
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run', '--enable-precise-memory-info'],
});
const page = await browser.newPage();
const cdp = await page.target().createCDPSession();
await cdp.send('Performance.enable');
await page.evaluateOnNewDocument(() => {
  const p = window.__v3p = {
    paints: 0, workers: [], adds: 0, removes: 0, bridgeReadyMessages: 0,
  };
  const WorkerCtor = window.Worker;
  if (WorkerCtor) {
    window.Worker = class ObservedWorker extends WorkerCtor {
      constructor(...args) {
        super(...args);
        const row = { alive: true };
        p.workers.push(row);
        const terminate = this.terminate;
        this.terminate = function () { row.alive = false; return terminate.call(this); };
      }
    };
  }
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...args) { p.adds++; return add.apply(this, args); };
  EventTarget.prototype.removeEventListener = function (...args) { p.removes++; return remove.apply(this, args); };
  add.call(window, 'message', (event) => {
    if (event.data?.type === 'bridge-ready') p.bridgeReadyMessages++;
  });
  setInterval(() => {
    const chart = window.chart;
    if (!chart || chart.__v3PaintPatched || typeof chart.render !== 'function') return;
    chart.__v3PaintPatched = true;
    const render = chart.render;
    chart.render = function (...args) {
      p.paints++;
      return render.apply(this, args);
    };
  }, 20);
});
await page.setRequestInterception(true);
page.on('request', (request) => {
  let url;
  try { url = new URL(request.url()); } catch { return request.continue().catch(() => {}); }
  const method = request.method().toUpperCase();
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const key = `${method} ${url.pathname}`;
  if (url.origin !== new URL(origin).origin || !mutation || allowed.has(key)) {
    return request.continue().catch(() => {});
  }
  const pathClass = url.pathname.includes('/state')
    ? '/api/sessions/{owner-session}/state' : 'same-origin-product-mutation';
  const existing = evidence.blockedMutations.find((row) =>
    row.method === method && row.pathClass === pathClass);
  if (existing) existing.count++;
  else evidence.blockedMutations.push({ method, pathClass, disposition: 'blocked', count: 1 });
  return request.respond({
    status: 409, contentType: 'application/json',
    body: '{"detail":{"code":"diagnostic_mutation_prevented"}}',
  }).catch(() => {});
});
page.on('pageerror', (error) => evidence.errors.push(String(error?.message || error).slice(0, 400)));

const api = (url, init = {}) => page.evaluate(async ({ target, options }) => {
  const windowId = options.windowId;
  delete options.windowId;
  const response = await fetch(target, {
    credentials: 'include', cache: 'no-store', ...options,
    headers: { 'X-Talaria-Chart-Window-Id': windowId || '', ...(options.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}, { target: url, options: structuredClone(init) });

let lastOsMemory = { at: 0, bytes: null };
async function osProcessPrivateMemory() {
  if (Date.now() - lastOsMemory.at < 5_000) return lastOsMemory.bytes;
  const script = [
    `$rootPid=${browser.process().pid}`,
    '$rows=Get-CimInstance Win32_Process',
    '$ids=New-Object System.Collections.Generic.HashSet[int]',
    '[void]$ids.Add($rootPid)',
    'do{$before=$ids.Count;foreach($row in $rows){if($ids.Contains([int]$row.ParentProcessId)){[void]$ids.Add([int]$row.ProcessId)}}}while($ids.Count -gt $before)',
    '$sum=0;foreach($id in $ids){$p=Get-Process -Id $id -ErrorAction SilentlyContinue;if($p){$sum+=$p.PrivateMemorySize64}}',
    'Write-Output $sum',
  ].join(';');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 10_000 });
    const value = Number(String(stdout).trim());
    lastOsMemory = { at: Date.now(), bytes: Number.isFinite(value) && value > 0 ? value : null };
  } catch {
    lastOsMemory = { at: Date.now(), bytes: null };
  }
  return lastOsMemory.bytes;
}

async function performanceMetrics() {
  const [{ metrics }, system] = await Promise.all([
    cdp.send('Performance.getMetrics'),
    browser.target().createCDPSession().then(async (session) => {
      try { return await session.send('SystemInfo.getProcessInfo'); } finally { await session.detach(); }
    }).catch(() => ({ processInfo: [] })),
  ]);
  const selected = Object.fromEntries(metrics.filter(({ name }) =>
    /^(Timestamp|TaskDuration|JSHeapUsedSize|JSHeapTotalSize|Documents|Frames|JSEventListeners)$/.test(name))
    .map(({ name, value }) => [name, value]));
  const processes = system.processInfo || [];
  return {
    ...selected,
    processCpuTime: processes.reduce((sum, row) => sum + (Number(row.cpuTime) || 0), 0),
    processPrivateMemory: await osProcessPrivateMemory(),
    processCount: processes.length,
  };
}

const describeRuntime = () => page.evaluate(() => {
  const manager = window.__multichartManagerRef || window.__mcManager;
  const entries = manager?.charts ? [...manager.charts.values()] : [];
  const describe = (win, alias, entry = null) => {
    const chart = win?.chart;
    const replay = chart?.replaySystem;
    const probe = win?.__v3p;
    const canvas = chart?.canvas || win?.document?.querySelector('canvas');
    return {
      alias,
      entryReady: entry ? !!entry.ready : null,
      organicBridgeReady: entry ? !!entry.ready : null,
      frameConnected: entry?.frame?.isConnected ?? null,
      chartPresent: !!chart,
      dataLoaded: Array.isArray(chart?.data) && chart.data.length > 2,
      bars: chart?.data?.length ?? 0,
      canvasPainted: !!canvas && canvas.width > 0 && canvas.height > 0 && (probe?.paints ?? 0) > 0,
      canvasSize: canvas ? [canvas.width, canvas.height] : null,
      paints: probe?.paints ?? 0,
      replayIndex: replay?.currentIndex ?? null,
      replayTimestamp: replay?.replayTimestamp ?? null,
      playing: replay?.isPlaying ?? null,
      ownershipPresent: !!(chart?._replayLeaseOwner ?? chart?._leaseOwner ?? replay?._leaseOwner),
      workersCreated: probe?.workers?.length ?? null,
      workersAlive: probe?.workers?.filter((row) => row.alive).length ?? null,
      listenersNet: probe ? probe.adds - probe.removes : null,
      bridgeReadyMessagesObserved: probe?.bridgeReadyMessages ?? null,
    };
  };
  return {
    managerEntries: entries.length,
    iframeCount: document.querySelectorAll('iframe').length,
    host: describe(window, 'panel-A-host'),
    peers: entries.map((entry, index) =>
      describe(entry.frame?.contentWindow, `panel-${String.fromCharCode(66 + index)}-peer`, entry)),
  };
});

const indicators = (condition) => condition === 'no-indicators' ? [] : [
  { id: 'v3-sma-20', type: 'sma', name: 'SMA(20)', params: { period: 20 }, style: { color: '#2962ff', lineWidth: 1 } },
  { id: 'v3-ema-20', type: 'ema', name: 'EMA(20)', params: { period: 20 }, style: { color: '#ff6d00', lineWidth: 1 } },
  { id: 'v3-wma-20', type: 'wma', name: 'WMA(20)', params: { period: 20 }, style: { color: '#00c853', lineWidth: 1 } },
];

function linearSlope(samples, key) {
  const rows = samples.map((row) => ({ x: row.atMs / 1000, y: row.metrics[key] }))
    .filter((row) => Number.isFinite(row.y) && row.y > 0);
  if (rows.length < 2) return null;
  const mx = rows.reduce((sum, row) => sum + row.x, 0) / rows.length;
  const my = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  const d = rows.reduce((sum, row) => sum + (row.x - mx) ** 2, 0);
  return d ? rows.reduce((sum, row) => sum + (row.x - mx) * (row.y - my), 0) / d : null;
}

function cadenceSummary(samples, selector) {
  const points = samples.map((sample) => ({
    at: sample.atMs, index: Number(selector(sample.runtime)?.replayIndex),
  })).filter((row) => Number.isFinite(row.index));
  const deltas = points.slice(1).map((row, index) => ({
    bars: row.index - points[index].index,
    elapsed: row.at - points[index].at,
  }));
  const mean = deltas.length ? deltas.reduce((sum, row) => sum + row.bars, 0) / deltas.length : null;
  return {
    stallSamples: deltas.filter((row) => row.bars === 0).length,
    backwardJumps: deltas.filter((row) => row.bars < 0).length,
    maxForwardJumpBars: deltas.length ? Math.max(...deltas.map((row) => row.bars)) : null,
    maxSampleGapMs: deltas.length ? Math.max(...deltas.map((row) => row.elapsed)) : null,
    jitterStdDevBars: deltas.length
      ? Math.sqrt(deltas.reduce((sum, row) => sum + (row.bars - mean) ** 2, 0) / deltas.length) : null,
    freezeCatchupCandidates: deltas.filter((row, index) =>
      row.bars === 0 && deltas.slice(index + 1, index + 16).some((next) => next.bars > Math.max(1, mean * 2))).length,
  };
}

function summarize(cell) {
  const values = (key) => cell.samples.map((row) => row.metrics[key]).filter((value) => Number.isFinite(value) && value > 0);
  const stats = (key) => {
    const rows = values(key);
    return {
      floor: rows.length ? Math.min(...rows) : null,
      peak: rows.length ? Math.max(...rows) : null,
      slopePerSecond: linearSlope(cell.samples, key),
    };
  };
  cell.summary = {
    cadence: {
      hostA: cadenceSummary(cell.samples, (runtime) => runtime.host),
      peerB: cadenceSummary(cell.samples, (runtime) => runtime.peers[0]),
    },
    ownership: {
      hostObserved: cell.samples.some((row) => row.runtime.host.ownershipPresent),
      peerObserved: cell.samples.some((row) => row.runtime.peers[0]?.ownershipPresent),
      maxReplayIndexDivergence: Math.max(...cell.samples.map((row) =>
        Math.abs(Number(row.runtime.host.replayIndex) - Number(row.runtime.peers[0]?.replayIndex)) || 0)),
    },
    jsHeapBytes: stats('JSHeapUsedSize'),
    processPrivateMemoryBytes: stats('processPrivateMemory'),
    cpu: {
      taskDurationSeconds: (values('TaskDuration').at(-1) ?? 0) - (values('TaskDuration')[0] ?? 0),
      processCpuSeconds: (values('processCpuTime').at(-1) ?? 0) - (values('processCpuTime')[0] ?? 0),
    },
    resources: {
      iframeFloor: Math.min(...cell.samples.map((row) => row.runtime.iframeCount)),
      iframePeak: Math.max(...cell.samples.map((row) => row.runtime.iframeCount)),
      hostEnd: cell.samples.at(-1)?.runtime.host,
      peerEnd: cell.samples.at(-1)?.runtime.peers[0],
      cdpListeners: stats('JSEventListeners'),
    },
  };
  delete cell.samples;
}

try {
  evidence.readiness.stage = 'authenticate-and-claim';
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: readinessMs });
  const login = await api('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200 || !login.body?.success) throw new Error(`authentication failed HTTP ${login.status}`);
  const claim = await api('/api/chart/windows/claim', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }), windowId: clientId,
  });
  if (claim.status !== 200 || claim.body?.ok === false) throw new Error(`window claim failed HTTP ${claim.status}`);

  evidence.readiness.stage = 'discover-qa123-two-files';
  const [me, sessions, files] = await Promise.all([
    api('/api/auth/me'), api('/api/sessions'), api('/api/files?session_ready=1'),
  ]);
  const matches = (sessions.body?.sessions || []).filter((row) =>
    String(row.name ?? row.session_name ?? row.title ?? '').trim() === 'QA 123');
  if (me.status !== 200 || !me.body?.user || matches.length !== 1) {
    throw new Error(`owner discovery failed me=${me.status} sessionMatches=${matches.length}`);
  }
  const sessionId = String(matches[0].id);
  const detail = await api(`/api/sessions/${encodeURIComponent(sessionId)}`);
  const readyRows = Array.isArray(files.body) ? files.body : (files.body?.files || files.body?.data || []);
  const readyIds = new Set(readyRows.map((row) => String(row.id ?? row.file_id)));
  const assignments = (detail.body?.session?.config?.files || []).map((row) => ({
    fileId: String(row.id ?? row.fileId ?? row.file_id ?? ''),
    ticker: String(row.ticker ?? row.symbol ?? ''),
  })).filter((row) => row.fileId && row.ticker && readyIds.has(row.fileId)).slice(0, 2);
  if (assignments.length !== 2 || new Set(assignments.map((row) => row.fileId)).size !== 2) {
    throw new Error('two distinct configured session-ready files unavailable');
  }
  evidence.ownerScope = { authenticated: true, exactQa123: true, files: ['file-1', 'file-2'] };

  evidence.readiness.stage = 'persist-two-panel-layout';
  await page.evaluate(({ sid, rows, id }) => {
    sessionStorage.setItem('talaria_chart_window_id', id);
    localStorage.setItem('active_trading_session_id', sid);
    localStorage.setItem('chart_panel_state', JSON.stringify({
      layout: '2', selectedPanelIndex: 0, sessionId: sid,
      panels: rows.map((row, index) => ({
        index, isMainChart: index === 0, timeframe: '1m',
        fileId: row.fileId, symbol: row.ticker, ticker: row.ticker,
      })),
    }));
  }, { sid: sessionId, rows: assignments, id: clientId });
  await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=2&sessionId=${encodeURIComponent(sessionId)}`,
    { waitUntil: 'domcontentloaded', timeout: readinessMs });

  evidence.readiness.stage = 'organic-peer-handshake';
  const beganReadiness = Date.now();
  let lastRuntime;
  while (Date.now() - beganReadiness < readinessMs) {
    lastRuntime = await describeRuntime();
    const topology = classifyOrganicTopology({
      panelCount: 2,
      managerEntries: lastRuntime.managerEntries,
      iframeCount: lastRuntime.iframeCount,
      host: lastRuntime.host,
      peers: lastRuntime.peers,
    });
    if (topology.ready) {
      evidence.readiness = {
        reached: true,
        stage: 'host-and-one-organic-peer-ready-data-loaded-painted',
        atMs: Date.now() - beganReadiness,
        topology,
        runtime: lastRuntime,
        syntheticBridgeReadySent: false,
      };
      break;
    }
    await sleep(500);
  }
  if (!evidence.readiness.reached) {
    evidence.readiness.failureSnapshot = lastRuntime;
    throw new Error('organic two-panel readiness timeout');
  }

  const conditionMs = Math.floor(totalMs / 2);
  for (const condition of evidence.conditionsRequired) {
    const cell = { condition, plannedDurationMs: conditionMs, startedAt: new Date().toISOString(), samples: [] };
    evidence.conditions.push(cell);
    await page.evaluate((active) => {
      const manager = window.__multichartManagerRef || window.__mcManager;
      const charts = [window.chart, ...[...manager.charts.values()].map((entry) => entry.frame?.contentWindow?.chart)];
      for (const chart of charts) {
        if (!chart?.indicators) continue;
        chart.indicators.active = active.map((row) => structuredClone(row));
        chart.indicators.data = {};
        chart.recalculateIndicators?.();
      }
      window.chart?.replaySystem?.play?.();
    }, indicators(condition));
    const started = Date.now();
    while (Date.now() - started < conditionMs) {
      cell.samples.push({
        atMs: Date.now() - started,
        metrics: await performanceMetrics(),
        runtime: await describeRuntime(),
      });
      await sleep(sampleMs);
    }
    cell.completedDurationMs = Date.now() - started;
    await page.evaluate(() => window.chart?.replaySystem?.pause?.());
    const pauseBefore = await performanceMetrics();
    await sleep(5_000);
    cell.pauseRecovery = {
      before: pauseBefore,
      after: await performanceMetrics(),
      runtime: await describeRuntime(),
    };
    summarize(cell);
  }
  evidence.completedDurationMs = evidence.conditions.reduce((sum, cell) => sum + cell.completedDurationMs, 0);
  evidence.verdict = evidence.completedDurationMs >= totalMs ? 'CAPTURE_PENDING_TEARDOWN' : 'INCOMPLETE';
  evidence.readiness.stage = 'teardown-navigation';
  const teardownBefore = await performanceMetrics();
  await cdp.send('Page.stopLoading').catch(() => {});
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(2_000);
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(5_000);
  const teardownAfter = await performanceMetrics();
  evidence.teardownRecovery = {
    before: teardownBefore,
    after: teardownAfter,
    jsHeapReleasedBytes: teardownBefore.JSHeapUsedSize - teardownAfter.JSHeapUsedSize,
    processMemoryReleasedBytes: teardownBefore.processPrivateMemory - teardownAfter.processPrivateMemory,
    iframeCountAfter: await page.evaluate(() => document.querySelectorAll('iframe').length),
  };
  evidence.verdict = 'CAPTURE_COMPLETE';
} catch (error) {
  evidence.blocker = String(error?.message || error)
    .replaceAll(email, '[redacted]')
    .replaceAll(clientId, '[operational-window]');
  evidence.readiness.failureStage = evidence.readiness.stage;
  evidence.completedDurationMs = evidence.conditions.reduce((sum, cell) => sum + (cell.completedDurationMs || 0), 0);
  if (evidence.verdict === 'CAPTURE_PENDING_TEARDOWN') evidence.verdict = 'INCOMPLETE_TEARDOWN';
} finally {
  await api('/api/chart/windows/release', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }), windowId: clientId,
  }).catch(() => {});
  evidence.completedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  await browser.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({
    verdict: evidence.verdict,
    readiness: evidence.readiness.stage,
    blocker: evidence.blocker || null,
    completedDurationMs: evidence.completedDurationMs,
    output,
  }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'CAPTURE_COMPLETE' ? 0 : 2;
}
