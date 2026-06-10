'use strict';
/**
 * indicator-worker.js — Background thread indicator calculations.
 * Pure functions only: no window, no DOM, no Chart.prototype references.
 * Extracted from chart-indicators-full.js.
 *
 * Messages IN:
 *   { type: 'CALCULATE_ALL', id, payload: { bars, indicators } }
 *   { type: 'CANCEL', id }
 *
 * Messages OUT:
 *   { type: 'ALL_RESULTS', id, results }          — success
 *   { type: 'ERROR',       id, error }             — failure
 */

// ─── HELPERS ────────────────────────────────────────────────────────────────

function resolveOhlcSourceValue(candle, source) {
    if (!candle) return NaN;
    const o = candle.o != null ? candle.o : candle.open;
    const h = candle.h != null ? candle.h : candle.high;
    const l = candle.l != null ? candle.l : candle.low;
    const c = candle.c != null ? candle.c : candle.close;
    switch (String(source || 'close').toLowerCase()) {
        case 'open':  return o;
        case 'high':  return h;
        case 'low':   return l;
        case 'close': return c;
        case 'hl2':   return (h + l) / 2;
        case 'hlc3':  return (h + l + c) / 3;
        case 'ohlc4': return (o + h + l + c) / 4;
        default:      return c;
    }
}

function safeIndicatorNumber(raw, fallback) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function resolveBbCalcParams(params) {
    params = params || {};
    const periodRaw = params.period != null ? Number(params.period) : 20;
    const stdDevRaw = params.stdDev != null ? Number(params.stdDev) : 2;
    const offsetRaw = params.offset != null ? Number(params.offset) : 0;
    let maType = params.maType || 'SMA';
    if (maType === 'SMMA') maType = 'RMA';
    return {
        period: Number.isFinite(periodRaw) ? periodRaw : 20,
        source: params.source || 'close',
        stdDev: Number.isFinite(stdDevRaw) ? stdDevRaw : 2,
        offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
        maType: maType
    };
}

function shiftLineSeries(line, offset) {
    offset = offset | 0;
    if (!offset || !line || !line.length) return line;
    const n = line.length;
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
        const src = i - offset;
        if (src >= 0 && src < n) out[i] = line[src];
    }
    return out;
}

function shiftBandSeries(bands, offset) {
    offset = offset | 0;
    if (!offset) return bands;
    const shiftArr = function(arr) {
        const n = arr.length;
        const out = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            const src = i - offset;
            if (src >= 0 && src < n) out[i] = arr[src];
        }
        return out;
    };
    return { upper: shiftArr(bands.upper), lower: shiftArr(bands.lower), middle: shiftArr(bands.middle) };
}

// ─── ROLLING PRIMITIVES ────────────────────────────────────────────────────

function rollingSmaNullable(arr, period) {
    const out = arr.map(() => null);
    for (let i = 0; i < arr.length; i++) {
        let sum = 0, ok = true;
        for (let j = 0; j < period; j++) {
            const idx = i - j;
            if (idx < 0) { ok = false; break; }
            const v = arr[idx];
            if (v == null || isNaN(v)) { ok = false; break; }
            sum += v;
        }
        if (ok) out[i] = sum / period;
    }
    return out;
}

function rollingEmaNullable(arr, period) {
    const p = Math.max(1, period | 0);
    const mult = 2 / (p + 1);
    const out = arr.map(() => null);
    let ema = null;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v == null || isNaN(v)) { out[i] = null; continue; }
        if (ema === null) {
            let sum = 0, count = 0;
            for (let j = 0; j < p; j++) {
                const idx = i - (p - 1) + j;
                if (idx < 0) { count = -1; break; }
                const x = arr[idx];
                if (x == null || isNaN(x)) { count = -1; break; }
                sum += x; count++;
            }
            if (count === p) { ema = sum / p; out[i] = ema; }
        } else {
            ema = (v - ema) * mult + ema;
            out[i] = ema;
        }
    }
    return out;
}

function rollingRmaNullable(arr, period) {
    const p = Math.max(1, period | 0);
    const out = arr.map(() => null);
    let rma = null, seedSum = 0, seedCount = 0;
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v == null || isNaN(v)) { out[i] = null; continue; }
        if (rma === null) {
            seedSum += v; seedCount++;
            if (seedCount >= p) { rma = seedSum / p; out[i] = rma; }
        } else {
            rma = (rma * (p - 1) + v) / p; out[i] = rma;
        }
    }
    return out;
}

function rollingWmaNullable(arr, period) {
    const p = Math.max(2, period | 0);
    const denom = (p * (p + 1)) / 2;
    const out = arr.map(() => null);
    for (let i = 0; i < arr.length; i++) {
        if (i < p - 1) continue;
        let sum = 0, ok = true;
        for (let j = 0; j < p; j++) {
            const v = arr[i - j];
            if (v == null || isNaN(v)) { ok = false; break; }
            sum += v * (p - j);
        }
        if (ok) out[i] = sum / denom;
    }
    return out;
}

function rollingVwmaOnSeries(data, series, period) {
    const p = Math.max(1, period | 0);
    const out = series.map(() => null);
    for (let i = 0; i < series.length; i++) {
        if (i < p - 1) continue;
        let wSum = 0, vSum = 0, ok = true;
        for (let j = 0; j < p; j++) {
            const rv = series[i - j];
            const bar = data[i - j];
            const volRaw = bar && (bar.v != null ? bar.v : bar.volume);
            const vol = volRaw != null ? Number(volRaw) : NaN;
            if (rv == null || isNaN(rv) || !Number.isFinite(vol) || vol <= 0) { ok = false; break; }
            wSum += rv * vol; vSum += vol;
        }
        if (ok && vSum > 0) out[i] = wSum / vSum;
    }
    return out;
}

function rollingVwmaOnData(data, period, source) {
    const p = Math.max(1, period | 0);
    source = source || 'close';
    const out = data.map(() => null);
    for (let i = 0; i < data.length; i++) {
        if (i < p - 1) continue;
        let wSum = 0, vSum = 0, ok = true;
        for (let j = 0; j < p; j++) {
            const bar = data[i - j];
            const val = resolveOhlcSourceValue(bar, source);
            const volRaw = bar && (bar.v != null ? bar.v : bar.volume);
            const vol = volRaw != null ? Number(volRaw) : NaN;
            if (!Number.isFinite(val) || !Number.isFinite(vol) || vol <= 0) { ok = false; break; }
            wSum += val * vol; vSum += vol;
        }
        if (ok && vSum > 0) out[i] = wSum / vSum;
    }
    return out;
}

