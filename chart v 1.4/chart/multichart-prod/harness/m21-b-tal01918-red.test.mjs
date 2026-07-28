/**
 * TAL-01918 — RED for the completed-bar close mutation.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-red.test.mjs"
 *
 * Two limbs, reported separately and never conflated:
 *   LIMB 1  m21-b-bar-immutability-oracle
 *           SUBJECT: chart.data[length-1], sampled at the LAST tick that bucket
 *           occupies the last slot. NOT length-2, which the trim can structurally
 *           never write and which yields an oracle that passes unconditionally.
 *   LIMB 2  m21-b-last-bar-window-oracle
 *
 * STEP MODE is load-bearing. Under raw stepping the last tick a bucket is last is
 * its final raw bar, so LIMB 1 cannot see the defect whatever its subject. Under
 * product-default coarse (candle-mode) stepping it can. Both are run, and the
 * difference between them is reported as the mechanism signature.
 *
 * §A4c correctness class, kill-switch gated on __TALARIA_DISABLE_M20_PREFIX_SLICE_V1
 * (M20-Q9), exercised in both states with the product helper's own return value
 * recorded so the control is proven to have controlled.
 *
 * §A5: no wall clocks, no RNG, no UUIDs, no rAF ordering, no float equality in
 * assertion payloads (all price comparisons are integer 1e-5 point counts).
 *
 * §A7: differential against a truth column that shares NO implementation with the
 * code under test. The 1w bucket-alignment probe demonstrates that independence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    productSurfaceInfo, runReplay, probeWalkForward, probeAnimatedCandleBake,
    settlingDiagnostic, frozenPlayheadAcrossTimeframes,
    probeTrimDivergenceOnInconsistentBar, probeWeekBucketAlignment,
    probeFrameDisplaySeriesLatch,
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
const MATRIX_TFS = ['5m', '15m', '1h', '4h'];
const JOIN_TFS = ['5m', '15m', '1h', '4h', '1d'];
const MAX_PHASES = 24;

/** Sibling packet's series AFTER its subject bar was corrected, mean abs pips. */
const SIBLING_LAST_SLOT_PIPS = { '5m': 2.57, '15m': 8.06, '1h': 14.60, '4h': 19.71, '1d': 31.67 };
/** PO's observed close-after-completion delta, signed pips. */
const PO_DELTA_PIPS = { '5m': 0, '15m': -0.6, '1h': 13, '4h': 72 };
/** Adversarial reviewer, candle-mode stepping, 1H. */
const REVIEWER_1H_PIPS = 21.3;

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

function section(key, value) { evidence.sections[key] = value; }
function round2(x) { return Math.round(x * 100) / 100; }

const corpusMatrix = buildCorpusPoints(MATRIX_BARS, 130_000, 0);
const corpusJoin = buildCorpusPoints(JOIN_BARS, 130_000, 0);

/** Reviewer's phase: 20 minutes into a 1H bucket → one third of the bucket. */
function thirdPhase(tf) {
    return Math.max(1, Math.floor((TF_MS[tf] / MINUTE_MS) / 3));
}

/* ─────────────────────────── provenance ─────────────────────────── */

test('provenance: real product surface loaded and pinned', () => {
    const info = productSurfaceInfo();
    section('productSurface', info);
    note('PROV', 'chart.js-methods-extracted', info.methods.length === 14,
        `n=${info.methods.length} chartJs=${info.chartJsSha256.slice(0, 16)}`);
    assert.equal(info.methods.length, 14);
    for (const m of info.methods) assert.equal(m.sha256.length, 64);
    const names = info.methods.map((m) => m.name);
    for (const need of ['_resampleDataFull', '_trimLastDataBarToReplayPlayhead',
        '_getWalkForwardOhlcToPlayhead', 'resampleData', 'getDisplaySeries']) {
        assert.ok(names.includes(need), `missing extracted method ${need}`);
    }
});

test('provenance: driver transcription matches real product source', () => {
    const src = { 'chart.js': readChartJsSource(), 'replay-system.js': readModuleSource('replay-system.js') };
    const missing = [];
    for (const n of PRODUCT_SEQUENCE_NEEDLES) {
        if (!src[n.file].includes(n.needle)) missing.push(`${n.file}: ${n.needle}`);
    }
    section('transcriptionNeedles', { checked: PRODUCT_SEQUENCE_NEEDLES.length, missing });
    note('PROV', 'transcription-needles-present', missing.length === 0,
        `${PRODUCT_SEQUENCE_NEEDLES.length - missing.length}/${PRODUCT_SEQUENCE_NEEDLES.length}`);
    assert.deepEqual(missing, []);
});

test('provenance: corpus is a deterministic pinned fixture (§A5, no RNG)', () => {
    const again = buildCorpusPoints(MATRIX_BARS, 130_000, 0);
    const a = corpusChecksum(corpusMatrix);
    const grid = verifyLosslessGrid(corpusMatrix);
    section('corpus', {
        matrixBars: MATRIX_BARS, joinBars: JOIN_BARS,
        matrixChecksum: a, joinChecksum: corpusChecksum(corpusJoin), losslessGrid: grid.ok,
    });
    note('PROV', 'corpus-deterministic', a === corpusChecksum(again), a);
    note('PROV', 'corpus-lossless-integer-grid', grid.ok);
    assert.equal(a, corpusChecksum(again));
    assert.equal(grid.ok, true);
});

