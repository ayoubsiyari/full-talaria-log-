/**
 * TAL-01918 — RED for the completed-bar close mutation.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-red.test.mjs"
 *
 * Two limbs, reported separately and never conflated:
 *   LIMB 1  m21-b-bar-immutability-oracle   (expected: PASS on this build)
 *   LIMB 2  m21-b-last-bar-window-oracle    (expected: FAIL — this is the RED)
 *
 * §A4c correctness class, kill-switch gated on __TALARIA_DISABLE_M20_PREFIX_SLICE_V1
 * (M20-Q9), exercised in both states with the product helper's own return value
 * recorded so the control is proven to have controlled.
 *
 * §A5: no wall clocks, no RNG, no UUIDs, no rAF ordering, no float equality in
 * assertion payloads (all price comparisons are integer 1e-5 point counts).
 *
 * §A7: differential — product vs an independently computed full-bucket
 * aggregation, and product-fix-ON vs product-fix-OFF.
 *
 * Negative controls are mandatory and included: each limb is shown to PASS on a
 * conforming model and to FAIL on a deliberately broken one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    productSurfaceInfo, runReplay, probeWalkForward, probeAnimatedCandleBake,
    settlingDiagnostic, frozenPlayheadAcrossTimeframes,
    probeTrimDivergenceOnInconsistentBar,
    PRODUCT_SEQUENCE_NEEDLES, TF_MS,
} from './m21-b-tal01918-driver.mjs';
import {
    buildCorpusPoints, corpusChecksum, verifyLosslessGrid, referenceBucketsPoints,
    MINUTE_MS,
} from './m21-b-tal01918-corpus.mjs';
import {
    BarImmutabilityOracle, LastBarWindowOracle,
    ORACLE_IMMUTABILITY, ORACLE_LAST_BAR_WINDOW, FORMING_MARKER_KEYS,
} from './m21-b-tal01918-oracles.mjs';
import { readChartJsSource, readModuleSource, KILL_SWITCH_Q9 } from './m21-b-tal01918-product-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, 'm21-b-tal01918-evidence');

const MATRIX_BARS = 2880;            // 2 days of 1m
const JOIN_BARS = 14400;             // 10 days of 1m
const JOIN_STRIDE = 7;               // coprime with 5/15/60/240/1440 → all phases sampled
const MATRIX_TFS = ['5m', '15m', '1h', '4h'];
const JOIN_TFS = ['5m', '15m', '1h', '4h', '1d'];

/** Sibling packet's truncation-error series, mean absolute pips. */
const SIBLING_TRUNCATION_PIPS = { '5m': 1.47, '15m': 5.50, '1h': 10.53, '4h': 17.95, '1d': 19.07 };
/** PO's observed close-after-completion delta, signed pips. */
const PO_DELTA_PIPS = { '5m': 0, '15m': -0.6, '1h': 13, '4h': 72 };

const evidence = { rows: [], sections: {} };