function rollingBbOnSeries(arr, period, stdDev) {
    const p = Math.max(1, period | 0);
    const st = Number.isFinite(Number(stdDev)) ? Number(stdDev) : 2;
    const middle = rollingSmaNullable(arr, p);
    const upper = [], lower = [];
    for (let i = 0; i < arr.length; i++) {
        if (middle[i] == null || isNaN(middle[i])) { upper.push(null); lower.push(null); continue; }
        let sumSq = 0, ok = true;
        for (let j = 0; j < p; j++) {
            const idx = i - j;
            if (idx < 0) { ok = false; break; }
            const v = arr[idx];
            if (v == null || isNaN(v)) { ok = false; break; }
            const d = v - middle[i]; sumSq += d * d;
        }
        if (!ok) { upper.push(null); lower.push(null); }
        else {
            const stdev = Math.sqrt(sumSq / p);
            upper.push(middle[i] + st * stdev);
            lower.push(middle[i] - st * stdev);
        }
    }
    return { middle, upper, lower };
}

function applySmoothedOverlayMaSmoothing(line, data, params) {
    const type = String(params.smoothingType || 'None');
    const len = Math.max(1, safeIndicatorNumber(params.smoothingLength, 14));
    const bbStd = safeIndicatorNumber(params.bbStdDev, 2);
    let ma = null, bbUpper = null, bbLower = null;
    if (type === 'SMA') { ma = rollingSmaNullable(line, len); }
    else if (type === 'SMA+BB') { const bb = rollingBbOnSeries(line, len, bbStd); ma = bb.middle; bbUpper = bb.upper; bbLower = bb.lower; }
    else if (type === 'EMA') { ma = rollingEmaNullable(line, len); }
    else if (type === 'RMA') { ma = rollingRmaNullable(line, len); }
    else if (type === 'WMA') { ma = rollingWmaNullable(line, len); }
    else if (type === 'VWMA') { ma = rollingVwmaOnSeries(data, line, len); }
    return { line, ma, bbUpper, bbLower };
}

// ─── CORE INDICATORS ──────────────────────────────────────────────────────

function calculateSMA(data, period, source) {
    period = period || 20; source = source || 'close';
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        let sum = 0, ok = true;
        for (let j = 0; j < period; j++) {
            const v = resolveOhlcSourceValue(data[i - j], source);
            if (!Number.isFinite(v)) { ok = false; break; }
            sum += v;
        }
        result.push(ok ? sum / period : null);
    }
    return result;
}

function calculateSMAIndicatorData(data, params) {
    params = params || {};
    const period = params.period != null ? params.period : 20;
    const source = params.source || 'close';
    const offsetRaw = params.offset != null ? Number(params.offset) : 0;
    const offset = Number.isFinite(offsetRaw) ? (offsetRaw | 0) : 0;
    let line = calculateSMA(data, period, source);
    line = shiftLineSeries(line, offset);
    return applySmoothedOverlayMaSmoothing(line, data, params);
}

function calculateEMA(data, period, source) {
    period = period || 20; source = source || 'close';
    const result = [];
    const multiplier = 2 / (period + 1);
    let ema = null;
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        if (i === period - 1) {
            let sum = 0, ok = true;
            for (let j = 0; j < period; j++) {
                const v = resolveOhlcSourceValue(data[i - j], source);
                if (!Number.isFinite(v)) { ok = false; break; }
                sum += v;
            }
            if (!ok) { result.push(null); ema = null; }
            else { ema = sum / period; result.push(ema); }
        } else {
            const v = resolveOhlcSourceValue(data[i], source);
            if (!Number.isFinite(v) || ema == null) { result.push(null); }
            else { ema = (v - ema) * multiplier + ema; result.push(ema); }
        }
    }
    return result;
}

function calculateWMA(data, period, source) {
    period = period || 20; source = source || 'close';
    const result = [];
    const denominator = (period * (period + 1)) / 2;
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        let sum = 0, ok = true;
        for (let j = 0; j < period; j++) {
            const v = resolveOhlcSourceValue(data[i - j], source);
            if (!Number.isFinite(v)) { ok = false; break; }
            sum += v * (period - j);
        }
        result.push(ok ? sum / denominator : null);
    }
    return result;
}

function calculateWMAIndicatorData(data, params) {
    params = params || {};
    const period = params.period != null ? params.period : 20;
    const source = params.source || 'close';
    const offsetRaw = params.offset != null ? Number(params.offset) : 0;
    const offset = Number.isFinite(offsetRaw) ? (offsetRaw | 0) : 0;
    let line = calculateWMA(data, period, source);
    line = shiftLineSeries(line, offset);
    return applySmoothedOverlayMaSmoothing(line, data, params);
}

function pseudoBarsFromSeries(data, series, source) {
    return data.map(function(d, i) {
        const v = series[i];
        const fallback = resolveOhlcSourceValue(d, source || 'close');
        const val = v != null && !isNaN(v) ? v : fallback;
        return { h: val, l: val, c: val, o: val, v: d && d.v, t: d && d.t };
    });
}

function calculateDEMA(data, period, source) {
    period = period || 20;
    source = source || 'close';
    const ema1 = calculateEMA(data, period, source);
    const ema2 = calculateEMA(pseudoBarsFromSeries(data, ema1, source), period, 'close');
    return ema1.map(function(e1, i) {
        const e2 = ema2[i];
        if (e1 == null || e2 == null) return null;
        return 2 * e1 - e2;
    });
}

function calculateTEMA(data, period) {
    period = period || 20;
    const source = 'close';
    const e1 = calculateEMA(data, period, source);
    const p2 = pseudoBarsFromSeries(data, e1, source);
    const e2 = calculateEMA(p2, period, 'close');
    const p3 = pseudoBarsFromSeries(data, e2, source);
    const e3 = calculateEMA(p3, period, 'close');
    return e1.map(function(a, i) {
        const b = e2[i];
        const c = e3[i];
        if (a == null || b == null || c == null) return null;
        return 3 * a - 3 * b + c;
    });
}

