/**
 * Drawing Tools - Shape Tools Module
 * Implements: Rectangle, Ellipse/Circle, Triangle, Arrow
 */

const RECTANGLE_TEXT_DEFAULTS = {
    fontFamily: 'Roboto, sans-serif',
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#FFFFFF',
    textAlign: 'center',
    textPosition: 'top',
    textOffsetX: 0,
    textOffsetY: 0,
    textPadding: 12
};

const RECTANGLE_TEXT_ANCHOR_MAP = (typeof TEXT_ALIGN_TO_ANCHOR !== 'undefined')
    ? TEXT_ALIGN_TO_ANCHOR
    : { left: 'start', center: 'middle', right: 'end', start: 'start', end: 'end' };

/** Line/arrow tools: V9 uses vertAlign "center"; chart uses textVAlign/textPosition "middle". */
function normalizeLineTextVAlign(style) {
    if (!style) return 'top';
    let v = String(style.textVAlign || style.textPosition || 'top').toLowerCase();
    if (v === 'center') v = 'middle';
    if (v === 'start') v = 'top';
    if (v === 'end') v = 'bottom';
    style.textVAlign = v;
    style.textPosition = v;
    return v;
}

function lineTextOffsetY(style, textVAlign) {
    if (textVAlign === 'middle') return 0;
    if (Number.isFinite(style.textOffsetY)) return style.textOffsetY;
    return style.textOffsetY === undefined ? -8 : 0;
}

/** Match `LINE_LABEL_OFFSET` in drawing-tools-lines.js — gap from stroke to label anchor. */
function shapeExternalLabelOffset(fontSize) {
    const LINE_LABEL_OFFSET = 14;
    const fs = Number(fontSize) || RECTANGLE_TEXT_DEFAULTS.fontSize;
    return LINE_LABEL_OFFSET + Math.max(0, fs / 2 - 6);
}

function resolveShapeTextSvgAnchor(align, text) {
    const a = String(align || 'center').toLowerCase();
    if (a === 'left' || a === 'start') {
        return typeof resolveLineEndpointSvgAnchor === 'function'
            ? resolveLineEndpointSvgAnchor('left', text)
            : 'start';
    }
    if (a === 'right' || a === 'end') {
        return typeof resolveLineEndpointSvgAnchor === 'function'
            ? resolveLineEndpointSvgAnchor('right', text)
            : 'end';
    }
    return 'middle';
}

/** Same default-zeroing as trendline / ray tools (`textOffsetY: -8` → no extra shift). */
function shapeTextOffsetY(style) {
    const raw = style && style.textOffsetY;
    if (raw === undefined || raw === null || raw === -8) return 0;
    if (Number.isFinite(raw)) return raw;
    return 0;
}

function isRectangleExtendOn(style, key) {
    const v = style && style[key];
    return v === true || v === 1
        || (typeof v === 'string' && /^(true|1|yes)$/i.test(String(v).trim()));
}

function shapeMiddleLineEnabled(style) {
    const sm = style && style.showMiddleLine;
    return sm === true || sm === 1
        || (typeof sm === 'string' && /^(true|1|yes)$/i.test(String(sm).trim()));
}

/** Plot L/R in the same pixel space as chart.dataIndexToPixel (margin.l … w − margin.r). */
function getRectanglePlotHorizontalBounds(scales) {
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
    if (typeof SVGHelpers !== 'undefined' && SVGHelpers.getChartHorizontalPixelBounds) {
        return SVGHelpers.getChartHorizontalPixelBounds(scales);
    }
    if (scales && scales.xScale && typeof scales.xScale.range === 'function') {
        const r = scales.xScale.range();
        if (r && r.length >= 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0]) {
            return { left: r[0], right: r[1] };
        }
    }
    return { left: plotLeft, right: plotLeft + 1 };
}

/** Extend a segment to plot horizontal edges (dataIndexToPixel space). */
function extendSegmentToPlotHorizontalEdges(x1, y1, x2, y2, scales, extendLeft, extendRight) {
    if (!extendLeft && !extendRight) return { x1, y1, x2, y2 };
    const bounds = getRectanglePlotHorizontalBounds(scales);
    let outX1 = x1;
    let outY1 = y1;
    let outX2 = x2;
    let outY2 = y2;
    const dx = x2 - x1;
    if (Math.abs(dx) < 1e-9) return { x1: outX1, y1: outY1, x2: outX2, y2: outY2 };
    const slope = (y2 - y1) / dx;
    const yAt = (x) => y1 + slope * (x - x1);
    if (extendLeft) {
        outX1 = bounds.left;
        outY1 = yAt(bounds.left);
    }
    if (extendRight) {
        outX2 = bounds.right;
        outY2 = yAt(bounds.right);
    }
    return { x1: outX1, y1: outY1, x2: outX2, y2: outY2 };
}

/** Apply rectangle extend-left/right in pixel space (same coords as dataIndexToPixel). */
function applyRectangleHorizontalExtend(x1, x2, scales, style) {
    if (!style || (!isRectangleExtendOn(style, 'extendLeft') && !isRectangleExtendOn(style, 'extendRight'))) {
        return { x1, x2 };
    }
    const bounds = getRectanglePlotHorizontalBounds(scales);
    let leftEdge = Math.min(x1, x2);
    let rightEdge = Math.max(x1, x2);
    if (isRectangleExtendOn(style, 'extendLeft')) {
        leftEdge = bounds.left;
    }
    if (isRectangleExtendOn(style, 'extendRight')) {
        rightEdge = bounds.right;
    }
    return { x1: leftEdge, x2: rightEdge };
}

/** Respect V9 / settings `showBackground` (default on when unset). */
function shapeBackgroundFill(style, defaultFill) {
    if (style && style.showBackground === false) return 'none';
    const fallback = (defaultFill && defaultFill !== 'none' && defaultFill !== 'transparent')
        ? defaultFill
        : (typeof DRAWING_TOOL_DEFAULT_FILL !== 'undefined' ? DRAWING_TOOL_DEFAULT_FILL : 'rgba(140, 140, 140, 0.2)');
    const raw = style && (style.fill ?? style.backgroundColor);
    if (raw === 'none' || raw === 'transparent') return fallback;
    return raw || fallback;
}

/** Respect V9 / settings `borderEnabled` (default on when unset). */
function shapeBorderVisible(style) {
    return !style || style.borderEnabled !== false;
}

/** Effective border stroke props (V9 uses borderColor/borderDasharray/borderWidth). */
function resolveShapeBorderDrawStyle(style, scaleFactor = 1) {
    const rawWidth = style && style.borderWidth != null && style.borderWidth !== ''
        ? style.borderWidth
        : (style && style.strokeWidth);
    const baseWidth = parseFloat(rawWidth);
    const width = Math.max(0.5, (Number.isFinite(baseWidth) ? baseWidth : 1) * scaleFactor);
    const stroke = (style && style.borderColor && style.borderColor !== 'none')
        ? style.borderColor
        : (style && style.stroke ? style.stroke : '#787b86');
    const dash = style && style.borderDasharray != null && style.borderDasharray !== undefined
        ? style.borderDasharray
        : (style && (style.strokeDasharray || style.dashArray || ''));
    return { stroke, width, dash };
}

/**
 * Append visible border + transparent hit-stroke lines for shape edges.
 * @param {d3.Selection} group
 * @param {Array<{x1:number,y1:number,x2:number,y2:number,name?:string}>} edges
 * @param {Object} style
 * @param {number} scaleFactor
 * @param {{ hitWidth?: number, respectBorderToggle?: boolean }} [opts]
 */