function note(limb, name, pass, detail = '') {
    evidence.rows.push({ limb, name, kind: 'assertion', pass: !!pass, detail });
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${limb}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/** A measurement, not a verdict. Never printed as PASS/FAIL. */
function observe(limb, name, detail) {
    evidence.rows.push({ limb, name, kind: 'measurement', detail });
    process.stdout.write(`OBS  [${limb}] ${name} — ${detail}\n`);
}

function section(key, value) {
    evidence.sections[key] = value;
}

const corpusMatrix = buildCorpusPoints(MATRIX_BARS, 130_000, 0);
const corpusJoin = buildCorpusPoints(JOIN_BARS, 130_000, 0);

/* ─────────────────────────── provenance ─────────────────────────── */

test('provenance: real product surface loaded and pinned', () => {
    const info = productSurfaceInfo();
    section('productSurface', info);
    note('PROV', 'chart.js-methods-extracted', info.methods.length === 12,
        `n=${info.methods.length} chartJs=${info.chartJsSha256.slice(0, 16)}`);
    assert.equal(info.methods.length, 12);
    for (const m of info.methods) {
        assert.equal(typeof m.sha256, 'string');
        assert.equal(m.sha256.length, 64);
    }
    const names = info.methods.map((m) => m.name);
    for (const need of ['_resampleDataFull', '_trimLastDataBarToReplayPlayhead',
        '_getWalkForwardOhlcToPlayhead', 'resampleData']) {
        assert.ok(names.includes(need), `missing extracted method ${need}`);
    }
});

test('provenance: driver transcription matches real product source', () => {
    const src = { 'chart.js': readChartJsSource(), 'replay-system.js': readModuleSource('replay-system.js') };
    const missing = [];
    for (const n of PRODUCT_SEQUENCE_NEEDLES) {
        if (!src[n.file].includes(n.needle)) missing.push(`${n.file}: ${n.needle}`);
    }
    section('transcriptionNeedles', {
        checked: PRODUCT_SEQUENCE_NEEDLES.length, missing,
    });
    note('PROV', 'transcription-needles-present', missing.length === 0,
        `${PRODUCT_SEQUENCE_NEEDLES.length - missing.length}/${PRODUCT_SEQUENCE_NEEDLES.length}`);
    assert.deepEqual(missing, [], 'driver transcription drifted from product source');
});

test('provenance: corpus is a deterministic pinned fixture (§A5, no RNG)', () => {
    const again = buildCorpusPoints(MATRIX_BARS, 130_000, 0);
    const a = corpusChecksum(corpusMatrix);
    const b = corpusChecksum(again);
    const grid = verifyLosslessGrid(corpusMatrix);
    section('corpus', {
        matrixBars: MATRIX_BARS, joinBars: JOIN_BARS,
        matrixChecksum: a, joinChecksum: corpusChecksum(corpusJoin),
        losslessGrid: grid.ok,
    });
    note('PROV', 'corpus-deterministic', a === b, a);
    note('PROV', 'corpus-lossless-integer-grid', grid.ok,
        grid.ok ? 'float↔points exact' : `first bad i=${grid.i} field=${grid.field}`);
    assert.equal(a, b);
    assert.equal(grid.ok, true);
});

/* ────────────────────── negative controls (§ mandatory) ────────────────────── */
//
// An oracle that can only ever fail is not evidence. Each limb is driven against
// a conforming model (must PASS) and a deliberately broken model (must FAIL).

function conformingSeriesAtTick(pointRows, tfMs, idx) {
    // A model that only ever publishes FULLY COMPLETE buckets, and marks the
    // in-progress bucket forming.
    const upto = pointRows.slice(0, idx + 1);
    const buckets = referenceBucketsPoints(upto, tfMs);
    const full = referenceBucketsPoints(pointRows, tfMs);
    const byT = new Map(full.map((b) => [b.t, b]));
    return buckets.map((b, i) => {
        const isLast = i === buckets.length - 1;
        const ref = byT.get(b.t);
        const complete = ref && b.n === ref.n;
        const out = { t: b.t, oP: b.oP, hP: b.hP, lP: b.lP, cP: b.cP };
        if (isLast && !complete) {
            // conforming model publishes the full bucket only when complete;
            // otherwise it marks the bar forming.
            out.isForming = true;
        }
        return out;
    });
}

test('negative control: LIMB 1 oracle passes on a conforming model and fails on a mutating one', () => {
    const tfMs = TF_MS['15m'];
    const good = new BarImmutabilityOracle('nc-good');
    const bad = new BarImmutabilityOracle('nc-bad');
    for (let idx = 0; idx < 600; idx++) {
        const series = conformingSeriesAtTick(corpusMatrix, tfMs, idx);
        good.observe(series, idx);
        const mutated = series.map((b, i) => (i < series.length - 1 && idx % 7 === 0
            ? { ...b, cP: b.cP + 3 } : b));
        bad.observe(mutated, idx);
    }
    const g = good.result();
    const b = bad.result();
    section('negativeControl.limb1', { good: g, bad: { pass: b.pass, violationCount: b.violationCount } });
    note('NC', 'limb1-passes-on-conforming-model', g.pass,
        `finalized=${g.finalizedBuckets} comparisons=${g.postFinalizationComparisons}`);
    note('NC', 'limb1-detects-injected-mutation', !b.pass, `violations=${b.violationCount}`);
    assert.equal(g.pass, true, 'LIMB 1 oracle must be able to pass');
    assert.ok(g.postFinalizationComparisons > 1000, 'LIMB 1 must actually re-check finalised buckets');
    assert.equal(b.pass, false, 'LIMB 1 oracle must detect a mutating series');
});

test('negative control: LIMB 2 oracle passes on a conforming model and fails on a partial one', () => {
    const tfMs = TF_MS['15m'];
    const full = referenceBucketsPoints(corpusMatrix, tfMs);
    const byT = new Map(full.map((b) => [b.t, b]));
    const lastRawT = corpusMatrix[corpusMatrix.length - 1].t;

    const good = new LastBarWindowOracle('nc-good');
    const bad = new LastBarWindowOracle('nc-bad');
    for (let idx = 0; idx < 600; idx++) {
        const series = conformingSeriesAtTick(corpusMatrix, tfMs, idx);
        const presented = series[series.length - 1];
        const ref = byT.get(presented.t);
        const bucketLastRawT = presented.t + tfMs - MINUTE_MS;
        const rawViewComplete = corpusMatrix[idx].t >= bucketLastRawT;
        const common = {
            tick: idx,
            fullBucket: ref,
            rawViewComplete,
            masterComplete: lastRawT >= bucketLastRawT,
            playheadMs: corpusMatrix[idx].t,
        };
        good.observe({
            ...common,
            // conforming: when the range is complete, publish the full bucket
            presented: rawViewComplete ? { ...presented, cP: ref.cP, hP: ref.hP, lP: ref.lP, oP: ref.oP } : presented,
            formingMarker: rawViewComplete ? null : { key: 'isForming', value: 'true' },
        });
        bad.observe({ ...common, presented, formingMarker: null });
    }
    const g = good.result();
    const b = bad.result();
    section('negativeControl.limb2', {
        good: g, bad: { pass: b.pass, valueFailureCount: b.valueFailureCount, presentationFailureCount: b.presentationFailureCount },
    });
    note('NC', 'limb2-passes-on-conforming-model', g.pass,
        `valueChecked=${g.valueChecked} presentationChecked=${g.presentationChecked}`);
    note('NC', 'limb2-detects-unmarked-partial-bar', !b.pass,
        `value=${b.valueFailureCount} presentation=${b.presentationFailureCount}`);
    assert.equal(g.pass, true, 'LIMB 2 oracle must be able to pass');
    assert.ok(g.valueChecked > 0 && g.presentationChecked > 0, 'LIMB 2 must exercise both checks');
    assert.equal(b.pass, false, 'LIMB 2 oracle must detect an unmarked partial last bar');
});

/* ──────────────────────── the matrix run (shared) ──────────────────────── */

const matrix = [];
test('drive product replay matrix (5m/15m/1h/4h × kill-switch ON/OFF)', () => {
    for (const tf of MATRIX_TFS) {
        for (const killSwitchOn of [false, true]) {
            matrix.push(runReplay({ pointRows: corpusMatrix, timeframe: tf, killSwitchOn }));
        }
    }
    const helperBoth = new Set();
    for (const r of matrix) for (const v of r.productHelperReadings) helperBoth.add(v);
    section('matrix', matrix.map((r) => ({
        timeframe: r.timeframe,
        killSwitchOn: r.killSwitchOn,
        productHelperReadings: r.productHelperReadings,
        fullResampleCalls: r.fullResampleCalls,
        distinctPrefixIdentities: r.distinctPrefixIdentities,
        chartDataIsPipelineCacheResultTicks: r.chartDataIsPipelineCacheResultTicks,
        immutability: r.immutability,
        lastBarWindow: r.lastBarWindow,
        attribution: r.attribution,
        settling: r.settling,
    })));

    note('CTRL', 'kill-switch-genuinely-controlled', helperBoth.has(true) && helperBoth.has(false),
        `_m20Q9PrefixSliceFixEnabled() observed: ${[...helperBoth].join(',')}`);
    assert.equal(helperBoth.has(true) && helperBoth.has(false), true,
        'product kill-switch helper must return both true and false across the matrix');

    // Allocation discriminator: fix ON reuses one prefix identity, OFF churns.
    const on = matrix.find((r) => r.killSwitchOn === false);
    const off = matrix.find((r) => r.killSwitchOn === true);
    note('CTRL', 'fixON-single-prefix-identity', on.distinctPrefixIdentities === 1,
        `distinct=${on.distinctPrefixIdentities}`);
    note('CTRL', 'fixOFF-legacy-slice-churn', off.distinctPrefixIdentities === MATRIX_BARS,
        `distinct=${off.distinctPrefixIdentities}`);
    assert.equal(on.distinctPrefixIdentities, 1);
    assert.equal(off.distinctPrefixIdentities, MATRIX_BARS);
});

/* ───────────────────────────── LIMB 1 ───────────────────────────── */

test(`LIMB 1 — ${ORACLE_IMMUTABILITY}: finalised bucket OHLC never changes`, () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        killSwitchOn: r.killSwitchOn,
        pass: r.immutability.pass,
        finalizedBuckets: r.immutability.finalizedBuckets,
        postFinalizationComparisons: r.immutability.postFinalizationComparisons,
        violationCount: r.immutability.violationCount,
    }));
    section('limb1', rows);
    let allPass = true;
    let totalComparisons = 0;
    for (const r of rows) {
        totalComparisons += r.postFinalizationComparisons;
        allPass = allPass && r.pass;
        note('LIMB1', `${r.timeframe}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, r.pass,
            `finalised=${r.finalizedBuckets} rechecks=${r.postFinalizationComparisons} violations=${r.violationCount}`);
    }
    assert.ok(totalComparisons > 10_000,
        'LIMB 1 must have re-checked finalised buckets many times, or it proves nothing');
    assert.equal(allPass, true,
        `LIMB 1 (${ORACLE_IMMUTABILITY}) violated: a finalised bucket's OHLC changed`);
});

