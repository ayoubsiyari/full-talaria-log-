#!/usr/bin/env node
/**
 * M1 real-app b120 harness.
 *
 * This is deliberately not D's synthetic 120-image page. It waits for a real app
 * build whose stamp contains `b120`, then samples the product image surface and
 * renderer/GPU process footprint. It refuses to return GREEN when the build is
 * not b120 or when no journal-like image surface is present.
 */

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const evidenceRoot = resolve(root, '../_evidence/manager-D');
const bAuthRoutePath = resolve(root, '../_evidence/manager-B/m20-j1/talaria-auth-route.mjs');
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(root, 'chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer'));

export const M1_REAL_APP_SIGNATURE = 'TALARIA_M1_B120_REAL_APP_HARNESS_V2';

const expectedBuild = process.env.M1_EXPECTED_BUILD || 'b120';
const explicitUrl = process.env.M1_REAL_APP_URL || process.env.REACT_PARITY_URL || '';
const defaultUrl = process.env.M1_DEFAULT_URL
  || 'http://31.97.192.82:3000/chart/dist-v9/index.html?mode=backtest&mcLayout=2v';
const targetUrl = explicitUrl || defaultUrl;
const cookieHeader = process.env.M1_COOKIE || process.env.LIVE_PROBE_COOKIE || '';
const pollMs = Math.max(1000, Number(process.env.M1_POLL_MS || 15_000));
const timeoutMs = Math.max(pollMs, Number(process.env.M1_WAIT_TIMEOUT_MS || 6 * 60 * 60 * 1000));
const outPath = process.env.M1_OUT
  ? resolve(root, process.env.M1_OUT)
  : resolve(root, `docs/plan3/M1-${expectedBuild.toUpperCase()}-REAL-APP-HARNESS-20260731.json`);
const evidencePath = process.env.M1_EVIDENCE_OUT
  ? resolve(root, process.env.M1_EVIDENCE_OUT)
  : resolve(evidenceRoot, `M1-${expectedBuild.toUpperCase()}-REAL-APP-HARNESS-20260731.json`);

function hasArg(name) {
  return process.argv.includes(name);
}

export function parseBuildId(text) {
  const s = String(text || '');
  const patterns = [
    /__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
    /TALARIA_CHART_BUILD_ID['"]?\s*[:=]\s*['"]([^'"]+)['"]/,
    /\b(20\d{6}b\d{2,4})\b/,
    /\b(b\d{2,4})\b/i,
  ];
  for (const pattern of patterns) {
    const m = s.match(pattern);
    if (m) return m[1];
  }
  return null;
}

async function fetchBuildId(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return parseBuildId(await res.text());
}

export function buildMatches(buildId, expected = expectedBuild) {
  return String(buildId || '').toLowerCase().includes(String(expected || '').toLowerCase());
}

async function waitForBuild(url, opts = {}) {
  const wait = !!opts.wait;
  const deadline = Date.now() + (opts.timeoutMs || timeoutMs);
  let last = { buildId: null, error: null };
  do {
    try {
      const buildId = await fetchBuildId(url);
      last = { buildId, error: null };
      if (buildMatches(buildId, opts.expectedBuild || expectedBuild)) return { ok: true, buildId };
    } catch (error) {
      last = { buildId: null, error: error.message };
    }
    if (!wait) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, opts.pollMs || pollMs));
  } while (Date.now() < deadline);
  return { ok: false, ...last };
}

function osProcessMemory(processInfo) {
  if (process.platform !== 'win32') return { rendererPrivate: 0, gpuPrivate: 0 };
  const ids = (processInfo || [])
    .map((p) => Number(p.id || p.pid || p.processId))
    .filter(Number.isFinite);
  if (!ids.length) return { rendererPrivate: 0, gpuPrivate: 0 };
  const byPid = new Map((processInfo || []).map((p) => [Number(p.id || p.pid || p.processId), p.type]));
  const script = [
    `$ids=@(${ids.join(',')})`,
    'Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64 | ConvertTo-Json -Compress',
  ].join(';');
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 10_000 }).trim();
    if (!raw) return { rendererPrivate: 0, gpuPrivate: 0 };
    const rows = JSON.parse(raw);
    const arr = Array.isArray(rows) ? rows : [rows];
    let rendererPrivate = 0;
    let gpuPrivate = 0;
    for (const row of arr) {
      const type = byPid.get(Number(row.Id));
      const bytes = Number(row.PrivateMemorySize64 || 0);
      if (type === 'renderer') rendererPrivate += bytes;
      if (type === 'GPU') gpuPrivate += bytes;
    }
    return { rendererPrivate, gpuPrivate };
  } catch (_) {
    return { rendererPrivate: 0, gpuPrivate: 0 };
  }
}