/* ───────── truth-column independence (the trap that blocked the sibling) ───────── */

test('independence: the truth column does not share the implementation under test', () => {
    const w = probeWeekBucketAlignment(corpusJoin);
    section('truthColumnIndependence', w);
    for (const r of w.rows.slice(0, 3)) {
        observe('INDEP', 'product-1w-bucket-start',
            `t=${r.productBucketStart} utcDay=${r.productBucketStartUtcDay} `
            + `(1=Mon) calendarMonday=${r.calendarBucketStart} offset=${r.offsetMs}ms`);
    }
    note('INDEP', 'product-1w-buckets-never-start-on-monday', !w.anyWeekAlignedToMonday,
        `parseTimeframe('1w')=${w.parseTimeframeWeekMs}ms floored from the Unix epoch, a Thursday`);
    const intradayAgree = w.intradayConventionAgreement.every((r) => r.conventionsAgree);
    note('INDEP', 'intraday-conventions-agree-so-reference-is-not-gratuitously-divergent',
        intradayAgree,
        w.intradayConventionAgreement.map((r) => `${r.timeframe}:${r.conventionsAgree}`).join(' '));
    observe('INDEP', 'independence-claim',
        'referenceBucketsPoints is a separate implementation, not a call into '
        + '_resampleDataFull. This probe demonstrates it can see a real bucket-arithmetic '
        + 'defect that a shared-implementation truth column cancels out. Caveat stated in '
        + 'the open: the reference shares the epoch-floor CONVENTION for intraday '
        + 'timeframes, where it is provably equivalent to the UTC calendar; it does not '
        + 'share it for 1w.');
    assert.equal(w.anyWeekAlignedToMonday, false,
        'the independent reference must be able to see the 1w misalignment');
    assert.equal(intradayAgree, true);
});

/* ────────────────────── negative controls ────────────────────── */

function referenceSeriesAtTick(pointRows, tfMs, idx, { publishPartial, markForming }) {
    const upto = pointRows.slice(0, idx + 1);
    const buckets = referenceBucketsPoints(upto, tfMs);
    const byT = new Map(referenceBucketsPoints(pointRows, tfMs).map((b) => [b.t, b]));
    const out = [];
    for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        const isLast = i === buckets.length - 1;
        const ref = byT.get(b.t);
        const complete = !!ref && b.n === ref.n;
        if (isLast && !complete && !publishPartial) continue;
        const bar = { t: b.t, oP: b.oP, hP: b.hP, lP: b.lP, cP: b.cP };
        if (isLast && !complete && markForming) bar.isForming = true;
        out.push(bar);
    }
    return out;
}

test('negative control: LIMB 1 passes on a model that never publishes a partial bucket', () => {
    const tfMs = TF_MS['1h'];
    const refByT = new Map(referenceBucketsPoints(corpusMatrix, tfMs).map((b) => [b.t, b]));
    const step = tfMs / MINUTE_MS;
    const phase = thirdPhase('1h');

    const good = new BarImmutabilityOracle('nc-good');
    const bad = new BarImmutabilityOracle('nc-bad');
    for (let idx = phase; idx < corpusMatrix.length; idx += step) {
        good.observe(referenceSeriesAtTick(corpusMatrix, tfMs, idx, { publishPartial: false }), idx, corpusMatrix[idx].t);
        bad.observe(referenceSeriesAtTick(corpusMatrix, tfMs, idx, { publishPartial: true }), idx, corpusMatrix[idx].t);
    }
    good.finalize(refByT);
    bad.finalize(refByT);
    const g = good.result();
    const b = bad.result();
    section('negativeControl.limb1', {
        good: g, bad: { pass: b.pass, violationCount: b.violationCount, movement: b.movement },
    });
    note('NC', 'limb1-passes-on-conforming-model', g.pass,
        `bucketsChecked=${g.bucketsChecked} violations=${g.violationCount}`);
    note('NC', 'limb1-detects-a-published-partial-bucket', !b.pass,
        `violations=${b.violationCount}/${b.bucketsChecked} meanAbsMovement=${b.movement.meanAbsPips}pip`);
    assert.equal(g.pass, true, 'LIMB 1 oracle must be able to pass');
    assert.ok(g.bucketsChecked > 20, 'LIMB 1 control must actually check buckets');
    assert.equal(b.pass, false, 'LIMB 1 oracle must detect a moving last-slot bar');
});

