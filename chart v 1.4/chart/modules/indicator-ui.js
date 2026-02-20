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
            { id: 'boxTransparency', label: 'Box Transparency', type: 'number', default: 85, min: 0, max: 100 },
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
    }
};

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
        }
        #indicatorSettingsPanel .indicator-color-preview-wrapper {
            position: relative;
            display: flex;
        }
        #indicatorSettingsPanel .indicator-color-preview {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            border: 2px solid #363a45;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        #indicatorSettingsPanel .indicator-color-preview:hover {
            border-color: #2962ff;
        }
        #indicatorSettingsPanel .indicator-color-value {
            color: #d1d4dc;
            font-size: 12px;
            font-weight: 500;
            min-width: 90px;
        }
        #indicatorSettingsPanel .indicator-color-palette {
            position: absolute;
            top: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            background: #2a2e39;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            padding: 16px;
            display: none;
            flex-direction: column;
            gap: 12px;
            z-index: 10001;
            min-width: 280px;
        }
        #indicatorSettingsPanel .indicator-color-palette.active {
            display: flex;
        }
        #indicatorSettingsPanel .indicator-color-grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 4px;
        }
        #indicatorSettingsPanel .indicator-color-swatch {
            width: 22px;
            height: 22px;
            border-radius: 3px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.15s;
        }
        #indicatorSettingsPanel .indicator-color-swatch:hover {
            transform: scale(1.1);
            border-color: #ffffff;
        }
        #indicatorSettingsPanel .indicator-color-swatch.selected {
            border-color: #ffffff;
            box-shadow: 0 0 0 1px #2a2e39, 0 0 0 3px #ffffff;
        }
        #indicatorSettingsPanel .indicator-color-divider {
            height: 1px;
            background: #3a3e49;
        }
        #indicatorSettingsPanel .indicator-color-recent {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #indicatorSettingsPanel .indicator-color-recent-items {
            display: flex;
            gap: 6px;
        }
        #indicatorSettingsPanel .indicator-color-add {
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
        #indicatorSettingsPanel .indicator-color-add:hover {
            background: #4a4e59;
            border-color: #7a7e89;
            color: #ffffff;
        }
        #indicatorSettingsPanel .indicator-color-opacity {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #indicatorSettingsPanel .indicator-color-opacity-label {
            color: #8a8e99;
            font-size: 12px;
        }
        #indicatorSettingsPanel .indicator-color-opacity-control {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #indicatorSettingsPanel .indicator-color-opacity-slider {
            flex: 1;
            -webkit-appearance: none;
            appearance: none;
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,1));
            outline: none;
            cursor: pointer;
        }
        #indicatorSettingsPanel .indicator-color-opacity-slider::-webkit-slider-thumb {
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
        #indicatorSettingsPanel .indicator-color-opacity-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #3a3e49;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        #indicatorSettingsPanel .indicator-color-opacity-value {
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
    previewWrapper.appendChild(palette);

    const valueLabel = document.createElement('span');
    valueLabel.className = 'indicator-color-value';
    container.appendChild(valueLabel);

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
        valueLabel.textContent = `${normalizeHex(baseColor)} • ${Math.round(opacity * 100)}%`;
    };

    const close = () => {
        palette.classList.remove('active');
    };

    preview.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasActive = palette.classList.contains('active');
        closeAllPalettes();
        if (!wasActive) {
            updateSliderGradient();
            updateSelectedSwatches();
            palette.classList.add('active');
        }
    });

    valueLabel.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasActive = palette.classList.contains('active');
        closeAllPalettes();
        if (!wasActive) {
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
        contains: (target) => container.contains(target)
    };
}

// 2. UI Generation Functions