async function processBytes(browser) {
  const session = await browser.target().createCDPSession();
  try {
    const info = await session.send('SystemInfo.getProcessInfo');
    const rows = info.processInfo || [];
    const cdpRenderer = rows.filter((p) => p.type === 'renderer')
      .reduce((n, p) => n + Number(p.privateMemory || 0), 0);
    const cdpGpu = rows.filter((p) => p.type === 'GPU')
      .reduce((n, p) => n + Number(p.privateMemory || 0), 0);
    const os = osProcessMemory(rows);
    return {
      rendererPrivate: cdpRenderer || os.rendererPrivate || 0,
      gpuPrivate: cdpGpu || os.gpuPrivate || 0,
      processCount: rows.length,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

async function collectImageSurface(page) {
  const frames = page.frames();
  const rows = [];
  for (const frame of frames) {
    const frameRows = await Promise.race([
      frame.evaluate(() => Array.from(document.images).map((img) => {
        const src = String(img.currentSrc || img.src || '');
        const rect = img.getBoundingClientRect();
        return {
          frameUrl: location.href,
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          clientWidth: Math.round(rect.width || 0),
          clientHeight: Math.round(rect.height || 0),
          srcKind: src.startsWith('data:') ? 'data-url' : src ? 'url' : 'empty',
          srcLength: src.length,
          journalLike: !!(img.closest?.('[data-journal], .journal, #tradeJournal, #journalTab, .trade-list, .trade-card')),
        };
      })).catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 4000)),
    ]);
    rows.push(...(Array.isArray(frameRows) ? frameRows : []));
  }
  const imageCount = rows.length;
  const decodedPixelFloorBytes = rows.reduce(
    (n, img) => n + Math.max(0, img.naturalWidth) * Math.max(0, img.naturalHeight) * 4,
    0,
  );
  const fullResolutionImages = rows.filter((img) => img.naturalWidth >= 1000 || img.naturalHeight >= 700).length;
  const thumbnailImages = rows.filter((img) => img.naturalWidth > 0 && img.naturalHeight > 0
    && img.naturalWidth <= 320 && img.naturalHeight <= 320).length;
  const dataUrlImages = rows.filter((img) => img.srcKind === 'data-url').length;
  const journalLikeImages = rows.filter((img) => img.journalLike).length;
  return {
    imageCount,
    fullResolutionImages,
    thumbnailImages,
    dataUrlImages,
    journalLikeImages,
    decodedPixelFloorBytes,
    maxImageDecodedBytes: rows.reduce((n, img) => Math.max(n, img.naturalWidth * img.naturalHeight * 4), 0),
    rows,
  };
}

async function collectStableImageSurface(page, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15_000;
  const pollMs = opts.pollMs || 1000;
  const stableSamples = opts.stableSamples || 3;
  const deadline = Date.now() + timeoutMs;
  let lastKey = null;
  let streak = 0;
  let last = await collectImageSurface(page);
  while (Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, pollMs));
    last = await collectImageSurface(page);
    const key = [
      last.imageCount,
      last.dataUrlImages,
      last.fullResolutionImages,
      last.thumbnailImages,
      last.decodedPixelFloorBytes,
    ].join('|');
    streak = key === lastKey ? streak + 1 : 1;
    lastKey = key;
    if (streak >= stableSamples) {
      return { ...last, stable: true, stableSamples: streak };
    }
  }
  return { ...last, stable: false, stableSamples: streak };
}

export function isLoginUrl(url) {
  return /\/login\/?/i.test(String(url || ''));
}

export function classifyM1(surface, buildId, meta = {}) {
  const expected = meta.expectedBuild || expectedBuild;
  if (meta.loginLike || isLoginUrl(meta.finalUrl)) {
    return { status: 'UNPROVEN_LOGIN_PATH', reason: 'real-app redirected to login; auth cookie required' };
  }
  if (!buildMatches(buildId, expected)) return { status: 'WAITING', reason: `build-not-${expected}` };
  if (!surface || surface.imageCount === 0) return { status: 'UNPROVEN', reason: 'no-product-images' };
  if (surface.journalLikeImages === 0 && surface.dataUrlImages === 0) {
    return { status: 'UNPROVEN', reason: 'no-journal-image-surface-detected' };
  }
  if (surface.fullResolutionImages > 0) return { status: 'RED', reason: 'full-resolution-images-still-resident' };
  if (surface.thumbnailImages > 0) return { status: 'GREEN_CANDIDATE', reason: 'thumbnail-only-image-surface-detected' };
  return { status: 'UNPROVEN', reason: 'image-surface-not-classifiable' };
}

function parseCookieHeader(header, url) {
  const raw = String(header || '').trim();
  if (!raw) return [];
  const host = new URL(url).hostname;
  return raw.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const eq = part.indexOf('=');
    const name = eq >= 0 ? part.slice(0, eq).trim() : part;
    const value = eq >= 0 ? part.slice(eq + 1).trim() : '';
    return { name, value, domain: host, path: '/' };
  }).filter((c) => c.name && c.value);
}

