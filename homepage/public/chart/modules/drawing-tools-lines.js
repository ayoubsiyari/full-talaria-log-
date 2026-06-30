/**
 * Drawing Tools - Line Tools Module
 * Implements: Trendline, Horizontal Line, Vertical Line, Ray
 */

// Helper to append multi-line text labels with shared styling
function appendTextLabel(group, text, config = {}) {
    if (!text || !text.trim()) {
        return null;
    }

    const {
        x = 0,
        y = 0,
        anchor = 'middle',
        fill = '#ffffff',
        color,
        fontSize = 14,
        fontFamily = 'Roboto, sans-serif',
        fontWeight = 'normal',
        fontStyle = 'normal',
        baseline = 'middle',
        yAnchor,
        rotation = 0,
        lineSide = null,
        lineRef = null,
        linePerp = null
    } = config;

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;

    const totalHeight = lines.length * lineHeight;
    const isRotated = rotation !== 0;

    const useCenteredY = isRotated || yAnchor === 'middle';

    // Legacy behavior for non-rotated labels: y is treated like a top reference (via text-before-edge)
    // unless yAnchor:'middle' is explicitly requested.
    const legacyOffset = (!useCenteredY && baseline === 'middle')
        ? -(totalHeight / 2) + (lineHeight / 2)
        : 0;

    const verticalOffset = useCenteredY
        ? -((lines.length - 1) / 2) * lineHeight
        : 0;

    const yPos = useCenteredY ? y : (y + legacyOffset);

    const resolved = resolveDrawingTextStyle(text, fontStyle, fontFamily);

    const textEl = group.append('text')
        .attr('x', x)
        .attr('y', yPos)
        .attr('fill', fill !== undefined ? fill : (color !== undefined ? color : '#ffffff'))
        .attr('font-size', `${fontSize}px`)
        .attr('font-family', resolved.fontFamily)
        .attr('font-weight', fontWeight)
        .attr('font-style', resolved.fontStyle)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', useCenteredY ? 'central' : 'text-before-edge')
        .attr('xml:space', 'preserve')
        .style('pointer-events', 'none')
        .style('user-select', 'none');

    if (resolved.direction) {
        textEl.style('direction', resolved.direction);
        textEl.attr('unicode-bidi', 'plaintext');
    }

    lines.forEach((line, index) => {
        const sanitized = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
        textEl.append('tspan')
            .attr('x', x)
            .attr('dy', index === 0 ? (useCenteredY ? verticalOffset : 0) : lineHeight)
            .text(sanitized);
    });

    let nudgeX = 0;
    let nudgeY = 0;
    if (anchor === 'middle' && resolved.direction === 'rtl') {
        try {
            const bbox = textEl.node().getBBox();
            if (Number.isFinite(bbox.width) && bbox.width > 0) {
                nudgeX = x - (bbox.x + bbox.width / 2);
            }
        } catch (_) { /* ignore measure failures */ }
    }

    if (lineSide && lineRef && linePerp) {
        const interim = buildDrawingTextTransform(x, yPos, rotation, resolved.italicSkew, nudgeX, nudgeY);
        if (interim) textEl.attr('transform', interim);
        const gapNudge = nudgeLineLabelFromStroke(textEl, lineRef, linePerp, fontSize, text, {
            anchorOnStroke: anchor === 'middle' && yAnchor === 'middle' && !!lineSide
        });
        nudgeX += gapNudge.nudgeX;
        nudgeY += gapNudge.nudgeY;
    }

    const transform = buildDrawingTextTransform(x, yPos, rotation, resolved.italicSkew, nudgeX, nudgeY);
    if (transform) {
        textEl.attr('transform', transform);
    }

    return textEl;
}

// Make appendTextLabel globally available for all drawing tools
window.appendTextLabel = appendTextLabel;

/** Gap + RTL extras for line-tool labels (top/bottom of stroke). */
function lineLabelGapConfig(lineX, lineY, textVAlign, perpX, perpY, signUp) {
    const lineSide = resolveLineLabelSide(textVAlign);
    if (!lineSide) return {};
    const linePerp = (perpX != null && perpY != null && signUp != null)
        ? lineLabelPerpTowardText(textVAlign, perpX, perpY, signUp)
        : horizontalLineLabelPerp(textVAlign);
    if (!linePerp) return {};
    return {
        lineSide,
        lineRef: { x: lineX, y: lineY },
        linePerp
    };
}

window.lineLabelGapConfig = lineLabelGapConfig;

const DEFAULT_TEXT_STYLE = {
    fontFamily: 'Roboto, sans-serif',
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#FFFFFF',
    textAlign: 'center',
    textPosition: 'top',
    textOffsetX: 0,
    textOffsetY: -8
};

const TEXT_EDGE_PADDING = 5;

const LINE_LABEL_OFFSET = 14;

const EXTENDED_LINE_TEXT_EDGE_PADDING = 10;

function _lineToolChartBounds(scales) {
    const xRange = scales.xScale.range();
    const yRange = scales.yScale.range();
    const chartLeftX = (scales.chart && scales.chart.margin && typeof scales.chart.margin.l === 'number')
        ? scales.chart.margin.l
        : xRange[0];
    const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
        ? (scales.chart.w - scales.chart.margin.r)
        : xRange[1];
    return { xRange, yRange, chartLeftX, chartRightX };
}

function _lineToolPointToScreen(scales, point) {
    if (!point) return { x: NaN, y: NaN };
    const x = scales.chart && scales.chart.dataIndexToPixel
        ? scales.chart.dataIndexToPixel(point.x)
        : scales.xScale(point.x);
    const y = scales.yScale(point.y);
    return { x, y };
}

function computeRayScreenEndpoints(scales, p1, p2) {
    const { x: x1Screen, y: y1Screen } = _lineToolPointToScreen(scales, p1);
    const { x: x2Screen, y: y2Screen } = _lineToolPointToScreen(scales, p2);
    const { yRange, chartLeftX, chartRightX } = _lineToolChartBounds(scales);
    const dx = x2Screen - x1Screen;
    const dy = y2Screen - y1Screen;
    let extendedX;
    let extendedY;
    if (Math.abs(dx) > 0.001) {
        const slope = dy / dx;
        if (dx > 0) {
            extendedX = chartRightX;
            extendedY = y1Screen + slope * (extendedX - x1Screen);
        } else {
            extendedX = chartLeftX;
            extendedY = y1Screen + slope * (extendedX - x1Screen);
        }
        if (extendedY < yRange[1]) {
            extendedY = yRange[1];
            extendedX = x1Screen + (extendedY - y1Screen) / slope;
        } else if (extendedY > yRange[0]) {
            extendedY = yRange[0];
            extendedX = x1Screen + (extendedY - y1Screen) / slope;
        }
    } else {
        extendedX = x1Screen;
        extendedY = dy > 0 ? yRange[0] : yRange[1];
    }
    return { x1: x1Screen, y1: y1Screen, x2: extendedX, y2: extendedY };
}

function computeExtendedLineScreenEndpoints(scales, p1, p2) {
    const { x: x1Screen, y: y1Screen } = _lineToolPointToScreen(scales, p1);
    const { x: x2Screen, y: y2Screen } = _lineToolPointToScreen(scales, p2);
    const { yRange, chartLeftX, chartRightX } = _lineToolChartBounds(scales);
    const dx = x2Screen - x1Screen;
    const dy = y2Screen - y1Screen;
    let leftX;
    let leftY;
    let rightX;
    let rightY;
    if (Math.abs(dx) > 0.001) {
        const slope = dy / dx;
        leftX = chartLeftX;
        leftY = y1Screen + slope * (leftX - x1Screen);
        rightX = chartRightX;
        rightY = y1Screen + slope * (rightX - x1Screen);
        if (leftY < yRange[1]) {
            leftY = yRange[1];
            leftX = x1Screen + (leftY - y1Screen) / slope;
        } else if (leftY > yRange[0]) {
            leftY = yRange[0];
            leftX = x1Screen + (leftY - y1Screen) / slope;
        }
        if (rightY < yRange[1]) {
            rightY = yRange[1];
            rightX = x1Screen + (rightY - y1Screen) / slope;
        } else if (rightY > yRange[0]) {
            rightY = yRange[0];
            rightX = x1Screen + (rightY - y1Screen) / slope;
        }
    } else {
        leftX = rightX = x1Screen;
        leftY = yRange[0];
        rightY = yRange[1];
    }
    return { x1: leftX, y1: leftY, x2: rightX, y2: rightY };
}

function patchTwoPointLineElements(group, x1, y1, x2, y2) {
    if (!group || group.empty()) return;
    group.selectAll('line').each(function () {
        const el = d3.select(this);
        if (el.attr('x1') == null) return;
        el.attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
    });
}

/** Extend lines cannot be patched with a single segment — needs full re-render. */
function trendlineNeedsFullLivePatch(style, drawing) {
    if (!style) return true;
    if (style.extendLeft || style.extendRight) return true;
    return false;
}

/** Remove on-shape text nodes (not resize handles) before live label sync. */
function removeGroupTextNodes(group) {
    if (!group || group.empty()) return;
    group.selectAll('text').remove();
}

/** Recompute split-label anchor from current endpoints and redraw text during live drag. */
function syncLiveLineTextLabel(tool, scales, screenPts) {
    if (!tool?.group || tool.group.empty() || !tool.text || !String(tool.text).trim()) return;
    if (!tool.points || tool.points.length < 2 || !scales) return;

    let x1;
    let y1;
    let x2;
    let y2;
    if (screenPts && [screenPts.x1, screenPts.y1, screenPts.x2, screenPts.y2].every(Number.isFinite)) {
        ({ x1, y1, x2, y2 } = screenPts);
    } else {
        const p1 = tool.points[0];
        const p2 = tool.points[1];
        x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        y1 = scales.yScale(p1.y);
        x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        y2 = scales.yScale(p2.y);
    }
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;

    removeGroupTextNodes(tool.group);

    const textVAlign = tool.style?.textVAlign || tool.style?.textPosition || 'top';
    if (textVAlign === 'middle' && tool._splitInfo) {
        const rawLX = x1 <= x2 ? x1 : x2;
        const rawLY = x1 <= x2 ? y1 : y2;
        const rawRX = x1 <= x2 ? x2 : x1;
        const rawRY = x1 <= x2 ? y2 : y1;
        const rawDX = rawRX - rawLX;
        const rawDY = rawRY - rawLY;
        const rawLen = Math.sqrt(rawDX * rawDX + rawDY * rawDY) || 1;
        const ux = rawDX / rawLen;
        const uy = rawDY / rawLen;
        const angleDeg = resolveLineLabelReadableAngleDeg(rawDY, rawDX);

        const textHAlign = tool.style?.textHAlign || tool.style?.textAlign || 'center';
        let textX;
        let textY;
        switch (textHAlign) {
            case 'left':
                textX = rawLX + ux * TEXT_EDGE_PADDING;
                textY = rawLY + uy * TEXT_EDGE_PADDING;
                break;
            case 'right':
                textX = rawRX - ux * TEXT_EDGE_PADDING;
                textY = rawRY - uy * TEXT_EDGE_PADDING;
                break;
            default:
                textX = (rawLX + rawRX) / 2;
                textY = (rawLY + rawRY) / 2;
        }
        tool._splitInfo = { ...tool._splitInfo, textX, textY, angle: angleDeg };
    } else if (textVAlign !== 'middle') {
        tool._splitInfo = null;
    }

    if (typeof tool.renderTextLabel === 'function') {
        tool.renderTextLabel({ x1, y1, x2, y2, scales });
    }
}

