import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const KS = '__TALARIA_DISABLE_M20_HOST_INDICATOR_ATOMIC_PAINT_V1';
const IF_KS = '__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1';
const rafQueue = [];

function ChartCtor() {}
globalThis.window = {
  Chart: ChartCtor,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  location: { href: 'http://local.test/chart?sessionId=m20-atomic-paint' },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.requestAnimationFrame = (callback) => {
  rafQueue.push(callback);
  return rafQueue.length;
};
globalThis.cancelAnimationFrame = () => {};

require('./indicator-performance.js');
require('./talaria-fvg-indicator.js');
require('./chart-indicators-full.js');
const ReplaySystem = require('./replay-system.js');
const Chart = globalThis.window.Chart;

function withSwitches(values, fn) {
  const keys = Object.keys(values);
  const prior = keys.map((key) => ({
    key,
    had: Object.prototype.hasOwnProperty.call(globalThis.window, key),
    value: globalThis.window[key],
  }));
  keys.forEach((key) => {
    const value = values[key];
    if (value === undefined) delete globalThis.window[key];
    else globalThis.window[key] = value;
  });
  try {
    return fn();
  } finally {
    prior.forEach(({ key, had, value }) => {
      if (had) globalThis.window[key] = value;
      else delete globalThis.window[key];
    });
    rafQueue.length = 0;
  }
}

function makeProductChart({ embed = false, passive = false } = {}) {
  const paints = [];
  const chart = Object.create(Chart.prototype);
  chart.data = [{ t: 1, o: 100, h: 102, l: 99, c: 101, v: 10 }];
  chart.rawData = chart.data;
  chart.currentTimeframe = '1m';
  chart.currentSymbol = 'ES';
  chart.dataVersion = 1;
  chart.indicators = {
    active: [{ id: 'sma', type: 'sma', params: { period: 1 } }],
    data: {},
  };
  chart.replaySystem = { isActive: true, isPlaying: !passive };
  chart._multichartPassivePlayActive = passive;
  chart._isMultichartEmbedPanel = () => embed;
  chart._indicatorParamsHash = () => 'sma:1';
  chart.recalculateIndicators = function recalculateIndicators() {
    this._indicatorCommittedT = this.data.at(-1).t;
    this.indicators.data.sma = { line: [this.data.at(-1).c] };
  };
  chart.updateOHLCIndicators = () => {};
  chart.bumpIndicatorRenderVersion = () => {};
  chart.render = function render() {
    paints.push({
      priceT: this.data.at(-1).t,
      indicatorT: this._indicatorCommittedT,
    });
  };
  chart.scheduleRender = function scheduleRender() {
    if (this.replaySystem.isPlaying) this.render();
    else this.renderPending = true;
  };
  chart.__paints = paints;
  return chart;
}

function makeReplay(chart, isPlaying) {
  const replay = Object.create(ReplaySystem.prototype);
  replay.chart = chart;
  replay.isPlaying = isPlaying;
  return replay;
}

test('real I-f host path commits indicators and emits one atomic product paint', () => {
  withSwitches({ [KS]: undefined, [IF_KS]: undefined }, () => {
    const chart = makeProductChart();
    const replay = makeReplay(chart, true);
    replay._scheduleReplayIndicatorRecalc();
    replay._renderReplayChartUpdate();
    assert.deepEqual(chart.__paints, [{ priceT: 1, indicatorT: 1 }]);
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
  });
});

test('real I-f OFF path stays asynchronous and is not suppressed after owner exits', () => {
  withSwitches({ [KS]: undefined, [IF_KS]: true }, () => {
    const chart = makeProductChart();
    const replay = makeReplay(chart, true);
    replay._scheduleReplayIndicatorRecalc();
    assert.equal(rafQueue.length, 1);
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
    replay._renderReplayChartUpdate();
    rafQueue.shift()();
    assert.deepEqual(chart.__paints, [
      { priceT: 1, indicatorT: undefined },
      { priceT: 1, indicatorT: 1 },
    ]);
  });
});

test('real embed-lite panel path retains its pending coherent paint', () => {
  withSwitches({ [KS]: undefined, [IF_KS]: undefined }, () => {
    const chart = makeProductChart({ embed: true, passive: true });
    const replay = makeReplay(chart, false);
    replay._scheduleReplayIndicatorRecalc();
    assert.equal(chart.renderPending, true);
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
    chart.render();
    assert.deepEqual(chart.__paints, [{ priceT: 1, indicatorT: 1 }]);
  });
});

test('kill switch executes exact legacy real host double paint', () => {
  withSwitches({ [KS]: true, [IF_KS]: undefined }, () => {
    const chart = makeProductChart();
    const replay = makeReplay(chart, true);
    replay._scheduleReplayIndicatorRecalc();
    replay._renderReplayChartUpdate();
    assert.deepEqual(chart.__paints, [
      { priceT: 1, indicatorT: 1 },
      { priceT: 1, indicatorT: 1 },
    ]);
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
  });
});

test('nested host scheduling preserves the outer owner and restores absent shape', () => {
  withSwitches({ [KS]: undefined }, () => {
    const chart = makeProductChart();
    const replay = makeReplay(chart, true);
    let depth = 0;
    chart.scheduleReplayIndicatorRecalc = () => {
      assert.equal(chart._m20HostIndicatorAtomicPaintPending, true);
      if (depth++ === 0) {
        replay._scheduleReplayIndicatorRecalc();
        assert.equal(chart._m20HostIndicatorAtomicPaintPending, true);
      }
    };
    replay._scheduleReplayIndicatorRecalc();
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
  });
});

for (const prior of [true, false]) {
  test(`real host path restores prior ${prior} ownership on normal exit`, () => {
    withSwitches({ [KS]: undefined, [IF_KS]: undefined }, () => {
      const chart = makeProductChart();
      chart._m20HostIndicatorAtomicPaintPending = prior;
      const replay = makeReplay(chart, true);
      replay._scheduleReplayIndicatorRecalc();
      assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), true);
      assert.equal(chart._m20HostIndicatorAtomicPaintPending, prior);
    });
  });
}

for (const prior of [true, false]) {
  test(`throwing host schedule restores prior ${prior} ownership exactly`, () => {
    withSwitches({ [KS]: undefined }, () => {
      const chart = makeProductChart();
      chart._m20HostIndicatorAtomicPaintPending = prior;
      chart.scheduleReplayIndicatorRecalc = () => {
        assert.equal(chart._m20HostIndicatorAtomicPaintPending, true);
        throw new Error('injected schedule failure');
      };
      const replay = makeReplay(chart, true);
      assert.throws(() => replay._scheduleReplayIndicatorRecalc(), /injected schedule failure/);
      assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), true);
      assert.equal(chart._m20HostIndicatorAtomicPaintPending, prior);
    });
  });
}

test('throwing host schedule restores an absent property exactly', () => {
  withSwitches({ [KS]: undefined }, () => {
    const chart = makeProductChart();
    chart.scheduleReplayIndicatorRecalc = () => {
      throw new Error('injected absent-owner failure');
    };
    const replay = makeReplay(chart, true);
    assert.throws(() => replay._scheduleReplayIndicatorRecalc(), /absent-owner failure/);
    assert.equal(Object.hasOwn(chart, '_m20HostIndicatorAtomicPaintPending'), false);
  });
});
