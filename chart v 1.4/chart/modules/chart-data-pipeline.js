/**
 * ChartDataPipeline — viewport-scoped display series for large backtests.
 * Master series (chart.data / replay fullRawData) stays unchanged for orders/replay.
 */
(function (global) {
    'use strict';

    const RENDER_BAR_BUDGET = 500;
    const VIEWPORT_BUFFER_BARS = 48;
    const INITIAL_BACKTEST_BARS = 800;
    const LARGE_SERIES_THRESHOLD = 8000;
    const REPLAY_RAW_CAP = 5000;
    const REPLAY_CONTEXT_BARS = 500;
    /** Match chart.js TV_ZOOMED_OUT_SLOT_PX — 1px body + 1px gutter per slot. */
    const ZOOMED_OUT_SLOT_PX = 2;

    /**
     * Kill-switch for the forming-bucket refresh branch. Read on EVERY call so it can be
     * flipped mid-session with no reload. TRUTHY disables — not `=== true`.
     */
    function _mcFormingBucketRefreshDisabled() {
        return typeof global !== 'undefined'
            && !!global.__TALARIA_DISABLE_MC_FORMING_BUCKET_REFRESH_V1;
    }

    class ChartDataPipeline {
        constructor(chart) {
            this.chart = chart;
            this.viewportData = null;
            this._resampleCache = {
                tf: null,
                sourceRef: null,
                sourceLen: -1,
                dataVersion: -1,
                result: null,
            };
            this._displayCache = {
                key: '',
                series: null,
            };
            this._panDisplayCache = null;
        }

        static get RENDER_BAR_BUDGET() { return RENDER_BAR_BUDGET; }
        static get VIEWPORT_BUFFER_BARS() { return VIEWPORT_BUFFER_BARS; }
        static get INITIAL_BACKTEST_BARS() { return INITIAL_BACKTEST_BARS; }
        static get LARGE_SERIES_THRESHOLD() { return LARGE_SERIES_THRESHOLD; }
        static get REPLAY_RAW_CAP() { return REPLAY_RAW_CAP; }
        static get REPLAY_CONTEXT_BARS() { return REPLAY_CONTEXT_BARS; }

        attachViewportManager(viewportManager) {
            this.viewportData = viewportManager;
        }

        invalidateResampleCache() {
            this._resampleCache.sourceRef = null;
            this._resampleCache.sourceLen = -1;
            this._resampleCache.result = null;
            this._displayCache.key = '';
            this._displayCache.series = null;
            this._panDisplayCache = null;
        }

        bumpDisplayVersion() {
            this._displayCache.key = '';
            this._displayCache.series = null;
            this._panDisplayCache = null;
        }

        invalidatePanDisplayCache() {
            this._displayCache.key = '';
            this._displayCache.series = null;
            this._panDisplayCache = null;
        }

        /**
         * Incremental resample: O(1) when replay appends one raw bar.
         */
        getResampledSeries(source, timeframe, dataVersion) {
            const chart = this.chart;
            if (!Array.isArray(source) || source.length === 0) return [];

            const tf = String(timeframe || chart.currentTimeframe || '1m').toLowerCase().trim();
            const cache = this._resampleCache;
            const dv = dataVersion ?? chart.dataVersion ?? 0;

            if (
                cache.sourceRef === source
                && cache.tf === tf
                && cache.dataVersion === dv
                && cache.sourceLen === source.length
                && Array.isArray(cache.result)
            ) {
                return cache.result;
            }

            if (
                cache.sourceRef === source
                && cache.tf === tf
                && cache.sourceLen === source.length - 1
                && source.length > 0
                && Array.isArray(cache.result)
                && cache.result.length > 0
                && typeof chart.parseTimeframe === 'function'
            ) {
                const appended = this._tryIncrementalResample(source, cache.result, tf, chart);
                if (appended) {
                    // M20-Q9 measurement: "incremental fired" measured directly,
                    // never inferred from chart._mcDiag.resamples.
                    if (chart._mcDiag) chart._mcDiag.incrementalResamples++;
                    cache.sourceLen = source.length;
                    cache.dataVersion = dv;
                    cache.result = appended;
                    return appended;
                }
            }

            // MONSTER-2: replay bumps dataVersion on every tick, but the source length
            // only grows when a bar CLOSES. On every other tick the last raw bar mutates
            // in place (the forming bar), so the exact branch misses on dataVersion and
            // the incremental branch misses on length — and a series of any size was
            // being resampled from scratch. Only the final bucket is actually dirty.
            //
            // This makes the same append-only assumption about the prefix that the
            // incremental branch above already makes; it is not a weaker guarantee.
            if (
                !_mcFormingBucketRefreshDisabled()
                && cache.sourceRef === source
                && cache.tf === tf
                && cache.sourceLen === source.length
                && cache.dataVersion !== dv
                && Array.isArray(cache.result)
                && cache.result.length > 0
                && typeof chart.parseTimeframe === 'function'
            ) {
                const refreshed = this._tryRefreshFormingBucket(source, cache.result, tf, chart);
                if (refreshed) {
                    if (chart._mcDiag && typeof chart._mcDiag.formingBucketRefreshes === 'number') {
                        chart._mcDiag.formingBucketRefreshes++;
                    }
                    cache.dataVersion = dv;
                    cache.result = refreshed;
                    return refreshed;
                }
            }

            const full = typeof chart._resampleDataFull === 'function'
                ? chart._resampleDataFull(source, tf)
                : (typeof chart.resampleData === 'function' ? chart.resampleData(source, tf) : source);

            cache.tf = tf;
            cache.sourceRef = source;
            cache.sourceLen = source.length;
            cache.dataVersion = dv;
            cache.result = full;
            let seedMaxRawT = -Infinity;
            for (let i = 0; i < source.length; i++) {
                const st = source[i] && source[i].t;
                if (Number.isFinite(st) && st > seedMaxRawT) seedMaxRawT = st;
            }
            cache.maxRawT = seedMaxRawT;
            return full;
        }

        /**
         * Rebuild ONLY the final bucket from the raw bars belonging to it, for the case
         * where the source did not grow but its forming bar mutated.
         *
         * Returns null — falling through to a full resample — whenever the bucket the
         * last raw bar belongs to is not the bucket the cached tail already represents.
         * That guard is what makes this safe for timeframes whose bucketing does not
         * follow floor(t/tfMs)*tfMs (weeks, months): the computed start will not match
         * the cached tail, so this branch simply never fires and the full path runs.
         */
        _tryRefreshFormingBucket(source, prevResampled, tf, chart) {
            const timeframeMs = chart.parseTimeframe(tf);
            if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) return null;

            const lastRaw = source[source.length - 1];
            if (!lastRaw || !Number.isFinite(lastRaw.t)) return null;

            const bucketStart = chart._sessionBucketStart(lastRaw.t, tf, timeframeMs);
            const lastBucket = prevResampled[prevResampled.length - 1];
            if (!lastBucket || lastBucket.t !== bucketStart) return null;

            // Walk back over the raw bars inside this bucket so a mutation anywhere in
            // the forming bucket is picked up, not just one on the final bar. Bounded by
            // bars-per-bucket, never by series length.
            let firstIdx = source.length - 1;
            while (firstIdx > 0) {
                const prev = source[firstIdx - 1];
                if (!prev || !Number.isFinite(prev.t)) break;
                if (chart._sessionBucketStart(prev.t, tf, timeframeMs) !== bucketStart) break;
                firstIdx--;
            }

            const first = source[firstIdx];
            if (!first) return null;

            let h = first.h;
            let l = first.l;
            let v = Number(first.v) || 0;
            for (let k = firstIdx + 1; k < source.length; k++) {
                const bar = source[k];
                if (!bar) continue;
                if (bar.h > h) h = bar.h;
                if (bar.l < l) l = bar.l;
                v += Number(bar.v) || 0;
            }

            const out = prevResampled.slice();
            out[out.length - 1] = { t: bucketStart, o: first.o, h, l, c: lastRaw.c, v };
            return out;
        }

        _tryIncrementalResample(source, prevResampled, tf, chart) {
            const lastRaw = source[source.length - 1];
            if (!lastRaw || !Number.isFinite(lastRaw.t)) return null;

            const cache = this._resampleCache;
            const maxRawT = cache ? cache.maxRawT : undefined;
            // Fail closed: an unseeded maximum cannot prove ordering.
            if (!Number.isFinite(maxRawT)) return null;
            if (lastRaw.t < maxRawT) return null;
            cache.maxRawT = lastRaw.t;

            const timeframeMs = chart.parseTimeframe(tf);
            if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) return null;

            const bucketStart = chart._sessionBucketStart(lastRaw.t, tf, timeframeMs);
            const out = prevResampled.slice();
            const lastBucket = out[out.length - 1];

            if (lastBucket && lastBucket.t === bucketStart) {
                lastBucket.h = Math.max(lastBucket.h, lastRaw.h);
                lastBucket.l = Math.min(lastBucket.l, lastRaw.l);
                lastBucket.c = lastRaw.c;
                lastBucket.v = (Number(lastBucket.v) || 0) + (Number(lastRaw.v) || 0);
                return out;
            }

            out.push({
                t: bucketStart,
                o: lastRaw.o,
                h: lastRaw.h,
                l: lastRaw.l,
                c: lastRaw.c,
                v: Number(lastRaw.v) || 0,
            });
            return out;
        }

        /**
         * Visible index range from offsetX and plot geometry (matches chart pan math).
         */
        sliceByViewport(resampled, viewport) {
            if (!Array.isArray(resampled) || resampled.length === 0) return [];

            const chart = this.chart;
            const m = chart.margin || { l: 60, r: 60 };
            const plotWidth = viewport.plotWidth != null
                ? viewport.plotWidth
                : Math.max(1, (chart.w || 800) - m.l - m.r);
            const spacing = viewport.spacing != null
                ? viewport.spacing
                : (typeof chart.getCandleSpacing === 'function' ? chart.getCandleSpacing() : 8);
            const offsetX = viewport.offsetX != null ? viewport.offsetX : (chart.offsetX || 0);
            const buf = viewport.bufferBars != null ? viewport.bufferBars : VIEWPORT_BUFFER_BARS;

            const visStart = Math.max(0, -Math.floor(offsetX / spacing) - buf);
            const visEnd = Math.min(
                resampled.length,
                -Math.floor(offsetX / spacing) + Math.ceil(plotWidth / spacing) + buf
            );

            if (visEnd <= visStart) return [];
            return resampled.slice(visStart, visEnd);
        }

        /**
         * Pre-bucket OHLC for render (same semantics as chart._aggregateVisibleOhlcvBuckets).
         */
        applyRenderBudget(slice, maxBars, baseIndex) {
            if (!slice || slice.length === 0) return [];
            const chart = this.chart;
            const m = chart && chart.margin ? chart.margin : { l: 60, r: 60 };
            const plotWidth = Math.max(1, (chart && chart.w ? chart.w : 800) - m.l - m.r);
            const spacing = chart && typeof chart.getCandleSpacing === 'function' ? chart.getCandleSpacing() : 8;
            const offsetX = chart && chart.offsetX ? chart.offsetX : 0;
            const maxBuckets = maxBars != null ? maxBars : RENDER_BAR_BUDGET;

            // Always pixel-slot merge when over budget — the old slotBudget gate left a
            // 500–600 bar dead zone (step buckets without _pixelX) where candles vanished
            // until zooming out far enough to cross plotWidth.
            if (slice.length > maxBuckets || spacing < ZOOMED_OUT_SLOT_PX) {
                return this._applyRenderBudgetByPixelColumn(slice, plotWidth, m, offsetX, spacing, baseIndex);
            }

            if (slice.length <= maxBuckets) {
                const base = baseIndex || 0;
                return slice.map((d, i) => {
                    if (d && Number.isFinite(d.midIdx)) return d;
                    return Object.assign({}, d, { midIdx: base + i });
                });
            }

            const n = slice.length;
            const numBuckets = Math.min(maxBuckets, n);
            const step = n / numBuckets;
            const base = baseIndex || 0;
            const buckets = [];

            for (let b = 0; b < numBuckets; b++) {
                const i0 = Math.floor(b * step);
                const i1 = Math.min(n - 1, Math.floor((b + 1) * step) - 1);
                if (i0 > i1) continue;
                const ohlcGap = (a, bRow) => {
                    if (!a || !bRow) return false;
                    const ref = Math.abs(a.h + a.l + bRow.h + bRow.l) * 0.25;
                    const eps = Math.max(1e-8, ref * 2.5e-5);
                    return bRow.l > a.h + eps || bRow.h < a.l - eps;
                };
                let segStart = i0;
                for (let k = i0; k <= i1; k++) {
                    const row = slice[k];
                    if (!row) continue;
                    if (k > segStart && ohlcGap(slice[k - 1], row)) {
                        const first = slice[segStart];
                        let h = first.h;
                        let l = first.l;
                        let volSum = 0;
                        for (let j = segStart; j < k; j++) {
                            const r = slice[j];
                            if (!r) continue;
                            if (r.h > h) h = r.h;
                            if (r.l < l) l = r.l;
                            volSum += Number(r.v) || 0;
                        }
                        buckets.push({
                            t: first.t,
                            o: first.o,
                            h,
                            l,
                            c: slice[k - 1].c,
                            v: volSum,
                            midIdx: base + Math.floor((segStart + k - 1) / 2),
                            _pipelineBucket: true,
                        });
                        segStart = k;
                    }
                }
                if (segStart <= i1) {
                    const first = slice[segStart];
                    let h = first.h;
                    let l = first.l;
                    let volSum = 0;
                    for (let k = segStart; k <= i1; k++) {
                        const row = slice[k];
                        if (!row) continue;
                        if (row.h > h) h = row.h;
                        if (row.l < l) l = row.l;
                        volSum += Number(row.v) || 0;
                    }
                    buckets.push({
                        t: first.t,
                        o: first.o,
                        h,
                        l,
                        c: slice[i1].c,
                        v: volSum,
                        midIdx: base + Math.floor((segStart + i1) / 2),
                        _pipelineBucket: true,
                    });
                }
            }
            return buckets;
        }

        /**
         * Pixel-slot OHLC merge for zoomed-out views (1px body + 1px gap per slot).
         * Buckets by data index (not screen x) so pan cannot rematerialize OHLC/color;
         * only draw x (_pixelX) scrolls with offsetX. Splits on price gaps for sessions.
         */
        _pixelSlotAggregateFromRange(source, visStart, visEnd, plotWidth, m, offsetX, spacing, sliceMode = false) {
            const slotPx = ZOOMED_OUT_SLOT_PX;
            const sp = Math.max(1e-9, Number(spacing) || 1e-9);
            const barsPerSlot = Math.max(1, Math.round(slotPx / sp));
            const slotMap = new Map();
            const i0 = Math.max(0, visStart | 0);
            const i1 = sliceMode ? Math.min(source.length, visEnd | 0) : Math.min(source.length, visEnd | 0);
            const plotLeft = m.l;
            const plotRight = m.l + Math.max(1, plotWidth);

            const ohlcGap = (a, b) => {
                if (!a || !b) return false;
                const ref = Math.abs(a.h + a.l + b.h + b.l) * 0.25;
                const eps = Math.max(1e-8, ref * 2.5e-5);
                return b.l > a.h + eps || b.h < a.l - eps;
            };
            const newBucket = (d, dataIdx, pixelX) => ({
                t: d.t,
                o: d.o,
                h: d.h,
                l: d.l,
                c: d.c,
                v: Number(d.v) || 0,
                midIdx: dataIdx,
                _pixelX: pixelX,
                _pipelineBucket: true,
            });
            const mergeBar = (dataSlot, dataIdx, d, pixelX) => {
                let segs = slotMap.get(dataSlot);
                if (!segs) {
                    slotMap.set(dataSlot, [newBucket(d, dataIdx, pixelX)]);
                    return;
                }
                const last = segs[segs.length - 1];
                if (ohlcGap(last, d)) {
                    segs.push(newBucket(d, dataIdx, pixelX));
                    return;
                }
                if (d.h > last.h) last.h = d.h;
                if (d.l < last.l) last.l = d.l;
                last.c = d.c;
                last.v += Number(d.v) || 0;
                last.midIdx = dataIdx;
                last._pixelX = pixelX;
            };

            for (let idx = i0; idx < i1; idx++) {
                const d = sliceMode ? source[idx - i0] : source[idx];
                if (!d) continue;
                const dataIdx = sliceMode ? (visStart + (idx - i0)) : idx;
                const dataSlot = Math.floor(dataIdx / barsPerSlot);
                const anchorIdx = dataSlot * barsPerSlot + (barsPerSlot - 1) / 2;
                const pixelX = plotLeft + anchorIdx * sp + offsetX;
                if (pixelX < plotLeft - slotPx || pixelX > plotRight + slotPx) continue;
                mergeBar(dataSlot, dataIdx, d, pixelX);
            }

            const keys = Array.from(slotMap.keys()).sort((a, b) => a - b);
            const out = [];
            for (let k = 0; k < keys.length; k++) {
                const segs = slotMap.get(keys[k]);
                if (!segs) continue;
                for (let j = 0; j < segs.length; j++) {
                    if (segs[j]) out.push(segs[j]);
                }
            }
            return out;
        }

        _applyRenderBudgetByPixelColumn(slice, plotWidth, m, offsetX, spacing, baseIndex) {
            const base = baseIndex || 0;
            return this._pixelSlotAggregateFromRange(slice, base, base + slice.length, plotWidth, m, offsetX, spacing, true);
        }

        /**
         * Build display series for paint: resample → viewport slice → render budget.
         */
        buildDisplaySeries(options = {}) {
            const chart = this.chart;
            const source = options.source != null
                ? options.source
                : (Array.isArray(chart.data) && chart.data.length > 0
                    ? chart.data
                    : chart.rawData);
            const tf = options.timeframe || chart.currentTimeframe;
            const dv = chart.dataVersion ?? 0;

            if (!Array.isArray(source) || source.length === 0) return [];

            const usePipeline = chart.isBacktestMode
                || source.length > LARGE_SERIES_THRESHOLD
                || (chart.totalCandles && chart.totalCandles > LARGE_SERIES_THRESHOLD)
                || (typeof chart._shouldUseDisplayPipeline === 'function' && chart._shouldUseDisplayPipeline());

            if (!usePipeline) {
                return source;
            }

            const m = chart.margin || { l: 60, r: 60 };
            const plotWidth = Math.max(1, (chart.w || 800) - m.l - m.r);
            const spacing = typeof chart.getCandleSpacing === 'function' ? chart.getCandleSpacing() : 8;
            const offsetX = chart.offsetX || 0;
            const pixelLod = spacing < ZOOMED_OUT_SLOT_PX;
            const maxBudget = pixelLod
                ? Math.ceil(plotWidth / ZOOMED_OUT_SLOT_PX)
                : (chart.isBacktestMode
                    ? RENDER_BAR_BUDGET
                    : Math.min(RENDER_BAR_BUDGET * 2, RENDER_BAR_BUDGET + 400));

            const interactionFast = typeof chart._isInteractionFastRender === 'function'
                && chart._isInteractionFastRender();
            const offsetKey = interactionFast
                ? Math.round(offsetX / Math.max(spacing, ZOOMED_OUT_SLOT_PX))
                : offsetX.toFixed(2);

            const cacheKey = [
                dv,
                tf,
                source.length,
                offsetKey,
                spacing.toFixed(4),
                chart.candleWidth,
                plotWidth,
                maxBudget,
                pixelLod ? 'px' : 'idx',
                interactionFast ? 'fast' : 'full',
            ].join('|');

            if (this._displayCache.key === cacheKey && this._displayCache.series) {
                return this._displayCache.series;
            }

            const resampled = this.getResampledSeries(source, tf, dv);
            let visStart = Math.max(0, -Math.floor(offsetX / spacing) - VIEWPORT_BUFFER_BARS);
            let visEnd = Math.min(
                resampled.length,
                -Math.floor(offsetX / spacing) + Math.ceil(plotWidth / spacing) + VIEWPORT_BUFFER_BARS
            );
            if (typeof chart._normalizeViewportBarRange === 'function') {
                const norm = chart._normalizeViewportBarRange(visStart, visEnd, resampled.length, plotWidth, spacing, VIEWPORT_BUFFER_BARS);
                visStart = norm.visStart;
                visEnd = norm.visEnd;
            } else if (visEnd <= visStart && resampled.length > 0) {
                visEnd = Math.min(resampled.length, visStart + Math.max(2, Math.ceil(plotWidth / Math.max(spacing, 1e-6)) + VIEWPORT_BUFFER_BARS));
            }

            let display;
            const visSpan = visEnd - visStart;
            const usePixelAggregate = pixelLod || visSpan > plotWidth || visSpan > maxBudget;
            if (visEnd <= visStart) {
                display = [];
            } else if (usePixelAggregate) {
                display = this._pixelSlotAggregateFromRange(resampled, visStart, visEnd, plotWidth, m, offsetX, spacing);
            } else if (visEnd - visStart <= maxBudget) {
                display = new Array(visEnd - visStart);
                for (let i = visStart; i < visEnd; i++) {
                    const d = resampled[i];
                    display[i - visStart] = (d && Number.isFinite(d.midIdx))
                        ? d
                        : Object.assign({}, d, { midIdx: i });
                }
            } else {
                display = this.applyRenderBudget(
                    resampled.slice(visStart, visEnd),
                    maxBudget,
                    visStart
                );
            }

            this._displayCache.key = cacheKey;
            this._displayCache.series = display;
            chart.displaySeries = display;
            return display;
        }

        /**
         * Evict replay fullRawData bars before session floor / far left of playhead.
         * Playhead is timestamp-anchored when `replayTimestamp` is available so a stale
         * `currentIndex` cannot shift the window and teleport the next seek.
         */
        capReplayFullRawData(fullRawData, replaySystem) {
            if (!Array.isArray(fullRawData) || fullRawData.length === 0) return fullRawData;

            const cap = chartRawCap(this.chart);
            if (fullRawData.length <= cap) return fullRawData;

            const floorIdx = Math.max(0, replaySystem?.sessionStartIndex || 0);
            let playhead = typeof replaySystem?.currentIndex === 'number'
                ? replaySystem.currentIndex
                : fullRawData.length - 1;
            const ts = Number(replaySystem?.replayTimestamp);
            if (Number.isFinite(ts)) {
                let lo = 0;
                let hi = fullRawData.length - 1;
                let hit = -1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    const t = Number(fullRawData[mid]?.t);
                    if (!Number.isFinite(t)) {
                        lo = mid + 1;
                        continue;
                    }
                    if (t <= ts) {
                        hit = mid;
                        lo = mid + 1;
                    } else {
                        hi = mid - 1;
                    }
                }
                if (hit >= 0) playhead = hit;
            }
            playhead = Math.max(0, Math.min(playhead, fullRawData.length - 1));
            const contextBars = REPLAY_CONTEXT_BARS;
            const minStart = Math.max(0, Math.min(floorIdx, playhead - contextBars));
            let start = Math.max(minStart, fullRawData.length - cap);

            // Drop bars far behind playhead (keep context window only).
            const behindCut = Math.max(minStart, playhead - contextBars);
            start = Math.max(start, behindCut);

            const trimmed = fullRawData.slice(start);
            if (replaySystem) {
                replaySystem.currentIndex = Math.max(0, playhead - start);
                if (typeof replaySystem.sessionStartIndex === 'number') {
                    replaySystem.sessionStartIndex = Math.max(0, floorIdx - start);
                }
            }
            return trimmed;
        }

        async loadForVisibleRange(startTs, endTs) {
            if (!this.viewportData || !this.viewportData.fileId) return [];
            return this.viewportData.loadViewport(startTs, endTs);
        }
    }

    function chartRawCap(chart) {
        const pipelineCap = REPLAY_RAW_CAP;
        const tfCap = typeof chart._getRawDataCap === 'function'
            ? chart._getRawDataCap()
            : null;
        const base = tfCap != null
            ? tfCap
            : (chart._REPLAY_RAW_CAP || chart._RAW_DATA_CAP || 8000);
        if (chart.isBacktestMode) return Math.min(base, pipelineCap);
        return base;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChartDataPipeline;
    }
    if (typeof global !== 'undefined') {
        global.ChartDataPipeline = ChartDataPipeline;
    }
})(typeof window !== 'undefined' ? window : global);
