/**
 * TAL-01918 RED — replay driver.
 *
 * The driver is a byte-verified TRANSCRIPTION of the product's static-playhead
 * install sequence (replay-system.js `updateChartDataFast`, the same three lines
 * used by `applyMultichartMirrorFrame` and `syncPanelCharts`):
 *
 *     const sliceEnd = Math.max(this.currentIndex + 1, 1);
 *     const slicedRaw = this._m20Q9PrefixSliceFixEnabled()
 *         ? this._installPlayheadPrefix(this.fullRawData, sliceEnd, this.chart)
 *         : this.fullRawData.slice(0, sliceEnd);
 *     this.chart.rawData = slicedRaw;
 *     this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);
 *     this.chart._trimLastDataBarToReplayPlayhead();
 *
 * `PRODUCT_SEQUENCE_NEEDLES` below is asserted against the real source by the
 * test, so the transcription cannot silently drift from the product.
 *
 * Every callee in that sequence is real product code: the real ReplaySystem
 * installer, the real ChartDataPipeline, the real chart.js resample and trim.
 */
import {
    loadProductChartSurface,
    loadChartDataPipeline,
    loadReplaySystem,
    withQ9KillSwitch,
    DIAG_GLOBAL,
} from './m21-b-tal01918-product-loader.mjs';
import {
    toProductBars, toPoints, MINUTE_MS, referenceBucketsPoints,
} from './m21-b-tal01918-corpus.mjs';
import {
    BarImmutabilityOracle, LastBarWindowOracle, findFormingMarker,
} from './m21-b-tal01918-oracles.mjs';

/** Exact source needles the transcription depends on (asserted by the test). */
export const PRODUCT_SEQUENCE_NEEDLES = [
    { file: 'replay-system.js', needle: 'const sliceEnd = Math.max(this.currentIndex + 1, 1);' },
    { file: 'replay-system.js', needle: '? this._installPlayheadPrefix(this.fullRawData, sliceEnd, this.chart)' },
    { file: 'replay-system.js', needle: ': this.fullRawData.slice(0, sliceEnd);' },
    { file: 'replay-system.js', needle: 'this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);' },
    { file: 'replay-system.js', needle: 'this.chart._trimLastDataBarToReplayPlayhead();' },
    // Suspect 3: the live mirror path skips the trim mid-animation.
    { file: 'replay-system.js', needle: '&& !(this.animatingCandle && (this.tickProgress || 0) > 0)' },
    // Suspect 2: synthetic animated candle pushed onto the sliced raw array.
    { file: 'replay-system.js', needle: 'sliced.push(animatedCandle);' },
    // Suspect 1: the trim writes into this.data[lastIdx].
    { file: 'chart.js', needle: 'this.data[lastIdx] = trimmed;' },
];

export const TF_MS = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
};

let _cachedSurface = null;
function surface() {
    if (!_cachedSurface) _cachedSurface = loadProductChartSurface();
    return _cachedSurface;
}

export function productSurfaceInfo() {
    const s = surface();
    return {
        chartJsSha256: s.chartJsSha256,
        chartJsBytes: s.chartJsBytes,
        methods: s.spans.map((m) => ({
            name: m.name, startLine: m.startLine, endLine: m.endLine, sha256: m.sha256,
        })),
    };
}

/**
 * Build a chart bound to the REAL ChartDataPipeline plus the REAL chart.js
 * resample/trim methods. Only environment (`replaySystem`, `currentTimeframe`,
 * `currentFileId`) is supplied by the harness.
 */
export function makeProductChart(timeframe, { countFullResamples = true } = {}) {
    const { Ctor } = surface();
    const Pipeline = loadChartDataPipeline();
    const chart = new Ctor();
    chart.currentTimeframe = timeframe;
    chart.dataVersion = 0;
    chart.data = [];
    chart.rawData = null;
    // currentFileId=null deliberately disables the `_btTfDataCache` branch of
    // _getWalkForwardOhlcToPlayhead — see COVERAGE in the report.
    chart.currentFileId = null;
    chart.isBacktestMode = true;
    chart.bumpDataVersion = function bumpDataVersion() { this.dataVersion += 1; };
    chart.dataPipeline = new Pipeline(chart);

    const counters = { fullResample: 0, prepareBars: 0 };
    if (countFullResamples) {
        const realFull = chart._resampleDataFull.bind(chart);
        chart._resampleDataFull = function counted(data, tf) {
            counters.fullResample += 1;
            return realFull(data, tf);
        };
    }
    return { chart, counters };
}

