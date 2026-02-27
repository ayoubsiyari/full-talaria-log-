/**
 * Panel Manager - Multi-panel chart layout system
 * Allows splitting the chart view into multiple panels with different timeframes
 */

class PanelManager {
    constructor(container) {
        this.container = container;
        this.panels = [];
        this.currentLayout = '1'; // Default: single panel
        this.layoutSelector = null;
        this.selectedPanelIndex = 0; // Currently selected panel
        
        // Maximize state
        this.maximizedPanelIndex = null;
        this.layoutBeforeMaximize = null;
        this.panelSizesBeforeMaximize = null;
        
        // Resize state
        this.resizeHandles = [];
        this.isResizing = false;
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.resizeHandle = null;
        
        // Sync settings - time enabled by default for smooth scroll sync
        this.syncSettings = {
            symbol: false,      // Sync symbol/data across all panels
            interval: false,    // Sync timeframe across all panels
            crosshair: true,    // Sync crosshair position
            time: true,         // Sync time/scroll position (enabled by default)
            dateRange: false,   // Sync visible date range
            drawings: true      // Sync drawings across all panels
        };
        
        // Load saved sync settings
        this.loadSyncSettings();
        
        this.init();
    }
    
    /**
     * Load sync settings from localStorage
     */
    loadSyncSettings() {
        try {
            const saved = localStorage.getItem('chart_panel_sync_settings');
            if (saved) {
                this.syncSettings = { ...this.syncSettings, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Failed to load sync settings:', e);
        }
    }
    
    /**
     * Save sync settings to localStorage
     */
    saveSyncSettings() {
        try {
            localStorage.setItem('chart_panel_sync_settings', JSON.stringify(this.syncSettings));
        } catch (e) {
            console.warn('Failed to save sync settings:', e);
        }
    }
    
    /**
     * Initialize panel manager
     */
    init() {
        // Create layout selector button in toolbar
        this.createLayoutSelector();
        
        // Setup event listeners for panel synchronization
        this.setupEventListeners();
        
        // Default: show original chart (layout '1')
        // Don't call applyLayout - original chart is already visible
        this.currentLayout = '1';
    }
    
    /**
     * Setup event listeners for panel synchronization
     */
    setupEventListeners() {
        // Listen for scroll sync events from charts
        window.addEventListener('chartScrolled', (e) => {
            const { panel, offsetX, candleWidth } = e.detail;
            if (panel && this.syncSettings.time) {
                this.syncScroll(panel, offsetX, candleWidth);
            }
        });
    }
    
    /**
     * Create layout selector button
     */
    createLayoutSelector() {
        // Find existing layout button in HTML
        const layoutBtn = document.getElementById('layout-selector-btn');
        if (!layoutBtn) {
            console.error('Layout button not found in HTML');
            return;
        }
        
        console.log('✅ Layout button found, attaching dropdown');
        
        // Create layout dropdown
        this.createLayoutDropdown(layoutBtn);
    }
    /**
     * Create layout selection dropdown
     */
    createLayoutDropdown(button) {
        const dropdown = document.createElement('div');
        dropdown.className = 'layout-dropdown';
        dropdown.style.cssText = `
            position: fixed;
            top: 56px;
            right: auto;
            left: auto;
            background: #131722;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
            padding: 16px;
            display: none;
            z-index: 10000;
            min-width: 280px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            color: #d1d4dc;
        `;
        
        dropdown.innerHTML = `
            <div class="layout-dropdown-title" style="font-weight: 500; margin-bottom: 16px; font-size: 13px; color: #787b86; text-transform: uppercase; letter-spacing: 0.5px;">Layout</div>
            
            <!-- Single Panel -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">1</div>
                <div style="display: flex; gap: 8px;">
                    <button class="layout-option active" data-layout="1" title="Single panel">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="26" fill="none" stroke="currentColor" stroke-width="2" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 2 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">2</div>
                <div style="display: flex; gap: 8px;">
                    <button class="layout-option" data-layout="2v" title="Vertical split">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="26" fill="none" stroke="currentColor" stroke-width="2" rx="2"/>
                            <rect x="21" y="2" width="17" height="26" fill="none" stroke="currentColor" stroke-width="2" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="2h" title="Horizontal split">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="12" fill="none" stroke="currentColor" stroke-width="2" rx="2"/>
                            <rect x="2" y="16" width="36" height="12" fill="none" stroke="currentColor" stroke-width="2" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 3 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">3</div>
                <div style="display: flex; gap: 8px;">
                    <button class="layout-option" data-layout="3v" title="3 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="11" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="2" width="11" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="2" width="11" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="3h" title="3 horizontal">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="11" width="36" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="20" width="36" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="3l" title="Left + 2 right">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 4 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">4</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="layout-option" data-layout="4" title="2x2 grid">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="4v" title="4 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="8" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="11" y="2" width="8" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="20" y="2" width="8" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="29" y="2" width="8" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="4h" title="4 horizontal">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="9" width="36" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="36" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="23" width="36" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="4t" title="Top 1 + bottom 3">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="4b" title="Top 3 + bottom 1">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="36" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="4r" title="Left 3 + right 1">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="11" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="20" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 5 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">5</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="layout-option" data-layout="5a" title="Top 2 + bottom 3">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="5b" title="Top 3 + bottom 2">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="5c" title="Left 2 + right 3">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="17" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="11" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="20" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="5v" title="5 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="6" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="9.5" y="2" width="6" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="17" y="2" width="6" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="24.5" y="2" width="6" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="32" y="2" width="6" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="5h" title="5 horizontal">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="4.4" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="7.6" width="36" height="4.4" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="13.2" width="36" height="4.4" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="18.8" width="36" height="4.4" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="24.4" width="36" height="4.4" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 6 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">6</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="layout-option" data-layout="6" title="2x3 grid">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="2" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.5" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="27" y="16" width="11" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="6b" title="3x2 grid">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="2" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="11" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="11" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="2" y="20" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="21" y="20" width="17" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="6v" title="6 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="8.2" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="14.4" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="20.6" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="26.8" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                            <rect x="33" y="2" width="5" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="2"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="6h" title="6 horizontal">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="6.5" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="11" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="15.5" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="20" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="24.5" width="36" height="3.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 7 Panels -->
            <div class="layout-row" style="margin-bottom: 12px;">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">7</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="layout-option" data-layout="7v" title="7 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="7.3" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="12.6" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="17.9" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="23.2" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="28.5" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="33.8" y="2" width="4.3" height="26" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="7a" title="Top 3 + middle 3 + bottom 1">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="14.5" y="2" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="27" y="2" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="11.5" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="14.5" y="11.5" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="27" y="11.5" width="11" height="8" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="21" width="36" height="7" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- 8 Panels -->
            <div class="layout-row">
                <div class="layout-label layout-num" style="font-size: 12px; margin-bottom: 6px;">8</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="layout-option" data-layout="8" title="2x4 grid">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="11" y="2" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="20" y="2" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="29" y="2" width="9" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="16" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="11" y="16" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="20" y="16" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="29" y="16" width="9" height="12" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="8b" title="4x2 grid">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="21" y="2" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="9" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="21" y="9" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="16" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="21" y="16" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="2" y="23" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                            <rect x="21" y="23" width="17" height="5.5" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="8v" title="8 vertical">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="6.5" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="11" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="15.5" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="20" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="24.5" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="29" y="2" width="3.5" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="33.5" y="2" width="4" height="26" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                        </svg>
                    </button>
                    <button class="layout-option" data-layout="8h" title="8 horizontal">
                        <svg width="40" height="30" viewBox="0 0 40 30">
                            <rect x="2" y="2" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="5.5" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="9" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="12.5" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="16" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="19.5" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="23" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                            <rect x="2" y="26.5" width="36" height="2.5" fill="none" stroke="currentColor" stroke-width="1" rx="1"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Sync Settings -->
            <div class="sync-settings-section sync-section">
                <div class="sync-title">SYNC IN LAYOUT</div>
                
                <!-- Symbol Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Symbol</span>
                        <div class="sync-info" title="When enabled, changing symbol in one panel changes it in all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="symbol-sync-toggle">
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Interval Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Interval</span>
                        <div class="sync-info" title="When enabled, changing timeframe in one panel changes it in all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="interval-sync-toggle">
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Crosshair Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Crosshair</span>
                        <div class="sync-info" title="Synchronize crosshair position across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="crosshair-sync-toggle" checked>
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Time Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Time</span>
                        <div class="sync-info" title="Synchronize scroll position (time) across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="time-sync-toggle" checked>
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Date Range Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Date range</span>
                        <div class="sync-info" title="Synchronize visible date range across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="daterange-sync-toggle">
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
                
                <!-- Drawings Toggle -->
                <div class="sync-row sync-row-border">
                    <div class="sync-label">
                        <span>Drawings</span>
                        <div class="sync-info" title="Synchronize drawings and shapes across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" id="drawings-sync-toggle">
                        <span class="sync-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .layout-option {
                background: #0d0f14;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                padding: 8px;
                cursor: default;
                transition: all 0.15s ease;
            }
            .layout-option:hover {
                border-color: rgba(41, 98, 255, 0.5);
                background: rgba(41, 98, 255, 0.1);
            }
            .layout-option.active {
                border-color: #2962ff;
                background: rgba(41, 98, 255, 0.2);
            }
            .layout-option svg {
                display: block;
                stroke: #787b86;
            }
            .layout-option:hover svg,
            .layout-option.active svg {
                stroke: #d1d4dc;
            }
            
            /* Toggle Switch Styling */
            .sync-toggle {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                cursor: default;
            }
            .sync-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .sync-toggle-slider {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                border-radius: 24px;
                transition: 0.3s;
            }
            .sync-toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                border-radius: 50%;
                transition: 0.3s;
            }
            .sync-toggle input:checked + .sync-toggle-slider {
                background-color: #2962ff;
            }
            .sync-toggle input:checked + .sync-toggle-slider:before {
                transform: translateX(20px);
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(dropdown);
        
        // Toggle dropdown
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            
            // Position dropdown - align right edge of dropdown with right edge of button
            const rect = button.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 5) + 'px';
            dropdown.style.right = (window.innerWidth - rect.right) + 'px';
            dropdown.style.left = 'auto';
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            // Don't close if clicking inside sync settings section
            if (e.target.closest('.sync-settings-section')) {
                return;
            }
            dropdown.style.display = 'none';
        });
        
        // Handle layout selection
        dropdown.addEventListener('click', (e) => {
            // Don't close dropdown when clicking on sync settings section
            if (e.target.closest('.sync-settings-section')) {
                e.stopPropagation();
                return;
            }
            
            const option = e.target.closest('.layout-option');
            if (option) {
                const layout = option.dataset.layout;
                this.applyLayout(layout);
                
                // Update active state
                dropdown.querySelectorAll('.layout-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                option.classList.add('active');
                
                dropdown.style.display = 'none';
            }
        });
        
        // Setup all sync toggles
        this.setupSyncToggles(dropdown);
    }
    
    /**
     * Setup sync toggle event listeners
     */
    setupSyncToggles(dropdown) {
        // Symbol sync toggle
        const symbolToggle = dropdown.querySelector('#symbol-sync-toggle');
        if (symbolToggle) {
            symbolToggle.checked = this.syncSettings.symbol;
            symbolToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.symbol = e.target.checked;
                this.saveSyncSettings();
                console.log(`📊 Symbol sync ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        }
        
        // Interval sync toggle
        const intervalToggle = dropdown.querySelector('#interval-sync-toggle');
        if (intervalToggle) {
            intervalToggle.checked = this.syncSettings.interval;
            intervalToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.interval = e.target.checked;
                this.saveSyncSettings();
                console.log(`⏱️ Interval sync ${e.target.checked ? 'enabled' : 'disabled'}`);
                
                // If enabled, immediately sync all panels to the selected panel's timeframe
                if (e.target.checked && this.panels.length > 1) {
                    const selectedPanel = this.panels[this.selectedPanelIndex];
                    if (selectedPanel && selectedPanel.chartInstance) {
                        const timeframe = selectedPanel.timeframe || selectedPanel.chartInstance.currentTimeframe || '1m';
                        this.syncInterval(selectedPanel, timeframe);
                    }
                }
            });
        }
        
