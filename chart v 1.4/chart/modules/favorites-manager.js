/**
 * Favorites Manager - TradingView Style
 * Manages favorite drawing tools with localStorage persistence
 */

/**
 * SR-03 focus routing: host chrome resolves "the chart" through the focus
 * provider — last click / focus, never hover. Installed idempotently in each
 * participating file because the shipping shells load them in different orders
 * (this file runs before chart.js in dist-v9/index.html) and
 * multichart-prod/chart-embed.html never loads chart.js at all.
 *
 * The `window.chart || window.mainChart` chain collapses INTO this resolver
 * rather than surviving beside it: window.mainChart is written exactly once, in
 * chart.js _talariaInitializeChart, on the line after window.chart and to the
 * same object, so the chain could never name a different chart.
 */
if (typeof window !== 'undefined' && typeof window.__talariaActiveChartV1 !== 'function') {
    window.__talariaActiveChartV1 = function talariaActiveChartV1() {
        // Re-read on EVERY call, never captured at registration, so the switch
        // can be flipped mid-session with no reload. Truthy disables.
        if (window.__TALARIA_DISABLE_FOCUS_ROUTING_V1) {
            return window.chart || window.mainChart || null;
        }
        if (typeof window.getActiveChart === 'function') {
            try {
                const active = window.getActiveChart();
                if (active) return active;
            } catch (_e) { /* provider threw: fall back to the host chart */ }
        }
        return window.chart || null;
    };
}

