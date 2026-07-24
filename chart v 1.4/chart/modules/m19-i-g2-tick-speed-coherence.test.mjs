/**
 * M19-I-g2: UI speed must match tick playback, and 60x/100x must retain
 * forming-candle paints instead of silently switching to commit-only fast mode.
 *
 *   node --test "chart v 1.4/chart/modules/m19-i-g2-tick-speed-coherence.test.mjs"
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

function resetSwitch() {
    delete global.window.__TALARIA_DISABLE_M19I_TICK_SPEED_COHERENCE_V1;
}

function makeSpeedProbe(speed, mode = 'tick') {
    const rs = Object.create(ReplaySystem.prototype);
    rs.speed = speed;
    rs.playbackMode = mode;
    rs.getPlaybackMode = () => mode;
    return rs;
}

function makeAnimationProbe(speed) {
    const rs = makeSpeedProbe(speed);
    const start = 1_000_000;
    rs.isActive = true;
    rs.isPlaying = true;
    rs._shouldUseTickAnimation = () => true;
    rs._activeTickLoop = 0;
    rs.tickInterval = null;
    rs._nextCandleTimer = null;
    rs.fullRawData = [
        { t: start, o: 100, h: 101, l: 99, c: 100.5, v: 10 },
        { t: start + 60_000, o: 100.5, h: 103, l: 100, c: 102, v: 20 },
        { t: start + 120_000, o: 102, h: 104, l: 101, c: 103, v: 30 },
    ];
    rs.currentIndex = 0;
    rs.chart = {
        currentTimeframe: '1m',
        _serverCursors: { hasMoreRight: false },
        checkViewportLoadMore: () => {},
    };
    rs.getForwardPrefetchThreshold = () => 10;
    rs._finestTfCadenceSubdivisions = () => 1;
    rs.getTickPath = () => Array.from({ length: 72 }, (_, i) => 100.5 + i / 72);
    rs.ticksPerCandle = 72;
    rs._preserveTickProgress = false;
    rs.animatingCandle = null;
    rs.tickProgress = 0;
    rs.tickElapsedMs = 0;
    rs.useConstantTickInterval = true;
    rs.scheduleNextTick = () => {};
    return rs;
}

test('tick speed is label-coherent through 100x; kill switch restores legacy 2x', () => {
    resetSwitch();
    for (const speed of [15, 60, 100]) {
        assert.equal(makeSpeedProbe(speed).getEffectivePlaybackSpeed(), speed);
    }
    assert.equal(makeSpeedProbe(100, 'candle').getEffectivePlaybackSpeed(), 100);

    global.window.__TALARIA_DISABLE_M19I_TICK_SPEED_COHERENCE_V1 = true;
    assert.equal(makeSpeedProbe(15).getEffectivePlaybackSpeed(), 30);
    assert.equal(makeSpeedProbe(60).getEffectivePlaybackSpeed(), 120);
    assert.equal(makeSpeedProbe(100).getEffectivePlaybackSpeed(), 200);
    resetSwitch();
});

test('100x remains forming-candle smooth with a frame-budgeted tick count', () => {
    resetSwitch();
    const rs = makeAnimationProbe(100);
    rs.startTickAnimation();

    assert.equal(rs.fastMode, false, '100x must not silently become commit-only fast mode');
    assert.ok(rs.animatingCandle, '100x must expose a forming candle');
    assert.ok(rs.currentTicksPerCandle >= 2 && rs.currentTicksPerCandle < rs.ticksPerCandle,
        `tick count must fit a 600ms candle (${rs.currentTicksPerCandle})`);
    assert.ok(rs.currentTicksPerCandle <= 6,
        `loaded-chart tick count must preserve 100x wall clock (${rs.currentTicksPerCandle})`);
    assert.ok(rs.volumeTickData.baseInterval >= 100,
        `scheduled ticks must include presentation work budget (${rs.volumeTickData.baseInterval})`);

    global.window.__TALARIA_DISABLE_M19I_TICK_SPEED_COHERENCE_V1 = true;
    const legacy = makeAnimationProbe(100);
    legacy.startTickAnimation();
    assert.equal(legacy.fastMode, true, 'switch OFF must restore legacy commit-only fast mode');
    assert.equal(legacy.animatingCandle, null);
    resetSwitch();
});
