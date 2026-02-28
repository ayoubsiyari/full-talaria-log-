/**
 * Object Tree Manager
 * Manages the right sidebar object tree for viewing and managing all drawing objects
 */

class ObjectTreeManager {
    constructor(drawingManager) {
        this.drawingManager = drawingManager;
        this.panel = document.getElementById('objectTreePanel');
        this.iconBtn = document.getElementById('objectTreeIconBtn') || document.querySelector('.right-sidebar-icon-btn[data-panel="objectTree"]');
        this.listContainer = document.getElementById('objectTreeList');
        this.isVisible = false;
        this.currentPanel = null;
        
        this.init();
    }

    /**
     * Initialize the object tree
     */
    init() {
        console.log('🔧 Initializing Object Tree Manager...');
        console.log('Panel element:', this.panel);
        console.log('Icon button element:', this.iconBtn);
        console.log('List container:', this.listContainer);
        
        this.setupEventListeners();
        console.log('✅ Object Tree Manager initialized');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Icon button in right sidebar
        if (this.iconBtn) {
            console.log('✅ Setting up icon button listener');
            this.iconBtn.addEventListener('click', (e) => {
                console.log('🖱️ Icon button clicked!');
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            });
        } else {
            console.warn('⚠️ Icon button not found!');
        }
        
        // Close panel when clicking on chart area
        const chartCanvas = document.getElementById('chartCanvas');
        const drawingSvg = document.getElementById('drawingSvg');
        
        const closeOnChartClick = (e) => {
            if (this.isVisible && this.panel && !this.panel.contains(e.target)) {
                // Check if click is not on sidebar icons
                const sidebar = document.querySelector('.right-sidebar-icons');
                if (!sidebar || !sidebar.contains(e.target)) {
                    this.hide();
                }
            }
        };
        
        if (chartCanvas) {
            chartCanvas.addEventListener('click', closeOnChartClick);
        }
        if (drawingSvg) {
            drawingSvg.addEventListener('click', closeOnChartClick);
        }
        
        // Also close on mousedown for immediate response
        document.addEventListener('mousedown', (e) => {
            if (this.isVisible && this.panel && !this.panel.contains(e.target)) {
                const sidebar = document.querySelector('.right-sidebar-icons');
                const rightSidebar = document.querySelector('.right-sidebar');
                if ((!sidebar || !sidebar.contains(e.target)) && 
                    (!rightSidebar || !rightSidebar.contains(e.target))) {
                    this.hide();
                }
            }
        });

        // Legacy toolbar button (if exists)
        const toggleBtn = document.getElementById('toggleObjectTree');
        if (toggleBtn) {
            console.log('✅ Setting up legacy toolbar button listener');
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Close button
        const closeBtn = document.getElementById('closeObjectTree');
        if (closeBtn) {
            console.log('✅ Setting up close button listener');
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // Setup all right sidebar icon buttons
        const iconButtons = document.querySelectorAll('.right-sidebar-icon-btn');
        console.log(`Found ${iconButtons.length} icon buttons`);
        iconButtons.forEach((btn, index) => {
            const panelId = btn.dataset.panel;
            console.log(`  Button ${index}: ${panelId}`);
            btn.addEventListener('click', (e) => {
                console.log(`🖱️ Sidebar button clicked: ${panelId}`);
                if (panelId === 'objectTree') {
                    this.toggle();
                } else {
                    // Future panels - just show placeholder
                    console.log(`Panel "${panelId}" not yet implemented`);
                }
            });
        });

        // Tab switching
        const tabs = document.querySelectorAll('.object-tree-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Toolbar actions
        document.getElementById('showAllObjects')?.addEventListener('click', () => {
            this.showAllObjects();
        });

        document.getElementById('hideAllObjects')?.addEventListener('click', () => {
            this.hideAllObjects();
        });

        document.getElementById('deleteAllObjects')?.addEventListener('click', () => {
            this.deleteAllObjects();
        });
    }

    /**
     * Toggle sidebar visibility
     */
    toggle() {
        console.log('🔄 Toggle called, current state:', this.isVisible);
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Show the panel
     */
    show() {
        console.log('📊 Opening Object Tree panel...');
        
        // Hide all other panels first
        document.querySelectorAll('.right-sidebar-panel').forEach(p => {
            p.classList.remove('visible');
        });
        
        // Remove active state from all icon buttons
        document.querySelectorAll('.right-sidebar-icon-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show this panel (it will slide in as an overlay)
        this.panel.classList.add('visible');
        this.iconBtn.classList.add('active');
        this.isVisible = true;
        
        this.refresh();
        console.log('✅ Object Tree panel opened');
    }

    /**
     * Hide the panel
     */
    hide() {
        console.log('📊 Closing Object Tree panel...');
        
        this.panel.classList.remove('visible');
        this.iconBtn.classList.remove('active');
        this.isVisible = false;
        
        console.log('✅ Object Tree panel closed');
    }

    /**
     * Refresh the object list
     */
    refresh() {
        console.log('🔄 Refreshing object tree...');
        
        if (!this.drawingManager || !this.drawingManager.drawings) {
            console.log('⚠️ No drawing manager or drawings array');
            this.showEmptyState();
            return;
        }

        const drawings = this.drawingManager.drawings;
        console.log(`📝 Found ${drawings.length} drawings`);
        
        if (drawings.length === 0) {
            this.showEmptyState();
            return;
        }

        // Group drawings by type
        const grouped = this.groupDrawingsByType(drawings);
        
        // Clear list
        this.listContainer.innerHTML = '';
        
        // Render grouped items
        Object.keys(grouped).forEach(type => {
            const items = grouped[type];
            
            // Add category header
            const category = document.createElement('div');
            category.className = 'object-tree-category';
            category.textContent = this.formatTypeName(type) + ` (${items.length})`;
            this.listContainer.appendChild(category);
            
            // Add items
            items.forEach((drawing, index) => {
                const item = this.createObjectItem(drawing, index);
                this.listContainer.appendChild(item);
            });
        });
    }

    /**
     * Group drawings by type
     */
    groupDrawingsByType(drawings) {
        const grouped = {};
        
        drawings.forEach(drawing => {
            const type = drawing.type || 'unknown';
            if (!grouped[type]) {
                grouped[type] = [];
            }
            grouped[type].push(drawing);
        });
        
        return grouped;
    }

    /**
     * Format type name for display
     */
    formatTypeName(type) {
        const names = {
            'trendline': 'Trend Lines',
            'horizontal': 'Horizontal Lines',
            'vertical': 'Vertical Lines',
            'ray': 'Rays',
            'rectangle': 'Rectangles',
            'ellipse': 'Ellipses',
            'triangle': 'Triangles',
            'arrow': 'Arrows',
            'label': 'Labels',
            'text': 'Text',
            'notebox': 'Note Boxes',
            'fibonacci-retracement': 'Fibonacci Retracements',
            'fibonacci-extension': 'Fibonacci Extensions',
            'ruler': 'Rulers',
            'long-position': 'Long Positions',
            'short-position': 'Short Positions',
            'path': 'Paths',
            'polyline': 'Polylines',
            'brush': 'Brushes',
            'emoji': 'Emojis',
            'gann-box': 'Gann Boxes',
            'anchored-vwap': 'Anchored VWAPs',
            'volume-profile': 'Volume Profiles'
        };
        
        return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }

    /**
     * Create an object tree item
     */
    createObjectItem(drawing, index) {
        const item = document.createElement('div');
        item.className = 'object-tree-item';
        item.dataset.drawingId = drawing.id;
        
        // Check if selected
        if (this.drawingManager.selectedDrawing === drawing) {
            item.classList.add('selected');
        }
        
        // Icon
        const icon = document.createElement('div');
        icon.className = 'object-tree-icon';
        icon.innerHTML = this.getIconForType(drawing.type);
        item.appendChild(icon);
        
        // Label
        const label = document.createElement('div');
        label.className = 'object-tree-label';
        label.textContent = this.getDrawingLabel(drawing, index);
        item.appendChild(label);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'object-tree-actions';

        // Jump to shape button
        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'object-tree-action-btn jump-to';
        jumpBtn.title = 'Jump to shape';
        jumpBtn.setAttribute('aria-label', 'Jump to shape');
        jumpBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
        </svg>`;
        jumpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.jumpToDrawing(drawing);
        });
        actions.appendChild(jumpBtn);

        
        // Visibility toggle
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'object-tree-action-btn';
        visibilityBtn.title = drawing.visible === false ? 'Show' : 'Hide';
        visibilityBtn.innerHTML = drawing.visible === false ? 
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>`;
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDrawingVisibility(drawing);
        });
        actions.appendChild(visibilityBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'object-tree-action-btn delete';
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteDrawing(drawing);
        });
        actions.appendChild(deleteBtn);
        
        item.appendChild(actions);
        
        // Click to select
        item.addEventListener('click', () => {
            this.selectDrawing(drawing);
        });
        
        return item;
    }

    /**
     * Get icon SVG for drawing type
     */
    getIconForType(type) {
        const icons = {
            'trendline': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>',
            'horizontal': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>',
            'vertical': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/></svg>',
            'ray': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2" fill="currentColor"/></svg>',
            'rectangle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="14" height="10" rx="1"/></svg>',
            'ellipse': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
            'triangle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4 L20 20 L4 20 Z"/></svg>',
            'arrow': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
            'label': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
            'text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
            'notebox': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            'fibonacci-retracement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20 L21 4"/><line x1="3" y1="8" x2="21" y2="8" opacity="0.5"/><line x1="3" y1="12" x2="21" y2="12" opacity="0.5"/><line x1="3" y1="16" x2="21" y2="16" opacity="0.5"/></svg>',
            'fibonacci-extension': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20 L12 12 L21 4"/><line x1="3" y1="8" x2="21" y2="8" opacity="0.5"/><line x1="3" y1="16" x2="21" y2="16" opacity="0.5"/></svg>',
            'ruler': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 3 L3 21"/><line x1="8" y1="8" x2="10" y2="10"/><line x1="14" y1="14" x2="16" y2="16"/></svg>',
            'long-position': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/><line x1="12" y1="9" x2="12" y2="21"/></svg>',
            'short-position': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
            'path': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="2 15 6 8 10 14 14 6 18 12 22 9"/></svg>',
            'polyline': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 18 8 10 12 14 16 6 20 12"/></svg>',
            'brush': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.06 11.9l8.07-8.06a1.5 1.5 0 0 1 2.12 0l.71.71a1.5 1.5 0 0 1 0 2.12l-8.07 8.06a4 4 0 1 1-2.83-2.83z"/></svg>',
            'emoji': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
            'gann-box': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="3" x2="21" y2="21"/><line x1="21" y1="3" x2="3" y2="21"/></svg>',
            'anchored-vwap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12 Q 6 8, 12 12 T 21 12"/><circle cx="3" cy="12" r="2" fill="currentColor"/></svg>',
            'volume-profile': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="3" height="16"/><rect x="9" y="8" width="3" height="12"/><rect x="14" y="6" width="3" height="14"/><rect x="19" y="10" width="3" height="10"/></svg>'
        };
        
        return icons[type] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
    }

    /**
     * Get label for drawing
     */
    getDrawingLabel(drawing, index) {
        // If drawing has a custom name, use it
        if (drawing.name) {
            return drawing.name;
        }
        
        // If drawing has a custom label/text, use it
        if (drawing.text) {
            return drawing.text.substring(0, 30) + (drawing.text.length > 30 ? '...' : '');
        }
        
        // Otherwise use type + index
        return this.formatTypeName(drawing.type);
    }

    /**
     * Update drawing name in object tree
     */
    updateDrawingName(drawing, newName) {
        drawing.name = newName;
        this.refresh();
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        this.listContainer.innerHTML = `
            <div class="object-tree-empty">
                <svg class="object-tree-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                </svg>
                <div>No drawing objects</div>
                <div style="font-size: 12px; color: #565c6d; margin-top: 4px;">
                    Start drawing to see objects here
                </div>
            </div>
        `;
    }

    /**
     * Select a drawing
     */
    selectDrawing(drawing) {
        if (this.drawingManager && typeof this.drawingManager.selectDrawing === 'function') {
            this.drawingManager.selectDrawing(drawing);
            this.refresh();
        }
    }

    /**
     * Jump chart viewport to a drawing and select it
     */
    jumpToDrawing(drawing) {
        if (!drawing) return;

        this.selectDrawing(drawing);

        const chart = this.drawingManager ? this.drawingManager.chart : null;
        const points = Array.isArray(drawing.points) ? drawing.points : null;
        if (!chart || !points || points.length === 0) {
            return;
        }

        const validPoints = points.filter(point =>
            point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
        );

        if (validPoints.length === 0) {
            return;
        }

        const avgIndex = validPoints.reduce((sum, point) => sum + Number(point.x), 0) / validPoints.length;
        const avgPrice = validPoints.reduce((sum, point) => sum + Number(point.y), 0) / validPoints.length;
        if (!Number.isFinite(avgIndex)) {
            return;
        }

        const candleSpacing = typeof chart.getCandleSpacing === 'function'
            ? chart.getCandleSpacing()
            : chart.candleWidth;
        const margin = chart.margin || { l: 0, r: 0 };
        const plotWidth = Number(chart.w) - Number(margin.l || 0) - Number(margin.r || 0);

        if (!Number.isFinite(candleSpacing) || candleSpacing <= 0 || !Number.isFinite(plotWidth) || plotWidth <= 0) {
            return;
        }

        const targetIndex = Math.round(avgIndex);
        chart.offsetX = (plotWidth / 2) - (targetIndex * candleSpacing);

        if (typeof chart.constrainOffset === 'function') {
            chart.constrainOffset();
        }

        // Keep autoscale behavior unchanged; only center price when user already disabled autoscale.
        if (chart.autoScale === false && Number.isFinite(avgPrice) && typeof chart.centerOnPrice === 'function') {
            chart.centerOnPrice(avgPrice);
            return;
        }

        if (typeof chart.scheduleRender === 'function') {
            chart.scheduleRender();
        }
    }

    /**
     * Toggle drawing visibility
     */
    toggleDrawingVisibility(drawing) {
        if (!drawing) return;
        
        drawing.visible = drawing.visible === false ? true : false;
        
        // Update the drawing
        if (this.drawingManager && typeof this.drawingManager.renderDrawing === 'function') {
            this.drawingManager.renderDrawing(drawing);
            this.drawingManager.saveDrawings();
        }
        
        this.refresh();
    }

    /**
     * Delete a drawing
     */
    deleteDrawing(drawing) {
        if (!drawing) return;
        
        if (this.drawingManager && typeof this.drawingManager.deleteDrawing === 'function') {
            this.drawingManager.deleteDrawing(drawing);
            this.refresh();
        }
    }

    /**
     * Show all objects
     */
    showAllObjects() {
        if (!this.drawingManager || !this.drawingManager.drawings) return;
        
        this.drawingManager.drawings.forEach(drawing => {
            drawing.visible = true;
            this.drawingManager.renderDrawing(drawing);
        });
        
        this.drawingManager.saveDrawings();
        this.refresh();
    }

    /**
     * Hide all objects
     */
    hideAllObjects() {
        if (!this.drawingManager || !this.drawingManager.drawings) return;
        
        this.drawingManager.drawings.forEach(drawing => {
            drawing.visible = false;
            this.drawingManager.renderDrawing(drawing);
        });
        
        this.drawingManager.saveDrawings();
        this.refresh();
    }

    /**
     * Delete all objects
     */
    deleteAllObjects() {
        if (!this.drawingManager) return;
        
        if (confirm('Delete all drawing objects? This cannot be undone.')) {
            this.drawingManager.clearDrawings({ confirmPrompt: false });
            this.refresh();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObjectTreeManager;
}
