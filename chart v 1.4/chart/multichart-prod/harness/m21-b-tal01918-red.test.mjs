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
    probeFrameDisplaySeriesLatch, probeTrimCloseContributionViaBtCache,
    PRODUCT_SEQUENCE_NEEDLES, TF_MS,
} from './m21-b-tal01918-driver.mjs';
import {
    buildCorpusPoints, buildFlatCorpusPoints, corpusChecksum, verifyLosslessGrid,
    referenceBucketsPoints, MINUTE_MS,
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

/**
 * Run LIMB 1 against an ideal aggregator — no product code anywhere.
 *
 * `step = 1` by default so the sweep passes through ticks at which the window IS
 * complete. Without those ticks a marked aggregator never enrols anything in
 * clause B and the control would pass vacuously.
 */
function limb1AgainstIdealAggregator(pointRows, tf, { publishPartial, markForming, step = 1 }) {
    const tfMs = TF_MS[tf];
    const refByT = new Map(referenceBucketsPoints(pointRows, tfMs).map((b) => [b.t, b]));
    const phase = 0;
    const o = new BarImmutabilityOracle(`ideal/${publishPartial ? 'partial' : 'omit'}/${markForming ? 'marked' : 'unmarked'}`);
    for (let idx = phase; idx < pointRows.length; idx += step) {
        const series = referenceSeriesAtTick(pointRows, tfMs, idx, { publishPartial, markForming });
        if (!series.length) continue;
        const last = series[series.length - 1];
        const bucketLastRawT = last.t + tfMs - MINUTE_MS;
        o.observe({
            series,
            tick: idx,
            playheadMs: pointRows[idx].t,
            rawViewComplete: pointRows[idx].t >= bucketLastRawT,
            formingMarker: last.isForming ? { key: 'isForming', value: 'true' } : null,
            refByT,
        });
    }
    o.finalize(refByT);
    return o.result();
}

test('negative control: LIMB 1 can pass on a correct product, in TWO distinct ways', () => {
    const omit = limb1AgainstIdealAggregator(corpusMatrix, '1h', { publishPartial: false });
    const marked = limb1AgainstIdealAggregator(corpusMatrix, '1h', { publishPartial: true, markForming: true });
    const unmarked = limb1AgainstIdealAggregator(corpusMatrix, '1h', { publishPartial: true, markForming: false });

    section('negativeControl.limb1', { omit, marked, unmarked });
    note('NC', 'limb1-passes-on-aggregator-that-omits-the-partial', omit.pass,
        `A=${omit.clauseA.violations}/${omit.clauseA.checked} B=${omit.clauseB.violations}/${omit.clauseB.checked} `
        + `C=${omit.clauseC.stabilityViolations + omit.clauseC.exactnessViolations}`);
    note('NC', 'limb1-passes-on-aggregator-that-MARKS-its-partial-isForming', marked.pass,
        `A=${marked.clauseA.violations}/${marked.clauseA.checked} B=${marked.clauseB.violations}/${marked.clauseB.checked} `
        + `— the fix the report recommends turns this RED green`);
    note('NC', 'limb1-fails-on-aggregator-that-publishes-an-UNMARKED-partial', !unmarked.pass,
        `A=${unmarked.clauseA.violations}/${unmarked.clauseA.checked} B=${unmarked.clauseB.violations}/${unmarked.clauseB.checked}`);
    observe('NC', 'control-coverage',
        `omit: A=${omit.clauseA.checked} B=${omit.clauseB.checked} Cexact=${omit.clauseC.exactnessChecked} `
        + `Cstab=${omit.clauseC.stabilityChecked} | marked: A=${marked.clauseA.checked} `
        + `B=${marked.clauseB.checked} Cexact=${marked.clauseC.exactnessChecked} `
        + `Cstab=${marked.clauseC.stabilityChecked}`);
    assert.equal(omit.pass, true, 'LIMB 1 must pass on an aggregator that omits the partial');
    assert.equal(marked.pass, true,
        'LIMB 1 must pass on an aggregator that marks its partial — otherwise the oracle '
        + 'cannot be satisfied by any chart that draws a live candle');
    // Each passing control must exercise every clause that is meaningful for it.
    // The omitting model publishes nothing incomplete, so clause A is vacuous for
    // it by construction; the marked model does publish, so clause A must bite.
    assert.equal(omit.clauseA.checked, 0, 'omitting model publishes nothing incomplete');
    assert.ok(omit.clauseB.checked > 20 && omit.clauseC.exactnessChecked > 20,
        'the omitting control must exercise clauses B and C');
    assert.ok(marked.clauseA.checked > 20 && marked.clauseB.checked > 20
        && marked.clauseC.exactnessChecked > 20,
        'the marked control must exercise all three clauses and still pass');
    assert.equal(unmarked.pass, false);
});

test('negative control: LIMB 1 is not a volatility meter — flat corpus, same verdict', () => {
    const flat = buildFlatCorpusPoints(MATRIX_BARS, 130_000, 0);
    const flatUnmarked = limb1AgainstIdealAggregator(flat, '1h', { publishPartial: true, markForming: false });
    const flatMarked = limb1AgainstIdealAggregator(flat, '1h', { publishPartial: true, markForming: true });
    const flatProduct = runReplay({
        pointRows: flat, timeframe: '1h', killSwitchOn: false,
        stepMode: 'product', phaseOffsetBars: thirdPhase('1h'),
    });
    section('flatCorpusControl', {
        idealUnmarked: flatUnmarked, idealMarked: flatMarked,
        product: flatProduct.immutability,
    });
    observe('FLAT', 'clause-B-magnitude-on-a-flat-corpus',
        `ideal-unmarked movement mean=${flatUnmarked.clauseB.movement.meanAbsPips}pip — the VALUE `
        + 'clause correctly goes quiet when there is no volatility, which is why it cannot be the '
        + 'whole verdict');
    note('FLAT', 'clause-A-still-fails-on-a-flat-corpus-ideal', !flatUnmarked.clauseA.pass,
        `A=${flatUnmarked.clauseA.violations}/${flatUnmarked.clauseA.checked} — structural, fixture-independent`);
    note('FLAT', 'clause-A-still-fails-on-a-flat-corpus-PRODUCT', !flatProduct.immutability.clauseA.pass,
        `A=${flatProduct.immutability.clauseA.violations}/${flatProduct.immutability.clauseA.checked}`);
    note('FLAT', 'LIMB-1-verdict-does-not-flip-on-a-flat-corpus', !flatProduct.immutability.pass,
        'the previous revision passed here; that flip is what made it a volatility meter');
    note('FLAT', 'marked-aggregator-still-passes-on-a-flat-corpus', flatMarked.pass);
    assert.equal(flatUnmarked.clauseA.pass, false);
    assert.equal(flatProduct.immutability.pass, false);
    assert.equal(flatMarked.pass, true);
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
test('drive product replay matrix (5m/15m/1h/4h × raw+coarse+product stepping × kill ON/OFF)', () => {
    for (const tf of MATRIX_TFS) {
        for (const stepMode of ['raw', 'coarse', 'product']) {
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
        landingPhaseMinutes: r.landingPhaseMinutes,
        distinctLandingPhases: r.distinctLandingPhases,
        stubbedResolvers: r.stubbedResolvers,
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

    // The product's own advance re-anchors to the next bucket start, so any
    // starting phase collapses to 0 within one step. Measured from a deliberately
    // off-phase start, not assumed.
    const productCells = matrix.filter((r) => r.stepMode === 'product');
    const allPhaseZero = productCells.every((r) => r.distinctSteadyStateLandingPhases.length === 1
        && r.distinctSteadyStateLandingPhases[0] === 0);
    section('productStepping', productCells.map((r) => ({
        timeframe: r.timeframe, startPhaseBars: r.phaseOffsetBars,
        landingPhaseMinutes: r.landingPhaseMinutes,
        distinctLandingPhases: r.distinctLandingPhases,
        distinctSteadyStateLandingPhases: r.distinctSteadyStateLandingPhases,
        stubbedResolvers: r.stubbedResolvers,
    })));
    for (const r of productCells.filter((c) => !c.killSwitchOn)) {
        observe('STEP', `${r.timeframe} product advance`,
            `started deliberately off-phase at +${r.phaseOffsetBars} bars; landing phases `
            + `[${r.landingPhaseMinutes.slice(0, 8).join(',')}] — steady-state distinct set `
            + `{${r.distinctSteadyStateLandingPhases.join(',')}} (seeded first tick and `
            + `tail-clamped last tick excluded)`);
    }
    note('STEP', 'product-calculateNextIndex-lands-every-step-at-phase-0', allPhaseZero,
        'calculateNextIndex re-anchors to _replayBucketStart(ts,tf)+tf then takes '
        + '_firstRawIndexAtOrAfter, so the newest candle holds exactly one raw bar');
    assert.equal(allPhaseZero, true);

    const rawOn = matrix.find((r) => r.stepMode === 'raw' && !r.killSwitchOn);
    const rawOff = matrix.find((r) => r.stepMode === 'raw' && r.killSwitchOn);
    note('CTRL', 'fixON-single-prefix-identity', rawOn.distinctPrefixIdentities === 1,
        `distinct=${rawOn.distinctPrefixIdentities}`);
    note('CTRL', 'fixOFF-legacy-slice-churn', rawOff.distinctPrefixIdentities === MATRIX_BARS,
        `distinct=${rawOff.distinctPrefixIdentities}`);
    assert.equal(rawOn.distinctPrefixIdentities, 1);
    assert.equal(rawOff.distinctPrefixIdentities, MATRIX_BARS);
});

/* ─────────── the mechanism: an unmarked one-raw-bar stub in the newest slot ─────────── */

test('mechanism: under real product stepping the newest candle holds ONE raw bar, unmarked', () => {
    const rows = [];
    for (const tf of MATRIX_TFS) {
        const tfMs = TF_MS[tf];
        const barsPerBucket = tfMs / MINUTE_MS;
        const r = matrix.find((m) => m.timeframe === tf && m.stepMode === 'product' && !m.killSwitchOn);
        // At phase 0 the newest bucket contains exactly one raw bar, so the whole
        // remaining bucket body is un-included: bucket span minus one raw bar.
        rows.push({
            timeframe: tf,
            barsPerBucket,
            rawBarsInNewestCandle: 1,
            unelapsedRemainderMinutes: barsPerBucket - 1,
            fractionOfBucketMissing: round2((barsPerBucket - 1) / barsPerBucket),
            presentationViolations: r.immutability.clauseA.violations,
            presentationChecked: r.immutability.clauseA.checked,
            meanAbsMovementPips: r.immutability.clauseB.movement.meanAbsPips,
            formingMarkersSeen: Object.keys(r.lastBarWindow.formingMarkersSeen).length,
        });
    }
    section('stubMechanism', rows);
    for (const r of rows) {
        observe('STUB', r.timeframe,
            `newest candle = 1 raw bar of ${r.barsPerBucket} (${r.unelapsedRemainderMinutes} min `
            + `un-elapsed, ${Math.round(r.fractionOfBucketMissing * 100)}% of the bucket missing); `
            + `markers found=${r.formingMarkersSeen}; subsequent movement `
            + `${r.meanAbsMovementPips}pip`);
    }
    const allStub = rows.every((r) => r.presentationViolations === r.presentationChecked
        && r.formingMarkersSeen === 0);
    note('STUB', 'newest-candle-is-an-unmarked-one-raw-bar-stub-at-every-timeframe', allStub,
        'a user stepping candle-by-candle sees an unlabelled one-minute stub where they read a '
        + 'finished candle, then watches it fill in — this is neither the trim nor the slice');
    assert.equal(allStub, true);
});

test('proposed row name', () => {
    const proposal = {
        current: 'TAL-01918 — completed-bar close mutation',
        contradictedBy: [
            'LIMB 2 value clause: 0 failures across every reachable check',
            'LIMB 1 clause C: 0 stability and 0 exactness violations once historical',
        ],
        proposed: 'TAL-01918 — newest coarse candle is an unmarked partial bucket',
        shortName: 'unmarked-forming-coarse-candle',
        rationale:
            'Nothing completed mutates. What the product does is publish the newest coarse bucket '
            + 'as an ordinary finished bar while it holds only the raw bars elapsed so far — one '
            + 'single raw bar under the product\'s own stepping — with no forming marker in any of '
            + '15 searched spellings. The value a user reads is correct for the window it covers '
            + 'and wrong for the candle it is drawn as. The apparent "mutation" is that bar filling '
            + 'in, which is expected behaviour for a live candle and only surprising because '
            + 'nothing labels it as one.',
    };
    section('rowRename', proposal);
    observe('RENAME', 'proposal', `${proposal.proposed} (short: ${proposal.shortName})`);
    observe('RENAME', 'why-the-current-name-is-wrong', proposal.contradictedBy.join('; '));
    assert.ok(proposal.proposed.length > 0);
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

test(`LIMB 1 — ${ORACLE_IMMUTABILITY}: presentation, mutation-after-finished, settled differential`, () => {
    const rows = matrix.map((r) => ({
        timeframe: r.timeframe,
        stepMode: r.stepMode,
        killSwitchOn: r.killSwitchOn,
        pass: r.immutability.pass,
        clauseA: r.immutability.clauseA,
        clauseB: r.immutability.clauseB,
        clauseC: r.immutability.clauseC,
    }));
    section('limb1', rows);
    const s = matrix[0].immutability.subjects;
    observe('LIMB1', 'subjects', `A: ${s.A} | B: ${s.B} | C: ${s.C}`);

    for (const r of rows) {
        const cell = `${r.timeframe}/${r.stepMode}/${r.killSwitchOn ? 'kill-ON' : 'kill-OFF'}`;
        note('LIMB1', cell, r.pass,
            `A(presentation)=${r.clauseA.violations}/${r.clauseA.checked} `
            + `B(moved-after-finished)=${r.clauseB.violations}/${r.clauseB.checked} `
            + `[${r.clauseB.movement.meanAbsPips}pip mean] `
            + `C(settled)=${r.clauseC.stabilityViolations}/${r.clauseC.stabilityChecked} stability, `
            + `${r.clauseC.exactnessViolations}/${r.clauseC.exactnessChecked} exactness`);
    }

    // Clause C is the packet's genuine differential, and it is CLEAN. Reported as
    // a finding in its own right rather than buried in a blended verdict.
    const cStability = rows.reduce((a, r) => a + r.clauseC.stabilityChecked, 0);
    const cStabViol = rows.reduce((a, r) => a + r.clauseC.stabilityViolations, 0);
    const cExact = rows.reduce((a, r) => a + r.clauseC.exactnessChecked, 0);
    const cExactViol = rows.reduce((a, r) => a + r.clauseC.exactnessViolations, 0);
    section('settledDifferential', {
        stabilityChecked: cStability, stabilityViolations: cStabViol,
        exactnessChecked: cExact, exactnessViolations: cExactViol,
    });
    note('LIMB1-C', 'settled-buckets-are-stable-AND-exact', cStabViol === 0 && cExactViol === 0,
        `${cStabViol}/${cStability} stability violations, ${cExactViol}/${cExact} exactness `
        + 'violations against the independent reference. NOT a tautology: the pipeline '
        + 'full-resamples the entire series from the growing prefix on every tick, so each of '
        + 'these bars is recomputed from scratch before every comparison.');
    assert.equal(cStabViol, 0);
    assert.equal(cExactViol, 0);
    assert.ok(cExact > 1000, 'the settled differential must actually check buckets');

    const allPass = rows.every((r) => r.pass);
    const aFails = rows.every((r) => !r.clauseA.pass);
    note('LIMB1', 'clause-A-fails-in-every-cell', aFails,
        'every published coarse bar with an incomplete window is bit-indistinguishable from a '
        + 'finished one');
    assert.equal(allPass, true,
        `LIMB 1 (${ORACLE_IMMUTABILITY}) RED: clause A — the product publishes a bar whose window `
        + 'is incomplete with no marker of any kind, so it is indistinguishable from a finished '
        + 'bar; and clause B — that bar then changes. Clause C passes: once historical, buckets '
        + 'are stable and exact.');
});

test('LIMB 1 mechanism signature: the movement vanishes exactly at the bucket final raw bar', () => {
    // A wrong window disappears when the window happens to be complete. A stale
    // value would not care where the playhead sits. Clause B is the value clause,
    // so it is the one that carries this signature.
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
            isBucketFinalRawBar: phase === barsPerBucket - 1,
            clauseAViolations: r.immutability.clauseA.violations,
            clauseAChecked: r.immutability.clauseA.checked,
            clauseBViolations: r.immutability.clauseB.violations,
            clauseBChecked: r.immutability.clauseB.checked,
            meanAbsMovementPips: r.immutability.clauseB.movement.meanAbsPips,
        });
    }
    section('mechanismSignature', { timeframe: tf, rows });
    for (const r of rows) {
        observe('SIGNATURE', `1h phase=+${r.phaseOffsetBars}min`,
            `A=${r.clauseAViolations}/${r.clauseAChecked} B=${r.clauseBViolations}/${r.clauseBChecked} `
            + `movement=${r.meanAbsMovementPips}pip`
            + (r.isBucketFinalRawBar ? '  ← playhead ON the bucket final raw bar' : ''));
    }
    const finalBar = rows.find((r) => r.isBucketFinalRawBar);
    const others = rows.filter((r) => !r.isBucketFinalRawBar);
    const vanishes = finalBar.clauseBViolations === 0 && finalBar.meanAbsMovementPips === 0;
    const presentElsewhere = others.every((r) => r.clauseBViolations > 0);
    note('SIGNATURE', 'value-movement-is-zero-only-at-the-bucket-final-raw-bar',
        vanishes && presentElsewhere,
        'wrong-window signature; a staleness defect would not be phase-dependent');
    observe('SIGNATURE', 'clause-A-at-the-final-raw-bar',
        `A=${finalBar.clauseAViolations}/${finalBar.clauseAChecked} — the presentation clause has `
        + 'nothing to flag there either, because at that phase the window IS complete. This is the '
        + 'phase the product itself never visits: real stepping lands at phase 0.');
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

    // The value clause is unreachable under coarse and product stepping, because
    // the playhead never lands on a bucket's final raw bar. Stated rather than
    // left as a silent zero, and asserted where it IS reachable.
    const reachable = rows.filter((r) => r.valueChecked > 0);
    const unreachable = rows.filter((r) => r.valueChecked === 0);
    observe('LIMB2', 'value-clause-reachability',
        `reachable in ${reachable.length} cells (${reachable.reduce((a, r) => a + r.valueChecked, 0)} checks, `
        + `${reachable.reduce((a, r) => a + r.valueFailureCount, 0)} failures); structurally `
        + `unreachable in ${unreachable.length} cells because the playhead never lands on a `
        + "bucket's final raw bar there. LIMB 1 clause C supplies the numeric assertion in those "
        + 'cells instead.');
    const masterChecked = rows.reduce((a, r) => a + r.masterCompleteChecked, 0);
    const masterFail = rows.reduce((a, r) => a + r.masterCompleteValueFailureCount, 0);
    note('LIMB2', 'master-complete-value-clause-asserted', masterFail > 0,
        `${masterFail}/${masterChecked} — the presented bar differs from the full bucket whenever `
        + 'the master holds the whole window. Previously recorded but never asserted.');
    assert.ok(masterChecked > 0, 'the masterComplete clause must be evaluated somewhere');
    assert.ok(masterFail > 0,
        'masterCompleteValueFailureCount was recorded but never asserted in the prior revision');

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

test('attribution bound: the trim moves the CLOSE once the _btTfDataCache branch is live', () => {
    const r = probeTrimCloseContributionViaBtCache({ pointRows: corpusJoin, timeframe: '1h' });
    section('trimCloseBound', r);
    for (const row of r.rows) {
        observe('TRIM-CLOSE', `tick ${row.tick}`,
            `walkForwardNull=${row.walkForwardReturnedNull} preTrimClose=${row.preTrimClosePoints}pts `
            + `postTrimClose=${row.postTrimClosePoints}pts delta=${row.closeDeltaPips}pip`);
    }
    note('TRIM-CLOSE', 'bt-cache-branch-taken-so-walkforward-is-NOT-a-noop-at-native-tf',
        r.cacheBranchTaken,
        'chart.js:8908-8926 runs before the client-resample candidates; with a finer cached '
        + 'series the native-timeframe no-op result does not hold');
    note('TRIM-CLOSE', 'trim-changes-the-close-in-this-configuration',
        r.ticksWithCloseChange === r.ticksChecked,
        `${r.ticksWithCloseChange}/${r.ticksChecked} ticks, max ${r.maxAbsCloseDeltaPips}pip`);
    observe('TRIM-CLOSE', 'withdrawal',
        'the prior revision reported a 100/0 slice/trim split with the 0 bounded only by a '
        + 'fault injection that moved the HIGH. That bound did not speak to the close. On the '
        + 'close, with the backtest finer-timeframe cache populated, the trim moves it by up to '
        + `${r.maxAbsCloseDeltaPips} pip. The 100/0 split is withdrawn; it holds only for `
        + 'currentFileId === null.');
    assert.equal(r.cacheBranchTaken, true);
    assert.equal(r.ticksWithCloseChange, r.ticksChecked);
});

test('ill-formed-bar divergence: a real normalisation difference, not an attribution bound', () => {
    const out = ['15m', '1h'].map((tf) => probeTrimDivergenceOnInconsistentBar({
        pointRows: corpusMatrix, timeframe: tf, targetIdx: 1234,
    }));
    section('normalisationDivergence', out);
    for (const r of out) {
        observe('NORM', r.timeframe,
            `on a bar printed with high < close: trim changed high=${r.trimChangedHigh} `
            + `(${r.highDeltaPoints} points), low=${r.trimChangedLow}, close=${r.trimChangedClose}`);
    }
    const diverges = out.every((r) => r.trimChangedHigh);
    note('NORM', 'prepareBars-normalises-high-while-walkforward-reads-it-raw', diverges,
        '_prepareBarsForResampling sets h=max(o,c,h,l); _aggregateFinerBarsWalkForward reads b.h '
        + 'raw. Reported as a finding about the HIGH, which is the field it concerns.');
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

test('settling diagnostic on the settled subject: a genuine differential, restored', () => {
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
        'This subject is chart.data[length-2]. The trim cannot write it — but the trim is not the '
        + 'only writer. fullResampleCalls === ticks and incrementalHits === 0, so _resampleDataFull '
        + 'rebuilds the WHOLE series from the growing prefix on every tick and this bar is '
        + 'recomputed from scratch before every comparison. Its stability is therefore a real '
        + 'differential over the resample, not a structural guarantee. The prior revision '
        + 'demoted it to a "tautology control"; that was wrong and it is restored here and in '
        + 'LIMB 1 clause C.');
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
                meanAbsMovementPips: r.immutability.clauseB.movement.meanAbsPips,
                buckets: r.immutability.clauseB.checked,
                windowErrorMeanAbsPips: r.lastBarWindow.errorStats.meanAbsPips,
            });
        }
        // The product's own stepping law, which lands at phase 0 every step.
        const prod = runReplay({
            pointRows: corpusJoin, timeframe: tf, killSwitchOn: false,
            stepMode: 'product', phaseOffsetBars: 0,
        });
        const valid = perPhase.filter((p) => p.meanAbsMovementPips != null);
        const avg = valid.reduce((s, p) => s + p.meanAbsMovementPips, 0) / valid.length;
        joinRows.push({
            timeframe: tf,
            bucketMinutes: barsPerBucket,
            phasesSampled: valid.length,
            phaseAveragedMovementPips: round2(avg),
            atThirdPhaseMovementPips: perPhase.find((p) => p.phase === thirdPhase(tf))?.meanAbsMovementPips
                ?? null,
            productSteppingMovementPips: prod.immutability.clauseB.movement.meanAbsPips,
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
            `productStepping=${r.productSteppingMovementPips}pip | phaseAvg=${r.phaseAveragedMovementPips}pip `
            + `(x${r.ratioTo5m} of 5m; ${r.phasesSampled} phases) | `
            + `at-third-phase=${r.atThirdPhaseMovementPips}pip | `
            + `sibling=${r.siblingPips}pip (x${r.siblingRatioTo5m}) | PO=${r.poSignedPips ?? 'n/a'}pip`);
    }
    const oneHour = joinRows.find((r) => r.timeframe === '1h');
    observe('JOIN', '1h-four-way',
        `PO 13pip | reviewer ${REVIEWER_1H_PIPS}pip | sibling ${SIBLING_LAST_SLOT_PIPS['1h']}pip | `
        + `this packet ${oneHour.productSteppingMovementPips}pip under the product's own stepping, `
        + `${oneHour.phaseAveragedMovementPips}pip phase-averaged`);

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

test('WITHDRAWN: "window error IS truncation error" was arithmetically forced', () => {
    // The prior revision compared `corpus.cP - ref.cP` against
    // `corpus.cP - closeAt(bucketLastRawT)`. referenceBucketsPoints assigns
    // cur.cP = r.cP on every row, so ref.cP IS closeAt(bucketLastRawT): the two
    // sides were the same expression, no product value appeared on either, and
    // 0/2880 was forced. Demonstrated here so the withdrawal is verifiable, then
    // the claim it supported ("one defect, not two") is not restated.
    const tfMs = TF_MS['1h'];
    const refs = referenceBucketsPoints(corpusMatrix, tfMs);
    const closeAtT = new Map(corpusMatrix.map((r) => [r.t, r.cP]));
    let identical = 0;
    let compared = 0;
    for (const b of refs) {
        const lastRawT = b.t + tfMs - MINUTE_MS;
        if (!closeAtT.has(lastRawT)) continue;
        compared += 1;
        if (b.cP === closeAtT.get(lastRawT)) identical += 1;
    }
    section('withdrawnIdentity', {
        claim: 'window error IS truncation error → one defect, not two',
        status: 'WITHDRAWN',
        reason: 'both sides reduce to the same expression; no product value participates',
        referenceCloseEqualsLastRawClose: `${identical}/${compared}`,
    });
    note('WITHDRAWN', 'reference-close-is-by-construction-the-last-raw-close',
        identical === compared,
        `${identical}/${compared} — this is a property of any correct aggregator, carries no `
        + 'information about the product, and cannot support "one defect, not two". The '
        + 'unification claim is withdrawn.');
    assert.equal(identical, compared);
});

test('guard: product-dependent results cannot pass without the product surface', () => {
    // The reviewer found a run in which loadProductChartSurface() threw, every
    // product-touching test errored, and a "product" conclusion still passed.
    // This makes that impossible to repeat silently.
    const info = productSurfaceInfo();
    const live = matrix.length > 0
        && matrix.every((r) => r.attribution.ticks > 0 && r.fullResampleCalls > 0);
    section('productLivenessGuard', {
        methodsExtracted: info.methods.length,
        chartJsSha256: info.chartJsSha256,
        matrixCells: matrix.length,
        everyCellDroveProductCode: live,
    });
    note('GUARD', 'every-matrix-cell-actually-drove-product-code', live,
        `${matrix.length} cells, all with ticks > 0 and fullResampleCalls > 0`);
    assert.ok(info.methods.length === 14);
    assert.equal(live, true);
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