function createIndicatorSelectionMenu(chartInstance) {
    // Check if light mode
    const isLightMode = document.body.classList.contains('light-mode');
    
    // Define categories
    const categories = {
        favorites: { name: 'Favorites', icon: '☆', indicators: [] },
        technicals: { 
            name: 'Technicals', 
            icon: '',
            indicators: ['sma', 'ema', 'bb', 'rsi', 'macd', 'wma', 'vwap', 'stoch', 'atr', 'cci', 'adx', 'adr', 'volume']
        },
        sessions: {
            name: 'Sessions',
            icon: '',
            indicators: ['sessions', 'killzones']
        }
    };
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'indicatorMenuBackdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: ${isLightMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.6)'};
        z-index: 9998;
        visibility: hidden;
        opacity: 0;
        transition: opacity 0.2s ease, visibility 0.2s ease;
    `;
    document.body.appendChild(backdrop);

    // Create floating menu - TradingView style
    const menu = document.createElement('div');
    menu.id = 'indicatorSelectionMenu';
    menu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 700px;
        max-width: 90vw;
        height: 500px;
        max-height: 80vh;
        background: ${isLightMode ? '#ffffff' : '#000000'};
        border: 1px solid ${isLightMode ? '#e0e3eb' : 'transparent'};
        border-radius: 8px;
        box-shadow: ${isLightMode ? '0 8px 32px rgba(0, 0, 0, 0.15)' : '0 16px 48px rgba(0, 0, 0, 0.4)'};
        z-index: 9999;
        visibility: hidden;
        opacity: 0;
        transition: opacity 0.15s ease, visibility 0.15s ease;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;

    // Header with title and close button
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid ${isLightMode ? '#e0e3eb' : '#2a2e39'};
        flex-shrink: 0;
    `;
    
    const title = document.createElement('span');
    title.textContent = 'Indicators, metrics, and strategies';
    title.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        color: ${isLightMode ? '#131722' : '#d1d4dc'};
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px;
        display: flex;
        align-items: center;
        color: #787b86;
        border-radius: 4px;
        transition: all 0.15s;
    `;
    closeBtn.onmouseenter = () => { closeBtn.style.background = isLightMode ? '#f0f3fa' : '#2a2e39'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; };
    closeBtn.onclick = () => closeMenu();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    menu.appendChild(header);

    // Search bar
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        padding: 12px 20px;
        border-bottom: 1px solid ${isLightMode ? '#e0e3eb' : '#2a2e39'};
        flex-shrink: 0;
    `;
    
    const searchWrapper = document.createElement('div');
    searchWrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        background: ${isLightMode ? '#f0f3fa' : '#2a2e39'};
        border-radius: 6px;
        padding: 0 12px;
    `;
    
    const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    searchIcon.setAttribute('width', '16');
    searchIcon.setAttribute('height', '16');
    searchIcon.setAttribute('viewBox', '0 0 24 24');
    searchIcon.setAttribute('fill', 'none');
    searchIcon.setAttribute('stroke', '#787b86');
    searchIcon.setAttribute('stroke-width', '2');
    searchIcon.innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>';
    searchIcon.style.cssText = 'flex-shrink: 0;';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'indicatorMenuSearch';
    searchInput.placeholder = 'Search';
    searchInput.style.cssText = `
        flex: 1;
        padding: 10px 12px;
        border: none;
        font-size: 14px;
        color: ${isLightMode ? '#131722' : '#d1d4dc'};
        background: transparent;
        outline: none;
    `;
    
    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchContainer.appendChild(searchWrapper);
    menu.appendChild(searchContainer);

    // Main content area with sidebar and list
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
        display: flex;
        flex: 1;
        overflow: hidden;
    `;

    // Left sidebar
    const sidebar = document.createElement('div');
    sidebar.style.cssText = `
        width: 180px;
        border-right: 1px solid ${isLightMode ? '#e0e3eb' : '#2a2e39'};
        padding: 8px 0;
        overflow-y: auto;
        flex-shrink: 0;
    `;

    let activeCategory = 'technicals';
    const categoryButtons = {};

    // Create category items
    const createCategoryItem = (key, cat, isSection = false) => {
        if (isSection) {
            const section = document.createElement('div');
            section.style.cssText = `
                padding: 12px 16px 6px;
                font-size: 11px;
                font-weight: 600;
                color: #787b86;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            `;
            section.textContent = cat;
            return section;
        }

        const item = document.createElement('div');
        item.dataset.category = key;
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            color: ${isLightMode ? '#000000ff' : '#d1d4dc'};
            transition: all 0.15s;
            border-radius: 0;
            margin: 0 8px;
            border-radius: 4px;
        `;
        
        const icon = document.createElement('span');
        icon.textContent = cat.icon;
        icon.style.cssText = 'font-size: 14px; width: 20px; text-align: center;';
        
        const name = document.createElement('span');
        name.textContent = cat.name;
        
        item.appendChild(icon);
        item.appendChild(name);
        
        item.onmouseenter = () => {
            if (activeCategory !== key) {
                item.style.background = isLightMode ? '#f0f3fa' : '#2a2e39';
            }
        };
        item.onmouseleave = () => {
            if (activeCategory !== key) {
                item.style.background = 'transparent';
            }
        };
        
        item.onclick = () => {
            // Update active state
            Object.keys(categoryButtons).forEach(k => {
                categoryButtons[k].style.background = 'transparent';
                categoryButtons[k].style.color = isLightMode ? '#131722' : '#d1d4dc';
            });
            item.style.background = '#2962ff';
            item.style.color = '#ffffff';
            activeCategory = key;
            filterByCategory(key);
        };
        
        categoryButtons[key] = item;
        return item;
    };

    // Add sections and categories
    sidebar.appendChild(createCategoryItem(null, 'BUILT-IN', true));
    sidebar.appendChild(createCategoryItem('technicals', categories.technicals));
    sidebar.appendChild(createCategoryItem('sessions', categories.sessions));
    sidebar.appendChild(createCategoryItem(null, 'PERSONAL', true));
    sidebar.appendChild(createCategoryItem('favorites', categories.favorites));

    // Set initial active
    categoryButtons['technicals'].style.background = '#2962ff';
    categoryButtons['technicals'].style.color = '#ffffff';

    contentArea.appendChild(sidebar);

    // Right content - indicator list
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;

    // List header
    const listHeader = document.createElement('div');
    listHeader.style.cssText = `
        display: flex;
        padding: 8px 16px;
        border-bottom: 1px solid ${isLightMode ? '#e0e3eb' : '#2a2e39'};
        font-size: 11px;
        font-weight: 500;
        color: #787b86;
        text-transform: uppercase;
        flex-shrink: 0;
    `;
    listHeader.innerHTML = `<span style="flex: 1;">Indicator Name</span>`;
    listContainer.appendChild(listHeader);

    // Indicator list
    const indicatorList = document.createElement('div');
    indicatorList.style.cssText = `
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
    `;

    // Store indicator items for filtering
    const indicatorItems = [];

    Object.keys(INDICATOR_DEFINITIONS).forEach(key => {
        const def = INDICATOR_DEFINITIONS[key];
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 10px 16px;
            cursor: pointer;
            transition: background 0.1s;
            font-size: 13px;
            color: ${isLightMode ? '#131722' : '#d1d4dc'};
        `;
        item.dataset.name = def.name.toLowerCase();
        item.dataset.key = key;
        
        // Star icon for favorites
        const star = document.createElement('span');
        star.innerHTML = '★';
        star.style.cssText = `
            color: #787b86;
            margin-right: 12px;
            font-size: 12px;
            cursor: pointer;
            transition: color 0.15s;
        `;
        star.onclick = (e) => {
            e.stopPropagation();
            const isFav = star.style.color === 'rgb(255, 193, 7)';
            star.style.color = isFav ? '#787b86' : '#ffc107';
            // Toggle in favorites
            const idx = categories.favorites.indicators.indexOf(key);
            if (isFav && idx > -1) {
                categories.favorites.indicators.splice(idx, 1);
            } else if (!isFav) {
                categories.favorites.indicators.push(key);
            }
        };
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = def.name;
        nameSpan.style.flex = '1';
        
        item.appendChild(star);
        item.appendChild(nameSpan);
        
        item.onmouseenter = () => item.style.background = isLightMode ? '#f0f3fa' : '#2a2e39';
        item.onmouseleave = () => item.style.background = 'transparent';
        
        item.onclick = () => {
            console.log('📊 Indicator clicked:', key, def.name);
            console.log('📊 Chart instance:', chartInstance);
            console.log('📊 Has addIndicator:', typeof chartInstance?.addIndicator);
            closeMenu();
            createIndicatorSettingsPanel(chartInstance, key);
        };
        
        indicatorList.appendChild(item);
        indicatorItems.push(item);
    });

    listContainer.appendChild(indicatorList);
    contentArea.appendChild(listContainer);
    menu.appendChild(contentArea);

    // Filter by category
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

    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        if (searchTerm) {
            // Show all matching indicators regardless of category
            indicatorItems.forEach(item => {
                const matches = item.dataset.name.includes(searchTerm);
                item.style.display = matches ? 'flex' : 'none';
            });
        } else {
            filterByCategory(activeCategory);
        }
    });

    // Close menu function
    function closeMenu() {
        menu.classList.remove('visible');
        backdrop.style.visibility = 'hidden';
        backdrop.style.opacity = '0';
        searchInput.value = '';
        filterByCategory(activeCategory);
    }

    // Keyboard support
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeMenu();
    });

    // Click backdrop to close
    backdrop.onclick = closeMenu;

    // Function to update theme colors dynamically
    function updateThemeColors() {
        const lightMode = document.body.classList.contains('light-mode');
        
        // Update backdrop
        backdrop.style.background = lightMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.6)';
        
        // Update menu
        menu.style.background = lightMode ? '#ffffff' : '#000000';
        menu.style.border = `1px solid ${lightMode ? '#e0e3eb' : 'transparent'}`;
        menu.style.boxShadow = lightMode ? '0 8px 32px rgba(0, 0, 0, 0.15)' : '0 16px 48px rgba(0, 0, 0, 0.4)';
        
        // Update header
        header.style.borderBottom = `1px solid ${lightMode ? '#e0e3eb' : '#2a2e39'}`;
        title.style.color = lightMode ? '#131722' : '#d1d4dc';
        
        // Update search
        searchContainer.style.borderBottom = `1px solid ${lightMode ? '#e0e3eb' : '#2a2e39'}`;
        searchWrapper.style.background = lightMode ? '#f0f3fa' : '#2a2e39';
        searchInput.style.color = lightMode ? '#131722' : '#d1d4dc';
        
        // Update sidebar
        sidebar.style.borderRight = `1px solid ${lightMode ? '#e0e3eb' : '#2a2e39'}`;
        
        // Update category buttons
        Object.keys(categoryButtons).forEach(k => {
            if (activeCategory !== k) {
                categoryButtons[k].style.color = lightMode ? '#131722' : '#d1d4dc';
            }
        });
        
        // Update list header
        listHeader.style.borderBottom = `1px solid ${lightMode ? '#e0e3eb' : '#2a2e39'}`;
        
        // Update indicator items
        indicatorItems.forEach(item => {
            item.style.color = lightMode ? '#131722' : '#d1d4dc';
            item.onmouseenter = () => item.style.background = lightMode ? '#f0f3fa' : '#2a2e39';
            item.onmouseleave = () => item.style.background = 'transparent';
        });
        
        // Update close button hover
        closeBtn.onmouseenter = () => { closeBtn.style.background = lightMode ? '#f0f3fa' : '#2a2e39'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; };
    }

    // Visibility observer
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (menu.classList.contains('visible')) {
                    // Update theme colors each time menu opens
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

    // Initial filter
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
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #000000;
        border: 1px solid #363a45;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        min-width: 350px;
        max-width: 450px;
        max-height: 80vh;
        padding: 20px;
        display: flex;
        flex-direction: column;
    `;

    const title = document.createElement('div');
    title.className = 'settings-section-title';
    title.textContent = existingIndicator ? `Edit ${def.name}` : `Add ${def.name}`;
    title.style.flexShrink = '0';
    panel.appendChild(title);

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
    form.style.scrollbarColor = '#363a45 #1e222d';

    const initialParams = existingIndicator ? existingIndicator.params : {};
    const initialStyle = existingIndicator ? existingIndicator.style : {};
    const allParams = { ...initialParams, ...initialStyle };

    const colorControls = [];
    const closeAllPalettes = () => {
        colorControls.forEach(control => control.close());
    };

    def.params.forEach(param => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.alignItems = 'center';
        wrapper.style.padding = '3px 0';

        const label = document.createElement('label');
        label.textContent = param.label;
        label.style.fontSize = '12px';
        label.style.color = '#d1d4dc';
        wrapper.appendChild(label);

        let input;
        const currentValue = allParams[param.id] !== undefined ? allParams[param.id] : param.default;

        if (param.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.value = currentValue;
            input.min = param.min || 1;
            if (param.max) input.max = param.max;
            if (param.step) input.step = param.step;
            input.style.width = '80px';
            input.style.padding = '4px 8px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid #363a45';
            input.style.background = '#000000';
            input.style.color = '#d1d4dc';
            input.style.textAlign = 'right';
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
            input.checked = currentValue !== false;
            input.style.width = '18px';
            input.style.height = '18px';
            input.style.cursor = 'pointer';
            input.style.accentColor = '#2962ff';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        } else if (param.type === 'time') {
            input = document.createElement('input');
            input.type = 'time';
            input.value = currentValue || param.default;
            input.style.width = '90px';
            input.style.padding = '4px 8px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid #363a45';
            input.style.background = '#000000';
            input.style.color = '#d1d4dc';
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
            input.value = currentValue;
            input.style.width = '120px';
            input.style.padding = '4px 8px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid #363a45';
            input.style.background = '#000000';
            input.style.color = '#d1d4dc';
            input.style.textAlign = 'right';
            input.setAttribute('data-param-id', param.id);
            input.setAttribute('data-param-type', param.type);
            wrapper.appendChild(input);
        }
        form.appendChild(wrapper);
    });

    panel.appendChild(form);

    const handleOutsideClick = (event) => {
        if (!panel.contains(event.target)) {
            closeAllPalettes();
        }
    };
    document.addEventListener('click', handleOutsideClick, true);

    // Buttons
    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.display = 'flex';
    buttonWrapper.style.gap = '10px';
    buttonWrapper.style.marginTop = '15px';

    const saveBtn = document.createElement('button');
    saveBtn.style.cssText = `
        background: #2962ff;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    `;
    saveBtn.textContent = existingIndicator ? 'Apply Changes' : 'Add Indicator';
    saveBtn.onmouseenter = () => { saveBtn.style.background = '#1e53e5'; };
    saveBtn.onmouseleave = () => { saveBtn.style.background = '#2962ff'; };
    const closePanel = () => {
        document.removeEventListener('click', handleOutsideClick, true);
        closeAllPalettes();
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

        // Get the chart instance - fallback to global chart if method not available
        let targetChart = chartInstance;
        if (typeof targetChart.addIndicator !== 'function') {
            targetChart = window.chart || window.mainChart;
            console.log('Using fallback chart instance');
        }
        
        if (!targetChart || typeof targetChart.addIndicator !== 'function') {
            console.error('❌ No valid chart instance with addIndicator method found');
            alert('Error: Chart indicator system not loaded. Please refresh the page.');
            closePanel();
            return;
        }

        if (existingIndicator) {
            // Edit existing indicator
            const mergedParams = { ...newParams, ...newStyle };
            if (typeof targetChart.updateIndicator === 'function') {
                targetChart.updateIndicator(existingIndicator.id, mergedParams);
                console.log(`✅ Updated ${existingIndicator.name} on panel ${targetChart.panelIndex || 'main'}`);
            } else if (typeof targetChart.editIndicator === 'function') {
                targetChart.editIndicator(existingIndicator.id, mergedParams);
            }
        } else {
            // Add new indicator
            targetChart.addIndicator(indicatorType, { ...newParams, ...newStyle });
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
    cancelBtn.style.cssText = `
        background: #363a45;
        color: #d1d4dc;
        border: none;
        border-radius: 4px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    `;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onmouseenter = () => { cancelBtn.style.background = '#434651'; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.background = '#363a45'; };
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
        const idSuffix = (this.panelIndex !== undefined) ? this.panelIndex : '';
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
            item.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 6px; margin-right: 8px; border-radius: 3px; transition: background 0.2s;';

            item.onmouseenter = function() {
                item.style.background = 'rgba(120, 123, 134, 0.1)';
            };
            item.onmouseleave = function() {
                item.style.background = 'transparent';
            };

            // Color indicator
            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = 'width: 12px; height: 2px; background: ' + displayColor + '; border-radius: 1px;';
            item.appendChild(colorBox);

            // Name (dimmed when hidden)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            nameSpan.style.cssText = 'color: #787b86; font-size: 11px; font-weight: 500; opacity: ' + (indicator.visible !== false ? '1' : '0.5') + ';';
            item.appendChild(nameSpan);

            const actions = document.createElement('span');
            actions.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;';

            const self = this;
            const id = indicator.id;
            const type = indicator.type;

            // Visibility toggle (eye icon) - for first occurrence
            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';  // SVG eye icons
            visibilityBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border-radius: 3px; cursor: pointer; font-size: 14px; transition: all 0.2s; opacity: ' + (indicator.visible !== false ? '1' : '0.5') + ';';
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            };
            visibilityBtn.onmouseleave = function() {
                visibilityBtn.style.background = 'transparent';
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                // Toggle visibility
                indicator.visible = indicator.visible === false ? true : false;
                
                // Update icon
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                visibilityBtn.style.opacity = indicator.visible ? '1' : '0.5';
                visibilityBtn.title = indicator.visible ? 'Click to hide' : 'Click to show';
                
                // Update name opacity
                nameSpan.style.opacity = indicator.visible ? '1' : '0.5';
                
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
            settingsBtn.textContent = '✎';  // Using pencil symbol instead of gear
            settingsBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border-radius: 3px; cursor: pointer; color: #2962ff; font-size: 14px; transition: all 0.2s;';
            settingsBtn.title = 'Edit settings';
            settingsBtn.onmouseenter = function() {
                settingsBtn.style.color = '#ffffff';
                settingsBtn.style.background = '#2962ff';
            };
            settingsBtn.onmouseleave = function() {
                settingsBtn.style.color = '#2962ff';
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
            removeBtn.style.cssText = 'font-size: 16px; font-weight: bold; color: #787b86; cursor: pointer; padding: 0 2px; transition: all 0.2s;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.color = '#f23645';
                removeBtn.style.transform = 'scale(1.2)';
            };
            removeBtn.onmouseleave = function() {
                removeBtn.style.color = '#787b86';
                removeBtn.style.transform = 'scale(1)';
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

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Apply to main chart if it exists
        if (window.chart) {
            console.log('🎨 Setting up indicator UI for main chart');
            setupIndicatorUI(window.chart);
        }
        if (window.mainChart) {
            console.log('🎨 Setting up indicator UI for mainChart');
            setupIndicatorUI(window.mainChart);
        }
    });
} else {
    // DOM already loaded
    if (window.chart) {
        console.log('🎨 Setting up indicator UI for main chart');
        setupIndicatorUI(window.chart);
    }
    if (window.mainChart) {
        console.log('🎨 Setting up indicator UI for mainChart');
        setupIndicatorUI(window.mainChart);
    }
}

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
        const idSuffix = (this.panelIndex !== undefined) ? this.panelIndex : '';
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
            item.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 6px; margin-right: 8px; border-radius: 3px; transition: background 0.2s;';

            item.onmouseenter = function() {
                item.style.background = 'rgba(120, 123, 134, 0.1)';
            };
            item.onmouseleave = function() {
                item.style.background = 'transparent';
            };

            // Color indicator
            const colorBox = document.createElement('span');
            const displayColor = indicator.style.color || indicator.style.middleColor || '#2962ff';
            colorBox.style.cssText = 'width: 12px; height: 2px; background: ' + displayColor + '; border-radius: 1px;';
            item.appendChild(colorBox);

            // Name (dimmed when hidden)
            const nameSpan = document.createElement('span');
            nameSpan.textContent = indicator.name;
            nameSpan.style.cssText = 'color: #787b86; font-size: 11px; font-weight: 500; opacity: ' + (indicator.visible !== false ? '1' : '0.5') + ';';
            item.appendChild(nameSpan);

            const actions = document.createElement('span');
            actions.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;';

            const self = this;
            const id = indicator.id;
            const type = indicator.type;

            // Visibility toggle (eye icon)
            const visibilityBtn = document.createElement('span');
            visibilityBtn.innerHTML = indicator.visible !== false ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';  // SVG eye icons
            visibilityBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border-radius: 3px; cursor: pointer; font-size: 14px; transition: all 0.2s; opacity: ' + (indicator.visible !== false ? '1' : '0.5') + ';';
            visibilityBtn.title = indicator.visible !== false ? 'Click to hide' : 'Click to show';
            visibilityBtn.onmouseenter = function() {
                visibilityBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            };
            visibilityBtn.onmouseleave = function() {
                visibilityBtn.style.background = 'transparent';
            };
            visibilityBtn.onclick = function(e) {
                e.stopPropagation();
                // Toggle visibility
                indicator.visible = indicator.visible === false ? true : false;
                
                // Update icon
                visibilityBtn.innerHTML = indicator.visible ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                visibilityBtn.style.opacity = indicator.visible ? '1' : '0.5';
                visibilityBtn.title = indicator.visible ? 'Click to hide' : 'Click to show';
                
                // Update name opacity
                nameSpan.style.opacity = indicator.visible ? '1' : '0.5';
                
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
            settingsBtn.textContent = '✎';  // Using pencil symbol
            settingsBtn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border-radius: 3px; cursor: pointer; color: #2962ff; font-size: 14px; transition: all 0.2s;';
            settingsBtn.title = 'Edit settings';
            settingsBtn.onmouseenter = function() {
                settingsBtn.style.color = '#ffffff';
                settingsBtn.style.background = '#2962ff';
            };
            settingsBtn.onmouseleave = function() {
                settingsBtn.style.color = '#2962ff';
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
            removeBtn.style.cssText = 'font-size: 16px; font-weight: bold; color: #787b86; cursor: pointer; padding: 0 2px; transition: all 0.2s;';
            removeBtn.title = 'Remove indicator';
            removeBtn.onmouseenter = function() {
                removeBtn.style.color = '#f23645';
                removeBtn.style.transform = 'scale(1.2)';
            };
            removeBtn.onmouseleave = function() {
                removeBtn.style.color = '#787b86';
                removeBtn.style.transform = 'scale(1)';
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
