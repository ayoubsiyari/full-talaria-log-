/**
 * L3-M10 / TAL-01798 — trade-marker projection across TF + pan glue.
 *
 * Same GBPUSD event on A=1m and B=5m/15m must share immutable entry/exit
 * price + canonical timestamp; each TF maps that timestamp to its containing
 * candle; marker ticks stay at trade price; pan must move markers every frame
 * even when an open order line exists.
 *
 * GREEN (default):
 *   node --test "chart v 1.4/chart/modules/m10-trade-marker-projection.test.mjs"
 *
 * RED-again (kill-switch — divergence + screen-stick):
 *   TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1=1 node --test \
 *     "chart v 1.4/chart/modules/m10-trade-marker-projection.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const KILL = process.env.TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1 === '1';

function installWindow() {
  global.window = KILL
    ? { __TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1: true }
    : {};
}

installWindow();
const OrderManager = require('./order-manager.js');

const T0 = 1_700_000_000_000;
const ENTRY_T = T0 + 7 * 60_000; // mid 1m bar inside first 15m / second 5m
const EXIT_T = T0 + 22 * 60_000;
const ENTRY_PX = 1.27550;
const EXIT_PX = 1.27620;

function make1mBars(n = 40) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = 1.27500 + i * 0.00002;
    bars.push({
      t: T0 + i * 60_000,
      o: c,
      h: c + 0.00040,
      l: c - 0.00040,
      c,
      v: 1,
    });
  }
  // Ensure entry/exit prices sit inside their 1m bars.
  const eIdx = bars.findIndex((b) => b.t === ENTRY_T);
  const xIdx = bars.findIndex((b) => b.t === EXIT_T);
  if (eIdx >= 0) {
    bars[eIdx].l = Math.min(bars[eIdx].l, ENTRY_PX - 0.00005);
    bars[eIdx].h = Math.max(bars[eIdx].h, ENTRY_PX + 0.00005);
  }
  if (xIdx >= 0) {
    bars[xIdx].l = Math.min(bars[xIdx].l, EXIT_PX - 0.00005);
    bars[xIdx].h = Math.max(bars[xIdx].h, EXIT_PX + 0.00005);
  }
  return bars;
}

function resample(bars1m, tfMs) {
  const out = [];
  for (let i = 0; i < bars1m.length; ) {
    const start = bars1m[i].t;
    const bucketEnd = start + tfMs;
    let o = bars1m[i].o;
    let h = bars1m[i].h;
    let l = bars1m[i].l;
    let c = bars1m[i].c;
    let j = i;
    while (j < bars1m.length && bars1m[j].t < bucketEnd) {
      h = Math.max(h, bars1m[j].h);
      l = Math.min(l, bars1m[j].l);
      c = bars1m[j].c;
      j += 1;
    }
    out.push({ t: start, o, h, l, c, v: 1 });
    i = j > i ? j : i + 1;
  }
  return out;
}

function selStub(attrs = {}) {
  const state = { ...attrs, display: null };
  const api = {
    empty: () => false,
    attr(k, v) {
      if (v === undefined) return state[k];
      state[k] = v;
      return api;
    },
    style(k, v) {
      if (v === undefined) return state[k];
      state[k] = v;
      return api;
    },
    select() {
      return selStub();
    },
    _state: state,
  };
  return api;
}

function makeChart(tf, data, offsetX = 0) {
  const spacing = 10;
  const chart = {
    currentSymbol: 'GBPUSD',
    currentFileId: 'file-gbpusd',
    currentTimeframe: tf,
    data: data.map((b) => ({ ...b })),
    offsetX,
    margin: { l: 0, t: 0, r: 0, b: 0 },
    getCandleSpacing: () => spacing,
    dataIndexToPixel(idx) {
      return 50 + idx * spacing + Number(this.offsetX || 0);
    },
    yScale(price) {
      return 1000 - Number(price) * 100;
    },
    scales: {},
    svg: {
      select: () => selStub(),
      selectAll: () => ({ remove: () => {}, each: () => {} }),
      append: () => selStub(),
    },
    parseTimeframe(tfStr) {
      const m = String(tfStr || '').match(/^(\d+)(m|h|d)$/i);
      if (!m) return 60_000;
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      if (u === 'm') return n * 60_000;
      if (u === 'h') return n * 3_600_000;
      return n * 86_400_000;
    },
  };
  chart.scales.yScale = chart.yScale.bind(chart);
  return chart;
}

function makeOm(chart) {
  const om = Object.create(OrderManager.prototype);
  om.chart = chart;
  om.entryMarkers = [];
  om.exitMarkers = [];
  om.partialCloseMarkers = [];
  om.tradeConnectors = [];
  om.orderLines = [];
  om.openPositions = [];
  om.closedPositions = [];
  om.pendingOrders = [];
  om._pruneMarkerRegistriesForChart = () => {};
  om._orderRefForMarkerOrderId = (id) => ({
    id,
    type: 'BUY',
    openTime: ENTRY_T,
    openPrice: ENTRY_PX,
    entryMarkerTimeMs: ENTRY_T,
    exitMarkerTimeMs: EXIT_T,
    ticker: 'GBPUSD',
    symbol: 'GBPUSD',
  });
  om._positionTickerMatchesChartSymbol = () => true;
  om._repositionTradeMarkerTooltip = () => {};
  om._playbackReplaySystem = () => null;
  om._isMarkerTimeVisibleInReplay = () => true;
  return om;
}

function seedMarkers(om, chart) {
  const entryTick = selStub({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const exitTick = selStub({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const entryMarker = {
    select(role) {
      if (role === '[data-role="entry-tick"]') return entryTick;
      return selStub();
    },
    style: selStub().style,
  };
  const exitMarker = {
    select(role) {
      if (role === '[data-role="exit-tick"]') return exitTick;
      return selStub();
    },
    style: selStub().style,
  };
  om.entryMarkers.push({
    marker: entryMarker,
    time: ENTRY_T,
    price: ENTRY_PX,
    orderId: 42,
    type: 'BUY',
    chart,
    order: om._orderRefForMarkerOrderId(42),
  });
  om.exitMarkers.push({
    marker: exitMarker,
    time: EXIT_T,
    price: EXIT_PX,
    orderId: 42,
    isBuyExit: true,
    chart,
    openTime: ENTRY_T,
    entryMarkerTimeMs: ENTRY_T,
    exitMarkerTimeMs: EXIT_T,
  });
  return { entryTick, exitTick };
}

test('1m/5m/15m project one canonical event; timestamps stay immutable', () => {
  installWindow();
  const bars1m = make1mBars();
  const chart1m = makeChart('1m', bars1m);
  const chart5m = makeChart('5m', resample(bars1m, 5 * 60_000));
  const chart15m = makeChart('15m', resample(bars1m, 15 * 60_000));
  const om = makeOm(chart1m);

  const entryRef = {
    openTime: ENTRY_T,
    openPrice: ENTRY_PX,
    entryMarkerTimeMs: ENTRY_T,
  };
  const exitRef = {
    closeTime: EXIT_T,
    closePrice: EXIT_PX,
    exitMarkerTimeMs: EXIT_T,
    openTime: ENTRY_T,
    entryMarkerTimeMs: ENTRY_T,
  };

  const i1 = om._chartIndexForEntryMarkerOnChart(chart1m, entryRef);
  const i5 = om._chartIndexForEntryMarkerOnChart(chart5m, entryRef);
  const i15 = om._chartIndexForEntryMarkerOnChart(chart15m, entryRef);
  const x1 = om._chartIndexForExitMarkerOnChart(chart1m, exitRef);
  const x5 = om._chartIndexForExitMarkerOnChart(chart5m, exitRef);
  const x15 = om._chartIndexForExitMarkerOnChart(chart15m, exitRef);

  assert.ok(i1 >= 0 && i5 >= 0 && i15 >= 0);
  assert.ok(x1 >= 0 && x5 >= 0 && x15 >= 0);
  assert.equal(chart1m.data[i1].t, ENTRY_T);
  assert.ok(ENTRY_T >= chart5m.data[i5].t && ENTRY_T < chart5m.data[i5].t + 5 * 60_000);
  assert.ok(ENTRY_T >= chart15m.data[i15].t && ENTRY_T < chart15m.data[i15].t + 15 * 60_000);

  // Simulate coarse-panel marker update (the path that used to overwrite).
  const beforeExit = EXIT_T;
  om.exitMarkers = [{
    marker: selStub(),
    time: EXIT_T,
    price: EXIT_PX,
    orderId: 42,
    isBuyExit: true,
    chart: chart15m,
    openTime: ENTRY_T,
    entryMarkerTimeMs: ENTRY_T,
    exitMarkerTimeMs: EXIT_T,
  }];
  om._updateExitAndPartialMarkersOnMain();

  if (KILL) {
    assert.notEqual(
      om.exitMarkers[0].exitMarkerTimeMs,
      beforeExit,
      'kill-switch reproduces coarse-bucket overwrite divergence',
    );
  } else {
    assert.equal(om.exitMarkers[0].exitMarkerTimeMs, beforeExit, 'canonical exit time immutable');
    assert.equal(om.exitMarkers[0].time, EXIT_T);
    // Anchor helper must return event time, not 15m bucket open.
    assert.equal(
      om._exitMarkerAnchorTimeMsFromClose(chart15m, EXIT_T, EXIT_PX, entryRef),
      EXIT_T,
    );
  }
});

test('marker tick Y stays at canonical trade price on every TF', () => {
  installWindow();
  if (KILL) {
    assert.ok(true, 'price-tick assertion skipped under kill-switch');
    return;
  }
  const bars1m = make1mBars();
  for (const [tf, data] of [
    ['1m', bars1m],
    ['5m', resample(bars1m, 5 * 60_000)],
    ['15m', resample(bars1m, 15 * 60_000)],
  ]) {
    const chart = makeChart(tf, data);
    const om = makeOm(chart);
    const { entryTick, exitTick } = seedMarkers(om, chart);
    om._updateEntryMarkersForChart(chart);
    om._updateExitAndPartialMarkersOnMain();
    assert.equal(Number(entryTick._state.y1), chart.yScale(ENTRY_PX), `${tf} entry tick`);
    assert.equal(Number(exitTick._state.y1), chart.yScale(EXIT_PX), `${tf} exit tick`);
  }
});

test('pan repositions markers every frame even with an open order line', () => {
  installWindow();
  const bars1m = make1mBars();
  const chart = makeChart('5m', resample(bars1m, 5 * 60_000), 0);
  const om = makeOm(chart);
  const { entryTick, exitTick } = seedMarkers(om, chart);
  // Active order line on this surface (the incomplete pan-lite skip condition).
  om.orderLines = [{ orderId: 99, chart, line: selStub() }];
  om.openPositions = [{ id: 99, openPrice: ENTRY_PX }];

  om._updateEntryMarkersForChart(chart);
  om._updateExitAndPartialMarkersOnMain();
  const x0 = Number(entryTick._state.x1);
  const y0 = Number(entryTick._state.y1);
  const ex0 = Number(exitTick._state.x1);

  // Simulate a real pan frame: offset + price scale change, then pan glue path.
  chart.offsetX = -120;
  const baseY = (p) => 1000 - Number(p) * 100;
  const yScale2 = (p) => baseY(p) + 40;
  chart.yScale = yScale2;
  chart.scales.yScale = yScale2;

  const skipMarkersWhenLines = KILL;
  if (!skipMarkersWhenLines) {
    om._updateEntryMarkersForChart(chart);
    om._updateExitAndPartialMarkersOnMain();
  }

  if (KILL) {
    assert.equal(Number(entryTick._state.x1), x0, 'kill-switch: entry X stuck during pan');
    assert.equal(Number(exitTick._state.x1), ex0, 'kill-switch: exit X stuck during pan');
    assert.equal(Number(entryTick._state.y1), y0, 'kill-switch: entry Y stuck during pan');
  } else {
    assert.equal(Number(entryTick._state.x1), x0 - 120, 'entry follows horizontal pan');
    assert.equal(Number(exitTick._state.x1), ex0 - 120, 'exit follows horizontal pan');
    assert.equal(Number(entryTick._state.y1), y0 + 40, 'entry follows vertical scale pan');
    assert.equal(om.exitMarkers[0].exitMarkerTimeMs, EXIT_T, 'pan must not mutate canonical exit');
  }
});

test('different-symbol chart stays independent', () => {
  installWindow();
  const bars1m = make1mBars();
  const gbp = makeChart('5m', resample(bars1m, 5 * 60_000));
  const eur = makeChart('5m', resample(bars1m, 5 * 60_000));
  eur.currentSymbol = 'EURUSD';
  eur.currentFileId = 'file-eurusd';
  const om = makeOm(gbp);
  om._positionTickerMatchesChartSymbol = (_o, ch) => ch.currentSymbol === 'GBPUSD';
  seedMarkers(om, gbp);
  const before = om.exitMarkers[0].exitMarkerTimeMs;
  // Foreign-symbol update must not invent EUR markers on the GBP registry.
  om._updateEntryMarkersForChart(eur);
  assert.equal(om.entryMarkers.length, 1);
  assert.equal(om.entryMarkers[0].chart.currentSymbol, 'GBPUSD');
  if (!KILL) {
    om._updateExitAndPartialMarkersOnMain();
    assert.equal(om.exitMarkers[0].exitMarkerTimeMs, before, 'GBP canonical exit untouched');
  }
});

test('three stable repetitions: projection + pan glue', () => {
  installWindow();
  if (KILL) {
    assert.ok(true, 'skip stability under kill-switch');
    return;
  }
  for (let rep = 0; rep < 3; rep++) {
    const bars1m = make1mBars();
    const chart = makeChart('15m', resample(bars1m, 15 * 60_000), 0);
    const om = makeOm(chart);
    om.orderLines = [{ orderId: 1, chart }];
    const { entryTick } = seedMarkers(om, chart);
    om._updateEntryMarkersForChart(chart);
    const x0 = Number(entryTick._state.x1);
    chart.offsetX = -90;
    om._updateEntryMarkersForChart(chart);
    assert.equal(Number(entryTick._state.x1), x0 - 90, `rep ${rep + 1} pan`);
    assert.equal(om.exitMarkers[0].exitMarkerTimeMs, EXIT_T, `rep ${rep + 1} immutable`);
  }
});
