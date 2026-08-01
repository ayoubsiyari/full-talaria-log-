/**
 * MONSTER-2 — forming-bucket refresh: correctness first, then the ms/s delta.
 *
 * The load-bearing cell is C1/C2: on every tick the cached result must DEEP-EQUAL what a
 * full resample would have produced. A fast wrong answer is worse than the slow right one,
 * and this branch exists precisely to skip work, so the equality is the whole safety case.
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const PIPELINE = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-data-pipeline.js');

function extractMethod(src, name) {
    const re = new RegExp(`^\\s{4}${name}\\s*\\(`, 'm');
    const m = re.exec(src);
    if (!m) throw new Error(`extract failed: ${name}`);
    let i = src.indexOf('{', m.index), depth = 0, inStr = null, inLine = false, inBlock = false, inRe = false, prev = '';
    for (; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (inLine) { if (c === '\n') inLine = false; prev = c; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } prev = c; continue; }
        if (inStr) { if (c === '\\') { i++; prev = ''; continue; } if (c === inStr) inStr = null; prev = c; continue; }
        if (inRe) { if (c === '\\') { i++; prev = ''; continue; } if (c === '[') { while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i++; i++; } } else if (c === '/') inRe = false; prev = c; continue; }
        if (c === '/' && n === '/') { inLine = true; i++; prev = c; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; prev = c; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
        if (c === '/' && /[=(,:[!&|?{};+\-*%^~<>]/.test(prev)) { inRe = true; prev = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
        if (!/\s/.test(c)) prev = c;
    }
    throw new Error(`unbalanced ${name}`);
}

const chartSrc = readFileSync(CHART_JS, 'utf8');
const HostCtor = new Function(`
    "use strict";
    function _talariaM20Q9McDiagCountersDisabled() { return true; }
    return class H {
        constructor() { this._mcDiag = null; }
        ${['_resampleDataFull', '_prepareBarsForResampling', 'parseTimeframe'].map((n) => extractMethod(chartSrc, n)).join('\n')}
    };
`)();

const ChartDataPipeline = require(PIPELINE);

/**
 * WORKLOAD STAMP — every ms/s figure below is a per-event cost multiplied by these, and it is
 * meaningless without them. Two independent measurements of this same function disagreed by 4x
 * purely on workload: 8.5% of occupancy at zero orders, 2.2% of a freeze at 43 trades where
 * _chartIndexForCloseMarkerOnChart took 31.8%. Both were right. A re-run in a trade-bearing session
 * will read this fix as a null result unless it compares against the same stamp.
 */
const WORKLOAD = Object.freeze({
    trades: 0,                 // zero orders open or closed — no order-path cost is in these numbers
    ticksMeasured: 60,
    barsPerCase: 'declared per case below',
    note: 'replay advancing, no orders, no indicators beyond the default set'
});

/**
 * The scheduler REQUESTS 62.5 events/s (getCandlePlaybackCadence, 16 ms floor). A saturated main
 * thread DELIVERS 7.87/s (measured). The requested rate is not a rate share, so the achieved figure
 * is the one to quote for occupancy; the requested one is kept only so the two can be reconciled.
 */
const REQUESTED_EVENT_RATE = 62.5;
const ACHIEVED_EVENT_RATE = 7.87;
/** Measured calls per event; the cache hit rate is 0.4%, so both calls land on the resample path. */
const RESAMPLES_PER_EVENT = 2.0;

function makeBars(n, stepMs = 60_000) {
    const out = new Array(n);
    let px = 100;
    const t0 = Date.UTC(2024, 0, 1);
    for (let i = 0; i < n; i++) {
        const o = px, c = px + Math.sin(i / 7) * 0.4;
        out[i] = { t: t0 + i * stepMs, o, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2, c, v: 1000 + (i % 97) };
        px = c;
    }
    return out;
}

