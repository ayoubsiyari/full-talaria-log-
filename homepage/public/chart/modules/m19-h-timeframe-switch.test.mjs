/**
 * M19-H — replay timeframe switches must be atomic and bounded.
 *
 * Canonical:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-h-timeframe-switch.test.mjs"
 *
 * RED-again:
 *   TALARIA_DISABLE_M19_H_TF_COALESCE_V1=1 node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-h-timeframe-switch.test.mjs"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const KILL = String(process.env.TALARIA_DISABLE_M19_H_TF_COALESCE_V1 || '').trim() === '1';

function installBrowserGlobals() {
    const existingIndicatorPerf = global.window?.IndicatorPerf;
    global.window = {
        __TALARIA_DISABLE_M19_H_TF_COALESCE_V1: KILL,
        IndicatorPerf: existingIndicatorPerf,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        location: { href: 'http://local.test/chart?sessionId=m19-h' },
    };
    global.CustomEvent = class CustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    };
    global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    global.cancelAnimationFrame = (handle) => clearTimeout(handle);
}

installBrowserGlobals();
const DrawingToolsManager = require('./drawing-tools-manager.js');
const ReplaySystem = require('./replay-system.js');
require('./indicator-performance.js');

test('one replay generation performs one drawing resync and one SVG rebuild', () => {
    installBrowserGlobals();
    const dm = Object.create(DrawingToolsManager.prototype);
    const refreshOptions = [];
    let redraws = 0;
    let deferredRefreshes = 0;
    Object.assign(dm, {
        chart: {
            data: [{ t: 1 }],
            xScale: {},
            yScale: {},
            _clearPanDrawingsLayerTransform() {},
        },
        drawings: [{ id: 'm19-h-line' }],
        _replayFullDisplayCache: { key: 'stale-timeframe', data: [{ t: 1 }] },
        refreshDrawingsForTimeframe(options) {
            refreshOptions.push(options || {});
        },
        redrawAll() {
            redraws += 1;
        },
        scheduleRefreshAfterTimeframe() {
            deferredRefreshes += 1;
        },
    });

    dm.resyncDrawingsAfterReplayTimeframeChange({ changeSeq: 7 });
    dm.resyncDrawingsAfterReplayTimeframeChange({ changeSeq: 7 });

    assert.equal(refreshOptions.length, 1, 'same replay generation must coalesce timestamp sync');
    assert.equal(refreshOptions[0].syncOnly, true, 'TF resync must not render every drawing twice');
    assert.equal(redraws, 1, 'same replay generation must rebuild the SVG once');
    assert.equal(deferredRefreshes, 0, 'ready data/scales must not arm a duplicate delayed refresh');
    assert.equal(dm._replayFullDisplayCache, null, 'old timeframe full-series cache must be released');

    dm.resyncDrawingsAfterReplayTimeframeChange({ changeSeq: 8 });
    assert.equal(redraws, 2, 'a newer replay generation must still redraw');
});

test('rapid switch during deferred play startup preserves playback intent and timestamp', async () => {
    installBrowserGlobals();
    const t0 = 1_700_000_000_000;
    const bars = Array.from({ length: 4 }, (_, i) => ({
        t: t0 + i * 60_000,
        o: 1 + i * 0.001,
        h: 1.01 + i * 0.001,
        l: 0.99 + i * 0.001,
        c: 1.005 + i * 0.001,
        v: 1,
    }));
    const savedTimestamp = bars[1].t + 15_000;
    let readyCalls = 0;
    let playCalls = 0;
    const drawingSeqs = [];
    const guardTimestamps = [];

    const orderManager = {
        _refreshAllGuardsToTimestamp(ts) {
            guardTimestamps.push(ts);
        },
    };
    const chart = {
        currentTimeframe: '5m',
        currentSymbol: 'EURUSD',
        rawData: bars.slice(0, 2),
        data: bars.slice(0, 2),
        priceOffset: 0,
        priceZoom: 1,
        orderManager,
        drawingManager: {
            resyncDrawingsAfterReplayTimeframeChange(options = {}) {
                drawingSeqs.push(options.changeSeq);
            },
        },
        render() {},
        constrainOffset() {},
    };

    const replay = Object.create(ReplaySystem.prototype);
    Object.assign(replay, {
        chart,
        isActive: true,
        isPlaying: true,
        speed: 100,
        currentIndex: 1,
        sessionStartIndex: 0,
        tickProgress: 0,
        tickElapsedMs: 0,
        replayTimestamp: savedTimestamp,
        fullRawData: bars,
        _tfChangeSeq: 0,
        _tfChangeRestoreTimer: null,
        _tfSwitchSkipHeavyIndicators: false,
        tickInterval: null,
        animatingCandle: null,
        updateChartData() {
            chart.rawData = bars.slice(0, this.currentIndex + 1);
            chart.data = chart.rawData.slice();
        },
        syncCurrentIndexFromReplayTimestamp(ts) {
            this.replayTimestamp = ts;
            this.currentIndex = 1;
        },
        _clampCurrentIndexToReplayTimestamp() {},
        syncReplayViewportToPlayhead() {},
        updateSlider() {},
        updateTimeDisplay() {},
        normalizeSpeed(value) {
            return value;
        },
        play() {
            playCalls += 1;
            this.isPlaying = false;
            this.isPlayStarting = true;
        },
    });

    replay.onTimeframeChange(chart, {
        onReady() {
            readyCalls += 1;
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(playCalls, 1, 'first switch must begin restoring playback');
    assert.equal(replay.isPlayStarting, true, 'test must enter the deferred play-start window');

    replay.onTimeframeChange(chart, {
        onReady() {
            readyCalls += 1;
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(readyCalls, 2, 'each committed timeframe transaction signals ready exactly once');
    assert.equal(playCalls, 2, 'newest switch must preserve and restore the pending play intent');
    assert.equal(replay.replayTimestamp, savedTimestamp, 'switch must preserve intrabar replay time');
    assert.deepEqual(drawingSeqs, [1, 2], 'each committed generation must resync drawings once');
    assert.ok(guardTimestamps.length >= 2, 'order guards must cover both sides of the switch');
    assert.ok(guardTimestamps.every((ts) => ts === savedTimestamp));
});

test('packed worker bars round-trip without object loss', () => {
    installBrowserGlobals();
    const perf = global.window.IndicatorPerf;
    assert.equal(typeof perf?.packBarsCompact, 'function');
    assert.equal(typeof perf?.unpackBarsCompact, 'function',
        'worker packing needs a matching decoder before async TF recalculation is safe');
    const bars = [
        { t: 1, o: 2, h: 3, l: 1, c: 2.5, v: 7 },
        { t: 2, open: 3, high: 4, low: 2, close: 3.5, volume: 8 },
    ];
    assert.deepEqual(perf.unpackBarsCompact(perf.packBarsCompact(bars)), [
        { t: 1, o: 2, h: 3, l: 1, c: 2.5, v: 7 },
        { t: 2, o: 3, h: 4, l: 2, c: 3.5, v: 8 },
    ]);
});

test('chart timeframe follow-ups are generation guarded', () => {
    const src = readFileSync(join(__dirname, '../chart.js'), 'utf8');
    assert.match(src, /_tfSwitchGeneration/, 'chart must assign a generation to every switch');
    assert.match(src, /_invalidateIndicatorAsyncWork/, 'switch start must invalidate stale indicator work');
    assert.match(src, /completedGeneration/, 'post-switch rAF must be tied to its completed generation');
});