/** Live patch for single-anchor horizontal tools (horizontal ray) — rebuild line + label in place. */
function liveRenderSingleAnchorHorizontalGeometry(tool, scales) {
    if (!tool?.group || tool.group.empty() || !scales) return false;
    const parent = tool.group.node()?.parentNode;
    if (!parent || typeof tool.render !== 'function') return false;
    tool.render(d3.select(parent), scales, { reuseGroup: true, skipHandles: true });
    if (typeof tool.updateHandlePositions === 'function') {
        tool.updateHandlePositions(scales);
    }
    return true;
}

/** Live patch with centered split label — rebuild line + text in place (keep handles). */
function liveRenderTwoPointDrawingGeometry(tool, scales) {
    if (!tool?.group || tool.group.empty() || !scales) return false;
    const parent = tool.group.node()?.parentNode;
    if (!parent || typeof tool.render !== 'function') return false;
    tool.render(d3.select(parent), scales, { reuseGroup: true, skipHandles: true });
    if (typeof tool.updateHandlePositions === 'function') {
        tool.updateHandlePositions(scales);
    }
    return true;
}

function patchTrendlineArrowHeads(group, origX1, origY1, origX2, origY2, stroke, strokeWidth, scaleFactor, startStyle, endStyle) {
    if (!group || group.empty()) return;
    if (startStyle !== 'arrow' && endStyle !== 'arrow') return;

    const adx = origX2 - origX1;
    const ady = origY2 - origY1;
    const alen = Math.sqrt(adx * adx + ady * ady) || 1;
    const ux = adx / alen;
    const uy = ady / alen;
    const { aLen, aHalf } = BaseDrawing.arrowEndpointMetrics(strokeWidth, scaleFactor);
    const fill = stroke || '#787b86';

    if (startStyle === 'arrow') {
        group.selectAll('polygon.trendline-arrow-start').remove();
        const bx = origX1 + ux * aLen;
        const by = origY1 + uy * aLen;
        const points = `${origX1},${origY1} ${bx - uy * aHalf},${by + ux * aHalf} ${bx + uy * aHalf},${by - ux * aHalf}`;
        group.append('polygon')
            .attr('class', 'trendline-arrow-start')
            .attr('points', points)
            .attr('fill', fill)
            .style('pointer-events', 'none');
    }

    if (endStyle === 'arrow') {
        group.selectAll('polygon.trendline-arrow-end').remove();
        const bx = origX2 - ux * aLen;
        const by = origY2 - uy * aLen;
        const points = `${origX2},${origY2} ${bx - uy * aHalf},${by + ux * aHalf} ${bx + uy * aHalf},${by - ux * aHalf}`;
        group.append('polygon')
            .attr('class', 'trendline-arrow-end')
            .attr('points', points)
            .attr('fill', fill)
            .style('pointer-events', 'none');
    }

    // Legacy saves may have unclassed arrow polygons — remove so only one head shows.
    group.selectAll('polygon:not(.trendline-arrow-start):not(.trendline-arrow-end)').remove();
}

function trendlineArrowHeadLength(strokeWidth, scaleFactor) {
    return BaseDrawing.arrowEndpointMetrics(strokeWidth, scaleFactor).aLen;
}

/** Stop the stroke at arrowhead bases so the line does not run through the triangle tip. */
function trimLineEndpointsForTrendlineArrows(x1, y1, x2, y2, origX1, origY1, origX2, origY2, startStyle, endStyle, strokeWidth, scaleFactor) {
    if (startStyle !== 'arrow' && endStyle !== 'arrow') {
        return { x1, y1, x2, y2 };
    }
    const adx = origX2 - origX1;
    const ady = origY2 - origY1;
    const segLen = Math.sqrt(adx * adx + ady * ady);
    if (!Number.isFinite(segLen) || segLen < 0.5) {
        return { x1, y1, x2, y2 };
    }
    const ux = adx / segLen;
    const uy = ady / segLen;
    const aLen = BaseDrawing.arrowEndpointMetrics(strokeWidth, scaleFactor).aLen;

    let tx1 = x1;
    let ty1 = y1;
    let tx2 = x2;
    let ty2 = y2;

    if (startStyle === 'arrow') {
        const bx = origX1 + ux * aLen;
        const by = origY1 + uy * aLen;
        const d1 = (x1 - origX1) * ux + (y1 - origY1) * uy;
        const d2 = (x2 - origX1) * ux + (y2 - origY1) * uy;
        if (d1 >= -0.5 && d1 <= aLen + 0.5) {
            tx1 = bx;
            ty1 = by;
        } else if (d2 >= -0.5 && d2 <= aLen + 0.5) {
            tx2 = bx;
            ty2 = by;
        }
    }

    if (endStyle === 'arrow') {
        const bx = origX2 - ux * aLen;
        const by = origY2 - uy * aLen;
        const d1 = (x1 - origX2) * ux + (y1 - origY2) * uy;
        const d2 = (x2 - origX2) * ux + (y2 - origY2) * uy;
        if (d1 <= 0.5 && d1 >= -aLen - 0.5) {
            tx1 = bx;
            ty1 = by;
        } else if (d2 <= 0.5 && d2 >= -aLen - 0.5) {
            tx2 = bx;
            ty2 = by;
        }
    }

    return { x1: tx1, y1: ty1, x2: tx2, y2: ty2 };
}

/** Pixel inset from anchor tip so on-line labels clear polygon arrowheads. */
function trendlineEndpointArrowInset(style, scaleFactor, end) {
    if (!style) return 0;
    const startStyle = style.startStyle || 'normal';
    const endStyle = style.endStyle || 'normal';
    const hasArrow = end === 'start' ? startStyle === 'arrow' : endStyle === 'arrow';
    if (!hasArrow) return 0;
    return trendlineArrowHeadLength(style.strokeWidth, scaleFactor) + 4;
}

const TEXT_ALIGN_TO_ANCHOR = {
    left: 'start',
    center: 'middle',
    right: 'end'
};
window.TEXT_ALIGN_TO_ANCHOR = TEXT_ALIGN_TO_ANCHOR;

