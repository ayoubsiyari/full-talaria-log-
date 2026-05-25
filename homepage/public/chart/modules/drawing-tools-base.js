/**
 * Drawing Tools Base Module
 * Core infrastructure for D3.js drawing tools system
 * Provides base classes, utilities, and common functionality
 */

// ============================================================================
// UUID Generator
// ============================================================================
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/** Shared default stroke/fill for all drawing tools (V9 toolbar + new placements). */
const DRAWING_TOOL_DEFAULT_STROKE = '#8C8C8C';
const DRAWING_TOOL_DEFAULT_FILL = 'rgba(140, 140, 140, 0.2)';

const AXIS_LABEL_DEFAULT_LINE_TYPES = new Set([
    'trendline',
    'horizontal',
    'vertical',
    'ray',
    'horizontal-ray',
    'extended-line',
    'cross-line',
    'path',
    'curve',
    'double-curve',
    'parallel-channel',
    'regression-trend',
    'flat-top-bottom',
    'disjoint-channel'
]);

/** Never show axis price/time labels (no toggle). */
const AXIS_LABEL_DISABLED_TYPES = new Set(['brush', 'highlighter']);

/** Shape tools: labels off by default; user may enable via style tab. */
const AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES = new Set([
    'rectangle',
    'rotated-rectangle',
    'ellipse',
    'circle',
    'triangle',
    'arc',
    'polyline',
    'arrow-marker',
    'arrow-mark-up',
    'arrow-mark-down'
]);

/** Line tools that support direct move from stroke hit (plus fib/pattern families). */
const DIRECT_MOVE_LINE_TYPE_SET = new Set([
    'trendline',
    'horizontal',
    'vertical',
    'ray',
    'horizontal-ray',
    'extended-line',
    'cross-line',
    'arrow',
    'arrow-marker',
    'arrow-mark-up',
    'arrow-mark-down',
    'curve',
    'double-curve',
    'polyline',
    'path'
]);

const FIB_LIKE_DRAWING_TYPES_EXACT = new Set(['pitchfork', 'pitchfan']);

const PATTERN_LIKE_DRAWING_TYPES_EXACT = new Set([
    'head-shoulders',
    'three-drives',
    'cyclic-lines',
    'time-cycles',
    'sine-line'
]);

function isFibLikeDrawingType(type) {
    if (!type) return false;
    return type.startsWith('fibonacci-')
        || type.startsWith('fib-')
        || type.startsWith('trend-fib-')
        || FIB_LIKE_DRAWING_TYPES_EXACT.has(type);
}

function isPatternLikeDrawingType(type) {
    if (!type) return false;
    return type.includes('pattern')
        || type.startsWith('elliott-')
        || PATTERN_LIKE_DRAWING_TYPES_EXACT.has(type);
}

function isLineLikeDrawingType(type) {
    return DIRECT_MOVE_LINE_TYPE_SET.has(type)
        || isFibLikeDrawingType(type)
        || isPatternLikeDrawingType(type);
}

function getDrawingStrokeHitTolerances(type) {
    const loose = isFibLikeDrawingType(type) || isPatternLikeDrawingType(type);
    return {
        hitTolerance: loose ? 18 : 12,
        minLineHitTolerance: loose ? 14 : 0,
        lineHitTolerance: loose ? 14 : 8
    };
}

