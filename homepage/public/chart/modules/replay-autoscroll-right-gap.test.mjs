/**
 * Replay follow must keep the playhead near the right edge even when the plot
 * is narrow (Place Order rail open) or zoom is tight — never reserve a fixed
 * 15-candle right gap that collapses targetVisibleCandles to 1.
 *
 *   node --test "chart v 1.4/chart/modules/replay-autoscroll-right-gap.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
global.window = global.window || {};
global.document = {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => null,
};
const ReplaySystem = require('./replay-system.js');

function makeChart({ w, candleSpacing, dataLen, rightOffsetCandles = 15 }) {
    const data = Array.from({ length: dataLen }, (_, i) => ({
        t: 1_000_000 + i * 60_000,
        o: 1, h: 1, l: 1, c: 1,
    }));
    return {
        w,
        margin: { l: 0, r: 60, t: 0, b: 30 },
        data,
        candleWidth: candleSpacing,
        candleGap: 0,
        getCandleSpacing: () => candleSpacing,
        timeScale: { rightOffsetCandles },
    };
}

function playheadPixelX(chart, offsetX) {
    const spacing = chart.getCandleSpacing();
    const lastIdx = chart.data.length - 1;
    return chart.margin.l + lastIdx * spacing + offsetX;
}

test('narrow plot (order rail) keeps playhead near right, not left-pinned', () => {
    const rs = Object.create(ReplaySystem.prototype);
    rs.replayRightPaddingRatio = 0.2;
    // ~Place Order open: ~500px plot after margins, 8px candles → ~55 visible.
    // Still below the uncapped 15-gap failure band when zoomed tighter:
    const chart = makeChart({ w: 280, candleSpacing: 20, dataLen: 400, rightOffsetCandles: 15 });
    // chartAreaW = 280 - 60 = 220 → numVisible = floor(220/20) = 11 ≤ 15
    const st = rs.getReplayAutoScrollState(chart);
    assert.ok(st && Number.isFinite(st.offsetX), 'must return auto-scroll state');
    assert.ok(st.rightGapCandles < st.numVisibleCandles,
        `right gap (${st.rightGapCandles}) must stay below visible (${st.numVisibleCandles})`);
    assert.ok(st.rightGapCandles <= Math.floor(st.numVisibleCandles * 0.35),
        'right gap must be capped to ~35% of the window');

    const plotRight = chart.w - chart.margin.r;
    const x = playheadPixelX(chart, st.offsetX);
    // Playhead should sit in the right half of the plot, not at the left edge.
    assert.ok(x > (chart.margin.l + plotRight) / 2,
        `playhead x=${x.toFixed(1)} must be right-anchored (plotRight=${plotRight})`);
    assert.ok(x <= plotRight + chart.getCandleSpacing(),
        `playhead x=${x.toFixed(1)} must not sit past the right edge`);
});

test('wide plot keeps the larger of configured/ratio gap (uncapped by 35%)', () => {
    const rs = Object.create(ReplaySystem.prototype);
    rs.replayRightPaddingRatio = 0.2;
    const chart = makeChart({ w: 1200, candleSpacing: 8, dataLen: 2000, rightOffsetCandles: 15 });
    // chartAreaW = 1140 → numVisible = 142; ratio gap = 28; 35% cap = 49 → gap stays 28
    const st = rs.getReplayAutoScrollState(chart);
    assert.equal(st.rightGapCandles, 28);
    const plotRight = chart.w - chart.margin.r;
    const x = playheadPixelX(chart, st.offsetX);
    // Playhead remains in the right portion of the plot.
    assert.ok(x > plotRight * 0.6,
        `wide-plot playhead should stay right-anchored (x=${x}, plotRight=${plotRight})`);
});