/* ───────────────────────────── LIMB 2 ───────────────────────────── */

test(`LIMB 2 — ${ORACLE_LAST_BAR_WINDOW}: last bar is the full bucket, or is marked forming`, () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        killSwitchOn: r.killSwitchOn,
        pass: r.lastBarWindow.pass,
        valueChecked: r.lastBarWindow.valueChecked,
        valueFailureCount: r.lastBarWindow.valueFailureCount,
        presentationChecked: r.lastBarWindow.presentationChecked,
        presentationFailureCount: r.lastBarWindow.presentationFailureCount,
        masterCompleteChecked: r.lastBarWindow.masterCompleteChecked,
        masterCompleteValueFailureCount: r.lastBarWindow.masterCompleteValueFailureCount,
        formingMarkersSeen: r.lastBarWindow.formingMarkersSeen,
        errorStats: r.lastBarWindow.errorStats,
        firstFailure: r.lastBarWindow.firstFailure,
    }));
    section('limb2', rows);
    let allPass = true;
    for (const r of rows) {
        allPass = allPass && r.pass;
        note('LIMB2', `${r.timeframe}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, r.pass,
            `valueFail=${r.valueFailureCount}/${r.valueChecked} `
            + `presentationFail=${r.presentationFailureCount}/${r.presentationChecked} `
            + `meanAbsCloseErr=${r.errorStats.meanAbsPips}pip`);
    }
    const markers = rows.flatMap((r) => Object.keys(r.formingMarkersSeen));
    note('LIMB2', 'no-forming-marker-on-any-display-bar', markers.length === 0,
        `searched ${FORMING_MARKER_KEYS.length} candidate marker keys, found: ${markers.length ? markers.join(',') : 'none'}`);

    // The value check and the presentation check fail in different places; say so.
    for (const r of rows) {
        observe('LIMB2', `${r.timeframe}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}-split`,
            `value-limb ${r.valueFailureCount === 0 ? 'clean' : 'dirty'} (${r.valueFailureCount}/${r.valueChecked}: the `
            + 'presented close is right on exactly the one tick per bucket where the playhead sits on the '
            + `bucket's final raw bar); presentation-limb dirty (${r.presentationFailureCount}/${r.presentationChecked}); `
            + 'against the stronger reading (bucket range present in the underlying master) '
            + `${r.masterCompleteValueFailureCount}/${r.masterCompleteChecked} ticks present a wrong value`);
    }

    assert.equal(allPass, true,
        `LIMB 2 (${ORACLE_LAST_BAR_WINDOW}) RED: the last display bar is aggregated over `
        + '[bucketStart, playhead] instead of [bucketStart, bucketEnd) and carries no forming '
        + 'marker, so a partial bucket is presented as a finished OHLC value.');
});