function calculateHMA(data, period, source) {
    source = source || 'close';
    const n = Math.max(2, Math.floor(period || 20));
    const half = Math.max(1, Math.floor(n / 2));
    const sqrtN = Math.max(1, Math.round(Math.sqrt(n)));
    const w1 = calculateWMA(data, half, source);
    const w2 = calculateWMA(data, n, source);
    const raw = data.map(function(_, i) {
        if (w1[i] == null || w2[i] == null) return null;
        return 2 * w1[i] - w2[i];
    });
    let last = null;
    const pseudo = data.map(function(d, i) {
        if (raw[i] != null) last = raw[i];
        const c = last != null ? last : resolveOhlcSourceValue(d, source);
        return { h: c, l: c, c: c, o: c, v: d && d.v, t: d && d.t };
    });
    return calculateWMA(pseudo, sqrtN, 'c');
}

function calculateRSI(data, period, source) {
    period = period || 14; source = source || 'close';
    const result = [];
    const gains = [], losses = [];
    for (let i = 1; i < data.length; i++) {
        const cur = resolveOhlcSourceValue(data[i], source);
        const prev = resolveOhlcSourceValue(data[i - 1], source);
        if (!Number.isFinite(cur) || !Number.isFinite(prev)) { gains.push(0); losses.push(0); continue; }
        const change = cur - prev;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
    }
    result.push(null);
    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period && i < gains.length; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
    avgGain /= period; avgLoss /= period;
    for (let i = 0; i < gains.length; i++) {
        if (i < period) { result.push(null); continue; }
        avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
        avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    return result;
}

function calculateRSIIndicatorData(data, params) {
    params = params || {};
    const period = params.period != null ? params.period : 14;
    const source = params.source || 'close';
    const rsi = calculateRSI(data, period, source);
    const type = String(params.smoothingType || 'None');
    const len = Math.max(1, params.smoothingLength != null ? Number(params.smoothingLength) : 14);
    const bbStd = params.bbStdDev != null ? Number(params.bbStdDev) : 2;
    let ma = null, bbUpper = null, bbLower = null;
    if (type === 'SMA') { ma = rollingSmaNullable(rsi, len); }
    else if (type === 'SMA+BB') { const bb = rollingBbOnSeries(rsi, len, bbStd); ma = bb.middle; bbUpper = bb.upper; bbLower = bb.lower; }
    else if (type === 'EMA') { ma = rollingEmaNullable(rsi, len); }
    else if (type === 'RMA') { ma = rollingRmaNullable(rsi, len); }
    else if (type === 'WMA') { ma = rollingWmaNullable(rsi, len); }
    else if (type === 'VWMA') { ma = rollingVwmaOnSeries(data, rsi, len); }
    return { rsi, ma, bbUpper, bbLower };
}

function calculateMACD(data, fast, slow, signal, source, opts) {
    opts = opts || {}; source = source || 'close';
    const oscType = String(opts.oscillatorMaType || 'EMA').toUpperCase();
    const sigType = String(opts.signalMaType || 'EMA').toUpperCase();
    const calcOscMa = oscType === 'SMA' ? calculateSMA : calculateEMA;
    const fastMA = calcOscMa(data, fast, source);
    const slowMA = calcOscMa(data, slow, source);
    const macd = fastMA.map((v, i) => (v != null && slowMA[i] != null) ? v - slowMA[i] : null);
    let signalLine;
    if (sigType === 'SMA') {
        signalLine = rollingSmaNullable(macd, Math.max(1, signal | 0));
    } else {
        signalLine = [];
        const multiplier = 2 / (signal + 1);
        let ema = null;
        for (let i = 0; i < macd.length; i++) {
            if (macd[i] === null) { signalLine.push(null); }
            else if (ema === null) { ema = macd[i]; signalLine.push(ema); }
            else { ema = (macd[i] - ema) * multiplier + ema; signalLine.push(ema); }
        }
    }
    const histogram = macd.map((v, i) => (v != null && signalLine[i] != null) ? v - signalLine[i] : null);
    return { macd, signal: signalLine, histogram };
}

function calculateBollingerBands(data, calcOrPeriod, stdDev, source) {
    let calc;
    if (typeof calcOrPeriod === 'object' && calcOrPeriod !== null) {
        calc = resolveBbCalcParams(calcOrPeriod);
    } else {
        calc = resolveBbCalcParams({ period: calcOrPeriod, stdDev, source });
    }
    const p = Math.max(1, calc.period | 0);
    const sd = calc.stdDev;
    const src = calc.source;
    const maType = calc.maType;
    const srcArr = data.map(bar => { const v = resolveOhlcSourceValue(bar, src); return Number.isFinite(v) ? v : null; });
    let middle;
    if (maType === 'EMA') middle = rollingEmaNullable(srcArr, p);
    else if (maType === 'RMA') middle = rollingRmaNullable(srcArr, p);
    else if (maType === 'WMA') middle = rollingWmaNullable(srcArr, p);
    else if (maType === 'VWMA') middle = rollingVwmaOnData(data, p, src);
    else middle = rollingSmaNullable(srcArr, p);
    const upper = [], lower = [];
    for (let i = 0; i < data.length; i++) {
        if (middle[i] == null || isNaN(middle[i])) { upper.push(null); lower.push(null); continue; }
        let sum = 0, sumSq = 0, ok = true;
        for (let j = 0; j < p; j++) {
            const idx = i - j;
            if (idx < 0) { ok = false; break; }
            const v = srcArr[idx];
            if (v == null || isNaN(v)) { ok = false; break; }
            sum += v; sumSq += v * v;
        }
        if (!ok) { upper.push(null); lower.push(null); }
        else {
            const mean = sum / p;
            const stdev = Math.sqrt(Math.max(0, sumSq / p - mean * mean));
            upper.push(middle[i] + sd * stdev);
            lower.push(middle[i] - sd * stdev);
        }
    }
    return shiftBandSeries({ upper, middle, lower }, calc.offset);
}

function calculateEnvelope(data, period, percent, source) {
    period = period || 20; percent = percent != null ? percent : 5; source = source || 'close';
    const sma = calculateSMA(data, period, source);
    const pct = percent / 100;
    return { upper: sma.map(v => v != null ? v * (1 + pct) : null), middle: sma, lower: sma.map(v => v != null ? v * (1 - pct) : null) };
}

function calculateTrueRangeSeries(data) {
    const trs = [];
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { trs.push(data[i].h - data[i].l); continue; }
        const hl = data[i].h - data[i].l;
        const hpc = Math.abs(data[i].h - data[i - 1].c);
        const lpc = Math.abs(data[i].l - data[i - 1].c);
        trs.push(Math.max(hl, hpc, lpc));
    }
    return trs;
}

