/**
 * Drawing Tools - Image Module
 * Provides a single-point drawing that renders uploaded images.
 * Supports resizing via corner handles and scales with chart zoom.
 */
class ImageTool extends BaseDrawing {
    constructor(points = [], options = {}) {
        const resolved = ImageTool.resolveOptions(options);
        super('image', points, resolved);
        this.requiredPoints = 1;
        this.ensureDefaults();
        this._dragStartSize = null;
        this._dragStartCenter = null;
    }

    static resolveOptions(options = {}) {
        const imageUrl = options.imageUrl || '';
        const width = options.width || 100;
        const height = options.height || 100;
        const opacity = options.opacity != null ? options.opacity : 1;
        const widthInDataUnits = options.widthInDataUnits || null;
        const heightInDataUnits = options.heightInDataUnits || null;
        const maintainAspectRatio = options.maintainAspectRatio === true;
        const originalAspectRatio = options.originalAspectRatio || null;

        return {
            stroke: 'none',
            strokeWidth: 0,
            fill: 'none',
            opacity,
            imageUrl,
            width,
            height,
            widthInDataUnits,
            heightInDataUnits,
            maintainAspectRatio,
            originalAspectRatio
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
        if (!this.style.originalAspectRatio) this.style.originalAspectRatio = null;
    }

    render(container, scales) {
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) {
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
            width = Math.max(10, Math.min(1500, width));
            height = Math.max(10, Math.min(1500, height));
        }

        this.group = container.append('g')
            .attr('class', 'drawing image-tool')
            .attr('data-id', this.id)
            .attr('transform', `translate(${x}, ${y})`)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Calculate actual rendered image dimensions when aspect ratio is maintained
        let borderWidth = width;
        let borderHeight = height;
        
        // Detect aspect ratio from image if not already stored
        if (this.style.imageUrl && !this.style.originalAspectRatio && !this._detectingAspectRatio) {
            this._detectingAspectRatio = true;
            const img = new Image();
            img.onload = () => {
                this.style.originalAspectRatio = img.width / img.height;
                this.style.maintainAspectRatio = true;
                this._detectingAspectRatio = false;
                if (this.chart && typeof this.chart.scheduleRender === 'function') {
                    this.chart.scheduleRender();
                }
            };
            img.src = this.style.imageUrl;
        }
        
        if (this.style.maintainAspectRatio && this.style.originalAspectRatio && this.style.imageUrl) {
            const aspectRatio = this.style.originalAspectRatio;
            const containerAspect = width / height;
            
            if (aspectRatio > containerAspect) {
                // Image is wider - height will be constrained
                borderHeight = width / aspectRatio;
            } else {
                // Image is taller - width will be constrained
                borderWidth = height * aspectRatio;
            }
        }

        // Add selection box (positioned relative to group's transform)
        this.group.append('rect')
            .attr('class', 'image-selection-box')
            .attr('x', -borderWidth / 2)
            .attr('y', -borderHeight / 2)
            .attr('width', borderWidth)
            .attr('height', borderHeight)
            .attr('fill', 'none')
            .attr('stroke', '#2962ff')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2')
            .style('pointer-events', 'none')
            .style('opacity', this.selected ? 1 : 0);

        // Add image (positioned relative to group's transform)
        if (this.style.imageUrl) {
            this.group.append('image')
                .attr('class', 'image-content')
                .attr('x', -width / 2)
                .attr('y', -height / 2)
                .attr('width', width)
                .attr('height', height)
                .attr('href', this.style.imageUrl)
                .attr('preserveAspectRatio', this.style.maintainAspectRatio ? 'xMidYMid meet' : 'none')
                .style('opacity', this.style.opacity != null ? this.style.opacity : 1)
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        } else {
            // Placeholder when no image is set
            this.group.append('rect')
                .attr('class', 'image-placeholder')
                .attr('x', -width / 2)
                .attr('y', -height / 2)
                .attr('width', width)
                .attr('height', height)
                .attr('fill', 'rgba(120, 123, 134, 0.1)')
                .attr('stroke', '#787b86')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,4')
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            this.group.append('text')
                .attr('x', 0)
                .attr('y', 0)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('fill', '#787b86')
                .attr('font-size', '14px')
                .style('pointer-events', 'none')
                .text('Upload image from settings');
        }

        this._currentWidth = width;
        this._currentHeight = height;
        this._borderWidth = borderWidth;
        this._borderHeight = borderHeight;

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
        
        // Use border dimensions if available (for aspect ratio images), otherwise use full dimensions
        const width = this._borderWidth || this._currentWidth || this.style.width;
        const height = this._borderHeight || this._currentHeight || this.style.height;
        
        // Positions relative to group's transform (0,0)
        const minX = -width / 2;
        const maxX = width / 2;
        const minY = -height / 2;
        const maxY = height / 2;
        const midX = 0;
        const midY = 0;
        
        const handlePositions = [
            // Corner handles
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            // Edge handles
            { x: midX, y: minY, cursor: 'ns-resize', role: 'edge-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'edge-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'edge-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'edge-left' }
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
        this._dragStartCenterPx = { x: this._screenX || 0, y: this._screenY || 0 };
        this._dragStartWidthPx = this._currentWidth || this.style.width || 100;
        this._dragStartHeightPx = this._currentHeight || this.style.height || 100;
        this._dragStartPoint = this.points && this.points[0] ? { x: this.points[0].x, y: this.points[0].y } : null;
        const screenX = context.screen?.x || 0;
        const screenY = context.screen?.y || 0;
        this._dragStartPos = { x: screenX, y: screenY };
    }

    handleCustomHandleDrag(handleRole, context = {}) {
        if (!handleRole || this._dragStartWidthInDataUnits == null) {
            return false;
        }
        
        const startX = this._dragStartPos?.x || 0;
        const startY = this._dragStartPos?.y || 0;
        const currentX = context.screen?.x || 0;
        const currentY = context.screen?.y || 0;
        
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (this._scales && this._scales.xScale && this._scales.yScale && this.points && this.points.length > 0) {
            const chart = this._scales.chart;
            const point = this.points[0];

            const startWidthPx = this._dragStartWidthPx || 100;
            const startHeightPx = this._dragStartHeightPx || 100;
            let newWidthPx = startWidthPx;
            let newHeightPx = startHeightPx;

            switch (handleRole) {
                case 'corner-br':
                    newWidthPx = startWidthPx + (dx * 2);
                    newHeightPx = startHeightPx + (dy * 2);
                    break;
                case 'corner-tl':
                    newWidthPx = startWidthPx - (dx * 2);
                    newHeightPx = startHeightPx - (dy * 2);
                    break;
                case 'corner-tr':
                    newWidthPx = startWidthPx + (dx * 2);
                    newHeightPx = startHeightPx - (dy * 2);
                    break;
                case 'corner-bl':
                    newWidthPx = startWidthPx - (dx * 2);
                    newHeightPx = startHeightPx + (dy * 2);
                    break;
                case 'edge-top':
                    newHeightPx = startHeightPx - (dy * 2);
                    break;
                case 'edge-bottom':
                    newHeightPx = startHeightPx + (dy * 2);
                    break;
                case 'edge-left':
                    newWidthPx = startWidthPx - (dx * 2);
                    break;
                case 'edge-right':
                    newWidthPx = startWidthPx + (dx * 2);
                    break;
                default:
                    return false;
            }

            newWidthPx = Math.max(10, Math.min(1500, newWidthPx));
            newHeightPx = Math.max(10, Math.min(1500, newHeightPx));

            // Maintain aspect ratio if enabled (only when we have a known ratio)
            if (this.style.maintainAspectRatio && this.style.originalAspectRatio) {
                const aspectRatio = this.style.originalAspectRatio;
                if (Math.abs(newWidthPx - startWidthPx) > Math.abs(newHeightPx - startHeightPx)) {
                    newHeightPx = newWidthPx / aspectRatio;
                } else {
                    newWidthPx = newHeightPx * aspectRatio;
                }
                newWidthPx = Math.max(10, Math.min(1500, newWidthPx));
                newHeightPx = Math.max(10, Math.min(1500, newHeightPx));
            }

            // Convert pixel size to data units using the chart helpers
            const startCenterPx = this._dragStartCenterPx || { x: this._screenX || 0, y: this._screenY || 0 };
            const newCenterPx = { x: startCenterPx.x, y: startCenterPx.y };
            const centerXData = point.x;
            const centerYData = point.y;

            const xAtOffset = chart && typeof chart.pixelToDataIndex === 'function'
                ? chart.pixelToDataIndex(newCenterPx.x + newWidthPx)
                : (typeof this._scales.xScale.invert === 'function' ? this._scales.xScale.invert(newCenterPx.x + newWidthPx) : (centerXData + 1));
            this.style.widthInDataUnits = Math.max(0.0001, Math.abs(xAtOffset - centerXData));

            const yAtOffset = this._scales.yScale.invert(newCenterPx.y + newHeightPx);
            this.style.heightInDataUnits = Math.max(0.0001, Math.abs(centerYData - yAtOffset));
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    endHandleDrag(handleRole, context = {}) {
        this._dragStartWidthInDataUnits = null;
        this._dragStartHeightInDataUnits = null;
        this._dragStartCenter = null;
        this._dragStartCenterPx = null;
        this._dragStartWidthPx = null;
        this._dragStartHeightPx = null;
        this._dragStartPoint = null;
        this._dragStartPos = null;
    }

    isPointInside(x, y, scales) {
        if (!this.points || this.points.length < 1) return false;

        const point = this.points[0];
        const cx = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
        const cy = scales.yScale(point.y);
        
        let width = this.style.width || 100;
        let height = this.style.height || 100;
        
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

        // Use the same effective bounds as the rendered selection box.
        // When preserveAspectRatio is enabled, the actual visible image is smaller than its container.
        // We store those bounds on render as _borderWidth/_borderHeight.
        if (this.style.maintainAspectRatio && this.style.originalAspectRatio && this.style.imageUrl) {
            if (this._borderWidth && this._borderHeight) {
                width = this._borderWidth;
                height = this._borderHeight;
            } else {
                const aspectRatio = this.style.originalAspectRatio;
                const containerAspect = width / height;
                if (aspectRatio > containerAspect) {
                    height = width / aspectRatio;
                } else {
                    width = height * aspectRatio;
                }
            }
        }
        
        const minX = cx - width / 2;
        const maxX = cx + width / 2;
        const minY = cy - height / 2;
        const maxY = cy + height / 2;
        
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    triggerImageUpload() {
        this._uploadDialogOpen = true;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        // Store original aspect ratio
                        this.style.originalAspectRatio = img.width / img.height;
                        this.style.maintainAspectRatio = true;
                        this.style.imageUrl = event.target.result;
                        this.meta.updatedAt = Date.now();
                        this._uploadDialogOpen = false;
                        // Trigger re-render
                        if (this.chart && typeof this.chart.scheduleRender === 'function') {
                            this.chart.scheduleRender();
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
            document.body.removeChild(input);
            if (!this.style.imageUrl) {
                this._uploadDialogOpen = false;
            }
        };
        
        input.oncancel = () => {
            document.body.removeChild(input);
            this._uploadDialogOpen = false;
        };
        
        input.click();
    }

    static fromJSON(data, chart) {
        const tool = new ImageTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.chart = chart;
        return tool;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageTool;
}