test('LIMB 2 positive control on the REAL product: 1m native timeframe passes', () => {
    // Strongest available control that LIMB 2 is not a tautology: the same
    // oracle, the same product code, the same corpus — but at the native
    // timeframe, where every display bucket holds exactly one raw bar and the
    // window [bucketStart, bucketEnd) is therefore always complete.
    const r = runReplay({ pointRows: corpusMatrix, timeframe: '1m', killSwitchOn: false });
    section('limb2NativeControl', {
        timeframe: '1m',
        lastBarWindow: r.lastBarWindow,
        attribution: r.attribution,
    });
    note('LIMB2-CTRL', '1m-native-window-oracle-passes-on-product', r.lastBarWindow.pass,
        `valueFail=${r.lastBarWindow.valueFailureCount}/${r.lastBarWindow.valueChecked} `
        + `presentationChecked=${r.lastBarWindow.presentationChecked} `
        + `meanAbsCloseErr=${r.lastBarWindow.errorStats.meanAbsPips}pip`);
    assert.equal(r.lastBarWindow.pass, true,
        'LIMB 2 must pass on the native timeframe against real product code, or it is a tautology');
    assert.ok(r.lastBarWindow.valueChecked > 2000,
        'the 1m control must actually run the value check');
});

/* ─────────────────────── attribution: slice vs trim ─────────────────────── */