test('negative control: LIMB 2 passes on a conforming model and fails on a partial one', () => {
    const tfMs = TF_MS['15m'];
    const byT = new Map(referenceBucketsPoints(corpusMatrix, tfMs).map((b) => [b.t, b]));
    const lastRawT = corpusMatrix[corpusMatrix.length - 1].t;
    const good = new LastBarWindowOracle('nc-good');
    const bad = new LastBarWindowOracle('nc-bad');
    for (let idx = 0; idx < 600; idx++) {
        const series = referenceSeriesAtTick(corpusMatrix, tfMs, idx, { publishPartial: true, markForming: true });
        const presented = series[series.length - 1];
        const ref = byT.get(presented.t);
        const bucketLastRawT = presented.t + tfMs - MINUTE_MS;
        const rawViewComplete = corpusMatrix[idx].t >= bucketLastRawT;
        const common = {
            tick: idx, fullBucket: ref, rawViewComplete,
            masterComplete: lastRawT >= bucketLastRawT, playheadMs: corpusMatrix[idx].t,
        };
        good.observe({
            ...common,
            presented: rawViewComplete
                ? { ...presented, cP: ref.cP, hP: ref.hP, lP: ref.lP, oP: ref.oP } : presented,
            formingMarker: rawViewComplete ? null : { key: 'isForming', value: 'true' },
        });
        bad.observe({ ...common, presented: { ...presented }, formingMarker: null });
    }
    const g = good.result();
    const b = bad.result();
    section('negativeControl.limb2', {
        good: g,
        bad: { pass: b.pass, valueFailureCount: b.valueFailureCount, presentationFailureCount: b.presentationFailureCount },
    });
    note('NC', 'limb2-passes-on-conforming-model', g.pass,
        `valueChecked=${g.valueChecked} presentationChecked=${g.presentationChecked}`);
    note('NC', 'limb2-detects-unmarked-partial-bar', !b.pass,
        `value=${b.valueFailureCount} presentation=${b.presentationFailureCount}`);
    assert.equal(g.pass, true);
    assert.ok(g.valueChecked > 0 && g.presentationChecked > 0);
    assert.equal(b.pass, false);
});

/* ──────────────────────── the matrix run ──────────────────────── */

const matrix = [];
test('drive product replay matrix (5m/15m/1h/4h × raw+coarse stepping × kill ON/OFF)', () => {
    for (const tf of MATRIX_TFS) {
        for (const stepMode of ['raw', 'coarse']) {
            for (const killSwitchOn of [false, true]) {
                matrix.push(runReplay({
                    pointRows: corpusMatrix,
                    timeframe: tf,
                    killSwitchOn,
                    stepMode,
                    phaseOffsetBars: thirdPhase(tf),
                }));
            }
        }
    }
    const helperBoth = new Set();
    for (const r of matrix) for (const v of r.productHelperReadings) helperBoth.add(v);
    section('matrix', matrix.map((r) => ({
        timeframe: r.timeframe,
        stepMode: r.stepMode,
        phaseOffsetBars: r.phaseOffsetBars,
        killSwitchOn: r.killSwitchOn,
        productHelperReadings: r.productHelperReadings,
        fullResampleCalls: r.fullResampleCalls,
        incrementalAttempts: r.incrementalAttempts,
        incrementalHits: r.incrementalHits,
        distinctPrefixIdentities: r.distinctPrefixIdentities,
        immutability: r.immutability,
        lastBarWindow: r.lastBarWindow,
        attribution: r.attribution,
    })));
    note('CTRL', 'kill-switch-genuinely-controlled', helperBoth.has(true) && helperBoth.has(false),
        `_m20Q9PrefixSliceFixEnabled() observed: ${[...helperBoth].join(',')}`);
    assert.equal(helperBoth.has(true) && helperBoth.has(false), true);

    const rawOn = matrix.find((r) => r.stepMode === 'raw' && !r.killSwitchOn);
    const rawOff = matrix.find((r) => r.stepMode === 'raw' && r.killSwitchOn);
    note('CTRL', 'fixON-single-prefix-identity', rawOn.distinctPrefixIdentities === 1,
        `distinct=${rawOn.distinctPrefixIdentities}`);
    note('CTRL', 'fixOFF-legacy-slice-churn', rawOff.distinctPrefixIdentities === MATRIX_BARS,
        `distinct=${rawOff.distinctPrefixIdentities}`);
    assert.equal(rawOn.distinctPrefixIdentities, 1);
    assert.equal(rawOff.distinctPrefixIdentities, MATRIX_BARS);
});

/* ───────────────── "baked in at finalization" does not reproduce ───────────────── */

test('cited: nothing can bake in under coarse stepping — the incremental branch never matches', () => {
    const coarse = matrix.filter((r) => r.stepMode === 'coarse');
    const raw = matrix.filter((r) => r.stepMode === 'raw');
    const coarseNoHits = coarse.every((r) => r.incrementalHits === 0);
    section('bakeIn', {
        coarse: coarse.map((r) => ({
            timeframe: r.timeframe, killSwitchOn: r.killSwitchOn, ticks: r.attribution.ticks,
            incrementalAttempts: r.incrementalAttempts, incrementalHits: r.incrementalHits,
            fullResampleCalls: r.fullResampleCalls,
        })),
        raw: raw.map((r) => ({
            timeframe: r.timeframe, killSwitchOn: r.killSwitchOn,
            incrementalAttempts: r.incrementalAttempts, incrementalHits: r.incrementalHits,
        })),
    });
    observe('BAKE', 'coarse-stepping-incremental-branch',
        `attempts=${coarse.reduce((s, r) => s + r.incrementalAttempts, 0)} `
        + `hits=${coarse.reduce((s, r) => s + r.incrementalHits, 0)} across ${coarse.length} cells — `
        + 'the source grows by one whole display period per install, so '
        + 'sourceLen === source.length - 1 can never match and the cached prior bucket '
        + 'is never reused. Corroborates the standing finding that "baked in at '
        + 'finalization" does not reproduce.');
    note('BAKE', 'no-incremental-resample-under-coarse-stepping', coarseNoHits);
    assert.equal(coarseNoHits, true);
});