function toPointBar(b) {
    return { t: b.t, oP: toPoints(b.o), hP: toPoints(b.h), lP: toPoints(b.l), cP: toPoints(b.c) };
}

function toPointSeries(series) {
    const out = new Array(series.length);
    for (let i = 0; i < series.length; i++) out[i] = toPointBar(series[i]);
    return out;
}

/**
 * One full candle-mode replay of the corpus at one timeframe, in one
 * kill-switch state. Returns both limbs' results plus attribution.
 *
 * @param {object} opts
 * @param {Array} opts.pointRows      integer-point 1m corpus
 * @param {string} opts.timeframe
 * @param {boolean} opts.killSwitchOn true = M20-Q9 fix DISABLED (legacy slice)
 * @param {number} [opts.stride]      tick stride (1 = every raw bar)
 * @param {number} [opts.startIdx]
 */
export function runReplay({ pointRows, timeframe, killSwitchOn, stride = 1, startIdx = 0 }) {
    const tfMs = TF_MS[timeframe];
    if (!tfMs) throw new Error(`unknown timeframe ${timeframe}`);

    const master = toProductBars(pointRows);
    const rawStepMs = MINUTE_MS;
    const refBuckets = referenceBucketsPoints(pointRows, tfMs);
    const refByT = new Map(refBuckets.map((b) => [b.t, b]));
    // A bucket is complete in the master when the master holds its final raw slot.
    const masterLastT = pointRows[pointRows.length - 1].t;

    const ReplaySystem = loadReplaySystem();
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.fullRawData = master;
    rs.currentIndex = 0;
    rs.replayTimestamp = master[0].t;
    rs.rawTimeframe = '1m';

    const { chart, counters } = makeProductChart(timeframe);
    chart.replaySystem = rs;
    rs.chart = chart;

    const immut = new BarImmutabilityOracle(`${timeframe}/${killSwitchOn ? 'kill-ON' : 'kill-OFF'}`);
    const window = new LastBarWindowOracle(`${timeframe}/${killSwitchOn ? 'kill-ON' : 'kill-OFF'}`);

    const attribution = {
        ticks: 0,
        trimFiredCount: 0,
        trimChangedValueCount: 0,
        sliceErrorAbsPointsSum: 0,
        trimErrorAbsPointsSum: 0,
        totalErrorAbsPointsSum: 0,
        maxSliceErrorPoints: 0,
        maxTrimErrorPoints: 0,
        chartDataIsPipelineCacheResult: 0,
        prefixIdentities: new Set(),
        walkForwardNullOnTick: 0,
    };

    // Per-bucket settling series: first / last "apparently complete" close and
    // the settled close, all in integer points.
    const settle = new Map(); // bucketT -> {firstLastTick, firstLastC, lastLastC, finalC}

    const diagBefore = globalThis[DIAG_GLOBAL];
    globalThis[DIAG_GLOBAL] = { probes: [], enabled: true };

    const helperReadings = new Set();

    try {
        withQ9KillSwitch(killSwitchOn, () => {
            const fixEnabled = rs._m20Q9PrefixSliceFixEnabled();
            helperReadings.add(fixEnabled);

            for (let idx = startIdx; idx < master.length; idx += stride) {
                rs.currentIndex = idx;
                rs.replayTimestamp = master[idx].t;

                // ── transcribed product sequence ─────────────────────────
                const sliceEnd = Math.max(rs.currentIndex + 1, 1);
                const slicedRaw = rs._m20Q9PrefixSliceFixEnabled()
                    ? rs._installPlayheadPrefix(rs.fullRawData, sliceEnd, chart)
                    : rs.fullRawData.slice(0, sliceEnd);
                chart.rawData = slicedRaw;
                chart.data = chart.resampleData(slicedRaw, chart.currentTimeframe);

                attribution.prefixIdentities.add(slicedRaw);
                if (chart.data === chart.dataPipeline._resampleCache.result) {
                    attribution.chartDataIsPipelineCacheResult += 1;
                }

                const lastIdx = chart.data.length - 1;
                const preTrim = toPointBar(chart.data[lastIdx]);
                const preTrimRef = chart.data[lastIdx];

                chart._trimLastDataBarToReplayPlayhead();
                // ── end transcribed product sequence ─────────────────────

                const postTrimRef = chart.data[lastIdx];
                const postTrim = toPointBar(postTrimRef);
                const trimFired = postTrimRef !== preTrimRef;
                const trimChangedValue = preTrim.cP !== postTrim.cP
                    || preTrim.hP !== postTrim.hP || preTrim.lP !== postTrim.lP;

                const bucketT = postTrim.t;
                const ref = refByT.get(bucketT) || null;
                const bucketEnd = bucketT + tfMs;
                const bucketLastRawT = bucketEnd - rawStepMs;
                const rawViewComplete = master[sliceEnd - 1].t >= bucketLastRawT;
                const masterComplete = masterLastT >= bucketLastRawT;

                // ── limb 1 ──
                immut.observe(toPointSeries(chart.data), idx);

                // ── limb 2 ──
                window.observe({
                    tick: idx,
                    presented: postTrim,
                    fullBucket: ref,
                    rawViewComplete,
                    masterComplete,
                    formingMarker: findFormingMarker(postTrimRef),
                    playheadMs: rs.replayTimestamp,
                });

                // ── attribution: slice vs trim ──
                if (ref && masterComplete) {
                    const sliceErr = preTrim.cP - ref.cP;   // window error before trim
                    const trimErr = postTrim.cP - preTrim.cP; // trim's own contribution
                    const totalErr = postTrim.cP - ref.cP;
                    const abs = (x) => (x < 0 ? -x : x);
                    attribution.sliceErrorAbsPointsSum += abs(sliceErr);
                    attribution.trimErrorAbsPointsSum += abs(trimErr);
                    attribution.totalErrorAbsPointsSum += abs(totalErr);
                    if (abs(sliceErr) > attribution.maxSliceErrorPoints) {
                        attribution.maxSliceErrorPoints = abs(sliceErr);
                    }
                    if (abs(trimErr) > attribution.maxTrimErrorPoints) {
                        attribution.maxTrimErrorPoints = abs(trimErr);
                    }
                }
                attribution.ticks += 1;
                if (trimFired) attribution.trimFiredCount += 1;
                if (trimChangedValue) attribution.trimChangedValueCount += 1;

                // ── settling series (PO join) ──
                let s = settle.get(bucketT);
                if (!s) {
                    s = { bucketT, firstLastTick: idx, firstLastC: postTrim.cP, lastLastC: postTrim.cP };
                    settle.set(bucketT, s);
                } else {
                    s.lastLastC = postTrim.cP;
                }

                chart.bumpDataVersion();
            }
        });
    } finally {
        if (diagBefore === undefined) delete globalThis[DIAG_GLOBAL];
        else globalThis[DIAG_GLOBAL] = diagBefore;
    }

    // Settled close per bucket = reference full-bucket close.
    const settleRows = [];
    for (const s of settle.values()) {
        const ref = refByT.get(s.bucketT);
        if (!ref) continue;
        if (masterLastT < s.bucketT + tfMs - rawStepMs) continue; // incomplete tail bucket
        settleRows.push({
            bucketT: s.bucketT,
            firstReadDeltaPoints: ref.cP - s.firstLastC,
            lastReadDeltaPoints: ref.cP - s.lastLastC,
        });
    }

    return {
        timeframe,
        killSwitchOn,
        productHelperReadings: [...helperReadings],
        fullResampleCalls: counters.fullResample,
        distinctPrefixIdentities: attribution.prefixIdentities.size,
        chartDataIsPipelineCacheResultTicks: attribution.chartDataIsPipelineCacheResult,
        immutability: immut.result(),
        lastBarWindow: window.result(),
        attribution: {
            ticks: attribution.ticks,
            trimReplacedSlotTicks: attribution.trimFiredCount,
            trimChangedValueTicks: attribution.trimChangedValueCount,
            meanAbsSliceErrorPips: round2(attribution.sliceErrorAbsPointsSum / Math.max(1, attribution.ticks) / 10),
            meanAbsTrimErrorPips: round2(attribution.trimErrorAbsPointsSum / Math.max(1, attribution.ticks) / 10),
            meanAbsTotalErrorPips: round2(attribution.totalErrorAbsPointsSum / Math.max(1, attribution.ticks) / 10),
            maxAbsSliceErrorPips: round2(attribution.maxSliceErrorPoints / 10),
            maxAbsTrimErrorPips: round2(attribution.maxTrimErrorPoints / 10),
            sliceSharePct: attribution.totalErrorAbsPointsSum === 0 ? null
                : Math.round(100 * attribution.sliceErrorAbsPointsSum / attribution.totalErrorAbsPointsSum),
            trimSharePct: attribution.totalErrorAbsPointsSum === 0 ? null
                : Math.round(100 * attribution.trimErrorAbsPointsSum / attribution.totalErrorAbsPointsSum),
        },
        settling: summariseSettling(settleRows),
    };
}

