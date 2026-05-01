/**
 * Drawing Tools - Emoji & Sticker Module
 * Provides a single-point drawing that renders emoji, stickers, or icon glyphs.
 * Supports resizing via corner handles like rectangles.
 * Size scales with chart zoom like other shapes.
 */
class EmojiStickerTool extends BaseDrawing {
    constructor(points = [], options = {}) {
        const resolved = EmojiStickerTool.resolveOptions(options);
        super('emoji', points, resolved);
        this.requiredPoints = 1;
        this.ensureDefaults();
        // Store initial font size for resize tracking
        this._dragStartFontSize = null;
        this._dragStartCenter = null;
    }

    static defaultFontFamily() {
        return "'Roboto', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif";
    }

    static resolveOptions(options = {}) {
        const category = options.category || 'emoji';
        const glyph = options.glyph || '😀';
        const fontSize = options.fontSize || (category === 'stickers' ? 64 : category === 'icons' ? 32 : 48);
        const fontFamily = options.fontFamily || EmojiStickerTool.defaultFontFamily();
        const backgroundColor = options.backgroundColor || 'rgba(0,0,0,0.25)';
        const showBackground = options.showBackground === true || category === 'stickers';
        const opacity = options.opacity != null ? options.opacity : 1;
        // Store size in data units for chart scaling
        const sizeInDataUnits = options.sizeInDataUnits || null;

        return {
            stroke: 'none',
            strokeWidth: 0,
            fill: 'none',
            opacity,
            glyph,
            category,
            fontSize,
            fontFamily,
            backgroundColor,
            showBackground,
            sizeInDataUnits
        };
    }

    ensureDefaults() {
        if (!this.style.glyph) this.style.glyph = '😀';
        if (!this.style.fontSize) this.style.fontSize = 48;
        if (!this.style.fontFamily) this.style.fontFamily = EmojiStickerTool.defaultFontFamily();
        if (typeof this.style.showBackground !== 'boolean') {
            this.style.showBackground = false;
        }
        if (!this.style.backgroundColor) {
            this.style.backgroundColor = 'rgba(0,0,0,0.25)';
        }
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

        // Store screen coordinates for resize calculations
        this._screenX = x;
        this._screenY = y;
        this._scales = scales;

        // Calculate font size based on data units (scales with chart)
        let fontSize = this.style.fontSize || 48;
        
        // Initialize sizeInDataUnits on first render if not set
        if (!this.style.sizeInDataUnits && scales.yScale) {
            // Convert current fontSize (pixels) to data units at the drawing's position
            const yPixel = scales.yScale(point.y);
            const yDataAtOffset = scales.yScale.invert(yPixel + fontSize);
            this.style.sizeInDataUnits = Math.abs(point.y - yDataAtOffset);
        }
        
        // Always calculate fontSize from sizeInDataUnits (scales with chart zoom)
        if (this.style.sizeInDataUnits && scales.yScale) {
            const y1Pixel = scales.yScale(point.y);
            const y2Pixel = scales.yScale(point.y - this.style.sizeInDataUnits);
            const calculatedSize = Math.abs(y2Pixel - y1Pixel);
            fontSize = Math.max(8, Math.min(500, calculatedSize));
        }

        this.group = container.append('g')
            .attr('class', `drawing emoji-sticker ${this.style.category || 'emoji'}`)
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        if (this.style.showBackground) {
            const radius = fontSize * 0.65;
            this.group.append('circle')
                .attr('class', 'emoji-background')
                .attr('cx', x)
                .attr('cy', y)
                .attr('r', radius)
                .attr('fill', this.style.backgroundColor)
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        }

        // Add selection box (dashed border when selected)
        const boxSize = fontSize * 1.2;
        this.group.append('rect')
            .attr('class', 'emoji-selection-box')
            .attr('x', x - boxSize / 2)
            .attr('y', y - boxSize / 2)
            .attr('width', boxSize)
            .attr('height', boxSize)
            .attr('fill', 'none')
            .attr('stroke', '#2962ff')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,2')
            .style('pointer-events', 'none')
            .style('opacity', this.selected ? 1 : 0);

        this.group.append('text')
            .attr('class', 'emoji-glyph')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', `${fontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('fill', '#ffffff')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .style('user-select', 'none')
            .style('filter', this.style.category === 'icons' ? 'none' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))')
            .text(this.style.glyph);

