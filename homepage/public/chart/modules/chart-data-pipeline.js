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
        }

        bumpDisplayVersion() {
            this._displayCache.key = '';
            this._displayCache.series = null;
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
                    cache.sourceLen = source.length;
                    cache.dataVersion = dv;
                    cache.result = appended;
                    return appended;
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
            return full;
        }

        _tryIncrementalResample(source, prevResampled, tf, chart) {
            const lastRaw = source[source.length - 1];
            if (!lastRaw || !Number.isFinite(lastRaw.t)) return null;

            const timeframeMs = chart.parseTimeframe(tf);
            if (!Number.isFinite(timeframeMs) || timeframeMs <= 0) return null;

            const bucketStart = Math.floor(lastRaw.t / timeframeMs) * timeframeMs;
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

            if (slice.length > maxBuckets || spacing < ZOOMED_OUT_SLOT_PX) {
                const slotBudget = Math.ceil(plotWidth / ZOOMED_OUT_SLOT_PX);
                if (slice.length > slotBudget || spacing < ZOOMED_OUT_SLOT_PX) {
                    return this._applyRenderBudgetByPixelColumn(slice, plotWidth, m, offsetX, spacing, baseIndex);
                }
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
                const first = slice[i0];
                let h = first.h;
                let l = first.l;
                let volSum = 0;
                for (let k = i0; k <= i1; k++) {
                    const row = slice[k];
                    if (!row) continue;
                    if (row.h > h) h = row.h;
                    if (row.l < l) l = row.l;
                    volSum += Number(row.v) || 0;
                }
                const midIdx = base + Math.floor((i0 + i1) / 2);
                buckets.push({
                    t: first.t,
                    o: first.o,
                    h,
                    l,
                    c: slice[i1].c,
                    v: volSum,
                    midIdx,
                    _pipelineBucket: true,
                });
            }
            return buckets;
        }

        /**
         * Pixel-slot OHLC merge for zoomed-out views (1px body + 1px gap per slot).
         * Iterates source index range directly — avoids allocating a viewport slice array
         * on every wheel frame (major GC + CPU win when zoomed out).
         */
        _pixelSlotAggregateFromRange(source, visStart, visEnd, plotWidth, m, offsetX, spacing, sliceMode = false) {
            const slotPx = ZOOMED_OUT_SLOT_PX;
            const numSlots = Math.max(1, Math.ceil(plotWidth / slotPx));
            const slots = new Array(numSlots);
            const i0 = Math.max(0, visStart | 0);
            const i1 = sliceMode ? Math.min(source.length, visEnd | 0) : Math.min(source.length, visEnd | 0);

            for (let idx = i0; idx < i1; idx++) {
                const d = sliceMode ? source[idx - i0] : source[idx];
                if (!d) continue;
                const dataIdx = sliceMode ? (visStart + (idx - i0)) : idx;
                const x = m.l + dataIdx * spacing + offsetX;
                const slot = Math.floor((x - m.l) / slotPx);
                if (slot < 0 || slot >= numSlots) continue;

                let bucket = slots[slot];
                if (!bucket) {
                    slots[slot] = {
                        t: d.t,
                        o: d.o,
                        h: d.h,
                        l: d.l,
                        c: d.c,
                        v: Number(d.v) || 0,
                        midIdx: dataIdx,
                        _pixelX: m.l + slot * slotPx,
                        _pipelineBucket: true,
                    };
                } else {
                    if (d.h > bucket.h) bucket.h = d.h;
                    if (d.l < bucket.l) bucket.l = d.l;
                    bucket.c = d.c;
                    bucket.v += Number(d.v) || 0;
                    bucket.midIdx = dataIdx;
                }
            }

            const out = [];
            for (let s = 0; s < numSlots; s++) {
                if (slots[s]) out.push(slots[s]);
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

            const cacheKey = [
                dv,
                tf,
                source.length,
                offsetX.toFixed(2),
                spacing.toFixed(4),
                chart.candleWidth,
                plotWidth,
                maxBudget,
                pixelLod ? 'px' : 'idx',
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
            const fastInteraction = typeof chart._isInteractionFastRender === 'function'
                && chart._isInteractionFastRender();
            if (fastInteraction && pixelLod) {
                const lodCap = Math.ceil(plotWidth / ZOOMED_OUT_SLOT_PX) + VIEWPORT_BUFFER_BARS;
                const center = Math.floor((visStart + visEnd) / 2);
                visStart = Math.max(0, center - lodCap);
                visEnd = Math.min(resampled.length, center + lodCap);
            } else if (typeof chart._normalizeViewportBarRange === 'function') {
                const norm = chart._normalizeViewportBarRange(visStart, visEnd, resampled.length, plotWidth, spacing, VIEWPORT_BUFFER_BARS);
                visStart = norm.visStart;
                visEnd = norm.visEnd;
            } else if (visEnd <= visStart && resampled.length > 0) {
                visEnd = Math.min(resampled.length, visStart + Math.max(2, Math.ceil(plotWidth / Math.max(spacing, 1e-6)) + VIEWPORT_BUFFER_BARS));
            }

            let display;
            if (visEnd <= visStart) {
                display = [];
            } else if (pixelLod || (visEnd - visStart) > plotWidth) {
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
         */
        capReplayFullRawData(fullRawData, replaySystem) {
            if (!Array.isArray(fullRawData) || fullRawData.length === 0) return fullRawData;

            const cap = chartRawCap(this.chart);
            if (fullRawData.length <= cap) return fullRawData;

            const floorIdx = Math.max(0, replaySystem?.sessionStartIndex || 0);
            const playhead = typeof replaySystem?.currentIndex === 'number'
                ? replaySystem.currentIndex
                : fullRawData.length - 1;
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
        const base = chart._REPLAY_RAW_CAP || chart._RAW_DATA_CAP || 8000;
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