function round2(x) { return Math.round(x * 100) / 100; }

function summariseSettling(rows) {
    if (!rows.length) return { buckets: 0 };
    let sumAbsFirst = 0;
    let sumAbsLast = 0;
    let maxAbsFirst = 0;
    let sumSignedFirst = 0;
    for (const r of rows) {
        const a = Math.abs(r.firstReadDeltaPoints);
        const b = Math.abs(r.lastReadDeltaPoints);
        sumAbsFirst += a;
        sumAbsLast += b;
        sumSignedFirst += r.firstReadDeltaPoints;
        if (a > maxAbsFirst) maxAbsFirst = a;
    }
    return {
        buckets: rows.length,
        meanAbsFirstReadDeltaPips: round2(sumAbsFirst / rows.length / 10),
        meanAbsLastReadDeltaPips: round2(sumAbsLast / rows.length / 10),
        maxAbsFirstReadDeltaPips: round2(maxAbsFirst / 10),
        meanSignedFirstReadDeltaPips: round2(sumSignedFirst / rows.length / 10),
        sampleSignedFirstReadDeltaPips: rows.slice(0, 6).map((r) => round2(r.firstReadDeltaPoints / 10)),
        signedFirstReadDeltaPoints: rows.map((r) => r.firstReadDeltaPoints),
    };
}

