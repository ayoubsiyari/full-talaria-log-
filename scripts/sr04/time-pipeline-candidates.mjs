/**
 * A/MONSTER-2 — time the two chart-data-pipeline.js candidates against a replay-shaped tick loop.
 *
 * Answers, with numbers rather than source reading:
 *   (a) Which branch of getResampledSeries actually fires during replay — exact hit,
 *       incremental, or fall-through to a full resample — and how often.
 *   (b) The per-event millisecond cost of each, so the candidate can be compared against
 *       B's ~86 ms/event budget instead of assumed to fill it.
 *
 * Uses the REAL ChartDataPipeline module and the REAL _resampleDataFull /
 * _prepareBarsForResampling extracted from chart.js source. No re-implementation.
 *
 * Positive control: a deliberately identity-BREAKING arm must force 100% full resamples.
 * If the control does not move the branch mix, the harness is not measuring what it claims.
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const PIPELINE = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-data-pipeline.js');

/** Extract a class method by name from source using brace matching. */
function extractMethod(src, name) {
    const re = new RegExp(`^\\s{4}${name}\\s*\\(`, 'm');
    const m = re.exec(src);
    if (!m) throw new Error(`extract failed: ${name} not found`);
    const start = m.index;
    let i = src.indexOf('{', start);
    if (i < 0) throw new Error(`extract failed: no body for ${name}`);
    let depth = 0, inStr = null, inLine = false, inBlock = false, inRe = false, prev = '';
    for (; i < src.length; i++) {
        const c = src[i];
        const n = src[i + 1];
        if (inLine) { if (c === '\n') inLine = false; prev = c; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } prev = c; continue; }
        if (inStr) {
            if (c === '\\') { i++; prev = ''; continue; }
            if (c === inStr) inStr = null;
            prev = c; continue;
        }
        if (inRe) {
            if (c === '\\') { i++; prev = ''; continue; }
            if (c === '[') { while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i++; i++; } }
            else if (c === '/') inRe = false;
            prev = c; continue;
        }
        if (c === '/' && n === '/') { inLine = true; i++; prev = c; continue; }
        if (c === '/' && n === '*') { inBlock = true; i++; prev = c; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
        if (c === '/' && /[=(,:[!&|?{};+\-*%^~<>]/.test(prev)) { inRe = true; prev = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
        if (!/\s/.test(c)) prev = c;
    }
    throw new Error(`extract failed: unbalanced braces for ${name}`);
}

const chartSrc = readFileSync(CHART_JS, 'utf8');
const methods = ['_resampleDataFull', '_prepareBarsForResampling', 'parseTimeframe'];
const bodies = methods.map((n) => extractMethod(chartSrc, n));
for (const [i, b] of bodies.entries()) {
    if (!b || b.length < 40) throw new Error(`extracted body for ${methods[i]} looks wrong (${b.length} chars)`);
}

// Build a host object carrying the real extracted methods.
const HostCtor = new Function(`
    "use strict";
    function _talariaM20Q9McDiagCountersDisabled() { return true; }
    return class ExtractedHost {
        constructor() { this._mcDiag = null; }
        ${bodies.join('\n')}
    };
`)();

const ChartDataPipeline = require(PIPELINE);

function makeBars(n, startMs = Date.UTC(2024, 0, 1), stepMs = 60_000) {
    const out = new Array(n);
    let px = 100;
    for (let i = 0; i < n; i++) {
        const o = px;
        const c = px + Math.sin(i / 7) * 0.4;
        out[i] = { t: startMs + i * stepMs, o, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2, c, v: 1000 + (i % 97) };
        px = c;
    }
    return out;
}

/**
 * Drive a replay-shaped loop: identity-stable source array that grows by exactly one bar
 * per tick, with dataVersion bumped every tick (the replay engine bumps it in 8 places).
 */
function runArm({ label, residentBars, ticks, displayTf, breakIdentity = false }) {
    const host = new HostCtor();
    host.currentTimeframe = displayTf;
    host.dataVersion = 0;

    // EXACT branch attribution: the fall-through branch is the only path that calls
    // chart._resampleDataFull, so count real calls rather than inferring from cache
    // state. An earlier version inferred it and the positive control caught the
    // misattribution — cost moved 500x while the inferred label did not.
    let fullCalls = 0;
    const realFull = host._resampleDataFull.bind(host);
    host._resampleDataFull = function (data, tf) { fullCalls++; return realFull(data, tf); };

    const pipeline = new ChartDataPipeline(host);

    const all = makeBars(residentBars + ticks);
    let source = all.slice(0, residentBars);

    const counts = { exact: 0, incremental: 0, full: 0 };
    const timings = [];

    // Instrument by observing the cache slot rather than by editing the module.
    const cache = pipeline._resampleCache;

    // Warm the cache so tick 1 is steady-state, not first-call.
    pipeline.getResampledSeries(source, displayTf, host.dataVersion);

    for (let k = 0; k < ticks; k++) {
        const nextBar = all[residentBars + k];
        if (breakIdentity) {
            source = source.concat([nextBar]);   // NEW array identity every tick
        } else {
            source.push(nextBar);                 // identity-stable, grows by exactly one
        }
        host.dataVersion += 1;                    // the replay engine's bump

        const resultBefore = cache.result;
        const fullBefore = fullCalls;

        const t0 = performance.now();
        const out = pipeline.getResampledSeries(source, displayTf, host.dataVersion);
        const t1 = performance.now();
        timings.push(t1 - t0);

        if (fullCalls > fullBefore) counts.full++;
        else if (out === resultBefore) counts.exact++;
        else counts.incremental++;
    }

    timings.sort((a, b) => a - b);
    const sum = timings.reduce((a, b) => a + b, 0);
    return {
        label, residentBars, ticks, displayTf,
        counts,
        meanMs: +(sum / timings.length).toFixed(4),
        medianMs: +timings[Math.floor(timings.length / 2)].toFixed(4),
        p95Ms: +timings[Math.floor(timings.length * 0.95)].toFixed(4),
        maxMs: +timings[timings.length - 1].toFixed(4),
        totalMs: +sum.toFixed(2),
    };
}

/** Time the bare .slice() on its own, so the copy is separated from the resample. */
function timeSliceOnly(n, reps = 400) {
    const arr = makeBars(n);
    const t0 = performance.now();
    let sink = 0;
    for (let i = 0; i < reps; i++) sink += arr.slice().length;
    const t1 = performance.now();
    return { bars: n, reps, perSliceMs: +(((t1 - t0) / reps)).toFixed(5), sink };
}

const results = { generatedAt: new Date().toISOString(), arms: [], sliceOnly: [], control: null };

// C's measured span: 6,700 -> 36,104 resident bars. Bracket it.
for (const bars of [6700, 15000, 25583, 36104]) {
    results.arms.push(runArm({ label: `replay ${bars} bars, 1m->1m`, residentBars: bars, ticks: 200, displayTf: '1m' }));
}
// A coarser display timeframe exercises real bucketing rather than a passthrough.
for (const bars of [6700, 25583]) {
    results.arms.push(runArm({ label: `replay ${bars} bars, 1m->15m`, residentBars: bars, ticks: 200, displayTf: '15m' }));
}
for (const n of [6700, 25583, 36104]) results.sliceOnly.push(timeSliceOnly(n));

// POSITIVE CONTROL: breaking source identity must force full resamples on every tick.
results.control = runArm({ label: 'CONTROL identity-broken (must be 100% full)', residentBars: 25583, ticks: 60, displayTf: '15m', breakIdentity: true });

console.log(JSON.stringify(results, null, 2));
