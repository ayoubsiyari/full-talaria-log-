/**
 * M19-I — steady-replay indicator compute must be bounded (tail/worker), with
 * exact structural continuations and reason-scoped invalidation.
 *
 * Canonical:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m19-i-indicator-tail.test.mjs"
 *
 * Covers:
 *   - I-a worker CALCULATE_TAIL protocol liveness + O(tail) payload + transfer
 *   - tail merge / index correctness (mergeIndicatorTailWindow, packBarsRangeCompact)
 *   - recursive indicator warmup convergence (ema/rsi/macd/atr/dema/tema) and
 *     FIR exactness (sma/bollinger/hma)
 *   - I-c supertrend / adr exact O(delta) continuation parity
 *   - I-b talariafvg checkpoint/resume parity across session-day boundaries,
 *     sessions append patch parity, ictfvg window merge parity
 *   - parameter / TF / data replacement full invalidation
 *   - stale M19-H seq/token rejection for worker commits
 *   - all four kill switches (__TALARIA_DISABLE_M19I_*_V1)
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
        let bytes = 0;
        const packed = message && message.payload && message.payload.barsPacked;
        if (packed && typeof packed.byteLength === 'number') bytes = packed.byteLength;
        postSink.push({
            type: message && message.type,
            bytes,
            transferLen: Array.isArray(transfer) ? transfer.length : 0,
            indicators: message && message.payload && message.payload.indicators
                ? Object.values(message.payload.indicators).map((c) => c.type)
                : [],
            payload: message && message.payload,
        });
        setImmediate(() => {
            if (typeof this._workerSelf.onmessage === 'function') {
                this._workerSelf.onmessage({ data: message });
            }
            while (this._workerOutbox.length) {
                const reply = this._workerOutbox.shift();
                if (typeof this.onmessage === 'function') this.onmessage({ data: reply });
            }
        });
    }
}

function ChartCtor() {}
global.Worker = FakeWorker;
global.window = {
    Chart: ChartCtor,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=m19-i' },
};
global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options && options.detail; }
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (h) => clearTimeout(h);

require('./indicator-performance.js');
require('./talaria-fvg-indicator.js');
require('./chart-indicators-full.js');

const IndicatorPerf = global.window.IndicatorPerf;
const TalariaFvg = global.window.TalariaFvgIndicator;
const Chart = global.window.Chart;

function resetKillSwitches() {
    delete global.window.__TALARIA_DISABLE_M19I_TAIL_SEND_V1;
    delete global.window.__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1;
    delete global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1;
    delete global.window.__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1;
}

// Drain by event-loop phase ordering, not elapsed wall time. The fake worker
// replies through setImmediate; under broad parallel CPU pressure a 25ms timer
// can become due while this process is descheduled and run before that reply.
const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));
};

test('fake-worker drain is deterministic after wall-clock preemption', async () => {
    let immediateRan = false;
    setImmediate(() => { immediateRan = true; });
    const legacyTimerFlush = new Promise((resolve) => setTimeout(resolve, 25));
    const blockedUntil = Date.now() + 40;
    while (Date.now() < blockedUntil) {
        // Model CPU descheduling after both timer/immediate work are queued.
    }
    await legacyTimerFlush;
    assert.equal(immediateRan, false,
        'legacy wall-clock flush observes state before the queued worker immediate');
    await flush();
    assert.equal(immediateRan, true);
});

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
        // Occasional jumps engineer FVG-style 3-candle gaps.
        const jump = rnd() < 0.02 ? (rnd() - 0.5) * 30 : 0;
        const drift = (rnd() - 0.5) * 4 + jump;
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
    return { id: 'm19i-' + type + '-' + (nextId++), type, params: params || {} };
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
    chart.replaySystem = null;
    return chart;
}

function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }

// ─── I-a: worker protocol liveness ──────────────────────────────────────────

test('worker replies to CALCULATE_TAIL, PING, CANCEL and unknown types (no silent drop)', () => {
    const { selfObj, outbox } = makeWorkerContext();
    const bars = makeBars(400);
    const perf = IndicatorPerf;
    const packedFull = perf.packBarsCompact(bars);

    selfObj.onmessage({
        data: {
            type: 'CALCULATE_ALL',
            id: 1,
            payload: { barsPacked: packedFull, indicators: { a: { type: 'sma', params: { period: 20 } } } },
        },
    });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].type, 'ALL_RESULTS');
    assert.equal(outbox[0].id, 1);

    const tailStart = 100;
    const packedTail = perf.packBarsRangeCompact(bars, tailStart, bars.length);
    selfObj.onmessage({
        data: {
            type: 'CALCULATE_TAIL',
            id: 2,
            payload: {
                barsPacked: packedTail,
                indicators: { a: { type: 'sma', params: { period: 20 } } },
                tailStart,
                fromIndex: 380,
                lookback: 264,
                totalLength: bars.length,
            },
        },
    });
    assert.equal(outbox.length, 2);
    const tailReply = outbox[1];
    assert.equal(tailReply.type, 'ALL_RESULTS');
    assert.equal(tailReply.id, 2);
    assert.equal(tailReply.tail.tailStart, tailStart);
    assert.equal(tailReply.tail.totalLength, bars.length);
    assert.equal(tailReply.tail.tailBars, bars.length - tailStart);
    assert.equal(tailReply.results.a.line.length, bars.length - tailStart, 'tail result arrays are tail-length');

    selfObj.onmessage({ data: { type: 'PING', id: 3 } });
    assert.equal(outbox[2].type, 'PONG');

    selfObj.onmessage({ data: { type: 'CANCEL', id: 4 } });
    assert.equal(outbox[3].type, 'ERROR');

    selfObj.onmessage({ data: { type: 'BOGUS_MESSAGE', id: 5 } });
    assert.equal(outbox[4].type, 'ERROR');
    assert.equal(outbox[4].id, 5);
    assert.match(String(outbox[4].error), /unknown message type/);
});

// ─── Tail pack / merge primitives ───────────────────────────────────────────

test('packBarsRangeCompact matches full pack of the slice', () => {
    const bars = makeBars(50);
    const range = IndicatorPerf.packBarsRangeCompact(bars, 30, 50);
    const slice = IndicatorPerf.packBarsCompact(bars.slice(30, 50));
    assert.equal(range.length, slice.length);
    for (let i = 0; i < range.length; i++) assert.equal(range[i], slice[i]);
});

test('mergeIndicatorTailWindow patches the right global indices and rejects bad shapes', () => {
    const totalLength = 20;
    const tailStart = 10;
    const fromIndex = 16;
    const existing = Array.from({ length: 18 }, (_, i) => i); // shorter — grew by 2 bars
    const fresh = Array.from({ length: 10 }, (_, i) => 100 + i); // tail slice values
    const merged = IndicatorPerf.mergeIndicatorTailWindow(existing, fresh, tailStart, fromIndex, totalLength);
    assert.ok(merged);
    assert.equal(merged.length, totalLength);
    for (let i = 0; i < fromIndex; i++) assert.equal(merged[i], i < 18 ? i : null);
    for (let i = fromIndex; i < totalLength; i++) {
        assert.equal(merged[i], 100 + (i - tailStart), `index ${i} maps into the tail slice`);
    }

    // Object-of-arrays shape.
    const existingObj = { upper: new Array(18).fill(1), lower: new Array(18).fill(-1), meta: 'x' };
    const freshObj = { upper: new Array(10).fill(2), lower: new Array(10).fill(-2), meta: 'y' };
    const mergedObj = IndicatorPerf.mergeIndicatorTailWindow(existingObj, freshObj, tailStart, fromIndex, totalLength);
    assert.ok(mergedObj);
    assert.equal(mergedObj.upper[15], 1);
    assert.equal(mergedObj.upper[16], 2);
    assert.equal(mergedObj.meta, 'y');

    // Shape mismatch → null (caller falls back to a full pass).
    assert.equal(IndicatorPerf.mergeIndicatorTailWindow(null, fresh, tailStart, fromIndex, totalLength), null);
    assert.equal(IndicatorPerf.mergeIndicatorTailWindow(existing, [1, 2, 3], tailStart, fromIndex, totalLength), null);
});

// ─── Warmup convergence / FIR exactness (worker math) ───────────────────────

test('tail-window recompute converges within tolerance for recursive types and exactly for FIR types', () => {
    const { selfObj, outbox } = makeWorkerContext();
    const calc = (type, params, bars) => {
        outbox.length = 0;
        selfObj.onmessage({
            data: {
                type: 'CALCULATE_ALL',
                id: 99,
                payload: { bars, barsPacked: null, indicators: { x: { type, params } } },
            },
        });
        return outbox[0].results.x;
    };

    const n = 4000;
    const bars = makeBars(n, { seed: 11 });
    const cases = [
        ['sma', { period: 20 }, 0],
        ['bollinger', { period: 20, stdDev: 2 }, 0],
        ['hma', { period: 20 }, 0],
        ['ema', { period: 50 }, 5e-4],
        ['dema', { period: 20 }, 5e-4],
        ['tema', { period: 20 }, 5e-4],
        ['rsi', { period: 14 }, 1e-6],
        ['atr', { period: 14 }, 1e-6],
        ['macd', { fast: 12, slow: 26, signal: 9 }, 1e-5],
    ];
    const active = cases.map(([type, params]) => ({ type, params }));
    const lookback = IndicatorPerf.estimateTailLookback(active);

    const prevLen = n - 1;
    const mergeFrom = prevLen - 2;
    const tailStart = Math.max(0, mergeFrom - lookback);

    for (const [type, params, relTol] of cases) {
        const full = calc(type, params, bars);
        const prevFull = calc(type, params, bars.slice(0, prevLen));
        const freshTail = calc(type, params, bars.slice(tailStart));
        const merged = IndicatorPerf.mergeIndicatorTailWindow(
            deepCopy(prevFull), freshTail, tailStart, mergeFrom, n,
        );
        assert.ok(merged, `${type}: tail merge must succeed`);

        const series = (res) => {
            if (Array.isArray(res)) return { line: res };
            const out = {};
            Object.keys(res).forEach((k) => { if (Array.isArray(res[k])) out[k] = res[k]; });
            return out;
        };
        const fullS = series(full);
        const mergedS = series(merged);
        for (const key of Object.keys(fullS)) {
            for (let i = mergeFrom; i < n; i++) {
                const a = fullS[key][i];
                const b = mergedS[key][i];
                if (a == null && b == null) continue;
                assert.ok(a != null && b != null, `${type}.${key}[${i}] no null holes at seam`);
                const tol = relTol === 0 ? 1e-9 : Math.max(1e-9, relTol * Math.max(1, Math.abs(a)));
                assert.ok(Math.abs(a - b) <= tol,
                    `${type}.${key}[${i}] |${a} - ${b}| <= ${tol}`);
            }
        }
    }
});

// ─── I-c: supertrend / adr exact continuation ───────────────────────────────

function runFullWithSwitch(chart, disable) {
    if (disable) global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1 = 1;
    else delete global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1;
    chart.recalculateIndicators();
    delete global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1;
}

test('supertrend continuation is exactly equal to the b57 full-history recompute', () => {
    resetKillSwitches();
    const bars = makeBars(3000, { seed: 21 });
    const stepFrom = 2900;
    const stInd = ind('supertrend', { period: 10, multiplier: 3 });
    const legacyInd = { ...stInd };
    const chartNew = makeChart([stInd], bars.slice(0, stepFrom));
    const chartLegacy = makeChart([legacyInd], null);

    chartNew.recalculateIndicators(); // full — seeds the continuation state

    for (let len = stepFrom + 1; len <= bars.length; len++) {
        chartNew.data = bars.slice(0, len);
        chartNew.dataVersion++;
        chartNew.recalculateIndicators(); // continuation

        chartLegacy.data = bars.slice(0, len);
        runFullWithSwitch(chartLegacy, true); // b57 calculateSupertrend

        const got = chartNew.indicators.data[stInd.id];
        const want = chartLegacy.indicators.data[legacyInd.id];
        for (const key of ['line', 'direction', 'upper', 'lower', 'body']) {
            assert.equal(got[key].length, len, `supertrend.${key} length at ${len}`);
            for (let i = 0; i < len; i++) {
                const a = want[key][i];
                const b = got[key][i];
                if (a == null && b == null) continue;
                assert.ok(Math.abs(a - b) <= 1e-9, `supertrend.${key}[${i}] at len ${len}: ${a} vs ${b}`);
            }
        }
    }
});

test('adr continuation is exactly equal across UTC day boundaries', () => {
    resetKillSwitches();
    // 3 days of 1m bars → two day rollovers inside the stepped window.
    const bars = makeBars(4320, { seed: 33 });
    const stepFrom = 2870; // just before the second midnight (2880)
    const adrInd = ind('adr', { period: 2 });
    const legacyInd = { ...adrInd, params: { ...adrInd.params } };
    const chartNew = makeChart([adrInd], bars.slice(0, stepFrom));
    const chartLegacy = makeChart([legacyInd], null);

    chartNew.recalculateIndicators();

    for (let len = stepFrom + 1; len <= Math.min(bars.length, stepFrom + 60); len++) {
        chartNew.data = bars.slice(0, len);
        chartNew.dataVersion++;
        chartNew.recalculateIndicators();

        chartLegacy.data = bars.slice(0, len);
        runFullWithSwitch(chartLegacy, true);

        const got = chartNew.indicators.data[adrInd.id];
        const want = chartLegacy.indicators.data[legacyInd.id];
        assert.equal(got.length, len);
        for (let i = 0; i < len; i++) {
            const a = want[i];
            const b = got[i];
            if (a == null && b == null) continue;
            assert.ok(a != null && b != null && Math.abs(a - b) <= 1e-9,
                `adr[${i}] at len ${len}: ${a} vs ${b}`);
        }
    }
});

test('parameter change fully invalidates the supertrend continuation state', () => {
    resetKillSwitches();
    const bars = makeBars(1500, { seed: 41 });
    const stInd = ind('supertrend', { period: 10, multiplier: 3 });
    const chart = makeChart([stInd], bars.slice(0, 1400));
    chart.recalculateIndicators();
    chart.data = bars.slice(0, 1401);
    chart.recalculateIndicators();

    stInd.params.period = 21; // parameter replacement
    chart.recalculateIndicators();

    const legacy = { ...stInd, params: { ...stInd.params } };
    const chartLegacy = makeChart([legacy], bars.slice(0, 1401));
    runFullWithSwitch(chartLegacy, true);
    const got = chart.indicators.data[stInd.id];
    const want = chartLegacy.indicators.data[legacy.id];
    for (let i = 0; i < 1401; i++) {
        const a = want.line[i];
        const b = got.line[i];
        if (a == null && b == null) continue;
        assert.ok(Math.abs(a - b) <= 1e-9, `after param change line[${i}]`);
    }
});

test('timeframe/data replacement fully invalidates continuations (prefix mismatch)', () => {
    resetKillSwitches();
    const bars = makeBars(1500, { seed: 51 });
    const other = makeBars(1200, { seed: 99, base: 7000 });
    const stInd = ind('supertrend', { period: 10, multiplier: 3 });
    const chart = makeChart([stInd], bars.slice(0, 1400));
    chart.recalculateIndicators();

    // Wholesale data replacement + TF change.
    chart.currentTimeframe = '5m';
    chart.data = other;
    chart.dataVersion++;
    chart.recalculateIndicators();

    const legacy = { ...stInd, params: { ...stInd.params } };
    const chartLegacy = makeChart([legacy], other);
    runFullWithSwitch(chartLegacy, true);
    const got = chart.indicators.data[stInd.id];
    const want = chartLegacy.indicators.data[legacy.id];
    assert.equal(got.line.length, other.length);
    for (let i = 0; i < other.length; i++) {
        const a = want.line[i];
        const b = got.line[i];
        if (a == null && b == null) continue;
        assert.ok(Math.abs(a - b) <= 1e-9, `after data replacement line[${i}]`);
    }
});

// ─── I-b: talariafvg resume, sessions patch, ictfvg window ─────────────────

test('talariafvg checkpoint/resume equals the single-pass engine across session-day boundaries', () => {
    resetKillSwitches();
    // 3 session days of 1m bars starting 12:00 ET → crosses two 18:00 ET rollovers.
    const bars = makeBars(4320, { start: Date.UTC(2026, 0, 5, 17, 0, 0), seed: 61 });
    const ctx = { currentTimeframe: '1m' };
    const params = {};

    let checkpoint = null;
    for (let len = 3; len <= bars.length; len += 1) {
        const stepped = TalariaFvg.calculateResumable(bars.slice(0, len), params, ctx, checkpoint);
        checkpoint = stepped.checkpoint;
        // Deep-compare against the non-resumed engine at checkpoints + all bars
        // around the two day rollovers (2160±3 region is inside day 2).
        const nearRollover = (len % 1440) < 4 || (len % 1440) > 1436;
        if (len % 379 === 0 || nearRollover || len === bars.length) {
            const full = TalariaFvg.calculate(bars.slice(0, len), params, ctx);
            assert.deepEqual(deepCopy(stepped.result), deepCopy(full),
                `talariafvg resume parity at len ${len}`);
        }
    }
});

test('sessions append patch equals a fresh full calculation (and reuses the result object)', () => {
    resetKillSwitches();
    const bars = makeBars(2000, { seed: 71 });
    const sInd = ind('sessions', {});
    const chart = makeChart([sInd], bars.slice(0, 1900));
    chart.recalculateIndicators();
    const firstRef = chart.indicators.data[sInd.id];

    for (let len = 1901; len <= 1950; len++) {
        chart.data = bars.slice(0, len);
        chart.recalculateIndicators();
    }
    const patched = chart.indicators.data[sInd.id];
    assert.equal(patched, firstRef, 'I-b sessions patches in place instead of full rescan');
    assert.equal(patched.perCandle.length, 1950);

    const freshInd = ind('sessions', {});
    const freshChart = makeChart([freshInd], bars.slice(0, 1950));
    freshChart.recalculateIndicators();
    assert.deepEqual(deepCopy(patched.perCandle), deepCopy(freshChart.indicators.data[freshInd.id].perCandle));
});

test('ictfvg window merge equals a fresh full calculation', () => {
    resetKillSwitches();
    const bars = makeBars(3000, { seed: 81 });
    const fInd = ind('ictfvg', { extendBars: 40, maxBoxes: 120, minGapPct: 0 });
    const chart = makeChart([fInd], bars.slice(0, 2800));
    chart.recalculateIndicators();

    for (let len = 2801; len <= 2900; len++) {
        chart.data = bars.slice(0, len);
        chart.recalculateIndicators();
        if (len % 17 === 0 || len === 2900) {
            const freshInd = ind('ictfvg', { extendBars: 40, maxBoxes: 120, minGapPct: 0 });
            const freshChart = makeChart([freshInd], bars.slice(0, len));
            freshChart.recalculateIndicators();
            assert.deepEqual(
                deepCopy(chart.indicators.data[fInd.id].boxes),
                deepCopy(freshChart.indicators.data[freshInd.id].boxes),
                `ictfvg window merge parity at len ${len}`,
            );
        }
    }
});

test('kill switch I-b restores full sync-only recomputes (no in-place patch, no checkpoints)', () => {
    global.window.__TALARIA_DISABLE_M19I_SYNCONLY_TAIL_V1 = 1;
    const bars = makeBars(1200, { seed: 91 });
    const sInd = ind('sessions', {});
    const chart = makeChart([sInd], bars.slice(0, 1100));
    chart.recalculateIndicators();
    const firstRef = chart.indicators.data[sInd.id];
    chart.data = bars.slice(0, 1101);
    chart.recalculateIndicators();
    assert.notEqual(chart.indicators.data[sInd.id], firstRef,
        'switch OFF: sessions result is rebuilt from scratch each pass');
    assert.ok(!chart._m19iIndState || !chart._m19iIndState['sess:' + sInd.id],
        'switch OFF: no I-b cache entry is created');
    resetKillSwitches();
});

// ─── I-a end-to-end: incremental pipeline through the (fake) worker ─────────

test('incremental pass posts an O(tail) transfer-list payload, commits, and clears busy', async () => {
    resetKillSwitches();
    const bars = makeBars(3000, { seed: 101 });
    const inds = [ind('sma', { period: 20 }), ind('ema', { period: 50 }), ind('rsi', { period: 14 })];
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators(); // baseline arrays + snapshot

    chart.data = bars.slice(0, 3000);
    postSink.length = 0;
    chart.recalculateIndicatorsIncremental(2999);
    assert.equal(chart._indicatorWorkerBusy, true);
    await flush();
    assert.equal(chart._indicatorWorkerBusy, false, 'busy must clear after the tail response');

    const tailPosts = postSink.filter((p) => p.type === 'CALCULATE_TAIL');
    assert.equal(tailPosts.length, 1);
    const lookback = IndicatorPerf.estimateTailLookback(inds);
    const tailBudget = Math.max(256, lookback) * 48 * 2;
    assert.ok(tailPosts[0].bytes > 0 && tailPosts[0].bytes <= tailBudget,
        `payload ${tailPosts[0].bytes} bytes must be within the tail budget ${tailBudget}`);
    assert.ok(tailPosts[0].bytes < bars.length * 48 * 0.5, 'payload must not be O(history)');
    assert.equal(tailPosts[0].transferLen, 1, 'packed buffer ownership is transferred');

    // Merged commit correctness: last values equal a fresh full recompute.
    const freshInd = ind('ema', { period: 50 });
    const freshChart = makeChart([freshInd], bars.slice(0, 3000));
    freshChart.recalculateIndicators();
    const got = chart.indicators.data[inds[1].id].line;
    const want = freshChart.indicators.data[freshInd.id].line;
    assert.equal(got.length, 3000);
    for (let i = 2995; i < 3000; i++) {
        assert.ok(Math.abs(got[i] - want[i]) <= Math.max(1e-9, 5e-4 * Math.abs(want[i])),
            `ema tail value [${i}]`);
    }
});

test('kill switch I-a restores the b57 O(history) pack with an empty transfer list', async () => {
    global.window.__TALARIA_DISABLE_M19I_TAIL_SEND_V1 = 1;
    const bars = makeBars(3000, { seed: 111 });
    const inds = [ind('sma', { period: 20 })];
    const chart = makeChart(inds, bars.slice(0, 2999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 3000);
    postSink.length = 0;
    chart.recalculateIndicatorsIncremental(2999);
    await flush();
    const tailPosts = postSink.filter((p) => p.type === 'CALCULATE_TAIL');
    assert.equal(tailPosts.length, 1);
    assert.equal(tailPosts[0].bytes, 3000 * 48, 'switch OFF: full-history pack (O(history))');
    assert.equal(tailPosts[0].transferLen, 0, 'switch OFF: empty transfer list (structured clone)');
    resetKillSwitches();
});

// ─── I-c: worker port + staleness discriminator ─────────────────────────────

test('I-c ON: incremental refreshes supertrend and sends dema to the worker; OFF reproduces b57 staleness', async () => {
    resetKillSwitches();
    const bars = makeBars(3000, { seed: 121 });
    const stInd = ind('supertrend', { period: 10, multiplier: 3 });
    const demaInd = ind('dema', { period: 20 });
    const smaInd = ind('sma', { period: 20 });
    const chart = makeChart([stInd, demaInd, smaInd], bars.slice(0, 2999));
    chart.recalculateIndicators();

    chart.data = bars.slice(0, 3000);
    postSink.length = 0;
    chart.recalculateIndicatorsIncremental(2999);
    await flush();
    const post = postSink.find((p) => p.type === 'CALCULATE_TAIL');
    assert.ok(post.indicators.includes('dema'), 'I-c ON: dema is worker-computed');
    assert.equal(chart.indicators.data[stInd.id].line.length, 3000,
        'I-c ON: supertrend continuation covers the appended bar');
    assert.equal(chart.indicators.data[demaInd.id].length, 3000,
        'I-c ON: dema tail merged to full length');

    // Switch OFF → b57 behavior: supertrend/dema go stale on append passes.
    global.window.__TALARIA_DISABLE_M19I_WORKER_PORT_V1 = 1;
    const stInd2 = ind('supertrend', { period: 10, multiplier: 3 });
    const demaInd2 = ind('dema', { period: 20 });
    const smaInd2 = ind('sma', { period: 20 });
    const chart2 = makeChart([stInd2, demaInd2, smaInd2], bars.slice(0, 2999));
    chart2.recalculateIndicators();
    chart2.data = bars.slice(0, 3000);
    postSink.length = 0;
    chart2.recalculateIndicatorsIncremental(2999);
    await flush();
    const post2 = postSink.find((p) => p.type === 'CALCULATE_TAIL');
    assert.ok(!post2.indicators.includes('dema'), 'I-c OFF: dema stays on the legacy skip path');
    assert.equal(chart2.indicators.data[stInd2.id].line.length, 2999,
        'I-c OFF: supertrend result is stale (legacy failure reproduced)');
    resetKillSwitches();
});

// ─── M19-H stale-generation safety ──────────────────────────────────────────

test('stale worker commits are rejected: seq bump, length drift, timeframe drift', () => {
    resetKillSwitches();
    const bars = makeBars(500, { seed: 131 });
    const smaInd = ind('sma', { period: 20 });
    const chart = makeChart([smaInd], bars);
    chart.recalculateIndicators();
    const before = deepCopy(chart.indicators.data[smaInd.id]);
    const results = {
        [smaInd.id]: { line: new Array(100).fill(42), ma: null, bbUpper: null, bbLower: null },
    };
    const meta = { tailStart: 400, fromIndex: 498, totalLength: 500, markComplete: false, timeframe: '1m' };

    chart._indicatorWorkerSeq = 10;
    chart._applyIndicatorWorkerResults(results, 9, null, meta); // stale seq (M19-H invalidation)
    assert.deepEqual(deepCopy(chart.indicators.data[smaInd.id]), before, 'stale seq rejected');

    chart._applyIndicatorWorkerResults(results, 10, null, { ...meta, totalLength: 501 });
    assert.deepEqual(deepCopy(chart.indicators.data[smaInd.id]), before, 'length drift rejected');

    chart._applyIndicatorWorkerResults(results, 10, null, { ...meta, timeframe: '5m' });
    assert.deepEqual(deepCopy(chart.indicators.data[smaInd.id]), before, 'timeframe drift rejected');

    chart._applyIndicatorWorkerResults(results, 10, null, meta); // valid
    assert.equal(chart.indicators.data[smaInd.id].line[499], 42, 'valid tail commit lands');
});

test('non-tail worker commits still enforce the strict M19-H data token', () => {
    resetKillSwitches();
    const bars = makeBars(300, { seed: 141 });
    const smaInd = ind('sma', { period: 20 });
    const chart = makeChart([smaInd], bars);
    chart.recalculateIndicators();
    const before = deepCopy(chart.indicators.data[smaInd.id]);
    chart._indicatorWorkerSeq = 5;
    const staleToken = { dataVersion: 999, timeframe: '1m', dataFp: 'bogus' };
    chart._applyIndicatorWorkerResults({ [smaInd.id]: [1, 2, 3] }, 5, staleToken);
    assert.deepEqual(deepCopy(chart.indicators.data[smaInd.id]), before, 'stale token rejected');
});

// ─── I-d: reason-scoped invalidation / dedupe ───────────────────────────────

function makeDedupeChart() {
    const bars = makeBars(300, { seed: 151 });
    const smaInd = ind('sma', { period: 20 });
    const chart = makeChart([smaInd], bars);
    chart._isInteractionFastRender = () => false;
    let runs = 0;
    chart._runIndicatorRecalc = function () { runs += 1; };
    chart.recalculateIndicators(); // marks the snapshot
    return { chart, getRuns: () => runs };
}

test('I-d: force=true with a non-invalidating reason dedupes on identical state', () => {
    resetKillSwitches();
    const { chart, getRuns } = makeDedupeChart();
    chart.scheduleIndicatorRecalc('replay-pause', { force: true, immediate: true });
    chart.scheduleIndicatorRecalc('multichart-replay', { force: true, immediate: true });
    chart.scheduleIndicatorRecalc('zoom-fill', { force: true, immediate: true });
    assert.equal(getRuns(), 0, 'identical state + non-invalidating reason must dedupe');

    chart.scheduleIndicatorRecalc('timezone', { force: true, immediate: true });
    assert.equal(getRuns(), 1, 'timezone changes output without changing the snapshot — must run');

    chart.dataVersion += 1; // data replacement marker
    chart.scheduleIndicatorRecalc('replay-pause', { force: true, immediate: true });
    assert.equal(getRuns(), 2, 'any real state delta must still recalc');
});

test('kill switch I-d restores b57 force-always-recalcs', () => {
    global.window.__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1 = 1;
    const { chart, getRuns } = makeDedupeChart();
    chart.scheduleIndicatorRecalc('replay-pause', { force: true, immediate: true });
    chart.scheduleIndicatorRecalc('replay-pause', { force: true, immediate: true });
    assert.equal(getRuns(), 2, 'switch OFF: every forced request recalcs (legacy failure)');
    resetKillSwitches();
});

test('I-d: replay pause full-sync dedupes only when the snapshot is byte-identical', () => {
    resetKillSwitches();
    const bars = makeBars(400, { seed: 161 });
    const smaInd = ind('sma', { period: 20 });
    const chart = makeChart([smaInd], bars);
    chart.replaySystem = { isActive: true, isPlaying: false };
    let fullSyncs = 0;
    const origRecalc = chart.recalculateIndicators.bind(chart);
    chart.recalculateIndicators = function () { fullSyncs += 1; return origRecalc(); };

    chart.scheduleReplayIndicatorRecalc(false);
    assert.equal(fullSyncs, 1, 'first pause with no snapshot must full-sync');
    chart.scheduleReplayIndicatorRecalc(false);
    assert.equal(fullSyncs, 1, 'identical repeated pause dedupes');

    chart.data = bars.concat(makeBars(1, { start: bars[bars.length - 1].t + 60_000, seed: 1 }));
    chart.scheduleReplayIndicatorRecalc(false);
    assert.equal(fullSyncs, 2, 'data delta must full-sync again');

    global.window.__TALARIA_DISABLE_M19I_FORCE_DEDUPE_V1 = 1;
    chart.scheduleReplayIndicatorRecalc(false);
    assert.equal(fullSyncs, 3, 'switch OFF: pause always full-syncs (legacy failure)');
    resetKillSwitches();
});

// ─── Steady-replay scheduler routing ────────────────────────────────────────

test('steady play routes bar advances through the bounded incremental pipeline', async () => {
    resetKillSwitches();
    const bars = makeBars(3000, { seed: 171 });
    const inds = [ind('sma', { period: 20 }), ind('talariafvg', {})];
    const chart = makeChart(inds, bars.slice(0, 2990));
    chart.replaySystem = { isActive: true, isPlaying: true };
    let incrementalCalls = 0;
    const origInc = chart.recalculateIndicatorsIncremental.bind(chart);
    chart.recalculateIndicatorsIncremental = function (from) { incrementalCalls += 1; return origInc(from); };

    chart.recalculateIndicators(); // baseline + snapshot
    for (let len = 2991; len <= 2995; len++) {
        chart.data = bars.slice(0, len);
        chart.dataVersion++;
        chart.scheduleReplayIndicatorRecalc(true);
        await flush(30); // rAF + worker round trip
    }
    assert.ok(incrementalCalls >= 4, `play path must use the incremental pipeline (got ${incrementalCalls})`);
    assert.equal(chart.indicators.data[inds[0].id].line.length, 2995, 'sma merged to the final length');

    // Kill switch I-a: play path reverts to the b57 full synchronous rescan.
    global.window.__TALARIA_DISABLE_M19I_TAIL_SEND_V1 = 1;
    incrementalCalls = 0;
    let fullSyncs = 0;
    const origFull = chart.recalculateIndicators.bind(chart);
    chart.recalculateIndicators = function () { fullSyncs += 1; return origFull(); };
    chart.data = bars.slice(0, 2996);
    chart.dataVersion++;
    chart.scheduleReplayIndicatorRecalc(true);
    await flush(30);
    assert.equal(incrementalCalls, 0, 'switch OFF: no tail pipeline during play');
    assert.ok(fullSyncs >= 1, 'switch OFF: full synchronous rescan per bar advance (legacy failure)');
    resetKillSwitches();
});
