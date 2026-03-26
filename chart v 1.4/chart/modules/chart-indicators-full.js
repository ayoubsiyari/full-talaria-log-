// Full Chart Indicators Module with all basic indicators
(function(global) {
    
    // Wait for Chart class to be defined
    function initIndicatorsModule() {
        if (typeof global.Chart === 'undefined') {
            setTimeout(initIndicatorsModule, 100);
            return;
        }
        attachIndicatorMethods();
    }
    
    function attachIndicatorMethods() {
        const Chart = global.Chart;

    /** TradingView-style transparent legend — matches indicator-ui.js */
    function getTalariaChipStyles() {
        const w = global;
        const fallbackChip =
            'display:inline-flex;align-items:center;gap:4px;min-height:18px;box-sizing:border-box;' +
            'padding:0 2px;margin-right:6px;margin-bottom:2px;border-radius:0;line-height:1;' +
            'border:none;background:transparent;cursor:pointer;vertical-align:middle;';
        return {
            chipCss: w.TALARIA_INDICATOR_CHIP_CSS || fallbackChip,
            bg: w.TALARIA_INDICATOR_CHIP_BG || 'transparent',
            bgHover: w.TALARIA_INDICATOR_CHIP_BG_HOVER || 'transparent',
            borderHover: w.TALARIA_INDICATOR_CHIP_BORDER_HOVER || 'transparent',
            colorStrip: w.TALARIA_INDICATOR_COLOR_STRIP || function(c) {
                return 'display:inline-block;width:10px;height:2px;border-radius:1px;background:' + c + ';flex-shrink:0;';
            }
        };
    }
    
    // ===== Calculation Functions =====
    
    // Simple Moving Average
    function calculateSMA(data, period, field) {
        field = field || 'c';
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j][field];
                }
                result.push(sum / period);
            }
        }
        return result;
    }
    
    // Exponential Moving Average
    function calculateEMA(data, period, field) {
        field = field || 'c';
        const result = [];
        const multiplier = 2 / (period + 1);
        let ema = null;
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else if (i === period - 1) {
                // First EMA is SMA
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j][field];
                }
                ema = sum / period;
                result.push(ema);
            } else {
                ema = (data[i][field] - ema) * multiplier + ema;
                result.push(ema);
            }
        }
        return result;
    }
    
    // Weighted Moving Average
    function calculateWMA(data, period, field) {
        field = field || 'c';
        const result = [];
        const denominator = (period * (period + 1)) / 2;
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += data[i - j][field] * (period - j);
                }
                result.push(sum / denominator);
            }
        }
        return result;
    }

    /** Rolling SMA; null until full window of finite values */
    function rollingSmaNullable(arr, period) {
        const out = arr.map(function() { return null; });
        for (let i = 0; i < arr.length; i++) {
            let sum = 0;
            let ok = true;
            for (let j = 0; j < period; j++) {
                const idx = i - j;
                if (idx < 0) { ok = false; break; }
                const v = arr[idx];
                if (v === null || v === undefined || isNaN(v)) { ok = false; break; }
                sum += v;
            }
            if (ok) out[i] = sum / period;
        }
        return out;
    }
    
    // Bollinger Bands
    function calculateBollingerBands(data, period, stdDev) {
        const middle = calculateSMA(data, period, 'c');
        const upper = [];
        const lower = [];
        
        for (let i = 0; i < data.length; i++) {
            if (middle[i] === null) {
                upper.push(null);
                lower.push(null);
            } else {
                // Calculate standard deviation
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    const diff = data[i - j].c - middle[i];
                    sum += diff * diff;
                }
                const std = Math.sqrt(sum / period);
                upper.push(middle[i] + (stdDev * std));
                lower.push(middle[i] - (stdDev * std));
            }
        }
        
        return { upper: upper, middle: middle, lower: lower };
    }
    
    // RSI (Relative Strength Index)
    function calculateRSI(data, period) {
        const result = [];
        const gains = [];
        const losses = [];
        
        // Calculate price changes
        for (let i = 1; i < data.length; i++) {
            const change = data[i].c - data[i - 1].c;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        result.push(null); // First candle has no RSI
        
        // Calculate initial average gain/loss
        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period && i < gains.length; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;
        
        // Calculate RSI
        for (let i = 0; i < gains.length; i++) {
            if (i < period) {
                result.push(null);
            } else {
                avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
                avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                const rsi = 100 - (100 / (1 + rs));
                result.push(rsi);
            }
        }
        
        return result;
    }
    
    // MACD
    function calculateMACD(data, fast, slow, signal) {
        const fastEMA = calculateEMA(data, fast, 'c');
        const slowEMA = calculateEMA(data, slow, 'c');
        const macd = [];
        
        for (let i = 0; i < data.length; i++) {
            if (fastEMA[i] !== null && slowEMA[i] !== null) {
                macd.push(fastEMA[i] - slowEMA[i]);
            } else {
                macd.push(null);
            }
        }
        
        // Signal line is EMA of MACD
        const signalLine = [];
        const multiplier = 2 / (signal + 1);
        let ema = null;
        
        for (let i = 0; i < macd.length; i++) {
            if (macd[i] === null) {
                signalLine.push(null);
            } else if (ema === null) {
                ema = macd[i];
                signalLine.push(ema);
            } else {
                ema = (macd[i] - ema) * multiplier + ema;
                signalLine.push(ema);
            }
        }
        
        // Histogram
        const histogram = [];
        for (let i = 0; i < macd.length; i++) {
            if (macd[i] !== null && signalLine[i] !== null) {
                histogram.push(macd[i] - signalLine[i]);
            } else {
                histogram.push(null);
            }
        }
        
        return { macd: macd, signal: signalLine, histogram: histogram };
    }
    
    // VWAP (Volume Weighted Average Price)
    function calculateVWAP(data) {
        const result = [];
        let cumulativeTPV = 0; // Typical Price * Volume
        let cumulativeVolume = 0;
        
        for (let i = 0; i < data.length; i++) {
            const typicalPrice = (data[i].h + data[i].l + data[i].c) / 3;
            const tpv = typicalPrice * data[i].v;
            
            cumulativeTPV += tpv;
            cumulativeVolume += data[i].v;
            
            if (cumulativeVolume === 0) {
                result.push(null);
            } else {
                result.push(cumulativeTPV / cumulativeVolume);
            }
        }
        
        return result;
    }
    
    // Stochastic Oscillator
    function calculateStochastic(data, period, smoothK, smoothD) {
        const k = [];
        const d = [];
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                k.push(null);
            } else {
                let highest = data[i].h;
                let lowest = data[i].l;
                
                for (let j = 1; j < period; j++) {
                    highest = Math.max(highest, data[i - j].h);
                    lowest = Math.min(lowest, data[i - j].l);
                }
                
                const range = highest - lowest;
                const kValue = range === 0 ? 50 : ((data[i].c - lowest) / range) * 100;
                k.push(kValue);
            }
        }

        const smoothedK = rollingSmaNullable(k, Math.max(1, smoothK));
        const smoothedD = rollingSmaNullable(smoothedK, Math.max(1, smoothD));

        return { k: smoothedK, d: smoothedD };
    }
    
    // ATR (Average True Range)
    function calculateATR(data, period) {
        const trs = [];
        const atr = [];
        
        // Calculate True Range (TR)
        for (let i = 0; i < data.length; i++) {
            let tr;
            if (i === 0) {
                tr = data[i].h - data[i].l;
            } else {
                const highLow = data[i].h - data[i].l;
                const highPrevClose = Math.abs(data[i].h - data[i - 1].c);
                const lowPrevClose = Math.abs(data[i].l - data[i - 1].c);
                tr = Math.max(highLow, highPrevClose, lowPrevClose);
            }
            trs.push(tr);
        }
        
        // Calculate ATR (Smoothed Moving Average of TR)
        let currentATR = 0;
        const multiplier = 1 / period;
        
        for (let i = 0; i < trs.length; i++) {
            if (i < period - 1) {
                atr.push(null);
            } else if (i === period - 1) {
                // Initial ATR is the simple average of the first 'period' TRs
                let sumTR = 0;
                for (let j = 0; j < period; j++) {
                    sumTR += trs[j];
                }
                currentATR = sumTR / period;
                atr.push(currentATR);
            } else {
                // Smoothed ATR
                currentATR = ((currentATR * (period - 1)) + trs[i]) / period;
                atr.push(currentATR);
            }
        }
        
        return atr;
    }
    
    // ADX (Average Directional Index)
    function calculateADX(data, period) {
        const trs = [];
        const plusDM = [];
        const minusDM = [];
        
        // Calculate True Range (TR), +DM, and -DM
        for (let i = 0; i < data.length; i++) {
            let tr;
            if (i === 0) {
                tr = data[i].h - data[i].l;
                plusDM.push(0);
                minusDM.push(0);
            } else {
                const highLow = data[i].h - data[i].l;
                const highPrevClose = Math.abs(data[i].h - data[i - 1].c);
                const lowPrevClose = Math.abs(data[i].l - data[i - 1].c);
                tr = Math.max(highLow, highPrevClose, lowPrevClose);
                
                const upMove = data[i].h - data[i - 1].h;
                const downMove = data[i - 1].l - data[i].l;
                
                let pDM = 0;
                let mDM = 0;
                
                if (upMove > downMove && upMove > 0) {
                    pDM = upMove;
                }
                if (downMove > upMove && downMove > 0) {
                    mDM = downMove;
                }
                
                plusDM.push(pDM);
                minusDM.push(mDM);
            }
            trs.push(tr);
        }
        
        // Calculate Smoothed TR, +DM, and -DM (using Wilders Smoothing)
        const wildersSmoothing = (arr, period) => {
            const smoothed = [];
            let currentAvg = 0;
            
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) {
                    smoothed.push(null);
                } else if (i === period - 1) {
                    let sum = 0;
                    for (let j = 0; j < period; j++) {
                        sum += arr[j];
                    }
                    currentAvg = sum / period;
                    smoothed.push(currentAvg);
                } else {
                    currentAvg = (currentAvg * (period - 1) + arr[i]) / period;
                    smoothed.push(currentAvg);
                }
            }
            return smoothed;
        };
        
        const smoothedTR = wildersSmoothing(trs, period);
        const smoothedPlusDM = wildersSmoothing(plusDM, period);
        const smoothedMinusDM = wildersSmoothing(minusDM, period);
        
        const plusDI = [];
        const minusDI = [];
        const DX = [];
        const ADX = [];
        
        let currentADX = 0;
        
        for (let i = 0; i < data.length; i++) {
            if (smoothedTR[i] === null || smoothedTR[i] === 0) {
                plusDI.push(null);
                minusDI.push(null);
                DX.push(null);
                ADX.push(null);
            } else {
                const pDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
                const mDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
                plusDI.push(pDI);
                minusDI.push(mDI);
                
                const DXValue = (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
                DX.push(DXValue);
                
                // Calculate ADX (Wilders Smoothing of DX)
                if (i < (period * 2) - 2) { // ADX needs 2 * period - 1 data points to start
                    ADX.push(null);
                } else if (i === (period * 2) - 2) {
                    let sumDX = 0;
                    for (let j = period - 1; j < (period * 2) - 1; j++) {
                        sumDX += DX[j];
                    }
                    currentADX = sumDX / period;
                    ADX.push(currentADX);
                } else {
                    currentADX = (currentADX * (period - 1) + DX[i]) / period;
                    ADX.push(currentADX);
                }
            }
        }
        
        return { plusDI: plusDI, minusDI: minusDI, adx: ADX };
    }
    
    // ADR (Average Daily Range) - calculates average of daily high-low range
    function calculateADR(data, period) {
        const result = [];
        const dailyRanges = [];
        let currentDay = null;
        let dayHigh = null;
        let dayLow = null;
        
        // First, calculate daily ranges from the candle data
        for (let i = 0; i < data.length; i++) {
            const candleDate = new Date(data[i].t);
            const dayKey = candleDate.toDateString();
            
            if (currentDay !== dayKey) {
                // New day - save previous day's range if exists
                if (currentDay !== null && dayHigh !== null && dayLow !== null) {
                    dailyRanges.push({ high: dayHigh, low: dayLow, range: dayHigh - dayLow });
                }
                // Start new day
                currentDay = dayKey;
                dayHigh = data[i].h;
                dayLow = data[i].l;
            } else {
                // Same day - update high/low
                dayHigh = Math.max(dayHigh, data[i].h);
                dayLow = Math.min(dayLow, data[i].l);
            }
        }
        // Don't forget the last day
        if (currentDay !== null && dayHigh !== null && dayLow !== null) {
            dailyRanges.push({ high: dayHigh, low: dayLow, range: dayHigh - dayLow });
        }
        
        // Now calculate ADR for each candle
        let currentDayIndex = -1;
        currentDay = null;
        
        for (let i = 0; i < data.length; i++) {
            const candleDate = new Date(data[i].t);
            const dayKey = candleDate.toDateString();
            
            if (currentDay !== dayKey) {
                currentDay = dayKey;
                currentDayIndex++;
            }
            
            // Calculate ADR as average of last 'period' daily ranges
            if (currentDayIndex < period) {
                result.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < period && (currentDayIndex - j - 1) >= 0; j++) {
                    sum += dailyRanges[currentDayIndex - j - 1].range;
                }
                result.push(sum / period);
            }
        }
        
        return result;
    }
    
    // ADR Bands - calculates upper/lower bands based on ADR from day's open
    function calculateADRBands(data, period) {
        const adrValues = calculateADR(data, period);
        const upper = [];
        const lower = [];
        
        let currentDay = null;
        let dayOpen = null;
        
        for (let i = 0; i < data.length; i++) {
            const candleDate = new Date(data[i].t);
            const dayKey = candleDate.toDateString();
            
            // Track day open
            if (currentDay !== dayKey) {
                currentDay = dayKey;
                dayOpen = data[i].o;
            }
            
            if (adrValues[i] === null || dayOpen === null) {
                upper.push(null);
                lower.push(null);
            } else {
                // ADR bands: day open +/- half of ADR
                const halfADR = adrValues[i] / 2;
                upper.push(dayOpen + halfADR);
                lower.push(dayOpen - halfADR);
            }
        }
        
        return { upper, lower, adr: adrValues };
    }
    
    // ATR Bands - calculates upper/lower bands based on ATR from close price
    function calculateATRBands(data, period, multiplier) {
        const atrValues = calculateATR(data, period);
        const upper = [];
        const lower = [];
        const middle = [];
        
        for (let i = 0; i < data.length; i++) {
            if (atrValues[i] === null) {
                upper.push(null);
                lower.push(null);
                middle.push(null);
            } else {
                const closePrice = data[i].c;
                const atrOffset = atrValues[i] * multiplier;
                middle.push(closePrice);
                upper.push(closePrice + atrOffset);
                lower.push(closePrice - atrOffset);
            }
        }
        
        return { upper, lower, middle, atr: atrValues };
    }
    
    // Sessions indicator - marks trading sessions with time zones
    function calculateSessions(data, params) {
        const sessions = [];
        
        // Helper to parse time string "HH:MM" to decimal hours
        const parseTime = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            return parseInt(parts[0]) + (parseInt(parts[1] || 0) / 60);
        };
        
        // Parse session times from params (or use defaults)
        const sessionDefs = {
            asian: { 
                start: parseTime(params.asianStart || '00:00'), 
                end: parseTime(params.asianEnd || '09:00'), 
                color: params.asianColor || 'rgba(255, 193, 7, 0.15)' 
            },
            london: { 
                start: parseTime(params.londonStart || '07:00'), 
                end: parseTime(params.londonEnd || '16:00'), 
                color: params.londonColor || 'rgba(33, 150, 243, 0.15)' 
            },
            newYork: { 
                start: parseTime(params.newYorkStart || '12:00'), 
                end: parseTime(params.newYorkEnd || '21:00'), 
                color: params.newYorkColor || 'rgba(76, 175, 80, 0.15)' 
            }
        };
        
        // Helper to check if time is in session (handles overnight sessions)
        const isInSession = (hour, minute, session) => {
            const timeDecimal = hour + (minute / 60);
            if (session.start <= session.end) {
                // Normal session (e.g., 09:00 - 17:00)
                return timeDecimal >= session.start && timeDecimal < session.end;
            } else {
                // Overnight session (e.g., 22:00 - 06:00)
                return timeDecimal >= session.start || timeDecimal < session.end;
            }
        };
        
        for (let i = 0; i < data.length; i++) {
            const date = new Date(data[i].t);
            const hour = date.getUTCHours();
            const minute = date.getUTCMinutes();
            
            const candleSessions = [];
            
            if (params.showAsian !== false && isInSession(hour, minute, sessionDefs.asian)) {
                candleSessions.push({ type: 'asian', color: sessionDefs.asian.color });
            }
            if (params.showLondon !== false && isInSession(hour, minute, sessionDefs.london)) {
                candleSessions.push({ type: 'london', color: sessionDefs.london.color });
            }
            if (params.showNewYork !== false && isInSession(hour, minute, sessionDefs.newYork)) {
                candleSessions.push({ type: 'newYork', color: sessionDefs.newYork.color });
            }
            
            sessions.push(candleSessions);
        }
        
        return sessions;
    }
    
    // ICT Kill Zones indicator - session boxes with high/low, NY midnight line, deviations
    function calculateKillzones(data, params) {
        const result = {
            sessions: [],
            nyMidnight: [],
            boxes: []
        };
        
        // Parse time string "HH:MM" to decimal hours
        const parseTime = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            return parseInt(parts[0]) + (parseInt(parts[1] || 0) / 60);
        };
        
        // Session definitions (in NY timezone, UTC-5)
        const sessionDefs = {
            cbdr: {
                name: 'CBDR',
                start: parseTime(params.cbdrStart || '14:00'),
                end: parseTime(params.cbdrEnd || '20:00'),
                color: params.cbdrColor || '#0064ff',
                enabled: params.showCBDR !== false
            },
            asia: {
                name: 'Asia',
                start: parseTime(params.asiaStart || '20:00'),
                end: parseTime(params.asiaEnd || '00:00'),
                color: params.asiaColor || '#7622ff',
                enabled: params.showAsia !== false
            },
            london: {
                name: 'London',
                start: parseTime(params.londonStart || '02:00'),
                end: parseTime(params.londonEnd || '05:00'),
                color: params.londonColor || '#e90000',
                enabled: params.showLondon !== false
            },
            nyam: {
                name: 'NY AM',
                start: parseTime(params.nyamStart || '07:00'),
                end: parseTime(params.nyamEnd || '10:00'),
                color: params.nyamColor || '#00acb8',
                enabled: params.showNYAM !== false
            },
            londonClose: {
                name: 'LC',
                start: parseTime(params.lcStart || '10:00'),
                end: parseTime(params.lcEnd || '12:00'),
                color: params.lcColor || '#434651',
                enabled: params.showLC !== false
            }
        };
        
        // NY timezone offset (UTC-5 for EST, UTC-4 for EDT)
        // Default to EST (UTC-5)
        const nyOffset = params.nyOffset !== undefined ? params.nyOffset : -5;
        
        // Helper to convert UTC time to NY time
        const toNYTime = (date) => {
            const utcHours = date.getUTCHours();
            const utcMinutes = date.getUTCMinutes();
            let nyHours = utcHours + nyOffset;
            if (nyHours < 0) nyHours += 24;
            if (nyHours >= 24) nyHours -= 24;
            return { hours: nyHours, minutes: utcMinutes, decimal: nyHours + (utcMinutes / 60) };
        };
        
        // Check if time is in session (handles overnight)
        const isInSession = (decimal, session) => {
            if (session.start <= session.end) {
                return decimal >= session.start && decimal < session.end;
            } else {
                // Overnight session (e.g., 20:00 - 00:00)
                return decimal >= session.start || decimal < session.end;
            }
        };
        
        // Track active session boxes
        const activeBoxes = {};
        let lastDate = null;
        
        for (let i = 0; i < data.length; i++) {
            const date = new Date(data[i].t);
            const nyTime = toNYTime(date);
            const currentDate = date.toDateString();
            
            // Track NY Midnight (00:00 NY time)
            if (params.showNYMidnight !== false) {
                // Check if this candle crosses midnight NY time
                if (lastDate) {
                    const lastNYTime = toNYTime(lastDate);
                    if (lastNYTime.decimal > 23 || (lastNYTime.decimal > nyTime.decimal && nyTime.decimal < 1)) {
                        result.nyMidnight.push({
                            index: i,
                            price: data[i].o,
                            time: data[i].t
                        });
                    }
                }
            }
            
            // Process each session
            Object.keys(sessionDefs).forEach(key => {
                const session = sessionDefs[key];
                if (!session.enabled) return;
                
                const inSession = isInSession(nyTime.decimal, session);
                
                if (inSession) {
                    if (!activeBoxes[key]) {
                        // Start new session box
                        activeBoxes[key] = {
                            type: key,
                            name: session.name,
                            color: session.color,
                            startIndex: i,
                            startTime: data[i].t,
                            high: data[i].h,
                            low: data[i].l,
                            endIndex: i
                        };
                    } else {
                        // Update existing session box
                        activeBoxes[key].high = Math.max(activeBoxes[key].high, data[i].h);
                        activeBoxes[key].low = Math.min(activeBoxes[key].low, data[i].l);
                        activeBoxes[key].endIndex = i;
                    }
                } else {
                    // Session ended
                    if (activeBoxes[key]) {
                        const box = activeBoxes[key];
                        box.endTime = data[i - 1] ? data[i - 1].t : data[i].t;
                        box.range = box.high - box.low;
                        result.boxes.push({...box});
                        delete activeBoxes[key];
                    }
                }
            });
            
            lastDate = date;
        }
        
        // Close any remaining active boxes
        Object.keys(activeBoxes).forEach(key => {
            const box = activeBoxes[key];
            box.endTime = data[data.length - 1].t;
            box.range = box.high - box.low;
            result.boxes.push({...box});
        });
        
        // Store params for deviations
        result.showDeviations = params.showDeviations || false;
        result.deviationCount = params.deviationCount || 2;
        result.showMidline = params.showMidline !== false;
        result.showBoxInfo = params.showBoxInfo !== false;
        result.boxTransparency = params.boxTransparency !== undefined ? params.boxTransparency : 85;
        result.showNYMidnight = params.showNYMidnight !== false;
        result.nyMidnightColor = params.nyMidnightColor || '#2d62b6';
        
        return result;
    }
    
    // CCI (Commodity Channel Index)
    function calculateCCI(data, period) {
        const result = [];
        const constant = 0.015;
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                const tp = (data[i].h + data[i].l + data[i].c) / 3;
                
                // Calculate SMA of Typical Price (TP)
                let sumTP = 0;
                for (let j = 0; j < period; j++) {
                    sumTP += (data[i - j].h + data[i - j].l + data[i - j].c) / 3;
                }
                const smaTP = sumTP / period;
                
                // Calculate Mean Deviation (MD)
                let sumMD = 0;
                for (let j = 0; j < period; j++) {
                    const prevTP = (data[i - j].h + data[i - j].l + data[i - j].c) / 3;
                    sumMD += Math.abs(prevTP - smaTP);
                }
                const meanDeviation = sumMD / period;
                
                if (meanDeviation === 0) {
                    result.push(0); // Avoid division by zero
                } else {
                    const cci = (tp - smaTP) / (constant * meanDeviation);
                    result.push(cci);
                }
            }
        }
        
        return result;
    }

    function calculateDEMA(data, period, field) {
        field = field || 'c';
        const ema1 = calculateEMA(data, period, field);
        const pseudo = data.map(function(d, i) {
            const v = ema1[i];
            return {
                h: v != null ? v : d[field],
                l: v != null ? v : d[field],
                c: v != null ? v : d[field],
                o: v != null ? v : d[field],
                v: d.v,
                t: d.t
            };
        });
        const ema2 = calculateEMA(pseudo, period, 'c');
        return ema1.map(function(e1, i) {
            const e2 = ema2[i];
            if (e1 == null || e2 == null) return null;
            return 2 * e1 - e2;
        });
    }

    function calculateTEMA(data, period, field) {
        field = field || 'c';
        const e1 = calculateEMA(data, period, field);
        const p2 = data.map(function(d, i) {
            const v = e1[i];
            return { h: v != null ? v : d[field], l: v != null ? v : d[field], c: v != null ? v : d[field], o: v != null ? v : d[field], v: d.v, t: d.t };
        });
        const e2 = calculateEMA(p2, period, 'c');
        const p3 = data.map(function(d, i) {
            const v = e2[i];
            return { h: v != null ? v : d[field], l: v != null ? v : d[field], c: v != null ? v : d[field], o: v != null ? v : d[field], v: d.v, t: d.t };
        });
        const e3 = calculateEMA(p3, period, 'c');
        return e1.map(function(a, i) {
            const b = e2[i], c = e3[i];
            if (a == null || b == null || c == null) return null;
            return 3 * a - 3 * b + c;
        });
    }

    function calculateHMA(data, period, field) {
        field = field || 'c';
        const n = Math.max(2, Math.floor(period));
        const half = Math.max(1, Math.floor(n / 2));
        const sqrtN = Math.max(1, Math.round(Math.sqrt(n)));
        const w1 = calculateWMA(data, half, field);
        const w2 = calculateWMA(data, n, field);
        const raw = data.map(function(_, i) {
            if (w1[i] == null || w2[i] == null) return null;
            return 2 * w1[i] - w2[i];
        });
        let last = null;
        const pseudo = data.map(function(d, i) {
            if (raw[i] != null) last = raw[i];
            const c = last != null ? last : d[field];
            return { h: c, l: c, c: c, o: c, v: d.v, t: d.t };
        });
        return calculateWMA(pseudo, sqrtN, 'c');
    }

    function calculateROC(data, period) {
        const out = [];
        const p = Math.max(2, period);
        for (let i = 0; i < data.length; i++) {
            if (i < p) {
                out.push(null);
                continue;
            }
            const prev = data[i - p].c;
            if (!prev) { out.push(null); continue; }
            out.push((data[i].c / prev - 1) * 100);
        }
        return out;
    }

    function calculateMomentum(data, period) {
        const out = [];
        const p = Math.max(1, period);
        for (let i = 0; i < data.length; i++) {
            if (i < p) out.push(null);
            else out.push(data[i].c - data[i - p].c);
        }
        return out;
    }

    function calculateOBV(data) {
        const out = [];
        let obv = 0;
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                out.push(0);
                continue;
            }
            const c0 = data[i].c, c1 = data[i - 1].c;
            const v = data[i].v || 0;
            if (c0 > c1) obv += v;
            else if (c0 < c1) obv -= v;
            out.push(obv);
        }
        return out;
    }

    function calculateWilliamsR(data, period) {
        const p = Math.max(1, period);
        const out = [];
        for (let i = 0; i < data.length; i++) {
            if (i < p - 1) {
                out.push(null);
                continue;
            }
            let hh = -Infinity, ll = Infinity;
            for (let j = 0; j < p; j++) {
                const bar = data[i - j];
                hh = Math.max(hh, bar.h);
                ll = Math.min(ll, bar.l);
            }
            const range = hh - ll;
            if (!range) out.push(null);
            else out.push(-100 * (hh - data[i].c) / range);
        }
        return out;
    }

    function calculateMFI(data, period) {
        const p = Math.max(2, period);
        const out = [];
        const tp = data.map(function(d) { return (d.h + d.l + d.c) / 3; });
        for (let i = 0; i < data.length; i++) {
            if (i < p) {
                out.push(null);
                continue;
            }
            let pos = 0, neg = 0;
            for (let j = 0; j < p; j++) {
                const idx = i - j;
                if (idx <= 0) continue;
                const rawMF = tp[idx] * (data[idx].v || 0);
                const dir = tp[idx] - tp[idx - 1];
                if (dir > 0) pos += rawMF;
                else if (dir < 0) neg += rawMF;
            }
            if (neg === 0) out.push(pos === 0 ? 50 : 100);
            else {
                const ratio = pos / neg;
                out.push(100 - 100 / (1 + ratio));
            }
        }
        return out;
    }

    function calculateDonchian(data, period) {
        const p = Math.max(1, period);
        const upper = [], lower = [], middle = [];
        for (let i = 0; i < data.length; i++) {
            if (i < p - 1) {
                upper.push(null); lower.push(null); middle.push(null);
                continue;
            }
            let hh = -Infinity, ll = Infinity;
            for (let j = 0; j < p; j++) {
                hh = Math.max(hh, data[i - j].h);
                ll = Math.min(ll, data[i - j].l);
            }
            upper.push(hh);
            lower.push(ll);
            middle.push((hh + ll) / 2);
        }
        return { upper: upper, lower: lower, middle: middle };
    }

    function calculateKeltner(data, emaPeriod, atrPeriod, mult) {
        const mid = calculateEMA(data, emaPeriod, 'c');
        const atr = calculateATR(data, atrPeriod);
        const upper = [], lower = [];
        for (let i = 0; i < data.length; i++) {
            if (mid[i] == null || atr[i] == null) {
                upper.push(null); lower.push(null);
            } else {
                upper.push(mid[i] + mult * atr[i]);
                lower.push(mid[i] - mult * atr[i]);
            }
        }
        return { upper: upper, middle: mid, lower: lower };
    }

    function calculateAroon(data, period) {
        const p = Math.max(1, period);
        const up = [], down = [];
        for (let i = 0; i < data.length; i++) {
            if (i < p - 1) {
                up.push(null); down.push(null);
                continue;
            }
            let highIdx = 0, lowIdx = 0, hh = -Infinity, ll = Infinity;
            for (let j = 0; j < p; j++) {
                const bar = data[i - j];
                if (bar.h >= hh) { hh = bar.h; highIdx = j; }
                if (bar.l <= ll) { ll = bar.l; lowIdx = j; }
            }
            up.push(100 * (p - 1 - highIdx) / (p - 1));
            down.push(100 * (p - 1 - lowIdx) / (p - 1));
        }
        return { up: up, down: down };
    }

    function calculateCMF(data, period) {
        const p = Math.max(1, period);
        const out = [];
        for (let i = 0; i < data.length; i++) {
            if (i < p - 1) {
                out.push(null);
                continue;
            }
            let adSum = 0, volSum = 0;
            for (let j = 0; j < p; j++) {
                const d = data[i - j];
                const range = d.h - d.l;
                const mfm = range ? ((d.c - d.l) - (d.h - d.c)) / range : 0;
                const v = d.v || 0;
                adSum += mfm * v;
                volSum += v;
            }
            out.push(volSum ? adSum / volSum : 0);
        }
        return out;
    }

    function calculateTRIX(data, period) {
        const p = Math.max(1, period);
        const e1 = calculateEMA(data, p, 'c');
        const p2 = data.map(function(d, i) {
            const v = e1[i];
            return { h: v, l: v, c: v, o: v, v: d.v, t: d.t };
        });
        const e2 = calculateEMA(p2, p, 'c');
        const p3 = data.map(function(d, i) {
            const v = e2[i];
            return { h: v, l: v, c: v, o: v, v: d.v, t: d.t };
        });
        const e3 = calculateEMA(p3, p, 'c');
        const out = [];
        for (let i = 0; i < e3.length; i++) {
            if (e3[i] == null || i === 0 || e3[i - 1] == null || e3[i - 1] === 0) out.push(null);
            else out.push(100 * (e3[i] - e3[i - 1]) / e3[i - 1]);
        }
        return out;
    }

    function calculatePSAR(data, step, maxStep) {
        step = step == null ? 0.02 : step;
        maxStep = maxStep == null ? 0.2 : maxStep;
        const n = data.length;
        const sar = new Array(n).fill(null);
        if (n < 2) return sar;

        let isLong = data[1].c >= data[0].c;
        let af = step;
        let ep = isLong ? data[0].h : data[0].l;
        let sarVal = isLong ? data[0].l : data[0].h;
        sar[0] = sarVal;

        for (let i = 1; i < n; i++) {
            const prevSar = sarVal;
            sarVal = prevSar + af * (ep - prevSar);
            const h = data[i].h, l = data[i].l;

            if (isLong) {
                sarVal = Math.min(sarVal, data[i - 1].l, i > 1 ? data[i - 2].l : data[i - 1].l);
                if (l < sarVal) {
                    isLong = false;
                    sarVal = ep;
                    ep = l;
                    af = step;
                } else {
                    if (h > ep) {
                        ep = h;
                        af = Math.min(af + step, maxStep);
                    }
                }
            } else {
                sarVal = Math.max(sarVal, data[i - 1].h, i > 1 ? data[i - 2].h : data[i - 1].h);
                if (h > sarVal) {
                    isLong = true;
                    sarVal = ep;
                    ep = h;
                    af = step;
                } else {
                    if (l < ep) {
                        ep = l;
                        af = Math.min(af + step, maxStep);
                    }
                }
            }
            sar[i] = sarVal;
        }
        return sar;
    }

    // ===== Chart Integration =====
    
    Chart.prototype.initIndicators = function() {
        this.indicators = {
            active: [],
            data: {}
        };
    };
    
    Chart.prototype.addIndicator = function(type, params) {
    params = params || {};
    
    // Auto-initialize indicators if not done
    if (!this.indicators) {
        this.initIndicators();
    }
    
    if (!this.data || this.data.length === 0) {
        alert('Please load chart data first before adding indicators.');
        return;
    }
        
        const indicator = {
        id: 'ind_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: type.toLowerCase(),
        params: {},
        style: {},
        visible: true,
        name: ''
    };
        
        // Configure indicator based on type
        switch (indicator.type) {
            case 'sma':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#2962ff';
                indicator.style.lineWidth = 2;
                indicator.name = 'SMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period);
                break;
                
            case 'ema':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#f23645';
                indicator.style.lineWidth = 2;
                indicator.name = 'EMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateEMA(this.data, indicator.params.period);
                break;
                
            case 'wma':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#ff9800';
                indicator.style.lineWidth = 2;
                indicator.name = 'WMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateWMA(this.data, indicator.params.period);
                break;
                
            case 'bb':
            case 'bollinger':
                indicator.params.period = params.period || 20;
                indicator.params.stdDev = params.stdDev || 2;
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.05)';
                indicator.style.lineWidth = 1;
                indicator.name = 'BB(' + indicator.params.period + ',' + indicator.params.stdDev + ')';
                this.indicators.data[indicator.id] = calculateBollingerBands(this.data, indicator.params.period, indicator.params.stdDev);
                break;
                
            case 'vwap':
                indicator.style.color = params.color || '#9c27b0';
                indicator.style.lineWidth = 2;
                indicator.name = 'VWAP';
                this.indicators.data[indicator.id] = calculateVWAP(this.data);
                break;
                
            case 'atr':
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#ff6d00';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.separatePanel = true;
                indicator.name = 'ATR(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateATR(this.data, indicator.params.period);
                break;

            case 'cci':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#00e676';
                indicator.style.lineWidth = 2;
                indicator.overlay = false;
                indicator.name = 'CCI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateCCI(this.data, indicator.params.period);
                break;

            case 'adx':
                indicator.params.period = params.period || 14;
                indicator.style.adxColor = params.adxColor || '#ff00ff';
                indicator.style.plusDIColor = params.plusDIColor || '#00e676';
                indicator.style.minusDIColor = params.minusDIColor || '#f23645';
                indicator.style.lineWidth = 2;
                indicator.overlay = false;
                indicator.name = 'ADX(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateADX(this.data, indicator.params.period);
                break;

            case 'rsi':
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#9c27b0';
                indicator.style.lineWidth = 2;
                indicator.name = 'RSI(' + indicator.params.period + ')';
                indicator.overlay = false; // RSI should be in separate panel
                this.indicators.data[indicator.id] = calculateRSI(this.data, indicator.params.period);
                break;
                
            case 'macd':
                indicator.params.fast = params.fast || 12;
                indicator.params.slow = params.slow || 26;
                indicator.params.signal = params.signal || 9;
                indicator.style.macdColor = params.macdColor || '#2962ff';
                indicator.style.signalColor = params.signalColor || '#f23645';
                indicator.style.histogramColor = params.histogramColor || '#787b86';
                indicator.name = 'MACD(' + indicator.params.fast + ',' + indicator.params.slow + ',' + indicator.params.signal + ')';
                indicator.overlay = false; // MACD should be in separate panel
                this.indicators.data[indicator.id] = calculateMACD(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                break;
                
            case 'stoch':
            case 'stochastic':
                indicator.params.period = params.period || 14;
                indicator.params.smoothK = params.smoothK || 3;
                indicator.params.smoothD = params.smoothD || 3;
                indicator.style.kColor = params.kColor || '#2962ff';
                indicator.style.dColor = params.dColor || '#f23645';
                indicator.style.lineWidth = 2;
                indicator.name = 'Stoch(' + indicator.params.period + ')';
                indicator.overlay = false;
                this.indicators.data[indicator.id] = calculateStochastic(this.data, indicator.params.period, indicator.params.smoothK, indicator.params.smoothD);
                break;
            
            case 'adr':
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#26a69a';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.separatePanel = true;
                indicator.name = 'ADR(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateADR(this.data, indicator.params.period);
                break;
            
            case 'volume':
                indicator.style.upColor = params.upColor || 'rgba(8, 153, 129, 0.5)';
                indicator.style.downColor = params.downColor || 'rgba(242, 54, 69, 0.5)';
                indicator.params.showMA = params.showMA || false;
                indicator.params.maPeriod = params.maPeriod || 20;
                indicator.style.maColor = params.maColor || '#2962ff';
                indicator.overlay = false;
                indicator.isVolume = true;
                indicator.name = 'Volume';
                // Volume data is already in the candle data, we just need to mark it as active
                this.indicators.data[indicator.id] = { active: true };
                // Enable volume display in chart settings
                this.chartSettings.showVolume = true;
                // Show and setup volume indicator line in OHLC area
                this.setupVolumeIndicatorLine(indicator);
                break;
            
            case 'sessions':
                // Session visibility
                indicator.params.showAsian = params.showAsian !== false;
                indicator.params.showLondon = params.showLondon !== false;
                indicator.params.showNewYork = params.showNewYork !== false;
                // Session times (HH:MM format)
                indicator.params.asianStart = params.asianStart || '00:00';
                indicator.params.asianEnd = params.asianEnd || '09:00';
                indicator.params.londonStart = params.londonStart || '07:00';
                indicator.params.londonEnd = params.londonEnd || '16:00';
                indicator.params.newYorkStart = params.newYorkStart || '12:00';
                indicator.params.newYorkEnd = params.newYorkEnd || '21:00';
                // Session colors
                indicator.style.asianColor = params.asianColor || 'rgba(255, 193, 7, 0.15)';
                indicator.style.londonColor = params.londonColor || 'rgba(33, 150, 243, 0.15)';
                indicator.style.newYorkColor = params.newYorkColor || 'rgba(76, 175, 80, 0.15)';
                indicator.overlay = true;
                indicator.isSessions = true;
                indicator.name = 'Sessions';
                this.indicators.data[indicator.id] = calculateSessions(this.data, {
                    showAsian: indicator.params.showAsian,
                    showLondon: indicator.params.showLondon,
                    showNewYork: indicator.params.showNewYork,
                    asianStart: indicator.params.asianStart,
                    asianEnd: indicator.params.asianEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    newYorkStart: indicator.params.newYorkStart,
                    newYorkEnd: indicator.params.newYorkEnd,
                    asianColor: indicator.style.asianColor,
                    londonColor: indicator.style.londonColor,
                    newYorkColor: indicator.style.newYorkColor
                });
                break;
            
            case 'killzones':
            case 'ictkz':
                // Session visibility
                indicator.params.showCBDR = params.showCBDR !== false;
                indicator.params.showAsia = params.showAsia !== false;
                indicator.params.showLondon = params.showLondon !== false;
                indicator.params.showNYAM = params.showNYAM !== false;
                indicator.params.showLC = params.showLC !== false;
                indicator.params.showNYMidnight = params.showNYMidnight !== false;
                indicator.params.showMidline = params.showMidline !== false;
                indicator.params.showBoxInfo = params.showBoxInfo !== false;
                indicator.params.showDeviations = params.showDeviations || false;
                indicator.params.deviationCount = params.deviationCount || 2;
                indicator.params.boxTransparency = params.boxTransparency !== undefined ? params.boxTransparency : 85;
                // Session times (NY timezone)
                indicator.params.cbdrStart = params.cbdrStart || '14:00';
                indicator.params.cbdrEnd = params.cbdrEnd || '20:00';
                indicator.params.asiaStart = params.asiaStart || '20:00';
                indicator.params.asiaEnd = params.asiaEnd || '00:00';
                indicator.params.londonStart = params.londonStart || '02:00';
                indicator.params.londonEnd = params.londonEnd || '05:00';
                indicator.params.nyamStart = params.nyamStart || '07:00';
                indicator.params.nyamEnd = params.nyamEnd || '10:00';
                indicator.params.lcStart = params.lcStart || '10:00';
                indicator.params.lcEnd = params.lcEnd || '12:00';
                // Session colors
                indicator.style.cbdrColor = params.cbdrColor || '#0064ff';
                indicator.style.asiaColor = params.asiaColor || '#7622ff';
                indicator.style.londonColor = params.londonColor || '#e90000';
                indicator.style.nyamColor = params.nyamColor || '#00acb8';
                indicator.style.lcColor = params.lcColor || '#434651';
                indicator.style.nyMidnightColor = params.nyMidnightColor || '#2d62b6';
                indicator.style.textColor = params.textColor || '#5c71af';
                indicator.overlay = true;
                indicator.isKillzones = true;
                indicator.name = 'ICT Kill Zones';
                this.indicators.data[indicator.id] = calculateKillzones(this.data, {
                    showCBDR: indicator.params.showCBDR,
                    showAsia: indicator.params.showAsia,
                    showLondon: indicator.params.showLondon,
                    showNYAM: indicator.params.showNYAM,
                    showLC: indicator.params.showLC,
                    showNYMidnight: indicator.params.showNYMidnight,
                    showMidline: indicator.params.showMidline,
                    showBoxInfo: indicator.params.showBoxInfo,
                    showDeviations: indicator.params.showDeviations,
                    deviationCount: indicator.params.deviationCount,
                    boxTransparency: indicator.params.boxTransparency,
                    cbdrStart: indicator.params.cbdrStart,
                    cbdrEnd: indicator.params.cbdrEnd,
                    asiaStart: indicator.params.asiaStart,
                    asiaEnd: indicator.params.asiaEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    nyamStart: indicator.params.nyamStart,
                    nyamEnd: indicator.params.nyamEnd,
                    lcStart: indicator.params.lcStart,
                    lcEnd: indicator.params.lcEnd,
                    cbdrColor: indicator.style.cbdrColor,
                    asiaColor: indicator.style.asiaColor,
                    londonColor: indicator.style.londonColor,
                    nyamColor: indicator.style.nyamColor,
                    lcColor: indicator.style.lcColor,
                    nyMidnightColor: indicator.style.nyMidnightColor
                });
                break;

            case 'dema':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#00bcd4';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'DEMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDEMA(this.data, indicator.params.period);
                break;
            case 'tema':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#ab47bc';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'TEMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateTEMA(this.data, indicator.params.period);
                break;
            case 'hma':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#26c6da';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'HMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateHMA(this.data, indicator.params.period);
                break;
            case 'roc':
                indicator.params.period = params.period || 12;
                indicator.style.color = params.color || '#ffa726';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'ROC(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateROC(this.data, indicator.params.period);
                break;
            case 'mom':
            case 'momentum':
                indicator.type = 'mom';
                indicator.params.period = params.period || 10;
                indicator.style.color = params.color || '#66bb6a';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'Mom(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateMomentum(this.data, indicator.params.period);
                break;
            case 'obv':
                indicator.style.color = params.color || '#78909c';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.separatePanel = true;
                indicator.name = 'OBV';
                this.indicators.data[indicator.id] = calculateOBV(this.data);
                break;
            case 'willr':
            case 'williams':
                indicator.type = 'willr';
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#ec407a';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Williams %R(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateWilliamsR(this.data, indicator.params.period);
                break;
            case 'mfi':
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#5c6bc0';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'MFI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateMFI(this.data, indicator.params.period);
                break;
            case 'donchian':
                indicator.params.period = params.period || 20;
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.06)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.name = 'Donchian(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDonchian(this.data, indicator.params.period);
                break;
            case 'keltner':
                indicator.params.emaPeriod = params.emaPeriod || 20;
                indicator.params.atrPeriod = params.atrPeriod || 10;
                indicator.params.multiplier = params.multiplier != null ? params.multiplier : 2;
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.05)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.name = 'Keltner(' + indicator.params.emaPeriod + ',' + indicator.params.atrPeriod + ')';
                this.indicators.data[indicator.id] = calculateKeltner(this.data, indicator.params.emaPeriod, indicator.params.atrPeriod, indicator.params.multiplier);
                break;
            case 'aroon':
                indicator.params.period = params.period || 14;
                indicator.style.upColor = params.upColor || '#00e676';
                indicator.style.downColor = params.downColor || '#f23645';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Aroon(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateAroon(this.data, indicator.params.period);
                break;
            case 'cmf':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#29b6f6';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'CMF(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateCMF(this.data, indicator.params.period);
                break;
            case 'trix':
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#8d6e63';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'TRIX(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateTRIX(this.data, indicator.params.period);
                break;
            case 'psar':
                indicator.params.step = params.step != null ? params.step : 0.02;
                indicator.params.maxStep = params.maxStep != null ? params.maxStep : 0.2;
                indicator.style.color = params.color || '#ffeb3b';
                indicator.style.bullColor = params.bullColor || params.color || '#26a69a';
                indicator.style.bearColor = params.bearColor || '#ef5350';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.name = 'PSAR';
                this.indicators.data[indicator.id] = calculatePSAR(this.data, indicator.params.step, indicator.params.maxStep);
                break;
                
            default:
                return;
        }
        
        this.indicators.active.push(indicator);
        this._updateIndicatorPanelHeight();
        
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        this.persistIndicators();
        
        return indicator;
    };

    Chart.prototype.persistIndicators = function() {
        if (!this.indicators || !Array.isArray(this.indicators.active)) return;
        const snapshot = this.indicators.active.map(function(ind) {
            return {
                type: ind.type,
                name: ind.name,
                params: Object.assign({}, ind.params || {}),
                style: Object.assign({}, ind.style || {}),
                visible: ind.visible !== false,
                overlay: ind.overlay,
                separatePanel: ind.separatePanel,
                isVolume: ind.isVolume || false,
            };
        });
        if (typeof this.scheduleSessionStateSave === 'function') {
            this.scheduleSessionStateSave({ indicators: snapshot });
        }
    };
    
    Chart.prototype.updateIndicator = function(id, newParams) {
        const indicator = this.indicators.active.find(function(ind) {
            return ind.id === id;
        });
        
        if (!indicator) {
            return;
        }
        
        // Update parameters
        if (newParams.period !== undefined) indicator.params.period = newParams.period;
        if (newParams.stdDev !== undefined) indicator.params.stdDev = newParams.stdDev;
        if (newParams.fast !== undefined) indicator.params.fast = newParams.fast;
        if (newParams.slow !== undefined) indicator.params.slow = newParams.slow;
        if (newParams.signal !== undefined) indicator.params.signal = newParams.signal;
        if (newParams.smoothK !== undefined) indicator.params.smoothK = newParams.smoothK;
        if (newParams.smoothD !== undefined) indicator.params.smoothD = newParams.smoothD;
        
        // Update colors
        if (newParams.color !== undefined) indicator.style.color = newParams.color;
        if (newParams.upperColor !== undefined) indicator.style.upperColor = newParams.upperColor;
        if (newParams.middleColor !== undefined) indicator.style.middleColor = newParams.middleColor;
        if (newParams.lowerColor !== undefined) indicator.style.lowerColor = newParams.lowerColor;
        if (newParams.fillColor !== undefined) indicator.style.fillColor = newParams.fillColor;
        if (newParams.macdColor !== undefined) indicator.style.macdColor = newParams.macdColor;
        if (newParams.signalColor !== undefined) indicator.style.signalColor = newParams.signalColor;
        if (newParams.histogramColor !== undefined) indicator.style.histogramColor = newParams.histogramColor;
        if (newParams.kColor !== undefined) indicator.style.kColor = newParams.kColor;
        if (newParams.dColor !== undefined) indicator.style.dColor = newParams.dColor;
        if (newParams.upColor !== undefined) indicator.style.upColor = newParams.upColor;
        if (newParams.downColor !== undefined) indicator.style.downColor = newParams.downColor;
        if (newParams.lineWidth !== undefined) indicator.style.lineWidth = newParams.lineWidth;
        if (newParams.emaPeriod !== undefined) indicator.params.emaPeriod = newParams.emaPeriod;
        if (newParams.atrPeriod !== undefined) indicator.params.atrPeriod = newParams.atrPeriod;
        if (newParams.multiplier !== undefined) indicator.params.multiplier = newParams.multiplier;
        if (newParams.step !== undefined) indicator.params.step = newParams.step;
        if (newParams.maxStep !== undefined) indicator.params.maxStep = newParams.maxStep;
        if (newParams.bullColor !== undefined) indicator.style.bullColor = newParams.bullColor;
        if (newParams.bearColor !== undefined) indicator.style.bearColor = newParams.bearColor;
        
        // Recalculate data
        switch (indicator.type) {
            case 'sma':
                indicator.name = 'SMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period);
                break;
            case 'ema':
                indicator.name = 'EMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateEMA(this.data, indicator.params.period);
                break;
            case 'wma':
                indicator.name = 'WMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateWMA(this.data, indicator.params.period);
                break;
            case 'bb':
            case 'bollinger':
                indicator.name = 'BB(' + indicator.params.period + ',' + indicator.params.stdDev + ')';
                this.indicators.data[indicator.id] = calculateBollingerBands(this.data, indicator.params.period, indicator.params.stdDev);
                break;
            case 'vwap':
                this.indicators.data[indicator.id] = calculateVWAP(this.data);
                break;
            case 'atr':
                indicator.name = 'ATR(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateATR(this.data, indicator.params.period);
                break;

            case 'cci':
                indicator.name = 'CCI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateCCI(this.data, indicator.params.period);
                break;

            case 'adx':
                indicator.name = 'ADX(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateADX(this.data, indicator.params.period);
                break;

            case 'rsi':
                indicator.name = 'RSI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateRSI(this.data, indicator.params.period);
                break;
            case 'macd':
                indicator.name = 'MACD(' + indicator.params.fast + ',' + indicator.params.slow + ',' + indicator.params.signal + ')';
                this.indicators.data[indicator.id] = calculateMACD(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                break;
            case 'stoch':
            case 'stochastic':
                indicator.name = 'Stoch(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateStochastic(this.data, indicator.params.period, indicator.params.smoothK, indicator.params.smoothD);
                break;
            case 'adr':
                indicator.name = 'ADR(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateADR(this.data, indicator.params.period);
                break;
            case 'volume': {
                // Update colors
                if (newParams.upColor !== undefined) indicator.style.upColor = newParams.upColor;
                if (newParams.downColor !== undefined) indicator.style.downColor = newParams.downColor;
                if (newParams.showMA !== undefined) indicator.params.showMA = newParams.showMA;
                if (newParams.maPeriod !== undefined) indicator.params.maPeriod = newParams.maPeriod;
                if (newParams.maColor !== undefined) indicator.style.maColor = newParams.maColor;
                // Update chart settings colors
                this.chartSettings.volumeUpColor = indicator.style.upColor;
                this.chartSettings.volumeDownColor = indicator.style.downColor;
                // Update volume line display
                const volumeLine = document.getElementById('volumeIndicatorLine');
                if (volumeLine) {
                    const colorBox = volumeLine.querySelector('.volume-color-box');
                    if (colorBox) {
                        colorBox.style.background = indicator.style.upColor || 'rgba(8, 153, 129, 0.5)';
                    }
                    // Update label to show MA period if enabled
                    const label = volumeLine.querySelector('.volume-label');
                    if (label) {
                        if (indicator.params.showMA) {
                            label.textContent = 'Volume MA(' + (indicator.params.maPeriod || 20) + ')';
                        } else {
                            label.textContent = 'Volume';
                        }
                    }
                }
                break;
            }
            case 'sessions':
                // Update visibility
                if (newParams.showAsian !== undefined) indicator.params.showAsian = newParams.showAsian;
                if (newParams.showLondon !== undefined) indicator.params.showLondon = newParams.showLondon;
                if (newParams.showNewYork !== undefined) indicator.params.showNewYork = newParams.showNewYork;
                // Update times
                if (newParams.asianStart !== undefined) indicator.params.asianStart = newParams.asianStart;
                if (newParams.asianEnd !== undefined) indicator.params.asianEnd = newParams.asianEnd;
                if (newParams.londonStart !== undefined) indicator.params.londonStart = newParams.londonStart;
                if (newParams.londonEnd !== undefined) indicator.params.londonEnd = newParams.londonEnd;
                if (newParams.newYorkStart !== undefined) indicator.params.newYorkStart = newParams.newYorkStart;
                if (newParams.newYorkEnd !== undefined) indicator.params.newYorkEnd = newParams.newYorkEnd;
                // Update colors
                if (newParams.asianColor !== undefined) indicator.style.asianColor = newParams.asianColor;
                if (newParams.londonColor !== undefined) indicator.style.londonColor = newParams.londonColor;
                if (newParams.newYorkColor !== undefined) indicator.style.newYorkColor = newParams.newYorkColor;
                this.indicators.data[indicator.id] = calculateSessions(this.data, {
                    showAsian: indicator.params.showAsian,
                    showLondon: indicator.params.showLondon,
                    showNewYork: indicator.params.showNewYork,
                    asianStart: indicator.params.asianStart,
                    asianEnd: indicator.params.asianEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    newYorkStart: indicator.params.newYorkStart,
                    newYorkEnd: indicator.params.newYorkEnd,
                    asianColor: indicator.style.asianColor,
                    londonColor: indicator.style.londonColor,
                    newYorkColor: indicator.style.newYorkColor
                });
                break;
            case 'killzones':
            case 'ictkz':
                // Update visibility
                if (newParams.showCBDR !== undefined) indicator.params.showCBDR = newParams.showCBDR;
                if (newParams.showAsia !== undefined) indicator.params.showAsia = newParams.showAsia;
                if (newParams.showLondon !== undefined) indicator.params.showLondon = newParams.showLondon;
                if (newParams.showNYAM !== undefined) indicator.params.showNYAM = newParams.showNYAM;
                if (newParams.showLC !== undefined) indicator.params.showLC = newParams.showLC;
                if (newParams.showNYMidnight !== undefined) indicator.params.showNYMidnight = newParams.showNYMidnight;
                if (newParams.showMidline !== undefined) indicator.params.showMidline = newParams.showMidline;
                if (newParams.showBoxInfo !== undefined) indicator.params.showBoxInfo = newParams.showBoxInfo;
                if (newParams.showDeviations !== undefined) indicator.params.showDeviations = newParams.showDeviations;
                if (newParams.deviationCount !== undefined) indicator.params.deviationCount = newParams.deviationCount;
                if (newParams.boxTransparency !== undefined) indicator.params.boxTransparency = newParams.boxTransparency;
                // Update times
                if (newParams.cbdrStart !== undefined) indicator.params.cbdrStart = newParams.cbdrStart;
                if (newParams.cbdrEnd !== undefined) indicator.params.cbdrEnd = newParams.cbdrEnd;
                if (newParams.asiaStart !== undefined) indicator.params.asiaStart = newParams.asiaStart;
                if (newParams.asiaEnd !== undefined) indicator.params.asiaEnd = newParams.asiaEnd;
                if (newParams.londonStart !== undefined) indicator.params.londonStart = newParams.londonStart;
                if (newParams.londonEnd !== undefined) indicator.params.londonEnd = newParams.londonEnd;
                if (newParams.nyamStart !== undefined) indicator.params.nyamStart = newParams.nyamStart;
                if (newParams.nyamEnd !== undefined) indicator.params.nyamEnd = newParams.nyamEnd;
                if (newParams.lcStart !== undefined) indicator.params.lcStart = newParams.lcStart;
                if (newParams.lcEnd !== undefined) indicator.params.lcEnd = newParams.lcEnd;
                // Update colors
                if (newParams.cbdrColor !== undefined) indicator.style.cbdrColor = newParams.cbdrColor;
                if (newParams.asiaColor !== undefined) indicator.style.asiaColor = newParams.asiaColor;
                if (newParams.londonColor !== undefined) indicator.style.londonColor = newParams.londonColor;
                if (newParams.nyamColor !== undefined) indicator.style.nyamColor = newParams.nyamColor;
                if (newParams.lcColor !== undefined) indicator.style.lcColor = newParams.lcColor;
                if (newParams.nyMidnightColor !== undefined) indicator.style.nyMidnightColor = newParams.nyMidnightColor;
                if (newParams.textColor !== undefined) indicator.style.textColor = newParams.textColor;
                this.indicators.data[indicator.id] = calculateKillzones(this.data, {
                    showCBDR: indicator.params.showCBDR,
                    showAsia: indicator.params.showAsia,
                    showLondon: indicator.params.showLondon,
                    showNYAM: indicator.params.showNYAM,
                    showLC: indicator.params.showLC,
                    showNYMidnight: indicator.params.showNYMidnight,
                    showMidline: indicator.params.showMidline,
                    showBoxInfo: indicator.params.showBoxInfo,
                    showDeviations: indicator.params.showDeviations,
                    deviationCount: indicator.params.deviationCount,
                    boxTransparency: indicator.params.boxTransparency,
                    cbdrStart: indicator.params.cbdrStart,
                    cbdrEnd: indicator.params.cbdrEnd,
                    asiaStart: indicator.params.asiaStart,
                    asiaEnd: indicator.params.asiaEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    nyamStart: indicator.params.nyamStart,
                    nyamEnd: indicator.params.nyamEnd,
                    lcStart: indicator.params.lcStart,
                    lcEnd: indicator.params.lcEnd,
                    cbdrColor: indicator.style.cbdrColor,
                    asiaColor: indicator.style.asiaColor,
                    londonColor: indicator.style.londonColor,
                    nyamColor: indicator.style.nyamColor,
                    lcColor: indicator.style.lcColor,
                    nyMidnightColor: indicator.style.nyMidnightColor
                });
                break;
            case 'dema':
                indicator.name = 'DEMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDEMA(this.data, indicator.params.period);
                break;
            case 'tema':
                indicator.name = 'TEMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateTEMA(this.data, indicator.params.period);
                break;
            case 'hma':
                indicator.name = 'HMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateHMA(this.data, indicator.params.period);
                break;
            case 'roc':
                indicator.name = 'ROC(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateROC(this.data, indicator.params.period);
                break;
            case 'mom':
            case 'momentum':
                indicator.name = 'Mom(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateMomentum(this.data, indicator.params.period);
                break;
            case 'obv':
                this.indicators.data[indicator.id] = calculateOBV(this.data);
                break;
            case 'willr':
                indicator.name = 'Williams %R(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateWilliamsR(this.data, indicator.params.period);
                break;
            case 'mfi':
                indicator.name = 'MFI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateMFI(this.data, indicator.params.period);
                break;
            case 'donchian':
                indicator.name = 'Donchian(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDonchian(this.data, indicator.params.period);
                break;
            case 'keltner':
                indicator.name = 'Keltner(' + indicator.params.emaPeriod + ',' + indicator.params.atrPeriod + ')';
                this.indicators.data[indicator.id] = calculateKeltner(this.data, indicator.params.emaPeriod, indicator.params.atrPeriod, indicator.params.multiplier);
                break;
            case 'aroon':
                indicator.name = 'Aroon(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateAroon(this.data, indicator.params.period);
                break;
            case 'cmf':
                indicator.name = 'CMF(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateCMF(this.data, indicator.params.period);
                break;
            case 'trix':
                indicator.name = 'TRIX(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateTRIX(this.data, indicator.params.period);
                break;
            case 'psar':
                this.indicators.data[indicator.id] = calculatePSAR(this.data, indicator.params.step, indicator.params.maxStep);
                break;
        }
        
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        this.persistIndicators();
        
        return indicator;
    };
    
    Chart.prototype.recalculateIndicators = function() {
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }
        
        this.indicators.active.forEach(function(indicator) {
            switch (indicator.type) {
                case 'sma':
                    this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period);
                    break;
                case 'ema':
                    this.indicators.data[indicator.id] = calculateEMA(this.data, indicator.params.period);
                    break;
                case 'wma':
                    this.indicators.data[indicator.id] = calculateWMA(this.data, indicator.params.period);
                    break;
                case 'bb':
                case 'bollinger':
                    this.indicators.data[indicator.id] = calculateBollingerBands(this.data, indicator.params.period, indicator.params.stdDev);
                    break;
                case 'vwap':
                    this.indicators.data[indicator.id] = calculateVWAP(this.data);
                    break;
                case 'atr':
                    this.indicators.data[indicator.id] = calculateATR(this.data, indicator.params.period);
                    break;
                case 'cci':
                    this.indicators.data[indicator.id] = calculateCCI(this.data, indicator.params.period);
                    break;
                case 'adx':
                    this.indicators.data[indicator.id] = calculateADX(this.data, indicator.params.period);
                    break;
                case 'rsi':
                    this.indicators.data[indicator.id] = calculateRSI(this.data, indicator.params.period);
                    break;
                case 'macd':
                    this.indicators.data[indicator.id] = calculateMACD(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                    break;
                case 'stoch':
                case 'stochastic':
                    this.indicators.data[indicator.id] = calculateStochastic(this.data, indicator.params.period, indicator.params.smoothK, indicator.params.smoothD);
                    break;
                case 'adr':
                    this.indicators.data[indicator.id] = calculateADR(this.data, indicator.params.period);
                    break;
                case 'volume':
                    // Volume data comes from candle data, no recalculation needed
                    this.indicators.data[indicator.id] = { active: true };
                    break;
                case 'sessions':
                    this.indicators.data[indicator.id] = calculateSessions(this.data, {
                        showAsian: indicator.params.showAsian,
                        showLondon: indicator.params.showLondon,
                        showNewYork: indicator.params.showNewYork,
                        asianColor: indicator.style.asianColor,
                        londonColor: indicator.style.londonColor,
                        newYorkColor: indicator.style.newYorkColor
                    });
                    break;
                case 'killzones':
                case 'ictkz':
                    this.indicators.data[indicator.id] = calculateKillzones(this.data, {
                        showCBDR: indicator.params.showCBDR,
                        showAsia: indicator.params.showAsia,
                        showLondon: indicator.params.showLondon,
                        showNYAM: indicator.params.showNYAM,
                        showLC: indicator.params.showLC,
                        showNYMidnight: indicator.params.showNYMidnight,
                        showMidline: indicator.params.showMidline,
                        showBoxInfo: indicator.params.showBoxInfo,
                        showDeviations: indicator.params.showDeviations,
                        deviationCount: indicator.params.deviationCount,
                        boxTransparency: indicator.params.boxTransparency,
                        cbdrStart: indicator.params.cbdrStart,
                        cbdrEnd: indicator.params.cbdrEnd,
                        asiaStart: indicator.params.asiaStart,
                        asiaEnd: indicator.params.asiaEnd,
                        londonStart: indicator.params.londonStart,
                        londonEnd: indicator.params.londonEnd,
                        nyamStart: indicator.params.nyamStart,
                        nyamEnd: indicator.params.nyamEnd,
                        lcStart: indicator.params.lcStart,
                        lcEnd: indicator.params.lcEnd,
                        cbdrColor: indicator.style.cbdrColor,
                        asiaColor: indicator.style.asiaColor,
                        londonColor: indicator.style.londonColor,
                        nyamColor: indicator.style.nyamColor,
                        lcColor: indicator.style.lcColor,
                        nyMidnightColor: indicator.style.nyMidnightColor
                    });
                    break;
                case 'dema':
                    this.indicators.data[indicator.id] = calculateDEMA(this.data, indicator.params.period);
                    break;
                case 'tema':
                    this.indicators.data[indicator.id] = calculateTEMA(this.data, indicator.params.period);
                    break;
                case 'hma':
                    this.indicators.data[indicator.id] = calculateHMA(this.data, indicator.params.period);
                    break;
                case 'roc':
                    this.indicators.data[indicator.id] = calculateROC(this.data, indicator.params.period);
                    break;
                case 'mom':
                case 'momentum':
                    this.indicators.data[indicator.id] = calculateMomentum(this.data, indicator.params.period);
                    break;
                case 'obv':
                    this.indicators.data[indicator.id] = calculateOBV(this.data);
                    break;
                case 'willr':
                    this.indicators.data[indicator.id] = calculateWilliamsR(this.data, indicator.params.period);
                    break;
                case 'mfi':
                    this.indicators.data[indicator.id] = calculateMFI(this.data, indicator.params.period);
                    break;
                case 'donchian':
                    this.indicators.data[indicator.id] = calculateDonchian(this.data, indicator.params.period);
                    break;
                case 'keltner':
                    this.indicators.data[indicator.id] = calculateKeltner(this.data, indicator.params.emaPeriod, indicator.params.atrPeriod, indicator.params.multiplier);
                    break;
                case 'aroon':
                    this.indicators.data[indicator.id] = calculateAroon(this.data, indicator.params.period);
                    break;
                case 'cmf':
                    this.indicators.data[indicator.id] = calculateCMF(this.data, indicator.params.period);
                    break;
                case 'trix':
                    this.indicators.data[indicator.id] = calculateTRIX(this.data, indicator.params.period);
                    break;
                case 'psar':
                    this.indicators.data[indicator.id] = calculatePSAR(this.data, indicator.params.step, indicator.params.maxStep);
                    break;
            }
        }, this);
    };
    
    Chart.prototype.setupVolumeIndicatorLine = function(indicator) {
        const volumeLine = document.getElementById('volumeIndicatorLine');
        if (!volumeLine) {
            return;
        }
        
        const self = this;
        
        // Match exact styling of other indicators
        volumeLine.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 6px; margin-right: 8px; border-radius: 3px; transition: background 0.2s;';
        
        // Update color box
        const colorBox = volumeLine.querySelector('.volume-color-box');
        if (colorBox) {
            colorBox.style.background = indicator.style.upColor || 'rgba(8, 153, 129, 0.5)';
        }
        
        // Update label text and opacity based on visibility and MA settings
        const label = volumeLine.querySelector('.volume-label');
        if (label) {
            label.style.opacity = indicator.visible !== false ? '1' : '0.5';
            // Show MA period in label if MA is enabled
            if (indicator.params && indicator.params.showMA) {
                label.textContent = 'Volume MA(' + (indicator.params.maPeriod || 20) + ')';
            } else {
                label.textContent = 'Volume';
            }
        }
        
        // Hover effect - same as other indicators
        volumeLine.addEventListener('mouseenter', function() {
            volumeLine.style.background = 'rgba(120, 123, 134, 0.1)';
        });
        volumeLine.addEventListener('mouseleave', function() {
            volumeLine.style.background = 'transparent';
        });
        
        // Visibility toggle button
        const visibilityBtn = volumeLine.querySelector('.volume-visibility-btn');
        if (visibilityBtn) {
            visibilityBtn.style.opacity = indicator.visible !== false ? '1' : '0.5';
            visibilityBtn.style.cursor = 'pointer';
            
            // Clone to remove old listeners
            const newVisBtn = visibilityBtn.cloneNode(true);
            visibilityBtn.parentNode.replaceChild(newVisBtn, visibilityBtn);
            
            newVisBtn.addEventListener('mouseenter', function() {
                newVisBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            });
            newVisBtn.addEventListener('mouseleave', function() {
                newVisBtn.style.background = 'transparent';
            });
            newVisBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                indicator.visible = indicator.visible === false ? true : false;
                self.chartSettings.showVolume = indicator.visible !== false;
                
                // Update icon
                const currentLabel = volumeLine.querySelector('.volume-label');
                if (indicator.visible === false) {
                    newVisBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                    newVisBtn.style.opacity = '0.5';
                    if (currentLabel) currentLabel.style.opacity = '0.5';
                } else {
                    newVisBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                    newVisBtn.style.opacity = '1';
                    if (currentLabel) currentLabel.style.opacity = '1';
                }
                self.render();
            });
        }
        
        // Settings button
        const settingsBtn = volumeLine.querySelector('.volume-settings-btn');
        if (settingsBtn) {
            settingsBtn.style.cursor = 'pointer';
            
            // Clone to remove old listeners
            const newSettingsBtn = settingsBtn.cloneNode(true);
            settingsBtn.parentNode.replaceChild(newSettingsBtn, settingsBtn);
            
            newSettingsBtn.addEventListener('mouseenter', function() {
                newSettingsBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            });
            newSettingsBtn.addEventListener('mouseleave', function() {
                newSettingsBtn.style.background = 'transparent';
            });
            newSettingsBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                self.showVolumeSettings();
            });
        }
        
        // Remove button
        const removeBtn = volumeLine.querySelector('.volume-remove-btn');
        if (removeBtn) {
            removeBtn.style.cursor = 'pointer';
            
            // Clone to remove old listeners
            const newRemoveBtn = removeBtn.cloneNode(true);
            removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);
            
            newRemoveBtn.addEventListener('mouseenter', function() {
                newRemoveBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            });
            newRemoveBtn.addEventListener('mouseleave', function() {
                newRemoveBtn.style.background = 'transparent';
            });
            newRemoveBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                // Find and remove volume indicator
                const volumeInd = self.indicators.active.find(function(ind) {
                    return ind.type === 'volume' || ind.isVolume;
                });
                if (volumeInd) {
                    self.removeIndicator(volumeInd.id);
                }
            });
        }
        
    };
    
    Chart.prototype.hideVolumeIndicatorLine = function() {
        const volumeLine = document.getElementById('volumeIndicatorLine');
        if (volumeLine) {
            volumeLine.style.display = 'none';
            // Reset volume value to dash
            const volumeValue = volumeLine.querySelector('.volume-value');
            if (volumeValue) {
                volumeValue.textContent = '—';
            }
        }
    };
    
    Chart.prototype.showVolumeSettings = function() {
        // Find volume indicator
        const volumeInd = this.indicators.active.find(function(ind) {
            return ind.type === 'volume' || ind.isVolume;
        });
        
        if (!volumeInd) {
            return;
        }
        
        // Use the indicator-ui.js createIndicatorSettingsPanel if available
        if (typeof window.createIndicatorSettingsPanel === 'function') {
            window.createIndicatorSettingsPanel(this, 'volume', volumeInd);
            return;
        }
        
        // Fallback: use the built-in settings dialog
        this.showIndicatorSettings(volumeInd.id);
    };
    
    Chart.prototype.removeIndicator = function(id) {
        const index = this.indicators.active.findIndex(function(ind) {
            return ind.id === id;
        });
        
        if (index >= 0) {
            const indicator = this.indicators.active[index];
            
            // If removing volume indicator, disable volume display and hide the line
            if (indicator.type === 'volume' || indicator.isVolume) {
                this.chartSettings.showVolume = false;
                this.hideVolumeIndicatorLine();
            }
            
            this.indicators.active.splice(index, 1);
            delete this.indicators.data[id];
            this._updateIndicatorPanelHeight();
            
            if (typeof this.render === 'function') {
                this.render();
            }
            
            this.updateOHLCIndicators();
            this.persistIndicators();
        }
    };
    
    Chart.prototype.clearIndicators = function({ confirmPrompt = true } = {}) {
        if (!this.indicators || !Array.isArray(this.indicators.active) || this.indicators.active.length === 0) {
            return false;
        }

        const count = this.indicators.active.length;

        if (confirmPrompt) {
            const confirmed = window.confirm(`Remove ${count} indicator${count === 1 ? '' : 's'}?`);
            if (!confirmed) {
                return false;
            }
        }

        // Check if any volume indicator exists and disable volume display
        const hasVolume = this.indicators.active.some(function(ind) {
            return ind.type === 'volume' || ind.isVolume;
        });
        if (hasVolume) {
            this.chartSettings.showVolume = false;
            this.hideVolumeIndicatorLine();
        }

        this.indicators.active = [];
        this.indicators.data = {};
        this.separateIndicatorPanelHeight = 0;

        if (typeof this.render === 'function') {
            this.render();
        }

        if (typeof this.updateOHLCIndicators === 'function') {
            this.updateOHLCIndicators();
        }

        this.persistIndicators();
        return true;
    };
    
    Chart.prototype.drawIndicators = function() {
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }

        const ctx = this.ctx;
        const m = this.margin;

        ctx.save();

        // Clip to chart area
        ctx.beginPath();
        ctx.rect(m.l, m.t, this.w - m.l - m.r, this.h - m.t - m.b);
        ctx.clip();

        const visibleStart = Number.isFinite(this.visibleStartIndex) ? this.visibleStartIndex : 0;
        const visibleEnd = Number.isFinite(this.visibleEndIndex) ? this.visibleEndIndex : (this.data ? this.data.length : 0);
        const buffer = 20; // small buffer so lines extend smoothly past viewport edges
        const startIndex = Math.max(0, visibleStart - buffer);
        const endIndex = Math.min(this.data ? this.data.length : 0, visibleEnd + buffer);

        // Draw each indicator
        for (let i = 0; i < this.indicators.active.length; i++) {
            const indicator = this.indicators.active[i];

            // Skip non-overlay indicators
            if (indicator.overlay === false) continue;

            if (!indicator.visible) continue;

            const data = this.indicators.data[indicator.id];
            if (!data) continue;

            // Draw based on type
            if (indicator.type === 'bb' || indicator.type === 'bollinger') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'donchian' || indicator.type === 'keltner') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'psar') {
                this.drawParabolicSAR(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'sessions') {
                this.drawSessions(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'killzones' || indicator.type === 'ictkz' || indicator.isKillzones) {
                this.drawKillzones(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'adr' || indicator.isADR) {
                this.drawADRBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.isATR) {
                this.drawATRBands(data, indicator.style, startIndex, endIndex);
            } else {
                this.drawLineIndicator(data, indicator.style.color, indicator.style.lineWidth, startIndex, endIndex);
            }
        }

        ctx.restore();
    };

const DEFAULT_SEPARATE_PANEL_HEIGHT = 100;
const MIN_SEPARATE_PANEL_HEIGHT = 60;

Chart.prototype._getVisibleSeparateIndicators = function() {
    if (!this.indicators || !this.indicators.active) return [];
    return this.indicators.active.filter(ind => {
        if (ind.type === 'volume' || ind.isVolume) return false;
        const isSeparate = ind.overlay === false || ind.separatePanel === true;
        const isVisible = ind.visible !== false;
        return isSeparate && isVisible;
    });
};

Chart.prototype._getSeparatePanelHeights = function(indicators) {
    if (!this.chartSettings) this.chartSettings = {};
    if (!this.chartSettings.separatePanelHeights || typeof this.chartSettings.separatePanelHeights !== 'object') {
        this.chartSettings.separatePanelHeights = {};
    }
    const store = this.chartSettings.separatePanelHeights;
    return indicators.map(indicator => {
        const saved = Number(store[indicator.id]);
        if (Number.isFinite(saved) && saved >= MIN_SEPARATE_PANEL_HEIGHT) {
            return saved;
        }
        store[indicator.id] = DEFAULT_SEPARATE_PANEL_HEIGHT;
        return DEFAULT_SEPARATE_PANEL_HEIGHT;
    });
};

Chart.prototype._persistSeparatePanelHeights = function(indicators, heights, saveSettings = false) {
    if (!this.chartSettings) this.chartSettings = {};
    if (!this.chartSettings.separatePanelHeights || typeof this.chartSettings.separatePanelHeights !== 'object') {
        this.chartSettings.separatePanelHeights = {};
    }
    indicators.forEach((indicator, idx) => {
        const h = Number(heights[idx]);
        if (Number.isFinite(h)) {
            this.chartSettings.separatePanelHeights[indicator.id] = Math.max(MIN_SEPARATE_PANEL_HEIGHT, h);
        }
    });
    if (saveSettings && typeof this.saveSettings === 'function') {
        this.saveSettings();
    }
};

Chart.prototype.getSeparatePanelResizeHandleAt = function(x, y, tolerance = 6) {
    if (!this.separatePanelInfo || !this.separatePanelInfo.resizeHandles) return null;
    const m = this.margin || { l: 0, r: 0 };
    if (x < m.l || x > this.w - m.r) return null;
    for (let i = 0; i < this.separatePanelInfo.resizeHandles.length; i++) {
        const handle = this.separatePanelInfo.resizeHandles[i];
        if (Math.abs(y - handle.y) <= tolerance) return handle;
    }
    return null;
};

Chart.prototype.startSeparatePanelResize = function(handle, startY) {
    if (!handle || !this.separatePanelInfo || !Array.isArray(this.separatePanelInfo.panelHeights)) return false;
    this._separatePanelResize = {
        handleType: handle.type || 'pair',
        handleIndex: handle.index,
        startY: startY,
        baseHeights: this.separatePanelInfo.panelHeights.slice(),
        activeHeights: this.separatePanelInfo.panelHeights.slice()
    };
    return true;
};

Chart.prototype.updateSeparatePanelResize = function(currentY) {
    if (!this._separatePanelResize || !this.separatePanelInfo || !Array.isArray(this.separatePanelInfo.indicators)) {
        return false;
    }
    const state = this._separatePanelResize;
    const heights = state.baseHeights.slice();
    const dy = currentY - state.startY;
    if (state.handleType === 'top') {
        const topIdx = state.handleIndex;
        if (topIdx < 0 || topIdx >= heights.length) return false;
        let nextTopHeight = heights[topIdx] - dy;
        nextTopHeight = Math.max(MIN_SEPARATE_PANEL_HEIGHT, nextTopHeight);
        heights[topIdx] = nextTopHeight;
    } else {
        const bottomIdx = state.handleIndex;
        const topIdx = state.handleIndex + 1;
        if (bottomIdx < 0 || topIdx >= heights.length) return false;

        const pairTotal = heights[bottomIdx] + heights[topIdx];
        let nextBottom = heights[bottomIdx] - dy;
        nextBottom = Math.max(MIN_SEPARATE_PANEL_HEIGHT, Math.min(pairTotal - MIN_SEPARATE_PANEL_HEIGHT, nextBottom));
        const nextTop = pairTotal - nextBottom;

        heights[bottomIdx] = nextBottom;
        heights[topIdx] = nextTop;
    }
    state.activeHeights = heights;
    this._persistSeparatePanelHeights(this.separatePanelInfo.indicators, heights, false);
    this.separateIndicatorPanelHeight = heights.reduce((sum, h) => sum + h, 0);
    return true;
};

Chart.prototype.finishSeparatePanelResize = function() {
    if (!this._separatePanelResize || !this.separatePanelInfo || !Array.isArray(this.separatePanelInfo.indicators)) return;
    const finalHeights = this._separatePanelResize.activeHeights || this._separatePanelResize.baseHeights;
    this._persistSeparatePanelHeights(this.separatePanelInfo.indicators, finalHeights, true);
    this._separatePanelResize = null;
};

// Render separate panel indicators (like ATR, ADR) in a sub-panel below price chart
Chart.prototype.renderSeparatePanelIndicators = function() {
    if (!this.indicators || !this.indicators.active) {
        return;
    }
    if (!this.data || this.data.length === 0) {
        return;
    }
    
    const separateIndicators = this._getVisibleSeparateIndicators();
    
    if (separateIndicators.length === 0) {
        const _cv = this.ctx && this.ctx.canvas;
        const _wp = _cv ? _cv.parentElement : null;
        if (_wp) { const _ol = _wp.querySelector('#separatePanelsOverlay'); if (_ol) _ol.innerHTML = ''; }
        this.separatePanelInfo = null;
        this._separatePanelResize = null;
        this.separateIndicatorPanelHeight = 0;
        return;
    }
    
    const ctx = this.ctx;
    const m = this.margin;
    const totalHeight = this.h;
    const chartWidth = this.w - m.l - m.r;
    
    let panelHeights = this._getSeparatePanelHeights(separateIndicators);
    if (this._separatePanelResize && Array.isArray(this._separatePanelResize.activeHeights) &&
        this._separatePanelResize.activeHeights.length === panelHeights.length) {
        panelHeights = this._separatePanelResize.activeHeights.slice();
    }
    const totalPanelHeight = panelHeights.reduce((sum, h) => sum + h, 0);

    // Track total height so calculateScales can reserve the right amount of space
    this.separateIndicatorPanelHeight = totalPanelHeight;

    // Bottom of the indicator stack is always the inner chart bottom (y = h - m.b), i.e. just above
    // the time-axis margin — same as yScale/volumeScale layout in calculateScales().
    // (Volume sits above this band; do NOT subtract volume height here — that misaligned slots.)
    const panelBottom = totalHeight - m.b;
    const panelTop = panelBottom - totalPanelHeight;
    
    // Draw full panel background using the same chart background color
    // so separate indicator panes stay visually synced with the main chart.
    const panelBackgroundColor =
        (this.chartSettings && this.chartSettings.backgroundColor) ||
        (typeof getComputedStyle === 'function'
            ? (getComputedStyle(document.documentElement).getPropertyValue('--sp-bg') || '').trim()
            : '') ||
        '#131722';
    ctx.fillStyle = panelBackgroundColor;
    ctx.fillRect(m.l, panelTop, chartWidth, totalPanelHeight);

    // Clip all indicator geometry to this stack so lines/labels never bleed into the time axis.
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, panelTop, this.w - m.l, totalPanelHeight);
    ctx.clip();
    
    // Outer top separator — solid divider line matching panel borders
    const _isLightBg = document.body.classList.contains('light-mode');
    const _sepColor = _isLightBg ? '#d6dce6' : '#2a2e39';
    const _gripColor = _isLightBg ? 'rgba(0, 0, 0, 0.22)' : 'rgba(120, 123, 134, 0.45)';
    ctx.strokeStyle = _sepColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(m.l, panelTop);
    ctx.lineTo(this.w - m.r, panelTop);
    ctx.stroke();
    const topHandleMidX = this.w - m.r - 18;
    ctx.strokeStyle = _gripColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(topHandleMidX - 8, panelTop);
    ctx.lineTo(topHandleMidX + 8, panelTop);
    ctx.stroke();
    ctx.lineCap = 'butt';
    
    // Get visible range
    const visibleStart = Math.max(0, Math.floor(this.visibleStartIndex || 0));
    const visibleEnd = Math.min(this.data.length, Math.ceil(this.visibleEndIndex || this.data.length));
    
    const panelSlots = [];
    let slotBottomCursor = panelBottom;
    separateIndicators.forEach((indicator, idx) => {
        const slotHeight = panelHeights[idx];
        const slotTop = slotBottomCursor - slotHeight;
        panelSlots.push({
            index: idx,
            indicator: indicator,
            top: slotTop,
            bottom: slotBottomCursor,
            height: slotHeight
        });
        slotBottomCursor = slotTop;
    });

    // Draw each indicator in its own slot (idx 0 = bottommost slot)
    panelSlots.forEach((slot) => {
        const indicator = slot.indicator;
        const idx = slot.index;
        // Skip volume indicator - it has its own dedicated rendering
        if (indicator.type === 'volume' || indicator.isVolume) return;

        // Per-indicator slot boundaries
        const indBottom = slot.bottom;
        const indTop = slot.top;
        const panelHeight = slot.height;

        // Separator between slots — soft divider
        if (idx > 0) {
            ctx.strokeStyle = _sepColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(m.l, indBottom);
            ctx.lineTo(this.w - m.r, indBottom);
            ctx.stroke();
            const handleMidX = this.w - m.r - 18;
            ctx.strokeStyle = _gripColor;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(handleMidX - 8, indBottom);
            ctx.lineTo(handleMidX + 8, indBottom);
            ctx.stroke();
            ctx.lineCap = 'butt';
        }
        
        const indicatorData = this.indicators.data[indicator.id];
        if (!indicatorData) return;
        
        // Type-specific rendering for multi-series indicators
        if (indicator.type === 'macd') {
            this._renderMACDPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'stoch' || indicator.type === 'stochastic') {
            this._renderStochPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'adx') {
            this._renderADXPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'aroon') {
            this._renderAroonPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'willr') {
            this._renderWilliamsRPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'mfi') {
            this._renderMFIPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        }

        // Get values array - skip non-array data
        if (!Array.isArray(indicatorData)) return;
        let values = indicatorData;
        if (!values || values.length === 0) return;
        
        // Find min/max in visible range for proper scaling
        let min = Infinity, max = -Infinity;
        for (let i = visibleStart; i < visibleEnd && i < values.length; i++) {
            const val = values[i];
            if (val !== null && val !== undefined && !isNaN(val)) {
                min = Math.min(min, val);
                max = Math.max(max, val);
            }
        }
        
        if (min === Infinity || max === -Infinity) return;
        
        // Add 10% padding to range
        const range = max - min || 1;
        min = min - range * 0.1;
        max = max + range * 0.1;

        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const dom = this._applyIndicatorPanelDomain(min, max, indicator);
        min = dom.min;
        max = dom.max;
        
        const vSpan = Math.max(1e-12, max - min);
        // Scale function for Y axis (clamp to slot so strokes never leak)
        const scaleY = (val) => {
            if (val === null || val === undefined) return null;
            let y = indBottom - 5 - ((val - min) / vSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(indTop + 2, Math.min(indBottom - 2, y));
        };
        
        const color = indicator.style.color || '#ff6d00';
        
        // Draw Y-axis grid lines and labels
        ctx.fillStyle = '#787b86';
        ctx.font = '10px Roboto';
        ctx.textAlign = 'right';
        const numGridLines = 4;
        for (let i = 0; i <= numGridLines; i++) {
            const val = min + (max - min) * (i / numGridLines);
            const y = scaleY(val);
            
            // Grid line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(m.l, y);
            ctx.lineTo(this.w - m.r, y);
            ctx.stroke();
            
            // Y-axis label
            ctx.fillStyle = '#787b86';
            ctx.fillText(val.toFixed(2), this.w - m.r + 45, y + 3);
        }
        
        // Draw the indicator line
        ctx.strokeStyle = color;
        ctx.lineWidth = indicator.style.lineWidth || 2;
        ctx.beginPath();
        
        let started = false;
        let lastValidIndex = visibleStart;
        
        for (let i = visibleStart; i < visibleEnd && i < values.length; i++) {
            const val = values[i];
            if (val === null || val === undefined || isNaN(val)) continue;
            
            const x = this.dataIndexToPixel(i);
            const y = scaleY(val);
            
            if (y === null) continue;
            if (x < m.l - 10 || x > this.w - m.r + 10) continue;
            
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
            lastValidIndex = i;
        }
        
        if (started) {
            ctx.stroke();
        }

        // Reference lines for oscillators
        if (indicator.type === 'rsi') {
            [[70, 'rgba(239,83,80,0.5)'], [50, 'rgba(120,123,134,0.35)'], [30, 'rgba(38,166,154,0.5)']].forEach(([lvl, col]) => {
                const ry = scaleY(lvl);
                if (ry > indTop && ry < indBottom) {
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(m.l, ry);
                    ctx.lineTo(this.w - m.r, ry);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = col;
                    ctx.font = '9px Roboto';
                    ctx.textAlign = 'right';
                    ctx.fillText(lvl, this.w - m.r - 2, ry - 2);
                }
            });
            ctx.textAlign = 'left';
        } else if (indicator.type === 'cci') {
            [[-100, 'rgba(38,166,154,0.5)'], [0, 'rgba(120,123,134,0.35)'], [100, 'rgba(239,83,80,0.5)']].forEach(([lvl, col]) => {
                const ry = scaleY(lvl);
                if (ry > indTop && ry < indBottom) {
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(m.l, ry);
                    ctx.lineTo(this.w - m.r, ry);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = col;
                    ctx.font = '9px Roboto';
                    ctx.textAlign = 'right';
                    ctx.fillText(lvl, this.w - m.r - 2, ry - 2);
                }
            });
            ctx.textAlign = 'left';
        } else if (indicator.type === 'cmf' || indicator.type === 'trix') {
            const zy = scaleY(0);
            if (zy !== null && zy > indTop && zy < indBottom) {
                ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, zy);
                ctx.lineTo(this.w - m.r, zy);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText('0', this.w - m.r - 2, zy - 2);
            }
            ctx.textAlign = 'left';
        }

        // Get current value (find the last non-null value in visible range)
        let currentValue = null;
        for (let i = Math.min(visibleEnd - 1, values.length - 1); i >= visibleStart; i--) {
            if (values[i] !== null && values[i] !== undefined && !isNaN(values[i])) {
                currentValue = values[i];
                break;
            }
        }
        // Fallback to last value in entire array if nothing in visible range
        if (currentValue === null) {
            for (let i = values.length - 1; i >= 0; i--) {
                if (values[i] !== null && values[i] !== undefined && !isNaN(values[i])) {
                    currentValue = values[i];
                    break;
                }
            }
        }
        
        // Get value at mouse position if hovering, otherwise use current value
        let displayValue = currentValue;
        if (this.mouseX && this.mouseX >= m.l && this.mouseX <= this.w - m.r) {
            const hoverIndex = Math.floor(this.pixelToDataIndex ? this.pixelToDataIndex(this.mouseX) : -1);
            if (hoverIndex >= 0 && hoverIndex < values.length && 
                values[hoverIndex] !== null && values[hoverIndex] !== undefined && !isNaN(values[hoverIndex])) {
                displayValue = values[hoverIndex];
            }
        }
        
        // Store for HTML overlay label
        indicator._displayColor = color;
        indicator._displayLabel = displayValue !== null && displayValue !== undefined ? displayValue.toFixed(4) : '—';
        
        // Draw current value label on right axis
        if (currentValue !== null && currentValue !== undefined && !isNaN(currentValue)) {
            const currentY = scaleY(currentValue);
            
            // Dashed line at current value
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, currentY);
            ctx.lineTo(this.w - m.r, currentY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Value label box on right
            const labelWidth = 50;
            const labelHeight = 16;
            ctx.fillStyle = color;
            ctx.fillRect(this.w - m.r + 2, currentY - labelHeight/2, labelWidth, labelHeight);
            
            // Value text
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px Roboto';
            ctx.textAlign = 'center';
            ctx.fillText(currentValue.toFixed(2), this.w - m.r + 2 + labelWidth/2, currentY + 4);
        }
    });
    
    // Store panel info for mouse interactions (full stacked area)
    this.separatePanelInfo = {
        top: panelTop,
        bottom: panelBottom,
        height: totalPanelHeight,
        indicators: separateIndicators,
        panelHeights: panelHeights,
        panelSlots: panelSlots,
        resizeHandles: [
            { type: 'top', index: panelSlots.length - 1, y: panelTop },
            ...panelSlots.slice(0, -1).map(slot => ({ type: 'pair', index: slot.index, y: slot.top }))
        ]
    };
    
    // Draw crosshair value if mouse is in the stacked panel area
    if (this.mouseY >= panelTop && this.mouseY <= panelBottom && this.mouseX >= m.l && this.mouseX <= this.w - m.r) {
        const activeSlot = panelSlots.find(slot => this.mouseY >= slot.top && this.mouseY <= slot.bottom);
        if (activeSlot) {
            this.drawSeparatePanelCrosshair(ctx, m, activeSlot.top, activeSlot.bottom, activeSlot.height, [activeSlot.indicator], 0, 100);
        }
    }
    
    ctx.textAlign = 'left'; // Reset

    ctx.restore(); // end indicator-stack clip

    // Build TradingView-style HTML label bars
    this._updateSeparatePanelLabels(panelSlots, separateIndicators, m);
};

