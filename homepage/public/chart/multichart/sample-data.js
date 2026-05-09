/**
 * sample-data.js
 *
 * Generates deterministic synthetic OHLC candles for the multichart sandbox.
 * Same seed -> same data, so two charts loaded with the same symbol show the
 * same series even though they each generate it locally (no shared backend).
 *
 * Multiple timeframes are supported by aggregating 1-minute base candles into
 * 5m, 15m, 1h, 4h, 1d. This way a 1m + 1h sandbox shows TRULY consistent
 * data — the 1h chart's 14:00 bar has the same OHLC as the 60 1m bars 14:00-14:59.
 *
 * Designed so the original bug class (lower-TF candles compressing when paired
 * with a higher-TF chart) is easy to reproduce: synthetic data has long-range
 * trends so panning a 1h chart across a multi-day window covers a much wider
 * price span than any single 1m window, exposing leaks immediately.
 *
 * No external dependencies. Pure ES5-compatible JS.
 */

(function (global) {
    'use strict';

    /** ---------- timeframe table ---------- */
    const TIMEFRAME_SECONDS = {
        '1m':   60,
        '5m':   300,
        '15m':  900,
        '1h':   3600,
        '4h':   14400,
        '1d':   86400,
    };

    /** Mulberry32 — seeded PRNG. Tiny, high-quality enough for synthetic OHLC. */
    function makeRng(seed) {
        let t = (seed | 0) >>> 0;
        return function () {
            t = (t + 0x6D2B79F5) >>> 0;
            let r = t;
            r = Math.imul(r ^ (r >>> 15), r | 1);
            r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** Numeric hash from a symbol string, so 'AAPL' and 'TSLA' produce different series. */
    function hashSymbol(sym) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < sym.length; i++) {
            h ^= sym.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h;
    }

    /**
     * Generate `count` 1-minute candles ending at `endTimeSec` (inclusive).
     * Returns an array of { t, o, h, l, c, v } where t is UTC seconds.
     */
    function generate1mCandles(symbol, endTimeSec, count) {
        const seed = hashSymbol(symbol || 'TEST');
        const rng = makeRng(seed);

        const startTime = endTimeSec - (count - 1) * 60;
        const out = new Array(count);

        // Long-running trend so panning across days covers a wide price band.
        // Base price varies by symbol so AAPL ~ 200, TSLA ~ 400, NQ ~ 18000, EURUSD ~ 1.08.
        const basePrice = baseForSymbol(symbol);
        let price = basePrice;

        for (let i = 0; i < count; i++) {
            const t = startTime + i * 60;
            // Slow drift + diurnal cycle + occasional shock
            const drift = Math.sin(i / 720) * (basePrice * 0.02);
            const tide  = Math.sin(i / 90) * (basePrice * 0.003);
            const shock = (rng() < 0.001) ? (rng() - 0.5) * basePrice * 0.01 : 0;
            const noise = (rng() - 0.5) * basePrice * 0.0015;
            price = basePrice + drift + tide + shock;

            const o = price + noise;
            const wick = (rng() + 0.2) * basePrice * 0.001;
            const dirUp = rng() > 0.5;
            const c = dirUp ? o + (rng() * basePrice * 0.0008) : o - (rng() * basePrice * 0.0008);
            const h = Math.max(o, c) + wick;
            const l = Math.min(o, c) - wick;
            const v = Math.round(rng() * 5000) + 50;
            out[i] = { t, o, h, l, c, v };
        }
        return out;
    }

    function baseForSymbol(symbol) {
        if (!symbol) return 100;
        const u = String(symbol).toUpperCase();
        if (u.indexOf('NQ') === 0)    return 18500;
        if (u.indexOf('ES') === 0)    return 5400;
        if (u === 'AAPL')             return 200;
        if (u === 'TSLA')             return 245;
        if (u === 'MSFT')             return 425;
        if (u === 'EURUSD')           return 1.085;
        if (u === 'GBPUSD')           return 1.275;
        if (u === 'BTCUSD')           return 67000;
        return 100;
    }

    /**
     * Aggregate 1m candles into a higher timeframe.
     * Buckets are aligned to UTC midnight (i.e. 1h buckets start at HH:00:00 UTC).
     */
    function aggregate(base1m, tfSeconds) {
        if (tfSeconds === 60) return base1m.slice();
        const out = [];
        let bucket = null;
        for (let i = 0; i < base1m.length; i++) {
            const c = base1m[i];
            const bucketStart = Math.floor(c.t / tfSeconds) * tfSeconds;
            if (!bucket || bucket.t !== bucketStart) {
                if (bucket) out.push(bucket);
                bucket = { t: bucketStart, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
            } else {
                if (c.h > bucket.h) bucket.h = c.h;
                if (c.l < bucket.l) bucket.l = c.l;
                bucket.c = c.c;
                bucket.v += c.v;
            }
        }
        if (bucket) out.push(bucket);
        return out;
    }

    /**
     * Generate candles for a (symbol, timeframe) pair.
     * `daysBack` defaults to 14 — enough for cross-TF sync to span multi-day
     * windows on the higher-TF chart.
     */
    function generateForTimeframe(symbol, timeframe, opts) {
        opts = opts || {};
        const tfSec = TIMEFRAME_SECONDS[timeframe];
        if (!tfSec) throw new Error('Unknown timeframe: ' + timeframe);

        const daysBack   = opts.daysBack || 14;
        // Anchor end-time to a fixed value when given, otherwise "now" rounded
        // down to a clean minute. Fixing it across charts is what makes 1m+1h
        // truly consistent.
        const endTimeSec = opts.endTimeSec || Math.floor(Date.now() / 60000) * 60;

        // We always generate the 1m base, then aggregate.
        const minutes1mNeeded = daysBack * 24 * 60;
        const base = generate1mCandles(symbol, endTimeSec, minutes1mNeeded);
        return aggregate(base, tfSec);
    }

    function timeframeSeconds(tf) {
        return TIMEFRAME_SECONDS[tf];
    }

    function listTimeframes() {
        return Object.keys(TIMEFRAME_SECONDS);
    }

    global.MultichartSampleData = {
        TIMEFRAME_SECONDS,
        generateForTimeframe,
        timeframeSeconds,
        listTimeframes,
    };
})(typeof window !== 'undefined' ? window : globalThis);
