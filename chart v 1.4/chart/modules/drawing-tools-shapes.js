/**
 * Drawing Tools - Shape Tools Module
 * Implements: Rectangle, Ellipse/Circle, Triangle, Arrow
 */

const RECTANGLE_TEXT_DEFAULTS = {
    fontFamily: 'Roboto, sans-serif',
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#FFFFFF',
    textAlign: 'center',
    textPosition: 'middle',
    textOffsetX: 0,
    textOffsetY: 0,
    textPadding: 12
};

const RECTANGLE_TEXT_ANCHOR_MAP = (typeof TEXT_ALIGN_TO_ANCHOR !== 'undefined')
    ? TEXT_ALIGN_TO_ANCHOR
    : { left: 'start', center: 'middle', right: 'end', start: 'start', end: 'end' };

// ============================================================================
// Rectangle Tool
// ============================================================================
class RectangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('rectangle', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || 'rgba(41, 98, 255, 0.1)';
        this.ensureTextDefaults();
    }

    ensureTextDefaults() {
        Object.keys(RECTANGLE_TEXT_DEFAULTS).forEach((key) => {
            if (this.style[key] === undefined || this.style[key] === null) {
                this.style[key] = RECTANGLE_TEXT_DEFAULTS[key];
            }
        });

        if (!this.style.textColor) {
            this.style.textColor = this.style.stroke || RECTANGLE_TEXT_DEFAULTS.textColor;
        }

        if (!Number.isFinite(this.style.textPadding)) {
            this.style.textPadding = RECTANGLE_TEXT_DEFAULTS.textPadding;
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
            .attr('class', 'drawing rectangle')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? 1 : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        let x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        
        // Get chart dimensions for extend functionality
        const xRange = scales.xScale.range();
        const chartLeftEdge = xRange[0];
        const chartRightEdge = xRange[1];
        
        // Apply extend left/right
        if (this.style.extendLeft) {
            const leftX = Math.min(x1, x2);
            if (x1 < x2) {
                x1 = chartLeftEdge;
            } else {
                x2 = chartLeftEdge;
            }
        }
        
        if (this.style.extendRight) {
            const rightX = Math.max(x1, x2);
            if (x1 > x2) {
                x1 = chartRightEdge;
            } else {
                x2 = chartRightEdge;
            }
        }
        
        const x = Math.min(x1, x2);
        const y = Math.min(scales.yScale(p1.y), scales.yScale(p2.y));
        const width = Math.abs(x2 - x1);
        const height = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y));

        // Draw the rectangle fill (not interactive)
        this.group.append('rect')
            .attr('class', 'shape-fill')
            .attr('x', x)
            .attr('y', y)
            .attr('width', width)
            .attr('height', height)
            .attr('stroke', 'none')
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .attr('rx', this.style.borderRadius || 0)
            .style('pointer-events', 'none')
            .style('cursor', 'default');
        
        // Draw border as 4 separate lines (like parallel channel) for precise hit detection
        const edges = [
            { x1: x, y1: y, x2: x + width, y2: y, name: 'top' },           // Top
            { x1: x, y1: y + height, x2: x + width, y2: y + height, name: 'bottom' }, // Bottom
            { x1: x, y1: y, x2: x, y2: y + height, name: 'left' },         // Left
            { x1: x + width, y1: y, x2: x + width, y2: y + height, name: 'right' }  // Right
        ];
        
        edges.forEach(edge => {
            // Visible line with scaled stroke width
            this.group.append('line')
                .attr('class', 'shape-border')
                .attr('x1', edge.x1)
                .attr('y1', edge.y1)
                .attr('x2', edge.x2)
                .attr('y2', edge.y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('stroke-dasharray', this.style.strokeDasharray || '')
                .attr('opacity', this.style.opacity)
                .attr('data-edge', edge.name)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Invisible wider hit area for easier selection
            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', edge.x1)
                .attr('y1', edge.y1)
                .attr('x2', edge.x2)
                .attr('y2', edge.y2)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(8, scaledStrokeWidth * 4))
                .attr('data-edge', edge.name)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        });

        // Render middle line if enabled (horizontal only)
        if (this.style.showMiddleLine) {
            const midLineColor = this.style.middleLineColor || '#2962FF';
            const midLineWidth = Math.max(0.5, (this.style.middleLineWidth || 1) * scaleFactor);
            const midLineDash = this.style.middleLineDash || '';
            
            // Horizontal middle line
            this.group.append('line')
                .attr('class', 'middle-line')
                .attr('x1', x)
                .attr('y1', y + height / 2)
                .attr('x2', x + width)
                .attr('y2', y + height / 2)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none');
        }

        this.renderTextLabel({ x, y, width, height }, scaleFactor);

        // Create 8-point resize handles (4 corners + 4 sides) like TradingView
        this.createBoxHandles(this.group, scales);

        return this.group;
    }

    /**
     * Create 8-point resize handles for box shapes (4 corners + 4 sides)
     */
    createBoxHandles(group, scales) {
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        // Get screen coordinates
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        
        // Define 8 handle positions: 4 corners + 4 sides
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },  // Top-left
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },  // Top-right
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },  // Bottom-right
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },  // Bottom-left
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },     // Top-center
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },   // Right-center
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },  // Bottom-center
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }     // Left-center
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', pos.role)
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

    /**
     * Handle custom drag for 8-point handles
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, scales } = context;
        if (!dataPoint) {
            console.warn('⚠️ Rectangle handleCustomHandleDrag: No dataPoint in context');
            return false;
        }

        const p1 = this.points[0];
        const p2 = this.points[1];

        let leftX = Math.min(p1.x, p2.x);
        let rightX = Math.max(p1.x, p2.x);
        let topY = Math.max(p1.y, p2.y);
        let bottomY = Math.min(p1.y, p2.y);

        switch (handleRole) {
            case 'corner-tl':
                leftX = dataPoint.x;
                topY = dataPoint.y;
                break;
            case 'corner-tr':
                rightX = dataPoint.x;
                topY = dataPoint.y;
                break;
            case 'corner-br':
                rightX = dataPoint.x;
                bottomY = dataPoint.y;
                break;
            case 'corner-bl':
                leftX = dataPoint.x;
                bottomY = dataPoint.y;
                break;
            case 'side-top':
                topY = dataPoint.y;
                break;
            case 'side-right':
                rightX = dataPoint.x;
                break;
            case 'side-bottom':
                bottomY = dataPoint.y;
                break;
            case 'side-left':
                leftX = dataPoint.x;
                break;
            default:
                console.warn(`⚠️ Rectangle handleCustomHandleDrag: Unknown role ${handleRole}`);
                return false;
        }

        const nextLeftX = Math.min(leftX, rightX);
        const nextRightX = Math.max(leftX, rightX);
        const nextTopY = Math.max(topY, bottomY);
        const nextBottomY = Math.min(topY, bottomY);

        this.points[0] = { x: nextLeftX, y: nextTopY };
        this.points[1] = { x: nextRightX, y: nextBottomY };
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    renderTextLabel(bounds, scaleFactor = 1) {
        if (!this.text || !this.text.trim()) {
            return;
        }

        const { x, y, width, height } = bounds;
        const rawPadding = Number.isFinite(this.style.textPadding) ? this.style.textPadding : RECTANGLE_TEXT_DEFAULTS.textPadding;
        const clampedPadding = Math.max(0, Math.min(rawPadding, Math.min(width, height) / 2));
        // Use textHAlign (from UI) or textAlign as fallback
        const align = (this.style.textHAlign || this.style.textAlign || 'center').toLowerCase();
        const anchor = RECTANGLE_TEXT_ANCHOR_MAP[align] || 'middle';

        // Use textVAlign (from UI) or textPosition as fallback
        let position = (this.style.textVAlign || this.style.textPosition || 'middle').toLowerCase();
        if (position === 'start') position = 'top';
        if (position === 'end') position = 'bottom';

        const baseFontSize = Number(this.style.fontSize) || RECTANGLE_TEXT_DEFAULTS.fontSize;
        const fontSize = Math.max(6, baseFontSize * scaleFactor);
        const lineHeight = fontSize * 1.2;
        const rawLines = this.text.split('\n');
        const lines = rawLines.length ? rawLines : [''];
        const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

        let baseX;
        switch (align) {
            case 'left':
            case 'start':
                baseX = x + clampedPadding;
                break;
            case 'right':
            case 'end':
                baseX = x + width - clampedPadding;
                break;
            default:
                baseX = x + width / 2;
        }

        let topY;
        const textMargin = 5;
        switch (position) {
            case 'top':
                // Position text ABOVE the rectangle (outside)
                topY = y - blockHeight - textMargin;
                break;
            case 'bottom':
                // Position text BELOW the rectangle (outside)
                topY = y + height + textMargin;
                break;
            default:
                // Middle - position text inside the rectangle centered
                topY = y + (height - blockHeight) / 2;
        }

        const offsetX = Number.isFinite(this.style.textOffsetX) ? this.style.textOffsetX : 0;
        const offsetY = Number.isFinite(this.style.textOffsetY) ? this.style.textOffsetY : 0;

        const textX = baseX + offsetX;
        const textTop = topY + offsetY;

        const labelGroup = this.group.append('g')
            .attr('class', 'rectangle-text-label')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        const textColor = this.style.textColor || RECTANGLE_TEXT_DEFAULTS.textColor;
        const fontFamily = this.style.fontFamily || RECTANGLE_TEXT_DEFAULTS.fontFamily;
        const fontWeight = this.style.fontWeight || RECTANGLE_TEXT_DEFAULTS.fontWeight;
        const fontStyle = this.style.fontStyle || RECTANGLE_TEXT_DEFAULTS.fontStyle;

        lines.forEach((line, index) => {
            const sanitized = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
            labelGroup.append('text')
                .attr('x', textX)
                .attr('y', textTop + index * lineHeight)
                .attr('fill', textColor)
                .attr('font-size', `${fontSize}px`)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('font-style', fontStyle)
                .attr('text-anchor', anchor)
                .attr('dominant-baseline', 'hanging')
                .attr('xml:space', 'preserve')
                .text(sanitized);
        });
    }

    static fromJSON(data) {
        const tool = new RectangleTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.text = typeof data.text === 'string' ? data.text : '';
        return tool;
    }
}

// ============================================================================
// Ellipse/Circle Tool
// ============================================================================
class EllipseTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('ellipse', points, style);
        this.requiredPoints = 2;
        this.style.fill = style.fill || 'rgba(255, 152, 0, 0.1)';
        this.isCircle = false; // Set to true if Shift key held during creation
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
            .attr('class', 'drawing ellipse')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Convert data indices to screen coordinates
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        
        // Calculate center and radii
        const cx = (x1 + x2) / 2;
        const cy = (scales.yScale(p1.y) + scales.yScale(p2.y)) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(scales.yScale(p2.y) - scales.yScale(p1.y)) / 2;

        // Draw the ellipse fill (not interactive)
        this.group.append('ellipse')
            .attr('class', 'shape-fill')
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('rx', rx)
            .attr('ry', ry)
            .attr('stroke', 'none')
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Triangle-style border: draw as multiple line segments + transparent hit segments
        const desiredHitWidth = Math.max(8, scaledStrokeWidth * 4);
        const maxHitWidth = Math.max(8, Math.min(rx, ry) * 0.35);
        const hitWidth = Math.min(desiredHitWidth, maxHitWidth);

        const segments = 64;
        const pts = [];
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: cx + rx * Math.cos(a),
                y: cy + ry * Math.sin(a)
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
                .attr('stroke-width', scaledStrokeWidth)
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
                .attr('x1', cx - rx)
                .attr('y1', cy)
                .attr('x2', cx + rx)
                .attr('y2', cy)
                .attr('stroke', midLineColor)
                .attr('stroke-width', midLineWidth)
                .attr('stroke-dasharray', midLineDash)
                .attr('opacity', this.style.opacity)
                .style('pointer-events', 'none');
        }

        // Create 8-point resize handles (4 corners + 4 sides) like TradingView
        this.createBoxHandles(this.group, scales);

        return this.group;
    }

    /**
     * Create 8-point resize handles for ellipse positioned on the ellipse border
     */
    createBoxHandles(group, scales) {
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        // Get screen coordinates
        const x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y1 = scales.yScale(p1.y);
        const y2 = scales.yScale(p2.y);
        
        // Calculate ellipse center and radii
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        
        // Define 4 handle positions ON the ellipse border (cardinal points only)
        // Using parametric equation: x = cx + rx*cos(θ), y = cy + ry*sin(θ)
        const handlePositions = [
            { x: cx, y: cy - ry, cursor: 'ns-resize', role: 'side-top' },           // Top (θ=270°)
            { x: cx + rx, y: cy, cursor: 'ew-resize', role: 'side-right' },         // Right (θ=0°)
            { x: cx, y: cy + ry, cursor: 'ns-resize', role: 'side-bottom' },        // Bottom (θ=90°)
            { x: cx - rx, y: cy, cursor: 'ew-resize', role: 'side-left' }           // Left (θ=180°)
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', 'all')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-handle-role', pos.role)
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

    /**
     * Handle custom drag for 8-point handles
     * Handles are on the ellipse border, so we need to calculate the new bounding box
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, scales } = context;
        if (!dataPoint) {
            console.warn('⚠️ Ellipse handleCustomHandleDrag: No dataPoint in context');
            return false;
        }
        
        const p1 = { ...this.points[0] };
        const p2 = { ...this.points[1] };
        
        // Calculate current center and radii
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        
        // Determine which coordinates to update based on handle role
        switch (handleRole) {
            case 'side-top':
                // Dragging top handle - adjust vertical radius, keep center X
                const newTopY = dataPoint.y;
                const newRy1 = Math.abs(centerY - newTopY);
                this.points[0] = { x: p1.x, y: centerY - newRy1 };
                this.points[1] = { x: p2.x, y: centerY + newRy1 };
                break;
                
            case 'side-bottom':
                // Dragging bottom handle - adjust vertical radius, keep center X
                const newBottomY = dataPoint.y;
                const newRy2 = Math.abs(dataPoint.y - centerY);
                this.points[0] = { x: p1.x, y: centerY - newRy2 };
                this.points[1] = { x: p2.x, y: centerY + newRy2 };
                break;
                
            case 'side-right':
                // Dragging right handle - adjust horizontal radius, keep center Y
                const newRightX = dataPoint.x;
                const newRx1 = Math.abs(dataPoint.x - centerX);
                this.points[0] = { x: centerX - newRx1, y: p1.y };
                this.points[1] = { x: centerX + newRx1, y: p2.y };
                break;
                
            case 'side-left':
                // Dragging left handle - adjust horizontal radius, keep center Y
                const newLeftX = dataPoint.x;
                const newRx2 = Math.abs(centerX - newLeftX);
                this.points[0] = { x: centerX - newRx2, y: p1.y };
                this.points[1] = { x: centerX + newRx2, y: p2.y };
                break;
                
            case 'corner-tr':
            case 'corner-br':
            case 'corner-bl':
            case 'corner-tl':
                // For diagonal handles, adjust both radii proportionally
                // Calculate the distance from center to the dragged point
                const dx = Math.abs(dataPoint.x - centerX);
                const dy = Math.abs(dataPoint.y - centerY);
                
                // Determine which quadrant based on handle role
                let newP1X, newP1Y, newP2X, newP2Y;
                
                if (handleRole === 'corner-tr') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else if (handleRole === 'corner-br') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else if (handleRole === 'corner-bl') {
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                } else { // corner-tl
                    newP1X = centerX - dx;
                    newP1Y = centerY - dy;
                    newP2X = centerX + dx;
                    newP2Y = centerY + dy;
                }
                
                this.points[0] = { x: newP1X, y: newP1Y };
                this.points[1] = { x: newP2X, y: newP2Y };
                break;
                
            default:
                console.warn(`⚠️ Ellipse handleCustomHandleDrag: Unknown role ${handleRole}`);
                return false;
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    static fromJSON(data, chart = null) {
        const tool = new EllipseTool(data.points, data.style);
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
// Triangle Tool
// ============================================================================
class TriangleTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('triangle', points, style);
        this.requiredPoints = 3;
        this.style.fill = style.fill || 'rgba(76, 175, 80, 0.1)';
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length === 0) return;

        // Get zoom scale factor for visual scaling
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing triangle')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Helper to get x coordinate
        const getX = (p) => scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);

        // Preview mode: show lines as points are added
        if (this.points.length === 1) {
            // Single point - show a dot
            const p = this.points[0];
            this.group.append('circle')
                .attr('cx', getX(p))
                .attr('cy', scales.yScale(p.y))
                .attr('r', 4 * scaleFactor)
                .attr('fill', this.style.stroke)
                .attr('opacity', this.style.opacity);
            return this.group;
        }

        if (this.points.length === 2) {
            // Two points - show a line (first edge of triangle)
            const p1 = this.points[0];
            const p2 = this.points[1];
            this.group.append('line')
                .attr('x1', getX(p1))
                .attr('y1', scales.yScale(p1.y))
                .attr('x2', getX(p2))
                .attr('y2', scales.yScale(p2.y))
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('opacity', this.style.opacity);
            
            // Show dots at endpoints
            [p1, p2].forEach(p => {
                this.group.append('circle')
                    .attr('cx', getX(p))
                    .attr('cy', scales.yScale(p.y))
                    .attr('r', 4 * scaleFactor)
                    .attr('fill', this.style.stroke)
                    .attr('opacity', this.style.opacity);
            });
            return this.group;
        }

        // Full triangle with 3 points
        // Create path for triangle
        const pathData = this.points.map((p, i) => {
            const x = getX(p);
            const y = scales.yScale(p.y);
            return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ') + ' Z';

        // Draw the triangle fill (not interactive)
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pathData)
            .attr('stroke', 'none')
            .attr('fill', this.style.fill)
            .attr('opacity', this.style.opacity)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        // Draw border as 3 separate lines (like parallel channel) for precise hit detection
        const pts = this.points.map(p => ({ x: getX(p), y: scales.yScale(p.y) }));
        const edges = [
            { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, name: 'edge1' },
            { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y, name: 'edge2' },
            { x1: pts[2].x, y1: pts[2].y, x2: pts[0].x, y2: pts[0].y, name: 'edge3' }
        ];
        
        edges.forEach(edge => {
            // Visible line with scaled stroke width
            this.group.append('line')
                .attr('class', 'shape-border')
                .attr('x1', edge.x1)
                .attr('y1', edge.y1)
                .attr('x2', edge.x2)
                .attr('y2', edge.y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('opacity', this.style.opacity)
                .attr('data-edge', edge.name)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            
            // Invisible wider hit area
            this.group.append('line')
                .attr('class', 'shape-border-hit')
                .attr('x1', edge.x1)
                .attr('y1', edge.y1)
                .attr('x2', edge.x2)
                .attr('y2', edge.y2)
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(8, scaledStrokeWidth * 4))
                .attr('data-edge', edge.name)
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
        });

        // Create resize handles at vertices
        this.createHandles(this.group, scales);

        return this.group;
    }

    static fromJSON(data, chart = null) {
        const tool = new TriangleTool(data.points, data.style);
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
// Arrow Tool
// ============================================================================
class ArrowTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('arrow', points, style);
        this.requiredPoints = 2;
        this.arrowheadType = style.arrowheadType || 'filled'; // 'filled', 'open', 'both'
        this.text = style.text || '';
        this.ensureTextDefaults();
    }
    
    ensureTextDefaults() {
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
            .attr('class', 'drawing arrow')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];

        // Create arrow marker if it doesn't exist
        const markerId = `arrow-marker-${this.id}`;
        SVGHelpers.createArrowMarker(
            d3.select(container.node().ownerSVGElement),
            markerId,
            this.style.stroke
        );

        // Convert data indices to screen coordinates
        let x1 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        let x2 = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        let y1 = scales.yScale(p1.y);
        let y2 = scales.yScale(p2.y);
        
        // Store original coordinates for text positioning
        const origX1 = x1, origY1 = y1, origX2 = x2, origY2 = y2;
        
        // Extend line if needed
        if (this.style.extendLeft || this.style.extendRight) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length > 0) {
                const dirX = dx / length;
                const dirY = dy / length;
                const extendLength = 10000;
                
                if (this.style.extendLeft) {
                    x1 = x1 - dirX * extendLength;
                    y1 = y1 - dirY * extendLength;
                }
                if (this.style.extendRight) {
                    x2 = x2 + dirX * extendLength;
                    y2 = y2 + dirY * extendLength;
                }
            }
        }

        // Fill hit area (interactive) - allows select/move/hover by fill (wide band around the line)
        {
            const bandWidth = Math.max(12, scaledStrokeWidth * 6);
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;
            const hw = bandWidth / 2;
            const ax = x1 + px * hw;
            const ay = y1 + py * hw;
            const bx = x2 + px * hw;
            const by = y2 + py * hw;
            const cx = x2 - px * hw;
            const cy = y2 - py * hw;
            const dx2 = x1 - px * hw;
            const dy2 = y1 - py * hw;
            const hitPath = `M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} L ${dx2} ${dy2} Z`;

            this.group.append('path')
                .attr('class', 'arrow-fill-hit')
                .attr('d', hitPath)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        }

        const hasText = this.text && this.text.trim();
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const shouldSplitLine = hasText && textVAlign === 'middle';
        this._splitInfo = null;

        if (shouldSplitLine) {
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

            const tempText = this.group.append('text')
                .attr('font-size', fontSize)
                .attr('font-family', fontFamily)
                .attr('font-weight', fontWeight)
                .attr('text-anchor', 'middle')
                .text(this.text);

            const textBBox = tempText.node().getBBox();
            const textWidth = textBBox.width;
            tempText.remove();

            const lineAngle = Math.atan2(origY2 - origY1, origX2 - origX1);

            const padding = 10;
            const gapSize = textWidth + (padding * 2);

            let t = 0.5;
            switch (textHAlign) {
                case 'left':
                    t = 0.05;
                    break;
                case 'right':
                    t = 0.95;
                    break;
                default:
                    t = 0.5;
            }

            const textX = origX1 + (origX2 - origX1) * t;
            const textY = origY1 + (origY2 - origY1) * t;

            const splitDx = Math.cos(lineAngle) * (gapSize / 2);
            const splitDy = Math.sin(lineAngle) * (gapSize / 2);

            const split1X = textX - splitDx;
            const split1Y = textY - splitDy;
            const split2X = textX + splitDx;
            const split2Y = textY + splitDy;

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

            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(15, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const line1 = this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', split1X)
                .attr('y2', split1Y)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');

            this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(15, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const line2 = this.group.append('line')
                .attr('x1', split2X)
                .attr('y1', split2Y)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('opacity', this.style.opacity)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');

            line2.attr('marker-end', `url(#${markerId})`);
        } else {
            this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('class', 'shape-border-hit')
                .attr('stroke', 'transparent')
                .attr('stroke-width', Math.max(15, this.style.strokeWidth))
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            const line = this.group.append('line')
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .attr('stroke', this.style.stroke)
                .attr('stroke-width', scaledStrokeWidth)
                .attr('opacity', this.style.opacity)
                .attr('marker-end', `url(#${markerId})`)
                .attr('data-original-width', this.style.strokeWidth)
                .style('pointer-events', 'none')
                .style('cursor', 'move');
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
        
        // Calculate box dimensions
        const padding = 8;
        const lineHeight = 16;
        const boxWidth = 150;
        const boxHeight = infoLines.length * lineHeight + padding * 2;
        
        // Position info box perpendicular to the line
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Calculate perpendicular direction
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lineLength = Math.sqrt(dx * dx + dy * dy);
        
        // Perpendicular unit vector
        const perpX = -dy / lineLength;
        const perpY = dx / lineLength;
        
        // Offset distance
        const offsetDistance = boxHeight / 2 + 40;
        const sign = perpY <= 0 ? 1 : -1;
        
        const offsetX = midX + perpX * offsetDistance * sign;
        const offsetY = midY + perpY * offsetDistance * sign - boxHeight / 2;
        
        // Create info box group
        const infoGroup = this.group.append('g')
            .attr('class', 'arrow-info')
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
                .attr('y', padding + i * lineHeight + 12)
                .attr('text-anchor', 'middle')
                .attr('fill', '#d1d4dc')
                .attr('font-size', '12px')
                .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif')
                .style('pointer-events', 'none')
                .text(line);
        });
    }

    renderTextLabel(coords, scaleFactor = 1) {
        const label = this.text || '';
        if (!label.trim()) {
            return;
        }

        if (this._splitInfo) {
            let angle = this._splitInfo.angle;
            if (angle > 90 || angle < -90) {
                angle += 180;
            }
            appendTextLabel(this.group, label, {
                x: this._splitInfo.textX + (this.style.textOffsetX || 0),
                y: this._splitInfo.textY + (this.style.textOffsetY || 0),
                anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textHAlign || this.style.textAlign || 'center'] || 'middle',
                fill: this.style.textColor || this.style.stroke,
                fontSize: this.style.fontSize || 14,
                fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: this.style.fontWeight || 'normal',
                fontStyle: this.style.fontStyle || 'normal',
                rotation: angle
            });
            return;
        }

        const { scales } = coords;
        const p1 = this.points[0];
        const p2 = this.points[1];
        
        const origX1 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p1.x) : (scales ? scales.xScale(p1.x) : coords.x1);
        const origY1 = scales ? scales.yScale(p1.y) : coords.y1;
        const origX2 = scales && scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p2.x) : (scales ? scales.xScale(p2.x) : coords.x2);
        const origY2 = scales ? scales.yScale(p2.y) : coords.y2;
        
        let angle = Math.atan2(origY2 - origY1, origX2 - origX1) * (180 / Math.PI);
        if (angle > 90 || angle < -90) {
            angle += 180;
        }

        const verticalOffset = 15;
        const textVAlign = this.style.textVAlign || this.style.textPosition || 'top';
        const textHAlign = this.style.textHAlign || this.style.textAlign || 'center';

        let t = 0.5;
        switch (textHAlign) {
            case 'left':
                t = 0.05;
                break;
            case 'right':
                t = 0.95;
                break;
            default:
                t = 0.5;
        }
        
        let baseX = origX1 + (origX2 - origX1) * t;
        let baseY = origY1 + (origY2 - origY1) * t;

        if (textVAlign === 'top') {
            baseY -= verticalOffset;
        } else if (textVAlign === 'bottom') {
            baseY += verticalOffset;
        }

        appendTextLabel(this.group, label, {
            x: baseX + (this.style.textOffsetX || 0),
            y: baseY + (this.style.textOffsetY || 0),
            anchor: TEXT_ALIGN_TO_ANCHOR[this.style.textHAlign || this.style.textAlign || 'center'] || 'middle',
            fill: this.style.textColor || this.style.stroke,
            fontSize: this.style.fontSize || 14,
            fontFamily: this.style.fontFamily || 'Roboto, sans-serif',
            fontWeight: this.style.fontWeight || 'normal',
            fontStyle: this.style.fontStyle || 'normal',
            rotation: angle
        });
    }

    static fromJSON(data, chart = null) {
        const tool = new ArrowTool(data.points, data.style);
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
// Label/Marker Tool (single point annotation)
// ============================================================================
class LabelTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Label') {
        super('label', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fill = style.fill || '#787b86';
        this.style.stroke = style.stroke || '#787b86';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.markerSize = style.markerSize || 8;
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing label')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        const markerSize = this.style.markerSize || 8;

        // Draw marker background circle
        const markerCircle = this.group.append('circle')
            .attr('class', 'inline-editable-text')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', markerSize)
            .attr('fill', this.style.fill || this.style.stroke)
            .attr('stroke', this.style.textColor)
            .attr('stroke-width', 2)
            .style('pointer-events', 'all')
            .style('cursor', 'text');

        // Draw inner dot
        this.group.append('circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', markerSize * 0.4)
            .attr('fill', this.style.textColor)
            .style('pointer-events', 'none');

        // Optional text label below marker
        let labelText = null;
        if (this.text && this.text !== 'Label') {
            labelText = this.group.append('text')
                .attr('class', 'inline-editable-text')
                .attr('x', x)
                .attr('y', y + 20)
                .attr('text-anchor', 'middle')
                .attr('fill', this.style.fill)
                .attr('font-size', '11px')
                .attr('font-weight', '500')
                .style('pointer-events', 'all')
                .style('cursor', 'text')
                .text(this.text);
        }

        const self = this;
        const CLICK_DELAY = 250;
        let clickTimer = null;
        let downPos = null;
        let moved = false;

        const cleanupDragListeners = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (event) => {
            if (!downPos) return;
            const dx = event.clientX - downPos.x;
            const dy = event.clientY - downPos.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                cleanupDragListeners();
            }
        };

        const handleMouseUp = () => {
            cleanupDragListeners();
            downPos = null;
        };

        const handleMouseDown = (event) => {
            downPos = { x: event.clientX, y: event.clientY };
            moved = false;
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const startInlineEdit = (anchorNode) => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = anchorNode.getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            const initial = (self.text && self.text !== 'Label') ? self.text : '';
            editor.show(
                editX,
                editY,
                initial,
                (newText) => {
                    const normalized = (newText || '').replace(/\r\n/g, '\n');
                    if (!normalized.trim()) {
                        if (manager && typeof manager.deleteDrawing === 'function') {
                            manager.deleteDrawing(self);
                            return;
                        }
                    }
                    self.setText(normalized);
                    if (self.chart) self.chart.render();
                },
                'Enter text…',
                {
                    width: Math.max(rect.width, 120),
                    height: rect.height,
                    padding: '0px',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    fontWeight: '500',
                    color: self.style.fill || '#787b86',
                    textAlign: 'center',
                    hideTargets: [anchorNode],
                    hideSelector: `.drawing[data-id="${self.id}"] text`
                }
            );
        };

        const handleInlineEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (moved) {
                moved = false;
                return;
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const anchorNode = event.currentTarget;
            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit(anchorNode);
            }, CLICK_DELAY);
        };

        const handleOpenSettings = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            const manager = self.chart && self.chart.drawingManager;
            if (manager && typeof manager.editDrawing === 'function' && !self.locked) {
                if (typeof manager.selectDrawing === 'function') {
                    manager.selectDrawing(self);
                }
                manager.editDrawing(self, event.pageX, event.pageY);
            }
        };

        const bind = (node) => {
            if (!node) return;
            node.addEventListener('mousedown', handleMouseDown, true);
            node.addEventListener('click', handleInlineEdit, true);
            node.addEventListener('dblclick', handleOpenSettings, true);
        };

        bind(markerCircle.node());
        if (labelText) bind(labelText.node());

        // Create single resize handle with glow effect
        const handleGroup = this.group.append('g')
            .attr('class', 'resize-handle-group')
            .attr('data-point-index', 0);
        
        // Outer glow circle
        handleGroup.append('circle')
            .attr('class', 'resize-handle-glow')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 10)
            .attr('fill', '#FFA726')
            .attr('opacity', this.selected ? 0.2 : 0)
            .style('pointer-events', 'none');
        
        // Main handle circle
        handleGroup.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 7)
            .attr('fill', '#FFA726')
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 2.5)
            .style('cursor', 'move')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);

        return this.group;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text
        };
    }

    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    static fromJSON(data, chart = null) {
        const label = new LabelTool(data.points, data.style, data.text);
        label.id = data.id;
        label.visible = data.visible;
        label.meta = data.meta;
        label.chart = chart;
        return label;
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RectangleTool,
        EllipseTool,
        TriangleTool,
        ArrowTool,
        LabelTool
    };
}
