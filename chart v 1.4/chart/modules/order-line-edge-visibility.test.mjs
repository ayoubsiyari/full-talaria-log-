import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const disableFix = process.env.TALARIA_TEST_DISABLE_ORDER_LINE_EDGE_VISIBILITY === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1: disableFix,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

const chart = {
    h: 400,
    margin: { t: 20, b: 30 },
    separateIndicatorPanelHeight: 100,
    _getMainPricePlotLayout() {
        return { plotBottom: 270 };
    },
    _isYInMainPricePlot(y) {
        return y >= 20 && y <= 270;
    },
};

assert.equal(typeof om._orderLineEdgeVisibleY, 'function', 'edge visibility helper must exist');
assert.deepEqual(om._orderMainPlotYBounds(chart), { top: 20, bottom: 270 });

assert.equal(
    om._orderLineEdgeVisibleY(chart, 282, 'SL'),
    270,
    'pending SL just below the plot is clamped visible at the plot edge'
);
assert.equal(
    om._orderLineEdgeVisibleY(chart, 8, 'TP'),
    20,
    'pending TP just above the plot is clamped visible at the plot edge'
);
assert.equal(
    om._orderLineEdgeVisibleY(chart, 330, 'SL'),
    null,
    'far outside SL remains hidden'
);
assert.equal(
    om._orderLineEdgeVisibleY(chart, 282, 'ENTRY'),
    null,
    'entry rows are not edge-clamped by the SL/TP guard'
);

console.log(disableFix
    ? 'RED — switch OFF hides just-outside pending SL/TP edge rows'
    : 'GREEN — pending SL/TP edge rows clamp visible without exposing far-out rows');
