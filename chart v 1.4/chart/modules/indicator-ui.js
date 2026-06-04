// indicator-ui.js

/** Pine-aligned inputs for ICT Everything (native renderer in chart-indicators-full.js). */
const OHLC_SOURCE_OPTIONS = [
    { value: 'open', label: 'Open' },
    { value: 'high', label: 'High' },
    { value: 'low', label: 'Low' },
    { value: 'close', label: 'Close' },
    { value: 'hl2', label: 'HL2 (High + Low) / 2' },
    { value: 'hlc3', label: 'HLC3 (High + Low + Close) / 3' },
    { value: 'ohlc4', label: 'OHLC4 (Open + High + Low + Close) / 4' }
];
const INDICATOR_PLOT_STYLE_OPTIONS = [
    'Line',
    'Line with breaks',
    'Step line',
    'Step line with breaks',
    'Step line with diamonds',
    'Histogram',
    'Cross',
    'Area',
    'Area with breaks',
    'Columns',
    'Circles'
].map(function (v) { return { value: v, label: v }; });

/** Max plot line thickness for all built-in indicators (Style tab numeric width fields). */
const INDICATOR_MAX_LINE_WIDTH = 4;
const INDICATOR_MIN_LINE_WIDTH = 1;

function isIndicatorLineWidthParam(param) {
    if (!param || param.type !== 'number') return false;
    const id = String(param.id || '').toLowerCase();
    return /linewidth/.test(id);
}

function indicatorParamAllowsNegative(param) {
    const id = String(param.id || '').toLowerCase();
    if (param.min != null && param.min < 0) return true;
    if (/^(overbought|oversold|mid|zero)value$/.test(id)) return true;
    return false;
}

function clampIndicatorLineWidth(w, fallback) {
    fallback = fallback != null ? fallback : 2;
    const n = Number(w);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(INDICATOR_MIN_LINE_WIDTH, Math.min(INDICATOR_MAX_LINE_WIDTH, Math.round(n)));
}

function sanitizeIndicatorParamValue(param, rawValue) {
    if (!param) return rawValue;
    if (param.type === 'checkbox') return !!rawValue;
    if (param.type !== 'number') return rawValue;
    let value = parseFloat(rawValue);
    if (!Number.isFinite(value)) value = param.default;
    if (isIndicatorLineWidthParam(param)) {
        return clampIndicatorLineWidth(value, param.default != null ? param.default : 2);
    }
    let min = param.min;
    if (min == null && !indicatorParamAllowsNegative(param)) min = 0;
    if (min != null) value = Math.max(min, value);
    if (param.max != null) value = Math.min(param.max, value);
    return value;
}

function clampIndicatorStyleLineWidths(style) {
    if (!style) return;
    Object.keys(style).forEach(function (key) {
        if (/linewidth/i.test(key)) {
            style[key] = clampIndicatorLineWidth(style[key], style[key]);
        }
    });
}

function sanitizeIndicatorPayloadFromDefinition(def, payload) {
    if (!def || !payload) return payload;
    const out = Object.assign({}, payload);
    def.params.forEach(function (param) {
        if (param.type === 'heading' || param.type === 'divider') return;
        if (out[param.id] === undefined) return;
        out[param.id] = sanitizeIndicatorParamValue(param, out[param.id]);
    });
    clampIndicatorStyleLineWidths(out);
    return out;
}

/** Full plot-style list for indicators; includes legacy dash names for saved layouts + ICT. */
const OVERLAY_LINE_STYLE_OPTIONS = INDICATOR_PLOT_STYLE_OPTIONS.concat([
    { value: 'Dashed', label: 'Dashed' },
    { value: 'Dotted', label: 'Dotted' },
    { value: 'Dashdot', label: 'Dash-dot' },
    { value: 'Solid', label: 'Solid' }
]);