// ============================================================================
// Base Drawing Class
// ============================================================================
class BaseDrawing {
    constructor(type, points = [], style = {}) {
        this.id = generateUUID();
        this.type = type;
        this.points = points; // Array of {x, y} coordinates (x = index, y = price)
        this.style = {
            stroke: style.stroke || style.color || DRAWING_TOOL_DEFAULT_STROKE,
            strokeWidth: style.strokeWidth || 2,
            fill: style.fill !== undefined && style.fill !== null ? style.fill : 'none',
            opacity: style.opacity || 1,
            dashArray: style.dashArray || 'none',
            ...style
        };
        this.selected = false;
        this.visible = true;
        this.text = typeof style.text === 'string' ? style.text : '';
        this.meta = {
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.handles = [];
        this.group = null; // SVG group element
        this.hasAxisHighlightZones = false; // Track whether this drawing currently owns canvas axis zones
        
        // Multi-timeframe support
        this.coordinateSystem = 'timestamp'; // 'timestamp' or 'index' (legacy)
        this.chart = null; // Reference to chart instance (set by manager)
        this.timestampPoints = null; // Store original timestamps permanently (once set, never recalculate)
        
        // Zoom scaling support
        this.baseScale = null; // Store initial scale for zoom-based scaling
    }
    
    /**
     * Calculate zoom scale factor for consistent visual scaling
     * @param {Object} scales - {xScale, yScale} D3 scales
     * @returns {number} Scale factor (1.0 = original scale)
     */
    getZoomScaleFactor(scales) {
        return 1;
    }

    /**
     * Normalize render() third argument (boolean isPreview legacy or opts object).
     */
    static normalizeRenderOpts(renderOpts) {
        if (renderOpts === true) {
            return { isPreview: true, reuseGroup: false, skipHandles: false };
        }
        if (renderOpts === false || renderOpts == null) {
            return { isPreview: false, reuseGroup: false, skipHandles: false };
        }
        if (typeof renderOpts === 'object') {
            return {
                isPreview: !!renderOpts.isPreview,
                reuseGroup: !!renderOpts.reuseGroup,
                skipHandles: !!renderOpts.skipHandles
            };
        }
        return { isPreview: false, reuseGroup: false, skipHandles: false };
    }

    /** Truthy style flag (boolean, 1, or persisted string "true"). */
    static isStyleFlagOn(style, key) {
        const v = style && style[key];
        return v === true || v === 1
            || (typeof v === 'string' && /^(true|1|yes)$/i.test(String(v).trim()));
    }

    /** Same dash resolution as TrendlineTool (`strokeDasharray ?? dashArray ?? ''`). */
    static resolveStrokeDasharray(style) {
        if (!style) return '';
        const raw = style.strokeDasharray ?? style.dashArray ?? '';
        if (raw === '0' || raw === 'none' || raw == null || raw === '') return '';
        return String(raw);
    }

    _shouldCreateHandles(opts = {}) {
        if (opts.skipHandles) return false;
        const mgr = this.chart && this.chart.drawingManager;
        if (mgr && mgr._skipHandleSetup) return false;
        return true;
    }

    _isHandleNode(node) {
        let el = node;
        const root = this.group ? this.group.node() : null;
        while (el && el.getAttribute) {
            const cls = el.getAttribute('class') || '';
            if (/resize-handle|custom-handle|resize-handle-group/.test(cls)) return true;
            if (el === root) break;
            el = el.parentNode;
        }
        return false;
    }

    _clearGeometryChildren(group) {
        if (!group || group.empty()) return;
        const nodes = group.selectAll('*').nodes();
        nodes.slice().reverse().forEach((node) => {
            if (!node || this._isHandleNode(node)) return;
            try { node.parentNode && node.parentNode.removeChild(node); } catch (_) {}
        });
    }

    _clearDrawingLabels(scales) {
        const labelsGroup = scales && scales.labelsGroup;
        if (!labelsGroup || labelsGroup.empty()) return;
        try {
            labelsGroup.selectAll(`[data-id="${this.id}"]`).remove();
        } catch (_) {}
    }

    /**
     * Reuse existing SVG group during hot-path redraws (pan/resize) instead of remove+append.
     * @returns {boolean} true when group was reused
     */
    _prepareRenderGroup(container, className, opts = {}) {
        const normalized = BaseDrawing.normalizeRenderOpts(opts);
        const opacity = this.visible ? (this.style.opacity != null ? this.style.opacity : 1) : 0;

        if (normalized.reuseGroup && this.group && !this.group.empty()) {
            const node = this.group.node();
            if (node && node.parentNode) {
                this._clearGeometryChildren(this.group);
                this.group
                    .attr('class', className)
                    .attr('data-id', this.id)
                    .style('opacity', opacity)
                    .attr('transform', null);
                return true;
            }
        }

        if (this.group) {
            try { this.group.remove(); } catch (_) {}
        }

        this.group = container.append('g')
            .attr('class', className)
            .attr('data-id', this.id)
            .style('opacity', opacity);
        return false;
    }

    /**
     * Pan/zoom hot path: update existing SVG geometry in place (no DOM teardown).
     * Subclasses return true when geometry was patched successfully.
     */
    patchPanZoomGeometry(scales) {
        return false;
    }

    static fibIndexToPixel(scales, xIdx) {
        if (!scales || !Number.isFinite(xIdx)) return NaN;
        return scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(xIdx)
            : scales.xScale(xIdx);
    }

    static fibPriceToPixel(scales, price) {
        if (!scales || !Number.isFinite(price)) return NaN;
        return scales.yScale(price);
    }

    static computeTwoPointHorizontalFibLayout(tool, scales) {
        if (!tool || !scales || !Array.isArray(tool.points) || tool.points.length < 2) return null;
        const p1 = tool.points[0];
        const p2 = tool.points[1];
        if (!p1 || !p2) return null;

        const x1 = BaseDrawing.fibIndexToPixel(scales, p1.x);
        const y1 = BaseDrawing.fibPriceToPixel(scales, p1.y);
        const x2 = BaseDrawing.fibIndexToPixel(scales, p2.x);
        const y2 = BaseDrawing.fibPriceToPixel(scales, p2.y);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

        const xRange = scales.xScale.range();
        const chartWidth = xRange[1] - xRange[0];
        let fibX1;
        let fibX2;
        let fibWidth;
        if (tool.style && tool.style.extendLines) {
            fibX1 = xRange[0];
            fibX2 = xRange[1];
            fibWidth = chartWidth;
        } else {
            fibX1 = Math.min(x1, x2);
            fibX2 = Math.max(x1, x2);
            fibWidth = Math.abs(x2 - x1);
            if (fibWidth < 50) {
                const centerX = (x1 + x2) / 2;
                fibWidth = 100;
                fibX1 = centerX - 50;
                fibX2 = centerX + 50;
            }
        }

        const priceDiff = p2.y - p1.y;
        const reverse = !!(tool.style && tool.style.reverse);
        const getPriceAtLevel = (levelValue) => {
            if (!reverse) return p1.y + (priceDiff * levelValue);
            return p1.y + (priceDiff * (1 - levelValue));
        };

        const levels = [];
        (tool.levels || []).forEach((level, i) => {
            if (!level || level.visible === false) return;
            const priceAtLevel = getPriceAtLevel(level.value);
            const yAtLevel = BaseDrawing.fibPriceToPixel(scales, priceAtLevel);
            if (!Number.isFinite(yAtLevel)) return;
            let nextY = null;
            const nextLevel = tool.levels[i + 1];
            if (nextLevel && nextLevel.visible !== false) {
                nextY = BaseDrawing.fibPriceToPixel(scales, getPriceAtLevel(nextLevel.value));
            }
            levels.push({ value: level.value, y: yAtLevel, nextY });
        });

        return { x1, y1, x2, y2, fibX1, fibX2, fibWidth, levels };
    }

    static patchTwoPointHorizontalFib(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('line[data-level]').node()) return false;

        const layout = BaseDrawing.computeTwoPointHorizontalFibLayout(tool, scales);
        if (!layout) return false;

        const { x1, y1, x2, y2, fibX1, fibX2, fibWidth, levels } = layout;
        const group = tool.group;
        const trend = group.select('.fib-trend-line');
        if (!trend.empty()) {
            trend.attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
        }

        levels.forEach(({ value, y, nextY }) => {
            const key = `${value}`;
            group.selectAll(`line[data-level="${key}"]`)
                .attr('x1', fibX1)
                .attr('y1', y)
                .attr('x2', fibX2)
                .attr('y2', y);
            if (nextY != null && Number.isFinite(nextY)) {
                group.selectAll(`rect[data-fib-zone="${key}"]`)
                    .attr('x', fibX1)
                    .attr('y', Math.min(y, nextY))
                    .attr('width', fibWidth)
                    .attr('height', Math.abs(nextY - y));
            }
            group.selectAll(`text[data-fib-label="${key}"]`)
                .attr('x', fibX2 + 5)
                .attr('y', y + 4);
        });

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    static patchFibTimeZone(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('.fib-tz-vertical').node()) return false;
        if (!Array.isArray(tool.points) || tool.points.length < 2) return false;

        const xIndex1 = tool.points[0].x;
        const xIndex2 = tool.points[1].x;
        const baseDx = xIndex2 - xIndex1;
        if (!baseDx) return false;

        const x1 = BaseDrawing.fibIndexToPixel(scales, xIndex1);
        const y1 = BaseDrawing.fibPriceToPixel(scales, tool.points[0].y);
        const x2 = BaseDrawing.fibIndexToPixel(scales, xIndex2);
        const y2 = BaseDrawing.fibPriceToPixel(scales, tool.points[1].y);
        const chartHeight = scales.chart?.h || 500;
        if (![x1, y1, x2, y2].every(Number.isFinite)) return false;

        const group = tool.group;
        group.select('.fib-tz-anchor')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2);

        group.selectAll('.fib-tz-vertical').each(function () {
            const fibN = parseFloat(d3.select(this).attr('data-fib-tz'));
            if (!Number.isFinite(fibN)) return;
            const xIndex = xIndex1 + (baseDx * fibN);
            const x = BaseDrawing.fibIndexToPixel(scales, xIndex);
            if (!Number.isFinite(x)) return;
            d3.select(this)
                .attr('x1', x).attr('y1', 0)
                .attr('x2', x).attr('y2', chartHeight);
        });

