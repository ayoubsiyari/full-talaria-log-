/**
 * M19-I-f — replay presentation coherence: during continuous play every paint
 * must present price and ALL active indicator series from the same committed
 * generation, without waiting on worker round-trip time.
 *
 * Canonical:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-i-f-frame-coherence.test.mjs"
 *
 * Covers:
 *   - coherent tick-time commit with a DELAYED fake worker (paint never
 *     depends on worker RTT; pass is fully synchronous — no rAF, no timer)
 *   - a wedged (never-replying) worker cannot stall coherence, and
 *     backpressured passes do not bump the seq (no in-flight invalidation)
 *   - bridge value parity with a fresh full recompute at the merge seam
 *   - OFF discriminator (__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1) restores
 *     the b58 price-first rAF/worker catch-up behavior exactly
 *   - TF + data replacement mid-flight: late tail response rejected, no
 *     stale commit, no stuck hold
 *   - pause/step, same-bar, and no-indicator paths stay immediate/coherent
 *   - order/money-path ordering at tick time is never delayed by the visual
 *     coherence mechanism
 *   - uncovered (cumulative) types are counted as fallbacks, never hidden
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Browser global stubs (must exist before module require) ───────────────

const postSink = [];
// Mutable knobs for the fake worker: response delay and drop-all mode.
const workerConfig = { delayMs: 0, drop: false };

function makeWorkerContext() {
    const outbox = [];
    const selfObj = {
        onmessage: null,
        postMessage(msg) { outbox.push(msg); },
    };
    const ctx = vm.createContext({ self: selfObj, console });
    const src = readFileSync(join(__dirname, '..', 'workers', 'indicator-worker.js'), 'utf8');
    vm.runInContext(src, ctx, { filename: 'indicator-worker.js' });
    return { selfObj, outbox };
}

class FakeWorker {
    constructor() {
        const { selfObj, outbox } = makeWorkerContext();
        this._workerSelf = selfObj;
        this._workerOutbox = outbox;
        this.onmessage = null;
        this.onerror = null;
    }
    postMessage(message, transfer) {
        postSink.push({
            type: message && message.type,
            transferLen: Array.isArray(transfer) ? transfer.length : 0,
            totalLength: message && message.payload ? message.payload.totalLength : null,
        });
        if (workerConfig.drop) return; // wedged worker: request vanishes
        setTimeout(() => {
            if (typeof this._workerSelf.onmessage === 'function') {
                this._workerSelf.onmessage({ data: message });
            }
            while (this._workerOutbox.length) {
                const reply = this._workerOutbox.shift();
                if (typeof this.onmessage === 'function') this.onmessage({ data: reply });
            }
        }, workerConfig.delayMs);
    }
}

function ChartCtor() {}
global.Worker = FakeWorker;
global.window = {
    Chart: ChartCtor,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=m19-i-f' },
};
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options && options.detail; }
};
const rafQueue = [];
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (h) => clearTimeout(h);
void rafQueue;

require('./indicator-performance.js');
require('./talaria-fvg-indicator.js');
require('./chart-indicators-full.js');

const Chart = global.window.Chart;

function resetKillSwitches() {
    delete global.window.__TALARIA_DISABLE_M19I_TAIL_SEND_V1;
    delete global.window.__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1;
    delete global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1;
    delete global.window.__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1;
    delete global.window.__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1;
    delete global.window.__TALARIA_DISABLE_M19I_TICK_COHERENT_V1;
    workerConfig.delayMs = 0;
    workerConfig.drop = false;
}

const flush = (ms = 25) => new Promise((r) => setTimeout(r, ms));

// ─── Deterministic data ─────────────────────────────────────────────────────

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeBars(n, { start = Date.UTC(2026, 0, 5, 0, 0, 0), stepMs = 60_000, seed = 7, base = 5000 } = {}) {
    const rnd = mulberry32(seed);
    const bars = [];
    let price = base;
    for (let i = 0; i < n; i++) {
        const drift = (rnd() - 0.5) * 4;
        const o = price;
        const c = price + drift;
        const h = Math.max(o, c) + rnd() * 1.5;
        const l = Math.min(o, c) - rnd() * 1.5;
        bars.push({ t: start + i * stepMs, o, h, l, c, v: 100 + Math.floor(rnd() * 50) });
        price = c;
    }
    return bars;
}

let nextId = 1;
function ind(type, params) {
    return { id: 'm19if-' + type + '-' + (nextId++), type, params: params || {} };
}

function makeChart(indicators, data) {
    const chart = Object.create(Chart.prototype);
    chart.data = data;
    chart.rawData = data;
    chart.currentTimeframe = '1m';
    chart.dataVersion = 1;
    chart.chartSettings = {};
    chart.indicators = { active: indicators, data: {} };
    chart.scheduleRender = () => {};
    chart.render = () => {};
    chart.updateOHLCIndicators = () => {};
    chart.replaySystem = { isActive: true, isPlaying: true };
    return chart;
}

/** PO feel-test mix: bands + 3 MAs overlays, RSI/MACD/Stoch lower panes. */
function poMix() {
    return [
        ind('sma', { period: 20 }),
        ind('ema', { period: 50 }),
        ind('wma', { period: 30 }),
        ind('bollinger', { period: 20, stdDev: 2 }),
        ind('rsi', { period: 14 }),
        ind('macd', { fast: 12, slow: 26, signal: 9 }),
        ind('stoch', { period: 14, smoothK: 3, smoothD: 3 }),
    ];
}

