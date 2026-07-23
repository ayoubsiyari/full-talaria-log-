/**
 * Live tick→candle mode switch must not freeze the current-price label on the
 * last tick mark while candle playback continues.
 *
 *   node --test "chart v 1.4/chart/modules/replay-mode-switch-price.test.mjs"
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

test('candle mode ignores leftover tick animatingCandle for price mark', () => {
    const rs = Object.create(ReplaySystem.prototype);
    rs.playbackMode = 'candle';
    rs.getPlaybackMode = () => 'candle';
    rs._shouldUseTickAnimation = () => false;
    rs.isPlaying = true;
    rs.tickProgress = 40;
    rs.animatingCandle = { open: 1840, close: 1849.75, high: 1850, low: 1839 };
    rs.fullRawData = [
        { t: 1, o: 1840, h: 1850, l: 1839, c: 1845 },
        { t: 2, o: 1845, h: 1860, l: 1844, c: 1855 },
    ];
    rs.currentIndex = 1;
    rs.chart = { data: [{ t: 2, o: 1845, h: 1860, l: 1844, c: 1855 }] };

    assert.equal(rs.getCurrentAnimatedPrice(), 1855,
        'candle mode must follow the painted/playhead close, not the old tick close');
});

test('setPlaybackMode tick→candle clears tick state and restarts candle loop', () => {
    const rs = Object.create(ReplaySystem.prototype);
    rs.playbackMode = 'tick';
    rs.getPlaybackMode = function () { return this.playbackMode === 'candle' ? 'candle' : 'tick'; };
    rs.isActive = true;
    rs.isPlaying = true;
    rs.autoScrollEnabled = true;
    rs.animatingCandle = { close: 1849.75, open: 1840 };
    rs.tickProgress = 33;
    rs.tickElapsedMs = 500;
    rs._savedTickState = { animatingCandle: rs.animatingCandle, tickProgress: 33 };
    rs._nextCandleTimer = setTimeout(() => {}, 60_000);
    rs.tickInterval = null;
    rs._activeTickLoop = 1;
    rs._activeCandleLoop = 1;
    rs.chart = { _mcCanonicalReplayMark: 1849.75, data: [] };
    rs.fullRawData = [{ t: 1, c: 1845 }];
    rs.currentIndex = 0;
    rs.syncPlaybackModeControls = () => {};
    rs._shouldUseTickAnimation = function () { return this.getPlaybackMode() === 'tick'; };
    let candleStarts = 0;
    rs.startCandleByCandle = () => { candleStarts += 1; };
    rs.startTickAnimation = () => { throw new Error('must not restart tick after candle switch'); };
    rs.updateChartData = () => {};
    rs.stopAllPlayback = ReplaySystem.prototype.stopAllPlayback.bind(rs);
    rs.stopTickAnimation = ReplaySystem.prototype.stopTickAnimation.bind(rs);
    rs._restartPlaybackAfterControlChange = ReplaySystem.prototype._restartPlaybackAfterControlChange.bind(rs);
    rs._clearTickPlaybackStateForModeSwitch = ReplaySystem.prototype._clearTickPlaybackStateForModeSwitch.bind(rs);
    rs.setPlaybackMode = ReplaySystem.prototype.setPlaybackMode.bind(rs);

    rs.setPlaybackMode('candle', { restartPlayback: true });

    assert.equal(rs.getPlaybackMode(), 'candle');
    assert.equal(rs.animatingCandle, null);
    assert.equal(rs._savedTickState, null);
    assert.equal(rs.tickProgress, 0);
    assert.equal(rs._nextCandleTimer, null);
    assert.equal(rs.chart._mcCanonicalReplayMark, null);
    assert.equal(candleStarts, 1, 'candle loop must re-arm while still playing');
    assert.equal(rs.isPlaying, true);
});
