// Full Chart Indicators Module with all basic indicators
(function(global) {
    console.log('📊 Full Indicators Module Loading...');
    
    // Wait for Chart class to be defined
    function initIndicatorsModule() {
        if (typeof global.Chart === 'undefined') {
            console.log('⏳ Waiting for Chart class...');
            setTimeout(initIndicatorsModule, 100);
            return;
        }
        
        console.log('✅ Chart class found, attaching indicator methods...');
        attachIndicatorMethods();
    }
    
    function attachIndicatorMethods() {
        const Chart = global.Chart;
    
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
                
                const kValue = ((data[i].c - lowest) / (highest - lowest)) * 100;
                k.push(kValue);
            }
        }
        
        // Smooth %K to get %D
        const smoothedK = calculateSMA(k.map(v => ({c: v || 0})), smoothK, 'c');
        const smoothedD = calculateSMA(smoothedK.map(v => ({c: v || 0})), smoothD, 'c');
        
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

    // ===== Chart Integration =====
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
                
                const kValue = ((data[i].c - lowest) / (highest - lowest)) * 100;
                k.push(kValue);
            }
        }
        
        // Smooth %K to get %D
        const smoothedK = calculateSMA(k.map(v => ({c: v || 0})), smoothK, 'c');
        const smoothedD = calculateSMA(smoothedK.map(v => ({c: v || 0})), smoothD, 'c');
        
        return { k: smoothedK, d: smoothedD };
    }
    
    // ===== Chart Integration =====
    
    Chart.prototype.initIndicators = function() {
        this.indicators = {
            active: [],
            data: {}
        };
        console.log('✅ Indicators system initialized');
    };
    
    Chart.prototype.addIndicator = function(type, params) {
    params = params || {};
    
    // Auto-initialize indicators if not done
    if (!this.indicators) {
        this.initIndicators();
    }
    
    if (!this.data || this.data.length === 0) {
        console.warn('⚠️ No data loaded - please load a CSV file first');
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
                
            default:
                console.error('Unknown indicator type:', type);
                return;
        }
        
        this.indicators.active.push(indicator);
        console.log('✅ Added indicator:', indicator.name);
        
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        
        return indicator;
    };
    
    Chart.prototype.updateIndicator = function(id, newParams) {
        const indicator = this.indicators.active.find(function(ind) {
            return ind.id === id;
        });
        
        if (!indicator) {
            console.warn('⚠️ Indicator not found:', id);
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
                indicator.params.period = params.period || 14;
                indicator.style.color = params.color || '#ff6d00';
                indicator.style.lineWidth = 2;
                indicator.overlay = false;
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
        }
        
        console.log('✅ Updated indicator:', indicator.name);
        
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        
        return indicator;
    };
    
    Chart.prototype.recalculateIndicators = function() {
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }
        
        console.log('🔄 Recalculating indicators for new timeframe...');
        
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
            }
        }, this);
        
        console.log('✅ Indicators recalculated');
    };
    
    Chart.prototype.setupVolumeIndicatorLine = function(indicator) {
        const volumeLine = document.getElementById('volumeIndicatorLine');
        if (!volumeLine) {
            console.warn('⚠️ Volume indicator line not found in DOM');
            return;
        }
        
        const self = this;
        console.log('📊 Setting up volume indicator line...');
        
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
            console.log('📊 Found visibility button');
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
                console.log('👁 Volume visibility clicked');
                indicator.visible = indicator.visible === false ? true : false;
                self.chartSettings.showVolume = indicator.visible !== false;
                
                // Update icon
                const currentLabel = volumeLine.querySelector('.volume-label');
                if (indicator.visible === false) {
                    newVisBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                    newVisBtn.style.opacity = '0.5';
                    if (currentLabel) currentLabel.style.opacity = '0.5';
                } else {
                    newVisBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                    newVisBtn.style.opacity = '1';
                    if (currentLabel) currentLabel.style.opacity = '1';
                }
                self.render();
            });
        }
        
        // Settings button
        const settingsBtn = volumeLine.querySelector('.volume-settings-btn');
        if (settingsBtn) {
            console.log('📊 Found settings button');
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
                console.log('⚙️ Volume settings clicked');
                self.showVolumeSettings();
            });
        }
        
        // Remove button
        const removeBtn = volumeLine.querySelector('.volume-remove-btn');
        if (removeBtn) {
            console.log('📊 Found remove button');
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
                console.log('🗑️ Volume remove clicked');
                // Find and remove volume indicator
                const volumeInd = self.indicators.active.find(function(ind) {
                    return ind.type === 'volume' || ind.isVolume;
                });
                if (volumeInd) {
                    self.removeIndicator(volumeInd.id);
                }
            });
        }
        
        console.log('✅ Volume indicator line setup complete');
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
            console.warn('No volume indicator found');
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
            
            console.log('🗑️ Removed indicator:', indicator.name);
            
            if (typeof this.render === 'function') {
                this.render();
            }
            
            this.updateOHLCIndicators();
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

        if (typeof this.render === 'function') {
            this.render();
        }

        if (typeof this.updateOHLCIndicators === 'function') {
            this.updateOHLCIndicators();
        }

        console.log('🗑️ All indicators cleared');
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

