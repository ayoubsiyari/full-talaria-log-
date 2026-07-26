#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(here, '..');
const harnessPackage = process.env.B70_HARNESS_PACKAGE
  || fileURLToPath(new URL('../multichart-prod/harness/package.json', import.meta.url));
const require = createRequire(harnessPackage);
const puppeteer = require('puppeteer');
let connected = true;
let browser;
try {
  browser = await puppeteer.connect({ browserURL: process.env.B70_CDP_ENDPOINT || 'http://127.0.0.1:50982' });
} catch (_) {
  connected = false;
  browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 30_000,
    userDataDir: process.env.B70_AUTH_PROFILE
      || 'C:/Users/user/AppData/Local/Temp/puppeteer_dev_chrome_profile-JGTIse',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}
const origin = process.env.TEST_VPS_URL || 'http://31.97.192.82:3000';
const expected = '20260725b70';
const overlays = new Map([
  ['/chart/chart.js', fs.readFileSync(path.join(chartRoot, 'chart.js'))],
  ['/chart/multichart-prod/embed-bridge.js', fs.readFileSync(path.join(chartRoot, 'multichart-prod', 'embed-bridge.js'))],
  ['/chart/multichart-prod/multichart-manager.js', fs.readFileSync(path.join(chartRoot, 'multichart-prod', 'multichart-manager.js'))],
]);
const page = await browser.newPage();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = [];

await page.setRequestInterception(true);
page.on('request', (req) => {
  let pathname = '';
  try { pathname = new URL(req.url()).pathname; } catch (_) {}
  const body = overlays.get(pathname);
  if (body) {
    req.respond({ status: 200, contentType: 'application/javascript', body }).catch(() => {});
  } else {
    req.continue().catch(() => {});
  }
});

if (!connected && process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const login = await page.evaluate(async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok, status: response.status };
  }, process.env.TEST_EMAIL, process.env.TEST_PASSWORD);
  if (!login.ok) throw new Error(`fresh browser login failed with HTTP ${login.status}`);
}

async function observe(label) {
  await sleep(12_000);
  const state = await page.evaluate((lab) => {
    const mgr = window.__mcManager || window.__multichartManagerRef;
    const frames = [...document.querySelectorAll('iframe')].map((frame) => {
      let bars = null; let build = null;
      try {
        bars = frame.contentWindow.chart && Array.isArray(frame.contentWindow.chart.data)
          ? frame.contentWindow.chart.data.length : null;
        build = frame.contentWindow.__TALARIA_CHART_BUILD_ID || null;
      } catch (_) {}
      return {
        id: frame.dataset.chartId || new URL(frame.src).searchParams.get('panelId'),
        opacity: frame.style.opacity || getComputedStyle(frame).opacity,
        bars,
        build,
      };
    });
    return {
      label: lab,
      build: window.__TALARIA_CHART_BUILD_ID || null,
      hostBars: window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : null,
      hostRestore: window.chart && window.chart._multichartHostRestoreState,
      frames,
      manager: mgr && mgr.charts ? [...mgr.charts.entries()].map(([id, c]) => ({
        id, ready: !!c.ready, failed: !!c.bootFailed,
      })) : [],
    };
  }, label);
  const green = state.build === expected
    && state.hostRestore && state.hostRestore.status === 'ready'
    && state.frames.length === 3
    && state.frames.every((f) => f.build === expected && f.opacity === '1' && f.bars > 0);
  rows.push({ ...state, green });
  return green;
}

try {
  const url = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=4&sessionId=827`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const auth = await page.evaluate(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      return { ok: response.ok, status: response.status };
    } catch (error) {
      return { ok: false, status: 0, error: String(error) };
    }
  });
  if (!auth.ok) throw new Error(`BLOCKED-AUTH: /api/auth/me HTTP ${auth.status}${auth.error ? ` ${auth.error}` : ''}`);
  await page.waitForFunction((id) => window.__TALARIA_CHART_BUILD_ID === id, { timeout: 60_000 }, expected);
  await observe('initial');
  for (let i = 1; i <= 6; i += 1) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await observe(`reload-${i}`);
  }
  const reloads = rows.slice(1);
  const summary = {
    attempts: reloads.length,
    green: reloads.filter((r) => r.green).length,
    failures: reloads.filter((r) => !r.green).length,
    rows,
  };
  fs.writeFileSync(path.join(here, 'b70-reload-panel-boot-green-evidence.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ attempts: summary.attempts, green: summary.green, failures: summary.failures }, null, 2));
  if (summary.failures) process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  if (connected) browser.disconnect();
  else await browser.close();
}
