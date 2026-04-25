/**
 * Compare Overlay Module
 * Allows overlaying multiple symbols on the same chart like TradingView
 */

class CompareOverlay {
    constructor(chart) {
        this.chart = chart;
        this.overlays = []; // Array of overlay objects
        this.colors = [
            '#FF6B6B', // Red
            '#4ECDC4', // Teal
            '#FFE66D', // Yellow
            '#95E1D3', // Mint
            '#F38181', // Coral
            '#AA96DA', // Purple
            '#FCE38A', // Light Yellow
            '#7FDBDA', // Cyan
        ];
        this.colorIndex = 0;
        // Use same API URL as chart
        this.apiUrl = chart.apiUrl || window.CHART_API_URL || '/api';
        this.availableFiles = [];
        
        console.log('📊 CompareOverlay initialized with API:', this.apiUrl);
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupYAxisDrag();
        this.loadAvailableSymbols();
    }
    
    setupYAxisDrag() {
        const canvas = this.chart.canvas;
        if (!canvas) return;
        
        this.dragState = {
            isDragging: false,
            overlayId: null,
            dragType: null, // 'zoom' for Y-axis, 'move' for chart area
            lastY: 0,
            startY: 0,
            hasMoved: false // Track if mouse moved (drag vs click)
        };
        
        this.selectedOverlay = null; // Currently selected overlay
        
        // Mouse move - handle dragging
        canvas.addEventListener('mousemove', (e) => {
            if (this.overlays.length === 0) return;
            
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const m = this.chart.margin;
            
            // Check if dragging
            if (this.dragState.isDragging) {
                const overlay = this.overlays.find(o => o.id === this.dragState.overlayId);
                if (overlay && overlay.yScale) {
                    const dy = e.clientY - this.dragState.lastY;
                    
                    // Check if mouse has moved enough to be considered a drag (not click)
                    if (Math.abs(e.clientY - this.dragState.startY) > 3) {
                        this.dragState.hasMoved = true;
                    }
                    
                    // Only apply changes if actually dragging
                    if (!this.dragState.hasMoved) return;
                    
                    const effectiveVolumeHeight = this.chart.chartSettings?.showVolume ? 
                        (this.chart.h - m.t - m.b) * this.chart.volumeHeight : 0;
                    const priceAreaHeight = (this.chart.h - m.t - m.b) - effectiveVolumeHeight;
                    
                    if (this.dragState.dragType === 'move') {
                        // Drag from chart: Move overlay position vertically
                        const oldDomain = overlay.yScale.domain();
                        const priceRange = oldDomain[1] - oldDomain[0];
                        const pricePerPixel = priceRange / priceAreaHeight;
                        overlay.priceOffset += dy * pricePerPixel;
                    } else {
                        // Drag from Y-axis: Zoom
                        const sensitivity = 0.005;
                        const zoomFactor = 1 + dy * sensitivity;
                        const newZoom = Math.max(0.5, Math.min(20, overlay.priceZoom * zoomFactor));
                        
                        const oldDomain = overlay.yScale.domain();
                        const oldRange = oldDomain[1] - oldDomain[0];
                        const newRange = oldRange * (overlay.priceZoom / newZoom);
                        const rangeChange = newRange - oldRange;
                        
                        const mouseRatio = (my - m.t) / priceAreaHeight;
                        overlay.priceOffset -= rangeChange * (0.5 - mouseRatio);
                        overlay.priceZoom = newZoom;
                    }
                    
                    this.dragState.lastY = e.clientY;
                    this.chart.render();
                }
                return;
            }
            
            // Check if hovering over any overlay Y-axis
            const hoveredOverlay = this.getOverlayAtPosition(mx, my);
            if (hoveredOverlay) {
                canvas.style.cursor = 'ns-resize';
            }
        });
        
        // Mouse down - start drag
        canvas.addEventListener('mousedown', (e) => {
            if (this.overlays.length === 0) return;
            
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            // Check Y-axis first (for zoom or select)
            const axisOverlay = this.getOverlayAtPosition(mx, my);
            if (axisOverlay) {
                this.dragState.isDragging = true;
                this.dragState.overlayId = axisOverlay.id;
                this.dragState.dragType = 'zoom';
                this.dragState.lastY = e.clientY;
                this.dragState.startY = e.clientY;
                this.dragState.hasMoved = false;
                canvas.style.cursor = 'ns-resize';
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // Check if clicking on selected overlay in chart area (for move)
            if (this.selectedOverlay) {
                const overlay = this.overlays.find(o => o.id === this.selectedOverlay);
                if (overlay && overlay.visible) {
                    const m = this.chart.margin;
                    // Check if in chart area
                    if (mx > m.l && mx < this.chart.w - m.r && my > m.t && my < this.chart.h - m.b) {
                        this.dragState.isDragging = true;
                        this.dragState.overlayId = this.selectedOverlay;
                        this.dragState.dragType = 'move';
                        this.dragState.lastY = e.clientY;
                        canvas.style.cursor = 'grabbing';
                        // Don't stop propagation - allow chart panning too
                    }
                }
            }
        });
        
        // Mouse up - end drag or handle click
        const endDrag = () => {
            if (this.dragState.isDragging) {
                // If Y-axis and didn't move much, it was a click - toggle selection
                if (this.dragState.dragType === 'zoom' && !this.dragState.hasMoved) {
                    const overlayId = this.dragState.overlayId;
                    if (this.selectedOverlay === overlayId) {
                        this.selectedOverlay = null;
                    } else {
                        this.selectedOverlay = overlayId;
                    }
                    this.updateOverlayLegend();
                }
                
                this.dragState.isDragging = false;
                this.dragState.overlayId = null;
                this.dragState.hasMoved = false;
            }
        };
        
        canvas.addEventListener('mouseup', endDrag);
        canvas.addEventListener('mouseleave', endDrag);
        
        // Double-click to reset scale
        canvas.addEventListener('dblclick', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            const overlay = this.getOverlayAtPosition(mx, my);
            if (overlay) {
                overlay.priceZoom = 1.0;
                overlay.priceOffset = 0;
                this.chart.render();
                this.renderActiveOverlays(); // Update UI
            }
        });
    }
    
    getOverlayAtPosition(mx, my) {
        const m = this.chart.margin;
        const effectiveVolumeHeight = this.chart.chartSettings?.showVolume ? 
            (this.chart.h - m.t - m.b) * this.chart.volumeHeight : 0;
        const priceHeight = (this.chart.h - m.t - m.b) - effectiveVolumeHeight;
        
        // Check each visible overlay's Y-axis area (same width as main chart right axis)
        const visibleOverlays = this.overlays.filter(o => o.visible);
        const axisWidth = m.r; // Same as main chart
        for (let i = 0; i < visibleOverlays.length; i++) {
            const axisX = i * axisWidth;
            
            // Check if mouse is within this overlay's Y-axis area
            if (mx >= axisX && mx <= axisX + axisWidth && 
                my >= m.t && my <= m.t + priceHeight) {
                return visibleOverlays[i];
            }
        }
        return null;
    }
    
