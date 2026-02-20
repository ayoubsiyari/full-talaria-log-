/**
 * Advanced Volume-Based Drawing Tools
 * Includes: Gann Box, Anchored VWAP, Fixed Range Volume Profile
 */

/**
 * Gann Box Tool
 * Creates a box with customizable price and time levels for Gann analysis
 */
class GannBoxTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('gann-box', points, style);
        this.requiredPoints = 2;

        this.style.strokeWidth = this.style.strokeWidth || 1;
        
        // Default price levels (0, 0.25, 0.5, 0.75, 1)
        this.style.priceLevels = this.style.priceLevels || [
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ];
        
        // Default time levels (0, 0.25, 0.382, 0.5, 0.618, 0.75, 1)
        this.style.timeLevels = this.style.timeLevels || [
            { value: 0, enabled: true, color: '#787b86' },
            { value: 0.25, enabled: true, color: '#787b86' },
            { value: 0.382, enabled: true, color: '#787b86' },
            { value: 0.5, enabled: true, color: '#787b86' },
            { value: 0.618, enabled: true, color: '#787b86' },
            { value: 0.75, enabled: true, color: '#787b86' },
            { value: 1, enabled: true, color: '#787b86' }
        ];
        
        this.style.showLeftLabels = this.style.showLeftLabels !== undefined ? this.style.showLeftLabels : true;
        this.style.showRightLabels = this.style.showRightLabels !== undefined ? this.style.showRightLabels : true;
        this.style.showTopLabels = this.style.showTopLabels !== undefined ? this.style.showTopLabels : true;
        this.style.showBottomLabels = this.style.showBottomLabels !== undefined ? this.style.showBottomLabels : true;
        this.style.priceBackground = this.style.priceBackground || 'rgba(41, 98, 255, 0.1)';
        this.style.timeBackground = this.style.timeBackground || 'rgba(41, 98, 255, 0.1)';
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        const scaleFactor = this.getZoomScaleFactor(scales);

        this.group = container.append('g')
            .attr('class', 'drawing gann-box')
            .attr('data-id', this.id);

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(this.points[0].x) : scales.xScale(this.points[0].x);
        const y1 = scales.yScale(this.points[0].y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(this.points[1].x) : scales.xScale(this.points[1].x);
        const y2 = scales.yScale(this.points[1].y);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const width = right - left;
        const height = bottom - top;

        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            this.createHandles(this.group, scales);
            return;
        }

        const strokeColor = this.style.stroke || '#787b86';
        const borderWidth = Math.max(0.5, (this.style.strokeWidth || 1) * scaleFactor);
        const levelsWidth = Math.max(0.5, (parseInt(this.style.levelsLineWidth) || (this.style.strokeWidth || 1)) * scaleFactor);
        const levelsDasharray = this.style.levelsLineDasharray || '';
        const labelSize = Math.max(9, 12 * scaleFactor);
        const labelOffset = Math.max(6, 10 * scaleFactor);

        const fmt = (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return '';
            return n.toFixed(3).replace(/\.?0+$/, '');
        };

        const withOpacity = (color, alpha) => {
            if (!color) return `rgba(120, 123, 134, ${alpha})`;
            const a = Math.max(0, Math.min(1, Number(alpha)));
            const c = String(color).trim();
            if (c.startsWith('rgba(')) {
                return c.replace(/rgba\(([^)]+)\)/, (m, inner) => {
                    const parts = inner.split(',').map(s => s.trim());
                    if (parts.length < 3) return m;
                    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
                });
            }
            if (c.startsWith('rgb(')) {
                return c.replace(/rgb\(([^)]+)\)/, (m, inner) => {
                    const parts = inner.split(',').map(s => s.trim());
                    if (parts.length < 3) return m;
                    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
                });
            }
            if (c[0] === '#') {
                const hex = c.slice(1);
                const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
                if (full.length === 6) {
                    const r = parseInt(full.slice(0, 2), 16);
                    const g = parseInt(full.slice(2, 4), 16);
                    const b = parseInt(full.slice(4, 6), 16);
                    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                        return `rgba(${r}, ${g}, ${b}, ${a})`;
                    }
                }
            }
            return c;
        };

        const sortedPrice = (this.style.priceLevels || []).slice().sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
        const sortedTime = (this.style.timeLevels || []).slice().sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

        const showZones = this.style.showZones || false;
        const zonesOpacity = (this.style.backgroundOpacity != null) ? this.style.backgroundOpacity : 0.12;

        if (showZones) {
            const enabledPrice = sortedPrice.filter(l => l && l.enabled !== false && Number.isFinite(Number(l.value)));
            if (enabledPrice.length >= 2) {
                for (let i = 0; i < enabledPrice.length - 1; i++) {
                    const a = Number(enabledPrice[i].value);
                    const b = Number(enabledPrice[i + 1].value);
                    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
                    const yA = top + (height * a);
                    const yB = top + (height * b);
                    const y = Math.min(yA, yB);
                    const h = Math.abs(yB - yA);
                    const base = enabledPrice[i].color || strokeColor;
                    const fill = withOpacity(base, zonesOpacity);
                    this.group.append('rect')
                        .attr('x', left)
                        .attr('y', y)
                        .attr('width', width)
                        .attr('height', h)
                        .attr('fill', fill)
                        .attr('stroke', 'none')
                        .style('pointer-events', 'none');
                }
            }
        }

        // Outer border
        this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', strokeColor)
            .attr('stroke-width', borderWidth)
            .attr('opacity', this.style.opacity || 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Hitbox (makes selecting the drawing much easier than targeting thin strokes)
        this.group.append('rect')
            .attr('class', 'shape-border-hit gann-box-hitbox')
            .attr('x', left)
            .attr('y', top)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, 18 * scaleFactor))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Price levels (horizontal grid + left/right labels)
        sortedPrice.forEach(level => {
            if (!level || level.enabled === false) return;
            const v = Number(level.value);
            if (!Number.isFinite(v)) return;

            const y = top + (height * v);
            const c = level.color || strokeColor;

            if (v !== 0 && v !== 1) {
                const hitW = Math.max(10, levelsWidth * 6);
                this.group.append('line')
                    .attr('class', 'gann-level-hit')
                    .attr('x1', left)
                    .attr('y1', y)
                    .attr('x2', right)
                    .attr('y2', y)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitW)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('line')
                    .attr('x1', left)
                    .attr('y1', y)
                    .attr('x2', right)
                    .attr('y2', y)
                    .attr('stroke', c)
                    .attr('stroke-width', levelsWidth)
                    .attr('stroke-dasharray', levelsDasharray)
                    .attr('opacity', this.style.opacity || 1)
                    .style('pointer-events', 'none');
            }

            if (this.style.showLeftLabels) {
                this.group.append('text')
                    .attr('x', left - labelOffset)
                    .attr('y', y)
                    .attr('text-anchor', 'end')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', c)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(fmt(v));
            }

            if (this.style.showRightLabels) {
                this.group.append('text')
                    .attr('x', right + labelOffset)
                    .attr('y', y)
                    .attr('text-anchor', 'start')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', c)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(fmt(v));
            }
        });

        // Time levels (vertical grid + top/bottom labels)
        sortedTime.forEach(level => {
            if (!level || level.enabled === false) return;
            const v = Number(level.value);
            if (!Number.isFinite(v)) return;

            const x = left + (width * v);
            const c = level.color || strokeColor;

            if (v !== 0 && v !== 1) {
                const hitW = Math.max(10, levelsWidth * 6);
                this.group.append('line')
                    .attr('class', 'gann-level-hit')
                    .attr('x1', x)
                    .attr('y1', top)
                    .attr('x2', x)
                    .attr('y2', bottom)
                    .attr('stroke', 'rgba(255,255,255,0.001)')
                    .attr('stroke-width', hitW)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', 1)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');

                this.group.append('line')
                    .attr('x1', x)
                    .attr('y1', top)
                    .attr('x2', x)
                    .attr('y2', bottom)
                    .attr('stroke', c)
                    .attr('stroke-width', levelsWidth)
                    .attr('stroke-dasharray', levelsDasharray)
                    .attr('opacity', this.style.opacity || 1)
                    .style('pointer-events', 'none');
            }

            if (this.style.showTopLabels) {
                this.group.append('text')
                    .attr('x', x)
                    .attr('y', top - labelOffset)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'ideographic')
                    .attr('fill', c)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(fmt(v));
            }

            if (this.style.showBottomLabels) {
                this.group.append('text')
                    .attr('x', x)
                    .attr('y', bottom + labelOffset + (labelSize * 0.25))
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'hanging')
                    .attr('fill', c)
                    .attr('opacity', 0.9)
                    .attr('font-size', `${labelSize}px`)
                    .style('pointer-events', 'none')
                    .text(fmt(v));
            }
        });

        this.createHandles(this.group, scales);
    }

    static fromJSON(data) {
        const tool = new GannBoxTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        return tool;
    }
}