/** Replay shape: mostly forming-bar mutations, with a bar CLOSING every `closeEvery` ticks. */
function runReplay(tf, residentBars, ticks, { closeEvery = 5, disabled = false } = {}) {
    const host = new HostCtor();
    host.currentTimeframe = tf;
    host.dataVersion = 0;
    const pipeline = new ChartDataPipeline(host);

    let fullCalls = 0;
    const realFull = host._resampleDataFull.bind(host);
    host._resampleDataFull = function (...a) { fullCalls++; return realFull(...a); };

    globalThis.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1 = disabled ? true : undefined;

    const all = makeBars(residentBars + ticks + 2);
    const source = all.slice(0, residentBars);
    pipeline.getResampledSeries(source, tf, host.dataVersion);

    const times = [];
    const mismatches = [];
    let appended = 0;

    for (let k = 0; k < ticks; k++) {
        if (k % closeEvery === closeEvery - 1) {
            source.push(all[residentBars + appended]);   // a bar CLOSES
            appended++;
        } else {
            const last = source[source.length - 1];      // the forming bar MUTATES in place
            last.c += 0.11;
            if (last.c > last.h) last.h = last.c;
            if (last.c < last.l) last.l = last.c;
            last.v += 13;
        }
        host.dataVersion += 1;

        const t0 = performance.now();
        const got = pipeline.getResampledSeries(source, tf, host.dataVersion);
        times.push(performance.now() - t0);

        const expected = realFull(source, tf);
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
            mismatches.push({ tick: k, gotLast: got[got.length - 1], expLast: expected[expected.length - 1] });
        }
    }

    globalThis.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1 = undefined;
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return {
        mismatches,
        fullResamplesPerEvent: +(fullCalls / ticks).toFixed(3),
        meanMs: +mean.toFixed(4),
        msPerSecondRequested: +(mean * REQUESTED_EVENT_RATE * RESAMPLES_PER_EVENT).toFixed(1),
        msPerSecondAchieved: +(mean * ACHIEVED_EVENT_RATE * RESAMPLES_PER_EVENT).toFixed(1),
    };
}

test('C1 CORRECTNESS 1m->1m: cached output deep-equals a full resample on every tick', () => {
    const r = runReplay('1m', 25583, 60);
    assert.deepEqual(r.mismatches, [], 'refreshed series must be identical to a full resample');
});

test('C2 CORRECTNESS 1m->15m: multi-bar buckets stay exact under forming-bar mutation', () => {
    const r = runReplay('15m', 25583, 60);
    assert.deepEqual(r.mismatches, [], 'a mutation inside a 15-bar bucket must be picked up exactly');
});

test('C3 CORRECTNESS 1m->1h: exact across a 60-bar bucket', () => {
    const r = runReplay('1h', 8000, 40);
    assert.deepEqual(r.mismatches, [], '1h buckets must stay exact');
});

test('C4 the full-resample rate collapses (this is the fix)', () => {
    const fixed = runReplay('15m', 25583, 60);
    const legacy = runReplay('15m', 25583, 60, { disabled: true });
    // Legacy is ~0.8, not 1.0: the ticks where a bar CLOSES grow the length by exactly one
    // and are caught by the pre-existing incremental branch. Only the forming-bar ticks —
    // 4 in every 5 here — fell through to a full resample.
    assert.ok(legacy.fullResamplesPerEvent > 0.75,
        `legacy must resample fully on the forming-bar ticks, got ${legacy.fullResamplesPerEvent}/event`);
    assert.ok(fixed.fullResamplesPerEvent < 0.05,
        `expected the full-resample rate to collapse to ~0, got ${fixed.fullResamplesPerEvent}/event`);
});

test('C5 KILL-SWITCH is truthy-disabling and re-read per call', () => {
    const src = readFileSync(PIPELINE, 'utf8');
    assert.ok(!/__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1\s*===\s*true/.test(src),
        'must not use === true');
    for (const truthy of [true, 1, 'yes', 'true', {}, [], '0']) {
        globalThis.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1 = truthy;
        const host = new HostCtor();
        host.currentTimeframe = '15m';
        const p = new ChartDataPipeline(host);
        let calls = 0;
        const real = host._resampleDataFull.bind(host);
        host._resampleDataFull = (...a) => { calls++; return real(...a); };
        const s = makeBars(600);
        p.getResampledSeries(s, '15m', 1);
        s[s.length - 1].c += 1;
        p.getResampledSeries(s, '15m', 2);
        assert.equal(calls, 2, `truthy ${JSON.stringify(truthy)} must force the legacy full resample`);
    }
    globalThis.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1 = undefined;
});

test('C6 FLAG-03 the OFF arm still produces a correct, usable series', () => {
    const r = runReplay('15m', 4000, 30, { disabled: true });
    assert.deepEqual(r.mismatches, [], 'disabled arm must still be correct');
    assert.ok(r.fullResamplesPerEvent > 0.75, 'disabled arm must take the legacy full-resample path');
});

test('C7 falls through to a full resample when the tail bucket does not match', () => {
    // A weekly timeframe whose bucketing does not follow floor(t/tfMs)*tfMs must not be
    // served from the refresh branch with a fabricated bucket start.
    const r = runReplay('1w', 20000, 20);
    assert.deepEqual(r.mismatches, [], 'weekly must stay exact even if that means falling through');
});

