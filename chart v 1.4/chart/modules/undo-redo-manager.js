/**
 * Undo/Redo Manager
 * Manages history of drawing operations for undo/redo functionality
 */

class UndoRedoManager {
    constructor(drawingManager) {
        this.drawingManager = drawingManager;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50; // Limit memory usage
        this.isPerformingUndoRedo = false; // Prevent recording during undo/redo
        
        console.log('📚 Undo/Redo Manager initialized');
    }
    
    /**
     * Record an action for undo
     * @param {string} type - 'add', 'delete', 'modify'
     * @param {object} data - Action data
     */
    recordAction(type, data) {
        // Don't record if we're in the middle of undo/redo
        if (this.isPerformingUndoRedo) return;
        
        const action = {
            type,
            timestamp: Date.now(),
            data: this.cloneData(data)
        };
        
        this.undoStack.push(action);
        
        // Clear redo stack when new action is recorded
        this.redoStack = [];
        
        // Limit stack size
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        
        console.log(`📝 Recorded action: ${type}`, action);
        this.updateUI();
    }
    
    /**
     * Record adding a drawing
     */
    recordAdd(drawing) {
        this.recordAction('add', {
            drawingId: drawing.id,
            drawingJSON: drawing.toJSON()
        });
    }
    
    /**
     * Record deleting a drawing
     */
    recordDelete(drawing, index) {
        this.recordAction('delete', {
            drawingId: drawing.id,
            drawingJSON: drawing.toJSON(),
            index: index
        });
    }
    
    /**
     * Record modifying a drawing (move, resize, style change)
     */
    recordModify(drawing, beforeState) {
        this.recordAction('modify', {
            drawingId: drawing.id,
            before: beforeState,
            after: drawing.toJSON()
        });
    }
    
    /**
     * Capture current state of a drawing for modification tracking
     */
    captureState(drawing) {
        return drawing.toJSON();
    }
    
    /**
     * Undo the last action
     */
    undo() {
        if (this.undoStack.length === 0) {
            this.showNotification('Nothing to undo');
            return false;
        }
        
        const action = this.undoStack.pop();
        this.isPerformingUndoRedo = true;
        
        try {
            switch (action.type) {
                case 'add':
                    this.undoAdd(action.data);
                    break;
                case 'delete':
                    this.undoDelete(action.data);
                    break;
                case 'modify':
                    this.undoModify(action.data);
                    break;
            }
            
            this.redoStack.push(action);
            this.showNotification('Undo');
            
        } catch (error) {
            console.error('❌ Undo failed:', error);
            // Put action back if it failed
            this.undoStack.push(action);
        } finally {
            this.isPerformingUndoRedo = false;
            // ONE network save after the full operation is done
            this._scheduleFinalSave();
        }
        
        this.updateUI();
        return true;
    }
    
    /**
     * Redo the last undone action
     */
    redo() {
        if (this.redoStack.length === 0) {
            this.showNotification('Nothing to redo');
            return false;
        }
        
        const action = this.redoStack.pop();
        this.isPerformingUndoRedo = true;
        
        try {
            switch (action.type) {
                case 'add':
                    this.redoAdd(action.data);
                    break;
                case 'delete':
                    this.redoDelete(action.data);
                    break;
                case 'modify':
                    this.redoModify(action.data);
                    break;
            }
            
            this.undoStack.push(action);
            this.showNotification('Redo');
            
        } catch (error) {
            console.error('❌ Redo failed:', error);
            // Put action back if it failed
            this.redoStack.push(action);
        } finally {
            this.isPerformingUndoRedo = false;
            this._scheduleFinalSave();
        }
        
        this.updateUI();
        return true;
    }
    
    // ===== UNDO OPERATIONS =====
    
    undoAdd(data) {
        const drawing = this.findDrawingById(data.drawingId);
        if (drawing) {
            this.removeDrawingWithoutHistory(drawing);
        }
    }
    
    undoDelete(data) {
        this.restoreDrawing(data.drawingJSON, data.index);
    }
    
    undoModify(data) {
        const drawing = this.findDrawingById(data.drawingId);
        if (drawing) {
            this.restoreDrawingState(drawing, data.before);
        }
    }
    
    // ===== REDO OPERATIONS =====
    
    redoAdd(data) {
        this.restoreDrawing(data.drawingJSON);
    }
    
    redoDelete(data) {
        const drawing = this.findDrawingById(data.drawingId);
        if (drawing) {
            this.removeDrawingWithoutHistory(drawing);
        }
    }
    
    redoModify(data) {
        const drawing = this.findDrawingById(data.drawingId);
        if (drawing) {
            this.restoreDrawingState(drawing, data.after);
        }
    }
    
    // ===== HELPER METHODS =====
    
    findDrawingById(id) {
        return this.drawingManager.drawings.find(d => d.id === id);
    }
    
