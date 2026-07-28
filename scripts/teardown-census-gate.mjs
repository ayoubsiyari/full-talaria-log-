/**
 * TEARDOWN-CENSUS-GATE-V1 — standing multichart teardown census gate.
 * REST-STATE-CENSUS-V1 — extends teardown census: no scheduled work at idle rest.
 * Signatures: TALARIA_TEARDOWN_CENSUS_V1 · TALARIA_REST_STATE_CENSUS_V1
 *
 * Hermetic sim is the standing gate (VER-01 mutation NCs). Product multichart-manager.js /
 * chart.js wiring for census-before/after real MC open/teardown is documented follow-up.
 *
 * Header: product idle loop diagnosis (Q2 countdown etc.) is chart authoring; this gate
 * catches the class (standing timers/rAF + render-without-commit + idle main-thread budget).
 * Absolute tab CPU% acceptance remains PO-PROTOCOL-CPU-AB P1; REST-IDLE-MAIN-THREAD-BUDGET
 * keeps D1 fixed once periodic idle work is removed.
 *
 * REAL-SETTLE cell: browser soak may use 60s settle; hermetic CI default settleMs 50–200ms
 * (configurable via --settle-ms=).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import {
  TEARDOWN_CENSUS_PROBE_SIGNATURE,
  REST_STATE_CENSUS_PROBE_SIGNATURE,
  assertReturnedToBaseline,
  assertAtRest,
  HERMETIC_REST_PINNED_ALLOWLIST,
} from './lib/teardown-census-probe.mjs';
import { runHermeticTeardownCycle, runHermeticRestStateCycle } from './lib/teardown-census-harness.mjs';

export const TALARIA_TEARDOWN_CENSUS_V1 = TEARDOWN_CENSUS_PROBE_SIGNATURE;
export const TALARIA_REST_STATE_CENSUS_V1 = REST_STATE_CENSUS_PROBE_SIGNATURE;
export const DEFAULT_SETTLE_MS = 50;
export const REAL_SETTLE_SOAK_MS = 60_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'teardown-census');
export const DEFAULT_FIXTURE_PATH = '/host.html';
export const DEFAULT_TIMEOUT_MS = 20_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

function safeFixturePath(fixtureRoot, requestPath) {
  const decoded = decodeURIComponent(requestPath === '/' ? DEFAULT_FIXTURE_PATH : requestPath);
  const target = path.resolve(fixtureRoot, `.${decoded}`);
  const rootWithSep = fixtureRoot.endsWith(path.sep) ? fixtureRoot : `${fixtureRoot}${path.sep}`;
  if (target !== fixtureRoot && !target.startsWith(rootWithSep)) return null;
  return target;
}

export function startTeardownCensusFixtureServer({ fixtureDir = DEFAULT_FIXTURE_DIR, onReport } = {}) {
  const fixtureRoot = path.resolve(fixtureDir);
  const libRoot = path.resolve(__dirname, 'lib');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'POST' && url.pathname === '/report') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        try {
          const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (onReport) onReport(report);
        } catch (error) {
          if (onReport) onReport({ parseError: String(error?.message || error) });
        }
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405);
      response.end('method not allowed');
      return;
    }

    let filePath = safeFixturePath(fixtureRoot, url.pathname);
    if (url.pathname.startsWith('/lib/')) {
      const rel = url.pathname.slice('/lib/'.length);
      filePath = path.resolve(libRoot, rel);
      const libSep = libRoot.endsWith(path.sep) ? libRoot : `${libRoot}${path.sep}`;
      if (filePath !== libRoot && !filePath.startsWith(libSep)) filePath = null;
    }

    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    const body = fs.readFileSync(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

export function parseTeardownCensusArgs(argv = process.argv.slice(2)) {
  const options = { settleMs: DEFAULT_SETTLE_MS, timeoutMs: DEFAULT_TIMEOUT_MS, fixturePath: DEFAULT_FIXTURE_PATH };
  for (const arg of argv) {
    if (arg === '--rest-state') continue;
    if (arg.startsWith('--settle-ms=')) {
      const v = Number(arg.slice('--settle-ms='.length));
      if (!Number.isFinite(v) || v < 0) throw new Error(`invalid ${arg}`);
      options.settleMs = v;
    } else if (arg.startsWith('--timeout-ms=')) {
      const v = Number(arg.slice('--timeout-ms='.length));
      if (!Number.isFinite(v) || v <= 0) throw new Error(`invalid ${arg}`);
      options.timeoutMs = v;
    } else if (arg.startsWith('--fixture=')) {
      options.fixturePath = arg.slice('--fixture='.length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

export function parseRestStateCensusArgs(argv = process.argv.slice(2)) {
  return parseTeardownCensusArgs(argv);
}

export async function runHermeticRestStateCensusGate(options = {}) {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const green = await runHermeticRestStateCycle({}, { settleMs, observeMs: settleMs });
  const cells = [
    {
      cell: 'REST-SCHEDULED-WORK-ZERO',
      status: green.atRestVerdict.status,
      ...green.atRestVerdict,
    },
    {
      cell: 'REST-NO-RENDER-WITHOUT-DATA',
      status: green.renderVerdict.status,
      ...green.renderVerdict,
    },
    {
      cell: 'REST-IDLE-MAIN-THREAD-BUDGET',
      status: green.idleBudgetVerdict.status,
      ...green.idleBudgetVerdict,
    },
  ];

  const allowlistPinned = await runHermeticRestStateCycle(
    { restOrphanInterval: true },
    {
      settleMs,
      observeMs: settleMs,
      allowlist: {
        ...HERMETIC_REST_PINNED_ALLOWLIST,
        limits: { timeouts: 0, intervals: 1, animationFrames: 0 },
      },
    },
  );
  cells.push({
    cell: 'REST-ALLOWLIST-PINNED',
    status: allowlistPinned.status === 'RED' ? 'GREEN' : 'RED',
    ncExpect: 'RED when undeclared interval exceeds declaredScheduled',
    orphanVerdict: allowlistPinned,
  });

  const mutations = [
    { cell: 'NC-REST-ORPHAN-INTERVAL', flags: { restOrphanInterval: true } },
    { cell: 'NC-IDLE-RENDER-WITHOUT-DATA', flags: { idleRenderWithoutData: true } },
    {
      cell: 'NC-IDLE-PERIODIC-RAF-WITHOUT-COMMIT',
      flags: { idlePeriodicRafWithoutCommit: true },
    },
  ];

  for (const { cell, flags } of mutations) {
    const result = await runHermeticRestStateCycle(flags, { settleMs, observeMs: settleMs });
    cells.push({
      cell,
      status: result.status === 'RED' ? 'GREEN' : 'RED',
      ncExpect: 'RED on mutation',
      orphanVerdict: result,
    });
  }

  const ncOk = cells.slice(3).every((c) => c.status === 'GREEN');
  const ok = green.status === 'GREEN' && ncOk;

  return {
    ok,
    signature: TALARIA_REST_STATE_CENSUS_V1,
    status: ok ? 'GREEN' : 'RED',
    cells,
    settleMs,
    followUp:
      'Product idle rest census on chart.js (Q2 countdown / standing rAF) — CPU AB via PO-PROTOCOL-CPU-AB',
  };
}

export async function runRestStateCensusBrowserRunner({
  settleMs = DEFAULT_SETTLE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fixtureDir = DEFAULT_FIXTURE_DIR,
  fixturePath = DEFAULT_FIXTURE_PATH,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      signature: TALARIA_REST_STATE_CENSUS_V1,
      status: 'UNPROVEN',
      error: 'no Chromium-based browser found (Edge/Chrome); failing closed',
      report: null,
    };
  }

  let serverHandle;
  let resolveReport;
  const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
  });

  try {
    serverHandle = await startTeardownCensusFixtureServer({ onReport: (r) => resolveReport(r) });
    const url = `${serverHandle.origin}${fixturePath}?autorun=1&mode=rest&settleMs=${settleMs}`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: 'talaria-rest-state-census-',
    });
    const report = browserRun?.report;
    if (!report || browserRun?.timedOut) {
      return {
        ok: false,
        signature: TALARIA_REST_STATE_CENSUS_V1,
        status: 'UNPROVEN',
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        meta: { browserPath, url },
      };
    }
    if (report.parseError) {
      return {
        ok: false,
        signature: TALARIA_REST_STATE_CENSUS_V1,
        status: 'UNPROVEN',
        error: report.parseError,
        report: null,
      };
    }

    const ok = report.signature === TALARIA_REST_STATE_CENSUS_V1 && report.status === 'GREEN';
    return {
      ok,
      signature: TALARIA_REST_STATE_CENSUS_V1,
      status: report.status,
      report,
      meta: { browserPath, url, stderrTail: browserRun.stderrTail },
    };
  } finally {
    if (serverHandle) await serverHandle.close();
  }
}

export async function runHermeticTeardownCensusGate(options = {}) {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const green = await runHermeticTeardownCycle({}, { settleMs });
  const cells = [{ cell: 'HERMETIC-TEARDOWN-CYCLE', ...green }];

  const mutations = [
    { cell: 'NC-TEARDOWN-ORPHAN-INTERVAL', flags: { orphanInterval: true } },
    { cell: 'NC-TEARDOWN-ORPHAN-LISTENER', flags: { orphanListener: true } },
    { cell: 'NC-TEARDOWN-ORPHAN-RAF', flags: { orphanRaf: true } },
    { cell: 'NC-TEARDOWN-ORPHAN-CHANNEL', flags: { orphanChannel: true } },
  ];

  for (const { cell, flags } of mutations) {
    const result = await runHermeticTeardownCycle(flags, { settleMs });
    cells.push({
      cell,
      status: result.status === 'RED' ? 'GREEN' : 'RED',
      ncExpect: 'RED on orphan',
      orphanVerdict: result,
    });
  }

  const ncOk = cells.slice(1).every((c) => c.status === 'GREEN');
  const ok = green.status === 'GREEN' && ncOk;

  return {
    ok,
    signature: TALARIA_TEARDOWN_CENSUS_V1,
    status: ok ? 'GREEN' : 'RED',
    cells,
    settleMs,
    followUp: 'Product multichart open/teardown census wiring on chart.js / multichart-manager.js',
  };
}

export async function runTeardownCensusBrowserRunner({
  settleMs = DEFAULT_SETTLE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fixtureDir = DEFAULT_FIXTURE_DIR,
  fixturePath = DEFAULT_FIXTURE_PATH,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      signature: TALARIA_TEARDOWN_CENSUS_V1,
      status: 'UNPROVEN',
      error: 'no Chromium-based browser found (Edge/Chrome); failing closed',
      report: null,
    };
  }

  let serverHandle;
  let resolveReport;
  const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
  });

  try {
    serverHandle = await startTeardownCensusFixtureServer({ onReport: (r) => resolveReport(r) });
    const url = `${serverHandle.origin}${fixturePath}?autorun=1&settleMs=${settleMs}`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: 'talaria-teardown-census-',
    });
    const report = browserRun?.report;
    if (!report || browserRun?.timedOut) {
      return {
        ok: false,
        signature: TALARIA_TEARDOWN_CENSUS_V1,
        status: 'UNPROVEN',
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        meta: { browserPath, url },
      };
    }
    if (report.parseError) {
      return {
        ok: false,
        signature: TALARIA_TEARDOWN_CENSUS_V1,
        status: 'UNPROVEN',
        error: report.parseError,
        report: null,
      };
    }

    const ok = report.signature === TALARIA_TEARDOWN_CENSUS_V1 && report.status === 'GREEN';
    return {
      ok,
      signature: TALARIA_TEARDOWN_CENSUS_V1,
      status: report.status,
      report,
      meta: { browserPath, url, stderrTail: browserRun.stderrTail },
    };
  } finally {
    if (serverHandle) await serverHandle.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseTeardownCensusArgs();
  const restMode = process.argv.includes('--rest-state');
  const result = restMode ? await runHermeticRestStateCensusGate(args) : await runHermeticTeardownCensusGate(args);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { assertReturnedToBaseline, assertAtRest };
