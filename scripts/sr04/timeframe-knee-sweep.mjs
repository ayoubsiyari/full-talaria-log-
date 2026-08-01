/**
 * A/SR-04 — TIMEFRAME KNEE SWEEP.
 *
 * Question (Director, 20:37): does the knee move with the per-timeframe cap, or sit at the
 * same bar count regardless? That distinguishes "the missing 82 ms scales with VISIBLE bars"
 * from "it scales with something else and is a third mechanism".
 *
 * Method: drive the REAL buildDisplaySeries at B's measured geometry (plotWidth 1478,
 * spacing 7.0 px => pixelLod FALSE) and sweep resident bars across four timeframes, holding
 * geometry fixed. Records, per point: resampled length, DISPLAY OUTPUT length, which branch
 * produced it, and per-event cost.
 *
 * Identifies the mechanism by scaling behaviour, not by reading source.
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const PIPELINE = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-data-pipeline.js');

function extractMethod(src, name) {
    const re = new RegExp(`^\\s{4}${name}\\s*\\(`, 'm');
    const m = re.exec(src);
    if (!m) return null;
    const start = m.index;
    let i = src.indexOf('{', start);
    let depth = 0, inStr = null, inLine = false, inBlock = false, inRe = false, prev = '';
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
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
        if (!/\s/.test(c)) prev = c;
    }
    return null;
}

const chartSrc = readFileSync(CHART_JS, 'utf8');
const WANTED = [
    '_resampleDataFull', '_prepareBarsForResampling', 'parseTimeframe',
    '_normalizeViewportBarRange', '_getMaxBarsOnScreen', '_aggregateVisibleOhlcvBuckets',
];
const extracted = {}, missing = [];
for (const n of WANTED) {
    const b = extractMethod(chartSrc, n);
    if (b) extracted[n] = b; else missing.push(n);
}

const HostCtor = new Function(`
    "use strict";
    function _talariaM20Q9McDiagCountersDisabled() { return true; }
    return class ExtractedHost {
        constructor() { this._mcDiag = null; }
        ${Object.values(extracted).join('\n')}
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

/** B's measured geometry. margin {t:0,r:60,b:30,l:0} => plotWidth = w - 60. */
const PLOT_WIDTH = 1478;
const SPACING = 7.0;            // B measured 7.0 px => pixelLod false (7.0 >= 2)

function measure(tf, residentBars, { spacing = SPACING, backtest = true, offsetX = 0 } = {}) {
    const host = new HostCtor();
    host.w = PLOT_WIDTH + 60;
    host.margin = { t: 0, r: 60, b: 30, l: 0 };
    host.currentTimeframe = tf;
    host.dataVersion = 0;
    host.offsetX = offsetX;
    host.candleWidth = 5;
    host.isBacktestMode = backtest;
    host.getCandleSpacing = () => spacing;
    host._shouldUseDisplayPipeline = () => true;
    host._isInteractionFastRender = () => false;
    host._getRawDataCap = () => 1e9;
    host._REPLAY_RAW_CAP = 1e9;
    host._RAW_DATA_CAP = 1e9;

    const pipeline = new ChartDataPipeline(host);

    // Branch attribution by counting real calls, not by inference.
    let pixelAggCalls = 0, fullResamples = 0;
    const realAgg = pipeline._pixelSlotAggregateFromRange.bind(pipeline);
    pipeline._pixelSlotAggregateFromRange = function (...a) { pixelAggCalls++; return realAgg(...a); };
    const realFull = host._resampleDataFull.bind(host);
    host._resampleDataFull = function (...a) { fullResamples++; return realFull(...a); };

    const source = makeBars(residentBars);
    host.rawData = source;
    host.data = source;

    pipeline.buildDisplaySeries({ source, timeframe: tf, dataVersion: host.dataVersion });  // warm

    const REPS = 12;
    const times = [];
    const fullAtWarm = fullResamples;
    let display = null, resampledLen = 0;
    for (let r = 0; r < REPS; r++) {
        host.dataVersion += 1;                       // replay bumps it every tick
        const aggBefore = pixelAggCalls;
        const t0 = performance.now();
        display = pipeline.buildDisplaySeries({ source, timeframe: tf, dataVersion: host.dataVersion });
        const t1 = performance.now();
        times.push(t1 - t0);
        if (r === REPS - 1) {
            resampledLen = pipeline._resampleCache.result ? pipeline._resampleCache.result.length : -1;
            var aggFired = pixelAggCalls > aggBefore;
        }
    }
    times.sort((a, b) => a - b);
    return {
        tf, residentBars,
        resampledLen,
        displayLen: Array.isArray(display) ? display.length : -1,
        branch: aggFired ? 'pixelAggregate' : 'direct',
        fullResamplesPerEvent: +(((fullResamples - fullAtWarm) / REPS).toFixed(3)),
        spacing,
        medianMs: +times[Math.floor(times.length / 2)].toFixed(4),
        maxMs: +times[times.length - 1].toFixed(4),
    };
}

const results = {
    generatedAt: new Date().toISOString(),
    geometry: { plotWidth: PLOT_WIDTH, spacing: SPACING, pixelLodActive: SPACING < 2, offsetX: 0 },
    extractedMethods: Object.keys(extracted),
    missingMethods: missing,
    caps: {},
    sweep: [],
    branchTriggerProbe: [],
};

// Record the real per-TF caps from the extracted chart.js method.
{
    const h = new HostCtor();
    if (typeof h._getMaxBarsOnScreen === 'function') {
        for (const tf of ['1m', '15m', '1h', '1d', '1w']) {
            try { results.caps[tf] = h._getMaxBarsOnScreen(tf); } catch (e) { results.caps[tf] = `ERR ${e.message}`; }
        }
    }
}

const LADDER = [500, 1000, 2000, 4000, 8000, 16000, 25583, 36104, 60000];
for (const tf of ['1m', '1h', '1d', '1w']) {
    for (const bars of LADDER) results.sweep.push(measure(tf, bars));
}

// Probe what actually flips the branch: sweep spacing at fixed resident bars.
for (const spacing of [0.5, 1.0, 1.9, 2.0, 3.0, 7.0, 12.0]) {
    results.branchTriggerProbe.push(measure('1m', 25583, { spacing }));
}

console.log(JSON.stringify(results, null, 2));