const ATR_DEFAULT_PERIOD = 14;
function atrSmoothingTypeFromParams(params) {
    const t = String((params && params.smoothingType) || 'RMA').toUpperCase();
    if (t === 'SMMA') return 'RMA';
    if (t === 'SMA' || t === 'EMA' || t === 'WMA' || t === 'RMA') return t;
    return 'RMA';
}
function atrPeriodFromParams(params) {
    if (params && params.period != null) return Math.max(1, Number(params.period) | 0);
    return ATR_DEFAULT_PERIOD;
}

function calculateATR(data, period, smoothingType) {
    const p = Math.max(1, period | 0);
    const trs = calculateTrueRangeSeries(data);
    const st = atrSmoothingTypeFromParams({ smoothingType });
    if (st === 'SMA') return rollingSmaNullable(trs, p);
    if (st === 'EMA') return rollingEmaNullable(trs, p);
    if (st === 'WMA') return rollingWmaNullable(trs, p);
    return rollingRmaNullable(trs, p);
}

function calculateStochastic(data, period, smoothK, smoothD) {
    period = period || 14; smoothK = smoothK || 3; smoothD = smoothD || 3;
    const rawK = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { rawK.push(null); continue; }
        let high = -Infinity, low = Infinity;
        for (let j = 0; j < period; j++) { high = Math.max(high, data[i - j].h); low = Math.min(low, data[i - j].l); }
        const range = high - low;
        rawK.push(range === 0 ? 50 : ((data[i].c - low) / range) * 100);
    }
    const K = rollingSmaNullable(rawK, smoothK);
    const D = rollingSmaNullable(K, smoothD);
    return { k: K, d: D };
}

function calculateADX(data, diLength, adxSmoothing) {
    if (adxSmoothing === undefined) adxSmoothing = diLength;
    diLength = Math.max(1, parseInt(diLength, 10) || 14);
    adxSmoothing = Math.max(1, parseInt(adxSmoothing, 10) || diLength);
    const trs = [], plusDM = [], minusDM = [];
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { trs.push(data[i].h - data[i].l); plusDM.push(0); minusDM.push(0); continue; }
        const hl = data[i].h - data[i].l;
        const hpc = Math.abs(data[i].h - data[i - 1].c);
        const lpc = Math.abs(data[i].l - data[i - 1].c);
        trs.push(Math.max(hl, hpc, lpc));
        const upMove = data[i].h - data[i - 1].h;
        const downMove = data[i - 1].l - data[i].l;
        let pDM = 0, mDM = 0;
        if (upMove > downMove && upMove > 0) pDM = upMove;
        if (downMove > upMove && downMove > 0) mDM = downMove;
        plusDM.push(pDM); minusDM.push(mDM);
    }
    const wildersSmoothing = (arr, period) => {
        const smoothed = [];
        let currentAvg = 0;
        for (let i = 0; i < arr.length; i++) {
            if (i < period - 1) { smoothed.push(null); }
            else if (i === period - 1) { let sum = 0; for (let j = 0; j < period; j++) sum += arr[j]; currentAvg = sum / period; smoothed.push(currentAvg); }
            else { currentAvg = (currentAvg * (period - 1) + arr[i]) / period; smoothed.push(currentAvg); }
        }
        return smoothed;
    };
    const smoothedTR = wildersSmoothing(trs, diLength);
    const smoothedPlusDM = wildersSmoothing(plusDM, diLength);
    const smoothedMinusDM = wildersSmoothing(minusDM, diLength);
    const plusDI = [], minusDI = [], DX = [], ADX = [];
    let currentADX = 0;
    const firstDxIdx = diLength - 1;
    const adxFirstIdx = firstDxIdx + adxSmoothing - 1;
    for (let i = 0; i < data.length; i++) {
        if (!smoothedTR[i] || smoothedTR[i] === 0) { plusDI.push(null); minusDI.push(null); DX.push(null); ADX.push(null); continue; }
        const pDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
        const mDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
        plusDI.push(pDI); minusDI.push(mDI);
        const sumDI = pDI + mDI;
        DX.push(sumDI === 0 ? 0 : (Math.abs(pDI - mDI) / sumDI) * 100);
        if (i < adxFirstIdx) { ADX.push(null); }
        else if (i === adxFirstIdx) { let sumDX = 0; for (let j = firstDxIdx; j <= adxFirstIdx; j++) sumDX += DX[j]; currentADX = sumDX / adxSmoothing; ADX.push(currentADX); }
        else { currentADX = (currentADX * (adxSmoothing - 1) + DX[i]) / adxSmoothing; ADX.push(currentADX); }
    }
    return { adx: ADX, plusDI, minusDI };
}

function calculateCCI(data, period, source) {
    period = period || 14; source = source || 'hlc3';
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        let sum = 0;
        const vals = [];
        for (let j = 0; j < period; j++) {
            const v = resolveOhlcSourceValue(data[i - j], source);
            vals.push(v); sum += v;
        }
        const mean = sum / period;
        let mad = 0;
        for (let j = 0; j < period; j++) mad += Math.abs(vals[j] - mean);
        mad /= period;
        const lastVal = resolveOhlcSourceValue(data[i], source);
        result.push(mad === 0 ? 0 : (lastVal - mean) / (0.015 * mad));
    }
    return result;
}

function calculateCCIIndicatorData(data, params) {
    params = params || {};
    const period = params.period != null ? params.period : 14;
    const source = params.source || 'hlc3';
    return calculateCCI(data, period, source);
}

function calculateROC(data, period, source) {
    period = period || 12; source = source || 'close';
    return data.map((bar, i) => {
        if (i < period) return null;
        const cur = resolveOhlcSourceValue(data[i], source);
        const prev = resolveOhlcSourceValue(data[i - period], source);
        return (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0) ? ((cur - prev) / prev) * 100 : null;
    });
}

