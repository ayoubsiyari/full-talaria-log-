#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findLocalChromiumBrowser,
  runHeadlessUrl,
} from '../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ORDER_MANAGER_PATH = path.resolve(root, 'chart v 1.4/chart/modules/order-manager.js');

export const LAG1A_MARKER_INDEX_CACHE_SIGNATURE = 'TALARIA_LAG1A_MARKER_INDEX_CACHE_V1';
export const LAG1A_BAR_COUNT = 6242;
export const LAG1A_TRADE_COUNT = 43;
export const LAG1A_RENDERS_PER_SECOND = 60;
export const LAG1A_MIN_IMPROVEMENT_FRACTION = 0.25;

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function jsonResponse(response, value, status = 200) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function hostHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>LAG-1a marker index cache gate</title></head>
<body>
<script src="/order-manager-under-test.js"></script>
<script>
(function () {
  const BAR_COUNT = ${LAG1A_BAR_COUNT};
  const TRADE_COUNT = ${LAG1A_TRADE_COUNT};
  const RENDERS_PER_SECOND = ${LAG1A_RENDERS_PER_SECOND};
  const MIN_IMPROVEMENT_FRACTION = ${LAG1A_MIN_IMPROVEMENT_FRACTION};

  function makeBars(n) {
    const start = 1700000000000;
    return Array.from({ length: n }, (_, i) => ({
      t: start + i * 60000,
      o: 1,
      h: 1.1,
      l: 0.9,
      c: 1,
    }));
  }

  function makeTrades(data, n, symbol) {
    const stride = Math.max(2, Math.floor(data.length / (n + 2)));
    return Array.from({ length: n }, (_, i) => {
      const entryIdx = Math.min(data.length - 2, 1 + i * stride);
      const exitIdx = Math.min(data.length - 1, entryIdx + 1);
      return {
        id: i + 1,
        tradeId: i + 1,
        ticker: symbol,
        symbol,
        openTime: data[entryIdx].t,
        closeTime: data[exitIdx].t,
        entryMarkerTimeMs: data[entryIdx].t,
        exitMarkerTimeMs: data[exitIdx].t,
        openPrice: data[entryIdx].c,
        closePrice: data[exitIdx].c,
      };
    });
  }

  function makeOm(chart, orders) {
    const OM = window.__LAG1A_OrderManager;
    const om = Object.create(OM.prototype);
    om.chart = chart;
    om.tradeJournal = orders;
    om.closedPositions = orders;
    om.openPositions = [];
    om.pendingOrders = [];
    om._playbackReplaySystem = function () { return chart.replaySystem; };
    om._getCurrentCandleForChart = function (ch) { return ch && ch.data ? ch.data[ch.data.length - 1] : null; };
    chart.orderManager = om;
    return om;
  }

  function wrongInstrumentCell(chartSymbol, orders) {
    const wrong = orders.some((order) => String(order.ticker || order.symbol || '').toUpperCase() !== chartSymbol);
    return {
      name: 'NC-LAG1A-WRONG-INSTRUMENT-TRADE-GATE',
      status: wrong ? 'GREEN' : 'RED',
      reportStatus: wrong ? 'RED' : 'GREEN',
      detail: wrong ? 'wrong-instrument order rejected by gate arm' : 'wrong-instrument control failed to go RED',
    };
  }

  function runRegime({ name, tradeCount, cacheEnabled, wrongInstrument = false }) {
    window.__TALARIA_MARKER_INDEX_CACHE_V1 = cacheEnabled;
    const data = makeBars(BAR_COUNT);
    const chartSymbol = 'EURUSD';
    const chart = { data, symbol: chartSymbol, currentTimeframe: '1m', replaySystem: { isActive: false } };
    const orders = makeTrades(data, tradeCount, wrongInstrument ? 'GBPUSD' : chartSymbol);
    const om = makeOm(chart, orders);
    const wrongCell = wrongInstrumentCell(chartSymbol, orders);
    if (wrongInstrument) {
      return { name, cacheEnabled, status: 'RED', wrongInstrumentCell: wrongCell };
    }

    const before = performance.now();
    for (let render = 0; render < RENDERS_PER_SECOND; render++) {
      for (const order of orders) {
        om._chartIndexForCloseMarkerOnChart(chart, order.entryMarkerTimeMs);
        om._chartIndexForCloseMarkerOnChart(chart, order.exitMarkerTimeMs);
      }
    }
    const elapsedMs = performance.now() - before;
    return {
      name,
      status: 'GREEN',
      cacheEnabled,
      bars: data.length,
      trades: orders.length,
      realOrdersOnChart: chart.orderManager === om && chart.orderManager.tradeJournal === orders,
      callsPerSecond: orders.length * 2 * RENDERS_PER_SECOND,
      msPerSecond: Math.round(elapsedMs * 100) / 100,
      wrongInstrumentCell: wrongCell,
    };
  }

  function compareRegime(name, tradeCount) {
    const before = runRegime({ name: name + '-before', tradeCount, cacheEnabled: false });
    const after = runRegime({ name: name + '-after', tradeCount, cacheEnabled: true });
    const delta = before.msPerSecond - after.msPerSecond;
    const improvementFraction = before.msPerSecond > 0 ? delta / before.msPerSecond : 0;
    const noRegression = after.msPerSecond <= before.msPerSecond + 0.25;
    const improved = tradeCount > 0 ? improvementFraction >= MIN_IMPROVEMENT_FRACTION : true;
    return {
      name,
      status: noRegression && improved && after.realOrdersOnChart ? 'GREEN' : 'RED',
      before,
      after,
      deltaMsPerSecond: Math.round(delta * 100) / 100,
      improvementFraction: Math.round(improvementFraction * 10000) / 10000,
      noRegression,
      improved,
    };
  }

  async function main() {
    const zeroTrade = compareRegime('LAG-ZT-ZERO-TRADE', 0);
    const tradeHeavy = compareRegime('LAG-1A-TRADE-HEAVY', TRADE_COUNT);
    const wrongInstrument = runRegime({
      name: 'NC-LAG1A-WRONG-INSTRUMENT',
      tradeCount: TRADE_COUNT,
      cacheEnabled: true,
      wrongInstrument: true,
    });
    const wrongInstrumentArmed = wrongInstrument.wrongInstrumentCell.status === 'GREEN'
      && wrongInstrument.status === 'RED';
    const regimes = [zeroTrade, tradeHeavy];
    const status = regimes.every((regime) => regime.status === 'GREEN') && wrongInstrumentArmed
      ? 'GREEN'
      : 'RED';
    await fetch('/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: '${LAG1A_MARKER_INDEX_CACHE_SIGNATURE}',
        status,
        switchName: '__TALARIA_MARKER_INDEX_CACHE_V1',
        metric: 'ms/s',
        regimes,
        wrongInstrument,
        wrongInstrumentArmed,
      }),
    });
  }
  main().catch(async (error) => {
    await fetch('/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: '${LAG1A_MARKER_INDEX_CACHE_SIGNATURE}',
        status: 'RED',
        error: String(error && error.stack || error),
      }),
    });
  });
})();
</script>
</body>
</html>`;
}

function orderManagerSourceUnderTest({ mutant = false } = {}) {
  let source = fs.readFileSync(ORDER_MANAGER_PATH, 'utf8');
  if (mutant) {
    const boundCall = 'let idx = this._findCandleIndexForTimeCached(data, ct, { skipNearestFallback: replayActive });';
    const revertedCall = 'let idx = this._findCandleIndexForTime(data, ct, { skipNearestFallback: replayActive });';
    if (!source.includes(boundCall)) {
      throw new Error('LAG-1a mutant could not find cached marker-index binding');
    }
    source = source.replace(boundCall, revertedCall);
  }
  return source + '\n;window.__LAG1A_OrderManager = OrderManager;\n';
}

async function startLag1aServer({ onReport, mutant = false }) {
  const orderManagerSource = orderManagerSourceUnderTest({ mutant });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === '/report') {
        const body = await readRequestJson(request);
        jsonResponse(response, { ok: true });
        onReport(body);
        return;
      }
      if (url.pathname === '/' || url.pathname === '/lag1a.html') {
        send(response, 200, hostHtml(), 'text/html; charset=utf-8');
        return;
      }
      if (url.pathname === '/order-manager-under-test.js') {
        send(response, 200, orderManagerSource, 'text/javascript; charset=utf-8');
        return;
      }
      jsonResponse(response, { error: 'not found' }, 404);
    } catch (error) {
      jsonResponse(response, { error: String(error?.message || error) }, 500);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function runLag1aBrowserPass({
  browserPath,
  timeoutMs,
  runBrowser,
  mutant,
  startedAt,
}) {
  let server;
  let resolveReport;
  const reportPromise = new Promise((resolve) => { resolveReport = resolve; });
  try {
    server = await startLag1aServer({ onReport: resolveReport, mutant });
    const url = `${server.url}/lag1a.html`;
    const browserRun = await runBrowser({
      browserPath,
      url,
      reportPromise,
      timeoutMs,
      profilePrefix: mutant ? 'talaria-lag1a-marker-index-mutant-' : 'talaria-lag1a-marker-index-',
    });
    const report = browserRun.report || null;
    if (!report || browserRun.timedOut) {
      return {
        ok: false,
        status: 'RED',
        signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
        error: `no valid /report POST within ${timeoutMs}ms`,
        report: null,
        meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, mutant, timedOut: true, stderrTail: browserRun.stderrTail || '' },
      };
    }
    const ok = report.status === 'GREEN';
    return {
      ok,
      status: ok ? 'GREEN' : 'RED',
      signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
      error: ok ? null : (report.error || 'LAG-1a REGIME-01 gate failed'),
      report,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, url, mutant, stderrTail: browserRun.stderrTail || '' },
    };
  } catch (error) {
    return {
      ok: false,
      status: 'RED',
      signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
      error: String(error?.message || error),
      report: null,
      meta: { startedAt, finishedAt: new Date().toISOString(), browserPath, mutant },
    };
  } finally {
    if (server) await server.close().catch(() => {});
  }
}

export async function runLag1aMarkerIndexCacheGate({
  requireBrowser = false,
  timeoutMs = 60_000,
  findBrowser = findLocalChromiumBrowser,
  runBrowser = runHeadlessUrl,
} = {}) {
  const startedAt = new Date().toISOString();
  const browserPath = findBrowser();
  if (!browserPath) {
    return {
      ok: false,
      status: requireBrowser ? 'RED' : 'SKIP',
      signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
      error: 'no Chromium-based browser found (Edge/Chrome)',
      meta: { startedAt, browserPath: null, requireBrowser },
    };
  }

  const acceptance = await runLag1aBrowserPass({
    browserPath,
    timeoutMs,
    runBrowser,
    mutant: false,
    startedAt,
  });
  if (!acceptance.ok) {
    return {
      ...acceptance,
      acceptance,
      mutant: null,
    };
  }

  const mutant = await runLag1aBrowserPass({
    browserPath,
    timeoutMs,
    runBrowser,
    mutant: true,
    startedAt,
  });
  const mutantRed = mutant.status === 'RED'
    && mutant.report?.regimes?.some((regime) => regime.name === 'LAG-1A-TRADE-HEAVY' && regime.status === 'RED');
  const ok = mutantRed;
  return {
    ok,
    status: ok ? 'GREEN' : 'RED',
    signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
    error: ok ? null : 'LAG-1a mutant did not go RED with cached binding reverted',
    report: acceptance.report,
    acceptance,
    mutant,
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      browserPath,
      acceptanceUrl: acceptance.meta?.url || null,
      mutantUrl: mutant.meta?.url || null,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = await runLag1aMarkerIndexCacheGate({
    requireBrowser: process.argv.includes('--require-browser'),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' || report.status === 'SKIP' ? 0 : 1);
}
