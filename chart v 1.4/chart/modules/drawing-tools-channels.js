// ============================================================================
// Channel Drawing Tools
// ============================================================================

// ============================================================================
// Parallel Channel Tool
// ============================================================================
class ParallelChannelTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('parallel-channel', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(41, 98, 255, 0.1)';
        this.style.strokeDasharray = style.strokeDasharray || '0';
        this.style.extendLeft = style.extendLeft || false;
        this.style.extendRight = style.extendRight || false;
        this.ensureTextDefaults();
        
        // Initialize default levels (excluding 0 and 1 which are always drawn as main lines)
        const baseColor = this.style.stroke;
        this.levels = [
            { value: -0.25, color: '#1e3a5f', enabled: false },
            { value: 0.25, color: '#1e3a5f', enabled: false },
            { value: 0.5, color: baseColor, enabled: true, lineType: '5,5' },
            { value: 0.75, color: '#1e3a5f', enabled: false },
            { value: 1.25, color: '#1e3a5f', enabled: false }
        ];
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

            const offsetX = p2.x - p0.x;
            const offsetY = p2.y - p0.y;

            const moveP0PreserveOffset = (newP0) => {
                const dx = newP0.x - p0.x;
                const dy = newP0.y - p0.y;
                this.points[0] = { x: newP0.x, y: newP0.y };
                this.points[2] = { x: p2.x + dx, y: p2.y + dy };
                this.meta.updatedAt = Date.now();
                return true;
            };

            const moveP1PreserveOffset = (newP1) => {
                this.points[1] = { x: newP1.x, y: newP1.y };
                this.meta.updatedAt = Date.now();
                return true;
            };
            
            if (handleRole === 'top-mid') {
                // Middle of top line - move both p0 and p1 perpendicular
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                const toMouseX = dataPoint.x - midX;
                const toMouseY = dataPoint.y - midY;
                const perpDist = toMouseX * perpX + toMouseY * perpY;
                
                this.points[0] = { x: p0.x + perpX * perpDist, y: p0.y + perpY * perpDist };
                this.points[1] = { x: p1.x + perpX * perpDist, y: p1.y + perpY * perpDist };
                this.meta.updatedAt = Date.now();
                return true;
            }
            
            if (handleRole === 'bottom-mid') {
                // Middle of bottom line - adjust channel width (move p2)
                const bottomMidX = (p0.x + p1.x) / 2 + offsetX;
                const bottomMidY = (p0.y + p1.y) / 2 + offsetY;
                
                const toMouseX = dataPoint.x - bottomMidX;
                const toMouseY = dataPoint.y - bottomMidY;
                const perpDist = toMouseX * perpX + toMouseY * perpY;
                this.points[2] = {
                    x: p2.x + perpX * perpDist,
                    y: p2.y + perpY * perpDist
                };
                this.meta.updatedAt = Date.now();
                return true;
            }
            
            if (handleRole === 'bottom-right') {
                // Bottom right corner - rotate/resize (move p1) while preserving channel offset
                return moveP1PreserveOffset({ x: dataPoint.x - offsetX, y: dataPoint.y - offsetY });
            }

            if (handleRole === 'bottom-left') {
                // Bottom left corner - rotate/resize (move p0) while preserving channel offset
                return moveP0PreserveOffset({ x: dataPoint.x - offsetX, y: dataPoint.y - offsetY });
            }

            if (handleRole === 'top-left') {
                // Top left corner - rotate/resize (move p0) while preserving channel offset
                return moveP0PreserveOffset({ x: dataPoint.x, y: dataPoint.y });
            }

            if (handleRole === 'top-right') {
                // Top right corner - rotate/resize (move p1)
                return moveP1PreserveOffset({ x: dataPoint.x, y: dataPoint.y });
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
        
        // Point 2 (parallel line handle) - constrain to perpendicular movement
        if (index === 2 && this.points.length >= 3) {
            const p0 = this.points[0];
            const p1 = this.points[1];
            
            const baseX = p1.x - p0.x;
            const baseY = p1.y - p0.y;
            const baseLen = Math.sqrt(baseX * baseX + baseY * baseY);
            
            if (baseLen === 0) {
                this.points[2] = { x: p0.x, y: dataPoint.y };
            } else {
                const perpX = -baseY / baseLen;
                const perpY = baseX / baseLen;
                const toMouseX = dataPoint.x - p0.x;
                const toMouseY = dataPoint.y - p0.y;
                const perpDist = toMouseX * perpX + toMouseY * perpY;
                
                this.points[2] = {
                    x: p0.x + perpX * perpDist,
                    y: p0.y + perpY * perpDist
                };
            }
            
            this.meta.updatedAt = Date.now();
            return true;
        }
        
        return false;
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this.group = container.append('g')
            .attr('class', 'drawing parallel-channel')
            .attr('data-id', this.id)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

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
            const offsetX = x3 - x1;
            const offsetY = y3 - y1;

            // Get chart boundaries from scale range
            const xRange = scales.xScale.range();
            const slope = dx !== 0 ? dy / dx : 0;

            // Helper to calculate line endpoints with extension
            const getLineEndpoints = (baseStartX, baseStartY, baseEndX, baseEndY) => {
                let sX = baseStartX, sY = baseStartY, eX = baseEndX, eY = baseEndY;
                if (dx !== 0) {
                    if (this.style.extendLeft) {
                        sX = xRange[0];
                        sY = baseStartY + slope * (xRange[0] - baseStartX);
                    }
                    if (this.style.extendRight) {
                        eX = xRange[1];
                        eY = baseStartY + slope * (xRange[1] - baseStartX);
                    }
                }
                return { sX, sY, eX, eY };
            };

            // Draw fill first (background)
            if (this.style.fill && this.style.fill !== 'none') {
                const base = getLineEndpoints(x1, y1, x2, y2);
                const parallel = getLineEndpoints(x1 + offsetX, y1 + offsetY, x2 + offsetX, y2 + offsetY);
                this.group.append('polygon')
                    .attr('points', `${base.sX},${base.sY} ${base.eX},${base.eY} ${parallel.eX},${parallel.eY} ${parallel.sX},${parallel.sY}`)
                    .attr('fill', this.style.fill)
                    .attr('stroke', 'none')
                    .attr('class', 'shape-fill')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');
            }

            // Draw all level lines (enabled ones from levels array + always draw 0 and 1)
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

            // Always draw main channel lines (0 and 1) with main stroke color
            drawLevelLine(0, this.style.stroke);
            drawLevelLine(1, this.style.stroke);

            // Draw all levels from levels array (including disabled ones, but hide them)
            if (Array.isArray(this.levels) && this.levels.length > 0) {
                this.levels.forEach(level => {
                    // Skip 0 and 1 as they're already drawn as main lines
                    if (level.value === 0 || level.value === 1) return;
                    
                    const levelOffsetX = offsetX * level.value;
                    const levelOffsetY = offsetY * level.value;
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
                        .attr('stroke', level.color || this.style.stroke)
                        .attr('stroke-width', level.lineWidth || this.style.strokeWidth)
                        .attr('stroke-dasharray', level.lineType !== undefined ? (level.lineType || 'none') : this.style.strokeDasharray)
                        .attr('data-level', level.value)
                        .style('cursor', 'move')
                        .style('pointer-events', 'stroke')
                        .style('display', level.enabled ? null : 'none');
                    
                    // Add invisible wider hit area for easier selection
                    this.group.append('line')
                        .attr('class', 'shape-border-hit')
                        .attr('x1', endpoints.sX)
                        .attr('y1', endpoints.sY)
                        .attr('x2', endpoints.eX)
                        .attr('y2', endpoints.eY)
                        .attr('stroke', 'transparent')
                        .attr('stroke-width', Math.max(16, (level.lineWidth || this.style.strokeWidth || 2) * 5))
                        .attr('data-level', level.value)
                        .style('cursor', 'move')
                        .style('pointer-events', 'stroke')
                        .style('display', level.enabled ? null : 'none');
                });
            }

            if (this.text && this.text.trim()) {
                this.renderTextLabel(scales);
            }
            
            // Create handles if selected
            this.createHandles(this.group, scales);
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
        const middleHandleSize = handleRadius * 2 + 2;
        const middleHandleBgSize = middleHandleSize + 2;
        const middleHandleCornerRadius = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        if (this.points.length < 2) return;
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2] || this.points[1];
        
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);
        const x3 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p3.x) : scales.xScale(p3.x);
        const y3 = scales.yScale(p3.y);
        
        const offsetX = x3 - x1;
        const offsetY = y3 - y1;
        
        // Handle positions: corners + middle points on top and bottom lines
        const handlePositions = [
            { cx: x1, cy: y1, index: 'top-left', type: 'corner' },
            { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, index: 'top-mid', type: 'middle' },
            { cx: x2, cy: y2, index: 'top-right', type: 'corner' },
            { cx: x1 + offsetX, cy: y1 + offsetY, index: 'bottom-left', type: 'corner' },
            { cx: (x1 + x2) / 2 + offsetX, cy: (y1 + y2) / 2 + offsetY, index: 'bottom-mid', type: 'middle' },
            { cx: x2 + offsetX, cy: y2 + offsetY, index: 'bottom-right', type: 'corner' }
        ];
        
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
                handleGroup.append('rect')
                    .attr('class', 'resize-handle-bg')
                    .attr('x', pos.cx - middleHandleBgSize / 2)
                    .attr('y', pos.cy - middleHandleBgSize / 2)
                    .attr('width', middleHandleBgSize)
                    .attr('height', middleHandleBgSize)
                    .attr('rx', middleHandleCornerRadius)
                    .attr('ry', middleHandleCornerRadius)
                    .style('pointer-events', 'none')
                    .style('opacity', this.selected ? 1 : 0);

                handleGroup.append('rect')
                    .attr('class', 'resize-handle')
                    .attr('x', pos.cx - middleHandleSize / 2)
                    .attr('y', pos.cy - middleHandleSize / 2)
                    .attr('width', middleHandleSize)
                    .attr('height', middleHandleSize)
                    .attr('rx', middleHandleCornerRadius)
                    .attr('ry', middleHandleCornerRadius)
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

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            points: this.points,
            style: this.style,
            visible: this.visible,
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
        tool.chart = chart;
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

    render(container, scales, isPreview = false) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }
        
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
        this.group = container.append('g')
            .attr('class', 'drawing regression-trend')
            .attr('data-id', this.id)
            .style('pointer-events', 'none')
            .style('cursor', 'default');
        
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
        
        // Get pixel boundaries of the visible chart area
        const xRange = scales.xScale.range();
        const leftBoundary = xRange[0];
        const rightBoundary = xRange[1];
        
        // Calculate pixel coordinates for regression line
        const x1 = chart.dataIndexToPixel ? chart.dataIndexToPixel(startIdx) : scales.xScale(startIdx);
        const x2 = chart.dataIndexToPixel ? chart.dataIndexToPixel(endIdx) : scales.xScale(endIdx);
        const y1 = scales.yScale(a);
        const y2 = scales.yScale(a + b * (sourceData.length - 1));

        let startX = x1, startY = y1, endX = x2, endY = y2;

        // Extend line if needed to chart boundaries
        if (this.style.extendLeft || this.style.extendRight) {
            const dx = x2 - x1;
            if (dx !== 0) {
                const slope = (y2 - y1) / dx;
                
                if (this.style.extendLeft) {
                    // Extend to left boundary of chart
                    startX = leftBoundary;
                    // Calculate y at the left boundary using the slope
                    const deltaX = startX - x1;
                    startY = y1 + slope * deltaX;
                }
                
                if (this.style.extendRight) {
                    // Extend to right boundary of chart
                    endX = rightBoundary;
                    // Calculate y at the right boundary using the slope
                    const deltaX = endX - x1;
                    endY = y1 + slope * deltaX;
                }
            }
        }
        
        // Don't clamp to boundaries - let it stop at actual candle positions

        // Calculate fill polygon coordinates using the same extended range
        let upperStartY, upperEndY;
        let lowerStartY, lowerEndY;
        let midStartY = startY, midEndY = endY;
        
        // Calculate deviation channel positions at start and end points
        // Calculate the deviation offset in price space, then convert to pixels
        const deviationOffsetUpper = this.style.upperDeviation * stdDev;
        const deviationOffsetLower = this.style.lowerDeviation * stdDev;
        
        if (this.style.extendLeft) {
            // For extended left, calculate regression value at the extended position
            // Convert startX back to data index to get the regression value
            const extendedDataX = scales.xScale.invert ? scales.xScale.invert(startX) : 
                                  (startX - scales.xScale.range()[0]) / (scales.xScale.range()[1] - scales.xScale.range()[0]) * 
                                  (scales.xScale.domain()[1] - scales.xScale.domain()[0]) + scales.xScale.domain()[0];
            const regressionValueAtLeft = a + b * (extendedDataX - startIdx);
            upperStartY = scales.yScale(regressionValueAtLeft + deviationOffsetUpper);
            lowerStartY = scales.yScale(regressionValueAtLeft + deviationOffsetLower);
            midStartY = scales.yScale(regressionValueAtLeft);
        } else {
            // Use the actual start position values
            upperStartY = scales.yScale(a + deviationOffsetUpper);
            lowerStartY = scales.yScale(a + deviationOffsetLower);
            midStartY = y1;
        }
        
        if (this.style.extendRight) {
            // For extended right, calculate regression value at the extended position
            const extendedDataX = scales.xScale.invert ? scales.xScale.invert(endX) : 
                                  (endX - scales.xScale.range()[0]) / (scales.xScale.range()[1] - scales.xScale.range()[0]) * 
                                  (scales.xScale.domain()[1] - scales.xScale.domain()[0]) + scales.xScale.domain()[0];
            const regressionValueAtRight = a + b * (extendedDataX - startIdx);
            upperEndY = scales.yScale(regressionValueAtRight + deviationOffsetUpper);
            lowerEndY = scales.yScale(regressionValueAtRight + deviationOffsetLower);
            midEndY = scales.yScale(regressionValueAtRight);
        } else {
            // Use the actual end position values
            upperEndY = scales.yScale(a + b * (sourceData.length - 1) + deviationOffsetUpper);
            lowerEndY = scales.yScale(a + b * (sourceData.length - 1) + deviationOffsetLower);
            midEndY = y2;
        }

        // Draw upper background (between regression line and upper deviation)
        if (this.style.upperFill && this.style.upperFill !== 'none' && this.style.useUpperDeviation) {
            visualGroup.append('polygon')
                .attr('points', `${startX},${midStartY} ${endX},${midEndY} ${endX},${upperEndY} ${startX},${upperStartY}`)
                .attr('fill', this.style.upperFill)
                .attr('stroke', 'none')
                .attr('class', 'upper-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        // Draw lower background (between regression line and lower deviation)
        if (this.style.lowerFill && this.style.lowerFill !== 'none' && this.style.useLowerDeviation) {
            visualGroup.append('polygon')
                .attr('points', `${startX},${midStartY} ${endX},${midEndY} ${endX},${lowerEndY} ${startX},${lowerStartY}`)
                .attr('fill', this.style.lowerFill)
                .attr('stroke', 'none')
                .attr('class', 'lower-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        // Draw main regression line (on top of fills)
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
        
        // Add invisible wider hit area for easier selection
        visualGroup.append('line')
            .attr('class', 'main-line-hit shape-border-hit')
            .attr('x1', startX)
            .attr('y1', midStartY)
            .attr('x2', endX)
            .attr('y2', midEndY)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(10, this.style.strokeWidth * 3))
            .style('cursor', 'move')
            .style('pointer-events', 'stroke');

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
                .attr('stroke-width', Math.max(10, this.style.upperStrokeWidth * 3))
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
                .attr('stroke-width', Math.max(10, this.style.lowerStrokeWidth * 3))
                .style('cursor', 'move')
                .style('pointer-events', 'stroke');
        }

        if (this.text && this.text.trim()) {
            this.renderTextLabel(scales);
        }
        
        // Display Pearson's R if enabled
        if (this.style.showPearsonsR && r2 !== undefined) {
            // Position at the bottom-left corner like TradingView
            // Use the start point X position
            const deviationOffsetLower = this.style.lowerDeviation * stdDev;
            
            // Calculate Y position on the lower deviation line at the start index
            const lowerStartRegressionY = scales.yScale(a + deviationOffsetLower);
            
            this.renderPearsonsR(scales, r2, x1, lowerStartRegressionY);
        }
        
        // Create handles if selected
        this.createHandles(this.group, scales);
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

    renderPearsonsR(scales, r2, x, y) {
        if (!this.group) return;
        
        // Format R value with "R" prefix
        const r2Text = `R ${r2.toFixed(14)}`;
        
        // Position the text well below the regression line, centered
        const textX = x;
        const textY = y + 35; // 35 pixels below the line for better visibility
        
        // Add the text without background, centered
        // Use the lower line color for the text
        this.group.append('text')
            .attr('class', 'pearson-r-text')
            .attr('x', textX)
            .attr('y', textY)
            .attr('text-anchor', 'middle') // Center the text horizontally
            .style('font-size', `${this.style.fontSize}px`)
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
        
        if (!this.selected) return;
        
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
            
            // Draw vertical guide line for this handle
            group.append('line')
                .attr('class', 'vertical-guide')
                .attr('x1', cx)
                .attr('y1', topY)
                .attr('x2', cx)
                .attr('y2', bottomY)
                .attr('stroke', this.style.stroke || '#2962FF')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.4)
                .style('pointer-events', 'none');
            
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
                .style('cursor', 'nwse-resize')
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
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
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

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this.group = container.append('g')
            .attr('class', 'drawing flat-top-bottom')
            .attr('data-id', this.id)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

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

        // Calculate chart bounds for extension using xScale.range()
        const xRange = scales.xScale.range();
        const chartBounds = {
            left: xRange[0],
            right: xRange[1]
        };

        // Calculate slope of angled line (p1 to p2)
        const dx = x2 - x1;
        const dy = y2 - y1;
        const slope = dx !== 0 ? dy / dx : 0;

        // Angled line coordinates
        let angledX1 = x1, angledY1 = y1, angledX2 = x2, angledY2 = y2;
        
        // Horizontal line coordinates (at y3)
        let horizX1 = x1, horizX2 = x2;
        
        // Fill polygon points
        let fillX1 = x1, fillX2 = x2;

        if (this.style.extendLeft) {
            // Extend angled line to left edge
            angledX1 = chartBounds.left;
            angledY1 = y1 - slope * (x1 - chartBounds.left);
            // Extend horizontal line to left edge
            horizX1 = chartBounds.left;
            fillX1 = chartBounds.left;
        }
        
        if (this.style.extendRight) {
            // Extend angled line to right edge
            angledX2 = chartBounds.right;
            angledY2 = y2 + slope * (chartBounds.right - x2);
            // Extend horizontal line to right edge
            horizX2 = chartBounds.right;
            fillX2 = chartBounds.right;
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
        if (this.style.fill && this.style.fill !== 'none') {
            this.group.append('polygon')
                .attr('points', `${fillX1},${angledY1} ${fillX2},${angledY2} ${fillX2},${y3} ${fillX1},${y3}`)
                .attr('fill', this.style.fill)
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
        this.createHandles(this.group, scales);
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

        // Place the label along the top segment (like the screenshot)
        const t = 0.35;
        const baseX = x1 + dx * t;
        const baseY = y1 + dy * t;

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

        const anchor = textHAlign === 'left' ? 'start' : (textHAlign === 'right' ? 'end' : 'middle');

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

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }
        
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create new group
        this.group = container.append('g')
            .attr('class', 'drawing disjoint-channel')
            .attr('data-id', this.id)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

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
            // Calculate chart bounds using xScale.range() for reliability
            const xRange = scales.xScale.range();
            const chartBounds = {
                left: xRange[0],
                right: xRange[1]
            };

            // First line extension
            const dx1 = x2 - x1;
            const dy1 = y2 - y1;
            if (dx1 !== 0) {
                const slope1 = dy1 / dx1;
                
                if (this.style.extendLeft) {
                    startX1 = chartBounds.left;
                    startY1 = y1 + slope1 * (chartBounds.left - x1);
                }
                
                if (this.style.extendRight) {
                    endX1 = chartBounds.right;
                    endY1 = y1 + slope1 * (chartBounds.right - x1);
                }
            }

            // Second line extension (use actual x4, y4 points)
            const dx2 = x4 - x3;
            const dy2 = y4 - y3;
            if (dx2 !== 0) {
                const slope2 = dy2 / dx2;
                
                if (this.style.extendLeft) {
                    startX2 = chartBounds.left;
                    startY2 = y3 + slope2 * (chartBounds.left - x3);
                }
                
                if (this.style.extendRight) {
                    endX2 = chartBounds.right;
                    endY2 = y3 + slope2 * (chartBounds.right - x3);
                }
            }
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

        if (this.style.fill && this.style.fill !== 'none') {
            this.group.append('polygon')
                .attr('points', `${startX1},${startY1} ${endX1},${endY1} ${endX2},${endY2} ${startX2},${startY2}`)
                .attr('fill', this.style.fill)
                .attr('stroke', 'none')
                .attr('class', 'shape-fill')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        if (this.text && this.text.trim()) {
            this.renderTextLabel(scales);
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
        }
        this.createHandles(this.group, scales);
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

        const anchor = textHAlign === 'left' ? 'start' : (textHAlign === 'right' ? 'end' : 'middle');

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
