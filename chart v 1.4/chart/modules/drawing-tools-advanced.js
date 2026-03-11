/**
 * Drawing Tools - Advanced Tools Module
 * Implements: Ruler/Measure, Risk-Reward, Path/Pen, Brush
 */

const TRENDLINE_INFO_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

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
        this.style.showBackground = style.showBackground === undefined ? false : !!style.showBackground;
        this.style.borderEnabled = style.borderEnabled === undefined ? false : !!style.borderEnabled;
        this.style.borderColor = style.borderColor || this.style.stroke;
        this.style.borderDasharray = style.borderDasharray || '';
        this.style.borderWidth = style.borderWidth || 1;
        this.style.showLabel = style.showLabel !== false;
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 12;
        this.style.showLabelBackground = style.showLabelBackground !== false;
        this.style.labelBackgroundColor = style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)';
        this.style.rangeMode = this.normalizeRangeMode(style.rangeMode);
        const defaultInfoSettings = this.getDefaultInfoSettings(this.style.rangeMode);
        this.style.infoSettings = {
            ...defaultInfoSettings,
            ...(style.infoSettings || {})
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

    normalizeRangeMode(mode) {
        const value = String(mode || '').toLowerCase().trim();
        if (value === 'price') return 'price';
        if (value === 'time' || value === 'date') return 'time';
        return 'both';
    }

    getRangeMode() {
        if (this.style && this.style.rangeMode !== undefined) {
            return this.normalizeRangeMode(this.style.rangeMode);
        }
        if (this.type === 'price-range') return 'price';
        if (this.type === 'date-range') return 'time';
        return 'both';
    }

    getDefaultInfoSettings(mode = 'both') {
        const normalizedMode = this.normalizeRangeMode(mode);

        if (normalizedMode === 'price') {
            return {
                showInfo: true,
                priceRange: true,
                percentChange: true,
                changeInPips: true,
                barsRange: false,
                dateTimeRange: false,
                volume: false
            };
        }

        if (normalizedMode === 'time') {
            return {
                showInfo: true,
                priceRange: false,
                percentChange: false,
                changeInPips: false,
                barsRange: true,
                dateTimeRange: true,
                volume: false
            };
        }

        return {
            showInfo: true,
            priceRange: true,
            percentChange: true,
            changeInPips: true,
            barsRange: true,
            dateTimeRange: true,
            volume: true
        };
    }

    setModeVirtualHandlePoints(mode = this.getRangeMode()) {
        const normalizedMode = this.normalizeRangeMode(mode);
        this.virtualPoints = null;

        if (!Array.isArray(this.points) || this.points.length < 2) return;

        const p1 = this.points[0];
        const p2 = this.points[1];

        if (normalizedMode === 'price') {
            const midX = (p1.x + p2.x) / 2;
            this.virtualPoints = [
                { x: midX, y: p1.y },
                { x: midX, y: p2.y }
            ];
            return;
        }

        if (normalizedMode === 'time') {
            const midY = (p1.y + p2.y) / 2;
            this.virtualPoints = [
                { x: p1.x, y: midY },
                { x: p2.x, y: midY }
            ];
        }
    }

    updateHandleCursor(mode = this.getRangeMode()) {
        if (!this.group) return;

        const normalizedMode = this.normalizeRangeMode(mode);
        let cursor = 'nwse-resize';
        if (normalizedMode === 'price') cursor = 'ns-resize';
        if (normalizedMode === 'time') cursor = 'ew-resize';

        this.group
            .selectAll('.resize-handle, .resize-handle-hit, .resize-handle-group')
            .style('cursor', cursor);
    }

    onPointHandleDrag(index, context = {}) {
        const { point } = context;
        if (!point || !Number.isFinite(index) || index < 0 || index >= this.points.length) {
            return false;
        }

        const mode = this.getRangeMode();

        if (mode === 'price') {
            const nextPoints = this.points.map(p => ({ ...p }));
            nextPoints[index] = {
                ...nextPoints[index],
                y: point.y
            };
            this.points = nextPoints;
            this.meta.updatedAt = Date.now();
            return true;
        }

        if (mode === 'time') {
            const nextPoints = this.points.map(p => ({ ...p }));
            nextPoints[index] = {
                ...nextPoints[index],
                x: point.x
            };
            this.points = nextPoints;
            this.meta.updatedAt = Date.now();
            return true;
        }

        return false;
    }

    buildRangeInfoLines(p1, p2, scales) {
        const info = this.style.infoSettings || {};
        if (info.showInfo === false) return [];
        const mode = this.getRangeMode();

        const tickSize = this.getTickSize(scales);
        const decimals = this.getPriceDecimals(scales);

        const priceDiff = p2.y - p1.y;
        const pct = (p1.y !== 0) ? (priceDiff / p1.y * 100) : 0;
        const rawPips = tickSize ? (priceDiff / tickSize) : 0;

        const priceDiffStr = this.normalizeNegativeZeroString(priceDiff.toFixed(decimals));
        const pctStr = this.normalizeNegativeZeroString(pct.toFixed(2));
        const normalizedPips = Math.abs(rawPips) < 1e-9 ? 0 : rawPips;
        const pipsDecimals = Math.abs(normalizedPips % 1) > 1e-6 ? 1 : 0;
        const pipsStr = normalizedPips.toLocaleString(undefined, {
            minimumFractionDigits: pipsDecimals,
            maximumFractionDigits: 1
        });

        const bars = Math.abs(Math.round(p2.x) - Math.round(p1.x));
        const t1 = this.getTimestampAtIndex(Math.round(p1.x), scales);
        const t2 = this.getTimestampAtIndex(Math.round(p2.x), scales);
        const duration = this.formatDurationCompact(t2 - t1);
        const volume = this.getVolumeInRange(p1.x, p2.x, scales);

        const neutral = this.style.textColor || '#d1d4dc';
        const priceParts = [];
        if (info.priceRange !== false) priceParts.push(priceDiffStr);
        if (info.percentChange !== false) priceParts.push(`(${pctStr}%)`);
        if (info.changeInPips !== false) priceParts.push(`${pipsStr}`);
        const priceLine = priceParts.length > 0 ? priceParts.join(' ') : '';

        const timeParts = [];
        if (info.barsRange !== false) timeParts.push(`${bars} bars`);
        if (info.dateTimeRange !== false) timeParts.push(`${duration}`);
        const timeLine = timeParts.length > 0 ? timeParts.join(', ') : '';

        const lines = [];
        if (mode !== 'time' && priceLine) {
            lines.push({ text: priceLine, fill: neutral });
        }
        if (mode !== 'price' && timeLine) {
            lines.push({ text: timeLine, fill: neutral });
        }
        if (mode === 'both' && info.volume !== false && volume !== null) {
            lines.push({ text: `Vol ${this.formatCompactVolume(volume)}`, fill: neutral });
        }
        return lines;
    }

    getTickSize(scales) {
        const chart = scales?.chart || this.chart;
        const marketPipSize = Number(chart?.orderManager?.pipSize);
        if (isFinite(marketPipSize) && marketPipSize > 0) return marketPipSize;

        let savedPipSize = NaN;
        if (typeof localStorage !== 'undefined') {
            savedPipSize = Number(localStorage.getItem('chart_pipSize'));
        }
        if (isFinite(savedPipSize) && savedPipSize > 0) return savedPipSize;

        const ts = Number(chart?.priceScale?.tickSize);
        if (isFinite(ts) && ts > 0) return ts;

        const decimals = Number(chart?.priceDecimals);
        if (isFinite(decimals) && decimals >= 0) {
            return Math.pow(10, -decimals);
        }

        if (typeof chart?.getPriceDecimals === 'function' && chart?.yScale) {
            const d = chart.yScale.domain();
            const range = (Array.isArray(d) && d.length === 2) ? Math.abs(d[1] - d[0]) : 0;
            const autoDecimals = chart.getPriceDecimals(range);
            if (typeof autoDecimals === 'number' && isFinite(autoDecimals) && autoDecimals >= 0) {
                return Math.pow(10, -autoDecimals);
            }
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

    getVolumeInRange(startIndex, endIndex, scales) {
        const chart = scales?.chart || this.chart;
        const data = chart?.data;
        if (!Array.isArray(data) || data.length === 0) return null;

        let start = Math.min(Math.round(startIndex), Math.round(endIndex));
        let end = Math.max(Math.round(startIndex), Math.round(endIndex));
        start = Math.max(0, start);
        end = Math.min(data.length - 1, end);
        if (end < start) return null;

        let totalVolume = 0;
        let hasVolume = false;
        for (let i = start; i <= end; i++) {
            const candle = data[i];
            if (!candle) continue;

            const candleVolume = Number(candle.v ?? candle.volume ?? 0);
            if (!Number.isFinite(candleVolume) || candleVolume <= 0) continue;

            totalVolume += candleVolume;
            hasVolume = true;
        }

        return hasVolume ? totalVolume : null;
    }

    formatCompactVolume(volume) {
        const absVolume = Math.abs(Number(volume) || 0);
        if (!Number.isFinite(absVolume)) return '0';

        const units = [
            { value: 1e12, suffix: 'T' },
            { value: 1e9, suffix: 'B' },
            { value: 1e6, suffix: 'M' },
            { value: 1e3, suffix: 'K' }
        ];

        for (const unit of units) {
            if (absVolume < unit.value) continue;

            const scaled = absVolume / unit.value;
            const maxFractionDigits = scaled >= 100 ? 0 : (scaled >= 10 ? 1 : 2);
            return `${scaled.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })} ${unit.suffix}`;
        }

        return absVolume.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }

    formatDurationCompact(ms) {
        const absMs = Math.abs(ms);
        const totalMinutes = Math.floor(absMs / 60000);
        const totalHours = Math.floor(totalMinutes / 60);
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;
        const minutes = totalMinutes % 60;

        if (days > 0) return `${days}d ${hours}h`;
        if (totalHours > 0) return `${totalHours}h ${minutes}m`;
        return `${totalMinutes}m`;
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

    renderPriceRangeMode(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing date-price-range range-mode-price')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x)
            : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x)
            : scales.xScale(p2.x);
        const x = (x1 + x2) / 2;
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

        const priceDiff = p2.y - p1.y;
        const isDown = priceDiff < 0;

        const selectionWidth = this.style.selectionWidth || 30;
        const left = x - selectionWidth / 2;
        const right = x + selectionWidth / 2;

        const svg = d3.select(container.node().ownerSVGElement);
        const markerEnd = `dpr-price-end-${this.id}`;
        if (typeof SVGHelpers !== 'undefined') {
            SVGHelpers.createArrowMarker(svg, markerEnd, this.style.stroke || '#2962ff');
        }

        this.group.append('rect')
            .attr('class', 'range-fill-hit')
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

            if (label) {
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
                    .attr('font-family', TRENDLINE_INFO_FONT_FAMILY)
                    .text('');

                text.append('tspan')
                    .attr('x', x)
                    .attr('dy', 0)
                    .attr('fill', this.style.textColor || '#d1d4dc')
                    .text(label);

                const bbox = text.node().getBBox();
                if (this.style.showLabelBackground) {
                    const horizontalPadding = 8;
                    const verticalPadding = 8;
                    labelGroup.insert('rect', 'text')
                        .attr('class', 'range-info-box')
                        .attr('x', bbox.x - horizontalPadding)
                        .attr('y', bbox.y - verticalPadding)
                        .attr('width', bbox.width + (horizontalPadding * 2))
                        .attr('height', bbox.height + (verticalPadding * 2))
                        .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                        .attr('stroke', 'none')
                        .attr('stroke-width', 0)
                        .attr('stroke-dasharray', null)
                        .attr('rx', 8);
                }
            }
        }

        this.setModeVirtualHandlePoints('price');
        this.createHandles(this.group, scales);
        this.updateHandleCursor('price');
        return this.group;
    }

    renderTimeRangeMode(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing date-price-range range-mode-time')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x)
            : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x)
            : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        const y = (y1 + y2) / 2;

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const midX = (left + right) / 2;

        const selectionHeight = this.style.selectionHeight || 30;
        const top = y - selectionHeight / 2;
        const bottom = y + selectionHeight / 2;

        const svg = d3.select(container.node().ownerSVGElement);
        const markerStart = `dpr-time-start-${this.id}`;
        const markerEnd = `dpr-time-end-${this.id}`;
        if (typeof SVGHelpers !== 'undefined') {
            SVGHelpers.createArrowMarker(svg, markerStart, this.style.stroke || '#2962ff', true);
            SVGHelpers.createArrowMarker(svg, markerEnd, this.style.stroke || '#2962ff');
        }

        this.group.append('rect')
            .attr('class', 'range-fill-hit')
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
            if (label) {
                const labelGroup = this.group.append('g').style('pointer-events', 'none');
                const text = labelGroup.append('text')
                    .attr('x', midX)
                    .attr('y', top - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.textColor || '#d1d4dc')
                    .attr('font-size', `${this.style.fontSize || 12}px`)
                    .attr('font-weight', '600')
                    .attr('font-family', TRENDLINE_INFO_FONT_FAMILY)
                    .text(label);

                const bbox = text.node().getBBox();
                if (this.style.showLabelBackground) {
                    const horizontalPadding = 8;
                    const verticalPadding = 8;
                    labelGroup.insert('rect', 'text')
                        .attr('class', 'range-info-box')
                        .attr('x', bbox.x - horizontalPadding)
                        .attr('y', bbox.y - verticalPadding)
                        .attr('width', bbox.width + (horizontalPadding * 2))
                        .attr('height', bbox.height + (verticalPadding * 2))
                        .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                        .attr('stroke', 'none')
                        .attr('stroke-width', 0)
                        .attr('stroke-dasharray', null)
                        .attr('rx', 8);
                }
            }
        }

        this.setModeVirtualHandlePoints('time');
        this.createHandles(this.group, scales);
        this.updateHandleCursor('time');
        return this.group;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        const mode = this.getRangeMode();
        if (mode === 'price') {
            return this.renderPriceRangeMode(container, scales);
        }
        if (mode === 'time') {
            return this.renderTimeRangeMode(container, scales);
        }

        this.setModeVirtualHandlePoints('both');

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
            .attr('class', 'range-fill-hit')
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
                this.updateHandleCursor('both');
                return this.group;
            }

            const labelGroup = this.group.append('g')
                .attr('class', 'date-price-range-label')
                .style('pointer-events', 'none');

            const fontSize = parseInt(this.style.fontSize || 12);
            const lineHeight = Math.max(16, Math.round(fontSize * 1.45));
            const baseY = bottom + 30;

            const text = labelGroup.append('text')
                .attr('x', midX)
                .attr('y', baseY)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.textColor || '#d1d4dc')
                .attr('font-size', `${this.style.fontSize || 12}px`)
                .attr('font-weight', '500')
                .attr('font-family', TRENDLINE_INFO_FONT_FAMILY);

            lines.forEach((line, idx) => {
                text.append('tspan')
                    .attr('x', midX)
                    .attr('y', baseY + (idx * lineHeight))
                    .attr('font-weight', '500')
                    .attr('fill', line.fill || (this.style.textColor || '#d1d4dc'))
                    .text(line.text);
            });

            const bbox = text.node().getBBox();
            if (this.style.showLabelBackground) {
                const horizontalPadding = 8;
                const verticalPadding = 8;
                const boxX = bbox.x - horizontalPadding;
                const boxY = bbox.y - verticalPadding;
                const boxWidth = bbox.width + (horizontalPadding * 2);
                const boxHeight = bbox.height + (verticalPadding * 2);

                labelGroup.insert('rect', 'text')
                    .attr('class', 'range-info-box')
                    .attr('x', boxX)
                    .attr('y', boxY)
                    .attr('width', boxWidth)
                    .attr('height', boxHeight)
                    .attr('fill', this.style.labelBackgroundColor || 'rgba(30, 34, 45, 0.95)')
                    .attr('stroke', 'none')
                    .attr('stroke-width', 0)
                    .attr('stroke-dasharray', null)
                    .attr('rx', 9);
            }
        }

        this.createHandles(this.group, scales);
        this.updateHandleCursor('both');
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const inferredMode = (data && data.type === 'price-range')
            ? 'price'
            : ((data && data.type === 'date-range') ? 'time' : 'both');
        const style = {
            ...(data.style || {}),
            rangeMode: (data && data.style && data.style.rangeMode !== undefined)
                ? data.style.rangeMode
                : inferredMode
        };
        const tool = new DatePriceRangeTool(data.points, style);
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
        this.style.textColor = style.textColor || style.labelTextColor || '#FFFFFF';
        this.style.fontSize = Number.isFinite(style.fontSize)
            ? style.fontSize
            : (Number.isFinite(style.labelFontSize) ? style.labelFontSize : 11);
        this.style.labelTextColor = style.labelTextColor || this.style.textColor;
        this.style.labelFontSize = Number.isFinite(style.labelFontSize) ? style.labelFontSize : this.style.fontSize;
        this.meta.orientation = style.orientation || 'long';
        if (typeof this.meta.zoneWidth !== 'number') {
            this.meta.zoneWidth = null;
        }
        if (typeof this.meta.zoneWidthRatio !== 'number') {
            this.meta.zoneWidthRatio = null;
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

        const existingRisk = this.meta.risk || null;
        const persistedAccountSize = existingRisk && Number.isFinite(Number(existingRisk.accountSize)) && Number(existingRisk.accountSize) > 0
            ? Number(existingRisk.accountSize)
            : null;
        const accountSize = persistedAccountSize || actualBalance;
        
        if (!this.meta.risk) {
            this.meta.risk = {
                accountSize,
                lotSize: 0.01,
                leverage: 1,
                riskPercent: 1,
                riskMode: 'risk-usd',
                riskAmountUSD: 100
            };
        } else if (!persistedAccountSize) {
            this.meta.risk.accountSize = accountSize;
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
            accountSize,
            entryPrice,
            stopPrice: stop.y,
            targetPrice: target.y,
            stopTicks: parseFloat(stopDiff.toFixed(5)),
            profitTicks: parseFloat(profitDiff.toFixed(5)),
            rewardRatio: parseFloat(rewardRatio.toFixed(2)),
            riskAmount: parseFloat(((accountSize) * (riskPercent / 100)).toFixed(2))
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
        const stopX = Number.isFinite(stop?.x) ? stop.x : entryX;
        const targetX = Number.isFinite(target?.x) ? target.x : entryX;
        this.points = [
            { ...entry, x: entryX, y: entryPrice },
            { ...stop, x: stopX, y: this.sanitizeStopPrice(newStop) },
            { ...target, x: targetX, y: this.sanitizeTargetPrice(newTarget) }
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
        const chartWidth = Math.abs(xRange[1] - xRange[0]);
        const defaultWidth = Math.min(chartWidth * 0.25, 320);
        const minWidth = 24;
        const toPixel = (index) => (scales.chart && scales.chart.dataIndexToPixel)
            ? scales.chart.dataIndexToPixel(index)
            : scales.xScale(index);
        const toIndex = (pixel) => (scales.chart && scales.chart.pixelToDataIndex)
            ? scales.chart.pixelToDataIndex(pixel)
            : scales.xScale.invert(pixel);

        const entryIndex = Number.isFinite(entry?.x) ? entry.x : 0;
        const stopIndex = Number.isFinite(stop?.x) ? stop.x : entryIndex;
        const targetIndex = Number.isFinite(target?.x) ? target.x : entryIndex;
        const entryX = toPixel(entryIndex);

        let rightIndex = Math.max(entryIndex, stopIndex, targetIndex);

        // Backward compatibility for legacy drawings saved with pixel-only width.
        if ((rightIndex - entryIndex) <= 1e-6) {
            const hasWidthRatio = Number.isFinite(this.meta.zoneWidthRatio) && this.meta.zoneWidthRatio > 0;
            let fallbackWidth = hasWidthRatio
                ? (this.meta.zoneWidthRatio * chartWidth)
                : this.meta.zoneWidth;

            if (!Number.isFinite(fallbackWidth) || fallbackWidth <= 0) {
                fallbackWidth = defaultWidth;
            }

            fallbackWidth = Math.max(minWidth, fallbackWidth);
            const migratedRightIndex = toIndex(entryX + fallbackWidth);
            if (Number.isFinite(migratedRightIndex)) {
                rightIndex = Math.max(entryIndex, migratedRightIndex);
                this.points[1] = { ...this.points[1], x: rightIndex };
                this.points[2] = { ...this.points[2], x: rightIndex };
            }
        }

        const zoneX1 = entryX;
        let zoneX2 = toPixel(rightIndex);
        if (!Number.isFinite(zoneX2) || zoneX2 <= zoneX1) {
            zoneX2 = zoneX1 + defaultWidth;
        }

        let zoneWidth = zoneX2 - zoneX1;
        if (zoneWidth < minWidth) {
            zoneWidth = minWidth;
            zoneX2 = zoneX1 + zoneWidth;
            const minRightIndex = toIndex(zoneX2);
            if (Number.isFinite(minRightIndex)) {
                rightIndex = Math.max(entryIndex, minRightIndex);
                this.points[1] = { ...this.points[1], x: rightIndex };
                this.points[2] = { ...this.points[2], x: rightIndex };
                zoneX2 = toPixel(rightIndex);
                zoneWidth = Math.max(minWidth, zoneX2 - zoneX1);
            }
        }

        this.meta.zoneWidth = zoneWidth;
        if (chartWidth > 0) {
            this.meta.zoneWidthRatio = zoneWidth / chartWidth;
        }

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

            const labelPaddingX = 10;
            const labelPaddingY = 4;
            const rawLabelFontSize = Number(this.style.fontSize ?? this.style.labelFontSize);
            const labelFontSize = Number.isFinite(rawLabelFontSize)
                ? Math.max(8, Math.min(24, rawLabelFontSize))
                : 11;
            const labelFontWeight = '500';
            const labelFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            const labelTextColor = this.style.textColor || this.style.labelTextColor || '#FFFFFF';
            const edgeLabelRadius = 8;
            const centerLabelRadius = 10;
            const edgeSnapGap = 0;
            const compressedGap = 18;
            const wideSnapThreshold = 260;

            const createEdgeLabel = ({ className, text, lineY, fill, side }) => {
                const labelGroup = this.group.append('g').attr('class', className);

                const textNode = labelGroup.append('text')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'hanging')
                    .attr('fill', labelTextColor)
                    .attr('font-size', `${labelFontSize}px`)
                    .attr('font-weight', labelFontWeight)
                    .attr('font-family', labelFontFamily)
                    .text(text);

                const textBBox = textNode.node().getBBox();
                const labelWidth = textBBox.width + (labelPaddingX * 2);
                const labelHeight = textBBox.height + (labelPaddingY * 2);

                const hasInnerSpace = zoneWidth >= wideSnapThreshold;
                const offset = hasInnerSpace ? edgeSnapGap : compressedGap;
                const rectTop = side === 'top'
                    ? lineY - labelHeight - offset
                    : lineY + offset;
                const centeredRectX = (zoneX1 + (zoneWidth / 2)) - (labelWidth / 2);
                const rectX = centeredRectX;

                labelGroup.insert('rect', 'text')
                    .attr('x', rectX)
                    .attr('y', rectTop)
                    .attr('width', labelWidth)
                    .attr('height', labelHeight)
                    .attr('fill', fill)
                    .attr('rx', edgeLabelRadius);

                textNode
                    .attr('x', rectX + (labelWidth / 2))
                    .attr('y', rectTop + labelPaddingY);
            };

            const targetLabelFill = '#22c55e';
            const stopLabelFill = '#ef4444';

            // Target / Stop labels: TV-like behavior (wide = edge-snapped, narrow = floated with fixed spacing)
            const targetLabelText = `Target: ${targetPrice.toFixed(5)} (${targetPercent}%) ${targetTicks}, Amount: ${targetAmount}`;
            const targetSide = targetY <= entryY ? 'top' : 'bottom';
            createEdgeLabel({
                className: 'target-label',
                text: targetLabelText,
                lineY: targetY,
                fill: targetLabelFill,
                side: targetSide
            });

            const stopLabelText = `Stop: ${stopPrice.toFixed(5)} (${stopPercent}%) ${stopTicks}, Amount: ${stopAmount}`;
            const stopSide = stopY <= entryY ? 'top' : 'bottom';
            createEdgeLabel({
                className: 'stop-label',
                text: stopLabelText,
                lineY: stopY,
                fill: stopLabelFill,
                side: stopSide
            });

            // Center Info Box (TradingView-like red pill with border)
            const pnl = 0; // Will be calculated when order is active
            const centerInfoLine1 = `Open P&L: ${pnl.toFixed(0)}, Qty: ${quantity.toFixed(2)}`;
            const centerInfoLine2 = `Risk/Reward Ratio: ${rrRatio}`;
            const centerInfo = this.group.append('g').attr('class', 'center-info');

            // Calculate center X position of the zone
            const zoneCenterX = zoneX1 + (zoneWidth / 2);

            const centerTextNode = centerInfo.append('text')
                .attr('x', 0)
                .attr('y', 0)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'hanging')
                .attr('fill', labelTextColor)
                .attr('font-size', `${labelFontSize}px`)
                .attr('font-weight', labelFontWeight)
                .attr('font-family', labelFontFamily);

            const centerLineHeight = Math.round(labelFontSize * 1.2);

            const centerLine1 = centerTextNode.append('tspan')
                .attr('x', 0)
                .attr('y', 0)
                .text(centerInfoLine1);

            const centerLine2 = centerTextNode.append('tspan')
                .attr('x', 0)
                .attr('y', centerLineHeight)
                .text(centerInfoLine2);

            const centerTextBBox = centerTextNode.node().getBBox();
            const centerPaddingX = 12;
            const centerPaddingY = 6;
            const centerWidth = centerTextBBox.width + (centerPaddingX * 2);
            const centerHeight = centerTextBBox.height + (centerPaddingY * 2);

            const centerRectX = zoneCenterX - (centerWidth / 2);

            const centerRectY = entryY - (centerHeight / 2);

            const centerInfoFill = this.isLong ? stopLabelFill : targetLabelFill;

            centerInfo.insert('rect', 'text')
                .attr('x', centerRectX)
                .attr('y', centerRectY)
                .attr('width', centerWidth)
                .attr('height', centerHeight)
                .attr('fill', centerInfoFill)
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 2)
                .attr('rx', centerLabelRadius);

            const centerTextX = centerRectX + (centerWidth / 2);
            const centerTextY = centerRectY + centerPaddingY;

            centerLine1
                .attr('x', centerTextX)
                .attr('y', centerTextY);

            centerLine2
                .attr('x', centerTextX)
                .attr('y', centerTextY + centerLineHeight);

            // Execute button moved to floating toolbar
        }

        const upperY = Math.min(stopY, targetY);
        const lowerY = Math.max(stopY, targetY);

        this.lastRenderMeta = {
            entryX,
            minWidth,
            chartWidth,
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

        const { entryX, minWidth, zoneX2, chartWidth } = this.lastRenderMeta;
        const screenX = context.screen ? context.screen.x : null;
        if (typeof screenX !== 'number' || Number.isNaN(screenX)) {
            return false;
        }

        const toIndex = (pixel) => (context.scales?.chart && context.scales.chart.pixelToDataIndex)
            ? context.scales.chart.pixelToDataIndex(pixel)
            : context.scales?.xScale?.invert?.(pixel);
        const toPixel = (index) => (context.scales?.chart && context.scales.chart.dataIndexToPixel)
            ? context.scales.chart.dataIndexToPixel(index)
            : context.scales?.xScale?.(index);

        const entryIndex = Number.isFinite(this.points?.[0]?.x) ? this.points[0].x : 0;
        let newRightIndex = Number.isFinite(this.points?.[1]?.x) ? this.points[1].x : entryIndex;

        const minRightIndexFromPixels = toIndex(entryX + minWidth);
        const minRightIndex = Number.isFinite(minRightIndexFromPixels)
            ? Math.max(entryIndex, minRightIndexFromPixels)
            : entryIndex;

        if (handleRole.includes('right')) {
            const desiredIndex = Number.isFinite(context.dataPoint?.x)
                ? context.dataPoint.x
                : toIndex(screenX);
            if (Number.isFinite(desiredIndex)) {
                newRightIndex = desiredIndex;
            }
        } else if (handleRole.includes('left')) {
            const desiredIndex = Number.isFinite(context.dataPoint?.x)
                ? context.dataPoint.x
                : toIndex(screenX);
            if (Number.isFinite(desiredIndex)) {
                newRightIndex = desiredIndex;
            }
        } else {
            const desiredIndex = toIndex(screenX);
            if (Number.isFinite(desiredIndex)) {
                newRightIndex = desiredIndex;
            }
        }

        newRightIndex = Math.max(newRightIndex, minRightIndex);
        this.points[1] = { ...this.points[1], x: newRightIndex };
        this.points[2] = { ...this.points[2], x: newRightIndex };

        const newRightX = toPixel(newRightIndex);
        const computedWidth = Number.isFinite(newRightX) ? (newRightX - entryX) : this.meta.zoneWidth;
        const newWidth = Math.max(minWidth, computedWidth || 0);

        this.meta.zoneWidth = newWidth;
        if (Number.isFinite(chartWidth) && chartWidth > 0) {
            this.meta.zoneWidthRatio = newWidth / chartWidth;
        }

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

    // Match default drawing handle visuals (same size/style as other tools)
    createHandles(group, scales) {
        const handleRadius = 3;
        const hitRadius = 12;
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        // Get positions for the 3 key points: Entry, Stop, Target
        const entry = this.points[0];
        const stop = this.points[1];
        const target = this.points[2];
        
        if (!entry || !stop || !target) return;
        
        const entryX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(entry.x) : scales.xScale(entry.x);
        
        const positions = [
            { index: 2, y: scales.yScale(target.y) },  // Target
            { index: 0, y: scales.yScale(entry.y) },   // Entry
            { index: 1, y: scales.yScale(stop.y) }     // Stop
        ];
        
        positions.forEach(({ index, y }) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);

            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', entryX)
                .attr('cy', y)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'ns-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', entryX)
                .attr('cy', y)
                .attr('r', handleRadius)
                .attr('fill', 'transparent')
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'ns-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            // Hover effect
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

    createCornerHandles(scales, zoneX1, zoneX2, upperY, lowerY) {
        const handleRadius = 3;
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Only create corner handles on entry line (for width adjustment)
        const entryY = scales.yScale(this.points[0].y);
        
        const positions = [
            { role: 'corner-entry-right', x: zoneX2, y: entryY, cursor: 'ew-resize' }
        ];

        positions.forEach((pos) => {
            const group = this.group.append('g')
                .attr('class', 'custom-handle-group')
                .attr('data-handle-role', pos.role);

            const handle = group.append('circle')
                .attr('class', 'custom-handle')
                .attr('data-handle-role', pos.role)
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', 'transparent')
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('pointer-events', 'all')
                .style('cursor', pos.cursor)
                .style('opacity', this.selected ? 1 : 0);
            
            // Hover effect
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
