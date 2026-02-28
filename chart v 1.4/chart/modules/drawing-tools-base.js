/**
 * Drawing Tools Base Module
 * Core infrastructure for D3.js drawing tools system
 * Provides base classes, utilities, and common functionality
 */

// ============================================================================
// UUID Generator
// ============================================================================
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// Base Drawing Class
// ============================================================================
class BaseDrawing {
    constructor(type, points = [], style = {}) {
        this.id = generateUUID();
        this.type = type;
        this.points = points; // Array of {x, y} coordinates (x = index, y = price)
        this.style = {
            stroke: style.stroke || '#787b86',  // TradingView blue - visible on light & dark
            strokeWidth: style.strokeWidth || 2,
            fill: style.fill || 'none',
            opacity: style.opacity || 1,
            dashArray: style.dashArray || 'none',
            ...style
        };
        this.selected = false;
        this.visible = true;
        this.text = typeof style.text === 'string' ? style.text : '';
        this.meta = {
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.handles = [];
        this.group = null; // SVG group element
        
        // Multi-timeframe support
        this.coordinateSystem = 'timestamp'; // 'timestamp' or 'index' (legacy)
        this.chart = null; // Reference to chart instance (set by manager)
        this.timestampPoints = null; // Store original timestamps permanently (once set, never recalculate)
        
        // Zoom scaling support
        this.baseScale = null; // Store initial scale for zoom-based scaling
    }
    
    /**
     * Calculate zoom scale factor for consistent visual scaling
     * @param {Object} scales - {xScale, yScale} D3 scales
     * @returns {number} Scale factor (1.0 = original scale)
     */
    getZoomScaleFactor(scales) {
        return 1;
    }

    /**
     * Render the drawing to SVG
     * @param {d3.Selection} container - D3 selection of the drawings container
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    render(container, scales) {
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Update drawing position/size based on new points
     * @param {Array} points - New points array
     */
    update(points) {
        this.points = points;
        this.meta.updatedAt = Date.now();
        // Recalculate timestamps from new indices
        this.recalculateTimestamps();
    }
    
    /**
     * Recalculate timestamps from current indices
     * Called after moving or resizing a drawing
     * Supports extrapolation for areas without data (replay mode)
     */
    recalculateTimestamps() {
        if (this.chart && this.chart.data && this.chart.data.length > 0) {
            const timeframe = this.chart.currentTimeframe || null;
            this.timestampPoints = this.points.map(p => {
                // Use CoordinateUtils for extrapolation support with correct timeframe
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
        }
    }

    /**
     * Update optional text label if supported by the drawing
     * @param {string} text
     */
    setText(text) {
        this.text = typeof text === 'string' ? text : '';
        this.meta.updatedAt = Date.now();
    }

    /**
     * Create resize handles for the drawing
     * @param {d3.Selection} group - The drawing's SVG group
     * @param {Object} scales - {xScale, yScale} D3 scales
     */
    createHandles(group, scales) {
        this.handles = []; // Reset handles array
        const handleRadius = 3;  // Visual handle size
        const hitRadius = 12;    // Larger hit area for easier clicking
        const handleFill = 'transparent';  // No background
        const handleStroke = '#2962FF';  // Blue stroke
        const handleStrokeWidth = 2;  // Thinner border
        
        // Remove existing handles and handle groups
        group.selectAll('.resize-handle').remove();
        group.selectAll('.resize-handle-group').remove();
        group.selectAll('.resize-handle-hit').remove();
        
        // Use virtualPoints if available, otherwise use points
        const pointsToRender = this.virtualPoints || this.points;
        pointsToRender.forEach((point, index) => {
            // Convert data index to screen position
            const cx = scales.chart && scales.chart.dataIndexToPixel ? 
                scales.chart.dataIndexToPixel(point.x) : scales.xScale(point.x);
            const cy = scales.yScale(point.y);
            
            // Create handle group
            const handleGroup = group.append('g')
                .attr('class', 'resize-handle-group')
                .attr('data-point-index', index);
            
            // Invisible larger hit area for easier clicking
            handleGroup.append('circle')
                .attr('class', 'resize-handle-hit')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', hitRadius)
                .attr('fill', 'transparent')
                .attr('stroke', 'none')
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .attr('data-point-index', index);
            
            // Visual handle circle (blue outline, no fill)
            const handle = handleGroup.append('circle')
                .attr('class', 'resize-handle')
                .attr('cx', cx)
                .attr('cy', cy)
                .attr('r', handleRadius)
                .attr('fill', handleFill)
                .attr('stroke', handleStroke)
                .attr('stroke-width', handleStrokeWidth)
                .style('cursor', 'nwse-resize')
                .style('pointer-events', this.selected ? 'all' : 'none')
                .style('opacity', this.selected ? 1 : 0)
                .attr('data-point-index', index);
            
            // Add hover effect
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
     * Optional hook for point-handle drags. Return true if handled.
     * @param {number} index
     * @param {{x:number, y:number}} point
     * @returns {boolean}
     */
    onPointHandleDrag(index, context = {}) {
        return false;
    }

    /**
     * Optional hook invoked when a custom handle drag starts.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    beginHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Handle drag for resize handles - updates the point at the given index.
     * This is the default implementation that works for simple point-based tools.
     * @param {string|number} handleRole - Role name or point index
     * @param {Object} context - Contains dataPoint, pointIndex, scales
     * @returns {boolean} - true if drawing was updated
     */
    handleCustomHandleDrag(handleRole, context = {}) {
        const { dataPoint, pointIndex } = context;
        
        // Get the point index - either from context or parse from handleRole
        let index = pointIndex;
        if (index === undefined || index === null) {
            index = typeof handleRole === 'number' ? handleRole : parseInt(handleRole);
        }
        
        // Validate
        if (!dataPoint || isNaN(index) || index < 0 || index >= this.points.length) {
            return false;
        }
        
        // Update the point
        this.points[index] = { x: dataPoint.x, y: dataPoint.y };
        this.meta.updatedAt = Date.now();
        return true;
    }

    /**
     * Optional hook invoked when a custom handle drag ends.
     * @param {string|null} handleRole
     * @param {Object} context
     */
    endHandleDrag(handleRole, context = {}) {
        // No-op by default
    }

    /**
     * Show selection state
     */
    select() {
        this.selected = true;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 1);
            this.group.selectAll('.resize-handle').style('pointer-events', 'all');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'all');
            this.group.selectAll('.resize-handle-glow-outer').style('opacity', 0.15);
            this.group.selectAll('.resize-handle-glow').style('opacity', 0.3);
            this.group.selectAll('.resize-handle-shadow').style('opacity', 0.3);
            this.group.selectAll('.custom-handle').style('opacity', 1);
            this.group.selectAll('.custom-handle').style('pointer-events', 'all');
            this.group.raise(); // Bring to front
        }
        // Show axis highlights for selected drawing
        this.showAxisHighlights();
    }

    /**
     * Hide selection state
     */
    deselect() {
        this.selected = false;
        if (this.group) {
            this.group.selectAll('.resize-handle').style('opacity', 0);
            this.group.selectAll('.resize-handle').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-hit').style('pointer-events', 'none');
            this.group.selectAll('.resize-handle-glow').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('opacity', 0);
            this.group.selectAll('.custom-handle').style('pointer-events', 'none');
        }
        // Refresh axis highlights (keep labels visible after deselect)
        this.showAxisHighlights();
    }
    
    /**
     * Show highlighted labels on price and time axes for drawing points
     * TradingView style: cyan background for time, colored backgrounds for prices
     */
    showAxisHighlights() {
        if (!this.chart || !this.points || this.points.length === 0) return;
        
        // Remove any existing highlights first
        this.hideAxisHighlights();
        
        const svg = this.chart.svg;
        if (!svg) return;
        
        const yScale = this.chart.scales?.yScale;
        const xScale = this.chart.scales?.xScale;
        if (!yScale || !xScale) return;
        
        const margin = this.chart.margin || { t: 5, r: 60, b: 30, l: 0 };
        const chartWidth = this.chart.w || this.chart.canvas?.width || 800;
        const chartHeight = this.chart.h || this.chart.canvas?.height || 600;
        
        // Create highlight group for SVG labels only (zones are drawn on canvas)
        this.axisHighlightGroup = svg.append('g')
            .attr('class', 'axis-highlight-group');
        
        // Use the shape's color for time highlights (like TradingView)
        const timeHighlightColor = this.style?.color || this.style?.lineColor || this.style?.stroke || '#2962ff';
        
        // Helper function to determine if color is light (needs dark text)
        const isLightColor = (color) => {
            if (!color) return false;
            let r, g, b;
            if (color.startsWith('#')) {
                const hex = color.replace('#', '');
                if (hex.length === 3) {
                    r = parseInt(hex[0] + hex[0], 16);
                    g = parseInt(hex[1] + hex[1], 16);
                    b = parseInt(hex[2] + hex[2], 16);
                } else {
                    r = parseInt(hex.substr(0, 2), 16);
                    g = parseInt(hex.substr(2, 2), 16);
                    b = parseInt(hex.substr(4, 2), 16);
                }
            } else if (color.startsWith('rgb')) {
                const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
                if (match) {
                    r = parseInt(match[1]);
                    g = parseInt(match[2]);
                    b = parseInt(match[3]);
                }
            } else {
                return false;
            }
            // Calculate luminance (perceived brightness)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance > 0.6; // Light colors have luminance > 0.6
        };
        
        // Determine text color based on background brightness
        const textColor = isLightColor(timeHighlightColor) ? '#131722' : '#ffffff';
        
        // Get unique X positions for time highlights (avoid duplicates)
        const timePositions = new Set();
        
        // Prepare canvas-based zone highlights (drawn behind labels)
        const canvasZones = [];
        
        // Calculate price axis zone (Y-axis)
        if (this.points.length >= 2) {
            const prices = this.points.map(p => p.y);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const minY = yScale(maxPrice); // Note: Y is inverted
            const maxY = yScale(minPrice);
            const zoneHeight = maxY - minY;
            
            if (zoneHeight > 0) {
                canvasZones.push({
                    type: 'price',
                    y: minY,
                    height: zoneHeight,
                    selected: !!this.selected
                });
            }
        }
        
        // Calculate time axis zone (X-axis)
        // For position tools, use meta.zoneWidth since all points are on same candle
        let timeZoneStartX = null;
        let timeZoneWidth = 0;
        
        if ((this.type === 'long-position' || this.type === 'short-position') && this.meta?.zoneWidth) {
            // Position tools: use the stored zone width
            const entryIndex = this.points[0]?.x;
            if (entryIndex !== undefined) {
                timeZoneStartX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(entryIndex) : xScale(entryIndex);
                timeZoneWidth = this.meta.zoneWidth;
            }
        } else if (this.points.length >= 2) {
            // Other tools: calculate from point positions
            const indices = this.points.map(p => p.x);
            const minIndex = Math.min(...indices);
            const maxIndex = Math.max(...indices);
            const minX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(minIndex) : xScale(minIndex);
            const maxX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(maxIndex) : xScale(maxIndex);
            timeZoneStartX = minX;
            timeZoneWidth = maxX - minX;
        }
        
        if (this.style.showTimeLabel !== false && timeZoneWidth > 0 && timeZoneStartX !== null) {
            canvasZones.push({
                type: 'time',
                x: timeZoneStartX,
                width: timeZoneWidth,
                selected: !!this.selected
            });
            
            // Add start and end time labels for ALL tools with time zones
            const boxWidth = 100;
            const boxHeight = 20;
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Get start index - for position tools use entry point, for others use min X
            let startIndex;
            if ((this.type === 'long-position' || this.type === 'short-position')) {
                startIndex = this.points[0]?.x;
            } else {
                const indices = this.points.map(p => p.x);
                startIndex = Math.min(...indices);
            }
            
            // START time label (left edge)
            if (startIndex !== undefined) {
                const roundedStartIndex = Math.round(startIndex);
                let startTime = null;
                const dataLength = this.chart.data?.length || 0;
                
                if (roundedStartIndex >= 0 && roundedStartIndex < dataLength) {
                    const startCandle = this.chart.data?.[roundedStartIndex];
                    if (startCandle && startCandle.t) {
                        startTime = startCandle.t;
                    }
                } else if (roundedStartIndex < 0 && dataLength >= 2) {
                    // Start is before data - extrapolate backwards
                    const firstCandle = this.chart.data[0];
                    const secondCandle = this.chart.data[1];
                    if (firstCandle?.t && secondCandle?.t) {
                        const candleInterval = secondCandle.t - firstCandle.t;
                        startTime = firstCandle.t + (candleInterval * roundedStartIndex);
                    }
                } else if (roundedStartIndex >= dataLength && dataLength >= 2) {
                    // Start is beyond data - extrapolate forward
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedStartIndex - (dataLength - 1);
                        startTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (startTime) {
                    const date = new Date(startTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-start')
                        .attr('x', timeZoneStartX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-start-text')
                        .attr('x', timeZoneStartX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
            
            // END time label (right edge)
            const endX = timeZoneStartX + timeZoneWidth;
            const endIndex = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(endX) : null;
            if (endIndex !== null && endIndex >= 0) {
                let endTime = null;
                const dataLength = this.chart.data?.length || 0;
                const roundedEndIndex = Math.round(endIndex);
                
                if (roundedEndIndex < dataLength) {
                    // End is within candle data
                    const endCandle = this.chart.data?.[roundedEndIndex];
                    if (endCandle && endCandle.t) {
                        endTime = endCandle.t;
                    }
                } else if (dataLength >= 2) {
                    // End is beyond candle data - extrapolate time
                    const lastCandle = this.chart.data[dataLength - 1];
                    const prevCandle = this.chart.data[dataLength - 2];
                    if (lastCandle?.t && prevCandle?.t) {
                        const candleInterval = lastCandle.t - prevCandle.t;
                        const candlesBeyond = roundedEndIndex - (dataLength - 1);
                        endTime = lastCandle.t + (candleInterval * candlesBeyond);
                    }
                }
                
                if (endTime) {
                    const date = new Date(endTime);
                    const day = date.getDate().toString().padStart(2, '0');
                    const month = months[date.getMonth()];
                    const year = date.getFullYear().toString().slice(-2);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const mins = date.getMinutes().toString().padStart(2, '0');
                    const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                    
                    this.axisHighlightGroup.append('rect')
                        .attr('class', 'axis-highlight-time-end')
                        .attr('x', endX - boxWidth / 2)
                        .attr('y', chartHeight - margin.b + 4)
                        .attr('width', boxWidth)
                        .attr('height', boxHeight)
                        .attr('fill', timeHighlightColor)
                        .attr('rx', 3);
                    
                    this.axisHighlightGroup.append('text')
                        .attr('class', 'axis-highlight-time-end-text')
                        .attr('x', endX)
                        .attr('y', chartHeight - margin.b + 17)
                        .attr('fill', textColor)
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .attr('text-anchor', 'middle')
                        .text(timeText);
                }
            }
        }
        
        // For brush/highlighter, only show high and low price labels
        const isBrushType = this.type === 'brush' || this.type === 'highlighter';
        let pointsToLabel = this.points;
        
        if (isBrushType && this.points.length > 2) {
            // Find highest and lowest points
            let highPoint = this.points[0];
            let lowPoint = this.points[0];
            this.points.forEach(p => {
                if (p.y > highPoint.y) highPoint = p;
                if (p.y < lowPoint.y) lowPoint = p;
            });
            pointsToLabel = [highPoint, lowPoint];
        }
        
        // Process each point
        pointsToLabel.forEach((point, idx) => {
            const price = point.y;
            const index = point.x;
            
            // Determine color based on point type for position tools
            let priceColor = this.style?.color || this.style?.stroke || '#2962ff';
            if (this.type === 'long-position' || this.type === 'short-position') {
                if (idx === 0) priceColor = '#2196f3'; // Entry - blue
                else if (idx === 1) priceColor = '#f44336'; // Stop - red
                else if (idx === 2) priceColor = '#4caf50'; // Target - green
            }
            
            // Price highlight on Y-axis (right side)
            const yPos = yScale(price);
            if (this.style.showPriceLabel !== false && yPos >= margin.t && yPos <= chartHeight - margin.b) {
                const priceText = price.toFixed(this.chart.priceDecimals || 5);
                const boxWidth = 58;
                const boxHeight = 20;
                
                // Background box with slight transparency
                this.axisHighlightGroup.append('rect')
                    .attr('class', 'axis-highlight-price')
                    .attr('x', chartWidth - margin.r + 2)
                    .attr('y', yPos - boxHeight / 2)
                    .attr('width', boxWidth)
                    .attr('height', boxHeight)
                    .attr('fill', priceColor)
                    .attr('rx', 3);
                
                // Price text - determine text color based on price background
                const priceTextColor = isLightColor(priceColor) ? '#131722' : '#ffffff';
                this.axisHighlightGroup.append('text')
                    .attr('class', 'axis-highlight-price-text')
                    .attr('x', chartWidth - margin.r + 2 + boxWidth / 2)
                    .attr('y', yPos + 5)
                    .attr('fill', priceTextColor)
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .attr('text-anchor', 'middle')
                    .text(priceText);
            }
            
            // Time highlight on X-axis (bottom) - only add if not already added for this x position
            const roundedIndex = Math.round(index);
            if (this.style.showTimeLabel !== false && !timePositions.has(roundedIndex)) {
                timePositions.add(roundedIndex);
                
                // Use dataIndexToPixel if available, otherwise use xScale
                const xPos = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(index) : xScale(index);
                if (xPos >= margin.l && xPos <= chartWidth - margin.r) {
                    // Get time from candle data, extrapolating if index is out of range
                    const dataLength = this.chart.data?.length || 0;
                    let candleTime = null;
                    const candle = this.chart.data?.[roundedIndex];
                    if (candle && candle.t) {
                        candleTime = candle.t;
                    } else if (dataLength >= 2) {
                        const firstCandle = this.chart.data[0];
                        const lastCandle = this.chart.data[dataLength - 1];
                        const prevCandle = this.chart.data[dataLength - 2];
                        const candleInterval = lastCandle.t - prevCandle.t;
                        if (roundedIndex < 0 && firstCandle?.t) {
                            candleTime = firstCandle.t + (candleInterval * roundedIndex);
                        } else if (roundedIndex >= dataLength && lastCandle?.t) {
                            candleTime = lastCandle.t + (candleInterval * (roundedIndex - (dataLength - 1)));
                        }
                    }
                    if (candleTime !== null) {
                        const date = new Date(candleTime);
                        const day = date.getDate().toString().padStart(2, '0');
                        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = months[date.getMonth()];
                        const year = date.getFullYear().toString().slice(-2);
                        const hours = date.getHours().toString().padStart(2, '0');
                        const mins = date.getMinutes().toString().padStart(2, '0');
                        const timeText = `${day} ${month} '${year} ${hours}:${mins}`;
                        
                        const boxWidth = 100;
                        const boxHeight = 20;
                        
                        // Background box
                        this.axisHighlightGroup.append('rect')
                            .attr('class', 'axis-highlight-time')
                            .attr('x', xPos - boxWidth / 2)
                            .attr('y', chartHeight - margin.b + 4)
                            .attr('width', boxWidth)
                            .attr('height', boxHeight)
                            .attr('fill', timeHighlightColor)
                            .attr('rx', 3);
                        
                        // Time text
                        this.axisHighlightGroup.append('text')
                            .attr('class', 'axis-highlight-time-text')
                            .attr('x', xPos)
                            .attr('y', chartHeight - margin.b + 17)
                            .attr('fill', textColor)
                            .attr('font-size', '11px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle')
                            .text(timeText);
                    }
                }
            }
        });
        
        // Set canvas-based zones (drawn behind labels in drawAxes)
        if (this.chart.setAxisHighlightZones && canvasZones.length > 0) {
            this.chart.setAxisHighlightZones(canvasZones);
            // Trigger re-render to show the zones
            if (this.chart.scheduleRender) {
                this.chart.scheduleRender();
            }
        }
    }
    
    /**
     * Hide axis highlight labels
     */
    hideAxisHighlights() {
        if (this.axisHighlightGroup) {
            this.axisHighlightGroup.remove();
            this.axisHighlightGroup = null;
        }
        // Also remove any orphaned highlights - be thorough
        if (this.chart?.svg) {
            this.chart.svg.selectAll('.axis-highlight-group').remove();
            this.chart.svg.selectAll('.axis-highlight-price').remove();
            this.chart.svg.selectAll('.axis-highlight-price-text').remove();
            this.chart.svg.selectAll('.axis-highlight-time').remove();
            this.chart.svg.selectAll('.axis-highlight-time-text').remove();
            this.chart.svg.selectAll('.axis-highlight-time-start').remove();
            this.chart.svg.selectAll('.axis-highlight-time-start-text').remove();
            this.chart.svg.selectAll('.axis-highlight-time-end').remove();
            this.chart.svg.selectAll('.axis-highlight-time-end-text').remove();
        }
        // Clear canvas-based zones
        if (this.chart?.clearAxisHighlightZones) {
            this.chart.clearAxisHighlightZones();
        }
    }

    /**
     * Serialize to JSON for persistence
     * Stores timestamps for multi-timeframe support
     */
    toJSON() {
        let serializedPoints = this.points;
        let coordinateSystem = 'index';
        
        // CRITICAL: Use stored timestamps if available (never recalculate from indices)
        // This ensures drawings maintain their position across timeframe changes
        if (this.timestampPoints && this.timestampPoints.length > 0) {
            serializedPoints = this.timestampPoints;
            coordinateSystem = 'timestamp';
        } 
        // Only calculate timestamps if not already stored (first save after creation)
        else if (this.chart && this.chart.data && this.chart.data.length > 0) {
            // Use CoordinateUtils for extrapolation support with correct timeframe
            const timeframe = this.chart.currentTimeframe || null;
            serializedPoints = this.points.map(p => {
                const timestamp = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
                return {
                    timestamp: timestamp,
                    price: p.y
                };
            });
            coordinateSystem = 'timestamp';
            
            // Store these timestamps permanently
            this.timestampPoints = serializedPoints;
        }
        
        return {
            id: this.id,
            type: this.type,
            points: serializedPoints,
            coordinateSystem: coordinateSystem,
            style: this.style,
            visible: this.visible,
            visibility: this.visibility,
            meta: this.meta,
            text: this.text,
            baseScale: this.baseScale
        };
    }

    /**
     * Create from JSON
     * Handles both timestamp-based (new) and index-based (legacy) formats
     * Note: Points will be in timestamp format here, conversion to indices happens in manager
     */
    static fromJSON(data, chart = null) {
        // Subclass constructors take (points, style), NOT (type, points, style)
        // The type is set internally by each subclass in super() call
        const drawing = new this(data.points || [], data.style || {});
        drawing.id = data.id;
        drawing.visible = data.visible !== undefined ? data.visible : true;
        drawing.meta = data.meta || { createdAt: Date.now(), updatedAt: Date.now() };
        drawing.text = data.text || '';
        drawing.coordinateSystem = data.coordinateSystem || 'index'; // Default to legacy format
        drawing.chart = chart;
        drawing.baseScale = data.baseScale || null; // Restore zoom scale reference
        
        // Restore locked state
        if (data.locked !== undefined) {
            drawing.locked = data.locked;
        }
        
        // Restore timeframe visibility
        if (data.visibility) {
            drawing.visibility = data.visibility;
        }
        
        // Store timestamp points permanently if they're in timestamp format
        if (data.coordinateSystem === 'timestamp' && data.points) {
            drawing.timestampPoints = data.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price || p.y
            }));
        }
        
        return drawing;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        // Hide axis highlights before removing the drawing
        this.hideAxisHighlights();
        
        if (this.group) {
            this.group.remove();
        }
        this.handles = [];
        this.group = null;
    }
}

// ============================================================================
// Drawing State Manager
// ============================================================================
class DrawingState {
    constructor() {
        this.currentTool = null;
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    reset() {
        this.isDrawing = false;
        this.currentDrawing = null;
        this.tempPoints = [];
        this.requiredPoints = 0;
    }

    startDrawing(tool, requiredPoints) {
        this.currentTool = tool;
        this.isDrawing = true;
        this.tempPoints = [];
        this.requiredPoints = requiredPoints;
    }

    addPoint(point) {
        this.tempPoints.push(point);
        // For continuous drawing (requiredPoints = -1), never auto-complete
        if (this.requiredPoints === -1) {
            return false;
        }
        // For point-by-point drawing (requiredPoints = -2), never auto-complete
        if (this.requiredPoints === -2) {
            return false;
        }
        return this.tempPoints.length >= this.requiredPoints;
    }

    isComplete() {
        // For continuous drawing (requiredPoints = -1), check for minimum points
        if (this.requiredPoints === -1) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a path
        }
        // For point-by-point drawing (requiredPoints = -2), check for minimum points
        if (this.requiredPoints === -2) {
            return this.tempPoints.length >= 2; // Need at least 2 points for a polyline
        }
        return this.tempPoints.length >= this.requiredPoints;
    }
}

// ============================================================================
// Coordinate Utilities
// ============================================================================
class CoordinateUtils {
    /**
     * Convert screen coordinates to data coordinates
     * Note: X coordinate is candle INDEX, not timestamp - snapped to candle center unless continuous mode
     * @param {boolean} continuous - If true, don't round x to allow smooth freehand drawing
     */
    static screenToData(screenX, screenY, scales, chart = null, continuous = false) {
        // Use chart's helper methods if available for accurate index calculation
        const rawX = chart && chart.pixelToDataIndex ? 
            chart.pixelToDataIndex(screenX) : 
            scales.xScale.invert(screenX);
            
        return {
            x: continuous ? rawX : Math.round(rawX),  // Keep fractional for freehand, snap for others
            y: scales.yScale.invert(screenY)  // This is the price
        };
    }

    /**
     * Convert data coordinates to screen coordinates
     * Note: dataX should be candle INDEX, not timestamp
     */
    static dataToScreen(dataX, dataY, scales, chart = null) {
        // Use chart's helper methods if available for accurate pixel calculation
        const x = chart && chart.dataIndexToPixel ? 
            chart.dataIndexToPixel(dataX) : 
            scales.xScale(dataX);
            
        return {
            x: x,
            y: scales.yScale(dataY)
        };
    }

    /**
     * Snap to nearest OHLC value (for magnet mode)
     * @param {Object} point - {x: dataIndex, y: price}
     * @param {Array} data - Chart candle data
     * @param {Object} scales - {xScale, yScale}
     * @param {string|boolean} magnetMode - 'off', 'weak', 'strong', or boolean for backward compatibility
     * @returns {Object} - Snapped point {x: dataIndex, y: price}
     */
    static snapToOHLC(point, data, scales, magnetMode = 'off') {
        // Handle boolean for backward compatibility
        if (magnetMode === false || magnetMode === 'off') {
            return point;
        }
        if (magnetMode === true) {
            magnetMode = 'weak'; // Default to weak for backward compatibility
        }
        
        if (!data || data.length === 0) {
            return point;
        }

        // Define snap thresholds based on magnet strength
        // Weak: only snap if very close to OHLC (within ~20% of price range)
        // Strong: always snap to nearest OHLC
        const isStrong = magnetMode === 'strong';
        
        // Point.x is already a candle index, so just round it to nearest integer
        const nearestIndex = Math.round(Math.max(0, Math.min(data.length - 1, point.x)));
        const nearestCandle = data[nearestIndex];
        
        if (!nearestCandle) {
            return point;
        }

        // Find nearest OHLC value (handle both short and long property names)
        const open = nearestCandle.o ?? nearestCandle.open;
        const high = nearestCandle.h ?? nearestCandle.high;
        const low = nearestCandle.l ?? nearestCandle.low;
        const close = nearestCandle.c ?? nearestCandle.close;
        
        const ohlc = [open, high, low, close].filter(v => v !== undefined && v !== null && !isNaN(v));
        
        // If no valid OHLC values, return original point
        if (ohlc.length === 0) {
            return point;
        }

        const nearestPrice = ohlc.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev - point.y);
            const currDiff = Math.abs(curr - point.y);
            return currDiff < prevDiff ? curr : prev;
        });

        // For weak magnet, check if we're close enough to snap
        if (!isStrong) {
            const candleRange = high - low;
            const snapThreshold = candleRange * 0.3; // 30% of candle range
            const distanceToNearest = Math.abs(nearestPrice - point.y);
            
            // Only snap if within threshold
            if (distanceToNearest > snapThreshold) {
                return {
                    x: nearestIndex,  // Still snap X to candle
                    y: point.y        // Keep original Y
                };
            }
        }

        // Strong magnet or within threshold: snap both X and Y
        return {
            x: nearestIndex,
            y: nearestPrice
        };
    }

    /**
     * Get interval in milliseconds from timeframe string
     * @param {string} timeframe - Timeframe like '1m', '5m', '1h', etc.
     * @returns {number|null} - Interval in milliseconds or null if unknown
     */
    static getIntervalFromTimeframe(timeframe) {
        if (!timeframe) return null;
        
        const tf = timeframe.toLowerCase();
        const num = parseInt(tf) || 1;
        
        if (tf.includes('m') && !tf.includes('mo')) {
            return num * 60 * 1000; // minutes
        } else if (tf.includes('h')) {
            return num * 60 * 60 * 1000; // hours
        } else if (tf.includes('d')) {
            return num * 24 * 60 * 60 * 1000; // days
        } else if (tf.includes('w')) {
            return num * 7 * 24 * 60 * 60 * 1000; // weeks
        } else if (tf.includes('mo')) {
            return num * 30 * 24 * 60 * 60 * 1000; // months (approx)
        }
        
        return null;
    }

    /**
     * Convert candle index to timestamp
     * Supports extrapolation for indices beyond data range (for replay mode)
     * @param {number} index - Candle index in data array
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Timestamp in milliseconds
     */
    static indexToTimestamp(index, data, timeframe = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ indexToTimestamp: No data!');
            return Date.now(); // Return current time if no data
        }
        
        // CRITICAL: Preserve fractional index for brush stroke smoothness
        const baseIndex = Math.floor(index);
        const fraction = index - baseIndex;
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        // If index is within data range, use actual candle timestamp + fractional offset
        if (baseIndex >= 0 && baseIndex < data.length) {
            const baseTs = data[baseIndex]?.t || 0;
            // Add fractional offset within the candle for smooth brush strokes
            return baseTs + (fraction * interval);
        }
        
        // Extrapolate for indices beyond data range (preserve fractional precision)
        if (index >= data.length) {
            // Beyond end of data - extrapolate forward
            const lastCandle = data[data.length - 1];
            const candlesBeyond = index - (data.length - 1);
            return lastCandle.t + (candlesBeyond * interval);
        } else if (index < 0) {
            // Before start of data - extrapolate backward
            const firstCandle = data[0];
            return firstCandle.t + (index * interval); // index is negative
        }
        
        return 0;
    }

    /**
     * Convert timestamp to candle index using binary search
     * Supports extrapolation for timestamps beyond data range (for replay mode)
     * @param {number} timestamp - Timestamp in milliseconds
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Current chart timeframe (e.g., '1m', '1h')
     * @returns {number} - Candle index (may be beyond data range for extrapolated positions)
     */
    static timestampToIndex(timestamp, data, timeframe = null) {
        if (!data || data.length === 0) {
            console.warn('⚠️ timestampToIndex: No data!');
            return 0;
        }
        
        const firstCandle = data[0];
        const lastCandle = data[data.length - 1];
        
        // Calculate candle interval - use timeframe if provided, otherwise derive from data
        let interval = this.getIntervalFromTimeframe(timeframe);
        if (!interval && data.length >= 2) {
            interval = data[1].t - data[0].t;
        }
        if (!interval) {
            interval = 60000; // Fallback to 1 minute
        }
        
        // Handle timestamps before first candle - extrapolate backward with FRACTIONAL precision
        if (timestamp < firstCandle.t) {
            const fractionalCandles = (firstCandle.t - timestamp) / interval;
            return -fractionalCandles; // Return fractional negative index
        }
        
        // Handle timestamps after last candle - extrapolate forward with FRACTIONAL precision
        if (timestamp > lastCandle.t) {
            const fractionalCandles = (timestamp - lastCandle.t) / interval;
            return (data.length - 1) + fractionalCandles; // Return fractional index
        }
        
        // Find the candle that contains this timestamp WITH fractional position
        // For resampled data (5m, 1h), calculate exact position within the candle
        for (let i = 0; i < data.length; i++) {
            const candle = data[i];
            const nextCandle = data[i + 1];
            
            // If this is the last candle, or timestamp is before next candle
            if (!nextCandle || timestamp < nextCandle.t) {
                // Calculate fractional position within this candle
                const fractionWithinCandle = (timestamp - candle.t) / interval;
                return i + fractionWithinCandle;
            }
        }
        
        // Fallback: return last index
        let left = 0;
        let right = data.length - 1;
        let closest = 0;
        let minDiff = Infinity;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const diff = Math.abs(data[mid].t - timestamp);
            
            if (diff < minDiff) {
                minDiff = diff;
                closest = mid;
            }
            
            if (data[mid].t < timestamp) {
                left = mid + 1;
            } else if (data[mid].t > timestamp) {
                right = mid - 1;
            } else {
                return mid; // Exact match
            }
        }
        
        return closest;
    }

    /**
     * Convert points from index-based to timestamp-based coordinates
     * @param {Array} points - Array of {x: index, y: price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {timestamp, price} points
     */
    static pointsToTimestamps(points, data, timeframe = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => ({
            timestamp: this.indexToTimestamp(p.x, data, timeframe),
            price: p.y
        }));
    }