async function runRealAppMeasurement(url, buildId) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--js-flags=--expose-gc'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    let authRoute = null;
    let journal = null;
    let cookies = [];
    if (process.env.M1_USE_B_AUTH_ROUTE !== '0' && existsSync(bAuthRoutePath) && process.env.TEST_PASSWORD) {
      try {
        const route = await import(pathToFileURL(bAuthRoutePath).href);
        const base = new URL(url).origin;
        await route.login(page, {
          email: process.env.M1_EMAIL || 'qa-canary@talaria-log.com',
          password: process.env.TEST_PASSWORD,
          base,
        });
        const ready = await route.openBacktest(page, {
          base,
          sessionId: route.JOURNAL_BEARING?.sessionId || '936',
          fileId: route.JOURNAL_BEARING?.fileId || '677',
          timeoutMs: Number(process.env.M1_AUTH_ROUTE_TIMEOUT_MS || 90_000),
        });
        journal = await route.readJournal(page, {
          sessionId: route.JOURNAL_BEARING?.sessionId || '936',
        });
        authRoute = {
          source: bAuthRoutePath,
          ready,
          journal,
          journalBearing: route.JOURNAL_BEARING || null,
        };
      } catch (error) {
        authRoute = {
          source: bAuthRoutePath,
          error: String(error && error.message ? error.message : error).slice(0, 300),
        };
      }
    }
    if (!authRoute?.ready) {
      cookies = parseCookieHeader(cookieHeader, url);
      if (cookies.length) await page.setCookie(...cookies);
      // Four-panel product keeps claiming/navigating; race a settle budget instead of waiting forever.
      await Promise.race([
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }),
        new Promise((resolveWait) => setTimeout(resolveWait, 25_000)),
      ]);
      await new Promise((resolveWait) => setTimeout(resolveWait, 8000));
      // Prefer an open journal surface when the product exposes one.
      await Promise.race([
        page.evaluate(() => {
          const candidates = [
            '[data-testid="journal-tab"]',
            '#journalTab',
            'button[aria-label*="Journal" i]',
            'button[title*="Journal" i]',
            '[data-panel="journal"]',
          ];
          for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el && typeof el.click === 'function') {
              el.click();
              return sel;
            }
          }
          return null;
        }).catch(() => null),
        new Promise((resolveWait) => setTimeout(resolveWait, 4000)),
      ]);
      await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
    }
    const pageMeta = await Promise.race([
      page.evaluate(() => ({
        finalUrl: location.href,
        buildId: window.__TALARIA_CHART_BUILD_ID || null,
        loginLike: /\/login\/?/i.test(location.href)
          || !!document.querySelector('input[type="password"]'),
        title: document.title,
      })).catch(() => null),
      new Promise((resolveWait) => setTimeout(() => resolveWait(null), 4000)),
    ]) || {
      finalUrl: page.url(),
      buildId: buildId || null,
      loginLike: isLoginUrl(page.url()),
      title: null,
    };
    const surface = await collectStableImageSurface(page);
    const processes = await processBytes(browser);
    const verdict = classifyM1(surface, pageMeta.buildId || buildId, { ...pageMeta, expectedBuild });
    return {
      signature: M1_REAL_APP_SIGNATURE,
      measuredAt: new Date().toISOString(),
      url,
      expectedBuild,
      buildId: pageMeta.buildId || buildId || null,
      finalUrl: pageMeta.finalUrl,
      authProvided: cookies.length > 0 || !!authRoute,
      authRoute,
      journal,
      verdict,
      surface,
      processes,
      caveat: 'GREEN_CANDIDATE still requires PO journal-usability confirmation per M1.',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function main() {
  if (hasArg('--dry-run')) {
    const entryScript = String(process.argv[1] || '');
    const boundedCommand = entryScript.endsWith('m1-b120-real-app-harness.mjs')
      ? 'node scripts/m1-b120-real-app-harness.mjs'
      : 'node scripts/m1-b118-real-app-harness.mjs';
    console.log(JSON.stringify({
      signature: M1_REAL_APP_SIGNATURE,
      status: 'READY',
      url: targetUrl,
      expectedBuild,
      boundedCommand,
    }, null, 2));
    return;
  }

  const build = await waitForBuild(targetUrl, { wait: hasArg('--wait') });
  if (!build.ok) {
    const report = {
      signature: M1_REAL_APP_SIGNATURE,
      status: 'WAITING',
      url: targetUrl,
      expectedBuild,
      lastBuildId: build.buildId,
      lastError: build.error,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(hasArg('--wait') ? 2 : 0);
  }

  const report = await runRealAppMeasurement(targetUrl, build.buildId);
  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(evidencePath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict.status === 'GREEN_CANDIDATE' ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
