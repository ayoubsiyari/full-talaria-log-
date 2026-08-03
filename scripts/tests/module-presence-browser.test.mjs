import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const harnessPackage = path.join(root, 'chart v 1.4/chart/multichart-prod/harness/package.json');
const require = createRequire(harnessPackage);
/**
 * HOST-SCOPE-01. A test that launches Chrome consumes the box exactly like an
 * instrument does, and a suite run during someone's measurement contaminates it just
 * as thoroughly — so it takes host scope too, and refuses rather than joining.
 */
const { withHostScope } = await import('../lib/heap-cycle-browser.mjs');
const puppeteer = withHostScope(require('puppeteer'), { script: 'module-presence-browser.test.mjs' });

const files = {
  '/host.html': 'chart v 1.4/talaria-design/live/index.html',
  '/panel.html': 'chart v 1.4/chart/multichart-prod/chart-embed.html',
  '/chart/modules/module-presence-runtime.js': 'chart v 1.4/chart/modules/module-presence-runtime.js',
  '/chart/modules/indicator-performance.js': 'chart v 1.4/chart/modules/indicator-performance.js',
  '/chart/modules/order-service.js': 'chart v 1.4/chart/modules/order-service.js',
};

function startServer() {
  let withholdPerf = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__withhold_perf__') {
      withholdPerf = true;
      response.end('ok');
      return;
    }
    if (url.pathname === '/api/auth/me') {
      response.setHeader('content-type', 'application/json');
      response.end('{"user":{"id":1}}');
      return;
    }
    if (url.pathname === '/chart/modules/indicator-performance.js' && withholdPerf) {
      response.statusCode = 404;
      response.end('');
      return;
    }
    const relative = files[url.pathname];
    if (relative) {
      let body = fs.readFileSync(path.join(root, relative));
      if (url.pathname === '/chart/modules/order-service.js') {
        const probe = `window.__ORDER_SCRIPT_STATE_SNAPSHOT = {
          keys: Object.keys(window.__TALARIA_DEGRADED_STATE || {}),
          modules: Array.from(window.__TALARIA_DEGRADED_STATE?.degradedModules || []),
          runtimeLoaded: (window.__TALARIA_LOADED_MODULES || []).some(x => x.module === 'ModulePresenceRuntime')
        };\n`;
        body = Buffer.concat([Buffer.from(probe), body]);
      }
      response.setHeader('content-type', url.pathname.endsWith('.html') ? 'text/html' : 'text/javascript');
      response.end(body);
      return;
    }
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.jsx')) {
      response.setHeader('content-type', 'text/javascript');
      response.end('');
      return;
    }
    if (url.pathname.endsWith('.css')) {
      response.setHeader('content-type', 'text/css');
      response.end('');
      return;
    }
    response.statusCode = 204;
    response.end('');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      origin: `http://127.0.0.1:${server.address().port}`,
    }));
  });
}

async function snapshot(page) {
  return page.evaluate(() => ({
    path: window.location.pathname,
    indicatorPerf: typeof window.IndicatorPerf,
    perfApi: typeof window.IndicatorPerf?.mergeIndicatorTailWindow,
    ledger: window.__TALARIA_LOADED_MODULES,
    degradedKeys: Object.keys(window.__TALARIA_DEGRADED_STATE || {}),
    degradedModules: window.__TALARIA_DEGRADED_STATE?.degradedModules,
    trailingAliasSame: window.__TALARIA_DEGRADED_STATE__ === window.__TALARIA_DEGRADED_STATE,
    aliasActive: window.__TALARIA_DEGRADED_MODE__?.active,
    orderScript: window.__ORDER_SCRIPT_STATE_SNAPSHOT,
    providerSrc: document.querySelector('script[src*="indicator-performance.js"]')?.src,
    consumerSrc: document.querySelector('script[src*="chart-indicators-full.js"]')?.src,
    providerBeforeConsumer: !!(
      document.querySelector('script[src*="indicator-performance.js"]')
        ?.compareDocumentPosition(document.querySelector('script[src*="chart-indicators-full.js"]'))
      & Node.DOCUMENT_POSITION_FOLLOWING
    ),
  }));
}

test('maintained host and panel execute contracts before order placement', { timeout: 30000 }, async () => {
  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const host = await browser.newPage();
    const panel = await browser.newPage();
    await Promise.all([
      host.goto(`${origin}/host.html`, { waitUntil: 'domcontentloaded' }),
      panel.goto(`${origin}/panel.html`, { waitUntil: 'domcontentloaded' }),
    ]);
    await Promise.all([host, panel].map((page) => page.waitForFunction(() =>
      (window.__TALARIA_LOADED_MODULES || []).some((item) => item.module === 'IndicatorPerf')
      && window.__TALARIA_DEGRADED_STATE
    )));
    const [hostState, panelState] = await Promise.all([snapshot(host), snapshot(panel)]);
    for (const state of [hostState, panelState]) {
      assert.equal(state.indicatorPerf, 'object');
      assert.equal(state.perfApi, 'function');
      assert.deepEqual(state.ledger.map((item) => item.module), ['ModulePresenceRuntime', 'IndicatorPerf']);
      assert.deepEqual(state.degradedKeys, ['degradedModules']);
      assert.deepEqual(state.degradedModules, [], JSON.stringify(state));
      assert.equal(state.trailingAliasSame, true);
      assert.equal(state.aliasActive, false);
      assert.deepEqual(state.orderScript, { keys: ['degradedModules'], modules: [], runtimeLoaded: true });
    }
    const placed = await host.evaluate(() => {
      const before = {
        keys: Object.keys(window.__TALARIA_DEGRADED_STATE || {}),
        modules: Array.from(window.__TALARIA_DEGRADED_STATE?.degradedModules || []),
      };
      const service = new window.OrderService({ chart: null, replaySystem: null, eventBus: { emit() {} } });
      const order = service.submitOrder({ orderType: 'market', symbol: 'EURUSD' });
      return { before, placed: !!order };
    });
    assert.deepEqual(placed, { before: { keys: ['degradedModules'], modules: [] }, placed: true });

    await host.evaluate(() => window.__TALARIA_DEGRADED_STATE.degradedModules.push('HostOnlyProbe'));
    assert.deepEqual(await panel.evaluate(() => window.__TALARIA_DEGRADED_STATE.degradedModules), []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('withheld IndicatorPerf is browser-visible RED on host and panel', { timeout: 30000 }, async () => {
  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    await fetch(`${origin}/__withhold_perf__`);
    for (const shell of ['host.html', 'panel.html']) {
      const page = await browser.newPage();
      await page.goto(`${origin}/${shell}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() =>
        window.__TALARIA_DEGRADED_STATE?.degradedModules?.includes('IndicatorPerf')
      );
      const state = await snapshot(page);
      assert.equal(state.indicatorPerf, 'undefined');
      assert.deepEqual(state.degradedKeys, ['degradedModules']);
      assert.deepEqual(state.degradedModules, ['IndicatorPerf']);
      assert.equal(state.aliasActive, true);
      assert.deepEqual(state.orderScript, { keys: ['degradedModules'], modules: [], runtimeLoaded: true });
      assert.equal(await page.$eval('#talaria-degraded-indicator', (node) => node.textContent), 'Degraded');
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
