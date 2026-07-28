import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';

export const TALARIA_ORDER_OVERLAY_BROWSER_V1 = 'TALARIA_ORDER_OVERLAY_BROWSER_V1';
export const NOT_BEHAVIOUR_COVERING = 'NOT-BEHAVIOUR-COVERING';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'order-overlay-browser');
export const DEFAULT_FIXTURE_PATH = '/host.html';
export const DEFAULT_TIMEOUT_MS = 15_000;

export const ORDER_OVERLAY_BROWSER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalBoolean(report, key, errors) {
  if (Object.hasOwn(report, key) && typeof report[key] !== 'boolean') {
    errors.push(`${key} must be boolean when present`);
  }
}

export function validateOrderOverlayReport(report) {
  const errors = [];
  if (!isPlainObject(report)) {
    return { ok: false, errors: ['report must be an object'] };
  }

  if (!(typeof report.stampObserved === 'string' || report.stampObserved === null)) {
    errors.push('stampObserved must be string|null');
  }
  if (typeof report.hostPainted !== 'boolean') {
    errors.push('hostPainted must be boolean');
  }
  if (typeof report.panelPainted !== 'boolean') {
    errors.push('panelPainted must be boolean');
  }
  if (!Array.isArray(report.consoleErrors) || report.consoleErrors.some((line) => typeof line !== 'string')) {
    errors.push('consoleErrors must be string[]');
  }
  if (typeof report.preconditionLogSeen !== 'boolean') {
    errors.push('preconditionLogSeen must be boolean');
  }
  if (!(typeof report.preconditionLogLine === 'string' || report.preconditionLogLine === null)) {
    errors.push('preconditionLogLine must be string|null');
  }
  optionalBoolean(report, 'ignitionLogSeen', errors);
  optionalBoolean(report, 'pinLifecycleSeen', errors);

  return { ok: errors.length === 0, errors };
}

function responseHeaders(contentType = 'text/plain; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': ORDER_OVERLAY_BROWSER_CSP,
    'Cache-Control': 'no-store',
  };
}

function safeFixturePath(fixtureRoot, requestPath) {
  const decoded = decodeURIComponent(requestPath === '/' ? DEFAULT_FIXTURE_PATH : requestPath);
  const target = path.resolve(fixtureRoot, `.${decoded}`);
  const rootWithSep = fixtureRoot.endsWith(path.sep) ? fixtureRoot : `${fixtureRoot}${path.sep}`;
  if (target !== fixtureRoot && !target.startsWith(rootWithSep)) return null;
  return target;
}

export function startOrderOverlayFixtureServer({ fixtureDir = DEFAULT_FIXTURE_DIR, onReport } = {}) {
  const fixtureRoot = path.resolve(fixtureDir);
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
        response.writeHead(204, responseHeaders());
        response.end();
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, responseHeaders());
      response.end('method not allowed');
      return;
    }

    const filePath = safeFixturePath(fixtureRoot, url.pathname);
    if (
      !filePath
      || !fs.existsSync(filePath)
      || fs.statSync(filePath).isDirectory()
    ) {
      response.writeHead(404, responseHeaders());
      response.end('not found');
      return;
    }

    const body = fs.readFileSync(filePath);
    response.writeHead(200, responseHeaders(MIME[path.extname(filePath)] || 'application/octet-stream'));
    if (request.method === 'HEAD') {
      response.end();
    } else {
      response.end(body);
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

export function parseOrderOverlayBrowserArgs(argv = process.argv.slice(2)) {
  const options = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    fixturePath: DEFAULT_FIXTURE_PATH,
  };

  for (const arg of argv) {
    if (arg.startsWith('--timeout-ms=')) {
      const timeoutMs = Number(arg.slice('--timeout-ms='.length));
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`invalid --timeout-ms value: ${arg}`);
      }
      options.timeoutMs = timeoutMs;
    } else if (arg.startsWith('--fixture=')) {
      const fixturePath = arg.slice('--fixture='.length);
      if (!fixturePath.startsWith('/')) {
        throw new Error('--fixture must be an absolute URL path like /host.html');
      }
      options.fixturePath = fixturePath;
    } else if (arg.startsWith('--product-shell=')) {
      options.productShell = arg.slice('--product-shell='.length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function runOrderOverlayBrowserRunner({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fixtureDir = DEFAULT_FIXTURE_DIR,
  fixturePath = DEFAULT_FIXTURE_PATH,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const browserPath = findBrowser();
  const startedAt = new Date().toISOString();
  if (!browserPath) {
    return {
      ok: false,
      signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
      notBehaviourCovering: true,
      status: NOT_BEHAVIOUR_COVERING,
      error: 'no Chromium-based browser found (Edge/Chrome); failing closed',
      report: null,
      meta: { startedAt, browserPath: null },
    };
  }

  let serverHandle;
  let resolveReport;
  const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
  });

  try {
    serverHandle = await startOrderOverlayFixtureServer({
      fixtureDir,
      onReport: (report) => resolveReport(report),
    });
    const url = `${serverHandle.origin}${fixturePath}?autorun=1`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: 'talaria-order-overlay-browser-',
    });
    const report = browserRun?.report || null;
    if (!report || browserRun?.timedOut) {
      return {
        ok: false,
        signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
        notBehaviourCovering: true,
        status: NOT_BEHAVIOUR_COVERING,
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        meta: {
          startedAt,
          finishedAt: new Date().toISOString(),
          browserPath,
          url,
          timedOut: Boolean(browserRun?.timedOut),
          stderrTail: browserRun?.stderrTail || '',
        },
      };
    }
    if (report.parseError) {
      return {
        ok: false,
        signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
        notBehaviourCovering: true,
        status: NOT_BEHAVIOUR_COVERING,
        error: `invalid /report JSON: ${report.parseError}`,
        report: null,
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url },
      };
    }

    const validation = validateOrderOverlayReport(report);
    if (!validation.ok) {
      return {
        ok: false,
        signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
        notBehaviourCovering: true,
        status: NOT_BEHAVIOUR_COVERING,
        error: `invalid report shape: ${validation.errors.join('; ')}`,
        report,
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url },
      };
    }

    return {
      ok: true,
      signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
      notBehaviourCovering: true,
      status: NOT_BEHAVIOUR_COVERING,
      report,
      meta: {
        startedAt,
        finishedAt: new Date().toISOString(),
        browserPath,
        url,
        stderrTail: browserRun?.stderrTail || '',
      },
      extensionPoints: [
        'swap --fixture=/host.html for a B-authored V6 fixture page',
        'add product shell loading behind --product-shell= without changing report schema',
        'attach V6 cells to stampObserved, hostPainted, panelPainted and precondition logs',
      ],
    };
  } catch (error) {
    return {
      ok: false,
      signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
      notBehaviourCovering: true,
      status: NOT_BEHAVIOUR_COVERING,
      error: String(error?.message || error),
      report: null,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath },
    };
  } finally {
    try {
      if (serverHandle) await serverHandle.close();
    } catch (_) {
      // Test fixture cleanup should not mask the browser/report verdict.
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result;
  try {
    result = await runOrderOverlayBrowserRunner(parseOrderOverlayBrowserArgs());
  } catch (error) {
    result = {
      ok: false,
      signature: TALARIA_ORDER_OVERLAY_BROWSER_V1,
      notBehaviourCovering: true,
      status: NOT_BEHAVIOUR_COVERING,
      error: String(error?.message || error),
    };
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