// ============================================================================
// Trendline Tool
// ============================================================================
class TrendlineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('trendline', points, style);
        this.requiredPoints = 2;
        this.ensureTextDefaults();
        this.ensureEndpointStyleDefaults();
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();
        this.ensureEndpointStyleDefaults();

                if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing trendline', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        let x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let y1 = scales.yScale(p1.y);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        let y2 = scales.yScale(p2.y);

        // Store original coordinates for arrow positioning
        const origX1 = x1;
        const origY1 = y1;
        const origX2 = x2;
        const origY2 = y2;

        // Get chart dimensions from the SVG container
        const svgElement = container.node().ownerSVGElement || container.node();
        const chartWidth = svgElement ? svgElement.clientWidth || svgElement.width.baseVal.value : 1000;
        const chartHeight = svgElement ? svgElement.clientHeight || svgElement.height.baseVal.value : 600;
        
        // Calculate slope (rise over run)
        const dx = origX2 - origX1;
        const dy = origY2 - origY1;
        
        // Determine which point is leftmost and rightmost
        const leftPoint = origX1 < origX2 ? {x: origX1, y: origY1} : {x: origX2, y: origY2};
        const rightPoint = origX1 < origX2 ? {x: origX2, y: origY2} : {x: origX1, y: origY1};
        
        // Extend left: extend from the leftmost point to x = 0
        if (this.style.extendLeft && dx !== 0) {
            const slope = dy / dx;
            const deltaX = 0 - leftPoint.x;
            const deltaY = slope * deltaX;
            // Update the point that's on the left
            if (origX1 < origX2) {
                x1 = 0;
                y1 = leftPoint.y + deltaY;
            } else {
                x2 = 0;
                y2 = leftPoint.y + deltaY;
            }
        } else if (this.style.extendLeft && dx === 0) {
            // Vertical line: extend the topmost point to chart top
            const yRange = scales.yScale.range();
            const topY = Math.min(yRange[0], yRange[1]);
            if (origY1 < origY2) { y1 = topY; } else { y2 = topY; }
        }
        
        // Extend right: extend from the rightmost point to x = chartWidth
        if (this.style.extendRight && dx !== 0) {
            const slope = dy / dx;
            const deltaX = chartWidth - rightPoint.x;
            const deltaY = slope * deltaX;
            // Update the point that's on the right
            if (origX1 < origX2) {
                x2 = chartWidth;
                y2 = rightPoint.y + deltaY;
            } else {
                x1 = chartWidth;
                y1 = rightPoint.y + deltaY;
            }
        } else if (this.style.extendRight && dx === 0) {
            // Vertical line: extend the bottommost point to chart bottom
            const yRange = scales.yScale.range();
            const bottomY = Math.max(yRange[0], yRange[1]);
            if (origY1 > origY2) { y1 = bottomY; } else { y2 = bottomY; }
        }

        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';

        ({
            x1, y1, x2, y2
        } = trimLineEndpointsForTrendlineArrows(
            x1, y1, x2, y2,
            origX1, origY1, origX2, origY2,
            startStyle, endStyle, this.style.strokeWidth, scaleFactor
        ));

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        let textVAlign = String(this.style.textVAlign || this.style.textPosition || 'top').toLowerCase();
        if (textVAlign === 'center') textVAlign = 'middle';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        // Store split info for text rendering
        this._splitInfo = null;
        
        if (shouldSplitLine) {
            // Calculate text position and gap
            const p1 = this.points[0];
            const p2 = this.points[1];
            const origX1 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p1.x) : (scales ? scales.xScale(p1.x) : x1);
            const origY1 = scales ? scales.yScale(p1.y) : y1;
            const origX2 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p2.x) : (scales ? scales.xScale(p2.x) : x2);
            const origY2 = scales ? scales.yScale(p2.y) : y2;
            
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            const textWidth = measureLineLabelTextWidth(this.group, this.text, {
                fontSize,
                fontFamily,
                fontWeight,
                fontStyle
            });
            
            const rawLX = origX1 <= origX2 ? origX1 : origX2;
            const rawLY = origX1 <= origX2 ? origY1 : origY2;
            const rawRX = origX1 <= origX2 ? origX2 : origX1;
            const rawRY = origX1 <= origX2 ? origY2 : origY1;
            const rawDX = rawRX - rawLX;
            const rawDY = rawRY - rawLY;
            const readableAngleDeg = resolveLineLabelReadableAngleDeg(rawDY, rawDX);
            
            // Use exact text width for gap with minimal padding
            const padding = 2;
            const capPad = 2;
            const gapSize = textWidth + (padding * 2) + (capPad * 2);

            const rawLen = Math.sqrt(rawDX * rawDX + rawDY * rawDY) || 1;
            const seg_ux = rawDX / rawLen;
            const seg_uy = rawDY / rawLen;
            const startArrowInset = trendlineEndpointArrowInset(this.style, scaleFactor, 'start');
            const endArrowInset = trendlineEndpointArrowInset(this.style, scaleFactor, 'end');

            // Calculate text/gap position from raw endpoints — no clamping
            let textX, textY;
            switch (textHAlign) {
                case 'left':  textX = rawLX + seg_ux * (TEXT_EDGE_PADDING + capPad + startArrowInset); textY = rawLY + seg_uy * (TEXT_EDGE_PADDING + capPad + startArrowInset); break;
                case 'right': textX = rawRX - seg_ux * (TEXT_EDGE_PADDING + capPad + endArrowInset); textY = rawRY - seg_uy * (TEXT_EDGE_PADDING + capPad + endArrowInset); break;
                default:      textX = (rawLX + rawRX) / 2; textY = (rawLY + rawRY) / 2;
            }

            // Calculate split points based on anchor type so gap covers actual text area
            const halfGap = gapSize / 2;
            let split1X, split1Y, split2X, split2Y;
            switch (textHAlign) {
                case 'left':
                    split1X = startArrowInset > 0
                        ? rawLX + seg_ux * startArrowInset
                        : textX - seg_ux * capPad;
                    split1Y = startArrowInset > 0
                        ? rawLY + seg_uy * startArrowInset
                        : textY - seg_uy * capPad;
                    split2X = textX + seg_ux * (textWidth + padding + capPad);
                    split2Y = textY + seg_uy * (textWidth + padding + capPad);
                    break;
                case 'right':
                    split1X = textX - seg_ux * (textWidth + padding + capPad);
                    split1Y = textY - seg_uy * (textWidth + padding + capPad);
                    split2X = endArrowInset > 0
                        ? rawRX - seg_ux * endArrowInset
                        : textX + seg_ux * capPad;
                    split2Y = endArrowInset > 0
                        ? rawRY - seg_uy * endArrowInset
                        : textY + seg_uy * capPad;
                    break;
                default:
                    split1X = textX - seg_ux * halfGap;
                    split1Y = textY - seg_uy * halfGap;
                    split2X = textX + seg_ux * halfGap;
                    split2Y = textY + seg_uy * halfGap;
            }
            
            // Store split info for text rendering to use
            this._splitInfo = {
                textX: textX,
                textY: textY,
                angle: readableAngleDeg,
                gapSize: gapSize,
                split1X: split1X,
                split1Y: split1Y,
                split2X: split2X,
                split2Y: split2Y
            };
            
            // Route each segment to the nearest gap boundary.
            // split1X/split1Y = left side of gap, split2X/split2Y = right side.
            // When flipped (x1 on right side), swap so each segment ends at its nearest boundary.
            const flipped = origX1 > origX2;
            const gapNearX1 = flipped ? split2X : split1X;
            const gapNearY1 = flipped ? split2Y : split1Y;
            const gapNearX2 = flipped ? split1X : split2X;
            const gapNearY2 = flipped ? split1Y : split2Y;

            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', gapNearX1)
                .attr('y2', gapNearY1)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment (from start to gap)
            const line1 = this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', gapNearX1)
                .attr('y2', gapNearY1)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('shape-rendering', 'geometricPrecision')
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('x1', gapNearX2)
                .attr('y1', gapNearY2)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment (from gap to end)
            const line2 = this.group.append('line')
                .attr('x1', gapNearX2)
                .attr('y1', gapNearY2)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('shape-rendering', 'geometricPrecision')
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Arrow polygons are drawn below at original anchor points
        } else {
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
            
            // Draw the line normally (no split)
            const line = this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('shape-rendering', 'geometricPrecision')
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Arrow polygons are drawn below at original anchor points
        }

        // Draw arrowheads fixed at the original anchor points (not at extended ends)
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const adx = origX2 - origX1;
            const ady = origY2 - origY1;
            const alen = Math.sqrt(adx * adx + ady * ady) || 1;
            const ux = adx / alen;
            const uy = ady / alen;
            const { aLen, aHalf } = BaseDrawing.arrowEndpointMetrics(this.style.strokeWidth, scaleFactor);

            if (startStyle === 'arrow') {
                // Tip at p1, base points towards p2
                const bx = origX1 + ux * aLen;
                const by = origY1 + uy * aLen;
                this.group.append('polygon')
                    .attr('class', 'trendline-arrow-start')
                    .attr('points', `${origX1},${origY1} ${bx - uy * aHalf},${by + ux * aHalf} ${bx + uy * aHalf},${by - ux * aHalf}`)
                    .attr('fill', this.style.stroke)
                    .style('pointer-events', 'none');
            }

            if (endStyle === 'arrow') {
                // Tip at p2, base points towards p1
                const bx = origX2 - ux * aLen;
                const by = origY2 - uy * aLen;
                this.group.append('polygon')
                    .attr('class', 'trendline-arrow-end')
                    .attr('points', `${origX2},${origY2} ${bx - uy * aHalf},${by + ux * aHalf} ${bx + uy * aHalf},${by - ux * aHalf}`)
                    .attr('fill', this.style.stroke)
                    .style('pointer-events', 'none');
            }
        }

        this.renderTextLabel({ x1: origX1, y1: origY1, x2: origX2, y2: origY2, scales });
        
        // Render info box if enabled
        this.renderInfoBox(origX1, origY1, origX2, origY2, scales);

        // Create resize handles
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    patchPanZoomGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        return this._patchLiveTwoPointGeometry(scales);
    }

    _patchLiveTwoPointGeometry(scales) {
        if (trendlineNeedsFullLivePatch(this.style, this)) return false;
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return false;

        const hasText = this.text && String(this.text).trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        if (shouldSplitLine) {
            return liveRenderTwoPointDrawingGeometry(this, scales);
        }

        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        const scaleFactor = typeof this.getZoomScaleFactor === 'function'
            ? this.getZoomScaleFactor(scales)
            : 1;
        const trimmed = trimLineEndpointsForTrendlineArrows(
            x1, y1, x2, y2,
            x1, y1, x2, y2,
            startStyle, endStyle, this.style.strokeWidth, scaleFactor
        );
        patchTwoPointLineElements(this.group, trimmed.x1, trimmed.y1, trimmed.x2, trimmed.y2);

        patchTrendlineArrowHeads(
            this.group,
            x1, y1, x2, y2,
            this.style.stroke,
            this.style.strokeWidth,
            scaleFactor,
            startStyle,
            endStyle
        );

        this.group.selectAll('.trendline-info').remove();
        this.renderInfoBox(x1, y1, x2, y2, scales);
        syncLiveLineTextLabel(this, scales, { x1, y1, x2, y2 });

        if (typeof this.updateHandlePositions === 'function') {
            this.updateHandlePositions(scales);
        }
        return true;
    }
    
    renderInfoBox(x1, y1, x2, y2, scales) {
        const infoSettings = this.style.infoSettings || {};
        if (!infoSettings.showInfo) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const fontFamily = 'system-ui, -apple-system, sans-serif';

        // Metrics
        const rawPriceChange = p2.y - p1.y;
        const absPrice = Math.abs(rawPriceChange);
        const pct = p1.y !== 0 ? (rawPriceChange / p1.y * 100) : 0;
        const tickSize = (scales && scales.chart && scales.chart.tickSize) ? scales.chart.tickSize : 0.0001;
        const pips = tickSize ? Math.round(rawPriceChange / tickSize) : 0;
        const decimals = absPrice < 0.001 ? 5 : absPrice < 0.1 ? 4 : absPrice < 10 ? 3 : 2;
        const barsRange = Math.round(Math.abs(p2.x - p1.x));
        const pixelDist = Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)));
        const angleDeg = (Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI).toFixed(2);

        let timeStr = '';
        const _chart = scales && scales.chart;
        if (_chart && _chart.data && _chart.data.length > 0) {
            const _data = _chart.data;
            const _i1 = Math.max(0, Math.min(Math.round(p1.x), _data.length - 1));
            const _i2 = Math.max(0, Math.min(Math.round(p2.x), _data.length - 1));
            const _diffMs = Math.abs(_data[_i2].t - _data[_i1].t);
            const _totalMins = Math.round(_diffMs / 60000);
            const _days = Math.floor(_totalMins / 1440);
            const _hours = Math.floor((_totalMins % 1440) / 60);
            const _mins = _totalMins % 60;
            if (_days > 0) timeStr = _hours > 0 ? `${_days}d ${_hours}h` : `${_days}d`;
            else if (_hours > 0) timeStr = _mins > 0 ? `${_hours}h ${_mins}m` : `${_hours}h`;
            else timeStr = `${_totalMins}m`;
        }

        // Build rows with SVG icons - each stat on separate line
        const rows = [];
        
        // Price range row
        if (infoSettings.priceRange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${rawPriceChange.toFixed(decimals)}`
            });
        }

        // Percent change row
        if (infoSettings.percentChange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 13L13 3M5 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `(${pct.toFixed(2)}%)`
            });
        }

        // Change in pips row
        if (infoSettings.changeInPips) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="4" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/>',
                text: `${Math.abs(pips).toLocaleString()}`
            });
        }

        // Bars range row
        if (infoSettings.barsRange) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 8h12M11 5l3 3-3 3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${barsRange} bars`
            });
        }

        // Date/time range row
        if (infoSettings.dateTimeRange && timeStr) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6" stroke="currentColor" fill="none" stroke-width="0.5"/><path d="M8 4v4l3 2" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `(${timeStr})`
            });
        }

        // Distance row
        if (infoSettings.distance) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 8h12M4 6v4M8 6v4M12 6v4" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `distance: ${pixelDist} px`
            });
        }

        // Angle row
        if (infoSettings.angle) {
            rows.push({ 
                svgIcon: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M12 4L4 12M12 4v5M12 4h-5" stroke="currentColor" fill="none" stroke-width="0.5"/><path d="M9 7a3 3 0 0 0 3-3" stroke="currentColor" fill="none" stroke-width="0.5"/>',
                text: `${angleDeg}°`
            });
        }

        if (rows.length === 0) return;

        // Layout constants
        const padX = 10, padY = 8, lineHeight = 19, fontSize = 11;
        const iconColW = 14, iconTextGap = 6;

        // Measure max text width
        const tempG = this.group.append('g').style('visibility', 'hidden');
        let maxTW = 0;
        rows.forEach(row => {
            const t = tempG.append('text').attr('font-size', fontSize).attr('font-family', fontFamily).text(row.text);
            const w = t.node().getComputedTextLength ? t.node().getComputedTextLength() : row.text.length * fontSize * 0.6;
            if (w > maxTW) maxTW = w;
        });
        tempG.remove();

        const boxWidth = padX + iconColW + iconTextGap + maxTW + padX;
        const boxHeight = rows.length * lineHeight + padY * 2;

        // Place box at line midpoint, offset perpendicular to the line — closest possible without overlap
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Two perpendicular unit vectors (CCW and CW 90°)
        const pAx = -uy, pAy = ux;
        const pBx =  uy, pBy = -ux;
        // Prefer the direction that points more upward (smaller y in screen space)
        const perp = (pAy <= pBy) ? { x: pAx, y: pAy } : { x: pBx, y: pBy };
        // Gap = rectangle support function in perp direction + clearance
        // This ensures no corner of the axis-aligned box touches the line at any angle
        const gap = Math.abs(uy) * boxWidth / 2 + Math.abs(ux) * boxHeight / 2 + 12;
        // Position box center at p2 offset perpendicularly away from the line
        const centerX = x2 + perp.x * gap;
        const centerY = y2 + perp.y * gap;
        const boxX = centerX - boxWidth / 2;
        const boxY = centerY - boxHeight / 2;

        const infoGroup = this.group.append('g')
            .attr('class', 'trendline-info')
            .attr('transform', `translate(${boxX}, ${boxY})`);

        infoGroup.append('rect')
            .attr('x', 0).attr('y', 0)
            .attr('width', boxWidth).attr('height', boxHeight)
            .attr('fill', 'rgba(210, 215, 225, 0.97)')
            .attr('stroke', 'rgba(160, 165, 185, 0.8)')
            .attr('stroke-width', 1)
            .attr('rx', 4);

        rows.forEach((row, i) => {
            const rowY = padY + (i + 0.78) * lineHeight;
            
            // Render SVG icon if available
            if (row.svgIcon) {
                const iconG = infoGroup.append('g')
                    .attr('transform', `translate(${padX}, ${rowY - 9})`);
                iconG.html(row.svgIcon);
                iconG.select('svg')
                    .attr('stroke', '#4a5068')
                    .style('color', '#4a5068')
                    .style('overflow', 'visible');
            }
            
            // Render text
            infoGroup.append('text')
                .attr('x', padX + iconColW + iconTextGap)
                .attr('y', rowY)
                .attr('fill', '#1e2235')
                .attr('font-size', `${fontSize}px`)
                .attr('font-family', fontFamily)
                .text(row.text);
        });
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // On-line split: place text in the gap (same path as ray / extended-line)
        if (this._splitInfo) {
            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0 : this.style.textOffsetY;
            const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            let labelAnchor = 'middle';
            switch (textHAlign) {
                case 'left':  labelAnchor = resolveLineEndpointSvgAnchor('left', label); break;
                case 'right': labelAnchor = resolveLineEndpointSvgAnchor('right', label); break;
            }

            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + offsetX,
                y: this._splitInfo.textY + offsetY,
                anchor: labelAnchor,
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: this._splitInfo.angle
            });
            return;
        }

        // Use the pixel coords passed in directly (computed in render() from dataIndexToPixel)
        const { scales } = coords;
        const x1 = coords.x1;
        const y1 = coords.y1;
        const x2 = coords.x2;
        const y2 = coords.y2;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        const xRange2 = scales && scales.xScale ? scales.xScale.range() : null;
        const vLeft  = xRange2 ? xRange2[0] : 0;
        const vRight = xRange2 ? xRange2[1] : 99999;

        const rawLX = x1 <= x2 ? x1 : x2;
        const rawLY = x1 <= x2 ? y1 : y2;
        const rawRX = x1 <= x2 ? x2 : x1;
        const rawRY = x1 <= x2 ? y2 : y1;
        const rawDX = rawRX - rawLX;
        const rawDY = rawRY - rawLY;

        // Readable rotation + perpendicular in the same frame (matches horizontal-line gap math)
        const renderAngleDeg = resolveLineLabelReadableAngleDeg(rawDY, rawDX);
        const angle = renderAngleDeg;
        const labelPerp = lineLabelPerpFromAngleDeg(renderAngleDeg);
        const perpX = labelPerp.x;
        const perpY = labelPerp.y;
        const signUp = perpY <= 0 ? 1 : -1;

        // Clamp left endpoint to visLeft
        let segLX = rawLX, segLY = rawLY;
        if (rawDX !== 0 && rawLX < vLeft) {
            const f = (vLeft - rawLX) / rawDX;
            segLX = vLeft;
            segLY = rawLY + f * rawDY;
        }
        // Clamp right endpoint to visRight
        let segRX = rawRX, segRY = rawRY;
        if (rawDX !== 0 && rawRX > vRight) {
            const f = (vRight - rawLX) / rawDX;
            segRX = vRight;
            segRY = rawLY + f * rawDY;
        }

        // Actual line unit vector (direction never changes with clipping)
        const rawLen = Math.sqrt(rawDX * rawDX + rawDY * rawDY) || 1;
        const line_ux = rawDX / rawLen;
        const line_uy = rawDY / rawLen;
        const labelScaleFactor = typeof this.getZoomScaleFactor === 'function'
            ? this.getZoomScaleFactor(scales)
            : 1;
        const startArrowInset = trendlineEndpointArrowInset(this.style, labelScaleFactor, 'start');
        const endArrowInset = trendlineEndpointArrowInset(this.style, labelScaleFactor, 'end');

        // Use raw (actual data-point) positions — no clamping to visible boundaries.
        // Text moves exactly with the line. When the endpoint is off-screen the text
        // is also off-screen (clipped by the SVG clip-path) — same as the line itself.
        const EDGE = 5;
        let baseX, baseY;
        let labelAnchor;
        switch (textHAlign) {
            case 'left':
                baseX = rawLX + line_ux * (EDGE + startArrowInset);
                baseY = rawLY + line_uy * (EDGE + startArrowInset);
                labelAnchor = resolveLineEndpointSvgAnchor('left', label);
                break;
            case 'right':
                baseX = rawRX - line_ux * (EDGE + endArrowInset);
                baseY = rawRY - line_uy * (EDGE + endArrowInset);
                labelAnchor = resolveLineEndpointSvgAnchor('right', label);
                break;
            default:
                baseX = (rawLX + rawRX) / 2;
                baseY = (rawLY + rawRY) / 2;
                labelAnchor = 'middle';
                break;
        }

        // Don't render if text position is outside the visible chart area
        // (prevents partial-clip "empty place" artifact in the price axis)
        if (baseX < vLeft || baseX > vRight) return;

        const rawOffsetX = (this.style.textOffsetX === undefined || this.style.textOffsetX === null)
            ? 0
            : this.style.textOffsetX;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetX = rawOffsetX === DEFAULT_TEXT_STYLE.textOffsetX ? 0 : rawOffsetX;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: labelAnchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle,
            ...lineLabelGapConfig(baseX, baseY, textVAlign, perpX, perpY, signUp)
        });
    }

    renderLineEndings(x1, y1, x2, y2) {
        // Arrow endings are now handled via SVG markers on the line element itself
        // This method is kept for potential future circle endings or other styles
    }

    update(points) {
        super.update(points);
    }

    static fromJSON(data) {
        const tool = new TrendlineTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Horizontal Line Tool
// ============================================================================
class HorizontalLineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('horizontal', points, style);
        this.requiredPoints = 1;
        
        // Set default dash array for dotted line (like TradingView)
        if (this.style.dashArray === undefined) {
            this.style.dashArray = '3,3'; // Dotted pattern
        }
        
        // Enable price label by default
        if (this.style.showPriceLabel === undefined) {
            this.style.showPriceLabel = true;
        }
        
        this.ensureTextDefaults();
        if (this.style.textOffsetY === undefined) {
            this.style.textOffsetY = -10;
            this._isDefaultTextOffsetY = true;
        } else {
            this._isDefaultTextOffsetY = false;
        }
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();

                if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing horizontal-line', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const xRange = scales.xScale.range();
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        // Convert data index to screen position
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        this._splitInfo = null;
        
        if (shouldSplitLine) {
            // Calculate text position
            const y = scales.yScale(p.y);
            
            // Measure text width first
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            
            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);
            
            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();
            
            const padding = 10; // Small space on each side of text
            const edgePadding = TEXT_EDGE_PADDING; // Distance from edges
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            // fixed 30px from endpoint, clamped so gap stays on line
            const HL_EDGE_S = 30;
            const hl_lineLen = xRange[1] - xRange[0];
            let hl_rawTextX;
            switch (textHAlign) {
                case 'left':  hl_rawTextX = xRange[0] + HL_EDGE_S; break;
                case 'right': hl_rawTextX = xRange[1] - HL_EDGE_S; break;
                default:      hl_rawTextX = (xRange[0] + xRange[1]) / 2;
            }
            const textX = Math.max(xRange[0] + gapSize/2, Math.min(xRange[1] - gapSize/2, hl_rawTextX));
            const split1X = Math.max(xRange[0], textX - gapSize / 2);
            const split2X = Math.min(xRange[1], textX + gapSize / 2);
            
            this._splitInfo = {
                textX: textX,
                textY: y,
                angle: 0,
                gapSize: gapSize
            };
            
            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('x1', xRange[0])
                .attr('y1', y)
                .attr('x2', split1X)
                .attr('y2', y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment
            this.group.append('line')
                .attr('x1', xRange[0])
                .attr('y1', y)
                .attr('x2', split1X)
                .attr('y2', y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', y)
                .attr('x2', xRange[1])
                .attr('y2', y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', y)
                .attr('x2', xRange[1])
                .attr('y2', y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw invisible wider stroke for easier clicking
            this.group.append('line')
                .attr('x1', xRange[0])
                .attr('y1', scales.yScale(p.y))
                .attr('x2', xRange[1])
                .attr('y2', scales.yScale(p.y))
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw horizontal line normally
            this.group.append('line')
                .attr('x1', xRange[0])
                .attr('y1', scales.yScale(p.y))
                .attr('x2', xRange[1])
                .attr('y2', scales.yScale(p.y))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        // Render price label on the right side (if enabled)
        if (this.style.showPriceLabel !== false) {
            this.renderPriceLabel(scales, xRange, p);
        }

        // Render custom text label if provided
        this.renderTextLabel(scales, xRange, p);

        if (this._shouldCreateHandles(renderOpts)) {
            this._recreateDirectResizeHandles(scales);
        }

        return this.group;
    }

    _recreateDirectResizeHandles(scales) {
        if (!this.group || this.group.empty()) return;
        this._clearDirectResizeHandles();
        const pos = this._getHandleScreenPosition(scales);
        if (!pos) return;
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const hitRadius = 12;
        this.group.append('circle')
            .attr('class', 'resize-handle-hit')
            .attr('cx', pos.cx)
            .attr('cy', pos.cy)
            .attr('r', hitRadius)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all')
            .style('opacity', 0)
            .attr('data-point-index', 0);
        this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', pos.cx)
            .attr('cy', pos.cy)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
    }

    _getHandleScreenPosition(scales) {
        const p = this.points && this.points[0];
        if (!p || !scales || !scales.xScale) return null;
        const xRange = scales.xScale.range();
        const cy = scales.yScale(p.y);
        if (!Number.isFinite(cy)) return null;
        return { cx: (xRange[0] + xRange[1]) / 2, cy };
    }

    updateHandlePositions(scales) {
        const pos = this._getHandleScreenPosition(scales);
        if (pos) this.syncDirectPointHandleDom(scales, 0, pos);
    }

    patchLiveAnchorGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points?.[0] || !scales) return false;
        const p = this.points[0];
        const y = scales.yScale(p.y);
        if (!Number.isFinite(y)) return false;
        this.group.selectAll('line').each(function () {
            const el = d3.select(this);
            if (el.attr('y1') == null) return;
            el.attr('y1', y).attr('y2', y);
        });
        const pos = this._getHandleScreenPosition(scales);
        if (pos) this.syncDirectPointHandleDom(scales, 0, pos);
        return true;
    }

    renderPriceLabel(scales, xRange, point) {
        // Format price value using the chart's instrument-aware decimal count (NQ=2,
        // GC=1, CL=2, FX=5, etc.). Falls back to 5 only for unknown symbols so we
        // never show stale `1340.41268` style over-precision on futures/indices.
        const priceValue = point?.y;
        if (priceValue === undefined || priceValue === null) return;
        const chart = scales?.chart || this.chart;
        let decimals = 5;
        if (chart && typeof chart.getPriceDecimals === 'function') {
            const dom = chart.yScale && chart.yScale.domain ? chart.yScale.domain() : null;
            const range = Array.isArray(dom) && dom.length === 2 ? Math.abs(dom[1] - dom[0]) : 0;
            const d = chart.getPriceDecimals(range);
            if (Number.isFinite(d) && d >= 0) decimals = d;
        }
        const formattedPrice = priceValue.toFixed(decimals);
        
        const y = scales.yScale(point.y);
        const labelX = xRange[1] - 5; // Position near right edge
        
        // Create label group
        const labelGroup = this.group.append('g')
            .attr('class', 'price-label');
        
        // Create temporary text to measure size
        const tempText = labelGroup.append('text')
            .attr('x', labelX)
            .attr('y', y)
            .attr('font-family', 'Roboto, sans-serif')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .text(formattedPrice)
            .style('visibility', 'hidden');
        
        const bbox = tempText.node().getBBox();
        tempText.remove();
        
        const padding = 6;
        const rectWidth = bbox.width + padding * 2;
        const rectHeight = 20;
        
        // Draw background rectangle
        labelGroup.append('rect')
            .attr('x', labelX - rectWidth)
            .attr('y', y - rectHeight / 2)
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('fill', this.style.stroke || '#089981')
            .attr('rx', 2)
            .style('pointer-events', 'none');
        
        // Draw price text
        labelGroup.append('text')
            .attr('x', labelX - rectWidth / 2)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-family', 'Roboto, sans-serif')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .attr('fill', '#FFFFFF')
            .text(formattedPrice)
            .style('pointer-events', 'none');
    }

    renderTextLabel(scales, xRange, point) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // If we have split info, use it for exact positioning
        if (this._splitInfo) {
            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0
                : this.style.textOffsetY;
            const offsetY = (rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY || (this._isDefaultTextOffsetY && rawOffsetY === -10))
                ? 0
                : rawOffsetY;
            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + offsetX,
                y: this._splitInfo.textY + offsetY,
                anchor: 'middle',
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: 0
            });
            return;
        }

        const y = scales.yScale(point.y);
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
        
        const chartLeftX = (scales.chart && scales.chart.margin && typeof scales.chart.margin.l === 'number')
            ? scales.chart.margin.l : xRange[0];
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r) : xRange[1];

        let baseX;
        let hlAnchor;
        switch (textHAlign) {
            case 'left':
                baseX = chartLeftX + TEXT_EDGE_PADDING;
                hlAnchor = resolveLineEndpointSvgAnchor('left', label);
                break;
            case 'right':
                baseX = chartRightX - TEXT_EDGE_PADDING;
                hlAnchor = resolveLineEndpointSvgAnchor('right', label);
                break;
            default:
                baseX = (chartLeftX + chartRightX) / 2;
                hlAnchor = 'middle';
        }
        
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: y,
            anchor: hlAnchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize, 
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            ...lineLabelGapConfig(baseX, y, textVAlign)
        });
    }

    static fromJSON(data) {
        const tool = new HorizontalLineTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Vertical Line Tool
// ============================================================================
class VerticalLineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('vertical', points, style);
        this.requiredPoints = 1;
        this.ensureTextDefaults();
        // Vertical line defaults: text at top, on right side
        if (this.style.textPosition === undefined) {
            this.style.textPosition = 'top';
            this.style.textVAlign = 'top';
        }
        if (this.style.textOffsetY === undefined) {
            this.style.textOffsetY = 0;
        }
        if (this.style.textAlign === undefined) {
            this.style.textAlign = 'center';
            this.style.textHAlign = 'center';
        }
        if (this.style.textOrientation === undefined) {
            this.style.textOrientation = 'horizontal';
        }
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
                if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing vertical-line', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const yRange = scales.yScale.range();

        // Convert data index to screen position
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);

        // Check if text should be ON the line (needs gap)
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
        // When center-aligned, the label should be on the line for top/middle/bottom
        // and we should hide the line behind the label by creating a gap.
        const textOnLine = hasText && textHAlign === 'center';
        
        const topY = Math.min(yRange[0], yRange[1]);
        const bottomY = Math.max(yRange[0], yRange[1]);
        
        if (textOnLine) {
            // Measure text to create gap
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            
            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);
            
            const textBBox = tempText.node().getBBox();
            const textOrientation = this.style.textOrientation || 'horizontal';
            const gapMeasure = textOrientation === 'vertical' ? textBBox.width : textBBox.height;
            tempText.remove();
            
            const padding = 10 + Math.max(0, fontSize / 2 - 6);
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = gapMeasure + (padding * 2) + (capPad * 2);

            // Place the gap at the label's actual Y position (top/middle/bottom + offsets)
            let labelY;
            switch (textVAlign) {
                case 'top':
                    labelY = topY + LINE_LABEL_OFFSET;
                    break;
                case 'bottom':
                    labelY = bottomY - LINE_LABEL_OFFSET;
                    break;
                default:
                    labelY = (topY + bottomY) / 2;
            }

            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0
                : this.style.textOffsetY;
            const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;
            labelY = labelY + offsetY;

            // Clamp gap center to same bounds renderTextLabel uses, so gap & text always align
            const halfGap = gapMeasure / 2;
            const clampPad = 10;
            labelY = Math.max(topY + halfGap + clampPad, Math.min(bottomY - halfGap - clampPad, labelY));

            const split1Y = labelY - (gapSize / 2);
            const split2Y = labelY + (gapSize / 2);

            // Draw invisible wider stroke for easier clicking (top segment)
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', topY)
                .attr('x2', x)
                .attr('y2', split1Y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment (top)
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', topY)
                .attr('x2', x)
                .attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');

            // Draw invisible wider stroke for easier clicking (bottom segment)
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', split2Y)
                .attr('x2', x)
                .attr('y2', bottomY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment (bottom)
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', split2Y)
                .attr('x2', x)
                .attr('y2', bottomY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw invisible wider stroke for easier clicking
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', yRange[0])
                .attr('x2', x)
                .attr('y2', yRange[1])
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw full vertical line
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', yRange[0])
                .attr('x2', x)
                .attr('y2', yRange[1])
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        this.renderTextLabel(scales, x, yRange);

        if (this._shouldCreateHandles(renderOpts)) {
            this._recreateDirectResizeHandles(scales, x);
        }

        return this.group;
    }

    _recreateDirectResizeHandles(scales, anchorX) {
        if (!this.group || this.group.empty()) return;
        this._clearDirectResizeHandles();
        const pos = this._getHandleScreenPosition(scales, anchorX);
        if (!pos) return;
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const hitRadius = 12;
        this.group.append('circle')
            .attr('class', 'resize-handle-hit')
            .attr('cx', pos.cx)
            .attr('cy', pos.cy)
            .attr('r', hitRadius)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('cursor', 'ew-resize')
            .style('pointer-events', 'all')
            .style('opacity', 0)
            .attr('data-point-index', 0);
        this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', pos.cx)
            .attr('cy', pos.cy)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'ew-resize')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
    }

    _getHandleScreenPosition(scales, anchorX) {
        const p = this.points && this.points[0];
        if (!p || !scales || !scales.yScale) return null;
        const cx = Number.isFinite(anchorX)
            ? anchorX
            : (scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p.x)
                : scales.xScale(p.x));
        const yRange = scales.yScale.range();
        const cy = (yRange[0] + yRange[1]) / 2;
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
        return { cx, cy };
    }

    updateHandlePositions(scales) {
        const pos = this._getHandleScreenPosition(scales);
        if (pos) this.syncDirectPointHandleDom(scales, 0, pos);
    }

    patchLiveAnchorGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points?.[0] || !scales) return false;
        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        if (!Number.isFinite(x)) return false;
        this.group.selectAll('line').each(function () {
            const el = d3.select(this);
            if (el.attr('x1') == null) return;
            el.attr('x1', x).attr('x2', x);
        });
        const pos = this._getHandleScreenPosition(scales, x);
        if (pos) this.syncDirectPointHandleDom(scales, 0, pos);
        return true;
    }

    renderTextLabel(scales, x, yRange) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
        const textOrientation = this.style.textOrientation || 'horizontal';
        const rotation = textOrientation === 'vertical' ? 90 : 0;
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        const fontFamily = this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily;
        const fontWeight = this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight;
        const fontStyle = this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle;
        const textLines = label.split('\n');
        const lineHeight = fontSize * 1.2;
        const totalHeight = textLines.length * lineHeight;
        const xRange = scales && scales.xScale ? scales.xScale.range() : [0, 0];
        const leftX = Math.min(xRange[0], xRange[1]);
        const rightX = Math.max(xRange[0], xRange[1]);

        // Get Y range bounds
        const topY = Math.min(yRange[0], yRange[1]);
        const bottomY = Math.max(yRange[0], yRange[1]);
        
        // textVAlign controls position along the vertical line (top/middle/bottom)
        let baseY;
        switch (textVAlign) {
            case 'top':
                baseY = topY + LINE_LABEL_OFFSET;
                break;
            case 'bottom':
                baseY = bottomY - LINE_LABEL_OFFSET;
                break;
            default: // middle
                baseY = (topY + bottomY) / 2;
        }

        const measureStyle = resolveDrawingTextStyle(label, fontStyle, fontFamily);
        const tempText = this.group.append('text')
            .attr('font-size', fontSize)
            .attr('font-family', measureStyle.fontFamily)
            .attr('font-weight', fontWeight)
            .attr('font-style', measureStyle.fontStyle)
            .attr('text-anchor', 'middle')
            .style('visibility', 'hidden')
            .style('pointer-events', 'none');
        if (measureStyle.direction) {
            tempText.style('direction', measureStyle.direction);
        }

        let maxTextWidth = 0;
        for (const line of textLines) {
            tempText.text(line && line.length ? line : ' ');
            const bbox = tempText.node().getBBox();
            maxTextWidth = Math.max(maxTextWidth, bbox.width || 0);
        }
        tempText.remove();

        const clampPad = 10;
        const halfY = rotation === 0 ? (totalHeight / 2) : (maxTextWidth / 2);
        baseY = Math.max(topY + halfY + clampPad, Math.min(bottomY - halfY - clampPad, baseY));
        
        let baseX = x;
        let anchor = 'middle';
        let gapCfg = {};

        if (textVAlign === 'middle') {
            if (textHAlign === 'left') {
                anchor = resolveVerticalLineSvgAnchor('left', label);
                gapCfg = { lineSide: 'above', lineRef: { x, y: baseY }, linePerp: { x: -1, y: 0 } };
            } else if (textHAlign === 'right') {
                anchor = resolveVerticalLineSvgAnchor('right', label);
                gapCfg = { lineSide: 'above', lineRef: { x, y: baseY }, linePerp: { x: 1, y: 0 } };
            }
        } else {
            if (textHAlign === 'center') {
                anchor = 'middle';
            } else if (textHAlign === 'left') {
                anchor = resolveVerticalLineSvgAnchor('left', label);
                gapCfg = { lineSide: 'above', lineRef: { x, y: baseY }, linePerp: { x: -1, y: 0 } };
            } else {
                anchor = resolveVerticalLineSvgAnchor('right', label);
                gapCfg = { lineSide: 'above', lineRef: { x, y: baseY }, linePerp: { x: 1, y: 0 } };
            }
        }

        if (rotation !== 0) {
            anchor = 'middle';
            gapCfg = {};
        }

        const rawOffsetX = (this.style.textOffsetX === undefined || this.style.textOffsetX === null)
            ? 0
            : this.style.textOffsetX;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetX = rawOffsetX === DEFAULT_TEXT_STYLE.textOffsetX ? 0 : rawOffsetX;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        baseX = baseX + offsetX;
        baseY = baseY + offsetY;

        appendTextLabel(this.group, label, {
            x: baseX,
            y: baseY,
            anchor: anchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            rotation: rotation,
            ...gapCfg
        });
    }

    static fromJSON(data) {
        const tool = new VerticalLineTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Ray Tool (extends infinitely in one direction)
// ============================================================================
class RayTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('ray', points, style);
        this.requiredPoints = 2;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing ray', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert to screen coordinates
        const x1Screen = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1Screen = scales.yScale(p1.y);
        const x2Screen = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2Screen = scales.yScale(p2.y);

        // Calculate direction in screen space
        const dx = x2Screen - x1Screen;
        const dy = y2Screen - y1Screen;
        
        // Get chart boundaries in screen space
        const xRange = scales.xScale.range();
        const yRange = scales.yScale.range();
        const chartLeftX = (scales.chart && scales.chart.margin && typeof scales.chart.margin.l === 'number')
            ? scales.chart.margin.l
            : xRange[0];
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        // Extend the ray to the edge of the chart in screen space
        let extendedX, extendedY;
        
        if (Math.abs(dx) > 0.001) {
            const slope = dy / dx;
            if (dx > 0) {
                extendedX = chartRightX;
                extendedY = y1Screen + slope * (extendedX - x1Screen);
            } else {
                extendedX = chartLeftX;
                extendedY = y1Screen + slope * (extendedX - x1Screen);
            }
            // Clamp Y to chart boundaries
            if (extendedY < yRange[1]) {
                extendedY = yRange[1];
                extendedX = x1Screen + (extendedY - y1Screen) / slope;
            } else if (extendedY > yRange[0]) {
                extendedY = yRange[0];
                extendedX = x1Screen + (extendedY - y1Screen) / slope;
            }
        } else {
            extendedX = x1Screen;
            extendedY = dy > 0 ? yRange[0] : yRange[1];
        }

        // Clip BOTH endpoints to visible chart area (same as ExtendedLineTool leftX/rightX)
        // This ensures text positioning always uses on-screen coordinates
        let visX1 = x1Screen, visY1 = y1Screen;
        let visX2 = extendedX, visY2 = extendedY;
        if (Math.abs(dx) > 0.001) {
            const slope = dy / dx;
            if (x1Screen < chartLeftX) {
                visX1 = chartLeftX;
                visY1 = y1Screen + slope * (chartLeftX - x1Screen);
            } else if (x1Screen > chartRightX) {
                visX1 = chartRightX;
                visY1 = y1Screen + slope * (chartRightX - x1Screen);
            }
            if (extendedX < chartLeftX) {
                visX2 = chartLeftX;
                visY2 = y1Screen + slope * (chartLeftX - x1Screen);
            } else if (extendedX > chartRightX) {
                visX2 = chartRightX;
                visY2 = y1Screen + slope * (chartRightX - x1Screen);
            }
        }

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        this._splitInfo = null;
        
        if (shouldSplitLine) {
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';

            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);

            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();

            // Use original data point screen coords for text anchor (same as ExtendedLineTool)
            const origLX = x1Screen <= x2Screen ? x1Screen : x2Screen;
            const origLY = x1Screen <= x2Screen ? y1Screen : y2Screen;
            const origRX = x1Screen <= x2Screen ? x2Screen : x1Screen;
            const origRY = x1Screen <= x2Screen ? y2Screen : y1Screen;
            // Keep visible coords for angle computation (direction of rendered segment)
            const slvX = visX1 <= visX2 ? visX1 : visX2;
            const slvY = visX1 <= visX2 ? visY1 : visY2;
            const srvX = visX1 <= visX2 ? visX2 : visX1;
            const srvY = visX1 <= visX2 ? visY2 : visY1;

            const lineAngle = Math.atan2(srvY - slvY, srvX - slvX);
            let angleDeg = lineAngle * (180 / Math.PI);
            const isFlipped = angleDeg > 90 || angleDeg < -90;
            if (isFlipped) angleDeg += 180;

            const padding = 10;
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);

            const visLineLength = Math.sqrt((srvX - slvX) ** 2 + (srvY - slvY) ** 2);
            const vis_ux = visLineLength > 0 ? (srvX - slvX) / visLineLength : 1;
            const vis_uy = visLineLength > 0 ? (srvY - slvY) / visLineLength : 0;
            const halfGapT = visLineLength > 0 ? (gapSize / 2) / visLineLength : 0;

            let rawTextX, rawTextY;
            switch (textHAlign) {
                case 'left':
                    rawTextX = origLX + vis_ux * (gapSize / 2 + TEXT_EDGE_PADDING);
                    rawTextY = origLY + vis_uy * (gapSize / 2 + TEXT_EDGE_PADDING);
                    break;
                case 'right':
                    rawTextX = origRX - vis_ux * (gapSize / 2 + TEXT_EDGE_PADDING);
                    rawTextY = origRY - vis_uy * (gapSize / 2 + TEXT_EDGE_PADDING);
                    break;
                default:
                    rawTextX = (origLX + origRX) / 2;
                    rawTextY = (origLY + origRY) / 2;
            }
            // Compute gap in the FULL line's parametric space (x1Screen→extendedX)
            // so the drawn segments align with the gap position
            const fullLineLength = Math.sqrt((extendedX - x1Screen) ** 2 + (extendedY - y1Screen) ** 2) || 1;
            const halfGapPx = gapSize / 2;
            // Find where the text center lands along the full line
            const tFull = fullLineLength > 0
                ? Math.sqrt((rawTextX - x1Screen) ** 2 + (rawTextY - y1Screen) ** 2) / fullLineLength
                : 0.5;
            const halfGapTFull = halfGapPx / fullLineLength;
            const split1T = Math.max(0, tFull - halfGapTFull);
            const split2T = Math.min(1, tFull + halfGapTFull);
            const split1X = x1Screen + (extendedX - x1Screen) * split1T;
            const split1Y = y1Screen + (extendedY - y1Screen) * split1T;
            const split2X = x1Screen + (extendedX - x1Screen) * split2T;
            const split2Y = y1Screen + (extendedY - y1Screen) * split2T;

            this._splitInfo = {
                textX: rawTextX,
                textY: rawTextY,
                angle: angleDeg,
                gapSize: gapSize
            };

            this.group.append('line')
                .attr('x1', x1Screen).attr('y1', y1Screen)
                .attr('x2', split1X).attr('y2', split1Y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke').style('cursor', 'move');
            this.group.append('line')
                .attr('x1', x1Screen).attr('y1', y1Screen)
                .attr('x2', split1X).attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none').style('cursor', 'move');
            this.group.append('line')
                .attr('x1', split2X).attr('y1', split2Y)
                .attr('x2', extendedX).attr('y2', extendedY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke').style('cursor', 'move');
            this.group.append('line')
                .attr('x1', split2X).attr('y1', split2Y)
                .attr('x2', extendedX).attr('y2', extendedY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none').style('cursor', 'move');
        } else {
            this.group.append('line')
                .attr('x1', x1Screen).attr('y1', y1Screen)
                .attr('x2', extendedX).attr('y2', extendedY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke').style('cursor', 'move');
            this.group.append('line')
                .attr('x1', x1Screen).attr('y1', y1Screen)
                .attr('x2', extendedX).attr('y2', extendedY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none').style('cursor', 'move');
        }

        // Pass original data point screen coords (same as ExtendedLineTool)
        this.renderTextLabel({
            x1: x1Screen,
            y1: y1Screen,
            x2: x2Screen,
            y2: y2Screen,
            chartBottomY: yRange[0],
            chartTopY: yRange[1]
        });

        // Create resize handles (only for the two defining points)
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    patchPanZoomGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        if (this._splitInfo) return false;
        const seg = computeRayScreenEndpoints(scales, this.points[0], this.points[1]);
        if (![seg.x1, seg.y1, seg.x2, seg.y2].every(Number.isFinite)) return false;
        patchTwoPointLineElements(this.group, seg.x1, seg.y1, seg.x2, seg.y2);
        if (typeof this.updateHandlePositions === 'function') {
            this.updateHandlePositions(scales);
        }
        return true;
    }

    _patchLiveTwoPointGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        const hasText = this.text && String(this.text).trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        if (hasText && (textVAlign === 'middle' || this._splitInfo)) {
            return liveRenderTwoPointDrawingGeometry(this, scales);
        }
        const seg = computeRayScreenEndpoints(scales, this.points[0], this.points[1]);
        if (![seg.x1, seg.y1, seg.x2, seg.y2].every(Number.isFinite)) return false;
        patchTwoPointLineElements(this.group, seg.x1, seg.y1, seg.x2, seg.y2);
        syncLiveLineTextLabel(this, scales, { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 });
        this.updateHandlePositions(scales);
        return true;
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) return;

        // If we have split info, use it for exact positioning (centered text on line)
        if (this._splitInfo) {
            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0 : this.style.textOffsetY;
            const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;
            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + offsetX,
                y: this._splitInfo.textY + offsetY,
                anchor: 'middle',
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: this._splitInfo.angle
            });
            return;
        }

        // p1 = anchor/start of ray, p2 = direction point (End)
        const p1x = coords.x1, p1y = coords.y1;
        const p2x = coords.x2, p2y = coords.y2;

        // Ray direction vector (p1 → p2) for angle and unit vector
        const rdx = p2x - p1x, rdy = p2y - p1y;
        const rlen = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
        const rux = rdx / rlen, ruy = rdy / rlen;

        // Calculate angle for text rotation from ray direction
        const renderAngleDeg = resolveLineLabelReadableAngleDeg(rdy, rdx);
        const angle = renderAngleDeg;
        const labelPerp = lineLabelPerpFromAngleDeg(renderAngleDeg);
        const perpX = labelPerp.x;
        const perpY = labelPerp.y;

        // Settings
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;

        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        // 'left' = Start (p1), 'right' = End (p2) — semantic, not geometric sort
        let baseX, baseY, elAnchor;
        switch (textHAlign) {
            case 'left':
                baseX = p1x + rux * TEXT_EDGE_PADDING;
                baseY = p1y + ruy * TEXT_EDGE_PADDING;
                elAnchor = resolveRayEndpointSvgAnchor('left', label, rdx >= 0);
                break;
            case 'right':
                baseX = p2x - rux * TEXT_EDGE_PADDING;
                baseY = p2y - ruy * TEXT_EDGE_PADDING;
                elAnchor = resolveRayEndpointSvgAnchor('right', label, rdx >= 0);
                break;
            default:
                baseX = (p1x + p2x) / 2;
                baseY = (p1y + p2y) / 2;
                elAnchor = 'middle';
        }

        const signUp = perpY <= 0 ? 1 : -1;
        const lineRefX = baseX;
        const lineRefY = baseY;

        const offsetX = this.style.textOffsetX || 0;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        // Clamp anchor on line to stay within chart area (don't overlap time or price axes)
        const chartBottomY = coords.chartBottomY;
        const chartTopY = coords.chartTopY;
        if (chartBottomY !== undefined) baseY = Math.min(baseY, chartBottomY - 2);
        if (chartTopY !== undefined) baseY = Math.max(baseY, chartTopY + 2);

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: elAnchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle,
            ...lineLabelGapConfig(lineRefX, lineRefY, textVAlign, perpX, perpY, signUp)
        });
    }

    static fromJSON(data) {
        const tool = new RayTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Horizontal Ray Tool (horizontal line extending infinitely in one direction)
// ============================================================================
class HorizontalRayTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('horizontal-ray', points, style);
        this.requiredPoints = 1;
        
        // Set default dash array for dotted line (like TradingView)
        if (this.style.dashArray === undefined) {
            this.style.dashArray = '3,3'; // Dotted pattern
        }
        
        // Enable price label by default
        if (this.style.showPriceLabel === undefined) {
            this.style.showPriceLabel = true;
        }
        
        this.ensureTextDefaults();
        if (this.style.textOffsetY === undefined) {
            this.style.textOffsetY = -10;
            this._isDefaultTextOffsetY = true;
        } else {
            this._isDefaultTextOffsetY = false;
        }
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();

                if (this.points.length < 1) return;

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing horizontal-ray', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const xRange = scales.xScale.range();
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const baseStrokeWidth = (this.style.strokeWidth != null ? this.style.strokeWidth : 2);
        const scaledStrokeWidth = Math.max(0.5, baseStrokeWidth * scaleFactor);

        // Convert data index to screen position
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        this._splitInfo = null;
        const y = scales.yScale(p.y);
        
        if (shouldSplitLine) {
            // Measure text width first
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            
            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);
            
            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();
            
            const padding = 10; // Small space on each side of text
            const edgePadding = TEXT_EDGE_PADDING; // Distance from edges
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            // fixed 30px from endpoint, clamped so gap stays on line
            const HR_EDGE_S = 30;
            let hr_rawTextX;
            switch (textHAlign) {
                case 'left':  hr_rawTextX = x + gapSize / 2 + TEXT_EDGE_PADDING; break;
                case 'right': hr_rawTextX = chartRightX - gapSize / 2 - TEXT_EDGE_PADDING; break;
                default:      hr_rawTextX = (x + chartRightX) / 2;
            }
            const textX = Math.max(x + gapSize/2, Math.min(chartRightX - gapSize/2, hr_rawTextX));
            const split1X = Math.max(x, textX - gapSize / 2);
            const split2X = Math.min(chartRightX, textX + gapSize / 2);
            
            this._splitInfo = {
                textX: textX,
                textY: y,
                angle: 0,
                gapSize: gapSize,
                startX: x,
                endX: chartRightX
            };

            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', x)
                .attr('y1', y)
                .attr('x2', split1X)
                .attr('y2', y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (baseStrokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', y)
                .attr('x2', split1X)
                .attr('y2', y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', split2X)
                .attr('y1', y)
                .attr('x2', chartRightX)
                .attr('y2', y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (baseStrokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw second segment
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', y)
                .attr('x2', chartRightX)
                .attr('y2', y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw invisible wider stroke for easier clicking
            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', x)
                .attr('y1', scales.yScale(p.y))
                .attr('x2', chartRightX)
                .attr('y2', scales.yScale(p.y))
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (baseStrokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw horizontal ray normally
            this.group.append('line')
                .attr('x1', x)
                .attr('y1', scales.yScale(p.y))
                .attr('x2', chartRightX)
                .attr('y2', scales.yScale(p.y))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        // Render price label on the right side (if enabled)
        if (this.style.showPriceLabel !== false) {
            this.renderPriceLabel(scales, xRange, p);
        }

        // Render custom text label if provided
        this.renderTextLabel(scales, xRange, p, x);

        if (this._shouldCreateHandles(renderOpts)) {
            this._recreateDirectResizeHandles(scales, x);
        }

        return this.group;
    }

    _recreateDirectResizeHandles(scales, anchorX) {
        if (!this.group || this.group.empty() || !this.points?.[0]) return;
        this._clearDirectResizeHandles();
        const p = this.points[0];
        const cx = Number.isFinite(anchorX)
            ? anchorX
            : (scales.chart && scales.chart.dataIndexToPixel
                ? scales.chart.dataIndexToPixel(p.x)
                : scales.xScale(p.x));
        const cy = scales.yScale(p.y);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const hitRadius = 12;
        this.group.append('circle')
            .attr('class', 'resize-handle-hit')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', hitRadius)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', 0)
            .attr('data-point-index', 0);
        this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
    }

    updateHandlePositions(scales) {
        this.syncDirectPointHandleDom(scales, 0);
    }

    patchLiveAnchorGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points?.[0] || !scales) return false;
        // Custom labels depend on anchor x/y and split metadata — fast line-only patch leaves text stuck.
        if (this.text && String(this.text).trim()) {
            return liveRenderSingleAnchorHorizontalGeometry(this, scales);
        }
        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

        const xRange = scales.xScale.range();
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        this.group.selectAll('line').each(function () {
            const el = d3.select(this);
            if (el.attr('y1') == null) return;
            el.attr('y1', y).attr('y2', y);
            const x2 = parseFloat(el.attr('x2'));
            if (!Number.isFinite(x2)) return;
            if (x2 >= chartRightX - 2) {
                el.attr('x1', x);
            } else {
                const x1 = parseFloat(el.attr('x1'));
                if (Number.isFinite(x1)) {
                    const width = x2 - x1;
                    el.attr('x1', x).attr('x2', x + width);
                }
            }
        });

        this.syncDirectPointHandleDom(scales, 0);
        return true;
    }

    renderPriceLabel(scales, xRange, point) {
        // Format price value using the chart's instrument-aware decimal count (NQ=2,
        // GC=1, CL=2, FX=5, etc.). Falls back to 5 only for unknown symbols so we
        // never show stale `1340.41268` style over-precision on futures/indices.
        const priceValue = point?.y;
        if (priceValue === undefined || priceValue === null) return;
        const chart = scales?.chart || this.chart;
        let decimals = 5;
        if (chart && typeof chart.getPriceDecimals === 'function') {
            const dom = chart.yScale && chart.yScale.domain ? chart.yScale.domain() : null;
            const range = Array.isArray(dom) && dom.length === 2 ? Math.abs(dom[1] - dom[0]) : 0;
            const d = chart.getPriceDecimals(range);
            if (Number.isFinite(d) && d >= 0) decimals = d;
        }
        const formattedPrice = priceValue.toFixed(decimals);
        
        const y = scales.yScale(point.y);
        const labelX = xRange[1] - 5; // Position near right edge
        
        // Create label group
        const labelGroup = this.group.append('g')
            .attr('class', 'price-label');
        
        // Create temporary text to measure size
        const tempText = labelGroup.append('text')
            .attr('x', labelX)
            .attr('y', y)
            .attr('font-family', 'Roboto, sans-serif')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .text(formattedPrice)
            .style('visibility', 'hidden');
        
        const bbox = tempText.node().getBBox();
        tempText.remove();
        
        const padding = 6;
        const rectWidth = bbox.width + padding * 2;
        const rectHeight = 20;
        
        // Draw background rectangle
        labelGroup.append('rect')
            .attr('x', labelX - rectWidth)
            .attr('y', y - rectHeight / 2)
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('fill', this.style.stroke || '#089981')
            .attr('rx', 2)
            .style('pointer-events', 'none');
        
        // Draw price text
        labelGroup.append('text')
            .attr('x', labelX - rectWidth / 2)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-family', 'Roboto, sans-serif')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .attr('fill', '#FFFFFF')
            .text(formattedPrice)
            .style('pointer-events', 'none');
    }

    renderTextLabel(scales, xRange, point, startX) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // If we have split info, use it for exact positioning
        if (this._splitInfo) {
            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0
                : this.style.textOffsetY;
            const offsetY = (rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY || (this._isDefaultTextOffsetY && rawOffsetY === -10))
                ? 0
                : rawOffsetY;
            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + offsetX,
                y: this._splitInfo.textY + offsetY,
                anchor: 'middle',
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: 0
            });
            return;
        }

        const chartLeftX = (scales.chart && scales.chart.margin && typeof scales.chart.margin.l === 'number')
            ? scales.chart.margin.l
            : xRange[0];
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        // Clamp to visible area — same as ExtendedLineTool uses leftX
        const visibleStartX = Math.max(startX, chartLeftX);

        const y = scales.yScale(point.y);
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        let baseX;
        let hrAnchor;
        switch (textHAlign) {
            case 'left':
                baseX = visibleStartX + TEXT_EDGE_PADDING;
                hrAnchor = resolveLineEndpointSvgAnchor('left', label);
                break;
            case 'right':
                baseX = chartRightX - TEXT_EDGE_PADDING;
                hrAnchor = resolveLineEndpointSvgAnchor('right', label);
                break;
            default:
                baseX = (visibleStartX + chartRightX) / 2;
                hrAnchor = 'middle';
        }
        
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;

        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: y,
            anchor: hrAnchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            ...lineLabelGapConfig(baseX, y, textVAlign)
        });
    }

    static fromJSON(data) {
        const tool = new HorizontalRayTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Extended Line Tool (extends infinitely in both directions)
// ============================================================================
class ExtendedLineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('extended-line', points, style);
        this.requiredPoints = 2;
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing extended-line', renderOpts);
        this._clearDrawingLabels(scales);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert to screen coordinates
        const x1Screen = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1Screen = scales.yScale(p1.y);
        const x2Screen = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2Screen = scales.yScale(p2.y);

        // Calculate direction in screen space
        const dx = x2Screen - x1Screen;
        const dy = y2Screen - y1Screen;
        
        // Get chart boundaries in screen space
        const xRange = scales.xScale.range();
        const yRange = scales.yScale.range();
        const chartLeftX = (scales.chart && scales.chart.margin && typeof scales.chart.margin.l === 'number')
            ? scales.chart.margin.l
            : xRange[0];
        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        // Extend the line infinitely in both directions
        let leftX, leftY, rightX, rightY;
        
        if (Math.abs(dx) > 0.001) {
            // Calculate slope
            const slope = dy / dx;
            
            // Extend to left edge
            leftX = chartLeftX;
            leftY = y1Screen + slope * (leftX - x1Screen);
            
            // Extend to right edge
            rightX = chartRightX;
            rightY = y1Screen + slope * (rightX - x1Screen);
            
            // Clamp Y to chart boundaries for left point
            if (leftY < yRange[1]) {
                leftY = yRange[1];
                leftX = x1Screen + (leftY - y1Screen) / slope;
            } else if (leftY > yRange[0]) {
                leftY = yRange[0];
                leftX = x1Screen + (leftY - y1Screen) / slope;
            }
            
            // Clamp Y to chart boundaries for right point
            if (rightY < yRange[1]) {
                rightY = yRange[1];
                rightX = x1Screen + (rightY - y1Screen) / slope;
            } else if (rightY > yRange[0]) {
                rightY = yRange[0];
                rightX = x1Screen + (rightY - y1Screen) / slope;
            }
        } else {
            // Vertical line
            leftX = rightX = x1Screen;
            leftY = yRange[0];
            rightY = yRange[1];
        }
        
        // Check if we need to split the line for centered text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        this._splitInfo = null;
        
        if (shouldSplitLine) {
            // Measure text width for gap calculation
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            
            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);
            
            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();
            
            // Calculate line angle
            const lineAngle = Math.atan2(rightY - leftY, rightX - leftX);
            let angleDeg = lineAngle * (180 / Math.PI);

            // Calculate text position based on alignment
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            // Check if text will be flipped
            const isFlipped = angleDeg > 90 || angleDeg < -90;
            if (isFlipped) {
                angleDeg += 180;
            }

            // Calculate gap size
            const padding = 10;
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);

            // Use original data point screen coordinates for text/gap positioning
            // so text stays anchored to the actual data points regardless of line angle
            const origLX = x1Screen <= x2Screen ? x1Screen : x2Screen;
            const origLY = x1Screen <= x2Screen ? y1Screen : y2Screen;
            const origRX = x1Screen <= x2Screen ? x2Screen : x1Screen;
            const origRY = x1Screen <= x2Screen ? y2Screen : y1Screen;

            const el_lineLength = Math.sqrt((rightX - leftX) ** 2 + (rightY - leftY) ** 2);
            const el_ux = el_lineLength > 0 ? (rightX - leftX) / el_lineLength : 1;
            const el_uy = el_lineLength > 0 ? (rightY - leftY) / el_lineLength : 0;
            const halfGapT_el = el_lineLength > 0 ? (gapSize / 2) / el_lineLength : 0;
            let rawTextX_el, rawTextY_el;
            switch (textHAlign) {
                case 'left':
                    rawTextX_el = origLX + el_ux * (gapSize / 2 + TEXT_EDGE_PADDING);
                    rawTextY_el = origLY + el_uy * (gapSize / 2 + TEXT_EDGE_PADDING);
                    break;
                case 'right':
                    rawTextX_el = origRX - el_ux * (gapSize / 2 + TEXT_EDGE_PADDING);
                    rawTextY_el = origRY - el_uy * (gapSize / 2 + TEXT_EDGE_PADDING);
                    break;
                default:
                    rawTextX_el = (origLX + origRX) / 2;
                    rawTextY_el = (origLY + origRY) / 2;
            }
            const t_el = el_lineLength > 0 ? Math.sqrt((rawTextX_el-leftX)**2+(rawTextY_el-leftY)**2) / el_lineLength : 0.5;
            const split1T_el = Math.max(0, t_el - halfGapT_el);
            const split2T_el = Math.min(1, t_el + halfGapT_el);
            const textX = rawTextX_el;
            const textY = rawTextY_el;
            const split1X = leftX + (rightX - leftX) * split1T_el;
            const split1Y = leftY + (rightY - leftY) * split1T_el;
            const split2X = leftX + (rightX - leftX) * split2T_el;
            const split2Y = leftY + (rightY - leftY) * split2T_el;
            
            this._splitInfo = {
                textX: textX,
                textY: textY,
                angle: angleDeg,
                gapSize: gapSize
            };

            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('x1', leftX)
                .attr('y1', leftY)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment (from left to gap)
            this.group.append('line')
                .attr('x1', leftX)
                .attr('y1', leftY)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');

            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', rightX)
                .attr('y2', rightY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment (from gap to right)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', rightX)
                .attr('y2', rightY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw invisible wider stroke for easier clicking
            this.group.append('line')
                .attr('x1', leftX)
                .attr('y1', leftY)
                .attr('x2', rightX)
                .attr('y2', rightY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw line normally without split
            this.group.append('line')
                .attr('x1', leftX)
                .attr('y1', leftY)
                .attr('x2', rightX)
                .attr('y2', rightY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        this.renderTextLabel({
            x1: x1Screen,
            y1: y1Screen,
            x2: x2Screen,
            y2: y2Screen,
            chartBottomY: yRange[0],
            chartTopY: yRange[1]
        });

        // Create resize handles (only for the two defining points)
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    patchPanZoomGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        if (this._splitInfo) return false;
        const seg = computeExtendedLineScreenEndpoints(scales, this.points[0], this.points[1]);
        if (![seg.x1, seg.y1, seg.x2, seg.y2].every(Number.isFinite)) return false;
        patchTwoPointLineElements(this.group, seg.x1, seg.y1, seg.x2, seg.y2);
        if (typeof this.updateHandlePositions === 'function') {
            this.updateHandlePositions(scales);
        }
        return true;
    }

    _patchLiveTwoPointGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points || this.points.length < 2) return false;
        const hasText = this.text && String(this.text).trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        if (hasText && (textVAlign === 'middle' || this._splitInfo)) {
            return liveRenderTwoPointDrawingGeometry(this, scales);
        }
        const seg = computeExtendedLineScreenEndpoints(scales, this.points[0], this.points[1]);
        if (![seg.x1, seg.y1, seg.x2, seg.y2].every(Number.isFinite)) return false;
        patchTwoPointLineElements(this.group, seg.x1, seg.y1, seg.x2, seg.y2);
        syncLiveLineTextLabel(this, scales, { x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 });
        this.updateHandlePositions(scales);
        return true;
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // If we have split info, use it for exact positioning (centered text on line)
        if (this._splitInfo) {
            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0
                : this.style.textOffsetY;
            const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;
            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + offsetX,
                y: this._splitInfo.textY + offsetY,
                anchor: 'middle',
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: this._splitInfo.angle
            });
            return;
        }

        const { x1, y1, x2, y2 } = coords;

        // Sort by x to get left/right data points
        const lx = x1 <= x2 ? x1 : x2;
        const ly = x1 <= x2 ? y1 : y2;
        const rx = x1 <= x2 ? x2 : x1;
        const ry = x1 <= x2 ? y2 : y1;
        
        // Calculate angle of the line for text rotation
        const renderAngleDeg = resolveLineLabelReadableAngleDeg(ry - ly, rx - lx);
        const angle = renderAngleDeg;
        const labelPerp = lineLabelPerpFromAngleDeg(renderAngleDeg);
        const perpX = labelPerp.x;
        const perpY = labelPerp.y;
        
        // Settings
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        // Use original data point screen coords for text positioning
        const origLen = Math.sqrt((rx - lx) ** 2 + (ry - ly) ** 2) || 1;
        const ux = (rx - lx) / origLen;
        const uy = (ry - ly) / origLen;
        let baseX, baseY, elAnchor;
        switch (textHAlign) {
            case 'left':
                baseX = lx + ux * TEXT_EDGE_PADDING;
                baseY = ly + uy * TEXT_EDGE_PADDING;
                elAnchor = resolveLineEndpointSvgAnchor('left', label);
                break;
            case 'right':
                baseX = rx - ux * TEXT_EDGE_PADDING;
                baseY = ry - uy * TEXT_EDGE_PADDING;
                elAnchor = resolveLineEndpointSvgAnchor('right', label);
                break;
            default:
                baseX = (lx + rx) / 2;
                baseY = (ly + ry) / 2;
                elAnchor = 'middle';
        }

        const signUp = perpY <= 0 ? 1 : -1;
        const lineRefX = baseX;
        const lineRefY = baseY;

        const offsetX = this.style.textOffsetX || 0;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        // Clamp anchor on line to stay within chart area (don't overlap time or price axes)
        const chartBottomY = coords.chartBottomY;
        const chartTopY = coords.chartTopY;
        if (chartBottomY !== undefined) baseY = Math.min(baseY, chartBottomY - 2);
        if (chartTopY !== undefined) baseY = Math.max(baseY, chartTopY + 2);

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: elAnchor,
            yAnchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle,
            ...lineLabelGapConfig(lineRefX, lineRefY, textVAlign, perpX, perpY, signUp)
        });
    }

    static fromJSON(data, chart) {
        const tool = new ExtendedLineTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.text = data.text || '';
        tool.locked = data.locked || false;
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
// Cross Line Tool (vertical + horizontal lines intersecting at one point)
// ============================================================================
class CrossLineTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('cross-line', points, style);
        this.requiredPoints = 1;
        
        // Set default dash array for dotted line
        if (this.style.dashArray === undefined) {
            this.style.dashArray = '3,3';
        }
        
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        Object.keys(DEFAULT_TEXT_STYLE).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = DEFAULT_TEXT_STYLE[key];
            }
        });
        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || DEFAULT_TEXT_STYLE.textColor;
        }
    }

    render(container, scales, renderOptsArg = {}) {
        const renderOpts = BaseDrawing.normalizeRenderOpts(renderOptsArg);
        const isPreview = renderOpts.isPreview;
        this.ensureTextDefaults();

                if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this._prepareRenderGroup(container, 'drawing cross-line', renderOpts);
        this._clearDrawingLabels(scales);

        const p = this.points[0];
        const xRange = scales.xScale.range();
        const yRange = scales.yScale.range();

        // Convert to screen coordinates
        const xScreen = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const yScreen = scales.yScale(p.y);

        // Draw invisible wider strokes for easier clicking (match HorizontalLineTool)
        this.group.append('line')
            .attr('x1', xScreen)
            .attr('y1', yRange[1])
            .attr('x2', xScreen)
            .attr('y2', yRange[0])
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('line')
            .attr('x1', xRange[0])
            .attr('y1', yScreen)
            .attr('x2', xRange[1])
            .attr('y2', yScreen)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw vertical line (full height)
        this.group.append('line')
            .attr('x1', xScreen)
            .attr('y1', yRange[1])
            .attr('x2', xScreen)
            .attr('y2', yRange[0])
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
            .attr('opacity', this.style.opacity)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Draw horizontal line (full width)
        this.group.append('line')
            .attr('x1', xRange[0])
            .attr('y1', yScreen)
            .attr('x2', xRange[1])
            .attr('y2', yScreen)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray ?? this.style.dashArray ?? '')
            .attr('opacity', this.style.opacity)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Render text label if exists
        if (this.text && this.text.trim()) {
            const cl_textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
            const cl_textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            const cl_xRange = scales.xScale.range();
            const CLEDGE = 20;
            let cl_baseX, cl_anchor;
            switch (cl_textHAlign) {
                case 'left':  cl_baseX = cl_xRange[0] + CLEDGE; cl_anchor = resolveLineEndpointSvgAnchor('left', this.text); break;
                case 'right': cl_baseX = cl_xRange[1] - CLEDGE; cl_anchor = resolveLineEndpointSvgAnchor('right', this.text); break;
                default:      cl_baseX = (cl_xRange[0] + cl_xRange[1]) / 2; cl_anchor = 'middle';
            }
            appendTextLabel(this.group, this.text, {
                x: cl_baseX + (this.style.textOffsetX || 0),
                y: yScreen,
                anchor: cl_anchor,
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: 0,
                ...lineLabelGapConfig(cl_baseX, yScreen, cl_textVAlign)
            });
        }

        // Create resize handle at intersection point
        if (this._shouldCreateHandles(renderOpts)) this.createHandles(this.group, scales);

        return this.group;
    }

    patchLiveAnchorGeometry(scales) {
        if (!this.group || this.group.empty() || !this.points?.[0] || !scales) return false;
        const p = this.points[0];
        const xScreen = scales.chart && scales.chart.dataIndexToPixel
            ? scales.chart.dataIndexToPixel(p.x)
            : scales.xScale(p.x);
        const yScreen = scales.yScale(p.y);
        if (!Number.isFinite(xScreen) || !Number.isFinite(yScreen)) return false;
        const xRange = scales.xScale.range();
        const yRange = scales.yScale.range();
        this.group.selectAll('line').each(function () {
            const el = d3.select(this);
            if (el.attr('x1') == null) return;
            const x1 = parseFloat(el.attr('x1'));
            const x2 = parseFloat(el.attr('x2'));
            const y1 = parseFloat(el.attr('y1'));
            const y2 = parseFloat(el.attr('y2'));
            if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(y1) || !Number.isFinite(y2)) {
                return;
            }
            if (Math.abs(x1 - x2) < 1) {
                el.attr('x1', xScreen).attr('x2', xScreen);
            } else {
                el.attr('y1', yScreen).attr('y2', yScreen);
            }
        });
        if (typeof this.updateHandlePositions === 'function') {
            this.updateHandlePositions(scales);
        }
        return true;
    }

    static fromJSON(data, chart) {
        const tool = new CrossLineTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.text = data.text || '';
        tool.locked = data.locked || false;
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
        TrendlineTool,
        HorizontalLineTool,
        VerticalLineTool,
        RayTool,
        HorizontalRayTool,
        ExtendedLineTool,
        CrossLineTool
    };
} 

// Verify all classes are defined
console.log('✅ Line Drawing Tools loaded:', {
    TrendlineTool: typeof TrendlineTool,
    HorizontalLineTool: typeof HorizontalLineTool,
    VerticalLineTool: typeof VerticalLineTool,
    RayTool: typeof RayTool,
    HorizontalRayTool: typeof HorizontalRayTool,
    ExtendedLineTool: typeof ExtendedLineTool,
    CrossLineTool: typeof CrossLineTool
});
