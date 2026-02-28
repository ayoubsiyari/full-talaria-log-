/**
 * Drawing Tools - Text & Annotation Tools Module
 * Implements: Text, Note Box
 */

// ============================================================================
// Text Tool
// ============================================================================
class TextTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Text') {
        super('text', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.textAlign = style.textAlign || 'left';
        // Store base scale for chart zoom scaling
        this.baseScale = null;
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Get zoom scale factor for visual scaling (same as other tools)
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(6, this.style.fontSize * scaleFactor);

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing text')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Draw the text with scaled font size (no transform locking)
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', x)
            .attr('y', y)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .attr('text-anchor', this.style.textAlign === 'center' ? 'middle' : 
                               this.style.textAlign === 'right' ? 'end' : 'start')
            .attr('xml:space', 'preserve')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .style('user-select', 'none');

        const lineHeight = scaledFontSize * 1.2;
        const lines = (this.text || '').split('\n');
        lines.forEach((line, index) => {
            const sanitizedLine = line.length ? line.replace(/ /g, '\u00A0') : '\u00A0';
            const tspan = textElement.append('tspan')
                .attr('x', x)
                .attr('dy', index === 0 ? 0 : lineHeight)
                .text(sanitizedLine);
            if (this.style.textAlign === 'center') {
                tspan.attr('text-anchor', 'middle');
            } else if (this.style.textAlign === 'right') {
                tspan.attr('text-anchor', 'end');
            }
        });

        // Add optional text shadow for better readability (disabled by default)
        if (this.style.textShadow === true) {
            textElement.style('text-shadow', '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)');
        }

        // Get text bounding box for handles
        const textNode = textElement.node();
        let bbox;
        try {
            bbox = textNode.getBBox();
        } catch (e) {
            bbox = { x: x, y: y - scaledFontSize, width: 50, height: scaledFontSize * 1.2 };
        }
        
        // Add background rectangle if enabled
        const padding = 6;
        const hasBackground = this.style.fill && this.style.fill !== 'none';
        const hasBorder = this.style.stroke && this.style.stroke !== 'none';
        
        if (hasBackground || hasBorder) {
            this.group.insert('rect', 'text')
                .attr('class', hasBackground ? 'text-background' : 'text-border')
                .attr('x', bbox.x - padding)
                .attr('y', bbox.y - padding)
                .attr('width', bbox.width + padding * 2)
                .attr('height', bbox.height + padding * 2)
                .attr('rx', 4)
                .attr('ry', 4)
                .attr('fill', hasBackground ? this.style.fill : 'none')
                .attr('stroke', hasBorder ? this.style.stroke : 'none')
                .attr('stroke-width', hasBorder ? 1 : 0)
                .style('pointer-events', 'none');
            
            // Expand bbox to include padding
            bbox = {
                x: bbox.x - padding,
                y: bbox.y - padding,
                width: bbox.width + padding * 2,
                height: bbox.height + padding * 2
            };
        } else {
            // Always add some padding to bbox for handle positioning even without border/background
            bbox = {
                x: bbox.x - padding,
                y: bbox.y - padding,
                width: bbox.width + padding * 2,
                height: bbox.height + padding * 2
            };
        }
        
        // Store bbox for handle creation
        this.bbox = bbox;

        const bodyHitArea = this.group.insert('rect', 'text')
            .attr('class', 'shape-border-hit text-body-hit')
            .attr('x', bbox.x)
            .attr('y', bbox.y)
            .attr('width', bbox.width)
            .attr('height', bbox.height)
            .attr('fill', 'transparent')
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .attr('rx', 4)
            .attr('ry', 4)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Create resize handles like rectangles (4 corners + 4 sides)
        this.createTextHandles(this.group, bbox);

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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = textElement.node().getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
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
                    width: rect.width,
                    height: rect.height,
                    padding: '0px',
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight,
                    color: self.style.textColor,
                    textAlign: self.style.textAlign || 'left',
                    hideTargets: [textElement.node()],
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        textElement.node().addEventListener('mousedown', handleMouseDown, true);
        textElement.node().addEventListener('click', handleInlineEdit, true);
        textElement.node().addEventListener('dblclick', handleOpenSettings, true);

        if (bodyHitArea && bodyHitArea.node()) {
            bodyHitArea.node().addEventListener('mousedown', handleMouseDown, true);
            bodyHitArea.node().addEventListener('click', handleInlineEdit, true);
            bodyHitArea.node().addEventListener('dblclick', handleOpenSettings, true);
        }

        return this.group;
    }

    /**
     * Create 8-point resize handles for text (4 corners + 4 sides) like rectangle
     */
    createTextHandles(group, bbox) {
        const handleRadius = 3;  // Visual handle size
        const hitRadius = 12;    // Larger hit area for easier clicking
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        const minX = bbox.x;
        const maxX = bbox.x + bbox.width;
        const minY = bbox.y;
        const maxY = bbox.y + bbox.height;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        
        // Define 8 handle positions: 4 corners + 4 sides
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            // Invisible larger hit area for easier clicking - only active when selected
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', pos.cursor)
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            // Visual handle circle (white fill, blue outline)
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', pos.x)
                .attr('cy', pos.y)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', pos.cursor)
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('opacity', this.selected ? 1 : 0)  // Only visible when selected
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
     * Begin handle drag - store initial state
     */
    beginHandleDrag(handleRole, context) {
        this.dragStartFontSize = this.style.fontSize || 14;
        this.dragStartScreenX = context.screen.x;
        this.dragStartScreenY = context.screen.y;
        // Fallback bbox if not set
        this.dragStartBbox = this.bbox ? { ...this.bbox } : { x: 0, y: 0, width: 100, height: 50 };
        this.dragHandleRole = handleRole;
    }

    /**
     * Handle custom handle drag for resizing (like rectangle)
     */
    handleCustomHandleDrag(handleRole, context) {
        if (this.dragStartFontSize === undefined || !this.dragStartBbox) {
            return;
        }

        const deltaX = context.screen.x - this.dragStartScreenX;
        const deltaY = context.screen.y - this.dragStartScreenY;
        const role = this.dragHandleRole || handleRole;
        
        // Calculate scale factor based on handle role and drag direction
        let scaleFactor = 1;
        const bbox = this.dragStartBbox;
        
        if (role === 'corner-br' || role === 'corner-tr') {
            // Right corners: expand right = bigger
            const newWidth = bbox.width + deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'corner-bl' || role === 'corner-tl') {
            // Left corners: expand left = bigger
            const newWidth = bbox.width - deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-right') {
            // Right side: expand right = bigger
            const newWidth = bbox.width + deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-left') {
            // Left side: expand left = bigger
            const newWidth = bbox.width - deltaX;
            scaleFactor = newWidth / bbox.width;
        } else if (role === 'side-bottom') {
            // Bottom side: expand down = bigger
            const newHeight = bbox.height + deltaY;
            scaleFactor = newHeight / bbox.height;
        } else if (role === 'side-top') {
            // Top side: expand up = bigger
            const newHeight = bbox.height - deltaY;
            scaleFactor = newHeight / bbox.height;
        }
        
        // Apply scale to font size
        scaleFactor = Math.max(0.2, Math.min(5, scaleFactor)); // Clamp scale
        const newFontSize = Math.max(8, Math.min(200, Math.round(this.dragStartFontSize * scaleFactor)));
        
        this.style.fontSize = newFontSize;
    }

    /**
     * End handle drag - clean up
     */
    endHandleDrag(handleRole, context) {
        this.dragStartFontSize = undefined;
        this.dragStartScreenX = undefined;
        this.dragStartScreenY = undefined;
        this.dragStartBbox = null;
        this.dragHandleRole = null;
    }

    /**
     * Update text content
     */
    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text,
            baseScale: this.baseScale
        };
    }

    static fromJSON(data, chart) {
        const text = new TextTool(data.points, data.style, data.text);
        text.id = data.id;
        text.visible = data.visible;
        text.meta = data.meta;
        text.baseScale = data.baseScale || null;
        text.chart = chart; // Set chart reference for multi-timeframe support
        return text;
    }
}

