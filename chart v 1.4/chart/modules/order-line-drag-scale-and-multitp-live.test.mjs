/**
 * TAL-01696 / TAL-01698 pre-seal oracle.
 *
 * Drag geometry must convert browser client pixels into SVG/chart user units before
 * pricing. A 5:1 rendered-SVG scale should therefore move the order line 5 chart
 * units for 1 CSS px, not lag at one fifth distance.
 *
 * Multi-TP average must consume the provisional dragged TP price during drag, before
 * the TP target store is committed on mouseup.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = [
  path.resolve(HERE, '..', '..', '..'),
  path.resolve(HERE, '..', '..', '..', '..'),
].find((candidate) => fs.existsSync(path.join(candidate, 'chart v 1.4', 'chart', 'modules', 'order-manager.js')));
const ORDER_MANAGER = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const ORDER_MANAGER_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js');
const SOURCE = fs.readFileSync(ORDER_MANAGER, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(ORDER_MANAGER_MIRROR, 'utf8');

function fakeScaledSvg() {
  return {
    createSVGPoint() {
      return {
        x: 0,
        y: 0,
        matrixTransform(matrix) {
          return matrix.transform(this);
        },
      };
    },
    getScreenCTM() {
      return {
        inverse() {
          return {
            transform(pt) {
              return { x: pt.x, y: (pt.y - 10) / 0.2 };
            },
          };
        },
      };
    },
    getBoundingClientRect() {
      return { top: 10, height: 100 };
    },
    viewBox: { baseVal: { height: 500 } },
    getAttribute(name) {
      return name === 'height' ? '500' : null;
    },
  };
}

function makeSelection() {
  const attrs = new Map();
  let textValue = '';
  return {
    attrs,
    attr(name, value) {
      if (arguments.length === 1) return attrs.get(name);
      attrs.set(name, value);
      return this;
    },
    text(value) {
      if (arguments.length === 0) return textValue;
      textValue = String(value);
      return this;
    },
    style() {
      return this;
    },
    node() {
      return {
        getBBox() {
          return { width: textValue.length * 6 || 40, height: 18 };
        },
      };
    },
  };
}

test('TAL-01696 drag pointer conversion is CTM-scaled, not raw client pixels', () => {
  const manager = Object.create(OrderManager.prototype);
  const svgNode = fakeScaledSvg();
  const chart = { svg: { node: () => svgNode } };

  const y0 = manager._svgPointerY(chart, { clientX: 0, clientY: 10 }, NaN);
  const y1 = manager._svgPointerY(chart, { clientX: 0, clientY: 15 }, NaN);

  assert.equal(y0, 0);
  assert.equal(y1, 25);
  assert.equal(y1 - y0, 25, '5 CSS px must become 25 chart units at 5:1 scale');
  console.log('GREEN — TAL-01696 pointer conversion: RESOLVER_CALLED_AND_RIGHT');
});

test('TAL-01696 active and pending entry drag paths bind to SVG pointer conversion', () => {
  const required = [
    ['canonical open SL/TP drag', SOURCE, /makeLineDraggable\([^]*?_svgPointerY\(ctx, e, e\.clientY\)/],
    ['canonical placed pending entry drag', SOURCE, /drawPendingOrderLine\([^]*?_svgPointerY\(chart, event, event\.y\)/],
    ['homepage open SL/TP drag', MIRROR_SOURCE, /makeLineDraggable\([^]*?_svgPointerY\(ctx, e, e\.clientY\)/],
    ['homepage placed pending entry drag', MIRROR_SOURCE, /drawPendingOrderLine\([^]*?_svgPointerY\(chart, event, event\.y\)/],
  ];
  for (const [label, src, re] of required) {
    assert.match(src, re, `${label}: RESOLVER_PRESENT_BUT_UNCALLED`);
  }
  console.log('GREEN — TAL-01696 drag handlers bind SVG pointer conversion: RESOLVER_CALLED_AND_RIGHT');
});

test('TAL-01698 multi-TP average line updates from live dragged TP override', () => {
  const manager = Object.create(OrderManager.prototype);
  global.document = {
    getElementById(id) {
      if (id === 'orderQuantity') return { value: '1' };
      if (id === 'orderEntryPrice') return { value: '100' };
      return null;
    },
  };

  const line = makeSelection();
  const lotsText = makeSelection();
  const lotsBox = makeSelection();
  const pnlBox = makeSelection();
  const pnlText = makeSelection();
  const chart = {
    w: 800,
    margin: { r: 70 },
    scales: { yScale: (price) => price },
    svg: {
      selectAll() {
        return { nodes: () => [] };
      },
    },
  };

  manager.multiTPAvgLines = [{
    chart,
    mode: 'preview',
    orderId: 'preview',
    avgTP: 0,
    line,
    lotsText,
    lotsBox,
    pnlBox,
    pnlText,
  }];
  manager.tpTargets = [
    { price: 110, percentage: 50 },
    { price: 120, percentage: 50 },
  ];
  manager._previewLiveMultiTPAvgOverride = { targetIndex: 1, price: 130 };
  manager.getCurrentCandle = () => ({ c: 100 });
  manager._getSymbol = () => 'EURUSD';
  manager._computeEffectiveTPPercentages = () => [50, 50];
  manager.estimatePnLForPriceLevel = () => 0;
  manager._getOrderOverlayRightEdge = () => 730;

  manager._updateMultiTPAvgLines(chart);

  assert.equal(manager.multiTPAvgLines[0].avgTP, 120);
  assert.equal(line.attrs.get('y1'), 120);
  assert.equal(line.attrs.get('y2'), 120);
  console.log('GREEN — TAL-01698 multi-TP average live drag: RESOLVER_CALLED_AND_RIGHT');

  delete global.document;
});