test('C7b the tail-bucket guard: last bar CROSSING into a new bucket without the length changing must not overwrite the cached tail', () => {
    // Found by mutant M2 surviving: nothing exercised a forming bar whose TIMESTAMP moves
    // into a different bucket while the array length stays the same. Without the guard the
    // branch rewrites the existing tail bucket instead of falling through, silently losing
    // the previous bucket and mislabelling the new one.
    const host = new HostCtor();
    host.currentTimeframe = '15m';
    const pipeline = new ChartDataPipeline(host);
    const realFull = host._resampleDataFull.bind(host);

    const source = makeBars(600);                 // 1m bars -> 15m buckets
    pipeline.getResampledSeries(source, '15m', 1);

    // Move the final bar forward by a full bucket WITHOUT appending anything.
    const last = source[source.length - 1];
    last.t += 15 * 60_000;

    const got = pipeline.getResampledSeries(source, '15m', 2);
    const expected = realFull(source, '15m');
    assert.equal(JSON.stringify(got), JSON.stringify(expected),
        'a bucket-crossing forming bar must fall through to a full resample, not refresh the old tail');
});

test('C8 MEASUREMENT: before/after in ms/s, stamped with bar count and trade count', () => {
    const rows = [];
    for (const [tf, bars] of [['1m', 25583], ['15m', 25583], ['1h', 25583], ['1m', 36104]]) {
        const legacy = runReplay(tf, bars, 60, { disabled: true });
        const fixed = runReplay(tf, bars, 60);
        rows.push({
            tf,
            bars,
            trades: WORKLOAD.trades,
            legacy_ms_per_s: legacy.msPerSecondAchieved,
            fixed_ms_per_s: fixed.msPerSecondAchieved,
            saved_ms_per_s: +(legacy.msPerSecondAchieved - fixed.msPerSecondAchieved).toFixed(1),
            // Relative win is rate-independent: the event rate cancels in the ratio, so this is the
            // one number that survives a re-measurement of the cadence.
            relative_win: +(legacy.msPerSecondAchieved / Math.max(fixed.msPerSecondAchieved, 1e-9)).toFixed(1),
            legacy_ms_per_s_at_requested_rate: legacy.msPerSecondRequested,
        });
    }
    console.log(`\nMONSTER-2 before/after — STAMP: trades=${WORKLOAD.trades}, ticks=${WORKLOAD.ticksMeasured}, `
        + `achieved rate=${ACHIEVED_EVENT_RATE}/s, resamples/event=${RESAMPLES_PER_EVENT}`);
    console.log(`  (${WORKLOAD.note})`);
    for (const r of rows) {
        console.log(`  ${r.tf} @ ${r.bars} bars, ${r.trades} trades: `
            + `${r.legacy_ms_per_s} -> ${r.fixed_ms_per_s} ms/s  (saved ${r.saved_ms_per_s}, ${r.relative_win}x)`);
    }
    assert.ok(rows.every((r) => r.saved_ms_per_s > 0), 'every configuration must improve');
    assert.ok(rows.every((r) => r.relative_win > 5), 'the relative win is the rate-independent claim');
});

test('C8b the published figure is the ACHIEVED rate, not the requested one', () => {
    // The requested rate is what getCandlePlaybackCadence asks for; a saturated thread delivers far
    // less. Publishing the requested figure overstates the absolute saving by ~4x, which is exactly
    // what happened the first time these numbers went out.
    assert.ok(ACHIEVED_EVENT_RATE < REQUESTED_EVENT_RATE,
        'achieved rate must be the smaller, measured one');
    const r = runReplay('1m', 25583, 20, { disabled: true });
    assert.ok(r.msPerSecondAchieved < r.msPerSecondRequested,
        'the published ms/s must be derived from the achieved rate');
    const ratio = r.msPerSecondRequested / r.msPerSecondAchieved;
    assert.ok(Math.abs(ratio - REQUESTED_EVENT_RATE / ACHIEVED_EVENT_RATE) < 0.01,
        'the two figures must differ by exactly the rate ratio, so they can be reconciled');
});

test('C8c the stamp is present and names a trade count, so a re-run cannot be compared blind', () => {
    // Two correct measurements of this function disagreed 4x on workload alone. A figure quoted
    // without its trade count is not comparable to one taken in a trade-bearing session.
    assert.equal(typeof WORKLOAD.trades, 'number', 'trade count must be declared, not implied');
    assert.equal(WORKLOAD.trades, 0, 'these numbers are the zero-order workload');
    assert.ok(Object.isFrozen(WORKLOAD), 'the stamp must not be mutable by a later case');
    const src = readFileSync(new URL(import.meta.url), 'utf8');
    assert.ok(/trades=\$\{WORKLOAD\.trades\}/.test(src),
        'the printed report must carry the trade count, not just the source');
    assert.ok(/\$\{r\.bars\} bars, \$\{r\.trades\} trades/.test(src),
        'every published row must carry both bar count and trade count');
});

test('C9 mirror carries the identical pipeline', () => {
    const a = readFileSync(PIPELINE, 'utf8');
    const b = readFileSync(path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'chart-data-pipeline.js'), 'utf8');
    assert.equal(a, b, 'mirrors must be byte-identical');
});