function appendShapeBorderEdgeLines(group, edges, style, scaleFactor = 1, opts = {}) {
    const respectBorderToggle = opts.respectBorderToggle !== false;
    const borderOn = respectBorderToggle ? shapeBorderVisible(style) : true;
    const borderStyle = resolveShapeBorderDrawStyle(style, scaleFactor);
    const hitWidth = opts.hitWidth ?? Math.max(16, borderStyle.width * 5);

    edges.forEach((edge) => {
        if (borderOn) {
            group.append('line')
                .attr('class', 'shape-border')
                .attr('x1', edge.x1)
                .attr('y1', edge.y1)
                .attr('x2', edge.x2)
                .attr('y2', edge.y2)
                .attr('stroke', borderStyle.stroke)
                .attr('stroke-width', borderStyle.width)
                .attr('stroke-dasharray', borderStyle.dash)
                .attr('stroke-linecap', 'butt')
                .attr('stroke-linejoin', 'miter')
                .attr('opacity', style.opacity)
                .attr('data-edge', edge.name || '')
                .attr('data-original-width', style.borderWidth != null ? style.borderWidth : style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', edge.x1)
            .attr('y1', edge.y1)
            .attr('x2', edge.x2)
            .attr('y2', edge.y2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', hitWidth)
            .attr('data-edge', edge.name || '')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');
    });
}

/**
 * Append visible border + hit-stroke segments along a closed/open polyline.
 * @param {d3.Selection} group
 * @param {Array<{x:number,y:number}>} polyPts
 * @param {Object} style
 * @param {number} scaleFactor
 * @param {{ hitWidth?: number, closed?: boolean }} [opts]
 */
function appendShapeBorderPolylineLines(group, polyPts, style, scaleFactor = 1, opts = {}) {
    const closed = opts.closed !== false;
    const borderOn = shapeBorderVisible(style);
    const borderStyle = resolveShapeBorderDrawStyle(style, scaleFactor);
    const hitWidth = opts.hitWidth ?? Math.max(16, borderStyle.width * 5);
    const n = polyPts.length;
    if (n < 2) return;

    const segmentCount = closed ? n : n - 1;
    for (let i = 0; i < segmentCount; i++) {
        const pA = polyPts[i];
        const pB = polyPts[(i + 1) % n];

        if (borderOn) {
            group.append('line')
                .attr('class', 'shape-border')
                .attr('x1', pA.x)
                .attr('y1', pA.y)
                .attr('x2', pB.x)
                .attr('y2', pB.y)
                .attr('stroke', borderStyle.stroke)
                .attr('stroke-width', borderStyle.width)
                .attr('stroke-dasharray', borderStyle.dash)
                .attr('stroke-linecap', 'butt')
                .attr('stroke-linejoin', 'miter')
                .attr('opacity', style.opacity)
                .attr('data-original-width', style.borderWidth != null ? style.borderWidth : style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', pA.x)
            .attr('y1', pA.y)
            .attr('x2', pB.x)
            .attr('y2', pB.y)
            .attr('stroke', 'transparent')
            .attr('stroke-width', hitWidth)
            .attr('opacity', style.opacity)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');
    }
}

/** Axis-aligned box bounds in data space (top = higher price). */
function boxBoundsFromPoints(points) {
    const p1 = points[0];
    const p2 = points[1];
    return {
        left: Math.min(p1.x, p2.x),
        right: Math.max(p1.x, p2.x),
        top: Math.max(p1.y, p2.y),
        bottom: Math.min(p1.y, p2.y),
    };
}

/** Corner role from cursor quadrant relative to the fixed anchor corner. */
function deriveBoxCornerRole(dataPoint, anchorX, anchorY) {
    const rightOf = dataPoint.x > anchorX;
    const aboveAnchor = dataPoint.y > anchorY;
    if (!rightOf && aboveAnchor) return 'corner-tl';
    if (rightOf && aboveAnchor) return 'corner-tr';
    if (!rightOf && !aboveAnchor) return 'corner-bl';
    return 'corner-br';
}

/** Shift + corner drag: keep a square from the opposite corner (TradingView-style). */
function squareConstrainedBoxPoint(role, start, dataPoint) {
    if (!start || !dataPoint || !role || !String(role).startsWith('corner-')) {
        return dataPoint;
    }
    let ax = start.left;
    let ay = start.top;
    switch (role) {
        case 'corner-br':
            ax = start.left;
            ay = start.top;
            break;
        case 'corner-tl':
            ax = start.right;
            ay = start.bottom;
            break;
        case 'corner-tr':
            ax = start.left;
            ay = start.bottom;
            break;
        case 'corner-bl':
            ax = start.right;
            ay = start.top;
            break;
        default:
            return dataPoint;
    }
    const dx = dataPoint.x - ax;
    const dy = dataPoint.y - ay;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    if (!Number.isFinite(size) || size === 0) return { ...dataPoint };
    return {
        x: ax + (dx >= 0 ? size : -size),
        y: ay + (dy >= 0 ? size : -size)
    };
}

/**
 * TradingView-style box resize: opposite edge/corner from drag start stays fixed;
 * crossing flips which handle is active so resize continues instead of collapsing to a line.
 */
function applyBoxHandleDragWithFlip(role, start, dataPoint) {
    if (!start || !dataPoint || !role) return null;

    let left = start.left;
    let right = start.right;
    let top = start.top;
    let bottom = start.bottom;
    let activeRole = role;

    switch (role) {
        case 'side-left':
            if (dataPoint.x <= start.right) {
                left = dataPoint.x;
                right = start.right;
                activeRole = 'side-left';
            } else {
                // Crossed right edge — anchor at crossed edge, not original left
                left = start.right;
                right = dataPoint.x;
                activeRole = 'side-right';
            }
            break;
        case 'side-right':
            if (dataPoint.x >= start.left) {
                right = dataPoint.x;
                left = start.left;
                activeRole = 'side-right';
            } else {
                right = start.left;
                left = dataPoint.x;
                activeRole = 'side-left';
            }
            break;
        case 'side-top':
            if (dataPoint.y >= start.bottom) {
                top = dataPoint.y;
                bottom = start.bottom;
                activeRole = 'side-top';
            } else {
                top = start.bottom;
                bottom = dataPoint.y;
                activeRole = 'side-bottom';
            }
            break;
        case 'side-bottom':
            if (dataPoint.y <= start.top) {
                bottom = dataPoint.y;
                top = start.top;
                activeRole = 'side-bottom';
            } else {
                bottom = start.top;
                top = dataPoint.y;
                activeRole = 'side-top';
            }
            break;
        case 'corner-tl': {
            const ax = start.right;
            const ay = start.bottom;
            left = Math.min(dataPoint.x, ax);
            right = Math.max(dataPoint.x, ax);
            top = Math.max(dataPoint.y, ay);
            bottom = Math.min(dataPoint.y, ay);
            activeRole = deriveBoxCornerRole(dataPoint, ax, ay);
            break;
        }
        case 'corner-tr': {
            const ax = start.left;
            const ay = start.bottom;
            left = Math.min(dataPoint.x, ax);
            right = Math.max(dataPoint.x, ax);
            top = Math.max(dataPoint.y, ay);
            bottom = Math.min(dataPoint.y, ay);
            activeRole = deriveBoxCornerRole(dataPoint, ax, ay);
            break;
        }
        case 'corner-br': {
            const ax = start.left;
            const ay = start.top;
            left = Math.min(dataPoint.x, ax);
            right = Math.max(dataPoint.x, ax);
            top = Math.max(dataPoint.y, ay);
            bottom = Math.min(dataPoint.y, ay);
            activeRole = deriveBoxCornerRole(dataPoint, ax, ay);
            break;
        }
        case 'corner-bl': {
            const ax = start.right;
            const ay = start.top;
            left = Math.min(dataPoint.x, ax);
            right = Math.max(dataPoint.x, ax);
            top = Math.max(dataPoint.y, ay);
            bottom = Math.min(dataPoint.y, ay);
            activeRole = deriveBoxCornerRole(dataPoint, ax, ay);
            break;
        }
        default:
            return null;
    }

    return {
        left: Math.min(left, right),
        right: Math.max(left, right),
        top: Math.max(top, bottom),
        bottom: Math.min(top, bottom),
        activeRole,
    };
}

// ============================================================================
// Rectangle Tool
// ============================================================================
class RectangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('rectangle', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        Object.keys(RECTANGLE_TEXT_DEFAULTS).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = RECTANGLE_TEXT_DEFAULTS[key];
            }
        });

        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || RECTANGLE_TEXT_DEFAULTS.textColor;
        }

        if (!Number.isFinite(this.style.textPadding)) {
            this.style.textPadding = RECTANGLE_TEXT_DEFAULTS.textPadding;
        }
    }

    _normalizeRectTextVAlign(style) {
        let position = (style.textVAlign || style.textPosition || 'top').toLowerCase();
        if (position === 'start') position = 'top';
        if (position === 'end') position = 'bottom';
        if (position === 'center') position = 'middle';
        return position;
    }

    /** Shared text placement + optional midline gap when label crosses the horizontal center. */
    _computeRectangleTextLayout(bounds, scaleFactor, measureGroup) {
        const empty = { hasText: false };
        if (!this.text || !this.text.trim()) return empty;

        const { x, y, width, height } = bounds;
        const rawPadding = Number.isFinite(this.style.textPadding) ? this.style.textPadding : RECTANGLE_TEXT_DEFAULTS.textPadding;
        const clampedPadding = Math.max(0, Math.min(rawPadding, Math.min(width, height) / 2));
        const align = (this.style.textHAlign || this.style.textAlign || 'center').toLowerCase();
        const anchor = resolveShapeTextSvgAnchor(align, this.text);
        const position = this._normalizeRectTextVAlign(this.style);

        const baseFontSize = Number(this.style.fontSize) || RECTANGLE_TEXT_DEFAULTS.fontSize;
        const fontSize = Math.max(6, baseFontSize * scaleFactor);
        const lineHeight = fontSize * 1.2;
        const rawLines = this.text.split('\n');
        const lines = rawLines.length ? rawLines : [''];
        const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

        let baseX;
        switch (align) {
            case 'left':
            case 'start':
                baseX = x + clampedPadding;
                break;
            case 'right':
            case 'end':
                baseX = x + width - clampedPadding;
                break;
            default:
                baseX = x + width / 2;
        }

        const borderStyle = resolveShapeBorderDrawStyle(this.style, scaleFactor);
        const borderPad = borderStyle.width / 2;
        const offsetX = Number.isFinite(this.style.textOffsetX) ? this.style.textOffsetX : 0;
        const offsetY = shapeTextOffsetY(this.style);
        const textX = baseX + offsetX;

        let textTop;
        let gapCfg = {};
        const strokeTopY = y - borderPad;
        const strokeBottomY = y + height + borderPad;

        switch (position) {
            case 'top':
                textTop = strokeTopY + offsetY;
                if (typeof lineLabelGapConfig === 'function') {
                    gapCfg = lineLabelGapConfig(textX, strokeTopY, 'top');
                }
                break;
            case 'bottom':
                textTop = strokeBottomY + offsetY;
                if (typeof lineLabelGapConfig === 'function') {
                    gapCfg = lineLabelGapConfig(textX, strokeBottomY, 'bottom');
                }
                break;
            default:
                textTop = y + height / 2 + offsetY;
        }

        const fontFamily = this.style.fontFamily || RECTANGLE_TEXT_DEFAULTS.fontFamily;
        const fontWeight = this.style.fontWeight || RECTANGLE_TEXT_DEFAULTS.fontWeight;
        const fontStyle = this.style.fontStyle || RECTANGLE_TEXT_DEFAULTS.fontStyle;
        const resolved = resolveDrawingTextStyle(lines.join('\n'), fontStyle, fontFamily);

        let blockWidth = 0;
        let measuredLeft = textX;
        let measuredRight = textX;
        if (measureGroup && !measureGroup.empty()) {
            const temp = measureGroup.append('g').attr('visibility', 'hidden');
            lines.forEach((line, index) => {
                const sanitized = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
                const lineY = textTop + (index - (lines.length - 1) / 2) * lineHeight;
                const measureText = temp.append('text')
                    .attr('x', textX)
                    .attr('y', lineY)
                    .attr('font-size', `${fontSize}px`)
                    .attr('font-family', resolved.fontFamily)
                    .attr('font-weight', fontWeight)
                    .attr('font-style', resolved.fontStyle)
                    .attr('text-anchor', anchor)
                    .attr('dominant-baseline', 'central')
                    .attr('xml:space', 'preserve')
                    .text(sanitized);
                if (resolved.direction) {
                    measureText.style('direction', resolved.direction);
                    measureText.attr('unicode-bidi', 'plaintext');
                }
            });
            try {
                const bbox = temp.node().getBBox();
                blockWidth = Number.isFinite(bbox.width) ? bbox.width : 0;
                measuredLeft = bbox.x;
                measuredRight = bbox.x + bbox.width;
            } catch (_) {}
            temp.remove();
        }
        if (!blockWidth) {
            const longest = lines.reduce((max, line) => Math.max(max, (line || '').length), 0);
            blockWidth = Math.max(longest, 1) * fontSize * 0.55;
        }

        const midY = y + height / 2;
        const blockTop = textTop - blockHeight / 2;
        const blockBottom = textTop + blockHeight / 2;
        const intersectsMidline = midY >= blockTop - 1 && midY <= blockBottom + 1;

        const layout = {
            hasText: true,
            textX,
            textTop,
            align,
            anchor,
            lines,
            fontSize,
            baseFontSize,
            lineHeight,
            blockHeight,
            fontFamily: resolved.fontFamily,
            fontWeight,
            fontStyle: resolved.fontStyle,
            direction: resolved.direction,
            italicSkew: resolved.italicSkew,
            gapCfg
        };

        if (intersectsMidline && blockWidth > 0) {
            const pad = Math.max(4, fontSize * 0.3);
            layout.midlineGap = { left: measuredLeft - pad, right: measuredRight + pad };
        }

        return layout;
    }

    _drawRectangleMiddleLine(group, x, y, width, height, scaleFactor, textLayout) {
        if (!shapeMiddleLineEnabled(this.style)) return;

        const midY = y + height / 2;
        const midLineColor = this.style.middleLineColor || '#2962FF';
        const midLineWidth = Math.max(0.5, (this.style.middleLineWidth || 1) * scaleFactor);
        const midLineDash = this.style.middleLineDash || '';
        const lineOpacity = this.style.opacity !== undefined && this.style.opacity !== null ? this.style.opacity : 1;
        const lineLeft = x;
        const lineRight = x + width;
        const capPad = Math.max(2, midLineWidth / 2);
        const gap = textLayout && textLayout.midlineGap;

        const appendSeg = (segX1, segX2) => {
            if (!Number.isFinite(segX1) || !Number.isFinite(segX2) || segX2 - segX1 < 0.5) return;
            group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', segX1)
                .attr('y1', midY)
                .attr('x2', segX2)
                .attr('y2', midY)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', lineOpacity)
                .style('pointer-events', 'none');
        };

        if (gap && Number.isFinite(gap.left) && Number.isFinite(gap.right) && gap.right > gap.left) {
            const gapLeft = Math.max(lineLeft, Math.min(gap.left, lineRight));
            const gapRight = Math.min(lineRight, Math.max(gap.right, lineLeft));
            appendSeg(lineLeft, gapLeft - capPad);
            appendSeg(gapRight + capPad, lineRight);
        } else {
            appendSeg(lineLeft, lineRight);
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();

                if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing rectangle', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        let x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);

        ({ x1, x2 } = applyRectangleHorizontalExtend(x1, x2, scales, this.style));
        
        const x = Math.min(x1, x2);
        const y = Math.min(scales.yScale(p1.y), scales.yScale(p2.y));
        const width = Math.abs(x2 - x1);
        const height = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y));

        if (![x, y, width, height].every((v) => Number.isFinite(v))) {
            try {
                if (this.group) this.group.remove();
            } catch (_) {}
            this.group = null;
            return null;
        }

        const fillPaint = shapeBackgroundFill(this.style, this.style.fill);

        this.group.append('rect')
            .attr('class', 'shape-fill')
            .attr('x', x)
            .attr('y', y)
            .attr('width', width)
            .attr('height', height)
            .attr('stroke', 'none')
            .attr('fill', fillPaint)
            .attr('opacity', this.style.opacity)
            .attr('rx', this.style.borderRadius || 0)
            .style('pointer-events', 'none')
            .style('cursor', 'default');
        
        // Draw border as 4 separate lines (like parallel channel) for precise hit detection
        const edges = [
            { x1: x, y1: y, x2: x + width, y2: y, name: 'top' },
            { x1: x, y1: y + height, x2: x + width, y2: y + height, name: 'bottom' },
            { x1: x, y1: y, x2: x, y2: y + height, name: 'left' },
            { x1: x + width, y1: y, x2: x + width, y2: y + height, name: 'right' }
        ];
        appendShapeBorderEdgeLines(this.group, edges, this.style, scaleFactor);

        // Handles on original corners only (TradingView); fill/border use extended width above.
        if (this._shouldCreateHandles(renderOpts)) {
            this.createBoxHandles(this.group, scales, { useExtendedHorizontal: false });
        } else {
            this._syncBoxHandlePositions(this.group, scales, { useExtendedHorizontal: false });
        }

        // Middle line after handles; gap under text when label crosses the horizontal center.
        const textLayout = this._computeRectangleTextLayout({ x, y, width, height }, scaleFactor, this.group);
        this._drawRectangleMiddleLine(this.group, x, y, width, height, scaleFactor, textLayout);

        // Text after middle line so labels always paint above the midline stroke.
        this.renderTextLabel({ x, y, width, height }, scaleFactor, textLayout);

        return this.group;
    }

    _computeBoxHandlePositions(scales, opts = {}) {
        const useExtendedHorizontal = opts.useExtendedHorizontal !== false;
        const p1 = this.points[0];
        const p2 = this.points[1];
        if (!p1 || !p2) return [];

        let x1 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        if (useExtendedHorizontal) {
            ({ x1, x2 } = applyRectangleHorizontalExtend(x1, x2, scales, this.style));
        }
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;

        return [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }
        ];
    }

    _syncBoxHandlePositions(group, scales, opts = {}) {
        if (!group || group.empty()) return;
        const handlePositions = this._computeBoxHandlePositions(scales, opts);
        if (!handlePositions.length) return;
        const existing = group.selectAll('.resize-handle-group');
        if (existing.empty()) {
            this.createBoxHandles(group, scales, opts);
            return;
        }
        handlePositions.forEach((pos) => {
            const hg = group.select(`.resize-handle-group[data-handle-role="${pos.role}"]`);
            if (hg.empty()) return;
            hg.selectAll('circle').attr('cx', pos.x).attr('cy', pos.y);
        });
    }

    patchPanZoomGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;

        const p1 = this.points[0];
        const p2 = this.points[1];
        let x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        ({ x1, x2 } = applyRectangleHorizontalExtend(x1, x2, scales, this.style));

        const x = Math.min(x1, x2);
        const y = Math.min(scales.yScale(p1.y), scales.yScale(p2.y));
        const width = Math.abs(x2 - x1);
        const height = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y));
        if (![x, y, width, height].every(Number.isFinite)) return false;

        const fill = this.group.select('rect.shape-fill');
        if (!fill.empty()) {
            fill.attr('x', x).attr('y', y).attr('width', width).attr('height', height);
        }

        const edgeMap = {
            top: { x1: x, y1: y, x2: x + width, y2: y },
            bottom: { x1: x, y1: y + height, x2: x + width, y2: y + height },
            left: { x1: x, y1: y, x2: x, y2: y + height },
            right: { x1: x + width, y1: y, x2: x + width, y2: y + height }
        };
        Object.keys(edgeMap).forEach((name) => {
            const e = edgeMap[name];
            this.group.selectAll(`line[data-edge="${name}"]`)
                .attr('x1', e.x1).attr('y1', e.y1).attr('x2', e.x2).attr('y2', e.y2);
        });

        const midLine = this.group.selectAll('line.middle-line');
        if (!midLine.empty()) {
            this.group.selectAll('line.middle-line').remove();
            const scaleFactor = this.getZoomScaleFactor(scales);
            const textLayout = this._computeRectangleTextLayout({ x, y, width, height }, scaleFactor, this.group);
            this._drawRectangleMiddleLine(this.group, x, y, width, height, scaleFactor, textLayout);
        }

        this._syncBoxHandlePositions(this.group, scales, { useExtendedHorizontal: false });
        return true;
    }

    /**
     * Create 8-point resize handles for box shapes (4 corners + 4 sides)
     * @param {{ useExtendedHorizontal?: boolean }} [opts]
     */
    createBoxHandles(group, scales, opts = {}) {
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 1;

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-hit').remove();
        group.selectAll('.resize-handle-group').remove();

        const handlePositions = this._computeBoxHandlePositions(scales, opts);
        if (!handlePositions.length) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        let x1 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        if (opts.useExtendedHorizontal !== false) {
            ({ x1, x2 } = applyRectangleHorizontalExtend(x1, x2, scales, this.style));
        }
        const widthPx = Math.abs(x2 - x1);
        const heightPx = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y));
        const handleRadius = (widthPx < 8 || heightPx < 8) ? 4 : 3;
        const hitRadius = Math.max(14, handleRadius + 9);

        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', pos.cursor)
                .style('pointer-events', 'all')
                .style('opacity', 0)
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);

            handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });

        group.selectAll('.resize-handle-group').raise();
    }

    beginHandleDrag(handleRole, context = {}) {
        if (!this.points || this.points.length < 2) return;
        this._resizeRole = handleRole;
        this._resizeStart = boxBoundsFromPoints(this.points);
    }

    endHandleDrag() {
        this._resizeRole = null;
        this._resizeStart = null;
    }

    getActiveHandleDragRole() {
        return this._resizeRole || null;
    }

    /**
     * Handle custom drag for 8-point handles
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint } = context;
        if (!dataPoint) {
            console.warn('⚠️ Rectangle handleCustomHandleDrag: No dataPoint in context');
            return false;
        }

        const role = this._resizeRole || handleRole;
        const start = this._resizeStart || boxBoundsFromPoints(this.points);
        let dragPoint = dataPoint;
        if (context.shiftKey && start) {
            dragPoint = squareConstrainedBoxPoint(role, start, dataPoint);
        }
        const next = applyBoxHandleDragWithFlip(role, start, dragPoint);
        if (!next) {
            console.warn(`⚠️ Rectangle handleCustomHandleDrag: Unknown role ${role}`);
            return false;
        }

        if (next.activeRole !== role) {
            // Re-anchor at the crossed edge so continued drag does not snap to drag-start bounds
            this._resizeStart = {
                left: next.left,
                right: next.right,
                top: next.top,
                bottom: next.bottom,
            };
        }

        this._resizeRole = next.activeRole;
        this.points[0] = { x: next.left, y: next.top };
        this.points[1] = { x: next.right, y: next.bottom };
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    renderTextLabel(bounds, scaleFactor = 1, layoutArg) {
        const layout = layoutArg || this._computeRectangleTextLayout(bounds, scaleFactor, this.group);
        if (!layout.hasText) {
            return;
        }

        const {
            textX,
            textTop,
            anchor,
            baseFontSize,
            fontSize,
            fontWeight,
            fontStyle,
            gapCfg
        } = layout;

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, this.text, {
                x: textX,
                y: textTop,
                anchor,
                yAnchor: 'middle',
                fill: this.style.textColor || RECTANGLE_TEXT_DEFAULTS.textColor,
                fontSize: baseFontSize || fontSize,
                fontFamily: this.style.fontFamily || RECTANGLE_TEXT_DEFAULTS.fontFamily,
                fontWeight: fontWeight || RECTANGLE_TEXT_DEFAULTS.fontWeight,
                fontStyle: fontStyle || RECTANGLE_TEXT_DEFAULTS.fontStyle,
                rotation: 0,
                ...(gapCfg || {})
            });
        }
    }

    static fromJSON(data) {
        const tool = new RectangleTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Ellipse/Circle Tool
// ============================================================================
class EllipseTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('ellipse', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
        this.isCircle = false; // Set to true if Shift key held during creation
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
                if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const borderStyle = resolveShapeBorderDrawStyle(this.style, scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing ellipse', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        
        // Calculate center and radii
        const cx = (x1 + x2) / 2;
        const cy = (scales.yScale(p1.y) + scales.yScale(p2.y)) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y)) / 2;

        const fillPaint = shapeBackgroundFill(this.style, this.style.fill);

        this.group.append('ellipse')
            .attr('class', 'shape-fill')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('rx', rx)
            .attr('ry', ry)
            .attr('stroke', 'none')
            .attr('fill', fillPaint)
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        const desiredHitWidth = Math.max(16, borderStyle.width * 5);
        const maxHitWidth = Math.max(16, Math.min(rx, ry) * 0.35);
        const hitWidth = Math.min(desiredHitWidth, maxHitWidth);

        const segments = 64;
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: cx + rx * Math.cos(a),
                y: cy + ry * Math.sin(a)
            });
        }

        appendShapeBorderPolylineLines(this.group, pts, this.style, scaleFactor, { hitWidth });

        if (this._shouldCreateHandles(renderOpts)) {
            this.createBoxHandles(this.group, scales);
        } else {
            this._syncEllipseHandlePositions(this.group, scales);
        }

        const esm = this.style.showMiddleLine;
        const ellipseMiddleOn =
            esm === true || esm === 1
            || (typeof esm === 'string' && /^(true|1|yes)$/i.test(String(esm).trim()));
        if (ellipseMiddleOn) {
            const midLineColor = this.style.middleLineColor || '#2962FF';
            const midLineWidth = this.style.middleLineWidth || 1;
            const midLineDash = this.style.middleLineDash || '';

            this.group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', cx - rx)
                .attr('y1', cy)
                .attr('x2', cx + rx)
                .attr('y2', cy)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity !== undefined && this.style.opacity !== null ? this.style.opacity : 1)
                .style('pointer-events', 'none')
                .raise();
        }

        return this.group;
    }

    _computeEllipseHandlePositions(scales) {
        const p1 = this.points[0];
        const p2 = this.points[1];
        if (!p1 || !p2) return [];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;

        return [
            { x: cx, y: cy - ry, cursor: 'ns-resize', role: 'side-top' },
            { x: cx + rx, y: cy, cursor: 'ew-resize', role: 'side-right' },
            { x: cx, y: cy + ry, cursor: 'ns-resize', role: 'side-bottom' },
            { x: cx - rx, y: cy, cursor: 'ew-resize', role: 'side-left' }
        ];
    }

    _syncEllipseHandlePositions(group, scales) {
        if (!group || group.empty()) return;
        const handlePositions = this._computeEllipseHandlePositions(scales);
        if (!handlePositions.length) return;
        const existing = group.selectAll('.resize-handle-group');
        if (existing.empty()) {
            this.createBoxHandles(group, scales);
            return;
        }
        handlePositions.forEach((pos) => {
            const hg = group.select(`.resize-handle-group[data-handle-role="${pos.role}"]`);
            if (hg.empty()) return;
            hg.selectAll('circle').attr('cx', pos.x).attr('cy', pos.y);
        });
    }

    /** Live-resize path in drawing-tools-manager calls `_syncBoxHandlePositions`. */
    _syncBoxHandlePositions(group, scales) {
        this._syncEllipseHandlePositions(group, scales);
    }

    /**
     * Create 8-point resize handles for ellipse positioned on the ellipse border
     */
    createBoxHandles(group, scales) {
        const handleRadius = 3;
        const hitRadius = 14;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 1;

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-hit').remove();
        group.selectAll('.resize-handle-group').remove();

        const handlePositions = this._computeEllipseHandlePositions(scales);

        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);

            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', pos.cursor)
                .style('pointer-events', 'all')
                .style('opacity', 0)
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });

        group.selectAll('.resize-handle-group').raise();
    }

    beginHandleDrag(handleRole, context = {}) {
        if (!this.points || this.points.length < 2) return;
        this._resizeRole = handleRole;
        this._resizeStart = boxBoundsFromPoints(this.points);
    }

    endHandleDrag() {
        this._resizeRole = null;
        this._resizeStart = null;
    }

    /**
     * Handle custom drag for 8-point handles
     * Handles are on the ellipse border, so we need to calculate the new bounding box
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint } = context;
        if (!dataPoint) {
            console.warn('⚠️ Ellipse handleCustomHandleDrag: No dataPoint in context');
            return false;
        }

        const role = this._resizeRole || handleRole;
        const start = this._resizeStart || boxBoundsFromPoints(this.points);
        if (context.shiftKey && start && String(role || '').startsWith('corner-')) {
            let dragPoint = squareConstrainedBoxPoint(role, start, dataPoint);
            const next = applyBoxHandleDragWithFlip(role, start, dragPoint);
            if (!next) return false;
            if (next.activeRole !== role) {
                this._resizeStart = {
                    left: next.left,
                    right: next.right,
                    top: next.top,
                    bottom: next.bottom
                };
            }
            this._resizeRole = next.activeRole;
            this.points[0] = { x: next.left, y: next.top };
            this.points[1] = { x: next.right, y: next.bottom };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        const p1 = { ...this.points[0] };
        const p2 = { ...this.points[1] };
        
        // Calculate current center and radii
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        
        // Determine which coordinates to update based on handle role
        switch (handleRole) {
            case 'side-top':
                // Dragging top handle - adjust vertical radius, keep center X
                const newTopY = dataPoint.y;
                const newRy1 = Math.abs(centerY - newTopY);
                this.points[0] = { x: p1.x, y: centerY - newRy1 };
                this.points[1] = { x: p2.x, y: centerY + newRy1 };
                break;
                
            case 'side-bottom':
                // Dragging bottom handle - adjust vertical radius, keep center X
                const newBottomY = dataPoint.y;
                const newRy2 = Math.abs(dataPoint.y - centerY);
                this.points[0] = { x: p1.x, y: centerY - newRy2 };
                this.points[1] = { x: p2.x, y: centerY + newRy2 };
                break;
                
            case 'side-right':
                // Dragging right handle - adjust horizontal radius, keep center Y
                const newRightX = dataPoint.x;
                const newRx1 = Math.abs(dataPoint.x - centerX);
                this.points[0] = { x: centerX - newRx1, y: p1.y };
                this.points[1] = { x: centerX + newRx1, y: p2.y };
                break;
                
            case 'side-left':
                // Dragging left handle - adjust horizontal radius, keep center Y
                const newLeftX = dataPoint.x;
                const newRx2 = Math.abs(centerX - newLeftX);
                this.points[0] = { x: centerX - newRx2, y: p1.y };
                this.points[1] = { x: centerX + newRx2, y: p2.y };
                break;
                
            case 'corner-tr':
            case 'corner-br':
            case 'corner-bl':
            case 'corner-tl':
                // For diagonal handles, adjust both radii proportionally
                // Calculate the distance from center to the dragged point
                const dx = Math.abs(dataPoint.x - centerX);
                const dy = Math.abs(dataPoint.y - centerY);
                
                // Determine which quadrant based on handle role
                let newP1X, newP1Y, newP2X, newP2Y;
                
                if (handleRole === 'corner-tr') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else if (handleRole === 'corner-br') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else if (handleRole === 'corner-bl') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else { // corner-tl
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                }
                
                this.points[0] = { x: newP1X, y: newP1Y };
                this.points[1] = { x: newP2X, y: newP2Y };
                break;
                
            default:
                console.warn(`⚠️ Ellipse handleCustomHandleDrag: Unknown role ${handleRole}`);
                return false;
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data, chart = null) {
        const tool = new EllipseTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Triangle Tool
// ============================================================================
class TriangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('triangle', points, style);
        this.requiredPoints = 3;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
                if (this.points.length === 0) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing triangle', renderOpts);
        this._clearDrawingLabels(scales);

        // Helper to get x coordinate
        const getX = (p) => scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);

        // Preview mode: show lines as points are added
        if (this.points.length === 1) {
            // Single point - show a dot
            const p = this.points[0];
            this.group.append('circle')
                .attr('cx', getX(p))
                .attr('cy', scales.yScale(p.y))
                .attr('r', 4 * scaleFactor)
                .attr('fill', this.style.stroke)
                .attr('opacity', this.style.opacity);
            return this.group;
        }

        if (this.points.length === 2) {
            // Two points - show a line (first edge of triangle)
            const p1 = this.points[0];
            const p2 = this.points[1];
            const borderStyle = resolveShapeBorderDrawStyle(this.style, scaleFactor);
            this.group.append('line')
                .attr('x1', getX(p1))
                .attr('y1', scales.yScale(p1.y))
                .attr('x2', getX(p2))
                .attr('y2', scales.yScale(p2.y))
                .attr('stroke', borderStyle.stroke)
                .attr('stroke-width', borderStyle.width)
                .attr('stroke-dasharray', borderStyle.dash || null)
                .attr('opacity', this.style.opacity);
            
            // Show dots at endpoints
            [p1, p2].forEach(p => {
                this.group.append('circle')
                    .attr('cx', getX(p))
                    .attr('cy', scales.yScale(p.y))
                    .attr('r', 4 * scaleFactor)
                    .attr('fill', borderStyle.stroke)
                    .attr('opacity', this.style.opacity);
            });
            return this.group;
        }

        // Full triangle with 3 points
        // Create path for triangle
        const pathData = this.points.map((p, i) => {
            const x = getX(p);
            const y = scales.yScale(p.y);
            return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ') + ' Z';

        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pathData)
            .attr('stroke', 'none')
            .attr('fill', shapeBackgroundFill(this.style, this.style.fill))
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Draw border as 3 separate lines (like parallel channel) for precise hit detection
        const pts = this.points.map(p => ({ x: getX(p), y: scales.yScale(p.y) }));
        const edges = [
            { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, name: 'edge1' },
            { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y, name: 'edge2' },
            { x1: pts[2].x, y1: pts[2].y, x2: pts[0].x, y2: pts[0].y, name: 'edge3' }
        ];
        appendShapeBorderEdgeLines(this.group, edges, this.style, scaleFactor);

        // Create resize handles at vertices
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new TriangleTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Arrow Tool
// ============================================================================
class ArrowTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow', points, style);
        this.requiredPoints = 2;
        this.arrowheadType = style.arrowheadType || 'filled'; // 'filled', 'open', 'both'
        this.text = style.text || '';
        this.ensureTextDefaults();
    }
    
    ensureTextDefaults() {
        const DEFAULT_TEXT_STYLE = {
            fontFamily: 'Roboto, sans-serif',
            fontSize: 14,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textColor: '#FFFFFF',
            textAlign: 'center',
            textPosition: 'top',
            textOffsetX: 0,
            textOffsetY: -8
        };
        
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();
        
                if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const strokeDasharray = BaseDrawing.resolveStrokeDasharray(this.style);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing arrow', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        let x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        let y1 = scales.yScale(p1.y);
        let y2 = scales.yScale(p2.y);
        
        // Store original coordinates for text positioning and arrowhead placement
        const origX1 = x1, origY1 = y1, origX2 = x2, origY2 = y2;
        const adx = origX2 - origX1;
        const ady = origY2 - origY1;
        const alen = Math.sqrt(adx * adx + ady * ady) || 1;
        const ux = adx / alen;
        const uy = ady / alen;
        const headLen = Math.max(8, scaledStrokeWidth * 5);
        const headHalf = Math.max(4, scaledStrokeWidth * 2.5);
        const shaftEndX = origX2 - ux * headLen;
        const shaftEndY = origY2 - uy * headLen;

        const appendVisibleShaft = (sx1, sy1, sx2, sy2) => this.group.append('line')
            .attr('x1', sx1)
            .attr('y1', sy1)
            .attr('x2', sx2)
            .attr('y2', sy2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', strokeDasharray)
            .attr('opacity', this.style.opacity)
            .attr('data-original-width', this.style.strokeWidth)
            .style('shape-rendering', 'geometricPrecision')
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        /** Shaft to arrowhead base; extend-right continues past the tip anchor (origX2/origY2). */
        const drawShaftToHead = (fromX, fromY) => {
            appendVisibleShaft(fromX, fromY, shaftEndX, shaftEndY);
        };
        const drawExtensionPastHead = () => {
            if (!this.style.extendRight) return;
            const extDx = x2 - origX2;
            const extDy = y2 - origY2;
            if (Math.abs(extDx) < 0.5 && Math.abs(extDy) < 0.5) return;
            appendVisibleShaft(origX2, origY2, x2, y2);
        };

        // Extend line to plot edges when requested (same pixel space as dataIndexToPixel).
        if (this.style.extendLeft || this.style.extendRight) {
            ({ x1, y1, x2, y2 } = extendSegmentToPlotHorizontalEdges(
                origX1, origY1, origX2, origY2, scales,
                !!this.style.extendLeft, !!this.style.extendRight
            ));
        }
        const shaftStartX = this.style.extendLeft ? x1 : origX1;
        const shaftStartY = this.style.extendLeft ? y1 : origY1;

        // Fill hit area (interactive) - allows select/move/hover by fill (wide band around the line)
        {
            const bandWidth = Math.max(18, scaledStrokeWidth * 6);
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;
            const hw = bandWidth / 2;
            const ax = x1 + px * hw;
            const ay = y1 + py * hw;
            const bx = x2 + px * hw;
            const by = y2 + py * hw;
            const cx = x2 - px * hw;
            const cy = y2 - py * hw;
            const dx2 = x1 - px * hw;
            const dy2 = y1 - py * hw;
            const hitPath = `M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} L ${dx2} ${dy2} Z`;

            this.group.append('path')
                .attr('class', 'arrow-fill-hit')
                .attr('d', hitPath)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        }

        const hasText = this.text && this.text.trim();
        const textVAlign = normalizeLineTextVAlign(this.style);
        const shouldSplitLine = hasText && textVAlign === 'middle';
        this._splitInfo = null;

        if (shouldSplitLine) {
            const p1 = this.points[0];
            const p2 = this.points[1];
            const origX1 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p1.x) : (scales ? scales.xScale(p1.x) : x1);
            const origY1 = scales ? scales.yScale(p1.y) : y1;
            const origX2 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p2.x) : (scales ? scales.xScale(p2.x) : x2);
            const origY2 = scales ? scales.yScale(p2.y) : y2;

            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            const measureStyle = typeof resolveDrawingTextStyle === 'function'
                ? resolveDrawingTextStyle(this.text, fontStyle, fontFamily)
                : { fontFamily, fontStyle };

            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', measureStyle.fontFamily)
                .attr('font-weight', fontWeight)
                .attr('font-style', measureStyle.fontStyle)
                .attr('text-anchor', 'middle')
                .style('visibility', 'hidden')
                .style('pointer-events', 'none');
            if (measureStyle.direction) {
                tempText.style('direction', measureStyle.direction);
                tempText.attr('unicode-bidi', 'plaintext');
            }
            tempText.text(this.text);

            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();

            const lineAngle = Math.atan2(origY2 - origY1, origX2 - origX1);

            const padding = 10;
            const gapSize = textWidth + (padding * 2);

            // visual left/right + t-based with clamping
            const sh_p1IsLeft = origX1 <= origX2;
            let t = 0.5;
            switch (textHAlign) {
                case 'left':  t = sh_p1IsLeft ? 0.05 : 0.95; break;
                case 'right': t = sh_p1IsLeft ? 0.95 : 0.05; break;
                default:      t = 0.5;
            }
            const sh_lineLen = Math.sqrt((origX2-origX1)**2 + (origY2-origY1)**2);
            const sh_halfGapT = sh_lineLen > 0 ? (gapSize/2) / sh_lineLen : 0;
            const sh_t1 = Math.max(0, t - sh_halfGapT);
            const sh_t2 = Math.min(1, t + sh_halfGapT);
            const textX = origX1 + (origX2 - origX1) * t;
            const textY = origY1 + (origY2 - origY1) * t;
            const split1X = origX1 + (origX2 - origX1) * sh_t1;
            const split1Y = origY1 + (origY2 - origY1) * sh_t1;
            const split2X = origX1 + (origX2 - origX1) * sh_t2;
            const split2Y = origY1 + (origY2 - origY1) * sh_t2;

            this._splitInfo = {
                textX: textX,
                textY: textY,
                angle: lineAngle * (180 / Math.PI),
                gapSize: gapSize,
                split1X: split1X,
                split1Y: split1Y,
                split2X: split2X,
                split2Y: split2Y
            };

            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(18, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            appendVisibleShaft(shaftStartX, shaftStartY, split1X, split1Y);

            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(18, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            appendVisibleShaft(split2X, split2Y, shaftEndX, shaftEndY);
            drawExtensionPastHead();
        } else {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(18, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            drawShaftToHead(shaftStartX, shaftStartY);
            drawExtensionPastHead();
        }

        // Solid arrowhead at tip (same approach as TrendlineTool endStyle === 'arrow')
        const headBaseX = origX2 - ux * headLen;
        const headBaseY = origY2 - uy * headLen;
        this.group.append('polygon')
            .attr('points', `${origX2},${origY2} ${headBaseX - uy * headHalf},${headBaseY + ux * headHalf} ${headBaseX + uy * headHalf},${headBaseY - ux * headHalf}`)
            .attr('fill', this.style.stroke)
            .style('pointer-events', 'none');

        this.renderTextLabel({ x1, y1, x2, y2, scales });

        // Render info box if enabled
        this.renderInfoBox(origX1, origY1, origX2, origY2, scales);

        // Create resize handles
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    renderInfoBox(x1, y1, x2, y2, scales) {
        const infoSettings = this.style.infoSettings || {};
        if (!infoSettings.showInfo) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const fontFamily = 'system-ui, -apple-system, sans-serif';

        // Metrics
        const rawPriceChange = p2.y - p1.y;
        const absPrice = Math.abs(rawPriceChange);
        const pct = p1.y !== 0 ? (rawPriceChange / p1.y * 100) : 0;
        const tickSize = (scales && scales.chart && scales.chart.tickSize) ? scales.chart.tickSize : 0.0001;
        const pips = tickSize ? Math.round(rawPriceChange / tickSize) : 0;
        const decimals = absPrice < 0.001 ? 5 : absPrice < 0.1 ? 4 : absPrice < 10 ? 3 : 2;
        const barsRange = Math.round(Math.abs(p2.x - p1.x));
        const pixelDist = Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
        const angleDeg = (Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI).toFixed(2);

        let timeStr = '';
        const _chart = scales && scales.chart;
        if (_chart && _chart.data && _chart.data.length > 0) {
            const _data = _chart.data;
            const _i1 = Math.max(0, Math.min(Math.round(p1.x), _data.length - 1));
            const _i2 = Math.max(0, Math.min(Math.round(p2.x), _data.length - 1));
            const _diffMs = Math.abs(_data[_i2].t - _data[_i1].t);
            const _totalMins = Math.round(_diffMs / 60000);
            const _days = Math.floor(_totalMins / 1440);
            const _hours = Math.floor((_totalMins % 1440) / 60);
            const _mins = _totalMins % 60;
            if (_days > 0) timeStr = _hours > 0 ? `${_days}d ${_hours}h` : `${_days}d`;
            else if (_hours > 0) timeStr = _mins > 0 ? `${_hours}h ${_mins}m` : `${_hours}h`;
            else timeStr = `${_totalMins}m`;
        }

        // Build rows with SVG icons - each stat on separate line
        const rows = [];
        
        // Price range row
        if (infoSettings.priceRange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${rawPriceChange.toFixed(decimals)}`
            });
        }

        // Percent change row
        if (infoSettings.percentChange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 13L13 3M5 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `(${pct.toFixed(2)}%)`
            });
        }

        // Change in pips row
        if (infoSettings.changeInPips) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="4" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/>',
                text: `${Math.abs(pips).toLocaleString()}`
            });
        }

        // Bars range row
        if (infoSettings.barsRange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 8h12M11 5l3 3-3 3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${barsRange} bars`
            });
        }

        // Date/time range row
        if (infoSettings.dateTimeRange && timeStr) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6" stroke="currentColor" fill="none" stroke-width="0.5"/><path d="M8 4v4l3 2" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `(${timeStr})`
            });
        }

        // Distance row
        if (infoSettings.distance) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 8h12M4 6v4M8 6v4M12 6v4" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `distance: ${pixelDist} px`
            });
        }

        // Angle row
        if (infoSettings.angle) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M12 4L4 12M12 4v5M12 4h-5" stroke="currentColor" fill="none" stroke-width="0.5"/><path d="M9 7a3 3 0 0 0 3-3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${angleDeg}°`
            });
        }

        if (rows.length === 0) return;

        // Layout constants
        const padX = 10, padY = 8, lineHeight = 19, fontSize = 11;
        const iconColW = 14, iconTextGap = 6;

        // Measure max text width
        const tempG = this.group.append('g').style('visibility', 'hidden');
        let maxTW = 0;
        rows.forEach(row => {
            const t = tempG.append('text').attr('font-size', fontSize).attr('font-family', fontFamily).text(row.text);
            const w = t.node().getComputedTextLength ? t.node().getComputedTextLength() : row.text.length * fontSize * 0.6;
            if (w > maxTW) maxTW = w;
        });
        tempG.remove();

        const boxWidth = padX + iconColW + iconTextGap + maxTW + padX;
        const boxHeight = rows.length * lineHeight + padY * 2;

        // Responsive placement: offset away from the line direction to avoid overlap
        const OFFSET_X = 8;
        const OFFSET_Y = 4;
        const dx = x2 - x1;
        const dy = y2 - y1;
        // Horizontal: place to the right of p2 if line comes from left, else to the left
        let boxX = dx >= 0 ? x2 + OFFSET_X : x2 - boxWidth - OFFSET_X;
        // Vertical: place above p2 if line goes down (dy>0), below if line goes up (dy<0)
        let boxY = dy >= 0 ? y2 - boxHeight - OFFSET_Y : y2 + OFFSET_Y;

        const infoGroup = this.group.append('g')
            .attr('class', 'arrow-info')
            .attr('transform', `translate(${boxX}, ${boxY})`);

        infoGroup.append('rect')
            .attr('x', 0).attr('y', 0)
            .attr('width', boxWidth).attr('height', boxHeight)
            .attr('fill', 'rgba(210, 215, 225, 0.97)')
            .attr('stroke', 'rgba(160, 165, 185, 0.8)')
            .attr('stroke-width', 1)
            .attr('rx', 4);

        rows.forEach((row, i) => {
            const rowY = padY + (i + 0.78) * lineHeight;
            
            // Render SVG icon if available
            if (row.svgIcon) {
                const iconG = infoGroup.append('g')
                    .attr('transform', `translate(${padX}, ${rowY - 9})`);
                iconG.html(row.svgIcon);
                iconG.select('svg')
                    .attr('stroke', '#4a5068')
                    .style('color', '#4a5068')
                    .style('overflow', 'visible');
            }
            
            // Render text
            infoGroup.append('text')
                .attr('x', padX + iconColW + iconTextGap)
                .attr('y', rowY)
                .attr('fill', '#1e2235')
                .attr('font-size', `${fontSize}px`)
                .attr('font-family', fontFamily)
                .text(row.text);
        });
    }

    renderTextLabel(coords, scaleFactor = 1) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const textVAlign = normalizeLineTextVAlign(this.style);
        const offY = lineTextOffsetY(this.style, textVAlign);

        if (this._splitInfo) {
            if (typeof appendSplitAngledLineTextLabel === 'function') {
                appendSplitAngledLineTextLabel(
                    this.group, label, this._splitInfo, coords, this, this.style, 'geometric'
                );
            } else {
                let angle = flipLineLabelReadableAngleDeg(this._splitInfo.angle);
                appendTextLabel(this.group, label, {
                    x: this._splitInfo.textX + (this.style.textOffsetX || 0),
                    y: this._splitInfo.textY + offY,
                    anchor: 'middle',
                    yAnchor: 'middle',
                    fill: this.style.textColor || this.style.stroke,
                    fontSize: this.style.fontSize || 14,
                    fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                    fontWeight: this.style.fontWeight || 'normal',
                    fontStyle: this.style.fontStyle || 'normal',
                    rotation: angle
                });
            }
            return;
        }

        const { scales } = coords;
        const p1 = this.points[0];
        const p2 = this.points[1];

        const origX1 = scales && scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : (scales ? scales.xScale(p1.x) : coords.x1);
        const origY1 = scales ? scales.yScale(p1.y) : coords.y1;
        const origX2 = scales && scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p2.x) : (scales ? scales.xScale(p2.x) : coords.x2);
        const origY2 = scales ? scales.yScale(p2.y) : coords.y2;

        let angle = Math.atan2(origY2 - origY1, origX2 - origX1) * (180 / Math.PI);
        const angleRad = Math.atan2(origY2 - origY1, origX2 - origX1);
        angle = typeof flipLineLabelReadableAngleDeg === 'function'
            ? flipLineLabelReadableAngleDeg(angle)
            : (angle > 90 || angle < -90 ? angle + 180 : angle);

        const fontSize = this.style.fontSize || 14;
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
        const sh_mP1IsLeft = origX1 <= origX2;
        let t = 0.5;
        let anchor = 'middle';
        switch (textHAlign) {
            case 'left':
                t = sh_mP1IsLeft ? 0.05 : 0.95;
                anchor = resolveLineEndpointSvgAnchor('left', label);
                break;
            case 'right':
                t = sh_mP1IsLeft ? 0.95 : 0.05;
                anchor = resolveLineEndpointSvgAnchor('right', label);
                break;
        }

        let baseX = origX1 + (origX2 - origX1) * t;
        let baseY = origY1 + (origY2 - origY1) * t;
        if (typeof applyAngledLineLabelVAlignOffset === 'function') {
            const nudged = applyAngledLineLabelVAlignOffset(baseX, baseY, angleRad, textVAlign, fontSize);
            baseX = nudged.x;
            baseY = nudged.y;
        }

        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: baseY + offY,
            anchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
            fontWeight: this.style.fontWeight || 'normal',
            fontStyle: this.style.fontStyle || 'normal',
            rotation: angle
        });
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowTool(data.points, data.style);
        tool.id = data.id;
        tool.text = data.text || '';
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

// ============================================================================
// Label/Marker Tool (single point annotation)
// ============================================================================
class LabelTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Label') {
        super('label', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fill = style.fill || '#787b86';
        this.style.stroke = style.stroke || '#787b86';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.markerSize = style.markerSize || 8;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
                if (this.points.length < 1) return;

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing label', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const markerSize = this.style.markerSize || 8;

        // Draw marker background circle
        const markerCircle = this.group.append('circle')
            .attr('class', 'inline-editable-text')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', markerSize)
            .attr('fill', this.style.fill || this.style.stroke)
            .attr('stroke', this.style.textColor)
            .attr('stroke-width', 2)
            .style('pointer-events', 'all')
            .style('cursor', 'text');

        // Draw inner dot
        this.group.append('circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', markerSize * 0.4)
            .attr('fill', this.style.textColor)
            .style('pointer-events', 'none');

        // Optional text label below marker
        let labelText = null;
        if (this.text && this.text !== 'Label') {
            labelText = this.group.append('text')
                .attr('class', 'inline-editable-text')
                .attr('x', x)
                .attr('y', y + 20)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.fill)
                .attr('font-size', '11px')
                .attr('font-weight', '500')
                .style('pointer-events', 'all')
                .style('cursor', 'text')
                .text(this.text);
        }

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
        };

        const handleMouseDown = (event) => {
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (anchorNode) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = anchorNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const initial = (self.text && self.text !== 'Label') ? self.text : '';
            editor.show(
                editX,
                editY,
                initial,
                (newText) => {
                    const normalized = (newText || '').replace(/\r\n/g, '\n');
                    if (!normalized.trim()) {
                        if (manager && typeof manager.deleteDrawing === 'function') {
                            manager.deleteDrawing(self);
                            return;
                        }
                    }
                    self.setText(normalized);
                    if (self.chart) self.chart.render();
                },
                'Enter text…',
                {
                    width: Math.max(rect.width, 120),
                    height: rect.height,
                    padding: '0px',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    fontWeight: '500',
                    color: self.style.fill || '#787b86',
                    textAlign: 'center',
                    hideTargets: [anchorNode],
                    hideSelector: `.drawing[data-id="${self.id}"] text`
                }
            );
        };

        const handleInlineEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const anchorNode = event.currentTarget;
            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit(anchorNode);
            }, CLICK_DELAY);
        };

        const handleOpenSettings = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (manager && typeof manager.editDrawing === 'function' && !self.locked) {
                if (typeof manager.selectDrawing === 'function') {
                    manager.selectDrawing(self);
                }
                manager.editDrawing(self, event.pageX, event.pageY);
            }
        };

        const bind = (node) => {
            if (!node) return;
            node.addEventListener('mousedown', handleMouseDown, true);
            node.addEventListener('click', handleInlineEdit, true);
            node.addEventListener('dblclick', handleOpenSettings, true);
        };

        bind(markerCircle.node());
        if (labelText) bind(labelText.node());

        // Create single resize handle with glow effect
        const handleGroup = this.group.append('g')
            .attr('class', 'resize-handle-group')
            .attr('data-point-index', 0);
        
        // Outer glow circle
        handleGroup.append('circle')
            .attr('class', 'resize-handle-glow')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 10)
            .attr('fill', '#FFA726')
            .attr('opacity', this.selected ? 0.2 : 0)
            .style('pointer-events', 'none');
        
        // Main handle circle
        handleGroup.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 7)
            .attr('fill', '#FFA726')
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 2.5)
            .style('cursor', 'move')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);

        return this.group;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text
        };
    }

    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const label = new LabelTool(data.points, data.style, data.text);
        label.id = data.id;
        label.visible = data.visible;
        label.meta = data.meta;
        label.chart = chart;
        return label;
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RectangleTool,
        EllipseTool,
        TriangleTool,
        ArrowTool,
        LabelTool
    };
}