        group.selectAll('.fib-tz-label').each(function () {
            const fibN = parseFloat(d3.select(this).attr('data-fib-tz'));
            if (!Number.isFinite(fibN)) return;
            const xIndex = xIndex1 + (baseDx * fibN);
            const x = BaseDrawing.fibIndexToPixel(scales, xIndex);
            if (!Number.isFinite(x)) return;
            d3.select(this).attr('x', x + 3);
        });

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    static patchFibChannel(tool, scales) {
        if (!tool || !tool.group || tool.group.empty() || !scales) return false;
        if (!tool.group.select('line[data-fib-channel-level]').node()) return false;
        if (!Array.isArray(tool.points) || tool.points.length < 3) return false;

        const getX = (p) => BaseDrawing.fibIndexToPixel(scales, p.x);
        const getY = (p) => BaseDrawing.fibPriceToPixel(scales, p.y);
        const x1 = getX(tool.points[0]);
        const y1 = getY(tool.points[0]);
        const x2 = getX(tool.points[1]);
        const y2 = getY(tool.points[1]);
        const x3 = getX(tool.points[2]);
        const y3 = getY(tool.points[2]);
        if (![x1, y1, x2, y2, x3, y3].every(Number.isFinite)) return false;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (!len) return false;

        const nx = -dy / len;
        const ny = dx / len;
        const channelOffset = (x3 - x1) * nx + (y3 - y1) * ny;
        const extendLines = !!tool.style.extendLines;
        const reverse = !!tool.style.reverse;
        const xRange = scales.xScale.range();
        const getSegment = (xA, yA, xB, yB) => {
            if (!extendLines) return { x1: xA, y1: yA, x2: xB, y2: yB };
            const xMin = Math.min(xRange[0], xRange[1]);
            const xMax = Math.max(xRange[0], xRange[1]);
            const dx2 = xB - xA;
            if (Math.abs(dx2) < 1e-6) return { x1: xA, y1: yA, x2: xB, y2: yB };
            const m = (yB - yA) / dx2;
            return {
                x1: xMin,
                y1: yA + m * (xMin - xA),
                x2: xMax,
                y2: yA + m * (xMax - xA)
            };
        };

        const group = tool.group;
        group.selectAll('line[data-fib-channel-level]').each(function () {
            const lvl = parseFloat(d3.select(this).attr('data-fib-channel-level'));
            if (!Number.isFinite(lvl)) return;
            const actualLevel = reverse ? (1 - lvl) : lvl;
            const offset = channelOffset * actualLevel;
            const seg = getSegment(x1 + nx * offset, y1 + ny * offset, x2 + nx * offset, y2 + ny * offset);
            d3.select(this)
                .attr('x1', seg.x1).attr('y1', seg.y1)
                .attr('x2', seg.x2).attr('y2', seg.y2);
        });

        group.selectAll('text[data-fib-channel-label]').each(function () {
            const lvl = parseFloat(d3.select(this).attr('data-fib-channel-label'));
            if (!Number.isFinite(lvl)) return;
            const actualLevel = reverse ? (1 - lvl) : lvl;
            const offset = channelOffset * actualLevel;
            const seg = getSegment(x1 + nx * offset, y1 + ny * offset, x2 + nx * offset, y2 + ny * offset);
            d3.select(this).attr('x', seg.x2 + 5).attr('y', seg.y2 + 4);
        });

        if (tool.style.showZones) {
            const zoneLevels = (tool.levels || [])
                .map((l) => {
                    const rawValue = typeof l === 'object' ? l.value : l;
                    const enabled = typeof l === 'object' ? l.enabled !== false : true;
                    const color = typeof l === 'object' ? (l.color || tool.style.stroke) : tool.style.stroke;
                    const value = parseFloat(rawValue);
                    const actual = reverse ? (1 - value) : value;
                    return { value, actual, enabled, color };
                })
                .filter((l) => l.enabled && l.value != null && Number.isFinite(l.value) && Number.isFinite(l.actual))
                .sort((a, b) => a.actual - b.actual);

            group.selectAll('path[data-fib-zone-idx]').each(function () {
                const idx = parseInt(d3.select(this).attr('data-fib-zone-idx'), 10);
                if (!Number.isFinite(idx) || idx < 0 || idx >= zoneLevels.length - 1) return;
                const aV1 = zoneLevels[idx].actual;
                const aV2 = zoneLevels[idx + 1].actual;
                const off1 = channelOffset * aV1;
                const off2 = channelOffset * aV2;
                const a1 = getSegment(x1 + nx * off1, y1 + ny * off1, x2 + nx * off1, y2 + ny * off1);
                const a2 = getSegment(x1 + nx * off2, y1 + ny * off2, x2 + nx * off2, y2 + ny * off2);
                d3.select(this).attr('d', `M ${a1.x1},${a1.y1} L ${a1.x2},${a1.y2} L ${a2.x2},${a2.y2} L ${a2.x1},${a2.y1} Z`);
            });
        }

        const opacity = tool.visible ? (tool.style.opacity != null ? tool.style.opacity : 1) : 0;
        group.style('opacity', opacity).attr('transform', null);
        return true;
    }

    /**
     * Patch resize-handle positions without recreating handle DOM (hot path).
     */
    updateHandlePositions(scales) {
        if (!this.group || this.group.empty() || !scales) return;
        const pointsToRender = this.virtualPoints || this.points;
        if (!Array.isArray(pointsToRender)) return;

        pointsToRender.forEach((point, index) => {
            if (!point) return;
            const cx = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(point.x)
                : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
            this.group.selectAll(`.resize-handle-group[data-point-index="${index}"] circle`)
                .attr('cx', cx)
                .attr('cy', cy);
        });
    }

    /**
     * Render the drawing to SVG
     * @param {d3.Selection} container - D3 selection of the drawings container
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Update drawing position/size based on new points
     * @param {Array} points - New points array
     */
    update(points) {
        this.points = points;
        this.meta.updatedAt = Date.now();
        // Recalculate timestamps from new indices
        this.recalculateTimestamps();
    }
    
