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
            source: null,
            vwapPoints: null,
            bands: null
        };

        const hasOwn = (prop) => Object.prototype.hasOwnProperty.call(style, prop);
        if (!hasOwn('source')) this.style.source = 'hlc3';
        if (!hasOwn('vwapBandsCalculationMode')) this.style.vwapBandsCalculationMode = 'standard_deviation';
        if (!hasOwn('vwapBand1Enabled')) this.style.vwapBand1Enabled = true;
        if (!hasOwn('vwapBand2Enabled')) this.style.vwapBand2Enabled = false;
        if (!hasOwn('vwapBand3Enabled')) this.style.vwapBand3Enabled = false;
        if (!Number.isFinite(Number(this.style.vwapBand1Multiplier))) this.style.vwapBand1Multiplier = 1;
        if (!Number.isFinite(Number(this.style.vwapBand2Multiplier))) this.style.vwapBand2Multiplier = 2;
        if (!Number.isFinite(Number(this.style.vwapBand3Multiplier))) this.style.vwapBand3Multiplier = 3;

        const bandStyleDefaults = [
            { color: '#4caf50', background: 'rgba(76, 175, 80, 0.10)' },
            { color: '#a59f00', background: 'rgba(165, 159, 0, 0.08)' },
            { color: '#00bfa5', background: 'rgba(0, 191, 165, 0.08)' }
        ];

        bandStyleDefaults.forEach((bandDefault, index) => {
            const bandNumber = index + 1;
            const upperEnabledProp = `vwapUpperBand${bandNumber}Enabled`;
            const lowerEnabledProp = `vwapLowerBand${bandNumber}Enabled`;
            const upperColorProp = `vwapUpperBand${bandNumber}Color`;
            const lowerColorProp = `vwapLowerBand${bandNumber}Color`;
            const upperTypeProp = `vwapUpperBand${bandNumber}Type`;
            const lowerTypeProp = `vwapLowerBand${bandNumber}Type`;
            const upperWidthProp = `vwapUpperBand${bandNumber}Width`;
            const lowerWidthProp = `vwapLowerBand${bandNumber}Width`;
            const legacyUpperTypeProp = `vwapUpperBand${bandNumber}LineType`;
            const legacyLowerTypeProp = `vwapLowerBand${bandNumber}LineType`;
            const legacyUpperWidthProp = `vwapUpperBand${bandNumber}LineWidth`;
            const legacyLowerWidthProp = `vwapLowerBand${bandNumber}LineWidth`;
            const backgroundEnabledProp = `vwapBand${bandNumber}BackgroundEnabled`;
            const backgroundColorProp = `vwapBand${bandNumber}BackgroundColor`;

            if (!hasOwn(upperEnabledProp)) this.style[upperEnabledProp] = true;
            if (!hasOwn(lowerEnabledProp)) this.style[lowerEnabledProp] = true;
            if (!hasOwn(upperColorProp)) this.style[upperColorProp] = bandDefault.color;
            if (!hasOwn(lowerColorProp)) this.style[lowerColorProp] = bandDefault.color;

            if (!hasOwn(upperTypeProp) && hasOwn(legacyUpperTypeProp)) this.style[upperTypeProp] = this.style[legacyUpperTypeProp];
            if (!hasOwn(lowerTypeProp) && hasOwn(legacyLowerTypeProp)) this.style[lowerTypeProp] = this.style[legacyLowerTypeProp];
            if (!hasOwn(upperWidthProp) && hasOwn(legacyUpperWidthProp)) this.style[upperWidthProp] = this.style[legacyUpperWidthProp];
            if (!hasOwn(lowerWidthProp) && hasOwn(legacyLowerWidthProp)) this.style[lowerWidthProp] = this.style[legacyLowerWidthProp];

            if (!hasOwn(upperTypeProp)) this.style[upperTypeProp] = '2,2';
            if (!hasOwn(lowerTypeProp)) this.style[lowerTypeProp] = '2,2';
            if (!Number.isFinite(Number(this.style[upperWidthProp]))) this.style[upperWidthProp] = 1;
            if (!Number.isFinite(Number(this.style[lowerWidthProp]))) this.style[lowerWidthProp] = 1;
            if (!hasOwn(backgroundEnabledProp)) this.style[backgroundEnabledProp] = false;
            if (!hasOwn(backgroundColorProp)) this.style[backgroundColorProp] = bandDefault.background;
        });
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing drawing-anchored-vwap')
            .attr('data-id', this.id);

        const anchorIndex = Math.round(this.points[0].x);
        const anchorX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(anchorIndex) : scales.xScale(anchorIndex);
        const fallbackAnchorY = scales.yScale(this.points[0].y);
        let anchorY = fallbackAnchorY;

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
        
        const chartWidth = scales.chart ? scales.chart.width : 1000;
        const normalizeSourceMode = (value) => {
            const mode = String(value || 'hlc3').toLowerCase();
            if (mode === 'close' || mode === 'open' || mode === 'high' || mode === 'low' || mode === 'hl2' || mode === 'ohlc4') {
                return mode;
            }
            return 'hlc3';
        };
        const sourceMode = normalizeSourceMode(this.style.source);

        const normalizeBandsCalcMode = (value) => {
            const mode = String(value || 'standard_deviation').toLowerCase();
            return mode === 'percentage' ? 'percentage' : 'standard_deviation';
        };
        const bandsCalculationMode = normalizeBandsCalcMode(this.style.vwapBandsCalculationMode);

        const normalizeBandLineType = (value) => {
            const raw = String(value == null ? '2,2' : value);
            const normalized = raw === '5,5' ? '10,6' : raw;
            return ['', '10,6', '2,2', '8,4,2,4'].includes(normalized)
                ? normalized
                : '2,2';
        };
        const normalizeBandLineWidth = (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return 1;
            return Math.max(1, Math.min(4, Math.round(parsed)));
        };

        [1, 2, 3].forEach((bandNumber) => {
            const upperEnabledProp = `vwapUpperBand${bandNumber}Enabled`;
            const lowerEnabledProp = `vwapLowerBand${bandNumber}Enabled`;
            const upperColorProp = `vwapUpperBand${bandNumber}Color`;
            const lowerColorProp = `vwapLowerBand${bandNumber}Color`;
            const upperTypeProp = `vwapUpperBand${bandNumber}Type`;
            const lowerTypeProp = `vwapLowerBand${bandNumber}Type`;
            const upperWidthProp = `vwapUpperBand${bandNumber}Width`;
            const lowerWidthProp = `vwapLowerBand${bandNumber}Width`;
            const legacyUpperTypeProp = `vwapUpperBand${bandNumber}LineType`;
            const legacyLowerTypeProp = `vwapLowerBand${bandNumber}LineType`;
            const legacyUpperWidthProp = `vwapUpperBand${bandNumber}LineWidth`;
            const legacyLowerWidthProp = `vwapLowerBand${bandNumber}LineWidth`;
            const backgroundEnabledProp = `vwapBand${bandNumber}BackgroundEnabled`;
            const backgroundColorProp = `vwapBand${bandNumber}BackgroundColor`;

            const upperTypeValue = this.style[upperTypeProp] ?? this.style[legacyUpperTypeProp];
            const lowerTypeValue = this.style[lowerTypeProp] ?? this.style[legacyLowerTypeProp];
            const upperWidthValue = this.style[upperWidthProp] ?? this.style[legacyUpperWidthProp];
            const lowerWidthValue = this.style[lowerWidthProp] ?? this.style[legacyLowerWidthProp];

            this.style[upperEnabledProp] = this.style[upperEnabledProp] !== false;
            this.style[lowerEnabledProp] = this.style[lowerEnabledProp] !== false;
            this.style[upperColorProp] = this.style[upperColorProp] || this.style.stroke;
            this.style[lowerColorProp] = this.style[lowerColorProp] || this.style.stroke;
            this.style[upperTypeProp] = normalizeBandLineType(upperTypeValue);
            this.style[lowerTypeProp] = normalizeBandLineType(lowerTypeValue);
            this.style[upperWidthProp] = normalizeBandLineWidth(upperWidthValue);
            this.style[lowerWidthProp] = normalizeBandLineWidth(lowerWidthValue);
            this.style[backgroundEnabledProp] = !!this.style[backgroundEnabledProp];
            if (!this.style[backgroundColorProp]) {
                this.style[backgroundColorProp] = 'rgba(76, 175, 80, 0.10)';
            }
        });

        // Keep style values normalized so UI/state persistence stay consistent.
        this.style.source = sourceMode;
        this.style.vwapBandsCalculationMode = bandsCalculationMode;

        // If no data, draw a simple horizontal line from anchor point
        if (chartData.length === 0) {
            this.group.append('line')
                .attr('class', 'anchored-vwap-curve')
                .attr('x1', anchorX)
                .attr('y1', anchorY)
                .attr('x2', chartWidth)
                .attr('y2', anchorY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 2.5)
                .attr('opacity', 0.9)
                .attr('stroke-dasharray', '5,5')
                .style('pointer-events', 'none');
            
            this.group.append('text')
                .attr('class', 'anchored-vwap-label')
                .attr('x', anchorX + 10)
                .attr('y', anchorY - 10)
                .attr('fill', this.style.stroke)
                .attr('font-size', '11px')
                .style('pointer-events', 'none')
                .text('VWAP (No Data)');
            return;
        }
        
        // Determine the visible range to limit calculations
        const startIndex = Math.max(0, anchorIndex);
        const endIndex = Math.min(chartData.length, (scales.chart && Number.isFinite(scales.chart.visibleEndIndex)) ? scales.chart.visibleEndIndex + 200 : chartData.length);

        let vwapPoints = null;
        let hasStdDev = false;

        let cacheValid = this._cache.anchorIndex === anchorIndex &&
            this._cache.dataVersion === dataVersion &&
            this._cache.lastEndIndex === endIndex &&
            this._cache.source === sourceMode &&
            Array.isArray(this._cache.vwapPoints);

        if (cacheValid && this._cache.vwapPoints.length > 0) {
            const firstCachedPoint = this._cache.vwapPoints[0];
            if (typeof firstCachedPoint.index !== 'number' || typeof firstCachedPoint.vwap !== 'number' || typeof firstCachedPoint.stdDev !== 'number') {
                cacheValid = false;
            }
        }

        if (cacheValid && this._cache.vwapPoints.length === 0) {
            cacheValid = false;
        }

        if (cacheValid) {
            vwapPoints = this._cache.vwapPoints;
            hasStdDev = !!this._cache.bands?.hasStdDev;
        } else {
            // Calculate cumulative VWAP from anchor point onwards:
            // VWAP_i = Σ(TP_j * V_j) / Σ(V_j), j = anchor..i
            let cumulativePV = 0;
            let cumulativeP2V = 0;
            let cumulativeVolume = 0;
            vwapPoints = [];

            const toFiniteNumber = (value) => {
                const n = Number(value);
                return Number.isFinite(n) ? n : NaN;
            };

            let lastVwap = null;
            let lastStdDev = 0;

            for (let i = startIndex; i < endIndex; i++) {
                const candle = chartData[i];
                if (!candle) continue;

                const open = toFiniteNumber(candle.o ?? candle.open);
                const high = toFiniteNumber(candle.h ?? candle.high);
                const low = toFiniteNumber(candle.l ?? candle.low);
                const close = toFiniteNumber(candle.c ?? candle.close);
                const volumeRaw = toFiniteNumber(candle.v ?? candle.volume);

                let sourceValue = NaN;
                if (sourceMode === 'close') {
                    sourceValue = close;
                } else if (sourceMode === 'open') {
                    sourceValue = open;
                } else if (sourceMode === 'high') {
                    sourceValue = high;
                } else if (sourceMode === 'low') {
                    sourceValue = low;
                } else if (sourceMode === 'hl2') {
                    sourceValue = (high + low) / 2;
                } else if (sourceMode === 'ohlc4') {
                    sourceValue = (open + high + low + close) / 4;
                } else {
                    sourceValue = (high + low + close) / 3;
                }

                if (!Number.isFinite(sourceValue)) continue;

                // Keep cumulative behavior mathematically correct even for missing/zero volume bars.
                // Those bars keep the previous cumulative VWAP value instead of creating gaps.
                const volume = Number.isFinite(volumeRaw) ? Math.max(volumeRaw, 0) : 0;

                if (volume > 0) {
                    cumulativePV += sourceValue * volume;
                    cumulativeP2V += sourceValue * sourceValue * volume;
                    cumulativeVolume += volume;
                }

                if (cumulativeVolume > 0) {
                    lastVwap = cumulativePV / cumulativeVolume;
                    const meanSquare = cumulativeP2V / cumulativeVolume;
                    const variance = Math.max(meanSquare - (lastVwap * lastVwap), 0);
                    lastStdDev = Math.sqrt(variance);
                } else if (!Number.isFinite(lastVwap)) {
                    lastVwap = sourceValue;
                }

                vwapPoints.push({ index: i, vwap: lastVwap, stdDev: lastStdDev });
            }

            hasStdDev = vwapPoints.some(p => Number.isFinite(p.stdDev) && p.stdDev > 0);

            // Cache results
            this._cache.anchorIndex = anchorIndex;
            this._cache.dataVersion = dataVersion;
            this._cache.lastEndIndex = endIndex;
            this._cache.source = sourceMode;
            this._cache.vwapPoints = vwapPoints;
            this._cache.bands = { hasStdDev };
        }

        // Keep the control point centered on the VWAP start point (TradingView-like anchor behavior).
        if (vwapPoints.length > 0 && Number.isFinite(vwapPoints[0].vwap)) {
            const vwapAnchorY = scales.yScale(vwapPoints[0].vwap);
            if (Number.isFinite(vwapAnchorY)) {
                anchorY = vwapAnchorY;
            }
        }

        // Show anchor-time guide while selected/moving.
        if (this.selected && scales.yScale && typeof scales.yScale.domain === 'function') {
            const yDomain = scales.yScale.domain();
            if (Array.isArray(yDomain) && yDomain.length >= 2) {
                const yLow = Math.min(yDomain[0], yDomain[yDomain.length - 1]);
                const yHigh = Math.max(yDomain[0], yDomain[yDomain.length - 1]);
                const topY = scales.yScale(yHigh);
                const bottomY = scales.yScale(yLow);

                if (Number.isFinite(topY) && Number.isFinite(bottomY)) {
                    this.group.append('line')
                        .attr('class', 'anchored-vwap-anchor-guide')
                        .attr('x1', anchorX)
                        .attr('y1', topY)
                        .attr('x2', anchorX)
                        .attr('y2', bottomY)
                        .attr('stroke', this.style.stroke)
                        .attr('stroke-width', 1)
                        .attr('stroke-dasharray', '3,3')
                        .attr('opacity', 0.5)
                        .style('pointer-events', 'none');
                }
            }
        }

        // Anchor point: align with standard resize-handle style.
        const anchorHandleRadius = 3;
        const anchorHitRadius = 12;
        const anchorHandleStroke = '#2962FF';
        const anchorHandleStrokeWidth = 2;

        this.group.append('circle')
            .attr('class', 'anchored-vwap-anchor-hit shape-border-hit')
            .attr('cx', anchorX)
            .attr('cy', anchorY)
            .attr('r', anchorHitRadius)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        const anchorHandle = this.group.append('circle')
            .attr('class', 'anchored-vwap-anchor')
            .attr('cx', anchorX)
            .attr('cy', anchorY)
            .attr('r', anchorHandleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', anchorHandleStroke)
            .attr('stroke-width', anchorHandleStrokeWidth)
            .attr('opacity', 1)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        anchorHandle
            .on('mouseenter', function() {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r', anchorHandleRadius + 1)
                    .attr('stroke-width', anchorHandleStrokeWidth + 0.5);
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r', anchorHandleRadius)
                    .attr('stroke-width', anchorHandleStrokeWidth);
            });

        const buildPoints = (transformFn = (point) => point.vwap) => {
            return vwapPoints.map(p => {
                const x = scales.chart && scales.chart.dataIndexToPixel ?
                    scales.chart.dataIndexToPixel(p.index) : scales.xScale(p.index);
                return {
                    x,
                    y: scales.yScale(transformFn(p))
                };
            });
        };

        // Draw VWAP line (make it more visible)
        if (vwapPoints.length > 0) {
            const line = d3.line()
                .x(d => d.x)
                .y(d => d.y);

            const mainPoints = buildPoints(point => point.vwap);
            this.group.append('path')
                .attr('class', 'anchored-vwap-curve')
                .attr('d', line(mainPoints))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 2.5)
                .attr('fill', 'none')
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');

            // TradingView-like guide points along the VWAP line.
            // Visible when selected, and revealed on hover via manager hover handlers.
            if (mainPoints.length > 1) {
                const markerSpacingPx = 95;
                const markerRadius = 3;
                const markerPoints = [];
                let lastMarkerX = Number.isFinite(anchorX)
                    ? anchorX
                    : (Number.isFinite(mainPoints[0]?.x) ? mainPoints[0].x : Number.NEGATIVE_INFINITY);

                for (let i = 1; i < mainPoints.length; i++) {
                    const point = mainPoints[i];
                    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

                    const isLastPoint = i === mainPoints.length - 1;
                    if ((point.x - lastMarkerX) >= markerSpacingPx || isLastPoint) {
                        markerPoints.push(point);
                        lastMarkerX = point.x;
                    }
                }

                this.group.append('g')
                    .attr('class', 'anchored-vwap-line-markers')
                    .attr('opacity', this.selected ? 1 : 0)
                    .selectAll('circle')
                    .data(markerPoints)
                    .enter()
                    .append('circle')
                    .attr('class', 'anchored-vwap-line-point')
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y)
                    .attr('r', markerRadius)
                    .attr('fill', 'none')
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', 1.1)
                    .attr('opacity', 0.95)
                    .style('pointer-events', 'none');
            }
            
            const bandConfigs = [
                {
                    bandNumber: 1,
                    enabled: this.style.vwapBand1Enabled !== false,
                    multiplier: Number(this.style.vwapBand1Multiplier),
                    fallback: 1,
                    upperEnabled: this.style.vwapUpperBand1Enabled !== false,
                    lowerEnabled: this.style.vwapLowerBand1Enabled !== false,
                    upperColor: this.style.vwapUpperBand1Color,
                    lowerColor: this.style.vwapLowerBand1Color,
                    upperLineType: this.style.vwapUpperBand1Type,
                    lowerLineType: this.style.vwapLowerBand1Type,
                    upperLineWidth: this.style.vwapUpperBand1Width,
                    lowerLineWidth: this.style.vwapLowerBand1Width,
                    backgroundEnabled: !!this.style.vwapBand1BackgroundEnabled,
                    backgroundColor: this.style.vwapBand1BackgroundColor
                },
                {
                    bandNumber: 2,
                    enabled: !!this.style.vwapBand2Enabled,
                    multiplier: Number(this.style.vwapBand2Multiplier),
                    fallback: 2,
                    upperEnabled: this.style.vwapUpperBand2Enabled !== false,
                    lowerEnabled: this.style.vwapLowerBand2Enabled !== false,
                    upperColor: this.style.vwapUpperBand2Color,
                    lowerColor: this.style.vwapLowerBand2Color,
                    upperLineType: this.style.vwapUpperBand2Type,
                    lowerLineType: this.style.vwapLowerBand2Type,
                    upperLineWidth: this.style.vwapUpperBand2Width,
                    lowerLineWidth: this.style.vwapLowerBand2Width,
                    backgroundEnabled: !!this.style.vwapBand2BackgroundEnabled,
                    backgroundColor: this.style.vwapBand2BackgroundColor
                },
                {
                    bandNumber: 3,
                    enabled: !!this.style.vwapBand3Enabled,
                    multiplier: Number(this.style.vwapBand3Multiplier),
                    fallback: 3,
                    upperEnabled: this.style.vwapUpperBand3Enabled !== false,
                    lowerEnabled: this.style.vwapLowerBand3Enabled !== false,
                    upperColor: this.style.vwapUpperBand3Color,
                    lowerColor: this.style.vwapLowerBand3Color,
                    upperLineType: this.style.vwapUpperBand3Type,
                    lowerLineType: this.style.vwapLowerBand3Type,
                    upperLineWidth: this.style.vwapUpperBand3Width,
                    lowerLineWidth: this.style.vwapLowerBand3Width,
                    backgroundEnabled: !!this.style.vwapBand3BackgroundEnabled,
                    backgroundColor: this.style.vwapBand3BackgroundColor
                }
            ];

            const getBandDistance = (point, multiplier) => {
                if (bandsCalculationMode === 'percentage') {
                    return Math.abs(point.vwap) * (multiplier / 100);
                }
                const stdDevAtPoint = Number(point.stdDev);
                return (Number.isFinite(stdDevAtPoint) ? stdDevAtPoint : 0) * multiplier;
            };

            const baseOpacityRaw = Number(this.style.opacity);
            const baseOpacity = Number.isFinite(baseOpacityRaw)
                ? Math.max(0, Math.min(1, baseOpacityRaw))
                : 1;
            bandConfigs.forEach((bandConfig, index) => {
                if (!bandConfig.enabled) return;

                const multiplier = Number.isFinite(bandConfig.multiplier)
                    ? bandConfig.multiplier
                    : bandConfig.fallback;
                if (!(multiplier > 0)) return;

                if (bandsCalculationMode === 'standard_deviation' && !hasStdDev) return;

                const upperBand = buildPoints(point => point.vwap + getBandDistance(point, multiplier));
                const lowerBand = buildPoints(point => point.vwap - getBandDistance(point, multiplier));
                const bandOpacity = Math.max(0.1, Math.min(1, baseOpacity * (0.42 - (index * 0.08))));

                if (bandConfig.backgroundEnabled && upperBand.length > 1 && lowerBand.length > 1 && upperBand.length === lowerBand.length) {
                    const areaData = upperBand.map((upperPoint, pointIndex) => {
                        const lowerPoint = lowerBand[pointIndex];
                        return {
                            x: upperPoint.x,
                            yUpper: upperPoint.y,
                            yLower: lowerPoint ? lowerPoint.y : upperPoint.y
                        };
                    });

                    const area = d3.area()
                        .x(d => d.x)
                        .y0(d => d.yUpper)
                        .y1(d => d.yLower);

                    this.group.append('path')
                        .attr('class', `anchored-vwap-band-fill anchored-vwap-band-fill-${bandConfig.bandNumber}`)
                        .attr('d', area(areaData))
                        .attr('fill', bandConfig.backgroundColor)
                        .attr('opacity', Math.max(0.08, Math.min(0.55, bandOpacity * 0.55)))
                        .style('pointer-events', 'none');
                }

                if (bandConfig.upperEnabled) {
                    this.group.append('path')
                        .attr('class', `anchored-vwap-curve anchored-vwap-band anchored-vwap-band-upper-${bandConfig.bandNumber}`)
                        .attr('d', line(upperBand))
                        .attr('stroke', bandConfig.upperColor)
                        .attr('stroke-width', bandConfig.upperLineWidth)
                        .attr('fill', 'none')
                        .attr('opacity', bandOpacity)
                        .attr('stroke-dasharray', bandConfig.upperLineType)
                        .style('pointer-events', 'none');
                }

                if (bandConfig.lowerEnabled) {
                    this.group.append('path')
                        .attr('class', `anchored-vwap-curve anchored-vwap-band anchored-vwap-band-lower-${bandConfig.bandNumber}`)
                        .attr('d', line(lowerBand))
                        .attr('stroke', bandConfig.lowerColor)
                        .attr('stroke-width', bandConfig.lowerLineWidth)
                        .attr('fill', 'none')
                        .attr('opacity', bandOpacity)
                        .attr('stroke-dasharray', bandConfig.lowerLineType)
                        .style('pointer-events', 'none');
                }
            });
        }

        this.group.selectAll('.anchored-vwap-anchor-hit, .anchored-vwap-anchor').raise();

        // Label
        this.group.append('text')
            .attr('class', 'anchored-vwap-label')
            .attr('x', anchorX + 10)
            .attr('y', anchorY - 10)
            .attr('fill', this.style.stroke)
            .attr('font-size', '11px')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .text('VWAP');
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

        const hasOwn = (prop) => Object.prototype.hasOwnProperty.call(style, prop);

        if (!hasOwn('stroke')) this.style.stroke = 'rgba(130, 164, 176, 0.45)';
        if (!hasOwn('strokeWidth')) this.style.strokeWidth = 1;
        if ((!hasOwn('fill') || style.fill === 'none' || style.fill === 'transparent') && style.showBackground !== false) {
            this.style.fill = 'rgba(14, 59, 70, 0.22)';
        }
        if (this.style.showBackground === undefined) this.style.showBackground = true;
        if (!Number.isFinite(Number(this.style.backgroundOpacity))) this.style.backgroundOpacity = 0.85;
        if (!hasOwn('buyColor')) this.style.buyColor = 'rgba(53, 186, 209, 0.82)';
        if (!hasOwn('sellColor')) this.style.sellColor = 'rgba(199, 71, 130, 0.82)';
        if (!hasOwn('valueAreaBuyColor')) this.style.valueAreaBuyColor = 'rgba(53, 186, 209, 1)';
        if (!hasOwn('valueAreaSellColor')) this.style.valueAreaSellColor = 'rgba(199, 71, 130, 1)';
        if (!hasOwn('pocColor')) this.style.pocColor = '#e6edf3';
        if (!Number.isFinite(Number(this.style.profileWidthRatio))) this.style.profileWidthRatio = 0.3;
        if (!hasOwn('profilePlacement')) this.style.profilePlacement = 'left';
        if (!hasOwn('rowsLayout')) this.style.rowsLayout = 'numberOfRows';
        if (!Number.isFinite(Number(this.style.rowSize))) this.style.rowSize = 24;
        if (!hasOwn('volumeDisplay')) this.style.volumeDisplay = 'upDown';
        if (!Number.isFinite(Number(this.style.valueAreaVolume))) this.style.valueAreaVolume = 70;
        if (this.style.extendRight === undefined) this.style.extendRight = false;
        if (this.style.showPOC === undefined) this.style.showPOC = true;
        if (this.style.showVAH === undefined) this.style.showVAH = true;
        if (this.style.showVAL === undefined) this.style.showVAL = true;
        if (this.style.showValues === undefined) this.style.showValues = true;
        if (!hasOwn('VAHColor')) this.style.VAHColor = '#089981';
        if (!hasOwn('VALColor')) this.style.VALColor = '#f23645';
        if (!hasOwn('valuesColor')) this.style.valuesColor = '#d1d4dc';
    }

    render(container, scales, isPreview = false) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing drawing-volume-profile')
            .attr('data-id', this.id);

        this._profileTopY = null;
        this._profileBottomY = null;

        if (this.points.length < 2) {
            if (isPreview) {
                const point = this.points[0] || {};
                const anchorIndex = Number.isFinite(point.x) ? Math.round(point.x) : 0;
                const anchorX = scales.chart && scales.chart.dataIndexToPixel
                    ? scales.chart.dataIndexToPixel(anchorIndex)
                    : scales.xScale(anchorIndex);

                const yDomain = scales.yScale && typeof scales.yScale.domain === 'function'
                    ? scales.yScale.domain()
                    : [0];
                const fallbackY = Array.isArray(yDomain) && yDomain.length > 0 ? yDomain[0] : 0;
                const anchorYValue = Number.isFinite(point.y) ? point.y : fallbackY;
                const anchorY = scales.yScale(anchorYValue);

                this.renderCornerPoint(this.group, anchorX, anchorY, 0.95);
            }
            return;
        }

        const chartData = scales.chart && Array.isArray(scales.chart.data) ? scales.chart.data : [];
        const hasChartData = chartData.length > 0;
        const rawIndex1 = Number.isFinite(this.points[0]?.x) ? Math.round(this.points[0].x) : 0;
        const rawIndex2 = Number.isFinite(this.points[1]?.x) ? Math.round(this.points[1].x) : 0;
        const maxDataIndex = hasChartData ? chartData.length - 1 : null;

        // Left anchor stays bound to available data. Right anchor can extend into future space.
        const clampedIndex1 = hasChartData
            ? Math.max(0, Math.min(maxDataIndex, rawIndex1))
            : Math.max(0, rawIndex1);
        const displayIndex2 = Math.max(0, rawIndex2);
        const dataIndex2 = hasChartData
            ? Math.max(0, Math.min(maxDataIndex, rawIndex2))
            : displayIndex2;

        this.points[0].x = clampedIndex1;
        this.points[1].x = displayIndex2;

        const fixedScreenRightX = Number(this.fixedScreenRightX);
        const hasFixedScreenRightX = Number.isFinite(fixedScreenRightX);

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(clampedIndex1) : scales.xScale(clampedIndex1);
        const x2 = hasFixedScreenRightX
            ? fixedScreenRightX
            : (scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(displayIndex2)
                : scales.xScale(displayIndex2));

        const pointY1 = Number.isFinite(this.points[0]?.y) ? scales.yScale(this.points[0].y) : NaN;
        const pointY2 = Number.isFinite(this.points[1]?.y) ? scales.yScale(this.points[1].y) : NaN;

        if (isPreview) {
            const previewStroke = this.style.stroke || 'rgba(130, 164, 176, 0.45)';
            const previewOpacityRaw = Number(this.style.opacity);
            const previewOpacity = Number.isFinite(previewOpacityRaw)
                ? Math.max(0, Math.min(1, previewOpacityRaw))
                : 0.95;

            const previewDomain = scales.yScale && typeof scales.yScale.domain === 'function'
                ? scales.yScale.domain()
                : [this.points[0]?.y, this.points[1]?.y];
            const previewDomainFirst = Array.isArray(previewDomain) && previewDomain.length > 0 ? previewDomain[0] : this.points[0]?.y;
            const previewDomainLast = Array.isArray(previewDomain) && previewDomain.length > 1 ? previewDomain[previewDomain.length - 1] : this.points[1]?.y;
            const previewDomainLow = Math.min(previewDomainFirst, previewDomainLast);
            const previewDomainHigh = Math.max(previewDomainFirst, previewDomainLast);
            const previewGuideTopY = Math.min(scales.yScale(previewDomainLow), scales.yScale(previewDomainHigh));
            const previewGuideBottomY = Math.max(scales.yScale(previewDomainLow), scales.yScale(previewDomainHigh));

            if (Number.isFinite(previewGuideTopY) && Number.isFinite(previewGuideBottomY)) {
                [x1, x2].forEach((guideX) => {
                    this.group.append('line')
                        .attr('class', 'vertical-guide volume-profile-guide')
                        .attr('x1', guideX)
                        .attr('y1', previewGuideTopY)
                        .attr('x2', guideX)
                        .attr('y2', previewGuideBottomY)
                        .attr('stroke', 'rgba(148, 160, 184, 0.62)')
                        .attr('stroke-width', 1)
                        .attr('opacity', 1)
                        .style('pointer-events', 'none');
                });
            }

            if (Number.isFinite(pointY1) && Number.isFinite(pointY2)) {
                this.group.append('line')
                    .attr('class', 'volume-profile-preview-line')
                    .attr('x1', x1)
                    .attr('y1', pointY1)
                    .attr('x2', x2)
                    .attr('y2', pointY2)
                    .attr('stroke', previewStroke)
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '')
                    .attr('opacity', Math.min(1, previewOpacity))
                    .style('pointer-events', 'none');

                this.renderCornerPoint(this.group, x1, pointY1, Math.min(1, previewOpacity));
                this.renderCornerPoint(this.group, x2, pointY2, Math.min(1, previewOpacity));
            }

            return;
        }

        const x2Data = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(dataIndex2)
            : scales.xScale(dataIndex2);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const width = Math.max(1, right - left);
        const effectiveProfileLeft = Math.min(x1, x2Data);
        const effectiveProfileRight = Math.max(x1, x2Data);
        const rawEffectiveProfileWidth = Math.max(0, effectiveProfileRight - effectiveProfileLeft);
        const effectiveProfileWidth = Math.max(1, rawEffectiveProfileWidth);

        const yDomain = scales.yScale.domain();
        const domainFirst = Array.isArray(yDomain) && yDomain.length > 0 ? yDomain[0] : this.points[0].y;
        const domainLast = Array.isArray(yDomain) && yDomain.length > 1 ? yDomain[yDomain.length - 1] : this.points[1].y;
        const domainLow = Math.min(domainFirst, domainLast);
        const domainHigh = Math.max(domainFirst, domainLast);
        const paneTop = Math.min(scales.yScale(domainLow), scales.yScale(domainHigh));
        const paneBottom = Math.max(scales.yScale(domainLow), scales.yScale(domainHigh));
        const paneHeight = Math.max(1, paneBottom - paneTop);

        // Get chart data for volume profile calculation
        const startIndex = Math.max(0, Math.min(clampedIndex1, dataIndex2));
        const endIndex = hasChartData ? Math.min(chartData.length - 1, Math.max(clampedIndex1, dataIndex2)) : Math.max(clampedIndex1, dataIndex2);
        if (chartData.length === 0 || startIndex > endIndex) {
            this.createHandles(this.group, scales);
            return;
        }

        let priceHigh = -Infinity;
        let priceLow = Infinity;
        for (let i = startIndex; i <= endIndex; i++) {
            const candle = chartData[i];
            if (!candle) continue;

            const high = candle.h ?? candle.high;
            const low = candle.l ?? candle.low;
            if (Number.isFinite(high)) priceHigh = Math.max(priceHigh, high);
            if (Number.isFinite(low)) priceLow = Math.min(priceLow, low);
        }

        if (!Number.isFinite(priceHigh) || !Number.isFinite(priceLow) || priceHigh <= priceLow) {
            priceHigh = domainHigh;
            priceLow = domainLow;
        }

        const top = Math.min(scales.yScale(priceHigh), scales.yScale(priceLow));
        const bottom = Math.max(scales.yScale(priceHigh), scales.yScale(priceLow));
        const height = bottom - top;
        if (!Number.isFinite(top) || !Number.isFinite(bottom) || height <= 0) {
            this.createHandles(this.group, scales);
            return;
        }

        this._profileTopY = top;
        this._profileBottomY = bottom;

        const opacityRaw = Number(this.style.opacity);
        const globalOpacity = Number.isFinite(opacityRaw)
            ? Math.max(0, Math.min(1, opacityRaw))
            : 1;
        const boundaryStroke = this.style.stroke || 'rgba(130, 164, 176, 0.45)';
        const boundaryWidth = Math.max(0.5, Number(this.style.strokeWidth) || 1);
        const showBackground = this.style.showBackground !== false;
        const backgroundFill = showBackground
            ? (this.style.fill || 'rgba(14, 59, 70, 0.22)')
            : 'transparent';
        const backgroundOpacityRaw = Number(this.style.backgroundOpacity);
        const backgroundOpacity = Number.isFinite(backgroundOpacityRaw)
            ? Math.max(0, Math.min(1, backgroundOpacityRaw))
            : 0.85;
        const shouldRenderProfileBody = !isPreview && this._isActiveResizing !== true;

        // Visual profile background.
        if (shouldRenderProfileBody) {
            this.group.append('rect')
                .attr('class', 'volume-profile-range')
                .attr('x', left)
                .attr('y', top)
                .attr('width', width)
                .attr('height', Math.max(1, height))
                .attr('fill', backgroundFill)
                .attr('opacity', Math.min(1, globalOpacity * backgroundOpacity))
                .attr('stroke', 'none')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
        }

        const boundaryHitWidth = Math.max(14, boundaryWidth + 10);
        [
            { x: x1, pointIndex: 0 },
            { x: x2, pointIndex: 1 }
        ].forEach(({ x, pointIndex }) => {
            this.group.append('line')
                .attr('class', 'volume-profile-boundary-hit shape-border-hit resize-handle-hit')
                .attr('x1', x)
                .attr('y1', top)
                .attr('x2', x)
                .attr('y2', bottom)
                .attr('stroke', 'transparent')
                .attr('stroke-width', boundaryHitWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'ew-resize')
                .attr('data-point-index', pointIndex);
        });

        this.group.append('line')
            .attr('class', 'volume-profile-boundary')
            .attr('x1', left)
            .attr('y1', top)
            .attr('x2', left)
            .attr('y2', bottom)
            .attr('stroke', boundaryStroke)
            .attr('stroke-width', boundaryWidth)
            .attr('opacity', Math.min(1, globalOpacity * 0.95))
            .style('pointer-events', 'none');

        this.group.append('line')
            .attr('class', 'volume-profile-boundary')
            .attr('x1', right)
            .attr('y1', top)
            .attr('x2', right)
            .attr('y2', bottom)
            .attr('stroke', boundaryStroke)
            .attr('stroke-width', boundaryWidth)
            .attr('opacity', Math.min(1, globalOpacity * 0.95))
            .style('pointer-events', 'none');

        if (isPreview) {
            this.renderCornerPoint(this.group, left, top, Math.min(1, globalOpacity * 0.95));
            this.renderCornerPoint(this.group, right, bottom, Math.min(1, globalOpacity * 0.95));
        }

        if (!shouldRenderProfileBody) {
            this.createHandles(this.group, scales);
            return;
        }

        if (!Number.isFinite(priceHigh) || !Number.isFinite(priceLow) || priceHigh === priceLow || height <= 0) {
            this.createHandles(this.group, scales);
            return;
        }
        
        const priceRange = priceHigh - priceLow;
        if (!Number.isFinite(priceRange) || priceRange <= 0) {
            this.createHandles(this.group, scales);
            return;
        }

        // Create price bins (from bottom to top)
        const rowsLayout = String(this.style.rowsLayout || 'numberOfRows').toLowerCase() === 'ticksperrow'
            ? 'ticksPerRow'
            : 'numberOfRows';
        const rowSizeRaw = Number(this.style.rowSize);
        const rowSize = Number.isFinite(rowSizeRaw) ? rowSizeRaw : 24;

        const resolveTickSize = () => {
            const chart = scales && scales.chart ? scales.chart : null;
            const marketPipSize = Number(chart && chart.orderManager ? chart.orderManager.pipSize : NaN);
            if (Number.isFinite(marketPipSize) && marketPipSize > 0) return marketPipSize;

            const savedPipSize = Number(chart ? chart.pipSize : NaN);
            if (Number.isFinite(savedPipSize) && savedPipSize > 0) return savedPipSize;

            const chartTickSize = Number(chart && chart.priceScale ? chart.priceScale.tickSize : NaN);
            if (Number.isFinite(chartTickSize) && chartTickSize > 0) return chartTickSize;

            const decimals = Number(chart ? chart.priceDecimals : NaN);
            if (Number.isFinite(decimals) && decimals >= 0) {
                return Math.pow(10, -Math.min(10, decimals));
            }

            return priceRange / 24;
        };

        let numBins;
        if (rowsLayout === 'ticksPerRow') {
            const tickSize = resolveTickSize();
            const ticksPerRow = Math.max(1, Math.min(10000, Math.round(rowSize)));
            const rowPriceSize = tickSize * ticksPerRow;
            numBins = Number.isFinite(rowPriceSize) && rowPriceSize > 0
                ? Math.round(priceRange / rowPriceSize)
                : 24;
        } else {
            numBins = Math.round(rowSize);
        }

        if (!Number.isFinite(numBins) || numBins < 6) numBins = 6;
        if (numBins > 400) numBins = 400;

        const priceStep = priceRange / numBins;
        if (!Number.isFinite(priceStep) || priceStep <= 0) {
            this.createHandles(this.group, scales);
            return;
        }

        const buyVolumeBins = new Array(numBins).fill(0);
        const sellVolumeBins = new Array(numBins).fill(0);
        
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

            // Approximate aggressor split using close location inside candle range.
            let buyWeight = 0.5;
            const highLowRange = high - low;
            if (Number.isFinite(highLowRange) && highLowRange > 0) {
                buyWeight = (close - low) / highLowRange;
            } else if (close > open) {
                buyWeight = 0.65;
            } else if (close < open) {
                buyWeight = 0.35;
            }
            buyWeight = Math.max(0.1, Math.min(0.9, buyWeight));
            const sellWeight = 1 - buyWeight;
            
            // Find which bins this candle's overlap touches
            const lowBin = Math.floor((effectiveLow - priceLow) / priceStep);
            const highBin = Math.floor((effectiveHigh - priceLow) / priceStep);
            const clampedLowBin = Math.max(0, lowBin);
            const clampedHighBin = Math.min(numBins - 1, highBin);
            if (clampedLowBin > clampedHighBin) continue;
            
            // Distribute volume evenly across touched bins
            const binsSpanned = Math.max(1, clampedHighBin - clampedLowBin + 1);
            const buyPerBin = (effectiveVolume * buyWeight) / binsSpanned;
            const sellPerBin = (effectiveVolume * sellWeight) / binsSpanned;
            
            for (let b = clampedLowBin; b <= clampedHighBin; b++) {
                buyVolumeBins[b] += buyPerBin;
                sellVolumeBins[b] += sellPerBin;
            }
        }
        
        const totalVolumeBins = buyVolumeBins.map((buyVol, idx) => buyVol + sellVolumeBins[idx]);

        // Find max volume for scaling
        const maxVolume = Math.max(...totalVolumeBins, 0);
        const barHeight = height / numBins;
        if (!Number.isFinite(maxVolume) || maxVolume <= 0) {
            this.createHandles(this.group, scales);
            return;
        }

        // Find POC (Point of Control - highest volume level)
        let pocIndex = 0;
        let maxVol = 0;
        totalVolumeBins.forEach((vol, idx) => {
            if (vol > maxVol) {
                maxVol = vol;
                pocIndex = idx;
            }
        });

        const valueAreaPercentRaw = Number(this.style.valueAreaVolume);
        const valueAreaPercent = Number.isFinite(valueAreaPercentRaw)
            ? Math.max(1, Math.min(100, valueAreaPercentRaw))
            : 70;

        // Approximate TradingView value area centered around POC.
        let valueAreaLow = pocIndex;
        let valueAreaHigh = pocIndex;
        const totalProfileVolume = totalVolumeBins.reduce((sum, vol) => sum + vol, 0);
        if (totalProfileVolume > 0) {
            const targetValueAreaVolume = totalProfileVolume * (valueAreaPercent / 100);
            let accumulatedVolume = totalVolumeBins[pocIndex] || 0;

            while (accumulatedVolume < targetValueAreaVolume && (valueAreaLow > 0 || valueAreaHigh < numBins - 1)) {
                const nextLowVolume = valueAreaLow > 0 ? totalVolumeBins[valueAreaLow - 1] : -1;
                const nextHighVolume = valueAreaHigh < numBins - 1 ? totalVolumeBins[valueAreaHigh + 1] : -1;

                if (nextHighVolume > nextLowVolume && valueAreaHigh < numBins - 1) {
                    valueAreaHigh += 1;
                    accumulatedVolume += Math.max(0, nextHighVolume);
                } else if (valueAreaLow > 0) {
                    valueAreaLow -= 1;
                    accumulatedVolume += Math.max(0, nextLowVolume);
                } else if (valueAreaHigh < numBins - 1) {
                    valueAreaHigh += 1;
                    accumulatedVolume += Math.max(0, nextHighVolume);
                } else {
                    break;
                }
            }
        }
        
        const profileWidthRatio = Math.max(0.15, Math.min(0.65, Number(this.style.profileWidthRatio) || 0.3));
        // Keep profile bar widths frozen once right boundary passes last loaded candle.
        const maxProfileWidth = Math.max(12, effectiveProfileWidth * profileWidthRatio);
        const profilePlacement = String(this.style.profilePlacement || 'left').toLowerCase() === 'right' ? 'right' : 'left';
        const buyColor = this.style.buyColor || 'rgba(53, 186, 209, 0.82)';
        const sellColor = this.style.sellColor || 'rgba(199, 71, 130, 0.82)';
        const valueAreaBuyColor = this.style.valueAreaBuyColor || 'rgba(53, 186, 209, 1)';
        const valueAreaSellColor = this.style.valueAreaSellColor || 'rgba(199, 71, 130, 1)';
        const valuesColor = this.style.valuesColor || '#d1d4dc';
        const showValues = this.style.showValues !== false;
        const volumeDisplay = String(this.style.volumeDisplay || 'upDown').toLowerCase() === 'total' ? 'total' : 'upDown';
        const extendRightLevels = this.style.extendRight === true;
        const xScaleRange = scales.xScale && typeof scales.xScale.range === 'function' ? scales.xScale.range() : [left, right];
        const chartLeftEdge = Array.isArray(xScaleRange) && xScaleRange.length > 0 ? Math.min(...xScaleRange) : left;
        const chartRightEdge = Array.isArray(xScaleRange) && xScaleRange.length > 0 ? Math.max(...xScaleRange) : right;
        const profileLineEndX = extendRightLevels ? Math.max(right, chartRightEdge) : effectiveProfileRight;
        const fixedProfileSide = String(this.fixedProfileSide || '').toLowerCase();
        const hasFixedProfileSide = fixedProfileSide === 'left' || fixedProfileSide === 'right';
        const levelLineStartX = hasFixedProfileSide ? chartLeftEdge : left;
        const levelLineEndX = hasFixedProfileSide ? chartRightEdge : profileLineEndX;

        const formatVolumeValue = (value) => {
            const num = Number(value);
            if (!Number.isFinite(num) || num <= 0) return '0';
            const abs = Math.abs(num);
            if (abs >= 1e9) return `${(num / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
            if (abs >= 1e6) return `${(num / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
            if (abs >= 1e3) return `${(num / 1e3).toFixed(2).replace(/\.?0+$/, '')}K`;
            return `${Math.round(num)}`;
        };

        // Draw stacked buy/sell bars from the left side (TradingView-like fixed-range profile look).
        totalVolumeBins.forEach((totalVolume, i) => {
            if (!Number.isFinite(totalVolume) || totalVolume <= 0) return;

            const buyVolume = buyVolumeBins[i] || 0;
            const sellVolume = sellVolumeBins[i] || 0;
            const totalWidth = maxProfileWidth * (totalVolume / maxVolume);
            if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;

            const buyRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;
            const buyWidth = totalWidth * Math.max(0, Math.min(1, buyRatio));
            const sellWidth = Math.max(0, totalWidth - buyWidth);

            // Bars go from bottom to top (reverse index)
            const barY = bottom - ((i + 1) * barHeight);
            const barHeightPx = Math.max(1, barHeight - 1);
            const isInsideValueArea = i >= valueAreaLow && i <= valueAreaHigh;
            const barOpacity = globalOpacity * (isInsideValueArea ? 1 : 0.66);
            const currentBuyColor = isInsideValueArea ? valueAreaBuyColor : buyColor;
            const currentSellColor = isInsideValueArea ? valueAreaSellColor : sellColor;
            let rowLeft;
            if (fixedProfileSide === 'left') {
                rowLeft = chartLeftEdge;
            } else if (fixedProfileSide === 'right') {
                rowLeft = chartRightEdge - totalWidth;
            } else {
                rowLeft = profilePlacement === 'right' ? effectiveProfileRight - totalWidth : effectiveProfileLeft;
            }

            if (volumeDisplay === 'total') {
                if (totalWidth > 0.25) {
                    this.group.append('rect')
                        .attr('x', rowLeft)
                        .attr('y', barY)
                        .attr('width', totalWidth)
                        .attr('height', barHeightPx)
                        .attr('fill', currentBuyColor)
                        .attr('opacity', barOpacity)
                        .style('pointer-events', 'none');
                }
            } else {
                if (buyWidth > 0.25) {
                    this.group.append('rect')
                        .attr('x', rowLeft)
                        .attr('y', barY)
                        .attr('width', buyWidth)
                        .attr('height', barHeightPx)
                        .attr('fill', currentBuyColor)
                        .attr('opacity', barOpacity)
                        .style('pointer-events', 'none');
                }

                if (sellWidth > 0.25) {
                    this.group.append('rect')
                        .attr('x', rowLeft + buyWidth)
                        .attr('y', barY)
                        .attr('width', sellWidth)
                        .attr('height', barHeightPx)
                        .attr('fill', currentSellColor)
                        .attr('opacity', barOpacity)
                        .style('pointer-events', 'none');
                }
            }

            if (showValues && barHeightPx >= 9) {
                const labelText = volumeDisplay === 'total'
                    ? `${formatVolumeValue(totalVolume)}`
                    : `${formatVolumeValue(buyVolume)}x${formatVolumeValue(sellVolume)}`;
                const labelFontSize = Math.max(9, Math.min(24, barHeightPx * 0.8));
                const labelX = fixedProfileSide === 'left'
                    ? chartLeftEdge + 3
                    : (fixedProfileSide === 'right' ? chartRightEdge - 3 : (profilePlacement === 'right' ? effectiveProfileRight - 3 : effectiveProfileLeft + 3));
                const labelAnchor = fixedProfileSide === 'right'
                    ? 'end'
                    : (profilePlacement === 'right' ? 'end' : 'start');
                this.group.append('text')
                    .attr('class', 'volume-profile-values-label')
                    .attr('x', labelX)
                    .attr('y', barY + (barHeightPx / 2))
                    .attr('dy', '0.32em')
                    .attr('text-anchor', labelAnchor)
                    .attr('fill', valuesColor)
                    .attr('font-size', labelFontSize)
                    .attr('opacity', Math.min(1, globalOpacity * 0.95))
                    .style('pointer-events', 'none')
                    .text(labelText);
            }
        });

        if (this.style.showPOC !== false) {
            const pocY = bottom - ((pocIndex + 0.5) * barHeight);
            this.group.append('line')
                .attr('class', 'volume-profile-level-line volume-profile-poc-line')
                .attr('x1', levelLineStartX)
                .attr('y1', pocY)
                .attr('x2', levelLineEndX)
                .attr('y2', pocY)
                .attr('stroke', this.style.pocColor || '#e6edf3')
                .attr('stroke-width', 1.35)
                .attr('opacity', Math.min(1, globalOpacity * 0.95))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        if (this.style.showVAH !== false) {
            const vahY = bottom - ((valueAreaHigh + 0.5) * barHeight);
            if (Number.isFinite(vahY)) {
                this.group.append('line')
                    .attr('class', 'volume-profile-level-line volume-profile-vah-line')
                    .attr('x1', levelLineStartX)
                    .attr('y1', vahY)
                    .attr('x2', levelLineEndX)
                    .attr('y2', vahY)
                    .attr('stroke', this.style.VAHColor || '#089981')
                    .attr('stroke-width', 1.2)
                    .attr('opacity', Math.min(1, globalOpacity * 0.9))
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }
        }

        if (this.style.showVAL !== false) {
            const valY = bottom - ((valueAreaLow + 0.5) * barHeight);
            if (Number.isFinite(valY)) {
                this.group.append('line')
                    .attr('class', 'volume-profile-level-line volume-profile-val-line')
                    .attr('x1', levelLineStartX)
                    .attr('y1', valY)
                    .attr('x2', levelLineEndX)
                    .attr('y2', valY)
                    .attr('stroke', this.style.VALColor || '#f23645')
                    .attr('stroke-width', 1.2)
                    .attr('opacity', Math.min(1, globalOpacity * 0.9))
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }
        }

        this.createHandles(this.group, scales);
    }

    renderCornerPoint(group, x, y, opacity = 1) {
        if (!group || !Number.isFinite(x) || !Number.isFinite(y)) return;

        const markerOpacity = Math.max(0, Math.min(1, opacity));

        group.append('circle')
            .attr('class', 'volume-profile-corner-point')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 4)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', 2)
            .attr('opacity', markerOpacity)
            .style('pointer-events', 'none');
    }

    createHandles(group, scales) {
        this.handles = [];

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit:not(.volume-profile-boundary-hit)').remove();
        group.selectAll('.vertical-guide').remove();

        if (!this.selected || this.points.length < 2) return;

        const chartData = scales.chart && Array.isArray(scales.chart.data) ? scales.chart.data : [];
        const maxIndex = chartData.length > 0 ? chartData.length - 1 : null;

        const yDomain = scales.yScale.domain();
        const domainFirst = Array.isArray(yDomain) && yDomain.length > 0 ? yDomain[0] : 0;
        const domainLast = Array.isArray(yDomain) && yDomain.length > 1 ? yDomain[yDomain.length - 1] : 0;
        const domainLow = Math.min(domainFirst, domainLast);
        const domainHigh = Math.max(domainFirst, domainLast);
        const fallbackTopY = Math.min(scales.yScale(domainLow), scales.yScale(domainHigh));
        const fallbackBottomY = Math.max(scales.yScale(domainLow), scales.yScale(domainHigh));
        const guideTopY = fallbackTopY;
        const guideBottomY = fallbackBottomY;
        const topY = Number.isFinite(this._profileTopY) ? this._profileTopY : fallbackTopY;
        const bottomY = Number.isFinite(this._profileBottomY) ? this._profileBottomY : fallbackBottomY;
        const middleY = topY + ((bottomY - topY) / 2);

        const handleRadius = 4;
        const hitRadius = 14;

        const pointPositions = this.points.map((point, index) => {
            let xIndex = Number.isFinite(point.x) ? Math.round(point.x) : 0;
            if (maxIndex !== null) {
                if (index === 1) {
                    // Right VP boundary can live beyond last loaded candle (future space).
                    xIndex = Math.max(0, xIndex);
                } else {
                    xIndex = Math.max(0, Math.min(maxIndex, xIndex));
                }
            }

            const cx = scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(xIndex)
                : scales.xScale(xIndex);

            const pointY = Number.isFinite(point.y) ? scales.yScale(point.y) : NaN;

            return { point, index, cx, pointY };
        });

        const sortedByX = [...pointPositions].sort((a, b) => {
            if (a.cx === b.cx) return a.index - b.index;
            return a.cx - b.cx;
        });
        const topCornerIndex = sortedByX.length > 0 ? sortedByX[0].index : null;
        const bottomCornerIndex = sortedByX.length > 0 ? sortedByX[sortedByX.length - 1].index : null;

        const showGuides = this._isActiveResizing === true;
        const activeResizePointIndex = Number.isFinite(this._activeResizingPointIndex)
            ? this._activeResizingPointIndex
            : null;

        const resolveHandleY = ({ index, pointY }) => {
            const cornerY = index === topCornerIndex
                ? topY
                : (index === bottomCornerIndex ? bottomY : middleY);

            if (showGuides && activeResizePointIndex === index && Number.isFinite(pointY)) {
                return pointY;
            }

            return cornerY;
        };

        if (showGuides && sortedByX.length > 1) {
            const leftGuide = sortedByX[0];
            const rightGuide = sortedByX[sortedByX.length - 1];
            const guideLinkStroke = this.style.stroke || 'rgba(130, 164, 176, 0.75)';
            const leftGuideY = resolveHandleY(leftGuide);
            const rightGuideY = resolveHandleY(rightGuide);

            group.append('line')
                .attr('class', 'volume-profile-guide-link')
                .attr('x1', leftGuide.cx)
                .attr('y1', leftGuideY)
                .attr('x2', rightGuide.cx)
                .attr('y2', rightGuideY)
                .attr('stroke', guideLinkStroke)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '')
                .attr('opacity', 1)
                .style('pointer-events', 'none');
        }

        pointPositions.forEach(({ point, index, cx, pointY }) => {
            const handleY = resolveHandleY({ index, pointY });

            if (showGuides) {
                group.append('line')
                    .attr('class', 'vertical-guide volume-profile-guide')
                    .attr('x1', cx)
                    .attr('y1', guideTopY)
                    .attr('x2', cx)
                    .attr('y2', guideBottomY)
                    .attr('stroke', 'rgba(148, 160, 184, 0.62)')
                    .attr('stroke-width', 1)
                    .attr('opacity', 1)
                    .style('pointer-events', 'none');
            }

            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);

            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', cx)
                .attr('cy', handleY)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'ew-resize')
                .style('pointer-events', 'all')
                .attr('data-point-index', index);

            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', handleY)
                .attr('r', handleRadius)
                .attr('fill', 'transparent')
                .attr('stroke', '#2962FF')
                .attr('stroke-width', 2)
                .style('cursor', 'ew-resize')
                .style('pointer-events', 'all')
                .attr('data-point-index', index);

            this.handles.push({ element: handle, point, index });
        });
    }

    onPointHandleDrag(index, context = {}) {
        if (!Array.isArray(this.points) || !this.points[index] || !context.point) {
            return false;
        }

        const nextPoint = {
            ...this.points[index],
            x: context.point.x
        };

        if (Number.isFinite(context.point.y)) {
            nextPoint.y = context.point.y;
        }

        this.points[index] = nextPoint;
        this.meta.updatedAt = Date.now();
        return true;
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

        const hasOwn = (prop) => Object.prototype.hasOwnProperty.call(style, prop);

        if (!hasOwn('stroke')) this.style.stroke = 'rgba(130, 164, 176, 0.45)';
        if (!hasOwn('strokeWidth')) this.style.strokeWidth = 1;
        if ((!hasOwn('fill') || style.fill === 'none' || style.fill === 'transparent') && style.showBackground !== false) {
            this.style.fill = 'rgba(14, 59, 70, 0.22)';
        }
        if (this.style.showBackground === undefined) this.style.showBackground = true;
        if (!Number.isFinite(Number(this.style.backgroundOpacity))) this.style.backgroundOpacity = 0.85;
        if (!hasOwn('buyColor')) this.style.buyColor = 'rgba(53, 186, 209, 0.82)';
        if (!hasOwn('sellColor')) this.style.sellColor = 'rgba(199, 71, 130, 0.82)';
        if (!hasOwn('valueAreaBuyColor')) this.style.valueAreaBuyColor = 'rgba(53, 186, 209, 1)';
        if (!hasOwn('valueAreaSellColor')) this.style.valueAreaSellColor = 'rgba(199, 71, 130, 1)';
        if (!hasOwn('pocColor')) this.style.pocColor = '#e6edf3';
        if (!Number.isFinite(Number(this.style.profileWidthRatio))) this.style.profileWidthRatio = 0.3;
        if (!hasOwn('profilePlacement')) this.style.profilePlacement = 'left';
        if (!hasOwn('rowsLayout')) this.style.rowsLayout = 'numberOfRows';
        if (!Number.isFinite(Number(this.style.rowSize))) this.style.rowSize = 24;
        if (!hasOwn('volumeDisplay')) this.style.volumeDisplay = 'upDown';
        if (!Number.isFinite(Number(this.style.valueAreaVolume))) this.style.valueAreaVolume = 70;
        if (this.style.extendRight === undefined) this.style.extendRight = false;
        if (this.style.showPOC === undefined) this.style.showPOC = true;
        if (this.style.showVAH === undefined) this.style.showVAH = true;
        if (this.style.showVAL === undefined) this.style.showVAL = true;
        if (this.style.showValues === undefined) this.style.showValues = true;
        if (!hasOwn('VAHColor')) this.style.VAHColor = '#089981';
        if (!hasOwn('VALColor')) this.style.VALColor = '#f23645';
        if (!hasOwn('valuesColor')) this.style.valuesColor = '#d1d4dc';
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        const chartData = scales.chart && Array.isArray(scales.chart.data) ? scales.chart.data : [];

        this.group = container.append('g')
            .attr('class', 'drawing drawing-anchored-volume-profile')
            .attr('data-id', this.id);

        if (chartData.length === 0) {
            this.createHandles(this.group, scales);
            return;
        }

        const latestDataIndex = chartData.length - 1;
        const endIndex = latestDataIndex;
        const anchorIndex = Math.max(0, Math.min(latestDataIndex, Math.round(this.points[0].x)));
        this.points[0].x = anchorIndex;

        this.group.remove();

        const proxy = new VolumeProfileTool(
            [
                { x: anchorIndex, y: this.points[0].y },
                { x: endIndex, y: this.points[0].y }
            ],
            { ...this.style }
        );
        proxy.id = this.id;
        proxy.selected = this.selected;
        proxy.visible = this.visible;
        proxy.locked = this.locked;
        proxy.meta = this.meta;
        proxy._isActiveResizing = this._isActiveResizing === true;
        proxy._activeResizingPointIndex = Number.isFinite(this._activeResizingPointIndex)
            ? this._activeResizingPointIndex
            : null;
        proxy.fixedProfileSide = String(this.style.profilePlacement || 'left').toLowerCase() === 'right' ? 'right' : 'left';
        proxy.render(container, scales);

        this.group = proxy.group;
        this.group
            .attr('class', 'drawing drawing-anchored-volume-profile')
            .attr('data-id', this.id);

        Object.assign(this.style, proxy.style || {});

        // Right side is fixed to latest candle for anchored profile.
        this.group.selectAll('.volume-profile-boundary-hit[data-point-index="1"]').remove();
        this.group.selectAll('.resize-handle-group[data-point-index="1"]').remove();
        this.group.selectAll('.resize-handle[data-point-index="1"], .resize-handle-hit[data-point-index="1"]').remove();

        const guideNodes = this.group.selectAll('.vertical-guide.volume-profile-guide').nodes();
        if (guideNodes.length > 1) {
            let rightMostNode = null;
            let rightMostX = -Infinity;
            guideNodes.forEach((node) => {
                const line = d3.select(node);
                const lineX = Number(line.attr('x1'));
                if (Number.isFinite(lineX) && lineX > rightMostX) {
                    rightMostX = lineX;
                    rightMostNode = node;
                }
            });

            if (rightMostNode) {
                d3.select(rightMostNode).remove();
            }
        }

        this.handles = Array.isArray(proxy.handles)
            ? proxy.handles.filter(h => h && h.index === 0)
            : [];
    }

    onPointHandleDrag(index, context = {}) {
        if (!Array.isArray(this.points) || index !== 0 || !this.points[0] || !context.point) {
            return false;
        }

        let nextX = Number(context.point.x);
        const chartData = context.scales && context.scales.chart && Array.isArray(context.scales.chart.data)
            ? context.scales.chart.data
            : [];

        if (Number.isFinite(nextX) && chartData.length > 0) {
            nextX = Math.max(0, Math.min(chartData.length - 1, nextX));
        }

        if (!Number.isFinite(nextX)) {
            return false;
        }

        this.points[0] = {
            ...this.points[0],
            x: nextX
        };
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data) {
        const tool = new AnchoredVolumeProfileTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        return tool;
    }
}