    removeDrawingWithoutHistory(drawing) {
        const index = this.drawingManager.drawings.indexOf(drawing);
        if (index > -1) {
            this.drawingManager.drawings.splice(index, 1);
            drawing.destroy();

            // Clean up selection state
            if (this.drawingManager.selectedDrawing === drawing) {
                this.drawingManager.selectedDrawing = null;
            }
            if (this.drawingManager.selectedDrawings) {
                this.drawingManager.selectedDrawings = this.drawingManager.selectedDrawings.filter(d => d !== drawing);
            }
            // Hide toolbar if it was showing this drawing
            if (this.drawingManager.toolbar && this.drawingManager.toolbar.currentDrawing === drawing) {
                this.drawingManager.toolbar.hide();
            }

            this.drawingManager.saveDrawings();
            
            if (this.drawingManager.objectTreeManager) {
                this.drawingManager.objectTreeManager.refresh();
            }
        }
    }
    
    restoreDrawing(json, atIndex = null) {
        console.log('🔄 Restoring drawing:', json.type, json.id);
        
        const toolInfo = this.drawingManager.toolRegistry[json.type];
        if (!toolInfo) {
            console.error('❌ Unknown drawing type:', json.type);
            return null;
        }
        
        try {
            // Determine conversion dataset (handles replay mode if available)
            const chart = this.drawingManager.chart;
            let conversionData = chart && chart.data;
            const timeframe = chart && chart.currentTimeframe ? chart.currentTimeframe : null;

            // In replay mode prefer full resampled data if available (mirrors loadDrawings/refreshDrawingsForTimeframe)
            if (chart && chart.replaySystem && chart.replaySystem.isActive &&
                chart.replaySystem.fullRawData && chart.replaySystem.fullRawData.length > 0 &&
                typeof chart.resampleData === 'function') {
                try {
                    const fullResampled = chart.resampleData(chart.replaySystem.fullRawData, chart.currentTimeframe);
                    conversionData = fullResampled;
                } catch (error) {
                    console.warn('⚠️ UndoRedoManager: failed to resample full data for restoreDrawing, using chart.data:', error);
                }
            }

            // IMPORTANT: If the JSON uses timestamp coordinates, convert them to indices for the current timeframe
            let originalTimestampPoints = null;
            const jsonForFrom = { ...json };

            if (json.coordinateSystem === 'timestamp' && Array.isArray(json.points) &&
                typeof CoordinateUtils !== 'undefined' && conversionData && conversionData.length > 0) {
                originalTimestampPoints = json.points.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price !== undefined ? p.price : p.y
                }));
                jsonForFrom.points = CoordinateUtils.pointsFromTimestamps(
                    originalTimestampPoints,
                    conversionData,
                    timeframe
                );
            }

            // Create new drawing from JSON (now guaranteed to be index/price based)
            const drawing = toolInfo.class.fromJSON(jsonForFrom, chart);
            if (!drawing) {
                console.error('❌ Failed to create drawing from JSON');
                return null;
            }
            
            // Set chart reference
            drawing.chart = chart;
            
            // Ensure ID is preserved
            if (json.id) {
                drawing.id = json.id;
            }

            // Restore original timestamp points for future timeframe conversions
            if (originalTimestampPoints && originalTimestampPoints.length > 0) {
                drawing.timestampPoints = originalTimestampPoints.map(p => ({ ...p }));
            }
            
            // Insert at specific index or append
            if (atIndex !== null && atIndex >= 0 && atIndex <= this.drawingManager.drawings.length) {
                this.drawingManager.drawings.splice(atIndex, 0, drawing);
            } else {
                this.drawingManager.drawings.push(drawing);
            }
            
            // Render the drawing
            this.drawingManager.renderDrawing(drawing);
            this.drawingManager.saveDrawings();
            
            // Refresh object tree if available
            if (this.drawingManager.objectTreeManager) {
                this.drawingManager.objectTreeManager.refresh();
            }
            
            console.log('✅ Drawing restored:', drawing.type, drawing.id);
            return drawing;
            
        } catch (error) {
            console.error('❌ Error restoring drawing:', error);
            return null;
        }
    }
    
    restoreDrawingState(drawing, state) {
        if (!state) return;

        const chart = this.drawingManager.chart;
        const timeframe = chart && chart.currentTimeframe ? chart.currentTimeframe : null;
        let conversionData = chart && chart.data;

        // In replay mode prefer full resampled data if available (mirrors refreshDrawingsForTimeframe)
        if (chart && chart.replaySystem && chart.replaySystem.isActive &&
            chart.replaySystem.fullRawData && chart.replaySystem.fullRawData.length > 0 &&
            typeof chart.resampleData === 'function') {
            try {
                const fullResampled = chart.resampleData(chart.replaySystem.fullRawData, chart.currentTimeframe);
                conversionData = fullResampled;
            } catch (error) {
                console.warn('⚠️ UndoRedoManager: failed to resample full data for restoreDrawingState, using chart.data:', error);
            }
        }

        // ---- Restore geometric points ----
        let restoredPoints = null;
        let restoredTimestampPoints = null;

        const hasExplicitTimestampPoints = Array.isArray(state.timestampPoints) && state.timestampPoints.length > 0;
        const isTimestampCoord = state.coordinateSystem === 'timestamp';

        if (hasExplicitTimestampPoints) {
            restoredTimestampPoints = state.timestampPoints.map(p => ({
                timestamp: p.timestamp,
                price: p.price !== undefined ? p.price : p.y
            }));
        } else if (isTimestampCoord && Array.isArray(state.points)) {
            // Points are stored as {timestamp, price}
            restoredTimestampPoints = state.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price !== undefined ? p.price : p.y
            }));
        }

        if (restoredTimestampPoints && typeof CoordinateUtils !== 'undefined' && conversionData && conversionData.length > 0) {
            // Convert timestamps back to indices for the current timeframe
            const indexPoints = CoordinateUtils.pointsFromTimestamps(
                restoredTimestampPoints,
                conversionData,
                timeframe
            );
            restoredPoints = indexPoints.map(p => ({ x: p.x, y: p.y }));
        } else if (Array.isArray(state.points)) {
            // Fall back to treating points as plain index/price pairs
            restoredPoints = state.points.map(p => ({
                x: p.x !== undefined ? p.x : (p.index !== undefined ? p.index : 0),
                y: p.y !== undefined ? p.y : (p.price !== undefined ? p.price : 0)
            }));
        }

        if (restoredPoints) {
            drawing.points = restoredPoints;
        }

        if (restoredTimestampPoints) {
            drawing.timestampPoints = restoredTimestampPoints.map(p => ({ ...p }));
        } else if (chart && chart.data && chart.data.length > 0 &&
                   typeof CoordinateUtils !== 'undefined' && restoredPoints) {
            // Rebuild timestampPoints from indices if we only had index-based state
            const tsPoints = CoordinateUtils.pointsToTimestamps(restoredPoints, chart.data, timeframe);
            drawing.timestampPoints = tsPoints.map(p => ({
                timestamp: p.timestamp,
                price: p.price
            }));
        }

        // ---- Restore style and metadata ----
        if (state.style) {
            drawing.style = { ...state.style };
        }
        if (state.meta) {
            drawing.meta = { ...state.meta };
        }
        if (state.text !== undefined) drawing.text = state.text;
        if (state.locked !== undefined) drawing.locked = state.locked;
        if (state.visible !== undefined) drawing.visible = state.visible;

        // Ensure chart reference is correct
        if (chart) {
            drawing.chart = chart;
        }

        // Re-render the drawing
        this.drawingManager.renderDrawing(drawing);
        this.drawingManager.saveDrawings();
    }
    
    /**
     * Schedule one network save after undo/redo completes (avoids multiple saves during operation)
     */
    _scheduleFinalSave() {
        clearTimeout(this._finalSaveTimer);
        this._finalSaveTimer = setTimeout(() => {
            if (this.drawingManager.chart && typeof this.drawingManager.chart.scheduleSessionStateSave === 'function') {
                const data = this.drawingManager.drawings.map(d => d.toJSON());
                this.drawingManager.chart.scheduleSessionStateSave({ drawings: data });
            }
        }, 300);
    }

    cloneData(data) {
        return JSON.parse(JSON.stringify(data));
    }
    
    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }
    
    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }
    
    /**
     * Clear all history
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.updateUI();
        console.log('🧹 History cleared');
    }
    
    /**
     * Show notification
     */
    showNotification(message) {
        // Use the keyboard shortcuts notification if available
        let notification = document.getElementById('shortcutNotification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'shortcutNotification';
            notification.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(26, 29, 40, 0.95);
                border: 1px solid #2a2e39;
                border-radius: 8px;
                padding: 12px 20px;
                color: #fff;
                font-size: 14px;
                z-index: 100000;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.style.opacity = '1';
        notification.style.display = 'block';
        
        // Hide after 1 second
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 1000);
    }
    
    /**
     * Update UI elements (undo/redo buttons, etc.)
     */
    updateUI() {
        // Update any undo/redo buttons in the UI
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.style.opacity = this.canUndo() ? '1' : '0.5';
        }
        
        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.style.opacity = this.canRedo() ? '1' : '0.5';
        }
    }
    
    /**
     * Get history stats
     */
    getStats() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            maxSize: this.maxHistorySize
        };
    }
}

// Make it globally available
if (typeof window !== 'undefined') {
    window.UndoRedoManager = UndoRedoManager;
}