class FavoritesManager {
    constructor(chart) {
        this.chart = chart;
        this.favorites = [];
        this.toolbarElement = document.getElementById('favoritesTools');
        this.toolbar = document.getElementById('favoritesToolbar');
        this.storageKey = 'chart_favorite_tools';
        this.positionKey = 'chart_favorites_position';
        this.visibilityKey = 'chart_favorites_visible';
        
        // Drag state
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        
        // Visibility state
        this.isVisible = true;
        
        // Tool definitions with icons (SVG paths)
        this.toolDefinitions = {
            'trendline': {
                name: 'Trendline',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="18" x2="20" y2="6" stroke-linecap="round"/><circle cx="4" cy="18" r="2" fill="currentColor"/><circle cx="20" cy="6" r="2" fill="currentColor"/></svg>',
                tooltip: 'Trendline (T)'
            },
            'horizontal': {
                name: 'Horizontal Line',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12" stroke-linecap="round"/><line x1="2" y1="12" x2="5" y2="9" stroke-linecap="round" opacity="0.5"/><line x1="2" y1="12" x2="5" y2="15" stroke-linecap="round" opacity="0.5"/><line x1="22" y1="12" x2="19" y2="9" stroke-linecap="round" opacity="0.5"/><line x1="22" y1="12" x2="19" y2="15" stroke-linecap="round" opacity="0.5"/></svg>',
                tooltip: 'Horizontal (H)'
            },
            'vertical': {
                name: 'Vertical Line',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22" stroke-linecap="round"/><line x1="12" y1="2" x2="9" y2="5" stroke-linecap="round" opacity="0.5"/><line x1="12" y1="2" x2="15" y2="5" stroke-linecap="round" opacity="0.5"/><line x1="12" y1="22" x2="9" y2="19" stroke-linecap="round" opacity="0.5"/><line x1="12" y1="22" x2="15" y2="19" stroke-linecap="round" opacity="0.5"/></svg>',
                tooltip: 'Vertical (V)'
            },
            'ray': {
                name: 'Ray',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="18" x2="20" y2="6" stroke-linecap="round"/><circle cx="4" cy="18" r="2" fill="currentColor"/><path d="M17 4l4 2-2 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>',
                tooltip: 'Ray'
            },
            'horizontal-ray': {
                name: 'Horizontal Ray',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="22" y2="12" stroke-linecap="round"/><circle cx="4" cy="12" r="2" fill="currentColor"/><path d="M19 9l3 3-3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                tooltip: 'Horizontal Ray'
            },
            'extended-line': {
                name: 'Extended Line',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="20" x2="22" y2="4" stroke-linecap="round"/><circle cx="8" cy="14" r="2" fill="currentColor"/><circle cx="16" cy="8" r="2" fill="currentColor"/></svg>',
                tooltip: 'Extended Line'
            },
            'cross-line': {
                name: 'Cross Line',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22" stroke-linecap="round"/><line x1="2" y1="12" x2="22" y2="12" stroke-linecap="round"/></svg>',
                tooltip: 'Cross Line'
            },
            'rectangle': {
                name: 'Rectangle',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="7" width="14" height="10" rx="1"/></svg>',
                tooltip: 'Rectangle (R)'
            },
            'ellipse': {
                name: 'Ellipse',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
                tooltip: 'Ellipse'
            },
            'triangle': {
                name: 'Triangle',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4 L20 20 L4 20 Z"/></svg>',
                tooltip: 'Triangle'
            },
            'arrow': {
                name: 'Arrow',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
                tooltip: 'Arrow'
            },
            'label': {
                name: 'Label',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
                tooltip: 'Label/Marker'
            },
            'text': {
                name: 'Text',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14M12 5v14M8 19h8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                tooltip: 'Text'
            },
            'notebox': {
                name: 'Note Box',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="6" width="16" height="12" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/></svg>',
                tooltip: 'Note Box'
            },
            'fibonacci-retracement': {
                name: 'Fibonacci Retracement',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="16" x2="20" y2="16" opacity="0.4"/><line x1="4" y1="12" x2="20" y2="12" opacity="0.4"/><line x1="4" y1="8" x2="20" y2="8" opacity="0.4"/></svg>',
                tooltip: 'Fibonacci Retracement (F)'
            },
            'gann-box': {
                name: 'Gann Box',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>',
                tooltip: 'Gann Box'
            },
            'anchored-vwap': {
                name: 'Anchored VWAP',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20 L8 12 L12 16 L16 8 L20 14"/><circle cx="4" cy="20" r="2" fill="currentColor"/></svg>',
                tooltip: 'Anchored VWAP'
            },
            'volume-profile': {
                name: 'Fixed Range VP',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="6" y="5" width="8" height="3" fill="currentColor" opacity="0.6" rx="1"/><rect x="6" y="9" width="12" height="3" fill="currentColor" opacity="0.8" rx="1"/><rect x="6" y="13" width="6" height="3" fill="currentColor" opacity="0.5" rx="1"/><rect x="6" y="17" width="4" height="2" fill="currentColor" opacity="0.4" rx="1"/></svg>',
                tooltip: 'Fixed Range Volume Profile'
            },
            'anchored-volume-profile': {
                name: 'Anchored VP',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="3" x2="6" y2="21" stroke-dasharray="2,2" opacity="0.7"/><circle cx="6" cy="12" r="2.5" fill="currentColor"/><rect x="6" y="5" width="10" height="2.5" fill="currentColor" opacity="0.6" rx="1"/><rect x="6" y="8.5" width="14" height="2.5" fill="currentColor" opacity="0.8" rx="1"/><rect x="6" y="12" width="8" height="2.5" fill="currentColor" opacity="0.5" rx="1"/><rect x="6" y="15.5" width="5" height="2.5" fill="currentColor" opacity="0.4" rx="1"/></svg>',
                tooltip: 'Anchored Volume Profile'
            },
            'ruler': {
                name: 'Ruler',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="8" x2="8" y2="8"/><line x1="4" y1="12" x2="10" y2="12"/><line x1="4" y1="16" x2="8" y2="16"/></svg>',
                tooltip: 'Ruler/Measure'
            },
            'long-position': {
                name: 'Long Position',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="6" rx="2" fill="rgba(8,153,129,0.15)" stroke="#089981"/><rect x="4" y="12" width="16" height="6" rx="2" fill="rgba(242,54,69,0.15)" stroke="#f23645"/><line x1="4" y1="12" x2="20" y2="12" stroke="#2962ff" stroke-width="2"/></svg>',
                tooltip: 'Long Position'
            },
            'short-position': {
                name: 'Short Position',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="6" width="16" height="6" rx="2" fill="rgba(242,54,69,0.15)" stroke="#f23645"/><rect x="4" y="12" width="16" height="6" rx="2" fill="rgba(8,153,129,0.15)" stroke="#089981"/><line x1="4" y1="12" x2="20" y2="12" stroke="#2962ff" stroke-width="2"/></svg>',
                tooltip: 'Short Position'
            },
            'polyline': {
                name: 'Polyline',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3,17 8,7 13,13 18,5 21,12" stroke-width="2" fill="none"/><circle cx="3" cy="17" r="2" fill="#2962ff"/><circle cx="8" cy="7" r="2" fill="#2962ff"/><circle cx="13" cy="13" r="2" fill="#2962ff"/><circle cx="18" cy="5" r="2" fill="#2962ff"/><circle cx="21" cy="12" r="2" fill="#2962ff"/></svg>',
                tooltip: 'Polyline (Point-by-Point)'
            },
            'path': {
                name: 'Path',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="2,15 6,8 10,14 14,6 18,12 22,9" stroke-width="2" fill="none"/><circle cx="2" cy="15" r="2" fill="#2962ff"/><circle cx="6" cy="8" r="2" fill="#2962ff"/><circle cx="10" cy="14" r="2" fill="#2962ff"/><circle cx="14" cy="6" r="2" fill="#2962ff"/><circle cx="18" cy="12" r="2" fill="#2962ff"/><circle cx="22" cy="9" r="2" fill="#2962ff"/></svg>',
                tooltip: 'Path (Freehand)'
            },
            'brush': {
                name: 'Brush',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 10 3 3"/><path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z"/><path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031"/></svg>',
                tooltip: 'Brush'
            },
            'highlighter': {
                name: 'Highlighter',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
                tooltip: 'Highlighter'
            },
            'arrow-marker': {
                name: 'Arrow Marker',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5 L12 19 M8 9 L12 5 L16 9"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>',
                tooltip: 'Arrow Marker'
            },
            'arrow-mark-up': {
                name: 'Arrow Mark Up',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#089981" stroke-width="1.5"><path d="M12 4 L20 18 L4 18 Z" fill="rgba(8,153,129,0.3)"/></svg>',
                tooltip: 'Arrow Mark Up'
            },
            'arrow-mark-down': {
                name: 'Arrow Mark Down',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="#F23645" stroke-width="1.5"><path d="M12 20 L20 6 L4 6 Z" fill="rgba(242,54,69,0.3)"/></svg>',
                tooltip: 'Arrow Mark Down'
            },
            'rotated-rectangle': {
                name: 'Rotated Rectangle',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="1" transform="rotate(15 12 12)"/></svg>',
                tooltip: 'Rotated Rectangle'
            },
            'circle': {
                name: 'Circle',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/></svg>',
                tooltip: 'Circle'
            },
            'arc': {
                name: 'Arc',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 18 Q12 4 19 18" fill="none"/></svg>',
                tooltip: 'Arc'
            },
            'curve': {
                name: 'Curve',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 18 Q8 6 12 12 T20 6" fill="none"/></svg>',
                tooltip: 'Curve'
            },
            'double-curve': {
                name: 'Double Curve',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16 C8 4 12 20 16 8 L20 8" fill="none"/></svg>',
                tooltip: 'Double Curve'
            },
            'emoji': {
                name: 'Emojis & Stickers',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>',
                tooltip: 'Emojis & Stickers'
            },
            'emojiStandalone': {
                name: 'Emojis & Stickers',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>',
                tooltip: 'Emojis & Stickers'
            },
            'anchored-text': {
                name: 'Anchored Text',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="6" x2="18" y2="6"/><line x1="12" y1="6" x2="12" y2="14"/><path d="M12 14 L12 20 M9 17 L12 20 L15 17"/></svg>',
                tooltip: 'Anchored Text'
            },
            'note': {
                name: 'Note',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="14" height="14" rx="2"/><line x1="6" y1="6" x2="12" y2="6"/><line x1="12" y1="6" x2="12" y2="12"/></svg>',
                tooltip: 'Note'
            },
            'price-note': {
                name: 'Price Note',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="14" height="14" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">$</text></svg>',
                tooltip: 'Price Note'
            },
            'pin': {
                name: 'Pin',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 22c0 0-6-7-6-12a6 6 0 1 1 12 0c0 5-6 12-6 12z"/><circle cx="12" cy="10" r="2"/></svg>',
                tooltip: 'Pin'
            },
            'callout': {
                name: 'Callout',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4V8a2 2 0 0 1 2-2z"/></svg>',
                tooltip: 'Callout'
            },
            'price-label': {
                name: 'Price Label',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4V8z"/><path d="M18 10l4 2-4 2"/></svg>',
                tooltip: 'Price Label'
            },
            'flag-mark': {
                name: 'Flag Mark',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 21V4" stroke-linecap="round"/><path d="M4 4h12l-3 4 3 4H4" stroke-linejoin="round" fill="rgba(255,255,255,0.1)"/></svg>',
                tooltip: 'Flag Mark'
            },
            'image': {
                name: 'Image',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21"/></svg>',
                tooltip: 'Image'
            },
            'image-v2': {
                name: 'Image V2',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21"/><path d="M15 3v4m0 0v4m0-4h4m-4 0h-4" stroke-width="2"/></svg>',
                tooltip: 'Image V2'
            },
            // Patterns
            'xabcd-pattern': {
                name: 'XABCD Pattern',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18L6 6L12 14L18 4L22 12"/></svg>',
                tooltip: 'XABCD Pattern'
            },
            'cypher-pattern': {
                name: 'Cypher Pattern',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16L6 8L11 14L16 6L22 14"/></svg>',
                tooltip: 'Cypher Pattern'
            },
            'head-shoulders': {
                name: 'Head & Shoulders',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18L5 14L8 16L12 6L16 16L19 14L22 18"/></svg>',
                tooltip: 'Head & Shoulders'
            },
            'abcd-pattern': {
                name: 'ABCD Pattern',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18L9 6L15 14L20 4"/></svg>',
                tooltip: 'ABCD Pattern'
            },
            'triangle-pattern': {
                name: 'Triangle Pattern',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8L20 8M4 16L20 12" stroke-dasharray="none"/></svg>',
                tooltip: 'Triangle Pattern'
            },
            'three-drives': {
                name: 'Three Drives',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 18L5 10L8 14L11 6L14 12L17 4L22 10"/></svg>',
                tooltip: 'Three Drives'
            },
            // Elliott Waves
            'elliott-impulse': {
                name: 'Impulse Wave',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20L5 14L8 16L11 6L14 10L17 2L20 8L22 6"/></svg>',
                tooltip: 'Impulse Wave (12345)'
            },
            'elliott-correction': {
                name: 'Correction Wave',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6L10 16L16 10L22 18"/></svg>',
                tooltip: 'Correction Wave (ABC)'
            },
            'elliott-triangle': {
                name: 'Elliott Triangle',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12L6 6L10 10L14 8L18 9L22 12"/></svg>',
                tooltip: 'Triangle Wave (ABCDE)'
            },
            'elliott-double-combo': {
                name: 'Double Combo',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 14L7 6L12 12L17 8L22 14"/></svg>',
                tooltip: 'Double Combo (WXY)'
            },
            'elliott-triple-combo': {
                name: 'Triple Combo',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 14L5 6L9 12L13 8L17 11L21 6L23 10"/></svg>',
                tooltip: 'Triple Combo (WXYXZ)'
            },
            // Cycles
            'cyclic-lines': {
                name: 'Cyclic Lines',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="4" y2="20"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/><line x1="22" y1="4" x2="22" y2="20"/></svg>',
                tooltip: 'Cyclic Lines'
            },
            'time-cycles': {
                name: 'Time Cycles',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q8 4, 12 12 Q16 20, 20 4"/></svg>',
                tooltip: 'Time Cycles'
            },
            'sine-line': {
                name: 'Sine Line',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 Q6 4, 10 12 T18 12 T26 12"/></svg>',
                tooltip: 'Sine Line'
            },
            // Advanced Fibonacci Tools
            'fib-channel': {
                name: 'Fib Channel',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="18" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="6" opacity="0.5"/><line x1="3" y1="10" x2="21" y2="2" opacity="0.3"/></svg>',
                tooltip: 'Fib Channel'
            },
            'fib-timezone': {
                name: 'Fib Time Zone',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="4" x2="3" y2="20"/><line x1="6" y1="4" x2="6" y2="20" opacity="0.7"/><line x1="11" y1="4" x2="11" y2="20" opacity="0.5"/><line x1="19" y1="4" x2="19" y2="20" opacity="0.3"/></svg>',
                tooltip: 'Fib Time Zone'
            },
            'fib-speed-fan': {
                name: 'Fib Speed Fan',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="20" x2="21" y2="4"/><line x1="3" y1="20" x2="21" y2="8" opacity="0.6"/><line x1="3" y1="20" x2="21" y2="12" opacity="0.4"/></svg>',
                tooltip: 'Fib Speed Resistance Fan'
            },
            'trend-fib-time': {
                name: 'Trend Fib Time',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="4" y2="20"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="14" y1="4" x2="14" y2="20" opacity="0.5"/><line x1="20" y1="4" x2="20" y2="20" opacity="0.3"/></svg>',
                tooltip: 'Trend-Based Fib Time'
            },
            'fib-circles': {
                name: 'Fib Circles',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6" opacity="0.6"/><circle cx="12" cy="12" r="9" opacity="0.3"/></svg>',
                tooltip: 'Fib Circles'
            },
            'fib-spiral': {
                name: 'Fib Spiral',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 12 Q16 12 16 8 Q16 4 12 4 Q8 4 8 8 Q8 14 14 14 Q20 14 20 8" fill="none"/></svg>',
                tooltip: 'Fib Spiral'
            },
            'fib-arcs': {
                name: 'Fib Arcs',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><path d="M20 20 Q20 12 12 12" fill="none" opacity="0.6"/></svg>',
                tooltip: 'Fib Speed Resistance Arcs'
            },
            'fib-wedge': {
                name: 'Fib Wedge',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="4"/><line x1="4" y1="12" x2="20" y2="20"/></svg>',
                tooltip: 'Fib Wedge'
            },
            'pitchfan': {
                name: 'Pitchfan',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="4"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="12" x2="20" y2="20"/></svg>',
                tooltip: 'Pitchfan'
            },
            'trend-fib-extension': {
                name: 'Trend Fib Extension',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="18" x2="12" y2="6"/><line x1="12" y1="6" x2="21" y2="12"/><line x1="3" y1="4" x2="21" y2="4" opacity="0.4"/></svg>',
                tooltip: 'Trend-Based Fib Extension'
            },
            // Advanced Gann Tools
            'gann-square-fixed': {
                name: 'Gann Square Fixed',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="12" x2="20" y2="12" opacity="0.4"/><line x1="12" y1="4" x2="12" y2="20" opacity="0.4"/></svg>',
                tooltip: 'Gann Square Fixed'
            },
            'gann-fan': {
                name: 'Gann Fan',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="8" opacity="0.6"/><line x1="4" y1="20" x2="20" y2="12" opacity="0.4"/></svg>',
                tooltip: 'Gann Fan'
            }
        };
        
        this.init();
    }

