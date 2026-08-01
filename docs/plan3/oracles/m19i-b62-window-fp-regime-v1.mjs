import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const require = createRequire(import.meta.url);

const SOURCE_INDICATORS = 'chart v 1.4/chart/modules/chart-indicators-full.js';
const SOURCE_ORDER_MANAGER = 'chart v 1.4/chart/modules/order-manager.js';
const SIGNATURE = 'TALARIA_M19I_B62_WINDOW_FP_REGIME_V1';
const BAR_COUNT = 625;
const FREEZE_SECONDS = 1;
const CADENCE_HZ = 60;
const ITERATIONS = FREEZE_SECONDS * CADENCE_HZ;
const TRADE_COUNT = 43;
const MAX_MEMO_ON_VS_OFF_RATIO = 0.30;

function readRel(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractProductWindowFp({ memoEnabled }) {
  const source = readRel(SOURCE_INDICATORS);
  const start = source.indexOf('function _m19iB62SafeNonnegativeInteger');
  const end = source.indexOf('function _m19iB62TailToken', start);
  if (start < 0 || end < 0) {
    throw new Error('m19i-b62-window-fp-anchor-broken');
  }
  const productWindowFp = vm.runInThisContext(
    `(function() {\nvar Chart = function Chart() {};\n${source.slice(start, end)}\nreturn _m19iB62WindowFp;\n})()`,
    { filename: SOURCE_INDICATORS },
  );
  if (typeof productWindowFp !== 'function') {
    throw new Error('m19i-b62-window-fp-not-installed');
  }
  return function windowFpWithSwitch(data, tailStart, totalLength) {
    const priorWindow = globalThis.window;
    globalThis.window = { __TALARIA_INDICATOR_FP_MEMO_V1: memoEnabled === true };
    try {
      return productWindowFp(data, tailStart, totalLength);
    } finally {
      globalThis.window = priorWindow;
    }
  };
}

function buildBars(count = BAR_COUNT) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const base = 100 + Math.sin(i / 7) * 3 + i * 0.001;
    out.push({
      t: 1_700_000_000_000 + i * 60_000,
      o: base,
      h: base + 0.5,
      l: base - 0.5,
      c: base + 0.1,
      v: 1000 + (i % 17),
    });
  }
  return out;
}

function buildOrders(count = TRADE_COUNT) {
  const orders = [];
  for (let i = 0; i < count; i += 1) {
    orders.push({
      id: 10_000 + i,
      type: i % 2 ? 'SELL' : 'BUY',
      status: 'OPEN',
      ticker: 'EURUSD',
      symbol: 'EURUSD',
      sourceFileId: 610,
      openTime: 1_700_000_000_000 + i * 60_000,
      openPrice: 1.08 + i * 0.0001,
      quantity: 1,
      stopLoss: 1.07,
      takeProfit: 1.10,
    });
  }
  return orders;
}

function buildChart(regime) {
  const bars = buildBars();
  const chart = {
    currentSymbol: 'EURUSD',
    currentFileId: 610,
    currentTimeframe: '1m',
    data: bars,
    rawData: bars,
    replaySystem: {
      isActive: true,
      currentIndex: bars.length - 1,
      fullRawData: bars,
      replayTimestamp: bars[bars.length - 1].t,
    },
  };
  const OrderManager = require(path.join(repoRoot, SOURCE_ORDER_MANAGER));
  const manager = Object.create(OrderManager.prototype);
  manager.chart = chart;
  manager.replaySystem = chart.replaySystem;
  manager.openPositions = regime === 'trade-heavy' ? buildOrders() : [];
  manager.pendingOrders = [];
  manager.orderLines = [];
  chart.orderManager = manager;
  chart.replaySystem.chart = chart;
  return {
    chart,
    orderManagerClass: OrderManager && OrderManager.name,
    realOrderManagerPrototype: manager instanceof OrderManager,
  };
}