/* ───────────────────────────── LIMB 1 ───────────────────────────── */

test(`LIMB 1 — ${ORACLE_IMMUTABILITY}: the bar in the last slot must not move once it leaves it`, () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        stepMode: r.stepMode,
        phaseOffsetBars: r.phaseOffsetBars,
        killSwitchOn: r.killSwitchOn,
        subject: r.immutability.subject,
        pass: r.immutability.pass,
        bucketsChecked: r.immutability.bucketsChecked,
        violationCount: r.immutability.violationCount,
        meanAbsMovementPips: r.immutability.movement.meanAbsPips,
        maxAbsMovementPips: r.immutability.movement.maxAbsPips,
        tautologyControl: r.immutability.tautologyControl,
        firstViolation: r.immutability.violations[0] || null,
    }));
    section('limb1', rows);
    observe('LIMB1', 'subject',
        `PRIMARY = ${rows[0].subject}. CONTROL = ${rows[0].tautologyControl.subject}.`);

    let coarseAllPass = true;
    for (const r of rows) {
        if (r.stepMode === 'coarse') coarseAllPass = coarseAllPass && r.pass;
        note('LIMB1', `${r.timeframe}/${r.stepMode}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, r.pass,
            `subject=data[len-1]@last-occupancy phase=+${r.phaseOffsetBars ?? 0}bar `
            + `violations=${r.violationCount}/${r.bucketsChecked} `
            + `meanAbsMovement=${r.meanAbsMovementPips}pip max=${r.maxAbsMovementPips}pip`);
    }

    // The tautology, demonstrated rather than asserted away.
    const tautologyClean = rows.every((r) => r.tautologyControl.pass);
    const primaryDirty = rows.some((r) => !r.pass);
    observe('LIMB1', 'tautology-demonstration',
        `the length-2 control subject records `
        + `${rows.reduce((s, r) => s + r.tautologyControl.violationCount, 0)} violations across `
        + `${rows.reduce((s, r) => s + r.tautologyControl.comparisons, 0)} comparisons — i.e. it passes `
        + `everywhere, INCLUDING the cells where the corrected subject records double-digit pip `
        + `movement. That is the failure mode that blocked the sibling packet, reproduced here on purpose.`);
    assert.equal(tautologyClean, true, 'the control subject is expected to be clean; it is untouchable');
    assert.equal(primaryDirty, true,
        'if the corrected subject is also clean, this packet has not reproduced TAL-01918 at all');

    assert.equal(coarseAllPass, true,
        `LIMB 1 (${ORACLE_IMMUTABILITY}) RED: under product-default candle-mode stepping the bar `
        + 'occupying the last slot is displayed with the close as of the playhead, then changes '
        + 'once it becomes historical. A bar a human reads as finished for an entire step moves '
        + 'afterwards.');
});

test('LIMB 1 mechanism signature: the movement vanishes exactly at the bucket final raw bar', () => {
    // A wrong window disappears when the window happens to be complete. A stale
    // value would not care where the playhead sits. This is the discriminator.
    const tf = '1h';
    const barsPerBucket = TF_MS[tf] / MINUTE_MS;
    const phases = [0, 1, 20, Math.floor(barsPerBucket / 2), barsPerBucket - 2, barsPerBucket - 1];
    const rows = [];
    for (const phase of phases) {
        const r = runReplay({
            pointRows: corpusMatrix, timeframe: tf, killSwitchOn: false,
            stepMode: 'coarse', phaseOffsetBars: phase,
        });
        rows.push({
            phaseOffsetBars: phase,
            minutesIntoBucket: phase,
            isBucketFinalRawBar: phase === barsPerBucket - 1,
            pass: r.immutability.pass,
            violationCount: r.immutability.violationCount,
            bucketsChecked: r.immutability.bucketsChecked,
            meanAbsMovementPips: r.immutability.movement.meanAbsPips,
        });
    }
    section('mechanismSignature', { timeframe: tf, rows });
    for (const r of rows) {
        observe('SIGNATURE', `1h phase=+${r.phaseOffsetBars}min`,
            `violations=${r.violationCount}/${r.bucketsChecked} `
            + `meanAbsMovement=${r.meanAbsMovementPips}pip`
            + (r.isBucketFinalRawBar ? '  ← playhead ON the bucket final raw bar' : ''));
    }
    const finalBar = rows.find((r) => r.isBucketFinalRawBar);
    const others = rows.filter((r) => !r.isBucketFinalRawBar);
    const vanishes = finalBar.violationCount === 0 && finalBar.meanAbsMovementPips === 0;
    const presentElsewhere = others.every((r) => r.violationCount > 0);
    note('SIGNATURE', 'movement-is-zero-only-at-the-bucket-final-raw-bar', vanishes && presentElsewhere,
        'wrong-window signature confirmed; a staleness defect would not be phase-dependent');
    assert.equal(vanishes, true);
    assert.equal(presentElsewhere, true);
});

/* ───────────────────────────── LIMB 2 ───────────────────────────── */

test(`LIMB 2 — ${ORACLE_LAST_BAR_WINDOW}: last bar is the full bucket, or is marked forming`, () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        stepMode: r.stepMode,
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
        note('LIMB2', `${r.timeframe}/${r.stepMode}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, r.pass,
            `subject=data[len-1]@every-tick valueFail=${r.valueFailureCount}/${r.valueChecked} `
            + `presentationFail=${r.presentationFailureCount}/${r.presentationChecked} `
            + `meanAbsCloseErr=${r.errorStats.meanAbsPips}pip`);
    }
    const markers = rows.flatMap((r) => Object.keys(r.formingMarkersSeen));
    note('LIMB2', 'no-forming-marker-on-any-display-bar', markers.length === 0,
        `searched ${FORMING_MARKER_KEYS.length} candidate marker keys, found: ${markers.length ? markers.join(',') : 'none'}`);
    assert.equal(allPass, true,
        `LIMB 2 (${ORACLE_LAST_BAR_WINDOW}) RED: the last display bar is aggregated over `
        + '[bucketStart, playhead] instead of [bucketStart, bucketEnd) and carries no forming '
        + 'marker, so a partial bucket is presented as a finished OHLC value.');
});

