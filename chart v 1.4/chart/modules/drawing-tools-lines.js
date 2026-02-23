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
        rotation = 0
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

    const textEl = group.append('text')
        .attr('x', x)
        .attr('y', yPos)
        .attr('fill', fill !== undefined ? fill : (color !== undefined ? color : '#ffffff'))
        .attr('font-size', `${fontSize}px`)
        .attr('font-family', fontFamily)
        .attr('font-weight', fontWeight)
        .attr('font-style', fontStyle)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', useCenteredY ? 'central' : 'text-before-edge')
        .attr('xml:space', 'preserve')
        .attr('transform', `rotate(${rotation}, ${x}, ${yPos})`)
        .style('pointer-events', 'none')
        .style('user-select', 'none');

    lines.forEach((line, index) => {
        const sanitized = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
        textEl.append('tspan')
            .attr('x', x)
            .attr('dy', index === 0 ? (useCenteredY ? verticalOffset : 0) : lineHeight)
            .text(sanitized);
    });

    return textEl;
}

// Make appendTextLabel globally available for all drawing tools
window.appendTextLabel = appendTextLabel;

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

    render(container, scales) {
        this.ensureTextDefaults();

        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing trendline')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
        }

        // Create arrow markers if needed
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const svg = d3.select(container.node().ownerSVGElement);
            
            if (startStyle === 'arrow') {
                const startMarkerId = `arrow-start-${this.id}`;
                SVGHelpers.createArrowMarker(svg, startMarkerId, this.style.stroke);
            }
            
            if (endStyle === 'arrow') {
                const endMarkerId = `arrow-end-${this.id}`;
                SVGHelpers.createArrowMarker(svg, endMarkerId, this.style.stroke);
            }
        }

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
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
            
            // Calculate gap size based on actual text width
            const fontSize = this.style.fontSize || 14;
            const fontFamily = this.style.fontFamily || 'system-ui, -apple-system, sans-serif';
            const fontWeight = this.style.fontWeight || 'normal';
            
            // Create temporary text element to measure actual width
            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);
            
            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();
            
            // Calculate angle and direction along the line
            const lineAngle = Math.atan2(origY2 - origY1, origX2 - origX1);
            
            // Use exact text width for gap with padding
            const padding = 4;
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);

            // Compute visible segment (clamp to chart boundaries)
            const xRange = scales && scales.xScale ? scales.xScale.range() : null;
            const vLeft = xRange ? xRange[0] : 0;
            const vRight = xRange ? xRange[1] : 99999;
            const rawLX = origX1 <= origX2 ? origX1 : origX2;
            const rawLY = origX1 <= origX2 ? origY1 : origY2;
            const rawRX = origX1 <= origX2 ? origX2 : origX1;
            const rawRY = origX1 <= origX2 ? origY2 : origY1;
            const rawDX = rawRX - rawLX, rawDY = rawRY - rawLY;
            let segLX = rawLX, segLY = rawLY;
            if (rawDX !== 0 && rawLX < vLeft) { const f = (vLeft - rawLX) / rawDX; segLX = vLeft; segLY = rawLY + f * rawDY; }
            let segRX = rawRX, segRY = rawLY;
            if (rawDX !== 0) { const f = (segRX - rawLX) / rawDX; segRY = rawLY + f * rawDY; }
            if (rawDX !== 0 && rawRX > vRight) { const f = (vRight - rawLX) / rawDX; segRX = vRight; segRY = rawLY + f * rawDY; }

            // Calculate text position on the VISIBLE segment
            const segLen = Math.sqrt((segRX - segLX) ** 2 + (segRY - segLY) ** 2) || 1;
            const seg_ux = (segRX - segLX) / segLen;
            const seg_uy = (segRY - segLY) / segLen;
            const SI_EDGE = 30;
            let textX, textY;
            switch (textHAlign) {
                case 'left':  textX = segLX + seg_ux * SI_EDGE; textY = segLY + seg_uy * SI_EDGE; break;
                case 'right': textX = segRX - seg_ux * SI_EDGE; textY = segRY - seg_uy * SI_EDGE; break;
                default:      textX = (segLX + segRX) / 2;      textY = (segLY + segRY) / 2;
            }

            // Calculate split points based on anchor type so gap covers actual text area
            const halfGap = gapSize / 2;
            let split1X, split1Y, split2X, split2Y;
            switch (textHAlign) {
                case 'left': // anchor:start — text extends rightward from textX
                    split1X = textX - seg_ux * capPad;
                    split1Y = textY - seg_uy * capPad;
                    split2X = textX + seg_ux * (textWidth + padding + capPad);
                    split2Y = textY + seg_uy * (textWidth + padding + capPad);
                    break;
                case 'right': // anchor:end — text extends leftward from textX
                    split1X = textX - seg_ux * (textWidth + padding + capPad);
                    split1Y = textY - seg_uy * (textWidth + padding + capPad);
                    split2X = textX + seg_ux * capPad;
                    split2Y = textY + seg_uy * capPad;
                    break;
                default: // anchor:middle — text centered on textX
                    split1X = textX - seg_ux * halfGap;
                    split1Y = textY - seg_uy * halfGap;
                    split2X = textX + seg_ux * halfGap;
                    split2Y = textY + seg_uy * halfGap;
            }
            
            // Store split info for text rendering to use
            this._splitInfo = {
                textX: textX,
                textY: textY,
                angle: lineAngle * (180 / Math.PI),
                gapSize: gapSize,
                split1X: split1X,
                split1Y: split1Y,
                split2X: split2X,
                split2Y: split2Y
            };
            
            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment (from start to gap)
            const line1 = this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment (from gap to end)
            const line2 = this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Apply arrow markers
            if (startStyle === 'arrow') {
                line1.attr('marker-start', `url(#arrow-start-${this.id})`);
            }
            if (endStyle === 'arrow') {
                line2.attr('marker-end', `url(#arrow-end-${this.id})`);
            }
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
            
            // Apply arrow markers
            if (startStyle === 'arrow') {
                line.attr('marker-start', `url(#arrow-start-${this.id})`);
            }
            if (endStyle === 'arrow') {
                line.attr('marker-end', `url(#arrow-end-${this.id})`);
            }
        }

        this.renderTextLabel({ x1, y1, x2, y2, scales });
        
        // Render info box if enabled
        this.renderInfoBox(origX1, origY1, origX2, origY2, scales);

        // Create resize handles
        this.createHandles(this.group, scales);

        return this.group;
    }
    
    renderInfoBox(x1, y1, x2, y2, scales) {
        const infoSettings = this.style.infoSettings || {};
        if (!infoSettings.showInfo) return;
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        // Calculate metrics
        const priceChange = Math.abs(p2.y - p1.y);
        const percentChange = ((p2.y - p1.y) / p1.y * 100).toFixed(2);
        const pipsChange = (priceChange / 0.0001).toFixed(1);
        const barsRange = Math.abs(p2.x - p1.x);
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)).toFixed(0);
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI).toFixed(1);
        
        // Build info text
        const infoLines = [];
        if (infoSettings.priceRange) infoLines.push(`Price: ${priceChange.toFixed(5)}`);
        if (infoSettings.percentChange) infoLines.push(`${percentChange}%`);
        if (infoSettings.changeInPips) infoLines.push(`${pipsChange} pips`);
        if (infoSettings.barsRange) infoLines.push(`Bars: ${barsRange}`);
        if (infoSettings.dateTimeRange) {
            const timeDiff = Math.abs(p2.x - p1.x);
            infoLines.push(`Time: ${timeDiff}`);
        }
        if (infoSettings.distance) infoLines.push(`Dist: ${distance}px`);
        if (infoSettings.angle) infoLines.push(`Angle: ${angle}°`);
        
        if (infoLines.length === 0) return;
        
        // Calculate box dimensions first to know offset needed
        const padding = 8;
        const lineHeight = 16;
        const boxWidth = 150;
        const boxHeight = infoLines.length * lineHeight + padding * 2;
        
        // Position info box perpendicular to the line, never covering it
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Calculate perpendicular direction (normal to the line)
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lineLength = Math.sqrt(dx * dx + dy * dy);
        
        // Perpendicular unit vector (rotated 90 degrees)
        // We want to go "above" the line visually, so use negative perpendicular
        const perpX = -dy / lineLength;
        const perpY = dx / lineLength;
        
        // Offset distance: half box height + larger margin to ensure clear separation
        const offsetDistance = boxHeight / 2 + 40;
        
        // Choose which side to place the box (prefer above/left of line)
        // If perpendicular points upward (perpY < 0), use it; otherwise flip
        const sign = perpY <= 0 ? 1 : -1;
        
        const offsetX = midX + perpX * offsetDistance * sign;
        const offsetY = midY + perpY * offsetDistance * sign - boxHeight / 2;
        
        // Create info box group
        const infoGroup = this.group.append('g')
            .attr('class', 'trendline-info')
            .attr('transform', `translate(${offsetX}, ${offsetY})`);
        
        // Draw background rectangle
        infoGroup.append('rect')
            .attr('x', -boxWidth / 2)
            .attr('y', 0)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'rgba(42, 46, 57, 0.95)')
            .attr('stroke', '#363a45')
            .attr('stroke-width', 1)
            .attr('rx', 4);
        
        // Draw text lines
        infoLines.forEach((line, i) => {
            infoGroup.append('text')
                .attr('x', 0)
                .attr('y', padding + (i + 0.7) * lineHeight)
                .attr('text-anchor', 'middle')
                .attr('fill', '#d1d4dc')
                .attr('font-size', '12px')
                .attr('font-family', 'system-ui, -apple-system, sans-serif')
                .text(line);
        });
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // If we have split info from line rendering, use it for exact positioning
        if (this._splitInfo) {
            let angle = this._splitInfo.angle;
            while (angle > 180) angle -= 360;
            while (angle < -180) angle += 360;
            if (angle > 90 || angle < -90) angle += 180;

            const offsetX = this.style.textOffsetX || 0;
            const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
                ? 0 : this.style.textOffsetY;
            const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

            const { scales: siScales } = coords;
            const sp1 = this.points[0], sp2 = this.points[1];
            const sox1 = siScales && siScales.chart && siScales.chart.dataIndexToPixel
                ? siScales.chart.dataIndexToPixel(sp1.x) : (siScales ? siScales.xScale(sp1.x) : this._splitInfo.textX);
            const soy1 = siScales ? siScales.yScale(sp1.y) : this._splitInfo.textY;
            const sox2 = siScales && siScales.chart && siScales.chart.dataIndexToPixel
                ? siScales.chart.dataIndexToPixel(sp2.x) : (siScales ? siScales.xScale(sp2.x) : this._splitInfo.textX);
            const soy2 = siScales ? siScales.yScale(sp2.y) : this._splitInfo.textY;
            const siXRange = siScales && siScales.xScale ? siScales.xScale.range() : null;
            const svLeft = siXRange ? siXRange[0] : 0, svRight = siXRange ? siXRange[1] : 99999;
            const sRawLX = sox1 <= sox2 ? sox1 : sox2, sRawLY = sox1 <= sox2 ? soy1 : soy2;
            const sRawRX = sox1 <= sox2 ? sox2 : sox1, sRawRY = sox1 <= sox2 ? soy2 : soy1;
            const sRawDX = sRawRX - sRawLX, sRawDY = sRawRY - sRawLY;
            let sSegLX = sRawLX, sSegLY = sRawLY;
            if (sRawDX !== 0 && sRawLX < svLeft) { const f = (svLeft - sRawLX) / sRawDX; sSegLX = svLeft; sSegLY = sRawLY + f * sRawDY; }
            let sSegRX = sRawRX, sSegRY = sRawRY;
            if (sRawDX !== 0 && sRawRX > svRight) { const f = (svRight - sRawLX) / sRawDX; sSegRX = svRight; sSegRY = sRawLY + f * sRawDY; }
            const sSegLen = Math.sqrt((sSegRX - sSegLX) ** 2 + (sSegRY - sSegLY) ** 2) || 1;
            const sUx = (sSegRX - sSegLX) / sSegLen, sUy = (sSegRY - sSegLY) / sSegLen;
            const siTextHAlign = this.style.textHAlign || this.style.textAlign || 'center';
            const SI_EDGE = 5;
            let siTextX, siTextY, siAnchor;
            switch (siTextHAlign) {
                case 'left':  siTextX = sSegLX + sUx * SI_EDGE; siTextY = sSegLY + sUy * SI_EDGE; siAnchor = 'start'; break;
                case 'right': siTextX = sSegRX - sUx * SI_EDGE; siTextY = sSegRY - sUy * SI_EDGE; siAnchor = 'end';   break;
                default:      siTextX = (sSegLX + sSegRX) / 2;  siTextY = (sSegLY + sSegRY) / 2;  siAnchor = 'middle';
            }

            appendTextLabel(this.group, label, {
                x: siTextX + offsetX,
                y: siTextY + offsetY,
                anchor: siAnchor,
                yAnchor: 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
                fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
                fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
                fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
                rotation: angle
            });
            return;
        }

        // Use original point coordinates for text positioning, not extended line coords
        const { scales } = coords;
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        const origX1 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : (scales ? scales.xScale(p1.x) : coords.x1);
        const origY1 = scales ? scales.yScale(p1.y) : coords.y1;
        const origX2 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : (scales ? scales.xScale(p2.x) : coords.x2);
        const origY2 = scales ? scales.yScale(p2.y) : coords.y2;
        
        const x1 = origX1;
        const y1 = origY1;
        const x2 = origX2;
        const y2 = origY2;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // Calculate angle of the line for text rotation (match RayTool)
        let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const angleRad = Math.atan2(y2 - y1, x2 - x1);

        const isFlipped = angle > 90 || angle < -90;
        if (isFlipped) {
            angle += 180;
        }

        const verticalOffset = LINE_LABEL_OFFSET;
        const edgePadding = TEXT_EDGE_PADDING;
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';

        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        // Compute visible segment: clamp original endpoints to [visLeft, visRight]
        const xRange2 = scales && scales.xScale ? scales.xScale.range() : null;
        const vLeft  = xRange2 ? xRange2[0] : 0;
        const vRight = xRange2 ? xRange2[1] : 99999;

        const rawLX = x1 <= x2 ? x1 : x2;
        const rawLY = x1 <= x2 ? y1 : y2;
        const rawRX = x1 <= x2 ? x2 : x1;
        const rawRY = x1 <= x2 ? y2 : y1;
        const rawDX = rawRX - rawLX;
        const rawDY = rawRY - rawLY;

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

        const segLen = Math.sqrt((segRX - segLX) ** 2 + (segRY - segLY) ** 2) || 1;
        const seg_ux = (segRX - segLX) / segLen;
        const seg_uy = (segRY - segLY) / segLen;

        const EDGE = 5;
        let baseX, baseY;
        let labelAnchor;
        switch (textHAlign) {
            case 'left':
                // anchor:start → text starts at this point and flows rightward along the line
                baseX = segLX + seg_ux * EDGE;
                baseY = segLY + seg_uy * EDGE;
                labelAnchor = 'start';
                break;
            case 'right':
                // anchor:end → text ends at this point and flows leftward along the line
                baseX = segRX - seg_ux * EDGE;
                baseY = segRY - seg_uy * EDGE;
                labelAnchor = 'end';
                break;
            default:
                // anchor:middle → text centered at midpoint
                baseX = (segLX + segRX)/2 ;
                baseY = (segLY + segRY)/2 ;
                labelAnchor = 'middle';
        }

        const perpX = -Math.sin(angleRad);
        const perpY = Math.cos(angleRad);

        const signUp = perpY <= 0 ? 1 : -1;
        if (textVAlign === 'top') {
            baseX += perpX * verticalOffset * signUp;
            baseY += perpY * verticalOffset * signUp;
        } else if (textVAlign === 'bottom') {
            baseX -= perpX * verticalOffset * signUp;
            baseY -= perpY * verticalOffset * signUp;
        }

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
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle
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

    render(container, scales) {
        this.ensureTextDefaults();

        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing horizontal-line')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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

        // Create single handle at the center (same style as other shapes)
        const centerX = (xRange[0] + xRange[1]) / 2;
        const handleX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const handle = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', centerX)
            .attr('cy', scales.yScale(p.y))
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
        
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

        return this.group;
    }

    renderPriceLabel(scales, xRange, point) {
        // Format price value with appropriate decimal places
        const priceValue = point?.y;
        if (priceValue === undefined || priceValue === null) return;
        const formattedPrice = priceValue.toFixed(5); // Default to 5 decimals, can be customized
        
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
        
        const edgePadding = TEXT_EDGE_PADDING; // Distance from edges
        let baseX = (xRange[0] + xRange[1]) / 2;

        const HL_EDGE = 20; // fixed px from endpoint
        switch (textHAlign) {
            case 'left':
                baseX = xRange[0] + HL_EDGE;
                break;
            case 'right':
                baseX = xRange[1] - HL_EDGE;
                break;
            default:
                baseX = (xRange[0] + xRange[1]) / 2;
        }
        
        let offsetY = 5;
        if (textVAlign === 'top') {
            offsetY = -LINE_LABEL_OFFSET;
        } else if (textVAlign === 'bottom') {
            offsetY = LINE_LABEL_OFFSET;
        }

        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: y + offsetY + (this.style.textOffsetY || 0),
            anchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize, 
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle
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

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing vertical-line')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            
            const padding = 10;
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        this.renderTextLabel(scales, x, yRange);

        // Create single handle at the center (same style as other shapes)
        const centerY = (yRange[0] + yRange[1]) / 2;
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const handle = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', x)
            .attr('cy', centerY)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'ew-resize')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
        
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

        return this.group;
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

        // Horizontal offset from line
        const horizontalOffset = 8;
        
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
        
        // textHAlign controls position relative to the line
        // For middle vAlign: center = ON the line, left/right = beside the line
        // For top/bottom vAlign: left = left side, center/right = right side
        let baseX;
        let anchor;

        const clampPad = 2;

        if (textVAlign === 'middle') {
            if (textHAlign === 'left') {
                baseX = x - horizontalOffset;
                anchor = 'end';
            } else if (textHAlign === 'right') {
                baseX = x + horizontalOffset;
                anchor = 'start';
            } else {
                baseX = x;
                anchor = 'middle';
            }
        } else {
            // top/bottom: center behaves like right
            if (textHAlign === 'center') {
                baseX = x;
                anchor = 'middle';
            } else if (textHAlign === 'left') {
                baseX = x - horizontalOffset;
                anchor = 'end';
            } else {
                baseX = x + horizontalOffset;
                anchor = 'start';
            }
        }

        if (rotation !== 0) {
            anchor = 'middle';
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

        const tempText = this.group.append('text')
            .attr('font-size', fontSize)
            .attr('font-family', fontFamily)
            .attr('font-weight', fontWeight)
            .attr('font-style', fontStyle)
            .attr('text-anchor', 'middle')
            .style('visibility', 'hidden')
            .style('pointer-events', 'none');

        let maxTextWidth = 0;
        for (const line of textLines) {
            tempText.text(line && line.length ? line : ' ');
            const bbox = tempText.node().getBBox();
            maxTextWidth = Math.max(maxTextWidth, bbox.width || 0);
        }
        tempText.remove();

        const halfY = rotation === 0 ? (totalHeight / 2) : (maxTextWidth / 2);
        // Do not clamp X: label must follow the vertical line when panning/scrolling.
        // Clamp only Y to avoid pushing the label out of the visible plot vertically.
        baseY = Math.max(topY + halfY + clampPad, Math.min(bottomY - halfY - clampPad, baseY));

        const isCenteredOnLine = textVAlign === 'middle' && textHAlign === 'center' && rotation === 0;
        appendTextLabel(this.group, label, {
            x: baseX,
            y: baseY,
            anchor: anchor,
            yAnchor: isCenteredOnLine ? 'middle' : undefined,
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            rotation: rotation
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

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing ray')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            // Calculate slope
            const slope = dy / dx;
            
            if (dx > 0) {
                // Extend to right edge
                extendedX = chartRightX;
                extendedY = y1Screen + slope * (extendedX - x1Screen);
            } else {
                // Extend to left edge
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
            // Vertical ray
            extendedX = x1Screen;
            extendedY = dy > 0 ? yRange[0] : yRange[1];
        }

        // Check if we need to split the line for text
        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        
        this._splitInfo = null;
        
        if (shouldSplitLine) {
            const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

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

            const lineAngle = Math.atan2(extendedY - y1Screen, extendedX - x1Screen);

            const padding = 10;
            const capPad = Math.max(2, scaledStrokeWidth);
            const gapSize = textWidth + (padding * 2) + (capPad * 2);

            // Fixed 30px along line direction from endpoint, clamped within line
            const RAY_EDGE = 30;
            const rayLineLength = Math.sqrt((extendedX - x1Screen) ** 2 + (extendedY - y1Screen) ** 2);
            const ray_ux = rayLineLength > 0 ? (extendedX - x1Screen) / rayLineLength : 1;
            const ray_uy = rayLineLength > 0 ? (extendedY - y1Screen) / rayLineLength : 0;
            const p1IsLeft_ray = x1Screen <= extendedX;
            // visual left/right endpoints
            const ray_lvX = p1IsLeft_ray ? x1Screen : extendedX;
            const ray_lvY = p1IsLeft_ray ? y1Screen : extendedY;
            const ray_rvX = p1IsLeft_ray ? extendedX : x1Screen;
            const ray_rvY = p1IsLeft_ray ? extendedY : y1Screen;
            // offset vector: from left→right unit direction * 30px
            const ray_fwdX = ray_rvX > ray_lvX ? Math.abs(ray_ux) * RAY_EDGE : -Math.abs(ray_ux) * RAY_EDGE;
            const ray_fwdY = ray_rvX > ray_lvX ? Math.abs(ray_uy) * RAY_EDGE * Math.sign(ray_uy || 1) : -Math.abs(ray_uy) * RAY_EDGE * Math.sign(ray_uy || 1);
            let rawTextX, rawTextY;
            switch (textHAlign) {
                case 'left':
                    rawTextX = ray_lvX + Math.abs(ray_ux) * RAY_EDGE;
                    rawTextY = ray_lvY + Math.abs(ray_uy) * RAY_EDGE * (ray_lvY < ray_rvY ? 1 : -1);
                    break;
                case 'right':
                    rawTextX = ray_rvX - Math.abs(ray_ux) * RAY_EDGE;
                    rawTextY = ray_rvY - Math.abs(ray_uy) * RAY_EDGE * (ray_lvY < ray_rvY ? 1 : -1);
                    break;
                default:
                    rawTextX = (x1Screen + extendedX) / 2;
                    rawTextY = (y1Screen + extendedY) / 2;
            }
            const halfGapT_ray = rayLineLength > 0 ? (gapSize / 2) / rayLineLength : 0;
            const t_ray = rayLineLength > 0 ? Math.sqrt((rawTextX-x1Screen)**2+(rawTextY-y1Screen)**2) / rayLineLength : 0.5;
            const split1T_ray = Math.max(0, t_ray - halfGapT_ray);
            const split2T_ray = Math.min(1, t_ray + halfGapT_ray);
            const textX = rawTextX;
            const textY = rawTextY;
            const split1X = x1Screen + (extendedX - x1Screen) * split1T_ray;
            const split1Y = y1Screen + (extendedY - y1Screen) * split1T_ray;
            const split2X = x1Screen + (extendedX - x1Screen) * split2T_ray;
            const split2Y = y1Screen + (extendedY - y1Screen) * split2T_ray;

            this._splitInfo = {
                textX: textX,
                textY: textY,
                angle: lineAngle * (180 / Math.PI),
                gapSize: gapSize
            };

            // Draw invisible wider stroke for easier clicking (first segment)
            this.group.append('line')
                .attr('x1', x1Screen)
                .attr('y1', y1Screen)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw first segment (from start to gap)
            this.group.append('line')
                .attr('x1', x1Screen)
                .attr('y1', y1Screen)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');

            // Draw invisible wider stroke for easier clicking (second segment)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', extendedX)
                .attr('y2', extendedY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Draw second segment (from gap to end)
            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', extendedX)
                .attr('y2', extendedY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        } else {
            // Draw invisible wider stroke for easier clicking
            this.group.append('line')
                .attr('x1', x1Screen)
                .attr('y1', y1Screen)
                .attr('x2', extendedX)
                .attr('y2', extendedY)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            // Draw line normally without split
            this.group.append('line')
                .attr('x1', x1Screen)
                .attr('y1', y1Screen)
                .attr('x2', extendedX)
                .attr('y2', extendedY)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        this.renderTextLabel({
            x1: x1Screen,
            y1: y1Screen,
            x2: extendedX,
            y2: extendedY
        });

        // Create resize handles (only for the two defining points)
        this.createHandles(this.group, scales);

        return this.group;
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        // If we have split info, use it for exact positioning
        if (this._splitInfo) {
            let angle = this._splitInfo.angle;
            
            // Keep text readable by flipping it if upside down
            // Normalize angle to -180 to 180 range first
            while (angle > 180) angle -= 360;
            while (angle < -180) angle += 360;
            
            if (angle > 90 || angle < -90) {
                angle += 180;
            }

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
                rotation: angle
            });
            return;
        }

        const { x1, y1, x2, y2 } = coords;

        // Calculate angle of the line for text rotation
        let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const originalAngleRad = Math.atan2(y2 - y1, x2 - x1);

        // Keep text readable by flipping it if upside down
        const isFlipped = angle > 90 || angle < -90;
        if (isFlipped) {
            angle += 180;
        }

        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        const verticalOffset = LINE_LABEL_OFFSET;

        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        // Fixed 30px along line direction from visual endpoint
        const RL_EDGE = 30;
        const rl_lvX = x1 <= x2 ? x1 : x2;
        const rl_lvY = x1 <= x2 ? y1 : y2;
        const rl_rvX = x1 <= x2 ? x2 : x1;
        const rl_rvY = x1 <= x2 ? y2 : y1;
        const rl_len = Math.sqrt((rl_rvX-rl_lvX)**2 + (rl_rvY-rl_lvY)**2) || 1;
        const rl_ux = (rl_rvX - rl_lvX) / rl_len;
        const rl_uy = (rl_rvY - rl_lvY) / rl_len;
        let baseX, baseY;
        switch (textHAlign) {
            case 'left':
                baseX = rl_lvX + rl_ux * RL_EDGE;
                baseY = rl_lvY + rl_uy * RL_EDGE;
                break;
            case 'right':
                baseX = rl_rvX - rl_ux * RL_EDGE;
                baseY = rl_rvY - rl_uy * RL_EDGE;
                break;
            default:
                baseX = (x1 + x2) / 2;
                baseY = (y1 + y2) / 2;
        }

        const perpX = -Math.sin(originalAngleRad);
        const perpY = Math.cos(originalAngleRad);

        const signUp = perpY <= 0 ? 1 : -1;
        if (textVAlign === 'top') {
            baseX += perpX * verticalOffset * signUp;
            baseY += perpY * verticalOffset * signUp;
        } else if (textVAlign === 'bottom') {
            baseX -= perpX * verticalOffset * signUp;
            baseY -= perpY * verticalOffset * signUp;
        }

        const offsetX = this.style.textOffsetX || 0;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle
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

    render(container, scales) {
        this.ensureTextDefaults();

        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing horizontal-ray')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
                case 'left':  hr_rawTextX = x + HR_EDGE_S; break;
                case 'right': hr_rawTextX = chartRightX - HR_EDGE_S; break;
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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

        // Create single handle at the center (same behavior as Horizontal Line)
        const centerX = x;
        const handleRadius = 3;
        const handleStrokeWidth = 2;
        const hitRadius = 12;
        this.group.append('circle')
            .attr('class', 'resize-handle-hit')
            .attr('cx', centerX)
            .attr('cy', scales.yScale(p.y))
            .attr('r', hitRadius)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all')
            .style('opacity', 0)
            .attr('data-point-index', 0);
        const handle = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', centerX)
            .attr('cy', scales.yScale(p.y))
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);
        
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

        return this.group;
    }

    renderPriceLabel(scales, xRange, point) {
        // Format price value with appropriate decimal places
        const priceValue = point?.y;
        if (priceValue === undefined || priceValue === null) return;
        const formattedPrice = priceValue.toFixed(5); // Default to 5 decimals, can be customized
        
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

        const chartRightX = (scales.chart && scales.chart.margin && typeof scales.chart.w === 'number')
            ? (scales.chart.w - scales.chart.margin.r)
            : xRange[1];

        const y = scales.yScale(point.y);
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';
        
        const edgePadding = TEXT_EDGE_PADDING; // Distance from edges
        let baseX = (startX + chartRightX) / 2;

        const HR_EDGE = 30; // fixed px from endpoint
        switch (textHAlign) {
            case 'left':
                baseX = startX + HR_EDGE;
                break;
            case 'right':
                baseX = chartRightX - HR_EDGE;
                break;
            default:
                baseX = (startX + chartRightX) / 2;
        }
        
        let offsetY = 0;
        if (textVAlign === 'top') {
            offsetY = -LINE_LABEL_OFFSET;
        } else if (textVAlign === 'bottom') {
            offsetY = LINE_LABEL_OFFSET;
        }

        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: y + offsetY + (this.style.textOffsetY || 0),
            anchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle
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

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing extended-line')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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

            // Fixed 30px along line direction from visual endpoint (leftX/rightX already visual L/R)
            const EL_EDGE = 30;
            const el_lineLength = Math.sqrt((rightX - leftX) ** 2 + (rightY - leftY) ** 2);
            const el_ux = el_lineLength > 0 ? (rightX - leftX) / el_lineLength : 1;
            const el_uy = el_lineLength > 0 ? (rightY - leftY) / el_lineLength : 0;
            const halfGapT_el = el_lineLength > 0 ? (gapSize / 2) / el_lineLength : 0;
            let rawTextX_el, rawTextY_el;
            switch (textHAlign) {
                case 'left':
                    rawTextX_el = leftX + el_ux * EL_EDGE;
                    rawTextY_el = leftY + el_uy * EL_EDGE;
                    break;
                case 'right':
                    rawTextX_el = rightX - el_ux * EL_EDGE;
                    rawTextY_el = rightY - el_uy * EL_EDGE;
                    break;
                default:
                    rawTextX_el = (leftX + rightX) / 2;
                    rawTextY_el = (leftY + rightY) / 2;
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
                .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
        }

        this.renderTextLabel({
            x1: leftX,
            y1: leftY,
            x2: rightX,
            y2: rightY
        });

        // Create resize handles (only for the two defining points)
        this.createHandles(this.group, scales);

        return this.group;
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
        
        // Calculate angle of the line for text rotation
        let angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const originalAngleRad = Math.atan2(y2 - y1, x2 - x1);
        
        // Keep text readable by flipping it if upside down
        const isFlipped = angle > 90 || angle < -90;
        if (isFlipped) {
            angle += 180;
        }
        
        // Settings
        const fontSize = this.style.fontSize || DEFAULT_TEXT_STYLE.fontSize;
        const verticalOffset = LINE_LABEL_OFFSET;
        
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        // x1/y1 = leftX/leftY, x2/y2 = rightX/rightY (already visual L/R from render)
        // Fixed 30px along line direction from visual endpoint
        const EL_MAIN_EDGE = 30;
        const el_main_len = Math.sqrt((x2-x1)**2 + (y2-y1)**2) || 1;
        const el_main_ux = (x2 - x1) / el_main_len;
        const el_main_uy = (y2 - y1) / el_main_len;
        let baseX, baseY;
        switch (textHAlign) {
            case 'left':
                baseX = x1 + el_main_ux * EL_MAIN_EDGE;
                baseY = y1 + el_main_uy * EL_MAIN_EDGE;
                break;
            case 'right':
                baseX = x2 - el_main_ux * EL_MAIN_EDGE;
                baseY = y2 - el_main_uy * EL_MAIN_EDGE;
                break;
            default:
                baseX = (x1 + x2) / 2;
                baseY = (y1 + y2) / 2;
        }

        const perpX = -Math.sin(originalAngleRad);
        const perpY = Math.cos(originalAngleRad);
        
        const signUp = perpY <= 0 ? 1 : -1;
        if (textVAlign === 'top') {
            baseX += perpX * verticalOffset * signUp;
            baseY += perpY * verticalOffset * signUp;
        } else if (textVAlign === 'bottom') {
            baseX -= perpX * verticalOffset * signUp;
            baseY -= perpY * verticalOffset * signUp;
        }

        const offsetX = this.style.textOffsetX || 0;
        const rawOffsetY = (this.style.textOffsetY === undefined || this.style.textOffsetY === null)
            ? 0
            : this.style.textOffsetY;
        const offsetY = rawOffsetY === DEFAULT_TEXT_STYLE.textOffsetY ? 0 : rawOffsetY;

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: fontSize,
            fontFamily: this.style.fontFamily || DEFAULT_TEXT_STYLE.fontFamily,
            fontWeight: this.style.fontWeight || DEFAULT_TEXT_STYLE.fontWeight,
            fontStyle: this.style.fontStyle || DEFAULT_TEXT_STYLE.fontStyle,
            rotation: angle
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

    render(container, scales) {
        this.ensureTextDefaults();

        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing cross-line')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

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
            .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
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
            .attr('stroke-dasharray', this.style.strokeDasharray || this.style.dashArray || '')
            .attr('opacity', this.style.opacity)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Add price label if enabled
        if (this.style.showPriceLabel) {
            const priceText = p.y.toFixed(2);
            this.group.append('text')
                .attr('x', xRange[1] - 5)
                .attr('y', yScreen - 5)
                .attr('text-anchor', 'end')
                .attr('fill', this.style.stroke)
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .style('pointer-events', 'none')
                .text(priceText);
        }

        // Render text label if exists
        if (this.text && this.text.trim()) {
            appendTextLabel(this.group, this.text, {
                x: xScreen,
                y: yScreen,
                fontSize: this.style.fontSize,
                textColor: this.style.textColor,
                textAlign: this.style.textAlign,
                textPosition: this.style.textPosition,
                offsetX: this.style.textOffsetX || 10,
                offsetY: this.style.textOffsetY || -10
            });
        }

        // Create resize handle at intersection point
        this.createHandles(this.group, scales);

        return this.group;
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
