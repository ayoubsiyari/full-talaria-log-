import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import puppeteer from '../multichart-prod/harness/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const modulesDir = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.dirname(modulesDir);
const chartVersionRoot = path.dirname(chartRoot);
const workspaceRoot = path.dirname(chartVersionRoot);
const entries = [
  path.join(chartRoot, 'dist-v9', 'index.html'),
  path.join(chartRoot, 'legacy-index.html'),
  path.join(chartRoot, 'multichart-prod', 'chart-embed.html'),
  path.join(chartVersionRoot, 'talaria-design', 'live', 'index.html'),
  path.join(workspaceRoot, 'homepage', 'public', 'chart', 'dist-v9', 'index.html'),
  path.join(workspaceRoot, 'homepage', 'public', 'chart', 'legacy-index.html'),
  path.join(workspaceRoot, 'homepage', 'public', 'chart', 'multichart-prod', 'chart-embed.html'),
  path.join(workspaceRoot, 'homepage', 'public', 'chart', 'talaria-design', 'live', 'index.html')
];

test('every host and panel entrypoint declares performance bridge first with cache id', () => {
  for (const entry of entries) {
    const html = fs.readFileSync(entry, 'utf8');
    const perf = html.indexOf('modules/indicator-performance.js');
    const indicators = html.indexOf('modules/chart-indicators-full.js');
    assert.ok(perf >= 0, `${entry}: performance bridge present`);
    assert.ok(indicators > perf, `${entry}: performance bridge precedes chart indicators`);
    const tail = html.slice(perf, perf + 100);
    assert.ok(/\?v=/.test(tail) || /paths\[i\] \+ q/.test(html),
      `${entry}: cache query is attached`);
  }
});

function resolveLocalFile(pathname) {
  if (pathname === '/chart/talaria-design/live/index.html') {
    return path.join(chartVersionRoot, 'talaria-design', 'live', 'index.html');
  }
  const relative = pathname.startsWith('/chart/') ? pathname.slice('/chart/'.length) : '';
  return path.join(chartRoot, relative || 'dist-v9/index.html');
}

function serveChartRoot() {
  const server = http.createServer({ maxHeaderSize: 1024 * 1024 }, (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (pathname === '/api/auth/me') {
      response.setHeader('content-type', 'application/json');
      response.end('{"id":"m19i-browser-gate","email":"gate@example.invalid"}');
      return;
    }
    const file = resolveLocalFile(pathname);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const extension = path.extname(file);
    if (extension === '.html') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(fs.readFileSync(file));
      return;
    }
    if (extension === '.css') {
      response.setHeader('content-type', 'text/css');
      response.end('');
      return;
    }
    response.setHeader('content-type', 'text/javascript; charset=utf-8');
    if (pathname === '/chart/chart.js'
        || pathname === '/chart/modules/indicator-performance.js') {
      response.end(fs.readFileSync(file));
      return;
    }
    if (pathname === '/chart/modules/chart-indicators-full.js') {
      response.end(`
        window.__M19I_B69_INIT_OBSERVATION = {
          indicatorPerfType: typeof window.IndicatorPerf,
          mergeType: typeof window.IndicatorPerf?.mergeIndicatorTailWindow
        };
        if (window.__M19I_B69_INIT_OBSERVATION.mergeType !== 'function') {
          throw new Error('chart-indicators-full initialized without IndicatorPerf bridge');
        }
      ` + fs.readFileSync(file, 'utf8'));
      return;
    }
    // Execute the real entrypoint and loader graph while stubbing unrelated
    // modules. The three production modules under test are served byte-real.
    response.end('');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('real host and panel entrypoints initialize chart indicators after bridge', async () => {
  const server = await serveChartRoot();
  const port = server.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const pathname of [
      '/chart/dist-v9/index.html',
      '/chart/legacy-index.html',
      '/chart/talaria-design/live/index.html',
      '/chart/multichart-prod/chart-embed.html'
    ]) {
      const page = await browser.newPage();
      const order = [];
      const responses = [];
      const errors = [];
      let documentStatus = null;
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const url = request.url();
        if (/indicator-performance|chart-indicators-full/.test(url)) order.push(url);
      });
      page.on('response', (response) => {
        if (response.request().isNavigationRequest()) documentStatus = response.status();
        if (/indicator-performance|chart-indicators-full/.test(response.url())) {
          responses.push([response.status(), response.headers()['content-type']]);
        }
      });
      const navigation = page.goto(`http://127.0.0.1:${port}${pathname}`, {
        waitUntil: 'domcontentloaded', timeout: 0
      }).catch(() => null);
      await page.waitForFunction(() => window.__M19I_B69_INIT_OBSERVATION, { timeout: 10000 })
        .catch(() => null);
      const initialized = await page.evaluate(() => !!window.__M19I_B69_INIT_OBSERVATION);
      assert.equal(initialized, true,
        `${pathname}: initialization observed; requests=${JSON.stringify(order)} responses=${JSON.stringify(responses)} errors=${JSON.stringify(errors)}`);
      await page._client().send('Page.stopLoading');
      await navigation;
      assert.equal(documentStatus, 200, `${pathname}: local entrypoint served`);
      const observation = await page.evaluate(() => window.__M19I_B69_INIT_OBSERVATION);
      assert.deepEqual(observation, {
        indicatorPerfType: 'object',
        mergeType: 'function'
      }, `${pathname}: execution-time bridge precondition`);
      assert.match(order[0], /indicator-performance/, `${pathname}: first dependency request`);
      assert.match(order[1], /chart-indicators-full/, `${pathname}: indicator module request`);
      assert.deepEqual(responses.map(([status]) => status), [200, 200],
        `${pathname}: dependency responses`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('missing bridge is distinct fail-closed and switch OFF is untouched', async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>atomic-tail-precondition</title>');
    await page.addScriptTag({ path: path.join(chartRoot, 'chart.js') });
    await page.addScriptTag({ path: path.join(modulesDir, 'chart-indicators-full.js') });
    const result = await page.evaluate(() => {
      const create = (enabled) => {
        window.__TALARIA_ENABLE_REPLAY_CANDLE_ATOMIC_TAIL_V1 = enabled;
        const chart = Object.create(window.Chart.prototype);
        chart.replaySystem = { isActive: true, isPlaying: true, getPlaybackMode: () => 'candle' };
        chart.data = [{ time: 1, close: 1 }];
        chart.indicators = { active: [{ id: 'tema-1', type: 'tema', params: { period: 20 } }] };
        chart._indicatorWorkerSeq = 71;
        return chart;
      };
      const on = create(true);
      const onReturn = on.commitReplayCandlePaintIndicators();
      const off = create(false);
      const offKeys = Object.keys(off).sort().join(',');
      const offReturn = off.commitReplayCandlePaintIndicators();
      return {
        onReturn,
        onError: on._rev17CandleAtomicTailLast?.error,
        onSeq: on._indicatorWorkerSeq,
        offReturn,
        offSeq: off._indicatorWorkerSeq,
        offDiagnostic: off._rev17CandleAtomicTailLast,
        offKeysUnchanged: Object.keys(off).sort().join(',') === offKeys
      };
    });
    assert.deepEqual(result, {
      onReturn: false,
      onError: 'missing-indicator-performance-bridge',
      onSeq: 71,
      offReturn: false,
      offSeq: 71,
      offKeysUnchanged: true
    });
  } finally {
    await browser.close();
  }
});
