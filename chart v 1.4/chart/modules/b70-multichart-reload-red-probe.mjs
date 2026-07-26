#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const endpoint = process.env.B70_CDP_ENDPOINT;
const origin = process.env.TEST_VPS_URL;
const sessionId = process.env.B70_SESSION_ID;
if (!endpoint || !origin || !sessionId) {
  throw new Error('B70_CDP_ENDPOINT, TEST_VPS_URL and B70_SESSION_ID are required');
}
const expectedBuild = process.env.B70_EXPECTED_BUILD || '20260725b70';
const runs = Math.max(1, Number(process.env.B70_RELOAD_RUNS || 5));
const outDir = path.resolve(process.env.B70_EVIDENCE_DIR
  || 'docs/plan3/evidence/PO-B70-MULTICHART-RELOAD-RED');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function installProbe(page) {
  await page.evaluateOnNewDocument(() => {
    const root = globalThis;
    root.__b70 = {
      bornAt: performance.now(),
      nav: [],
      messages: [],
      canvas: { fillRect: 0, clearRect: 0, drawImage: 0, stroke: 0, total: 0 },
      raf: 0,
    };
    addEventListener('DOMContentLoaded', () => root.__b70.nav.push({ type: 'domcontentloaded', at: performance.now() }));
    addEventListener('load', () => root.__b70.nav.push({ type: 'load', at: performance.now() }));
    addEventListener('error', (e) => root.__b70.nav.push({
      type: 'window-error', at: performance.now(), message: String(e.message || e.error || ''),
    }));
    addEventListener('unhandledrejection', (e) => root.__b70.nav.push({
      type: 'unhandledrejection', at: performance.now(), message: String(e.reason || ''),
    }));
    addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (['bridge-ready', 'panel-cache-ready', 'chart-state', 'panel-cmd-ready', 'host-log'].includes(d.type)) {
        root.__b70.messages.push({
          at: performance.now(), type: d.type, source: d.source || null,
          candleCount: d.state ? Number(d.state.candleCount || 0) : null,
          text: d.text || null,
        });
      }
    });
    const raf = root.requestAnimationFrame;
    if (typeof raf === 'function') {
      root.requestAnimationFrame = function (fn) {
        return raf.call(this, (ts) => { root.__b70.raf += 1; return fn(ts); });
      };
    }
    const proto = root.CanvasRenderingContext2D && root.CanvasRenderingContext2D.prototype;
    if (proto) {
      for (const name of ['fillRect', 'clearRect', 'drawImage', 'stroke']) {
        const fn = proto[name];
        if (typeof fn !== 'function') continue;
        proto[name] = function (...args) {
          root.__b70.canvas[name] += 1;
          root.__b70.canvas.total += 1;
          return fn.apply(this, args);
        };
      }
    }
  });
}

async function snapshot(page, label) {
  return page.evaluate((lab) => {
    const visible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
        && r.width > 0 && r.height > 0;
    };
    const canvasState = (doc, ch) => {
      const c = doc && doc.querySelector('#chartCanvas');
      const rect = c ? c.getBoundingClientRect() : null;
      return {
        cssWidth: rect ? rect.width : null, cssHeight: rect ? rect.height : null,
        width: c ? c.width : null, height: c ? c.height : null,
        chart: !!ch, bars: ch && Array.isArray(ch.data) ? ch.data.length : null,
        renderCount: ch && Number(ch._renderCount || ch.renderCount || 0),
        probe: (doc && doc.defaultView && doc.defaultView.__b70) || null,
      };
    };
    const mgr = window.__mcManager || window.__multichartManagerRef || null;
    const frames = [...document.querySelectorAll('iframe')].map((f) => {
      let doc = null; let ch = null; let build = null;
      try {
        doc = f.contentDocument;
        ch = f.contentWindow.chart;
        build = f.contentWindow.__TALARIA_CHART_BUILD_ID || null;
      } catch (_) {}
      const entry = mgr && mgr.charts && mgr.charts.get
        ? mgr.charts.get(f.dataset.chartId || new URL(f.src).searchParams.get('panelId')) : null;
      return {
        id: f.dataset.chartId || (() => { try { return new URL(f.src).searchParams.get('panelId'); } catch (_) { return null; } })(),
        src: f.src, opacity: f.style.opacity || getComputedStyle(f).opacity,
        visible: visible(f), build, ready: entry ? !!entry.ready : null,
        cmdReady: entry ? !!entry.cmdReady : null,
        canvas: canvasState(doc, ch),
      };
    });
    const hostCanvas = document.querySelector('#chartCanvas');
    const hostWrapper = document.querySelector('#chartWrapper');
    let registration = null;
    try {
      const c = mgr && mgr.charts;
      registration = c ? [...c.entries()].map(([id, v]) => ({
        id, host: !!v.host, ready: !!v.ready, cmdReady: !!v.cmdReady,
        opacity: v.frame ? v.frame.style.opacity : null,
      })) : null;
    } catch (_) {}
    return {
      label: lab, at: new Date().toISOString(), url: location.href,
      build: window.__TALARIA_CHART_BUILD_ID || null,
      hostVisible: visible(hostCanvas) && visible(hostWrapper),
      hostCanvas: canvasState(document, window.chart),
      managerPresent: !!mgr, registration, frames,
      messages: window.__b70 ? window.__b70.messages : [],
      nav: window.__b70 ? window.__b70.nav : [],
      storage: {
        localKeys: Object.keys(localStorage).filter((k) => /layout|session|panel|multichart/i.test(k)),
        sessionKeys: Object.keys(sessionStorage).filter((k) => /layout|session|panel|multichart/i.test(k)),
        controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      },
    };
  }, label);
}

