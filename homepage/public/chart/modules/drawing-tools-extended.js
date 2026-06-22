/**
 * Drawing Tools - Extended Shapes Module
 * Implements: Highlighter, Arrow Markers, Circle, Arc, Curve, Double Curve, Rotated Rectangle
 */

/** Respect V9 `showBackground` (from drawing-tools-shapes.js when loaded first). */
function arrowMarkBackgroundFill(style, defaultFill) {
    if (typeof shapeBackgroundFill === 'function') {
        return shapeBackgroundFill(style, defaultFill);
    }
    if (style && style.showBackground === false) return 'none';
    const raw = style && (style.fill ?? style.backgroundColor);
    if (raw === 'none' || raw === 'transparent') return raw || 'none';
    return raw || defaultFill;
}

function arrowMarkBorderVisible(style) {
    if (typeof shapeBorderVisible === 'function') {
        return shapeBorderVisible(style);
    }
    return !style || style.borderEnabled !== false;
}

function arrowMarkOutlineStroke(style) {
    const c = style && (style.borderColor || style.stroke);
    return c && c !== 'none' ? c : '#787b86';
}

// ============================================================================
// Highlighter Tool (Freehand semi-transparent highlighting)
// ============================================================================
class HighlighterTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('highlighter', points, style);
        this.requiredPoints = -1; // Continuous drawing mode
        this.isContinuous = true;
        this.style.stroke = style.stroke || (() => {
            const base = { r: 140, g: 140, b: 140 };
            return `rgba(${base.r}, ${base.g}, ${base.b}, 0.35)`;
        })();
        this.style.strokeWidth = style.strokeWidth || 20;
        this.style.opacity = style.opacity != null ? style.opacity : 1;
        // Highlighter is always a continuous solid semi-transparent stroke.
        this.style.dashArray = '';
        this.style.strokeDasharray = '';
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing highlighter', renderOpts);
        this._clearDrawingLabels(scales);

        const { pathData } = BaseDrawing.buildFreehandPathData(this.points, scales);
        this._appendStrokePathWithEndpoints(this.group, container, pathData, this.style.strokeWidth);

        // Always create handles (visibility controlled by opacity)
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        // Only show handles for first and last points (grab to move whole stroke)
        const pointsToHandle = [0, this.points.length - 1];
        
        pointsToHandle.forEach(index => {
            const point = this.points[index];
            const cx = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', scales.yScale(point.y))
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'move')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            this.handles.push(handleGroup);
        });
    }

    addPoint(point) {
        this.points.push(point);
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const tool = new HighlighterTool(data.points, data.style);
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
// Arrow Marker Tool (Single point arrow/pin marker)
// ============================================================================

/** TradingView trendline arrow: tapered shaft, chevron barbed head, sharp tip, rounded thin tail. */
function arrowMarkerPathD(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;

    const scale = Math.max(0.5, Math.min(1.5, length / 200));
    const tailHalf = 2.5 * scale;
    const bodyHalf = 16 * scale;
    const headHalf = 22 * scale;
    const headLen = 44 * scale;

    const tipX = x2;
    const tipY = y2;
    const baseX = tipX - headLen * ux;
    const baseY = tipY - headLen * uy;

    const wingRx = baseX + headHalf * px;
    const wingRy = baseY + headHalf * py;
    const wingLx = baseX - headHalf * px;
    const wingLy = baseY - headHalf * py;
    const innerRx = baseX + bodyHalf * px;
    const innerRy = baseY + bodyHalf * py;
    const innerLx = baseX - bodyHalf * px;
    const innerLy = baseY - bodyHalf * py;

    const tailRx = x1 + tailHalf * px;
    const tailRy = y1 + tailHalf * py;
    const tailLx = x1 - tailHalf * px;
    const tailLy = y1 - tailHalf * py;

    const r = tailHalf;
    return [
        `M ${tipX} ${tipY}`,
        `L ${wingRx} ${wingRy}`,
        `L ${innerRx} ${innerRy}`,
        `L ${tailRx} ${tailRy}`,
        `A ${r} ${r} 0 0 1 ${tailLx} ${tailLy}`,
        `L ${innerLx} ${innerLy}`,
        `L ${wingLx} ${wingLy}`,
        'Z',
    ].join(' ');
}

class ArrowMarkerTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-marker', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
        this.style.stroke = 'none';
        this.style.strokeWidth = 0;
        this.arrowHeadSize = style.arrowHeadSize || 40;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing arrow-marker', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];
        
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const length = Math.hypot(dx, dy) || 1;
        const scale = Math.max(0.5, Math.min(1.5, length / 200));
        const tailHalf = 2.5 * scale;

        const arrowPath = arrowMarkerPathD(x1, y1, x2, y2);

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        const fillPaint = arrowMarkBackgroundFill(this.style, this.style.fill);
        const borderOn = arrowMarkBorderVisible(this.style);
        const outlineStroke = arrowMarkOutlineStroke(this.style);
        const outlineWidth = borderOn
            ? Math.max(1, Number(this.style.strokeWidth) || Number(this.style.borderWidth) || 1)
            : 0;

        // Fill (non-interactive)
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', fillPaint)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        if (borderOn) {
            this.group.append('path')
                .attr('class', 'shape-border-hit')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, outlineWidth * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('class', 'shape-border')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', outlineStroke)
                .attr('stroke-width', outlineWidth)
                .attr('stroke-linejoin', 'miter')
                .attr('stroke-linecap', 'butt')
                .attr('stroke-miterlimit', 12)
                .attr('data-original-width', outlineWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Render text near tail (p1) — offset perpendicular to arrow so it never overlaps the body
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';

            // Place text BEHIND the tail (opposite to arrow direction).
            // Anchor the edge of the text that faces the arrow so all text
            // extends away from the body — no overlap at any angle or width.
            const backAngle = angle + Math.PI;
            const backDist = tailHalf + 6;
            const textX = x1 + backDist * Math.cos(backAngle) + (this.style.textOffsetX || 0);
            const textY = y1 + backDist * Math.sin(backAngle) + (this.style.textOffsetY || 0);
            // If the back-anchor is to the left of the tail, use 'end' so text
            // extends left; if to the right, use 'start' so it extends right.
            const textAnchor = Math.cos(backAngle) >= 0 ? 'start' : 'end';

            this.group.append('text')
                .attr('x', textX)
                .attr('y', textY)
                .attr('text-anchor', textAnchor)
                .attr('dominant-baseline', 'middle')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkerTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        tool.markerSize = data.style?.markerSize || 20;
        if (data.coordinateSystem === 'timestamp' && data.points) {
            tool.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        return tool;
    }
}

/** Layout + paths for arrow mark up/down (same outer dimensions). */
function arrowMarkUpLayout(size) {
    const arrowWidth = size * 0.85;
    const shaftWidth = size * 0.4;
    const headHeight = size * 0.6;
    const legHeight = size * 0.45;
    const totalHeight = headHeight + legHeight;
    const outerW = Math.max(arrowWidth, shaftWidth);
    return { arrowWidth, shaftWidth, headHeight, legHeight, totalHeight, outerW };
}

function arrowMarkUpPathD(cx, cy, size) {
    const { arrowWidth, shaftWidth, headHeight, totalHeight } = arrowMarkUpLayout(size);
    const topY = cy - totalHeight / 2;
    const bottomY = cy + totalHeight / 2;
    const headBaseY = topY + headHeight;
    return `M ${cx} ${topY} L ${cx + arrowWidth / 2} ${headBaseY} L ${cx + shaftWidth / 2} ${headBaseY} L ${cx + shaftWidth / 2} ${bottomY} L ${cx - shaftWidth / 2} ${bottomY} L ${cx - shaftWidth / 2} ${headBaseY} L ${cx - arrowWidth / 2} ${headBaseY} Z`;
}

/** Explicit down path (same width/height as up; no SVG mirror transform). */
function arrowMarkDownPathD(cx, cy, size) {
    const { arrowWidth, shaftWidth, headHeight, totalHeight } = arrowMarkUpLayout(size);
    const topY = cy - totalHeight / 2;
    const bottomY = cy + totalHeight / 2;
    const headBaseY = bottomY - headHeight;
    return `M ${cx} ${bottomY} L ${cx + arrowWidth / 2} ${headBaseY} L ${cx + shaftWidth / 2} ${headBaseY} L ${cx + shaftWidth / 2} ${topY} L ${cx - shaftWidth / 2} ${topY} L ${cx - shaftWidth / 2} ${headBaseY} L ${cx - arrowWidth / 2} ${headBaseY} Z`;
}

const ARROW_MARK_DEFAULT_PX = 24;

function normalizeArrowMarkSize(drawing) {
    let s = Number(drawing.markerSize);
    if (!Number.isFinite(s) || s <= 0) s = Number(drawing.style && drawing.style.markerSize);
    if (!Number.isFinite(s) || s <= 0) s = ARROW_MARK_DEFAULT_PX;
    s = Math.max(12, Math.min(60, s));
    drawing.markerSize = s;
    if (!drawing.style) drawing.style = {};
    drawing.style.markerSize = s;
    return s;
}

// ============================================================================
// Arrow Mark Up Tool (Upward pointing arrow)
// ============================================================================
class ArrowMarkUpTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-mark-up', points, style);
        this.requiredPoints = 1;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
        this.style.stroke = style.stroke || '#089981';
        this.style.strokeWidth = style.strokeWidth || 0;
        const ms = Number(style.markerSize);
        this.markerSize = Number.isFinite(ms) && ms > 0 ? Math.max(12, Math.min(60, ms)) : ARROW_MARK_DEFAULT_PX;
        this.style.markerSize = this.markerSize;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this._prepareRenderGroup(container, 'drawing arrow-mark-up', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const size = normalizeArrowMarkSize(this);
        const layout = arrowMarkUpLayout(size);
        const arrowPath = arrowMarkUpPathD(x, y, size);
        const fillPaint = arrowMarkBackgroundFill(this.style, this.style.fill);
        const borderOn = arrowMarkBorderVisible(this.style);
        const outlineStroke = arrowMarkOutlineStroke(this.style);
        const outlineWidth = borderOn
            ? Math.max(1, Number(this.style.strokeWidth) || Number(this.style.borderWidth) || 1)
            : 0;

        // Add invisible larger hitbox for easier selection (render FIRST so it's behind the arrow)
        const hitboxPadding = size * 0.5;
        this.group.append('rect')
            .attr('class', 'arrow-marker-hitbox')
            .attr('x', x - layout.outerW / 2 - hitboxPadding)
            .attr('y', y - layout.totalHeight / 2 - hitboxPadding)
            .attr('width', layout.outerW + hitboxPadding * 2)
            .attr('height', layout.totalHeight + hitboxPadding * 2)
            .attr('fill', 'transparent')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', fillPaint)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        if (borderOn) {
            this.group.append('path')
                .attr('class', 'shape-border-hit')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, size * 0.35))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('class', 'shape-border')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', outlineStroke)
                .attr('stroke-width', outlineWidth)
                .attr('data-original-width', outlineWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Render text below the arrow
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            
            // Position text below the arrow
            const textOffsetY = layout.totalHeight / 2 + 8;
            
            this.group.append('text')
                .attr('x', x)
                .attr('y', y + textOffsetY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'hanging')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        // Single-point marker: create handles but force move cursor (not resize)
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit').style('cursor', 'move');
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkUpTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        const jms = Number(data.style && data.style.markerSize);
        tool.markerSize = Number.isFinite(jms) && jms > 0 ? Math.max(12, Math.min(60, jms)) : ARROW_MARK_DEFAULT_PX;
        tool.style.markerSize = tool.markerSize;
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
// Arrow Mark Down Tool (Downward pointing arrow)
// ============================================================================
class ArrowMarkDownTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-mark-down', points, style);
        this.requiredPoints = 1;
        this.style.fill = style.fill || '#F23645';
        this.style.stroke = style.stroke || '#F23645';
        this.style.strokeWidth = style.strokeWidth || 0;
        const ms = Number(style.markerSize);
        this.markerSize = Number.isFinite(ms) && ms > 0 ? Math.max(12, Math.min(60, ms)) : ARROW_MARK_DEFAULT_PX;
        this.style.markerSize = this.markerSize;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this._prepareRenderGroup(container, 'drawing arrow-mark-down', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const size = normalizeArrowMarkSize(this);
        const layout = arrowMarkUpLayout(size);
        const arrowPath = arrowMarkDownPathD(x, y, size);
        const fillPaint = arrowMarkBackgroundFill(this.style, this.style.fill);
        const borderOn = arrowMarkBorderVisible(this.style);
        const outlineStroke = arrowMarkOutlineStroke(this.style);
        const outlineWidth = borderOn
            ? Math.max(1, Number(this.style.strokeWidth) || Number(this.style.borderWidth) || 1)
            : 0;

        // Add invisible larger hitbox for easier selection (render FIRST so it's behind the arrow)
        const hitboxPadding = size * 0.5;
        this.group.append('rect')
            .attr('class', 'arrow-marker-hitbox')
            .attr('x', x - layout.outerW / 2 - hitboxPadding)
            .attr('y', y - layout.totalHeight / 2 - hitboxPadding)
            .attr('width', layout.outerW + hitboxPadding * 2)
            .attr('height', layout.totalHeight + hitboxPadding * 2)
            .attr('fill', 'transparent')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', fillPaint)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        if (borderOn) {
            this.group.append('path')
                .attr('class', 'shape-border-hit')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, size * 0.35))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('class', 'shape-border')
                .attr('d', arrowPath)
                .attr('fill', 'none')
                .attr('stroke', outlineStroke)
                .attr('stroke-width', outlineWidth)
                .attr('data-original-width', outlineWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Render text above the arrow
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            
            // Position text above the arrow
            const textOffsetY = -layout.totalHeight / 2 - 8;
            
            this.group.append('text')
                .attr('x', x)
                .attr('y', y + textOffsetY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'baseline')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        // Single-point marker: create handles but force move cursor (not resize)
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit').style('cursor', 'move');
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkDownTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        const jms = Number(data.style && data.style.markerSize);
        tool.markerSize = Number.isFinite(jms) && jms > 0 ? Math.max(12, Math.min(60, jms)) : ARROW_MARK_DEFAULT_PX;
        tool.style.markerSize = tool.markerSize;
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
// Circle Tool (Perfect circle - constrained ellipse)
// ============================================================================
class CircleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('circle', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing circle', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        
        // Calculate radius based on distance between points
        const dx = x2 - x1;
        const dy = y2 - y1;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Center is first point
        const cx = x1;
        const cy = y1;

        const fillPaint =
            this.style.showBackground === false
                ? 'none'
                : (this.style.fill ?? this.style.backgroundColor ?? this.style.fill);
        const borderOn = !this.style || this.style.borderEnabled !== false;

        this.group.append('circle')
            .attr('class', 'shape-fill')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', radius)
            .attr('stroke', 'none')
            .attr('fill', fillPaint)
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        const desiredHitWidth = Math.max(8, this.style.strokeWidth * 4);
        const maxHitWidth = Math.max(8, radius * 0.35);
        const hitWidth = Math.min(desiredHitWidth, maxHitWidth);

        const segments = 64;
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: cx + radius * Math.cos(a),
                y: cy + radius * Math.sin(a)
            });
        }

        for (let i = 0; i < segments; i++) {
            const pA = pts[i];
            const pB = pts[(i + 1) % segments];

            if (borderOn) {
                this.group.append('line')
                    .attr('class', 'shape-border')
                    .attr('x1', pA.x)
                    .attr('y1', pA.y)
                    .attr('x2', pB.x)
                    .attr('y2', pB.y)
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .attr('opacity', this.style.opacity)
                    .attr('data-original-width', this.style.strokeWidth)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }

            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', pA.x)
                .attr('y1', pA.y)
                .attr('x2', pB.x)
                .attr('y2', pB.y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', hitWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Render middle line if enabled (horizontal only)
        if (this.style.showMiddleLine) {
            const midLineColor = this.style.middleLineColor || '#2962FF';
            const midLineWidth = this.style.middleLineWidth || 1;
            const midLineDash = this.style.middleLineDash || '';
            
            // Horizontal middle line
            this.group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', cx - radius)
                .attr('y1', cy)
                .attr('x2', cx + radius)
                .attr('y2', cy)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none');
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        super.createHandles(group, scales);
        if (!group || group.empty()) return;
        group.selectAll('.resize-handle-group[data-point-index="0"] .resize-handle, .resize-handle-group[data-point-index="0"] .resize-handle-hit')
            .style('cursor', 'move');
        group.selectAll('.resize-handle-group[data-point-index="1"] .resize-handle, .resize-handle-group[data-point-index="1"] .resize-handle-hit')
            .style('cursor', 'nwse-resize');
    }

    /**
     * Center handle (index 0) moves the whole circle; edge handle (index 1) resizes.
     */
    onPointHandleDrag(index, context = {}) {
        const { point } = context;
        if (!point || !Number.isFinite(index) || index < 0 || index >= this.points.length) {
            return false;
        }

        if (index !== 0) return false;

        const center = this.points[0];
        const edge = this.points[1];
        if (!center || !edge) return false;

        const dx = point.x - center.x;
        const dy = point.y - center.y;
        if (dx === 0 && dy === 0) return true;

        this.points[0] = { x: point.x, y: point.y };
        this.points[1] = { x: edge.x + dx, y: edge.y + dy };
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data, chart = null) {
        const tool = new CircleTool(data.points, data.style);
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

function isRotatedRectExtendOn(style, key) {
    const v = style && style[key];
    return v === true || v === 1
        || (typeof v === 'string' && /^(true|1|yes)$/i.test(String(v).trim()));
}

/** Stretch rotated-rect corners horizontally to chart pane edges (TradingView extend). */
function applyRotatedRectHorizontalExtend(corners, scales, style) {
    if (!corners || corners.length < 4 || !style) return corners;
    if (!isRotatedRectExtendOn(style, 'extendLeft') && !isRotatedRectExtendOn(style, 'extendRight')) {
        return corners;
    }
    const hb = (typeof SVGHelpers !== 'undefined' && SVGHelpers.getChartHorizontalPixelBounds)
        ? SVGHelpers.getChartHorizontalPixelBounds(scales)
        : { left: scales.xScale.range()[0], right: scales.xScale.range()[1] };
    let minX = Math.min(...corners.map((c) => c.x));
    let maxX = Math.max(...corners.map((c) => c.x));
    const targetMin = isRotatedRectExtendOn(style, 'extendLeft') ? hb.left : minX;
    const targetMax = isRotatedRectExtendOn(style, 'extendRight') ? hb.right : maxX;
    const srcSpan = maxX - minX;
    const dstSpan = targetMax - targetMin;
    if (!(srcSpan > 1e-6) || !(dstSpan > 1e-6)) {
        const mid = (targetMin + targetMax) / 2;
        corners.forEach((c) => { c.x = mid; });
        return corners;
    }
    corners.forEach((c) => {
        c.x = targetMin + ((c.x - minX) / srcSpan) * dstSpan;
    });
    return corners;
}

// ============================================================================
// Rotated Rectangle Tool (TradingView style)
// 3 points: P1-P2 define one edge (and rotation), P3 defines height
// Drawing: 2 clicks - second click+drag sets rotation and height together
// ============================================================================
class RotatedRectangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('rotated-rectangle', points, style);
        this.requiredPoints = 2; // Only need 2 clicks, P3 is set during P2 drag
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing rotated-rectangle', renderOpts);
        this._clearDrawingLabels(scales);

        // Get pixel coordinates
        const toPixelX = (x) => scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(x) : scales.xScale(x);
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = toPixelX(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = toPixelX(p2.x);
        const y2 = scales.yScale(p2.y);

        // Calculate base edge length and angle
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Calculate height from third point (perpendicular distance)
        let height = 50; // Default height while drawing
        if (this.points.length >= 3) {
            const p3 = this.points[2];
            const x3 = toPixelX(p3.x);
            const y3 = scales.yScale(p3.y);
            // Perpendicular distance from p3 to line p1-p2
            const dx = x3 - x1;
            const dy = y3 - y1;
            height = dx * Math.sin(-angle) + dy * Math.cos(-angle);
        }

        // Build the 4 corners of the rotated rectangle
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const perpX = -sin * height;
        const perpY = cos * height;

        const corners = applyRotatedRectHorizontalExtend([
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            { x: x2 + perpX, y: y2 + perpY },
            { x: x1 + perpX, y: y1 + perpY }
        ], scales, this.style);

        const pathData = `M ${corners[0].x} ${corners[0].y} 
                          L ${corners[1].x} ${corners[1].y} 
                          L ${corners[2].x} ${corners[2].y} 
                          L ${corners[3].x} ${corners[3].y} Z`;

        const fillPaint =
            this.style.showBackground === false
                ? 'none'
                : (this.style.fill ?? this.style.backgroundColor ?? 'rgba(156, 39, 176, 0.1)');
        const borderOn = !this.style || this.style.borderEnabled !== false;

        // Draw fill
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pathData)
            .attr('fill', fillPaint)
            .attr('stroke', 'none')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none');

        // Draw border
        if (borderOn) {
            this.group.append('path')
                .attr('class', 'shape-border')
                .attr('d', pathData)
                .attr('fill', 'transparent')
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'visibleStroke')
                .style('cursor', 'move');
        }

        // Invisible wider hit area for easier selection
        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.corners = corners;

        // Middle line: parallel to the first edge, through the center (matches axis-aligned RectangleTool).
        if (this.style.showMiddleLine) {
            const scaleFactor = this.getZoomScaleFactor(scales);
            const midLineColor = this.style.middleLineColor || '#2962FF';
            const midLineWidth = Math.max(0.5, (this.style.middleLineWidth || 1) * scaleFactor);
            const midLineDash = this.style.middleLineDash || '';
            const c = this.corners;
            const mx1 = (c[3].x + c[0].x) / 2;
            const my1 = (c[3].y + c[0].y) / 2;
            const mx2 = (c[1].x + c[2].x) / 2;
            const my2 = (c[1].y + c[2].y) / 2;
            this.group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', mx1)
                .attr('y1', my1)
                .attr('x2', mx2)
                .attr('y2', my2)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none');
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        if (this.points.length < 2 || !this.corners) return;

        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();

        // Center point
        const centerX = (this.corners[0].x + this.corners[2].x) / 2;
        const centerY = (this.corners[0].y + this.corners[2].y) / 2;

        group.append('g')
            .attr('class', 'resize-handle-group')
            .attr('data-handle-role', 'center')
            .append('circle')
            .attr('class', 'resize-handle center-handle')
            .attr('cx', centerX)
            .attr('cy', centerY)
            .attr('r', handleRadius)
            .attr('fill', handleFill)
            .attr('stroke', handleStroke)
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-handle-role', 'center');

        // Middle of base edge (for rotation) - between corners 0 and 1
        const midBase = {
            x: (this.corners[0].x + this.corners[1].x) / 2,
            y: (this.corners[0].y + this.corners[1].y) / 2
        };
        // Middle of opposite edge - between corners 2 and 3
        const midOpposite = {
            x: (this.corners[2].x + this.corners[3].x) / 2,
            y: (this.corners[2].y + this.corners[3].y) / 2
        };

        // 2 Rotation handles at middle of edges
        const edgeHandles = [
            { pos: midBase, role: 'rotate-0' },
            { pos: midOpposite, role: 'rotate-1' }
        ];

        edgeHandles.forEach(handle => {
            group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', handle.role)
                .append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', handle.pos.x)
                .attr('cy', handle.pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'grab')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', handle.role);
        });

        // 4 Corner handles for resizing
        const cornerHandles = [
            { pos: this.corners[0], role: 'resize-0' },
            { pos: this.corners[1], role: 'resize-1' },
            { pos: this.corners[2], role: 'resize-2' },
            { pos: this.corners[3], role: 'resize-3' }
        ];

        cornerHandles.forEach(handle => {
            group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', handle.role)
                .append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', handle.pos.x)
                .attr('cy', handle.pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', handle.role);
        });
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, scales, screen } = context;
        if (!dataPoint) return false;

        if (handleRole === 'center') {
            // Move entire shape
            this._lastDragAngle = undefined; // Reset rotation state
            this._lastDragHandle = undefined; // Reset handle tracking
            const p1 = this.points[0];
            const p2 = this.points[1];
            const oldCenterX = (p1.x + p2.x) / 2;
            const oldCenterY = (p1.y + p2.y) / 2;
            const dx = dataPoint.x - oldCenterX;
            const dy = dataPoint.y - oldCenterY;
            
            this.points[0] = { x: p1.x + dx, y: p1.y + dy };
            this.points[1] = { x: p2.x + dx, y: p2.y + dy };
            if (this.points.length >= 3) {
                const p3 = this.points[2];
                this.points[2] = { x: p3.x + dx, y: p3.y + dy };
            }
        } else if (handleRole === 'rotate-0' || handleRole === 'rotate-1') {
            // Middle edge handles - rotation AND resize with opposite edge as pivot
            
            // Reset state when switching between handles to prevent flipping
            if (this._lastDragHandle !== handleRole) {
                this._lastDragAngle = undefined;
                this._lastDragDistance = undefined;
                this._lastDragHandle = handleRole;
            }
            
            if (!scales || !scales.yScale || !this.corners || this.corners.length < 4) {
                return true;
            }
            
            const chart = scales.chart;
            const toPixelX = (x) => chart && chart.dataIndexToPixel ? chart.dataIndexToPixel(x) : scales.xScale(x);
            const toDataX = (px) => chart && chart.pixelToDataIndex ? chart.pixelToDataIndex(px) : scales.xScale.invert(px);
            const toDataY = (py) => scales.yScale.invert(py);
            
            // Calculate pivot at opposite edge midpoint
            let pivotX, pivotY;
            if (handleRole === 'rotate-0') {
                // Dragging base edge -> pivot at opposite edge midpoint
                pivotX = (this.corners[2].x + this.corners[3].x) / 2;
                pivotY = (this.corners[2].y + this.corners[3].y) / 2;
            } else {
                // Dragging opposite edge -> pivot at base edge midpoint
                pivotX = (this.corners[0].x + this.corners[1].x) / 2;
                pivotY = (this.corners[0].y + this.corners[1].y) / 2;
            }
            
            const pointerX = (screen && typeof screen.x === 'number') ? screen.x : toPixelX(dataPoint.x);
            const pointerY = (screen && typeof screen.y === 'number') ? screen.y : scales.yScale(dataPoint.y);
            
            const dragAngle = Math.atan2(pointerY - pivotY, pointerX - pivotX);
            const dragDistance = Math.sqrt(Math.pow(pointerX - pivotX, 2) + Math.pow(pointerY - pivotY, 2));
            
            if (this._lastDragAngle === undefined || this._lastDragDistance === undefined) {
                this._lastDragAngle = dragAngle;
                this._lastDragDistance = dragDistance;
                return true;
            }
            
            let angleDelta = dragAngle - this._lastDragAngle;
            while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
            while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
            
            // Calculate scale factor based on distance change (with reduced sensitivity)
            const resizeSensitivity = 0.3; // Lower = slower resize (0.3 = 30% of normal speed)
            const rawScaleFactor = this._lastDragDistance > 0 ? dragDistance / this._lastDragDistance : 1;
            const scaleFactor = 1 + (rawScaleFactor - 1) * resizeSensitivity;
            
            this._lastDragAngle = dragAngle;
            this._lastDragDistance = dragDistance;
            
            const cos = Math.cos(angleDelta);
            const sin = Math.sin(angleDelta);
            
            // Rotate AND scale screen point around pivot
            const rotateAndScaleScreenPoint = (sx, sy) => {
                const dx = sx - pivotX;
                const dy = sy - pivotY;
                // First rotate
                const rotX = dx * cos - dy * sin;
                const rotY = dx * sin + dy * cos;
                // Then scale
                return {
                    x: pivotX + rotX * scaleFactor,
                    y: pivotY + rotY * scaleFactor
                };
            };
            
            // Get current data points in screen space
            const p1 = this.points[0];
            const p2 = this.points[1];
            const p3 = this.points.length >= 3 ? this.points[2] : null;
            
            const s1 = { x: toPixelX(p1.x), y: scales.yScale(p1.y) };
            const s2 = { x: toPixelX(p2.x), y: scales.yScale(p2.y) };
            
            // Rotate and scale all points around the pivot
            const s1Rot = rotateAndScaleScreenPoint(s1.x, s1.y);
            const s2Rot = rotateAndScaleScreenPoint(s2.x, s2.y);
            
            this.points[0] = {
                x: toDataX(s1Rot.x),
                y: toDataY(s1Rot.y)
            };
            this.points[1] = {
                x: toDataX(s2Rot.x),
                y: toDataY(s2Rot.y)
            };
            
            if (p3) {
                const s3 = { x: toPixelX(p3.x), y: scales.yScale(p3.y) };
                const s3Rot = rotateAndScaleScreenPoint(s3.x, s3.y);
                this.points[2] = {
                    x: toDataX(s3Rot.x),
                    y: toDataY(s3Rot.y)
                };
            }
        } else if (handleRole === 'resize-0' || handleRole === 'resize-1' || 
                   handleRole === 'resize-2' || handleRole === 'resize-3') {
            // Corner handles - resize by adjusting height (point 3)
            this._lastDragAngle = undefined; // Reset rotation state
            this._lastDragHandle = undefined; // Reset handle tracking
            if (this.points.length < 3) {
                this.points.push({ x: dataPoint.x, y: dataPoint.y });
            } else {
                this.points[2] = { x: dataPoint.x, y: dataPoint.y };
            }
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data, chart = null) {
        const tool = new RotatedRectangleTool(data.points, data.style);
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
// Arc Tool (Curved arc segment) - Same drawing behavior as Curve
// ============================================================================
class ArcTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arc', points, style);
        this.requiredPoints = 2; // Start and End only - control point auto-generated (like curve)
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.ensureTextDefaults();
        this.controlPointSensitivity = 1.0;
        this.controlPointOffset = null;
    }
    
    // Generate control point when drawing is complete (2 points placed)
    finalizeDrawing() {
        if (this.points.length !== 2) return;
        const p1 = this.points[0];
        const p2 = this.points[1];

        const controlPoint = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };

        this.points = [p1, controlPoint, p2];
        this._controlPointGenerated = true;
        this._needsScreenOffset = true;
    }
    
    ensureTextDefaults() {
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
    }
    
    setText(text) {
        this.text = text;
    }
    
    // Custom handle drag for control point (same as curve)
    handleCustomHandleDrag(handleRole, context) {
        const { point, pointIndex, scales } = context;
        if (!point || pointIndex === undefined || pointIndex === null) return;

        if (!this._isDragging) {
            this._isDragging = true;
        }

        if (pointIndex === 1 && this.points.length >= 3 && scales) {
            setQuadraticControlFromMidpointScreen(this, scales, point);
        } else if (pointIndex >= 0 && pointIndex < this.points.length) {
            this.points[pointIndex] = { x: point.x, y: point.y };
        }
    }
    
    // Clean up after drag
    endHandleDrag(handleRole, context) {
        this._isDragging = false;
        this._dragStartControlPoint = null;
        this._dragStartMousePoint = null;
    }

    _applyScreenSpaceBend(scales) {
        applyQuadraticScreenBend(this, scales);
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);

        if (this.points.length < 2) return;

        if (this.points.length === 2 && !this._controlPointGenerated) {
            this.finalizeDrawing();
        }

        this._prepareRenderGroup(container, 'drawing arc', renderOpts);
        this._clearDrawingLabels(scales);

        if (renderOpts.isPreview) {
            this._needsScreenOffset = true;
        }

        this._applyScreenSpaceBend(scales);

        const p1 = this.points[0];
        const p2 = this.points.length >= 3 ? this.points[2] : this.points[1];
        const controlPoint = this.points.length >= 3 ? this.points[1] : null;

        const x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        if (!controlPoint) {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || null)
                .attr('opacity', this.style.opacity);
            return this.group;
        }

        const ctrlX = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(controlPoint.x) : scales.xScale(controlPoint.x);
        const ctrlY = scales.yScale(controlPoint.y);

        const pathData = `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`;

        // Invisible wide hit path for easier clicking (same as CurveTool)
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'line-visible-path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        this.renderTextLabel({ x1, y1, x2, y2, scales });
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        this.handles = [];
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 3) {
            super.createHandles(group, scales);
            return;
        }

        computeQuadraticToolHandlePositions(this.points, scales).forEach((pos) => {
            const handleGroup = appendCurveResizeHandle(
                group, pos, this, handleRadius, handleFill, handleStroke, handleStrokeWidth
            );
            this.handles.push(handleGroup);
        });
    }

    updateHandlePositions(scales) {
        if (!this.group || this.points.length < 3) return;
        syncCurveResizeHandlePositions(this.group, computeQuadraticToolHandlePositions(this.points, scales));
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2, scales } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        const TEXT_ALIGN_TO_ANCHOR = {
            'left': 'start',
            'center': 'middle',
            'right': 'end'
        };

        if (window.appendTextLabel) {
            window.appendTextLabel(this.group, label, {
                x: baseX + (this.style.textOffsetX || 0),
                y: baseY + (this.style.textOffsetY || 0),
                anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] || 'middle',
                yAnchor: 'middle',
                fontSize: this.style.fontSize || 14,
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal',
                color: this.style.textColor || this.style.stroke
            });
        }
    }

    static fromJSON(data, chart = null) {
        const tool = new ArcTool(data.points, data.style);
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

function drawingPointToScreen(p, scales) {
    if (!p || !scales) return null;
    const x = scales.chart && scales.chart.dataIndexToPixel
        ? scales.chart.dataIndexToPixel(p.x)
        : scales.xScale(p.x);
    const y = scales.yScale(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

function screenPointToDrawing(sp, scales) {
    if (!sp || !scales) return null;
    const x = scales.chart && scales.chart.pixelToDataIndex
        ? scales.chart.pixelToDataIndex(sp.x)
        : scales.xScale.invert(sp.x);
    const y = scales.yScale.invert(sp.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

/** Quadratic P1 so the curve at t=0.5 passes through desiredMid (screen-accurate). */
function setQuadraticControlFromMidpointScreen(tool, scales, desiredMid) {
    if (!tool || !scales || !desiredMid || tool.points.length < 3) return false;
    const p0s = drawingPointToScreen(tool.points[0], scales);
    const p2s = drawingPointToScreen(tool.points[2], scales);
    const mids = drawingPointToScreen(desiredMid, scales);
    if (!p0s || !p2s || !mids) return false;
    const ctrlS = {
        x: 2 * mids.x - 0.5 * (p0s.x + p2s.x),
        y: 2 * mids.y - 0.5 * (p0s.y + p2s.y)
    };
    const ctrlData = screenPointToDrawing(ctrlS, scales);
    if (!ctrlData) return false;
    tool.points[1] = ctrlData;
    tool._needsScreenOffset = false;
    tool._userControlEdited = true;
    return true;
}

function computeDoubleCurveHandlePositions(points, scales) {
    if (!points || points.length < 4 || !scales) return [];
    const positions = [];
    [2, 3].forEach((index) => {
        const sp = drawingPointToScreen(points[index], scales);
        if (sp) positions.push({ x: sp.x, y: sp.y, index });
    });
    return positions;
}

/** Double-curve inner handles: bend perpendicular to endpoint chord (not slide along it). */
function setDoubleCurveControlFromScreenDrag(tool, scales, pointIndex, mouseDataPoint, screenOpt) {
    if (!tool || !scales || tool.points.length < 4) return false;
    const pi = parseInt(pointIndex, 10);
    if (pi !== 2 && pi !== 3) return false;
    const t = pi === 2 ? 1 / 3 : 2 / 3;
    const p0s = drawingPointToScreen(tool.points[0], scales);
    const p1s = drawingPointToScreen(tool.points[1], scales);
    const ms = (screenOpt && Number.isFinite(screenOpt.x) && Number.isFinite(screenOpt.y))
        ? { x: screenOpt.x, y: screenOpt.y }
        : (mouseDataPoint ? drawingPointToScreen(mouseDataPoint, scales) : null);
    if (!p0s || !p1s || !ms) return false;
    const bx = p0s.x + (p1s.x - p0s.x) * t;
    const by = p0s.y + (p1s.y - p0s.y) * t;
    const dx = p1s.x - p0s.x;
    const dy = p1s.y - p0s.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
        if (mouseDataPoint) tool.points[pi] = { x: mouseDataPoint.x, y: mouseDataPoint.y };
        return true;
    }
    const perpX = -dy / len;
    const perpY = dx / len;
    const proj = (ms.x - bx) * perpX + (ms.y - by) * perpY;
    const bent = screenPointToDrawing({ x: bx + perpX * proj, y: by + perpY * proj }, scales);
    if (!bent) return false;
    tool.points[pi] = bent;
    return true;
}

/** Screen positions for quadratic curve handles: endpoints + midpoint on the curve (index 1). */
function computeQuadraticToolHandlePositions(points, scales) {
    if (!points || points.length < 3 || !scales) return [];
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const x1 = scales.chart && scales.chart.dataIndexToPixel
        ? scales.chart.dataIndexToPixel(p0.x) : scales.xScale(p0.x);
    const x2 = scales.chart && scales.chart.dataIndexToPixel
        ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
    const x3 = scales.chart && scales.chart.dataIndexToPixel
        ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
    const y1 = scales.yScale(p0.y);
    const y2 = scales.yScale(p1.y);
    const y3 = scales.yScale(p2.y);
    const t = 0.5;
    const curveMidX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * x2 + t * t * x3;
    const curveMidY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * y2 + t * t * y3;
    return [
        { x: x1, y: y1, index: 0 },
        { x: curveMidX, y: curveMidY, index: 1 },
        { x: x3, y: y3, index: 2 },
    ];
}

function syncCurveResizeHandlePositions(group, positions) {
    if (!group || group.empty() || !positions || !positions.length) return;
    positions.forEach((pos) => {
        group.selectAll(`.resize-handle-group[data-point-index="${pos.index}"]`)
            .selectAll('.resize-handle, .resize-handle-hit')
            .attr('cx', pos.x)
            .attr('cy', pos.y);
    });
}

function appendCurveResizeHandle(group, pos, tool, handleRadius, handleFill, handleStroke, handleStrokeWidth) {
    const handleGroup = group.append('g')
        .attr('class', 'resize-handle-group')
        .attr('data-point-index', pos.index);
    handleGroup.append('circle')
        .attr('class', 'resize-handle-hit')
        .attr('cx', pos.x)
        .attr('cy', pos.y)
        .attr('r', 12)
        .attr('fill', 'transparent')
        .style('cursor', 'nwse-resize')
        .style('pointer-events', 'all')
        .attr('data-point-index', pos.index);
    handleGroup.append('circle')
        .attr('class', 'resize-handle')
        .attr('cx', pos.x)
        .attr('cy', pos.y)
        .attr('r', handleRadius)
        .attr('fill', handleFill)
        .attr('stroke', handleStroke)
        .attr('stroke-width', handleStrokeWidth)
        .style('cursor', 'nwse-resize')
        .style('pointer-events', 'none')
        .style('opacity', tool.selected ? 1 : 0)
        .attr('data-point-index', pos.index);
    return handleGroup;
}

/** Shared quadratic bend for Curve + Arc (screen px; index/price axes differ). */
function applyQuadraticScreenBend(tool, scales) {
    if (!tool || !scales) return;
    if (tool._isDragging || tool._userControlEdited) return;
    if (tool.points.length === 2 && typeof tool.finalizeDrawing === 'function' && !tool._controlPointGenerated) {
        tool.finalizeDrawing();
    }
    if (tool.points.length < 3) return;

    const p0 = drawingPointToScreen(tool.points[0], scales);
    const p1 = drawingPointToScreen(tool.points[1], scales);
    const p2 = drawingPointToScreen(tool.points[2], scales);
    if (!p0 || !p1 || !p2) return;

    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const chordLen = Math.hypot(dx, dy);
    if (chordLen < 1) {
        tool._needsScreenOffset = false;
        return;
    }

    const cross = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx);
    const colinear = cross < chordLen * 1.5;
    if (!tool._needsScreenOffset && !colinear) {
        return;
    }

    const offsetAmount = Math.max(8, chordLen * (tool.type === 'arc' ? 0.3 : 0.15));
    const maxArcOffset = tool.type === 'arc' ? 50 : Infinity;
    const offset = tool.type === 'arc' ? Math.min(maxArcOffset, offsetAmount) : offsetAmount;

    const midX = (p0.x + p2.x) / 2;
    const midY = (p0.y + p2.y) / 2;
    const perpX = (-dy / chordLen) * offset;
    const perpY = (dx / chordLen) * offset;
    const targetMidX = midX + perpX;
    const targetMidY = midY + perpY;
    const ctrlX = 2 * targetMidX - 0.5 * (p0.x + p2.x);
    const ctrlY = 2 * targetMidY - 0.5 * (p0.y + p2.y);

    const ctrlData = screenPointToDrawing({ x: ctrlX, y: ctrlY }, scales);
    if (ctrlData) tool.points[1] = ctrlData;
    tool._needsScreenOffset = false;
    tool._controlPointGenerated = true;
}

// ============================================================================
// Curve Tool (Bezier curve with control points)
// ============================================================================
class CurveTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('curve', points, style);
        this.requiredPoints = 2; // Start and End only - control point auto-generated
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.ensureTextDefaults();
        this.ensureEndpointStyleDefaults();
        this.controlPointSensitivity = 1.0; // 1:1 mouse movement
        this.controlPointOffset = null; // Store the control point offset from midpoint
    }
    
    // Generate control point when drawing is complete (2 points placed).
    // Middle point starts on the chord; render() bends it in screen space (index/price axes differ).
    finalizeDrawing() {
        if (this.points.length !== 2) return;
        const p1 = this.points[0];
        const p2 = this.points[1];

        const controlPoint = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };

        this.points = [p1, controlPoint, p2];
        this._controlPointGenerated = true;
        this._needsScreenOffset = true;
    }

    _pointToScreen(p, scales) {
        return {
            x: scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p.x)
                : scales.xScale(p.x),
            y: scales.yScale(p.y)
        };
    }

    _applyScreenSpaceBend(scales) {
        applyQuadraticScreenBend(this, scales);
    }
    
    ensureTextDefaults() {
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.textColor) this.style.textColor = '#FFFFFF';
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
        if (this.style.textOffsetX === undefined) this.style.textOffsetX = 0;
        if (this.style.textOffsetY === undefined) this.style.textOffsetY = -8;
    }
    
    setText(text) {
        this.text = text;
    }
    
    // Custom handle drag for control point with reduced sensitivity
    handleCustomHandleDrag(handleRole, context) {
        const { point, pointIndex, scales } = context;
        if (!point || pointIndex === undefined || pointIndex === null) return;

        if (!this._isDragging) {
            this._isDragging = true;
        }

        if (pointIndex === 1 && this.points.length >= 3 && scales) {
            setQuadraticControlFromMidpointScreen(this, scales, point);
        } else if (pointIndex >= 0 && pointIndex < this.points.length) {
            this.points[pointIndex] = { x: point.x, y: point.y };
        }
    }
    
    // Clean up after drag
    endHandleDrag(handleRole, context) {
        this._isDragging = false;
        this._dragStartControlPoint = null;
        this._dragStartMousePoint = null;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureEndpointStyleDefaults();

        if (this.points.length < 2) return;

        if (this.points.length === 2 && !this._controlPointGenerated) {
            this.finalizeDrawing();
        }

        this._prepareRenderGroup(container, 'drawing curve', renderOpts);
        this._clearDrawingLabels(scales);

        this._applyScreenSpaceBend(scales);

        const screenPoints = this.points.map(p => this._pointToScreen(p, scales));

        // Store original points for text positioning
        const origScreenPoints = [...screenPoints];

        let pathData;
        if (screenPoints.length === 2) {
            // Simple line if only 2 points
            pathData = `M ${screenPoints[0].x} ${screenPoints[0].y} L ${screenPoints[1].x} ${screenPoints[1].y}`;
        } else if (screenPoints.length >= 3) {
            // Quadratic bezier with middle point as control
            pathData = `M ${screenPoints[0].x} ${screenPoints[0].y} Q ${screenPoints[1].x} ${screenPoints[1].y} ${screenPoints[2].x} ${screenPoints[2].y}`;
        }

        // Add line extensions if needed
        if (screenPoints.length >= 3 && (this.style.extendLeft || this.style.extendRight)) {
            const extendLength = 10000;
            
            if (this.style.extendLeft) {
                // Tangent at start: direction from P0 to P1
                const dx = screenPoints[1].x - screenPoints[0].x;
                const dy = screenPoints[1].y - screenPoints[0].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length > 0) {
                    const dirX = dx / length;
                    const dirY = dy / length;
                    const extX = screenPoints[0].x - dirX * extendLength;
                    const extY = screenPoints[0].y - dirY * extendLength;
                    pathData = `M ${extX} ${extY} L ${screenPoints[0].x} ${screenPoints[0].y} ` + pathData.substring(pathData.indexOf('Q'));
                }
            }
            
            if (this.style.extendRight) {
                // Tangent at end: direction from P2 to P1 (reversed)
                const endIdx = screenPoints.length - 1;
                const dx = screenPoints[endIdx - 1].x - screenPoints[endIdx].x;
                const dy = screenPoints[endIdx - 1].y - screenPoints[endIdx].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length > 0) {
                    const dirX = dx / length;
                    const dirY = dy / length;
                    const extX = screenPoints[endIdx].x - dirX * extendLength;
                    const extY = screenPoints[endIdx].y - dirY * extendLength;
                    pathData += ` L ${extX} ${extY}`;
                }
            }
        } else if (screenPoints.length === 2 && (this.style.extendLeft || this.style.extendRight)) {
            // For simple line, extend the line itself
            const dx = screenPoints[1].x - screenPoints[0].x;
            const dy = screenPoints[1].y - screenPoints[0].y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                const dirX = dx / length;
                const dirY = dy / length;
                const extendLength = 10000;
                
                let startX = screenPoints[0].x;
                let startY = screenPoints[0].y;
                let endX = screenPoints[1].x;
                let endY = screenPoints[1].y;
                
                if (this.style.extendLeft) {
                    startX = screenPoints[0].x - dirX * extendLength;
                    startY = screenPoints[0].y - dirY * extendLength;
                }
                if (this.style.extendRight) {
                    endX = screenPoints[1].x + dirX * extendLength;
                    endY = screenPoints[1].y + dirY * extendLength;
                }
                
                pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
            }
        }

        // Create arrow markers if needed for CurveTool
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const svg = d3.select(container.node().ownerSVGElement);
            
            if (startStyle === 'arrow') {
                const startMarkerId = `arrow-start-${this.id}`;
                SVGHelpers.createArrowMarker(svg, startMarkerId, this.style.stroke);
            }
            
            if (endStyle === 'arrow') {
                const endMarkerId = `arrow-end-${this.id}`;
                SVGHelpers.createArrowMarker(svg, endMarkerId, this.style.stroke);
            }
        }

        // Invisible hit path for easier clicking (match HorizontalLineTool pattern)
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const path = this.group.append('path')
            .attr('class', 'line-visible-path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');
        
        // Apply arrow markers to CurveTool
        if (startStyle === 'arrow') {
            path.attr('marker-start', `url(#arrow-start-${this.id})`);
        }
        if (endStyle === 'arrow') {
            path.attr('marker-end', `url(#arrow-end-${this.id})`);
        }


        // Render text label if present (use original coordinates, not extended)
        if (origScreenPoints.length >= 2) {
            const x1 = origScreenPoints[0].x;
            const y1 = origScreenPoints[0].y;
            const x2 = origScreenPoints[origScreenPoints.length - 1].x;
            const y2 = origScreenPoints[origScreenPoints.length - 1].y;
            this.renderTextLabel({ x1, y1, x2, y2, scales });
        }

        if (!renderOpts.skipHandles) {
            this.createHandles(this.group, scales);
        }
        return this.group;
    }

    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 3) {
            super.createHandles(group, scales);
            return;
        }

        computeQuadraticToolHandlePositions(this.points, scales).forEach((pos) => {
            const handleGroup = appendCurveResizeHandle(
                group, pos, this, handleRadius, handleFill, handleStroke, handleStrokeWidth
            );
            this.handles.push(handleGroup);
        });
    }

    updateHandlePositions(scales) {
        if (!this.group || this.points.length < 3) return;
        syncCurveResizeHandlePositions(this.group, computeQuadraticToolHandlePositions(this.points, scales));
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2 } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        switch (this.style.textPosition) {
            case 'start':
                baseX = x1;
                baseY = y1;
                break;
            case 'end':
                baseX = x2;
                baseY = y2;
                break;
            case 'middle':
            default:
                baseX = midX;
                baseY = midY;
                break;
        }

        const offsetX = this.style.textOffsetX || 0;
        const offsetY = this.style.textOffsetY || -8;

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] || 'middle',
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || 14,
            fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
            fontWeight: this.style.fontWeight || 'normal',
            fontStyle: this.style.fontStyle || 'normal'
        });
    }

    static fromJSON(data, chart = null) {
        const tool = new CurveTool(data.points, data.style);
        tool.id = data.id;
        tool.text = data.text || '';
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        // Mark as generated if loading with 3 points (already has control point)
        if (data.points && data.points.length >= 3) {
            tool._controlPointGenerated = true;
        }
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
// Double Curve Tool (S-curve with 4 points - smooth wave pattern)
// ============================================================================

function stripSvgPathMoveTo(pathStr) {
    if (!pathStr) return '';
    const match = /^M\s*-?\d*\.?\d+(?:e[-+]?\d+)?\s*,\s*-?\d*\.?\d+(?:e[-+]?\d+)?\s*/i.exec(pathStr)
        || /^M\s*-?\d*\.?\d+(?:e[-+]?\d+)?\s+-?\d*\.?\d+(?:e[-+]?\d+)?\s*/i.exec(pathStr);
    return match ? pathStr.slice(match[0].length) : pathStr;
}

function doubleCurveEndpointTangents(corePath, fallbackPts) {
    const n = fallbackPts.length - 1;
    let startTan = {
        x: fallbackPts[1].x - fallbackPts[0].x,
        y: fallbackPts[1].y - fallbackPts[0].y,
    };
    let endTan = {
        x: fallbackPts[n].x - fallbackPts[n - 1].x,
        y: fallbackPts[n].y - fallbackPts[n - 1].y,
    };

    if (typeof document !== 'undefined' && corePath) {
        try {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.setAttribute('d', corePath);
            const total = el.getTotalLength();
            if (total > 0) {
                const eps = Math.max(0.5, Math.min(2, total * 0.002));
                const pStart = el.getPointAtLength(0);
                const pStartFwd = el.getPointAtLength(eps);
                const pEnd = el.getPointAtLength(total);
                const pEndBack = el.getPointAtLength(Math.max(0, total - eps));
                startTan = { x: pStartFwd.x - pStart.x, y: pStartFwd.y - pStart.y };
                endTan = { x: pEnd.x - pEndBack.x, y: pEnd.y - pEndBack.y };
            }
        } catch (_) {}
    }

    return { startTan, endTan };
}

function doubleCurveUnitVector(v) {
    const len = Math.hypot(v.x, v.y);
    if (!len) return null;
    return { x: v.x / len, y: v.y / len };
}

class DoubleCurveTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('double-curve', points, style);
        this.requiredPoints = 2; // 2 points - auto-generate S-curve
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.waveAmplitude1 = null; // Amplitude for first control point (peak)
        this.waveAmplitude2 = null; // Amplitude for second control point (valley)
        this.ensureTextDefaults();
    }
    
    ensureTextDefaults() {
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.textColor) this.style.textColor = '#FFFFFF';
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
        if (this.style.textOffsetX === undefined) this.style.textOffsetX = 0;
        if (this.style.textOffsetY === undefined) this.style.textOffsetY = -8;
    }
    
    setText(text) {
        this.text = text;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;

        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing double-curve', renderOpts);
        this._clearDrawingLabels(scales);

        // Convert endpoints to screen coordinates first
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        const screenP1 = {
            x: scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x),
            y: scales.yScale(p1.y)
        };
        const screenP2 = {
            x: scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x),
            y: scales.yScale(p2.y)
        };
        
        const screenDx = screenP2.x - screenP1.x;
        const screenDy = screenP2.y - screenP1.y;
        
        // Initialize control points if they don't exist
        if (this.points.length === 2) {
            // Create default control points at 1/3 and 2/3 positions with offset
            // Calculate offset in data coordinates - make it bigger for more visible curve
            const dataDy = this.points[1].y - this.points[0].y;
            const defaultOffset = Math.abs(dataDy) * 0.5;
            this.points.push(
                { x: this.points[0].x + (this.points[1].x - this.points[0].x) * 0.33, 
                  y: this.points[0].y + (this.points[1].y - this.points[0].y) * 0.33 + defaultOffset },
                { x: this.points[0].x + (this.points[1].x - this.points[0].x) * 0.67, 
                  y: this.points[0].y + (this.points[1].y - this.points[0].y) * 0.67 - defaultOffset }
            );
        }
        
        // Convert control points to screen coordinates
        const screenCP1 = drawingPointToScreen(this.points[2], scales);
        const screenCP2 = drawingPointToScreen(this.points[3], scales);
        if (!screenCP1 || !screenCP2) return this.group;
        
        // Spline order: start → control₁ → control₂ → end (not start → end → controls)
        const splinePts = [screenP1, screenCP1, screenCP2, screenP2];
        const pathData = this.buildDoubleCurvePath(splinePts);

        // Invisible hit path for easier clicking (match HorizontalLineTool pattern)
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .attr('stroke-dasharray', null)
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'butt')
            .attr('stroke-linejoin', 'miter')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw the main curve path (core + straight extensions in one path)
        const path = this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('fill', 'none')
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'butt')
            .attr('stroke-linejoin', 'miter')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Arrow markers
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const svg = d3.select(container.node().ownerSVGElement);
            
            if (startStyle === 'arrow') {
                const startMarkerId = `arrow-start-${this.id}`;
                if (typeof SVGHelpers !== 'undefined') {
                    SVGHelpers.createArrowMarker(svg, startMarkerId, this.style.stroke);
                }
                path.attr('marker-start', `url(#${startMarkerId})`);
            }
            
            if (endStyle === 'arrow') {
                const endMarkerId = `arrow-end-${this.id}`;
                if (typeof SVGHelpers !== 'undefined') {
                    SVGHelpers.createArrowMarker(svg, endMarkerId, this.style.stroke);
                }
                path.attr('marker-end', `url(#${endMarkerId})`);
            }
        }

        // Create handles for all points
        if (!renderOpts.skipHandles) {
            this.createHandles(this.group, scales);
        }
        
        return this.group;
    }
    
    // Calculate amplitude from control points
    calculateAmplitudeFromControlPoints(screenPoints) {
        if (screenPoints.length < 4) {
            return Math.abs(screenPoints[1].y - screenPoints[0].y) * 0.5;
        }
        
        // Use the average distance of control points from the baseline
        const p1 = screenPoints[0];
        const p2 = screenPoints[1];
        const cp1 = screenPoints[2];
        const cp2 = screenPoints[3];
        
        // Calculate baseline y at control point x positions
        const t1 = 0.25;
        const t2 = 0.75;
        const baselineY1 = p1.y + (p2.y - p1.y) * t1;
        const baselineY2 = p1.y + (p2.y - p1.y) * t2;
        
        // Distance from baseline
        const dist1 = Math.abs(cp1.y - baselineY1);
        const dist2 = Math.abs(cp2.y - baselineY2);
        
        return (dist1 + dist2) / 2;
    }
    
    /** Catmull–Rom core + straight line extensions aligned to rendered curve tangents. */
    buildDoubleCurvePathParts(splinePts) {
        if (!splinePts || splinePts.length < 2) {
            return { corePath: '', fullPath: '', leftExt: null, rightExt: null };
        }

        const lineGenerator = d3.line()
            .x((d) => d.x)
            .y((d) => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5));

        const corePath = lineGenerator(splinePts) || '';
        const extendLen = 10000;
        const start = splinePts[0];
        const end = splinePts[splinePts.length - 1];
        const { startTan, endTan } = doubleCurveEndpointTangents(corePath, splinePts);
        const startUnit = doubleCurveUnitVector(startTan);
        const endUnit = doubleCurveUnitVector(endTan);

        let leftExt = null;
        let rightExt = null;
        let fullPath = corePath;

        if (this.style.extendLeft && startUnit) {
            leftExt = {
                x1: start.x - startUnit.x * extendLen,
                y1: start.y - startUnit.y * extendLen,
                x2: start.x,
                y2: start.y,
            };
            const curveBody = stripSvgPathMoveTo(corePath);
            fullPath = `M ${leftExt.x1} ${leftExt.y1} L ${leftExt.x2} ${leftExt.y2}${curveBody}`;
        }

        if (this.style.extendRight && endUnit) {
            rightExt = {
                x1: end.x,
                y1: end.y,
                x2: end.x + endUnit.x * extendLen,
                y2: end.y + endUnit.y * extendLen,
            };
            fullPath += ` L ${rightExt.x2} ${rightExt.y2}`;
        }

        return { corePath, fullPath, leftExt, rightExt };
    }

    buildDoubleCurvePath(splinePts) {
        return this.buildDoubleCurvePathParts(splinePts).fullPath;
    }

    // Generate smooth curve using control points (like TradingView)
    generateSCurveWaveIndependent(p1, p2, cp1, cp2) {
        return this.buildDoubleCurvePath([p1, cp1, cp2, p2]);
    }
    
    // Keep old method for backward compatibility
    generateSCurveWave(p1, p2, amplitude) {
        return this.generateSCurveWaveIndependent(p1, p2, amplitude, amplitude);
    }
    
    // Generate Catmull-Rom spline path that passes through all points
    generateCatmullRomPath(points) {
        if (points.length < 2) return '';
        if (points.length === 2) {
            return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
        }
        
        // Use D3's Catmull-Rom curve for smooth interpolation through all points
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5));
        
        return lineGenerator(points);
    }
    
    createHandles(group, scales) {
        this.handles = [];
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();

        if (this.points.length < 4) return;

        // Peak + valley handles only (indices 2 and 3 on the spline).
        computeDoubleCurveHandlePositions(this.points, scales).forEach((pos) => {
            const handleGroup = appendCurveResizeHandle(
                group, pos, this, handleRadius, handleFill, handleStroke, handleStrokeWidth
            );
            this.handles.push(handleGroup);
        });
    }

    updateHandlePositions(scales) {
        if (!this.group || this.points.length < 4) return;
        syncCurveResizeHandlePositions(this.group, computeDoubleCurveHandlePositions(this.points, scales));
    }

    beginHandleDrag(handleRole, context) {
        this._isDragging = true;
    }

    endHandleDrag(handleRole, context) {
        this._isDragging = false;
    }

    // Custom handle drag to maintain control points on curve
    handleCustomHandleDrag(handleRole, context = {}) {
        const { point, pointIndex, scales, screen } = context;
        const pi = parseInt(pointIndex, 10);

        if (!point || !Number.isFinite(pi)) return false;

        if (!this._isDragging) {
            this._isDragging = true;
        }

        if (pi === 0 || pi === 1) {
            this.points[pi] = { x: point.x, y: point.y };
        } else if ((pi === 2 || pi === 3) && scales) {
            setDoubleCurveControlFromScreenDrag(this, scales, pi, point, screen);
        }

        this.meta.updatedAt = Date.now();
        return true;
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2 } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        switch (this.style.textPosition) {
            case 'start':
                baseX = x1;
                baseY = y1;
                break;
            case 'end':
                baseX = x2;
                baseY = y2;
                break;
            case 'middle':
            default:
                baseX = midX;
                baseY = midY;
                break;
        }

        const offsetX = this.style.textOffsetX || 0;
        const offsetY = this.style.textOffsetY || -8;

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: baseX + offsetX,
                y: baseY + offsetY,
                anchor: (typeof TEXT_ALIGN_TO_ANCHOR !== 'undefined' ? TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] : null) || 'middle',
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal'
            });
        }
    }

    static fromJSON(data, chart = null) {
        const tool = new DoubleCurveTool(data.points, data.style);
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
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HighlighterTool,
        ArrowMarkerTool,
        ArrowMarkUpTool,
        ArrowMarkDownTool,
        CircleTool,
        RotatedRectangleTool,
        ArcTool,
        CurveTool,
        DoubleCurveTool
    };
}

// Verify all classes are defined
console.log('✅ Extended Drawing Tools loaded:', {
    HighlighterTool: typeof HighlighterTool,
    ArrowMarkerTool: typeof ArrowMarkerTool,
    ArrowMarkUpTool: typeof ArrowMarkUpTool,
    ArrowMarkDownTool: typeof ArrowMarkDownTool,
    CircleTool: typeof CircleTool,
    RotatedRectangleTool: typeof RotatedRectangleTool,
    ArcTool: typeof ArcTool,
    CurveTool: typeof CurveTool,
    DoubleCurveTool: typeof DoubleCurveTool
});