    /**
     * Recalculate timestamps from current indices
     * Called after moving or resizing a drawing
     * Supports extrapolation for areas without data (replay mode)
     */
    recalculateTimestamps() {
        if (this.chart && this.chart.data && this.chart.data.length > 0) {
            const timeframe = this.chart.currentTimeframe || null;
            this.timestampPoints = this.points.map(p => {
                // Use CoordinateUtils for extrapolation support with correct timeframe
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
        }
    }

    /**
     * Update optional text label if supported by the drawing
     * @param {string} text
     */
    setText(text) {
        this.text = typeof text === 'string' ? text : '';
        this.meta.updatedAt = Date.now();
    }

    isAxisLabelDefaultEnabled() {
        if (AXIS_LABEL_DISABLED_TYPES.has(this.type)) return false;
        if (AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES.has(this.type)) return false;
        return AXIS_LABEL_DEFAULT_LINE_TYPES.has(this.type);
    }

    isAxisLabelEnabled(labelType) {
        if (AXIS_LABEL_DISABLED_TYPES.has(this.type)) return false;

        const prop = labelType === 'time' ? 'showTimeLabel' : 'showPriceLabel';
        const explicitValue = this.style ? this.style[prop] : undefined;

        if (explicitValue === true) return true;
        if (explicitValue === false) return false;

        return this.isAxisLabelDefaultEnabled();
    }

    /**
     * Create resize handles for the drawing
     * @param {d3.Selection} group - The drawing's SVG group
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;  // Visual handle size
        const hitRadius = 12;    // Larger hit area for easier clicking
        const handleFill = 'transparent';  // No background
        const handleStroke = '#2962FF';  // Blue stroke
        const handleStrokeWidth = 2;  // Thinner border
        
        // Remove existing handles and handle groups
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        // Use virtualPoints if available, otherwise use points
        const pointsToRender = this.virtualPoints || this.points;
        pointsToRender.forEach((point, index) => {
            // Convert data index to screen position
            const cx = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            
            // Create handle group
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            // Invisible larger hit area for easier clicking
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-point-index', index);
            
            // Visual handle circle (blue outline, no fill)
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });
    }

    /**
     * Optional hook for point-handle drags. Return true if handled.
     * @param {number} index
     * @param {{x:number, y:number}} point
     * @returns {boolean}
     */
    onPointHandleDrag(index, context = {}) {
        return false;
    }

    /**
     * Optional hook invoked when a custom handle drag starts.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    beginHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Handle drag for resize handles - updates the point at the given index.
     * This is the default implementation that works for simple point-based tools.
     * @param {string|number} handleRole - Role name or point index
     * @param {Object} context - Contains dataPoint, pointIndex, scales
     * @returns {boolean} - true if drawing was updated
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex } = context;
        
        // Get the point index - either from context or parse from handleRole
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        // Validate
        if (!dataPoint || isNaN(index) || index < 0 || index >= this.points.length) {
            return false;
        }
        
        // Update the point
        this.points[index] = { x: dataPoint.x, y: dataPoint.y };
        this.meta.updatedAt = Date.now();
        return true;
    }

    /**
     * Optional hook invoked when a custom handle drag ends.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    endHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Show selection state
     */
    select(opts = {}) {
        this.selected = true;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 1);
            this.group.selectAll('.resize-handle').style('pointer-events', 'all');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'all');
            this.group.selectAll('.resize-handle-glow-outer').style('opacity', 0.15);
            this.group.selectAll('.resize-handle-glow').style('opacity', 0.3);
            this.group.selectAll('.resize-handle-shadow').style('opacity', 0.3);
            this.group.selectAll('.custom-handle').style('opacity', 1);
            this.group.selectAll('.custom-handle').style('pointer-events', 'all');
            this.group.raise(); // Bring to front
        }
        if (!opts.skipAxisHighlights) {
            this.showAxisHighlights();
        }
    }

    /**
     * Hide selection state
     */
    deselect() {
        this.selected = false;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 0);
            this.group.selectAll('.resize-handle').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-glow').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('pointer-events', 'none');
        }
        // Refresh axis highlights (keep labels visible after deselect)
        this.showAxisHighlights();
    }
    
    /**
     * Show highlighted labels on price and time axes for drawing points
     * TradingView style: cyan background for time, colored backgrounds for prices
     */
    showAxisHighlights(opts = {}) {
        if (!this.chart || !this.points || this.points.length === 0) return;
        if (AXIS_LABEL_DISABLED_TYPES.has(this.type)) return;

        const mgr = this.chart.drawingManager;
        if (!opts.live && mgr && typeof mgr._shouldSkipAxisHighlights === 'function' && mgr._shouldSkipAxisHighlights()) {
            return;
        }
        
        // Remove any existing highlights first
        this.hideAxisHighlights();
        
        const svg = this.chart.svg;
        if (!svg) return;
        
        const yScale = this.chart.yScale || this.chart.scales?.yScale;
        const xScale = this.chart.xScale || this.chart.scales?.xScale;
        if (!yScale || !xScale) return;
        
        const margin = this.chart.margin || { t: 5, r: 60, b: 30, l: 0 };
        const chartWidth = this.chart.w || this.chart.canvas?.width || 800;
        const chartHeight = this.chart.h || this.chart.canvas?.height || 600;
        
        // Compute price decimals matching the chart's current precision setting
        let priceDecimals;
        const _precisionSetting = this.chart.chartSettings?.precision;
        if (_precisionSetting && _precisionSetting !== 'Default') {
            priceDecimals = Math.max(0, Math.min(8, parseInt(_precisionSetting, 10) || 5));
        } else if (typeof this.chart.getPriceDecimals === 'function' && yScale) {
            const _d = yScale.domain();
            const _range = Math.abs((Array.isArray(_d) && _d.length === 2) ? (_d[1] - _d[0]) : 0);
            priceDecimals = this.chart.getPriceDecimals(_range);
        } else {
            priceDecimals = this.chart.priceDecimals || 5;
        }
        
        // Create highlight group for SVG labels only (zones are drawn on canvas)
        this.axisHighlightGroup = svg.append('g')
            .attr('class', 'axis-highlight-group')
            .attr('data-drawing-id', this.id);
        
        // Use the shape's color for time highlights (like TradingView)
        const timeHighlightColor = this.style?.color || this.style?.lineColor || this.style?.stroke || '#2962ff';
        
        // Helper function to determine if color is light (needs dark text)
        const isLightColor = (color) => {
            if (!color) return false;
            let r, g, b;
            if (color.startsWith('#')) {
                const hex = color.replace('#', '');
                if (hex.length === 3) {
                    r = parseInt(hex[0] + hex[0], 16);
                    g = parseInt(hex[1] + hex[1], 16);
                    b = parseInt(hex[2] + hex[2], 16);
                } else {
                    r = parseInt(hex.substr(0, 2), 16);
                    g = parseInt(hex.substr(2, 2), 16);
                    b = parseInt(hex.substr(4, 2), 16);
                }
            } else if (color.startsWith('rgb')) {
                const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    r = parseInt(match[1]);
                    g = parseInt(match[2]);
                    b = parseInt(match[3]);
                }
            } else {
                return false;
            }
            // Calculate luminance (perceived brightness)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance > 0.6; // Light colors have luminance > 0.6
        };
        
        // Determine text color based on background brightness
        const textColor = isLightColor(timeHighlightColor) ? '#131722' : '#ffffff';
        
        // Get unique X positions for time highlights (avoid duplicates)
        const timePositions = new Set();
        
        // Prepare canvas-based zone highlights (drawn behind labels)
        const canvasZones = [];
        const showPriceLabels = this.isAxisLabelEnabled('price');
        const showTimeLabels = this.isAxisLabelEnabled('time');
        
        // Calculate price axis zone (Y-axis)
        if (this.points.length >= 2) {
            let prices = this.points.map(p => p.y);
            if ((this.type === 'long-position' || this.type === 'short-position') && this.meta) {
                ['extraTargets', 'extraEntries', 'extraStops'].forEach((key) => {
                    const arr = this.meta[key];
                    if (!Array.isArray(arr)) return;
                    arr.forEach((row) => {
                        if (row && Number.isFinite(row.y)) prices.push(row.y);
                    });
                });
            }
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const minY = yScale(maxPrice); // Note: Y is inverted
            const maxY = yScale(minPrice);
            const zoneHeight = maxY - minY;
            
            if (showPriceLabels && zoneHeight > 0) {
                canvasZones.push({
                    type: 'price',
                    y: minY,
                    height: zoneHeight
                });
            }
        }
        
        // Calculate time axis zone (X-axis)
        // For position tools, use meta.zoneWidth since all points are on same candle
        let timeZoneStartX = null;
        let timeZoneWidth = 0;
        
        if ((this.type === 'long-position' || this.type === 'short-position') && this.meta?.zoneWidth) {
            // Position tools: use the stored zone width
            const entryIndex = this.points[0]?.x;
            if (entryIndex !== undefined) {
                timeZoneStartX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(entryIndex) : xScale(entryIndex);
                timeZoneWidth = this.meta.zoneWidth;
            }
        } else if (this.points.length >= 2) {
            // Other tools: calculate from point positions
            const indices = this.points.map(p => p.x);
            const minIndex = Math.min(...indices);
            const maxIndex = Math.max(...indices);
            let minX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(minIndex) : xScale(minIndex);
            let maxX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(maxIndex) : xScale(maxIndex);
            if (this.type === 'rectangle' || this.type === 'rotated-rectangle') {
                const extL = SVGHelpers.isStyleFlagOn(this.style, 'extendLeft');
                const extR = SVGHelpers.isStyleFlagOn(this.style, 'extendRight');
                if (extL || extR) {
                    const p1 = this.points[0];
                    const p2 = this.points[1];
                    const px1 = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p1.x) : xScale(p1.x);
                    const px2 = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p2.x) : xScale(p2.x);
                    const hb = (typeof SVGHelpers !== 'undefined' && SVGHelpers.getChartHorizontalPixelBounds)
                        ? SVGHelpers.getChartHorizontalPixelBounds({ chart: this.chart, xScale, yScale })
                        : { left: xScale.range()[0], right: xScale.range()[1] };
                    const leftEdge = Math.min(px1, px2);
                    const rightEdge = Math.max(px1, px2);
                    minX = extL ? hb.left : leftEdge;
                    maxX = extR ? hb.right : rightEdge;
                }
            }
            timeZoneStartX = minX;
            timeZoneWidth = maxX - minX;
        }
        
        if (showTimeLabels && timeZoneWidth > 0 && timeZoneStartX !== null) {
            canvasZones.push({
                type: 'time',
                x: timeZoneStartX,
                width: timeZoneWidth
            });
            
            // Add start and end time labels for ALL tools with time zones
            const boxWidth = 100;
            const boxHeight = 20;
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Get start index - for position tools use entry point, for others use min X
            let startIndex;
            if ((this.type === 'long-position' || this.type === 'short-position')) {
                startIndex = this.points[0]?.x;
            } else {
                const indices = this.points.map(p => p.x);
                startIndex = Math.min(...indices);
            }
            
            // START time label (left edge)
            if (startIndex !== undefined) {
                const roundedStartIndex = Math.round(startIndex);
                let startTime = null;
                const dataLength = this.chart.data?.length || 0;
                
                if (roundedStartIndex >= 0 && roundedStartIndex < dataLength) {
                    const startCandle = this.chart.data?.[roundedStartIndex];
                    if (startCandle && startCandle.t) {
                        startTime = startCandle.t;
                    }
                } else if (roundedStartIndex < 0 && dataLength >= 2) {
                    // Start is before data - extrapolate backwards
                    const firstCandle = this.chart.data[0];
                    const secondCandle = this.chart.data[1];
                    if (firstCandle?.t && secondCandle?.t) {
                        const candleInterval = secondCandle.t - firstCandle.t;
                        startTime = firstCandle.t + (candleInterval * roundedStartIndex);
                    }
                } else if (roundedStartIndex >= dataLength && dataLength >= 2) {
                    // Start is beyond data - extrapolate forward
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedStartIndex - (dataLength - 1);
                        startTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (startTime) {
                    const date = new Date(startTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-start')
                        .attr('x', timeZoneStartX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('stroke', 'rgba(0,0,0,0.35)')
                        .attr('stroke-width', 1)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-start-text')
                        .attr('x', timeZoneStartX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
            
            // END time label (right edge)
            const endX = timeZoneStartX + timeZoneWidth;
            const endIndex = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(endX) : null;
            if (endIndex !== null && endIndex >= 0) {
                let endTime = null;
                const dataLength = this.chart.data?.length || 0;
                const roundedEndIndex = Math.round(endIndex);
                
                if (roundedEndIndex < dataLength) {
                    // End is within candle data
                    const endCandle = this.chart.data?.[roundedEndIndex];
                    if (endCandle && endCandle.t) {
                        endTime = endCandle.t;
                    }
                } else if (dataLength >= 2) {
                    // End is beyond candle data - extrapolate time
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedEndIndex - (dataLength - 1);
                        endTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (endTime) {
                    const date = new Date(endTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-end')
                        .attr('x', endX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('stroke', 'rgba(0,0,0,0.35)')
                        .attr('stroke-width', 1)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-end-text')
                        .attr('x', endX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
        }
        
        let pointsToLabel = this.points;

        if ((this.type === 'long-position' || this.type === 'short-position') && this.meta) {
            const x0 = Number.isFinite(this.points[0]?.x) ? this.points[0].x : 0;
            const extraPts = [];
            ['extraTargets', 'extraEntries', 'extraStops'].forEach((key) => {
                const arr = this.meta[key];
                if (!Array.isArray(arr)) return;
                arr.forEach((row) => {
                    if (row && Number.isFinite(row.y)) {
                        extraPts.push({ x: x0, y: row.y, _rrExtra: key });
                    }
                });
            });
            pointsToLabel = pointsToLabel.concat(extraPts);
        }
        
        // Process each point
        pointsToLabel.forEach((point, idx) => {
            const price = point.y;
            const index = point.x;
            
            // Determine color based on point type for position tools
            let priceColor = this.style?.color || this.style?.lineColor || this.style?.stroke || '#2962ff';
            if (this.type === 'long-position' || this.type === 'short-position') {
                if (point._rrExtra === 'extraEntries') priceColor = '#2196f3';
                else if (point._rrExtra === 'extraStops') priceColor = '#f44336';
                else if (point._rrExtra === 'extraTargets') priceColor = '#4caf50';
                else if (idx === 0) priceColor = '#2196f3'; // Entry - blue
                else if (idx === 1) priceColor = '#f44336'; // Stop - red
                else if (idx === 2) priceColor = '#4caf50'; // Target - green
            }
            
            // Price highlight on Y-axis (right side)
            const yPos = yScale(price);
            if (showPriceLabels && yPos >= margin.t && yPos <= chartHeight - margin.b) {
                const priceText = price.toFixed(priceDecimals);
                const boxWidth = 58;
                const boxHeight = 20;
                
                // Background box with slight transparency
                this.axisHighlightGroup.append('rect')
                    .attr('class', 'axis-highlight-price')
                    .attr('x', chartWidth - margin.r + 2)
                    .attr('y', yPos - boxHeight / 2)
                    .attr('width', boxWidth)
                    .attr('height', boxHeight)
                    .attr('fill', priceColor)
                    .attr('stroke', 'rgba(0,0,0,0.35)')
                    .attr('stroke-width', 1)
                    .attr('rx', 3);
                
                // Price text - determine text color based on price background
                const priceTextColor = isLightColor(priceColor) ? '#131722' : '#ffffff';
                this.axisHighlightGroup.append('text')
                    .attr('class', 'axis-highlight-price-text')
                    .attr('x', chartWidth - margin.r + 2 + boxWidth / 2)
                    .attr('y', yPos + 5)
                    .attr('fill', priceTextColor)
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .attr('text-anchor', 'middle')
                    .text(priceText);
            }
            
            // Time highlight on X-axis (bottom) - only add if not already added for this x position
            const roundedIndex = Math.round(index);
            if (showTimeLabels && !timePositions.has(roundedIndex)) {
                timePositions.add(roundedIndex);
                
                // Use dataIndexToPixel if available, otherwise use xScale
                const xPos = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(index) : xScale(index);
                if (xPos >= margin.l && xPos <= chartWidth - margin.r) {
                    // Get time from candle data, extrapolating if index is out of range
                    const dataLength = this.chart.data?.length || 0;
                    let candleTime = null;
                    const candle = this.chart.data?.[roundedIndex];
                    if (candle && candle.t) {
                        candleTime = candle.t;
                    } else if (dataLength >= 2) {
                        const firstCandle = this.chart.data[0];
                        const lastCandle = this.chart.data[dataLength - 1];
                        const prevCandle = this.chart.data[dataLength - 2];
                        const candleInterval = lastCandle.t - prevCandle.t;
                        if (roundedIndex < 0 && firstCandle?.t) {
                            candleTime = firstCandle.t + (candleInterval * roundedIndex);
                        } else if (roundedIndex >= dataLength && lastCandle?.t) {
                            candleTime = lastCandle.t + (candleInterval * (roundedIndex - (dataLength - 1)));
                        }
                    }
                    if (candleTime !== null) {
                        const date = new Date(candleTime);
                        const day = date.getDate().toString().padStart(2, '0');
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = months[date.getMonth()];
                        const year = date.getFullYear().toString().slice(-2);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const mins = date.getMinutes().toString().padStart(2, '0');
                        const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                        
                        const boxWidth = 100;
                        const boxHeight = 20;
                        
                        // Background box
                        this.axisHighlightGroup.append('rect')
                            .attr('class', 'axis-highlight-time')
                            .attr('x', xPos - boxWidth / 2)
                            .attr('y', chartHeight - margin.b + 4)
                            .attr('width', boxWidth)
                            .attr('height', boxHeight)
                            .attr('fill', timeHighlightColor)
                            .attr('stroke', 'rgba(0,0,0,0.35)')
                            .attr('stroke-width', 1)
                            .attr('rx', 3);
                        
                        // Time text
                        this.axisHighlightGroup.append('text')
                            .attr('class', 'axis-highlight-time-text')
                            .attr('x', xPos)
                            .attr('y', chartHeight - margin.b + 17)
                            .attr('fill', textColor)
                            .attr('font-size', '11px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle')
                            .text(timeText);
                    }
                }
            }
        });
        
        // Set canvas-based zones (drawn behind labels in drawAxes)
        // Keep these shaded zones ONLY for selected drawings.
        if (this.selected && this.chart.setAxisHighlightZones && canvasZones.length > 0) {
            this.chart.setAxisHighlightZones(canvasZones);
            this.hasAxisHighlightZones = true;
            // Trigger re-render to show the zones (skip during live resize/drag — chart redraws on release)
            if (!opts.live && this.chart.scheduleRender) {
                this.chart.scheduleRender();
            }
        }
    }
    
    /**
     * Hide axis highlight labels
     */
    hideAxisHighlights() {
        if (this.axisHighlightGroup) {
            this.axisHighlightGroup.remove();
            this.axisHighlightGroup = null;
        }
        if (this._labelGroup) {
            this._labelGroup.remove();
            this._labelGroup = null;
        }
        // Also remove orphaned groups for this drawing only (do not affect other drawings)
        if (this.chart?.svg) {
            this.chart.svg.selectAll(`.axis-highlight-group[data-drawing-id="${this.id}"]`).remove();
            this.chart.svg.selectAll(`.drawings-labels [data-id="${this.id}"]`).remove();
        }
        // Clear canvas-based zones only if this drawing had set them.
        // Guard: never call scheduleRender from inside a render cycle (would cause
        // infinite recursion when scheduleRender is synchronous, e.g. during replay).
        if (this.hasAxisHighlightZones && this.chart?.clearAxisHighlightZones) {
            this.chart.clearAxisHighlightZones();
            const mgr = this.chart.drawingManager;
            const skipSchedule = this.chart._isRendering
                || (mgr && typeof mgr._shouldSkipAxisHighlights === 'function' && mgr._shouldSkipAxisHighlights());
            if (this.chart.scheduleRender && !skipSchedule) {
                this.chart.scheduleRender();
            }
        }
        this.hasAxisHighlightZones = false;
    }

    /**
     * Serialize to JSON for persistence
     * Stores timestamps for multi-timeframe support
     */
    toJSON() {
        let serializedPoints = this.points;
        let coordinateSystem = 'index';
        
        // CRITICAL: Use stored timestamps if available (never recalculate from indices)
        // This ensures drawings maintain their position across timeframe changes
        if (this.timestampPoints && this.timestampPoints.length > 0) {
            serializedPoints = this.timestampPoints;
            coordinateSystem = 'timestamp';
        } 
        // Only calculate timestamps if not already stored (first save after creation)
        else if (this.chart && this.chart.data && this.chart.data.length > 0) {
            // Use CoordinateUtils for extrapolation support with correct timeframe
            const timeframe = this.chart.currentTimeframe || null;
            serializedPoints = this.points.map(p => {
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
            coordinateSystem = 'timestamp';
            
            // Store these timestamps permanently
            this.timestampPoints = serializedPoints;
        }
        
        return {
            id: this.id,
            type: this.type,
            points: serializedPoints,
            coordinateSystem: coordinateSystem,
            style: this.style,
            visible: this.visible,
            visibility: this.visibility,
            meta: this.meta,
            text: this.text,
            baseScale: this.baseScale
        };
    }

    /**
     * Create from JSON
     * Handles both timestamp-based (new) and index-based (legacy) formats
     * Note: Points will be in timestamp format here, conversion to indices happens in manager
     */
    static fromJSON(data, chart = null) {
        // Subclass constructors take (points, style), NOT (type, points, style)
        // The type is set internally by each subclass in super() call
        const drawing = new this(data.points || [], data.style || {});
        drawing.id = data.id;
        drawing.visible = data.visible !== undefined ? data.visible : true;
        drawing.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        drawing.text = data.text || '';
        drawing.coordinateSystem = data.coordinateSystem || 'index'; // Default to legacy format
        drawing.chart = chart;
        drawing.baseScale = data.baseScale || null; // Restore zoom scale reference
        
        // Restore locked state
        if (data.locked !== undefined) {
            drawing.locked = data.locked;
        }
        
        // Restore timeframe visibility
        if (data.visibility) {
            drawing.visibility = data.visibility;
        }
        
        // Store timestamp points only when JSON still has wall-clock anchors (not post-conversion {x,y})
        if (data.coordinateSystem === 'timestamp' && Array.isArray(data.points) && data.points.length > 0) {
            const first = data.points[0];
            if (first && Number.isFinite(first.timestamp)) {
                drawing.timestampPoints = data.points.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price !== undefined ? p.price : p.y
                }));
            }
        }
        
        return drawing;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        // Hide axis highlights before removing the drawing
        this.hideAxisHighlights();

        // Safety cleanup for any detached label groups outside the drawing group
        if (this.chart?.svg) {
            this.chart.svg.selectAll(`.drawings-labels [data-id="${this.id}"]`).remove();
        }
        
        if (this.group) {
            this.group.remove();
        }
        this.handles = [];
        this.group = null;
    }
}

// ============================================================================
// Drawing State Manager
// ============================================================================
class DrawingState {
    constructor() {
        this.currentTool = null;
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    reset() {
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    startDrawing(tool, requiredPoints) {
        this.currentTool = tool;
        this.isDrawing = true;
        this.tempPoints = [];
        this.requiredPoints = requiredPoints;
    }

    addPoint(point) {
        this.tempPoints.push(point);
        // For continuous drawing (requiredPoints = -1), never auto-complete
        if (this.requiredPoints === -1) {
            return false;
        }
        // For point-by-point drawing (requiredPoints = -2), never auto-complete
        if (this.requiredPoints === -2) {
            return false;
        }
        return this.tempPoints.length >= this.requiredPoints;
    }

    isComplete() {
        // For continuous drawing (requiredPoints = -1), check for minimum points
        if (this.requiredPoints === -1) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a path
        }
        // For point-by-point drawing (requiredPoints = -2), check for minimum points
        if (this.requiredPoints === -2) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a polyline
        }
        return this.tempPoints.length >= this.requiredPoints;
    }
}

// ============================================================================
// Coordinate Utilities
// ============================================================================
class CoordinateUtils {
    /**
     * Convert screen coordinates to data coordinates
     * Note: X coordinate is candle INDEX, not timestamp - snapped to candle center unless continuous mode
     * @param {boolean} continuous - If true, don't round x to allow smooth freehand drawing
     */
    static screenToData(screenX, screenY, scales, chart = null, continuous = false) {
        if (!scales || !scales.yScale || typeof scales.yScale.invert !== 'function') {
            return { x: NaN, y: NaN };
        }
        const hasXInvert = scales.xScale && typeof scales.xScale.invert === 'function';
        // Use chart's helper methods if available for accurate index calculation
        const rawX = chart && chart.pixelToDataIndex ? 
            chart.pixelToDataIndex(screenX) : 
            (hasXInvert ? scales.xScale.invert(screenX) : NaN);
            
        return {
            x: continuous ? rawX : Math.round(rawX),  // Keep fractional for freehand, snap for others
            y: scales.yScale.invert(screenY)  // This is the price
        };
    }

    /**
     * Convert data coordinates to screen coordinates
     * Note: dataX should be candle INDEX, not timestamp
     */
    static dataToScreen(dataX, dataY, scales, chart = null) {
        if (!scales || !scales.yScale || typeof scales.yScale !== 'function') {
            return { x: NaN, y: NaN };
        }
        // Use chart's helper methods if available for accurate pixel calculation
        const x = chart && chart.dataIndexToPixel ? 
            chart.dataIndexToPixel(dataX) : 
            (scales.xScale && typeof scales.xScale === 'function' ? scales.xScale(dataX) : NaN);
            
        return {
            x: x,
            y: scales.yScale(dataY)
        };
    }

    /**
     * Snap to nearest OHLC value (for magnet mode)
     * @param {Object} point - {x: dataIndex, y: price}
     * @param {Array} data - Chart candle data
     * @param {Object} scales - {xScale, yScale}
     * @param {string|boolean} magnetMode - 'off', 'weak', 'strong', or boolean for backward compatibility
     * @returns {Object} - Snapped point {x: dataIndex, y: price}
     */
    static snapToOHLC(point, data, scales, magnetMode = 'off') {
        // Handle boolean for backward compatibility
        if (magnetMode === false || magnetMode === 'off') {
            return point;
        }
        if (magnetMode === true) {
            magnetMode = 'weak'; // Default to weak for backward compatibility
        }
        
        if (!data || data.length === 0) {
            return point;
        }

        // Define snap thresholds based on magnet strength
        // Weak: only snap if very close to OHLC (within ~20% of price range)
        // Strong: always snap to nearest OHLC
        const isStrong = magnetMode === 'strong';
        
        // Point.x is already a candle index, so just round it to nearest integer
        const nearestIndex = Math.round(Math.max(0, Math.min(data.length - 1, point.x)));
        const nearestCandle = data[nearestIndex];
        
        if (!nearestCandle) {
            return point;
        }

        // Find nearest OHLC value (handle both short and long property names)
        const open = nearestCandle.o ?? nearestCandle.open;
        const high = nearestCandle.h ?? nearestCandle.high;
        const low = nearestCandle.l ?? nearestCandle.low;
        const close = nearestCandle.c ?? nearestCandle.close;
        
        const ohlc = [open, high, low, close].filter(v => v !== undefined && v !== null && !isNaN(v));
        
        // If no valid OHLC values, return original point
        if (ohlc.length === 0) {
            return point;
        }

        const nearestPrice = ohlc.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev - point.y);
            const currDiff = Math.abs(curr - point.y);
            return currDiff < prevDiff ? curr : prev;
        });

        // For weak magnet, check if we're close enough to snap
        if (!isStrong) {
            const candleRange = high - low;
            const snapThreshold = candleRange * 0.3; // 30% of candle range
            const distanceToNearest = Math.abs(nearestPrice - point.y);
            
            // Only snap if within threshold
            if (distanceToNearest > snapThreshold) {
                return {
                    x: nearestIndex,  // Still snap X to candle
                    y: point.y        // Keep original Y
                };
            }
        }

        // Strong magnet or within threshold: snap both X and Y
        return {
            x: nearestIndex,
            y: nearestPrice
        };
    }

    /**
     * Get interval in milliseconds from timeframe string
     * @param {string} timeframe - Timeframe like '1m', '5m', '1h', etc.
     * @returns {number|null} - Interval in milliseconds or null if unknown
     */
    static getIntervalFromTimeframe(timeframe) {
        if (!timeframe) return null;
        
        const tf = timeframe.toLowerCase();
        const num = parseInt(tf) || 1;
        
        if (tf.includes('m') && !tf.includes('mo')) {
            return num * 60 * 1000; // minutes
        } else if (tf.includes('h')) {
            return num * 60 * 60 * 1000; // hours
        } else if (tf.includes('d')) {
            return num * 24 * 60 * 60 * 1000; // days
        } else if (tf.includes('w')) {
            return num * 7 * 24 * 60 * 60 * 1000; // weeks
        } else if (tf.includes('mo')) {
            return num * 30 * 24 * 60 * 60 * 1000; // months (approx)
        }
        
        return null;
    }

    /**
     * Convert candle index to timestamp
     * Supports extrapolation for indices beyond data range (for replay mode)
     * @param {number} index - Candle index in data array
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Timestamp in milliseconds
     */
    static indexToTimestamp(index, data, timeframe = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ indexToTimestamp: No data!');
            return Date.now(); // Return current time if no data
        }
        
        // CRITICAL: Preserve fractional index for brush stroke smoothness
        const baseIndex = Math.floor(index);
        const fraction = index - baseIndex;
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        // If index is within data range, use actual bucket span (handles weekend gaps on 1d/1h)
        if (baseIndex >= 0 && baseIndex < data.length) {
            const baseTs = data[baseIndex]?.t || 0;
            const nextTs = (baseIndex < data.length - 1) ? data[baseIndex + 1].t : (baseTs + interval);
            const bucketMs = Math.max(1, nextTs - baseTs);
            return baseTs + (fraction * bucketMs);
        }
        
        // Extrapolate for indices beyond data range (preserve fractional precision)
        if (index >= data.length) {
            // Beyond end of data - extrapolate forward
            const lastCandle = data[data.length - 1];
            const candlesBeyond = index - (data.length - 1);
            return lastCandle.t + (candlesBeyond * interval);
        } else if (index < 0) {
            // Before start of data - extrapolate backward
            const firstCandle = data[0];
            return firstCandle.t + (index * interval); // index is negative
        }
        
        return 0;
    }

    /**
     * Convert timestamp to candle index using binary search
     * Supports extrapolation for timestamps beyond data range (for replay mode)
     * @param {number} timestamp - Timestamp in milliseconds
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Candle index (may be beyond data range for extrapolated positions)
     */
    static timestampToIndex(timestamp, data, timeframe = null, options = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ timestampToIndex: No data!');
            return 0;
        }
        
        const firstCandle = data[0];
        const lastCandle = data[data.length - 1];
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        const firstT = firstCandle.t;
        const lastT = lastCandle.t;
        const replayClamp = !!(options && options.replayClampToLastBar);

        // Extrapolate before/after loaded window (replay drawings off-screen left/right)
        if (timestamp < firstT) {
            return -(firstT - timestamp) / interval;
        }
        if (timestamp > lastT) {
            if (replayClamp) {
                return data.length - 1;
            }
            return (data.length - 1) + (timestamp - lastT) / interval;
        }

        // Binary search: largest i where data[i].t <= timestamp
        let lo = 0;
        let hi = data.length - 1;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (data[mid].t <= timestamp) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        const i = lo;
        const candleT = data[i].t;
        if (timestamp === candleT) {
            return i;
        }

        const nextT = (i < data.length - 1) ? data[i + 1].t : (candleT + interval);
        const bucketMs = Math.max(1, nextT - candleT);
        const fraction = Math.min(1, Math.max(0, (timestamp - candleT) / bucketMs));
        return i + fraction;
    }

    /**
     * Convert points from index-based to timestamp-based coordinates
     * @param {Array} points - Array of {x: index, y: price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {timestamp, price} points
     */
    static pointsToTimestamps(points, data, timeframe = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => ({
            timestamp: this.indexToTimestamp(p.x, data, timeframe),
            price: p.y
        }));
    }

    /**
     * Convert points from timestamp-based to index-based coordinates
     * Preserves extrapolated indices for areas beyond data range (replay mode)
     * @param {Array} points - Array of {timestamp, price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {x: index, y: price} points
     */
    static pointsFromTimestamps(points, data, timeframe = null, options = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => {
            const index = this.timestampToIndex(p.timestamp || 0, data, timeframe, options);
            
            // Don't clamp - allow extrapolated indices for replay mode
            return {
                x: index,
                y: p.price || p.y
            };
        });
    }

    /**
     * Resolve live drawing points from persisted timestamp anchors + current chart.data.
     * chart.data is the same series dataIndexToPixel/xScale use (required for TF switches).
     */
    static resolveDrawingPoints(drawing, chart) {
        if (!drawing || !chart || !Array.isArray(chart.data) || chart.data.length === 0) {
            return drawing?.points || [];
        }
        const tsOpts = (chart.replaySystem && chart.replaySystem.isActive
            && drawing.type !== 'brush' && drawing.type !== 'highlighter'
            && drawing.type !== 'rectangle' && drawing.type !== 'rotated-rectangle'
            && drawing.type !== 'triangle' && drawing.type !== 'ellipse'
            && drawing.type !== 'circle' && drawing.type !== 'arc')
            ? { replayClampToLastBar: true }
            : null;
        if (drawing.timestampPoints && drawing.timestampPoints.length > 0) {
            return this.pointsFromTimestamps(
                drawing.timestampPoints,
                chart.data,
                chart.currentTimeframe,
                tsOpts
            );
        }
        return drawing.points || [];
    }

    /**
     * Calculate distance between two points
     */
    static distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Check if point is near a line segment
     */
    static isNearLine(point, lineStart, lineEnd, threshold = 5) {
        const d = this.distanceToLine(point, lineStart, lineEnd);
        return d < threshold;
    }

    /**
     * Calculate distance from point to line segment
     */
    static distanceToLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// ============================================================================
// SVG Helper Functions
// ============================================================================
class SVGHelpers {
    /**
     * Create arrow marker definition
     */
    static createArrowMarker(svg, id, color = '#5dd3edff') {
        let defs = svg.select('defs');
        if (defs.empty()) {
            defs = svg.append('defs');
        }

        let marker = defs.select(`marker#${id}`);
        if (marker.empty()) {
            marker = defs.append('marker')
                .attr('id', id)
                .attr('viewBox', '0 0 10 10')
                .attr('refX', 9)
                .attr('refY', 5)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto-start-reverse');

            marker.append('path')
                .attr('d', 'M 0 0 L 10 5 L 0 10 z');
        }

        marker.select('path')
            .attr('fill', color);

        return `url(#${id})`;
    }

    /**
     * Apply hover effect to drawing
     */
    static applyHoverEffect(element, isHovering) {
        if (isHovering) {
            element
                .style('cursor', 'default');
        } else {
            element
                .style('cursor', 'default');
        }
    }

    /**
     * Full horizontal plot bounds in pixel space (left/right pane edges).
     * Used by rectangle extend — must span the drawable chart area (incl. empty space
     * right of the last bar), not only the currently visible bar index range.
     */
    static getChartHorizontalPixelBounds(scales) {
        const chart = scales && scales.chart;
        const m = (chart && chart.margin) ? chart.margin : { l: 0, r: 60 };
        const plotLeft = typeof m.l === 'number' ? m.l : 0;
        let plotW = chart && chart.w;
        if (!Number.isFinite(plotW) && chart && chart.svg && typeof chart.svg.node === 'function') {
            const attrW = parseFloat(chart.svg.node().getAttribute('width'));
            if (Number.isFinite(attrW)) plotW = attrW;
        }
        if (!Number.isFinite(plotW) && chart && chart.canvas) {
            plotW = chart.canvas.clientWidth || chart.canvas.width;
        }
        if (Number.isFinite(plotW)) {
            const plotRight = plotW - (typeof m.r === 'number' ? m.r : 0);
            if (plotRight > plotLeft) return { left: plotLeft, right: plotRight };
        }
        if (scales && scales.xScale && typeof scales.xScale.range === 'function') {
            const r = scales.xScale.range();
            if (r && r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0]) {
                return { left: r[0], right: r[1] };
            }
        }
        return { left: plotLeft, right: plotLeft + 1 };
    }

    /** @deprecated Use BaseDrawing.isStyleFlagOn */
    static isStyleFlagOn(style, key) {
        return BaseDrawing.isStyleFlagOn(style, key);
    }

    /** @deprecated Use BaseDrawing.resolveStrokeDasharray */
    static resolveStrokeDasharray(style) {
        return BaseDrawing.resolveStrokeDasharray(style);
    }

    /**
     * Apply selection effect to drawing
     */
    static applySelectionEffect(element, isSelected) {
        if (isSelected) {
            element
                .style('stroke-width', parseFloat(element.style('stroke-width') || 2) + 1);
        } else {
            element
                .style('stroke-width', parseFloat(element.attr('data-original-width') || 2));
        }
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateUUID,
        BaseDrawing,
        DrawingState,
        CoordinateUtils,
        SVGHelpers
    };
}
