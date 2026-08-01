import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
  runLag1aMarkerIndexCacheGate,
} from '../lag1a-marker-index-cache-gate.mjs';

const root = process.cwd();
const chartOrderManager = readFileSync(resolve(root, 'chart v 1.4/chart/modules/order-manager.js'), 'utf8');
const homepageOrderManager = readFileSync(resolve(root, 'homepage/public/chart/modules/order-manager.js'), 'utf8');

test('LAG-1a order-manager mirrors carry identical marker index cache source', () => {
  assert.equal(homepageOrderManager, chartOrderManager);
  assert.match(chartOrderManager, /__TALARIA_MARKER_INDEX_CACHE_V1/);
  assert.match(chartOrderManager, /_markerIndexCacheForData/);
  assert.match(chartOrderManager, /_findCandleIndexForTimeCached/);
  assert.match(chartOrderManager, /_chartIndexForCloseMarkerOnChart[\s\S]*_findCandleIndexForTimeCached/);
});

function goodReport(overrides = {}) {
  return {
    signature: LAG1A_MARKER_INDEX_CACHE_SIGNATURE,
    status: 'GREEN',
    switchName: '__TALARIA_MARKER_INDEX_CACHE_V1',
    metric: 'ms/s',
    regimes: [
      {
        name: 'LAG-ZT-ZERO-TRADE',
        status: 'GREEN',
        before: { trades: 0, msPerSecond: 0 },
        after: { trades: 0, msPerSecond: 0 },
        noRegression: true,
        improved: true,
      },
      {
        name: 'LAG-1A-TRADE-HEAVY',
        status: 'GREEN',
        before: { trades: 43, realOrdersOnChart: true, msPerSecond: 34.7 },
        after: { trades: 43, realOrdersOnChart: true, msPerSecond: 8 },
        noRegression: true,
        improved: true,
      },
    ],
    wrongInstrument: { status: 'RED', wrongInstrumentCell: { status: 'GREEN' } },
    wrongInstrumentArmed: true,
    ...overrides,
  };
}

function mutantRedReport() {
  return goodReport({
    status: 'RED',
    regimes: [
      {
        name: 'LAG-ZT-ZERO-TRADE',
        status: 'GREEN',
        before: { trades: 0, msPerSecond: 0 },
        after: { trades: 0, msPerSecond: 0 },
        noRegression: true,
        improved: true,
      },
      {
        name: 'LAG-1A-TRADE-HEAVY',
        status: 'RED',
        before: { trades: 43, realOrdersOnChart: true, msPerSecond: 34.7 },
        after: { trades: 43, realOrdersOnChart: true, msPerSecond: 33.9 },
        noRegression: true,
        improved: false,
      },
    ],
  });
}

test('LAG-1a gate accepts both regimes green plus wrong-instrument RED arm', async () => {
  let calls = 0;
  const result = await runLag1aMarkerIndexCacheGate({
    findBrowser: () => '/fixture/msedge',
    runBrowser: async () => {
      calls += 1;
      return { report: calls === 1 ? goodReport() : mutantRedReport(), timedOut: false, stderrTail: '' };
    },
  });
  assert.equal(result.signature, LAG1A_MARKER_INDEX_CACHE_SIGNATURE);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.mutant.status, 'RED');
});

test('LAG-1a gate fails when only trade-heavy arm improves', async () => {
  const report = goodReport({
    status: 'RED',
    regimes: [
      {
        name: 'LAG-ZT-ZERO-TRADE',
        status: 'RED',
        before: { trades: 0, msPerSecond: 1 },
        after: { trades: 0, msPerSecond: 2 },
        noRegression: false,
        improved: false,
      },
      {
        name: 'LAG-1A-TRADE-HEAVY',
        status: 'GREEN',
        before: { trades: 43, realOrdersOnChart: true, msPerSecond: 34.7 },
        after: { trades: 43, realOrdersOnChart: true, msPerSecond: 8 },
        noRegression: true,
        improved: true,
      },
    ],
  });
  const result = await runLag1aMarkerIndexCacheGate({
    findBrowser: () => '/fixture/msedge',
    runBrowser: async () => ({ report, timedOut: false, stderrTail: '' }),
  });
  assert.equal(result.status, 'RED');
  assert.match(result.error, /REGIME-01/);
});

test('LAG-1a gate fails when wrong-instrument arm is not RED-armed', async () => {
  const result = await runLag1aMarkerIndexCacheGate({
    findBrowser: () => '/fixture/msedge',
    runBrowser: async () => ({
      report: goodReport({
        status: 'RED',
        wrongInstrumentArmed: false,
        wrongInstrument: { status: 'GREEN', wrongInstrumentCell: { status: 'RED' } },
      }),
      timedOut: false,
      stderrTail: '',
    }),
  });
  assert.equal(result.status, 'RED');
});

test('LAG-1a gate fails when cached-binding-reverted mutant stays GREEN', async () => {
  const result = await runLag1aMarkerIndexCacheGate({
    findBrowser: () => '/fixture/msedge',
    runBrowser: async () => ({ report: goodReport(), timedOut: false, stderrTail: '' }),
  });
  assert.equal(result.status, 'RED');
  assert.match(result.error, /mutant did not go RED/);
});

test('LAG-1a gate skips without browser unless browser is required', async () => {
  const optional = await runLag1aMarkerIndexCacheGate({ findBrowser: () => null });
  assert.equal(optional.status, 'SKIP');
  const required = await runLag1aMarkerIndexCacheGate({ findBrowser: () => null, requireBrowser: true });
  assert.equal(required.status, 'RED');
});