/* ───────────────── suspect 4: walk-forward on the native TF ───────────────── */

/**
 * Directly interrogate the real `_getWalkForwardOhlcToPlayhead` at a native
 * timeframe (display period === raw step) and at a coarse one.
 */
export function probeWalkForward(pointRows, timeframe) {
    const master = toProductBars(pointRows);
    const ReplaySystem = loadReplaySystem();
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.fullRawData = master;
    rs.currentIndex = 100;
    rs.replayTimestamp = master[100].t;
    rs.rawTimeframe = '1m';

    const { chart } = makeProductChart(timeframe, { countFullResamples: false });
    chart.replaySystem = rs;
    chart.rawData = master.slice(0, 101);

    const tfMs = TF_MS[timeframe];
    const playhead = rs.replayTimestamp;
    const bucketStart = Math.floor(playhead / tfMs) * tfMs;
    const agg = chart._getWalkForwardOhlcToPlayhead(bucketStart, playhead, tfMs);
    return {
        timeframe,
        tfMs,
        rawStepMs: chart._measureRawDataStepMs(master),
        nativeRawStepMs: chart._getNativeRawStepMs(),
        walkForwardResult: agg === null ? null : {
            cP: toPoints(agg.c), hP: toPoints(agg.h), lP: toPoints(agg.l), oP: toPoints(agg.o),
        },
        isNoOp: agg === null,
    };
}

/* ───────────── suspect 2/3: animated-candle mid-tick mirror path ───────────── */

/**
 * Transcription of `applyMultichartMirrorFrame`'s animated branch
 * (replay-system.js): slice → push synthetic animatedCandle → resample →
 * trim ONLY when not mid-animation. Returns whether an interpolated close is
 * baked into a coarse bucket that later corrects.
 */