// ============================================================================
// Note Box Tool (Text with background)
// ============================================================================
class NoteBoxTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Note') {
        super('notebox', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.backgroundColor = style.backgroundColor || 'rgba(41, 98, 255, 0.9)';
        this.style.padding = style.padding || 8;
        this.style.borderRadius = style.borderRadius || 4;
        this.style.maxWidth = style.maxWidth || 200;
    }

    render(container, scales) {
        // Remove existing if any
        if (this.group) {
            this.group.remove();
        }

        if (this.points.length < 1) return;

        // Create group for this drawing
        this.group = container.append('g')
            .attr('class', 'drawing notebox')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart && scales.chart.dataIndexToPixel ? 
            scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Create temporary text element to measure size
        const tempText = container.append('text')
            .attr('font-size', `${this.style.fontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .text(this.text);
        
        const textBBox = tempText.node().getBBox();
        tempText.remove();

        // Calculate box dimensions
        const boxWidth = Math.min(textBBox.width + (this.style.padding * 2), this.style.maxWidth);
        const boxHeight = textBBox.height + (this.style.padding * 2);

        // Draw background box
        const box = this.group.append('rect')
            .attr('x', x)
            .attr('y', y - boxHeight)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.backgroundColor)
            .attr('rx', this.style.borderRadius)
            .attr('stroke', this.style.stroke || 'none')
            .attr('stroke-width', this.style.strokeWidth || 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', x)
            .attr('y', y - boxHeight)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', this.style.borderRadius)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw the text
        const textElement = this.group.append('text')
            .attr('x', x + this.style.padding)
            .attr('y', y - this.style.padding)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${this.style.fontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('dominant-baseline', 'alphabetic')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        // Handle text wrapping if needed
        const words = this.text.split(' ');
        let line = '';
        let lineNumber = 0;
        const lineHeight = this.style.fontSize * 1.2;
        
        words.forEach((word, i) => {
            const testLine = line + (line ? ' ' : '') + word;
            const testText = container.append('text')
                .attr('font-size', `${this.style.fontSize}px`)
                .attr('font-family', this.style.fontFamily)
                .text(testLine);
            const testWidth = testText.node().getBBox().width;
            testText.remove();

            if (testWidth > (this.style.maxWidth - this.style.padding * 2) && line !== '') {
                textElement.append('tspan')
                    .attr('x', x + this.style.padding)
                    .attr('dy', lineNumber === 0 ? 0 : lineHeight)
                    .text(line);
                line = word;
                lineNumber++;
            } else {
                line = testLine;
            }
        });

        // Add final line
        textElement.append('tspan')
            .attr('x', x + this.style.padding)
            .attr('dy', lineNumber === 0 ? 0 : lineHeight)
            .text(line);

        // Store bbox for handle creation
        this.bbox = { x: x, y: y - boxHeight, width: boxWidth, height: boxHeight };

        // Create resize handles like rectangles (4 corners + 4 sides)
        this.createTextHandles(this.group, this.bbox);

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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = box.node().getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
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
                'Enter note text…',
                {
                    width: rect.width,
                    height: rect.height,
                    padding: `${self.style.padding || 6}px`,
                    fontSize: `${self.style.fontSize || 14}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight || 'normal',
                    color: self.style.textColor,
                    textAlign: 'left',
                    hideTargets: [textElement.node()],
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        box.node().addEventListener('mousedown', handleMouseDown, true);
        box.node().addEventListener('click', handleInlineEdit, true);
        box.node().addEventListener('dblclick', handleOpenSettings, true);

        return this.group;
    }

    /**
     * Create 8-point resize handles for notebox (4 corners + 4 sides) like rectangle
     */
    createTextHandles(group, bbox) {
        const handleRadius = 2.5;
        const handleFill = 'transparent';
        const handleStroke = '#2962FF';
        const handleStrokeWidth = 2;
        
        // Remove existing handles
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.custom-handle').remove();
        
        const minX = bbox.x;
        const maxX = bbox.x + bbox.width;
        const minY = bbox.y;
        const maxY = bbox.y + bbox.height;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        
        // Define 8 handle positions: 4 corners + 4 sides
        const handlePositions = [
            { x: minX, y: minY, cursor: 'nwse-resize', role: 'corner-tl' },
            { x: maxX, y: minY, cursor: 'nesw-resize', role: 'corner-tr' },
            { x: maxX, y: maxY, cursor: 'nwse-resize', role: 'corner-br' },
            { x: minX, y: maxY, cursor: 'nesw-resize', role: 'corner-bl' },
            { x: midX, y: minY, cursor: 'ns-resize', role: 'side-top' },
            { x: maxX, y: midY, cursor: 'ew-resize', role: 'side-right' },
            { x: midX, y: maxY, cursor: 'ns-resize', role: 'side-bottom' },
            { x: minX, y: midY, cursor: 'ew-resize', role: 'side-left' }
        ];
        
        this.handles = [];
        
        handlePositions.forEach((pos, index) => {
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-handle-role', pos.role)
                .attr('data-point-index', index);
            
            const handle = handleGroup.append('circle')
                .attr('class', 'custom-handle')
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
     * Begin handle drag - store initial state
     */
    beginHandleDrag(handleRole, context) {
        this.dragStartFontSize = this.style.fontSize;
        this.dragStartScreenY = context.screen.y;
    }

    /**
     * Handle custom handle drag for resizing
     */
    handleCustomHandleDrag(handleRole, context) {
        if (this.dragStartFontSize === undefined) return;

        // Calculate screen distance moved
        const deltaY = context.screen.y - this.dragStartScreenY;
        
        // Convert to font size change (moving UP = bigger, down = smaller)
        // Negative deltaY because screen Y increases downward
        const fontSizeChange = -deltaY * 0.3;
        const newFontSize = Math.max(8, Math.min(200, this.dragStartFontSize + fontSizeChange));
        
        this.style.fontSize = Math.round(newFontSize);
    }

    /**
     * End handle drag - clean up
     */
    endHandleDrag(handleRole, context) {
        this.dragStartFontSize = undefined;
        this.dragStartScreenY = undefined;
    }

    /**
     * Update text content
     */
    setText(newText) {
        this.text = newText;
        this.meta.updatedAt = Date.now();
    }

    toJSON() {
        return {
            ...super.toJSON(),
            text: this.text
        };
    }

    static fromJSON(data, chart) {
        const note = new NoteBoxTool(data.points, data.style, data.text);
        note.id = data.id;
        note.visible = data.visible;
        note.meta = data.meta;
        note.chart = chart; // Set chart reference for multi-timeframe support
        return note;
    }
}

// ============================================================================
// Anchored Text Tool - Text with anchor arrow
// ============================================================================
class AnchoredTextTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Anchored Text') {
        super('anchored-text', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.backgroundColor = style.backgroundColor || 'rgba(41, 98, 255, 0.9)';
        this.style.borderColor = style.borderColor || '#B2B5BE';
        this.style.anchorLength = style.anchorLength || 30;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing anchored-text')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Draw anchor line
        this.group.append('line')
            .attr('x1', x).attr('y1', y)
            .attr('x2', x).attr('y2', y - this.style.anchorLength)
            .attr('stroke', this.style.stroke || '#787b86')
            .attr('stroke-width', 2);

        // Draw anchor point
        this.group.append('circle')
            .attr('cx', x).attr('cy', y)
            .attr('r', 4)
            .attr('fill', this.style.stroke || '#787b86');

        // Draw text background
        const padding = 6;
        const tempText = container.append('text')
            .attr('font-size', `${this.style.fontSize}px`)
            .text(this.text);
        const bbox = tempText.node().getBBox();
        tempText.remove();

        const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
        const background = this.group.append('rect')
            .attr('class', 'inline-editable-text')
            .attr('x', x - bbox.width/2 - padding)
            .attr('y', y - this.style.anchorLength - bbox.height - padding*2)
            .attr('width', bbox.width + padding*2)
            .attr('height', bbox.height + padding*2)
            .attr('fill', this.style.backgroundColor)
            .attr('rx', 4)
            .attr('stroke', hasBorder ? this.style.borderColor : 'none')
            .attr('stroke-width', hasBorder ? 1 : 0)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', x - bbox.width/2 - padding)
            .attr('y', y - this.style.anchorLength - bbox.height - padding*2)
            .attr('width', bbox.width + padding*2)
            .attr('height', bbox.height + padding*2)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 4)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', x)
            .attr('y', y - this.style.anchorLength - padding)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${this.style.fontSize}px`)
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .text(this.text);

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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = background.node().getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
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
                    width: rect.width,
                    height: rect.height,
                    padding: '0px',
                    fontSize: `${self.style.fontSize || 12}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight || 'normal',
                    color: self.style.textColor,
                    textAlign: 'center',
                    hideTargets: [textElement.node()],
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        [background.node(), textElement.node()].forEach((n) => {
            n.addEventListener('mousedown', handleMouseDown, true);
            n.addEventListener('click', handleInlineEdit, true);
            n.addEventListener('dblclick', handleOpenSettings, true);
        });

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new AnchoredTextTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Note Tool - Line with text box at end point (like TradingView callout)
// ============================================================================
class NoteTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Add text') {
        super('note', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 1;
        // Use fill for background color (UI uses fill)
        this.style.fill = style.fill || style.backgroundColor || 'rgba(50, 50, 50, 0.9)';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing note')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const p2 = this.points[1];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        // Invisible hit area for easier selection (rendered first, behind visible line)
        this.group.append('line')
            .attr('class', 'note-line-hit shape-border-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 20)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw the visible line
        this.group.append('line')
            .attr('class', 'note-line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .style('pointer-events', 'none')
            .style('cursor', 'move');

        // Text box at end point (p2)
        const padding = 6;
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .text(this.text || 'Add text');
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 60, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = Math.max(textBbox.width + padding * 2, 60);
        const boxHeight = textBbox.height + padding * 2;

        // Position box to the right of endpoint
        const boxX = x2 + 5;
        const boxY = y2 - boxHeight / 2;

        // Background rectangle - use fill for background color
        const textBox = this.group.append('rect')
            .attr('class', 'inline-editable-text')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.fill)
            .attr('rx', 4)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', 1)
            .style('pointer-events', 'all')
            .style('cursor', 'move');

        // Text
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', boxX + padding)
            .attr('y', y2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .text(this.text || 'Add text');

        // Add double-click to edit text inline using native addEventListener (won't be overwritten)
        const self = this;
        const startInlineEdit = function() {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (editor && typeof editor.show === 'function') {
                const bbox = textBox.node().getBoundingClientRect();
                const editX = bbox.left + window.scrollX;
                const editY = bbox.top + window.scrollY;

                if (typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                }

                editor.show(
                    editX,
                    editY,
                    self.text || '',
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
                    'Add text',
                    {
                        width: bbox.width,
                        height: bbox.height,
                        padding: `${padding}px`,
                        fontSize: `${scaledFontSize}px`,
                        fontFamily: self.style.fontFamily,
                        fontWeight: self.style.fontWeight || 'normal',
                        color: self.style.textColor,
                        textAlign: 'left',
                        hideTargets: [textElement.node()],
                        hideSelector: `.drawing[data-id="${self.id}"] text`
                    }
                );

                return;
            }

            // Remove any existing inline editor
            d3.select('.note-inline-editor').remove();
            
            // Get position of text box on screen
            const textBoxNode = textBox.node();
            const bbox = textBoxNode.getBoundingClientRect();
            
            // Create inline editor
            const editorEl = d3.select('body').append('div')
                .attr('class', 'note-inline-editor')
                .style('position', 'fixed')
                .style('left', bbox.left + 'px')
                .style('top', bbox.top + 'px')
                .style('width', Math.max(bbox.width, 120) + 'px')
                .style('min-height', bbox.height + 'px')
                .style('z-index', '10000')
                .style('background', self.style.fill || 'rgba(50, 50, 50, 0.95)')
                .style('border', '2px solid #2962ff')
                .style('border-radius', '4px')
                .style('padding', '4px 6px')
                .style('box-sizing', 'border-box');
            
            const input = editorEl.append('input')
                .attr('type', 'text')
                .attr('value', self.text || '')
                .attr('placeholder', 'Add text')
                .style('width', '100%')
                .style('background', 'transparent')
                .style('border', 'none')
                .style('outline', 'none')
                .style('color', self.style.textColor || '#ffffff')
                .style('font-size', (self.style.fontSize || 12) + 'px')
                .style('font-family', self.style.fontFamily || 'Roboto, sans-serif')
                .style('padding', '0')
                .style('margin', '0');
            
            const inputNode = input.node();
            inputNode.focus();
            inputNode.select();
            
            // Save function
            const saveAndClose = () => {
                const newText = inputNode.value.trim() || 'Add text';
                self.setText(newText);
                editorEl.remove();
                if (self.chart) self.chart.render();
            };
            
            // Handle Enter to save, Escape to cancel
            input.on('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAndClose();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    editorEl.remove();
                }
            });
            
            // Save on blur (clicking outside)
            input.on('blur', function() {
                setTimeout(saveAndClose, 100);
            });
        };

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

        const handleInlineEdit = function(event) {
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
            }, CLICK_DELAY);
        };

        const handleOpenSettings = function(event) {
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
        
        // Use native addEventListener with capture phase - won't be overwritten by d3
        // Single click to edit text, double-click on border opens settings
        textBox.node().addEventListener('mousedown', handleMouseDown, true);
        textElement.node().addEventListener('mousedown', handleMouseDown, true);
        textBox.node().addEventListener('click', handleInlineEdit, true);
        textElement.node().addEventListener('click', handleInlineEdit, true);
        textBox.node().addEventListener('dblclick', handleOpenSettings, true);
        textElement.node().addEventListener('dblclick', handleOpenSettings, true);

        // Create handles at both endpoints
        this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new NoteTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
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
// Price Note Tool - Line with price label at end point (2-point like TradingView)
// ============================================================================
class PriceNoteTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-note', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing price-note')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0]; // Start point (where line starts)
        const p2 = this.points[1]; // End point (where price label goes)
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        const x2 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const y2 = scales.yScale(p2.y);

        // Draw the line
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Invisible hit area
        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 15)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Format price from START point (p1) - the point we drag from
        const formatPrice = (price) => {
            if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(5);
        };

        const priceText = formatPrice(p1.y);
        const padding = 8;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .text(priceText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 60, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding;

        // Rotate the label to match the line direction (and keep it readable)
        const dx = x2 - x1;
        const dy = y2 - y1;
        let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;

        const markerRadius = 6 * scaleFactor;
        const endpointClearance = this.selected ? markerRadius : 0;

        const len = Math.hypot(dx, dy);
        const ux = len > 0 ? (dx / len) : 0;
        const uy = len > 0 ? (dy / len) : 1;
        const labelDistance = endpointClearance + boxHeight / 2;
        let labelX = x2 + ux * labelDistance;
        let labelY = y2 + uy * labelDistance;

        const xRange = scales.xScale.range();
        const yRange = scales.yScale.range();
        const minX = Math.min(xRange[0], xRange[1]);
        const maxX = Math.max(xRange[0], xRange[1]);
        const minY = Math.min(yRange[0], yRange[1]);
        const maxY = Math.max(yRange[0], yRange[1]);
        const chartMarginTop = (scales.chart && scales.chart.margin && typeof scales.chart.margin.t === 'number')
            ? scales.chart.margin.t
            : 0;
        const clampMinY = Math.max(0, minY - chartMarginTop);
        const edgePad = 0;
        labelX = Math.max(minX + boxWidth / 2 + edgePad, Math.min(maxX - boxWidth / 2 - edgePad, labelX));
        labelY = Math.max(clampMinY + boxHeight / 2 + edgePad, Math.min(maxY - boxHeight / 2 - edgePad, labelY));

        const labelGroup = this.group.append('g')
            .attr('class', 'price-note-label')
            .attr('transform', `translate(${labelX},${labelY})`);

        const boxX = -boxWidth / 2;
        const boxY = -boxHeight / 2;

        labelGroup.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.fill)
            .attr('rx', 4)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        labelGroup.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 4)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        labelGroup.append('text')
            .attr('x', 0)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        // Create handles at both endpoints
        this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceNoteTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
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
// Pin Tool - Location marker with text box above (TradingView style)
// ============================================================================
class PinTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('pin', points, style);
        this.requiredPoints = 1;
        this.text = text || '';
        this.style.fill = style.fill || '#2962ff';
        this.style.stroke = style.stroke || '#2962ff';
        this.style.backgroundColor = style.backgroundColor || '#363a45';
        this.style.borderColor = style.borderColor || '#555';
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(11, this.style.fontSize * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing pin')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Pin dimensions - classic location marker style
        const pinRadius = 12; // Radius of the circular bulb
        const pinHeight = 36; // Total height from point to top
        const bulbCenterY = y - pinHeight + pinRadius; // Center of the circular bulb

        // Text box above the pin (only if text exists) - hidden by default, shown on hover
        const displayText = this.text || '';
        let textBoxGroup = null;
        
        if (displayText) {
            const padding = 14;
            const boxGap = 8;
            
            // Measure text
            const tempText = container.append('text')
                .attr('font-size', `${scaledFontSize}px`)
                .attr('font-family', this.style.fontFamily)
                .text(displayText);
            let textBbox;
            try {
                textBbox = tempText.node().getBBox();
            } catch(e) {
                textBbox = { width: 60, height: scaledFontSize * 1.2 };
            }
            tempText.remove();

            const boxWidth = Math.max(textBbox.width + padding * 2, 80);
            const boxHeight = textBbox.height + padding;
            const boxX = x - boxWidth / 2;
            const boxY = y - pinHeight - boxGap - boxHeight - 8;
            const arrowSize = 8;

            // Create text box group - hidden by default, visible when selected
            const isSelected = this.selected || false;
            textBoxGroup = this.group.append('g')
                .attr('class', 'pin-text-box')
                .style('opacity', isSelected ? 1 : 0)
                .style('pointer-events', isSelected ? 'all' : 'none')
                .style('transition', 'opacity 0.15s ease');

            // Text box background with pointer arrow
            const boxPath = `
                M ${boxX + 8} ${boxY}
                L ${boxX + boxWidth - 8} ${boxY}
                Q ${boxX + boxWidth} ${boxY}, ${boxX + boxWidth} ${boxY + 8}
                L ${boxX + boxWidth} ${boxY + boxHeight - 8}
                Q ${boxX + boxWidth} ${boxY + boxHeight}, ${boxX + boxWidth - 8} ${boxY + boxHeight}
                L ${x + arrowSize} ${boxY + boxHeight}
                L ${x} ${boxY + boxHeight + arrowSize}
                L ${x - arrowSize} ${boxY + boxHeight}
                L ${boxX + 8} ${boxY + boxHeight}
                Q ${boxX} ${boxY + boxHeight}, ${boxX} ${boxY + boxHeight - 8}
                L ${boxX} ${boxY + 8}
                Q ${boxX} ${boxY}, ${boxX + 8} ${boxY}
                Z
            `;

            const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
            const boxPathEl = textBoxGroup.append('path')
                .attr('class', 'inline-editable-text shape-border')
                .attr('d', boxPath)
                .attr('fill', this.style.backgroundColor)
                .attr('stroke', hasBorder ? this.style.borderColor : 'none')
                .attr('stroke-width', hasBorder ? 1 : 0)
                .style('pointer-events', 'all')
                .style('cursor', 'move');

            // Text
            const boxTextEl = textBoxGroup.append('text')
                .attr('class', 'inline-editable-text')
                .attr('x', x)
                .attr('y', boxY + boxHeight / 2 + scaledFontSize * 0.35)
                .attr('fill', this.style.textColor)
                .attr('font-size', `${scaledFontSize}px`)
                .attr('font-family', this.style.fontFamily)
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'all')
                .style('cursor', 'move')
                .text(displayText);

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

            const startInlineEdit = () => {
                const manager = self.chart && self.chart.drawingManager;
                const editor = manager && manager.textEditor;
                if (!editor || typeof editor.show !== 'function') return;

                const rect = boxPathEl.node().getBoundingClientRect();
                const editX = rect.left + window.scrollX;
                const editY = rect.top + window.scrollY;

                if (typeof manager.selectDrawing === 'function' && !self.locked) {
                    manager.selectDrawing(self);
                }

                editor.show(
                    editX,
                    editY,
                    self.text || '',
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
                        width: rect.width,
                        height: rect.height,
                        padding: '0px',
                        fontSize: `${self.style.fontSize || 12}px`,
                        fontFamily: self.style.fontFamily,
                        fontWeight: self.style.fontWeight || 'normal',
                        color: self.style.textColor,
                        textAlign: 'center',
                        hideTargets: [boxTextEl.node()],
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

                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    startInlineEdit();
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

            [boxPathEl.node(), boxTextEl.node()].forEach((n) => {
                n.addEventListener('mousedown', handleMouseDown, true);
                n.addEventListener('click', handleInlineEdit, true);
                n.addEventListener('dblclick', handleOpenSettings, true);
            });
        }

        // Map pin marker - classic location pin with round bulb and sharp point
        // The shape is: circular bulb at top, curves down to a sharp point
        const pinPath = `
            M ${x} ${y}
            C ${x - 6} ${y - 10}, ${x - pinRadius} ${y - pinHeight + pinRadius + 8}, ${x - pinRadius} ${bulbCenterY}
            A ${pinRadius} ${pinRadius} 0 1 1 ${x + pinRadius} ${bulbCenterY}
            C ${x + pinRadius} ${y - pinHeight + pinRadius + 8}, ${x + 6} ${y - 10}, ${x} ${y}
            Z
        `;

        const pinMarker = this.group.append('path')
            .attr('d', pinPath)
            .attr('fill', this.style.fill)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pinPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 16)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Inner hole - dark circle in center of bulb
        this.group.append('circle')
            .attr('cx', x)
            .attr('cy', bulbCenterY)
            .attr('r', 5)
            .attr('fill', '#131722')
            .style('pointer-events', 'none');

        // Add hover handlers to show/hide text box (keep visible when selected)
        if (textBoxGroup) {
            const self = this;
            this.group
                .on('mouseenter.textbox', () => {
                    textBoxGroup.style('opacity', 1);
                    textBoxGroup.style('pointer-events', 'all');
                })
                .on('mouseleave.textbox', () => {
                    // Only hide if not selected
                    if (!self.selected) {
                        textBoxGroup.style('opacity', 0);
                        textBoxGroup.style('pointer-events', 'none');
                    }
                });
        }

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new PinTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        tool.baseScale = data.baseScale || null;
        return tool;
    }
}