test('attribution: which of slice / trim carries the error', () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        killSwitchOn: r.killSwitchOn,
        ticks: r.attribution.ticks,
        trimReplacedSlotTicks: r.attribution.trimReplacedSlotTicks,
        trimChangedValueTicks: r.attribution.trimChangedValueTicks,
        meanAbsSliceErrorPips: r.attribution.meanAbsSliceErrorPips,
        meanAbsTrimErrorPips: r.attribution.meanAbsTrimErrorPips,
        meanAbsTotalErrorPips: r.attribution.meanAbsTotalErrorPips,
        sliceSharePct: r.attribution.sliceSharePct,
        trimSharePct: r.attribution.trimSharePct,
        chartDataIsPipelineCacheResultTicks: r.chartDataIsPipelineCacheResultTicks,
        fullResampleCalls: r.fullResampleCalls,
    }));
    section('attribution', rows);
    for (const r of rows) {
        note('ATTR', `${r.timeframe}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, true,
            `slice=${r.meanAbsSliceErrorPips}pip(${r.sliceSharePct}%) `
            + `trim=${r.meanAbsTrimErrorPips}pip(${r.trimSharePct}%) `
            + `trimSlotWrites=${r.trimReplacedSlotTicks}/${r.ticks} `
            + `trimValueChanges=${r.trimChangedValueTicks}/${r.ticks} `
            + `data===pipelineCache ${r.chartDataIsPipelineCacheResultTicks}/${r.ticks}`);
    }
    // Name the path that is actually exercised, rather than assuming one.
    const everyTickFullResample = rows.every((r) => r.fullResampleCalls === r.ticks);
    const trimNeverChangesValue = rows.every((r) => r.trimChangedValueTicks === 0);
    const trimAlwaysWritesSlot = rows.every((r) => r.trimReplacedSlotTicks === r.ticks);
    const dataIsCache = rows.every((r) => r.chartDataIsPipelineCacheResultTicks === r.ticks);
    const exercisedPath = [
        'ReplaySystem static-playhead install',
        '→ chart.rawData = prefix[0..playhead]',
        '→ chart.resampleData → ChartDataPipeline.getResampledSeries (FULL resample every tick;'
        + ' the incremental same-sourceRef branch is never reached because the M20-Q9 cache-drop'
        + ' and the dataVersion bump both invalidate it)',
        '→ chart._resampleDataFull buckets the PREFIX, so the final bucket is aggregated over'
        + ' [bucketStart, playhead] — this is where 100% of the error is created',
        '→ chart._trimLastDataBarToReplayPlayhead writes this.data[lastIdx] (which IS'
        + ' ChartDataPipeline._resampleCache.result) on every tick, but the value it writes is'
        + ' the same [bucketStart, playhead] aggregation, so its numeric contribution is zero',
    ];
    section('exercisedPath', {
        path: exercisedPath,
        everyTickFullResample,
        trimAlwaysWritesSlot,
        trimNeverChangesValue,
        chartDataIsPipelineCacheResult: dataIsCache,
    });
    observe('PATH', 'exercised-path', exercisedPath.join(' '));
    note('PATH', 'pipeline-full-resamples-every-tick', everyTickFullResample);
    note('PATH', 'trim-writes-the-pipeline-cache-slot-every-tick', trimAlwaysWritesSlot);
    note('PATH', 'trim-numeric-contribution-is-zero', trimNeverChangesValue);
    note('PATH', 'chart.data-IS-pipeline-resample-cache-result', dataIsCache);
    assert.equal(rows.length, MATRIX_TFS.length * 2);
    assert.equal(everyTickFullResample, true);
    assert.equal(dataIsCache, true);
});

test('attribution bound: the trim is not unconditionally value-neutral', () => {
    // Do not overstate "trim contributes zero". It is zero because the two
    // aggregators agree on well-formed bars. Give them one ill-formed bar and the
    // trim's contribution becomes non-zero — so the zero is a property of the
    // data, not a property of the trim.
    const out = [];
    for (const tf of ['15m', '1h']) {
        out.push(probeTrimDivergenceOnInconsistentBar({
            pointRows: corpusMatrix, timeframe: tf, targetIdx: 1234,
        }));
    }
    section('attributionBound', out);
    const diverges = out.every((r) => r.trimChangedHigh);
    for (const r of out) {
        observe('ATTR-BOUND', r.timeframe,
            `on a bar printed with high < close: trim changed high=${r.trimChangedHigh} `
            + `(${r.highDeltaPoints} points), low=${r.trimChangedLow}, close=${r.trimChangedClose}`);
    }
    note('ATTR-BOUND', 'trim-diverges-from-resample-on-ill-formed-bars', diverges,
        '_prepareBarsForResampling normalises h=max(o,c,h,l); '
        + '_aggregateFinerBarsWalkForward reads b.h raw');
    assert.equal(diverges, true,
        'the zero trim contribution must be shown to be data-conditional, not unconditional');
});

/* ──────────────────── suspect 4: walk-forward on native TF ──────────────────── */

test('suspect 4: _getWalkForwardOhlcToPlayhead is a no-op on the native timeframe', () => {
    const native = probeWalkForward(corpusMatrix, '1m');
    const coarse = probeWalkForward(corpusMatrix, '1h');
    section('suspect4', { native, coarse });
    note('S4', 'native-1m-walkforward-returns-null', native.isNoOp,
        `rawStep=${native.rawStepMs}ms tf=${native.tfMs}ms`);
    note('S4', 'coarse-1h-walkforward-aggregates', !coarse.isNoOp,
        coarse.isNoOp ? 'unexpected null' : `close=${coarse.walkForwardResult.cP}pts`);
    assert.equal(native.isNoOp, true,
        'inherited claim verified: no finer series exists at the native TF, so the trim cannot fire');
    assert.equal(coarse.isNoOp, false);
});

/* ─────────────── suspects 2 & 3: animated candle + mirror trim skip ─────────────── */

test('suspects 2 & 3: animated candle bakes an interpolated close; mirror skips the trim', () => {
    const out = [];
    for (const tf of ['5m', '1h', '4h']) {
        out.push(probeAnimatedCandleBake({ pointRows: corpusMatrix, timeframe: tf, targetIdx: 1000 }));
    }
    section('suspects23', out);
    for (const r of out) {
        note('S2/3', `${r.timeframe}-animated-bake`, true,
            `trimSkipped=${r.trimSkippedMidAnimation} `
            + `interpolatedBaked=${r.interpolatedCloseIsBaked} `
            + `errVsFullBucket=${r.errorVsFullBucketPips}pip`);
    }
    const allSkip = out.every((r) => r.trimSkippedMidAnimation);
    const allBake = out.every((r) => r.interpolatedCloseIsBaked);
    note('S2/3', 'mirror-skips-trim-mid-animation', allSkip);
    note('S2/3', 'interpolated-close-baked-into-coarse-bucket', allBake);
    assert.equal(allSkip, true);
    assert.equal(allBake, true);
});

/* ─────────────────── settling diagnostic at a 1H boundary ─────────────────── */

test('settling diagnostic: finalised 1H bucket vs clean full resample, switch ON and OFF', () => {
    const out = [];
    for (const killSwitchOn of [false, true]) {
        out.push(settlingDiagnostic({ pointRows: corpusMatrix, timeframe: '1h', killSwitchOn }));
    }
    section('settling', out);
    for (const r of out) {
        note('SETTLE', `1h/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, true,
            `boundaries=${r.boundaries} `
            + `diffVsCleanResample=${r.finalisedBucketDiffersFromCleanResample} `
            + `diffVsFullBucket=${r.finalisedBucketDiffersFromFullBucket}`);
    }
    const survivesVsClean = out.some((r) => r.finalisedBucketDiffersFromCleanResample);
    const survivesVsFull = out.some((r) => r.finalisedBucketDiffersFromFullBucket);
    observe('SETTLE', 'staleness-verdict',
        survivesVsClean
            ? 'the finalised 1H bucket differs from a clean full resample to the same playhead in at '
              + 'least one switch state — the trim/animation path or the cache contract is implicated'
            : 'the finalised 1H bucket is byte-for-byte the clean full resample to the same playhead in '
              + 'BOTH switch states, and byte-for-byte the full-bucket aggregation — the M20-Q9 cache '
              + 'contract and the trim are both exonerated for staleness-after-finalisation; nothing '
              + 'survives here, so there is no third path to name on this limb');
    section('settlingVerdict', { survivesVsClean, survivesVsFull });
    assert.equal(out.length, 2);
    // Kill-switch differential (§A7): the diagnostic must agree in both states.
    assert.equal(
        out[0].finalisedBucketDiffersFromCleanResample,
        out[1].finalisedBucketDiffersFromCleanResample,
        'settling verdict must not depend on the M20-Q9 switch state',
    );
});