/** Full Style + Input params for overlay moving averages (SMA, EMA, WMA, DEMA, TEMA, HMA). */
function overlayMaFullParams(defaultPeriod, defaultColor) {
    return [
        { id: 'period', label: 'Length', type: 'number', default: defaultPeriod, min: 1 },
        { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
        { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line' },
        { id: 'color', label: 'Line Color', type: 'color', default: defaultColor },
        { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Style-only overlay line (VWAP, etc.). */
function overlayLineStyleParams(defaultColor) {
    return [
        { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line' },
        { id: 'color', label: 'Line Color', type: 'color', default: defaultColor },
        { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Overlay oscillator on price chart (ROC, Momentum, StdDev). */
function overlayOscFullParams(defaultPeriod, defaultColor) {
    return [
        { id: 'period', label: 'Length', type: 'number', default: defaultPeriod, min: 1 },
        { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
        { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line' },
        { id: 'color', label: 'Line Color', type: 'color', default: defaultColor },
        { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Separate-panel single-line oscillator extras (line style + label toggle). */
function separateLineStyleExtras() {
    return [
        { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line' },
        { id: 'showLabel', label: 'Show Label', type: 'checkbox', default: true, tab: 'style' }
    ];
}

const BB_MA_TYPE_OPTIONS = [
    { value: 'SMA', label: 'SMA' },
    { value: 'EMA', label: 'EMA' },
    { value: 'RMA', label: 'SMMA(RMA)' },
    { value: 'WMA', label: 'WMA' },
    { value: 'VWMA', label: 'VWMA' }
];

/** TradingView-style Bollinger Bands Input tab. */
function bbInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'source', label: 'Source', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' },
        { id: 'stdDev', label: 'Std Dev', type: 'number', default: 2, min: 0.001, step: 0.1, tab: 'input' },
        { id: 'offset', label: 'Offset', type: 'number', default: 0, step: 1, tab: 'input' },
        { id: 'maType', label: 'MA Type', type: 'select', tab: 'input', default: 'SMA', options: BB_MA_TYPE_OPTIONS }
    ];
}

/** TradingView-style Bollinger Bands Style tab (per-band show/color/thickness/style + fill). */
function bollingerBandsStyleParams() {
    return [
        { id: 'showMiddle', label: 'Show basis', type: 'checkbox', default: true, tab: 'style' },
        { id: 'middleColor', label: 'Basis color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'middleLineStyle', label: 'Basis line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'middleLineWidth', label: 'Basis thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showUpper', label: 'Show upper band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'upperColor', label: 'Upper band color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'upperLineStyle', label: 'Upper band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'upperLineWidth', label: 'Upper band thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showLower', label: 'Show lower band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'lowerColor', label: 'Lower band color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'lowerLineStyle', label: 'Lower band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lowerLineWidth', label: 'Lower band thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showFill', label: 'Show fill', type: 'checkbox', default: true, tab: 'style' },
        { id: 'fillColor', label: 'Background', type: 'color', default: 'rgba(41,98,255,0.1)', tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Shared per-band Style params (Bollinger Bands, Keltner Channels, etc.). */
function channelBandsStyleParams() {
    return bollingerBandsStyleParams();
}

/** Shared OB/OS/Mid levels + optional panel background (RSI, Aroon, etc.). */
function oscillatorLevelStyleParams() {
    return [
        { id: 'overboughtValue', label: 'Overbought value', type: 'number', default: 70, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showOverbought', label: 'Show overbought level', type: 'checkbox', default: true, tab: 'style' },
        { id: 'overboughtColor', label: 'Overbought color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'overboughtLineStyle', label: 'Overbought line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'oversoldValue', label: 'Oversold value', type: 'number', default: 30, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showOversold', label: 'Show oversold level', type: 'checkbox', default: true, tab: 'style' },
        { id: 'oversoldColor', label: 'Oversold color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'oversoldLineStyle', label: 'Oversold line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'midValue', label: 'Mid value', type: 'number', default: 50, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showMid', label: 'Show mid level', type: 'checkbox', default: true, tab: 'style' },
        { id: 'midColor', label: 'Mid color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'midLineStyle', label: 'Mid line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'showBg', label: 'Show background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'Background', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' }
    ];
}

/** TradingView-style Aroon Style tab (Up/Down lines only). */
function aroonStyleParams() {
    return [
        { id: 'showUp', label: 'Show Aroon Up', type: 'checkbox', default: true, tab: 'style' },
        { id: 'upColor', label: 'Aroon Up color', type: 'color', default: '#fb8c00', tab: 'style' },
        { id: 'upLineStyle', label: 'Aroon Up line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'upLineWidth', label: 'Aroon Up thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showDown', label: 'Show Aroon Down', type: 'checkbox', default: true, tab: 'style' },
        { id: 'downColor', label: 'Aroon Down color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'downLineStyle', label: 'Aroon Down line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'downLineWidth', label: 'Aroon Down thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ];
}

/** TradingView-style RSI Style tab (RSI line + OB/OS/Mid levels + optional panel bg). */
function rsiInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 14, min: 1, tab: 'input' },
        { id: 'source', label: 'Source', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' },
        { id: 'divergenceEnabled', label: 'Calculate Divergence', type: 'checkbox', default: false, tab: 'input' },
        { id: 'smoothingHeading', label: 'Smoothing', type: 'heading', tab: 'input' },
        {
            id: 'smoothingType', label: 'Type', type: 'select', tab: 'input', default: 'None',
            options: MA_SMOOTHING_TYPE_OPTIONS
        },
        { id: 'smoothingLength', label: 'Length', type: 'number', default: 14, min: 1, tab: 'input' },
        { id: 'bbStdDev', label: 'BB stdDev', type: 'number', default: 2, min: 0.1, step: 0.1, tab: 'input' }
    ];
}

/** RSI Style tab band rows (values 70 / 50 / 30 on Style tab). */
function rsiBandStyleParams() {
    return [
        { id: 'overboughtValue', label: 'Upper band value', type: 'number', default: 70, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showOverbought', label: 'Show upper band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'overboughtColor', label: 'Upper band color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'overboughtLineStyle', label: 'Upper band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'overboughtLineWidth', label: 'Upper band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'midValue', label: 'Middle band value', type: 'number', default: 50, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showMid', label: 'Show middle band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'midColor', label: 'Middle band color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'midLineStyle', label: 'Middle band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'midLineWidth', label: 'Middle band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'oversoldValue', label: 'Lower band value', type: 'number', default: 30, min: 0, max: 100, step: 1, tab: 'style' },
        { id: 'showOversold', label: 'Show lower band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'oversoldColor', label: 'Lower band color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'oversoldLineStyle', label: 'Lower band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'oversoldLineWidth', label: 'Lower band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' }
    ];
}

function rsiBackgroundStyleParams() {
    return [
        { id: 'showBg', label: 'RSI background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'RSI background color', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' },
        { id: 'showObGradient', label: 'Overbought gradient fill', type: 'checkbox', default: false, tab: 'style' },
        { id: 'obGradientColor', label: 'Overbought gradient color', type: 'color', default: 'rgba(239,83,80,0.12)', tab: 'style' },
        { id: 'showOsGradient', label: 'Oversold gradient fill', type: 'checkbox', default: false, tab: 'style' },
        { id: 'osGradientColor', label: 'Oversold gradient color', type: 'color', default: 'rgba(38,166,154,0.12)', tab: 'style' }
    ];
}

/** TradingView-style Donchian Channels Input tab. */
function donchianInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'offset', label: 'Offset', type: 'number', default: 0, step: 1, tab: 'input' }
    ];
}

/** TradingView-style Supertrend Input tab. */
function supertrendInputParams() {
    return [
        { id: 'period', label: 'ATR Length', type: 'number', default: 10, min: 1, tab: 'input' },
        { id: 'multiplier', label: 'Factor', type: 'number', default: 3, min: 0.1, step: 0.1, tab: 'input' }
    ];
}

/** TradingView-style Supertrend Style tab. */
function supertrendStyleParams() {
    return [
        { id: 'showUp', label: 'Show up trend', type: 'checkbox', default: true, tab: 'style' },
        { id: 'upColor', label: 'Up trend color', type: 'color', default: '#26a69a', tab: 'style' },
        { id: 'upLineStyle', label: 'Up trend line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'upLineWidth', label: 'Up trend thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showDown', label: 'Show down trend', type: 'checkbox', default: true, tab: 'style' },
        { id: 'downColor', label: 'Down trend color', type: 'color', default: '#ef5350', tab: 'style' },
        { id: 'downLineStyle', label: 'Down trend line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'downLineWidth', label: 'Down trend thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showBody', label: 'Show body middle line', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bodyColor', label: 'Body middle line color', type: 'color', default: 'rgba(120,123,134,0.5)', tab: 'style' },
        { id: 'bodyLineStyle', label: 'Body middle line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'bodyLineWidth', label: 'Body middle line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showUpBg', label: 'Show up trend background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'upBgColor', label: 'Up trend background', type: 'color', default: 'rgba(38,166,154,0.15)', tab: 'style' },
        { id: 'showDownBg', label: 'Show down trend background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'downBgColor', label: 'Down trend background', type: 'color', default: 'rgba(239,83,80,0.15)', tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** TradingView-style Donchian Channels Style tab. */
function donchianStyleParams() {
    return [
        { id: 'showUpper', label: 'Show Upper Band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'upperColor', label: 'Upper Band color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'upperLineStyle', label: 'Upper Band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'upperLineWidth', label: 'Upper Band thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showMiddle', label: 'Show Middle Band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'middleColor', label: 'Middle Band color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'middleLineStyle', label: 'Middle Band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'middleLineWidth', label: 'Middle Band thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showLower', label: 'Show Lower Band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'lowerColor', label: 'Lower Band color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'lowerLineStyle', label: 'Lower Band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lowerLineWidth', label: 'Lower Band thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** TradingView-style Keltner Channels Input tab. */
function keltnerInputParams() {
    return [
        { id: 'length', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'multiplier', label: 'Multiplier', type: 'number', default: 2, min: 0.001, step: 0.1, tab: 'input' },
        { id: 'source', label: 'Source', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' },
        { id: 'useExponentialMa', label: 'Use Exponential MA', type: 'checkbox', default: true, tab: 'input' },
        {
            id: 'bandsStyle', label: 'Bands Style', type: 'select', tab: 'input', default: 'Average True Range',
            options: [
                { value: 'Average True Range', label: 'Average True Range' },
                { value: 'True Range', label: 'True Range' },
                { value: 'Range', label: 'Range' }
            ]
        },
        { id: 'atrLength', label: 'ATR Length', type: 'number', default: 10, min: 1, tab: 'input' }
    ];
}

/** Parabolic SAR Input tab (start / increment / max). */
function psarInputParams() {
    return [
        { id: 'start', label: 'Start', type: 'number', default: 0.02, min: 0.001, step: 0.001, tab: 'input' },
        { id: 'increment', label: 'Increment', type: 'number', default: 0.02, min: 0.001, step: 0.001, tab: 'input' },
        { id: 'maxStep', label: 'Max value', type: 'number', default: 0.2, min: 0.01, step: 0.01, tab: 'input' }
    ];
}

/** Parabolic SAR Style tab (up/down colors + shared plot style). */
function psarStyleParams() {
    return [
        { id: 'showUp', label: 'Show up', type: 'checkbox', default: true, tab: 'style' },
        { id: 'showDown', label: 'Show down', type: 'checkbox', default: true, tab: 'style' },
        { id: 'bullColor', label: 'Up color', type: 'color', default: '#26a69a', tab: 'style' },
        { id: 'bearColor', label: 'Down color', type: 'color', default: '#ef5350', tab: 'style' },
        { id: 'lineStyle', label: 'Parabolic SAR line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Circles', tab: 'style' },
        { id: 'lineWidth', label: 'Parabolic SAR thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ];
}

/** Opening Range Input — custom session window in UTC-5 (America/New_York). */
function openingRangeInputParams() {
    return [
        { id: 'h_orRange', type: 'heading', label: 'Custom range (UTC-5)', tab: 'input' },
        {
            type: 'timeRange',
            label: 'Time',
            startId: 'rangeStart',
            endId: 'rangeEnd',
            defaultStart: '09:30',
            defaultEnd: '10:00',
            tab: 'input'
        }
    ];
}

function openingRangeBandStyleFields(prefix, label, colorDefault) {
    const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return [
        { id: 'show' + cap, label: 'Show ' + label.toLowerCase(), type: 'checkbox', default: true, tab: 'style' },
        { id: prefix + 'Color', label: label + ' color', type: 'color', default: colorDefault, tab: 'style' },
        { id: prefix + 'Opacity', label: label + ' opacity', type: 'number', default: 100, min: 0, max: 100, step: 1, tab: 'style' },
        { id: prefix + 'LineStyle', label: label + ' line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: prefix + 'LineWidth', label: label + ' line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' }
    ];
}

function openingRangeStyleParams() {
    return openingRangeBandStyleFields('upper', 'High band', '#2962ff')
        .concat(openingRangeBandStyleFields('middle', 'Middle line', '#787b86'))
        .concat(openingRangeBandStyleFields('lower', 'Lower band', '#2962ff'))
        .concat([
            { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
        ]);
}

function rsiStyleParams() {
    return [
        { id: 'showLine', label: 'Show RSI line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'RSI color', type: 'color', default: '#9c27b0', tab: 'style' },
        { id: 'lineStyle', label: 'RSI line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'RSI thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showMa', label: 'Show RSI-based MA', type: 'checkbox', default: true, tab: 'style' },
        { id: 'maColor', label: 'RSI-based MA color', type: 'color', default: '#ff9800', tab: 'style' },
        { id: 'maLineStyle', label: 'RSI-based MA line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'maLineWidth', label: 'RSI-based MA thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' }
    ].concat(rsiBandStyleParams()).concat(rsiBackgroundStyleParams());
}

/** Stochastic Input tab level defaults (80 / 50 / 20). */
function stochasticInputLevelParams() {
    return [
        { id: 'levelsHeading', label: 'Levels', type: 'heading', tab: 'input' },
        { id: 'overboughtValue', label: 'Upper Band', type: 'number', default: 80, min: 0, max: 100, step: 1, tab: 'input' },
        { id: 'midValue', label: 'Middle Band', type: 'number', default: 50, min: 0, max: 100, step: 1, tab: 'input' },
        { id: 'oversoldValue', label: 'Lower Band', type: 'number', default: 20, min: 0, max: 100, step: 1, tab: 'input' }
    ];
}

/** Stochastic Style tab band appearance (values on Input tab; opacity via color alpha). */
function stochasticLevelStyleParams() {
    return [
        { id: 'showOverbought', label: 'Show upper band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'overboughtColor', label: 'Upper band color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'overboughtLineStyle', label: 'Upper band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'overboughtLineWidth', label: 'Upper band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showMid', label: 'Show middle band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'midColor', label: 'Middle band color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'midLineStyle', label: 'Middle band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'midLineWidth', label: 'Middle band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showOversold', label: 'Show lower band', type: 'checkbox', default: true, tab: 'style' },
        { id: 'oversoldColor', label: 'Lower band color', type: 'color', default: '#787b86', tab: 'style' },
        { id: 'oversoldLineStyle', label: 'Lower band line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'oversoldLineWidth', label: 'Lower band line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showBg', label: 'Show background fill (upper to lower band)', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'Background fill color', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' }
    ];
}

/** ADX Input tab (DI length + ADX smoothing). */
function adxInputParams() {
    return [
        { id: 'diLength', label: 'DI length', type: 'number', default: 14, min: 1, tab: 'input' },
        { id: 'adxSmoothing', label: 'ADX Smoothing', type: 'number', default: 14, min: 1, tab: 'input' }
    ];
}

/** TradingView-style ADX Style tab (ADX / +DI / -DI lines). */
function adxStyleParams() {
    return [
        { id: 'showAdx', label: 'Show ADX line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'adxColor', label: 'ADX color', type: 'color', default: '#ff00ff', tab: 'style' },
        { id: 'adxLineStyle', label: 'ADX line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'adxLineWidth', label: 'ADX thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showPlusDI', label: 'Show +DI line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'plusDIColor', label: '+DI color', type: 'color', default: '#00e676', tab: 'style' },
        { id: 'plusDILineStyle', label: '+DI line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'plusDILineWidth', label: '+DI thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showMinusDI', label: 'Show -DI line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'minusDIColor', label: '-DI color', type: 'color', default: '#f23645', tab: 'style' },
        { id: 'minusDILineStyle', label: '-DI line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'minusDILineWidth', label: '-DI thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ];
}

/** TradingView-style Stochastic Style tab (%K / %D lines + level appearance + optional panel bg). */
function stochasticStyleParams() {
    return [
        { id: 'showK', label: 'Show %K line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'kColor', label: '%K color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'kLineStyle', label: '%K line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'kLineWidth', label: '%K thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showD', label: 'Show %D line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'dColor', label: '%D color', type: 'color', default: '#f23645', tab: 'style' },
        { id: 'dLineStyle', label: '%D line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'dLineWidth', label: '%D thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ].concat(stochasticLevelStyleParams());
}

/** CCI Input tab level defaults (80 / 20 / 50). */
function cciInputLevelParams() {
    return [
        { id: 'levelsHeading', label: 'Levels', type: 'heading', tab: 'input' },
        { id: 'overboughtValue', label: 'Overbought', type: 'number', default: 80, step: 1, tab: 'input' },
        { id: 'oversoldValue', label: 'Oversold', type: 'number', default: 20, step: 1, tab: 'input' },
        { id: 'midValue', label: 'Midline', type: 'number', default: 50, step: 1, tab: 'input' }
    ];
}

/** TradingView-style CCI Style tab (CCI line + level appearance + optional panel bg). */
function cciStyleParams() {
    return [
        { id: 'showLine', label: 'Show CCI line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'CCI color', type: 'color', default: '#00e676', tab: 'style' },
        { id: 'lineStyle', label: 'CCI line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'CCI thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ].concat(stochasticLevelStyleParams());
}

/** Williams %R Input tab level defaults (−20 / −80 / −50). */
function willrInputLevelParams() {
    return [
        { id: 'levelsHeading', label: 'Levels', type: 'heading', tab: 'input' },
        { id: 'overboughtValue', label: 'Overbought', type: 'number', default: -20, step: 1, tab: 'input' },
        { id: 'oversoldValue', label: 'Oversold', type: 'number', default: -80, step: 1, tab: 'input' },
        { id: 'midValue', label: 'Midline', type: 'number', default: -50, step: 1, tab: 'input' }
    ];
}

/** Williams %R Style tab (%R line + level appearance + optional panel bg). */
function willrStyleParams() {
    return [
        { id: 'showLine', label: 'Show %R line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: '%R color', type: 'color', default: '#ec407a', tab: 'style' },
        { id: 'lineStyle', label: '%R line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: '%R thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ].concat(stochasticLevelStyleParams());
}

/** MACD Input tab MA types (fast/slow oscillator + signal smoothing). */
const MACD_MA_TYPE_OPTIONS = ['EMA', 'SMA'];

function macdInputMaParams() {
    return [
        { id: 'oscillatorMaType', label: 'Oscillator MA Type', type: 'select', options: MACD_MA_TYPE_OPTIONS, default: 'EMA', tab: 'input' },
        { id: 'signalMaType', label: 'Signal MA Type', type: 'select', options: MACD_MA_TYPE_OPTIONS, default: 'EMA', tab: 'input' }
    ];
}

/** MACD histogram color slot (TradingView-style four-state coloring). */
function macdHistColorStyleParams(index, defaultColor) {
    const n = String(index);
    return [
        { id: 'histColor' + n, label: 'Color ' + n, type: 'color', default: defaultColor, tab: 'style' },
        { id: 'histColor' + n + 'LineStyle', label: 'Color ' + n + ' line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'histColor' + n + 'LineWidth', label: 'Color ' + n + ' line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' }
    ];
}

/** MACD Style tab (histogram 4-color, MACD / signal lines, zero line, optional panel bg). */
function macdStyleParams() {
    return [
        { id: 'showHist', label: 'Histogram', type: 'checkbox', default: true, tab: 'style' }
    ].concat(
        macdHistColorStyleParams(0, 'rgba(38,166,154,0.85)'),
        macdHistColorStyleParams(1, 'rgba(38,166,154,0.45)'),
        macdHistColorStyleParams(2, 'rgba(239,83,80,0.45)'),
        macdHistColorStyleParams(3, 'rgba(239,83,80,0.85)'),
        [
        { id: 'showMacd', label: 'Show MACD line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'macdColor', label: 'MACD color', type: 'color', default: '#2962ff', tab: 'style' },
        { id: 'macdLineStyle', label: 'MACD line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'macdLineWidth', label: 'MACD thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showSignal', label: 'Show signal line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'signalColor', label: 'Signal color', type: 'color', default: '#f23645', tab: 'style' },
        { id: 'signalLineStyle', label: 'Signal line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'signalLineWidth', label: 'Signal thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'zeroValue', label: 'Zero', type: 'number', default: 0, step: 0.0001, tab: 'style' },
        { id: 'showZero', label: 'Show zero line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'zeroColor', label: 'Zero color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'zeroLineStyle', label: 'Zero line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'zeroLineWidth', label: 'Zero line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'showBg', label: 'Show background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'Background', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' }
        ]
    );
}

/** Shared separate-panel oscillator Style (line + zero line + optional bg). */
function oscZeroPanelStyleParams(lineLabel, defaultColor) {
    return [
        { id: 'showLine', label: 'Show ' + lineLabel + ' line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: lineLabel + ' color', type: 'color', default: defaultColor, tab: 'style' },
        { id: 'lineStyle', label: lineLabel + ' line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: lineLabel + ' thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showZero', label: 'Show zero line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'zeroColor', label: 'Zero color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'zeroLineStyle', label: 'Zero line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'showBg', label: 'Show background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'Background', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' }
    ];
}

/** Momentum Style tab (line + zero line + optional panel bg). */
function momStyleParams() {
    return oscZeroPanelStyleParams('Momentum', '#66bb6a');
}

/** Rate of Change Style tab (line + zero line + optional panel bg). */
function rocStyleParams() {
    return oscZeroPanelStyleParams('ROC', '#ffa726');
}

/** DPO Style tab (DPO line + middle line + optional panel bg). */
function dpoStyleParams() {
    return [
        { id: 'showLine', label: 'Show DPO line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'DPO color', type: 'color', default: '#78909c', tab: 'style' },
        { id: 'lineStyle', label: 'DPO line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'DPO thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showMid', label: 'Show middle line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'midColor', label: 'Middle color', type: 'color', default: 'rgba(120,123,134,0.45)', tab: 'style' },
        { id: 'midLineStyle', label: 'Middle line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Dotted', tab: 'style' },
        { id: 'midLineWidth', label: 'Middle thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
        { id: 'midValue', label: 'Middle line', type: 'number', default: 0, step: 0.0001, tab: 'style' },
        { id: 'showBg', label: 'Show background', type: 'checkbox', default: false, tab: 'style' },
        { id: 'bgColor', label: 'Background', type: 'color', default: 'rgba(19,23,34,0.15)', tab: 'style' }
    ];
}

const MA_SMOOTHING_TYPE_OPTIONS = [
    { value: 'None', label: 'None' },
    { value: 'SMA', label: 'SMA' },
    { value: 'SMA+BB', label: 'SMA+Bollinger Bands' },
    { value: 'EMA', label: 'EMA' },
    { value: 'RMA', label: 'SMMA(RMA)' },
    { value: 'WMA', label: 'WMA' },
    { value: 'VWMA', label: 'VWMA' }
];

/** Max chart timeframe (bar minutes) on which Session Boxes may display. */
const SESSION_BOX_MAX_TIMEFRAME_OPTIONS = [
    { value: '0', label: 'All timeframes' },
    { value: '1', label: '1 minute' },
    { value: '3', label: '3 minutes' },
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '1 hour' },
    { value: '120', label: '2 hours' },
    { value: '240', label: '4 hours' },
    { value: '480', label: '8 hours' },
    { value: '720', label: '12 hours' },
    { value: '1440', label: '1 day' },
    { value: '10080', label: '1 week' }
];

const SESSION_BOX_TIMEZONE_OPTIONS = [
    { value: 'Etc/UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'New York' },
    { value: 'America/Chicago', label: 'Chicago' },
    { value: 'America/Los_Angeles', label: 'Los Angeles' },
    { value: 'Europe/London', label: 'London' },
    { value: 'Europe/Berlin', label: 'Berlin' },
    { value: 'Europe/Paris', label: 'Paris' },
    { value: 'Asia/Tokyo', label: 'Tokyo' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Australia/Sydney', label: 'Sydney' }
];

/** Session Boxes — per-session input rows (show, name, start/end on one line). */
const SESSION_BOX_SESSION_DEFS = [
    { key: 'asian', showId: 'showAsian', nameId: 'asianName', startId: 'asianStart', endId: 'asianEnd', colorId: 'asianColor',
        label: 'Asian', defaultName: 'Asian', defaultStart: '00:00', defaultEnd: '09:00', defaultColor: 'rgba(255, 193, 7, 0.15)', defaultShow: true },
    { key: 'london', showId: 'showLondon', nameId: 'londonName', startId: 'londonStart', endId: 'londonEnd', colorId: 'londonColor',
        label: 'London', defaultName: 'London', defaultStart: '07:00', defaultEnd: '16:00', defaultColor: 'rgba(33, 150, 243, 0.15)', defaultShow: true },
    { key: 'newYork', showId: 'showNewYork', nameId: 'newYorkName', startId: 'newYorkStart', endId: 'newYorkEnd', colorId: 'newYorkColor',
        label: 'New York', defaultName: 'New York', defaultStart: '12:00', defaultEnd: '21:00', defaultColor: 'rgba(76, 175, 80, 0.15)', defaultShow: true },
    { key: 'frankfurt', showId: 'showFrankfurt', nameId: 'frankfurtName', startId: 'frankfurtStart', endId: 'frankfurtEnd', colorId: 'frankfurtColor',
        label: 'Frankfurt', defaultName: 'Frankfurt', defaultStart: '07:00', defaultEnd: '10:00', defaultColor: 'rgba(3, 169, 244, 0.14)', defaultShow: false },
    { key: 'sydney', showId: 'showSydney', nameId: 'sydneyName', startId: 'sydneyStart', endId: 'sydneyEnd', colorId: 'sydneyColor',
        label: 'Sydney', defaultName: 'Sydney', defaultStart: '21:00', defaultEnd: '06:00', defaultColor: 'rgba(156, 39, 176, 0.14)', defaultShow: false }
];

function sessionsBoxInputParams() {
    const rows = [{ id: 'h_sessions', type: 'heading', label: 'Sessions', tab: 'input' }];
    SESSION_BOX_SESSION_DEFS.forEach(function (sess) {
        rows.push({
            type: 'sessionInput',
            sessionKey: sess.key,
            showId: sess.showId,
            nameId: sess.nameId,
            startId: sess.startId,
            endId: sess.endId,
            label: sess.label,
            defaultShow: sess.defaultShow,
            defaultName: sess.defaultName,
            defaultStart: sess.defaultStart,
            defaultEnd: sess.defaultEnd,
            tab: 'input'
        });
    });
    return rows;
}

function sessionsBoxStyleParams() {
    return [
        { id: 'showSessionLabels', label: 'Show session labels', type: 'checkbox', default: true, tab: 'style' },
        {
            id: 'maxTimeframeMinutes', label: 'Highest Timeframe to Display the Indicator On (Max Timeframe)',
            type: 'select', tab: 'style', default: '240', options: SESSION_BOX_MAX_TIMEFRAME_OPTIONS
        },
        { id: 'h_sessStyleDivider', type: 'divider', label: '', tab: 'style' },
        {
            id: 'sessionTimezone', label: 'Time zone', type: 'select', tab: 'style', default: 'Etc/UTC',
            options: SESSION_BOX_TIMEZONE_OPTIONS
        }
    ];
}

/** Shared overlay MA input (SMA / WMA): length, source, offset, smoothing. */
function smoothedOverlayMaInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' },
        { id: 'offset', label: 'Offset', type: 'number', default: 0, step: 1, tab: 'input' },
        { id: 'smoothingHeading', label: 'Smoothing', type: 'heading', tab: 'input' },
        {
            id: 'smoothingType', label: 'Type', type: 'select', tab: 'input', default: 'None',
            options: MA_SMOOTHING_TYPE_OPTIONS
        },
        { id: 'smoothingLength', label: 'Length', type: 'number', default: 14, min: 1, tab: 'input' },
        { id: 'bbStdDev', label: 'BB stdDev', type: 'number', default: 2, min: 0.001, step: 0.1, tab: 'input' }
    ];
}

/** Shared overlay MA style row (show line, color, thickness, style, label). */
function smoothedOverlayMaStyleParams(lineLabel, defaultColor) {
    return [
        { id: 'showLine', label: 'Show ' + lineLabel + ' line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'Line color', type: 'color', default: defaultColor, tab: 'style' },
        { id: 'lineStyle', label: 'Line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

function smaInputParams() {
    return smoothedOverlayMaInputParams();
}

function smaStyleParams() {
    return smoothedOverlayMaStyleParams('SMA', '#2962ff');
}

/** Weighted Moving Average (WMA) Input tab. */
function wmaInputParams() {
    return smoothedOverlayMaInputParams();
}

function wmaStyleParams() {
    return smoothedOverlayMaStyleParams('WMA', '#ff9800');
}

/** Double EMA (DEMA) Input tab. */
function demaInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' }
    ];
}

/** Double EMA (DEMA) Style tab. */
function demaStyleParams() {
    return [
        { id: 'showLine', label: 'Show DEMA line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'Line color', type: 'color', default: '#00bcd4', tab: 'style' },
        { id: 'lineStyle', label: 'Line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Triple EMA (TEMA) Input tab. */
function temaInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' }
    ];
}

/** Triple EMA (TEMA) Style tab. */
function temaStyleParams() {
    return [
        { id: 'showLine', label: 'Show TEMA line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'Line color', type: 'color', default: '#ab47bc', tab: 'style' },
        { id: 'lineStyle', label: 'Line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Hull Moving Average Input tab. */
function hmaInputParams() {
    return [
        { id: 'period', label: 'Length', type: 'number', default: 20, min: 1, tab: 'input' },
        { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close', tab: 'input' }
    ];
}

/** Hull Moving Average Style tab. */
function hmaStyleParams() {
    return [
        { id: 'showLine', label: 'Show HMA line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'Line color', type: 'color', default: '#26c6da', tab: 'style' },
        { id: 'lineStyle', label: 'Line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' },
        { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
    ];
}

/** Standard Deviation Style tab (overlay plot line). */
function stddevStyleParams() {
    return [
        { id: 'showLine', label: 'Show plot line', type: 'checkbox', default: true, tab: 'style' },
        { id: 'color', label: 'Line color', type: 'color', default: '#ab47bc', tab: 'style' },
        { id: 'lineStyle', label: 'Line style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
        { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4, tab: 'style' }
    ];
}

/** Resolve catalog / runtime indicator type to INDICATOR_DEFINITIONS key. */
function resolveIndicatorDefinitionKey(type) {
    const t = String(type || '').toLowerCase();
    const aliases = {
        momentum: 'mom',
        rateofchange: 'roc',
        ppo: 'macd',
        williams: 'willr',
        williamsr: 'willr',
        stochastic: 'stoch',
        bollinger: 'bb',
        bollingerbands: 'bb'
    };
    return aliases[t] || t;
}

function getV9OpenIndicatorSettingsFn() {
    if (typeof window.__v9OpenIndicatorSettings === 'function') return window.__v9OpenIndicatorSettings;
    try {
        if (window.parent && window.parent !== window && typeof window.parent.__v9OpenIndicatorSettings === 'function') {
            return window.parent.__v9OpenIndicatorSettings;
        }
    } catch (_) { /* cross-origin */ }
    try {
        if (window.top && typeof window.top.__v9OpenIndicatorSettings === 'function') return window.top.__v9OpenIndicatorSettings;
    } catch (_) { /* cross-origin */ }
    return null;
}

function __ictEverythingParamList() {
    const lineStyle = OVERLAY_LINE_STYLE_OPTIONS;
    const lineWidth = ['1px', '2px', '3px', '4px', '5px'].map(function (v) { return { value: v, label: v }; });
    const labelSize = ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'].map(function (v) { return { value: v, label: v }; });
    const terminus = [
        'Terminus @ Next Midnight', 'Terminus @ Current Time', 'Terminus @ Current Time +15min', 'Terminus @ Current Time +30min',
        'Terminus @ Current Time +45min', 'Terminus @ Current Time +1hr', 'Terminus @ Current Time +2hr', 'Terminus @ Current Time +3hr'
    ].map(function (v) { return { value: v, label: v }; });
    const tablePos = ['Top Left', 'Top Center', 'Top Right', 'Middle Left', 'Middle Right', 'Bottom Left', 'Bottom Center', 'Bottom Right']
        .map(function (v) { return { value: v, label: v }; });
    const biasOpt = ['Bullish', 'Bearish', 'Consolidating', 'Unclear'].map(function (v) { return { value: v, label: v }; });
    const devSd = ['1 SD', '2 SD', '3 SD', '4 SD'].map(function (v) { return { value: v, label: v }; });
    const devDir = ['Upside Only', 'Both', 'Downside Only'].map(function (v) { return { value: v, label: v }; });
    return [
        { id: 'h_global', type: 'heading', label: 'Global Settings' },
        { id: 'inputMaxInterval', label: 'Hide indicator above (bar minutes)', type: 'number', default: 31, min: 1, max: 1440 },
        { id: 'h_sessopt', type: 'heading', label: 'Session Options' },
        { id: 'ShowTSO', label: "Show today's session only", type: 'checkbox', default: true },
        { id: 'ShowTWO', label: "Show current week's sessions only", type: 'checkbox', default: true },
        { id: 'SL4W', label: 'Show last 4 week sessions', type: 'checkbox', default: true },
        { id: 'ShowSFill', label: 'Show session highlighting', type: 'checkbox', default: false },
        { id: 'h_hist', type: 'heading', label: 'Historical Lines' },
        { id: 'ShowMOPL', label: 'Midnight historical price lines', type: 'checkbox', default: false },
        { id: 'MOLHist', label: 'Midnight historical vertical lines', type: 'checkbox', default: true },
        { id: 'ShowPrev', label: 'Misc. historical price lines', type: 'checkbox', default: false },
        { id: 'h_sessions', type: 'heading', label: 'Sessions' },
        { id: 'ShowLondon', label: 'London', type: 'checkbox', default: true },
        { id: 'txt2', label: 'London label', type: 'text', default: 'LONDON' },
        { id: 'LDNseshStart', label: 'London start', type: 'time', default: '02:00' },
        { id: 'LDNseshEnd', label: 'London end', type: 'time', default: '05:00' },
        { id: 'LSFC', label: 'London fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'ShowNY', label: 'New York', type: 'checkbox', default: true },
        { id: 'txt3', label: 'NY label', type: 'text', default: 'NEW YORK' },
        { id: 'NYseshStart', label: 'NY start', type: 'time', default: '07:00' },
        { id: 'NYseshEnd', label: 'NY end', type: 'time', default: '10:00' },
        { id: 'NYSFC', label: 'NY fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'ShowLC', label: 'London close', type: 'checkbox', default: true },
        { id: 'txt4', label: 'LC label', type: 'text', default: 'LDN CLOSE' },
        { id: 'LCseshStart', label: 'LC start', type: 'time', default: '10:00' },
        { id: 'LCseshEnd', label: 'LC end', type: 'time', default: '12:00' },
        { id: 'LCSFC', label: 'LC fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'ShowPM', label: 'Afternoon', type: 'checkbox', default: true },
        { id: 'txt5', label: 'PM label', type: 'text', default: 'AFTERNOON' },
        { id: 'PMseshStart', label: 'PM start', type: 'time', default: '13:00' },
        { id: 'PMseshEnd', label: 'PM end', type: 'time', default: '16:00' },
        { id: 'PMSFC', label: 'PM fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'ShowAsian', label: 'Asia (custom)', type: 'checkbox', default: false },
        { id: 'txt6', label: 'Asia label', type: 'text', default: 'ASIA' },
        { id: 'ASIA2seshStart', label: 'Asia start', type: 'time', default: '20:00' },
        { id: 'ASIA2seshEnd', label: 'Asia end', type: 'time', default: '23:59' },
        { id: 'ASFC', label: 'Asia fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'ShowFreeSesh', label: 'Free session', type: 'checkbox', default: false },
        { id: 'txt9', label: 'Free label', type: 'text', default: 'FREE SESH' },
        { id: 'FreeSeshStart', label: 'Free start', type: 'time', default: '00:00' },
        { id: 'FreeSeshEnd', label: 'Free end', type: 'time', default: '00:00' },
        { id: 'FSFC', label: 'Free fill', type: 'color', default: 'rgba(120,123,134,0.1)' },
        { id: 'h_vert', type: 'heading', label: 'Vertical Lines' },
        { id: 'ShowMOP', label: 'Midnight (00:00)', type: 'checkbox', default: true },
        { id: 'txt12', label: 'Midnight vline label', type: 'text', default: 'MIDNIGHT' },
        { id: 'MOPColor', label: 'Midnight vline color', type: 'color', default: '#787b86' },
        { id: 'Midnight_Open_LS', label: 'Midnight vline style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'Midnight_Open_LW', label: 'Midnight vline width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowLOP', label: 'London 03:00', type: 'checkbox', default: false },
        { id: 'txt14', label: 'LOP label', type: 'text', default: 'LONDON' },
        { id: 'LOPColor', label: 'LOP color', type: 'color', default: 'rgba(0,128,128,0.6)' },
        { id: 'london_Open_LS', label: 'LOP style', type: 'select', options: lineStyle, default: 'Solid' },
        { id: 'London_Open_LW', label: 'LOP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowNYOP', label: 'NY 08:30', type: 'checkbox', default: true },
        { id: 'txt15', label: 'NYOP label', type: 'text', default: 'NEW YORK' },
        { id: 'NYOPColor', label: 'NYOP color', type: 'color', default: 'rgba(0,128,128,0.6)' },
        { id: 'NY_Open_LS', label: 'NYOP style', type: 'select', options: lineStyle, default: 'Solid' },
        { id: 'NY_Open_LW', label: 'NYOP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowEOP', label: 'Equities 09:30', type: 'checkbox', default: false },
        { id: 'txt16', label: 'EOP label', type: 'text', default: 'EQUITIES' },
        { id: 'EOPColor', label: 'EOP color', type: 'color', default: 'rgba(0,128,128,0.6)' },
        { id: 'Equities_Open_LS', label: 'EOP style', type: 'select', options: lineStyle, default: 'Solid' },
        { id: 'Equities_Open_LW', label: 'EOP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'h_openp', type: 'heading', label: 'Opening Price Lines' },
        { id: 'ShowMOPP', label: 'Midnight open price', type: 'checkbox', default: true },
        { id: 'txt13', label: 'MOPP label', type: 'text', default: 'MIDNIGHT' },
        { id: 'MOPColP', label: 'MOPP color', type: 'color', default: '#787b86' },
        { id: 'MOPLS', label: 'MOPP style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_MOPLW', label: 'MOPP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowNYOPP', label: 'NY 08:30 open', type: 'checkbox', default: false },
        { id: 'txt17', label: 'NYOPP label', type: 'text', default: 'NEW YORK' },
        { id: 'NYOPColP', label: 'NYOPP color', type: 'color', default: '#787b86' },
        { id: 'NYOPLS', label: 'NYOPP style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_NYOPLW', label: 'NYOPP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowEOPP', label: 'Equities 09:30 open', type: 'checkbox', default: false },
        { id: 'txt18', label: 'EOPP label', type: 'text', default: 'EQUITIES' },
        { id: 'EOPColP', label: 'EOPP color', type: 'color', default: '#787b86' },
        { id: 'EOPLS', label: 'EOPP style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_EOPLW', label: 'EOPP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowAFTPP', label: 'Afternoon 13:30 open', type: 'checkbox', default: false },
        { id: 'txt1330', label: 'AFTPP label', type: 'text', default: 'AFTERNOON' },
        { id: 'AFTOPColP', label: 'AFTPP color', type: 'color', default: '#787b86' },
        { id: 'AFTOPLS', label: 'AFTPP style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_AFTOPLW', label: 'AFTPP width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'h_htf', type: 'heading', label: 'HTF Opening Price Lines' },
        { id: 'ShowWeekOpen', label: 'Weekly open', type: 'checkbox', default: false },
        { id: 'txt19', label: 'Weekly label', type: 'text', default: 'WEEKLY' },
        { id: 'i_WeekOpenCol', label: 'Weekly color', type: 'color', default: '#787b86' },
        { id: 'WOLS', label: 'Weekly style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_WOPLW', label: 'Weekly width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'showMonthOpen', label: 'Monthly open', type: 'checkbox', default: false },
        { id: 'txt20', label: 'Monthly label', type: 'text', default: 'MONTHLY' },
        { id: 'i_MonthOpenCol', label: 'Monthly color', type: 'color', default: '#787b86' },
        { id: 'MOLS', label: 'Monthly style', type: 'select', options: lineStyle, default: 'Dotted' },
        { id: 'i_MONPLW', label: 'Monthly width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'h_cbdr', type: 'heading', label: 'CBDR, ASIA & FLOUT' },
        { id: 'ShowCBDR', label: 'CBDR range box', type: 'checkbox', default: true },
        { id: 'txt0', label: 'CBDR label', type: 'text', default: 'CBDR' },
        { id: 'CBDRBoxCol', label: 'CBDR box', type: 'color', default: '#787b86' },
        { id: 'box_text_cbdr', label: 'CBDR show text', type: 'checkbox', default: true },
        { id: 'box_text_cbdr_col', label: 'CBDR text', type: 'color', default: 'rgba(128,128,128,0.2)' },
        { id: 'bool_cbdr_dev', label: 'CBDR SD lines', type: 'checkbox', default: true },
        { id: 'ShowASIA', label: 'Asia range box (20:00–00:00)', type: 'checkbox', default: true },
        { id: 'txt1', label: 'Asia box label', type: 'text', default: 'ASIA' },
        { id: 'ASIABoxCol', label: 'Asia box', type: 'color', default: '#787b86' },
        { id: 'box_text_asia', label: 'Asia show text', type: 'checkbox', default: true },
        { id: 'box_text_asia_col', label: 'Asia text', type: 'color', default: 'rgba(128,128,128,0.2)' },
        { id: 'bool_asia_dev', label: 'Asia SD lines', type: 'checkbox', default: true },
        { id: 'ShowFLOUT', label: 'FLOUT range box', type: 'checkbox', default: false },
        { id: 'txt7', label: 'FLOUT label', type: 'text', default: 'FLOUT' },
        { id: 'FLOUTBoxCol', label: 'FLOUT box', type: 'color', default: '#787b86' },
        { id: 'box_text_flout', label: 'FLOUT show text', type: 'checkbox', default: true },
        { id: 'box_text_flout_col', label: 'FLOUT text', type: 'color', default: 'rgba(128,128,128,0.2)' },
        { id: 'bool_flout_dev', label: 'FLOUT SD lines', type: 'checkbox', default: true },
        { id: 'h_sd', type: 'heading', label: 'Standard Deviation' },
        { id: 'ShowDevLN', label: 'Deviation guide lines (global style)', type: 'checkbox', default: true },
        { id: 'DEVLNTXT', label: 'SD lines label', type: 'text', default: 'SD LINES' },
        { id: 'DevLNCol', label: 'SD line color', type: 'color', default: '#787b86' },
        { id: 'DEVLS', label: 'SD line style', type: 'select', options: lineStyle, default: 'Solid' },
        { id: 'i_DEVLW', label: 'SD line width', type: 'select', options: lineWidth, default: '1px' },
        { id: 'ShowDev', label: 'Draw SD multiples on boxes', type: 'checkbox', default: false },
        { id: 'txt8', label: 'SD count label', type: 'text', default: 'SD COUNT' },
        { id: 'SDCountCol', label: 'SD count color', type: 'color', default: '#787b86' },
        { id: 'DevInput', label: 'SD levels', type: 'select', options: devSd, default: '2 SD' },
        { id: 'DevDirection', label: 'SD direction', type: 'select', options: devDir, default: 'Both' },
        { id: 'Auto_Select', label: 'Auto SD selection (forex)', type: 'checkbox', default: false },
        { id: 'txtSD', label: 'Auto SD label', type: 'text', default: 'AUTO SD' },
        { id: 'Tab1txtCol', label: 'Table text', type: 'color', default: '#808080' },
        { id: 'TabOptionShow', label: 'Range table', type: 'select', options: [{ value: 'Show Table', label: 'Show Table' }, { value: 'Hide Table', label: 'Hide Table' }], default: 'Show Table' },
        { id: 'TabOption1', label: 'Table position', type: 'select', options: tablePos, default: 'Top Right' },
        { id: 'h_dow', type: 'heading', label: 'Day Of Week & Labels' },
        { id: 'ShowLabel', label: 'Show labels (open lines)', type: 'checkbox', default: true },
        { id: 'txt21', label: 'Label title', type: 'text', default: 'LABEL' },
        { id: 'LabelColor', label: 'Label bg', type: 'color', default: 'rgba(0,0,0,0.6)' },
        { id: 'LabelSizeInput', label: 'Label size', type: 'select', options: labelSize, default: 'Normal' },
        { id: 'Terminusinp', label: 'Line terminus', type: 'select', options: terminus, default: 'Terminus @ Current Time +1hr' },
        { id: 'ShowLabelText', label: 'Show label text body', type: 'checkbox', default: true },
        { id: 'txt22', label: 'Label text prefix', type: 'text', default: 'LABEL TEXT' },
        { id: 'LabelTextColor', label: 'Label text color', type: 'color', default: '#787b86' },
        { id: 'LabelTextOptioninput', label: 'Label mode', type: 'select', options: [{ value: 'Time', label: 'Time' }, { value: 'Text', label: 'Text' }], default: 'Time' },
        { id: 'ShowPricesBool', label: 'Prices on labels', type: 'select', options: [{ value: 'Show Prices', label: 'Show Prices' }, { value: 'Hide Prices', label: 'Hide Prices' }], default: 'Hide Prices' },
        { id: 'showDOW', label: 'Day-of-week marker', type: 'checkbox', default: true },
        { id: 'txt24', label: 'DOW label', type: 'text', default: 'DAY OF WEEK' },
        { id: 'i_DOWCol', label: 'DOW color', type: 'color', default: '#787b86' },
        { id: 'DOWTime', label: 'DOW hour', type: 'number', default: 12, min: 0, max: 23 },
        { id: 'DOWLoc_inpt', label: 'DOW position', type: 'select', options: [{ value: 'Top', label: 'Top' }, { value: 'Bottom', label: 'Bottom' }], default: 'Bottom' },
        { id: 'h_biaspre', type: 'heading', label: 'BIAS & NOTES PRECONFIG' },
        { id: 'BIAS_M_Bool', label: 'Show bias table (UI only)', type: 'checkbox', default: false },
        { id: 'txt100', label: 'Bias table title', type: 'text', default: 'BIAS' },
        { id: 'Tab2txtCol', label: 'Bias text color', type: 'color', default: '#787b86' },
        { id: 'TabOption2', label: 'Bias table position', type: 'select', options: tablePos, default: 'Bottom Right' },
        { id: 'NOTES_M_Bool', label: 'Show notes table (UI only)', type: 'checkbox', default: true },
        { id: 'txt101', label: 'Notes table title', type: 'text', default: 'NOTES' },
        { id: 'Tab3txtCol', label: 'Notes text color', type: 'color', default: '#787b86' },
        { id: 'TabOption3', label: 'Notes table position', type: 'select', options: tablePos, default: 'Top Center' },
        { id: 'h_bias', type: 'heading', label: 'BIAS & NOTES' },
        { id: 'BIASbool1', label: 'Row 1', type: 'checkbox', default: true },
        { id: 'txt52', label: 'Row 1 name', type: 'text', default: 'DXY ' },
        { id: 'BIASOption1', label: 'Row 1 bias', type: 'select', options: biasOpt, default: 'Bullish' },
        { id: 'BIASbool2', label: 'Row 2', type: 'checkbox', default: true },
        { id: 'txt53', label: 'Row 2 name', type: 'text', default: 'EURGBP ' },
        { id: 'BIASOption2', label: 'Row 2 bias', type: 'select', options: biasOpt, default: 'Bearish' },
        { id: 'BIASbool3', label: 'Row 3', type: 'checkbox', default: true },
        { id: 'txt54', label: 'Row 3 name', type: 'text', default: 'AUDNZD ' },
        { id: 'BIASOption3', label: 'Row 3 bias', type: 'select', options: biasOpt, default: 'Bullish' },
        { id: 'BIASbool4', label: 'Row 4', type: 'checkbox', default: true },
        { id: 'txt55', label: 'Row 4 name', type: 'text', default: 'NASDAQ ' },
        { id: 'BIASOption4', label: 'Row 4 bias', type: 'select', options: biasOpt, default: 'Bearish' },
        { id: 'notes', label: 'Notes', type: 'textarea', default: '' }
    ];
}

// 1. Indicator Definitions
const INDICATOR_DEFINITIONS = {
    sma: {
        name: 'Simple Moving Average',
        type: 'overlay',
        params: smaInputParams().concat(smaStyleParams())
    },
    ema: {
        name: 'Exponential Moving Average',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
            { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line' },
            { id: 'color', label: 'Line Color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 },
            { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
        ]
    },
    bb: {
        name: 'Bollinger Bands',
        type: 'overlay',
        params: bbInputParams().concat(bollingerBandsStyleParams())
    },
    envelope: {
        name: 'SMA Envelope',
        type: 'overlay',
        params: [
            { id: 'period', label: 'SMA length', type: 'number', default: 20, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
            { id: 'percent', label: 'Band %', type: 'number', default: 2.5, min: 0.1, step: 0.1 },
            { id: 'lineStyle', label: 'Line Style', type: 'select', options: OVERLAY_LINE_STYLE_OPTIONS, default: 'Line', tab: 'style' },
            { id: 'upperColor', label: 'Upper band', type: 'color', default: '#2962ff', tab: 'style' },
            { id: 'middleColor', label: 'Middle (SMA)', type: 'color', default: '#787b86', tab: 'style' },
            { id: 'lowerColor', label: 'Lower band', type: 'color', default: '#2962ff', tab: 'style' },
            { id: 'fillColor', label: 'Background', type: 'color', default: 'rgba(41,98,255,0.08)', tab: 'style' },
            { id: 'showFill', label: 'Show fill', type: 'checkbox', default: true, tab: 'style' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 1, min: 1, max: 4, tab: 'style' },
            { id: 'showLabel', label: 'Show Label (Price & Time)', type: 'checkbox', default: true, tab: 'style' }
        ]
    },
    rsi: {
        name: 'Relative Strength Index',
        type: 'separate',
        params: rsiInputParams().concat(rsiStyleParams())
    },
    macd: {
        name: 'Moving Average Convergence Divergence',
        type: 'separate',
        params: [
            { id: 'fast', label: 'Fast Length', type: 'number', default: 12, min: 1 },
            { id: 'slow', label: 'Slow Length', type: 'number', default: 26, min: 1 },
            { id: 'signal', label: 'Signal Smoothing', type: 'number', default: 9, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' }
        ].concat(macdInputMaParams()).concat(macdStyleParams())
    },
    wma: {
        name: 'Weighted Moving Average',
        type: 'overlay',
        params: wmaInputParams().concat(wmaStyleParams())
    },
    vwap: {
        name: 'Volume Weighted Average Price',
        type: 'overlay',
        params: overlayLineStyleParams('#00bcd4')
    },
    stoch: {
        name: 'Stochastic Oscillator',
        type: 'separate',
        params: [
            { id: 'period', label: 'K-Period', type: 'number', default: 14, min: 1 },
            { id: 'smoothK', label: 'K-Smoothing', type: 'number', default: 3, min: 1 },
            { id: 'smoothD', label: 'D-Smoothing', type: 'number', default: 3, min: 1 }
        ].concat(stochasticInputLevelParams()).concat(stochasticStyleParams())
    },
    atr: {
        name: 'Average True Range',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#ff6d00' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    cci: {
        name: 'Commodity Channel Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 }
        ].concat(cciInputLevelParams()).concat(cciStyleParams())
    },
    adx: {
        name: 'Average Directional Index',
        type: 'separate',
        params: adxInputParams().concat(adxStyleParams())
    },
    adr: {
        name: 'Average Daily Range',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length (Days)', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#26a69a' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    volume: {
        name: 'Volume',
        type: 'separate',
        params: [
            { id: 'volBarsHeading', label: 'BARS', type: 'heading', tab: 'style' },
            { id: 'upColor', label: 'Up Color', type: 'color', default: 'rgba(8, 153, 129, 0.5)', tab: 'style' },
            { id: 'downColor', label: 'Down Color', type: 'color', default: 'rgba(242, 54, 69, 0.5)', tab: 'style' },
            { id: 'maColor', label: 'MA Color', type: 'color', default: '#2962ff', tab: 'style' },
            { id: 'volMaHeading', label: 'MOVING AVERAGE', type: 'heading', tab: 'input' },
            { id: 'showMA', label: 'Show MA', type: 'checkbox', default: false, tab: 'input' },
            { id: 'maPeriod', label: 'MA Length', type: 'number', default: 20, min: 1, max: 500, tab: 'input' }
        ]
    },
    sessions: {
        name: 'Session Boxes',
        type: 'overlay',
        params: sessionsBoxInputParams().concat(
            SESSION_BOX_SESSION_DEFS.map(function (sess) {
                return {
                    id: sess.colorId,
                    label: sess.label + ' background',
                    type: 'color',
                    default: sess.defaultColor,
                    tab: 'style'
                };
            })
        ).concat(sessionsBoxStyleParams())
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
        params: demaInputParams().concat(demaStyleParams())
    },
    tema: {
        name: 'Triple EMA (TEMA)',
        type: 'overlay',
        params: temaInputParams().concat(temaStyleParams())
    },
    hma: {
        name: 'Hull Moving Average',
        type: 'overlay',
        params: hmaInputParams().concat(hmaStyleParams())
    },
    roc: {
        name: 'Rate of Change',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 12, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
            { id: 'zeroValue', label: 'Zero line', type: 'number', default: 0, step: 0.0001, tab: 'input' }
        ].concat(rocStyleParams())
    },
    mom: {
        name: 'Momentum',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 10, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
            { id: 'zeroValue', label: 'Zero line', type: 'number', default: 0, step: 0.0001, tab: 'input' }
        ].concat(momStyleParams())
    },
    obv: {
        name: 'On Balance Volume',
        type: 'separate',
        params: [
            { id: 'color', label: 'Line Color', type: 'color', default: '#78909c' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    willr: {
        name: 'Williams %R',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' }
        ].concat(willrInputLevelParams()).concat(willrStyleParams())
    },
    mfi: {
        name: 'Money Flow Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 2 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#5c6bc0' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    donchian: {
        name: 'Donchian Channels',
        type: 'overlay',
        params: donchianInputParams().concat(donchianStyleParams())
    },
    keltner: {
        name: 'Keltner Channels',
        type: 'overlay',
        params: keltnerInputParams().concat(channelBandsStyleParams())
    },
    aroon: {
        name: 'Aroon',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1, tab: 'input' }
        ].concat(aroonStyleParams())
    },
    cmf: {
        name: 'Chaikin Money Flow',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#29b6f6' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    trix: {
        name: 'TRIX',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'color', label: 'Line Color', type: 'color', default: '#8d6e63' },
            { id: 'lineWidth', label: 'Line Thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    psar: {
        name: 'Parabolic SAR',
        type: 'overlay',
        params: psarInputParams().concat(psarStyleParams())
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
        name: 'Opening Range',
        type: 'overlay',
        params: openingRangeInputParams().concat(openingRangeStyleParams())
    },
    supertrend: {
        name: 'Supertrend',
        type: 'overlay',
        params: supertrendInputParams().concat(supertrendStyleParams())
    },
    stddev: {
        name: 'Standard Deviation',
        type: 'overlay',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 2 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' }
        ].concat(stddevStyleParams())
    },
    ao: {
        name: 'Awesome Oscillator',
        type: 'separate',
        params: [
            { id: 'color', label: 'Bar / line color', type: 'color', default: '#26a69a' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    uo: {
        name: 'Ultimate Oscillator',
        type: 'separate',
        params: [
            { id: 'period1', label: 'Period 1', type: 'number', default: 7, min: 1 },
            { id: 'period2', label: 'Period 2', type: 'number', default: 14, min: 1 },
            { id: 'period3', label: 'Period 3', type: 'number', default: 28, min: 1 },
            { id: 'color', label: 'Line color', type: 'color', default: '#7e57c2' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    vortex: {
        name: 'Vortex Indicator',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 14, min: 1 },
            { id: 'plusColor', label: '+VI color', type: 'color', default: '#00e676' },
            { id: 'minusColor', label: '-VI color', type: 'color', default: '#f23645' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    dpo: {
        name: 'Detrended Price Oscillator',
        type: 'separate',
        params: [
            { id: 'period', label: 'Length', type: 'number', default: 20, min: 2 },
            { id: 'source', label: 'Source (OHLC Source)', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' }
        ].concat(dpoStyleParams())
    },
    stochrsi: {
        name: 'Stochastic RSI',
        type: 'separate',
        params: [
            { id: 'rsiPeriod', label: 'RSI length', type: 'number', default: 14, min: 2 },
            { id: 'source', label: 'RSI Source', type: 'select', options: OHLC_SOURCE_OPTIONS, default: 'close' },
            { id: 'stochLen', label: 'Stoch lookback', type: 'number', default: 14, min: 2 },
            { id: 'smoothK', label: '%K smoothing', type: 'number', default: 3, min: 1 },
            { id: 'smoothD', label: '%D smoothing', type: 'number', default: 3, min: 1 }
        ].concat(stochasticInputLevelParams()).concat(stochasticStyleParams())
    },
    massindex: {
        name: 'Mass Index',
        type: 'separate',
        params: [
            { id: 'emaPeriod', label: 'EMA length', type: 'number', default: 9, min: 2 },
            { id: 'sumPeriod', label: 'Sum length', type: 'number', default: 25, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#00bcd4' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    coppock: {
        name: 'Coppock Curve',
        type: 'separate',
        params: [
            { id: 'wmaPeriod', label: 'WMA length', type: 'number', default: 10, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#8e24aa' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    rvi: {
        name: 'Relative Vigor Index',
        type: 'separate',
        params: [
            { id: 'period', label: 'Smoothing length', type: 'number', default: 10, min: 2 },
            { id: 'color', label: 'Line color', type: 'color', default: '#ffa726' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
    },
    elderray: {
        name: 'Elder Ray (Bull / Bear power)',
        type: 'separate',
        params: [
            { id: 'period', label: 'EMA length', type: 'number', default: 13, min: 2 },
            { id: 'bullColor', label: 'Bull power', type: 'color', default: '#26a69a' },
            { id: 'bearColor', label: 'Bear power', type: 'color', default: '#ef5350' },
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
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
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
        ].concat(separateLineStyleExtras())
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
            { id: 'lineWidth', label: 'Line thickness', type: 'number', default: 2, min: 1, max: 4 }
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
    icteverything: {
        name: 'ICT Everything',
        type: 'overlay',
        params: __ictEverythingParamList()
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
const TALARIA_IND_CHIP_BORDER = 'transparent';
const TALARIA_IND_CHIP_BG = 'transparent';
const TALARIA_INDICATOR_CHIP_CSS =
    'display:flex;align-items:center;gap:6px;width:fit-content;max-width:100%;align-self:flex-start;min-width:0;min-height:20px;box-sizing:border-box;pointer-events:auto;' +
    'padding:1px 2px 1px 0;margin:0;border-radius:2px;line-height:1.2;' +
    'border:none;background:' + TALARIA_IND_CHIP_BG + ';' +
    'transform:translateZ(0);-webkit-transform:translateZ(0);' +
    'cursor:default;vertical-align:middle;' +
    'font-family:-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif;';
const TALARIA_INDICATOR_CHIP_BG = TALARIA_IND_CHIP_BG;
const TALARIA_INDICATOR_CHIP_BG_HOVER = 'rgba(255, 255, 255, 0.06)';
const TALARIA_INDICATOR_CHIP_BORDER_HOVER = 'transparent';
const TALARIA_INDICATOR_COLOR_STRIP = (color) =>
    'display:inline-block;width:2px;height:12px;border-radius:1px;background:' + color + ';flex-shrink:0;';

/** Sidebar-style framed swatch (same chrome as V9 tool rail: border + rounded tile + inner color bar). */
function ensureTalariaIndSwatchCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('talaria-ind-swatch-css')) return;
    const s = document.createElement('style');
    s.id = 'talaria-ind-swatch-css';
    s.textContent = `
.talaria-ind-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  box-sizing: border-box;
  flex-shrink: 0;
  border: 1px solid rgba(140, 160, 255, 0.22);
  border-radius: 4px;
  background: rgba(18, 22, 34, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.talaria-ind-legend-row:hover .talaria-ind-swatch {
  border-color: rgba(140, 160, 255, 0.38);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 0 0 1px rgba(74, 106, 255, 0.12);
}
.talaria-ind-swatch-fill {
  display: block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
  position: relative;
  /* Glow + gradient applied inline per indicator color (matches V9 sidebar rail strip) */
}
body.light-mode .talaria-ind-swatch {
  background: rgba(248, 249, 252, 0.96);
  border-color: rgba(100, 110, 140, 0.28);
}
body.light-mode .talaria-ind-legend-row:hover .talaria-ind-swatch {
  border-color: rgba(74, 106, 255, 0.42);
}
`;
    document.head.appendChild(s);
}

/** Same visual recipe as TalariaV8bLive renderTB active rail: gradient strip + soft glow (accentGlow-style). */
function applyIndicatorSwatchRailGlow(fillEl, displayColor) {
    const c = displayColor || '#2962ff';
    fillEl.style.background = 'linear-gradient(180deg, transparent, ' + c + ', transparent)';
    fillEl.style.boxShadow = '0 0 4px ' + c;
    fillEl.style.filter = 'drop-shadow(0 0 5px ' + c + ')';
}

function createIndicatorLegendSwatch(displayColor) {
    ensureTalariaIndSwatchCss();
    const wrap = document.createElement('span');
    wrap.className = 'talaria-ind-swatch';
    const fill = document.createElement('span');
    fill.className = 'talaria-ind-swatch-fill';
    applyIndicatorSwatchRailGlow(fill, displayColor);
    wrap.appendChild(fill);
    return wrap;
}

function setTalariaIndChipNameEl(el, visible) {
    el.className = 'talaria-ind-chip-name' + (visible ? '' : ' talaria-ind-chip-name--hidden');
}
const TALARIA_IND_ACTION_BTN =
    'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:2px;cursor:default;transition:background .12s,color .12s,box-shadow .12s;flex-shrink:0;background:transparent;';

const TALARIA_IND_SETTINGS_GEAR_SVG =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.23.6.62.6 1s.24.77.6 1a1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1 .33c-.36.23-.6.62-.6 1z"/></svg>';

if (typeof window !== 'undefined') {
    window.TALARIA_INDICATOR_CHIP_CSS = TALARIA_INDICATOR_CHIP_CSS;
    window.TALARIA_INDICATOR_CHIP_BG = TALARIA_INDICATOR_CHIP_BG;
    window.TALARIA_INDICATOR_CHIP_BG_HOVER = TALARIA_INDICATOR_CHIP_BG_HOVER;
    window.TALARIA_INDICATOR_CHIP_BORDER_HOVER = TALARIA_INDICATOR_CHIP_BORDER_HOVER;
    window.TALARIA_IND_CHIP_BORDER = TALARIA_IND_CHIP_BORDER;
    window.TALARIA_INDICATOR_COLOR_STRIP = TALARIA_INDICATOR_COLOR_STRIP;
    window.createIndicatorLegendSwatch = createIndicatorLegendSwatch;
    window.applyIndicatorSwatchRailGlow = applyIndicatorSwatchRailGlow;
}

/** TradingView-style: hide eye/settings/remove on legend rows until hover (fine pointer only). */
function ensureTalariaIndLegendHoverCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('talaria-ind-legend-hover-css')) return;
    const s = document.createElement('style');
    s.id = 'talaria-ind-legend-hover-css';
    s.textContent = `
@media (hover: hover) and (pointer: fine) {
  .talaria-ind-legend-row .talaria-ind-actions {
    opacity: 0;
    transition: opacity 0.12s ease;
    pointer-events: none;
  }
  .talaria-ind-legend-row:hover .talaria-ind-actions {
    opacity: 1;
    pointer-events: auto;
  }
}`;
    document.head.appendChild(s);
}

/** Same value tokens as chart-indicators-full.js updateOHLCIndicators (panel MACD bar). */
function talariaFormatOverlayIndicatorValueTokens(chart, indicator) {
    const valuesStore = chart.indicators && chart.indicators.data ? chart.indicators.data[indicator.id] : null;
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
}

function talariaFormatVolumeIndicatorValueTokens(chart, indicator) {
    if (!chart || !chart.data || !chart.data.length) return [];
    let idx = chart.data.length - 1;
    if (Number.isFinite(chart.hoverIndex) && chart.hoverIndex >= 0 && chart.hoverIndex < chart.data.length) {
        idx = chart.hoverIndex;
    }
    const bar = chart.data[idx];
    const v = bar && Number(bar.v);
    if (!Number.isFinite(v)) return [];
    const up = Number(bar.c) >= Number(bar.o);
    const color = up
        ? (indicator.style && indicator.style.upColor) || 'rgba(8, 153, 129, 0.85)'
        : (indicator.style && indicator.style.downColor) || 'rgba(242, 54, 69, 0.85)';
    let text;
    if (v >= 1e9) text = (v / 1e9).toFixed(2) + 'B';
    else if (v >= 1e6) text = (v / 1e6).toFixed(2) + 'M';
    else if (v >= 1e3) text = (v / 1e3).toFixed(1) + 'K';
    else text = String(Math.round(v));
    return [{ text: text, color: color }];
}

function talariaVolumeLegendLabel(indicator) {
    if (indicator.params && indicator.params.showMA) {
        return 'Volume MA(' + (indicator.params.maPeriod || 20) + ')';
    }
    return indicator.name || 'Volume';
}

function talariaAppendIndicatorLegendRow(chart, div, indicator) {
    const isVolume = indicator.type === 'volume' || indicator.isVolume;
    const item = document.createElement('div');
    item.className = 'talaria-ind-legend-row';
    item.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:4px;width:fit-content;max-width:100%;align-self:flex-start;background:transparent;border:none;border-radius:0;padding:0;font-family:Roboto,sans-serif;';

    const nameSpan = document.createElement('span');
    const legendName = isVolume ? talariaVolumeLegendLabel(indicator) : indicator.name;
    nameSpan.textContent = '- ' + legendName;
    nameSpan.style.cssText = 'color:#d1d4dc;font-size:11px;font-weight:500;user-select:none;opacity:' + (indicator.visible !== false ? '1' : '0.55') + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;max-width:40%;';
    nameSpan.title = legendName;
    item.appendChild(nameSpan);

    const valuesSpan = document.createElement('span');
    valuesSpan.style.cssText = 'font-size:10px;font-weight:500;font-variant-numeric:tabular-nums;text-align:left;min-width:auto;flex:0 0 auto;display:inline-flex;gap:3px;align-items:center;opacity:1;';
    const valueTokens = isVolume
        ? talariaFormatVolumeIndicatorValueTokens(chart, indicator)
        : talariaFormatOverlayIndicatorValueTokens(chart, indicator);
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

    const self = chart;
    const id = indicator.id;
    const type = indicator.type;

    const visibilityBtn = document.createElement('span');
    visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    const applyEyeState = function() {
        const on = indicator.visible !== false;
        visibilityBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:' + (on ? '#d1d4dc' : '#787b86') + ';background:transparent;opacity:1;';
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
        if (isVolume) {
            self.chartSettings.showVolume = indicator.visible !== false;
        }
        visibilityBtn.innerHTML = indicator.visible ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        applyEyeState();
        nameSpan.style.opacity = indicator.visible ? '1' : '0.55';
        visibilityBtn.title = indicator.visible ? 'Click to hide' : 'Click to show';
        if (!isVolume) {
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
        }
        if (typeof self.render === 'function') self.render();
    };
    actions.appendChild(visibilityBtn);

    const settingsBtn = document.createElement('span');
    settingsBtn.innerHTML = TALARIA_IND_SETTINGS_GEAR_SVG;
    settingsBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#787b86;background:transparent;border:none;box-shadow:none;';
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
        talariaOpenIndicatorSettingsFromLegend(self, id, type, indicator);
    };
    actions.appendChild(settingsBtn);

    const openIndSettings = function(e) {
        e.stopPropagation();
        talariaOpenIndicatorSettingsFromLegend(self, id, type, indicator);
    };
    nameSpan.style.cursor = 'default';
    nameSpan.onclick = openIndSettings;
    valuesSpan.style.cursor = 'default';
    valuesSpan.onclick = openIndSettings;

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '×';
    removeBtn.style.cssText = TALARIA_IND_ACTION_BTN + 'color:#f23645;font-size:14px;font-weight:600;line-height:1;background:transparent;';
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

function talariaRebuildOhlcIndicatorLegend(chart, div) {
    if (!div || !chart) return;

    div.innerHTML = '';

    if (!chart.indicators || !chart.indicators.active || chart.indicators.active.length === 0) {
        if (chart.chartSettings && chart.chartSettings.showIndicatorTitles === false) {
            div.style.display = 'none';
        } else {
            div.style.display = '';
        }
        return;
    }

    chart.indicators.active.forEach(function(indicator) {
        const isVolume = indicator.type === 'volume' || indicator.isVolume;
        const isOverlay = indicator.overlay !== false && !isVolume;
        if (isVolume || isOverlay) {
            talariaAppendIndicatorLegendRow(chart, div, indicator);
        }
    });
    if (chart.chartSettings && chart.chartSettings.showIndicatorTitles === false) {
        div.style.display = 'none';
    } else {
        div.style.display = '';
    }
}

function talariaOpenIndicatorSettingsFromLegend(chart, indicatorId, indicatorType, indicator) {
    if (typeof chart.showIndicatorSettings === 'function') {
        chart.showIndicatorSettings(indicatorId);
    } else if (typeof createIndicatorSettingsPanel === 'function') {
        createIndicatorSettingsPanel(chart, indicatorType, indicator);
    }
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
            cursor:default;
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
            cursor:default;
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
            cursor:default;
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
            cursor:default;
        }
        .indicator-color-palette .indicator-color-opacity-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #3a3e49;
            cursor:default;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .indicator-color-palette .indicator-color-opacity-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #3a3e49;
            cursor:default;
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
                'rsi', 'macd', 'stoch', 'stochrsi', 'atr', 'cci', 'adx', 'willr', 'mfi', 'aroon', 'cmf', 'trix', 'ao', 'uo', 'vortex', 'dpo',
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
            indicators: ['ictpd', 'ictsesspd', 'ictasian', 'ictote', 'ictfvg', 'ictliquidity', 'icteverything']
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
        background: none; border: none; cursor:default;
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
            padding: 8px 12px 8px 9px; cursor:default;
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
            padding: 10px 16px; cursor:default;
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
            cursor:default; transition: color 0.15s; flex-shrink: 0;
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
                const pid = param.id.toLowerCase();
                if (pid.includes('color') || pid.includes('width') || pid.includes('fill')
                    || pid.includes('linestyle') || pid === 'showlabel') {
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

/** Same tab buckets as drawing tool settings: Style / Input / Visibility */
function indicatorSettingsTabForParam(param) {
    if (param.type === 'sessionInput' || param.type === 'timeRange') return param.tab || 'input';
    if (param.tab === 'style' || param.tab === 'input' || param.tab === 'visibility') return param.tab;
    const id = String(param.id || '').toLowerCase();
    const label = String(param.label || '').toLowerCase();
    if (param.type === 'heading' || param.type === 'divider') return 'input';
    if (param.type === 'checkbox') return 'visibility';
    if (param.type === 'color') return 'style';
    if (/color|fill|linewidth|linethickness|linestyle|thickness|transparency|opacity/.test(id)) return 'style';
    if (param.type === 'text' && (id.includes('fill') || label.includes('fill') || label.includes('rgba'))) return 'style';
    return 'input';
}

/**
 * Build merged payload for Chart.prototype.updateIndicator from a flat draft object (React V9 panel).
 * Mirrors createIndicatorSettingsPanel saveBtn classification.
 */
function mergeIndicatorDraftForUpdate(indicatorType, existingIndicator, draft) {
    const def = INDICATOR_DEFINITIONS[indicatorType];
    if (!def || !existingIndicator || !draft) return null;
    const initialParams = existingIndicator.params || {};
    const initialStyle = existingIndicator.style || {};
    const baseExisting = Object.assign({}, initialParams, initialStyle);
    const newParams = {};
    const newStyle = {};
    def.params.forEach(function(param) {
        if (param.type === 'heading' || param.type === 'divider') return;
        var raw = draft[param.id];
        if (raw === undefined) {
            raw = baseExisting[param.id] !== undefined ? baseExisting[param.id] : param.default;
        }
        var value = raw;
        if (param.type === 'checkbox') {
            value = !!raw;
        } else if (param.type === 'number') {
            value = sanitizeIndicatorParamValue(param, raw);
        }
        var pid = String(param.id).toLowerCase();
        var toStyle = param.tab === 'style'
            || pid.indexOf('color') >= 0
            || pid.indexOf('width') >= 0
            || pid.indexOf('fill') >= 0
            || pid.indexOf('linestyle') >= 0
            || pid.indexOf('opacity') >= 0
            || pid === 'showlabel'
            || /^show(middle|upper|lower|fill)$/.test(pid);
        if (toStyle) {
            newStyle[param.id] = value;
        } else {
            newParams[param.id] = value;
        }
    });
    const merged = Object.assign({}, baseExisting, newParams, newStyle);
    clampIndicatorStyleLineWidths(merged);
    return merged;
}

function createIndicatorSettingsPanel(chartInstance, indicatorType, existingIndicator = null) {
    indicatorType = resolveIndicatorDefinitionKey(indicatorType);
    const v9Open = getV9OpenIndicatorSettingsFn();
    if (existingIndicator && v9Open) {
        try {
            if (v9Open(chartInstance, indicatorType, existingIndicator) === true) {
                return;
            }
        } catch (err) {
            console.warn('[indicator-ui] __v9OpenIndicatorSettings', err);
        }
    }

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
        background: rgba(0, 0, 0, 0.55);
        z-index: 9999;
        backdrop-filter: blur(4px);
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
        border-radius: 0;
        box-shadow: 0 24px 64px rgba(0,0,0,0.85), 0 0 24px rgba(38,67,247,0.2);
        z-index: 10000;
        min-width: ${isCustomPanel ? '480px' : '400px'};
        max-width: ${isCustomPanel ? '640px' : '480px'};
        width: ${isCustomPanel ? 'min(92vw, 600px)' : 'auto'};
        max-height: 82vh;
        display: flex;
        flex-direction: column;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        overflow: hidden;
    `;

    const topAccent = document.createElement('div');
    topAccent.style.cssText = 'height:2px;flex-shrink:0;background:linear-gradient(90deg,var(--sp-accent,#2962ff),#6a8aff,var(--sp-accent,#2962ff));';
    panel.appendChild(topAccent);

    const titleBar = document.createElement('div');
    titleBar.style.cssText = 'display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--sp-ui-border, rgba(42,46,57,0.55));background:var(--sp-ui-chrome-bg, #131722);flex-shrink:0;user-select:none;';

    const title = document.createElement('div');
    title.className = 'settings-section-title';
    title.textContent = `${def.name} Settings`;
    title.style.cssText = 'flex:1;margin:0;font-size:14px;font-weight:700;color:var(--sp-text,#d1d4dc);';
    titleBar.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.style.cssText = 'width:26px;height:26px;border:none;background:transparent;color:var(--sp-text-muted,#8d93a1);font-size:13px;cursor:default;display:flex;align-items:center;justify-content:center;transition:color .12s, background .12s;';
    closeBtn.onmouseenter = () => { closeBtn.style.color = 'var(--sp-text,#d1d4dc)'; closeBtn.style.background = 'rgba(255,255,255,0.06)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.color = 'var(--sp-text-muted,#8d93a1)'; closeBtn.style.background = 'transparent'; };
    titleBar.appendChild(closeBtn);
    panel.appendChild(titleBar);

    if (indicatorType === 'custom') {
        const hint = document.createElement('p');
        hint.textContent =
            'This runs sandboxed JavaScript only. TradingView Pine Script is not supported. ' +
            'Use the default template: function compute(bars, params) { return { overlay, plots }; } ' +
            'where plots are line or histogram series. For built-in EMA/RSI/MACD, use the Technicals list instead.';
        hint.style.cssText =
            'font-size:12px;line-height:1.45;color:var(--sp-text-muted,#787b86);' +
            'margin:12px 14px 0 14px;padding:10px 12px;border-radius:6px;' +
            'background:rgba(255,193,7,0.07);border:1px solid rgba(255,193,7,0.28);';
        panel.appendChild(hint);
    }

    const initialParams = existingIndicator ? existingIndicator.params : {};
    const initialStyle = existingIndicator ? existingIndicator.style : {};
    const allParams = { ...initialParams, ...initialStyle };
    const baseExisting = existingIndicator ? { ...initialParams, ...initialStyle } : {};
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

    const tabShell = document.createElement('div');
    tabShell.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';

    const tabStripWrap = document.createElement('div');
    tabStripWrap.style.cssText = 'position:relative;flex-shrink:0;border-bottom:1px solid var(--sp-ui-border, rgba(42,46,57,0.55));';

    const tabStrip = document.createElement('div');
    tabStrip.style.cssText = 'display:flex;flex-direction:row;align-items:stretch;';

    const TAB_ORDER = [['style', 'Style'], ['input', 'Input'], ['visibility', 'Visibility']];
    const tabPanes = {};
    const tabButtons = [];
    let activeTab = 'style';
    const tabCounts = { style: 0, input: 0, visibility: 0 };
    def.params.forEach(p => { tabCounts[indicatorSettingsTabForParam(p)]++; });
    if (tabCounts.style) activeTab = 'style';
    else if (tabCounts.input) activeTab = 'input';
    else activeTab = 'visibility';

    const underline = document.createElement('div');
    underline.style.cssText = 'position:absolute;bottom:0;height:2px;width:33.333%;left:0;transition:left 0.25s cubic-bezier(0.4,0,0.2,1);background:linear-gradient(90deg,transparent,var(--sp-accent,#2962ff),transparent);box-shadow:0 0 8px rgba(74,106,255,0.35);pointer-events:none;';

    function setTabUnderline() {
        const idx = Math.max(0, TAB_ORDER.findIndex(([tid]) => tid === activeTab));
        const n = TAB_ORDER.length;
        underline.style.width = (100 / n) + '%';
        underline.style.left = (idx * (100 / n)) + '%';
    }

    function updateIndSettingsTabs() {
        TAB_ORDER.forEach(([tid], i) => {
            const isAct = tid === activeTab;
            const b = tabButtons[i];
            b.style.color = isAct ? 'var(--sp-accent,#2962ff)' : 'var(--sp-text-muted,#8d93a1)';
            b.style.fontWeight = isAct ? '700' : '500';
            b.style.background = isAct ? 'rgba(74,106,255,0.06)' : 'transparent';
            tabPanes[tid].style.display = tid === activeTab ? 'flex' : 'none';
        });
        setTabUnderline();
    }

    TAB_ORDER.forEach(([tid, tlabel], i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = tlabel;
        btn.style.cssText = 'flex:1;padding:10px 6px;border:none;font:inherit;cursor:default;font-size:12px;background:transparent;transition:color .15s, background .12s;color:var(--sp-text-muted,#8d93a1);';
        btn.onmouseenter = () => {
            if (activeTab !== tid) btn.style.background = 'rgba(255,255,255,0.05)';
        };
        btn.onmouseleave = () => {
            if (activeTab !== tid) btn.style.background = 'transparent';
        };
        btn.onclick = (e) => {
            e.stopPropagation();
            activeTab = tid;
            updateIndSettingsTabs();
            closeAllPalettes();
        };
        tabStrip.appendChild(btn);
        tabButtons.push(btn);
    });
    tabStripWrap.appendChild(tabStrip);
    tabStripWrap.appendChild(underline);
    tabShell.appendChild(tabStripWrap);

    const panesWrap = document.createElement('div');
    panesWrap.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;';

    TAB_ORDER.forEach(([tid]) => {
        const pane = document.createElement('div');
        pane.dataset.indSettTab = tid;
        pane.style.cssText = 'display:none;flex-direction:column;gap:8px;overflow-y:auto;padding:12px 14px 4px 14px;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:var(--sp-ui-border, rgba(42,46,57,0.55)) transparent';
        tabPanes[tid] = pane;
        panesWrap.appendChild(pane);
    });
    tabShell.appendChild(panesWrap);
    panel.appendChild(tabShell);

    function appendEmptyTabMessage(tid, sectionTitle) {
        const pane = tabPanes[tid];
        if (pane.children.length > 0) return;
        const em = document.createElement('div');
        em.textContent = 'No ' + sectionTitle + ' options for this indicator.';
        em.style.cssText = 'font-size:12px;color:var(--sp-text-muted,#787b86);padding:12px 4px;font-style:italic;';
        pane.appendChild(em);
    }

    function appendIndicatorTimeRangeRow(param, mountEl) {
        const startVal = allParams[param.startId] != null ? allParams[param.startId] : (param.defaultStart || '00:00');
        const endVal = allParams[param.endId] != null ? allParams[param.endId] : (param.defaultEnd || '00:00');
        const block = document.createElement('div');
        block.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-bottom:4px;background:var(--sp-ui-surface-bg,#1e2740);border:1px solid var(--sp-ui-border,rgba(42,46,57,0.55));box-sizing:border-box;';
        const timeRow = document.createElement('div');
        timeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const timeLbl = document.createElement('span');
        timeLbl.textContent = param.label || 'Time';
        timeLbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--sp-text-muted,#9aa2b1);width:72px;flex-shrink:0;';
        timeRow.appendChild(timeLbl);
        const mkTime = function (id, val) {
            const inp = document.createElement('input');
            inp.type = 'time';
            inp.className = 'settings-input';
            inp.value = val;
            inp.style.cssText = 'flex:1;min-width:0;height:26px;padding:0 6px;background:var(--sp-ui-chrome-bg,#131722);color:var(--sp-text,#d1d4dc);border:1px solid var(--sp-input-border,rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
            inp.setAttribute('data-param-id', id);
            inp.setAttribute('data-param-type', 'time');
            return inp;
        };
        timeRow.appendChild(mkTime(param.startId, startVal));
        const sep = document.createElement('span');
        sep.textContent = '–';
        sep.style.cssText = 'color:var(--sp-text-muted,#787b86);font-size:12px;flex-shrink:0;';
        timeRow.appendChild(sep);
        timeRow.appendChild(mkTime(param.endId, endVal));
        block.appendChild(timeRow);
        mountEl.appendChild(block);
    }

    function appendIndicatorSessionInputRow(param, mountEl) {
        const showVal = allParams[param.showId] !== undefined ? allParams[param.showId] : param.defaultShow !== false;
        const nameVal = allParams[param.nameId] != null ? allParams[param.nameId] : (param.defaultName || param.label || '');
        const startVal = allParams[param.startId] != null ? allParams[param.startId] : (param.defaultStart || '00:00');
        const endVal = allParams[param.endId] != null ? allParams[param.endId] : (param.defaultEnd || '00:00');

        const block = document.createElement('div');
        block.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-bottom:4px;background:var(--sp-ui-surface-bg,#1e2740);border:1px solid var(--sp-ui-border,rgba(42,46,57,0.55));box-sizing:border-box;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:30px;';
        const showCb = document.createElement('input');
        showCb.type = 'checkbox';
        showCb.className = 'tv-native-checkbox';
        showCb.checked = showVal !== false;
        showCb.style.cssText = 'width:16px;height:16px;accent-color:var(--sp-accent,#2962ff);flex-shrink:0;';
        showCb.setAttribute('data-param-id', param.showId);
        showCb.setAttribute('data-param-type', 'checkbox');
        head.appendChild(showCb);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'settings-input';
        nameInput.value = nameVal;
        nameInput.placeholder = 'Session name';
        nameInput.style.cssText = 'flex:1;min-width:0;height:26px;padding:0 8px;background:var(--sp-ui-chrome-bg,#131722);color:var(--sp-text,#d1d4dc);border:1px solid var(--sp-input-border,rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
        nameInput.setAttribute('data-param-id', param.nameId);
        nameInput.setAttribute('data-param-type', 'text');
        head.appendChild(nameInput);
        block.appendChild(head);

        const timeRow = document.createElement('div');
        timeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding-left:26px;';
        const timeLbl = document.createElement('span');
        timeLbl.textContent = 'Time';
        timeLbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--sp-text-muted,#9aa2b1);width:36px;flex-shrink:0;';
        timeRow.appendChild(timeLbl);

        const mkTime = function (id, val) {
            const inp = document.createElement('input');
            inp.type = 'time';
            inp.className = 'settings-input';
            inp.value = val;
            inp.style.cssText = 'flex:1;min-width:0;height:26px;padding:0 6px;background:var(--sp-ui-chrome-bg,#131722);color:var(--sp-text,#d1d4dc);border:1px solid var(--sp-input-border,rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
            inp.setAttribute('data-param-id', id);
            inp.setAttribute('data-param-type', 'time');
            return inp;
        };
        timeRow.appendChild(mkTime(param.startId, startVal));
        const sep = document.createElement('span');
        sep.textContent = '–';
        sep.style.cssText = 'color:var(--sp-text-muted,#787b86);font-size:12px;flex-shrink:0;';
        timeRow.appendChild(sep);
        timeRow.appendChild(mkTime(param.endId, endVal));
        block.appendChild(timeRow);
        mountEl.appendChild(block);
    }

    function appendIndicatorParamRow(param, mountEl) {
        if (param.type === 'sessionInput') {
            appendIndicatorSessionInputRow(param, mountEl);
            return;
        }
        if (param.type === 'timeRange') {
            appendIndicatorTimeRangeRow(param, mountEl);
            return;
        }
        if (param.type === 'heading' || param.type === 'divider') {
            const h = document.createElement('div');
            h.textContent = param.label || '';
            h.style.cssText = [
                'font-size:10px',
                'font-weight:700',
                'color:var(--sp-text-muted,#787b86)',
                'letter-spacing:0.08em',
                'text-transform:uppercase',
                'padding:14px 10px 6px',
                'margin-top:4px',
                'border-top:1px solid var(--sp-ui-border, rgba(42,46,57,0.55))'
            ].join(';');
            if (param.type === 'divider' && !param.label) {
                h.style.padding = '10px 0 4px';
                h.style.borderTop = '1px solid var(--sp-ui-border, rgba(42,46,57,0.55))';
                h.style.minHeight = '0';
            }
            mountEl.appendChild(h);
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'settings-input-row';
        wrapper.style.cssText = `
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            padding:7px 10px;
            min-height:34px;
            background:var(--sp-ui-surface-bg, #1e2740);
            border:1px solid var(--sp-ui-border, rgba(42,46,57,0.55));
            box-sizing:border-box;
            transition:border-color .12s, background .12s;
        `;
        wrapper.onmouseenter = () => { wrapper.style.borderColor = 'rgba(140,160,255,0.34)'; };
        wrapper.onmouseleave = () => { wrapper.style.borderColor = 'var(--sp-ui-border, rgba(42,46,57,0.55))'; };

        const label = document.createElement('label');
        label.className = 'settings-input-label';
        label.textContent = param.label;
        label.style.cssText = `
            font-size:12px;
            font-weight:600;
            color:var(--sp-text-muted, #9aa2b1);
            letter-spacing:0.02em;
            flex:1;
            min-width:0;
        `;
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
            input.style.cssText = 'width:160px;height:26px;padding:0 8px;background:var(--sp-ui-chrome-bg, #131722);color:var(--sp-text, #d1d4dc);border:1px solid var(--sp-input-border, rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
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
            input.style.cssText = 'cursor:default;width:16px;height:16px;accent-color:var(--sp-accent,#2962ff);';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'select' && Array.isArray(param.options)) {
            input = document.createElement('select');
            input.className = 'settings-input settings-select-input';
            input.style.cssText = [
                'width:160px',
                'max-width:160px',
                'height:26px',
                'padding:0 26px 0 8px',
                'border-radius:0',
                'cursor:default',
                'background:var(--sp-ui-chrome-bg, #131722)',
                'color:var(--sp-text, #d1d4dc)',
                'border:1px solid var(--sp-input-border, rgba(255,255,255,0.14))',
                'outline:none',
                'box-sizing:border-box',
                '-webkit-appearance:none',
                'appearance:none',
                'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath fill=\'%238d93a1\' d=\'M0 1l5 4 5-4\'/%3E%3C/svg%3E")',
                'background-repeat:no-repeat',
                'background-position:right 8px center',
                'background-size:10px 6px'
            ].join(';');
            input.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
            input.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            input.addEventListener('click', function(e) { e.stopPropagation(); });
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
            input.style.borderRadius = '0';
            input.style.resize = 'vertical';
            input.style.minHeight = '220px';
            input.style.background = 'var(--sp-ui-chrome-bg, #131722)';
            input.style.color = 'var(--sp-text, #d1d4dc)';
            input.style.border = '1px solid var(--sp-input-border, rgba(255,255,255,0.14))';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'time') {
            input = document.createElement('input');
            input.type = 'time';
            input.className = 'settings-input';
            input.value = currentValue || param.default;
            input.style.cssText = 'width:160px;height:26px;padding:0 8px;background:var(--sp-ui-chrome-bg, #131722);color:var(--sp-text, #d1d4dc);border:1px solid var(--sp-input-border, rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
            input.style.cursor = 'default';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'text') {
            let type = indicatorType || 'unknown';

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
            input.style.cssText = 'width:160px;height:26px;padding:0 8px;background:var(--sp-ui-chrome-bg, #131722);color:var(--sp-text, #d1d4dc);border:1px solid var(--sp-input-border, rgba(255,255,255,0.14));outline:none;box-sizing:border-box;';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        }
        if (input && ['number', 'text', 'time', 'select', 'textarea'].includes(param.type)) {
            input.onfocus = () => {
                input.style.borderColor = 'var(--sp-accent, #2962ff)';
                wrapper.style.borderColor = 'rgba(var(--sp-accent-rgb, 41,98,255), 0.55)';
            };
            input.onblur = () => {
                input.style.borderColor = 'var(--sp-input-border, rgba(255,255,255,0.14))';
                wrapper.style.borderColor = 'var(--sp-ui-border, rgba(42,46,57,0.55))';
            };
        }
        mountEl.appendChild(wrapper);
    }

    def.params.forEach(param => {
        appendIndicatorParamRow(param, tabPanes[indicatorSettingsTabForParam(param)]);
    });
    appendEmptyTabMessage('style', 'style');
    appendEmptyTabMessage('input', 'input');
    appendEmptyTabMessage('visibility', 'visibility');
    updateIndSettingsTabs();

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
    buttonWrapper.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:12px;padding:10px 14px;border-top:1px solid var(--sp-ui-border, rgba(42,46,57,0.55));background:var(--sp-ui-chrome-bg, #131722);flex-shrink:0;';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-btn settings-btn-save';
    saveBtn.style.cssText = 'flex:0 0 auto;min-width:130px;width:auto;height:28px;padding:0 14px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:1px solid rgba(74,106,255,0.5);background:linear-gradient(135deg,var(--sp-accent,#2962ff),#6a8aff);color:#fff;font-size:13px;font-weight:700;cursor:default;transition:background .12s,border-color .12s,box-shadow .12s;';
    saveBtn.onmouseenter = () => { saveBtn.style.background = 'linear-gradient(135deg,#6a8aff,var(--sp-accent,#2962ff))'; saveBtn.style.boxShadow = '0 0 10px rgba(74,106,255,0.35)'; };
    saveBtn.onmouseleave = () => { saveBtn.style.background = 'linear-gradient(135deg,var(--sp-accent,#2962ff),#6a8aff)'; saveBtn.style.boxShadow = 'none'; };
    saveBtn.textContent = existingIndicator ? 'Apply Changes' : 'Add Indicator';
    const closePanel = () => {
        document.removeEventListener('click', handleOutsideClick, true);
        closeAllPalettes();
        destroyAllPalettes();
        backdrop.remove();
        panel.remove();
    };
    closeBtn.onclick = closePanel;

    saveBtn.onclick = () => {
        const newParams = {};
        const newStyle = {};
        
        def.params.forEach(param => {
            if (param.type === 'heading' || param.type === 'divider') return;
            const input = panel.querySelector(`[data-param-id="${param.id}"]`);
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
                value = sanitizeIndicatorParamValue(param, value);
            }

            const pid = param.id.toLowerCase();
            if (pid.includes('color') || pid.includes('width') || pid.includes('fill')
                || pid.includes('linestyle') || pid === 'showlabel') {
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
            const mergedEarly = { ...baseExisting, ...newParams, ...newStyle };
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
            const mergedParams = { ...baseExisting, ...newParams, ...newStyle };
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
                targetChart.addIndicator(indicatorType, { ...baseExisting, ...newParams, ...newStyle });
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
    cancelBtn.style.cssText = 'flex:0 0 auto;min-width:110px;width:auto;height:28px;padding:0 14px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:1px solid var(--sp-ui-border, rgba(42,46,57,0.55));background:var(--sp-ui-surface-bg, #1e2740);color:var(--sp-text,#d1d4dc);font-size:13px;font-weight:600;cursor:default;transition:background .12s,border-color .12s,color .12s;';
    cancelBtn.onmouseenter = () => { cancelBtn.style.background = 'var(--sp-hover-bg, rgba(255,255,255,0.07))'; cancelBtn.style.borderColor = 'rgba(140,160,255,0.45)'; cancelBtn.style.color = 'var(--sp-text,#fff)'; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'var(--sp-ui-surface-bg, #1e2740)'; cancelBtn.style.borderColor = 'var(--sp-ui-border, rgba(42,46,57,0.55))'; cancelBtn.style.color = 'var(--sp-text,#d1d4dc)'; };
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        closePanel();
    };

    buttonWrapper.appendChild(cancelBtn);
    buttonWrapper.appendChild(saveBtn);
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
    ensureTalariaIndLegendHoverCss();
    ensureTalariaIndSwatchCss();
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
        if (document.getElementById('indicator-settings-modal') || document.querySelector('[data-v9-ind-sett="1"]')) return;

        talariaRebuildOhlcIndicatorLegend(this, div);
    };
}

/** Whether indicator color picker should expose alpha (fill / volume / session tints). */
function v9IndicatorColorSupportsAlpha(paramId, paramDef) {
    const id = String(paramId || '').toLowerCase();
    if (/^(overbought|oversold|mid|bg|obgradient|osgradient|histcolor[0-3]|zero|macd|signal|k|d|ma|bull|bear|upper|middle|lower|body)color$/i.test(id)) return true;
    if (/fill|background|zonebg|bgcolor|midcolor|upcolor|downcolor|bullcolor|bearcolor|sfc$|_fc$|fc$/.test(id)) return true;
    if (/^asian|^london|^newyork|^sydney|^tokyo|^frankfurt|^cbdr|^nyam|^lc/.test(id) && id.indexOf('color') >= 0) return true;
    if (paramDef && paramDef.type === 'color') {
        const d = String(paramDef.default || '');
        if (d.indexOf('rgba') >= 0) return true;
    }
    return false;
}

/** Merge legacy hex fillColor + fillOpacity into rgba on draft open. */
function v9MigrateIndicatorDraftColors(indicatorType, draft, allParams) {
    if (!draft || !allParams) return;
    const fo = allParams.fillOpacity;
    const fc = draft.fillColor;
    if (fo != null && fc != null && String(fc).indexOf('rgba') < 0) {
        let op = Number(fo);
        if (!Number.isFinite(op)) op = 10;
        op = Math.max(0, Math.min(100, op)) / 100;
        const s = String(fc).trim();
        if (s.charAt(0) === '#') {
            let h = s.slice(1);
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            if (h.length === 6) {
                const r = parseInt(h.slice(0, 2), 16);
                const g = parseInt(h.slice(2, 4), 16);
                const b = parseInt(h.slice(4, 6), 16);
                if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    draft.fillColor = 'rgba(' + r + ',' + g + ',' + b + ',' + op + ')';
                }
            }
        }
    }
}

function v9ParamById(params, id) {
    return params.find(function (p) { return p.id === id; });
}

function v9StyleTabParams(params) {
    return params.filter(function (p) {
        return p.type !== 'heading' && p.type !== 'divider' && indicatorSettingsTabForParam(p) === 'style';
    });
}

function v9PlotRow(label, colorId, styleId, widthId, showId) {
    return { label: label, colorId: colorId, styleId: styleId || null, widthId: widthId || null, showId: showId || null };
}

function v9ColorRow(label, colorId, showId) {
    return { label: label, colorId: colorId, styleId: null, widthId: null, showId: showId || null, colorOnly: true };
}

function v9LevelRow(valueId, showId, colorId, styleId, widthId) {
    return { valueId: valueId, showId: showId, colorId: colorId, styleId: styleId, widthId: widthId || null };
}

/** Style grid row with color, opacity %, line style, thickness (Opening Range bands). */
function v9BandStyleRow(label, colorId, opacityId, styleId, widthId, showId) {
    return {
        label: label,
        colorId: colorId,
        opacityId: opacityId,
        styleId: styleId,
        widthId: widthId,
        showId: showId,
        bandStyleRow: true
    };
}

/**
 * TradingView-style Style tab layout: sections of grid rows (chk | label | color | style | thickness).
 * Returns null when Style tab should use flex fallback (ICT Everything, custom script).
 */
function v9BuildIndicatorStyleLayout(indicatorType) {
    indicatorType = resolveIndicatorDefinitionKey(indicatorType);
    const def = INDICATOR_DEFINITIONS[indicatorType];
    if (!def || indicatorType === 'icteverything' || indicatorType === 'custom') return null;
    const params = def.params;
    const has = function (id) { return !!v9ParamById(params, id); };
    const footers = [];
    if (has('showLabel')) {
        const p = v9ParamById(params, 'showLabel');
        footers.push({ type: 'checkbox', id: 'showLabel', label: p.label || 'Show Label' });
    }

    if (indicatorType === 'bb') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Basis', 'middleColor', 'middleLineStyle', 'middleLineWidth', 'showMiddle'),
                    v9PlotRow('Upper Band', 'upperColor', 'upperLineStyle', 'upperLineWidth', 'showUpper'),
                    v9PlotRow('Lower Band', 'lowerColor', 'lowerLineStyle', 'lowerLineWidth', 'showLower')
                ]
            }, {
                title: 'Area Between Bands',
                rows: [v9ColorRow('Background', 'fillColor', 'showFill')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'keltner') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Upper Band', 'upperColor', 'upperLineStyle', 'upperLineWidth', 'showUpper'),
                    v9PlotRow('Middle Band', 'middleColor', 'middleLineStyle', 'middleLineWidth', 'showMiddle'),
                    v9PlotRow('Lower Band', 'lowerColor', 'lowerLineStyle', 'lowerLineWidth', 'showLower')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'donchian') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Upper Band', 'upperColor', 'upperLineStyle', 'upperLineWidth', 'showUpper'),
                    v9PlotRow('Middle Band', 'middleColor', 'middleLineStyle', 'middleLineWidth', 'showMiddle'),
                    v9PlotRow('Lower Band', 'lowerColor', 'lowerLineStyle', 'lowerLineWidth', 'showLower')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'supertrend') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Up Trend', 'upColor', 'upLineStyle', 'upLineWidth', 'showUp'),
                    v9PlotRow('Down Trend', 'downColor', 'downLineStyle', 'downLineWidth', 'showDown'),
                    v9PlotRow('Body Middle Line', 'bodyColor', 'bodyLineStyle', 'bodyLineWidth', 'showBody')
                ]
            }, {
                title: 'Background',
                rows: [
                    v9ColorRow('Up Trend', 'upBgColor', 'showUpBg'),
                    v9ColorRow('Down Trend', 'downBgColor', 'showDownBg')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'aroon') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Aroon Up', 'upColor', 'upLineStyle', 'upLineWidth', 'showUp'),
                    v9PlotRow('Aroon Down', 'downColor', 'downLineStyle', 'downLineWidth', 'showDown')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'rsi') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('RSI', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }, {
                title: 'RSI-based MA',
                header: true,
                rows: [
                    v9PlotRow('RSI-based MA', 'maColor', 'maLineStyle', 'maLineWidth', 'showMa')
                ]
            }, {
                title: 'RSI Upper Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('overboughtValue', 'showOverbought', 'overboughtColor', 'overboughtLineStyle', 'overboughtLineWidth')]
            }, {
                title: 'RSI Middle Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('midValue', 'showMid', 'midColor', 'midLineStyle', 'midLineWidth')]
            }, {
                title: 'RSI Lower Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('oversoldValue', 'showOversold', 'oversoldColor', 'oversoldLineStyle', 'oversoldLineWidth')]
            }, {
                title: 'RSI Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }, {
                title: 'Overbought Gradient Fill',
                rows: [v9ColorRow('Gradient', 'obGradientColor', 'showObGradient')]
            }, {
                title: 'Oversold Gradient Fill',
                rows: [v9ColorRow('Gradient', 'osGradientColor', 'showOsGradient')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'macd') {
        return {
            sections: [{
                title: 'Histogram',
                checkboxRow: { showId: 'showHist', label: 'Histogram' },
                histSection: true,
                header: true,
                rows: [
                    v9PlotRow('Color 0', 'histColor0', 'histColor0LineStyle', 'histColor0LineWidth', null),
                    v9PlotRow('Color 1', 'histColor1', 'histColor1LineStyle', 'histColor1LineWidth', null),
                    v9PlotRow('Color 2', 'histColor2', 'histColor2LineStyle', 'histColor2LineWidth', null),
                    v9PlotRow('Color 3', 'histColor3', 'histColor3LineStyle', 'histColor3LineWidth', null)
                ]
            }, {
                header: true,
                rows: [
                    v9PlotRow('MACD', 'macdColor', 'macdLineStyle', 'macdLineWidth', 'showMacd'),
                    v9PlotRow('Signal line', 'signalColor', 'signalLineStyle', 'signalLineWidth', 'showSignal')
                ]
            }, {
                title: 'Zero Line',
                zeroLevelHeader: true,
                levelRows: [v9LevelRow('zeroValue', 'showZero', 'zeroColor', 'zeroLineStyle', 'zeroLineWidth')]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'dpo') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('DPO', 'color', 'lineStyle', 'lineWidth', 'showLine'),
                    v9PlotRow('Middle Line', 'midColor', 'midLineStyle', 'midLineWidth', 'showMid')
                ]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'stddev') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Plot Line', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'hma') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('HMA', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'tema') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('TEMA', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'dema') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('DEMA', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'wma') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('WMA', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'sma') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('SMA', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'sessions') {
        return {
            sections: [{
                title: 'Background',
                header: true,
                rows: SESSION_BOX_SESSION_DEFS.map(function (sess) {
                    return v9ColorRow(sess.label, sess.colorId, null);
                })
            }],
            footers: footers
        };
    }

    if (indicatorType === 'adx') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('ADX', 'adxColor', 'adxLineStyle', 'adxLineWidth', 'showAdx'),
                    v9PlotRow('+DI', 'plusDIColor', 'plusDILineStyle', 'plusDILineWidth', 'showPlusDI'),
                    v9PlotRow('-DI', 'minusDIColor', 'minusDILineStyle', 'minusDILineWidth', 'showMinusDI')
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'stoch' || indicatorType === 'stochastic' || indicatorType === 'stochrsi') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('%K', 'kColor', 'kLineStyle', 'kLineWidth', 'showK'),
                    v9PlotRow('%D', 'dColor', 'dLineStyle', 'dLineWidth', 'showD')
                ]
            }, {
                title: 'Upper Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('overboughtValue', 'showOverbought', 'overboughtColor', 'overboughtLineStyle', 'overboughtLineWidth')]
            }, {
                title: 'Middle Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('midValue', 'showMid', 'midColor', 'midLineStyle', 'midLineWidth')]
            }, {
                title: 'Lower Band',
                bandLevelHeader: true,
                levelRows: [v9LevelRow('oversoldValue', 'showOversold', 'oversoldColor', 'oversoldLineStyle', 'oversoldLineWidth')]
            }, {
                title: 'Background Fill (Upper to Lower Band)',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'mom' || indicatorType === 'momentum') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('Momentum', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }, {
                title: 'Zero Line',
                levelHeader: true,
                levelRows: [v9LevelRow('zeroValue', 'showZero', 'zeroColor', 'zeroLineStyle')]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'roc') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('ROC', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }, {
                title: 'Zero Line',
                levelHeader: true,
                levelRows: [v9LevelRow('zeroValue', 'showZero', 'zeroColor', 'zeroLineStyle')]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'cci') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('CCI', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }, {
                title: 'Overbought Level',
                levelHeader: true,
                levelRows: [v9LevelRow('overboughtValue', 'showOverbought', 'overboughtColor', 'overboughtLineStyle')]
            }, {
                title: 'Oversold Level',
                levelHeader: true,
                levelRows: [v9LevelRow('oversoldValue', 'showOversold', 'oversoldColor', 'oversoldLineStyle')]
            }, {
                title: 'Mid Level',
                levelHeader: true,
                levelRows: [v9LevelRow('midValue', 'showMid', 'midColor', 'midLineStyle')]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'willr') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9PlotRow('%R', 'color', 'lineStyle', 'lineWidth', 'showLine')
                ]
            }, {
                title: 'Overbought Level',
                levelHeader: true,
                levelRows: [v9LevelRow('overboughtValue', 'showOverbought', 'overboughtColor', 'overboughtLineStyle')]
            }, {
                title: 'Oversold Level',
                levelHeader: true,
                levelRows: [v9LevelRow('oversoldValue', 'showOversold', 'oversoldColor', 'oversoldLineStyle')]
            }, {
                title: 'Mid Level',
                levelHeader: true,
                levelRows: [v9LevelRow('midValue', 'showMid', 'midColor', 'midLineStyle')]
            }, {
                title: 'Background',
                rows: [v9ColorRow('Background', 'bgColor', 'showBg')]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'psar') {
        return {
            sections: [{
                header: true,
                rows: [
                    v9ColorRow('Up', 'bullColor', 'showUp'),
                    v9ColorRow('Down', 'bearColor', 'showDown'),
                    v9PlotRow('Plot', null, 'lineStyle', 'lineWidth', null)
                ]
            }],
            footers: footers
        };
    }

    if (indicatorType === 'openingrange') {
        return {
            sections: [
                {
                    title: 'High Band',
                    bandStyleHeader: true,
                    rows: [v9BandStyleRow('High Band', 'upperColor', 'upperOpacity', 'upperLineStyle', 'upperLineWidth', 'showUpper')]
                },
                {
                    title: 'Middle Line',
                    bandStyleHeader: true,
                    rows: [v9BandStyleRow('Middle Line', 'middleColor', 'middleOpacity', 'middleLineStyle', 'middleLineWidth', 'showMiddle')]
                },
                {
                    title: 'Lower Band',
                    bandStyleHeader: true,
                    rows: [v9BandStyleRow('Lower Band', 'lowerColor', 'lowerOpacity', 'lowerLineStyle', 'lowerLineWidth', 'showLower')]
                }
            ],
            footers: footers
        };
    }

    if (indicatorType === 'volume') {
        return {
            sections: [{
                title: 'Bars',
                rows: [
                    v9ColorRow('Up Color', 'upColor'),
                    v9ColorRow('Down Color', 'downColor')
                ]
            }, {
                title: 'Moving Average',
                rows: [v9ColorRow('MA Color', 'maColor')]
            }],
            footers: footers
        };
    }

    if (has('upperColor') && has('middleColor') && has('lowerColor')) {
        const styleId = has('lineStyle') ? 'lineStyle' : null;
        const widthId = has('lineWidth') ? 'lineWidth' : null;
        const rows = [
            v9PlotRow(v9ParamById(params, 'upperColor').label || 'Upper', 'upperColor', styleId, widthId),
            v9PlotRow(v9ParamById(params, 'middleColor').label || 'Middle', 'middleColor', null, null),
            v9PlotRow(v9ParamById(params, 'lowerColor').label || 'Lower', 'lowerColor', null, null)
        ];
        const sections = [{ header: !!(styleId || widthId), rows: rows }];
        if (has('fillColor')) {
            sections.push({
                title: 'Fill',
                rows: [v9ColorRow('Background', 'fillColor', has('showFill') ? 'showFill' : null)]
            });
        }
        return { sections: sections, footers: footers };
    }

    if (has('upColor') && has('downColor') && !has('color')) {
        const styleId = has('lineStyle') ? 'lineStyle' : null;
        const widthId = has('lineWidth') ? 'lineWidth' : null;
        return {
            sections: [{
                header: !!(styleId || widthId),
                rows: [
                    v9PlotRow(v9ParamById(params, 'upColor').label || 'Up', 'upColor', styleId, widthId),
                    v9PlotRow(v9ParamById(params, 'downColor').label || 'Down', 'downColor', null, null)
                ]
            }],
            footers: footers
        };
    }

    if (has('bullColor') && has('bearColor')) {
        const widthId = has('lineWidth') ? 'lineWidth' : null;
        return {
            sections: [{
                header: !!widthId,
                rows: [
                    v9PlotRow(v9ParamById(params, 'bullColor').label || 'Bull', 'bullColor', null, widthId),
                    v9PlotRow(v9ParamById(params, 'bearColor').label || 'Bear', 'bearColor', null, null)
                ]
            }],
            footers: footers
        };
    }

    const styleColors = v9StyleTabParams(params).filter(function (p) { return p.type === 'color'; });
    const styleId = has('lineStyle') ? 'lineStyle' : null;
    const widthId = has('lineWidth') ? 'lineWidth' : null;

    if (styleColors.length > 1) {
        const rows = [];
        let sharedApplied = false;
        styleColors.forEach(function (p) {
            const isHist = /histogram/i.test(p.id) || /histogram/i.test(p.label || '');
            const shortLabel = String(p.label || p.id).replace(/\s*color\s*$/i, '').trim() || p.label;
            if (isHist) {
                rows.push(v9ColorRow(shortLabel, p.id));
                return;
            }
            if (!sharedApplied && (styleId || widthId)) {
                rows.push(v9PlotRow(shortLabel, p.id, styleId, widthId));
                sharedApplied = true;
            } else {
                rows.push(v9ColorRow(shortLabel, p.id));
            }
        });
        return { sections: [{ header: !!(styleId || widthId), rows: rows }], footers: footers };
    }

    if (has('color') && (styleId || widthId)) {
        const p = v9ParamById(params, 'color');
        return {
            sections: [{
                header: true,
                rows: [v9PlotRow(p.label || 'Line', 'color', styleId, widthId)]
            }],
            footers: footers
        };
    }

    if (has('color') && styleColors.length === 1) {
        const p = v9ParamById(params, 'color');
        return {
            sections: [{
                rows: [v9ColorRow(p.label || 'Line', 'color')]
            }],
            footers: footers
        };
    }

    if (styleColors.length >= 1) {
        return {
            sections: [{
                rows: styleColors.map(function (p) {
                    return v9ColorRow(p.label || p.id, p.id);
                })
            }],
            footers: footers
        };
    }

    return null;
}

/** Dash-only line styles (solid / dashed / dotted) — separate from plot type (Line, Step, Histogram…). */
const INDICATOR_DASH_STYLE_OPTIONS = [
    { value: 'Solid', label: 'Solid' },
    { value: 'Dashed', label: 'Dashed' },
    { value: 'Dotted', label: 'Dotted' },
    { value: 'Dashdot', label: 'Dash-dot' }
];

function v9IndDashStyleParamId(styleParamId) {
    if (!styleParamId) return null;
    if (styleParamId === 'lineStyle') return 'lineDashStyle';
    if (/LineStyle$/.test(styleParamId)) return styleParamId.replace(/LineStyle$/, 'LineDashStyle');
    return null;
}

function v9EnsureIndicatorDashStyleParams(def) {
    if (!def || !Array.isArray(def.params)) return;
    const existing = new Set(def.params.map(function (p) { return p.id; }));
    def.params.forEach(function (param) {
        const dashId = v9IndDashStyleParamId(param.id);
        if (!dashId || existing.has(dashId)) return;
        if (param.type !== 'select') return;
        if (!/LineStyle$/.test(param.id) && param.id !== 'lineStyle') return;
        def.params.push({
            id: dashId,
            label: (param.label || 'Line').replace(/style/i, 'Dash'),
            type: 'select',
            options: INDICATOR_DASH_STYLE_OPTIONS,
            default: 'Solid',
            tab: param.tab || 'style'
        });
        existing.add(dashId);
    });
}

Object.keys(INDICATOR_DEFINITIONS).forEach(function (k) {
    v9EnsureIndicatorDashStyleParams(INDICATOR_DEFINITIONS[k]);
});

window.INDICATOR_DEFINITIONS = INDICATOR_DEFINITIONS;
window.INDICATOR_PLOT_STYLE_OPTIONS = INDICATOR_PLOT_STYLE_OPTIONS;
window.INDICATOR_DASH_STYLE_OPTIONS = INDICATOR_DASH_STYLE_OPTIONS;
window.__v9IndDashStyleParamId = v9IndDashStyleParamId;
window.indicatorSettingsTabForParam = indicatorSettingsTabForParam;
window.__v9MergeIndicatorDraftForUpdate = mergeIndicatorDraftForUpdate;
window.__v9SanitizeIndicatorParamValue = sanitizeIndicatorParamValue;
window.__v9ClampIndicatorLineWidth = clampIndicatorLineWidth;
window.__v9ClampIndicatorStyleLineWidths = clampIndicatorStyleLineWidths;
window.__v9SanitizeIndicatorPayloadFromDefinition = sanitizeIndicatorPayloadFromDefinition;
window.INDICATOR_MAX_LINE_WIDTH = INDICATOR_MAX_LINE_WIDTH;
window.__v9BuildIndicatorStyleLayout = v9BuildIndicatorStyleLayout;
window.__v9SessionBoxSessionDefs = SESSION_BOX_SESSION_DEFS;
window.__v9ResolveIndicatorDefinitionKey = resolveIndicatorDefinitionKey;
window.__v9IndicatorColorSupportsAlpha = v9IndicatorColorSupportsAlpha;
window.__v9MigrateIndicatorDraftColors = v9MigrateIndicatorDraftColors;
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
                indicator.name = 'ADX(' + (indicator.params.diLength || indicator.params.period || 14) + ',' + (indicator.params.adxSmoothing || indicator.params.period || 14) + ')';
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
                const adxDiLen = indicator.params.diLength || indicator.params.period || 14;
                const adxSmooth = indicator.params.adxSmoothing || indicator.params.period || 14;
                if (typeof calculateADX === 'function') {
                    this.indicators.data[id] = calculateADX(this.data, adxDiLen, adxSmooth);
                    console.log('✅ ADX recalculated with DI length:', adxDiLen, 'ADX smoothing:', adxSmooth);
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
    Chart.prototype.updateOHLCIndicators = function() {
        ensureTalariaIndLegendHoverCss();
        const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
        const div = document.getElementById('ohlcIndicators' + idSuffix);

        if (!div) return;
        if (document.getElementById('indicator-settings-modal') || document.querySelector('[data-v9-ind-sett="1"]')) return;

        talariaRebuildOhlcIndicatorLegend(this, div);
    };
    console.log('✅ Chart.prototype.updateOHLCIndicators overridden with edit buttons');
}

// Export createIndicatorSettingsPanel globally for volume settings
window.createIndicatorSettingsPanel = createIndicatorSettingsPanel;