test('LIMB 2 positive control on the REAL product: 1m native timeframe passes', () => {
    const r = runReplay({ pointRows: corpusMatrix, timeframe: '1m', killSwitchOn: false });
    section('limb2NativeControl', { timeframe: '1m', lastBarWindow: r.lastBarWindow });
    note('LIMB2-CTRL', '1m-native-window-oracle-passes-on-product', r.lastBarWindow.pass,
        `valueFail=${r.lastBarWindow.valueFailureCount}/${r.lastBarWindow.valueChecked} `
        + `meanAbsCloseErr=${r.lastBarWindow.errorStats.meanAbsPips}pip`);
    assert.equal(r.lastBarWindow.pass, true,
        'LIMB 2 must pass on the native timeframe against real product code, or it is a tautology');
    assert.ok(r.lastBarWindow.valueChecked > 2000);
});

/* ─────────────────────── attribution: slice vs trim ─────────────────────── */

test('attribution: which of slice / trim carries the error', () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        stepMode: r.stepMode,
        killSwitchOn: r.killSwitchOn,
        ticks: r.attribution.ticks,
        trimReplacedSlotTicks: r.attribution.trimReplacedSlotTicks,
        trimChangedValueTicks: r.attribution.trimChangedValueTicks,
        meanAbsSliceErrorPips: r.attribution.meanAbsSliceErrorPips,
        meanAbsTrimErrorPips: r.attribution.meanAbsTrimErrorPips,
        sliceSharePct: r.attribution.sliceSharePct,
        trimSharePct: r.attribution.trimSharePct,
        chartDataIsPipelineCacheResultTicks: r.chartDataIsPipelineCacheResultTicks,
        fullResampleCalls: r.fullResampleCalls,
    }));
    section('attribution', rows);
    for (const r of rows) {
        note('ATTR', `${r.timeframe}/${r.stepMode}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`, true,
            `slice=${r.meanAbsSliceErrorPips}pip(${r.sliceSharePct}%) `
            + `trim=${r.meanAbsTrimErrorPips}pip(${r.trimSharePct}%) `
            + `trimSlotWrites=${r.trimReplacedSlotTicks}/${r.ticks} `
            + `trimValueChanges=${r.trimChangedValueTicks}/${r.ticks}`);
    }
    const everyTickFullResample = rows.every((r) => r.fullResampleCalls === r.ticks);
    const trimNeverChangesValue = rows.every((r) => r.trimChangedValueTicks === 0);
    const trimAlwaysWritesSlot = rows.every((r) => r.trimReplacedSlotTicks === r.ticks);
    const dataIsCache = rows.every((r) => r.chartDataIsPipelineCacheResultTicks === r.ticks);
    const exercisedPath = [
        'ReplaySystem static-playhead install',
        '→ chart.rawData = prefix[0..playhead]',
        '→ chart.resampleData → ChartDataPipeline.getResampledSeries (FULL resample every tick;'
        + ' the incremental same-sourceRef branch is never reached — 0 hits in every cell)',
        '→ chart._resampleDataFull buckets the PREFIX, so the final bucket is aggregated over'
        + ' [bucketStart, playhead] — this is where 100% of the error is created',
        '→ chart._trimLastDataBarToReplayPlayhead writes this.data[lastIdx] (which IS'
        + ' ChartDataPipeline._resampleCache.result) on every tick, but the value it writes is'
        + ' the same [bucketStart, playhead] aggregation, so its numeric contribution is zero',
    ];
    section('exercisedPath', {
        path: exercisedPath, everyTickFullResample, trimAlwaysWritesSlot,
        trimNeverChangesValue, chartDataIsPipelineCacheResult: dataIsCache,
    });
    observe('PATH', 'exercised-path', exercisedPath.join(' '));
    note('PATH', 'pipeline-full-resamples-every-tick', everyTickFullResample);
    note('PATH', 'trim-writes-the-pipeline-cache-slot-every-tick', trimAlwaysWritesSlot);
    note('PATH', 'trim-numeric-contribution-is-zero', trimNeverChangesValue);
    note('PATH', 'chart.data-IS-pipeline-resample-cache-result', dataIsCache);
    assert.equal(everyTickFullResample, true);
    assert.equal(dataIsCache, true);
});

