/**
 * Drawing Tools - Advanced Tools Module
 * Implements: Ruler/Measure, Risk-Reward, Path/Pen, Brush
 */

// ============================================================================
// Ruler/Measure Tool
// ============================================================================
class RulerTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('ruler', points, style);
        this.requiredPoints = 2;
        this.style.showLabel = style.showLabel !== false;
        this.style.labelBg = style.labelBg || 'rgba(41, 98, 255, 0.9)';
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing ruler')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Use chart.dataIndexToPixel for consistent coordinate conversion
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        // Draw the measurement line
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', this.style.stroke || '#787b86')
            .attr('stroke-width', this.style.strokeWidth || 2)
            .attr('stroke-dasharray', '4,4')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Calculate measurements
        const priceDiff = p2.y - p1.y;
        const pricePercent = ((priceDiff / p1.y) * 100).toFixed(2);
        const timeDiff = p2.x - p1.x;
        const timeDiffMs = timeDiff;
        
        // Format time difference
        let timeStr;
        const minutes = Math.floor(timeDiffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            timeStr = `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            timeStr = `${hours}h ${minutes % 60}m`;
        } else {
            timeStr = `${minutes}m`;
        }

        // Draw measurement label if enabled
        if (this.style.showLabel) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            // Create label text
            const labelText = [
                `Δ Price: ${Math.abs(priceDiff).toFixed(5)} (${pricePercent}%)`,
                `Δ Time: ${timeStr}`,
                `Bars: ${Math.abs(Math.floor(timeDiff / 60000))}`
            ];

            // Calculate label dimensions
            const padding = 8;
            const lineHeight = 14;
            const labelHeight = (labelText.length * lineHeight) + (padding * 2);
            const labelWidth = 180;

            // Draw label background
            this.group.append('rect')
                .attr('x', midX - labelWidth / 2)
                .attr('y', midY - labelHeight / 2)
                .attr('width', labelWidth)
                .attr('height', labelHeight)
                .attr('fill', this.style.labelBg)
                .attr('rx', 4)
                .attr('stroke', this.style.stroke || '#787b86')
                .attr('stroke-width', 1)
                .style('pointer-events', 'none');

            // Draw label text lines
            const textGroup = this.group.append('text')
                .attr('x', midX)
                .attr('y', midY - labelHeight / 2 + padding + lineHeight - 2)
                .attr('text-anchor', 'middle')
                .attr('fill', '#FFFFFF')
                .attr('font-size', '11px')
                .attr('font-weight', '500')
                .style('pointer-events', 'none');

            labelText.forEach((line, i) => {
                textGroup.append('tspan')
                    .attr('x', midX)
                    .attr('dy', i === 0 ? 0 : lineHeight)
                    .text(line);
            });
        }

        // Create resize handles
        this.createHandles(this.group, scales);

        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new RulerTool(data.points, data.style);
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

class DatePriceRangeTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('date-price-range', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.strokeDasharray = style.strokeDasharray || '';
        this.style.fill = style.fill || 'rgba(41, 98, 255, 0.15)';
        this.style.showBackground = style.showBackground !== false;
        this.style.borderEnabled = style.borderEnabled !== false;
        this.style.borderColor = style.borderColor || this.style.stroke;
        this.style.borderDasharray = style.borderDasharray || '';
        this.style.borderWidth = style.borderWidth || 1;
        this.style.showLabel = style.showLabel !== false;
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 12;
        this.style.showLabelBackground = style.showLabelBackground !== false;
        this.style.labelBackgroundColor = style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)';
        this.style.infoSettings = style.infoSettings || {
            showInfo: true,
            priceRange: true,
            percentChange: true,
            changeInPips: true,
            barsRange: true,
            dateTimeRange: true
        };
    }

    normalizeNegativeZeroString(s) {
        const n = Number(s);
        if (n === 0) return s.replace(/^-/, '');
        return s;
    }

    getSignedColor(value, neutralColor) {
        if (!isFinite(value) || value === 0) return neutralColor;
        return value > 0 ? '#22c55e' : '#ef4444';
    }

    buildRangeInfoLines(p1, p2, scales) {
        const info = this.style.infoSettings || {};
        if (info.showInfo === false) return [];

        const tickSize = this.getTickSize(scales);
        const decimals = this.getPriceDecimals(scales);

        const priceDiff = p2.y - p1.y;
        const pct = (p1.y !== 0) ? (priceDiff / p1.y * 100) : 0;
        const ticks = tickSize ? Math.round(priceDiff / tickSize) : 0;

        let priceDiffStr = this.normalizeNegativeZeroString(priceDiff.toFixed(decimals));
        let pctStr = this.normalizeNegativeZeroString(pct.toFixed(2));

        const bars = Math.abs(Math.round(p2.x) - Math.round(p1.x));
        const t1 = this.getTimestampAtIndex(Math.round(p1.x), scales);
        const t2 = this.getTimestampAtIndex(Math.round(p2.x), scales);
        const duration = this.formatDuration(t2 - t1);

        const neutral = this.style.textColor || '#d1d4dc';
        const priceParts = [];
        if (info.priceRange !== false) priceParts.push(priceDiffStr);
        if (info.percentChange !== false) priceParts.push(`(${pctStr}%)`);
        if (info.changeInPips !== false) priceParts.push(`${ticks}`);
        const priceLine = priceParts.length > 0 ? priceParts.join(' ') : '';

        const timeParts = [];
        if (info.barsRange !== false) timeParts.push(`${bars} bars`);
        if (info.dateTimeRange !== false) timeParts.push(`${duration}`);
        const timeLine = timeParts.length > 0 ? timeParts.join(', ') : '';

        const lines = [];
        if (priceLine) {
            lines.push({ text: priceLine, fill: this.getSignedColor(priceDiff, neutral) });
        }
        if (timeLine) {
            lines.push({ text: timeLine, fill: neutral });
        }
        return lines;
    }

    getTickSize(scales) {
        const chart = scales?.chart || this.chart;
        const ts = chart?.priceScale?.tickSize;
        if (typeof ts === 'number' && isFinite(ts) && ts > 0 && ts !== 0.01) return ts;
        const decimals = this.getPriceDecimals(scales);
        if (typeof decimals === 'number' && isFinite(decimals) && decimals >= 0) {
            return Math.pow(10, -decimals);
        }
        return 0.0001;
    }

    getPriceDecimals(scales) {
        const chart = scales?.chart || this.chart;
        if (typeof chart?.priceDecimals === 'number' && isFinite(chart.priceDecimals)) return chart.priceDecimals;
        if (typeof chart?.getPriceDecimals === 'function' && chart?.yScale) {
            const d = chart.yScale.domain();
            const range = (Array.isArray(d) && d.length === 2) ? (d[1] - d[0]) : 0;
            const dec = chart.getPriceDecimals(Math.abs(range));
            if (typeof dec === 'number' && isFinite(dec)) return dec;
        }
        const tickSize = this.getTickSize(scales);
        const s = String(tickSize);
        if (s.includes('e-')) {
            const exp = parseInt(s.split('e-')[1], 10);
            return isNaN(exp) ? 5 : exp;
        }
        const dot = s.indexOf('.');
        return dot === -1 ? 2 : (s.length - dot - 1);
    }

    getTimestampAtIndex(index, scales) {
        const chart = scales?.chart || this.chart;
        const data = chart?.data || [];
        const timeframe = chart?.currentTimeframe || null;
        return CoordinateUtils.indexToTimestamp(index, data, timeframe);
    }

    formatDuration(ms) {
        const absMs = Math.abs(ms);
        const minutes = Math.floor(absMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const minsRemainder = minutes % 60;
        const minsStr = String(minsRemainder).padStart(2, '0');
        if (days > 0) return `${days}d ${hours % 24}h ${minsStr}m`;
        if (hours > 0) return `${hours}h ${minsStr}m`;
        return `${minutes}m`;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing date-price-range')
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

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const midX = (left + right) / 2;
        const midY = (top + bottom) / 2;

        const svg = d3.select(container.node().ownerSVGElement);
        const markerRight = `dpr-right-${this.id}`;
        const markerDown = `dpr-down-${this.id}`;
        if (typeof SVGHelpers !== 'undefined') {
            SVGHelpers.createArrowMarker(svg, markerRight, this.style.stroke || '#2962ff');
            SVGHelpers.createArrowMarker(svg, markerDown, this.style.stroke || '#2962ff');
        }

        const selectionRect = this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', Math.max(0, right - left))
            .attr('height', Math.max(0, bottom - top))
            .attr('fill', this.style.showBackground ? this.style.fill : 'transparent')
            .attr('stroke', this.style.borderEnabled ? this.style.borderColor : 'none')
            .attr('stroke-width', this.style.borderEnabled ? this.style.borderWidth : 0)
            .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left).attr('y1', midY)
            .attr('x2', right).attr('y2', midY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('marker-end', `url(#${markerRight})`)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', midX).attr('y1', top)
            .attr('x2', midX).attr('y2', bottom)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('marker-end', `url(#${markerDown})`)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this.style.showLabel) {
            const lines = this.buildRangeInfoLines(p1, p2, scales);
            if (lines.length === 0) {
                this.createHandles(this.group, scales);
                return this.group;
            }

            const labelGroup = this.group.append('g')
                .attr('class', 'date-price-range-label')
                .style('pointer-events', 'none');

            const baseY = bottom + 34;
            const text = labelGroup.append('text')
                .attr('x', midX)
                .attr('y', baseY)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.textColor || '#d1d4dc')
                .attr('font-size', `${this.style.fontSize || 12}px`)
                .attr('font-weight', '600')
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif');

            const fontSize = parseInt(this.style.fontSize || 12);
            const lineHeight = Math.max(14, Math.round(fontSize * 1.4));
            lines.forEach((line, idx) => {
                text.append('tspan')
                    .attr('x', midX)
                    .attr('y', baseY + (idx * lineHeight))
                    .attr('font-weight', idx === 0 ? '600' : '500')
                    .attr('fill', line.fill || (this.style.textColor || '#d1d4dc'))
                    .text(line.text);
            });

            const bbox = labelGroup.node().getBBox();
            if (this.style.showLabelBackground) {
                labelGroup.insert('rect', 'text')
                    .attr('x', bbox.x - 18)
                    .attr('y', bbox.y - 12)
                    .attr('width', bbox.width + 36)
                    .attr('height', bbox.height + 24)
                    .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                    .attr('stroke', this.style.borderEnabled ? (this.style.borderColor || '#2a2e39') : 'none')
                    .attr('stroke-width', this.style.borderEnabled ? (this.style.borderWidth || 1) : 0)
                    .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
                    .attr('rx', 8);
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new DatePriceRangeTool(data.points, data.style);
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

class PriceRangeTool extends DatePriceRangeTool {
    constructor(points = [], style = {}) {
        super(points, style);
        this.type = 'price-range';
        this.requiredPoints = 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing price-range')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

        const priceDiff = p2.y - p1.y;
        const isDown = priceDiff < 0;

        const selectionWidth = this.style.selectionWidth || 70;
        const left = x - selectionWidth / 2;
        const right = x + selectionWidth / 2;

        const svg = d3.select(container.node().ownerSVGElement);
        const markerStart = `pr-start-${this.id}`;
        const markerEnd = `pr-end-${this.id}`;
        if (typeof SVGHelpers !== 'undefined') {
            SVGHelpers.createArrowMarker(svg, markerStart, this.style.stroke || '#2962ff', true);
            SVGHelpers.createArrowMarker(svg, markerEnd, this.style.stroke || '#2962ff');
        }

        const selectionRect = this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', selectionWidth)
            .attr('height', Math.max(0, bottom - top))
            .attr('fill', this.style.showBackground ? this.style.fill : 'transparent')
            .attr('stroke', this.style.borderEnabled ? this.style.borderColor : 'none')
            .attr('stroke-width', this.style.borderEnabled ? this.style.borderWidth : 0)
            .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left).attr('y1', top)
            .attr('x2', right).attr('y2', top)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (isDown) {
            this.group.append('line')
                .attr('x1', left).attr('y1', bottom)
                .attr('x2', right).attr('y2', bottom)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || null)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.group.append('line')
            .attr('x1', x).attr('y1', isDown ? top : bottom)
            .attr('x2', x).attr('y2', isDown ? bottom : top)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('marker-end', `url(#${markerEnd})`)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this.style.showLabel) {
            const tickSize = this.getTickSize(scales);
            const decimals = this.getPriceDecimals(scales);
            const pct = (p1.y !== 0) ? (priceDiff / p1.y * 100) : 0;
            const ticks = tickSize ? Math.round(priceDiff / tickSize) : 0;

            const priceDiffStr = this.normalizeNegativeZeroString(priceDiff.toFixed(decimals));
            const pctStr = this.normalizeNegativeZeroString(pct.toFixed(2));

            const label = `${priceDiffStr} (${pctStr}%) ${ticks}`;
            if (!label) {
                this.createHandles(this.group, scales);
                return this.group;
            }

            const labelGroup = this.group.append('g').style('pointer-events', 'none');
            const labelY = isDown ? (bottom + 34) : (top - 12);
            const text = labelGroup.append('text')
                .attr('x', x)
                .attr('y', labelY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'auto')
                .attr('fill', this.style.textColor || '#d1d4dc')
                .attr('font-size', `${this.style.fontSize || 12}px`)
                .attr('font-weight', '600')
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .text('');

            const neutral = this.style.textColor || '#d1d4dc';
            text.append('tspan')
                .attr('x', x)
                .attr('dy', 0)
                .attr('fill', neutral)
                .text(label);

            const bbox = text.node().getBBox();
            if (this.style.showLabelBackground) {
                labelGroup.insert('rect', 'text')
                    .attr('x', bbox.x - 16)
                    .attr('y', bbox.y - 10)
                    .attr('width', bbox.width + 32)
                    .attr('height', bbox.height + 20)
                    .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                    .attr('stroke', this.style.borderEnabled ? (this.style.borderColor || '#2a2e39') : 'none')
                    .attr('stroke-width', this.style.borderEnabled ? (this.style.borderWidth || 1) : 0)
                    .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
                    .attr('rx', 8);
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new PriceRangeTool(data.points, data.style);
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

class DateRangeTool extends DatePriceRangeTool {
    constructor(points = [], style = {}) {
        super(points, style);
        this.type = 'date-range';
        this.requiredPoints = 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing date-range')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y = scales.yScale(p1.y);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const midX = (left + right) / 2;

        const selectionHeight = this.style.selectionHeight || 70;
        const top = y - selectionHeight / 2;
        const bottom = y + selectionHeight / 2;

        const svg = d3.select(container.node().ownerSVGElement);
        const markerStart = `dr-start-${this.id}`;
        const markerEnd = `dr-end-${this.id}`;
        if (typeof SVGHelpers !== 'undefined') {
            SVGHelpers.createArrowMarker(svg, markerStart, this.style.stroke || '#2962ff', true);
            SVGHelpers.createArrowMarker(svg, markerEnd, this.style.stroke || '#2962ff');
        }

        const selectionRect = this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', Math.max(0, right - left))
            .attr('height', selectionHeight)
            .attr('fill', this.style.showBackground ? this.style.fill : 'transparent')
            .attr('stroke', this.style.borderEnabled ? this.style.borderColor : 'none')
            .attr('stroke-width', this.style.borderEnabled ? this.style.borderWidth : 0)
            .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left).attr('y1', top)
            .attr('x2', left).attr('y2', bottom)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', right).attr('y1', top)
            .attr('x2', right).attr('y2', bottom)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', left).attr('y1', y)
            .attr('x2', right).attr('y2', y)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('marker-start', `url(#${markerStart})`)
            .attr('marker-end', `url(#${markerEnd})`)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        if (this.style.showLabel) {
            const bars = Math.abs(Math.round(p2.x) - Math.round(p1.x));
            const t1 = this.getTimestampAtIndex(Math.round(p1.x), scales);
            const t2 = this.getTimestampAtIndex(Math.round(p2.x), scales);
            const duration = this.formatDuration(t2 - t1);

            const label = `${bars} bars, ${duration}`;
            if (!label) {
                this.createHandles(this.group, scales);
                return this.group;
            }

            const labelGroup = this.group.append('g').style('pointer-events', 'none');
            const text = labelGroup.append('text')
                .attr('x', midX)
                .attr('y', top - 12)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.textColor || '#d1d4dc')
                .attr('font-size', `${this.style.fontSize || 12}px`)
                .attr('font-weight', '600')
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .text(label);

            const bbox = text.node().getBBox();
            if (this.style.showLabelBackground) {
                labelGroup.insert('rect', 'text')
                    .attr('x', bbox.x - 16)
                    .attr('y', bbox.y - 10)
                    .attr('width', bbox.width + 32)
                    .attr('height', bbox.height + 20)
                    .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                    .attr('stroke', this.style.borderEnabled ? (this.style.borderColor || '#2a2e39') : 'none')
                    .attr('stroke-width', this.style.borderEnabled ? (this.style.borderWidth || 1) : 0)
                    .attr('stroke-dasharray', this.style.borderEnabled ? (this.style.borderDasharray || null) : null)
                    .attr('rx', 8);
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new DateRangeTool(data.points, data.style);
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
// Risk-Reward Tools
// ============================================================================
class BaseRiskRewardTool extends BaseDrawing {
    constructor(type, points = [], style = {}) {
        super(type, points, style);
        this.requiredPoints = 3; // Entry, Stop, Target
        this.style.riskColor = style.riskColor || 'rgba(242, 54, 69, 0.25)';
        this.style.rewardColor = style.rewardColor || 'rgba(8, 153, 129, 0.25)';
        this.style.entryColor = style.entryColor || '#787b86';
        this.meta.orientation = style.orientation || 'long';
        if (typeof this.meta.zoneWidth !== 'number') {
            this.meta.zoneWidth = null;
        }
        this.lastRenderMeta = null;
        this.ensureRiskSettings();
    }

    get isLong() {
        return this.meta.orientation === 'long';
    }

    ensureRiskSettings() {
        // Get actual balance from order manager if available
        let actualBalance = 10000; // Default fallback
        if (window.chart && window.chart.orderManager) {
            actualBalance = window.chart.orderManager.balance || 10000;
        }
        
        if (!this.meta.risk) {
            this.meta.risk = {
                accountSize: actualBalance,
                lotSize: 0.01,
                leverage: 1,
                riskPercent: 1,
                riskMode: 'risk-usd',
                riskAmountUSD: 100
            };
        } else {
            // Sync account size with actual balance
            this.meta.risk.accountSize = actualBalance;
        }

        if (!Array.isArray(this.points) || this.points.length < 1) {
            return;
        }

        const entry = this.points[0];
        const stop = this.points[1] || entry;
        const target = this.points[2] || entry;

        const entryPrice = entry.y;
        const stopDiff = Math.abs(entryPrice - stop.y);
        const profitDiff = Math.abs(target.y - entryPrice);
        const riskPercent = entryPrice !== 0 ? (stopDiff / Math.abs(entryPrice)) * 100 : 0;
        const rewardRatio = stopDiff > 0 ? profitDiff / stopDiff : 0;

        this.meta.risk = {
            ...this.meta.risk, // Preserve existing settings
            accountSize: actualBalance, // Always use current balance
            entryPrice,
            stopPrice: stop.y,
            targetPrice: target.y,
            stopTicks: parseFloat(stopDiff.toFixed(5)),
            profitTicks: parseFloat(profitDiff.toFixed(5)),
            rewardRatio: parseFloat(rewardRatio.toFixed(2)),
            riskAmount: parseFloat(((actualBalance) * (riskPercent / 100)).toFixed(2))
        };
    }

    sanitizeStopPrice(price) {
        if (!Array.isArray(this.points) || this.points.length === 0) return price;
        const entryPrice = this.points[0].y;
        const epsilon = 0.00001;
        if (this.isLong) {
            return price < entryPrice - epsilon ? price : entryPrice - epsilon;
        }
        return price > entryPrice + epsilon ? price : entryPrice + epsilon;
    }

    sanitizeTargetPrice(price) {
        if (!Array.isArray(this.points) || this.points.length === 0) return price;
        const entryPrice = this.points[0].y;
        const epsilon = 0.00001;
        if (this.isLong) {
            return price > entryPrice + epsilon ? price : entryPrice + epsilon;
        }
        return price < entryPrice - epsilon ? price : entryPrice - epsilon;
    }

    setEntryPrice(price) {
        if (!Array.isArray(this.points) || this.points.length === 0) return;
        const delta = price - this.points[0].y;
        this.points = this.points.map(point => ({ ...point, y: point.y + delta }));
        this.ensureRiskSettings();
        this.recalculateLotSizeFromRisk(); // Recalculate to maintain constant risk
    }

    setStopPrice(price) {
        if (!Array.isArray(this.points) || this.points.length < 2) return;
        const entry = this.points[0];
        const sanitized = this.sanitizeStopPrice(price);
        this.points[1] = { ...this.points[1], y: sanitized };
        this.ensureRiskSettings();
        this.recalculateLotSizeFromRisk(); // Recalculate to maintain constant risk
    }

    setTargetPrice(price) {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const entry = this.points[0];
        const sanitized = this.sanitizeTargetPrice(price);
        this.points[2] = { ...this.points[2], y: sanitized };
        this.ensureRiskSettings();
    }
    
    recalculateLotSizeFromRisk() {
        if (!this.meta.risk) return;
        
        const entry = this.meta.risk.entryPrice || 0;
        const stop = this.meta.risk.stopPrice || 0;
        const slDistance = Math.abs(entry - stop);
        
        if (slDistance === 0 || entry === 0) {
            this.meta.risk.lotSize = 0.01;
            return;
        }
        
        // Get risk amount in USD
        let riskUSD = 0;
        if (this.meta.risk.riskMode === 'risk-usd') {
            riskUSD = this.meta.risk.riskAmountUSD || 100;
        } else {
            const accountSize = this.meta.risk.accountSize || 10000;
            riskUSD = (accountSize * (this.meta.risk.riskPercent || 1)) / 100;
        }
        
        // Calculate lot size using proper pip value formula
        const slPips = slDistance / 0.0001;
        const pipValue = 10;
        const calculatedLots = riskUSD / (slPips * pipValue);
        this.meta.risk.lotSize = Math.max(0.01, calculatedLots);
        
        console.log(`🔄 Lot size recalculated: ${this.meta.risk.lotSize.toFixed(2)} lots for risk $${riskUSD.toFixed(2)} @ ${slPips.toFixed(1)} pips`);
    }

    setAccountSize(value) {
        if (!this.meta.risk) this.meta.risk = {};
        this.meta.risk.accountSize = value;
        this.ensureRiskSettings();
    }

    setLotSize(value) {
        if (!this.meta.risk) this.meta.risk = {};
        this.meta.risk.lotSize = value;
        this.ensureRiskSettings();
    }

    setLeverage(value) {
        if (!this.meta.risk) this.meta.risk = {};
        this.meta.risk.leverage = value;
        this.ensureRiskSettings();
    }

    setRiskPercent(percent) {
        if (!this.meta.risk) this.meta.risk = {};
        this.meta.risk.riskPercent = percent;
        this.applyRiskPercent(percent);
    }

    setStopTicks(ticks) {
        if (!Array.isArray(this.points) || this.points.length < 2) return;
        const entryPrice = this.points[0].y;
        const offset = Math.abs(ticks);
        const price = this.isLong ? entryPrice - offset : entryPrice + offset;
        this.setStopPrice(price);
    }

    setTargetTicks(ticks) {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const entryPrice = this.points[0].y;
        const offset = Math.abs(ticks);
        const price = this.isLong ? entryPrice + offset : entryPrice - offset;
        this.setTargetPrice(price);
    }

    applyRiskPercent(percent) {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const entry = this.points[0];
        const stop = this.points[1];
        const target = this.points[2];

        const entryPrice = entry.y;
        const currentStopDiff = Math.abs(stop.y - entryPrice) || 1;
        const currentTargetDiff = Math.abs(target.y - entryPrice);
        const rewardRatio = currentStopDiff > 0 ? currentTargetDiff / currentStopDiff : 1;

        const desiredStopDiff = Math.abs(entryPrice) > 0 ? Math.abs(entryPrice) * (percent / 100) : Math.abs(percent);
        const newStop = this.isLong ? entryPrice - desiredStopDiff : entryPrice + desiredStopDiff;
        const newTargetDiff = desiredStopDiff * (rewardRatio || 1);
        const newTarget = this.isLong ? entryPrice + newTargetDiff : entryPrice - newTargetDiff;

        const entryX = entry.x;
        this.points = [
            { ...entry, x: entryX, y: entryPrice },
            { ...stop, x: entryX, y: this.sanitizeStopPrice(newStop) },
            { ...target, x: entryX, y: this.sanitizeTargetPrice(newTarget) }
        ];

        this.meta.risk.riskPercent = percent;
        this.ensureRiskSettings();
    }

    updatePointsFromDrag(entry, current) {
        const riskTargetDiff = current.y - entry.y;
        const stopPrice = this.isLong ? entry.y - Math.abs(riskTargetDiff) : entry.y + Math.abs(riskTargetDiff);
        const targetPrice = this.isLong ? entry.y + Math.abs(riskTargetDiff) : entry.y - Math.abs(riskTargetDiff);
        this.points = [entry, { x: current.x, y: stopPrice }, { x: current.x, y: targetPrice }];
        this.ensureRiskSettings();
    }

    addExecuteButton(entryX, entryY, entry, stop, target, zoneWidth) {
        const buttonWidth = 90;
        const buttonHeight = 26;
        const buttonX = entryX + zoneWidth + 15; // Position to the right of zones
        const buttonY = entryY - buttonHeight / 2;

        // Check if already executed
        if (this.meta.executed) {
            // Show "Executed" text instead of button
            this.group.append('rect')
                .attr('x', buttonX)
                .attr('y', buttonY)
                .attr('width', buttonWidth)
                .attr('height', buttonHeight)
                .attr('fill', '#4b5563')
                .attr('rx', 4)
                .style('opacity', 0.5);
            
            this.group.append('text')
                .attr('x', buttonX + buttonWidth / 2)
                .attr('y', buttonY + buttonHeight / 2 + 4)
                .attr('text-anchor', 'middle')
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .style('pointer-events', 'none')
                .text('✓ Executed');
            return;
        }

        // Button background
        const btnBg = this.group.append('rect')
            .attr('x', buttonX)
            .attr('y', buttonY)
            .attr('width', buttonWidth)
            .attr('height', buttonHeight)
            .attr('fill', this.isLong ? '#22c55e' : '#ef4444')
            .attr('rx', 4)
            .style('cursor', 'pointer')
            .style('opacity', 0.9);

        // Button text
        const btnText = this.group.append('text')
            .attr('x', buttonX + buttonWidth / 2)
            .attr('y', buttonY + buttonHeight / 2 + 4)
            .attr('text-anchor', 'middle')
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .style('pointer-events', 'none')
            .text('Execute');

        // Hover effects
        btnBg.on('mouseover', function() {
            d3.select(this).style('opacity', 1);
        }).on('mouseout', function() {
            d3.select(this).style('opacity', 0.9);
        });

        // Click handler - can only be clicked once
        btnBg.on('click', (event) => {
            event.stopPropagation();
            
            // Mark as executed to prevent double-click
            if (this.meta.executed) {
                return;
            }
            this.meta.executed = true;
            
            // Execute the order
            this.executeOrder(entry, stop, target);
            
            // Disable button visually
            btnBg
                .attr('fill', '#4b5563')
                .style('cursor', 'not-allowed')
                .style('opacity', 0.5);
            
            btnText.text('✓ Executed');
            
            // Remove hover effects
            btnBg.on('mouseover', null).on('mouseout', null);
        });
    }

    executeOrder(entry, stop, target) {
        // Access the order manager from the global chart object
        if (!window.chart || !window.chart.orderManager) {
            alert('❌ Order manager not available');
            console.error('Order manager not found on window.chart');
            return;
        }

        const orderManager = window.chart.orderManager;

        // Check if replay mode is active
        if (!orderManager.replaySystem || !orderManager.replaySystem.isActive) {
            alert('⚠️ Replay mode must be active to place orders');
            return;
        }

        // Ensure risk settings are calculated
        this.ensureRiskSettings();

        const direction = this.isLong ? 'BUY' : 'SELL';
        
        // Use the calculated values from meta.risk (more reliable than raw points)
        const entryPrice = this.meta.risk?.entryPrice || entry.y;
        const slPrice = this.meta.risk?.stopPrice || stop.y;
        const tpPrice = this.meta.risk?.targetPrice || target.y;

        console.log(`🚀 Executing ${direction} order from Risk-Reward tool:`);
        console.log(`   Entry: ${entryPrice.toFixed(5)}`);
        console.log(`   SL: ${slPrice.toFixed(5)}`);
        console.log(`   TP: ${tpPrice.toFixed(5)}`);

        // Get lot size from risk settings or use default
        const quantity = this.meta.risk?.lotSize || 0.01;
        const riskAmount = this.meta.risk?.riskAmountUSD || this.meta.risk?.riskAmount || 100;

        // Open the order panel FIRST, then pre-fill values after panel initialization
        if (typeof orderManager.openOrderPanel === 'function') {
            orderManager.openOrderPanel();
        } else if (typeof orderManager.toggleOrderPanel === 'function') {
            orderManager.toggleOrderPanel();
        }
        
        // Pre-fill values AFTER panel opens (need delay because toggleOrderPanel resets values)
        const self = this;
        setTimeout(() => {
            self.prefillOrderPanel(orderManager, direction, entryPrice, slPrice, tpPrice, quantity, riskAmount);
            console.log('📋 Order panel pre-filled with position tool values');
        }, 200);
        
        // Mark as executed for visual feedback
        this.meta.executed = true;
        if (this.manager) {
            this.manager.renderDrawing(this);
        }
    }

    prefillOrderPanel(orderManager, direction, entryPrice, slPrice, tpPrice, quantity, riskAmount) {
        console.log(`📋 Prefilling order panel:`);
        console.log(`   Direction: ${direction}`);
        console.log(`   Entry: ${entryPrice}`);
        console.log(`   SL: ${slPrice}`);
        console.log(`   TP: ${tpPrice}`);
        
        // Set flags to prevent auto-recalculation from overwriting our values
        orderManager.tpManuallyPositioned = true;
        orderManager.slManuallyPositioned = true;
        
        // Determine order type based on entry price vs current price
        // Get current price from chart data (same method as order manager)
        let currentPrice = 0;
        if (orderManager.getCurrentCandle) {
            const candle = orderManager.getCurrentCandle();
            currentPrice = candle?.c || candle?.close || 0;
        }
        if (!currentPrice && orderManager.chart?.latestCandle) {
            currentPrice = orderManager.chart.latestCandle.close || 0;
        }
        if (!currentPrice && orderManager.chart?.data?.length > 0) {
            const lastCandle = orderManager.chart.data[orderManager.chart.data.length - 1];
            currentPrice = lastCandle?.close || lastCandle?.c || 0;
        }
        
        let orderType = 'limit'; // Default to limit for pending orders
        
        if (currentPrice > 0) {
            const priceDiff = entryPrice - currentPrice;
            const tolerance = currentPrice * 0.0001; // 0.01% tolerance for "at market"
            
            console.log(`   Price comparison: Entry=${entryPrice.toFixed(5)}, Current=${currentPrice.toFixed(5)}, Diff=${priceDiff.toFixed(5)}`);
            
            if (Math.abs(priceDiff) <= tolerance) {
                // Entry is at current price - Market order
                orderType = 'market';
            } else if (direction === 'BUY') {
                // BUY: Limit if entry < current (buy lower), Stop if entry > current (buy on breakout)
                orderType = priceDiff < 0 ? 'limit' : 'stop';
            } else {
                // SELL: Limit if entry > current (sell higher), Stop if entry < current (sell on breakdown)
                orderType = priceDiff > 0 ? 'limit' : 'stop';
            }
        }
        
        console.log(`   Current Price: ${currentPrice}, Order Type: ${orderType}`);
        
        // Set order type on manager
        orderManager.orderType = orderType;
        
        // Update order type buttons in UI
        const orderTypeBtns = document.querySelectorAll('.order-type-btn');
        orderTypeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.type === orderType) {
                btn.classList.add('active');
            }
        });
        
        // Set order side
        orderManager.orderSide = direction;

        // Update the UI tabs
        const buyTab = document.getElementById('buyTab');
        const sellTab = document.getElementById('sellTab');
        const placeBtn = document.getElementById('placeOrderButton');
        
        if (buyTab && sellTab && placeBtn) {
            if (direction === 'BUY') {
                buyTab.style.background = '#22c55e';
                buyTab.style.color = 'white';
                sellTab.style.background = 'rgba(239, 68, 68, 0.2)';
                sellTab.style.color = '#ef4444';
                placeBtn.style.background = '#22c55e';
            } else {
                sellTab.style.background = '#ef4444';
                sellTab.style.color = 'white';
                buyTab.style.background = 'rgba(34, 197, 94, 0.2)';
                buyTab.style.color = '#22c55e';
                placeBtn.style.background = '#ef4444';
            }
        }

        // Fill in the entry price
        const entryInput = document.getElementById('orderEntryPrice');
        if (entryInput) {
            entryInput.value = entryPrice.toFixed(5);
            entryInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Enable and fill TP
        const enableTP = document.getElementById('enableTP');
        const tpInput = document.getElementById('tpPrice');
        if (enableTP && tpInput) {
            enableTP.checked = true;
            enableTP.dispatchEvent(new Event('change', { bubbles: true }));
            tpInput.value = tpPrice.toFixed(5);
            tpInput.dispatchEvent(new Event('input', { bubbles: true }));
            const tpInputs = document.getElementById('tpInputs');
            if (tpInputs) tpInputs.style.display = 'grid';
            console.log(`   TP input set to: ${tpInput.value}`);
        }

        // Enable and fill SL
        const enableSL = document.getElementById('enableSL');
        const slInput = document.getElementById('slPrice');
        if (enableSL && slInput) {
            enableSL.checked = true;
            enableSL.dispatchEvent(new Event('change', { bubbles: true }));
            slInput.value = slPrice.toFixed(5);
            slInput.dispatchEvent(new Event('input', { bubbles: true }));
            const slInputs = document.getElementById('slInputs');
            if (slInputs) slInputs.style.display = 'grid';
            console.log(`   SL input set to: ${slInput.value}`);
        }

        // Update calculated lot size display
        const calculatedLots = document.getElementById('calculatedLots');
        if (calculatedLots) {
            calculatedLots.textContent = `${quantity.toFixed(2)} Lots`;
        }
        
        // Also set on orderManager for calculations
        if (orderManager.tpPrice !== undefined) orderManager.tpPrice = tpPrice;
        if (orderManager.slPrice !== undefined) orderManager.slPrice = slPrice;
        if (orderManager.entryPrice !== undefined) orderManager.entryPrice = entryPrice;
    }

    render(container, scales) {
        this.ensureRiskSettings();
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 3) return;

        this.group = container.append('g')
            .attr('class', `drawing risk-reward ${this.meta.orientation}`)
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        this.handles = [];

        const entry = this.points[0];
        const stop = this.points[1];
        const target = this.points[2];

        const xRange = scales.xScale.range();
        const chartWidth = xRange[1] - xRange[0];
        const defaultWidth = Math.min(chartWidth * 0.25, 320);
        const minWidth = 24;
        let zoneWidth = typeof this.meta.zoneWidth === 'number' ? this.meta.zoneWidth : defaultWidth;
        if (!zoneWidth || Number.isNaN(zoneWidth)) {
            zoneWidth = defaultWidth;
        }
        zoneWidth = Math.max(minWidth, zoneWidth);
        this.meta.zoneWidth = zoneWidth;

        const entryX = scales.chart && scales.chart.dataIndexToPixel ?
            scales.chart.dataIndexToPixel(entry.x) : scales.xScale(entry.x);

        const zoneX1 = entryX;
        const zoneX2 = entryX + zoneWidth;

        const entryY = scales.yScale(entry.y);
        const stopY = scales.yScale(stop.y);
        const targetY = scales.yScale(target.y);

        const riskHeight = Math.abs(stopY - entryY);
        const rewardHeight = Math.abs(targetY - entryY);
        const risk = Math.max(Math.abs(entry.y - stop.y), 0.0000001);
        const reward = Math.abs(target.y - entry.y);
        const rrRatio = (reward / risk).toFixed(2);

        this.group.insert('rect', ':first-child')
            .attr('class', 'position-zone')
            .attr('x', zoneX1)
            .attr('y', Math.min(entryY, stopY))
            .attr('width', zoneWidth)
            .attr('height', riskHeight)
            .attr('fill', this.style.riskColor)
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.insert('rect', ':first-child')
            .attr('class', 'position-zone')
            .attr('x', zoneX1)
            .attr('y', Math.min(entryY, targetY))
            .attr('width', zoneWidth)
            .attr('height', rewardHeight)
            .attr('fill', this.style.rewardColor)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('class', 'shape-border')
            .attr('x1', zoneX1)
            .attr('y1', entryY)
            .attr('x2', zoneX2)
            .attr('y2', entryY)
            .attr('stroke', this.style.entryColor || '#565656ff')
            .attr('stroke-width', 1.5)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', zoneX1)
            .attr('y1', stopY)
            .attr('x2', zoneX2)
            .attr('y2', stopY)
            .style('pointer-events', 'none');

        this.group.append('line')
            .attr('x1', zoneX1)
            .attr('y1', targetY)
            .attr('x2', zoneX2)
            .attr('y2', targetY)
            .style('pointer-events', 'none');

        // Recalculate lot size from risk before rendering labels
        this.recalculateLotSizeFromRisk();

        const showDetails = this.selected;

        if (showDetails) {
            // Calculate percentages and amounts
            const entryPrice = entry.y;
            const stopPrice = stop.y;
            const targetPrice = target.y;

            const targetPercent = ((Math.abs(targetPrice - entryPrice) / entryPrice) * 100).toFixed(3);
            const stopPercent = ((Math.abs(stopPrice - entryPrice) / entryPrice) * 100).toFixed(3);

            const targetTicks = (Math.abs(targetPrice - entryPrice) / 0.0001).toFixed(1);
            const stopTicks = (Math.abs(stopPrice - entryPrice) / 0.0001).toFixed(1);

            const quantity = this.meta.risk?.lotSize || 0.01;

            // Get risk amount from settings (THIS is the amount we're risking)
            let riskUSD = 100; // Default
            if (this.meta.risk) {
                if (this.meta.risk.riskMode === 'risk-usd') {
                    riskUSD = this.meta.risk.riskAmountUSD || 100;
                } else {
                    const accountSize = this.meta.risk.accountSize || 10000;
                    riskUSD = (accountSize * (this.meta.risk.riskPercent || 1)) / 100;
                }
            }

            // Stop Loss Amount = Your Risk Amount (what you're willing to lose)
            const stopAmount = Math.round(riskUSD);

            // Target Amount = Risk × R:R Ratio (potential reward)
            // Use rrRatio already calculated above
            const targetAmount = Math.round(riskUSD * parseFloat(rrRatio));

            // Target Label (Green background pill)
            const targetLabelText = `Target: ${targetPrice.toFixed(5)} (${targetPercent}%) ${targetTicks}, Amount: ${targetAmount}`;
            const targetLabel = this.group.append('g').attr('class', 'target-label');

            const targetTextNode = targetLabel.append('text')
                .attr('x', zoneX1 + 10)
                .attr('y', targetY - 10)
                .attr('fill', 'white')
                .attr('font-size', '12px')
                .attr('font-weight', '600')
                .text(targetLabelText);

            const targetTextBBox = targetTextNode.node().getBBox();
            targetLabel.insert('rect', 'text')
                .attr('x', targetTextBBox.x - 8)
                .attr('y', targetTextBBox.y - 3)
                .attr('width', targetTextBBox.width + 16)
                .attr('height', targetTextBBox.height + 6)
                .attr('fill', this.isLong ? '#22c55e' : '#ef4444')
                .attr('rx', 12);

            // Stop Label (Red background pill)
            const stopLabelText = `Stop: ${stopPrice.toFixed(5)} (${stopPercent}%) ${stopTicks}, Amount: ${stopAmount}`;
            const stopLabel = this.group.append('g').attr('class', 'stop-label');

            const stopTextNode = stopLabel.append('text')
                .attr('x', zoneX1 + 10)
                .attr('y', stopY + 25)
                .attr('fill', 'white')
                .attr('font-size', '12px')
                .attr('font-weight', '600')
                .text(stopLabelText);

            const stopTextBBox = stopTextNode.node().getBBox();
            stopLabel.insert('rect', 'text')
                .attr('x', stopTextBBox.x - 8)
                .attr('y', stopTextBBox.y - 3)
                .attr('width', stopTextBBox.width + 16)
                .attr('height', stopTextBBox.height + 6)
                .attr('fill', this.isLong ? '#ef4444' : '#22c55e')
                .attr('rx', 12);

            // Center Info Box (Green background pill)
            const pnl = 0; // Will be calculated when order is active
            const centerInfoText = `Open P&l: ${pnl.toFixed(0)}, Qty: ${quantity.toFixed(2)}, Risk/Reward Ratio: ${rrRatio}`;
            const centerInfo = this.group.append('g').attr('class', 'center-info');

            // Calculate center X position of the zone
            const zoneCenterX = zoneX1 + (zoneWidth / 2);

            const centerTextNode = centerInfo.append('text')
                .attr('x', zoneCenterX)
                .attr('y', entryY + 5)
                .attr('text-anchor', 'middle')
                .attr('fill', 'white')
                .attr('font-size', '12px')
                .attr('font-weight', '600')
                .text(centerInfoText);

            const centerTextBBox = centerTextNode.node().getBBox();
            centerInfo.insert('rect', 'text')
                .attr('x', centerTextBBox.x - 8)
                .attr('y', centerTextBBox.y - 3)
                .attr('width', centerTextBBox.width + 16)
                .attr('height', centerTextBBox.height + 6)
                .attr('fill', '#22c55e')
                .attr('rx', 8);

            // Execute button moved to floating toolbar
        }

        const upperY = Math.min(stopY, targetY);
        const lowerY = Math.max(stopY, targetY);

        this.lastRenderMeta = {
            entryX,
            minWidth,
            zoneX1,
            zoneX2,
            upperY,
            lowerY
        };

        this.createHandles(this.group, scales);
        this.createCornerHandles(scales, zoneX1, zoneX2, upperY, lowerY);

        return this.group;
    }

    onPointHandleDrag(index, context = {}) {
        const { point } = context;
        if (!point) return false;

        if (index === 0) {
            const deltaY = point.y - this.points[0].y;
            this.points = this.points.map(p => ({ ...p, y: p.y + deltaY }));
            this.ensureRiskSettings();
            return true;
        }

        if (index === 1) {
            this.setStopPrice(point.y);
            return true;
        }

        if (index === 2) {
            this.setTargetPrice(point.y);
            return true;
        }

        return false;
    }

    beginHandleDrag(handleRole, context = {}) {
        if (handleRole && this.lastRenderMeta) {
            this.cornerDragState = {
                initialWidth: this.meta.zoneWidth,
                lastRole: handleRole
            };
        }
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        if (!handleRole || !this.lastRenderMeta || !context) {
            return false;
        }

        const { entryX, minWidth, zoneX2 } = this.lastRenderMeta;
        const screenX = context.screen ? context.screen.x : null;
        if (typeof screenX !== 'number' || Number.isNaN(screenX)) {
            return false;
        }

        let newWidth = this.meta.zoneWidth;

        if (handleRole.includes('right')) {
            const desiredWidth = Math.max(minWidth, screenX - entryX);
            newWidth = desiredWidth;
        } else if (handleRole.includes('left')) {
            const clampedX = Math.min(Math.max(screenX, entryX), zoneX2 - minWidth);
            newWidth = Math.max(minWidth, zoneX2 - clampedX);
        } else {
            const delta = Math.abs(screenX - entryX);
            newWidth = Math.max(minWidth, delta * 2);
        }

        this.meta.zoneWidth = newWidth;

        if (context.point) {
            if (this.isLong) {
                if (handleRole.includes('top')) {
                    this.setTargetPrice(context.point.y);
                } else if (handleRole.includes('bottom')) {
                    this.setStopPrice(context.point.y);
                }
            } else {
                if (handleRole.includes('top')) {
                    this.setStopPrice(context.point.y);
                } else if (handleRole.includes('bottom')) {
                    this.setTargetPrice(context.point.y);
                }
            }
        }

        this.ensureRiskSettings();
        return true;
    }

    endHandleDrag(handleRole, context = {}) {
        this.cornerDragState = null;
    }

    // Override createHandles to use square hollow handles for risk/reward tool
    createHandles(group, scales) {
        const handleSize = 10;
        const handleStroke = '#2962FF'; // Blue color
        const handleStrokeWidth = 1.5;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        // Get positions for the 3 key points: Entry, Stop, Target
        const entry = this.points[0];
        const stop = this.points[1];
        const target = this.points[2];
        
        if (!entry || !stop || !target) return;
        
        const entryX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(entry.x) : scales.xScale(entry.x);
        
        const positions = [
            { point: target, index: 2, y: scales.yScale(target.y) },  // Target
            { point: entry, index: 0, y: scales.yScale(entry.y) },    // Entry
            { point: stop, index: 1, y: scales.yScale(stop.y) }       // Stop
        ];
        
        positions.forEach(({ point, index, y }) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            // Square hollow handle (like TradingView)
            const handle = handleGroup.append('rect')
                .attr('class', 'resize-handle')
                .attr('x', entryX - handleSize / 2)
                .attr('y', y - handleSize / 2)
                .attr('width', handleSize)
                .attr('height', handleSize)
                .attr('rx', 2)
                .attr('ry', 2)
                .attr('fill', 'transparent')
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'ns-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            // Hover effect
            handle.on('mouseenter', function() {
                d3.select(this)
                    .attr('stroke-width', handleStrokeWidth + 1)
                    .attr('stroke', '#4a90d9');
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .attr('stroke-width', handleStrokeWidth)
                    .attr('stroke', handleStroke);
            });
            
            this.handles.push(handleGroup);
        });
    }

    createCornerHandles(scales, zoneX1, zoneX2, upperY, lowerY) {
        const handleSize = 10;
        const handleStroke = '#2962FF'; // Blue color
        const handleStrokeWidth = 1.5;
        
        // Only create corner handles on entry line (for width adjustment)
        const entryY = scales.yScale(this.points[0].y);
        
        const positions = [
            { role: 'corner-entry-right', x: zoneX2, y: entryY, cursor: 'ew-resize' }
        ];

        positions.forEach((pos) => {
            const group = this.group.append('g')
                .attr('class', 'custom-handle-group')
                .attr('data-handle-role', pos.role);

            const handle = group.append('rect')
                .attr('class', 'custom-handle')
                .attr('data-handle-role', pos.role)
                .attr('x', pos.x - handleSize / 2)
                .attr('y', pos.y - handleSize / 2)
                .attr('width', handleSize)
                .attr('height', handleSize)
                .attr('rx', 2)
                .attr('ry', 2)
                .attr('fill', 'transparent')
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('pointer-events', 'all')
                .style('cursor', pos.cursor)
                .style('opacity', this.selected ? 1 : 0);
            
            // Hover effect
            handle.on('mouseenter', function() {
                d3.select(this)
                    .attr('stroke-width', handleStrokeWidth + 1)
                    .attr('stroke', '#4a90d9');
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .attr('stroke-width', handleStrokeWidth)
                    .attr('stroke', handleStroke);
            });

            this.handles.push(group);
        });
    }

    appendLabel(x, y, text, styles) {
        const label = this.group.append('text').attr('x', x).attr('y', y);
        Object.keys(styles).forEach(key => label.attr(key, styles[key]));
        label.style('pointer-events', 'none').text(text);
    }

    toJSON() {
        return {
            ...super.toJSON(),
            orientation: this.meta.orientation,
            risk: this.meta.risk
        };
    }

    static baseFromJSON(Subclass, data, chart) {
        const instance = new Subclass(data.points, data.style);
        instance.id = data.id;
        instance.visible = data.visible;
        instance.meta = data.meta || instance.meta;
        instance.meta.orientation = data.orientation || instance.meta.orientation;
        instance.meta.risk = {
            ...(instance.meta.risk || {}),
            ...(data.risk || {})
        };
        instance.chart = chart; // Set chart reference for multi-timeframe support
        instance.ensureRiskSettings();
        return instance;
    }
}

class LongPositionTool extends BaseRiskRewardTool {
    constructor(points = [], style = {}) {
        super('long-position', points, { ...style, orientation: 'long' });
    }

    static fromJSON(data, chart) {
        return BaseRiskRewardTool.baseFromJSON(LongPositionTool, data, chart);
    }
}

class ShortPositionTool extends BaseRiskRewardTool {
    constructor(points = [], style = {}) {
        super('short-position', points, { ...style, orientation: 'short' });
    }

    static fromJSON(data, chart) {
        return BaseRiskRewardTool.baseFromJSON(ShortPositionTool, data, chart);
    }
}

// ============================================================================
// Path/Pen Tool (Freehand drawing)
// ============================================================================
class PathTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('path', points, style);
        this.requiredPoints = -2; // Special value for point-by-point mode (same as polyline)
        this.isPointByPoint = true; // Flag for point-by-point drawing mode
        this.showPoints = style.showPoints !== false;
        this.pointRadius = style.pointRadius || 4;
        this.showArrow = style.showArrow !== undefined ? style.showArrow : false;

        if (this.style.startStyle === undefined || this.style.startStyle === null) {
            this.style.startStyle = 'normal';
        }
        if (this.style.endStyle === undefined || this.style.endStyle === null) {
            this.style.endStyle = 'arrow';
        }
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing path')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Create arrow markers for start/end styles
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const markerIdStart = `path-arrow-start-${this.id}`;
            const markerIdEnd = `path-arrow-end-${this.id}`;
            
            if (startStyle === 'arrow') {
                SVGHelpers.createArrowMarker(
                    d3.select(container.node().ownerSVGElement),
                    markerIdStart,
                    this.style.stroke || '#00E5FF',
                    true // reversed for start
                );
            }
            if (endStyle === 'arrow') {
                SVGHelpers.createArrowMarker(
                    d3.select(container.node().ownerSVGElement),
                    markerIdEnd,
                    this.style.stroke || '#00E5FF'
                );
            }
        }

        // Draw lines connecting points (NEVER fill, even when closed)
        if (this.points.length >= 2) {
            for (let i = 0; i < this.points.length - 1; i++) {
                const p1 = this.points[i];
                const p2 = this.points[i + 1];
                
                const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
                const y1 = scales.yScale(p1.y);
                const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
                const y2 = scales.yScale(p2.y);

                // Draw invisible wider stroke for easier clicking
                this.group.append('line')
                    .attr('x1', x1)
                    .attr('y1', y1)
                    .attr('x2', x2)
                    .attr('y2', y2)
                    .attr('stroke', 'transparent')
                    .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
                
                const line = this.group.append('line')
                    .attr('x1', x1)
                    .attr('y1', y1)
                    .attr('x2', x2)
                    .attr('y2', y2)
                    .attr('stroke', this.style.stroke || '#00E5FF')
                    .attr('stroke-width', this.style.strokeWidth || 2)
                    .attr('opacity', this.style.opacity)
                    .style('pointer-events', 'none')
                    .style('cursor', 'move');
                
                // Add arrow markers to first and last segments
                if (i === 0 && startStyle === 'arrow') {
                    line.attr('marker-start', `url(#path-arrow-start-${this.id})`);
                }
                if (i === this.points.length - 2 && endStyle === 'arrow') {
                    line.attr('marker-end', `url(#path-arrow-end-${this.id})`);
                }
            }
        }

        // Draw resize handles (only visible when selected)
        this.points.forEach((point, i) => {
            const x = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const y = scales.yScale(point.y);
            
            // Create handle group
            const handleGroup = this.group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', i);
            
            // Draw invisible larger hit area for easier clicking
            handleGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 16)
                .attr('fill', 'transparent')
                .attr('class', 'resize-handle-hit')
                .attr('data-point-index', i)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none');
            
            // Draw visible point circle on top (matches other tools' handle style)
            handleGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 3)
                .attr('fill', 'transparent')
                .attr('stroke', '#2962FF')
                .attr('stroke-width', 2)
                .attr('class', 'resize-handle')
                .attr('data-point-index', i)
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0);
        });

        return this.group;
    }

    /**
     * Add a point to the path
     */
    addPoint(point) {
        this.points.push(point);
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const tool = new PathTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        // Preserve timestamp points for timeframe switching
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
// Brush Tool (Freehand brush drawing)
// ============================================================================
class BrushTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('brush', points, style);
        this.requiredPoints = -1; // Continuous drawing mode
        this.isContinuous = true;
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.opacity = style.opacity || 0.8;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing brush')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? 1 : 0);

        // Use D3 line with curve smoothing for freehand feel
        const lineGenerator = d3.line()
            .x(d => scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(d.x) : scales.xScale(d.x))
            .y(d => scales.yScale(d.y))
            .curve(d3.curveCatmullRom.alpha(0.5));

        const pathData = lineGenerator(this.points);

        // Draw the brush stroke
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('fill', 'none')
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.createHandles(this.group, scales);

        return this.group;
    }

    createHandles(group, scales) {
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        // Only show handles for first and last points
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
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            handle.on('mouseenter', function() {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r', handleRadius + 1)
                    .attr('stroke-width', handleStrokeWidth + 0.5);
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r', handleRadius)
                    .attr('stroke-width', handleStrokeWidth);
            });
            
            this.handles.push(handleGroup);
        });
    }

    addPoint(point) {
        this.points.push(point);
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const tool = new BrushTool(data.points, data.style);
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
// Polyline Tool (Point-by-point path)
// ============================================================================
class PolylineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('polyline', points, style);
        this.requiredPoints = -2; // Special value for point-by-point mode
        this.isPointByPoint = true; // Flag for point-by-point drawing mode
        this.showPoints = style.showPoints !== false;
        this.pointRadius = style.pointRadius || 4;
        this.style.fill = style.fill || 'none';
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing polyline')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Check if shape is closed (first and last points are close)
        const isClosed = this.points.length >= 3 && this.isShapeClosed();

        // If closed, draw filled polygon
        if (isClosed && this.style.fill && this.style.fill !== 'none') {
            const pathData = this.points.map((p, i) => {
                const x = scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
                const y = scales.yScale(p.y);
                return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
            }).join(' ') + ' Z';

            // Invisible hit path (stroke-only)
            this.group.append('path')
                .attr('d', pathData)
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .attr('opacity', 1)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('path')
                .attr('d', pathData)
                .attr('fill', this.style.fill)
                .attr('stroke', this.style.stroke || '#00E5FF')
                .attr('stroke-width', this.style.strokeWidth || 2)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw lines connecting points
            if (this.points.length >= 2) {
                for (let i = 0; i < this.points.length - 1; i++) {
                    const p1 = this.points[i];
                    const p2 = this.points[i + 1];
                    
                    const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
                        scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
                    const y1 = scales.yScale(p1.y);
                    const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
                        scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
                    const y2 = scales.yScale(p2.y);

                    // Draw invisible wider stroke for easier clicking
                    this.group.append('line')
                        .attr('x1', x1)
                        .attr('y1', y1)
                        .attr('x2', x2)
                        .attr('y2', y2)
                        .attr('stroke', 'transparent')
                        .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                        .style('pointer-events', 'stroke')
                        .style('cursor', 'move');
                    
                    this.group.append('line')
                        .attr('x1', x1)
                        .attr('y1', y1)
                        .attr('x2', x2)
                        .attr('y2', y2)
                        .attr('stroke', this.style.stroke || '#00E5FF')
                        .attr('stroke-width', this.style.strokeWidth || 2)
                        .attr('opacity', this.style.opacity)
                        .style('pointer-events', 'none')
                        .style('cursor', 'move');
                }
            }
        }

        // Draw resize handles (only visible when selected)
        this.points.forEach((point, i) => {
            const x = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const y = scales.yScale(point.y);
            
            // Create handle group
            const handleGroup = this.group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', i);
            
            // Draw invisible larger hit area for easier clicking
            handleGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 16)
                .attr('fill', 'transparent')
                .attr('class', 'resize-handle-hit')
                .attr('data-point-index', i)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none');
            
            // Draw visible point circle on top (matches other tools' handle style)
            handleGroup.append('circle')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', 3)
                .attr('fill', 'transparent')
                .attr('stroke', '#2962FF')
                .attr('stroke-width', 2)
                .attr('class', 'resize-handle')
                .attr('data-point-index', i)
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0);
        });

        return this.group;
    }

    /**
     * Check if the shape is closed (first and last points are close)
     */
    isShapeClosed() {
        if (this.points.length < 3) return false;
        const first = this.points[0];
        const last = this.points[this.points.length - 1];
        const threshold = 0.001; // Small threshold for proximity
        return Math.abs(first.x - last.x) < threshold && Math.abs(first.y - last.y) < threshold;
    }

    /**
     * Add a point to the polyline
     */
    addPoint(point) {
        this.points.push(point);
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const tool = new PolylineTool(data.points, data.style);
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
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RulerTool,
        LongPositionTool,
        ShortPositionTool,
        PathTool,
        PolylineTool,
        BrushTool
    };
}
