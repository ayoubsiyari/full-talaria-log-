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
        msPerSecondAt62_5: +(mean * 62.5).toFixed(1),
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

test('C8 MEASUREMENT: publish the before/after in ms/s at 62.5 events/s', () => {
    const rows = [];
    for (const [tf, bars] of [['1m', 25583], ['15m', 25583], ['1h', 25583], ['1m', 36104]]) {
        const legacy = runReplay(tf, bars, 60, { disabled: true });
        const fixed = runReplay(tf, bars, 60);
        rows.push({
            tf, bars,
            legacy_ms_per_s: legacy.msPerSecondAt62_5,
            fixed_ms_per_s: fixed.msPerSecondAt62_5,
            saved_ms_per_s: +(legacy.msPerSecondAt62_5 - fixed.msPerSecondAt62_5).toFixed(1),
        });
    }
    console.log('\nMONSTER-2 before/after (ms/s at 62.5 events/s):');
    for (const r of rows) {
        console.log(`  ${r.tf} @ ${r.bars} bars: ${r.legacy_ms_per_s} -> ${r.fixed_ms_per_s} ms/s  (saved ${r.saved_ms_per_s})`);
    }
    assert.ok(rows.every((r) => r.saved_ms_per_s > 0), 'every configuration must improve');
});

test('C9 mirror carries the identical pipeline', () => {
    const a = readFileSync(PIPELINE, 'utf8');
    const b = readFileSync(path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'chart-data-pipeline.js'), 'utf8');
    assert.equal(a, b, 'mirrors must be byte-identical');
});
