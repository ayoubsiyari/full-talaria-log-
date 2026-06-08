/**
 * Web Worker for decoding candle data off the main thread.
 * 
 * Handles:
 * - CSV string parsing into candle objects
 * - Columnar JSON to candle array conversion
 * - Timeframe resampling for smaller datasets
 * 
 * Messages:
 *   { type: 'parseCSV', id, payload: { csv: string } }
 *   { type: 'parseColumnar', id, payload: { data: {t,o,h,l,c,v} } }
 *   { type: 'resample', id, payload: { candles: [], timeframe: string } }
 */

self.onmessage = function(e) {
    const { type, id, payload } = e.data;
    
    try {
        let result;
        
        switch (type) {
            case 'parseCSV':
                result = parseCSV(payload.csv);
                break;
            case 'parseColumnar':
                result = parseColumnar(payload.data);
                break;
            case 'resample':
                result = resampleCandles(payload.candles, payload.timeframe);
                break;
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
        
        self.postMessage({ id, type: 'result', data: result });
    } catch (err) {
        self.postMessage({ id, type: 'error', error: err.message });
    }
};

/**
 * Parse CSV string into array of candle objects
 */
function parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headerLine = lines[0].toLowerCase();
    const sep = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(sep).map(h => h.trim());
    
    // Find column indices
    const findIdx = (names) => {
        for (const name of names) {
            const idx = headers.findIndex(h => h.includes(name));
            if (idx >= 0) return idx;
        }
        return -1;
    };
    
    const timeIdx = findIdx(['timestamp', 'time', 'date', 'datetime', 'dt']);
    const openIdx = findIdx(['open']);
    const highIdx = findIdx(['high']);
    const lowIdx = findIdx(['low']);
    const closeIdx = findIdx(['close']);
    const volIdx = findIdx(['volume', 'vol']);
    
    const candles = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(sep);
        
        try {
            let t;
            const timeVal = cols[timeIdx];
            
            if (!timeVal) continue;
            
            // Try numeric timestamp first
            const numVal = Number(timeVal);
            if (!isNaN(numVal) && numVal > 0) {
                t = numVal < 10000000000 ? numVal * 1000 : numVal;
            } else {
                // Try date string parsing
                const d = new Date(timeVal);
                if (isNaN(d.getTime())) continue;
                t = d.getTime();
            }
            
            candles.push({
                t: t,
                o: parseFloat(cols[openIdx]) || 0,
                h: parseFloat(cols[highIdx]) || 0,
                l: parseFloat(cols[lowIdx]) || 0,
                c: parseFloat(cols[closeIdx]) || 0,
                v: volIdx >= 0 ? (parseFloat(cols[volIdx]) || 0) : 0
            });
        } catch (e) {
            continue;
        }
    }
    
    return candles;
}

/**
 * Convert columnar JSON format to candle array
 */
function parseColumnar(data) {
    if (!data || !data.t || data.t.length === 0) return [];
    
    const len = data.t.length;
    const candles = new Array(len);
    
    for (let i = 0; i < len; i++) {
        candles[i] = {
            t: data.t[i],
            o: data.o[i],
            h: data.h[i],
            l: data.l[i],
            c: data.c[i],
            v: data.v[i]
        };
    }
    
    return candles;
}

/**
 * Resample candles to a target timeframe
 */
function resampleCandles(candles, timeframe) {
    const tfMs = {
        '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
        '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000, '1M': 2592000000
    };
    
    const ms = tfMs[timeframe];
    if (!ms || !candles || candles.length === 0) return candles || [];
    
    const aggregated = [];
    let currentBucket = null;
    let current = null;
    
    for (const c of candles) {
        const bucket = Math.floor(c.t / ms) * ms;
        
        if (bucket !== currentBucket) {
            if (current) aggregated.push(current);
            currentBucket = bucket;
            current = {
                t: bucket,
                o: c.o,
                h: c.h,
                l: c.l,
                c: c.c,
                v: c.v
            };
        } else {
            current.h = Math.max(current.h, c.h);
            current.l = Math.min(current.l, c.l);
            current.c = c.c;
            current.v += c.v;
        }
    }
    
    if (current) aggregated.push(current);
    
    return aggregated;
}