// ============================================================================
// Table Tool - Info table showing candle OHLC data at placed point
// ============================================================================
class TableTool extends BaseDrawing {
    constructor(points = [], style = {}, data = null) {
        super('table', points, style);
        this.requiredPoints = 1;
        this.tableData = data;
        this.style.backgroundColor = style.backgroundColor || 'rgba(30, 34, 45, 0.98)';
        this.style.textColor = style.textColor || '#D1D4DC';
        this.style.headerColor = style.headerColor || '#787B86';
        this.style.borderColor = style.borderColor || '#363A45';
        this.style.accentColor = style.accentColor || '#787b86';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing table')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);
        
        // Get candle data at this index
        const chart = scales.chart;
        const candleIndex = Math.round(p.x);
        const candle = chart?.data?.[candleIndex];
        
        // Format helpers
        const formatPrice = (price) => {
            if (!price && price !== 0) return '-';
            if (price > 1000) return price.toFixed(2);
            if (price > 1) return price.toFixed(4);
            return price.toFixed(5);
        };
        
        const formatDate = (timestamp) => {
            if (!timestamp) return '-';
            const d = new Date(timestamp);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        };
        
        const formatTime = (timestamp) => {
            if (!timestamp) return '';
            const d = new Date(timestamp);
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        };

        // Build table data from candle
        const tableRows = candle ? [
            ['Date', formatDate(candle.t)],
            ['Time', formatTime(candle.t)],
            ['Open', formatPrice(candle.o)],
            ['High', formatPrice(candle.h)],
            ['Low', formatPrice(candle.l)],
            ['Close', formatPrice(candle.c)],
            ['Volume', candle.v ? candle.v.toLocaleString() : '-']
        ] : this.tableData || [
            ['Label', 'Value'],
            ['Row 1', '100']
        ];

        const labelWidth = 60;
        const valueWidth = 80;
        const cellHeight = 22;
        const totalWidth = labelWidth + valueWidth;
        const totalHeight = tableRows.length * cellHeight;
        const padding = 8;

        // Draw shadow
        this.group.append('rect')
            .attr('x', x + 3).attr('y', y + 3)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', 'rgba(0,0,0,0.3)')
            .attr('rx', 6);

        // Draw background
        const tableBackground = this.group.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', this.style.borderColor)
            .attr('rx', 6)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', totalHeight + padding * 2)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 6)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Accent bar at top
        this.group.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', totalWidth + padding * 2)
            .attr('height', 3)
            .attr('fill', this.style.accentColor)
            .attr('rx', 6);

        // Draw rows
        for (let r = 0; r < tableRows.length; r++) {
            const rowY = y + padding + r * cellHeight;
            
            // Row separator (except first)
            if (r > 0) {
                this.group.append('line')
                    .attr('x1', x + padding)
                    .attr('y1', rowY)
                    .attr('x2', x + padding + totalWidth)
                    .attr('y2', rowY)
                    .attr('stroke', this.style.borderColor)
                    .attr('stroke-opacity', 0.5);
            }

            // Label
            this.group.append('text')
                .attr('x', x + padding + 4)
                .attr('y', rowY + cellHeight/2 + 4)
                .attr('fill', this.style.headerColor)
                .attr('font-size', '10px')
                .style('pointer-events', 'none')
                .text(tableRows[r][0]);

            // Value
            this.group.append('text')
                .attr('x', x + padding + labelWidth + valueWidth - 4)
                .attr('y', rowY + cellHeight/2 + 4)
                .attr('fill', this.style.textColor)
                .attr('font-size', '11px')
                .attr('text-anchor', 'end')
                .attr('font-weight', '500')
                .style('pointer-events', 'none')
                .text(tableRows[r][1]);
        }

        return this.group;
    }