    setupEventListeners() {
        // Compare button
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => this.openModal());
        }
        
        // Modal close button
        const closeBtn = document.getElementById('compareModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }
        
        // Modal overlay click to close
        const modalOverlay = document.getElementById('compareModalOverlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeModal();
                }
            });
        }
        
        // Search input
        const searchInput = document.getElementById('compareSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterSymbols(e.target.value));
        }
        
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeSettingsPopup();
                this.closePaneSettingsPopup();
            }
        });
        
        // Initialize settings popup
        this.initSettingsPopup();
        
        // Initialize pane settings popup
        this.initPaneSettingsPopup();
    }
    
    async loadAvailableSymbols() {
        try {
            console.log('📊 Loading available symbols from:', `${this.apiUrl}/files`);
            const response = await fetch(`${this.apiUrl}/files`);
            if (response.ok) {
                const data = await response.json();
                this.availableFiles = data.files || [];
                console.log('📊 Available files for compare:', this.availableFiles.length);
                this.renderSymbolsList();
            } else {
                console.warn('📊 Failed to load files:', response.status);
            }
        } catch (error) {
            console.warn('📊 Could not load available symbols:', error);
            this.availableFiles = [];
        }
    }
    
    openModal() {
        console.log('📊 Opening compare modal');
        const modal = document.getElementById('compareModalOverlay');
        if (modal) {
            modal.classList.add('open');
            console.log('📊 Modal opened, available files:', this.availableFiles.length);
            this.renderSymbolsList();
            this.renderActiveOverlays();
            
            // Focus search input
            const searchInput = document.getElementById('compareSearchInput');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
        }
        
        // Update button state
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn && this.overlays.length > 0) {
            compareBtn.classList.add('active');
        }
    }
    
    closeModal() {
        const modal = document.getElementById('compareModalOverlay');
        if (modal) {
            modal.classList.remove('open');
        }
    }
    
    openSettingsPopup(overlayId) {
        const overlay = this.overlays.find(o => o.id === overlayId);
        if (!overlay) return;
        
        this.editingOverlayId = overlayId;
        
        const popup = document.getElementById('overlaySettingsPopup');
        if (!popup) return;
        
        // Set title
        document.getElementById('overlaySettingsTitle').textContent = overlay.symbol;
        
        // Set values
        document.getElementById('overlayStyleSelect').value = overlay.displayType;
        
        // Candle colors (swatches)
        this.setSwatchColor('overlayBodyUp', overlay.bodyUpColor);
        this.setSwatchColor('overlayBodyDown', overlay.bodyDownColor);
        this.setSwatchColor('overlayBorderUp', overlay.borderUpColor);
        this.setSwatchColor('overlayBorderDown', overlay.borderDownColor);
        this.setSwatchColor('overlayWickUp', overlay.wickUpColor);
        this.setSwatchColor('overlayWickDown', overlay.wickDownColor);
        
        // Checkboxes
        document.getElementById('overlayShowBody').checked = overlay.showBody;
        document.getElementById('overlayShowBorder').checked = overlay.showBorder;
        document.getElementById('overlayShowWick').checked = overlay.showWick;
        document.getElementById('overlayShowPriceLine').checked = overlay.showPriceLine;
        
        popup.classList.add('open');
    }
    
    closeSettingsPopup() {
        const popup = document.getElementById('overlaySettingsPopup');
        if (popup) {
            popup.classList.remove('open');
        }
        this.editingOverlayId = null;
    }
    
    applySettings() {
        const overlay = this.overlays.find(o => o.id === this.editingOverlayId);
        if (!overlay) return;
        
        // Apply values
        overlay.displayType = document.getElementById('overlayStyleSelect').value;
        
        // Candle colors (from swatches)
        overlay.bodyUpColor = this.getSwatchColor('overlayBodyUp');
        overlay.bodyDownColor = this.getSwatchColor('overlayBodyDown');
        overlay.borderUpColor = this.getSwatchColor('overlayBorderUp');
        overlay.borderDownColor = this.getSwatchColor('overlayBorderDown');
        overlay.wickUpColor = this.getSwatchColor('overlayWickUp');
        overlay.wickDownColor = this.getSwatchColor('overlayWickDown');
        
        // Checkboxes
        overlay.showBody = document.getElementById('overlayShowBody').checked;
        overlay.showBorder = document.getElementById('overlayShowBorder').checked;
        overlay.showWick = document.getElementById('overlayShowWick').checked;
        overlay.showPriceLine = document.getElementById('overlayShowPriceLine').checked;
        
        this.closeSettingsPopup();
        this.chart.render();
    }
    
    initSettingsPopup() {
        // Close button
        const closeBtn = document.getElementById('overlaySettingsClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeSettingsPopup());
        }
        
        // Cancel button
        const cancelBtn = document.getElementById('overlaySettingsCancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeSettingsPopup());
        }
        
        // Ok button
        const okBtn = document.getElementById('overlaySettingsOk');
        if (okBtn) {
            okBtn.addEventListener('click', () => this.applySettings());
        }
        
        // Click outside to close
        const popup = document.getElementById('overlaySettingsPopup');
        if (popup) {
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    this.closeSettingsPopup();
                }
            });
        }
        
        // Initialize color palette
        this.initColorPalette();
    }
    
    initColorPalette() {
        // Use the existing ColorPicker class from drawing tools
        // Setup swatch click handlers to use it
        document.querySelectorAll('.overlay-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => this.openColorPicker(e, swatch));
        });
    }
    
    openColorPicker(event, swatch) {
        // Use colorPicker from drawing manager's toolbar
        const picker = this.chart.drawingManager?.toolbar?.colorPicker;
        if (picker) {
            this.activeColorSwatch = swatch;
            const currentColor = swatch.dataset.color || '#26a69a';
            
            // Get position from swatch element
            const rect = swatch.getBoundingClientRect();
            
            // show(x, y, currentColor, callback, buttonElement)
            picker.show(rect.left, rect.bottom, currentColor, (color) => {
                if (this.activeColorSwatch) {
                    this.activeColorSwatch.style.background = color;
                    this.activeColorSwatch.dataset.color = color;
                }
            }, swatch);
        } else {
            console.warn('ColorPicker not available - path:', 
                'drawingManager:', !!this.chart.drawingManager, 
                'toolbar:', !!this.chart.drawingManager?.toolbar);
        }
    }
    
    setSwatchColor(id, color) {
        const swatch = document.getElementById(id);
        if (swatch) {
            swatch.style.background = color;
            swatch.dataset.color = color;
        }
    }
    
    getSwatchColor(id) {
        const swatch = document.getElementById(id);
        return swatch ? swatch.dataset.color : '#000000';
    }
    
    filterSymbols(query) {
        const listContainer = document.getElementById('compareSymbolsList');
        if (!listContainer) return;
        
        const items = listContainer.querySelectorAll('.compare-symbol-row');
        const lowerQuery = query.toLowerCase();
        
        items.forEach(item => {
            const name = item.dataset.name?.toLowerCase() || '';
            if (name.includes(lowerQuery) || lowerQuery === '') {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    renderSymbolsList() {
        const listContainer = document.getElementById('compareSymbolsList');
        const pillsContainer = document.getElementById('compareAddedPills');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        
        // Get current symbol info
        const currentSymbol = this.chart.currentSymbol || 'CHART';
        const currentFileId = this.chart.currentFileId;
        const overlayedIds = this.overlays.map(o => o.fileId);
        
        // Render pills for added symbols (overlays and linked panes)
        if (pillsContainer) {
            pillsContainer.innerHTML = '';
            
            const hasAddedItems = this.overlays.length > 0 || (this.linkedPanes && this.linkedPanes.length > 0);
            pillsContainer.style.display = hasAddedItems ? 'flex' : 'none';
            
            // Show overlays as pills
            this.overlays.forEach(overlay => {
                const pill = document.createElement('div');
                pill.className = 'compare-added-pill';
                pill.innerHTML = `
                    <span class="pill-color" style="background: ${overlay.color}"></span>
                    <span>${overlay.symbol}</span>
                    <button class="pill-remove" data-id="${overlay.id}" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                `;
                
                pill.querySelector('.pill-remove').addEventListener('click', () => this.removeOverlay(overlay.id));
                pillsContainer.appendChild(pill);
            });
            
            // Show linked panes as pills
            if (this.linkedPanes) {
                this.linkedPanes.forEach(pane => {
                    const pill = document.createElement('div');
                    pill.className = 'compare-added-pill';
                    pill.innerHTML = `
                        <span class="pill-color" style="background: ${pane.color}"></span>
                        <span>${pane.symbol}</span>
                        <button class="pill-remove" data-pane-id="${pane.id}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    `;
                    
                    pill.querySelector('.pill-remove').addEventListener('click', () => this.removeLinkedPane(pane.id));
                    pillsContainer.appendChild(pill);
                });
            }
        }
        
        // Filter available symbols (not current, not overlayed, not in linked panes)
        const linkedPaneIds = this.linkedPanes ? this.linkedPanes.map(p => p.fileId) : [];
        const availableSymbols = this.availableFiles.filter(file => {
            return file.id !== currentFileId && 
                   !overlayedIds.includes(file.id) && 
                   !linkedPaneIds.includes(file.id);
        });
        
        if (availableSymbols.length === 0) {
            listContainer.innerHTML = `
                <div class="compare-empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <p>No additional symbols available</p>
                </div>
            `;
            return;
        }
        
        // Helper to determine icon type based on symbol name
        const getIconType = (name) => {
            const upperName = name.toUpperCase();
            if (upperName.includes('BTC') || upperName.includes('ETH') || upperName.includes('CRYPTO')) return 'crypto';
            if (upperName.includes('GOLD') || upperName.includes('XAU') || upperName.includes('SILVER') || upperName.includes('XAG')) return 'gold';
            if (upperName.includes('AAPL') || upperName.includes('MSFT') || upperName.includes('GOOGL') || upperName.includes('TSLA')) return 'stock';
            return '';
        };
        
        // Helper to extract clean symbol name from filename
        const extractSymbolName = (filename) => {
            if (!filename) return null;
            // Remove extension
            let name = filename.replace(/\.(csv|CSV)$/, '').toUpperCase();
            // Try to extract symbol from patterns like "EURUSD_CANDLESTICK_1_M_BID_..."
            const parts = name.split('_');
            if (parts.length > 1) {
                // First part is usually the symbol (EURUSD, GBPUSD, XAUUSD, etc.)
                const firstPart = parts[0];
                // Check if it looks like a currency pair (6 chars) or commodity (5-6 chars)
                if (firstPart.length >= 5 && firstPart.length <= 7) {
                    return firstPart;
                }
            }
            // Fallback: if name is short enough, use it; otherwise truncate
            return name.length > 12 ? name.substring(0, 12) : name;
        };
        
        // Render available symbols with action buttons
        availableSymbols.forEach(file => {
            const fullName = file.original_name?.replace(/\.(csv|CSV)$/, '').toUpperCase() || `FILE_${file.id}`;
            const symbolName = extractSymbolName(file.original_name) || fullName;
            const abbrev = symbolName.substring(0, 2);
            const iconType = getIconType(symbolName);
            const isAdded = overlayedIds.includes(file.id) || linkedPaneIds.includes(file.id);
            
            const item = document.createElement('div');
            item.className = `compare-symbol-row${isAdded ? ' added' : ''}`;
            item.dataset.name = symbolName;
            item.dataset.fileId = file.id;
            
            item.innerHTML = `
                <div class="compare-symbol-icon ${iconType}">${abbrev}</div>
                <div class="compare-symbol-info">
                    <span class="compare-symbol-name">${symbolName}</span>
                    <span class="compare-symbol-desc">${file.row_count?.toLocaleString() || '?'} candles</span>
                </div>
                <div class="compare-symbol-actions">
                    <button class="compare-action-btn" data-mode="same-scale" data-file-id="${file.id}" data-symbol="${symbolName}">Overlay</button>
                    <button class="compare-action-btn primary" data-mode="new-pane" data-file-id="${file.id}" data-symbol="${symbolName}">New Pane</button>
                </div>
            `;
            
            // Add click handlers for action buttons
            item.querySelectorAll('.compare-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const mode = btn.dataset.mode;
                    const fileId = parseInt(btn.dataset.fileId);
                    const symbol = btn.dataset.symbol;
                    this.addSymbolWithMode(fileId, symbol, mode);
                });
            });
            
            listContainer.appendChild(item);
        });
    }
    
    addSymbolWithMode(fileId, symbolName, mode) {
        console.log(`📊 Adding symbol ${symbolName} with mode: ${mode}`);
        
        switch (mode) {
            case 'same-scale':
                // Add overlay on same chart with same scale
                this.addOverlay(fileId, symbolName);
                break;
            case 'new-scale':
                // Add overlay with separate Y-axis (for now same as overlay)
                this.addOverlay(fileId, symbolName);
                break;
            case 'new-pane':
                // Add as linked pane (shares time axis with main chart)
                this.addLinkedPane(fileId, symbolName);
                break;
        }
        
        this.closeModal();
    }
    
    async addLinkedPane(fileId, symbolName) {
        console.log(`📊 Adding linked pane for ${symbolName} (fileId: ${fileId})`);
        
        try {
            // Use same endpoint as overlays
            const url = `${this.apiUrl}/file/${fileId}?offset=0&limit=50000`;
            console.log(`📊 Fetching from: ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Failed to fetch data for linked pane: ${response.status}`);
                return;
            }
            
            const result = await response.json();
            console.log(`📊 Received ${result.total || 'unknown'} candles`);
            
            if (!result.data) {
                console.error('No data for linked pane');
                return;
            }
            
            // Parse CSV data (same as overlay)
            const rawData = this.parseCSVData(result.data);
            console.log(`📊 Parsed ${rawData.length} candles`);
            
            // Initialize linked panes array if needed
            if (!this.linkedPanes) {
                this.linkedPanes = [];
            }
            
            // Setup container first
            this.setupLinkedPanesContainer();
            
            // Create linked pane object
            const pane = {
                id: Date.now(),
                fileId: fileId,
                symbol: symbolName,
                color: this.colors[this.colorIndex % this.colors.length],
                rawData: rawData,  // Use parsed data
                data: [], // Will be resampled
                visible: true,
                height: '50%', // 50% of main chart height
                yMin: 0,
                yMax: 0,
                priceZoom: 1.0,    // Y-axis zoom level
                priceOffset: 0,    // Y-axis offset for panning
                autoScale: true,   // Auto-fit to visible data
                // Display settings
                displayType: 'candles',
                upColor: '#089981',
                downColor: '#f23645',
                showBody: true,
                showBorder: true,
                showWick: true,
                showPriceLine: true
            };
            
            this.colorIndex++;
            
            // Resample to match main chart timeframe
            const tf = this.chart.currentTimeframe || '1m';
            console.log(`📊 Resampling to timeframe: ${tf}`);
            pane.data = this.resampleData(rawData, tf);  // Use same resample method as overlays
            console.log(`📊 Resampled data: ${pane.data.length} candles`);
            
            // Calculate Y scale
            this.calculateLinkedPaneScale(pane);
            console.log(`📊 Y range: ${pane.yMin} - ${pane.yMax}`);
            
            this.linkedPanes.push(pane);
            
            // Update UI
            console.log(`📊 Rendering linked panes (total: ${this.linkedPanes.length})`);
            this.renderLinkedPanes();
            this.renderSymbolsList();
            
            console.log(`✅ Linked pane added: ${symbolName} with ${pane.data.length} candles`);
            
        } catch (error) {
            console.error('Error adding linked pane:', error);
        }
    }
    
    setupLinkedPanesContainer() {
        // Create container for linked panes below main chart
        let container = document.getElementById('linkedPanesContainer');
        if (!container) {
            const chartContainer = document.getElementById('chart-container');
            if (chartContainer) {
                container = document.createElement('div');
                container.id = 'linkedPanesContainer';
                container.style.cssText = `
                    position: absolute;
                    bottom: 30px;
                    left: 0;
                    right: 0;
                    background: #131722;
                    z-index: 100;
                `;
                chartContainer.appendChild(container);
                console.log('📊 Linked panes container created in chart-container');
            } else {
                console.error('❌ Could not find chart-container for linked panes');
            }
        }
        
        // Hook into main chart's render to sync linked panes
        if (!this._linkedPaneHooked) {
            this._linkedPaneHooked = true;
            const originalRender = this.chart.render.bind(this.chart);
            this.chart.render = () => {
                originalRender();
                this.renderLinkedPanes();
            };
            
            // Hook into main chart's scroll/zoom
            this.chart.canvas.addEventListener('wheel', () => {
                setTimeout(() => this.renderLinkedPanes(), 0);
            });
            
            // Hook into mouse drag
            this.chart.canvas.addEventListener('mousemove', () => {
                if (this.chart.movement?.isDragging) {
                    this.renderLinkedPanes();
                }
            });
        }
    }
    
    
    calculateLinkedPaneScale(pane) {
        if (!pane.data || pane.data.length === 0) return;
        
        let min = Infinity;
        let max = -Infinity;
        
        pane.data.forEach(d => {
            if (d.close < min) min = d.close;
            if (d.close > max) max = d.close;
            if (d.high && d.high > max) max = d.high;
            if (d.low && d.low < min) min = d.low;
        });
        
        const padding = (max - min) * 0.1;
        pane.yMin = min - padding;
        pane.yMax = max + padding;
    }
    
    renderLinkedPanes() {
        if (!this.linkedPanes || this.linkedPanes.length === 0) return;
        
        const container = document.getElementById('linkedPanesContainer');
        if (!container) {
            console.log('📊 No linked panes container, creating...');
            this.setupLinkedPanesContainer();
            return;
        }
        
        // Get main chart dimensions for reference
        const mainCanvas = this.chart.canvas;
        const chartWidth = mainCanvas.width / (window.devicePixelRatio || 1);
        
        // Ensure canvases exist for each pane
        this.linkedPanes.forEach((pane, index) => {
            let wrapper = document.getElementById(`linkedPaneWrapper_${pane.id}`);
            let canvas = document.getElementById(`linkedPane_${pane.id}`);
            
            if (!wrapper) {
                // Create pane wrapper
                wrapper = document.createElement('div');
                wrapper.id = `linkedPaneWrapper_${pane.id}`;
                wrapper.className = 'linked-pane-wrapper';
                
                // Calculate height - 50% of main chart
                const mainChartHeight = this.chart.canvas.height / (window.devicePixelRatio || 1);
                const paneHeight = typeof pane.height === 'string' && pane.height.endsWith('%') 
                    ? Math.floor(mainChartHeight * parseInt(pane.height) / 100)
                    : pane.height;
                
                wrapper.style.cssText = `
                    position: relative;
                    width: 100%;
                    height: ${paneHeight}px;
                    border-top: 1px solid #363a45;
                    background: #131722;
                `;
                
                // Create canvas - set explicit size
                canvas = document.createElement('canvas');
                canvas.id = `linkedPane_${pane.id}`;
                
                // Get container width for canvas
                const containerWidth = container.offsetWidth || this.chart.canvas.width / (window.devicePixelRatio || 1);
                const dpr = window.devicePixelRatio || 1;
                canvas.width = containerWidth * dpr;
                canvas.height = paneHeight * dpr;
                canvas.style.cssText = `
                    display: block;
                    width: 100%;
                    height: ${paneHeight}px;
                `;
                
                // Create legend bar (same style as overlay)
                const legend = document.createElement('div');
                legend.className = 'linked-pane-legend';
                legend.id = `linkedPaneLegend_${pane.id}`;
                legend.style.cssText = `
                    position: absolute;
                    top: 8px;
                    left: 10px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    z-index: 10;
                    font-size: 12px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: #d1d4dc;
                    background: rgba(19, 23, 34, 0.9);
                    padding: 4px 10px;
                    border-radius: 4px;
                `;
                
                const iconBtnStyle = `
                    background: transparent;
                    border: none;
                    color: #787b86;
                    cursor: pointer;
                    padding: 2px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                    transition: color 0.15s, background 0.15s;
                `;
                
                legend.innerHTML = `
                    <span class="pane-color-indicator" style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${pane.color}; cursor: pointer;" title="Change color"></span>
                    <span class="pane-symbol" style="font-weight: 600; color: ${pane.color};">${pane.symbol}</span>
                    <button class="pane-visibility-btn" data-id="${pane.id}" title="Hide" style="${iconBtnStyle}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                    <button class="pane-settings-btn" data-id="${pane.id}" title="Settings" style="${iconBtnStyle}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="pane-delete-btn" data-id="${pane.id}" title="Remove" style="${iconBtnStyle}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    <span class="pane-ohlc" style="margin-left: 8px; color: #787b86;">
                        <span style="color: #787b86;">O</span> <span class="pane-open" style="color: #d1d4dc;">--</span>
                        <span style="color: #787b86; margin-left: 6px;">H</span> <span class="pane-high" style="color: #d1d4dc;">--</span>
                        <span style="color: #787b86; margin-left: 6px;">L</span> <span class="pane-low" style="color: #d1d4dc;">--</span>
                        <span style="color: #787b86; margin-left: 6px;">C</span> <span class="pane-close" style="color: #d1d4dc;">--</span>
                    </span>
                `;
                
                // Create SVG layer for drawings
                const svgNS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNS, 'svg');
                svg.id = `linkedPaneSvg_${pane.id}`;
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '100%');
                svg.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 5;
                    overflow: visible;
                `;
                pane.svg = svg;
                if (!pane.drawings) pane.drawings = [];
                
                wrapper.appendChild(canvas);
                wrapper.appendChild(svg);
                wrapper.appendChild(legend);
                container.appendChild(wrapper);
                
                // Add hover effects
                legend.querySelectorAll('button').forEach(btn => {
                    btn.addEventListener('mouseenter', () => {
                        btn.style.color = '#d1d4dc';
                        btn.style.background = 'rgba(255,255,255,0.1)';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.color = '#787b86';
                        btn.style.background = 'transparent';
                    });
                });
                
                // Visibility toggle
                legend.querySelector('.pane-visibility-btn').addEventListener('click', () => {
                    this.togglePaneVisibility(pane.id);
                });
                
                // Settings button
                legend.querySelector('.pane-settings-btn').addEventListener('click', () => {
                    this.openPaneSettings(pane);
                });
                
                // Delete button
                legend.querySelector('.pane-delete-btn').addEventListener('click', () => {
                    this.removeLinkedPane(pane.id);
                });
                
                // Color indicator click - change color
                legend.querySelector('.pane-color-indicator').addEventListener('click', () => {
                    this.changePaneColor(pane);
                });
                
                // Add price axis controls
                this.setupPaneAxisControls(pane, canvas, wrapper);
                
                console.log(`📊 Created linked pane wrapper for ${pane.symbol}, canvas: ${canvas.width}x${canvas.height}`);
            }
            
            // Update canvas size to match wrapper
            const rect = wrapper.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                
                // Render the pane data
                this.drawLinkedPane(pane, canvas);
            }
        });
    }
    
    drawLinkedPane(pane, canvas) {
        if (!pane.visible || !pane.data || pane.data.length === 0) {
            console.log(`📊 Pane skip: visible=${pane.visible}, data=${pane.data?.length}`);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        
        // Clear canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#131722';
        ctx.fillRect(0, 0, width, height);
        
        const margin = { t: 10, r: 60, b: 5, l: 0 };
        const chartWidth = width - margin.l - margin.r;
        const chartHeight = height - margin.t - margin.b;
        
        // Get main chart data and settings
        const mainChart = this.chart;
        const mainData = mainChart.data || [];
        if (mainData.length === 0) return;
        
        const candleSpacing = mainChart.getCandleSpacing ? mainChart.getCandleSpacing() : (mainChart.candleWidth + 2);
        
        // Calculate visible range (same as overlay does)
        const firstVisibleIndex = Math.floor(-mainChart.offsetX / candleSpacing);
        const numVisibleCandles = Math.ceil(chartWidth / candleSpacing);
        const startIdx = Math.max(0, firstVisibleIndex);
        const endIdx = Math.min(mainData.length, firstVisibleIndex + numVisibleCandles + 2);
        
        // Get visible time range from main chart
        const visibleStartTime = mainData[startIdx]?.t;
        const visibleEndTime = mainData[Math.min(endIdx, mainData.length - 1)]?.t;
        
        if (!visibleStartTime || !visibleEndTime) {
            console.log(`📊 Pane: No valid time range`);
            return;
        }
        
        // Filter pane data to visible time range (same as overlay)
        const paneData = pane.data.filter(d => d.t >= visibleStartTime && d.t <= visibleEndTime);
        
        if (paneData.length < 2) {
            console.log(`📊 Pane ${pane.symbol}: only ${paneData.length} candles in visible range`);
            return;
        }
        
        console.log(`📊 Pane ${pane.symbol}: ${paneData.length} candles in visible range`);
        
        // Calculate Y scale for this pane (its own price range)
        let minPrice = Infinity, maxPrice = -Infinity;
        paneData.forEach(d => {
            const c = d.c !== undefined ? d.c : d.close;
            if (c !== undefined && !isNaN(c)) {
                if (c < minPrice) minPrice = c;
                if (c > maxPrice) maxPrice = c;
            }
        });
        
        if (minPrice === Infinity || maxPrice === -Infinity) {
            console.log(`📊 Pane: No valid price data`);
            return;
        }
        
        let priceRange = maxPrice - minPrice || 1;
        const padding = priceRange * 0.1;
        minPrice -= padding;
        maxPrice += padding;
        priceRange = maxPrice - minPrice;
        
        // Store base range for drag calculations (before zoom/offset)
        pane.baseMin = minPrice;
        pane.baseMax = maxPrice;
        pane.baseRange = priceRange;
        
        // Apply zoom and offset if not in auto-scale mode
        if (!pane.autoScale) {
            const midPrice = (minPrice + maxPrice) / 2;
            const zoomedRange = priceRange / pane.priceZoom;
            minPrice = midPrice - zoomedRange / 2 - pane.priceOffset;
            maxPrice = midPrice + zoomedRange / 2 - pane.priceOffset;
            priceRange = zoomedRange;
        }
        
        // Store current displayed range
        pane.currentMin = minPrice;
        pane.currentMax = maxPrice;
        
        // Y scale function
        const yScale = (price) => {
            return margin.t + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        };
        
        // Draw horizontal grid lines
        ctx.strokeStyle = 'rgba(42, 46, 57, 0.6)';
        ctx.lineWidth = 1;
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = margin.t + (chartHeight * i / gridLines);
            ctx.beginPath();
            ctx.moveTo(0, Math.floor(y) + 0.5);
            ctx.lineTo(chartWidth, Math.floor(y) + 0.5);
            ctx.stroke();
        }
        
        // Draw vertical grid lines - sync with main chart's time axis
        const spacing = 2;
        const totalCandleWidth = mainChart.candleWidth + spacing;
        
        // Calculate how many candles fit and the interval for grid lines
        const visibleCandles = Math.ceil(chartWidth / totalCandleWidth);
        const gridInterval = Math.max(1, Math.floor(visibleCandles / 6)); // ~6 vertical lines
        
        ctx.strokeStyle = 'rgba(42, 46, 57, 0.6)';
        ctx.lineWidth = 1;
        
        for (let i = startIdx; i <= endIdx; i++) {
            // Draw grid at regular intervals
            if (i % gridInterval === 0) {
                const x = mainChart.dataIndexToPixel ? 
                    mainChart.dataIndexToPixel(i) : 
                    margin.l + (i * totalCandleWidth) + mainChart.offsetX + mainChart.candleWidth / 2;
                
                if (x >= margin.l && x <= chartWidth) {
                    ctx.beginPath();
                    ctx.moveTo(Math.floor(x) + 0.5, margin.t);
                    ctx.lineTo(Math.floor(x) + 0.5, height - margin.b);
                    ctx.stroke();
                }
            }
        }
        
        // Get display settings
        const displayType = pane.displayType || 'candles';
        const upColor = pane.upColor || '#089981';
        const downColor = pane.downColor || '#f23645';
        const showBody = pane.showBody !== false;
        const showBorder = pane.showBorder !== false;
        const showWick = pane.showWick !== false;
        
        let lastY = 0;
        let lastPrice = 0;
        let pointCount = 0;
        
        // Build array of visible points with x positions
        const points = [];
        paneData.forEach((candle) => {
            const closePrice = candle.c !== undefined ? candle.c : candle.close;
            if (closePrice === undefined || isNaN(closePrice)) return;
            
            const mainIndex = this.findClosestIndex(mainData, candle.t, startIdx, endIdx);
            if (mainIndex === -1) return;
            
            const x = mainChart.dataIndexToPixel ? 
                mainChart.dataIndexToPixel(mainIndex) : 
                margin.l + (mainIndex * candleSpacing) + mainChart.offsetX + mainChart.candleWidth / 2;
            
            if (x < margin.l - 50 || x > chartWidth + margin.l + 50) return;
            
            points.push({ candle, x, mainIndex });
        });
        
        // Draw based on display type
        if (displayType === 'line' || displayType === 'area') {
            // Line or Area chart
            ctx.beginPath();
            ctx.strokeStyle = pane.color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            let firstPoint = true;
            const areaPath = [];
            
            points.forEach(({ candle, x }) => {
                const closePrice = candle.c !== undefined ? candle.c : candle.close;
                const y = yScale(closePrice);
                
                if (firstPoint) {
                    ctx.moveTo(x, y);
                    areaPath.push({ x, y });
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                    areaPath.push({ x, y });
                }
                lastY = y;
                lastPrice = closePrice;
                pointCount++;
            });
            ctx.stroke();
            
            // Fill area if area style
            if (displayType === 'area' && areaPath.length > 0) {
                ctx.beginPath();
                ctx.moveTo(areaPath[0].x, chartHeight + margin.t);
                areaPath.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.lineTo(areaPath[areaPath.length - 1].x, chartHeight + margin.t);
                ctx.closePath();
                ctx.fillStyle = pane.color + '30'; // 30% opacity
                ctx.fill();
            }
        } else {
            // Candles, Bars, Hollow, Heikin Ashi
            const candleW = Math.max(1, mainChart.candleWidth * 0.8);
            
            points.forEach(({ candle, x }) => {
                const o = candle.o !== undefined ? candle.o : candle.open;
                const h = candle.h !== undefined ? candle.h : candle.high;
                const l = candle.l !== undefined ? candle.l : candle.low;
                const c = candle.c !== undefined ? candle.c : candle.close;
                
                if (o === undefined || h === undefined || l === undefined || c === undefined) return;
                
                const isUp = c >= o;
                const color = isUp ? upColor : downColor;
                
                const yOpen = yScale(o);
                const yHigh = yScale(h);
                const yLow = yScale(l);
                const yClose = yScale(c);
                
                const bodyTop = Math.min(yOpen, yClose);
                const bodyBottom = Math.max(yOpen, yClose);
                const bodyHeight = Math.max(1, bodyBottom - bodyTop);
                
                if (displayType === 'bars') {
                    // OHLC Bars
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    // Vertical line (high to low)
                    ctx.moveTo(x, yHigh);
                    ctx.lineTo(x, yLow);
                    // Open tick (left)
                    ctx.moveTo(x - candleW / 2, yOpen);
                    ctx.lineTo(x, yOpen);
                    // Close tick (right)
                    ctx.moveTo(x, yClose);
                    ctx.lineTo(x + candleW / 2, yClose);
                    ctx.stroke();
                } else if (displayType === 'hollow') {
                    // Hollow candles - up candles are hollow, down are filled
                    if (showWick) {
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x, yHigh);
                        ctx.lineTo(x, bodyTop);
                        ctx.moveTo(x, bodyBottom);
                        ctx.lineTo(x, yLow);
                        ctx.stroke();
                    }
                    
                    if (showBody) {
                        if (isUp) {
                            // Hollow (stroke only)
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
                        } else {
                            // Filled
                            ctx.fillStyle = color;
                            ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
                        }
                    }
                } else {
                    // Regular candles (default)
                    if (showWick) {
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x, yHigh);
                        ctx.lineTo(x, yLow);
                        ctx.stroke();
                    }
                    
                    if (showBody) {
                        ctx.fillStyle = color;
                        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
                    }
                    
                    if (showBorder) {
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyHeight);
                    }
                }
                
                lastY = yClose;
                lastPrice = c;
                pointCount++;
            });
        }
        
        console.log(`📊 Pane drew ${pointCount} ${displayType}, range: ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}`);
        
        // Determine decimal places based on price magnitude
        const decimals = maxPrice > 100 ? 2 : (maxPrice > 10 ? 3 : 5);
        
        // Draw Y-axis background first
        ctx.fillStyle = '#131722';
        ctx.fillRect(width - margin.r, 0, margin.r, height);
        
        // Draw Y-axis border
        ctx.strokeStyle = '#363a45';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width - margin.r + 0.5, 0);
        ctx.lineTo(width - margin.r + 0.5, height);
        ctx.stroke();
        
        // Draw Y-axis labels
        ctx.fillStyle = '#787b86';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        
        const priceStep = priceRange / gridLines;
        for (let i = 0; i <= gridLines; i++) {
            const price = maxPrice - priceStep * i;
            const y = margin.t + (chartHeight * i / gridLines);
            
            // Don't draw if too close to current price label
            if (lastPrice > 0 && Math.abs(y - lastY) < 18) continue;
            
            if (!isNaN(price)) {
                ctx.fillText(price.toFixed(decimals), width - margin.r / 2, y + 4);
            }
        }
        
        // Draw current price line and label
        if (lastPrice > 0 && !isNaN(lastPrice)) {
            // Dashed line from chart to price axis
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = pane.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(width - margin.r, lastY);
            ctx.lineTo(width, lastY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Price label background
            ctx.fillStyle = pane.color;
            ctx.fillRect(width - margin.r, lastY - 10, margin.r, 20);
            
            // Price label text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(lastPrice.toFixed(decimals), width - margin.r / 2, lastY + 4);
        }
        
        // Draw crosshair if active
        if (pane.crosshair && pane.crosshair.x >= 0) {
            const cx = pane.crosshair.x;
            const cy = pane.crosshair.y;
            
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = '#787b86';
            ctx.lineWidth = 1;
            
            // Vertical line
            if (cx >= margin.l && cx <= chartWidth) {
                ctx.beginPath();
                ctx.moveTo(cx + 0.5, margin.t);
                ctx.lineTo(cx + 0.5, height - margin.b);
                ctx.stroke();
            }
            
            // Horizontal line
            if (cy >= margin.t && cy <= height - margin.b) {
                ctx.beginPath();
                ctx.moveTo(margin.l, cy + 0.5);
                ctx.lineTo(chartWidth, cy + 0.5);
                ctx.stroke();
                
                // Price label on Y-axis for crosshair
                const crosshairPrice = minPrice + (1 - (cy - margin.t) / chartHeight) * priceRange;
                if (!isNaN(crosshairPrice)) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#363a45';
                    ctx.fillRect(width - margin.r, cy - 10, margin.r, 20);
                    ctx.fillStyle = '#d1d4dc';
                    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(crosshairPrice.toFixed(decimals), width - margin.r / 2, cy + 4);
                }
            }
            
            ctx.restore();
        }
        
        // Update OHLC display with last visible candle
        if (visibleData.length > 0) {
            const lastCandle = visibleData[visibleData.length - 1];
            this.updatePaneOHLCDirect(pane, lastCandle);
        }
        
        // Render drawings on the pane (they move with chart - drawn on canvas)
        this.renderPaneDrawings(pane, ctx, margin, chartHeight, chartWidth, minPrice, priceRange, width, height);
    }
    
    /**
     * Render drawings on a pane - draws directly on canvas
     * Called on every render so drawings move with chart
     */
    renderPaneDrawings(pane, ctx, margin, chartHeight, chartWidth, minPrice, priceRange, canvasWidth, canvasHeight) {
        if (!pane.drawings || pane.drawings.length === 0) return;
        
        const mainChart = this.chart;
        const spacing = 2;
        const candleSpacing = mainChart.candleWidth + spacing;
        
        // Helper: convert price to Y pixel
        const priceToY = (price) => {
            return margin.t + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        };
        
        // Helper: convert data index to X pixel  
        const indexToX = (dataIndex) => {
            return margin.l + (dataIndex * candleSpacing) + mainChart.offsetX + mainChart.candleWidth / 2;
        };
        
        ctx.save();
        
        // Draw each drawing on canvas
        pane.drawings.forEach(drawing => {
            ctx.strokeStyle = drawing.color || '#2962ff';
            ctx.fillStyle = (drawing.color || '#2962ff') + '30';
            ctx.lineWidth = 2;
            
            if (drawing.type === 'horizontal') {
                // Horizontal line at price level
                const y = priceToY(drawing.price);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvasWidth, y);
                ctx.stroke();
                
                // Price label
                ctx.fillStyle = drawing.color || '#2962ff';
                ctx.fillRect(canvasWidth - margin.r, y - 10, margin.r, 20);
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(drawing.price.toFixed(2), canvasWidth - margin.r/2, y + 4);
                
            } else if (drawing.type === 'vertical') {
                // Vertical line at data index
                const x = indexToX(drawing.dataIndex);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight);
                ctx.stroke();
                
            } else if (drawing.type === 'trendline') {
                // Trendline between two points
                const x1 = indexToX(drawing.startIndex);
                const y1 = priceToY(drawing.startPrice);
                const x2 = indexToX(drawing.endIndex);
                const y2 = priceToY(drawing.endPrice);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                
                // Draw end points
                ctx.fillStyle = drawing.color || '#2962ff';
                ctx.beginPath();
                ctx.arc(x1, y1, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x2, y2, 4, 0, Math.PI * 2);
                ctx.fill();
                
            } else if (drawing.type === 'rectangle') {
                // Rectangle between two points
                const x1 = indexToX(drawing.startIndex);
                const y1 = priceToY(drawing.startPrice);
                const x2 = indexToX(drawing.endIndex);
                const y2 = priceToY(drawing.endPrice);
                const x = Math.min(x1, x2);
                const y = Math.min(y1, y2);
                const w = Math.abs(x2 - x1);
                const h = Math.abs(y2 - y1);
                
                ctx.fillStyle = (drawing.color || '#2962ff') + '30';
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            }
        });
        
        ctx.restore();
    }
    
    /**
     * Update OHLC display directly with candle data
     */
    updatePaneOHLCDirect(pane, candle) {
        if (!candle) return;
        
        const legend = document.getElementById(`linkedPaneLegend_${pane.id}`);
        if (!legend) return;
        
        const formatPrice = (p) => {
            if (p === undefined || p === null || isNaN(p)) return '--';
            return p > 100 ? p.toFixed(2) : (p > 10 ? p.toFixed(3) : p.toFixed(5));
        };
        
        const o = candle.o !== undefined ? candle.o : candle.open;
        const h = candle.h !== undefined ? candle.h : candle.high;
        const l = candle.l !== undefined ? candle.l : candle.low;
        const c = candle.c !== undefined ? candle.c : candle.close;
        
        const openEl = legend.querySelector('.pane-open');
        const highEl = legend.querySelector('.pane-high');
        const lowEl = legend.querySelector('.pane-low');
        const closeEl = legend.querySelector('.pane-close');
        
        if (openEl) openEl.textContent = formatPrice(o);
        if (highEl) highEl.textContent = formatPrice(h);
        if (lowEl) lowEl.textContent = formatPrice(l);
        if (closeEl) closeEl.textContent = formatPrice(c);
    }
    
    /**
     * Setup price axis controls (same as overlay - drag Y-axis to zoom, drag chart to move)
     */
    setupPaneAxisControls(pane, canvas, wrapper) {
        const priceAxisWidth = 60;
        const margin = { t: 10, r: 60, b: 5, l: 0 };
        
        const dragState = {
            isDragging: false,
            dragType: null, // 'zoom' for Y-axis, 'move' for chart area
            lastY: 0,
            startY: 0,
            hasMoved: false
        };
        
        // Check if mouse is over price axis
        const isOverPriceAxis = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            return x >= rect.width - priceAxisWidth;
        };
        
        // Check if mouse is over time axis
        const isOverTimeAxis = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            return y >= rect.height - margin.b && x >= margin.l && x < rect.width - margin.r;
        };
        
        // Check if mouse is in chart area
        const isInChartArea = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            return x >= margin.l && x < rect.width - margin.r && y >= margin.t && y < rect.height - margin.b;
        };
        
        // Check if drawing tool is active
        const isDrawingToolActive = () => {
            // Check both chart.tool and drawingManager.currentTool
            const chartTool = this.chart.tool;
            const managerTool = window.drawingManager?.currentTool || this.chart.drawingManager?.currentTool;
            return (chartTool && chartTool !== 'pointer' && chartTool !== 'cursor') || 
                   (managerTool && managerTool !== 'pointer' && managerTool !== 'cursor');
        };
        
        // Get current active tool
        const getCurrentTool = () => {
            return window.drawingManager?.currentTool || 
                   this.chart.drawingManager?.currentTool || 
                   this.chart.tool;
        };
        
        // Mouse move
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const my = e.clientY - rect.top;
            const chartHeight = rect.height - margin.t - margin.b;
            
            if (dragState.isDragging) {
                const dy = e.clientY - dragState.lastY;
                
                // Check if mouse has moved enough to be considered a drag
                if (Math.abs(e.clientY - dragState.startY) > 3) {
                    dragState.hasMoved = true;
                }
                
                if (!dragState.hasMoved) return;
                
                pane.autoScale = false;
                
                // Get the current displayed price range (use stored values from last render)
                const baseRange = pane.baseRange || (pane.yMax - pane.yMin) || 100;
                const displayedRange = baseRange / pane.priceZoom;
                
                // Only handle Y-axis zoom here (chart area movement is handled by combinedDrag)
                if (dragState.dragType === 'zoom') {
                    // Drag from Y-axis: Zoom (same as overlay)
                    const sensitivity = 0.005;
                    const zoomFactor = 1 + dy * sensitivity;
                    const newZoom = Math.max(0.5, Math.min(20, pane.priceZoom * zoomFactor));
                    
                    const newRange = baseRange / newZoom;
                    const rangeChange = newRange - displayedRange;
                    
                    // Zoom centered on mouse position
                    const mouseRatio = (my - margin.t) / chartHeight;
                    pane.priceOffset += rangeChange * (0.5 - mouseRatio);
                    pane.priceZoom = newZoom;
                }
                
                dragState.lastY = e.clientY;
                this.renderLinkedPanes();
                return;
            }
            
            // Update cursor based on position using CSS classes
            canvas.classList.remove('cursor-price-axis', 'cursor-time-axis');
            if (isDrawingToolActive()) {
                canvas.style.cursor = 'crosshair';
            } else if (isOverPriceAxis(e)) {
                canvas.classList.add('cursor-price-axis');
            } else if (isOverTimeAxis(e)) {
                canvas.classList.add('cursor-time-axis');
            }
        });
        
        // Mouse down - start drag (price axis only, chart area handled by combinedDrag)
        canvas.addEventListener('mousedown', (e) => {
            if (isOverPriceAxis(e)) {
                // Y-axis: zoom mode
                dragState.isDragging = true;
                dragState.dragType = 'zoom';
                dragState.lastY = e.clientY;
                dragState.startY = e.clientY;
                dragState.hasMoved = false;
                canvas.style.cursor = 'ns-resize';
                e.preventDefault();
            }
            // Chart area drag is now handled by combinedDrag below
        });
        
        // Mouse up - end drag
        const endDrag = () => {
            if (dragState.isDragging) {
                dragState.isDragging = false;
                dragState.dragType = null;
                canvas.style.cursor = '';
            }
        };
        document.addEventListener('mouseup', endDrag);
        
        // Double-click - reset to auto-scale
        canvas.addEventListener('dblclick', (e) => {
            if (isOverPriceAxis(e) || isInChartArea(e)) {
                pane.autoScale = true;
                pane.priceZoom = 1.0;
                pane.priceOffset = 0;
                this.renderLinkedPanes();
            }
        });
        
        // Right-click - show settings menu
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showPaneContextMenu(pane, e.clientX, e.clientY);
        });
        
        // Horizontal scroll - sync with main chart
        canvas.addEventListener('wheel', (e) => {
            if (!isOverPriceAxis(e)) {
                // Horizontal scroll in chart area - sync with main chart
                e.preventDefault();
                
                // Use deltaX for horizontal scroll, or deltaY with shift key
                const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
                const deltaY = e.shiftKey ? 0 : e.deltaY;
                
                if (Math.abs(deltaX) > Math.abs(deltaY) || e.shiftKey) {
                    // Horizontal scroll - move main chart
                    this.chart.offsetX -= deltaX;
                    this.chart.constrainOffset();
                    this.chart.render();
                } else if (!isOverPriceAxis(e)) {
                    // Vertical scroll on chart - zoom main chart (like main chart does)
                    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                    const newWidth = Math.max(2, Math.min(50, this.chart.candleWidth * zoomFactor));
                    this.chart.candleWidth = newWidth;
                    this.chart.constrainOffset();
                    this.chart.render();
                }
            }
        }, { passive: false });
        
        // Free drag state - allows simultaneous horizontal and vertical movement
        let freeDrag = { 
            isDragging: false, 
            lastX: 0,
            lastY: 0
        };
        
        // Crosshair state
        let crosshairPos = { x: -1, y: -1 };
        
        // Drawing state for pane
        let paneDrawing = {
            active: false,
            startX: 0,
            startY: 0,
            startPrice: 0,
            startIndex: 0,
            currentElement: null
        };
        
        // Get data index and price from mouse position
        const getDataFromMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const chartHeight = rect.height - margin.t - margin.b;
            const chartWidth = rect.width - margin.l - margin.r;
            
            // Price from Y
            const price = pane.currentMax - ((my - margin.t) / chartHeight) * (pane.currentMax - pane.currentMin);
            
            // Index from X (use main chart's calculation)
            const spacing = 2;
            const candleSpacing = this.chart.candleWidth + spacing;
            const adjustedX = mx - margin.l - this.chart.offsetX;
            const dataIndex = Math.round(adjustedX / candleSpacing);
            
            return { x: mx, y: my, price, dataIndex, chartHeight, chartWidth };
        };
        
        // Override mousedown to capture starting position
        canvas.addEventListener('mousedown', (e) => {
            const toolActive = isDrawingToolActive();
            const currentTool = getCurrentTool();
            console.log('📊 Pane mousedown - toolActive:', toolActive, 'currentTool:', currentTool);
            
            // If drawing tool is active, start drawing on pane
            if (toolActive) {
                const data = getDataFromMouse(e);
                paneDrawing.active = true;
                paneDrawing.startX = data.x;
                paneDrawing.startY = data.y;
                paneDrawing.startPrice = data.price;
                paneDrawing.startIndex = data.dataIndex;
                
                const tool = getCurrentTool();
                const color = this.chart.drawingColor || window.drawingManager?.currentColor || '#2962ff';
                
                console.log('📊 Pane drawing - tool:', tool, 'color:', color);
                
                // Initialize pane drawings array if needed
                if (!pane.drawings) pane.drawings = [];
                
                if (tool === 'horizontal') {
                    // Horizontal line - one click, store data coordinates only
                    const drawing = {
                        type: 'horizontal',
                        price: data.price,
                        color: color
                    };
                    pane.drawings.push(drawing);
                    console.log('📊 Added horizontal drawing to pane:', pane.id, 'total:', pane.drawings.length, drawing);
                    
                    // Done immediately for horizontal
                    paneDrawing.active = false;
                    if (window.drawingManager?.clearTool) window.drawingManager.clearTool();
                    this.chart.tool = null;
                    canvas.style.cursor = 'grab';
                    // Force redraw of this pane's canvas
                    this.chart.render();
                    console.log('📊 Horizontal line drawn at price:', data.price);
                    
                } else if (tool === 'vertical') {
                    // Vertical line - one click, store data coordinates only
                    pane.drawings.push({
                        type: 'vertical',
                        dataIndex: data.dataIndex,
                        color: color
                    });
                    
                    // Done immediately for vertical
                    paneDrawing.active = false;
                    if (window.drawingManager?.clearTool) window.drawingManager.clearTool();
                    this.chart.tool = null;
                    canvas.style.cursor = 'grab';
                    this.chart.render();
                    console.log('📊 Vertical line drawn at index:', data.dataIndex);
                    
                } else if (tool === 'trendline') {
                    // Trendline - need to track drag, store temp data
                    paneDrawing.tool = 'trendline';
                    paneDrawing.color = color;
                    
                } else if (tool === 'rectangle') {
                    // Rectangle - need to track drag, store temp data
                    paneDrawing.tool = 'rectangle';
                    paneDrawing.color = color;
                    
                } else {
                    // Unknown tool - log it
                    console.log('📊 Pane: unhandled tool type:', tool);
                    paneDrawing.active = false;
                }
                
                e.preventDefault();
                return;
            }
            
            if (isInChartArea(e)) {
                freeDrag.isDragging = true;
                freeDrag.lastX = e.clientX;
                freeDrag.lastY = e.clientY;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });
        
        // Handle drawing preview during mouse move (for trendline/rectangle)
        canvas.addEventListener('mousemove', (e) => {
            if (paneDrawing.active && (paneDrawing.tool === 'trendline' || paneDrawing.tool === 'rectangle')) {
                // Store current end position for preview
                const data = getDataFromMouse(e);
                paneDrawing.endX = data.x;
                paneDrawing.endY = data.y;
                paneDrawing.endPrice = data.price;
                paneDrawing.endIndex = data.dataIndex;
                // Trigger re-render for preview (optional - can add later)
            }
        });
        
        // Finish drawing on mouse up
        canvas.addEventListener('mouseup', (e) => {
            if (paneDrawing.active && (paneDrawing.tool === 'trendline' || paneDrawing.tool === 'rectangle')) {
                const data = getDataFromMouse(e);
                
                // Initialize drawings array if needed
                if (!pane.drawings) pane.drawings = [];
                
                // Store the drawing with data coordinates
                pane.drawings.push({
                    type: paneDrawing.tool,
                    startPrice: paneDrawing.startPrice,
                    endPrice: data.price,
                    startIndex: paneDrawing.startIndex,
                    endIndex: data.dataIndex,
                    color: paneDrawing.color
                });
                
                console.log('📊 Pane drawing finished:', paneDrawing.tool);
                
                paneDrawing.active = false;
                paneDrawing.tool = null;
                
                // Reset tool (one-shot drawing)
                if (window.drawingManager?.clearTool) {
                    window.drawingManager.clearTool();
                } else if (this.chart.drawingManager?.clearTool) {
                    this.chart.drawingManager.clearTool();
                }
                this.chart.tool = null;
                canvas.style.cursor = 'grab';
                
                // Re-render to show the drawing
                this.chart.render();
            }
        });
        
        // Handle free movement - both horizontal AND vertical at same time
        document.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            // Update crosshair if mouse is over this pane
            if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
                crosshairPos.x = mx;
                crosshairPos.y = my;
                pane.crosshair = { x: mx, y: my };
                // Render to show crosshair
                if (!freeDrag.isDragging) {
                    this.renderLinkedPanes();
                }
            }
            
            if (!freeDrag.isDragging) return;
            
            // Calculate delta - same as main chart
            const dx = e.clientX - freeDrag.lastX;
            const dy = e.clientY - freeDrag.lastY;
            
            // Use main chart's movement sensitivity (default 1.0)
            const sensitivity = this.chart.movement?.sensitivity || 1.0;
            
            // Horizontal movement - move main chart (both charts move together)
            // Match exactly how main chart does it
            if (dx !== 0) {
                this.chart.offsetX += dx * sensitivity;
                this.chart.constrainOffset();
            }
            
            // Vertical movement - move pane only
            // Inverted: drag down = chart goes up (show higher prices)
            if (dy !== 0) {
                pane.autoScale = false;
                const chartHeight = rect.height - margin.t - margin.b;
                const baseRange = pane.baseRange || (pane.yMax - pane.yMin) || 100;
                const displayedRange = baseRange / pane.priceZoom;
                const pricePerPixel = displayedRange / chartHeight;
                pane.priceOffset -= dy * pricePerPixel;
            }
            
            // Update last position
            freeDrag.lastX = e.clientX;
            freeDrag.lastY = e.clientY;
            
            // Use scheduleRender like main chart does for smooth performance
            if (dx !== 0 || dy !== 0) {
                if (this.chart.scheduleRender) {
                    this.chart.scheduleRender();
                } else {
                    this.chart.render();
                }
            }
        });
        
        // Mouse leave - hide crosshair
        canvas.addEventListener('mouseleave', () => {
            pane.crosshair = null;
            this.renderLinkedPanes();
        });
        
        document.addEventListener('mouseup', () => {
            if (freeDrag.isDragging) {
                freeDrag.isDragging = false;
                canvas.style.cursor = '';
            }
        });
    }
    
    /**
     * Show context menu for pane settings
     */
    showPaneContextMenu(pane, x, y) {
        // Remove existing menu
        const existing = document.getElementById('paneContextMenu');
        if (existing) existing.remove();
        
        const menu = document.createElement('div');
        menu.id = 'paneContextMenu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 4px;
            padding: 4px 0;
            z-index: 10000;
            min-width: 150px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
        `;
        
        const menuItems = [
            { label: 'Reset Scale', action: () => {
                pane.autoScale = true;
                pane.priceZoom = 1.0;
                pane.priceOffset = 0;
                this.renderLinkedPanes();
            }},
            { label: pane.autoScale ? '✓ Auto Scale' : 'Auto Scale', action: () => {
                pane.autoScale = !pane.autoScale;
                if (pane.autoScale) {
                    pane.priceZoom = 1.0;
                    pane.priceOffset = 0;
                }
                this.renderLinkedPanes();
            }},
            { label: '─', divider: true },
            { label: 'Settings...', action: () => this.openPaneSettings(pane) },
            { label: '─', divider: true },
            { label: 'Remove', action: () => this.removeLinkedPane(pane.id) }
        ];
        
        menuItems.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.style.cssText = 'height: 1px; background: #363a45; margin: 4px 0;';
                menu.appendChild(div);
            } else {
                const btn = document.createElement('div');
                btn.textContent = item.label;
                btn.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    color: #d1d4dc;
                `;
                btn.addEventListener('mouseenter', () => btn.style.background = '#2a2e39');
                btn.addEventListener('mouseleave', () => btn.style.background = '');
                btn.addEventListener('click', () => {
                    menu.remove();
                    item.action();
                });
                menu.appendChild(btn);
            }
        });
        
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    /**
     * Toggle pane visibility
     */
    togglePaneVisibility(paneId) {
        const pane = this.linkedPanes.find(p => p.id === paneId);
        if (!pane) return;
        
        pane.visible = !pane.visible;
        
        // Update icon
        const legend = document.getElementById(`linkedPaneLegend_${paneId}`);
        if (legend) {
            const btn = legend.querySelector('.pane-visibility-btn');
            if (btn) {
                if (pane.visible) {
                    btn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    `;
                    btn.title = 'Hide';
                } else {
                    btn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                    `;
                    btn.title = 'Show';
                }
            }
            
            // Dim the legend when hidden
            legend.style.opacity = pane.visible ? '1' : '0.5';
        }
        
        this.renderLinkedPanes();
    }
    
    /**
     * Change pane color
     */
    changePaneColor(pane) {
        // Cycle through colors
        const currentIndex = this.colors.indexOf(pane.color);
        const nextIndex = (currentIndex + 1) % this.colors.length;
        pane.color = this.colors[nextIndex];
        
        // Update legend
        const legend = document.getElementById(`linkedPaneLegend_${pane.id}`);
        if (legend) {
            const colorIndicator = legend.querySelector('.pane-color-indicator');
            const symbolSpan = legend.querySelector('.pane-symbol');
            if (colorIndicator) colorIndicator.style.background = pane.color;
            if (symbolSpan) symbolSpan.style.color = pane.color;
        }
        
        this.renderLinkedPanes();
    }
    
    /**
     * Update OHLC display for pane at given candle index
     */
    updatePaneOHLC(pane, candleIndex) {
        if (!pane.data || candleIndex < 0 || candleIndex >= pane.data.length) return;
        
        const candle = pane.data[candleIndex];
        if (!candle) return;
        
        const legend = document.getElementById(`linkedPaneLegend_${pane.id}`);
        if (!legend) return;
        
        const formatPrice = (p) => {
            if (p === undefined || p === null || isNaN(p)) return '--';
            return p > 100 ? p.toFixed(2) : (p > 10 ? p.toFixed(3) : p.toFixed(5));
        };
        
        const o = candle.o !== undefined ? candle.o : candle.open;
        const h = candle.h !== undefined ? candle.h : candle.high;
        const l = candle.l !== undefined ? candle.l : candle.low;
        const c = candle.c !== undefined ? candle.c : candle.close;
        
        const openEl = legend.querySelector('.pane-open');
        const highEl = legend.querySelector('.pane-high');
        const lowEl = legend.querySelector('.pane-low');
        const closeEl = legend.querySelector('.pane-close');
        
        if (openEl) openEl.textContent = formatPrice(o);
        if (highEl) highEl.textContent = formatPrice(h);
        if (lowEl) lowEl.textContent = formatPrice(l);
        if (closeEl) closeEl.textContent = formatPrice(c);
    }
    
    /**
     * Open settings dialog for pane - uses existing newPaneSettingsPopup
     */
    openPaneSettings(pane) {
        this.editingPaneId = pane.id;
        
        const popup = document.getElementById('newPaneSettingsPopup');
        if (!popup) return;
        
        // Set title
        document.getElementById('newPaneSettingsTitle').textContent = pane.symbol;
        
        // Set current values
        document.getElementById('newPaneStyleSelect').value = pane.displayType || 'candles';
        document.getElementById('newPaneShowBody').checked = pane.showBody !== false;
        document.getElementById('newPaneShowBorder').checked = pane.showBorder !== false;
        document.getElementById('newPaneShowWick').checked = pane.showWick !== false;
        document.getElementById('newPaneShowPriceLine').checked = pane.showPriceLine !== false;
        
        // Set colors
        const bodyUp = document.getElementById('newPaneBodyUp');
        const bodyDown = document.getElementById('newPaneBodyDown');
        const borderUp = document.getElementById('newPaneBorderUp');
        const borderDown = document.getElementById('newPaneBorderDown');
        const wickUp = document.getElementById('newPaneWickUp');
        const wickDown = document.getElementById('newPaneWickDown');
        
        if (bodyUp) {
            bodyUp.style.background = pane.upColor || '#089981';
            bodyUp.dataset.color = pane.upColor || '#089981';
        }
        if (bodyDown) {
            bodyDown.style.background = pane.downColor || '#f23645';
            bodyDown.dataset.color = pane.downColor || '#f23645';
        }
        if (borderUp) {
            borderUp.style.background = pane.upColor || '#089981';
            borderUp.dataset.color = pane.upColor || '#089981';
        }
        if (borderDown) {
            borderDown.style.background = pane.downColor || '#f23645';
            borderDown.dataset.color = pane.downColor || '#f23645';
        }
        if (wickUp) {
            wickUp.style.background = pane.upColor || '#089981';
            wickUp.dataset.color = pane.upColor || '#089981';
        }
        if (wickDown) {
            wickDown.style.background = pane.downColor || '#f23645';
            wickDown.dataset.color = pane.downColor || '#f23645';
        }
        
        popup.classList.add('open');
    }
    
    /**
     * Close pane settings popup
     */
    closePaneSettingsPopup() {
        const popup = document.getElementById('newPaneSettingsPopup');
        if (popup) {
            popup.classList.remove('open');
        }
        this.editingPaneId = null;
    }
    
    /**
     * Apply pane settings from popup
     */
    applyPaneSettings() {
        const pane = this.linkedPanes.find(p => p.id === this.editingPaneId);
        if (!pane) return;
        
        // Get values
        pane.displayType = document.getElementById('newPaneStyleSelect').value;
        pane.showBody = document.getElementById('newPaneShowBody').checked;
        pane.showBorder = document.getElementById('newPaneShowBorder').checked;
        pane.showWick = document.getElementById('newPaneShowWick').checked;
        pane.showPriceLine = document.getElementById('newPaneShowPriceLine').checked;
        
        // Get colors
        pane.upColor = document.getElementById('newPaneBodyUp').dataset.color;
        pane.downColor = document.getElementById('newPaneBodyDown').dataset.color;
        
        // Update legend color to match up color
        pane.color = pane.upColor;
        const legend = document.getElementById(`linkedPaneLegend_${pane.id}`);
        if (legend) {
            const colorIndicator = legend.querySelector('.pane-color-indicator');
            const symbolSpan = legend.querySelector('.pane-symbol');
            if (colorIndicator) colorIndicator.style.background = pane.color;
            if (symbolSpan) symbolSpan.style.color = pane.color;
        }
        
        this.closePaneSettingsPopup();
        this.renderLinkedPanes();
    }
    
    /**
     * Initialize pane settings popup handlers
     */
    initPaneSettingsPopup() {
        // Close button
        const closeBtn = document.getElementById('newPaneSettingsClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePaneSettingsPopup());
        }
        
        // Cancel button
        const cancelBtn = document.getElementById('newPaneSettingsCancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closePaneSettingsPopup());
        }
        
        // Ok button
        const okBtn = document.getElementById('newPaneSettingsOk');
        if (okBtn) {
            okBtn.addEventListener('click', () => this.applyPaneSettings());
        }
        
        // Click outside to close
        const popup = document.getElementById('newPaneSettingsPopup');
        if (popup) {
            popup.addEventListener('click', (e) => {
                if (e.target === popup) {
                    this.closePaneSettingsPopup();
                }
            });
        }
        
        // Color swatches - use existing color picker
        const colorSwatches = document.querySelectorAll('#newPaneSettingsPopup .overlay-color-swatch');
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                if (window.colorPicker) {
                    window.colorPicker.open(swatch.dataset.color, (newColor) => {
                        swatch.style.background = newColor;
                        swatch.dataset.color = newColor;
                    }, swatch);
                }
            });
        });
    }
    
    removeLinkedPane(paneId) {
        const index = this.linkedPanes.findIndex(p => p.id === paneId);
        if (index !== -1) {
            this.linkedPanes.splice(index, 1);
            
            // Remove DOM elements
            const wrapper = document.getElementById(`linkedPaneWrapper_${paneId}`);
            if (wrapper) wrapper.remove();
            
            this.renderSymbolsList();
            this.updateLinkedPanesLegend();
            
            console.log(`📊 Linked pane removed: ${paneId}`);
        }
    }
    
    updateLinkedPanesLegend() {
        // Update any legend displays if needed
    }
    
    // Update linked panes when timeframe changes
    onTimeframeChange(newTimeframe) {
        if (!this.linkedPanes || this.linkedPanes.length === 0) return;
        
        console.log(`📊 Updating linked panes for timeframe: ${newTimeframe}`);
        
        this.linkedPanes.forEach(pane => {
            pane.data = this.resampleData(pane.rawData, newTimeframe);
            this.calculateLinkedPaneScale(pane);
        });
        
        this.renderLinkedPanes();
    }
    
    renderActiveOverlays() {
        const container = document.getElementById('compareOverlaysList');
        const section = document.getElementById('compareActiveOverlays');
        if (!container) return;
        
        if (this.overlays.length === 0) {
            if (section) section.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        
        // Show the section when there are overlays
        if (section) section.style.display = 'block';
        container.innerHTML = '';
        
        this.overlays.forEach(overlay => {
            const item = document.createElement('div');
            item.className = 'compare-overlay-item';
            item.innerHTML = `
                <div class="compare-overlay-header">
                    <div class="compare-overlay-color" style="background: ${overlay.color}"></div>
                    <span class="compare-overlay-name">${overlay.symbol}</span>
                    <button class="compare-overlay-toggle ${overlay.visible ? 'visible' : ''}" 
                            data-id="${overlay.id}" title="Toggle visibility">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${overlay.visible 
                                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                            }
                        </svg>
                    </button>
                    <button class="compare-overlay-remove" data-id="${overlay.id}" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;
            
            // Add event listeners
            const toggleBtn = item.querySelector('.compare-overlay-toggle');
            toggleBtn.addEventListener('click', () => this.toggleVisibility(overlay.id));
            
            const removeBtn = item.querySelector('.compare-overlay-remove');
            removeBtn.addEventListener('click', () => this.removeOverlay(overlay.id));
            
            container.appendChild(item);
        });
    }
    
    async addOverlay(fileId, symbol) {
        // Check if already added
        if (this.overlays.find(o => o.fileId === fileId)) {
            console.log('Symbol already added as overlay');
            return;
        }
        
        try {
            console.log(`📊 Adding overlay: ${symbol} (fileId: ${fileId})`);
            
            // Fetch data for the overlay symbol
            const response = await fetch(`${this.apiUrl}/file/${fileId}?offset=0&limit=50000`);
            if (!response.ok) {
                throw new Error(`Failed to load data: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.data) {
                throw new Error('No data in response');
            }
            
            console.log(`📊 Received ${result.total} candles for overlay`);
            
            // Parse using chart's parsing logic
            const rawData = this.parseCSVData(result.data);
            console.log(`📊 Parsed ${rawData.length} candles`);
            
            // Resample to match current timeframe
            const resampledData = this.resampleData(rawData, this.chart.currentTimeframe);
            console.log(`📊 Resampled to ${resampledData.length} candles`);
            
            // Create overlay object with customization options
            const baseColor = this.getNextColor();
            const overlay = {
                id: Date.now().toString(),
                fileId: fileId,
                symbol: symbol,
                color: baseColor,
                visible: true,
                displayType: 'line',  // 'line' or 'candles'
                lineWidth: 2,
                opacity: 1.0,
                priceZoom: 1.0,      // Vertical scale multiplier
                priceOffset: 0,      // Vertical offset
                showPriceLine: true,
                // Candle colors
                bodyUpColor: '#26a69a',
                bodyDownColor: '#ef5350',
                borderUpColor: '#26a69a',
                borderDownColor: '#ef5350',
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
                showBody: true,
                showBorder: true,
                showWick: true,
                rawData: rawData,
                data: resampledData,
                yScale: null // Will be calculated during render
            };
            
            this.overlays.push(overlay);
            
            // Close the modal after adding
            this.closeModal();
            
            // Update UI
            this.updateCompareButton();
            this.renderActiveOverlays();
            this.renderSymbolsList();
            this.updateLegend();
            this.updateOverlayLegend();
            
            // Trigger chart re-render
            this.chart.render();
            
            console.log(`✅ Overlay added: ${symbol} with ${resampledData.length} candles`);
            
        } catch (error) {
            console.error('Failed to add overlay:', error);
            alert(`Failed to add ${symbol}: ${error.message}`);
        }
    }
    
    parseCSVData(csvText) {
        const data = [];
        const lines = csvText.trim().split('\n').filter(line => line.trim().length > 0);
        if (lines.length < 1) return data;
        
        // Detect header
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('open') || firstLine.includes('high') || 
                         firstLine.includes('low') || firstLine.includes('close') ||
                         firstLine.includes('ticker') || firstLine.includes('time');
        
        const dataStartIdx = hasHeader ? 1 : 0;
        
        // Detect separator
        let separator = ',';
        if (lines[dataStartIdx].split('\t').length > 4) separator = '\t';
        else if (lines[dataStartIdx].split(';').length > 4) separator = ';';
        
        // Find column indices
        let timeIdx = -1, dateIdx = -1, openIdx = -1, highIdx = -1, lowIdx = -1, closeIdx = -1, volIdx = -1, tickerIdx = -1;
        
        if (hasHeader) {
            const headers = lines[0].toLowerCase().split(separator).map(h => h.trim());
            timeIdx = headers.findIndex(h => h.includes('time') && !h.includes('date'));
            dateIdx = headers.findIndex(h => h.includes('date') || h.includes('dt') || h.includes('gmt'));
            openIdx = headers.findIndex(h => h.includes('open'));
            highIdx = headers.findIndex(h => h.includes('high'));
            lowIdx = headers.findIndex(h => h.includes('low'));
            closeIdx = headers.findIndex(h => h.includes('close'));
            volIdx = headers.findIndex(h => h.includes('vol'));
            tickerIdx = headers.findIndex(h => h.includes('ticker') || h.includes('symbol'));
            
            // If time column has date info, use it as dateIdx
            if (timeIdx >= 0 && dateIdx < 0 && lines.length > dataStartIdx) {
                const firstDataRow = lines[dataStartIdx].split(separator).map(c => c.trim());
                const timeValue = firstDataRow[timeIdx];
                if (timeValue && (timeValue.includes('.') || timeValue.includes('-') || timeValue.includes('/'))) {
                    dateIdx = timeIdx;
                    timeIdx = -1;
                }
            }
        } else {
            // No header - assume standard format
            const firstCol = lines[0].split(separator)[0].trim();
            const hasTicker = firstCol.length < 10 && /^[A-Z]+$/.test(firstCol);
            
            if (hasTicker) {
                tickerIdx = 0; dateIdx = 1; timeIdx = 2;
                openIdx = 3; highIdx = 4; lowIdx = 5; closeIdx = 6; volIdx = 7;
            } else {
                dateIdx = 0; openIdx = 1; highIdx = 2; lowIdx = 3; closeIdx = 4; volIdx = 5;
            }
        }
        
        console.log(`📊 CSV columns: date=${dateIdx}, time=${timeIdx}, OHLC=${openIdx},${highIdx},${lowIdx},${closeIdx}`);
        
        // Debug: show first data line
        if (lines.length > dataStartIdx) {
            console.log('📊 First data line:', lines[dataStartIdx]);
            const testCols = lines[dataStartIdx].split(separator);
            console.log('📊 Columns split:', testCols);
            if (dateIdx >= 0) console.log('📊 Date value:', testCols[dateIdx]);
            if (timeIdx >= 0) console.log('📊 Time value:', testCols[timeIdx]);
        }
        
        // Parse data rows
        for (let i = dataStartIdx; i < lines.length; i++) {
            const cols = lines[i].split(separator).map(c => c.trim());
            
            // Parse timestamp
            let timestamp = null;
            if (dateIdx >= 0) {
                let dateStr = cols[dateIdx];
                if (timeIdx >= 0 && cols[timeIdx]) {
                    dateStr += ' ' + cols[timeIdx];
                }
                timestamp = this.parseDateTime(dateStr);
                
                // Debug first few failures
                if (!timestamp && i < dataStartIdx + 3) {
                    console.log('📊 Failed to parse date:', dateStr);
                }
            }
            
            if (!timestamp) continue;
            
            const open = parseFloat(cols[openIdx]);
            const high = parseFloat(cols[highIdx]);
            const low = parseFloat(cols[lowIdx]);
            const close = parseFloat(cols[closeIdx]);
            const volume = volIdx >= 0 ? parseFloat(cols[volIdx]) || 0 : 0;
            
            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
            
            data.push({ t: timestamp, o: open, h: high, l: low, c: close, v: volume });
        }
        
        // Sort by timestamp
        data.sort((a, b) => a.t - b.t);
        
        return data;
    }
    
    parseDateTime(dateStr) {
        if (!dateStr) return null;
        
        // Clean the string
        dateStr = dateStr.trim();
        
        // Handle YYYYMMDD HHMM format (e.g., "20180401 2104" or "20180401 210400")
        const compactMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})?$/);
        if (compactMatch) {
            const [, year, month, day, hour, minute, second = '0'] = compactMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second || 0)).getTime();
        }
        
        // Handle YYYYMMDD only (no time)
        const dateOnlyMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (dateOnlyMatch) {
            const [, year, month, day] = dateOnlyMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
        }
        
        // Try parsing as Unix timestamp
        if (/^\d+$/.test(dateStr)) {
            const num = parseInt(dateStr);
            return num > 1e12 ? num : num * 1000;
        }
        
        // Handle DD.MM.YYYY HH:MM:SS.mmm format
        const dotMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s*(\d{2}):(\d{2}):?(\d{2})?/);
        if (dotMatch) {
            const [, day, month, year, hour, minute, second = '0'] = dotMatch;
            return new Date(year, month - 1, day, hour, minute, parseInt(second)).getTime();
        }
        
        // Handle YYYY-MM-DD or YYYY/MM/DD format
        const isoMatch = dateStr.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/);
        if (isoMatch) {
            const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoMatch;
            return new Date(year, month - 1, day, parseInt(hour), parseInt(minute), parseInt(second)).getTime();
        }
        
        // Fallback to Date.parse
        const parsed = Date.parse(dateStr);
        return isNaN(parsed) ? null : parsed;
    }
    
    resampleData(rawData, timeframe) {
        if (!rawData || rawData.length === 0) return [];
        
        // Use chart's resample function if available
        if (this.chart.resampleData) {
            return this.chart.resampleData(rawData, timeframe);
        }
        
        // Fallback: return raw data if no resampling available
        return rawData;
    }
    
    removeOverlay(overlayId) {
        const index = this.overlays.findIndex(o => o.id === overlayId);
        if (index > -1) {
            this.overlays.splice(index, 1);
            this.updateCompareButton();
            this.renderActiveOverlays();
            this.renderSymbolsList();
            this.updateLegend();
            this.updateOverlayLegend();
            this.chart.render();
        }
    }
    
    toggleVisibility(overlayId) {
        const overlay = this.overlays.find(o => o.id === overlayId);
        if (overlay) {
            overlay.visible = !overlay.visible;
            this.renderActiveOverlays();
            this.updateLegend();
            this.updateOverlayLegend();
            this.chart.render();
        }
    }
    
    getNextColor() {
        const color = this.colors[this.colorIndex % this.colors.length];
        this.colorIndex++;
        return color;
    }
    
    updateCompareButton() {
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn) {
            if (this.overlays.length > 0) {
                compareBtn.classList.add('active');
            } else {
                compareBtn.classList.remove('active');
            }
        }
    }
    
    updateLegend() {
        // Old legend - just hide it, we use updateOverlayLegend now
        const legend = document.getElementById('overlayLegend');
        if (legend) legend.style.display = 'none';
    }
    
    /**
     * Update chart left margin based on visible overlays
     * Called before chart draws to ensure correct spacing
     */
    updateLeftMargin() {
        const visibleOverlays = this.overlays.filter(o => o.visible).length;
        const axisWidth = this.chart.margin.r; // Same width as main chart Y-axis
        this.chart.margin.l = visibleOverlays * axisWidth;
    }
    
    /**
     * Called during chart render to draw overlays
     */
    drawOverlays() {
        const visibleOverlays = this.overlays.filter(o => o.visible);
        if (visibleOverlays.length === 0) {
            // Reset left margin and logo position when no overlays
            this.chart.margin.l = 0;
            const chartBrand = document.querySelector('.chart-brand');
            if (chartBrand) {
                chartBrand.style.left = '0px';
            }
            return;
        }
        
        const ctx = this.chart.ctx;
        const m = this.chart.margin;
        const chartWidth = this.chart.w - m.l - m.r;
        const effectiveVolumeHeight = this.chart.chartSettings?.showVolume ? 
            (this.chart.h - m.t - m.b) * this.chart.volumeHeight : 0;
        const priceHeight = (this.chart.h - m.t - m.b) - effectiveVolumeHeight;
        
        // Get main chart's visible range
        const mainData = this.chart.data;
        if (!mainData || mainData.length === 0) return;
        
        const candleSpacing = this.chart.getCandleSpacing();
        const firstVisibleIndex = Math.floor(-this.chart.offsetX / candleSpacing);
        const numVisibleCandles = Math.ceil(this.chart.w / candleSpacing);
        const startIdx = Math.max(0, firstVisibleIndex);
        const endIdx = Math.min(mainData.length, firstVisibleIndex + numVisibleCandles + 2);
        
        // Get visible time range from main chart
        const visibleStartTime = mainData[startIdx]?.t;
        const visibleEndTime = mainData[Math.min(endIdx, mainData.length - 1)]?.t;
        
        if (!visibleStartTime || !visibleEndTime) return;
        
        // Debug: log time ranges once
        if (!this._debugLogged) {
            console.log('📊 Main chart time range:', new Date(visibleStartTime), 'to', new Date(visibleEndTime));
            this.overlays.forEach(o => {
                if (o.data.length > 0) {
                    console.log(`📊 Overlay ${o.symbol} time range:`, new Date(o.data[0].t), 'to', new Date(o.data[o.data.length-1].t));
                }
            });
            this._debugLogged = true;
        }
        
        // Set clipping region to keep overlays within chart area
        ctx.save();
        ctx.beginPath();
        ctx.rect(m.l, m.t, chartWidth, priceHeight);
        ctx.clip();
        
        visibleOverlays.forEach((overlay, overlayIndex) => {
            // Filter overlay data to visible time range
            const overlayData = overlay.data.filter(d => 
                d.t >= visibleStartTime && d.t <= visibleEndTime
            );
            
            if (overlayData.length < 2) {
                console.log(`📊 Overlay ${overlay.symbol}: only ${overlayData.length} candles in visible range`);
                return;
            }
            
            // Calculate Y scale for this overlay (its own price range)
            let minPrice = Infinity, maxPrice = -Infinity;
            overlayData.forEach(d => {
                if (d.c < minPrice) minPrice = d.c;
                if (d.c > maxPrice) maxPrice = d.c;
            });
            
            let priceRange = maxPrice - minPrice || 1;
            const padding = priceRange * 0.1;
            minPrice -= padding;
            maxPrice += padding;
            
            // Apply zoom and offset
            const midPrice = (minPrice + maxPrice) / 2;
            priceRange = (maxPrice - minPrice) / overlay.priceZoom;
            minPrice = midPrice - priceRange / 2 + overlay.priceOffset;
            maxPrice = midPrice + priceRange / 2 + overlay.priceOffset;
            
            // Create Y scale for overlay
            const overlayYScale = (price) => {
                return m.t + priceHeight - ((price - minPrice) / (maxPrice - minPrice)) * priceHeight;
            };
            
            // Store scale info on overlay for drag operations
            overlay.yScale = {
                domain: () => [minPrice, maxPrice],
                range: () => [m.t + priceHeight, m.t]
            };
            
            // Draw based on display type
            ctx.save();
            ctx.globalAlpha = overlay.opacity;
            
            if (overlay.displayType === 'candles') {
                // Draw as candles with customizable colors
                const candleWidth = Math.max(1, this.chart.candleWidth * 0.6);
                
                overlayData.forEach((candle, i) => {
                    const mainIndex = this.findClosestIndex(mainData, candle.t, startIdx, endIdx);
                    if (mainIndex === -1) return;
                    
                    // Use chart's dataIndexToPixel for smooth movement (includes offsetX)
                    const x = Math.round(this.chart.dataIndexToPixel(mainIndex));
                    const yOpen = Math.round(overlayYScale(candle.o));
                    const yClose = Math.round(overlayYScale(candle.c));
                    const yHigh = Math.round(overlayYScale(candle.h));
                    const yLow = Math.round(overlayYScale(candle.l));
                    
                    const isBullish = candle.c >= candle.o;
                    const bodyLeft = Math.round(x - candleWidth / 2);
                    const bodyWidthRound = Math.round(candleWidth);
                    
                    // Draw wick
                    if (overlay.showWick) {
                        ctx.strokeStyle = isBullish ? overlay.wickUpColor : overlay.wickDownColor;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x, yHigh);
                        ctx.lineTo(x, yLow);
                        ctx.stroke();
                    }
                    
                    // Draw body
                    const bodyTop = Math.min(yOpen, yClose);
                    const bodyHeight = Math.abs(yClose - yOpen) || 1;
                    
                    if (overlay.showBody) {
                        if (isBullish) {
                            // Bullish candle - fill with up color
                            ctx.fillStyle = overlay.bodyUpColor;
                            ctx.fillRect(bodyLeft, bodyTop, bodyWidthRound, bodyHeight);
                            if (overlay.showBorder) {
                                ctx.strokeStyle = overlay.borderUpColor;
                                ctx.lineWidth = 1;
                                ctx.strokeRect(bodyLeft + 0.5, bodyTop + 0.5, bodyWidthRound - 1, bodyHeight - 1);
                            }
                        } else {
                            // Bearish candle - fill with down color
                            ctx.fillStyle = overlay.bodyDownColor;
                            ctx.fillRect(bodyLeft, bodyTop, bodyWidthRound, bodyHeight);
                            if (overlay.showBorder) {
                                ctx.strokeStyle = overlay.borderDownColor;
                                ctx.lineWidth = 1;
                                ctx.strokeRect(bodyLeft + 0.5, bodyTop + 0.5, bodyWidthRound - 1, bodyHeight - 1);
                            }
                        }
                    }
                });
            } else {
                // Draw as line
                ctx.strokeStyle = overlay.color;
                ctx.lineWidth = overlay.lineWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                
                let started = false;
                overlayData.forEach((candle, i) => {
                    const mainIndex = this.findClosestIndex(mainData, candle.t, startIdx, endIdx);
                    if (mainIndex === -1) return;
                    
                    // Use chart's dataIndexToPixel for smooth movement
                    const x = Math.round(this.chart.dataIndexToPixel(mainIndex));
                    const y = Math.round(overlayYScale(candle.c));
                    
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                
                ctx.stroke();
            }
            
            ctx.restore();
        });
        
        // Restore after clipping - now draw Y-axes OUTSIDE clip region
        ctx.restore();
        
        // Draw overlay Y-axes and info after clipping is removed
        visibleOverlays.forEach((overlay, overlayIndex) => {
            const overlayData = overlay.data.filter(d => 
                d.t >= visibleStartTime && d.t <= visibleEndTime
            );
            if (overlayData.length < 2) return;
            
            // Recalculate Y scale for axis drawing
            let minPrice = Infinity, maxPrice = -Infinity;
            overlayData.forEach(d => {
                if (d.c < minPrice) minPrice = d.c;
                if (d.c > maxPrice) maxPrice = d.c;
            });
            let priceRangeCalc = maxPrice - minPrice || 1;
            const padding = priceRangeCalc * 0.1;
            minPrice -= padding;
            maxPrice += padding;
            const midPrice = (minPrice + maxPrice) / 2;
            priceRangeCalc = (maxPrice - minPrice) / overlay.priceZoom;
            minPrice = midPrice - priceRangeCalc / 2 + overlay.priceOffset;
            maxPrice = midPrice + priceRangeCalc / 2 + overlay.priceOffset;
            
            const overlayYScale = (price) => {
                return m.t + priceHeight - ((price - minPrice) / (maxPrice - minPrice)) * priceHeight;
            };
            
            // Draw left Y-axis for this overlay
            this.drawOverlayYAxis(overlay, minPrice, maxPrice, priceHeight, overlayIndex, overlayYScale);
            
            // Draw overlay info bar at top (like TradingView)
            this.drawOverlayInfo(overlay, overlayData, overlayIndex);
        });
    }
    
    drawOverlayInfo(overlay, overlayData, index) {
        // Use HTML overlay legend instead of canvas drawing
        this.updateOverlayLegend();
    }
    
    updateOverlayLegend() {
        let legend = document.getElementById('overlayLegendContainer');
        
        if (!legend) {
            legend = document.createElement('div');
            legend.id = 'overlayLegendContainer';
            legend.style.cssText = `
                position: absolute;
                top: 52px;
                left: 10px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                z-index: 100;
                pointer-events: auto;
            `;
            this.chart.canvas.parentElement.appendChild(legend);
        }
        
        // Update top position (below OHLC info and Volume)
        legend.style.top = '52px';
        
        // Clear and rebuild
        legend.innerHTML = '';
        
        // Show ALL overlays (not just visible ones) so we can toggle visibility
        this.overlays.forEach((overlay, index) => {
            const latestCandle = overlay.data[overlay.data.length - 1];
            if (!latestCandle) return;
            
            const decimals = this.getPriceDecimals(latestCandle.h - latestCandle.l);
            const isBullish = latestCandle.c >= latestCandle.o;
            const changeColor = isBullish ? '#26a69a' : '#ef5350';
            const isHidden = !overlay.visible;
            
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: Roboto, sans-serif;
                font-size: 12px;
            `;
            
            const iconBtnStyle = `
                background: none;
                border: none;
                color: #787b86;
                cursor: pointer;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.15s;
            `;
            
            // Eye icon - different for visible/hidden
            const eyeIcon = isHidden ? `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
            ` : `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            `;
            
            const isSelected = this.selectedOverlay === overlay.id;
            
            row.innerHTML = `
                <div class="overlay-legend-row" data-overlay-id="${overlay.id}" style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 2px 0;
                    opacity: ${isHidden ? '0.5' : '1'};
                    cursor: pointer;
                ">
                    <span style="
                        width: 10px;
                        height: 10px;
                        background: ${overlay.color};
                        border-radius: 2px;
                        ${isSelected ? 'box-shadow: 0 0 0 2px #2962ff;' : ''}
                    "></span>
                    <span style="color: ${overlay.color}; font-weight: 500;">${overlay.symbol}</span>
                    ${isSelected ? '<span style="color: #2962ff; font-size: 10px;">↕</span>' : ''}
                    <button class="overlay-visibility-btn" data-id="${overlay.id}" title="${isHidden ? 'Show' : 'Hide'}" style="${iconBtnStyle}">
                        ${eyeIcon}
                    </button>
                    <button class="overlay-settings-btn" data-id="${overlay.id}" title="Settings" style="${iconBtnStyle}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="overlay-delete-btn" data-id="${overlay.id}" title="Delete" style="${iconBtnStyle}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
                <span style="color: #787b86;">O</span>
                <span style="color: ${changeColor};">${latestCandle.o.toFixed(decimals)}</span>
                <span style="color: #787b86;">H</span>
                <span style="color: ${changeColor};">${latestCandle.h.toFixed(decimals)}</span>
                <span style="color: #787b86;">L</span>
                <span style="color: ${changeColor};">${latestCandle.l.toFixed(decimals)}</span>
                <span style="color: #787b86;">C</span>
                <span style="color: ${changeColor};">${latestCandle.c.toFixed(decimals)}</span>
            `;
            
            // Add hover effects
            row.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mouseenter', () => btn.style.color = '#d1d4dc');
                btn.addEventListener('mouseleave', () => btn.style.color = '#787b86');
            });
            
            // Visibility button
            const visibilityBtn = row.querySelector('.overlay-visibility-btn');
            visibilityBtn.addEventListener('click', () => {
                this.toggleVisibility(overlay.id);
            });
            
            // Settings button - open settings popup
            const settingsBtn = row.querySelector('.overlay-settings-btn');
            settingsBtn.addEventListener('click', () => {
                this.openSettingsPopup(overlay.id);
            });
            
            // Delete button
            const deleteBtn = row.querySelector('.overlay-delete-btn');
            deleteBtn.addEventListener('click', () => {
                this.removeOverlay(overlay.id);
            });
            
            // Click on row to select/deselect for moving
            const legendRow = row.querySelector('.overlay-legend-row');
            legendRow.addEventListener('click', (e) => {
                // Don't select if clicking a button
                if (e.target.closest('button')) return;
                
                // Toggle selection
                if (this.selectedOverlay === overlay.id) {
                    this.selectedOverlay = null;
                } else {
                    this.selectedOverlay = overlay.id;
                }
                this.updateOverlayLegend();
            });
            
            legend.appendChild(row);
        });
        
        // Hide legend if no overlays at all
        legend.style.display = this.overlays.length > 0 ? 'flex' : 'none';
        
        // Update positions to avoid overlap with Y-axes
        this.updateInfoPositions();
    }
    
    updateInfoPositions() {
        // Calculate left offset based on number of visible overlays
        const visibleOverlays = this.overlays.filter(o => o.visible).length;
        const axisWidth = this.chart.margin.r; // Same width as main chart Y-axis
        const leftMargin = visibleOverlays * axisWidth;
        const baseLeft = 10; // Base left position
        const leftOffset = baseLeft + leftMargin;
        
        // Update chart's left margin to make room for overlay Y-axes
        this.chart.margin.l = leftMargin;
        
        // Update main chart OHLC info
        const ohlcInfo = document.getElementById('ohlcInfo');
        if (ohlcInfo) {
            ohlcInfo.style.left = leftOffset + 'px';
        }
        
        // Update overlay legend
        const legend = document.getElementById('overlayLegendContainer');
        if (legend) {
            legend.style.left = leftOffset + 'px';
        }
        
        // Update chart brand/logo position
        const chartBrand = document.querySelector('.chart-brand');
        if (chartBrand) {
            chartBrand.style.left = leftMargin + 'px';
        }
    }
    
    findClosestIndex(data, timestamp, startIdx, endIdx) {
        let closestIdx = -1;
        let minDiff = Infinity;
        
        for (let i = startIdx; i < endIdx && i < data.length; i++) {
            const diff = Math.abs(data[i].t - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        
        // Only return if within reasonable time range (half a candle width)
        const timeframe = this.chart.currentTimeframe;
        const maxDiff = this.getTimeframeDuration(timeframe) / 2;
        
        return minDiff <= maxDiff ? closestIdx : -1;
    }
    
    getTimeframeDuration(timeframe) {
        const durations = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1mo': 30 * 24 * 60 * 60 * 1000
        };
        return durations[timeframe] || 60 * 1000;
    }
    
    drawOverlayYAxis(overlay, minPrice, maxPrice, priceHeight, index, yScale) {
        const ctx = this.chart.ctx;
        const m = this.chart.margin;
        
        // Position left Y-axis (same width as right axis, stacked for multiple overlays)
        const axisWidth = m.r; // Same as right margin
        const axisX = index * axisWidth; // Stack axes side by side
        
        ctx.save();
        
        // Draw axis background - same as chart background
        ctx.fillStyle = this.chart.chartSettings?.backgroundColor || '#131722';
        ctx.fillRect(axisX, m.t, axisWidth, priceHeight);
        
        // Draw axis border (right edge) - same opacity as main chart
        ctx.strokeStyle = '#e0e3eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(axisX + axisWidth, m.t);
        ctx.lineTo(axisX + axisWidth, m.t + priceHeight);
        ctx.stroke();
        
        // Calculate nice round tick values - same as main chart
        const numTicks = Math.max(8, Math.min(15, Math.floor(priceHeight / 60)));
        const priceRange = maxPrice - minPrice;
        const decimals = this.getPriceDecimals(priceRange);
        
        // Generate nice round tick values (like d3.ticks)
        const ticks = this.generateNiceTicks(minPrice, maxPrice, numTicks);
        
        // Draw price labels and tick marks - same style as right axis
        ctx.font = `${this.chart.chartSettings?.scaleTextSize || 12}px Roboto`;
        ctx.textAlign = 'left';
        ctx.fillStyle = this.chart.chartSettings?.scaleTextColor || '#787b86';
        
        ticks.forEach(price => {
            // Use yScale to get Y position - this makes labels move with the chart
            const y = yScale(price);
            

            if (y < m.t + 5 || y > m.t + priceHeight - 5) return;
            
            // Draw tick mark - same as main chart
            ctx.strokeStyle = '#e0e3eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(axisX + axisWidth - 5, y);
            ctx.lineTo(axisX + axisWidth, y);
            ctx.stroke();
            
            // Price label - same as main chart (8px padding like right axis)
            ctx.fillStyle = this.chart.chartSettings?.scaleTextColor || '#787b86';
            const priceStr = price.toFixed(decimals);
            ctx.fillText(priceStr, axisX + 8, y + 4);
        });
        
        // Draw current price label (floating, like main chart)
        if (overlay.showPriceLine) {
            const latestCandle = overlay.data[overlay.data.length - 1];
            if (latestCandle && yScale) {
                const currentPrice = latestCandle.c;
                const currentY = yScale(currentPrice);
                
                // Only draw if within visible area
                if (currentY >= m.t && currentY <= m.t + priceHeight) {
                    const priceStr = currentPrice.toFixed(decimals);
                    ctx.font = 'bold 11px Roboto';
                    const labelHeight = 18;
                    
                    // Draw label background
                    ctx.fillStyle = overlay.color;
                    ctx.fillRect(axisX, currentY - labelHeight/2, axisWidth, labelHeight);
                    
                    // Draw price text
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(priceStr, axisX + 8, currentY + 4);
                    
                    // Draw dashed line across chart
                    ctx.strokeStyle = overlay.color;
                    ctx.globalAlpha = 0.4;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(axisX + axisWidth, currentY);
                    ctx.lineTo(this.chart.w - m.r, currentY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                }
            }
        }
        
        ctx.restore();
    }
    
    getPriceDecimals(priceRange) {
        if (priceRange >= 100) return 0;
        if (priceRange >= 10) return 1;
        if (priceRange >= 1) return 2;
        if (priceRange >= 0.1) return 3;
        if (priceRange >= 0.01) return 4;
        return 5;
    }
    
    generateNiceTicks(min, max, count) {
        // Generate nice round tick values similar to d3.ticks
        const range = max - min;
        if (range <= 0) return [min];
        
        // Calculate step size for nice round numbers
        const rawStep = range / count;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const residual = rawStep / magnitude;
        
        let niceStep;
        if (residual >= 5) niceStep = 10 * magnitude;
        else if (residual >= 2) niceStep = 5 * magnitude;
        else if (residual >= 1) niceStep = 2 * magnitude;
        else niceStep = magnitude;
        
        // Generate ticks
        const ticks = [];
        const start = Math.ceil(min / niceStep) * niceStep;
        const end = Math.floor(max / niceStep) * niceStep;
        
        for (let tick = start; tick <= end; tick += niceStep) {
            // Avoid floating point issues
            const roundedTick = Math.round(tick * 1e10) / 1e10;
            ticks.push(roundedTick);
        }
        
        return ticks;
    }
    
    darkenColor(color, factor) {
        // Convert hex to RGB
        let hex = color.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Darken
        const dr = Math.round(r * factor);
        const dg = Math.round(g * factor);
        const db = Math.round(b * factor);
        
        return `rgb(${dr}, ${dg}, ${db})`;
    }
    
    formatPrice(price) {
        if (!isFinite(price)) return '—';
        const abs = Math.abs(price);
        let decimals;
        if (abs >= 1000) {
            decimals = 2;
        } else if (abs >= 1) {
            decimals = 4;
        } else {
            decimals = 5;
        }
        return price.toFixed(decimals);
    }
    
    /**
     * Refresh overlays when timeframe changes
     */
    refreshForTimeframe(timeframe) {
        this.overlays.forEach(overlay => {
            overlay.data = this.resampleData(overlay.rawData, timeframe);
        });
        this.chart.render();
    }
    
    /**
     * Clear all overlays
     */
    clearAll() {
        this.overlays = [];
        this.colorIndex = 0;
        this.updateCompareButton();
        this.updateLegend();
        this.chart.render();
    }
}

// Export for use
window.CompareOverlay = CompareOverlay;