    /**
     * Convert points from timestamp-based to index-based coordinates
     * Preserves extrapolated indices for areas beyond data range (replay mode)
     * @param {Array} points - Array of {timestamp, price} points
     * @param {Array} data - Chart candle data
     * @param {string} timeframe - Chart timeframe for interval calculation
     * @returns {Array} - Array of {x: index, y: price} points
     */
    static pointsFromTimestamps(points, data, timeframe = null) {
        if (!points || !data || data.length === 0) {
            return points;
        }
        
        return points.map(p => {
            const index = this.timestampToIndex(p.timestamp || 0, data, timeframe);
            
            // Don't clamp - allow extrapolated indices for replay mode
            return {
                x: index,
                y: p.price || p.y
            };
        });
    }

    /**
     * Calculate distance between two points
     */
    static distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Check if point is near a line segment
     */
    static isNearLine(point, lineStart, lineEnd, threshold = 5) {
        const d = this.distanceToLine(point, lineStart, lineEnd);
        return d < threshold;
    }

    /**
     * Calculate distance from point to line segment
     */
    static distanceToLine(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// ============================================================================
// SVG Helper Functions
// ============================================================================
class SVGHelpers {
    /**
     * Create arrow marker definition
     */
    static createArrowMarker(svg, id, color = '#5dd3edff') {
        let defs = svg.select('defs');
        if (defs.empty()) {
            defs = svg.append('defs');
        }

        let marker = defs.select(`marker#${id}`);
        if (marker.empty()) {
            marker = defs.append('marker')
                .attr('id', id)
                .attr('viewBox', '0 0 10 10')
                .attr('refX', 9)
                .attr('refY', 5)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto-start-reverse');

            marker.append('path')
                .attr('d', 'M 0 0 L 10 5 L 0 10 z');
        }

        marker.select('path')
            .attr('fill', color);

        return `url(#${id})`;
    }

    /**
     * Apply hover effect to drawing
     */
    static applyHoverEffect(element, isHovering) {
        if (isHovering) {
            element
                .style('cursor', 'default');
        } else {
            element
                .style('cursor', 'default');
        }
    }

    /**
     * Apply selection effect to drawing
     */
    static applySelectionEffect(element, isSelected) {
        if (isSelected) {
            element
                .style('stroke-width', parseFloat(element.style('stroke-width') || 2) + 1);
        } else {
            element
                .style('stroke-width', parseFloat(element.attr('data-original-width') || 2));
        }
    }
}

// ============================================================================
// Export for use in other modules
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateUUID,
        BaseDrawing,
        DrawingState,
        CoordinateUtils,
        SVGHelpers
    };
}