    pinsUserPreferenceV1Enabled() {
        return typeof window === 'undefined'
            || window.__TALARIA_DISABLE_PINS_USER_PREFS_V1 !== true;
    }
    
    init() {
        // Load favorites from localStorage
        this.loadFavorites();
        
        // Load saved position
        this.loadPosition();
        
        // Load visibility state
        this.loadVisibility();
        
        // Add star buttons to all tools
        this.addStarButtons();
        
        // Render favorites toolbar
        this.render();
        
        // Setup drag functionality
        this.setupDrag();
        
        // Setup toggle button
        this.setupToggleButton();
        
        console.log('✅ Favorites Manager initialized');
    }
    
    loadFavorites() {
        try {
            if (this.pinsUserPreferenceV1Enabled()
                && typeof window !== 'undefined'
                && typeof window.loadDrawingToolFavorites === 'function') {
                const synced = window.loadDrawingToolFavorites();
                if (Array.isArray(synced) && synced.length > 0) {
                    this.favorites = synced;
                }
            }
            if (!Array.isArray(this.favorites) || this.favorites.length === 0) {
                const stored = userStorage.getItem(this.storageKey);
                this.favorites = stored ? JSON.parse(stored) : [];
            }
            if (Array.isArray(this.favorites)) {
                const filtered = this.favorites.filter(id => this.toolDefinitions && this.toolDefinitions[id]);
                if (filtered.length !== this.favorites.length) {
                    this.favorites = filtered;
                    userStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
                }
            }
            console.log('📂 Loaded favorites:', this.favorites);
        } catch (error) {
            console.error('❌ Error loading favorites:', error);
            this.favorites = [];
        }
    }
    
