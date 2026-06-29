// ============================================================================
// Channel Drawing Tools
// ============================================================================

/** Perpendicular offset (pixels) from baseline (x1,y1)-(x2,y2) to parallel line through (x3,y3). */
function parallelChannelPixelOffset(x1, y1, x2, y2, x3, y3) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(len) || len < 1e-6) {
        const oy = (Number.isFinite(y3) && Number.isFinite(y1)) ? y3 - y1 : 0;
        return { offsetX: 0, offsetY: oy };
    }
    const perpX = -dy / len;
    const perpY = dx / len;
    const perpDist = (x3 - x1) * perpX + (y3 - y1) * perpY;
    return { offsetX: perpX * perpDist, offsetY: perpY * perpDist };
}

/** Plot L/R in dataIndexToPixel space — stable across zoom/pan (not xScale.domain range). */
function channelPlotHorizontalBounds(scales) {
    if (typeof BaseDrawing !== 'undefined' && typeof BaseDrawing.getChartHorizontalPixelBounds === 'function') {
        return BaseDrawing.getChartHorizontalPixelBounds(scales);
    }
    const chart = scales && scales.chart;
    const m = (chart && chart.margin) ? chart.margin : { l: 0, r: 60 };
    const left = typeof m.l === 'number' ? m.l : 0;
    let plotW = chart && chart.w;
    if (Number.isFinite(plotW)) {
        return { left, right: plotW - (typeof m.r === 'number' ? m.r : 0) };
    }
    const r = scales && scales.xScale && scales.xScale.range ? scales.xScale.range() : [left, left + 1];
    return { left: r[0], right: r[1] };
}

/** Extend line endpoints to plot edges using the same pixel space as dataIndexToPixel. */
function extendLineSegmentToPlotEdges(sX, sY, eX, eY, bounds, extendLeft, extendRight) {
    let outSX = sX;
    let outSY = sY;
    let outEX = eX;
    let outEY = eY;
    const dx = eX - sX;
    if (Math.abs(dx) < 1e-9) return { sX: outSX, sY: outSY, eX: outEX, eY: outEY };
    const slope = (eY - sY) / dx;
    const yAt = (x) => sY + slope * (x - sX);
    if (extendLeft) {
        outSX = bounds.left;
        outSY = yAt(bounds.left);
    }
    if (extendRight) {
        outEX = bounds.right;
        outEY = yAt(bounds.right);
    }
    return { sX: outSX, sY: outSY, eX: outEX, eY: outEY };
}

