import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'chart-indicators-full.js'), 'utf8');
const perfSource = fs.readFileSync(path.join(here, 'indicator-performance.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(here, '..', 'workers', 'indicator-worker.js'), 'utf8');
const registryStart = source.indexOf(
  '// ─── b70 Stages 1–5: owner, pure-paint, immutable envelope + panel bridge'
);
const registryEnd = source.indexOf('function _m19iB62SafeNonnegativeInteger', registryStart);
const paintStart = source.indexOf('Chart.prototype._m19iExactTailPaint = function()');
const paintEnd = source.indexOf('/**\n     * M19-I-f coherent-presentation bridge', paintStart);
assert.ok(registryStart >= 0 && registryEnd > registryStart);
assert.ok(paintStart >= 0 && paintEnd > paintStart);

function loadProduct() {
  class Chart {}
  const context = {
    Chart,
    window: {
      __TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1: true,
      __TALARIA_B70_DEV_FREEZE_ENVELOPES: true,
    },
    performance: { timeOrigin: 1000 },
    Date,
    Map,
    Set,
    Number,
    JSON,
    Object,
    String,
    Array,
    Promise,
    queueMicrotask,
    global: {},
    console,
  };
  context._indicatorDataFingerprint = (chart) => {
    const data = chart?.data || [];
    const bar = data[data.length - 1] || {};
    return [data.length, bar.t, bar.o, bar.h, bar.l, bar.c, bar.v].join('|');
  };
  context._m19iB62ChartPairIdentity = (chart) => String(chart?.currentSymbol || '');
  context._m19iB62MasterGeneration = (chart) => String(chart?.masterGeneration || '');
  context.M19I_SYNC_ONLY_TYPES = ['sessions'];
  context._m19iB62SyncFamily = () => ({ seriesCount: 1 });
  context._m19iB66Proof = () => ({ minLookback: 64, lookbackFactor: 4 });
  const registry = source.slice(registryStart, registryEnd)
    + '\nthis.b70={key:_b70IndicatorGenerationKey,claim:_b70Stage2Claim,'
    + 'commit:_b70Stage2Commit,consume:_b70Stage3ConsumePaint,'
    + 'begin:_b70Stage3BeginRender,end:_b70Stage3EndRender,'
    + 'beginEnvelope:_b70Stage4BeginBuild,commitEnvelope:_b70Stage4CommitBuild};';
  vm.runInNewContext(registry + '\n' + source.slice(paintStart, paintEnd), context, {
    filename: 'b70-stage3-product-extract.js',
  });
  return context;
}

function makeChart(Chart, ids = ['tema-1']) {
  const chart = new Chart();
  chart.dataVersion = 7;
  chart.currentTimeframe = '1m';
  chart.currentSymbol = 'EURUSD';
  chart.currentFileId = 'file-a';
  chart.masterGeneration = 2;
  chart.data = [{ t: 1, o: 1, h: 2, l: 0, c: 1.5, v: 10 }];
  chart.indicators = {
    active: ids.map((id) => ({ id, type: 'tema', params: { period: 20 } })),
    data: Object.fromEntries(ids.map((id) => [id, [1.5]])),
  };
  chart._isInteractionFastRender = () => true;
  chart._hasHiddenOverlayIndicator = () => false;
  chart.drawIndicators = () => {};
  return chart;
}

function publishEnvelope(b70, chart, tickets) {
  const transaction = b70.beginEnvelope(chart, tickets);
  assert.ok(transaction);
  assert.equal(
    b70.commitEnvelope(chart, transaction),
    true,
    JSON.stringify(chart._b70IndicatorGenerationShadow.metrics)
  );
  assert.equal(b70.commit(chart, tickets), true);
}

function loadWholeProduct() {
  let posts = 0;
  class FakeWorker {
    constructor() { this.onmessage = null; this.onerror = null; }
    postMessage(message) {
      posts++;
      let reply;
      const self = { onmessage: null, postMessage: (value) => { reply = value; } };
      vm.runInNewContext(workerSource, { self, console });
      self.onmessage({ data: message });
      queueMicrotask(() => this.onmessage?.({ data: reply }));
    }
  }
  const window = {
    Chart: function Chart() {},
    __TALARIA_ENABLE_B70_SINGLE_INDICATOR_OWNER_V1: true,
    addEventListener() {},
    removeEventListener() {},
  };
  new Function('window', 'Worker', perfSource)(window, FakeWorker);
  new Function('window', 'Worker', source)(window, FakeWorker);
  return { window, posts: () => posts };
}

test('actual draw and exact-tail paths are pure consumers for committed generation', () => {
  const { Chart, b70 } = loadProduct();
  const chart = makeChart(Chart);
  const tickets = b70.claim(chart, 'sync', chart.indicators.active, 'replay', false);
  publishEnvelope(b70, chart, tickets);
  let draws = 0;
  chart.drawIndicators = () => { draws++; };
  const beforeData = JSON.stringify(chart.indicators.data);
  assert.equal(Object.isFrozen(chart.indicators.data), true);
  const beforeVersion = chart._indicatorRenderVersion;
  for (let i = 0; i < 8; i++) chart.drawIndicatorsOptimized();
  assert.equal(draws, 8);
  assert.equal(JSON.stringify(chart.indicators.data), beforeData);
  assert.equal(chart._indicatorRenderVersion, beforeVersion);
  const metrics = chart._b70IndicatorGenerationShadow.metrics;
  assert.equal(metrics.paintConsumerHits, 8);
  assert.equal(metrics.paintMissingGenerations, 0);
  assert.equal(metrics.paintCalculations, 0);
  assert.equal(metrics.paintPublications, 0);
  assert.equal(metrics.paintVersionBumps, 0);
  assert.equal(metrics.paintRenderSchedules, 0);
});

test('missing generation requests outside render without painting prior data', async () => {
  const { Chart } = loadProduct();
  const chart = makeChart(Chart);
  const prior = chart.indicators.data['tema-1'];
  const observedDepths = [];
  let staleDraws = 0;
  chart.drawIndicators = () => { staleDraws++; };
  chart._runIndicatorRecalc = () => {
    observedDepths.push(chart._b70IndicatorGenerationShadow.renderTransaction.depth);
  };
  chart.drawIndicatorsOptimized();
  assert.equal(chart.indicators.data['tema-1'], prior);
  assert.equal(staleDraws, 0, 'prior-generation data is retained but never painted');
  assert.deepEqual(observedDepths, []);
  await Promise.resolve();
  assert.deepEqual(observedDepths, [0]);
  const metrics = chart._b70IndicatorGenerationShadow.metrics;
  assert.equal(metrics.paintMissingGenerations, 1);
  assert.equal(metrics.paintDeferredRequests, 1);
  assert.equal(metrics.paintCalculations, 0);
});

test('nested render exception restores depth and coalesces deferred owner', async () => {
  const { Chart, b70 } = loadProduct();
  const chart = makeChart(Chart);
  publishEnvelope(
    b70, chart, b70.claim(chart, 'sync', chart.indicators.active, 'replay', false)
  );
  let nested = false;
  let requests = 0;
  chart._runIndicatorRecalc = () => { requests++; };
  chart.drawIndicators = () => {
    if (!nested) {
      nested = true;
      chart.dataVersion++;
      chart.drawIndicatorsOptimized();
      throw new Error('nested paint fault');
    }
  };
  assert.throws(() => chart.drawIndicatorsOptimized(), /nested paint fault/);
  const state = chart._b70IndicatorGenerationShadow;
  assert.equal(state.renderTransaction.depth, 0);
  assert.equal(state.renderTransaction.owner, null);
  assert.equal(state.metrics.paintReentries, 1);
  assert.equal(state.metrics.paintExceptions, 1);
  await Promise.resolve();
  assert.equal(requests, 1);
});

test('lifecycle disposal cancels deferred paint request', async () => {
  const { Chart } = loadProduct();
  const chart = makeChart(Chart);
  let requests = 0;
  chart._runIndicatorRecalc = () => { requests++; };
  chart.drawIndicatorsOptimized();
  chart._b70ShadowDisposeIndicatorGeneration();
  await Promise.resolve();
  assert.equal(requests, 0);
  assert.equal('_b70IndicatorGenerationShadow' in chart, false);
});

test('host and panel charts retain independent committed generations', () => {
  const { Chart, b70 } = loadProduct();
  const host = makeChart(Chart, ['tema-1', 'tema-2', 'tema-3', 'tema-4']);
  const panel = makeChart(Chart, ['tema-1', 'tema-2', 'tema-3', 'tema-4']);
  publishEnvelope(
    b70, host, b70.claim(host, 'sync', host.indicators.active, 'host', false)
  );
  host.drawIndicatorsOptimized();
  panel.drawIndicatorsOptimized();
  assert.equal(host._b70IndicatorGenerationShadow.metrics.paintConsumerHits, 1);
  assert.equal(panel._b70IndicatorGenerationShadow.metrics.paintMissingGenerations, 1);
});

test('actual worker commit publishes once and schedules exactly one render', async () => {
  const { window, posts } = loadWholeProduct();
  const chart = Object.create(window.Chart.prototype);
  chart.data = Array.from({ length: 120 }, (_, i) => ({
    t: 1700000000000 + i * 60000,
    o: 100 + i / 100,
    h: 101 + i / 100,
    l: 99 + i / 100,
    c: 100.5 + i / 100,
    v: 1000 + i,
  }));
  chart.rawData = chart.data;
  chart.dataVersion = 1;
  chart.currentTimeframe = '1m';
  chart.currentSymbol = 'EURUSD';
  chart.indicators = {
    active: [{ id: 'vwap-1', type: 'vwap', params: {} }],
    data: {},
  };
  chart.replaySystem = { isActive: false, isPlaying: false };
  chart.updateOHLCIndicators = () => {};
  let renders = 0;
  chart.scheduleRender = () => { renders++; };
  chart.recalculateIndicatorsAsync();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(posts(), 1);
  assert.equal(
    renders, 1,
    JSON.stringify(chart._b70IndicatorGenerationShadow?.metrics)
  );
  assert.equal(
    chart._indicatorRenderVersion, 1,
    JSON.stringify({
      metrics: chart._b70IndicatorGenerationShadow?.metrics,
      currentGeneration:
        chart._b70IndicatorGenerationShadow?.currentEnvelope?.metadata?.generationId,
      lastVersionGeneration:
        chart._b70IndicatorGenerationShadow?.lastVersionGenerationId,
    })
  );
  assert.ok(chart.indicators.data['vwap-1']);
  const metrics = chart._b70IndicatorGenerationShadow.metrics;
  assert.deepEqual(
    { ...metrics.ownerCommits },
    { sync: 0, worker: 1 }
  );
  assert.equal(metrics.successfulCommits, 1);
  assert.equal(metrics.workerCommitRenderSchedules, 1);
});

test('actual sync construction keeps public pointer stable until one commit', () => {
  const { window } = loadWholeProduct();
  const chart = Object.create(window.Chart.prototype);
  chart.data = Array.from({ length: 120 }, (_, i) => ({
    t: 1700000000000 + i * 60000,
    o: 100 + i / 100,
    h: 101 + i / 100,
    l: 99 + i / 100,
    c: 100.5 + i / 100,
    v: 1000 + i,
  }));
  chart.rawData = chart.data;
  chart.dataVersion = 1;
  chart.currentTimeframe = '1m';
  chart.currentSymbol = 'EURUSD';
  const indicators = {
    active: [{ id: 'wma-1', type: 'wma', params: { period: 20 } }],
  };
  let pointer = {};
  const prior = pointer;
  let swaps = 0;
  Object.defineProperty(indicators, 'data', {
    configurable: true,
    get: () => pointer,
    set: (next) => { swaps++; pointer = next; },
  });
  chart.indicators = indicators;
  chart.replaySystem = { isActive: false, isPlaying: false };
  chart.updateOHLCIndicators = () => {};
  chart.recalculateIndicators();
  assert.equal(swaps, 1);
  assert.notEqual(pointer, prior);
  assert.equal(
    chart._indicatorRenderVersion, 1,
    JSON.stringify({
      currentGeneration:
        chart._b70IndicatorGenerationShadow?.currentEnvelope?.metadata?.generationId,
      lastVersionGeneration:
        chart._b70IndicatorGenerationShadow?.lastVersionGenerationId,
      version: chart._indicatorRenderVersion,
    })
  );
  assert.equal(pointer['wma-1'].length, chart.data.length);
  assert.equal(
    chart._b70IndicatorGenerationShadow.metrics.envelopeCommits, 1
  );
});
