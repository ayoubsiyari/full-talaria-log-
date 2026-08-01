/**
 * Cluster I / TAL-01802, TAL-01886 — paused replay shows one current price across timeframes.
 *
 * Mechanism:
 *   - Same playhead on 1m master data: resample + `_trimLastDataBarToReplayPlayhead()`
 *     keeps the forming close aligned on 1m / 5m / 15m / 1h.
 *   - Multichart / coarse panels: host canonical replay mark stamps forming close and
 *     `resolveEffectiveCurrentPrice()` (see m2-canonical-replay-mark.test.mjs).
 *
 * GREEN:
 *   node cross-timeframe-current-price-coherence.test.mjs
 *
 * RED (canonical-mark limb — reproduces 1m vs coarse label split):
 *   TALARIA_TEST_DISABLE_CROSS_TF_CANONICAL_MARK=1 node cross-timeframe-current-price-coherence.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildCorpusPoints } from '../multichart-prod/harness/m21-b-tal01918-corpus.mjs';
import { frozenPlayheadAcrossTimeframes } from '../multichart-prod/harness/m21-b-tal01918-driver.mjs';

const disableCanonicalMark = process.env.TALARIA_TEST_DISABLE_CROSS_TF_CANONICAL_MARK === '1';

global.window = disableCanonicalMark
    ? { __TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1: true }
    : {};

const require = createRequire(import.meta.url);
const ReplaySystem = require('./replay-system.js');

function make1mSeries() {
    const t0 = 1_700_000_000_000;
    const bars = [];
    for (let i = 0; i < 15; i++) {
        const c = 1.37300 + i * 0.00001;
        bars.push({
            t: t0 + i * 60_000,
            o: c,
            h: c + 0.00005,
            l: c - 0.00005,
            c,
            v: 1,
        });
    }
    return { t0, bars, hostMark: bars[8].c, completed15mClose: 1.37365 };
}

function hostReplay(bars, markIdx) {
    const chart = {
        currentFileId: 'file-gbpusd',
        currentSymbol: 'GBPUSD',
        currentTimeframe: '1m',
        data: bars.slice(0, markIdx + 1).map((b) => ({ ...b })),
        rawData: bars.slice(0, markIdx + 1).map((b) => ({ ...b })),
        offsetX: 0,
    };
    const rs = Object.create(ReplaySystem.prototype);
    rs.chart = chart;
    rs.isActive = true;
    rs.isPlaying = true;
    rs.playbackMode = 'candle';
    rs.getPlaybackMode = () => 'candle';
    rs.fastMode = false;
    rs.fullRawData = bars;
    rs.currentIndex = markIdx;
    rs.replayTimestamp = bars[markIdx].t;
    rs.tickProgress = 0;
    rs.tickElapsedMs = 0;
    rs.animatingCandle = null;
    rs.autoScrollEnabled = true;
    rs.userHasPanned = false;
    rs.ticksPerCandle = 72;
    rs.currentTicksPerCandle = 72;
    rs.getCurrentAnimatedPrice = () => bars[markIdx].c;
    chart.replaySystem = rs;
    return { chart, rs };
}

function coarse5mPanel(completedClose) {
    const chart = {
        currentFileId: 'file-gbpusd',
        currentSymbol: 'GBPUSD',
        currentTimeframe: '5m',
        _panelFullRawData: [{ t: 1, o: 1, h: 1, l: 1, c: 1 }],
        data: [{
            t: 1_700_000_000_000,
            o: 1.37300,
            h: 1.37400,
            l: 1.37200,
            c: completedClose,
        }],
        rawData: [],
        resolveEffectiveCurrentPrice() {
            const canonicalMarkEnabled = typeof window === 'undefined'
                || !window.__TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1;
            if (canonicalMarkEnabled && Number.isFinite(Number(this._mcCanonicalReplayMark))) {
                return Number(this._mcCanonicalReplayMark);
            }
            const last = this.data[this.data.length - 1];
            return last && Number.isFinite(last.c) ? last.c : null;
        },
    };
    const rs = Object.create(ReplaySystem.prototype);
    rs.chart = chart;
    rs.isActive = true;
    rs.isPlaying = true;
    rs.animatingCandle = null;
    chart.replaySystem = rs;
    return { chart, rs };
}

const corpus = buildCorpusPoints(6000, 130_000, 1_700_000_000_000);
const frozen = frozenPlayheadAcrossTimeframes({
    pointRows: corpus,
    idx: 5000,
    timeframes: ['1m', '5m', '15m', '1h'],
});

assert.equal(frozen.distinctCloses, 1,
    'frozen playhead: 1m/5m/15m/1h last closes agree at one replay instant');
const oneM = frozen.rows.find((r) => r.timeframe === '1m');
const fiveM = frozen.rows.find((r) => r.timeframe === '5m');
assert.equal(oneM.lastClosePoints, fiveM.lastClosePoints,
    'TAL-01802: 1m and 5m current close match at paused playhead');

const { bars, hostMark, completed15mClose } = make1mSeries();
const { rs: hostRs } = hostReplay(bars, 8);
const detail = hostRs._buildMultichartReplayFrameDetail();
const { chart: panel5m, rs: panelRs } = coarse5mPanel(completed15mClose);

assert.notEqual(panel5m.resolveEffectiveCurrentPrice(), hostMark,
    'premise: without canonical mark, 5m panel close diverges from 1m host mark');

panelRs._applyCanonicalReplayMarkFromDetail(detail);
assert.equal(
    panel5m.resolveEffectiveCurrentPrice(),
    hostMark,
    'TAL-01886: coarse panel current price matches 1m host mark after canonical stamp',
);

// CONF-01: different-symbol peer must not inherit host mark via same-pair alias path.
const { chart: peerXau, rs: peerRs } = coarse5mPanel(1.90000);
peerXau.currentSymbol = 'XAUUSD';
peerXau.currentFileId = 'file-xauusd';
const peerBefore = peerXau.resolveEffectiveCurrentPrice();
peerRs._applyCanonicalReplayMarkFromDetail(detail);
const peerAfter = peerXau.resolveEffectiveCurrentPrice();
if (!disableCanonicalMark) {
    // Applying a GBPUSD host detail onto XAUUSD must not silently retarget gold to 1.37308.
    // Either mark is rejected (price unchanged) or panel keeps its own completed close.
    assert.ok(
        peerAfter === peerBefore || peerAfter === 1.90000 || peerAfter !== hostMark,
        'CONF-01: XAUUSD peer must not take GBPUSD hostMark as current price',
    );
}

console.log(disableCanonicalMark
    ? 'RED — canonical mark OFF leaves 1m vs 5m current price split'
    : 'GREEN — frozen playhead and canonical mark keep cross-timeframe price coherent');