test('attribution bound: the trim is not unconditionally value-neutral', () => {
    const out = ['15m', '1h'].map((tf) => probeTrimDivergenceOnInconsistentBar({
        pointRows: corpusMatrix, timeframe: tf, targetIdx: 1234,
    }));
    section('attributionBound', out);
    for (const r of out) {
        observe('ATTR-BOUND', r.timeframe,
            `on a bar printed with high < close: trim changed high=${r.trimChangedHigh} `
            + `(${r.highDeltaPoints} points), low=${r.trimChangedLow}, close=${r.trimChangedClose}`);
    }
    const diverges = out.every((r) => r.trimChangedHigh);
    note('ATTR-BOUND', 'trim-diverges-from-resample-on-ill-formed-bars', diverges,
        '_prepareBarsForResampling normalises h=max(o,c,h,l); _aggregateFinerBarsWalkForward reads b.h raw');
    assert.equal(diverges, true);
});

/* ──────────────────── render cadence is not inert ──────────────────── */

test('render cadence: getDisplaySeries latches a frame array only render() clears', () => {
    const out = ['1h', '15m'].map((tf) => probeFrameDisplaySeriesLatch({ pointRows: corpusMatrix, timeframe: tf }));
    section('renderLatch', out);
    for (const r of out) {
        observe('RENDER', r.timeframe,
            `usesDisplayPipeline=${r.usesDisplayPipeline} `
            + `chart.data close=${r.chartDataClosePoints}pts but getDisplaySeries() returns `
            + `${r.getDisplaySeriesClosePointsBeforeRender}pts (${r.stalenessPips}pip stale) until the `
            + `latch is cleared, after which it returns ${r.getDisplaySeriesClosePointsAfterLatchCleared}pts`);
    }
    const latches = out.every((r) => r.latchServesStaleArray);
    const recovers = out.every((r) => r.latchClearedRestoresAgreement);
    note('RENDER', 'getDisplaySeries-serves-a-stale-array-between-frames', latches,
        'render() is the only writer that clears chart._frameDisplaySeries; nothing on the data path does');
    note('RENDER', 'clearing-the-latch-restores-agreement-with-chart.data', recovers);
    assert.equal(latches, true);
    assert.equal(recovers, true);
});

/* ──────────────────── suspects ──────────────────── */

test('suspect 4: _getWalkForwardOhlcToPlayhead is a no-op on the native timeframe', () => {
    const native = probeWalkForward(corpusMatrix, '1m');
    const coarse = probeWalkForward(corpusMatrix, '1h');
    section('suspect4', { native, coarse });
    note('S4', 'native-1m-walkforward-returns-null', native.isNoOp,
        `rawStep=${native.rawStepMs}ms tf=${native.tfMs}ms (60000 >= 55200 → both candidates skip)`);
    note('S4', 'coarse-1h-walkforward-aggregates', !coarse.isNoOp);
    assert.equal(native.isNoOp, true);
    assert.equal(coarse.isNoOp, false);
});

test('suspects 2 & 3: animated candle bakes an interpolated close; mirror skips the trim', () => {
    const out = ['5m', '1h', '4h'].map((tf) => probeAnimatedCandleBake({
        pointRows: corpusMatrix, timeframe: tf, targetIdx: 1000,
    }));
    section('suspects23', out);
    for (const r of out) {
        observe('S2/3', `${r.timeframe}-animated-bake`,
            `trimSkipped=${r.trimSkippedMidAnimation} interpolatedBaked=${r.interpolatedCloseIsBaked} `
            + `errVsFullBucket=${r.errorVsFullBucketPips}pip`);
    }
    note('S2/3', 'mirror-skips-trim-mid-animation', out.every((r) => r.trimSkippedMidAnimation));
    note('S2/3', 'interpolated-close-baked-into-coarse-bucket', out.every((r) => r.interpolatedCloseIsBaked));
    assert.equal(out.every((r) => r.trimSkippedMidAnimation), true);
    assert.equal(out.every((r) => r.interpolatedCloseIsBaked), true);
});

/* ─────────────────── settling diagnostic (untouchable subject) ─────────────────── */

