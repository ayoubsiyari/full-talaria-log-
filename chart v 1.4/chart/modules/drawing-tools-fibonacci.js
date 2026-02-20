/**
 * Drawing Tools - Fibonacci Tools Module
 * Implements: Fibonacci Retracement, Fibonacci Extension
 */

// ============================================================================
// Fibonacci Retracement Tool
// ============================================================================
class FibonacciRetracementTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fibonacci-retracement', points, style);
        this.requiredPoints = 2;
        if (this.style.levelsLineDasharray === undefined) this.style.levelsLineDasharray = '';
        if (this.style.levelsLineWidth === undefined) this.style.levelsLineWidth = 2;
        const globalLineType = `${this.style.levelsLineDasharray ?? ''}`;
        const globalLineWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : 2;
        
        // Fibonacci levels
        const defaultLevels = [
            { value: -0.618, label: '-0.618', color: style.colorMinus618 || '#9c27b0', visible: false },
            { value: -0.5, label: '-0.5', color: style.colorMinus50 || '#673ab7', visible: false },
            { value: -0.382, label: '-0.382', color: style.colorMinus382 || '#2196f3', visible: false },
            { value: -0.236, label: '-0.236', color: style.colorMinus236 || '#00bcd4', visible: false },
            { value: 0, label: '0', color: style.color0 || '#787b86', visible: true },
            { value: 0.236, label: '0.236', color: style.color236 || '#f23645', visible: true },
            { value: 0.382, label: '0.382', color: style.color382 || '#ff9800', visible: true },
            { value: 0.5, label: '0.5', color: style.color50 || '#ffeb3b', visible: true },
            { value: 0.618, label: '0.618', color: style.color618 || '#4caf50', visible: true },
            { value: 0.786, label: '0.786', color: style.color786 || '#2196f3', visible: true },
            { value: 1, label: '1', color: style.color1 || '#787b86', visible: true },
            { value: 1.272, label: '1.272', color: style.color1272 || '#00bcd4', visible: false },
            { value: 1.414, label: '1.414', color: style.color1414 || '#4caf50', visible: false },
            { value: 1.618, label: '1.618', color: style.color1618 || '#9c27b0', visible: false },
            { value: 2, label: '2', color: style.color2 || '#e91e63', visible: false },
            { value: 2.272, label: '2.272', color: style.color2272 || '#ff9800', visible: false },
            { value: 2.618, label: '2.618', color: style.color2618 || '#f44336', visible: false },
            { value: 3.618, label: '3.618', color: style.color3618 || '#b71c1c', visible: false },
            { value: 4.236, label: '4.236', color: style.color4236 || '#607d8b', visible: false },
            { value: 5, label: '5', color: style.color5 || '#3f51b5', visible: false }
        ];

        const providedLevels = Array.isArray(style.levels) ? style.levels : defaultLevels;
        this.levels = providedLevels.map(level => ({
            value: typeof level.value === 'number' ? level.value : parseFloat(level.value) || 0,
            label: level.label != null ? `${level.label}` : `${level.value}`,
            color: level.color || '#787b86',
            visible: level.visible !== false,
            lineType: level.lineType != null ? `${level.lineType}` : globalLineType,
            lineWidth: (level.lineWidth != null && !isNaN(parseInt(level.lineWidth))) ? parseInt(level.lineWidth) : globalLineWidth
        }));
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const baseLevelStrokeWidth = (this.style.strokeWidth != null ? this.style.strokeWidth : 2);
        const scaledStrokeWidth = Math.max(0.5, baseLevelStrokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing fibonacci-retracement')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        // Get chart width for calculating zone width
        const xRange = scales.xScale.range();
        const chartWidth = xRange[1] - xRange[0];
        
        // Determine line width based on extend option
        let fibX1, fibX2, fibWidth;
        if (this.style.extendLines) {
            // Full chart width
            fibX1 = xRange[0];
            fibX2 = xRange[1];
            fibWidth = chartWidth;
        } else {
            // Match the width of the drawn line (from point 1 to point 2)
            fibX1 = Math.min(x1, x2);
            fibX2 = Math.max(x1, x2);
            fibWidth = Math.abs(x2 - x1);
            
            // Ensure minimum width for visibility
            if (fibWidth < 50) {
                const centerX = (x1 + x2) / 2;
                fibWidth = 100;
                fibX1 = centerX - 50;
                fibX2 = centerX + 50;
            }
        }

        // Calculate price difference
        const priceDiff = p2.y - p1.y;
        
        // Get decimal places from price
        const priceDecimals = this.getPriceDecimals(p1.y);

        const reverse = !!this.style.reverse;
        const showPrices = this.style.showPrices !== false;
        const levelsEnabled = this.style.levelsEnabled !== false;
        const levelsLabelMode = (this.style.levelsLabelMode === 'percent' || this.style.levelsLabelMode === 'values') ? this.style.levelsLabelMode : 'values';
        const zonesEnabled = !!this.style.showZones;
        const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));

        const getPriceAtLevel = (levelValue) => {
            if (!reverse) return p1.y + (priceDiff * levelValue);
            return p1.y + (priceDiff * (1 - levelValue));
        };

        const formatLevelText = (level) => {
            if (levelsLabelMode === 'percent') {
                const pct = level.value * 100;
                const pctText = (Math.round(pct * 100) / 100).toString();
                return `${pctText}%`;
            }
            return (level.label != null && level.label !== '') ? `${level.label}` : `${level.value}`;
        };

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        // Draw each Fibonacci level
        for (let i = 0; i < this.levels.length; i++) {
            const level = this.levels[i];
            if (!level || !level.visible) continue;

            const priceAtLevel = getPriceAtLevel(level.value);
            const yAtLevel = scales.yScale(priceAtLevel);

            const nextLevel = this.levels[i + 1];
            if (zonesEnabled && nextLevel && nextLevel.visible) {
                const nextY = scales.yScale(getPriceAtLevel(nextLevel.value));
                this.group.insert('rect', ':first-child')
                    .attr('x', fibX1)
                    .attr('y', Math.min(yAtLevel, nextY))
                    .attr('width', fibWidth)
                    .attr('height', Math.abs(nextY - yAtLevel))
                    .attr('fill', level.color)
                    .attr('opacity', zoneOpacity)
                    .attr('rx', 2)
                    .style('pointer-events', 'none');
            }

            if (!levelsEnabled) continue;

            const levelDash = (globalLevelsDash !== null) ? globalLevelsDash : ((level.lineType != null) ? `${level.lineType}` : (level.value === 0 || level.value === 1 ? '' : '4,3'));
            const baseLevelWidth = (globalLevelsWidth !== null) ? globalLevelsWidth : ((level.lineWidth != null && !isNaN(parseInt(level.lineWidth))) ? parseInt(level.lineWidth) : baseLevelStrokeWidth);
            const scaledLevelWidth = Math.max(0.5, baseLevelWidth * scaleFactor);

            const levelHitWidth = Math.max(10, scaledLevelWidth * 6);

            // Hit area (solid, nearly invisible) so dashed lines are easy to click
            this.group.append('line')
                .attr('class', 'fib-level-hit')
                .attr('x1', fibX1)
                .attr('y1', yAtLevel)
                .attr('x2', fibX2)
                .attr('y2', yAtLevel)
                .attr('data-level', level.value)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', levelHitWidth)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw horizontal line at this level
            this.group.append('line')
                .attr('x1', fibX1)
                .attr('y1', yAtLevel)
                .attr('x2', fibX2)
                .attr('y2', yAtLevel)
                .attr('data-level', level.value)
                .attr('stroke', level.color)
                .attr('stroke-width', scaledLevelWidth)
                .attr('stroke-dasharray', levelDash)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke');

            // Draw level label
            const baseText = formatLevelText(level);
            const finalText = showPrices ? `${baseText} (${priceAtLevel.toFixed(priceDecimals)})` : baseText;
            const textX = fibX2 + 5;
            const textY = yAtLevel + 4;

            this.group.append('text')
                .attr('class', 'non-interactive-text')
                .attr('x', textX)
                .attr('y', textY)
                .attr('text-anchor', 'start')
                .attr('fill', level.color)
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .style('pointer-events', 'none')
                .style('cursor', 'default')
                .text(finalText);
        }

        // Draw main trend line connecting the two anchor points
        const trendEnabled = this.style.trendLineEnabled !== false;
        const trendColor = this.style.trendLineColor || this.style.stroke || '#787b86';
        const trendDash = (this.style.trendLineDasharray != null ? this.style.trendLineDasharray : (this.style.strokeDasharray || ''));
        const baseTrendWidth = (this.style.trendLineWidth != null ? this.style.trendLineWidth : (baseLevelStrokeWidth + 1));
        const scaledTrendWidth = Math.max(0.5, baseTrendWidth * scaleFactor);

        if (trendEnabled) {
            this.group.append('line')
                .attr('class', 'fib-trend-line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', trendColor)
                .attr('stroke-dasharray', trendDash)
                .attr('stroke-width', scaledTrendWidth)
                .attr('opacity', 0.6)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Create resize handles at anchor points
        this.createHandles(this.group, scales);

        return this.group;
    }
    
    getPriceDecimals(price) {
        // Determine decimal places based on price magnitude
        if (price >= 1000) return 2;
        if (price >= 1) return 4;
        return 5;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    static fromJSON(data, chart) {
        const fib = new FibonacciRetracementTool(data.points, data.style);
        fib.id = data.id;
        fib.visible = data.visible;
        fib.meta = data.meta;
        fib.chart = chart; // Set chart reference for multi-timeframe support
        if (data.levels) {
            fib.levels = data.levels.map(level => ({
                value: typeof level.value === 'number' ? level.value : parseFloat(level.value) || 0,
                label: level.label != null ? `${level.label}` : `${level.value}`,
                color: level.color || '#787b86',
                visible: level.visible !== false,
                lineType: level.lineType != null ? `${level.lineType}` : '',
                lineWidth: (level.lineWidth != null && !isNaN(parseInt(level.lineWidth))) ? parseInt(level.lineWidth) : 2
            }));
        }
        return fib;
    }
}

