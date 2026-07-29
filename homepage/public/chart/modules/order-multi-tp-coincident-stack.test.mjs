/**
 * Cluster G / TAL-01699: coincident multi-TP preview rungs get separate hit rows.
 * GREEN: node order-multi-tp-coincident-stack.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK=1 node order-multi-tp-coincident-stack.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK === '1';

global.window = {
  __TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1: disabled,
};
global.document = {
  getElementById(id) {
    if (id === 'orderPanel') return { classList: { contains: () => true } };
    return null;
  },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.getPricePrecision = () => 2;
om.tpTargets = [
  { id: 1, price: 110, percentage: 50 },
  { id: 2, price: 110, percentage: 50 },
  { id: 3, price: 112, percentage: 0 },
];

assert.equal(om._multiTpCoincidentStackYOffsetPx(0), 0, 'front coincident TP keeps the true price row');
assert.equal(om._multiTpCoincidentStackYOffsetPx(1), 14, 'second coincident TP is offset into a separate hit row');
assert.equal(om._multiTpCoincidentStackYOffsetPx(2), 0, 'non-coincident TP is not offset');

om.tpTargets = [
  { id: 1, price: 110.004, percentage: 50 },
  { id: 2, price: 110.0049, percentage: 50 },
];
assert.equal(om._multiTpCoincidentStackYOffsetPx(1), 14, 'price precision groups visually coincident rounded prices');

function recorder(initial = {}) {
  const attrs = { ...initial };
  return {
    attrs,
    attr(name, value) {
      if (arguments.length === 1) return attrs[name];
      attrs[name] = value;
      return this;
    },
    select() {
      return recorder({ height: 24 });
    },
    node() {
      return { parentNode: true };
    },
  };
}

const line = recorder();
const hitLine = recorder();
const labelGroup = recorder({ transform: 'translate(20, 0)' });
const axis = recorder();
const geometryOm = Object.create(OrderManager.prototype);
geometryOm._previewChartFromContext = () => ({
  w: 200,
  margin: { r: 70 },
  yScale: (price) => price * 2,
  scales: { yScale: (price) => price * 2 },
});
geometryOm._ensurePreviewChartScales = () => true;
geometryOm._oiSyncPreviewLinePricesFromStore = () => {};
geometryOm.previewLines = {
  multipleTPs: [{
    price: 110,
    label: 'TP2',
    color: '#22c55e',
    _stackOffsetY: 14,
    line,
    hitLine,
    labelGroup,
    labelDimensions: { height: 10 },
    yAxisHighlight: axis,
  }],
};
geometryOm.updatePreviewLinePositions();
assert.equal(line.attrs.y1, 234, 'pan/zoom refresh preserves stack offset on visible TP line');
assert.equal(hitLine.attrs.y1, 234, 'pan/zoom refresh preserves stack offset on TP hit line');
assert.equal(labelGroup.attrs.transform, 'translate(20, 229)', 'pan/zoom refresh preserves stack offset on TP label');

console.log(disabled
  ? 'RED — switch OFF leaves coincident multi-TP rungs on the same hit row'
  : 'GREEN — coincident multi-TP rungs are separated for hit-testing');
process.exit(0);
