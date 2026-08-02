/**
 * indicator-performance.js — Shared indicator calc/render optimizations.
 * Loaded before chart-indicators-full.js; exposes global.IndicatorPerf.
 */
(function (global) {
    'use strict';

    /** O(n) sliding-window SMA on nullable numeric series. */
    function rollingSmaFast(arr, period) {
        const p = Math.max(1, period | 0);
        const n = arr.length;
        const out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = null;
        if (n < p) return out;

        let sum = 0;
        let validCount = 0;
        for (let i = 0; i < p; i++) {
            const v = arr[i];
            if (v != null && !isNaN(v)) {
                sum += v;
                validCount++;
            }
        }
        if (validCount === p) out[p - 1] = sum / p;

        for (let i = p; i < n; i++) {
            const leaving = arr[i - p];
            const entering = arr[i];
            if (leaving != null && !isNaN(leaving)) {
                sum -= leaving;
                validCount--;
            }
            if (entering != null && !isNaN(entering)) {
                sum += entering;
                validCount++;
            }
            out[i] = validCount === p ? sum / p : null;
        }
        return out;
    }

    /** O(n) sliding-window WMA on nullable numeric series. */
    function rollingWmaFast(arr, period) {
        const p = Math.max(2, period | 0);
        const denom = (p * (p + 1)) / 2;
        const n = arr.length;
        const out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = null;
        if (n < p) return out;

        for (let i = p - 1; i < n; i++) {
            let sum = 0;
            let ok = true;
            for (let j = 0; j < p; j++) {
                const v = arr[i - j];
                if (v == null || isNaN(v)) { ok = false; break; }
                sum += v * (p - j);
            }
            if (ok) out[i] = sum / denom;
        }
        return out;
    }

    /** Pack OHLCV into Float64Array for fast worker transfer ([t,o,h,l,c,v] × n). */
    function packBarsCompact(bars) {
        const n = bars ? bars.length : 0;
        const packed = new Float64Array(n * 6);
        for (let i = 0; i < n; i++) {
            const b = bars[i];
            const o = i * 6;
            packed[o] = b.t;
            packed[o + 1] = b.o != null ? b.o : b.open;
            packed[o + 2] = b.h != null ? b.h : b.high;
            packed[o + 3] = b.l != null ? b.l : b.low;
            packed[o + 4] = b.c != null ? b.c : b.close;
            packed[o + 5] = b.v != null ? b.v : (b.volume != null ? b.volume : 0);
        }
        return packed;
    }

    /**
     * M19-I(a): pack only bars[start..end) — O(tail) alloc for the windowed
     * worker send instead of an O(history) full-array pack per pass.
     */
    function packBarsRangeCompact(bars, start, end) {
        const n = bars ? bars.length : 0;
        const s = Math.max(0, Math.min(n, start | 0));
        const e = end == null ? n : Math.max(s, Math.min(n, end | 0));
        const count = e - s;
        const packed = new Float64Array(count * 6);
        for (let i = 0; i < count; i++) {
            const b = bars[s + i];
            const o = i * 6;
            packed[o] = b.t;
            packed[o + 1] = b.o != null ? b.o : b.open;
            packed[o + 2] = b.h != null ? b.h : b.high;
            packed[o + 3] = b.l != null ? b.l : b.low;
            packed[o + 4] = b.c != null ? b.c : b.close;
            packed[o + 5] = b.v != null ? b.v : (b.volume != null ? b.volume : 0);
        }
        return packed;
    }

    /** Restore [t,o,h,l,c,v] worker payloads to the chart's canonical bar shape. */
    function unpackBarsCompact(packed) {
        if (packed == null) return [];
        const values = packed instanceof Float64Array
            ? packed
            : new Float64Array(packed.buffer || packed);
        const n = Math.floor(values.length / 6);
        const bars = new Array(n);
        for (let i = 0; i < n; i++) {
            const offset = i * 6;
            bars[i] = {
                t: values[offset],
                o: values[offset + 1],
                h: values[offset + 2],
                l: values[offset + 3],
                c: values[offset + 4],
                v: values[offset + 5],
            };
        }
        return bars;
    }

    /** Merge freshly computed tail into an existing indicator result. */
    function mergeIndicatorTail(existing, fresh, fromIndex) {
        if (fresh == null) return existing;
        if (existing == null) return fresh;
        fromIndex = Math.max(0, fromIndex | 0);

        if (Array.isArray(existing) && Array.isArray(fresh)) {
            if (existing.length !== fresh.length) return fresh.slice();
            for (let i = fromIndex; i < fresh.length; i++) existing[i] = fresh[i];
            return existing;
        }

        if (typeof existing === 'object' && typeof fresh === 'object') {
            const keys = ['line', 'upper', 'lower', 'middle', 'macd', 'signal', 'histogram', 'k', 'd'];
            keys.forEach(function (key) {
                if (Array.isArray(existing[key]) && Array.isArray(fresh[key])) {
                    for (let i = fromIndex; i < fresh[key].length; i++) {
                        existing[key][i] = fresh[key][i];
                    }
                }
            });
            if (Array.isArray(fresh.divergences)) existing.divergences = fresh.divergences;
            return existing;
        }

        return fresh;
    }

    /** Max lookback bars needed for tail-only recalc across active indicators. */
    function estimateTailLookback(activeIndicators) {
        let maxP = 50;
        if (!activeIndicators || !activeIndicators.length) return maxP;
        activeIndicators.forEach(function (ind) {
            const p = ind && ind.params ? ind.params : {};
            const t = String(ind.type || '').toLowerCase();
            maxP = Math.max(maxP, Number(p.period) || 0);
            maxP = Math.max(maxP, Number(p.fast) || 0);
            maxP = Math.max(maxP, Number(p.slow) || 0);
            maxP = Math.max(maxP, Number(p.signal) || 0);
            maxP = Math.max(maxP, Number(p.rsiPeriod) || 0);
            maxP = Math.max(maxP, Number(p.diLength) || 0);
            maxP = Math.max(maxP, Number(p.adxSmoothing) || 0);
            // M19-I(a): cover the window params the original list missed so a
            // tail recompute can never under-seed (ao/uo/stochrsi/coppock/…).
            maxP = Math.max(maxP, Number(p.fastLength) || 0);
            maxP = Math.max(maxP, Number(p.slowLength) || 0);
            maxP = Math.max(maxP, Number(p.period1) || 0);
            maxP = Math.max(maxP, Number(p.period2) || 0);
            maxP = Math.max(maxP, Number(p.period3) || 0);
            maxP = Math.max(maxP, Number(p.stochLen) || 0);
            maxP = Math.max(maxP, Number(p.smoothK) || 0);
            maxP = Math.max(maxP, Number(p.smoothD) || 0);
            maxP = Math.max(maxP, Number(p.smoothingLength) || 0);
            maxP = Math.max(maxP, Math.abs(Number(p.offset) || 0));
            if (t === 'macd' || t === 'ppo') maxP = Math.max(maxP, (Number(p.slow) || 26) + (Number(p.signal) || 9));
            if (t === 'stochrsi') maxP = Math.max(maxP, (Number(p.rsiPeriod) || 14) + (Number(p.stochLen) || 14));
        });
        return Math.min(5000, Math.max(120, maxP * 4 + 64));
    }

    /**
     * M19-I(a): merge a tail-window worker result (arrays are tail-length,
     * aligned to bars[tailStart..totalLength)) into the existing full-length
     * result. Values in [tailStart, fromIndex) are warmup-only and discarded.
     * Returns the merged result, or null when shapes are incompatible and the
     * caller must fall back to a full recompute for that indicator.
     */
    function mergeIndicatorTailWindow(existing, fresh, tailStart, fromIndex, totalLength) {
        if (fresh == null) return null;
        tailStart = Math.max(0, tailStart | 0);
        fromIndex = Math.max(tailStart, fromIndex | 0);
        totalLength = Math.max(0, totalLength | 0);
        const tailLen = totalLength - tailStart;
        if (tailLen <= 0) return null;

        function isPackedSeries(value) {
            return !!(value
                && value.__talariaFloat64Series === true
                && value.values instanceof Float64Array);
        }

        function isSeriesLike(value) {
            return Array.isArray(value) || isPackedSeries(value);
        }

        function seriesLength(value) {
            return isPackedSeries(value) ? value.values.length : value.length;
        }

        function seriesValueAt(value, index) {
            const v = isPackedSeries(value) ? value.values[index] : value[index];
            return typeof v === 'number' && Number.isNaN(v) ? null : v;
        }

        function seriesToArray(value) {
            const len = seriesLength(value);
            const out = new Array(len);
            for (let i = 0; i < len; i++) out[i] = seriesValueAt(value, i);
            return out;
        }

        function patchArray(dst, src) {
            if (!Array.isArray(dst) || !isSeriesLike(src)) return null;
            if (seriesLength(src) !== tailLen) return null;
            while (dst.length < totalLength) dst.push(null);
            if (dst.length > totalLength) dst.length = totalLength;
            for (let i = fromIndex; i < totalLength; i++) {
                dst[i] = seriesValueAt(src, i - tailStart);
            }
            return dst;
        }

        if (isSeriesLike(fresh)) {
            if (!Array.isArray(existing)) {
                // No prior full-length result to patch into — only safe when the
                // tail covers the whole series.
                return tailStart === 0 ? seriesToArray(fresh) : null;
            }
            return patchArray(existing, fresh) ? existing : null;
        }

        if (typeof existing === 'object' && existing !== null && typeof fresh === 'object') {
            const keys = Object.keys(fresh);
            for (let k = 0; k < keys.length; k++) {
                const key = keys[k];
                const src = fresh[key];
                if (isSeriesLike(src)) {
                    if (seriesLength(src) === tailLen && Array.isArray(existing[key])) {
                        if (!patchArray(existing[key], src)) return null;
                    } else if (seriesLength(src) === tailLen && existing[key] == null && tailStart === 0) {
                        existing[key] = seriesToArray(src);
                    } else if (seriesLength(src) !== tailLen) {
                        // Non-series array payloads (e.g. divergence/zones lists)
                        // are index-based over the tail slice — unsafe to merge.
                        return null;
                    } else {
                        return null;
                    }
                } else {
                    existing[key] = src;
                }
            }
            return existing;
        }

        return null;
    }

    function hashIndicatorParams(active) {
        if (!active || !active.length) return '';
        try {
            return active.map(function (ind) {
                const vis = ind.visible === false ? '0' : '1';
                const hide = ind.hidePlot === true ? '1' : '0';
                const showLine = (ind.style && ind.style.showLine === false) ? '0' : '1';
                return String(ind.id) + ':' + String(ind.type) + ':' + vis + ':' + hide + ':' + showLine + ':' + JSON.stringify(ind.params || {});
            }).join('|');
        } catch (_) {
            return String(active.length);
        }
    }

    global.IndicatorPerf = {
        rollingSmaFast: rollingSmaFast,
        rollingWmaFast: rollingWmaFast,
        packBarsCompact: packBarsCompact,
        packBarsRangeCompact: packBarsRangeCompact,
        unpackBarsCompact: unpackBarsCompact,
        mergeIndicatorTail: mergeIndicatorTail,
        mergeIndicatorTailWindow: mergeIndicatorTailWindow,
        estimateTailLookback: estimateTailLookback,
        hashIndicatorParams: hashIndicatorParams
    };
    if (typeof global.__talariaRegisterModule === 'function') {
        global.__talariaRegisterModule({
            module: 'IndicatorPerf',
            version: '20260727b80',
            class: 'correctness',
            status: 'loaded'
        });
    }
})(typeof window !== 'undefined' ? window : self);