/**
 * Anchored VWAP Tool
 * Volume-weighted average price anchored to a specific point
 */
class AnchoredVWAPTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('anchored-vwap', points, style);
        this.requiredPoints = 1;
        this._cache = {
            anchorIndex: null,
            dataVersion: null,
            lastEndIndex: null,
            vwapPoints: null,
            bands: null
        };
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing-anchored-vwap')
            .attr('data-id', this.id);

        const anchorX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(this.points[0].x) : scales.xScale(this.points[0].x);
        const anchorY = scales.yScale(this.points[0].y);

        // Determine data source
        let chartData = [];
        let dataVersion = null;
        if (scales.chart && scales.chart.data) {
            chartData = scales.chart.data;
            dataVersion = scales.chart.dataVersion || scales.chart.data?.length;
        } else if (window.chart && window.chart.data) {
            chartData = window.chart.data;
            dataVersion = window.chart.dataVersion || window.chart.data?.length;
        }
        
        const anchorIndex = Math.round(this.points[0].x);
        const chartWidth = scales.chart ? scales.chart.width : 1000;

        // If no data, draw a simple horizontal line from anchor point
        if (chartData.length === 0) {
            this.group.append('line')
                .attr('x1', anchorX)
                .attr('y1', anchorY)
                .attr('x2', chartWidth)
                .attr('y2', anchorY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 2.5)
                .attr('opacity', 0.9)
                .attr('stroke-dasharray', '5,5');
            
            this.group.append('text')
                .attr('x', anchorX + 10)
                .attr('y', anchorY - 10)
                .attr('fill', this.style.stroke)
                .attr('font-size', '11px')
                .text('VWAP (No Data)');

            this.createHandles(this.group, scales);
            return;
        }
        
        // Determine the visible range to limit calculations
        const startIndex = Math.max(0, anchorIndex);
        const endIndex = Math.min(chartData.length, (scales.chart && Number.isFinite(scales.chart.visibleEndIndex)) ? scales.chart.visibleEndIndex + 200 : chartData.length);

        let vwapPoints = null;
        let stdDev = 0;

        let cacheValid = this._cache.anchorIndex === anchorIndex &&
            this._cache.dataVersion === dataVersion &&
            this._cache.lastEndIndex === endIndex &&
            Array.isArray(this._cache.vwapPoints);

        if (cacheValid && this._cache.vwapPoints.length > 0 && typeof this._cache.vwapPoints[0].index !== 'number') {
            cacheValid = false;
        }

        if (cacheValid) {
            vwapPoints = this._cache.vwapPoints;
            stdDev = this._cache.bands?.stdDev || 0;
        } else {
            // Calculate VWAP from anchor point onwards
            let cumulativePV = 0;
            let cumulativeVolume = 0;
            vwapPoints = [];

            for (let i = startIndex; i < endIndex; i++) {
                const candle = chartData[i];
                if (!candle) continue;

                const open = candle.o ?? candle.open;
                const high = candle.h ?? candle.high;
                const low = candle.l ?? candle.low;
                const close = candle.c ?? candle.close;
                const volume = candle.v ?? candle.volume ?? 0;

                if (![open, high, low, close].every(Number.isFinite)) continue;
                if (!Number.isFinite(volume) || volume <= 0) continue;

                const typicalPrice = (high + low + close) / 3;

                cumulativePV += typicalPrice * volume;
                cumulativeVolume += volume;

                const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typicalPrice;
                vwapPoints.push({ index: i, vwap });
            }

            // Calculate standard deviation for bands
            if (vwapPoints.length > 1) {
                const vwapValues = vwapPoints.map(p => p.vwap);
                const mean = vwapValues[vwapValues.length - 1];
                const variance = vwapValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (vwapValues.length - 1);
                stdDev = Math.sqrt(Math.max(variance, 0));
            }

            // Cache results
            this._cache.anchorIndex = anchorIndex;
            this._cache.dataVersion = dataVersion;
            this._cache.lastEndIndex = endIndex;
            this._cache.vwapPoints = vwapPoints;
            this._cache.bands = { stdDev };
        }

        // Anchor point
        this.group.append('circle')
            .attr('cx', anchorX)
            .attr('cy', anchorY)
            .attr('r', 8)
            .attr('fill', this.style.stroke)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 2)
            .attr('opacity', this.style.opacity);

        const buildPoints = (transformFn = (value) => value) => {
            return vwapPoints.map(p => {
                const x = scales.chart && scales.chart.dataIndexToPixel ?
                    scales.chart.dataIndexToPixel(p.index) : scales.xScale(p.index);
                return {
                    x,
                    y: scales.yScale(transformFn(p.vwap))
                };
            });
        };

        // Draw VWAP line (make it more visible)
        if (vwapPoints.length > 0) {
            const line = d3.line()
                .x(d => d.x)
                .y(d => d.y);

            const mainPoints = buildPoints();
            this.group.append('path')
                .attr('d', line(mainPoints))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 2.5)
                .attr('fill', 'none')
                .attr('opacity', 0.9);
            
            // Upper band
            if (stdDev > 0) {
                const upperBand = buildPoints(value => value + stdDev);
                this.group.append('path')
                    .attr('d', line(upperBand))
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth * 0.5)
                    .attr('fill', 'none')
                    .attr('opacity', this.style.opacity * 0.4)
                    .attr('stroke-dasharray', '2,2');

                // Lower band
                const lowerBand = buildPoints(value => value - stdDev);
                this.group.append('path')
                    .attr('d', line(lowerBand))
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth * 0.5)
                    .attr('fill', 'none')
                    .attr('opacity', this.style.opacity * 0.4)
                    .attr('stroke-dasharray', '2,2');
            }
        }

        // Label
        this.group.append('text')
            .attr('x', anchorX + 10)
            .attr('y', anchorY - 10)
            .attr('fill', this.style.stroke)
            .attr('font-size', '11px')
            .attr('opacity', this.style.opacity)
            .text('VWAP');

        this.createHandles(this.group, scales);
    }

    static fromJSON(data) {
        const tool = new AnchoredVWAPTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        return tool;
    }
}

