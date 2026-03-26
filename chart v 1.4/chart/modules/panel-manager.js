/**
 * Panel Manager - Multi-panel chart layout system
 * Allows splitting the chart view into multiple panels with different timeframes
 */

/** Chart look + settings UI colors: always follow `window.chart` for extra panels (index > 0). */
const PANEL_CHART_APPEARANCE_KEYS = [
    'backgroundColor', 'backgroundStyle',
    'gridColor', 'gridStyle', 'showGrid', 'gridPattern',
    'showSessionBreaks', 'sessionBreaksColor', 'sessionBreaksPattern',
    'crosshairColor', 'crosshairPattern', 'crosshairWidth', 'showCrosshair', 'crosshairLocked',
    'showWatermark', 'watermarkColor', 'watermarkPattern',
    'scaleTextColor', 'scaleTextSize', 'scaleLinesColor', 'scaleLinePattern', 'scaleLineWidth',
    'cursorLabelTextColor', 'cursorLabelBgColor',
    'candleUpColor', 'candleDownColor', 'bodyUpColor', 'bodyDownColor',
    'borderUpColor', 'borderDownColor', 'wickUpColor', 'wickDownColor',
    'unifiedBarColorEnabled', 'unifiedBarColor',
    'showCandleBody', 'showCandleBorders', 'showCandleWick', 'colorBasedOnPreviousClose',
    'showPriceLine', 'priceLineColor',
    'areaLineColor', 'areaFillColor', 'baselineColor',
    'volumeUpColor', 'volumeDownColor',
    'symbolTextColor',
    'symbolColor', 'prevDayColor',
    'settingsPanelAccentColor', 'settingsPanelSecondaryColor', 'settingsPanelTextColor',
    'settingsPanelBgColor', 'settingsPanelSidebarBgColor',
    'activeFullTemplate', 'activeChartOnlyTemplate', 'activePanelOnlyTemplate'
];

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
            symbol: false,
            interval: false,
            crosshair: true,
            time: true,
            dateRange: false,
            drawings: true,
            indicators: false,
            chartType: false
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

        // Newer UI flow: open panel layouts inside settings panel (same as Object Tree mode)
        if (layoutBtn.dataset && layoutBtn.dataset.openMode === 'settings-panel') {
            console.log('✅ Layout button configured for settings-panel mode; skipping legacy dropdown wiring');
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
                        <input type="checkbox" class="tv-native-checkbox" id="symbol-sync-toggle">
                    </label>
                </div>
                
                <!-- Interval Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Interval</span>
                        <div class="sync-info" title="When enabled, changing timeframe in one panel changes it in all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" class="tv-native-checkbox" id="interval-sync-toggle">
                    </label>
                </div>
                
                <!-- Crosshair Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Crosshair</span>
                        <div class="sync-info" title="Synchronize crosshair position across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" class="tv-native-checkbox" id="crosshair-sync-toggle" checked>
                    </label>
                </div>
                
                <!-- Time Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Time</span>
                        <div class="sync-info" title="Synchronize scroll position (time) across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" class="tv-native-checkbox" id="time-sync-toggle" checked>
                    </label>
                </div>
                
                <!-- Date Range Toggle -->
                <div class="sync-row">
                    <div class="sync-label">
                        <span>Date range</span>
                        <div class="sync-info" title="Synchronize visible date range across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" class="tv-native-checkbox" id="daterange-sync-toggle">
                    </label>
                </div>
                
                <!-- Drawings Toggle -->
                <div class="sync-row sync-row-border">
                    <div class="sync-label">
                        <span>Drawings</span>
                        <div class="sync-info" title="Synchronize drawings and shapes across all panels">i</div>
                    </div>
                    <label class="sync-toggle">
                        <input type="checkbox" class="tv-native-checkbox" id="drawings-sync-toggle">
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
                border-color: rgba(var(--sp-accent-rgb), 0.5);
                background: rgba(var(--sp-accent-rgb), 0.1);
            }
            .layout-option.active {
                border-color: var(--sp-accent);
                background: rgba(var(--sp-accent-rgb), 0.2);
            }
            .layout-option svg {
                display: block;
                stroke: #787b86;
            }
            .layout-option:hover svg,
            .layout-option.active svg {
                stroke: #d1d4dc;
            }
            
            /* Sync checkbox styling (match trendline settings) */
            .sync-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 16px;
            }
            .sync-toggle input[type="checkbox"] {
                cursor: default;
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
                this.panels.forEach(panel => {
                    if (panel.chartInstance) panel.chartInstance.syncDrawings = e.target.checked;
                });
            });
        }

        // Indicators sync toggle
        const indicatorsToggle = dropdown.querySelector('#indicators-sync-toggle');
        if (indicatorsToggle) {
            indicatorsToggle.checked = this.syncSettings.indicators !== false;
            indicatorsToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.indicators = e.target.checked;
                this.saveSyncSettings();
                if (e.target.checked) this.syncIndicatorsNow();
            });
        }

        // Chart type sync toggle
        const chartTypeToggle = dropdown.querySelector('#charttype-sync-toggle');
        if (chartTypeToggle) {
            chartTypeToggle.checked = !!this.syncSettings.chartType;
            chartTypeToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.chartType = e.target.checked;
                this.saveSyncSettings();
                if (e.target.checked) this.syncChartTypeNow();
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
        
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            const pc = panel.chartInstance;
            if (!pc) return;
            if (String(pc.currentFileId) === String(fileId)) return;

            if (panel.isMainChart && window.chart && typeof window.chart.loadFileData === 'function') {
                window.chart.loadFileData(fileId);
            } else if (typeof pc.loadPanelFileData === 'function') {
                pc.loadPanelFileData(fileId);
            }
        });
    }
    
    /**
     * Sync interval/timeframe across all panels
     */
    syncInterval(sourcePanel, timeframe) {
        if (!this.syncSettings.interval || this.currentLayout === '1') return;
        
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            const pc = panel.chartInstance;
            if (!pc) return;
            panel.timeframe = timeframe;
            pc.currentTimeframe = timeframe;
            if (typeof pc.setTimeframe === 'function') {
                pc.setTimeframe(timeframe);
            }
            if (typeof pc.updateChartOHLCSymbol === 'function') {
                pc.updateChartOHLCSymbol(pc.currentSymbol);
            }
        });
    }
    
    /**
     * Binary search: find index of candle closest to target timestamp.
     * Falls back to chart.findGoToTargetIndex if available.
     */
    _bsearchTimestamp(data, ts) {
        if (!data || data.length === 0) return 0;
        let lo = 0, hi = data.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((data[mid].t || 0) < ts) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0 && Math.abs((data[lo - 1].t || 0) - ts) < Math.abs((data[lo].t || 0) - ts)) {
            return lo - 1;
        }
        return lo;
    }

    /**
     * Sync time/scroll position across all panels (timestamp-based)
     * This syncs based on the center timestamp of the visible area
     */
    syncTime(sourcePanel, startIndex, endIndex) {
        if (!this.syncSettings.time || this.currentLayout === '1') return;
        
        const sourceChart = sourcePanel.chartInstance;
        if (!sourceChart || !sourceChart.data || sourceChart.data.length === 0) return;
        
        const rightTimestamp = sourceChart.data[Math.min(endIndex, sourceChart.data.length - 1)]?.t;
        if (!rightTimestamp) return;
        
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                const chartInst = panel.chartInstance;
                if (chartInst.data && chartInst.data.length > 0) {
                    const targetIndex = (chartInst.findGoToTargetIndex)
                        ? chartInst.findGoToTargetIndex(chartInst.data, rightTimestamp)
                        : this._bsearchTimestamp(chartInst.data, rightTimestamp);
                    
                    const spacing = chartInst.getCandleSpacing ? chartInst.getCandleSpacing() : (chartInst.candleWidth + 2);
                    const chartWidth = chartInst.w - chartInst.margin.l - chartInst.margin.r;
                    const visibleCandles = Math.floor(chartWidth / spacing);
                    
                    chartInst.offsetX = -(targetIndex - visibleCandles + 5) * spacing;
                    if (chartInst.constrainOffset) chartInst.constrainOffset();
                    if (chartInst.scheduleRender) chartInst.scheduleRender();
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
        
        requestAnimationFrame(() => { this._isSyncing = false; });
    }
    
    /**
     * Sync date range across all panels (scroll to same time window)
     */
    syncDateRange(sourcePanel, startTimestamp, endTimestamp) {
        if (!this.syncSettings.dateRange || this.currentLayout === '1') return;
        
        const sourceChart = sourcePanel.chartInstance;
        if (!sourceChart) return;
        
        this.panels.forEach(panel => {
            if (panel.index !== sourcePanel.index && panel.chartInstance) {
                const chartInst = panel.chartInstance;
                if (chartInst.data && chartInst.data.length > 0) {
                    const targetIndex = (chartInst.findGoToTargetIndex)
                        ? chartInst.findGoToTargetIndex(chartInst.data, endTimestamp)
                        : this._bsearchTimestamp(chartInst.data, endTimestamp);
                    
                    const spacing = chartInst.getCandleSpacing ? chartInst.getCandleSpacing() : (chartInst.candleWidth + 2);
                    const chartWidth = chartInst.w - chartInst.margin.l - chartInst.margin.r;
                    const visibleCandles = Math.floor(chartWidth / spacing);
                    
                    chartInst.offsetX = -(targetIndex - visibleCandles + 5) * spacing;
                    if (chartInst.constrainOffset) chartInst.constrainOffset();
                    if (chartInst.scheduleRender) chartInst.scheduleRender();
                }
            }
        });
    }
    
    /**
     * Sync indicators from the selected panel to all others
     */
    syncIndicatorsNow() {
        if (!this.syncSettings.indicators || this.currentLayout === '1') return;
        const src = this.panels[this.selectedPanelIndex];
        if (!src || !src.chartInstance) return;
        const srcChart = src.chartInstance;
        const srcIndicators = srcChart.indicators || [];

        this.panels.forEach(panel => {
            if (panel.index === src.index) return;
            const pc = panel.chartInstance;
            if (!pc) return;
            pc.indicators = JSON.parse(JSON.stringify(srcIndicators));
            if (typeof pc.recalculateIndicators === 'function') {
                try { pc.recalculateIndicators(); } catch (e) {}
            }
            if (typeof pc.render === 'function') pc.render();
        });
    }

    /**
     * Sync chart type (candle style) from selected panel to all others
     */
    syncChartTypeNow() {
        if (!this.syncSettings.chartType || this.currentLayout === '1') return;
        const src = this.panels[this.selectedPanelIndex];
        if (!src || !src.chartInstance) return;
        const srcChart = src.chartInstance;
        const chartType = srcChart.chartSettings && srcChart.chartSettings.chartType
            ? srcChart.chartSettings.chartType : 'candlestick';

        this.panels.forEach(panel => {
            if (panel.index === src.index) return;
            const pc = panel.chartInstance;
            if (!pc || !pc.chartSettings) return;
            pc.chartSettings.chartType = chartType;
            if (typeof pc.render === 'function') pc.render();
        });
    }

    /**
     * Keep the Talaria logo at the bottom-left of the full chart area in multi-panel mode
     * (not clipped to panel 0). Single-panel: logo stays inside #chartWrapper.
     */
    syncChartBrandPlacement(layout) {
        const brand = document.querySelector('.chart-brand');
        const wrapper = document.getElementById('chartWrapper');
        const pc = this.container || document.getElementById('panels-container');
        if (!brand || !wrapper || !pc) return;

        if (layout === '1') {
            if (brand.parentElement !== wrapper) {
                wrapper.appendChild(brand);
            }
            brand.classList.remove('chart-brand--multi');
            brand.style.zIndex = '';
        } else {
            if (brand.parentElement !== pc) {
                pc.appendChild(brand);
            }
            brand.classList.add('chart-brand--multi');
            /* Above .chart-panel (z-index 100) so watermark is visible */
            brand.style.zIndex = '5000';
        }
    }

    /** @returns {[number,number,number]|null} */
    _parseCssColorToRgb(color) {
        if (!color) return null;
        const s = String(color).trim();
        const rgba = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgba) {
            return [parseInt(rgba[1], 10), parseInt(rgba[2], 10), parseInt(rgba[3], 10)];
        }
        const hex = s.startsWith('#') ? s.slice(1) : s;
        if (/^[0-9a-f]{3}$/i.test(hex)) {
            return [
                parseInt(hex[0] + hex[0], 16),
                parseInt(hex[1] + hex[1], 16),
                parseInt(hex[2] + hex[2], 16)
            ];
        }
        if (/^[0-9a-f]{6}$/i.test(hex)) {
            return [
                parseInt(hex.slice(0, 2), 16),
                parseInt(hex.slice(2, 4), 16),
                parseInt(hex.slice(4, 6), 16)
            ];
        }
        return null;
    }

    _dividerColorForChartBackground(bgColor) {
        const rgb = this._parseCssColorToRgb(bgColor);
        if (!rgb) return '#2a2e39';
        const lum = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
        return lum > 195 ? 'rgba(0, 0, 0, 0.12)' : '#2a2e39';
    }

    getMultiPanelChromeFromMain() {
        const mc = typeof window !== 'undefined' ? window.chart : null;
        const bg = (mc && mc.chartSettings && mc.chartSettings.backgroundColor)
            ? mc.chartSettings.backgroundColor
            : '#131722';
        return {
            bg,
            border: this._dividerColorForChartBackground(bg)
        };
    }

    /**
     * Extra panel shells + main chart wrapper borders follow main chart colors (avoids forced dark “theme”).
     */
    refreshMultiPanelChrome() {
        if (!this.container || this.currentLayout === '1') return;
        const { bg, border } = this.getMultiPanelChromeFromMain();
        this.container.querySelectorAll('.chart-panel').forEach((el) => {
            el.style.background = bg;
            el.style.borderRight = `1px solid ${border}`;
            el.style.borderBottom = `1px solid ${border}`;
        });
        const ow = document.getElementById('chartWrapper');
        if (ow && this.container.contains(ow)) {
            ow.style.borderRight = `1px solid ${border}`;
            ow.style.borderBottom = `1px solid ${border}`;
        }
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

            // Logo must leave panels-container before innerHTML clears it
            this.syncChartBrandPlacement('1');
            
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
        
        // If logo already lived in panels-container, park it on chart-container so innerHTML does not wipe it
        const brandEl = document.querySelector('.chart-brand');
        const chartCont = document.getElementById('chart-container');
        if (brandEl && this.container.contains(brandEl) && chartCont) {
            chartCont.appendChild(brandEl);
        }

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
            const mainChrome = this.getMultiPanelChromeFromMain();

            // Apply first panel's position to original chart
            originalChart.style.display = 'block';
            originalChart.style.position = 'absolute';
            originalChart.style.width = firstConfig.width;
            originalChart.style.height = firstConfig.height;
            originalChart.style.left = firstConfig.left || '0';
            originalChart.style.top = firstConfig.top || '0';
            originalChart.style.right = 'auto';
            originalChart.style.bottom = 'auto';
            originalChart.style.border = 'none';
            originalChart.style.borderRight = `1px solid ${mainChrome.border}`;
            originalChart.style.borderBottom = `1px solid ${mainChrome.border}`;
            originalChart.style.boxSizing = 'border-box';
            originalChart.style.overflow = 'hidden';
            originalChart.style.zIndex = '10';
            
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
            
            // Add selection bar to main chart wrapper
            if (!originalChart.querySelector('.panel-select-bar')) {
                const bar = document.createElement('div');
                bar.className = 'panel-select-bar';
                originalChart.appendChild(bar);
            }
            
            // Mark main chart as a panel for drawing sync
            if (window.chart) {
                window.chart.isPanel = true;
                window.chart.panel = mainPanel;
                window.chart.panelIndex = 0;
            }
            
            // Add click handler to select main chart panel (click anywhere on chart wrapper)
            const chartWrapper = document.getElementById('chartWrapper');
            if (chartWrapper && !chartWrapper._panelClickHandler) {
                chartWrapper._panelClickHandler = (e) => {
                    console.log('🖱️ Main chart clicked', e.target);
                    
                    // Don't interfere with resize handles, buttons, or controls
                    if (e.target.closest('.panel-resize-handle')) {
                        console.log('⏭️ Skipping - resize handle');
                        return;
                    }
                    if (e.target.closest('button')) {
                        console.log('⏭️ Skipping - button');
                        return;
                    }
                    if (e.target.closest('.ohlc-collapse-btn')) {
                        console.log('⏭️ Skipping - collapse button');
                        return;
                    }
                    
                    // Don't interfere with active drawing tools
                    const activeChart = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : null;
                    if (activeChart && activeChart.drawingManager && activeChart.drawingManager.currentTool) {
                        console.log('⏭️ Skipping - drawing tool active');
                        return;
                    }
                    
                    if (this.selectedPanelIndex !== 0) {
                        console.log('✅ Selecting main chart (panel 0)');
                        this.selectPanel(0);
                    } else {
                        console.log('ℹ️ Main chart already selected');
                    }
                };
                chartWrapper.addEventListener('mousedown', chartWrapper._panelClickHandler, true);
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

        // After panels exist: logo must stack above .chart-panel (z-index 100) and be last child for paint order
        this.syncChartBrandPlacement(layout);
        const brandNode = document.querySelector('.chart-brand');
        if (brandNode && this.container.contains(brandNode)) {
            this.container.appendChild(brandNode);
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
        
        window.dispatchEvent(new CustomEvent('panelsCreated', {
            detail: { panels: this.panels, layout: layout }
        }));

        this.refreshMultiPanelChrome();

        this.savePanelState();

        // Load any saved custom panel sizes, then create drag-to-resize handles
        setTimeout(() => {
            const restored = this._loadPanelSizes();
            if (restored) {
                this.panels.forEach(panel => {
                    if (panel.chartInstance && panel.chartInstance.resize) {
                        panel.chartInstance._lastResizeDpr = 0;
                        panel.chartInstance.resize();
                        if (panel.chartInstance.render) panel.chartInstance.render();
                    }
                });
            }
            this.createResizeHandles();
        }, 300);
    }
    
    /**
     * Create individual panel
     */
    createPanel(config, index) {
        const chrome = this.getMultiPanelChromeFromMain();
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
            border-right: 1px solid ${chrome.border};
            border-bottom: 1px solid ${chrome.border};
            background: ${chrome.bg};
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
        canvas.style.cssText = `
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            touch-action: none;
            user-select: none;
            z-index: 1;
        `;
        chartContainer.appendChild(canvas);
        
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
            pointer-events: all;
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
        ohlcInfo.innerHTML = `
            <div class="ohlc-header">
                <div class="ohlc-symbol-block" style="position: relative;">
                    <span class="ohlc-symbol-dot" id="ohlcSymbolDot${index}">●</span>
                    <span class="ohlc-symbol-text" id="chartSymbol${index}">CHART</span>
                    <span class="ohlc-separator">·</span>
                    <span id="chartTimeframe${index}">${panelTimeframe}</span>
                </div>
                <div class="ohlc-stats">
                    <div class="ohlc-item"><span class="ohlc-label">O</span><span class="ohlc-value" id="open${index}">—</span></div>
                    <div class="ohlc-item"><span class="ohlc-label">H</span><span class="ohlc-value" id="high${index}">—</span></div>
                    <div class="ohlc-item"><span class="ohlc-label">L</span><span class="ohlc-value" id="low${index}">—</span></div>
                    <div class="ohlc-item"><span class="ohlc-label">C</span><span class="ohlc-value" id="close${index}">—</span></div>
                    <span class="ohlc-change" id="chartChange${index}">—</span>
                </div>
            </div>
            <div class="ohlc-body">
                <div class="ohlc-indicators" id="ohlcIndicators${index}"></div>
            </div>
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
        
        // Add selection indicator bar
        const selectBar = document.createElement('div');
        selectBar.className = 'panel-select-bar';
        panel.appendChild(selectBar);
        
        // Click anywhere on panel to select it (like TradingView)
        panel.addEventListener('mousedown', (e) => {
            console.log(`🖱️ Panel ${index} clicked`, e.target);
            
            // Don't interfere with resize handles, buttons, or other controls
            if (e.target.closest('.panel-resize-handle')) {
                console.log('⏭️ Skipping - resize handle');
                return;
            }
            if (e.target.closest('.ohlc-collapse-btn')) {
                console.log('⏭️ Skipping - collapse button');
                return;
            }
            if (e.target.closest('button')) {
                console.log('⏭️ Skipping - button');
                return;
            }
            
            // Don't interfere with active drawing tools
            const activeChart = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : null;
            if (activeChart && activeChart.drawingManager && activeChart.drawingManager.currentTool) {
                console.log('⏭️ Skipping - drawing tool active');
                return;
            }
            
            // Select this panel if not already selected
            if (this.selectedPanelIndex !== index) {
                console.log(`✅ Selecting panel ${index}`);
                this.selectPanel(index);
            } else {
                console.log(`ℹ️ Panel ${index} already selected`);
            }
        }, true); // Use capture phase to run before chart handlers
        
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
        
        // Trigger resize for canvas with proper DPR scaling
        setTimeout(() => {
            const rect = panel.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.height < 10000) {
                const dpr = window.devicePixelRatio || 1;
                const w = Math.floor(rect.width);
                const h = Math.floor(rect.height);
                canvas.width = Math.max(1, w * dpr);
                canvas.height = Math.max(1, h * dpr);
                canvas.style.width = w + 'px';
                canvas.style.height = h + 'px';
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.scale(dpr, dpr);
                }
                svg.setAttribute('width', w);
                svg.setAttribute('height', h);
                svg.style.width = w + 'px';
                svg.style.height = h + 'px';
                console.log(`📐 Panel ${index} sized: ${w}x${h} (DPR ${dpr}, physical ${w*dpr}x${h*dpr})`);
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
        
        // Deselect all panels
        this.panels.forEach((panel, i) => {
            if (panel.element) {
                panel.element.classList.remove('panel-selected');
            }
        });
        
        // Select the clicked panel
        if (this.panels[index]) {
            this.selectedPanelIndex = index;
            const panel = this.panels[index];
            
            if (panel.element) {
                panel.element.classList.add('panel-selected');
                // Ensure selection bar exists
                if (!panel.element.querySelector('.panel-select-bar')) {
                    const bar = document.createElement('div');
                    bar.className = 'panel-select-bar';
                    panel.element.appendChild(bar);
                }
            }
            
            // Resolve the LIVE timeframe from the chart instance (not the stale snapshot)
            const liveTimeframe = (panel.chartInstance && panel.chartInstance.currentTimeframe)
                ? panel.chartInstance.currentTimeframe
                : panel.timeframe;
            
            console.log(`📊 Panel ${index} selected (TF: ${liveTimeframe})`);
            
            // Dispatch event with live timeframe
            window.dispatchEvent(new CustomEvent('panelSelected', {
                detail: { 
                    panelIndex: index,
                    timeframe: liveTimeframe,
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
                    panel.element.style.overflow = 'visible'; // Allow crosshair lines to render fully
                } else {
                    // Hide other panels
                    panel.element.style.display = 'none';
                }
            }
        });
        
        // Resize the maximized panel's chart (use Chart.resize() for proper DPR)
        setTimeout(() => {
            const panel = this.panels[index];
            if (panel && panel.chartInstance && panel.chartInstance.resize) {
                panel.chartInstance._lastResizeDpr = 0; // force DPR recalc
                panel.chartInstance.resize();
                panel.chartInstance.render();
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
                panel.element.style.overflow = 'hidden'; // Restore clipping
            }
        });
        
        const wasMaximized = this.maximizedPanelIndex;
        this.maximizedPanelIndex = null;
        this.layoutBeforeMaximize = null;
        this.panelSizesBeforeMaximize = null;
        
        // Resize all charts (use Chart.resize() for proper DPR)
        setTimeout(() => {
            this.panels.forEach(panel => {
                if (panel.element && panel.element.style.display !== 'none' && panel.chartInstance && panel.chartInstance.resize) {
                    panel.chartInstance._lastResizeDpr = 0;
                    panel.chartInstance.resize();
                    panel.chartInstance.render();
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
        
        let settings = panel.chartInstance.chartSettings;
        const key = `chart_panel_${panelIndex}_settings`;
        
        try {
            if (panelIndex > 0) {
                settings = { ...settings };
                for (const k of PANEL_CHART_APPEARANCE_KEYS) {
                    delete settings[k];
                }
            }
            localStorage.setItem(key, JSON.stringify(settings));
        } catch (e) {}
    }

    /**
     * Force extra panel chart visuals to match the main chart (avoids stale localStorage themes).
     */
    applyMainAppearanceToPanelChart(panelChart) {
        const main = typeof window !== 'undefined' ? window.chart : null;
        if (!main || !main.chartSettings || !panelChart || !panelChart.chartSettings) return;
        if (panelChart === main) return;
        const cs = panelChart.chartSettings;
        const m = main.chartSettings;
        for (const k of PANEL_CHART_APPEARANCE_KEYS) {
            if (m[k] !== undefined) cs[k] = m[k];
        }
    }
    
    loadPanelSettings(panelIndex) {
        const key = `chart_panel_${panelIndex}_settings`;
        
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const settings = JSON.parse(saved);
                const panel = this.panels[panelIndex];
                if (panel && panel.chartInstance) {
                    panel.chartInstance.chartSettings = { ...panel.chartInstance.chartSettings, ...settings };
                    if (panelIndex > 0) {
                        this.applyMainAppearanceToPanelChart(panel.chartInstance);
                    }
                    panel.chartInstance.applyChartSettings();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    savePanelState() {
        if (!this._saveStateTimer) {
            this._saveStateTimer = setTimeout(() => {
                this._saveStateTimer = null;
                this._doSavePanelState();
            }, 300);
        }
    }

    _doSavePanelState() {
        try {
            const state = {
                layout: this.currentLayout,
                selectedPanelIndex: this.selectedPanelIndex,
                panels: this.panels.map((panel, idx) => {
                    const pc = panel.chartInstance;
                    if (!pc) return { index: idx, isMainChart: panel.isMainChart };
                    const hasOwn = Array.isArray(pc._panelFullRawData) && pc._panelFullRawData.length > 0;
                    return {
                        index: idx,
                        isMainChart: panel.isMainChart,
                        timeframe: pc.currentTimeframe || '1m',
                        fileId: hasOwn ? pc.currentFileId : null,
                        symbol: hasOwn ? pc.currentSymbol : null,
                        offsetX: pc.offsetX,
                        candleWidth: pc.candleWidth
                    };
                })
            };
            localStorage.setItem('chart_panel_state', JSON.stringify(state));
        } catch (e) {}
    }

    loadPanelState() {
        try {
            const raw = localStorage.getItem('chart_panel_state');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    restorePanelChartState(panelIndex) {
        const state = this.loadPanelState();
        if (!state || !state.panels) return;
        const ps = state.panels.find(p => p.index === panelIndex);
        if (!ps || ps.isMainChart) return;

        const panel = this.panels[panelIndex];
        if (!panel || !panel.chartInstance) return;
        const pc = panel.chartInstance;

        if (ps.timeframe) pc.currentTimeframe = ps.timeframe;
        if (Number.isFinite(ps.offsetX)) pc.offsetX = ps.offsetX;
        if (Number.isFinite(ps.candleWidth) && ps.candleWidth > 0) pc.candleWidth = ps.candleWidth;

        if (ps.fileId && ps.fileId !== (window.chart && window.chart.currentFileId)) {
            if (typeof pc.loadPanelFileData === 'function') {
                pc.loadPanelFileData(ps.fileId).then(() => {
                    pc.updateChartOHLCSymbol(pc.currentSymbol);
                    this._schedulePostRestoreRender(pc);
                }).catch(() => {});
            }
        } else {
            this._schedulePostRestoreRender(pc);
        }
    }

    _schedulePostRestoreRender(pc) {
        requestAnimationFrame(() => {
            if (pc._lastResizeDpr !== undefined) pc._lastResizeDpr = 0;
            if (typeof pc.resize === 'function') pc.resize();
            if (typeof pc.fitToView === 'function') pc.fitToView();
            if (typeof pc.render === 'function') pc.render();
            setTimeout(() => {
                if (pc._lastResizeDpr !== undefined) pc._lastResizeDpr = 0;
                if (typeof pc.resize === 'function') pc.resize();
                if (typeof pc.render === 'function') pc.render();
            }, 500);
        });
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
     * Create resize handles between panels (percentage-based)
     */
    createResizeHandles() {
        this.resizeHandles.forEach(h => { if (h && h.parentNode) h.parentNode.removeChild(h); });
        this.resizeHandles = [];

        if (this.panels.length < 2 || this.maximizedPanelIndex !== null) return;

        const chartContainer = document.getElementById('chart-container');
        if (!chartContainer) return;

        const SNAP = 1.5;
        const panelRects = this.panels.map((panel, idx) => {
            if (!panel.element) return null;
            const s = panel.element.style;
            return {
                idx,
                left:   parseFloat(s.left)   || 0,
                top:    parseFloat(s.top)    || 0,
                width:  parseFloat(s.width)  || 100,
                height: parseFloat(s.height) || 100,
            };
        }).filter(Boolean);

        const vBounds = new Map();
        const hBounds = new Map();

        panelRects.forEach(r => {
            const rightEdge = Math.round((r.left + r.width) * 100) / 100;
            if (rightEdge > SNAP && rightEdge < 100 - SNAP) {
                if (!vBounds.has(rightEdge)) vBounds.set(rightEdge, { left: [], right: [] });
                vBounds.get(rightEdge).left.push(r);
            }
            const leftEdge = Math.round(r.left * 100) / 100;
            if (leftEdge > SNAP && leftEdge < 100 - SNAP) {
                if (!vBounds.has(leftEdge)) vBounds.set(leftEdge, { left: [], right: [] });
                vBounds.get(leftEdge).right.push(r);
            }
            const bottomEdge = Math.round((r.top + r.height) * 100) / 100;
            if (bottomEdge > SNAP && bottomEdge < 100 - SNAP) {
                if (!hBounds.has(bottomEdge)) hBounds.set(bottomEdge, { top: [], bottom: [] });
                hBounds.get(bottomEdge).top.push(r);
            }
            const topEdge = Math.round(r.top * 100) / 100;
            if (topEdge > SNAP && topEdge < 100 - SNAP) {
                if (!hBounds.has(topEdge)) hBounds.set(topEdge, { top: [], bottom: [] });
                hBounds.get(topEdge).bottom.push(r);
            }
        });

        vBounds.forEach((sides, pct) => {
            if (sides.left.length === 0 || sides.right.length === 0) return;
            const all = [...sides.left, ...sides.right];
            const minTop = Math.min(...all.map(r => r.top));
            const maxBot = Math.max(...all.map(r => r.top + r.height));
            const handle = this._createPercentHandle('vertical', pct, minTop, maxBot - minTop, {
                boundary: pct,
                leftPanels: sides.left.map(r => r.idx),
                rightPanels: sides.right.map(r => r.idx),
            });
            if (handle) this.resizeHandles.push(handle);
        });

        hBounds.forEach((sides, pct) => {
            if (sides.top.length === 0 || sides.bottom.length === 0) return;
            const all = [...sides.top, ...sides.bottom];
            const minLeft = Math.min(...all.map(r => r.left));
            const maxRight = Math.max(...all.map(r => r.left + r.width));
            const handle = this._createPercentHandle('horizontal', minLeft, pct, maxRight - minLeft, {
                boundary: pct,
                topPanels: sides.top.map(r => r.idx),
                bottomPanels: sides.bottom.map(r => r.idx),
            });
            if (handle) this.resizeHandles.push(handle);
        });
    }

    _createPercentHandle(type, xPct, yPct, sizePct, meta) {
        const handle = document.createElement('div');
        handle.className = `panel-resize-handle ${type}`;

        if (type === 'vertical') {
            handle.style.cssText = `position:absolute;left:${xPct}%;top:${yPct}%;width:10px;height:${sizePct}%;transform:translateX(-50%);cursor:col-resize;background:transparent;z-index:200;pointer-events:auto;`;
        } else {
            handle.style.cssText = `position:absolute;left:${xPct}%;top:${yPct}%;width:${sizePct}%;height:10px;transform:translateY(-50%);cursor:row-resize;background:transparent;z-index:200;pointer-events:auto;`;
        }

        handle._resizeMeta = meta;
        handle._resizeType = type;

        handle.addEventListener('mouseenter', () => {
            if (!this.isResizing) {
                handle.style.background = type === 'vertical'
                    ? 'linear-gradient(90deg, transparent 20%, rgba(41,98,255,0.55) 50%, transparent 80%)'
                    : 'linear-gradient(180deg, transparent 20%, rgba(41,98,255,0.55) 50%, transparent 80%)';
            }
        });
        handle.addEventListener('mouseleave', () => {
            if (!this.isResizing) handle.style.background = 'transparent';
        });

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._startPercentResize(e, handle);
        });

        handle.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._resetPanelSizes();
            this.applyLayout(this.currentLayout);
        });

        const chartContainer = document.getElementById('chart-container');
        (chartContainer || this.container).appendChild(handle);
        return handle;
    }

    _startPercentResize(e, handle) {
        this.isResizing = true;
        this.resizeHandle = handle;
        this._resizeRAF = null;

        const chartContainer = document.getElementById('chart-container');
        const containerRect = chartContainer.getBoundingClientRect();
        const meta = handle._resizeMeta;
        const type = handle._resizeType;

        this._resizeState = {
            type, meta, containerRect,
            startX: e.clientX, startY: e.clientY,
            startBoundary: meta.boundary,
            panelSnapshots: this.panels.map((panel, idx) => {
                if (!panel.element) return null;
                const s = panel.element.style;
                return {
                    idx,
                    left:   parseFloat(s.left)   || 0,
                    top:    parseFloat(s.top)    || 0,
                    width:  parseFloat(s.width)  || 100,
                    height: parseFloat(s.height) || 100,
                };
            }),
        };

        handle.style.background = type === 'vertical'
            ? 'linear-gradient(90deg, transparent 15%, rgba(41,98,255,0.75) 50%, transparent 85%)'
            : 'linear-gradient(180deg, transparent 15%, rgba(41,98,255,0.75) 50%, transparent 85%)';
        document.body.style.cursor = type === 'vertical' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';

        const overlay = document.createElement('div');
        overlay.id = '_panelResizeOverlay';
        overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${document.body.style.cursor};`;
        document.body.appendChild(overlay);
        this._resizeOverlay = overlay;

        this._resizeMove = (ev) => {
            this._lastResizeX = ev.clientX;
            this._lastResizeY = ev.clientY;
            if (!this._resizeRAF) {
                this._resizeRAF = requestAnimationFrame(() => {
                    this._resizeRAF = null;
                    this._applyPercentResize();
                });
            }
        };
        this._resizeEnd = () => this._endPercentResize();

        document.addEventListener('mousemove', this._resizeMove, true);
        document.addEventListener('mouseup', this._resizeEnd, true);
    }

    _applyPercentResize() {
        if (!this.isResizing || !this._resizeState) return;
        const { type, meta, containerRect, startX, startY, startBoundary, panelSnapshots } = this._resizeState;
        const MIN_PCT = 8;

        let deltaPct;
        if (type === 'vertical') {
            deltaPct = ((this._lastResizeX - startX) / containerRect.width) * 100;
        } else {
            deltaPct = ((this._lastResizeY - startY) / containerRect.height) * 100;
        }

        let newBoundary = startBoundary + deltaPct;

        if (type === 'vertical') {
            const leftSnaps = panelSnapshots.filter(s => s && meta.leftPanels.includes(s.idx));
            const rightSnaps = panelSnapshots.filter(s => s && meta.rightPanels.includes(s.idx));
            const minAllowed = Math.max(...leftSnaps.map(r => r.left + MIN_PCT));
            const maxAllowed = Math.min(...rightSnaps.map(r => r.left + r.width - MIN_PCT));
            newBoundary = Math.max(minAllowed, Math.min(maxAllowed, newBoundary));
        } else {
            const topSnaps = panelSnapshots.filter(s => s && meta.topPanels.includes(s.idx));
            const botSnaps = panelSnapshots.filter(s => s && meta.bottomPanels.includes(s.idx));
            const minAllowed = Math.max(...topSnaps.map(r => r.top + MIN_PCT));
            const maxAllowed = Math.min(...botSnaps.map(r => r.top + r.height - MIN_PCT));
            newBoundary = Math.max(minAllowed, Math.min(maxAllowed, newBoundary));
        }

        panelSnapshots.forEach(snap => {
            if (!snap) return;
            const panel = this.panels[snap.idx];
            if (!panel || !panel.element) return;

            if (type === 'vertical') {
                if (meta.leftPanels.includes(snap.idx)) {
                    panel.element.style.width = (newBoundary - snap.left) + '%';
                } else if (meta.rightPanels.includes(snap.idx)) {
                    const originalRight = snap.left + snap.width;
                    panel.element.style.left = newBoundary + '%';
                    panel.element.style.width = (originalRight - newBoundary) + '%';
                }
            } else {
                if (meta.topPanels.includes(snap.idx)) {
                    panel.element.style.height = (newBoundary - snap.top) + '%';
                } else if (meta.bottomPanels.includes(snap.idx)) {
                    const originalBottom = snap.top + snap.height;
                    panel.element.style.top = newBoundary + '%';
                    panel.element.style.height = (originalBottom - newBoundary) + '%';
                }
            }
        });

        if (this.resizeHandle) {
            if (type === 'vertical') this.resizeHandle.style.left = newBoundary + '%';
            else this.resizeHandle.style.top = newBoundary + '%';
        }

        this._resizeState.currentBoundary = newBoundary;

        // Throttled live chart resize for visual feedback (~5 fps)
        const now = performance.now();
        if (!this._lastLiveResize || now - this._lastLiveResize > 200) {
            this._lastLiveResize = now;
            panelSnapshots.forEach(snap => {
                if (!snap) return;
                const panel = this.panels[snap.idx];
                if (!panel || !panel.chartInstance || !panel.chartInstance.resize) return;
                panel.chartInstance._lastResizeDpr = 0;
                panel.chartInstance.resize();
            });
        }
    }

    _endPercentResize() {
        if (!this.isResizing) return;
        this.isResizing = false;

        if (this._resizeRAF) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
        if (this._resizeOverlay) { this._resizeOverlay.remove(); this._resizeOverlay = null; }
        if (this.resizeHandle) this.resizeHandle.style.background = 'transparent';

        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', this._resizeMove, true);
        document.removeEventListener('mouseup', this._resizeEnd, true);

        this.panels.forEach(panel => {
            if (panel.element && panel.element.style.display !== 'none' && panel.chartInstance) {
                if (panel.chartInstance.resize) {
                    panel.chartInstance._lastResizeDpr = 0;
                    panel.chartInstance.resize();
                }
                if (panel.chartInstance.render) panel.chartInstance.render();
            }
        });

        setTimeout(() => this.createResizeHandles(), 30);
        this._savePanelSizes();
    }

    _savePanelSizes() {
        try {
            const sizes = this.panels.map(panel => {
                if (!panel.element) return null;
                return { left: panel.element.style.left, top: panel.element.style.top, width: panel.element.style.width, height: panel.element.style.height };
            });
            localStorage.setItem('chart_panel_sizes_' + this.currentLayout, JSON.stringify(sizes));
        } catch (e) { /* ignore */ }
    }

    _loadPanelSizes() {
        try {
            const saved = localStorage.getItem('chart_panel_sizes_' + this.currentLayout);
            if (!saved) return false;
            const sizes = JSON.parse(saved);
            if (!Array.isArray(sizes) || sizes.length !== this.panels.length) return false;
            let valid = true;
            sizes.forEach((size, i) => {
                if (!size || !this.panels[i] || !this.panels[i].element) { valid = false; return; }
                const w = parseFloat(size.width), h = parseFloat(size.height);
                if (isNaN(w) || isNaN(h) || w < 5 || h < 5) { valid = false; return; }
            });
            if (!valid) return false;
            sizes.forEach((size, i) => {
                const el = this.panels[i].element;
                el.style.left = size.left;
                el.style.top = size.top;
                el.style.width = size.width;
                el.style.height = size.height;
            });
            return true;
        } catch (e) { return false; }
    }

    _resetPanelSizes() {
        try { localStorage.removeItem('chart_panel_sizes_' + this.currentLayout); } catch (e) { /* ignore */ }
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