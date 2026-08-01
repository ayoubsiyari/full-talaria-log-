import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

class FakeSelection {
  constructor(tag) {
    this.tag = tag;
    this.attrs = new Map();
    this.styles = new Map();
    this.textValue = '';
  }
  attr(name, value) {
    if (arguments.length === 1) return this.attrs.get(name);
    this.attrs.set(name, value);
    return this;
  }
  style(name, value) {
    if (arguments.length === 1) return this.styles.get(name);
    this.styles.set(name, value);
    return this;
  }
  text(value) {
    if (arguments.length === 0) return this.textValue;
    this.textValue = String(value);
    return this;
  }
  node() {
    return this;
  }
  getBBox() {
    return { width: Math.max(10, this.textValue.length * 6), height: 10 };
  }
  empty() {
    return false;
  }
}

class FakeSelectionList {
  constructor(nodes) {
    this._nodes = nodes;
  }
  each(fn) {
    this._nodes.forEach((node) => fn.call(node));
    return this;
  }
  nodes() {
    return this._nodes;
  }
  remove() {
    return this;
  }
}

function makeChart() {
  return {
    w: 240,
    h: 100,
    margin: { t: 0, b: 0 },
    separateIndicatorPanelHeight: 0,
    scales: { yScale: () => -2 },
    svg: { selectAll: () => ({ remove: () => {} }) },
  };
}

function makeOrderManager() {
  const chart = makeChart();
  const om = Object.create(OrderManager.prototype);
  const slLine = new FakeSelection('line');
  om.chart = chart;
  om.openPositions = [{ id: 1, type: 'BUY', openPrice: 100, stopLoss: 90, quantity: 1 }];
  om.slLines = [{
    orderId: 1,
    line: slLine,
    labelBox: new FakeSelection('rect'),
    labelAccent: new FakeSelection('rect'),
    labelText: new FakeSelection('text'),
    pnlBox: new FakeSelection('rect'),
    pnlText: new FakeSelection('text'),
    closeBtn: new FakeSelection('g'),
    priceBox: new FakeSelection('rect'),
    priceText: new FakeSelection('text'),
    chart,
  }];
  om.tpLines = [];
  om._isMultiPanelLayout = () => false;
  om._syncMainPlotSvgClip = () => null;
  om._oiResolveOpenSltpDragDisplayPrice = (_orderId, _kind, price) => price;
  om._slChartNetPnLAtStopForOpenOrder = () => -10;
  om._slChartLabelQtyForOpenOrder = () => 1;
  om._getOrderOverlayRightEdge = () => 220;
  om._positionLegacyOrderLevelToastAccent = () => {};
  om._styleOpenSlProfitProtectionVisuals = () => {};
  om._applyOrderLevelLineStyle = () => {};
  om._applyPlotClipToOrderOverlays = () => {};
  om.drawYAxisPriceHighlight = () => new FakeSelection('g');
  return { om, slLine };
}

{
  const { om, slLine } = makeOrderManager();
  om.updateSLTPLines(om.chart);
  assert.equal(slLine.attr('y1'), 0.5, 'edge SL line is clamped into visible price pane');
  assert.equal(slLine.style('display'), null, 'edge SL line remains visible');
}

{
  global.window = { __TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1: true };
  const { om, slLine } = makeOrderManager();
  om.updateSLTPLines(om.chart);
  assert.equal(slLine.attr('y1'), -2, 'kill-switch restores raw edge y');
  assert.equal(slLine.style('display'), 'none', 'kill-switch restores legacy hidden row');
  delete global.window;
}

{
  const chart = {
    w: 300,
    svg: null,
  };
  const anchorLabel = new FakeSelection('rect').attr('x', 120);
  const pendingGroup = new FakeSelection('g').attr('transform', 'translate(180, 40)');
  const pendingLine = new FakeSelection('line').attr('x2', 75);
  const pendingHitLine = new FakeSelection('line').attr('x2', 75);
  chart.svg = {
    selectAll: (selector) => {
      if (selector === '.order-label-box') return new FakeSelectionList([anchorLabel]);
      if (selector === '.pending-tp-label,.pending-sl-label,.pending-be-label') {
        return new FakeSelectionList([pendingGroup]);
      }
      return new FakeSelectionList([]);
    },
  };
  global.d3 = { select: (node) => node };
  const om = Object.create(OrderManager.prototype);
  om.pendingTargetLines = [{
    chart,
    targets: [{
      labelGroup: pendingGroup,
      line: pendingLine,
      hitLine: pendingHitLine,
      labelDimensions: { width: 44, height: 18 },
      _deleteBtn: new FakeSelection('g').attr('transform', 'translate(190, 40)'),
      _splitBtn: new FakeSelection('g').attr('transform', 'translate(210, 40)'),
    }],
  }];

  om._alignAllOrderLabels(chart);

  assert.equal(pendingGroup.attr('transform'), 'translate(120, 40)', 'pending SL/TP label group aligns to label column');
  assert.equal(pendingLine.attr('x2'), 300, 'pending SL/TP visible line remains full width after align');
  assert.equal(pendingHitLine.attr('x2'), 300, 'pending SL/TP hit line remains full width after align');
  delete global.d3;
}

console.log('GREEN - placed SL line remains visible at price-pane edge');
