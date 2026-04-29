// indicator-ui.js

// 1. Indicator Definitions
const INDICATOR_DEFINITIONS = {
    sma: {
        name: 'Simple Moving Average',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#2962ff' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    ema: {
        name: 'Exponential Moving Average',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    bb: {
        name: 'Bollinger Bands',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'stdDev', label: 'Std Dev', type: 'number', default: 2, min: 0.5, step: 0.1 },
            { id: 'upperColor', label: 'Upper Band Color', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Middle Band Color', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Lower Band Color', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Fill Color (RGBA)', type: 'text', default: 'rgba(41,98,255,0.1)' }
        ]
    },
    envelope: {
        name: 'SMA Envelope',
        type: 'overlay',
        params: [
            { id: 'period', label: 'SMA length', type: 'number', default: 20, min: 1 },
            { id: 'percent', label: 'Band %', type: 'number', default: 2.5, min: 0.1, step: 0.1 },
            { id: 'upperColor', label: 'Upper band', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Middle (SMA)', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Lower band', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Fill (RGBA)', type: 'text', default: 'rgba(41,98,255,0.08)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    rsi: {
        name: 'Relative Strength Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#9c27b0' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    macd: {
        name: 'Moving Average Convergence Divergence',
        type: 'separate',
        params: [
            { id: 'fast', label: 'Fast Length', type: 'number', default: 12, min: 1 },
            { id: 'slow', label: 'Slow Length', type: 'number', default: 26, min: 1 },
            { id: 'signal', label: 'Signal Length', type: 'number', default: 9, min: 1 },
            { id: 'macdColor', label: 'MACD Line Color', type: 'color', default: '#2962ff' },
            { id: 'signalColor', label: 'Signal Line Color', type: 'color', default: '#f23645' },
            { id: 'histogramColor', label: 'Histogram Color', type: 'color', default: '#787b86' }
        ]
    },
    wma: {
        name: 'Weighted Moving Average',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#ff9800' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    vwap: {
        name: 'Volume Weighted Average Price',
        type: 'overlay',
        params: [
            { id: 'color', label: 'Color', type: 'color', default: '#00bcd4' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    stoch: {
        name: 'Stochastic Oscillator',
        type: 'separate',
        params: [
            { id: 'period', label: 'K-Period', type: 'number', default: 14, min: 1 },
            { id: 'smoothK', label: 'K-Smoothing', type: 'number', default: 3, min: 1 },
            { id: 'smoothD', label: 'D-Smoothing', type: 'number', default: 3, min: 1 },
            { id: 'kColor', label: '%K Color', type: 'color', default: '#2962ff' },
            { id: 'dColor', label: '%D Color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    atr: {
        name: 'Average True Range',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#ff6d00' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    cci: {
        name: 'Commodity Channel Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#00e676' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    adx: {
        name: 'Average Directional Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'adxColor', label: 'ADX Line Color', type: 'color', default: '#ff00ff' },
            { id: 'plusDIColor', label: '+DI Color', type: 'color', default: '#00e676' },
            { id: 'minusDIColor', label: '-DI Color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    adr: {
        name: 'Average Daily Range',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length (Days)', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#26a69a' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    volume: {
        name: 'Volume',
        type: 'separate',
        params: [
            { id: 'upColor', label: 'Up Volume Color', type: 'color', default: 'rgba(8, 153, 129, 0.5)' },
            { id: 'downColor', label: 'Down Volume Color', type: 'color', default: 'rgba(242, 54, 69, 0.5)' },
            { id: 'showMA', label: 'Show Moving Average', type: 'checkbox', default: false },
            { id: 'maPeriod', label: 'MA Period', type: 'number', default: 20, min: 1 },
            { id: 'maColor', label: 'MA Color', type: 'color', default: '#2962ff' }
        ]
    },
    sessions: {
        name: 'Trading Sessions',
        type: 'overlay',
        params: [
            // Asian Session
            { id: 'showAsian', label: 'Asian Session', type: 'checkbox', default: true },
            { id: 'asianStart', label: 'Asian Start (UTC)', type: 'time', default: '00:00' },
            { id: 'asianEnd', label: 'Asian End (UTC)', type: 'time', default: '09:00' },
            { id: 'asianColor', label: 'Asian Color', type: 'color', default: 'rgba(255, 193, 7, 0.15)' },
            // London Session
            { id: 'showLondon', label: 'London Session', type: 'checkbox', default: true },
            { id: 'londonStart', label: 'London Start (UTC)', type: 'time', default: '07:00' },
            { id: 'londonEnd', label: 'London End (UTC)', type: 'time', default: '16:00' },
            { id: 'londonColor', label: 'London Color', type: 'color', default: 'rgba(33, 150, 243, 0.15)' },
            // New York Session
            { id: 'showNewYork', label: 'New York Session', type: 'checkbox', default: true },
            { id: 'newYorkStart', label: 'NY Start (UTC)', type: 'time', default: '12:00' },
            { id: 'newYorkEnd', label: 'NY End (UTC)', type: 'time', default: '21:00' },
            { id: 'newYorkColor', label: 'NY Color', type: 'color', default: 'rgba(76, 175, 80, 0.15)' }
        ]
    },
    killzones: {
        name: 'ICT Kill Zones',
        type: 'overlay',
        params: [
            // Session Visibility
            { id: 'showCBDR', label: 'CBDR Session', type: 'checkbox', default: true },
            { id: 'showAsia', label: 'Asia Session', type: 'checkbox', default: true },
            { id: 'showLondon', label: 'London Session', type: 'checkbox', default: true },
            { id: 'showNYAM', label: 'NY AM Session', type: 'checkbox', default: true },
            { id: 'showLC', label: 'London Close', type: 'checkbox', default: true },
            // Display Options
            { id: 'showNYMidnight', label: 'NY Midnight Open', type: 'checkbox', default: true },
            { id: 'showMidline', label: 'Session Midline', type: 'checkbox', default: true },
            { id: 'showBoxInfo', label: 'Box Labels', type: 'checkbox', default: true },
            { id: 'showDeviations', label: 'Deviations', type: 'checkbox', default: false },
            { id: 'deviationCount', label: 'Deviation Count', type: 'number', default: 2, min: 1, max: 5 },
            { id: 'boxTransparency', label: 'Box Transparency', type: 'number', default: 88, min: 0, max: 100 },
            // Session Times (NY Timezone)
            { id: 'cbdrStart', label: 'CBDR Start (NY)', type: 'time', default: '14:00' },
            { id: 'cbdrEnd', label: 'CBDR End (NY)', type: 'time', default: '20:00' },
            { id: 'asiaStart', label: 'Asia Start (NY)', type: 'time', default: '20:00' },
            { id: 'asiaEnd', label: 'Asia End (NY)', type: 'time', default: '00:00' },
            { id: 'londonStart', label: 'London Start (NY)', type: 'time', default: '02:00' },
            { id: 'londonEnd', label: 'London End (NY)', type: 'time', default: '05:00' },
            { id: 'nyamStart', label: 'NY AM Start (NY)', type: 'time', default: '07:00' },
            { id: 'nyamEnd', label: 'NY AM End (NY)', type: 'time', default: '10:00' },
            { id: 'lcStart', label: 'LC Start (NY)', type: 'time', default: '10:00' },
            { id: 'lcEnd', label: 'LC End (NY)', type: 'time', default: '12:00' },
            // Session Colors
            { id: 'cbdrColor', label: 'CBDR Color', type: 'color', default: '#0064ff' },
            { id: 'asiaColor', label: 'Asia Color', type: 'color', default: '#7622ff' },
            { id: 'londonColor', label: 'London Color', type: 'color', default: '#e90000' },
            { id: 'nyamColor', label: 'NY AM Color', type: 'color', default: '#00acb8' },
            { id: 'lcColor', label: 'London Close Color', type: 'color', default: '#434651' },
            { id: 'nyMidnightColor', label: 'NY Midnight Color', type: 'color', default: '#2d62b6' },
            { id: 'textColor', label: 'Text Color', type: 'color', default: '#5c71af' }
        ]
    },
    dema: {
        name: 'Double EMA (DEMA)',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#00bcd4' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    tema: {
        name: 'Triple EMA (TEMA)',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#ab47bc' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    hma: {
        name: 'Hull Moving Average',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#26c6da' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    roc: {
        name: 'Rate of Change',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 12, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#ffa726' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    mom: {
        name: 'Momentum',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 10, min: 1 },
            { id: 'color', label: 'Color', type: 'color', default: '#66bb6a' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    obv: {
        name: 'On Balance Volume',
        type: 'separate',
        params: [
            { id: 'color', label: 'Line Color', type: 'color', default: '#78909c' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    willr: {
        name: 'Williams %R',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#ec407a' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    mfi: {
        name: 'Money Flow Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 2 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#5c6bc0' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    donchian: {
        name: 'Donchian Channels',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'upperColor', label: 'Upper Band Color', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Middle Band Color', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Lower Band Color', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Fill Color (RGBA)', type: 'text', default: 'rgba(41,98,255,0.06)' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    keltner: {
        name: 'Keltner Channels',
        type: 'overlay',
        params: [
            { id: 'emaPeriod', label: 'EMA Length', type: 'number', default: 20, min: 1 },
            { id: 'atrPeriod', label: 'ATR Length', type: 'number', default: 10, min: 1 },
            { id: 'multiplier', label: 'ATR Multiplier', type: 'number', default: 2, min: 0.1, step: 0.1 },
            { id: 'upperColor', label: 'Upper Band Color', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Middle Band Color', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Lower Band Color', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Fill Color (RGBA)', type: 'text', default: 'rgba(41,98,255,0.05)' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    aroon: {
        name: 'Aroon',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'upColor', label: 'Aroon Up Color', type: 'color', default: '#00e676' },
            { id: 'downColor', label: 'Aroon Down Color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    cmf: {
        name: 'Chaikin Money Flow',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#29b6f6' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    trix: {
        name: 'TRIX',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#8d6e63' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    psar: {
        name: 'Parabolic SAR',
        type: 'overlay',
        params: [
            { id: 'step', label: 'Start AF (step)', type: 'number', default: 0.02, min: 0.001, step: 0.001 },
            { id: 'maxStep', label: 'Max AF', type: 'number', default: 0.2, min: 0.01, step: 0.01 },
            { id: 'bullColor', label: 'Bull Color', type: 'color', default: '#26a69a' },
            { id: 'bearColor', label: 'Bear Color', type: 'color', default: '#ef5350' },
            { id: 'lineWidth', label: 'Dot Size (rel.)', type: 'number', default: 2, min: 1, max: 6 }
        ]
    },
    sessionsplus: {
        name: 'Sessions+ (multi-session, UTC)',
        type: 'overlay',
        params: [
            { id: 'showSydney', label: 'Sydney', type: 'checkbox', default: true },
            { id: 'sydneyStart', label: 'Sydney start (UTC)', type: 'time', default: '21:00' },
            { id: 'sydneyEnd', label: 'Sydney end (UTC)', type: 'time', default: '06:00' },
            { id: 'sydneyColor', label: 'Sydney color', type: 'color', default: 'rgba(156, 39, 176, 0.14)' },
            { id: 'showTokyo', label: 'Tokyo', type: 'checkbox', default: true },
            { id: 'tokyoStart', label: 'Tokyo start (UTC)', type: 'time', default: '00:00' },
            { id: 'tokyoEnd', label: 'Tokyo end (UTC)', type: 'time', default: '09:00' },
            { id: 'tokyoColor', label: 'Tokyo color', type: 'color', default: 'rgba(255, 152, 0, 0.14)' },
            { id: 'showAsian', label: 'Asian (alias band)', type: 'checkbox', default: true },
            { id: 'asianStart', label: 'Asian start (UTC)', type: 'time', default: '00:00' },
            { id: 'asianEnd', label: 'Asian end (UTC)', type: 'time', default: '09:00' },
            { id: 'asianColor', label: 'Asian color', type: 'color', default: 'rgba(255, 193, 7, 0.12)' },
            { id: 'showFrankfurt', label: 'Frankfurt', type: 'checkbox', default: true },
            { id: 'frankfurtStart', label: 'Frankfurt start (UTC)', type: 'time', default: '07:00' },
            { id: 'frankfurtEnd', label: 'Frankfurt end (UTC)', type: 'time', default: '10:00' },
            { id: 'frankfurtColor', label: 'Frankfurt color', type: 'color', default: 'rgba(3, 169, 244, 0.14)' },
            { id: 'showLondon', label: 'London', type: 'checkbox', default: true },
            { id: 'londonStart', label: 'London start (UTC)', type: 'time', default: '08:00' },
            { id: 'londonEnd', label: 'London end (UTC)', type: 'time', default: '16:00' },
            { id: 'londonColor', label: 'London color', type: 'color', default: 'rgba(33, 150, 243, 0.14)' },
            { id: 'showNewYork', label: 'New York', type: 'checkbox', default: true },
            { id: 'newYorkStart', label: 'NY start (UTC)', type: 'time', default: '13:00' },
            { id: 'newYorkEnd', label: 'NY end (UTC)', type: 'time', default: '21:00' },
            { id: 'newYorkColor', label: 'NY color', type: 'color', default: 'rgba(76, 175, 80, 0.14)' }
        ]
    },
    openingrange: {
        name: 'Opening range (UTC day, first N min)',
        type: 'overlay',
        params: [
            { id: 'minutes', label: 'Minutes from UTC midnight', type: 'number', default: 30, min: 1, max: 1440 },
            { id: 'upperColor', label: 'High band color', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Midline color', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Low band color', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Fill (RGBA)', type: 'text', default: 'rgba(41, 98, 255, 0.06)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    supertrend: {
        name: 'Supertrend',
        type: 'overlay',
        params: [
            { id: 'period', label: 'ATR length', type: 'number', default: 10, min: 1 },
            { id: 'multiplier', label: 'ATR multiplier', type: 'number', default: 3, min: 0.1, step: 0.1 },
            { id: 'upColor', label: 'Bull line color', type: 'color', default: '#26a69a' },
            { id: 'downColor', label: 'Bear line color', type: 'color', default: '#ef5350' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    stddev: {
        name: 'Close volatility (rolling stdev)',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#ab47bc' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    ao: {
        name: 'Awesome Oscillator',
        type: 'separate',
        params: [
            { id: 'color', label: 'Bar / line color', type: 'color', default: '#26a69a' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    uo: {
        name: 'Ultimate Oscillator',
        type: 'separate',
        params: [
            { id: 'period1', label: 'Period 1', type: 'number', default: 7, min: 1 },
            { id: 'period2', label: 'Period 2', type: 'number', default: 14, min: 1 },
            { id: 'period3', label: 'Period 3', type: 'number', default: 28, min: 1 },
            { id: 'color', label: 'Line color', type: 'color', default: '#7e57c2' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    vortex: {
        name: 'Vortex Indicator',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'plusColor', label: '+VI color', type: 'color', default: '#00e676' },
            { id: 'minusColor', label: '-VI color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    ppo: {
        name: 'Percentage Price Oscillator',
        type: 'separate',
        params: [
            { id: 'fast', label: 'Fast length', type: 'number', default: 12, min: 1 },
            { id: 'slow', label: 'Slow length', type: 'number', default: 26, min: 1 },
            { id: 'signal', label: 'Signal length', type: 'number', default: 9, min: 1 },
            { id: 'macdColor', label: 'PPO line color', type: 'color', default: '#2962ff' },
            { id: 'signalColor', label: 'Signal color', type: 'color', default: '#f23645' },
            { id: 'histogramColor', label: 'Histogram color', type: 'color', default: '#787b86' }
        ]
    },
    dpo: {
        name: 'Detrended Price Oscillator',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#78909c' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    stochrsi: {
        name: 'Stochastic RSI',
        type: 'separate',
        params: [
            { id: 'rsiPeriod', label: 'RSI length', type: 'number', default: 14, min: 2 },
            { id: 'stochLen', label: 'Stoch lookback', type: 'number', default: 14, min: 2 },
            { id: 'smoothK', label: '%K smoothing', type: 'number', default: 3, min: 1 },
            { id: 'smoothD', label: '%D smoothing', type: 'number', default: 3, min: 1 },
            { id: 'kColor', label: '%K color', type: 'color', default: '#2962ff' },
            { id: 'dColor', label: '%D color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    massindex: {
        name: 'Mass Index',
        type: 'separate',
        params: [
            { id: 'emaPeriod', label: 'EMA length', type: 'number', default: 9, min: 2 },
            { id: 'sumPeriod', label: 'Sum length', type: 'number', default: 25, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#00bcd4' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    coppock: {
        name: 'Coppock Curve',
        type: 'separate',
        params: [
            { id: 'wmaPeriod', label: 'WMA length', type: 'number', default: 10, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#8e24aa' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    rvi: {
        name: 'Relative Vigor Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Smoothing length', type: 'number', default: 10, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#ffa726' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    elderray: {
        name: 'Elder Ray (Bull / Bear power)',
        type: 'separate',
        params: [
            { id: 'period', label: 'EMA length', type: 'number', default: 13, min: 2 },
            { id: 'bullColor', label: 'Bull power', type: 'color', default: '#26a69a' },
            { id: 'bearColor', label: 'Bear power', type: 'color', default: '#ef5350' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    seasonality: {
        name: 'Seasonality (avg % by calendar date)',
        type: 'separate',
        params: [
            {
                id: 'minSamples',
                label: 'Min samples per date (years of that month/day in history)',
                type: 'number',
                default: 2,
                min: 1,
                max: 50
            },
            { id: 'color', label: 'Line color', type: 'color', default: '#ff9800' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    cotnet: {
        name: 'COT — Net commercial vs non-commercial',
        type: 'separate',
        params: [
            {
                id: 'cftcCode',
                label: 'CFTC code (Legacy Combined)',
                type: 'text',
                default: 'auto'
            },
            {
                id: 'dataUrl',
                label: 'Custom data URL (optional)',
                type: 'text',
                default: ''
            },
            { id: 'showCommercial', label: 'Show commercial net', type: 'checkbox', default: true },
            { id: 'showLarge', label: 'Show non-commercial net', type: 'checkbox', default: true },
            { id: 'bullColor', label: 'Commercial (net)', type: 'color', default: '#26a69a' },
            { id: 'bearColor', label: 'Non-commercial (net)', type: 'color', default: '#ef5350' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 5 }
        ]
    },
    ictpd: {
        name: 'ICT — Previous day PD (UTC)',
        type: 'overlay',
        params: [
            { id: 'upperColor', label: 'Prior day high', type: 'color', default: '#2962ff' },
            { id: 'middleColor', label: 'Equilibrium (50%)', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Prior day low', type: 'color', default: '#2962ff' },
            { id: 'fillColor', label: 'Zone fill (RGBA)', type: 'text', default: 'rgba(41, 98, 255, 0.04)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    ictasian: {
        name: 'ICT — Asian range (UTC)',
        type: 'overlay',
        params: [
            { id: 'rangeStart', label: 'Range start (UTC)', type: 'time', default: '00:00' },
            { id: 'rangeEnd', label: 'Range end (UTC)', type: 'time', default: '09:00' },
            { id: 'upperColor', label: 'Asian high', type: 'color', default: '#ff9800' },
            { id: 'middleColor', label: 'Midline', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Asian low', type: 'color', default: '#ff9800' },
            { id: 'fillColor', label: 'Zone fill (RGBA)', type: 'text', default: 'rgba(255, 152, 0, 0.06)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    ictote: {
        name: 'ICT — OTE zone (rolling range)',
        type: 'overlay',
        params: [
            { id: 'lookback', label: 'Swing lookback (bars)', type: 'number', default: 24, min: 5 },
            { id: 'fibLow', label: 'Lower fib (e.g. 0.62)', type: 'number', default: 0.62, min: 0.01, max: 0.99, step: 0.01 },
            { id: 'fibHigh', label: 'Upper fib (e.g. 0.79)', type: 'number', default: 0.79, min: 0.01, max: 0.99, step: 0.01 },
            { id: 'upperColor', label: 'Upper band', type: 'color', default: '#7c4dff' },
            { id: 'middleColor', label: 'Midline', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Lower band', type: 'color', default: '#7c4dff' },
            { id: 'fillColor', label: 'Zone fill (RGBA)', type: 'text', default: 'rgba(124, 77, 255, 0.08)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    ictfvg: {
        name: 'ICT — Fair value gaps (3-bar)',
        type: 'overlay',
        params: [
            { id: 'extendBars', label: 'Box length (bars)', type: 'number', default: 80, min: 5, max: 500 },
            { id: 'maxBoxes', label: 'Max gaps drawn', type: 'number', default: 120, min: 8, max: 400 },
            { id: 'minGapPct', label: 'Min gap vs price (0 = off)', type: 'number', default: 0, min: 0, step: 0.00001 },
            { id: 'bullColor', label: 'Bullish FVG fill', type: 'color', default: 'rgba(38, 166, 154, 0.22)' },
            { id: 'bearColor', label: 'Bearish FVG fill', type: 'color', default: 'rgba(239, 83, 80, 0.22)' },
            { id: 'lineWidth', label: 'Border thickness', type: 'number', default: 1, min: 1, max: 3 }
        ]
    },
    ictsesspd: {
        name: 'ICT — Session PD (prev session, UTC)',
        type: 'overlay',
        params: [
            { id: 'rangeStart', label: 'Session start (UTC)', type: 'time', default: '13:00' },
            { id: 'rangeEnd', label: 'Session end (UTC)', type: 'time', default: '21:00' },
            { id: 'maxLookbackDays', label: 'Max days to find prior session', type: 'number', default: 6, min: 1, max: 14 },
            { id: 'upperColor', label: 'Session high', type: 'color', default: '#00e676' },
            { id: 'middleColor', label: 'Equilibrium', type: 'color', default: '#787b86' },
            { id: 'lowerColor', label: 'Session low', type: 'color', default: '#f23645' },
            { id: 'fillColor', label: 'Zone fill (RGBA)', type: 'text', default: 'rgba(0, 230, 118, 0.05)' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4 }
        ]
    },
    ictliquidity: {
        name: 'ICT — Equal highs / lows (liquidity)',
        type: 'overlay',
        params: [
            { id: 'fractalWidth', label: 'Fractal bars (each side)', type: 'number', default: 2, min: 1, max: 5 },
            { id: 'tolerancePct', label: 'Cluster tolerance (% of price)', type: 'number', default: 0.03, min: 0.001, max: 1, step: 0.001 },
            { id: 'minTouches', label: 'Min swings in cluster', type: 'number', default: 2, min: 2, max: 10 },
            { id: 'extendBars', label: 'Extend line right (bars)', type: 'number', default: 12, min: 0, max: 200 },
            { id: 'maxSegments', label: 'Max lines drawn', type: 'number', default: 80, min: 8, max: 200 },
            { id: 'highColor', label: 'Equal highs', type: 'color', default: '#f23645' },
            { id: 'lowColor', label: 'Equal lows', type: 'color', default: '#2962ff' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 3 }
        ]
    },
    custom: {
        name: 'Custom (sandboxed JS)',
        type: 'overlay',
        params: [
            { id: 'name', label: 'Name', type: 'text', default: 'Custom' },
            {
                id: 'placement',
                label: 'Placement',
                type: 'select',
                options: [
                    { value: 'overlay', label: 'On price chart' },
                    { value: 'panel', label: 'Separate panel' }
                ],
                default: 'overlay'
            },
            {
                id: 'script',
                label: 'JavaScript — must define compute(bars, params) (Pine Script will not run)',
                type: 'textarea',
                default:
                    'function compute(bars, params) {\n' +
                    '  const c = bars.close;\n' +
                    '  const n = c.length;\n' +
                    '  const p = params.period != null ? params.period : 20;\n' +
                    '  const out = new Array(n).fill(null);\n' +
                    '  let s = 0;\n' +
                    '  for (let i = 0; i < n; i++) {\n' +
                    '    s += c[i];\n' +
                    '    if (i >= p) s -= c[i - p];\n' +
                    '    if (i >= p - 1) out[i] = s / p;\n' +
                    '  }\n' +
                    '  return {\n' +
                    '    overlay: true,\n' +
                    "    plots: [{ type: 'line', values: out, color: '#2962ff', name: 'SMA' }]\n" +
                    '  };\n' +
                    '}'
            },
            { id: 'period', label: 'Example param (params.period)', type: 'number', default: 20, min: 1 }
        ]
    }
};

/**
 * Close chart type / toolbar dropdowns when opening indicator modals so two overlays never stack.
 */
function dismissToolbarDropdownsForModal() {
    try {
        const chartTypeDropdown = document.getElementById('chartTypeDropdown');
        const chartTypeArrow = document.getElementById('chartTypeDropdownArrow');
        if (chartTypeDropdown) chartTypeDropdown.classList.remove('show');
        if (chartTypeArrow) chartTypeArrow.classList.remove('dropdown-open');

        document.querySelectorAll('.tool-dropdown.show').forEach(function(dd) {
            dd.classList.remove('show');
            if (dd.id === 'visibility-toolbar-dropdown' || dd.id === 'delete-toolbar-dropdown') {
                dd.style.display = 'none';
            }
        });
        document.querySelectorAll('.tool-group-btn[data-group]').forEach(function(btn) {
            btn.classList.remove('dropdown-open');
        });
        document.querySelectorAll('.cursor-dropdown-arrow, .dropdown-arrow').forEach(function(arr) {
            arr.classList.remove('dropdown-open');
        });

        const timeframeDropdown = document.getElementById('timeframeDropdown');
        const timeframeDropdownMenu = document.getElementById('timeframeDropdownMenu');
        if (timeframeDropdownMenu) timeframeDropdownMenu.style.display = 'none';
        if (timeframeDropdown) timeframeDropdown.classList.remove('open');

        if (window.timeframeFavorites && typeof window.timeframeFavorites._closeTfFlyout === 'function') {
            window.timeframeFavorites._closeTfFlyout();
        }
    } catch (err) {
        /* ignore */
    }
}

function closeIndicatorSelectionMenuIfOpen() {
    try {
        const menu = document.getElementById('indicatorSelectionMenu');
        const backdrop = document.getElementById('indicatorMenuBackdrop');
        if (menu && menu.classList.contains('visible')) {
            menu.classList.remove('visible');
        }
        if (backdrop) {
            backdrop.style.visibility = 'hidden';
            backdrop.style.opacity = '0';
        }
    } catch (err) {
        /* ignore */
    }
}

if (typeof window !== 'undefined') {
    window.dismissToolbarDropdownsForModal = dismissToolbarDropdownsForModal;
    window.closeIndicatorSelectionMenuIfOpen = closeIndicatorSelectionMenuIfOpen;
}

const INDICATOR_COLOR_ROWS = [
    ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'],
    ['#FF4444', '#FF9500', '#FFEB3B', '#4CAF50', '#00BCD4', '#00E5FF', '#2962FF', '#7B68EE', '#E040FB', '#FF4081'],
    ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#B2F5FF', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
    ['#FFAB91', '#FFCC80', '#FFF59D', '#A5D6A7', '#80DEEA', '#80E5FF', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'],
    ['#FF8A65', '#FFB74D', '#FFF176', '#81C784', '#4DD0E1', '#4DD5FF', '#64B5F6', '#9575CD', '#BA68C8', '#F06292'],
    ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#26C6DA', '#26D4FF', '#42A5F5', '#7E57C2', '#AB47BC', '#EC407A'],
    ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#00B8D4', '#1E88E5', '#5E35B1', '#8E24AA', '#D81B60'],
    ['#C62828', '#E65100', '#F57F17', '#2E7D32', '#00838F', '#00838F', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457']
];

const INDICATOR_COLOR_RECENTS = ['#131722', '#2962FF', '#1E3A5F', '#262B3E'];

/** Indicator legend chips — flat tint + blur (no gradient); text color via .talaria-ind-chip-name (matches OHLC labels in CSS) */
const TALARIA_IND_CHIP_BORDER = 'rgba(255, 255, 255, 0.2)';
const TALARIA_IND_CHIP_BG = 'rgba(19, 23, 34, 0.32)';
const TALARIA_INDICATOR_GLASS =
    'backdrop-filter:saturate(1.5) blur(20px);-webkit-backdrop-filter:saturate(1.5) blur(20px);';
const TALARIA_INDICATOR_CHIP_CSS =
    'display:inline-flex;align-items:center;gap:6px;min-height:22px;box-sizing:border-box;' +
    'padding:3px 8px 3px 6px;margin:0;border-radius:4px;line-height:1.25;' +
    'border:1px solid ' + TALARIA_IND_CHIP_BORDER + ';' +
    'background:' + TALARIA_IND_CHIP_BG + ';' +
    TALARIA_INDICATOR_GLASS +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),0 2px 8px rgba(0,0,0,0.06);' +
    'transform:translateZ(0);-webkit-transform:translateZ(0);' +
    'cursor:pointer;vertical-align:middle;' +
    'font-family:-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif;';
const TALARIA_INDICATOR_CHIP_BG = TALARIA_IND_CHIP_BG;
const TALARIA_INDICATOR_CHIP_BG_HOVER = 'rgba(30, 34, 44, 0.48)';
const TALARIA_INDICATOR_CHIP_BORDER_HOVER = 'rgba(255, 255, 255, 0.3)';
const TALARIA_INDICATOR_COLOR_STRIP = (color) =>
    'display:inline-block;width:3px;height:14px;border-radius:1px;background:' + color + ';flex-shrink:0;';
function setTalariaIndChipNameEl(el, visible) {
    el.className = 'talaria-ind-chip-name' + (visible ? '' : ' talaria-ind-chip-name--hidden');
}
const TALARIA_IND_ACTION_BTN =
    'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:2px;cursor:pointer;transition:background .15s,color .15s;flex-shrink:0;';

if (typeof window !== 'undefined') {
    window.TALARIA_INDICATOR_CHIP_CSS = TALARIA_INDICATOR_CHIP_CSS;
    window.TALARIA_INDICATOR_CHIP_BG = TALARIA_INDICATOR_CHIP_BG;
    window.TALARIA_INDICATOR_CHIP_BG_HOVER = TALARIA_INDICATOR_CHIP_BG_HOVER;
    window.TALARIA_INDICATOR_CHIP_BORDER_HOVER = TALARIA_INDICATOR_CHIP_BORDER_HOVER;
    window.TALARIA_IND_CHIP_BORDER = TALARIA_IND_CHIP_BORDER;
    window.TALARIA_INDICATOR_COLOR_STRIP = TALARIA_INDICATOR_COLOR_STRIP;
}

function ensureIndicatorColorStyles(panel) {
    if (panel.querySelector('#indicator-color-picker-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'indicator-color-picker-styles';
    style.textContent = `
        #indicatorSettingsPanel .indicator-color-control {
            display: flex;
            align-items: center;
            gap: 12px;
            position: relative;
            margin-left: auto;
        }
        #indicatorSettingsPanel .indicator-color-preview-wrapper {
            position: relative;
            display: flex;
        }
        #indicatorSettingsPanel .indicator-color-preview {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            border: 1px solid var(--sp-input-border, rgba(255,255,255,0.14));
            cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s, border-color 0.2s;
        }
        #indicatorSettingsPanel .indicator-color-preview:hover {
            border-color: rgba(var(--sp-accent-rgb, 41,98,255), 0.8);
            transform: scale(1.08);
            box-shadow: 0 0 0 2px rgba(var(--sp-accent-rgb, 41,98,255), 0.35);
        }
        /* Palette is appended to document.body (avoids transform offset bugs). Styles must NOT depend on #indicatorSettingsPanel ancestor. */
        .indicator-color-palette {
            position: fixed;
            top: 0;
            left: 0;
            transform: none;
            background: var(--sp-ui-chrome-bg, #131722);
            border: 1px solid var(--sp-input-border, rgba(255,255,255,0.14));
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            padding: 16px;
            display: none;
            flex-direction: column;
            gap: 12px;
            z-index: 100000;
            min-width: 280px;
            max-width: min(92vw, 340px);
        }
        .indicator-color-palette.active {
            display: flex;
        }
        .indicator-color-palette .indicator-color-grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 4px;
        }
        .indicator-color-palette .indicator-color-swatch {
            width: 22px;
            height: 22px;
            border-radius: 3px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.15s;
        }
        .indicator-color-palette .indicator-color-swatch:hover {
            transform: scale(1.1);
            border-color: #ffffff;
        }
        .indicator-color-palette .indicator-color-swatch.selected {
            border-color: #ffffff;
            box-shadow: 0 0 0 1px #2a2e39, 0 0 0 3px #ffffff;
        }
        .indicator-color-palette .indicator-color-divider {
            height: 1px;
            background: #3a3e49;
        }
        .indicator-color-palette .indicator-color-recent {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .indicator-color-palette .indicator-color-recent-items {
            display: flex;
            gap: 6px;
        }
        .indicator-color-palette .indicator-color-add {
            width: 22px;
            height: 22px;
            border-radius: 3px;
            background: #3a3e49;
            border: 1px dashed #5a5e69;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: #8a8e99;
            font-size: 18px;
            transition: all 0.15s;
        }
        .indicator-color-palette .indicator-color-add:hover {
            background: #4a4e59;
            border-color: #7a7e89;
            color: #ffffff;
        }
        .indicator-color-palette .indicator-color-opacity {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .indicator-color-palette .indicator-color-opacity-label {
            color: #8a8e99;
            font-size: 12px;
        }
        .indicator-color-palette .indicator-color-opacity-control {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .indicator-color-palette .indicator-color-opacity-slider {
            flex: 1;
            -webkit-appearance: none;
            appearance: none;
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,1));
            outline: none;
            cursor: pointer;
        }
        .indicator-color-palette .indicator-color-opacity-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #3a3e49;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .indicator-color-palette .indicator-color-opacity-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #3a3e49;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .indicator-color-palette .indicator-color-opacity-value {
            color: #ffffff;
            font-size: 14px;
            font-weight: 500;
            min-width: 45px;
            text-align: right;
        }
    `;

    panel.insertBefore(style, panel.firstChild);
}

function clampOpacity(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isNaN(num)) return 1;
    return Math.min(1, Math.max(0, num));
}

function normalizeHex(color) {
    if (!color) return '#2962FF';
    if (color.startsWith('rgba') || color.startsWith('rgb')) {
        const match = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (match) {
            return rgbToHex(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
        }
        return '#2962FF';
    }

    if (color.startsWith('#')) {
        if (color.length === 4) {
            const r = color[1];
            const g = color[2];
            const b = color[3];
            return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
        }
        if (color.length >= 7) {
            return color.slice(0, 7).toUpperCase();
        }
    }

    return '#2962FF';
}

function rgbToHex(r, g, b) {
    const toHex = (v) => {
        const val = Math.max(0, Math.min(255, parseInt(v, 10) || 0));
        return val.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    const match = normalized.match(/^#([0-9A-F]{6})$/i);
    if (!match) {
        return { r: 41, g: 98, b: 255 };
    }
    const value = match[1];
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
    };
}

function applyOpacityToColor(baseColor, opacity) {
    const clamped = clampOpacity(opacity);
    const normalized = normalizeHex(baseColor);
    if (clamped >= 0.995) {
        return normalized;
    }
    const { r, g, b } = hexToRgb(normalized);
    return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(2)})`;
}

function parseColorValue(value) {
    if (!value) {
        return { baseColor: '#2962FF', opacity: 1 };
    }

    if (value.startsWith('#')) {
        if (value.length === 9) {
            const base = value.slice(0, 7);
            const alpha = parseInt(value.slice(7, 9), 16) / 255;
            return { baseColor: normalizeHex(base), opacity: clampOpacity(alpha) };
        }
        return { baseColor: normalizeHex(value), opacity: 1 };
    }

    const match = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
    if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        const opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
        return { baseColor: rgbToHex(r, g, b), opacity: clampOpacity(opacity) };
    }

    return { baseColor: '#2962FF', opacity: 1 };
}

function openNativeColorPicker(initialColor, callback) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = normalizeHex(initialColor);
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);

    const handleChange = () => {
        if (typeof callback === 'function') {
            callback(input.value);
        }
        cleanup();
    };

    const cleanup = () => {
        input.removeEventListener('input', handleChange);
        input.removeEventListener('change', handleChange);
        if (document.body.contains(input)) {
            document.body.removeChild(input);
        }
    };

    input.addEventListener('input', handleChange, { once: true });
    input.addEventListener('change', handleChange, { once: true });

    setTimeout(() => input.click(), 10);
}

function createIndicatorColorControl(paramId, initialValue, closeAllPalettes) {
    let { baseColor, opacity } = parseColorValue(initialValue);
    baseColor = normalizeHex(baseColor);
    opacity = clampOpacity(opacity);

    const container = document.createElement('div');
    container.className = 'indicator-color-control';

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'indicator-color-preview-wrapper';
    container.appendChild(previewWrapper);

    const preview = document.createElement('span');
    preview.className = 'indicator-color-preview';
    previewWrapper.appendChild(preview);

    const palette = document.createElement('div');
    palette.className = 'indicator-color-palette';
    document.body.appendChild(palette);

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.setAttribute('data-param-id', paramId);
    hiddenInput.setAttribute('data-param-type', 'color');
    container.appendChild(hiddenInput);

    const grid = document.createElement('div');
    grid.className = 'indicator-color-grid';
    palette.appendChild(grid);

    const swatches = [];
    INDICATOR_COLOR_ROWS.forEach((row) => {
        row.forEach((color) => {
            const swatch = document.createElement('div');
            swatch.className = 'indicator-color-swatch';
            swatch.dataset.color = color;
            swatch.style.background = color;
            swatch.addEventListener('click', (event) => {
                event.stopPropagation();
                baseColor = normalizeHex(color);
                updateSelectedSwatches();
                updateSliderGradient();
                updateDisplay();
                palette.classList.remove('active');
            });
            grid.appendChild(swatch);
            swatches.push(swatch);
        });
    });

    const divider = document.createElement('div');
    divider.className = 'indicator-color-divider';
    palette.appendChild(divider);

    const recent = document.createElement('div');
    recent.className = 'indicator-color-recent';
    palette.appendChild(recent);

    const recentItems = document.createElement('div');
    recentItems.className = 'indicator-color-recent-items';
    recent.appendChild(recentItems);

    INDICATOR_COLOR_RECENTS.forEach((color) => {
        const swatch = document.createElement('div');
        swatch.className = 'indicator-color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.addEventListener('click', (event) => {
            event.stopPropagation();
            baseColor = normalizeHex(color);
            updateSelectedSwatches();
            updateSliderGradient();
            updateDisplay();
            palette.classList.remove('active');
        });
        recentItems.appendChild(swatch);
        swatches.push(swatch);
    });

    const addButton = document.createElement('div');
    addButton.className = 'indicator-color-add';
    addButton.title = 'Add custom color';
    addButton.textContent = '+';
    addButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openNativeColorPicker(baseColor, (color) => {
            baseColor = normalizeHex(color);
            updateSelectedSwatches();
            updateSliderGradient();
            updateDisplay();
            palette.classList.remove('active');
        });
    });
    recent.appendChild(addButton);

    const opacitySection = document.createElement('div');
    opacitySection.className = 'indicator-color-opacity';
    palette.appendChild(opacitySection);

    const opacityLabel = document.createElement('span');
    opacityLabel.className = 'indicator-color-opacity-label';
    opacityLabel.textContent = 'Opacity';
    opacitySection.appendChild(opacityLabel);

    const opacityControl = document.createElement('div');
    opacityControl.className = 'indicator-color-opacity-control';
    opacitySection.appendChild(opacityControl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'indicator-color-opacity-slider';
    slider.min = '0';
    slider.max = '100';
    slider.value = Math.round(opacity * 100).toString();
    slider.addEventListener('click', (event) => event.stopPropagation());
    slider.addEventListener('input', (event) => {
        event.stopPropagation();
        opacity = clampOpacity(parseInt(slider.value, 10) / 100);
        updateDisplay();
    });
    opacityControl.appendChild(slider);

    const sliderValue = document.createElement('span');
    sliderValue.className = 'indicator-color-opacity-value';
    opacityControl.appendChild(sliderValue);

    const updateSliderGradient = () => {
        const { r, g, b } = hexToRgb(baseColor);
        slider.style.background = `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1))`;
    };

    const updateSelectedSwatches = () => {
        const normalized = normalizeHex(baseColor);
        swatches.forEach((swatch) => {
            if (normalizeHex(swatch.dataset.color) === normalized) {
                swatch.classList.add('selected');
            } else {
                swatch.classList.remove('selected');
            }
        });
    };

    const updateDisplay = () => {
        const displayColor = applyOpacityToColor(baseColor, opacity);
        preview.style.background = displayColor;
        hiddenInput.value = displayColor;
        sliderValue.textContent = `${Math.round(opacity * 100)}%`;
    };

    const positionPalette = () => {
        const rect = preview.getBoundingClientRect();
        // `panel` is not in scope here — resolve the modal from DOM (same id as createIndicatorSettingsPanel).
        const settingsPanelEl = document.getElementById('indicatorSettingsPanel');
        const panelRect = settingsPanelEl
            ? settingsPanelEl.getBoundingClientRect()
            : { left: 0, top: 0, width: 400, height: 400 };
        const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
        const vh = window.innerHeight || document.documentElement.clientHeight || 720;
        const paletteWidth = Math.min(320, vw - 16);
        const estimatedHeight = 260;
        const anchorLeft = Number.isFinite(rect.left) ? rect.left : panelRect.left + panelRect.width * 0.5;
        const anchorTop = Number.isFinite(rect.top) ? rect.top : panelRect.top + 80;
        const anchorWidth = Number.isFinite(rect.width) ? rect.width : 24;
        const anchorBottom = Number.isFinite(rect.bottom) ? rect.bottom : (anchorTop + 24);
        let left = anchorLeft + anchorWidth / 2 - paletteWidth / 2;
        let top = anchorBottom + 8;
        left = Math.max(8, Math.min(left, vw - paletteWidth - 8));
        if (top + estimatedHeight > vh - 8) {
            top = Math.max(8, anchorTop - estimatedHeight - 8);
        }
        palette.style.right = 'auto';
        palette.style.bottom = 'auto';
        palette.style.left = `${left}px`;
        palette.style.top = `${top}px`;
        palette.style.width = `${paletteWidth}px`;
    };

    const close = () => {
        palette.classList.remove('active');
    };

    preview.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasActive = palette.classList.contains('active');
        closeAllPalettes();
        if (!wasActive) {
            positionPalette();
            updateSliderGradient();
            updateSelectedSwatches();
            palette.classList.add('active');
        }
    });

    palette.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    updateSliderGradient();
    updateSelectedSwatches();
    updateDisplay();

    return {
        container,
        input: hiddenInput,
        close,
        contains: (target) => container.contains(target) || palette.contains(target),
        destroy: () => {
            palette.classList.remove('active');
            if (palette.parentElement) palette.parentElement.removeChild(palette);
        }
    };
}

// 2. UI Generation Functions

function createIndicatorSelectionMenu(chartInstance) {
    const categories = {
        favorites: { name: 'Favorites', icon: '☆', indicators: [] },
        technicals: {
            name: 'Technicals',
            icon: '',
            indicators: [
                'sma', 'ema', 'wma', 'dema', 'tema', 'hma', 'bb', 'envelope', 'vwap', 'donchian', 'keltner', 'psar', 'supertrend', 'stddev',
                'roc', 'mom',
                'rsi', 'macd', 'ppo', 'stoch', 'stochrsi', 'atr', 'cci', 'adx', 'willr', 'mfi', 'aroon', 'cmf', 'trix', 'ao', 'uo', 'vortex', 'dpo',
                'massindex', 'coppock', 'rvi', 'elderray', 'seasonality', 'cotnet',
                'obv', 'adr', 'volume'
            ]
        },
        sessions: {
            name: 'Sessions',
            icon: '',
            indicators: ['sessions', 'sessionsplus', 'openingrange', 'killzones']
        },
        ict: {
            name: 'ICT',
            icon: '',
            indicators: ['ictpd', 'ictsesspd', 'ictasian', 'ictote', 'ictfvg', 'ictliquidity']
        },
        script: {
            name: 'Custom',
            icon: '',
            indicators: ['custom']
        }
    };

    const backdrop = document.createElement('div');
    backdrop.id = 'indicatorMenuBackdrop';
    backdrop.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.55);
        z-index: 9998; visibility: hidden; opacity: 0;
        transition: opacity 0.2s ease, visibility 0.2s ease;
    `;
    document.body.appendChild(backdrop);

    const menu = document.createElement('div');
    menu.id = 'indicatorSelectionMenu';
    menu.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 720px; max-width: 92vw;
        height: 520px; max-height: 82vh;
        background: var(--sp-ui-chrome-bg, #131722);
        border: 1px solid var(--sp-ui-border, rgba(42,46,57,0.65));
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset;
        z-index: 9999; visibility: hidden; opacity: 0;
        transition: opacity 0.15s ease, visibility 0.15s ease;
        display: flex; flex-direction: column; overflow: hidden;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 17px 22px 15px;
        border-bottom: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        background: var(--sp-ui-chrome-bg, #131722);
        flex-shrink: 0;
    `;

    const title = document.createElement('span');
    title.textContent = 'Indicators, metrics, and strategies';
    title.style.cssText = `
        font-size: 15px; font-weight: 600;
        color: var(--sp-text, #d1d4dc);
        letter-spacing: 0.01em;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.style.cssText = `
        background: none; border: none; cursor: pointer;
        padding: 6px; display: flex; align-items: center;
        color: var(--sp-text-muted, #787b86);
        border-radius: 5px; transition: all 0.15s;
    `;
    closeBtn.onmouseenter = () => { closeBtn.style.background = 'var(--sp-hover-bg, rgba(42,46,57,0.6))'; closeBtn.style.color = 'var(--sp-text, #d1d4dc)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; closeBtn.style.color = 'var(--sp-text-muted, #787b86)'; };
    closeBtn.onclick = () => closeMenu();
    header.appendChild(title);
    header.appendChild(closeBtn);
    menu.appendChild(header);

    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        padding: 11px 16px;
        border-bottom: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        background: var(--sp-ui-chrome-bg, #131722);
        flex-shrink: 0;
    `;

    const searchWrapper = document.createElement('div');
    searchWrapper.style.cssText = `
        position: relative; display: flex; align-items: center;
        background: var(--sp-ui-surface-bg, #1e2740);
        border: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        border-radius: 6px; padding: 0 12px;
        transition: border-color 0.15s;
    `;

    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('width', '14'); searchIcon.setAttribute('height', '14');
    searchIcon.setAttribute('viewBox', '0 0 24 24'); searchIcon.setAttribute('fill', 'none');
    searchIcon.setAttribute('stroke', 'var(--sp-text-muted, #787b86)'); searchIcon.setAttribute('stroke-width', '2');
    searchIcon.innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>';
    searchIcon.style.cssText = 'flex-shrink: 0;';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'indicatorMenuSearch';
    searchInput.placeholder = 'Search indicators...';
    searchInput.style.cssText = `
        flex: 1; padding: 9px 10px;
        border: none; font-size: 13px;
        color: var(--sp-text, #d1d4dc);
        background: transparent; outline: none;
        font-family: 'Roboto', -apple-system, sans-serif;
    `;
    searchInput.onfocus = () => { searchWrapper.style.borderColor = 'var(--sp-accent, #2962ff)'; };
    searchInput.onblur  = () => { searchWrapper.style.borderColor = 'var(--sp-ui-border, rgba(42,46,57,0.55))'; };

    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchContainer.appendChild(searchWrapper);
    menu.appendChild(searchContainer);

    const contentArea = document.createElement('div');
    contentArea.style.cssText = `display: flex; flex: 1; overflow: hidden;`;

    const sidebar = document.createElement('div');
    sidebar.style.cssText = `
        width: 176px;
        border-right: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        padding: 8px 0; overflow-y: auto; flex-shrink: 0;
        background: var(--sp-ui-sidebar-bg, #1a1f2e);
    `;

    let activeCategory = 'technicals';
    const categoryButtons = {};

    const createCategoryItem = (key, cat, isSection = false) => {
        if (isSection) {
            const section = document.createElement('div');
            section.style.cssText = `
                padding: 14px 14px 5px;
                font-size: 10px; font-weight: 700;
                color: var(--sp-text-muted, #787b86);
                text-transform: uppercase; letter-spacing: 0.8px;
                font-family: 'Roboto', -apple-system, sans-serif;
            `;
            section.textContent = cat;
            return section;
        }

        const item = document.createElement('div');
        item.dataset.category = key;
        item.style.cssText = `
            display: flex; align-items: center; gap: 8px;
            padding: 8px 12px 8px 9px; cursor: pointer;
            font-size: 13px; font-weight: 500;
            color: var(--sp-text, #d1d4dc);
            transition: background 0.12s, color 0.12s, border-color 0.12s;
            margin: 2px 8px; border-radius: 4px;
            border-left: 3px solid transparent;
            font-family: 'Roboto', -apple-system, sans-serif;
        `;

        const icon = document.createElement('span');
        icon.textContent = cat.icon;
        icon.style.cssText = 'font-size: 13px; width: 18px; text-align: center; flex-shrink: 0;';

        const name = document.createElement('span');
        name.textContent = cat.name;

        item.appendChild(icon);
        item.appendChild(name);

        item.onmouseenter = () => {
            if (activeCategory !== key) {
                item.style.background = 'rgba(255, 255, 255, 0.05)';
            }
        };
        item.onmouseleave = () => {
            if (activeCategory !== key) item.style.background = 'transparent';
        };

        item.onclick = () => {
            const ac = getComputedStyle(document.documentElement).getPropertyValue('--sp-accent').trim() || '#2962ff';
            Object.keys(categoryButtons).forEach(k => {
                categoryButtons[k].style.background = 'transparent';
                categoryButtons[k].style.color = 'var(--sp-text, #d1d4dc)';
                categoryButtons[k].style.fontWeight = '500';
                categoryButtons[k].style.borderLeftColor = 'transparent';
            });
            item.style.background = 'rgba(41, 98, 255, 0.16)';
            item.style.color = '#ffffff';
            item.style.fontWeight = '600';
            item.style.borderLeftColor = ac;
            activeCategory = key;
            filterByCategory(key);
        };

        categoryButtons[key] = item;
        return item;
    };

    sidebar.appendChild(createCategoryItem(null, 'BUILT-IN', true));
    sidebar.appendChild(createCategoryItem('technicals', categories.technicals));
    sidebar.appendChild(createCategoryItem('sessions', categories.sessions));
    sidebar.appendChild(createCategoryItem('ict', categories.ict));
    sidebar.appendChild(createCategoryItem(null, 'SCRIPT', true));
    sidebar.appendChild(createCategoryItem('script', categories.script));
    sidebar.appendChild(createCategoryItem(null, 'PERSONAL', true));
    sidebar.appendChild(createCategoryItem('favorites', categories.favorites));

    const initAc = getComputedStyle(document.documentElement).getPropertyValue('--sp-accent').trim() || '#2962ff';
    categoryButtons['technicals'].style.background = 'rgba(41, 98, 255, 0.16)';
    categoryButtons['technicals'].style.color = '#ffffff';
    categoryButtons['technicals'].style.fontWeight = '600';
    categoryButtons['technicals'].style.borderLeftColor = initAc;

    contentArea.appendChild(sidebar);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
        flex: 1; display: flex; flex-direction: column; overflow: hidden;
        background: var(--sp-ui-chrome-bg, #131722);
    `;

    const listHeader = document.createElement('div');
    listHeader.style.cssText = `
        display: flex; padding: 8px 18px;
        border-bottom: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        font-size: 10px; font-weight: 700;
        color: var(--sp-text-muted, #787b86);
        text-transform: uppercase; letter-spacing: 0.8px;
        flex-shrink: 0;
        font-family: 'Roboto', -apple-system, sans-serif;
    `;
    listHeader.innerHTML = `<span style="flex:1;">Indicator Name</span>`;
    listContainer.appendChild(listHeader);

    const indicatorList = document.createElement('div');
    indicatorList.style.cssText = `
        flex: 1; overflow-y: auto; padding: 4px 0;
        scrollbar-width: thin;
        scrollbar-color: var(--sp-ui-border, rgba(42,46,57,0.55)) transparent;
    `;

    const indicatorItems = [];

    Object.keys(INDICATOR_DEFINITIONS).forEach(key => {
        const def = INDICATOR_DEFINITIONS[key];
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex; align-items: center;
            padding: 10px 16px; cursor: pointer;
            transition: background 0.1s;
            font-size: 13px; font-weight: 400;
            color: var(--sp-text, #d1d4dc);
            font-family: 'Roboto', -apple-system, sans-serif;
            border-radius: 4px; margin: 1px 10px;
        `;
        item.dataset.name = def.name.toLowerCase();
        item.dataset.key = key;

        const star = document.createElement('span');
        star.innerHTML = '★';
        star.style.cssText = `
            color: var(--sp-text-muted, #5d606b);
            margin-right: 12px; font-size: 12px;
            cursor: pointer; transition: color 0.15s; flex-shrink: 0;
            opacity: 0.85;
        `;
        star.onclick = (e) => {
            e.stopPropagation();
            const isFav = star.style.color === 'rgb(255, 193, 7)';
            star.style.color = isFav ? 'var(--sp-text-muted, #787b86)' : '#ffc107';
            const idx = categories.favorites.indicators.indexOf(key);
            if (isFav && idx > -1) categories.favorites.indicators.splice(idx, 1);
            else if (!isFav) categories.favorites.indicators.push(key);
        };

        const nameSpan = document.createElement('span');
        nameSpan.textContent = def.name;
        nameSpan.style.flex = '1';

        item.appendChild(star);
        item.appendChild(nameSpan);

        item.onmouseenter = () => { item.style.background = 'rgba(255, 255, 255, 0.06)'; };
        item.onmouseleave = () => { item.style.background = 'transparent'; };

        item.onclick = () => {
            console.log('📊 Indicator clicked:', key, def.name);
            closeMenu();
            if (key === 'custom') {
                createIndicatorSettingsPanel(chartInstance, 'custom');
                return;
            }
            const defaultParams = {};
            const defaultStyle = {};
            def.params.forEach(param => {
                if (param.default === undefined) return;
                if (param.id.toLowerCase().includes('color') || param.id.toLowerCase().includes('width') || param.id.toLowerCase().includes('fill')) {
                    defaultStyle[param.id] = param.default;
                } else {
                    defaultParams[param.id] = param.default;
                }
            });
            let targetChart = (typeof window.getActiveChart === 'function' ? window.getActiveChart() : null) || chartInstance;
            if (!targetChart || typeof targetChart.addIndicator !== 'function') {
                targetChart = window.chart || window.mainChart;
            }
            if (targetChart && typeof targetChart.addIndicator === 'function') {
                targetChart.addIndicator(key, { ...defaultParams, ...defaultStyle });
            }
        };

        indicatorList.appendChild(item);
        indicatorItems.push(item);
    });

    listContainer.appendChild(indicatorList);
    contentArea.appendChild(listContainer);
    menu.appendChild(contentArea);

    function filterByCategory(categoryKey) {
        const cat = categories[categoryKey];
        indicatorItems.forEach(item => {
            if (categoryKey === 'favorites') {
                item.style.display = cat.indicators.includes(item.dataset.key) ? 'flex' : 'none';
            } else if (cat && cat.indicators && cat.indicators.length > 0) {
                item.style.display = cat.indicators.includes(item.dataset.key) ? 'flex' : 'none';
            } else {
                item.style.display = 'flex';
            }
        });
    }

    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        if (searchTerm) {
            indicatorItems.forEach(item => {
                item.style.display = item.dataset.name.includes(searchTerm) ? 'flex' : 'none';
            });
        } else {
            filterByCategory(activeCategory);
        }
    });

    function closeMenu() {
        menu.classList.remove('visible');
        backdrop.style.visibility = 'hidden';
        backdrop.style.opacity = '0';
        searchInput.value = '';
        filterByCategory(activeCategory);
    }

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeMenu();
    });

    backdrop.onclick = closeMenu;

    function updateThemeColors() {
        const ac = getComputedStyle(document.documentElement).getPropertyValue('--sp-accent').trim() || '#2962ff';
        Object.keys(categoryButtons).forEach(k => {
            if (activeCategory !== k) {
                categoryButtons[k].style.background = 'transparent';
                categoryButtons[k].style.color = 'var(--sp-text, #d1d4dc)';
                categoryButtons[k].style.fontWeight = '500';
                categoryButtons[k].style.borderLeftColor = 'transparent';
            } else {
                categoryButtons[k].style.background = 'rgba(41, 98, 255, 0.16)';
                categoryButtons[k].style.color = '#ffffff';
                categoryButtons[k].style.fontWeight = '600';
                categoryButtons[k].style.borderLeftColor = ac;
            }
        });
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (menu.classList.contains('visible')) {
                    updateThemeColors();
                    menu.style.visibility = 'visible';
                    menu.style.opacity = '1';
                    backdrop.style.visibility = 'visible';
                    backdrop.style.opacity = '1';
                    setTimeout(() => searchInput.focus(), 100);
                } else {
                    menu.style.visibility = 'hidden';
                    menu.style.opacity = '0';
                    backdrop.style.visibility = 'hidden';
                    backdrop.style.opacity = '0';
                }
            }
        });
    });
    observer.observe(menu, { attributes: true });

    filterByCategory('technicals');
    return menu;
}

function createIndicatorSettingsPanel(chartInstance, indicatorType, existingIndicator = null) {
    console.log('🔧 createIndicatorSettingsPanel called with:', indicatorType, existingIndicator);
    const def = INDICATOR_DEFINITIONS[indicatorType];
    if (!def) {
        console.error('❌ No definition found for indicator type:', indicatorType);
        return;
    }

    dismissToolbarDropdownsForModal();

    // Remove any existing panel and backdrop
    const existingPanel = document.getElementById('indicatorSettingsPanel');
    if (existingPanel) existingPanel.remove();
    const existingBackdrop = document.getElementById('indicatorSettingsBackdrop');
    if (existingBackdrop) existingBackdrop.remove();

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'indicatorSettingsBackdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 9999;
        backdrop-filter: blur(2px);
    `;

    const panel = document.createElement('div');
    panel.id = 'indicatorSettingsPanel';
    const isCustomPanel = indicatorType === 'custom';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--sp-ui-chrome-bg, #131722);
        border: 1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
        border-radius: 10px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.65);
        z-index: 10000;
        min-width: ${isCustomPanel ? '480px' : '360px'};
        max-width: ${isCustomPanel ? '640px' : '460px'};
        width: ${isCustomPanel ? 'min(92vw, 600px)' : 'auto'};
        max-height: 80vh;
        padding: 22px;
        display: flex;
        flex-direction: column;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        overflow: visible;
    `;

    const title = document.createElement('div');
    title.className = 'settings-section-title';
    title.textContent = existingIndicator ? `Edit ${def.name}` : `Add ${def.name}`;
    title.style.flexShrink = '0';
    panel.appendChild(title);

    if (indicatorType === 'custom') {
        const hint = document.createElement('p');
        hint.textContent =
            'This runs sandboxed JavaScript only. TradingView Pine Script is not supported. ' +
            'Use the default template: function compute(bars, params) { return { overlay, plots }; } ' +
            'where plots are line or histogram series. For built-in EMA/RSI/MACD, use the Technicals list instead.';
        hint.style.cssText =
            'font-size:12px;line-height:1.45;color:var(--sp-text-muted,#787b86);' +
            'margin:0 0 12px 0;padding:10px 12px;border-radius:6px;' +
            'background:rgba(255,193,7,0.07);border:1px solid rgba(255,193,7,0.28);';
        panel.appendChild(hint);
    }

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '6px';
    form.style.overflowY = 'auto';
    form.style.maxHeight = 'calc(80vh - 120px)';
    form.style.paddingRight = '8px';
    form.style.marginTop = '10px';
    // Add scrollbar styling
    form.style.scrollbarWidth = 'thin';
    form.style.scrollbarColor = 'var(--sp-ui-border, rgba(42,46,57,0.55)) transparent';

    const initialParams = existingIndicator ? existingIndicator.params : {};
    const initialStyle = existingIndicator ? existingIndicator.style : {};
    const allParams = { ...initialParams, ...initialStyle };
    if (indicatorType === 'custom' && existingIndicator && existingIndicator.params) {
        if (allParams.placement === undefined || allParams.placement === '') {
            allParams.placement = existingIndicator.params.separatePanel ? 'panel' : 'overlay';
        }
        const cp = existingIndicator.params.customParams;
        if ((allParams.period === undefined || allParams.period === '') && cp && cp.period != null) {
            allParams.period = cp.period;
        }
    }

    const colorControls = [];
    const closeAllPalettes = () => {
        colorControls.forEach(control => control.close());
    };
    const destroyAllPalettes = () => {
        colorControls.forEach(control => {
            if (typeof control.destroy === 'function') control.destroy();
        });
    };

    def.params.forEach(param => {
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-input-row';

        const label = document.createElement('label');
        label.className = 'settings-input-label';
        label.textContent = param.label;
        wrapper.appendChild(label);

        let input;
        const currentValue = allParams[param.id] !== undefined ? allParams[param.id] : param.default;

        if (param.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.className = 'settings-input';
            input.value = currentValue;
            input.min = param.min || 1;
            if (param.max) input.max = param.max;
            if (param.step) input.step = param.step;
            input.style.width = '160px';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'color') {
            ensureIndicatorColorStyles(panel);
            const control = createIndicatorColorControl(param.id, currentValue, closeAllPalettes);
            input = control.input;
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(control.container);
            colorControls.push(control);
        } else if (param.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'tv-native-checkbox';
            input.checked = currentValue !== false;
            input.style.cursor = 'pointer';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'select' && Array.isArray(param.options)) {
            input = document.createElement('select');
            input.className = 'settings-input';
            input.style.width = '100%';
            input.style.maxWidth = '100%';
            input.style.padding = '8px 10px';
            input.style.borderRadius = '6px';
            input.style.cursor = 'pointer';
            input.style.background = 'var(--sp-ui-surface-bg, #1e2740)';
            input.style.color = 'var(--sp-text, #d1d4dc)';
            input.style.border = '1px solid var(--sp-ui-border, rgba(42,46,57,0.55))';
            param.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (String(opt.value) === String(currentValue != null ? currentValue : param.default)) {
                    o.selected = true;
                }
                input.appendChild(o);
            });
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'settings-input';
            input.rows = 16;
            input.value = currentValue != null ? currentValue : (param.default || '');
            input.style.width = '100%';
            input.style.boxSizing = 'border-box';
            input.style.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
            input.style.fontSize = '11px';
            input.style.lineHeight = '1.35';
            input.style.padding = '10px';
            input.style.borderRadius = '6px';
            input.style.resize = 'vertical';
            input.style.minHeight = '220px';
            input.style.background = 'var(--sp-ui-surface-bg, #1e2740)';
            input.style.color = 'var(--sp-text, #d1d4dc)';
            input.style.border = '1px solid var(--sp-ui-border, rgba(42,46,57,0.55))';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'time') {
            input = document.createElement('input');
            input.type = 'time';
            input.className = 'settings-input';
            input.value = currentValue || param.default;
            input.style.width = '160px';
            input.style.cursor = 'pointer';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'text') {
            let type = indicatorType || 'unknown';
            
            // Fallback: determine type from name if not set
            if (type === 'unknown') {
                if (indicatorType.startsWith('SMA')) type = 'sma';
                else if (indicatorType.startsWith('EMA')) type = 'ema';
                else if (indicatorType.startsWith('WMA')) type = 'wma';
                else if (indicatorType.startsWith('BB')) type = 'bb';
                else if (indicatorType.startsWith('RSI')) type = 'rsi';
                else if (indicatorType.startsWith('MACD')) type = 'macd';
                else if (indicatorType.startsWith('VWAP')) type = 'vwap';
                else if (indicatorType.startsWith('Stoch')) type = 'stochastic';
            }
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'settings-input';
            input.value = currentValue;
            input.style.width = '160px';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        }
        form.appendChild(wrapper);
    });

    panel.appendChild(form);

    const handleOutsideClick = (event) => {
        const clickedInsideColorControl = colorControls.some(control =>
            typeof control.contains === 'function' && control.contains(event.target)
        );
        if (!panel.contains(event.target) && !clickedInsideColorControl) {
            closeAllPalettes();
        }
    };
    document.addEventListener('click', handleOutsideClick, true);

    // Buttons
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'settings-actions';
    buttonWrapper.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:15px;padding:0;';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-btn settings-btn-save';
    saveBtn.style.cssText = 'flex:0 0 auto;min-width:150px;width:auto;padding:10px 22px;';
    saveBtn.textContent = existingIndicator ? 'Apply Changes' : 'Add Indicator';
    const closePanel = () => {
        document.removeEventListener('click', handleOutsideClick, true);
        closeAllPalettes();
        destroyAllPalettes();
        backdrop.remove();
        panel.remove();
    };

    saveBtn.onclick = () => {
        const newParams = {};
        const newStyle = {};
        
        def.params.forEach(param => {
            const input = form.querySelector(`[data-param-id="${param.id}"]`);
            if (!input) {
                console.warn('Input not found for param:', param.id);
                return;
            }
            let value;

            if (param.type === 'checkbox') {
                value = input.checked;
            } else {
                value = input.value;
            }

            if (param.type === 'number') {
                value = parseFloat(value);
                if (isNaN(value)) value = param.default;
            }

            // Check if the parameter is a style parameter (heuristic: if it contains 'Color' or 'Width')
            if (param.id.toLowerCase().includes('color') || param.id.toLowerCase().includes('width') || param.id.toLowerCase().includes('fill')) {
                newStyle[param.id] = value;
            } else {
                newParams[param.id] = value;
            }
        });

        let targetChart = (typeof window.getActiveChart === 'function' ? window.getActiveChart() : null) || chartInstance;
        if (!targetChart || typeof targetChart.addIndicator !== 'function') {
            targetChart = window.chart || window.mainChart;
        }

        if (!targetChart || typeof targetChart.addIndicator !== 'function') {
            console.error('❌ No valid chart instance with addIndicator method found');
            alert('Error: Chart indicator system not loaded. Please refresh the page.');
            closePanel();
            return;
        }

        if (indicatorType === 'custom') {
            const mergedEarly = { ...newParams, ...newStyle };
            const TC = typeof window.TalariaCustomIndicators !== 'undefined' ? window.TalariaCustomIndicators : null;
            if (TC && typeof TC.validateCustomScriptSource === 'function') {
                const check = TC.validateCustomScriptSource(mergedEarly.script);
                if (!check.ok) {
                    alert(check.error || 'Invalid script');
                    return;
                }
            }
        }

        if (existingIndicator) {
            // Edit existing indicator
            const mergedParams = { ...newParams, ...newStyle };
            if (indicatorType === 'custom' && typeof targetChart.updateIndicator === 'function') {
                const p = { ...mergedParams };
                p.customParams = { period: p.period };
                delete p.period;
                p.separatePanel = p.placement === 'panel';
                p.overlay = p.placement !== 'panel';
                delete p.placement;
                targetChart.updateIndicator(existingIndicator.id, p);
                console.log(`✅ Updated ${existingIndicator.name} on panel ${targetChart.panelIndex || 'main'}`);
            } else if (typeof targetChart.updateIndicator === 'function') {
                targetChart.updateIndicator(existingIndicator.id, mergedParams);
                console.log(`✅ Updated ${existingIndicator.name} on panel ${targetChart.panelIndex || 'main'}`);
            } else if (typeof targetChart.editIndicator === 'function') {
                targetChart.editIndicator(existingIndicator.id, mergedParams);
            }
        } else {
            // Add new indicator
            if (indicatorType === 'custom') {
                const raw = { ...newParams, ...newStyle };
                const payload = {
                    name: raw.name,
                    script: raw.script,
                    customParams: { period: raw.period },
                    separatePanel: raw.placement === 'panel',
                    overlay: raw.placement !== 'panel',
                    customApiVersion: (typeof window.TalariaCustomIndicators !== 'undefined' && window.TalariaCustomIndicators.API_VERSION) || 1
                };
                targetChart.addIndicator('custom', payload);
            } else {
                targetChart.addIndicator(indicatorType, { ...newParams, ...newStyle });
            }
        }

        // Also close the indicator selection menu if it's open
        const indicatorMenu = document.getElementById('indicatorSelectionMenu');
        if (indicatorMenu) {
            indicatorMenu.classList.remove('visible');
            indicatorMenu.style.visibility = 'hidden';
            indicatorMenu.style.opacity = '0';
        }
        const menuBackdrop = document.getElementById('indicatorMenuBackdrop');
        if (menuBackdrop) {
            menuBackdrop.style.visibility = 'hidden';
            menuBackdrop.style.opacity = '0';
        }

        // Remove panel and backdrop
        closePanel();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-btn settings-btn-close';
    cancelBtn.style.cssText = 'flex:0 0 auto;min-width:130px;width:auto;padding:10px 22px;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        closePanel();
    };

    buttonWrapper.appendChild(saveBtn);
    buttonWrapper.appendChild(cancelBtn);
    panel.appendChild(buttonWrapper);

    // Add both backdrop and panel to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    
    // Click backdrop to close
    backdrop.onclick = () => {
        closePanel();
    };
}

// 3. Integration with Chart

function setupIndicatorUI(chartInstance) {
    const indicatorsBtn = document.getElementById('indicatorsBtn');
    if (!indicatorsBtn) return;

    const menu = createIndicatorSelectionMenu(chartInstance);
    document.body.appendChild(menu);

    try {
        const syncIndBtnActive = () => {
            indicatorsBtn.classList.toggle('active', menu.classList.contains('visible'));
        };
        syncIndBtnActive();
        new MutationObserver(syncIndBtnActive).observe(menu, { attributes: true, attributeFilter: ['class'] });
    } catch (err) { /* ignore */ }

    indicatorsBtn.onclick = (e) => {
        e.stopPropagation();
        // Toggle visibility of the selection menu
        const isVisible = menu.classList.contains('visible');
        
        // Close any open settings panel
        const existingPanel = document.getElementById('indicatorSettingsPanel');
        if (existingPanel) existingPanel.remove();

        if (isVisible) {
            menu.classList.remove('visible');
        } else {
            dismissToolbarDropdownsForModal();
            // Show centered menu (position is set in CSS)
            menu.classList.add('visible');
        }
    };

    // Close menu/panel when clicking outside
    document.addEventListener('click', (e) => {
        if (menu.classList.contains('visible') && !menu.contains(e.target) && !indicatorsBtn.contains(e.target)) {
            menu.classList.remove('visible');
            const backdrop = document.getElementById('indicatorMenuBackdrop');
            if (backdrop) {
                backdrop.style.visibility = 'hidden';
                backdrop.style.opacity = '0';
            }
        }
        const existingPanel = document.getElementById('indicatorSettingsPanel');
        if (existingPanel && !existingPanel.contains(e.target) && !indicatorsBtn.contains(e.target)) {
            // Only remove if the click wasn't on the button that triggered the menu
            // This is a bit tricky, but let's rely on the button's click handler to manage the panel/menu state
        }
    });
    
    // Override the default OHLC indicator display to allow editing
    chartInstance.updateOHLCIndicators = function() {
        const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
        const div = document.getElementById('ohlcIndicators' + idSuffix);
        
        if (!div) return;
        
        div.innerHTML = '';
        
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }
        
        // Only show overlay indicators in OHLC panel
        const overlayIndicators = this.indicators.active.filter(function(ind) {
            return ind.overlay !== false;
        });
        
        for (let i = 0; i < overlayIndicators.length; i++) {
            const indicator = overlayIndicators[i];
            const item = document.createElement('div');
            item.style.cssText = TALARIA_INDICATOR_CHIP_CSS;

            item.onmouseenter = function() {
                item.style.background = TALARIA_INDICATOR_CHIP_BG_HOVER;
                item.style.borderColor = TALARIA_INDICATOR_CHIP_BORDER_HOVER;
            };
            item.onmouseleave = function() {
                item.style.background = TALARIA_INDICATOR_CHIP_BG;
                item.style.borderColor = TALARIA_IND_CHIP_BORDER;
            };

            // Color indicator
            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = TALARIA_INDICATOR_COLOR_STRIP(displayColor);
            item.appendChild(colorBox);

            // Name (dimmed when hidden)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            setTalariaIndChipNameEl(nameSpan, indicator.visible !== false);
            item.appendChild(nameSpan);

            const actions = document.createElement('span');
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:4px;flex-shrink:0;';

            const self = this;
            const id = indicator.id;
            const type = indicator.type;

            // Visibility toggle (eye icon) - for first occurrence
            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';  // SVG eye icons
            visibilityBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#787b86;opacity:' + (indicator.visible !== false ? '1' : '0.5') + ';';
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            };
            visibilityBtn.onmouseleave = function() {
                visibilityBtn.style.background = 'transparent';
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                // Toggle visibility
                indicator.visible = indicator.visible === false ? true : false;
                
                // Update icon
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                visibilityBtn.style.opacity = indicator.visible ? '1' : '0.5';
                visibilityBtn.title = indicator.visible ? 'Click to hide' : 'Click to show';
                
                setTalariaIndChipNameEl(nameSpan, indicator.visible);
                
                // Hide/show indicator data to actually hide it from chart
                if (!indicator.visible) {
                    // Store the data temporarily and clear it
                    if (indicator.data) {
                        indicator._hiddenData = indicator.data;
                        indicator.data = [];  // Use empty array instead of null
                        console.log('📦 Stored and cleared indicator.data');
                    }
                    if (self.indicators && self.indicators.data && self.indicators.data[id]) {
                        indicator._hiddenDataStore = self.indicators.data[id];
                        self.indicators.data[id] = [];  // Use empty array instead of null
                        console.log('📦 Stored and cleared indicators.data[' + id + ']');
                    }
                } else {
                    // Restore the data
                    if (indicator._hiddenData) {
                        indicator.data = indicator._hiddenData;
                        delete indicator._hiddenData;
                        console.log('♻️ Restored indicator.data');
                    }
                    if (indicator._hiddenDataStore && self.indicators && self.indicators.data) {
                        self.indicators.data[id] = indicator._hiddenDataStore;
                        delete indicator._hiddenDataStore;
                        console.log('♻️ Restored indicators.data[' + id + ']');
                    }
                }
                
                console.log(`👁 Toggled visibility for ${indicator.name}: ${indicator.visible}`);
                
                // Refresh the chart
                if (typeof self.render === 'function') {
                    self.render();
                }
            };
            actions.appendChild(visibilityBtn);

            const settingsBtn = document.createElement('span');
            settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            settingsBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#787b86;';
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
                console.log(`📝 Opening settings for ${indicator.name} on panel ${self.panelIndex || 'main'}`);
                console.log('📋 Indicator type:', type, 'Indicator object:', indicator);
                if (typeof createIndicatorSettingsPanel === 'function') {
                    createIndicatorSettingsPanel(self, type, indicator);
                } else {
                    console.error('❌ createIndicatorSettingsPanel is not a function!');
                }
            };
            actions.appendChild(settingsBtn);

            // Click to EDIT when clicking the whole chip
            item.onclick = function(e) {
                e.stopPropagation();
                console.log(`📝 Opening settings for ${indicator.name} on panel ${self.panelIndex || 'main'}`);
                createIndicatorSettingsPanel(self, type, indicator);
            };

            // Add a small 'x' button to remove
            const removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#f23645;font-size:14px;font-weight:600;line-height:1;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.background = 'rgba(242, 54, 69, 0.2)';
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
    };
}

window.INDICATOR_DEFINITIONS = INDICATOR_DEFINITIONS;
window.setupIndicatorUI = setupIndicatorUI;

// Auto-initialize: retry until a chart instance is available (handles async chart init)
let _indicatorUIReady = false;
function _tryInitIndicatorUI() {
    if (_indicatorUIReady) return;
    const chartInstance = window.chart || window.mainChart;
    if (chartInstance) {
        _indicatorUIReady = true;
        console.log('🎨 Setting up indicator UI');
        setupIndicatorUI(chartInstance);
    } else {
        setTimeout(_tryInitIndicatorUI, 150);
    }
}
_tryInitIndicatorUI();

// Add updateIndicator function if it doesn't exist
if (typeof Chart !== 'undefined' && !Chart.prototype.updateIndicator) {
    Chart.prototype.updateIndicator = function(id, newParams) {
        const self = this;
        const indicator = this.indicators.active.find(function(ind) {
            return ind.id === id;
        });
        
        if (!indicator) {
            console.error('Indicator not found:', id);
            return;
        }
        
        console.log('📝 Updating indicator:', indicator.name, 'with params:', newParams);
        
        // Save old parameters
        const oldType = indicator.type;
        const oldParams = Object.assign({}, indicator.params);
        
        // Update parameters
        if (newParams.period !== undefined) indicator.params.period = parseInt(newParams.period);
        if (newParams.stdDev !== undefined) indicator.params.stdDev = parseFloat(newParams.stdDev);
        if (newParams.fast !== undefined) indicator.params.fast = parseInt(newParams.fast);
        if (newParams.slow !== undefined) indicator.params.slow = parseInt(newParams.slow);
        if (newParams.signal !== undefined) indicator.params.signal = parseInt(newParams.signal);
        if (newParams.smoothK !== undefined) indicator.params.smoothK = parseInt(newParams.smoothK);
        if (newParams.smoothD !== undefined) indicator.params.smoothD = parseInt(newParams.smoothD);
        
        // Update colors
        if (newParams.color !== undefined) indicator.style.color = newParams.color;
        if (newParams.upperColor !== undefined) indicator.style.upperColor = newParams.upperColor;
        if (newParams.middleColor !== undefined) indicator.style.middleColor = newParams.middleColor;
        if (newParams.lowerColor !== undefined) indicator.style.lowerColor = newParams.lowerColor;
        if (newParams.macdColor !== undefined) indicator.style.macdColor = newParams.macdColor;
        if (newParams.signalColor !== undefined) indicator.style.signalColor = newParams.signalColor;
        if (newParams.histogramColor !== undefined) indicator.style.histogramColor = newParams.histogramColor;
        if (newParams.kColor !== undefined) indicator.style.kColor = newParams.kColor;
        if (newParams.dColor !== undefined) indicator.style.dColor = newParams.dColor;
        if (newParams.adxColor !== undefined) indicator.style.adxColor = newParams.adxColor;
        if (newParams.plusDIColor !== undefined) indicator.style.plusDIColor = newParams.plusDIColor;
        if (newParams.minusDIColor !== undefined) indicator.style.minusDIColor = newParams.minusDIColor;
        
        // Update name based on type
        switch(indicator.type) {
            case 'sma':
                indicator.name = 'SMA(' + indicator.params.period + ')';
                break;
            case 'ema':
                indicator.name = 'EMA(' + indicator.params.period + ')';
                break;
            case 'wma':
                indicator.name = 'WMA(' + indicator.params.period + ')';
                break;
            case 'bb':
                indicator.name = 'BB(' + indicator.params.period + ',' + indicator.params.stdDev + ')';
                break;
            case 'rsi':
                indicator.name = 'RSI(' + indicator.params.period + ')';
                break;
            case 'macd':
                indicator.name = 'MACD(' + indicator.params.fast + ',' + indicator.params.slow + ',' + indicator.params.signal + ')';
                break;
            case 'stochastic':
                indicator.name = 'Stoch(' + indicator.params.period + ',' + indicator.params.smoothK + ',' + indicator.params.smoothD + ')';
                break;
            case 'vwap':
                indicator.name = 'VWAP';
                break;
            case 'atr':
                indicator.name = 'ATR(' + indicator.params.period + ')';
                break;
            case 'cci':
                indicator.name = 'CCI(' + indicator.params.period + ')';
                break;
            case 'adx':
                indicator.name = 'ADX(' + indicator.params.period + ')';
                break;
        }
        
        // Recalculate the indicator data directly
        console.log('🔄 Recalculating indicator data...');
        
        if (!this.data || this.data.length === 0) {
            console.error('No chart data available');
            return;
        }
        
        // Recalculate based on indicator type
        switch(indicator.type) {
            case 'atr':
                // Average True Range
                const atrPeriod = indicator.params.period;
                // Re-calculate ATR (assuming calculateATR is available globally or on Chart prototype)
                // Since the original file didn't include the calculation logic here, I'll assume it's available globally as in the first file.
                if (typeof calculateATR === 'function') {
                    this.indicators.data[id] = calculateATR(this.data, atrPeriod);
                    console.log('✅ ATR recalculated with period:', atrPeriod);
                } else {
                    console.error('❌ calculateATR function not found. Cannot recalculate ATR.');
                }
                break;
            case 'cci':
                // Commodity Channel Index
                const cciPeriod = indicator.params.period;
                if (typeof calculateCCI === 'function') {
                    this.indicators.data[id] = calculateCCI(this.data, cciPeriod);
                    console.log('✅ CCI recalculated with period:', cciPeriod);
                } else {
                    console.error('❌ calculateCCI function not found. Cannot recalculate CCI.');
                }
                break;
            case 'adx':
                // Average Directional Index
                const adxPeriod = indicator.params.period;
                if (typeof calculateADX === 'function') {
                    this.indicators.data[id] = calculateADX(this.data, adxPeriod);
                    console.log('✅ ADX recalculated with period:', adxPeriod);
                } else {
                    console.error('❌ calculateADX function not found. Cannot recalculate ADX.');
                }
                break;
            case 'sma':
                // Simple Moving Average
                const period = indicator.params.period;
                const newData = [];
                for (let i = 0; i < this.data.length; i++) {
                    if (i < period - 1) {
                        newData.push(null);
                    } else {
                        let sum = 0;
                        for (let j = 0; j < period; j++) {
                            sum += this.data[i - j].c;
                        }
                        newData.push(sum / period);
                    }
                }
                indicator.data = newData;
                console.log('✅ SMA recalculated with period:', period);
                break;
                
            case 'ema':
                // Exponential Moving Average
                const emaPeriod = indicator.params.period;
                const emaData = [];
                const multiplier = 2 / (emaPeriod + 1);
                let ema = null;
                
                for (let i = 0; i < this.data.length; i++) {
                    if (i < emaPeriod - 1) {
                        emaData.push(null);
                    } else if (i === emaPeriod - 1) {
                        // First EMA is SMA
                        let sum = 0;
                        for (let j = 0; j < emaPeriod; j++) {
                            sum += this.data[i - j].c;
                        }
                        ema = sum / emaPeriod;
                        emaData.push(ema);
                    } else {
                        ema = (this.data[i].c - ema) * multiplier + ema;
                        emaData.push(ema);
                    }
                }
                indicator.data = emaData;
                console.log('✅ EMA recalculated with period:', emaPeriod);
                break;
                
            case 'wma':
                // Weighted Moving Average
                const wmaPeriod = indicator.params.period;
                const wmaData = [];
                const denominator = (wmaPeriod * (wmaPeriod + 1)) / 2;
                
                for (let i = 0; i < this.data.length; i++) {
                    if (i < wmaPeriod - 1) {
                        wmaData.push(null);
                    } else {
                        let sum = 0;
                        for (let j = 0; j < wmaPeriod; j++) {
                            sum += this.data[i - j].c * (wmaPeriod - j);
                        }
                        wmaData.push(sum / denominator);
                    }
                }
                indicator.data = wmaData;
                console.log('✅ WMA recalculated with period:', wmaPeriod);
                break;
                
            default:
                console.log('⚠️ Direct recalculation not implemented for:', indicator.type);
                // Fall back to remove and re-add method
                const index = this.indicators.active.indexOf(indicator);
                if (index > -1 && typeof this.addIndicator === 'function') {
                    // Remove the old indicator
                    this.indicators.active.splice(index, 1);
                    
                    // Add it back with new parameters
                    const addParams = Object.assign({}, indicator.params, indicator.style);
                    const newIndicator = this.addIndicator(oldType, addParams);
                    
                    if (newIndicator) {
                        newIndicator.id = id;
                        console.log('✅ Indicator recreated');
                    } else {
                        // Restore the old indicator if recreation failed
                        this.indicators.active.splice(index, 0, indicator);
                        console.error('❌ Failed to recreate indicator');
                    }
                }
                break;
        }
        
        // Update the indicators data storage
        if (this.indicators && this.indicators.data) {
            this.indicators.data[id] = indicator.data;
        }
        
        // Update display
        if (typeof this.render === 'function') {
            this.render();
        }
        
        this.updateOHLCIndicators();
        
        console.log('✅ Update complete');
    };
    console.log('✅ Added Chart.prototype.updateIndicator');
}

// Override Chart prototype to add edit buttons to ALL charts
if (typeof Chart !== 'undefined') {
    const originalUpdateOHLC = Chart.prototype.updateOHLCIndicators;
    Chart.prototype.updateOHLCIndicators = function() {
        const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
        const div = document.getElementById('ohlcIndicators' + idSuffix);
        
        if (!div) return;
        
        div.innerHTML = '';
        
        if (!this.indicators || !this.indicators.active || this.indicators.active.length === 0) {
            return;
        }
        
        // Only show overlay indicators in OHLC panel
        const overlayIndicators = this.indicators.active.filter(function(ind) {
            return ind.overlay !== false;
        });
        
        for (let i = 0; i < overlayIndicators.length; i++) {
            const indicator = overlayIndicators[i];
            const item = document.createElement('div');
            item.style.cssText = TALARIA_INDICATOR_CHIP_CSS;

            item.onmouseenter = function() {
                item.style.background = TALARIA_INDICATOR_CHIP_BG_HOVER;
                item.style.borderColor = TALARIA_INDICATOR_CHIP_BORDER_HOVER;
            };
            item.onmouseleave = function() {
                item.style.background = TALARIA_INDICATOR_CHIP_BG;
                item.style.borderColor = TALARIA_IND_CHIP_BORDER;
            };

            // Color indicator
            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = TALARIA_INDICATOR_COLOR_STRIP(displayColor);
            item.appendChild(colorBox);

            // Name (dimmed when hidden)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            setTalariaIndChipNameEl(nameSpan, indicator.visible !== false);
            item.appendChild(nameSpan);

            const actions = document.createElement('span');
            actions.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:4px;flex-shrink:0;';

            const self = this;
            const id = indicator.id;
            const type = indicator.type;

            // Visibility toggle (eye icon)
            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';  // SVG eye icons
            visibilityBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#787b86;opacity:' + (indicator.visible !== false ? '1' : '0.5') + ';';
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            };
            visibilityBtn.onmouseleave = function() {
                visibilityBtn.style.background = 'transparent';
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                // Toggle visibility
                indicator.visible = indicator.visible === false ? true : false;
                
                // Update icon
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                visibilityBtn.style.opacity = indicator.visible ? '1' : '0.5';
                visibilityBtn.title = indicator.visible ? 'Click to hide' : 'Click to show';
                
                setTalariaIndChipNameEl(nameSpan, indicator.visible);
                
                // Hide/show indicator data to actually hide it from chart
                if (!indicator.visible) {
                    // Store the data temporarily and clear it
                    if (indicator.data) {
                        indicator._hiddenData = indicator.data;
                        indicator.data = [];  // Use empty array instead of null
                        console.log('📦 Stored and cleared indicator.data');
                    }
                    if (self.indicators && self.indicators.data && self.indicators.data[id]) {
                        indicator._hiddenDataStore = self.indicators.data[id];
                        self.indicators.data[id] = [];  // Use empty array instead of null
                        console.log('📦 Stored and cleared indicators.data[' + id + ']');
                    }
                } else {
                    // Restore the data
                    if (indicator._hiddenData) {
                        indicator.data = indicator._hiddenData;
                        delete indicator._hiddenData;
                        console.log('♻️ Restored indicator.data');
                    }
                    if (indicator._hiddenDataStore && self.indicators && self.indicators.data) {
                        self.indicators.data[id] = indicator._hiddenDataStore;
                        delete indicator._hiddenDataStore;
                        console.log('♻️ Restored indicators.data[' + id + ']');
                    }
                }
                
                console.log(`👁 Toggled visibility for ${indicator.name}: ${indicator.visible}`);
                
                // Refresh the chart
                if (typeof self.render === 'function') {
                    self.render();
                }
            };
            actions.appendChild(visibilityBtn);

            const settingsBtn = document.createElement('span');
            settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            settingsBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#787b86;';
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
                console.log(`📝 Opening settings for ${indicator.name}`);
                console.log('📋 Indicator type:', type, 'Indicator object:', indicator);
                if (typeof createIndicatorSettingsPanel === 'function') {
                    createIndicatorSettingsPanel(self, type, indicator);
                } else {
                    console.error('❌ createIndicatorSettingsPanel is not a function!');
                }
            };
            actions.appendChild(settingsBtn);

            // Click to EDIT when clicking the whole chip
            item.onclick = function(e) {
                e.stopPropagation();
                console.log(`📝 Opening settings for ${indicator.name}`);
                createIndicatorSettingsPanel(self, type, indicator);
            };

            // Add a small 'x' button to remove
            const removeBtn = document.createElement('span');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#f23645;font-size:14px;font-weight:600;line-height:1;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.background = 'rgba(242, 54, 69, 0.2)';
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
    };
    console.log('✅ Chart.prototype.updateOHLCIndicators overridden with edit buttons');
}

// Export createIndicatorSettingsPanel globally for volume settings
window.createIndicatorSettingsPanel = createIndicatorSettingsPanel;
