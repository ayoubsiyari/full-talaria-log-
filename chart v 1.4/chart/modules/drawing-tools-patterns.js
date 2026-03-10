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
        const pointsPx = this.points.map((p) => ({ x: getX(p), y: getY(p) }));
        const lineSegments = [];

        for (let i = 0; i < pointsPx.length - 1; i++) {
            lineSegments.push({
                x1: pointsPx[i].x,
                y1: pointsPx[i].y,
                x2: pointsPx[i + 1].x,
                y2: pointsPx[i + 1].y
            });
        }
        if (pointsPx.length >= 3) {
            lineSegments.push({ x1: pointsPx[0].x, y1: pointsPx[0].y, x2: pointsPx[2].x, y2: pointsPx[2].y });
        }
        if (pointsPx.length >= 4) {
            lineSegments.push({ x1: pointsPx[1].x, y1: pointsPx[1].y, x2: pointsPx[3].x, y2: pointsPx[3].y });
        }
        if (pointsPx.length >= 5) {
            lineSegments.push({ x1: pointsPx[2].x, y1: pointsPx[2].y, x2: pointsPx[4].x, y2: pointsPx[4].y });
        }

        // Helper to calculate Fibonacci ratio
        const calcRatio = (denStart, denEnd, numStart, numEnd) => {
            const denominator = Math.abs((denEnd?.y ?? 0) - (denStart?.y ?? 0));
            const numerator = Math.abs((numEnd?.y ?? 0) - (numStart?.y ?? 0));
            if (denominator < 0.000001) return null;
            const ratio = numerator / denominator;
            return ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
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

        const orientation = (ax, ay, bx, by, cx, cy) => {
            const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
            if (Math.abs(value) < 1e-6) return 0;
            return value > 0 ? 1 : 2;
        };

        const onSegment = (ax, ay, bx, by, cx, cy) => (
            bx <= Math.max(ax, cx) + 1e-6 &&
            bx >= Math.min(ax, cx) - 1e-6 &&
            by <= Math.max(ay, cy) + 1e-6 &&
            by >= Math.min(ay, cy) - 1e-6
        );

        const segmentsIntersect = (a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) => {
            const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
            const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
            const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
            const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);

            if (o1 !== o2 && o3 !== o4) return true;
            if (o1 === 0 && onSegment(a1x, a1y, b1x, b1y, a2x, a2y)) return true;
            if (o2 === 0 && onSegment(a1x, a1y, b2x, b2y, a2x, a2y)) return true;
            if (o3 === 0 && onSegment(b1x, b1y, a1x, a1y, b2x, b2y)) return true;
            if (o4 === 0 && onSegment(b1x, b1y, a2x, a2y, b2x, b2y)) return true;

            return false;
        };

        const segmentIntersectsRect = (segment, left, top, right, bottom, padding = 2) => {
            const rectLeft = left - padding;
            const rectTop = top - padding;
            const rectRight = right + padding;
            const rectBottom = bottom + padding;

            const endpointInside = (segment.x1 >= rectLeft && segment.x1 <= rectRight && segment.y1 >= rectTop && segment.y1 <= rectBottom)
                || (segment.x2 >= rectLeft && segment.x2 <= rectRight && segment.y2 >= rectTop && segment.y2 <= rectBottom);
            if (endpointInside) return true;

            const edges = [
                { x1: rectLeft, y1: rectTop, x2: rectRight, y2: rectTop },
                { x1: rectRight, y1: rectTop, x2: rectRight, y2: rectBottom },
                { x1: rectRight, y1: rectBottom, x2: rectLeft, y2: rectBottom },
                { x1: rectLeft, y1: rectBottom, x2: rectLeft, y2: rectTop }
            ];

            return edges.some((edge) => (
                segmentsIntersect(segment.x1, segment.y1, segment.x2, segment.y2, edge.x1, edge.y1, edge.x2, edge.y2)
            ));
        };

        const countLineOverlapsForLabel = (centerX, baselineY, boxWidth, boxHeight, topOffset) => {
            const left = centerX - (boxWidth / 2);
            const top = baselineY + topOffset;
            const right = left + boxWidth;
            const bottom = top + boxHeight;

            let overlaps = 0;
            lineSegments.forEach((segment) => {
                if (segmentIntersectsRect(segment, left, top, right, bottom)) {
                    overlaps += 1;
                }
            });
            return overlaps;
        };

        const pickLeastOverlappingLabelPosition = (candidates, boxWidth, boxHeight, topOffset) => {
            if (!Array.isArray(candidates) || candidates.length === 0) return null;

            let best = candidates[0];
            let bestScore = Number.POSITIVE_INFINITY;

            candidates.forEach((candidate, index) => {
                const overlapCount = countLineOverlapsForLabel(candidate.x, candidate.y, boxWidth, boxHeight, topOffset);
                const score = (overlapCount * 1000) + index;
                if (score < bestScore) {
                    best = candidate;
                    bestScore = score;
                }
            });

            return best;
        };

        const placeRatioLabel = (ratio, anchorX, anchorY, x1, y1, x2, y2, preferredDistance = 20) => {
            if (!ratio) return;
            const boxWidth = ratio.length * 7 + 8;
            const boxHeight = 14;
            const primaryOffset = getPerpendicularOffset(x1, y1, x2, y2, preferredDistance);
            const secondaryOffset = getPerpendicularOffset(x1, y1, x2, y2, -preferredDistance);

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const alongX = len > 0 ? (dx / len) * 12 : 0;
            const alongY = len > 0 ? (dy / len) * 12 : 0;

            const candidates = [
                { x: anchorX + primaryOffset.x, y: anchorY + primaryOffset.y },
                { x: anchorX + secondaryOffset.x, y: anchorY + secondaryOffset.y },
                { x: anchorX + primaryOffset.x + alongX, y: anchorY + primaryOffset.y + alongY },
                { x: anchorX + primaryOffset.x - alongX, y: anchorY + primaryOffset.y - alongY },
                { x: anchorX + secondaryOffset.x + alongX, y: anchorY + secondaryOffset.y + alongY },
                { x: anchorX + secondaryOffset.x - alongX, y: anchorY + secondaryOffset.y - alongY },
                { x: anchorX + (primaryOffset.x * 1.4), y: anchorY + (primaryOffset.y * 1.4) },
                { x: anchorX + (secondaryOffset.x * 1.4), y: anchorY + (secondaryOffset.y * 1.4) }
            ];

            const best = pickLeastOverlappingLabelPosition(candidates, boxWidth, boxHeight, -10) || candidates[0];
            this.drawRatioLabel(best.x, best.y, ratio);
        };

        if (this.points.length >= 3) {
            // AB/XA ratio - positioned on AB leg midpoint, offset to the side
            const abRatio = calcRatio(this.points[0], this.points[1], this.points[1], this.points[2]);
            const ax = pointsPx[1].x;
            const ay = pointsPx[1].y;
            const bx = pointsPx[2].x;
            const by = pointsPx[2].y;
            const abMidX = (ax + bx) / 2;
            const abMidY = (ay + by) / 2;
            placeRatioLabel(abRatio, abMidX, abMidY, ax, ay, bx, by, 20);
        }

        if (this.points.length >= 4) {
            // BC/AB ratio (C projection) - positioned ON the A-C dashed line (between A and C)
            const bcRatio = calcRatio(this.points[1], this.points[2], this.points[2], this.points[3]);
            const ax = pointsPx[1].x;
            const ay = pointsPx[1].y;
            const cx = pointsPx[3].x;
            const cy = pointsPx[3].y;
            // Position at 65% of the way from A to C (on the dashed line)
            const labelX = ax + (cx - ax) * 0.65;
            const labelY = ay + (cy - ay) * 0.65;
            placeRatioLabel(bcRatio, labelX, labelY, ax, ay, cx, cy, -18);
        }

        if (this.points.length >= 5) {
            // CD/BC ratio - positioned ON the B-D dashed guide
            const cdRatio = calcRatio(this.points[2], this.points[3], this.points[3], this.points[4]);
            const bx = pointsPx[2].x;
            const by = pointsPx[2].y;
            const dx = pointsPx[4].x;
            const dy = pointsPx[4].y;
            const bdMidX = (bx + dx) / 2;
            const bdMidY = (by + dy) / 2;
            placeRatioLabel(cdRatio, bdMidX, bdMidY, bx, by, dx, dy, 20);
        }

        // Draw point labels (text only, no background box)
        this.points.forEach((p, i) => {
            if (this.labels[i]) {
                const px = pointsPx[i].x;
                const py = pointsPx[i].y;
                // Determine if point is a local high or low by comparing to neighbors
                let isTop = false;
                if (i === 0) {
                    isTop = this.points.length > 1 && p.y < this.points[1].y;
                } else if (i === this.points.length - 1) {
                    isTop = p.y < this.points[i - 1].y;
                } else {
                    isTop = p.y < this.points[i - 1].y && p.y < this.points[i + 1].y;
                }
                const preferredLabelY = isTop ? py - 18 : py + 22;
                const alternateLabelY = isTop ? py + 22 : py - 18;
                const candidates = [
                    { x: px, y: preferredLabelY },
                    { x: px - 16, y: preferredLabelY },
                    { x: px + 16, y: preferredLabelY },
                    { x: px, y: alternateLabelY },
                    { x: px - 16, y: alternateLabelY },
                    { x: px + 16, y: alternateLabelY },
                    { x: px - 24, y: preferredLabelY + 4 },
                    { x: px + 24, y: preferredLabelY + 4 }
                ];
                const bestLabelPosition = pickLeastOverlappingLabelPosition(candidates, 20, 16, -12) || candidates[0];
                const labelX = bestLabelPosition.x;
                const labelY = bestLabelPosition.y;

                // Label text
                this.group.append('text')
                    .attr('x', labelX)
                    .attr('y', labelY)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('fill', this.style.stroke)
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
            this.group.append('text')
                .attr('x', getX(p))
                .attr('y', getY(p) - 12)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.stroke)
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .style('pointer-events', 'none')
                .text(this.labels[i]);
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
        this.style.stroke = style.stroke || '#00bfa5';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(0, 191, 165, 0.14)';
        this.style.necklineDasharray = style.necklineDasharray || '2,6';
        this.style.necklineWidth = style.necklineWidth || 2;
        this.style.labelFill = style.labelFill || this.style.stroke;
        this.style.labelTextColor = style.labelTextColor || '#ffffff';
        this.style.pointStroke = style.pointStroke || '#2f5dff';
        this.style.pointFill = style.pointFill || '#0b1220';
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
        const pointsPx = this.points.map((p) => ({ x: getX(p), y: getY(p) }));

        const outlinePath = pointsPx
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
            .join(' ');

        // TradingView-like behavior:
        // - Always shade head zone (between neckline pivots)
        // - Shade each shoulder zone only if its outer leg touches/crosses neckline
        if (pointsPx.length >= 5) {
            const fillAboveNeckline = this._shouldFillAboveNeckline(pointsPx);
            const fillZones = this._getNecklineFillZones(pointsPx);

            fillZones.forEach((zonePoints) => {
                const fillRuns = this._buildNecklineFillRuns(pointsPx, fillAboveNeckline, zonePoints);

                fillRuns.forEach((run) => {
                    if (!run || run.length < 2) return;

                    const runStart = run[0];
                    const runEnd = run[run.length - 1];
                    const startTouchesNeckline = this._isPointTouchingNeckline(pointsPx, runStart);
                    const endTouchesNeckline = this._isPointTouchingNeckline(pointsPx, runEnd);
                    // Show fill for each zone that touches/crosses neckline at either side.
                    if (!startTouchesNeckline && !endTouchesNeckline) return;

                    const necklineBoundary = run
                        .slice()
                        .reverse()
                        .map((p) => ({
                            x: p.x,
                            y: this._getNecklineYAtX(pointsPx, p.x)
                        }));

                    const fillPathPoints = [...run, ...necklineBoundary];
                    if (fillPathPoints.length < 3) return;

                    const fillPath = `${fillPathPoints
                        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                        .join(' ')} Z`;

                    this.group.append('path')
                        .attr('d', fillPath)
                        .attr('fill', this.style.fill)
                        .attr('stroke', 'none')
                        .style('pointer-events', 'none');
                });
            });
        }

        this.group.append('path')
            .attr('d', outlinePath)
            .attr('fill', 'none')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Show neckline only after point 4 exists (right neckline pivot).
        if (pointsPx.length >= 5) {
            const neckline = this._getRenderedNecklinePoints(pointsPx, scales);
            if (neckline) {
                this.group.append('line')
                    .attr('x1', neckline.start.x)
                    .attr('y1', neckline.start.y)
                    .attr('x2', neckline.end.x)
                    .attr('y2', neckline.end.y)
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.necklineWidth)
                    .attr('stroke-dasharray', this.style.necklineDasharray)
                    .attr('stroke-linecap', 'round')
                    .attr('opacity', 0.95)
                    .style('pointer-events', 'none');
            }
        }

        // Shoulder/head labels
        const labels = [
            { index: 1, text: 'LS' },
            { index: 3, text: 'H' },
            { index: 5, text: 'RS' }
        ];

        labels.forEach((label) => {
            const point = pointsPx[label.index];
            if (!point) return;

            const necklineY = this._getNecklineYAtX(pointsPx, point.x);
            const placeAbove = point.y <= necklineY;
            this.drawShoulderLabel(point.x, point.y, label.text, placeAbove);
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    _getNecklinePoints(pointsPx) {
        if (!Array.isArray(pointsPx) || pointsPx.length < 2) return null;

        // Standard H&S neckline: valley after left shoulder to valley after head.
        if (pointsPx.length >= 5) {
            const leftNeck = pointsPx[2];
            const rightNeck = pointsPx[4];

            if (leftNeck && rightNeck) {
                return leftNeck.x <= rightNeck.x
                    ? { start: leftNeck, end: rightNeck }
                    : { start: rightNeck, end: leftNeck };
            }
        }

        const first = pointsPx[0];
        const last = pointsPx[pointsPx.length - 1];
        if (!first || !last) return null;

        return first.x <= last.x
            ? { start: first, end: last }
            : { start: last, end: first };
    }

    _getRenderedNecklinePoints(pointsPx, scales = null) {
        const baseNeckline = this._getNecklinePoints(pointsPx);
        if (!baseNeckline) return null;

        // Avoid showing neckline too early; wait until point 4 is placed.
        if (!Array.isArray(pointsPx) || pointsPx.length < 5) {
            return null;
        }

        // Keep the original extended look by default.
        let renderedStartX = baseNeckline.start.x;
        let renderedEndX = baseNeckline.end.x;

        const viewportRange = this._getViewportXRange(scales, pointsPx);
        if (viewportRange) {
            const [minX, maxX] = viewportRange;
            if (Number.isFinite(minX) && Number.isFinite(maxX) && Math.abs(maxX - minX) > 0.01) {
                renderedStartX = minX;
                renderedEndX = maxX;
            }
        }

        // Hide only the rest of neckline after an outer shoulder leg touches/crosses it.
        if (pointsPx.length >= 7) {
            const leftHit = this._getShoulderLegNecklineHit(pointsPx, pointsPx[0], pointsPx[1]);
            const rightHit = this._getShoulderLegNecklineHit(pointsPx, pointsPx[5], pointsPx[6]);

            if (leftHit && Number.isFinite(leftHit.x)) {
                renderedStartX = Math.max(renderedStartX, leftHit.x);
            }

            if (rightHit && Number.isFinite(rightHit.x)) {
                renderedEndX = Math.min(renderedEndX, rightHit.x);
            }
        }

        if (!Number.isFinite(renderedStartX) || !Number.isFinite(renderedEndX)) {
            return null;
        }

        let startX = renderedStartX;
        let endX = renderedEndX;
        if (startX > endX) {
            const temp = startX;
            startX = endX;
            endX = temp;
        }

        if ((endX - startX) <= 0.01) {
            return null;
        }

        return {
            start: { x: startX, y: this._getNecklineYAtX(pointsPx, startX) },
            end: { x: endX, y: this._getNecklineYAtX(pointsPx, endX) }
        };
    }

    _getViewportXRange(scales, pointsPx) {
        const xScale = scales && scales.xScale;
        if (xScale && typeof xScale.range === 'function') {
            const range = xScale.range();
            if (Array.isArray(range) && range.length >= 2) {
                const first = Number(range[0]);
                const last = Number(range[range.length - 1]);
                if (Number.isFinite(first) && Number.isFinite(last)) {
                    return first <= last ? [first, last] : [last, first];
                }
            }
        }

        const chart = (scales && scales.chart) || this.chart || window.chart;
        const chartWidth = Number(chart && (chart.width || (chart.canvas && chart.canvas.width)));
        if (Number.isFinite(chartWidth) && chartWidth > 0) {
            return [0, chartWidth];
        }

        if (Array.isArray(pointsPx) && pointsPx.length >= 2) {
            const xs = pointsPx
                .map(p => Number(p && p.x))
                .filter(x => Number.isFinite(x));
            if (xs.length >= 2) {
                const min = Math.min(...xs);
                const max = Math.max(...xs);
                const pad = Math.max(120, (max - min) * 0.8);
                return [min - pad, max + pad];
            }
        }

        return null;
    }

    _getInfiniteLineIntersection(lineA, lineB, lineC, lineD) {
        if (!lineA || !lineB || !lineC || !lineD) return null;

        const r = { x: lineB.x - lineA.x, y: lineB.y - lineA.y };
        const s = { x: lineD.x - lineC.x, y: lineD.y - lineC.y };
        const denominator = (r.x * s.y) - (r.y * s.x);

        if (Math.abs(denominator) < 0.0001) return null;

        const delta = { x: lineC.x - lineA.x, y: lineC.y - lineA.y };
        const t = ((delta.x * s.y) - (delta.y * s.x)) / denominator;

        return {
            x: lineA.x + (t * r.x),
            y: lineA.y + (t * r.y)
        };
    }

    _isPointOnShoulderRay(intersection, shoulderPoint, outerPoint) {
        if (!intersection || !shoulderPoint || !outerPoint) return false;

        const dirX = outerPoint.x - shoulderPoint.x;
        const dirY = outerPoint.y - shoulderPoint.y;
        const dirLenSq = (dirX * dirX) + (dirY * dirY);
        if (dirLenSq < 0.0001) return false;

        const toX = intersection.x - shoulderPoint.x;
        const toY = intersection.y - shoulderPoint.y;
        const dot = (toX * dirX) + (toY * dirY);

        return dot >= -0.0001;
    }

    _getNecklineYAtX(pointsPx, x) {
        const neckline = this._getNecklinePoints(pointsPx);
        if (!neckline) return 0;

        const dx = neckline.end.x - neckline.start.x;

        if (Math.abs(dx) < 0.0001) {
            return (neckline.start.y + neckline.end.y) / 2;
        }

        const t = (x - neckline.start.x) / dx;
        return neckline.start.y + ((neckline.end.y - neckline.start.y) * t);
    }

    _getNecklineFillZones(pointsPx) {
        if (!Array.isArray(pointsPx) || pointsPx.length < 5) return [];

        // Head zone (neckline pivot -> head -> neckline pivot)
        const zones = [pointsPx.slice(2, 5)];

        // Shoulder zones are optional and appear only if their outer leg
        // touches/crosses neckline.
        if (pointsPx.length >= 7) {
            if (this._segmentTouchesOrCrossesNeckline(pointsPx, pointsPx[0], pointsPx[1])) {
                zones.push(pointsPx.slice(0, 3));
            }

            if (this._segmentTouchesOrCrossesNeckline(pointsPx, pointsPx[5], pointsPx[6])) {
                zones.push(pointsPx.slice(4, 7));
            }
        }

        return zones;
    }

    _segmentTouchesOrCrossesNeckline(pointsPx, a, b, tolerancePx = 0.2) {
        if (!a || !b || !Array.isArray(pointsPx) || pointsPx.length < 2) return false;

        const dA = a.y - this._getNecklineYAtX(pointsPx, a.x);
        const dB = b.y - this._getNecklineYAtX(pointsPx, b.x);
        if (!Number.isFinite(dA) || !Number.isFinite(dB)) return false;

        if (Math.abs(dA) <= tolerancePx || Math.abs(dB) <= tolerancePx) {
            return true;
        }

        return (dA < 0 && dB > 0) || (dA > 0 && dB < 0);
    }

    _getShoulderLegNecklineHit(pointsPx, a, b, tolerancePx = 0.2) {
        if (!a || !b || !Array.isArray(pointsPx) || pointsPx.length < 2) return null;

        const dA = a.y - this._getNecklineYAtX(pointsPx, a.x);
        const dB = b.y - this._getNecklineYAtX(pointsPx, b.x);
        if (!Number.isFinite(dA) || !Number.isFinite(dB)) return null;

        if (Math.abs(dA) <= tolerancePx) {
            return { x: a.x, y: this._getNecklineYAtX(pointsPx, a.x) };
        }

        if (Math.abs(dB) <= tolerancePx) {
            return { x: b.x, y: this._getNecklineYAtX(pointsPx, b.x) };
        }

        const crosses = (dA < 0 && dB > 0) || (dA > 0 && dB < 0);
        if (!crosses) return null;

        return this._getNecklineSegmentIntersection(pointsPx, a, b, dA, dB);
    }

    _isPointTouchingNeckline(pointsPx, point, tolerancePx = 0.2) {
        if (!point || !Array.isArray(pointsPx) || pointsPx.length < 2) return false;
        const necklineY = this._getNecklineYAtX(pointsPx, point.x);
        return Number.isFinite(necklineY) && Math.abs(point.y - necklineY) <= tolerancePx;
    }

    _shouldFillAboveNeckline(pointsPx) {
        const epsilon = 0.0001;

        // Keep fill side anchored to the head first, so shoulder drag does not
        // unexpectedly flip the whole filled region.
        const headPoint = pointsPx[3];
        if (headPoint) {
            const headDelta = headPoint.y - this._getNecklineYAtX(pointsPx, headPoint.x);
            if (Number.isFinite(headDelta) && Math.abs(headDelta) > epsilon) {
                return headDelta <= 0;
            }
        }

        // Then prefer shoulders if head is exactly on neckline.
        const shoulderPriority = [1, 5];
        for (const index of shoulderPriority) {
            if (index >= pointsPx.length) continue;
            const point = pointsPx[index];
            const delta = point.y - this._getNecklineYAtX(pointsPx, point.x);
            if (Number.isFinite(delta) && Math.abs(delta) > epsilon) {
                return delta <= 0;
            }
        }

        const shoulderHeadIndexes = [1, 3, 5];
        const deltas = shoulderHeadIndexes
            .filter(index => index < pointsPx.length)
            .map(index => {
                const point = pointsPx[index];
                return point.y - this._getNecklineYAtX(pointsPx, point.x);
            })
            .filter(delta => Number.isFinite(delta));

        if (deltas.length === 0) {
            const midPoint = pointsPx[Math.floor(pointsPx.length / 2)];
            if (!midPoint) return true;
            const midDelta = midPoint.y - this._getNecklineYAtX(pointsPx, midPoint.x);
            return midDelta <= 0;
        }

        const avgDelta = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
        return avgDelta <= 0;
    }

    _buildNecklineFillRuns(pointsPx, fillAboveNeckline, sourcePoints = null) {
        const activePoints = (Array.isArray(sourcePoints) && sourcePoints.length >= 2)
            ? sourcePoints
            : pointsPx;

        const runs = [];
        let currentRun = null;
        const epsilon = 0.0001;

        const isInside = (delta) => (fillAboveNeckline ? delta <= epsilon : delta >= -epsilon);

        const pushPoint = (target, point) => {
            if (!target || !point) return;
            const last = target[target.length - 1];
            if (
                !last ||
                Math.abs(last.x - point.x) > 0.01 ||
                Math.abs(last.y - point.y) > 0.01
            ) {
                target.push(point);
            }
        };

        for (let i = 0; i < activePoints.length - 1; i++) {
            const a = activePoints[i];
            const b = activePoints[i + 1];
            const dA = a.y - this._getNecklineYAtX(pointsPx, a.x);
            const dB = b.y - this._getNecklineYAtX(pointsPx, b.x);

            const inA = isInside(dA);
            const inB = isInside(dB);
            const crossing = (inA !== inB);
            const intersection = crossing
                ? this._getNecklineSegmentIntersection(pointsPx, a, b, dA, dB)
                : null;

            if (inA && !currentRun) currentRun = [];
            if (inA && currentRun) pushPoint(currentRun, a);

            if (inA && inB) {
                if (!currentRun) currentRun = [];
                pushPoint(currentRun, b);
            } else if (inA && !inB) {
                if (intersection) pushPoint(currentRun, intersection);
                if (currentRun && currentRun.length >= 2) runs.push(currentRun);
                currentRun = null;
            } else if (!inA && inB) {
                currentRun = [];
                if (intersection) pushPoint(currentRun, intersection);
                pushPoint(currentRun, b);
            }
        }

        if (currentRun && currentRun.length >= 2) {
            runs.push(currentRun);
        }

        return runs;
    }

    _getNecklineSegmentIntersection(pointsPx, a, b, dA, dB) {
        if (!Array.isArray(pointsPx) || pointsPx.length < 2 || !a || !b) return null;

        const neckline = this._getNecklinePoints(pointsPx);
        if (!neckline) return null;

        const first = neckline.start;
        const last = neckline.end;
        const neckDx = last.x - first.x;

        if (Math.abs(neckDx) < 0.0001) {
            const segDx = b.x - a.x;
            if (Math.abs(segDx) < 0.0001) return null;
            const tVertical = (first.x - a.x) / segDx;
            if (tVertical < 0 || tVertical > 1) return null;
            const y = a.y + ((b.y - a.y) * tVertical);
            return { x: first.x, y };
        }

        const m = (last.y - first.y) / neckDx;
        const neckB = first.y - (m * first.x);

        const da = Number.isFinite(dA) ? dA : (a.y - ((m * a.x) + neckB));
        const db = Number.isFinite(dB) ? dB : (b.y - ((m * b.x) + neckB));
        const denom = db - da;
        if (Math.abs(denom) < 0.0001) return null;

        const t = -da / denom;
        const clampedT = Math.max(0, Math.min(1, t));
        const x = a.x + ((b.x - a.x) * clampedT);
        const y = (m * x) + neckB;
        return { x, y };
    }

    drawShoulderLabel(x, y, text, placeAbove = true) {
        const tagText = String(text || '');
        if (!tagText) return;

        const textWidth = Math.max(20, (tagText.length * 7) + 8);
        const labelHeight = 16;
        const labelY = placeAbove ? (y - 18) : (y + 22);

        this.group.append('rect')
            .attr('x', x - (textWidth / 2))
            .attr('y', labelY - 12)
            .attr('width', textWidth)
            .attr('height', labelHeight)
            .attr('rx', 2)
            .attr('fill', this.style.labelFill || this.style.stroke)
            .style('pointer-events', 'none');

        this.group.append('text')
            .attr('x', x)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('fill', this.style.labelTextColor || '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text(tagText);
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
        this.style.stroke = style.stroke || '#00bfa5';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.guideDasharray = style.guideDasharray || '2,8';
        this.style.guideWidth = style.guideWidth || 1;
        this.style.labelFill = style.labelFill || this.style.stroke;
        this.style.labelTextColor = style.labelTextColor || '#ffffff';
        this.style.ratioFill = style.ratioFill || this.style.stroke;
        this.style.ratioTextColor = style.ratioTextColor || '#ffffff';
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
        const pointsPx = this.points.map((p) => ({ x: getX(p), y: getY(p) }));
        const lineOpacity = this.style.opacity ?? 1;

        // Main ABCD legs (solid)
        for (let i = 0; i < pointsPx.length - 1; i++) {
            const a = pointsPx[i];
            const b = pointsPx[i + 1];
            this.group.append('line')
                .attr('x1', a.x)
                .attr('y1', a.y)
                .attr('x2', b.x)
                .attr('y2', b.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-linejoin', 'round')
                .attr('stroke-linecap', 'round')
                .attr('opacity', lineOpacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // AC projection guide (dotted) + BC/AB ratio label.
        if (pointsPx.length >= 3) {
            const a = pointsPx[0];
            const c = pointsPx[2];

            this.group.append('line')
                .attr('x1', a.x)
                .attr('y1', a.y)
                .attr('x2', c.x)
                .attr('y2', c.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.guideWidth)
                .attr('stroke-dasharray', this.style.guideDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            const bcOverAb = this._formatLegRatio(this.points[1], this.points[2], this.points[0], this.points[1]);
            if (bcOverAb) {
                const pos = this._pointOnSegment(a, c, 0.52);
                const offset = this._getPerpendicularOffset(a, c, 18);
                this._drawTag(pos.x + offset.x, pos.y + offset.y, bcOverAb, {
                    minWidth: 52,
                    fill: this.style.ratioFill,
                    textColor: this.style.ratioTextColor,
                    fontSize: 11
                });
            }
        }

        // BD projection guide (dotted) + CD/BC ratio label.
        if (pointsPx.length >= 4) {
            const b = pointsPx[1];
            const d = pointsPx[3];

            this.group.append('line')
                .attr('x1', b.x)
                .attr('y1', b.y)
                .attr('x2', d.x)
                .attr('y2', d.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.guideWidth)
                .attr('stroke-dasharray', this.style.guideDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            const cdOverBc = this._formatLegRatio(this.points[2], this.points[3], this.points[1], this.points[2]);
            if (cdOverBc) {
                const pos = this._pointOnSegment(b, d, 0.48);
                const offset = this._getPerpendicularOffset(b, d, 18);
                this._drawTag(pos.x + offset.x, pos.y + offset.y, cdOverBc, {
                    minWidth: 52,
                    fill: this.style.ratioFill,
                    textColor: this.style.ratioTextColor,
                    fontSize: 11
                });
            }
        }

        pointsPx.forEach((pointPx, i) => {
            const label = this.labels[i];
            if (!label) return;

            const prev = pointsPx[i - 1];
            const next = pointsPx[i + 1];
            let isTop = false;

            if (prev && next) {
                isTop = pointPx.y < prev.y && pointPx.y < next.y;
            } else if (next) {
                isTop = pointPx.y < next.y;
            } else if (prev) {
                isTop = pointPx.y < prev.y;
            }

            const offsetY = isTop ? -26 : 26;
            this._drawTag(pointPx.x, pointPx.y + offsetY, label, {
                minWidth: 20,
                fill: this.style.labelFill,
                textColor: this.style.labelTextColor,
                fontSize: 11,
                paddingX: 6,
                paddingY: 2.5,
                cornerRadius: 2,
                fontWeight: 'bold'
            });
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    _formatLegRatio(numStart, numEnd, denStart, denEnd) {
        if (!numStart || !numEnd || !denStart || !denEnd) return null;

        const numerator = Math.abs((numEnd.y ?? 0) - (numStart.y ?? 0));
        const denominator = Math.abs((denEnd.y ?? 0) - (denStart.y ?? 0));
        if (denominator < 0.000001) return null;

        const ratio = numerator / denominator;
        return ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }

    _pointOnSegment(start, end, t = 0.5) {
        return {
            x: start.x + ((end.x - start.x) * t),
            y: start.y + ((end.y - start.y) * t)
        };
    }

    _getPerpendicularOffset(start, end, distance = 18) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt((dx * dx) + (dy * dy));
        if (length < 0.0001) return { x: 0, y: -distance };

        return {
            x: (-dy / length) * distance,
            y: (dx / length) * distance
        };
    }

    _drawTag(x, y, text, options = {}) {
        const tagText = String(text || '');
        if (!tagText) return;

        const fontSize = Number(options.fontSize) || 12;
        const paddingX = Number(options.paddingX) || 10;
        const paddingY = Number(options.paddingY) || 5;
        const minWidth = Number(options.minWidth) || 24;
        const cornerRadius = Number(options.cornerRadius);
        const estimatedTextWidth = Math.max(minWidth, (tagText.length * (fontSize * 0.62)) + (paddingX * 2));
        const tagHeight = fontSize + (paddingY * 2);

        this.group.append('rect')
            .attr('x', x - (estimatedTextWidth / 2))
            .attr('y', y - (tagHeight / 2))
            .attr('width', estimatedTextWidth)
            .attr('height', tagHeight)
            .attr('rx', Number.isFinite(cornerRadius) ? cornerRadius : 8)
            .attr('fill', options.fill || this.style.labelFill)
            .attr('opacity', options.opacity ?? 0.97)
            .style('pointer-events', 'none');

        this.group.append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', options.textColor || this.style.labelTextColor)
            .attr('font-size', `${fontSize}px`)
            .attr('font-weight', options.fontWeight || '600')
            .style('pointer-events', 'none')
            .text(tagText);
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
        this.style.stroke = style.stroke || '#7a3ff2';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || 'rgba(122, 63, 242, 0.16)';
        this.style.boundaryDasharray = style.boundaryDasharray || '1,6';
        this.style.boundaryWidth = style.boundaryWidth || 1.5;
        this.style.labelFill = style.labelFill || this.style.stroke;
        this.style.labelTextColor = style.labelTextColor || '#ffffff';
        this.labels = ['A', 'B', 'C', 'D'];
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
        const pointsPx = this.points.map((p) => ({ x: getX(p), y: getY(p) }));
        const lineOpacity = this.style.opacity ?? 1;

        if (pointsPx.length >= 4) {
            const a = pointsPx[0];
            const b = pointsPx[1];
            const c = pointsPx[2];
            const d = pointsPx[3];

            const viewport = this._getViewportXRange(scales, pointsPx);
            const minX = Math.min(a.x, b.x, c.x, d.x);
            const maxX = Math.max(a.x, b.x, c.x, d.x);
            const leftX = viewport ? viewport[0] : minX;
            const rightX = viewport ? viewport[1] : maxX;

            const acDx = c.x - a.x;
            const bdDx = d.x - b.x;
            const directionalBias = acDx + bdDx;
            const projectionToRight = Math.abs(directionalBias) < 0.0001 ? (d.x >= b.x) : (directionalBias > 0);
            const targetX = projectionToRight ? rightX : leftX;

            const apex = this._lineIntersection(a, c, b, d);
            const hasOuterApexOnForwardSide = Boolean(
                apex
                && Number.isFinite(apex.x)
                && Number.isFinite(apex.y)
                && (projectionToRight
                    ? apex.x >= (maxX + 2)
                    : apex.x <= (minX - 2))
            );

            const topRightGuide = hasOuterApexOnForwardSide
                ? apex
                : (this._pointOnLineAtX(a, c, targetX) || { x: c.x, y: c.y });
            const bottomLeftGuide = this._pointOnLineAtX(b, d, a.x) || { x: b.x, y: b.y };
            const bottomRightGuide = hasOuterApexOnForwardSide
                ? apex
                : (this._pointOnLineAtX(b, d, targetX) || { x: d.x, y: d.y });

            // Fill projected outer envelope area.
            const fillPath = `M ${a.x} ${a.y} L ${topRightGuide.x} ${topRightGuide.y} L ${bottomRightGuide.x} ${bottomRightGuide.y} L ${bottomLeftGuide.x} ${bottomLeftGuide.y} Z`;
            this.group.append('path')
                .attr('d', fillPath)
                .attr('fill', this.style.fill)
                .attr('stroke', 'none')
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            // TradingView-like dotted envelope guides.
            this.group.append('line')
                .attr('x1', a.x)
                .attr('y1', a.y)
                .attr('x2', topRightGuide.x)
                .attr('y2', topRightGuide.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.boundaryWidth)
                .attr('stroke-dasharray', this.style.boundaryDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            this.group.append('line')
                .attr('x1', bottomLeftGuide.x)
                .attr('y1', bottomLeftGuide.y)
                .attr('x2', bottomRightGuide.x)
                .attr('y2', bottomRightGuide.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.boundaryWidth)
                .attr('stroke-dasharray', this.style.boundaryDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            // Left vertical connector between upper and lower guides at A.x.
            this.group.append('line')
                .attr('x1', a.x)
                .attr('y1', a.y)
                .attr('x2', bottomLeftGuide.x)
                .attr('y2', bottomLeftGuide.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.boundaryWidth)
                .attr('stroke-dasharray', this.style.boundaryDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            // Inner zig-zag structure A -> B -> C -> D
            [[a, b], [b, c], [c, d]].forEach(([start, end]) => {
                this.group.append('line')
                    .attr('x1', start.x)
                    .attr('y1', start.y)
                    .attr('x2', end.x)
                    .attr('y2', end.y)
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-linejoin', 'round')
                    .attr('stroke-linecap', 'round')
                    .attr('opacity', lineOpacity)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            });
        } else {
            // Preview mode while placing points.
            for (let i = 0; i < pointsPx.length - 1; i++) {
                const start = pointsPx[i];
                const end = pointsPx[i + 1];
                this.group.append('line')
                    .attr('x1', start.x)
                    .attr('y1', start.y)
                    .attr('x2', end.x)
                    .attr('y2', end.y)
                    .attr('stroke', this.style.stroke)
                    .attr('stroke-width', this.style.strokeWidth)
                    .attr('stroke-linejoin', 'round')
                    .attr('stroke-linecap', 'round')
                    .attr('opacity', lineOpacity)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'move');
            }
        }

        pointsPx.forEach((point, index) => {
            const label = this.labels[index];
            if (!label) return;

            const prev = pointsPx[index - 1] || null;
            const next = pointsPx[index + 1] || null;
            let placeAbove = false;

            if (prev && next) {
                placeAbove = point.y <= ((prev.y + next.y) / 2);
            } else if (next) {
                placeAbove = point.y <= next.y;
            } else if (prev) {
                placeAbove = point.y <= prev.y;
            }

            this._drawPointTag(point.x, point.y + (placeAbove ? -20 : 20), label);
        });

        this.createHandles(this.group, scales);
        return this.group;
    }

    _getViewportXRange(scales, pointsPx) {
        const xScale = scales && scales.xScale;
        if (xScale && typeof xScale.range === 'function') {
            const range = xScale.range();
            if (Array.isArray(range) && range.length >= 2) {
                const first = Number(range[0]);
                const last = Number(range[range.length - 1]);
                if (Number.isFinite(first) && Number.isFinite(last)) {
                    return first <= last ? [first, last] : [last, first];
                }
            }
        }

        const chart = (scales && scales.chart) || this.chart || window.chart;
        const chartWidth = Number(chart && (chart.width || (chart.canvas && chart.canvas.width)));
        if (Number.isFinite(chartWidth) && chartWidth > 0) {
            return [0, chartWidth];
        }

        if (Array.isArray(pointsPx) && pointsPx.length >= 2) {
            const xs = pointsPx
                .map(point => Number(point && point.x))
                .filter(x => Number.isFinite(x));

            if (xs.length >= 2) {
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const pad = Math.max(100, (maxX - minX) * 0.6);
                return [minX - pad, maxX + pad];
            }
        }

        return null;
    }

    _pointOnLineAtX(start, end, x) {
        if (!start || !end || !Number.isFinite(x)) return null;

        const dx = end.x - start.x;
        if (Math.abs(dx) < 0.0001) return null;

        const t = (x - start.x) / dx;
        return {
            x,
            y: start.y + ((end.y - start.y) * t)
        };
    }

    _lineIntersection(a1, a2, b1, b2) {
        if (!a1 || !a2 || !b1 || !b2) return null;

        const x1 = Number(a1.x);
        const y1 = Number(a1.y);
        const x2 = Number(a2.x);
        const y2 = Number(a2.y);
        const x3 = Number(b1.x);
        const y3 = Number(b1.y);
        const x4 = Number(b2.x);
        const y4 = Number(b2.y);

        if (![x1, y1, x2, y2, x3, y3, x4, y4].every(Number.isFinite)) return null;

        const denominator = ((x1 - x2) * (y3 - y4)) - ((y1 - y2) * (x3 - x4));
        if (Math.abs(denominator) < 0.000001) return null;

        const det1 = (x1 * y2) - (y1 * x2);
        const det2 = (x3 * y4) - (y3 * x4);

        const px = ((det1 * (x3 - x4)) - ((x1 - x2) * det2)) / denominator;
        const py = ((det1 * (y3 - y4)) - ((y1 - y2) * det2)) / denominator;

        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return { x: px, y: py };
    }

    _drawPointTag(x, y, text) {
        if (!text) return;

        const fontSize = 12;
        const paddingX = 8;
        const paddingY = 4.5;
        const width = Math.max(16, (String(text).length * 7) + (paddingX * 2));
        const height = fontSize + (paddingY * 2);

        this.group.append('rect')
            .attr('x', x - (width / 2))
            .attr('y', y - (height / 2))
            .attr('width', width)
            .attr('height', height)
            .attr('rx', 6)
            .attr('fill', this.style.labelFill)
            .attr('opacity', 0.95)
            .style('pointer-events', 'none');

        this.group.append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', this.style.labelTextColor)
            .attr('font-size', `${fontSize}px`)
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .text(text);
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
        this.style.stroke = style.stroke || '#6f35d7';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.guideDasharray = style.guideDasharray || '2,6';
        this.style.guideWidth = style.guideWidth || 2;
        this.style.ratioFill = style.ratioFill || this.style.stroke;
        this.style.ratioTextColor = style.ratioTextColor || '#ffffff';
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
        const pointsPx = this.points.map((p) => ({ x: getX(p), y: getY(p) }));
        const lineOpacity = this.style.opacity ?? 1;

        // Main zig-zag structure.
        for (let i = 0; i < pointsPx.length - 1; i++) {
            const start = pointsPx[i];
            const end = pointsPx[i + 1];

            this.group.append('line')
                .attr('x1', start.x)
                .attr('y1', start.y)
                .attr('x2', end.x)
                .attr('y2', end.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-linejoin', 'round')
                .attr('stroke-linecap', 'round')
                .attr('opacity', lineOpacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Dotted trend guides and ratios through drive peaks (points 1 -> 3 -> 5).
        // Show progressively so values appear earlier while drawing.
        const peakA = pointsPx[1];
        const peakB = pointsPx[3];
        const peakC = pointsPx[5];

        if (peakA && peakB) {
            this.group.append('line')
                .attr('x1', peakA.x)
                .attr('y1', peakA.y)
                .attr('x2', peakB.x)
                .attr('y2', peakB.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.guideWidth)
                .attr('stroke-dasharray', this.style.guideDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            const drive1 = this._getDriveMagnitude(this.points[0], this.points[1]);
            const drive2 = this._getDriveMagnitude(this.points[2], this.points[3]);
            const ratio12 = this._formatDriveRatio(drive2, drive1);

            if (ratio12) {
                const pos = this._pointOnSegment(peakA, peakB, 0.5);
                const offset = this._getPerpendicularOffset(peakA, peakB, -18);
                this._drawRatioTag(pos.x + offset.x, pos.y + offset.y, ratio12);
            }
        }

        if (peakB && peakC) {
            this.group.append('line')
                .attr('x1', peakB.x)
                .attr('y1', peakB.y)
                .attr('x2', peakC.x)
                .attr('y2', peakC.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.guideWidth)
                .attr('stroke-dasharray', this.style.guideDasharray)
                .attr('stroke-linecap', 'round')
                .attr('opacity', 0.95)
                .style('pointer-events', 'none');

            const drive2 = this._getDriveMagnitude(this.points[2], this.points[3]);
            const drive3 = this._getDriveMagnitude(this.points[4], this.points[5]);
            const ratio23 = this._formatDriveRatio(drive3, drive2);

            if (ratio23) {
                const pos = this._pointOnSegment(peakB, peakC, 0.5);
                const offset = this._getPerpendicularOffset(peakB, peakC, -18);
                this._drawRatioTag(pos.x + offset.x, pos.y + offset.y, ratio23);
            }
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    _getDriveMagnitude(start, end) {
        if (!start || !end) return 0;
        return Math.abs((end.y ?? 0) - (start.y ?? 0));
    }

    _formatDriveRatio(numerator, denominator) {
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) {
            return null;
        }

        const ratio = numerator / denominator;
        return ratio.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    _pointOnSegment(start, end, t = 0.5) {
        return {
            x: start.x + ((end.x - start.x) * t),
            y: start.y + ((end.y - start.y) * t)
        };
    }

    _getPerpendicularOffset(start, end, distance = -18) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt((dx * dx) + (dy * dy));
        if (length < 0.0001) return { x: 0, y: distance };

        return {
            x: (-dy / length) * distance,
            y: (dx / length) * distance
        };
    }

    _drawRatioTag(x, y, text) {
        const value = String(text || '');
        if (!value) return;

        const fontSize = 12;
        const paddingX = 9;
        const paddingY = 4;
        const width = Math.max(34, (value.length * (fontSize * 0.62)) + (paddingX * 2));
        const height = fontSize + (paddingY * 2);

        this.group.append('rect')
            .attr('x', x - (width / 2))
            .attr('y', y - (height / 2))
            .attr('width', width)
            .attr('height', height)
            .attr('rx', 6)
            .attr('fill', this.style.ratioFill)
            .attr('opacity', 0.96)
            .style('pointer-events', 'none');

        this.group.append('text')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', this.style.ratioTextColor)
            .attr('font-size', `${fontSize}px`)
            .attr('font-weight', '600')
            .style('pointer-events', 'none')
            .text(value);
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

function getWaveLabelOffset(points, index, getX, getY, distance = 16) {
    const currentPoint = points[index];
    if (!currentPoint) {
        return { dx: 0, dy: -distance };
    }

    const current = { x: getX(currentPoint), y: getY(currentPoint) };
    const prevPoint = index > 0 ? points[index - 1] : null;
    const nextPoint = index < points.length - 1 ? points[index + 1] : null;

    const toScreen = (point) => ({ x: getX(point), y: getY(point) });
    const prev = prevPoint ? toScreen(prevPoint) : null;
    const next = nextPoint ? toScreen(nextPoint) : null;

    let vx = 0;
    let vy = -1;

    if (prev && next) {
        const midX = (prev.x + next.x) / 2;
        const midY = (prev.y + next.y) / 2;
        vx = current.x - midX;
        vy = current.y - midY;

        if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) {
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            vx = -ty;
            vy = tx;
        }
    } else if (next) {
        const sx = next.x - current.x;
        const sy = next.y - current.y;
        vx = -sy;
        vy = sx;
    } else if (prev) {
        const sx = current.x - prev.x;
        const sy = current.y - prev.y;
        vx = -sy;
        vy = sx;
    }

    const length = Math.hypot(vx, vy);
    if (!length || !Number.isFinite(length)) {
        return { dx: 0, dy: -distance };
    }

    vx /= length;
    vy /= length;

    // Keep some vertical clearance so labels don't sit on sloped line segments.
    if (Math.abs(vy) < 0.35) {
        vy = vy < 0 ? -0.35 : 0.35;
        const xSign = vx < 0 ? -1 : 1;
        vx = xSign * Math.sqrt(1 - (vy * vy));
    }

    return {
        dx: vx * distance,
        dy: vy * distance
    };
}

function appendWaveLabel(group, points, index, label, getX, getY, style, fontSize = '12px') {
    if (!label) return;

    const point = points[index];
    if (!point) return;

    const baseX = getX(point);
    const baseY = getY(point);
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return;

    const offset = getWaveLabelOffset(points, index, getX, getY, 16);

    group.append('text')
        .attr('x', baseX + offset.dx)
        .attr('y', baseY + offset.dy)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', style.stroke)
        .attr('font-size', fontSize)
        .attr('font-weight', 'bold')
        .style('pointer-events', 'none')
        .text(label);
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
            appendWaveLabel(this.group, this.points, i, this.labels[i] || '', getX, getY, this.style, '12px');
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
            appendWaveLabel(this.group, this.points, i, this.labels[i], getX, getY, this.style, '12px');
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
            appendWaveLabel(this.group, this.points, i, this.labels[i], getX, getY, this.style, '12px');
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
            appendWaveLabel(this.group, this.points, i, this.labels[i], getX, getY, this.style, '12px');
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
            appendWaveLabel(this.group, this.points, i, this.labels[i], getX, getY, this.style, '12px');
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