// Render separate panel indicators (like ATR, ADR) in a sub-panel below price chart
Chart.prototype.renderSeparatePanelIndicators = function() {
    if (!this.indicators || !this.indicators.active) {
        return;
    }
    if (!this.data || this.data.length === 0) {
        return;
    }
    
    // Get separate panel indicators (overlay = false means separate panel)
    // Exclude volume since it has its own dedicated rendering in the chart
    const separateIndicators = this.indicators.active.filter(ind => {
        if (ind.type === 'volume' || ind.isVolume) return false; // Volume has dedicated rendering
        const isSeparate = ind.overlay === false || ind.separatePanel === true;
        const isVisible = ind.visible !== false;
        return isSeparate && isVisible;
    });
    
    if (separateIndicators.length === 0) return;
    
    const ctx = this.ctx;
    const m = this.margin;
    const totalHeight = this.h;
    const chartWidth = this.w - m.l - m.r;
    
    // Calculate panel dimensions
    const panelHeight = 100; // Fixed height for indicator panel
    const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? 
        (this.h - m.t - m.b) * this.volumeHeight : 0;
    
    // Panel position: above volume, below price chart
    const panelBottom = totalHeight - m.b - effectiveVolumeHeight;
    const panelTop = panelBottom - panelHeight;
    
    // Draw panel background
    ctx.fillStyle = '#131722';
    ctx.fillRect(m.l, panelTop, chartWidth, panelHeight);
    
    // Draw top separator line
    ctx.strokeStyle = '#363a45';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(m.l, panelTop);
    ctx.lineTo(this.w - m.r, panelTop);
    ctx.stroke();
    
    // Get visible range
    const visibleStart = Math.max(0, Math.floor(this.visibleStartIndex || 0));
    const visibleEnd = Math.min(this.data.length, Math.ceil(this.visibleEndIndex || this.data.length));
    
    // Draw each indicator
    separateIndicators.forEach((indicator, idx) => {
        // Skip volume indicator - it has its own dedicated rendering
        if (indicator.type === 'volume' || indicator.isVolume) return;
        
        const indicatorData = this.indicators.data[indicator.id];
        if (!indicatorData) return;
        
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
        
        // Scale function for Y axis
        const scaleY = (val) => {
            if (val === null || val === undefined) return null;
            return panelBottom - 5 - ((val - min) / (max - min)) * (panelHeight - 10);
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
        
        // Draw indicator label in top-left
        ctx.fillStyle = color;
        ctx.font = 'bold 11px Roboto';
        ctx.textAlign = 'left';
        const valueText = displayValue !== null && displayValue !== undefined ? 
            displayValue.toFixed(5) : '—';
        ctx.fillText(`${indicator.name}`, m.l + 5, panelTop + 14);
        ctx.font = '11px Roboto';
        ctx.fillText(valueText, m.l + 5 + ctx.measureText(indicator.name + ' ').width, panelTop + 14);
        
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
    
    // Store panel info for mouse interactions
    this.separatePanelInfo = {
        top: panelTop,
        bottom: panelBottom,
        height: panelHeight,
        indicators: separateIndicators,
        min: min,
        max: max,
        scaleY: (val) => panelBottom - 5 - ((val - min) / (max - min)) * (panelHeight - 10),
        inverseScaleY: (y) => min + ((panelBottom - 5 - y) / (panelHeight - 10)) * (max - min)
    };
    
    // Draw crosshair value if mouse is in panel
    if (this.mouseY >= panelTop && this.mouseY <= panelBottom && this.mouseX >= m.l && this.mouseX <= this.w - m.r) {
        this.drawSeparatePanelCrosshair(ctx, m, panelTop, panelBottom, panelHeight, separateIndicators, min, max);
    }
    
    ctx.textAlign = 'left'; // Reset
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
        if (document.getElementById('indicator-settings-modal')) {
            console.log('⚠️ Skipping indicator update - modal is open');
            return;
        }
        
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
        
        console.log('📊 Creating indicator items for:', overlayIndicators.length, 'indicators');
        
        for (let i = 0; i < overlayIndicators.length; i++) {
            const indicator = overlayIndicators[i];
            console.log('Creating UI for indicator:', indicator.name);
            const item = document.createElement('div');
            item.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; margin-right: 8px; margin-bottom: 4px; border-radius: 4px; background: rgba(255,255,255,0.05); transition: background 0.2s; pointer-events: auto;';
            
            // Hover effect for the container
            item.onmouseenter = function() {
                item.style.background = 'rgba(255,255,255,0.1)';
            };
            item.onmouseleave = function() {
                item.style.background = 'rgba(255,255,255,0.05)';
            };
            
            // Color indicator
            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = 'width: 12px; height: 2px; background: ' + displayColor + '; border-radius: 1px; flex-shrink: 0;';
            item.appendChild(colorBox);
            
            // Name (NOT clickable - use Edit link to edit)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            nameSpan.style.cssText = 'color: #d1d4dc; font-size: 12px; font-weight: 500; user-select: none; pointer-events: auto;';
            nameSpan.title = indicator.name;
            
            item.appendChild(nameSpan);
            
            // Settings button (three dots menu) - Always visible
            const settingsBtn = document.createElement('span');
            settingsBtn.textContent = '•••';
            settingsBtn.style.cssText = 'cursor: pointer; color: #787b86; margin-left: 6px; font-size: 14px; font-weight: bold; padding: 0 4px; border-radius: 3px; transition: all 0.2s; display: inline-block; line-height: 1;';
            settingsBtn.title = 'Click to edit settings';
            settingsBtn.onmouseenter = function() {
                settingsBtn.style.color = '#ffffff';
                settingsBtn.style.background = '#2962ff';
                settingsBtn.style.transform = 'scale(1.1)';
            };
            settingsBtn.onmouseleave = function() {
                settingsBtn.style.color = '#787b86';
                settingsBtn.style.background = 'transparent';
                settingsBtn.style.transform = 'scale(1)';
            };
            item.appendChild(settingsBtn);
            console.log('Settings button added:', settingsBtn.textContent);
            
            // Remove button (X icon)
            const removeBtn = document.createElement('span');
            removeBtn.innerHTML = '×';
            removeBtn.style.cssText = 'cursor: pointer; opacity: 0.6; font-size: 18px; font-weight: bold; color: #f23645; margin-left: 4px; transition: all 0.2s; line-height: 1; display: flex; align-items: center; padding: 0 2px; pointer-events: auto;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.opacity = '1';
                removeBtn.style.transform = 'scale(1.2)';
            };
            removeBtn.onmouseleave = function() {
                removeBtn.style.opacity = '0.6';
                removeBtn.style.transform = 'scale(1)';
            };
            item.appendChild(removeBtn);
            
            // Click handlers
            const self = this;
            const id = indicator.id;
            
            // Only the settings button is clickable for editing
            settingsBtn.onclick = function(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                
                console.log(`⚙️ Settings button clicked for "${indicator.name}"`);
                
                // Call the settings function directly without flags
                self.showIndicatorSettings(id);
                
                return false;
            };
            removeBtn.onclick = function(e) {
                e.stopPropagation();
                console.log(`❌ Remove button clicked for "${indicator.name}"`);
                self.removeIndicator(id);
            };
            
            div.appendChild(item);
            console.log('Final item HTML:', item.innerHTML);
            console.log('Item children count:', item.children.length);
        }
    };
    
    Chart.prototype.showIndicatorSettings = function(id) {
        try {
            console.log('🔧 Opening settings for indicator:', id);
            
            // First, let's test with a simple alert to make sure the function is called
            const indicator = this.indicators.active.find(function(ind) {
                return ind.id === id;
            });
            
            if (!indicator) {
                console.error('❌ Indicator not found:', id);
                alert('Error: Indicator not found');
                return;
            }
            
            console.log('📊 Found indicator:', indicator);
            console.log('📊 Opening edit panel for:', indicator.name);
        
        // Check if modal already exists
        const existingModal = document.getElementById('indicator-settings-modal');
        if (existingModal) {
            console.log('⚠️ Removing existing modal');
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
            console.log('🔒 Close button clicked');
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
            console.log('❌ Cancel button clicked');
            modal.remove();
        };
        
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply Changes';
        applyBtn.style.cssText = 'padding: 10px 20px; background: #2962ff; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;';
        applyBtn.onmouseenter = function() { applyBtn.style.background = '#1e53e5'; };
        applyBtn.onmouseleave = function() { applyBtn.style.background = '#2962ff'; };
        
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
            
            console.log('✅ Applying changes:', newParams);
            self.updateIndicator(id, newParams);
            modal.remove();
        };
        
        buttons.appendChild(cancelBtn);
        buttons.appendChild(applyBtn);
        dialog.appendChild(buttons);
        
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        console.log('✅ Modal added to document body');
        console.log('Modal element:', modal);
        console.log('Dialog element:', dialog);
        
        // Verify modal is visible
        const modalRect = modal.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        console.log('Modal dimensions:', modalRect.width, 'x', modalRect.height);
        console.log('Dialog dimensions:', dialogRect.width, 'x', dialogRect.height);
        console.log('Modal computed style display:', window.getComputedStyle(modal).display);
        console.log('Dialog computed style display:', window.getComputedStyle(dialog).display);
        
        // Force focus to the modal
        modal.focus();
        
        // Close on background click
        modal.onclick = function(e) {
            if (e.target === modal) {
                console.log('🔒 Background clicked, closing modal');
                modal.remove();
            }
        };
        } catch (error) {
            console.error('❌ Error showing indicator settings:', error);
            alert('Error opening indicator settings: ' + error.message);
        }
    };
    
    // Mark as loaded
    window.INDICATORS_MODULE_LOADED = true;
    console.log('✅ Full Indicators Module Loaded Successfully');
    
    } // End of attachIndicatorMethods
    
    // Start initialization
    initIndicatorsModule();
    
})(window);