// Draw crosshair and value for separate panel indicators
Chart.prototype.drawSeparatePanelCrosshair = function(ctx, m, panelTop, panelBottom, panelHeight, indicators, min, max) {
    if (!this.mouseX || !this.mouseY) return;
    
    const mouseX = this.mouseX;
    const mouseY = this.mouseY;
    
    // Draw vertical crosshair line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mouseX, panelTop);
    ctx.lineTo(mouseX, panelBottom);
    ctx.stroke();
    
    // Draw horizontal crosshair line
    ctx.beginPath();
    ctx.moveTo(m.l, mouseY);
    ctx.lineTo(this.w - m.r, mouseY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Calculate value at mouse Y position
    const valueAtMouse = min + ((panelBottom - 5 - mouseY) / (panelHeight - 10)) * (max - min);
    
    // Draw value label at mouse position
    ctx.fillStyle = '#363a45';
    ctx.fillRect(this.w - m.r + 2, mouseY - 8, 50, 16);
    ctx.fillStyle = '#d1d4dc';
    ctx.font = '10px Roboto';
    ctx.textAlign = 'center';
    ctx.fillText(valueAtMouse.toFixed(2), this.w - m.r + 27, mouseY + 4);
    
    // Find index at mouse X and show indicator value
    const dataIndex = this.pixelToDataIndex ? this.pixelToDataIndex(mouseX) : null;
    if (dataIndex !== null && dataIndex >= 0) {
        indicators.forEach(indicator => {
            const values = this.indicators.data[indicator.id];
            if (values && values[Math.floor(dataIndex)] !== null && values[Math.floor(dataIndex)] !== undefined) {
                const val = values[Math.floor(dataIndex)];
                const color = indicator.style.color || '#ff6d00';
                
                // Show value tooltip near mouse
                ctx.fillStyle = 'rgba(19, 23, 34, 0.9)';
                ctx.fillRect(mouseX + 10, mouseY - 20, 80, 18);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(mouseX + 10, mouseY - 20, 80, 18);
                ctx.fillStyle = color;
                ctx.font = '11px Roboto';
                ctx.textAlign = 'left';
                ctx.fillText(`${indicator.name}: ${val.toFixed(2)}`, mouseX + 14, mouseY - 7);
            }
        });
    }
    
    ctx.textAlign = 'left';
};

/** Per-indicator Y zoom/pan for separate panels (right-axis drag / wheel). */
Chart.prototype._ensureIndicatorPanelAxis = function(indicator) {
    if (!indicator._panelAxis) indicator._panelAxis = { zoom: 1, offset: 0 };
};

/**
 * Map auto-fit [baseMin, baseMax] to displayed domain using indicator._panelAxis.
 * Bases are stored on indicator as _panelBaseMin / _panelBaseMax each render.
 */
Chart.prototype._applyIndicatorPanelDomain = function(baseMin, baseMax, indicator) {
    this._ensureIndicatorPanelAxis(indicator);
    const b0 = baseMin;
    const b1 = baseMax;
    if (!Number.isFinite(b0) || !Number.isFinite(b1) || b1 <= b0) {
        return { min: b0, max: b1 };
    }
    const pa = indicator._panelAxis;
    const z = Math.max(0.02, Math.min(200, pa.zoom || 1));
    const mid = (b0 + b1) / 2 + (pa.offset || 0);
    const span = (b1 - b0) / z;
    return { min: mid - span / 2, max: mid + span / 2 };
};

/** Vertical drag on right margin over a separate indicator slot */
Chart.prototype.separatePanelAxisDragStep = function(slot, dy, pointerY) {
    const ind = slot.indicator;
    const b0 = ind._panelBaseMin;
    const b1 = ind._panelBaseMax;
    if (b0 == null || b1 == null || !Number.isFinite(b0) || !Number.isFinite(b1) || b1 <= b0) return;
    this._ensureIndicatorPanelAxis(ind);
    const pa = ind._panelAxis;
    const sensitivity = 0.002;
    const zoomFactor = Math.max(0.01, 1 - dy * sensitivity);
    const newZoom = Math.max(0.02, Math.min(200, pa.zoom * zoomFactor));
    const baseSpan = b1 - b0;
    const oldSpan = baseSpan / pa.zoom;
    const newSpan = baseSpan / newZoom;
    const rangeChange = newSpan - oldSpan;
    const h = Math.max(1, slot.bottom - slot.top);
    const cursorRatio = Math.max(0, Math.min(1, (pointerY - slot.top) / h));
    const mid = (b0 + b1) / 2 + (pa.offset || 0);
    const newMid = mid - rangeChange * (0.5 - cursorRatio);
    pa.offset = newMid - (b0 + b1) / 2;
    pa.zoom = newZoom;
};

/** Mouse wheel while cursor is over separate-pane price strip */
Chart.prototype.applySeparatePanelAxisWheel = function(priceZoomFactor, mx, my) {
    const slot = this.cursor && this.cursor.separatePanelSlot;
    if (!slot || !slot.indicator) return;
    const ind = slot.indicator;
    const b0 = ind._panelBaseMin;
    const b1 = ind._panelBaseMax;
    if (b0 == null || b1 == null || !Number.isFinite(b0) || !Number.isFinite(b1) || b1 <= b0) return;
    this._ensureIndicatorPanelAxis(ind);
    const pa = ind._panelAxis;
    const oldZoom = pa.zoom || 1;
    const newZoom = Math.max(0.02, Math.min(200, oldZoom * priceZoomFactor));
    if (newZoom === oldZoom) return;
    const baseSpan = b1 - b0;
    const oldSpan = baseSpan / oldZoom;
    const newSpan = baseSpan / newZoom;
    const rangeChange = newSpan - oldSpan;
    const h = Math.max(1, slot.bottom - slot.top);
    const cursorRatio = Math.max(0, Math.min(1, (my - slot.top) / h));
    const mid = (b0 + b1) / 2 + (pa.offset || 0);
    const newMid = mid - rangeChange * (0.5 - cursorRatio);
    pa.offset = newMid - (b0 + b1) / 2;
    pa.zoom = newZoom;
};

// Handle click on separate panel indicator to open settings
Chart.prototype.handleSeparatePanelClick = function(x, y) {
    if (!this.separatePanelInfo) return false;
    
    const { top, bottom, indicators } = this.separatePanelInfo;
    
    if (y >= top && y <= bottom) {
        // Clicked in indicator panel - open settings for first indicator
        if (indicators.length > 0 && typeof createIndicatorSettingsPanel === 'function') {
            const indicator = indicators[0];
            createIndicatorSettingsPanel(this, indicator.type, indicator);
            return true;
        }
    }
    return false;
};

Chart.prototype.drawLineIndicator = function(data, color, lineWidth, startIndex = 0, endIndex = data.length) {
    const ctx = this.ctx;
    const m = this.margin;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    
    let started = false;
    for (let i = startIndex; i < endIndex; i++) {
        if (data[i] === null || data[i] === undefined) continue;
        
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(data[i]);
        
        // Skip if outside visible area
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    if (started) {
        ctx.stroke();
    }
};

Chart.prototype.drawBollingerBands = function(bands, style, startIndex = 0, endIndex = bands.upper.length) {
    const ctx = this.ctx;
    const m = this.margin;
    
    // Draw fill first
    if (style.fillColor) {
        ctx.fillStyle = style.fillColor;
        ctx.beginPath();
        
        // Upper band
        let pathStarted = false;
        for (let i = startIndex; i < endIndex; i++) {
            if (bands.upper[i] === null) continue;
            
            const x = this.dataIndexToPixel(i);
            const y = this.yScale(bands.upper[i]);

            // Skip if outside visible area
            if (x < m.l - 50 || x > this.w - m.r + 50) continue;
            
            if (!pathStarted) {
                ctx.moveTo(x, y);
                pathStarted = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        // Lower band (reverse)
        for (let i = Math.min(endIndex - 1, bands.lower.length - 1); i >= startIndex; i--) {
            if (bands.lower[i] === null) continue;
            if (!pathStarted) continue;
            
            const x = this.dataIndexToPixel(i);
            const y = this.yScale(bands.lower[i]);

            if (x < m.l - 50 || x > this.w - m.r + 50) continue;
            
            ctx.lineTo(x, y);
        }

        if (pathStarted) {
            ctx.closePath();
            ctx.fill();
        }
    }
    
    // Draw lines
    this.drawLineIndicator(bands.upper, style.upperColor, style.lineWidth, startIndex, endIndex);
    this.drawLineIndicator(bands.middle, style.middleColor, style.lineWidth, startIndex, endIndex);
    this.drawLineIndicator(bands.lower, style.lowerColor, style.lineWidth, startIndex, endIndex);
};

/** Parabolic SAR — dots above/below price by trend */
Chart.prototype.drawParabolicSAR = function(sar, style, startIndex = 0, endIndex) {
    if (!sar || !this.data || !this.data.length) return;
    const ctx = this.ctx;
    const m = this.margin;
    const n = Math.min(sar.length, this.data.length);
    endIndex = endIndex == null ? n : Math.min(endIndex, n);
    const bull = (style && style.bullColor) || (style && style.color) || '#26a69a';
    const bear = (style && style.bearColor) || '#ef5350';
    const lw = (style && style.lineWidth) || 2;
    const r = Math.max(1.2, lw * 0.65);
    for (let i = startIndex; i < endIndex; i++) {
        if (sar[i] === null || sar[i] === undefined || isNaN(sar[i])) continue;
        const bar = this.data[i];
        if (!bar) continue;
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(sar[i]);
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        const long = bar.c >= sar[i];
        ctx.fillStyle = long ? bull : bear;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
};

// Draw ADR Bands - upper and lower bands based on Average Daily Range
Chart.prototype.drawADRBands = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.upper || !data.lower) return;
    
    const ctx = this.ctx;
    const m = this.margin;
    const color = style.color || '#00bcd4';
    const lineWidth = style.lineWidth || 2;
    
    // Draw upper band
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([5, 5]); // Dashed line for ADR bands
    
    // Upper band
    ctx.beginPath();
    let started = false;
    for (let i = startIndex; i < endIndex && i < data.upper.length; i++) {
        if (data.upper[i] === null) continue;
        
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(data.upper[i]);
        
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    if (started) ctx.stroke();
    
    // Lower band
    ctx.beginPath();
    started = false;
    for (let i = startIndex; i < endIndex && i < data.lower.length; i++) {
        if (data.lower[i] === null) continue;
        
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(data.lower[i]);
        
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    if (started) ctx.stroke();
    
    ctx.setLineDash([]); // Reset to solid line
};

// Draw ATR Bands - upper and lower bands based on ATR multiplier
Chart.prototype.drawATRBands = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.upper || !data.lower) return;
    
    const ctx = this.ctx;
    const m = this.margin;
    const color = style.color || '#ff6d00';
    const lineWidth = style.lineWidth || 2;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.8;
    
    // Upper band
    ctx.beginPath();
    let started = false;
    for (let i = startIndex; i < endIndex && i < data.upper.length; i++) {
        if (data.upper[i] === null) continue;
        
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(data.upper[i]);
        
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    if (started) ctx.stroke();
    
    // Lower band
    ctx.beginPath();
    started = false;
    for (let i = startIndex; i < endIndex && i < data.lower.length; i++) {
        if (data.lower[i] === null) continue;
        
        const x = this.dataIndexToPixel(i);
        const y = this.yScale(data.lower[i]);
        
        if (x < m.l - 50 || x > this.w - m.r + 50) continue;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    if (started) ctx.stroke();
    
    ctx.globalAlpha = 1.0;
};

// Draw Sessions indicator - colored background for trading sessions
Chart.prototype.drawSessions = function(data, style, startIndex = 0, endIndex = data.length) {
    const ctx = this.ctx;
    const m = this.margin;
    const ch = this.h - m.t - m.b;
    const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? this.volumeHeight : 0;
    const volumeAreaHeight = ch * effectiveVolumeHeight;
    const priceAreaBottom = this.h - m.b - volumeAreaHeight;
    
    // Draw session backgrounds
    for (let i = startIndex; i < endIndex && i < data.length; i++) {
        const sessions = data[i];
        if (!sessions || sessions.length === 0) continue;
        
        const x = this.dataIndexToPixel(i);
        const candleWidth = this.candleWidth || 8;
        
        // Skip if outside visible area
        if (x < m.l - candleWidth || x > this.w - m.r + candleWidth) continue;
        
        // Draw each session's background color
        sessions.forEach(session => {
            ctx.fillStyle = session.color;
            ctx.fillRect(
                x - candleWidth / 2,
                m.t,
                candleWidth,
                priceAreaBottom - m.t
            );
        });
    }
};

// Draw ICT Kill Zones indicator - session boxes with high/low boundaries
Chart.prototype.drawKillzones = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.boxes || data.boxes.length === 0) return;
    
    const ctx = this.ctx;
    const m = this.margin;
    const ch = this.h - m.t - m.b;
    const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? this.volumeHeight : 0;
    const volumeAreaHeight = ch * effectiveVolumeHeight;
    const priceAreaBottom = this.h - m.b - volumeAreaHeight;
    
    const transparency = data.boxTransparency !== undefined ? data.boxTransparency : 85;
    
    // Draw session boxes
    data.boxes.forEach(box => {
        const x1 = this.dataIndexToPixel(box.startIndex);
        const x2 = this.dataIndexToPixel(box.endIndex);
        const y1 = this.yScale(box.high);
        const y2 = this.yScale(box.low);
        
        // Skip if completely outside visible area
        if (x2 < m.l || x1 > this.w - m.r) return;
        
        // Clamp to chart boundaries
        const drawX1 = Math.max(x1, m.l);
        const drawX2 = Math.min(x2, this.w - m.r);
        const boxWidth = drawX2 - drawX1;
        const boxHeight = y2 - y1;
        
        if (boxWidth <= 0 || boxHeight <= 0) return;
        
        // Convert hex color to rgba with transparency
        const hexToRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        // Draw box fill
        ctx.fillStyle = hexToRgba(box.color, (100 - transparency) / 100);
        ctx.fillRect(drawX1, y1, boxWidth, boxHeight);
        
        // Draw top border (high line)
        ctx.strokeStyle = box.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drawX1, y1);
        ctx.lineTo(drawX2, y1);
        ctx.stroke();
        
        // Draw bottom border (low line)
        ctx.beginPath();
        ctx.moveTo(drawX1, y2);
        ctx.lineTo(drawX2, y2);
        ctx.stroke();
        
        // Draw midline if enabled
        if (data.showMidline) {
            const midY = (y1 + y2) / 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(drawX1, midY);
            ctx.lineTo(drawX2, midY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw session label with range info
        if (data.showBoxInfo && boxWidth > 40) {
            const midX = (drawX1 + drawX2) / 2;
            const labelY = y1 - 5;
            
            // Calculate range in pips (for forex) or points
            const range = box.range;
            const pipMultiplier = this.pipSize || 0.0001;
            const pips = Math.round(range / pipMultiplier);
            const rangeText = `${pips} pips`;
            
            ctx.fillStyle = style.textColor || '#5c71af';
            ctx.font = '10px Roboto';
            ctx.textAlign = 'center';
            ctx.fillText(`${box.name} • ${rangeText}`, midX, labelY);
        }
        
        // Draw deviations if enabled
        if (data.showDeviations && data.deviationCount > 0) {
            const devRange = box.range;
            ctx.setLineDash([2, 2]);
            
            for (let d = 1; d <= data.deviationCount; d++) {
                // Upper deviation
                const upperDevPrice = box.high + (devRange * d);
                const upperY = this.yScale(upperDevPrice);
                if (upperY >= m.t) {
                    ctx.strokeStyle = box.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(drawX1, upperY);
                    ctx.lineTo(drawX2, upperY);
                    ctx.stroke();
                }
                
                // Lower deviation
                const lowerDevPrice = box.low - (devRange * d);
                const lowerY = this.yScale(lowerDevPrice);
                if (lowerY <= priceAreaBottom) {
                    ctx.beginPath();
                    ctx.moveTo(drawX1, lowerY);
                    ctx.lineTo(drawX2, lowerY);
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]);
        }
    });
    
    // Draw NY Midnight lines
    if (data.showNYMidnight && data.nyMidnight && data.nyMidnight.length > 0) {
        const nyColor = data.nyMidnightColor || '#2d62b6';
        
        data.nyMidnight.forEach(midnight => {
            const x = this.dataIndexToPixel(midnight.index);
            const y = this.yScale(midnight.price);
            
            // Skip if outside visible area
            if (x < m.l || x > this.w - m.r) return;
            
            // Draw vertical line at midnight
            ctx.strokeStyle = nyColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, m.t);
            ctx.lineTo(x, priceAreaBottom);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw horizontal price line extending right
            ctx.strokeStyle = nyColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(this.w - m.r, y);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw label
            ctx.fillStyle = style.textColor || '#5c71af';
            ctx.font = '10px Roboto';
            ctx.textAlign = 'left';
            const priceText = midnight.price.toFixed(this.pricePrecision || 5);
            ctx.fillText(`NY Open ${priceText}`, x + 5, y - 5);
        });
    }
};
    
    Chart.prototype.updateOHLCIndicators = function() {
        const idSuffix = (this.panelIndex !== undefined) ? this.panelIndex : '';
        const div = document.getElementById('ohlcIndicators' + idSuffix);
        
        if (!div) return;
        
        // Don't update if modal is open (prevents destroying DOM while editing)
        if (document.getElementById('indicator-settings-modal')) return;
        
        div.innerHTML = '';
        
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }
        
        // Show overlay indicators in OHLC panel (volume has its own dedicated line)
        const overlayIndicators = this.indicators.active.filter(function(ind) {
            // Exclude volume - it has its own dedicated UI element
            if (ind.type === 'volume' || ind.isVolume) return false;
            return ind.overlay !== false;
        });
        
        for (let i = 0; i < overlayIndicators.length; i++) {
            const indicator = overlayIndicators[i];
            const chip = getTalariaChipStyles();
            const item = document.createElement('div');
            item.style.cssText = chip.chipCss + 'pointer-events:auto;';

            item.onmouseenter = function() {
                item.style.background = chip.bgHover;
                item.style.borderColor = chip.borderHover;
            };
            item.onmouseleave = function() {
                item.style.background = chip.bg;
                item.style.borderColor = 'transparent';
            };

            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = chip.colorStrip(displayColor);
            item.appendChild(colorBox);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            nameSpan.style.cssText = 'color: #d1d4dc; font-size: 11px; font-weight: 500; user-select: none; opacity: ' + (indicator.visible !== false ? '1' : '0.5') + ';';
            nameSpan.title = indicator.name;
            item.appendChild(nameSpan);

            const actions = document.createElement('span');
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:0;margin-left:2px;flex-shrink:0;';

            const self = this;
            const id = indicator.id;

            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            visibilityBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#787b86;transition:background 0.2s,color 0.2s;opacity:' + (indicator.visible !== false ? '1' : '0.5') + ';';
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            };
            visibilityBtn.onmouseleave = function() {
                visibilityBtn.style.background = 'transparent';
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                indicator.visible = indicator.visible === false ? true : false;
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                visibilityBtn.style.opacity = indicator.visible ? '1' : '0.5';
                nameSpan.style.opacity = indicator.visible ? '1' : '0.5';
                if (!indicator.visible) {
                    if (indicator.data) {
                        indicator._hiddenData = indicator.data;
                        indicator.data = [];
                    }
                    if (self.indicators && self.indicators.data && self.indicators.data[id]) {
                        indicator._hiddenDataStore = self.indicators.data[id];
                        self.indicators.data[id] = [];
                    }
                } else {
                    if (indicator._hiddenData) {
                        indicator.data = indicator._hiddenData;
                        delete indicator._hiddenData;
                    }
                    if (indicator._hiddenDataStore && self.indicators && self.indicators.data) {
                        self.indicators.data[id] = indicator._hiddenDataStore;
                        delete indicator._hiddenDataStore;
                    }
                }
                if (typeof self.render === 'function') self.render();
            };
            actions.appendChild(visibilityBtn);

            const settingsBtn = document.createElement('span');
            settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            settingsBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#787b86;transition:background 0.2s,color 0.2s;';
            settingsBtn.title = 'Edit settings';
            settingsBtn.onmouseenter = function() {
                settingsBtn.style.color = '#ffffff';
                settingsBtn.style.background = self._cachedAccentColor || '#2962ff';
            };
            settingsBtn.onmouseleave = function() {
                settingsBtn.style.color = '#787b86';
                settingsBtn.style.background = 'transparent';
            };
            settingsBtn.onclick = function(e) {
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(id);
            };
            actions.appendChild(settingsBtn);

            item.onclick = function(e) {
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(id);
            };

            const removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#f23645;font-size:13px;font-weight:700;transition:background 0.2s;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.background = 'rgba(242, 54, 69, 0.18)';
            };
            removeBtn.onmouseleave = function() {
                removeBtn.style.background = 'transparent';
            };
            removeBtn.onclick = function(e) {
                e.stopPropagation();
                self.removeIndicator(id);
            };
            actions.appendChild(removeBtn);

            item.appendChild(actions);
            item.title = 'Click to edit, click "×" to remove';
            div.appendChild(item);
        }

        // Re-apply showIndicatorTitles visibility flag after rebuilding
        if (this.chartSettings && this.chartSettings.showIndicatorTitles === false) {
            div.style.display = 'none';
        } else {
            div.style.display = '';
        }
    };
    
    Chart.prototype.showIndicatorSettings = function(id) {
        try {
            
            // First, let's test with a simple alert to make sure the function is called
            const indicator = this.indicators.active.find(function(ind) {
                return ind.id === id;
            });
            
            if (!indicator) {
                alert('Error: Indicator not found');
                return;
            }

            // Prefer the shared template-aware settings panel from indicator-ui.js
            // so colors always stay in sync with active template/theme changes.
            if (typeof window.createIndicatorSettingsPanel === 'function') {
                window.createIndicatorSettingsPanel(this, indicator.type, indicator);
                return;
            }

        
        // Check if modal already exists
        const existingModal = document.getElementById('indicator-settings-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create a VERY simple modal for testing
        const modal = document.createElement('div');
        modal.id = 'indicator-settings-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        modal.style.zIndex = '2147483647'; // Maximum z-index
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        const dialog = document.createElement('div');
        dialog.style.backgroundColor = 'white';
        dialog.style.color = 'black';
        dialog.style.padding = '30px';
        dialog.style.borderRadius = '10px';
        dialog.style.minWidth = '400px';
        dialog.style.maxWidth = '500px';
        dialog.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.5)';
        dialog.style.border = '1px solid #ddd';
        
        // Title with close button
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
        
        const title = document.createElement('h3');
        title.textContent = indicator.name + ' Settings';
        title.style.margin = '0';
        title.style.color = '#333';
        title.style.fontSize = '18px';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; color: #666; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = function() {
            modal.remove();
        };
        closeBtn.onmouseenter = function() { closeBtn.style.color = '#000'; };
        closeBtn.onmouseleave = function() { closeBtn.style.color = '#666'; };
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        dialog.appendChild(header);
        
        const form = document.createElement('div');
        form.style.cssText = 'display: flex; flex-direction: column; gap: 15px;';
        
        // Helper function to create input groups
        function createInputGroup(label, value, type) {
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; flex-direction: column; gap: 5px;';
            
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            labelEl.style.cssText = 'color: #333; font-size: 13px; font-weight: 500;';
            
            const input = document.createElement('input');
            input.type = type;
            input.value = value;
            input.style.cssText = 'background: white; border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; color: #333; font-size: 14px;';
            
            if (type === 'number') {
                input.min = '1';
                input.step = label.includes('Std') ? '0.1' : '1';
            }
            
            container.appendChild(labelEl);
            container.appendChild(input);
            
            return { container: container, input: input };
        }
        
        // Add inputs based on indicator type
        const inputs = {};
        
        if (indicator.params.period !== undefined) {
            const group = createInputGroup('Period', indicator.params.period, 'number');
            form.appendChild(group.container);
            inputs.period = group.input;
        }
        
        if (indicator.params.stdDev !== undefined) {
            const group = createInputGroup('Std Dev', indicator.params.stdDev, 'number');
            form.appendChild(group.container);
            inputs.stdDev = group.input;
        }
        
        if (indicator.params.fast !== undefined) {
            const group = createInputGroup('Fast', indicator.params.fast, 'number');
            form.appendChild(group.container);
            inputs.fast = group.input;
        }
        
        if (indicator.params.slow !== undefined) {
            const group = createInputGroup('Slow', indicator.params.slow, 'number');
            form.appendChild(group.container);
            inputs.slow = group.input;
        }
        
        if (indicator.params.signal !== undefined) {
            const group = createInputGroup('Signal', indicator.params.signal, 'number');
            form.appendChild(group.container);
            inputs.signal = group.input;
        }
        
        if (indicator.params.smoothK !== undefined) {
            const group = createInputGroup('Smooth K', indicator.params.smoothK, 'number');
            form.appendChild(group.container);
            inputs.smoothK = group.input;
        }
        
        if (indicator.params.smoothD !== undefined) {
            const group = createInputGroup('Smooth D', indicator.params.smoothD, 'number');
            form.appendChild(group.container);
            inputs.smoothD = group.input;
        }
        
        // Color inputs
        if (indicator.style.color !== undefined) {
            const group = createInputGroup('Color', indicator.style.color, 'color');
            form.appendChild(group.container);
            inputs.color = group.input;
        }
        
        // Volume indicator colors
        if (indicator.style.upColor !== undefined) {
            const group = createInputGroup('Up Volume Color', indicator.style.upColor, 'color');
            form.appendChild(group.container);
            inputs.upColor = group.input;
        }
        
        if (indicator.style.downColor !== undefined) {
            const group = createInputGroup('Down Volume Color', indicator.style.downColor, 'color');
            form.appendChild(group.container);
            inputs.downColor = group.input;
        }
        
        if (indicator.style.upperColor !== undefined) {
            const group = createInputGroup('Upper Color', indicator.style.upperColor, 'color');
            form.appendChild(group.container);
            inputs.upperColor = group.input;
        }
        
        if (indicator.style.middleColor !== undefined) {
            const group = createInputGroup('Middle Color', indicator.style.middleColor, 'color');
            form.appendChild(group.container);
            inputs.middleColor = group.input;
        }
        
        if (indicator.style.lowerColor !== undefined) {
            const group = createInputGroup('Lower Color', indicator.style.lowerColor, 'color');
            form.appendChild(group.container);
            inputs.lowerColor = group.input;
        }
        
        if (indicator.style.macdColor !== undefined) {
            const group = createInputGroup('MACD Color', indicator.style.macdColor, 'color');
            form.appendChild(group.container);
            inputs.macdColor = group.input;
        }
        
        if (indicator.style.signalColor !== undefined) {
            const group = createInputGroup('Signal Color', indicator.style.signalColor, 'color');
            form.appendChild(group.container);
            inputs.signalColor = group.input;
        }
        
        if (indicator.style.histogramColor !== undefined) {
            const group = createInputGroup('Histogram Color', indicator.style.histogramColor, 'color');
            form.appendChild(group.container);
            inputs.histogramColor = group.input;
        }
        
        if (indicator.style.kColor !== undefined) {
            const group = createInputGroup('%K Color', indicator.style.kColor, 'color');
            form.appendChild(group.container);
            inputs.kColor = group.input;
        }
        
        if (indicator.style.dColor !== undefined) {
            const group = createInputGroup('%D Color', indicator.style.dColor, 'color');
            form.appendChild(group.container);
            inputs.dColor = group.input;
        }
        
        dialog.appendChild(form);
        
        // Buttons
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 10px 20px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 6px; color: #333; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;';
        cancelBtn.onmouseenter = function() { 
            cancelBtn.style.background = '#e0e0e0'; 
            cancelBtn.style.borderColor = '#999';
        };
        cancelBtn.onmouseleave = function() { 
            cancelBtn.style.background = '#f0f0f0'; 
            cancelBtn.style.borderColor = '#ccc';
        };
        cancelBtn.onclick = function() {
            modal.remove();
        };
        
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply Changes';
        applyBtn.style.cssText = 'padding: 10px 20px; background: var(--sp-accent, #2962ff); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;';
        applyBtn.onmouseenter = function() { applyBtn.style.background = 'rgba(var(--sp-accent-rgb, 41,98,255), 0.8)'; };
        applyBtn.onmouseleave = function() { applyBtn.style.background = 'var(--sp-accent, #2962ff)'; };
        
        const self = this;
        applyBtn.onclick = function() {
            const newParams = {};
            
            if (inputs.period) newParams.period = parseInt(inputs.period.value);
            if (inputs.stdDev) newParams.stdDev = parseFloat(inputs.stdDev.value);
            if (inputs.fast) newParams.fast = parseInt(inputs.fast.value);
            if (inputs.slow) newParams.slow = parseInt(inputs.slow.value);
            if (inputs.signal) newParams.signal = parseInt(inputs.signal.value);
            if (inputs.smoothK) newParams.smoothK = parseInt(inputs.smoothK.value);
            if (inputs.smoothD) newParams.smoothD = parseInt(inputs.smoothD.value);
            if (inputs.color) newParams.color = inputs.color.value;
            if (inputs.upColor) newParams.upColor = inputs.upColor.value;
            if (inputs.downColor) newParams.downColor = inputs.downColor.value;
            if (inputs.upperColor) newParams.upperColor = inputs.upperColor.value;
            if (inputs.middleColor) newParams.middleColor = inputs.middleColor.value;
            if (inputs.lowerColor) newParams.lowerColor = inputs.lowerColor.value;
            if (inputs.macdColor) newParams.macdColor = inputs.macdColor.value;
            if (inputs.signalColor) newParams.signalColor = inputs.signalColor.value;
            if (inputs.histogramColor) newParams.histogramColor = inputs.histogramColor.value;
            if (inputs.kColor) newParams.kColor = inputs.kColor.value;
            if (inputs.dColor) newParams.dColor = inputs.dColor.value;
            self.updateIndicator(id, newParams);
            modal.remove();
        };
        
        buttons.appendChild(cancelBtn);
        buttons.appendChild(applyBtn);
        dialog.appendChild(buttons);
        
        modal.appendChild(dialog);
        document.body.appendChild(modal);


        
        // Verify modal is visible
        const modalRect = modal.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();



        
        // Force focus to the modal
        modal.focus();
        
        // Close on background click
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        };
        } catch (error) {
            alert('Error opening indicator settings: ' + error.message);
        }
    };
    
    // Recompute the total pixel height reserved for separate-panel indicators
    Chart.prototype._updateIndicatorPanelHeight = function() {
        const indicators = this._getVisibleSeparateIndicators();
        if (!indicators.length) {
            this.separateIndicatorPanelHeight = 0;
            return;
        }
        const heights = this._getSeparatePanelHeights(indicators);
        this.separateIndicatorPanelHeight = heights.reduce((sum, h) => sum + h, 0);
    };

    // ---- Helper: draw a single line in a sub-panel using a pre-computed scaleY ----
    Chart.prototype._drawPanelLine = function(ctx, m, values, color, lineWidth, visibleStart, visibleEnd, scaleY, clipTop, clipBottom) {
        if (!values) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth || 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        const useClip = Number.isFinite(clipTop) && Number.isFinite(clipBottom) && clipBottom > clipTop;
        for (let i = visibleStart; i < visibleEnd && i < values.length; i++) {
            const val = values[i];
            if (val === null || val === undefined || isNaN(val)) { started = false; continue; }
            const x = this.dataIndexToPixel(i);
            let y = scaleY(val);
            if (y === null || !Number.isFinite(y) || x < m.l - 10 || x > this.w - m.r + 10) { started = false; continue; }
            if (useClip) y = Math.max(clipTop + 0.5, Math.min(clipBottom - 0.5, y));
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
        }
        if (started) ctx.stroke();
    };

    // ---- MACD panel: histogram bars + MACD line + signal line + zero line ----
    Chart.prototype._renderMACDPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data.macd || !data.signal || !data.histogram) return;
        const macdArr = data.macd, signalArr = data.signal, histArr = data.histogram;

        let min = Infinity, max = -Infinity;
        for (let i = visibleStart; i < visibleEnd; i++) {
            [macdArr[i], signalArr[i], histArr[i]].forEach(v => {
                if (v !== null && v !== undefined && !isNaN(v)) { min = Math.min(min, v); max = Math.max(max, v); }
            });
        }
        if (min === Infinity) return;
        const range = max - min || 1;
        min -= range * 0.1; max += range * 0.1;
        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const domM = this._applyIndicatorPanelDomain(min, max, indicator);
        min = domM.min; max = domM.max;
        const mSpan = Math.max(1e-12, max - min);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - min) / mSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        // Zero line
        const zeroY = scaleY(0);
        if (zeroY !== null && zeroY > panelTop && zeroY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(m.l, zeroY);
            ctx.lineTo(this.w - m.r, zeroY);
            ctx.stroke();
        }

        // Histogram bars
        const barW = Math.max(1, (this.candleWidth || 8) * 0.8);
        for (let i = visibleStart; i < visibleEnd && i < histArr.length; i++) {
            const val = histArr[i];
            if (val === null || val === undefined || isNaN(val)) continue;
            const x = this.dataIndexToPixel(i);
            if (x < m.l || x > this.w - m.r) continue;
            const y = scaleY(val);
            const z = (zeroY !== null && !isNaN(zeroY)) ? zeroY : (panelBottom - 5);
            const prevVal = (i > visibleStart) ? histArr[i - 1] : null;
            const growing = (prevVal === null || val >= prevVal);
            ctx.fillStyle = val >= 0
                ? (growing ? 'rgba(38,166,154,0.85)' : 'rgba(38,166,154,0.4)')
                : (growing ? 'rgba(239,83,80,0.4)' : 'rgba(239,83,80,0.85)');
            ctx.fillRect(x - barW / 2, Math.min(y, z), barW, Math.max(1, Math.abs(y - z)));
        }

        this._drawPanelLine(ctx, m, macdArr, indicator.style.macdColor || '#2962ff', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, signalArr, indicator.style.signalColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        // Label
        let lastM = null, lastS = null;
        for (let i = Math.min(visibleEnd - 1, macdArr.length - 1); i >= visibleStart; i--) {
            if (macdArr[i] !== null && !isNaN(macdArr[i])) { lastM = macdArr[i]; lastS = signalArr[i]; break; }
        }
        indicator._displayColor = indicator.style.macdColor || '#2962ff';
        indicator._displayLabel = lastM !== null ? 'M:' + lastM.toFixed(5) + (lastS !== null ? '  S:' + lastS.toFixed(5) : '') : '';
    };

    // ---- Stochastic panel: %K + %D lines + 80/50/20 reference levels ----
    Chart.prototype._renderStochPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data.k || !data.d) return;
        const kArr = data.k, dArr = data.d;
        indicator._panelBaseMin = 0;
        indicator._panelBaseMax = 100;
        const domS = this._applyIndicatorPanelDomain(0, 100, indicator);
        const sMin = domS.min;
        const sMax = domS.max;
        const sSpan = Math.max(1e-9, sMax - sMin);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - sMin) / sSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        [[80, 'rgba(239,83,80,0.5)'], [50, 'rgba(120,123,134,0.3)'], [20, 'rgba(38,166,154,0.5)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w - m.r, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(lvl, this.w - m.r - 2, ry - 2);
            }
        });

        this._drawPanelLine(ctx, m, kArr, indicator.style.kColor || '#2962ff', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, dArr, indicator.style.dColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let lastK = null, lastD = null;
        for (let i = Math.min(visibleEnd - 1, kArr.length - 1); i >= visibleStart; i--) {
            if (kArr[i] !== null && !isNaN(kArr[i])) { lastK = kArr[i]; lastD = dArr[i]; break; }
        }
        indicator._displayColor = indicator.style.kColor || '#2962ff';
        indicator._displayLabel = lastK !== null ? 'K:' + lastK.toFixed(2) + (lastD !== null ? '  D:' + lastD.toFixed(2) : '') : '';
    };

    // ---- ADX panel: ADX + +DI + -DI lines + 25 threshold ----
    Chart.prototype._renderADXPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data.adx || !data.plusDI || !data.minusDI) return;
        const adxArr = data.adx, plusArr = data.plusDI, minusArr = data.minusDI;

        let max = 0;
        for (let i = visibleStart; i < visibleEnd; i++) {
            [adxArr[i], plusArr[i], minusArr[i]].forEach(v => { if (v !== null && !isNaN(v)) max = Math.max(max, v); });
        }
        max = Math.max(max * 1.1, 60);
        indicator._panelBaseMin = 0;
        indicator._panelBaseMax = max;
        const domA = this._applyIndicatorPanelDomain(0, max, indicator);
        const aMin = domA.min;
        const aMax = domA.max;
        const aSpan = Math.max(1e-9, aMax - aMin);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - aMin) / aSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        // 25 threshold line
        const thY = scaleY(25);
        if (thY !== null && thY > panelTop && thY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, thY);
            ctx.lineTo(this.w - m.r, thY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '9px Roboto';
            ctx.textAlign = 'right';
            ctx.fillText('25', this.w - m.r - 2, thY - 2);
        }

        this._drawPanelLine(ctx, m, plusArr, indicator.style.plusDIColor || '#00e676', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, minusArr, indicator.style.minusDIColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, adxArr, indicator.style.adxColor || '#ff00ff', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let lastADX = null;
        for (let i = Math.min(visibleEnd - 1, adxArr.length - 1); i >= visibleStart; i--) {
            if (adxArr[i] !== null && !isNaN(adxArr[i])) { lastADX = adxArr[i]; break; }
        }
        indicator._displayColor = indicator.style.adxColor || '#ff00ff';
        indicator._displayLabel = lastADX !== null ? lastADX.toFixed(2) : '';
    };

    // ---- Aroon panel: Up / Down 0–100 + 70 reference ----
    Chart.prototype._renderAroonPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data || !data.up || !data.down) return;
        const upArr = data.up;
        const downArr = data.down;
        indicator._panelBaseMin = 0;
        indicator._panelBaseMax = 100;
        const dom = this._applyIndicatorPanelDomain(0, 100, indicator);
        const aMin = dom.min;
        const aMax = dom.max;
        const aSpan = Math.max(1e-9, aMax - aMin);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - aMin) / aSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        const thY = scaleY(70);
        if (thY !== null && thY > panelTop && thY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, thY);
            ctx.lineTo(this.w - m.r, thY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '9px Roboto';
            ctx.textAlign = 'right';
            ctx.fillText('70', this.w - m.r - 2, thY - 2);
        }

        this._drawPanelLine(ctx, m, upArr, indicator.style.upColor || '#00e676', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, downArr, indicator.style.downColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let lastU = null, lastD = null;
        for (let i = Math.min(visibleEnd - 1, upArr.length - 1); i >= visibleStart; i--) {
            if (upArr[i] !== null && !isNaN(upArr[i])) { lastU = upArr[i]; lastD = downArr[i]; break; }
        }
        indicator._displayColor = indicator.style.upColor || '#00e676';
        indicator._displayLabel = lastU !== null ? '↑' + lastU.toFixed(0) + ' ↓' + (lastD != null ? lastD.toFixed(0) : '—') : '';
    };

    // ---- Williams %R: fixed −100 … 0, ref −20 / −80 ----
    Chart.prototype._renderWilliamsRPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, values, visibleStart, visibleEnd) {
        if (!values || !values.length) return;
        indicator._panelBaseMin = -100;
        indicator._panelBaseMax = 0;
        const dom = this._applyIndicatorPanelDomain(-100, 0, indicator);
        const wMin = dom.min;
        const wMax = dom.max;
        const wSpan = Math.max(1e-9, wMax - wMin);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - wMin) / wSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        [[-20, 'rgba(239,83,80,0.45)'], [-50, 'rgba(120,123,134,0.25)'], [-80, 'rgba(38,166,154,0.45)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w - m.r, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(String(lvl), this.w - m.r - 2, ry - 2);
            }
        });

        this._drawPanelLine(ctx, m, values, indicator.style.color || '#ec407a', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let last = null;
        for (let i = Math.min(visibleEnd - 1, values.length - 1); i >= visibleStart; i--) {
            if (values[i] !== null && !isNaN(values[i])) { last = values[i]; break; }
        }
        indicator._displayColor = indicator.style.color || '#ec407a';
        indicator._displayLabel = last !== null ? last.toFixed(2) : '';
    };

    // ---- MFI: 0–100 with 80/50/20 bands (same idea as Stoch) ----
    Chart.prototype._renderMFIPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, values, visibleStart, visibleEnd) {
        if (!values || !values.length) return;
        indicator._panelBaseMin = 0;
        indicator._panelBaseMax = 100;
        const dom = this._applyIndicatorPanelDomain(0, 100, indicator);
        const sMin = dom.min;
        const sMax = dom.max;
        const sSpan = Math.max(1e-9, sMax - sMin);
        const scaleY = v => {
            if (v === null || v === undefined) return null;
            let y = panelBottom - 5 - ((v - sMin) / sSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };

        [[80, 'rgba(239,83,80,0.5)'], [50, 'rgba(120,123,134,0.3)'], [20, 'rgba(38,166,154,0.5)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w - m.r, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(String(lvl), this.w - m.r - 2, ry - 2);
            }
        });

        this._drawPanelLine(ctx, m, values, indicator.style.color || '#5c6bc0', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let last = null;
        for (let i = Math.min(visibleEnd - 1, values.length - 1); i >= visibleStart; i--) {
            if (values[i] !== null && !isNaN(values[i])) { last = values[i]; break; }
        }
        indicator._displayColor = indicator.style.color || '#5c6bc0';
        indicator._displayLabel = last !== null ? last.toFixed(2) : '';
    };

    // Build/refresh indicator label pills for each separate panel slot (matches OHLC panel style)
    Chart.prototype._updateSeparatePanelLabels = function(panelSlots, indicators, m) {
        const canvas = this.ctx && this.ctx.canvas;
        const wrapper = canvas ? canvas.parentElement : null;
        if (!wrapper) return;
        if (!Array.isArray(panelSlots) || panelSlots.length === 0) return;

        // State-key caching: only rebuild DOM when something actually changed.
        // Rebuilding innerHTML on every render() is a major perf bottleneck.
        const stateKey = panelSlots.map(function(slot) {
            return slot.indicator.id + ':' + Math.round(slot.top) + ':' + Math.round(slot.height);
        }).join('|') + '|' + indicators.map(function(ind) {
            return ind.id + ':' + (ind.visible !== false ? '1' : '0') + ':' + (ind._displayLabel || '') + ':' + (ind._displayColor || '');
        }).join('|');

        let overlay = wrapper.querySelector('#separatePanelsOverlay');
        if (overlay && overlay._stateKey === stateKey) return;

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'separatePanelsOverlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
            wrapper.appendChild(overlay);
        }
        overlay.innerHTML = '';
        overlay._stateKey = stateKey;

        const self = this;
        // Use accent color cached by applyChartSettings — avoids getComputedStyle in the hot render path
        const accentColor = this._cachedAccentColor || '#2962ff';
        const chip = getTalariaChipStyles();

        indicators.forEach(function(indicator, idx) {
            if (indicator.type === 'volume' || indicator.isVolume) return;
            const slot = panelSlots[idx];
            if (!slot) return;
            const slotTop = slot.top;
            const color   = indicator._displayColor || indicator.style.color || '#2962ff';
            const label   = indicator._displayLabel  || '';
            const visible = indicator.visible !== false;

            // Pill container — same size & chrome as OHLC / ADX bar
            const bar = document.createElement('div');
            bar.style.cssText = [
                'position:absolute',
                'top:' + (slotTop + 5) + 'px',
                'left:' + (m.l + 6) + 'px',
                'z-index:10',
                'pointer-events:auto',
                'white-space:nowrap',
                'user-select:none',
                'font-family:Roboto,sans-serif'
            ].join(';') + ';' + chip.chipCss + ';margin:0;';
            bar.onmouseenter = function() {
                bar.style.background = chip.bgHover;
                bar.style.borderColor = chip.borderHover;
            };
            bar.onmouseleave = function() {
                bar.style.background = chip.bg;
                bar.style.borderColor = 'transparent';
            };

            const strip = document.createElement('span');
            strip.style.cssText = chip.colorStrip(color) + 'opacity:' + (visible ? '1' : '0.4') + ';';
            bar.appendChild(strip);

            const nameEl = document.createElement('span');
            nameEl.textContent = indicator.name;
            nameEl.style.cssText = 'color:#d1d4dc;font-size:11px;font-weight:500;user-select:none;opacity:' + (visible ? '1' : '0.4') + ';';
            bar.appendChild(nameEl);

            if (label) {
                const valEl = document.createElement('span');
                valEl.style.cssText = 'color:#d1d4dc;font-size:11px;margin-left:2px;';
                valEl.textContent = label;
                bar.appendChild(valEl);
            }

            const actions = document.createElement('span');
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:0;margin-left:2px;flex-shrink:0;';

            const eyeBtn = document.createElement('span');
            eyeBtn.title = visible ? 'Hide' : 'Show';
            eyeBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#787b86;transition:background 0.2s,color 0.2s;opacity:' + (visible ? '1' : '0.5') + ';';
            eyeBtn.innerHTML = visible
                ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            eyeBtn.onmouseenter = function() { eyeBtn.style.background = 'rgba(120, 123, 134, 0.2)'; };
            eyeBtn.onmouseleave = function() { eyeBtn.style.background = 'transparent'; };
            eyeBtn.onclick = function(e) {
                e.stopPropagation();
                indicator.visible = (indicator.visible === false) ? true : false;
                self._updateIndicatorPanelHeight();
                if (typeof self.render === 'function') self.render();
            };
            actions.appendChild(eyeBtn);

            const setBtn = document.createElement('span');
            setBtn.title = 'Settings';
            setBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#787b86;transition:background 0.2s,color 0.2s;';
            setBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            setBtn.onmouseenter = function() {
                setBtn.style.color = '#ffffff';
                setBtn.style.background = accentColor;
            };
            setBtn.onmouseleave = function() {
                setBtn.style.color = '#787b86';
                setBtn.style.background = 'transparent';
            };
            setBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(indicator.id);
            };
            actions.appendChild(setBtn);

            const delBtn = document.createElement('span');
            delBtn.textContent = '×';
            delBtn.title = 'Remove indicator';
            delBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border-radius:3px;cursor:pointer;color:#f23645;font-size:13px;font-weight:700;transition:background 0.2s;';
            delBtn.onmouseenter = function() { delBtn.style.background = 'rgba(242, 54, 69, 0.18)'; };
            delBtn.onmouseleave = function() { delBtn.style.background = 'transparent'; };
            delBtn.onclick = function(e) {
                e.stopPropagation();
                if (typeof self.removeIndicator === 'function') self.removeIndicator(indicator.id);
            };
            actions.appendChild(delBtn);

            bar.appendChild(actions);
            overlay.appendChild(bar);
        });
    };

    // Mark as loaded
    window.INDICATORS_MODULE_LOADED = true;
    
    } // End of attachIndicatorMethods
    
    // Start initialization
    initIndicatorsModule();
    
})(window);