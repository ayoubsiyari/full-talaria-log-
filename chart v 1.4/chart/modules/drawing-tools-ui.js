/**
 * Drawing Tools - UI Module
 * Implements: Settings Panel, Toolbar, Context Menu, Text Editor
 */

// ============================================================================
// Shared Color Palette Utilities
// ============================================================================

const DRAWING_COLOR_UTILS = (() => {
    const ROWS = [
        ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'],
        ['#FF4444', '#FF9500', '#FFEB3B', '#4CAF50', '#00BCD4', '#00E5FF', '#787b86', '#7B68EE', '#E040FB', '#FF4081'],
        ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#B2F5FF', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
        ['#FFAB91', '#FFCC80', '#FFF59D', '#A5D6A7', '#80DEEA', '#80E5FF', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'],
        ['#FF8A65', '#FFB74D', '#FFF176', '#81C784', '#4DD0E1', '#4DD5FF', '#64B5F6', '#9575CD', '#BA68C8', '#F06292'],
        ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#26C6DA', '#26D4FF', '#42A5F5', '#7E57C2', '#AB47BC', '#EC407A'],
        ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#00B8D4', '#1E88E5', '#5E35B1', '#8E24AA', '#D81B60'],
        ['#C62828', '#E65100', '#F57F17', '#2E7D32', '#00838F', '#00838F', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457']
    ];

    const RECENTS = ['#131722', '#787b86', '#1E3A5F', '#262B3E'];

    const clampOpacity = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isNaN(num)) return 1;
        return Math.min(1, Math.max(0, num));
    };

    const rgbToHex = (r, g, b) => {
        const toHex = (v) => {
            const val = Math.max(0, Math.min(255, parseInt(v, 10) || 0));
            return val.toString(16).padStart(2, '0');
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    };

    const normalizeHex = (color) => {
        if (!color) return '#787b86';
        if (color === 'none') return '#787b86';
        if (color.startsWith('rgba') || color.startsWith('rgb')) {
            const match = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (match) {
                return rgbToHex(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
            }
            return '#787b86';
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

        return '#787b86';
    };

    const hexToRgb = (hex) => {
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
    };

    const applyOpacityToColor = (baseColor, opacity) => {
        const clamped = clampOpacity(opacity);
        const normalized = normalizeHex(baseColor);
        if (clamped >= 0.995) {
            return normalized;
        }
        const { r, g, b } = hexToRgb(normalized);
        return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(2)})`;
    };

    const parseColorValue = (value) => {
        if (!value || value === 'none') {
            return { baseColor: '#787b86', opacity: value === 'none' ? 0 : 1 };
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

        return { baseColor: '#787b86', opacity: 1 };
    };

    return {
        ROWS,
        RECENTS,
        clampOpacity,
        normalizeHex,
        hexToRgb,
        applyOpacityToColor,
        parseColorValue
    };
})();

// ============================================================================
// Drawing Settings Panel
// ============================================================================
class DrawingSettingsPanel {
    constructor() {
        this.panel = null;
        this.currentDrawing = null;
        this.onSave = null;
        this.onDelete = null;
        this.colorControls = [];
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.tabsStylesInjected = false;
        this.baseStylesInjected = false;
        this.tvStylesInjected = false;
        this.panelContent = null;
        this.pendingChanges = {};
        this.toolbarManager = null;
        this.textFallbacks = {
            fontSize: 14,
            textPosition: 'middle',
            textAlign: 'center',
            textOffsetX: 0,
            textOffsetY: 0,
            textColor: '#FFFFFF'
        };
        // Timeframe visibility defaults
        this.defaultTimeframes = [
            { key: '1m', label: '1 minute', checked: true },
            { key: '5m', label: '5 minutes', checked: true },
            { key: '15m', label: '15 minutes', checked: true },
            { key: '30m', label: '30 minutes', checked: true },
            { key: '1h', label: '1 hour', checked: true },
            { key: '4h', label: '4 hours', checked: true },
            { key: '1d', label: '1 day', checked: true },
            { key: '1w', label: '1 week', checked: true },
            { key: '1M', label: '1 month', checked: true }
        ];
    }

    /**
     * Inject TradingView-style modal CSS
     */
    ensureTVStyles() {
        if (this.tvStylesInjected) return;

        const style = document.getElementById('tv-settings-styles') || document.createElement('style');
        style.id = 'tv-settings-styles';
        style.textContent = `
/* TradingView-style Settings Modal */
.tv-settings-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: auto;
    min-width: 420px;
    max-width: 92vw;
    max-height: 90vh;
    background: #050028;
    border: 1px solid rgba(60, 60, 72, 0.95);
    border-radius: 14px;
    box-shadow: 0 22px 65px rgba(0, 0, 0, 0.65);
    z-index: 12000;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 12px;
    color: #d1d4dc;
}

.tv-settings-modal.compact {
    width: auto;
}

.tv-settings-modal * {
    box-sizing: border-box;
}

/* Header */
.tv-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: none;
}

.tv-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tv-footer-left,
.tv-footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.tv-btn-template {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    color: #d1d4dc;
}

.tv-btn-template:hover {
    background: rgba(255,255,255,0.09);
}

.tv-settings-body {
    display: flex;
    flex: 1;
    min-height: 0;
}

.tv-modal-title {
    font-size: 19px;
    font-weight: 600;
    color: #d1d4dc;
    margin: 0;
}

.tv-modal-close {
    background: none;
    border: none;
    color: #8a909f;
    font-size: 16px;
    cursor: default;
    padding: 2px 3px;
    border-radius: 4px;
    line-height: 1;
    transition: all 0.15s ease;
}

.tv-modal-close:hover {
    background: rgba(41, 98, 255, 0.15);
    color: #ffffff;
}

/* Tab Header */
.tv-tab-header {
    display: flex;
    padding: 3px 10px;
    background: rgba(255,255,255,0.05);
    border-radius: 6px;
    margin: 8px 12px 0;
}

.tv-tab-btn {
    flex: 1;
    padding: 8px 18px;
    border: 1px solid transparent;
    background: transparent;
    color: #787b86;
    font-size: 13px;
    font-weight: 500;
    cursor: default;
    border-radius: 8px;
    transition: all 0.15s;
    text-transform: none;
    letter-spacing: 0;
}

.tv-tab-btn:hover {
    color: #d1d4dc;
    background: rgba(255,255,255,0.06);
}

.tv-tab-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.55), rgba(41, 98, 255, 0.30));
    color: #fff;
    box-shadow: 0 6px 16px rgba(41, 98, 255, 0.18);
}

/* Tab Content */
.tv-tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: visible;
    padding: 15px;
    max-height: 78vh;
}

/* Hide scrollbar but allow scrolling when needed */
.tv-tab-content::-webkit-scrollbar {
    width: 0px;
    display: none;
}

.tv-tab-content::-webkit-scrollbar-track {
    background: transparent;
}

.tv-tab-content::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
}

.tv-tab-content::-webkit-scrollbar-thumb:hover {
    background: transparent;
}

 .tv-settings-modal,
 .tv-settings-modal * {
     scrollbar-width: none;
     -ms-overflow-style: none;
 }

 .tv-settings-modal::-webkit-scrollbar,
 .tv-settings-modal *::-webkit-scrollbar {
     width: 0px;
     height: 0px;
     display: none;
 }

.tv-tab-pane {
    display: none;
}

.tv-tab-pane.active {
    display: block;
}

/* Description Input */
.tv-description-row {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    gap: 15px;
}

.tv-description-label {
    color: #d1d4dc;
    font-size: 11px;
    min-width: 75px;
}

.tv-description-input {
    flex: 1;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(50, 50, 60, 0.9);
    border-radius: 4px;
    padding: 8px 10px;
    color: #d1d4dc;
    font-size: 11px;
    outline: none;
    transition: border-color 0.15s;
}

.tv-description-input:focus {
    border-color: #2962ff;
}

.tv-description-input::placeholder {
    color: #787b86;
}

/* Property Row with Checkbox */
.tv-prop-row {
    display: grid;
    grid-template-columns: 90px auto;
    align-items: center;
    padding: 9px 0;
    column-gap: 9px;
}

.tv-prop-row:last-child {
    border-bottom: none;
}

.tv-checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 105px;
}

.tv-checkbox {
    width: 16px;
    height: 16px;
    border: 2px solid #363a45;
    border-radius: 3px;
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    background: transparent;
}

.tv-checkbox.checked {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
}

.tv-checkbox.checked:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    border-color: rgba(41, 98, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

.tv-checkbox svg {
    width: 11px;
    height: 11px;
    stroke: #fff;
    opacity: 0;
    transition: opacity 0.15s;
}

.tv-checkbox.checked svg {
    opacity: 1;
}

.tv-checkbox-label {
    color: #d1d4dc;
    font-size: 11px;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
}

.tv-prop-label {
    color: #d1d4dc;
    font-size: 11px;
    cursor: default;
    user-select: none;
}

/* Controls Header */
.tv-controls-header {
    display: grid;
    grid-template-columns: 90px auto;
    gap: 9px;
    color: #787b86;
    font-size: 10px;
    align-items: center;
    margin-bottom: 6px;
}

.tv-controls-header-labels {
    display: flex;
    gap: 38px;
    align-items: center;
    
}

.tv-controls-header-labels span {
    text-align: center;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    min-width: 23px;
    max-width: 23px;
    flex-shrink: 0;
}

/* Property Controls */
.tv-prop-controls {
    display: flex;
    gap: 9px;
    align-items: center;
}

/* Color Swatch Button */
.tv-color-btn {
    width: 30px;
    height: 30px;
    border-radius: 4px;
    border: 2px solid rgba(50, 50, 60, 0.9);
    cursor: default;
    box-sizing: border-box;
    transition: border-color 0.15s ease, transform 0.15s ease;
}

.tv-color-btn:hover {
    border-color: #838fb1ff;
    transform: scale(1.05);
}

.tv-color-btn:active {
    transform: scale(0.98);
}

.tv-color-btn:focus {
    outline: none;
    border-color: #2962ff;
}

/* Alignment Buttons */
.tv-align-btn {
    width: 21px;
    height: 21px;
    border: 1px solid rgba(50, 50, 60, 0.9);
    background: rgba(255,255,255,0.05);
    color: #787b86;
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.tv-align-btn:hover {
    background: linear-gradient(180deg, #6c6d71ff 0%, #6e7074ff 50%);
    border-color: rgba(90, 90, 100, 0.9);
}

.tv-align-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
    color: #ffffff;
}

.tv-align-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

/* Ending/Info dropdown buttons */
.tv-ending-dropdown-btn,
.tv-info-dropdown-btn {
    -webkit-appearance: none !important;
    appearance: none !important;
    background-color: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 4px !important;
    color: #d1d4dc !important;
}

.tv-ending-dropdown-btn:hover,
.tv-info-dropdown-btn:hover {
    background-color: rgba(255, 255, 255, 0.14) !important;
    border-color: rgba(41, 98, 255, 0.65) !important;
}

/* Dropdown Select */
.tv-select {
    background-color: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    padding: 5px 21px 5px 8px;
    color: #d1d4dc;
    font-size: 11px;
    cursor: default;
    appearance: none;
    min-width: 60px;
    height: 30px;
    box-sizing: border-box;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23787b86' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    background-size: 8px, 100%;
    transition: all 0.15s ease;
    text-align: center;
    color-scheme: dark;
}

.tv-select:hover {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%23787b86' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    background-color: rgba(41, 98, 255, 0.14);
    background-size: 8px, 100%;
    border-color: rgba(41, 98, 255, 0.65);
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.14);
}

.tv-select:focus {
    outline: none;
    border-color: #2962ff;
}

.tv-select option {
    background: #1e222d !important; /* native dropdown list must use hex */
    color: #d1d4dc;
}

/* Number Input */
.tv-input {
    background-color: rgba(255, 255, 255, 0.08) !important;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    padding: 6px 9px;
    color: #d1d4dc;
    font-size: 11px;
    text-align: right;
    height: 27px;
    box-sizing: border-box;
    transition: all 0.15s ease;
}

.tv-input:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(90, 90, 100, 0.9);
}

.tv-input:focus {
    outline: none;
    border-color: #2962ff;
}

/* Toggle Switch */
.tv-toggle {
    width: 33px;
    height: 18px;
    background: #363a45;
    border-radius: 9px;
    cursor: default;
    position: relative;
    transition: background 0.2s;
}

.tv-toggle:hover {
    background: #4a4e59;
}

.tv-toggle.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
}

.tv-toggle.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

.tv-toggle::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
}

.tv-toggle.active::after {
    transform: translateX(15px);
}

/* Ending Dropdown Buttons */
.tv-ending-dropdown-btn {
    transition: all 0.15s ease;
}

.tv-ending-dropdown-btn:hover {
    background: rgba(255,255,255,0.08) !important;
    border-color: rgba(90, 90, 100, 0.9) !important;
}

.tv-ending-dropdown-btn:active {
    transform: scale(0.98);
}

/* Ending Dropdown Options */
.tv-ending-option {
    transition: all 0.15s ease;
}

.tv-ending-option:hover {
    background: rgba(41, 98, 255, 0.15) !important;
}

.tv-ending-option:active {
    background: rgba(41, 98, 255, 0.25) !important;
}

/* Extend Options */
.tv-extend-row {
    display: flex;
    align-items: center;
    padding: 9px 0;
}

/* Text Tab Styles */
.tv-text-settings {
    margin-bottom: 12px;
}

.tv-text-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
}

.tv-text-input {
    width: 100%;
    min-height: 45px;
    max-height: 60px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(60,60,80,0.5);
    border-radius: 4px;
    padding: 9px;
    color: #d1d4dc;
    font-size: 11px;
    resize: none;
    outline: none;
    margin: 9px 0;
}

.tv-text-input:focus {
    border-color: #2962ff;
}

/* Alignment Buttons */
.tv-align-section {
    margin-top: 9px;
}

.tv-align-label {
    color: #787b86;
    font-size: 10px;
    font-style: italic;
    margin-bottom: 6px;
}

.tv-align-buttons {
    display: flex;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 3px;
    gap: 6px;
    overflow: visible;
}

.tv-align-btn {
    flex: 1;
    padding: 8px;
    border: none;
    background: transparent;
    color: #787b86;
    cursor: default;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
}

.tv-align-btn:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(90, 90, 100, 0.9);
    color: #d1d4dc;
}

.tv-align-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45)) !important;
    color: #fff !important;
    border: none !important;
    opacity: 1 !important;
    filter: none !important;
    position: relative;
    z-index: 1;
}

.tv-align-btn.active svg {
    stroke: #fff !important;
}

.tv-align-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55)) !important;
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

.tv-align-btn svg {
    width: 14px;
    height: 14px;
}

/* Style Button (Italic/Bold) */
.tv-style-btn {
    width: 24px;
    height: 24px;
    border: 1px solid #363a45;
    border-radius: 4px;
    background: transparent;
    color: #787b86;
    font-size: 11px;
    font-weight: normal;
    font-style: normal;
    cursor: default;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.tv-style-btn i,
.tv-style-btn b {
    font-size: 11px;
}

.tv-style-btn:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(90, 90, 100, 0.9);
    color: #d1d4dc;
}

.tv-style-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
    color: #fff;
}

.tv-style-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

.tv-coords-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 0;
}

.tv-coords-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
}

.tv-coords-label {
    color: rgba(209, 212, 220, 0.95);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.01em;
}

.tv-coords-controls {
    display: flex;
    align-items: center;
    gap: 14px;
}

.tv-coords-number-wrap {
    position: relative;
    display: inline-flex;
}

.tv-coords-number-wrap .tv-coords-input {
    padding-right: 30px;
}

.tv-coords-stepper {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 22px;
    height: calc(100% - 10px);
    background: transparent;
    border: none;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
}

.tv-coords-stepper-btn {
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    outline: none;
    background: transparent;
    color: #d1d4dc;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}

.tv-coords-stepper-btn:hover {
    background: transparent;
    color: #ffffff;
}

.tv-coords-stepper-btn:active {
    background: transparent;
    color: #ffffff;
}

.tv-coords-stepper-btn svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
}

.tv-coords-input {
    width: 140px;
    height: 30px;
    border: 2px solid rgba(120, 123, 134, 0.55);
    border-radius: 10px;
    background: rgba(0,0,0,0.65);
    color: #d1d4dc;
    padding: 0 10px;
    font-size: 12px;
    outline: none;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
}

.tv-coords-input[type="number"] {
    color-scheme: dark;
}

.tv-coords-input[type="number"]::-webkit-inner-spin-button,
.tv-coords-input[type="number"]::-webkit-outer-spin-button {
    filter: invert(1);
    opacity: 0.85;
}

.tv-coords-input:focus {
    border-color: rgba(41,98,255,0.9);
    box-shadow: 0 0 0 4px rgba(41,98,255,0.22);
}

/* Line Ending Button */
.tv-ending-btn {
    border: 1px solid rgba(50, 50, 60, 0.9);
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    color: #787b86;
    cursor: default;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.tv-ending-btn:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(90, 90, 100, 0.9);
    color: #d1d4dc;
}

.tv-ending-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
    color: #fff;
}

.tv-ending-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

/* Timeframes Tab */
.tv-timeframe-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tv-timeframe-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 0;
}

.tv-timeframe-range-row {
    display: grid;
    grid-template-columns: 26px 1fr 56px 90px 56px;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
}

.tv-timeframe-range-label {
    color: #d1d4dc;
    font-size: 14px;
}

.tv-timeframe-range-input {
    height: 34px;
    border: 2px solid rgba(120, 123, 134, 0.55);
    border-radius: 10px;
    background: rgba(0,0,0,0.65);
    color: #d1d4dc;
    padding: 0 12px;
    font-size: 13px;
    outline: none;
    text-align: left;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35);
}

.tv-timeframe-range-input:focus {
    border-color: rgba(41,98,255,0.9);
    box-shadow: 0 0 0 4px rgba(41,98,255,0.22);
}

.tv-timeframe-slider {
    position: relative;
    height: 14px;
    display: flex;
    align-items: center;
    padding: 0;
    border-radius: 999px;
    background: transparent;
}

.tv-timeframe-slider::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    border-radius: 999px;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(to right,
        rgba(255,255,255,0.15) 0%,
        rgba(255,255,255,0.15) var(--min-pct, 0%),
        rgba(255,255,255,0.85) var(--min-pct, 0%),
        rgba(255,255,255,0.85) var(--max-pct, 100%),
        rgba(255,255,255,0.15) var(--max-pct, 100%),
        rgba(255,255,255,0.15) 100%
    );
}

.tv-timeframe-slider input[type="range"] {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: transparent;
    pointer-events: none;
    -webkit-appearance: none;
    z-index: 2;
}

.tv-timeframe-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #000;
    border: 2px solid #fff;
    pointer-events: all;
    cursor: pointer;
    margin-top: -2px;
}

.tv-timeframe-slider input[type="range"]::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #000;
    border: 2px solid #fff;
    pointer-events: all;
    cursor: pointer;
}

.tv-timeframe-slider input[type="range"]::-webkit-slider-runnable-track {
    -webkit-appearance: none;
    height: 6px;
    background: transparent;
}

.tv-timeframe-slider input[type="range"]::-moz-range-track {
    height: 6px;
    background: transparent;
}

/* Footer */
.tv-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 15px;
    border-top: 1px solid #2a2e39;
}

.tv-footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.tv-template-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #0a0a0a !important;
    border: 1px solid #1a1a1a !important;
    border-radius: 8px;
    color: #d1d4dc;
    font-size: 13px;
    font-weight: 500;
    cursor: default;
    transition: all 0.15s;
}

.tv-template-btn:hover {
    background: #1a1c20 !important;
    border-color: #363a45 !important;
}

.tv-template-btn svg {
    width: 9px;
    height: 9px;
}

/* Dark mode button styling with !important to override inline styles */
.tv-ending-dropdown-btn {
    background: #000000 !important;
    border: 1px solid #2a2e39 !important;
}

.tv-ending-dropdown-btn:hover {
    background: #1a1c20 !important;
    border-color: #363a45 !important;
}

.tv-info-dropdown-btn {
    background: #000000 !important;
    border: 1px solid #2a2e39 !important;
}

.tv-info-dropdown-btn:hover {
    background: #1a1c20 !important;
    border-color: #363a45 !important;
}

.tv-footer-actions {
    display: flex;
    gap: 9px;
}

.tv-btn {
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: default;
    transition: all 0.15s;
}

.tv-btn-cancel {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    color: #d1d4dc;
    margin-right: 8px;
    transition: all 0.15s ease;
}

.tv-btn-cancel:hover {
    background: rgba(255,255,255,0.09);
    color: #d1d4dc;
}

.tv-btn-apply {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border: 1px solid rgba(41, 98, 255, 0.85);
    color: #fff;
}

.tv-btn-apply:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

/* Line Style Preview in Dropdown */
.tv-line-preview {
    display: flex;
    align-items: center;
    gap: 6px;
}

.tv-line-preview svg {
    width: 30px;
    height: 2px;
}

/* Color Picker Popup */
.tv-color-picker {
    position: fixed;
    background: #050028;
    border: 1px solid #2a2e39;
    border-radius: 6px;
    padding: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 13000;
    display: none;
}

.tv-color-picker.active {
    display: block;
}

.tv-color-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 3px;
}

.tv-color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    cursor: default;
    transition: transform 0.15s;
}

.tv-color-swatch:hover {
    transform: scale(1.1);
    border-color: #fff;
}

.tv-color-swatch.selected {
    border-color: #fff;
}

/* Info Checkboxes */
.tv-info-checkbox {
    width: 18px;
    height: 18px;
    cursor: default;
    accent-color: #2962ff;
    flex-shrink: 0;
}

.tv-info-option {
    transition: background 0.15s ease;
    border-radius: 4px;
}

.tv-info-option:hover {
    background: rgba(41, 98, 255, 0.1);
}

.tv-info-dropdown-btn {
    transition: all 0.15s ease;
}

.tv-info-dropdown-btn:hover {
    background: rgba(255,255,255,0.08) !important;
    border-color: rgba(90, 90, 100, 0.9) !important;
}

/* Opacity Slider */
.tv-opacity-section {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #363a45;
}

.tv-opacity-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.tv-opacity-label {
    color: #787b86;
    font-size: 12px;
    min-width: 50px;
}

.tv-opacity-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right, transparent, #2962ff);
    border-radius: 2px;
    cursor: default;
}

.tv-opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    cursor: default;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.tv-opacity-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    cursor: default;
    border: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.tv-opacity-input {
    width: 50px;
    background: #1e222d;
    border: 1px solid #363a45;
    border-radius: 4px;
    padding: 4px 6px;
    color: #d1d4dc;
    font-size: 12px;
    text-align: center;
}

.tv-opacity-input::-webkit-inner-spin-button,
.tv-opacity-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.tv-opacity-input[type=number] {
    -moz-appearance: textfield;
}

.tv-opacity-percent {
    color: #787b86;
    font-size: 12px;
}

/* ============ LIGHT MODE STYLES ============ */
body.light-mode .tv-settings-modal {
    background: #ffffff;
    border-color: #e0e3eb;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

body.light-mode .tv-modal-header {
    border-bottom: none;
}

body.light-mode .tv-modal-title {
    color: #131722;
}

body.light-mode .tv-modal-close {
    color: #787b86;
}

body.light-mode .tv-modal-close:hover {
    color: #131722;
    background: #f0f3fa;
}

body.light-mode .tv-tab-header {
    background: #e0e3eb;
}

body.light-mode .tv-tab-btn {
    background: transparent;
    border-color: transparent;
    color: #131722;
}

body.light-mode .tv-tab-btn:hover {
    background: #d1d4dc;
}

body.light-mode .tv-tab-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
    color: #fff;
}

body.light-mode .tv-tab-content {
    background: #ffffff;
}

body.light-mode .tv-tab-content::-webkit-scrollbar-thumb {
    background: transparent;
}

body.light-mode .tv-tab-content::-webkit-scrollbar-thumb:hover {
    background: transparent;
}

body.light-mode .tv-description-input,
body.light-mode .tv-text-input {
    background: #f0f3fa;
    border-color: #e0e3eb;
    color: #131722;
}

body.light-mode .tv-description-input::placeholder,
body.light-mode .tv-text-input::placeholder {
    color: #787b86;
}

body.light-mode .tv-checkbox-label,
body.light-mode .tv-align-label {
    color: #131722;
}

body.light-mode .tv-checkbox {
    border-color: #d1d4dc;
    background: #f0f3fa;
}

body.light-mode .tv-checkbox.checked {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
}

body.light-mode .tv-select {
    background: #ffffff;
    border: 1px solid #e0e3eb;
    color: #131722;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23131722' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 10px;
    color-scheme: light;
}

body.light-mode .tv-select:hover {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23131722' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-color: rgba(41, 98, 255, 0.10);
    background-size: 10px;
    border-color: rgba(41, 98, 255, 0.55);
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.12);
}

body.light-mode .tv-color-btn {
    border-color: #d1d4dc;
}

body.light-mode .tv-color-btn:hover {
    border-color: #b2b5be;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.08);
}

body.light-mode .tv-checkbox:hover {
    border-color: #b2b5be;
    background: #e8ebf0;
}

body.light-mode .tv-checkbox.checked:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    border-color: rgba(41, 98, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

body.light-mode .tv-style-btn {
    border-color: #d1d4dc;
    color: #787b86;
    background: #f0f3fa;
}

body.light-mode .tv-style-btn:hover {
    border-color: #b2b5be;
    background: #e8ebf0;
    color: #131722;
}

body.light-mode .tv-style-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border-color: rgba(41, 98, 255, 0.85);
    color: #fff;
}

body.light-mode .tv-coords-input {
    background: #ffffff;
    border-color: #b2b5be;
    color: #131722;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6);
}

body.light-mode .tv-coords-input[type="number"] {
    color-scheme: light;
}

body.light-mode .tv-coords-input[type="number"]::-webkit-inner-spin-button,
body.light-mode .tv-coords-input[type="number"]::-webkit-outer-spin-button {
    filter: none;
    opacity: 1;
}

body.light-mode .tv-align-btn {
    background: #ffffff;
    border: 1px solid #e0e3eb;
    color: #787b86;
}

body.light-mode .tv-align-btn:hover {
    background: #f5f5f5;
    border-color: #d1d4dc;
    color: #131722;
}

body.light-mode .tv-align-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55)) !important;
    border: none;
    color: #fff !important;
    opacity: 1 !important;
    filter: none !important;
}

body.light-mode .tv-align-btn.active svg {
    stroke: #fff !important;
}

body.light-mode .tv-align-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.92), rgba(41, 98, 255, 0.62)) !important;
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
}

body.light-mode .tv-align-buttons {
    background: #e0e3eb;
}

body.light-mode .tv-ending-btn {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
    color: #787b86 !important;
}

body.light-mode .tv-ending-btn:hover {
    background: #f5f5f5 !important;
    border-color: #d1d4dc !important;
    color: #131722 !important;
}

body.light-mode .tv-btn-apply {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
    border: 1px solid rgba(41, 98, 255, 0.85);
    color: #fff;
}

body.light-mode .tv-btn-apply:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55));
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16);
    color: #fff;
}

body.light-mode .tv-ending-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45)) !important;
    border-color: rgba(41, 98, 255, 0.85) !important;
    color: #fff !important;
}

body.light-mode .tv-ending-dropdown-btn {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
}

body.light-mode .tv-ending-dropdown-btn:hover {
    background: #f5f5f5 !important;
    border-color: #d1d4dc !important;
}

body.light-mode .tv-ending-dropdown-btn svg line,
body.light-mode .tv-ending-dropdown-btn svg path,
body.light-mode .tv-ending-dropdown-btn svg circle {
    stroke: #131722 !important;
}

body.light-mode .tv-ending-dropdown-btn svg path[fill] {
    fill: #131722 !important;
}

body.light-mode .tv-ending-dropdown-menu {
    background: #ffffff !important;
    border-color: #e0e3eb !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
}

body.light-mode .tv-ending-option {
    border-color: #e0e3eb !important;
}

body.light-mode .tv-ending-option span {
    color: #131722 !important;
}

body.light-mode .tv-ending-option svg line,
body.light-mode .tv-ending-option svg path,
body.light-mode .tv-ending-option svg circle {
    stroke: #131722 !important;
    fill: #131722 !important;
}

body.light-mode .tv-ending-option svg path[fill] {
    fill: #131722 !important;
}

body.light-mode .tv-ending-option:hover {
    background: rgba(41, 98, 255, 0.1) !important;
}

body.light-mode .tv-info-dropdown-btn {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
    color: #131722 !important;
}

body.light-mode .tv-info-dropdown-btn:hover {
    background: #f5f5f5 !important;
    border-color: #d1d4dc !important;
}

body.light-mode .tv-info-dropdown-btn svg {
    stroke: #131722 !important;
}

body.light-mode .tv-info-dropdown-menu {
    background: #ffffff !important;
    border-color: #e0e3eb !important;
}

body.light-mode .tv-info-option {
    color: #131722 !important;
}

body.light-mode .tv-info-option span {
    color: #131722 !important;
}

body.light-mode .tv-info-option:hover {
    background: rgba(41, 98, 255, 0.1) !important;
}

body.light-mode .tv-modal-footer {
    border-top-color: #e0e3eb;
}

body.light-mode .tv-template-btn {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
    color: #131722;
}

body.light-mode .tv-template-btn:hover {
    background: #f5f5f5 !important;
    border-color: #d1d4dc !important;
}

body.light-mode .tv-btn-cancel {
    background: #e8e8e8;
    border: 1px solid #e8e8e8;
    color: #5a5a5a;
    box-shadow: 3px 3px 6px #c5c5c5, -3px -3px 6px #ffffff;
}

body.light-mode .tv-btn-cancel:hover {
    background: #f0f0f0;
    color: #333333;
}

body.light-mode .tv-btn-cancel:active {
    box-shadow: inset 2px 2px 4px #c5c5c5, inset -2px -2px 4px #ffffff;
}

body.light-mode .tv-color-picker {
    background: #ffffff;
    border-color: #e0e3eb;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

body.light-mode .tv-opacity-label {
    color: #131722;
}

body.light-mode .tv-opacity-input {
    background: #f0f3fa;
    border-color: #e0e3eb;
    color: #131722;
}

body.light-mode .tv-opacity-percent {
    color: #787b86;
}

body.light-mode .tv-extend-section {
    border-top-color: #e0e3eb;
}

body.light-mode .tv-timeframe-item {
    color: #131722;
}

body.light-mode .tv-prop-row {
    border-bottom-color: #e0e3eb;
}

body.light-mode .tv-description-label {
    color: #787b86;
}

body.light-mode .tv-prop-header {
    color: #787b86;
}

body.light-mode .tv-select option {
    background: #ffffff;
    color: #131722;
}

body.light-mode .tv-input {
    background: #ffffff;
    border: 1px solid #e0e3eb;
    color: #131722;
}

body.light-mode .tv-input:hover {
    background: #f5f5f5;
    border-color: #d1d4dc;
}

body.light-mode .settings-template-dropdown {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
}

body.light-mode .settings-template-dropdown .template-dropdown-item {
    color: #131722 !important;
}

body.light-mode .settings-template-dropdown .template-dropdown-item:hover {
    background: #f5f5f5 !important;
}

body.light-mode .settings-info-dropdown {
    background: #ffffff !important;
    border: 1px solid #e0e3eb !important;
}

body.light-mode .settings-info-dropdown .tv-info-option {
    color: #131722 !important;
}

body.light-mode .settings-info-dropdown .tv-info-option:hover {
    background: #f5f5f5 !important;
}

body.light-mode .settings-info-dropdown .tv-info-option span {
    color: #131722 !important;
}

body.light-mode .tv-line-type-select {
    background: #f0f3fa;
    border-color: #e0e3eb;
    color: #131722;
}

body.light-mode .tv-line-type-select:hover {
    border-color: #d1d4dc;
}

/* Side tab header container */
.tv-side-tab-header {
    margin-left: 12px !important;
    gap: 8px !important;
}

/* Side Tab Buttons - Clean Minimal Style */
.tv-side-tab-btn {
    position: relative;
    border: none;
    background: transparent;
    padding: 0;
    outline: none;
    cursor: default;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    writing-mode: vertical-rl;
    text-orientation: mixed;
}

.tv-side-tab-btn .shadow,
.tv-side-tab-btn .edge {
    display: none;
}

.tv-side-tab-btn .front {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 10px;
    min-height: 75px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #787b86;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: default;
    transition: color 0.15s ease, background 0.15s ease;
    user-select: none;
    transform: rotate(180deg);
}

.tv-side-tab-btn:hover .front {
    color: #d1d4dc;
    background: rgba(255, 255, 255, 0.06);
}

.tv-side-tab-btn.active .front {
    color: #2962ff;
    background: rgba(41, 98, 255, 0.12);
}

.tv-side-tab-btn.active:hover .front {
    background: rgba(41, 98, 255, 0.16);
}

/* Light mode */
body.light-mode .tv-side-tab-btn .front {
    color: #787b86;
    background: transparent;
}

body.light-mode .tv-side-tab-btn:hover .front {
    color: #131722;
    background: rgba(0, 0, 0, 0.04);
}

body.light-mode .tv-side-tab-btn.active .front {
    color: #2962ff;
    background: rgba(41, 98, 255, 0.08);
}

body.light-mode .tv-side-tab-btn.active:hover .front {
    background: rgba(41, 98, 255, 0.12);
}

/* Collapsible Vertical Tabs (left rail) */
.tv-collapsible-tabs-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.tv-collapsible-tabs-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    border-right: 1px solid rgba(255,255,255,0.06);
    align-items: center;
}

.tv-collapsible-tabs-top {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 3px solid rgba(255,255,255,0.18);
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn {
    width: auto;
    height: 28px;
    padding: 0 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    justify-content: center;
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn:hover {
    border-color: rgba(41, 98, 255, 0.9);
    background: rgba(41, 98, 255, 0.18) !important;
    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.14);
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.55), rgba(41, 98, 255, 0.30)) !important;
    border-color: rgba(41, 98, 255, 0.9) !important;
    color: #fff !important;
    box-shadow: 0 6px 14px rgba(41, 98, 255, 0.14) !important;
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn.active:hover {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.62), rgba(41, 98, 255, 0.34)) !important;
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn span {
    writing-mode: horizontal-tb;
    transform: none;
}

.tv-collapsible-tabs-top .tv-collapsible-tab-btn .tab-arrow {
    display: none;
}

.tv-settings-content {
    flex: 1;
    min-width: 0;
    padding: 16px 16px 10px;
    overflow: auto;
}

.tv-collapsible-tab-btn {
    width: 46px;
    height: 118px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    color: rgba(209, 212, 220, 0.65);
    font-size: 11px;
    font-weight: 700;
    cursor: default;
    transition: all 0.18s ease;
    position: relative;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.16em;
}

.tv-collapsible-tab-btn span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
}

.tv-collapsible-tab-btn:hover {
    background: rgba(255,255,255,0.09);
    color: rgba(209, 212, 220, 0.85);
}

.tv-collapsible-tab-btn.active {
    background: linear-gradient(180deg, rgba(41,98,255,0.95) 0%, rgba(41,98,255,0.55) 100%);
    border-color: rgba(41, 98, 255, 0.75);
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(41, 98, 255, 0.25);
}

.tv-collapsible-tab-btn .tab-arrow {
    display: none;
}

.tv-collapsible-tab-btn.active .tab-arrow {
    opacity: 1;
}

/* External dropdown panel - positioned outside the modal */
.tv-external-dropdown {
    position: fixed;
    display: none;
    background: #0a0a0a;
    border-radius: 8px;
    min-width: 320px;
    max-width: 420px;
    max-height: 700px;
    overflow-y: auto;
    overflow-x: visible;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    border: 1px solid #1a1a1a;
    z-index: 10001;
}

.tv-external-dropdown.open {
    display: block;
}

.tv-external-dropdown-content {
    padding: 16px;
}

/* Light mode for collapsible tabs */
body.light-mode .tv-collapsible-tab-btn {
    background: #e0e3eb;
    color: #131722;
}

body.light-mode .tv-collapsible-tab-btn:hover {
    background: rgba(41, 98, 255, 0.10);
    border-color: rgba(41, 98, 255, 0.6);
    color: #131722;
}

body.light-mode .tv-collapsible-tab-btn.active {
    background: rgba(41, 98, 255, 0.14);
    border-color: rgba(41, 98, 255, 0.75);
    color: #131722;
}

body.light-mode .tv-collapsible-tabs-top .tv-collapsible-tab-btn.active {
    background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55)) !important;
    border-color: rgba(41, 98, 255, 0.9) !important;
    color: #fff !important;
}

body.light-mode .tv-collapsible-tabs-top {
    border-bottom-color: #b2b5be;
}

body.light-mode .tv-external-dropdown {
    background: #ffffff;
    border-color: #e0e3eb;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

/* Template list in external dropdown */
.tv-template-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.tv-template-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: 6px;
    background: #0a0a0a;
    color: #d1d4dc;
    font-size: 13px;
    font-weight: 500;
    cursor: default;
    transition: all 0.2s ease;
}

.tv-template-item:hover {
    background: #1a1a1a;
    color: #ffffff;
}

.tv-template-delete {
    opacity: 0.5;
    cursor: default;
    transition: opacity 0.2s;
}

.tv-template-delete:hover {
    opacity: 1;
}

body.light-mode .tv-template-item {
    background: #e0e3eb;
    color: #131722;
}

body.light-mode .tv-template-item:hover {
    background: #d1d4dc;
}

/* Template dropdown light mode */
body.light-mode .settings-template-dropdown {
    background: #ffffff !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15) !important;
}

body.light-mode .settings-template-dropdown .template-dropdown-item {
    color: #131722 !important;
}

body.light-mode .settings-template-dropdown .template-dropdown-item:hover {
    background: #f0f3fa !important;
}

body.light-mode .settings-template-dropdown .template-divider {
    background: #e0e3eb !important;
}

/* Template save dialog light mode */
body.light-mode .template-save-dialog {
    background: #ffffff !important;
}

body.light-mode .template-save-dialog input {
    background: #f0f3fa !important;
    border-color: #e0e3eb !important;
    color: #131722 !important;
}

body.light-mode .template-save-dialog .dialog-title {
    color: #131722 !important;
}
`;
        if (!style.parentNode) {
            document.head.appendChild(style);
        }
        this.tvStylesInjected = true;
    }

    /**
     * Get display name for drawing type
     */
    getDrawingDisplayName(type) {
        const names = {
            'rectangle': 'Rectangle',
            'ellipse': 'Ellipse',
            'circle': 'Circle',
            'triangle': 'Triangle',
            'rotated-rectangle': 'Rotated Rectangle',
            'trendline': 'Trend Line',
            'horizontal': 'Horizontal Line',
            'vertical': 'Vertical Line',
            'ray': 'Ray',
            'horizontal-ray': 'Horizontal Ray',
            'extended-line': 'Extended Line',
            'cross-line': 'Cross Line',
            'arrow': 'Arrow',
            'arc': 'Arc',
            'polyline': 'Polyline',
            'path': 'Path',
            'brush': 'Brush',
            'highlighter': 'Highlighter',
            'fibonacci-retracement': 'Fib Retracement',
            'fibonacci-extension': 'Fib Extension',
            'regression-trend': 'Regression channel'
        };
        return names[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
    }

    /**
     * Build TradingView-style modal for shapes
     */
    buildTVModal(drawing) {
        // [debug removed]
        // [debug removed]
        this.ensureTVStyles();
        
        const modal = document.createElement('div');
        
        // All shapes now use compact accordion-style modal
        modal.className = 'tv-settings-modal compact';
        
        // Hide initially to prevent flash, position will be set before showing
        modal.style.opacity = '0';
        
        // Restore saved position if available
        let hasSavedPosition = false;
        try {
            const savedPos = localStorage.getItem('drawingSettingsModalPosition');
            if (savedPos) {
                const pos = JSON.parse(savedPos);
                // Validate position is within viewport
                const maxLeft = window.innerWidth - 100;
                const maxTop = window.innerHeight - 100;
                if (pos.left >= 0 && pos.left < maxLeft && pos.top >= 0 && pos.top < maxTop) {
                    modal.style.position = 'fixed';
                    modal.style.left = pos.left + 'px';
                    modal.style.top = pos.top + 'px';
                    modal.style.transform = 'none';
                    hasSavedPosition = true;
                }
            }
        } catch (e) {
            console.warn('Could not restore modal position:', e);
        }
        
        // If no saved position, use default center but without transform animation
        if (!hasSavedPosition) {
            modal.style.position = 'fixed';
            modal.style.left = '50%';
            modal.style.top = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
        }
        
        // Store original style in dataset for cancel button to access
        modal.dataset.originalStyle = JSON.stringify(drawing.style);
        modal.dataset.originalText = drawing.text || '';
        modal.dataset.drawingId = drawing.id;
        modal.dataset.originalPoints = JSON.stringify(drawing.points || []);
        // Also store levels for Fibonacci/channel tools
        if (drawing.levels) {
            modal.dataset.originalLevels = JSON.stringify(drawing.levels);
        }
        
        // Header (draggable)
        const header = document.createElement('div');
        header.className = 'tv-modal-header';
        header.style.cssText = 'cursor: move; user-select: none;';
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2" style="cursor: default;" title="Double-click to edit">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
                <h2 class="tv-modal-title" style="cursor: text; margin: 0;" title="Double-click to edit">${drawing.name || this.getDrawingDisplayName(drawing.type)}</h2>
            </div>
            <button class="tv-modal-close">×</button>
        `;
        modal.appendChild(header);
        
        // Check if this drawing type should have a Text tab
        // Text-type drawings use STYLE tab for text controls, so they don't need a separate TEXT tab
        // Arrow-marker tools also show text in STYLE tab
        const noTextTabTypes = ['arrow', 'triangle', 'ellipse', 'circle', 'rotated-rectangle', 'arc', 'curve', 'double-curve', 'cross-line', 'polyline', 'brush', 'highlighter', 'path', 'regression-trend', 'parallel-channel', 'flat-top-bottom', 'text', 'notebox', 'label', 'anchored-text', 'note', 'price-note', 'price-label', 'price-label-2', 'signpost-2', 'flag-mark', 'image', 'pin', 'callout', 'comment', 'pitchfork', 'pitchfan', 'emoji', 'fibonacci-retracement', 'fibonacci-extension', 'fib-channel', 'fib-timezone', 'fib-speed-fan', 'trend-fib-time', 'fib-circles', 'fib-spiral', 'fib-arcs', 'fib-wedge', 'trend-fib-extension', 'gann-box', 'gann-square-fixed', 'gann-fan', 'date-price-range', 'price-range', 'date-range'];
        const hasTextTab = !noTextTabTypes.includes(drawing.type);
        
        const body = document.createElement('div');
        body.className = 'tv-settings-body';
        modal.appendChild(body);

        // All shapes: integrated vertical tabs with internal right panel
        const mainContainer = document.createElement('div');
        mainContainer.className = 'tv-collapsible-tabs-container';
        
        const tabsTop = document.createElement('div');
        tabsTop.className = 'tv-collapsible-tabs-top';

        const contentRight = document.createElement('div');
        contentRight.className = 'tv-settings-content';
        
        // Check if this drawing needs an Inputs tab
        const hasInputsTab = drawing.type === 'regression-trend';
        
        let tabsHTML = '';
        
        if (hasInputsTab) {
            tabsHTML += `
            <button class="tv-collapsible-tab-btn" data-tab="inputs">
                <span>Inputs</span>
                <svg class="tab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        }
        
        tabsHTML += `
            <button class="tv-collapsible-tab-btn active" data-tab="style">
                <span>Style</span>
                <svg class="tab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        
        if (hasTextTab) {
            tabsHTML += `
            <button class="tv-collapsible-tab-btn" data-tab="text">
                <span>Text</span>
                <svg class="tab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        }

        const noCoordinatesTabTypes = ['text', 'polyline', 'path', 'curve', 'double-curve', 'arc', 'ellipse', 'brush', 'highlighter', 'flat-top-bottom', 'disjoint-channel'];
        const hasCoordinatesTab = !noCoordinatesTabTypes.includes(drawing.type)
            && Array.isArray(drawing.points)
            && drawing.points.length > 0;
        if (hasCoordinatesTab) {
            tabsHTML += `
            <button class="tv-collapsible-tab-btn" data-tab="coordinates">
                <span>Coordinates</span>
                <svg class="tab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        }
        
        tabsHTML += `
            <button class="tv-collapsible-tab-btn" data-tab="timeframes">
                <span>Visibility</span>
                <svg class="tab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>`;
        
        tabsHTML += `
        `;
        
        tabsTop.innerHTML = tabsHTML;
        mainContainer.appendChild(tabsTop);
        mainContainer.appendChild(contentRight);
        body.appendChild(mainContainer);

        const tabPanes = {};
        const createPane = (tab, isActive = false) => {
            const pane = document.createElement('div');
            pane.className = `tv-tab-pane${isActive ? ' active' : ''}`;
            pane.dataset.tab = tab;
            contentRight.appendChild(pane);
            tabPanes[tab] = pane;
            return pane;
        };

        if (hasInputsTab) {
            const inputsPane = createPane('inputs', false);
            this.buildRegressionInputsTab(inputsPane, drawing);
        }

        const stylePane = createPane('style', true);
        this.buildStyleTab(stylePane, drawing);

        if (hasTextTab) {
            const textPane = createPane('text', false);
            this.buildTextTab(textPane, drawing);
        }

        if (hasCoordinatesTab) {
            const coordsPane = createPane('coordinates', false);
            this.buildCoordinatesTab(coordsPane, drawing);
        }

        const visibilityPane = createPane('timeframes', false);
        this.buildTimeframesTab(visibilityPane, drawing);

        const excludeTemplate = drawing.type === 'image' || drawing.type === 'image-v2' || drawing.type === 'emoji';
        
        // Footer - simple Cancel/OK for all shapes now
        const footer = document.createElement('div');
        footer.className = 'tv-modal-footer';
        footer.innerHTML = `
            <div class="tv-footer-left">
                ${excludeTemplate ? '' : '<button class="tv-btn tv-btn-template" data-tab="template">Template</button>'}
            </div>
            <div class="tv-footer-right">
                <button class="tv-btn tv-btn-cancel">Cancel</button>
                <button class="tv-btn tv-btn-apply">OK</button>
            </div>
        `;
        modal.appendChild(footer);
        
        // Make modal draggable
        this.makeModalDraggable(modal, header);
        
        // Event Listeners
        this.setupTVModalEvents(modal, drawing);
        
        // Add double-click editing for title
        const titleElement = modal.querySelector('.tv-modal-title');
        if (titleElement) {
            titleElement.addEventListener('dblclick', () => {
                this.makeTitleEditable(titleElement, drawing);
            });
        }
        
        return modal;
    }

    /**
     * Build Style Tab Content
     */
    buildStyleTab(container, drawing) {
        // Check if brush/highlighter or line tools (skip description for these)
        const isBrushTool = drawing.type === 'brush' || drawing.type === 'highlighter';
        const lineTools = ['trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray', 'extended-line', 'cross-line', 'path', 'curve', 'double-curve', 'parallel-channel', 'regression-trend', 'flat-top-bottom', 'disjoint-channel'];
        const isLineTool = lineTools.includes(drawing.type);
        const isPolyline = drawing.type === 'polyline';
        const shapeTools = ['rectangle', 'rotated-rectangle', 'ellipse', 'circle', 'triangle', 'arc'];
        const isShapeTool = shapeTools.includes(drawing.type);
	    let rectangleBorderRow = null;
        
        // Description removed - no longer needed
        
        // Special handling for position tools
        if (drawing.type === 'long-position' || drawing.type === 'short-position') {
            this.buildPositionStyleTab(container, drawing);
            return;
        }

        const rangeTools = ['date-price-range', 'price-range', 'date-range'];
        if (rangeTools.includes(drawing.type)) {
            this.buildRangeToolsStyleTab(container, drawing);
            return;
        }
        
        // Special handling for emoji
        if (drawing.type === 'emoji') {
            this.buildEmojiStyleTab(container, drawing);
            return;
        }
        
        // Special handling for text tools
        const textTypes = ['text', 'notebox', 'label', 'anchored-text', 'note', 'price-note', 'price-label', 'price-label-2', 'pin', 'callout', 'comment', 'signpost-2', 'flag-mark'];
        if (textTypes.includes(drawing.type)) {
            this.buildTextStyleTab(container, drawing);
            return;
        }
        
        // Special handling for image-v2
        if (drawing.type === 'image-v2') {
            // [debug removed]
            this.buildImageV2StyleTab(container, drawing);
            return;
        }
        
        // Special handling for image
        if (drawing.type === 'image') {
            // [debug removed]
            this.buildImageStyleTab(container, drawing);
            return;
        }
        
        // Controls Header - hide for arrow-marker tools, hide Type for brush/highlighter
        const isArrowMarker = drawing.type === 'arrow-marker' || drawing.type === 'arrow-mark-up' || drawing.type === 'arrow-mark-down';
        if (!isArrowMarker && drawing.type !== 'fib-channel' && drawing.type !== 'fib-timezone' && drawing.type !== 'fib-speed-fan' && drawing.type !== 'trend-fib-time' && drawing.type !== 'fib-circles' && drawing.type !== 'fib-arcs' && drawing.type !== 'fib-wedge' && drawing.type !== 'gann-box' && drawing.type !== 'gann-square-fixed' && drawing.type !== 'gann-fan') {
            const isBrushOrHighlighterHeader = drawing.type === 'brush' || drawing.type === 'highlighter';
            const headerRow = document.createElement('div');
            headerRow.className = 'tv-controls-header';
            if (isBrushOrHighlighterHeader) {
                // Simplified header for brush/highlighter - match controls layout exactly
                const widthLabelSize = '70px';
                headerRow.innerHTML = `
                    <span class="tv-checkbox-label" style="cursor: default;"></span>
                    <div class="tv-prop-controls" style="pointer-events: none;">
                        <span style="width: 30px; text-align: center; font-size: 10px; color: #787b86;">Color</span>
                        <span style="width: ${widthLabelSize}; text-align: center; font-size: 10px; color: #787b86;">Width</span>
                    </div>
                `;
            } else {
                headerRow.innerHTML = `
                    <span></span>
                    <div class="tv-controls-header-labels">
                        <span>Color</span>
                        <span>Type</span>
                        <span>Width</span>
                    </div>
                `;
            }
            container.appendChild(headerRow);
        }
        
        // Line Property Row (skip for arrow-marker - it only needs fill color)
        const skipLineRow = drawing.type === 'arrow-marker' || drawing.type === 'arrow-mark-up' || drawing.type === 'arrow-mark-down' || drawing.type === 'fib-channel' || drawing.type === 'fib-timezone' || drawing.type === 'fib-speed-fan' || drawing.type === 'trend-fib-time' || drawing.type === 'fib-circles' || drawing.type === 'fib-arcs' || drawing.type === 'fib-wedge' || drawing.type === 'gann-box' || drawing.type === 'gann-square-fixed' || drawing.type === 'gann-fan';
        if (!skipLineRow) {
            const isFibTool = drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension' || drawing.type === 'trend-fib-extension';
            const lineValues = {
                // For pitchfork tools, use medianColor for Line row
                // For fib tools, this row controls ONLY the middle trend line
                color: (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') 
                    ? (drawing.style.medianColor || '#e91e63') 
                    : (isFibTool ? (drawing.style.trendLineColor || drawing.style.stroke || '#787b86') : (drawing.style.stroke || '#EF5350')),
                lineType: isFibTool ? (drawing.style.trendLineDasharray ?? drawing.style.strokeDasharray ?? '') : (drawing.style.strokeDasharray || ''),
                lineWidth: isFibTool ? (drawing.style.trendLineWidth ?? ((drawing.style.strokeWidth || 2) + 1)) : (drawing.style.strokeWidth || 2)
            };
            if (isBrushTool || isLineTool || isPolyline || isShapeTool) {
                // Use brush-style row (no checkbox) for brush tools, line tools, polyline, and shapes
                // 'Line' label for brush/highlighter, 'Border' for shapes, 'Middle Line' for regression-trend, 'Line' for others
                let label = 'Line';
                if (isShapeTool) {
                    label = 'Border';
                } else if (drawing.type === 'regression-trend') {
                    label = 'Middle Line';
                } else if (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') {
                    label = 'Middle Line';
                }
                const brushLineRow = this.createBrushPropertyRow(label, lineValues, 'line', drawing);
                brushLineRow.style.borderBottom = 'none';
                brushLineRow.style.paddingBottom = '12px';
                brushLineRow.style.marginBottom = '12px';
                container.appendChild(brushLineRow);
	            if (drawing.type === 'rectangle') rectangleBorderRow = brushLineRow;
            } else {
                if (isFibTool) {
                    // Fib tools: Trend line should always be enabled (no checkbox)
                    if (drawing.style && drawing.style.trendLineEnabled === false) {
                        drawing.style.trendLineEnabled = true;
                    }
                    const trendRow = this.createBrushPropertyRow('Trend line', lineValues, 'trendLine', drawing);
                    trendRow.style.paddingBottom = '12px';
                    trendRow.style.marginBottom = '12px';
                    container.appendChild(trendRow);
                } else {
                    const lineLabel = (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') ? 'Middle Line' : 'Line';
                    const lineEnabled = (drawing.type === 'pitchfork' || drawing.type === 'pitchfan')
                        ? (drawing.style.lineEnabled !== false)
                        : true;
                    const lineRow = this.createPropertyRow(lineLabel, lineEnabled, lineValues, drawing, 'line');
                    lineRow.style.borderBottom = 'none';
                    lineRow.style.paddingBottom = '12px';
                    lineRow.style.marginBottom = '12px';
                    container.appendChild(lineRow);
                }
            }
        }
        
        // Middle Line (for shapes that support it) - keep checkbox since it's optional
        const shapeTypes = ['rectangle', 'ellipse', 'circle', 'rotated-rectangle'];
        if (shapeTypes.includes(drawing.type)) {
            const middleLineEnabled = drawing.style.showMiddleLine || false;
            const middleRow = this.createPropertyRow('Middle line', middleLineEnabled, {
                color: drawing.style.middleLineColor || '#2962FF',
                lineType: drawing.style.middleLineDash || '',
                lineWidth: drawing.style.middleLineWidth || 1
            }, drawing, 'middleLine');
            container.appendChild(middleRow);
        }
        
        // Extend Left/Right (for rectangle only, flat-top-bottom has it in its own section below)
        if (drawing.type === 'rectangle') {
            const extendLeftEnabled = drawing.style.extendLeft || false;
            const extendLeftRow = document.createElement('div');
            extendLeftRow.className = 'tv-prop-row';
            extendLeftRow.innerHTML = `
                <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${extendLeftEnabled ? 'checked' : ''}" data-prop="extendLeftEnabled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    Extend left
                </span>
                <div class="tv-prop-controls"></div>
            `;
            container.appendChild(extendLeftRow);
            
            const extendRightEnabled = drawing.style.extendRight || false;
            const extendRightRow = document.createElement('div');
            extendRightRow.className = 'tv-prop-row';
            extendRightRow.innerHTML = `
                <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${extendRightEnabled ? 'checked' : ''}" data-prop="extendRightEnabled">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    Extend right
                </span>
                <div class="tv-prop-controls"></div>
            `;
            container.appendChild(extendRightRow);
        }
        
        // Background Row
        const isBrushType = drawing.type === 'brush' || drawing.type === 'highlighter';
        const isArrowMarkerType = drawing.type === 'arrow-marker' || drawing.type === 'arrow-mark-up' || drawing.type === 'arrow-mark-down';
        
        // For polyline and shapes: show background color picker without checkbox
        if (isPolyline || isShapeTool || isArrowMarkerType) {
            const bgRow = document.createElement('div');
            bgRow.className = 'tv-prop-row';
            bgRow.innerHTML = '<span class="tv-prop-label">Background</span><div class="tv-prop-controls"><button class="tv-color-btn" data-prop="backgroundColor" style="background: ' + (drawing.style.fill || 'rgba(41, 98, 255, 0.2)') + ';"></button></div>';
            if (drawing.type === 'rectangle' && rectangleBorderRow) {
                container.insertBefore(bgRow, rectangleBorderRow.nextSibling);
            } else {
                container.appendChild(bgRow);
            }
        }
        // For pitchfork: show background with checkbox and opacity slider
        else if (drawing.type === 'pitchfork') {
            const bgRow = document.createElement('div');
            bgRow.className = 'tv-prop-row';
            bgRow.style.cssText = 'display: flex; align-items: center; gap: 12px;';
            
            const bgEnabled = drawing.style?.backgroundEnabled !== false;
            const bgOpacity = drawing.style?.backgroundOpacity ?? 0.2;

            const bgLabel = document.createElement('span');
            bgLabel.className = 'tv-prop-label';
            bgLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; min-width: 140px;';
            bgLabel.innerHTML = `
                <div class="tv-checkbox ${bgEnabled ? 'checked' : ''}" data-prop="backgroundEnabled">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Background
            `;
            bgRow.appendChild(bgLabel);
            
            // Opacity slider
            const bgSlider = document.createElement('input');
            bgSlider.type = 'range';
            bgSlider.min = '0';
            bgSlider.max = '1';
            bgSlider.step = '0.05';
            bgSlider.value = bgOpacity;
            bgSlider.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: linear-gradient(to right, #2962ff ' + (bgOpacity * 100) + '%, #363a45 ' + (bgOpacity * 100) + '%); border-radius: 3px; cursor: pointer; outline: none;';
            bgSlider.oninput = () => {
                const val = parseFloat(bgSlider.value);
                bgSlider.style.background = 'linear-gradient(to right, #2962ff ' + (val * 100) + '%, #363a45 ' + (val * 100) + '%)';
                if (!drawing.style) drawing.style = {};
                drawing.style.backgroundOpacity = val;
                this.pendingChanges.backgroundOpacity = val;
                this.applyChanges(drawing);
            };
            bgRow.appendChild(bgSlider);
            
            container.appendChild(bgRow);
        }
        // For other tools: show background with checkbox
        else if (!isBrushType && !isLineTool && drawing.type !== 'fibonacci-retracement' && drawing.type !== 'fibonacci-extension' && drawing.type !== 'trend-fib-extension' && drawing.type !== 'fib-channel' && drawing.type !== 'fib-timezone' && drawing.type !== 'fib-speed-fan' && drawing.type !== 'trend-fib-time' && drawing.type !== 'fib-circles' && drawing.type !== 'fib-spiral' && drawing.type !== 'fib-arcs' && drawing.type !== 'fib-wedge' && drawing.type !== 'gann-box' && drawing.type !== 'gann-square-fixed' && drawing.type !== 'gann-fan') {
            const bgRow = document.createElement('div');
            bgRow.className = 'tv-prop-row';
            const hasFill = drawing.style.fill && drawing.style.fill !== 'none';
            bgRow.innerHTML = `
                <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${hasFill ? 'checked' : ''}" data-prop="showBackground">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    Background
                </span>
                <div class="tv-prop-controls">
                    <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${drawing.style.fill || '#2962FF'};"></button>
                </div>
            `;
            container.appendChild(bgRow);
        }
        
        // Extend options (for trendline, curve, arrow) - now just checkboxes, arrow buttons are inline above
        if (['trendline', 'curve', 'arrow'].includes(drawing.type)) {
            const extendSection = document.createElement('div');
            extendSection.className = 'tv-extend-section';
            extendSection.style.cssText = 'margin-top: 16px;';
            
            const extendRow = document.createElement('div');
            extendRow.className = 'tv-prop-row';
            extendRow.style.cssText = 'margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;';
            extendRow.innerHTML = `
                <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${drawing.style.extendLeft ? 'checked' : ''}" data-prop="extendLeft">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label" style="white-space: nowrap;">Extend left</span>
                </div>
                <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${drawing.style.extendRight ? 'checked' : ''}" data-prop="extendRight">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label" style="white-space: nowrap;">Extend right</span>
                </div>
            `;
            extendSection.appendChild(extendRow);
            
            container.appendChild(extendSection);
        }
        
        // Info section with checkboxes (only for trendline and arrow, not curve)
        if (['trendline', 'arrow'].includes(drawing.type)) {
            const infoSection = document.createElement('div');
            infoSection.className = 'tv-info-section';
            infoSection.style.cssText = 'margin-top: 16px;';
            
            const infoSettings = {
                showInfo: false,
                priceRange: true,
                percentChange: false,
                changeInPips: false,
                barsRange: false,
                dateTimeRange: false,
                distance: false,
                angle: false,
                ...(drawing.style.infoSettings || {})
            };
            
            const infoRow = document.createElement('div');
            infoRow.className = 'tv-prop-row';
            infoRow.style.cssText = 'margin-bottom: 12px;';
            infoRow.innerHTML = `
                <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${infoSettings.showInfo ? 'checked' : ''}" data-prop="showInfo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label" style="white-space: nowrap;">Show Info</span>
                </div>
                <div class="tv-prop-controls">
                    <button class="tv-info-dropdown-btn" style="padding: 6px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(255,255,255,0.08); color: #d1d4dc; cursor: default; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                        <span>Select</span>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </button>
                </div>
            `;
            infoSection.appendChild(infoRow);
            
            // Store infoSettings reference for dropdown
            infoRow._infoSettings = infoSettings;
            infoRow._drawing = drawing;
            
            container.appendChild(infoSection);
        }

        // Pitchfork tools levels section
        const pitchforkTools = ['pitchfork', 'pitchfan'];
        if (pitchforkTools.includes(drawing.type)) {
            if (drawing.type === 'pitchfork') {
                this.buildPitchforkStyleSection(container, drawing);
            }
            this.buildPitchforkLevelsSection(container, drawing);
        }

        // Channel tools levels section (exclude regression-trend and disjoint-channel)
        const channelTools = ['parallel-channel'];
        if (channelTools.includes(drawing.type)) {
            this.buildChannelLevelsSection(container, drawing);
            
            // Extend options for parallel-channel at the bottom after levels
            if (drawing.type === 'parallel-channel') {
                const extendSection = document.createElement('div');
                extendSection.className = 'tv-extend-section';
                extendSection.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #2a2e39;';
                
                const extendRow = document.createElement('div');
                extendRow.className = 'tv-prop-row';
                extendRow.style.cssText = 'margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;';
                extendRow.innerHTML = `
                    <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <div class="tv-checkbox ${drawing.style.extendLeft ? 'checked' : ''}" data-prop="extendLeft">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <span class="tv-checkbox-label" style="white-space: nowrap;">Extend left</span>
                    </div>
                    <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                        <div class="tv-checkbox ${drawing.style.extendRight ? 'checked' : ''}" data-prop="extendRight">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <span class="tv-checkbox-label" style="white-space: nowrap;">Extend right</span>
                    </div>
                `;
                extendSection.appendChild(extendRow);
                
                container.appendChild(extendSection);
            }
        }

        // Fibonacci tools levels section
        const fibonacciToolsWithLevels = [
            'fibonacci-retracement', 'fibonacci-extension',
            'fib-channel', 'fib-speed-fan', 'trend-fib-time',
            'fib-circles', 'fib-arcs', 'fib-wedge', 'trend-fib-extension',
            'fib-timezone'
        ];
        if (fibonacciToolsWithLevels.includes(drawing.type)) {
            this.buildFibonacciLevelsSection(container, drawing);
        }

        if (drawing.type === 'gann-box') {
            this.buildGannBoxLevelsSection(container, drawing);
        }

        if (drawing.type === 'gann-square-fixed') {
            this.buildGannSquareFixedLevelsSection(container, drawing);
        }

        if (drawing.type === 'gann-fan') {
            this.buildGannFanLevelsSection(container, drawing);
        }

        // Flat-top-bottom and disjoint-channel background and extend options
        if (drawing.type === 'flat-top-bottom' || drawing.type === 'disjoint-channel') {
            const flatTopSection = document.createElement('div');
            flatTopSection.className = 'tv-flat-top-section';
            flatTopSection.style.cssText = 'margin-top: 16px;';

            // Background row
            const bgRow = document.createElement('div');
            bgRow.className = 'tv-prop-row';
            bgRow.style.cssText = 'display: grid; grid-template-columns: 90px auto; align-items: center; padding: 9px 0; column-gap: 9px; margin-bottom: 8px;';
            bgRow.innerHTML = `
                <span class="tv-prop-label">Background</span>
                <div class="tv-prop-controls" style="display: flex; align-items: center; gap: 9px;">
                    <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${drawing.style.fill || 'rgba(41, 98, 255, 0.2)'};"></button>
                </div>
            `;
            flatTopSection.appendChild(bgRow);

            // Extend options
            const extendSection = document.createElement('div');
            extendSection.className = 'tv-extend-section';
            extendSection.style.cssText = 'padding-top: 12px; border-top: 1px solid #2a2e39;';
            
            const extendRow = document.createElement('div');
            extendRow.className = 'tv-prop-row';
            extendRow.style.cssText = 'margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;';
            extendRow.innerHTML = `
                <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${drawing.style.extendLeft ? 'checked' : ''}" data-prop="extendLeft">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label" style="white-space: nowrap;">Extend left</span>
                </div>
                <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                    <div class="tv-checkbox ${drawing.style.extendRight ? 'checked' : ''}" data-prop="extendRight">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label" style="white-space: nowrap;">Extend right</span>
                </div>
            `;
            extendSection.appendChild(extendRow);
            flatTopSection.appendChild(extendSection);

            container.appendChild(flatTopSection);
        }

        // Regression trend upper/lower line and background controls
        if (drawing.type === 'regression-trend') {
            const regressionSection = document.createElement('div');
            regressionSection.className = 'tv-regression-section';
            regressionSection.style.cssText = 'margin-top: 16px;';

            // Upper line row
            const upperLineRow = this.createBrushPropertyRow('Upper Line', {
                color: drawing.style.upperStroke || '#9c27b0',
                lineType: drawing.style.upperStrokeDasharray || '0',
                lineWidth: drawing.style.upperStrokeWidth || 2
            }, 'upperLine', drawing);
            regressionSection.appendChild(upperLineRow);

            // Upper background row
            const upperBgRow = document.createElement('div');
            upperBgRow.className = 'tv-prop-row';
            upperBgRow.style.cssText = 'display: grid; grid-template-columns: 90px auto; align-items: center; padding: 9px 0; column-gap: 9px; margin-bottom: 8px;';
            upperBgRow.innerHTML = `
                <span class="tv-prop-label">Upper Background</span>
                <div class="tv-prop-controls" style="display: flex; align-items: center; gap: 9px;">
                    <button class="tv-color-btn" data-prop="upperFill" style="background: ${drawing.style.upperFill || 'rgba(156, 39, 176, 0.1)'};"></button>
                </div>
            `;
            regressionSection.appendChild(upperBgRow);

            // Lower line row
            const lowerLineRow = this.createBrushPropertyRow('Lower Line', {
                color: drawing.style.lowerStroke || '#9c27b0',
                lineType: drawing.style.lowerStrokeDasharray || '0',
                lineWidth: drawing.style.lowerStrokeWidth || 2
            }, 'lowerLine', drawing);
            lowerLineRow.style.borderTop = '1px solid #2a2e39';
            lowerLineRow.style.paddingTop = '12px';
            lowerLineRow.style.marginTop = '12px';
            regressionSection.appendChild(lowerLineRow);

            // Lower background row
            const lowerBgRow = document.createElement('div');
            lowerBgRow.className = 'tv-prop-row';
            lowerBgRow.style.cssText = 'display: grid; grid-template-columns: 90px auto; align-items: center; padding: 9px 0; column-gap: 9px;';
            lowerBgRow.innerHTML = `
                <span class="tv-prop-label">Lower Background</span>
                <div class="tv-prop-controls" style="display: flex; align-items: center; gap: 9px;">
                    <button class="tv-color-btn" data-prop="lowerFill" style="background: ${drawing.style.lowerFill || 'rgba(156, 39, 176, 0.1)'};"></button>
                </div>
            `;
            regressionSection.appendChild(lowerBgRow);

            container.appendChild(regressionSection);
        }
    }

    buildGannSquareFixedLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        const header = document.createElement('div');
        header.style.cssText = 'color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;';
        header.textContent = 'Gann Square Levels';
        section.appendChild(header);

        if (!drawing.style) drawing.style = {};

        const defaultGridLevels = [
            { value: 0, enabled: true, color: '#ff9800' },
            { value: 0.25, enabled: true, color: '#00bcd4' },
            { value: 0.5, enabled: true, color: '#4caf50' },
            { value: 0.75, enabled: true, color: '#2962ff' },
            { value: 1, enabled: true, color: '#2962ff' }
        ];

        const defaultFanLevels = [
            { value: 0.25, enabled: true, color: '#00bcd4' },
            { value: 0.5, enabled: true, color: '#4caf50' },
            { value: 0.75, enabled: true, color: '#2962ff' }
        ];

        const defaultArcLevels = [
            { value: 0.25, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#00bcd4' },
            { value: 0.75, enabled: true, color: '#4caf50' },
            { value: 1, enabled: true, color: '#2962ff' }
        ];

        const ensureLevelArray = (key, defaults) => {
            if (Array.isArray(drawing.style[key]) && drawing.style[key].length > 0) {
                return drawing.style[key];
            }
            if (Array.isArray(drawing.style.squareLevels) && drawing.style.squareLevels.length > 0) {
                drawing.style[key] = drawing.style.squareLevels.map(l => ({ ...l }));
                return drawing.style[key];
            }
            drawing.style[key] = defaults.map(l => ({ ...l }));
            return drawing.style[key];
        };

        const gridLevels = ensureLevelArray('gridLevels', defaultGridLevels);
        const fanLevels = ensureLevelArray('fanLevels', defaultFanLevels);
        const arcLevels = ensureLevelArray('arcLevels', defaultArcLevels);

        const normalizeArray = (arr) => {
            arr.forEach(l => {
                if (!l) return;
                if (l.enabled === undefined) l.enabled = true;
                if (!l.color) l.color = '#787b86';
                if (l.value === undefined || l.value === null || isNaN(parseFloat(l.value))) l.value = 0;
            });
        };
        normalizeArray(gridLevels);
        normalizeArray(fanLevels);
        normalizeArray(arcLevels);

        if (drawing.style.levelsLineDasharray === undefined) drawing.style.levelsLineDasharray = '';
        if (drawing.style.levelsLineWidth === undefined) drawing.style.levelsLineWidth = 1;
        if (drawing.style.showZones === undefined) drawing.style.showZones = true;
        if (drawing.style.backgroundOpacity === undefined) drawing.style.backgroundOpacity = 0.12;

        const normalizeLevelsStyle = () => {
            const lt = drawing.style.levelsLineDasharray ?? '';
            const lw = parseInt(drawing.style.levelsLineWidth) || 1;
            [gridLevels, fanLevels, arcLevels].forEach(arr => {
                arr.forEach(lvl => { if (lvl) { lvl.lineType = lt; lvl.lineWidth = lw; } });
            });
        };
        normalizeLevelsStyle();

        const applyChanges = () => {
            self.pendingChanges.style = {
                ...self.pendingChanges.style,
                gridLevels,
                fanLevels,
                arcLevels,
                levelsLineDasharray: drawing.style.levelsLineDasharray,
                levelsLineWidth: drawing.style.levelsLineWidth,
                showZones: drawing.style.showZones,
                backgroundOpacity: drawing.style.backgroundOpacity
            };

            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            if (drawingManager) {
                const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                if (!actualDrawing.style) actualDrawing.style = {};
                actualDrawing.style.gridLevels = gridLevels;
                actualDrawing.style.fanLevels = fanLevels;
                actualDrawing.style.arcLevels = arcLevels;
                actualDrawing.style.levelsLineDasharray = drawing.style.levelsLineDasharray;
                actualDrawing.style.levelsLineWidth = drawing.style.levelsLineWidth;
                actualDrawing.style.showZones = drawing.style.showZones;
                actualDrawing.style.backgroundOpacity = drawing.style.backgroundOpacity;
                Object.assign(actualDrawing.style, drawing.style);
                drawingManager.renderDrawing(actualDrawing);
                drawingManager.saveDrawings();
                return;
            }

            self.renderPreview(drawing);
        };

        const levelsStyleRow = document.createElement('div');
        levelsStyleRow.className = 'tv-prop-row';
        levelsStyleRow.style.cssText = 'display:flex; align-items:center; gap: 8px; margin-bottom: 12px;';

        const levelsLabel = document.createElement('span');
        levelsLabel.className = 'tv-prop-label';
        levelsLabel.textContent = 'Levels';
        levelsStyleRow.appendChild(levelsLabel);

        const levelsControls = document.createElement('div');
        levelsControls.className = 'tv-prop-controls';
        levelsControls.style.marginLeft = 'auto';

        const levelsTypeSelect = document.createElement('select');
        levelsTypeSelect.className = 'tv-select';
        levelsTypeSelect.style.width = '40px';
        const currentLevelsType = drawing.style.levelsLineDasharray ?? '';
        levelsTypeSelect.innerHTML = `
            <option value="" ${currentLevelsType === '' ? 'selected' : ''}>───────</option>
            <option value="10,6" ${(currentLevelsType === '10,6' || currentLevelsType === '5,5') ? 'selected' : ''}>─ ─ ─ ─</option>
            <option value="2,2" ${currentLevelsType === '2,2' ? 'selected' : ''}>··········</option>
            <option value="8,4,2,4" ${currentLevelsType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
        `;
        levelsTypeSelect.onchange = () => {
            drawing.style.levelsLineDasharray = levelsTypeSelect.value;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsTypeSelect);

        const levelsWidthSelect = document.createElement('select');
        levelsWidthSelect.className = 'tv-select';
        levelsWidthSelect.style.width = '48px';
        const widths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const currentLevelsWidth = parseInt(drawing.style.levelsLineWidth) || 1;
        levelsWidthSelect.innerHTML = widths.map(w => `<option value="${w}" ${currentLevelsWidth === w ? 'selected' : ''}>${w}px</option>`).join('');
        levelsWidthSelect.onchange = () => {
            const w = parseInt(levelsWidthSelect.value);
            drawing.style.levelsLineWidth = (!isNaN(w) && w > 0) ? w : 1;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsWidthSelect);

        levelsStyleRow.appendChild(levelsControls);
        section.appendChild(levelsStyleRow);

        const optionsRow = document.createElement('div');
        optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45; align-items: center;';

        const zonesLabel = document.createElement('label');
        zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
        const zonesCheck = document.createElement('input');
        zonesCheck.type = 'checkbox';
        zonesCheck.checked = drawing.style.showZones !== false;
        zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
        zonesCheck.onchange = () => {
            drawing.style.showZones = zonesCheck.checked;
            applyChanges();
        };
        zonesLabel.appendChild(zonesCheck);
        zonesLabel.appendChild(document.createTextNode('Show Zones'));
        optionsRow.appendChild(zonesLabel);

        const opacity = document.createElement('input');
        opacity.type = 'range';
        opacity.min = '0';
        opacity.max = '1';
        opacity.step = '0.05';
        opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
        opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
        opacity.oninput = () => {
            drawing.style.backgroundOpacity = parseFloat(opacity.value);
            applyChanges();
        };
        optionsRow.appendChild(opacity);
        section.appendChild(optionsRow);

        const buildGroup = (title, levelGroupKey, levelsArray, defaults) => {
            const groupHeader = document.createElement('div');
            groupHeader.style.cssText = 'color: #787b86; font-size: 12px; margin: 10px 0 8px 0; text-transform: uppercase;';
            groupHeader.textContent = title;
            section.appendChild(groupHeader);

            const list = document.createElement('div');
            list.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 220px; overflow-y: auto; align-items: start;';

        const getStepDecimals = (n) => {
            const s = String(n);
            if (s.includes('e-')) {
                const parts = s.split('e-');
                const exp = parseInt(parts[1], 10);
                return isNaN(exp) ? 0 : exp;
            }
            const dot = s.indexOf('.');
            return dot === -1 ? 0 : (s.length - dot - 1);
        };

            const addLevelRow = (level, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-prop-row fib-level-row';
            row.style.cssText = 'display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 4px 0;';

            const checkboxWrapper = document.createElement('div');
            const currentEnabled = level.enabled !== false;
            checkboxWrapper.style.cssText = `
                width: 20px; height: 20px; border: 2px solid #363a45; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; background: ${currentEnabled ? '#2962ff' : 'transparent'};
                transition: all 0.15s;
            `;
            checkboxWrapper.innerHTML = currentEnabled
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                : '';
            checkboxWrapper.onclick = (e) => {
                e.stopPropagation();
                const enabledNow = level.enabled !== false;
                const enabledNext = !enabledNow;
                level.enabled = enabledNext;
                checkboxWrapper.style.background = enabledNext ? '#2962ff' : 'transparent';
                checkboxWrapper.innerHTML = enabledNext
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                    : '';
                applyChanges();
            };
            row.appendChild(checkboxWrapper);

            const valueWrapper = document.createElement('div');
            valueWrapper.className = 'number-input-wrapper';
            valueWrapper.style.width = '100%';

            const valueProp = `gannSquareLevelValue_${idx}`;

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'tv-number-input';
            input.dataset.prop = valueProp;
            input.value = level.value;
            input.step = '0.001';
            input.style.cssText = 'color: #d1d4dc; font-size: 13px; text-align: center; width: 100%; flex: 1; min-width: 0;';

            const updateLevelFromInput = () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) {
                    level.value = parsed;
                    applyChanges();
                }
            };
            input.addEventListener('input', updateLevelFromInput);
            input.addEventListener('change', updateLevelFromInput);

            const spinner = document.createElement('div');
            spinner.className = 'custom-spinner';
            spinner.dataset.target = valueProp;

            const upBtn = document.createElement('div');
            upBtn.className = 'custom-spinner-btn';
            upBtn.dataset.action = 'up';
            upBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg>';

            const downBtn = document.createElement('div');
            downBtn.className = 'custom-spinner-btn';
            downBtn.dataset.action = 'down';
            downBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg>';

            const onSpinnerClick = (btn) => {
                const step = parseFloat(input.step) || 0.1;
                let value = parseFloat(input.value) || 0;
                const decimals = getStepDecimals(step);
                const factor = Math.pow(10, decimals);
                if (btn.dataset.action === 'up') {
                    value = Math.round((value + step) * factor) / factor;
                } else {
                    value = Math.round((value - step) * factor) / factor;
                }
                input.value = value;
                input.dispatchEvent(new Event('change'));
            };

            upBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(upBtn); });
            downBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(downBtn); });

            spinner.appendChild(upBtn);
            spinner.appendChild(downBtn);
            valueWrapper.appendChild(input);
            valueWrapper.appendChild(spinner);
            row.appendChild(valueWrapper);

            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'tv-prop-controls';

            const colorBtn = document.createElement('button');
            colorBtn.className = 'tv-color-btn';
            colorBtn.dataset.prop = 'gannLevelColor';
            colorBtn.dataset.levelIndex = idx;
            colorBtn.dataset.levelGroup = levelGroupKey;
            colorBtn.style.background = level.color || '#787b86';
            controlsWrapper.appendChild(colorBtn);
            row.appendChild(controlsWrapper);

            list.appendChild(row);
            return row;
            };

            levelsArray.forEach((level, idx) => addLevelRow(level, idx));
            section.appendChild(list);

            const buttonRow = document.createElement('div');
            buttonRow.style.cssText = 'display: flex; gap: 8px; margin-top: 10px;';

            const addBtn = document.createElement('button');
            addBtn.style.cssText = `
                flex: 1; padding: 8px 12px; background: #787b8620; border: 1px solid #787b8640;
                border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
            `;
            addBtn.textContent = '+ Add Level';
            addBtn.onmouseenter = () => { addBtn.style.background = '#787b8630'; };
            addBtn.onmouseleave = () => { addBtn.style.background = '#787b8620'; };
            addBtn.onclick = () => {
                const newLevel = {
                    value: 0.5,
                    enabled: true,
                    color: '#787b86',
                    lineType: drawing.style.levelsLineDasharray ?? '',
                    lineWidth: parseInt(drawing.style.levelsLineWidth) || 1
                };
                levelsArray.push(newLevel);
                addLevelRow(newLevel, levelsArray.length - 1);
                applyChanges();
            };
            buttonRow.appendChild(addBtn);

            const resetBtn = document.createElement('button');
            resetBtn.style.cssText = `
                padding: 8px 12px; background: transparent; border: 1px solid #363a45;
                border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
            `;
            resetBtn.textContent = 'Reset';
            resetBtn.onmouseenter = () => { resetBtn.style.borderColor = '#787b86'; resetBtn.style.color = '#d1d4dc'; };
            resetBtn.onmouseleave = () => { resetBtn.style.borderColor = '#363a45'; resetBtn.style.color = '#787b86'; };
            resetBtn.onclick = () => {
                const fresh = defaults.map(l => ({ ...l }));
                levelsArray.splice(0, levelsArray.length, ...fresh);
                list.innerHTML = '';
                levelsArray.forEach((level, idx) => addLevelRow(level, idx));
                normalizeLevelsStyle();
                applyChanges();
            };
            buttonRow.appendChild(resetBtn);

            section.appendChild(buttonRow);
        };

        buildGroup('Grid Levels', 'gridLevels', gridLevels, defaultGridLevels);
        buildGroup('Fan Levels', 'fanLevels', fanLevels, defaultFanLevels);
        buildGroup('Arc Levels', 'arcLevels', arcLevels, defaultArcLevels);
        container.appendChild(section);
    }

    buildGannFanLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        const header = document.createElement('div');
        header.style.cssText = 'color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;';
        header.textContent = 'Gann Fan Levels';
        section.appendChild(header);

        if (!drawing.style) drawing.style = {};

        const defaultFanLevels = [
            { value: 8, enabled: true, color: '#ff9800', label: '1/8' },
            { value: 4, enabled: true, color: '#4caf50', label: '1/4' },
            { value: 3, enabled: true, color: '#00c853', label: '1/3' },
            { value: 2, enabled: true, color: '#00bcd4', label: '1/2' },
            { value: 1, enabled: true, color: '#2962ff', label: '1/1' },
            { value: 0.5, enabled: true, color: '#9c27b0', label: '2/1' },
            { value: 1 / 3, enabled: true, color: '#e91e63', label: '3/1' },
            { value: 0.25, enabled: true, color: '#f23645', label: '4/1' },
            { value: 0.125, enabled: true, color: '#b71c1c', label: '8/1' }
        ];

        const ensureFanLevels = () => {
            if (Array.isArray(drawing.style.fanLevels) && drawing.style.fanLevels.length > 0) return drawing.style.fanLevels;
            if (Array.isArray(drawing.style.angles) && drawing.style.angles.length > 0) {
                drawing.style.fanLevels = drawing.style.angles.map(a => {
                    const label = a && a.label ? `${a.label}` : '';
                    let mult = (a && a.ratio != null && isFinite(parseFloat(a.ratio))) ? parseFloat(a.ratio) : 1;
                    if (label.includes('×')) {
                        const parts = label.split('×').map(s => s.trim());
                        const n = parseFloat(parts[0]);
                        const d = parseFloat(parts[1]);
                        if (isFinite(n) && isFinite(d) && n !== 0) mult = d / n;
                    }
                    const mappedLabel = label.includes('×') ? label.replace('×', '/') : (label || '1/1');
                    return {
                        value: mult,
                        label: mappedLabel,
                        enabled: a && a.enabled !== false,
                        color: (a && a.color) ? a.color : (drawing.style.stroke || '#4caf50')
                    };
                });
                return drawing.style.fanLevels;
            }
            drawing.style.fanLevels = defaultFanLevels.map(l => ({ ...l }));
            return drawing.style.fanLevels;
        };

        const fanLevels = ensureFanLevels();

        const normalizeArray = (arr) => {
            arr.forEach(l => {
                if (!l) return;
                if (l.enabled === undefined) l.enabled = true;
                if (!l.color) l.color = '#787b86';
                if (l.value === undefined || l.value === null || isNaN(parseFloat(l.value))) l.value = 1;
                if (l.label == null) l.label = '';
            });
        };
        normalizeArray(fanLevels);

        if (drawing.style.levelsLineDasharray === undefined) drawing.style.levelsLineDasharray = '';
        if (drawing.style.levelsLineWidth === undefined) drawing.style.levelsLineWidth = 1;
        if (drawing.style.showZones === undefined) drawing.style.showZones = true;
        if (drawing.style.backgroundOpacity === undefined) drawing.style.backgroundOpacity = 0.12;

        const normalizeLevelsStyle = () => {
            const lt = drawing.style.levelsLineDasharray ?? '';
            const lw = parseInt(drawing.style.levelsLineWidth) || 1;
            fanLevels.forEach(lvl => { if (lvl) { lvl.lineType = lt; lvl.lineWidth = lw; } });
        };
        normalizeLevelsStyle();

        const applyChanges = () => {
            self.pendingChanges.style = {
                ...self.pendingChanges.style,
                fanLevels,
                levelsLineDasharray: drawing.style.levelsLineDasharray,
                levelsLineWidth: drawing.style.levelsLineWidth,
                showZones: drawing.style.showZones,
                backgroundOpacity: drawing.style.backgroundOpacity
            };

            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            if (drawingManager) {
                const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                if (!actualDrawing.style) actualDrawing.style = {};
                actualDrawing.style.fanLevels = fanLevels;
                actualDrawing.style.levelsLineDasharray = drawing.style.levelsLineDasharray;
                actualDrawing.style.levelsLineWidth = drawing.style.levelsLineWidth;
                actualDrawing.style.showZones = drawing.style.showZones;
                actualDrawing.style.backgroundOpacity = drawing.style.backgroundOpacity;
                Object.assign(actualDrawing.style, drawing.style);
                drawingManager.renderDrawing(actualDrawing);
                drawingManager.saveDrawings();
                return;
            }

            self.renderPreview(drawing);
        };

        const levelsStyleRow = document.createElement('div');
        levelsStyleRow.className = 'tv-prop-row';
        levelsStyleRow.style.cssText = 'display:flex; align-items:center; gap: 8px; margin-bottom: 12px;';

        const levelsLabel = document.createElement('span');
        levelsLabel.className = 'tv-prop-label';
        levelsLabel.textContent = 'Levels';
        levelsStyleRow.appendChild(levelsLabel);

        const levelsControls = document.createElement('div');
        levelsControls.className = 'tv-prop-controls';
        levelsControls.style.marginLeft = 'auto';

        const levelsTypeSelect = document.createElement('select');
        levelsTypeSelect.className = 'tv-select';
        levelsTypeSelect.style.width = '40px';
        const currentLevelsType = drawing.style.levelsLineDasharray ?? '';
        levelsTypeSelect.innerHTML = `
            <option value="" ${currentLevelsType === '' ? 'selected' : ''}>───────</option>
            <option value="10,6" ${(currentLevelsType === '10,6' || currentLevelsType === '5,5') ? 'selected' : ''}>─ ─ ─ ─</option>
            <option value="2,2" ${currentLevelsType === '2,2' ? 'selected' : ''}>··········</option>
            <option value="8,4,2,4" ${currentLevelsType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
        `;
        levelsTypeSelect.onchange = () => {
            drawing.style.levelsLineDasharray = levelsTypeSelect.value;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsTypeSelect);

        const levelsWidthSelect = document.createElement('select');
        levelsWidthSelect.className = 'tv-select';
        levelsWidthSelect.style.width = '48px';
        const widths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const currentLevelsWidth = parseInt(drawing.style.levelsLineWidth) || 1;
        levelsWidthSelect.innerHTML = widths.map(w => `<option value="${w}" ${currentLevelsWidth === w ? 'selected' : ''}>${w}px</option>`).join('');
        levelsWidthSelect.onchange = () => {
            const w = parseInt(levelsWidthSelect.value);
            drawing.style.levelsLineWidth = (!isNaN(w) && w > 0) ? w : 1;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsWidthSelect);

        levelsStyleRow.appendChild(levelsControls);
        section.appendChild(levelsStyleRow);

        const optionsRow = document.createElement('div');
        optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45; align-items: center;';

        const zonesLabel = document.createElement('label');
        zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
        const zonesCheck = document.createElement('input');
        zonesCheck.type = 'checkbox';
        zonesCheck.checked = drawing.style.showZones !== false;
        zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
        zonesCheck.onchange = () => {
            drawing.style.showZones = zonesCheck.checked;
            applyChanges();
        };
        zonesLabel.appendChild(zonesCheck);
        zonesLabel.appendChild(document.createTextNode('Show Zones'));
        optionsRow.appendChild(zonesLabel);

        const opacity = document.createElement('input');
        opacity.type = 'range';
        opacity.min = '0';
        opacity.max = '1';
        opacity.step = '0.05';
        opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
        opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
        opacity.oninput = () => {
            drawing.style.backgroundOpacity = parseFloat(opacity.value);
            applyChanges();
        };
        optionsRow.appendChild(opacity);
        section.appendChild(optionsRow);

        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = 'color: #787b86; font-size: 12px; margin: 10px 0 8px 0; text-transform: uppercase;';
        groupHeader.textContent = 'Fan Levels';
        section.appendChild(groupHeader);

        const list = document.createElement('div');
        list.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 220px; overflow-y: auto; align-items: start;';

        const getStepDecimals = (n) => {
            const s = String(n);
            if (s.includes('e-')) {
                const parts = s.split('e-');
                const exp = parseInt(parts[1], 10);
                return isNaN(exp) ? 0 : exp;
            }
            const dot = s.indexOf('.');
            return dot === -1 ? 0 : (s.length - dot - 1);
        };

        const addLevelRow = (level, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-prop-row fib-level-row';
            row.style.cssText = 'display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 4px 0;';

            const checkboxWrapper = document.createElement('div');
            const currentEnabled = level.enabled !== false;
            checkboxWrapper.style.cssText = `
                width: 20px; height: 20px; border: 2px solid #363a45; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; background: ${currentEnabled ? '#2962ff' : 'transparent'};
                transition: all 0.15s;
            `;
            checkboxWrapper.innerHTML = currentEnabled
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                : '';
            checkboxWrapper.onclick = (e) => {
                e.stopPropagation();
                const enabledNow = level.enabled !== false;
                const enabledNext = !enabledNow;
                level.enabled = enabledNext;
                checkboxWrapper.style.background = enabledNext ? '#2962ff' : 'transparent';
                checkboxWrapper.innerHTML = enabledNext
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                    : '';
                applyChanges();
            };
            row.appendChild(checkboxWrapper);

            const valueWrapper = document.createElement('div');
            valueWrapper.className = 'number-input-wrapper';
            valueWrapper.style.width = '100%';

            const valueProp = `gannFanLevelValue_${idx}`;

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'tv-number-input';
            input.dataset.prop = valueProp;
            input.value = level.value;
            input.step = '0.001';
            input.style.cssText = 'color: #d1d4dc; font-size: 13px; text-align: center; width: 100%; flex: 1; min-width: 0;';

            const updateLevelFromInput = () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) {
                    level.value = parsed;
                    applyChanges();
                }
            };
            input.addEventListener('input', updateLevelFromInput);
            input.addEventListener('change', updateLevelFromInput);

            const spinner = document.createElement('div');
            spinner.className = 'custom-spinner';
            spinner.dataset.target = valueProp;

            const upBtn = document.createElement('div');
            upBtn.className = 'custom-spinner-btn';
            upBtn.dataset.action = 'up';
            upBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg>';

            const downBtn = document.createElement('div');
            downBtn.className = 'custom-spinner-btn';
            downBtn.dataset.action = 'down';
            downBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg>';

            const onSpinnerClick = (btn) => {
                const step = parseFloat(input.step) || 0.1;
                let value = parseFloat(input.value) || 0;
                const decimals = getStepDecimals(step);
                const factor = Math.pow(10, decimals);
                if (btn.dataset.action === 'up') {
                    value = Math.round((value + step) * factor) / factor;
                } else {
                    value = Math.round((value - step) * factor) / factor;
                }
                input.value = value;
                input.dispatchEvent(new Event('change'));
            };

            upBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(upBtn); });
            downBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(downBtn); });

            spinner.appendChild(upBtn);
            spinner.appendChild(downBtn);

            valueWrapper.appendChild(input);
            valueWrapper.appendChild(spinner);
            row.appendChild(valueWrapper);

            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'tv-prop-controls';

            const colorBtn = document.createElement('button');
            colorBtn.className = 'tv-color-btn';
            colorBtn.dataset.levelIndex = idx;
            colorBtn.dataset.levelGroup = 'fanLevels';
            colorBtn.style.background = level.color || '#787b86';
            controlsWrapper.appendChild(colorBtn);
            row.appendChild(controlsWrapper);

            list.appendChild(row);
            return row;
        };

        fanLevels.forEach((level, idx) => addLevelRow(level, idx));
        section.appendChild(list);

        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = 'display: flex; gap: 8px; margin-top: 10px;';

        const addBtn = document.createElement('button');
        addBtn.style.cssText = `
            flex: 1; padding: 8px 12px; background: #787b8620; border: 1px solid #787b8640;
            border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
        `;
        addBtn.textContent = '+ Add Level';
        addBtn.onmouseenter = () => { addBtn.style.background = '#787b8630'; };
        addBtn.onmouseleave = () => { addBtn.style.background = '#787b8620'; };
        addBtn.onclick = () => {
            const newLevel = {
                value: 1,
                enabled: true,
                color: '#787b86',
                label: '',
                lineType: drawing.style.levelsLineDasharray ?? '',
                lineWidth: parseInt(drawing.style.levelsLineWidth) || 1
            };
            fanLevels.push(newLevel);
            addLevelRow(newLevel, fanLevels.length - 1);
            applyChanges();
        };
        buttonRow.appendChild(addBtn);

        const resetBtn = document.createElement('button');
        resetBtn.style.cssText = `
            padding: 8px 12px; background: transparent; border: 1px solid #363a45;
            border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
        `;
        resetBtn.textContent = 'Reset';
        resetBtn.onmouseenter = () => { resetBtn.style.borderColor = '#787b86'; resetBtn.style.color = '#d1d4dc'; };
        resetBtn.onmouseleave = () => { resetBtn.style.borderColor = '#363a45'; resetBtn.style.color = '#787b86'; };
        resetBtn.onclick = () => {
            const fresh = defaultFanLevels.map(l => ({ ...l }));
            fanLevels.splice(0, fanLevels.length, ...fresh);
            list.innerHTML = '';
            fanLevels.forEach((level, idx) => addLevelRow(level, idx));
            normalizeLevelsStyle();
            applyChanges();
        };
        buttonRow.appendChild(resetBtn);

        section.appendChild(buttonRow);
        container.appendChild(section);
    }

    /**
     * Build Pitchfork Style Section (DOM-based)
     */
    buildPitchforkStyleSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-style-section';
        section.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        // Style dropdown row
        const styleRow = document.createElement('div');
        styleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

        const styleLabel = document.createElement('span');
        styleLabel.style.cssText = 'color: #787b86; font-size: 12px;';
        styleLabel.textContent = 'Style';

        const styleDropdown = document.createElement('select');
        styleDropdown.style.cssText = 'background: #1e222d; border: 1px solid #363a45; border-radius: 4px; color: #d1d4dc; padding: 6px 8px; font-size: 12px; cursor: pointer; min-width: 150px;';
        
        const styles = [
            { value: 'original', label: 'Original' },
            { value: 'schiff', label: 'Schiff' },
            { value: 'modified-schiff', label: 'Modified Schiff' },
            { value: 'inside', label: 'Inside' }
        ];

        styles.forEach(style => {
            const option = document.createElement('option');
            option.value = style.value;
            option.textContent = style.label;
            if (drawing.style.pitchforkStyle === style.value) {
                option.selected = true;
            }
            styleDropdown.appendChild(option);
        });

        styleDropdown.onchange = () => {
            drawing.style.pitchforkStyle = styleDropdown.value;
            
            // Find and update the actual drawing in the manager
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    actualDrawing.style.pitchforkStyle = styleDropdown.value;
                    window.drawingManager.renderDrawing(actualDrawing);
                    window.drawingManager.saveDrawings();
                }
            }
        };

        styleRow.appendChild(styleLabel);
        styleRow.appendChild(styleDropdown);
        section.appendChild(styleRow);

        container.appendChild(section);
    }

    /**
     * Build Pitchfork Levels Section (DOM-based)
     */
    buildPitchforkLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        const header = document.createElement('div');
        header.style.cssText = 'color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;';
        header.textContent = 'Pitchfork Levels';
        section.appendChild(header);

        if (drawing.type === 'pitchfan') {
            const applyStyle = () => {
                if (window.drawingManager) {
                    const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                    if (!actualDrawing.style) actualDrawing.style = {};
                    Object.assign(actualDrawing.style, drawing.style);
                    window.drawingManager.renderDrawing(actualDrawing);
                    window.drawingManager.saveDrawings();
                    return;
                }
                self.renderPreview(drawing);
            };

            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const zonesLabel = document.createElement('label');
            zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const zonesCheck = document.createElement('input');
            zonesCheck.type = 'checkbox';
            zonesCheck.checked = drawing.style.showZones !== false;
            zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            zonesCheck.onchange = () => {
                if (!drawing.style) drawing.style = {};
                drawing.style.showZones = zonesCheck.checked;
                applyStyle();
            };
            zonesLabel.appendChild(zonesCheck);
            zonesLabel.appendChild(document.createTextNode('Show Zones'));
            optionsRow.appendChild(zonesLabel);

            const opacity = document.createElement('input');
            opacity.type = 'range';
            opacity.min = '0';
            opacity.max = '1';
            opacity.step = '0.05';
            opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.2);
            opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
            opacity.oninput = () => {
                if (!drawing.style) drawing.style = {};
                drawing.style.backgroundOpacity = parseFloat(opacity.value);
                applyStyle();
            };
            optionsRow.appendChild(opacity);

            section.appendChild(optionsRow);
        }

        // Default levels matching PitchforkTool constructor
        const defaultLevels = [
            { value: 0.25, label: '0.25', color: '#cd853f', enabled: false },
            { value: 0.382, label: '0.382', color: '#90ee90', enabled: false },
            { value: 0.5, label: '0.5', color: '#00bcd4', enabled: true },
            { value: 0.618, label: '0.618', color: '#5f9ea0', enabled: false },
            { value: 0.75, label: '0.75', color: '#5f9ea0', enabled: false },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
            { value: 1.5, label: '1.5', color: '#9370db', enabled: false },
            { value: 1.75, label: '1.75', color: '#db7093', enabled: false }
        ];

        // Initialize levels if not present (same pattern as parallel channel)
        if (!Array.isArray(drawing.levels) || drawing.levels.length === 0) {
            drawing.levels = defaultLevels.map(l => ({ ...l }));
        } else {
            // Filter out level 2 from existing drawings
            drawing.levels = drawing.levels.filter(l => l.value !== 2);
        }

        // Helper to apply changes immediately (same pattern as parallel channel)
        const applyChanges = () => {
            // Sync levels to pendingChanges
            self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    actualDrawing.levels = JSON.parse(JSON.stringify(drawing.levels));
                }
            }
            self.renderPreview(drawing);
        };

        const list = document.createElement('div');
        list.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

        drawing.levels.forEach((level, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-prop-row';
            row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

            // Checkbox (styled like TradingView - same as parallel channel)
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.style.cssText = `
                width: 22px; height: 22px; border: 2px solid #363a45; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; background: ${level.enabled ? '#2962ff' : 'transparent'};
                transition: all 0.15s;
            `;
            checkboxWrapper.innerHTML = level.enabled ? 
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
            checkboxWrapper.onclick = (e) => {
                e.stopPropagation();
                level.enabled = !level.enabled;
                checkboxWrapper.style.background = level.enabled ? '#2962ff' : 'transparent';
                checkboxWrapper.innerHTML = level.enabled ? 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
                
                // Update the drawing's level data
                if (drawing.levels && drawing.levels[idx]) {
                    drawing.levels[idx].enabled = level.enabled;
                }
                
                // Save changes through the UI's applyChanges method (same as parallel channel)
                self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
                self.applyChanges(drawing);
            };
            row.appendChild(checkboxWrapper);

            // Value input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = level.label || level.value;
            input.style.cssText = `
                background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
                color: #d1d4dc; padding: 5px 8px; font-size: 11px; width: 60px;
                outline: none; transition: border-color 0.15s; box-sizing: border-box;
            `;
            input.onfocus = () => { input.style.borderColor = '#2962ff'; };
            input.onblur = () => { input.style.borderColor = 'rgba(255,255,255,0.12)'; };
            input.oninput = () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) {
                    level.value = parsed;
                    level.label = input.value;
                    if (drawing.levels && drawing.levels[idx]) {
                        drawing.levels[idx].value = parsed;
                        drawing.levels[idx].label = input.value;
                    }
                    applyChanges();
                }
            };
            row.appendChild(input);

            // Controls wrapper (same as parallel channel)
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'tv-prop-controls';

            // Color button - use tv-color-btn class for consistent hover style
            const colorBtn = document.createElement('button');
            colorBtn.className = 'tv-color-btn';
            colorBtn.dataset.prop = `level${idx}Color`;
            colorBtn.dataset.levelIndex = idx;
            colorBtn.style.background = level.color;
            controlsWrapper.appendChild(colorBtn);
            row.appendChild(controlsWrapper);

            list.appendChild(row);
        });

        section.appendChild(list);
        container.appendChild(section);
    }

    /**
     * Build Fibonacci Levels Section (DOM-based) - TradingView style
     */
    buildFibonacciLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = (drawing.type === 'fib-channel' || drawing.type === 'fib-timezone' || drawing.type === 'fib-speed-fan')
            ? 'margin-top: 16px; padding-top: 0; border-top: none;'
            : 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        const header = document.createElement('div');
        header.style.cssText = 'color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;';
        header.textContent = 'Fibonacci Levels';
        section.appendChild(header);

        const isTimeZone = drawing.type === 'fib-timezone';
        const usesVisible = drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension';
        const lockFixedLevelCount = drawing.type === 'fibonacci-retracement' || drawing.type === 'fib-channel' || drawing.type === 'trend-fib-extension';
        const fixedLevelCount = 20;

        const getDefaultLevelsForType = () => {
            if (drawing.type === 'fibonacci-extension') {
                return [
                    { value: 0, label: '0', color: '#787b86', visible: true },
                    { value: 0.618, label: '0.618', color: '#4caf50', visible: true },
                    { value: 1, label: '1', color: '#787b86', visible: true },
                    { value: 1.272, label: '1.272', color: '#2196f3', visible: true },
                    { value: 1.618, label: '1.618', color: '#9c27b0', visible: true },
                    { value: 2.618, label: '2.618', color: '#e91e63', visible: true },
                    { value: 4.236, label: '4.236', color: '#f44336', visible: true }
                ];
            }
            if (drawing.type === 'trend-fib-extension') {
                return [
                    { value: -0.618, label: '-0.618', color: '#9c27b0', enabled: false },
                    { value: -0.5, label: '-0.5', color: '#673ab7', enabled: false },
                    { value: -0.382, label: '-0.382', color: '#2196f3', enabled: false },
                    { value: -0.236, label: '-0.236', color: '#00bcd4', enabled: false },
                    { value: 0, label: '0', color: '#787b86', enabled: true },
                    { value: 0.236, label: '0.236', color: '#f23645', enabled: true },
                    { value: 0.382, label: '0.382', color: '#ff9800', enabled: true },
                    { value: 0.5, label: '0.5', color: '#ffeb3b', enabled: true },
                    { value: 0.618, label: '0.618', color: '#4caf50', enabled: true },
                    { value: 0.786, label: '0.786', color: '#2196f3', enabled: true },
                    { value: 1, label: '1', color: '#787b86', enabled: true },
                    { value: 1.272, label: '1.272', color: '#00bcd4', enabled: false },
                    { value: 1.414, label: '1.414', color: '#4caf50', enabled: false },
                    { value: 1.618, label: '1.618', color: '#9c27b0', enabled: false },
                    { value: 2, label: '2', color: '#e91e63', enabled: false },
                    { value: 2.272, label: '2.272', color: '#ff9800', enabled: false },
                    { value: 2.618, label: '2.618', color: '#f44336', enabled: false },
                    { value: 3.618, label: '3.618', color: '#b71c1c', enabled: false },
                    { value: 4.236, label: '4.236', color: '#607d8b', enabled: false },
                    { value: 5, label: '5', color: '#3f51b5', enabled: false }
                ];
            }
            if (drawing.type === 'fib-timezone') {
                return [
                    { value: 0, color: '#787b86', enabled: true },
                    { value: 1, color: '#f23645', enabled: true },
                    { value: 2, color: '#ff9800', enabled: true },
                    { value: 3, color: '#ffeb3b', enabled: true },
                    { value: 5, color: '#4caf50', enabled: true },
                    { value: 8, color: '#00bcd4', enabled: true },
                    { value: 13, color: '#2962ff', enabled: true },
                    { value: 21, color: '#9c27b0', enabled: true },
                    { value: 34, color: '#e91e63', enabled: true },
                    { value: 55, color: '#673ab7', enabled: false },
                    { value: 89, color: '#3f51b5', enabled: false },
                    { value: 144, color: '#607d8b', enabled: false }
                ];
            }
            if (drawing.type === 'fib-speed-fan') {
                return [
                    { value: 1, color: '#2962ff', enabled: true },
                    { value: 0.75, color: '#00bcd4', enabled: true },
                    { value: 0.618, color: '#4caf50', enabled: true },
                    { value: 0.5, color: '#ffeb3b', enabled: true },
                    { value: 0.382, color: '#ff9800', enabled: true },
                    { value: 0.25, color: '#f23645', enabled: true },
                    { value: 0, color: '#787b86', enabled: true }
                ];
            }
            if (drawing.type === 'fibonacci-retracement') {
                return [
                    { value: -0.618, label: '-0.618', color: '#9c27b0', visible: false },
                    { value: -0.5, label: '-0.5', color: '#673ab7', visible: false },
                    { value: -0.382, label: '-0.382', color: '#2196f3', visible: false },
                    { value: -0.236, label: '-0.236', color: '#00bcd4', visible: false },
                    { value: 0, label: '0', color: '#787b86', visible: true },
                    { value: 0.236, label: '0.236', color: '#f23645', visible: true },
                    { value: 0.382, label: '0.382', color: '#ff9800', visible: true },
                    { value: 0.5, label: '0.5', color: '#ffeb3b', visible: true },
                    { value: 0.618, label: '0.618', color: '#4caf50', visible: true },
                    { value: 0.786, label: '0.786', color: '#2196f3', visible: true },
                    { value: 1, label: '1', color: '#787b86', visible: true },
                    { value: 1.272, label: '1.272', color: '#00bcd4', visible: false },
                    { value: 1.414, label: '1.414', color: '#4caf50', visible: false },
                    { value: 1.618, label: '1.618', color: '#9c27b0', visible: false },
                    { value: 2, label: '2', color: '#e91e63', visible: false },
                    { value: 2.272, label: '2.272', color: '#ff9800', visible: false },
                    { value: 2.618, label: '2.618', color: '#f44336', visible: false },
                    { value: 3.618, label: '3.618', color: '#b71c1c', visible: false },
                    { value: 4.236, label: '4.236', color: '#607d8b', visible: false },
                    { value: 5, label: '5', color: '#3f51b5', visible: false }
                ];
            }
            if (drawing.type === 'fib-channel') {
                return [
                    { value: -0.618, label: '-0.618', color: '#9c27b0', enabled: false },
                    { value: -0.5, label: '-0.5', color: '#673ab7', enabled: false },
                    { value: -0.382, label: '-0.382', color: '#2196f3', enabled: false },
                    { value: -0.236, label: '-0.236', color: '#00bcd4', enabled: false },
                    { value: 0, label: '0', color: '#787b86', enabled: true },
                    { value: 0.236, label: '0.236', color: '#f23645', enabled: true },
                    { value: 0.382, label: '0.382', color: '#ff9800', enabled: true },
                    { value: 0.5, label: '0.5', color: '#ffeb3b', enabled: true },
                    { value: 0.618, label: '0.618', color: '#4caf50', enabled: true },
                    { value: 0.786, label: '0.786', color: '#2196f3', enabled: true },
                    { value: 1, label: '1', color: '#787b86', enabled: true },
                    { value: 1.272, label: '1.272', color: '#00bcd4', enabled: false },
                    { value: 1.414, label: '1.414', color: '#4caf50', enabled: false },
                    { value: 1.618, label: '1.618', color: '#9c27b0', enabled: false },
                    { value: 2, label: '2', color: '#e91e63', enabled: false },
                    { value: 2.272, label: '2.272', color: '#ff9800', enabled: false },
                    { value: 2.618, label: '2.618', color: '#f44336', enabled: false },
                    { value: 3.618, label: '3.618', color: '#b71c1c', enabled: false },
                    { value: 4.236, label: '4.236', color: '#607d8b', enabled: false },
                    { value: 5, label: '5', color: '#3f51b5', enabled: false }
                ];
            }
            // Default Fibonacci levels (retracement and generic)
            return [
                { value: 0, label: '0', color: '#787b86', visible: true },
                { value: 0.236, label: '0.236', color: '#f23645', visible: true },
                { value: 0.382, label: '0.382', color: '#ff9800', visible: true },
                { value: 0.5, label: '0.5', color: '#ffeb3b', visible: true },
                { value: 0.618, label: '0.618', color: '#4caf50', visible: true },
                { value: 0.786, label: '0.786', color: '#2196f3', visible: true },
                { value: 1, label: '1', color: '#787b86', visible: true }
            ];
        };

        const ensureLevelsArray = () => {
            if (isTimeZone) {
                if (!Array.isArray(drawing.levels) || drawing.levels.length === 0) {
                    if (Array.isArray(drawing.style.levels) && drawing.style.levels.length) {
                        drawing.levels = drawing.style.levels;
                    } else if (Array.isArray(drawing.fibNumbers) && drawing.fibNumbers.length) {
                        drawing.levels = drawing.fibNumbers;
                    } else if (Array.isArray(drawing.style.fibNumbers) && drawing.style.fibNumbers.length) {
                        drawing.levels = drawing.style.fibNumbers;
                    } else {
                        drawing.levels = getDefaultLevelsForType().map(l => ({ ...l }));
                    }
                }
                drawing.fibNumbers = drawing.levels;
                if (!drawing.style) drawing.style = {};
                drawing.style.fibNumbers = drawing.levels;
                drawing.style.levels = drawing.levels;
                return drawing.levels;
            }

            if (!Array.isArray(drawing.levels) || drawing.levels.length === 0) {
                drawing.levels = Array.isArray(drawing.style.levels) && drawing.style.levels.length
                    ? drawing.style.levels
                    : getDefaultLevelsForType().map(l => ({ ...l }));
            }
            return drawing.levels;
        };

        const levelsRef = ensureLevelsArray();

        if (lockFixedLevelCount) {
            const defaultsFixed = getDefaultLevelsForType().map(l => ({ ...l }));
            if (!Array.isArray(levelsRef) || levelsRef.length === 0) {
                levelsRef.splice(0, levelsRef.length, ...defaultsFixed);
            } else {
                if (levelsRef.length < fixedLevelCount) {
                    const existingValues = new Set(levelsRef
                        .filter(l => l && typeof l === 'object')
                        .map(l => parseFloat(l.value))
                        .filter(v => !isNaN(v)));
                    for (const def of defaultsFixed) {
                        if (levelsRef.length >= fixedLevelCount) break;
                        const v = parseFloat(def.value);
                        if (!isNaN(v) && existingValues.has(v)) continue;
                        levelsRef.push({ ...def });
                        existingValues.add(v);
                    }
                    while (levelsRef.length < fixedLevelCount) {
                        levelsRef.push({
                            value: 0,
                            label: '0',
                            color: '#787b86',
                            ...(usesVisible ? { visible: false } : { enabled: false })
                        });
                    }
                } else if (levelsRef.length > fixedLevelCount) {
                    levelsRef.splice(fixedLevelCount);
                }
            }
        }

        // Normalize levels so UI edits (enabled/visible toggles) always mutate real objects.
        // Some tools historically stored levels as numbers; toggling would otherwise be a no-op.
        const defaultsForType = getDefaultLevelsForType();
        const findDefaultForValue = (v) => {
            const num = parseFloat(v);
            if (isNaN(num)) return null;
            return defaultsForType.find(d => {
                const dv = typeof d === 'object' ? d.value : d;
                return parseFloat(dv) === num;
            }) || null;
        };
        for (let i = 0; i < levelsRef.length; i++) {
            const lvl = levelsRef[i];
            if (lvl == null) continue;
            if (typeof lvl !== 'object') {
                const value = parseFloat(lvl);
                const def = findDefaultForValue(value);
                levelsRef[i] = {
                    value: isNaN(value) ? 0 : value,
                    label: def && def.label != null ? `${def.label}` : (isNaN(value) ? '0' : `${value}`),
                    color: def && def.color ? def.color : '#787b86',
                    ...(usesVisible ? { visible: def ? (def.visible !== false) : true } : { enabled: def ? (def.enabled !== false) : true })
                };
            } else {
                if (levelsRef[i].value == null && levelsRef[i].label != null) {
                    const parsed = parseFloat(levelsRef[i].label);
                    if (!isNaN(parsed)) levelsRef[i].value = parsed;
                }
                if (levelsRef[i].value != null) {
                    const def = findDefaultForValue(levelsRef[i].value);
                    if (def && !levelsRef[i].color) levelsRef[i].color = def.color;
                }
                if (usesVisible) {
                    if (levelsRef[i].visible === undefined) levelsRef[i].visible = true;
                    if (levelsRef[i].enabled !== undefined) delete levelsRef[i].enabled;
                } else {
                    if (levelsRef[i].enabled === undefined) levelsRef[i].enabled = true;
                    if (levelsRef[i].visible !== undefined) delete levelsRef[i].visible;
                }
            }
        }

        const isEnabled = (lvl) => {
            if (!lvl) return false;
            if (usesVisible) return lvl.visible !== false;
            return lvl.enabled !== false;
        };

        const setEnabled = (lvl, enabled) => {
            if (!lvl) return;
            if (usesVisible) lvl.visible = !!enabled;
            else lvl.enabled = !!enabled;
        };

        // Global levels style defaults (apply to all levels)
        if (drawing.style.levelsLineDasharray === undefined) {
            const firstType = levelsRef.find(l => l && l.lineType != null)?.lineType;
            drawing.style.levelsLineDasharray = firstType != null ? `${firstType}` : '';
        }
        if (drawing.style.levelsLineWidth === undefined) {
            const firstWidth = levelsRef.find(l => l && l.lineWidth != null)?.lineWidth;
            const parsed = parseInt(firstWidth);
            drawing.style.levelsLineWidth = (!isNaN(parsed) && parsed > 0) ? parsed : 2;
        }

        // Normalize existing levels to the global levels style
        levelsRef.forEach(lvl => {
            if (!lvl) return;
            lvl.lineType = drawing.style.levelsLineDasharray;
            lvl.lineWidth = parseInt(drawing.style.levelsLineWidth) || 2;
        });

        // Helper to apply changes immediately
        // IMPORTANT: avoid replacing the levels array during live edits (deep-copy) because
        // it breaks the existing UI row closures that reference the level objects.
        const applyChanges = () => {
            self.pendingChanges.levels = levelsRef;
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                if (isTimeZone) {
                    drawing.levels = levelsRef;
                    drawing.style.levels = levelsRef;
                    actualDrawing.levels = levelsRef;
                    drawing.fibNumbers = levelsRef;
                    drawing.style.fibNumbers = levelsRef;
                    actualDrawing.fibNumbers = levelsRef;
                    if (!actualDrawing.style) actualDrawing.style = {};
                    actualDrawing.style.levels = levelsRef;
                    actualDrawing.style.fibNumbers = levelsRef;
                } else {
                    drawing.levels = levelsRef;
                    drawing.style.levels = levelsRef;
                    actualDrawing.levels = levelsRef;
                    if (!actualDrawing.style) actualDrawing.style = {};
                    actualDrawing.style.levels = levelsRef;
                }
                if (!actualDrawing.style) actualDrawing.style = {};
                Object.assign(actualDrawing.style, drawing.style);
                window.drawingManager.renderDrawing(actualDrawing);
                window.drawingManager.saveDrawings();
                return;
            }
            self.renderPreview(drawing);
        };

        if (drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension' || drawing.type === 'trend-fib-extension' || drawing.type === 'fib-channel') {
            if (drawing.style.reverse === undefined) drawing.style.reverse = false;
            if (drawing.style.showPrices === undefined) drawing.style.showPrices = true;
            if (drawing.style.levelsEnabled === undefined) drawing.style.levelsEnabled = true;
            if (drawing.style.levelsLabelMode !== 'percent' && drawing.style.levelsLabelMode !== 'values') {
                drawing.style.levelsLabelMode = 'values';
            }
            if (drawing.style.backgroundOpacity === undefined || drawing.style.backgroundOpacity === null || isNaN(parseFloat(drawing.style.backgroundOpacity))) {
                drawing.style.backgroundOpacity = 0.08;
            }

            const controlsWrap = document.createElement('div');
            controlsWrap.style.cssText = 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #363a45;';

            const makeRow = (labelText) => {
                const row = document.createElement('div');
                row.className = 'tv-prop-row';
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';

                const left = document.createElement('div');
                left.className = 'tv-checkbox-wrapper';
                left.style.cssText = 'min-width: 0; margin: 0;';

                const cb = document.createElement('div');
                cb.className = 'tv-checkbox';
                cb.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                `;

                const label = document.createElement('span');
                label.className = 'tv-checkbox-label';
                label.style.cssText = 'white-space: nowrap;';
                label.textContent = labelText;

                left.appendChild(cb);
                left.appendChild(label);
                row.appendChild(left);

                return { row, cb, label };
            };

            const bgRow = makeRow('Background');
            bgRow.cb.classList.toggle('checked', !!drawing.style.showZones);
            const bgSlider = document.createElement('input');
            bgSlider.type = 'range';
            bgSlider.min = '0';
            bgSlider.max = '1';
            bgSlider.step = '0.01';
            bgSlider.value = String(drawing.style.backgroundOpacity);
            bgSlider.style.cssText = 'width: 180px; height: 6px; margin-left: auto; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none;';
            bgRow.row.appendChild(bgSlider);
            bgRow.cb.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                drawing.style.showZones = !drawing.style.showZones;
                drawing.style.backgroundEnabled = drawing.style.showZones;
                bgRow.cb.classList.toggle('checked', !!drawing.style.showZones);
                applyChanges();
            });
            bgSlider.addEventListener('input', () => {
                drawing.style.backgroundOpacity = parseFloat(bgSlider.value);
                applyChanges();
            });
            controlsWrap.appendChild(bgRow.row);

            const reverseRow = makeRow('Reverse');
            reverseRow.cb.classList.toggle('checked', !!drawing.style.reverse);
            reverseRow.cb.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                drawing.style.reverse = !drawing.style.reverse;
                reverseRow.cb.classList.toggle('checked', !!drawing.style.reverse);
                applyChanges();
            });
            controlsWrap.appendChild(reverseRow.row);

            const pricesRow = makeRow('Prices');
            pricesRow.cb.classList.toggle('checked', !!drawing.style.showPrices);
            pricesRow.cb.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                drawing.style.showPrices = !drawing.style.showPrices;
                pricesRow.cb.classList.toggle('checked', !!drawing.style.showPrices);
                applyChanges();
            });
            controlsWrap.appendChild(pricesRow.row);

            const levelsRow = makeRow('Levels');
            levelsRow.cb.classList.toggle('checked', !!drawing.style.levelsEnabled);
            const levelsSelect = document.createElement('select');
            levelsSelect.className = 'tv-select';
            levelsSelect.style.cssText = 'width: 180px;';
            levelsSelect.innerHTML = `
                <option value="values" ${drawing.style.levelsLabelMode === 'values' ? 'selected' : ''}>Values</option>
                <option value="percent" ${drawing.style.levelsLabelMode === 'percent' ? 'selected' : ''}>Percent</option>
            `;
            levelsRow.row.appendChild(levelsSelect);
            levelsRow.cb.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                drawing.style.levelsEnabled = !drawing.style.levelsEnabled;
                levelsRow.cb.classList.toggle('checked', !!drawing.style.levelsEnabled);
                applyChanges();
            });
            levelsSelect.addEventListener('change', () => {
                drawing.style.levelsLabelMode = levelsSelect.value;
                applyChanges();
            });
            controlsWrap.appendChild(levelsRow.row);

            section.appendChild(controlsWrap);
        }

        // Options row (only for tools that support extend/zones)
        if (drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension' || drawing.type === 'trend-fib-extension' || drawing.type === 'fib-channel') {
            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const extendWrap = document.createElement('div');
            extendWrap.className = 'tv-checkbox-wrapper';
            extendWrap.style.cssText = 'min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;';

            const extendCb = document.createElement('div');
            extendCb.className = `tv-checkbox ${(drawing.style.extendLines || false) ? 'checked' : ''}`;
            extendCb.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;

            const extendText = document.createElement('span');
            extendText.className = 'tv-checkbox-label';
            extendText.style.cssText = 'white-space: nowrap;';
            extendText.textContent = 'Extend Lines';

            extendCb.addEventListener('click', () => {
                drawing.style.extendLines = !drawing.style.extendLines;
                extendCb.classList.toggle('checked', !!drawing.style.extendLines);
                applyChanges();
            });

            extendWrap.appendChild(extendCb);
            extendWrap.appendChild(extendText);
            optionsRow.appendChild(extendWrap);

            if (drawing.type !== 'fibonacci-retracement' && drawing.type !== 'fibonacci-extension' && drawing.type !== 'trend-fib-extension' && drawing.type !== 'fib-channel') {
                const zonesWrap = document.createElement('div');
                zonesWrap.className = 'tv-checkbox-wrapper';
                zonesWrap.style.cssText = 'min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;';

                const zonesCb = document.createElement('div');
                zonesCb.className = `tv-checkbox ${(drawing.style.showZones || false) ? 'checked' : ''}`;
                zonesCb.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                `;

                const zonesText = document.createElement('span');
                zonesText.className = 'tv-checkbox-label';
                zonesText.style.cssText = 'white-space: nowrap;';
                zonesText.textContent = 'Show Zones';

                zonesCb.addEventListener('click', () => {
                    drawing.style.showZones = !drawing.style.showZones;
                    zonesCb.classList.toggle('checked', !!drawing.style.showZones);
                    applyChanges();
                });

                zonesWrap.appendChild(zonesCb);
                zonesWrap.appendChild(zonesText);
                optionsRow.appendChild(zonesWrap);
            }

            section.appendChild(optionsRow);
        }

        // Fib Wedge zones (TradingView-like)
        if (drawing.type === 'fib-wedge') {
            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const zonesLabel = document.createElement('label');
            zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const zonesCheck = document.createElement('input');
            zonesCheck.type = 'checkbox';
            zonesCheck.checked = drawing.style.showZones !== false;
            zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            zonesCheck.onchange = () => {
                drawing.style.showZones = zonesCheck.checked;
                applyChanges();
            };
            zonesLabel.appendChild(zonesCheck);
            zonesLabel.appendChild(document.createTextNode('Show Zones'));
            optionsRow.appendChild(zonesLabel);

            const opacity = document.createElement('input');
            opacity.type = 'range';
            opacity.min = '0';
            opacity.max = '1';
            opacity.step = '0.05';
            opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
            opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
            opacity.oninput = () => {
                drawing.style.backgroundOpacity = parseFloat(opacity.value);
                applyChanges();
            };
            optionsRow.appendChild(opacity);

            section.appendChild(optionsRow);
        }

        // Fib Speed Resistance Arcs zones (TradingView-like)
        if (drawing.type === 'fib-arcs') {
            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const zonesLabel = document.createElement('label');
            zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const zonesCheck = document.createElement('input');
            zonesCheck.type = 'checkbox';
            zonesCheck.checked = drawing.style.showZones !== false;
            zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            zonesCheck.onchange = () => {
                drawing.style.showZones = zonesCheck.checked;
                applyChanges();
            };
            zonesLabel.appendChild(zonesCheck);
            zonesLabel.appendChild(document.createTextNode('Show Zones'));
            optionsRow.appendChild(zonesLabel);

            const opacity = document.createElement('input');
            opacity.type = 'range';
            opacity.min = '0';
            opacity.max = '1';
            opacity.step = '0.05';
            opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
            opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
            opacity.oninput = () => {
                drawing.style.backgroundOpacity = parseFloat(opacity.value);
                applyChanges();
            };
            optionsRow.appendChild(opacity);

            section.appendChild(optionsRow);
        }

        // Trend-Based Fib Time zones (TradingView-like)
        if (drawing.type === 'trend-fib-time') {
            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const zonesLabel = document.createElement('label');
            zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const zonesCheck = document.createElement('input');
            zonesCheck.type = 'checkbox';
            zonesCheck.checked = drawing.style.showZones !== false;
            zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            zonesCheck.onchange = () => {
                drawing.style.showZones = zonesCheck.checked;
                applyChanges();
            };
            zonesLabel.appendChild(zonesCheck);
            zonesLabel.appendChild(document.createTextNode('Show Zones'));
            optionsRow.appendChild(zonesLabel);

            const opacity = document.createElement('input');
            opacity.type = 'range';
            opacity.min = '0';
            opacity.max = '1';
            opacity.step = '0.05';
            opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
            opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
            opacity.oninput = () => {
                drawing.style.backgroundOpacity = parseFloat(opacity.value);
                applyChanges();
            };
            optionsRow.appendChild(opacity);

            section.appendChild(optionsRow);
        }

        // Reverse option (TradingView-like) for Fib Speed Resistance Fan
        if (drawing.type === 'fib-speed-fan') {
            const optionsRow = document.createElement('div');
            optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45;';

            const bgLabel = document.createElement('label');
            bgLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const bgCheck = document.createElement('input');
            bgCheck.type = 'checkbox';
            bgCheck.checked = drawing.style.backgroundEnabled !== false;
            bgCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            bgCheck.onchange = () => {
                drawing.style.backgroundEnabled = bgCheck.checked;
                applyChanges();
            };
            bgLabel.appendChild(bgCheck);
            bgLabel.appendChild(document.createTextNode('Background'));
            optionsRow.appendChild(bgLabel);

            const bgOpacity = document.createElement('input');
            bgOpacity.type = 'range';
            bgOpacity.min = '0';
            bgOpacity.max = '1';
            bgOpacity.step = '0.05';
            bgOpacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
            bgOpacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 140px;';
            bgOpacity.oninput = () => {
                drawing.style.backgroundOpacity = parseFloat(bgOpacity.value);
                applyChanges();
            };
            optionsRow.appendChild(bgOpacity);

            const gridLabel = document.createElement('label');
            gridLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const gridCheck = document.createElement('input');
            gridCheck.type = 'checkbox';
            gridCheck.checked = drawing.style.gridEnabled !== false;
            gridCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            gridCheck.onchange = () => {
                drawing.style.gridEnabled = gridCheck.checked;
                applyChanges();
            };
            gridLabel.appendChild(gridCheck);
            gridLabel.appendChild(document.createTextNode('Grid'));
            optionsRow.appendChild(gridLabel);

            const reverseLabel = document.createElement('label');
            reverseLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
            const reverseCheck = document.createElement('input');
            reverseCheck.type = 'checkbox';
            reverseCheck.checked = drawing.style.reverse || false;
            reverseCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
            reverseCheck.onchange = () => {
                drawing.style.reverse = reverseCheck.checked;
                applyChanges();
            };
            reverseLabel.appendChild(reverseCheck);
            reverseLabel.appendChild(document.createTextNode('Reverse'));
            optionsRow.appendChild(reverseLabel);

            section.appendChild(optionsRow);
        }

        // Global levels type/width controls
        const levelsStyleRow = document.createElement('div');
        levelsStyleRow.className = 'tv-prop-row';
        levelsStyleRow.style.cssText = 'display:flex; align-items:center; gap: 8px; margin-bottom: 12px;';

        const levelsLabel = document.createElement('span');
        levelsLabel.className = 'tv-prop-label';
        levelsLabel.textContent = 'Levels';
        levelsStyleRow.appendChild(levelsLabel);

        const levelsControls = document.createElement('div');
        levelsControls.className = 'tv-prop-controls';
        levelsControls.style.marginLeft = 'auto';

        const levelsTypeSelect = document.createElement('select');
        levelsTypeSelect.className = 'tv-select';
        levelsTypeSelect.style.width = '40px';
        const currentLevelsType = drawing.style.levelsLineDasharray ?? '';
        levelsTypeSelect.innerHTML = `
            <option value="" ${currentLevelsType === '' ? 'selected' : ''}>───────</option>
            <option value="5,5" ${currentLevelsType === '5,5' ? 'selected' : ''}>─ ─ ─ ─</option>
            <option value="2,2" ${currentLevelsType === '2,2' ? 'selected' : ''}>··········</option>
            <option value="8,4,2,4" ${currentLevelsType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
        `;
        levelsTypeSelect.onchange = () => {
            drawing.style.levelsLineDasharray = levelsTypeSelect.value;
            levelsRef.forEach(lvl => { if (lvl) lvl.lineType = drawing.style.levelsLineDasharray; });
            applyChanges();
        };
        levelsControls.appendChild(levelsTypeSelect);

        const levelsWidthSelect = document.createElement('select');
        levelsWidthSelect.className = 'tv-select';
        levelsWidthSelect.style.width = '48px';
        const widths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const currentLevelsWidth = parseInt(drawing.style.levelsLineWidth) || 2;
        levelsWidthSelect.innerHTML = widths.map(w => `<option value="${w}" ${currentLevelsWidth === w ? 'selected' : ''}>${w}px</option>`).join('');
        levelsWidthSelect.onchange = () => {
            const w = parseInt(levelsWidthSelect.value);
            drawing.style.levelsLineWidth = (!isNaN(w) && w > 0) ? w : 2;
            levelsRef.forEach(lvl => { if (lvl) lvl.lineWidth = drawing.style.levelsLineWidth; });
            applyChanges();
        };
        levelsControls.appendChild(levelsWidthSelect);

        levelsStyleRow.appendChild(levelsControls);
        section.appendChild(levelsStyleRow);

        const list = document.createElement('div');
        // Side-by-side layout (match pitchfork levels UI)
        list.style.cssText = lockFixedLevelCount
            ? 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; overflow-y: visible; align-items: start;'
            : 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 280px; overflow-y: auto; align-items: start;';

        const addLevelRow = (level, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-prop-row fib-level-row';
            row.style.cssText = lockFixedLevelCount
                ? 'display: grid; grid-template-columns: 24px 80px auto; align-items: center; gap: 8px; padding: 4px 0;'
                : 'display: grid; grid-template-columns: 24px 80px auto 24px; align-items: center; gap: 8px; padding: 4px 0;';

            // Visibility checkbox
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.style.cssText = `
                width: 20px; height: 20px; border: 2px solid #363a45; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; background: ${isEnabled(level) ? '#2962ff' : 'transparent'};
                transition: all 0.15s;
            `;
            checkboxWrapper.innerHTML = isEnabled(level) ? 
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
            checkboxWrapper.onclick = (e) => {
                e.stopPropagation();
                setEnabled(level, !isEnabled(level));
                checkboxWrapper.style.background = isEnabled(level) ? '#2962ff' : 'transparent';
                checkboxWrapper.innerHTML = isEnabled(level) ? 
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
                applyChanges();
            };
            row.appendChild(checkboxWrapper);

            // Value input - reuse Regression Inputs component (number-input-wrapper + tv-number-input + custom-spinner)
            const valueWrapper = document.createElement('div');
            valueWrapper.className = 'number-input-wrapper';
            valueWrapper.style.width = '100%';

            const valueProp = `fibLevelValue_${idx}`;

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'tv-number-input';
            input.dataset.prop = valueProp;
            input.value = level.value;
            input.step = isTimeZone ? '1' : '0.001';
            input.style.cssText = 'color: #d1d4dc; font-size: 12px; text-align: center; width: 100%; flex: 1; min-width: 0;';

            const updateLevelFromInput = () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) {
                    level.value = parsed;
                    level.label = input.value;
                    applyChanges();
                }
            };

            input.addEventListener('input', updateLevelFromInput);
            input.addEventListener('change', updateLevelFromInput);

            const spinner = document.createElement('div');
            spinner.className = 'custom-spinner';
            spinner.dataset.target = valueProp;

            const upBtn = document.createElement('div');
            upBtn.className = 'custom-spinner-btn';
            upBtn.dataset.action = 'up';
            upBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg>';

            const downBtn = document.createElement('div');
            downBtn.className = 'custom-spinner-btn';
            downBtn.dataset.action = 'down';
            downBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg>';

            spinner.appendChild(upBtn);
            spinner.appendChild(downBtn);
            valueWrapper.appendChild(input);
            valueWrapper.appendChild(spinner);
            row.appendChild(valueWrapper);

            // Controls wrapper (color)
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'tv-prop-controls';
            
            const colorBtn = document.createElement('button');
            colorBtn.className = 'tv-color-btn';
            colorBtn.dataset.prop = `level${idx}Color`;
            colorBtn.dataset.levelIndex = idx;
            colorBtn.style.background = level.color || '#787b86';
            controlsWrapper.appendChild(colorBtn);
            row.appendChild(controlsWrapper);

            if (!lockFixedLevelCount) {
                const deleteBtn = document.createElement('button');
                deleteBtn.style.cssText = `
                    width: 20px; height: 20px; padding: 0; background: transparent; border: none;
                    color: #787b86; cursor: pointer; font-size: 14px; line-height: 1; border-radius: 4px;
                `;
                deleteBtn.innerHTML = '×';
                deleteBtn.onmouseenter = () => { deleteBtn.style.background = '#f2364520'; deleteBtn.style.color = '#f23645'; };
                deleteBtn.onmouseleave = () => { deleteBtn.style.background = 'transparent'; deleteBtn.style.color = '#787b86'; };
                deleteBtn.onclick = () => {
                    const index = levelsRef.indexOf(level);
                    if (index > -1) {
                        levelsRef.splice(index, 1);
                        row.remove();
                        applyChanges();
                    }
                };
                row.appendChild(deleteBtn);
            }

            list.appendChild(row);
            return row;
        };

        levelsRef.forEach((level, idx) => addLevelRow(level, idx));
        section.appendChild(list);

        // Button row
        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

        // Add Level button
        if (!lockFixedLevelCount) {
            const addBtn = document.createElement('button');
            addBtn.style.cssText = `
                flex: 1; padding: 8px 12px; background: #787b8620; border: 1px solid #787b8640;
                border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
            `;
            addBtn.textContent = '+ Add Level';
            addBtn.onmouseenter = () => { addBtn.style.background = '#787b8630'; };
            addBtn.onmouseleave = () => { addBtn.style.background = '#787b8620'; };
            addBtn.onclick = () => {
                const newLevel = {
                    value: 0.5,
                    label: '0.5',
                    color: '#787b86',
                    ...(usesVisible ? { visible: true } : { enabled: true }),
                    lineType: drawing.style.levelsLineDasharray ?? '',
                    lineWidth: parseInt(drawing.style.levelsLineWidth) || 2
                };
                levelsRef.push(newLevel);
                addLevelRow(newLevel, levelsRef.length - 1);
                applyChanges();
            };
            buttonRow.appendChild(addBtn);
        }

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.style.cssText = `
            padding: 8px 12px; background: transparent; border: 1px solid #363a45;
            border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
        `;
        resetBtn.textContent = 'Reset';
        resetBtn.onmouseenter = () => { resetBtn.style.borderColor = '#787b86'; resetBtn.style.color = '#d1d4dc'; };
        resetBtn.onmouseleave = () => { resetBtn.style.borderColor = '#363a45'; resetBtn.style.color = '#787b86'; };
        resetBtn.onclick = () => {
            const defaults = getDefaultLevelsForType().map(l => ({ ...l }));
            // Keep the same array reference to avoid breaking UI closures
            levelsRef.splice(0, levelsRef.length, ...defaults);
            list.innerHTML = '';
            levelsRef.forEach((level, idx) => addLevelRow(level, idx));
            applyChanges();
        };
        buttonRow.appendChild(resetBtn);

        section.appendChild(buttonRow);
        container.appendChild(section);
    }

    buildGannBoxLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = 'margin-top: 16px; padding-top: 12px; border-top: 1px solid #363a45;';

        const header = document.createElement('div');
        header.style.cssText = 'color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;';
        header.textContent = 'Gann Box Levels';
        section.appendChild(header);

        if (!drawing.style) drawing.style = {};

        const ensureLevelsArray = (key, defaults) => {
            if (!Array.isArray(drawing.style[key]) || drawing.style[key].length === 0) {
                drawing.style[key] = defaults.map(l => ({ ...l }));
            }
            drawing.style[key].forEach(l => {
                if (!l) return;
                if (l.enabled === undefined) l.enabled = true;
                if (!l.color) l.color = '#787b86';
            });
            return drawing.style[key];
        };

        const priceLevels = ensureLevelsArray('priceLevels', [
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ]);

        const timeLevels = ensureLevelsArray('timeLevels', [
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.382, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.618, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ]);

        if (drawing.style.levelsLineDasharray === undefined) drawing.style.levelsLineDasharray = '';
        if (drawing.style.levelsLineWidth === undefined) drawing.style.levelsLineWidth = 2;
        if (drawing.style.showZones === undefined) drawing.style.showZones = false;
        if (drawing.style.backgroundOpacity === undefined) drawing.style.backgroundOpacity = 0.12;

        const normalizeLevelsStyle = () => {
            const lt = drawing.style.levelsLineDasharray ?? '';
            const lw = parseInt(drawing.style.levelsLineWidth) || 2;
            priceLevels.forEach(lvl => { if (lvl) { lvl.lineType = lt; lvl.lineWidth = lw; } });
            timeLevels.forEach(lvl => { if (lvl) { lvl.lineType = lt; lvl.lineWidth = lw; } });
        };
        normalizeLevelsStyle();

        const applyChanges = () => {
            self.pendingChanges.style = {
                ...self.pendingChanges.style,
                priceLevels,
                timeLevels,
                levelsLineDasharray: drawing.style.levelsLineDasharray,
                levelsLineWidth: drawing.style.levelsLineWidth,
                showZones: drawing.style.showZones,
                backgroundOpacity: drawing.style.backgroundOpacity
            };

            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                if (!actualDrawing.style) actualDrawing.style = {};
                actualDrawing.style.priceLevels = priceLevels;
                actualDrawing.style.timeLevels = timeLevels;
                actualDrawing.style.levelsLineDasharray = drawing.style.levelsLineDasharray;
                actualDrawing.style.levelsLineWidth = drawing.style.levelsLineWidth;
                actualDrawing.style.showZones = drawing.style.showZones;
                actualDrawing.style.backgroundOpacity = drawing.style.backgroundOpacity;
                Object.assign(actualDrawing.style, drawing.style);
                window.drawingManager.renderDrawing(actualDrawing);
                window.drawingManager.saveDrawings();
                return;
            }

            self.renderPreview(drawing);
        };

        const levelsStyleRow = document.createElement('div');
        levelsStyleRow.className = 'tv-prop-row';
        levelsStyleRow.style.cssText = 'display:flex; align-items:center; gap: 8px; margin-bottom: 12px;';

        const levelsLabel = document.createElement('span');
        levelsLabel.className = 'tv-prop-label';
        levelsLabel.textContent = 'Levels';
        levelsStyleRow.appendChild(levelsLabel);

        const levelsControls = document.createElement('div');
        levelsControls.className = 'tv-prop-controls';
        levelsControls.style.marginLeft = 'auto';

        const levelsTypeSelect = document.createElement('select');
        levelsTypeSelect.className = 'tv-select';
        levelsTypeSelect.style.width = '40px';
        const currentLevelsType = drawing.style.levelsLineDasharray ?? '';
        levelsTypeSelect.innerHTML = `
            <option value="" ${currentLevelsType === '' ? 'selected' : ''}>───────</option>
            <option value="5,5" ${currentLevelsType === '5,5' ? 'selected' : ''}>─ ─ ─ ─</option>
            <option value="2,2" ${currentLevelsType === '2,2' ? 'selected' : ''}>··········</option>
            <option value="8,4,2,4" ${currentLevelsType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
        `;
        levelsTypeSelect.onchange = () => {
            drawing.style.levelsLineDasharray = levelsTypeSelect.value;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsTypeSelect);

        const levelsWidthSelect = document.createElement('select');
        levelsWidthSelect.className = 'tv-select';
        levelsWidthSelect.style.width = '48px';
        const widths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const currentLevelsWidth = parseInt(drawing.style.levelsLineWidth) || 2;
        levelsWidthSelect.innerHTML = widths.map(w => `<option value="${w}" ${currentLevelsWidth === w ? 'selected' : ''}>${w}px</option>`).join('');
        levelsWidthSelect.onchange = () => {
            const w = parseInt(levelsWidthSelect.value);
            drawing.style.levelsLineWidth = (!isNaN(w) && w > 0) ? w : 2;
            normalizeLevelsStyle();
            applyChanges();
        };
        levelsControls.appendChild(levelsWidthSelect);

        levelsStyleRow.appendChild(levelsControls);
        section.appendChild(levelsStyleRow);

        const optionsRow = document.createElement('div');
        optionsRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #363a45; align-items: center;';

        const zonesLabel = document.createElement('label');
        zonesLabel.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #787b86;';
        const zonesCheck = document.createElement('input');
        zonesCheck.type = 'checkbox';
        zonesCheck.checked = drawing.style.showZones || false;
        zonesCheck.style.cssText = 'cursor: pointer; accent-color: #787b86;';
        zonesCheck.onchange = () => {
            drawing.style.showZones = zonesCheck.checked;
            applyChanges();
        };
        zonesLabel.appendChild(zonesCheck);
        zonesLabel.appendChild(document.createTextNode('Show Zones'));
        optionsRow.appendChild(zonesLabel);

        const opacity = document.createElement('input');
        opacity.type = 'range';
        opacity.min = '0';
        opacity.max = '1';
        opacity.step = '0.05';
        opacity.value = (drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12);
        opacity.style.cssText = 'flex: 1; height: 6px; -webkit-appearance: none; appearance: none; background: #363a45; border-radius: 3px; cursor: pointer; outline: none; max-width: 160px;';
        opacity.oninput = () => {
            drawing.style.backgroundOpacity = parseFloat(opacity.value);
            applyChanges();
        };
        optionsRow.appendChild(opacity);

        section.appendChild(optionsRow);

        const buildGroup = (title, levels, levelGroup, getDefaults) => {
            const groupTitle = document.createElement('div');
            groupTitle.style.cssText = 'color: #787b86; font-size: 11px; margin: 12px 0 8px; text-transform: uppercase;';
            groupTitle.textContent = title;
            section.appendChild(groupTitle);

            const list = document.createElement('div');
            list.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 220px; overflow-y: auto; align-items: start;';

            const getStepDecimals = (n) => {
                const s = String(n);
                if (s.includes('e-')) {
                    const parts = s.split('e-');
                    const exp = parseInt(parts[1], 10);
                    return isNaN(exp) ? 0 : exp;
                }
                const dot = s.indexOf('.');
                return dot === -1 ? 0 : (s.length - dot - 1);
            };

            const addLevelRow = (level, idx) => {
                const row = document.createElement('div');
                row.className = 'tv-prop-row fib-level-row';
                row.style.cssText = 'display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 4px 0;';

                const checkboxWrapper = document.createElement('div');
                const currentEnabled = level.enabled !== false;
                checkboxWrapper.style.cssText = `
                    width: 20px; height: 20px; border: 2px solid #363a45; border-radius: 4px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; background: ${currentEnabled ? '#2962ff' : 'transparent'};
                    transition: all 0.15s;
                `;
                checkboxWrapper.innerHTML = currentEnabled
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                    : '';
                checkboxWrapper.onclick = (e) => {
                    e.stopPropagation();
                    const enabledNow = level.enabled !== false;
                    const enabledNext = !enabledNow;
                    level.enabled = enabledNext;
                    checkboxWrapper.style.background = enabledNext ? '#2962ff' : 'transparent';
                    checkboxWrapper.innerHTML = enabledNext
                        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                        : '';
                    applyChanges();
                };
                row.appendChild(checkboxWrapper);

                const valueWrapper = document.createElement('div');
                valueWrapper.className = 'number-input-wrapper';
                valueWrapper.style.width = '100%';

                const valueProp = `${levelGroup}LevelValue_${idx}`;

                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'tv-number-input';
                input.dataset.prop = valueProp;
                input.value = level.value;
                input.step = '0.001';
                input.style.cssText = 'color: #d1d4dc; font-size: 13px; text-align: center; width: 100%; flex: 1; min-width: 0;';

                const updateLevelFromInput = () => {
                    const parsed = parseFloat(input.value);
                    if (!isNaN(parsed)) {
                        level.value = parsed;
                        applyChanges();
                    }
                };
                input.addEventListener('input', updateLevelFromInput);
                input.addEventListener('change', updateLevelFromInput);

                const spinner = document.createElement('div');
                spinner.className = 'custom-spinner';
                spinner.dataset.target = valueProp;

                const upBtn = document.createElement('div');
                upBtn.className = 'custom-spinner-btn';
                upBtn.dataset.action = 'up';
                upBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg>';

                const downBtn = document.createElement('div');
                downBtn.className = 'custom-spinner-btn';
                downBtn.dataset.action = 'down';
                downBtn.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg>';

                const onSpinnerClick = (btn) => {
                    const step = parseFloat(input.step) || 0.1;
                    let value = parseFloat(input.value) || 0;
                    const decimals = getStepDecimals(step);
                    const factor = Math.pow(10, decimals);
                    if (btn.dataset.action === 'up') {
                        value = Math.round((value + step) * factor) / factor;
                    } else {
                        value = Math.round((value - step) * factor) / factor;
                    }
                    input.value = value;
                    input.dispatchEvent(new Event('change'));
                };

                upBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(upBtn); });
                downBtn.addEventListener('click', (e) => { e.stopPropagation(); onSpinnerClick(downBtn); });

                spinner.appendChild(upBtn);
                spinner.appendChild(downBtn);
                valueWrapper.appendChild(input);
                valueWrapper.appendChild(spinner);
                row.appendChild(valueWrapper);

                const controlsWrapper = document.createElement('div');
                controlsWrapper.className = 'tv-prop-controls';

                const colorBtn = document.createElement('button');
                colorBtn.className = 'tv-color-btn';
                colorBtn.dataset.prop = 'gannLevelColor';
                colorBtn.dataset.levelIndex = idx;
                colorBtn.dataset.levelGroup = levelGroup;
                colorBtn.style.background = level.color || '#787b86';
                controlsWrapper.appendChild(colorBtn);
                row.appendChild(controlsWrapper);

                list.appendChild(row);
                return row;
            };

            levels.forEach((level, idx) => addLevelRow(level, idx));

            section.appendChild(list);

            const buttonRow = document.createElement('div');
            buttonRow.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

            const addBtn = document.createElement('button');
            addBtn.style.cssText = `
                flex: 1; padding: 8px 12px; background: #787b8620; border: 1px solid #787b8640;
                border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
            `;
            addBtn.textContent = '+ Add Level';
            addBtn.onmouseenter = () => { addBtn.style.background = '#787b8630'; };
            addBtn.onmouseleave = () => { addBtn.style.background = '#787b8620'; };
            addBtn.onclick = () => {
                const newLevel = {
                    value: 0.5,
                    enabled: true,
                    color: '#787b86',
                    lineType: drawing.style.levelsLineDasharray ?? '',
                    lineWidth: parseInt(drawing.style.levelsLineWidth) || 2
                };
                levels.push(newLevel);
                addLevelRow(newLevel, levels.length - 1);
                applyChanges();
            };
            buttonRow.appendChild(addBtn);

            const resetBtn = document.createElement('button');
            resetBtn.style.cssText = `
                padding: 8px 12px; background: transparent; border: 1px solid #363a45;
                border-radius: 4px; color: #787b86; font-size: 12px; cursor: pointer;
            `;
            resetBtn.textContent = 'Reset';
            resetBtn.onmouseenter = () => { resetBtn.style.borderColor = '#787b86'; resetBtn.style.color = '#d1d4dc'; };
            resetBtn.onmouseleave = () => { resetBtn.style.borderColor = '#363a45'; resetBtn.style.color = '#787b86'; };
            resetBtn.onclick = () => {
                const defaults = getDefaults().map(l => ({ ...l }));
                levels.splice(0, levels.length, ...defaults);
                list.innerHTML = '';
                levels.forEach((level, idx) => addLevelRow(level, idx));
                normalizeLevelsStyle();
                applyChanges();
            };
            buttonRow.appendChild(resetBtn);

            section.appendChild(buttonRow);
        };

        buildGroup('Price Levels', priceLevels, 'priceLevels', () => ([
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ]));
        buildGroup('Time Levels', timeLevels, 'timeLevels', () => ([
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.382, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.618, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ]));

        container.appendChild(section);
    }

    /**
     * Build Channel Levels Section (DOM-based) - TradingView style
     */
    buildChannelLevelsSection(container, drawing) {
        const self = this;
        const section = document.createElement('div');
        section.className = 'tv-levels-section';
        section.style.cssText = 'margin-top: 16px;';

        // Default levels like TradingView (excluding 0 and 1 which are always drawn as main lines)
        const baseColor = (drawing.style && drawing.style.stroke) || '#2962ff';
            const defaultLevels = [
                { value: -0.25, color: '#1e3a5f', enabled: false },
                { value: 0.25, color: '#1e3a5f', enabled: false },
                { value: 0.5, color: baseColor, enabled: true },
                { value: 0.75, color: '#1e3a5f', enabled: false },
                { value: 1.25, color: '#1e3a5f', enabled: false }
            ];

            // Filter out 0 and 1, then check if we need defaults
            if (Array.isArray(drawing.levels)) {
                drawing.levels = drawing.levels.filter(l => l.value !== 0 && l.value !== 1);
            }
            
            if (!Array.isArray(drawing.levels) || drawing.levels.length === 0) {
                drawing.levels = defaultLevels.map(l => ({ ...l }));
            }

        // Helper to apply changes immediately (same pattern as other live previews)
        const applyChanges = () => {
            // Sync levels to actual drawing in manager and to pendingChanges
            // Deep copy to ensure changes persist
            self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    actualDrawing.levels = JSON.parse(JSON.stringify(drawing.levels));
                    // [debug removed]
                }
            }
            self.renderPreview(drawing);
        };

        const list = document.createElement('div');
        list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        drawing.levels.forEach((level, idx) => {
            const row = document.createElement('div');
            row.className = 'tv-prop-row';
            row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            // Checkbox (styled like TradingView)
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = `tv-checkbox ${level.enabled ? 'checked' : ''}`;
            checkboxWrapper.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;
            checkboxWrapper.onclick = (e) => {
                e.stopPropagation();
                level.enabled = !level.enabled;
                checkboxWrapper.classList.toggle('checked', level.enabled);
                
                // Update the drawing's level data
                if (drawing.levels && drawing.levels[idx]) {
                    drawing.levels[idx].enabled = level.enabled;
                }
                
                // Direct SVG update for immediate visual feedback
                if (drawing.group) {
                    drawing.group.selectAll('line').each(function() {
                        const el = d3.select(this);
                        const lineLevel = el.attr('data-level');
                        // Show/hide the line if it matches this level value
                        if (lineLevel && parseFloat(lineLevel) === level.value) {
                            el.style('display', level.enabled ? null : 'none');
                        }
                    });
                }
                
                // Save changes through the UI's applyChanges method
                self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
                self.applyChanges(drawing);
            };
            row.appendChild(checkboxWrapper);

            // Value input (editable) - match Line input styling with black background
            const input = document.createElement('input');
            input.type = 'text';
            input.value = level.value;
            input.style.cssText = `
                background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
                color: #d1d4dc; padding: 5px 8px; font-size: 11px; width: 60px;
                outline: none; transition: border-color 0.15s; box-sizing: border-box;
            `;
            input.onfocus = () => { input.style.borderColor = '#2962ff'; };
            input.onblur = () => { input.style.borderColor = 'rgba(255,255,255,0.12)'; };
            input.oninput = () => {
                const parsed = parseFloat(input.value);
                if (!isNaN(parsed)) {
                    level.value = parsed;
                    applyChanges();
                }
            };
            row.appendChild(input);

            // Controls wrapper
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'tv-prop-controls';

            // Color button
            const colorBtn = document.createElement('button');
            colorBtn.className = 'tv-color-btn';
            colorBtn.dataset.prop = `level${idx}Color`;
            colorBtn.dataset.levelIndex = idx;
            colorBtn.style.cssText = `
                width: 30px; height: 30px; background: ${level.color}; 
                border-radius: 4px; border: 2px solid rgba(50, 50, 60, 0.9); cursor: pointer;
                transition: border-color 0.15s ease, transform 0.15s ease; box-sizing: border-box;
            `;
            colorBtn.onmouseenter = () => { colorBtn.style.borderColor = '#838fb1ff'; colorBtn.style.transform = 'scale(1.05)'; };
            colorBtn.onmouseleave = () => { colorBtn.style.borderColor = 'rgba(50, 50, 60, 0.9)'; colorBtn.style.transform = 'scale(1)'; };
            controlsWrapper.appendChild(colorBtn);

            // Line Type dropdown (styled like main Line type with visual icons)
            const typeSelect = document.createElement('select');
            typeSelect.className = 'tv-select';
            typeSelect.dataset.prop = `level${idx}Type`;
            typeSelect.style.width = '40px';
            typeSelect.innerHTML = `
                <option value="">───────</option>
                <option value="10,6">─ ─ ─ ─</option>
                <option value="2,2">··········</option>
                <option value="8,4,2,4">─·─·─·─</option>
            `;
            typeSelect.value = (level.lineType === '5,5' ? '10,6' : (level.lineType || ''));
            typeSelect.onfocus = () => { typeSelect.style.borderColor = '#2962ff'; };
            typeSelect.onblur = () => { typeSelect.style.borderColor = '#2a2e39'; };
            typeSelect.onchange = () => {
                level.lineType = typeSelect.value;
                if (drawing.levels && drawing.levels[idx]) {
                    drawing.levels[idx].lineType = typeSelect.value;
                }
                
                // Direct SVG update for immediate visual feedback
                if (drawing.group) {
                    drawing.group.selectAll('line').each(function() {
                        const el = d3.select(this);
                        const lineLevel = el.attr('data-level');
                        if (lineLevel && parseFloat(lineLevel) === level.value) {
                            el.attr('stroke-dasharray', typeSelect.value || 'none');
                        }
                    });
                }
                
                // Save changes
                self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
                self.applyChanges(drawing);
            };
            controlsWrapper.appendChild(typeSelect);

            // Line Width dropdown (styled like main Line width)
            const widthSelect = document.createElement('select');
            widthSelect.className = 'tv-select';
            widthSelect.dataset.prop = `level${idx}Width`;
            widthSelect.style.width = '40px';
            widthSelect.innerHTML = `
                <option value="1">1px</option>
                <option value="2">2px</option>
                <option value="3">3px</option>
                <option value="4">4px</option>
                <option value="5">5px</option>
                <option value="6">6px</option>
                <option value="7">7px</option>
                <option value="8">8px</option>
                <option value="9">9px</option>
                <option value="10">10px</option>
            `;
            widthSelect.value = level.lineWidth || drawing.style.strokeWidth || 2;
            widthSelect.onfocus = () => { widthSelect.style.borderColor = '#2962ff'; };
            widthSelect.onblur = () => { widthSelect.style.borderColor = '#2a2e39'; };
            widthSelect.onchange = () => {
                const width = parseInt(widthSelect.value);
                if (!isNaN(width) && width >= 1 && width <= 10) {
                    level.lineWidth = width;
                    if (drawing.levels && drawing.levels[idx]) {
                        drawing.levels[idx].lineWidth = width;
                    }
                    
                    // Direct SVG update for immediate visual feedback
                    if (drawing.group) {
                        drawing.group.selectAll('line').each(function() {
                            const el = d3.select(this);
                            const lineLevel = el.attr('data-level');
                            if (lineLevel && parseFloat(lineLevel) === level.value) {
                                el.attr('stroke-width', width);
                            }
                        });
                    }
                    
                    // Save changes
                    self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
                    self.applyChanges(drawing);
                }
            };
            controlsWrapper.appendChild(widthSelect);
            
            row.appendChild(controlsWrapper);

            list.appendChild(row);
        });

        section.appendChild(list);
        container.appendChild(section);
    }

    /**
     * Build Position Tool specific Style Tab
     */
    buildPositionStyleTab(container, drawing) {
        const isLong = drawing.type === 'long-position';
        const risk = drawing.meta?.risk || {};
        
        // Zone Colors Section
        const colorsSection = document.createElement('div');
        colorsSection.style.cssText = 'margin-bottom: 20px;';
        colorsSection.innerHTML = `
            <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;">Zone Colors</div>
        `;
        
        // Profit Zone Color
        const profitRow = document.createElement('div');
        profitRow.className = 'tv-prop-row';
        profitRow.innerHTML = `
            <span class="tv-checkbox-label">Profit Zone</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <button class="tv-color-btn" data-prop="rewardColor" style="background: ${drawing.style.rewardColor || 'rgba(8, 153, 129, 0.25)'};"></button>
            </div>
        `;
        colorsSection.appendChild(profitRow);
        
        // Loss Zone Color
        const lossRow = document.createElement('div');
        lossRow.className = 'tv-prop-row';
        lossRow.innerHTML = `
            <span class="tv-checkbox-label">Loss Zone</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <button class="tv-color-btn" data-prop="riskColor" style="background: ${drawing.style.riskColor || 'rgba(242, 54, 69, 0.25)'};"></button>
            </div>
        `;
        colorsSection.appendChild(lossRow);
        
        // Entry Line Color
        const entryRow = document.createElement('div');
        entryRow.className = 'tv-prop-row';
        entryRow.innerHTML = `
            <span class="tv-checkbox-label">Entry Line</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <button class="tv-color-btn" data-prop="entryColor" style="background: ${drawing.style.entryColor || '#787b86'};"></button>
            </div>
        `;
        colorsSection.appendChild(entryRow);
        container.appendChild(colorsSection);
        
        // Risk Settings Section
        const riskSection = document.createElement('div');
        riskSection.style.cssText = 'border-top: 1px solid #363a45; padding-top: 16px;';
        riskSection.innerHTML = `
            <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;">Risk Settings</div>
        `;
        
        // Risk Mode
        const riskModeRow = document.createElement('div');
        riskModeRow.className = 'tv-prop-row';
        riskModeRow.innerHTML = `
            <span class="tv-checkbox-label">Risk Mode</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <select class="tv-select" data-prop="riskMode" style="min-width: 120px;">
                    <option value="risk-percent" ${risk.riskMode === 'risk-percent' ? 'selected' : ''}>% of Account</option>
                    <option value="risk-usd" ${risk.riskMode === 'risk-usd' || !risk.riskMode ? 'selected' : ''}>Fixed USD</option>
                </select>
            </div>
        `;
        riskSection.appendChild(riskModeRow);
        
        // Risk Percent
        const riskPercentRow = document.createElement('div');
        riskPercentRow.className = 'tv-prop-row';
        riskPercentRow.innerHTML = `
            <span class="tv-checkbox-label">Risk %</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <input type="number" class="tv-input" data-prop="riskPercent" value="${risk.riskPercent || 1}" min="0.1" max="100" step="0.1" style="width: 80px;">
            </div>
        `;
        riskSection.appendChild(riskPercentRow);
        
        // Risk Amount USD
        const riskAmountRow = document.createElement('div');
        riskAmountRow.className = 'tv-prop-row';
        riskAmountRow.innerHTML = `
            <span class="tv-checkbox-label">Risk Amount ($)</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <input type="number" class="tv-input" data-prop="riskAmountUSD" value="${risk.riskAmountUSD || 100}" min="1" step="10" style="width: 80px;">
            </div>
        `;
        riskSection.appendChild(riskAmountRow);
        
        // Lot Size (calculated)
        const lotSizeRow = document.createElement('div');
        lotSizeRow.className = 'tv-prop-row';
        lotSizeRow.innerHTML = `
            <span class="tv-checkbox-label">Lot Size</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <input type="number" class="tv-input" data-prop="lotSize" value="${(risk.lotSize || 0.01).toFixed(2)}" min="0.01" step="0.01" style="width: 80px;">
            </div>
        `;
        riskSection.appendChild(lotSizeRow);
        
        container.appendChild(riskSection);
        
        // Position Info (read-only)
        const infoSection = document.createElement('div');
        infoSection.style.cssText = 'border-top: 1px solid #363a45; padding-top: 16px; margin-top: 16px;';
        
        const entryPrice = drawing.points[0]?.y || 0;
        const stopPrice = drawing.points[1]?.y || 0;
        const targetPrice = drawing.points[2]?.y || 0;
        const stopPips = Math.abs(entryPrice - stopPrice) / 0.0001;
        const targetPips = Math.abs(targetPrice - entryPrice) / 0.0001;
        const rrRatio = stopPips > 0 ? (targetPips / stopPips).toFixed(2) : '0.00';
        
        infoSection.innerHTML = `
            <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; text-transform: uppercase;">Position Info</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
                <div style="color: #787b86;">Entry:</div>
                <div style="color: #d1d4dc; text-align: right;">${entryPrice.toFixed(5)}</div>
                <div style="color: #787b86;">Stop Loss:</div>
                <div style="color: #ef4444; text-align: right;">${stopPrice.toFixed(5)} (${stopPips.toFixed(1)} pips)</div>
                <div style="color: #787b86;">Take Profit:</div>
                <div style="color: #22c55e; text-align: right;">${targetPrice.toFixed(5)} (${targetPips.toFixed(1)} pips)</div>
                <div style="color: #787b86;">R:R Ratio:</div>
                <div style="color: #2962ff; text-align: right;">${rrRatio}</div>
            </div>
        `;
        container.appendChild(infoSection);
    }

    buildRangeToolsStyleTab(container, drawing) {
        if (!drawing.style) drawing.style = {};

        if (drawing.style.borderEnabled === undefined) drawing.style.borderEnabled = true;
        if (!drawing.style.borderColor) drawing.style.borderColor = drawing.style.stroke || '#2962ff';
        if (drawing.style.borderDasharray === undefined) drawing.style.borderDasharray = '';
        if (drawing.style.borderWidth === undefined) drawing.style.borderWidth = 1;
        if (drawing.style.showBackground === undefined) drawing.style.showBackground = true;
        if (!drawing.style.fill || drawing.style.fill === 'none') drawing.style.fill = 'rgba(41, 98, 255, 0.15)';
        if (!drawing.style.textColor) drawing.style.textColor = '#ffffff';
        if (!drawing.style.fontSize) drawing.style.fontSize = 12;
        if (drawing.style.showLabelBackground === undefined) drawing.style.showLabelBackground = true;
        if (!drawing.style.labelBackgroundColor) drawing.style.labelBackgroundColor = 'rgba(30, 34, 45, 0.95)';
        if (drawing.type === 'date-price-range' && !drawing.style.infoSettings) {
            drawing.style.infoSettings = {
                showInfo: true,
                priceRange: true,
                percentChange: true,
                changeInPips: true,
                barsRange: true,
                dateTimeRange: true
            };
        }

        const lineRow = this.createBrushPropertyRow('Line', {
            color: drawing.style.stroke || '#2962ff',
            lineType: drawing.style.strokeDasharray || '',
            lineWidth: drawing.style.strokeWidth || 2
        }, 'line', drawing);
        container.appendChild(lineRow);

        const borderRow = document.createElement('div');
        borderRow.className = 'tv-prop-row';
        const borderEnabled = drawing.style.borderEnabled !== false;
        const borderDash = drawing.style.borderDasharray || '';
        const borderWidth = drawing.style.borderWidth || 1;
        borderRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${borderEnabled ? 'checked' : ''}" data-prop="showBorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Border
            </span>
            <div class="tv-prop-controls">
                <button class="tv-color-btn" data-prop="borderColor" style="background: ${drawing.style.borderColor || drawing.style.stroke || '#2962ff'};"></button>
                <select class="tv-select" data-prop="borderType" style="width: 40px;">
                    <option value="" ${borderDash === '' ? 'selected' : ''}>───────</option>
                    <option value="10,6" ${(borderDash === '10,6' || borderDash === '5,5') ? 'selected' : ''}>─ ─ ─ ─</option>
                    <option value="2,2" ${borderDash === '2,2' ? 'selected' : ''}>··········</option>
                    <option value="8,4,2,4" ${borderDash === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
                </select>
                <select class="tv-select" data-prop="borderWidth" style="width: 48px;">
                    ${[1,2,3,4].map(w => `<option value="${w}" ${parseInt(borderWidth) === w ? 'selected' : ''}>${w}px</option>`).join('')}
                </select>
            </div>
        `;
        borderRow.style.borderBottom = '1px solid #2a2e39';
        borderRow.style.paddingBottom = '12px';
        borderRow.style.marginBottom = '12px';
        container.appendChild(borderRow);

        const bgRow = document.createElement('div');
        bgRow.className = 'tv-prop-row';
        const hasFill = drawing.style.showBackground !== false && drawing.style.fill && drawing.style.fill !== 'none' && drawing.style.fill !== 'transparent';
        bgRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${hasFill ? 'checked' : ''}" data-prop="showBackground">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Background
            </span>
            <div class="tv-prop-controls">
                <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${drawing.style.fill || 'rgba(41, 98, 255, 0.15)'};"></button>
            </div>
        `;
        container.appendChild(bgRow);

        if (drawing.type === 'date-price-range') {
            const infoHeader = document.createElement('div');
            infoHeader.style.cssText = 'color: #787b86; font-size: 12px; margin: 16px 0 12px 0; text-transform: uppercase;';
            infoHeader.textContent = 'Info';
            container.appendChild(infoHeader);

            const statsRow = document.createElement('div');
            statsRow.className = 'tv-prop-row';
            statsRow.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;';
            statsRow.innerHTML = `
                <span class="tv-checkbox-label" style="white-space: nowrap;">Stats</span>
                <button class="tv-info-dropdown-btn" style="padding: 6px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(255,255,255,0.08); color: #d1d4dc; cursor: default; font-size: 13px; display: flex; align-items: center; gap: 6px; min-width: 160px; justify-content: space-between;">
                    <span>Select</span>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </button>
            `;
            container.appendChild(statsRow);
        }

        const labelRow = document.createElement('div');
        labelRow.className = 'tv-prop-row';
        labelRow.style.cssText = 'margin-top: 16px;';
        labelRow.innerHTML = `
            <span class="tv-checkbox-label" style="white-space: nowrap;">Label</span>
            <div class="tv-prop-controls" style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                <button class="tv-color-btn" data-prop="textColor" style="background: ${drawing.style.textColor || '#ffffff'}; width: 28px; height: 28px;"></button>
                <select class="tv-select" data-prop="fontSize" style="min-width: 80px;">
                    ${[8,9,10,11,12,14,16,18,20,24,28,32].map(s => `<option value="${s}" ${parseInt(drawing.style.fontSize || 12) === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        `;
        container.appendChild(labelRow);

        const labelBgRow = document.createElement('div');
        labelBgRow.className = 'tv-prop-row';
        const labelBgEnabled = drawing.style.showLabelBackground !== false;
        labelBgRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${labelBgEnabled ? 'checked' : ''}" data-prop="showLabelBackground">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Label background
            </span>
            <div class="tv-prop-controls">
                <button class="tv-color-btn" data-prop="labelBackgroundColor" style="background: ${drawing.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)'};"></button>
            </div>
        `;
        container.appendChild(labelBgRow);
    }

    /**
     * Build Image V2 specific Style Tab - upload UI
     */
    buildImageV2StyleTab(container, drawing) {
        // Image preview section with label
        const imageGroup = document.createElement('div');
        imageGroup.style.cssText = 'margin-bottom: 16px;';
        
        const label = document.createElement('div');
        label.textContent = 'Image';
        label.style.cssText = 'display: block; margin-bottom: 8px; color: #d1d4dc; font-size: 12px;';
        imageGroup.appendChild(label);
        
        // Image preview container with dashed border
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = `
            width: 100%;
            height: 200px;
            border: 2px dashed #434651;
            border-radius: 4px;
            background: #1e222d;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            cursor: pointer;
        `;
        
        if (drawing.style.imageUrl) {
            // Show image preview
            const img = document.createElement('img');
            img.src = drawing.style.imageUrl;
            img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
            previewContainer.appendChild(img);
            
            // Delete button (trash icon)
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            `;
            deleteBtn.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 8px;
                background: rgba(0, 0, 0, 0.7);
                border: none;
                border-radius: 4px;
                padding: 8px;
                cursor: pointer;
                color: #d1d4dc;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            `;
            deleteBtn.onmouseenter = () => deleteBtn.style.background = 'rgba(242, 54, 69, 0.8)';
            deleteBtn.onmouseleave = () => deleteBtn.style.background = 'rgba(0, 0, 0, 0.7)';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                drawing.style.imageUrl = '';
                if (window.drawingManager) {
                    window.drawingManager.renderDrawing(drawing);
                    window.drawingManager.saveDrawings();
                }
                // Rebuild the modal
                const modal = document.querySelector('.tv-settings-modal');
                if (modal) {
                    const drawingId = modal.dataset.drawingId;
                    modal.remove();
                    document.querySelectorAll(`.tv-external-dropdown[data-modal-id="${drawingId}"]`).forEach(d => d.remove());
                    this.buildTVModal(drawing);
                }
            };
            previewContainer.appendChild(deleteBtn);
        } else {
            // Show placeholder text
            const placeholder = document.createElement('div');
            placeholder.textContent = 'Click to upload image';
            placeholder.style.cssText = 'color: #787b86; font-size: 14px; text-align: center;';
            previewContainer.appendChild(placeholder);
        }
        
        // Click to upload
        previewContainer.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        // Compress image to reduce localStorage usage
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            // Max dimensions to keep file size around 1-2MB
                            const maxWidth = 2000;
                            const maxHeight = 2000;
                            let width = img.width;
                            let height = img.height;
                            
                            if (width > maxWidth || height > maxHeight) {
                                const ratio = Math.min(maxWidth / width, maxHeight / height);
                                width = width * ratio;
                                height = height * ratio;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            // Compress to JPEG with 0.85 quality (targets 1-2MB)
                            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                            
                            drawing.style.imageUrl = compressedDataUrl;
                            if (window.drawingManager) {
                                window.drawingManager.renderDrawing(drawing);
                                window.drawingManager.saveDrawings();
                            }
                            
                            // Live preview - update the preview container without rebuilding modal
                            previewContainer.innerHTML = '';
                            const previewImg = document.createElement('img');
                            previewImg.src = compressedDataUrl;
                            previewImg.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
                            previewContainer.appendChild(previewImg);
                            
                            // Add delete button
                            const deleteBtn = document.createElement('button');
                        deleteBtn.innerHTML = `
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        `;
                        deleteBtn.style.cssText = `
                            position: absolute;
                            bottom: 8px;
                            right: 8px;
                            background: rgba(0, 0, 0, 0.7);
                            border: none;
                            border-radius: 4px;
                            padding: 8px;
                            cursor: pointer;
                            color: #d1d4dc;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        `;
                        deleteBtn.onmouseenter = () => deleteBtn.style.background = 'rgba(242, 54, 69, 0.8)';
                        deleteBtn.onmouseleave = () => deleteBtn.style.background = 'rgba(0, 0, 0, 0.7)';
                            deleteBtn.onclick = (e) => {
                                e.stopPropagation();
                                drawing.style.imageUrl = '';
                                if (window.drawingManager) {
                                    window.drawingManager.renderDrawing(drawing);
                                    window.drawingManager.saveDrawings();
                                }
                                // Rebuild the modal
                                const modal = document.querySelector('.tv-settings-modal');
                                if (modal) {
                                    const drawingId = modal.dataset.drawingId;
                                    modal.remove();
                                    document.querySelectorAll(`.tv-external-dropdown[data-modal-id="${drawingId}"]`).forEach(d => d.remove());
                                    this.buildTVModal(drawing);
                                }
                            };
                            previewContainer.appendChild(deleteBtn);
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        };
        
        imageGroup.appendChild(previewContainer);
        container.appendChild(imageGroup);
        
        // Transparency slider
        const opacityRow = document.createElement('div');
        opacityRow.className = 'tv-prop-row';
        opacityRow.innerHTML = `
            <span class="tv-checkbox-label">Transparency</span>
            <div class="tv-prop-controls" style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
                <input type="range" class="tv-slider" data-prop="transparency" 
                    value="${(drawing.style.opacity || 1) * 100}" 
                    min="0" max="100" step="5"
                    style="width: 100px; accent-color: #2962ff;">
                <span class="tv-transparency-value" style="color: #d1d4dc; font-size: 13px; min-width: 40px;">${Math.round((drawing.style.opacity || 1) * 100)}%</span>
            </div>
        `;
        container.appendChild(opacityRow);
        
        // Add live update for transparency slider
        const transparencySlider = opacityRow.querySelector('input[data-prop="transparency"]');
        const transparencyValue = opacityRow.querySelector('.tv-transparency-value');
        transparencySlider.addEventListener('input', (e) => {
            const transparency = parseFloat(e.target.value);
            drawing.style.opacity = transparency / 100;
            transparencyValue.textContent = `${Math.round(transparency)}%`;
            
            // Immediately re-render the drawing
            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            if (drawingManager) {
                const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    actualDrawing.style.opacity = drawing.style.opacity;
                    drawingManager.renderDrawing(actualDrawing);
                }
            }
            
            this.onUpdate(drawing);
        });
    }

    /**
     * Build Image specific Style Tab - upload UI (original image tool)
     */
    buildImageStyleTab(container, drawing) {
        // Reuse the same UI as image-v2
        this.buildImageV2StyleTab(container, drawing);
    }

    /**
     * Build Emoji specific Style Tab - simplified settings
     */
    buildEmojiStyleTab(container, drawing) {
        // Emoji Preview
        const previewSection = document.createElement('div');
        previewSection.style.cssText = 'text-align: center; padding: 20px 0; border-bottom: 1px solid #363a45; margin-bottom: 16px;';
        previewSection.innerHTML = `
            <span style="font-size: 64px; line-height: 1;">${drawing.style.glyph || '😀'}</span>
        `;
        container.appendChild(previewSection);
        
        // Opacity Row
        const opacityRow = document.createElement('div');
        opacityRow.className = 'tv-prop-row';
        opacityRow.innerHTML = `
            <span class="tv-checkbox-label">Opacity</span>
            <div class="tv-prop-controls" style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
                <input type="range" class="tv-slider" data-prop="opacity" 
                    value="${(drawing.style.opacity || 1) * 100}" 
                    min="10" max="100" step="5"
                    style="width: 100px; accent-color: #2962ff;">
                <span class="tv-opacity-value" style="color: #d1d4dc; font-size: 13px; min-width: 40px;">${Math.round((drawing.style.opacity || 1) * 100)}%</span>
            </div>
        `;
        container.appendChild(opacityRow);
        
        // Background Toggle
        const bgRow = document.createElement('div');
        bgRow.className = 'tv-prop-row';
        const hasBg = drawing.style.showBackground || false;
        bgRow.innerHTML = `
            <div class="tv-checkbox-wrapper">
                <div class="tv-checkbox ${hasBg ? 'checked' : ''}" data-prop="showBackground">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span class="tv-checkbox-label">Background Circle</span>
            </div>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${drawing.style.backgroundColor || 'rgba(0,0,0,0.25)'};"></button>
            </div>
        `;
        container.appendChild(bgRow);
    }

    /**
     * Build Text Tool specific Style Tab
     */
    buildTextStyleTab(container, drawing) {
        // Unify all Texts & Notes tools to the same UI style as Text tool
        const unifiedTextTypes = ['text', 'notebox', 'label', 'anchored-text', 'note', 'price-note', 'price-label', 'price-label-2', 'pin', 'callout', 'comment', 'signpost-2', 'flag-mark'];
        if (unifiedTextTypes.includes(drawing.type)) {
            // Keep pin marker color control
            if (drawing.type === 'pin') {
                const labelColorRow = document.createElement('div');
                labelColorRow.className = 'tv-prop-row';
                labelColorRow.innerHTML = `
                    <span class="tv-checkbox-label">Label Color</span>
                    <div class="tv-prop-controls" style="margin-left: auto;">
                        <button class="tv-color-btn" data-prop="fill" style="background: ${drawing.style.fill || '#2962ff'};"></button>
                    </div>
                `;
                container.appendChild(labelColorRow);
            }

            // For tools that support background/border controls, keep them at the top
            const supportsBackgroundBorder = ['text', 'notebox', 'note', 'callout', 'comment', 'anchored-text', 'pin', 'price-note', 'signpost-2'].includes(drawing.type);
            if (supportsBackgroundBorder) {
                const bgRow = document.createElement('div');
                bgRow.className = 'tv-prop-row';
                const bgColor = (drawing.type === 'callout' || drawing.type === 'comment' || drawing.type === 'pin' || drawing.type === 'anchored-text' || drawing.type === 'notebox')
                    ? drawing.style.backgroundColor
                    : (drawing.style.fill || drawing.style.backgroundColor);
                const hasBg = bgColor && bgColor !== 'none' && bgColor !== 'transparent';
                bgRow.innerHTML = `
                    <div class="tv-checkbox-wrapper">
                        <div class="tv-checkbox ${hasBg ? 'checked' : ''}" data-prop="showBackground">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <span class="tv-checkbox-label">Background</span>
                    </div>
                    <div class="tv-prop-controls" style="margin-left: auto;">
                        <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${bgColor || 'rgba(41, 98, 255, 0.15)'};"></button>
                    </div>
                `;
                container.appendChild(bgRow);

                const borderRow = document.createElement('div');
                borderRow.className = 'tv-prop-row';
                const borderColor = (drawing.type === 'callout' || drawing.type === 'comment' || drawing.type === 'pin' || drawing.type === 'anchored-text')
                    ? drawing.style.borderColor
                    : (drawing.style.stroke || drawing.style.borderColor);
                const hasBorder = borderColor && borderColor !== 'none' && borderColor !== 'transparent';
                borderRow.innerHTML = `
                    <div class="tv-checkbox-wrapper">
                        <div class="tv-checkbox ${hasBorder ? 'checked' : ''}" data-prop="showBorder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <span class="tv-checkbox-label">Border</span>
                    </div>
                    <div class="tv-prop-controls" style="margin-left: auto;">
                        <button class="tv-color-btn" data-prop="borderColor" style="background: ${borderColor || '#B2B5BE'};"></button>
                    </div>
                `;
                container.appendChild(borderRow);
            }

            // Preserve Text tool defaults (TextTool defaults to left alignment)
            if (drawing.type === 'text') {
                if (!drawing.style.textHAlign && !drawing.style.textAlign) {
                    drawing.style.textHAlign = drawing.style.textAlign || 'left';
                    drawing.style.textAlign = drawing.style.textHAlign;
                }
            }

            // Price tools show auto price; don't show a free text editor
            const isAutoText = drawing.type === 'price-note' || drawing.type === 'price-label' || drawing.type === 'price-label-2';
            const hideHorizontalAlign = drawing.type === 'note' || drawing.type === 'price-note';
            this.buildTextTab(container, drawing, { hideVerticalAlign: true, hideHorizontalAlign, hideTextInput: isAutoText });
            return;
        }

        // Text Content - skip for price-note (it shows price automatically)
        if (drawing.type !== 'price-note' && drawing.type !== 'comment') {
            const textContentRow = document.createElement('div');
            textContentRow.className = 'tv-prop-row';
            textContentRow.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 8px;';
            textContentRow.innerHTML = `
                <span class="tv-checkbox-label">Text Content</span>
                <textarea class="tv-text-content-input" data-prop="textContent" style="
                    width: 100%;
                    min-height: 60px;
                    padding: 8px;
                    background: #2a2e39;
                    border: 1px solid #363a45;
                    border-radius: 4px;
                    color: #d1d4dc;
                    font-size: 13px;
                    resize: vertical;
                " placeholder="Enter text...">${drawing.text || ''}</textarea>
            `;
            container.appendChild(textContentRow);
        }
        
        // Text Content for comment tool (show at top)
        if (drawing.type === 'comment') {
            const textContentRow = document.createElement('div');
            textContentRow.className = 'tv-prop-row';
            textContentRow.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 8px;';
            textContentRow.innerHTML = `
                <span class="tv-checkbox-label">Text Content</span>
                <textarea class="tv-text-content-input" data-prop="textContent" style="
                    width: 100%;
                    min-height: 60px;
                    padding: 8px;
                    background: #2a2e39;
                    border: 1px solid #363a45;
                    border-radius: 4px;
                    color: #d1d4dc;
                    font-size: 13px;
                    resize: vertical;
                " placeholder="Enter text...">${drawing.text || ''}</textarea>
            `;
            container.appendChild(textContentRow);
            
            // Background Color for comment bubble
            const bgColorRow = document.createElement('div');
            bgColorRow.className = 'tv-prop-row';
            bgColorRow.innerHTML = `
                <span class="tv-checkbox-label">Background</span>
                <div class="tv-prop-controls" style="margin-left: auto;">
                    <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${drawing.style.backgroundColor || '#2962FF'};"></button>
                </div>
            `;
            container.appendChild(bgColorRow);
        }
        
        // Label Color (Pin marker color) - only for pin tool
        if (drawing.type === 'pin') {
            const labelColorRow = document.createElement('div');
            labelColorRow.className = 'tv-prop-row';
            labelColorRow.innerHTML = `
                <span class="tv-checkbox-label">Label Color</span>
                <div class="tv-prop-controls" style="margin-left: auto;">
                    <button class="tv-color-btn" data-prop="fill" style="background: ${drawing.style.fill || '#2962ff'};"></button>
                </div>
            `;
            container.appendChild(labelColorRow);
        }
        
        // Text Color
        const colorRow = document.createElement('div');
        colorRow.className = 'tv-prop-row';
        colorRow.innerHTML = `
            <span class="tv-checkbox-label">Text Color</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <button class="tv-color-btn" data-prop="textColor" style="background: ${drawing.style.textColor || '#FFFFFF'};"></button>
            </div>
        `;
        container.appendChild(colorRow);
        
        // Font Size
        const sizeRow = document.createElement('div');
        sizeRow.className = 'tv-prop-row';
        sizeRow.innerHTML = `
            <span class="tv-checkbox-label">Font Size</span>
            <div class="tv-prop-controls" style="margin-left: auto;">
                <select class="tv-select" data-prop="fontSize" style="min-width: 80px;">
                    <option value="10" ${drawing.style.fontSize == 10 ? 'selected' : ''}>10px</option>
                    <option value="12" ${drawing.style.fontSize == 12 ? 'selected' : ''}>12px</option>
                    <option value="14" ${drawing.style.fontSize == 14 ? 'selected' : ''}>14px</option>
                    <option value="16" ${drawing.style.fontSize == 16 ? 'selected' : ''}>16px</option>
                    <option value="18" ${drawing.style.fontSize == 18 ? 'selected' : ''}>18px</option>
                    <option value="20" ${drawing.style.fontSize == 20 ? 'selected' : ''}>20px</option>
                    <option value="24" ${drawing.style.fontSize == 24 ? 'selected' : ''}>24px</option>
                    <option value="28" ${drawing.style.fontSize == 28 ? 'selected' : ''}>28px</option>
                    <option value="32" ${drawing.style.fontSize == 32 ? 'selected' : ''}>32px</option>
                    <option value="36" ${drawing.style.fontSize == 36 ? 'selected' : ''}>36px</option>
                </select>
            </div>
        `;
        container.appendChild(sizeRow);
        
        // Font Style Row (Bold + Italic buttons)
        const styleRow = document.createElement('div');
        styleRow.className = 'tv-prop-row';
        styleRow.innerHTML = `
            <span class="tv-checkbox-label">Font Style</span>
            <div class="tv-prop-controls" style="margin-left: auto; gap: 4px;">
                <button class="tv-style-btn ${drawing.style.fontWeight === 'bold' ? 'active' : ''}" data-prop="fontBold" title="Bold">
                    <b>B</b>
                </button>
                <button class="tv-style-btn ${drawing.style.fontStyle === 'italic' ? 'active' : ''}" data-prop="fontItalic" title="Italic">
                    <i>I</i>
                </button>
            </div>
        `;
        container.appendChild(styleRow);
        
        // Text Alignment
        const alignRow = document.createElement('div');
        alignRow.className = 'tv-prop-row';
        alignRow.innerHTML = `
            <span class="tv-checkbox-label">Alignment</span>
            <div class="tv-prop-controls" style="margin-left: auto; gap: 4px;">
                <button class="tv-align-btn ${drawing.style.textAlign === 'left' || !drawing.style.textAlign ? 'active' : ''}" data-prop="textHAlign" data-value="left" title="Left">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
                    </svg>
                </button>
                <button class="tv-align-btn ${drawing.style.textAlign === 'center' ? 'active' : ''}" data-prop="textHAlign" data-value="center" title="Center">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                    </svg>
                </button>
                <button class="tv-align-btn ${drawing.style.textAlign === 'right' ? 'active' : ''}" data-prop="textHAlign" data-value="right" title="Right">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
        container.appendChild(alignRow);
        
        // Background for text types (not for pin - pin uses fill for marker color, not for comment - already shown at top)
        if (drawing.type !== 'pin' && drawing.type !== 'comment') {
            const bgRow = document.createElement('div');
            bgRow.className = 'tv-prop-row';
            // Callout uses backgroundColor, others use fill
            const bgColor = drawing.type === 'callout' ? drawing.style.backgroundColor : drawing.style.fill;
            const hasBg = bgColor && bgColor !== 'none';
            bgRow.innerHTML = `
                <div class="tv-checkbox-wrapper">
                    <div class="tv-checkbox ${hasBg ? 'checked' : ''}" data-prop="showBackground">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label">Background</span>
                </div>
                <div class="tv-prop-controls" style="margin-left: auto;">
                    <button class="tv-color-btn" data-prop="backgroundColor" style="background: ${bgColor || '#FFFFFF'};"></button>
                </div>
            `;
            container.appendChild(bgRow);
            
            // Border for text types (not for pin)
            const borderRow = document.createElement('div');
            borderRow.className = 'tv-prop-row';
            // Callout uses borderColor, others use stroke
            const borderColor = drawing.type === 'callout' ? drawing.style.borderColor : drawing.style.stroke;
            const hasBorder = borderColor && borderColor !== 'none';
            borderRow.innerHTML = `
                <div class="tv-checkbox-wrapper">
                    <div class="tv-checkbox ${hasBorder ? 'checked' : ''}" data-prop="showBorder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span class="tv-checkbox-label">Border</span>
                </div>
                <div class="tv-prop-controls" style="margin-left: auto;">
                    <button class="tv-color-btn" data-prop="borderColor" style="background: ${borderColor || '#B2B5BE'};"></button>
                </div>
            `;
            container.appendChild(borderRow);
        }
    }

    /**
     * Create a property row with checkbox, color, type, width
     * Checkbox is aligned under the color column
     */
    createPropertyRow(label, checked, values, drawing, propKey) {
        const row = document.createElement('div');
        row.className = 'tv-prop-row';
        
        row.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${checked ? 'checked' : ''}" data-prop="${propKey}Enabled">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                ${label}
            </span>
            <div class="tv-prop-controls">
                <button class="tv-color-btn" data-prop="${propKey}Color" style="background: ${values.color};"></button>
                <select class="tv-select" data-prop="${propKey}Type" style="width: 40px;">
                    <option value="" ${values.lineType === '' ? 'selected' : ''}>───────</option>
                    <option value="10,6" ${(values.lineType === '10,6' || values.lineType === '5,5') ? 'selected' : ''}>─ ─ ─ ─</option>
                    <option value="2,2" ${values.lineType === '2,2' ? 'selected' : ''}>··········</option>
                    <option value="8,4,2,4" ${values.lineType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
                </select>
                <select class="tv-select" data-prop="${propKey}Width" style="width: 40px;">
                    <option value="1" ${values.lineWidth == 1 ? 'selected' : ''}>1px</option>
                    <option value="2" ${values.lineWidth == 2 ? 'selected' : ''}>2px</option>
                    <option value="3" ${values.lineWidth == 3 ? 'selected' : ''}>3px</option>
                    <option value="4" ${values.lineWidth == 4 ? 'selected' : ''}>4px</option>
                    
                </select>
            </div>
        `;
        
        return row;
    }

    /**
     * Create brush property row without checkbox (always enabled)
     */
    createBrushPropertyRow(label, values, propKey, drawing) {
        const row = document.createElement('div');
        row.className = 'tv-prop-row brush-prop-row';
        
        // Check if this is a trendline or similar tool to add arrow buttons
        const isTrendline = drawing && ['trendline', 'curve', 'arrow', 'path'].includes(drawing.type);
        const startStyle = isTrendline ? (drawing.style.startStyle || 'normal') : '';
        const endStyle = isTrendline ? (drawing.style.endStyle || 'normal') : '';
        
        // Check if this is a highlighter or brush tool (no line type dropdown)
        const isHighlighterOrBrushNoLineType = drawing && (drawing.type === 'highlighter' || drawing.type === 'brush');
        // Check if this is a highlighter or brush tool to provide extended width options
        const isHighlighterOrBrush = drawing && (drawing.type === 'highlighter' || drawing.type === 'brush');
        
        // Generate line width options based on tool type
        let lineWidthOptions = '';
        const isBrush = drawing && drawing.type === 'brush';
        const isHighlighter = drawing && drawing.type === 'highlighter';
        if (isHighlighter) {
            // Highlighter: larger sizes for freehand drawing
            const highlighterSizes = [8, 12, 20, 32, 48, 64, 80, 96];
            lineWidthOptions = highlighterSizes.map(size => 
                `<option value="${size}" ${values.lineWidth == size ? 'selected' : ''}>${size}px</option>`
            ).join('');
        } else if (isBrush) {
            // Brush: 1px to 4px only
            lineWidthOptions = `
                <option value="1" ${values.lineWidth == 1 ? 'selected' : ''}>1px</option>
                <option value="2" ${values.lineWidth == 2 ? 'selected' : ''}>2px</option>
                <option value="3" ${values.lineWidth == 3 ? 'selected' : ''}>3px</option>
                <option value="4" ${values.lineWidth == 4 ? 'selected' : ''}>4px</option>
            `;
        } else {
            // Other tools: 1px to 4px
            lineWidthOptions = `
                <option value="1" ${values.lineWidth == 1 ? 'selected' : ''}>1px</option>
                <option value="2" ${values.lineWidth == 2 ? 'selected' : ''}>2px</option>
                <option value="3" ${values.lineWidth == 3 ? 'selected' : ''}>3px</option>
                <option value="4" ${values.lineWidth == 4 ? 'selected' : ''}>4px</option>
            `;
        }
        
        // Line type dropdown (not for highlighter or brush)
        const lineTypeDropdown = isHighlighterOrBrushNoLineType ? '' : `
                <select class="tv-select" data-prop="${propKey}Type" style="width: 40px;">
                    <option value="" ${values.lineType === '' ? 'selected' : ''}>───────</option>
                    <option value="10,6" ${(values.lineType === '10,6' || values.lineType === '5,5') ? 'selected' : ''}>─ ─ ─ ─</option>
                    <option value="2,2" ${values.lineType === '2,2' ? 'selected' : ''}>··········</option>
                    <option value="8,4,2,4" ${values.lineType === '8,4,2,4' ? 'selected' : ''}>─·─·─·─</option>
                </select>`;
        
        row.innerHTML = `
            <span class="tv-checkbox-label" style="cursor: default;">${label}</span>
            <div class="tv-prop-controls">
                <button class="tv-color-btn" data-prop="${propKey}Color" style="background: ${values.color};"></button>
                ${lineTypeDropdown}
                <select class="tv-select" data-prop="${propKey}Width" style="width: ${isHighlighter || isBrush ? '70px' : '40px'};">
                    ${lineWidthOptions}
                </select>
                ${isTrendline ? `
                    <div class="tv-ending-dropdown" data-prop="startStyle" style="position: relative;">
                        <button class="tv-ending-dropdown-btn" style="width: 30px; height: 30px; padding: 0px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(255,255,255,0.08); cursor: default; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
                            <svg viewBox="0 0 100 100" width="20" height="20" style="display: block;">
                                ${startStyle === 'arrow' ? 
                                    '<line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="4"/><path d="M 20 50 L 40 30 L 40 70 Z" fill="#d1d4dc"/>' : 
                                    '<circle cx="24" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="4"/><line x1="33" y1="50" x2="88" y2="50" stroke="#d1d4dc" stroke-width="4"/>'}
                            </svg>
                        </button>
                        <div class="tv-ending-dropdown-menu" style="display: none; position: absolute; right: 0; background: #050028; border: 1px solid #2a2e39; border-radius: 4px; margin-top: 4px; z-index: 1000; min-width: 120px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                            <div class="tv-ending-option" data-value="normal" style="padding: 8px; cursor: default; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #363a45;">
                                <svg viewBox="0 0 100 100" width="24" height="24">
                                    <circle cx="24" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="4"/>
                                    <line x1="33" y1="50" x2="88" y2="50" stroke="#d1d4dc" stroke-width="4"/>
                                </svg>
                                <span style="color: #d1d4dc; font-size: 12px;">Normal</span>
                            </div>
                            <div class="tv-ending-option" data-value="arrow" style="padding: 8px; cursor: default; display: flex; align-items: center; gap: 8px;">
                                <svg viewBox="0 0 100 100" width="24" height="24">
                                    <line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="4"/>
                                    <path d="M 20 50 L 40 30 L 40 70 Z" fill="#d1d4dc"/>
                                </svg>
                                <span style="color: #d1d4dc; font-size: 12px;">Arrow</span>
                            </div>
                        </div>
                    </div>
                    <div class="tv-ending-dropdown" data-prop="endStyle" style="position: relative;">
                        <button class="tv-ending-dropdown-btn" style="width: 30px; height: 30px; padding: 0px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; background: rgba(255,255,255,0.08); cursor: default; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
                            <svg viewBox="0 0 100 100" width="20" height="20" style="display: block;">
                                ${endStyle === 'arrow' ? 
                                    '<line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="4"/><path d="M 80 50 L 60 30 L 60 70 Z" fill="#d1d4dc"/>' : 
                                    '<line x1="12" y1="50" x2="67" y2="50" stroke="#d1d4dc" stroke-width="4"/><circle cx="76" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="4"/>'}
                            </svg>
                        </button>
                        <div class="tv-ending-dropdown-menu" style="display: none; position: absolute; right: 0; background: #050028; border: 1px solid #2a2e39; border-radius: 4px; margin-top: 4px; z-index: 1000; min-width: 120px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                            <div class="tv-ending-option" data-value="normal" style="padding: 8px; cursor: default; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #363a45;">
                                <svg viewBox="0 0 100 100" width="24" height="24">
                                    <line x1="12" y1="50" x2="67" y2="50" stroke="#d1d4dc" stroke-width="4"/>
                                    <circle cx="76" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="4"/>
                                </svg>
                                <span style="color: #d1d4dc; font-size: 12px;">Normal</span>
                            </div>
                            <div class="tv-ending-option" data-value="arrow" style="padding: 8px; cursor: default; display: flex; align-items: center; gap: 8px;">
                                <svg viewBox="0 0 100 100" width="24" height="24">
                                    <line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="4"/>
                                    <path d="M 80 50 L 60 30 L 60 70 Z" fill="#d1d4dc"/>
                                </svg>
                                <span style="color: #d1d4dc; font-size: 12px;">Arrow</span>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        return row;
    }

    /**
     * Create checkbox row for extend options
     */
    createCheckboxRow(label, checked, propKey) {
        const row = document.createElement('div');
        row.className = 'tv-extend-row';
        row.innerHTML = `
            <div class="tv-checkbox-wrapper">
                <div class="tv-checkbox ${checked ? 'checked' : ''}" data-prop="${propKey}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span class="tv-checkbox-label">${label}</span>
            </div>
        `;
        return row;
    }

    /**
     * Build Text Tab Content
     */
    buildTextTab(container, drawing, options = {}) {
        const { hideVerticalAlign = false, hideHorizontalAlign = false, hideTextInput = false, placeholder = 'Enter text...' } = options || {};
        const isArrowMarkerType = drawing.type === 'arrow-marker' || drawing.type === 'arrow-mark-up' || drawing.type === 'arrow-mark-down';
	    if (isArrowMarkerType) {
	        const textRow = document.createElement('div');
	        textRow.className = 'tv-prop-row';
	        textRow.innerHTML = `
	            <div class="tv-checkbox-wrapper">
	                <span class="tv-checkbox-label">Text</span>
	            </div>
	            <div class="tv-text-controls">
	                <span style="color: #787b86; font-size: 12px;">Size</span>
	                <select class="tv-select" data-prop="fontSize" style="min-width: 60px;">
	                    ${[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => 
	                        `<option value="${s}" ${(drawing.style.fontSize || 14) == s ? 'selected' : ''}>${s}</option>`
	                    ).join('')}
	                </select>
	                <button class="tv-color-btn" data-prop="textColor" style="background: ${drawing.style.textColor || '#FFFFFF'}; width: 28px; height: 28px;"></button>
	                <button class="tv-style-btn ${drawing.style.fontStyle && drawing.style.fontStyle.includes('italic') ? 'active' : ''}" data-prop="fontItalic"><i>I</i></button>
	                <button class="tv-style-btn ${drawing.style.fontWeight && (drawing.style.fontWeight === 'bold' || drawing.style.fontWeight >= 600) ? 'active' : ''}" data-prop="fontBold"><b>B</b></button>
	            </div>
	        `;
	        container.appendChild(textRow);

	        const textArea = document.createElement('textarea');
	        textArea.className = 'tv-text-input';
	        textArea.placeholder = 'Enter text...';
	        textArea.value = drawing.text || '';
	        textArea.dataset.prop = 'text';
	        container.appendChild(textArea);
	        return;
	    }
        // Text checkbox with controls
        const textRow = document.createElement('div');
        textRow.className = 'tv-prop-row';
        textRow.innerHTML = `
            <div class="tv-checkbox-wrapper">
                
                <span class="tv-checkbox-label">Text</span>
            </div>
            <div class="tv-text-controls">
                <span style="color: #787b86; font-size: 12px;">Size</span>
                <select class="tv-select" data-prop="fontSize" style="min-width: 60px;">
                    ${[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map(s => 
                        `<option value="${s}" ${(drawing.style.fontSize || 14) == s ? 'selected' : ''}>${s}</option>`
                    ).join('')}
                </select>
                <button class="tv-color-btn" data-prop="textColor" style="background: ${drawing.style.textColor || '#FFFFFF'}; width: 28px; height: 28px;"></button>
                <button class="tv-style-btn ${drawing.style.fontStyle && drawing.style.fontStyle.includes('italic') ? 'active' : ''}" data-prop="fontItalic"><i>I</i></button>
                <button class="tv-style-btn ${drawing.style.fontWeight && (drawing.style.fontWeight === 'bold' || drawing.style.fontWeight >= 600) ? 'active' : ''}" data-prop="fontBold"><b>B</b></button>
            </div>
        `;
        container.appendChild(textRow);
        
        // Text Input
        if (!hideTextInput) {
            const textArea = document.createElement('textarea');
            textArea.className = 'tv-text-input';
            textArea.placeholder = placeholder;
            textArea.value = drawing.text || '';
            textArea.dataset.prop = 'text';
            container.appendChild(textArea);
        }
        
        // Vertical Alignment - lines default to 'top', shapes to 'middle'
        const lineTypes = ['trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray', 'extended-line', 'cross-line', 'arrow'];
        const defaultVAlign = lineTypes.includes(drawing.type) ? 'top' : 'middle';
        const defaultHAlign = 'center';
        
        // Set defaults on drawing if not already set (so UI matches actual rendering)
        let needsRerender = false;
        if (!hideVerticalAlign) {
            if (!drawing.style.textVAlign && !drawing.style.textPosition) {
                drawing.style.textVAlign = defaultVAlign;
                drawing.style.textPosition = defaultVAlign;
                needsRerender = true;
            }
        }
        if (!hideHorizontalAlign) {
            if (!drawing.style.textHAlign && !drawing.style.textAlign) {
                drawing.style.textHAlign = defaultHAlign;
                drawing.style.textAlign = defaultHAlign;
                needsRerender = true;
            }
        }
        // Re-render if defaults were applied so text position updates
        if (needsRerender && window.drawingManager) {
            window.drawingManager.renderDrawing(drawing);
        }
        
        if (!hideVerticalAlign) {
            const currentVAlign = drawing.style.textVAlign || drawing.style.textPosition || defaultVAlign;
            
            const vAlignSection = document.createElement('div');
            vAlignSection.className = 'tv-align-section';
            vAlignSection.innerHTML = `
                <div class="tv-align-label">Vertical Alignment</div>
                <div class="tv-align-buttons">
                    <button class="tv-align-btn ${currentVAlign === 'top' ? 'active' : ''}" data-prop="textVAlign" data-value="top">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="4" x2="12" y2="20"/>
                            <polyline points="8 8 12 4 16 8"/>
                        </svg>
                    </button>
                    <button class="tv-align-btn ${currentVAlign === 'middle' ? 'active' : ''}" data-prop="textVAlign" data-value="middle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" y1="12" x2="20" y2="12"/>
                            <polyline points="8 8 12 12 8 16"/>
                            <polyline points="16 8 12 12 16 16"/>
                        </svg>
                    </button>
                    <button class="tv-align-btn ${currentVAlign === 'bottom' ? 'active' : ''}" data-prop="textVAlign" data-value="bottom">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="4" x2="12" y2="20"/>
                            <polyline points="8 16 12 20 16 16"/>
                        </svg>
                    </button>
                </div>
            `;
            container.appendChild(vAlignSection);
        }
        
        // Horizontal Alignment
        if (!hideHorizontalAlign) {
            const hAlignSection = document.createElement('div');
            hAlignSection.className = 'tv-align-section';
            hAlignSection.style.marginTop = '12px';
            hAlignSection.innerHTML = `
                <div class="tv-align-label">Horizontal Alignment</div>
                <div class="tv-align-buttons">
                    <button class="tv-align-btn ${(drawing.style.textHAlign || 'center') === 'left' ? 'active' : ''}" data-prop="textHAlign" data-value="left">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" y1="6" x2="20" y2="6"/>
                            <line x1="4" y1="12" x2="14" y2="12"/>
                            <line x1="4" y1="18" x2="18" y2="18"/>
                        </svg>
                    </button>
                    <button class="tv-align-btn ${(drawing.style.textHAlign || 'center') === 'center' ? 'active' : ''}" data-prop="textHAlign" data-value="center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" y1="6" x2="20" y2="6"/>
                            <line x1="7" y1="12" x2="17" y2="12"/>
                            <line x1="5" y1="18" x2="19" y2="18"/>
                        </svg>
                    </button>
                    <button class="tv-align-btn ${(drawing.style.textHAlign || 'center') === 'right' ? 'active' : ''}" data-prop="textHAlign" data-value="right">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" y1="6" x2="20" y2="6"/>
                            <line x1="10" y1="12" x2="20" y2="12"/>
                            <line x1="6" y1="18" x2="20" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;
            container.appendChild(hAlignSection);
        }

        if (drawing.type === 'vertical') {
            const orientationSection = document.createElement('div');
            orientationSection.className = 'tv-align-section';
            orientationSection.style.marginTop = '12px';
            const currentOrientation = drawing.style.textOrientation || 'horizontal';
            orientationSection.innerHTML = `
                <div class="tv-align-label">Orientation</div>
                <div class="tv-align-buttons">
                    <button class="tv-align-btn ${currentOrientation === 'horizontal' ? 'active' : ''}" data-prop="textOrientation" data-value="horizontal">
                        H
                    </button>
                    <button class="tv-align-btn ${currentOrientation === 'vertical' ? 'active' : ''}" data-prop="textOrientation" data-value="vertical">
                        V
                    </button>
                </div>
            `;
            container.appendChild(orientationSection);
        }
    }

    /**
     * Build Regression Inputs Tab Content
     */
    buildRegressionInputsTab(container, drawing) {
        const self = this;
        
        // Upper Deviation with checkbox on same row
        const upperDevRow = document.createElement('div');
        upperDevRow.className = 'tv-prop-row';
        upperDevRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
        upperDevRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${drawing.style.useUpperDeviation !== false ? 'checked' : ''}" data-prop="useUpperDeviation">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Upper Deviation
            </span>
            <div class="number-input-wrapper">
                <input type="number" class="tv-number-input" data-prop="upperDeviation" 
                       value="${drawing.style.upperDeviation || 2}" 
                       step="0.1" 
                       style="color: #d1d4dc; font-size: 13px; text-align: center;">
                <div class="custom-spinner" data-target="upperDeviation">
                    <div class="custom-spinner-btn" data-action="up"><svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg></div>
                    <div class="custom-spinner-btn" data-action="down"><svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg></div>
                </div>
            </div>
        `;
        container.appendChild(upperDevRow);
        
        // Lower Deviation with checkbox on same row
        const lowerDevRow = document.createElement('div');
        lowerDevRow.className = 'tv-prop-row';
        lowerDevRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
        lowerDevRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${drawing.style.useLowerDeviation !== false ? 'checked' : ''}" data-prop="useLowerDeviation">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Lower Deviation
            </span>
            <div class="number-input-wrapper">
                <input type="number" class="tv-number-input" data-prop="lowerDeviation" 
                       value="${drawing.style.lowerDeviation || -2}" 
                       step="0.1" 
                       style="color: #d1d4dc; font-size: 13px; text-align: center;">
                <div class="custom-spinner" data-target="lowerDeviation">
                    <div class="custom-spinner-btn" data-action="up"><svg viewBox="0 0 10 10"><polyline points="2,7 5,3 8,7"></polyline></svg></div>
                    <div class="custom-spinner-btn" data-action="down"><svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3"></polyline></svg></div>
                </div>
            </div>
        `;
        container.appendChild(lowerDevRow);
        
        // Divider above extend options
        const dividerTop = document.createElement('div');
        dividerTop.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.1); margin: 12px 0;';
        container.appendChild(dividerTop);
        
        // Extend Left/Right on one line
        const extendRow = document.createElement('div');
        extendRow.className = 'tv-prop-row';
        extendRow.style.cssText = 'margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start;';
        extendRow.innerHTML = `
            <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${drawing.style.extendLeft ? 'checked' : ''}" data-prop="extendLeft">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span class="tv-checkbox-label" style="white-space: nowrap;">Extend Left</span>
            </div>
            <div class="tv-checkbox-wrapper" style="min-width: 0; margin: 0; display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${drawing.style.extendRight ? 'checked' : ''}" data-prop="extendRight">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span class="tv-checkbox-label" style="white-space: nowrap;">Extend Right</span>
            </div>
        `;
        container.appendChild(extendRow);
        
        // Divider below extend options
        const dividerBottom = document.createElement('div');
        dividerBottom.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.1); margin: 12px 0;';
        container.appendChild(dividerBottom);
        
        // Pearson's R checkbox
        const pearsonsRRow = document.createElement('div');
        pearsonsRRow.className = 'tv-prop-row';
        pearsonsRRow.style.cssText = 'margin-bottom: 12px;';
        pearsonsRRow.innerHTML = `
            <span class="tv-prop-label" style="display: flex; align-items: center; gap: 8px;">
                <div class="tv-checkbox ${drawing.style.showPearsonsR ? 'checked' : ''}" data-prop="showPearsonsR">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                Pearson's R
            </span>
        `;
        container.appendChild(pearsonsRRow);
        
        // Source dropdown
        const sourceRow = document.createElement('div');
        sourceRow.className = 'tv-prop-row';
        sourceRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
        const currentSource = drawing.style.source || 'close';
        sourceRow.innerHTML = `
            <span class="tv-prop-label">Source</span>
            <select class="tv-select" data-prop="source" style="width: 62px; padding: 4px 6px; font-size: 12px; background: #000; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;">
                <option value="close" ${currentSource === 'close' ? 'selected' : ''}>Close</option>
                <option value="open" ${currentSource === 'open' ? 'selected' : ''}>Open</option>
                <option value="high" ${currentSource === 'high' ? 'selected' : ''}>High</option>
                <option value="low" ${currentSource === 'low' ? 'selected' : ''}>Low</option>
            </select>
        `;
        container.appendChild(sourceRow);
    }

    buildCoordinatesTab(container, drawing) {
        container.innerHTML = '';

    if (!drawing || !Array.isArray(drawing.points) || drawing.points.length === 0) {
        return;
    }

    const drawingManager = window.chart?.drawingManager || window.drawingManager;
    const chart = drawingManager?.chart || window.chart || drawing.chart;
    const data = chart?.data || [];
    const timeframe = chart?.currentTimeframe || null;
    const hasData = Array.isArray(data) && data.length > 0;

    const getAxisDecimals = () => {
        // Match the price-axis selection label formatting used by drawings
        // (see BaseDrawing axis highlight: price.toFixed(this.chart.priceDecimals || 5))
        if (typeof chart?.priceDecimals === 'number' && isFinite(chart.priceDecimals)) {
            return chart.priceDecimals;
        }
        return 5;
    };

    const formatAxisPrice = (val) => {
        const n = Number.parseFloat(val);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(getAxisDecimals());
    };

    const pointsToShow = drawing.points.length >= 2
        ? [
            { label: 'Point 1', index: 0 },
            { label: 'Point 2', index: 1 }
        ]
        : [
            { label: 'Point 1', index: 0 }
        ];

    const applyPointUpdate = (pointIndex, updates) => {
        const idx = Number(pointIndex);
        if (!Number.isFinite(idx) || !drawing.points[idx]) return;

        const pointsCopy = drawing.points.map(q => ({ ...q }));
        const target = pointsCopy[idx];

        if (updates.timestamp !== undefined) {
            const ts = updates.timestamp;
            if (Number.isFinite(ts) && hasData) {
                target.x = CoordinateUtils.timestampToIndex(ts, data, timeframe);
            }
        }
        if (updates.index !== undefined) {
            const nx = updates.index;
            if (Number.isFinite(nx)) {
                target.x = nx;
            }
        }
        if (updates.price !== undefined) {
            const ny = updates.price;
            if (Number.isFinite(ny)) {
                target.y = ny;
            }
        }

        this.pendingChanges.points = pointsCopy;
        this.applyChanges(drawing);
    };

    const list = document.createElement('div');
    list.className = 'tv-coords-list';

    const showBarIndex = drawing.type !== 'horizontal';
    const showPrice = drawing.type !== 'vertical';

    pointsToShow.forEach(pt => {
        const p = drawing.points[pt.index];
        if (!p) return;

        const row = document.createElement('div');
        row.className = 'tv-coords-row';

        const label = document.createElement('div');
        label.className = 'tv-coords-label';
        label.textContent = (showPrice && showBarIndex)
            ? `#${pt.index + 1} (price, bar)`
            : (showPrice ? `#${pt.index + 1} (price)` : `#${pt.index + 1} (bar)`);

        const controls = document.createElement('div');
        controls.className = 'tv-coords-controls';

        let priceInput;
        let priceWrap;
        let priceUpBtn;
        let priceDownBtn;
        if (showPrice) {
            priceInput = document.createElement('input');
            priceInput.className = 'tv-coords-input';
            priceInput.type = 'text';
            priceInput.inputMode = 'decimal';
            priceInput.dataset.pointIndex = String(pt.index);
            priceInput.value = formatAxisPrice(p.y);

            priceWrap = document.createElement('div');
            priceWrap.className = 'tv-coords-number-wrap';

            const priceStepper = document.createElement('div');
            priceStepper.className = 'tv-coords-stepper';

            priceUpBtn = document.createElement('button');
            priceUpBtn.type = 'button';
            priceUpBtn.className = 'tv-coords-stepper-btn';
            priceUpBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5H7z"/></svg>';

            priceDownBtn = document.createElement('button');
            priceDownBtn.type = 'button';
            priceDownBtn.className = 'tv-coords-stepper-btn';
            priceDownBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>';

            priceStepper.appendChild(priceUpBtn);
            priceStepper.appendChild(priceDownBtn);

            priceWrap.appendChild(priceInput);
            priceWrap.appendChild(priceStepper);
        }

        let barInput;
        let upBtn;
        let downBtn;
        let barWrap;
        if (showBarIndex) {
            barInput = document.createElement('input');
            barInput.className = 'tv-coords-input';
            barInput.type = 'text';
            barInput.inputMode = 'numeric';
            barInput.dataset.pointIndex = String(pt.index);
            barInput.value = Number.isFinite(p.x) ? String(Math.round(p.x)) : '0';

            barWrap = document.createElement('div');
            barWrap.className = 'tv-coords-number-wrap';

            const stepper = document.createElement('div');
            stepper.className = 'tv-coords-stepper';

            upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'tv-coords-stepper-btn';
            upBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5H7z"/></svg>';

            downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'tv-coords-stepper-btn';
            downBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>';

            stepper.appendChild(upBtn);
            stepper.appendChild(downBtn);

            barWrap.appendChild(barInput);
            barWrap.appendChild(stepper);
        }

        if (showPrice && priceInput && priceUpBtn && priceDownBtn) {
            priceInput.addEventListener('change', () => {
                const pointIndex = priceInput.dataset.pointIndex;
                const normalized = String(priceInput.value || '').trim().replace(',', '.');
                const ny = parseFloat(normalized);
                applyPointUpdate(pointIndex, { price: ny });
                priceInput.value = formatAxisPrice(ny);
            });

            priceInput.addEventListener('blur', () => {
                const normalized = String(priceInput.value || '').trim().replace(',', '.');
                const ny = parseFloat(normalized);
                if (Number.isFinite(ny)) {
                    priceInput.value = formatAxisPrice(ny);
                }
            });

            const commitPriceValue = (raw) => {
                const pointIndex = priceInput.dataset.pointIndex;
                const normalized = String(raw ?? '').trim().replace(',', '.');
                const ny = parseFloat(normalized);
                if (Number.isFinite(ny)) {
                    applyPointUpdate(pointIndex, { price: ny });
                    priceInput.value = formatAxisPrice(ny);
                }
            };

            const stepPrice = (dir) => {
                const decimals = getAxisDecimals();
                const factor = Math.pow(10, decimals);
                const current = parseFloat(String(priceInput.value || '').trim().replace(',', '.'));
                const liveY = drawing?.points?.[pt.index]?.y;
                const base = Number.isFinite(current) ? current : (Number.isFinite(liveY) ? liveY : 0);
                const snapped = Math.round(base * factor);
                const next = (snapped + dir) / factor;
                commitPriceValue(next);
            };

            priceInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    stepPrice(e.key === 'ArrowUp' ? 1 : -1);
                }
            });

            priceUpBtn.addEventListener('click', () => stepPrice(1));
            priceDownBtn.addEventListener('click', () => stepPrice(-1));
        }

        if (showBarIndex && barInput && upBtn && downBtn) {
            const commitBarValue = (raw) => {
                const pointIndex = barInput.dataset.pointIndex;
                const cleaned = String(raw ?? '').trim();
                const nx = parseInt(cleaned, 10);
                if (Number.isFinite(nx)) {
                    barInput.value = String(nx);
                    applyPointUpdate(pointIndex, { index: nx });
                }
            };

            barInput.addEventListener('change', () => {
                commitBarValue(barInput.value);
            });

            barInput.addEventListener('blur', () => {
                commitBarValue(barInput.value);
            });

            barInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const current = parseInt(String(barInput.value || '0'), 10);
                    const base = Number.isFinite(current) ? current : 0;
                    const next = e.key === 'ArrowUp' ? (base + 1) : (base - 1);
                    commitBarValue(next);
                }
            });

            upBtn.addEventListener('click', () => {
                const current = parseInt(String(barInput.value || '0'), 10);
                const base = Number.isFinite(current) ? current : 0;
                commitBarValue(base + 1);
            });

            downBtn.addEventListener('click', () => {
                const current = parseInt(String(barInput.value || '0'), 10);
                const base = Number.isFinite(current) ? current : 0;
                commitBarValue(base - 1);
            });
        }

        if (showPrice && priceWrap) {
            controls.appendChild(priceWrap);
        }
        if (showBarIndex && barWrap) {
            controls.appendChild(barWrap);
        }

        row.appendChild(label);
        row.appendChild(controls);
        list.appendChild(row);
    });

        container.appendChild(list);
    }

    /**
     * Build Timeframes Tab Content
     */
    buildTimeframesTab(container, drawing) {
        container.innerHTML = '';

        const list = document.createElement('div');
        list.className = 'tv-timeframe-list';

        if (!drawing.visibility) drawing.visibility = {};
        if (!drawing.visibility._ranges) drawing.visibility._ranges = {};

        const units = [
            { key: 'm', label: 'Minutes', min: 1, max: 59 },
            { key: 'h', label: 'Hours', min: 1, max: 24 },
            { key: 'd', label: 'Days', min: 1, max: 366 },
            { key: 'w', label: 'Weeks', min: 1, max: 260 },
            { key: 'mo', label: 'Months', min: 1, max: 120 },
        ];

        const ensureRange = (unitKey, defaults) => {
            const existing = drawing.visibility._ranges[unitKey] || {};
            const enabled = typeof existing.enabled === 'boolean' ? existing.enabled : true;
            const minVal = Number.isFinite(+existing.min) ? +existing.min : defaults.min;
            const maxVal = Number.isFinite(+existing.max) ? +existing.max : defaults.max;
            drawing.visibility._ranges[unitKey] = {
                enabled,
                min: Math.max(defaults.min, Math.min(defaults.max, minVal)),
                max: Math.max(defaults.min, Math.min(defaults.max, maxVal))
            };
            if (drawing.visibility._ranges[unitKey].min > drawing.visibility._ranges[unitKey].max) {
                drawing.visibility._ranges[unitKey].max = drawing.visibility._ranges[unitKey].min;
            }
        };

        const updateSliderFill = (sliderEl, minVal, maxVal, minAllowed, maxAllowed) => {
            const span = Math.max(1, (maxAllowed - minAllowed));
            const minPct = ((minVal - minAllowed) / span) * 100;
            const maxPct = ((maxVal - minAllowed) / span) * 100;
            sliderEl.style.setProperty('--min-pct', `${Math.max(0, Math.min(100, minPct))}%`);
            sliderEl.style.setProperty('--max-pct', `${Math.max(0, Math.min(100, maxPct))}%`);
        };

        const applyVisibilityNow = () => {
            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            const actualDrawing = drawingManager?.drawings?.find(d => d.id === drawing.id) || drawing;
            if (actualDrawing !== drawing) {
                actualDrawing.visibility = JSON.parse(JSON.stringify(drawing.visibility));
            }
            if (drawingManager) {
                drawingManager.renderDrawing(actualDrawing);
                if (drawingManager.saveDrawings) drawingManager.saveDrawings();
            } else if (actualDrawing.group) {
                const currentTf = window.chart?.currentTimeframe || '1m';
                const shouldShow = !actualDrawing.visibility || actualDrawing.visibility[currentTf] !== false;
                actualDrawing.group.style('display', shouldShow ? null : 'none');
            }
        };

        units.forEach(u => {
            ensureRange(u.key, u);
            const r = drawing.visibility._ranges[u.key];

            const row = document.createElement('div');
            row.className = 'tv-timeframe-range-row';
            row.dataset.unit = u.key;

            const cb = document.createElement('div');
            cb.className = `tv-checkbox ${r.enabled ? 'checked' : ''}`;
            cb.dataset.prop = 'timeframeRangeEnabled';
            cb.dataset.unit = u.key;
            cb.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;

            const label = document.createElement('div');
            label.className = 'tv-timeframe-range-label';
            label.textContent = u.label;

            const minInput = document.createElement('input');
            minInput.type = 'text';
            minInput.inputMode = 'numeric';
            minInput.className = 'tv-timeframe-range-input';
            minInput.value = String(r.min);

            const slider = document.createElement('div');
            slider.className = 'tv-timeframe-slider';

            const rangeMin = document.createElement('input');
            rangeMin.type = 'range';
            rangeMin.min = String(u.min);
            rangeMin.max = String(u.max);
            rangeMin.step = '1';
            rangeMin.value = String(r.min);

            const rangeMax = document.createElement('input');
            rangeMax.type = 'range';
            rangeMax.min = String(u.min);
            rangeMax.max = String(u.max);
            rangeMax.step = '1';
            rangeMax.value = String(r.max);

            slider.appendChild(rangeMin);
            slider.appendChild(rangeMax);

            const maxInput = document.createElement('input');
            maxInput.type = 'text';
            maxInput.inputMode = 'numeric';
            maxInput.className = 'tv-timeframe-range-input';
            maxInput.value = String(r.max);

            const syncAll = () => {
                const unitKey = u.key;
                const cur = drawing.visibility._ranges[unitKey];
                rangeMin.value = String(cur.min);
                rangeMax.value = String(cur.max);
                minInput.value = String(cur.min);
                maxInput.value = String(cur.max);
                updateSliderFill(slider, cur.min, cur.max, u.min, u.max);
            };

            const setRange = (nextMin, nextMax) => {
                const unitKey = u.key;
                const minV = Math.max(u.min, Math.min(u.max, Math.round(nextMin)));
                const maxV = Math.max(u.min, Math.min(u.max, Math.round(nextMax)));
                drawing.visibility._ranges[unitKey].min = Math.min(minV, maxV);
                drawing.visibility._ranges[unitKey].max = Math.max(minV, maxV);
                syncAll();
                applyVisibilityNow();
            };

            updateSliderFill(slider, r.min, r.max, u.min, u.max);

            cb.addEventListener('click', () => {
                cb.classList.toggle('checked');
                drawing.visibility._ranges[u.key].enabled = cb.classList.contains('checked');
                applyVisibilityNow();
            });

            rangeMin.addEventListener('input', () => {
                const nextMin = parseInt(rangeMin.value, 10);
                const currentMax = parseInt(rangeMax.value, 10);
                setRange(nextMin, Math.max(nextMin, currentMax));
            });

            rangeMax.addEventListener('input', () => {
                const nextMax = parseInt(rangeMax.value, 10);
                const currentMin = parseInt(rangeMin.value, 10);
                setRange(Math.min(currentMin, nextMax), nextMax);
            });

            const commitText = () => {
                const nextMin = parseInt(String(minInput.value || '').trim(), 10);
                const nextMax = parseInt(String(maxInput.value || '').trim(), 10);
                const minOk = Number.isFinite(nextMin) ? nextMin : drawing.visibility._ranges[u.key].min;
                const maxOk = Number.isFinite(nextMax) ? nextMax : drawing.visibility._ranges[u.key].max;
                setRange(minOk, maxOk);
            };

            minInput.addEventListener('blur', commitText);
            maxInput.addEventListener('blur', commitText);

            minInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commitText();
                }
            });
            maxInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commitText();
                }
            });

            row.appendChild(cb);
            row.appendChild(label);
            row.appendChild(minInput);
            row.appendChild(slider);
            row.appendChild(maxInput);
            list.appendChild(row);
        });

        container.appendChild(list);
    }

    /**
     * Build Template Tab Content for external dropdown
     */
    buildTemplateTabContent(container, drawing, modal) {
        const templates = this.getSavedTemplates(drawing.type);
        
        container.innerHTML = `
            <div class="tv-template-list">
                <div class="tv-template-item" data-action="save-template">
                    <span>Save as</span>
                </div>
                <div class="tv-template-item" data-action="apply-default">
                    <span>Apply Default</span>
                </div>
                ${templates.length > 0 ? `
                    <div style="height: 1px; background: #1a1a1a; margin: 8px 0;"></div>
                    ${templates.map(t => `
                        <div class="tv-template-item tv-template-saved" data-template-id="${t.id}">
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <span style="width: 12px; height: 12px; border-radius: 2px; background: ${t.stroke || '#787b86'}; border: 1px solid rgba(255,255,255,0.2);"></span>
                                ${t.name}
                            </span>
                            <span class="tv-template-delete" data-template-id="${t.id}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                            </span>
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        `;
        
        // Add event listeners
        container.querySelectorAll('.tv-template-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                const templateId = item.dataset.templateId;
                
                if (action === 'save-template') {
                    this.showSaveTemplateDialog(drawing, null);
                } else if (action === 'apply-default') {
                    this.applyDefaultTemplate(drawing, modal);
                } else if (templateId) {
                    // Check if delete button was clicked
                    if (e.target.closest('.tv-template-delete')) {
                        this.deleteTemplate(drawing.type, templateId);
                        this.buildTemplateTabContent(container, drawing, modal);
                    } else {
                        this.applyTemplate(drawing, templateId, modal);
                    }
                }
            });
        });
    }

    /**
     * Setup event listeners for the TV modal
     */
    setupTVModalEvents(modal, drawing) {
        const self = this;
        
        // Listen for drawing style changes (e.g., from resize handles) to sync UI
        const styleChangeHandler = (e) => {
            if (e.detail && e.detail.drawing && e.detail.drawing.id === drawing.id) {
                const { property, value } = e.detail;
                // Update font size selector
                if (property === 'fontSize') {
                    const updateFontSizeSelect = (select) => {
                        // Check if exact value exists as option
                        let exactOption = select.querySelector(`option[value="${value}"]`);
                        if (!exactOption) {
                            // Add the actual value as a new option
                            exactOption = document.createElement('option');
                            exactOption.value = value;
                            exactOption.textContent = `${value}px`;
                            select.appendChild(exactOption);
                        }
                        select.value = value;
                    };
                    
                    modal.querySelectorAll('select[data-prop="fontSize"]').forEach(updateFontSizeSelect);
                }
            }
        };
        window.addEventListener('drawingStyleChanged', styleChangeHandler);
        
        // Store handler reference for cleanup
        modal._styleChangeHandler = styleChangeHandler;
        
        // Tab switching (horizontal tabs)
        modal.querySelectorAll('.tv-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.tv-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.tv-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                modal.querySelector(`.tv-tab-pane[data-tab="${btn.dataset.tab}"]`).classList.add('active');
            });
        });
        
        // Side tab switching (vertical tabs for brush/highlighter)
        modal.querySelectorAll('.tv-side-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.tv-side-tab-btn').forEach(b => {
                    b.classList.remove('active');
                });
                modal.querySelectorAll('.tv-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                modal.querySelector(`.tv-tab-pane[data-tab="${btn.dataset.tab}"]`).classList.add('active');
            });
        });
        
        // Collapsible tab switching (integrated right-side panes)
        const activateCollapsibleTab = (tabName) => {
            modal.querySelectorAll('.tv-collapsible-tab-btn').forEach(b => b.classList.remove('active'));
            modal.querySelectorAll('.tv-tab-pane').forEach(p => p.classList.remove('active'));
            const btn = modal.querySelector(`.tv-collapsible-tab-btn[data-tab="${tabName}"]`);
            const pane = modal.querySelector(`.tv-tab-pane[data-tab="${tabName}"]`);
            if (btn) btn.classList.add('active');
            if (pane) pane.classList.add('active');
        };

        modal.querySelectorAll('.tv-collapsible-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                if (!tabName) return;
                activateCollapsibleTab(tabName);
            });
        });

        const templateFooterBtn = modal.querySelector('.tv-btn-template');
        if (templateFooterBtn) {
            templateFooterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showTemplateDropdown(templateFooterBtn, drawing, modal);
            });
        }
        
        // Close button - also cleanup external dropdowns and event listeners
        modal.querySelector('.tv-modal-close').addEventListener('click', () => {
            // Commit changes so OK is not required
            if (Object.keys(this.pendingChanges || {}).length > 0) {
                this.applyChanges(drawing);
            } else {
                this.applyChangesImmediately(drawing);
            }

            // Cleanup external dropdowns
            if (modal.externalDropdowns) {
                modal.externalDropdowns.forEach(d => d.remove());
            }

            // Cleanup listeners
            if (modal._styleChangeHandler) {
                window.removeEventListener('drawingStyleChanged', modal._styleChangeHandler);
            }
            if (modal._templatesUpdatedHandler) {
                window.removeEventListener('drawingTemplatesUpdated', modal._templatesUpdatedHandler);
            }
            if (this.clickOutsideHandler) {
                document.removeEventListener('mousedown', this.clickOutsideHandler, true);
            }

            this.hide();
        });

        // Click outside to close - use capture phase to ensure it fires before other handlers
        this.clickOutsideHandler = (event) => {
            // Check if click is outside the modal
            if (!modal.contains(event.target)) {
                // Also check for color picker, template dropdown, info dropdown, and external dropdowns
                const colorPicker = document.querySelector('.tv-color-picker');
                const templateDropdown = document.querySelector('.settings-template-dropdown');
                const infoDropdown = document.querySelector('.settings-info-dropdown');
                const externalDropdown = event.target.closest('.tv-external-dropdown');
                if ((colorPicker && colorPicker.contains(event.target)) ||
                    (templateDropdown && templateDropdown.contains(event.target)) ||
                    (infoDropdown && infoDropdown.contains(event.target)) ||
                    externalDropdown) {
                    return; // Don't close if clicking on color picker, template dropdown, info dropdown, or external dropdown
                }

                // Cleanup external dropdowns before hiding
                if (modal.externalDropdowns) {
                    modal.externalDropdowns.forEach(d => d.remove());
                }

                // Commit changes so OK is not required
                if (Object.keys(self.pendingChanges || {}).length > 0) {
                    self.applyChanges(drawing);
                } else {
                    self.applyChangesImmediately(drawing);
                }

                // Cleanup listeners
                if (modal._styleChangeHandler) {
                    window.removeEventListener('drawingStyleChanged', modal._styleChangeHandler);
                }
                if (modal._templatesUpdatedHandler) {
                    window.removeEventListener('drawingTemplatesUpdated', modal._templatesUpdatedHandler);
                }
                document.removeEventListener('mousedown', this.clickOutsideHandler, true);

                this.hide();
            }
        };

        // Use requestAnimationFrame to avoid immediate close
        requestAnimationFrame(() => {
            document.addEventListener('mousedown', this.clickOutsideHandler, true);
        });
        
        // Apply button - save style as default for this tool type, then close
        modal.querySelector('.tv-btn-apply').addEventListener('click', () => {
            // [debug removed]
            // [debug removed]
            
            // Apply all pending changes to the drawing
            this.applyChanges(drawing);
            
            // [debug removed]
            
            // Save the current style as default for this tool type
            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            if (drawingManager && drawing && drawing.type) {
                // Find the actual drawing in the manager and update it
                const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    // [debug removed]
                    // Copy all properties including levels
                    actualDrawing.style = JSON.parse(JSON.stringify(drawing.style));
                    actualDrawing.text = drawing.text;
                    actualDrawing.points = (drawing.points || []).map(p => ({ ...p }));
                    if (typeof actualDrawing.recalculateTimestamps === 'function') {
                        actualDrawing.recalculateTimestamps();
                    }
                    if (drawing.levels) {
                        actualDrawing.levels = JSON.parse(JSON.stringify(drawing.levels));
                        // [debug removed]
                    }
                    // Re-render and save
                    drawingManager.renderDrawing(actualDrawing);
                    drawingManager.saveDrawings();
                }
                // Save as default style for this tool type
                drawingManager.saveToolStyle(drawing.type, drawing.style);
            }
            
            // Cleanup external dropdowns
            if (modal.externalDropdowns) {
                modal.externalDropdowns.forEach(d => d.remove());
            }
            this.hide();
        });
        
        // Cancel button - revert all changes and close
        // Read original style from modal dataset (stored at build time)
        const cancelBtn = modal.querySelector('.tv-btn-cancel');
        // [debug removed]
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // [debug removed]
                
                try {
                    // Get original style from modal dataset
                    const originalStyleStr = modal.dataset.originalStyle;
                    const originalText = modal.dataset.originalText || '';
                    const originalLevelsStr = modal.dataset.originalLevels;
                    const originalPointsStr = modal.dataset.originalPoints;
                    const drawingId = modal.dataset.drawingId;
                    
                    const drawingManager = window.chart?.drawingManager || window.drawingManager;
                    
                    
                    if (originalStyleStr && drawingManager && drawingId) {
                        const originalStyle = JSON.parse(originalStyleStr);
                        const actualDrawing = drawingManager.drawings.find(d => d.id === drawingId);
                        
                        // [debug removed]
                        
                        if (actualDrawing) {
                            // Replace the entire style object
                            actualDrawing.style = JSON.parse(JSON.stringify(originalStyle));
                            actualDrawing.text = originalText;

                            if (originalPointsStr) {
                                actualDrawing.points = JSON.parse(originalPointsStr);
                                if (typeof actualDrawing.recalculateTimestamps === 'function') {
                                    actualDrawing.recalculateTimestamps();
                                }
                            }
                            
                            // Restore levels for Fibonacci/channel tools
                            if (originalLevelsStr) {
                                actualDrawing.levels = JSON.parse(originalLevelsStr);
                            }
                            
                            // Re-render the drawing
                            // [debug removed]
                            drawingManager.renderDrawing(actualDrawing);
                            drawingManager.saveDrawings();
                            // [debug removed]
                        }
                    } else {
                        console.warn('⚠️ Missing data for cancel:', { originalStyleStr: !!originalStyleStr, drawingManager: !!drawingManager, drawingId });
                    }
                } catch (err) {
                    console.error('Cancel error:', err);
                }
                
                // Cleanup external dropdowns
                if (modal.externalDropdowns) {
                    modal.externalDropdowns.forEach(d => d.remove());
                }
                self.hide();
            });
        }
        
        // Helper to query both modal and external dropdowns
        const queryAll = (selector) => {
            const elements = [...modal.querySelectorAll(selector)];
            if (modal.externalDropdowns) {
                modal.externalDropdowns.forEach(dropdown => {
                    elements.push(...dropdown.querySelectorAll(selector));
                });
            }
            return elements;
        };
        
        // Checkbox toggles - handle both real checkboxes and custom div checkboxes
        setTimeout(() => {
            // [debug removed]
            queryAll('.tv-checkbox').forEach(cb => {
                const isRealCheckbox = cb.tagName === 'INPUT' && cb.type === 'checkbox';
                const eventType = isRealCheckbox ? 'change' : 'click';
                
                cb.addEventListener(eventType, () => {
                    const prop = cb.dataset.prop;
                    if (prop === 'timeframeRangeEnabled') {
                        return;
                    }
                    // [debug removed]
                    let isChecked;
                    
                    if (isRealCheckbox) {
                        isChecked = cb.checked;
                    } else {
                        cb.classList.toggle('checked');
                        isChecked = cb.classList.contains('checked');
                    }
                    
                    this.pendingChanges[prop] = isChecked;
                
                // Live preview for background toggle
                if (prop === 'showBackground') {
                    // For range tools, explicitly toggle showBackground and re-render immediately
                    const rangeTools = ['date-price-range', 'price-range', 'date-range'];
                    if (rangeTools.includes(drawing.type)) {
                        drawing.style.showBackground = isChecked;
                        if (isChecked) {
                            drawing.style.fill = drawing.style._savedFill || this.pendingChanges.backgroundColor || drawing.style.fill || 'rgba(41, 98, 255, 0.15)';
                        } else {
                            if (drawing.style.fill && drawing.style.fill !== 'none' && drawing.style.fill !== 'transparent') {
                                drawing.style._savedFill = drawing.style.fill;
                            }
                        }
                        self.applyChangesImmediately(drawing);
                    }
                    // For emoji, use showBackground directly
                    else if (drawing.type === 'emoji') {
                        drawing.style.showBackground = isChecked;
                    } else {
                        const usesBackgroundColor = ['callout', 'comment', 'notebox', 'anchored-text', 'pin'].includes(drawing.type);
                        if (usesBackgroundColor) {
                            if (isChecked) {
                                drawing.style.backgroundColor = drawing.style._savedBackgroundColor || this.pendingChanges.backgroundColor || drawing.style.backgroundColor || 'rgba(41, 98, 255, 0.2)';
                            } else {
                                if (drawing.style.backgroundColor && drawing.style.backgroundColor !== 'transparent' && drawing.style.backgroundColor !== 'none') {
                                    drawing.style._savedBackgroundColor = drawing.style.backgroundColor;
                                }
                                drawing.style.backgroundColor = 'transparent';
                            }
                        } else {
                            if (isChecked) {
                                // Restore saved color or use default
                                drawing.style.fill = drawing.style._savedFill || this.pendingChanges.backgroundColor || 'rgba(41, 98, 255, 0.2)';
                            } else {
                                // Save current color before clearing
                                if (drawing.style.fill && drawing.style.fill !== 'none') {
                                    drawing.style._savedFill = drawing.style.fill;
                                }
                                drawing.style.fill = 'none';
                            }
                        }
                    }
                    self.renderPreview(drawing);
                }
                
                // Live preview for border toggle
                if (prop === 'showBorder') {
                    const rangeTools = ['date-price-range', 'price-range', 'date-range'];
                    if (rangeTools.includes(drawing.type)) {
                        drawing.style.borderEnabled = isChecked;
                        this.pendingChanges.showBorder = isChecked;
                        self.applyChangesImmediately(drawing);
                    } else {
                        const usesBorderColor = ['callout', 'comment', 'pin', 'anchored-text'].includes(drawing.type);
                        if (usesBorderColor) {
                            if (isChecked) {
                                drawing.style.borderColor = drawing.style._savedBorderColor || this.pendingChanges.borderColor || drawing.style.borderColor || '#787b86';
                            } else {
                                if (drawing.style.borderColor && drawing.style.borderColor !== 'transparent' && drawing.style.borderColor !== 'none') {
                                    drawing.style._savedBorderColor = drawing.style.borderColor;
                                }
                                drawing.style.borderColor = 'transparent';
                            }
                        } else {
                            if (isChecked) {
                                // Restore saved color or use default
                                drawing.style.stroke = drawing.style._savedStroke || this.pendingChanges.borderColor || '#787b86';
                            } else {
                                // Save current color before clearing
                                if (drawing.style.stroke && drawing.style.stroke !== 'none') {
                                    drawing.style._savedStroke = drawing.style.stroke;
                                }
                                drawing.style.stroke = 'none';
                            }
                        }
                        self.renderPreview(drawing);
                    }
                }

                // Live preview for label background toggle (range tools)
                if (prop === 'showLabelBackground') {
                    drawing.style.showLabelBackground = isChecked;
                    this.pendingChanges.showLabelBackground = isChecked;
                    self.applyChangesImmediately(drawing);
                }
                
                // Live preview for middle line toggle
                if (prop === 'middleLineEnabled') {
                    drawing.style.showMiddleLine = isChecked;
                    self.renderPreview(drawing);
                }

                // Live preview for pitchfork middle line toggle
                if (prop === 'lineEnabled' && (drawing.type === 'pitchfork' || drawing.type === 'pitchfan')) {
                    drawing.style.lineEnabled = isChecked;
                    self.renderPreview(drawing);
                }

                // Live preview for pitchfork background toggle
                if (prop === 'backgroundEnabled' && drawing.type === 'pitchfork') {
                    drawing.style.backgroundEnabled = isChecked;
                    self.renderPreview(drawing);
                }

                // Live preview for Fibonacci trend line toggle
                if (prop === 'trendLineEnabled') {
                    drawing.style.trendLineEnabled = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Live preview for text toggle
                if (prop === 'showText') {
                    drawing.style.showText = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Live preview for extend left
                if (prop === 'extendLeftEnabled') {
                    drawing.style.extendLeft = isChecked;
                    this.pendingChanges.extendLeft = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Live preview for extend right
                if (prop === 'extendRightEnabled') {
                    drawing.style.extendRight = isChecked;
                    this.pendingChanges.extendRight = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Live preview for extend left (curve/trendline)
                if (prop === 'extendLeft') {
                    this.pendingChanges.extendLeft = isChecked;
                    // Apply like clicking OK button
                    this.applyChanges(drawing);
                    if (window.drawingManager) {
                        window.drawingManager.renderDrawing(drawing);
                        window.drawingManager.saveDrawings();
                    }
                }
                
                // Live preview for extend right (curve/trendline)
                if (prop === 'extendRight') {
                    this.pendingChanges.extendRight = isChecked;
                    // Apply like clicking OK button
                    this.applyChanges(drawing);
                    if (window.drawingManager) {
                        window.drawingManager.renderDrawing(drawing);
                        window.drawingManager.saveDrawings();
                    }
                }
                
                
                // Handle Select All for timeframes
                if (prop === 'selectAllTimeframes') {
                    queryAll('.tv-checkbox[data-prop="timeframe"]').forEach(tcb => {
                        tcb.classList.toggle('checked', isChecked);
                    });
                    // Save visibility changes immediately
                    if (!drawing.visibility) {
                        drawing.visibility = {};
                    }
                    this.defaultTimeframes.forEach(tf => {
                        drawing.visibility[tf.key] = isChecked;
                    });
                    // Immediately apply visibility - use same pattern as color picker
                    const actualDrawing = window.drawingManager ? 
                        window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing : drawing;
                    
                    actualDrawing.visibility = { ...drawing.visibility };
                    
                    // Direct d3 style update
                    if (actualDrawing.group) {
                        actualDrawing.group.style('display', isChecked ? null : 'none');
                        // [debug removed]
                    }
                    
                    if (window.drawingManager) {
                        window.drawingManager.saveDrawings();
                    }
                }
                
                // Handle individual timeframe checkbox
                if (prop === 'timeframe') {
                    const tf = cb.dataset.tf;
                    if (!drawing.visibility) {
                        drawing.visibility = {};
                    }
                    drawing.visibility[tf] = isChecked;
                    // [debug removed]
                    
                    // Update Select All checkbox state
                    const allChecked = this.defaultTimeframes.every(tfItem => {
                        const tfCb = modal.querySelector(`.tv-checkbox[data-tf="${tfItem.key}"]`) || 
                                     document.querySelector(`.tv-external-dropdown[data-modal-id="${drawing.id}"] .tv-checkbox[data-tf="${tfItem.key}"]`);
                        return tfCb && tfCb.classList.contains('checked');
                    });
                    const selectAllCb = modal.querySelector('.tv-checkbox[data-prop="selectAllTimeframes"]') ||
                                       document.querySelector(`.tv-external-dropdown[data-modal-id="${drawing.id}"] .tv-checkbox[data-prop="selectAllTimeframes"]`);
                    if (selectAllCb) {
                        selectAllCb.classList.toggle('checked', allChecked);
                    }
                    
                    // Immediately apply visibility - use same pattern as color picker
                    const actualDrawing = window.drawingManager ? 
                        window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing : drawing;
                    
                    // Copy visibility to actual drawing
                    if (!actualDrawing.visibility) actualDrawing.visibility = {};
                    actualDrawing.visibility[tf] = isChecked;
                    
                    // Get current timeframe from chart
                    const currentTf = window.drawingManager?.chart?.currentTimeframe || 
                                     window.chart?.currentTimeframe || '1m';
                    
                    // Direct d3 style update (same as color picker pattern)
                    if (actualDrawing.group) {
                        const shouldShow = actualDrawing.visibility[currentTf] !== false;
                        actualDrawing.group.style('display', shouldShow ? null : 'none');
                        // [debug removed]
                    }
                    
                    if (window.drawingManager) {
                        window.drawingManager.saveDrawings();
                    }
                }
                
                // Handle Show Info toggle
                if (prop === 'showInfo') {
                    if (!drawing.style.infoSettings || Object.keys(drawing.style.infoSettings).length === 0) {
                        drawing.style.infoSettings = {
                            showInfo: false,
                            priceRange: true,
                            percentChange: false,
                            changeInPips: false,
                            barsRange: false,
                            dateTimeRange: false,
                            distance: false,
                            angle: false
                        };
                    }

                    const infoOptionProps = ['priceRange', 'percentChange', 'changeInPips', 'barsRange', 'dateTimeRange', 'distance', 'angle'];
                    const anySelected = infoOptionProps.some(p => drawing.style.infoSettings[p] === true);
                    if (!anySelected) {
                        drawing.style.infoSettings.priceRange = true;
                    }

                    drawing.style.infoSettings.showInfo = isChecked;
                    this.pendingChanges.showInfo = isChecked;
                    // Apply like clicking OK button
                    this.applyChanges(drawing);
                    if (window.drawingManager) {
                        window.drawingManager.renderDrawing(drawing);
                        window.drawingManager.saveDrawings();
                    }
                }
                
                // Handle regression trend deviation toggles
                if (prop === 'useUpperDeviation') {
                    drawing.style.useUpperDeviation = isChecked;
                    this.pendingChanges.useUpperDeviation = isChecked;
                    self.renderPreview(drawing);
                }
                if (prop === 'useLowerDeviation') {
                    drawing.style.useLowerDeviation = isChecked;
                    this.pendingChanges.useLowerDeviation = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Handle extend left/right toggles
                if (prop === 'extendLeft') {
                    drawing.style.extendLeft = isChecked;
                    this.pendingChanges.extendLeft = isChecked;
                    self.renderPreview(drawing);
                }
                if (prop === 'extendRight') {
                    drawing.style.extendRight = isChecked;
                    this.pendingChanges.extendRight = isChecked;
                    self.renderPreview(drawing);
                }
                
                // Handle Pearson's R toggle
                if (prop === 'showPearsonsR') {
                    drawing.style.showPearsonsR = isChecked;
                    this.pendingChanges.showPearsonsR = isChecked;
                    self.renderPreview(drawing);
                }
                });
            });
        }, 0);
        
        // Info dropdown button - floating dropdown like template
        queryAll('.tv-info-dropdown-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoDropdown(btn, drawing, modal);
            });
        });
        
        // Color buttons
        queryAll('.tv-color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showTVColorPicker(btn, drawing);
            });
        });

        // Delegated handler so dynamically-added color buttons (e.g. via Add Level / Reset)
        // still work without needing to re-run setupTVModalEvents.
        if (!modal._tvDelegatedColorHandler) {
            modal._tvDelegatedColorHandler = true;
            modal.addEventListener('click', (e) => {
                const btn = e.target.closest('.tv-color-btn');
                if (!btn) return;
                e.stopPropagation();
                this.showTVColorPicker(btn, drawing);
            });
        }
        
        // Number inputs for regression trend
        queryAll('.tv-number-input').forEach(input => {
            input.addEventListener('change', () => {
                const prop = input.dataset.prop;
                const value = parseFloat(input.value);
                
                if (prop === 'upperDeviation') {
                    drawing.style.upperDeviation = value;
                    this.pendingChanges.upperDeviation = value;
                    self.renderPreview(drawing);
                } else if (prop === 'lowerDeviation') {
                    drawing.style.lowerDeviation = value;
                    this.pendingChanges.lowerDeviation = value;
                    self.renderPreview(drawing);
                }
            });
        });
        
        // Custom spinner buttons for regression trend
        queryAll('.custom-spinner-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const spinner = btn.closest('.custom-spinner');
                const targetProp = spinner.dataset.target;
                const input = spinner.parentElement.querySelector(`input[data-prop="${targetProp}"]`);
                if (!input) return;
                
                const step = parseFloat(input.step) || 0.1;
                let value = parseFloat(input.value) || 0;

                const getStepDecimals = (n) => {
                    const s = String(n);
                    if (s.includes('e-')) {
                        const parts = s.split('e-');
                        const exp = parseInt(parts[1], 10);
                        return isNaN(exp) ? 0 : exp;
                    }
                    const dot = s.indexOf('.');
                    return dot === -1 ? 0 : (s.length - dot - 1);
                };

                const decimals = getStepDecimals(step);
                const factor = Math.pow(10, decimals);
                
                if (btn.dataset.action === 'up') {
                    value = Math.round((value + step) * factor) / factor;
                } else {
                    value = Math.round((value - step) * factor) / factor;
                }
                
                input.value = value;
                input.dispatchEvent(new Event('change'));
            });
        });
        
        // Select changes with live preview
        queryAll('.tv-select').forEach(select => {
            select.addEventListener('change', () => {
                const prop = select.dataset.prop;
                const value = select.value;
                this.pendingChanges[prop] = value;
                
                // Apply live preview
                if (prop === 'source') {
                    drawing.style.source = value;
                    self.renderPreview(drawing);
                } else if (prop === 'lineType') {
                    drawing.style.strokeDasharray = value;
                    // Force immediate update of path and line elements
                    if (drawing.group) {
                        const paths = drawing.group.selectAll('path');
                        paths.attr('stroke-dasharray', value);
                        // For regression trend, only update main line
                        if (drawing.type === 'regression-trend') {
                            const mainLines = drawing.group.selectAll('.main-line');
                            mainLines.attr('stroke-dasharray', value);
                        } else {
                            const lines = drawing.group.selectAll('line');
                            lines.attr('stroke-dasharray', value);
                        }
                    }
                    if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                        this.applyChangesImmediately(drawing);
                    } else {
                        this.applyChangesImmediately(drawing);
                    }
                } else if (prop === 'trendLineType') {
                    drawing.style.trendLineDasharray = value;
                    if (drawing.group) {
                        const trendLines = drawing.group.selectAll('.fib-trend-line');
                        trendLines.attr('stroke-dasharray', value);
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'lineWidth') {
                    drawing.style.strokeWidth = parseInt(value);
                    // Force immediate update of path and line elements
                    if (drawing.group) {
                        const paths = drawing.group.selectAll('path');
                        paths.attr('stroke-width', parseInt(value));
                        // For regression trend, only update main line
                        if (drawing.type === 'regression-trend') {
                            const mainLines = drawing.group.selectAll('.main-line');
                            mainLines.attr('stroke-width', parseInt(value));
                        } else {
                            const lines = drawing.group.selectAll('line');
                            lines.attr('stroke-width', parseInt(value));
                        }
                    }
                    if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                        this.applyChangesImmediately(drawing);
                    } else {
                        this.applyChangesImmediately(drawing);
                    }
                } else if (prop === 'trendLineWidth') {
                    drawing.style.trendLineWidth = parseInt(value);
                    if (drawing.group) {
                        const trendLines = drawing.group.selectAll('.fib-trend-line');
                        trendLines.attr('stroke-width', parseInt(value));
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'middleLineType') {
                    drawing.style.middleLineDash = value;
                    // Force immediate update of middle line elements
                    if (drawing.group) {
                        const middleLines = drawing.group.selectAll('.middle-line');
                        middleLines.attr('stroke-dasharray', value);
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'middleLineWidth') {
                    drawing.style.middleLineWidth = parseInt(value);
                    // Force immediate update of middle line elements
                    if (drawing.group) {
                        const middleLines = drawing.group.selectAll('.middle-line');
                        middleLines.attr('stroke-width', parseInt(value));
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'upperLineType') {
                    drawing.style.upperStrokeDasharray = value;
                    // Force immediate update of upper line elements
                    if (drawing.group) {
                        const upperLines = drawing.group.selectAll('.upper-line');
                        upperLines.attr('stroke-dasharray', value);
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'upperLineWidth') {
                    drawing.style.upperStrokeWidth = parseInt(value);
                    // Force immediate update of upper line elements
                    if (drawing.group) {
                        const upperLines = drawing.group.selectAll('.upper-line');
                        upperLines.attr('stroke-width', parseInt(value));
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'lowerLineType') {
                    drawing.style.lowerStrokeDasharray = value;
                    // Force immediate update of lower line elements
                    if (drawing.group) {
                        const lowerLines = drawing.group.selectAll('.lower-line');
                        lowerLines.attr('stroke-dasharray', value);
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'lowerLineWidth') {
                    drawing.style.lowerStrokeWidth = parseInt(value);
                    // Force immediate update of lower line elements
                    if (drawing.group) {
                        const lowerLines = drawing.group.selectAll('.lower-line');
                        lowerLines.attr('stroke-width', parseInt(value));
                    }
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'fontSize') {
                    drawing.style.fontSize = parseInt(value);
                    // Force immediate update of text elements
                    if (drawing.group) {
                        const textElements = drawing.group.selectAll('text');
                        textElements.attr('font-size', parseInt(value));
                    }
                    const rangeTools = ['date-price-range', 'price-range', 'date-range'];
                    if (rangeTools.includes(drawing.type)) {
                        this.applyChangesImmediately(drawing);
                    } else {
                        self.renderPreview(drawing);
                    }
                } else if (prop === 'borderType') {
                    drawing.style.borderDasharray = value;
                    this.pendingChanges.borderType = value;
                    this.applyChangesImmediately(drawing);
                } else if (prop === 'borderWidth') {
                    drawing.style.borderWidth = parseInt(value);
                    this.pendingChanges.borderWidth = value;
                    this.applyChangesImmediately(drawing);
                }
            });
        });
        
        // Alignment buttons with live preview
        queryAll('.tv-align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.parentElement;
                group.querySelectorAll('.tv-align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const prop = btn.dataset.prop;
                const value = btn.dataset.value;
                this.pendingChanges[prop] = value;
                
                // Live preview for alignment
                if (prop === 'textVAlign') {
                    drawing.style.textVAlign = value;
                    drawing.style.textPosition = value;
                    self.renderPreview(drawing);
                } else if (prop === 'textHAlign') {
                    drawing.style.textHAlign = value;
                    drawing.style.textAlign = value;
                    self.renderPreview(drawing);
                } else if (prop === 'textOrientation') {
                    drawing.style.textOrientation = value;
                    self.renderPreview(drawing);
                }
            });
        });
        
        // Style buttons (italic/bold) with live preview
        queryAll('.tv-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                const isActive = btn.classList.contains('active');
                const prop = btn.dataset.prop;
                this.pendingChanges[prop] = isActive;
                
                // Live preview
                if (prop === 'fontItalic') {
                    drawing.style.fontStyle = isActive ? 'italic' : 'normal';
                    self.renderPreview(drawing);
                } else if (prop === 'fontBold') {
                    drawing.style.fontWeight = isActive ? 'bold' : 'normal';
                    self.renderPreview(drawing);
                }
            });
        });
        
        // Line ending dropdown buttons
        queryAll('.tv-ending-dropdown').forEach(dropdown => {
            const btn = dropdown.querySelector('.tv-ending-dropdown-btn');
            const menu = dropdown.querySelector('.tv-ending-dropdown-menu');
            const prop = dropdown.dataset.prop;
            
            // Toggle dropdown menu
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdowns
                queryAll('.tv-ending-dropdown-menu').forEach(m => {
                    if (m !== menu) m.style.display = 'none';
                });
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            });
            
            // Handle option selection
            menu.querySelectorAll('.tv-ending-option').forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.dataset.value;
                    this.pendingChanges[prop] = value;
                    
                    // Update button appearance
                    const svg = value === 'arrow' ? 
                        (prop === 'startStyle' ? 
                            '<line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="3"/><path d="M 20 50 L 40 30 L 40 70 Z" fill="#d1d4dc"/>' : 
                            '<line x1="20" y1="50" x2="80" y2="50" stroke="#d1d4dc" stroke-width="3"/><path d="M 80 50 L 60 30 L 60 70 Z" fill="#d1d4dc"/>') :
                        (prop === 'startStyle' ? 
                            '<circle cx="24" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="3"/><line x1="33" y1="50" x2="88" y2="50" stroke="#d1d4dc" stroke-width="3"/>' : 
                            '<line x1="12" y1="50" x2="67" y2="50" stroke="#d1d4dc" stroke-width="3"/><circle cx="76" cy="50" r="7" fill="none" stroke="#d1d4dc" stroke-width="3"/>');
                    
                    btn.querySelector('svg').innerHTML = svg;
                    btn.style.border = '1px solid #363a45';
                    btn.style.background = '#1e222d';
                    
                    // Apply like clicking OK button
                    this.pendingChanges[prop] = value;
                    this.applyChanges(drawing);
                    if (window.drawingManager) {
                        window.drawingManager.renderDrawing(drawing);
                        window.drawingManager.saveDrawings();
                    }
                    
                    // Close menu
                    menu.style.display = 'none';
                });
                
                // Hover effects
                option.addEventListener('mouseenter', () => {
                    option.style.background = '#363a45';
                });
                option.addEventListener('mouseleave', () => {
                    option.style.background = 'transparent';
                });
            });
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            queryAll('.tv-ending-dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        });
        

        // Text input with live preview - use queryAll to find in both modal and external dropdowns
        queryAll('.tv-text-input').forEach(textInput => {
            textInput.addEventListener('input', () => {
                this.pendingChanges.text = textInput.value;
                drawing.text = textInput.value;
                self.renderPreview(drawing);
            });
        });
        
        // Description input removed
        
        // Template button (uses same system as floating toolbar)
        const templateBtn = modal.querySelector('.tv-template-btn');
        if (templateBtn) {
            templateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showTemplateDropdown(templateBtn, drawing, modal);
            });
        }
        
        // Position tool specific inputs (number inputs)
        queryAll('.tv-input').forEach(input => {
            // Real-time update as user types
            input.addEventListener('input', () => {
                const prop = input.dataset.prop;
                const value = input.value;
                this.pendingChanges[prop] = value;
                
                // Live preview for position tools
                if (prop === 'riskPercent' || prop === 'riskAmountUSD' || prop === 'lotSize') {
                    if (drawing.meta && drawing.meta.risk) {
                        if (prop === 'riskPercent') drawing.meta.risk.riskPercent = parseFloat(value);
                        if (prop === 'riskAmountUSD') drawing.meta.risk.riskAmountUSD = parseFloat(value);
                        if (prop === 'lotSize') drawing.meta.risk.lotSize = parseFloat(value);
                        if (typeof drawing.recalculateLotSizeFromRisk === 'function') {
                            drawing.recalculateLotSizeFromRisk();
                        }
                        self.renderPreview(drawing);
                    }
                }
            });
            
            // Keep change event for compatibility
            input.addEventListener('change', () => {
                const prop = input.dataset.prop;
                const value = input.value;
                this.pendingChanges[prop] = value;
                
                // Live preview for position tools
                if (prop === 'riskPercent' || prop === 'riskAmountUSD' || prop === 'lotSize') {
                    if (drawing.meta && drawing.meta.risk) {
                        if (prop === 'riskPercent') drawing.meta.risk.riskPercent = parseFloat(value);
                        if (prop === 'riskAmountUSD') drawing.meta.risk.riskAmountUSD = parseFloat(value);
                        if (prop === 'lotSize') drawing.meta.risk.lotSize = parseFloat(value);
                        if (typeof drawing.recalculateLotSizeFromRisk === 'function') {
                            drawing.recalculateLotSizeFromRisk();
                        }
                        self.renderPreview(drawing);
                    }
                }
            });
        });
        
        // Position tool risk mode select
        queryAll('.tv-select[data-prop="riskMode"]').forEach(select => {
            select.addEventListener('change', () => {
                this.pendingChanges.riskMode = select.value;
                if (drawing.meta && drawing.meta.risk) {
                    drawing.meta.risk.riskMode = select.value;
                    if (typeof drawing.recalculateLotSizeFromRisk === 'function') {
                        drawing.recalculateLotSizeFromRisk();
                    }
                    self.renderPreview(drawing);
                }
            });
        });
        
        // Opacity slider (for emoji and other tools)
        queryAll('.tv-slider[data-prop="opacity"]').forEach(slider => {
            slider.addEventListener('input', () => {
                const value = parseInt(slider.value) / 100;
                this.pendingChanges.opacity = value;
                drawing.style.opacity = value;
                
                // Update display value
                const valueDisplay = slider.parentElement.querySelector('.tv-opacity-value');
                if (valueDisplay) {
                    valueDisplay.textContent = `${slider.value}%`;
                }
                
                self.renderPreview(drawing);
            });
        });
        
        // Text content input (for text tools) - use queryAll to find in external dropdowns
        queryAll('.tv-text-content-input').forEach(textContentInput => {
            textContentInput.addEventListener('input', () => {
                this.pendingChanges.textContent = textContentInput.value;
                drawing.text = textContentInput.value;
                self.renderPreview(drawing);
            });
        });
        
    }

    /**
     * Render preview of drawing changes
     */
    renderPreview(drawing) {
        // Apply all pending changes to the drawing
        this.applyChanges(drawing);
        
        // Render the updated drawing
        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        if (drawingManager) {
            const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
            drawingManager.renderDrawing(actualDrawing);
            if (drawingManager.saveDrawings) {
                drawingManager.saveDrawings();
            }
        }
    }

    /**
     * Show TV-style color picker
     */
    showTVColorPicker(btn, drawing) {
        const self = this;
        const prop = btn.dataset.prop;
        
        // Remove existing picker
        const existingPicker = document.querySelector('.tv-color-picker');
        if (existingPicker) {
            if (typeof existingPicker._cleanup === 'function') {
                existingPicker._cleanup();
            }
            existingPicker.remove();
            return; // Don't open new picker if one was already open (prevents double-open)
        }
        
        const picker = document.createElement('div');
        picker.className = 'tv-color-picker active';

        const closePicker = () => {
            if (!picker.isConnected) return;
            if (typeof picker._cleanup === 'function') {
                picker._cleanup();
            }
            picker.remove();
        };

        const handleDocMouseDown = (e) => {
            const target = e.target;
            if (picker.contains(target) || btn.contains(target)) return;
            closePicker();
        };

        const handleDocKeyDown = (e) => {
            if (e.key === 'Escape') {
                closePicker();
            }
        };

        picker._cleanup = () => {
            document.removeEventListener('mousedown', handleDocMouseDown, true);
            document.removeEventListener('keydown', handleDocKeyDown, true);
        };
        
        // Position near the button with boundary checking
        const rect = btn.getBoundingClientRect();
        const gap = 12;
        const pickerWidth = 280; // Approximate picker width
        const pickerHeight = 300; // Approximate picker height
        
        // Check if picker would go off right edge
        let left = rect.right + gap;
        if (left + pickerWidth > window.innerWidth) {
            // Position to the left of button instead
            left = rect.left - pickerWidth - gap;
            // If still off screen, align to right edge
            if (left < 0) {
                left = window.innerWidth - pickerWidth - 10;
            }
        }
        
        // Check if picker would go off bottom edge
        let top = rect.top;
        if (top + pickerHeight > window.innerHeight) {
            // Align to bottom edge
            top = window.innerHeight - pickerHeight - 10;
        }
        
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        
        // Get current color and opacity
        let currentColor = btn.style.background || '#787b86';
        let currentOpacity = 100;
        
        // Parse current color to extract opacity if rgba
        const rgbaMatch = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
            currentOpacity = rgbaMatch[4] !== undefined ? Math.round(parseFloat(rgbaMatch[4]) * 100) : 100;
            currentColor = DRAWING_COLOR_UTILS.normalizeHex(currentColor);
        }
        
        let selectedColor = currentColor;
        
        // Color grid
        const grid = document.createElement('div');
        grid.className = 'tv-color-grid';
        
        DRAWING_COLOR_UTILS.ROWS.forEach(row => {
            row.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'tv-color-swatch';
                swatch.style.background = color;
                if (color.toUpperCase() === selectedColor.toUpperCase()) {
                    swatch.classList.add('selected');
                }
                swatch.addEventListener('click', () => {
                    selectedColor = color;
                    grid.querySelectorAll('.tv-color-swatch').forEach(s => s.classList.remove('selected'));
                    swatch.classList.add('selected');
                    applyColor();
                    // Auto-close picker after color selection
                    closePicker();
                });
                grid.appendChild(swatch);
            });
        });
        
        picker.appendChild(grid);
        
        // Opacity slider section
        const opacitySection = document.createElement('div');
        opacitySection.className = 'tv-opacity-section';
        opacitySection.innerHTML = `
            <div class="tv-opacity-row">
                <span class="tv-opacity-label">Opacity</span>
                <input type="range" class="tv-opacity-slider" min="0" max="100" value="${currentOpacity}">
                <input type="number" class="tv-opacity-input" min="0" max="100" value="${currentOpacity}">
                <span class="tv-opacity-percent">%</span>
            </div>
        `;
        picker.appendChild(opacitySection);
        
        const slider = opacitySection.querySelector('.tv-opacity-slider');
        const input = opacitySection.querySelector('.tv-opacity-input');
        
        // Sync slider and input
        slider.addEventListener('input', () => {
            input.value = slider.value;
            currentOpacity = parseInt(slider.value);
            applyColor();
        });
        
        input.addEventListener('input', () => {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, Math.min(100, val));
            slider.value = val;
            currentOpacity = val;
            applyColor();
        });
        
        // Apply color function
        const applyColor = () => {
            const opacity = currentOpacity / 100;
            let finalColor;
            
            if (opacity < 1) {
                const rgb = DRAWING_COLOR_UTILS.hexToRgb(selectedColor);
                finalColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity.toFixed(2)})`;
            } else {
                finalColor = selectedColor;
            }
            
            btn.style.background = finalColor;
            this.pendingChanges[prop] = finalColor;
            
            // Find the actual drawing in the manager
            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            const actualDrawing = drawingManager ? 
                drawingManager.drawings.find(d => d.id === drawing.id) || drawing : drawing;
            
            // Handle level color changes
            if (btn.dataset.levelGroup) {
                const levelIndex = parseInt(btn.dataset.levelIndex);
                const levelGroup = btn.dataset.levelGroup;
                const levelsArray = drawing.style ? drawing.style[levelGroup] : null;
                if (drawingManager && actualDrawing && !actualDrawing.style) actualDrawing.style = {};
                const actualLevelsArray = actualDrawing && actualDrawing.style ? actualDrawing.style[levelGroup] : null;
                if (!isNaN(levelIndex) && Array.isArray(levelsArray) && levelsArray[levelIndex]) {
                    levelsArray[levelIndex].color = finalColor;
                    // Ensure the real drawing has the same levels array so renderDrawing() reflects the change immediately.
                    if (actualDrawing && actualDrawing.style) {
                        if (!Array.isArray(actualLevelsArray)) {
                            actualDrawing.style[levelGroup] = levelsArray;
                        } else if (actualLevelsArray[levelIndex]) {
                            actualLevelsArray[levelIndex].color = finalColor;
                        }
                    }

                    this.pendingChanges.style = { ...this.pendingChanges.style, [levelGroup]: levelsArray };

                    if (drawingManager) {
                        drawingManager.renderDrawing(actualDrawing);
                        drawingManager.saveDrawings();
                    }
                }
                return;
            }
            if (prop.startsWith('level') && prop.endsWith('Color')) {
                const levelIndex = parseInt(btn.dataset.levelIndex);
                const levelsArray = drawing.levels || drawing.fibNumbers;
                const actualLevelsArray = actualDrawing.levels || actualDrawing.fibNumbers;
                if (!isNaN(levelIndex) && levelsArray && levelsArray[levelIndex]) {
                    const level = levelsArray[levelIndex];
                    
                    // Capture old color BEFORE updating
                    const oldColor = actualDrawing._levelColors?.[levelIndex] || level.color;
                    
                    level.color = finalColor;
                    if (actualLevelsArray && actualLevelsArray[levelIndex]) {
                        actualLevelsArray[levelIndex].color = finalColor;
                    }
                    
                    // For pitchfork tools, update level line colors directly in SVG
                    const pitchforkTypes = ['pitchfork', 'pitchfan'];
                    if (pitchforkTypes.includes(drawing.type)) {
                        if (actualDrawing.group) {
                            // Update lines matching the old level color
                            actualDrawing.group.selectAll('line').each(function() {
                                const el = d3.select(this);
                                const currentStroke = el.attr('stroke');
                                if (currentStroke !== 'transparent' && currentStroke === oldColor) {
                                    el.attr('stroke', finalColor);
                                }
                            });
                            
                            // Update polygon fills - fills use rgba() format
                            const bgOpacity = actualDrawing.style?.backgroundOpacity ?? 0.2;
                            // Convert old hex color to RGB values for matching
                            const oldHex = oldColor.replace('#', '');
                            const oldR = parseInt(oldHex.slice(0, 2), 16);
                            const oldG = parseInt(oldHex.slice(2, 4), 16);
                            const oldB = parseInt(oldHex.slice(4, 6), 16);
                            
                            // Convert new hex color to RGB for new fill
                            const newHex = finalColor.replace('#', '');
                            const newR = parseInt(newHex.slice(0, 2), 16);
                            const newG = parseInt(newHex.slice(2, 4), 16);
                            const newB = parseInt(newHex.slice(4, 6), 16);
                            
                            actualDrawing.group.selectAll('polygon').each(function() {
                                const el = d3.select(this);
                                const currentFill = el.attr('fill');
                                // Check if fill contains the old RGB values
                                if (currentFill && currentFill.includes(`${oldR}, ${oldG}, ${oldB}`)) {
                                    // Apply new color with same opacity format
                                    const newFill = `rgba(${newR}, ${newG}, ${newB}, ${bgOpacity})`;
                                    el.attr('fill', newFill);
                                }
                            });
                        }
                        // Track level colors for future updates
                        if (!actualDrawing._levelColors) actualDrawing._levelColors = {};
                        actualDrawing._levelColors[levelIndex] = finalColor;
                        
                        if (drawingManager) {
                            drawingManager.saveDrawings();
                        }
                    } else {
                        // Direct SVG update for immediate visual feedback (for parallel channel etc.)
                        if (actualDrawing.group) {
                            // Find and update the specific level line by its data attribute
                            actualDrawing.group.selectAll('line').each(function() {
                                const el = d3.select(this);
                                const lineLevel = el.attr('data-level');
                                // Update the line if it matches this level value
                                if (lineLevel && parseFloat(lineLevel) === level.value) {
                                    if (el.attr('stroke') !== 'transparent') {
                                        el.attr('stroke', finalColor);
                                    }
                                }
                            });
                        }

                        // For Fibonacci tools, ensure full re-render so colors/zones/labels update reliably
                        const isFibTool = drawing.type.startsWith('fibonacci-') || drawing.type.startsWith('fib-') || drawing.type.startsWith('trend-fib-');
                        if (drawingManager && isFibTool) {
                            drawingManager.renderDrawing(actualDrawing);
                            drawingManager.saveDrawings();
                        } else if (drawingManager) {
                            drawingManager.saveDrawings();
                        }
                    }
                }
            }
            // Apply to both references
            else if (prop === 'trendLineColor') {
                actualDrawing.style.trendLineColor = finalColor;
                drawing.style.trendLineColor = finalColor;

                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.fib-trend-line').each(function() {
                        const el = d3.select(this);
                        if (el.attr('stroke') !== 'transparent') {
                            el.attr('stroke', finalColor);
                        }
                    });
                }

                if (drawingManager) {
                    drawingManager.saveDrawings();
                }
            }
            else if (prop === 'lineColor') {
                // For pitchfork tools, lineColor controls the median line
                if (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') {
                    // Capture old color BEFORE updating
                    const oldMedianColor = actualDrawing._lastMedianColor || actualDrawing.style.medianColor || '#e91e63';
                    actualDrawing.style.medianColor = finalColor;
                    drawing.style.medianColor = finalColor;
                    
                    // Direct SVG update for immediate visual feedback
                    if (actualDrawing.group) {
                        actualDrawing.group.selectAll('line').each(function() {
                            const el = d3.select(this);
                            const currentStroke = el.attr('stroke');
                            // Update lines that match the old median color (skip transparent and level lines)
                            if (currentStroke !== 'transparent' && currentStroke === oldMedianColor) {
                                el.attr('stroke', finalColor);
                            }
                        });
                        actualDrawing._lastMedianColor = finalColor;
                    }
                    if (drawingManager) {
                        drawingManager.saveDrawings();
                    }
                } else {
                    actualDrawing.style.stroke = finalColor;
                    actualDrawing.style.color = finalColor; // Also update color for axis highlights
                    drawing.style.stroke = finalColor;
                }

                // Range tools: keep border color in sync with line color
                if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                    actualDrawing.style.borderColor = finalColor;
                    drawing.style.borderColor = finalColor;
                    this.pendingChanges.borderColor = finalColor;
                    this.applyChangesImmediately(actualDrawing);
                    if (drawingManager) {
                        drawingManager.saveDrawings();
                    }
                    return;
                }
                // Direct SVG update for immediate visual feedback
                // IMPORTANT: Only update visible elements, not hit-area elements (transparent stroke)
                if (actualDrawing.group && drawing.type !== 'pitchfork' && drawing.type !== 'pitchfan') {
                    // For non-pitchfork tools
                    {
                        drawing.style.color = finalColor;
                        actualDrawing.group.selectAll('line').each(function() {
                            const el = d3.select(this);
                            // Skip transparent hit-area lines
                            if (el.attr('stroke') !== 'transparent') {
                                el.attr('stroke', finalColor);
                            }
                        });
                        actualDrawing.group.selectAll('path').each(function() {
                            const el = d3.select(this);
                            if (el.attr('stroke') !== 'transparent') {
                                el.attr('stroke', finalColor);
                            }
                        });
                        // Exclude all resize handle circles (visual, hit area, glow effects)
                        actualDrawing.group.selectAll('circle:not(.resize-handle):not(.resize-handle-hit):not(.resize-handle-glow):not(.resize-handle-glow-outer):not(.resize-handle-shadow)').attr('stroke', finalColor);
                        actualDrawing.group.selectAll('ellipse').attr('stroke', finalColor);
                        actualDrawing.group.selectAll('rect.shape-border').attr('stroke', finalColor);
                    }
                }
                // Update axis highlights with new color
                if (actualDrawing.showAxisHighlights) {
                    actualDrawing.showAxisHighlights();
                }
            } else if (prop === 'middleLineColor') {
                actualDrawing.style.middleLineColor = finalColor;
                drawing.style.middleLineColor = finalColor;
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.middle-line').attr('stroke', finalColor);
                }
            } else if (prop === 'backgroundColor') {
                const usesBackgroundColor = ['callout', 'comment', 'notebox', 'anchored-text', 'pin'].includes(drawing.type);
                if (usesBackgroundColor) {
                    actualDrawing.style.backgroundColor = finalColor;
                    drawing.style.backgroundColor = finalColor;
                } else {
                    actualDrawing.style.fill = finalColor;
                    drawing.style.fill = finalColor;
                }
                if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                    actualDrawing.style.showBackground = true;
                    drawing.style.showBackground = true;
                    this.pendingChanges.showBackground = true;
                    this.applyChangesImmediately(actualDrawing);
                    if (drawingManager) {
                        drawingManager.saveDrawings();
                    }
                    return;
                }
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.shape-fill').attr('fill', finalColor);
                    actualDrawing.group.selectAll('rect:not(.shape-border)').attr('fill', finalColor);
                    // Update path elements (for arc, curve, polyline, etc.)
                    actualDrawing.group.selectAll('path').attr('fill', finalColor);
                    // Update ellipse and circle elements
                    actualDrawing.group.selectAll('ellipse').attr('fill', finalColor);
                    actualDrawing.group.selectAll('circle:not(.resize-handle):not(.resize-handle-hit):not(.resize-handle-glow):not(.resize-handle-glow-outer):not(.resize-handle-shadow)').attr('fill', finalColor);
                    // Update polygon elements (for triangle, etc.)
                    actualDrawing.group.selectAll('polygon').attr('fill', finalColor);
                }
            } else if (
                prop === 'borderColor' &&
                (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range')
            ) {
                actualDrawing.style.borderColor = finalColor;
                drawing.style.borderColor = finalColor;
                this.pendingChanges.borderColor = finalColor;
                this.applyChangesImmediately(actualDrawing);
            } else if (prop === 'labelBackgroundColor') {
                actualDrawing.style.labelBackgroundColor = finalColor;
                drawing.style.labelBackgroundColor = finalColor;
                this.pendingChanges.labelBackgroundColor = finalColor;
                this.applyChangesImmediately(actualDrawing);
            } else if (prop === 'borderColor') {
                const usesBorderColor = ['callout', 'comment', 'pin', 'anchored-text'].includes(drawing.type);
                if (usesBorderColor) {
                    actualDrawing.style.borderColor = finalColor;
                    drawing.style.borderColor = finalColor;
                } else {
                    actualDrawing.style.stroke = finalColor;
                    drawing.style.stroke = finalColor;
                }
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('rect').each(function() {
                        const el = d3.select(this);
                        const stroke = el.attr('stroke');
                        if (stroke && stroke !== 'transparent') {
                            el.attr('stroke', finalColor);
                        }
                    });
                    actualDrawing.group.selectAll('.text-border').attr('stroke', finalColor);
                    actualDrawing.group.selectAll('.shape-border').attr('stroke', finalColor);
                    if (drawing.type === 'comment') {
                        actualDrawing.group.selectAll('path.shape-fill').attr('stroke', finalColor);
                    }
                    if (drawing.type === 'pin') {
                        actualDrawing.group.selectAll('.pin-text-box path.shape-border').attr('stroke', finalColor);
                    }
                }
            } else if (prop === 'upperFill') {
                actualDrawing.style.upperFill = finalColor;
                drawing.style.upperFill = finalColor;
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.upper-fill').attr('fill', finalColor);
                }
            } else if (prop === 'lowerFill') {
                actualDrawing.style.lowerFill = finalColor;
                drawing.style.lowerFill = finalColor;
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.lower-fill').attr('fill', finalColor);
                }
            } else if (prop === 'upperLineColor') {
                actualDrawing.style.upperStroke = finalColor;
                drawing.style.upperStroke = finalColor;
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.upper-line').attr('stroke', finalColor);
                }
            } else if (prop === 'lowerLineColor') {
                actualDrawing.style.lowerStroke = finalColor;
                drawing.style.lowerStroke = finalColor;
                // Direct SVG update for immediate visual feedback
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('.lower-line').attr('stroke', finalColor);
                    // Also update Pearson's R text color
                    actualDrawing.group.selectAll('.pearson-r-text').style('fill', finalColor);
                }
            } else if (prop === 'textColor') {
                actualDrawing.style.textColor = finalColor;
                drawing.style.textColor = finalColor;
                if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                    this.applyChangesImmediately(actualDrawing);
                    if (drawingManager) {
                        drawingManager.saveDrawings();
                    }
                    return;
                }
                if (actualDrawing.group) {
                    actualDrawing.group.selectAll('text').attr('fill', finalColor);
                }
            } else if (prop === 'fill') {
                // For pin tool - update the marker fill color
                actualDrawing.style.fill = finalColor;
                actualDrawing.style.stroke = finalColor; // Also update stroke for consistency
                drawing.style.fill = finalColor;
                drawing.style.stroke = finalColor;
                if (actualDrawing.group) {
                    // Update path (the teardrop shape)
                    actualDrawing.group.selectAll('path').attr('fill', finalColor);
                    // Update the inner ring stroke color
                    actualDrawing.group.selectAll('circle').attr('stroke', finalColor);
                }
            }
            
            // Save changes
            if (drawingManager) {
                drawingManager.saveDrawings();
            }
        };
        
        document.body.appendChild(picker);

        // Close on click outside / Escape (like other settings)
        setTimeout(() => {
            document.addEventListener('mousedown', handleDocMouseDown, true);
            document.addEventListener('keydown', handleDocKeyDown, true);
        }, 0);
    }

    /**
     * Apply pending changes to drawing
     */
    applyChanges(drawing) {
        // [debug removed]

        // Coordinates changes
        if (this.pendingChanges.points && Array.isArray(this.pendingChanges.points)) {
            const nextPoints = this.pendingChanges.points.map(p => ({ ...p }));
            if (typeof drawing.update === 'function') {
                drawing.update(nextPoints);
            } else {
                drawing.points = nextPoints;
                if (typeof drawing.recalculateTimestamps === 'function') {
                    drawing.recalculateTimestamps();
                }
            }
        }
        
        // Apply style changes - Line properties
        if (this.pendingChanges.lineColor) {
            // For pitchfork tools, lineColor controls medianColor
            if (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') {
                drawing.style.medianColor = this.pendingChanges.lineColor;
            } else {
                drawing.style.stroke = this.pendingChanges.lineColor;
            }
        }
        if (this.pendingChanges.lineType !== undefined) drawing.style.strokeDasharray = this.pendingChanges.lineType;
        if (this.pendingChanges.lineWidth) drawing.style.strokeWidth = parseInt(this.pendingChanges.lineWidth);
        if (this.pendingChanges.lineEnabled !== undefined) drawing.style.lineEnabled = this.pendingChanges.lineEnabled;

        // Fibonacci trend line properties
        if (this.pendingChanges.trendLineColor) drawing.style.trendLineColor = this.pendingChanges.trendLineColor;
        if (this.pendingChanges.trendLineType !== undefined) drawing.style.trendLineDasharray = this.pendingChanges.trendLineType;
        if (this.pendingChanges.trendLineWidth) drawing.style.trendLineWidth = parseInt(this.pendingChanges.trendLineWidth);
        if (this.pendingChanges.trendLineEnabled !== undefined) drawing.style.trendLineEnabled = this.pendingChanges.trendLineEnabled;
        
        // Middle line properties
        if (this.pendingChanges.middleLineColor) drawing.style.middleLineColor = this.pendingChanges.middleLineColor;
        if (this.pendingChanges.middleLineType !== undefined) drawing.style.middleLineDash = this.pendingChanges.middleLineType;
        if (this.pendingChanges.middleLineWidth) drawing.style.middleLineWidth = parseInt(this.pendingChanges.middleLineWidth);
        if (this.pendingChanges.middleLineEnabled !== undefined) drawing.style.showMiddleLine = this.pendingChanges.middleLineEnabled;
        
        // Extend left/right properties
        if (this.pendingChanges.extendLeft !== undefined) drawing.style.extendLeft = this.pendingChanges.extendLeft;
        if (this.pendingChanges.extendRight !== undefined) drawing.style.extendRight = this.pendingChanges.extendRight;
        
        // Background properties
        if (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') {
            if (this.pendingChanges.backgroundEnabled !== undefined) {
                drawing.style.backgroundEnabled = this.pendingChanges.backgroundEnabled;
            }
            if (this.pendingChanges.backgroundOpacity !== undefined) {
                drawing.style.backgroundOpacity = this.pendingChanges.backgroundOpacity;
            }
        } else if (drawing.type === 'emoji') {
            // Emoji-specific background handling
            if (this.pendingChanges.backgroundColor) drawing.style.backgroundColor = this.pendingChanges.backgroundColor;
            if (this.pendingChanges.showBackground !== undefined) drawing.style.showBackground = this.pendingChanges.showBackground;
            if (this.pendingChanges.opacity !== undefined) drawing.style.opacity = this.pendingChanges.opacity;
        } else if (drawing.type === 'comment' || drawing.type === 'notebox' || drawing.type === 'anchored-text' || drawing.type === 'pin') {
            if (this.pendingChanges.backgroundColor) drawing.style.backgroundColor = this.pendingChanges.backgroundColor;
            if (this.pendingChanges.showBackground !== undefined) {
                if (!this.pendingChanges.showBackground) {
                    if (drawing.style.backgroundColor && drawing.style.backgroundColor !== 'transparent' && drawing.style.backgroundColor !== 'none') {
                        drawing.style._savedBackgroundColor = drawing.style.backgroundColor;
                    }
                    drawing.style.backgroundColor = 'transparent';
                } else {
                    drawing.style.backgroundColor = this.pendingChanges.backgroundColor || drawing.style._savedBackgroundColor || drawing.style.backgroundColor || 'rgba(41, 98, 255, 0.2)';
                }
            }
            if (this.pendingChanges.borderColor) {
                if (drawing.type === 'notebox') {
                    drawing.style.stroke = this.pendingChanges.borderColor;
                } else {
                    drawing.style.borderColor = this.pendingChanges.borderColor;
                }
            }
            if (this.pendingChanges.showBorder !== undefined) {
                if (drawing.type === 'notebox') {
                    if (!this.pendingChanges.showBorder) {
                        if (drawing.style.stroke && drawing.style.stroke !== 'none' && drawing.style.stroke !== 'transparent') {
                            drawing.style._savedStroke = drawing.style.stroke;
                        }
                        drawing.style.stroke = 'none';
                    } else {
                        drawing.style.stroke = this.pendingChanges.borderColor || drawing.style._savedStroke || drawing.style.stroke || '#787b86';
                    }
                } else {
                    if (!this.pendingChanges.showBorder) {
                        if (drawing.style.borderColor && drawing.style.borderColor !== 'transparent' && drawing.style.borderColor !== 'none') {
                            drawing.style._savedBorderColor = drawing.style.borderColor;
                        }
                        drawing.style.borderColor = 'transparent';
                    } else {
                        drawing.style.borderColor = this.pendingChanges.borderColor || drawing.style._savedBorderColor || drawing.style.borderColor || '#787b86';
                    }
                }
            }
        } else if (drawing.type === 'callout') {
            // Callout uses backgroundColor and borderColor
            if (this.pendingChanges.backgroundColor) drawing.style.backgroundColor = this.pendingChanges.backgroundColor;
            if (this.pendingChanges.borderColor) drawing.style.borderColor = this.pendingChanges.borderColor;
            if (this.pendingChanges.showBackground !== undefined) {
                if (!this.pendingChanges.showBackground) {
                    drawing.style.backgroundColor = 'transparent';
                }
            }
            if (this.pendingChanges.showBorder !== undefined) {
                if (!this.pendingChanges.showBorder) {
                    drawing.style.borderColor = 'transparent';
                }
            }
        } else if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
            if (this.pendingChanges.backgroundColor) drawing.style.fill = this.pendingChanges.backgroundColor;
            if (this.pendingChanges.showBackground !== undefined) {
                drawing.style.showBackground = this.pendingChanges.showBackground;
                if (this.pendingChanges.showBackground) {
                    drawing.style.fill = this.pendingChanges.backgroundColor || drawing.style._savedFill || drawing.style.fill || 'rgba(41, 98, 255, 0.15)';
                } else {
                    if (drawing.style.fill && drawing.style.fill !== 'none' && drawing.style.fill !== 'transparent') {
                        drawing.style._savedFill = drawing.style.fill;
                    }
                }
            }
        } else {
            if (this.pendingChanges.backgroundColor) drawing.style.fill = this.pendingChanges.backgroundColor;
            if (this.pendingChanges.showBackground !== undefined) {
                if (this.pendingChanges.showBackground) {
                    drawing.style.fill = this.pendingChanges.backgroundColor || drawing.style.fill || 'rgba(41, 98, 255, 0.2)';
                } else {
                    drawing.style.fill = 'none';
                }
            }
        }

        // Range tools (projection range) specific style
        if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
            if (this.pendingChanges.showBorder !== undefined) drawing.style.borderEnabled = this.pendingChanges.showBorder;
            if (this.pendingChanges.borderColor) drawing.style.borderColor = this.pendingChanges.borderColor;
            if (this.pendingChanges.borderType !== undefined) drawing.style.borderDasharray = this.pendingChanges.borderType;
            if (this.pendingChanges.borderWidth) drawing.style.borderWidth = parseInt(this.pendingChanges.borderWidth);

            if (this.pendingChanges.showLabelBackground !== undefined) drawing.style.showLabelBackground = this.pendingChanges.showLabelBackground;
            if (this.pendingChanges.labelBackgroundColor) drawing.style.labelBackgroundColor = this.pendingChanges.labelBackgroundColor;
        }
        
        // Fill color (for pin marker)
        if (this.pendingChanges.fill) {
            drawing.style.fill = this.pendingChanges.fill;
            drawing.style.stroke = this.pendingChanges.fill;
        }
        
        // Text changes
        if (this.pendingChanges.text !== undefined) {
            drawing.text = this.pendingChanges.text;
            if (typeof drawing.setText === 'function') {
                drawing.setText(this.pendingChanges.text);
            }
        }
        if (this.pendingChanges.textColor) drawing.style.textColor = this.pendingChanges.textColor;
        if (this.pendingChanges.fontSize) drawing.style.fontSize = parseInt(this.pendingChanges.fontSize);
        if (this.pendingChanges.fontItalic !== undefined) drawing.style.fontStyle = this.pendingChanges.fontItalic ? 'italic' : 'normal';
        if (this.pendingChanges.fontBold !== undefined) drawing.style.fontWeight = this.pendingChanges.fontBold ? 'bold' : 'normal';
        if (this.pendingChanges.showText !== undefined) drawing.style.showText = this.pendingChanges.showText;
        
        // Text alignment - also set legacy properties for compatibility
        if (this.pendingChanges.textVAlign) {
            drawing.style.textVAlign = this.pendingChanges.textVAlign;
            drawing.style.textPosition = this.pendingChanges.textVAlign; // Legacy property
        }
        if (this.pendingChanges.textHAlign) {
            drawing.style.textHAlign = this.pendingChanges.textHAlign;
            drawing.style.textAlign = this.pendingChanges.textHAlign; // Legacy property
        }

        if (this.pendingChanges.textOrientation) {
            drawing.style.textOrientation = this.pendingChanges.textOrientation;
        }
        
        // Extend options for lines
        if (this.pendingChanges.extendLeft !== undefined) drawing.style.extendLeft = this.pendingChanges.extendLeft;
        if (this.pendingChanges.extendRight !== undefined) drawing.style.extendRight = this.pendingChanges.extendRight;
        
        // Line ending styles
        if (this.pendingChanges.startStyle !== undefined) drawing.style.startStyle = this.pendingChanges.startStyle;
        if (this.pendingChanges.endStyle !== undefined) drawing.style.endStyle = this.pendingChanges.endStyle;
        
        // Info settings
        if (this.pendingChanges.showInfo !== undefined) {
            if (!drawing.style.infoSettings) drawing.style.infoSettings = {};
            drawing.style.infoSettings.showInfo = this.pendingChanges.showInfo;
        }
        if (this.pendingChanges.infoSettings) {
            if (!drawing.style.infoSettings) drawing.style.infoSettings = {};
            Object.assign(drawing.style.infoSettings, this.pendingChanges.infoSettings);
        }
        
        // Position tool specific properties
        if (this.pendingChanges.rewardColor) drawing.style.rewardColor = this.pendingChanges.rewardColor;
        if (this.pendingChanges.riskColor) drawing.style.riskColor = this.pendingChanges.riskColor;
        if (this.pendingChanges.entryColor) drawing.style.entryColor = this.pendingChanges.entryColor;
        
        // Position risk settings
        if (drawing.meta && (drawing.type === 'long-position' || drawing.type === 'short-position')) {
            if (!drawing.meta.risk) drawing.meta.risk = {};
            if (this.pendingChanges.riskMode !== undefined) drawing.meta.risk.riskMode = this.pendingChanges.riskMode;
            if (this.pendingChanges.riskPercent !== undefined) drawing.meta.risk.riskPercent = parseFloat(this.pendingChanges.riskPercent);
            if (this.pendingChanges.riskAmountUSD !== undefined) drawing.meta.risk.riskAmountUSD = parseFloat(this.pendingChanges.riskAmountUSD);
            if (this.pendingChanges.lotSize !== undefined) drawing.meta.risk.lotSize = parseFloat(this.pendingChanges.lotSize);
            
            // Recalculate if the drawing has the method
            if (typeof drawing.recalculateLotSizeFromRisk === 'function') {
                drawing.recalculateLotSizeFromRisk();
            }
        }
        
        // Levels for parallel channels and other tools with levels
        if (this.pendingChanges.levels) {
            drawing.levels = this.pendingChanges.levels;
        }
        
        // Description removed
        
        // Timeframe visibility - collect from modal and external dropdown checkboxes
        const modal = document.querySelector('.tv-settings-modal');
        if (modal) {
            // Query both modal and external dropdowns
            let timeframeCheckboxes = [...modal.querySelectorAll('.tv-checkbox[data-prop="timeframe"]')];
            if (modal.externalDropdowns) {
                modal.externalDropdowns.forEach(dropdown => {
                    timeframeCheckboxes.push(...dropdown.querySelectorAll('.tv-checkbox[data-prop="timeframe"]'));
                });
            }
            if (timeframeCheckboxes.length > 0) {
                // Initialize visibility object if it doesn't exist
                if (!drawing.visibility) {
                    drawing.visibility = {};
                }
                
                timeframeCheckboxes.forEach(cb => {
                    const tf = cb.dataset.tf;
                    const isChecked = cb.classList.contains('checked');
                    drawing.visibility[tf] = isChecked;
                });
                
                // [debug removed]
            }
        }
        
        // [debug removed]
        
        // Trigger save callback to re-render
        if (this.onSave) {
            this.onSave(drawing);
        }
        
        // Also try to re-render via the drawing manager
        if (window.drawingManager) {
            window.drawingManager.renderDrawing(drawing);
            window.drawingManager.saveDrawings();
        }
        
        // Clear pending changes
        this.pendingChanges = {};
    }

    /**
     * Apply a single change immediately (for live preview)
     */
    applyImmediateChange(drawing, prop, value) {
        switch (prop) {
            case 'lineColor':
                // For pitchfork tools, lineColor controls medianColor
                if (drawing.type === 'pitchfork' || drawing.type === 'pitchfan') {
                    drawing.style.medianColor = value;
                } else {
                    drawing.style.stroke = value;
                }
                break;
            case 'lineType':
                drawing.style.strokeDasharray = value;
                break;
            case 'lineWidth':
                drawing.style.strokeWidth = parseInt(value);
                break;
            case 'upperLineColor':
                drawing.style.upperStroke = value;
                break;
            case 'upperLineType':
                drawing.style.upperStrokeDasharray = value;
                break;
            case 'upperLineWidth':
                drawing.style.upperStrokeWidth = parseInt(value);
                break;
            case 'lowerLineColor':
                drawing.style.lowerStroke = value;
                break;
            case 'lowerLineType':
                drawing.style.lowerStrokeDasharray = value;
                break;
            case 'lowerLineWidth':
                drawing.style.lowerStrokeWidth = parseInt(value);
                break;
            case 'backgroundColor':
                drawing.style.fill = value;
                break;
            case 'textColor':
                drawing.style.textColor = value;
                break;
            case 'fontSize':
                drawing.style.fontSize = parseInt(value);
                break;
        }
        
        // Re-render immediately
        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        if (drawingManager) {
            const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
            drawingManager.renderDrawing(actualDrawing);
            if (drawingManager.saveDrawings) {
                drawingManager.saveDrawings();
            }
        }
    }

    /**
     * Apply changes immediately without waiting for OK button
     */
    applyChangesImmediately(drawing) {
        // [debug removed]
        // [debug removed]
        // Re-render the drawing with updated style
        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        if (drawingManager) {
            // Find the actual drawing in the manager's array to ensure we're updating the right reference
            const actualDrawing = drawingManager.drawings.find(d => d.id === drawing.id);
            // [debug removed]
            if (actualDrawing) {
                // Copy style properties to the actual drawing
                Object.assign(actualDrawing.style, drawing.style);
                // [debug removed]
                // Also copy levels if they exist (for pitchfork/channel tools)
                if (drawing.levels) {
                    actualDrawing.levels = JSON.parse(JSON.stringify(drawing.levels));
                }
                // [debug removed]
                drawingManager.renderDrawing(actualDrawing);
            } else {
                // [debug removed]
                drawingManager.renderDrawing(drawing);
            }
            // Save the changes to persist them
            if (drawingManager.saveDrawings) {
                drawingManager.saveDrawings();
            }
        }
    }

    /**
     * Cancel all changes and restore original style
     */
    cancelChanges(drawing) {
        // [debug removed]
        // [debug removed]
        // [debug removed]
        // [debug removed]
        
        // Use currentDrawing if drawing is not provided or doesn't have id
        const targetDrawing = (drawing && drawing.id) ? drawing : this.currentDrawing;
        
        if (this.originalStyle && window.drawingManager && targetDrawing) {
            // Find the actual drawing in the manager's array
            const actualDrawing = window.drawingManager.drawings.find(d => d.id === targetDrawing.id);
            // [debug removed]
            
            if (actualDrawing) {
                // Deep restore - replace entire style object with original
                // Clear current style and copy all original properties
                for (const key in actualDrawing.style) {
                    if (actualDrawing.style.hasOwnProperty(key)) {
                        delete actualDrawing.style[key];
                    }
                }
                const restoredStyle = JSON.parse(JSON.stringify(this.originalStyle));
                Object.assign(actualDrawing.style, restoredStyle);
                
                // Restore original text if it was changed
                if (this.originalText !== undefined) {
                    actualDrawing.text = this.originalText;
                }
                
                // [debug removed]
                
                // Re-render the drawing with restored style
                window.drawingManager.renderDrawing(actualDrawing);
                window.drawingManager.saveDrawings();
                
                // [debug removed]
            } else {
                // [debug removed]
            }
        } else {
            // [debug removed]
        }
        
        // Clear pending changes
        this.pendingChanges = {};
        this.originalStyle = null;
        this.originalText = null;
        
        // Close the panel
        this.hide();
    }

    /**
     * Show info dropdown (floating like template)
     */
    showInfoDropdown(btn, drawing, modal) {
        const existingDropdown = document.querySelector('.settings-info-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
            return; // Toggle off if already open
        }
        
        const infoSettings = {
            showInfo: false,
            priceRange: true,
            percentChange: false,
            changeInPips: false,
            barsRange: false,
            dateTimeRange: false,
            distance: false,
            angle: false,
            ...(drawing.style.infoSettings || {})
        };

        const infoOptionProps = ['priceRange', 'percentChange', 'changeInPips', 'barsRange', 'dateTimeRange', 'distance', 'angle'];
        const anySelected = infoOptionProps.some(p => infoSettings[p] === true);
        const shouldForceDefaultPriceRange = !anySelected;
        if (shouldForceDefaultPriceRange) {
            infoSettings.priceRange = true;
            if (!drawing.style.infoSettings) drawing.style.infoSettings = {};
            drawing.style.infoSettings.priceRange = true;

            if (drawing.style.infoSettings.showInfo === true) {
                this.applyChangesImmediately(drawing);
            }
        }
        
        const dropdown = document.createElement('div');
        dropdown.className = 'settings-info-dropdown';
        dropdown.style.cssText = `
            position: fixed;
            background: #050028;
            border: 1px solid #2a2e39;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            padding: 8px;
            min-width: 180px;
            z-index: 12550;
        `;
        
        dropdown.innerHTML = `
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.priceRange ? 'checked' : ''}" data-info-prop="priceRange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Price range</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.percentChange ? 'checked' : ''}" data-info-prop="percentChange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Percent change</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.changeInPips ? 'checked' : ''}" data-info-prop="changeInPips">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Change in pips</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.barsRange ? 'checked' : ''}" data-info-prop="barsRange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Bars range</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.dateTimeRange ? 'checked' : ''}" data-info-prop="dateTimeRange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Date/time range</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.distance ? 'checked' : ''}" data-info-prop="distance">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Distance</span>
            </label>
            <label class="tv-info-option" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-radius: 4px;">
                <div class="tv-checkbox tv-info-checkbox ${infoSettings.angle ? 'checked' : ''}" data-info-prop="angle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <span style="color: #d1d4dc; font-size: 13px;">Angle</span>
            </label>
        `;

        if (shouldForceDefaultPriceRange) {
            const priceRangeCheckbox = dropdown.querySelector('.tv-info-checkbox[data-info-prop="priceRange"]');
            if (priceRangeCheckbox) priceRangeCheckbox.classList.add('checked');
        }
        
        document.body.appendChild(dropdown);
        
        // Position below button
        const btnRect = btn.getBoundingClientRect();
        dropdown.style.top = `${btnRect.bottom + 4}px`;
        dropdown.style.left = `${btnRect.right - dropdown.offsetWidth}px`;
        
        // Checkbox handlers — whole row is clickable
        const self = this;
        dropdown.querySelectorAll('.tv-info-option').forEach(label => {
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                const checkbox = label.querySelector('.tv-info-checkbox');
                if (!checkbox) return;
                const infoProp = checkbox.dataset.infoProp;
                checkbox.classList.toggle('checked');
                const isChecked = checkbox.classList.contains('checked');
                
                if (!drawing.style.infoSettings) {
                    drawing.style.infoSettings = {};
                }
                drawing.style.infoSettings[infoProp] = isChecked;
                
                if (!self.pendingChanges.infoSettings) {
                    self.pendingChanges.infoSettings = {};
                }
                self.pendingChanges.infoSettings[infoProp] = isChecked;

                if (drawing.type === 'date-price-range' || drawing.type === 'price-range' || drawing.type === 'date-range') {
                    self.applyChangesImmediately(drawing);
                } else {
                    self.renderPreview(drawing);
                }
            });
        });
        
        // Hover effect
        dropdown.querySelectorAll('.tv-info-option').forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#1a1c20';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
        });
        
        // Close on outside click
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    // Template helper methods (shared with floating toolbar)
    deepClone(obj) {
        if (obj === undefined) return undefined;
        return JSON.parse(JSON.stringify(obj));
    }

    getSavedTemplates(toolType) {
        const key = `drawing_templates_${toolType}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    }

/**
 * Apply a single change immediately (for live preview)
 */
applyImmediateChange(drawing, prop, value) {
    switch (prop) {
        case 'lineColor':
            drawing.style.stroke = value;
            break;
        case 'lineType':
            drawing.style.strokeDasharray = value;
            break;
        case 'lineWidth':
            drawing.style.strokeWidth = parseInt(value);
            break;
        case 'backgroundColor':
            drawing.style.fill = value;
            break;
        case 'textColor':
            drawing.style.textColor = value;
            break;
        case 'fontSize':
            drawing.style.fontSize = parseInt(value);
            break;
    }

    // Re-render immediately
    if (window.drawingManager) {
        window.drawingManager.renderDrawing(drawing);
    }
}

/**
 * Show template dropdown (same as floating toolbar)
 */
showTemplateDropdown(btn, drawing, modal) {
    // Toggle off if already open
    const existingDropdown = document.querySelector('.settings-template-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
        return; // Toggle off if already open
    }
    
    // Close floating toolbar template dropdown if open
    const floatingDropdown = document.querySelector('#template-dropdown');
    if (floatingDropdown) floatingDropdown.classList.remove('active');
    
    // Close any other toolbar dropdowns
    document.querySelectorAll('.toolbar-dropdown.active').forEach(d => d.classList.remove('active'));
    
    // Close context menu if open
    const contextMenu = document.querySelector('.tv-context-menu');
    if (contextMenu) contextMenu.remove();

    const dropdown = document.createElement('div');
    dropdown.className = 'settings-template-dropdown';
    dropdown.style.cssText = `
        position: fixed;
        background: #050028;
        border: 1px solid #2a2e39;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        padding: 8px;
        min-width: 220px;
        z-index: 12550;
    `;

    const templates = this.getSavedTemplates(drawing.type);

    dropdown.dataset.toolType = drawing.type;

    dropdown.innerHTML = `
        <style>
            .settings-template-dropdown .template-delete-btn {
                opacity: 0.5;
                cursor: pointer;
                color: #787b86;
                transition: opacity 0.15s, color 0.15s;
            }
            .settings-template-dropdown .template-delete-btn:hover {
                opacity: 1;
                color: #ff5252;
            }
        </style>
        <div class="template-dropdown-item" data-action="save-template" style="
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: default;
            color: #d1d4dc;
            font-size: 13px;
        ">Save as</div>
        <div class="template-dropdown-item" data-action="apply-default" style="
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: default;
            color: #d1d4dc;
            font-size: 13px;
        ">Apply Default</div>
        ${templates.length > 0 ? `
            <div style="height: 1px; background: #363a45; margin: 4px 0;"></div>
            ${templates.map(t => `
                <div class="template-dropdown-item template-saved-item" data-template-id="${t.id}" style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: default;
                    color: #d1d4dc;
                    font-size: 13px;
                ">
                    <span>${t.name}</span>
                    <span class="template-delete-btn" data-template-id="${t.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </span>
                </div>
            `).join('')}
        ` : ''}
    `;

    if (!btn.dataset.anchorId) {
        btn.dataset.anchorId = `template-btn-${Date.now()}`;
    }
    dropdown.dataset.anchorId = btn.dataset.anchorId;

    document.body.appendChild(dropdown);

    const rect = btn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${rect.left}px`;

    const adjustPosition = () => {
        const ddRect = dropdown.getBoundingClientRect();
        if (ddRect.right > window.innerWidth - 8) {
            dropdown.style.left = `${Math.max(8, window.innerWidth - ddRect.width - 8)}px`;
        }
        if (ddRect.bottom > window.innerHeight - 8) {
            dropdown.style.top = `${Math.max(8, rect.top - ddRect.height - 8)}px`;
        }
    };
    adjustPosition();

    dropdown.querySelectorAll('.template-dropdown-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = '#363a45');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();

        const deleteBtn = e.target.closest('.template-delete-btn');
        if (deleteBtn) {
            const templateId = deleteBtn.dataset.templateId;
            this.deleteTemplate(drawing.type, templateId);
            dropdown.remove();
            return;
        }

        const savedItem = e.target.closest('.template-saved-item');
        if (savedItem && !e.target.closest('.template-delete-btn')) {
            const templateId = savedItem.dataset.templateId;
            this.applyTemplate(drawing, templateId, modal);
            dropdown.remove();
            return;
        }

        const item = e.target.closest('.template-dropdown-item');
        if (item) {
            const action = item.dataset.action;
            if (action === 'save-template') {
                this.showSaveTemplateDialog(drawing, dropdown);
            } else if (action === 'apply-default') {
                this.applyDefaultTemplate(drawing, modal);
                dropdown.remove();
            }
        }
    });

    const closeDropdown = (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown, true);
        }
    };
    requestAnimationFrame(() => document.addEventListener('click', closeDropdown, true));
}

showSaveTemplateDialog(drawing, dropdown) {
    const dialog = document.createElement('div');
    dialog.className = 'template-save-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #050028;
        border: 1px solid #2a2e39;
        border-radius: 8px;
        padding: 16px;
        z-index: 12551;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        min-width: 280px;
    `;
    dialog.innerHTML = `
        <div class="dialog-title" style="color: #d1d4dc; font-size: 14px; margin-bottom: 12px;">Save Template</div>
        <style>
            .template-save-dialog input::placeholder { color: #787b86; }
            .template-save-dialog #template-save-btn {
                background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45)) !important;
                border: 1px solid rgba(41, 98, 255, 0.85) !important;
                color: #fff !important;
            }
            .template-save-dialog #template-save-btn:hover {
                background: linear-gradient(135deg, rgba(41, 98, 255, 0.85), rgba(41, 98, 255, 0.55)) !important;
                box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.16) !important;
            }
        </style>
        <input type="text" id="template-name-input" placeholder="Template name..." style="
            width: 100%;
            padding: 8px 12px;
            background: #0b0c0e;
            border: 1px solid #2a2e39;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
        "/>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
            <button id="template-cancel-btn" style="
                padding: 6px 14px;
                background: #1a1c20;
                border: 1px solid #2a2e39;
                border-radius: 4px;
                color: #d1d4dc;
                cursor: default;
                font-size: 13px;
            ">Cancel</button>
            <button id="template-save-btn" style="
                padding: 6px 14px;
                background: linear-gradient(135deg, rgba(41, 98, 255, 0.75), rgba(41, 98, 255, 0.45));
                border: 1px solid rgba(41, 98, 255, 0.85);
                border-radius: 4px;
                color: #fff;
                cursor: default;
                font-size: 13px;
            ">Save</button>
        </div>
    `;
    
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        z-index: 12550;
    `;
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    const input = dialog.querySelector('#template-name-input');
    input.focus();
    
    const closeDialog = () => {
        dialog.remove();
        backdrop.remove();
        if (dropdown) dropdown.remove();
    };
    
    backdrop.addEventListener('click', closeDialog);
    dialog.querySelector('#template-cancel-btn').addEventListener('click', closeDialog);
    
    const saveTemplate = () => {
        const name = input.value.trim();
        if (!name) {
            input.style.borderColor = '#ff5252';
            return;
        }

        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        const actualDrawing = drawingManager?.drawings?.find(d => d.id === drawing.id) || drawing;

        const templates = this.getSavedTemplates(actualDrawing.type);
        const styleSnapshot = this.deepClone(actualDrawing.style || {});
        const newTemplate = {
            id: Date.now().toString(),
            name: name,
            style: styleSnapshot,
            text: actualDrawing.text,
            levels: this.deepClone(actualDrawing.levels),
            stroke: (styleSnapshot && styleSnapshot.stroke) || (actualDrawing.style && actualDrawing.style.stroke),
            strokeWidth: (styleSnapshot && styleSnapshot.strokeWidth) || (actualDrawing.style && actualDrawing.style.strokeWidth),
            fill: (styleSnapshot && styleSnapshot.fill) || (actualDrawing.style && actualDrawing.style.fill),
            opacity: (styleSnapshot && styleSnapshot.opacity !== undefined) ? styleSnapshot.opacity : (actualDrawing.style && actualDrawing.style.opacity)
        };
        templates.push(newTemplate);
        localStorage.setItem(`drawing_templates_${actualDrawing.type}`, JSON.stringify(templates));

        window.dispatchEvent(new CustomEvent('drawingTemplatesUpdated', {
            detail: { toolType: actualDrawing.type }
        }));
        
        // Re-render the drawing to apply changes immediately
        if (window.drawingManager) {
            window.drawingManager.renderDrawing(actualDrawing);
        }
        
        closeDialog();
        this.showNotification(`Template "${name}" saved!`);
    };
    
    dialog.querySelector('#template-save-btn').addEventListener('click', saveTemplate);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveTemplate();
        if (e.key === 'Escape') closeDialog();
    });
}

applyTemplate(drawing, templateId, modal) {
        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        const actualDrawing = drawingManager?.drawings?.find(d => d.id === drawing.id) || drawing;

        const templates = this.getSavedTemplates(actualDrawing.type);
        const template = templates.find(t => t.id === templateId);
        
        if (template) {
            if (!actualDrawing.style) actualDrawing.style = {};

            if (template.style) {
                for (const k in actualDrawing.style) {
                    if (Object.prototype.hasOwnProperty.call(actualDrawing.style, k)) delete actualDrawing.style[k];
                }
                Object.assign(actualDrawing.style, this.deepClone(template.style));
            } else {
                actualDrawing.style.stroke = template.stroke;
                actualDrawing.style.strokeWidth = template.strokeWidth;
                if (template.fill) actualDrawing.style.fill = template.fill;
                if (template.opacity !== undefined) actualDrawing.style.opacity = template.opacity;
            }

            if (template.text !== undefined) {
                actualDrawing.text = template.text;
                if (typeof actualDrawing.setText === 'function') actualDrawing.setText(template.text);
            }

            if (template.levels) {
                actualDrawing.levels = this.deepClone(template.levels);
            }

            this.pendingChanges = {};
            
            // Update UI elements in the modal to reflect the template
            if (modal) {
                this.updateModalUI(actualDrawing);
            }

            // Re-render + persist
            this.applyChangesImmediately(actualDrawing);
            
            this.showNotification(`Template "${template.name}" applied!`);
        }
    }

    /**
     * Make modal draggable
     */
    makeModalDraggable(modal, header) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        const dragStart = (e) => {
            if (e.target.closest('.tv-modal-close') || e.target.classList.contains('tv-modal-title')) {
                return; // Don't drag when clicking close button or title
            }

            if (e.target === header || header.contains(e.target)) {
                isDragging = true;
                
                // Get current position
                const rect = modal.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                
                // Get mouse position relative to modal
                startX = e.clientX - rect.left;
                startY = e.clientY - rect.top;
                
                // Remove any existing transform
                modal.style.transform = 'none';
                modal.style.left = initialLeft + 'px';
                modal.style.top = initialTop + 'px';
                modal.style.position = 'fixed';
            }
        };

        const dragEnd = () => {
            if (isDragging) {
                // Save the position to localStorage for next time
                const rect = modal.getBoundingClientRect();
                const savedPos = { left: rect.left, top: rect.top };
                try {
                    localStorage.setItem('drawingSettingsModalPosition', JSON.stringify(savedPos));
                } catch (e) {
                    console.warn('Could not save modal position:', e);
                }
            }
            isDragging = false;
        };

        const drag = (e) => {
            if (isDragging) {
                e.preventDefault();
                
                const modalRect = modal.getBoundingClientRect();
                const modalWidth = modalRect.width;
                const modalHeight = modalRect.height;
                
                let newLeft = e.clientX - startX;
                let newTop = e.clientY - startY;
                
                // Constrain to viewport bounds (keep at least 100px visible)
                const minVisible = 100;
                const maxLeft = window.innerWidth - minVisible;
                const maxTop = window.innerHeight - minVisible;
                const minLeft = -(modalWidth - minVisible);
                const minTop = 0; // Don't allow dragging above viewport
                
                newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
                newTop = Math.max(minTop, Math.min(maxTop, newTop));
                
                modal.style.left = newLeft + 'px';
                modal.style.top = newTop + 'px';
                
                // Update any open external dropdowns to follow the modal
                const drawingId = modal.dataset.drawingId;
                if (drawingId) {
                    const openDropdown = document.querySelector(`.tv-external-dropdown.open[data-modal-id="${drawingId}"]`);
                    if (openDropdown) {
                        const modalRect = modal.getBoundingClientRect();
                        openDropdown.style.left = `${modalRect.right + 8}px`;
                        openDropdown.style.top = `${modalRect.top}px`;
                    }
                }
            }
        };

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
    }

    /**
     * Make title editable on double-click
     */
    makeTitleEditable(titleElement, drawing) {
        const currentTitle = titleElement.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = drawing.name || currentTitle;
        input.className = 'tv-title-edit-input';
        input.style.cssText = `
            background: #1e222d;
            border: 1px solid #2962ff;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 14px;
            font-weight: 600;
            padding: 4px 8px;
            margin: 0;
            width: 120px;
            flex-shrink: 1;
            outline: none;
        `;

        const saveTitle = () => {
            const newTitle = input.value.trim() || currentTitle;
            drawing.name = newTitle;
            titleElement.textContent = newTitle;
            
            // Update drawing name in object tree if it exists
            if (window.objectTree && window.objectTree.updateDrawingName) {
                window.objectTree.updateDrawingName(drawing, newTitle);
            }
            
            // Save to storage
            if (window.drawingManager) {
                window.drawingManager.saveDrawings();
            }
        };

        const cancelEdit = () => {
            titleElement.textContent = drawing.name || currentTitle;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTitle();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        input.addEventListener('blur', saveTitle);

        titleElement.innerHTML = '';
        titleElement.appendChild(input);
        input.focus();
        input.select();
    }

    /**
     * Update modal UI elements to reflect current drawing style
     */
    updateModalUI(drawing) {
        const modal = document.querySelector('.tv-settings-modal');
        if (!modal) return;
        
        // Update line color button
        const lineColorBtn = modal.querySelector('.tv-color-btn[data-prop="lineColor"]');
        if (lineColorBtn) {
            lineColorBtn.style.background = drawing.style.stroke || '#EF5350';
        }
        
        // Update background color button
        const bgColorBtn = modal.querySelector('.tv-color-btn[data-prop="backgroundColor"]');
        if (bgColorBtn) {
            bgColorBtn.style.background = drawing.style.fill || '#2962FF';
        }
        
        // Update line width select
        const lineWidthSelect = modal.querySelector('.tv-select[data-prop="lineWidth"]');
        if (lineWidthSelect) {
            lineWidthSelect.value = drawing.style.strokeWidth || 2;
        }
        
        // Update opacity slider
        const opacitySlider = modal.querySelector('.tv-slider[data-prop="opacity"]');
        if (opacitySlider && drawing.style.opacity !== undefined) {
            opacitySlider.value = Math.round(drawing.style.opacity * 100);
            const valueDisplay = opacitySlider.parentElement.querySelector('.tv-opacity-value');
            if (valueDisplay) {
                valueDisplay.textContent = `${opacitySlider.value}%`;
            }
        }
    }

    applyDefaultTemplate(drawing, modal) {
        const templates = this.getSavedTemplates(drawing.type);
        if (templates.length > 0) {
            // Apply the first saved template as default
            this.applyTemplate(drawing, templates[0].id, modal);
        } else {
            this.showNotification('No saved templates found');
        }
    }

    deleteTemplate(toolType, templateId) {
        let templates = this.getSavedTemplates(toolType);
        templates = templates.filter(t => t.id !== templateId);
        localStorage.setItem(`drawing_templates_${toolType}`, JSON.stringify(templates));
        window.dispatchEvent(new CustomEvent('drawingTemplatesUpdated', {
            detail: { toolType }
        }));
        this.showNotification('Template deleted');
        
        // Refresh the dropdown if it's open
        const dropdown = document.querySelector('.settings-template-dropdown');
        if (dropdown) {
            dropdown.remove();
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #2a2e39;
            color: #d1d4dc;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            z-index: 10010;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    /**
     * Check if drawing type should use TV-style modal
     */
    shouldUseTVModal(type) {
        const tvModalTypes = [
            // Basic shapes
            'rectangle', 'ellipse', 'circle', 'triangle', 'rotated-rectangle',
            // Lines
            'trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray', 'arrow',
            'extended-line', 'cross-line', 'arrow-marker', 'arrow-mark-up', 'arrow-mark-down',
            // Curves and paths
            'arc', 'curve', 'double-curve', 'polyline', 'path', 'brush', 'highlighter',
            // Fibonacci tools
            'fibonacci-retracement', 'fibonacci-extension', 'fib-channel', 'fib-timezone',
            'fib-speed-fan', 'trend-fib-time', 'fib-circles', 'fib-spiral', 'fib-arcs',
            'fib-wedge', 'trend-fib-extension',
            // Gann tools
            'gann-box', 'gann-square', 'gann-square-fixed', 'gann-fan',
            // Pitchfork tools
            'pitchfork', 'schiff-pitchfork', 'modified-schiff-pitchfork', 'inside-pitchfork', 'pitchfan',
            // Pattern tools
            'bars-pattern', 'xabcd-pattern', 'abcd-pattern', 'head-shoulders',
            'elliott-impulse', 'elliott-correction', 'elliott-triangle', 'elliott-double-combo', 'elliott-triple-combo',
            // Position tools
            'long-position', 'short-position',
            // Volume tools
            'volume-profile', 'fixed-range-volume-profile', 'vwap',
            // Text and annotations
            'text', 'notebox', 'label', 'anchored-text', 'note', 'price-note', 'pin', 'callout', 'comment', 'emoji',
            // Channel tools
            'parallel-channel', 'regression-trend', 'flat-top-bottom', 'disjoint-channel',
            // Other tools
            'ruler'
        ];
        return tvModalTypes.includes(type);
    }

    /**
     * Show settings panel for a drawing
     */
    show(drawing, x, y, onSave, onDelete) {
        this.currentDrawing = drawing;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.pendingChanges = {};
        
        // Close all tool dropdowns when settings panel opens
        document.querySelectorAll('.tool-dropdown').forEach(dd => {
            dd.classList.remove('show');
        });
        
        // Store original style for cancel functionality
        this.originalStyle = JSON.parse(JSON.stringify(drawing.style));
        this.originalText = drawing.text || '';
        this.originalLevels = drawing.levels ? JSON.parse(JSON.stringify(drawing.levels)) : null;

        // Remove existing panel/modal and external dropdowns
        if (this.panel) {
            if (this.panel.externalDropdowns) {
                this.panel.externalDropdowns.forEach(d => d.remove());
            }
            if (this.panel.remove) this.panel.remove();
            else if (this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
        }
        const existingModal = document.querySelector('.tv-settings-modal');
        if (existingModal) {
            if (existingModal.externalDropdowns) {
                existingModal.externalDropdowns.forEach(d => d.remove());
            }
            existingModal.remove();
        }
        // Clean up any orphaned external dropdowns
        document.querySelectorAll('.tv-external-dropdown').forEach(d => d.remove());

        // All tools now use TradingView-style modal
        const modal = this.buildTVModal(drawing);
        document.body.appendChild(modal);
        this.panel = modal;
        
        // Show modal after positioning (use requestAnimationFrame for smooth appearance)
        requestAnimationFrame(() => {
            modal.style.opacity = '1';
            
            // Auto-open Style tab by default
            const styleTabBtn = modal.querySelector('.tv-collapsible-tab-btn[data-tab="style"]');
            if (styleTabBtn) {
                styleTabBtn.click();
            }
        });
        
        return modal;
    }


    // DEPRECATED: Legacy panel styles - all tools now use TV modal
    ensureBasePanelStyles() {
        if (this.baseStylesInjected) return;
        if (document.getElementById('drawing-settings-base-styles')) {
            this.baseStylesInjected = true;
            return;
        }

        d3.select('head')
            .append('style')
            .attr('id', 'drawing-settings-base-styles')
            .text(`
.drawing-style-editor {
    width: 320px;
    max-height: 520px;
    background: #131722;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    color: #d1d4dc;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 13px;
    overflow: visible;
    display: flex;
    flex-direction: column;
    animation: editorFadeIn 0.15s ease-out;
}
@keyframes editorFadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
}
.drawing-style-editor .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.drawing-style-editor .settings-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #d1d4dc;
}
.drawing-style-editor .settings-header .settings-close {
    background: none;
    border: none;
    color: #8a909f;
    font-size: 20px;
    cursor: default;
    padding: 2px 4px;
    border-radius: 6px;
    transition: all 0.15s ease;
}
.drawing-style-editor .settings-header .settings-close:hover {
    background: rgba(41, 98, 255, 0.15);
    color: #ffffff;
}
.drawing-style-editor .drawing-settings-scroll {
    padding: 16px 18px 18px;
    overflow-y: auto;
    overflow-x: visible;
    scrollbar-width: thin;
    scrollbar-color: rgba(130,136,149,0.5) transparent;
    background: #131722;
}
.drawing-style-editor .drawing-settings-scroll::-webkit-scrollbar {
    width: 6px;
}
.drawing-style-editor .drawing-settings-scroll::-webkit-scrollbar-thumb {
    background: rgba(130,136,149,0.5);
    border-radius: 6px;
}
.drawing-style-editor label {
    color: #787b86;
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 6px;
    display: inline-block;
}
.drawing-style-editor .settings-section + .settings-section {
    margin-top: 16px;
}
.drawing-style-editor .settings-btn {
    flex: 1;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: default;
    transition: all 0.2s ease;
}
.drawing-style-editor .settings-btn-close {
    background: transparent;
    border: 2px solid rgba(255,255,255,0.3);
    color: #d1d4dc;
}
.drawing-style-editor .settings-btn-close:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.5);
}
.drawing-style-editor .settings-btn-save {
    background: #ffffff;
    border: 2px solid #ffffff;
    color: #1a1d28;
}
.drawing-style-editor .settings-btn-save:hover {
    background: #f0f0f0;
    border-color: #f0f0f0;
}
.drawing-style-editor .settings-btn-delete {
    background: #f23645;
    border: 2px solid #f23645;
    color: white;
}
.drawing-style-editor .settings-btn-delete:hover {
    background: #d32f3f;
    border-color: #d32f3f;
}
.drawing-style-editor .drawing-settings-tabs {
    margin-top: 12px;
}
.drawing-style-editor .drawing-settings-tab-header {
    display: flex;
    gap: 6px;
    padding: 4px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
}
.drawing-style-editor .drawing-settings-tab-header .tab-button {
    flex: 1;
    border: none;
    background: transparent;
    color: #9aa1b5;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: default;
    transition: background 0.16s ease, color 0.16s ease;
}
.drawing-style-editor .drawing-settings-tab-header .tab-button:hover {
    color: #d1d4dc;
    background: rgba(145, 152, 171, 0.15);
}
.drawing-style-editor .drawing-settings-tab-header .tab-button.active {
    color: #ffffff;
    background: linear-gradient(135deg, rgba(44, 123, 255, 0.45), rgba(44, 123, 255, 0.25));
    box-shadow: 0 4px 12px rgba(44, 123, 255, 0.25);
}
.drawing-style-editor input[type="text"],
.drawing-style-editor input[type="number"],
.drawing-style-editor textarea,
.drawing-style-editor select {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #f0f3f8;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
}
.drawing-style-editor input[type="text"]:focus,
.drawing-style-editor input[type="number"]:focus,
.drawing-style-editor textarea:focus,
.drawing-style-editor select:focus {
    border-color: rgba(44, 123, 255, 0.7);
    box-shadow: 0 0 0 2px rgba(44, 123, 255, 0.15);
}
.drawing-style-editor .settings-section h3,
.drawing-style-editor .settings-section h4 {
    margin: 0;
    color: #dfe3eb;
    font-weight: 600;
}
.drawing-style-editor .settings-section h4 {
    font-size: 13px;
}
.drawing-settings-color-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.drawing-style-editor .drawing-color-control {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
}
.drawing-style-editor .drawing-color-preview-wrapper {
    position: relative;
    display: flex;
}
.drawing-style-editor .drawing-color-preview {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 2px solid rgba(255,255,255,0.15);
    cursor: default;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.drawing-style-editor .drawing-color-preview:hover {
    border-color: rgba(44, 123, 255, 0.9);
    box-shadow: 0 6px 14px rgba(44, 123, 255, 0.25);
}
.drawing-style-editor .drawing-color-value {
    color: #d1d4dc;
    font-size: 13px;
    font-weight: 600;
    min-width: 130px;
}
.drawing-color-palette {
    position: fixed;
    top: 0;
    left: 0;
    background: #1f232d;
    border-radius: 12px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
    padding: 18px;
    display: none;
    flex-direction: column;
    gap: 12px;
    z-index: 10001;
    min-width: 300px;
    border: 1px solid rgba(255,255,255,0.06);
}
.drawing-color-palette.active {
    display: flex;
}
.drawing-color-palette .drawing-color-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 6px;
}
.drawing-color-palette .drawing-color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: default;
    transition: transform 0.16s ease, border-color 0.16s ease;
}
.drawing-color-palette .drawing-color-swatch:hover {
    transform: scale(1.1);
    border-color: rgba(255,255,255,0.8);
}
.drawing-color-palette .drawing-color-swatch.selected {
    border-color: rgba(255,255,255,0.95);
    box-shadow: 0 0 0 1px #1f232d, 0 0 0 3px rgba(255,255,255,0.85);
}
.drawing-color-palette .drawing-color-divider {
    height: 1px;
    background: rgba(120,125,140,0.4);
}
.drawing-color-palette .drawing-color-recent {
    display: flex;
    align-items: center;
    gap: 12px;
}
.drawing-color-palette .drawing-color-recent-items {
    display: flex;
    gap: 8px;
}
.drawing-color-palette .drawing-color-add {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px dashed rgba(255,255,255,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    color: rgba(255,255,255,0.75);
    font-size: 18px;
    transition: background 0.16s ease, border-color 0.16s ease;
}
.drawing-color-palette .drawing-color-add:hover {
    background: rgba(60,66,82,0.65);
    border-color: rgba(255,255,255,0.45);
    color: #ffffff;
}
.drawing-color-palette .drawing-color-opacity {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.drawing-color-palette .drawing-color-opacity-label {
    color: #aeb4c4;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.35px;
}
.drawing-color-palette .drawing-color-opacity-control {
    display: flex;
    align-items: center;
    gap: 12px;
}
.drawing-color-palette .drawing-color-opacity-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,1));
    outline: none;
    cursor: default;
}
.drawing-color-palette .drawing-color-opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid rgba(32,36,48,0.9);
    cursor: default;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.drawing-color-palette .drawing-color-opacity-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid rgba(32,36,48,0.9);
    cursor: default;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.drawing-color-palette .drawing-color-opacity-value {
    color: #f0f3f8;
    font-size: 13px;
    font-weight: 600;
    min-width: 50px;
    text-align: right;
}
            `);

        this.baseStylesInjected = true;
    }

    /**
     * DEPRECATED: Build panel content based on drawing type
     * All tools now use TV modal - this function is no longer called
     */
    buildPanelContent(drawing) {
        // Title
        const contentRoot = this.panelContent
            ? this.panelContent
            : this.panel;

        // [debug removed]
        // [debug removed]
        // [debug removed]
        
        contentRoot.append('div')
            .attr('class', 'settings-section')
            .append('h3')
            .style('margin', '0')
            .style('color', '#d1d4dc')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .text(`${drawing.type.toUpperCase()} Settings`);

        const isRiskReward = drawing.type === 'long-position' || drawing.type === 'short-position';
        const isGannBox = drawing.type === 'gann-box';
        const supportsTextTab = ['trendline', 'horizontal', 'vertical', 'ray', 'curve', 'double-curve', 'arrow'].includes(drawing.type);
        
        let styleContainerParent = contentRoot;
        let textTabPane = null;
        if (isGannBox) {
            this.ensureTabsStyles();

            const tabsWrapper = contentRoot.append('div')
                .attr('class', 'drawing-settings-tabs');

            const tabHeader = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-header');

            const tabContent = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-content');

            const stylePane = tabContent.append('div')
                .attr('class', 'tab-pane active')
                .attr('data-tab', 'style');

            const coordPane = tabContent.append('div')
                .attr('class', 'tab-pane')
                .attr('data-tab', 'coordinates');

            const visPane = tabContent.append('div')
                .attr('class', 'tab-pane')
                .attr('data-tab', 'visibility');

            const tabs = [
                { key: 'style', label: 'Style', pane: stylePane },
                { key: 'coordinates', label: 'Coordinates', pane: coordPane },
                { key: 'visibility', label: 'Visibility', pane: visPane }
            ];

            const setActiveTab = (targetKey) => {
                tabs.forEach(tab => {
                    tab.button.classed('active', tab.key === targetKey);
                    tab.pane.classed('active', tab.key === targetKey);
                });
            };

            tabs.forEach(tab => {
                tab.button = tabHeader.append('button')
                    .attr('class', 'tab-button')
                    .text(tab.label)
                    .on('click', () => setActiveTab(tab.key));
            });

            setActiveTab('style');

            this.addGannBoxSettings(stylePane, coordPane, visPane, drawing);
            styleContainerParent = null; // Skip default style controls
        } else if (isRiskReward) {
            this.ensureTabsStyles();

            const tabsWrapper = contentRoot.append('div')
                .attr('class', 'drawing-settings-tabs');

            const tabHeader = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-header');

            const tabContent = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-content');

            const inputsPane = tabContent.append('div')
                .attr('class', 'tab-pane')
                .attr('data-tab', 'inputs');

            const stylePane = tabContent.append('div')
                .attr('class', 'tab-pane')
                .attr('data-tab', 'style');

            const tabs = [
                { key: 'inputs', label: 'Inputs', pane: inputsPane },
                { key: 'style', label: 'Style', pane: stylePane }
            ];

            const setActiveTab = (targetKey) => {
                tabs.forEach(tab => {
                    tab.button.classed('active', tab.key === targetKey);
                    tab.pane.classed('active', tab.key === targetKey);
                });
            };

            tabs.forEach(tab => {
                tab.button = tabHeader.append('button')
                    .attr('class', 'tab-button')
                    .text(tab.label)
                    .on('click', () => setActiveTab(tab.key));
            });

            setActiveTab('inputs');

            this.addRiskRewardInputs(inputsPane, drawing);
            styleContainerParent = stylePane;
        } else if (supportsTextTab) {
            this.ensureTabsStyles();

            const tabsWrapper = contentRoot.append('div')
                .attr('class', 'drawing-settings-tabs');

            const tabHeader = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-header');

            const tabContent = tabsWrapper.append('div')
                .attr('class', 'drawing-settings-tab-content');

            const stylePane = tabContent.append('div')
                .attr('class', 'tab-pane active')
                .attr('data-tab', 'style');

            textTabPane = tabContent.append('div')
                .attr('class', 'tab-pane')
                .attr('data-tab', 'text');

            const tabs = [
                { key: 'style', label: 'Style', pane: stylePane },
                { key: 'text', label: 'Text', pane: textTabPane }
            ];

            const setActiveTab = (targetKey) => {
                tabs.forEach(tab => {
                    tab.button.classed('active', tab.key === targetKey);
                    tab.pane.classed('active', tab.key === targetKey);
                });
            };

            tabs.forEach(tab => {
                tab.button = tabHeader.append('button')
                    .attr('class', 'tab-button')
                    .text(tab.label)
                    .on('click', () => setActiveTab(tab.key));
            });

            setActiveTab('style');
            styleContainerParent = stylePane;
        }

        // Style Section
        const styleSection = styleContainerParent.append('div')
            .attr('class', 'settings-section');

        // [debug removed]
        const textToolTypes = ['text', 'notebox', 'label', 'anchored-text', 'note', 'pin', 'price-note'];
        const isTextTool = textToolTypes.includes(drawing.type);
        const isNoteBox = drawing.type === 'notebox';
        const isLongShortTool = drawing.type === 'long-position' || drawing.type === 'short-position';
        const hasSeparateTextTab = supportsTextTab;
        const isFibonacci = drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension';

        // Add Style Templates section with preview (for line/shape tools)
        // Exclude arrow-marker, image, and image-v2 from templates - they use custom settings
        const excludeFromTemplates = drawing.type === 'arrow-marker' || drawing.type === 'image' || drawing.type === 'image-v2';
        if (!isLongShortTool && !isFibonacci && !isTextTool && !excludeFromTemplates) {
            this.addStyleTemplates(styleSection, drawing);
        }

        // Define tool categories for settings
        const lineTools = ['trendline', 'horizontal', 'vertical', 'ray'];
        const shapeTools = ['rectangle', 'rotated-rectangle', 'ellipse', 'circle', 'triangle', 'arrow-marker'];
        const brushTools = ['brush', 'highlighter'];
        const arrowMarkerTools = ['arrow-mark-up', 'arrow-mark-down'];
        const curveTools = ['arc', 'curve', 'double-curve'];
        const pathTools = ['path', 'polyline'];
        
        // Image Tool V2 or Image Tool - check first
        if (drawing.type === 'image-v2' || drawing.type === 'image') {
            // [debug removed]
            // Image preview section with label
            const imageGroup = document.createElement('div');
            imageGroup.className = 'settings-group';
            imageGroup.style.marginBottom = '16px';
            
            const label = document.createElement('label');
            label.textContent = 'Image';
            label.style.display = 'block';
            label.style.marginBottom = '8px';
            label.style.color = '#d1d4dc';
            label.style.fontSize = '12px';
            imageGroup.appendChild(label);
            
            // Image preview container with dashed border
            const previewContainer = document.createElement('div');
            previewContainer.style.cssText = `
                width: 100%;
                height: 200px;
                border: 2px dashed #434651;
                border-radius: 4px;
                background: #1e222d;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                cursor: pointer;
            `;
            
            if (drawing.style.imageUrl) {
                // Show image preview
                const img = document.createElement('img');
                img.src = drawing.style.imageUrl;
                img.style.cssText = `
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                `;
                previewContainer.appendChild(img);
                
                // Delete button (trash icon)
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                `;
                deleteBtn.style.cssText = `
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    background: rgba(0, 0, 0, 0.7);
                    border: none;
                    border-radius: 4px;
                    padding: 8px;
                    cursor: pointer;
                    color: #d1d4dc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                `;
                deleteBtn.onmouseenter = () => deleteBtn.style.background = 'rgba(242, 54, 69, 0.8)';
                deleteBtn.onmouseleave = () => deleteBtn.style.background = 'rgba(0, 0, 0, 0.7)';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    drawing.style.imageUrl = '';
                    this.onUpdate(drawing);
                    // Refresh the settings panel
                    this.showSettings(drawing);
                };
                previewContainer.appendChild(deleteBtn);
            } else {
                // Show placeholder text
                const placeholder = document.createElement('div');
                placeholder.textContent = 'Click to upload image';
                placeholder.style.cssText = `
                    color: #787b86;
                    font-size: 14px;
                    text-align: center;
                `;
                previewContainer.appendChild(placeholder);
            }
            
            // Click to upload
            previewContainer.onclick = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            drawing.style.imageUrl = event.target.result;
                            this.onUpdate(drawing);
                            // Refresh the settings panel to show preview
                            this.showSettings(drawing);
                        };
                        reader.readAsDataURL(file);
                    }
                };
                input.click();
            };
            
            imageGroup.appendChild(previewContainer);
            styleSection.appendChild(imageGroup);
            
            // Transparency slider
            this.addSlider(styleSection, 'Transparency', 1 - (drawing.style.opacity || 1), 0, 1, (value) => {
                drawing.style.opacity = 1 - value;
            }, 0.01);
            
            // Size controls
            this.addSlider(styleSection, 'Width', drawing.style.width || 100, 20, 500, (value) => {
                drawing.style.width = value;
                drawing.style.widthInDataUnits = null;
            });
            
            this.addSlider(styleSection, 'Height', drawing.style.height || 100, 20, 500, (value) => {
                drawing.style.height = value;
                drawing.style.heightInDataUnits = null;
            });
            
            // Maintain aspect ratio toggle
            const aspectGroup = document.createElement('div');
            aspectGroup.className = 'settings-group';
            aspectGroup.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; cursor: default;">
                    <div class="tv-checkbox ${drawing.style.maintainAspectRatio !== false ? 'checked' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span style="color: #d1d4dc;">Maintain Aspect Ratio</span>
                </div>
            `;
            styleSection.appendChild(aspectGroup);
            
            const aspectCheckbox = aspectGroup.querySelector('.tv-checkbox');
            aspectCheckbox.addEventListener('click', () => {
                aspectCheckbox.classList.toggle('checked');
                drawing.style.maintainAspectRatio = aspectCheckbox.classList.contains('checked');
                this.onUpdate(drawing);
            });
        }
        // Image Tool - check first
        else if (drawing.type === 'image') {
            // Image preview section with label
            const imageGroup = document.createElement('div');
            imageGroup.className = 'settings-group';
            imageGroup.style.marginBottom = '16px';
            
            const label = document.createElement('label');
            label.textContent = 'Image';
            label.style.display = 'block';
            label.style.marginBottom = '8px';
            label.style.color = '#d1d4dc';
            label.style.fontSize = '12px';
            imageGroup.appendChild(label);
            
            // Image preview container with dashed border
            const previewContainer = document.createElement('div');
            previewContainer.style.cssText = `
                width: 100%;
                height: 200px;
                border: 2px dashed #434651;
                border-radius: 4px;
                background: #1e222d;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                cursor: pointer;
            `;
            
            if (drawing.style.imageUrl) {
                // Show image preview
                const img = document.createElement('img');
                img.src = drawing.style.imageUrl;
                img.style.cssText = `
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                `;
                previewContainer.appendChild(img);
                
                // Delete button (trash icon)
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                `;
                deleteBtn.style.cssText = `
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    background: rgba(0, 0, 0, 0.7);
                    border: none;
                    border-radius: 4px;
                    padding: 8px;
                    cursor: pointer;
                    color: #d1d4dc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                `;
                deleteBtn.onmouseenter = () => deleteBtn.style.background = 'rgba(242, 54, 69, 0.8)';
                deleteBtn.onmouseleave = () => deleteBtn.style.background = 'rgba(0, 0, 0, 0.7)';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    drawing.style.imageUrl = '';
                    this.onUpdate(drawing);
                    // Refresh the settings panel
                    this.showSettings(drawing);
                };
                previewContainer.appendChild(deleteBtn);
            } else {
                // Show placeholder text
                const placeholder = document.createElement('div');
                placeholder.textContent = 'Click to upload image';
                placeholder.style.cssText = `
                    color: #787b86;
                    font-size: 14px;
                    text-align: center;
                `;
                previewContainer.appendChild(placeholder);
            }
            
            // Click to upload
            previewContainer.onclick = () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            drawing.style.imageUrl = event.target.result;
                            this.onUpdate(drawing);
                            // Refresh the settings panel to show preview
                            this.showSettings(drawing);
                        };
                        reader.readAsDataURL(file);
                    }
                };
                input.click();
            };
            
            imageGroup.appendChild(previewContainer);
            styleSection.appendChild(imageGroup);
            
            // Transparency slider
            this.addSlider(styleSection, 'Transparency', 1 - (drawing.style.opacity || 1), 0, 1, (value) => {
                drawing.style.opacity = 1 - value;
            }, 0.01);
            
            // Size controls
            this.addSlider(styleSection, 'Width', drawing.style.width || 100, 20, 500, (value) => {
                drawing.style.width = value;
                drawing.style.widthInDataUnits = null;
            });
            
            this.addSlider(styleSection, 'Height', drawing.style.height || 100, 20, 500, (value) => {
                drawing.style.height = value;
                drawing.style.heightInDataUnits = null;
            });
            
            // Maintain aspect ratio toggle
            const aspectGroup = document.createElement('div');
            aspectGroup.className = 'settings-group';
            aspectGroup.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; cursor: default;">
                    <div class="tv-checkbox ${drawing.style.maintainAspectRatio !== false ? 'checked' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <span style="color: #d1d4dc;">Maintain Aspect Ratio</span>
                </div>
            `;
            styleSection.appendChild(aspectGroup);
            
            const aspectCheckbox = aspectGroup.querySelector('.tv-checkbox');
            aspectCheckbox.addEventListener('click', () => {
                aspectCheckbox.classList.toggle('checked');
                drawing.style.maintainAspectRatio = aspectCheckbox.classList.contains('checked');
                this.onUpdate(drawing);
            });
        }
        // Long/Short Position color controls
        else if (isLongShortTool) {
            this.addColorPicker(styleSection, 'Risk Zone Color', drawing.style.riskColor || 'rgba(242, 54, 69, 0.25)', (color) => {
                drawing.style.riskColor = color;
            });
            
            this.addColorPicker(styleSection, 'Reward Zone Color', drawing.style.rewardColor || 'rgba(8, 153, 129, 0.25)', (color) => {
                drawing.style.rewardColor = color;
            });
            
            this.addColorPicker(styleSection, 'Entry Line Color', drawing.style.entryColor || '#787b86', (color) => {
                drawing.style.entryColor = color;
            });
        }
        // Text tool
        else if (isTextTool) {
            const initialTextColor = drawing.style.textColor || drawing.style.stroke || '#FFFFFF';
            this.addColorPicker(styleSection, 'Text Color', initialTextColor, (color) => {
                drawing.style.textColor = color;
                drawing.style.stroke = color;
            });
        }
        // Old single-point arrow markers (arrow-mark-up, arrow-mark-down)
        else if (arrowMarkerTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill, (color) => {
                drawing.style.fill = color;
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Marker Size', drawing.markerSize || 24, 12, 60, (value) => {
                drawing.markerSize = value;
                drawing.style.markerSize = value;
            });
        }
        // Brush/Highlighter tools
        else if (brushTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill, (color) => {
                drawing.style.fill = color;
            });
            this.addColorPicker(styleSection, 'Border Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Border Width', drawing.style.strokeWidth || 1, 0, 5, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Shape tools (rectangle, ellipse, circle, triangle)
        else if (shapeTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Border Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
                this.applyChangesImmediately(drawing);
            });
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill || 'rgba(41, 98, 255, 0.1)', (color) => {
                drawing.style.fill = color;
                this.applyChangesImmediately(drawing);
            });
            this.addSlider(styleSection, 'Border Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
                this.applyChangesImmediately(drawing);
            });
        }
        // Curve tools (arc, curve, double-curve)
        else if (curveTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Path/Polyline tools
        else if (pathTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Arrow tool (line with arrowhead)
        else if (drawing.type === 'arrow') {
            this.addColorPicker(styleSection, 'Arrow Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Label/Marker tool
        else if (drawing.type === 'label') {
            this.addColorPicker(styleSection, 'Marker Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
                drawing.style.fill = color;
            });
            this.addSlider(styleSection, 'Marker Size', drawing.style.markerSize || 8, 4, 20, (value) => {
                drawing.style.markerSize = value;
            });
        }
        // Line tools (trendline, horizontal, vertical, ray)
        else if (lineTools.includes(drawing.type)) {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
            // Line style dropdown
            this.addLineStylePicker(styleSection, 'Line Style', drawing.style.strokeDasharray || '', (value) => {
                drawing.style.strokeDasharray = value;
            });
        }
        // NoteBox
        else if (isNoteBox) {
            this.addColorPicker(styleSection, 'Border Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            const initialBackground = drawing.style.backgroundColor || drawing.style.fill || 'rgba(41, 98, 255, 0.9)';
            this.addColorPicker(styleSection, 'Background Color', initialBackground, (color) => {
                drawing.style.backgroundColor = color;
                drawing.style.fill = color;
            });
        }
        // Note Tool
        else if (drawing.type === 'note') {
            this.addColorPicker(styleSection, 'Background Color', drawing.style.backgroundColor || 'rgba(41, 98, 255, 0.95)', (color) => {
                drawing.style.backgroundColor = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 12, 8, 24, (value) => {
                drawing.style.fontSize = value;
            });
            this.addTextInput(styleSection, 'Note Text', drawing.text || '', (value) => {
                drawing.setText(value);
            }, { multiline: true, placeholder: 'Enter note...' });
        }
        // Price Note Tool
        else if (drawing.type === 'price-note') {
            this.addColorPicker(styleSection, 'Background Color', drawing.style.backgroundColor || 'rgba(8, 153, 129, 0.95)', (color) => {
                drawing.style.backgroundColor = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 11, 8, 18, (value) => {
                drawing.style.fontSize = value;
            });
            this.addTextInput(styleSection, 'Note (optional)', drawing.text || '', (value) => {
                drawing.setText(value);
            }, { placeholder: 'Add note to price...' });
        }
        // Anchored Text Tool
        else if (drawing.type === 'anchored-text') {
            this.addColorPicker(styleSection, 'Background Color', drawing.style.backgroundColor || 'rgba(41, 98, 255, 0.9)', (color) => {
                drawing.style.backgroundColor = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addColorPicker(styleSection, 'Anchor Color', drawing.style.stroke || '#787b86', (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 12, 8, 24, (value) => {
                drawing.style.fontSize = value;
            });
            this.addSlider(styleSection, 'Anchor Length', drawing.style.anchorLength || 30, 10, 80, (value) => {
                drawing.style.anchorLength = value;
            });
            this.addTextInput(styleSection, 'Text', drawing.text || '', (value) => {
                drawing.setText(value);
            }, { placeholder: 'Enter text...' });
        }
        // Callout Tool
        else if (drawing.type === 'callout') {
            this.addColorPicker(styleSection, 'Background Color', drawing.style.backgroundColor || 'rgba(41, 98, 255, 0.95)', (color) => {
                drawing.style.backgroundColor = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 12, 8, 24, (value) => {
                drawing.style.fontSize = value;
            });
            this.addTextInput(styleSection, 'Callout Text', drawing.text || '', (value) => {
                drawing.setText(value);
            }, { multiline: true, placeholder: 'Enter callout text...' });
        }
        // Price Label Tool
        else if (drawing.type === 'price-label') {
            this.addColorPicker(styleSection, 'Background Color', drawing.style.backgroundColor || '#787b86', (color) => {
                drawing.style.backgroundColor = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 11, 8, 16, (value) => {
                drawing.style.fontSize = value;
            });
            this.addTextInput(styleSection, 'Custom Price Text', drawing.text || '', (value) => {
                drawing.setText(value);
            }, { placeholder: 'Leave empty for auto price' });
        }
        // Price Label 2 Tool - No text input, only auto price display
        else if (drawing.type === 'price-label-2') {
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill || '#2962ff', (color) => {
                drawing.style.fill = color;
            });
            this.addColorPicker(styleSection, 'Stroke Color', drawing.style.stroke || '#2962ff', (color) => {
                drawing.style.stroke = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 14, 10, 20, (value) => {
                drawing.style.fontSize = value;
            });
            this.addSlider(styleSection, 'Stroke Width', drawing.style.strokeWidth || 1, 0, 3, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Signpost 2 Tool
        else if (drawing.type === 'signpost-2') {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke || '#787b86', (color) => {
                drawing.style.stroke = color;
            });
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill || '#2e3238', (color) => {
                drawing.style.fill = color;
            });
            this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#d1d4dc', (color) => {
                drawing.style.textColor = color;
            });
            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 13, 10, 18, (value) => {
                drawing.style.fontSize = value;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
            this.addSlider(styleSection, 'Line Length', drawing.style.lineLength || 100, 50, 200, (value) => {
                drawing.style.lineLength = value;
            });
            this.addTextInput(styleSection, 'Text', drawing.text || 'add text', (value) => {
                drawing.setText(value);
            }, { placeholder: 'add text' });
        }
        // Flag Mark Tool
        else if (drawing.type === 'flag-mark') {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke || '#787b86', (color) => {
                drawing.style.stroke = color;
            });
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill || '#787b86', (color) => {
                drawing.style.fill = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
            this.addSlider(styleSection, 'Line Length', drawing.style.lineLength || 100, 20, 200, (value) => {
                drawing.style.lineLength = value;
            });
            this.addSlider(styleSection, 'Flag Width', drawing.style.flagWidth || 40, 10, 80, (value) => {
                drawing.style.flagWidth = value;
            });
            this.addSlider(styleSection, 'Flag Height', drawing.style.flagHeight || 30, 8, 60, (value) => {
                drawing.style.flagHeight = value;
            });
        }
        // Ruler tool
        else if (drawing.type === 'ruler') {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
        }
        // Trend-Based Fib Extension
        else if (drawing.type === 'trend-fib-extension') {
            this.addColorPicker(styleSection, 'Trend line', drawing.style.trendLineColor || drawing.style.stroke || '#2962ff', (color) => {
                drawing.style.trendLineColor = color;
            });
            this.addSlider(styleSection, 'Trend line width', drawing.style.trendLineWidth || drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.trendLineWidth = value;
            });
        }
        // Gann Box
        else if (drawing.type === 'gann-box') {
            this.addColorPicker(styleSection, 'Line Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addColorPicker(styleSection, 'Fill Color', drawing.style.fill || 'rgba(41, 98, 255, 0.1)', (color) => {
                drawing.style.fill = color;
            });
        }
        // Default fallback
        else {
            this.addColorPicker(styleSection, 'Color', drawing.style.stroke, (color) => {
                drawing.style.stroke = color;
            });
            this.addSlider(styleSection, 'Line Width', drawing.style.strokeWidth || 2, 1, 4, (value) => {
                drawing.style.strokeWidth = value;
            });
        }

        // Opacity (for all tools)
        this.addSlider(styleSection, 'Opacity', drawing.style.opacity || 1, 0, 1, (value) => {
            drawing.style.opacity = value;
        }, 0.01);

        if (drawing.type === 'fibonacci-retracement' || drawing.type === 'fibonacci-extension') {
            this.addFibonacciLevelsSection(styleSection, drawing);
        }

        // Advanced Fibonacci tools with levels
        const fibToolsWithLevels = ['fib-channel', 'fib-speed-fan', 'trend-fib-time', 'fib-circles', 'fib-arcs', 'fib-wedge', 'trend-fib-extension'];
        if (fibToolsWithLevels.includes(drawing.type)) {
            this.addFibToolLevelsSection(styleSection, drawing);
        }

        // Gann tools with angles/levels
        const gannTools = ['gann-fan', 'gann-square', 'gann-square-fixed'];
        if (gannTools.includes(drawing.type)) {
            this.addGannToolSettings(styleSection, drawing);
        }

        // Pitchfork tools with levels
        const pitchforkTools = ['pitchfork', 'pitchfan'];
        if (pitchforkTools.includes(drawing.type)) {
            this.addPitchforkLevelsSection(styleSection, drawing);
        }

        // Channel tools with levels (legacy panel - handled in buildStyleTab for TV modal, exclude regression-trend, flat-top-bottom, and disjoint-channel)
        const channelTools = ['parallel-channel'];
        if (channelTools.includes(drawing.type)) {
            this.addChannelLevelsSection(styleSection, drawing);
        }

        // Fib Time Zone with Fibonacci numbers
        if (drawing.type === 'fib-timezone') {
            this.addFibToolLevelsSection(styleSection, drawing);
        }

        // Text-specific settings
        if ((isTextTool || drawing.type === 'notebox') && !hasSeparateTextTab) {
            this.addTextInput(styleSection, 'Text', drawing.text, (value) => {
                drawing.setText(value);
            }, {
                multiline: true,
                placeholder: isNoteBox ? 'Enter note text…' : 'Enter text…'
            });

            this.addSlider(styleSection, 'Font Size', drawing.style.fontSize || 14, 8, 99, (value) => {
                drawing.style.fontSize = value;
            });

            if (!isTextTool) {
                this.addColorPicker(styleSection, 'Text Color', drawing.style.textColor || '#FFFFFF', (color) => {
                    drawing.style.textColor = color;
                });
            }
        }

        // Label text (for Label tool)
        if (drawing.type === 'label') {
            this.addTextInput(styleSection, 'Label Text', drawing.text, (value) => {
                drawing.text = value;
            });
        }

        if (supportsTextTab && textTabPane) {
            this.addTextTabControls(textTabPane, drawing);
        }

        // Dash style
        if (['trendline', 'horizontal', 'vertical', 'ray'].includes(drawing.type)) {
            this.addSelect(styleSection, 'Line Style', 
                [
                    { value: 'none', label: 'Solid' },
                    { value: '10,6', label: 'Dashed' },
                    { value: '2,2', label: 'Dotted' }
                ],
                (drawing.style.dashArray === '5,5' ? '10,6' : (drawing.style.dashArray || 'none')),
                (value) => {
                    drawing.style.dashArray = value;
                }
            );
        }

        // Action Buttons
        const actionSection = contentRoot.append('div')
            .attr('class', 'settings-section')
            .style('display', 'flex')
            .style('gap', '8px');

        // Cancel Button - revert all changes
        actionSection.append('button')
            .attr('class', 'settings-btn settings-btn-cancel')
            .style('background', '#363a45')
            .style('color', '#787b86')
            .text('Cancel')
            .on('click', () => {
                this.cancelChanges(drawing);
            });

        // Save Button
        actionSection.append('button')
            .attr('class', 'settings-btn settings-btn-save')
            .text('Apply')
            .on('click', () => {
                if (this.onSave) {
                    this.onSave(drawing);
                }
                this.hide();
            });

        // Delete Button
        actionSection.append('button')
            .attr('class', 'settings-btn settings-btn-delete')
            .text('Delete')
            .on('click', () => {
                if (this.onDelete) {
                    this.onDelete(drawing);
                }
                this.hide();
            });
    }

    ensureTabsStyles() {
        if (this.tabsStylesInjected) return;
        const existing = document.getElementById('drawing-settings-tabs-styles');
        if (existing) {
            this.tabsStylesInjected = true;
            return;
        }

        d3.select('head')
            .append('style')
            .attr('id', 'drawing-settings-tabs-styles')
            .text(`
.drawing-style-editor .drawing-settings-tabs { margin-top: 10px; }
.drawing-style-editor .drawing-settings-tab-header { display: inline-flex; gap: 4px; padding: 2px; border-radius: 8px; background: rgba(255,255,255,0.05); margin-bottom: 10px; }
.drawing-style-editor .drawing-settings-tab-header .tab-button { background: transparent; border: none; color: #9aa1b5; font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 6px; cursor: default; transition: all 0.16s ease; }
.drawing-style-editor .drawing-settings-tab-header .tab-button:hover { color: #d1d4dc; background: rgba(209, 212, 220, 0.08); }
.drawing-style-editor .drawing-settings-tab-header .tab-button.active { color: #ffffff; background: linear-gradient(135deg, rgba(41,98,255,0.4), rgba(41,98,255,0.2)); box-shadow: 0 4px 10px rgba(41, 98, 255, 0.18); }
.drawing-style-editor .drawing-settings-tab-content .tab-pane { display: none; }
.drawing-style-editor .drawing-settings-tab-content .tab-pane.active { display: block; }
            `);

        this.tabsStylesInjected = true;
    }

    /**
     * Add color picker to panel
     */
    addColorPicker(container, label, initialValue, onChange) {
        this.ensureColorPickerStyles();

        const row = container.append('div')
            .attr('class', 'drawing-settings-color-row')
            .style('margin-bottom', '16px');

        row.append('label')
            .style('display', 'block')
            .style('margin-bottom', '6px')
            .text(label);

        const colorBtn = row.append('button')
            .attr('class', 'tv-color-btn')
            .style('width', '32px')
            .style('height', '32px')
            .style('background', initialValue)
            .style('border-radius', '4px')
            .style('border', '1px solid #363a45')
            .style('cursor', 'default')
            .node();
        
        colorBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openColorPicker === 'function') {
                openColorPicker(initialValue, (newColor) => {
                    colorBtn.style.background = newColor;
                    onChange(newColor);
                }, colorBtn);
            }
        };
    }

    /**
     * Add style templates with preview
     */
    addStyleTemplates(container, drawing) {
        const self = this;
        const isShape = ['rectangle', 'rotated-rectangle', 'ellipse', 'circle', 'triangle', 'brush', 'highlighter', 'arc', 'curve', 'double-curve', 'arrow-marker', 'arrow-mark-up', 'arrow-mark-down'].includes(drawing.type);
        
        // Store original style for reset
        const originalStyle = {
            stroke: drawing.style.stroke,
            fill: drawing.style.fill,
            strokeWidth: drawing.style.strokeWidth
        };
        
        // Track selected template
        let selectedTemplate = null;
        
        // Define style templates
        const templates = [
            { name: 'TradingView Blue', stroke: '#787b86', fill: isShape ? 'rgba(41, 98, 255, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'Classic Red', stroke: '#F23645', fill: isShape ? 'rgba(242, 54, 69, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'Bullish Green', stroke: '#089981', fill: isShape ? 'rgba(8, 153, 129, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'Warning Orange', stroke: '#FF9800', fill: isShape ? 'rgba(255, 152, 0, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'Royal Purple', stroke: '#9C27B0', fill: isShape ? 'rgba(156, 39, 176, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'Cyan Accent', stroke: '#00BCD4', fill: isShape ? 'rgba(0, 188, 212, 0.15)' : 'none', strokeWidth: 2 },
            { name: 'White Outline', stroke: '#FFFFFF', fill: 'none', strokeWidth: 1 },
            { name: 'Subtle Gray', stroke: '#787B86', fill: isShape ? 'rgba(120, 123, 134, 0.1)' : 'none', strokeWidth: 1 }
        ];

        const section = container.append('div')
            .style('margin-bottom', '16px')
            .style('padding-bottom', '12px')
            .style('border-bottom', '1px solid #363a45');

        section.append('label')
            .style('display', 'block')
            .style('margin-bottom', '8px')
            .style('font-size', '12px')
            .style('color', '#787b86')
            .text('Style Templates');

        // Large Preview Area with Canvas
        const previewArea = section.append('div')
            .style('background', '#131722')
            .style('border', '1px solid #363a45')
            .style('border-radius', '6px')
            .style('padding', '8px')
            .style('margin-bottom', '10px')
            .style('position', 'relative');

        previewArea.append('span')
            .style('position', 'absolute')
            .style('top', '6px')
            .style('left', '10px')
            .style('font-size', '9px')
            .style('color', '#555')
            .style('z-index', '10')
            .text('Preview');

        // Create Canvas for mini chart
        const canvas = previewArea.append('canvas')
            .attr('width', 220)
            .attr('height', 80)
            .style('width', '100%')
            .style('height', '80px')
            .style('display', 'block')
            .style('border-radius', '4px');

        const ctx = canvas.node().getContext('2d');
        
        // Current style for preview
        let previewStyle = {
            stroke: drawing.style.stroke || '#787b86',
            fill: drawing.style.fill || 'none',
            strokeWidth: drawing.style.strokeWidth || 2
        };

        // Function to draw mini chart with preview
        const drawPreview = () => {
            const w = 220, h = 80;
            ctx.clearRect(0, 0, w, h);
            
            // Draw candles
            const candles = [
                { o: 55, c: 40, h: 35, l: 60 },
                { o: 40, c: 50, h: 35, l: 55 },
                { o: 50, c: 42, h: 38, l: 58 },
                { o: 42, c: 55, h: 35, l: 60 },
                { o: 55, c: 45, h: 40, l: 62 },
                { o: 45, c: 52, h: 42, l: 55 },
                { o: 52, c: 38, h: 32, l: 58 },
                { o: 38, c: 48, h: 35, l: 52 },
                { o: 48, c: 42, h: 38, l: 55 },
                { o: 42, c: 35, h: 30, l: 48 }
            ];
            
            candles.forEach((c, i) => {
                const x = 15 + i * 20;
                const bullish = c.c < c.o;
                const color = bullish ? '#26a69a' : '#ef5350';
                
                // Wick
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, c.h);
                ctx.lineTo(x, c.l);
                ctx.stroke();
                
                // Body
                ctx.fillStyle = color;
                ctx.fillRect(x - 4, Math.min(c.o, c.c), 8, Math.abs(c.c - c.o) || 2);
            });
            
            // Draw the preview shape/line
            ctx.strokeStyle = previewStyle.stroke;
            ctx.lineWidth = previewStyle.strokeWidth;
            ctx.lineCap = 'round';
            
            if (isShape) {
                // Draw rectangle preview
                ctx.beginPath();
                ctx.roundRect(20, 18, 180, 45, 4);
                
                // Fill if needed
                if (previewStyle.fill && previewStyle.fill !== 'none') {
                    ctx.fillStyle = previewStyle.fill;
                    ctx.fill();
                }
                ctx.stroke();
            } else {
                // Draw line preview
                ctx.beginPath();
                ctx.moveTo(10, 70);
                ctx.lineTo(210, 12);
                ctx.stroke();
            }
        };

        // Initial draw
        drawPreview();

        // Function to update preview
        const updatePreview = (template) => {
            previewStyle.stroke = template.stroke;
            previewStyle.fill = template.fill;
            previewStyle.strokeWidth = template.strokeWidth;
            drawPreview();
        };

        // Template grid
        const grid = section.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(4, 1fr)')
            .style('gap', '6px')
            .style('margin-bottom', '10px');

        const cards = [];
        templates.forEach((template, idx) => {
            const card = grid.append('div')
                .attr('class', 'style-template-card')
                .attr('title', template.name)
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('align-items', 'center')
                .style('gap', '3px')
                .style('padding', '6px 4px')
                .style('background', '#1e222d')
                .style('border', '1px solid #363a45')
                .style('border-radius', '5px')
                .style('cursor', 'default')
                .style('transition', 'all 0.15s ease')
                .on('mouseenter', function() {
                    // Update large preview on hover
                    updatePreview(template);
                })
                .on('mouseleave', function() {
                    // Restore to selected or original
                    if (selectedTemplate) {
                        updatePreview(selectedTemplate);
                    } else {
                        updatePreview({ stroke: originalStyle.stroke, fill: originalStyle.fill, strokeWidth: originalStyle.strokeWidth });
                    }
                })
                .on('click', function() {
                    // Select this template (but don't apply yet)
                    selectedTemplate = template;
                    
                    // Update all card borders
                    cards.forEach(c => c.style('border-color', '#363a45').style('background', '#1e222d'));
                    d3.select(this).style('border-color', template.stroke).style('background', '#262b3e');
                    
                    // Update preview
                    updatePreview(template);
                });

            cards.push(card);

            // Small preview icon
            const smallPreview = card.append('svg')
                .attr('width', 28).attr('height', 18).attr('viewBox', '0 0 28 18');

            if (isShape) {
                smallPreview.append('rect')
                    .attr('x', 2).attr('y', 2).attr('width', 24).attr('height', 14).attr('rx', 2)
                    .attr('fill', template.fill).attr('stroke', template.stroke).attr('stroke-width', 1.5);
            } else {
                smallPreview.append('line')
                    .attr('x1', 2).attr('y1', 16).attr('x2', 26).attr('y2', 2)
                    .attr('stroke', template.stroke).attr('stroke-width', 2).attr('stroke-linecap', 'round');
            }

            // Short name
            card.append('span')
                .style('font-size', '8px').style('color', '#787b86').style('text-align', 'center')
                .text(template.name.split(' ')[0]);
        });

        // Apply Button
        const applyBtn = section.append('button')
            .style('width', '100%')
            .style('padding', '8px')
            .style('background', 'linear-gradient(180deg, #787b86 0%, #1E4BD8 100%)')
            .style('border', 'none')
            .style('border-radius', '5px')
            .style('color', '#fff')
            .style('font-size', '12px')
            .style('font-weight', '600')
            .style('cursor', 'default')
            .style('transition', 'all 0.15s')
            .text('Apply Template')
            .on('mouseenter', function() {
                d3.select(this).style('filter', 'brightness(1.1)');
            })
            .on('mouseleave', function() {
                d3.select(this).style('filter', 'none');
            })
            .on('click', function() {
                if (!selectedTemplate) {
                    return;
                }
                
                // Apply the selected template
                drawing.style.stroke = selectedTemplate.stroke;
                if (isShape) {
                    drawing.style.fill = selectedTemplate.fill;
                }
                drawing.style.strokeWidth = selectedTemplate.strokeWidth;
                
                // Update the drawing
                if (self.onUpdate) self.onUpdate(drawing);
                
                // Visual feedback
                d3.select(this).text('✓ Applied!');
                setTimeout(() => {
                    d3.select(this).text('Apply Template');
                }, 1000);
            });
    }

    formatNumericValue(value, decimals = null) {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return '';
        }
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '';
        }
        if (decimals === null || decimals === undefined) {
            return num.toString();
        }
        const fixed = num.toFixed(decimals);
        return fixed
            .replace(/\.0+$/, '')
            .replace(/(\.[0-9]*?)0+$/, '$1')
            .replace(/\.$/, '');
    }

    /**
     * Add slider to panel
     */
    addSlider(container, label, initialValue, min, max, onChange, step = 1) {
        const row = container.append('div')
            .style('margin-bottom', '12px');

        const labelRow = row.append('div')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('margin-bottom', '4px');

        labelRow.append('label')
            .text(label);

        const valueLabel = labelRow.append('span')
            .style('color', '#787b86')
            .style('font-weight', '600')
            .text(initialValue);

        const input = row.append('input')
            .attr('type', 'range')
            .attr('min', min)
            .attr('max', max)
            .attr('step', step)
            .attr('value', initialValue)
            .on('input', function() {
                valueLabel.text(this.value);
                onChange(parseFloat(this.value));
            });
    }

    /**
     * Add line style picker (solid, dashed, dotted)
     */
    addLineStylePicker(container, label, initialValue, onChange) {
        const row = container.append('div')
            .style('margin-bottom', '12px');

        row.append('label')
            .style('display', 'block')
            .style('margin-bottom', '6px')
            .style('font-size', '12px')
            .style('color', '#8b93a6')
            .text(label);

        const styles = [
            { value: '', label: 'Solid', preview: '────────' },
            { value: '8,4', label: 'Dashed', preview: '── ── ──' },
            { value: '2,4', label: 'Dotted', preview: '• • • • • •' }
        ];

        const btnContainer = row.append('div')
            .style('display', 'flex')
            .style('gap', '6px');

        styles.forEach(style => {
            const btn = btnContainer.append('button')
                .attr('class', 'line-style-btn')
                .style('flex', '1')
                .style('padding', '8px 4px')
                .style('background', initialValue === style.value ? 'rgba(41, 98, 255, 0.2)' : 'rgba(255,255,255,0.05)')
                .style('border', initialValue === style.value ? '1px solid #787b86' : '1px solid rgba(255,255,255,0.1)')
                .style('border-radius', '4px')
                .style('color', '#e0e0e0')
                .style('font-size', '11px')
                .style('cursor', 'default')
                .style('transition', 'all 0.15s ease')
                .text(style.label)
                .on('click', function() {
                    // Update all buttons
                    btnContainer.selectAll('button')
                        .style('background', 'rgba(255,255,255,0.05)')
                        .style('border', '1px solid rgba(255,255,255,0.1)');
                    // Highlight selected
                    d3.select(this)
                        .style('background', 'rgba(41, 98, 255, 0.2)')
                        .style('border', '1px solid #787b86');
                    onChange(style.value);
                })
                .on('mouseover', function() {
                    if (initialValue !== style.value) {
                        d3.select(this).style('background', 'rgba(255,255,255,0.1)');
                    }
                })
                .on('mouseout', function() {
                    if (initialValue !== style.value) {
                        d3.select(this).style('background', 'rgba(255,255,255,0.05)');
                    }
                });
        });
    }

    addNumberInput(container, label, initialValue, onChange, options = {}) {
        const { min = null, max = null, step = null, decimals = null, placeholder = '', suffix = '' } = options;

        const row = container.append('div')
            .attr('class', 'drawing-settings-number-row')
            .style('margin-bottom', '12px');

        row.append('label')
            .style('display', 'block')
            .style('margin-bottom', '4px')
            .style('font-size', '12px')
            .style('color', '#8b93a6')
            .text(label);

        const inputRow = row.append('div')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('align-items', 'center');

        const input = inputRow.append('input')
            .attr('type', 'number')
            .attr('placeholder', placeholder)
            .on('change', function() {
                const raw = this.value;
                if (raw === '') {
                    onChange(null, this);
                    return;
                }
                const parsed = parseFloat(raw);
                if (Number.isNaN(parsed)) {
                    onChange(null, this);
                } else {
                    onChange(parsed, this);
                }
            })
            .style('flex', suffix ? '0 0 110px' : '1')
            .style('min-width', '0')
            .style('padding', '6px 10px')
            .style('height', '28px')
            .style('border-radius', '6px')
            .style('border', '1px solid rgba(209, 212, 220, 0.15)')
            .style('background', 'rgba(19, 23, 34, 0.75)')
            .style('color', '#d1d4dc')
            .style('font-size', '12px')
            .style('-moz-appearance', 'textfield')
            .style('outline', 'none');

        input
            .on('focus', function() {
                d3.select(this)
                    .style('border', '1px solid #787b86')
                    .style('box-shadow', '0 0 0 2px rgba(41, 98, 255, 0.18)');
            })
            .on('blur', function() {
                d3.select(this)
                    .style('border', '1px solid rgba(209, 212, 220, 0.15)')
                    .style('box-shadow', 'none');
            });

        if (min !== null) input.attr('min', min);
        if (max !== null) input.attr('max', max);
        if (step !== null) input.attr('step', step);

        input.node().__decimals = decimals;
        input.property('value', this.formatNumericValue(initialValue, decimals));

        if (suffix) {
            inputRow.append('span')
                .style('font-size', '12px')
                .style('color', '#a1a7be')
                .style('padding', '0 6px')
                .style('line-height', '28px')
                .style('border-radius', '4px')
                .style('background', 'rgba(41, 98, 255, 0.08)')
                .style('border', '1px solid rgba(41, 98, 255, 0.25)')
                .text(suffix);
        }

        return input;
    }

    addTextTabControls(container, drawing) {
        const textSection = container.append('div')
            .attr('class', 'settings-section');

        this.addTextInput(textSection, 'Text', drawing.text || '', (value) => {
            drawing.setText(value);
            this.renderPreview(drawing);
        }, {
            multiline: true,
            placeholder: drawing.type === 'rectangle' ? 'Add label…' : 'Add text…'
        });

        const fontSizeFallback = drawing.style.fontSize || this.textFallbacks.fontSize;
        this.addSlider(textSection, 'Font Size', fontSizeFallback, 8, 72, (value) => {
            drawing.style.fontSize = value;
            this.renderPreview(drawing);
        });

        this.addColorPicker(textSection, 'Text Color', drawing.style.textColor || drawing.style.stroke || this.textFallbacks.textColor, (color) => {
            drawing.style.textColor = color;
            this.renderPreview(drawing);
        });

        // Get the actual text position - lines default to 'top', shapes to 'middle'
        const lineTypes = ['trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray', 'extended-line', 'cross-line', 'arrow'];
        const defaultVAlign = lineTypes.includes(drawing.type) ? 'top' : 'middle';
        const currentVAlign = drawing.style.textVAlign || drawing.style.textPosition || defaultVAlign;
        
        this.addSelect(textSection, 'Vertical Position', [
            { value: 'top', label: 'Above Line' },
            { value: 'middle', label: 'On Line' },
            { value: 'bottom', label: 'Below Line' }
        ], currentVAlign, (value) => {
            drawing.style.textVAlign = value;
            drawing.style.textPosition = value; // Legacy compatibility
            this.renderPreview(drawing);
        });

        this.addSelect(textSection, 'Horizontal Position', [
            { value: 'left', label: 'Start' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'End' }
        ], drawing.style.textHAlign || drawing.style.textAlign || 'center', (value) => {
            drawing.style.textHAlign = value;
            drawing.style.textAlign = value; // Legacy compatibility
            this.renderPreview(drawing);
        });

        this.addNumberInput(textSection, 'Offset X', drawing.style.textOffsetX ?? this.textFallbacks.textOffsetX, (value) => {
            if (value === null) return;
            drawing.style.textOffsetX = value;
            this.renderPreview(drawing);
        }, { step: 1, decimals: 0 });

        this.addNumberInput(textSection, 'Offset Y', drawing.style.textOffsetY ?? this.textFallbacks.textOffsetY, (value) => {
            if (value === null) return;
            drawing.style.textOffsetY = value;
            this.renderPreview(drawing);
        }, { step: 1, decimals: 0 });
    }

    /**
     * Add text input to panel
     */
    addTextInput(container, label, initialValue, onChange, options = {}) {
        const { multiline = false, placeholder = '' } = options;
        const row = container.append('div')
            .style('margin-bottom', '12px');

        row.append('label')
            .text(label);

        let input;
        if (multiline) {
            input = row.append('textarea')
                .attr('rows', 4)
                .attr('placeholder', placeholder)
                .text(initialValue || '')
                .on('input', function() {
                    onChange(this.value);
                });
        } else {
            input = row.append('input')
                .attr('type', 'text')
                .attr('placeholder', placeholder)
                .attr('value', initialValue)
                .on('input', function() {
                    onChange(this.value);
                });
        }

        return input;
    }

    addRiskRewardInputs(container, drawing) {
        if (typeof drawing.ensureRiskSettings === 'function') {
            drawing.ensureRiskSettings();
        }

        const section = container.append('div')
            .attr('class', 'settings-section risk-reward-settings')
            .style('margin-top', '12px');

        const title = drawing.type === 'long-position' ? 'Long Position Inputs' : 'Short Position Inputs';
        section.append('h4')
            .text(title)
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin-bottom', '12px');

        const risk = (drawing.meta && drawing.meta.risk) ? drawing.meta.risk : {};
        
        // Initialize risk mode and defaults if not set
        if (!risk.riskMode) risk.riskMode = 'risk-usd';
        if (!risk.balanceType) risk.balanceType = 'current';
        if (!risk.riskAmountUSD) risk.riskAmountUSD = 100; // Default $100 risk
        if (!risk.riskPercent) risk.riskPercent = 1; // Default 1% risk
        
        // Save initialized values back to drawing
        if (drawing.meta) {
            drawing.meta.risk = risk;
        }
        
        // Risk Mode Toggle (USD / Percent)
        const riskModeWrapper = section.append('div')
            .style('margin-bottom', '12px');
        
        riskModeWrapper.append('label')
            .text('Risk Mode')
            .style('display', 'block')
            .style('font-size', '11px')
            .style('color', '#787b86')
            .style('margin-bottom', '6px');
        
        const riskModeTabs = riskModeWrapper.append('div')
            .style('display', 'flex')
            .style('gap', '4px')
            .style('background', 'rgba(255,255,255,0.03)')
            .style('padding', '3px')
            .style('border-radius', '6px');
        
        const usdTab = riskModeTabs.append('button')
            .text('USD')
            .style('flex', '1')
            .style('padding', '6px')
            .style('background', risk.riskMode === 'risk-usd' ? '#787b86' : 'transparent')
            .style('border', 'none')
            .style('border-radius', '4px')
            .style('color', risk.riskMode === 'risk-usd' ? '#ffffff' : '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .style('font-weight', '600')
            .on('click', () => {
                risk.riskMode = 'risk-usd';
                usdTab.style('background', '#787b86').style('color', '#ffffff');
                percentTab.style('background', 'transparent').style('color', '#787b86');
                refreshRisk(true);
            });
        
        const percentTab = riskModeTabs.append('button')
            .text('%')
            .style('flex', '1')
            .style('padding', '6px')
            .style('background', risk.riskMode === 'risk-percent' ? '#787b86' : 'transparent')
            .style('border', 'none')
            .style('border-radius', '4px')
            .style('color', risk.riskMode === 'risk-percent' ? '#ffffff' : '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .style('font-weight', '600')
            .on('click', () => {
                risk.riskMode = 'risk-percent';
                percentTab.style('background', '#787b86').style('color', '#ffffff');
                usdTab.style('background', 'transparent').style('color', '#787b86');
                refreshRisk(true);
            });

        const grid = section.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(auto-fit, minmax(180px, 1fr))')
            .style('gap', '12px');

        const setInputValue = (input, value) => {
            if (!input || typeof input.property !== 'function') return;
            const decimals = input.node().__decimals;
            input.property('value', this.formatNumericValue(value, decimals));
        };

        // Account Size
        const accountInput = this.addNumberInput(grid, 'Account Size', risk.accountSize ?? 10000, (value) => {
            if (value === null) return;
            drawing.setAccountSize?.(value);
            drawing.ensureRiskSettings?.();
            refreshRisk(true);
        }, { min: 0, step: 100, decimals: 2 });

        // Risk Amount (USD or Percent based on mode)
        let riskInputContainer = grid.append('div');
        let riskInput = null;
        
        const createRiskInput = () => {
            riskInputContainer.selectAll('*').remove();
            if (risk.riskMode === 'risk-usd') {
                riskInput = this.addNumberInput(riskInputContainer, 'Risk Amount (USD)', risk.riskAmountUSD ?? 100, (value) => {
                    if (value === null) return;
                    risk.riskAmountUSD = value;
                    calculateLotSizeFromRisk();
                    refreshRisk(true);
                }, { min: 0, step: 10, decimals: 2 });
            } else {
                riskInput = this.addNumberInput(riskInputContainer, 'Risk Percent (%)', risk.riskPercent ?? 1, (value) => {
                    if (value === null) return;
                    risk.riskPercent = value;
                    calculateLotSizeFromRisk();
                    refreshRisk(true);
                }, { min: 0, step: 0.1, decimals: 2 });
            }
        };

        const entryInput = this.addNumberInput(grid, 'Entry Price', risk.entryPrice ?? drawing.points?.[0]?.y ?? 0, (value) => {
            if (value === null) return;
            drawing.setEntryPrice?.(value);
            calculateLotSizeFromRisk();
            refreshRisk(true);
        }, { step: 0.00001, decimals: 5 });

        const stopPriceInput = this.addNumberInput(grid, 'Stop Price', risk.stopPrice ?? drawing.points?.[1]?.y ?? 0, (value) => {
            if (value === null) return;
            drawing.setStopPrice?.(value);
            calculateLotSizeFromRisk();
            refreshRisk(true);
        }, { step: 0.00001, decimals: 5 });

        const profitPriceInput = this.addNumberInput(grid, 'Target Price', risk.targetPrice ?? drawing.points?.[2]?.y ?? 0, (value) => {
            if (value === null) return;
            drawing.setTargetPrice?.(value);
            refreshRisk(true);
        }, { step: 0.00001, decimals: 5 });

        // Calculated Lot Size (Read-only display)
        const lotSizeDisplay = grid.append('div');
        lotSizeDisplay.append('label')
            .text('Calculated Lot Size')
            .style('display', 'block')
            .style('font-size', '11px')
            .style('color', '#787b86')
            .style('margin-bottom', '4px');
        
        const lotSizeValue = lotSizeDisplay.append('div')
            .style('padding', '8px 12px')
            .style('background', 'rgba(41, 98, 255, 0.1)')
            .style('border', '1px solid #787b86')
            .style('border-radius', '6px')
            .style('color', '#787b86')
            .style('font-size', '13px')
            .style('font-weight', '700')
            .text('0.00 Lots');
        
        // Function to calculate lot size from risk
        const calculateLotSizeFromRisk = () => {
            const entry = risk.entryPrice || 0;
            const stop = risk.stopPrice || 0;
            const slDistance = Math.abs(entry - stop);
            
            if (slDistance === 0 || entry === 0) {
                risk.lotSize = 0.01;
                lotSizeValue.text('0.01 Lots');
                return;
            }
            
            let riskUSD = 0;
            if (risk.riskMode === 'risk-usd') {
                riskUSD = risk.riskAmountUSD || 100;
            } else {
                const accountSize = risk.accountSize || 10000;
                riskUSD = (accountSize * (risk.riskPercent || 1)) / 100;
            }
            
            // Calculate lot size using proper pip value formula
            // P&L = (Price Difference in Pips) × Position Size (Lots) × Pip Value ($10)
            // Rearranged: Position Size = Risk USD / (SL Distance in Pips × Pip Value)
            const slPips = slDistance / 0.0001; // Convert to pips
            const pipValue = 10; // $10 per pip per lot
            const calculatedLots = riskUSD / (slPips * pipValue);
            risk.lotSize = Math.max(0.01, calculatedLots);
            
            lotSizeValue.text(`${risk.lotSize.toFixed(2)} Lots`);
            drawing.setLotSize?.(risk.lotSize);
        };

        const summary = section.append('div')
            .attr('class', 'risk-summary')
            .style('margin-top', '8px')
            .style('padding', '12px')
            .style('border', '1px solid rgba(255,255,255,0.08)')
            .style('border-radius', '8px')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '4px')
            .style('background', 'rgba(30, 32, 45, 0.6)');

        const riskAmountText = summary.append('div')
            .style('color', '#d1d4dc')
            .style('font-size', '12px');

        const rewardRatioText = summary.append('div')
            .style('color', '#d1d4dc')
            .style('font-size', '12px');

        const refreshRisk = (propagate = false) => {
            drawing.ensureRiskSettings?.();
            const state = (drawing.meta && drawing.meta.risk) ? drawing.meta.risk : {};
            
            // Recreate risk input if mode changed
            createRiskInput();
            
            // Update all input values
            setInputValue(accountInput, state.accountSize);
            setInputValue(entryInput, state.entryPrice);
            setInputValue(stopPriceInput, state.stopPrice);
            setInputValue(profitPriceInput, state.targetPrice);
            
            // Update lot size display
            calculateLotSizeFromRisk();
            
            // Calculate actual risk amount in USD
            let riskUSD = 0;
            if (state.riskMode === 'risk-usd') {
                riskUSD = state.riskAmountUSD || 100;
            } else {
                riskUSD = ((state.accountSize || 10000) * (state.riskPercent || 1)) / 100;
            }

            riskAmountText.text(`Risk Amount: $${this.formatNumericValue(riskUSD, 2)}`);
            rewardRatioText.text(`Reward Ratio: 1:${this.formatNumericValue(state.rewardRatio, 2)}`);

            if (propagate && this.onUpdate) {
                this.onUpdate(drawing);
            }
        };

        // Initial setup
        createRiskInput();
        calculateLotSizeFromRisk();
        refreshRisk(false);
    }

    addFibonacciLevelsSection(container, drawing) {
        const self = this;
        const levelsSection = container.append('div')
            .attr('class', 'settings-section fib-levels-section')
            .style('margin-top', '16px');

        // Helper to apply changes immediately (same pattern as pitchfork)
        const applyChanges = () => {
            // Sync levels to pendingChanges
            self.pendingChanges.levels = JSON.parse(JSON.stringify(drawing.levels));
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id);
                if (actualDrawing) {
                    actualDrawing.levels = JSON.parse(JSON.stringify(drawing.levels));
                    window.drawingManager.renderDrawing(actualDrawing);
                    window.drawingManager.saveDrawings();
                }
            }
            self.renderPreview(drawing);
        };

        // Header row with title
        const headerRow = levelsSection.append('div')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('margin-bottom', '12px');

        headerRow.append('h4')
            .text('Fibonacci Levels')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0');

        // Options row with toggles
        const optionsRow = levelsSection.append('div')
            .style('display', 'flex')
            .style('gap', '16px')
            .style('margin-bottom', '12px')
            .style('padding-bottom', '8px')
            .style('border-bottom', '1px solid #363a45');

        // Extend Lines toggle
        const extendToggle = optionsRow.append('label')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px')
            .style('cursor', 'default')
            .style('font-size', '11px')
            .style('color', '#787b86');

        extendToggle.append('input')
            .attr('type', 'checkbox')
            .property('checked', drawing.style.extendLines || false)
            .style('cursor', 'default')
            .style('accent-color', '#787b86')
            .on('change', function() {
                drawing.style.extendLines = this.checked;
                applyChanges();
            });

        extendToggle.append('span').text('Extend Lines');

        // Show Zones toggle
        const zonesToggle = optionsRow.append('label')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px')
            .style('cursor', 'default')
            .style('font-size', '11px')
            .style('color', '#787b86');

        zonesToggle.append('input')
            .attr('type', 'checkbox')
            .property('checked', drawing.style.showZones || false)
            .style('cursor', 'default')
            .style('accent-color', '#787b86')
            .on('change', function() {
                drawing.style.showZones = this.checked;
                applyChanges();
            });

        zonesToggle.append('span').text('Show Zones');

        // Column headers
        const columnHeader = levelsSection.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', '24px 1fr 32px 24px')
            .style('gap', '8px')
            .style('margin-bottom', '8px')
            .style('padding-bottom', '6px')
            .style('border-bottom', '1px solid #363a45');

        columnHeader.append('span').text('').style('font-size', '10px').style('color', '#787b86');
        columnHeader.append('span').text('Level').style('font-size', '10px').style('color', '#787b86');
        columnHeader.append('span').text('Color').style('font-size', '10px').style('color', '#787b86').style('text-align', 'center');
        columnHeader.append('span').text('').style('font-size', '10px').style('color', '#787b86');

        const list = levelsSection.append('div')
            .attr('class', 'fib-levels-list')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '6px')
            .style('max-height', '280px')
            .style('overflow-y', 'auto')
            .style('padding-right', '4px');

        if (!Array.isArray(drawing.levels)) {
            const seeded = Array.isArray(drawing.style.levels) ? drawing.style.levels : [];
            drawing.levels = seeded.map(level => ({ ...level }));
        }

        const addLevelRow = (level, index) => {
            const row = list.append('div')
                .attr('class', 'fib-level-row')
                .attr('data-level-index', index)
                .style('display', 'grid')
                .style('grid-template-columns', '24px 1fr 32px 24px')
                .style('align-items', 'center')
                .style('gap', '8px')
                .style('padding', '4px 0')
                .style('border-radius', '4px')
                .style('transition', 'background 0.15s')
                .on('mouseenter', function() {
                    d3.select(this).style('background', 'rgba(255,255,255,0.03)');
                })
                .on('mouseleave', function() {
                    d3.select(this).style('background', 'transparent');
                });

            // Visibility checkbox
            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.visible !== false)
                .style('cursor', 'default')
                .style('accent-color', level.color || '#787b86')
                .on('change', function() {
                    level.visible = this.checked;
                    applyChanges();
                });

            // Level value input (serves as both value and label)
            row.append('input')
                .attr('type', 'number')
                .attr('class', 'fib-level-value')
                .attr('min', '-10')
                .attr('max', '10')
                .attr('step', '0.001')
                .attr('value', level.value)
                .style('width', '100%')
                .style('padding', '6px 10px')
                .on('input', function() {
                    const value = parseFloat(this.value);
                    if (!Number.isNaN(value)) {
                        level.value = value;
                        level.label = value.toString();
                        applyChanges();
                    }
                });

            // Color picker button
            const colorBtn = row.append('button')
                .attr('class', 'tv-color-btn')
                .style('width', '32px')
                .style('height', '32px')
                .style('background', level.color || '#787b86')
                .style('border-radius', '4px')
                .style('border', '1px solid #363a45')
                .style('cursor', 'default')
                .node();
            
            colorBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof openColorPicker === 'function') {
                    openColorPicker(level.color || '#787b86', (newColor) => {
                        level.color = newColor;
                        colorBtn.style.background = newColor;
                        row.select('input[type="checkbox"]').style('accent-color', newColor);
                        applyChanges();
                    }, colorBtn);
                }
            };
            
            // Placeholder for compatibility
            const valueLabel = null;
            if (valueLabel) {
                valueLabel.style.display = 'none';
            }

            // Delete button
            row.append('button')
                .attr('class', 'fib-level-delete')
                .style('width', '20px')
                .style('height', '20px')
                .style('padding', '0')
                .style('background', 'transparent')
                .style('border', 'none')
                .style('color', '#787b86')
                .style('cursor', 'default')
                .style('font-size', '14px')
                .style('line-height', '1')
                .style('border-radius', '4px')
                .style('transition', 'all 0.15s')
                .html('×')
                .on('mouseenter', function() {
                    d3.select(this).style('background', '#f2364520').style('color', '#f23645');
                })
                .on('mouseleave', function() {
                    d3.select(this).style('background', 'transparent').style('color', '#787b86');
                })
                .on('click', function() {
                    const idx = drawing.levels.indexOf(level);
                    if (idx > -1) {
                        drawing.levels.splice(idx, 1);
                        row.remove();
                        applyChanges();
                    }
                });

            return row;
        };

        drawing.levels.forEach((level, idx) => addLevelRow(level, idx));

        // Button row
        const buttonRow = levelsSection.append('div')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('margin-top', '12px');

        // Add Level button
        buttonRow.append('button')
            .attr('class', 'settings-btn fib-add-level')
            .style('flex', '1')
            .style('padding', '8px 12px')
            .style('background', '#787b8620')
            .style('border', '1px solid #787b8640')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '12px')
            .style('cursor', 'default')
            .style('transition', 'all 0.15s')
            .text('+ Add Level')
            .on('mouseenter', function() {
                d3.select(this).style('background', '#787b8630');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', '#787b8620');
            })
            .on('click', () => {
                const newLevel = {
                    value: 0.5,
                    label: '0.5',
                    color: '#787b86',
                    visible: true
                };
                drawing.levels.push(newLevel);
                addLevelRow(newLevel, drawing.levels.length - 1);
                applyChanges();
            });

        // Reset to Default button
        buttonRow.append('button')
            .attr('class', 'settings-btn fib-reset-levels')
            .style('padding', '8px 12px')
            .style('background', 'transparent')
            .style('border', '1px solid #363a45')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '12px')
            .style('cursor', 'default')
            .style('transition', 'all 0.15s')
            .text('Reset')
            .on('mouseenter', function() {
                d3.select(this).style('border-color', '#787b86').style('color', '#d1d4dc');
            })
            .on('mouseleave', function() {
                d3.select(this).style('border-color', '#363a45').style('color', '#787b86');
            })
            .on('click', () => {
                // Reset to default levels
                const defaultLevels = [
                    { value: 0, label: '0', color: '#787b86', visible: true },
                    { value: 0.236, label: '0.236', color: '#f23645', visible: true },
                    { value: 0.382, label: '0.382', color: '#ff9800', visible: true },
                    { value: 0.5, label: '0.5', color: '#ffeb3b', visible: true },
                    { value: 0.618, label: '0.618', color: '#4caf50', visible: true },
                    { value: 0.786, label: '0.786', color: '#2196f3', visible: true },
                    { value: 1, label: '1', color: '#787b86', visible: true }
                ];
                drawing.levels = defaultLevels.map(l => ({...l}));
                list.selectAll('.fib-level-row').remove();
                drawing.levels.forEach((level, idx) => addLevelRow(level, idx));
                applyChanges();
            });
    }

    /**
     * Add settings section for advanced Fibonacci tools
     */
    addFibToolLevelsSection(container, drawing) {
        const self = this;
        const section = container.append('div')
            .attr('class', 'settings-section fib-tool-levels')
            .style('margin-top', '16px');

        section.append('h4')
            .text('Fibonacci Levels')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0 0 12px 0');

        const defaultLevels = (drawing.type === 'fib-timezone')
            ? [
                { value: 0, enabled: true, color: '#787b86' },
                { value: 1, enabled: true, color: '#f23645' },
                { value: 2, enabled: true, color: '#ff9800' },
                { value: 3, enabled: true, color: '#ffeb3b' },
                { value: 5, enabled: true, color: '#4caf50' },
                { value: 8, enabled: true, color: '#00bcd4' },
                { value: 13, enabled: true, color: '#2962ff' },
                { value: 21, enabled: true, color: '#9c27b0' },
                { value: 34, enabled: true, color: '#e91e63' },
                { value: 55, enabled: false, color: '#673ab7' },
                { value: 89, enabled: false, color: '#3f51b5' },
                { value: 144, enabled: false, color: '#607d8b' }
            ]
            : [
                { value: 0, enabled: true, color: '#787b86' },
                { value: 0.236, enabled: true, color: '#f23645' },
                { value: 0.382, enabled: true, color: '#ff9800' },
                { value: 0.5, enabled: true, color: '#ffeb3b' },
                { value: 0.618, enabled: true, color: '#4caf50' },
                { value: 0.786, enabled: true, color: '#00bcd4' },
                { value: 1, enabled: true, color: '#2962ff' },
                { value: 1.272, enabled: false, color: '#9c27b0' },
                { value: 1.618, enabled: true, color: '#e91e63' },
                { value: 2.618, enabled: false, color: '#673ab7' },
                { value: 4.236, enabled: false, color: '#3f51b5' }
            ];

        // Initialize levels if not in correct format
        if ((!Array.isArray(drawing.levels) || typeof drawing.levels[0] === 'number') && drawing.type === 'fib-timezone') {
            if (Array.isArray(drawing.fibNumbers) && drawing.fibNumbers.length) {
                drawing.levels = drawing.fibNumbers.map(l => ({ ...l }));
            } else if (Array.isArray(drawing.style?.fibNumbers) && drawing.style.fibNumbers.length) {
                drawing.levels = drawing.style.fibNumbers.map(l => ({ ...l }));
            } else {
                drawing.levels = defaultLevels.map(l => ({ ...l }));
            }
        } else if (!Array.isArray(drawing.levels) || typeof drawing.levels[0] === 'number') {
            drawing.levels = defaultLevels.map(l => ({ ...l }));
        }

        const list = section.append('div')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '4px')
            .style('max-height', '240px')
            .style('overflow-y', 'auto')
            .style('padding-right', '4px');

        const addRow = (level, idx) => {
            const row = list.append('div')
                .style('display', 'grid')
                .style('grid-template-columns', '20px 70px 28px 24px')
                .style('align-items', 'center')
                .style('gap', '6px')
                .style('padding', '3px 0');

            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.enabled !== false)
                .style('cursor', 'default')
                .style('accent-color', level.color)
                .on('change', function() { level.enabled = this.checked; });

            row.append('input')
                .attr('type', 'number')
                .attr('step', drawing.type === 'fib-timezone' ? '1' : '0.001')
                .attr('value', level.value)
                .style('width', '100%')
                .style('padding', '4px 6px')
                .style('background', '#2a2e39')
                .style('border', '1px solid #363a45')
                .style('border-radius', '4px')
                .style('color', '#d1d4dc')
                .style('font-size', '11px')
                .on('input', function() {
                    const val = parseFloat(this.value);
                    if (!isNaN(val)) level.value = val;
                });

            // Compact color swatch
            const colorSwatch = row.append('div')
                .style('width', '24px')
                .style('height', '24px')
                .style('background', level.color)
                .style('border-radius', '4px')
                .style('cursor', 'default')
                .style('border', '1px solid rgba(255,255,255,0.1)')
                .on('click', function() {
                    // Simple color palette
                    const colors = ['#787b86', '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63'];
                    const current = colors.indexOf(level.color);
                    const next = colors[(current + 1) % colors.length];
                    level.color = next;
                    d3.select(this).style('background', next);
                    row.select('input[type="checkbox"]').style('accent-color', next);
                });

            // Delete button
            row.append('button')
                .style('width', '20px')
                .style('height', '20px')
                .style('padding', '0')
                .style('background', 'transparent')
                .style('border', 'none')
                .style('color', '#787b86')
                .style('cursor', 'default')
                .style('font-size', '14px')
                .html('×')
                .on('click', function() {
                    const idx = drawing.levels.indexOf(level);
                    if (idx > -1) {
                        drawing.levels.splice(idx, 1);
                        row.remove();
                    }
                });
        };

        drawing.levels.forEach((l, i) => addRow(l, i));

        // Button row
        const btnRow = section.append('div')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('margin-top', '8px');

        btnRow.append('button')
            .style('flex', '1')
            .style('padding', '6px 10px')
            .style('background', '#787b8620')
            .style('border', '1px solid #787b8640')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .text('+ Add')
            .on('click', () => {
                const newLevel = { value: 0.5, enabled: true, color: '#787b86' };
                drawing.levels.push(newLevel);
                addRow(newLevel, drawing.levels.length - 1);
            });

        btnRow.append('button')
            .style('padding', '6px 10px')
            .style('background', 'transparent')
            .style('border', '1px solid #363a45')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .text('Reset')
            .on('click', () => {
                drawing.levels = defaultLevels.map(l => ({ ...l }));
                list.selectAll('*').remove();
                drawing.levels.forEach((l, i) => addRow(l, i));
            });
    }

    /**
     * Add settings section for Pitchfork tools with levels
     */
    addPitchforkLevelsSection(container, drawing) {
        const self = this;
        const section = container.append('div')
            .attr('class', 'settings-section pitchfork-levels')
            .style('margin-top', '16px');

        section.append('h4')
            .text('Pitchfork Levels')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0 0 12px 0');

        // Default pitchfork levels matching TradingView
        const defaultLevels = [
            { value: 0.25, label: '0.25', color: '#cd853f', enabled: false },
            { value: 0.382, label: '0.382', color: '#90ee90', enabled: false },
            { value: 0.5, label: '0.5', color: '#00bcd4', enabled: true },
            { value: 0.618, label: '0.618', color: '#5f9ea0', enabled: false },
            { value: 0.75, label: '0.75', color: '#5f9ea0', enabled: false },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
            { value: 1.5, label: '1.5', color: '#9370db', enabled: false },
            { value: 1.75, label: '1.75', color: '#db7093', enabled: false },
            { value: 2, label: '2', color: '#cd5c5c', enabled: false }
        ];

        // Initialize levels if not present
        if (!Array.isArray(drawing.levels)) {
            drawing.levels = defaultLevels.map(l => ({ ...l }));
        }

        const list = section.append('div')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '6px')
            .style('max-height', '400px')
            .style('overflow-y', 'auto');

        const addRow = (level, index) => {
            const row = list.append('div')
                .style('display', 'grid')
                .style('grid-template-columns', '24px 60px 1fr 32px')
                .style('gap', '8px')
                .style('align-items', 'center');

            // Checkbox
            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.enabled)
                .style('width', '16px')
                .style('height', '16px')
                .style('cursor', 'default')
                .on('change', function() {
                    level.enabled = this.checked;
                    self.applyChangesImmediately(drawing);
                });

            // Value input
            row.append('input')
                .attr('type', 'text')
                .attr('value', level.label || level.value)
                .style('background', '#2a2e39')
                .style('border', '1px solid #363a45')
                .style('border-radius', '4px')
                .style('color', '#d1d4dc')
                .style('padding', '4px 8px')
                .style('font-size', '11px')
                .on('change', function() {
                    level.label = this.value;
                    const parsed = parseFloat(this.value);
                    if (!isNaN(parsed)) level.value = parsed;
                    self.applyChangesImmediately(drawing);
                });

            // Label (empty for pitchfork - values are shown in input)
            row.append('span')
                .text('')
                .style('font-size', '11px')
                .style('color', '#787b86');

            // Color picker
            const colorBtn = row.append('div')
                .style('width', '24px')
                .style('height', '24px')
                .style('background', level.color)
                .style('border-radius', '4px')
                .style('cursor', 'default')
                .style('border', '1px solid #363a45');

            colorBtn.on('click', function() {
                if (typeof openColorPicker === 'function') {
                    openColorPicker(level.color, (newColor) => {
                        level.color = newColor;
                        d3.select(this).style('background', newColor);
                        self.applyChangesImmediately(drawing);
                    }, this);
                }
            });
        };

        drawing.levels.forEach((l, i) => addRow(l, i));

        // Button row
        const btnRow = section.append('div')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('margin-top', '12px');

        btnRow.append('button')
            .style('padding', '6px 10px')
            .style('background', 'transparent')
            .style('border', '1px solid #363a45')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .text('+ Add Level')
            .on('click', () => {
                const newLevel = { value: 0.5, label: '0.5', color: '#787b86', enabled: true };
                drawing.levels.push(newLevel);
                addRow(newLevel, drawing.levels.length - 1);
            });

        btnRow.append('button')
            .style('padding', '6px 10px')
            .style('background', 'transparent')
            .style('border', '1px solid #363a45')
            .style('border-radius', '4px')
            .style('color', '#787b86')
            .style('font-size', '11px')
            .style('cursor', 'default')
            .text('Reset')
            .on('click', () => {
                drawing.levels = defaultLevels.map(l => ({ ...l }));
                list.selectAll('*').remove();
                drawing.levels.forEach((l, i) => addRow(l, i));
            });
    }

    /**
     * Add settings section for Channel tools with levels
     */
    addChannelLevelsSection(container, drawing) {
        const self = this;
        const section = container.append('div')
            .attr('class', 'settings-section channel-levels')
            .style('margin-top', '16px');

        section.append('h4')
            .text('Channel Settings')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0 0 12px 0');

        // Default channel levels (middle line)
        const defaultLevels = [
            { value: 0, label: 'Lower', color: drawing.style.stroke || '#2962ff', enabled: true },
            { value: 0.5, label: 'Middle', color: '#787b86', enabled: false },
            { value: 1, label: 'Upper', color: drawing.style.stroke || '#2962ff', enabled: true }
        ];

        // Initialize levels if not present
        if (!Array.isArray(drawing.levels)) {
            drawing.levels = defaultLevels.map(l => ({ ...l }));
        }

        const list = section.append('div')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '6px');

        const addRow = (level, index) => {
            const row = list.append('div')
                .style('display', 'grid')
                .style('grid-template-columns', '24px 80px 1fr 32px')
                .style('gap', '8px')
                .style('align-items', 'center');

            // Checkbox
            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.enabled)
                .style('width', '16px')
                .style('height', '16px')
                .style('cursor', 'default')
                .on('change', function() {
                    level.enabled = this.checked;
                });

            // Label
            row.append('span')
                .text(level.label)
                .style('font-size', '11px')
                .style('color', '#d1d4dc');

            // Spacer
            row.append('span');

            // Color picker
            const colorBtn = row.append('div')
                .style('width', '24px')
                .style('height', '24px')
                .style('background', level.color)
                .style('border-radius', '4px')
                .style('cursor', 'default')
                .style('border', '1px solid #363a45');

            colorBtn.on('click', function() {
                if (typeof openColorPicker === 'function') {
                    openColorPicker(level.color, (newColor) => {
                        level.color = newColor;
                        d3.select(this).style('background', newColor);
                    }, this);
                }
            });
        };

        drawing.levels.forEach((l, i) => addRow(l, i));

        // Extend options
        const extendSection = section.append('div')
            .style('margin-top', '12px')
            .style('display', 'flex')
            .style('gap', '16px');

        // Extend Left toggle
        const extendLeftLabel = extendSection.append('label')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px')
            .style('cursor', 'default')
            .style('font-size', '11px')
            .style('color', '#787b86');

        extendLeftLabel.append('input')
            .attr('type', 'checkbox')
            .property('checked', drawing.style.extendLeft || false)
            .style('width', '14px')
            .style('height', '14px')
            .on('change', function() {
                drawing.style.extendLeft = this.checked;
            });

        extendLeftLabel.append('span').text('Extend Left');

        // Extend Right toggle
        const extendRightLabel = extendSection.append('label')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px')
            .style('cursor', 'default')
            .style('font-size', '11px')
            .style('color', '#787b86');

        extendRightLabel.append('input')
            .attr('type', 'checkbox')
            .property('checked', drawing.style.extendRight || false)
            .style('width', '14px')
            .style('height', '14px')
            .on('change', function() {
                drawing.style.extendRight = this.checked;
            });

        extendRightLabel.append('span').text('Extend Right');
    }

    /**
     * Add settings section for Gann tools
     */
    addGannToolSettings(container, drawing) {
        const self = this;
        const section = container.append('div')
            .attr('class', 'settings-section gann-settings')
            .style('margin-top', '16px');

        section.append('h4')
            .text('Gann Angles')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0 0 12px 0');

        const rerenderAndSave = () => {
            if (window.drawingManager) {
                const actualDrawing = window.drawingManager.drawings.find(d => d.id === drawing.id) || drawing;
                window.drawingManager.renderDrawing(actualDrawing);
                window.drawingManager.saveDrawings();
            }
        };

        const isGannFan = drawing.type === 'gann-fan';
        let anglesArray = null;

        if (isGannFan) {
            const defaultFanLevels = [
                { value: 8, label: '1/8', enabled: true, color: '#ff9800' },
                { value: 4, label: '1/4', enabled: true, color: '#4caf50' },
                { value: 3, label: '1/3', enabled: true, color: '#00c853' },
                { value: 2, label: '1/2', enabled: true, color: '#00bcd4' },
                { value: 1, label: '1/1', enabled: true, color: '#2962ff' },
                { value: 0.5, label: '2/1', enabled: true, color: '#9c27b0' },
                { value: 1 / 3, label: '3/1', enabled: true, color: '#e91e63' },
                { value: 0.25, label: '4/1', enabled: true, color: '#f23645' },
                { value: 0.125, label: '8/1', enabled: true, color: '#b71c1c' }
            ];

            if (!drawing.style) drawing.style = {};
            if (!Array.isArray(drawing.style.fanLevels) || !drawing.style.fanLevels[0]?.color) {
                const legacyAngles = (Array.isArray(drawing.style.angles) && drawing.style.angles.length > 0)
                    ? drawing.style.angles
                    : (Array.isArray(drawing.angles) ? drawing.angles : null);

                if (legacyAngles && legacyAngles.length > 0) {
                    drawing.style.fanLevels = legacyAngles.map(a => {
                        const label = a && a.label ? `${a.label}` : '';
                        let mult = (a && a.ratio != null && isFinite(parseFloat(a.ratio))) ? parseFloat(a.ratio) : 1;
                        if (label.includes('×')) {
                            const parts = label.split('×').map(s => s.trim());
                            const n = parseFloat(parts[0]);
                            const d = parseFloat(parts[1]);
                            if (isFinite(n) && isFinite(d) && n !== 0) mult = d / n;
                        }
                        const mappedLabel = label.includes('×') ? label.replace('×', '/') : (label || '1/1');
                        return {
                            value: mult,
                            label: mappedLabel,
                            enabled: a && a.enabled !== false,
                            color: (a && a.color) ? a.color : (drawing.style.stroke || '#4caf50')
                        };
                    });
                } else {
                    drawing.style.fanLevels = defaultFanLevels.map(l => ({ ...l }));
                }
            }

            if (drawing.style.showZones === undefined) drawing.style.showZones = true;
            if (drawing.style.backgroundOpacity === undefined) drawing.style.backgroundOpacity = 0.12;

            anglesArray = drawing.style.fanLevels;
        }

        // Default Gann angles with colors
        const defaultAngles = [
            { ratio: 1/8, label: '1×8', enabled: true, color: '#787b86' },
            { ratio: 1/4, label: '1×4', enabled: true, color: '#9c27b0' },
            { ratio: 1/3, label: '1×3', enabled: true, color: '#673ab7' },
            { ratio: 1/2, label: '1×2', enabled: true, color: '#2196f3' },
            { ratio: 1, label: '1×1', enabled: true, color: '#4caf50' },
            { ratio: 2, label: '2×1', enabled: true, color: '#ffeb3b' },
            { ratio: 3, label: '3×1', enabled: true, color: '#ff9800' },
            { ratio: 4, label: '4×1', enabled: true, color: '#f44336' },
            { ratio: 8, label: '8×1', enabled: true, color: '#e91e63' }
        ];

        if (!isGannFan) {
            if (!Array.isArray(drawing.angles) || !drawing.angles[0]?.color) {
                drawing.angles = defaultAngles.map(a => ({ ...a }));
            }
            anglesArray = drawing.angles;
        }

        const list = section.append('div')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('gap', '3px')
            .style('max-height', '200px')
            .style('overflow-y', 'auto');

        (anglesArray || []).forEach((angle, idx) => {
            const row = list.append('div')
                .style('display', 'grid')
                .style('grid-template-columns', '20px 50px 28px')
                .style('align-items', 'center')
                .style('gap', '6px')
                .style('padding', '2px 0');

            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', angle.enabled !== false)
                .style('cursor', 'default')
                .style('accent-color', angle.color)
                .on('change', function() {
                    angle.enabled = this.checked;
                    if (isGannFan) rerenderAndSave();
                });

            row.append('span')
                .text(angle.label)
                .style('color', angle.color)
                .style('font-size', '12px')
                .style('font-weight', '500');

            // Color swatch
            row.append('div')
                .style('width', '24px')
                .style('height', '24px')
                .style('background', angle.color)
                .style('border-radius', '4px')
                .style('cursor', 'default')
                .style('border', '1px solid rgba(255,255,255,0.1)')
                .on('click', function() {
                    const colors = ['#787b86', '#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#e91e63'];
                    const current = colors.indexOf(angle.color);
                    const next = colors[(current + 1) % colors.length];
                    angle.color = next;
                    d3.select(this).style('background', next);
                    row.select('span').style('color', next);
                    row.select('input').style('accent-color', next);
                    if (isGannFan) rerenderAndSave();
                });
        });

        if (isGannFan) {
            section.append('div')
                .style('margin-top', '12px')
                .style('padding-top', '12px')
                .style('border-top', '1px solid #363a45');

            const zonesLabel = section.append('label')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '6px')
                .style('cursor', 'default')
                .style('font-size', '11px')
                .style('color', '#787b86')
                .style('margin-bottom', '10px');

            zonesLabel.append('input')
                .attr('type', 'checkbox')
                .property('checked', drawing.style.showZones !== false)
                .style('width', '14px')
                .style('height', '14px')
                .on('change', function() {
                    drawing.style.showZones = this.checked;
                    rerenderAndSave();
                });

            zonesLabel.append('span').text('Show Zones');

            this.addSlider(section, 'Zones Opacity', drawing.style.backgroundOpacity != null ? drawing.style.backgroundOpacity : 0.12, 0, 1, (value) => {
                drawing.style.backgroundOpacity = value;
                rerenderAndSave();
            }, 0.01);
        }

        // Grid divisions for Gann Square
        if (drawing.type === 'gann-square' || drawing.type === 'gann-square-fixed') {
            section.append('div')
                .style('margin-top', '12px')
                .style('padding-top', '12px')
                .style('border-top', '1px solid #363a45');

            this.addSlider(section, 'Grid Divisions', drawing.gridDivisions || 4, 2, 10, (val) => {
                drawing.gridDivisions = val;
            }, 1);
        }
    }

    /**
     * Add settings section for Fib Time Zone
     */
    addFibTimeZoneSettings(container, drawing) {
        const section = container.append('div')
            .attr('class', 'settings-section fib-timezone-settings')
            .style('margin-top', '16px');

        section.append('h4')
            .text('Fibonacci Numbers')
            .style('font-size', '13px')
            .style('font-weight', '600')
            .style('color', '#d1d4dc')
            .style('margin', '0 0 12px 0');

        // Standard Fibonacci sequence with colors
        const defaultFibNumbers = [
            { value: 0, enabled: false, color: '#787b86' },
            { value: 1, enabled: true, color: '#f23645' },
            { value: 2, enabled: true, color: '#ff9800' },
            { value: 3, enabled: true, color: '#ffeb3b' },
            { value: 5, enabled: true, color: '#4caf50' },
            { value: 8, enabled: true, color: '#00bcd4' },
            { value: 13, enabled: true, color: '#2962ff' },
            { value: 21, enabled: true, color: '#9c27b0' },
            { value: 34, enabled: true, color: '#e91e63' },
            { value: 55, enabled: false, color: '#673ab7' },
            { value: 89, enabled: false, color: '#3f51b5' },
            { value: 144, enabled: false, color: '#607d8b' }
        ];
        
        if (!Array.isArray(drawing.fibNumbers) || typeof drawing.fibNumbers[0] === 'number') {
            drawing.fibNumbers = defaultFibNumbers.map(n => ({ ...n }));
        }

        const list = section.append('div')
            .style('display', 'flex')
            .style('flex-wrap', 'wrap')
            .style('gap', '6px');

        drawing.fibNumbers.forEach((fib, idx) => {
            const chip = list.append('label')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('justify-content', 'center')
                .style('min-width', '36px')
                .style('padding', '6px 10px')
                .style('background', fib.enabled ? fib.color : '#2a2e39')
                .style('border', '1px solid ' + (fib.enabled ? fib.color : '#363a45'))
                .style('border-radius', '4px')
                .style('cursor', 'default')
                .style('font-size', '12px')
                .style('font-weight', '500')
                .style('color', fib.enabled ? '#fff' : '#787b86')
                .style('transition', 'all 0.15s');

            chip.append('input')
                .attr('type', 'checkbox')
                .property('checked', fib.enabled)
                .style('display', 'none')
                .on('change', function() {
                    fib.enabled = this.checked;
                    chip.style('background', fib.enabled ? fib.color : '#2a2e39')
                        .style('border-color', fib.enabled ? fib.color : '#363a45')
                        .style('color', fib.enabled ? '#fff' : '#787b86');
                });

            chip.append('span').text(fib.value);
        });
    }

    /**
     * Add select dropdown to panel
     */
    addSelect(container, label, options, initialValue, onChange) {
        const row = container.append('div')
            .style('margin-bottom', '12px');

        row.append('label')
            .text(label);

        const select = row.append('select')
            .on('change', function() {
                onChange(this.value);
            });

        options.forEach(opt => {
            select.append('option')
                .attr('value', opt.value)
                .property('selected', opt.value === initialValue)
                .text(opt.label);
        });
    }

    /**
     * Convert rgba to hex
     */
    rgbaToHex(rgba) {
        if (!rgba || rgba.startsWith('#')) return rgba || '#000000';
        
        const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return '#000000';
        
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Hide the panel
     */
    hide() {
        // Store reference to current drawing before clearing
        const drawingToRestore = this.currentDrawing;
        
        // Remove click outside handler
        if (this.clickOutsideHandler) {
            document.removeEventListener('mousedown', this.clickOutsideHandler, true);
            this.clickOutsideHandler = null;
        }
        
        // Remove TV modal if it exists
        const tvModal = document.querySelector('.tv-settings-modal');
        if (tvModal) {
            // Clean up external dropdowns first
            if (tvModal.externalDropdowns) {
                tvModal.externalDropdowns.forEach(d => d.remove());
            }
            tvModal.remove();
        }
        
        // Also remove any orphaned external dropdowns
        document.querySelectorAll('.tv-external-dropdown').forEach(d => d.remove());
        
        // Remove TV color picker if it exists
        const tvColorPicker = document.querySelector('.tv-color-picker');
        if (tvColorPicker) tvColorPicker.remove();
        
        // Destroy all color palettes (they are appended to body)
        if (this.colorControls) {
            this.colorControls.forEach(control => {
                if (control.destroy) {
                    control.destroy();
                }
            });
        }
        if (this.panel) {
            if (this.panel.remove) this.panel.remove();
            else if (this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
            this.panel = null;
        }
        this.currentDrawing = null;
        this.colorControls = [];
        this.pendingChanges = {};
        document.removeEventListener('click', this.handleDocumentClick, true);
        
        // Restore toolbar if drawing is still selected
        if (drawingToRestore && this.toolbarManager && drawingToRestore.group) {
            const bbox = drawingToRestore.group.node().getBBox();
            const svgRect = drawingToRestore.group.node().ownerSVGElement.getBoundingClientRect();
            
            const x = svgRect.left + bbox.x + (bbox.width / 2);
            const y = svgRect.top + bbox.y;
            
            this.toolbarManager.show(drawingToRestore, x, y);
        }
    }

    ensureColorPickerStyles() {
        if (!this.panel) return;
        if (this.panel.select('#drawing-color-picker-styles').node()) return;

        this.panel.insert('style', ':first-child')
            .attr('id', 'drawing-color-picker-styles')
            .text(`
                .drawing-style-editor .drawing-settings-color-row {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .drawing-style-editor .drawing-color-control {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .drawing-style-editor .drawing-color-preview-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .drawing-style-editor .drawing-color-preview {
                    width: 28px;
                    height: 28px;
                    border-radius: 4px;
                    border: 2px solid #363a45;
                    cursor: default;
                    transition: border-color 0.2s;
                }
                .drawing-style-editor .drawing-color-preview:hover {
                    border-color: #787b86;
                }
                .drawing-style-editor .drawing-color-value {
                    color: #d1d4dc;
                    font-size: 12px;
                    font-weight: 500;
                    min-width: 110px;
                }
                .drawing-color-palette {
                    position: fixed;
                    background: #2a2e39;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
                    padding: 16px;
                    display: none;
                    flex-direction: column;
                    z-index: 100000;
                    min-width: 280px;
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .drawing-color-palette.active {
                    display: flex;
                }
                .drawing-color-palette .drawing-color-grid {
                    display: grid;
                    grid-template-columns: repeat(10, 1fr);
                    gap: 4px;
                    margin-bottom: 0;
                }
                .drawing-color-palette .drawing-color-swatch {
                    width: 22px;
                    height: 22px;
                    border-radius: 3px;
                    cursor: default;
                    border: 2px solid transparent;
                    transition: all 0.15s;
                }
                .drawing-color-palette .drawing-color-swatch:hover {
                    transform: scale(1.1);
                    border-color: #ffffff;
                }
                .drawing-color-palette .drawing-color-swatch.selected {
                    border-color: #ffffff;
                    box-shadow: 0 0 0 1px #2a2e39, 0 0 0 3px #ffffff;
                }
                .drawing-color-palette .drawing-color-divider {
                    height: 1px;
                    background: #3a3e49;
                    margin: 12px 0;
                }
                .drawing-color-palette .drawing-color-recent {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .drawing-color-palette .drawing-color-recent-items {
                    display: flex;
                    gap: 6px;
                }
                .drawing-color-palette .drawing-color-add {
                    width: 22px;
                    height: 22px;
                    border-radius: 3px;
                    background: #3a3e49;
                    border: 1px dashed #5a5e69;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: default;
                    color: #8a8e99;
                    font-size: 18px;
                    transition: all 0.15s;
                }
                .drawing-color-palette .drawing-color-add:hover {
                    background: #4a4e59;
                    border-color: #7a7e89;
                    color: #ffffff;
                }
                .drawing-color-palette .drawing-color-opacity {
                    margin-top: 12px;
                }
                .drawing-color-palette .drawing-color-opacity-label {
                    color: #8a8e99;
                    font-size: 12px;
                    margin-bottom: 8px;
                    display: block;
                }
                .drawing-color-palette .drawing-color-opacity-control {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .drawing-color-palette .drawing-color-opacity-slider {
                    flex: 1;
                    -webkit-appearance: none;
                    appearance: none;
                    height: 6px;
                    border-radius: 3px;
                    background: linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,1));
                    outline: none;
                    cursor: default;
                }
                .drawing-color-palette .drawing-color-opacity-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                .drawing-color-palette .drawing-color-opacity-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                .drawing-color-palette .drawing-color-opacity-value {
                    color: #d1d4dc;
                    font-size: 12px;
                    font-weight: 500;
                    min-width: 40px;
                    text-align: right;
                }
            `);
    }

    closeAllPalettes(exceptControl = null) {
        // No longer needed - using global ColorPicker
    }

    handleDocumentClick(event) {
        if (!this.panel) return;
        const panelNode = this.panel.node();
        
        if (!panelNode.contains(event.target)) {
            // Click outside panel
        }
    }

    toggleKeepDrawing() {
        this.keepDrawingEnabled = !this.keepDrawingEnabled;
        this.saveKeepDrawingState();
    }

    saveKeepDrawingState() {
        try {
            window.localStorage.setItem('chart_keep_drawing', this.keepDrawingEnabled ? '1' : '0');
        } catch (err) {
            console.warn('Failed to persist keep drawing state', err);
        }
    }

    loadKeepDrawingState() {
        try {
            const stored = window.localStorage.getItem('chart_keep_drawing');
            if (stored === '1') return true;
            if (stored === '0') return false;
        } catch (err) {
            console.warn('Failed to read keep drawing state', err);
        }
        return true;
    }

    isKeepDrawingEnabled() {
        return !!this.keepDrawingEnabled;
    }

    /**
     * Add Gann Box specific settings with price/time levels
     */
    addGannBoxSettings(stylePane, coordPane, visPane, drawing) {
        const style = drawing.style || {};

        const self = this;
        const triggerUpdate = () => {
            if (self.onUpdate) {
                self.onUpdate(drawing);
            } else if (window.drawingManager) {
                window.drawingManager.renderDrawing(drawing);
                window.drawingManager.saveDrawings();
            }
        };
        
        // STYLE TAB - Price and Time Levels
        // Ensure levels exist with defaults
        if (!style.priceLevels || style.priceLevels.length === 0) {
            style.priceLevels = [
                { value: 0, enabled: true, color: '#787b86' },
                { value: 0.25, enabled: true, color: '#787b86' },
                { value: 0.5, enabled: true, color: '#787b86' },
                { value: 0.75, enabled: true, color: '#787b86' },
                { value: 1, enabled: true, color: '#787b86' }
            ];
        }
        
        if (!style.timeLevels || style.timeLevels.length === 0) {
            style.timeLevels = [
                { value: 0, enabled: true, color: '#787b86' },
                { value: 0.25, enabled: true, color: '#787b86' },
                { value: 0.382, enabled: true, color: '#787b86' },
                { value: 0.5, enabled: true, color: '#787b86' },
                { value: 0.618, enabled: true, color: '#787b86' },
                { value: 0.75, enabled: true, color: '#787b86' },
                { value: 1, enabled: true, color: '#787b86' }
            ];
        }
        
        const priceLevels = style.priceLevels;
        const timeLevels = style.timeLevels;
        
        // Price Levels Section
        const priceSection = stylePane.append('div')
            .attr('class', 'settings-section')
            .style('margin-top', '12px');
        
        priceSection.append('label')
            .text('PRICE LEVELS');
        
        priceLevels.forEach((level, index) => {
            const levelRow = priceSection.append('div')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '8px')
                .style('margin-bottom', '8px');
            
            // Checkbox
            levelRow.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.enabled)
                .style('width', '16px')
                .style('height', '16px')
                .on('change', function() {
                    level.enabled = this.checked;
                    triggerUpdate();
                });
            
            // Value input
            levelRow.append('input')
                .attr('type', 'number')
                .attr('step', '0.01')
                .attr('min', '0')
                .attr('max', '1')
                .property('value', level.value)
                .style('flex', '1')
                .style('padding', '6px 8px')
                .on('input', function() {
                    level.value = parseFloat(this.value) || 0;
                    triggerUpdate();
                });
            
            // Color picker button
            const colorBtn = levelRow.append('button')
                .attr('class', 'tv-color-btn')
                .style('width', '32px')
                .style('height', '32px')
                .style('background', level.color)
                .style('border-radius', '4px')
                .style('border', '1px solid #363a45')
                .style('cursor', 'default')
                .node();
            
            colorBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof openColorPicker === 'function') {
                    openColorPicker(level.color, (newColor) => {
                        level.color = newColor;
                        colorBtn.style.background = newColor;
                        triggerUpdate();
                    }, colorBtn);
                }
            };
        });
        
        // Time Levels Section
        const timeSection = stylePane.append('div')
            .attr('class', 'settings-section')
            .style('margin-top', '20px');
        
        timeSection.append('label')
            .text('TIME LEVELS');
        
        timeLevels.forEach((level, index) => {
            const levelRow = timeSection.append('div')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '8px')
                .style('margin-bottom', '8px');
            
            // Checkbox
            levelRow.append('input')
                .attr('type', 'checkbox')
                .property('checked', level.enabled)
                .style('width', '16px')
                .style('height', '16px')
                .on('change', function() {
                    level.enabled = this.checked;
                    triggerUpdate();
                });
            
            // Value input
            levelRow.append('input')
                .attr('type', 'number')
                .attr('step', '0.001')
                .attr('min', '0')
                .attr('max', '1')
                .property('value', level.value)
                .style('flex', '1')
                .style('padding', '6px 8px')
                .on('input', function() {
                    level.value = parseFloat(this.value) || 0;
                    triggerUpdate();
                });
            
            // Color picker button
            const colorBtn = levelRow.append('button')
                .attr('class', 'tv-color-btn')
                .style('width', '32px')
                .style('height', '32px')
                .style('background', level.color)
                .style('border-radius', '4px')
                .style('border', '1px solid #363a45')
                .style('cursor', 'default')
                .node();
            
            colorBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof openColorPicker === 'function') {
                    openColorPicker(level.color, (newColor) => {
                        level.color = newColor;
                        colorBtn.style.background = newColor;
                        triggerUpdate();
                    }, colorBtn);
                }
            };
        });
        
        // VISIBILITY TAB - Label toggles
        const labelSection = visPane.append('div')
            .attr('class', 'settings-section')
            .style('margin-top', '12px');
        
        labelSection.append('label')
            .text('LABELS');
        
        const labelOptions = [
            { key: 'showLeftLabels', label: 'Left labels' },
            { key: 'showRightLabels', label: 'Right labels' },
            { key: 'showTopLabels', label: 'Top labels' },
            { key: 'showBottomLabels', label: 'Bottom labels' }
        ];
        
        labelOptions.forEach(opt => {
            const row = labelSection.append('div')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '8px')
                .style('margin-bottom', '8px');
            
            row.append('input')
                .attr('type', 'checkbox')
                .property('checked', style[opt.key] !== undefined ? style[opt.key] : true)
                .style('width', '16px')
                .style('height', '16px')
                .on('change', function() {
                    style[opt.key] = this.checked;
                    triggerUpdate();
                });
            
            row.append('label')
                .text(opt.label)
                .style('margin', '0')
                .style('text-transform', 'none')
                .style('font-size', '13px');
        });
        
        // COORDINATES TAB - Point coordinates with price values
        const point1 = drawing.points[0];
        const point2 = drawing.points[1];
        
        const coord1Section = coordPane.append('div')
            .attr('class', 'settings-section')
            .style('margin-top', '12px');
        
        coord1Section.append('label')
            .style('display', 'block')
            .style('margin-bottom', '8px')
            .style('font-weight', '600')
            .text('Point 1');
        
        coord1Section.append('div')
            .html(`<span style="color: #9aa1b5;">Price:</span> <span style="color: #d1d4dc;">${point1.y ? point1.y.toFixed(5) : 'N/A'}</span>`);
        
        const coord2Section = coordPane.append('div')
            .attr('class', 'settings-section')
            .style('margin-top', '16px');
        
        coord2Section.append('label')
            .style('display', 'block')
            .style('margin-bottom', '8px')
            .style('font-weight', '600')
            .text('Point 2');
        
        coord2Section.append('div')
            .html(`<span style="color: #9aa1b5;">Price:</span> <span style="color: #d1d4dc;">${point2.y ? point2.y.toFixed(5) : 'N/A'}</span>`);
        
        // Add Apply/Close buttons to each tab
        const addButtons = (pane) => {
            const btnRow = pane.append('div')
                .style('display', 'flex')
                .style('gap', '8px')
                .style('margin-top', '20px');
            
            btnRow.append('button')
                .attr('class', 'settings-btn settings-btn-save')
                .text('Apply')
                .on('click', () => {
                    if (this.onSave) {
                        this.onSave(drawing);
                    }
                    this.hide();
                });
            
            btnRow.append('button')
                .attr('class', 'settings-btn settings-btn-close')
                .text('Close')
                .on('click', () => this.hide());
        };
        
        addButtons(stylePane);
        addButtons(coordPane);
        addButtons(visPane);
    }
}

// ============================================================================
// Inline Text Editor (for quick text editing)
// ============================================================================
class InlineTextEditor {
    constructor() {
        this.editor = null;
        this.onSave = null;
        this.hiddenTargets = null;
        this.hideStyleEl = null;
    }

    /**
     * Show inline editor at position (TradingView style - no buttons)
     */
    show(x, y, initialText, onSave, placeholder = 'Enter text…', options = null) {
        this.onSave = onSave;

        const opts = options || {};
        const width = Math.max(30, Number.isFinite(opts.width) ? opts.width : 170);
        const minHeight = Math.max(20, Number.isFinite(opts.height) ? opts.height : 22);
        const padding = typeof opts.padding === 'string' ? opts.padding : '6px 8px';
        const fontSize = typeof opts.fontSize === 'string' ? opts.fontSize : '14px';
        const fontFamily = typeof opts.fontFamily === 'string' ? opts.fontFamily : 'inherit';
        const fontWeight = typeof opts.fontWeight === 'string' ? opts.fontWeight : 'normal';
        const color = typeof opts.color === 'string' ? opts.color : '#d1d4dc';
        const textAlign = typeof opts.textAlign === 'string' ? opts.textAlign : 'left';

        // Remove existing editor
        if (this.editor) {
            this.editor.remove();
        }

        if (this.hiddenTargets && this.hiddenTargets.length) {
            this.hiddenTargets.forEach((t) => {
                if (t && t.node && t.prevVisibility !== undefined) {
                    t.node.style.visibility = t.prevVisibility;
                }
            });
            this.hiddenTargets = null;
        }

        if (this.hideStyleEl) {
            this.hideStyleEl.remove();
            this.hideStyleEl = null;
        }

        if (Array.isArray(opts.hideTargets) && opts.hideTargets.length) {
            this.hiddenTargets = opts.hideTargets
                .filter((n) => n && n.style)
                .map((n) => ({ node: n, prevVisibility: n.style.visibility }));
            this.hiddenTargets.forEach((t) => {
                t.node.style.visibility = 'hidden';
            });
        }

        if (typeof opts.hideSelector === 'string' && opts.hideSelector.trim()) {
            this.hideStyleEl = document.createElement('style');
            this.hideStyleEl.id = 'inline-text-editor-hide-style';
            this.hideStyleEl.textContent = `${opts.hideSelector} { visibility: hidden !important; }`;
            document.head.appendChild(this.hideStyleEl);
        }

        // Create editor - simple textarea only
        this.editor = d3.select('body')
            .append('div')
            .attr('class', 'inline-text-editor')
            .style('position', 'absolute')
            .style('left', `${x}px`)
            .style('top', `${y}px`)
            .style('z-index', '2000')
            .style('background', 'transparent')
            .style('border', 'none')
            .style('backdrop-filter', 'none')
            .style('-webkit-backdrop-filter', 'none')
            .style('border-radius', '0')
            .style('padding', '0')
            .style('box-shadow', 'none');

        const textarea = this.editor.append('textarea')
            .style('width', `${width}px`)
            .style('min-height', `${minHeight}px`)
            .style('height', 'auto')
            .style('resize', 'none')
            .style('padding', padding)
            .style('box-sizing', 'border-box')
            .style('background', 'rgba(30, 34, 45, 0.78)')
            .style('color', color)
            .style('border', '1px solid rgba(54, 58, 69, 0.9)')
            .style('border-radius', '4px')
            .style('outline', 'none')
            .style('font-size', fontSize)
            .style('font-family', fontFamily)
            .style('font-weight', fontWeight)
            .style('text-align', textAlign)
            .style('box-shadow', '0 1px 8px rgba(0, 0, 0, 0.32)')
            .attr('placeholder', placeholder)
            .property('value', initialText)
            .on('focus', function() {
                d3.select(this)
                    .style('border-color', 'rgba(41, 98, 255, 0.7)')
                    .style('box-shadow', '0 0 0 2px rgba(41, 98, 255, 0.15), 0 1px 8px rgba(0, 0, 0, 0.32)');
            })
            .on('blur', function() {
                d3.select(this)
                    .style('border-color', 'rgba(54, 58, 69, 0.9)')
                    .style('box-shadow', '0 1px 8px rgba(0, 0, 0, 0.32)');
            })
            .on('keydown', (event) => {
                // Stop propagation for all keys to prevent chart shortcuts
                event.stopPropagation();
                
                if (event.key === 'Enter' && !event.shiftKey) {
                    // Enter saves (Shift+Enter for newline)
                    this.save();
                    event.preventDefault();
                } else if (event.key === 'Escape') {
                    this.hide();
                    event.preventDefault();
                }
            })
            .on('input', function() {
                // Auto-resize height
                this.style.height = 'auto';
                this.style.height = this.scrollHeight + 'px';
            });

        // Auto-focus
        const textareaNode = textarea.node();
        textareaNode.focus();
        textareaNode.select();
        
        // Auto-resize on load
        textareaNode.style.height = 'auto';
        textareaNode.style.height = textareaNode.scrollHeight + 'px';

        // Click outside to save
        this.clickOutsideHandler = (event) => {
            if (this.editor && !this.editor.node().contains(event.target)) {
                this.save();
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', this.clickOutsideHandler);
        }, 100);

        return this.editor;
    }

    /**
     * Save and close editor
     */
    save() {
        if (this.editor && this.onSave) {
            const textarea = this.editor.select('textarea');
            const text = textarea.property('value');
            this.onSave(text);
        }
        this.hide();
    }

    /**
     * Hide the editor
     */
    hide() {
        // Remove click outside listener
        if (this.clickOutsideHandler) {
            document.removeEventListener('mousedown', this.clickOutsideHandler);
            this.clickOutsideHandler = null;
        }
        if (this.hiddenTargets && this.hiddenTargets.length) {
            this.hiddenTargets.forEach((t) => {
                if (t && t.node && t.prevVisibility !== undefined) {
                    t.node.style.visibility = t.prevVisibility;
                }
            });
            this.hiddenTargets = null;
        }

        if (this.hideStyleEl) {
            this.hideStyleEl.remove();
            this.hideStyleEl = null;
        }
        if (this.editor) {
            this.editor.remove();
            this.editor = null;
        }
        this.onSave = null;
    }
}

// ============================================================================
// Drawing Context Menu - TradingView Style
// ============================================================================
class DrawingContextMenu {
    constructor() {
        this.menu = null;
        this.injectStyles();
    }

    /**
     * Inject CSS styles for context menu
     */
    injectStyles() {
        if (document.getElementById('drawing-context-menu-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'drawing-context-menu-styles';
        style.textContent = `
            .tv-context-menu {
                position: fixed;
                background: #ffffff;
                border-radius: 8px;
                border: 1px solid #e0e3eb;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                padding: 8px;
                min-width: 220px;
                z-index: 100000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                font-size: 13px;
                animation: tvMenuFadeIn 0.15s ease-out;
                user-select: none;
            }
            
            @keyframes tvMenuFadeIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .tv-context-menu-item {
                display: flex;
                align-items: center;
                padding: 10px 16px;
                cursor: default;
                color: #131722;
                transition: all 0.15s ease;
                gap: 10px;
                font-size: 13px;
                font-weight: 400;
            }
            
            .tv-context-menu-item:hover {
                background: rgba(41, 98, 255, 0.12);
                color: #2962ff;
            }
            
            .tv-context-menu-item.danger {
                color: #f23645;
            }
            
            .tv-context-menu-item.danger:hover {
                background: #ffebee;
            }
            
            .tv-context-menu-icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #787b86;
                flex-shrink: 0;
            }
            
            .tv-context-menu-item:hover .tv-context-menu-icon {
                color: #131722;
            }
            
            .tv-context-menu-item.danger .tv-context-menu-icon {
                color: #f23645;
            }
            
            .tv-context-menu-label {
                flex: 1;
            }
            
            .tv-context-menu-shortcut {
                color: #b2b5be;
                font-size: 12px;
                margin-left: auto;
            }
            
            .tv-context-menu-arrow {
                color: #b2b5be;
                margin-left: 8px;
            }
            
            .tv-context-menu-divider {
                height: 1px;
                background: #e0e3eb;
                margin: 6px 0;
            }
            
            /* Dark mode */
            body.dark-mode .tv-context-menu,
            body:not(.light-mode) .tv-context-menu {
                background: linear-gradient(180deg, #0b0b0d 0%, #000000 100%);
                border: 1px solid rgba(50, 50, 60, 0.9);
                border-radius: 8px;
                padding: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            body.dark-mode .tv-context-menu-item,
            body:not(.light-mode) .tv-context-menu-item {
                color: #d1d4dc;
            }
            
            body.dark-mode .tv-context-menu-item:hover,
            body:not(.light-mode) .tv-context-menu-item:hover {
                background: rgba(41, 98, 255, 0.15);
                border-radius: 4px;
                color: #ffffff;
            }
            
            body.dark-mode .tv-context-menu-item.danger:hover,
            body:not(.light-mode) .tv-context-menu-item.danger:hover {
                background: rgba(242, 54, 69, 0.15);
            }
            
            body.dark-mode .tv-context-menu-icon,
            body:not(.light-mode) .tv-context-menu-icon {
                color: #787b86;
            }
            
            body.dark-mode .tv-context-menu-item:hover .tv-context-menu-icon,
            body:not(.light-mode) .tv-context-menu-item:hover .tv-context-menu-icon {
                color: #d1d4dc;
            }
            
            body.dark-mode .tv-context-menu-divider,
            body:not(.light-mode) .tv-context-menu-divider {
                background: rgba(255, 255, 255, 0.08);
            }
            
            body.dark-mode .tv-context-menu-shortcut,
            body:not(.light-mode) .tv-context-menu-shortcut {
                color: #6a6d78;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * SVG Icons
     */
    getIcon(name) {
        const icons = {
            clone: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M4 12H3a1 1 0 01-1-1V3a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.2"/>
            </svg>`,
            copy: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M4 12H3a1 1 0 01-1-1V3a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.2"/>
            </svg>`,
            lock: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="8" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M6 8V5a3 3 0 016 0v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>`,
            unlock: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="8" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M6 8V5a3 3 0 015.9-.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>`,
            hide: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 9s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="1.2"/>
                <line x1="3" y1="15" x2="15" y2="3" stroke="currentColor" stroke-width="1.2"/>
            </svg>`,
            show: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 9s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="1.2"/>
            </svg>`,
            remove: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5h12M7 5V4a1 1 0 011-1h2a1 1 0 011 1v1m2 0v10a1 1 0 01-1 1H6a1 1 0 01-1-1V5h10z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>`,
            settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>`,
            layers: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 2L2 6l7 4 7-4-7-4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                <path d="M2 9l7 4 7-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12l7 4 7-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            tree: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
                <rect x="10" y="7" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
                <rect x="10" y="12" width="5" height="4" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
                <path d="M7 4h2v10H7M9 9h1M9 14h1" stroke="currentColor" stroke-width="1.2"/>
            </svg>`,
            arrow: `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M2 1l4 3-4 3V1z"/>
            </svg>`
        };
        return icons[name] || '';
    }

    /**
     * Get readable drawing type name
     */
    getDrawingTypeName(type) {
        const names = {
            'trendline': 'Trend Line',
            'horizontal': 'Horizontal Line',
            'vertical': 'Vertical Line',
            'ray': 'Ray',
            'rectangle': 'Rectangle',
            'ellipse': 'Ellipse',
            'circle': 'Circle',
            'triangle': 'Triangle',
            'arrow': 'Arrow',
            'text': 'Text',
            'label': 'Label',
            'fibonacci-retracement': 'Fib Retracement',
            'fibonacci-extension': 'Fib Extension',
            'ruler': 'Ruler',
            'brush': 'Brush',
            'path': 'Path',
            'long-position': 'Long Position',
            'short-position': 'Short Position'
        };
        return names[type] || type;
    }

    /**
     * Show context menu for a drawing
     */
    show(x, y, drawing, actions) {
        // Remove existing menu
        this.hide();
        
        // Close all other dropdowns and menus first
        const templateDropdown = document.querySelector('.settings-template-dropdown');
        if (templateDropdown) templateDropdown.remove();
        
        const floatingDropdown = document.querySelector('#template-dropdown');
        if (floatingDropdown) floatingDropdown.classList.remove('active');
        
        document.querySelectorAll('.toolbar-dropdown.active').forEach(d => d.classList.remove('active'));
        
        const typeName = this.getDrawingTypeName(drawing.type);

        // Create menu container
        this.menu = document.createElement('div');
        this.menu.className = 'tv-context-menu';
        
        // Bring to Front
        if (actions.bringToFront) {
            this.addMenuItem(this.getIcon('layers'), 'Bring to Front', () => {
                actions.bringToFront(drawing);
                this.hide();
            });
        }
        
        // Send to Back
        if (actions.sendToBack) {
            this.addMenuItem(this.getIcon('layers'), 'Send to Back', () => {
                actions.sendToBack(drawing);
                this.hide();
            });
        }
        
        // Object Tree option
        this.addMenuItem(this.getIcon('tree'), 'Object Tree...', () => {
            // Toggle object tree panel
            const objectTree = document.querySelector('.object-tree-panel');
            if (objectTree) {
                objectTree.style.display = objectTree.style.display === 'none' ? 'flex' : 'none';
            }
            this.hide();
        });
        
        this.addDivider();
        
        // Clone option
        if (actions.duplicate) {
            this.addMenuItem(this.getIcon('clone'), 'Clone', () => {
                actions.duplicate(drawing);
                this.hide();
            }, '⌘ Drag');
        }
        
        // Copy option
        if (actions.copy) {
            this.addMenuItem(this.getIcon('copy'), 'Copy', () => {
                actions.copy(drawing);
                this.hide();
            }, '⌘ C');
        }
        
                
        // Add to body
        document.body.appendChild(this.menu);
        
        // Position menu (ensure it stays within viewport)
        const menuRect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let menuX = x;
        let menuY = y;
        
        if (x + menuRect.width > viewportWidth) {
            menuX = viewportWidth - menuRect.width - 10;
        }
        if (y + menuRect.height > viewportHeight) {
            menuY = viewportHeight - menuRect.height - 10;
        }
        
        this.menu.style.left = `${menuX}px`;
        this.menu.style.top = `${menuY}px`;

        // Close on click outside - use capture phase to ensure it fires before other handlers
        requestAnimationFrame(() => {
            document.addEventListener('click', this.handleOutsideClick, true);
            document.addEventListener('contextmenu', this.handleOutsideClick, true);
        });
        
        return this.menu;
    }
    
    /**
     * Handle click outside menu
     */
    handleOutsideClick = (e) => {
        if (this.menu && !this.menu.contains(e.target)) {
            this.hide();
        }
    };

    /**
     * Add menu item
     */
    addMenuItem(icon, label, onClick, shortcut = null, hasSubmenu = false, isDanger = false) {
        const item = document.createElement('div');
        item.className = 'tv-context-menu-item' + (isDanger ? ' danger' : '');
        
        // Icon
        if (icon) {
            const iconEl = document.createElement('span');
            iconEl.className = 'tv-context-menu-icon';
            iconEl.innerHTML = icon;
            item.appendChild(iconEl);
        } else {
            // Empty space for alignment
            const spacer = document.createElement('span');
            spacer.style.width = '18px';
            item.appendChild(spacer);
        }
        
        // Label
        const labelEl = document.createElement('span');
        labelEl.className = 'tv-context-menu-label';
        labelEl.textContent = label;
        item.appendChild(labelEl);
        
        // Shortcut or submenu arrow
        if (hasSubmenu) {
            const arrowEl = document.createElement('span');
            arrowEl.className = 'tv-context-menu-arrow';
            arrowEl.innerHTML = this.getIcon('arrow');
            item.appendChild(arrowEl);
        } else if (shortcut) {
            const shortcutEl = document.createElement('span');
            shortcutEl.className = 'tv-context-menu-shortcut';
            shortcutEl.textContent = shortcut;
            item.appendChild(shortcutEl);
        }
        
        if (onClick) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
            });
        }
        
        this.menu.appendChild(item);
    }
    
    /**
     * Add divider
     */
    addDivider() {
        const divider = document.createElement('div');
        divider.className = 'tv-context-menu-divider';
        this.menu.appendChild(divider);
    }

    /**
     * Hide context menu
     */
    hide() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        document.removeEventListener('click', this.handleOutsideClick, true);
        document.removeEventListener('contextmenu', this.handleOutsideClick, true);
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DrawingSettingsPanel,
        InlineTextEditor,
        DrawingContextMenu
    };
}
