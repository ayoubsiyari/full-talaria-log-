/**
 * Drawing Tools - Image V2 Module
 * A clean, simple image tool with upload functionality in settings panel
 */
class ImageToolV2 extends BaseDrawing {
    constructor(points = [], options = {}) {
        console.log('🖼️ ImageToolV2 constructor called with points:', points, 'options:', options);
        const resolved = ImageToolV2.resolveOptions(options);
        super('image-v2', points, resolved);
        this.requiredPoints = 1;
        this.ensureDefaults();
        console.log('🖼️ ImageToolV2 created with type:', this.type);
    }

    static resolveOptions(options = {}) {
        return {
            stroke: 'none',
            strokeWidth: 0,
            fill: 'none',
            opacity: options.opacity != null ? options.opacity : 1,
            imageUrl: options.imageUrl || '',
            width: options.width || 100,
            height: options.height || 100,
            widthInDataUnits: options.widthInDataUnits || null,
            heightInDataUnits: options.heightInDataUnits || null,
            maintainAspectRatio: options.maintainAspectRatio !== false
        };
    }

    ensureDefaults() {
        if (!this.style.imageUrl) this.style.imageUrl = '';
        if (!this.style.width) this.style.width = 100;
        if (!this.style.height) this.style.height = 100;
        if (typeof this.style.opacity !== 'number') this.style.opacity = 1;
        if (typeof this.style.maintainAspectRatio !== 'boolean') {
            this.style.maintainAspectRatio = true;
        }
    }

    render(container, scales) {
        console.log('🖼️ ImageToolV2 render called, points:', this.points.length, 'imageUrl:', this.style.imageUrl);
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) {
            console.log('🖼️ No points to render');
            return;
        }

        const point = this.points[0];
        const x = scales.chart && typeof scales.chart.dataIndexToPixel === 'function'
            ? scales.chart.dataIndexToPixel(point.x)
            : scales.xScale(point.x);
        const y = scales.yScale(point.y);

        this._screenX = x;
        this._screenY = y;
        this._scales = scales;

        let width = this.style.width || 100;
        let height = this.style.height || 100;
        
        // Initialize size in data units on first render
        if (!this.style.widthInDataUnits && scales.xScale && scales.yScale) {
            const xPixel = x;
            const yPixel = y;
            const xDataAtOffset = scales.chart && scales.chart.pixelToDataIndex ? 
                scales.chart.pixelToDataIndex(xPixel + width) : scales.xScale.invert(xPixel + width);
            const yDataAtOffset = scales.yScale.invert(yPixel + height);
            this.style.widthInDataUnits = Math.abs(point.x - xDataAtOffset);
            this.style.heightInDataUnits = Math.abs(point.y - yDataAtOffset);
        }
        
        // Calculate size from data units (scales with chart zoom)
        if (this.style.widthInDataUnits && this.style.heightInDataUnits && scales.xScale && scales.yScale) {
            const x1Pixel = x;
            const y1Pixel = y;
            const x2 = point.x + this.style.widthInDataUnits;
            const y2 = point.y - this.style.heightInDataUnits;
            const x2Pixel = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(x2) : scales.xScale(x2);
            const y2Pixel = scales.yScale(y2);
            width = Math.abs(x2Pixel - x1Pixel);
            height = Math.abs(y2Pixel - y1Pixel);
            width = Math.max(10, Math.min(1000, width));
            height = Math.max(10, Math.min(1000, height));
        }

        this.group = container.append('g')
            .attr('class', 'drawing image-tool-v2')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Add selection box
        this.group.append('rect')
            .attr('class', 'image-selection-box')
            .attr('x', x - width / 2)
            .attr('y', y - height / 2)
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('stroke', '#2962ff')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
            .style('pointer-events', 'none')
            .style('opacity', this.selected ? 1 : 0);

        // Add image or placeholder
        if (this.style.imageUrl) {
            this.group.append('image')
                .attr('class', 'image-content')
                .attr('x', x - width / 2)
                .attr('y', y - height / 2)
                .attr('width', width)
                .attr('height', height)
                .attr('href', this.style.imageUrl)
                .attr('preserveAspectRatio', this.style.maintainAspectRatio ? 'xMidYMid meet' : 'none')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        } else {
            // Placeholder when no image is set
            this.group.append('rect')
                .attr('class', 'image-placeholder')
                .attr('x', x - width / 2)
                .attr('y', y - height / 2)
                .attr('width', width)
                .attr('height', height)
                .attr('fill', 'rgba(120, 123, 134, 0.1)')
                .attr('stroke', '#787b86')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,4')
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            this.group.append('text')
                .attr('x', x)
                .attr('y', y)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', '#787b86')
                .attr('font-size', '14px')
                .style('pointer-events', 'none')
                .text('Upload from settings');
        }

        this._currentWidth = width;
        this._currentHeight = height;

        this.createBoxHandles(this.group, scales);