test('settling diagnostic on the untouchable subject: reported, and labelled as such', () => {
    const out = [false, true].map((killSwitchOn) => settlingDiagnostic({
        pointRows: corpusMatrix, timeframe: '1h', killSwitchOn,
    }));
    section('settling', out);
    for (const r of out) {
        observe('SETTLE', `1h/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`,
            `subject=data[len-2] boundaries=${r.boundaries} `
            + `diffVsSameImplementationResample=${r.finalisedBucketDiffersFromSameImplementationResample} `
            + `diffVsIndependentFullBucket=${r.finalisedBucketDiffersFromIndependentFullBucket}`);
    }
    observe('SETTLE', 'interpretation',
        'This subject is chart.data[length-2]. The trim writes chart.data[length-1] and only that '
        + 'slot, so this diagnostic can never observe the completed-bar mutation. Its clean result '
        + 'is a tautology and is reported here ONLY so it is not mistaken for evidence — the very '
        + 'mistake that blocked the sibling packet. The load-bearing measurement is LIMB 1 above.');
    assert.equal(out.length, 2);
    assert.equal(
        out[0].finalisedBucketDiffersFromSameImplementationResample,
        out[1].finalisedBucketDiffersFromSameImplementationResample,
        'the untouchable-subject verdict must not depend on the M20-Q9 switch state',
    );
});

/* ─────────────── the join ─────────────── */

const joinRows = [];
test('join: phase-averaged last-slot movement per timeframe', () => {
    for (const tf of JOIN_TFS) {
        const barsPerBucket = TF_MS[tf] / MINUTE_MS;
        const phaseStep = Math.max(1, Math.ceil(barsPerBucket / MAX_PHASES));
        const phases = new Set();
        for (let p = 0; p < barsPerBucket; p += phaseStep) phases.add(p);
        phases.add(thirdPhase(tf)); // the reviewer's 20-minutes-into-1H phase
        const perPhase = [];
        for (const phase of [...phases].sort((a, b) => a - b)) {
            const r = runReplay({
                pointRows: corpusJoin, timeframe: tf, killSwitchOn: false,
                stepMode: 'coarse', phaseOffsetBars: phase,
            });
            perPhase.push({
                phase,
                meanAbsMovementPips: r.immutability.movement.meanAbsPips,
                buckets: r.immutability.bucketsChecked,
                windowErrorMeanAbsPips: r.lastBarWindow.errorStats.meanAbsPips,
            });
        }
        const valid = perPhase.filter((p) => p.meanAbsMovementPips != null);
        const avg = valid.reduce((s, p) => s + p.meanAbsMovementPips, 0) / valid.length;
        joinRows.push({
            timeframe: tf,
            bucketMinutes: barsPerBucket,
            phasesSampled: valid.length,
            phaseAveragedMovementPips: round2(avg),
            atThirdPhaseMovementPips: perPhase.find((p) => p.phase === thirdPhase(tf))?.meanAbsMovementPips
                ?? null,
            siblingPips: SIBLING_LAST_SLOT_PIPS[tf] ?? null,
            poSignedPips: PO_DELTA_PIPS[tf] ?? null,
        });
    }
    const base = joinRows[0].phaseAveragedMovementPips;
    const sibBase = SIBLING_LAST_SLOT_PIPS['5m'];
    for (const r of joinRows) {
        r.ratioTo5m = round2(r.phaseAveragedMovementPips / base);
        r.siblingRatioTo5m = r.siblingPips == null ? null : round2(r.siblingPips / sibBase);
    }
    const monotonic = joinRows.every((r, i) => i === 0
        || r.phaseAveragedMovementPips >= joinRows[i - 1].phaseAveragedMovementPips);
    section('join', { rows: joinRows, monotonicInBucketDuration: monotonic });
    for (const r of joinRows) {
        observe('JOIN', r.timeframe,
            `phaseAvgMovement=${r.phaseAveragedMovementPips}pip (x${r.ratioTo5m} of 5m; `
            + `${r.phasesSampled} phases) | at-third-phase=${r.atThirdPhaseMovementPips}pip | `
            + `sibling=${r.siblingPips}pip (x${r.siblingRatioTo5m}) | PO=${r.poSignedPips ?? 'n/a'}pip`);
    }
    const oneHour = joinRows.find((r) => r.timeframe === '1h');
    observe('JOIN', '1h-three-way',
        `PO 13pip | reviewer ${REVIEWER_1H_PIPS}pip | sibling ${SIBLING_LAST_SLOT_PIPS['1h']}pip | `
        + `this packet ${oneHour.phaseAveragedMovementPips}pip phase-averaged, `
        + `${oneHour.atThirdPhaseMovementPips}pip at the reviewer's 20-minute phase`);

    // Make the magnitude gap interpretable instead of mysterious: report the
    // fixture's own volatility and the per-timeframe scale factor to the sibling.
    let sumAbs1m = 0;
    for (let i = 1; i < corpusJoin.length; i++) sumAbs1m += Math.abs(corpusJoin[i].cP - corpusJoin[i - 1].cP);
    const mean1mPips = round2(sumAbs1m / (corpusJoin.length - 1) / 10);
    const scale = joinRows
        .filter((r) => r.siblingPips != null)
        .map((r) => `${r.timeframe}:x${round2(r.siblingPips / r.phaseAveragedMovementPips)}`);
    section('corpusCalibration', { mean1mAbsCloseChangePips: mean1mPips, siblingOverThisPacket: scale });
    observe('JOIN', 'corpus-calibration',
        `this fixture's mean absolute 1m close-to-close change is ${mean1mPips} pip. The sibling's `
        + `series is larger than mine by ${scale.join(' ')} — not a constant factor, so the gap is `
        + 'both a volatility-scale difference and an autocorrelation-shape difference, not a '
        + 'disagreement about the quantity being measured');

    note('JOIN', 'movement-monotonic-in-bucket-duration', monotonic);
    assert.equal(monotonic, true);
});