/**
 * Fixed Range Volume Profile Tool
 * Shows volume distribution across price levels in a fixed range
 */
class VolumeProfileTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('volume-profile', points, style);
        this.requiredPoints = 2;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing-volume-profile')
            .attr('data-id', this.id);

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(this.points[0].x) : scales.xScale(this.points[0].x);
        const y1 = scales.yScale(this.points[0].y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(this.points[1].x) : scales.xScale(this.points[1].x);
        const y2 = scales.yScale(this.points[1].y);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const height = bottom - top;
        const width = right - left;

        // Border box
        this.group.append('rect')
            .attr('x', left)
            .attr('y', top)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('opacity', this.style.opacity);

        // Get chart data for volume profile calculation
        const chartData = scales.chart && scales.chart.data ? scales.chart.data : [];
        const startIndex = Math.max(0, Math.round(Math.min(this.points[0].x, this.points[1].x)));
        const endIndex = Math.min(chartData.length - 1, Math.round(Math.max(this.points[0].x, this.points[1].x)));
        const priceHigh = Math.max(this.points[0].y, this.points[1].y);
        const priceLow = Math.min(this.points[0].y, this.points[1].y);

        if (!Number.isFinite(priceHigh) || !Number.isFinite(priceLow) || priceHigh === priceLow) {
            this.createHandles(this.group, scales);
            return;
        }
        
        // Create price bins (from bottom to top)
        const pixelHeight = Math.max(height, 1);
        const desiredBinSizePx = 12;
        let numBins = Math.round(pixelHeight / desiredBinSizePx);
        if (!Number.isFinite(numBins) || numBins < 6) numBins = 6;
        if (numBins > 80) numBins = 80;

        const priceRange = priceHigh - priceLow;
        const priceStep = priceRange / numBins;
        const volumeBins = new Array(numBins).fill(0);
        
        // Aggregate volume by price level
        for (let i = startIndex; i <= endIndex; i++) {
            const candle = chartData[i];
            if (!candle) continue;
            
            const volume = (candle.v ?? candle.volume ?? 0);
            if (!Number.isFinite(volume) || volume <= 0) continue;
            
            // Get candle's price range
            const open = candle.o ?? candle.open;
            const close = candle.c ?? candle.close;
            const low = candle.l ?? candle.low;
            const high = candle.h ?? candle.high;

            if (![open, close, low, high].every(Number.isFinite)) continue;

            const candleLow = Math.min(open, close, low);
            const candleHigh = Math.max(open, close, high);
            
            // Skip candles completely outside the selected price range
            if (candleHigh < priceLow || candleLow > priceHigh) continue;
            
            // Clamp candle range to selection range for proper volume distribution
            const effectiveLow = Math.max(candleLow, priceLow);
            const effectiveHigh = Math.min(candleHigh, priceHigh);
            
            // Calculate overlap ratio to proportionally distribute volume
            const candleRange = candleHigh - candleLow;
            const overlapRange = effectiveHigh - effectiveLow;
            const overlapRatio = candleRange > 0 ? overlapRange / candleRange : 1;
            const effectiveVolume = volume * overlapRatio;
            
            // Find which bins this candle's overlap touches
            const lowBin = Math.floor((effectiveLow - priceLow) / priceStep);
            const highBin = Math.min(numBins - 1, Math.floor((effectiveHigh - priceLow) / priceStep));
            
            // Distribute volume evenly across touched bins
            const binsSpanned = Math.max(1, highBin - lowBin + 1);
            const volumePerBin = effectiveVolume / binsSpanned;
            
            for (let b = Math.max(0, lowBin); b <= highBin; b++) {
                volumeBins[b] += volumePerBin;
            }
        }
        
        // Find max volume for scaling
        const maxVolume = Math.max(...volumeBins, 1);
        const barHeight = height / numBins;

        // Find POC (Point of Control - highest volume level)
        let pocIndex = 0;
        let maxVol = 0;
        volumeBins.forEach((vol, idx) => {
            if (vol > maxVol) {
                maxVol = vol;
                pocIndex = idx;
            }
        });
        
        // Draw volume bars (horizontal, from left to right)
        volumeBins.forEach((volume, i) => {
            if (volume === 0) return;

            const barWidth = (width * 0.6) * (volume / maxVolume);
            // Bars go from bottom to top (reverse index)
            const barY = bottom - ((i + 1) * barHeight);

            this.group.append('rect')
                .attr('x', right - barWidth)
                .attr('y', barY)
                .attr('width', barWidth)
                .attr('height', Math.max(1, barHeight - 1))
                .attr('fill', this.style.stroke)
                .attr('opacity', this.style.opacity * 0.6)
                .attr('rx', 1);
        });

        // POC line (Point of Control - highest volume)
        const pocY = bottom - ((pocIndex + 0.5) * barHeight);
        this.group.append('line')
            .attr('x1', left)
            .attr('y1', pocY)
            .attr('x2', right)
            .attr('y2', pocY)
            .attr('stroke', '#ff9800')
            .attr('stroke-width', 2)
            .attr('opacity', 0.8);

        // Label
        this.group.append('text')
            .attr('x', left + 5)
            .attr('y', top + 15)
            .attr('fill', this.style.stroke)
            .attr('font-size', '10px')
            .attr('opacity', this.style.opacity)
            .text('Volume Profile');

        this.createHandles(this.group, scales);
    }

    static fromJSON(data) {
        const tool = new VolumeProfileTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        return tool;
    }
}

