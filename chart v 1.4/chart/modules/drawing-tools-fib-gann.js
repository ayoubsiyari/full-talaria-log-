/**
 * Drawing Tools - Fibonacci & Gann Tools
 * Advanced Fibonacci and Gann analysis tools
 */

// ============================================================================
// Fib Channel Tool
// ============================================================================
class FibChannelTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-channel', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 2;
        if (this.style.reverse === undefined) this.style.reverse = false;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        if (this.style.backgroundOpacity === undefined || this.style.backgroundOpacity === null || isNaN(parseFloat(this.style.backgroundOpacity))) this.style.backgroundOpacity = 0.08;
        // Core 7 Fibonacci levels (0 and 1 fixed at top)
        const defaultLevels = [
            { value: 0, label: '0', color: '#787b86', enabled: true },
            { value: 1, label: '1', color: '#787b86', enabled: true },
            { value: 0.236, label: '0.236', color: '#f23645', enabled: true },
            { value: 0.382, label: '0.382', color: '#ff9800', enabled: true },
            { value: 0.5, label: '0.5', color: '#ffeb3b', enabled: true },
            { value: 0.618, label: '0.618', color: '#4caf50', enabled: true },
            { value: 0.786, label: '0.786', color: '#2196f3', enabled: true }
        ];
        this.levels = (Array.isArray(style.levels) && style.levels.length)
            ? style.levels
            : defaultLevels;
    }

    patchPanZoomGeometry(scales) {
        return BaseDrawing.patchFibChannel(this, scales);
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-channel', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const scaledMedianWidth = Math.max(0.5, (this.style.strokeWidth || 2) * scaleFactor);

        const { anyExtend } = BaseDrawing.resolveFibExtendFlags(this.style);
        const zonesEnabled = !!this.style.showZones;
        const reverse = !!this.style.reverse;
        const showLevelValues = this.style.levelsEnabled !== false;
        const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));
        const xRange = scales.xScale.range();

        const priceDecimals = (typeof this.getPriceDecimals === 'function') ? this.getPriceDecimals(this.points[0]?.y) : 2;

        // Preview (2 points): draw the base line
        if (this.points.length === 2) {
            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', Math.max(0.5, (this.style.strokeWidth || 2) * scaleFactor))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        // Full drawing (3 points): draw channel lines as parallels to the base line
        if (this.points.length >= 3) {
            const geom = BaseDrawing.computeFibChannelGeometry(this, scales);
            if (!geom) {
                if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
                return this.group;
            }

            const { reverse, getSegment, offsetPoint, p1, p2, p3, toPx, nx, ny, channelOffset } = geom;
            const x1 = toPx(p1).x;
            const y1 = toPx(p1).y;
            const x3 = toPx(p3).x;
            const y3 = toPx(p3).y;

            // If the 3rd point is outside the rendered segment span (when not extending lines),
            // clamp handle position to the rendered level=1 segment using virtualPoints.
            if (!anyExtend && scales) {
                const chart = scales.chart;
                const xScale = scales.xScale;
                const yScale = scales.yScale;
                const toDataX = (px) => (chart && typeof chart.pixelToDataIndex === 'function')
                    ? chart.pixelToDataIndex(px)
                    : (xScale && typeof xScale.invert === 'function' ? xScale.invert(px) : this.points[2].x);
                const toDataY = (py) => (yScale && typeof yScale.invert === 'function')
                    ? yScale.invert(py)
                    : this.points[2].y;

                const p1Px = toPx(p1);
                const p2Px = toPx(p2);
                const dx = p2Px.x - p1Px.x;
                const dy = p2Px.y - p1Px.y;
                const len = Math.hypot(dx, dy);
                if (len) {
                    const ux = dx / len;
                    const uy = dy / len;
                    const proj = (x3 - p1Px.x) * ux + (y3 - p1Px.y) * uy;
                    const t = proj / len;
                    const tClamped = Math.max(0, Math.min(1, t));
                    const hx = p1Px.x + dx * tClamped + (toPx(offsetPoint(p1, 1)).x - p1Px.x);
                    const hy = p1Px.y + dy * tClamped + (toPx(offsetPoint(p1, 1)).y - p1Px.y);
                    this.virtualPoints = [
                        this.points[0],
                        this.points[1],
                        { x: toDataX(hx), y: toDataY(hy) }
                    ];
                }
            } else {
                this.virtualPoints = null;
            }

            if (zonesEnabled) {
                const zoneLevels = this.levels
                    .map(l => {
                        const rawValue = typeof l === 'object' ? l.value : l;
                        const enabled = typeof l === 'object' ? l.enabled !== false : true;
                        const color = typeof l === 'object' ? (l.color || this.style.stroke) : this.style.stroke;
                        const value = parseFloat(rawValue);
                        const actual = reverse ? (1 - value) : value;
                        return { value, actual, enabled, color };
                    })
                    .filter(l => l.enabled && l.value != null && isFinite(l.value) && isFinite(l.actual))
                    .sort((a, b) => a.actual - b.actual);

                for (let i = 0; i < zoneLevels.length - 1; i++) {
                    const aV1 = zoneLevels[i].actual;
                    const aV2 = zoneLevels[i + 1].actual;
                    const a1 = getSegment(offsetPoint(p1, aV1), offsetPoint(p2, aV1));
                    const a2 = getSegment(offsetPoint(p1, aV2), offsetPoint(p2, aV2));
                    if (!a1 || !a2) continue;
                    this.group.insert('path', ':first-child')
                        .attr('data-fib-zone-idx', i)
                        .attr('d', `M ${a1.x1},${a1.y1} L ${a1.x2},${a1.y2} L ${a2.x2},${a2.y2} L ${a2.x1},${a2.y1} Z`)
                        .attr('fill', zoneLevels[i].color)
                        .attr('opacity', zoneOpacity)
                        .style('pointer-events', 'none');
                }
            }

            this.levels.forEach((levelObj, idx) => {
                const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
                const enabled = typeof levelObj === 'object'
                    ? (levelObj.enabled !== false && levelObj.visible !== false)
                    : true;
                const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
                const baseWidth = (typeof levelObj === 'object' && levelObj.lineWidth)
                    ? levelObj.lineWidth
                    : (level === 0 || level === 1 ? 2 : 1);
                const baseType = (typeof levelObj === 'object' && levelObj.lineType) ? levelObj.lineType : '';
                const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
                const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

                if (!enabled) return;
                if (level == null || isNaN(parseFloat(level))) return;

                const lvl = parseFloat(level);
                const actualLevel = reverse ? (1 - lvl) : lvl;
                const seg = getSegment(offsetPoint(p1, actualLevel), offsetPoint(p2, actualLevel));
                if (!seg) return;

                const scaledLevelWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
                const levelHitWidth = Math.max(10, scaledLevelWidth * 6);

                this.group.append('line')
                    .attr('class', 'fib-level-hit')
                    .attr('data-fib-channel-idx', idx)
                    .attr('data-fib-channel-level', lvl)
                    .attr('x1', seg.x1)
                    .attr('y1', seg.y1)
                    .attr('x2', seg.x2)
                    .attr('y2', seg.y2)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', levelHitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('line')
                    .attr('data-fib-channel-idx', idx)
                    .attr('data-fib-channel-level', lvl)
                    .attr('x1', seg.x1)
                    .attr('y1', seg.y1)
                    .attr('x2', seg.x2)
                    .attr('y2', seg.y2)
                    .attr('stroke', color)
                    .attr('stroke-width', scaledLevelWidth)
                    .attr('opacity', 0.8)
                    .attr('stroke-dasharray', lineType || 'none')
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                const baseLabel = BaseDrawing.formatFibLevelLabel(this.style, lvl, {
                    price: scales.yScale && typeof scales.yScale.invert === 'function' ? scales.yScale.invert(seg.y2) : null,
                    priceDecimals,
                });
                if (!showLevelValues) return;
                const labelText = baseLabel;
                const lp = fibHorizontalSpanLabelPlacement(this.style, seg.x1, seg.x2);

                this.group.append('text')
                    .attr('data-fib-channel-label-idx', idx)
                    .attr('data-fib-channel-label', lvl)
                    .attr('x', lp.x)
                    .attr('y', seg.y2 + 4)
                    .attr('text-anchor', lp.anchor)
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .style('pointer-events', 'none')
                    .text(labelText);
            });
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        const midHandleGroup = this.group.selectAll('.resize-handle-group')
            .filter(function() { return d3.select(this).attr('data-point-index') === '3'; });
        midHandleGroup.attr('data-handle-role', '3');
        midHandleGroup.selectAll('[data-point-index="3"]').attr('data-handle-role', '3');

        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibChannelTool(data.points, data.style);
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
// Fib Time Zone Tool
// ============================================================================
class FibTimeZoneTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-timezone', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        if (this.style.showZones === undefined) this.style.showZones = false;
        if (this.style.backgroundOpacity === undefined || this.style.backgroundOpacity === null || isNaN(parseFloat(this.style.backgroundOpacity))) {
            this.style.backgroundOpacity = 0.12;
        }
        const defaultLevels = [
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
        ];

        // Use the same storage model as other fib tools: `levels`.
        // Backward compatibility: accept legacy `fibNumbers` (and mirror it).
        const providedLevels = (Array.isArray(style.levels) && style.levels.length)
            ? style.levels
            : ((Array.isArray(style.fibNumbers) && style.fibNumbers.length) ? style.fibNumbers : defaultLevels);

        this.levels = providedLevels.map(l => ({
            value: typeof l.value === 'number' ? l.value : parseFloat(l.value) || 0,
            enabled: l.enabled !== false,
            color: l.color || '#787b86',
            lineType: l.lineType != null ? `${l.lineType}` : (this.style.levelsLineDasharray != null ? `${this.style.levelsLineDasharray}` : ''),
            lineWidth: (l.lineWidth != null && !isNaN(parseInt(l.lineWidth)))
                ? parseInt(l.lineWidth)
                : ((this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : this.style.strokeWidth)
        }));

        this.fibNumbers = this.levels;
        this.style.levels = this.levels;
        this.style.fibNumbers = this.levels;
    }

    patchPanZoomGeometry(scales) {
        return BaseDrawing.patchFibTimeZone(this, scales);
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        if (Array.isArray(this.style.levels) && this.style.levels.length) {
            this.levels = this.style.levels;
        } else if (Array.isArray(this.style.fibNumbers) && this.style.fibNumbers.length) {
            this.levels = this.style.fibNumbers;
        }

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-timezone', renderOpts);
        this._clearDrawingLabels(scales);

        const getXFromIndex = (xIdx) => scales.chart?.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(xIdx) : scales.xScale(xIdx);
        const getY = (p) => scales.yScale(p.y);
        const { plotTop, plotBottom } = fibChartPlotVerticalSpan(scales);
        const chartWidth = scales.chart?.w || 2000;

        const showLevelValues = this.style.levelsEnabled !== false;

        const xIndex1 = this.points[0].x;
        const xIndex2 = this.points[1].x;
        const baseDx = xIndex2 - xIndex1;
        if (!baseDx) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }
        const x1 = getXFromIndex(xIndex1);
        const y1 = getY(this.points[0]);
        const x2 = getXFromIndex(xIndex2);
        const y2 = getY(this.points[1]);

        // Trend / anchor line between the two anchor points (Style → Trend line)
        const trendEnabled = this.style.trendLineEnabled !== false;
        const trendColor = this.style.trendLineColor || this.style.stroke || '#787b86';
        const trendDash = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '6,6';
        const baseTrendWidth = (this.style.trendLineWidth != null && !isNaN(parseInt(this.style.trendLineWidth)))
            ? parseInt(this.style.trendLineWidth)
            : ((this.style.strokeWidth != null && !isNaN(parseInt(this.style.strokeWidth))) ? parseInt(this.style.strokeWidth) : 1);
        const scaledTrendWidth = Math.max(0.5, baseTrendWidth * scaleFactor);

        if (trendEnabled) {
            this.group.append('line')
                .attr('class', 'fib-tz-anchor fib-trend-line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', trendColor)
                .attr('stroke-width', scaledTrendWidth)
                .attr('stroke-dasharray', trendDash)
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        const showZones = this.style.showZones !== false;
        const bgOpacity = (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
            ? Math.max(0, Math.min(1, parseFloat(this.style.backgroundOpacity)))
            : 0.12;
        const enabledLevels = (this.levels || [])
            .filter(l => l && (typeof l === 'object' ? l.enabled !== false : true))
            .map(l => ({
                value: typeof l === 'object' ? parseFloat(l.value) : parseFloat(l),
                color: typeof l === 'object' ? (l.color || this.style.stroke) : this.style.stroke,
            }))
            .filter(l => Number.isFinite(l.value))
            .sort((a, b) => a.value - b.value);

        if (showZones && enabledLevels.length >= 2) {
            for (let i = 0; i < enabledLevels.length - 1; i++) {
                const xa = getXFromIndex(xIndex1 + (baseDx * enabledLevels[i].value));
                const xb = getXFromIndex(xIndex1 + (baseDx * enabledLevels[i + 1].value));
                const xLeft = Math.min(xa, xb);
                const width = Math.abs(xb - xa);
                if (!Number.isFinite(xLeft) || !Number.isFinite(width) || width <= 0) continue;
                this.group.insert('rect', ':first-child')
                    .attr('x', xLeft)
                    .attr('y', plotTop)
                    .attr('width', width)
                    .attr('height', Math.max(1, plotBottom - plotTop))
                    .attr('fill', enabledLevels[i].color)
                    .attr('opacity', bgOpacity)
                    .style('pointer-events', 'none');
            }
        }

        // Draw vertical lines at Fibonacci intervals
        const tzLabelSlots = [];
        (this.levels || []).forEach((fibObj) => {
            const fib = typeof fibObj === 'object' ? fibObj.value : fibObj;
            const enabled = typeof fibObj === 'object' ? fibObj.enabled !== false : true;
            const color = typeof fibObj === 'object' ? fibObj.color : this.style.stroke;
            const baseWidth = (typeof fibObj === 'object' && fibObj.lineWidth != null && !isNaN(parseInt(fibObj.lineWidth))) ? parseInt(fibObj.lineWidth) : this.style.strokeWidth;
            const baseType = (typeof fibObj === 'object' && fibObj.lineType != null) ? `${fibObj.lineType}` : '';
            const perWidth = (typeof fibObj === 'object' && fibObj.lineWidth != null && !isNaN(parseInt(fibObj.lineWidth)))
                ? parseInt(fibObj.lineWidth) : null;
            const perType = (typeof fibObj === 'object' && fibObj.lineType != null) ? `${fibObj.lineType}` : null;
            const lineWidth = perWidth !== null
                ? perWidth
                : (globalLevelsWidth !== null ? globalLevelsWidth : baseWidth);
            const lineType = perType !== null
                ? perType
                : (globalLevelsDash !== null ? globalLevelsDash : baseType);

            if (!enabled) return;

            const fibN = parseFloat(fib);
            if (!isFinite(fibN)) return;

            const xIndex = xIndex1 + (baseDx * fibN);
            const x = getXFromIndex(xIndex);
            if (x > 0 && x < chartWidth) {
                const scaledWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
                const hitWidth = Math.max(10, scaledWidth * 6);

                this.group.append('line')
                    .attr('class', 'fib-level-hit fib-tz-vertical')
                    .attr('data-fib-tz', fib)
                    .attr('x1', x).attr('y1', plotTop)
                    .attr('x2', x).attr('y2', plotBottom)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                let labelText = null;
                let lp = null;
                let vGap = null;
                const tzLabelFontSize = fibVerticalSpanLabelFontSize(scaleFactor);
                if (showLevelValues) {
                    labelText = BaseDrawing.formatFibLevelLabel(this.style, fibN);
                    lp = fibVerticalSpanLabelPlacement(this.style, x, plotTop, plotBottom, tzLabelFontSize);
                    vGap = fibVerticalCenterLabelGap(this.style, this.group, labelText, lp.y, tzLabelFontSize, '700');
                }

                appendFibVerticalLineWithCenterGap(this.group, x, plotTop, plotBottom, vGap, {
                    class: 'fib-tz-vertical',
                    'data-fib-tz': fib,
                    stroke: color,
                    'stroke-width': scaledWidth,
                    'stroke-dasharray': lineType || 'none',
                    opacity: 0.8,
                });
                this.group.selectAll('line.fib-tz-vertical').filter(function() {
                    return d3.select(this).attr('stroke') !== 'rgba(255,255,255,0.001)';
                }).style('cursor', 'move');

                if (showLevelValues) {
                    tzLabelSlots.push({
                        x: lp.x,
                        y: lp.y,
                        anchor: lp.anchor,
                        dominantBaseline: lp.dominantBaseline,
                        text: labelText,
                        color,
                        fontSize: tzLabelFontSize,
                        fib,
                    });
                }
            }
        });

        if (showLevelValues && tzLabelSlots.length) {
            resolveFibVerticalLineLabelCollisions(tzLabelSlots, this.group, tzLabelSlots[0].fontSize, '700').forEach((slot) => {
                const textEl = this.group.append('text')
                    .attr('class', 'fib-tz-label')
                    .attr('data-fib-tz', slot.fib)
                    .attr('x', slot.x)
                    .attr('y', slot.y)
                    .attr('text-anchor', slot.anchor)
                    .text(slot.text);
                if (slot.dominantBaseline) textEl.attr('dominant-baseline', slot.dominantBaseline);
                applyFibSpanLabelTextStyle(textEl, slot.color, slot.fontSize);
            });
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibTimeZoneTool(data.points, data.style);
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
// Fib Speed Resistance Fan Tool
// ============================================================================
class FibSpeedFanTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-speed-fan', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.backgroundEnabled === undefined) this.style.backgroundEnabled = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.gridEnabled === undefined) this.style.gridEnabled = true;
        if (this.style.gridColor === undefined) this.style.gridColor = '#787b86';
        if (this.style.gridOpacity === undefined) this.style.gridOpacity = 0.35;
        if (this.style.gridLineWidth === undefined) this.style.gridLineWidth = 1;
        if (this.style.gridLineDasharray === undefined) this.style.gridLineDasharray = '';
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = false;
        if (this.style.showLeftLabels === undefined) this.style.showLeftLabels = true;
        if (this.style.showRightLabels === undefined) this.style.showRightLabels = true;
        if (this.style.showTopLabels === undefined) this.style.showTopLabels = true;
        if (this.style.showBottomLabels === undefined) this.style.showBottomLabels = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        this.levels = style.levels || [
            { value: 1, enabled: true, color: '#2962ff' },
            { value: 0.75, enabled: true, color: '#00bcd4' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.25, enabled: true, color: '#f23645' },
            { value: 0, enabled: true, color: '#787b86' }
        ];
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-speed-fan', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const isReverse = !!this.style.reverse;
        const p1 = isReverse ? this.points[1] : this.points[0];
        const p2 = isReverse ? this.points[0] : this.points[1];

        const x1 = getX(p1);
        const y1 = getY(p1);
        const x2 = getX(p2);
        const y2 = getY(p2);

        const showLevelValues = this.style.levelsEnabled !== false;
        const formatRatioLabel = (v) => BaseDrawing.formatFibLevelLabel(this.style, v);
        const fanLabelFontSize = fibVerticalSpanLabelFontSize(scaleFactor);
        const labelPad = Math.max(6, Math.round(fanLabelFontSize * 0.5));

        const fanTrendEnabled = this.style.trendLineEnabled !== false;
        const fanTrendColor = this.style.trendLineColor || this.style.stroke || '#787b86';
        const fanTrendDash = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '6,6';
        const fanTrendBaseW = (this.style.trendLineWidth != null && !isNaN(parseInt(this.style.trendLineWidth)))
            ? parseInt(this.style.trendLineWidth)
            : ((this.style.strokeWidth != null && !isNaN(parseInt(this.style.strokeWidth))) ? parseInt(this.style.strokeWidth) : 1);
        const fanTrendW = Math.max(0.5, fanTrendBaseW * scaleFactor);
        if (fanTrendEnabled) {
            this.group.append('line')
                .attr('class', 'fib-trend-line fib-fan-anchor')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', fanTrendColor)
                .attr('stroke-width', fanTrendW)
                .attr('stroke-dasharray', fanTrendDash)
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        const dx = x2 - x1;
        const dy = y2 - y1;
        if (!dx) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const xLeft = Math.min(x1, x2);
        const xRight = Math.max(x1, x2);
        const yTop = Math.min(y1, y2);
        const yBottom = Math.max(y1, y2);
        const priceY = (r) => y1 + dy * (1 - r);
        const timeX = (t) => x1 + dx * (1 - t);

        const parseFanLevels = (rows) => (rows || [])
            .filter((l) => {
                if (!l) return false;
                if (typeof l === 'object') return l.enabled !== false && l.on !== false && l.visible !== false;
                return true;
            })
            .map((l) => ({
                value: parseFloat(typeof l === 'object' ? l.value : l),
                color: typeof l === 'object' ? (l.color || this.style.stroke) : this.style.stroke,
            }))
            .filter((l) => isFinite(l.value) && l.value >= 0 && l.value <= 1);

        const priceLevels = parseFanLevels(this.levels).sort((a, b) => b.value - a.value);
        const timeRaw = Array.isArray(this.style.v9FanTimeLevels) && this.style.v9FanTimeLevels.length
            ? this.style.v9FanTimeLevels
            : this.levels;
        const timeLevels = parseFanLevels(timeRaw).sort((a, b) => b.value - a.value);

        const bgEnabled = this.style.backgroundEnabled !== false;
        const bgOpacity = (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
            ? parseFloat(this.style.backgroundOpacity)
            : 0.12;

        if (bgEnabled && priceLevels.length > 1) {
            for (let i = 0; i < priceLevels.length - 1; i++) {
                const rHigh = priceLevels[i].value;
                const rLow = priceLevels[i + 1].value;
                const yHigh = priceY(rHigh);
                const yLow = priceY(rLow);
                this.group.insert('path', ':first-child')
                    .attr('d', `M ${x1},${y1} L ${x2},${yHigh} L ${x2},${yLow} Z`)
                    .attr('fill', priceLevels[i].color)
                    .attr('opacity', bgOpacity)
                    .style('pointer-events', 'none');
            }
        }

        if (this.style.gridEnabled !== false) {
            const gridColor = this.style.gridColor || '#787b86';
            const gridOpacity = (this.style.gridOpacity != null && !isNaN(parseFloat(this.style.gridOpacity)))
                ? parseFloat(this.style.gridOpacity)
                : 0.35;
            const gridBaseWidth = (this.style.gridLineWidth != null && !isNaN(parseInt(this.style.gridLineWidth)))
                ? parseInt(this.style.gridLineWidth)
                : 1;
            const gridWidth = Math.max(0.5, gridBaseWidth * scaleFactor);
            const gridDash = (this.style.gridLineDasharray != null && `${this.style.gridLineDasharray}` !== '' && `${this.style.gridLineDasharray}` !== 'none')
                ? `${this.style.gridLineDasharray}`
                : null;
            const gridAttrs = {
                stroke: gridColor,
                'stroke-width': gridWidth,
                'stroke-dasharray': gridDash || 'none',
                opacity: gridOpacity,
            };

            priceLevels.forEach((l) => {
                const y = priceY(l.value);
                const line = this.group.append('line')
                    .attr('x1', x1).attr('y1', y)
                    .attr('x2', x2).attr('y2', y);
                Object.keys(gridAttrs).forEach((k) => line.attr(k, gridAttrs[k]));
                line.style('pointer-events', 'none');
            });

            timeLevels.forEach((l) => {
                const x = timeX(l.value);
                const line = this.group.append('line')
                    .attr('x1', x).attr('y1', yTop)
                    .attr('x2', x).attr('y2', yBottom);
                Object.keys(gridAttrs).forEach((k) => line.attr(k, gridAttrs[k]));
                line.style('pointer-events', 'none');
            });

            const spine = this.group.append('line')
                .attr('x1', x1).attr('y1', yTop)
                .attr('x2', x1).attr('y2', yBottom);
            Object.keys(gridAttrs).forEach((k) => spine.attr(k, gridAttrs[k]));
            spine.style('pointer-events', 'none');
        }

        if (showLevelValues) {
            const priceLabelSlots = [];
            priceLevels.forEach((l) => {
                const y = priceY(l.value);
                const text = formatRatioLabel(l.value);
                priceLabelSlots.push({ x: xLeft - labelPad, y, anchor: 'end', dominantBaseline: 'middle', text, color: l.color });
                priceLabelSlots.push({ x: xRight + labelPad, y, anchor: 'start', dominantBaseline: 'middle', text, color: l.color });
            });

            const timeLabelSlots = [];
            timeLevels.forEach((l) => {
                const x = timeX(l.value);
                const text = formatRatioLabel(l.value);
                timeLabelSlots.push({ x, y: yTop - labelPad, anchor: 'middle', dominantBaseline: 'auto', text, color: l.color });
                timeLabelSlots.push({ x, y: yBottom + labelPad, anchor: 'middle', dominantBaseline: 'hanging', text, color: l.color });
            });

            const placeEdgeLabels = (slots, resolveCollisions) => {
                if (!slots.length) return;
                const resolved = resolveCollisions
                    ? resolveCollisions(slots, this.group, fanLabelFontSize)
                    : slots;
                resolved.forEach((slot) => {
                    const el = this.group.append('text')
                        .attr('x', slot.x)
                        .attr('y', slot.y)
                        .attr('text-anchor', slot.anchor)
                        .attr('dominant-baseline', slot.dominantBaseline || 'middle')
                        .text(slot.text);
                    applyFibSpanLabelTextStyle(el, slot.color, fanLabelFontSize);
                });
            };

            const resolveVerticalEdgeCollisions = (slots, group, fontSize) => {
                const leftSlots = slots.filter((s) => s.anchor === 'end');
                const rightSlots = slots.filter((s) => s.anchor === 'start');
                const out = [];
                [leftSlots, rightSlots].forEach((groupSlots) => {
                    if (!groupSlots.length) return;
                    out.push(...resolveFibArcLabelCollisions(groupSlots, group, fontSize));
                });
                return out;
            };

            const resolveHorizontalEdgeCollisions = (slots, group, fontSize) => {
                const topSlots = slots.filter((s) => s.dominantBaseline === 'auto');
                const bottomSlots = slots.filter((s) => s.dominantBaseline === 'hanging');
                const out = [];
                [topSlots, bottomSlots].forEach((groupSlots) => {
                    if (!groupSlots.length) return;
                    const measured = groupSlots.map((slot) => ({
                        ...slot,
                        block: measureFibLabelTextBlock(group, slot.text, fontSize),
                    }));
                    measured.sort((a, b) => a.x - b.x);
                    const gap = Math.max(2, fontSize * 0.25);
                    for (let i = 1; i < measured.length; i++) {
                        const prev = measured[i - 1];
                        const cur = measured[i];
                        const minGap = (prev.block.width + cur.block.width) / 2 + gap;
                        if (cur.x - prev.x < minGap) cur.x = prev.x + minGap;
                    }
                    out.push(...measured);
                });
                return out;
            };

            placeEdgeLabels(priceLabelSlots, resolveVerticalEdgeCollisions);
            placeEdgeLabels(timeLabelSlots, resolveHorizontalEdgeCollisions);
        }

        const drawFanRay = (endX, endY, color, lineWidth, lineType) => {
            const scaledLevelWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
            const hitWidth = Math.max(10, scaledLevelWidth * 6);
            this.group.append('line')
                .attr('class', 'fib-level-hit')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', endX).attr('y2', endY)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', endX).attr('y2', endY)
                .attr('stroke', color)
                .attr('stroke-width', scaledLevelWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('opacity', 0.8)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        };

        this.levels.forEach((levelObj) => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object'
                ? (levelObj.enabled !== false && levelObj.visible !== false)
                : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : this.style.strokeWidth;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

            if (!enabled) return;

            const ratio = parseFloat(level);
            if (!isFinite(ratio)) return;

            drawFanRay(x2, priceY(ratio), color, lineWidth, lineType);
        });

        timeLevels.forEach((levelObj) => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object'
                ? (levelObj.enabled !== false && levelObj.on !== false && levelObj.visible !== false)
                : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : this.style.strokeWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : '';

            if (!enabled) return;

            const ratio = parseFloat(level);
            if (!isFinite(ratio)) return;

            drawFanRay(timeX(ratio), y2, color, lineWidth, lineType);
        });

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibSpeedFanTool(data.points, data.style);
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
// Trend-Based Fib Time Tool
// ============================================================================
class TrendFibTimeTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('trend-fib-time', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.trendLineEnabled === undefined) this.style.trendLineEnabled = true;
        if (!this.style.trendLineColor) this.style.trendLineColor = this.style.stroke;
        if (this.style.trendLineDasharray === undefined) this.style.trendLineDasharray = '6,6';
        if (this.style.trendLineWidth === undefined) this.style.trendLineWidth = this.style.strokeWidth || 1;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        this.levels = style.levels || [
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 1, enabled: true, color: '#2962ff' },
            { value: 1.618, enabled: true, color: '#e91e63' },
            { value: 2.618, enabled: false, color: '#673ab7' },
            { value: 4.236, enabled: false, color: '#3f51b5' }
        ];
    }

    patchPanZoomGeometry(scales) {
        return BaseDrawing.patchTrendFibTime(this, scales);
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length === 0) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing trend-fib-time', renderOpts);
        this._clearDrawingLabels(scales);

        const { plotTop, plotBottom } = fibChartPlotVerticalSpan(scales);
        const getXFromIndex = (idx) => scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(idx) : scales.xScale(idx);
        const getY = (p) => scales.yScale(p.y);
        const anchorStrokeWidth = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);
        const trendEnabled = this.style.trendLineEnabled !== false;
        const trendColor = this.style.trendLineColor || this.style.stroke || '#787b86';
        const trendDash = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '6,6';
        const trendBaseW = (this.style.trendLineWidth != null && !isNaN(parseInt(this.style.trendLineWidth, 10)))
            ? parseInt(this.style.trendLineWidth, 10)
            : (parseInt(this.style.strokeWidth, 10) || 1);
        const scaledTrendW = Math.max(0.5, trendBaseW * scaleFactor);

        // 1-point preview: dot only
        if (this.points.length === 1) {
            this.group.append('circle')
                .attr('cx', getXFromIndex(this.points[0].x))
                .attr('cy', getY(this.points[0]))
                .attr('r', 4)
                .attr('fill', this.style.stroke);
            return this.group;
        }

        const p1 = this.points[0];
        const p2 = this.points[1];
        const xIndex1 = p1.x;
        const xIndex2 = p2.x;
        const baseDx = xIndex2 - xIndex1;
        const x1 = getXFromIndex(xIndex1);
        const y1 = getY(p1);
        const x2 = getXFromIndex(xIndex2);
        const y2 = getY(p2);

        // Base interval anchor line (P1 → P2) — uses trend line style (V9 / toolbar)
        if (trendEnabled) {
            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', trendColor)
                .attr('stroke-width', scaledTrendW)
                .attr('stroke-dasharray', trendDash)
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // 2-point preview: show base interval line + endpoint dots, await 3rd click
        if (this.points.length === 2) {
            [p1, p2].forEach(p => {
                this.group.append('circle')
                    .attr('cx', getXFromIndex(p.x)).attr('cy', getY(p))
                    .attr('r', 4)
                    .attr('fill', this.style.stroke);
            });
            return this.group;
        }

        // Full 3-point render
        if (this.points.length >= 3 && baseDx !== 0) {
            const p3 = this.points[2];
            const xIndex3 = p3.x;
            const x3 = getXFromIndex(xIndex3);
            const y3 = getY(p3);

            // Second leg: P2 → P3 (same trend styling)
            if (trendEnabled) {
                this.group.append('line')
                    .attr('x1', x2).attr('y1', y2)
                    .attr('x2', x3).attr('y2', y3)
                    .attr('stroke', trendColor)
                    .attr('stroke-width', scaledTrendW)
                    .attr('stroke-dasharray', trendDash)
                    .attr('opacity', 0.7)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }

            const showZones = !!this.style.showZones;
            const bgOpacity = (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
                ? parseFloat(this.style.backgroundOpacity)
                : 0.12;
            const showLevelValues = this.style.levelsEnabled !== false;

            const enabledLevels = (this.levels || [])
                .filter(l => l && l.enabled !== false)
                .map(l => ({
                    value: parseFloat(l.value),
                    color: l.color || this.style.stroke,
                    lineWidth: l.lineWidth,
                    lineType: l.lineType
                }))
                .filter(l => isFinite(l.value))
                .sort((a, b) => a.value - b.value);

            // Project fib lines from P3 using P1-P2 as base interval
            const xAt = (level) => getXFromIndex(xIndex3 + (baseDx * level));

            // Zones between consecutive enabled levels
            if (showZones && enabledLevels.length >= 2) {
                for (let i = 0; i < enabledLevels.length - 1; i++) {
                    const xa = xAt(enabledLevels[i].value);
                    const xb = xAt(enabledLevels[i + 1].value);
                    const xLeft = Math.min(xa, xb);
                    const width = Math.abs(xb - xa);

                    this.group.insert('rect', ':first-child')
                        .attr('x', xLeft)
                        .attr('y', plotTop)
                        .attr('width', width)
                        .attr('height', Math.max(1, plotBottom - plotTop))
                        .attr('fill', enabledLevels[i].color)
                        .attr('opacity', bgOpacity)
                        .style('pointer-events', 'none');
                }
            }

            // Vertical lines at each level
            const tftLabelSlots = [];
            enabledLevels.forEach(lvl => {
                const level = lvl.value;
                const x = xAt(level);
                const baseWidth = (lvl.lineWidth != null && !isNaN(parseInt(lvl.lineWidth)))
                    ? parseInt(lvl.lineWidth)
                    : (level === 0 || level === 1 ? 2 : 1);
                const baseType = (lvl.lineType != null) ? `${lvl.lineType}` : '';
                const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
                const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

                const scaledWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
                const hitWidth = Math.max(10, scaledWidth * 6);

                this.group.append('line')
                    .attr('class', 'fib-level-hit fib-tft-vertical')
                    .attr('data-fib-tft', level)
                    .attr('x1', x).attr('y1', plotTop)
                    .attr('x2', x).attr('y2', plotBottom)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                let tftLabelText = null;
                let tftLp = null;
                let tftGap = null;
                const tftLabelFontSize = fibVerticalSpanLabelFontSize(scaleFactor);
                if (showLevelValues) {
                    tftLabelText = BaseDrawing.formatFibLevelLabel(this.style, level);
                    tftLp = fibVerticalSpanLabelPlacement(this.style, x, plotTop, plotBottom, tftLabelFontSize);
                    tftGap = fibVerticalCenterLabelGap(this.style, this.group, tftLabelText, tftLp.y, tftLabelFontSize, '700');
                }

                appendFibVerticalLineWithCenterGap(this.group, x, plotTop, plotBottom, tftGap, {
                    class: 'fib-tft-vertical',
                    'data-fib-tft': level,
                    stroke: lvl.color,
                    'stroke-width': scaledWidth,
                    'stroke-dasharray': lineType || 'none',
                    opacity: 0.9,
                });

                if (showLevelValues) {
                    tftLabelSlots.push({
                        x: tftLp.x,
                        y: tftLp.y,
                        anchor: tftLp.anchor,
                        dominantBaseline: tftLp.dominantBaseline,
                        text: tftLabelText,
                        color: lvl.color,
                        fontSize: tftLabelFontSize,
                        level,
                    });
                }
            });

            if (showLevelValues && tftLabelSlots.length) {
                resolveFibVerticalLineLabelCollisions(tftLabelSlots, this.group, tftLabelSlots[0].fontSize, '700').forEach((slot) => {
                    const textEl = this.group.append('text')
                        .attr('class', 'fib-tft-label')
                        .attr('data-fib-tft', slot.level)
                        .attr('x', slot.x)
                        .attr('y', slot.y)
                        .attr('text-anchor', slot.anchor)
                        .text(slot.text);
                    if (slot.dominantBaseline) textEl.attr('dominant-baseline', slot.dominantBaseline);
                    applyFibSpanLabelTextStyle(textEl, slot.color, slot.fontSize);
                });
            }
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    toJSON() {
        if (this.style) this.style.levels = this.levels;
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    static fromJSON(data, chart = null) {
        const tool = new TrendFibTimeTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (Array.isArray(data.levels) && data.levels.length) {
            tool.levels = data.levels;
            if (tool.style) tool.style.levels = data.levels;
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
// Fib Circles Tool
// ============================================================================
class FibCirclesTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-circles', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined || this.style.backgroundOpacity === null) {
            this.style.backgroundOpacity = 0.12;
        }
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        this.levels = style.levels || [
            { value: 0.236, enabled: true, color: '#f23645' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 0.786, enabled: true, color: '#00bcd4' },
            { value: 1, enabled: true, color: '#2962ff' },
            { value: 1.618, enabled: false, color: '#e91e63' },
            { value: 2.618, enabled: false, color: '#673ab7' }
        ];
        this.style.levels = this.levels;
    }

    toJSON() {
        this.style.levels = this.levels;
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    /** Ray parameter along p1→p2 where an ellipse at `level` meets the axis (TV axis-aligned ellipses). */
    static _rayScaleForLevel(level, dx, dy, baseRx, baseRy, useGeometric) {
        const lv = parseFloat(level);
        if (!isFinite(lv) || lv <= 0) return 0;
        if (useGeometric) return lv;
        if (baseRx <= 0 || baseRy <= 0) return lv;
        const denom = Math.hypot(dx / baseRx, dy / baseRy);
        if (!denom || !isFinite(denom)) return lv;
        return lv / denom;
    }

    /** Stored corner offset from center so level-1 intersection sits at (ivx, ivy). */
    static _cornerOffsetFromLevel1Hit(ivx, ivy, useGeometric) {
        if (useGeometric) return { dx: ivx, dy: ivy };
        if (Math.abs(ivx) < 1e-6 && Math.abs(ivy) < 1e-6) return { dx: 0, dy: 0 };
        const ax = ivx !== 0 ? ivx / Math.abs(ivx) : 0;
        const ay = ivy !== 0 ? ivy / Math.abs(ivy) : 0;
        const denom = Math.hypot(ax, ay) || 1;
        return { dx: ivx * denom, dy: ivy * denom };
    }

    onPointHandleDrag(index, context = {}) {
        const { point, scales } = context;
        if (!point || !scales || !this.points[0]) return false;

        if (index === 0) {
            if (!this.points[1]) return false;
            const dx = point.x - this.points[0].x;
            const dy = point.y - this.points[0].y;
            this.points = this.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            return true;
        }

        if (index !== 1) return false;

        const chart = scales.chart;
        const xScale = scales.xScale;
        const yScale = scales.yScale;
        if (!yScale) return false;

        const toPxX = (p) => (chart && typeof chart.dataIndexToPixel === 'function')
            ? chart.dataIndexToPixel(p.x)
            : (xScale ? xScale(p.x) : p.x);
        const toPxY = (p) => yScale(p.y);
        const invPxX = (px) => (chart && typeof chart.pixelToDataIndex === 'function')
            ? chart.pixelToDataIndex(px)
            : (xScale && typeof xScale.invert === 'function' ? xScale.invert(px) : point.x);
        const invPxY = (py) => (yScale && typeof yScale.invert === 'function')
            ? yScale.invert(py)
            : point.y;

        const x0 = toPxX(this.points[0]);
        const y0 = toPxY(this.points[0]);
        const xM = toPxX(point);
        const yM = toPxY(point);
        const ivx = xM - x0;
        const ivy = yM - y0;
        if (Math.hypot(ivx, ivy) < 1e-6) return false;

        const useGeometric = this.style.v9FibCirclesGeometric === true || this.style.geometricCircles === true;
        const { dx, dy } = FibCirclesTool._cornerOffsetFromLevel1Hit(ivx, ivy, useGeometric);
        this.points[1] = {
            x: invPxX(x0 + dx),
            y: invPxY(y0 + dy),
        };
        return true;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        if (Array.isArray(this.style.levels) && this.style.levels.length) {
            this.levels = this.style.levels;
        }

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-circles', renderOpts);
        this._clearDrawingLabels(scales);

        const showLevelValues = this.style.levelsEnabled !== false;
        const priceDecimals = (typeof this.getPriceDecimals === 'function') ? this.getPriceDecimals(this.points[0]?.y) : 2;

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);
        const dx = x2 - x1;
        const dy = y2 - y1;
        // TradingView default: axis-aligned ellipses (time × price), not a single screen radius.
        const baseRx = Math.abs(dx);
        const baseRy = Math.abs(dy);
        const useGeometric = this.style.v9FibCirclesGeometric === true || this.style.geometricCircles === true;
        const baseRadius = useGeometric
            ? Math.hypot(dx, dy)
            : Math.max(baseRx, baseRy);
        if (!baseRadius || !isFinite(baseRadius)) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const levelRadii = (level) => {
            const lv = parseFloat(level);
            if (!isFinite(lv) || lv <= 0) return { rx: 0, ry: 0 };
            if (useGeometric) {
                const r = baseRadius * lv;
                return { rx: r, ry: r };
            }
            return { rx: baseRx * lv, ry: baseRy * lv };
        };

        const scaledStroke = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);
        const hitStroke = Math.max(10, scaledStroke * 6);

        const showZones = this.style.v9FibCirclesBackground != null
            ? this.style.v9FibCirclesBackground !== false
            : this.style.showZones !== false;
        const zonesOpacity = Math.max(0, Math.min(1,
            (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
                ? parseFloat(this.style.backgroundOpacity)
                : ((this.style.v9FibCirclesBgOpacity != null && !isNaN(parseFloat(this.style.v9FibCirclesBgOpacity)))
                    ? parseFloat(this.style.v9FibCirclesBgOpacity)
                    : 0.12)));

        const hexToRgba = (hex, alpha) => {
            if (!hex || typeof hex !== 'string') return `rgba(41, 98, 255, ${alpha})`;
            const h = hex.trim();
            if (h.startsWith('rgba(') || h.startsWith('rgb(')) return h;
            let raw = h[0] === '#' ? h.slice(1) : h;
            if (raw.length === 3) raw = raw.split('').map(c => c + c).join('');
            if (raw.length !== 6) return `rgba(41, 98, 255, ${alpha})`;
            const r = parseInt(raw.slice(0, 2), 16);
            const g = parseInt(raw.slice(2, 4), 16);
            const b = parseInt(raw.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const zonePathRing = (rx, ry, prevRx, prevRy) => {
            const outer = `M ${x1 - rx} ${y1} A ${rx} ${ry} 0 1 1 ${x1 + rx} ${y1} A ${rx} ${ry} 0 1 1 ${x1 - rx} ${y1} Z`;
            if (prevRx > 0 && prevRy > 0) {
                return `${outer} M ${x1 + prevRx} ${y1} A ${prevRx} ${prevRy} 0 1 0 ${x1 - prevRx} ${y1} A ${prevRx} ${prevRy} 0 1 0 ${x1 + prevRx} ${y1} Z`;
            }
            return outer;
        };

        const enabledLevelsSorted = (this.levels || [])
            .map(l => ({
                value: typeof l === 'object' ? l.value : l,
                enabled: typeof l === 'object' ? (l.enabled !== false && l.visible !== false) : true,
                color: typeof l === 'object' ? l.color : this.style.stroke
            }))
            .filter(l => l.enabled)
            .sort((a, b) => a.value - b.value);

        const maxEnabledLevel = enabledLevelsSorted.reduce(
            (max, lvl) => Math.max(max, lvl.value),
            1
        );
        /** Ray parameter s along (dx,dy) where ellipse at `level` meets the p1→p2 axis (TV axis-aligned ellipses). */
        const rayScaleForLevel = (level) => FibCirclesTool._rayScaleForLevel(
            level, dx, dy, baseRx, baseRy, useGeometric
        );
        const maxRayScale = rayScaleForLevel(maxEnabledLevel);
        const axisEndX = x1 + dx * maxRayScale;
        const axisEndY = y1 + dy * maxRayScale;
        const axisLen = Math.hypot(dx, dy) || 1;
        const labelOffsetX = (-dy / axisLen) * 5;
        const labelOffsetY = (dx / axisLen) * 5;

        if (showZones && enabledLevelsSorted.length) {
            let prevRx = 0;
            let prevRy = 0;
            enabledLevelsSorted.forEach((lvl) => {
                const { rx, ry } = levelRadii(lvl.value);
                if (!isFinite(rx) || !isFinite(ry) || rx <= 0 || ry <= 0) {
                    prevRx = rx;
                    prevRy = ry;
                    return;
                }
                this.group.append('path')
                    .attr('class', 'fib-circles-zone')
                    .attr('d', zonePathRing(rx, ry, prevRx, prevRy))
                    .attr('fill', hexToRgba(lvl.color, zonesOpacity))
                    .attr('fill-rule', prevRx > 0 ? 'evenodd' : 'nonzero')
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
                prevRx = rx;
                prevRy = ry;
            });
        }

        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object'
                ? (levelObj.enabled !== false && levelObj.visible !== false)
                : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : this.style.strokeWidth;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;
            
            if (!enabled) return;
            
            const { rx, ry } = levelRadii(level);
            if (!isFinite(rx) || !isFinite(ry) || rx <= 0 || ry <= 0) return;

            const scaledWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
            const hitWidth = Math.max(10, scaledWidth * 6);

            this.group.append('ellipse')
                .attr('class', 'fib-level-hit')
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('rx', rx)
                .attr('ry', ry)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('ellipse')
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('rx', rx)
                .attr('ry', ry)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Label on the trend line at the ellipse border (same ray as middle line)
            const rayS = rayScaleForLevel(level);
            const lx = x1 + dx * rayS;
            const ly = y1 + dy * rayS;
            if (showLevelValues) {
                const lp = fibSegmentParamPlacement(this.style, x1, y1, lx, ly);
                this.group.append('text')
                    .attr('x', lp.x + labelOffsetX)
                    .attr('y', lp.y + labelOffsetY)
                    .attr('text-anchor', fibPointTextAnchor(this.style))
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .attr('dominant-baseline', 'middle')
                    .style('pointer-events', 'none')
                    .text(BaseDrawing.formatFibLevelLabel(this.style, level, {
                        price: scales.yScale && typeof scales.yScale.invert === 'function' ? scales.yScale.invert(ly) : null,
                        priceDecimals,
                    }));
            }
        });

        const showTrendLine = this.style.trendLineEnabled !== false
            && this.style.v9FibCirclesTrendLine !== false;

        // Anchor ray through all enabled levels (center → max level on the 1.0→point2 direction)
        if (showTrendLine) {
            const trendColor = this.style.trendLineColor || this.style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
            const trendWidth = Math.max(0.5, (parseInt(this.style.trendLineWidth, 10) || this.style.strokeWidth || 1) * scaleFactor);
            const trendHit = Math.max(10, trendWidth * 6);
            const trendDashRaw = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '';
            const trendDash = trendDashRaw.replace(/\s+/g, '') === '' ? '' : trendDashRaw;

            this.group.append('line')
                .attr('class', 'fib-level-hit fib-circles-axis')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', axisEndX).attr('y2', axisEndY)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', trendHit)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('class', 'fib-circles-axis fib-level-hit')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', axisEndX).attr('y2', axisEndY)
                .attr('stroke', trendColor)
                .attr('stroke-width', trendWidth)
                .attr('stroke-dasharray', trendDash || 'none')
                .attr('opacity', 0.35)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        } else {
            // Invisible hit ray only (trend line hidden)
            this.group.append('line')
                .attr('class', 'fib-level-hit fib-circles-axis')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', axisEndX).attr('y2', axisEndY)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitStroke)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Second handle on level-1 ellipse border (same ray as labels / middle line).
        const invPxX = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
            ? scales.chart.pixelToDataIndex(px)
            : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : this.points[1].x);
        const invPxY = (py) => (scales.yScale && typeof scales.yScale.invert === 'function')
            ? scales.yScale.invert(py)
            : this.points[1].y;
        const ray1 = rayScaleForLevel(1);
        const hx = x1 + dx * ray1;
        const hy = y1 + dy * ray1;
        this.virtualPoints = [
            this.points[0],
            { x: invPxX(hx), y: invPxY(hy) },
        ];

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibCirclesTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (Array.isArray(data.levels) && data.levels.length) {
            tool.levels = data.levels;
            tool.style.levels = data.levels;
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
// Fib Spiral Tool
// ============================================================================
class FibSpiralTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-spiral', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#00bcd4';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.counterClockwise === undefined) {
            this.style.counterClockwise = style.counterClockwise === true || style.v9FibSpiralCCW === true;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-spiral', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const baseLen = Math.hypot(dx, dy);
        if (!baseLen) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const chartWidth = scales.chart?.w || 2000;
        const chartHeight = scales.chart?.h || 500;
        const vx = dx / baseLen;
        const vy = dy / baseLen;

        // Anchor ray (TradingView-like): from point1 through point2 extended to chart edge
        const tX = vx > 0 ? ((chartWidth - x1) / vx) : (vx < 0 ? ((0 - x1) / vx) : Infinity);
        const tY = vy > 0 ? ((chartHeight - y1) / vy) : (vy < 0 ? ((0 - y1) / vy) : Infinity);
        const t = Math.min(
            tX > 0 ? tX : Infinity,
            tY > 0 ? tY : Infinity
        );
        const endX = isFinite(t) ? (x1 + vx * t) : x2;
        const endY = isFinite(t) ? (y1 + vy * t) : y2;

        const scaledStroke = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);
        const hitStroke = Math.max(10, scaledStroke * 6);

        this.group.append('line')
            .attr('class', 'fib-level-hit')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', endX).attr('y2', endY)
            .attr('stroke', 'rgba(255,255,255,0.001)')
            .attr('stroke-width', hitStroke)
            .attr('stroke-dasharray', '')
            .attr('opacity', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', endX).attr('y2', endY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStroke)
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Golden logarithmic spiral passing through point2
        // Golden spiral property: radius multiplies by phi every 90 degrees (pi/2)
        const phi = 1.618033988749895;
        const k = Math.log(phi) / (Math.PI / 2);
        const a = baseLen; // r(0) = distance(point1, point2)
        const baseAngle = Math.atan2(dy, dx);
        const ccw = this.style.counterClockwise === true || this.style.v9FibSpiralCCW === true;
        const thetaSign = ccw ? -1 : 1;

        const maxR = Math.hypot(chartWidth, chartHeight) * 2;
        const thetaMin = -6 * Math.PI;
        const thetaMax = 6 * Math.PI;
        const step = 0.06;

        let pathD = '';
        let started = false;
        for (let theta = thetaMin; theta <= thetaMax; theta += step) {
            const r = a * Math.exp(k * theta);
            if (!isFinite(r) || r <= 0 || r > maxR) continue;

            const ang = baseAngle + (thetaSign * theta);
            const px = x1 + r * Math.cos(ang);
            const py = y1 + r * Math.sin(ang);
            if (!isFinite(px) || !isFinite(py)) continue;

            if (!started) {
                pathD = `M ${px} ${py}`;
                started = true;
            } else {
                pathD += ` L ${px} ${py}`;
            }
        }

        this.group.append('path')
            .attr('class', 'fib-level-hit')
            .attr('d', pathD)
            .attr('stroke', 'rgba(255,255,255,0.001)')
            .attr('stroke-width', hitStroke)
            .attr('fill', 'none')
            .attr('opacity', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('d', pathD)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStroke)
            .attr('fill', 'none')
            .attr('opacity', 0.8)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibSpiralTool(data.points, data.style);
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
// Fib Speed Resistance Arcs Tool
// ============================================================================
class FibArcsTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-arcs', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        if (this.style.trendLineEnabled === undefined) this.style.trendLineEnabled = true;
        this.levels = style.levels || [
            { value: 0.236, enabled: true, color: '#f23645' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 0.786, enabled: true, color: '#00bcd4' },
            { value: 1, enabled: true, color: '#2962ff' },
            { value: 1.618, enabled: true, color: '#e91e63' },
            { value: 2, enabled: true, color: '#2962ff' },
            { value: 2.618, enabled: true, color: '#e91e63' },
            { value: 3, enabled: true, color: '#2962ff' },
            { value: 4.236, enabled: true, color: '#f23645' }
        ];
        // Persist/load same model as FibonacciRetracementTool — BaseDrawing.toJSON only ships `style`.
        this.style.levels = this.levels;
    }

    toJSON() {
        this.style.levels = this.levels;
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-arcs', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const baseRadius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        if (!baseRadius || !isFinite(baseRadius)) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        // Like fib-circles but only half: arcs face the direction price came from
        const isDown = y2 >= y1;
        const sweep = isDown ? 0 : 1;
        const innerSweep = isDown ? 1 : 0;

        const showZones = this.style.showZones !== false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;
        const fullCirc = this.style.v9FibArcsFullCircle === true || this.style.fullCircle === true;
        const showLevelValues = this.style.levelsEnabled !== false;
        const priceDecimals = (typeof this.getPriceDecimals === 'function') ? this.getPriceDecimals(this.points[0]?.y) : 2;

        const hexToRgba = (hex, alpha) => {
            if (!hex || typeof hex !== 'string') return `rgba(41, 98, 255, ${alpha})`;
            let h = hex.trim();
            if (h.startsWith('rgba(') || h.startsWith('rgb(')) return h;
            if (h[0] === '#') h = h.slice(1);
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            if (h.length !== 6) return `rgba(41, 98, 255, ${alpha})`;
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const enabledLevelsSorted = this.levels
            .map(l => ({
                value: typeof l === 'object' ? l.value : l,
                enabled: typeof l === 'object' ? (l.enabled !== false && l.visible !== false) : true,
                color: typeof l === 'object' ? l.color : this.style.stroke
            }))
            .filter(l => l.enabled)
            .sort((a, b) => a.value - b.value);

        const arcPathHalf = (r) =>
            `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1}`;
        const arcPathFull = (r) =>
            `M ${x1 - r} ${y1} A ${r} ${r} 0 1 1 ${x1 + r} ${y1} A ${r} ${r} 0 1 1 ${x1 - r} ${y1}`;
        const zonePathHalf = (r, prevR) => {
            if (prevR > 0) {
                return `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1} ` +
                    `L ${x1 + prevR} ${y1} A ${prevR} ${prevR} 0 0 ${innerSweep} ${x1 - prevR} ${y1} Z`;
            }
            return `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1} L ${x1} ${y1} Z`;
        };
        const zonePathFull = (r, prevR) => {
            if (prevR > 0) {
                return `M ${x1 - r} ${y1} A ${r} ${r} 0 1 1 ${x1 + r} ${y1} A ${r} ${r} 0 1 1 ${x1 - r} ${y1} ` +
                    `M ${x1 + prevR} ${y1} A ${prevR} ${prevR} 0 1 0 ${x1 - prevR} ${y1} A ${prevR} ${prevR} 0 1 0 ${x1 + prevR} ${y1} Z`;
            }
            return `M ${x1 - r} ${y1} A ${r} ${r} 0 1 1 ${x1 + r} ${y1} A ${r} ${r} 0 1 1 ${x1 - r} ${y1} Z`;
        };

        if (showZones && enabledLevelsSorted.length) {
            let prevR = 0;
            enabledLevelsSorted.forEach((lvl) => {
                const r = baseRadius * lvl.value;
                if (!isFinite(r) || r <= 0) {
                    prevR = r;
                    return;
                }

                const fill = hexToRgba(lvl.color, zonesOpacity);
                const d = fullCirc ? zonePathFull(r, prevR) : zonePathHalf(r, prevR);

                this.group.append('path')
                    .attr('d', d)
                    .attr('fill', fill)
                    .attr('fill-rule', fullCirc && prevR > 0 ? 'evenodd' : 'nonzero')
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');

                prevR = r;
            });
        }

        const arcsLabelFontSize = fibVerticalSpanLabelFontSize(scaleFactor);
        const arcLabelSlots = [];

        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object'
                ? (levelObj.enabled !== false && levelObj.visible !== false)
                : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : this.style.strokeWidth;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

            if (!enabled) return;

            const r = baseRadius * level;
            if (!isFinite(r) || r <= 0) return;

            const scaledWidth = Math.max(0.5, (lineWidth || 1) * scaleFactor);
            const hitWidth = Math.max(10, scaledWidth * 6);
            const arcD = fullCirc ? arcPathFull(r) : arcPathHalf(r);

            // Hit area (solid, nearly invisible) so arcs are easy to click
            this.group.append('path')
                .attr('class', 'fib-level-hit')
                .attr('d', arcD)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('d', arcD)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            if (showLevelValues) {
                const lp = fibArcsLevelLabelPlacement(this.style, x1, y1, r, isDown, fullCirc);
                const labelText = BaseDrawing.formatFibLevelLabel(this.style, level, {
                    price: scales.yScale && typeof scales.yScale.invert === 'function' ? scales.yScale.invert(y1) : null,
                    priceDecimals,
                });
                arcLabelSlots.push({
                    level,
                    color,
                    text: labelText,
                    x: lp.x,
                    y: lp.y,
                    anchor: lp.anchor || 'middle',
                    dominantBaseline: lp.dominantBaseline || null,
                });
            }
        });

        if (showLevelValues && arcLabelSlots.length) {
            resolveFibArcLabelCollisions(arcLabelSlots, this.group, arcsLabelFontSize, '700').forEach((slot) => {
                const textEl = this.group.append('text')
                    .attr('class', 'fib-arcs-label')
                    .attr('data-fib-arcs-level', slot.level)
                    .attr('x', slot.x)
                    .attr('y', slot.y)
                    .attr('text-anchor', slot.anchor)
                    .text(slot.text);
                if (slot.dominantBaseline) textEl.attr('dominant-baseline', slot.dominantBaseline);
                applyFibSpanLabelTextStyle(textEl, slot.color, arcsLabelFontSize);
            });
        }

        if (this.style.trendLineEnabled !== false) {
            const tCol = this.style.trendLineColor || this.style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
            const tW = Math.max(0.5, (parseInt(this.style.trendLineWidth, 10) || 1) * scaleFactor);
            const tHit = Math.max(10, tW * 6);
            const tDashRaw = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '';
            const tDash = tDashRaw.replace(/\s+/g, '') === '' ? 'none' : tDashRaw;
            this.group.append('line')
                .attr('class', 'fib-arcs-trend-hit')
                .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', tHit)
                .attr('stroke-dasharray', '')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            this.group.append('line')
                .attr('class', 'fib-arcs-trend')
                .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
                .attr('stroke', tCol)
                .attr('stroke-width', tW)
                .attr('stroke-dasharray', tDash)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibArcsTool(data.points, data.style || {});
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
        if (Array.isArray(data.levels) && data.levels.length) {
            tool.levels = data.levels.map((level) => {
                const value = typeof level.value === 'number' ? level.value : parseFloat(level.value) || 0;
                const enabled = level.enabled !== false && level.visible !== false;
                return {
                    value,
                    label: level.label != null ? `${level.label}` : `${value}`,
                    color: level.color || '#787b86',
                    enabled,
                    lineType: level.lineType != null ? `${level.lineType}` : '',
                    lineWidth: (level.lineWidth != null && !isNaN(parseInt(level.lineWidth, 10)))
                        ? parseInt(level.lineWidth, 10)
                        : 2
                };
            });
        }
        tool.style.levels = tool.levels;
        return tool;
    }
}

// ============================================================================
// Fib Wedge Tool
// ============================================================================
class FibWedgeTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-wedge', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values' && this.style.levelsLabelMode !== 'both') this.style.levelsLabelMode = 'values';
        this.levels = style.levels || [
            { value: 0, enabled: false, color: '#787b86' },
            { value: 0.236, enabled: true, color: '#f23645' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 0.786, enabled: true, color: '#00bcd4' },
            { value: 1, enabled: true, color: '#787b86' }
        ];
        this.style.levels = this.levels;
    }

    patchPanZoomGeometry(scales) {
        return BaseDrawing.patchFibWedge(this, scales);
    }

    toJSON() {
        this.style.levels = this.levels;
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { pointIndex, dataPoint, screen, scales } = context;
        if (pointIndex === undefined || pointIndex === null) return false;

        if (!this.points || this.points.length < 2) return false;

        if (pointIndex === 2 && scales && scales.yScale && (scales.xScale || scales.chart)) {
            const chart = scales.chart;
            const toPixelX = (x) => chart && chart.dataIndexToPixel ? chart.dataIndexToPixel(x) : scales.xScale(x);
            const toDataX = (px) => chart && chart.pixelToDataIndex ? chart.pixelToDataIndex(px) : scales.xScale.invert(px);
            const toPixelY = (y) => scales.yScale(y);
            const toDataY = (py) => scales.yScale.invert(py);

            const cx = toPixelX(this.points[0].x);
            const cy = toPixelY(this.points[0].y);
            const rx = toPixelX(this.points[1].x);
            const ry = toPixelY(this.points[1].y);
            const r = Math.hypot(rx - cx, ry - cy);
            if (!r || !isFinite(r)) return false;

            const sx = screen ? screen.x : (chart && chart.dataIndexToPixel && dataPoint ? chart.dataIndexToPixel(dataPoint.x) : rx);
            const sy = screen ? screen.y : (dataPoint ? toPixelY(dataPoint.y) : ry);
            const ang = Math.atan2(sy - cy, sx - cx);

            const px = cx + Math.cos(ang) * r;
            const py = cy + Math.sin(ang) * r;

            this.points[2] = { x: toDataX(px), y: toDataY(py) };
            this.meta.updatedAt = Date.now();
            return true;
        }

        if (!dataPoint) return false;
        if (pointIndex < 0 || pointIndex >= this.points.length) return false;
        this.points[pointIndex] = { x: dataPoint.x, y: dataPoint.y };
        this.meta.updatedAt = Date.now();
        return true;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing fib-wedge', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        // Preview (2 points): draw the first ray only
        const baseRadius = Math.hypot(x2 - x1, y2 - y1);
        if (!baseRadius || !isFinite(baseRadius)) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const boundaryWidth = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);

        const appendWedgeRay = (xA, yA, xB, yB, rayId) => {
            if (this.style.trendLineEnabled === false) return;
            const tCol = this.style.trendLineColor || this.style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
            const tW = Math.max(0.5, (parseInt(this.style.trendLineWidth, 10) || 1) * scaleFactor);
            const tHit = Math.max(10, tW * 6);
            const tDashRaw = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '';
            const tDash = tDashRaw.replace(/\s+/g, '') === '' ? 'none' : tDashRaw;
            this.group.append('line')
                .attr('class', 'fib-wedge-trend-hit')
                .attr('data-wedge-ray', rayId)
                .attr('x1', xA).attr('y1', yA).attr('x2', xB).attr('y2', yB)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', tHit)
                .attr('stroke-dasharray', '')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            this.group.append('line')
                .attr('class', 'fib-wedge-trend fib-trend-line')
                .attr('data-wedge-ray', rayId)
                .attr('x1', xA).attr('y1', yA).attr('x2', xB).attr('y2', yB)
                .attr('stroke', tCol)
                .attr('stroke-width', tW)
                .attr('stroke-dasharray', tDash)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        };

        appendWedgeRay(x1, y1, x2, y2, '1');

        if (this.points.length < 3) {
            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const x3Raw = getX(this.points[2]);
        const y3Raw = getY(this.points[2]);

        const a1 = Math.atan2(y2 - y1, x2 - x1);
        const a2 = Math.atan2(y3Raw - y1, x3Raw - x1);

        const twoPi = Math.PI * 2;
        const deltaCW = (a2 - a1 + twoPi) % twoPi;
        const deltaCCW = (a1 - a2 + twoPi) % twoPi;
        const sweepFlag = (deltaCW <= deltaCCW) ? 1 : 0;
        const delta = (sweepFlag === 1) ? deltaCW : deltaCCW;
        const largeArcFlag = delta > Math.PI ? 1 : 0;
        const innerSweepFlag = sweepFlag === 1 ? 0 : 1;

        const polar = (ang, r) => ({ x: x1 + Math.cos(ang) * r, y: y1 + Math.sin(ang) * r });
        const p2 = polar(a1, baseRadius);
        const p3 = polar(a2, baseRadius);

        appendWedgeRay(x1, y1, p3.x, p3.y, '2');

        const toDataX = (px) => scales.chart && scales.chart.pixelToDataIndex ? scales.chart.pixelToDataIndex(px) : scales.xScale.invert(px);
        const toDataY = (py) => scales.yScale.invert(py);

        if (Array.isArray(this.style?.levels) && this.style.levels.length) {
            this.levels = this.style.levels;
        } else if (Array.isArray(this.levels) && this.levels.length) {
            this.style.levels = this.levels;
        }

        const hexToRgba = (hex, alpha) => {
            if (!hex || typeof hex !== 'string') return `rgba(41, 98, 255, ${alpha})`;
            let h = hex.trim();
            if (h.startsWith('rgba(') || h.startsWith('rgb(')) return h;
            if (h[0] === '#') h = h.slice(1);
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            if (h.length !== 6) return `rgba(41, 98, 255, ${alpha})`;
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const showZones = this.style.showZones !== false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;
        const showLevelValues = this.style.levelsEnabled !== false;
        const priceDecimals = (typeof this.getPriceDecimals === 'function') ? this.getPriceDecimals(this.points[0]?.y) : 2;

        const enabledLevelsSorted = this.levels
            .map((l, idx) => ({
                idx,
                value: typeof l === 'object' ? l.value : l,
                enabled: BaseDrawing.fibLevelRowVisible(l),
                color: typeof l === 'object' ? l.color : this.style.stroke
            }))
            .filter(l => l.enabled)
            .map(l => ({ ...l, r: baseRadius * parseFloat(l.value) }))
            .filter(l => isFinite(l.r) && l.r > 0)
            .sort((a, b) => a.r - b.r);

        if (showZones && enabledLevelsSorted.length) {
            let prevR = 0;
            enabledLevelsSorted.forEach((lvl, zoneIdx) => {
                const r = lvl.r;
                const fill = hexToRgba(lvl.color, zonesOpacity);
                const outerStart = polar(a1, r);
                const outerEnd = polar(a2, r);

                let d = `M ${outerStart.x} ${outerStart.y} ` +
                    `A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${outerEnd.x} ${outerEnd.y} `;

                if (prevR > 0) {
                    const innerEnd = polar(a2, prevR);
                    const innerStart = polar(a1, prevR);
                    d += `L ${innerEnd.x} ${innerEnd.y} ` +
                        `A ${prevR} ${prevR} 0 ${largeArcFlag} ${innerSweepFlag} ${innerStart.x} ${innerStart.y} Z`;
                } else {
                    d += `L ${x1} ${y1} Z`;
                }

                this.group.append('path')
                    .attr('data-fib-wedge-zone-idx', zoneIdx)
                    .attr('d', d)
                    .attr('fill', fill)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');

                prevR = r;
            });
        }

        // Body hitbox — full wedge interior for select + move (level arcs stack above for ratio drag).
        const wedgeBodyPath = `M ${p2.x} ${p2.y} A ${baseRadius} ${baseRadius} 0 ${largeArcFlag} ${sweepFlag} ${p3.x} ${p3.y} L ${x1} ${y1} Z`;
        this.group.append('path')
            .attr('class', 'fib-wedge-hitbox')
            .attr('d', wedgeBodyPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        const midAngle = sweepFlag === 1 ? (a1 + delta / 2) : (a1 - delta / 2);

        // Draw arcs + labels (keyed by row index, not ratio value)
        this.levels.forEach((levelObj, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : 1;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

            const r = baseRadius * parseFloat(level);
            if (!isFinite(r) || r <= 0) return;

            const start = polar(a1, r);
            const end = polar(a2, r);
            const arcD = `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;

            const scaledWidth = Math.max(0.5, (lineWidth || 1) * scaleFactor);
            const hitWidth = Math.max(10, scaledWidth * 6);

            this.group.append('path')
                .attr('class', 'fib-level-hit')
                .attr('data-fib-wedge-idx', idx)
                .attr('data-fib-wedge-level', level)
                .attr('d', arcD)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('data-fib-wedge-idx', idx)
                .attr('data-fib-wedge-level', level)
                .attr('d', arcD)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const pos = normalizeFibLevelsLabelPosition(this.style);
            const labelT = pos === 'left' ? 0.35 : pos === 'center' ? 0.65 : 0.92;
            const labelR = Math.max(0, r * labelT);
            const lp = polar(midAngle, labelR);
            if (showLevelValues) {
                this.group.append('text')
                    .attr('data-fib-wedge-label-idx', idx)
                    .attr('x', lp.x)
                    .attr('y', lp.y)
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .attr('text-anchor', fibPointTextAnchor(this.style))
                    .style('pointer-events', 'none')
                    .text(BaseDrawing.formatFibLevelLabel(this.style, level, {
                        price: scales.yScale && typeof scales.yScale.invert === 'function' ? scales.yScale.invert(lp.y) : null,
                        priceDecimals,
                    }));
            }
        });

        // Outer boundary arc — only when at least one level is on (skip if level 1 arc already drawn).
        const levelOneEnabled = this.levels.some((levelObj, idx) => {
            if (!BaseDrawing.fibLevelRowVisible(levelObj)) return false;
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            return Math.abs(parseFloat(level) - 1) < 1e-6;
        });
        if (enabledLevelsSorted.length > 0 && !levelOneEnabled) {
            this.group.append('path')
                .attr('data-fib-wedge-boundary', '1')
                .attr('d', `M ${p2.x} ${p2.y} A ${baseRadius} ${baseRadius} 0 ${largeArcFlag} ${sweepFlag} ${p3.x} ${p3.y}`)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', boundaryWidth)
                .attr('fill', 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        if (this.points.length >= 3) {
            this.virtualPoints = [
                this.points[0],
                this.points[1],
                { x: toDataX(p3.x), y: toDataY(p3.y) }
            ];
        } else {
            this.virtualPoints = null;
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    /** Pixel layout for wedge body hit tests (matches `render`). */
    getPixelLayout(scales) {
        if (!this.points || this.points.length < 3 || !scales) return null;

        const getX = (p) => scales.chart?.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const cx = getX(this.points[0]);
        const cy = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);
        const x3 = getX(this.points[2]);
        const y3 = getY(this.points[2]);

        const baseRadius = Math.hypot(x2 - cx, y2 - cy);
        if (!baseRadius || !Number.isFinite(baseRadius)) return null;

        const a1 = Math.atan2(y2 - cy, x2 - cx);
        const a2 = Math.atan2(y3 - cy, x3 - cx);

        const twoPi = Math.PI * 2;
        const deltaCW = (a2 - a1 + twoPi) % twoPi;
        const deltaCCW = (a1 - a2 + twoPi) % twoPi;
        const sweepFlag = (deltaCW <= deltaCCW) ? 1 : 0;
        const delta = (sweepFlag === 1) ? deltaCW : deltaCCW;

        return { cx, cy, baseRadius, a1, a2, sweepFlag, delta };
    }

    /** True when pointer is inside the wedge sector (whole-tool move, not level drag). */
    isPointInsideBody(mouseX, mouseY, scales) {
        const layout = this.getPixelLayout(scales);
        if (!layout) return false;

        const { cx, cy, baseRadius, a1, sweepFlag, delta } = layout;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > baseRadius + 8) return false;

        const ang = Math.atan2(dy, dx);
        const twoPi = Math.PI * 2;
        if (sweepFlag === 1) {
            const na = (ang - a1 + twoPi) % twoPi;
            return na <= delta + 0.05;
        }
        const na = (a1 - ang + twoPi) % twoPi;
        return na <= delta + 0.05;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibWedgeTool(data.points, data.style);
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
// Andrews' Pitchfork Tool
// ============================================================================
class PitchforkTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('pitchfork', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'none';
        this.style.medianColor = style.medianColor || '#e91e63';
        this.style.innerFill = style.innerFill || 'rgba(76, 175, 80, 0.2)';
        this.style.outerFill = style.outerFill || 'rgba(41, 98, 255, 0.2)';
        this.style.pitchforkStyle = style.pitchforkStyle || 'original'; // 'original', 'schiff', 'modified-schiff', 'inside'
        if (style.extendLeft === undefined) this.style.extendLeft = false;
        if (style.extendRight === undefined) this.style.extendRight = true;
        if (this.style.extendRight === false && this.style.extendLeft !== true) {
            this.style.extendRight = true;
        }
        // Default pitchfork levels
        this.levels = style.levels || [
            { value: 0.25, label: '0.25', color: '#cd853f', enabled: false },
            { value: 0.382, label: '0.382', color: '#90ee90', enabled: false },
            { value: 0.5, label: '0.5', color: '#00bcd4', enabled: true },
            { value: 0.618, label: '0.618', color: '#5f9ea0', enabled: false },
            { value: 0.75, label: '0.75', color: '#5f9ea0', enabled: false },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
            { value: 1.5, label: '1.5', color: '#9370db', enabled: false },
            { value: 1.75, label: '1.75', color: '#db7093', enabled: false }
        ];
    }

    /** Keep levels sorted by value so each input row maps to one chart line. */
    _normalizeLevels() {
        if (!Array.isArray(this.levels)) {
            this.levels = [];
            return;
        }
        this.levels = this.levels
            .filter((lv) => lv && Number.isFinite(parseFloat(lv.value)))
            .sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
    }

    onPointHandleDrag(index, context = {}) {
        const { point } = context;
        if (!point) return false;
        if (index === 3) {
            return this.handleCustomHandleDrag(3, {
                ...context,
                dataPoint: point,
                pointIndex: 3,
            });
        }
        if (index === 0 && this.points.length >= 2) {
            const dx = point.x - this.points[0].x;
            const dy = point.y - this.points[0].y;
            this.points = this.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            if (this.meta) this.meta.updatedAt = Date.now();
            return true;
        }
        return false;
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex, scales } = context;
        if (!dataPoint) return false;

        const index = (pointIndex === undefined || pointIndex === null)
            ? (typeof handleRole === 'number' ? handleRole : parseInt(handleRole, 10))
            : pointIndex;
        if (index !== 3 || !this.points || this.points.length < 3) return false;

        const p2 = this.points[1];
        const p3 = this.points[2];

        if (scales && scales.yScale && context.screen && context.screen.x != null && context.screen.y != null) {
            const getX = (p) => scales.chart?.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p.x)
                : scales.xScale(p.x);
            const getY = (p) => scales.yScale(p.y);

            const x2px = getX(p2);
            const y2px = getY(p2);
            const x3px = getX(p3);
            const y3px = getY(p3);
            const midXpx = (x2px + x3px) / 2;
            const midYpx = (y2px + y3px) / 2;
            const pixelDx = context.screen.x - midXpx;
            const pixelDy = context.screen.y - midYpx;

            const xToData = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
                ? scales.chart.pixelToDataIndex(px)
                : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : p2.x);
            const yToData = (py) => (typeof scales.yScale.invert === 'function')
                ? scales.yScale.invert(py)
                : p2.y;

            this.points[1] = { x: xToData(x2px + pixelDx), y: yToData(y2px + pixelDy) };
            this.points[2] = { x: xToData(x3px + pixelDx), y: yToData(y3px + pixelDy) };
        } else {
            const midX = (p2.x + p3.x) / 2;
            const midY = (p2.y + p3.y) / 2;
            const dx = dataPoint.x - midX;
            const dy = dataPoint.y - midY;
            this.points[1] = { x: p2.x + dx, y: p2.y + dy };
            this.points[2] = { x: p3.x + dx, y: p3.y + dy };
        }

        if (this.meta) this.meta.updatedAt = Date.now();
        return true;
    }

    /** Pixel layout for level-value drag (matches `render`). */
    getPixelLayout(scales) {
        if (!this.points || this.points.length < 3 || !scales) return null;

        const getX = (p) => scales.chart?.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const ax = getX(this.points[0]);
        const ay = getY(this.points[0]);
        const bx = getX(this.points[1]);
        const by = getY(this.points[1]);
        const cx = getX(this.points[2]);
        const cy = getY(this.points[2]);
        const midX = (bx + cx) / 2;
        const midY = (by + cy) / 2;

        let pivotX = ax;
        let pivotY = ay;
        let medianTargetX = midX;
        let medianTargetY = midY;
        const style = this.style.pitchforkStyle || 'original';
        if (style === 'schiff') {
            pivotX = (ax + bx) / 2;
            pivotY = (ay + by) / 2;
        } else if (style === 'modified-schiff') {
            pivotX = (ax + midX) / 2;
            pivotY = (ay + midY) / 2;
        } else if (style === 'inside') {
            pivotX = (ax + bx) / 2;
            pivotY = (ay + by) / 2;
            medianTargetX = cx;
            medianTargetY = cy;
        }

        const isOriginal = style === 'original' || !style;
        const medianLineStartX = isOriginal ? midX : pivotX;
        const medianLineStartY = isOriginal ? midY : pivotY;

        return {
            ax, ay, bx, by, cx, cy,
            midX, midY,
            pivotX, pivotY,
            medianLineStartX, medianLineStartY,
            medianTargetX, medianTargetY,
            isOriginal,
        };
    }

    /**
     * Map pointer to pitchfork level ratio (0 = median anchor, 1 = B/C rail).
     * @returns {number|null}
     */
    levelValueFromPointer(side, levelValue, mouseX, mouseY, scales) {
        const layout = this.getPixelLayout(scales);
        if (!layout || !side) return null;

        const { midX, midY, bx, by, cx, cy } = layout;
        const isLower = side === 'lower';
        const railX = isLower ? bx : cx;
        const railY = isLower ? by : cy;
        const spanX = railX - midX;
        const spanY = railY - midY;
        const spanLen2 = spanX * spanX + spanY * spanY;
        if (spanLen2 < 1e-6) return null;

        const t = ((mouseX - midX) * spanX + (mouseY - midY) * spanY) / spanLen2;
        const clamped = Math.max(0.001, Math.min(8, t));
        if (Math.abs(levelValue - 1) < 1e-6) return 1;
        return clamped;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        this._normalizeLevels();
        this._prepareRenderGroup(container, 'drawing pitchfork', renderOpts);
        this._clearDrawingLabels(scales);
        this.group.style('pointer-events', 'none')
            .style('cursor', 'default')
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        // Point A (apex/pivot), Point B (left swing), Point C (right swing)
        const ax = getX(this.points[0]);
        const ay = getY(this.points[0]);
        const bx = getX(this.points[1]);
        const by = getY(this.points[1]);

        if (this.points.length === 2) {
            // Preview: draw line from A to B
            this.group.append('line')
                .attr('x1', ax).attr('y1', ay)
                .attr('x2', bx).attr('y2', by)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth);
            return this.group;
        }

        const cx = getX(this.points[2]);
        const cy = getY(this.points[2]);

        // Calculate pivot and median points based on pitchfork style
        // Based on TradingView implementation
        let pivotX, pivotY, medianTargetX, medianTargetY;
        
        const midBC_X = (bx + cx) / 2;
        const midBC_Y = (by + cy) / 2;
        
        switch (this.style.pitchforkStyle) {
            case 'schiff':
                // Schiff: Pivot is at midpoint of A-B
                // The median line goes from this midpoint through the midpoint of B-C
                pivotX = (ax + bx) / 2;
                pivotY = (ay + by) / 2;
                medianTargetX = midBC_X;
                medianTargetY = midBC_Y;
                break;
            case 'modified-schiff':
                // Modified Schiff: Pivot is midpoint between A and midpoint(B,C)
                // The median line goes from this point through the midpoint of B-C
                pivotX = (ax + midBC_X) / 2;
                pivotY = (ay + midBC_Y) / 2;
                medianTargetX = midBC_X;
                medianTargetY = midBC_Y;
                break;
            case 'inside':
                // Inside: Start point is midpoint of A-B
                // The median line goes from this midpoint through C
                pivotX = (ax + bx) / 2;
                pivotY = (ay + by) / 2;
                medianTargetX = cx;
                medianTargetY = cy;
                break;
            case 'original':
            default:
                // Original Andrews: Start point is A
                // The median line goes from A through the midpoint of B-C
                pivotX = ax;
                pivotY = ay;
                medianTargetX = midBC_X;
                medianTargetY = midBC_Y;
                break;
        }

        // Get chart bounds using xScale.range()
        const xRange = scales.xScale.range();
        const leftEdge = xRange[0];
        const rightEdge = xRange[1];
        const yRange = scales.yScale.range();
        const topEdge = Math.min(...yRange);
        const bottomEdge = Math.max(...yRange);
        const clampY = (v) => Math.min(bottomEdge, Math.max(topEdge, v));
        // IMPORTANT: do NOT clamp finite coordinates during normal rendering.
        // Pitchfork lines often extend beyond the visible chart; the clip-path will hide them.
        // Clamping causes the pitchfork to distort/collapse while dragging.
        const safeX = (v) => Number.isFinite(v) ? v : leftEdge;
        const safeY = (v) => Number.isFinite(v) ? v : topEdge;

        const plotLeft = Math.min(leftEdge, rightEdge);
        const plotRight = Math.max(leftEdge, rightEdge);
        const plotTop = topEdge;
        const plotBottom = bottomEdge;

        const extendLeft = this.style.extendLeft === true;
        const extendForward = true;
        const forkSpanX = medianTargetX - pivotX;
        const forkSpanY = medianTargetY - pivotY;

        /** Intersect ray (ox,oy)+t*(dx,dy) with plot bounds; pick farthest forward hit (extend) or t=1 (finite). */
        const resolveLineSegment = (sx, sy) => {
            const dx = forkSpanX;
            const dy = forkSpanY;
            let x1 = sx;
            let y1 = sy;
            let tEnd = 1;

            if (extendForward) {
                const hits = [];
                if (Math.abs(dx) > 1e-9) {
                    hits.push((plotRight - sx) / dx, (plotLeft - sx) / dx);
                }
                if (Math.abs(dy) > 1e-9) {
                    hits.push((plotBottom - sy) / dy, (plotTop - sy) / dy);
                }
                const forward = hits.filter((t) => Number.isFinite(t) && t >= 0);
                if (forward.length) tEnd = Math.max(...forward);
            }

            if (extendLeft) {
                const hits = [];
                if (Math.abs(dx) > 1e-9) {
                    hits.push((plotLeft - sx) / dx, (plotRight - sx) / dx);
                }
                if (Math.abs(dy) > 1e-9) {
                    hits.push((plotTop - sy) / dy, (plotBottom - sy) / dy);
                }
                const backward = hits.filter((t) => Number.isFinite(t) && t <= 0);
                if (backward.length) {
                    const tStart = Math.min(...backward);
                    x1 = sx + dx * tStart;
                    y1 = sy + dy * tStart;
                }
            }

            return {
                x1,
                y1,
                x2: sx + dx * tEnd,
                y2: sy + dy * tEnd,
            };
        };

        const segmentEnd = (sx, sy) => resolveLineSegment(sx, sy);

        const appendPitchforkLine = (x1, y1, x2, y2, opts = {}) => {
            const stroke = opts.stroke || this.style.stroke;
            const sw = Math.max(0.5, Number(opts.strokeWidth ?? this.style.strokeWidth) || 1);
            const dash = opts.strokeDasharray != null ? opts.strokeDasharray : '';
            const hitClass = opts.hitClass === false || opts.hitClass === '' ? null : (opts.hitClass || 'pitchfork-level-hit');
            const visClass = opts.visClass || 'pitchfork-level';
            const hitW = Math.max(10, sw * 6);
            if (hitClass) {
                const hitLine = this.group.append('line')
                    .attr('class', hitClass)
                    .attr('x1', x1).attr('y1', y1)
                    .attr('x2', x2).attr('y2', y2)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitW)
                    .attr('stroke-dasharray', dash || null)
                    .style('pointer-events', 'stroke')
                    .style('cursor', opts.cursor || 'move');
                if (opts.dataPfLevelValue != null) {
                    hitLine.attr('data-pf-level-value', String(opts.dataPfLevelValue));
                }
                if (opts.dataPfSide) hitLine.attr('data-pf-side', opts.dataPfSide);
                if (opts.dataPfAnchor) hitLine.attr('data-pf-anchor', opts.dataPfAnchor);
            }
            this.group.append('line')
                .attr('class', visClass)
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', stroke)
                .attr('stroke-width', sw)
                .attr('stroke-dasharray', dash || null)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        };

        // Calculate median slope - all parallel lines use this slope
        const medianSlopeDenom = forkSpanX;
        const medianSlope = Math.abs(medianSlopeDenom) < 1e-9 ? 0 : forkSpanY / medianSlopeDenom;

        // Calculate all level lines first (both upper and lower)
        const levelLines = [];
        const defaultLevelWidth = this.style.strokeWidth || 2;
        const levelStrokeProps = (level) => {
            const baseWidth = (level.lineWidth != null && !isNaN(parseInt(level.lineWidth, 10)))
                ? parseInt(level.lineWidth, 10)
                : defaultLevelWidth;
            const baseType = (level.lineType != null) ? `${level.lineType}` : '';
            return {
                strokeWidth: baseWidth,
                strokeDasharray: baseType,
            };
        };
        
        // Keep midX and midY for level calculations (midpoint of B and C)
        const midX = midBC_X;
        const midY = midBC_Y;
        
        const isOriginal = this.style.pitchforkStyle === 'original' || !this.style.pitchforkStyle;
        const isInside = this.style.pitchforkStyle === 'inside';
        const medianLineStartX = isOriginal ? midX : pivotX;
        const medianLineStartY = isOriginal ? midY : pivotY;
        const medianLineSeg = segmentEnd(medianLineStartX, medianLineStartY);
        
        // Add median as level 0 (for fill band ordering)
        levelLines.push({
            value: 0,
            startX: medianLineStartX,
            startY: medianLineStartY,
            endX: medianLineSeg.x2,
            endY: medianLineSeg.y2,
            color: this.style.medianColor,
            isMedian: true,
            strokeWidth: this.style.strokeWidth
        });
        
        // Add enabled levels on both sides - parallel to median
        
        this.levels.forEach(level => {
            if (!level.enabled) return;
            const { strokeWidth: levelWidth, strokeDasharray: levelDash } = levelStrokeProps(level);
            
            // For level 1.0, draw boundary lines from B and C
            if (level.value === 1) {
                if (isOriginal) {
                    // Original: lines start from B and C
                    const lowerSeg = segmentEnd(bx, by);
                    levelLines.push({
                        value: -level.value,
                        startX: bx,
                        startY: by,
                        endX: lowerSeg.x2,
                        endY: lowerSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                    
                    const upperSeg = segmentEnd(cx, cy);
                    levelLines.push({
                        value: level.value,
                        startX: cx,
                        startY: cy,
                        endX: upperSeg.x2,
                        endY: upperSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                } else {
                    // Schiff variants: lines are parallel to median and pass through B and C
                    const lowerSeg = segmentEnd(bx, by);
                    levelLines.push({
                        value: -level.value,
                        startX: bx,
                        startY: by,
                        endX: lowerSeg.x2,
                        endY: lowerSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                    
                    const upperSeg = segmentEnd(cx, cy);
                    levelLines.push({
                        value: level.value,
                        startX: cx,
                        startY: cy,
                        endX: upperSeg.x2,
                        endY: upperSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                }
            } else {
                // For other levels (0.5, etc.), interpolate FROM median TOWARDS boundary
                if (isOriginal) {
                    // Original: interpolate from midBC towards B/C
                    const lowerStartX = midX + (bx - midX) * level.value;
                    const lowerStartY = midY + (by - midY) * level.value;
                    const lowerSeg = segmentEnd(lowerStartX, lowerStartY);
                    
                    levelLines.push({
                        value: -level.value,
                        startX: lowerStartX,
                        startY: lowerStartY,
                        endX: lowerSeg.x2,
                        endY: lowerSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                    
                    const upperStartX = midX + (cx - midX) * level.value;
                    const upperStartY = midY + (cy - midY) * level.value;
                    const upperSeg = segmentEnd(upperStartX, upperStartY);
                    
                    levelLines.push({
                        value: level.value,
                        startX: upperStartX,
                        startY: upperStartY,
                        endX: upperSeg.x2,
                        endY: upperSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                } else {
                    // Schiff/Modified Schiff/Inside: interpolate from midBC towards B/C, lines are parallel
                    const lowerStartX = midX + (bx - midX) * level.value;
                    const lowerStartY = midY + (by - midY) * level.value;
                    const lowerSeg = segmentEnd(lowerStartX, lowerStartY);
                    
                    levelLines.push({
                        value: -level.value,
                        startX: lowerStartX,
                        startY: lowerStartY,
                        endX: lowerSeg.x2,
                        endY: lowerSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                    
                    const upperStartX = midX + (cx - midX) * level.value;
                    const upperStartY = midY + (cy - midY) * level.value;
                    const upperSeg = segmentEnd(upperStartX, upperStartY);
                    
                    levelLines.push({
                        value: level.value,
                        startX: upperStartX,
                        startY: upperStartY,
                        endX: upperSeg.x2,
                        endY: upperSeg.y2,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: levelWidth,
                        strokeDasharray: levelDash,
                        levelValue: level.value
                    });
                }
            }
        });
        
        // Sort level lines by their Y position at midX
        levelLines.sort((a, b) => {
            const denomA = (a.endX - a.startX);
            const slopeA = Math.abs(denomA) < 1e-9 ? 0 : ((a.endY - a.startY) / denomA);
            const yAtMidA = a.startY + slopeA * (midX - a.startX);
            const denomB = (b.endX - b.startX);
            const slopeB = Math.abs(denomB) < 1e-9 ? 0 : ((b.endY - b.startY) / denomB);
            const yAtMidB = b.startY + slopeB * (midX - b.startX);
            return yAtMidA - yAtMidB;
        });
        
        // Draw fills between consecutive level lines using each level's color
        const bgEnabled = this.style.backgroundEnabled !== false;
        const bgOpacity = this.style.backgroundOpacity ?? 0.2;
        const bgTint = this.style.backgroundColor;
        
        if (bgEnabled) {
            for (let i = 0; i < levelLines.length - 1; i++) {
                const line1 = levelLines[i];
                const line2 = levelLines[i + 1];
                
                // Use the outer line's color (the one further from median, or non-median line) with transparency
                let outerLine;
                if (line1.isMedian) {
                    outerLine = line2;
                } else if (line2.isMedian) {
                    outerLine = line1;
                } else {
                    outerLine = Math.abs(line1.value) > Math.abs(line2.value) ? line1 : line2;
                }
                const baseColor = (bgTint && String(bgTint).trim() !== '') ? bgTint : (outerLine.color || '#ffffff');
                
                // Convert color to rgba with user-defined opacity
                let fillColor;
                if (baseColor.startsWith('rgba')) {
                    fillColor = baseColor.replace(/[\d.]+\)$/, `${bgOpacity})`);
                } else if (baseColor.startsWith('rgb')) {
                    fillColor = baseColor.replace('rgb', 'rgba').replace(')', `, ${bgOpacity})`);
                } else if (baseColor.startsWith('#')) {
                    const hex = baseColor.slice(1);
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    fillColor = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
                } else {
                    fillColor = `rgba(255, 255, 255, ${bgOpacity})`;
                }
                
                // Use actual start points of level lines (on B-C edge)
                // For median line, use midBC point instead of pivot to avoid triangular extension
                const start1X = line1.isMedian ? midX : line1.startX;
                const start1Y = line1.isMedian ? midY : line1.startY;
                const start2X = line2.isMedian ? midX : line2.startX;
                const start2Y = line2.isMedian ? midY : line2.startY;
                const seg1 = segmentEnd(start1X, start1Y);
                const seg2 = segmentEnd(start2X, start2Y);
                
                this.group.append('polygon')
                    .attr('class', 'shape-fill')
                    .attr('points', `${safeX(start1X)},${safeY(start1Y)} ${safeX(seg1.x2)},${safeY(seg1.y2)} ${safeX(seg2.x2)},${safeY(seg2.y2)} ${safeX(start2X)},${safeY(start2Y)}`)
                    .attr('fill', fillColor)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
            }
        }

        const middleLineEnabled = this.style.lineEnabled !== false;
        const medianStrokeWidth = this.style.medianStrokeWidth ?? this.style.strokeWidth;
        const medianStrokeDasharray =
            this.style.medianStrokeDasharray != null
                ? this.style.medianStrokeDasharray
                : (this.style.strokeDasharray || '');

        const handleOpts = {
            stroke: this.style.medianColor,
            strokeWidth: medianStrokeWidth,
            strokeDasharray: medianStrokeDasharray,
            hitClass: 'pitchfork-handle-hit pitchfork-level-hit',
            visClass: 'pitchfork-handle',
        };
        const tineOpts = {
            stroke: this.style.medianColor,
            strokeWidth: medianStrokeWidth,
            strokeDasharray: medianStrokeDasharray,
        };

        // Base connector along the B–C edge — always visible; spans every enabled level anchor.
        const baseAnchorPoints = [{ x: bx, y: by }, { x: cx, y: cy }];
        levelLines.forEach((line) => {
            if (line.isMedian) return;
            baseAnchorPoints.push({ x: line.startX, y: line.startY });
        });
        const baseDirX = cx - bx;
        const baseDirY = cy - by;
        const baseLen2 = baseDirX * baseDirX + baseDirY * baseDirY || 1;
        const baseParam = (p) => ((p.x - bx) * baseDirX + (p.y - by) * baseDirY) / baseLen2;
        let minP = baseAnchorPoints[0];
        let maxP = baseAnchorPoints[0];
        let minT = baseParam(minP);
        let maxT = minT;
        baseAnchorPoints.forEach((p) => {
            const t = baseParam(p);
            if (t < minT) { minT = t; minP = p; }
            if (t > maxT) { maxT = t; maxP = p; }
        });
        appendPitchforkLine(minP.x, minP.y, maxP.x, maxP.y, {
            stroke: this.style.medianColor,
            strokeWidth: medianStrokeWidth,
            strokeDasharray: medianStrokeDasharray,
            hitClass: false,
            visClass: 'pitchfork-handle pitchfork-base-line',
        });

        if (middleLineEnabled) {
            // Apex construction — median tine toggles independently of the base connector.
            if (this.style.pitchforkStyle === 'schiff') {
                appendPitchforkLine(ax, ay, bx, by, handleOpts);
            } else if (this.style.pitchforkStyle === 'modified-schiff' || this.style.pitchforkStyle === 'inside') {
                appendPitchforkLine(ax, ay, bx, by, handleOpts);
            } else {
                appendPitchforkLine(ax, ay, midX, midY, handleOpts);
            }

            const medianSeg = medianLineSeg;
            appendPitchforkLine(medianSeg.x1, medianSeg.y1, medianSeg.x2, medianSeg.y2, tineOpts);
        }

        // Draw all level lines
        levelLines.forEach(line => {
            if (line.isMedian) return; // Skip median, already drawn
            const seg = resolveLineSegment(line.startX, line.startY);
            const lvVal = line.levelValue != null ? line.levelValue : Math.abs(line.value);
            const side = line.value < 0 ? 'lower' : 'upper';
            const anchor = Math.abs(lvVal - 1) < 1e-6 ? (line.value < 0 ? 'b' : 'c') : null;
            appendPitchforkLine(seg.x1, seg.y1, seg.x2, seg.y2, {
                stroke: line.color,
                strokeWidth: line.strokeWidth || defaultLevelWidth,
                strokeDasharray: line.strokeDasharray || '',
                dataPfLevelValue: lvVal,
                dataPfSide: side,
                dataPfAnchor: anchor,
            });
        });

        if (this.points.length >= 3) {
            const p2d = this.points[1];
            const p3d = this.points[2];
            const x2px = getX(p2d);
            const y2px = getY(p2d);
            const x3px = getX(p3d);
            const y3px = getY(p3d);
            const midXpx = (x2px + x3px) / 2;
            const midYpx = (y2px + y3px) / 2;
            const midXdata = (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
                ? scales.chart.pixelToDataIndex(midXpx)
                : (scales.xScale && typeof scales.xScale.invert === 'function'
                    ? scales.xScale.invert(midXpx)
                    : (p2d.x + p3d.x) / 2);
            const midYdata = (scales.yScale && typeof scales.yScale.invert === 'function')
                ? scales.yScale.invert(midYpx)
                : (p2d.y + p3d.y) / 2;
            this.virtualPoints = [
                this.points[0],
                this.points[1],
                this.points[2],
                { x: midXdata, y: midYdata },
            ];
        } else {
            this.virtualPoints = null;
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            levels: this.levels,
            visible: this.visible,
            meta: this.meta
        };
    }

    static fromJSON(data, chart = null) {
        const tool = new PitchforkTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        if (data.levels) tool.levels = data.levels;
        if (tool.style.extendRight === false && tool.style.extendLeft !== true) {
            tool.style.extendRight = true;
        }
        return tool;
    }
}

// ============================================================================
// Pitchfan Tool (Andrews' Pitchfork Fan)
// ============================================================================
class PitchfanTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('pitchfan', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.medianColor = style.medianColor || '#e91e63';
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.2;
        if (this.style.showZones === undefined) this.style.showZones = true;
        this.levels = style.levels || [
            { value: 0.25, label: '0.25', color: '#cd853f', enabled: false },
            { value: 0.382, label: '0.382', color: '#90ee90', enabled: false },
            { value: 0.5, label: '0.5', color: '#00bcd4', enabled: true },
            { value: 0.618, label: '0.618', color: '#5f9ea0', enabled: false },
            { value: 0.75, label: '0.75', color: '#5f9ea0', enabled: false },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
            { value: 1.5, label: '1.5', color: '#9370db', enabled: false },
            { value: 1.75, label: '1.75', color: '#db7093', enabled: false }
        ];
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex, scales } = context;
        if (!dataPoint) return false;

        const index = (pointIndex === undefined || pointIndex === null)
            ? (typeof handleRole === 'number' ? handleRole : parseInt(handleRole))
            : pointIndex;

        if (isNaN(index)) return false;

        // Midpoint handle (virtual index 3): translate point2 + point3 together.
        if (index === 3 && this.points && this.points.length >= 3) {
            const p2 = this.points[1];
            const p3 = this.points[2];

            if (scales && scales.yScale && context.screen && context.screen.x != null && context.screen.y != null) {
                const getX = (p) => scales.chart?.dataIndexToPixel
                    ? scales.chart.dataIndexToPixel(p.x)
                    : scales.xScale(p.x);
                const getY = (p) => scales.yScale(p.y);

                const x2px = getX(p2);
                const y2px = getY(p2);
                const x3px = getX(p3);
                const y3px = getY(p3);

                const midXpx = (x2px + x3px) / 2;
                const midYpx = (y2px + y3px) / 2;

                const pixelDx = context.screen.x - midXpx;
                const pixelDy = context.screen.y - midYpx;

                const xToData = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
                    ? scales.chart.pixelToDataIndex(px)
                    : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : p2.x);
                const yToData = (py) => (typeof scales.yScale.invert === 'function')
                    ? scales.yScale.invert(py)
                    : p2.y;

                const newP2 = { x: xToData(x2px + pixelDx), y: yToData(y2px + pixelDy) };
                const newP3 = { x: xToData(x3px + pixelDx), y: yToData(y3px + pixelDy) };

                this.points[1] = newP2;
                this.points[2] = newP3;
            } else {
                const midX = (p2.x + p3.x) / 2;
                const midY = (p2.y + p3.y) / 2;
                const dx = dataPoint.x - midX;
                const dy = dataPoint.y - midY;

                this.points[1] = { x: p2.x + dx, y: p2.y + dy };
                this.points[2] = { x: p3.x + dx, y: p3.y + dy };
            }

            this.meta.updatedAt = Date.now();
            return true;
        }

        // Default point handle drag for indices 0..2
        if (!this.points || index < 0 || index >= this.points.length) return false;
        this.points[index] = { x: dataPoint.x, y: dataPoint.y };
        this.meta.updatedAt = Date.now();
        return true;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this._prepareRenderGroup(container, 'drawing pitchfan', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const scaledMedianWidth = Math.max(0.5, (this.style.strokeWidth || 2) * scaleFactor);

        if (this.points.length === 2) {
            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', this.style.medianColor || this.style.stroke)
                .attr('stroke-width', scaledMedianWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
            return this.group;
        }

        const x3 = getX(this.points[2]);
        const y3 = getY(this.points[2]);

        this.group.append('line')
            .attr('x1', x2).attr('y1', y2)
            .attr('x2', x3).attr('y2', y3)
            .attr('stroke', this.style.medianColor || this.style.stroke)
            .attr('stroke-width', scaledMedianWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || 'none')
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const midX = (x2 + x3) / 2;
        const midY = (y2 + y3) / 2;

        const xRange = scales.xScale.range();
        const rightEdge = xRange[1];

        const extendToRight = (sx, sy, tx, ty) => {
            if (tx === sx) return { x: rightEdge, y: ty };
            const slope = (ty - sy) / (tx - sx);
            return { x: rightEdge, y: ty + slope * (rightEdge - tx) };
        };

        const medianEnd = extendToRight(x1, y1, midX, midY);
        const medianSlope = (midY - y1) / (midX - x1);

        const projectedY2 = y2 + medianSlope * (midX - x2);
        const projectedY3 = y3 + medianSlope * (midX - x3);
        const distToSide2 = projectedY2 - midY;
        const distToSide3 = projectedY3 - midY;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.2;
        const showZones = this.style.showZones !== false;

        const hexToRgba = (hex, alpha) => {
            if (!hex || typeof hex !== 'string') return `rgba(41, 98, 255, ${alpha})`;
            let h = hex.trim();
            if (h.startsWith('rgba(')) {
                return h.replace(/([\d.]+)\s*\)\s*$/, `${alpha})`);
            }
            if (h.startsWith('rgb(')) {
                return h.replace('rgb(', 'rgba(').replace(/\)\s*$/, `, ${alpha})`);
            }
            if (h[0] === '#') h = h.slice(1);
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            if (h.length !== 6) return `rgba(41, 98, 255, ${alpha})`;
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const rays = [];

        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', medianEnd.x).attr('y2', medianEnd.y)
            .attr('stroke', this.style.medianColor || this.style.stroke)
            .attr('stroke-width', scaledMedianWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || 'none')
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        rays.push({ endX: medianEnd.x, endY: medianEnd.y, color: this.style.medianColor || this.style.stroke });

        this.levels.forEach(level => {
            if (!level || level.enabled === false) return;
            const v = typeof level.value === 'number' ? level.value : parseFloat(level.value);
            if (!isFinite(v)) return;

            const color = level.color || this.style.stroke;
            const baseWidth = level.lineWidth != null ? level.lineWidth : 1;
            const scaledWidth = Math.max(0.5, baseWidth * scaleFactor);

            const yAtSide2 = midY + distToSide2 * v;
            const yAtSide3 = midY + distToSide3 * v;

            const end2 = extendToRight(x1, y1, midX, yAtSide2);
            const end3 = extendToRight(x1, y1, midX, yAtSide3);

            rays.push({ endX: end2.x, endY: end2.y, color });
            rays.push({ endX: end3.x, endY: end3.y, color });

            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', end2.x).attr('y2', end2.y)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', end3.x).attr('y2', end3.y)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        });

        if (showZones && rays.length >= 2) {
            const withAngles = rays
                .map(r => ({
                    ...r,
                    angle: Math.atan2(r.endY - y1, r.endX - x1)
                }))
                .sort((a, b) => a.angle - b.angle);

            for (let i = 0; i < withAngles.length - 1; i++) {
                const r1 = withAngles[i];
                const r2 = withAngles[i + 1];
                const fill = hexToRgba(r2.color || this.style.stroke, zonesOpacity);
                this.group.insert('polygon', ':first-child')
                    .attr('class', 'shape-fill')
                    .attr('points', `${x1},${y1} ${r1.endX},${r1.endY} ${r2.endX},${r2.endY}`)
                    .attr('fill', fill)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
            }
        }

        if (this.points.length >= 3) {
            const p2d = this.points[1];
            const p3d = this.points[2];

            const x2px = getX(p2d);
            const y2px = getY(p2d);
            const x3px = getX(p3d);
            const y3px = getY(p3d);
            const midXpx = (x2px + x3px) / 2;
            const midYpx = (y2px + y3px) / 2;

            const midXdata = (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
                ? scales.chart.pixelToDataIndex(midXpx)
                : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(midXpx) : (p2d.x + p3d.x) / 2);
            const midYdata = (scales.yScale && typeof scales.yScale.invert === 'function')
                ? scales.yScale.invert(midYpx)
                : (p2d.y + p3d.y) / 2;

            this.virtualPoints = [
                this.points[0],
                this.points[1],
                this.points[2],
                { x: midXdata, y: midYdata }
            ];
        } else {
            this.virtualPoints = null;
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new PitchfanTool(data.points, data.style);
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
// Gann Square Fixed Tool
// ============================================================================
class GannSquareFixedTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('gann-square-fixed', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#ff5722';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
    }

    onPointHandleDrag(index, context = {}) {
        const { point, scales } = context;
        if (!point) return false;

        if (index === 0) {
            if (!this.points[0] || !this.points[1]) return false;
            const dx = point.x - this.points[0].x;
            const dy = point.y - this.points[0].y;
            this.points = this.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            return true;
        }

        if (index !== 1) return false;
        if (!this.points[0] || !scales) return false;

        const chart = scales.chart;
        const xScale = scales.xScale;
        const yScale = scales.yScale;
        if (!yScale) return false;

        const toPxX = (p) => (chart && typeof chart.dataIndexToPixel === 'function') ? chart.dataIndexToPixel(p.x) : (xScale ? xScale(p.x) : p.x);
        const toPxY = (p) => yScale(p.y);
        const invPxX = (px) => (chart && typeof chart.pixelToDataIndex === 'function') ? chart.pixelToDataIndex(px) : (xScale && typeof xScale.invert === 'function' ? xScale.invert(px) : px);
        const invPxY = (py) => (yScale && typeof yScale.invert === 'function') ? yScale.invert(py) : py;

        const p0 = this.points[0];
        const p0x = toPxX(p0);
        const p0y = toPxY(p0);
        const p1x = toPxX(point);
        const p1y = toPxY(point);

        const dxPx = p1x - p0x;
        const dyPx = p1y - p0y;
        const sizePx = Math.max(Math.abs(dxPx), Math.abs(dyPx));
        const sx = dxPx === 0 ? 1 : Math.sign(dxPx);
        const sy = dyPx === 0 ? 1 : Math.sign(dyPx);

        const constrainedPxX = p0x + (sx * sizePx);
        const constrainedPxY = p0y + (sy * sizePx);

        this.points[1] = {
            x: invPxX(constrainedPxX),
            y: invPxY(constrainedPxY)
        };
        return true;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing gann-square-fixed', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const scaleFactor = this.getZoomScaleFactor(scales);
        const x0 = getX(this.points[0]);
        const y0 = getY(this.points[0]);
        const x1p = getX(this.points[1]);
        const y1p = getY(this.points[1]);

        const dx = x1p - x0;
        const dy = y1p - y0;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        const sx = dx === 0 ? 1 : Math.sign(dx);
        const sy = dy === 0 ? 1 : Math.sign(dy);

        const xEnd = x0 + (sx * size);
        const yEnd = y0 + (sy * size);
        const left = Math.min(x0, xEnd);
        const top = Math.min(y0, yEnd);

        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;
        const showZones = this.style.showZones !== false;

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

        if (!this.style) this.style = {};

        const ensureLevelArray = (key, defaults) => {
            if (Array.isArray(this.style[key])) return;
            if (Array.isArray(this.style.squareLevels) && this.style.squareLevels.length > 0) {
                this.style[key] = this.style.squareLevels.map(l => ({ ...l }));
                return;
            }
            this.style[key] = defaults.map(l => ({ ...l }));
        };

        ensureLevelArray('gridLevels', defaultGridLevels);
        ensureLevelArray('fanLevels', defaultFanLevels);
        ensureLevelArray('arcLevels', defaultArcLevels);

        const parseLevels = (arr) => (arr || [])
            .map(l => {
                const value = l && l.value != null ? parseFloat(l.value) : NaN;
                return {
                    value: isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN,
                    enabled: l && l.enabled !== false,
                    color: (l && l.color) ? l.color : '#787b86',
                    lineWidth: l && l.lineWidth != null ? parseFloat(l.lineWidth) : null,
                    lineType: l && l.lineType != null ? `${l.lineType}` : null
                };
            })
            .filter(l => isFinite(l.value))
            .sort((a, b) => a.value - b.value);

        const gridAll = parseLevels(this.style.gridLevels);
        const fanAll = parseLevels(this.style.fanLevels);
        const arcAll = parseLevels(this.style.arcLevels);

        const gridEnabled = gridAll.filter(l => l.enabled);
        const fanEnabled = fanAll.filter(l => l.enabled);
        const arcEnabled = arcAll.filter(l => l.enabled);

        const ensureBoundary = (arr, v) => {
            const eps = 1e-9;
            if (!arr.some(x => Math.abs(x.value - v) < eps)) {
                arr.push({ value: v, enabled: true, color: v === 0 ? '#ff9800' : '#2962ff' });
            }
        };
        const zoneLevels = gridEnabled.map(l => ({ ...l }));
        if (zoneLevels.length > 0) {
            ensureBoundary(zoneLevels, 0);
            ensureBoundary(zoneLevels, 1);
            zoneLevels.sort((a, b) => a.value - b.value);
        }

        const globalDash = (this.style.levelsLineDasharray != null && `${this.style.levelsLineDasharray}` !== '' && `${this.style.levelsLineDasharray}` !== 'none')
            ? `${this.style.levelsLineDasharray}`
            : null;
        const globalWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth)))
            ? parseInt(this.style.levelsLineWidth)
            : 1;
        const levelStrokeWidth = Math.max(0.5, globalWidth * scaleFactor);
        const showLevelValues = this.style.levelsEnabled !== false;
        const labelSize = Math.max(9, 12 * scaleFactor);
        const labelOffset = Math.max(6, 10 * scaleFactor);
        const fmtLevel = (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return '';
            return n.toFixed(3).replace(/\.?0+$/, '');
        };

        const toRgba = (color, alpha) => {
            if (!color) return `rgba(120, 123, 134, ${alpha})`;
            const c = String(color).trim();
            if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
                const nums = c.replace(/rgba?\(|\)|\s+/g, '').split(',').map(v => v.trim());
                const r = parseFloat(nums[0]);
                const g = parseFloat(nums[1]);
                const b = parseFloat(nums[2]);
                if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            if (c[0] === '#') {
                let hex = c.slice(1);
                if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
                if (hex.length >= 6) {
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
            }
            return `rgba(120, 123, 134, ${alpha})`;
        };

        const scaledStroke = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);

        // Hitbox (makes selecting the drawing much easier than targeting a thin stroke)
        this.group.append('rect')
            .attr('class', 'gann-square-fixed-hitbox')
            .attr('x', left)
            .attr('y', top)
            .attr('width', size)
            .attr('height', size)
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, 18 * scaleFactor))
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        if (showZones && zoneLevels.length >= 2) {
            for (let i = 0; i < zoneLevels.length - 1; i++) {
                const a = zoneLevels[i];
                const b = zoneLevels[i + 1];
                const xA = left + (size * a.value);
                const xB = left + (size * b.value);
                const x = Math.min(xA, xB);
                const w = Math.abs(xB - xA);
                if (!isFinite(x) || !isFinite(w) || w <= 0) continue;
                this.group.append('rect')
                    .attr('x', x)
                    .attr('y', top)
                    .attr('width', w)
                    .attr('height', size)
                    .attr('fill', toRgba(b.color || a.color || this.style.stroke, zonesOpacity))
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
            }
        }

        // Border square
        this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', size)
            .attr('height', size)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStroke)
            .attr('fill', 'none')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const clampUnitRatio = (raw) => {
            const n = parseFloat(raw);
            if (!Number.isFinite(n)) return NaN;
            return Math.max(0, Math.min(1, n));
        };

        // Grid lines
        const gridRaw = Array.isArray(this.style.gridLevels) ? this.style.gridLevels : [];
        gridRaw.forEach((rawLevel, idx) => {
            const v = clampUnitRatio(rawLevel && rawLevel.value != null ? rawLevel.value : '');
            if (!Number.isFinite(v)) return;
            if (rawLevel && rawLevel.enabled === false) return;
            const offset = size * v;
            const color = (rawLevel && rawLevel.color) ? rawLevel.color : this.style.stroke;
            const w = Math.max(0.5, ((rawLevel.lineWidth != null && isFinite(rawLevel.lineWidth)) ? rawLevel.lineWidth : globalWidth) * scaleFactor);
            const dash = rawLevel.lineType != null && `${rawLevel.lineType}` !== '' ? `${rawLevel.lineType}` : globalDash;

            const hitW = Math.max(10, w * 6);
            const levelMeta = (arrayKey, orient) => ({
                'data-gann-level-array': arrayKey,
                'data-gann-level-index': idx,
                'data-gann-level-orient': orient,
            });

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', left).attr('y1', top + offset)
                .attr('x2', left + size).attr('y2', top + offset)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'ns-resize')
                .attr(levelMeta('gridLevels', 'h'));

            this.group.append('line')
                .attr('x1', left).attr('y1', top + offset)
                .attr('x2', left + size).attr('y2', top + offset)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'none');

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', left + offset).attr('y1', top)
                .attr('x2', left + offset).attr('y2', top + size)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'ew-resize')
                .attr(levelMeta('gridLevels', 'v'));

            this.group.append('line')
                .attr('x1', left + offset).attr('y1', top)
                .attr('x2', left + offset).attr('y2', top + size)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'none');
        });

        if (showLevelValues) {
            gridRaw.forEach((rawLevel) => {
                const v = clampUnitRatio(rawLevel && rawLevel.value != null ? rawLevel.value : '');
                if (!Number.isFinite(v)) return;
                if (rawLevel && rawLevel.enabled === false) return;
                const color = (rawLevel && rawLevel.color) ? rawLevel.color : this.style.stroke;
                const offset = size * v;
                const yH = top + offset;
                const xV = left + offset;
                const txt = fmtLevel(v);

                this.group.append('text')
                    .attr('x', left - labelOffset)
                    .attr('y', yH)
                    .attr('text-anchor', 'end')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', color)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(txt);

                this.group.append('text')
                    .attr('x', left + size + labelOffset)
                    .attr('y', yH)
                    .attr('text-anchor', 'start')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', color)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(txt);

                this.group.append('text')
                    .attr('x', xV)
                    .attr('y', top - labelOffset)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'ideographic')
                    .attr('fill', color)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(txt);

                this.group.append('text')
                    .attr('x', xV)
                    .attr('y', top + size + labelOffset + (labelSize * 0.25))
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'hanging')
                    .attr('fill', color)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(txt);
            });
        }

        // Diagonals
        const diagW = Math.max(0.5, 1.2 * scaleFactor);
        const diagHitW = Math.max(10, diagW * 6);

        this.group.append('line')
            .attr('class', 'gann-level-hit')
            .attr('x1', left).attr('y1', top)
            .attr('x2', left + size).attr('y2', top + size)
            .attr('stroke', 'rgba(255,255,255,0.001)')
            .attr('stroke-width', diagHitW)
            .attr('stroke-dasharray', '')
            .attr('opacity', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left).attr('y1', top)
            .attr('x2', left + size).attr('y2', top + size)
            .attr('stroke', '#00bcd4')
            .attr('stroke-width', diagW)
            .attr('opacity', 0.9);

        this.group.append('line')
            .attr('class', 'gann-level-hit')
            .attr('x1', left + size).attr('y1', top)
            .attr('x2', left).attr('y2', top + size)
            .attr('stroke', 'rgba(255,255,255,0.001)')
            .attr('stroke-width', diagHitW)
            .attr('stroke-dasharray', '')
            .attr('opacity', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left + size).attr('y1', top)
            .attr('x2', left).attr('y2', top + size)
            .attr('stroke', '#4caf50')
            .attr('stroke-width', diagW)
            .attr('opacity', 0.8);

        // Fan lines from anchor corner to opposite edges
        const anchorX = x0;
        const anchorY = y0;
        const fanRaw = Array.isArray(this.style.fanLevels) ? this.style.fanLevels : [];
        fanRaw.forEach((rawLevel, idx) => {
            const v = clampUnitRatio(rawLevel && rawLevel.value != null ? rawLevel.value : '');
            if (!Number.isFinite(v) || v <= 0) return;
            if (rawLevel && rawLevel.enabled === false) return;
            const color = (rawLevel && rawLevel.color) ? rawLevel.color : this.style.stroke;
            const w = Math.max(0.5, ((rawLevel.lineWidth != null && isFinite(rawLevel.lineWidth)) ? rawLevel.lineWidth : globalWidth) * scaleFactor);
            const dash = rawLevel.lineType != null && `${rawLevel.lineType}` !== '' ? `${rawLevel.lineType}` : globalDash;

            const hitW = Math.max(10, w * 6);

            const xOnRightEdge = anchorX + (sx * size);
            const yOnRightEdge = anchorY + (sy * (size * v));
            const xOnBottomEdge = anchorX + (sx * (size * v));
            const yOnBottomEdge = anchorY + (sy * size);

            const levelMeta = (orient) => ({
                'data-gann-level-array': 'fanLevels',
                'data-gann-level-index': idx,
                'data-gann-level-orient': orient,
            });

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnRightEdge).attr('y2', yOnRightEdge)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move')
                .attr(levelMeta('fan-h'));

            this.group.append('line')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnRightEdge).attr('y2', yOnRightEdge)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.8)
                .style('pointer-events', 'none');

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnBottomEdge).attr('y2', yOnBottomEdge)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move')
                .attr(levelMeta('fan-v'));

            this.group.append('line')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnBottomEdge).attr('y2', yOnBottomEdge)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.75)
                .style('pointer-events', 'none');
        });

        // Quarter-circle arcs from anchor corner
        const arcRaw = Array.isArray(this.style.arcLevels) ? this.style.arcLevels : [];
        arcRaw.forEach((rawLevel, idx) => {
            const f = clampUnitRatio(rawLevel && rawLevel.value != null ? rawLevel.value : '');
            if (!Number.isFinite(f) || f < 1e-6) return;
            if (rawLevel && rawLevel.enabled === false) return;
            const r = size * f;
            const color = (rawLevel && rawLevel.color) ? rawLevel.color : this.style.stroke;
            const startX = anchorX + (sx * r);
            const startY = anchorY;
            const endX = anchorX;
            const endY = anchorY + (sy * r);
            const sweep = (sx === 1 && sy === 1) ? 1 : 0;

            const arcW = Math.max(0.5, levelStrokeWidth * 2);

            this.group.append('path')
                .attr('d', `M ${startX} ${startY} A ${r} ${r} 0 0 ${sweep} ${endX} ${endY}`)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', arcW)
                .attr('stroke-dasharray', globalDash || 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');
        });

        // Constrain handle positions to the true rendered corner (virtual point)
        const invX = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
            ? scales.chart.pixelToDataIndex(px)
            : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : px);
        const invY = (py) => (scales.yScale && typeof scales.yScale.invert === 'function')
            ? scales.yScale.invert(py)
            : py;
        this.virtualPoints = [
            this.points[0],
            { x: invX(xEnd), y: invY(yEnd) }
        ];

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    /** Pixel layout for level drag + hit tests (matches `render`). */
    getPixelLayout(scales) {
        if (!this.points || this.points.length < 2 || !scales) return null;
        const getX = (p) => scales.chart?.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);
        const x0 = getX(this.points[0]);
        const y0 = getY(this.points[0]);
        const x1p = getX(this.points[1]);
        const y1p = getY(this.points[1]);
        const dx = x1p - x0;
        const dy = y1p - y0;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        if (!Number.isFinite(size) || size <= 0) return null;
        const sx = dx === 0 ? 1 : Math.sign(dx);
        const sy = dy === 0 ? 1 : Math.sign(dy);
        const left = Math.min(x0, x0 + sx * size);
        const top = Math.min(y0, y0 + sy * size);
        return { left, top, size, sx, sy, anchorX: x0, anchorY: y0 };
    }

    static fromJSON(data, chart = null) {
        const tool = new GannSquareFixedTool(data.points, data.style);
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
// Gann Square Tool
// ============================================================================
class GannSquareTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('gann-square', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 1;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing gann-square', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);
        const width = x2 - x1;
        const height = y2 - y1;

        // Draw rectangle
        this.group.append('rect')
            .attr('x', Math.min(x1, x2))
            .attr('y', Math.min(y1, y2))
            .attr('width', Math.abs(width))
            .attr('height', Math.abs(height))
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('fill', 'rgba(156, 39, 176, 0.05)')
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', Math.min(x1, x2))
            .attr('y', Math.min(y1, y2))
            .attr('width', Math.abs(width))
            .attr('height', Math.abs(height))
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw Gann angles from corner
        const angles = [1, 2, 3, 4, 8]; // 1x1, 1x2, 1x3, 1x4, 1x8
        angles.forEach(angle => {
            const endX = x1 + width;
            const endY = y1 + (width / angle);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', endX).attr('y2', endY)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', 12)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', endX).attr('y2', endY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.6);
        });

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new GannSquareTool(data.points, data.style);
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
// Gann Fan Tool
// ============================================================================
class GannFanTool extends BaseDrawing {
    static defaultFanLevels() {
        return [
            { value: 0.125, label: '1/8', enabled: true, color: '#ff9800' },
            { value: 0.25, label: '1/4', enabled: true, color: '#4caf50' },
            { value: 1 / 3, label: '1/3', enabled: true, color: '#00c853' },
            { value: 0.5, label: '1/2', enabled: true, color: '#00bcd4' },
            { value: 1, label: '1/1', enabled: true, color: '#2962ff' },
            { value: 2, label: '2/1', enabled: true, color: '#9c27b0' },
            { value: 3, label: '3/1', enabled: true, color: '#e91e63' },
            { value: 4, label: '4/1', enabled: true, color: '#f23645' },
            { value: 8, label: '8/1', enabled: true, color: '#b71c1c' }
        ];
    }

    constructor(points = [], style = {}) {
        super('gann-fan', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#4caf50';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;

        const defaultFanLevels = GannFanTool.defaultFanLevels();

        // Back-compat: migrate style.angles (label like 1×8) into style.fanLevels.
        if (!this.style) this.style = {};
        if (!Array.isArray(this.style.fanLevels)) {
            if (Array.isArray(this.style.angles) && this.style.angles.length > 0) {
                this.style.fanLevels = this.style.angles.map(a => {
                    const label = a && a.label ? `${a.label}` : '';
                    let mult = (a && a.ratio != null && isFinite(parseFloat(a.ratio))) ? parseFloat(a.ratio) : 1;
                    if (label.includes('×')) {
                        const parts = label.split('×').map(s => s.trim());
                        const n = parseFloat(parts[0]);
                        const d = parseFloat(parts[1]);
                        if (isFinite(n) && isFinite(d) && d !== 0) mult = n / d;
                    }
                    const mappedLabel = label.includes('×') ? label.replace('×', '/') : (label || '1/1');
                    return {
                        value: mult,
                        label: mappedLabel,
                        enabled: a && a.enabled !== false,
                        color: (a && a.color) ? a.color : (this.style.stroke || '#4caf50')
                    };
                });
            } else {
                this.style.fanLevels = defaultFanLevels.map(l => ({ ...l }));
            }
        }
    }

    static labelForValue(value) {
        const v = parseFloat(value);
        if (!Number.isFinite(v)) return '';
        const map = {
            0.125: '1/8', 0.25: '1/4', 0.333: '1/3', 0.5: '1/2',
            1: '1/1', 2: '2/1', 3: '3/1', 4: '4/1', 8: '8/1',
        };
        for (const [k, lbl] of Object.entries(map)) {
            if (Math.abs(v - parseFloat(k)) < 0.02) return lbl;
        }
        const rounded = Math.round(v * 1000) / 1000;
        return String(rounded).replace(/\.?0+$/, '') || '0';
    }

    static _pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
        const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
        const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
        const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(hasNeg && hasPos);
    }

    /** Shared pixel layout for render + hit tests (matches visible fan geometry). */
    static _computeFanGeometry(points, style, scales) {
        if (!points || points.length < 2 || !scales) return null;

        const getX = (p) => scales.chart?.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(points[0]);
        const y1 = getY(points[0]);
        const x2 = getX(points[1]);
        const y2 = getY(points[1]);

        const xRange = scales.xScale && typeof scales.xScale.range === 'function'
            ? scales.xScale.range()
            : [0, scales.chart?.w || 1000];
        const yRange = scales.yScale && typeof scales.yScale.range === 'function'
            ? scales.yScale.range()
            : [scales.chart?.h || 500, 0];
        const xMin = Math.min(xRange[0], xRange[1]);
        const xMax = Math.max(xRange[0], xRange[1]);
        const yMin = Math.min(yRange[0], yRange[1]);
        const yMax = Math.max(yRange[0], yRange[1]);

        const baseDx = x2 - x1;
        const baseDy = y2 - y1;
        const xBound = baseDx >= 0 ? xMax : xMin;
        const baseSlope = (Math.abs(baseDx) < 1e-6)
            ? (baseDy >= 0 ? 1e6 : -1e6)
            : (baseDy / baseDx);

        const rayEndToBounds = (slope) => {
            const dxToXBound = xBound - x1;
            let endX = xBound;
            let endY = y1 + (slope * dxToXBound);

            if (endY >= yMin && endY <= yMax) {
                return { x: endX, y: endY };
            }

            const yBound = endY < yMin ? yMin : yMax;
            if (slope === 0) {
                return { x: endX, y: Math.max(yMin, Math.min(yMax, y1)) };
            }
            const dxToY = (yBound - y1) / slope;
            endX = x1 + dxToY;
            endY = yBound;
            endX = Math.max(xMin, Math.min(xMax, endX));
            return { x: endX, y: endY };
        };

        const fanLevelsRaw = Array.isArray(style?.fanLevels) ? style.fanLevels : [];
        const fanLevelsSource = Array.isArray(style?.fanLevels)
            ? fanLevelsRaw
            : GannFanTool.defaultFanLevels().map((l) => ({ ...l }));

        const levelsAll = fanLevelsSource
            .map((l) => {
                const v = l && l.value != null ? parseFloat(l.value) : NaN;
                return {
                    value: isFinite(v) ? v : NaN,
                    enabled: l && l.enabled !== false,
                    color: (l && l.color) ? l.color : (style?.stroke || '#4caf50'),
                    label: isFinite(v) ? GannFanTool.labelForValue(v) : '',
                    lineWidth: l?.lineWidth,
                    lineType: l?.lineType,
                };
            })
            .filter((l) => l.enabled && isFinite(l.value));

        const rays = levelsAll
            .map((l) => {
                const slope = baseSlope * l.value;
                const end = rayEndToBounds(slope);
                return { ...l, slope, end };
            })
            .sort((a, b) => a.slope - b.slope);

        return {
            x1,
            y1,
            x2,
            y2,
            xBound,
            baseSlope,
            xMin,
            xMax,
            yMin,
            yMax,
            rays,
            outerLow: rays.length ? rays[0].end : null,
            outerHigh: rays.length ? rays[rays.length - 1].end : null,
        };
    }

    onPointHandleDrag(index, context = {}) {
        const { point, scales } = context;
        if (!point || !scales) return false;

        if (index === 0) {
            if (!this.points[0] || !this.points[1]) return false;
            const dx = point.x - this.points[0].x;
            const dy = point.y - this.points[0].y;
            this.points = this.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            return true;
        }

        if (index !== 1 || !this.points[0]) return false;

        const chart = scales.chart;
        const xScale = scales.xScale;
        const yScale = scales.yScale;
        if (!yScale) return false;

        const toPxX = (p) => (chart && typeof chart.dataIndexToPixel === 'function')
            ? chart.dataIndexToPixel(p.x)
            : (xScale ? xScale(p.x) : p.x);
        const toPxY = (p) => yScale(p.y);
        const invPxX = (px) => (chart && typeof chart.pixelToDataIndex === 'function')
            ? chart.pixelToDataIndex(px)
            : (xScale && typeof xScale.invert === 'function' ? xScale.invert(px) : point.x);
        const invPxY = (py) => (yScale && typeof yScale.invert === 'function')
            ? yScale.invert(py)
            : point.y;

        const x1 = toPxX(this.points[0]);
        const y1 = toPxY(this.points[0]);
        const xM = toPxX(point);
        const yM = toPxY(point);
        const dx = xM - x1;
        const dy = yM - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return false;

        const ux = dx / len;
        const uy = dy / len;
        this.points[1] = {
            x: invPxX(x1 + ux * len),
            y: invPxY(y1 + uy * len),
        };
        return true;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        this._prepareRenderGroup(container, 'drawing gann-fan', renderOpts);
        this._clearDrawingLabels(scales);

        const scaleFactor = this.getZoomScaleFactor(scales);

        const layout = GannFanTool._computeFanGeometry(this.points, this.style, scales);
        if (!layout) return;

        const {
            x1, y1, xBound, xMin, xMax, yMin, yMax, rays, outerLow, outerHigh,
        } = layout;

        const baseDx = layout.x2 - layout.x1;
        const baseDy = layout.y2 - layout.y1;
        const fanLen = Math.hypot(baseDx, baseDy);

        const invPxX = (px) => (scales.chart && typeof scales.chart.pixelToDataIndex === 'function')
            ? scales.chart.pixelToDataIndex(px)
            : (scales.xScale && typeof scales.xScale.invert === 'function' ? scales.xScale.invert(px) : this.points[1].x);
        const invPxY = (py) => (scales.yScale && typeof scales.yScale.invert === 'function')
            ? scales.yScale.invert(py)
            : this.points[1].y;

        // Second handle sits on the 1/1 ray (matches rendered fan direction).
        if (fanLen > 1e-6) {
            const ux = baseDx / fanLen;
            const uy = baseDy / fanLen;
            const along = (layout.x2 - x1) * ux + (layout.y2 - y1) * uy;
            const hx = x1 + ux * along;
            const hy = y1 + uy * along;
            this.virtualPoints = [
                this.points[0],
                { x: invPxX(hx), y: invPxY(hy) },
            ];
        } else {
            this.virtualPoints = [this.points[0], this.points[1]];
        }

        const showZones = this.style.showZones !== false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;
        const showLevelValues = this.style.levelsEnabled !== false;

        const toRgba = (color, alpha) => {
            if (!color) return `rgba(120, 123, 134, ${alpha})`;
            const c = String(color).trim();
            if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
                const nums = c.replace(/rgba?\(|\)|\s+/g, '').split(',').map(v => v.trim());
                const r = parseFloat(nums[0]);
                const g = parseFloat(nums[1]);
                const b = parseFloat(nums[2]);
                if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            if (c[0] === '#') {
                let hex = c.slice(1);
                if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
                if (hex.length >= 6) {
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
            }
            return `rgba(120, 123, 134, ${alpha})`;
        };

        // Hitbox (wedge between outer rays) for easy whole-tool selection + move.
        const appendFanHitbox = () => {
            if (!outerLow || !outerHigh) return;
            this.group.append('path')
                .attr('class', 'gann-fan-hitbox')
                .attr('d', `M ${x1} ${y1} L ${outerLow.x} ${outerLow.y} L ${outerHigh.x} ${outerHigh.y} Z`)
                .attr('fill', 'rgba(255,255,255,0.001)')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, 18 * scaleFactor))
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        };

        // Zones (between consecutive rays)
        if (showZones && rays.length >= 2) {
            for (let i = 0; i < rays.length - 1; i++) {
                const a = rays[i];
                const b = rays[i + 1];
                this.group.append('path')
                    .attr('d', `M ${x1} ${y1} L ${a.end.x} ${a.end.y} L ${b.end.x} ${b.end.y} Z`)
                    .attr('fill', toRgba(b.color || a.color || this.style.stroke, zonesOpacity))
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
            }
        }

        // Rays + labels
        const globalDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const baseLineWidth = (this.style.strokeWidth != null && !isNaN(parseInt(this.style.strokeWidth))) ? parseInt(this.style.strokeWidth) : 1;
        const scaledStroke = Math.max(0.5, (globalWidth !== null ? globalWidth : baseLineWidth) * scaleFactor);
        const labelDx = (xBound - x1) * 0.35;

        rays.forEach(ray => {
            const perLevelWidth = (ray.lineWidth != null && !isNaN(parseInt(ray.lineWidth))) ? parseInt(ray.lineWidth) : null;
            const widthPx = (globalWidth !== null ? globalWidth : (perLevelWidth !== null ? perLevelWidth : baseLineWidth));
            const w = (ray.value === 1) ? Math.max(0.5, (widthPx * scaleFactor) * 1.6) : Math.max(0.5, widthPx * scaleFactor);
            const dash = (globalDash !== null ? globalDash : (ray.lineType != null ? `${ray.lineType}` : null));

            const hitW = Math.max(10, w * 6);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', ray.end.x).attr('y2', ray.end.y)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', ray.end.x).attr('y2', ray.end.y)
                .attr('stroke', ray.color || this.style.stroke)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash && dash !== 'none' ? dash : 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');

            const labelX = Math.max(xMin, Math.min(xMax, x1 + labelDx));
            const labelY = y1 + (ray.slope * (labelX - x1));
            if (showLevelValues && isFinite(labelX) && isFinite(labelY) && labelX >= xMin && labelX <= xMax && labelY >= yMin && labelY <= yMax) {
                this.group.append('text')
                    .attr('x', Math.max(xMin, Math.min(xMax, labelX + 6)))
                    .attr('y', labelY)
                    .attr('fill', ray.color || this.style.stroke)
                    .attr('font-size', `${Math.max(8, 9 * scaleFactor)}px`)
                    .attr('font-weight', '600')
                    .attr('opacity', 0.9)
                    .style('pointer-events', 'none')
                    .text(ray.label || '');
            }
        });

        // Level values are edited in settings only — no per-ray drag (avoids whole-fan skew on mouse move).
        // Whole-tool move uses gann-fan-hitbox + ray hit strokes; direction/scale uses the two anchor handles.
        appendFanHitbox();

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }

    /** Pixel layout for hit tests (matches `render`). */
    getPixelLayout(scales) {
        return GannFanTool._computeFanGeometry(this.points, this.style, scales);
    }

    /** True when pointer is inside the fan wedge (whole-tool move). */
    isPointInsideBody(mouseX, mouseY, scales) {
        const layout = GannFanTool._computeFanGeometry(this.points, this.style, scales);
        if (!layout || !layout.outerLow || !layout.outerHigh) return false;
        const { x1, y1, outerLow, outerHigh } = layout;
        return GannFanTool._pointInTriangle(
            mouseX, mouseY,
            x1, y1,
            outerLow.x, outerLow.y,
            outerHigh.x, outerHigh.y
        );
    }

    static fromJSON(data, chart = null) {
        const tool = new GannFanTool(data.points, data.style);
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
// Trend-Based Fib Extension Tool
// ============================================================================
class TrendFibExtensionTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('trend-fib-extension', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || DRAWING_TOOL_DEFAULT_STROKE;
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.trendLineEnabled === undefined) this.style.trendLineEnabled = true;
        if (!this.style.trendLineColor) this.style.trendLineColor = this.style.stroke;
        if (this.style.trendLineDasharray === undefined || this.style.trendLineDasharray === null) this.style.trendLineDasharray = '2,2';
        if (this.style.trendLineWidth === undefined || this.style.trendLineWidth === null) this.style.trendLineWidth = 1;
        // Core 7 Fibonacci levels (0 and 1 fixed at top)
        const defaultLevels = [
            { value: 0, label: '0', color: '#787b86', enabled: true },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
            { value: 0.236, label: '0.236', color: '#f23645', enabled: true },
            { value: 0.382, label: '0.382', color: '#ff9800', enabled: true },
            { value: 0.5, label: '0.5', color: '#ffeb3b', enabled: true },
            { value: 0.618, label: '0.618', color: '#4caf50', enabled: true },
            { value: 0.786, label: '0.786', color: '#00bcd4', enabled: true }
        ];

        this.levels = (Array.isArray(style.levels) && style.levels.length)
            ? style.levels
            : defaultLevels;
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length === 0) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const trendEnabled = this.style.trendLineEnabled !== false;
        const trendColor = this.style.trendLineColor || this.style.stroke;
        const trendDash = this.style.trendLineDasharray != null ? `${this.style.trendLineDasharray}` : '2,2';
        const trendBaseWidth = (this.style.trendLineWidth != null && !isNaN(parseInt(this.style.trendLineWidth))) ? parseInt(this.style.trendLineWidth) : 1;
        const scaledStrokeWidth = Math.max(0.5, trendBaseWidth * scaleFactor);

        this._prepareRenderGroup(container, 'drawing trend-fib-extension', renderOpts);
        this._clearDrawingLabels(scales);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        // Preview: 1 point - show dot
        if (this.points.length === 1) {
            const x1 = getX(this.points[0]);
            const y1 = getY(this.points[0]);
            this.group.append('circle')
                .attr('cx', x1).attr('cy', y1)
                .attr('r', 4)
                .attr('fill', this.style.stroke);
            return this.group;
        }

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);
        
        // Draw trend line (first leg)
        if (trendEnabled) {
            this.group.append('line')
                .attr('class', 'fib-trend-line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', trendColor)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', trendDash)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Preview: 2 points - show first line with endpoint dots
        if (this.points.length === 2) {
            [this.points[0], this.points[1]].forEach(p => {
                this.group.append('circle')
                    .attr('cx', getX(p)).attr('cy', getY(p))
                    .attr('r', 4)
                    .attr('fill', this.style.stroke);
            });
            return this.group;
        }

        // Full drawing with 3 points
        if (this.points.length >= 3) {
            const x3 = getX(this.points[2]);
            const y3 = getY(this.points[2]);
            
            // Use PRICE coordinates for proper fib calculation
            const price1 = this.points[0].y;
            const price2 = this.points[1].y;
            const price3 = this.points[2].y;
            
            // The price range of the first leg (A to B)
            const priceMove = price2 - price1;
            
            // Chart width for level lines
            const xRange = scales.xScale.range();

            const showZones = !!this.style.showZones;

            const reverse = !!this.style.reverse;
            const showLevelValues = this.style.levelsEnabled !== false;
            const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));

            const signedMove = reverse ? (-priceMove) : priceMove;

            const { fibX1: leftX, fibX2: rightX } = BaseDrawing.computeFibHorizontalSpanPx(
                this.style, xRange, x2, x3,
            );

            const toRgba = (color, alpha) => {
                if (!color) return `rgba(120, 123, 134, ${alpha})`;
                if (typeof color !== 'string') return `rgba(120, 123, 134, ${alpha})`;
                const c = color.trim();
                if (c.startsWith('rgba(') || c.startsWith('rgb(')) {
                    const nums = c.replace(/rgba?\(|\)|\s+/g, '').split(',').map(v => v.trim());
                    const r = parseFloat(nums[0]);
                    const g = parseFloat(nums[1]);
                    const b = parseFloat(nums[2]);
                    if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                if (c[0] === '#') {
                    let hex = c.slice(1);
                    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
                    if (hex.length >= 6) {
                        const r = parseInt(hex.slice(0, 2), 16);
                        const g = parseInt(hex.slice(2, 4), 16);
                        const b = parseInt(hex.slice(4, 6), 16);
                        if ([r, g, b].some(n => isNaN(n))) return `rgba(120, 123, 134, ${alpha})`;
                        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                    }
                }
                return `rgba(120, 123, 134, ${alpha})`;
            };

            // Draw second leg (to third point)
            if (trendEnabled) {
                this.group.append('line')
                    .attr('class', 'fib-trend-line')
                    .attr('x1', x2).attr('y1', y2)
                    .attr('x2', x3).attr('y2', y3)
                    .attr('stroke', trendColor)
                    .attr('stroke-width', scaledStrokeWidth)
                    .attr('stroke-dasharray', trendDash)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }

            if (showZones) {
                const zoneLevels = this.levels
                    .map(l => {
                        const value = typeof l === 'object' ? l.value : l;
                        const enabled = typeof l === 'object' ? l.enabled !== false : true;
                        const color = typeof l === 'object' ? (l.color || this.style.stroke) : this.style.stroke;
                        return { value, enabled, color };
                    })
                    .filter(l => l.enabled && l.value != null && !isNaN(parseFloat(l.value)))
                    .sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

                for (let i = 0; i < zoneLevels.length - 1; i++) {
                    const v1 = parseFloat(zoneLevels[i].value);
                    const v2 = parseFloat(zoneLevels[i + 1].value);
                    const yA = scales.yScale(price3 + (signedMove * v1));
                    const yB = scales.yScale(price3 + (signedMove * v2));
                    const top = Math.min(yA, yB);
                    const h = Math.abs(yA - yB);
                    if (!isFinite(top) || !isFinite(h) || h <= 0) continue;
                    this.group.insert('rect', ':first-child')
                        .attr('x', leftX)
                        .attr('y', top)
                        .attr('width', Math.max(0, rightX - leftX))
                        .attr('height', h)
                        .attr('fill', zoneLevels[i].color)
                        .attr('opacity', zoneOpacity)
                        .attr('rx', 2)
                        .style('pointer-events', 'none');
                }
            }

            // Draw extension levels projecting from point 3
            // Extension projects in the SAME direction as the first leg (A→B)
            this.levels.forEach((levelObj, idx) => {
                const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
                const enabled = typeof levelObj === 'object'
                    ? (levelObj.enabled !== false && levelObj.visible !== false)
                    : true;
                const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
                const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : (level === 1 ? 2 : 1);
                const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
                const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
                const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;
                
                if (!enabled) return;
                
                // Extension: project from C (point 3) in direction of A→B
                // 0% = C, 100% = C + (B-A), 161.8% = C + 1.618*(B-A)
                const priceAtLevel = price3 + (signedMove * level);
                const yAtLevel = scales.yScale(priceAtLevel);
                
                const scaledLevelWidth = Math.max(0.5, lineWidth * scaleFactor);
                const levelHitWidth = Math.max(10, scaledLevelWidth * 6);

                // Hit area for easier selection
                this.group.append('line')
                    .attr('class', 'fib-level-hit')
                    .attr('x1', leftX).attr('y1', yAtLevel)
                    .attr('x2', rightX).attr('y2', yAtLevel)
                    .attr('data-fib-idx', idx)
                    .attr('data-level', level)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', levelHitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                let extLabelText = null;
                let extLp = null;
                let extGap = null;
                const extLabelFontSize = 10;
                const priceDecimals = this.getPriceDecimals ? this.getPriceDecimals(price1) : 2;
                if (showLevelValues) {
                    extLabelText = BaseDrawing.formatFibLevelLabel(this.style, level, {
                        label: typeof levelObj === 'object' ? levelObj.label : null,
                        price: priceAtLevel,
                        priceDecimals,
                    });
                    extLp = fibHorizontalSpanLabelPlacement(this.style, leftX, rightX);
                    extGap = fibHorizontalCenterLabelGap(this.style, this.group, extLabelText, extLp.x, extLabelFontSize, '600');
                }

                appendFibHorizontalLineWithCenterGap(this.group, leftX, rightX, yAtLevel, extGap, {
                    'data-fib-idx': idx,
                    'data-level': level,
                    stroke: color,
                    'stroke-width': scaledLevelWidth,
                    'stroke-dasharray': lineType || 'none',
                    opacity: 0.85,
                });

                if (!showLevelValues) return;
                const extTextY = fibHorizontalLabelBaselineY(this.style, yAtLevel, 0);
                const extTextEl = this.group.append('text')
                    .attr('data-fib-label-idx', idx)
                    .attr('x', extLp.x)
                    .attr('y', extTextY)
                    .attr('fill', color)
                    .attr('font-size', `${extLabelFontSize}px`)
                    .attr('font-weight', '600')
                    .attr('text-anchor', extLp.anchor)
                    .style('pointer-events', 'none')
                    .text(extLabelText);
                if (normalizeFibLevelsLabelPosition(this.style) === 'center') {
                    extTextEl.attr('dominant-baseline', 'middle');
                }
            });
        }

        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);
        return this.group;
    }
    
    getPriceDecimals(price) {
        if (price >= 1000) return 0;
        if (price >= 1) return 2;
        if (price >= 0.01) return 4;
        return 6;
    }

    static fromJSON(data, chart = null) {
        const tool = new TrendFibExtensionTool(data.points, data.style);
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