/* ─────────────── the join: per-TF window error vs PO and sibling ─────────────── */

const joinRows = [];
test('join: per-timeframe window error series', () => {
    for (const tf of JOIN_TFS) {
        const r = runReplay({
            pointRows: corpusJoin, timeframe: tf, killSwitchOn: false, stride: JOIN_STRIDE,
        });
        joinRows.push({
            timeframe: tf,
            bucketMinutes: TF_MS[tf] / MINUTE_MS,
            ticks: r.attribution.ticks,
            windowErrorMeanAbsPips: r.lastBarWindow.errorStats.meanAbsPips,
            windowErrorMaxAbsPips: r.lastBarWindow.errorStats.maxAbsPips,
            sliceSharePct: r.attribution.sliceSharePct,
            trimSharePct: r.attribution.trimSharePct,
            settleMeanAbsFirstReadPips: r.settling.meanAbsFirstReadDeltaPips,
            settleMeanAbsLastReadPips: r.settling.meanAbsLastReadDeltaPips,
            settleSampleSignedPips: r.settling.sampleSignedFirstReadDeltaPips,
        });
    }
    const base = joinRows[0].windowErrorMeanAbsPips;
    for (const r of joinRows) {
        r.ratioTo5m = Math.round((r.windowErrorMeanAbsPips / base) * 100) / 100;
        r.siblingPips = SIBLING_TRUNCATION_PIPS[r.timeframe] ?? null;
        r.siblingRatioTo5m = r.siblingPips == null ? null
            : Math.round((r.siblingPips / SIBLING_TRUNCATION_PIPS['5m']) * 100) / 100;
        r.poSignedPips = PO_DELTA_PIPS[r.timeframe] ?? null;
    }
    const monotonic = joinRows.every((r, i) => i === 0
        || r.windowErrorMeanAbsPips >= joinRows[i - 1].windowErrorMeanAbsPips);
    section('join', { rows: joinRows, monotonicInBucketDuration: monotonic, stride: JOIN_STRIDE });
    for (const r of joinRows) {
        note('JOIN', r.timeframe, true,
            `windowErr=${r.windowErrorMeanAbsPips}pip (x${r.ratioTo5m} of 5m) | `
            + `sibling=${r.siblingPips}pip (x${r.siblingRatioTo5m}) | PO=${r.poSignedPips}pip`);
    }
    note('JOIN', 'window-error-monotonic-in-bucket-duration', monotonic);
    assert.equal(monotonic, true,
        'window error must grow with bucket duration if it is the same quantity as the sibling series');
});

