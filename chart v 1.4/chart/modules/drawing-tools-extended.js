/**
 * Drawing Tools - Extended Shapes Module
 * Implements: Highlighter, Arrow Markers, Circle, Arc, Curve, Double Curve, Rotated Rectangle
 */
console.log('🔧 Loading drawing-tools-extended.js...');

// ============================================================================
// Highlighter Tool (Freehand semi-transparent highlighting)
// ============================================================================
class HighlighterTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('highlighter', points, style);
        this.requiredPoints = -1; // Continuous drawing mode
        this.isContinuous = true;
        this.style.stroke = style.stroke || 'rgba(255, 235, 59, 0.7)';
        this.style.strokeWidth = style.strokeWidth || 20;
        this.style.opacity = style.opacity || 0.5;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing highlighter')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? 1 : 0);

        // Use D3 line with curve smoothing for freehand feel
        const lineGenerator = d3.line()
            .x(d => scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(d.x) : scales.xScale(d.x))
            .y(d => scales.yScale(d.y))
            .curve(d3.curveCatmullRom.alpha(0.5));

        const pathData = lineGenerator(this.points);

        // Draw the highlighter stroke (thick semi-transparent)
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

        // Always create handles (visibility controlled by opacity)
        this.createHandles(this.group, scales);

        return this.group;
    }

    createHandles(group, scales) {
        this.handles = []; // Reset handles array
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
        const tool = new HighlighterTool(data.points, data.style);
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
// Arrow Marker Tool (Single point arrow/pin marker)
// ============================================================================
class ArrowMarkerTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-marker', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || '#2962ff';
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 0;
        this.arrowHeadSize = style.arrowHeadSize || 40;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing arrow-marker')
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

        // Calculate angle and length
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Arrow dimensions - scale with length
        const scaleFactor = Math.max(0.5, Math.min(3, length / 200)); // Scale between 0.5x and 3x based on length
        
        const headSize = 40 * scaleFactor;
        const headWidth = 50 * scaleFactor; // Width of arrow head base
        const startWidth = 5 * scaleFactor; // Thin start point
        const endWidth = 35 * scaleFactor; // Wide end before head
        
        // Calculate arrow body end point (where head starts)
        const bodyEndX = x2 - headSize * Math.cos(angle);
        const bodyEndY = y2 - headSize * Math.sin(angle);
        
        // Calculate perpendicular offset
        const perpAngle = angle + Math.PI / 2;
        
        // Tapered body - starts thin, ends wide
        const startHalfWidth = startWidth / 2;
        const endHalfWidth = endWidth / 2;
        
        // Body corners (tapered trapezoid)
        const body1x = x1 + startHalfWidth * Math.cos(perpAngle);
        const body1y = y1 + startHalfWidth * Math.sin(perpAngle);
        const body2x = x1 - startHalfWidth * Math.cos(perpAngle);
        const body2y = y1 - startHalfWidth * Math.sin(perpAngle);
        const body3x = bodyEndX - endHalfWidth * Math.cos(perpAngle);
        const body3y = bodyEndY - endHalfWidth * Math.sin(perpAngle);
        const body4x = bodyEndX + endHalfWidth * Math.cos(perpAngle);
        const body4y = bodyEndY + endHalfWidth * Math.sin(perpAngle);
        
        // Arrow head (triangle)
        const halfHeadWidth = headWidth / 2;
        const head1x = bodyEndX + halfHeadWidth * Math.cos(perpAngle);
        const head1y = bodyEndY + halfHeadWidth * Math.sin(perpAngle);
        const head2x = bodyEndX - halfHeadWidth * Math.cos(perpAngle);
        const head2y = bodyEndY - halfHeadWidth * Math.sin(perpAngle);
        
        // Create path for filled tapered arrow
        const arrowPath = `M ${body1x} ${body1y} 
            L ${body4x} ${body4y} 
            L ${head1x} ${head1y} 
            L ${x2} ${y2} 
            L ${head2x} ${head2y} 
            L ${body3x} ${body3y} 
            L ${body2x} ${body2y} Z`;

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Fill (non-interactive)
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Border (interactive)
        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Stroke-only hit area (interactive)
        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(8, (this.style.strokeWidth || 2) * 4))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Render text at start point (p1)
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            
            // Position text at start point with offset to the left
            const textOffsetX = -10; // Offset to the left of start point
            const textOffsetY = 5; // Slight vertical offset for centering
            
            this.group.append('text')
                .attr('x', x1 + textOffsetX)
                .attr('y', y1 + textOffsetY)
                .attr('text-anchor', 'end') // Right-align text so it appears to the left
                .attr('dominant-baseline', 'middle')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkerTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        tool.markerSize = data.style?.markerSize || 20;
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
// Arrow Mark Up Tool (Upward pointing arrow)
// ============================================================================
class ArrowMarkUpTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-mark-up', points, style);
        this.requiredPoints = 1;
        this.style.fill = style.fill || '#089981';
        this.style.stroke = style.stroke || '#089981';
        this.style.strokeWidth = style.strokeWidth || 0;
        this.markerSize = style.markerSize || 24;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing arrow-mark-up')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const size = this.markerSize || this.style.markerSize || 24;

        // Draw upward arrow marker (chevron/arrow shape pointing up)
        const arrowWidth = size * 0.85; // Wider head
        const shaftWidth = size * 0.4;  // Wider shaft
        const headHeight = size * 0.6;  // Bigger head
        const legHeight = size * 0.45;  // Shorter leg
        const totalHeight = headHeight + legHeight;
        const topY = y - totalHeight / 2;
        const bottomY = y + totalHeight / 2;
        const headBaseY = topY + headHeight;
        
        const arrowPath = `M ${x} ${topY} 
            L ${x + arrowWidth/2} ${headBaseY} 
            L ${x + shaftWidth/2} ${headBaseY} 
            L ${x + shaftWidth/2} ${bottomY} 
            L ${x - shaftWidth/2} ${bottomY} 
            L ${x - shaftWidth/2} ${headBaseY} 
            L ${x - arrowWidth/2} ${headBaseY} Z`;

        // Add invisible larger hitbox for easier selection (render FIRST so it's behind the arrow)
        const hitboxPadding = size * 0.5;
        this.group.append('rect')
            .attr('class', 'arrow-marker-hitbox')
            .attr('x', x - size/2 - hitboxPadding)
            .attr('y', y - size/2 - hitboxPadding)
            .attr('width', size + hitboxPadding * 2)
            .attr('height', size + hitboxPadding * 2)
            .attr('fill', 'transparent')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Stroke-only hit area (interactive)
        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(8, size * 0.35))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Render text below the arrow
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            
            // Position text below the arrow
            const textOffsetY = size/2 + 8;
            
            this.group.append('text')
                .attr('x', x)
                .attr('y', y + textOffsetY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'hanging')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        // Don't create resize handles for arrow markers - they should only be movable
        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkUpTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        tool.markerSize = data.style?.markerSize || 24;
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
// Arrow Mark Down Tool (Downward pointing arrow)
// ============================================================================
class ArrowMarkDownTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow-mark-down', points, style);
        this.requiredPoints = 1;
        this.style.fill = style.fill || '#F23645';
        this.style.stroke = style.stroke || '#F23645';
        this.style.strokeWidth = style.strokeWidth || 0;
        this.markerSize = style.markerSize || 24;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing arrow-mark-down')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const size = this.markerSize || this.style.markerSize || 24;

        // Draw downward arrow marker (chevron/arrow shape pointing down)
        const arrowWidth = size * 0.85; // Wider head
        const shaftWidth = size * 0.4;  // Wider shaft
        const headHeight = size * 0.6;  // Bigger head
        const legHeight = size * 0.45;  // Shorter leg
        const totalHeight = headHeight + legHeight;
        const topY = y - totalHeight / 2;
        const bottomY = y + totalHeight / 2;
        const headBaseY = bottomY - headHeight;
        
        const arrowPath = `M ${x} ${bottomY} 
            L ${x + arrowWidth/2} ${headBaseY} 
            L ${x + shaftWidth/2} ${headBaseY} 
            L ${x + shaftWidth/2} ${topY} 
            L ${x - shaftWidth/2} ${topY} 
            L ${x - shaftWidth/2} ${headBaseY} 
            L ${x - arrowWidth/2} ${headBaseY} Z`;

        // Add invisible larger hitbox for easier selection (render FIRST so it's behind the arrow)
        const hitboxPadding = size * 0.5;
        this.group.append('rect')
            .attr('class', 'arrow-marker-hitbox')
            .attr('x', x - size/2 - hitboxPadding)
            .attr('y', y - size/2 - hitboxPadding)
            .attr('width', size + hitboxPadding * 2)
            .attr('height', size + hitboxPadding * 2)
            .attr('fill', 'transparent')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Fill hit area (interactive) - allows select/move/hover by fill
        this.group.append('path')
            .attr('class', 'arrow-fill-hit')
            .attr('d', arrowPath)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Stroke-only hit area (interactive)
        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(8, size * 0.35))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', arrowPath)
            .attr('fill', 'none')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', arrowPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Render text above the arrow
        if (this.text && this.text.trim()) {
            const textColor = this.style.textColor || '#FFFFFF';
            const fontSize = this.style.fontSize || 14;
            const fontWeight = this.style.fontWeight || 'normal';
            const fontStyle = this.style.fontStyle || 'normal';
            
            // Position text above the arrow
            const textOffsetY = -size/2 - 8;
            
            this.group.append('text')
                .attr('x', x)
                .attr('y', y + textOffsetY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'baseline')
                .attr('fill', textColor)
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .style('user-select', 'none')
                .text(this.text);
        }

        // Don't create resize handles for arrow markers - they should only be movable
        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowMarkDownTool(data.points, data.style);
        tool.id = data.id;
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        tool.markerSize = data.style?.markerSize || 24;
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
// Circle Tool (Perfect circle - constrained ellipse)
// ============================================================================
class CircleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('circle', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || 'rgba(41, 98, 255, 0.1)';
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing circle')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        
        // Calculate radius based on distance between points
        const dx = x2 - x1;
        const dy = y2 - y1;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        // Center is first point
        const cx = x1;
        const cy = y1;

        this.group.append('circle')
            .attr('class', 'shape-fill')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', radius)
            .attr('stroke', 'none')
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        const desiredHitWidth = Math.max(8, this.style.strokeWidth * 4);
        const maxHitWidth = Math.max(8, radius * 0.35);
        const hitWidth = Math.min(desiredHitWidth, maxHitWidth);

        const segments = 64;
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: cx + radius * Math.cos(a),
                y: cy + radius * Math.sin(a)
            });
        }

        for (let i = 0; i < segments; i++) {
            const pA = pts[i];
            const pB = pts[(i + 1) % segments];

            this.group.append('line')
                .attr('class', 'shape-border')
                .attr('x1', pA.x)
                .attr('y1', pA.y)
                .attr('x2', pB.x)
                .attr('y2', pB.y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', pA.x)
                .attr('y1', pA.y)
                .attr('x2', pB.x)
                .attr('y2', pB.y)
                .attr('stroke', 'transparent')
                .attr('stroke-width', hitWidth)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        }

        // Render middle line if enabled (horizontal only)
        if (this.style.showMiddleLine) {
            const midLineColor = this.style.middleLineColor || '#2962FF';
            const midLineWidth = this.style.middleLineWidth || 1;
            const midLineDash = this.style.middleLineDash || '';
            
            // Horizontal middle line
            this.group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', cx - radius)
                .attr('y1', cy)
                .attr('x2', cx + radius)
                .attr('y2', cy)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none');
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new CircleTool(data.points, data.style);
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
// Rotated Rectangle Tool (TradingView style)
// 3 points: P1-P2 define one edge (and rotation), P3 defines height
// Drawing: 2 clicks - second click+drag sets rotation and height together
// ============================================================================
class RotatedRectangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('rotated-rectangle', points, style);
        this.requiredPoints = 2; // Only need 2 clicks, P3 is set during P2 drag
        this.style.fill = style.fill || 'rgba(156, 39, 176, 0.1)';
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing rotated-rectangle')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Get pixel coordinates
        const toPixelX = (x) => scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(x) : scales.xScale(x);
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = toPixelX(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = toPixelX(p2.x);
        const y2 = scales.yScale(p2.y);

        // Calculate base edge length and angle
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // Calculate height from third point (perpendicular distance)
        let height = 50; // Default height while drawing
        if (this.points.length >= 3) {
            const p3 = this.points[2];
            const x3 = toPixelX(p3.x);
            const y3 = scales.yScale(p3.y);
            // Perpendicular distance from p3 to line p1-p2
            const dx = x3 - x1;
            const dy = y3 - y1;
            height = dx * Math.sin(-angle) + dy * Math.cos(-angle);
        }

        // Build the 4 corners of the rotated rectangle
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const perpX = -sin * height;
        const perpY = cos * height;

        const corners = [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            { x: x2 + perpX, y: y2 + perpY },
            { x: x1 + perpX, y: y1 + perpY }
        ];

        const pathData = `M ${corners[0].x} ${corners[0].y} 
                          L ${corners[1].x} ${corners[1].y} 
                          L ${corners[2].x} ${corners[2].y} 
                          L ${corners[3].x} ${corners[3].y} Z`;

        // Draw fill
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pathData)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none');

        // Draw border
        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', pathData)
            .attr('fill', 'transparent')
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('opacity', this.style.opacity)
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'visibleStroke')
            .style('cursor', 'move');

        // Invisible wider hit area for easier selection
        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.corners = corners;
        this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        if (this.points.length < 2 || !this.corners) return;

        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;

        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();

        // Center point
        const centerX = (this.corners[0].x + this.corners[2].x) / 2;
        const centerY = (this.corners[0].y + this.corners[2].y) / 2;

        group.append('g')
            .attr('class', 'resize-handle-group')
            .attr('data-handle-role', 'center')
            .append('circle')
            .attr('class', 'resize-handle center-handle')
            .attr('cx', centerX)
            .attr('cy', centerY)
            .attr('r', handleRadius)
            .attr('fill', handleFill)
            .attr('stroke', handleStroke)
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-handle-role', 'center');

        // Middle of base edge (for rotation) - between corners 0 and 1
        const midBase = {
            x: (this.corners[0].x + this.corners[1].x) / 2,
            y: (this.corners[0].y + this.corners[1].y) / 2
        };
        // Middle of opposite edge - between corners 2 and 3
        const midOpposite = {
            x: (this.corners[2].x + this.corners[3].x) / 2,
            y: (this.corners[2].y + this.corners[3].y) / 2
        };

        // 2 Rotation handles at middle of edges
        const edgeHandles = [
            { pos: midBase, role: 'rotate-0' },
            { pos: midOpposite, role: 'rotate-1' }
        ];

        edgeHandles.forEach(handle => {
            group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', handle.role)
                .append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', handle.pos.x)
                .attr('cy', handle.pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'grab')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', handle.role);
        });

        // 4 Corner handles for resizing
        const cornerHandles = [
            { pos: this.corners[0], role: 'resize-0' },
            { pos: this.corners[1], role: 'resize-1' },
            { pos: this.corners[2], role: 'resize-2' },
            { pos: this.corners[3], role: 'resize-3' }
        ];

        cornerHandles.forEach(handle => {
            group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', handle.role)
                .append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', handle.pos.x)
                .attr('cy', handle.pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', handle.role);
        });
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, scales, screen } = context;
        if (!dataPoint) return false;

        if (handleRole === 'center') {
            // Move entire shape
            this._lastDragAngle = undefined; // Reset rotation state
            this._lastDragHandle = undefined; // Reset handle tracking
            const p1 = this.points[0];
            const p2 = this.points[1];
            const oldCenterX = (p1.x + p2.x) / 2;
            const oldCenterY = (p1.y + p2.y) / 2;
            const dx = dataPoint.x - oldCenterX;
            const dy = dataPoint.y - oldCenterY;
            
            this.points[0] = { x: p1.x + dx, y: p1.y + dy };
            this.points[1] = { x: p2.x + dx, y: p2.y + dy };
            if (this.points.length >= 3) {
                const p3 = this.points[2];
                this.points[2] = { x: p3.x + dx, y: p3.y + dy };
            }
        } else if (handleRole === 'rotate-0' || handleRole === 'rotate-1') {
            // Middle edge handles - rotation AND resize with opposite edge as pivot
            
            // Reset state when switching between handles to prevent flipping
            if (this._lastDragHandle !== handleRole) {
                this._lastDragAngle = undefined;
                this._lastDragDistance = undefined;
                this._lastDragHandle = handleRole;
            }
            
            if (!scales || !scales.yScale || !this.corners || this.corners.length < 4) {
                return true;
            }
            
            const chart = scales.chart;
            const toPixelX = (x) => chart && chart.dataIndexToPixel ? chart.dataIndexToPixel(x) : scales.xScale(x);
            const toDataX = (px) => chart && chart.pixelToDataIndex ? chart.pixelToDataIndex(px) : scales.xScale.invert(px);
            const toDataY = (py) => scales.yScale.invert(py);
            
            // Calculate pivot at opposite edge midpoint
            let pivotX, pivotY;
            if (handleRole === 'rotate-0') {
                // Dragging base edge -> pivot at opposite edge midpoint
                pivotX = (this.corners[2].x + this.corners[3].x) / 2;
                pivotY = (this.corners[2].y + this.corners[3].y) / 2;
            } else {
                // Dragging opposite edge -> pivot at base edge midpoint
                pivotX = (this.corners[0].x + this.corners[1].x) / 2;
                pivotY = (this.corners[0].y + this.corners[1].y) / 2;
            }
            
            const pointerX = (screen && typeof screen.x === 'number') ? screen.x : toPixelX(dataPoint.x);
            const pointerY = (screen && typeof screen.y === 'number') ? screen.y : scales.yScale(dataPoint.y);
            
            const dragAngle = Math.atan2(pointerY - pivotY, pointerX - pivotX);
            const dragDistance = Math.sqrt(Math.pow(pointerX - pivotX, 2) + Math.pow(pointerY - pivotY, 2));
            
            if (this._lastDragAngle === undefined || this._lastDragDistance === undefined) {
                this._lastDragAngle = dragAngle;
                this._lastDragDistance = dragDistance;
                return true;
            }
            
            let angleDelta = dragAngle - this._lastDragAngle;
            while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
            while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
            
            // Calculate scale factor based on distance change (with reduced sensitivity)
            const resizeSensitivity = 0.3; // Lower = slower resize (0.3 = 30% of normal speed)
            const rawScaleFactor = this._lastDragDistance > 0 ? dragDistance / this._lastDragDistance : 1;
            const scaleFactor = 1 + (rawScaleFactor - 1) * resizeSensitivity;
            
            this._lastDragAngle = dragAngle;
            this._lastDragDistance = dragDistance;
            
            const cos = Math.cos(angleDelta);
            const sin = Math.sin(angleDelta);
            
            // Rotate AND scale screen point around pivot
            const rotateAndScaleScreenPoint = (sx, sy) => {
                const dx = sx - pivotX;
                const dy = sy - pivotY;
                // First rotate
                const rotX = dx * cos - dy * sin;
                const rotY = dx * sin + dy * cos;
                // Then scale
                return {
                    x: pivotX + rotX * scaleFactor,
                    y: pivotY + rotY * scaleFactor
                };
            };
            
            // Get current data points in screen space
            const p1 = this.points[0];
            const p2 = this.points[1];
            const p3 = this.points.length >= 3 ? this.points[2] : null;
            
            const s1 = { x: toPixelX(p1.x), y: scales.yScale(p1.y) };
            const s2 = { x: toPixelX(p2.x), y: scales.yScale(p2.y) };
            
            // Rotate and scale all points around the pivot
            const s1Rot = rotateAndScaleScreenPoint(s1.x, s1.y);
            const s2Rot = rotateAndScaleScreenPoint(s2.x, s2.y);
            
            this.points[0] = {
                x: toDataX(s1Rot.x),
                y: toDataY(s1Rot.y)
            };
            this.points[1] = {
                x: toDataX(s2Rot.x),
                y: toDataY(s2Rot.y)
            };
            
            if (p3) {
                const s3 = { x: toPixelX(p3.x), y: scales.yScale(p3.y) };
                const s3Rot = rotateAndScaleScreenPoint(s3.x, s3.y);
                this.points[2] = {
                    x: toDataX(s3Rot.x),
                    y: toDataY(s3Rot.y)
                };
            }
        } else if (handleRole === 'resize-0' || handleRole === 'resize-1' || 
                   handleRole === 'resize-2' || handleRole === 'resize-3') {
            // Corner handles - resize by adjusting height (point 3)
            this._lastDragAngle = undefined; // Reset rotation state
            this._lastDragHandle = undefined; // Reset handle tracking
            if (this.points.length < 3) {
                this.points.push({ x: dataPoint.x, y: dataPoint.y });
            } else {
                this.points[2] = { x: dataPoint.x, y: dataPoint.y };
            }
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data, chart = null) {
        const tool = new RotatedRectangleTool(data.points, data.style);
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
// Arc Tool (Curved arc segment) - Same drawing behavior as Curve
// ============================================================================
class ArcTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arc', points, style);
        this.requiredPoints = 2; // Start and End only - control point auto-generated (like curve)
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.ensureTextDefaults();
        this.controlPointSensitivity = 1.0;
        this.controlPointOffset = null;
    }
    
    // Generate control point when drawing is complete (2 points placed)
    finalizeDrawing() {
        if (this.points.length === 2 && !this._controlPointGenerated) {
            const p1 = this.points[0];
            const p2 = this.points[1];
            
            // Use midpoint - curve offset will be applied in screen space during render
            const controlPoint = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };
            
            // Rearrange: [start, control, end]
            this.points = [p1, controlPoint, p2];
            this._controlPointGenerated = true;
            this._needsScreenOffset = true;
        }
    }
    
    ensureTextDefaults() {
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
    }
    
    setText(text) {
        this.text = text;
    }
    
    // Custom handle drag for control point (same as curve)
    handleCustomHandleDrag(handleRole, context) {
        const { point, pointIndex } = context;
        
        // Initialize drag tracking on first call
        if (!this._isDragging) {
            this._isDragging = true;
            if (pointIndex === 1 && this.points.length >= 3) {
                this._dragStartControlPoint = { ...this.points[1] };
                this._dragStartMousePoint = { ...point };
            }
        }
        
        // For middle control point (index 1), calculate control point from curve midpoint
        if (pointIndex === 1 && this.points.length >= 3) {
            // Mouse position is where user wants the curve midpoint to be
            // For quadratic Bezier at t=0.5: curvePoint = 0.25*P0 + 0.5*P1 + 0.25*P2
            // Solving for P1: P1 = 2*curvePoint - 0.5*(P0 + P2)
            const p0 = this.points[0];
            const p2 = this.points[2];
            this.points[1] = {
                x: 2 * point.x - 0.5 * (p0.x + p2.x),
                y: 2 * point.y - 0.5 * (p0.y + p2.y)
            };
        } else {
            // Start/end points follow mouse directly
            this.points[pointIndex] = point;
        }
    }
    
    // Clean up after drag
    endHandleDrag(handleRole, context) {
        this._isDragging = false;
        this._dragStartControlPoint = null;
        this._dragStartMousePoint = null;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;
        
        // Auto-generate control point if we have exactly 2 points and drawing is complete
        if (this.points.length === 2 && !this._controlPointGenerated) {
            this.finalizeDrawing();
        }

        this.group = container.append('g')
            .attr('class', 'drawing arc')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points.length >= 3 ? this.points[2] : this.points[1]; // End point
        const controlPoint = this.points.length >= 3 ? this.points[1] : null;
        
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);

        // If no control point yet, show a straight line preview
        if (!controlPoint) {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', this.style.strokeWidth)
                .attr('opacity', this.style.opacity);
            return this.group;
        }

        // Full arc with control point
        let ctrlX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(controlPoint.x) : scales.xScale(controlPoint.x);
        let ctrlY = scales.yScale(controlPoint.y);
        
        // Apply initial screen offset if needed (like curve)
        if (this._needsScreenOffset) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                const perpX = -dy / length;
                const perpY = dx / length;
                const offsetDistance = Math.min(50, length * 0.3);
                
                // Calculate control point to achieve desired curve midpoint offset
                const targetMidX = midX + perpX * offsetDistance;
                const targetMidY = midY + perpY * offsetDistance;
                ctrlX = 2 * targetMidX - 0.5 * (x1 + x2);
                ctrlY = 2 * targetMidY - 0.5 * (y1 + y2);
                
                // Convert back to data coordinates and store
                if (scales.chart && scales.chart.pixelToDataIndex) {
                    controlPoint.x = scales.chart.pixelToDataIndex(ctrlX);
                } else {
                    controlPoint.x = scales.xScale.invert(ctrlX);
                }
                controlPoint.y = scales.yScale.invert(ctrlY);
            }
            this._needsScreenOffset = false;
        }

        // Draw the arc using quadratic curve
        const pathData = `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`;

        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        this.renderTextLabel({ x1, y1, x2, y2, scales });
        this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        this.handles = [];
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 3) {
            super.createHandles(group, scales);
            return;
        }
        
        // Points: [start, control, end]
        const p1 = this.points[0];
        const controlPoint = this.points[1];
        const p2 = this.points[2];
        
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const ctrlX = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(controlPoint.x) : scales.xScale(controlPoint.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        const ctrlY = scales.yScale(controlPoint.y);
        
        // Calculate midpoint on the quadratic bezier curve (t=0.5)
        const t = 0.5;
        const midX = (1-t)*(1-t)*x1 + 2*(1-t)*t*ctrlX + t*t*x2;
        const midY = (1-t)*(1-t)*y1 + 2*(1-t)*t*ctrlY + t*t*y2;
        
        // Handles: start (0), midpoint on curve (1 - controls the control point), end (2)
        const handlePositions = [
            { x: x1, y: y1, index: 0 },
            { x: midX, y: midY, index: 1 },
            { x: x2, y: y2, index: 2 }
        ];
        
        handlePositions.forEach(pos => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', pos.index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', pos.index);
            
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

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2, scales } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        const TEXT_ALIGN_TO_ANCHOR = {
            'left': 'start',
            'center': 'middle',
            'right': 'end'
        };

        if (window.appendTextLabel) {
            window.appendTextLabel(this.group, label, {
                x: baseX + (this.style.textOffsetX || 0),
                y: baseY + (this.style.textOffsetY || 0),
                anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] || 'middle',
                fontSize: this.style.fontSize || 14,
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal',
                color: this.style.textColor || this.style.stroke
            });
        }
    }

    static fromJSON(data, chart = null) {
        const tool = new ArcTool(data.points, data.style);
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
// Curve Tool (Bezier curve with control points)
// ============================================================================
class CurveTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('curve', points, style);
        this.requiredPoints = 2; // Start and End only - control point auto-generated
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.ensureTextDefaults();
        this.controlPointSensitivity = 1.0; // 1:1 mouse movement
        this.controlPointOffset = null; // Store the control point offset from midpoint
    }
    
    // Generate control point when drawing is complete (2 points placed)
    // Note: Offset is calculated in render() using screen coordinates
    finalizeDrawing() {
        if (this.points.length === 2 && !this._controlPointGenerated) {
            const p1 = this.points[0];
            const p2 = this.points[1];
            
            // Just use midpoint - curve offset will be applied in screen space during render
            const controlPoint = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };
            
            // Rearrange: [start, control, end]
            this.points = [p1, controlPoint, p2];
            this._controlPointGenerated = true;
            this._needsScreenOffset = true; // Flag to apply offset in screen space
        }
    }
    
    ensureTextDefaults() {
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.textColor) this.style.textColor = '#FFFFFF';
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
        if (this.style.textOffsetX === undefined) this.style.textOffsetX = 0;
        if (this.style.textOffsetY === undefined) this.style.textOffsetY = -8;
    }
    
    setText(text) {
        this.text = text;
    }
    
    // Custom handle drag for control point with reduced sensitivity
    handleCustomHandleDrag(handleRole, context) {
        const { point, pointIndex } = context;
        
        // Initialize drag tracking on first call
        if (!this._isDragging) {
            this._isDragging = true;
            if (pointIndex === 1 && this.points.length >= 3) {
                this._dragStartControlPoint = { ...this.points[1] };
                this._dragStartMousePoint = { ...point };
            }
        }
        
        // For middle control point (index 1), calculate control point from curve midpoint
        if (pointIndex === 1 && this.points.length >= 3) {
            // Mouse position is where user wants the curve midpoint to be
            // For quadratic Bezier at t=0.5: curvePoint = 0.25*P0 + 0.5*P1 + 0.25*P2
            // Solving for P1: P1 = 2*curvePoint - 0.5*(P0 + P2)
            const p0 = this.points[0];
            const p2 = this.points[2];
            this.points[1] = {
                x: 2 * point.x - 0.5 * (p0.x + p2.x),
                y: 2 * point.y - 0.5 * (p0.y + p2.y)
            };
        } else {
            // Start/end points follow mouse directly
            this.points[pointIndex] = point;
        }
    }
    
    // Clean up after drag
    endHandleDrag(handleRole, context) {
        this._isDragging = false;
        this._dragStartControlPoint = null;
        this._dragStartMousePoint = null;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;
        
        // Auto-generate control point if we have exactly 2 points and drawing is complete
        if (this.points.length === 2 && !this._controlPointGenerated) {
            this.finalizeDrawing();
        }

        this.group = container.append('g')
            .attr('class', 'drawing curve')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Map points AFTER finalizeDrawing so we have all 3 points
        const screenPoints = this.points.map(p => ({
            x: scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x),
            y: scales.yScale(p.y)
        }));

        // Apply initial curve offset in screen space (only once when first created)
        if (this._needsScreenOffset && screenPoints.length >= 3) {
            const p0 = screenPoints[0];
            const p2 = screenPoints[2];
            const dx = p2.x - p0.x;
            const dy = p2.y - p0.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 1) {
                // 15% perpendicular offset in screen pixels
                const offsetAmount = length * 0.15;
                const perpX = -dy / length * offsetAmount;
                const perpY = dx / length * offsetAmount;
                
                // Offset the middle control point in screen space
                screenPoints[1].x += perpX;
                screenPoints[1].y += perpY;
                
                // Convert back to data coordinates and store
                const newControlX = scales.chart && scales.chart.pixelToDataIndex ? 
                    scales.chart.pixelToDataIndex(screenPoints[1].x) : scales.xScale.invert(screenPoints[1].x);
                const newControlY = scales.yScale.invert(screenPoints[1].y);
                this.points[1] = { x: newControlX, y: newControlY };
            }
            this._needsScreenOffset = false;
        }

        // Store original points for text positioning
        const origScreenPoints = [...screenPoints];

        let pathData;
        if (screenPoints.length === 2) {
            // Simple line if only 2 points
            pathData = `M ${screenPoints[0].x} ${screenPoints[0].y} L ${screenPoints[1].x} ${screenPoints[1].y}`;
        } else if (screenPoints.length >= 3) {
            // Quadratic bezier with middle point as control
            pathData = `M ${screenPoints[0].x} ${screenPoints[0].y} Q ${screenPoints[1].x} ${screenPoints[1].y} ${screenPoints[2].x} ${screenPoints[2].y}`;
        }

        // Add line extensions if needed
        if (screenPoints.length >= 3 && (this.style.extendLeft || this.style.extendRight)) {
            const extendLength = 10000;
            
            if (this.style.extendLeft) {
                // Tangent at start: direction from P0 to P1
                const dx = screenPoints[1].x - screenPoints[0].x;
                const dy = screenPoints[1].y - screenPoints[0].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length > 0) {
                    const dirX = dx / length;
                    const dirY = dy / length;
                    const extX = screenPoints[0].x - dirX * extendLength;
                    const extY = screenPoints[0].y - dirY * extendLength;
                    pathData = `M ${extX} ${extY} L ${screenPoints[0].x} ${screenPoints[0].y} ` + pathData.substring(pathData.indexOf('Q'));
                }
            }
            
            if (this.style.extendRight) {
                // Tangent at end: direction from P2 to P1 (reversed)
                const endIdx = screenPoints.length - 1;
                const dx = screenPoints[endIdx - 1].x - screenPoints[endIdx].x;
                const dy = screenPoints[endIdx - 1].y - screenPoints[endIdx].y;
                const length = Math.sqrt(dx * dx + dy * dy);
                
                if (length > 0) {
                    const dirX = dx / length;
                    const dirY = dy / length;
                    const extX = screenPoints[endIdx].x - dirX * extendLength;
                    const extY = screenPoints[endIdx].y - dirY * extendLength;
                    pathData += ` L ${extX} ${extY}`;
                }
            }
        } else if (screenPoints.length === 2 && (this.style.extendLeft || this.style.extendRight)) {
            // For simple line, extend the line itself
            const dx = screenPoints[1].x - screenPoints[0].x;
            const dy = screenPoints[1].y - screenPoints[0].y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                const dirX = dx / length;
                const dirY = dy / length;
                const extendLength = 10000;
                
                let startX = screenPoints[0].x;
                let startY = screenPoints[0].y;
                let endX = screenPoints[1].x;
                let endY = screenPoints[1].y;
                
                if (this.style.extendLeft) {
                    startX = screenPoints[0].x - dirX * extendLength;
                    startY = screenPoints[0].y - dirY * extendLength;
                }
                if (this.style.extendRight) {
                    endX = screenPoints[1].x + dirX * extendLength;
                    endY = screenPoints[1].y + dirY * extendLength;
                }
                
                pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
            }
        }

        // Create arrow markers if needed for CurveTool
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

        // Invisible hit path for easier clicking (match HorizontalLineTool pattern)
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const path = this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');
        
        // Apply arrow markers to CurveTool
        if (startStyle === 'arrow') {
            path.attr('marker-start', `url(#arrow-start-${this.id})`);
        }
        if (endStyle === 'arrow') {
            path.attr('marker-end', `url(#arrow-end-${this.id})`);
        }


        // Render text label if present (use original coordinates, not extended)
        if (origScreenPoints.length >= 2) {
            const x1 = origScreenPoints[0].x;
            const y1 = origScreenPoints[0].y;
            const x2 = origScreenPoints[origScreenPoints.length - 1].x;
            const y2 = origScreenPoints[origScreenPoints.length - 1].y;
            this.renderTextLabel({ x1, y1, x2, y2, scales });
        }

        this.createHandles(this.group, scales);
        return this.group;
    }

    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 3) {
            super.createHandles(group, scales);
            return;
        }
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2];
        
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const x3 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p3.x) : scales.xScale(p3.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        const y3 = scales.yScale(p3.y);
        
        // Handle at curve midpoint (on the curve) for visual clarity
        const t = 0.5;
        const curveMidX = (1-t)*(1-t)*x1 + 2*(1-t)*t*x2 + t*t*x3;
        const curveMidY = (1-t)*(1-t)*y1 + 2*(1-t)*t*y2 + t*t*y3;
        
        const handlePositions = [
            { x: x1, y: y1, index: 0 },
            { x: curveMidX, y: curveMidY, index: 1 },  // On curve midpoint
            { x: x3, y: y3, index: 2 }
        ];
        
        handlePositions.forEach(pos => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', pos.index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', pos.index);
            
            handle.on('mouseenter', function() {
                d3.select(this).transition().duration(150)
                    .attr('r', handleRadius + 1)
                    .attr('stroke-width', handleStrokeWidth + 0.5);
            })
            .on('mouseleave', function() {
                d3.select(this).transition().duration(150)
                    .attr('r', handleRadius)
                    .attr('stroke-width', handleStrokeWidth);
            });
            
            this.handles.push(handleGroup);
        });
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2 } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        switch (this.style.textPosition) {
            case 'start':
                baseX = x1;
                baseY = y1;
                break;
            case 'end':
                baseX = x2;
                baseY = y2;
                break;
            case 'middle':
            default:
                baseX = midX;
                baseY = midY;
                break;
        }

        const offsetX = this.style.textOffsetX || 0;
        const offsetY = this.style.textOffsetY || -8;

        appendTextLabel(this.group, label, {
            x: baseX + offsetX,
            y: baseY + offsetY,
            anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] || 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || 14,
            fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
            fontWeight: this.style.fontWeight || 'normal',
            fontStyle: this.style.fontStyle || 'normal'
        });
    }

    static fromJSON(data, chart = null) {
        const tool = new CurveTool(data.points, data.style);
        tool.id = data.id;
        tool.text = data.text || '';
        tool.visible = data.visible !== undefined ? data.visible : true;
        tool.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        tool.chart = chart;
        // Mark as generated if loading with 3 points (already has control point)
        if (data.points && data.points.length >= 3) {
            tool._controlPointGenerated = true;
        }
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
// Double Curve Tool (S-curve with 4 points - smooth wave pattern)
// ============================================================================
class DoubleCurveTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('double-curve', points, style);
        this.requiredPoints = 2; // 2 points - auto-generate S-curve
        this.style.fill = style.fill || 'none';
        this.text = style.text || '';
        this.waveAmplitude1 = null; // Amplitude for first control point (peak)
        this.waveAmplitude2 = null; // Amplitude for second control point (valley)
        this.ensureTextDefaults();
    }
    
    ensureTextDefaults() {
        if (!this.style.fontSize) this.style.fontSize = 14;
        if (!this.style.textColor) this.style.textColor = '#FFFFFF';
        if (!this.style.textAlign) this.style.textAlign = 'center';
        if (!this.style.textPosition) this.style.textPosition = 'middle';
        if (this.style.textOffsetX === undefined) this.style.textOffsetX = 0;
        if (this.style.textOffsetY === undefined) this.style.textOffsetY = -8;
    }
    
    setText(text) {
        this.text = text;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing double-curve')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Convert endpoints to screen coordinates first
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        const screenP1 = {
            x: scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x),
            y: scales.yScale(p1.y)
        };
        const screenP2 = {
            x: scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x),
            y: scales.yScale(p2.y)
        };
        
        const screenDx = screenP2.x - screenP1.x;
        const screenDy = screenP2.y - screenP1.y;
        
        // Initialize control points if they don't exist
        if (this.points.length === 2) {
            // Create default control points at 1/3 and 2/3 positions with offset
            // Calculate offset in data coordinates - make it bigger for more visible curve
            const dataDy = this.points[1].y - this.points[0].y;
            const defaultOffset = Math.abs(dataDy) * 0.5;
            this.points.push(
                { x: this.points[0].x + (this.points[1].x - this.points[0].x) * 0.33, 
                  y: this.points[0].y + (this.points[1].y - this.points[0].y) * 0.33 + defaultOffset },
                { x: this.points[0].x + (this.points[1].x - this.points[0].x) * 0.67, 
                  y: this.points[0].y + (this.points[1].y - this.points[0].y) * 0.67 - defaultOffset }
            );
        }
        
        // Convert control points to screen coordinates
        const screenCP1 = {
            x: scales.chart.dataIndexToPixel(this.points[2].x),
            y: scales.yScale(this.points[2].y)
        };
        const screenCP2 = {
            x: scales.chart.dataIndexToPixel(this.points[3].x),
            y: scales.yScale(this.points[3].y)
        };
        
        // Build screen points array for rendering
        const screenPoints = [screenP1, screenP2, screenCP1, screenCP2];

        let pathData;
        
        if (screenPoints.length >= 2) {
            // Generate smooth curve using control points (like TradingView)
            pathData = this.generateSCurveWaveIndependent(screenPoints[0], screenPoints[1], screenPoints[2], screenPoints[3]);
        }

        // Invisible hit path for easier clicking (match HorizontalLineTool pattern)
        this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(16, (this.style.strokeWidth || 2) * 5))
            .attr('stroke-dasharray', null)
            .attr('fill', 'none')
            .attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw the main curve path
        const path = this.group.append('path')
            .attr('d', pathData)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('stroke-dasharray', this.style.strokeDasharray || null)
            .attr('fill', 'none')
            .attr('opacity', this.style.opacity)
            .attr('stroke-linecap', 'round')
            .attr('stroke-linejoin', 'round')
            .attr('data-original-width', this.style.strokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Arrow markers
        const startStyle = this.style.startStyle || 'normal';
        const endStyle = this.style.endStyle || 'normal';
        
        if (startStyle === 'arrow' || endStyle === 'arrow') {
            const svg = d3.select(container.node().ownerSVGElement);
            
            if (startStyle === 'arrow') {
                const startMarkerId = `arrow-start-${this.id}`;
                if (typeof SVGHelpers !== 'undefined') {
                    SVGHelpers.createArrowMarker(svg, startMarkerId, this.style.stroke);
                }
                path.attr('marker-start', `url(#${startMarkerId})`);
            }
            
            if (endStyle === 'arrow') {
                const endMarkerId = `arrow-end-${this.id}`;
                if (typeof SVGHelpers !== 'undefined') {
                    SVGHelpers.createArrowMarker(svg, endMarkerId, this.style.stroke);
                }
                path.attr('marker-end', `url(#${endMarkerId})`);
            }
        }

        // Create handles for all points
        this.createHandles(this.group, scales);
        
        return this.group;
    }
    
    // Calculate amplitude from control points
    calculateAmplitudeFromControlPoints(screenPoints) {
        if (screenPoints.length < 4) {
            return Math.abs(screenPoints[1].y - screenPoints[0].y) * 0.5;
        }
        
        // Use the average distance of control points from the baseline
        const p1 = screenPoints[0];
        const p2 = screenPoints[1];
        const cp1 = screenPoints[2];
        const cp2 = screenPoints[3];
        
        // Calculate baseline y at control point x positions
        const t1 = 0.25;
        const t2 = 0.75;
        const baselineY1 = p1.y + (p2.y - p1.y) * t1;
        const baselineY2 = p1.y + (p2.y - p1.y) * t2;
        
        // Distance from baseline
        const dist1 = Math.abs(cp1.y - baselineY1);
        const dist2 = Math.abs(cp2.y - baselineY2);
        
        return (dist1 + dist2) / 2;
    }
    
    // Generate smooth curve using control points (like TradingView)
    generateSCurveWaveIndependent(p1, p2, cp1, cp2) {
        // Use D3's curve generator with the control points
        // This creates a smooth curve that passes through/near the control points
        const points = [p1, cp1, cp2, p2];
        
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5));
        
        return lineGenerator(points);
    }
    
    // Keep old method for backward compatibility
    generateSCurveWave(p1, p2, amplitude) {
        return this.generateSCurveWaveIndependent(p1, p2, amplitude, amplitude);
    }
    
    // Generate Catmull-Rom spline path that passes through all points
    generateCatmullRomPath(points) {
        if (points.length < 2) return '';
        if (points.length === 2) {
            return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
        }
        
        // Use D3's Catmull-Rom curve for smooth interpolation through all points
        const lineGenerator = d3.line()
            .x(d => d.x)
            .y(d => d.y)
            .curve(d3.curveCatmullRom.alpha(0.5));
        
        return lineGenerator(points);
    }
    
    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        // Create handles for all points (endpoints + control points)
        this.points.forEach((point, index) => {
            const cx = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', cy)
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
    
    // Custom handle drag to maintain control points on curve
    handleCustomHandleDrag(handleRole, context = {}) {
        const { point, pointIndex, scales } = context;
        
        if (pointIndex === undefined || !point) return false;
        
        // If dragging endpoints (0 or 1), just update them
        if (pointIndex === 0 || pointIndex === 1) {
            this.points[pointIndex] = { x: point.x, y: point.y };
        } 
        // If dragging control points (2 or 3), adjust the corresponding amplitude in screen coordinates
        else if (pointIndex === 2 || pointIndex === 3) {
            if (!scales) return false;
            
            const p1 = this.points[0];
            const p2 = this.points[1];
            
            // Convert to screen coordinates
            const screenP1 = {
                x: scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x),
                y: scales.yScale(p1.y)
            };
            const screenP2 = {
                x: scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x),
                y: scales.yScale(p2.y)
            };
            const screenPoint = {
                x: scales.chart && scales.chart.dataIndexToPixel ? 
                    scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x),
                y: scales.yScale(point.y)
            };
            
            const screenDx = screenP2.x - screenP1.x;
            const screenDy = screenP2.y - screenP1.y;
            
            // Calculate what the baseline Y should be at this control point (in screen coords)
            const t = pointIndex === 2 ? 0.25 : 0.75;
            const baselineY = screenP1.y + screenDy * t;
            
            // Calculate new amplitude from the dragged position (in screen coords)
            const sineValue = Math.sin(t * Math.PI * 2);
            const distanceFromBaseline = screenPoint.y - baselineY;
            
            // Directly update the control point position in data coordinates
            const yScale = scales.yScale;
            this.points[pointIndex].y = yScale.invert(screenPoint.y);
            
            // Also allow x movement for control points
            if (scales.chart && scales.chart.pixelToDataIndex) {
                this.points[pointIndex].x = scales.chart.pixelToDataIndex(screenPoint.x);
            }
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    renderTextLabel(coords) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        const { x1, y1, x2, y2 } = coords;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        let baseX = midX;
        let baseY = midY;

        switch (this.style.textPosition) {
            case 'start':
                baseX = x1;
                baseY = y1;
                break;
            case 'end':
                baseX = x2;
                baseY = y2;
                break;
            case 'middle':
            default:
                baseX = midX;
                baseY = midY;
                break;
        }

        const offsetX = this.style.textOffsetX || 0;
        const offsetY = this.style.textOffsetY || -8;

        if (typeof appendTextLabel === 'function') {
            appendTextLabel(this.group, label, {
                x: baseX + offsetX,
                y: baseY + offsetY,
                anchor: (typeof TEXT_ALIGN_TO_ANCHOR !== 'undefined' ? TEXT_ALIGN_TO_ANCHOR[this.style.textAlign] : null) || 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal'
            });
        }
    }

    static fromJSON(data, chart = null) {
        const tool = new DoubleCurveTool(data.points, data.style);
        tool.id = data.id;
        tool.text = data.text || '';
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
        HighlighterTool,
        ArrowMarkerTool,
        ArrowMarkUpTool,
        ArrowMarkDownTool,
        CircleTool,
        RotatedRectangleTool,
        ArcTool,
        CurveTool,
        DoubleCurveTool
    };
}

// Verify all classes are defined
console.log('✅ Extended Drawing Tools loaded:', {
    HighlighterTool: typeof HighlighterTool,
    ArrowMarkerTool: typeof ArrowMarkerTool,
    ArrowMarkUpTool: typeof ArrowMarkUpTool,
    ArrowMarkDownTool: typeof ArrowMarkDownTool,
    CircleTool: typeof CircleTool,
    RotatedRectangleTool: typeof RotatedRectangleTool,
    ArcTool: typeof ArcTool,
    CurveTool: typeof CurveTool,
    DoubleCurveTool: typeof DoubleCurveTool
});