// ============================================================================
// Parallel Channel Tool
// ============================================================================
class ParallelChannelTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('parallel-channel', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.color = style.color || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || DRAWING_TOOL_DEFAULT_FILL;
        this.style.strokeDasharray = style.strokeDasharray || '0';
        this.style.extendLeft = style.extendLeft || false;
        this.style.extendRight = style.extendRight || false;
        this.ensureTextDefaults();
        
        // Initialize default levels (0/1 rails; middle at 0.5 between 0.25 and 0.75)
        const baseColor = this.style.stroke;
        this.levels = [
            { value: 0, color: baseColor, enabled: true },
            { value: 0.25, color: '#1e3a5f', enabled: false },
            { value: 0.5, color: baseColor, enabled: true, lineType: '5,5' },
            { value: 0.75, color: '#1e3a5f', enabled: false },
            { value: 1, color: baseColor, enabled: true }
        ];
    }

    /** Keep levels sorted by value so each row maps to one chart line. */
    _normalizeLevels() {
        if (!Array.isArray(this.levels)) {
            this.levels = [];
            return;
        }
        this.levels = this.levels
            .filter((lv) => lv && Number.isFinite(parseFloat(lv.value)))
            .sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
    }

    ensureTextDefaults() {
        if (!this.style.textColor) this.style.textColor = this.style.stroke;
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.fontFamily) this.style.fontFamily = 'Roboto, sans-serif';
        if (!this.style.fontWeight) this.style.fontWeight = 'normal';
        if (!this.style.fontStyle) this.style.fontStyle = 'normal';
        if (!this.style.textVAlign) this.style.textVAlign = 'middle';
        if (!this.style.textHAlign) this.style.textHAlign = 'center';
    }

    /**
     * Custom handle drag for parallel channel - TradingView style
     * Point 2 (parallel line) moves perpendicular to baseline, following mouse direction
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex, scales } = context;
        
        // Handle string-based middle handles
        if (typeof handleRole === 'string') {
            if (!dataPoint) return false;
            
            const p0 = this.points[0];
            const p1 = this.points[1];
            const p2 = this.points[2] || p1;
            
            // Calculate baseline vector
            const baseX = p1.x - p0.x;
            const baseY = p1.y - p0.y;
            const baseLen = Math.sqrt(baseX * baseX + baseY * baseY);
            
            if (baseLen === 0) return false;
            
            // Calculate perpendicular unit vector
            const perpX = -baseY / baseLen;
            const perpY = baseX / baseLen;

            const scales = context.scales || {};
            const px0 = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p0.x) : (scales.xScale ? scales.xScale(p0.x) : 0);
            const py0 = scales.yScale ? scales.yScale(p0.y) : 0;
            const px1 = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p1.x) : (scales.xScale ? scales.xScale(p1.x) : 0);
            const py1 = scales.yScale ? scales.yScale(p1.y) : 0;
            const px2 = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p2.x) : (scales.xScale ? scales.xScale(p2.x) : px0);
            const py2 = scales.yScale ? scales.yScale(p2.y) : py0;
            const { offsetX, offsetY } = parallelChannelPixelOffset(px0, py0, px1, py1, px2, py2);
            const toDataX = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
                ? scales.chart.pixelToDataIndex(px)
                : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : px);
            const toDataY = (py) => (scales.yScale && typeof scales.yScale.invert === 'function')
                ? scales.yScale.invert(py)
                : py;
            const dataPointToPixel = () => {
                const dpx = scales.chart && scales.chart.dataIndexToPixel
                    ? scales.chart.dataIndexToPixel(dataPoint.x)
                    : (scales.xScale ? scales.xScale(dataPoint.x) : 0);
                const dpy = scales.yScale ? scales.yScale(dataPoint.y) : 0;
                return { x: dpx, y: dpy };
            };

            const moveP0PreserveOffset = (newP0) => {
                const perpDist = (p2.x - p0.x) * perpX + (p2.y - p0.y) * perpY;
                this.points[0] = { x: newP0.x, y: newP0.y };
                this.points[2] = {
                    x: newP0.x + perpX * perpDist,
                    y: newP0.y + perpY * perpDist
                };
                this.meta.updatedAt = Date.now();
                return true;
            };

            const moveP1PreserveOffset = (newP1) => {
                const perpDist = (p2.x - p0.x) * perpX + (p2.y - p0.y) * perpY;
                this.points[1] = { x: newP1.x, y: newP1.y };
                const newBaseX = newP1.x - p0.x;
                const newBaseY = newP1.y - p0.y;
                const newBaseLen = Math.sqrt(newBaseX * newBaseX + newBaseY * newBaseY);
                if (newBaseLen > 0) {
                    const nPerpX = -newBaseY / newBaseLen;
                    const nPerpY = newBaseX / newBaseLen;
                    this.points[2] = {
                        x: p0.x + nPerpX * perpDist,
                        y: p0.y + nPerpY * perpDist
                    };
                }
                this.meta.updatedAt = Date.now();
                return true;
            };

            const cornerDragToBaselinePoint = (subtractOffset) => {
                const dp = dataPointToPixel();
                const bx = subtractOffset ? dp.x - offsetX : dp.x;
                const by = subtractOffset ? dp.y - offsetY : dp.y;
                return { x: toDataX(bx), y: toDataY(by) };
            };
            
            if (handleRole === 'top-mid') {
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                const deltaX = dataPoint.x - midX;
                const deltaY = dataPoint.y - midY;
                this.points[0] = { x: p0.x + deltaX, y: p0.y + deltaY };
                this.points[1] = { x: p1.x + deltaX, y: p1.y + deltaY };
                this.points[2] = { x: p2.x + deltaX, y: p2.y + deltaY };
                this.meta.updatedAt = Date.now();
                return true;
            }
            
            if (handleRole === 'bottom-mid') {
                const perpDist = (dataPoint.x - p0.x) * perpX + (dataPoint.y - p0.y) * perpY;
                this.points[2] = { x: p0.x + perpX * perpDist, y: p0.y + perpY * perpDist };
                this.meta.updatedAt = Date.now();
                return true;
            }
            
            if (handleRole === 'bottom-right') {
                return moveP1PreserveOffset(cornerDragToBaselinePoint(true));
            }

            if (handleRole === 'bottom-left') {
                return moveP0PreserveOffset(cornerDragToBaselinePoint(true));
            }

            if (handleRole === 'top-left') {
                return moveP0PreserveOffset(cornerDragToBaselinePoint(false));
            }

            if (handleRole === 'top-right') {
                return moveP1PreserveOffset(cornerDragToBaselinePoint(false));
            }
            
            return false;
        }
        
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        if (!dataPoint || isNaN(index) || index < 0 || index >= this.points.length) {
            return false;
        }
        
        // Points 0 and 1 move freely (they define the main line)
        if (index === 0 || index === 1) {
            this.points[index] = { x: dataPoint.x, y: dataPoint.y };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        // Point 2 — perpendicular offset from baseline (same as placement)
        if (index === 2 && this.points.length >= 3) {
            const p0 = this.points[0];
            const p1 = this.points[1];
            const baseX = p1.x - p0.x;
            const baseY = p1.y - p0.y;
            const baseLen = Math.sqrt(baseX * baseX + baseY * baseY);
            if (baseLen > 0) {
                const perpX = -baseY / baseLen;
                const perpY = baseX / baseLen;
                const perpDist = (dataPoint.x - p0.x) * perpX + (dataPoint.y - p0.y) * perpY;
                this.points[2] = {
                    x: p0.x + perpX * perpDist,
                    y: p0.y + perpY * perpDist
                };
            } else {
                this.points[2] = { x: p0.x, y: dataPoint.y };
            }
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        return false;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this._prepareRenderGroup(container, 'drawing parallel-channel', renderOpts);
        this._clearDrawingLabels(scales);
        this.group.style('pointer-events', 'none').style('cursor', 'default');

        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2] || this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        if (this.points.length >= 3) {
            const x3 = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p3.x) : scales.xScale(p3.x);
            const y3 = scales.yScale(p3.y);

            const dx = x2 - x1;
            const dy = y2 - y1;
            const { offsetX, offsetY } = parallelChannelPixelOffset(x1, y1, x2, y2, x3, y3);

            const plotBounds = channelPlotHorizontalBounds(scales);

            // Helper to calculate line endpoints with extension
            const getLineEndpoints = (baseStartX, baseStartY, baseEndX, baseEndY) => {
                const ep = extendLineSegmentToPlotEdges(
                    baseStartX,
                    baseStartY,
                    baseEndX,
                    baseEndY,
                    plotBounds,
                    !!this.style.extendLeft,
                    !!this.style.extendRight
                );
                return { sX: ep.sX, sY: ep.sY, eX: ep.eX, eY: ep.eY };
            };

            // Draw fill first (background)
            const channelFill = typeof shapeBackgroundFill === 'function'
                ? shapeBackgroundFill(this.style, DRAWING_TOOL_DEFAULT_FILL)
                : (this.style.showBackground !== false && this.style.fill && this.style.fill !== 'none'
                    ? this.style.fill
                    : 'none');
            if (channelFill && channelFill !== 'none') {
                const base = getLineEndpoints(x1, y1, x2, y2);
                const parallel = getLineEndpoints(x1 + offsetX, y1 + offsetY, x2 + offsetX, y2 + offsetY);
                this.group.append('polygon')
                    .attr('points', `${base.sX},${base.sY} ${base.eX},${base.eY} ${parallel.eX},${parallel.eY} ${parallel.sX},${parallel.sY}`)
                    .attr('fill', channelFill)
                    .attr('stroke', 'none')
                    .attr('class', 'shape-fill')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');
            }

            // Draw level lines from levels array; legacy 0/1 rails only when levels are empty
            const drawLevelLine = (t, color, lineWidth, lineType) => {
                const levelOffsetX = offsetX * t;
                const levelOffsetY = offsetY * t;
                const levelStartX = x1 + levelOffsetX;
                const levelStartY = y1 + levelOffsetY;
                const levelEndX = x2 + levelOffsetX;
                const levelEndY = y2 + levelOffsetY;
                const endpoints = getLineEndpoints(levelStartX, levelStartY, levelEndX, levelEndY);
                
                this.group.append('line')
                    .attr('x1', endpoints.sX)
                    .attr('y1', endpoints.sY)
                    .attr('x2', endpoints.eX)
                    .attr('y2', endpoints.eY)
                    .attr('stroke', color)
                    .attr('stroke-width', lineWidth || this.style.strokeWidth)
                    .attr('stroke-dasharray', lineType !== undefined ? (lineType || 'none') : this.style.strokeDasharray)
                    .attr('data-level', t)
                    .style('cursor', 'move')
                    .style('pointer-events', 'stroke');
                
                // Add invisible wider hit area for easier selection
                this.group.append('line')
                    .attr('class', 'shape-border-hit')
                    .attr('x1', endpoints.sX)
                    .attr('y1', endpoints.sY)
                    .attr('x2', endpoints.eX)
                    .attr('y2', endpoints.eY)
                    .attr('stroke', 'transparent')
                    .attr('stroke-width', Math.max(16, (lineWidth || this.style.strokeWidth || 2) * 5))
                    .attr('data-level', t)
                    .style('cursor', 'move')
                    .style('pointer-events', 'stroke');
            };

            const baseStroke = this.style.stroke;
            const baseWidth = scaledStrokeWidth;
            const baseDash = this.style.strokeDasharray || 'none';
            const levelNear = (t, levels) => levels.some((lv) => {
                const v = typeof lv.value === 'number' ? lv.value : parseFloat(lv.value);
                return Number.isFinite(v) && Math.abs(v - t) < 1e-6;
            });

            this._normalizeLevels();
            const sortedLevelList = this.levels;

            // Draw all levels from levels array (including 0 / 1 boundary rails when present)
            if (sortedLevelList.length > 0) {
                sortedLevelList.forEach(level => {
                    const t = typeof level.value === 'number' ? level.value : parseFloat(level.value);
                    if (!Number.isFinite(t)) return;

                    const levelOffsetX = offsetX * t;
                    const levelOffsetY = offsetY * t;
                    const levelStartX = x1 + levelOffsetX;
                    const levelStartY = y1 + levelOffsetY;
                    const levelEndX = x2 + levelOffsetX;
                    const levelEndY = y2 + levelOffsetY;
                    const endpoints = getLineEndpoints(levelStartX, levelStartY, levelEndX, levelEndY);
                    const strokeColor = level.color || baseStroke;
                    const strokeW = level.lineWidth || baseWidth;
                    const strokeDash = level.lineType !== undefined ? (level.lineType || 'none') : baseDash;

                    this.group.append('line')
                        .attr('x1', endpoints.sX)
                        .attr('y1', endpoints.sY)
                        .attr('x2', endpoints.eX)
                        .attr('y2', endpoints.eY)
                        .attr('stroke', strokeColor)
                        .attr('stroke-width', strokeW)
                        .attr('stroke-dasharray', strokeDash)
                        .attr('data-level', t)
                        .style('cursor', 'move')
                        .style('pointer-events', 'stroke')
                        .style('display', level.enabled ? null : 'none');

                    this.group.append('line')
                        .attr('class', 'shape-border-hit')
                        .attr('x1', endpoints.sX)
                        .attr('y1', endpoints.sY)
                        .attr('x2', endpoints.eX)
                        .attr('y2', endpoints.eY)
                        .attr('stroke', 'transparent')
                        .attr('stroke-width', Math.max(16, (strokeW || 2) * 5))
                        .attr('data-level', t)
                        .style('cursor', 'move')
                        .style('pointer-events', level.enabled ? 'stroke' : 'none')
                        .style('display', level.enabled ? null : 'none');
                });
            }

            // Legacy drawings without a levels array — draw default 0 / 1 rails only then
            if (sortedLevelList.length === 0) {
                if (!levelNear(0, sortedLevelList)) drawLevelLine(0, baseStroke, baseWidth, baseDash);
                if (!levelNear(1, sortedLevelList)) drawLevelLine(1, baseStroke, baseWidth, baseDash);
            }

            if (this.text && this.text.trim()) {
                this.renderTextLabel(scales);
            }
            
            // Create handles if selected
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        } else {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray);
        }
    }

    renderTextLabel(scales) {
        const label = this.text || '';
        if (!label.trim()) return;

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: midX,
                y: midY - 10,
                anchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal'
            });
        }
    }

    createHandles(group, scales) {
        this.handles = [];
        const handleRadius = 3;
        const hitRadius = 12;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        const handlePositions = this._parallelChannelHandlePositions(scales);
        if (!handlePositions.length) return;
        
        handlePositions.forEach((pos) => {
            const isStringIndex = typeof pos.index === 'string';
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', pos.index)
                .attr('data-handle-role', isStringIndex ? pos.index : null)
                .attr('data-handle-type', pos.type);
            
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', pos.cx)
                .attr('cy', pos.cy)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .attr('data-point-index', pos.index)
                .attr('data-handle-role', isStringIndex ? pos.index : null);
            
            if (pos.type === 'middle') {
                handleGroup.append('circle')
                    .attr('class', 'resize-handle')
                    .attr('cx', pos.cx)
                    .attr('cy', pos.cy)
                    .attr('r', handleRadius)
                    .attr('fill', handleFill)
                    .attr('stroke', handleStroke)
                    .attr('stroke-width', handleStrokeWidth)
                    .style('cursor', 'nwse-resize')
                    .style('pointer-events', 'all')
                    .style('opacity', this.selected ? 1 : 0)
                    .attr('data-point-index', pos.index)
                    .attr('data-handle-role', pos.index);
            } else {
                handleGroup.append('circle')
                    .attr('class', 'resize-handle')
                    .attr('cx', pos.cx)
                    .attr('cy', pos.cy)
                    .attr('r', handleRadius)
                    .attr('fill', handleFill)
                    .attr('stroke', handleStroke)
                    .attr('stroke-width', handleStrokeWidth)
                    .style('cursor', 'nwse-resize')
                    .style('pointer-events', 'all')
                    .style('opacity', this.selected ? 1 : 0)
                    .attr('data-point-index', pos.index)
                    .attr('data-handle-role', isStringIndex ? pos.index : null);
            }
            
            this.handles.push(handleGroup);
        });
    }

    _parallelChannelHandlePositions(scales) {
        if (!scales || this.points.length < 2) return [];
        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2] || this.points[1];
        const x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x)
            : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x)
            : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);
        const x3 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p3.x)
            : scales.xScale(p3.x);
        const y3 = scales.yScale(p3.y);
        const { offsetX, offsetY } = parallelChannelPixelOffset(x1, y1, x2, y2, x3, y3);
        return [
            { cx: x1, cy: y1, index: 'top-left', type: 'corner' },
            { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, index: 'top-mid', type: 'middle' },
            { cx: x2, cy: y2, index: 'top-right', type: 'corner' },
            { cx: x1 + offsetX, cy: y1 + offsetY, index: 'bottom-left', type: 'corner' },
            { cx: (x1 + x2) / 2 + offsetX, cy: (y1 + y2) / 2 + offsetY, index: 'bottom-mid', type: 'middle' },
            { cx: x2 + offsetX, cy: y2 + offsetY, index: 'bottom-right', type: 'corner' }
        ];
    }

    updateHandlePositions(scales) {
        if (!this.group || this.group.empty() || !scales) return;
        this._parallelChannelHandlePositions(scales).forEach((pos) => {
            this.group.selectAll(`.resize-handle-group[data-point-index="${pos.index}"] circle`)
                .attr('cx', pos.cx)
                .attr('cy', pos.cy);
        });
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            visible: this.visible,
            locked: !!this.locked,
            text: this.text || '',
            levels: this.levels || [],
            meta: this.meta
        };
    }

    static fromJSON(data, chart) {
        const tool = new ParallelChannelTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        tool.levels = Array.isArray(data.levels) ? data.levels : [];
        tool._normalizeLevels();
        tool.chart = chart;
        if (data.locked !== undefined) tool.locked = !!data.locked;
        return tool;
    }
}

// ============================================================================
// Regression Trend Tool
// ============================================================================
class RegressionTrendTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('regression-trend', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.upperStroke = style.upperStroke || '#9c27b0';
        this.style.upperStrokeWidth = style.upperStrokeWidth || 2;
        this.style.upperStrokeDasharray = style.upperStrokeDasharray || '0';
        this.style.lowerStroke = style.lowerStroke || '#9c27b0';
        this.style.lowerStrokeWidth = style.lowerStrokeWidth || 2;
        this.style.lowerStrokeDasharray = style.lowerStrokeDasharray || '0';
        this.style.fill = style.fill || 'rgba(156, 39, 176, 0.1)';
        this.style.upperFill = style.upperFill || 'rgba(156, 39, 176, 0.1)';
        this.style.lowerFill = style.lowerFill || 'rgba(156, 39, 176, 0.1)';
        this.style.strokeDasharray = style.strokeDasharray || '5,5';
        this.style.extendLeft = style.extendLeft !== undefined ? style.extendLeft : false;
        this.style.extendRight = style.extendRight !== undefined ? style.extendRight : false;
        this.style.upperDeviation = style.upperDeviation !== undefined ? style.upperDeviation : 2;
        this.style.lowerDeviation = style.lowerDeviation !== undefined ? style.lowerDeviation : -2;
        this.style.useUpperDeviation = style.useUpperDeviation !== false;
        this.style.useLowerDeviation = style.useLowerDeviation !== false;
        this.style.source = style.source || 'close';
        this.style.showPearsonsR = style.showPearsonsR !== undefined ? style.showPearsonsR : false;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        if (!this.style.textColor) this.style.textColor = this.style.stroke;
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.fontFamily) this.style.fontFamily = 'Roboto, sans-serif';
        if (!this.style.fontWeight) this.style.fontWeight = 'normal';
        if (!this.style.fontStyle) this.style.fontStyle = 'normal';
    }

    calculateLinearRegression(data, startIdx, endIdx) {
        // Calculate linear regression matching TradingView's implementation
        const n = endIdx - startIdx + 1;
        if (n < 2) return null;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const values = [];

        for (let i = startIdx; i <= endIdx; i++) {
            const x = i - startIdx;
            const y = data[i];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
            values.push(y);
        }

        // Linear regression: y = a + b*x
        const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const a = (sumY - b * sumX) / n;

        // Calculate standard deviation using the proper statistical formula
        // This is the root mean square deviation from the regression line
        let sumSquaredDeviations = 0;
        let sumSquaredTotal = 0;
        const meanY = sumY / n;
        
        for (let i = 0; i < n; i++) {
            const predicted = a + b * i;
            const deviation = values[i] - predicted;
            sumSquaredDeviations += deviation * deviation;
            sumSquaredTotal += (values[i] - meanY) * (values[i] - meanY);
        }
        
        // Standard deviation (using n-1 for sample standard deviation)
        const stdDev = Math.sqrt(sumSquaredDeviations / (n - 1));
        
        // Calculate R² (coefficient of determination)
        const r2 = sumSquaredTotal !== 0 ? 1 - (sumSquaredDeviations / sumSquaredTotal) : 0;

        return { a, b, stdDev, n, r2 };
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Get chart reference first
        const chart = scales.chart || window.chart || this.chart;
        
        // Get candle data from chart - try multiple sources
        let chartData = null;
        if (scales.chart && scales.chart.data) {
            chartData = scales.chart.data;
        } else if (window.chart && window.chart.data) {
            chartData = window.chart.data;
        } else if (this.chart && this.chart.data) {
            chartData = this.chart.data;
        }
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        // Check if we're actively resizing/dragging handles
        const manager = window.drawingToolsManager || scales.manager;
        const isBeingResized = manager && manager.isResizing && manager.resizingDrawing === this;
        
        // Create new group
        this._prepareRenderGroup(container, 'drawing regression-trend', renderOpts);
        this._clearDrawingLabels(scales);
        this.group.style('pointer-events', 'none').style('cursor', 'default');
        
        // Create a clipped sub-group for visual elements only
        // Handles will be added to the main group (unclipped)
        let visualGroup = this.group;
        if (!isPreview && !isBeingResized && chartData && chartData.length > 0 && !this.style.extendLeft && !this.style.extendRight) {
            // Only apply clipping if extend is disabled
            const clipId = `regression-clip-${this.id}`;
            const clipYRange = scales.yScale.range();
            
            // Get the pixel position of the last candle
            const lastCandleIdx = chartData.length - 1;
            const lastCandleX = chart.dataIndexToPixel ? chart.dataIndexToPixel(lastCandleIdx) : scales.xScale(lastCandleIdx);
            const firstCandleX = chart.dataIndexToPixel ? chart.dataIndexToPixel(0) : scales.xScale(0);
            
            container.append('defs').append('clipPath')
                .attr('id', clipId)
                .append('rect')
                .attr('x', firstCandleX)
                .attr('y', clipYRange[1])
                .attr('width', lastCandleX - firstCandleX)
                .attr('height', clipYRange[0] - clipYRange[1]);
            
            // Create clipped sub-group for visual elements
            visualGroup = this.group.append('g')
                .attr('clip-path', `url(#${clipId})`);
        }
        
        // If in preview mode (while dragging) OR being resized, show simple line with vertical guides
        if (isPreview || isBeingResized) {
            
            // Convert data coordinates to pixel coordinates
            const x1 = chart.dataIndexToPixel ? chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
            const y1 = scales.yScale(p1.y);
            const x2 = chart.dataIndexToPixel ? chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
            const y2 = scales.yScale(p2.y);
            
            // Draw main preview line
            visualGroup.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray)
                .attr('opacity', 0.6)
                .style('cursor', 'move');
            
            // Draw vertical line at start point (full height)
            // Use scales to get the actual chart bounds
            const yMin = scales.yScale.domain()[0];
            const yMax = scales.yScale.domain()[1];
            const topY = scales.yScale(yMax);
            const bottomY = scales.yScale(yMin);
            
            visualGroup.append('line')
                .attr('x1', x1)
                .attr('y1', topY)
                .attr('x2', x1)
                .attr('y2', bottomY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.4)
                .style('pointer-events', 'none');
            
            // Draw vertical line at end point (full height)
            visualGroup.append('line')
                .attr('x1', x2)
                .attr('y1', topY)
                .attr('x2', x2)
                .attr('y2', bottomY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.4)
                .style('pointer-events', 'none');
            
            return;
        }

        // chartData already retrieved at the top of the function
        if (!chartData || chartData.length === 0) {
            console.warn('Regression Trend: No chart data available');
            return;
        }

        const startIdx = Math.round(Math.min(p1.x, p2.x));
        const endIdx = Math.round(Math.max(p1.x, p2.x));

        // Extract source data (close, high, low, open)
        const sourceData = [];
        for (let i = startIdx; i <= endIdx; i++) {
            if (i >= 0 && i < chartData.length) {
                const candle = chartData[i];
                let value;
                switch (this.style.source) {
                    case 'high': value = candle.h || candle.high; break;
                    case 'low': value = candle.l || candle.low; break;
                    case 'open': value = candle.o || candle.open; break;
                    case 'close':
                    default: value = candle.c || candle.close; break;
                }
                sourceData.push(value);
            }
        }

        if (sourceData.length < 2) {
            console.warn('Regression Trend: Not enough data points', sourceData.length);
            return;
        }

        // Calculate regression
        const regression = this.calculateLinearRegression(sourceData, 0, sourceData.length - 1);
        if (!regression) return;

        const { a, b, stdDev, r2 } = regression;

        // Get the visible chart range - use chart's actual visible indices
        let visibleStartIdx, visibleEndIdx;
        if (chart && chart.visibleStartIndex !== undefined && chart.visibleEndIndex !== undefined) {
            visibleStartIdx = chart.visibleStartIndex;
            visibleEndIdx = chart.visibleEndIndex;
        } else {
            // Fallback to calculating from xScale domain
            const xDomain = scales.xScale.domain();
            visibleStartIdx = Math.max(0, Math.floor(xDomain[0]));
            visibleEndIdx = Math.min(chartData.length - 1, Math.ceil(xDomain[1]));
        }
        
        // Get pixel boundaries of the plot area (dataIndexToPixel space)
        const plotBounds = channelPlotHorizontalBounds(scales);

        const idxToPx = (idx) => (chart.dataIndexToPixel
            ? chart.dataIndexToPixel(idx)
            : scales.xScale(idx));
        const pxToIdx = (px) => (chart.pixelToDataIndex
            ? chart.pixelToDataIndex(px)
            : (scales.xScale.invert ? scales.xScale.invert(px) : startIdx));

        const regPriceAt = (barIdx) => a + b * (barIdx - startIdx);

        let startX = idxToPx(startIdx);
        let endX = idxToPx(endIdx);
        let startY = scales.yScale(regPriceAt(startIdx));
        let endY = scales.yScale(regPriceAt(endIdx));

        const deviationOffsetUpper = this.style.upperDeviation * stdDev;
        const deviationOffsetLower = this.style.lowerDeviation * stdDev;

        let upperStartY = scales.yScale(regPriceAt(startIdx) + deviationOffsetUpper);
        let upperEndY = scales.yScale(regPriceAt(endIdx) + deviationOffsetUpper);
        let lowerStartY = scales.yScale(regPriceAt(startIdx) + deviationOffsetLower);
        let lowerEndY = scales.yScale(regPriceAt(endIdx) + deviationOffsetLower);
        let midStartY = startY;
        let midEndY = endY;

        if (this.style.extendLeft) {
            const leftIdx = pxToIdx(plotBounds.left);
            const leftPrice = regPriceAt(leftIdx);
            startX = plotBounds.left;
            startY = scales.yScale(leftPrice);
            midStartY = startY;
            upperStartY = scales.yScale(leftPrice + deviationOffsetUpper);
            lowerStartY = scales.yScale(leftPrice + deviationOffsetLower);
        }

        if (this.style.extendRight) {
            const rightIdx = pxToIdx(plotBounds.right);
            const rightPrice = regPriceAt(rightIdx);
            endX = plotBounds.right;
            endY = scales.yScale(rightPrice);
            midEndY = endY;
            upperEndY = scales.yScale(rightPrice + deviationOffsetUpper);
            lowerEndY = scales.yScale(rightPrice + deviationOffsetLower);
        }

        const showMidLine = this.style.showMiddleLine !== false;
        const showUpperFill = this.style.showUpperFill !== false;
        const showLowerFill = this.style.showLowerFill !== false;

        // Draw upper background (between regression line and upper deviation)
        if (this.style.upperFill && this.style.upperFill !== 'none' && showUpperFill) {
            visualGroup.append('polygon')
                .attr('points', `${startX},${midStartY} ${endX},${midEndY} ${endX},${upperEndY} ${startX},${upperStartY}`)
                .attr('fill', this.style.upperFill)
                .attr('stroke', 'none')
                .attr('class', 'upper-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        // Draw lower background (between regression line and lower deviation)
        if (this.style.lowerFill && this.style.lowerFill !== 'none' && showLowerFill) {
            visualGroup.append('polygon')
                .attr('points', `${startX},${midStartY} ${endX},${midEndY} ${endX},${lowerEndY} ${startX},${lowerStartY}`)
                .attr('fill', this.style.lowerFill)
                .attr('stroke', 'none')
                .attr('class', 'lower-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        // Draw main regression line (on top of fills)
        if (showMidLine) {
            visualGroup.append('line')
                .attr('class', 'main-line')
                .attr('x1', startX)
                .attr('y1', midStartY)
                .attr('x2', endX)
                .attr('y2', midEndY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray)
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');

            visualGroup.append('line')
                .attr('class', 'main-line-hit shape-border-hit')
                .attr('x1', startX)
                .attr('y1', midStartY)
                .attr('x2', endX)
                .attr('y2', midEndY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, this.style.strokeWidth * 5))
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
        }

        // Draw deviation channels using the already calculated positions
        if (this.style.useUpperDeviation) {
            visualGroup.append('line')
                .attr('class', 'upper-line')
                .attr('x1', startX)
                .attr('y1', upperStartY)
                .attr('x2', endX)
                .attr('y2', upperEndY)
                .attr('stroke', this.style.upperStroke)
                .attr('stroke-width', this.style.upperStrokeWidth)
                .attr('stroke-dasharray', this.style.upperStrokeDasharray)
                .attr('opacity', 0.6)
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
            
            // Add invisible wider hit area for easier selection
            visualGroup.append('line')
                .attr('class', 'upper-line-hit shape-border-hit')
                .attr('x1', startX)
                .attr('y1', upperStartY)
                .attr('x2', endX)
                .attr('y2', upperEndY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, this.style.upperStrokeWidth * 5))
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
        }

        if (this.style.useLowerDeviation) {
            visualGroup.append('line')
                .attr('class', 'lower-line')
                .attr('x1', startX)
                .attr('y1', lowerStartY)
                .attr('x2', endX)
                .attr('y2', lowerEndY)
                .attr('stroke', this.style.lowerStroke)
                .attr('stroke-width', this.style.lowerStrokeWidth)
                .attr('stroke-dasharray', this.style.lowerStrokeDasharray)
                .attr('opacity', 0.6)
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
            
            // Add invisible wider hit area for easier selection
            visualGroup.append('line')
                .attr('class', 'lower-line-hit shape-border-hit')
                .attr('x1', startX)
                .attr('y1', lowerStartY)
                .attr('x2', endX)
                .attr('y2', lowerEndY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, this.style.lowerStrokeWidth * 5))
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
        }

        if (this.text && this.text.trim()) {
            this.renderTextLabel(scales);
        }
        
        // Display Pearson's R if enabled
        if (this.style.showPearsonsR && r2 !== undefined) {
            const deviationOffsetLower = this.style.lowerDeviation * stdDev;
            const lowerStartRegressionY = scales.yScale(a + deviationOffsetLower);
            const lowerEndRegressionY = lowerEndY !== undefined ? lowerEndY : lowerStartRegressionY;
            const angle = Math.atan2(lowerEndRegressionY - lowerStartRegressionY, endX - startX) * (180 / Math.PI);
            this.renderPearsonsR(scales, r2, startX, lowerStartRegressionY, angle);
        }
        
        // Create handles if selected
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
    }

    renderTextLabel(scales) {
        const label = this.text || '';
        if (!label.trim()) return;

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: midX,
                y: midY - 10,
                anchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal'
            });
        }
    }

    renderPearsonsR(scales, r2, x, y, angle) {
        if (!this.group) return;
        
        // Format R value with 4 decimal places
        const r2Text = `R = ${r2.toFixed(4)}`;
        
        // Anchor just below the start of the lower deviation line
        const textX = x;
        const textY = y + 14;
        
        this.group.append('text')
            .attr('class', 'pearson-r-text')
            .attr('x', textX)
            .attr('y', textY)
            .attr('text-anchor', 'start')
            .attr('transform', `rotate(${angle}, ${textX}, ${textY})`)
            .style('font-size', `${this.style.fontSize || 12}px`)
            .style('font-family', this.style.fontFamily)
            .style('font-weight', this.style.fontWeight)
            .style('fill', this.style.lowerStroke || this.style.stroke)
            .style('pointer-events', 'none')
            .text(r2Text);
    }

    createHandles(group, scales) {
        this.handles = [];
        const handleRadius = 3;
        const hitRadius = 12;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        group.selectAll('.vertical-guide').remove();
        
        const showFull = this.selected;
        
        // Get chart data for regression calculation
        const chart = scales.chart || window.chart || this.chart;
        let chartData = null;
        if (chart && chart.data) {
            chartData = chart.data;
        }
        
        if (!chartData || chartData.length === 0) return;
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        const startIdx = Math.round(Math.min(p1.x, p2.x));
        const endIdx = Math.round(Math.max(p1.x, p2.x));
        
        // Extract source data and calculate regression
        const sourceData = [];
        for (let i = startIdx; i <= endIdx; i++) {
            if (i >= 0 && i < chartData.length) {
                const candle = chartData[i];
                let value;
                switch (this.style.source) {
                    case 'high': value = candle.h || candle.high; break;
                    case 'low': value = candle.l || candle.low; break;
                    case 'open': value = candle.o || candle.open; break;
                    case 'close':
                    default: value = candle.c || candle.close; break;
                }
                sourceData.push(value);
            }
        }
        
        if (sourceData.length < 2) return;
        
        const regression = this.calculateLinearRegression(sourceData, 0, sourceData.length - 1);
        if (!regression) return;
        
        const { a, b } = regression;
        
        // Get chart bounds for vertical guide lines
        const yMin = scales.yScale.domain()[0];
        const yMax = scales.yScale.domain()[1];
        const topY = scales.yScale(yMax);
        const bottomY = scales.yScale(yMin);
        
        // Position handles on the middle regression line
        this.points.forEach((point, index) => {
            const cx = chart.dataIndexToPixel ? chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            
            // Calculate the regression value at this point's x position
            const dataIndex = point.x - startIdx;
            const regressionValue = a + b * dataIndex;
            const cy = scales.yScale(regressionValue);
            
            // Draw vertical guide line for this handle (selected only)
            if (showFull) {
                group.append('line')
                    .attr('class', 'vertical-guide')
                    .attr('x1', cx)
                    .attr('y1', topY)
                    .attr('x2', cx)
                    .attr('y2', bottomY)
                    .attr('stroke', this.style.stroke || DRAWING_TOOL_DEFAULT_STROKE)
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '3,3')
                    .attr('opacity', 0.4)
                    .style('pointer-events', 'none');
            }
            
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'ew-resize')
                .style('pointer-events', 'all')
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'ew-resize')
                .style('pointer-events', showFull ? 'all' : 'none')
                .style('opacity', showFull ? 1 : 0)
                .attr('data-point-index', index);
            
            this.handles.push({ element: handle, point, index });
        });
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            visible: this.visible,
            text: this.text || '',
            meta: this.meta
        };
    }

    static fromJSON(data, chart) {
        const tool = new RegressionTrendTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Flat Top/Bottom Tool
// ============================================================================
class FlatTopBottomTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('flat-top-bottom', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#ff9800';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(255, 152, 0, 0.1)';
        this.style.strokeDasharray = style.strokeDasharray || '0';
        this.style.extendLeft = style.extendLeft || false;
        this.style.extendRight = style.extendRight || false;
        if (this.style.showHandlePrices === undefined) this.style.showHandlePrices = true;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        if (!this.style.textColor) this.style.textColor = this.style.stroke;
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.fontFamily) this.style.fontFamily = 'Roboto, sans-serif';
        if (!this.style.fontWeight) this.style.fontWeight = 'normal';
        if (!this.style.fontStyle) this.style.fontStyle = 'normal';
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex, scales } = context;
        
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        if (!dataPoint || isNaN(index) || index < 0) {
            return false;
        }
        
        // Handle 4th virtual point (bottom-right corner)
        if (index === 3 && this.points.length >= 3) {
            // Moving 4th point (bottom-right) adjusts point 1 X and point 2 Y
            this.points[1] = { x: dataPoint.x, y: this.points[1].y }; // Update p2 X (right side)
            this.points[2] = { x: this.points[2].x, y: dataPoint.y }; // Update p3 Y (bottom)
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        if (index >= this.points.length) {
            return false;
        }
        
        if (index === 0 || index === 1) {
            this.points[index] = { x: dataPoint.x, y: dataPoint.y };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        if (index === 2 && this.points.length >= 3) {
            // Point 2 can only move vertically (to adjust the horizontal line height)
            // Keep its X coordinate, only update Y
            this.points[2] = {
                x: this.points[2].x,
                y: dataPoint.y
            };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        return false;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this._prepareRenderGroup(container, 'drawing flat-top-bottom', renderOpts);
        this._clearDrawingLabels(scales);
        this.group.style('pointer-events', 'none').style('cursor', 'default');

        if (this.points.length === 2) {
            const p1 = this.points[0];
            const p2 = this.points[1];
            const x1 = scales.chart && scales.chart.dataIndexToPixel ?
                scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
            const y1 = scales.yScale(p1.y);
            const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
            const y2 = scales.yScale(p2.y);

            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray)
                .style('cursor', 'move');
            return;
        }

        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);
        const x3 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p3.x) : scales.xScale(p3.x);
        const y3 = scales.yScale(p3.y);

        // Calculate chart bounds for extension (dataIndexToPixel space)
        const plotBounds = channelPlotHorizontalBounds(scales);

        // Calculate slope of angled line (p1 to p2)
        const dx = x2 - x1;
        const dy = y2 - y1;

        // Angled line coordinates
        let angledX1 = x1, angledY1 = y1, angledX2 = x2, angledY2 = y2;
        
        // Horizontal line coordinates (at y3)
        let horizX1 = x1, horizX2 = x2;
        
        // Fill polygon points
        let fillX1 = x1, fillX2 = x2;

        if (this.style.extendLeft || this.style.extendRight) {
            const angled = extendLineSegmentToPlotEdges(
                x1, y1, x2, y2, plotBounds, !!this.style.extendLeft, !!this.style.extendRight
            );
            angledX1 = angled.sX;
            angledY1 = angled.sY;
            angledX2 = angled.eX;
            angledY2 = angled.eY;
            if (this.style.extendLeft) {
                horizX1 = plotBounds.left;
                fillX1 = plotBounds.left;
            }
            if (this.style.extendRight) {
                horizX2 = plotBounds.right;
                fillX2 = plotBounds.right;
            }
        }

        // Line 1: Angled line (extended if needed) with invisible hit area
        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', angledX1)
            .attr('y1', angledY1)
            .attr('x2', angledX2)
            .attr('y2', angledY2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 20)
            .style('cursor', 'move')
            .style('pointer-events', 'stroke');
        
        this.group.append('line')
            .attr('x1', angledX1)
            .attr('y1', angledY1)
            .attr('x2', angledX2)
            .attr('y2', angledY2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray)
            .style('cursor', 'move')
            .style('pointer-events', 'none');

        // Line 2: Horizontal line at y3 (extended if needed) with invisible hit area
        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', horizX1)
            .attr('y1', y3)
            .attr('x2', horizX2)
            .attr('y2', y3)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 20)
            .style('cursor', 'move')
            .style('pointer-events', 'stroke');
        
        this.group.append('line')
            .attr('x1', horizX1)
            .attr('y1', y3)
            .attr('x2', horizX2)
            .attr('y2', y3)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray)
            .style('cursor', 'move')
            .style('pointer-events', 'none');

        // Fill between the lines (extended if needed)
        const flatFill = typeof shapeBackgroundFill === 'function'
            ? shapeBackgroundFill(this.style, DRAWING_TOOL_DEFAULT_FILL)
            : (this.style.showBackground !== false && this.style.fill && this.style.fill !== 'none'
                ? this.style.fill
                : 'none');
        if (flatFill && flatFill !== 'none') {
            this.group.append('polygon')
                .attr('points', `${fillX1},${angledY1} ${fillX2},${angledY2} ${fillX2},${y3} ${fillX1},${y3}`)
                .attr('fill', flatFill)
                .attr('stroke', 'none')
                .attr('class', 'shape-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        if (this.text && this.text.trim()) {
            this.renderTextLabel(scales);
        }
        
        // Always update virtual points before creating handles
        if (this.points.length === 3) {
            // For flat top/bottom, we need 4 handles at the corners:
            // - Point 0: bottom-left of diagonal line
            // - Point 1: top-right of diagonal line
            // - Point 2: bottom-left of horizontal line (for vertical adjustment)
            // - Point 3: bottom-right of horizontal line (virtual, for corner control)
            const p1 = this.points[0];
            const p2 = this.points[1];
            const p3 = this.points[2];
            
            this.virtualPoints = [
                this.points[0],              // p1 - top-left (diagonal start)
                this.points[1],              // p2 - top-right (diagonal end)
                { x: p1.x, y: p3.y },       // p3 - bottom-left (horizontal line left)
                { x: p2.x, y: p3.y }        // p4 - bottom-right (horizontal line right, virtual)
            ];
        } else {
            // Clear virtual points if we don't have 3 points
            this.virtualPoints = null;
        }
        this.renderHandlePriceLabels(scales);
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
    }

    /**
     * Price labels next to each anchor (TradingView-style), toggled via style.showHandlePrices.
     * Uses exterior-angle bisectors at corners, then enforces clearance from all four edges
     * (diagonal, bottom, left/right verticals) so text does not overlap strokes.
     */
    renderHandlePriceLabels(scales) {
        if (this.style.showHandlePrices === false) return;
        if (!this.virtualPoints || this.virtualPoints.length !== 4 || !this.group) return;

        let priceDecimals = 5;
        const ch = this.chart;
        if (ch) {
            const _precisionSetting = ch.chartSettings && ch.chartSettings.precision;
            if (_precisionSetting && _precisionSetting !== 'Default') {
                priceDecimals = Math.max(0, Math.min(8, parseInt(_precisionSetting, 10) || 5));
            } else if (typeof ch.getPriceDecimals === 'function' && scales && scales.yScale) {
                const _d = scales.yScale.domain();
                const _range = Math.abs((Array.isArray(_d) && _d.length === 2) ? (_d[1] - _d[0]) : 0);
                priceDecimals = ch.getPriceDecimals(_range);
            } else {
                priceDecimals = ch.priceDecimals || 5;
            }
        }

        const toSX = (p) => (scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x));
        const toSY = (p) => scales.yScale(p.y);

        const screen = this.virtualPoints.map((p) => ({ sx: toSX(p), sy: toSY(p) }));
        const centX = screen.reduce((s, c) => s + c.sx, 0) / 4;
        const centY = screen.reduce((s, c) => s + c.sy, 0) / 4;

        const outwardNormalEdge = (ax, ay, bx, by) => {
            const ex = bx - ax, ey = by - ay;
            const elen = Math.hypot(ex, ey) || 1;
            let nx = -ey / elen, ny = ex / elen;
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            if (nx * (centX - mx) + ny * (centY - my) > 0) {
                nx = -nx; ny = -ny;
            }
            return { nx, ny };
        };

        // CCW boundary order: TL(0) -> TR(1) -> BR(3) -> BL(2)
        const boundaryOrder = [0, 1, 3, 2];
        const cornerBisector = (i) => {
            const k = boundaryOrder.indexOf(i);
            const iPrev = boundaryOrder[(k + 3) % 4];
            const iNext = boundaryOrder[(k + 1) % 4];
            const A = screen[iPrev], P = screen[i], B = screen[iNext];
            const n1 = outwardNormalEdge(A.sx, A.sy, P.sx, P.sy);
            const n2 = outwardNormalEdge(P.sx, P.sy, B.sx, B.sy);
            let bx = n1.nx + n2.nx, by = n1.ny + n2.ny;
            const bl = Math.hypot(bx, by);
            if (bl > 1e-6) {
                bx /= bl; by /= bl;
            } else {
                bx = n1.nx; by = n1.ny;
            }
            return { bx, by };
        };

        const minClear = 16;
        const baseDist = 22;

        const pushClearOfSegment = (px, py, ax, ay, bx, by) => {
            const abx = bx - ax, aby = by - ay;
            const abLen = Math.hypot(abx, aby);
            if (abLen < 1e-12) return { x: px, y: py };
            const ux = abx / abLen, uy = aby / abLen;
            let t = ((px - ax) * ux + (py - ay) * uy);
            t = Math.max(0, Math.min(abLen, t));
            const qx = ax + ux * t, qy = ay + uy * t;
            const dx = px - qx, dy = py - qy;
            const d = Math.hypot(dx, dy);
            if (d >= minClear) return { x: px, y: py };
            let nx, ny;
            if (d > 0.5) {
                nx = dx / d; ny = dy / d;
            } else {
                nx = -uy; ny = ux;
                const mx = (ax + bx) / 2, my = (ay + by) / 2;
                if (nx * (centX - mx) + ny * (centY - my) > 0) {
                    nx = -nx; ny = -ny;
                }
            }
            const target = minClear + 4;
            return { x: qx + nx * target, y: qy + ny * target };
        };

        const s = screen;
        const obstacleSegs = [
            [s[0].sx, s[0].sy, s[1].sx, s[1].sy],
            [s[2].sx, s[2].sy, s[3].sx, s[3].sy],
            [s[0].sx, s[0].sy, s[2].sx, s[2].sy],
            [s[1].sx, s[1].sy, s[3].sx, s[3].sy]
        ];

        const fill = this.style.handlePriceColor || this.style.stroke || '#ff9800';
        const fontSize = 11;

        this.virtualPoints.forEach((point, index) => {
            const price = point.y;
            if (price === undefined || price === null || !Number.isFinite(Number(price))) return;

            const cx = screen[index].sx;
            const cy = screen[index].sy;
            const label = Number(price).toFixed(priceDecimals);

            const { bx, by } = cornerBisector(index);
            let ox = cx + bx * baseDist;
            let oy = cy + by * baseDist;

            for (let pass = 0; pass < 3; pass++) {
                for (let si = 0; si < obstacleSegs.length; si++) {
                    const seg = obstacleSegs[si];
                    const r = pushClearOfSegment(ox, oy, seg[0], seg[1], seg[2], seg[3]);
                    ox = r.x; oy = r.y;
                }
            }

            this.group.append('text')
                .attr('class', 'flat-top-bottom-handle-price')
                .attr('x', ox)
                .attr('y', oy)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', fill)
                .attr('font-size', fontSize)
                .attr('font-weight', '500')
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(label);
        });
    }

    renderTextLabel(scales) {
        const label = this.text || '';
        if (!label.trim()) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points.length >= 3 ? this.points[2] : null;

        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        // H-align: 5%/50%/95% along the top segment
        const ch_p1IsLeft = x1 <= x2;
        const ch_t = textHAlign === 'left' ? (ch_p1IsLeft ? 0.05 : 0.95)
                   : textHAlign === 'right' ? (ch_p1IsLeft ? 0.95 : 0.05)
                   : 0.5;
        const baseX = x1 + dx * ch_t;
        const baseY = y1 + dy * ch_t;

        // Perpendicular offset away from the filled area
        let nx = -uy;
        let ny = ux;
        let bottomX = null;
        let bottomY = null;
        if (p3) {
            const y3_click = scales.yScale(p3.y);
            const verticalOffset = y3_click - y1;
            const x3 = x1;
            const y3 = y1 + verticalOffset;
            const x4 = x2;
            const y4 = y3 - dy;

            const bx = x3 + (x4 - x3) * t;
            const by = y3 + (y4 - y3) * t;
            bottomX = bx;
            bottomY = by;
            const interiorVX = bx - baseX;
            const interiorVY = by - baseY;
            const dot = nx * interiorVX + ny * interiorVY;
            if (dot > 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        const baseOffset = textVAlign === 'top' ? 12 : (textVAlign === 'bottom' ? -12 : 0);
        const shapeCenterX = (textVAlign === 'middle' && bottomX !== null) ? ((baseX + bottomX) / 2) : baseX;
        const shapeCenterY = (textVAlign === 'middle' && bottomY !== null) ? ((baseY + bottomY) / 2) : baseY;
        const labelX = shapeCenterX + nx * baseOffset + (this.style.textOffsetX || 0);
        const labelY = shapeCenterY + ny * baseOffset + (this.style.textOffsetY || 0);
        const rotation = Math.atan2(dy, dx) * 180 / Math.PI;

        const anchor = 'middle';

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: labelX,
                y: labelY,
                anchor,
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal',
                yAnchor: 'middle',
                rotation
            });
        }
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            visible: this.visible,
            text: this.text || '',
            meta: this.meta
        };
    }

    static fromJSON(data, chart) {
        const tool = new FlatTopBottomTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Disjoint Channel Tool
// ============================================================================
class DisjointChannelTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('disjoint-channel', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#00bcd4';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(0, 188, 212, 0.1)';
        this.style.strokeDasharray = style.strokeDasharray || '0';
        this.style.extendLeft = style.extendLeft || false;
        this.style.extendRight = style.extendRight || false;
        if (this.style.showHandlePrices === undefined) this.style.showHandlePrices = true;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        if (!this.style.textColor) this.style.textColor = this.style.stroke;
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.fontFamily) this.style.fontFamily = 'Roboto, sans-serif';
        if (!this.style.fontWeight) this.style.fontWeight = 'normal';
        if (!this.style.fontStyle) this.style.fontStyle = 'normal';
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex, scales } = context;
        
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        if (!dataPoint || isNaN(index) || index < 0) {
            return false;
        }
        
        // Points 0 and 1 move freely, but we need to update point 2's X when point 0 moves
        if (index === 0 || index === 1) {
            const oldP0X = this.points[0].x;
            this.points[index] = { x: dataPoint.x, y: dataPoint.y };
            
            // If point 0 moved and we have a third point, update point 2's X to stay aligned
            if (index === 0 && this.points.length >= 3) {
                this.points[2] = {
                    x: dataPoint.x,  // Keep same X as new point 0 position
                    y: this.points[2].y
                };
            }
            
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        // Point 2 (third point) - constrain to same X as point 0
        if (index === 2 && this.points.length >= 3) {
            const p0 = this.points[0];
            this.points[2] = {
                x: p0.x,  // Keep same X as first point
                y: dataPoint.y  // Allow Y to move freely
            };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        // Point 3 (4th virtual handle) - constrain to same X as point 1
        if (index === 3 && this.points.length >= 3) {
            const p1 = this.points[1];
            const p0 = this.points[0];
            const p2 = this.points[2];
            
            // Calculate the new vertical offset based on where point 4 is dragged
            // Point 4 should stay at same X as point 1, but Y can move
            const newP4Y = dataPoint.y;
            
            // Calculate what point 3's Y should be to maintain the mirror
            const dy = p1.y - p0.y;
            const newP3Y = newP4Y + dy;
            
            // Update point 2 (which is point 3 in 0-indexed)
            this.points[2] = {
                x: p0.x,
                y: newP3Y
            };
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        return false;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this._prepareRenderGroup(container, 'drawing disjoint-channel', renderOpts);
        this._clearDrawingLabels(scales);
        this.group.style('pointer-events', 'none').style('cursor', 'default');

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = getX(p1);
        const y1 = getY(p1);
        const x2 = getX(p2);
        const y2 = getY(p2);

        // If only 2 points, just draw the first line
        if (this.points.length === 2) {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray)
                .style('cursor', 'move');
            return;
        }

        // Calculate second line based on third point (symmetric mirrored angle)
        const p3 = this.points[2];
        const x3_click = getX(p3);
        const y3_click = getY(p3);
        
        // Calculate the angle and length of the first line
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        // Calculate vertical offset from third click
        // The third click determines how far above/below to mirror
        const verticalOffset = y3_click - y1;
        
        // Second line mirrors with opposite vertical angle
        // Point 3 is directly above/below point 1
        const x3 = x1;
        const y3 = y1 + verticalOffset;
        // Point 4 mirrors: same horizontal distance, opposite vertical direction
        const x4 = x2;
        const y4 = y3 - dy;  // Opposite vertical direction from point 3

        let startX1 = x1, startY1 = y1, endX1 = x2, endY1 = y2;
        let startX2 = x3, startY2 = y3, endX2 = x4, endY2 = y4;

        if (this.style.extendLeft || this.style.extendRight) {
            const plotBounds = channelPlotHorizontalBounds(scales);

            const line1 = extendLineSegmentToPlotEdges(
                x1, y1, x2, y2, plotBounds, !!this.style.extendLeft, !!this.style.extendRight
            );
            startX1 = line1.sX;
            startY1 = line1.sY;
            endX1 = line1.eX;
            endY1 = line1.eY;

            const line2 = extendLineSegmentToPlotEdges(
                x3, y3, x4, y4, plotBounds, !!this.style.extendLeft, !!this.style.extendRight
            );
            startX2 = line2.sX;
            startY2 = line2.sY;
            endX2 = line2.eX;
            endY2 = line2.eY;
        }

        // First line with invisible hit area
        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', startX1)
            .attr('y1', startY1)
            .attr('x2', endX1)
            .attr('y2', endY1)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('cursor', 'move')
            .style('pointer-events', 'stroke');

        this.group.append('line')
            .attr('x1', startX1)
            .attr('y1', startY1)
            .attr('x2', endX1)
            .attr('y2', endY1)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray)
            .style('cursor', 'move')
            .style('pointer-events', 'none');

        // Second line with invisible hit area
        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', startX2)
            .attr('y1', startY2)
            .attr('x2', endX2)
            .attr('y2', endY2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('cursor', 'move')
            .style('pointer-events', 'stroke');

        this.group.append('line')
            .attr('x1', startX2)
            .attr('y1', startY2)
            .attr('x2', endX2)
            .attr('y2', endY2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'none')
            .attr('stroke-dasharray', this.style.strokeDasharray);

        const disjointFill = typeof shapeBackgroundFill === 'function'
            ? shapeBackgroundFill(this.style, DRAWING_TOOL_DEFAULT_FILL)
            : (this.style.showBackground !== false && this.style.fill && this.style.fill !== 'none'
                ? this.style.fill
                : 'none');
        if (disjointFill && disjointFill !== 'none') {
            this.group.append('polygon')
                .attr('points', `${startX1},${startY1} ${endX1},${endY1} ${endX2},${endY2} ${startX2},${startY2}`)
                .attr('fill', disjointFill)
                .attr('stroke', 'none')
                .attr('class', 'shape-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        // Create handles if selected - add 4th virtual handle at end of second line
        if (this.points.length === 3) {
            // Use the same calculation as the render logic for consistency
            const p1 = this.points[0];
            const p2 = this.points[1];
            const p3 = this.points[2];
            
            // Calculate using same logic as render
            const dx_data = p2.x - p1.x;
            const dy_data = p2.y - p1.y;
            
            // Point 4: same X as point 2, Y calculated from point 3 with opposite dy
            const p4 = {
                x: p2.x,
                y: p3.y - dy_data
            };
            
            this.virtualPoints = [
                ...this.points,
                p4
            ];
        } else {
            this.virtualPoints = null;
        }
        this.renderHandlePriceLabels(scales);
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
    }

    renderTextLabel(scales) {
        const label = this.text || '';
        if (!label.trim()) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points.length >= 3 ? this.points[2] : null;

        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        // Along-line position (left/center/right)
        let t = 0.35;
        if (textHAlign === 'left') t = 0.2;
        if (textHAlign === 'center') t = 0.5;
        if (textHAlign === 'right') t = 0.8;

        // Compute the corresponding point on the bottom segment at the same t
        let bottomBaseX = null;
        let bottomBaseY = null;
        let x3 = null, y3 = null, x4 = null, y4 = null;
        if (p3) {
            const y3_click = scales.yScale(p3.y);
            const verticalOffset = y3_click - y1;
            x3 = x1;
            y3 = y1 + verticalOffset;
            x4 = x2;
            y4 = y3 - dy;

            bottomBaseX = x3 + (x4 - x3) * t;
            bottomBaseY = y3 + (y4 - y3) * t;
        }

        // Select which segment to attach to (top/bottom), or center-in-shape for middle
        let segSX = x1, segSY = y1, segEX = x2, segEY = y2;
        if (textVAlign === 'bottom' && x3 !== null) {
            segSX = x3; segSY = y3; segEX = x4; segEY = y4;
        }

        const segDX = segEX - segSX;
        const segDY = segEY - segSY;
        const segLen = Math.hypot(segDX, segDY) || 1;
        const segUX = segDX / segLen;
        const segUY = segDY / segLen;

        const baseX = segSX + segDX * t;
        const baseY = segSY + segDY * t;

        // Perpendicular offset away from the filled area
        let nx = -segUY;
        let ny = segUX;

        if (p3 && bottomBaseX !== null) {
            // Interior direction should point toward the other segment
            const otherX = textVAlign === 'bottom' ? (x1 + dx * t) : bottomBaseX;
            const otherY = textVAlign === 'bottom' ? (y1 + dy * t) : bottomBaseY;
            const interiorVX = otherX - baseX;
            const interiorVY = otherY - baseY;
            const dot = nx * interiorVX + ny * interiorVY;
            if (dot > 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        const anchor = 'middle';

        // Placement + rotation rules:
        // - top/bottom: rotated along the selected segment
        // - middle: centered in the shape with no rotation
        let labelX = baseX;
        let labelY = baseY;
        let rotation = Math.atan2(segDY, segDX) * 180 / Math.PI;

        const isMiddle = textVAlign === 'middle' || textVAlign === 'center';

        if (isMiddle && bottomBaseX !== null) {
            labelX = (x1 + dx * t + bottomBaseX) / 2;
            labelY = (y1 + dy * t + bottomBaseY) / 2;
            rotation = 0;
        } else {
            const offset = 12;
            labelX = baseX + nx * offset;
            labelY = baseY + ny * offset;
        }

        labelX += (this.style.textOffsetX || 0);
        labelY += (this.style.textOffsetY || 0);

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: labelX,
                y: labelY,
                anchor,
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal',
                yAnchor: 'middle',
                rotation
            });
        }
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            visible: this.visible,
            text: this.text || '',
            meta: this.meta
        };
    }

    static fromJSON(data, chart) {
        const tool = new DisjointChannelTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        tool.chart = chart;
        return tool;
    }
}

// Same quad-corner price labels as Flat Top/Bottom (TL/TR/BR/BL virtual points).
DisjointChannelTool.prototype.renderHandlePriceLabels = FlatTopBottomTool.prototype.renderHandlePriceLabels;

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ParallelChannelTool,
        RegressionTrendTool,
        FlatTopBottomTool,
        DisjointChannelTool
    };
}
