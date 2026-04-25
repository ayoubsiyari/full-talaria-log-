/**
 * Keyboard Shortcuts Manager
 * TradingView-style keyboard shortcuts for the chart
 */

class KeyboardShortcutsManager {
    constructor(chart) {
        this.chart = chart;
        this.enabled = true;
        this.isInputFocused = false;
        this.symbolSearchBuffer = '';
        this.symbolSearchTimeout = null;
        this.intervalBuffer = '';
        this.intervalTimeout = null;
        
        // Track modifier key states
        this.modifiers = {
            ctrl: false,
            alt: false,
            shift: false,
            meta: false
        };
        
        // Load custom shortcuts from localStorage
        this.customShortcuts = this.loadCustomShortcuts();
        
        // Shortcut definitions (merged with custom)
        this.shortcuts = this.defineShortcuts();
        
        this.init();
    }
    
    /**
     * Load custom shortcuts from localStorage
     */
    loadCustomShortcuts() {
        try {
            const saved = localStorage.getItem('chart_custom_shortcuts');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('Failed to load custom shortcuts:', e);
            return {};
        }
    }
    
    /**
     * Save custom shortcuts to localStorage
     */
    saveCustomShortcuts() {
        try {
            localStorage.setItem('chart_custom_shortcuts', JSON.stringify(this.customShortcuts));
        } catch (e) {
            console.warn('Failed to save custom shortcuts:', e);
        }
    }
    
    /**
     * Update a shortcut binding
     */
    updateShortcut(actionId, newKey) {
        // Remove old binding if exists
        for (const key of Object.keys(this.shortcuts)) {
            if (this.shortcuts[key].id === actionId) {
                delete this.shortcuts[key];
                break;
            }
        }
        
        // Add new binding
        this.customShortcuts[actionId] = newKey;
        this.saveCustomShortcuts();
        
        // Rebuild shortcuts
        this.shortcuts = this.defineShortcuts();
    }
    
    /**
     * Reset a shortcut to default
     */
    resetShortcut(actionId) {
        delete this.customShortcuts[actionId];
        this.saveCustomShortcuts();
        this.shortcuts = this.defineShortcuts();
    }
    
    /**
     * Reset all shortcuts to defaults
     */
    resetAllShortcuts() {
        this.customShortcuts = {};
        this.saveCustomShortcuts();
        this.shortcuts = this.defineShortcuts();
    }
    
    /**
     * Define all keyboard shortcuts
     */
    defineShortcuts() {
        return {
            // ===== BASIC NAVIGATION =====
            'ArrowLeft': {
                action: () => this.moveChart(-1),
                description: 'Move chart 1 bar to the left'
            },
            'ArrowRight': {
                action: () => this.moveChart(1),
                description: 'Move chart 1 bar to the right'
            },
            'Ctrl+ArrowLeft': {
                action: () => this.moveChartFast(-10),
                description: 'Move further to the left'
            },
            'Ctrl+ArrowRight': {
                action: () => this.moveChartFast(10),
                description: 'Move further to the right'
            },
            
            // ===== ZOOM =====
            'Ctrl+ArrowUp': {
                action: () => this.zoomIn(),
                description: 'Zoom in'
            },
            'Ctrl+ArrowDown': {
                action: () => this.zoomOut(),
                description: 'Zoom out'
            },
            '+': {
                action: () => this.zoomIn(),
                description: 'Zoom in'
            },
            '=': {
                action: () => this.zoomIn(),
                description: 'Zoom in'
            },
            '-': {
                action: () => this.zoomOut(),
                description: 'Zoom out'
            },
            
            // ===== UNDO/REDO =====
            'Ctrl+z': {
                action: () => this.undo(),
                description: 'Undo'
            },
            'Ctrl+y': {
                action: () => this.redo(),
                description: 'Redo'
            },
            'Ctrl+Shift+z': {
                action: () => this.redo(),
                description: 'Redo (alternative)'
            },
            
            // ===== QUICK ACTIONS =====
            'Ctrl+k': {
                action: () => this.openQuickSearch(),
                description: 'Open Quick Search'
            },
            '/': {
                action: () => this.openIndicators(),
                description: 'Open indicators'
            },
            'Ctrl+l': {
                action: () => this.loadChartLayout(),
                description: 'Load chart layout'
            },
            'Ctrl+s': {
                action: () => this.saveChartLayout(),
                description: 'Save chart layout'
            },
            
            // ===== REPLAY CONTROLS =====
            'Space': {
                action: () => this.replayPlayPause(),
                description: 'Play/Pause replay (or reset view if not in replay)'
            },
            'Shift+ArrowRight': {
                action: () => this.replayStepForward(),
                description: 'Step forward in replay'
            },
            'Shift+ArrowLeft': {
                action: () => this.replayStepBackward(),
                description: 'Step backward in replay'
            },
            '.': {
                action: () => this.replayStepForward(),
                description: 'Step forward in replay (alternative)'
            },
            ',': {
                action: () => this.replayStepBackward(),
                description: 'Step backward in replay (alternative)'
            },
            
            // ===== ALT SHORTCUTS =====
            'Alt+g': {
                action: () => this.goToDate(),
                description: 'Go to date'
            },
            'Alt+s': {
                action: () => this.takeSnapshot(),
                description: 'Take snapshot'
            },
            'Alt+r': {
                action: () => this.resetChart(),
                description: 'Reset chart'
            },
            'Alt+i': {
                action: () => this.invertScale(),
                description: 'Invert series scale'
            },
            'Alt+l': {
                action: () => this.toggleLogScale(),
                description: 'Toggle logarithmic scale'
            },
            'Alt+p': {
                action: () => this.togglePercentScale(),
                description: 'Toggle percent scale'
            },
            'Alt+a': {
                action: () => this.toggleAutoScale(),
                description: 'Toggle auto scale'
            },
            'Alt+z': {
                action: () => this.toggleKeyboardNavigation(),
                description: 'Start keyboard navigation'
            },
            
            // ===== DRAWING TOOLS =====
            'Escape': {
                action: () => this.cancelAction(),
                description: 'Cancel current action / Deselect'
            },
            'Delete': {
                action: () => this.deleteSelected(),
                description: 'Delete selected drawing'
            },
            'Backspace': {
                action: () => this.deleteSelected(),
                description: 'Delete selected drawing'
            },
            'Ctrl+u': {
                action: () => this.unlockAllDrawings(),
                description: 'Unlock all drawings'
            },
            'm': {
                action: () => this.toggleMagnetMode(),
                description: 'Toggle magnet mode'
            },
            
            // ===== VIEW =====
            'Home': {
                action: () => this.jumpToLatest(),
                description: 'Jump to latest candles'
            },
            'End': {
                action: () => this.jumpToStart(),
                description: 'Jump to start of data'
            },
            ' ': {
                action: () => this.resetView(),
                description: 'Reset view/zoom'
            },
            
            // ===== HELP =====
            '?': {
                action: () => this.showShortcutsHelp(),
                description: 'Show keyboard shortcuts help'
            },
            'Shift+?': {
                action: () => this.showShortcutsHelp(),
                description: 'Show keyboard shortcuts help'
            }
        };
    }
    