export function probeAnimatedCandleBake({ pointRows, timeframe, targetIdx }) {
    const tfMs = TF_MS[timeframe];
    const master = toProductBars(pointRows);
    const refByT = new Map(referenceBucketsPoints(pointRows, tfMs).map((b) => [b.t, b]));

    const ReplaySystem = loadReplaySystem();
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.fullRawData = master;
    rs.rawTimeframe = '1m';

    const { chart } = makeProductChart(timeframe, { countFullResamples: false });
    chart.replaySystem = rs;

    const formTs = master[targetIdx].t;
    // Interpolated tick close: halfway between prior close and this bar's close,
    // quantised to the point grid so the payload stays integral.
    const prevCp = toPoints(master[targetIdx - 1].c);
    const thisCp = toPoints(master[targetIdx].c);
    const interpCp = Math.round((prevCp + thisCp) / 2);

    const animatedCandle = {
        t: formTs,
        o: master[targetIdx].o,
        h: Math.max(master[targetIdx].o, interpCp * 1e-5),
        l: Math.min(master[targetIdx].o, interpCp * 1e-5),
        c: interpCp * 1e-5,
        v: 1,
    };

    rs.currentIndex = Math.max(0, targetIdx - 1);
    rs.replayTimestamp = formTs;
    rs.animatingCandle = { t: formTs };
    rs.tickProgress = 3;

    const sliced = master.slice(0, targetIdx);
    sliced.push(animatedCandle);
    chart.rawData = sliced;
    chart.data = chart.resampleData(sliced, chart.currentTimeframe);
    const trimSkipped = !!(rs.animatingCandle && (rs.tickProgress || 0) > 0);
    if (!trimSkipped) chart._trimLastDataBarToReplayPlayhead();

    const lastBar = chart.data[chart.data.length - 1];
    const bakedCp = toPoints(lastBar.c);
    const bucketT = lastBar.t;
    const ref = refByT.get(bucketT);

    return {
        timeframe,
        targetIdx,
        trimSkippedMidAnimation: trimSkipped,
        bucketT,
        interpolatedClosePoints: interpCp,
        bakedClosePoints: bakedCp,
        fullBucketClosePoints: ref ? ref.cP : null,
        interpolatedCloseIsBaked: bakedCp === interpCp,
        errorVsFullBucketPips: ref ? round2((bakedCp - ref.cP) / 10) : null,
    };
}

/* ───────────────── settling diagnostic at a 1H bucket boundary ───────────────── */

/**
 * At each 1H bucket boundary, capture the finalised bucket's OHLC from
 * `chart.data` alongside a clean FULL resample of `rawData` to the same
 * playhead, and diff. Run under both kill-switch states by the caller.
 */
export function settlingDiagnostic({ pointRows, timeframe, killSwitchOn, maxBoundaries = 24 }) {
    const tfMs = TF_MS[timeframe];
    const master = toProductBars(pointRows);
    const refByT = new Map(referenceBucketsPoints(pointRows, tfMs).map((b) => [b.t, b]));

    const ReplaySystem = loadReplaySystem();
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.fullRawData = master;
    rs.rawTimeframe = '1m';
    rs.currentIndex = 0;
    rs.replayTimestamp = master[0].t;

    const { chart } = makeProductChart(timeframe, { countFullResamples: false });
    chart.replaySystem = rs;

    // A clean chart that never sees the trim and never shares the prefix — used
    // to produce the independent "clean full resample of rawData to the same
    // playhead" reference.
    const { chart: cleanChart } = makeProductChart(timeframe, { countFullResamples: false });

    const rows = [];
    withQ9KillSwitch(killSwitchOn, () => {
        for (let idx = 1; idx < master.length && rows.length < maxBoundaries; idx++) {
            const prevBucket = Math.floor(master[idx - 1].t / tfMs) * tfMs;
            const thisBucket = Math.floor(master[idx].t / tfMs) * tfMs;
            const crossed = thisBucket !== prevBucket;

            rs.currentIndex = idx;
            rs.replayTimestamp = master[idx].t;
            const sliceEnd = idx + 1;
            const slicedRaw = rs._m20Q9PrefixSliceFixEnabled()
                ? rs._installPlayheadPrefix(rs.fullRawData, sliceEnd, chart)
                : rs.fullRawData.slice(0, sliceEnd);
            chart.rawData = slicedRaw;
            chart.data = chart.resampleData(slicedRaw, chart.currentTimeframe);
            chart._trimLastDataBarToReplayPlayhead();
            chart.bumpDataVersion();

            if (!crossed) continue;

            // The bucket that just finalised is the second-to-last display bar.
            const finalIdx = chart.data.length - 2;
            if (finalIdx < 0) continue;
            const productBar = toPointBar(chart.data[finalIdx]);

            // Independent clean full resample of rawData at the same playhead.
            const cleanInput = master.slice(0, sliceEnd);
            cleanChart.dataPipeline.invalidateResampleCache();
            cleanChart.dataVersion += 1;
            const cleanSeries = cleanChart.resampleData(cleanInput, timeframe);
            const cleanBar = cleanSeries.find((b) => b.t === productBar.t);
            const ref = refByT.get(productBar.t);

            rows.push({
                tick: idx,
                bucketT: productBar.t,
                productClosePoints: productBar.cP,
                cleanResampleClosePoints: cleanBar ? toPoints(cleanBar.c) : null,
                fullBucketClosePoints: ref ? ref.cP : null,
                productVsCleanPoints: cleanBar ? productBar.cP - toPoints(cleanBar.c) : null,
                productVsFullBucketPoints: ref ? productBar.cP - ref.cP : null,
            });
        }
    });

    const anyProductVsClean = rows.some((r) => r.productVsCleanPoints !== 0);
    const anyProductVsFull = rows.some((r) => r.productVsFullBucketPoints !== 0);
    return {
        timeframe,
        killSwitchOn,
        boundaries: rows.length,
        finalisedBucketDiffersFromCleanResample: anyProductVsClean,
        finalisedBucketDiffersFromFullBucket: anyProductVsFull,
        rows: rows.slice(0, 8),
    };
}