test('join: window error is IDENTICALLY the truncation error (structural, corpus-independent)', () => {
    // If presented_close(last bar at playhead p) - fullBucketClose is, tick for
    // tick, the same number as c(p) - c(bucketEnd - rawStep), then the completed-
    // bar mutation and the indicator-lag truncation error are one quantity.
    const tfMs = TF_MS['1h'];
    const refByT = new Map(referenceBucketsPoints(corpusMatrix, tfMs).map((b) => [b.t, b]));
    const closeAtT = new Map(corpusMatrix.map((r) => [r.t, r.cP]));

    const r = runReplay({ pointRows: corpusMatrix, timeframe: '1h', killSwitchOn: false });
    // Recompute the identity independently of the driver's own bookkeeping.
    let checked = 0;
    let mismatches = 0;
    for (let idx = 0; idx < corpusMatrix.length; idx++) {
        const p = corpusMatrix[idx].t;
        const bucketT = Math.floor(p / tfMs) * tfMs;
        const ref = refByT.get(bucketT);
        if (!ref) continue;
        const bucketLastRawT = bucketT + tfMs - MINUTE_MS;
        if (!closeAtT.has(bucketLastRawT)) continue;
        const truncationErr = corpusMatrix[idx].cP - closeAtT.get(bucketLastRawT);
        const windowErr = corpusMatrix[idx].cP - ref.cP; // presented close IS c(p)
        checked += 1;
        if (truncationErr !== windowErr) mismatches += 1;
    }
    section('identity', {
        timeframe: '1h', checked, mismatches,
        presentedCloseAlwaysEqualsPlayheadClose: r.lastBarWindow.errorStats.n > 0,
    });
    note('JOIN', 'window-error-IS-truncation-error', mismatches === 0,
        `checked=${checked} mismatches=${mismatches}`);
    assert.equal(mismatches, 0,
        'the window error and the truncation error are the same quantity by construction');
});