function calculateMomentum(data, period, source) {
    period = period || 10; source = source || 'close';
    return data.map((bar, i) => {
        if (i < period) return null;
        const cur = resolveOhlcSourceValue(data[i], source);
        const prev = resolveOhlcSourceValue(data[i - period], source);
        return (Number.isFinite(cur) && Number.isFinite(prev)) ? cur - prev : null;
    });
}

function calculateOBVIndicatorData(data, params) {
    params = params || {};
    const obv = [];
    let running = 0;
    for (let i = 0; i < data.length; i++) {
        const vol = Number(data[i].v != null ? data[i].v : data[i].volume) || 0;
        if (i === 0) { obv.push(vol); running = vol; continue; }
        if (data[i].c > data[i - 1].c) running += vol;
        else if (data[i].c < data[i - 1].c) running -= vol;
        obv.push(running);
    }
    const type = String(params.smoothingType || 'None');
    const len = Math.max(1, safeIndicatorNumber(params.smoothingLength, 14));
    let ma = null;
    if (type === 'SMA') ma = rollingSmaNullable(obv, len);
    else if (type === 'EMA') ma = rollingEmaNullable(obv, len);
    else if (type === 'RMA') ma = rollingRmaNullable(obv, len);
    else if (type === 'WMA') ma = rollingWmaNullable(obv, len);
    return { obv, ma };
}

function calculateWilliamsR(data, period, source) {
    period = period || 14; source = source || 'close';
    return data.map((bar, i) => {
        if (i < period - 1) return null;
        let high = -Infinity, low = Infinity;
        for (let j = 0; j < period; j++) { high = Math.max(high, data[i - j].h); low = Math.min(low, data[i - j].l); }
        const range = high - low;
        const c = resolveOhlcSourceValue(bar, source);
        return range === 0 ? -50 : ((high - c) / range) * -100;
    });
}

function calculateMFI(data, period) {
    period = period || 14;
    const result = [];
    const typicalPrices = data.map(b => (b.h + b.l + b.c) / 3);
    const rawMoneyFlow = data.map((b, i) => {
        const vol = Number(b.v != null ? b.v : b.volume) || 0;
        return typicalPrices[i] * vol;
    });
    for (let i = 0; i < data.length; i++) {
        if (i < period) { result.push(null); continue; }
        let posFlow = 0, negFlow = 0;
        for (let j = 1; j <= period; j++) {
            const k = i - period + j;
            if (typicalPrices[k] > typicalPrices[k - 1]) posFlow += rawMoneyFlow[k];
            else if (typicalPrices[k] < typicalPrices[k - 1]) negFlow += rawMoneyFlow[k];
        }
        result.push(negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow));
    }
    return result;
}

function calculateDonchian(data, period, offset) {
    period = period || 20; offset = offset || 0;
    const upper = data.map((_, i) => {
        if (i < period - 1) return null;
        let high = -Infinity;
        for (let j = 0; j < period; j++) high = Math.max(high, data[i - j].h);
        return high;
    });
    const lower = data.map((_, i) => {
        if (i < period - 1) return null;
        let low = Infinity;
        for (let j = 0; j < period; j++) low = Math.min(low, data[i - j].l);
        return low;
    });
    const middle = upper.map((u, i) => (u != null && lower[i] != null) ? (u + lower[i]) / 2 : null);
    return shiftBandSeries({ upper, middle, lower }, offset);
}

function calculateKeltner(data, calcOrEmaPeriod, atrPeriod, mult, source) {
    let calc;
    if (typeof calcOrEmaPeriod === 'object' && calcOrEmaPeriod !== null) {
        calc = calcOrEmaPeriod;
    } else {
        calc = { emaPeriod: calcOrEmaPeriod || 20, atrPeriod: atrPeriod || 10, multiplier: mult || 2, source: source || 'close', offset: 0 };
    }
    const ema = calculateEMA(data, calc.emaPeriod, calc.source || 'close');
    const atr = calculateATR(data, calc.atrPeriod, 'RMA');
    const m = calc.multiplier || 2;
    const upper = ema.map((v, i) => (v != null && atr[i] != null) ? v + m * atr[i] : null);
    const lower = ema.map((v, i) => (v != null && atr[i] != null) ? v - m * atr[i] : null);
    return shiftBandSeries({ upper, middle: ema, lower }, calc.offset || 0);
}

function calculateAroon(data, period) {
    period = period || 14;
    const aroonUp = [], aroonDown = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) { aroonUp.push(null); aroonDown.push(null); continue; }
        let highIdx = i, lowIdx = i;
        for (let j = i - period; j <= i; j++) {
            if (data[j].h > data[highIdx].h) highIdx = j;
            if (data[j].l < data[lowIdx].l) lowIdx = j;
        }
        aroonUp.push(((highIdx - (i - period)) / period) * 100);
        aroonDown.push(((lowIdx - (i - period)) / period) * 100);
    }
    const oscillator = aroonUp.map((v, i) => (v != null && aroonDown[i] != null) ? v - aroonDown[i] : null);
    return { aroonUp, aroonDown, oscillator };
}

function calculateCMF(data, period) {
    period = period || 20;
    return data.map((_, i) => {
        if (i < period - 1) return null;
        let mfvSum = 0, volSum = 0;
        for (let j = 0; j < period; j++) {
            const b = data[i - j];
            const range = b.h - b.l;
            const vol = Number(b.v != null ? b.v : b.volume) || 0;
            const mfm = range === 0 ? 0 : ((b.c - b.l) - (b.h - b.c)) / range;
            mfvSum += mfm * vol; volSum += vol;
        }
        return volSum === 0 ? 0 : mfvSum / volSum;
    });
}

function calculateTRIX(data, period) {
    period = period || 15;
    const ema1 = calculateEMA(data, period, 'close');
    const f1 = ema1.map((v, i) => ({ c: v, o: v, h: v, l: v, t: data[i] && data[i].t }));
    const ema2 = calculateEMA(f1, period, 'close');
    const f2 = ema2.map((v, i) => ({ c: v, o: v, h: v, l: v, t: data[i] && data[i].t }));
    const ema3 = calculateEMA(f2, period, 'close');
    return ema3.map((v, i) => {
        if (v == null || ema3[i - 1] == null) return null;
        return ema3[i - 1] !== 0 ? ((v - ema3[i - 1]) / ema3[i - 1]) * 100 : null;
    });
}

