/**
 * Cluster G / TAL-01807b: placed-order visuals must not leak after pair switch.
 * Complements TAL-01777 draft discard (order-pair-switch-draft-rebind.test.mjs).
 * GREEN: node order-pair-switch-visual-rebind.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

global.window = {};
global.document = { getElementById: () => null };

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const chart = { svg: {}, currentSymbol: 'GBPUSD', currentFileId: 'FILE_GBP', render() {} };

const om = Object.create(OrderManager.prototype);
om.chart = chart;
om.openPositions = [
    { id: 1, ticker: 'EURUSD', symbol: 'EURUSD', openPrice: 1.1 },
    { id: 2, ticker: 'GBPUSD', symbol: 'GBPUSD', openPrice: 1.25 },
];
om.pendingOrders = [
    { id: 3, ticker: 'EURUSD', status: 'PENDING' },
    { id: 4, ticker: 'GBPUSD', status: 'PENDING' },
];
om._isMultiPanelLayout = () => false;
om._getActiveTicker = () => 'GBPUSD';
om._normalizeTicker = (t) => String(t || '').toUpperCase();
om._positionTicker = OrderManager.prototype._positionTicker;
om._positionTickerMatchesChartSymbol = OrderManager.prototype._positionTickerMatchesChartSymbol;
om._isPositionForActiveChart = OrderManager.prototype._isPositionForActiveChart;

assert.equal(
    om._positionTickerMatchesChartSymbol(om.openPositions[0], chart),
    false,
    'EUR open leg does not belong on GBP chart',
);
assert.equal(
    om._positionTickerMatchesChartSymbol(om.openPositions[1], chart),
    true,
    'GBP open leg belongs on GBP chart',
);

let stripCalls = 0;
const drawn = { open: [], pending: [] };
om._stripOrderDrawingLayersFromChart = () => { stripCalls += 1; };
om._dropOrderVisualsNotOnMainChart = () => {};
om._clearClosedTradeMarkerRegistry = () => {};
om.drawOrderLine = (pos) => { drawn.open.push(pos.id); };
om.drawSLTPLines = () => {};
om.drawEntryMarker = () => {};
om.drawPendingOrderLine = (po) => { drawn.pending.push(po.id); };
om.drawPendingOrderTargets = () => {};
om._rebuildSplitGroupAvgLines = () => {};
om._rebuildMultiTPAvgLines = () => {};
om.updateSLTPLines = () => {};
om._redrawMfeMaeMarkersFromState = () => {};
om._redrawClosedJournalTradeMarkers = () => {};
om._cleanupDraftForActiveTickerChange = () => false;

om.syncOrderVisualsToActiveChart();

assert.equal(stripCalls, 1, 'pair switch strips stale drawing layers before redraw');
assert.deepEqual(drawn.open, [2], 'only active-symbol open positions redraw');
assert.deepEqual(drawn.pending, [4], 'only active-symbol pending orders redraw');

console.log('GREEN — pair switch redraw is scoped to the active chart symbol');