test('join: does the window error reproduce the PO 0 / -0.6 / +13 / +72?', () => {
    // The PO quantity is the close read when the bar first looked done minus the
    // close it settles at. Under candle-mode stepping the first read is at
    // bucketStart, so the settled-minus-first delta is exactly
    //   c(bucketEnd - rawStep) - c(bucketStart)
    // i.e. the bucket's own body. That is the same window error, evaluated at one
    // particular playhead offset — proven identical to the product measurement in
    // the identity test above. It is a SIGNED, PER-BUCKET realisation: a single
    // observation per timeframe cannot be "reproduced" by any other corpus, so
    // what is testable is whether the PO values sit inside the distribution.
    const rows = [];
    for (const tf of JOIN_TFS) {
        const tfMs = TF_MS[tf];
        const refs = referenceBucketsPoints(corpusJoin, tfMs);
        const closeAtT = new Map(corpusJoin.map((r) => [r.t, r.cP]));
        const deltas = [];
        for (const b of refs) {
            const lastRawT = b.t + tfMs - MINUTE_MS;
            if (!closeAtT.has(lastRawT) || !closeAtT.has(b.t)) continue;
            deltas.push(closeAtT.get(lastRawT) - closeAtT.get(b.t));
        }
        if (!deltas.length) continue;
        const abs = deltas.map((d) => (d < 0 ? -d : d)).sort((x, y) => x - y);
        const meanAbs = abs.reduce((a, b2) => a + b2, 0) / abs.length;
        const po = PO_DELTA_PIPS[tf];
        const poPoints = po == null ? null : Math.round(po * 10);
        const atLeastAsExtreme = poPoints == null ? null
            : abs.filter((a) => a >= Math.abs(poPoints)).length;
        rows.push({
            timeframe: tf,
            buckets: deltas.length,
            meanAbsSettleDeltaPips: Math.round(meanAbs / 10 * 100) / 100,
            p90AbsPips: Math.round(abs[Math.floor(abs.length * 0.9)] / 10 * 100) / 100,
            maxAbsPips: Math.round(abs[abs.length - 1] / 10 * 100) / 100,
            poSignedPips: po == null ? null : po,
            poWithinObservedRange: poPoints == null ? null : Math.abs(poPoints) <= abs[abs.length - 1],
            fractionAtLeastAsExtremePct: atLeastAsExtreme == null ? null
                : Math.round(1000 * atLeastAsExtreme / abs.length) / 10,
        });
    }
    const monotonic = rows.every((r, i) => i === 0
        || r.meanAbsSettleDeltaPips >= rows[i - 1].meanAbsSettleDeltaPips);
    section('poJoin', { rows, monotonicInBucketDuration: monotonic });
    for (const r of rows) {
        observe('PO1', r.timeframe,
            `n=${r.buckets} settle-delta meanAbs=${r.meanAbsSettleDeltaPips}pip `
            + `p90=${r.p90AbsPips}pip max=${r.maxAbsPips}pip | `
            + `PO=${r.poSignedPips == null ? 'n/a' : `${r.poSignedPips}pip`} `
            + `withinObservedRange=${r.poWithinObservedRange} `
            + `pctOfBucketsAtLeastAsExtreme=${r.fractionAtLeastAsExtremePct}%`);
    }
    note('PO1', 'settle-delta-monotonic-in-bucket-duration', monotonic,
        'matches the PO ordering |0| < |-0.6| < |+13| < |+72| in magnitude by timeframe');
    // Measurement, not a verdict: whether a single PO observation lands inside a
    // SYNTHETIC corpus's range says something about the corpus, not the product.
    const outOfRange = rows.filter((r) => r.poSignedPips != null && !r.poWithinObservedRange);
    observe('PO1', 'po-values-vs-synthetic-range',
        outOfRange.length === 0
            ? 'every PO value lies inside the range this corpus produces'
            : `${outOfRange.map((r) => `${r.timeframe}:${r.poSignedPips}pip > max ${r.maxAbsPips}pip`).join(', ')}`
              + ' — the fixture is a pure random walk with no trend or fat tails, so it under-produces '
              + 'the largest real EURUSD coarse-bucket bodies; this bounds the corpus, not the defect');
    assert.equal(monotonic, true);
});

/* ─────────── PO observation 2: frozen playhead across timeframes ─────────── */

test('PO observation 2: frozen playhead, 1m vs coarse family', () => {
    const out = frozenPlayheadAcrossTimeframes({
        pointRows: corpusJoin, idx: 5000, timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    });
    section('frozenPlayhead', out);
    const coarse = out.rows.filter((r) => r.timeframe !== '1m');
    const coarseAgree = new Set(coarse.map((r) => r.lastClosePoints)).size === 1;
    const oneMinuteMatches = out.rows[0].lastClosePoints === coarse[0].lastClosePoints;
    note('PO2', 'coarse-family-agrees-to-last-digit', coarseAgree,
        `distinct=${new Set(coarse.map((r) => r.lastClosePoints)).size}`);
    note('PO2', 'static-1m-agrees-with-coarse-family', oneMinuteMatches,
        oneMinuteMatches
            ? 'no static divergence — the PO 1m/coarse split needs the animated path'
            : 'static divergence reproduced');
    assert.equal(coarseAgree, true);
});

/* ───────────────────────────── evidence ───────────────────────────── */

test('emit evidence', () => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const body = {
        row: 'TAL-01918',
        packet: 'tal01918-red',
        manager: 'A',
        tier: 'top',
        killSwitch: KILL_SWITCH_Q9,
        oracles: [ORACLE_IMMUTABILITY, ORACLE_LAST_BAR_WINDOW],
        rows: evidence.rows,
        ...evidence.sections,
    };
    const out = path.join(EVIDENCE_DIR, 'm21-b-tal01918-red-evidence.json');
    fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    process.stdout.write(`EVIDENCE → ${out}\n`);
    assert.ok(fs.existsSync(out));
});