test('join: the last-slot movement IS the window error, evaluated at the occupancy phase', () => {
    const tfMs = TF_MS['1h'];
    const refByT = new Map(referenceBucketsPoints(corpusMatrix, tfMs).map((b) => [b.t, b]));
    const closeAtT = new Map(corpusMatrix.map((r) => [r.t, r.cP]));
    let checked = 0;
    let mismatches = 0;
    for (let idx = 0; idx < corpusMatrix.length; idx++) {
        const p = corpusMatrix[idx].t;
        const bucketT = Math.floor(p / tfMs) * tfMs;
        const ref = refByT.get(bucketT);
        const bucketLastRawT = bucketT + tfMs - MINUTE_MS;
        if (!ref || !closeAtT.has(bucketLastRawT)) continue;
        const truncationErr = corpusMatrix[idx].cP - closeAtT.get(bucketLastRawT);
        const windowErr = corpusMatrix[idx].cP - ref.cP;
        checked += 1;
        if (truncationErr !== windowErr) mismatches += 1;
    }
    section('identity', { timeframe: '1h', checked, mismatches });
    note('JOIN', 'window-error-IS-truncation-error', mismatches === 0,
        `checked=${checked} mismatches=${mismatches} — algebraic, not empirical`);
    assert.equal(mismatches, 0);
});

test('join: PO signed values against the measured distribution', () => {
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
        const abs = deltas.map((d) => Math.abs(d)).sort((x, y) => x - y);
        const po = PO_DELTA_PIPS[tf];
        const poPoints = po == null ? null : Math.round(po * 10);
        rows.push({
            timeframe: tf,
            buckets: deltas.length,
            meanAbsPips: round2(abs.reduce((a, b2) => a + b2, 0) / abs.length / 10),
            p90AbsPips: round2(abs[Math.floor(abs.length * 0.9)] / 10),
            maxAbsPips: round2(abs[abs.length - 1] / 10),
            poSignedPips: po ?? null,
            poWithinObservedRange: poPoints == null ? null : Math.abs(poPoints) <= abs[abs.length - 1],
        });
    }
    section('poJoin', rows);
    for (const r of rows) {
        observe('PO1', r.timeframe,
            `n=${r.buckets} full-body delta meanAbs=${r.meanAbsPips}pip p90=${r.p90AbsPips}pip `
            + `max=${r.maxAbsPips}pip | PO=${r.poSignedPips ?? 'n/a'}pip `
            + `withinObservedRange=${r.poWithinObservedRange}`);
    }
    const outOfRange = rows.filter((r) => r.poSignedPips != null && !r.poWithinObservedRange);
    observe('PO1', 'po-values-vs-synthetic-range',
        outOfRange.length === 0
            ? 'every PO value lies inside the range this corpus produces'
            : `${outOfRange.map((r) => `${r.timeframe}:${r.poSignedPips}pip > max ${r.maxAbsPips}pip`).join(', ')}`
              + ' — the fixture is a pure random walk with no trend or fat tails, so it under-produces '
              + 'the largest real EURUSD coarse-bucket bodies; this bounds the corpus, not the defect');
    assert.ok(rows.length >= 4);
});

test('PO observation 2: frozen playhead, 1m vs coarse family', () => {
    const out = frozenPlayheadAcrossTimeframes({
        pointRows: corpusJoin, idx: 5000, timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    });
    section('frozenPlayhead', out);
    const coarse = out.rows.filter((r) => r.timeframe !== '1m');
    const coarseAgree = new Set(coarse.map((r) => r.lastClosePoints)).size === 1;
    note('PO2', 'coarse-family-agrees-to-last-digit', coarseAgree);
    observe('PO2', 'static-1m-vs-coarse',
        out.rows[0].lastClosePoints === coarse[0].lastClosePoints
            ? 'no static divergence — the PO 1m/coarse split needs the animated or render path'
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
        subjects: {
            [ORACLE_IMMUTABILITY]: 'chart.data[length-1] at the last tick the bucket occupies the last slot',
            [ORACLE_LAST_BAR_WINDOW]: 'chart.data[length-1] at every tick',
            tautologyControl: 'chart.data[length-2] — untouchable by the trim, reported only as a demonstration',
        },
        rows: evidence.rows,
        ...evidence.sections,
    };
    const out = path.join(EVIDENCE_DIR, 'm21-b-tal01918-red-evidence.json');
    fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    process.stdout.write(`EVIDENCE → ${out}\n`);
    assert.ok(fs.existsSync(out));
});
