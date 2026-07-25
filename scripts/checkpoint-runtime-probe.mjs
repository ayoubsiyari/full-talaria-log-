#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadManifest,
  verifyRuntimeSnapshot,
} from './lib/checkpoint-provenance.mjs';

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const equals = arg.indexOf('=');
    if (arg.startsWith('--') && equals !== -1) {
      result[arg.slice(2, equals)] = arg.slice(equals + 1);
    }
  }
  return result;
}

function fail(message) {
  console.error(`[checkpoint-runtime-probe] ${message}`);
  process.exit(1);
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported origin protocol: ${url.protocol}`);
  }
  return url.origin;
}

function buildUrl(origin, relativePath, nonce) {
  const url = new URL(relativePath, `${origin}/`);
  url.searchParams.set('checkpointProbe', nonce);
  return url.href;
}

async function fetchArtifact(origin, relativePath, nonce) {
  const url = buildUrl(origin, relativePath, nonce);
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache, no-store',
      pragma: 'no-cache',
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    url: response.url,
    text: buffer.toString('utf8'),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function match(text, regex, label) {
  const value = text.match(regex)?.[1];
  if (!value) throw new Error(`Could not read ${label}`);
  return value;
}

function oneCacheId(text, label) {
  const values = [...text.matchAll(/[?&]v=([^"'&#\s]+)/g)].map((entry) => entry[1]);
  const unique = [...new Set(values)];
  if (unique.length !== 1) {
    throw new Error(`${label} has ${unique.length} cache ids: ${unique.join(',') || '<none>'}`);
  }
  return unique[0];
}

async function readBrowserRuntime(browser, origin, nonce) {
  const page = await browser.newPage();
  try {
    const url = buildUrl(
      origin,
      '/chart/dist-v9/index.html?mode=backtest&mcLayout=2v',
      nonce,
    );
    await page.setCacheEnabled(false);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(
      () => typeof window.__TALARIA_CHART_BUILD_ID === 'string',
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => [...document.querySelectorAll('iframe')]
        .some((frame) => /chart-embed\.html/.test(frame.src || '')),
      { timeout: 120_000 },
    );
    const hostBuildId = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null);
    const chartFrames = page.frames().filter((frame) => /chart-embed\.html/.test(frame.url()));
    const frameBuildIds = [];
    for (const frame of chartFrames) {
      await frame.waitForFunction(
        () => typeof window.__TALARIA_CHART_BUILD_ID === 'string',
        { timeout: 120_000 },
      );
      frameBuildIds.push(
        await frame.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null),
      );
    }
    return {
      url: page.url(),
      hostBuildId,
      frameBuildIds,
      frameUrls: chartFrames.map((frame) => frame.url()),
    };
  } finally {
    await page.close();
  }
}

async function probeSurface(browser, origin, expectedBuildId, nonce) {
  const shell = await fetchArtifact(origin, '/chart/dist-v9/index.html', nonce);
  const shellBuildId = match(
    shell.text,
    /window\.__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
    'host shell build id',
  );
  const moduleQueryBuildId = match(
    shell.text,
    /\/chart\/modules\/drawing-tools-manager\.js\?v=([^"'&\s]+)/,
    'module query build id',
  );
  const embed = await fetchArtifact(
    origin,
    `/chart/multichart-prod/chart-embed.html?v=${encodeURIComponent(expectedBuildId)}`,
    nonce,
  );
  const engine = await fetchArtifact(
    origin,
    `/chart/chart.js?v=${encodeURIComponent(expectedBuildId)}`,
    nonce,
  );
  const module = await fetchArtifact(
    origin,
    `/chart/modules/drawing-tools-manager.js?v=${encodeURIComponent(expectedBuildId)}`,
    nonce,
  );
  const serviceWorker = await fetchArtifact(origin, '/chart/sw.js', nonce);
  const legacy = await fetchArtifact(origin, '/chart/legacy-index.html', nonce);
  const harness = await fetchArtifact(
    origin,
    '/chart/multichart-prod/harness/serve.mjs',
    nonce,
  );
  const embedBuildId = match(
    embed.text,
    /window\.__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/,
    'embed build id',
  );
  // Static mode is intentional for login-gated TEST surfaces: it proves the
  // host, iframe payload, and engine without waiting on an authenticated app
  // redirect. An explicitly authenticated browser run remains available.
  const browserRuntime = browser
    ? await readBrowserRuntime(browser, origin, nonce)
    : {
        hostBuildId: shellBuildId,
        frameBuildIds: [embedBuildId],
        frameUrls: [embed.url],
      };

  return {
    origin,
    shellBuildId,
    moduleQueryBuildId,
    embedBuildId,
    engineBuildId: match(
      engine.text,
      /const CHART_ENGINE_BUILD = '([^']+)'/,
      'engine build id',
    ),
    serviceWorkerBuildId: match(
      serviceWorker.text,
      /const SW_VERSION = "talaria-chart-([^"]+)"/,
      'service-worker build id',
    ),
    legacyBuildId: oneCacheId(legacy.text, 'legacy shell'),
    harnessBuildId: match(harness.text, /const buildId = '([^']+)'/, 'harness build id'),
    browserHostBuildId: browserRuntime.hostBuildId,
    browserFrameBuildIds: browserRuntime.frameBuildIds,
    browserFrameUrls: browserRuntime.frameUrls,
    hashes: {
      shell: shell.sha256,
      embed: embed.sha256,
      engine: engine.sha256,
      module: module.sha256,
      serviceWorker: serviceWorker.sha256,
      legacy: legacy.sha256,
      harness: harness.sha256,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (process.argv.includes('--provenance-guard-off')) {
  fail('--provenance-guard-off is test-harness-only and prohibited here');
}
if (!args.manifest || !args.direct || !args.public) {
  fail(
    'Usage: node scripts/checkpoint-runtime-probe.mjs '
    + '--manifest=<file> --direct=<origin> --public=<origin> [--output=<json>]',
  );
}

const manifestPath = path.resolve(process.cwd(), args.manifest);
const { manifest } = loadManifest(manifestPath);
const directOrigin = normalizeOrigin(args.direct);
const publicOrigin = normalizeOrigin(args.public);
const nonce = `${Date.now()}-${process.pid}`;
let browser = null;
if (args['browser-authenticated'] === '1') {
  const { createRequire } = await import('node:module');
  const { fileURLToPath } = await import('node:url');
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const harnessPackage = path.join(
    path.resolve(scriptDir, '..'),
    'chart v 1.4/chart/multichart-prod/harness/package.json',
  );
  const puppeteer = createRequire(harnessPackage)('puppeteer');
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

try {
  const snapshot = {
    capturedAt: new Date().toISOString(),
    direct: await probeSurface(browser, directOrigin, manifest.buildId, nonce),
    public: await probeSurface(browser, publicOrigin, manifest.buildId, nonce),
  };
  const result = verifyRuntimeSnapshot(snapshot, manifest);
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
