/**
 * Drawing Tools - Patterns, Elliott Waves, and Cycles
 * Advanced pattern recognition and wave analysis tools
 */

class BarsPatternTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('bars-pattern', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(15, 24, 43, 0.55)';
    }

    isPointInside(mouseX, mouseY, scales) {
        if (this.points.length < 2) return false;

        const chart = scales?.chart || this.chart || window.chart;
        if (!chart) return false;

        const getXFromIndex = (idx) => {
            if (chart && typeof chart.dataIndexToPixel === 'function') return chart.dataIndexToPixel(idx);
            return scales.xScale(idx);
        };

        const yRange = scales.yScale.range();
        const yMinRange = Math.min(yRange[0], yRange[1]);
        const yMaxRange = Math.max(yRange[0], yRange[1]);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const startIdx = Math.min(Math.round(p1.x), Math.round(p2.x));
        const endIdx = Math.max(Math.round(p1.x), Math.round(p2.x));

        let yTop = yMinRange;
        let yBottom = yMaxRange;

        const data = chart?.data;
        if (Array.isArray(data) && data.length > 0) {
            const clampedStart = Math.max(0, Math.min(data.length - 1, startIdx));
            const clampedEnd = Math.max(0, Math.min(data.length - 1, endIdx));
            const s = Math.min(clampedStart, clampedEnd);
            const e = Math.max(clampedStart, clampedEnd);

            if (s <= e) {
                let maxHigh = -Infinity;
                let minLow = Infinity;
                for (let idx = s; idx <= e; idx++) {
                    const d = (typeof chart?.getDisplayCandle === 'function') ? chart.getDisplayCandle(idx) : data[idx];
                    if (!d) continue;
                    const h = d.h ?? d.high;
                    const l = d.l ?? d.low;
                    if (h === undefined || l === undefined || Number.isNaN(h) || Number.isNaN(l)) continue;
                    if (h > maxHigh) maxHigh = h;
                    if (l < minLow) minLow = l;
                }
                if (maxHigh !== -Infinity && minLow !== Infinity) {
                    const yHigh = scales.yScale(maxHigh);
                    const yLow = scales.yScale(minLow);
                    const pad = 6;
                    yTop = Math.max(yMinRange, Math.min(yHigh, yLow) - pad);
                    yBottom = Math.min(yMaxRange, Math.max(yHigh, yLow) + pad);
                }
            }
        } else {
            const y1 = scales.yScale(p1.y);
            const y2 = scales.yScale(p2.y);
            const pad = 30;
            yTop = Math.max(yMinRange, Math.min(y1, y2) - pad);
            yBottom = Math.min(yMaxRange, Math.max(y1, y2) + pad);
        }

        const candleSpacing = (chart && typeof chart.getCandleSpacing === 'function') ? chart.getCandleSpacing() : (chart?.candleWidth || 8);
        const half = candleSpacing / 2;
        const left = getXFromIndex(startIdx) - half;
        const right = getXFromIndex(endIdx) + half;

        const minX = Math.min(left, right);
        const maxX = Math.max(left, right);

        if (mouseX < minX || mouseX > maxX) return false;
        if (mouseY < yTop || mouseY > yBottom) return false;
        return true;
    }

    render(container, scales, isPreview = false) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing bars-pattern')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const chart = scales?.chart || this.chart || window.chart;

        const getXFromIndex = (idx) => {
            if (chart && typeof chart.dataIndexToPixel === 'function') return chart.dataIndexToPixel(idx);
            return scales.xScale(idx);
        };

        const yRange = scales.yScale.range();
        const yMinRange = Math.min(yRange[0], yRange[1]);
        const yMaxRange = Math.max(yRange[0], yRange[1]);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const startIdx = Math.min(Math.round(p1.x), Math.round(p2.x));
        const endIdx = Math.max(Math.round(p1.x), Math.round(p2.x));

        const data = chart?.data;

        let yTop = yMinRange;
        let yBottom = yMaxRange;

        if (Array.isArray(data) && data.length > 0) {
            const clampedStart = Math.max(0, Math.min(data.length - 1, startIdx));
            const clampedEnd = Math.max(0, Math.min(data.length - 1, endIdx));
            const s = Math.min(clampedStart, clampedEnd);
            const e = Math.max(clampedStart, clampedEnd);

            if (s <= e) {
                let maxHigh = -Infinity;
                let minLow = Infinity;
                for (let idx = s; idx <= e; idx++) {
                    const d = (typeof chart?.getDisplayCandle === 'function') ? chart.getDisplayCandle(idx) : data[idx];
                    if (!d) continue;
                    const h = d.h ?? d.high;
                    const l = d.l ?? d.low;
                    if (h === undefined || l === undefined || Number.isNaN(h) || Number.isNaN(l)) continue;
                    if (h > maxHigh) maxHigh = h;
                    if (l < minLow) minLow = l;
                }
                if (maxHigh !== -Infinity && minLow !== Infinity) {
                    const yHigh = scales.yScale(maxHigh);
                    const yLow = scales.yScale(minLow);
                    const pad = 6;
                    yTop = Math.max(yMinRange, Math.min(yHigh, yLow) - pad);
                    yBottom = Math.min(yMaxRange, Math.max(yHigh, yLow) + pad);
                }
            }
        } else {
            const y1 = scales.yScale(p1.y);
            const y2 = scales.yScale(p2.y);
            const pad = 30;
            yTop = Math.max(yMinRange, Math.min(y1, y2) - pad);
            yBottom = Math.min(yMaxRange, Math.max(y1, y2) + pad);
        }

        const candleSpacing = (chart && typeof chart.getCandleSpacing === 'function') ? chart.getCandleSpacing() : (chart?.candleWidth || 8);
        const half = candleSpacing / 2;
        const left = getXFromIndex(startIdx) - half;
        const right = getXFromIndex(endIdx) + half;

        const edgeStroke = this.style.stroke || '#2962ff';
        const edgeStrokeW = Math.max(1, this.style.strokeWidth || 2);
        const xStart = getXFromIndex(startIdx);
        const xEnd = getXFromIndex(endIdx);

        if (isPreview) {
            this.group.append('line')
                .attr('x1', xStart).attr('y1', yTop)
                .attr('x2', xStart).attr('y2', yBottom)
                .attr('stroke', edgeStroke)
                .attr('stroke-width', edgeStrokeW)
                .attr('opacity', 0.45)
                .style('pointer-events', 'none');

            this.group.append('line')
                .attr('x1', xEnd).attr('y1', yTop)
                .attr('x2', xEnd).attr('y2', yBottom)
                .attr('stroke', edgeStroke)
                .attr('stroke-width', edgeStrokeW)
                .attr('opacity', 0.45)
                .style('pointer-events', 'none');

            const p1x = getXFromIndex(p1.x);
            const p1y = scales.yScale(p1.y);
            const p2x = getXFromIndex(p2.x);
            const p2y = scales.yScale(p2.y);

            this.group.append('circle')
                .attr('cx', p1x)
                .attr('cy', p1y)
                .attr('r', 5)
                .attr('fill', 'transparent')
                .attr('stroke', edgeStroke)
                .attr('stroke-width', 2)
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');

            this.group.append('circle')
                .attr('cx', p2x)
                .attr('cy', p2y)
                .attr('r', 5)
                .attr('fill', 'transparent')
                .attr('stroke', edgeStroke)
                .attr('stroke-width', 2)
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');
        }

        this.group.append('rect')
            .attr('x', Math.min(left, right))
            .attr('y', yTop)
            .attr('width', Math.abs(right - left))
            .attr('height', Math.max(0, yBottom - yTop))
            .attr('fill', this.style.fill || 'rgba(15, 24, 43, 0.55)')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        if (Array.isArray(data) && data.length > 0) {
            const chartType = chart?.chartSettings?.chartType || 'candles';
            const candleWidth = chart?.candleWidth || 8;
            const stroke = this.style.stroke || '#2962ff';

            const drawStart = Math.max(0, Math.min(data.length - 1, startIdx));
            const drawEnd = Math.max(0, Math.min(data.length - 1, endIdx));
            const s = Math.min(drawStart, drawEnd);
            const e = Math.max(drawStart, drawEnd);

            if (chartType === 'bars') {
                const tickWidth = Math.max(3, candleWidth / 3);
                const wickWidth = Math.max(1, candleWidth / 8);
                for (let idx = s; idx <= e; idx++) {
                    const d = (typeof chart?.getDisplayCandle === 'function') ? chart.getDisplayCandle(idx) : data[idx];
                    if (!d) continue;
                    const o = d.o ?? d.open;
                    const h = d.h ?? d.high;
                    const l = d.l ?? d.low;
                    const c = d.c ?? d.close;
                    if ([o, h, l, c].some(v => v === undefined || v === null || Number.isNaN(v))) continue;

                    const x = getXFromIndex(idx);
                    const yo = scales.yScale(o);
                    const yc = scales.yScale(c);
                    const yh = scales.yScale(h);
                    const yl = scales.yScale(l);

                    this.group.append('line')
                        .attr('x1', x).attr('y1', yh)
                        .attr('x2', x).attr('y2', yl)
                        .attr('stroke', stroke)
                        .attr('stroke-width', wickWidth)
                        .attr('opacity', 0.95)
                        .style('pointer-events', 'none');

                    this.group.append('line')
                        .attr('x1', x - tickWidth).attr('y1', yo)
                        .attr('x2', x).attr('y2', yo)
                        .attr('stroke', stroke)
                        .attr('stroke-width', wickWidth)
                        .attr('opacity', 0.95)
                        .style('pointer-events', 'none');

                    this.group.append('line')
                        .attr('x1', x).attr('y1', yc)
                        .attr('x2', x + tickWidth).attr('y2', yc)
                        .attr('stroke', stroke)
                        .attr('stroke-width', wickWidth)
                        .attr('opacity', 0.95)
                        .style('pointer-events', 'none');
                }
            } else {
                const bodyWidth = candleWidth * 0.6;
                const wickWidth = Math.max(1, Math.min(2, Math.ceil(candleWidth / 8)));
                for (let idx = s; idx <= e; idx++) {
                    const d = (typeof chart?.getDisplayCandle === 'function') ? chart.getDisplayCandle(idx) : data[idx];
                    if (!d) continue;
                    const o = d.o ?? d.open;
                    const h = d.h ?? d.high;
                    const l = d.l ?? d.low;
                    const c = d.c ?? d.close;
                    if ([o, h, l, c].some(v => v === undefined || v === null || Number.isNaN(v))) continue;

                    const x = getXFromIndex(idx);
                    const yo = scales.yScale(o);
                    const yc = scales.yScale(c);
                    const yh = scales.yScale(h);
                    const yl = scales.yScale(l);

                    this.group.append('line')
                        .attr('x1', x).attr('y1', yh)
                        .attr('x2', x).attr('y2', yl)
                        .attr('stroke', stroke)
                        .attr('stroke-width', wickWidth)
                        .attr('opacity', 0.95)
                        .style('pointer-events', 'none');

                    const isUp = c >= o;
                    const bodyTop = Math.min(yo, yc);
                    const bodyHeight = Math.abs(yc - yo);
                    const bodyLeft = x - bodyWidth / 2;
                    const isHollowUp = (chartType === 'hollow') && isUp;

                    if (bodyHeight < 1) {
                        this.group.append('line')
                            .attr('x1', bodyLeft)
                            .attr('y1', yo)
                            .attr('x2', bodyLeft + bodyWidth)
                            .attr('y2', yo)
                            .attr('stroke', stroke)
                            .attr('stroke-width', Math.max(1, wickWidth))
                            .attr('opacity', 0.95)
                            .style('pointer-events', 'none');
                    } else {
                        this.group.append('rect')
                            .attr('x', bodyLeft)
                            .attr('y', bodyTop)
                            .attr('width', bodyWidth)
                            .attr('height', bodyHeight)
                            .attr('fill', isHollowUp ? 'none' : 'rgba(41, 98, 255, 0.22)')
                            .attr('stroke', stroke)
                            .attr('stroke-width', Math.max(1, Math.min(2, bodyWidth / 6)))
                            .attr('opacity', 0.95)
                            .style('pointer-events', 'none');
                    }
                }
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new BarsPatternTool(data.points, data.style);
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
// XABCD Pattern Tool - 5-point harmonic pattern
// ============================================================================
class XABCDPatternTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('xabcd-pattern', points, style);
        this.requiredPoints = 5;
        this.style.stroke = style.stroke || '#f23645';
        this.style.fill = style.fill || 'rgba(242, 54, 69, 0.25)';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['X', 'A', 'B', 'C', 'D'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing xabcd-pattern')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        // Helper to calculate Fibonacci ratio
        const calcRatio = (leg1Start, leg1End, leg2Start, leg2End) => {
            const leg1 = Math.abs(leg1End.y - leg1Start.y);
            const leg2 = Math.abs(leg2End.y - leg2Start.y);
            return leg1 > 0 ? (leg2 / leg1).toFixed(3) : '0';
        };

        // Draw filled triangular zones (XAB and BCD)
        if (this.points.length >= 3) {
            // XAB triangle fill
            const xabPath = `M ${getX(this.points[0])} ${getY(this.points[0])} 
                             L ${getX(this.points[1])} ${getY(this.points[1])} 
                             L ${getX(this.points[2])} ${getY(this.points[2])} Z`;
            this.group.append('path')
                .attr('d', xabPath)
                .attr('fill', this.style.fill)
                .attr('stroke', 'none')
                .style('pointer-events', 'none');
        }

        if (this.points.length >= 5) {
            // BCD triangle fill
            const bcdPath = `M ${getX(this.points[2])} ${getY(this.points[2])} 
                             L ${getX(this.points[3])} ${getY(this.points[3])} 
                             L ${getX(this.points[4])} ${getY(this.points[4])} Z`;
            this.group.append('path')
                .attr('d', bcdPath)
                .attr('fill', this.style.fill)
                .attr('stroke', 'none')
                .style('pointer-events', 'none');
        }

        // Draw connecting lines (solid)
        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Draw diagonal dashed lines (X-B and A-C extended)
        if (this.points.length >= 3) {
            // X-B dashed line
            this.group.append('line')
                .attr('x1', getX(this.points[0]))
                .attr('y1', getY(this.points[0]))
                .attr('x2', getX(this.points[2]))
                .attr('y2', getY(this.points[2]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.6);
        }

        if (this.points.length >= 4) {
            // A-C dashed line (just from A to C, no extension)
            const ax = getX(this.points[1]);
            const ay = getY(this.points[1]);
            const cx = getX(this.points[3]);
            const cy = getY(this.points[3]);
            this.group.append('line')
                .attr('x1', ax)
                .attr('y1', ay)
                .attr('x2', cx)
                .attr('y2', cy)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.6);
        }

        if (this.points.length >= 5) {
            // B-D dashed line  
            this.group.append('line')
                .attr('x1', getX(this.points[2]))
                .attr('y1', getY(this.points[2]))
                .attr('x2', getX(this.points[4]))
                .attr('y2', getY(this.points[4]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0.6);
        }

        // Draw Fibonacci ratio labels - positioned ON the line segments like TradingView
        // Helper to get perpendicular offset direction
        const getPerpendicularOffset = (x1, y1, x2, y2, distance) => {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) return { x: 0, y: distance };
            // Perpendicular vector (rotated 90 degrees), always offset to the right side of the line
            return { x: -dy / len * distance, y: dx / len * distance };
        };

        if (this.points.length >= 3) {
            // AB/XA ratio - positioned on AB leg midpoint, offset to the side
            const abRatio = calcRatio(this.points[0], this.points[1], this.points[1], this.points[2]);
            const ax = getX(this.points[1]);
            const ay = getY(this.points[1]);
            const bx = getX(this.points[2]);
            const by = getY(this.points[2]);
            const abMidX = (ax + bx) / 2;
            const abMidY = (ay + by) / 2;
            const abOffset = getPerpendicularOffset(ax, ay, bx, by, 20);
            this.drawRatioLabel(abMidX + abOffset.x, abMidY + abOffset.y, abRatio);
        }

        if (this.points.length >= 4) {
            // BC/XA ratio (C projection) - positioned ON the A-C dashed line (between A and C)
            const bcRatio = calcRatio(this.points[0], this.points[1], this.points[2], this.points[3]);
            const ax = getX(this.points[1]);
            const ay = getY(this.points[1]);
            const cx = getX(this.points[3]);
            const cy = getY(this.points[3]);
            // Position at 65% of the way from A to C (on the dashed line)
            const labelX = ax + (cx - ax) * 0.65;
            const labelY = ay + (cy - ay) * 0.65;
            const bcOffset = getPerpendicularOffset(ax, ay, cx, cy, -18);
            this.drawRatioLabel(labelX + bcOffset.x, labelY + bcOffset.y, bcRatio);
        }

        if (this.points.length >= 5) {
            // XB/XA ratio - positioned on X-B dashed line midpoint
            const xbRatio = calcRatio(this.points[0], this.points[1], this.points[0], this.points[2]);
            const xx = getX(this.points[0]);
            const xy = getY(this.points[0]);
            const bx = getX(this.points[2]);
            const by = getY(this.points[2]);
            const xbMidX = (xx + bx) / 2;
            const xbMidY = (xy + by) / 2;
            const xbOffset = getPerpendicularOffset(xx, xy, bx, by, 20);
            this.drawRatioLabel(xbMidX + xbOffset.x, xbMidY + xbOffset.y, xbRatio);

            // CD/BC ratio - positioned on CD leg midpoint
            const cdRatio = calcRatio(this.points[2], this.points[3], this.points[3], this.points[4]);
            const cx = getX(this.points[3]);
            const cy = getY(this.points[3]);
            const dx = getX(this.points[4]);
            const dy = getY(this.points[4]);
            const cdMidX = (cx + dx) / 2;
            const cdMidY = (cy + dy) / 2;
            const cdOffset = getPerpendicularOffset(cx, cy, dx, dy, 20);
            this.drawRatioLabel(cdMidX + cdOffset.x, cdMidY + cdOffset.y, cdRatio);
        }

        // Draw point labels with background boxes
        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                const px = getX(p);
                const py = getY(p);
                // Determine if point is a local high or low by comparing to neighbors
                let isTop = false;
                if (i === 0) {
                    isTop = this.points.length > 1 && p.y < this.points[1].y;
                } else if (i === this.points.length - 1) {
                    isTop = p.y < this.points[i - 1].y;
                } else {
                    isTop = p.y < this.points[i - 1].y && p.y < this.points[i + 1].y;
                }
                const labelY = isTop ? py - 18 : py + 22;
                
                // Background box
                this.group.append('rect')
                    .attr('x', px - 10)
                    .attr('y', labelY - 12)
                    .attr('width', 20)
                    .attr('height', 16)
                    .attr('fill', this.style.stroke)
                    .attr('rx', 2)
                    .style('pointer-events', 'none');
                
                // Label text
                this.group.append('text')
                    .attr('x', px)
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#ffffff')
                    .attr('font-size', '11px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        // Create handles
        this.createHandles(this.group, scales);
        return this.group;
    }

    drawRatioLabel(x, y, ratio) {
        const textWidth = ratio.length * 7 + 8;
        
        // Background box
        this.group.append('rect')
            .attr('x', x - textWidth / 2)
            .attr('y', y - 10)
            .attr('width', textWidth)
            .attr('height', 14)
            .attr('fill', this.style.stroke)
            .attr('rx', 2)
            .style('pointer-events', 'none');
        
        // Ratio text
        this.group.append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('fill', '#ffffff')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .text(ratio);
    }

    static fromJSON(data, chart = null) {
        const tool = new XABCDPatternTool(data.points, data.style);
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
// Cypher Pattern Tool - 5-point pattern
// ============================================================================
class CypherPatternTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('cypher-pattern', points, style);
        this.requiredPoints = 5;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['X', 'A', 'B', 'C', 'D'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing cypher-pattern')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new CypherPatternTool(data.points, data.style);
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
// Head and Shoulders Pattern Tool
// ============================================================================
class HeadShouldersTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('head-shoulders', points, style);
        this.requiredPoints = 7;
        this.style.stroke = style.stroke || '#ff9800';
        this.style.strokeWidth = style.strokeWidth || 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing head-shoulders')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Draw neckline if we have enough points
        if (this.points.length >= 5) {
            this.group.append('line')
                .attr('x1', getX(this.points[1]))
                .attr('y1', getY(this.points[1]))
                .attr('x2', getX(this.points[this.points.length - 2]))
                .attr('y2', getY(this.points[this.points.length - 2]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', 0.7);
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new HeadShouldersTool(data.points, data.style);
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
// ABCD Pattern Tool - 4-point pattern
// ============================================================================
class ABCDPatternTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('abcd-pattern', points, style);
        this.requiredPoints = 4;
        this.style.stroke = style.stroke || '#00bcd4';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['A', 'B', 'C', 'D'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing abcd-pattern')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Draw AD diagonal line (dashed)
        if (this.points.length === 4) {
            this.group.append('line')
                .attr('x1', getX(this.points[0]))
                .attr('y1', getY(this.points[0]))
                .attr('x2', getX(this.points[3]))
                .attr('y2', getY(this.points[3]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,4')
                .attr('opacity', 0.5);
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ABCDPatternTool(data.points, data.style);
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
// Triangle Pattern Tool
// ============================================================================
class TrianglePatternTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('triangle-pattern', points, style);
        this.requiredPoints = 4;
        this.style.stroke = style.stroke || '#4caf50';
        this.style.strokeWidth = style.strokeWidth || 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing triangle-pattern')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        // Draw two converging trendlines
        if (this.points.length >= 4) {
            // Upper trendline (points 0 and 2)
            this.group.append('line')
                .attr('x1', getX(this.points[0]))
                .attr('y1', getY(this.points[0]))
                .attr('x2', getX(this.points[2]))
                .attr('y2', getY(this.points[2]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Lower trendline (points 1 and 3)
            this.group.append('line')
                .attr('x1', getX(this.points[1]))
                .attr('y1', getY(this.points[1]))
                .attr('x2', getX(this.points[3]))
                .attr('y2', getY(this.points[3]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        } else {
            // Preview mode
            for (let i = 0; i < this.points.length - 1; i++) {
                this.group.append('line')
                    .attr('x1', getX(this.points[i]))
                    .attr('y1', getY(this.points[i]))
                    .attr('x2', getX(this.points[i + 1]))
                    .attr('y2', getY(this.points[i + 1]))
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('opacity', this.style.opacity)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new TrianglePatternTool(data.points, data.style);
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
// Three Drives Pattern Tool
// ============================================================================
class ThreeDrivesTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('three-drives', points, style);
        this.requiredPoints = 7;
        this.style.stroke = style.stroke || '#e91e63';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['1', '', '2', '', '3', '', ''];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing three-drives')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '11px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ThreeDrivesTool(data.points, data.style);
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
// Elliott Impulse Wave Tool (12345)
// ============================================================================
class ElliottImpulseTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('elliott-impulse', points, style);
        this.requiredPoints = 6;
        this.style.stroke = style.stroke || '#2196f3';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['0', '1', '2', '3', '4', '5'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing elliott-impulse')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            this.group.append('text')
                .attr('x', getX(p))
                .attr('y', getY(p) - 12)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.stroke)
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .style('pointer-events', 'none')
                .text(this.labels[i] || '');
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ElliottImpulseTool(data.points, data.style);
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
// Elliott Correction Wave Tool (ABC)
// ============================================================================
class ElliottCorrectionTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('elliott-correction', points, style);
        this.requiredPoints = 4;
        this.style.stroke = style.stroke || '#ff5722';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['', 'A', 'B', 'C'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing elliott-correction')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ElliottCorrectionTool(data.points, data.style);
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
// Elliott Triangle Wave Tool (ABCDE)
// ============================================================================
class ElliottTriangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('elliott-triangle', points, style);
        this.requiredPoints = 6;
        this.style.stroke = style.stroke || '#9c27b0';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['', 'A', 'B', 'C', 'D', 'E'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing elliott-triangle')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ElliottTriangleTool(data.points, data.style);
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
// Elliott Double Combo Wave Tool (WXY)
// ============================================================================
class ElliottDoubleComboTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('elliott-double-combo', points, style);
        this.requiredPoints = 4;
        this.style.stroke = style.stroke || '#607d8b';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['', 'W', 'X', 'Y'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing elliott-double-combo')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ElliottDoubleComboTool(data.points, data.style);
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
// Elliott Triple Combo Wave Tool (WXYXZ)
// ============================================================================
class ElliottTripleComboTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('elliott-triple-combo', points, style);
        this.requiredPoints = 6;
        this.style.stroke = style.stroke || '#795548';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.labels = ['', 'W', 'X', 'Y', 'X', 'Z'];
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing elliott-triple-combo')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                this.group.append('text')
                    .attr('x', getX(p))
                    .attr('y', getY(p) - 12)
                    .attr('text-anchor', 'middle')
                    .attr('fill', this.style.stroke)
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(this.labels[i]);
            }
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ElliottTripleComboTool(data.points, data.style);
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
// Cyclic Lines Tool - Evenly spaced vertical lines
// ============================================================================
class CyclicLinesTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('cyclic-lines', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#00bcd4';
        this.style.strokeWidth = style.strokeWidth || 1;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing cyclic-lines')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const chartHeight = scales.chart?.h || 500;

        const x1 = getX(this.points[0]);
        const x2 = getX(this.points[1]);
        const interval = Math.abs(x2 - x1);

        if (interval < 5) {
            this.createHandles(this.group, scales);
            return this.group;
        }

        const startX = Math.min(x1, x2);
        const chartWidth = scales.chart?.w || 1000;
        
        for (let x = startX; x < chartWidth + interval; x += interval) {
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', chartHeight)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', 0.6)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new CyclicLinesTool(data.points, data.style);
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
// Time Cycles Tool
// ============================================================================
class TimeCyclesTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('time-cycles', points, style);
        this.requiredPoints = 3;
        this.style.stroke = style.stroke || '#ff9800';
        this.style.strokeWidth = style.strokeWidth || 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing time-cycles')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        // Draw connecting lines
        for (let i = 0; i < this.points.length - 1; i++) {
            this.group.append('line')
                .attr('x1', getX(this.points[i]))
                .attr('y1', getY(this.points[i]))
                .attr('x2', getX(this.points[i + 1]))
                .attr('y2', getY(this.points[i + 1]))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new TimeCyclesTool(data.points, data.style);
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
// Sine Line Tool
// ============================================================================
class SineLineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('sine-line', points, style);
        this.requiredPoints = 2;
        this.style.stroke = style.stroke || '#e91e63';
        this.style.strokeWidth = style.strokeWidth || 2;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing sine-line')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const getX = (p) => scales.chart?.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const getY = (p) => scales.yScale(p.y);

        const x1 = getX(this.points[0]);
        const y1 = getY(this.points[0]);
        const x2 = getX(this.points[1]);
        const y2 = getY(this.points[1]);

        const wavelength = Math.abs(x2 - x1);
        const amplitude = Math.abs(y2 - y1) / 2;
        const centerY = (y1 + y2) / 2;

        if (wavelength < 10) {
            this.createHandles(this.group, scales);
            return this.group;
        }

        const chartWidth = scales.chart?.w || 1000;
        let pathD = `M ${x1} ${centerY}`;
        
        for (let x = x1; x <= chartWidth; x += 2) {
            const phase = ((x - x1) / wavelength) * Math.PI * 2;
            const y = centerY + amplitude * Math.sin(phase);
            pathD += ` L ${x} ${y}`;
        }

        this.group.append('path')
            .attr('d', pathD)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('fill', 'none')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new SineLineTool(data.points, data.style);
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