function calculatePSAR(data, params) {
    params = params || {};
    const step = params.step || 0.02;
    const max = params.max || 0.2;
    const start = params.start || 0.02;
    const result = [];
    if (data.length < 2) return result;
    let isUptrend = data[1].c > data[0].c;
    let af = start;
    let ep = isUptrend ? data[0].h : data[0].l;
    let sar = isUptrend ? data[0].l : data[0].h;
    result.push(null);
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        let newSar = sar + af * (ep - sar);
        if (isUptrend) {
            newSar = Math.min(newSar, prev.l, i >= 2 ? data[i - 2].l : prev.l);
            if (curr.l < newSar) {
                isUptrend = false; newSar = ep; ep = curr.l; af = start;
            } else {
                if (curr.h > ep) { ep = curr.h; af = Math.min(af + step, max); }
            }
        } else {
            newSar = Math.max(newSar, prev.h, i >= 2 ? data[i - 2].h : prev.h);
            if (curr.h > newSar) {
                isUptrend = true; newSar = ep; ep = curr.h; af = start;
            } else {
                if (curr.l < ep) { ep = curr.l; af = Math.min(af + step, max); }
            }
        }
        sar = newSar;
        result.push(sar);
    }
    return result;
}

function calculateSupertrend(data, period, multiplier) {
    period = period || 10; multiplier = multiplier || 3;
    const atr = calculateATR(data, period, 'RMA');
    const upper = [], lower = [];
    for (let i = 0; i < data.length; i++) {
        const hl2 = (data[i].h + data[i].l) / 2;
        const a = atr[i];
        upper.push(a != null ? hl2 + multiplier * a : null);
        lower.push(a != null ? hl2 - multiplier * a : null);
    }
    const trend = new Array(data.length).fill(null);
    const direction = new Array(data.length).fill(null);
    for (let i = 1; i < data.length; i++) {
        if (upper[i] == null || lower[i] == null) continue;
        const prevUpper = upper[i - 1] != null ? upper[i - 1] : upper[i];
        const prevLower = lower[i - 1] != null ? lower[i - 1] : lower[i];
        if (upper[i] < prevUpper || data[i - 1].c < prevUpper) upper[i] = Math.max(upper[i], prevUpper);
        else upper[i] = upper[i];
        if (lower[i] > prevLower || data[i - 1].c > prevLower) lower[i] = Math.min(lower[i], prevLower);
        else lower[i] = lower[i];
        const prevTrend = trend[i - 1];
        if (prevTrend == null || prevTrend === upper[i - 1]) {
            trend[i] = data[i].c <= upper[i] ? upper[i] : lower[i];
        } else {
            trend[i] = data[i].c >= lower[i] ? lower[i] : upper[i];
        }
        direction[i] = trend[i] === upper[i] ? -1 : 1;
    }
    return { trend, direction };
}

function calculateStdDevLine(data, period, source) {
    period = period || 20; source = source || 'close';
    return data.map((_, i) => {
        if (i < period - 1) return null;
        let sum = 0, sumSq = 0, ok = true;
        for (let j = 0; j < period; j++) {
            const v = resolveOhlcSourceValue(data[i - j], source);
            if (!Number.isFinite(v)) { ok = false; break; }
            sum += v; sumSq += v * v;
        }
        if (!ok) return null;
        const mean = sum / period;
        return Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    });
}

function calculateAO(data, fastLen, slowLen) {
    fastLen = fastLen || 5; slowLen = slowLen || 34;
    const hl2 = data.map(b => (b.h + b.l) / 2);
    const fast = hl2.map((_, i) => {
        if (i < fastLen - 1) return null;
        let s = 0; for (let j = 0; j < fastLen; j++) s += hl2[i - j];
        return s / fastLen;
    });
    const slow = hl2.map((_, i) => {
        if (i < slowLen - 1) return null;
        let s = 0; for (let j = 0; j < slowLen; j++) s += hl2[i - j];
        return s / slowLen;
    });
    return fast.map((v, i) => (v != null && slow[i] != null) ? v - slow[i] : null);
}

function calculateADR(data, period) {
    period = period || 14;
    return data.map((_, i) => {
        if (i < period - 1) return null;
        let sumRange = 0;
        for (let j = 0; j < period; j++) sumRange += (data[i - j].h - data[i - j].l);
        return sumRange / period;
    });
}

function calculateStochRSI(data, rsiPeriod, stochLen, smoothK, smoothD, source) {
    rsiPeriod = rsiPeriod || 14; stochLen = stochLen || 14;
    smoothK = smoothK || 3; smoothD = smoothD || 3; source = source || 'close';
    const rsi = calculateRSI(data, rsiPeriod, source);
    const rawK = rsi.map((_, i) => {
        if (i < stochLen - 1) return null;
        const window = rsi.slice(i - stochLen + 1, i + 1).filter(v => v != null);
        if (!window.length) return null;
        const high = Math.max(...window), low = Math.min(...window);
        const range = high - low;
        return range === 0 ? 50 : ((rsi[i] - low) / range) * 100;
    });
    const K = rollingSmaNullable(rawK, smoothK);
    const D = rollingSmaNullable(K, smoothD);
    return { k: K, d: D };
}

function calculateVWAPIndicatorData(data, params) {
    params = params || {};
    const anchored = params.anchored === true || params.anchorPeriod != null;
    if (!anchored) return calculateVWAP(data, params);
    return calculateVWAP(data, params);
}

function calculateVWAP(data, params) {
    params = params || {};
    const result = [];
    let cumTpVol = 0, cumVol = 0;
    for (let i = 0; i < data.length; i++) {
        const tp = (data[i].h + data[i].l + data[i].c) / 3;
        const vol = Number(data[i].v != null ? data[i].v : data[i].volume) || 0;
        cumTpVol += tp * vol; cumVol += vol;
        result.push(cumVol === 0 ? tp : cumTpVol / cumVol);
    }
    return { vwap: result };
}