        // Store current calculated fontSize for handles
        this._currentFontSize = fontSize;

        // Create 4-corner resize handles like rectangles
        this.createBoxHandles(this.group, scales);

        return this.group;
    }

    /**
     * Create 4 corner resize handles like rectangles
     */
    createBoxHandles(group, scales) {
        const handleRadius = 3;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        
        if (this.points.length < 1) return;
        
        const point = this.points[0];
        const cx = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
        const cy = scales.yScale(point.y);
        
        // Use the calculated font size (scales with chart)
        const fontSize = this._currentFontSize || this.style.fontSize;
        const halfSize = fontSize * 0.6;
        
        const minX = cx - halfSize;
        const maxX = cx + halfSize;
        const minY = cy - halfSize;
        const maxY = cy + halfSize;
        
        // Define 4 corner handle positions (matching rectangle pattern)
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
     * Called when custom handle drag starts
     */
    beginHandleDrag(handleRole, context = {}) {
        // Store current size in data units
        this._dragStartSizeInDataUnits = this.style.sizeInDataUnits || 0;
        this._dragStartCenter = { x: this._screenX, y: this._screenY };
        // Use screen coordinates from context
        const screenX = context.screen?.x || 0;
        const screenY = context.screen?.y || 0;
        this._dragStartPos = { x: screenX, y: screenY };
    }

    /**
     * Handle custom drag for corner handles - resize the emoji
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        if (!handleRole || this._dragStartSizeInDataUnits == null) return false;
        
        const startX = this._dragStartPos?.x || 0;
        const startY = this._dragStartPos?.y || 0;
        // Use screen coordinates from context
        const currentX = context.screen?.x || 0;
        const currentY = context.screen?.y || 0;
        
        // Calculate drag distance from start
        const dx = currentX - startX;
        const dy = currentY - startY;
        
        // Calculate resize based on which corner is being dragged
        let delta = 0;
        switch (handleRole) {
            case 'corner-br':
                delta = (dx + dy) / 2;
                break;
            case 'corner-tl':
                delta = -(dx + dy) / 2;
                break;
            case 'corner-tr':
                delta = (dx - dy) / 2;
                break;
            case 'corner-bl':
                delta = (-dx + dy) / 2;
                break;
            default:
                return false;
        }
        
        // Convert pixel delta to data units using the Y scale
        if (this._scales && this._scales.yScale) {
            const point = this.points[0];
            const y1 = this._scales.yScale.invert(0);
            const y2 = this._scales.yScale.invert(delta);
            const deltaInDataUnits = Math.abs(y1 - y2);
            
            // Apply the delta to sizeInDataUnits
            const newSize = this._dragStartSizeInDataUnits + (delta > 0 ? deltaInDataUnits : -deltaInDataUnits);
            // Clamp to reasonable values
            this.style.sizeInDataUnits = Math.max(0.0001, newSize);
        }
        
        this.meta.updatedAt = Date.now();
        return true;
    }

    /**
     * Called when custom handle drag ends
     */
    endHandleDrag(handleRole, context = {}) {
        this._dragStartSizeInDataUnits = null;
        this._dragStartCenter = null;
        this._dragStartPos = null;
    }

    static fromJSON(data, chart) {
        const tool = new EmojiStickerTool(data.points, data.style || {});
        tool.id = data.id;
        tool.visible = data.visible;
        tool.meta = data.meta;
        tool.chart = chart;
        return tool;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmojiStickerTool;
}