/* ───────── bound on the "trim contributes zero" claim ───────── */

/**
 * The trim's numeric contribution is zero only while the two aggregators agree.
 * They read the raw bar differently: `_prepareBarsForResampling` normalises
 * `h = max(o,c,h,l)` before bucketing, while `_aggregateFinerBarsWalkForward`
 * reads `b.h` raw. Feed one bar whose high is below its close and the trim's
 * contribution stops being zero — which bounds the claim instead of overstating it.
 */
export function probeTrimDivergenceOnInconsistentBar({ pointRows, timeframe, targetIdx }) {
    const tfMsForBucket = TF_MS[timeframe];
    const master = toProductBars(pointRows);
    // Fault injection: one ill-formed print whose CLOSE is the bucket extreme but
    // whose HIGH field is below it. `_prepareBarsForResampling` lifts the bucket
    // high to that close; `_aggregateFinerBarsWalkForward` (used by the trim)
    // reads `b.h` raw and does not.
    const bucketStart = Math.floor(master[targetIdx].t / tfMsForBucket) * tfMsForBucket;
    let bucketMaxHigh = -Infinity;
    for (const b of master) {
        if (b.t < bucketStart) continue;
        if (b.t > master[targetIdx].t) break;
        if (b.h > bucketMaxHigh) bucketMaxHigh = b.h;
    }
    const victim = { ...master[targetIdx] };
    victim.c = Math.round((bucketMaxHigh + 0.0020) * 1e5) / 1e5;
    victim.h = victim.o;
    victim.l = Math.min(victim.o, victim.l);
    master[targetIdx] = victim;

    const ReplaySystem = loadReplaySystem();
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.fullRawData = master;
    rs.rawTimeframe = '1m';
    rs.currentIndex = targetIdx;
    rs.replayTimestamp = master[targetIdx].t;

    const { chart } = makeProductChart(timeframe, { countFullResamples: false });
    chart.replaySystem = rs;
    const slicedRaw = master.slice(0, targetIdx + 1);
    chart.rawData = slicedRaw;
    chart.data = chart.resampleData(slicedRaw, timeframe);
    const lastIdx = chart.data.length - 1;
    const pre = toPointBar(chart.data[lastIdx]);
    chart._trimLastDataBarToReplayPlayhead();
    const post = toPointBar(chart.data[lastIdx]);

    return {
        timeframe,
        targetIdx,
        preTrim: pre,
        postTrim: post,
        trimChangedHigh: pre.hP !== post.hP,
        trimChangedLow: pre.lP !== post.lP,
        trimChangedClose: pre.cP !== post.cP,
        highDeltaPoints: post.hP - pre.hP,
    };
}

/* ───────── frozen-playhead cross-timeframe coherence (PO observation 2) ───────── */

export function frozenPlayheadAcrossTimeframes({ pointRows, idx, timeframes }) {
    const master = toProductBars(pointRows);
    const out = [];
    for (const tf of timeframes) {
        const ReplaySystem = loadReplaySystem();
        const rs = Object.create(ReplaySystem.prototype);
        rs.isActive = true;
        rs.fullRawData = master;
        rs.rawTimeframe = '1m';
        rs.currentIndex = idx;
        rs.replayTimestamp = master[idx].t;

        const { chart } = makeProductChart(tf, { countFullResamples: false });
        chart.replaySystem = rs;
        const slicedRaw = master.slice(0, idx + 1);
        chart.rawData = slicedRaw;
        chart.data = chart.resampleData(slicedRaw, tf);
        chart._trimLastDataBarToReplayPlayhead();
        const last = chart.data[chart.data.length - 1];
        out.push({ timeframe: tf, lastBarT: last.t, lastClosePoints: toPoints(last.c) });
    }
    const closes = new Set(out.map((r) => r.lastClosePoints));
    return { idx, playheadMs: master[idx].t, rows: out, distinctCloses: closes.size };
}