    saveFavorites() {
        try {
            userStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
            if (this.pinsUserPreferenceV1Enabled()
                && typeof window !== 'undefined'
                && typeof window.saveDrawingToolFavorites === 'function') {
                window.saveDrawingToolFavorites(this.favorites);
            }
            console.log('💾 Saved favorites:', this.favorites);
        } catch (error) {
            console.error('❌ Error saving favorites:', error);
        }
    }
    
    addStarButtons() {
        // Add star buttons to all tool buttons in sidebar (including cursor-option brushes)
        const allToolButtons = document.querySelectorAll('.tool-btn[id$="Tool"], .tool-group-btn, .cursor-option[id$="Tool"]');
        
        allToolButtons.forEach(btn => {
            // Skip cursor/ruler tool, chartTypeBtn, magnetMode, magnet dropdown items, visibility dropdown, delete dropdown, and main visibility/delete buttons
            if (btn.id === 'cursorTool' || btn.id === 'rulerTool' ||btn.id ==="toggleFavoritesBar"|| btn.id === 'chartTypeBtn' || btn.id === 'magnetMode' || 
                btn.closest('#magnetDropdown') || btn.hasAttribute('data-magnet') ||
                btn.closest('#visibility-toolbar-dropdown') || btn.closest('#delete-toolbar-dropdown') ||
                btn.id === 'toggleAllDrawingsToolbar' || btn.id === 'deleteAllDrawingsToolbar') {
                return;
            }
            
            // Check if star already exists (from HTML)
            const existingStar = btn.querySelector('.tool-favorite-star');
            if (existingStar) {
                // Attach click handler to existing star if it doesn't have one
                const toolId = existingStar.getAttribute('data-tool-id') || this.extractToolId(btn.id);
                if (toolId && !existingStar._hasFavoriteHandler) {
                    existingStar._hasFavoriteHandler = true;
                    
                    // Update active state
                    if (this.favorites.includes(toolId)) {
                        existingStar.classList.add('active');
                    }
                    
                    existingStar.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.toggleFavorite(toolId);
                    });
                }
                return;
            }
            
            // Extract tool type from button ID
            const toolId = this.extractToolId(btn.id);
            if (!toolId) return;
            
            // Create pin button
            const starBtn = document.createElement('button');
            starBtn.className = 'tool-favorite-star';
            starBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
            
            // Check if this tool is already a favorite
            if (this.favorites.includes(toolId)) {
                starBtn.classList.add('active');
            }
            
            // Add click handler
            starBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(toolId);
            });
            
            // Add to button
            btn.style.position = 'relative';
            btn.appendChild(starBtn);
        });
    }
    
    extractToolId(buttonId) {
        // Extract tool type from button ID
        // e.g., "trendlineTool" -> "trendline"
        // e.g., "fibonacci-retracementTool" -> "fibonacci-retracement"
        if (!buttonId) return null;
        
        // Remove "Tool" suffix
        let toolId = buttonId.replace(/Tool$/, '');
        
        // Convert camelCase to kebab-case
        toolId = toolId.replace(/([A-Z])/g, '-$1').toLowerCase();
        
        // Remove leading dash
        toolId = toolId.replace(/^-/, '');
        
        return toolId;
    }
    
    toggleFavorite(toolId) {
        const index = this.favorites.indexOf(toolId);
        
        if (index === -1) {
            // Add to favorites
            this.favorites.push(toolId);
            console.log(`⭐ Added to favorites: ${toolId}`);
        } else {
            // Remove from favorites
            this.favorites.splice(index, 1);
            console.log(`❌ Removed from favorites: ${toolId}`);
        }
        
        // Save to localStorage
        this.saveFavorites();
        
        // Update UI
        this.updateStarButtons();
        this.render();
    }
    
    updateStarButtons() {
        // Update all star buttons to reflect current favorites
        const allStars = document.querySelectorAll('.tool-favorite-star');
        
        allStars.forEach(star => {
            const btn = star.parentElement;
            const toolId = this.extractToolId(btn.id);
            
            if (this.favorites.includes(toolId)) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }
    
    render() {
        // V9 Live has no #favoritesTools — expected; multi-panel creates a manager per chart without spamming the console.
        if (!this.toolbarElement) return;
        
        // Clear current content
        this.toolbarElement.innerHTML = '';
        
        // No empty state text - just show tools when there are favorites
        if (this.favorites.length === 0) {
            return;
        }
        
        // Render favorite tools
        this.favorites.forEach(toolId => {
            const toolDef = this.toolDefinitions[toolId];
            if (!toolDef) {
                console.warn(`⚠️ Unknown tool: ${toolId}`);
                return;
            }
            
            // Create tool button
            const btn = document.createElement('button');
            btn.className = 'favorite-tool-btn';
            btn.dataset.tool = toolId;
            btn.title = toolDef.tooltip;
            btn.innerHTML = toolDef.icon;
            
            // Add remove button
            const removeBtn = document.createElement('div');
            removeBtn.className = 'favorite-tool-remove';
            removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(toolId);
            });
            btn.appendChild(removeBtn);
            
            // Add click handler to activate tool
            btn.addEventListener('click', () => {
                this.activateTool(toolId);
            });
            
            this.toolbarElement.appendChild(btn);
        });
        
        console.log(`✨ Rendered ${this.favorites.length} favorite tools`);
    }
    
    activateTool(toolId) {
        // Directly activate the tool via drawing manager on the focused chart
        const chart = window.__talariaActiveChartV1();
        if (chart && chart.drawingManager) {
            chart.drawingManager.setTool(toolId);
            console.log(`🎯 Activated tool: ${toolId}`);
            
            // Update active state in favorites toolbar
            this.updateActiveState(toolId);
            
            // Update toolbar UI
            document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tool-group-btn').forEach(b => b.classList.remove('active'));
            
            const originalBtnId = this.getOriginalButtonId(toolId);
            const originalBtn = document.getElementById(originalBtnId);
            if (originalBtn) {
                originalBtn.classList.add('active');
                
                // Also activate the parent group button
                const dropdown = originalBtn.closest('.tool-dropdown');
                if (dropdown) {
                    const groupName = dropdown.id.replace('-dropdown', '');
                    const groupButton = document.querySelector(`[data-group="${groupName}"]`);
                    if (groupButton) {
                        groupButton.classList.add('active');
                    }
                }
            }
        } else {
            console.error(`❌ Chart or drawing manager not found`);
        }
    }
    
    getOriginalButtonId(toolId) {
        // Convert kebab-case to camelCase and add "Tool" suffix
        // e.g., "fibonacci-retracement" -> "fibonacci-retracementTool"
        return toolId + 'Tool';
    }
    
    updateActiveState(activeTool) {
        if (!this.toolbarElement) return;
        // Remove active class from all favorite buttons
        const allFavBtns = this.toolbarElement.querySelectorAll('.favorite-tool-btn');
        allFavBtns.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to the clicked tool
        const activeBtn = this.toolbarElement.querySelector(`[data-tool="${activeTool}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }
    
    // Public method to sync active state from drawing manager
    syncActiveState(toolType) {
        if (!this.toolbarElement) return;
        if (!toolType || toolType === 'cursor') {
            // Remove active state from all
            const allFavBtns = this.toolbarElement.querySelectorAll('.favorite-tool-btn');
            allFavBtns.forEach(btn => btn.classList.remove('active'));
            return;
        }
        
        this.updateActiveState(toolType);
    }

    getMinToolbarTop() {
        const topToolbar = document.querySelector('.toolbar');
        if (topToolbar && typeof topToolbar.getBoundingClientRect === 'function') {
            const rect = topToolbar.getBoundingClientRect();
            if (Number.isFinite(rect.bottom)) {
                return Math.max(0, Math.ceil(rect.bottom + 4));
            }
        }
        return 52;
    }

    clampToolbarPosition(left, top) {
        const rect = this.toolbar && typeof this.toolbar.getBoundingClientRect === 'function'
            ? this.toolbar.getBoundingClientRect()
            : { width: 0, height: 0 };

        const minTop = this.getMinToolbarTop();
        const maxLeft = Math.max(0, window.innerWidth - (rect.width || 0));
        const maxTop = Math.max(minTop, window.innerHeight - (rect.height || 0));

        const safeLeft = Number.isFinite(left) ? left : 56;
        const safeTop = Number.isFinite(top) ? top : minTop;

        return {
            left: Math.round(Math.max(0, Math.min(safeLeft, maxLeft))),
            top: Math.round(Math.max(minTop, Math.min(safeTop, maxTop)))
        };
    }
    
    // Load saved position from localStorage
    loadPosition() {
        // V9's live/index.html doesn't ship a #favoritesToolbar element. If it
        // isn't in the DOM, bail rather than throwing — otherwise the failure
        // bubbles up through Chart.initDrawingTools -> Chart.init and breaks
        // every chart-side global (panelManager, drawingManager, etc.).
        if (!this.toolbar) return;
        const defaultPosition = this.clampToolbarPosition(56, this.getMinToolbarTop());
        try {
            const stored = userStorage.getItem(this.positionKey);
            if (stored) {
                const position = JSON.parse(stored);
                const clamped = this.clampToolbarPosition(Number(position.left), Number(position.top));
                this.toolbar.style.left = clamped.left + 'px';
                this.toolbar.style.top = clamped.top + 'px';
                console.log('📍 Loaded position:', clamped);
                return;
            }
        } catch (error) {
            console.error('❌ Error loading position:', error);
        }

        this.toolbar.style.left = defaultPosition.left + 'px';
        this.toolbar.style.top = defaultPosition.top + 'px';
    }
    
    // Save position to localStorage
    savePosition() {
        if (!this.toolbar) return;
        try {
            const clamped = this.clampToolbarPosition(
                parseInt(this.toolbar.style.left, 10),
                parseInt(this.toolbar.style.top, 10)
            );
            const position = {
                left: clamped.left,
                top: clamped.top
            };
            userStorage.setItem(this.positionKey, JSON.stringify(position));
            console.log('💾 Saved position:', position);
        } catch (error) {
            console.error('❌ Error saving position:', error);
        }
    }
    
    /**
     * M20-A — default ON. Kill-switch:
     *   window.__TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1 = true
     * restores legacy permanent/stacked listeners (no teardown on destroy).
     */
    _m20AFavoritesListenerTeardownEnabled() {
        return typeof window === 'undefined'
            || window.__TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1 !== true;
    }

    /**
     * M20-A — passive ledger entry for kill-period bindings (recovery only).
     * Entries capture the exact EventTarget the listener was added to plus
     * the shared per-setup legacy state (current RAF token + validity).
     * Actually-mutated toolbars live in the manager-level touched registry
     * (`_favoritesLegacyTouched`) so stacked bindings share one earliest
     * pre-drag baseline per target. Recording must never alter steady
     * kill-mode observable behavior (order/count/visuals) while the switch
     * stays active.
     */
    _recordFavoritesBinding(target, type, fn, state) {
        if (!target || !type || !fn) return;
        if (!this._favoritesBindingLedger) this._favoritesBindingLedger = [];
        this._favoritesBindingLedger.push({ target, type, fn, state: state || null });
    }

    _favoritesLeaseRegistry(target) {
        const doc = (target && target.ownerDocument) || (typeof document !== 'undefined' ? document : null);
        if (!doc) return null;
        const key = '__talariaFavoritesDragTargetLeasesV1';
        if (!doc[key]) {
            Object.defineProperty(doc, key, {
                value: new WeakMap(),
                configurable: true
            });
        }
        return doc[key];
    }

    _captureFavoritesTransition(target) {
        return target && target.style && typeof target.style.transition === 'string'
            ? target.style.transition
            : '';
    }

    _markFavoritesTargetOwned(target) {
        if (!target) return null;
        const registry = this._favoritesLeaseRegistry(target);
        if (!registry) return null;
        let lease = registry.get(target);
        if (!lease) {
            lease = {
                baseline: this._captureFavoritesTransition(target),
                owners: new Set()
            };
            registry.set(target, lease);
        }
        lease.owners.add(this);
        if (!this._favoritesLeasedTargets) this._favoritesLeasedTargets = new Set();
        this._favoritesLeasedTargets.add(target);
        return lease;
    }

    _restoreFavoritesTarget(target, transition) {
        try { target.classList.remove('dragging'); } catch (_) { /* detached target */ }
        try { target.style.transition = transition; } catch (_) { /* detached target */ }
    }

    _releaseFavoritesTarget(target, options = {}) {
        if (!target) return false;
        const registry = this._favoritesLeaseRegistry(target);
        const lease = registry && registry.get(target);
        if (!lease) return false;

        const owners = Array.from(lease.owners);
        if (options.terminal) {
            for (const owner of owners) {
                if (owner._favoritesLeasedTargets) owner._favoritesLeasedTargets.delete(target);
                if (owner._favoritesLegacyTouched) owner._favoritesLegacyTouched.delete(target);
            }
            lease.owners.clear();
            registry.delete(target);
            if (options.mutate !== false) {
                this._restoreFavoritesTarget(
                    target,
                    Object.prototype.hasOwnProperty.call(options, 'transition')
                        ? options.transition
                        : lease.baseline
                );
            }
            return true;
        }

        lease.owners.delete(this);
        if (this._favoritesLeasedTargets) this._favoritesLeasedTargets.delete(target);
        if (lease.owners.size > 0) return true;

        registry.delete(target);
        this._restoreFavoritesTarget(target, lease.baseline);
        return true;
    }

    /**
     * M20-A — drain the kill-period ledger (fix-ON recovery/destroy only).
     * Per legacy setup state:
     *   • marks the state invalidated FIRST, then cancels its recorded
     *     kill-period RAF token exactly once — a callback that still executes
     *     after a cancel failure/race is inert (no style mutation, and it can
     *     never clear or overwrite a newer fix-ON token).
     * Then, from the MANAGER-LEVEL touched registry (target-level ownership,
     * shared across all stacked kill bindings of this manager):
     *   • removes `.dragging` and restores the EARLIEST captured true
     *     pre-drag transition on every toolbar the legacy callbacks actually
     *     mutated — including targets swapped in via `this.toolbar`
     *     reassignment after install — exactly once per target, and leaves
     *     never-touched and legacy-mouseup-resolved toolbars alone;
     *   • resets the drag flag/offsets.
     * Bounded + idempotent: the ledger is emptied before removal starts and
     * the touched registry is cleared after restoration, so repeated
     * recovery/destroy passes are no-ops. Only this manager's own ledger and
     * registry are ever drained.
     */
    _recoverFavoritesBindingLedger() {
        const ledger = this._favoritesBindingLedger;
        if (!ledger || !ledger.length) return;
        this._favoritesBindingLedger = [];
        const states = new Set();
        for (const entry of ledger) {
            try {
                entry.target.removeEventListener(entry.type, entry.fn);
            } catch (_) { /* keep draining remaining entries */ }
            if (entry.state) states.add(entry.state);
        }
        for (const state of states) {
            state.invalidated = true; // close the cancel race before cancelling
            if (state.rafId != null) {
                const token = state.rafId;
                state.rafId = null; // cancel exactly once
                try { cancelAnimationFrame(token); } catch (_) { /* stale callback stays inert via invalidated */ }
            }
        }
        let touchedAny = false;
        const touchedRegistry = this._favoritesLegacyTouched;
        if (touchedRegistry && touchedRegistry.size) {
            touchedAny = true;
            for (const [target, preTransition] of touchedRegistry) {
                if (!this._releaseFavoritesTarget(target)) {
                    this._restoreFavoritesTarget(target, preTransition);
                }
            }
            touchedRegistry.clear();
        }
        if (touchedAny || this.isDragging) {
            this.isDragging = false;
            if (this.dragOffset) {
                this.dragOffset.x = 0;
                this.dragOffset.y = 0;
            }
        }
    }

    /**
     * M20-A — remove every fix-ON drag binding this manager installed.
     * Per binding: removes from the exact EventTarget/handle captured at
     * install time (survives global document replacement), cancels only that
     * binding's own RAF token (never a newer callback's id/state), and cleans
     * active-drag visual state (.dragging class + transition + drag flags) on
     * the exact toolbar bound when the drag started — even detached/replaced.
     * No-op while the kill-switch is ON (legacy shipped no teardown).
     * Only this manager's own recorded refs are ever removed.
     */
    _teardownDragBindings() {
        if (!this._m20AFavoritesListenerTeardownEnabled()) return;

        this._recoverFavoritesBindingLedger();

        const bindings = this._favoritesDragBindings;
        this._favoritesDragBindings = [];
        if (Array.isArray(bindings)) {
            for (const binding of bindings) {
                try { binding.doc.removeEventListener('mousemove', binding.move); } catch (_) { /* keep draining */ }
                try { binding.doc.removeEventListener('mouseup', binding.up); } catch (_) { /* keep draining */ }
                try { binding.handle.removeEventListener('mousedown', binding.down); } catch (_) { /* keep draining */ }

                if (binding.rafId != null) {
                    const token = binding.rafId;
                    binding.rafId = null; // own token only
                    try { cancelAnimationFrame(token); } catch (_) { /* cancel may throw; own token already cleared */ }
                    if (this._favoritesDragRafId === token) this._favoritesDragRafId = null;
                }

                if (binding.dragActive) {
                    binding.dragActive = false;
                    if (!this._releaseFavoritesTarget(binding.toolbar)) {
                        this._restoreFavoritesTarget(binding.toolbar, binding.preDragTransition || '');
                    }
                }
            }
        }

        this._favoritesDocMouseMove = null;
        this._favoritesDocMouseUp = null;
        this._favoritesHandleMouseDown = null;
        this._favoritesDragHandle = null;

        this._favoritesDragGeneration = (this._favoritesDragGeneration || 0) + 1;
        this.isDragging = false;
        if (this.dragOffset) {
            this.dragOffset.x = 0;
            this.dragOffset.y = 0;
        }
    }

    /** @deprecated alias — use _teardownDragBindings */
    _teardownDocumentDragListeners() {
        this._teardownDragBindings();
    }

    /**
     * M20-A — destroy/teardown contract for favorites drag listeners.
     * Chart-side pre-replace + destroy registry is a later M20-A sweep.
     */
    destroy() {
        this._teardownDragBindings();
    }

    // Setup drag functionality
    setupDrag() {
        if (!this._m20AFavoritesListenerTeardownEnabled()) {
            this._setupDragLegacy();
            return;
        }

        // Fix ON: drain prior bindings BEFORE any early return so a rebind
        // with a null/detached/replaced toolbar or handle cannot strand them.
        this._teardownDragBindings();

        if (!this.toolbar) return;
        const dragHandle = this.toolbar.querySelector('.favorites-drag-handle');
        if (!dragHandle) return;

        this._favoritesDragGeneration = (this._favoritesDragGeneration || 0) + 1;
        const bindingGeneration = this._favoritesDragGeneration;

        // Exact objects bound at install time; teardown must use these even
        // if the global document or this.toolbar is replaced later.
        const boundDocument = document;
        const boundToolbar = this.toolbar;
        const boundHandle = dragHandle;

        const binding = {
            generation: bindingGeneration,
            doc: boundDocument,
            toolbar: boundToolbar,
            handle: boundHandle,
            down: null,
            move: null,
            up: null,
            rafId: null,
            dragActive: false,
            preDragTransition: ''
        };

        let currentMouseX = 0;
        let currentMouseY = 0;

        const bindingAlive = () => (
            bindingGeneration === this._favoritesDragGeneration
            && boundToolbar === this.toolbar
            && !!this.toolbar
        );

        binding.down = (e) => {
            if (!bindingAlive()) return;
            this.isDragging = true;
            binding.dragActive = true;
            const lease = this._markFavoritesTargetOwned(boundToolbar);
            binding.preDragTransition = lease ? lease.baseline : (boundToolbar.style.transition || '');

            const rect = boundToolbar.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;

            boundToolbar.style.transition = 'none';
            boundToolbar.classList.add('dragging');

            currentMouseX = e.clientX;
            currentMouseY = e.clientY;

            e.preventDefault();
            e.stopPropagation();
        };

        binding.move = (e) => {
            if (!bindingAlive() || !this.isDragging) return;

            currentMouseX = e.clientX;
            currentMouseY = e.clientY;

            if (binding.rafId == null) {
                let token = null;
                let ranSynchronously = false;
                const rafCallback = () => {
                    ranSynchronously = true;
                    // RAF ownership: a (possibly stale or delayed) callback may
                    // clear only its OWN token; it must never null/cancel/reset
                    // a newer callback's id or state.
                    if (token != null) {
                        if (binding.rafId === token) binding.rafId = null;
                        if (this._favoritesDragRafId === token) this._favoritesDragRafId = null;
                    }
                    if (!bindingAlive()) return;
                    try {
                        let left = currentMouseX - this.dragOffset.x;
                        let top = currentMouseY - this.dragOffset.y;

                        const rect = boundToolbar.getBoundingClientRect();
                        const minTop = this.getMinToolbarTop();
                        const maxLeft = Math.max(0, window.innerWidth - rect.width);
                        const maxTop = Math.max(minTop, window.innerHeight - rect.height);

                        left = Math.max(0, Math.min(left, maxLeft));
                        top = Math.max(minTop, Math.min(top, maxTop));

                        boundToolbar.style.left = left + 'px';
                        boundToolbar.style.top = top + 'px';
                    } catch (_) { /* stale callback must not propagate */ }
                };
                token = requestAnimationFrame(rafCallback);
                if (!ranSynchronously) {
                    binding.rafId = token;
                    this._favoritesDragRafId = token;
                }
            }

            e.preventDefault();
        };

        binding.up = () => {
            if (!bindingAlive()) return;
            if (this.isDragging) {
                this.isDragging = false;
                binding.dragActive = false;
                if (!this._releaseFavoritesTarget(boundToolbar, { terminal: true })) {
                    this._restoreFavoritesTarget(boundToolbar, binding.preDragTransition || '');
                }

                if (binding.rafId != null) {
                    const token = binding.rafId;
                    binding.rafId = null; // own token only
                    try { cancelAnimationFrame(token); } catch (_) { /* own token already cleared */ }
                    if (this._favoritesDragRafId === token) this._favoritesDragRafId = null;
                }

                this.savePosition();
            }
        };

        boundHandle.addEventListener('mousedown', binding.down);
        boundDocument.addEventListener('mousemove', binding.move);
        boundDocument.addEventListener('mouseup', binding.up);

        if (!this._favoritesDragBindings) this._favoritesDragBindings = [];
        this._favoritesDragBindings.push(binding);

        // Single-slot mirrors kept for compatibility with earlier audits.
        this._favoritesHandleMouseDown = binding.down;
        this._favoritesDragHandle = boundHandle;
        this._favoritesDocMouseMove = binding.move;
        this._favoritesDocMouseUp = binding.up;

        console.log('✅ Drag functionality setup');
    }

    /**
     * M20-A kill path — legacy-behavior setupDrag.
     *
     * PRECISE CONTRACT (not a byte/AST/verbatim claim): while the kill switch
     * remains active, this path has ORDERED OBSERVABLE BEHAVIOR PARITY with
     * the authentic pre-fix source (git object 32c916dd0464de6b22042b6c6c1257570313dce8,
     * raw/LF sha256 091e2467928b759b1a26dfa16b3ea63c79f3d0fab6c069ce542edcb67cbc68b6)
     * for the covered legacy events: stacked handle mousedown / document
     * mousemove / document mouseup and their RAF scheduling, execution,
     * style/class mutations and cancels — 2 stacked bindings → 2 callbacks →
     * 2 RAFs, no guard suppression, no shared-state dedupe.
     *
     * Known, intentional differences from the pre-fix source:
     *   • whole-method bytes/AST differ — the `legacyState` (RAF token +
     *     validity) and manager-level touched-target registry bookkeeping
     *     below are non-observable during steady kill mode and exist only so
     *     fix-ON recovery/destroy can cancel kill-period RAFs and restore
     *     mutated toolbars to their earliest true pre-drag transitions;
     *   • stack frame names differ (named consts here vs pre-fix inline
     *     anonymous callbacks);
     *   • after fix-ON recovery/destroy, kill-created callbacks become inert
     *     (transition safety) — pre-fix had no such transition at all.
     * Parity is proven by the ordered Node and Edge A/B logs in the shipped
     * suites, not asserted as source equivalence.
     */
    _setupDragLegacy() {
        if (!this.toolbar) return;

        // Use the drag handle element
        const dragHandle = this.toolbar.querySelector('.favorites-drag-handle');
        if (!dragHandle) return;

        // Non-observable recovery bookkeeping, one state per legacy setup:
        // current RAF token + invalidation flag. Touched-target tracking is
        // MANAGER-LEVEL (target-level ownership): stacked bindings all firing
        // on one target must keep the EARLIEST true pre-drag transition, and
        // a legacy-mouseup-resolved target is terminally resolved for every
        // stacked binding of this manager at once.
        const legacyState = {
            rafId: null,
            invalidated: false
        };
        if (!this._favoritesLegacyTouched) this._favoritesLegacyTouched = new Map();
        const touchedRegistry = this._favoritesLegacyTouched;

        let animationFrameId = null;
        let currentMouseX = 0;
        let currentMouseY = 0;

        // Mouse down on drag handle
        const legacyMouseDown = (e) => {
            if (legacyState.invalidated) return; // inert after fix-ON recovery
            this.isDragging = true;

            // Calculate offset from mouse to toolbar top-left
            const rect = this.toolbar.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;

            // Record the ACTUAL target about to be mutated (this.toolbar may
            // have been reassigned since install). Earliest capture wins: a
            // later stacked binding firing on the same dispatch must not
            // overwrite the true pre-drag transition with the already-dirty
            // 'none' written by an earlier binding.
            const touchedTarget = this.toolbar;
            if (touchedTarget && !touchedRegistry.has(touchedTarget)) {
                this._markFavoritesTargetOwned(touchedTarget);
                touchedRegistry.set(
                    touchedTarget,
                    touchedTarget.style && typeof touchedTarget.style.transition === 'string'
                        ? touchedTarget.style.transition
                        : ''
                );
            }

            // Add dragging class for visual feedback
            this.toolbar.style.transition = 'none';
            this.toolbar.classList.add('dragging');

            // Store initial mouse position
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;

            e.preventDefault();
            e.stopPropagation();
        };
        dragHandle.addEventListener('mousedown', legacyMouseDown);

        // Mouse move - throttled with requestAnimationFrame
        const handleMouseMove = (e) => {
            if (legacyState.invalidated) return; // inert after fix-ON recovery
            if (!this.isDragging) return;

            currentMouseX = e.clientX;
            currentMouseY = e.clientY;

            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(() => {
                    // A kill-period RAF that still executes after recovery
                    // (cancel failure/race) must be inert: no style mutation
                    // and no interaction with any newer fix-ON token.
                    if (legacyState.invalidated) {
                        animationFrameId = null;
                        legacyState.rafId = null;
                        return;
                    }
                    // Calculate new position
                    let left = currentMouseX - this.dragOffset.x;
                    let top = currentMouseY - this.dragOffset.y;

                    // Constrain to viewport
                    const rect = this.toolbar.getBoundingClientRect();
                    const minTop = this.getMinToolbarTop();
                    const maxLeft = Math.max(0, window.innerWidth - rect.width);
                    const maxTop = Math.max(minTop, window.innerHeight - rect.height);

                    left = Math.max(0, Math.min(left, maxLeft));
                    top = Math.max(minTop, Math.min(top, maxTop));

                    // Apply position using transform for better performance
                    this.toolbar.style.left = left + 'px';
                    this.toolbar.style.top = top + 'px';

                    animationFrameId = null;
                    legacyState.rafId = null;
                });
                // Recorded so fix-ON recovery/destroy can cancel exactly once.
                legacyState.rafId = animationFrameId;
            }

            e.preventDefault();
        };

        document.addEventListener('mousemove', handleMouseMove);

        // Mouse up
        const legacyMouseUp = () => {
            if (legacyState.invalidated) return; // inert after fix-ON recovery
            if (this.isDragging) {
                this.isDragging = false;
                this.toolbar.classList.remove('dragging');
                this.toolbar.style.transition = '';

                // Legacy resolved this exact target itself — TERMINALLY, for
                // every stacked binding of this manager: recovery must never
                // reapply a captured 'none' over legacy's own cleanup.
                this._releaseFavoritesTarget(this.toolbar, {
                    terminal: true,
                    mutate: false,
                    transition: ''
                });
                touchedRegistry.delete(this.toolbar);

                // Cancel any pending animation frame
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                    legacyState.rafId = null;
                }

                // Save position
                this.savePosition();
            }
        };
        document.addEventListener('mouseup', legacyMouseUp);

        // Passive ledger (fix-ON recovery only; no steady kill-mode change).
        this._recordFavoritesBinding(dragHandle, 'mousedown', legacyMouseDown, legacyState);
        this._recordFavoritesBinding(document, 'mousemove', handleMouseMove, legacyState);
        this._recordFavoritesBinding(document, 'mouseup', legacyMouseUp, legacyState);

        console.log('✅ Drag functionality setup');
    }
    
    // Load visibility state from localStorage
    loadVisibility() {
        try {
            const stored = userStorage.getItem(this.visibilityKey);
            if (stored !== null) {
                this.isVisible = stored === 'true';
            }
            
            // Apply visibility
            if (this.toolbar) {
                this.toolbar.style.display = this.isVisible ? 'flex' : 'none';
            }
            
            console.log('👁️ Loaded visibility:', this.isVisible);
        } catch (error) {
            console.error('❌ Error loading visibility:', error);
        }
    }
    
    // Save visibility state to localStorage
    saveVisibility() {
        try {
            userStorage.setItem(this.visibilityKey, String(this.isVisible));
            console.log('💾 Saved visibility:', this.isVisible);
        } catch (error) {
            console.error('❌ Error saving visibility:', error);
        }
    }
    
    // Toggle favorites bar visibility
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        
        // Update toolbar display
        if (this.toolbar) {
            this.toolbar.style.display = this.isVisible ? 'flex' : 'none';
        }
        
        // Update toggle button state
        const toggleBtn = document.getElementById('toggleFavoritesBar');
        if (toggleBtn) {
            if (this.isVisible) {
                toggleBtn.classList.add('active');
                toggleBtn.querySelector('svg').style.fill = '#ffd54f';
            } else {
                toggleBtn.classList.remove('active');
                toggleBtn.querySelector('svg').style.fill = 'none';
            }
        }
        
        // Save state
        this.saveVisibility();
        
        console.log(`${this.isVisible ? '👁️' : '🙈'} Favorites bar ${this.isVisible ? 'shown' : 'hidden'}`);
        
        return this.isVisible;
    }
    
    // Setup toggle button
    setupToggleButton() {
        const toggleBtn = document.getElementById('toggleFavoritesBar');
        if (!toggleBtn) return;
        
        // Set initial state
        if (this.isVisible) {
            toggleBtn.classList.add('active');
            toggleBtn.querySelector('svg').style.fill = '#ffd54f';
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.querySelector('svg').style.fill = 'none';
        }
        
        // Add click handler
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleVisibility();
        });
        
        console.log('✅ Toggle button setup');
    }
}

// Export for tests / bundlers; keep global for chart script tags.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FavoritesManager;
}
if (typeof window !== 'undefined') {
    window.FavoritesManager = FavoritesManager;
}