        return this.group;
    }

    createBoxHandles(group, scales) {
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 1) return;
        
        const point = this.points[0];
        const cx = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
        const cy = scales.yScale(point.y);
        
        const width = this._currentWidth || this.style.width;
        const height = this._currentHeight || this.style.height;
        
        const minX = cx - width / 2;
        const maxX = cx + width / 2;
        const minY = cy - height / 2;
        const maxY = cy + height / 2;
        
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' }
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

    beginHandleDrag(handleRole, context = {}) {
        this._dragStartWidthInDataUnits = this.style.widthInDataUnits || 0;
        this._dragStartHeightInDataUnits = this.style.heightInDataUnits || 0;
        this._dragStartCenter = { x: this._screenX, y: this._screenY };
        const screenX = context.screen?.x || 0;
        const screenY = context.screen?.y || 0;
        this._dragStartPos = { x: screenX, y: screenY };
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        if (!handleRole || this._dragStartWidthInDataUnits == null) return false;
        
        const startX = this._dragStartPos?.x || 0;
        const startY = this._dragStartPos?.y || 0;
        const currentX = context.screen?.x || 0;
        const currentY = context.screen?.y || 0;
        
        const dx = currentX - startX;
        const dy = currentY - startY;
        
        if (this._scales && this._scales.xScale && this._scales.yScale) {
            const point = this.points[0];
            
            const x1 = this._scales.chart && this._scales.chart.pixelToDataIndex ? 
                this._scales.chart.pixelToDataIndex(0) : this._scales.xScale.invert(0);
            const x2 = this._scales.chart && this._scales.chart.pixelToDataIndex ? 
                this._scales.chart.pixelToDataIndex(Math.abs(dx)) : this._scales.xScale.invert(Math.abs(dx));
            const deltaXInDataUnits = Math.abs(x1 - x2);
            
            const y1 = this._scales.yScale.invert(0);
            const y2 = this._scales.yScale.invert(Math.abs(dy));
            const deltaYInDataUnits = Math.abs(y1 - y2);
            
            let widthDelta = 0;
            let heightDelta = 0;
            
            switch (handleRole) {
                case 'corner-br':
                    widthDelta = deltaXInDataUnits * (dx > 0 ? 1 : -1);
                    heightDelta = deltaYInDataUnits * (dy > 0 ? 1 : -1);
                    break;
                case 'corner-tl':
                    widthDelta = deltaXInDataUnits * (dx < 0 ? 1 : -1);
                    heightDelta = deltaYInDataUnits * (dy < 0 ? 1 : -1);
                    break;
                case 'corner-tr':
                    widthDelta = deltaXInDataUnits * (dx > 0 ? 1 : -1);
                    heightDelta = deltaYInDataUnits * (dy < 0 ? 1 : -1);
                    break;
                case 'corner-bl':
                    widthDelta = deltaXInDataUnits * (dx < 0 ? 1 : -1);
                    heightDelta = deltaYInDataUnits * (dy > 0 ? 1 : -1);
                    break;
                default:
                    return false;
            }
            
            const newWidth = this._dragStartWidthInDataUnits + widthDelta;
            const newHeight = this._dragStartHeightInDataUnits + heightDelta;
            
            if (this.style.maintainAspectRatio && this._dragStartWidthInDataUnits > 0 && this._dragStartHeightInDataUnits > 0) {
                const aspectRatio = this._dragStartWidthInDataUnits / this._dragStartHeightInDataUnits;
                const avgDelta = (Math.abs(widthDelta) + Math.abs(heightDelta)) / 2;
                const sign = (widthDelta + heightDelta) > 0 ? 1 : -1;
                this.style.widthInDataUnits = Math.max(0.0001, this._dragStartWidthInDataUnits + (avgDelta * sign * aspectRatio));
                this.style.heightInDataUnits = Math.max(0.0001, this._dragStartHeightInDataUnits + (avgDelta * sign));
            } else {
                this.style.widthInDataUnits = Math.max(0.0001, newWidth);
                this.style.heightInDataUnits = Math.max(0.0001, newHeight);
            }
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    endHandleDrag(handleRole, context = {}) {
        this._dragStartWidthInDataUnits = null;
        this._dragStartHeightInDataUnits = null;
        this._dragStartCenter = null;
        this._dragStartPos = null;
    }

    isPointInside(x, y, scales) {
        console.log('🔍 isPointInside called for image-v2, click at:', x, y);
        if (this.points.length < 1) {
            console.log('❌ No points');
            return false;
        }
        
        const point = this.points[0];
        const cx = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
        const cy = scales.yScale(point.y);
        
        let width = this.style.width || 100;
        let height = this.style.height || 100;
        
        // Calculate size from data units (same as render method)
        if (this.style.widthInDataUnits && this.style.heightInDataUnits && scales.xScale && scales.yScale) {
            const x1Pixel = cx;
            const y1Pixel = cy;
            const x2 = point.x + this.style.widthInDataUnits;
            const y2 = point.y - this.style.heightInDataUnits;
            const x2Pixel = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(x2) : scales.xScale(x2);
            const y2Pixel = scales.yScale(y2);
            width = Math.abs(x2Pixel - x1Pixel);
            height = Math.abs(y2Pixel - y1Pixel);
            width = Math.max(10, Math.min(1000, width));
            height = Math.max(10, Math.min(1000, height));
        }
        
        const minX = cx - width / 2;
        const maxX = cx + width / 2;
        const minY = cy - height / 2;
        const maxY = cy + height / 2;
        
        console.log('📐 Bounds:', { minX, maxX, minY, maxY, width, height, cx, cy });
        const isInside = x >= minX && x <= maxX && y >= minY && y <= maxY;
        console.log('✅ isInside:', isInside);
        
        return isInside;
    }

    static fromJSON(data, chart) {
        const tool = new ImageToolV2(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.chart = chart;
        return tool;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageToolV2;
}