        // Crosshair sync toggle
        const crosshairToggle = dropdown.querySelector('#crosshair-sync-toggle');
        if (crosshairToggle) {
            crosshairToggle.checked = this.syncSettings.crosshair;
            crosshairToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.crosshair = e.target.checked;
                this.saveSyncSettings();
                
                // Update global crosshair sync
                window.crosshairSyncEnabled = e.target.checked;
                
                // Update main chart
                if (window.chart) {
                    window.chart.syncCrosshair = e.target.checked;
                }
                
                // Update all panel charts
                if (this.panels) {
                    this.panels.forEach(panel => {
                        if (panel.chartInstance) {
                            panel.chartInstance.syncCrosshair = e.target.checked;
                        }
                    });
                }
                
                // If enabled, sync cursor type from main chart to all panels
                if (e.target.checked && window.chart && window.chart.cursorType) {
                    window.chart.syncCursorTypeToAllCharts(window.chart.cursorType);
                }
                
                // If disabled, hide all synced crosshairs
                if (!e.target.checked) {
                    this.hideAllSyncedCrosshairs();
                }
                
                console.log(`🎯 Crosshair sync ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        }
        
        // Time sync toggle
        const timeToggle = dropdown.querySelector('#time-sync-toggle');
        if (timeToggle) {
            timeToggle.checked = this.syncSettings.time;
            timeToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.time = e.target.checked;
                this.saveSyncSettings();
                console.log(`🕐 Time sync ${e.target.checked ? 'enabled' : 'disabled'}`);
                
                // If enabled, immediately sync all panels to selected panel's scroll position
                if (e.target.checked && this.panels.length > 1) {
                    const selectedPanel = this.panels[this.selectedPanelIndex];
                    if (selectedPanel && selectedPanel.chartInstance) {
                        const chart = selectedPanel.chartInstance;
                        if (chart.data && chart.data.length > 0) {
                            const startIndex = chart.getVisibleStartIndex ? chart.getVisibleStartIndex() : 0;
                            const endIndex = chart.getVisibleEndIndex ? chart.getVisibleEndIndex() : chart.data.length - 1;
                            this.syncTime(selectedPanel, startIndex, endIndex);
                        }
                    }
                }
            });
        }
        
        // Date range sync toggle
        const dateRangeToggle = dropdown.querySelector('#daterange-sync-toggle');
        if (dateRangeToggle) {
            dateRangeToggle.checked = this.syncSettings.dateRange;
            dateRangeToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.dateRange = e.target.checked;
                this.saveSyncSettings();
                console.log(`📅 Date range sync ${e.target.checked ? 'enabled' : 'disabled'}`);
                
                // If enabled, immediately sync all panels to selected panel's date range
                if (e.target.checked && this.panels.length > 1) {
                    const selectedPanel = this.panels[this.selectedPanelIndex];
                    if (selectedPanel && selectedPanel.chartInstance) {
                        const chart = selectedPanel.chartInstance;
                        if (chart.data && chart.data.length > 0) {
                            const startIndex = chart.getVisibleStartIndex ? chart.getVisibleStartIndex() : 0;
                            const endIndex = chart.getVisibleEndIndex ? chart.getVisibleEndIndex() : chart.data.length - 1;
                            const startTimestamp = chart.data[Math.max(0, startIndex)]?.t;
                            const endTimestamp = chart.data[Math.min(chart.data.length - 1, endIndex)]?.t;
                            if (startTimestamp && endTimestamp) {
                                this.syncDateRange(selectedPanel, startTimestamp, endTimestamp);
                            }
                        }
                    }
                }
            });
        }
        
        // Drawings sync toggle
        const drawingsToggle = dropdown.querySelector('#drawings-sync-toggle');
        if (drawingsToggle) {
            drawingsToggle.checked = this.syncSettings.drawings;
            drawingsToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.drawings = e.target.checked;
                this.saveSyncSettings();
                
                // Update syncDrawings on all panel charts
                this.panels.forEach(panel => {
                    if (panel.chartInstance) {
                        panel.chartInstance.syncDrawings = e.target.checked;
                    }
                });
                
                console.log(`✏️ Drawings sync ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        }
    }
    
