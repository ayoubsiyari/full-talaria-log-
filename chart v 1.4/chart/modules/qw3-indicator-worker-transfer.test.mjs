import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const repoRoot = findRoot(__dirname);
const workerPath = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/workers/indicator-worker.js');
const homeWorkerPath = path.resolve(findRoot(__dirname), 'homepage/public/chart/workers/indicator-worker.js');
const perfPath = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/modules/indicator-performance.js');
const homePerfPath = path.resolve(findRoot(__dirname), 'homepage/public/chart/modules/indicator-performance.js');

function makeBars(count) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * 60_000,
    o: 100 + i,
    h: 101 + i,
    l: 99 + i,
    c: 100.5 + i,
    v: 10 + i,
  }));
}

function loadWorker() {
  const messages = [];
  const self = {
    postMessage(message, transferables) {
      messages.push({ message, transferables: transferables || [] });
    },
  };
  vm.runInNewContext(fs.readFileSync(workerPath, 'utf8'), { self, console });
  return { self, messages };
}

function loadPerf() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(perfPath, 'utf8'), { window, self: window, console, Float64Array });
  return window.IndicatorPerf;
}

test('QW-3 indicator worker transfer: mirrors stay byte-identical', () => {
  assert.equal(fs.readFileSync(homeWorkerPath, 'utf8'), fs.readFileSync(workerPath, 'utf8'));
  assert.equal(fs.readFileSync(homePerfPath, 'utf8'), fs.readFileSync(perfPath, 'utf8'));
});

test('QW-3 indicator worker transfer: tail replies transfer numeric result buffers', () => {
  const { self, messages } = loadWorker();
  const bars = makeBars(40);
  self.onmessage({
    data: {
      type: 'CALCULATE_TAIL',
      id: 7,
      payload: {
        bars,
        indicators: {
          sma1: { type: 'sma', params: { period: 5 } },
          macd1: { type: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
        },
        tailStart: 0,
        fromIndex: 0,
        lookback: 40,
        totalLength: bars.length,
      },
    },
  });

  assert.equal(messages.length, 1);
  const { message, transferables } = messages[0];
  assert.equal(message.type, 'ALL_RESULTS');
  assert.ok(transferables.length >= 4, 'SMA plus MACD numeric arrays are transferred');
  assert.equal(message.results.sma1.line.__talariaFloat64Series, true);
  assert.equal(message.results.macd1.macd.__talariaFloat64Series, true);
});

test('QW-3 indicator worker transfer: merge consumes packed tail series without shape fallback', () => {
  const perf = loadPerf();
  const existing = new Array(6).fill(null);
  const fresh = {
    __talariaFloat64Series: true,
    values: new Float64Array([Number.NaN, 2, 3]),
  };
  const merged = perf.mergeIndicatorTailWindow(existing, fresh, 3, 3, 6);
  assert.equal(merged, existing);
  assert.deepEqual(existing, [null, null, null, null, 2, 3]);

  const objectExisting = { macd: new Array(4).fill(null), signal: new Array(4).fill(null) };
  const objectFresh = {
    macd: { __talariaFloat64Series: true, values: new Float64Array([1, 2]) },
    signal: { __talariaFloat64Series: true, values: new Float64Array([Number.NaN, 4]) },
  };
  const objectMerged = perf.mergeIndicatorTailWindow(objectExisting, objectFresh, 2, 2, 4);
  assert.equal(objectMerged, objectExisting);
  assert.deepEqual(objectExisting, { macd: [null, null, 1, 2], signal: [null, null, null, 4] });
});
