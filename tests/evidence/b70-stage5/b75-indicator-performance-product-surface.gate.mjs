#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '../../../chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const chartRoot = path.join(root, 'chart v 1.4', 'chart');
const modulePath = path.join(chartRoot, 'modules', 'indicator-performance.js');
const authoredAgainst = '852420adcfa71eefe3a20fb388da2a6963b018ca';
const mechanismRow = 'B75/M19-I(a)-INDICATOR-PERFORMANCE-LOADER';
const maxStaleBuilds = 20;
const entries = [
  ['dist-v9', path.join(chartRoot, 'dist-v9', 'index.html'), '/chart/dist-v9/index.html'],
  ['legacy', path.join(chartRoot, 'legacy-index.html'), '/chart/legacy-index.html'],
  ['live', path.join(root, 'chart v 1.4', 'talaria-design', 'live', 'index.html'), '/chart/talaria-design/live/index.html'],
  ['multichart-embed', path.join(chartRoot, 'multichart-prod', 'chart-embed.html'), '/chart/multichart-prod/chart-embed.html'],
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

function localFile(pathname) {
  if (pathname === '/chart/talaria-design/live/index.html') {
    return path.join(root, 'chart v 1.4', 'talaria-design', 'live', 'index.html');
  }
  const relative = pathname.startsWith('/chart/') ? pathname.slice(7) : '';
  return path.join(chartRoot, relative || 'dist-v9/index.html');
}

async function startSurfaceServer(mode) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://gate.invalid').pathname);
    if (pathname === '/api/auth/me') {
      response.setHeader('content-type', 'application/json');
      response.end('{"user":{"id":"b75-presence-gate"}}');
      return;
    }
    const file = localFile(pathname);
    if (!file.startsWith(path.dirname(chartRoot)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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

async function observeSurface(browser, entry, mode) {
  const server = await startSurfaceServer(mode);
  const port = server.address().port;
  const page = await browser.newPage();
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
    await page.goto(`http://127.0.0.1:${port}${entry[2]}`, {
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
      entry: entry[0], pathname: entry[2], mode, requests, responses, errors, runtime, checks,
      pass: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function staticSurface(entry) {
  const html = fs.readFileSync(entry[1], 'utf8');
  const perf = html.indexOf('modules/indicator-performance.js');
  const indicators = html.indexOf('modules/chart-indicators-full.js');
  return {
    entry: entry[0],
    path: path.relative(root, entry[1]),
    sourceSha256: digest(html),
    referenced: perf >= 0,
    correctOrder: perf >= 0 && indicators > perf,
  };
}

async function run({ inverted = false } = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-extensions', '--disable-background-timer-throttling'],
  });
  try {
    const target = entries[0];
    const broken = await observeSurface(browser, target, 'broken');
    // Broken removes any loader. Explicit-loader restores it. Corrupt serves a
    // malformed bridge through the real loader path; wrong-order moves it late.
    const explicitLoader = await observeSurface(browser, target, 'fixed');
    const corrupted = await observeSurface(browser, target, 'corrupt');
    const wrongOrder = await observeSurface(browser, target, 'wrong-order');
    const product = [];
    for (const entry of entries) product.push(await observeSurface(browser, entry, 'product'));
    const expected = {
      brokenRed: broken.pass === false,
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
        authoredAgainstSubject: 'fix(chart): load indicator performance bridge before indicators',
        lastProvenRedOn: 'current-worktree',
        staleness: { maxBuilds: maxStaleBuilds, status: 'PROVEN-RED' },
        moduleSha256: digest(fs.readFileSync(modulePath)),
        deterministicAssertionPayload: true,
      },
      host: { platform: process.platform, node: process.version, clock: 'performance-resource-order' },
      staticSurfaces: entries.map(staticSurface),
      fourState: { expected, normalFourState, inverted, assertedFourState },
      cells: { broken, explicitLoader, corrupted, wrongOrder, product },
      productPass: product.every((cell) => cell.pass),
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
const alternate = await run();
alternate.host.clock = 'process.hrtime.bigint';
alternate.host.elapsedNs = String(process.hrtime.bigint() - alternateStarted);
const inverted = await run({ inverted: true });

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