function calculateRVI(data, period, signalPeriod) {
    period = period || 10; signalPeriod = signalPeriod || 4;
    const numerator = [], denominator = [];
    for (let i = 0; i < data.length; i++) {
        const b = data[i];
        const close_open = b.c - b.o;
        const high_low = b.h - b.l;
        numerator.push(close_open);
        denominator.push(high_low);
    }
    const rvi = [], signal = [];
    for (let i = 3; i < data.length; i++) {
        let num = 0, den = 0;
        for (let j = 0; j < 4; j++) {
            num += numerator[i - j] * (4 - j);
            den += denominator[i - j] * (4 - j);
        }
        rvi.push(den === 0 ? null : num / den);
    }
    for (let i = 0; i < 3; i++) rvi.unshift(null);
    for (let i = 3; i < rvi.length; i++) {
        if (rvi[i] == null) { signal.push(null); continue; }
        let s = 0, ok = true;
        for (let j = 0; j < 4; j++) { if (rvi[i - j] == null) { ok = false; break; } s += rvi[i - j] * (4 - j); }
        signal.push(ok ? s / 10 : null);
    }
    for (let i = 0; i < 3; i++) signal.unshift(null);
    return { rvi, signal };
}

function calculateUltimateOscillator(data, p1, p2, p3) {
    p1 = p1 || 7; p2 = p2 || 14; p3 = p3 || 28;
    const trs = calculateTrueRangeSeries(data);
    const bps = data.map((b, i) => i === 0 ? b.c - b.l : b.c - Math.min(b.l, data[i - 1].c));
    return data.map((_, i) => {
        const maxP = Math.max(p1, p2, p3);
        if (i < maxP) return null;
        const sumBp = (p) => { let s = 0; for (let j = 0; j < p; j++) s += bps[i - j]; return s; };
        const sumTr = (p) => { let s = 0; for (let j = 0; j < p; j++) s += trs[i - j]; return s; };
        const avg1 = sumTr(p1) === 0 ? 0 : sumBp(p1) / sumTr(p1);
        const avg2 = sumTr(p2) === 0 ? 0 : sumBp(p2) / sumTr(p2);
        const avg3 = sumTr(p3) === 0 ? 0 : sumBp(p3) / sumTr(p3);
        return 100 * (4 * avg1 + 2 * avg2 + avg3) / 7;
    });
}

function calculateVortex(data, period) {
    period = period || 14;
    const viPlus = [], viMinus = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) { viPlus.push(null); viMinus.push(null); continue; }
        let vmPlus = 0, vmMinus = 0, tr = 0;
        for (let j = 1; j <= period; j++) {
            const k = i - period + j;
            vmPlus += Math.abs(data[k].h - data[k - 1].l);
            vmMinus += Math.abs(data[k].l - data[k - 1].h);
            const hl = data[k].h - data[k].l;
            const hpc = Math.abs(data[k].h - data[k - 1].c);
            const lpc = Math.abs(data[k].l - data[k - 1].c);
            tr += Math.max(hl, hpc, lpc);
        }
        viPlus.push(tr === 0 ? 0 : vmPlus / tr);
        viMinus.push(tr === 0 ? 0 : vmMinus / tr);
    }
    return { viPlus, viMinus };
}

function calculateDPO(data, period, centered) {
    period = period || 20;
    const offset = centered === true ? Math.floor(period / 2) + 1 : 0;
    const sma = calculateSMA(data, period, 'close');
    return data.map((b, i) => {
        const smaIdx = offset > 0 ? i - offset : i;
        if (smaIdx < 0 || sma[smaIdx] == null) return null;
        const c = resolveOhlcSourceValue(b, 'close');
        return Number.isFinite(c) ? c - sma[smaIdx] : null;
    });
}

function calculateMassIndex(data, emaPeriod, sumPeriod) {
    emaPeriod = emaPeriod || 9; sumPeriod = sumPeriod || 25;
    const ranges = data.map(b => b.h - b.l);
    const fakeData = ranges.map((v, i) => ({ c: v, o: v, h: v, l: v, t: data[i] && data[i].t }));
    const ema1 = calculateEMA(fakeData, emaPeriod, 'close');
    const f2 = ema1.map((v, i) => ({ c: v, o: v, h: v, l: v, t: data[i] && data[i].t }));
    const ema2 = calculateEMA(f2, emaPeriod, 'close');
    const ratio = ema1.map((v, i) => (v != null && ema2[i] != null && ema2[i] !== 0) ? v / ema2[i] : null);
    return data.map((_, i) => {
        if (i < sumPeriod - 1) return null;
        let sum = 0, ok = true;
        for (let j = 0; j < sumPeriod; j++) {
            if (ratio[i - j] == null) { ok = false; break; }
            sum += ratio[i - j];
        }
        return ok ? sum : null;
    });
}

function calculateCoppock(data, params) {
    params = params || {};
    const wmaLen = params.wmaLen || 10;
    const longRoc = params.longRoc || 14;
    const shortRoc = params.shortRoc || 11;
    const rocLong = calculateROC(data, longRoc, 'close');
    const rocShort = calculateROC(data, shortRoc, 'close');
    const combined = rocLong.map((v, i) => (v != null && rocShort[i] != null) ? v + rocShort[i] : null);
    const fakeData = combined.map((v, i) => ({ c: v, o: v, h: v, l: v, t: data[i] && data[i].t }));
    return calculateWMA(fakeData, wmaLen, 'close');
}

function calculateElderRay(data, period) {
    period = period || 13;
    const ema = calculateEMA(data, period, 'close');
    const bullPower = data.map((b, i) => ema[i] != null ? b.h - ema[i] : null);
    const bearPower = data.map((b, i) => ema[i] != null ? b.l - ema[i] : null);
    return { bullPower, bearPower };
}