function measureMs(fn, bars, iterations = ITERATIONS) {
  let sink = 0;
  for (let i = 0; i < 20; i += 1) sink ^= fn(bars, 0, bars.length) || 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) sink ^= fn(bars, 0, bars.length) || 0;
  const totalMs = performance.now() - start;
  return {
    totalMs,
    perCadenceMs: totalMs / iterations,
    sink,
  };
}

function extractWorkerTerminateHarness() {
  const source = readRel(SOURCE_INDICATORS);
  const start = source.indexOf('var _indicatorWorkerSingleton = null;');
  const end = source.indexOf('function recalcMultiPassOverlayMa', start);
  if (start < 0 || end < 0) {
    throw new Error('indicator-worker-terminate-anchor-broken');
  }
  const listeners = {};
  const workers = [];
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      workers.push(this);
    }

    postMessage() {}

    terminate() {
      this.terminated = true;
    }
  }
  const sandbox = {
    globalThis: {},
    window: {
      __TALARIA_WORKER_TERMINATE_V1: true,
      addEventListener: (name, fn) => {
        listeners[name] = listeners[name] || [];
        listeners[name].push(fn);
      },
    },
    Worker: FakeWorker,
    Map,
    Error,
    console: { warn: () => {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${source.slice(start, end)}
globalThis.__getIndicatorWorker = _getIndicatorWorker;
globalThis.__terminateIndicatorWorkerV1 = _terminateIndicatorWorkerV1;
globalThis.__getIndicatorWorkerSingleton = function() { return _indicatorWorkerSingleton; };
globalThis.__workerPending = _workerPending;`,
    sandbox,
    { filename: SOURCE_INDICATORS },
  );
  return { sandbox, listeners, workers };
}

function runWorkerTerminateControl() {
  const source = readRel(SOURCE_INDICATORS);
  const staticHasTerminate = source.includes('__TALARIA_WORKER_TERMINATE_V1')
    && source.includes('.terminate()')
    && source.includes("addEventListener('pagehide'")
    && source.includes("addEventListener('beforeunload'");
  const { sandbox, listeners, workers } = extractWorkerTerminateHarness();
  const worker = sandbox.__getIndicatorWorker();
  const pagehide = listeners.pagehide?.[0];
  if (typeof pagehide === 'function') pagehide();
  const terminated = worker && worker.terminated === true;
  const cleared = sandbox.__getIndicatorWorkerSingleton() == null;
  return {
    cell: 'LIFE-2-WORKER-TERMINATE-ON-CYCLE-CLOSE',
    status: staticHasTerminate && terminated && cleared ? 'GREEN' : 'RED',
    staticHasTerminate,
    listeners: Object.keys(listeners),
    workersCreated: workers.length,
    terminated,
    singletonCleared: cleared,
    switch: '__TALARIA_WORKER_TERMINATE_V1',
    reason: staticHasTerminate && terminated && cleared ? null : 'indicator-worker-not-terminated-on-cycle-close',
  };
}

function runRegime(productWindowFpOff, productWindowFpOn, regime) {
  const { chart, orderManagerClass, realOrderManagerPrototype } = buildChart(regime);
  const memoOff = measureMs(productWindowFpOff, chart.data);
  const memoOn = measureMs(productWindowFpOn, chart.data);
  const ratio = memoOff.totalMs > 0 ? memoOn.totalMs / memoOff.totalMs : Infinity;
  const status = memoOn.totalMs < memoOff.totalMs * MAX_MEMO_ON_VS_OFF_RATIO
    ? 'GREEN'
    : 'RED';
  return {
    regime,
    status,
    configStamp: {
      barCount: chart.data.length,
      tradeCount: chart.orderManager.openPositions.length,
      cadenceHz: CADENCE_HZ,
      freezeSeconds: FREEZE_SECONDS,
      iterations: ITERATIONS,
      unit: 'milliseconds',
      realOrdersOnChartOrderManager: regime === 'trade-heavy',
      orderManagerClass,
      realOrderManagerPrototype,
    },
    memoOffMs: memoOff.totalMs,
    memoOnMs: memoOn.totalMs,
    memoOffPerCadenceMs: memoOff.perCadenceMs,
    memoOnPerCadenceMs: memoOn.perCadenceMs,
    savedMs: memoOff.totalMs - memoOn.totalMs,
    memoOnVsOffRatio: ratio,
    thresholdRatio: MAX_MEMO_ON_VS_OFF_RATIO,
    switch: '__TALARIA_INDICATOR_FP_MEMO_V1',
  };
}

function runNoRegressionControls(productWindowFpOff, productWindowFpOn) {
  const bars = buildBars();
  const offFull = productWindowFpOff(bars, 0, bars.length);
  const onFull = productWindowFpOn(bars, 0, bars.length);
  const onRepeat = productWindowFpOn(bars, 0, bars.length);
  bars[200].v += 1;
  const offMiddleVolume = productWindowFpOff(bars, 0, bars.length);
  bars[200].v -= 1;

  const tailStart = bars.length - 64;
  const baseTail = productWindowFpOn(bars, tailStart, bars.length);
  bars[10].c += 0.25;
  const outsideTail = productWindowFpOn(bars, tailStart, bars.length);
  bars[10].c -= 0.25;
  bars[bars.length - 1].c += 0.25;
  const endpointChanged = productWindowFpOn(bars, tailStart, bars.length);

  return [
    {
      cell: 'LAG-3-MEMO-OFF-ON-FIRST-FINGERPRINT-MATCH',
      status: onFull === offFull ? 'GREEN' : 'RED',
      reason: onFull === offFull ? null : 'memo-switch-changed-window-fingerprint',
    },
    {
      cell: 'LAG-3-MEMO-HIT-REPEATS-SAME-FINGERPRINT',
      status: onRepeat === onFull ? 'GREEN' : 'RED',
      reason: onRepeat === onFull ? null : 'memo-repeat-window-fingerprint-changed',
    },
    {
      cell: 'B62-FP-SWITCH-OFF-MIDDLE-VOLUME-MUTATION',
      status: offMiddleVolume !== offFull ? 'GREEN' : 'RED',
      reason: offMiddleVolume !== offFull ? null : 'switch-off-middle-volume-mutation-not-detected',
    },
    {
      cell: 'B62-FP-OUTSIDE-TAIL-UNCHANGED',
      status: outsideTail === baseTail ? 'GREEN' : 'RED',
      reason: outsideTail === baseTail ? null : 'outside-tail-mutation-invalidated-tail-window',
    },
    {
      cell: 'LAG-3-MEMO-ENDPOINT-CHANGE-INVALIDATES',
      status: endpointChanged !== baseTail ? 'GREEN' : 'RED',
      reason: endpointChanged !== baseTail ? null : 'memo-endpoint-change-not-detected',
    },
  ];
}

export function runM19iB62WindowFpRegimeOracle() {
  const productWindowFpOff = extractProductWindowFp({ memoEnabled: false });
  const productWindowFpOn = extractProductWindowFp({ memoEnabled: true });
  const regimes = [
    runRegime(productWindowFpOff, productWindowFpOn, 'zero-trade'),
    runRegime(productWindowFpOff, productWindowFpOn, 'trade-heavy'),
  ];
  const noRegression = runNoRegressionControls(productWindowFpOff, productWindowFpOn);
  const lifecycle = [runWorkerTerminateControl()];
  const status = regimes.every((cell) => cell.status === 'GREEN')
    && noRegression.every((cell) => cell.status === 'GREEN')
    && lifecycle.every((cell) => cell.status === 'GREEN')
    ? 'GREEN'
    : 'RED';
  return {
    signature: SIGNATURE,
    status,
    source: SOURCE_INDICATORS,
    sourceOrderManager: SOURCE_ORDER_MANAGER,
    regime01: {
      requiredArms: ['zero-trade', 'trade-heavy'],
      noRegressionClause: 'memo switch must preserve first fingerprint value, repeat hits, switch-off mutation detection, and endpoint invalidation',
      metric: 'milliseconds',
    },
    regimes,
    noRegression,
    lifecycle,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runM19iB62WindowFpRegimeOracle();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
