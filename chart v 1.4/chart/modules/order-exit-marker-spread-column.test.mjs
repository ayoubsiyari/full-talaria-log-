/**
 * Cluster G / TAL-01810: spread-side exits anchor to the hit candle, not entry.
 * GREEN: node order-exit-marker-spread-column.test.mjs
 * RED:   TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1=1 node order-exit-marker-spread-column.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const T0 = 1_700_000_000_000;
const bars = [
    { t: T0, l: 1.1010, h: 1.1020 },
    { t: T0 + 60_000, l: 1.1000, h: 1.1010 },
    // Mid OHLC does not contain the spread-adjusted SL close price.
    { t: T0 + 120_000, l: 1.0995, h: 1.1005 },
];

const chart = {
    data: bars,
    replaySystem: { isActive: true },
};

const om = Object.create(OrderManager.prototype);
om.chart = chart;
om._playbackReplaySystem = () => chart.replaySystem;
om._isMarkerTimeVisibleInReplay = () => true;
om._getCurrentCandleForChart = () => bars[2];
om._chartPlayheadBucketIndex = () => 2;

const idx = om._chartIndexForExitMarkerOnChart(chart, {
    closeTime: T0 + 120_000,
    exitMarkerTimeMs: T0 + 120_000,
    closePrice: 1.0994,
    openTime: T0,
    entryMarkerTimeMs: T0,
});

assert.equal(idx, 2, 'spread-side exit marker stays on the hit candle column');

console.log(process.env.TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1 === '1'
    ? 'RED — legacy price refinement drifts spread-side exits back toward entry'
    : 'GREEN — canonical projection anchors spread-side exits to hit time');
