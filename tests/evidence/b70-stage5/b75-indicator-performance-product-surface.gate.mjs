#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../../chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { runServableInventoryNegativeControls, validateServableInventory } from '../b80-indicator-loader/servable-inventory-preflight.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const chartRoot = path.join(root, 'chart v 1.4', 'chart');
const modulePath = path.join(chartRoot, 'modules', 'indicator-performance.js');
const authoredAgainst = '967f96692fbccd448a3a31c7b2ff71718e18a71e';
const mechanismRow = 'B75/M19-I(a)-INDICATOR-PERFORMANCE-LOADER';
const maxStaleBuilds = 20;
const entries = [
  {
    name: 'maintained-source',
    file: path.join(root, 'chart v 1.4', 'talaria-design', 'live', 'index.html'),
    pathname: null,
    serveRoot: null,
  },
  {
    name: 'dist-v9-host',
    file: path.join(chartRoot, 'dist-v9', 'index.html'),
    pathname: '/chart/dist-v9/index.html',
    serveRoot: chartRoot,
  },
  {
    name: 'homepage-forwarded-host',
    file: path.join(root, 'homepage', 'public', 'chart', 'dist-v9', 'index.html'),
    pathname: '/chart/dist-v9/index.html',
    serveRoot: path.join(root, 'homepage', 'public', 'chart'),
  },
  {
    name: 'multichart-embed',
    file: path.join(chartRoot, 'multichart-prod', 'chart-embed.html'),
    pathname: '/chart/multichart-prod/chart-embed.html',
    serveRoot: chartRoot,
  },
];
const requiredApis = [
  'packBarsRangeCompact',
  'mergeIndicatorTailWindow',
  'estimateTailLookback',
  'hashIndicatorParams',
];

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function injectBeforeIndicators(html) {
  const needle = /(<script\b[^>]*src=["'][^"']*modules\/chart-indicators-full\.js[^"']*["'][^>]*><\/script>)/i;
  if (!needle.test(html)) return html;
  const absolute = html.includes('/chart/modules/chart-indicators-full.js');
  const src = absolute ? '/chart/modules/indicator-performance.js' : 'modules/indicator-performance.js';
  return html.replace(needle, `<script defer src="${src}?v=b75-explicit-loader"></script>\n    $1`);
}

function mutateHtml(html, mode) {
  const without = html.replace(/<script\b[^>]*src=["'][^"']*modules\/indicator-performance\.js[^"']*["'][^>]*><\/script>\s*/gi, '');
  if (mode === 'product') return html;
  if (mode === 'broken') return without;
  if (mode === 'blocked') return html;
  if (mode === 'corrupt') return injectBeforeIndicators(without);
  if (mode === 'wrong-order') {
    const fixed = injectBeforeIndicators(without);
    const tag = fixed.match(/<script\b[^>]*src=["'][^"']*modules\/indicator-performance\.js[^"']*["'][^>]*><\/script>/i)?.[0] || '';
    return fixed.replace(tag, '').replace(
      /(<script\b[^>]*src=["'][^"']*modules\/chart-indicators-full\.js[^"']*["'][^>]*><\/script>)/i,
      `$1\n    ${tag}`,
    );
  }
  return injectBeforeIndicators(without);
}

function isolateAuditedScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, body) =>
    (/src=["'][^"']*modules\/(?:indicator-performance|chart-indicators-full)\.js/i.test(attrs)
      || (/indicator-performance\.js/.test(body) && /chart-indicators-full\.js/.test(body)))
      ? tag : '');
}

function localFile(entry, pathname) {
  const relative = pathname.startsWith('/chart/') ? pathname.slice(7) : '';
  return path.join(entry.serveRoot, relative || 'dist-v9/index.html');
}

async function startSurfaceServer(entry, mode) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://gate.invalid').pathname);
    if (pathname === '/api/auth/me') {
      response.setHeader('content-type', 'application/json');
      response.end('{"user":{"id":"b75-presence-gate"}}');
      return;
    }
    const file = localFile(entry, pathname);
    if (!file.startsWith(entry.serveRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const extension = path.extname(file);
    if (extension === '.html') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(isolateAuditedScripts(mutateHtml(fs.readFileSync(file, 'utf8'), mode)));
      return;
    }
    if (extension === '.css') {
      response.setHeader('content-type', 'text/css');
      response.end('');
      return;
    }
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    if (pathname.endsWith('/indicator-performance.js') && mode === 'blocked') {
      response.writeHead(503).end('bridge blocked by fault injection');
      return;
    }
    if (pathname.endsWith('/indicator-performance.js') && mode === 'corrupt') {
      response.end('window.IndicatorPerf = { packBarsRangeCompact: "corrupted" };');
      return;
    }
    // Keep the loader graph real while making unrelated modules inert. The two
    // dependency files under audit are always byte-real.
    if (pathname.endsWith('/indicator-performance.js')
        || pathname.endsWith('/chart-indicators-full.js')) {
      response.end(fs.readFileSync(file));
      return;
    }
    response.end('');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function observeSurface(browser, entry, mode, host = '127.0.0.1') {
  const server = await startSurfaceServer(entry, mode);
  const port = server.address().port;
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page._client().send('Network.setBypassServiceWorker', { bypass: true });
  const requests = [];
  const responses = [];
  const errors = [];
  page.on('request', (request) => {
    if (/indicator-performance|chart-indicators-full/.test(request.url())) requests.push(request.url());
  });
  page.on('response', (response) => {
    if (/indicator-performance|chart-indicators-full/.test(response.url())) {
      responses.push({ url: response.url(), status: response.status() });
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`http://${host}:${port}${entry.pathname}`, {
      waitUntil: 'domcontentloaded',
      timeout: 1_000,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page._client().send('Page.stopLoading').catch(() => {});
    const runtime = await page.evaluate((apis) => ({
      moduleGlobalType: typeof window.IndicatorPerf,
      apis: Object.fromEntries(apis.map((name) => [name, typeof window.IndicatorPerf?.[name]])),
      resources: performance.getEntriesByType('resource')
        .map((item) => item.name)
        .filter((name) => /indicator-performance|chart-indicators-full/.test(name)),
    }), requiredApis);
    const perfIndex = requests.findIndex((url) => /indicator-performance/.test(url));
    const indicatorsIndex = requests.findIndex((url) => /chart-indicators-full/.test(url));
    const checks = {
      referenced: perfIndex >= 0,
      executed: runtime.moduleGlobalType === 'object',
      correctOrder: perfIndex >= 0 && indicatorsIndex > perfIndex,
      flagsAvailable: requiredApis.every((name) => runtime.apis[name] === 'function'),
      responsesOk: responses.filter((row) => /indicator-performance|chart-indicators-full/.test(row.url))
        .every((row) => row.status === 200),
    };
    return {
      entry: entry.name, pathname: entry.pathname, mode, host,
      coldCache: true, serviceWorkerBypassed: true,
      requests, responses, errors, runtime, checks,
      pass: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function staticSurface(entry) {
  const html = fs.readFileSync(entry.file, 'utf8');
  const perf = html.indexOf('modules/indicator-performance.js');
  const indicators = html.indexOf('modules/chart-indicators-full.js');
  const perfStamp = html.match(/indicator-performance\.js\?v=([^"'&\s]+)/)?.[1];
  const indicatorStamp = html.match(/chart-indicators-full\.js\?v=([^"'&\s]+)/)?.[1];
  const embedStamp = html.match(/window\.__TALARIA_CHART_BUILD_ID = p\.get\('v'\) \|\| '([^']+)'/)?.[1];
  return {
    entry: entry.name,
    path: path.relative(root, entry.file),
    sourceSha256: digest(html),
    referenced: perf >= 0,
    correctOrder: perf >= 0 && indicators > perf,
    buildStamp: perfStamp || embedStamp || null,
    dependencyStampsUniform: embedStamp
      ? Boolean(embedStamp)
      : Boolean(perfStamp && perfStamp === indicatorStamp),
  };
}

async function run({ inverted = false, host = '127.0.0.1' } = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-extensions', '--disable-background-timer-throttling'],
  });
  try {
    const runtimeEntries = entries.filter((entry) => entry.pathname);
    const target = runtimeEntries[0];
    const broken = await observeSurface(browser, target, 'broken', host);
    const blocked = await observeSurface(browser, target, 'blocked', host);
    // Broken removes any loader. Explicit-loader restores it. Corrupt serves a
    // malformed bridge through the real loader path; wrong-order moves it late.
    const explicitLoader = await observeSurface(browser, target, 'fixed', host);
    const corrupted = await observeSurface(browser, target, 'corrupt', host);
    const wrongOrder = await observeSurface(browser, target, 'wrong-order', host);
    const product = [];
    for (const entry of runtimeEntries) product.push(await observeSurface(browser, entry, 'product', host));
    const staticSurfaces = entries.map(staticSurface);
    const buildStamps = [...new Set(staticSurfaces.map((cell) => cell.buildStamp))];
    const expected = {
      brokenRed: broken.pass === false,
      blockedBridgeAndMissingGlobalRed:
        blocked.pass === false && blocked.runtime.moduleGlobalType === 'undefined',
      explicitLoaderGreen: explicitLoader.pass === true,
      corruptedRed: corrupted.pass === false,
      wrongOrderRed: wrongOrder.pass === false,
    };
    const normalFourState = Object.values(expected).every(Boolean);
    const assertedFourState = inverted ? !normalFourState : normalFourState;
    return {
      schemaVersion: 1,
      oracle: {
        id: 'B75-INDICATOR-PERFORMANCE-PRODUCT-SURFACE-V1',
        mechanismRow,
        authoredAgainst,
        authoredAgainstSubject: 'chore(release): package 20260727b79 Tier-2 train',
        lastProvenRedOn: '967f96692-b79',
        staleness: { maxBuilds: maxStaleBuilds, status: 'PROVEN-RED' },
        moduleSha256: digest(fs.readFileSync(modulePath)),
        deterministicAssertionPayload: true,
      },
      host: {
        platform: process.platform, node: process.version, hostname: host,
        clock: 'performance-resource-order', coldCache: true, serviceWorkerBypassed: true,
      },
      excludedNonProductionSurface: 'homepage/public/chart/talaria-design/live/index.html',
      staticSurfaces,
      uniformBuildStamp: buildStamps.length === 1 ? buildStamps[0] : null,
      fourState: { expected, normalFourState, inverted, assertedFourState },
      cells: { broken, blocked, explicitLoader, corrupted, wrongOrder, product },
      productPass: buildStamps.length === 1
        && staticSurfaces.every((cell) =>
          cell.referenced && cell.correctOrder && cell.dependencyStampsUniform)
        && product.every((cell) => cell.pass),
    };
  } finally {
    await browser.close();
  }
}

const evidenceDir = path.join(here, 'artifacts');
fs.mkdirSync(evidenceDir, { recursive: true });

// A5 authoring proof: 3 repeats on the normal clock plus an alternate monotonic
// host clock (hrtime) used to independently stamp duration, never as payload.
const repeats = [];
for (let i = 0; i < 3; i++) repeats.push(await run());
const alternateStarted = process.hrtime.bigint();
const alternate = await run({ host: 'localhost' });
alternate.host.clock = 'process.hrtime.bigint';
alternate.host.elapsedNs = String(process.hrtime.bigint() - alternateStarted);
const inverted = await run({ inverted: true });
const buildPreflight = validateServableInventory();
const buildPreflightNegativeControls = runServableInventoryNegativeControls();

if (process.env.B75_GATE_DEBUG === '1') {
  process.stderr.write(`${JSON.stringify({
    fourState: repeats[0].fourState,
    cells: Object.fromEntries(['broken', 'explicitLoader', 'corrupted', 'wrongOrder']
      .map((name) => [name, repeats[0].cells[name]])),
  }, null, 2)}\n`);
}
for (const result of repeats) {
  assert.equal(result.fourState.normalFourState, true, 'A5 four-state proof');
}
assert.equal(alternate.fourState.normalFourState, true, 'alternate host/clock four-state proof');
assert.equal(inverted.fourState.assertedFourState, false, 'inverted assertion must flip');

const evidence = {
  verdict: repeats.every((item) => item.productPass) && alternate.productPass ? 'GREEN' : 'RED',
  priorZeroMsGreen: 'INVALID',
  reason: 'A timing result cannot prove a cure that is absent from the measured product shell.',
  buildPreflight,
  buildPreflightNegativeControls,
  repeats,
  alternate,
  invertedAssertion: inverted.fourState,
};
const outPath = path.join(evidenceDir, 'b75-indicator-performance-product-surface.json');
fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  verdict: evidence.verdict,
  priorZeroMsGreen: evidence.priorZeroMsGreen,
  evidencePath: outPath,
  productCells: repeats[0].cells.product.map((cell) => ({
    entry: cell.entry, pass: cell.pass, checks: cell.checks,
  })),
}, null, 2)}\n`);
process.exitCode = evidence.verdict === 'GREEN' ? 0 : 1;
