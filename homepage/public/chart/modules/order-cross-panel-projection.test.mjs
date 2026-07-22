/**
 * TAL-01798 — one host-owned order state across mixed-timeframe panels.
 * GREEN: node --test order-cross-panel-projection.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

global.window = {};
const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function projectedManager({ primed = true } = {}) {
    const om = Object.create(OrderManager.prototype);
    if (primed) om._hostSnapshotVersion = 3;
    om._multichartIsEmbedIframe = () => true;
    return om;
}

test('projected iframe cannot execute or re-mark from its display candle', () => {
    const om = projectedManager();
    om._shouldDeferOrderExecutionForTimeframeTransition = () => {
        throw new Error('projected iframe reached local lifecycle');
    };

    assert.equal(om._usesHostProjectedOrderRuntime(), true);
    assert.doesNotThrow(() => om.updatePositions());
});

test('timeframe-rebuilt iframe stays read-only before snapshot re-prime', () => {
    const om = projectedManager({ primed: false });
    om._shouldDeferOrderExecutionForTimeframeTransition = () => {
        throw new Error('unprimed iframe reached local lifecycle');
    };
    om._getCurrentCandleForChart = () => {
        throw new Error('unprimed iframe read its 15m display candle');
    };

    assert.equal(om._usesHostProjectedOrderRuntime(), true);
    assert.doesNotThrow(() => om.updatePositions());
    assert.equal(
        om._markPriceForOpenPosition({ id: 17, openPrice: 1.29621 }, { currentTimeframe: '15m' }),
        1.29621,
        'host entry remains the zero-PnL fallback until the next host snapshot',
    );
});

test('projected order labels use the host mark on every timeframe', () => {
    const om = projectedManager();
    om._getCurrentCandleForChart = () => {
        throw new Error('coarse iframe candle was read');
    };

    const order = {
        id: 17,
        openPrice: 1.29621,
        _miLastMarkPrice: 1.29655,
    };
    assert.equal(om._markPriceForOpenPosition(order, { currentTimeframe: '15m' }), 1.29655);

    delete order._miLastMarkPrice;
    assert.equal(
        om._markPriceForOpenPosition(order, { currentTimeframe: '1D' }),
        order.openPrice,
        'placement price is the canonical zero-PnL fallback before the first host tick',
    );
});

test('host panel A and projected panel B render the same canonical mark', () => {
    const host = Object.create(OrderManager.prototype);
    host._multichartIsEmbedIframe = () => false;
    host._isMultiPanelLayout = () => true;
    host._getCurrentCandleForChart = () => {
        throw new Error('panel A display candle was read');
    };

    const order = {
        id: 17,
        openPrice: 1.29621,
        _miLastMarkPrice: 1.29655,
    };
    assert.equal(host._markPriceForOpenPosition(order, { currentTimeframe: '1m' }), 1.29655);
    assert.equal(
        projectedManager()._markPriceForOpenPosition(order, { currentTimeframe: '15m' }),
        1.29655,
    );
});

test('snapshot kill-switch reconstructs panel-local mark divergence', () => {
    const om = projectedManager();
    om._getCurrentCandleForChart = () => ({ t: 1, c: 1.30043 });
    om._resolveUnrealizedMarkPrice = (_position, candle) => candle.c;

    global.window.__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1 = true;
    try {
        assert.equal(om._usesHostProjectedOrderRuntime(), false);
        assert.equal(
            om._markPriceForOpenPosition(
                { id: 17, openPrice: 1.29621, _miLastMarkPrice: 1.29655 },
                { currentTimeframe: '15m' },
            ),
            1.30043,
            'legacy iframe reads its own resampled candle',
        );
    } finally {
        delete global.window.__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1;
    }
});

test('SL/TP cleanup can target panel B without deleting panel A', () => {
    const chartA = { id: 'A' };
    const chartB = { id: 'B' };
    const removed = [];
    const node = (name) => ({ remove: () => removed.push(name) });
    const om = Object.create(OrderManager.prototype);
    om.chart = chartA;
    om._refreshOrderConnectorsAfterVisualRemoval = () => {};
    om.slLines = [
        { orderId: 17, chart: chartA, line: node('sl-A') },
        { orderId: 17, chart: chartB, line: node('sl-B') },
        { orderId: 99, chart: chartB, line: node('sl-other') },
    ];
    om.tpLines = [
        { orderId: 17, chart: chartA, line: node('tp-A') },
        { orderId: 17, chart: chartB, line: node('tp-B') },
    ];
    om.beLines = [
        { orderId: 17, chart: chartA, line: node('be-A') },
        { orderId: 17, chart: chartB, line: node('be-B') },
    ];

    om.removeSLTPLines(17, chartB);
    assert.deepEqual(removed.sort(), ['be-B', 'sl-B', 'tp-B']);
    assert.equal(om.slLines.some((row) => row.orderId === 17 && row.chart === chartA), true);
    assert.equal(om.tpLines.some((row) => row.orderId === 17 && row.chart === chartA), true);
    assert.equal(om.beLines.some((row) => row.orderId === 17 && row.chart === chartA), true);
    assert.equal(om.slLines.some((row) => row.orderId === 99), true);

    om.removeSLTPLines(17);
    assert.equal(om.slLines.some((row) => row.orderId === 17), false);
    assert.equal(om.tpLines.some((row) => row.orderId === 17), false);
    assert.equal(om.beLines.some((row) => row.orderId === 17), false);
});
