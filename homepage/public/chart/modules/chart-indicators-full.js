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

        (function ensureIndLegendHoverCss() {
            if (typeof document === 'undefined' || document.getElementById('talaria-ind-legend-hover-css')) return;
            const s = document.createElement('style');
            s.id = 'talaria-ind-legend-hover-css';
            s.textContent = [
                '@media (hover: hover) and (pointer: fine) {',
                '  .talaria-ind-legend-row .talaria-ind-actions {',
                '    opacity: 0;',
                '    transition: opacity 0.12s ease;',
                '    pointer-events: none;',
                '  }',
                '  .talaria-ind-legend-row:hover .talaria-ind-actions {',
                '    opacity: 1;',
                '    pointer-events: auto;',
                '  }',
                '}'
            ].join('\n');
            document.head.appendChild(s);
        })();

    /** TradingView-style legend chips — matches indicator-ui.js TALARIA_* (window set when indicator-ui loads) */
    function getTalariaChipStyles() {
        const w = global;
        const fallbackChip =
            'display:flex;align-items:center;gap:6px;width:fit-content;max-width:100%;align-self:flex-start;min-width:0;min-height:20px;box-sizing:border-box;' +
            'padding:1px 2px 1px 0;margin:0;border-radius:2px;line-height:1.2;' +
            'border:none;background:transparent;' +
            'transform:translateZ(0);-webkit-transform:translateZ(0);' +
            'cursor:default;vertical-align:middle;' +
            'font-family:-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif;';
        return {
            chipCss: w.TALARIA_INDICATOR_CHIP_CSS || fallbackChip,
            bg: w.TALARIA_INDICATOR_CHIP_BG || 'transparent',
            bgHover: w.TALARIA_INDICATOR_CHIP_BG_HOVER || 'rgba(255, 255, 255, 0.06)',
            borderHover: w.TALARIA_INDICATOR_CHIP_BORDER_HOVER || 'transparent',
            borderDefault: w.TALARIA_IND_CHIP_BORDER || 'transparent',
            colorStrip: w.TALARIA_INDICATOR_COLOR_STRIP || function(c) {
                return 'display:inline-block;width:2px;height:12px;border-radius:1px;background:' + c + ';flex-shrink:0;';
            }
        };
    }

    function getTalariaActionBtnStyle() {
        return 'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:2px;cursor:default;transition:background .15s,color .15s;flex-shrink:0;';
    }

    const MAX_ACTIVE_INDICATORS = 10;

    function emitIndicatorsChanged(chart, action, indicator) {
        if (typeof global === 'undefined' || typeof global.dispatchEvent !== 'function') return;
        try {
            global.dispatchEvent(new CustomEvent('indicatorsChanged', {
                detail: {
                    chart: chart,
                    action: action,
                    indicator: indicator || null,
                    indicators: chart && chart.indicators && Array.isArray(chart.indicators.active)
                        ? chart.indicators.active.slice()
                        : []
                }
            }));
        } catch (_) {}
    }

    /** Framed color tile — matches V9 sidebar buttons; prefers indicator-ui factory when loaded. */
    function createIndLegendSwatch(displayColor) {
        const w = global;
        if (typeof w.createIndicatorLegendSwatch === 'function') {
            return w.createIndicatorLegendSwatch(displayColor);
        }
        if (typeof document !== 'undefined' && !document.getElementById('talaria-ind-swatch-css')) {
            const st = document.createElement('style');
            st.id = 'talaria-ind-swatch-css';
            st.textContent = [
                '.talaria-ind-swatch {',
                '  display: inline-flex; align-items: center; justify-content: center;',
                '  width: 20px; height: 20px; min-width: 20px; min-height: 20px;',
                '  box-sizing: border-box; flex-shrink: 0;',
                '  border: 1px solid rgba(140, 160, 255, 0.22); border-radius: 4px;',
                '  background: rgba(18, 22, 34, 0.92);',
                '  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);',
                '  transition: border-color 0.12s ease, box-shadow 0.12s ease;',
                '}',
                '.talaria-ind-legend-row:hover .talaria-ind-swatch {',
                '  border-color: rgba(140, 160, 255, 0.38);',
                '  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 0 0 1px rgba(74, 106, 255, 0.12);',
                '}',
                '.talaria-ind-swatch-fill {',
                '  display: block; width: 3px; height: 14px; border-radius: 2px; flex-shrink: 0; position: relative;',
                '}',
                'body.light-mode .talaria-ind-swatch {',
                '  background: rgba(248, 249, 252, 0.96); border-color: rgba(100, 110, 140, 0.28);',
                '}',
                'body.light-mode .talaria-ind-legend-row:hover .talaria-ind-swatch {',
                '  border-color: rgba(74, 106, 255, 0.42);',
                '}'
            ].join('\n');
            document.head.appendChild(st);
        }
        const wrap = document.createElement('span');
        wrap.className = 'talaria-ind-swatch';
        const fill = document.createElement('span');
        fill.className = 'talaria-ind-swatch-fill';
        if (typeof w.applyIndicatorSwatchRailGlow === 'function') {
            w.applyIndicatorSwatchRailGlow(fill, displayColor);
        } else {
            const c = displayColor || '#2962ff';
            fill.style.background = 'linear-gradient(180deg, transparent, ' + c + ', transparent)';
            fill.style.boxShadow = '0 0 4px ' + c;
            fill.style.filter = 'drop-shadow(0 0 5px ' + c + ')';
        }
        wrap.appendChild(fill);
        return wrap;
    }
    
    // ===== Calculation Functions =====

    function resolveOhlcSourceValue(candle, source) {
        if (!candle) return NaN;
        const o = candle.o != null ? candle.o : candle.open;
        const h = candle.h != null ? candle.h : candle.high;
        const l = candle.l != null ? candle.l : candle.low;
        const c = candle.c != null ? candle.c : candle.close;
        switch (String(source || 'close').toLowerCase()) {
            case 'open': return o;
            case 'high': return h;
            case 'low': return l;
            case 'close': return c;
            case 'hl2': return (h + l) / 2;
            case 'hlc3': return (h + l + c) / 3;
            case 'ohlc4': return (o + h + l + c) / 4;
            default: return c;
        }
    }
    
    // Simple Moving Average
    function calculateSMA(data, period, source) {
        period = period || 20;
        source = source || 'close';
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                let sum = 0;
                let ok = true;
                for (let j = 0; j < period; j++) {
                    const v = resolveOhlcSourceValue(data[i - j], source);
                    if (!Number.isFinite(v)) { ok = false; break; }
                    sum += v;
                }
                result.push(ok ? sum / period : null);
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

    /** Weighted MA on a nullable numeric series (null until full window). */
    function rollingWmaNullable(arr, period) {
        const p = Math.max(2, period | 0);
        const denom = (p * (p + 1)) / 2;
        const out = arr.map(function() { return null; });
        for (let i = 0; i < arr.length; i++) {
            if (i < p - 1) continue;
            let sum = 0;
            let ok = true;
            for (let j = 0; j < p; j++) {
                const v = arr[i - j];
                if (v === null || v === undefined || isNaN(v)) { ok = false; break; }
                sum += v * (p - j);
            }
            if (ok) out[i] = sum / denom;
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
        
        // Calendar day in NY (fixed offset, same basis as toNYTime) — one NY Open line per day
        const nyDayKey = (date) => {
            const shifted = new Date(date.getTime() + nyOffset * 3600000);
            const y = shifted.getUTCFullYear();
            const mo = shifted.getUTCMonth() + 1;
            const d = shifted.getUTCDate();
            return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
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
        
        // One session per bar (priority) avoids stacked semi-transparent fills when windows overlap.
        const sessionOrder = ['cbdr', 'asia', 'london', 'nyam', 'londonClose'];
        const activeBoxes = {};
        let lastDate = null;
        
        for (let i = 0; i < data.length; i++) {
            const date = new Date(data[i].t);
            const nyTime = toNYTime(date);
            
            // First bar of each NY calendar day: NY Open (avoid firing on every bar in the 23:xx hour)
            if (params.showNYMidnight !== false && lastDate && nyDayKey(lastDate) !== nyDayKey(date)) {
                result.nyMidnight.push({
                    index: i,
                    price: data[i].o,
                    time: data[i].t
                });
            }
            
            let currentKey = null;
            for (let si = 0; si < sessionOrder.length; si++) {
                const key = sessionOrder[si];
                const session = sessionDefs[key];
                if (!session.enabled) continue;
                if (isInSession(nyTime.decimal, session)) {
                    currentKey = key;
                    break;
                }
            }
            
            sessionOrder.forEach(function(key) {
                const session = sessionDefs[key];
                if (!session.enabled) return;
                if (key === currentKey) {
                    if (!activeBoxes[key]) {
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
                        activeBoxes[key].high = Math.max(activeBoxes[key].high, data[i].h);
                        activeBoxes[key].low = Math.min(activeBoxes[key].low, data[i].l);
                        activeBoxes[key].endIndex = i;
                    }
                } else if (activeBoxes[key]) {
                    const box = activeBoxes[key];
                    box.endTime = data[i - 1] ? data[i - 1].t : data[i].t;
                    box.range = box.high - box.low;
                    result.boxes.push({...box});
                    delete activeBoxes[key];
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
        
        // NY Open horizontal line spans until the bar before the next NY day (not only to chart edge)
        for (let j = 0; j < result.nyMidnight.length; j++) {
            const next = result.nyMidnight[j + 1];
            result.nyMidnight[j].endIndex = next ? next.index - 1 : data.length - 1;
        }
        
        // Store params for deviations
        result.showDeviations = params.showDeviations || false;
        result.deviationCount = params.deviationCount || 2;
        result.showMidline = params.showMidline !== false;
        result.showBoxInfo = params.showBoxInfo !== false;
        result.boxTransparency = params.boxTransparency !== undefined ? params.boxTransparency : 88;
        result.showNYMidnight = params.showNYMidnight !== false;
        result.nyMidnightColor = params.nyMidnightColor || '#2d62b6';
        
        return result;
    }

    /** Local timezone offset in hours at instant `utcMs` (use per bar for DST correctness). */
    function _ictLocalOffsetHoursAt(utcMs) {
        return -new Date(utcMs).getTimezoneOffset() / 60;
    }

    function _ictParseTimeToDec(timeStr) {
        if (!timeStr) return 0;
        const p = String(timeStr).split(':');
        const h = parseInt(p[0], 10) || 0;
        const m = parseInt(p[1], 10) || 0;
        return h + m / 60;
    }

    function _ictPxWidthFromSelect(s) {
        const n = parseInt(String(s || '1').replace(/\D/g, ''), 10);
        return Math.min(5, Math.max(1, n || 1));
    }

    function _ictDashFromStyle(name) {
        if (name === 'Dotted') return [2, 4];
        if (name === 'Dashed') return [7, 5];
        return [];
    }

    function _ictMedianBarMinutes(data) {
        if (!data || data.length < 2) return 60;
        const n = Math.min(data.length - 1, 200);
        let acc = 0;
        let c = 0;
        for (let i = data.length - n; i < data.length; i++) {
            if (i <= 0) continue;
            const d = data[i].t - data[i - 1].t;
            if (d > 0 && d < 86400000) {
                acc += d;
                c++;
            }
        }
        if (!c) return 60;
        return (acc / c) / 60000;
    }

    function _ictWallFromUtc(utcMs, offsetHours) {
        const adj = utcMs + offsetHours * 3600000;
        const d = new Date(adj);
        const y = d.getUTCFullYear();
        const M = d.getUTCMonth() + 1;
        const D = d.getUTCDate();
        const h = d.getUTCHours();
        const m = d.getUTCMinutes();
        const dec = h + m / 60;
        const dayKey = y + '-' + (M < 10 ? '0' : '') + M + '-' + (D < 10 ? '0' : '') + D;
        return { y: y, M: M, D: D, hour: h, minute: m, dec: dec, dayKey: dayKey, dow: d.getUTCDay() };
    }

    function _ictIsoWeekKey(y, M, D) {
        const t = Date.UTC(y, M - 1, D);
        const wd = new Date(t).getUTCDay() || 7;
        const t2 = t + (4 - wd) * 86400000;
        const y2 = new Date(t2).getUTCFullYear();
        const d0 = Date.UTC(y2, 0, 1);
        const wk = Math.ceil(((t2 - d0) / 86400000 + 1) / 7);
        return y2 + '-W' + (wk < 10 ? '0' : '') + wk;
    }

    function _ictInDecSession(dec, startDec, endDec) {
        if (startDec <= endDec) {
            return dec >= startDec && dec < endDec;
        }
        return dec >= startDec || dec < endDec;
    }

    function _ictDevCountFromInput(s) {
        if (s === '1 SD') return 1;
        if (s === '3 SD') return 3;
        if (s === '4 SD') return 4;
        return 2;
    }

    /**
     * ICT Everything — session strips, CBDR/Asia/FLOUT range boxes, verticals, opening lines (Pine-aligned inputs).
     * Tables (bias/notes/range stats) and Auto_Select deletion logic are not drawn on canvas yet.
     */
    function calculateIctEverything(data, indicator) {
        const empty = {
            dom: false,
            sessionStrips: [],
            boxes: [],
            boxDeviations: [],
            verticals: [],
            horizontals: [],
            dowMarks: [],
            showMidline: false,
            showBoxInfo: true,
            boxTransparency: 88,
            showDeviations: false,
            deviationCount: 2,
            showNYMidnight: false,
            _ictMeta: {}
        };
        if (!data || data.length === 0) return empty;

        const P = Object.assign({}, indicator.params || {}, indicator.style || {});
        function wallAt(utcMs) {
            return _ictWallFromUtc(utcMs, _ictLocalOffsetHoursAt(utcMs));
        }
        const barMin = _ictMedianBarMinutes(data);
        const maxIv = P.inputMaxInterval != null ? +P.inputMaxInterval : 31;
        const dom = barMin <= maxIv && barMin < 18 * 60;
        if (!dom) {
            return Object.assign(empty, { dom: false });
        }

        const n = data.length;
        const lastMs = data[n - 1].t;
        const lastWall = wallAt(lastMs);
        const lastDayKey = lastWall.dayKey;
        const lastWeekKey = _ictIsoWeekKey(lastWall.y, lastWall.M, lastWall.D);

        function passesTimeFilter(dayKey, weekKey, barT) {
            if (P.ShowTSO) {
                return dayKey === lastDayKey;
            }
            if (P.ShowTWO) {
                return weekKey === lastWeekKey;
            }
            if (P.SL4W) {
                if (!barT) return true;
                return barT >= lastMs - 35 * 86400000;
            }
            return true;
        }

        const sessionStrips = new Array(n);
        for (let i = 0; i < n; i++) sessionStrips[i] = [];

        const sessionDefs = [
            { key: 'london', show: P.ShowLondon !== false, start: _ictParseTimeToDec(P.LDNseshStart || '02:00'), end: _ictParseTimeToDec(P.LDNseshEnd || '05:00'), color: P.LSFC || 'rgba(120,123,134,0.12)' },
            { key: 'ny', show: P.ShowNY !== false, start: _ictParseTimeToDec(P.NYseshStart || '07:00'), end: _ictParseTimeToDec(P.NYseshEnd || '10:00'), color: P.NYSFC || 'rgba(120,123,134,0.12)' },
            { key: 'lc', show: P.ShowLC !== false, start: _ictParseTimeToDec(P.LCseshStart || '10:00'), end: _ictParseTimeToDec(P.LCseshEnd || '12:00'), color: P.LCSFC || 'rgba(120,123,134,0.12)' },
            { key: 'pm', show: P.ShowPM !== false, start: _ictParseTimeToDec(P.PMseshStart || '13:00'), end: _ictParseTimeToDec(P.PMseshEnd || '16:00'), color: P.PMSFC || 'rgba(120,123,134,0.12)' },
            { key: 'asia2', show: !!P.ShowAsian, start: _ictParseTimeToDec(P.ASIA2seshStart || '20:00'), end: _ictParseTimeToDec(P.ASIA2seshEnd || '23:59'), color: P.ASFC || 'rgba(120,123,134,0.12)' },
            { key: 'free', show: !!P.ShowFreeSesh && (Math.abs(_ictParseTimeToDec(P.FreeSeshEnd || '00:00') - _ictParseTimeToDec(P.FreeSeshStart || '00:00')) > 1e-3),
                start: _ictParseTimeToDec(P.FreeSeshStart || '00:00'), end: _ictParseTimeToDec(P.FreeSeshEnd || '00:00'), color: P.FSFC || 'rgba(120,123,134,0.12)' }
        ];

        const order = ['london', 'ny', 'lc', 'pm', 'asia2', 'free'];
        const activeRun = {};
        order.forEach(function (k) { activeRun[k] = null; });

        for (let i = 0; i < n; i++) {
            const w = wallAt(data[i].t);
            if (!passesTimeFilter(w.dayKey, _ictIsoWeekKey(w.y, w.M, w.D), data[i].t)) {
                order.forEach(function (key) {
                    if (activeRun[key]) {
                        activeRun[key] = null;
                    }
                });
                continue;
            }
            order.forEach(function (key) {
                const sd = sessionDefs.find(function (s) { return s.key === key; });
                if (!sd || !sd.show) return;
                const inside = _ictInDecSession(w.dec, sd.start, sd.end);
                if (inside) {
                    if (!activeRun[key]) {
                        activeRun[key] = { start: i, color: sd.color };
                    }
                    if (P.ShowSFill) {
                        sessionStrips[i].push({ color: sd.color });
                    }
                } else if (activeRun[key]) {
                    activeRun[key] = null;
                }
            });
        }
        order.forEach(function (key) {
            if (activeRun[key]) {
                activeRun[key] = null;
            }
        });

        const boxes = [];
        const boxDeviations = [];

        function pushRangeBox(kind, startDec, endDec, color, name, useFloutStep) {
            let active = null;
            for (let i = 0; i < n; i++) {
                const w = wallAt(data[i].t);
                if (!passesTimeFilter(w.dayKey, _ictIsoWeekKey(w.y, w.M, w.D), data[i].t)) {
                    if (active) {
                        boxes.push(active);
                        active = null;
                    }
                    continue;
                }
                const inside = _ictInDecSession(w.dec, startDec, endDec);
                if (inside) {
                    if (!active) {
                        active = {
                            type: kind,
                            name: name || kind,
                            color: color || '#787b86',
                            startIndex: i,
                            endIndex: i,
                            high: data[i].h,
                            low: data[i].l,
                            useFloutStep: !!useFloutStep
                        };
                    } else {
                        active.high = Math.max(active.high, data[i].h);
                        active.low = Math.min(active.low, data[i].l);
                        active.endIndex = i;
                    }
                } else if (active) {
                    active.range = active.high - active.low;
                    boxes.push(active);
                    active = null;
                }
            }
            if (active) {
                active.range = active.high - active.low;
                boxes.push(active);
            }
        }

        if (P.ShowCBDR !== false) {
            pushRangeBox('cbdr', _ictParseTimeToDec('16:00'), _ictParseTimeToDec('20:00'), P.CBDRBoxCol, P.txt0 || 'CBDR', false);
        }
        if (P.ShowASIA !== false) {
            pushRangeBox('asiaR', 20, 24, P.ASIABoxCol, P.txt1 || 'ASIA', false);
        }
        if (P.ShowFLOUT) {
            pushRangeBox('flout', 16, 24, P.FLOUTBoxCol, P.txt7 || 'FLOUT', true);
        }

        const verticals = [];
        const pushVline = function (idx, color, dashName, lwName) {
            if (idx < 0 || idx >= n) return;
            verticals.push({
                index: idx,
                color: color || '#787b86',
                dash: _ictDashFromStyle(dashName),
                lw: _ictPxWidthFromSelect(lwName)
            });
        };
        let prevWall = null;
        for (let i = 0; i < n; i++) {
            const w = wallAt(data[i].t);
            if (!passesTimeFilter(w.dayKey, _ictIsoWeekKey(w.y, w.M, w.D), data[i].t)) {
                prevWall = w;
                continue;
            }
            if (prevWall) {
                if (P.ShowMOP !== false && w.dayKey !== prevWall.dayKey) {
                    pushVline(i, P.MOPColor, P.Midnight_Open_LS, P.Midnight_Open_LW);
                }
                if (w.dayKey === prevWall.dayKey) {
                    const cross = function (targetDec, color, dashN, lwN) {
                        if (prevWall.dec < targetDec && w.dec >= targetDec) {
                            pushVline(i, color, dashN, lwN);
                        }
                    };
                    if (P.ShowLOP) cross(3, P.LOPColor, P.london_Open_LS, P.London_Open_LW);
                    if (P.ShowNYOP !== false) cross(8.5, P.NYOPColor, P.NY_Open_LS, P.NY_Open_LW);
                    if (P.ShowEOP) cross(9.5, P.EOPColor, P.Equities_Open_LS, P.Equities_Open_LW);
                }
            }
            prevWall = w;
        }

        const horizontals = [];
        const devCount = _ictDevCountFromInput(P.DevInput);
        const devDir = P.DevDirection || 'Both';
        const showDev = !!P.ShowDev;

        boxes.forEach(function (box) {
            box.range = box.high - box.low;
            if (!box.range || box.range <= 0) return;
            const useFlout = box.useFloutStep;
            const allowPos = devDir !== 'Downside Only';
            const allowNeg = devDir !== 'Upside Only';
            const mults = [];
            if (useFlout) {
                for (let x = 0.5; x <= devCount; x += 0.5) mults.push(x);
            } else {
                for (let x = 1; x <= devCount; x++) mults.push(x);
            }
            if (showDev) {
                mults.forEach(function (mult) {
                    if (allowPos) {
                        const hi = box.high + box.range * mult;
                        boxDeviations.push({ startIndex: box.startIndex, endIndex: box.endIndex, price: hi, color: P.DevLNCol, dash: _ictDashFromStyle(P.DEVLS), lw: _ictPxWidthFromSelect(P.i_DEVLW) });
                    }
                    if (allowNeg) {
                        const lo = box.low - box.range * mult;
                        boxDeviations.push({ startIndex: box.startIndex, endIndex: box.endIndex, price: lo, color: P.DevLNCol, dash: _ictDashFromStyle(P.DEVLS), lw: _ictPxWidthFromSelect(P.i_DEVLW) });
                    }
                });
            }
        });

        let openMidnight = null;
        midStart = null;
        for (let i = 0; i < n; i++) {
            const w = wallAt(data[i].t);
            const prev = i > 0 ? wallAt(data[i - 1].t) : null;
            const newDay = !prev || prev.dayKey !== w.dayKey;
            if (newDay) {
                if (P.ShowMOPP !== false && openMidnight != null && midStart != null) {
                    horizontals.push({
                        startIndex: midStart,
                        endIndex: Math.max(midStart, i - 1),
                        price: openMidnight,
                        color: P.MOPColP,
                        dash: _ictDashFromStyle(P.MOPLS),
                        lw: _ictPxWidthFromSelect(P.i_MOPLW),
                        label: P.txt13 || 'MIDNIGHT',
                        showLabel: P.ShowLabel !== false
                    });
                }
                openMidnight = data[i].o;
                midStart = i;
            } else if (openMidnight != null) {
                openMidnight = Math.max(openMidnight, data[i].o);
            }
        }
        if (P.ShowMOPP !== false && openMidnight != null && midStart != null) {
            horizontals.push({
                startIndex: midStart,
                endIndex: n - 1,
                price: openMidnight,
                color: P.MOPColP,
                dash: _ictDashFromStyle(P.MOPLS),
                lw: _ictPxWidthFromSelect(P.i_MOPLW),
                label: P.txt13 || 'MIDNIGHT',
                showLabel: P.ShowLabel !== false
            });
        }

        function pushOpenAtClock(hour, minute, enabled, color, dashS, lwS, label) {
            if (!enabled) return;
            const target = hour + minute / 60;
            let prevW = wallAt(data[0].t);
            const seenDay = {};
            for (let i = 1; i < n; i++) {
                const w = wallAt(data[i].t);
                if (!passesTimeFilter(w.dayKey, _ictIsoWeekKey(w.y, w.M, w.D), data[i].t)) {
                    prevW = w;
                    continue;
                }
                if (w.dayKey === prevW.dayKey && prevW.dec < target && w.dec >= target) {
                    const ukey = String(label) + '|' + w.dayKey + '|' + String(hour) + ':' + String(minute);
                    if (seenDay[ukey]) {
                        prevW = w;
                        continue;
                    }
                    seenDay[ukey] = true;
                    horizontals.push({
                        startIndex: i,
                        endIndex: Math.min(n - 1, i + Math.floor(240 / Math.max(barMin, 1))),
                        price: data[i].o,
                        color: color,
                        dash: _ictDashFromStyle(dashS),
                        lw: _ictPxWidthFromSelect(lwS),
                        label: label,
                        showLabel: P.ShowLabel !== false
                    });
                }
                prevW = w;
            }
        }
        pushOpenAtClock(8, 30, !!P.ShowNYOPP, P.NYOPColP, P.NYOPLS, P.i_NYOPLW, P.txt17);
        pushOpenAtClock(9, 30, !!P.ShowEOPP, P.EOPColP, P.EOPLS, P.i_EOPLW, P.txt18);
        pushOpenAtClock(13, 30, !!P.ShowAFTPP, P.AFTOPColP, P.AFTOPLS, P.i_AFTOPLW, P.txt1330);

        const dowMarks = [];
        if (P.showDOW) {
            const ht = P.DOWTime != null ? +P.DOWTime : 12;
            const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const seen = {};
            for (let i = 0; i < n; i++) {
                const w = wallAt(data[i].t);
                if (!passesTimeFilter(w.dayKey, _ictIsoWeekKey(w.y, w.M, w.D), data[i].t)) continue;
                if (w.dow < 1 || w.dow > 5) continue;
                if (w.hour !== ht || w.minute !== 0) continue;
                const key = w.dayKey + '-' + w.dow;
                if (seen[key]) continue;
                seen[key] = true;
                dowMarks.push({ index: i, text: names[w.dow] || '', color: P.i_DOWCol || '#787b86', bottom: (P.DOWLoc_inpt || 'Bottom') === 'Bottom' });
            }
        }

        return {
            dom: true,
            sessionStrips: sessionStrips,
            boxes: boxes,
            boxDeviations: boxDeviations,
            verticals: verticals,
            horizontals: horizontals,
            dowMarks: dowMarks,
            showMidline: false,
            showBoxInfo: true,
            boxTransparency: 88,
            showDeviations: showDev,
            deviationCount: devCount,
            showNYMidnight: false,
            _params: P,
            _barMin: barMin,
            _offH: _ictLocalOffsetHoursAt(lastMs)
        };
    }

    /** Previous UTC calendar day high / low / midpoint (PD reference for premium vs discount). */
    function calculateIctPrevDayPD(data) {
        const n = data.length;
        const upper = new Array(n).fill(null);
        const lower = new Array(n).fill(null);
        const middle = new Array(n).fill(null);
        let curDay = null;
        let dayH = -Infinity;
        let dayL = Infinity;
        let prevH = null;
        let prevL = null;
        for (let i = 0; i < n; i++) {
            const dk = new Date(data[i].t).toISOString().slice(0, 10);
            if (curDay !== dk) {
                if (curDay !== null) {
                    prevH = dayH;
                    prevL = dayL;
                }
                curDay = dk;
                dayH = data[i].h;
                dayL = data[i].l;
            } else {
                dayH = Math.max(dayH, data[i].h);
                dayL = Math.min(dayL, data[i].l);
            }
            if (prevH != null && prevL != null) {
                upper[i] = prevH;
                lower[i] = prevL;
                middle[i] = (prevH + prevL) / 2;
            }
        }
        return { upper: upper, lower: lower, middle: middle };
    }

    function _ictUtcDayMinute(t) {
        const d = new Date(t);
        return d.getUTCHours() * 60 + d.getUTCMinutes();
    }

    function _ictParseHmToMinutes(str) {
        const p = String(str != null ? str : '00:00').split(':');
        return parseInt(p[0], 10) * 60 + parseInt(p[1] || 0, 10);
    }

    function _ictMinuteInSession(m, sm, em) {
        if (sm <= em) {
            return m >= sm && m < em;
        }
        return m >= sm || m < em;
    }

    /**
     * Developing then fixed Asian range per UTC day (default 00:00–09:00 UTC).
     * Before the session: null; during: expanding H/L; after: fixed until midnight.
     */
    function calculateIctAsianRange(data, params) {
        const sm = _ictParseHmToMinutes(params.rangeStart != null ? params.rangeStart : '00:00');
        const em = _ictParseHmToMinutes(params.rangeEnd != null ? params.rangeEnd : '09:00');
        const n = data.length;
        const upper = new Array(n).fill(null);
        const lower = new Array(n).fill(null);
        const middle = new Array(n).fill(null);
        let dayKey = null;
        let accH = -Infinity;
        let accL = Infinity;
        let lockedU = null;
        let lockedL = null;
        let seenAsian = false;
        for (let i = 0; i < n; i++) {
            const dk = new Date(data[i].t).toISOString().slice(0, 10);
            const minute = _ictUtcDayMinute(data[i].t);
            if (dk !== dayKey) {
                dayKey = dk;
                accH = -Infinity;
                accL = Infinity;
                lockedU = null;
                lockedL = null;
                seenAsian = false;
            }
            const inA = _ictMinuteInSession(minute, sm, em);
            if (inA) {
                seenAsian = true;
                accH = accH === -Infinity ? data[i].h : Math.max(accH, data[i].h);
                accL = accL === Infinity ? data[i].l : Math.min(accL, data[i].l);
                upper[i] = accH;
                lower[i] = accL;
            } else if (seenAsian && lockedU === null) {
                lockedU = accH === -Infinity ? data[i].h : accH;
                lockedL = accL === Infinity ? data[i].l : accL;
                upper[i] = lockedU;
                lower[i] = lockedL;
            } else if (lockedU !== null) {
                upper[i] = lockedU;
                lower[i] = lockedL;
            }
            if (upper[i] != null && lower[i] != null) {
                middle[i] = (upper[i] + lower[i]) / 2;
            }
        }
        return { upper: upper, lower: lower, middle: middle };
    }

    /**
     * OTE-style zone: fibLow–fibHigh of the rolling range (lowest low → highest high in lookback).
     * Common defaults 0.62 / 0.79 (context tool, not a trade signal by itself).
     */
    function calculateIctOTE(data, lookback, fibLo, fibHi) {
        const lb = lookback != null && !isNaN(lookback) ? lookback : 24;
        const L = Math.max(5, Math.floor(lb));
        const lo = fibLo != null && !isNaN(fibLo) ? fibLo : 0.62;
        const hi = fibHi != null && !isNaN(fibHi) ? fibHi : 0.79;
        const n = data.length;
        const upper = new Array(n).fill(null);
        const lower = new Array(n).fill(null);
        const middle = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            if (i < L - 1) {
                continue;
            }
            let sl = Infinity;
            let sh = -Infinity;
            for (let j = 0; j < L; j++) {
                const k = i - j;
                sl = Math.min(sl, data[k].l);
                sh = Math.max(sh, data[k].h);
            }
            const r = sh - sl;
            if (r <= 0) {
                continue;
            }
            lower[i] = sl + lo * r;
            upper[i] = sl + hi * r;
            middle[i] = (lower[i] + upper[i]) / 2;
        }
        return { upper: upper, lower: lower, middle: middle };
    }

    /** 3-candle fair value gaps; extends each box by extendBars for visibility. */
    function calculateFairValueGaps(data, params) {
        const extendBars = params.extendBars != null ? params.extendBars : 80;
        const maxBoxes = Math.min(400, Math.max(8, params.maxBoxes != null ? params.maxBoxes : 120));
        const minGapPct = params.minGapPct != null ? params.minGapPct : 0;
        const boxes = [];
        const n = data.length;
        for (let i = 2; i < n; i++) {
            if (data[i].l > data[i - 2].h) {
                const gap = data[i].l - data[i - 2].h;
                const ref = Math.abs(data[i].c) || 1;
                if (minGapPct > 0 && gap < ref * minGapPct) {
                    continue;
                }
                boxes.push({
                    startIndex: i - 2,
                    endIndex: Math.min(n - 1, i + extendBars),
                    top: data[i].l,
                    bottom: data[i - 2].h,
                    bullish: true
                });
            }
            if (data[i].h < data[i - 2].l) {
                const gap = data[i - 2].l - data[i].h;
                const ref = Math.abs(data[i].c) || 1;
                if (minGapPct > 0 && gap < ref * minGapPct) {
                    continue;
                }
                boxes.push({
                    startIndex: i - 2,
                    endIndex: Math.min(n - 1, i + extendBars),
                    top: data[i - 2].l,
                    bottom: data[i].h,
                    bullish: false
                });
            }
        }
        return { boxes: boxes.length > maxBoxes ? boxes.slice(-maxBoxes) : boxes };
    }

    /**
     * Premium/discount vs previous completed session window (UTC), e.g. NY 13:00–21:00.
     * Looks back up to maxLookbackDays for the last day that had bars in that session (weekends).
     */
    function calculateIctSessionPrevDayPD(data, params) {
        const sm = _ictParseHmToMinutes(params.rangeStart != null ? params.rangeStart : '13:00');
        const em = _ictParseHmToMinutes(params.rangeEnd != null ? params.rangeEnd : '21:00');
        const maxLookback = Math.min(14, Math.max(1, Math.floor(params.maxLookbackDays != null ? params.maxLookbackDays : 6)));
        const n = data.length;
        const dayStats = {};
        for (let i = 0; i < n; i++) {
            const dk = new Date(data[i].t).toISOString().slice(0, 10);
            const minute = _ictUtcDayMinute(data[i].t);
            if (!_ictMinuteInSession(minute, sm, em)) {
                continue;
            }
            if (!dayStats[dk]) {
                dayStats[dk] = { sh: -Infinity, sl: Infinity, has: false };
            }
            const s = dayStats[dk];
            s.sh = Math.max(s.sh, data[i].h);
            s.sl = Math.min(s.sl, data[i].l);
            s.has = true;
        }
        function findPrevSessionStats(dk) {
            let d = new Date(dk + 'T12:00:00.000Z');
            for (let b = 0; b < maxLookback; b++) {
                d.setUTCDate(d.getUTCDate() - 1);
                const key = d.toISOString().slice(0, 10);
                const st = dayStats[key];
                if (st && st.has && st.sh > -Infinity && st.sl < Infinity) {
                    return st;
                }
            }
            return null;
        }
        const upper = new Array(n).fill(null);
        const lower = new Array(n).fill(null);
        const middle = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            const dk = new Date(data[i].t).toISOString().slice(0, 10);
            const st = findPrevSessionStats(dk);
            if (st) {
                upper[i] = st.sh;
                lower[i] = st.sl;
                middle[i] = (st.sh + st.sl) / 2;
            }
        }
        return { upper: upper, lower: lower, middle: middle };
    }

    function _ictSwingHigh(data, i, w) {
        const h = data[i].h;
        for (let k = 1; k <= w; k++) {
            if (data[i - k].h >= h || data[i + k].h >= h) {
                return false;
            }
        }
        return true;
    }

    function _ictSwingLow(data, i, w) {
        const low = data[i].l;
        for (let k = 1; k <= w; k++) {
            if (data[i - k].l <= low || data[i + k].l <= low) {
                return false;
            }
        }
        return true;
    }

    function _ictClusterPrices1D(points, tolPct, minTouches) {
        if (points.length < minTouches) {
            return [];
        }
        const sorted = points.slice().sort(function(a, b) {
            return a.price - b.price;
        });
        const clusters = [];
        let cur = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const mean = cur.reduce(function(s, p) {
                return s + p.price;
            }, 0) / cur.length;
            const tol = Math.max(mean * (tolPct / 100), mean * 1e-10);
            if (Math.abs(sorted[i].price - mean) <= tol) {
                cur.push(sorted[i]);
            } else {
                if (cur.length >= minTouches) {
                    clusters.push(cur);
                }
                cur = [sorted[i]];
            }
        }
        if (cur.length >= minTouches) {
            clusters.push(cur);
        }
        return clusters;
    }

    /**
     * Equal highs / equal lows from clustered swing points (fractal width w each side).
     */
    function calculateLiquidityEqualLevels(data, params) {
        const w = Math.max(1, Math.floor(params.fractalWidth != null ? params.fractalWidth : 2));
        const tolPct = params.tolerancePct != null ? params.tolerancePct : 0.03;
        const minTouches = Math.max(2, Math.floor(params.minTouches != null ? params.minTouches : 2));
        const maxSeg = Math.min(200, Math.max(8, params.maxSegments != null ? params.maxSegments : 80));
        const extendBars = Math.max(0, Math.floor(params.extendBars != null ? params.extendBars : 12));
        const n = data.length;
        const highs = [];
        const lows = [];
        let i = w;
        for (; i < n - w; i++) {
            if (_ictSwingHigh(data, i, w)) {
                highs.push({ idx: i, price: data[i].h });
            }
            if (_ictSwingLow(data, i, w)) {
                lows.push({ idx: i, price: data[i].l });
            }
        }
        const ch = _ictClusterPrices1D(highs, tolPct, minTouches);
        const cl = _ictClusterPrices1D(lows, tolPct, minTouches);
        const segments = [];
        ch.forEach(function(cluster) {
            const idxs = cluster.map(function(p) {
                return p.idx;
            });
            const i0 = Math.min.apply(null, idxs);
            const i1 = Math.min(n - 1, Math.max.apply(null, idxs) + extendBars);
            const price = cluster.reduce(function(s, p) {
                return s + p.price;
            }, 0) / cluster.length;
            segments.push({ kind: 'high', price: price, startIndex: i0, endIndex: i1 });
        });
        cl.forEach(function(cluster) {
            const idxs = cluster.map(function(p) {
                return p.idx;
            });
            const i0 = Math.min.apply(null, idxs);
            const i1 = Math.min(n - 1, Math.max.apply(null, idxs) + extendBars);
            const price = cluster.reduce(function(s, p) {
                return s + p.price;
            }, 0) / cluster.length;
            segments.push({ kind: 'low', price: price, startIndex: i0, endIndex: i1 });
        });
        segments.sort(function(a, b) {
            return a.startIndex - b.startIndex;
        });
        return { segments: segments.length > maxSeg ? segments.slice(0, maxSeg) : segments };
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

    /** Extended forex session backgrounds (UTC). Reuses drawSessions. */
    function calculateSessionsPlus(data, params) {
        const parseTime = function(timeStr) {
            if (!timeStr) return 0;
            const parts = String(timeStr).split(':');
            return parseInt(parts[0], 10) + (parseInt(parts[1] || 0, 10) / 60);
        };
        const isInSession = function(hour, minute, session) {
            const timeDecimal = hour + (minute / 60);
            if (session.start <= session.end) {
                return timeDecimal >= session.start && timeDecimal < session.end;
            }
            return timeDecimal >= session.start || timeDecimal < session.end;
        };
        const defs = [];
        if (params.showSydney !== false) {
            defs.push({
                key: 'sydney',
                start: parseTime(params.sydneyStart != null ? params.sydneyStart : '21:00'),
                end: parseTime(params.sydneyEnd != null ? params.sydneyEnd : '06:00'),
                color: params.sydneyColor || 'rgba(156, 39, 176, 0.14)'
            });
        }
        if (params.showTokyo !== false) {
            defs.push({
                key: 'tokyo',
                start: parseTime(params.tokyoStart != null ? params.tokyoStart : '00:00'),
                end: parseTime(params.tokyoEnd != null ? params.tokyoEnd : '09:00'),
                color: params.tokyoColor || 'rgba(255, 152, 0, 0.14)'
            });
        }
        if (params.showAsian !== false) {
            defs.push({
                key: 'asian',
                start: parseTime(params.asianStart != null ? params.asianStart : '00:00'),
                end: parseTime(params.asianEnd != null ? params.asianEnd : '09:00'),
                color: params.asianColor || 'rgba(255, 193, 7, 0.12)'
            });
        }
        if (params.showFrankfurt !== false) {
            defs.push({
                key: 'frankfurt',
                start: parseTime(params.frankfurtStart != null ? params.frankfurtStart : '07:00'),
                end: parseTime(params.frankfurtEnd != null ? params.frankfurtEnd : '10:00'),
                color: params.frankfurtColor || 'rgba(3, 169, 244, 0.14)'
            });
        }
        if (params.showLondon !== false) {
            defs.push({
                key: 'london',
                start: parseTime(params.londonStart != null ? params.londonStart : '08:00'),
                end: parseTime(params.londonEnd != null ? params.londonEnd : '16:00'),
                color: params.londonColor || 'rgba(33, 150, 243, 0.14)'
            });
        }
        if (params.showNewYork !== false) {
            defs.push({
                key: 'newyork',
                start: parseTime(params.newYorkStart != null ? params.newYorkStart : '13:00'),
                end: parseTime(params.newYorkEnd != null ? params.newYorkEnd : '21:00'),
                color: params.newYorkColor || 'rgba(76, 175, 80, 0.14)'
            });
        }
        const sessions = [];
        for (let i = 0; i < data.length; i++) {
            const date = new Date(data[i].t);
            const hour = date.getUTCHours();
            const minute = date.getUTCMinutes();
            const candleSessions = [];
            for (let d = 0; d < defs.length; d++) {
                const s = defs[d];
                if (isInSession(hour, minute, s)) {
                    candleSessions.push({ type: s.key, color: s.color });
                }
            }
            sessions.push(candleSessions);
        }
        return sessions;
    }

    /** First N minutes of each UTC day — high/low channel (opening range). */
    function calculateOpeningRange(data, minutes) {
        const upper = [];
        const lower = [];
        const m = Math.max(1, Math.floor(minutes));
        let dayKey = null;
        let orH = null;
        let orL = null;
        let windowEnd = null;
        const dayStr = function(t) {
            return new Date(t).toISOString().slice(0, 10);
        };
        for (let i = 0; i < data.length; i++) {
            const dk = dayStr(data[i].t);
            if (dk !== dayKey) {
                dayKey = dk;
                const t0 = data[i].t;
                windowEnd = t0 + m * 60 * 1000;
                orH = data[i].h;
                orL = data[i].l;
            }
            if (data[i].t <= windowEnd) {
                orH = Math.max(orH, data[i].h);
                orL = Math.min(orL, data[i].l);
            }
            upper.push(orH);
            lower.push(orL);
        }
        const middle = upper.map(function(u, i) {
            return (u + lower[i]) / 2;
        });
        return { upper: upper, lower: lower, middle: middle };
    }

    function calculateSupertrend(data, period, multiplier) {
        const mult = multiplier != null ? multiplier : 3;
        const p = Math.max(1, period || 10);
        const atr = calculateATR(data, p);
        const n = data.length;
        const finalUpper = new Array(n).fill(null);
        const finalLower = new Array(n).fill(null);
        const line = new Array(n).fill(null);
        const direction = new Array(n).fill(1);
        for (let i = 0; i < n; i++) {
            const hl2 = (data[i].h + data[i].l) / 2;
            const a = atr[i];
            if (a == null || isNaN(a)) continue;
            const basicUpper = hl2 + mult * a;
            const basicLower = hl2 - mult * a;
            if (i === 0) {
                finalUpper[i] = basicUpper;
                finalLower[i] = basicLower;
                line[i] = finalLower[i];
                direction[i] = 1;
                continue;
            }
            const pU = finalUpper[i - 1];
            const pL = finalLower[i - 1];
            const pC = data[i - 1].c;
            finalUpper[i] = (basicUpper < pU || pC > pU) ? basicUpper : pU;
            finalLower[i] = (basicLower > pL || pC < pL) ? basicLower : pL;
            if (direction[i - 1] === 1) {
                if (data[i].c < finalLower[i - 1]) {
                    direction[i] = -1;
                    line[i] = finalUpper[i];
                } else {
                    direction[i] = 1;
                    line[i] = finalLower[i];
                }
            } else {
                if (data[i].c > finalUpper[i - 1]) {
                    direction[i] = 1;
                    line[i] = finalLower[i];
                } else {
                    direction[i] = -1;
                    line[i] = finalUpper[i];
                }
            }
        }
        return { line: line, direction: direction, upper: finalUpper, lower: finalLower };
    }

    function calculateStdDevLine(data, period) {
        const p = Math.max(2, period);
        const out = [];
        for (let i = 0; i < data.length; i++) {
            if (i < p - 1) {
                out.push(null);
                continue;
            }
            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < p; j++) {
                const c = data[i - j].c;
                sum += c;
                sumSq += c * c;
            }
            const mean = sum / p;
            const variance = Math.max(0, sumSq / p - mean * mean);
            out.push(Math.sqrt(variance));
        }
        return out;
    }

    function smaMedianPrice(data, len) {
        const med = data.map(function(d) {
            return (d.h + d.l) / 2;
        });
        const out = med.map(function() {
            return null;
        });
        let sum = 0;
        for (let i = 0; i < med.length; i++) {
            sum += med[i];
            if (i >= len) sum -= med[i - len];
            if (i >= len - 1) out[i] = sum / len;
        }
        return out;
    }

    function calculateAO(data) {
        const fast = smaMedianPrice(data, 5);
        const slow = smaMedianPrice(data, 34);
        return fast.map(function(f, i) {
            if (f == null || slow[i] == null) return null;
            return f - slow[i];
        });
    }

    function calculateUltimateOscillator(data, p1, p2, p3) {
        const n = data.length;
        const bp = [];
        const tr = [];
        for (let i = 0; i < n; i++) {
            if (i === 0) {
                bp.push(data[i].c - data[i].l);
                tr.push(data[i].h - data[i].l);
            } else {
                const pc = data[i - 1].c;
                bp.push(data[i].c - Math.min(data[i].l, pc));
                tr.push(Math.max(data[i].h, pc) - Math.min(data[i].l, pc));
            }
        }
        const maxP = Math.max(p1, p2, p3);
        const out = [];
        function windowRatio(idx, len) {
            let sb = 0;
            let st = 0;
            for (let k = 0; k < len; k++) {
                const j = idx - k;
                if (j < 0) return null;
                sb += bp[j];
                st += tr[j];
            }
            return st ? sb / st : null;
        }
        for (let i = 0; i < n; i++) {
            if (i < maxP - 1) {
                out.push(null);
                continue;
            }
            const a1 = windowRatio(i, p1);
            const a2 = windowRatio(i, p2);
            const a3 = windowRatio(i, p3);
            if (a1 == null || a2 == null || a3 == null) {
                out.push(null);
            } else {
                out.push(100 * (4 * a1 + 2 * a2 + a3) / 7);
            }
        }
        return out;
    }

    function calculateVortex(data, period) {
        const n = data.length;
        const p = Math.max(2, period);
        const vmPlus = [0];
        const vmMinus = [0];
        const trArr = [data[0].h - data[0].l];
        for (let i = 1; i < n; i++) {
            vmPlus.push(Math.abs(data[i].h - data[i - 1].l));
            vmMinus.push(Math.abs(data[i].l - data[i - 1].h));
            trArr.push(Math.max(data[i].h, data[i - 1].c) - Math.min(data[i].l, data[i - 1].c));
        }
        const viPlus = [];
        const viMinus = [];
        for (let i = 0; i < n; i++) {
            if (i < p - 1) {
                viPlus.push(null);
                viMinus.push(null);
                continue;
            }
            let sp = 0;
            let sm = 0;
            let str = 0;
            for (let j = 0; j < p; j++) {
                sp += vmPlus[i - j];
                sm += vmMinus[i - j];
                str += trArr[i - j];
            }
            viPlus.push(str ? sp / str : null);
            viMinus.push(str ? sm / str : null);
        }
        return { viPlus: viPlus, viMinus: viMinus };
    }

    function calculatePPO(data, fast, slow, signal) {
        const fastEMA = calculateEMA(data, fast, 'c');
        const slowEMA = calculateEMA(data, slow, 'c');
        const macd = [];
        for (let i = 0; i < data.length; i++) {
            if (fastEMA[i] !== null && slowEMA[i] !== null && slowEMA[i] !== 0) {
                macd.push(100 * (fastEMA[i] - slowEMA[i]) / slowEMA[i]);
            } else {
                macd.push(null);
            }
        }
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

    function calculateDPO(data, period) {
        const p = Math.max(3, period);
        const shift = Math.floor(p / 2) + 1;
        const sma = calculateSMA(data, p, 'c');
        const out = [];
        for (let i = 0; i < data.length; i++) {
            const j = i - shift;
            if (j < 0 || sma[j] === null) {
                out.push(null);
            } else {
                out.push(data[i].c - sma[j]);
            }
        }
        return out;
    }

    /** Stochastic RSI — %K / %D in 0–100 panel (same shape as Stochastic). */
    function calculateStochRSI(data, rsiPeriod, stochLen, smoothK, smoothD) {
        const rp = Math.max(2, rsiPeriod | 0);
        const sl = Math.max(2, stochLen | 0);
        const sk = Math.max(1, smoothK | 0);
        const sd = Math.max(1, smoothD | 0);
        const rsi = calculateRSI(data, rp);
        const raw = data.map(function() { return null; });
        for (let i = 0; i < data.length; i++) {
            let lo = Infinity;
            let hi = -Infinity;
            let ok = true;
            for (let j = 0; j < sl; j++) {
                const idx = i - j;
                if (idx < 0) { ok = false; break; }
                const v = rsi[idx];
                if (v === null || v === undefined || isNaN(v)) { ok = false; break; }
                lo = Math.min(lo, v);
                hi = Math.max(hi, v);
            }
            if (!ok) continue;
            const rv = rsi[i];
            if (rv === null || rv === undefined || isNaN(rv)) continue;
            raw[i] = hi === lo ? 50 : ((rv - lo) / (hi - lo)) * 100;
        }
        const k = rollingSmaNullable(raw, sk);
        const d = rollingSmaNullable(k, sd);
        return { k: k, d: d };
    }

    /** Mass Index — sum of EMA(H−L ratio) over sumPeriod (reversal squeeze indicator). */
    function calculateMassIndex(data, emaPeriod, sumPeriod) {
        const ep = Math.max(2, emaPeriod | 0);
        const sp = Math.max(2, sumPeriod | 0);
        const rangeSeries = data.map(function(d) {
            const r = d.h - d.l;
            return { h: r, l: r, c: r, o: r, v: d.v, t: d.t };
        });
        const ema1 = calculateEMA(rangeSeries, ep, 'c');
        const doubleInput = data.map(function(d, i) {
            const v = ema1[i];
            const x = v != null && !isNaN(v) ? v : 0;
            return { h: x, l: x, c: x, o: x, v: d.v, t: d.t };
        });
        const ema2 = calculateEMA(doubleInput, ep, 'c');
        const ratio = data.map(function(_, i) {
            if (ema1[i] == null || ema2[i] == null || ema2[i] === 0) return null;
            return ema1[i] / ema2[i];
        });
        const out = data.map(function() { return null; });
        for (let i = 0; i < data.length; i++) {
            if (i < sp - 1) continue;
            let s = 0;
            let ok = true;
            for (let j = 0; j < sp; j++) {
                const r = ratio[i - j];
                if (r === null || r === undefined || isNaN(r)) { ok = false; break; }
                s += r;
            }
            if (ok) out[i] = s;
        }
        return out;
    }

    /** Coppock curve — WMA of ROC(11)+ROC(14). */
    function calculateCoppock(data, wmaPeriod) {
        const wp = Math.max(2, wmaPeriod | 0);
        const roc11 = calculateROC(data, 11);
        const roc14 = calculateROC(data, 14);
        const sum = data.map(function(_, i) {
            if (roc11[i] == null || roc14[i] == null) return null;
            return roc11[i] + roc14[i];
        });
        return rollingWmaNullable(sum, wp);
    }

    /** Relative Vigor Index — smoothed ratio of weighted (C−O) vs (H−L). */
    function calculateRVI(data, period) {
        const p = Math.max(2, period | 0);
        const ratio = data.map(function() { return null; });
        for (let i = 3; i < data.length; i++) {
            const c = data[i].c, o = data[i].o, h = data[i].h, l = data[i].l;
            const c1 = data[i - 1].c, o1 = data[i - 1].o, h1 = data[i - 1].h, l1 = data[i - 1].l;
            const c2 = data[i - 2].c, o2 = data[i - 2].o, h2 = data[i - 2].h, l2 = data[i - 2].l;
            const c3 = data[i - 3].c, o3 = data[i - 3].o, h3 = data[i - 3].h, l3 = data[i - 3].l;
            const num = ((c - o) + 2 * (c1 - o1) + 2 * (c2 - o2) + (c3 - o3)) / 6;
            const den = ((h - l) + 2 * (h1 - l1) + 2 * (h2 - l2) + (h3 - l3)) / 6;
            if (!den) ratio[i] = null;
            else ratio[i] = num / den;
        }
        return rollingSmaNullable(ratio, p);
    }

    /** Elder Ray — bull power (H−EMA), bear power (L−EMA). */
    function calculateElderRay(data, period) {
        const p = Math.max(2, period | 0);
        const ema = calculateEMA(data, p, 'c');
        const bull = data.map(function(d, i) {
            return ema[i] == null ? null : d.h - ema[i];
        });
        const bear = data.map(function(d, i) {
            return ema[i] == null ? null : d.l - ema[i];
        });
        return { bull: bull, bear: bear };
    }

    /** CFTC Public Reporting — Legacy Combined (futures + options), same family as TV “Legacy” COT. */
    var COTNET_CFTC_LEGACY_COMBINED = 'jun7-fc8e';
    var COTNET_CFTC_API = 'https://publicreporting.cftc.gov/resource/';

    function sanitizeCftcContractCode(code) {
        const s = String(code == null ? '' : code).trim();
        if (!/^[0-9A-Za-z+]{1,16}$/.test(s)) {
            throw new Error('Invalid CFTC contract code (use digits/letters/+, e.g. 13874A or 085692)');
        }
        return s;
    }

    function cotNetCftcRowsToPoints(rows) {
        const pts = [];
        let marketName = '';
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!marketName && r.market_and_exchange_names) marketName = String(r.market_and_exchange_names);
            const oi = parseInt(r.open_interest_all, 10);
            if (!oi || isNaN(oi)) continue;
            const cl = parseInt(r.comm_positions_long_all, 10);
            const cs = parseInt(r.comm_positions_short_all, 10);
            const nl = parseInt(r.noncomm_positions_long_all, 10);
            const ns = parseInt(r.noncomm_positions_short_all, 10);
            if (isNaN(cl) || isNaN(cs) || isNaN(nl) || isNaN(ns)) continue;
            const t = Date.parse(r.report_date_as_yyyy_mm_dd);
            if (!Number.isFinite(t)) continue;
            pts.push({
                t: t,
                commercialNet: (cl - cs) / oi,
                noncommNet: (nl - ns) / oi
            });
        }
        return { points: pts, marketName: marketName };
    }

    function cotNetBuildCftcLegacyUrl(cftcCode) {
        const code = sanitizeCftcContractCode(cftcCode);
        const where = "cftc_contract_market_code='" + code.replace(/'/g, "''") + "'";
        return COTNET_CFTC_API + COTNET_CFTC_LEGACY_COMBINED + '.json?' + [
            '$where=' + encodeURIComponent(where),
            '$order=' + encodeURIComponent('report_date_as_yyyy_mm_dd ASC'),
            '$limit=10000'
        ].join('&');
    }

    /**
     * Normalized chart root symbol → CFTC Legacy Combined contract code (jun7-fc8e).
     * When the chart symbol is unknown, caller falls back to ES (13874A).
     */
    var COTNET_SYMBOL_TO_CFTC = {
        ES: '13874A',
        MES: '13874U',
        SPX: '13874A',
        NQ: '209741',
        MNQ: '209747',
        GC: '088691',
        MGC: '088691',
        CL: '067651',
        MCL: '067651',
        '6E': '099741',
        EURUSD: '099741',
        RTY: '239742',
        M2K: '239747',
        YM: '124603',
        MYM: '124603',
        '6B': '096742',
        GBPUSD: '096742',
        '6J': '097741',
        USDJPY: '097741',
        '6A': '232741',
        AUDUSD: '232741',
        '6N': '112741',
        NZDUSD: '112741',
        '6C': '090741',
        USDCAD: '090741',
        '6S': '092741',
        USDCHF: '092741',
        SI: '084691',
        SIL: '084691',
        HG: '085692',
        XAUUSD: '088691',
        XAGUSD: '084691',
        ZB: '020601',
        ZN: '042601',
        ZF: '044601',
        ZT: '043601'
    };

    var COTNET_FX_CCYS = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'ZAR', 'TRY', 'MXN', 'BTC', 'ETH', 'XAU', 'XAG']);

    /** Same idea as Chart._formatPairTicker: EUR/USD → EURUSD; then futures roots ESZ4 → ES. */
    function cotNetNormalizeSymbolKey(raw) {
        if (raw == null || raw === '') return '';
        const clean = String(raw).replace(/\.(csv|CSV)$/i, '').replace(/^\d{8}_\d{6}_/, '');
        const flat = clean.toUpperCase().replace(/[\s\-_\/\.]/g, '');
        const m6 = flat.match(/^([A-Z]{6})/);
        if (m6) {
            const pair = m6[1];
            const base = pair.substring(0, 3);
            const quote = pair.substring(3, 6);
            if (COTNET_FX_CCYS.has(base) && COTNET_FX_CCYS.has(quote)) {
                return pair;
            }
        }
        let s = flat.replace(/^=/, '');
        s = s.replace(/(\.[A-Z0-9]+)+$/i, '');
        const fm = s.match(/^([A-Z0-9]{1,6})([FGHJKMNQUVZ])(\d{2,4})$/);
        if (fm) return fm[1];
        return s;
    }

    function cotNetLooksLikeForexSix(key) {
        return /^[A-Z]{6}$/.test(key) && COTNET_FX_CCYS.has(key.slice(0, 3)) && COTNET_FX_CCYS.has(key.slice(3, 6));
    }

    /**
     * @returns {{ code: string, auto: boolean, root: string }}
     */
    function cotNetResolveCftcCode(chart, params) {
        const symKey = cotNetNormalizeSymbolKey(chart && chart.currentSymbol);
        const explicit = params && params.cftcCode != null ? String(params.cftcCode).trim() : '';

        if (explicit && explicit.toLowerCase() !== 'auto') {
            return { code: sanitizeCftcContractCode(explicit), auto: false, root: explicit };
        }

        if (symKey && COTNET_SYMBOL_TO_CFTC[symKey]) {
            return { code: COTNET_SYMBOL_TO_CFTC[symKey], auto: true, root: symKey };
        }
        if (cotNetLooksLikeForexSix(symKey)) {
            throw new Error('No CFTC Legacy mapping for ' + symKey + ' — set cftcCode in indicator settings (see cftc.gov Public Reporting)');
        }
        return { code: '13874A', auto: true, root: symKey || '' };
    }

    function normalizeCotNetPoint(p) {
        if (!p || typeof p !== 'object') return null;
        const t = p.t != null ? Number(p.t) : (p.time != null ? Number(p.time) : NaN);
        const c = p.commercialNet != null ? Number(p.commercialNet) : (p.c != null ? Number(p.c) : NaN);
        const n = p.noncommNet != null ? Number(p.noncommNet) : (p.n != null ? Number(p.n) : NaN);
        if (!Number.isFinite(t) || !Number.isFinite(c) || !Number.isFinite(n)) return null;
        return { t: t, commercialNet: c, noncommNet: n };
    }

    function mergeCotNetPointsToBars(candles, points) {
        const sorted = points.filter(Boolean).slice().sort(function(a, b) { return a.t - b.t; });
        const n = candles.length;
        const bull = new Array(n).fill(null);
        const bear = new Array(n).fill(null);
        let j = 0;
        let lastC = null;
        let lastN = null;
        for (let i = 0; i < n; i++) {
            const bt = candles[i].t;
            while (j < sorted.length && sorted[j].t <= bt) {
                lastC = sorted[j].commercialNet;
                lastN = sorted[j].noncommNet;
                j++;
            }
            bull[i] = lastC;
            bear[i] = lastN;
        }
        return { bull: bull, bear: bear };
    }

    /**
     * Calendar seasonality: mean close-to-close % return for each month/day (UTC) across all years in the series.
     * Uses the same bars as the chart (same instrument as the open dataset). Requires enough history per date.
     */
    function calculateSeasonality(data, minSamples) {
        const n = data ? data.length : 0;
        const out = new Array(n).fill(null);
        if (n < 2) return out;
        const msParsed = minSamples != null ? parseInt(minSamples, 10) : 2;
        const ms = Math.max(1, isNaN(msParsed) ? 2 : msParsed);

        function calKey(t) {
            const d = new Date(t);
            return (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
        }

        const buckets = {};
        for (let i = 1; i < n; i++) {
            const pc = data[i - 1].c;
            if (pc == null || pc === 0 || isNaN(pc)) continue;
            const ret = (data[i].c - pc) / pc * 100;
            if (!isFinite(ret)) continue;
            const k = calKey(data[i].t);
            if (!buckets[k]) buckets[k] = [];
            buckets[k].push(ret);
        }

        const mean = {};
        Object.keys(buckets).forEach(function(k) {
            const arr = buckets[k];
            if (arr.length >= ms) {
                let s = 0;
                for (let j = 0; j < arr.length; j++) s += arr[j];
                mean[k] = s / arr.length;
            }
        });

        for (let i = 0; i < n; i++) {
            const k = calKey(data[i].t);
            out[i] = mean[k] != null ? mean[k] : null;
        }
        return out;
    }

    /** SMA envelope — % distance from SMA(close). */
    function calculateEnvelope(data, period, percent) {
        const mid = calculateSMA(data, Math.max(1, period), 'c');
        const pct = Math.max(0.01, percent) / 100;
        const upper = [];
        const lower = [];
        for (let i = 0; i < data.length; i++) {
            if (mid[i] == null) {
                upper.push(null);
                lower.push(null);
            } else {
                upper.push(mid[i] * (1 + pct));
                lower.push(mid[i] * (1 - pct));
            }
        }
        return { upper: upper, middle: mid, lower: lower };
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

    if (this.indicators.active && this.indicators.active.length >= MAX_ACTIVE_INDICATORS) {
        if (typeof this.showNotification === 'function') {
            this.showNotification('Maximum ' + MAX_ACTIVE_INDICATORS + ' indicators allowed');
        }
        return null;
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
                indicator.params.source = params.source || 'close';
                indicator.style.color = params.color || '#2962ff';
                indicator.style.lineWidth = params.lineWidth != null ? params.lineWidth : 2;
                indicator.style.lineStyle = params.lineStyle || 'Solid';
                indicator.style.showLabel = params.showLabel !== false;
                indicator.name = 'SMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period, indicator.params.source);
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

            case 'envelope':
            case 'smaenvelope':
                indicator.params.period = params.period || 20;
                indicator.params.percent = params.percent != null ? params.percent : 2.5;
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.05)';
                indicator.style.lineWidth = params.lineWidth != null ? params.lineWidth : 1;
                indicator.overlay = true;
                indicator.name = 'Envelope(' + indicator.params.period + ',' + indicator.params.percent + '%)';
                this.indicators.data[indicator.id] = calculateEnvelope(this.data, indicator.params.period, indicator.params.percent);
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
                indicator.params.boxTransparency = params.boxTransparency !== undefined ? params.boxTransparency : 88;
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

            case 'sessionsplus':
                indicator.params.showSydney = params.showSydney !== false;
                indicator.params.showTokyo = params.showTokyo !== false;
                indicator.params.showAsian = params.showAsian !== false;
                indicator.params.showFrankfurt = params.showFrankfurt !== false;
                indicator.params.showLondon = params.showLondon !== false;
                indicator.params.showNewYork = params.showNewYork !== false;
                indicator.params.sydneyStart = params.sydneyStart || '21:00';
                indicator.params.sydneyEnd = params.sydneyEnd || '06:00';
                indicator.params.tokyoStart = params.tokyoStart || '00:00';
                indicator.params.tokyoEnd = params.tokyoEnd || '09:00';
                indicator.params.asianStart = params.asianStart || '00:00';
                indicator.params.asianEnd = params.asianEnd || '09:00';
                indicator.params.frankfurtStart = params.frankfurtStart || '07:00';
                indicator.params.frankfurtEnd = params.frankfurtEnd || '10:00';
                indicator.params.londonStart = params.londonStart || '08:00';
                indicator.params.londonEnd = params.londonEnd || '16:00';
                indicator.params.newYorkStart = params.newYorkStart || '13:00';
                indicator.params.newYorkEnd = params.newYorkEnd || '21:00';
                indicator.style.sydneyColor = params.sydneyColor || 'rgba(156, 39, 176, 0.14)';
                indicator.style.tokyoColor = params.tokyoColor || 'rgba(255, 152, 0, 0.14)';
                indicator.style.asianColor = params.asianColor || 'rgba(255, 193, 7, 0.12)';
                indicator.style.frankfurtColor = params.frankfurtColor || 'rgba(3, 169, 244, 0.14)';
                indicator.style.londonColor = params.londonColor || 'rgba(33, 150, 243, 0.14)';
                indicator.style.newYorkColor = params.newYorkColor || 'rgba(76, 175, 80, 0.14)';
                indicator.overlay = true;
                indicator.isSessionsPlus = true;
                indicator.name = 'Sessions+';
                this.indicators.data[indicator.id] = calculateSessionsPlus(this.data, {
                    showSydney: indicator.params.showSydney,
                    showTokyo: indicator.params.showTokyo,
                    showAsian: indicator.params.showAsian,
                    showFrankfurt: indicator.params.showFrankfurt,
                    showLondon: indicator.params.showLondon,
                    showNewYork: indicator.params.showNewYork,
                    sydneyStart: indicator.params.sydneyStart,
                    sydneyEnd: indicator.params.sydneyEnd,
                    tokyoStart: indicator.params.tokyoStart,
                    tokyoEnd: indicator.params.tokyoEnd,
                    asianStart: indicator.params.asianStart,
                    asianEnd: indicator.params.asianEnd,
                    frankfurtStart: indicator.params.frankfurtStart,
                    frankfurtEnd: indicator.params.frankfurtEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    newYorkStart: indicator.params.newYorkStart,
                    newYorkEnd: indicator.params.newYorkEnd,
                    sydneyColor: indicator.style.sydneyColor,
                    tokyoColor: indicator.style.tokyoColor,
                    asianColor: indicator.style.asianColor,
                    frankfurtColor: indicator.style.frankfurtColor,
                    londonColor: indicator.style.londonColor,
                    newYorkColor: indicator.style.newYorkColor
                });
                break;

            case 'openingrange':
            case 'or':
                indicator.params.minutes = params.minutes != null ? params.minutes : 30;
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.06)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.type = 'openingrange';
                indicator.name = 'Opening Range(' + indicator.params.minutes + 'm)';
                this.indicators.data[indicator.id] = calculateOpeningRange(this.data, indicator.params.minutes);
                break;

            case 'supertrend':
                indicator.params.period = params.period != null ? params.period : 10;
                indicator.params.multiplier = params.multiplier != null ? params.multiplier : 3;
                indicator.style.upColor = params.upColor || '#26a69a';
                indicator.style.downColor = params.downColor || '#ef5350';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = true;
                indicator.name = 'Supertrend(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSupertrend(this.data, indicator.params.period, indicator.params.multiplier);
                break;

            case 'stddev':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#ab47bc';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = true;
                indicator.name = 'StdDev(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateStdDevLine(this.data, indicator.params.period);
                break;

            case 'ao':
                indicator.style.color = params.color || '#26a69a';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Awesome Oscillator';
                this.indicators.data[indicator.id] = calculateAO(this.data);
                break;

            case 'uo':
                indicator.params.period1 = params.period1 || 7;
                indicator.params.period2 = params.period2 || 14;
                indicator.params.period3 = params.period3 || 28;
                indicator.style.color = params.color || '#7e57c2';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Ultimate Oscillator';
                this.indicators.data[indicator.id] = calculateUltimateOscillator(this.data, indicator.params.period1, indicator.params.period2, indicator.params.period3);
                break;

            case 'vortex':
                indicator.params.period = params.period || 14;
                indicator.style.plusColor = params.plusColor || '#00e676';
                indicator.style.minusColor = params.minusColor || '#f23645';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Vortex(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateVortex(this.data, indicator.params.period);
                break;

            case 'ppo':
                indicator.params.fast = params.fast || 12;
                indicator.params.slow = params.slow || 26;
                indicator.params.signal = params.signal || 9;
                indicator.style.macdColor = params.macdColor || '#2962ff';
                indicator.style.signalColor = params.signalColor || '#f23645';
                indicator.style.histogramColor = params.histogramColor || '#787b86';
                indicator.overlay = false;
                indicator.name = 'PPO(' + indicator.params.fast + ',' + indicator.params.slow + ',' + indicator.params.signal + ')';
                this.indicators.data[indicator.id] = calculatePPO(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                break;

            case 'dpo':
                indicator.params.period = params.period || 20;
                indicator.style.color = params.color || '#78909c';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'DPO(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDPO(this.data, indicator.params.period);
                break;

            case 'stochrsi':
                indicator.params.rsiPeriod = params.rsiPeriod != null ? params.rsiPeriod : 14;
                indicator.params.stochLen = params.stochLen != null ? params.stochLen : 14;
                indicator.params.smoothK = params.smoothK != null ? params.smoothK : 3;
                indicator.params.smoothD = params.smoothD != null ? params.smoothD : 3;
                indicator.style.kColor = params.kColor || '#2962ff';
                indicator.style.dColor = params.dColor || '#f23645';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Stoch RSI(' + indicator.params.rsiPeriod + ',' + indicator.params.stochLen + ')';
                this.indicators.data[indicator.id] = calculateStochRSI(
                    this.data,
                    indicator.params.rsiPeriod,
                    indicator.params.stochLen,
                    indicator.params.smoothK,
                    indicator.params.smoothD
                );
                break;

            case 'massindex':
                indicator.params.emaPeriod = params.emaPeriod != null ? params.emaPeriod : 9;
                indicator.params.sumPeriod = params.sumPeriod != null ? params.sumPeriod : 25;
                indicator.style.color = params.color || '#00bcd4';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Mass Index(' + indicator.params.emaPeriod + ',' + indicator.params.sumPeriod + ')';
                this.indicators.data[indicator.id] = calculateMassIndex(
                    this.data,
                    indicator.params.emaPeriod,
                    indicator.params.sumPeriod
                );
                break;

            case 'coppock':
                indicator.params.wmaPeriod = params.wmaPeriod != null ? params.wmaPeriod : 10;
                indicator.style.color = params.color || '#8e24aa';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Coppock(' + indicator.params.wmaPeriod + ')';
                this.indicators.data[indicator.id] = calculateCoppock(this.data, indicator.params.wmaPeriod);
                break;

            case 'rvi':
                indicator.params.period = params.period || 10;
                indicator.style.color = params.color || '#ffa726';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'RVI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateRVI(this.data, indicator.params.period);
                break;

            case 'elderray':
                indicator.params.period = params.period || 13;
                indicator.style.bullColor = params.bullColor || '#26a69a';
                indicator.style.bearColor = params.bearColor || '#ef5350';
                indicator.style.lineWidth = params.lineWidth || 2;
                indicator.overlay = false;
                indicator.name = 'Elder Ray(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateElderRay(this.data, indicator.params.period);
                break;

            case 'seasonality':
                indicator.params.minSamples = params.minSamples != null ? Math.max(1, parseInt(params.minSamples, 10) || 2) : 2;
                indicator.style.color = params.color || '#ff9800';
                indicator.style.lineWidth = params.lineWidth != null ? params.lineWidth : 2;
                indicator.overlay = false;
                indicator.separatePanel = true;
                indicator.name = 'Seasonality (avg % by date)';
                this.indicators.data[indicator.id] = calculateSeasonality(this.data, indicator.params.minSamples);
                break;

            case 'cotnet':
                indicator.params.cftcCode = params.cftcCode != null ? String(params.cftcCode).trim() : 'auto';
                indicator.params.dataUrl = params.dataUrl != null ? String(params.dataUrl) : '';
                indicator.params.showCommercial = params.showCommercial !== false;
                indicator.params.showLarge = params.showLarge !== false;
                indicator.style.bullColor = params.bullColor || '#26a69a';
                indicator.style.bearColor = params.bearColor || '#ef5350';
                indicator.style.lineWidth = params.lineWidth != null ? params.lineWidth : 2;
                indicator.overlay = false;
                indicator.separatePanel = true;
                indicator.isCotNet = true;
                indicator.name = 'COT net comm vs non-comm';
                this.indicators.data[indicator.id] = { loading: true, error: null };
                break;

            case 'ictpd':
                indicator.style.upperColor = params.upperColor || '#2962ff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#2962ff';
                indicator.style.fillColor = params.fillColor || 'rgba(41, 98, 255, 0.04)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.name = 'ICT Prev Day PD';
                this.indicators.data[indicator.id] = calculateIctPrevDayPD(this.data);
                break;

            case 'ictasian':
                indicator.params.rangeStart = params.rangeStart || '00:00';
                indicator.params.rangeEnd = params.rangeEnd || '09:00';
                indicator.style.upperColor = params.upperColor || '#ff9800';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#ff9800';
                indicator.style.fillColor = params.fillColor || 'rgba(255, 152, 0, 0.06)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.name = 'ICT Asian Range';
                this.indicators.data[indicator.id] = calculateIctAsianRange(this.data, {
                    rangeStart: indicator.params.rangeStart,
                    rangeEnd: indicator.params.rangeEnd
                });
                break;

            case 'ictote':
                indicator.params.lookback = params.lookback != null ? params.lookback : 24;
                indicator.params.fibLow = params.fibLow != null ? params.fibLow : 0.62;
                indicator.params.fibHigh = params.fibHigh != null ? params.fibHigh : 0.79;
                indicator.style.upperColor = params.upperColor || '#7c4dff';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#7c4dff';
                indicator.style.fillColor = params.fillColor || 'rgba(124, 77, 255, 0.08)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.name = 'ICT OTE Zone';
                this.indicators.data[indicator.id] = calculateIctOTE(
                    this.data,
                    indicator.params.lookback,
                    indicator.params.fibLow,
                    indicator.params.fibHigh
                );
                break;

            case 'ictfvg':
                indicator.params.extendBars = params.extendBars != null ? params.extendBars : 80;
                indicator.params.maxBoxes = params.maxBoxes != null ? params.maxBoxes : 120;
                indicator.params.minGapPct = params.minGapPct != null ? params.minGapPct : 0;
                indicator.style.bullColor = params.bullColor || 'rgba(38, 166, 154, 0.22)';
                indicator.style.bearColor = params.bearColor || 'rgba(239, 83, 80, 0.22)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.isIctFvg = true;
                indicator.name = 'ICT Fair Value Gaps';
                this.indicators.data[indicator.id] = calculateFairValueGaps(this.data, {
                    extendBars: indicator.params.extendBars,
                    maxBoxes: indicator.params.maxBoxes,
                    minGapPct: indicator.params.minGapPct
                });
                break;

            case 'ictsesspd':
                indicator.params.rangeStart = params.rangeStart || '13:00';
                indicator.params.rangeEnd = params.rangeEnd || '21:00';
                indicator.params.maxLookbackDays = params.maxLookbackDays != null ? params.maxLookbackDays : 6;
                indicator.style.upperColor = params.upperColor || '#00e676';
                indicator.style.middleColor = params.middleColor || '#787b86';
                indicator.style.lowerColor = params.lowerColor || '#f23645';
                indicator.style.fillColor = params.fillColor || 'rgba(0, 230, 118, 0.05)';
                indicator.style.lineWidth = params.lineWidth || 1;
                indicator.overlay = true;
                indicator.name = 'ICT Session PD';
                this.indicators.data[indicator.id] = calculateIctSessionPrevDayPD(this.data, {
                    rangeStart: indicator.params.rangeStart,
                    rangeEnd: indicator.params.rangeEnd,
                    maxLookbackDays: indicator.params.maxLookbackDays
                });
                break;

            case 'ictliquidity':
                indicator.params.fractalWidth = params.fractalWidth != null ? params.fractalWidth : 2;
                indicator.params.tolerancePct = params.tolerancePct != null ? params.tolerancePct : 0.03;
                indicator.params.minTouches = params.minTouches != null ? params.minTouches : 2;
                indicator.params.maxSegments = params.maxSegments != null ? params.maxSegments : 80;
                indicator.params.extendBars = params.extendBars != null ? params.extendBars : 12;
                indicator.style.highColor = params.highColor || '#f23645';
                indicator.style.lowColor = params.lowColor || '#2962ff';
                indicator.style.lineWidth = params.lineWidth != null ? params.lineWidth : 1;
                indicator.overlay = true;
                indicator.isLiquidityEq = true;
                indicator.name = 'ICT Equal L/H Liquidity';
                this.indicators.data[indicator.id] = calculateLiquidityEqualLevels(this.data, {
                    fractalWidth: indicator.params.fractalWidth,
                    tolerancePct: indicator.params.tolerancePct,
                    minTouches: indicator.params.minTouches,
                    maxSegments: indicator.params.maxSegments,
                    extendBars: indicator.params.extendBars
                });
                break;

            case 'icteverything':
                indicator.overlay = true;
                indicator.isIctEverything = true;
                indicator.name = 'ICT Everything';
                indicator.params = indicator.params || {};
                var ieDefAdd = (typeof window !== 'undefined' && window.INDICATOR_DEFINITIONS && window.INDICATOR_DEFINITIONS.icteverything)
                    ? window.INDICATOR_DEFINITIONS.icteverything
                    : null;
                if (ieDefAdd && ieDefAdd.params) {
                    ieDefAdd.params.forEach(function(p) {
                        if (p.type === 'heading' || p.type === 'divider') return;
                        var raw = params[p.id] !== undefined ? params[p.id] : p.default;
                        if (p.type === 'checkbox') raw = !!raw;
                        else if (p.type === 'number') {
                            raw = parseFloat(raw);
                            if (isNaN(raw)) raw = p.default;
                        }
                        indicator.params[p.id] = raw;
                    });
                }
                this.indicators.data[indicator.id] = calculateIctEverything(this.data, indicator);
                break;

            case 'custom': {
                const TC = global.TalariaCustomIndicators;
                if (!TC) {
                    if (typeof this.showNotification === 'function') {
                        this.showNotification('Custom indicators runtime not loaded');
                    }
                    return;
                }
                const script = params.script;
                if (!script || typeof script !== 'string') {
                    if (typeof this.showNotification === 'function') {
                        this.showNotification('Custom indicator: script required');
                    }
                    return;
                }
                if (script.length > TC.MAX_SCRIPT_CHARS) {
                    if (typeof this.showNotification === 'function') {
                        this.showNotification('Custom script exceeds size limit (' + TC.MAX_SCRIPT_CHARS + ' chars)');
                    }
                    return;
                }
                if (typeof TC.validateCustomScriptSource === 'function') {
                    const check = TC.validateCustomScriptSource(script);
                    if (!check.ok) {
                        if (typeof this.showNotification === 'function') {
                            this.showNotification(check.error || 'Invalid script');
                        }
                        return;
                    }
                }
                indicator.isCustomScript = true;
                indicator.params.script = script;
                indicator.params.customParams = params.customParams && typeof params.customParams === 'object' ? params.customParams : {};
                indicator.params.customApiVersion = params.customApiVersion != null ? params.customApiVersion : TC.API_VERSION;
                indicator.params.timeoutMs = params.timeoutMs != null ? params.timeoutMs : TC.DEFAULT_TIMEOUT_MS;
                indicator.name = params.name || 'Custom';
                const overlayOn = params.overlay !== false && params.separatePanel !== true;
                indicator.overlay = overlayOn;
                indicator.separatePanel = params.separatePanel === true || !overlayOn;
                this.indicators.data[indicator.id] = {
                    loading: true,
                    plots: [],
                    error: null,
                    overlay: overlayOn
                };
                break;
            }
                
            default:
                return;
        }
        
        this.indicators.active.push(indicator);
        if (indicator.type === 'custom' && typeof this._scheduleCustomIndicatorCompute === 'function') {
            this._scheduleCustomIndicatorCompute(indicator);
        }
        if (indicator.type === 'cotnet' && typeof this._scheduleCotNetLoad === 'function') {
            this._scheduleCotNetLoad(indicator);
        }
        this._updateIndicatorPanelHeight();
        
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        this.persistIndicators();
        emitIndicatorsChanged(this, 'add', indicator);
        
        return indicator;
    };

    Chart.prototype.persistIndicators = function() {
        if (!this.indicators || !Array.isArray(this.indicators.active)) return;
        const TC = global.TalariaCustomIndicators;
        const maxScript = TC && TC.MAX_SCRIPT_CHARS ? TC.MAX_SCRIPT_CHARS : 48000;
        const snapshot = this.indicators.active.map(function(ind) {
            const base = {
                type: ind.type,
                name: ind.name,
                params: Object.assign({}, ind.params || {}),
                style: Object.assign({}, ind.style || {}),
                visible: ind.visible !== false,
                overlay: ind.overlay,
                separatePanel: ind.separatePanel,
                isVolume: ind.isVolume || false,
            };
            if (ind.visibility && typeof ind.visibility === 'object') {
                try {
                    base.visibility = JSON.parse(JSON.stringify(ind.visibility));
                } catch (_) {}
            }
            if (ind.type === 'custom' && base.params && typeof base.params.script === 'string') {
                if (base.params.script.length > maxScript) {
                    base.params.script = base.params.script.slice(0, maxScript);
                    base.params.customScriptTruncated = true;
                }
                base.isCustomScript = true;
            }
            return base;
        });
        if (snapshot.length === 0
            && this._sessionIndicatorsRestoreGuardUntil
            && Date.now() < this._sessionIndicatorsRestoreGuardUntil) {
            return;
        }
        if (typeof this.scheduleSessionStateSave === 'function') {
            this.scheduleSessionStateSave({ indicators: snapshot });
        }
        if (typeof this._writeTradingSessionLocalBackupThrottled === 'function') {
            this._writeTradingSessionLocalBackupThrottled();
        }
    };

    Chart.prototype.addCustomIndicator = function(opts) {
        opts = opts || {};
        return this.addIndicator('custom', opts);
    };

    Chart.prototype._scheduleCustomIndicatorCompute = function(indicator) {
        const self = this;
        const TC = global.TalariaCustomIndicators;
        if (!TC || !indicator || indicator.type !== 'custom') return;
        const script = indicator.params && indicator.params.script;
        if (!script || typeof script !== 'string') {
            this.indicators.data[indicator.id] = {
                loading: false,
                plots: [],
                error: 'No script',
                overlay: indicator.overlay !== false
            };
            return;
        }
        if (typeof TC.validateCustomScriptSource === 'function') {
            const check = TC.validateCustomScriptSource(script);
            if (!check.ok) {
                this.indicators.data[indicator.id] = {
                    loading: false,
                    plots: [],
                    error: check.error || 'Invalid script',
                    overlay: indicator.overlay !== false
                };
                if (typeof self.render === 'function') self.render();
                return;
            }
        }
        const bars = TC.serializeBarsFromChartData(this.data);
        const userParams = indicator.params.customParams && typeof indicator.params.customParams === 'object'
            ? indicator.params.customParams
            : {};
        const timeoutMs = indicator.params.timeoutMs != null ? indicator.params.timeoutMs : TC.DEFAULT_TIMEOUT_MS;
        this.indicators.data[indicator.id] = {
            loading: true,
            plots: [],
            error: null,
            overlay: indicator.overlay !== false
        };
        TC.runCompute(script, bars, userParams, timeoutMs).then(function(result) {
            if (!self.indicators || !self.indicators.active) return;
            const still = self.indicators.active.some(function(i) {
                return i.id === indicator.id;
            });
            if (!still) return;
            const wantPanel = indicator.params && indicator.params.separatePanel === true;
            if (wantPanel) {
                indicator.overlay = false;
                indicator.separatePanel = true;
            } else {
                indicator.overlay = result.overlay !== false;
                indicator.separatePanel = result.overlay === false;
            }
            self.indicators.data[indicator.id] = {
                loading: false,
                plots: result.plots,
                error: null,
                overlay: indicator.overlay !== false
            };
            if (typeof self._updateIndicatorPanelHeight === 'function') {
                self._updateIndicatorPanelHeight();
            }
            if (typeof self.render === 'function') self.render();
            self.persistIndicators();
        }).catch(function(err) {
            if (!self.indicators || !self.indicators.active) return;
            const still = self.indicators.active.some(function(i) {
                return i.id === indicator.id;
            });
            if (!still) return;
            self.indicators.data[indicator.id] = {
                loading: false,
                plots: [],
                error: err && err.message ? err.message : String(err),
                overlay: indicator.overlay !== false
            };
            if (typeof self.render === 'function') self.render();
            if (typeof self.showNotification === 'function') {
                self.showNotification('Custom indicator: ' + (err && err.message ? err.message : 'error'));
            }
        });
    };

    Chart.prototype._scheduleCotNetLoad = function(indicator) {
        const self = this;
        const params = indicator.params || {};
        const url = (params.dataUrl && String(params.dataUrl).trim()) || '';

        function applyMerged(merged, note, marketName, resolvedMeta) {
            if (!self.indicators || !self.indicators.active) return;
            const still = self.indicators.active.some(function(i) { return i.id === indicator.id; });
            if (!still) return;
            const rm = resolvedMeta || {};
            self.indicators.data[indicator.id] = {
                loading: false,
                error: null,
                bull: merged.bull,
                bear: merged.bear,
                _cotNote: note || '',
                _cotMarket: marketName || '',
                _cotRoot: rm.root || '',
                _cotCodeUsed: rm.code || ''
            };
            if (typeof self._updateIndicatorPanelHeight === 'function') self._updateIndicatorPanelHeight();
            if (typeof self.render === 'function') self.render();
            if (typeof self.persistIndicators === 'function') self.persistIndicators();
        }

        function fail(msg) {
            if (!self.indicators || !self.indicators.active) return;
            const still = self.indicators.active.some(function(i) { return i.id === indicator.id; });
            if (!still) return;
            self.indicators.data[indicator.id] = { loading: false, error: msg, bull: null, bear: null };
            if (typeof self.render === 'function') self.render();
        }

        if (!this.data || this.data.length === 0) {
            fail('No chart data');
            return;
        }

        if (url) {
            fetch(url, { credentials: 'same-origin', mode: 'cors' })
                .then(function(r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function(json) {
                    const raw = json && json.points != null ? json.points : json;
                    if (!Array.isArray(raw)) throw new Error('JSON must be an array or { points: [] }');
                    const pts = [];
                    for (let i = 0; i < raw.length; i++) {
                        const np = normalizeCotNetPoint(raw[i]);
                        if (np) pts.push(np);
                    }
                    if (pts.length === 0) throw new Error('No valid COT points');
                    applyMerged(mergeCotNetPointsToBars(self.data, pts), 'file', '');
                })
                .catch(function(e) {
                    fail(e && e.message ? e.message : String(e));
                    if (typeof self.showNotification === 'function') {
                        self.showNotification('COT: ' + (e && e.message ? e.message : 'load failed'));
                    }
                });
            return;
        }

        let apiUrl;
        let resolvedCot;
        try {
            resolvedCot = cotNetResolveCftcCode(self, params);
            apiUrl = cotNetBuildCftcLegacyUrl(resolvedCot.code);
        } catch (e) {
            fail(e && e.message ? e.message : String(e));
            return;
        }

        fetch(apiUrl, { mode: 'cors' })
            .then(function(r) {
                if (!r.ok) throw new Error('CFTC API HTTP ' + r.status);
                return r.json();
            })
            .then(function(rows) {
                if (!Array.isArray(rows) || rows.length === 0) {
                    throw new Error('No COT rows for cftcCode — check code at cftc.gov Public Reporting');
                }
                const parsed = cotNetCftcRowsToPoints(rows);
                if (!parsed.points.length) throw new Error('Could not parse COT positions');
                applyMerged(mergeCotNetPointsToBars(self.data, parsed.points), 'cftc', parsed.marketName, resolvedCot);
            })
            .catch(function(e) {
                fail(e && e.message ? e.message : String(e));
                if (typeof self.showNotification === 'function') {
                    self.showNotification('COT: ' + (e && e.message ? e.message : 'CFTC fetch failed'));
                }
            });
    };
    
    Chart.prototype.updateIndicator = function(id, newParams) {
        const indicator = this.indicators.active.find(function(ind) {
            return ind.id === id;
        });
        
        if (!indicator) {
            return;
        }
        
        if (newParams.visible !== undefined) {
            indicator.visible = newParams.visible !== false;
        }
        
        if (newParams.visibility !== undefined && newParams.visibility !== null) {
            indicator.visibility = newParams.visibility;
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
        if (newParams.lineStyle !== undefined) indicator.style.lineStyle = newParams.lineStyle;
        if (newParams.showLabel !== undefined) indicator.style.showLabel = newParams.showLabel !== false;
        if (newParams.source !== undefined) indicator.params.source = newParams.source;
        if (newParams.emaPeriod !== undefined) indicator.params.emaPeriod = newParams.emaPeriod;
        if (newParams.atrPeriod !== undefined) indicator.params.atrPeriod = newParams.atrPeriod;
        if (newParams.multiplier !== undefined) indicator.params.multiplier = newParams.multiplier;
        if (newParams.step !== undefined) indicator.params.step = newParams.step;
        if (newParams.maxStep !== undefined) indicator.params.maxStep = newParams.maxStep;
        if (newParams.bullColor !== undefined) indicator.style.bullColor = newParams.bullColor;
        if (newParams.bearColor !== undefined) indicator.style.bearColor = newParams.bearColor;
        if (newParams.plusColor !== undefined) indicator.style.plusColor = newParams.plusColor;
        if (newParams.minusColor !== undefined) indicator.style.minusColor = newParams.minusColor;
        if (newParams.bullColor !== undefined) indicator.style.bullColor = newParams.bullColor;
        if (newParams.bearColor !== undefined) indicator.style.bearColor = newParams.bearColor;
        if (newParams.minutes !== undefined) indicator.params.minutes = newParams.minutes;
        if (newParams.period1 !== undefined) indicator.params.period1 = newParams.period1;
        if (newParams.period2 !== undefined) indicator.params.period2 = newParams.period2;
        if (newParams.period3 !== undefined) indicator.params.period3 = newParams.period3;
        if (newParams.rsiPeriod !== undefined) indicator.params.rsiPeriod = newParams.rsiPeriod;
        if (newParams.stochLen !== undefined) indicator.params.stochLen = newParams.stochLen;
        if (newParams.percent !== undefined) indicator.params.percent = newParams.percent;
        if (newParams.emaPeriod !== undefined) indicator.params.emaPeriod = newParams.emaPeriod;
        if (newParams.sumPeriod !== undefined) indicator.params.sumPeriod = newParams.sumPeriod;
        if (newParams.wmaPeriod !== undefined) indicator.params.wmaPeriod = newParams.wmaPeriod;
        if (newParams.rangeStart !== undefined) indicator.params.rangeStart = newParams.rangeStart;
        if (newParams.rangeEnd !== undefined) indicator.params.rangeEnd = newParams.rangeEnd;
        if (newParams.lookback !== undefined) indicator.params.lookback = newParams.lookback;
        if (newParams.fibLow !== undefined) indicator.params.fibLow = newParams.fibLow;
        if (newParams.fibHigh !== undefined) indicator.params.fibHigh = newParams.fibHigh;
        if (newParams.extendBars !== undefined) indicator.params.extendBars = newParams.extendBars;
        if (newParams.maxBoxes !== undefined) indicator.params.maxBoxes = newParams.maxBoxes;
        if (newParams.minGapPct !== undefined) indicator.params.minGapPct = newParams.minGapPct;
        if (newParams.maxLookbackDays !== undefined) indicator.params.maxLookbackDays = newParams.maxLookbackDays;
        if (newParams.fractalWidth !== undefined) indicator.params.fractalWidth = newParams.fractalWidth;
        if (newParams.tolerancePct !== undefined) indicator.params.tolerancePct = newParams.tolerancePct;
        if (newParams.minTouches !== undefined) indicator.params.minTouches = newParams.minTouches;
        if (newParams.maxSegments !== undefined) indicator.params.maxSegments = newParams.maxSegments;
        if (newParams.highColor !== undefined) indicator.style.highColor = newParams.highColor;
        if (newParams.lowColor !== undefined) indicator.style.lowColor = newParams.lowColor;
        if (indicator.type === 'sessionsplus') {
            ['showSydney', 'showTokyo', 'showAsian', 'showFrankfurt', 'showLondon', 'showNewYork',
                'sydneyStart', 'sydneyEnd', 'tokyoStart', 'tokyoEnd', 'asianStart', 'asianEnd',
                'frankfurtStart', 'frankfurtEnd', 'londonStart', 'londonEnd', 'newYorkStart', 'newYorkEnd'].forEach(function(k) {
                if (newParams[k] !== undefined) indicator.params[k] = newParams[k];
            });
            ['sydneyColor', 'tokyoColor', 'asianColor', 'frankfurtColor', 'londonColor', 'newYorkColor'].forEach(function(k) {
                if (newParams[k] !== undefined) indicator.style[k] = newParams[k];
            });
        }
        if (indicator.type === 'custom') {
            if (newParams.script !== undefined) indicator.params.script = newParams.script;
            if (newParams.customParams !== undefined) indicator.params.customParams = newParams.customParams;
            if (newParams.name !== undefined) indicator.name = newParams.name;
            if (newParams.timeoutMs !== undefined) indicator.params.timeoutMs = newParams.timeoutMs;
            if (newParams.separatePanel !== undefined) {
                indicator.params.separatePanel = newParams.separatePanel === true;
                indicator.separatePanel = indicator.params.separatePanel;
                if (indicator.separatePanel) indicator.overlay = false;
            }
            if (newParams.overlay !== undefined) {
                indicator.overlay = newParams.overlay !== false;
                if (!indicator.overlay) {
                    indicator.separatePanel = true;
                    indicator.params.separatePanel = true;
                } else {
                    indicator.separatePanel = false;
                    indicator.params.separatePanel = false;
                }
            }
        }
        if (indicator.type === 'cotnet') {
            if (newParams.cftcCode !== undefined) indicator.params.cftcCode = String(newParams.cftcCode).trim();
            if (newParams.dataUrl !== undefined) indicator.params.dataUrl = String(newParams.dataUrl);
            if (newParams.showCommercial !== undefined) indicator.params.showCommercial = newParams.showCommercial !== false;
            if (newParams.showLarge !== undefined) indicator.params.showLarge = newParams.showLarge !== false;
        }
        if (indicator.type === 'seasonality') {
            if (newParams.minSamples !== undefined) indicator.params.minSamples = Math.max(1, parseInt(newParams.minSamples, 10) || 2);
            if (newParams.color !== undefined) indicator.style.color = newParams.color;
            if (newParams.lineWidth !== undefined) indicator.style.lineWidth = newParams.lineWidth;
        }
        if (indicator.type === 'icteverything') {
            var ieDefUp = (typeof window !== 'undefined' && window.INDICATOR_DEFINITIONS && window.INDICATOR_DEFINITIONS.icteverything)
                ? window.INDICATOR_DEFINITIONS.icteverything
                : null;
            if (ieDefUp && ieDefUp.params) {
                ieDefUp.params.forEach(function(p) {
                    if (p.type === 'heading' || p.type === 'divider') return;
                    if (newParams[p.id] === undefined) return;
                    var raw = newParams[p.id];
                    if (p.type === 'checkbox') raw = !!raw;
                    else if (p.type === 'number') {
                        raw = parseFloat(raw);
                        if (isNaN(raw)) return;
                    }
                    indicator.params[p.id] = raw;
                });
            }
        }

        // Recalculate data
        switch (indicator.type) {
            case 'sma':
                indicator.name = 'SMA(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period, indicator.params.source || 'close');
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
            case 'envelope':
            case 'smaenvelope':
                indicator.name = 'Envelope(' + indicator.params.period + ',' + indicator.params.percent + '%)';
                this.indicators.data[indicator.id] = calculateEnvelope(this.data, indicator.params.period, indicator.params.percent);
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
            case 'sessionsplus':
                indicator.name = 'Sessions+';
                this.indicators.data[indicator.id] = calculateSessionsPlus(this.data, {
                    showSydney: indicator.params.showSydney,
                    showTokyo: indicator.params.showTokyo,
                    showAsian: indicator.params.showAsian,
                    showFrankfurt: indicator.params.showFrankfurt,
                    showLondon: indicator.params.showLondon,
                    showNewYork: indicator.params.showNewYork,
                    sydneyStart: indicator.params.sydneyStart,
                    sydneyEnd: indicator.params.sydneyEnd,
                    tokyoStart: indicator.params.tokyoStart,
                    tokyoEnd: indicator.params.tokyoEnd,
                    asianStart: indicator.params.asianStart,
                    asianEnd: indicator.params.asianEnd,
                    frankfurtStart: indicator.params.frankfurtStart,
                    frankfurtEnd: indicator.params.frankfurtEnd,
                    londonStart: indicator.params.londonStart,
                    londonEnd: indicator.params.londonEnd,
                    newYorkStart: indicator.params.newYorkStart,
                    newYorkEnd: indicator.params.newYorkEnd,
                    sydneyColor: indicator.style.sydneyColor,
                    tokyoColor: indicator.style.tokyoColor,
                    asianColor: indicator.style.asianColor,
                    frankfurtColor: indicator.style.frankfurtColor,
                    londonColor: indicator.style.londonColor,
                    newYorkColor: indicator.style.newYorkColor
                });
                break;
            case 'openingrange':
            case 'or':
                indicator.name = 'Opening Range(' + indicator.params.minutes + 'm)';
                this.indicators.data[indicator.id] = calculateOpeningRange(this.data, indicator.params.minutes);
                break;
            case 'supertrend':
                indicator.name = 'Supertrend(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateSupertrend(this.data, indicator.params.period, indicator.params.multiplier);
                break;
            case 'stddev':
                indicator.name = 'StdDev(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateStdDevLine(this.data, indicator.params.period);
                break;
            case 'ao':
                this.indicators.data[indicator.id] = calculateAO(this.data);
                break;
            case 'uo':
                this.indicators.data[indicator.id] = calculateUltimateOscillator(this.data, indicator.params.period1, indicator.params.period2, indicator.params.period3);
                break;
            case 'vortex':
                indicator.name = 'Vortex(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateVortex(this.data, indicator.params.period);
                break;
            case 'ppo':
                indicator.name = 'PPO(' + indicator.params.fast + ',' + indicator.params.slow + ',' + indicator.params.signal + ')';
                this.indicators.data[indicator.id] = calculatePPO(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                break;
            case 'dpo':
                indicator.name = 'DPO(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateDPO(this.data, indicator.params.period);
                break;
            case 'stochrsi':
                indicator.name = 'Stoch RSI(' + indicator.params.rsiPeriod + ',' + indicator.params.stochLen + ')';
                this.indicators.data[indicator.id] = calculateStochRSI(
                    this.data,
                    indicator.params.rsiPeriod,
                    indicator.params.stochLen,
                    indicator.params.smoothK,
                    indicator.params.smoothD
                );
                break;
            case 'massindex':
                indicator.name = 'Mass Index(' + indicator.params.emaPeriod + ',' + indicator.params.sumPeriod + ')';
                this.indicators.data[indicator.id] = calculateMassIndex(
                    this.data,
                    indicator.params.emaPeriod,
                    indicator.params.sumPeriod
                );
                break;
            case 'coppock':
                indicator.name = 'Coppock(' + indicator.params.wmaPeriod + ')';
                this.indicators.data[indicator.id] = calculateCoppock(this.data, indicator.params.wmaPeriod);
                break;
            case 'rvi':
                indicator.name = 'RVI(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateRVI(this.data, indicator.params.period);
                break;
            case 'elderray':
                indicator.name = 'Elder Ray(' + indicator.params.period + ')';
                this.indicators.data[indicator.id] = calculateElderRay(this.data, indicator.params.period);
                break;
            case 'seasonality':
                indicator.name = 'Seasonality (avg % by date)';
                this.indicators.data[indicator.id] = calculateSeasonality(
                    this.data,
                    indicator.params.minSamples != null ? indicator.params.minSamples : 2
                );
                break;
            case 'cotnet':
                this.indicators.data[indicator.id] = { loading: true, error: null };
                if (typeof this._scheduleCotNetLoad === 'function') this._scheduleCotNetLoad(indicator);
                break;
            case 'ictpd':
                indicator.name = 'ICT Prev Day PD';
                this.indicators.data[indicator.id] = calculateIctPrevDayPD(this.data);
                break;
            case 'ictasian':
                indicator.name = 'ICT Asian Range';
                this.indicators.data[indicator.id] = calculateIctAsianRange(this.data, {
                    rangeStart: indicator.params.rangeStart,
                    rangeEnd: indicator.params.rangeEnd
                });
                break;
            case 'ictote':
                indicator.name = 'ICT OTE Zone';
                this.indicators.data[indicator.id] = calculateIctOTE(
                    this.data,
                    indicator.params.lookback,
                    indicator.params.fibLow,
                    indicator.params.fibHigh
                );
                break;
            case 'ictfvg':
                indicator.name = 'ICT Fair Value Gaps';
                this.indicators.data[indicator.id] = calculateFairValueGaps(this.data, {
                    extendBars: indicator.params.extendBars,
                    maxBoxes: indicator.params.maxBoxes,
                    minGapPct: indicator.params.minGapPct
                });
                break;
            case 'ictsesspd':
                indicator.name = 'ICT Session PD';
                this.indicators.data[indicator.id] = calculateIctSessionPrevDayPD(this.data, {
                    rangeStart: indicator.params.rangeStart,
                    rangeEnd: indicator.params.rangeEnd,
                    maxLookbackDays: indicator.params.maxLookbackDays
                });
                break;
            case 'ictliquidity':
                indicator.name = 'ICT Equal L/H Liquidity';
                this.indicators.data[indicator.id] = calculateLiquidityEqualLevels(this.data, {
                    fractalWidth: indicator.params.fractalWidth,
                    tolerancePct: indicator.params.tolerancePct,
                    minTouches: indicator.params.minTouches,
                    maxSegments: indicator.params.maxSegments,
                    extendBars: indicator.params.extendBars
                });
                break;
            case 'icteverything':
                indicator.name = 'ICT Everything';
                this.indicators.data[indicator.id] = calculateIctEverything(this.data, indicator);
                break;
            case 'custom':
                if (typeof this._scheduleCustomIndicatorCompute === 'function') {
                    this._scheduleCustomIndicatorCompute(indicator);
                }
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
                    this.indicators.data[indicator.id] = calculateSMA(this.data, indicator.params.period, indicator.params.source || 'close');
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
                case 'envelope':
                case 'smaenvelope':
                    this.indicators.data[indicator.id] = calculateEnvelope(this.data, indicator.params.period, indicator.params.percent);
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
                case 'sessionsplus':
                    this.indicators.data[indicator.id] = calculateSessionsPlus(this.data, {
                        showSydney: indicator.params.showSydney,
                        showTokyo: indicator.params.showTokyo,
                        showAsian: indicator.params.showAsian,
                        showFrankfurt: indicator.params.showFrankfurt,
                        showLondon: indicator.params.showLondon,
                        showNewYork: indicator.params.showNewYork,
                        sydneyStart: indicator.params.sydneyStart,
                        sydneyEnd: indicator.params.sydneyEnd,
                        tokyoStart: indicator.params.tokyoStart,
                        tokyoEnd: indicator.params.tokyoEnd,
                        asianStart: indicator.params.asianStart,
                        asianEnd: indicator.params.asianEnd,
                        frankfurtStart: indicator.params.frankfurtStart,
                        frankfurtEnd: indicator.params.frankfurtEnd,
                        londonStart: indicator.params.londonStart,
                        londonEnd: indicator.params.londonEnd,
                        newYorkStart: indicator.params.newYorkStart,
                        newYorkEnd: indicator.params.newYorkEnd,
                        sydneyColor: indicator.style.sydneyColor,
                        tokyoColor: indicator.style.tokyoColor,
                        asianColor: indicator.style.asianColor,
                        frankfurtColor: indicator.style.frankfurtColor,
                        londonColor: indicator.style.londonColor,
                        newYorkColor: indicator.style.newYorkColor
                    });
                    break;
                case 'openingrange':
                case 'or':
                    this.indicators.data[indicator.id] = calculateOpeningRange(this.data, indicator.params.minutes);
                    break;
                case 'supertrend':
                    this.indicators.data[indicator.id] = calculateSupertrend(this.data, indicator.params.period, indicator.params.multiplier);
                    break;
                case 'stddev':
                    this.indicators.data[indicator.id] = calculateStdDevLine(this.data, indicator.params.period);
                    break;
                case 'ao':
                    this.indicators.data[indicator.id] = calculateAO(this.data);
                    break;
                case 'uo':
                    this.indicators.data[indicator.id] = calculateUltimateOscillator(this.data, indicator.params.period1, indicator.params.period2, indicator.params.period3);
                    break;
                case 'vortex':
                    this.indicators.data[indicator.id] = calculateVortex(this.data, indicator.params.period);
                    break;
                case 'ppo':
                    this.indicators.data[indicator.id] = calculatePPO(this.data, indicator.params.fast, indicator.params.slow, indicator.params.signal);
                    break;
                case 'dpo':
                    this.indicators.data[indicator.id] = calculateDPO(this.data, indicator.params.period);
                    break;
                case 'envelope':
                case 'smaenvelope':
                    this.indicators.data[indicator.id] = calculateEnvelope(this.data, indicator.params.period, indicator.params.percent);
                    break;
                case 'stochrsi':
                    this.indicators.data[indicator.id] = calculateStochRSI(
                        this.data,
                        indicator.params.rsiPeriod,
                        indicator.params.stochLen,
                        indicator.params.smoothK,
                        indicator.params.smoothD
                    );
                    break;
                case 'massindex':
                    this.indicators.data[indicator.id] = calculateMassIndex(
                        this.data,
                        indicator.params.emaPeriod,
                        indicator.params.sumPeriod
                    );
                    break;
                case 'coppock':
                    this.indicators.data[indicator.id] = calculateCoppock(this.data, indicator.params.wmaPeriod);
                    break;
                case 'rvi':
                    this.indicators.data[indicator.id] = calculateRVI(this.data, indicator.params.period);
                    break;
                case 'elderray':
                    this.indicators.data[indicator.id] = calculateElderRay(this.data, indicator.params.period);
                    break;
                case 'seasonality':
                    this.indicators.data[indicator.id] = calculateSeasonality(
                        this.data,
                        indicator.params.minSamples != null ? indicator.params.minSamples : 2
                    );
                    break;
                case 'cotnet':
                    this.indicators.data[indicator.id] = { loading: true, error: null };
                    if (typeof this._scheduleCotNetLoad === 'function') this._scheduleCotNetLoad(indicator);
                    break;
                case 'ictpd':
                    this.indicators.data[indicator.id] = calculateIctPrevDayPD(this.data);
                    break;
                case 'ictasian':
                    this.indicators.data[indicator.id] = calculateIctAsianRange(this.data, {
                        rangeStart: indicator.params.rangeStart,
                        rangeEnd: indicator.params.rangeEnd
                    });
                    break;
                case 'ictote':
                    this.indicators.data[indicator.id] = calculateIctOTE(
                        this.data,
                        indicator.params.lookback,
                        indicator.params.fibLow,
                        indicator.params.fibHigh
                    );
                    break;
                case 'ictfvg':
                    this.indicators.data[indicator.id] = calculateFairValueGaps(this.data, {
                        extendBars: indicator.params.extendBars,
                        maxBoxes: indicator.params.maxBoxes,
                        minGapPct: indicator.params.minGapPct
                    });
                    break;
                case 'ictsesspd':
                    this.indicators.data[indicator.id] = calculateIctSessionPrevDayPD(this.data, {
                        rangeStart: indicator.params.rangeStart,
                        rangeEnd: indicator.params.rangeEnd,
                        maxLookbackDays: indicator.params.maxLookbackDays
                    });
                    break;
                case 'ictliquidity':
                    this.indicators.data[indicator.id] = calculateLiquidityEqualLevels(this.data, {
                        fractalWidth: indicator.params.fractalWidth,
                        tolerancePct: indicator.params.tolerancePct,
                        minTouches: indicator.params.minTouches,
                        maxSegments: indicator.params.maxSegments,
                        extendBars: indicator.params.extendBars
                    });
                    break;
                case 'icteverything':
                    this.indicators.data[indicator.id] = calculateIctEverything(this.data, indicator);
                    break;
                case 'custom':
                    if (typeof this._scheduleCustomIndicatorCompute === 'function') {
                        this._scheduleCustomIndicatorCompute(indicator);
                    }
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
        volumeLine.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; cursor:default; padding: 2px 6px; margin-right: 8px; border-radius: 3px; transition: background 0.2s;';
        
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
            visibilityBtn.style.cursor = 'default';
            
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
            settingsBtn.style.cursor = 'default';
            
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
            removeBtn.style.cursor = 'default';
            
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
        if (this._sessionIndicatorsRestoreGuardUntil
            && Date.now() < this._sessionIndicatorsRestoreGuardUntil) {
            return;
        }
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
            if (this.selectedOverlayIndicatorId === id) {
                this.selectedOverlayIndicatorId = null;
            }
            this._updateIndicatorPanelHeight();
            
            if (typeof this.render === 'function') {
                this.render();
            }
            
            this.updateOHLCIndicators();
            this.persistIndicators();
            emitIndicatorsChanged(this, 'remove', indicator);
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
        emitIndicatorsChanged(this, 'clear', null);
        return true;
    };
    
    Chart.prototype._parseChartTimeframeForVisibility = function(timeframe) {
        if (typeof timeframe !== 'string') return null;
        const tf = timeframe.trim();
        const m = tf.match(/^(\d+)\s*([a-zA-Z]+)$/);
        if (!m) return null;
        const value = parseInt(m[1], 10);
        if (!Number.isFinite(value)) return null;
        const unitRaw = m[2];
        const unitLower = unitRaw.toLowerCase();
        if (unitLower === 'mo' || unitLower === 'mon' || unitLower === 'month' || unitLower === 'months') {
            return { value: value, unit: 'M' };
        }
        const unitChar = unitRaw.length === 1 ? unitRaw : unitRaw[0];
        if (unitChar === 'M') return { value: value, unit: 'M' };
        const u = unitChar.toLowerCase();
        if (u === 's' || u === 'm' || u === 'h' || u === 'd' || u === 'w') {
            return { value: value, unit: u };
        }
        return null;
    };

    Chart.prototype._indicatorVisibleForCurrentTimeframe = function(indicator) {
        if (!indicator || !this.currentTimeframe) return true;
        const vis = indicator.visibility;
        if (!vis || !vis._ranges) return true;
        const parsed = this._parseChartTimeframeForVisibility(this.currentTimeframe);
        if (!parsed) return true;
        const r = vis._ranges[parsed.unit];
        if (!r) return true;
        if (r.enabled === false) return false;
        const minV = Number.isFinite(+r.min) ? +r.min : null;
        const maxV = Number.isFinite(+r.max) ? +r.max : null;
        if (minV === null || maxV === null) return true;
        return parsed.value >= minV && parsed.value <= maxV;
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
            if (!this._indicatorVisibleForCurrentTimeframe(indicator)) continue;

            const data = this.indicators.data[indicator.id];
            if (!data) continue;

            // Draw based on type
            if (indicator.type === 'bb' || indicator.type === 'bollinger') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'envelope' || indicator.type === 'smaenvelope') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'donchian' || indicator.type === 'keltner') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'psar') {
                this.drawParabolicSAR(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'sessions') {
                this.drawSessions(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'sessionsplus' || indicator.isSessionsPlus) {
                this.drawSessions(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'openingrange') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'ictpd' || indicator.type === 'ictasian' || indicator.type === 'ictote' || indicator.type === 'ictsesspd') {
                this.drawBollingerBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'ictliquidity' || indicator.isLiquidityEq) {
                this.drawLiquidityEqLines(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'ictfvg' || indicator.isIctFvg) {
                this.drawIctFvgBoxes(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'supertrend') {
                this.drawSupertrendOverlay(data, indicator, startIndex, endIndex);
            } else if (indicator.type === 'killzones' || indicator.type === 'ictkz' || indicator.isKillzones) {
                this.drawKillzones(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'icteverything' || indicator.isIctEverything) {
                this.drawIctEverything(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'adr' || indicator.isADR) {
                this.drawADRBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.isATR) {
                this.drawATRBands(data, indicator.style, startIndex, endIndex);
            } else if (indicator.type === 'custom') {
                this.drawCustomOverlayPlots(data, indicator, startIndex, endIndex);
            } else if (indicator.type === 'stddev') {
                this.drawLineIndicator(data, indicator.style.color, indicator.style.lineWidth, startIndex, endIndex, indicator.style.lineStyle);
            } else if (indicator.type === 'sma') {
                this.drawLineIndicator(data, indicator.style.color, indicator.style.lineWidth, startIndex, endIndex, indicator.style.lineStyle);
            } else {
                this.drawLineIndicator(data, indicator.style.color, indicator.style.lineWidth, startIndex, endIndex, indicator.style.lineStyle);
            }
        }

        ctx.restore();
    };

    Chart.prototype.drawSupertrendOverlay = function(data, indicator, startIndex, endIndex) {
        if (!data || !data.line || !data.direction) return;
        const ctx = this.ctx;
        const m = this.margin;
        const upColor = indicator.style.upColor || '#26a69a';
        const downColor = indicator.style.downColor || '#ef5350';
        const lw = indicator.style.lineWidth || 2;
        let i = startIndex;
        while (i < endIndex && i < data.line.length) {
            if (data.line[i] == null || isNaN(data.line[i])) {
                i++;
                continue;
            }
            const dirUp = data.direction[i] >= 0;
            ctx.strokeStyle = dirUp ? upColor : downColor;
            ctx.lineWidth = lw;
            ctx.beginPath();
            let started = false;
            let j = i;
            while (j < endIndex && j < data.line.length && (data.direction[j] >= 0) === dirUp && data.line[j] != null && !isNaN(data.line[j])) {
                const x = this.dataIndexToPixel(j);
                const y = this.yScale(data.line[j]);
                if (x < m.l - 30 || x > this.w - m.r + 30) {
                    if (started) ctx.stroke();
                    started = false;
                    j++;
                    continue;
                }
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
                j++;
            }
            if (started) ctx.stroke();
            i = j > i ? j : i + 1;
        }
    };

    Chart.prototype.drawCustomOverlayPlots = function(data, indicator, startIndex, endIndex) {
        if (!data || data.loading) return;
        if (data.error) return;
        const plots = data.plots;
        if (!Array.isArray(plots) || plots.length === 0) return;
        const ctx = this.ctx;
        const m = this.margin;
        plots.forEach(function(plot) {
            if (!plot || !Array.isArray(plot.values)) return;
            const color = plot.color || indicator.style.color || '#2962ff';
            const lw = plot.lineWidth != null ? plot.lineWidth : (indicator.style.lineWidth || 2);
            if (plot.type === 'line') {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.beginPath();
                let started = false;
                for (let i = startIndex; i < endIndex && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    const x = this.dataIndexToPixel(i);
                    const y = this.yScale(val);
                    if (x < m.l - 20 || x > this.w - m.r + 20) continue;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                if (started) ctx.stroke();
            } else if (plot.type === 'histogram') {
                const baseline = plot.baseline != null && !isNaN(plot.baseline) ? plot.baseline : 0;
                const y0 = this.yScale(baseline);
                for (let i = startIndex; i < endIndex && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    const x = this.dataIndexToPixel(i);
                    const y = this.yScale(val);
                    const cw = Math.max(1, (this.candleWidth || 8) * 0.8);
                    ctx.fillStyle = color;
                    ctx.fillRect(x - cw / 2, Math.min(y0, y), cw, Math.abs(y - y0));
                }
            }
        }, this);
    };

    Chart.prototype._renderCustomSeparatePanelSlot = function(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd) {
        if (!indicatorData || indicatorData.loading) {
            ctx.fillStyle = '#787b86';
            ctx.font = '11px Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('Custom indicator…', (m.l + this.w - m.r) / 2, indTop + panelHeight / 2);
            ctx.textAlign = 'left';
            return;
        }
        if (indicatorData.error) {
            ctx.fillStyle = '#ef5350';
            ctx.font = '11px Roboto';
            ctx.textAlign = 'left';
            const msg = String(indicatorData.error).slice(0, 120);
            ctx.fillText(msg, m.l + 4, indTop + 14);
            return;
        }
        const plots = indicatorData.plots;
        if (!Array.isArray(plots) || plots.length === 0) return;

        let min = Infinity;
        let max = -Infinity;
        for (let pi = 0; pi < plots.length; pi++) {
            const plot = plots[pi];
            if (!plot || !Array.isArray(plot.values)) continue;
            const base = plot.baseline != null && !isNaN(plot.baseline) ? plot.baseline : 0;
            if (plot.type === 'histogram') {
                for (let i = visibleStart; i < visibleEnd && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    min = Math.min(min, val, base);
                    max = Math.max(max, val, base);
                }
            } else {
                for (let i = visibleStart; i < visibleEnd && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    min = Math.min(min, val);
                    max = Math.max(max, val);
                }
            }
        }
        if (min === Infinity || max === -Infinity) return;
        const range = max - min || 1;
        min = min - range * 0.1;
        max = max + range * 0.1;

        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const dom = this._applyIndicatorPanelDomain(min, max, indicator);
        min = dom.min;
        max = dom.max;

        const vSpan = Math.max(1e-12, max - min);
        const scaleY = function(val) {
            if (val === null || val === undefined) return null;
            const y = indBottom - 5 - ((val - min) / vSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(indTop + 2, Math.min(indBottom - 2, y));
        };

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const numGridLines = 4;
        for (let g = 0; g <= numGridLines; g++) {
            const val = min + (max - min) * (g / numGridLines);
            const y = scaleY(val);
            if (y === null) continue;
            ctx.beginPath();
            ctx.moveTo(m.l, y);
            ctx.lineTo(this.w, y);
            ctx.stroke();
            ctx.fillStyle = '#787b86';
            ctx.font = '10px Roboto';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(2), this.w - 6, y + 3);
        }

        plots.forEach(function(plot) {
            if (!plot || !Array.isArray(plot.values)) return;
            const color = plot.color || indicator.style.color || '#2962ff';
            const lw = plot.lineWidth != null ? plot.lineWidth : 2;
            if (plot.type === 'line') {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.beginPath();
                let started = false;
                for (let i = visibleStart; i < visibleEnd && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    const x = this.dataIndexToPixel(i);
                    const y = scaleY(val);
                    if (y === null) continue;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                if (started) ctx.stroke();
            } else if (plot.type === 'histogram') {
                const baseline = plot.baseline != null && !isNaN(plot.baseline) ? plot.baseline : 0;
                const y0 = scaleY(baseline);
                if (y0 === null) return;
                for (let i = visibleStart; i < visibleEnd && i < plot.values.length; i++) {
                    const val = plot.values[i];
                    if (val === null || val === undefined || isNaN(val)) continue;
                    const x = this.dataIndexToPixel(i);
                    const y = scaleY(val);
                    if (y === null) continue;
                    const cw = Math.max(1, (this.candleWidth || 8) * 0.75);
                    ctx.fillStyle = color;
                    ctx.fillRect(x - cw / 2, Math.min(y0, y), cw, Math.abs(y - y0));
                }
            }
        }, this);

        ctx.textAlign = 'left';
    };

const DEFAULT_SEPARATE_PANEL_HEIGHT = 100;
const MIN_SEPARATE_PANEL_HEIGHT = 60;

Chart.prototype._getVisibleSeparateIndicators = function() {
    if (!this.indicators || !this.indicators.active) return [];
    return this.indicators.active.filter(ind => {
        if (ind.type === 'volume' || ind.isVolume) return false;
        const isSeparate = ind.overlay === false || ind.separatePanel === true;
        const isVisible = ind.visible !== false;
        if (!isSeparate || !isVisible) return false;
        return this._indicatorVisibleForCurrentTimeframe(ind);
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

Chart.prototype.getSeparatePanelResizeHandleAt = function(x, y, tolerance = 10) {
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
    const panelAxisLeft = this.w - m.r;
    const panelFullRight = this.w;
    
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
    
    const _isLightBg = document.body.classList.contains('light-mode');

    // Draw full panel background using the same chart background color
    // so separate indicator panes stay visually synced with the main chart.
    const panelBackgroundColor =
        (this.chartSettings && this.chartSettings.backgroundColor) ||
        (typeof getComputedStyle === 'function'
            ? (getComputedStyle(document.documentElement).getPropertyValue('--sp-bg') || '').trim()
            : '') ||
        '#131722';
    ctx.fillStyle = panelBackgroundColor;
    // Extend separate panels to the far right so each panel owns its Y-axis strip.
    ctx.fillRect(m.l, panelTop, panelFullRight - m.l, totalPanelHeight);
    // Dedicated right Y-axis strip for separate indicator panes.
    const axisStripBg = _isLightBg ? 'rgba(242, 245, 251, 0.92)' : 'rgba(10, 14, 28, 0.92)';
    ctx.fillStyle = axisStripBg;
    ctx.fillRect(panelAxisLeft, panelTop, panelFullRight - panelAxisLeft, totalPanelHeight);

    // Divider between indicator plot and indicator Y-axis strip.
    ctx.strokeStyle = 'rgba(120, 123, 134, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelAxisLeft, panelTop);
    ctx.lineTo(panelAxisLeft, panelBottom);
    ctx.stroke();

    // Clip all indicator geometry to this stack so lines/labels never bleed into the time axis.
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, panelTop, panelFullRight - m.l, totalPanelHeight);
    ctx.clip();
    
    // Outer top separator — solid divider line matching panel borders
    const _sepColor = _isLightBg ? 'rgba(119,130,150,0.45)' : 'rgba(110,122,145,0.38)';
    const _sepColorStrong = _isLightBg ? 'rgba(80,96,122,0.6)' : 'rgba(145,160,190,0.52)';
    const _gripColor = _isLightBg ? 'rgba(0, 0, 0, 0.30)' : 'rgba(150, 170, 210, 0.55)';
    const _hoverColor = _isLightBg ? 'rgba(41,98,255,0.60)' : 'rgba(106,138,255,0.72)';
    const _hoverGlow = _isLightBg ? 'rgba(41,98,255,0.22)' : 'rgba(106,138,255,0.30)';
    const hoverHandleY = this._separatePanelHoverHandle && Number.isFinite(this._separatePanelHoverHandle.y)
        ? this._separatePanelHoverHandle.y
        : null;
    ctx.strokeStyle = hoverHandleY !== null && Math.abs(hoverHandleY - panelTop) <= 2 ? _hoverColor : _sepColorStrong;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(m.l, panelTop);
    ctx.lineTo(panelFullRight, panelTop);
    ctx.stroke();
    const topHandleMidX = this.w - m.r - 18;
    const topHandleHover = hoverHandleY !== null && Math.abs(hoverHandleY - panelTop) <= 2;
    ctx.strokeStyle = topHandleHover ? _hoverColor : _gripColor;
    ctx.lineWidth = topHandleHover ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(topHandleMidX - 8, panelTop);
    ctx.lineTo(topHandleMidX + 8, panelTop);
    ctx.stroke();
    if (topHandleHover) {
        ctx.strokeStyle = _hoverGlow;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(topHandleMidX - 10, panelTop);
        ctx.lineTo(topHandleMidX + 10, panelTop);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';
    
    // Visible indices (set in render() from plot left/right); keep in sync with overlay drawIndicators.
    const visibleStart = Math.max(0, Math.floor(Number.isFinite(this.visibleStartIndex) ? this.visibleStartIndex : 0));
    const visibleEnd = Math.min(this.data.length, Math.ceil(Number.isFinite(this.visibleEndIndex) ? this.visibleEndIndex : this.data.length));
    
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
            const isHoverSep = hoverHandleY !== null && Math.abs(hoverHandleY - indBottom) <= 2;
            ctx.strokeStyle = isHoverSep ? _hoverColor : _sepColor;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(m.l, indBottom);
            ctx.lineTo(panelFullRight, indBottom);
            ctx.stroke();
            const handleMidX = this.w - m.r - 18;
            ctx.strokeStyle = isHoverSep ? _hoverColor : _gripColor;
            ctx.lineWidth = isHoverSep ? 3 : 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(handleMidX - 8, indBottom);
            ctx.lineTo(handleMidX + 8, indBottom);
            ctx.stroke();
            if (isHoverSep) {
                ctx.strokeStyle = _hoverGlow;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(handleMidX - 10, indBottom);
                ctx.lineTo(handleMidX + 10, indBottom);
                ctx.stroke();
            }
            ctx.lineCap = 'butt';
        }

        // Give every separate pane its own visible right axis background block.
        ctx.fillStyle = axisStripBg;
        ctx.fillRect(panelAxisLeft, indTop, panelFullRight - panelAxisLeft, panelHeight);
        
        const indicatorData = this.indicators.data[indicator.id];
        if (!indicatorData) return;
        if (indicator.hidePlot === true) {
            indicator._axisLabelTags = [];
            indicator._axisLabelY = null;
            indicator._axisLabelText = '';
            indicator._axisLabelColor = '';
            indicator._displayLabel = '';
            return;
        }
        
        // Type-specific rendering for multi-series indicators
        if (indicator.type === 'macd') {
            this._renderMACDPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'ppo') {
            this._renderMACDPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'stoch' || indicator.type === 'stochastic') {
            this._renderStochPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'stochrsi') {
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
        } else if (indicator.type === 'vortex') {
            this._renderVortexPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'elderray') {
            this._renderElderRayPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'cotnet' || indicator.isCotNet) {
            this._renderCotNetPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'uo') {
            this._renderUltimateOscillatorPanel(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
            return;
        } else if (indicator.type === 'custom') {
            this._renderCustomSeparatePanelSlot(ctx, m, indTop, indBottom, panelHeight, indicator, indicatorData, visibleStart, visibleEnd);
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
        ctx.fillStyle = _isLightBg ? '#5f6b80' : '#9ca7be';
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
            ctx.lineTo(this.w, y);
            ctx.stroke();
            
            // Y-axis label
            ctx.fillStyle = '#787b86';
            ctx.fillText(val.toFixed(2), this.w - 6, y + 3);
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
                    ctx.lineTo(this.w, ry);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = col;
                    ctx.font = '9px Roboto';
                    ctx.textAlign = 'right';
                    ctx.fillText(lvl, this.w - 6, ry - 2);
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
                    ctx.lineTo(this.w, ry);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = col;
                    ctx.font = '9px Roboto';
                    ctx.textAlign = 'right';
                    ctx.fillText(lvl, this.w - 6, ry - 2);
                }
            });
            ctx.textAlign = 'left';
        } else if (indicator.type === 'cmf' || indicator.type === 'trix' || indicator.type === 'rvi' || indicator.type === 'seasonality') {
            const zy = scaleY(0);
            if (zy !== null && zy > indTop && zy < indBottom) {
                ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, zy);
                ctx.lineTo(this.w, zy);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText('0', this.w - 6, zy - 2);
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
        
        indicator._axisLabelTags = [];
        // Draw current value label on right axis
        if (currentValue !== null && currentValue !== undefined && !isNaN(currentValue)) {
            const currentY = scaleY(currentValue);
            indicator._axisLabelY = currentY;
            indicator._axisLabelText = currentValue.toFixed(2);
            indicator._axisLabelColor = color;
            indicator._axisLabelTags = [{
                y: currentY,
                text: currentValue.toFixed(2),
                color: color
            }];
            
            // Dashed line at current value
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, currentY);
            ctx.lineTo(this.w, currentY);
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
    ctx.lineTo(this.w, mouseY);
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
        if (indicators.length > 0 && typeof window.createIndicatorSettingsPanel === 'function') {
            const indicator = indicators[0];
            window.createIndicatorSettingsPanel(this, indicator.type, indicator);
            return true;
        }
    }
    return false;
};

    var OVERLAY_LINE_SELECT_TYPES = {
        sma: 1, ema: 1, wma: 1, dema: 1, tema: 1, hma: 1, vwap: 1, stddev: 1
    };

    function distPointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function getOverlayLineSeries(indicator, data) {
        if (!indicator || !data) return null;
        if (Array.isArray(data)) return data;
        if (indicator.type === 'custom' && Array.isArray(data.plots)) {
            for (let pi = 0; pi < data.plots.length; pi++) {
                const plot = data.plots[pi];
                if (!plot || plot.type === 'histogram') continue;
                if (Array.isArray(plot.values)) return plot.values;
                if (Array.isArray(plot.data)) return plot.data;
            }
            return null;
        }
        if (Array.isArray(data.line)) return data.line;
        return null;
    }

    function isSelectableOverlayLineIndicator(indicator) {
        if (!indicator || indicator.overlay === false || indicator.visible === false) return false;
        if (indicator.separatePanel) return false;
        if (indicator.type === 'custom') return true;
        return !!OVERLAY_LINE_SELECT_TYPES[indicator.type];
    }

    Chart.prototype._getOverlayLineHitTolerance = function(indicator) {
        const lw = indicator && indicator.style && indicator.style.lineWidth != null
            ? Number(indicator.style.lineWidth) : 2;
        return Math.max(7, (Number.isFinite(lw) ? lw : 2) + 6);
    };

    Chart.prototype.findOverlayIndicatorAtPoint = function(mx, my, options) {
        if (!this.indicators || !this.indicators.active || !this.indicators.active.length) return null;
        if (!Number.isFinite(mx) || !Number.isFinite(my) || !this.yScale) return null;
        const m = this.margin;
        if (mx < m.l || mx > this.w - m.r || my < m.t || my > this.h - m.b) return null;

        const opts = options || {};
        const visibleStart = Number.isFinite(this.visibleStartIndex) ? this.visibleStartIndex : 0;
        const visibleEnd = Number.isFinite(this.visibleEndIndex) ? this.visibleEndIndex : (this.data ? this.data.length : 0);
        const buffer = 20;
        const startIndex = Math.max(0, visibleStart - buffer);
        const endIndex = Math.min(this.data ? this.data.length : 0, visibleEnd + buffer);

        for (let ai = this.indicators.active.length - 1; ai >= 0; ai--) {
            const indicator = this.indicators.active[ai];
            if (!isSelectableOverlayLineIndicator(indicator)) continue;
            if (typeof this._indicatorVisibleForCurrentTimeframe === 'function'
                && !this._indicatorVisibleForCurrentTimeframe(indicator)) continue;

            const series = getOverlayLineSeries(indicator, this.indicators.data[indicator.id]);
            if (!series || !series.length) continue;

            const tol = opts.tolerance != null ? opts.tolerance : this._getOverlayLineHitTolerance(indicator);
            let prevX = null;
            let prevY = null;
            let prevOk = false;

            for (let i = startIndex; i < endIndex; i++) {
                const val = series[i];
                if (!Number.isFinite(val)) {
                    prevOk = false;
                    continue;
                }
                const x = this.dataIndexToPixel(i);
                const y = this.yScale(val);
                if (x < m.l - 50 || x > this.w - m.r + 50) {
                    prevOk = false;
                    continue;
                }
                if (Math.hypot(mx - x, my - y) <= tol) return indicator;
                if (prevOk && prevX != null && prevY != null) {
                    if (distPointToSegment(mx, my, prevX, prevY, x, y) <= tol) return indicator;
                }
                prevX = x;
                prevY = y;
                prevOk = true;
            }
        }
        return null;
    };

    Chart.prototype.selectOverlayIndicator = function(id) {
        const nextId = id || null;
        if (this.selectedOverlayIndicatorId === nextId) return;
        this.selectedOverlayIndicatorId = nextId;
        if (typeof this.scheduleRender === 'function') this.scheduleRender();
        else if (typeof this.render === 'function') this.render();
    };

    Chart.prototype.clearOverlayIndicatorSelection = function() {
        if (!this.selectedOverlayIndicatorId) return;
        this.selectedOverlayIndicatorId = null;
        if (typeof this.scheduleRender === 'function') this.scheduleRender();
        else if (typeof this.render === 'function') this.render();
    };

    Chart.prototype.openOverlayIndicatorSettings = function(id) {
        const targetId = id || this.selectedOverlayIndicatorId;
        if (!targetId) return false;
        if (typeof this.showIndicatorSettings === 'function') {
            this.showIndicatorSettings(targetId);
            return true;
        }
        return false;
    };

    Chart.prototype.handleOverlayIndicatorChartClick = function(mx, my) {
        const hit = this.findOverlayIndicatorAtPoint(mx, my);
        if (hit) {
            this.selectOverlayIndicator(hit.id);
            const dm = this.drawingManager;
            if (dm && typeof dm.deselectAll === 'function') {
                dm.deselectAll({ fromCanvasBackground: true });
            }
            return true;
        }
        if (this.selectedOverlayIndicatorId) {
            this.clearOverlayIndicatorSelection();
        }
        return false;
    };

    Chart.prototype.handleOverlayIndicatorChartDoubleClick = function(mx, my) {
        const hit = this.findOverlayIndicatorAtPoint(mx, my);
        if (!hit) return false;
        this.selectOverlayIndicator(hit.id);
        return this.openOverlayIndicatorSettings(hit.id);
    };

    /** Screen-space handle points glued to a visible overlay line polyline (pan/zoom safe). */
    function overlayLineHandlePoints(chart, series, startIndex, endIndex, minSpacingPx) {
        const m = chart.margin || { l: 0, r: 0, t: 0, b: 0 };
        const poly = [];
        for (let i = startIndex; i < endIndex; i++) {
            if (!Number.isFinite(series[i])) continue;
            const x = chart.dataIndexToPixel(i);
            const y = chart.yScale(series[i]);
            if (x < m.l - 24 || x > chart.w - m.r + 24) continue;
            if (y < m.t - 24 || y > chart.h - m.b + 24) continue;
            poly.push({ x: x, y: y });
        }
        if (!poly.length) return [];
        const spacing = Math.max(18, minSpacingPx || 28);
        const out = [{ x: poly[0].x, y: poly[0].y }];
        let distSinceLast = 0;
        for (let j = 1; j < poly.length; j++) {
            const a = poly[j - 1];
            const b = poly[j];
            let ax = a.x;
            let ay = a.y;
            let segRem = Math.hypot(b.x - ax, b.y - ay);
            if (segRem <= 0) continue;
            while (distSinceLast + segRem >= spacing) {
                const need = spacing - distSinceLast;
                const t = need / segRem;
                const nx = ax + (b.x - ax) * t;
                const ny = ay + (b.y - ay) * t;
                out.push({ x: nx, y: ny });
                ax = nx;
                ay = ny;
                segRem = Math.hypot(b.x - ax, b.y - ay);
                distSinceLast = 0;
            }
            distSinceLast += segRem;
        }
        const last = poly[poly.length - 1];
        const prev = out[out.length - 1];
        if (Math.hypot(last.x - prev.x, last.y - prev.y) > spacing * 0.35) {
            out.push({ x: last.x, y: last.y });
        }
        return out;
    }

    Chart.prototype._overlayIndicatorSelectionRange = function() {
        const visibleStart = Number.isFinite(this.visibleStartIndex) ? this.visibleStartIndex : 0;
        const visibleEnd = Number.isFinite(this.visibleEndIndex)
            ? this.visibleEndIndex
            : (this.data ? this.data.length : 0);
        const buffer = 20;
        return {
            startIndex: Math.max(0, visibleStart - buffer),
            endIndex: Math.min(this.data ? this.data.length : 0, visibleEnd + buffer)
        };
    };

    Chart.prototype.syncOverlayIndicatorSelectionOverlay = function() {
        if (!this.svg || this.svg.empty()) return;

        let layer = this.svg.select('g.overlay-indicator-selection');
        if (layer.empty()) {
            layer = this.svg.append('g')
                .attr('class', 'overlay-indicator-selection')
                .style('pointer-events', 'none');
        }
        layer.selectAll('*').remove();
        layer.attr('clip-path', null);

        const id = this.selectedOverlayIndicatorId;
        if (!id || !this.indicators || !this.yScale) return;

        const indicator = this.indicators.active.find(function(ind) { return ind.id === id; });
        if (!indicator || !isSelectableOverlayLineIndicator(indicator)) return;
        if (typeof this._indicatorVisibleForCurrentTimeframe === 'function'
            && !this._indicatorVisibleForCurrentTimeframe(indicator)) return;

        const series = getOverlayLineSeries(indicator, this.indicators.data[id]);
        if (!series || !series.length) return;

        const range = this._overlayIndicatorSelectionRange();
        const handles = overlayLineHandlePoints(this, series, range.startIndex, range.endIndex, 28);
        if (!handles.length) return;

        const color = (indicator.style && indicator.style.color) || '#2962ff';
        const lw = (indicator.style && indicator.style.lineWidth) || 2;
        const radius = Math.max(3.5, lw + 2);
        const bg = (this.chartSettings && this.chartSettings.backgroundColor) || '#131722';

        const dm = this.drawingManager;
        if (dm && typeof dm._clipUrl === 'function') {
            const clipUrl = dm._clipUrl();
            if (clipUrl) layer.attr('clip-path', clipUrl);
        }

        handles.forEach(function(pt) {
            layer.append('circle')
                .attr('cx', pt.x)
                .attr('cy', pt.y)
                .attr('r', radius)
                .attr('fill', bg)
                .attr('stroke', color)
                .attr('stroke-width', 1.5);
        });
    };

    Chart.prototype.drawOverlayIndicatorSelection = function() {
        if (typeof this.syncOverlayIndicatorSelectionOverlay === 'function') {
            this.syncOverlayIndicatorSelectionOverlay();
        }
    };

Chart.prototype._lineDashForStyle = function(lineStyle) {
    const s = String(lineStyle || 'Solid').toLowerCase();
    if (s === 'dashed') return [8, 4];
    if (s === 'dotted') return [2, 3];
    return [];
};

Chart.prototype.drawLineIndicator = function(data, color, lineWidth, startIndex = 0, endIndex = data.length, lineStyle) {
    const ctx = this.ctx;
    const m = this.margin;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(this._lineDashForStyle(lineStyle));
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
    ctx.setLineDash([]);
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
    
    const transparency = data.boxTransparency !== undefined ? data.boxTransparency : 88;
    const baseFillAlpha = Math.min(0.22, Math.max(0.04, (100 - transparency) / 100));
    
    const colorToRgba = function(c, alpha) {
        if (alpha == null || isNaN(alpha)) alpha = 0.18;
        alpha = Math.min(1, Math.max(0, alpha));
        if (!c || typeof c !== 'string') return 'rgba(100,120,160,' + alpha + ')';
        const s = c.trim();
        if (s.indexOf('rgba') === 0 || s.indexOf('rgb(') === 0) {
            const m = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
            if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
        }
        let hex = s.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(function(ch) { return ch + ch; }).join('');
        }
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }
        return 'rgba(100,120,160,' + alpha + ')';
    };
    
    const roundRectPath = function(context, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        if (typeof context.roundRect === 'function') {
            context.beginPath();
            context.roundRect(x, y, w, h, rad);
        } else {
            context.beginPath();
            context.moveTo(x + rad, y);
            context.lineTo(x + w - rad, y);
            context.quadraticCurveTo(x + w, y, x + w, y + rad);
            context.lineTo(x + w, y + h - rad);
            context.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
            context.lineTo(x + rad, y + h);
            context.quadraticCurveTo(x, y + h, x, y + h - rad);
            context.lineTo(x, y + rad);
            context.quadraticCurveTo(x, y, x + rad, y);
            context.closePath();
        }
    };
    
    const boxes = data.boxes.slice().sort(function(a, b) {
        if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
        return (a.endIndex || 0) - (b.endIndex || 0);
    });
    
    const self = this;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    
    boxes.forEach(function(box) {
        let startIdx = box.startIndex;
        let endIdx = box.endIndex;
        if (self.replaySystem && self.replaySystem.isActive && self.data && self.data.length > 0) {
            const maxIdx = self.data.length - 1;
            startIdx = Math.min(Math.max(startIdx, 0), maxIdx);
            endIdx = Math.min(Math.max(endIdx, 0), maxIdx);
        }
        const x1 = self.dataIndexToPixel(startIdx);
        const x2 = self.dataIndexToPixel(endIdx);
        const yTop = self.yScale(box.high);
        const yBot = self.yScale(box.low);
        
        if (x2 < m.l || x1 > self.w - m.r) return;
        
        const drawX1 = Math.max(x1, m.l);
        const drawX2 = Math.min(x2, self.w - m.r);
        const boxWidth = drawX2 - drawX1;
        const top = Math.min(yTop, yBot);
        const bot = Math.max(yTop, yBot);
        const boxHeight = bot - top;
        
        if (boxWidth <= 0 || boxHeight <= 0) return;
        
        const fillCol = colorToRgba(box.color, baseFillAlpha);
        const edgeCol = colorToRgba(box.color, Math.min(0.5, baseFillAlpha * 2.6));
        
        roundRectPath(ctx, drawX1, top, boxWidth, boxHeight, 3);
        ctx.fillStyle = fillCol;
        ctx.fill();
        
        ctx.strokeStyle = edgeCol;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        roundRectPath(ctx, drawX1, top, boxWidth, boxHeight, 3);
        ctx.stroke();
        
        if (data.showMidline) {
            const midY = (top + bot) / 2;
            ctx.strokeStyle = colorToRgba(box.color, 0.2);
            ctx.lineWidth = 1;
            ctx.setLineDash([7, 6]);
            ctx.beginPath();
            ctx.moveTo(drawX1 + 1, midY);
            ctx.lineTo(drawX2 - 1, midY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        if (data.showBoxInfo && boxWidth > 48) {
            const range = box.range;
            const pipMultiplier = self.pipSize || 0.0001;
            const pips = Math.round(range / pipMultiplier);
            const label = box.name + ' · ' + pips + ' pips';
            ctx.font = '600 11px Roboto, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const tw = ctx.measureText(label).width + 16;
            const th = 18;
            let lx = (drawX1 + drawX2) / 2 - tw / 2;
            let ly = top - 6;
            lx = Math.max(m.l + 2, Math.min(lx, self.w - m.r - tw - 2));
            if (ly - th < m.t + 4) {
                ly = bot + th + 8;
            }
            ctx.fillStyle = 'rgba(13, 17, 23, 0.88)';
            roundRectPath(ctx, lx, ly - th, tw, th, 4);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            roundRectPath(ctx, lx, ly - th, tw, th, 4);
            ctx.stroke();
            ctx.fillStyle = style.textColor || '#d1d4dc';
            ctx.fillText(label, lx + tw / 2, ly - 4);
        }
        
        if (data.showDeviations && data.deviationCount > 0) {
            const devRange = box.range;
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = colorToRgba(box.color, 0.26);
            ctx.lineWidth = 1;
            for (let d = 1; d <= data.deviationCount; d++) {
                const upperDevPrice = box.high + (devRange * d);
                const upperY = self.yScale(upperDevPrice);
                if (upperY >= m.t && upperY <= priceAreaBottom) {
                    ctx.beginPath();
                    ctx.moveTo(drawX1, upperY);
                    ctx.lineTo(drawX2, upperY);
                    ctx.stroke();
                }
                const lowerDevPrice = box.low - (devRange * d);
                const lowerY = self.yScale(lowerDevPrice);
                if (lowerY <= priceAreaBottom && lowerY >= m.t) {
                    ctx.beginPath();
                    ctx.moveTo(drawX1, lowerY);
                    ctx.lineTo(drawX2, lowerY);
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]);
        }
    });
    
    ctx.restore();
    
    if (data.showNYMidnight && data.nyMidnight && data.nyMidnight.length > 0) {
        const nyRaw = data.nyMidnightColor || '#2d62b6';
        const nyStroke = colorToRgba(nyRaw, 0.38);
        const prec = self._symbolPrecision != null ? self._symbolPrecision : (self.pricePrecision != null ? self.pricePrecision : 5);
        
        data.nyMidnight.forEach(function(midnight) {
            const visLeft = m.l;
            const visRight = self.w - m.r;
            const xOpen = self.dataIndexToPixel(midnight.index);
            const endIdx = midnight.endIndex != null ? midnight.endIndex : midnight.index;
            const xDayEnd = self.dataIndexToPixel(endIdx);
            const xSegLeft = Math.min(xOpen, xDayEnd);
            const xSegRight = Math.max(xOpen, xDayEnd);
            const y = self.yScale(midnight.price);
            
            const hLeft = Math.max(xSegLeft, visLeft);
            const hRight = Math.min(xSegRight, visRight);
            const vertInView = xOpen >= visLeft && xOpen <= visRight;
            if (hLeft >= hRight && !vertInView) return;
            
            ctx.save();
            ctx.strokeStyle = nyStroke;
            ctx.globalAlpha = 0.9;
            
            if (vertInView) {
                ctx.lineWidth = 1;
                ctx.setLineDash([10, 14]);
                ctx.beginPath();
                ctx.moveTo(xOpen, m.t + 2);
                ctx.lineTo(xOpen, priceAreaBottom - 1);
                ctx.stroke();
            }
            
            if (hLeft < hRight) {
                ctx.setLineDash([12, 8]);
                ctx.lineWidth = 1.15;
                ctx.beginPath();
                ctx.moveTo(hLeft, y);
                ctx.lineTo(hRight, y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            
            const priceText = 'NY Open ' + midnight.price.toFixed(prec);
            ctx.font = '600 11px Roboto, system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            const tw = ctx.measureText(priceText).width + 14;
            const th = 18;
            let lx;
            if (vertInView) {
                lx = xOpen + 6;
                if (lx + tw > visRight - 2) lx = xOpen - tw - 6;
            } else {
                lx = Math.min(hRight - tw - 6, visRight - tw - 8);
                lx = Math.max(hLeft + 4, lx);
            }
            let ly = y - 6;
            if (ly - th < m.t + 2) ly = y + th + 4;
            ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
            roundRectPath(ctx, lx, ly - th, tw, th, 4);
            ctx.fill();
            ctx.strokeStyle = colorToRgba(nyRaw, 0.55);
            ctx.lineWidth = 1;
            roundRectPath(ctx, lx, ly - th, tw, th, 4);
            ctx.stroke();
            ctx.fillStyle = style.textColor || '#d1d4dc';
            ctx.fillText(priceText, lx + 7, ly - 5);
            ctx.restore();
        });
    }
};

Chart.prototype.drawIctEverything = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.dom) return;
    const ctx = this.ctx;
    const m = this.margin;
    const ch = this.h - m.t - m.b;
    const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? this.volumeHeight : 0;
    const volumeAreaHeight = ch * effectiveVolumeHeight;
    const priceAreaBottom = this.h - m.b - volumeAreaHeight;
    const n = this.data ? this.data.length : 0;
    endIndex = endIndex == null ? n : Math.min(endIndex, n);
    const self = this;

    const colorToRgba = function(c, alpha) {
        if (alpha == null || isNaN(alpha)) alpha = 0.18;
        alpha = Math.min(1, Math.max(0, alpha));
        if (!c || typeof c !== 'string') return 'rgba(100,120,160,' + alpha + ')';
        const s = c.trim();
        if (s.indexOf('rgba') === 0 || s.indexOf('rgb(') === 0) {
            const mm = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
            if (mm) return 'rgba(' + mm[1] + ',' + mm[2] + ',' + mm[3] + ',' + alpha + ')';
        }
        let hex = s.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(function(ch) { return ch + ch; }).join('');
        }
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }
        return 'rgba(100,120,160,' + alpha + ')';
    };

    if (data.sessionStrips && data.sessionStrips.length) {
        const candleWidth = this.candleWidth || 8;
        for (let i = startIndex; i < endIndex && i < data.sessionStrips.length; i++) {
            const row = data.sessionStrips[i];
            if (!row || !row.length) continue;
            const x = self.dataIndexToPixel(i);
            if (x < m.l - candleWidth || x > self.w - m.r + candleWidth) continue;
            row.forEach(function(seg) {
                ctx.fillStyle = seg.color;
                ctx.fillRect(x - candleWidth / 2, m.t, candleWidth, priceAreaBottom - m.t);
            });
        }
    }

    if (data.boxes && data.boxes.length) {
        const kzLike = {
            boxes: data.boxes,
            showMidline: false,
            showBoxInfo: data.showBoxInfo !== false,
            showDeviations: false,
            boxTransparency: data.boxTransparency != null ? data.boxTransparency : 88
        };
        this.drawKillzones(kzLike, style, startIndex, endIndex);
    }

    if (data.boxDeviations && data.boxDeviations.length) {
        data.boxDeviations.forEach(function(seg) {
            if (seg.endIndex < startIndex || seg.startIndex > endIndex) return;
            const x1 = self.dataIndexToPixel(seg.startIndex);
            const x2 = self.dataIndexToPixel(seg.endIndex);
            if (x2 < m.l || x1 > self.w - m.r) return;
            const drawX1 = Math.max(x1, m.l);
            const drawX2 = Math.min(x2, self.w - m.r);
            const y = self.yScale(seg.price);
            if (y < m.t || y > priceAreaBottom) return;
            ctx.save();
            ctx.strokeStyle = colorToRgba(seg.color || '#787b86', 0.45);
            ctx.lineWidth = seg.lw != null ? seg.lw : 1;
            ctx.setLineDash(seg.dash && seg.dash.length ? seg.dash : []);
            ctx.beginPath();
            ctx.moveTo(drawX1, y);
            ctx.lineTo(drawX2, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        });
    }

    if (data.verticals && data.verticals.length) {
        data.verticals.forEach(function(v) {
            if (v.index < startIndex || v.index > endIndex) return;
            const x = self.dataIndexToPixel(v.index);
            if (x < m.l || x > self.w - m.r) return;
            ctx.save();
            ctx.strokeStyle = colorToRgba(v.color || '#787b86', 0.55);
            ctx.lineWidth = v.lw != null ? v.lw : 1;
            ctx.setLineDash(v.dash && v.dash.length ? v.dash : []);
            ctx.beginPath();
            ctx.moveTo(x, m.t + 2);
            ctx.lineTo(x, priceAreaBottom - 1);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        });
    }

    if (data.horizontals && data.horizontals.length) {
        const prec = self._symbolPrecision != null ? self._symbolPrecision : (self.pricePrecision != null ? self.pricePrecision : 5);
        data.horizontals.forEach(function(h) {
            if (h.endIndex < startIndex || h.startIndex > endIndex) return;
            const x1 = self.dataIndexToPixel(h.startIndex);
            const x2 = self.dataIndexToPixel(h.endIndex);
            const drawX1 = Math.max(x1, m.l);
            const drawX2 = Math.min(x2, self.w - m.r);
            const y = self.yScale(h.price);
            if (y < m.t || y > priceAreaBottom) return;
            ctx.save();
            ctx.strokeStyle = colorToRgba(h.color || '#787b86', 0.65);
            ctx.lineWidth = h.lw != null ? h.lw : 1;
            ctx.setLineDash(h.dash && h.dash.length ? h.dash : []);
            ctx.beginPath();
            ctx.moveTo(drawX1, y);
            ctx.lineTo(drawX2, y);
            ctx.stroke();
            ctx.setLineDash([]);
            if (h.showLabel && h.label && drawX2 - drawX1 > 40) {
                const txt = String(h.label) + ' ' + h.price.toFixed(prec);
                ctx.font = '600 10px Roboto, system-ui, sans-serif';
                ctx.fillStyle = 'rgba(13, 17, 23, 0.88)';
                const tw = ctx.measureText(txt).width + 8;
                ctx.fillRect(drawX2 - tw - 2, y - 16, tw, 14);
                ctx.fillStyle = style.textColor || '#d1d4dc';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(txt, drawX2 - tw, y - 15);
            }
            ctx.restore();
        });
    }

    if (data.dowMarks && data.dowMarks.length && this.data) {
        ctx.save();
        ctx.font = '700 11px Roboto, system-ui, sans-serif';
        data.dowMarks.forEach(function(dm) {
            if (dm.index < startIndex || dm.index > endIndex) return;
            const x = self.dataIndexToPixel(dm.index);
            if (!self.data[dm.index]) return;
            var y;
            if (dm.bottom) {
                y = self.h - m.b - 4;
                ctx.textBaseline = 'bottom';
            } else {
                y = m.t + 18;
                ctx.textBaseline = 'top';
            }
            ctx.fillStyle = colorToRgba(dm.color || '#787b86', 0.9);
            ctx.textAlign = 'center';
            ctx.fillText(dm.text || '', x, y);
        });
        ctx.restore();
    }
};

Chart.prototype.drawIctFvgBoxes = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.boxes || data.boxes.length === 0) return;
    const ctx = this.ctx;
    const m = this.margin;
    const bull = style.bullColor || 'rgba(38, 166, 154, 0.22)';
    const bear = style.bearColor || 'rgba(239, 83, 80, 0.22)';
    const lw = style.lineWidth || 1;
    const n = this.data ? this.data.length : 0;
    endIndex = endIndex == null ? n : Math.min(endIndex, n);

    data.boxes.forEach(function(box) {
        if (box.endIndex < startIndex || box.startIndex > endIndex) return;
        let si = box.startIndex;
        let ei = box.endIndex;
        if (this.replaySystem && this.replaySystem.isActive && n > 0) {
            const maxIdx = n - 1;
            si = Math.min(Math.max(si, 0), maxIdx);
            ei = Math.min(Math.max(ei, 0), maxIdx);
        }
        const x1 = this.dataIndexToPixel(si);
        const x2 = this.dataIndexToPixel(ei);
        const topP = Math.max(box.top, box.bottom);
        const botP = Math.min(box.top, box.bottom);
        const yTop = this.yScale(topP);
        const yBot = this.yScale(botP);
        if (x2 < m.l || x1 > this.w - m.r) return;
        const drawX1 = Math.max(x1, m.l);
        const drawX2 = Math.min(x2, this.w - m.r);
        const boxWidth = drawX2 - drawX1;
        const boxHeight = yBot - yTop;
        if (boxWidth <= 0 || boxHeight <= 0) return;
        ctx.fillStyle = box.bullish ? bull : bear;
        ctx.fillRect(drawX1, yTop, boxWidth, boxHeight);
        ctx.strokeStyle = box.bullish ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)';
        ctx.lineWidth = lw;
        ctx.strokeRect(drawX1, yTop, boxWidth, boxHeight);
    }, this);
};

Chart.prototype.drawLiquidityEqLines = function(data, style, startIndex = 0, endIndex) {
    if (!data || !data.segments || data.segments.length === 0) return;
    const ctx = this.ctx;
    const m = this.margin;
    const ch = this.h - m.t - m.b;
    const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? this.volumeHeight : 0;
    const volumeAreaHeight = ch * effectiveVolumeHeight;
    const priceAreaBottom = this.h - m.b - volumeAreaHeight;
    const hiCol = style.highColor || '#f23645';
    const loCol = style.lowColor || '#2962ff';
    const lw = style.lineWidth != null ? style.lineWidth : 1;
    const n = this.data ? this.data.length : 0;
    endIndex = endIndex == null ? n : Math.min(endIndex, n);
    ctx.setLineDash([6, 4]);
    data.segments.forEach(function(seg) {
        if (seg.endIndex < startIndex || seg.startIndex > endIndex) return;
        const x1 = this.dataIndexToPixel(seg.startIndex);
        const x2 = this.dataIndexToPixel(seg.endIndex);
        if (x2 < m.l || x1 > this.w - m.r) return;
        const drawX1 = Math.max(x1, m.l);
        const drawX2 = Math.min(x2, this.w - m.r);
        const y = this.yScale(seg.price);
        if (y < m.t || y > priceAreaBottom) return;
        ctx.strokeStyle = seg.kind === 'high' ? hiCol : loCol;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(drawX1, y);
        ctx.lineTo(drawX2, y);
        ctx.stroke();
    }, this);
    ctx.setLineDash([]);
};
    
    Chart.prototype.updateOHLCIndicators = function() {
        // Main chart (panel 0 or single-chart) uses unsuffixed DOM ids; see chart.js updateChartOHLCSymbol / crosshair OHLC.
        const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
        const div = document.getElementById('ohlcIndicators' + idSuffix);
        
        if (!div) return;
        
        // Don't update if modal is open (prevents destroying DOM while editing)
        if (document.getElementById('indicator-settings-modal') || document.querySelector('[data-v9-ind-sett="1"]')) return;
        
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
        
        const formatOverlayValues = function(indicator, valuesStore) {
            if (!valuesStore) return [];
            const out = [];
            const pushToken = function(val, color, decimals) {
                if (!Number.isFinite(val)) return;
                out.push({
                    text: Number(val).toFixed(decimals),
                    color: color || '#9ca3af'
                });
            };
            if (Array.isArray(valuesStore)) {
                for (let i = valuesStore.length - 1; i >= 0; i--) {
                    if (Number.isFinite(valuesStore[i])) {
                        pushToken(valuesStore[i], indicator.style && indicator.style.color, 4);
                        break;
                    }
                }
                return out;
            }
            if (typeof valuesStore === 'object') {
                const keys = ['upper', 'middle', 'lower', 'ema1', 'ema2', 'ema3', 'fast', 'slow'];
                keys.forEach(function(k) {
                    const arr = valuesStore[k];
                    if (!Array.isArray(arr)) return;
                    for (let i = arr.length - 1; i >= 0; i--) {
                        if (Number.isFinite(arr[i])) {
                            const colorKey = k + 'Color';
                            pushToken(arr[i], indicator.style && indicator.style[colorKey], 4);
                            break;
                        }
                    }
                });
                if (out.length > 0) return out;
            }
            return out;
        };

        for (let i = 0; i < overlayIndicators.length; i++) {
            const indicator = overlayIndicators[i];
            const item = document.createElement('div');
            item.className = 'talaria-ind-legend-row';
            item.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:4px;width:fit-content;max-width:100%;align-self:flex-start;background:transparent;border:none;border-radius:0;padding:0;font-family:Roboto,sans-serif;';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = '- ' + indicator.name;
            nameSpan.style.cssText = 'color:#d1d4dc;font-size:11px;font-weight:500;user-select:none;opacity:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;max-width:40%;';
            nameSpan.title = indicator.name;
            item.appendChild(nameSpan);

            const valuesSpan = document.createElement('span');
            valuesSpan.style.cssText = 'font-size:10px;font-weight:500;font-variant-numeric:tabular-nums;text-align:left;min-width:auto;flex:0 0 auto;display:inline-flex;gap:3px;align-items:center;opacity:1;';
            const valueTokens = formatOverlayValues(indicator, this.indicators && this.indicators.data ? this.indicators.data[indicator.id] : null);
            if (valueTokens.length === 0) {
                const dash = document.createElement('span');
                dash.textContent = '—';
                dash.style.cssText = 'color:#9ca3af;';
                valuesSpan.appendChild(dash);
            } else {
                valueTokens.forEach(function(tok) {
                    const t = document.createElement('span');
                    t.textContent = tok.text;
                    t.style.cssText = 'color:' + (tok.color || '#9ca3af') + ';';
                    valuesSpan.appendChild(t);
                });
            }
            item.appendChild(valuesSpan);

            const actions = document.createElement('span');
            actions.className = 'talaria-ind-actions';
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:4px;flex-shrink:0;padding:0;background:transparent;border:none;box-shadow:none;';

            const self = this;
            const id = indicator.id;

            const baseActionStyle = getTalariaActionBtnStyle();

            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            const applyEyeState = () => {
                const on = indicator.visible !== false;
                visibilityBtn.style.cssText = baseActionStyle + 'color:' + (on ? '#d1d4dc' : '#787b86') + ';background:transparent;opacity:1;';
            };
            applyEyeState();
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            };
            visibilityBtn.onmouseleave = function() {
                applyEyeState();
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                indicator.visible = indicator.visible === false ? true : false;
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                applyEyeState();
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
            settingsBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.23.6.62.6 1s.24.77.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33c-.36.23-.6.62-.6 1z"/></svg>';
            settingsBtn.style.cssText = baseActionStyle + 'color:#787b86;background:transparent;border:none;box-shadow:none;';
            settingsBtn.onmouseenter = function() {
                settingsBtn.style.color = '#d1d4dc';
                settingsBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            };
            settingsBtn.onmouseleave = function() {
                settingsBtn.style.color = '#787b86';
                settingsBtn.style.background = 'transparent';
            };
            settingsBtn.onclick = function(e) {
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(id);
            };
            settingsBtn.onpointerdown = function(e) {
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(id);
            };
            settingsBtn.onmousedown = function(e) { e.stopPropagation(); };
            actions.appendChild(settingsBtn);

            const openIndSettings = function(e) {
                e.stopPropagation();
                if (typeof self.showIndicatorSettings === 'function') self.showIndicatorSettings(id);
            };
            nameSpan.style.cursor = 'default';
            nameSpan.onpointerdown = openIndSettings;
            nameSpan.onmousedown = function(e) { e.stopPropagation(); };
            nameSpan.onclick = function(e) { e.stopPropagation(); };
            valuesSpan.style.cursor = 'default';
            valuesSpan.onpointerdown = openIndSettings;
            valuesSpan.onmousedown = function(e) { e.stopPropagation(); };
            valuesSpan.onclick = function(e) { e.stopPropagation(); };

            const removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = baseActionStyle + 'color:#f23645;font-size:14px;font-weight:600;line-height:1;background:transparent;';
            removeBtn.onmouseenter = function() {
                removeBtn.style.background = 'rgba(242, 54, 69, 0.2)';
            };
            removeBtn.onmouseleave = function() {
                removeBtn.style.color = '#f23645';
                removeBtn.style.background = 'transparent';
            };
            removeBtn.onclick = function(e) {
                e.stopPropagation();
                self.removeIndicator(id);
            };
            actions.appendChild(removeBtn);

            item.appendChild(actions);
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
            const indicator = this.indicators.active.find(function(ind) {
                return ind.id === id;
            });

            if (!indicator) {
                console.warn('[chart] showIndicatorSettings: indicator not found', id);
                return;
            }

            // Single UI path: indicator-ui.js (must load after this file — see dist-v9/index.html).
            if (typeof window.createIndicatorSettingsPanel === 'function') {
                window.createIndicatorSettingsPanel(this, indicator.type, indicator);
                return;
            }

            // If indicator-ui is still loading, V9 React may still open when definitions + hook exist.
            if (typeof window.__v9OpenIndicatorSettings === 'function' && window.INDICATOR_DEFINITIONS) {
                try {
                    if (window.__v9OpenIndicatorSettings(this, indicator.type, indicator) === true) {
                        return;
                    }
                } catch (e) {
                    console.warn('[chart] __v9OpenIndicatorSettings', e);
                }
            }

            console.error(
                '[chart] Indicator settings unavailable: load /chart/modules/indicator-ui.js after chart-indicators-full.js ' +
                '(defines window.createIndicatorSettingsPanel and INDICATOR_DEFINITIONS).'
            );
        } catch (error) {
            console.warn('[chart] showIndicatorSettings failed:', error);
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
            // Do not skip by x: panel ctx is already clipped; skipping broke polylines at pan edges.
            if (y === null || !Number.isFinite(y)) { started = false; continue; }
            if (useClip) y = Math.max(clipTop + 0.5, Math.min(clipBottom - 0.5, y));
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
        }
        if (started) ctx.stroke();
    };

    // Shared right-axis ticks + grid for separate indicator panels.
    Chart.prototype._drawPanelAxisTicks = function(ctx, m, min, max, scaleY, decimals) {
        const d = Number.isFinite(decimals) ? decimals : 2;
        ctx.font = '10px Roboto';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#787b86';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const numGridLines = 4;
        for (let i = 0; i <= numGridLines; i++) {
            const tickVal = min + (max - min) * (i / numGridLines);
            const tickY = scaleY(tickVal);
            if (!Number.isFinite(tickY)) continue;
            ctx.beginPath();
            ctx.moveTo(m.l, tickY);
            ctx.lineTo(this.w, tickY);
            ctx.stroke();
            ctx.fillText(tickVal.toFixed(d), this.w - 6, tickY + 3);
        }
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

        this._drawPanelAxisTicks(ctx, m, min, max, scaleY, 4);

        // Zero line
        const zeroY = scaleY(0);
        if (zeroY !== null && zeroY > panelTop && zeroY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(m.l, zeroY);
            ctx.lineTo(this.w, zeroY);
            ctx.stroke();
        }

        // Histogram bars
        const barW = Math.max(1, (this.candleWidth || 8) * 0.8);
        for (let i = visibleStart; i < visibleEnd && i < histArr.length; i++) {
            const val = histArr[i];
            if (val === null || val === undefined || isNaN(val)) continue;
            const x = this.dataIndexToPixel(i);
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

        // Show latest MACD value tag on the right axis strip
        const macdTags = [];
        if (lastM !== null && Number.isFinite(lastM)) {
            const yM = scaleY(lastM);
            if (Number.isFinite(yM)) {
                const mColor = indicator.style.macdColor || '#2962ff';
                macdTags.push({ y: yM, text: lastM.toFixed(4), color: mColor });
            }
        }
        if (lastS !== null && Number.isFinite(lastS)) {
            const yS = scaleY(lastS);
            if (Number.isFinite(yS)) {
                const sColor = indicator.style.signalColor || '#f23645';
                macdTags.push({ y: yS, text: lastS.toFixed(4), color: sColor });
            }
        }
        macdTags.sort(function(a, b) { return a.y - b.y; });
        for (let i = 1; i < macdTags.length; i++) {
            if (macdTags[i].y - macdTags[i - 1].y < 18) macdTags[i].y = macdTags[i - 1].y + 18;
        }
        for (let i = macdTags.length - 2; i >= 0; i--) {
            if (macdTags[i + 1].y > panelBottom - 8) {
                macdTags[i + 1].y = panelBottom - 8;
                if (macdTags[i + 1].y - macdTags[i].y < 18) macdTags[i].y = macdTags[i + 1].y - 18;
            }
            if (macdTags[i].y < panelTop + 8) macdTags[i].y = panelTop + 8;
        }
        indicator._axisLabelTags = macdTags;
        if (macdTags.length > 0) {
            indicator._axisLabelY = macdTags[0].y;
            indicator._axisLabelText = macdTags[0].text;
            indicator._axisLabelColor = macdTags[0].color;
        }
        macdTags.forEach((tag) => {
            const labelWidth = 58;
            const labelHeight = 16;
            ctx.fillStyle = tag.color;
            ctx.fillRect(this.w - m.r + 2, tag.y - labelHeight / 2, labelWidth, labelHeight);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px Roboto';
            ctx.textAlign = 'center';
            ctx.fillText(tag.text, this.w - m.r + 2 + labelWidth / 2, tag.y + 4);
        });

        indicator._displayColor = indicator.style.macdColor || '#2962ff';
        indicator._displayLabel = lastM !== null ? 'M:' + lastM.toFixed(5) + (lastS !== null ? '  S:' + lastS.toFixed(5) : '') : '';
    };

    Chart.prototype._renderVortexPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data || !data.viPlus || !data.viMinus) return;
        const a = data.viPlus;
        const b = data.viMinus;
        let min = Infinity;
        let max = -Infinity;
        for (let i = visibleStart; i < visibleEnd; i++) {
            if (a[i] != null && !isNaN(a[i])) {
                min = Math.min(min, a[i]);
                max = Math.max(max, a[i]);
            }
            if (b[i] != null && !isNaN(b[i])) {
                min = Math.min(min, b[i]);
                max = Math.max(max, b[i]);
            }
        }
        if (min === Infinity) return;
        const range = max - min || 1;
        min -= range * 0.08;
        max += range * 0.08;
        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const dom = this._applyIndicatorPanelDomain(min, max, indicator);
        min = dom.min;
        max = dom.max;
        const vSpan = Math.max(1e-12, max - min);
        const scaleY = function(val) {
            if (val === null || val === undefined) return null;
            const y = panelBottom - 5 - ((val - min) / vSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };
        this._drawPanelAxisTicks(ctx, m, min, max, scaleY, 2);
        this._drawPanelLine(ctx, m, a, indicator.style.plusColor || '#00e676', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, b, indicator.style.minusColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        const zy = scaleY(1);
        if (zy !== null && zy > panelTop && zy < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(m.l, zy);
            ctx.lineTo(this.w, zy);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        indicator._displayColor = indicator.style.plusColor || '#00e676';
        indicator._displayLabel = 'VI';
    };

    Chart.prototype._renderElderRayPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data || !data.bull || !data.bear) return;
        const a = data.bull;
        const b = data.bear;
        let min = Infinity;
        let max = -Infinity;
        for (let i = visibleStart; i < visibleEnd; i++) {
            if (a[i] != null && !isNaN(a[i])) {
                min = Math.min(min, a[i]);
                max = Math.max(max, a[i]);
            }
            if (b[i] != null && !isNaN(b[i])) {
                min = Math.min(min, b[i]);
                max = Math.max(max, b[i]);
            }
        }
        if (min === Infinity) return;
        const range = max - min || 1;
        min -= range * 0.08;
        max += range * 0.08;
        if (min > 0) min = Math.min(min, 0);
        if (max < 0) max = Math.max(max, 0);
        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const dom = this._applyIndicatorPanelDomain(min, max, indicator);
        min = dom.min;
        max = dom.max;
        const vSpan = Math.max(1e-12, max - min);
        const scaleY = function(val) {
            if (val === null || val === undefined) return null;
            const y = panelBottom - 5 - ((val - min) / vSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };
        this._drawPanelAxisTicks(ctx, m, min, max, scaleY, 2);
        const zy = scaleY(0);
        if (zy !== null && zy > panelTop && zy < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(m.l, zy);
            ctx.lineTo(this.w, zy);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        this._drawPanelLine(ctx, m, a, indicator.style.bullColor || '#26a69a', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, b, indicator.style.bearColor || '#ef5350', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        indicator._displayColor = indicator.style.bullColor || '#26a69a';
        indicator._displayLabel = 'Elder Ray';
    };

    Chart.prototype._renderCotNetPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!data) return;
        if (data.loading) {
            ctx.fillStyle = '#787b86';
            ctx.font = '11px Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('Loading COT…', (m.l + this.w - m.r) / 2, panelTop + panelHeight / 2);
            ctx.textAlign = 'left';
            return;
        }
        if (data.error) {
            ctx.fillStyle = '#ef5350';
            ctx.font = '11px Roboto';
            ctx.textAlign = 'left';
            ctx.fillText(String(data.error).slice(0, 140), m.l + 4, panelTop + 14);
            ctx.textAlign = 'left';
            return;
        }
        if (!data.bull || !data.bear) return;
        const showC = indicator.params && indicator.params.showCommercial !== false;
        const showL = indicator.params && indicator.params.showLarge !== false;
        const a = data.bull;
        const b = data.bear;
        let min = Infinity;
        let max = -Infinity;
        for (let i = visibleStart; i < visibleEnd; i++) {
            if (showC && a[i] != null && !isNaN(a[i])) {
                min = Math.min(min, a[i]);
                max = Math.max(max, a[i]);
            }
            if (showL && b[i] != null && !isNaN(b[i])) {
                min = Math.min(min, b[i]);
                max = Math.max(max, b[i]);
            }
        }
        if (min === Infinity) return;
        const range = max - min || 1;
        min -= range * 0.08;
        max += range * 0.08;
        if (min > 0) min = Math.min(min, 0);
        if (max < 0) max = Math.max(max, 0);
        indicator._panelBaseMin = min;
        indicator._panelBaseMax = max;
        const dom = this._applyIndicatorPanelDomain(min, max, indicator);
        min = dom.min;
        max = dom.max;
        const vSpan = Math.max(1e-12, max - min);
        const scaleY = function(val) {
            if (val === null || val === undefined) return null;
            const y = panelBottom - 5 - ((val - min) / vSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };
        this._drawPanelAxisTicks(ctx, m, min, max, scaleY, 2);
        const zy = scaleY(0);
        if (zy !== null && zy > panelTop && zy < panelBottom) {
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(m.l, zy);
            ctx.lineTo(this.w, zy);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        const lw = indicator.style.lineWidth || 2;
        if (showC) {
            this._drawPanelLine(ctx, m, a, indicator.style.bullColor || '#26a69a', lw, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        }
        if (showL) {
            this._drawPanelLine(ctx, m, b, indicator.style.bearColor || '#ef5350', lw, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        }
        indicator._displayColor = indicator.style.bullColor || '#26a69a';
        if (data._cotMarket) {
            const m = data._cotMarket;
            indicator._displayLabel = m.length > 42 ? m.slice(0, 39) + '…' : m;
        } else {
            indicator._displayLabel = data._cotNote === 'file' ? 'COT (file)' : 'COT (CFTC)';
        }
    };

    Chart.prototype._renderUltimateOscillatorPanel = function(ctx, m, panelTop, panelBottom, panelHeight, indicator, data, visibleStart, visibleEnd) {
        if (!Array.isArray(data)) return;
        indicator._panelBaseMin = 0;
        indicator._panelBaseMax = 100;
        const domS = this._applyIndicatorPanelDomain(0, 100, indicator);
        const sMin = domS.min;
        const sMax = domS.max;
        const sSpan = Math.max(1e-9, sMax - sMin);
        const scaleY = function(v) {
            if (v === null || v === undefined) return null;
            const y = panelBottom - 5 - ((v - sMin) / sSpan) * (panelHeight - 10);
            if (!Number.isFinite(y)) return null;
            return Math.max(panelTop + 2, Math.min(panelBottom - 2, y));
        };
        this._drawPanelAxisTicks(ctx, m, sMin, sMax, scaleY, 2);
        [[70, 'rgba(239,83,80,0.45)'], [50, 'rgba(120,123,134,0.3)'], [30, 'rgba(38,166,154,0.45)']].forEach(function(row) {
            const lvl = row[0];
            const col = row[1];
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w, ry);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }, this);
        this._drawPanelLine(ctx, m, data, indicator.style.color || '#7e57c2', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        indicator._displayColor = indicator.style.color || '#7e57c2';
        indicator._displayLabel = 'UO';
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
        this._drawPanelAxisTicks(ctx, m, sMin, sMax, scaleY, 2);

        [[80, 'rgba(239,83,80,0.5)'], [50, 'rgba(120,123,134,0.3)'], [20, 'rgba(38,166,154,0.5)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(lvl, this.w - 6, ry - 2);
            }
        });

        this._drawPanelLine(ctx, m, kArr, indicator.style.kColor || '#2962ff', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);
        this._drawPanelLine(ctx, m, dArr, indicator.style.dColor || '#f23645', indicator.style.lineWidth || 2, visibleStart, visibleEnd, scaleY, panelTop, panelBottom);

        let lastK = null, lastD = null;
        for (let i = Math.min(visibleEnd - 1, kArr.length - 1); i >= visibleStart; i--) {
            if (kArr[i] !== null && !isNaN(kArr[i])) { lastK = kArr[i]; lastD = dArr[i]; break; }
        }
        const stochTags = [];
        if (lastK !== null && Number.isFinite(lastK)) {
            const yK = scaleY(lastK);
            if (Number.isFinite(yK)) stochTags.push({ y: yK, text: lastK.toFixed(2), color: indicator.style.kColor || '#2962ff' });
        }
        if (lastD !== null && Number.isFinite(lastD)) {
            const yD = scaleY(lastD);
            if (Number.isFinite(yD)) stochTags.push({ y: yD, text: lastD.toFixed(2), color: indicator.style.dColor || '#f23645' });
        }
        stochTags.sort(function(a, b) { return a.y - b.y; });
        for (let i = 1; i < stochTags.length; i++) {
            if (stochTags[i].y - stochTags[i - 1].y < 18) stochTags[i].y = stochTags[i - 1].y + 18;
        }
        for (let i = stochTags.length - 2; i >= 0; i--) {
            if (stochTags[i + 1].y > panelBottom - 8) {
                stochTags[i + 1].y = panelBottom - 8;
                if (stochTags[i + 1].y - stochTags[i].y < 18) stochTags[i].y = stochTags[i + 1].y - 18;
            }
            if (stochTags[i].y < panelTop + 8) stochTags[i].y = panelTop + 8;
        }
        indicator._axisLabelTags = stochTags;
        if (stochTags.length > 0) {
            indicator._axisLabelY = stochTags[0].y;
            indicator._axisLabelText = stochTags[0].text;
            indicator._axisLabelColor = stochTags[0].color;
        } else {
            indicator._axisLabelY = null;
            indicator._axisLabelText = '';
            indicator._axisLabelColor = '';
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
        this._drawPanelAxisTicks(ctx, m, aMin, aMax, scaleY, 2);

        // 25 threshold line
        const thY = scaleY(25);
        if (thY !== null && thY > panelTop && thY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, thY);
            ctx.lineTo(this.w, thY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '9px Roboto';
            ctx.textAlign = 'right';
            ctx.fillText('25', this.w - 6, thY - 2);
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
        this._drawPanelAxisTicks(ctx, m, aMin, aMax, scaleY, 0);

        const thY = scaleY(70);
        if (thY !== null && thY > panelTop && thY < panelBottom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(m.l, thY);
            ctx.lineTo(this.w, thY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '9px Roboto';
            ctx.textAlign = 'right';
            ctx.fillText('70', this.w - 6, thY - 2);
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
        this._drawPanelAxisTicks(ctx, m, wMin, wMax, scaleY, 0);

        [[-20, 'rgba(239,83,80,0.45)'], [-50, 'rgba(120,123,134,0.25)'], [-80, 'rgba(38,166,154,0.45)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(String(lvl), this.w - 6, ry - 2);
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
        this._drawPanelAxisTicks(ctx, m, sMin, sMax, scaleY, 2);

        [[80, 'rgba(239,83,80,0.5)'], [50, 'rgba(120,123,134,0.3)'], [20, 'rgba(38,166,154,0.5)']].forEach(([lvl, col]) => {
            const ry = scaleY(lvl);
            if (ry !== null && ry > panelTop && ry < panelBottom) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(m.l, ry);
                ctx.lineTo(this.w, ry);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = col;
                ctx.font = '9px Roboto';
                ctx.textAlign = 'right';
                ctx.fillText(String(lvl), this.w - 6, ry - 2);
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

    Chart.prototype._renderSeparatePanelLegendValue = function(el, ind) {
        if (!el || !ind) return;
        el.innerHTML = '';
        if (ind.hideValues === true) return;
        const tags = Array.isArray(ind._axisLabelTags) ? ind._axisLabelTags : [];
        if (tags.length > 1) {
            tags.forEach(function(tag, i) {
                const sp = document.createElement('span');
                sp.textContent = String(tag && tag.text != null ? tag.text : '—');
                sp.style.cssText = 'color:' + (tag && tag.color ? tag.color : '#9ca3af') + ';';
                el.appendChild(sp);
                if (i < tags.length - 1) {
                    const gap = document.createElement('span');
                    gap.textContent = ' ';
                    gap.style.cssText = 'color:#6b7280;';
                    el.appendChild(gap);
                }
            });
            return;
        }
        const t = (ind._displayLabel !== undefined && ind._displayLabel !== '') ? String(ind._displayLabel) : '—';
        const sp = document.createElement('span');
        sp.textContent = t;
        sp.style.cssText = 'color:' + (ind._displayColor || '#9ca3af') + ';';
        el.appendChild(sp);
    };

    /** Update crosshair-driven values on separate-panel legend rows without rebuilding DOM. */
    Chart.prototype._syncSeparatePanelOverlayValues = function(overlay, indicators) {
        if (!overlay || !Array.isArray(indicators)) return;
        const byId = {};
        overlay.querySelectorAll('[data-talaria-sp-val]').forEach(function(n) {
            byId[n.getAttribute('data-talaria-sp-val')] = n;
        });
        indicators.forEach(function(ind) {
            if (ind.type === 'volume' || ind.isVolume) return;
            const el = byId[String(ind.id)];
            if (!el) return;
            this._renderSeparatePanelLegendValue(el, ind);
        }, this);
    };

    /** Keep persistent right-axis tags in sync during replay/crosshair updates. */
    Chart.prototype._syncSeparatePanelAxisTags = function(overlay, indicators, panelSlots) {
        if (!overlay || !Array.isArray(indicators)) return;
        overlay.querySelectorAll('[data-talaria-sp-axis-tag]').forEach(function(n) { n.remove(); });
        overlay.querySelectorAll('[data-talaria-sp-axis-tick]').forEach(function(n) { n.remove(); });
        const m = this.margin || { r: 56 };
        const axisLeft = this.w - m.r;
        const axisWidth = Math.max(30, m.r - 4);
        const scaleTextSize = (this.chartSettings && Number.isFinite(this.chartSettings.scaleTextSize))
            ? this.chartSettings.scaleTextSize
            : 11;

        const slotById = {};
        if (Array.isArray(panelSlots)) {
            panelSlots.forEach(function(slot) {
                if (slot && slot.indicator) slotById[String(slot.indicator.id)] = slot;
            });
            // Draw all inter-panel separators on axis overlay so they are always visible.
            if (panelSlots.length > 1) {
                panelSlots.slice(0, -1).forEach(function(slot) {
                    if (!slot || !Number.isFinite(slot.top)) return;
                    const sep = document.createElement('div');
                    sep.setAttribute('data-talaria-sp-axis-tick', '1');
                    sep.style.cssText = [
                        'position:absolute',
                        'left:' + axisLeft + 'px',
                        'top:' + (slot.top - 1.5) + 'px',
                        'width:' + m.r + 'px',
                        'height:3px',
                        'background:rgba(120, 123, 134, 0.42)',
                        'z-index:10',
                        'pointer-events:none'
                    ].join(';');
                    overlay.appendChild(sep);
                });
            }
            // Divider between main price-axis region and indicator-axis region.
            const topSlot = panelSlots[panelSlots.length - 1];
            if (topSlot && Number.isFinite(topSlot.top)) {
                const split = document.createElement('div');
                split.setAttribute('data-talaria-sp-axis-tick', '1');
                split.style.cssText = [
                    'position:absolute',
                    'left:' + axisLeft + 'px',
                    'top:' + (topSlot.top - 1.5) + 'px',
                    'width:' + m.r + 'px',
                    'height:3px',
                    'background:rgba(120, 123, 134, 0.42)',
                    'z-index:10',
                    'pointer-events:none'
                ].join(';');
                overlay.appendChild(split);
            }
        }

        indicators.forEach(function(indicator) {
            if (indicator.type === 'volume' || indicator.isVolume) return;
            const slot = slotById[String(indicator.id)];
            // Keep a safety gap under the split line so indicator axis values
            // never overlap with the main price-axis labels.
            const isTopIndicatorSlot = !!(slot && Array.isArray(panelSlots) && slot.index === panelSlots.length - 1);
            const boundaryGap = isTopIndicatorSlot ? 18 : 8;
            const topBound = slot ? slot.top + boundaryGap : 0;
            const bottomBound = slot ? slot.bottom - 8 : Number.MAX_SAFE_INTEGER;
            const tags = Array.isArray(indicator._axisLabelTags) && indicator._axisLabelTags.length
                ? indicator._axisLabelTags
                : (Number.isFinite(indicator._axisLabelY) ? [{
                    y: indicator._axisLabelY,
                    text: indicator._axisLabelText,
                    color: indicator._axisLabelColor || indicator._displayColor || indicator.style.color || '#2962ff'
                }] : []);
            if (indicator.hideValues === true) return;

            if (slot) {
                const b0 = Number(indicator._panelBaseMin);
                const b1 = Number(indicator._panelBaseMax);
                let d0 = b0;
                let d1 = b1;
                if (Number.isFinite(b0) && Number.isFinite(b1) && b1 > b0 && typeof this._applyIndicatorPanelDomain === 'function') {
                    const dom = this._applyIndicatorPanelDomain(b0, b1, indicator);
                    if (dom && Number.isFinite(dom.min) && Number.isFinite(dom.max) && dom.max > dom.min) {
                        d0 = dom.min;
                        d1 = dom.max;
                    }
                }
                if (Number.isFinite(d0) && Number.isFinite(d1) && d1 > d0) {
                    const span = Math.max(1e-12, d1 - d0);
                    const decimals = span >= 100 ? 0 : (span >= 10 ? 2 : 4);
                    const tickCount = 4;
                    for (let i = 0; i <= tickCount; i++) {
                        const v = d0 + (d1 - d0) * (i / tickCount);
                        const y = slot.bottom - 5 - ((v - d0) / span) * (slot.height - 10);
                        if (!Number.isFinite(y)) continue;
                        if (y < topBound || y > bottomBound) continue;
                        // Keep a small gap so tick labels don't overlap colored live-value tags.
                        const tooCloseToTag = tags.some(function(tag) {
                            if (!Number.isFinite(tag.y)) return false;
                            const tagY = Math.max(topBound, Math.min(bottomBound, tag.y));
                            return Math.abs(y - tagY) < 14;
                        });
                        if (tooCloseToTag) continue;
                        const tick = document.createElement('div');
                        tick.setAttribute('data-talaria-sp-axis-tick', '1');
                        tick.style.cssText = [
                            'position:absolute',
                            'left:' + (axisLeft + 2) + 'px',
                            'top:' + (y - 8) + 'px',
                            'height:16px',
                            'width:' + axisWidth + 'px',
                            'display:flex',
                            'align-items:center',
                            'justify-content:center',
                            'font:500 ' + scaleTextSize + 'px Roboto,sans-serif',
                            'line-height:16px',
                            'font-variant-numeric:tabular-nums',
                            'color:#787b86',
                            'z-index:10',
                            'pointer-events:none',
                            'white-space:nowrap'
                        ].join(';');
                        tick.textContent = v.toFixed(decimals);
                        overlay.appendChild(tick);
                    }
                }
            }
            tags.forEach(function(tag) {
                if (!Number.isFinite(tag.y)) return;
                const y = Math.max(topBound, Math.min(bottomBound, tag.y));
                const axisTag = document.createElement('div');
                axisTag.setAttribute('data-talaria-sp-axis-tag', '1');
                const bg = (tag.color || indicator._displayColor || indicator.style.color || '#2962ff');
                const textColor = (typeof this.isLightColor === 'function' && this.isLightColor(bg)) ? '#111111' : '#ffffff';
                axisTag.style.cssText = [
                    'position:absolute',
                    'left:' + (axisLeft + 2) + 'px',
                    'top:' + (y - 10) + 'px',
                    'width:' + axisWidth + 'px',
                    'height:20px',
                    'padding:0',
                    'display:flex',
                    'align-items:center',
                    'justify-content:center',
                    'border-radius:2px',
                    'font:500 ' + scaleTextSize + 'px Roboto,sans-serif',
                    'line-height:20px',
                    'font-variant-numeric:tabular-nums',
                    'color:' + textColor,
                    'background:' + bg,
                    'z-index:11',
                    'pointer-events:none',
                    'box-sizing:border-box'
                ].join(';');
                axisTag.textContent = (tag.text !== undefined && tag.text !== null && tag.text !== '') ? String(tag.text) : '—';
                overlay.appendChild(axisTag);
            });
        }, this);
    };

    // Build/refresh indicator label pills for each separate panel slot (matches OHLC panel style)
    Chart.prototype._updateSeparatePanelLabels = function(panelSlots, indicators, m) {
        const canvas = this.ctx && this.ctx.canvas;
        const wrapper = canvas ? canvas.parentElement : null;
        if (!wrapper) return;
        if (!Array.isArray(panelSlots) || panelSlots.length === 0) return;

        // Structure key only — do NOT include _displayLabel (it updates every crosshair move and caused
        // full DOM rebuilds + shifting icon columns when value string width changed).
        const structureKey = panelSlots.map(function(slot) {
            return slot.indicator.id + ':' + Math.round(slot.top) + ':' + Math.round(slot.height);
        }).join('|') + '|' + indicators.map(function(ind) {
            return ind.id + ':' + (ind.visible !== false ? '1' : '0') + ':' + (ind._displayColor || '');
        }).join('|');

        let overlay = wrapper.querySelector('#separatePanelsOverlay');
        if (overlay && overlay._structureKey === structureKey) {
            this._syncSeparatePanelOverlayValues(overlay, indicators);
            this._syncSeparatePanelAxisTags(overlay, indicators, panelSlots);
            return;
        }

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'separatePanelsOverlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
            wrapper.appendChild(overlay);
        }
        overlay.innerHTML = '';
        overlay._structureKey = structureKey;

        const self = this;
        // Use accent color cached by applyChartSettings — avoids getComputedStyle in the hot render path
        const accentColor = this._cachedAccentColor || '#2962ff';

        indicators.forEach(function(indicator, idx) {
            if (indicator.type === 'volume' || indicator.isVolume) return;
            const slot = panelSlots[idx];
            if (!slot) return;
            const slotTop = slot.top;
            const visible = indicator.visible !== false;
            const showPlot = indicator.hidePlot !== true;
            const showValues = indicator.hideValues !== true;

            // Compact-width row (name + value + actions) so crosshair / chart hits pass beside the strip
            const bar = document.createElement('div');
            bar.className = 'talaria-ind-legend-row';
            bar.style.cssText = [
                'position:absolute',
                'top:' + (slotTop + 2) + 'px',
                'left:' + (m.l + 6) + 'px',
                'width:max-content',
                'max-width:' + Math.max(120, (self.w || 0) - m.l - m.r - 12) + 'px',
                'box-sizing:border-box',
                'display:flex',
                'align-items:center',
                'gap:4px',
                'justify-content:flex-start',
                'min-width:0',
                'z-index:10',
                'pointer-events:auto',
                'user-select:none',
                'font-family:Roboto,sans-serif'
            ].join(';') + ';margin:0;background:transparent;border:none;border-radius:0;padding:0;';

            const nameEl = document.createElement('span');
            nameEl.textContent = '- ' + indicator.name;
            nameEl.style.cssText = 'color:#d1d4dc;font-size:11px;font-weight:500;user-select:none;opacity:1' +
                ';flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;';
            bar.appendChild(nameEl);

            const valEl = document.createElement('span');
            valEl.setAttribute('data-talaria-sp-val', String(indicator.id));
            valEl.style.cssText = 'font-size:10px;font-weight:500;font-variant-numeric:tabular-nums;text-align:left;' +
                'min-width:auto;flex:0 0 auto;display:inline-flex;gap:3px;align-items:center;opacity:1;';
            self._renderSeparatePanelLegendValue(valEl, indicator);
            bar.appendChild(valEl);

            const actions = document.createElement('span');
            actions.className = 'talaria-ind-actions';
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:4px;flex:0 0 auto;padding:0;background:transparent;border:none;box-shadow:none;';
            const baseActionStyle = getTalariaActionBtnStyle();

            const eyeBtn = document.createElement('span');
            eyeBtn.title = showPlot ? 'Hide indicator' : 'Show indicator';
            const applyPlotEyeState = () => {
                const on = indicator.hidePlot === true;
                eyeBtn.style.cssText = baseActionStyle + 'color:' + (on ? '#d1d4dc' : '#787b86') + ';background:transparent;opacity:1;';
            };
            applyPlotEyeState();
            eyeBtn.innerHTML = showPlot
                ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            eyeBtn.onmouseenter = function() { eyeBtn.style.background = 'rgba(255, 255, 255, 0.08)'; };
            eyeBtn.onmouseleave = function() { applyPlotEyeState(); };
            eyeBtn.onclick = function(e) {
                e.stopPropagation();
                const nextHidden = !(indicator.hidePlot === true);
                indicator.hidePlot = nextHidden;
                indicator.hideValues = nextHidden;
                applyPlotEyeState();
                if (typeof self.render === 'function') self.render();
            };
            actions.appendChild(eyeBtn);

            const setBtn = document.createElement('span');
            setBtn.style.cssText = baseActionStyle + 'color:#787b86;background:transparent;border:none;box-shadow:none;';
            setBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.23.6.62.6 1s.24.77.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33c-.36.23-.6.62-.6 1z"/></svg>';
            setBtn.onmouseenter = function() {
                setBtn.style.color = '#d1d4dc';
                setBtn.style.background = 'rgba(255, 255, 255, 0.08)';
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
            delBtn.style.cssText = baseActionStyle + 'color:#f23645;font-size:14px;font-weight:600;line-height:1;background:transparent;';
            delBtn.onmouseenter = function() { delBtn.style.background = 'rgba(242, 54, 69, 0.2)'; };
            delBtn.onmouseleave = function() { delBtn.style.color = '#f23645'; delBtn.style.background = 'transparent'; };
            delBtn.onclick = function(e) {
                e.stopPropagation();
                if (typeof self.removeIndicator === 'function') self.removeIndicator(indicator.id);
            };
            actions.appendChild(delBtn);

            bar.appendChild(actions);
            overlay.appendChild(bar);

        });
        this._syncSeparatePanelAxisTags(overlay, indicators, panelSlots);
    };

    Chart.prototype.drawOverlayIndicatorPriceLabels = function(visible) {
        if (!this.indicators || !this.indicators.active || !this.yScale || !this.ctx) return;

        const m = this.margin;
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings && this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        const maxY = this.h - m.b - volumeAreaHeight;
        const labels = [];

        this.indicators.active.forEach(function(indicator) {
            if (indicator.overlay === false || indicator.visible === false) return;
            if (!this._indicatorVisibleForCurrentTimeframe(indicator)) return;
            if (indicator.style && indicator.style.showLabel === false) return;
            if (indicator.type !== 'sma') return;

            const data = this.indicators.data[indicator.id];
            if (!Array.isArray(data)) return;

            let val = null;
            for (let i = data.length - 1; i >= 0; i--) {
                if (Number.isFinite(data[i])) {
                    val = data[i];
                    break;
                }
            }
            if (!Number.isFinite(val)) return;

            const y = this.yScale(val);
            if (!Number.isFinite(y) || y < m.t || y > maxY) return;

            labels.push({
                y: y,
                val: val,
                color: indicator.style.color || '#2962ff'
            });
        }, this);

        if (!labels.length) return;

        labels.sort(function(a, b) { return a.y - b.y; });
        const minGap = 22;
        for (let i = 1; i < labels.length; i++) {
            if (labels[i].y - labels[i - 1].y < minGap) {
                labels[i].y = labels[i - 1].y + minGap;
            }
        }

        const ctx = this.ctx;
        const axisLeft = !!this.priceAxisLeft;
        const axisW = axisLeft ? m.l : m.r;
        const labelWidth = axisW - 4;
        const labelX = axisLeft ? 2 : this.w - m.r;
        const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
        const decimals = typeof this.getPriceDecimals === 'function' ? this.getPriceDecimals(priceRange) : 4;
        const scaleTextSize = (this.chartSettings && this.chartSettings.scaleTextSize) || 11;
        const radius = 2;

        labels.forEach(function(lbl) {
            const bgColor = lbl.color;
            const priceText = Number(lbl.val).toFixed(decimals);
            const labelHeight = 20;
            const labelY = lbl.y - labelHeight / 2;
            const textColor = (typeof this.isLightColor === 'function' && this.isLightColor(bgColor)) ? '#111111' : '#ffffff';

            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.moveTo(labelX + radius, labelY);
            ctx.lineTo(labelX + labelWidth - radius, labelY);
            ctx.arcTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + radius, radius);
            ctx.lineTo(labelX + labelWidth, labelY + labelHeight - radius);
            ctx.arcTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - radius, labelY + labelHeight, radius);
            ctx.lineTo(labelX + radius, labelY + labelHeight);
            ctx.arcTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - radius, radius);
            ctx.lineTo(labelX, labelY + radius);
            ctx.arcTo(labelX, labelY, labelX + radius, labelY, radius);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '500 ' + scaleTextSize + 'px Roboto';
            ctx.fillText(priceText, labelX + labelWidth / 2, labelY + labelHeight / 2);
        }, this);
    };

    if (typeof Chart.prototype.drawCurrentPriceLabel === 'function' && !Chart.prototype._overlayPriceLabelsHooked) {
        Chart.prototype._overlayPriceLabelsHooked = true;
        const _origDrawCurrentPriceLabel = Chart.prototype.drawCurrentPriceLabel;
        Chart.prototype.drawCurrentPriceLabel = function(visible) {
            _origDrawCurrentPriceLabel.call(this, visible);
            if (typeof this.drawOverlayIndicatorPriceLabels === 'function') {
                this.drawOverlayIndicatorPriceLabels(visible);
            }
        };
    }

    // Mark as loaded
    window.INDICATORS_MODULE_LOADED = true;
    
    } // End of attachIndicatorMethods
    
    // Start initialization
    initIndicatorsModule();
    
})(window);