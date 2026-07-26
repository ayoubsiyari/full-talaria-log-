#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

function safeUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/auth|cookie|session|token|secret|key/i.test(key)) {
        url.searchParams.set(key, '<redacted>');
      }
    }
    return url.href;
  } catch {
    return '<invalid-url>';
  }
}

function statusClass(status) {
  return Number.isInteger(status) ? `${Math.floor(status / 100)}xx` : 'none';
}

function diagnosticError(stage, details, cause) {
  const diagnostic = {
    stage,
    currentUrl: details.currentUrl ? safeUrl(details.currentUrl) : null,
    frameUrls: (details.frameUrls || []).slice(0, 12).map(safeUrl),
    statusClasses: [...new Set(details.statusClasses || [])].slice(0, 8),
    redirects: (details.redirects || []).slice(-12).map(safeUrl),
  };
  return new Error(`${stage} failed: ${cause}; diagnostics=${JSON.stringify(diagnostic)}`);
}

async function fetchArtifact(origin, relativePath, nonce, diagnostics = null) {
  const url = buildUrl(origin, relativePath, nonce);
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache, no-store',
      pragma: 'no-cache',
    },
  });
  diagnostics?.statusClasses.push(statusClass(response.status));
  if (response.redirected) diagnostics?.redirects.push(response.url);
  if (response.status === 401 || response.status === 403) {
    throw diagnosticError('static-fetch', {
      ...diagnostics,
      currentUrl: response.url,
    }, `authentication rejected with HTTP ${response.status}`);
  }
  if (/\/(?:login|sign-?in)(?:[/?#]|$)/i.test(new URL(response.url).pathname)) {
    throw diagnosticError('static-fetch', {
      ...diagnostics,
      currentUrl: response.url,
    }, 'redirected to login');
  }
  if (!response.ok) {
    throw diagnosticError('static-fetch', {
      ...diagnostics,
      currentUrl: response.url,
    }, `HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    url: response.url,
    text: buffer.toString('utf8'),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function exactAssetPath(text, regex, expectedPath, label) {
  const configured = match(text, regex, label);
  const url = new URL(configured, 'https://probe.invalid/');
  if (url.pathname !== expectedPath) {
    throw new Error(`${label}: expected exact path ${expectedPath}, got ${url.pathname}`);
  }
  return `${url.pathname}${url.search}`;
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

function loadAuthCookies(args, env = process.env) {
  const inline = env.CHECKPOINT_BROWSER_COOKIES_JSON;
  const file = args['browser-auth-file'];
  if (inline && file) throw new Error('provide browser authentication by env or file, not both');
  if (!inline && !file) {
    throw new Error(
      'browser mode requires CHECKPOINT_BROWSER_COOKIES_JSON or --browser-auth-file',
    );
  }
  let source = inline;
  if (file) {
    const authPath = path.resolve(process.cwd(), file);
    const stat = fs.statSync(authPath);
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('browser auth file must not be accessible by group or others');
    }
    source = fs.readFileSync(authPath, 'utf8');
  }
  let cookies;
  try {
    cookies = JSON.parse(source);
  } catch {
    throw new Error('browser authentication input is not valid JSON');
  }
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('browser authentication input must contain at least one cookie');
  }
  for (const cookie of cookies) {
    if (!cookie || typeof cookie.name !== 'string' || typeof cookie.value !== 'string') {
      throw new Error('each browser authentication cookie requires string name and value');
    }
    if (!cookie.url && !cookie.domain) {
      throw new Error('each browser authentication cookie requires url or domain');
    }
  }
  return cookies;
}

async function readBrowserRuntime(browser, origin, nonce, authCookies) {
  const page = await browser.newPage();
  const diagnostics = { statusClasses: [], redirects: [], frameUrls: [] };
  try {
    await page.setCookie(...authCookies);
    page.on('response', (response) => {
      diagnostics.statusClasses.push(statusClass(response.status()));
      const chain = response.request().redirectChain();
      if (chain.length) diagnostics.redirects.push(response.url());
    });
    const url = buildUrl(
      origin,
      '/chart/dist-v9/index.html?mode=backtest&mcLayout=2v',
      nonce,
    );
    await page.setCacheEnabled(false);
    const navigation = await page.goto(
      url,
      { waitUntil: 'domcontentloaded', timeout: 180_000 },
    );
    diagnostics.currentUrl = page.url();
    diagnostics.frameUrls = page.frames().map((frame) => frame.url());
    const navigationStatus = navigation?.status();
    if (navigationStatus === 401 || navigationStatus === 403) {
      throw new Error(`authentication rejected with HTTP ${navigationStatus}`);
    }
    if (/\/(?:login|sign-?in)(?:[/?#]|$)/i.test(new URL(page.url()).pathname)) {
      throw new Error('redirected to login');
    }
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
  } catch (error) {
    diagnostics.currentUrl = page.url();
    diagnostics.frameUrls = page.frames().map((frame) => frame.url());
    throw diagnosticError('browser-runtime', diagnostics, error.message);
  } finally {
    await page.close();
  }
}

async function probeSurface(browser, origin, expectedBuildId, nonce, authCookies = []) {
  const diagnostics = { statusClasses: [], redirects: [], frameUrls: [] };
  const shell = await fetchArtifact(
    origin,
    '/chart/dist-v9/index.html',
    nonce,
    diagnostics,
  );
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
  const enginePath = exactAssetPath(
    shell.text,
    /<script[^>]+src=["']([^"']*\/chart\/chart\.js\?[^"']+)["']/,
    '/chart/chart.js',
    'configured engine asset',
  );
  const harness = await fetchArtifact(
    origin,
    '/chart/multichart-prod/harness/serve.mjs',
    nonce,
    diagnostics,
  );
  const iframePath = exactAssetPath(
    harness.text,
    /return\s+['"]([^'"]*\/chart\/multichart-prod\/chart-embed\.html\?[^'"]*)['"]\s*\+/,
    '/chart/multichart-prod/chart-embed.html',
    'configured iframe asset',
  );
  const embedUrl = new URL(iframePath, `${origin}/`);
  embedUrl.searchParams.set('v', expectedBuildId);
  const embed = await fetchArtifact(
    origin,
    `${embedUrl.pathname}${embedUrl.search}`,
    nonce,
    diagnostics,
  );
  const engine = await fetchArtifact(
    origin,
    enginePath,
    nonce,
    diagnostics,
  );
  const module = await fetchArtifact(
    origin,
    `/chart/modules/drawing-tools-manager.js?v=${encodeURIComponent(expectedBuildId)}`,
    nonce,
    diagnostics,
  );
  const serviceWorker = await fetchArtifact(origin, '/chart/sw.js', nonce, diagnostics);
  const legacy = await fetchArtifact(origin, '/chart/legacy-index.html', nonce, diagnostics);
  const embedBuildId = match(
    embed.text,
    /window\.__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/,
    'embed build id',
  );
  // Static mode is intentional for login-gated TEST surfaces: it proves the
  // host, iframe payload, and engine without waiting on an authenticated app
  // redirect. An explicitly authenticated browser run remains available.
  const browserRuntime = browser
    ? await readBrowserRuntime(browser, origin, nonce, authCookies)
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

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
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
let authCookies = [];
if (args['browser-authenticated'] === '1') {
  try {
    authCookies = loadAuthCookies(args);
  } catch (error) {
    fail(error.message);
  }
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
    mode: browser ? 'authenticated-browser' : 'static-parity',
    direct: await probeSurface(
      browser,
      directOrigin,
      manifest.buildId,
      nonce,
      authCookies,
    ),
    public: await probeSurface(
      browser,
      publicOrigin,
      manifest.buildId,
      nonce,
      authCookies,
    ),
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
}

export {
  buildUrl,
  diagnosticError,
  exactAssetPath,
  fetchArtifact,
  loadAuthCookies,
  parseArgs,
  probeSurface,
  readBrowserRuntime,
  safeUrl,
  statusClass,
};