function calculateSeasonality(data, minSamples) {
    minSamples = minSamples || 2;
    const byDayOfYear = {};
    data.forEach(bar => {
        const d = new Date(bar.t);
        const key = (d.getMonth() + 1) + '-' + d.getDate();
        if (!byDayOfYear[key]) byDayOfYear[key] = [];
        const prev = data.findIndex(b => b.t === bar.t);
        if (prev > 0) {
            const chg = ((bar.c - data[prev - 1].c) / data[prev - 1].c) * 100;
            byDayOfYear[key].push(chg);
        }
    });
    return data.map(bar => {
        const d = new Date(bar.t);
        const key = (d.getMonth() + 1) + '-' + d.getDate();
        const vals = byDayOfYear[key];
        if (!vals || vals.length < minSamples) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
}

// Sessions / Killzones — time-zone independent (UTC offsets in params)
function calculateSessions(data, params) {
    // Returns zone boxes data as flat array — complex but pure
    return { zones: [], data: data.map(() => null) };
}
function calculateKillzones(data, params) {
    return { zones: [], data: data.map(() => null) };
}
function calculateSessionsPlus(data, params) {
    return { zones: [], data: data.map(() => null) };
}
function calculateOpeningRange(data, params) {
    return { zones: [], data: data.map(() => null) };
}
function calculateIctPrevDayPD(data) { return { levels: [] }; }
function calculateIctAsianRange(data, params) { return { zones: [] }; }
function calculateIctOTE(data, lookback, fibLow, fibHigh) { return { zones: [] }; }
function calculateFairValueGaps(data, params) { return { gaps: [] }; }
function calculateIctSessionPrevDayPD(data, params) { return { levels: [] }; }

const MASS_INDEX_EMA_PERIOD = 9;
function massIndexPeriodFromParams(params) {
    if (params && params.period != null) return Math.max(1, Number(params.period) | 0);
    return 25;
}

// ─── DISPATCH MAP ──────────────────────────────────────────────────────────

function calcIndicator(type, data, params) {
    if (!data || !data.length) return null;
    type = String(type || '').toLowerCase();
    switch (type) {
        case 'sma': return calculateSMAIndicatorData(data, params);
        case 'ema': return calculateEMA(data, params.period, params.source || 'close');
        case 'wma': return calculateWMAIndicatorData(data, params);
        case 'dema': return calculateDEMA(data, params.period, params.source || 'close');
        case 'tema': return calculateTEMA(data, params.period);
        case 'hma': return calculateHMA(data, params.period, params.source || 'close');
        case 'bb': case 'bollinger': return calculateBollingerBands(data, params);
        case 'envelope': case 'smaenvelope': return calculateEnvelope(data, params.period, params.percent, params.source || 'close');
        case 'vwap': return calculateVWAPIndicatorData(data, params);
        case 'atr': return calculateATR(data, atrPeriodFromParams(params), atrSmoothingTypeFromParams(params));
        case 'cci': return calculateCCIIndicatorData(data, params);
        case 'adx': return calculateADX(data, params.diLength, params.adxSmoothing);
        case 'rsi': return calculateRSIIndicatorData(data, params);
        case 'macd': case 'ppo': return calculateMACD(data, params.fast, params.slow, params.signal, params.source || 'close', { oscillatorMaType: params.oscillatorMaType, signalMaType: params.signalMaType });
        case 'stoch': case 'stochastic': return calculateStochastic(data, params.period, params.smoothK, params.smoothD);
        case 'adr': return calculateADR(data, Math.max(1, parseInt(params.period, 10) || 14));
        case 'volume': return { active: true };
        case 'sessions': return calculateSessions(data, params);
        case 'killzones': case 'ictkz': return calculateKillzones(data, params);
        case 'roc': return calculateROC(data, params.period, params.source || 'close');
        case 'mom': case 'momentum': return calculateMomentum(data, params.period, params.source || 'close');
        case 'obv': return calculateOBVIndicatorData(data, params);
        case 'willr': return calculateWilliamsR(data, params.period, params.source || 'close');
        case 'mfi': return calculateMFI(data, params.period);
        case 'donchian': return calculateDonchian(data, params.period, params.offset != null ? params.offset : 0);
        case 'keltner': return calculateKeltner(data, params);
        case 'aroon': return calculateAroon(data, params.period);
        case 'cmf': return calculateCMF(data, params.period);
        case 'trix': return calculateTRIX(data, params.period);
        case 'psar': return calculatePSAR(data, params);
        case 'sessionsplus': return calculateSessionsPlus(data, params);
        case 'openingrange': case 'or': return calculateOpeningRange(data, params);
        case 'supertrend': return calculateSupertrend(data, params.period, params.multiplier);
        case 'stddev': return calculateStdDevLine(data, params.period, params.source || 'close');
        case 'ao': return calculateAO(data, params.fastLength, params.slowLength);
        case 'uo': return calculateUltimateOscillator(data, params.period1, params.period2, params.period3);
        case 'vortex': return calculateVortex(data, params.period);
        case 'dpo': return calculateDPO(data, params.period, params.centered === true);
        case 'stochrsi': return calculateStochRSI(data, params.rsiPeriod, params.stochLen, params.smoothK, params.smoothD, params.source || 'close');
        case 'massindex': return calculateMassIndex(data, MASS_INDEX_EMA_PERIOD, massIndexPeriodFromParams(params));
        case 'coppock': return calculateCoppock(data, params);
        case 'rvi': return calculateRVI(data, params.period);
        case 'elderray': return calculateElderRay(data, params.period);
        case 'seasonality': return calculateSeasonality(data, params.minSamples != null ? params.minSamples : 2);
        case 'ictpd': return calculateIctPrevDayPD(data);
        case 'ictasian': return calculateIctAsianRange(data, params);
        case 'ictote': return calculateIctOTE(data, params.lookback, params.fibLow, params.fibHigh);
        case 'ictfvg': return calculateFairValueGaps(data, params);
        case 'ictsesspd': return calculateIctSessionPrevDayPD(data, params);
        // cotnet requires server fetch — skip in worker
        case 'cotnet': return { loading: true, workerSkipped: true };
        default: return null;
    }
}

// ─── MESSAGE HANDLER ───────────────────────────────────────────────────────

self.onmessage = function(e) {
    const { type, id, payload } = e.data;

    if (type === 'CALCULATE_ALL') {
        const { indicators, bars } = payload;
        try {
            const results = {};
            for (const [indId, cfg] of Object.entries(indicators)) {
                try {
                    results[indId] = calcIndicator(cfg.type, bars, cfg.params || {});
                } catch (err) {
                    results[indId] = null;
                }
            }
            self.postMessage({ type: 'ALL_RESULTS', id, results });
        } catch (err) {
            self.postMessage({ type: 'ERROR', id, error: err.message });
        }
        return;
    }

    if (type === 'PING') {
        self.postMessage({ type: 'PONG', id });
    }
};
