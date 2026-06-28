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
            if (t === 'macd' || t === 'ppo') maxP = Math.max(maxP, (Number(p.slow) || 26) + (Number(p.signal) || 9));
        });
        return Math.min(5000, Math.max(120, maxP * 4 + 64));
    }

    function hashIndicatorParams(active) {
        if (!active || !active.length) return '';
        try {
            return active.map(function (ind) {
                return String(ind.id) + ':' + String(ind.type) + ':' + JSON.stringify(ind.params || {});
            }).join('|');
        } catch (_) {
            return String(active.length);
        }
    }

    global.IndicatorPerf = {
        rollingSmaFast: rollingSmaFast,
        rollingWmaFast: rollingWmaFast,
        packBarsCompact: packBarsCompact,
        mergeIndicatorTail: mergeIndicatorTail,
        estimateTailLookback: estimateTailLookback,
        hashIndicatorParams: hashIndicatorParams
    };
})(typeof window !== 'undefined' ? window : self);
