import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

class FakeSelection {
  constructor(tag) {
    this.tag = tag;
    this.attrs = new Map();
    this.styles = new Map();
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
  node() {
    return { getBBox: () => ({ width: 40, height: 10 }) };
  }
  remove() {
    return this;
  }
}

function makeChart() {
  return {
    w: 500,
    scales: { yScale: () => 100 },
    svg: { append: (tag) => new FakeSelection(tag) },
  };
}

function makeOrderManager() {
  const chart = makeChart();
  const om = Object.create(OrderManager.prototype);
  om._previewTargetChart = chart;
  om._ensurePreviewChartScales = () => true;
  om._getPreviewChart = () => chart;
  om.renderPreviewLabel = (lineData, y) => {
    lineData._renderedLabelY = y;
    lineData.labelGroup.attr('transform', `translate(420, ${y - 5})`);
  };
  om.adjustPreviewLineForLabel = () => {};
  om.drawYAxisPriceHighlight = () => ({ style: () => {} });
  om.makePreviewLineDraggable = () => {};
  om._syncPendingLimitStopConnector = () => {};
  om._getOrderLevelLabelRightMargin = () => 18;
  om.getPricePrecision = () => 2;
  return { om, chart };
}

{
  const { om } = makeOrderManager();
  const targets = [{ price: 110.004 }, { price: 110.0049 }, { price: 110.02 }];
  assert.equal(om._multiTpCoincidentHitOffsetPx(targets, 0), 0, 'first coincident rung is not offset');
  assert.equal(om._multiTpCoincidentHitOffsetPx(targets, 1), 6, 'second rounded-coincident rung gets hit offset');
  assert.equal(om._multiTpCoincidentHitOffsetPx(targets, 2), 0, 'different visible price is not offset');

  global.window = { __TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1: true };
  assert.equal(om._multiTpCoincidentHitOffsetPx(targets, 1), 0, 'kill-switch restores legacy no-offset hit region');
  delete global.window;
}

{
  const { om, chart } = makeOrderManager();
  const lineData = om.drawPreviewLine(110.0049, '#089981', 'TP2', null, true, 1, 2, {
    _hitStackOffsetY: 6,
  });

  assert.equal(lineData.line.attr('y1'), 100, 'visible TP line stays on true price row');
  assert.equal(lineData.line.attr('y2'), 100, 'visible TP line end stays on true price row');
  assert.equal(lineData.hitLine.attr('y1'), 106, 'invisible hit region is offset');
  assert.equal(lineData.hitLine.attr('y2'), 106, 'invisible hit region end is offset');
  assert.equal(lineData._renderedLabelY, 100, 'visible label stays on true price row');
  assert.equal(lineData._hitStackOffsetY, 6, 'hit offset survives in line data');
  assert.equal(
    om._previewDragHitOffsetY(lineData, { sourceEvent: { target: { classList: { contains: (name) => name === 'preview-line-hit' } } } }),
    6,
    'drag from invisible hit row subtracts hit offset before price math'
  );
  assert.equal(
    om._previewDragHitOffsetY(lineData, { sourceEvent: { target: { classList: { contains: () => false } } } }),
    0,
    'drag from visible label row uses raw visible y'
  );

  om.previewLines = { _previewChart: chart, multipleTPs: [lineData] };
  om.alignPreviewLabels();

  assert.equal(lineData.line.attr('y1'), 100, 'refresh keeps visible TP line on true price row');
  assert.equal(lineData.hitLine.attr('y1'), 106, 'refresh keeps hit region offset');
}

console.log('GREEN - multi-TP coincident stack offsets hit region only');