    toJSON() { return { ...super.toJSON(), tableData: this.tableData }; }
    static fromJSON(data, chart) {
        const tool = new TableTool(data.points, data.style, data.tableData);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Callout Tool - Clean speech bubble with customizable direction
// ============================================================================
class CalloutTool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'Add text') {
        super('callout', points, style);
        this.requiredPoints = 2;
        this.text = text;
        this.style.stroke = style.stroke || '#2962FF'; // Circle/anchor color
        this.style.backgroundColor = style.backgroundColor || '#FFFFFF';
        this.style.borderColor = style.borderColor || '#B2B5BE';
        this.style.textColor = style.textColor || '#F23645';
        this.style.fontSize = style.fontSize || 14;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 2) return;

        this.group = container.append('g')
            .attr('class', 'drawing callout')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        // Point 1: anchor/tip point, Point 2: bubble position
        const p1 = this.points[0];
        const p2 = this.points[1];
        const tipX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const tipY = scales.yScale(p1.y);
        const bubbleCenterX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p2.x) : scales.xScale(p2.x);
        const bubbleCenterY = scales.yScale(p2.y);

        const padding = 12;
        const minWidth = 80;
        const minHeight = 32;
        const cornerRadius = 8;
        
        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${this.style.fontSize}px`)
            .text(this.text);
        const bbox = tempText.node().getBBox();
        tempText.remove();

        const bubbleWidth = Math.max(bbox.width + padding * 2, minWidth);
        const bubbleHeight = Math.max(bbox.height + padding * 2, minHeight);

        // Bubble positioned at second point (left-aligned, vertically centered)
        const bubbleX = bubbleCenterX;
        const bubbleY = bubbleCenterY - bubbleHeight / 2;

        // Tapered pointer - connects tip to bubble left edge
        const pointerBaseWidth = 14;
        
        // Triangle: tip point, top of base at bubble edge, bottom of base at bubble edge
        const pointerPath = `
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY - pointerBaseWidth / 2}
            L ${bubbleX} ${bubbleCenterY + pointerBaseWidth / 2}
            Z
        `;

        // Draw tapered pointer fill (same as bubble background)
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', pointerPath)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', 'none')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', pointerPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Draw pointer border (only the two outer edges, not the base)
        const pointerBorderPath = `
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY - pointerBaseWidth / 2}
            M ${tipX} ${tipY}
            L ${bubbleX} ${bubbleCenterY + pointerBaseWidth / 2}
        `;
        this.group.append('path')
            .attr('class', 'shape-border')
            .attr('d', pointerBorderPath)
            .attr('fill', 'none')
            .attr('stroke', this.style.borderColor)
            .attr('stroke-width', 1)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Create bubble rectangle with rounded corners
        this.group.append('rect')
            .attr('class', 'shape-fill')
            .attr('x', bubbleX)
            .attr('y', bubbleY)
            .attr('width', bubbleWidth)
            .attr('height', bubbleHeight)
            .attr('rx', cornerRadius)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', this.style.borderColor)
            .attr('stroke-width', 1)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', bubbleX)
            .attr('y', bubbleY)
            .attr('width', bubbleWidth)
            .attr('height', bubbleHeight)
            .attr('rx', cornerRadius)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Text (left-aligned with padding)
        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', bubbleX + padding)
            .attr('y', bubbleCenterY + bbox.height / 4)
            .attr('text-anchor', 'start')
            .attr('fill', this.style.textColor)
            .attr('font-size', `${this.style.fontSize}px`)
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .text(this.text);

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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = textElement.node().getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
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
                    width: rect.width,
                    height: rect.height,
                    padding: '0px',
                    fontSize: `${self.style.fontSize || 14}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight || 'normal',
                    color: self.style.textColor,
                    textAlign: 'left',
                    hideTargets: [textElement.node()],
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        textElement.node().addEventListener('mousedown', handleMouseDown, true);
        textElement.node().addEventListener('click', handleInlineEdit, true);
        textElement.node().addEventListener('dblclick', handleOpenSettings, true);

        // Resize handles
        const handleRadius = 4;
        const handleStrokeWidth = 2;

        // Handle for anchor point (point 0)
        const handle0 = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', tipX)
            .attr('cy', tipY)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 0);

        // Handle for bubble position (point 1)
        const handle1 = this.group.append('circle')
            .attr('class', 'resize-handle')
            .attr('cx', bubbleCenterX)
            .attr('cy', bubbleCenterY)
            .attr('r', handleRadius)
            .attr('fill', 'transparent')
            .attr('stroke', '#2962FF')
            .attr('stroke-width', handleStrokeWidth)
            .style('cursor', 'move')
            .style('pointer-events', 'all')
            .style('opacity', this.selected ? 1 : 0)
            .attr('data-point-index', 1);

        // Hover effects for handles
        [handle0, handle1].forEach(handle => {
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
        });

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new CalloutTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Comment Tool - Speech bubble with curved tail
// ============================================================================
class CommentTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('comment', points, style);
        this.requiredPoints = 1;
        this.text = text || 'text';
        this.style.backgroundColor = style.backgroundColor || '#2962FF';
        this.style.borderColor = style.borderColor || 'transparent';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontWeight = style.fontWeight || 'normal';
        this.style.fontStyle = style.fontStyle || 'normal';
        this.style.textAlign = style.textAlign || 'center';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing comment')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const centerX = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const centerY = scales.yScale(p.y);

        const padding = 12;
        const minWidth = 50;
        const minHeight = 30;
        const r = 16; // Larger radius for more rounded corners
        
        const tempText = container.append('text')
            .attr('font-size', `${this.style.fontSize}px`)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .text(this.text);
        const bbox = tempText.node().getBBox();
        tempText.remove();

        const w = Math.max(bbox.width + padding * 2, minWidth);
        const h = Math.max(bbox.height + padding * 2, minHeight);

        // Center the bubble on the point
        const bubbleX = centerX - w / 2;
        const bubbleY = centerY - h / 2;

        // Rounded rectangle with sharp bottom-left corner
        const bubblePath = `
            M ${bubbleX + r} ${bubbleY}
            L ${bubbleX + w - r} ${bubbleY}
            Q ${bubbleX + w} ${bubbleY} ${bubbleX + w} ${bubbleY + r}
            L ${bubbleX + w} ${bubbleY + h - r}
            Q ${bubbleX + w} ${bubbleY + h} ${bubbleX + w - r} ${bubbleY + h}
            L ${bubbleX + r} ${bubbleY + h}
            L ${bubbleX} ${bubbleY + h}
            L ${bubbleX} ${bubbleY + r}
            Q ${bubbleX} ${bubbleY} ${bubbleX + r} ${bubbleY}
            Z
        `;

        const hasBorder = this.style.borderColor && this.style.borderColor !== 'transparent' && this.style.borderColor !== 'none';
        this.group.append('path')
            .attr('class', 'shape-fill')
            .attr('d', bubblePath)
            .attr('fill', this.style.backgroundColor)
            .attr('stroke', hasBorder ? this.style.borderColor : 'none')
            .attr('stroke-width', hasBorder ? 1 : 0)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', bubblePath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Calculate text position based on alignment
        let textX = bubbleX + w / 2;
        let textAnchor = 'middle';
        
        if (this.style.textAlign === 'left') {
            textX = bubbleX + padding;
            textAnchor = 'start';
        } else if (this.style.textAlign === 'right') {
            textX = bubbleX + w - padding;
            textAnchor = 'end';
        }

        const textElement = this.group.append('text')
            .attr('class', 'inline-editable-text')
            .attr('x', textX)
            .attr('y', bubbleY + h / 2 + bbox.height / 4)
            .attr('text-anchor', textAnchor)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${this.style.fontSize}px`)
            .attr('font-weight', this.style.fontWeight || 'normal')
            .attr('font-style', this.style.fontStyle || 'normal')
            .style('pointer-events', 'all')
            .style('cursor', 'move')
            .text(this.text);

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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const rect = textElement.node().getBoundingClientRect();
            const editX = rect.left + window.scrollX;
            const editY = rect.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                editX,
                editY,
                self.text || '',
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
                    width: rect.width,
                    height: rect.height,
                    padding: '0px',
                    fontSize: `${self.style.fontSize || 14}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight || 'normal',
                    color: self.style.textColor,
                    textAlign: self.style.textAlign || 'center',
                    hideTargets: [textElement.node()],
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

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        textElement.node().addEventListener('mousedown', handleMouseDown, true);
        textElement.node().addEventListener('click', handleInlineEdit, true);
        textElement.node().addEventListener('dblclick', handleOpenSettings, true);

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new CommentTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Price Label Tool - EXACT duplicate of Price Note but 1 point instead of 2
// ============================================================================
class PriceLabelTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-label', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 12;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(0.5, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(8, this.style.fontSize * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing price-label')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0]; // Start point (where line starts)
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);
        // For single point, use same position for both x2/y2
        const x2 = x1;
        const y2 = y1;

        // Format price from START point (p1) - the point we drag from
        const formatPrice = (price) => {
            if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(5);
        };

        const priceText = formatPrice(p1.y);
        const padding = 8;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .text(priceText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 60, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding;

        // Position box centered below/at the end point
        const boxX = x2 - boxWidth / 2;
        const boxY = y2 + 5;

        // Background rectangle for price
        this.group.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.fill)
            .attr('rx', 4)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', 4)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Price text
        this.group.append('text')
            .attr('x', x2)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        // Small dot at start point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', this.style.stroke)
            .style('pointer-events', 'none');

        // Create handles at both endpoints
        this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceLabelTool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
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
// Price Label 2 Tool - Callout-style price label with anchor point
// ============================================================================
class PriceLabel2Tool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('price-label-2', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.stroke = style.stroke || '#2962ff';
        this.style.strokeWidth = style.strokeWidth || 1;
        this.style.fill = style.fill || '#2962ff';
        this.style.textColor = style.textColor || '#FFFFFF';
        this.style.fontSize = style.fontSize || 14;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.fontWeight = style.fontWeight || 'bold';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledFontSize = Math.max(10, this.style.fontSize * scaleFactor);

        this.group = container.append('g')
            .attr('class', 'drawing price-label-2')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);

        // Format price
        const formatPrice = (price) => {
            if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(5);
        };

        const priceText = formatPrice(p1.y);
        const padding = 12;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .text(priceText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 80, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding * 1.2;
        const cornerRadius = 8;
        
        // Position box above and to the right of the anchor point
        const anchorOffsetX = -15;
        const anchorOffsetY = -10;
        const boxX = x1 + anchorOffsetX;
        const boxY = y1 + anchorOffsetY - boxHeight;

        // Create callout path with anchor point at bottom left
        const anchorSize = 6;
        const calloutPath = `
            M ${boxX + cornerRadius} ${boxY}
            L ${boxX + boxWidth - cornerRadius} ${boxY}
            Q ${boxX + boxWidth} ${boxY} ${boxX + boxWidth} ${boxY + cornerRadius}
            L ${boxX + boxWidth} ${boxY + boxHeight - cornerRadius}
            Q ${boxX + boxWidth} ${boxY + boxHeight} ${boxX + boxWidth - cornerRadius} ${boxY + boxHeight}
            L ${boxX + anchorSize + 10} ${boxY + boxHeight}
            L ${x1} ${y1}
            L ${boxX + anchorSize} ${boxY + boxHeight}
            L ${boxX + cornerRadius} ${boxY + boxHeight}
            Q ${boxX} ${boxY + boxHeight} ${boxX} ${boxY + boxHeight - cornerRadius}
            L ${boxX} ${boxY + cornerRadius}
            Q ${boxX} ${boxY} ${boxX + cornerRadius} ${boxY}
            Z
        `;

        // Background callout shape
        this.group.append('path')
            .attr('d', calloutPath)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', this.style.strokeWidth)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', calloutPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Price text
        this.group.append('text')
            .attr('x', boxX + boxWidth / 2)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('font-weight', this.style.fontWeight)
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(priceText);

        // Small anchor circle at the point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', 1.5)
            .style('pointer-events', 'none');

        // Create handles
        this.createHandles(this.group, scales);

        return this.group;
    }

    setText(newText) { 
        this.text = newText; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new PriceLabel2Tool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
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
// Signpost 2 Tool - Vertical line with text label below
// ============================================================================
class Signpost2Tool extends BaseDrawing {
    constructor(points = [], style = {}, text = 'add text') {
        super('signpost-2', points, style);
        this.requiredPoints = 1;
        this.text = text || 'add text';
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || '#2e3238';
        this.style.textColor = style.textColor || '#d1d4dc';
        this.style.fontSize = style.fontSize || 13;
        this.style.fontFamily = style.fontFamily || 'Roboto, sans-serif';
        this.style.lineLength = style.lineLength || 100;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        // Get zoom scale factor
        const scaleFactor = this.getZoomScaleFactor(scales);
        const scaledStrokeWidth = Math.max(1, this.style.strokeWidth * scaleFactor);
        const scaledFontSize = Math.max(10, this.style.fontSize * scaleFactor);
        const scaledLineLength = this.style.lineLength * scaleFactor;

        this.group = container.append('g')
            .attr('class', 'drawing signpost-2')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p1 = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p1.x) : scales.xScale(p1.x);
        const y1 = scales.yScale(p1.y);

        // Vertical line from point going down
        const lineEndY = y1 + scaledLineLength;
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none');

        this.group.append('line')
            .attr('class', 'shape-border-hit')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(12, scaledStrokeWidth * 4))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        const displayText = this.text || 'add text';
        const padding = 10;

        // Measure text
        const tempText = container.append('text')
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .text(displayText);
        let textBbox;
        try {
            textBbox = tempText.node().getBBox();
        } catch(e) {
            textBbox = { width: 40, height: scaledFontSize * 1.2 };
        }
        tempText.remove();

        const boxWidth = textBbox.width + padding * 2;
        const boxHeight = textBbox.height + padding;
        const cornerRadius = 6;
        
        // Position box below the line end, centered
        const boxX = x1 - boxWidth / 2;
        const boxY = lineEndY + 5;

        // Background rectangle for text
        const textBox = this.group.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', 1)
            .attr('rx', cornerRadius)
            .attr('class', 'shape-fill')
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('rect')
            .attr('class', 'shape-border-hit')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .attr('rx', cornerRadius)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Text
        const textElement = this.group.append('text')
            .attr('x', x1)
            .attr('y', boxY + boxHeight / 2 + scaledFontSize / 3)
            .attr('fill', this.style.textColor)
            .attr('font-size', `${scaledFontSize}px`)
            .attr('font-family', this.style.fontFamily)
            .attr('text-anchor', 'middle')
            .style('pointer-events', 'none')
            .text(displayText);

        // Single click to edit text, double click to open settings
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

        const startInlineEdit = () => {
            const manager = self.chart && self.chart.drawingManager;
            const editor = manager && manager.textEditor;
            if (!editor || typeof editor.show !== 'function') return;

            const bbox = textBox.node().getBoundingClientRect();
            const x = bbox.left + window.scrollX;
            const y = bbox.top + window.scrollY;

            if (typeof manager.selectDrawing === 'function' && !self.locked) {
                manager.selectDrawing(self);
            }

            editor.show(
                x,
                y,
                self.text || 'add text',
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
                    width: bbox.width,
                    height: bbox.height,
                    padding: '0px',
                    fontSize: `${self.style.fontSize || 12}px`,
                    fontFamily: self.style.fontFamily,
                    fontWeight: self.style.fontWeight || 'normal',
                    color: self.style.textColor,
                    textAlign: 'center',
                    hideTargets: [textBox.node()],
                    hideSelector: `.drawing[data-id="${self.id}"] text`
                }
            );
        };

        const handleInlineEdit = (event) => {
            event.stopPropagation();
            event.preventDefault();

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                startInlineEdit();
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

        // Use native listeners so D3 manager handlers don't override these
        textBox.node().addEventListener('mousedown', handleMouseDown, true);
        textBox.node().addEventListener('click', handleInlineEdit, true);
        textBox.node().addEventListener('dblclick', handleOpenSettings, true);

        // Small circle at the anchor point
        this.group.append('circle')
            .attr('cx', x1)
            .attr('cy', y1)
            .attr('r', 4 * scaleFactor)
            .attr('fill', this.style.stroke)
            .style('pointer-events', 'none');

        // Create handles
        this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit')
            .style('cursor', 'move');

        return this.group;
    }

    setText(newText) { 
        this.text = newText || 'add text'; 
        this.meta.updatedAt = Date.now();
    }
    
    toJSON() { 
        return { ...super.toJSON(), text: this.text }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new Signpost2Tool(data.points, data.style, data.text);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        tool.baseScale = data.baseScale || null;
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
// Signpost Tool - Location marker
// ============================================================================
class SignpostTool extends BaseDrawing {
    constructor(points = [], style = {}, text = '') {
        super('signpost', points, style);
        this.requiredPoints = 1;
        this.text = text;
        this.style.color = style.color || '#787b86';
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing signpost')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y = scales.yScale(p.y);

        // Signpost pin shape (like Google Maps marker)
        this.group.append('path')
            .attr('d', `M${x} ${y} 
                       C${x-12} ${y-20} ${x-12} ${y-35} ${x} ${y-45}
                       C${x+12} ${y-35} ${x+12} ${y-20} ${x} ${y}`)
            .attr('fill', this.style.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', `M${x} ${y} 
                       C${x-12} ${y-20} ${x-12} ${y-35} ${x} ${y-45}
                       C${x+12} ${y-35} ${x+12} ${y-20} ${x} ${y}`)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 16)
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Inner circle
        this.group.append('circle')
            .attr('cx', x).attr('cy', y - 32)
            .attr('r', 6)
            .attr('fill', '#fff');

        // Create handle
        this.createHandles(this.group, scales);
        this.group.selectAll('.resize-handle, .resize-handle-hit')
            .style('cursor', 'move');

        return this.group;
    }

    setText(newText) { this.text = newText; }
    toJSON() { return { ...super.toJSON(), text: this.text }; }
    static fromJSON(data, chart) {
        const tool = new SignpostTool(data.points, data.style, data.text);
        tool.id = data.id; tool.visible = data.visible; tool.meta = data.meta; tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Flag Mark Tool - Flag on pole
// ============================================================================
class FlagMarkTool extends BaseDrawing {
    constructor(points = [], style = {}) {
        super('flag-mark', points, style);
        this.requiredPoints = 1;
        this.style.stroke = style.stroke || '#787b86';
        this.style.strokeWidth = style.strokeWidth || 2;
        this.style.fill = style.fill || '#787b86';
        this.style.lineLength = style.lineLength || 40;
        this.style.flagWidth = style.flagWidth || 16;
        this.style.flagHeight = style.flagHeight || 12;
    }

    render(container, scales) {
        if (this.group) this.group.remove();
        if (this.points.length < 1) return;

        this.group = container.append('g')
            .attr('class', 'drawing flag-mark')
            .attr('data-id', this.id)
            .style('opacity', this.visible ? (this.style.opacity || 1) : 0);

        const p = this.points[0];
        const x1 = scales.chart?.dataIndexToPixel ? scales.chart.dataIndexToPixel(p.x) : scales.xScale(p.x);
        const y1 = scales.yScale(p.y);

        // Get zoom scale factor
        const scaleFactor = scales.chart?.getZoomScaleFactor ? scales.chart.getZoomScaleFactor() : 1;
        const scaledStrokeWidth = (this.style.strokeWidth || 2) * scaleFactor;
        const lineLength = (this.style.lineLength || 100) * scaleFactor;
        const flagWidth = (this.style.flagWidth || 40) * scaleFactor;
        const flagHeight = (this.style.flagHeight || 30) * scaleFactor;

        // Vertical line (pole) extending upward
        const lineEndY = y1 - lineLength;
        this.group.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x1)
            .attr('y2', lineEndY)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none');

        // Flag shape with notch on the right side
        // Starting from top of pole, going right, then notch, then back to pole
        const flagTop = lineEndY;
        const flagBottom = lineEndY + flagHeight;
        const flagRight = x1 + flagWidth;
        const notchDepth = flagWidth * 0.25; // 25% notch depth
        const notchY = flagTop + flagHeight / 2; // Middle of flag

        const flagPath = `
            M ${x1} ${flagTop}
            L ${flagRight} ${flagTop}
            L ${flagRight - notchDepth} ${notchY}
            L ${flagRight} ${flagBottom}
            L ${x1} ${flagBottom}
            Z
        `;

        this.group.append('path')
            .attr('d', flagPath)
            .attr('fill', this.style.fill)
            .attr('stroke', this.style.stroke)
            .attr('stroke-width', scaledStrokeWidth * 0.5)
            .style('pointer-events', 'none')
            .style('cursor', 'default');

        this.group.append('path')
            .attr('class', 'shape-border-hit')
            .attr('d', flagPath)
            .attr('fill', 'none')
            .attr('stroke', 'transparent')
            .attr('stroke-width', Math.max(12, scaledStrokeWidth * 4))
            .style('pointer-events', 'stroke')
            .style('cursor', 'move');

        // Create handles
        this.createHandles(this.group, scales);

        return this.group;
    }

    toJSON() { 
        return { ...super.toJSON() }; 
    }
    
    static fromJSON(data, chart) {
        const tool = new FlagMarkTool(data.points, data.style);
        tool.id = data.id; 
        tool.visible = data.visible; 
        tool.meta = data.meta; 
        tool.chart = chart;
        return tool;
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TextTool,
        NoteBoxTool,
        AnchoredTextTool,
        NoteTool,
        PriceNoteTool,
        PinTool,
        TableTool,
        CalloutTool,
        CommentTool,
        PriceLabelTool,
        PriceLabel2Tool,
        Signpost2Tool,
        SignpostTool,
        FlagMarkTool
    };
}