// ============================================================================
// Fibonacci Extension Tool
// ============================================================================
class FibonacciExtensionTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('fibonacci-extension', points, style);
        this.requiredPoints = 2;
        
        // Fibonacci extension levels (beyond 1.0)
        const defaultLevels = [
            { value: 0, label: '0', color: style.color0 || '#787b86', visible: true },
            { value: 0.618, label: '0.618', color: style.color618 || '#4caf50', visible: true },
            { value: 1, label: '1', color: style.color1 || '#787b86', visible: true },
            { value: 1.272, label: '1.272', color: style.color1272 || '#2196f3', visible: true },
            { value: 1.618, label: '1.618', color: style.color1618 || '#9c27b0', visible: true },
            { value: 2.618, label: '2.618', color: style.color2618 || '#e91e63', visible: true },
            { value: 4.236, label: '4.236', color: style.color4236 || '#f44336', visible: true }
        ];

        const providedLevels = Array.isArray(style.levels) ? style.levels : defaultLevels;
        this.levels = providedLevels.map(level => ({
            value: typeof level.value === 'number' ? level.value : parseFloat(level.value) || 0,
            label: level.label != null ? `${level.label}` : `${level.value}`,
            color: level.color || '#787b86',
            visible: level.visible !== false
        }));
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const baseLevelStrokeWidth = (this.style.strokeWidth != null ? this.style.strokeWidth : 2);
        const scaledStrokeWidth = Math.max(0.5, baseLevelStrokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing fibonacci-extension')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        // Get chart width for calculating zone width
        const xRange = scales.xScale.range();
        const chartWidth = xRange[1] - xRange[0];
        
        // Determine line width based on extend option
        let fibX1, fibX2, fibWidth;
        if (this.style.extendLines) {
            // Full chart width
            fibX1 = xRange[0];
            fibX2 = xRange[1];
            fibWidth = chartWidth;
        } else {
            // Match the width of the drawn line (from point 1 to point 2)
            fibX1 = Math.min(x1, x2);
            fibX2 = Math.max(x1, x2);
            fibWidth = Math.abs(x2 - x1);
            
            // Ensure minimum width for visibility
            if (fibWidth < 50) {
                const centerX = (x1 + x2) / 2;
                fibWidth = 100;
                fibX1 = centerX - 50;
                fibX2 = centerX + 50;
            }
        }

        // Calculate price difference
        const priceDiff = p2.y - p1.y;
        
        // Get decimal places from price
        const priceDecimals = this.getPriceDecimals(p1.y);

        const reverse = !!this.style.reverse;
        const showPrices = this.style.showPrices !== false;
        const levelsEnabled = this.style.levelsEnabled !== false;
        const levelsLabelMode = (this.style.levelsLabelMode === 'percent' || this.style.levelsLabelMode === 'values') ? this.style.levelsLabelMode : 'values';
        const zonesEnabled = !!this.style.showZones;
        const zoneOpacity = Math.max(0, Math.min(1, (this.style.backgroundOpacity != null && !isNaN(parseFloat(this.style.backgroundOpacity))) ? parseFloat(this.style.backgroundOpacity) : 0.08));

        const getPriceAtLevel = (levelValue) => {
            if (!reverse) return p1.y + (priceDiff * levelValue);
            return p1.y + (priceDiff * (1 - levelValue));
        };

        const formatLevelText = (level) => {
            if (levelsLabelMode === 'percent') {
                const pct = level.value * 100;
                const pctText = (Math.round(pct * 100) / 100).toString();
                return `${pctText}%`;
            }
            return (level.label != null && level.label !== '') ? `${level.label}` : `${level.value}`;
        };

        const globalLevelsDash = (this.style.levelsLineDasharray != null) ? `${this.style.levelsLineDasharray}` : null;
        const globalLevelsWidth = (this.style.levelsLineWidth != null && !isNaN(parseInt(this.style.levelsLineWidth))) ? parseInt(this.style.levelsLineWidth) : null;

        for (let i = 0; i < this.levels.length; i++) {
            const level = this.levels[i];
            if (!level || !level.visible) continue;

            const priceAtLevel = getPriceAtLevel(level.value);
            const yAtLevel = scales.yScale(priceAtLevel);

            const nextLevel = this.levels[i + 1];
            if (zonesEnabled && nextLevel && nextLevel.visible) {
                const nextY = scales.yScale(getPriceAtLevel(nextLevel.value));
                this.group.insert('rect', ':first-child')
                    .attr('x', fibX1)
                    .attr('y', Math.min(yAtLevel, nextY))
                    .attr('width', fibWidth)
                    .attr('height', Math.abs(nextY - yAtLevel))
                    .attr('fill', level.color)
                    .attr('opacity', zoneOpacity)
                    .attr('rx', 2)
                    .style('pointer-events', 'none');
            }

            if (!levelsEnabled) continue;

            const levelDash = (globalLevelsDash !== null) ? globalLevelsDash : ((level.lineType != null) ? `${level.lineType}` : (level.value === 0 || level.value === 1 ? '' : '4,3'));
            const baseLevelWidth = (globalLevelsWidth !== null) ? globalLevelsWidth : ((level.lineWidth != null && !isNaN(parseInt(level.lineWidth))) ? parseInt(level.lineWidth) : baseLevelStrokeWidth);
            const scaledLevelWidth = Math.max(0.5, baseLevelWidth * scaleFactor);

            const levelHitWidth = Math.max(10, scaledLevelWidth * 6);

            this.group.append('line')
                .attr('class', 'fib-level-hit')
                .attr('x1', fibX1)
                .attr('y1', yAtLevel)
                .attr('x2', fibX2)
                .attr('y2', yAtLevel)
                .attr('data-level', level.value)
                .attr('stroke', 'rgba(255,255,255,0.001)')
                .attr('stroke-width', levelHitWidth)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw horizontal line at this level
            this.group.append('line')
                .attr('x1', fibX1)
                .attr('y1', yAtLevel)
                .attr('x2', fibX2)
                .attr('y2', yAtLevel)
                .attr('data-level', level.value)
                .attr('stroke', level.color)
                .attr('stroke-width', scaledLevelWidth)
                .attr('stroke-dasharray', levelDash)
                .attr('opacity', 0.85)
                .style('pointer-events', 'stroke');

            // Draw level label
            const baseText = formatLevelText(level);
            const finalText = showPrices ? `${baseText} (${priceAtLevel.toFixed(priceDecimals)})` : baseText;
            const textX = fibX2 + 5;
            const textY = yAtLevel + 4;

            this.group.append('text')
                .attr('class', 'non-interactive-text')
                .attr('x', textX)
                .attr('y', textY)
                .attr('text-anchor', 'start')
                .attr('fill', level.color)
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .style('pointer-events', 'none')
                .style('cursor', 'default')
                .text(finalText);
        }

        // Draw main trend line
        const trendEnabled = this.style.trendLineEnabled !== false;
        const trendColor = this.style.trendLineColor || this.style.stroke || '#9c27b0';
        const trendDash = (this.style.trendLineDasharray != null ? this.style.trendLineDasharray : (this.style.strokeDasharray || ''));
        const baseTrendWidth = (this.style.trendLineWidth != null ? this.style.trendLineWidth : (baseLevelStrokeWidth + 1));
        const scaledTrendWidth = Math.max(0.5, baseTrendWidth * scaleFactor);

        if (trendEnabled) {
            this.group.append('line')
                .attr('class', 'fib-trend-line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', trendColor)
                .attr('stroke-dasharray', trendDash)
                .attr('stroke-width', scaledTrendWidth)
                .attr('opacity', 0.6)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Create resize handles
        this.createHandles(this.group, scales);

        return this.group;
    }
    
    getPriceDecimals(price) {
        if (price >= 1000) return 2;
        if (price >= 1) return 4;
        return 5;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            levels: this.levels
        };
    }

    static fromJSON(data, chart) {
        const fib = new FibonacciExtensionTool(data.points, data.style);
        fib.id = data.id;
        fib.visible = data.visible;
        fib.meta = data.meta;
        fib.chart = chart; // Set chart reference for multi-timeframe support
        if (data.levels) {
            fib.levels = data.levels.map(level => ({
                value: typeof level.value === 'number' ? level.value : parseFloat(level.value) || 0,
                label: level.label != null ? `${level.label}` : `${level.value}`,
                color: level.color || '#787b86',
                visible: level.visible !== false,
                lineType: level.lineType != null ? `${level.lineType}` : '',
                lineWidth: (level.lineWidth != null && !isNaN(parseInt(level.lineWidth))) ? parseInt(level.lineWidth) : 2
            }));
        }
        return fib;
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FibonacciRetracementTool,
        FibonacciExtensionTool
    };
}
