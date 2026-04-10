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

        // Wide invisible hit area — allows selection from anywhere near the line
        this.group.append('line')
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2)
            .attr('stroke', 'rgba(255,255,255,0.001)')
            .attr('stroke-width', 20)
            .attr('fill', 'none')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

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
            .style('pointer-events', 'none')
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
            savedPipSize = Number(userStorage.getItem('chart_pipSize'));
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
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('line')
            .attr('class', 'range-cap-line')
            .attr('x1', left).attr('y1', top)
            .attr('x2', right).attr('y2', top)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        if (isDown) {
            this.group.append('line')
                .attr('class', 'range-cap-line')
                .attr('x1', left).attr('y1', bottom)
                .attr('x2', right).attr('y2', bottom)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || null)
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        this.group.append('line')
            .attr('class', 'range-mid-line-hit')
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
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('line')
            .attr('class', 'range-cap-line')
            .attr('x1', left).attr('y1', top)
            .attr('x2', left).attr('y2', bottom)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('line')
            .attr('class', 'range-cap-line')
            .attr('x1', right).attr('y1', top)
            .attr('x2', right).attr('y2', bottom)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('line')
            .attr('class', 'range-mid-line-hit')
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
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('line')
            .attr('class', 'range-mid-line-hit')
            .attr('x1', left).attr('y1', midY)
            .attr('x2', right).attr('y2', midY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('marker-end', `url(#${markerRight})`)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('class', 'range-mid-line-hit')
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
/** Default spacing for a new ladder entry from primary (tool “+” / panel): toward reward (above E1 long / below E1 short). */
const RR_EXTRA_ENTRY_OFFSET_FRAC = 0.0045;
const RR_EXTRA_ENTRY_MIN_TICK_MULT = 48;

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
        this._ensureExtraLevelMeta();
        this.ensureRiskSettings();
    }

    get isLong() {
        return this.meta.orientation === 'long';
    }

    /** Extra TP/entry/SL levels (prices only); primary triple stays in points[0..2]. */
    _ensureExtraLevelMeta() {
        if (!Array.isArray(this.meta.extraTargets)) this.meta.extraTargets = [];
        if (!Array.isArray(this.meta.extraEntries)) this.meta.extraEntries = [];
        if (!Array.isArray(this.meta.extraStops)) this.meta.extraStops = [];
        if (!Number.isFinite(this.meta.extraLevelIdCounter)) this.meta.extraLevelIdCounter = 1;
    }

    _nextExtraLevelId() {
        this._ensureExtraLevelMeta();
        return this.meta.extraLevelIdCounter++;
    }

    getPriceStep() {
        const inc = this.chart && Number.isFinite(this.chart.priceIncrement) && this.chart.priceIncrement > 0
            ? this.chart.priceIncrement
            : 0.0001;
        return inc;
    }

    /** DrawingToolsManager instance — drawings only get `chart` set, not `manager`. */
    _drawingManager() {
        if (this.manager) return this.manager;
        const fromChart = this.chart && this.chart.drawingManager;
        if (fromChart) return fromChart;
        if (typeof window !== 'undefined' && window.chart && window.chart.drawingManager) {
            return window.chart.drawingManager;
        }
        return null;
    }

    /** Shift all extra level prices by dy (data space); used when the whole tool moves vertically. */
    afterPointsMoveDelta(dx, dy) {
        const ddx = Number.isFinite(dx) ? dx : 0;
        const ddy = Number.isFinite(dy) ? dy : 0;
        if (ddx === 0 && ddy === 0) return;
        if (ddy !== 0) {
            this._ensureExtraLevelMeta();
            ['extraTargets', 'extraEntries', 'extraStops'].forEach((key) => {
                const arr = this.meta[key];
                arr.forEach((row) => {
                    if (row && Number.isFinite(row.y)) row.y += ddy;
                });
            });
            if (this.meta.rrBreakevenLine && Number.isFinite(this.meta.rrBreakevenLine.y)) {
                this.meta.rrBreakevenLine.y += ddy;
            }
            // Do not call normalizeRiskRewardTargetLevels here: it re-sorts TP primary vs extras and
            // can make ladder levels look "stuck" vs entry after a rigid vertical move. Normalize only
            // after order-manager sync / load (_afterRiskRewardOrderManagerSync, baseFromJSON).
        }
        this.meta.updatedAt = Date.now();
        if (typeof this.ensureRiskSettings === 'function') {
            this.ensureRiskSettings();
        }
    }

    _allStopPrices() {
        const p = this.points[1] ? this.points[1].y : null;
        const ex = (this.meta.extraStops || []).map((r) => r.y).filter(Number.isFinite);
        return Number.isFinite(p) ? [p, ...ex] : ex.slice();
    }

    _allTargetPrices() {
        const p = this.points[2] ? this.points[2].y : null;
        const ex = (this.meta.extraTargets || []).map((r) => r.y).filter(Number.isFinite);
        return Number.isFinite(p) ? [p, ...ex] : ex.slice();
    }

    _allEntryPrices() {
        const p = this.points[0] ? this.points[0].y : null;
        const ex = (this.meta.extraEntries || []).map((r) => r.y).filter(Number.isFinite);
        return Number.isFinite(p) ? [p, ...ex] : ex.slice();
    }

    /**
     * Volume-style average entry for multi-leg ladder: weights from order panel row amounts
     * (risk %, risk $ split, or lot-size). Used as the R/R zone boundary (middle line) while E1 stays a separate dashed leg.
     */
    _getWeightedAverageEntryPrice() {
        const p0 = this.points[0]?.y;
        if (!Number.isFinite(p0)) return NaN;
        const extras = (this.meta.extraEntries || []).map((r) => r.y).filter(Number.isFinite);
        if (!extras.length) return p0;
        const prices = [p0, ...extras];
        const om = typeof window !== 'undefined' ? window.chart?.orderManager : null;
        if (om?.isMultiEntryMode && Array.isArray(om.multiEntryLevels) && om.multiEntryLevels.length) {
            const weights = prices.map((_, i) => {
                const a = Number(om.multiEntryLevels[i]?.amount);
                return Number.isFinite(a) && a > 0 ? a : 0;
            });
            const sumW = weights.reduce((s, w) => s + w, 0);
            if (sumW < 1e-12) {
                return prices.reduce((s, p) => s + p, 0) / prices.length;
            }
            let sumPW = 0;
            for (let i = 0; i < prices.length; i++) sumPW += prices[i] * weights[i];
            return sumPW / sumW;
        }
        return prices.reduce((s, p) => s + p, 0) / prices.length;
    }

    /** Worst-case stop price for zone shading (furthest into loss). */
    getAggregatedStopPrice() {
        const s = this._allStopPrices();
        if (!s.length) return this.points[1]?.y;
        return this.isLong ? Math.min(...s) : Math.max(...s);
    }

    /** Farthest target price for zone shading. */
    getAggregatedTargetPrice() {
        const t = this._allTargetPrices();
        if (!t.length) return this.points[2]?.y;
        return this.isLong ? Math.max(...t) : Math.min(...t);
    }

    sanitizeExtraEntryPrice(price) {
        if (!Array.isArray(this.points) || this.points.length < 3) return price;
        const eps = this.getPriceStep() * 0.5 || 0.00001;
        const stops = this._allStopPrices();
        const tgts = this._allTargetPrices();
        if (!stops.length || !tgts.length) return price;
        if (this.isLong) {
            const lo = Math.max(...stops) + eps;
            const hi = Math.min(...tgts) - eps;
            if (hi <= lo) return price;
            return Math.min(Math.max(price, lo), hi);
        }
        const lo = Math.max(...tgts) + eps;
        const hi = Math.min(...stops) - eps;
        if (hi <= lo) return price;
        return Math.min(Math.max(price, lo), hi);
    }

    addExtraTarget() {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const om = window.chart?.orderManager;
        if (om && typeof om.riskRewardAddTPFromTool === 'function') {
            om.riskRewardAddTPFromTool(this);
            this._afterRiskRewardOrderManagerSync();
        } else {
            this._ensureExtraLevelMeta();
            const step = this.getPriceStep();
            const all = this._allTargetPrices();
            const ref = Math.min(...all);
            const y = ref - step;
            this.meta.extraTargets.push({ id: this._nextExtraLevelId(), y: this.sanitizeTargetPrice(y) });
            this.ensureRiskSettings();
        }
        const dm = this._drawingManager();
        if (dm) {
            dm.renderDrawing(this);
            dm.saveDrawings();
        }
    }

    addExtraStop() {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const om = window.chart?.orderManager;
        if (om && typeof om.riskRewardAddBEFromTool === 'function') {
            om.riskRewardAddBEFromTool(this);
            this._afterRiskRewardOrderManagerSync();
        } else {
            this._ensureExtraLevelMeta();
            const entry = this.points[0].y;
            const tp = typeof this.getAggregatedTargetPrice === 'function'
                ? this.getAggregatedTargetPrice()
                : this.points[2].y;
            const mid = (entry + tp) / 2;
            const y = this.sanitizeBreakevenTriggerPrice(mid);
            this.meta.rrBreakevenLine = {
                id: this._nextExtraLevelId(),
                y
            };
            this.ensureRiskSettings();
        }
        const dmStop = this._drawingManager();
        if (dmStop) {
            dmStop.renderDrawing(this);
            dmStop.saveDrawings();
        }
    }

    addExtraEntry() {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        const om = window.chart?.orderManager;
        if (om && typeof om.riskRewardAddEntryFromTool === 'function') {
            om.riskRewardAddEntryFromTool(this);
            this._afterRiskRewardOrderManagerSync();
        } else {
            this._ensureExtraLevelMeta();
            const step = this.getPriceStep();
            const e = this.points[0].y;
            const offset = Math.max(
                step * RR_EXTRA_ENTRY_MIN_TICK_MULT,
                Math.abs(e) * RR_EXTRA_ENTRY_OFFSET_FRAC
            );
            const y = this.isLong ? e + offset : e - offset;
            this.meta.extraEntries.push({ id: this._nextExtraLevelId(), y: this.sanitizeExtraEntryPrice(y) });
            this.ensureRiskSettings();
        }
        const dmEntry = this._drawingManager();
        if (dmEntry) {
            dmEntry.renderDrawing(this);
            dmEntry.saveDrawings();
        }
    }

    /**
     * Merge primary + extra TP prices, drop invalid (wrong side of entry), assign farthest TP to points[2]
     * and intermediates to extraTargets — keeps multi-TP lines inside the profit zone.
     */
    normalizeRiskRewardTargetLevels() {
        if (!Array.isArray(this.points) || this.points.length < 3) return;
        this._ensureExtraLevelMeta();
        const entry = this.points[0].y;
        if (!Number.isFinite(entry)) return;

        const step = (typeof this.getPriceStep === 'function' ? this.getPriceStep() : 0.0001);
        const eps = Math.max(Math.abs(entry) * 1e-8, step * 0.5 || 0.00001);

        const raw = [];
        if (Number.isFinite(this.points[2]?.y)) raw.push(this.points[2].y);
        (this.meta.extraTargets || []).forEach((r) => {
            if (r && Number.isFinite(r.y)) raw.push(r.y);
        });
        if (raw.length === 0) return;

        const oldExtras = (this.meta.extraTargets || []).filter((r) => r && Number.isFinite(r.y));

        const clampSide = (p) => (this.isLong ? Math.max(p, entry + eps) : Math.min(p, entry - eps));

        if (raw.length === 1) {
            const p = this.sanitizeTargetPrice(clampSide(raw[0]));
            this.points[2] = { ...this.points[2], y: p };
            this.meta.extraTargets = [];
            return;
        }

        const cleaned = raw.map(clampSide);
        const uniqueSorted = this.isLong
            ? [...new Set(cleaned)].sort((a, b) => a - b)
            : [...new Set(cleaned)].sort((a, b) => b - a);

        if (uniqueSorted.length === 1) {
            const p = this.sanitizeTargetPrice(uniqueSorted[0]);
            this.points[2] = { ...this.points[2], y: p };
            this.meta.extraTargets = [];
            return;
        }

        const primary = uniqueSorted[uniqueSorted.length - 1];
        const extraPrices = uniqueSorted.slice(0, -1);

        const oldSorted = this.isLong
            ? [...oldExtras].sort((a, b) => a.y - b.y)
            : [...oldExtras].sort((a, b) => b.y - a.y);

        this.meta.extraTargets = extraPrices.map((price, i) => ({
            id: oldSorted[i]?.id ?? this._nextExtraLevelId(),
            y: this.sanitizeTargetPrice(price)
        }));
        this.points[2] = { ...this.points[2], y: this.sanitizeTargetPrice(primary) };
    }

    /** Re-apply chart clamps after order-manager push/pull so drawing stays consistent with panel math. */
    _afterRiskRewardOrderManagerSync() {
        this.normalizeRiskRewardTargetLevels();
        (this.meta.extraEntries || []).forEach((row) => {
            if (row && Number.isFinite(row.y)) row.y = this.sanitizeExtraEntryPrice(row.y);
        });
        if (this.meta.rrBreakevenLine && Number.isFinite(this.meta.rrBreakevenLine.y)) {
            this.meta.rrBreakevenLine.y = this.sanitizeBreakevenTriggerPrice(this.meta.rrBreakevenLine.y);
        }
        if (this.points[2] && Number.isFinite(this.points[2].y)) {
            this.setTargetPrice(this.points[2].y);
        }
        this.ensureRiskSettings();
        this.recalculateLotSizeFromRisk();
    }

    _setExtraLevelY(kind, index, y) {
        this._ensureExtraLevelMeta();
        const key = kind === 'target' ? 'extraTargets' : kind === 'stop' ? 'extraStops' : 'extraEntries';
        const arr = this.meta[key];
        if (!arr || index < 0 || index >= arr.length) return;
        let next = y;
        if (kind === 'target') next = this.sanitizeTargetPrice(y);
        else if (kind === 'stop') next = this.sanitizeStopPrice(y);
        else next = this.sanitizeExtraEntryPrice(y);
        arr[index] = { ...arr[index], y: next };
        this.ensureRiskSettings();
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

    /** BE trigger sits between entry and TP (not a second SL). */
    sanitizeBreakevenTriggerPrice(price) {
        if (!Array.isArray(this.points) || this.points.length < 3) return price;
        const entry = this.points[0].y;
        const tp = typeof this.getAggregatedTargetPrice === 'function'
            ? this.getAggregatedTargetPrice()
            : this.points[2].y;
        if (!Number.isFinite(entry) || !Number.isFinite(tp)) return price;
        const step = Math.max(this.getPriceStep() * 2, 1e-12);
        if (this.isLong) {
            const lo = entry + step;
            const hi = tp - step;
            if (hi <= lo) return price;
            return Math.min(Math.max(price, lo), hi);
        }
        const lo = tp + step;
        const hi = entry - step;
        if (hi <= lo) return price;
        return Math.min(Math.max(price, lo), hi);
    }

    setEntryPrice(price) {
        if (!Array.isArray(this.points) || this.points.length === 0) return;
        const delta = price - this.points[0].y;
        this.points = this.points.map(point => ({ ...point, y: point.y + delta }));
        this.afterPointsMoveDelta(0, delta);
        this.ensureRiskSettings();
        this.recalculateLotSizeFromRisk(); // Recalculate to maintain constant risk
    }

    /**
     * Clamp primary entry between stop and target so dragging the entry line resizes risk/reward zones,
     * not the whole tool (SL/TP prices stay fixed).
     */
    clampPrimaryEntryPrice(newY) {
        if (!Array.isArray(this.points) || this.points.length < 3) return newY;
        const sl = this.points[1].y;
        const tp = this.points[2].y;
        if (!Number.isFinite(newY) || !Number.isFinite(sl) || !Number.isFinite(tp)) return newY;
        const lo = Math.min(sl, tp);
        const hi = Math.max(sl, tp);
        const step = this.getPriceStep();
        const span = hi - lo;
        const eps = Math.max(step * 0.5, span * 1e-9, 1e-12);
        if (span <= eps * 2) return this.points[0].y;
        return Math.min(hi - eps, Math.max(lo + eps, newY));
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
        const dmExec = this._drawingManager();
        if (dmExec) {
            dmExec.renderDrawing(this);
        }
    }

    prefillOrderPanel(orderManager, direction, entryPrice, slPrice, tpPrice, quantity, riskAmount) {
        this.ensureRiskSettings();
        const entryList = this._allEntryPrices();
        // Primary leg = tool zone boundary (points[0] first in _allEntryPrices). Never use a mean here:
        // writing avg into #orderEntryPrice and dispatching 'input' before multi-entry rows exist made
        // pullRiskRewardToolFromManager snap points[0] to the average and clear extraEntries.
        const primaryEntry = entryList.length > 0 ? entryList[0] : entryPrice;
        const stops = this._allStopPrices();
        const tgs = this._allTargetPrices();
        if (stops.length) {
            slPrice = this.isLong ? Math.min(...stops) : Math.max(...stops);
        }
        if (tgs.length) {
            tpPrice = this.isLong ? Math.max(...tgs) : Math.min(...tgs);
        }

        console.log(`📋 Prefilling order panel:`);
        console.log(`   Direction: ${direction}`);
        console.log(`   Entry (primary): ${primaryEntry}`);
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
            const priceDiff = primaryEntry - currentPrice;
            const tolerance = currentPrice * 0.0001; // 0.01% tolerance for "at market"
            
            console.log(`   Price comparison: Entry=${primaryEntry.toFixed(5)}, Current=${currentPrice.toFixed(5)}, Diff=${priceDiff.toFixed(5)}`);
            
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

        // Multiple entries (ladder) MUST run before #orderEntryPrice input events, or pull() sees
        // isMultiEntryMode false and overwrites the tool's primary with the main field value.
        if (entryList.length > 1 && typeof orderManager.setEntryMode === 'function') {
            if (!Number.isFinite(orderManager.multiEntryIdCounter)) orderManager.multiEntryIdCounter = 1;
            const prec = typeof orderManager.getPricePrecision === 'function' ? orderManager.getPricePrecision() : 5;
            const riskUsd = this.meta.risk?.riskAmountUSD
                ?? this.meta.risk?.riskAmount
                ?? riskAmount
                ?? 100;
            const n = entryList.length;
            const amt = Math.max(1, Math.round(riskUsd / n));
            // Same ladder order as the tool (E1 = primary), not price-sorted.
            orderManager.multiEntryLevels = entryList.map((price) => ({
                id: orderManager.multiEntryIdCounter++,
                price: parseFloat(price.toFixed(prec)),
                amount: amt
            }));
            orderManager.setEntryMode(true);
        }

        // Fill in the entry price (primary leg — matches RR zone boundary)
        const entryInput = document.getElementById('orderEntryPrice');
        if (entryInput) {
            const prec = typeof orderManager.getPricePrecision === 'function' ? orderManager.getPricePrecision() : 5;
            entryInput.value = typeof orderManager.formatPrice === 'function'
                ? orderManager.formatPrice(primaryEntry)
                : primaryEntry.toFixed(prec);
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
            const tpCardMain = document.getElementById('tpCardMain');
            if (tpCardMain) tpCardMain.style.display = 'flex';
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

        // Multiple take profits (order panel multi-TP UI)
        if (tgs.length > 1 && typeof orderManager.renderTPTargets === 'function') {
            const prec = typeof orderManager.getPricePrecision === 'function' ? orderManager.getPricePrecision() : 5;
            const sortedTp = [...tgs].sort((a, b) => (this.isLong ? a - b : b - a));
            const share = parseFloat((100 / sortedTp.length).toFixed(1));
            orderManager.tpTargets = sortedTp.map((price, i) => ({
                id: i + 1,
                price: parseFloat(price.toFixed(prec)),
                percentage: i === sortedTp.length - 1
                    ? parseFloat((100 - share * (sortedTp.length - 1)).toFixed(1))
                    : share
            }));
            const multipleTPToggle = document.getElementById('multipleTPToggle');
            const multipleTPSettings = document.getElementById('multipleTPSettings');
            const multiTPBtn = document.getElementById('multiTPBtn');
            const tpSingleView = document.querySelector('.order-tp-single');
            if (multipleTPToggle) multipleTPToggle.checked = true;
            if (multipleTPSettings) multipleTPSettings.classList.remove('is-hidden');
            if (tpSingleView) tpSingleView.classList.add('is-hidden');
            if (multiTPBtn) {
                multiTPBtn.textContent = 'Single';
                multiTPBtn.classList.add('active');
            }
            const numTPInput = document.getElementById('numTPTargets');
            if (numTPInput) numTPInput.value = String(sortedTp.length);
            orderManager.renderTPTargets();
            if (typeof orderManager.updatePreviewLines === 'function') {
                orderManager.updatePreviewLines();
            }
        }

        if (typeof orderManager.calculatePositionFromRisk === 'function') {
            orderManager.calculatePositionFromRisk();
        }
        
        // Also set on orderManager for calculations
        if (orderManager.tpPrice !== undefined) orderManager.tpPrice = tpPrice;
        if (orderManager.slPrice !== undefined) orderManager.slPrice = slPrice;
        if (orderManager.entryPrice !== undefined) orderManager.entryPrice = primaryEntry;
    }

    render(container, scales) {
        this.ensureRiskSettings();
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 3) return;

        /** Vertical hit for primary entry drag — widened to cover .center-info pill when selected. */
        let primaryEntryHitHeight = 48;

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

        const hasMultiEntry = (this.meta.extraEntries || []).length > 0;
        let zoneEntryPrice = entry.y;
        if (hasMultiEntry) {
            const wAvg = this._getWeightedAverageEntryPrice();
            if (Number.isFinite(wAvg)) zoneEntryPrice = wAvg;
        }
        const avgEntryYpx = scales.yScale(zoneEntryPrice);

        const worstStopPx = scales.yScale(this.getAggregatedStopPrice());
        const bestTargetPx = scales.yScale(this.getAggregatedTargetPrice());

        const riskTop = Math.min(avgEntryYpx, worstStopPx);
        const riskBot = Math.max(avgEntryYpx, worstStopPx);
        const riskHeight = riskBot - riskTop;

        const rewTop = Math.min(avgEntryYpx, bestTargetPx);
        const rewBot = Math.max(avgEntryYpx, bestTargetPx);
        const rewardHeight = rewBot - rewTop;

        const risk = Math.max(Math.abs(zoneEntryPrice - stop.y), 0.0000001);
        const reward = Math.abs(target.y - zoneEntryPrice);
        const rrRatio = (reward / risk).toFixed(2);

        const dashExtra = '6 4';

        this.group.insert('rect', ':first-child')
            .attr('class', 'position-zone')
            .attr('x', zoneX1)
            .attr('y', riskTop)
            .attr('width', zoneWidth)
            .attr('height', riskHeight)
            .attr('fill', this.style.riskColor)
            .attr('stroke', 'none')
            // When selected, zones must not steal events — whole-tool drag uses .rr-body-drag instead
            // so the entry hit strip (painted later) wins on the middle row.
            .style('pointer-events', this.selected ? 'none' : 'all')
            .style('cursor', 'move');

        this.group.insert('rect', ':first-child')
            .attr('class', 'position-zone')
            .attr('x', zoneX1)
            .attr('y', rewTop)
            .attr('width', zoneWidth)
            .attr('height', rewardHeight)
            .attr('fill', this.style.rewardColor)
            .attr('stroke', 'none')
            .style('pointer-events', this.selected ? 'none' : 'all')
            .style('cursor', 'move');

        const bodyTopPx = Math.min(riskTop, rewTop);
        const bodyBotPx = Math.max(riskBot, rewBot);
        // No whole-tool drag on the entry row — gap so only the entry hit strip (painted later) sees events.
        const entryRowGapPx = 36;
        const gapHalf = entryRowGapPx / 2;
        const bandTop = avgEntryYpx - gapHalf;
        const bandBot = avgEntryYpx + gapHalf;
        const upperBodyH = Math.max(0, bandTop - bodyTopPx);
        const lowerBodyY = bandBot;
        const lowerBodyH = Math.max(0, bodyBotPx - lowerBodyY);
        const appendBodyDrag = (y0, h) => {
            if (h < 1) return;
            this.group.append('rect')
                .attr('class', 'rr-body-drag')
                .attr('x', zoneX1)
                .attr('y', y0)
                .attr('width', zoneWidth)
                .attr('height', h)
                .attr('fill', 'rgba(0,0,0,0)')
                .attr('stroke', 'none')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('cursor', 'move');
        };
        appendBodyDrag(bodyTopPx, upperBodyH);
        appendBodyDrag(lowerBodyY, lowerBodyH);

        // Same as TP/stop visible lines: do not capture pointer-events on the stroke. Otherwise this
        // line competes with whole-tool drag and blocks the entry hit rect / left handles (TP feels
        // fine because its dashed line uses pointer-events: none).
        this.group.append('line')
            .attr('class', 'shape-border rr-entry-stroke rr-avg-entry-stroke')
            .attr('x1', zoneX1)
            .attr('y1', avgEntryYpx)
            .attr('x2', zoneX2)
            .attr('y2', avgEntryYpx)
            .attr('stroke', this.style.entryColor || '#565656ff')
            .attr('stroke-width', hasMultiEntry ? 2 : 1.5)
            .style('pointer-events', 'none')
            .style('cursor', 'inherit');

        if (hasMultiEntry) {
            this.group.append('line')
                .attr('class', 'rr-extra-line rr-extra-entry rr-e1-leg')
                .attr('x1', zoneX1)
                .attr('y1', entryY)
                .attr('x2', zoneX2)
                .attr('y2', entryY)
                .attr('stroke', this.style.entryColor || '#2962FF')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', dashExtra)
                .style('pointer-events', 'none');
        }

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

        /** Same wide transparent stroke for every extra level (TP2, E2, BE, SL2) — one code path as TP. */
        const extraDragHitW = 24;
        const appendExtraDragHit = (yy, role, hitW = extraDragHitW) => {
            this.group.append('line')
                .attr('class', 'custom-handle rr-extra-drag-hit')
                .attr('data-handle-role', role)
                .attr('x1', zoneX1)
                .attr('y1', yy)
                .attr('x2', zoneX2)
                .attr('y2', yy)
                .attr('stroke', 'transparent')
                .attr('stroke-width', hitW)
                // `all`: same reliable hits as primary entry rect; `stroke` alone misses on some browsers.
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('cursor', 'ns-resize');
        };
        (this.meta.extraStops || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            this.group.append('line')
                .attr('class', 'rr-extra-line rr-extra-stop')
                .attr('x1', zoneX1)
                .attr('y1', yy)
                .attr('x2', zoneX2)
                .attr('y2', yy)
                .attr('stroke', '#ef4444')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', dashExtra)
                .style('pointer-events', 'none');
            // Drag hit lines for extra stops/targets are painted after the primary entry rect (see end of render)
            // so E2 / TP2 strips stay above the wide middle hit rect and receive clicks.
        });
        let beLinePx = null;
        if (this.meta.rrBreakevenLine && Number.isFinite(this.meta.rrBreakevenLine.y)) {
            beLinePx = scales.yScale(this.meta.rrBreakevenLine.y);
            this.group.append('line')
                .attr('class', 'rr-extra-line rr-extra-be')
                .attr('x1', zoneX1)
                .attr('y1', beLinePx)
                .attr('x2', zoneX2)
                .attr('y2', beLinePx)
                .attr('stroke', '#f59e0b')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', dashExtra)
                .style('pointer-events', 'none');
        }
        (this.meta.extraTargets || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            this.group.append('line')
                .attr('class', 'rr-extra-line rr-extra-target')
                .attr('x1', zoneX1)
                .attr('y1', yy)
                .attr('x2', zoneX2)
                .attr('y2', yy)
                .attr('stroke', '#22c55e')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', dashExtra)
                .style('pointer-events', 'none');
        });
        (this.meta.extraEntries || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            this.group.append('line')
                .attr('class', 'rr-extra-line rr-extra-entry')
                .attr('x1', zoneX1)
                .attr('y1', yy)
                .attr('x2', zoneX2)
                .attr('y2', yy)
                .attr('stroke', this.style.entryColor || '#2962FF')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', dashExtra)
                .style('pointer-events', 'none');
            // E2+ drag hits appended after primary entry strip (see end of render).
        });

        // Recalculate lot size from risk before rendering labels
        this.recalculateLotSizeFromRisk();

        const showDetails = this.selected;

        if (showDetails) {
            // Percent / ticks vs weighted avg entry when E2+ (same reference as zone boundary & R:R pill).
            const entryPrice = zoneEntryPrice;
            const stopPrice = stop.y;
            const targetPrice = target.y;

            const targetPercent = ((Math.abs(targetPrice - entryPrice) / entryPrice) * 100).toFixed(3);
            const stopPercent = ((Math.abs(stopPrice - entryPrice) / entryPrice) * 100).toFixed(3);

            const targetTicks = (Math.abs(targetPrice - entryPrice) / 0.0001).toFixed(1);
            const stopTicks = (Math.abs(stopPrice - entryPrice) / 0.0001).toFixed(1);

            let displayQty = this.meta.risk?.lotSize || 0.01;
            const hasLadderExtras = (this.meta.extraEntries || []).length > 0;
            const omQty = typeof window !== 'undefined' ? window.chart?.orderManager : null;
            if (hasLadderExtras && omQty?.isMultiEntryMode && Array.isArray(omQty.multiEntryLevels)) {
                const precQ = typeof omQty.getPricePrecision === 'function' ? omQty.getPricePrecision() : 5;
                const rrp = (p) => (Number.isFinite(p) ? parseFloat(Number(p).toFixed(precQ)) : p);
                const slQ = rrp(
                    Number.isFinite(stop.y) ? stop.y : parseFloat(document.getElementById('slPrice')?.value || '') || 0
                );
                const psQ = omQty.pipSize || this.getPriceStep();
                const pvQ = omQty.pipValuePerLot || 10;
                let sumLots = 0;
                let counted = 0;
                omQty.multiEntryLevels.forEach((lv, i) => {
                    if (!lv) return;
                    if (i > 0) {
                        const ex = (this.meta.extraEntries || [])[i - 1];
                        if (!ex || !Number.isFinite(ex.y)) return;
                    }
                    const rowY = i === 0 ? entry.y : (this.meta.extraEntries || [])[i - 1].y;
                    if (!Number.isFinite(rowY) || rowY <= 0) return;
                    const legPx = rrp(rowY);
                    const levelForLots = { ...lv, price: legPx };
                    if (slQ > 0 && typeof omQty._calcLevelLotSizeNumeric === 'function') {
                        const n = omQty._calcLevelLotSizeNumeric(levelForLots, slQ, psQ, pvQ);
                        if (Number.isFinite(n) && n > 0) {
                            sumLots += n;
                            counted += 1;
                        }
                    }
                });
                if (counted > 0) displayQty = sumLots;
            }

            const omFmtEarly = typeof window !== 'undefined' ? window.chart?.orderManager : null;
            const avgPriceLabel = hasMultiEntry && Number.isFinite(zoneEntryPrice)
                ? (typeof omFmtEarly?.formatPrice === 'function'
                    ? omFmtEarly.formatPrice(zoneEntryPrice)
                    : zoneEntryPrice.toFixed(
                        typeof omFmtEarly?.getPricePrecision === 'function' ? omFmtEarly.getPricePrecision() : 5
                    ))
                : '';

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
                // rr-no-hit: setupDrawingInteraction sets all `text` to pointer-events:all — exclude these labels
                // so the primary entry .custom-handle rect receives drags (see drawing-tools-manager).
                const labelGroup = this.group.append('g').attr('class', `${className} rr-no-hit`);

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
                    .attr('rx', edgeLabelRadius)
                    .style('pointer-events', 'none');

                textNode
                    .attr('x', rectX + (labelWidth / 2))
                    .attr('y', rectTop + labelPaddingY)
                    .style('pointer-events', 'none');
            };

            const targetLabelFill = '#22c55e';
            const stopLabelFill = '#ef4444';

            // Target / Stop labels: TV-like behavior (wide = edge-snapped, narrow = floated with fixed spacing)
            const targetLabelText = `Target: ${targetPrice.toFixed(5)} (${targetPercent}%) ${targetTicks}, Amount: ${targetAmount}`;
            const targetSide = targetY <= avgEntryYpx ? 'top' : 'bottom';
            createEdgeLabel({
                className: 'target-label',
                text: targetLabelText,
                lineY: targetY,
                fill: targetLabelFill,
                side: targetSide
            });

            const stopLabelText = `Stop: ${stopPrice.toFixed(5)} (${stopPercent}%) ${stopTicks}, Amount: ${stopAmount}`;
            const stopSide = stopY <= avgEntryYpx ? 'top' : 'bottom';
            createEdgeLabel({
                className: 'stop-label',
                text: stopLabelText,
                lineY: stopY,
                fill: stopLabelFill,
                side: stopSide
            });

            // Center Info Box (TradingView-like red pill with border)
            const pnl = 0; // Will be calculated when order is active
            const centerInfoLine1 = `Open P&L: ${pnl.toFixed(0)}, Qty: ${displayQty.toFixed(2)}`;
            const centerInfoLine2 = hasMultiEntry && avgPriceLabel
                ? `Risk/Reward Ratio: ${rrRatio} · Avg ${avgPriceLabel}`
                : `Risk/Reward Ratio: ${rrRatio}`;
            const centerInfo = this.group.append('g')
                .attr('class', 'center-info rr-no-hit')
                .style('pointer-events', 'none');

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

            primaryEntryHitHeight = Math.max(56, centerHeight + 20);

            const centerRectX = zoneCenterX - (centerWidth / 2);

            const centerRectY = avgEntryYpx - (centerHeight / 2);

            const centerInfoFill = this.isLong ? stopLabelFill : targetLabelFill;

            centerInfo.insert('rect', 'text')
                .attr('x', centerRectX)
                .attr('y', centerRectY)
                .attr('width', centerWidth)
                .attr('height', centerHeight)
                .attr('fill', centerInfoFill)
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 2)
                .attr('rx', centerLabelRadius)
                .style('pointer-events', 'none');

            const centerTextX = centerRectX + (centerWidth / 2);
            const centerTextY = centerRectY + centerPaddingY;

            centerLine1
                .attr('x', centerTextX)
                .attr('y', centerTextY);

            centerLine2
                .attr('x', centerTextX)
                .attr('y', centerTextY + centerLineHeight);

            /** Left-gutter mini badges: one horizontal line (e.g. "BE 1.56R", "E1 0.05 lot"). */
            const appendRrMiniBadge = (lineYpx, lineTexts, bgFill) => {
                const parts = (lineTexts || []).filter((x) => x != null && String(x).length > 0);
                if (!parts.length) return;
                const line = parts.join(' ');
                const padX = 6;
                const padY = 3;
                const g = this.group.append('g').attr('class', 'rr-mini-level-badge rr-no-hit').style('pointer-events', 'none');
                const tmp = g.append('text')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('dominant-baseline', 'hanging')
                    .attr('font-size', '10px')
                    .attr('font-weight', '600')
                    .attr('font-family', labelFontFamily)
                    .attr('opacity', 0)
                    .text(line);
                const bb = tmp.node().getBBox();
                tmp.remove();
                const bw = bb.width + padX * 2;
                const bh = bb.height + padY * 2;
                const bx = zoneX1 + 4;
                const by = lineYpx - bh / 2;
                g.append('rect')
                    .attr('x', bx)
                    .attr('y', by)
                    .attr('width', bw)
                    .attr('height', bh)
                    .attr('rx', 4)
                    .attr('fill', bgFill)
                    .attr('stroke', 'rgba(255,255,255,0.14)');
                g.append('text')
                    .attr('x', bx + padX)
                    .attr('y', by + padY)
                    .attr('dominant-baseline', 'hanging')
                    .attr('fill', '#f1f5f9')
                    .attr('font-size', '10px')
                    .attr('font-weight', '600')
                    .attr('font-family', labelFontFamily)
                    .text(line);
            };

            const om = typeof window !== 'undefined' ? window.chart?.orderManager : null;
            // SL/leg prices must come from the drawing (points), not panel-only OM rows: whole-tool moves
            // update the drawing every frame while multiEntryLevels can lag or differ in float noise → lots jitter.
            const rrPrec = typeof om?.getPricePrecision === 'function' ? om.getPricePrecision() : 5;
            const rrRoundPx = (p) => (Number.isFinite(p) ? parseFloat(Number(p).toFixed(rrPrec)) : p);
            const slFromDrawing = rrRoundPx(
                Number.isFinite(stop.y) ? stop.y : parseFloat(document.getElementById('slPrice')?.value || '') || 0
            );
            const pipS = om?.pipSize || this.getPriceStep();
            const pipV = om?.pipValuePerLot || 10;
            const entryFill = 'rgba(30, 64, 175, 0.92)';
            const tpInnerFill = 'rgba(22, 101, 52, 0.92)';
            const beFill = 'rgba(120, 53, 15, 0.92)';
            const slExtraFill = 'rgba(127, 29, 29, 0.88)';

            const hasDrawnExtras = (this.meta.extraEntries || []).length > 0;
            const omMulti = om?.isMultiEntryMode && Array.isArray(om.multiEntryLevels) && om.multiEntryLevels.length > 0;

            if (omMulti) {
                om.multiEntryLevels.forEach((lv, i) => {
                    if (!lv) return;
                    // Only E1 until the tool has a real extra entry line (blue +). OM can still hold a
                    // default/stale second row while extraEntries is empty — do not badge phantom E2+.
                    if (i > 0) {
                        const ex = (this.meta.extraEntries || [])[i - 1];
                        if (!ex || !Number.isFinite(ex.y)) return;
                    }
                    const rowY = i === 0 ? entry.y : (this.meta.extraEntries || [])[i - 1].y;
                    if (!Number.isFinite(rowY) || rowY <= 0) return;
                    const yPix = scales.yScale(rowY);
                    const legPx = rrRoundPx(rowY);
                    const levelForLots = { ...lv, price: legPx };
                    let lotStr = '—';
                    if (slFromDrawing > 0 && typeof om._calcLevelLotSize === 'function') {
                        const s = String(om._calcLevelLotSize(levelForLots, slFromDrawing, pipS, pipV) || '').trim();
                        if (s) lotStr = s;
                    } else if (typeof om._calcLevelLotSizeNumeric === 'function' && slFromDrawing > 0) {
                        const n = om._calcLevelLotSizeNumeric(levelForLots, slFromDrawing, pipS, pipV);
                        if (Number.isFinite(n) && n > 0) lotStr = n.toFixed(2);
                    } else if (Number.isFinite(lv.amount) && lv.amount > 0 && om.positionSizeMode === 'lot-size') {
                        lotStr = String(parseFloat(Number(lv.amount).toFixed(2)));
                    }
                    appendRrMiniBadge(yPix, [`E${i + 1}`, `${lotStr} lot`], entryFill);
                });
            } else if (hasDrawnExtras) {
                const fallbackLot = Number.isFinite(displayQty) ? displayQty.toFixed(2) : '—';
                appendRrMiniBadge(entryY, ['E1', `${fallbackLot} lot`], entryFill);
                (this.meta.extraEntries || []).forEach((row, i) => {
                    if (!row || !Number.isFinite(row.y)) return;
                    appendRrMiniBadge(scales.yScale(row.y), [`E${i + 2}`, `${fallbackLot} lot`], entryFill);
                });
            }

            const avgFill = 'rgba(71, 85, 105, 0.92)';
            if (hasMultiEntry && avgPriceLabel) {
                appendRrMiniBadge(avgEntryYpx, ['Avg', avgPriceLabel], avgFill);
            }

            const mtOn = typeof document !== 'undefined' && document.getElementById('multipleTPToggle')?.checked;
            if (mtOn && om?.tpTargets?.length > 1 && (this.meta.extraTargets || []).length) {
                const sortedTp = [...om.tpTargets].sort((a, b) =>
                    (this.isLong ? a.price - b.price : b.price - a.price));
                const innerTp = sortedTp.slice(0, -1);
                (this.meta.extraTargets || []).forEach((row, i) => {
                    if (!row || !Number.isFinite(row.y)) return;
                    const yy = scales.yScale(row.y);
                    const leg = innerTp[i];
                    const pct = leg ? Number(leg.percentage) : NaN;
                    const pctStr = Number.isFinite(pct) ? `${Math.round(pct)}%` : '—';
                    const usd = Number.isFinite(pct) ? Math.round(targetAmount * (pct / 100)) : null;
                    const sub = usd != null ? `$${usd} · ${pctStr}` : pctStr;
                    appendRrMiniBadge(yy, [`TP${i + 2}`, sub], tpInnerFill);
                });
            } else if ((this.meta.extraTargets || []).length) {
                (this.meta.extraTargets || []).forEach((row, i) => {
                    if (!row || !Number.isFinite(row.y)) return;
                    appendRrMiniBadge(scales.yScale(row.y), [`TP${i + 2}`, '—'], tpInnerFill);
                });
            }

            (this.meta.extraStops || []).forEach((row, i) => {
                if (!row || !Number.isFinite(row.y)) return;
                appendRrMiniBadge(scales.yScale(row.y), [`SL${i + 2}`], slExtraFill);
            });

            if (beLinePx != null) {
                const beMode = om?.breakevenMode || 'rr';
                const beInput = typeof document !== 'undefined' ? document.getElementById('breakevenPips') : null;
                const beAmtInput = typeof document !== 'undefined' ? document.getElementById('breakevenAmount') : null;
                const rawBe = parseFloat(beInput?.value || '0.5');
                let beSub = '';
                if (beMode === 'rr') {
                    beSub = `${Number.isFinite(rawBe) ? rawBe : 0.5}R`;
                } else if (beMode === 'pips') {
                    beSub = `${Number.isFinite(rawBe) ? rawBe : 10} pips`;
                } else {
                    const a = parseFloat(beAmtInput?.value || '50');
                    beSub = Number.isFinite(a) ? `$${Math.round(a)}` : '—';
                }
                appendRrMiniBadge(beLinePx, ['BE', beSub], beFill);
            }

            // Execute button moved to floating toolbar
        }

        // Include avg entry, E1, E2+, TP/SL/BE so corner handles span the full ladder.
        const entryLegPixels = [avgEntryYpx, entryY];
        (this.meta.extraEntries || []).forEach((row) => {
            if (row && Number.isFinite(row.y)) entryLegPixels.push(scales.yScale(row.y));
        });
        const entrySpanMinPx = Math.min(...entryLegPixels);
        const entrySpanMaxPx = Math.max(...entryLegPixels);
        const upperY = Math.min(entrySpanMinPx, bestTargetPx, worstStopPx, beLinePx != null ? beLinePx : entrySpanMinPx);
        const lowerY = Math.max(entrySpanMaxPx, bestTargetPx, worstStopPx, beLinePx != null ? beLinePx : entrySpanMaxPx);

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

        // Primary entry hit rect first (below); extra TP/SL/E drag lines after (on top) so E2 is draggable
        // and does not lose events to this wide strip.
        if (this.selected) {
            // + buttons sit past zoneX2; primary entry strip can use full zone width.
            const entryDragX2 = zoneX2;
            const hasExtraEntries = (this.meta.extraEntries || []).length > 0;
            // With E2+, keep a generous vertical strip (was capped at 52px, which made primary hard to grab).
            const hitH = hasExtraEntries
                ? Math.max(52, Math.min(primaryEntryHitHeight, 80))
                : Math.max(48, primaryEntryHitHeight);
            const hitW = Math.max(1, entryDragX2 - zoneX1);
            this.group.append('rect')
                .attr('class', 'custom-handle rr-primary-entry-drag-hit')
                .attr('data-handle-role', 'rr-primary-entry')
                .attr('x', zoneX1)
                .attr('y', entryY - hitH / 2)
                .attr('width', hitW)
                .attr('height', hitH)
                .attr('fill', 'rgba(0, 0, 0, 0.02)')
                .attr('stroke', 'none')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
        }

        (this.meta.extraStops || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            appendExtraDragHit(yy, `rr-extra-stop-${idx}`);
        });
        if (this.meta.rrBreakevenLine && Number.isFinite(this.meta.rrBreakevenLine.y)) {
            appendExtraDragHit(scales.yScale(this.meta.rrBreakevenLine.y), 'rr-be-line');
        }
        (this.meta.extraTargets || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            appendExtraDragHit(yy, `rr-extra-target-${idx}`);
        });
        (this.meta.extraEntries || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            const yy = scales.yScale(row.y);
            appendExtraDragHit(yy, `rr-extra-entry-${idx}`);
        });

        // + buttons last in paint order so drag hit rects / lines do not sit on top and eat clicks.
        // Large transparent hit circle = full control target (not just the glyph).
        if (this.selected) {
            const plusR = 9;
            const plusHitR = 20;
            const plusOutsideGap = 8;
            const plusX = zoneX2 + plusOutsideGap + plusR;
            const mkPlus = (lineY, fill, handler) => {
                const g = this.group.append('g').attr('class', 'rr-plus-btn');
                const onClick = (e) => {
                    e.stopPropagation();
                    if (typeof e.preventDefault === 'function') e.preventDefault();
                    handler();
                };
                // Paint visible glyph first; put the hit target LAST so it sits on top. Relying on
                // pointer-events:none on text/circle is flaky in SVG — without a top hit layer,
                // only stroke/edge regions feel clickable.
                g.append('circle')
                    .attr('class', 'rr-plus-visible')
                    .attr('cx', plusX)
                    .attr('cy', lineY)
                    .attr('r', plusR)
                    .attr('fill', fill)
                    .attr('stroke', 'rgba(255,255,255,0.85)')
                    .attr('stroke-width', 1)
                    .attr('pointer-events', 'none')
                    .style('pointer-events', 'none')
                    .style('cursor', 'inherit');
                g.append('text')
                    .attr('x', plusX)
                    .attr('y', lineY + 4)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#ffffff')
                    .attr('font-size', '12px')
                    .attr('font-weight', '700')
                    .attr('pointer-events', 'none')
                    .style('pointer-events', 'none')
                    .text('+');
                g.append('circle')
                    .attr('class', 'rr-plus-hit')
                    .attr('cx', plusX)
                    .attr('cy', lineY)
                    .attr('r', plusHitR)
                    .attr('fill', '#000000')
                    .attr('fill-opacity', 0.04)
                    .attr('stroke', 'none')
                    .attr('pointer-events', 'all')
                    .style('pointer-events', 'all')
                    .style('cursor', 'pointer')
                    .on('mousedown', (e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                    })
                    .on('click', onClick);
            };
            mkPlus(targetY, '#16a34a', () => this.addExtraTarget());
            mkPlus(entryY, '#2962FF', () => this.addExtraEntry());
            mkPlus(stopY, '#ef4444', () => this.addExtraStop());
        }

        return this.group;
    }

    /**
     * Primary entry line drag — parallel to how TP uses riskRewardSyncPrimaryTpDragFromTool + OM pull.
     */
    applyPrimaryEntryLineDragY(newY, context = {}) {
        const om = window.chart?.orderManager;
        if (om && typeof om.riskRewardSyncPrimaryEntryDragFromTool === 'function') {
            om.riskRewardSyncPrimaryEntryDragFromTool(this, newY);
            this._afterRiskRewardOrderManagerSync();
            return true;
        }
        const clamped = this.clampPrimaryEntryPrice(newY);
        if (!Number.isFinite(clamped) || Math.abs(clamped - this.points[0].y) < 1e-12) return true;
        this.points[0] = { ...this.points[0], y: clamped };
        this.ensureRiskSettings();
        this.recalculateLotSizeFromRisk();
        return true;
    }

    onPointHandleDrag(index, context = {}) {
        const { point } = context;
        if (!point) return false;

        if (index === 0) {
            return this.applyPrimaryEntryLineDragY(point.y, context);
        }

        if (index === 1) {
            this.setStopPrice(point.y);
            return true;
        }

        if (index === 2) {
            const om = window.chart?.orderManager;
            if (om && typeof om.riskRewardSyncPrimaryTpDragFromTool === 'function') {
                om.riskRewardSyncPrimaryTpDragFromTool(this, point.y);
                this._afterRiskRewardOrderManagerSync();
            } else {
                this.setTargetPrice(point.y);
            }
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
        if (handleRole === 'rr-primary-entry') {
            const py = context.point?.y ?? context.dataPoint?.y;
            if (Number.isFinite(py)) {
                return this.applyPrimaryEntryLineDragY(py, context);
            }
            return false;
        }

        if (handleRole === 'rr-be-line') {
            const py = context.point?.y ?? context.dataPoint?.y;
            const omBe = window.chart?.orderManager;
            if (omBe && typeof omBe.riskRewardSyncBEDragFromTool === 'function' && Number.isFinite(py)) {
                omBe.riskRewardSyncBEDragFromTool(this, py);
                this._afterRiskRewardOrderManagerSync();
                return true;
            }
            if (Number.isFinite(py)) {
                const y = this.sanitizeBreakevenTriggerPrice(py);
                if (!this.meta.rrBreakevenLine) {
                    this._ensureExtraLevelMeta();
                    this.meta.rrBreakevenLine = { id: this._nextExtraLevelId(), y };
                } else {
                    this.meta.rrBreakevenLine = { ...this.meta.rrBreakevenLine, y };
                }
                this.ensureRiskSettings();
                return true;
            }
            return false;
        }

        if (typeof handleRole === 'string' && handleRole.startsWith('rr-extra-')) {
            const m = handleRole.match(/^rr-extra-(target|entry|stop)-(\d+)$/);
            const py = context.point?.y ?? context.dataPoint?.y;
            if (m && Number.isFinite(py)) {
                const kind = m[1];
                const idx = parseInt(m[2], 10);
                const om = window.chart?.orderManager;
                if (kind === 'target' && om && typeof om.riskRewardSyncTpDragFromTool === 'function') {
                    om.riskRewardSyncTpDragFromTool(this, idx, py);
                    this._afterRiskRewardOrderManagerSync();
                } else if (kind === 'entry' && om && typeof om.riskRewardSyncEntryDragFromTool === 'function') {
                    om.riskRewardSyncEntryDragFromTool(this, idx, py);
                    this._afterRiskRewardOrderManagerSync();
                } else {
                    this._setExtraLevelY(kind, idx, py);
                    this.recalculateLotSizeFromRisk();
                }
                return true;
            }
            return false;
        }

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
        const entryLineHitRadius = 22;
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
                .attr('r', index === 0 ? entryLineHitRadius : hitRadius)
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

        group.selectAll('.rr-extra-handle-group').remove();
        const appendExtraHandle = (yy, role) => {
            const g = group.append('g')
                .attr('class', 'rr-extra-handle-group')
                .attr('data-handle-role', role);
            g.append('circle')
                .attr('class', 'rr-extra-handle-ring')
                .attr('cx', entryX)
                .attr('cy', yy)
                .attr('r', handleRadius)
                .attr('fill', 'transparent')
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('pointer-events', 'none')
                .style('opacity', this.selected ? 1 : 0);
            this.handles.push(g);
        };
        (this.meta.extraTargets || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            appendExtraHandle(scales.yScale(row.y), `rr-extra-target-${idx}`);
        });
        (this.meta.extraEntries || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            appendExtraHandle(scales.yScale(row.y), `rr-extra-entry-${idx}`);
        });
        (this.meta.extraStops || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            appendExtraHandle(scales.yScale(row.y), `rr-extra-stop-${idx}`);
        });
        if (this.meta.rrBreakevenLine && Number.isFinite(this.meta.rrBreakevenLine.y)) {
            appendExtraHandle(scales.yScale(this.meta.rrBreakevenLine.y), 'rr-be-line');
        }
    }

    createCornerHandles(scales, zoneX1, zoneX2, upperY, lowerY) {
        const handleRadius = 3;
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Width handle on the same Y as the zone boundary: avg entry when E2+, else E1.
        const hasLadder = (this.meta.extraEntries || []).length > 0;
        let cornerY = scales.yScale(this.points[0].y);
        if (hasLadder) {
            const wAvg = this._getWeightedAverageEntryPrice();
            if (Number.isFinite(wAvg)) cornerY = scales.yScale(wAvg);
        }
        
        const positions = [
            { role: 'corner-entry-right', x: zoneX2, y: cornerY, cursor: 'ew-resize' }
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
        instance.meta = { ...(instance.meta || {}), ...(data.meta || {}) };
        instance.meta.orientation = data.orientation || instance.meta.orientation;
        instance.meta.risk = {
            ...(instance.meta.risk || {}),
            ...(data.risk || {})
        };
        instance.chart = chart; // Set chart reference for multi-timeframe support
        instance._ensureExtraLevelMeta();
        instance.ensureRiskSettings();
        if (typeof instance.normalizeRiskRewardTargetLevels === 'function') {
            instance.normalizeRiskRewardTargetLevels();
            instance.ensureRiskSettings();
        }
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

    render(container, scales, isPreview = false) {
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
                    .attr('stroke-dasharray', this.style.strokeDasharray || null)
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
                .style('opacity', (this.selected || isPreview) ? 1 : 0);
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
                .style('cursor', 'move')
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

    render(container, scales, isPreview = false) {
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
                .attr('stroke-dasharray', this.style.strokeDasharray || null)
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
                        .attr('stroke-dasharray', this.style.strokeDasharray || null)
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
                .style('opacity', (this.selected || isPreview) ? 1 : 0);
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
