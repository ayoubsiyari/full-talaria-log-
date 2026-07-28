/**
 * STORAGE-GROWTH-CENSUS-V1 — hermetic standing gate + optional browser fixture.
 * Signature: TALARIA_STORAGE_GROWTH_CENSUS_V1
 *
 * Header: measurement infra for bounded-retention policy; product retention fix is A/B territory.
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
  TALARIA_STORAGE_GROWTH_CENSUS_V1,
  STORAGE_GROWTH_CENSUS_GATE_NAME,
  HERMETIC_STORAGE_BUDGET_V1,
  runBoundaryStorageProfileCell,
  assertWithinStorageBudget,
} from './lib/storage-growth-census.mjs';
import {
  runHermeticBoundedStorageCycle,
  runHermeticUnboundedStorageMutation,
} from './lib/storage-growth-harness.mjs';

export { TALARIA_STORAGE_GROWTH_CENSUS_V1 };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'storage-growth');
export const DEFAULT_FIXTURE_PATH = '/host.html';
export const DEFAULT_TIMEOUT_MS = 25_000;

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

export function startStorageGrowthFixtureServer({ fixtureDir = DEFAULT_FIXTURE_DIR, onReport } = {}) {
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

export async function runHermeticStorageGrowthCensusGate(options = {}) {
  const startId = options.startSessionId ?? 882;
  const sessionCount = options.sessionCount ?? 5;

  const bounded = await runHermeticBoundedStorageCycle(startId, sessionCount);
  const growthCell = {
    cell: 'STORAGE-GROWTH-PER-SESSION',
    coverage: 'soundness',
    ver: 'VER-01',
    status: bounded.report.status,
    pass: bounded.report.ok,
    report: bounded.report,
    signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
  };

  const unbounded = await runHermeticUnboundedStorageMutation(startId, 12);
  const unboundedBudget = assertWithinStorageBudget(unbounded.report, HERMETIC_STORAGE_BUDGET_V1);
  const ncCell = {
    cell: 'NC-STORAGE-UNBOUNDED-MUTATION',
    coverage: 'soundness',
    ver: 'VER-01',
    ncExpect: 'RED when unbounded retention exceeds pinned budget',
    baseStatus: bounded.report.status,
    mutatedStatus: unbounded.report.status,
    status: unboundedBudget.status === 'RED' && bounded.report.status === 'GREEN' ? 'GREEN' : 'RED',
    pass: unboundedBudget.status === 'RED' && bounded.report.status === 'GREEN',
    budgetVerdict: unboundedBudget,
    signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
  };

  const boundaryCell = runBoundaryStorageProfileCell();

  const cells = [growthCell, ncCell, boundaryCell];
  const allPass = cells.every((c) => c.pass === true);

  return {
    gate: STORAGE_GROWTH_CENSUS_GATE_NAME,
    ok: allPass,
    signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
    status: allPass ? 'GREEN' : 'RED',
    cells,
    budget: HERMETIC_STORAGE_BUDGET_V1,
    followUp:
      'Product storage census on live chart session open/replay — retention policy A/B; memory claims require storage profile (BOUNDARY cell)',
  };
}

export function formatStorageGrowthCensusReport(result) {
  const lines = [
    `${result.signature} ${result.gate} — ${result.status}`,
    `cells: ${result.cells.map((c) => `${c.cell}=${c.status}`).join(', ')}`,
  ];
  const growth = result.cells.find((c) => c.cell === 'STORAGE-GROWTH-PER-SESSION');
  if (growth?.report?.avgBytesPerSession != null) {
    lines.push(`avgBytesPerSession (hermetic): ${Math.round(growth.report.avgBytesPerSession)}`);
  }
  return lines.join('\n');
}

export async function runStorageGrowthBrowserRunner({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fixtureDir = DEFAULT_FIXTURE_DIR,
  fixturePath = DEFAULT_FIXTURE_PATH,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
  sessionCount = 3,
} = {}) {
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
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
    serverHandle = await startStorageGrowthFixtureServer({ onReport: (r) => resolveReport(r) });
    const url = `${serverHandle.origin}${fixturePath}?autorun=1&sessionCount=${sessionCount}&startId=882`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: 'talaria-storage-growth-census-',
    });
    const report = browserRun?.report;
    if (!report || browserRun?.timedOut) {
      return {
        ok: false,
        signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
        status: 'UNPROVEN',
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        meta: { browserPath, url },
      };
    }
    if (report.parseError) {
      return {
        ok: false,
        signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
        status: 'UNPROVEN',
        error: report.parseError,
        report: null,
      };
    }

    const ok = report.signature === TALARIA_STORAGE_GROWTH_CENSUS_V1 && report.status === 'GREEN';
    return {
      ok,
      signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
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
  const result = await runHermeticStorageGrowthCensusGate();
  console.log(formatStorageGrowthCensusReport(result));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