function seriesLen(type, pack) {
    if (!pack) return 0;
    if (Array.isArray(pack)) return pack.length;
    const t = String(type || '').toLowerCase();
    let arr = null;
    if (t === 'rsi') arr = pack.rsi;
    else if (t === 'macd') arr = pack.macd;
    else if (t === 'stoch' || t === 'stochastic') arr = pack.k;
    else if (t === 'bollinger' || t === 'bb') arr = pack.middle || pack.upper;
    else arr = pack.line || pack.ma || pack.upper || pack.middle;
    return Array.isArray(arr) ? arr.length : 0;
}

/** Coherence predicate matching the Lane 2 browser gate's sampler. */
function assertCoherent(chart, expectLen, label) {
    for (const i of chart.indicators.active) {
        const len = seriesLen(i.type, chart.indicators.data[i.id]);
        assert.equal(len, expectLen, `${label}: ${i.type} series length must equal price bars`);
    }
    const snap = chart._indCalcSnapshot;
    assert.ok(snap && snap.barCount === expectLen,
        `${label}: calc snapshot barCount (${snap && snap.barCount}) must equal price bars (${expectLen})`);
}

function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }

// ─── I-f ON: coherent commit at tick time, before any paint ─────────────────

test('coherent tick pass commits ALL series synchronously — worker delay cannot cause a stale paint', async () => {
    resetKillSwitches();
    workerConfig.delayMs = 50; // slow worker: reply lands long after the tick
    const bars = makeBars(3000, { seed: 7 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators(); // baseline + snapshot at 2999

    chart.data = bars.slice(0, 3000);
    postSink.length = 0;
    chart.scheduleReplayIndicatorRecalc(true);

    // SYNCHRONOUS coherence: assert BEFORE any timer/rAF/worker reply can run.
    assertCoherent(chart, 3000, 'immediately after tick pass');
    assert.ok(chart._replayIndRecalcRaf == null, 'no rAF deferral in coherent mode');
    assert.equal(postSink.filter((p) => p.type === 'CALCULATE_TAIL').length, 1,
        'worker tail post still happens (compute pipeline preserved)');
    assert.equal(chart._indicatorWorkerBusy, true, 'worker pass in flight');

    await flush(80); // delayed worker commit lands
    assertCoherent(chart, 3000, 'after delayed worker commit');
    assert.equal(chart._indicatorWorkerBusy, false, 'busy cleared after response');
    const stats = chart._m19ifStats;
    assert.ok(stats && stats.bridgePasses >= 1 && stats.bridgedSeries >= inds.length,
        'bridge pass counted');
    assert.equal(stats.uncoveredSeries, 0, 'PO mix fully covered — no fallback');
    assert.equal(stats.mergeRejects, 0, 'no merge rejects');
});

test('bridge values match a fresh full recompute at the merge seam', () => {
    resetKillSwitches();
    workerConfig.drop = true; // ONLY bridge values — worker never replies
    const bars = makeBars(3000, { seed: 17 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 3000);
    chart.scheduleReplayIndicatorRecalc(true);
    assertCoherent(chart, 3000, 'bridge-only commit');

    const tolByType = {
        sma: 1e-9, wma: 1e-9, bollinger: 1e-9, stoch: 1e-6,
        ema: 5e-4, macd: 1e-5, rsi: 1e-6,
    };
    for (const i of inds) {
        const freshInd = ind(i.type, deepCopy(i.params));
        const freshChart = makeChart([freshInd], bars.slice(0, 3000));
        freshChart.replaySystem = null;
        freshChart.recalculateIndicators();
        const got = chart.indicators.data[i.id];
        const want = freshChart.indicators.data[freshInd.id];
        const keys = Array.isArray(want) ? null : Object.keys(want).filter((k) => Array.isArray(want[k]));
        const relTol = tolByType[i.type] != null ? tolByType[i.type] : 5e-4;
        const cmp = (a, b, where) => {
            if (a == null && b == null) return;
            assert.ok(a != null && b != null, `${where}: no null holes at seam`);
            const tol = Math.max(1e-9, relTol * Math.max(1, Math.abs(a)));
            assert.ok(Math.abs(a - b) <= tol, `${where}: |${a} - ${b}| <= ${tol}`);
        };
        for (let idx = 2996; idx < 3000; idx++) {
            if (keys === null) cmp(want[idx], got[idx], `${i.type}[${idx}]`);
            else for (const k of keys) cmp(want[k][idx], got[k] && got[k][idx], `${i.type}.${k}[${idx}]`);
        }
    }
});

test('wedged worker: coherence holds every tick, backpressure never bumps the in-flight seq', () => {
    resetKillSwitches();
    workerConfig.drop = true; // worker never replies — busy stays wedged
    const bars = makeBars(3050, { seed: 27 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 3000));
    chart.recalculateIndicators();

    postSink.length = 0;
    chart.data = bars.slice(0, 3001);
    chart.scheduleReplayIndicatorRecalc(true);
    assertCoherent(chart, 3001, 'tick 1');
    const seqAfterFirst = chart._indicatorWorkerSeq;
    assert.equal(chart._indicatorWorkerBusy, true);

    for (let len = 3002; len <= 3010; len++) {
        chart.data = bars.slice(0, len);
        chart.scheduleReplayIndicatorRecalc(true);
        assertCoherent(chart, len, `tick at ${len} with wedged worker`);
    }
    assert.equal(chart._indicatorWorkerSeq, seqAfterFirst,
        'backpressured coherent passes must NOT invalidate the in-flight worker pass');
    assert.equal(chart._indicatorWorkerCoalesce, true, 'worker catch-up stays coalesced');
    assert.equal(postSink.filter((p) => p.type === 'CALCULATE_TAIL').length, 1,
        'no worker post storm under backpressure');
});

// ─── OFF discriminator: exact b58 price-first behavior ──────────────────────

test('kill switch I-f OFF restores b58: stale-at-tick, rAF deferral, worker-RTT catch-up', async () => {
    resetKillSwitches();
    global.window.__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1 = 1;
    workerConfig.delayMs = 20;
    const bars = makeBars(3000, { seed: 37 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 3000);
    chart.scheduleReplayIndicatorRecalc(true);

    // Legacy failure reproduced: price is at 3000, indicators still at 2999
    // when the tick's paint would land, and the pass sits in an rAF.
    assert.notEqual(chart._replayIndRecalcRaf, null, 'switch OFF: pass deferred to rAF');
    for (const i of inds) {
        assert.equal(seriesLen(i.type, chart.indicators.data[i.id]), 2999,
            `switch OFF: ${i.type} stale at tick time (price-first paint)`);
    }

    await flush(80); // rAF + worker RTT
    assertCoherent(chart, 3000, 'switch OFF: async catch-up eventually lands (b58)');

    // OFF also restores whole-pass deferral under worker backpressure.
    chart._indicatorWorkerBusy = true;
    chart.data = bars.slice(0, 3000).concat(bars.slice(3000 - 1, 3000)); // any delta
    chart.data = bars.slice(0, 2999); // restore a clean shorter state
    chart.recalculateIndicatorsIncremental(2998);
    assert.equal(chart._indicatorWorkerCoalesce, true, 'switch OFF: busy defers whole pass');
    chart._indicatorWorkerBusy = false;
    resetKillSwitches();
});

// ─── M19-H safety: TF / data replacement mid-flight ─────────────────────────

test('TF + data replacement while a tail post is in flight: no stale commit, no stuck hold', async () => {
    resetKillSwitches();
    workerConfig.delayMs = 50;
    const bars = makeBars(3000, { seed: 47 });
    const other = makeBars(1200, { seed: 99, base: 7000, stepMs: 300_000 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 3000);
    chart.scheduleReplayIndicatorRecalc(true);
    assert.equal(chart._indicatorWorkerBusy, true, 'tail post in flight');

    // Mid-flight invalidation: timeframe switch + wholesale data replacement.
    chart.currentTimeframe = '5m';
    chart.data = other;
    chart.dataVersion++;
    chart.replaySystem.isPlaying = false;
    chart.scheduleReplayIndicatorRecalc(false); // pause path: seq bump + full sync

    assertCoherent(chart, other.length, 'after TF/data replacement');
    const snapshotAfter = deepCopy(chart.indicators.data[inds[0].id]);

    await flush(100); // the STALE tail response (length 3000, tf 1m) lands now
    assert.deepEqual(deepCopy(chart.indicators.data[inds[0].id]), snapshotAfter,
        'stale tail commit rejected (seq/TF/length guards)');
    assertCoherent(chart, other.length, 'still coherent on the new TF');
    assert.equal(chart._indicatorWorkerBusy, false, 'no stuck busy/hold after invalidation');
});

// ─── Pause / step / same-bar / no-indicator immediacy ───────────────────────

test('pause/step path stays synchronous, coherent, and I-d dedupe still applies', () => {
    resetKillSwitches();
    const bars = makeBars(2000, { seed: 57 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 1999));
    chart.replaySystem.isPlaying = false;
    let fullSyncs = 0;
    const orig = chart.recalculateIndicators.bind(chart);
    chart.recalculateIndicators = function () { fullSyncs += 1; return orig(); };

    chart.data = bars.slice(0, 2000);
    chart.scheduleReplayIndicatorRecalc(false);
    assertCoherent(chart, 2000, 'pause/step full sync');
    assert.equal(fullSyncs, 1);

    chart.scheduleReplayIndicatorRecalc(false); // identical state
    assert.equal(fullSyncs, 1, 'repeated pause dedupes (I-d)');
    assertCoherent(chart, 2000, 'still coherent after dedup skip');
});

test('same-bar play tick skips recompute but stays coherent; no-indicator path is a no-op', () => {
    resetKillSwitches();
    workerConfig.delayMs = 0;
    const bars = makeBars(2000, { seed: 67 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2000));
    chart.recalculateIndicators();

    let incCalls = 0;
    let fullCalls = 0;
    const origInc = chart.recalculateIndicatorsIncremental.bind(chart);
    const origFull = chart.recalculateIndicators.bind(chart);
    chart.recalculateIndicatorsIncremental = function (f) { incCalls += 1; return origInc(f); };
    chart.recalculateIndicators = function () { fullCalls += 1; return origFull(); };

    chart.scheduleReplayIndicatorRecalc(true); // seeds the bar fingerprint
    const incAfterSeed = incCalls;
    const fullAfterSeed = fullCalls;
    chart.scheduleReplayIndicatorRecalc(true); // same bar, same data
    assert.equal(incCalls, incAfterSeed, 'same-bar tick: no incremental recompute');
    assert.equal(fullCalls, fullAfterSeed, 'same-bar tick: no full recompute');
    assertCoherent(chart, 2000, 'same-bar tick stays coherent');

    // No indicators: immediate return, nothing scheduled, no error.
    const empty = makeChart([], bars.slice(0, 100));
    empty.scheduleReplayIndicatorRecalc(true);
    assert.equal(empty._replayIndRecalcRaf, undefined, 'no-indicator path schedules nothing');
});

// ─── Order/money-path ordering at tick time ─────────────────────────────────

test('order execution at tick time is never delayed: coherent pass completes before the tick continues', () => {
    resetKillSwitches();
    workerConfig.delayMs = 1000; // pathologically slow worker
    const bars = makeBars(3000, { seed: 77 });
    const inds = poMix();
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators();

    // Simulate the replay tick's exact sequence: data mutation →
    // indicator pass → price paint → order manager update. All synchronous.
    const sequence = [];
    chart.render = () => { sequence.push('paint:' + chart.data.length); };
    const fakeOrderManager = {
        updatePositions() { sequence.push('orders:' + chart.data.length); },
    };

    chart.data = bars.slice(0, 3000);
    sequence.push('mutate:3000');
    chart.scheduleReplayIndicatorRecalc(true);
    sequence.push('indicators-committed:' + chart._indCalcSnapshot.barCount);
    chart.render();
    fakeOrderManager.updatePositions();

    assert.deepEqual(sequence, [
        'mutate:3000',
        'indicators-committed:3000',
        'paint:3000',
        'orders:3000',
    ], 'tick sequence is fully synchronous — orders run at tick time with bar 3000, never held on the worker');
    assertCoherent(chart, 3000, 'paint was coherent when orders executed');
});

// ─── Fallback accounting (never hidden) ─────────────────────────────────────

test('I-g: forming-candle tick OHLC mutation refreshes MA tip; kill switch freezes tip', () => {
    resetKillSwitches();
    workerConfig.drop = true;
    const bars = makeBars(200, { seed: 97 });
    const inds = [
        ind('sma', { period: 20 }),
        ind('ema', { period: 20 }),
        ind('wma', { period: 20 }),
        ind('dema', { period: 20 }),
        ind('tema', { period: 20 }),
    ];
    const chart = makeChart(inds, bars.map((b) => ({ ...b })));
    chart.recalculateIndicators();
    chart.scheduleReplayIndicatorRecalc(true); // seed bar fingerprint

    const tipOf = (type, pack) => {
        if (!pack) return null;
        const arr = Array.isArray(pack) ? pack : (pack.line || pack.ma);
        if (!Array.isArray(arr) || !arr.length) return null;
        const v = arr[arr.length - 1];
        return (v && typeof v === 'object') ? Number(v.value ?? v.y ?? v.c) : Number(v);
    };
    const tipsBefore = Object.fromEntries(
        inds.map((i) => [i.type, tipOf(i.type, chart.indicators.data[i.id])]),
    );

    // Same bar count / open time; mutate forming close (tick animation).
    chart.replaySystem.animatingCandle = { t: bars[bars.length - 1].t };
    chart.replaySystem.tickProgress = 12;
    const last = chart.data[chart.data.length - 1];
    last.c = last.c + 25;
    last.h = Math.max(last.h, last.c);

    let incCalls = 0;
    const origInc = chart.recalculateIndicatorsIncremental.bind(chart);
    chart.recalculateIndicatorsIncremental = function (f) {
        incCalls += 1;
        return origInc(f);
    };
    chart.scheduleReplayIndicatorRecalc(true);
    assert.ok(incCalls >= 1, 'forming tip change must recompute (not bar-fp skip)');
    for (const i of inds) {
        const after = tipOf(i.type, chart.indicators.data[i.id]);
        assert.notEqual(after, tipsBefore[i.type], `${i.type} tip must move with forming close`);
    }

    // Kill switch I-g: same mutation must skip again (legacy freeze).
    resetKillSwitches();
    global.window.__TALARIA_DISABLE_M19I_TICK_COHERENT_V1 = 1;
    const chartOff = makeChart(inds, bars.map((b) => ({ ...b })));
    chartOff.recalculateIndicators();
    chartOff.scheduleReplayIndicatorRecalc(true);
    const tipsOffBefore = Object.fromEntries(
        inds.map((i) => [i.type, tipOf(i.type, chartOff.indicators.data[i.id])]),
    );
    chartOff.replaySystem.animatingCandle = { t: bars[bars.length - 1].t };
    chartOff.replaySystem.tickProgress = 12;
    const lastOff = chartOff.data[chartOff.data.length - 1];
    lastOff.c = lastOff.c + 25;
    lastOff.h = Math.max(lastOff.h, lastOff.c);
    let incOff = 0;
    const origIncOff = chartOff.recalculateIndicatorsIncremental.bind(chartOff);
    chartOff.recalculateIndicatorsIncremental = function (f) {
        incOff += 1;
        return origIncOff(f);
    };
    chartOff.scheduleReplayIndicatorRecalc(true);
    assert.equal(incOff, 0, 'I-g OFF: forming OHLC still skipped by bar fingerprint');
    for (const i of inds) {
        assert.equal(
            tipOf(i.type, chartOff.indicators.data[i.id]),
            tipsOffBefore[i.type],
            `${i.type} tip frozen when I-g kill switch is ON`,
        );
    }
});

test('cumulative (non-tail-safe) types are counted as fallbacks and do not fake completeness', () => {
    resetKillSwitches();
    workerConfig.drop = true;
    const bars = makeBars(2000, { seed: 87 });
    const smaInd = ind('sma', { period: 20 });
    const obvInd = ind('obv', {});
    const chart = makeChart([smaInd, obvInd], bars.slice(0, 1999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 2000);
    chart.scheduleReplayIndicatorRecalc(true);

    // Covered series stays coherent; cumulative obv takes the async full pass.
    assert.equal(seriesLen('sma', chart.indicators.data[smaInd.id]), 2000,
        'bridged sma coherent at tick');
    const stats = chart._m19ifStats;
    assert.ok(stats && stats.fullAsyncFallbacks >= 1,
        'cumulative type counted as a full-async fallback (diagnosed, not hidden)');
    assert.notEqual(chart._indCalcSnapshot && chart._indCalcSnapshot.barCount, 2000,
        'snapshot NOT marked complete while a series is pending — no fake coherence');
});
