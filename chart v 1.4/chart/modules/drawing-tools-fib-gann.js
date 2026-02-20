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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 2;
        if (this.style.reverse === undefined) this.style.reverse = false;
        if (this.style.showPrices === undefined) this.style.showPrices = true;
        if (this.style.levelsEnabled === undefined) this.style.levelsEnabled = true;
        if (this.style.levelsLabelMode !== 'percent' && this.style.levelsLabelMode !== 'values') this.style.levelsLabelMode = 'values';
        if (this.style.backgroundOpacity === undefined || this.style.backgroundOpacity === null || isNaN(parseFloat(this.style.backgroundOpacity))) this.style.backgroundOpacity = 0.08;
        // TradingView-like default Fibonacci levels (fixed 20 like Fib Retracement)
        const defaultLevels = [
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
        this.levels = (Array.isArray(style.levels) && style.levels.length)
            ? style.levels
            : defaultLevels;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-channel')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const scaledMedianWidth = Math.max(0.5, (this.style.strokeWidth || 2) * scaleFactor);

        const extendLines = !!this.style.extendLines;
        const zonesEnabled = !!this.style.showZones;
        const reverse = !!this.style.reverse;
        const showPrices = this.style.showPrices !== false;
        const levelsEnabled = this.style.levelsEnabled !== false;
        const levelsLabelMode = (this.style.levelsLabelMode === 'percent' || this.style.levelsLabelMode === 'values') ? this.style.levelsLabelMode : 'values';
        const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));
        const xRange = scales.xScale.range();

        const priceDecimals = (typeof this.getPriceDecimals === 'function') ? this.getPriceDecimals(this.points[0]?.y) : 2;
        const formatLevelText = (v) => {
            const n = parseFloat(v);
            if (!isFinite(n)) return '';
            if (levelsLabelMode === 'percent') return `${(n * 100).toFixed(1)}%`;
            return (Math.round(n * 1000) / 1000).toString();
        };

        // Preview (2 points): draw the base line
        if (this.points.length === 2) {
            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', x2).attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', Math.max(0.5, (this.style.strokeWidth || 2) * scaleFactor))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.createHandles(this.group, scales);
            return this.group;
        }

        // Full drawing (3 points): draw channel lines as parallels to the base line
        if (this.points.length >= 3) {
            const x3 = getX(this.points[2]);
            const y3 = getY(this.points[2]);

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (!len) {
                this.createHandles(this.group, scales);
                return this.group;
            }

            // Unit normal vector to the base line
            const nx = -dy / len;
            const ny = dx / len;

            // Signed perpendicular distance from base line (through point1->point2) to point3.
            // When level=1, the parallel line passes through point3.
            const channelOffset = (x3 - x1) * nx + (y3 - y1) * ny;

            // If the 3rd point is outside the rendered segment span (when not extending lines),
            // the handle can look "off" the channel because the level line segment doesn't reach it.
            // Clamp handle position to the rendered level=1 segment using virtualPoints.
            if (!extendLines && scales) {
                const chart = scales.chart;
                const xScale = scales.xScale;
                const yScale = scales.yScale;
                const toDataX = (px) => (chart && typeof chart.pixelToDataIndex === 'function')
                    ? chart.pixelToDataIndex(px)
                    : (xScale && typeof xScale.invert === 'function' ? xScale.invert(px) : this.points[2].x);
                const toDataY = (py) => (yScale && typeof yScale.invert === 'function')
                    ? yScale.invert(py)
                    : this.points[2].y;

                const ux = dx / len;
                const uy = dy / len;
                const proj = (x3 - x1) * ux + (y3 - y1) * uy; // projection length along baseline from p1
                const t = proj / len;
                const tClamped = Math.max(0, Math.min(1, t));

                const hx = (x1 + dx * tClamped) + nx * channelOffset;
                const hy = (y1 + dy * tClamped) + ny * channelOffset;

                this.virtualPoints = [
                    this.points[0],
                    this.points[1],
                    { x: toDataX(hx), y: toDataY(hy) }
                ];
            } else {
                this.virtualPoints = null;
            }

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
                    const off1 = channelOffset * aV1;
                    const off2 = channelOffset * aV2;
                    const a1 = getSegment(x1 + nx * off1, y1 + ny * off1, x2 + nx * off1, y2 + ny * off1);
                    const a2 = getSegment(x1 + nx * off2, y1 + ny * off2, x2 + nx * off2, y2 + ny * off2);
                    this.group.insert('path', ':first-child')
                        .attr('d', `M ${a1.x1},${a1.y1} L ${a1.x2},${a1.y2} L ${a2.x2},${a2.y2} L ${a2.x1},${a2.y1} Z`)
                        .attr('fill', zoneLevels[i].color)
                        .attr('opacity', zoneOpacity)
                        .style('pointer-events', 'none');
                }
            }

            if (levelsEnabled) this.levels.forEach(levelObj => {
                const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
                const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
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
                const offset = channelOffset * actualLevel;
                const x1o = x1 + nx * offset;
                const y1o = y1 + ny * offset;
                const x2o = x2 + nx * offset;
                const y2o = y2 + ny * offset;

                const seg = getSegment(x1o, y1o, x2o, y2o);

                const scaledLevelWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
                const levelHitWidth = Math.max(10, scaledLevelWidth * 6);

                // Hit area (solid, nearly invisible) so dashed lines are easy to click
                this.group.append('line')
                    .attr('class', 'fib-level-hit')
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

                // Level label at line end
                const baseLabel = formatLevelText(lvl);
                let priceText = '';
                if (showPrices && scales.yScale && typeof scales.yScale.invert === 'function') {
                    const p = scales.yScale.invert(seg.y2);
                    if (isFinite(p)) priceText = ` (${p.toFixed(priceDecimals)})`;
                }
                const labelText = `${baseLabel}${priceText}`;

                this.group.append('text')
                    .attr('x', seg.x2 + 5)
                    .attr('y', seg.y2 + 4)
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .style('pointer-events', 'none')
                    .text(labelText);
            });
        }

        this.createHandles(this.group, scales);

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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-timezone')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getXFromIndex = (xIdx) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(xIdx) : scales.xScale(xIdx);
        const getY = (p) => scales.yScale(p.y);
        const chartHeight = scales.chart?.h || 500;
        const chartWidth = scales.chart?.w || 2000;

        const xIndex1 = this.points[0].x;
        const xIndex2 = this.points[1].x;
        const baseDx = xIndex2 - xIndex1;
        if (!baseDx) {
            this.createHandles(this.group, scales);
            return this.group;
        }
        const x1 = getXFromIndex(xIndex1);
        const y1 = getY(this.points[0]);
        const x2 = getXFromIndex(xIndex2);
        const y2 = getY(this.points[1]);

        // Anchor segment (TradingView-like)
        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', '#787b86')
            .attr('stroke-width', Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor))
            .attr('stroke-dasharray', '6,6')
            .attr('opacity', 0.7)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw vertical lines at Fibonacci intervals
        (this.levels || []).forEach((fibObj) => {
            const fib = typeof fibObj === 'object' ? fibObj.value : fibObj;
            const enabled = typeof fibObj === 'object' ? fibObj.enabled !== false : true;
            const color = typeof fibObj === 'object' ? fibObj.color : this.style.stroke;
            const baseWidth = (typeof fibObj === 'object' && fibObj.lineWidth != null && !isNaN(parseInt(fibObj.lineWidth))) ? parseInt(fibObj.lineWidth) : this.style.strokeWidth;
            const baseType = (typeof fibObj === 'object' && fibObj.lineType != null) ? `${fibObj.lineType}` : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;
            
            if (!enabled) return;

            const fibN = parseFloat(fib);
            if (!isFinite(fibN)) return;

            const xIndex = xIndex1 + (baseDx * fibN);
            const x = getXFromIndex(xIndex);
            if (x > 0 && x < chartWidth) {
                const scaledWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
                const hitWidth = Math.max(10, scaledWidth * 6);

                // Hit area (solid, nearly invisible) so verticals are easy to click
                this.group.append('line')
                    .attr('class', 'fib-level-hit')
                    .attr('x1', x).attr('y1', 0)
                    .attr('x2', x).attr('y2', chartHeight)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('line')
                    .attr('x1', x).attr('y1', 0)
                    .attr('x2', x).attr('y2', chartHeight)
                    .attr('stroke', color)
                    .attr('stroke-width', scaledWidth)
                    .attr('stroke-dasharray', lineType || 'none')
                    .attr('opacity', 0.8)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('text')
                    .attr('x', x + 3)
                    .attr('y', 15)
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .style('pointer-events', 'none')
                    .text(fib);
            }
        });

        this.createHandles(this.group, scales);
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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.backgroundEnabled === undefined) this.style.backgroundEnabled = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
        if (this.style.gridEnabled === undefined) this.style.gridEnabled = true;
        if (this.style.gridColor === undefined) this.style.gridColor = '#787b86';
        if (this.style.gridOpacity === undefined) this.style.gridOpacity = 0.35;
        if (this.style.gridLineWidth === undefined) this.style.gridLineWidth = 1;
        if (this.style.gridLineDasharray === undefined) this.style.gridLineDasharray = '';
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-speed-fan')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const isReverse = !!this.style.reverse;
        const p1 = isReverse ? this.points[1] : this.points[0];
        const p2 = isReverse ? this.points[0] : this.points[1];

        const x1 = getX(p1);
        const y1 = getY(p1);
        const x2 = getX(p2);
        const y2 = getY(p2);
        const chartWidth = scales.chart?.w || 2000;

        // Anchor segment (TradingView-like)
        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', '#787b86')
            .attr('stroke-width', Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor))
            .attr('stroke-dasharray', '6,6')
            .attr('opacity', 0.7)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const dx = x2 - x1;
        const dy = y2 - y1;
        if (!dx) {
            this.createHandles(this.group, scales);
            return this.group;
        }

        const extendX = dx >= 0 ? chartWidth : 0;

        const bgEnabled = this.style.backgroundEnabled !== false;
        const bgOpacity = (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
            ? parseFloat(this.style.backgroundOpacity)
            : 0.12;

        if (bgEnabled) {
            const enabledLevels = (this.levels || [])
                .filter(l => l && l.enabled !== false)
                .map(l => ({
                    value: parseFloat(l.value),
                    color: l.color || this.style.stroke
                }))
                .filter(l => isFinite(l.value))
                .sort((a, b) => b.value - a.value);

            for (let i = 0; i < enabledLevels.length - 1; i++) {
                const rHigh = enabledLevels[i].value;
                const rLow = enabledLevels[i + 1].value;
                // TradingView mapping: r=1 => top (y1), r=0 => point2 (y2)
                const yAtX2_1 = y1 + (dy * (1 - rHigh));
                const yAtX2_2 = y1 + (dy * (1 - rLow));
                const extendY1 = y1 + ((yAtX2_1 - y1) / dx) * (extendX - x1);
                const extendY2 = y1 + ((yAtX2_2 - y1) / dx) * (extendX - x1);

                this.group.insert('path', ':first-child')
                    .attr('d', `M ${x1},${y1} L ${extendX},${extendY1} L ${extendX},${extendY2} Z`)
                    .attr('fill', enabledLevels[i].color)
                    .attr('opacity', bgOpacity)
                    .style('pointer-events', 'none');
            }
        }

        const formatRatioLabel = (v) => {
            if (!isFinite(v)) return '';
            return (Math.round(v * 1000) / 1000).toString();
        };

        // Grid (TradingView-like rectangle guides)
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

            const gridLevels = (this.levels || [])
                .filter(l => l && l.enabled !== false)
                .map(l => ({ value: parseFloat(l.value), color: l.color || this.style.stroke }))
                .filter(l => isFinite(l.value) && l.value >= 0 && l.value <= 1)
                .sort((a, b) => b.value - a.value);

            const yTop = y1;
            const yBottom = y2;

            gridLevels.forEach(l => {
                const y = y1 + (dy * (1 - l.value));
                this.group.append('line')
                    .attr('x1', x1).attr('y1', y)
                    .attr('x2', extendX).attr('y2', y)
                    .attr('stroke', gridColor)
                    .attr('stroke-width', gridWidth)
                    .attr('stroke-dasharray', gridDash || 'none')
                    .attr('opacity', gridOpacity)
                    .style('pointer-events', 'none');

                const labelX = dx >= 0 ? (x1 - 8) : (x1 + 8);
                this.group.append('text')
                    .attr('x', labelX)
                    .attr('y', y + 3)
                    .attr('fill', l.color)
                    .attr('font-size', '10px')
                    .attr('text-anchor', dx >= 0 ? 'end' : 'start')
                    .style('pointer-events', 'none')
                    .text(formatRatioLabel(l.value));
            });

            gridLevels.forEach(l => {
                const x = x1 + (dx * (1 - l.value));
                this.group.append('line')
                    .attr('x1', x).attr('y1', yTop)
                    .attr('x2', x).attr('y2', yBottom)
                    .attr('stroke', gridColor)
                    .attr('stroke-width', gridWidth)
                    .attr('stroke-dasharray', gridDash || 'none')
                    .attr('opacity', gridOpacity)
                    .style('pointer-events', 'none');
            });

            this.group.append('line')
                .attr('x1', x1).attr('y1', yTop)
                .attr('x2', x1).attr('y2', yBottom)
                .attr('stroke', gridColor)
                .attr('stroke-width', gridWidth)
                .attr('stroke-dasharray', gridDash || 'none')
                .attr('opacity', gridOpacity)
                .style('pointer-events', 'none');
        }

        // Top labels along the top edge (TradingView-like)
        const topLabelY = (y1 > 14) ? (y1 - 6) : (y1 + 14);
        const enabledForLabels = (this.levels || [])
            .filter(l => l && l.enabled !== false)
            .map(l => ({ value: parseFloat(l.value), color: l.color || this.style.stroke }))
            .filter(l => isFinite(l.value) && l.value >= 0 && l.value <= 1)
            .sort((a, b) => b.value - a.value);
        enabledForLabels.forEach(l => {
            const xLabel = x1 + (dx * (1 - l.value));
            if (xLabel > 0 && xLabel < chartWidth) {
                this.group.append('text')
                    .attr('x', xLabel)
                    .attr('y', topLabelY)
                    .attr('fill', l.color)
                    .attr('font-size', '10px')
                    .attr('text-anchor', 'middle')
                    .style('pointer-events', 'none')
                    .text(l.value);
            }
        });

        // Draw fan lines from point 1
        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : this.style.strokeWidth;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;
            
            if (!enabled) return;

            const ratio = parseFloat(level);
            if (!isFinite(ratio)) return;
            
            // TradingView mapping: r=1 => top (y1), r=0 => point2 (y2)
            const targetY = y1 + (dy * (1 - ratio));
            const rayDy = targetY - y1;
            const extendY = y1 + (rayDy / dx) * (extendX - x1);

            const scaledLevelWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
            const hitWidth = Math.max(10, scaledLevelWidth * 6);

            // Hit area (solid, nearly invisible) so rays are easy to click
            this.group.append('line')
                .attr('class', 'fib-level-hit')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', extendX).attr('y2', extendY)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', x1).attr('y1', y1)
                .attr('x2', extendX).attr('y2', extendY)
                .attr('stroke', color)
                .attr('stroke-width', scaledLevelWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('opacity', 0.8)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Labels on rays (TradingView-like)
            const labelText = formatRatioLabel(ratio);
            const labelX = (ratio === 0)
                ? x2
                : (x1 + (dx * 0.72));
            const labelY = (ratio === 0)
                ? y2
                : (y1 + ((targetY - y1) / dx) * (labelX - x1));
            this.group.append('text')
                .attr('x', labelX)
                .attr('y', labelY - 4)
                .attr('fill', color)
                .attr('font-size', '10px')
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'none')
                .text(labelText);
        });

        this.createHandles(this.group, scales);
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
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing trend-fib-time')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const chartHeight = scales.chart?.h || 500;
        const getXFromIndex = (idx) => scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(idx) : scales.xScale(idx);
        const getY = (p) => scales.yScale(p.y);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const xIndex1 = p1.x;
        const xIndex2 = p2.x;
        const baseDx = xIndex2 - xIndex1;
        if (!baseDx) {
            this.createHandles(this.group, scales);
            return this.group;
        }

        const x1 = getXFromIndex(xIndex1);
        const y1 = getY(p1);
        const x2 = getXFromIndex(xIndex2);
        const y2 = getY(p2);

        // Anchor segment (TradingView-like)
        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', '#787b86')
            .attr('stroke-width', Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor))
            .attr('stroke-dasharray', '6,6')
            .attr('opacity', 0.7)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const showZones = !!this.style.showZones;
        const bgOpacity = (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity)))
            ? parseFloat(this.style.backgroundOpacity)
            : 0.12;

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

        const xAt = (level) => getXFromIndex(xIndex2 + (baseDx * level));

        // Zones between consecutive enabled levels (full chart height)
        if (showZones && enabledLevels.length >= 2) {
            for (let i = 0; i < enabledLevels.length - 1; i++) {
                const xa = xAt(enabledLevels[i].value);
                const xb = xAt(enabledLevels[i + 1].value);
                const xLeft = Math.min(xa, xb);
                const width = Math.abs(xb - xa);

                this.group.insert('rect', ':first-child')
                    .attr('x', xLeft)
                    .attr('y', 0)
                    .attr('width', width)
                    .attr('height', chartHeight)
                    .attr('fill', enabledLevels[i].color)
                    .attr('opacity', bgOpacity)
                    .style('pointer-events', 'none');
            }
        }

        // Vertical lines at each level
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

            // Hit area (solid, nearly invisible) so verticals are easy to click
            this.group.append('line')
                .attr('class', 'fib-level-hit')
                .attr('x1', x).attr('y1', 0)
                .attr('x2', x).attr('y2', chartHeight)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', x).attr('y1', 0)
                .attr('x2', x).attr('y2', chartHeight)
                .attr('stroke', lvl.color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new TrendFibTimeTool(data.points, data.style);
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
// Fib Circles Tool
// ============================================================================
class FibCirclesTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-circles', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
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
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-circles')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);
        const baseRadius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : this.style.strokeWidth;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;
            
            if (!enabled) return;
            
            const r = baseRadius * level;

            const scaledWidth = Math.max(0.5, parseFloat(lineWidth) * scaleFactor);
            const hitWidth = Math.max(10, scaledWidth * 6);

            this.group.append('circle')
                .attr('class', 'fib-level-hit')
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('r', r)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('circle')
                .attr('cx', x1)
                .attr('cy', y1)
                .attr('r', r)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Label
            this.group.append('text')
                .attr('x', x1 + r + 5)
                .attr('y', y1)
                .attr('fill', color)
                .attr('font-size', '10px')
                .style('pointer-events', 'none')
                .text(level.toFixed(3));
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibCirclesTool(data.points, data.style);
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
// Fib Spiral Tool
// ============================================================================
class FibSpiralTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fib-spiral', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#00bcd4';
        this.style.strokeWidth = style.strokeWidth || 1;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-spiral')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            this.createHandles(this.group, scales);
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

        const maxR = Math.hypot(chartWidth, chartHeight) * 2;
        const thetaMin = -6 * Math.PI;
        const thetaMax = 6 * Math.PI;
        const step = 0.06;

        let pathD = '';
        let started = false;
        for (let theta = thetaMin; theta <= thetaMax; theta += step) {
            const r = a * Math.exp(k * theta);
            if (!isFinite(r) || r <= 0 || r > maxR) continue;

            const ang = baseAngle + theta;
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

        this.createHandles(this.group, scales);
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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;
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
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-arcs')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const baseRadius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        if (!baseRadius || !isFinite(baseRadius)) {
            this.createHandles(this.group, scales);
            return this.group;
        }

        // Like fib-circles but only half: arc direction depends on where point2 is
        const isDown = y2 >= y1;
        const sweep = isDown ? 1 : 0;
        const innerSweep = isDown ? 0 : 1;

        const showZones = this.style.showZones !== false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;

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
                enabled: typeof l === 'object' ? (l.enabled !== false) : true,
                color: typeof l === 'object' ? l.color : this.style.stroke
            }))
            .filter(l => l.enabled)
            .sort((a, b) => a.value - b.value);

        if (showZones && enabledLevelsSorted.length) {
            let prevR = 0;
            enabledLevelsSorted.forEach((lvl) => {
                const r = baseRadius * lvl.value;
                if (!isFinite(r) || r <= 0) {
                    prevR = r;
                    return;
                }

                const fill = hexToRgba(lvl.color, zonesOpacity);
                let d = '';
                if (prevR > 0) {
                    d = `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1} ` +
                        `L ${x1 + prevR} ${y1} A ${prevR} ${prevR} 0 0 ${innerSweep} ${x1 - prevR} ${y1} Z`;
                } else {
                    d = `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1} L ${x1} ${y1} Z`;
                }

                this.group.append('path')
                    .attr('d', d)
                    .attr('fill', fill)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');

                prevR = r;
            });
        }

        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
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

            // Hit area (solid, nearly invisible) so arcs are easy to click
            this.group.append('path')
                .attr('class', 'fib-level-hit')
                .attr('d', `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1}`)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('d', `M ${x1 - r} ${y1} A ${r} ${r} 0 0 ${sweep} ${x1 + r} ${y1}`)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.7)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('text')
                .attr('x', x1 + r + 5)
                .attr('y', y1)
                .attr('fill', color)
                .attr('font-size', '10px')
                .style('pointer-events', 'none')
                .text(level.toFixed(3));
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new FibArcsTool(data.points, data.style);
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
        this.levels = style.levels || [
            { value: 0, enabled: false, color: '#787b86' },
            { value: 0.236, enabled: true, color: '#f23645' },
            { value: 0.382, enabled: true, color: '#ff9800' },
            { value: 0.5, enabled: true, color: '#ffeb3b' },
            { value: 0.618, enabled: true, color: '#4caf50' },
            { value: 0.786, enabled: true, color: '#00bcd4' },
            { value: 1, enabled: true, color: '#787b86' }
        ];
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing fib-wedge')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            this.createHandles(this.group, scales);
            return this.group;
        }

        const boundaryWidth = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);

        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', boundaryWidth)
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this.points.length < 3) {
            this.createHandles(this.group, scales);
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

        const toDataX = (px) => scales.chart && scales.chart.pixelToDataIndex ? scales.chart.pixelToDataIndex(px) : scales.xScale.invert(px);
        const toDataY = (py) => scales.yScale.invert(py);

        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', p3.x).attr('y2', p3.y)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', boundaryWidth)
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

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

        const enabledLevelsSorted = this.levels
            .map(l => ({
                value: typeof l === 'object' ? l.value : l,
                enabled: typeof l === 'object' ? (l.enabled !== false) : true,
                color: typeof l === 'object' ? l.color : this.style.stroke
            }))
            .filter(l => l.enabled)
            .map(l => ({ ...l, r: baseRadius * l.value }))
            .filter(l => isFinite(l.r) && l.r > 0)
            .sort((a, b) => a.r - b.r);

        if (showZones && enabledLevelsSorted.length) {
            let prevR = 0;
            enabledLevelsSorted.forEach((lvl) => {
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
                    .attr('d', d)
                    .attr('fill', fill)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');

                prevR = r;
            });
        }

        const midAngle = sweepFlag === 1 ? (a1 + delta / 2) : (a1 - delta / 2);

        // Draw arcs + labels
        this.levels.forEach(levelObj => {
            const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
            const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
            const color = typeof levelObj === 'object' ? levelObj.color : this.style.stroke;
            const baseWidth = typeof levelObj === 'object' && levelObj.lineWidth ? levelObj.lineWidth : 1;
            const baseType = typeof levelObj === 'object' && levelObj.lineType ? levelObj.lineType : '';
            const lineWidth = globalLevelsWidth !== null ? globalLevelsWidth : baseWidth;
            const lineType = globalLevelsDash !== null ? globalLevelsDash : baseType;

            if (!enabled) return;

            const r = baseRadius * level;
            if (!isFinite(r) || r <= 0) return;

            const start = polar(a1, r);
            const end = polar(a2, r);

            const scaledWidth = Math.max(0.5, (lineWidth || 1) * scaleFactor);
            const hitWidth = Math.max(10, scaledWidth * 6);

            // Hit area (solid, nearly invisible) so arcs are easy to click
            this.group.append('path')
                .attr('class', 'fib-level-hit')
                .attr('d', `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitWidth)
                .attr('stroke-dasharray', '')
                .attr('fill', 'none')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('d', `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`)
                .attr('stroke', color)
                .attr('stroke-width', scaledWidth)
                .attr('stroke-dasharray', lineType || 'none')
                .attr('fill', 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const labelR = Math.max(0, r - 10);
            const lp = polar(midAngle, labelR);
            this.group.append('text')
                .attr('x', lp.x)
                .attr('y', lp.y)
                .attr('fill', color)
                .attr('font-size', '10px')
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'none')
                .text(level.toString());
        });

        // Outer boundary arc
        this.group.append('path')
            .attr('d', `M ${p2.x} ${p2.y} A ${baseRadius} ${baseRadius} 0 ${largeArcFlag} ${sweepFlag} ${p3.x} ${p3.y}`)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', boundaryWidth)
            .attr('fill', 'none')
            .attr('opacity', 0.9)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this.points.length >= 3) {
            this.virtualPoints = [
                this.points[0],
                this.points[1],
                { x: toDataX(p3.x), y: toDataY(p3.y) }
            ];
        } else {
            this.virtualPoints = null;
        }

        this.createHandles(this.group, scales);
        return this.group;
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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'none';
        this.style.medianColor = style.medianColor || '#e91e63';
        this.style.innerFill = style.innerFill || 'rgba(76, 175, 80, 0.2)';
        this.style.outerFill = style.outerFill || 'rgba(41, 98, 255, 0.2)';
        this.style.pitchforkStyle = style.pitchforkStyle || 'original'; // 'original', 'schiff', 'modified-schiff', 'inside'
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing pitchfork')
            .attr('data-id', this.id)
            .style('pointer-events', 'none')
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

        // Helper to extend a line to the right edge
        const extendToRight = (x1, y1, x2, y2) => {
            if (x2 === x1) return { x: rightEdge, y: safeY(y2) };
            const slope = (y2 - y1) / (x2 - x1);
            if (!Number.isFinite(slope)) return { x: rightEdge, y: safeY(y2) };
            const extendedY = y2 + slope * (rightEdge - x2);
            return { x: rightEdge, y: safeY(extendedY) };
        };

        // Calculate extended endpoint for median line from pivot
        const medianEnd = extendToRight(pivotX, pivotY, medianTargetX, medianTargetY);

        // Calculate median slope - all parallel lines use this slope
        const medianSlopeDenom = (medianTargetX - pivotX);
        const medianSlope = Math.abs(medianSlopeDenom) < 1e-9 ? 0 : (medianTargetY - pivotY) / medianSlopeDenom;
        const yAtRight = (x0, y0) => safeY(y0 + medianSlope * (rightEdge - x0));

        // Calculate all level lines first (both upper and lower)
        const levelLines = [];
        
        // Keep midX and midY for level calculations (midpoint of B and C)
        const midX = midBC_X;
        const midY = midBC_Y;
        
        // Project B and C onto a line parallel to median at medianTargetX
        const projectedBY = by + medianSlope * (medianTargetX - bx);
        const projectedCY = cy + medianSlope * (medianTargetX - cx);
        
        // Distances from median to boundaries at medianTargetX
        const distToLower = projectedBY - medianTargetY;
        const distToUpper = projectedCY - medianTargetY;
        
        // Add median as level 0
        levelLines.push({
            value: 0,
            startX: pivotX,
            startY: pivotY,
            endX: medianEnd.x,
            endY: medianEnd.y,
            color: this.style.medianColor,
            isMedian: true,
            strokeWidth: this.style.strokeWidth
        });
        
        // Add enabled levels on both sides - parallel to median
        const isOriginal = this.style.pitchforkStyle === 'original' || !this.style.pitchforkStyle;
        const isInside = this.style.pitchforkStyle === 'inside';
        
        this.levels.forEach(level => {
            if (!level.enabled) return;
            
            // For level 1.0, draw boundary lines from B and C
            if (level.value === 1) {
                if (isOriginal) {
                    // Original: lines start from B and C
                    const lowerBoundaryEnd = { x: rightEdge, y: yAtRight(bx, by) };
                    levelLines.push({
                        value: -level.value,
                        startX: bx,
                        startY: by,
                        endX: lowerBoundaryEnd.x,
                        endY: lowerBoundaryEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: this.style.strokeWidth,
                        levelValue: level.value
                    });
                    
                    const upperBoundaryEnd = { x: rightEdge, y: yAtRight(cx, cy) };
                    levelLines.push({
                        value: level.value,
                        startX: cx,
                        startY: cy,
                        endX: upperBoundaryEnd.x,
                        endY: upperBoundaryEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: this.style.strokeWidth,
                        levelValue: level.value
                    });
                } else {
                    // Schiff variants: lines are parallel to median and pass through B and C
                    const lowerBoundaryEnd = { x: rightEdge, y: yAtRight(bx, by) };
                    levelLines.push({
                        value: -level.value,
                        startX: bx,
                        startY: by,
                        endX: lowerBoundaryEnd.x,
                        endY: lowerBoundaryEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: this.style.strokeWidth,
                        levelValue: level.value
                    });
                    
                    const upperBoundaryEnd = { x: rightEdge, y: yAtRight(cx, cy) };
                    levelLines.push({
                        value: level.value,
                        startX: cx,
                        startY: cy,
                        endX: upperBoundaryEnd.x,
                        endY: upperBoundaryEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: this.style.strokeWidth,
                        levelValue: level.value
                    });
                }
            } else {
                // For other levels (0.5, etc.), interpolate FROM median TOWARDS boundary
                if (isOriginal) {
                    // Original: interpolate from midBC towards B/C
                    const lowerStartX = midX + (bx - midX) * level.value;
                    const lowerStartY = midY + (by - midY) * level.value;
                    const lowerEnd = { x: rightEdge, y: yAtRight(lowerStartX, lowerStartY) };
                    
                    levelLines.push({
                        value: -level.value,
                        startX: lowerStartX,
                        startY: lowerStartY,
                        endX: lowerEnd.x,
                        endY: lowerEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: 1,
                        levelValue: level.value
                    });
                    
                    const upperStartX = midX + (cx - midX) * level.value;
                    const upperStartY = midY + (cy - midY) * level.value;
                    const upperEnd = { x: rightEdge, y: yAtRight(upperStartX, upperStartY) };
                    
                    levelLines.push({
                        value: level.value,
                        startX: upperStartX,
                        startY: upperStartY,
                        endX: upperEnd.x,
                        endY: upperEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: 1,
                        levelValue: level.value
                    });
                } else {
                    // Schiff/Modified Schiff/Inside: interpolate from midBC towards B/C, lines are parallel
                    const lowerStartX = midX + (bx - midX) * level.value;
                    const lowerStartY = midY + (by - midY) * level.value;
                    const lowerEnd = { x: rightEdge, y: yAtRight(lowerStartX, lowerStartY) };
                    
                    levelLines.push({
                        value: -level.value,
                        startX: lowerStartX,
                        startY: lowerStartY,
                        endX: lowerEnd.x,
                        endY: lowerEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: 1,
                        levelValue: level.value
                    });
                    
                    const upperStartX = midX + (cx - midX) * level.value;
                    const upperStartY = midY + (cy - midY) * level.value;
                    const upperEnd = { x: rightEdge, y: upperStartY + medianSlope * (rightEdge - upperStartX) };
                    
                    levelLines.push({
                        value: level.value,
                        startX: upperStartX,
                        startY: upperStartY,
                        endX: upperEnd.x,
                        endY: upperEnd.y,
                        color: level.color,
                        isMedian: false,
                        strokeWidth: 1,
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
                const baseColor = outerLine.color || '#ffffff';
                
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
                
                this.group.append('polygon')
                    .attr('class', 'shape-fill')
                    .attr('points', `${safeX(start1X)},${safeY(start1Y)} ${safeX(line1.endX)},${safeY(line1.endY)} ${safeX(line2.endX)},${safeY(line2.endY)} ${safeX(start2X)},${safeY(start2Y)}`)
                    .attr('fill', fillColor)
                    .attr('stroke', 'none')
                    .style('pointer-events', 'none');
            }
        }

        const middleLineEnabled = this.style.lineEnabled !== false;

        if (middleLineEnabled) {
            // Draw construction lines based on style
            if (this.style.pitchforkStyle === 'schiff') {
                // Schiff: Draw A to B line and B to C base line
                this.group.append('line')
                    .attr('x1', ax).attr('y1', ay)
                    .attr('x2', bx).attr('y2', by)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
                
                this.group.append('line')
                    .attr('x1', bx).attr('y1', by)
                    .attr('x2', cx).attr('y2', cy)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
            } else if (this.style.pitchforkStyle === 'modified-schiff' || this.style.pitchforkStyle === 'inside') {
                // For Modified Schiff and Inside: Draw A to B and B to C
                this.group.append('line')
                    .attr('x1', ax).attr('y1', ay)
                    .attr('x2', bx).attr('y2', by)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
                
                this.group.append('line')
                    .attr('x1', bx).attr('y1', by)
                    .attr('x2', cx).attr('y2', cy)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
            } else {
                // Original (default): A to midBC, midBC to B, midBC to C
                this.group.append('line')
                    .attr('x1', ax).attr('y1', ay)
                    .attr('x2', midX).attr('y2', midY)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
                
                this.group.append('line')
                    .attr('x1', midX).attr('y1', midY)
                    .attr('x2', bx).attr('y2', by)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
                
                this.group.append('line')
                    .attr('x1', midX).attr('y1', midY)
                    .attr('x2', cx).attr('y2', cy)
                    .attr('stroke', this.style.medianColor)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-dasharray', this.style.strokeDasharray || '')
                    .style('cursor', 'move');
            }
            
            // Draw the median line
            // For Original style: from midBC to right edge
            // For other styles: from pivot to right edge
            const medianStartX = (this.style.pitchforkStyle === 'original' || !this.style.pitchforkStyle) ? midX : pivotX;
            const medianStartY = (this.style.pitchforkStyle === 'original' || !this.style.pitchforkStyle) ? midY : pivotY;
            
            this.group.append('line')
                .attr('x1', medianStartX).attr('y1', medianStartY)
                .attr('x2', medianEnd.x).attr('y2', medianEnd.y)
                .attr('stroke', this.style.medianColor)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || '')
                .style('cursor', 'move');
        }

        // Draw all level lines
        levelLines.forEach(line => {
            if (line.isMedian) return; // Skip median, already drawn
            
            this.group.append('line')
                .attr('x1', line.startX).attr('y1', line.startY)
                .attr('x2', line.endX).attr('y2', line.endY)
                .attr('stroke', line.color)
                .attr('stroke-width', line.strokeWidth || 1)
                .style('cursor', 'move');
        });

        this.createHandles(this.group, scales);
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
        this.style.stroke = style.stroke || '#2962ff';
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing pitchfan')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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

            this.createHandles(this.group, scales);
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

        this.createHandles(this.group, scales);
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing gann-square-fixed')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            if (Array.isArray(this.style[key]) && this.style[key].length > 0) return;
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
        ensureBoundary(zoneLevels, 0);
        ensureBoundary(zoneLevels, 1);
        zoneLevels.sort((a, b) => a.value - b.value);

        const globalDash = (this.style.levelsLineDasharray != null && `${this.style.levelsLineDasharray}` !== '' && `${this.style.levelsLineDasharray}` !== 'none')
            ? `${this.style.levelsLineDasharray}`
            : null;
        const globalWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth)))
            ? parseInt(this.style.levelsLineWidth)
            : 1;
        const levelStrokeWidth = Math.max(0.5, globalWidth * scaleFactor);

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
            .attr('class', 'shape-border-hit gann-square-fixed-hitbox')
            .attr('x', left)
            .attr('y', top)
            .attr('width', size)
            .attr('height', size)
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, 18 * scaleFactor))
            .style('pointer-events', 'stroke')
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

        // Grid lines
        gridEnabled.forEach(level => {
            const v = level.value;
            if (!isFinite(v) || v <= 0 || v >= 1) return;
            const offset = size * v;
            const color = level.color || this.style.stroke;
            const w = Math.max(0.5, ((level.lineWidth != null && isFinite(level.lineWidth)) ? level.lineWidth : globalWidth) * scaleFactor);
            const dash = level.lineType != null && `${level.lineType}` !== '' ? `${level.lineType}` : globalDash;

            const hitW = Math.max(10, w * 6);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', left).attr('y1', top + offset)
                .attr('x2', left + size).attr('y2', top + offset)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', left).attr('y1', top + offset)
                .attr('x2', left + size).attr('y2', top + offset)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.7);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', left + offset).attr('y1', top)
                .attr('x2', left + offset).attr('y2', top + size)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', left + offset).attr('y1', top)
                .attr('x2', left + offset).attr('y2', top + size)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.7);
        });

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
        fanEnabled.forEach(level => {
            const v = level.value;
            if (!isFinite(v) || v <= 0 || v >= 1) return;
            const color = level.color || this.style.stroke;
            const w = Math.max(0.5, ((level.lineWidth != null && isFinite(level.lineWidth)) ? level.lineWidth : globalWidth) * scaleFactor);
            const dash = level.lineType != null && `${level.lineType}` !== '' ? `${level.lineType}` : globalDash;

            const hitW = Math.max(10, w * 6);

            const xOnRightEdge = anchorX + (sx * size);
            const yOnRightEdge = anchorY + (sy * (size * v));
            const xOnBottomEdge = anchorX + (sx * (size * v));
            const yOnBottomEdge = anchorY + (sy * size);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnRightEdge).attr('y2', yOnRightEdge)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnRightEdge).attr('y2', yOnRightEdge)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.8);

            this.group.append('line')
                .attr('class', 'gann-level-hit')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnBottomEdge).attr('y2', yOnBottomEdge)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', hitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', anchorX).attr('y1', anchorY)
                .attr('x2', xOnBottomEdge).attr('y2', yOnBottomEdge)
                .attr('stroke', color)
                .attr('stroke-width', w)
                .attr('stroke-dasharray', dash || 'none')
                .attr('opacity', 0.75);
        });

        // Quarter-circle arcs from anchor corner
        arcEnabled.forEach((level) => {
            const f = level.value;
            if (!isFinite(f) || f <= 0) return;
            const r = size * f;
            const color = level.color || this.style.stroke;
            const startX = anchorX + (sx * r);
            const startY = anchorY;
            const endX = anchorX;
            const endY = anchorY + (sy * r);
            const sweep = (sx === 1 && sy === 1) ? 1 : 0;

            const arcW = Math.max(0.5, levelStrokeWidth * 2);
            const arcHitW = Math.max(10, arcW * 6);

            this.group.append('path')
                .attr('class', 'gann-level-hit')
                .attr('d', `M ${startX} ${startY} A ${r} ${r} 0 0 ${sweep} ${endX} ${endY}`)
                .attr('fill', 'none')
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', arcHitW)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

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

        this.createHandles(this.group, scales);
        return this.group;
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

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing gann-square')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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

        this.createHandles(this.group, scales);
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
    constructor(points = [], style = {}) {
        super('gann-fan', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#4caf50';
        this.style.strokeWidth = style.strokeWidth || 1;
        if (this.style.showZones === undefined) this.style.showZones = true;
        if (this.style.backgroundOpacity === undefined) this.style.backgroundOpacity = 0.12;

        // Fan levels use a multiplier of the 1/1 slope.
        // Label format matches TradingView-style fractions seen in the screenshot.
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

        // Back-compat: migrate style.angles (label like 1×8) into style.fanLevels.
        if (!this.style) this.style = {};
        if (!Array.isArray(this.style.fanLevels) || this.style.fanLevels.length === 0) {
            if (Array.isArray(this.style.angles) && this.style.angles.length > 0) {
                this.style.fanLevels = this.style.angles.map(a => {
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
                        color: (a && a.color) ? a.color : (this.style.stroke || '#4caf50')
                    };
                });
            } else {
                this.style.fanLevels = defaultFanLevels.map(l => ({ ...l }));
            }
        }
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing gann-fan')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const scaleFactor = this.getZoomScaleFactor(scales);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const xRange = scales.xScale && typeof scales.xScale.range === 'function' ? scales.xScale.range() : [0, scales.chart?.w || 1000];
        const yRange = scales.yScale && typeof scales.yScale.range === 'function' ? scales.yScale.range() : [scales.chart?.h || 500, 0];
        const xMin = Math.min(xRange[0], xRange[1]);
        const xMax = Math.max(xRange[0], xRange[1]);
        const yMin = Math.min(yRange[0], yRange[1]);
        const yMax = Math.max(yRange[0], yRange[1]);

        const baseDx = x2 - x1;
        const baseDy = y2 - y1;

        // Always project to the right edge (end of chart).
        // Use a positive dx for slope so point order (left/right) doesn't flip the fan direction.
        const xBound = xMax;
        const safeDx = Math.abs(baseDx) || 1e-6;
        const baseSlope = (baseDx === 0) ? (baseDy >= 0 ? 1e6 : -1e6) : (baseDy / safeDx);

        const showZones = this.style.showZones !== false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;

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

        const rayEndToBounds = (slope) => {
            const dxToXBound = xBound - x1;
            let endX = xBound;
            let endY = y1 + (slope * dxToXBound);

            if (endY >= yMin && endY <= yMax) {
                return { x: endX, y: endY };
            }

            // Intersect with y boundary instead
            const yBound = endY < yMin ? yMin : yMax;
            if (slope === 0) {
                return { x: endX, y: Math.max(yMin, Math.min(yMax, y1)) };
            }
            const dxToY = (yBound - y1) / slope;
            endX = x1 + dxToY;
            endY = yBound;
            // Clamp X if needed
            endX = Math.max(xMin, Math.min(xMax, endX));
            return { x: endX, y: endY };
        };

        const levelsAll = (Array.isArray(this.style.fanLevels) ? this.style.fanLevels : [])
            .map(l => {
                const v = l && l.value != null ? parseFloat(l.value) : NaN;
                return {
                    value: isFinite(v) ? v : NaN,
                    enabled: l && l.enabled !== false,
                    color: (l && l.color) ? l.color : (this.style.stroke || '#4caf50'),
                    label: (l && l.label != null) ? `${l.label}` : ''
                };
            })
            .filter(l => l.enabled && isFinite(l.value));

        // Compute actual slopes and endpoints
        const rays = levelsAll
            .map(l => {
                const slope = baseSlope * l.value;
                const end = rayEndToBounds(slope);
                return { ...l, slope, end };
            })
            .sort((a, b) => a.slope - b.slope);

        // Hitbox (big wedge) for easy selection + dblclick settings
        const hit = [
            { x: x1, y: y1 },
            { x: xBound, y: yMin },
            { x: xBound, y: yMax }
        ];
        this.group.append('path')
            .attr('class', 'shape-border-hit gann-fan-hitbox')
            .attr('d', `M ${hit[0].x} ${hit[0].y} L ${hit[1].x} ${hit[1].y} L ${hit[2].x} ${hit[2].y} Z`)
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, 18 * scaleFactor))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

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
        const labelDx = Math.abs(xBound - x1) * 0.35;

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
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const labelX = Math.max(xMin, Math.min(xMax, x1 + labelDx));
            const labelY = y1 + (ray.slope * (labelX - x1));
            if (isFinite(labelX) && isFinite(labelY) && labelX >= xMin && labelX <= xMax && labelY >= yMin && labelY <= yMax) {
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

        this.createHandles(this.group, scales);
        return this.group;
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
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        // TradingView-like Fibonacci levels (fixed 20 like Fib Retracement)
        const defaultLevels = [
            { value: -0.618, label: '-0.618', color: '#9c27b0', enabled: false },
            { value: -0.5, label: '-0.5', color: '#673ab7', enabled: false },
            { value: -0.382, label: '-0.382', color: '#2196f3', enabled: false },
            { value: -0.236, label: '-0.236', color: '#00bcd4', enabled: false },
            { value: 0, label: '0', color: '#787b86', enabled: true },
            { value: 0.236, label: '0.236', color: '#f23645', enabled: true },
            { value: 0.382, label: '0.382', color: '#ff9800', enabled: true },
            { value: 0.5, label: '0.5', color: '#ffeb3b', enabled: true },
            { value: 0.618, label: '0.618', color: '#4caf50', enabled: true },
            { value: 0.786, label: '0.786', color: '#00bcd4', enabled: true },
            { value: 1, label: '1', color: '#2962ff', enabled: true },
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

        this.levels = (Array.isArray(style.levels) && style.levels.length)
            ? style.levels
            : defaultLevels;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length === 0) return;

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        const scaleFactor = this.getZoomScaleFactor(scales);
        const trendColor = this.style.trendLineColor || this.style.stroke;
        const trendDash = (this.style.trendLineDasharray != null && `${this.style.trendLineDasharray}` !== '' && `${this.style.trendLineDasharray}` !== 'none')
            ? `${this.style.trendLineDasharray}`
            : null;
        const trendBaseWidth = (this.style.trendLineWidth != null && !isNaN(parseInt(this.style.trendLineWidth)))
            ? parseInt(this.style.trendLineWidth)
            : (this.style.strokeWidth != null ? this.style.strokeWidth : 2);
        const scaledStrokeWidth = Math.max(0.5, trendBaseWidth * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing trend-fib-extension')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
        this.group.append('line')
            .attr('class', 'fib-trend-line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', trendColor)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', trendDash || 'none')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

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

            const extendLines = !!this.style.extendLines;
            const showZones = !!this.style.showZones;

            const reverse = !!this.style.reverse;
            const showPrices = this.style.showPrices !== false;
            const levelsEnabled = this.style.levelsEnabled !== false;
            const levelsLabelMode = (this.style.levelsLabelMode === 'percent' || this.style.levelsLabelMode === 'values') ? this.style.levelsLabelMode : 'values';
            const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));

            const signedMove = reverse ? (-priceMove) : priceMove;

            // Determine line width based on extend option (match fib retracement/extension behavior)
            let leftX, rightX;
            if (extendLines) {
                leftX = xRange[0];
                rightX = xRange[1];
            } else {
                // Match the width of the drawn leg (from point 2 to point 3)
                leftX = Math.min(x2, x3);
                rightX = Math.max(x2, x3);

                // Ensure minimum width for visibility
                let width = Math.abs(rightX - leftX);
                if (width < 50) {
                    const centerX = (x2 + x3) / 2;
                    leftX = centerX - 50;
                    rightX = centerX + 50;
                }
            }

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
            this.group.append('line')
                .attr('class', 'fib-trend-line')
                .attr('x1', x2).attr('y1', y2)
                .attr('x2', x3).attr('y2', y3)
                .attr('stroke', trendColor)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', trendDash || 'none')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

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
            if (levelsEnabled) this.levels.forEach(levelObj => {
                const level = typeof levelObj === 'object' ? levelObj.value : levelObj;
                const enabled = typeof levelObj === 'object' ? levelObj.enabled !== false : true;
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
                    .attr('data-level', level)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', levelHitWidth)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('line')
                    .attr('x1', leftX).attr('y1', yAtLevel)
                    .attr('x2', rightX).attr('y2', yAtLevel)
                    .attr('data-level', level)
                    .attr('stroke', color)
                    .attr('stroke-width', scaledLevelWidth)
                    .attr('stroke-dasharray', lineType || 'none')
                    .attr('opacity', 0.85)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                // Label on the left side with background
                const priceDecimals = this.getPriceDecimals ? this.getPriceDecimals(price1) : 2;
                const levelLabel = (() => {
                    if (levelsLabelMode === 'percent') {
                        return `${(level * 100).toFixed(1)}%`;
                    }
                    if (typeof levelObj === 'object' && levelObj.label != null && `${levelObj.label}` !== '') {
                        return `${levelObj.label}`;
                    }
                    return `${level}`;
                })();
                const labelText = showPrices ? `${levelLabel} (${priceAtLevel.toFixed(priceDecimals)})` : `${levelLabel}`;
                
                this.group.append('text')
                    .attr('x', rightX + 5)
                    .attr('y', yAtLevel)
                    .attr('fill', color)
                    .attr('font-size', '10px')
                    .attr('font-weight', '600')
                    .attr('text-anchor', 'start')
                    .style('pointer-events', 'none')
                    .text(labelText);
            });
        }

        this.createHandles(this.group, scales);
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
