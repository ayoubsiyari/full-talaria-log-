#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const out = path.resolve(process.env.LIVE_AUDIT_EVIDENCE ||
  path.join(os.tmpdir(), `b75-indicator-performance-live-audit-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const surfaces = [
  ['product-shell', '/'],
  ['chart-entry', '/chart/index.html'],
  ['vite-react-dist', '/chart/dist-v9/index.html?mode=backtest'],
  ['legacy', '/chart/legacy-index.html'],
  ['embed', '/chart/multichart-prod/chart-embed.html'],
  ['iframe-host', '/chart/multichart/chart-host.html'],
  ['multichart-shell', '/chart/multichart/multichart-shell.html'],
  ['react-live', '/chart/talaria-design/live/index.html'],
];
const safeUrl = (raw) => {
  const u = new URL(raw, origin);
  return `${u.origin}${u.pathname}`;
};
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-extensions'] });
const auth = await browser.newPage();
await auth.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const login = await auth.evaluate(async ({ email, password }) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}, { email, password });
if (login.status !== 200 || !login.body?.success) throw new Error(`login failed HTTP ${login.status}`);

const direct = await auth.evaluate(async () => {
  const response = await fetch('/chart/modules/indicator-performance.js', { credentials: 'include' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    cacheControl: response.headers.get('cache-control'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    bytes: [...bytes],
  };
});
const digest = crypto.createHash('sha256').update(Buffer.from(direct.bytes)).digest('hex');
delete direct.bytes;
direct.sha256 = digest;

const evidence = {
  evidenceClass: 'tier3-read-only-live-runtime-audit',
  capturedAt: new Date().toISOString(),
  expected: { commit: '6880a6030', buildId: '20260726b75' },
  origin: safeUrl(origin),
  direct,
  surfaces: [],
};

for (const [name, route] of surfaces) {
  const page = await browser.newPage();
  const requests = [];
  const responses = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    if (/indicator-performance|chart\.js|replay|indicator/i.test(request.url())) {
      requests.push({
        url: safeUrl(request.url()), resourceType: request.resourceType(),
        initiator: request.initiator(),
      });
    }
  });
  page.on('response', (response) => {
    if (/indicator-performance|chart\.js|replay|indicator/i.test(response.url())) {
      responses.push({
        url: safeUrl(response.url()), status: response.status(),
        fromCache: response.fromCache(), fromServiceWorker: response.fromServiceWorker(),
        headers: response.headers(),
      });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().replaceAll(email, '[redacted]').slice(0, 500));
  });
  let navigation = null;
  try {
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    navigation = { status: response?.status() ?? null, finalUrl: safeUrl(page.url()), headers: response?.headers() || {} };
  } catch (error) {
    navigation = { error: String(error?.message || error), finalUrl: safeUrl(page.url()) };
  }
  const frames = await Promise.all(page.frames().map(async (frame) => frame.evaluate(() => ({
    url: location.origin + location.pathname,
    scripts: [...document.scripts].map((s) => s.src ? new URL(s.src).pathname : '[inline]'),
    buildId: window.__TALARIA_CHART_BUILD_ID || null,
    flags: Object.fromEntries(Object.keys(window)
      .filter((key) => /(?:M19I|B62|EXACT.?TAIL)/i.test(key))
      .sort().map((key) => [key, typeof window[key] === 'object' ? JSON.parse(JSON.stringify(window[key])) : window[key]])),
    perfObjects: Object.fromEntries(Object.keys(window)
      .filter((key) => /indicator.*perf|perf.*indicator/i.test(key))
      .sort().map((key) => [key, typeof window[key]])),
    serviceWorker: {
      controlled: !!navigator.serviceWorker?.controller,
      controllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
    },
    cspMeta: [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content),
  })).catch((error) => ({ url: safeUrl(frame.url()), error: String(error?.message || error) }))));
  const loaded = responses.some((item) => /indicator-performance\.js$/i.test(item.url) && item.status === 200);
  const referenced = frames.some((frame) => frame.scripts?.some((src) => /indicator-performance\.js$/i.test(src)));
  evidence.surfaces.push({
    name, route, navigation, requests, responses, frames, consoleErrors,
    verdict: loaded ? 'LOADED' : referenced ? 'REFERENCED_NOT_EXECUTED' : 'SERVED_NOT_REFERENCED',
  });
  await page.close();
}
evidence.overallVerdict = evidence.surfaces.every((surface) => surface.verdict === 'LOADED')
  ? 'LOADED' : evidence.surfaces.some((surface) => surface.verdict === 'REFERENCED_NOT_EXECUTED')
    ? 'REFERENCED_NOT_EXECUTED' : 'SERVED_NOT_REFERENCED';
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
await auth.close();
await browser.close();
process.stdout.write(`${JSON.stringify({ out, overallVerdict: evidence.overallVerdict,
  surfaces: evidence.surfaces.map(({ name, verdict, navigation }) => ({ name, verdict, status: navigation.status })) }, null, 2)}\n`);
