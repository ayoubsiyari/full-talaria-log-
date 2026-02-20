/**
 * Favorites Manager - TradingView Style
 * Manages favorite drawing tools with localStorage persistence
 */

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
            const stored = localStorage.getItem(this.storageKey);
            this.favorites = stored ? JSON.parse(stored) : [];
            if (Array.isArray(this.favorites)) {
                const filtered = this.favorites.filter(id => this.toolDefinitions && this.toolDefinitions[id]);
                if (filtered.length !== this.favorites.length) {
                    this.favorites = filtered;
                    localStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
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
            localStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
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
        if (!this.toolbarElement) {
            console.error('❌ Favorites toolbar element not found');
            return;
        }
        
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
        // Directly activate the tool via drawing manager
        const chart = window.chart || window.mainChart;
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
        if (!toolType || toolType === 'cursor') {
            // Remove active state from all
            const allFavBtns = this.toolbarElement.querySelectorAll('.favorite-tool-btn');
            allFavBtns.forEach(btn => btn.classList.remove('active'));
            return;
        }
        
        this.updateActiveState(toolType);
    }
    
    // Load saved position from localStorage
    loadPosition() {
        try {
            const stored = localStorage.getItem(this.positionKey);
            if (stored) {
                const position = JSON.parse(stored);
                this.toolbar.style.left = position.left + 'px';
                this.toolbar.style.top = position.top + 'px';
                console.log('📍 Loaded position:', position);
            }
        } catch (error) {
            console.error('❌ Error loading position:', error);
        }
    }
    
    // Save position to localStorage
    savePosition() {
        try {
            const position = {
                left: parseInt(this.toolbar.style.left) || 50,
                top: parseInt(this.toolbar.style.top) || 44
            };
            localStorage.setItem(this.positionKey, JSON.stringify(position));
            console.log('💾 Saved position:', position);
        } catch (error) {
            console.error('❌ Error saving position:', error);
        }
    }
    
    // Setup drag functionality
    setupDrag() {
        if (!this.toolbar) {
            console.error('❌ Toolbar element not found');
            return;
        }
        
        // Use the drag handle element
        const dragHandle = this.toolbar.querySelector('.favorites-drag-handle');
        if (!dragHandle) {
            console.error('❌ Drag handle not found');
            return;
        }
        
        let animationFrameId = null;
        let currentMouseX = 0;
        let currentMouseY = 0;
        
        // Mouse down on drag handle
        dragHandle.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            
            // Calculate offset from mouse to toolbar top-left
            const rect = this.toolbar.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;
            
            // Add dragging class for visual feedback
            this.toolbar.style.transition = 'none';
            this.toolbar.classList.add('dragging');
            
            // Store initial mouse position
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Mouse move - throttled with requestAnimationFrame
        const handleMouseMove = (e) => {
            if (!this.isDragging) return;
            
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(() => {
                    // Calculate new position
                    let left = currentMouseX - this.dragOffset.x;
                    let top = currentMouseY - this.dragOffset.y;
                    
                    // Constrain to viewport
                    const rect = this.toolbar.getBoundingClientRect();
                    const maxLeft = window.innerWidth - rect.width;
                    const maxTop = window.innerHeight - rect.height;
                    
                    left = Math.max(0, Math.min(left, maxLeft));
                    top = Math.max(0, Math.min(top, maxTop));
                    
                    // Apply position using transform for better performance
                    this.toolbar.style.left = left + 'px';
                    this.toolbar.style.top = top + 'px';
                    
                    animationFrameId = null;
                });
            }
            
            e.preventDefault();
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        
        // Mouse up
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.toolbar.classList.remove('dragging');
                this.toolbar.style.transition = '';
                
                // Cancel any pending animation frame
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                
                // Save position
                this.savePosition();
            }
        });
        
        console.log('✅ Drag functionality setup');
    }
    
    // Load visibility state from localStorage
    loadVisibility() {
        try {
            const stored = localStorage.getItem(this.visibilityKey);
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
            localStorage.setItem(this.visibilityKey, String(this.isVisible));
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
        if (!toggleBtn) {
            console.warn('⚠️ Toggle favorites button not found');
            return;
        }
        
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

// Make it globally accessible
window.FavoritesManager = FavoritesManager;