async function runCell(browser, context, name) {
  const page = await context.newPage();
  await installProbe(page);
  const consoleEvents = [];
  const network = [];
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' || /multichart|panel|failed|error/i.test(text)) {
      consoleEvents.push({ at: Date.now(), type: m.type(), text: text.slice(0, 1200), url: m.location().url || null });
    }
  });
  page.on('pageerror', (e) => consoleEvents.push({ at: Date.now(), type: 'pageerror', text: String(e.stack || e) }));
  page.on('requestfailed', (r) => network.push({
    at: Date.now(), type: 'requestfailed', url: r.url(), error: r.failure()?.errorText || null,
  }));
  page.on('response', (r) => {
    if (r.status() >= 400) network.push({ at: Date.now(), type: 'http', status: r.status(), url: r.url() });
  });

  const url = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=4&sessionId=${encodeURIComponent(sessionId)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction((b) => window.__TALARIA_CHART_BUILD_ID === b, { timeout: 60_000 }, expectedBuild);
  await sleep(15_000);
  const observations = [await snapshot(page, `${name}-initial`)];
  for (let i = 1; i <= runs; i += 1) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(15_000);
    observations.push(await snapshot(page, `${name}-reload-${i}`));
  }
  await page.screenshot({ path: path.join(outDir, `${name}-last.png`), fullPage: true });
  await page.close();
  return { name, observations, consoleEvents, network };
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.connect({ browserURL: endpoint, defaultViewport: null });
try {
  const sourceContext = browser.defaultBrowserContext();
  const authPage = (await browser.pages()).find((p) => p.url().startsWith(origin));
  if (!authPage) throw new Error('BLOCKED-AUTH: no authenticated TEST page at expected origin');
  const me = await authPage.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    return { ok: r.ok, status: r.status };
  });
  if (!me.ok) throw new Error(`BLOCKED-AUTH: /api/auth/me returned ${me.status}`);

  const cookies = await sourceContext.cookies(origin);
  const privateContext = await browser.createBrowserContext();
  await privateContext.setCookie(...cookies);

  const evidence = {
    capturedAt: new Date().toISOString(),
    expectedBuild, origin, sessionId,
    auth: { ok: true, copiedCookieCount: cookies.length },
    cells: [],
  };
  evidence.cells.push(await runCell(browser, privateContext, 'fresh-private'));
  evidence.cells.push(await runCell(browser, sourceContext, 'service-worker-context'));
  await privateContext.close();

  const reloadRows = evidence.cells.flatMap((c) => c.observations.slice(1));
  const failedRows = reloadRows.filter((o) => o.frames.length >= 3
    && o.frames.some((f) => !f.visible || f.opacity === '0'));
  evidence.summary = {
    reloadAttempts: reloadRows.length,
    blackPanelReloads: failedRows.length,
    reproductionRate: reloadRows.length ? failedRows.length / reloadRows.length : null,
    firstFailure: failedRows[0] || null,
  };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence.summary, null, 2));
} finally {
  browser.disconnect();
}