    /**
     * Hide all synced crosshairs when sync is disabled
     */
    hideAllSyncedCrosshairs() {
        // Hide main chart crosshair
        const mainCrosshairV = document.querySelector('.crosshair-vertical');
        const mainCrosshairH = document.querySelector('.crosshair-horizontal');
        if (mainCrosshairV) mainCrosshairV.style.display = 'none';
        if (mainCrosshairH) mainCrosshairH.style.display = 'none';
        
        // Hide panel crosshairs
        this.panels.forEach(panel => {
            if (panel.element) {
                const vLine = panel.element.querySelector('.crosshair-vertical');
                const hLine = panel.element.querySelector('.crosshair-horizontal');
                if (vLine) vLine.style.display = 'none';
                if (hLine) hLine.style.display = 'none';
            }
        });
    }
    
    /**
     * Sync symbol across all panels
     */
    syncSymbol(sourcePanel, symbol, fileId) {
        if (!this.syncSettings.symbol || this.currentLayout === '1') return;
        
        console.log(`📊 Syncing symbol ${symbol} from panel ${sourcePanel.index} to all panels`);
        
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                // Load same data but keep panel's own timeframe
                if (panel.chartInstance.loadFile) {
                    panel.chartInstance.loadFile(fileId);
                }
            }
        });
    }
    
    /**
     * Sync interval/timeframe across all panels
     */
    syncInterval(sourcePanel, timeframe) {
        if (!this.syncSettings.interval || this.currentLayout === '1') return;
        
        console.log(`⏱️ Syncing timeframe ${timeframe} from panel ${sourcePanel.index} to all panels`);
        
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                panel.timeframe = timeframe;
                if (panel.header) {
                    panel.header.innerHTML = `
                        <div style="font-weight: 600; color: #d1d4dc;">Panel ${panel.index + 1}</div>
                        <div style="font-size: 11px; margin-top: 2px;">${timeframe}</div>
                    `;
                }
                if (panel.chartInstance.setTimeframe) {
                    panel.chartInstance.setTimeframe(timeframe);
                }
            }
        });
    }
    
    /**
     * Sync time/scroll position across all panels (timestamp-based)
     * This syncs based on the center timestamp of the visible area
     */
    syncTime(sourcePanel, startIndex, endIndex) {
        if (!this.syncSettings.time || this.currentLayout === '1') return;
        
        const sourceChart = sourcePanel.chartInstance;
        if (!sourceChart || !sourceChart.data || sourceChart.data.length === 0) return;
        
        // Get the timestamp at the center of the source view
        const centerIndex = Math.floor((startIndex + endIndex) / 2);
        const centerTimestamp = sourceChart.data[Math.min(centerIndex, sourceChart.data.length - 1)]?.t;
        if (!centerTimestamp) return;
        
        // Also get the right edge timestamp for better sync
        const rightTimestamp = sourceChart.data[Math.min(endIndex, sourceChart.data.length - 1)]?.t;
        
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                const chartInst = panel.chartInstance;
                if (chartInst.data && chartInst.data.length > 0) {
                    // Find the candle closest to the right edge timestamp
                    let targetIndex = chartInst.data.length - 1;
                    let minDiff = Infinity;
                    
                    for (let i = 0; i < chartInst.data.length; i++) {
                        const diff = Math.abs(chartInst.data[i].t - rightTimestamp);
                        if (diff < minDiff) {
                            minDiff = diff;
                            targetIndex = i;
                        }
                    }
                    
                    // Position so targetIndex is at the right edge of view
                    const spacing = chartInst.getCandleSpacing ? chartInst.getCandleSpacing() : (chartInst.candleWidth + 2);
                    const chartWidth = chartInst.w - chartInst.margin.l - chartInst.margin.r;
                    const visibleCandles = Math.floor(chartWidth / spacing);
                    
                    // Position with right alignment (like TradingView)
                    chartInst.offsetX = -(targetIndex - visibleCandles + 5) * spacing;
                    chartInst.constrainOffset();
                    chartInst.scheduleRender();
                }
            }
        });
    }
    
    /**
     * Direct scroll sync - synchronize chart scroll positions smoothly
     */
    syncScroll(sourcePanel, offsetX, candleWidth) {
        // Prevent infinite sync loops
        if (this._isSyncing) return;
        if (!this.syncSettings.time && !this.syncSettings.dateRange) return;
        
        const sourceChart = sourcePanel?.chartInstance;
        if (!sourceChart?.data?.length) return;
        
        this._isSyncing = true;
        
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            
            const chart = panel.chartInstance;
            if (!chart?.data?.length) return;
            
            // Direct offsetX copy for smooth movement
            // Scale based on candle width ratio if different
            const sourceSpacing = sourceChart.getCandleSpacing ? sourceChart.getCandleSpacing() : (sourceChart.candleWidth + 2);
            const targetSpacing = chart.getCandleSpacing ? chart.getCandleSpacing() : (chart.candleWidth + 2);
            const ratio = targetSpacing / sourceSpacing;
            
            // Copy offsetX directly (scaled if candle widths differ)
            chart.offsetX = sourceChart.offsetX * ratio;
            
            // Constrain to valid range and render
            if (chart.constrainOffset) chart.constrainOffset();
            if (chart.render) chart.render();
        });
        
        setTimeout(() => { this._isSyncing = false; }, 16);
    }
    
    /**
     * Sync date range across all panels (scroll to same time window)
     */
    syncDateRange(sourcePanel, startTimestamp, endTimestamp) {
        if (!this.syncSettings.dateRange || this.currentLayout === '1') return;
        
        const sourceChart = sourcePanel.chartInstance;
        if (!sourceChart) return;
        
        // Use the end timestamp (right edge) for alignment
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                const chartInst = panel.chartInstance;
                if (chartInst.data && chartInst.data.length > 0) {
                    // Find the candle closest to the end timestamp
                    let targetIndex = chartInst.data.length - 1;
                    let minDiff = Infinity;
                    
                    for (let i = 0; i < chartInst.data.length; i++) {
                        const diff = Math.abs(chartInst.data[i].t - endTimestamp);
                        if (diff < minDiff) {
                            minDiff = diff;
                            targetIndex = i;
                        }
                    }
                    
                    // Position so targetIndex is at the right edge of view
                    const spacing = chartInst.getCandleSpacing ? chartInst.getCandleSpacing() : (chartInst.candleWidth + 2);
                    const chartWidth = chartInst.w - chartInst.margin.l - chartInst.margin.r;
                    const visibleCandles = Math.floor(chartWidth / spacing);
                    
                    chartInst.offsetX = -(targetIndex - visibleCandles + 5) * spacing;
                    chartInst.constrainOffset();
                    chartInst.scheduleRender();
                }
            }
        });
    }
    
    /**
     * Apply selected layout
     */
    applyLayout(layout) {
        console.log('Applying layout:', layout);
        this.currentLayout = layout;
        
        // Get original chart wrapper
        const originalChart = document.getElementById('chartWrapper');
        
        // If single panel layout, restore original chart to normal position
        if (layout === '1') {
            console.log('🔄 Returning to single layout - cleaning up panels...');
            
            // FIRST: Remove ALL resize handles
            if (this.resizeHandles && this.resizeHandles.length > 0) {
                this.resizeHandles.forEach(h => {
                    if (h && h.parentNode) {
                        h.parentNode.removeChild(h);
                    }
                });
                this.resizeHandles = [];
                console.log('✅ Removed resize handles');
            }
            
            // Also remove any orphaned resize handles by class name
            document.querySelectorAll('.panel-resize-handle').forEach(h => h.remove());
            
            // Hide panels container
            this.container.style.display = 'none';
            
            // Clear panel container content
            this.container.innerHTML = '';
            
            // Restore original chart wrapper
            if (originalChart) {
                originalChart.style.display = 'block';
                // Reset to full size - remove ALL inline styles
                originalChart.style.cssText = '';
                if (originalChart.parentElement) {
                    originalChart.parentElement.style.position = '';
                }
            }
            
            // Comprehensive reset of main chart - restore ALL functionality
            if (window.chart) {
                const chart = window.chart;
                
                // Reset panel flags
                chart.isPanel = false;
                chart.panel = null;
                chart.panelIndex = undefined;
                
                // Reset sync flags  
                chart.syncCrosshair = true;
                chart.syncDrawings = true;
                
                // Force cursor type to 'cross' for crosshair visibility
                if (!chart.cursorType || chart.cursorType === 'arrow') {
                    chart.cursorType = 'cross';
                }
                chart.showCrosshairLines = (chart.cursorType === 'cross' || chart.cursorType === 'eraser');
                
                // Ensure drawing manager is active
                if (chart.drawingManager) {
                    chart.drawingManager.enabled = true;
                }
                
                // Re-enable SVG pointer events for drawing interactions
                if (chart.svg && chart.svg.node()) {
                    chart.updateSVGPointerEvents();
                }
            }
            
            // Remove click handler from main canvas
            const mainCanvas = document.getElementById('chartCanvas');
            if (mainCanvas && mainCanvas._panelClickHandler) {
                mainCanvas.removeEventListener('mousedown', mainCanvas._panelClickHandler, true);
                mainCanvas._panelClickHandler = null;
            }
            
            // Reset panel tracking
            this.panels = [];
            this.selectedPanelIndex = 0;
            this.maximizedPanelIndex = null;
            
            // Reset resize state and remove any active resize listeners
            this.isResizing = false;
            this.resizeHandle = null;
            if (this._resizeMove) {
                document.removeEventListener('mousemove', this._resizeMove);
                this._resizeMove = null;
            }
            if (this._resizeEnd) {
                document.removeEventListener('mouseup', this._resizeEnd);
                this._resizeEnd = null;
            }
            // Reset body styles that might have been changed during resize
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Comprehensive restore of main chart functionality
            setTimeout(() => {
                if (window.chart) {
                    const chart = window.chart;
                    
                    // Resize and render
                    if (chart.resize) chart.resize();
                    if (chart.render) chart.render();
                    
                    // Force cursor type to 'cross' if not set, and apply it
                    if (!chart.cursorType) {
                        chart.cursorType = 'cross';
                    }
                    
                    // Force enable crosshair lines based on cursor type
                    chart.showCrosshairLines = (chart.cursorType === 'cross' || chart.cursorType === 'eraser');
                    
                    // Re-apply cursor type (includes crosshair visibility)
                    chart.setCursorType(chart.cursorType, true);
                    
                    // Restore cursor style on canvas and SVG
                    const cursorStyle = chart.getCurrentCursorStyle ? chart.getCurrentCursorStyle() : 'crosshair';
                    if (chart.canvas) chart.canvas.style.cursor = cursorStyle;
                    if (chart.svg && chart.svg.node()) chart.svg.node().style.cursor = cursorStyle;
                    
                    // Restore chart wrapper cursor
                    const chartWrapper = document.querySelector('.chart-wrapper');
                    if (chartWrapper) chartWrapper.style.cursor = cursorStyle;
                    
                    // Re-enable SVG pointer events
                    if (chart.updateSVGPointerEvents) {
                        chart.updateSVGPointerEvents();
                    }
                    
                    // Redraw drawings
                    if (chart.redrawDrawings) {
                        chart.redrawDrawings();
                    }
                    
                    // Reset crosshair elements - they will appear on mouse hover
                    // Don't hide them if cursor type is cross
                    const crosshairV = document.querySelector('.crosshair-vertical');
                    const crosshairH = document.querySelector('.crosshair-horizontal');
                    const priceLabel = document.querySelector('.price-label');
                    const timeLabel = document.querySelector('.time-label');
                    
                    // Just reset display to none - updateCrosshair will show them on mouse move
                    if (crosshairV) crosshairV.style.display = 'none';
                    if (crosshairH) crosshairH.style.display = 'none';
                    if (priceLabel) priceLabel.style.display = 'none';
                    if (timeLabel) timeLabel.style.display = 'none';
                    
                    // Ensure tooltip is hidden
                    if (chart.hideTooltip) chart.hideTooltip();
                    
                    // Update OHLC display with last candle
                    if (chart.data && chart.data.length > 0) {
                        const lastCandle = chart.data[chart.data.length - 1];
                        if (chart.updateOHLCFromCandle) {
                            chart.updateOHLCFromCandle(lastCandle);
                        }
                    }
                    
                    console.log('✅ Main chart fully restored - cursorType:', chart.cursorType, 'showLines:', chart.showCrosshairLines);
                }
            }, 100);
            
            // Dispatch event when returning to single panel mode
            window.dispatchEvent(new CustomEvent('returnedToSinglePanel', {
                detail: { layout: '1' }
            }));
            
            return;
        }
        
        // Show panels container
        this.container.style.display = 'block';
        
        // Clear any active drawing tool when switching to multi-panel
        this.clearAllDrawingTools();
        
        // Clear existing additional panels (keep original chart separate)
        this.container.innerHTML = '';
        this.panels = [];
        
        // Create panels based on layout
        const layouts = {
            '1': [{ width: '100%', height: '100%' }],
            '2v': [
                { width: '50%', height: '100%', left: '0' },
                { width: '50%', height: '100%', left: '50%' }
            ],
            '2h': [
                { width: '100%', height: '50%', top: '0' },
                { width: '100%', height: '50%', top: '50%' }
            ],
            '3v': [
                { width: '33.33%', height: '100%', left: '0' },
                { width: '33.33%', height: '100%', left: '33.33%' },
                { width: '33.33%', height: '100%', left: '66.66%' }
            ],
            '3h': [
                { width: '100%', height: '33.33%', top: '0' },
                { width: '100%', height: '33.33%', top: '33.33%' },
                { width: '100%', height: '33.33%', top: '66.66%' }
            ],
            '3l': [
                { width: '50%', height: '100%', left: '0' },
                { width: '50%', height: '50%', left: '50%', top: '0' },
                { width: '50%', height: '50%', left: '50%', top: '50%' }
            ],
            '4': [
                { width: '50%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '50%', top: '0' },
                { width: '50%', height: '50%', left: '0', top: '50%' },
                { width: '50%', height: '50%', left: '50%', top: '50%' }
            ],
            '4v': [
                { width: '25%', height: '100%', left: '0' },
                { width: '25%', height: '100%', left: '25%' },
                { width: '25%', height: '100%', left: '50%' },
                { width: '25%', height: '100%', left: '75%' }
            ],
            '4h': [
                { width: '100%', height: '25%', top: '0' },
                { width: '100%', height: '25%', top: '25%' },
                { width: '100%', height: '25%', top: '50%' },
                { width: '100%', height: '25%', top: '75%' }
            ],
            '4t': [ // Top 1 + bottom 3
                { width: '100%', height: '50%', left: '0', top: '0' },
                { width: '33.33%', height: '50%', left: '0', top: '50%' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
            ],
            '4b': [ // Top 3 + bottom 1
                { width: '33.33%', height: '50%', left: '0', top: '0' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
                { width: '100%', height: '50%', left: '0', top: '50%' }
            ],
            '4r': [ // Left 3 + right 1
                { width: '50%', height: '33.33%', left: '0', top: '0' },
                { width: '50%', height: '33.33%', left: '0', top: '33.33%' },
                { width: '50%', height: '33.33%', left: '0', top: '66.66%' },
                { width: '50%', height: '100%', left: '50%', top: '0' }
            ],
            '5a': [ // Top 2 + bottom 3
                { width: '50%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '50%', top: '0' },
                { width: '33.33%', height: '50%', left: '0', top: '50%' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
            ],
            '5b': [ // Top 3 + bottom 2
                { width: '33.33%', height: '50%', left: '0', top: '0' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
                { width: '50%', height: '50%', left: '0', top: '50%' },
                { width: '50%', height: '50%', left: '50%', top: '50%' }
            ],
            '5c': [ // Left 2 + right 3
                { width: '50%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '0', top: '50%' },
                { width: '50%', height: '33.33%', left: '50%', top: '0' },
                { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
                { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
            ],
            '5v': [
                { width: '20%', height: '100%', left: '0' },
                { width: '20%', height: '100%', left: '20%' },
                { width: '20%', height: '100%', left: '40%' },
                { width: '20%', height: '100%', left: '60%' },
                { width: '20%', height: '100%', left: '80%' }
            ],
            '5h': [
                { width: '100%', height: '20%', top: '0' },
                { width: '100%', height: '20%', top: '20%' },
                { width: '100%', height: '20%', top: '40%' },
                { width: '100%', height: '20%', top: '60%' },
                { width: '100%', height: '20%', top: '80%' }
            ],
            '6': [ // 2x3 grid
                { width: '33.33%', height: '50%', left: '0', top: '0' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '0' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '0' },
                { width: '33.33%', height: '50%', left: '0', top: '50%' },
                { width: '33.33%', height: '50%', left: '33.33%', top: '50%' },
                { width: '33.33%', height: '50%', left: '66.66%', top: '50%' }
            ],
            '6b': [ // 3x2 grid
                { width: '50%', height: '33.33%', left: '0', top: '0' },
                { width: '50%', height: '33.33%', left: '50%', top: '0' },
                { width: '50%', height: '33.33%', left: '0', top: '33.33%' },
                { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
                { width: '50%', height: '33.33%', left: '0', top: '66.66%' },
                { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
            ],
            '6v': [
                { width: '16.66%', height: '100%', left: '0' },
                { width: '16.66%', height: '100%', left: '16.66%' },
                { width: '16.66%', height: '100%', left: '33.33%' },
                { width: '16.66%', height: '100%', left: '50%' },
                { width: '16.66%', height: '100%', left: '66.66%' },
                { width: '16.66%', height: '100%', left: '83.33%' }
            ],
            '6h': [
                { width: '100%', height: '16.66%', top: '0' },
                { width: '100%', height: '16.66%', top: '16.66%' },
                { width: '100%', height: '16.66%', top: '33.33%' },
                { width: '100%', height: '16.66%', top: '50%' },
                { width: '100%', height: '16.66%', top: '66.66%' },
                { width: '100%', height: '16.66%', top: '83.33%' }
            ],
            '7v': [
                { width: '14.28%', height: '100%', left: '0' },
                { width: '14.28%', height: '100%', left: '14.28%' },
                { width: '14.28%', height: '100%', left: '28.56%' },
                { width: '14.28%', height: '100%', left: '42.84%' },
                { width: '14.28%', height: '100%', left: '57.12%' },
                { width: '14.28%', height: '100%', left: '71.4%' },
                { width: '14.28%', height: '100%', left: '85.68%' }
            ],
            '7a': [ // Top 3 + middle 3 + bottom 1
                { width: '33.33%', height: '33.33%', left: '0', top: '0' },
                { width: '33.33%', height: '33.33%', left: '33.33%', top: '0' },
                { width: '33.33%', height: '33.33%', left: '66.66%', top: '0' },
                { width: '33.33%', height: '33.33%', left: '0', top: '33.33%' },
                { width: '33.33%', height: '33.33%', left: '33.33%', top: '33.33%' },
                { width: '33.33%', height: '33.33%', left: '66.66%', top: '33.33%' },
                { width: '100%', height: '33.33%', left: '0', top: '66.66%' }
            ],
            '8': [ // 2x4 grid
                { width: '25%', height: '50%', left: '0', top: '0' },
                { width: '25%', height: '50%', left: '25%', top: '0' },
                { width: '25%', height: '50%', left: '50%', top: '0' },
                { width: '25%', height: '50%', left: '75%', top: '0' },
                { width: '25%', height: '50%', left: '0', top: '50%' },
                { width: '25%', height: '50%', left: '25%', top: '50%' },
                { width: '25%', height: '50%', left: '50%', top: '50%' },
                { width: '25%', height: '50%', left: '75%', top: '50%' }
            ],
            '8b': [ // 4x2 grid
                { width: '50%', height: '25%', left: '0', top: '0' },
                { width: '50%', height: '25%', left: '50%', top: '0' },
                { width: '50%', height: '25%', left: '0', top: '25%' },
                { width: '50%', height: '25%', left: '50%', top: '25%' },
                { width: '50%', height: '25%', left: '0', top: '50%' },
                { width: '50%', height: '25%', left: '50%', top: '50%' },
                { width: '50%', height: '25%', left: '0', top: '75%' },
                { width: '50%', height: '25%', left: '50%', top: '75%' }
            ],
            '8v': [
                { width: '12.5%', height: '100%', left: '0' },
                { width: '12.5%', height: '100%', left: '12.5%' },
                { width: '12.5%', height: '100%', left: '25%' },
                { width: '12.5%', height: '100%', left: '37.5%' },
                { width: '12.5%', height: '100%', left: '50%' },
                { width: '12.5%', height: '100%', left: '62.5%' },
                { width: '12.5%', height: '100%', left: '75%' },
                { width: '12.5%', height: '100%', left: '87.5%' }
            ],
            '8h': [
                { width: '100%', height: '12.5%', top: '0' },
                { width: '100%', height: '12.5%', top: '12.5%' },
                { width: '100%', height: '12.5%', top: '25%' },
                { width: '100%', height: '12.5%', top: '37.5%' },
                { width: '100%', height: '12.5%', top: '50%' },
                { width: '100%', height: '12.5%', top: '62.5%' },
                { width: '100%', height: '12.5%', top: '75%' },
                { width: '100%', height: '12.5%', top: '87.5%' }
            ]
        };
        
        const panelConfig = layouts[layout] || layouts['1'];
        
        console.log(`Creating layout with ${panelConfig.length} panels (main chart as Panel 0 + ${panelConfig.length - 1} new panels)`);
        
        // IMPORTANT: Main chart stays as Panel 0
        // Position the original chart as the first panel
        if (originalChart) {
            const firstConfig = panelConfig[0];
            
            // Apply first panel's position to original chart
            originalChart.style.display = 'block';
            originalChart.style.position = 'absolute';
            originalChart.style.width = firstConfig.width;
            originalChart.style.height = firstConfig.height;
            originalChart.style.left = firstConfig.left || '0';
            originalChart.style.top = firstConfig.top || '0';
            originalChart.style.border = 'none';
            originalChart.style.borderRight = '1px solid #2a2e39';
            originalChart.style.borderBottom = '1px solid #2a2e39';
            originalChart.style.boxSizing = 'border-box';
            originalChart.style.zIndex = '100'; // Higher than panels-container (z-index: 5)
            
            // Add panel 0 info to panels array (reference to main chart)
            const mainPanel = {
                element: originalChart,
                chartContainer: originalChart,
                canvas: document.getElementById('chartCanvas'),
                svg: document.getElementById('drawingSvg'),
                header: null,
                timeframe: window.chart?.currentTimeframe || '1m',
                index: 0,
                isMainChart: true,
                chartInstance: window.chart
            };
            this.panels.push(mainPanel);
            
            // Mark main chart as a panel for drawing sync
            if (window.chart) {
                window.chart.isPanel = true;
                window.chart.panel = mainPanel;
                window.chart.panelIndex = 0;
            }
            
            // Add click handler to select main chart panel
            const mainCanvas = document.getElementById('chartCanvas');
            if (mainCanvas && !mainCanvas._panelClickHandler) {
                mainCanvas._panelClickHandler = (e) => {
                    if (this.selectedPanelIndex !== 0) {
                        this.selectPanel(0);
                    }
                };
                mainCanvas.addEventListener('mousedown', mainCanvas._panelClickHandler, true);
            }
            
            // Setup double-click to maximize for main chart
            this.setupPanelMaximize(mainPanel, 0);
            
            console.log(`📊 Panel 0: Main chart positioned at ${firstConfig.width} x ${firstConfig.height}`);
            
            // Trigger resize for main chart after positioning
            setTimeout(() => {
                if (window.chart && window.chart.resize) {
                    window.chart.resize();
                    window.chart.render();
                }
            }, 150);
        }
        
        // Create additional panels (starting from index 1)
        for (let i = 1; i < panelConfig.length; i++) {
            this.createPanel(panelConfig[i], i);
        }
        
        console.log(`✅ ${this.panels.length} panels total (1 main + ${this.panels.length - 1} additional)`);
        
        // Auto-select first panel (main chart)
        if (this.panels.length > 0) {
            setTimeout(() => this.selectPanel(0), 100);
        }
        
        // Sync cursor type from main chart to all panels
        setTimeout(() => {
            if (window.chart && window.chart.cursorType) {
                window.chart.syncCursorTypeToAllCharts(window.chart.cursorType);
                console.log(`🖱️ Synced cursor type '${window.chart.cursorType}' to all panels`);
            }
        }, 200);
        
        // Trigger panel created event
        window.dispatchEvent(new CustomEvent('panelsCreated', {
            detail: { panels: this.panels, layout: layout }
        }));
        
        // Create resize handles between panels after a short delay
        setTimeout(() => this.createResizeHandles(), 200);
    }
    
    /**
     * Create individual panel
     */
    createPanel(config, index) {
        const panel = document.createElement('div');
        panel.className = 'chart-panel';
        panel.dataset.panelId = index;
        panel.style.cssText = `
            position: absolute;
            width: ${config.width};
            height: ${config.height};
            left: ${config.left || '0'};
            top: ${config.top || '0'};
            border: none;
            border-right: 1px solid #2a2e39;
            border-bottom: 1px solid #2a2e39;
            background: #131722;
            box-sizing: border-box;
            overflow: hidden;
            z-index: 100;
        `;
        
        console.log(`Creating panel ${index}:`, config);
        
        // Default timeframe for this panel
        const defaultTimeframes = ['1h', '15m', '5m', '1D', '4h', '30m', '1m', '1W'];
        const panelTimeframe = defaultTimeframes[index] || '1h';
        
        // Chart container within panel (same structure as main chart)
        const chartContainer = document.createElement('div');
        chartContainer.className = 'panel-chart-container';
        chartContainer.style.cssText = `
            width: 100%;
            height: 100%;
            position: relative;
            background: #131722;
        `;
        
        // Add placeholder text
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #787b86;
            font-size: 14px;
            text-align: center;
        `;
        placeholder.innerHTML = `
            Panel ${index + 1}<br>
            <span style="font-size: 12px;">${panelTimeframe}</span>
        `;
        chartContainer.appendChild(placeholder);
        
        // Create canvas for candlestick chart
        const canvas = document.createElement('canvas');
        canvas.className = 'panel-canvas';
        canvas.id = `panelCanvas${index}`;
        canvas.style.display = 'block';
        chartContainer.appendChild(canvas);
        
        // Click on canvas to select panel - prevent drawing when switching
        canvas.addEventListener('mousedown', (e) => {
            if (this.selectedPanelIndex !== index) {
                // Switching panels - select and prevent drawing on first click
                this.selectPanel(index);
                e.stopPropagation();
                e.preventDefault();
            }
        }, true); // capture phase - run before drawing handlers
        
        // Create SVG for drawings
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'panel-svg');
        svg.setAttribute('id', `panelSvg${index}`);
        svg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        chartContainer.appendChild(svg);
        
        // Add crosshair elements for this panel
        const crosshairV = document.createElement('div');
        crosshairV.className = 'crosshair-vertical';
        crosshairV.style.cssText = 'display: none;';
        chartContainer.appendChild(crosshairV);
        
        const crosshairH = document.createElement('div');
        crosshairH.className = 'crosshair-horizontal';
        crosshairH.style.cssText = 'display: none;';
        chartContainer.appendChild(crosshairH);
        
        const priceLabel = document.createElement('div');
        priceLabel.className = 'price-label';
        priceLabel.style.cssText = 'display: none;';
        chartContainer.appendChild(priceLabel);
        
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.style.cssText = 'display: none;';
        chartContainer.appendChild(timeLabel);
        
        // Create OHLC Info Panel for this panel
        const ohlcInfo = document.createElement('div');
        ohlcInfo.className = 'ohlc-info';
        ohlcInfo.id = `ohlcInfo${index}`;
        ohlcInfo.style.cssText = 'left: 8px !important; top: 8px !important; flex-direction: column !important; gap: 2px !important;'; // Vertical layout for proper collapse button position
        ohlcInfo.innerHTML = `
            <!-- Header row with symbol, OHLC -->
            <div class="ohlc-header" style="display: flex; flex-direction: row; align-items: center; gap: 12px; flex-wrap: wrap;">
                <!-- Symbol & Timeframe Line -->
                <div class="ohlc-symbol-line" style="display: flex; align-items: center; gap: 6px;">
                    <span id="chartSymbol${index}">CHART</span>
                    <span style="color: #787b86;">—</span>
                    <span id="chartTimeframe${index}">${panelTimeframe}</span>
                </div>
                
                <!-- OHLC Data Line -->
                <div class="ohlc-data-line" id="ohlcDataLine${index}" style="display: flex; align-items: center; gap: 8px;">
                    <span><span class="ohlc-label">O</span><span class="ohlc-value" id="open${index}">—</span></span>
                    <span><span class="ohlc-label">H</span><span class="ohlc-value" id="high${index}">—</span></span>
                    <span><span class="ohlc-label">L</span><span class="ohlc-value" id="low${index}">—</span></span>
                    <span><span class="ohlc-label">C</span><span class="ohlc-value" id="close${index}">—</span></span>
                    <span class="ohlc-change" id="chartChange${index}">—</span>
                </div>
            </div>
            
            <!-- Body section (hidden when collapsed) -->
            <div class="ohlc-body">
                <!-- Volume Line -->
                <div class="ohlc-volume-line" style="display: flex; align-items: center; gap: 6px;">
                    <span class="volume-label">Volume</span>
                    <span class="volume-value" id="volumeValue${index}">—</span>
                </div>
                
                <!-- Indicators Section -->
                <div class="ohlc-indicators" id="ohlcIndicators${index}">
                    <!-- Indicators will be added here dynamically -->
                </div>
            </div>
            
            <!-- Collapse button at the bottom -->
            <button class="ohlc-collapse-btn" id="ohlcCollapseBtn${index}" style="margin-top: 4px; align-self: flex-start;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
        `;
        chartContainer.appendChild(ohlcInfo);
        
        // Setup collapse button for this panel's OHLC
        setTimeout(() => {
            const collapseBtn = document.getElementById(`ohlcCollapseBtn${index}`);
            if (collapseBtn) {
                collapseBtn.addEventListener('click', () => {
                    ohlcInfo.classList.toggle('collapsed');
                    const svg = collapseBtn.querySelector('svg polyline');
                    if (ohlcInfo.classList.contains('collapsed')) {
                        svg.setAttribute('points', '18 15 12 9 6 15');
                    } else {
                        svg.setAttribute('points', '6 9 12 15 18 9');
                    }
                });
            }
        }, 100);
        
        panel.appendChild(chartContainer);
        
        this.container.appendChild(panel);
        
        this.panels.push({
            element: panel,
            chartContainer: chartContainer,
            canvas: canvas,
            svg: svg,
            timeframe: panelTimeframe,
            index: index,
            placeholder: placeholder,
            ohlcInfo: ohlcInfo
        });
        
        console.log(`✅ Panel ${index} added to DOM`);
        
        // Setup double-click to maximize
        this.setupPanelMaximize(this.panels[this.panels.length - 1], index);
        
        // Trigger resize for canvas - use panel element rect, not chartContainer
        setTimeout(() => {
            const rect = panel.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height < 10000) {
                canvas.width = rect.width;
                canvas.height = rect.height;
                svg.setAttribute('width', rect.width);
                svg.setAttribute('height', rect.height);
                console.log(`📐 Panel ${index} sized: ${rect.width}x${rect.height}`);
            } else {
                console.error(`❌ Panel ${index} invalid size: ${rect.width}x${rect.height}`);
            }
        }, 100);
    }
    
    /**
     * Get all panels
     */
    getPanels() {
        return this.panels;
    }
    
    /**
     * Get current layout
     */
    getCurrentLayout() {
        return this.currentLayout;
    }
    
    /**
     * Select a panel to control with timeframe buttons
     */
    selectPanel(index) {
        // Deselect all panels - reset to normal border (only right/bottom)
        this.panels.forEach(panel => {
            if (panel.element) {
                panel.element.style.border = 'none';
                panel.element.style.borderRight = '1px solid #2a2e39';
                panel.element.style.borderBottom = '1px solid #2a2e39';
                panel.element.style.boxShadow = 'none';
            }
        });
        
        // Select the clicked panel - show blue glow/shadow instead of full border
        if (this.panels[index]) {
            this.selectedPanelIndex = index;
            const panel = this.panels[index];
            
            // Highlight selected panel with subtle blue border and glow
            if (panel.element) {
                panel.element.style.border = '1px solid #2962ff';
                panel.element.style.boxShadow = 'inset 0 0 0 1px rgba(41, 98, 255, 0.3)';
            }
            
            console.log(`📊 Panel ${index} selected (${panel.timeframe})`);
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('panelSelected', {
                detail: { 
                    panelIndex: index,
                    timeframe: panel.timeframe,
                    panel: panel,
                    isMainChart: panel.isMainChart
                }
            }));
        }
    }
    
    /**
     * Update timeframe of selected panel
     */
    updateSelectedPanelTimeframe(timeframe) {
        if (this.panels.length === 0) return;
        
        // If interval sync is enabled, update ALL panels
        if (this.syncSettings.interval) {
            console.log(`⏱️ Interval sync ON - updating ALL panels to ${timeframe}`);
            this.panels.forEach((panel, index) => {
                if (panel) {
                    panel.timeframe = timeframe;
                    
                    // Update chart instance if exists
                    if (panel.chartInstance && panel.chartInstance.setTimeframe) {
                        panel.chartInstance.setTimeframe(timeframe);
                    }
                }
            });
            return;
        }
        
        // Normal mode - update only selected panel
        const panel = this.panels[this.selectedPanelIndex];
        if (panel) {
            panel.timeframe = timeframe;
            
            console.log(`✅ Panel ${this.selectedPanelIndex} timeframe updated to ${timeframe}`);
            
            // Update chart instance if exists
            if (panel.chartInstance && panel.chartInstance.setTimeframe) {
                panel.chartInstance.setTimeframe(timeframe);
            }
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('panelTimeframeChanged', {
                detail: { 
                    panelIndex: this.selectedPanelIndex,
                    timeframe: timeframe,
                    panel: panel
                }
            }));
        }
    }
    
    /**
     * Get selected panel index
     */
    getSelectedPanelIndex() {
        return this.selectedPanelIndex;
    }
    
    /**
     * Get selected panel
     */
    getSelectedPanel() {
        return this.panels[this.selectedPanelIndex] || null;
    }
    
    /**
     * Resize all panel charts
     * Called when panel layout changes
     */
    resizePanels() {
        this.panels.forEach(panel => {
            if (panel.chartInstance && panel.chartInstance.resize) {
                panel.chartInstance.resize();
                panel.chartInstance.render();
            }
        });
    }
    
    /**
     * Clear drawing tools from all charts
     * Called when switching layouts
     */
    clearAllDrawingTools() {
        // Clear main chart drawing tool
        if (window.chart && window.chart.drawingManager && window.chart.drawingManager.currentTool) {
            window.chart.drawingManager.clearTool();
        }
        
        // Clear all panel chart drawing tools
        this.panels.forEach(panel => {
            if (panel.chartInstance && panel.chartInstance.drawingManager && panel.chartInstance.drawingManager.currentTool) {
                panel.chartInstance.drawingManager.clearTool();
            }
        });
        
        // Update toolbar UI to show cursor as active
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        const cursorBtn = document.getElementById('cursorTool');
        if (cursorBtn) cursorBtn.classList.add('active');
        
        console.log('🔧 Cleared all drawing tools');
    }
    
    /**
     * Toggle maximize/restore for a panel
     */
    toggleMaximize(index) {
        if (this.maximizedPanelIndex === index) {
            // Restore from maximized
            this.restoreFromMaximize();
        } else {
            // Maximize this panel
            this.maximizePanel(index);
        }
    }
    
    /**
     * Maximize a single panel to full screen
     */
    maximizePanel(index) {
        if (this.panels.length <= 1) return;
        
        // Save current state
        this.layoutBeforeMaximize = this.currentLayout;
        this.panelSizesBeforeMaximize = this.panels.map(p => ({
            width: p.element?.style.width,
            height: p.element?.style.height,
            left: p.element?.style.left,
            top: p.element?.style.top,
            display: p.element?.style.display
        }));
        
        this.maximizedPanelIndex = index;
        
        // Hide all panels except the maximized one
        this.panels.forEach((panel, i) => {
            if (panel.element) {
                if (i === index) {
                    // Maximize this panel
                    panel.element.style.left = '0';
                    panel.element.style.top = '0';
                    panel.element.style.width = '100%';
                    panel.element.style.height = '100%';
                    panel.element.style.display = 'block';
                    panel.element.style.zIndex = '200';
                } else {
                    // Hide other panels
                    panel.element.style.display = 'none';
                }
            }
        });
        
        // Resize the maximized panel's chart
        setTimeout(() => {
            const panel = this.panels[index];
            if (panel) {
                // Resize canvas
                if (panel.canvas) {
                    const rect = panel.element.getBoundingClientRect();
                    panel.canvas.width = rect.width;
                    panel.canvas.height = rect.height;
                }
                // Resize SVG
                if (panel.svg) {
                    const rect = panel.element.getBoundingClientRect();
                    panel.svg.setAttribute('width', rect.width);
                    panel.svg.setAttribute('height', rect.height);
                }
                // Resize chart instance
                if (panel.chartInstance && panel.chartInstance.resize) {
                    panel.chartInstance.resize();
                    panel.chartInstance.render();
                }
            }
        }, 50);
        
        console.log(`🔲 Panel ${index} maximized`);
        
        // Show notification
        if (window.chart && window.chart.showNotification) {
            window.chart.showNotification('Double-click to restore');
        }
    }
    
    /**
     * Restore from maximized state
     */
    restoreFromMaximize() {
        if (this.maximizedPanelIndex === null) return;
        
        // Restore all panel sizes
        this.panels.forEach((panel, i) => {
            if (panel.element && this.panelSizesBeforeMaximize[i]) {
                const saved = this.panelSizesBeforeMaximize[i];
                panel.element.style.width = saved.width;
                panel.element.style.height = saved.height;
                panel.element.style.left = saved.left;
                panel.element.style.top = saved.top;
                panel.element.style.display = saved.display || 'block';
                panel.element.style.zIndex = '100';
            }
        });
        
        const wasMaximized = this.maximizedPanelIndex;
        this.maximizedPanelIndex = null;
        this.layoutBeforeMaximize = null;
        this.panelSizesBeforeMaximize = null;
        
        // Resize all charts
        setTimeout(() => {
            this.panels.forEach(panel => {
                if (panel.element && panel.element.style.display !== 'none') {
                    const rect = panel.element.getBoundingClientRect();
                    if (panel.canvas) {
                        panel.canvas.width = rect.width;
                        panel.canvas.height = rect.height;
                    }
                    if (panel.svg) {
                        panel.svg.setAttribute('width', rect.width);
                        panel.svg.setAttribute('height', rect.height);
                    }
                    if (panel.chartInstance && panel.chartInstance.resize) {
                        panel.chartInstance.resize();
                        panel.chartInstance.render();
                    }
                }
            });
        }, 50);
        
        console.log(`🔲 Panel ${wasMaximized} restored`);
    }
    
    /**
     * Save panel-specific settings to localStorage
     */
    savePanelSettings(panelIndex) {
        const panel = this.panels[panelIndex];
        if (!panel || !panel.chartInstance) return;
        
        const settings = panel.chartInstance.chartSettings;
        const key = `chart_panel_${panelIndex}_settings`;
        
        try {
            localStorage.setItem(key, JSON.stringify(settings));
            console.log(`💾 Panel ${panelIndex} settings saved`);
        } catch (e) {
            console.warn(`Failed to save panel ${panelIndex} settings:`, e);
        }
    }
    
    /**
     * Load panel-specific settings from localStorage
     */
    loadPanelSettings(panelIndex) {
        const key = `chart_panel_${panelIndex}_settings`;
        
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const settings = JSON.parse(saved);
                const panel = this.panels[panelIndex];
                if (panel && panel.chartInstance) {
                    panel.chartInstance.chartSettings = { ...panel.chartInstance.chartSettings, ...settings };
                    panel.chartInstance.applyChartSettings();
                    console.log(`📂 Panel ${panelIndex} settings loaded`);
                    return true;
                }
            }
        } catch (e) {
            console.warn(`Failed to load panel ${panelIndex} settings:`, e);
        }
        return false;
    }
    
    /**
     * Setup double-click to maximize for a panel
     */
    setupPanelMaximize(panel, index) {
        if (!panel.element) return;
        
        panel.element.addEventListener('dblclick', (e) => {
            // Don't maximize if clicking on controls or OHLC info
            if (e.target.closest('.ohlc-info') || e.target.closest('button')) {
                return;
            }
            
            // Don't maximize if clicking on price axis (right edge of chart)
            // Price axis is typically the rightmost ~60 pixels
            const rect = panel.element.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const priceAxisWidth = 60; // Width of price axis area
            
            if (clickX > rect.width - priceAxisWidth) {
                // Clicked on price axis - let the chart handle it for reset scale
                return;
            }
            
            // Don't maximize if clicking on time axis (bottom edge of chart)
            const clickY = e.clientY - rect.top;
            const timeAxisHeight = 30; // Height of time axis area
            
            if (clickY > rect.height - timeAxisHeight) {
                // Clicked on time axis - let the chart handle it
                return;
            }
            
            this.toggleMaximize(index);
        });
    }
    
    /**
     * Create resize handles between panels
     */
    createResizeHandles() {
        // Remove existing handles
        this.resizeHandles.forEach(h => h.remove());
        this.resizeHandles = [];
        
        if (this.panels.length < 2 || this.maximizedPanelIndex !== null) return;
        
        // Use chart-container as the parent for handles (includes main chart)
        const chartContainer = document.getElementById('chart-container');
        if (!chartContainer) return;
        
        const containerRect = chartContainer.getBoundingClientRect();
        
        // Find panel boundaries and create handles
        this.panels.forEach((panel, i) => {
            if (!panel.element) return;
            const rect = panel.element.getBoundingClientRect();
            
            // Create vertical handle on right edge (if not last column)
            const rightEdge = rect.right - containerRect.left;
            if (rightEdge < containerRect.width - 10) {
                const handle = this.createHandle('vertical', rightEdge, rect.top - containerRect.top, rect.height, i, 'right');
                if (handle) this.resizeHandles.push(handle);
            }
            
            // Create horizontal handle on bottom edge (if not last row)
            const bottomEdge = rect.bottom - containerRect.top;
            if (bottomEdge < containerRect.height - 10) {
                const handle = this.createHandle('horizontal', rect.left - containerRect.left, bottomEdge, rect.width, i, 'bottom');
                if (handle) this.resizeHandles.push(handle);
            }
        });
    }
    
    /**
     * Create a single resize handle
     */
    createHandle(type, x, y, size, panelIndex, edge) {
        const handle = document.createElement('div');
        handle.className = `panel-resize-handle ${type}`;
        handle.dataset.panelIndex = panelIndex;
        handle.dataset.edge = edge;
        
        const thickness = 4;
        
        if (type === 'vertical') {
            handle.style.cssText = `
                position: absolute;
                left: ${x - thickness/2}px;
                top: ${y}px;
                width: ${thickness}px;
                height: ${size}px;
                cursor: col-resize;
                background: transparent;
                z-index: 300;
                transition: background 0.15s ease;
            `;
        } else {
            handle.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y - thickness/2}px;
                width: ${size}px;
                height: ${thickness}px;
                cursor: row-resize;
                background: transparent;
                z-index: 300;
                transition: background 0.15s ease;
            `;
        }
        
        // Hover effect - subtle blue line
        handle.addEventListener('mouseenter', () => {
            handle.style.background = 'rgba(41, 98, 255, 0.6)';
        });
        handle.addEventListener('mouseleave', () => {
            if (!this.isResizing) {
                handle.style.background = 'transparent';
            }
        });
        
        // Drag start
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startResize(e, handle, type, panelIndex);
        });
        
        // Append to chart-container so handles work with main chart too
        const chartContainer = document.getElementById('chart-container');
        if (chartContainer) {
            chartContainer.appendChild(handle);
        } else {
            this.container.appendChild(handle);
        }
        return handle;
    }
    
    /**
     * Start resize drag
     */
    startResize(e, handle, type, panelIndex) {
        this.isResizing = true;
        this.resizeHandle = handle;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeType = type;
        this.resizePanelIndex = panelIndex;
        this._resizeRAF = null;
        
        // Store initial sizes
        this.initialPanelSizes = this.panels.map(p => {
            if (p.element) {
                const rect = p.element.getBoundingClientRect();
                // Add GPU acceleration hint
                p.element.style.willChange = 'width, height, left, top';
                return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
            }
            return null;
        });
        
        handle.style.background = 'rgba(41, 98, 255, 0.7)';
        document.body.style.cursor = type === 'vertical' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        
        // Add move and up handlers
        this._resizeMove = (e) => this.handleResizeMove(e);
        this._resizeEnd = (e) => this.endResize(e);
        
        document.addEventListener('mousemove', this._resizeMove);
        document.addEventListener('mouseup', this._resizeEnd);
    }
    
    /**
     * Handle resize drag move
     */
    handleResizeMove(e) {
        if (!this.isResizing) return;
        
        // Store latest mouse position
        this._lastResizeX = e.clientX;
        this._lastResizeY = e.clientY;
        
        // Use requestAnimationFrame for smooth updates
        if (!this._resizeRAF) {
            this._resizeRAF = requestAnimationFrame(() => {
                this._resizeRAF = null;
                this.applyResize();
            });
        }
    }
    
    /**
     * Apply resize changes (called via RAF for smoothness)
     */
    applyResize() {
        if (!this.isResizing) return;
        
        const deltaX = this._lastResizeX - this.resizeStartX;
        const deltaY = this._lastResizeY - this.resizeStartY;
        
        const chartContainer = document.getElementById('chart-container');
        const containerRect = chartContainer ? chartContainer.getBoundingClientRect() : this.container.getBoundingClientRect();
        
        if (this.resizeType === 'vertical') {
            this.panels.forEach((panel, i) => {
                if (!panel.element || !this.initialPanelSizes[i]) return;
                const initial = this.initialPanelSizes[i];
                
                if (i === this.resizePanelIndex) {
                    const newWidth = Math.max(100, initial.width + deltaX);
                    panel.element.style.width = newWidth + 'px';
                } else if (initial.left > this.initialPanelSizes[this.resizePanelIndex]?.left) {
                    const leftPanel = this.initialPanelSizes[this.resizePanelIndex];
                    if (leftPanel && Math.abs(initial.left - (leftPanel.left + leftPanel.width)) < 15) {
                        const newLeft = initial.left - containerRect.left + deltaX;
                        const newWidth = Math.max(100, initial.width - deltaX);
                        panel.element.style.left = newLeft + 'px';
                        panel.element.style.width = newWidth + 'px';
                    }
                }
            });
        } else {
            this.panels.forEach((panel, i) => {
                if (!panel.element || !this.initialPanelSizes[i]) return;
                const initial = this.initialPanelSizes[i];
                
                if (i === this.resizePanelIndex) {
                    const newHeight = Math.max(80, initial.height + deltaY);
                    panel.element.style.height = newHeight + 'px';
                } else if (initial.top > this.initialPanelSizes[this.resizePanelIndex]?.top) {
                    const topPanel = this.initialPanelSizes[this.resizePanelIndex];
                    if (topPanel && Math.abs(initial.top - (topPanel.top + topPanel.height)) < 15) {
                        const newTop = initial.top - containerRect.top + deltaY;
                        const newHeight = Math.max(80, initial.height - deltaY);
                        panel.element.style.top = newTop + 'px';
                        panel.element.style.height = newHeight + 'px';
                    }
                }
            });
        }
    }
    
    /**
     * End resize drag
     */
    endResize(e) {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        
        // Cancel any pending RAF
        if (this._resizeRAF) {
            cancelAnimationFrame(this._resizeRAF);
            this._resizeRAF = null;
        }
        
        // Clean up GPU hints
        this.panels.forEach(p => {
            if (p.element) {
                p.element.style.willChange = 'auto';
            }
        });
        
        if (this.resizeHandle) {
            this.resizeHandle.style.background = 'transparent';
        }
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        document.removeEventListener('mousemove', this._resizeMove);
        document.removeEventListener('mouseup', this._resizeEnd);
        
        // Resize all charts to fit new panel sizes
        setTimeout(() => {
            this.panels.forEach(panel => {
                if (panel.element && panel.element.style.display !== 'none') {
                    const rect = panel.element.getBoundingClientRect();
                    if (panel.canvas) {
                        panel.canvas.width = rect.width;
                        panel.canvas.height = rect.height;
                    }
                    if (panel.svg) {
                        panel.svg.setAttribute('width', rect.width);
                        panel.svg.setAttribute('height', rect.height);
                    }
                    if (panel.chartInstance && panel.chartInstance.resize) {
                        panel.chartInstance.resize();
                        panel.chartInstance.render();
                    }
                }
            });
            
            // Recreate resize handles at new positions
            this.createResizeHandles();
        }, 50);
        
        console.log('📐 Panel resize complete');
    }
}

// Make selectPanel available globally
window.selectPanel = function(index) {
    if (window.panelManager) {
        window.panelManager.selectPanel(index);
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PanelManager;
}