    /**
     * Initialize the keyboard shortcuts manager
     */
    init() {
        // Keydown handler
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Keyup handler for modifier tracking
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Track input focus
        document.addEventListener('focusin', (e) => {
            const target = e.target;
            this.isInputFocused = (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.contentEditable === 'true'
            );
        });
        
        document.addEventListener('focusout', () => {
            this.isInputFocused = false;
        });
        
        // Bind keyboard shortcuts button in toolbar
        const shortcutsBtn = document.getElementById('keyboardShortcutsBtn');
        if (shortcutsBtn) {
            shortcutsBtn.addEventListener('click', () => this.showShortcutsHelp());
        }
        
        // Bind undo/redo buttons
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undo());
        }
        
        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.redo());
        }
        
        console.log('⌨️ Keyboard Shortcuts Manager initialized');
    }
    
    /**
     * Handle keydown events
     */
    handleKeyDown(e) {
        if (!this.enabled) return;
        
        // Update modifiers
        this.modifiers.ctrl = e.ctrlKey || e.metaKey;
        this.modifiers.alt = e.altKey;
        this.modifiers.shift = e.shiftKey;
        this.modifiers.meta = e.metaKey;
        
        // Skip if typing in input fields (except for specific shortcuts)
        if (this.isInputFocused) {
            // Allow Escape to blur input
            if (e.key === 'Escape') {
                document.activeElement.blur();
                e.preventDefault();
            }
            return;
        }
        
        // Build shortcut key string
        const shortcutKey = this.buildShortcutKey(e);
        
        // Check for registered shortcut
        const shortcut = this.shortcuts[shortcutKey];
        if (shortcut) {
            e.preventDefault();
            shortcut.action();
            return;
        }
        
        // Handle symbol search (typing letters)
        if (this.isSymbolSearchKey(e)) {
            this.handleSymbolSearch(e.key);
            return;
        }
        
        // Handle interval change (digits and comma)
        if (this.isIntervalKey(e)) {
            this.handleIntervalChange(e.key);
            return;
        }
    }
    
    /**
     * Handle keyup events
     */
    handleKeyUp(e) {
        this.modifiers.ctrl = e.ctrlKey || e.metaKey;
        this.modifiers.alt = e.altKey;
        this.modifiers.shift = e.shiftKey;
        this.modifiers.meta = e.metaKey;
    }
    
    /**
     * Build shortcut key string from event
     */
    buildShortcutKey(e) {
        let parts = [];
        
        if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        
        // Handle special keys
        let key = e.key;
        if (key === ' ') key = 'Space';
        else if (key.length === 1) key = key.toLowerCase();
        
        parts.push(key);
        
        return parts.join('+');
    }
    
    /**
     * Check if key is for symbol search
     */
    isSymbolSearchKey(e) {
        return (
            !e.ctrlKey && !e.altKey && !e.metaKey &&
            e.key.length === 1 &&
            /[a-zA-Z]/.test(e.key)
        );
    }
    
    /**
     * Check if key is for interval change
     */
    isIntervalKey(e) {
        return (
            !e.ctrlKey && !e.altKey && !e.metaKey &&
            (e.key === ',' || /[0-9]/.test(e.key))
        );
    }
    
    /**
     * Handle symbol search typing
     */
    handleSymbolSearch(key) {
        this.symbolSearchBuffer += key.toUpperCase();
        
        // Clear existing timeout
        if (this.symbolSearchTimeout) {
            clearTimeout(this.symbolSearchTimeout);
        }
        
        // Show search indication
        this.showSymbolSearchIndicator(this.symbolSearchBuffer);
        
        // Reset buffer after 1.5 seconds of inactivity
        this.symbolSearchTimeout = setTimeout(() => {
            this.executeSymbolSearch(this.symbolSearchBuffer);
            this.symbolSearchBuffer = '';
            this.hideSymbolSearchIndicator();
        }, 1500);
    }
    
    /**
     * Handle interval/timeframe change
     */
    handleIntervalChange(key) {
        this.intervalBuffer += key;
        
        // Clear existing timeout
        if (this.intervalTimeout) {
            clearTimeout(this.intervalTimeout);
        }
        
        // Show interval indication
        this.showIntervalIndicator(this.intervalBuffer);
        
        // Reset buffer after 1 second of inactivity
        this.intervalTimeout = setTimeout(() => {
            this.executeIntervalChange(this.intervalBuffer);
            this.intervalBuffer = '';
            this.hideIntervalIndicator();
        }, 1000);
    }
    
    // ===== ACTION IMPLEMENTATIONS =====
    
    moveChart(bars) {
        const candleSpacing = this.chart.getCandleSpacing ? 
            this.chart.getCandleSpacing() : (this.chart.candleWidth + 2);
        this.chart.offsetX -= bars * candleSpacing;
        this.chart.constrainPan?.();
        this.chart.scheduleRender?.() || (this.chart.needsRender = true);
    }
    
    moveChartFast(bars) {
        const candleSpacing = this.chart.getCandleSpacing ? 
            this.chart.getCandleSpacing() : (this.chart.candleWidth + 2);
        this.chart.offsetX -= bars * candleSpacing;
        this.chart.constrainPan?.();
        this.chart.scheduleRender?.() || (this.chart.needsRender = true);
    }
    
    zoomIn() {
        if (this.chart.zoomAtCenter) {
            this.chart.zoomAtCenter(1.2);
        } else {
            this.chart.candleWidth = Math.min(100, this.chart.candleWidth * 1.2);
            this.chart.needsRender = true;
        }
    }
    
    zoomOut() {
        if (this.chart.zoomAtCenter) {
            this.chart.zoomAtCenter(0.8);
        } else {
            this.chart.candleWidth = Math.max(2, this.chart.candleWidth * 0.8);
            this.chart.needsRender = true;
        }
    }
    
    undo() {
        // Check if drawing manager has undo
        if (this.chart.drawingManager?.undo) {
            const success = this.chart.drawingManager.undo();
            this.updateUndoRedoButtons();
            if (!success) {
                this.showNotification('Nothing to undo');
            }
        } else if (this.chart.drawings && this.chart.drawings.length > 0) {
            // Fallback: remove last drawing
            const undone = this.chart.drawings.pop();
            if (!this.chart.undoStack) this.chart.undoStack = [];
            this.chart.undoStack.push(undone);
            this.saveDrawings();
            this.chart.needsRender = true;
            this.showNotification('Undo');
        } else {
            this.showNotification('Nothing to undo');
        }
    }
    
    redo() {
        // Check if drawing manager has redo
        if (this.chart.drawingManager?.redo) {
            const success = this.chart.drawingManager.redo();
            this.updateUndoRedoButtons();
            if (!success) {
                this.showNotification('Nothing to redo');
            }
        } else if (this.chart.undoStack && this.chart.undoStack.length > 0) {
            // Fallback: restore from undo stack
            const redone = this.chart.undoStack.pop();
            this.chart.drawings.push(redone);
            this.saveDrawings();
            this.chart.needsRender = true;
            this.showNotification('Redo');
        } else {
            this.showNotification('Nothing to redo');
        }
    }
    
    /**
     * Update undo/redo button states
     */
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        const canUndo = this.chart.drawingManager?.history?.canUndo?.() || false;
        const canRedo = this.chart.drawingManager?.history?.canRedo?.() || false;
        
        if (undoBtn) {
            undoBtn.style.opacity = canUndo ? '1' : '0.5';
            undoBtn.disabled = !canUndo;
        }
        
        if (redoBtn) {
            redoBtn.style.opacity = canRedo ? '1' : '0.5';
            redoBtn.disabled = !canRedo;
        }
    }
    
    openQuickSearch() {
        // Try to open file selector or symbol search
        const fileSelector = document.getElementById('fileSelector');
        if (fileSelector) {
            fileSelector.focus();
            fileSelector.click();
        }
        this.showNotification('Quick Search', 'mdi-magnify');
    }
    
    openIndicators() {
        // Try clicking the indicators button
        const indicatorsBtn = document.getElementById('indicatorsBtn');
        if (indicatorsBtn) {
            indicatorsBtn.click();
        } else if (typeof showIndicatorsMenu === 'function') {
            showIndicatorsMenu();
        }
    }
    
    loadChartLayout() {
        // Show layout loading dialog/panel if available
        this.showNotification('Load Layout', 'mdi-view-dashboard');
        // Could open a layout manager modal here
    }
    
    saveChartLayout() {
        // Save current layout
        this.chart.saveState?.();
        this.saveDrawings();
        this.showNotification('Layout Saved', 'mdi-content-save');
    }
    
    goToDate() {
        // Open Go To menu
        const goToToggle = document.getElementById('goToMenuToggle');
        const goToMenu = document.getElementById('goToMenu');
        
        if (goToToggle && goToMenu) {
            goToToggle.click();
        }
    }
    
    takeSnapshot() {
        // Trigger screenshot
        const screenshotBtn = document.getElementById('screenshotBtn');
        if (screenshotBtn) {
            screenshotBtn.click();
        } else if (this.chart.screenshotManager) {
            this.chart.screenshotManager.showScreenshotOptions();
        }
    }
    
    resetChart() {
        if (this.chart.jumpToLatest) {
            this.chart.jumpToLatest();
        } else {
            this.chart.candleWidth = 8;
            this.chart.priceZoom = 1;
            this.chart.priceOffset = 0;
            this.chart.offsetX = 0;
            this.chart.autoScale = true;
            this.chart.needsRender = true;
        }
        this.showNotification('Chart Reset', 'mdi-refresh');
    }
    
    // ===== REPLAY CONTROL METHODS =====
    
    /**
     * Check if replay mode is active
     */
    isReplayActive() {
        return this.chart.replaySystem?.isActive || false;
    }
    
    /**
     * Play/Pause replay or reset view if not in replay
     */
    replayPlayPause() {
        if (this.isReplayActive()) {
            const replay = this.chart.replaySystem;
            
            // Toggle play state
            replay.togglePlay();
            
            // Force sync UI after a small delay to ensure state has changed
            setTimeout(() => {
                if (replay.syncPlayPauseUI) {
                    replay.syncPlayPauseUI();
                }
            }, 10);
            
            // Show notification based on current state
            const isPlaying = replay.isPlaying;
            this.showNotification(isPlaying ? '▶ Playing' : '⏸ Paused');
        } else {
            // If not in replay mode, reset view
            this.resetChart();
        }
    }
    
    /**
     * Step forward in replay
     */
    replayStepForward() {
        if (this.isReplayActive()) {
            // Pause if playing
            if (this.chart.replaySystem.isPlaying) {
                this.chart.replaySystem.pause();
            }
            this.chart.replaySystem.stepForward();
            this.showNotification('⏭ Step Forward');
        } else {
            this.showNotification('Replay not active');
        }
    }
    
    /**
     * Step backward in replay
     */
    replayStepBackward() {
        if (this.isReplayActive()) {
            // Pause if playing
            if (this.chart.replaySystem.isPlaying) {
                this.chart.replaySystem.pause();
            }
            this.chart.replaySystem.stepBackward();
            this.showNotification('⏮ Step Backward');
        } else {
            this.showNotification('Replay not active');
        }
    }
    
    invertScale() {
        if (!this.chart.invertedScale) this.chart.invertedScale = false;
        this.chart.invertedScale = !this.chart.invertedScale;
        this.chart.needsRender = true;
        this.showNotification(
            this.chart.invertedScale ? 'Scale Inverted' : 'Scale Normal',
            'mdi-swap-vertical'
        );
    }
    
    toggleLogScale() {
        if (!this.chart.logScale) this.chart.logScale = false;
        this.chart.logScale = !this.chart.logScale;
        this.chart.needsRender = true;
        this.showNotification(
            this.chart.logScale ? 'Logarithmic Scale ON' : 'Logarithmic Scale OFF',
            'mdi-chart-line-variant'
        );
    }
    
    togglePercentScale() {
        if (!this.chart.percentScale) this.chart.percentScale = false;
        this.chart.percentScale = !this.chart.percentScale;
        this.chart.needsRender = true;
        this.showNotification(
            this.chart.percentScale ? 'Percent Scale ON' : 'Percent Scale OFF',
            'mdi-percent'
        );
    }
    
    toggleAutoScale() {
        this.chart.autoScale = !this.chart.autoScale;
        if (this.chart.autoScale) {
            this.chart.priceOffset = 0;
            this.chart.priceZoom = 1;
        }
        this.chart.needsRender = true;
        this.showNotification(
            this.chart.autoScale ? 'Auto Scale ON' : 'Auto Scale OFF',
            'mdi-arrow-expand-vertical'
        );
    }
    
    toggleKeyboardNavigation() {
        // Toggle focused keyboard navigation mode
        this.showNotification('Keyboard Navigation', 'mdi-keyboard');
    }
    
    cancelAction() {
        // Cancel current drawing or deselect
        if (this.chart.drawingManager) {
            if (this.chart.drawingManager.drawingState?.isDrawing) {
                this.chart.drawingManager.cancelDrawing?.();
            } else {
                this.chart.drawingManager.deselectAll?.();
                this.chart.drawingManager.clearTool?.();
            }
        }
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const cursorBtn = document.getElementById('cursorTool');
        if (cursorBtn) cursorBtn.classList.add('active');
        
        // Hide any open menus
        this.chart.hideContextMenu?.();
    }
    
    deleteSelected() {
        if (this.chart.drawingManager?.selectedDrawing) {
            this.chart.drawingManager.deleteDrawing(this.chart.drawingManager.selectedDrawing);
        }
    }
    
    unlockAllDrawings() {
        if (this.chart.drawingManager?.drawings) {
            let unlockedCount = 0;
            this.chart.drawingManager.drawings.forEach(d => {
                if (d.locked) {
                    d.locked = false;
                    unlockedCount++;
                }
            });
            if (unlockedCount > 0) {
                this.showNotification(`Unlocked ${unlockedCount} drawing(s)`, 'mdi-lock-open');
                this.chart.scheduleRender?.() || (this.chart.needsRender = true);
            }
        }
    }
    
    toggleMagnetMode() {
        let mode = 'off';
        if (this.chart.drawingManager) {
            mode = this.chart.drawingManager.toggleMagnetMode();
            this.chart.magnetMode = mode;
        } else {
            // Cycle through modes: off -> weak -> strong -> off
            const currentMode = this.chart.magnetMode || 'off';
            const modes = ['off', 'weak', 'strong'];
            const currentIndex = modes.indexOf(currentMode);
            mode = modes[(currentIndex + 1) % modes.length];
            this.chart.magnetMode = mode;
        }
        this.chart.syncMagnetButton?.();
        
        // Display appropriate notification
        const modeLabels = {
            'off': 'Magnet Mode OFF',
            'weak': 'Weak Magnet Mode',
            'strong': 'Strong Magnet Mode'
        };
        this.showNotification(modeLabels[mode] || 'Magnet Mode OFF', 'mdi-magnet');
    }
    
    jumpToLatest() {
        if (this.chart.jumpToLatest) {
            this.chart.jumpToLatest();
        }
    }
    
    jumpToStart() {
        if (this.chart.data && this.chart.data.length > 0) {
            const m = this.chart.margin;
            const candleSpacing = this.chart.getCandleSpacing ? 
                this.chart.getCandleSpacing() : (this.chart.candleWidth + 2);
            
            // Move to show first candles
            this.chart.offsetX = candleSpacing * 5;
            this.chart.constrainPan?.();
            this.chart.scheduleRender?.() || (this.chart.needsRender = true);
        }
    }
    
    resetView() {
        if (this.chart.resetView) {
            this.chart.resetView();
        } else {
            this.resetChart();
        }
    }
    
    showShortcutsHelp() {
        this.createShortcutsModal();
    }
    
    // ===== HELPER METHODS =====
    
    saveDrawings() {
        const storageKey = `chart_drawings_${this.chart.currentFileId || 'default'}`;
        localStorage.setItem(storageKey, JSON.stringify(this.chart.drawings || []));
    }
    
    showSymbolSearchIndicator(text) {
        let indicator = document.getElementById('symbolSearchIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'symbolSearchIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(26, 29, 40, 0.95);
                border: 1px solid #2962ff;
                border-radius: 8px;
                padding: 16px 24px;
                color: #fff;
                font-size: 24px;
                font-weight: 600;
                z-index: 100000;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            `;
            document.body.appendChild(indicator);
        }
        indicator.textContent = text;
        indicator.style.display = 'block';
    }
    
    hideSymbolSearchIndicator() {
        const indicator = document.getElementById('symbolSearchIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    showIntervalIndicator(text) {
        let indicator = document.getElementById('intervalIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'intervalIndicator';
            indicator.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(26, 29, 40, 0.95);
                border: 1px solid #ff9800;
                border-radius: 8px;
                padding: 16px 24px;
                color: #fff;
                font-size: 24px;
                font-weight: 600;
                z-index: 100000;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            `;
            document.body.appendChild(indicator);
        }
        indicator.innerHTML = `<span style="color: #787b86;">Timeframe:</span> ${text}`;
        indicator.style.display = 'block';
    }
    
    hideIntervalIndicator() {
        const indicator = document.getElementById('intervalIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    executeSymbolSearch(symbol) {
        console.log(`🔍 Searching for symbol: ${symbol}`);
        // Could implement actual symbol search here
        // For now, show notification
        this.showNotification(`Search: ${symbol}`, 'mdi-magnify');
    }
    
    executeIntervalChange(interval) {
        console.log(`⏱️ Changing interval to: ${interval}`);
        
        // Map common interval inputs to timeframes
        const timeframeMap = {
            '1': '1m',
            '5': '5m',
            '15': '15m',
            '30': '30m',
            '60': '1h',
            '240': '4h',
            '1440': '1D',
            '10080': '1W',
            // Common shortcuts
            '1m': '1m',
            '5m': '5m',
            '15m': '15m',
            '1h': '1h',
            '4h': '4h',
            '1d': '1D',
            '1w': '1W'
        };
        
        const mappedTimeframe = timeframeMap[interval.toLowerCase()] || interval;
        
        // Try to click the timeframe button
        const tfBtn = document.querySelector(`[data-timeframe="${mappedTimeframe}"]`);
        if (tfBtn) {
            tfBtn.click();
        } else {
            this.showNotification(`Timeframe: ${interval}`, 'mdi-clock-outline');
        }
    }
    
    showNotification(message, icon = 'mdi-information') {
        // Create temporary notification
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
        
        // Hide after 1.5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 1500);
    }
    
    /**
     * Create and show the shortcuts help modal
     */
    createShortcutsModal() {
        // Remove existing modal
        const existingModal = document.getElementById('shortcutsHelpModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'shortcutsHelpModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            backdrop-filter: blur(4px);
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #1a1d28;
            border-radius: 12px;
            max-width: 800px;
            width: 90%;
            max-height: 85vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid #2a2e39;
        `;
        
        content.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #2a2e39; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; color: #fff; font-size: 18px; display: flex; align-items: center; gap: 10px;">
                    ⌨️ Keyboard Shortcuts
                </h2>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button id="editShortcutsBtn" style="
                        background: #2962ff;
                        border: none;
                        color: #fff;
                        font-size: 12px;
                        cursor: pointer;
                        padding: 8px 16px;
                        border-radius: 6px;
                        font-weight: 500;
                        transition: all 0.2s;
                    ">Edit Shortcuts</button>
                    <button id="closeShortcutsModal" style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #787b86;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 4px 10px;
                        border-radius: 6px;
                        transition: all 0.2s;
                    ">×</button>
                </div>
            </div>
            <div style="padding: 20px; overflow-y: auto; max-height: calc(85vh - 80px);">
                ${this.generateShortcutsTable()}
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close handlers
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.getElementById('closeShortcutsModal').onclick = () => modal.remove();
        
        // Edit button handler
        document.getElementById('editShortcutsBtn').onclick = () => {
            modal.remove();
            this.showEditShortcutsModal();
        };
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    /**
     * Show edit shortcuts modal
     */
    showEditShortcutsModal() {
        const existingModal = document.getElementById('editShortcutsModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'editShortcutsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            backdrop-filter: blur(4px);
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #1a1d28;
            border-radius: 12px;
            max-width: 600px;
            width: 90%;
            max-height: 85vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid #2a2e39;
        `;
        
        content.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #2a2e39; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; color: #fff; font-size: 18px;">Edit Keyboard Shortcuts</h2>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button id="resetAllShortcutsBtn" style="
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        color: #ef4444;
                        font-size: 12px;
                        cursor: pointer;
                        padding: 8px 12px;
                        border-radius: 6px;
                        transition: all 0.2s;
                    ">Reset All</button>
                    <button id="closeEditModal" style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        color: #787b86;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 4px 10px;
                        border-radius: 6px;
                    ">×</button>
                </div>
            </div>
            <div style="padding: 16px; color: #787b86; font-size: 13px; border-bottom: 1px solid #2a2e39;">
                Click on a shortcut to change it. Press the new key combination, then press Enter to confirm or Escape to cancel.
            </div>
            <div id="shortcutsList" style="padding: 20px; overflow-y: auto; max-height: calc(85vh - 160px);">
                ${this.generateEditableShortcutsList()}
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close handlers
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.getElementById('closeEditModal').onclick = () => modal.remove();
        
        // Reset all button
        document.getElementById('resetAllShortcutsBtn').onclick = () => {
            if (confirm('Reset all shortcuts to defaults?')) {
                this.resetAllShortcuts();
                document.getElementById('shortcutsList').innerHTML = this.generateEditableShortcutsList();
                this.bindShortcutEditHandlers();
            }
        };
        
        // Bind edit handlers
        this.bindShortcutEditHandlers();
        
        const handleEsc = (e) => {
            if (e.key === 'Escape' && !this.isEditingShortcut) {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    /**
     * Generate editable shortcuts list
     */
    generateEditableShortcutsList() {
        const editableShortcuts = [
            { id: 'moveLeft', action: 'Move chart left', defaultKey: '←', category: 'Navigation' },
            { id: 'moveRight', action: 'Move chart right', defaultKey: '→', category: 'Navigation' },
            { id: 'zoomIn', action: 'Zoom in', defaultKey: '+', category: 'Zoom' },
            { id: 'zoomOut', action: 'Zoom out', defaultKey: '-', category: 'Zoom' },
            { id: 'undo', action: 'Undo', defaultKey: 'Ctrl+Z', category: 'Edit' },
            { id: 'redo', action: 'Redo', defaultKey: 'Ctrl+Y', category: 'Edit' },
            { id: 'delete', action: 'Delete selected', defaultKey: 'Delete', category: 'Edit' },
            { id: 'escape', action: 'Cancel / Deselect', defaultKey: 'Escape', category: 'Edit' },
            { id: 'openIndicators', action: 'Open indicators', defaultKey: '/', category: 'Quick Actions' },
            { id: 'quickSearch', action: 'Quick Search', defaultKey: 'Ctrl+K', category: 'Quick Actions' },
            { id: 'saveLayout', action: 'Save chart layout', defaultKey: 'Ctrl+S', category: 'Quick Actions' },
            { id: 'loadLayout', action: 'Load chart layout', defaultKey: 'Ctrl+L', category: 'Quick Actions' },
            { id: 'snapshot', action: 'Take snapshot', defaultKey: 'Alt+S', category: 'Chart' },
            { id: 'resetChart', action: 'Reset chart', defaultKey: 'Alt+R', category: 'Chart' },
            { id: 'goToDate', action: 'Go to date', defaultKey: 'Alt+G', category: 'Chart' },
            { id: 'toggleMagnet', action: 'Toggle magnet mode', defaultKey: 'M', category: 'Drawing' },
            { id: 'playPause', action: 'Play/Pause replay', defaultKey: 'Space', category: 'Replay' },
            { id: 'stepForward', action: 'Step forward', defaultKey: '.', category: 'Replay' },
            { id: 'stepBackward', action: 'Step backward', defaultKey: ',', category: 'Replay' },
            { id: 'showHelp', action: 'Show shortcuts help', defaultKey: '?', category: 'Help' }
        ];
        
        // Group by category
        const grouped = {};
        for (const shortcut of editableShortcuts) {
            if (!grouped[shortcut.category]) {
                grouped[shortcut.category] = [];
            }
            grouped[shortcut.category].push(shortcut);
        }
        
        let html = '';
        for (const [category, shortcuts] of Object.entries(grouped)) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #2962ff; font-size: 13px; margin: 0 0 12px 0; font-weight: 600;">${category}</h3>
                    ${shortcuts.map(s => {
                        const currentKey = this.customShortcuts[s.id] || s.defaultKey;
                        const isCustom = this.customShortcuts[s.id] ? true : false;
                        return `
                            <div class="shortcut-edit-row" data-id="${s.id}" data-default="${s.defaultKey}" style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                padding: 10px 12px;
                                background: rgba(255, 255, 255, 0.02);
                                border: 1px solid #2a2e39;
                                border-radius: 6px;
                                margin-bottom: 8px;
                                cursor: pointer;
                                transition: all 0.15s;
                            ">
                                <span style="color: #d1d4dc; font-size: 13px;">${s.action}</span>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span class="shortcut-key-display" style="
                                        padding: 6px 12px;
                                        background: ${isCustom ? 'rgba(41, 98, 255, 0.15)' : '#2a2e39'};
                                        border: 1px solid ${isCustom ? '#2962ff' : '#3a3e49'};
                                        border-radius: 4px;
                                        color: #d1d4dc;
                                        font-size: 12px;
                                        font-family: monospace;
                                        min-width: 60px;
                                        text-align: center;
                                    ">${currentKey}</span>
                                    ${isCustom ? `<button class="reset-shortcut-btn" data-id="${s.id}" style="
                                        background: none;
                                        border: none;
                                        color: #787b86;
                                        cursor: pointer;
                                        padding: 4px;
                                        font-size: 14px;
                                    " title="Reset to default">↺</button>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        return html;
    }
    
    /**
     * Bind handlers for shortcut editing
     */
    bindShortcutEditHandlers() {
        this.isEditingShortcut = false;
        
        document.querySelectorAll('.shortcut-edit-row').forEach(row => {
            row.onclick = (e) => {
                if (e.target.classList.contains('reset-shortcut-btn')) return;
                this.startEditingShortcut(row);
            };
        });
        
        document.querySelectorAll('.reset-shortcut-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.resetShortcut(id);
                document.getElementById('shortcutsList').innerHTML = this.generateEditableShortcutsList();
                this.bindShortcutEditHandlers();
            };
        });
    }
    
    /**
     * Start editing a shortcut
     */
    startEditingShortcut(row) {
        const id = row.dataset.id;
        const keyDisplay = row.querySelector('.shortcut-key-display');
        const originalKey = keyDisplay.textContent;
        
        this.isEditingShortcut = true;
        
        // Highlight the row
        row.style.border = '1px solid #2962ff';
        row.style.background = 'rgba(41, 98, 255, 0.1)';
        keyDisplay.textContent = 'Press keys...';
        keyDisplay.style.background = '#2962ff';
        keyDisplay.style.color = '#fff';
        
        let pressedKeys = [];
        
        const keyHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.key === 'Escape') {
                // Cancel editing
                cleanup();
                keyDisplay.textContent = originalKey;
                return;
            }
            
            if (e.key === 'Enter' && pressedKeys.length > 0) {
                // Save the new shortcut
                const newKey = pressedKeys.join('+');
                this.updateShortcut(id, newKey);
                cleanup();
                document.getElementById('shortcutsList').innerHTML = this.generateEditableShortcutsList();
                this.bindShortcutEditHandlers();
                return;
            }
            
            // Build key combination
            pressedKeys = [];
            if (e.ctrlKey || e.metaKey) pressedKeys.push('Ctrl');
            if (e.altKey) pressedKeys.push('Alt');
            if (e.shiftKey) pressedKeys.push('Shift');
            
            // Add the main key
            if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
                let keyName = e.key;
                // Format special keys
                if (keyName === ' ') keyName = 'Space';
                if (keyName === 'ArrowLeft') keyName = '←';
                if (keyName === 'ArrowRight') keyName = '→';
                if (keyName === 'ArrowUp') keyName = '↑';
                if (keyName === 'ArrowDown') keyName = '↓';
                pressedKeys.push(keyName.length === 1 ? keyName.toUpperCase() : keyName);
            }
            
            if (pressedKeys.length > 0) {
                keyDisplay.textContent = pressedKeys.join('+');
            }
        };
        
        const cleanup = () => {
            document.removeEventListener('keydown', keyHandler, true);
            this.isEditingShortcut = false;
            row.style.border = '1px solid #2a2e39';
            row.style.background = 'rgba(255, 255, 255, 0.02)';
            keyDisplay.style.background = '#2a2e39';
            keyDisplay.style.color = '#d1d4dc';
        };
        
        document.addEventListener('keydown', keyHandler, true);
    }
    
    /**
     * Generate shortcuts table HTML
     */
    generateShortcutsTable() {
        const categories = {
            'Navigation': [
                { action: 'Move chart 1 bar to the left', shortcut: '←' },
                { action: 'Move chart 1 bar to the right', shortcut: '→' },
                { action: 'Move further to the left', shortcut: 'Ctrl + ←' },
                { action: 'Move further to the right', shortcut: 'Ctrl + →' },
                { action: 'Move chart left/right', shortcut: 'Shift + Mouse wheel' },
                { action: 'Jump to latest candles', shortcut: 'Home' },
                { action: 'Jump to start of data', shortcut: 'End' }
            ],
            'Zoom': [
                { action: 'Zoom in', shortcut: 'Ctrl + ↑ or +' },
                { action: 'Zoom out', shortcut: 'Ctrl + ↓ or -' },
                { action: 'Zoom in focused area', shortcut: 'Ctrl + Mouse wheel' },
                { action: 'Reset view/zoom', shortcut: 'Space' }
            ],
            'Quick Actions': [
                { action: 'Open Quick Search', shortcut: 'Ctrl + K' },
                { action: 'Open indicators', shortcut: '/' },
                { action: 'Load chart layout', shortcut: 'Ctrl + L' },
                { action: 'Save chart layout', shortcut: 'Ctrl + S' },
                { action: 'Change symbol', shortcut: 'Start typing a symbol name' },
                { action: 'Change interval', shortcut: 'Type timeframe (1, 5, 15, 60, D, W)' }
            ],
            'Edit': [
                { action: 'Undo', shortcut: 'Ctrl + Z' },
                { action: 'Redo', shortcut: 'Ctrl + Y' },
                { action: 'Delete selected', shortcut: 'Delete / Backspace' },
                { action: 'Cancel / Deselect', shortcut: 'Escape' },
                { action: 'Unlock all drawings', shortcut: 'Ctrl + U' },
                { action: 'Toggle magnet mode', shortcut: 'M' }
            ],
            'Chart Settings': [
                { action: 'Go to date', shortcut: 'Alt + G' },
                { action: 'Take snapshot', shortcut: 'Alt + S' },
                { action: 'Reset chart', shortcut: 'Alt + R' },
                { action: 'Invert series scale', shortcut: 'Alt + I' },
                { action: 'Toggle logarithmic scale', shortcut: 'Alt + L' },
                { action: 'Toggle percent scale', shortcut: 'Alt + P' },
                { action: 'Toggle auto scale', shortcut: 'Alt + A' }
            ],
            'Replay Mode': [
                { action: 'Play/Pause (or reset view)', shortcut: 'Space' },
                { action: 'Step forward', shortcut: 'Shift + → or .' },
                { action: 'Step backward', shortcut: 'Shift + ← or ,' }
            ],
            'Help': [
                { action: 'Show keyboard shortcuts', shortcut: '?' }
            ]
        };
        
        let html = '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">';
        
        for (const [category, shortcuts] of Object.entries(categories)) {
            html += `
                <div>
                    <h3 style="color: #2962ff; font-size: 14px; margin: 0 0 12px 0; font-weight: 600;">
                        ${category}
                    </h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        ${shortcuts.map(s => `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 8px 0; color: #d1d4dc; font-size: 13px;">
                                    ${s.action}
                                </td>
                                <td style="padding: 8px 0; text-align: right;">
                                    ${this.formatShortcut(s.shortcut)}
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }
    
    /**
     * Format shortcut key for display
     */
    formatShortcut(shortcut) {
        // Handle text-only descriptions
        if (shortcut.includes('typing') || shortcut.includes('Mouse')) {
            return `<span style="color: #787b86; font-size: 12px; font-style: italic;">${shortcut}</span>`;
        }
        
        // Split by + and format each key
        const keys = shortcut.split(' + ');
        return keys.map(key => {
            // Special key styling
            const keyStyle = `
                display: inline-block;
                padding: 4px 8px;
                background: #2a2e39;
                border: 1px solid #3a3e49;
                border-radius: 4px;
                color: #d1d4dc;
                font-size: 12px;
                font-family: monospace;
                margin: 0 2px;
            `;
            return `<span style="${keyStyle}">${key.trim()}</span>`;
        }).join('<span style="color: #787b86; margin: 0 2px;">+</span>');
    }
}

// Auto-initialize when chart is ready
if (typeof window !== 'undefined') {
    window.KeyboardShortcutsManager = KeyboardShortcutsManager;
}