/**
 * Anchored Volume Profile Tool
 * Shows volume distribution from anchor point to current/latest candle
 * Single-point tool that automatically extends to the right edge
 */
class AnchoredVolumeProfileTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('anchored-volume-profile', points, style);
        this.requiredPoints = 1;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing-anchored-volume-profile')
            .attr('data-id', this.id);

        const chartData = scales.chart && scales.chart.data ? scales.chart.data : [];
        if (chartData.length === 0) return;

        // Anchor point (start)
        const anchorIndex = Math.max(0, Math.round(this.points[0].x));
        const endIndex = chartData.length - 1;
        
        if (anchorIndex >= chartData.length) return;

        // Calculate price range from anchor to end
        let priceHigh = -Infinity;
        let priceLow = Infinity;
        
        for (let i = anchorIndex; i <= endIndex; i++) {
            const candle = chartData[i];
            if (!candle) continue;
            const high = candle.h ?? candle.high;
            const low = candle.l ?? candle.low;
            if (Number.isFinite(high)) priceHigh = Math.max(priceHigh, high);
            if (Number.isFinite(low)) priceLow = Math.min(priceLow, low);
        }

        if (!Number.isFinite(priceHigh) || !Number.isFinite(priceLow) || priceHigh === priceLow) {
            this.createHandles(this.group, scales);
            return;
        }

        // Calculate pixel positions
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(anchorIndex) : scales.xScale(anchorIndex);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(endIndex) : scales.xScale(endIndex);
        const y1 = scales.yScale(priceHigh);
        const y2 = scales.yScale(priceLow);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const height = bottom - top;
        const width = right - left;

        // Anchor line (vertical dashed line at anchor point)
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', top - 10)
            .attr('x2', x1)
            .attr('y2', bottom + 10)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,4')
            .attr('opacity', 0.7);

        // Create price bins
        const pixelHeight = Math.max(height, 1);
        const desiredBinSizePx = 12;
        let numBins = Math.round(pixelHeight / desiredBinSizePx);
        if (!Number.isFinite(numBins) || numBins < 6) numBins = 6;
        if (numBins > 80) numBins = 80;

        const priceRange = priceHigh - priceLow;
        const priceStep = priceRange / numBins;
        const volumeBins = new Array(numBins).fill(0);
        
        // Aggregate volume by price level
        for (let i = anchorIndex; i <= endIndex; i++) {
            const candle = chartData[i];
            if (!candle) continue;
            
            const volume = (candle.v ?? candle.volume ?? 0);
            if (!Number.isFinite(volume) || volume <= 0) continue;
            
            const open = candle.o ?? candle.open;
            const close = candle.c ?? candle.close;
            const low = candle.l ?? candle.low;
            const high = candle.h ?? candle.high;

            if (![open, close, low, high].every(Number.isFinite)) continue;

            const candleLow = Math.min(open, close, low);
            const candleHigh = Math.max(open, close, high);
            
            // Skip candles completely outside the price range
            if (candleHigh < priceLow || candleLow > priceHigh) continue;
            
            // Clamp to selection range
            const effectiveLow = Math.max(candleLow, priceLow);
            const effectiveHigh = Math.min(candleHigh, priceHigh);
            
            const candleRange = candleHigh - candleLow;
            const overlapRange = effectiveHigh - effectiveLow;
            const overlapRatio = candleRange > 0 ? overlapRange / candleRange : 1;
            const effectiveVolume = volume * overlapRatio;
            
            const lowBin = Math.floor((effectiveLow - priceLow) / priceStep);
            const highBin = Math.min(numBins - 1, Math.floor((effectiveHigh - priceLow) / priceStep));
            
            const binsSpanned = Math.max(1, highBin - lowBin + 1);
            const volumePerBin = effectiveVolume / binsSpanned;
            
            for (let b = Math.max(0, lowBin); b <= highBin; b++) {
                volumeBins[b] += volumePerBin;
            }
        }
        
        // Find max volume for scaling
        const maxVolume = Math.max(...volumeBins, 1);
        const barHeight = height / numBins;

        // Find POC
        let pocIndex = 0;
        let maxVol = 0;
        volumeBins.forEach((vol, idx) => {
            if (vol > maxVol) {
                maxVol = vol;
                pocIndex = idx;
            }
        });
        
        // Draw volume bars (from anchor point extending right)
        volumeBins.forEach((volume, i) => {
            if (volume === 0) return;

            const barWidth = (width * 0.4) * (volume / maxVolume);
            const barY = bottom - ((i + 1) * barHeight);

            this.group.append('rect')
                .attr('x', x1)
                .attr('y', barY)
                .attr('width', barWidth)
                .attr('height', Math.max(1, barHeight - 1))
                .attr('fill', this.style.stroke)
                .attr('opacity', this.style.opacity * 0.5)
                .attr('rx', 1);
        });

        // POC line
        const pocY = bottom - ((pocIndex + 0.5) * barHeight);
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', pocY)
            .attr('x2', right)
            .attr('y2', pocY)
            .attr('stroke', '#ff9800')
            .attr('stroke-width', 2)
            .attr('opacity', 0.8);

        // Label
        this.group.append('text')
            .attr('x', x1 + 5)
            .attr('y', top + 15)
            .attr('fill', this.style.stroke)
            .attr('font-size', '10px')
            .attr('opacity', this.style.opacity)
            .text('Anchored VP');

        // Anchor circle
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', scales.yScale(this.points[0].y))
            .attr('r', 4)
            .attr('fill', this.style.stroke)
            .attr('opacity', this.style.opacity);

        this.createHandles(this.group, scales);
    }

    static fromJSON(data) {
        const tool = new AnchoredVolumeProfileTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        return tool;
    }
}
