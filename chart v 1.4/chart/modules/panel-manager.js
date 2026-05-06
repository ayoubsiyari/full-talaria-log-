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
        
        // Resize state
        this.resizeHandles = [];
        this.isResizing = false;
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.resizeHandle = null;

        /** True while applying date-range sync so charts don't re-dispatch scroll storms */
        this._syncingDateRange = false;

        /** Per-target-panel last bar index so each follower only jumps when ITS own right-edge bar changes. */
        this._timeSyncLastTargetBar = {};
        
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
            const saved = userStorage.getItem('chart_panel_sync_settings');
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
            userStorage.setItem('chart_panel_sync_settings', JSON.stringify(this.syncSettings));
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
        window.addEventListener('chartScrolled', (e) => {
            if (this._isSyncing) return;
            const d = e.detail || {};
            const { panel, startTimestamp, endTimestamp } = d;
            if (!panel) return;

            // Date Range: continuous full-window sync (scroll + zoom locked).
            if (this.syncSettings.dateRange
                && Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp)
                && startTimestamp > 0 && endTimestamp > startTimestamp) {
                this.syncScrollByVisibleTimeRange(panel, startTimestamp, endTimestamp);
            }
            // Time: discrete range-by-range sync. Each TARGET panel jumps only when
            // the bar IT would show at its right edge changes — so a 5m target jumps
            // once every 5 min of scrolling, a 1m target jumps once per minute.
            else if (this.syncSettings.time
                && Number.isFinite(endTimestamp) && endTimestamp > 0) {
                const ts = Number.isFinite(d.timeSyncEndTimestamp) && d.timeSyncEndTimestamp > 0
                    ? d.timeSyncEndTimestamp : endTimestamp;
                this._discreteTimeSyncToRightEdge(panel, ts);
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
            background: var(--tv-panel-bg, var(--sp-ui-surface-bg, #1e222d));
            border: 1px solid var(--sp-ui-border, #2a2e39);
            border-radius: 6px;
            padding: 0;
            display: none;
            z-index: 10000;
            width: 330px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            color: var(--sp-text, #d1d4dc);
        `;

        // SVG icon helper: w=28 h=20 viewBox, stroke-width 1.5, rx=1
        const S = (inner) => `<svg width="28" height="20" viewBox="0 0 28 20">${inner}</svg>`;
        const R = (x,y,w,h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.5" rx="1"/>`;

        dropdown.innerHTML = `
            <div class="pld-body">
            <!-- Row 1 -->
            <div class="pld-row">
                <span class="pld-num">1</span>
                <div class="pld-icons">
                    <button class="layout-option active" data-layout="1" title="Single">${S(R(1,1,26,18))}</button>
                </div>
            </div>
            <!-- Row 2 -->
            <div class="pld-row">
                <span class="pld-num">2</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="2v" title="2 vertical">${S(R(1,1,12,18)+R(15,1,12,18))}</button>
                    <button class="layout-option" data-layout="2h" title="2 horizontal">${S(R(1,1,26,8)+R(1,11,26,8))}</button>
                </div>
            </div>
            <!-- Row 3 -->
            <div class="pld-row">
                <span class="pld-num">3</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="3v" title="3 vertical">${S(R(1,1,8,18)+R(10,1,8,18)+R(19,1,8,18))}</button>
                    <button class="layout-option" data-layout="3h" title="3 horizontal">${S(R(1,1,26,5)+R(1,7.5,26,5)+R(1,14,26,5))}</button>
                    <button class="layout-option" data-layout="3l" title="1 left + 2 right">${S(R(1,1,12,18)+R(15,1,12,8)+R(15,11,12,8))}</button>
                    <button class="layout-option" data-layout="3r" title="2 left + 1 right">${S(R(1,1,12,8)+R(1,11,12,8)+R(15,1,12,18))}</button>
                    <button class="layout-option" data-layout="3t" title="1 top + 2 bottom">${S(R(1,1,26,8)+R(1,11,12,8)+R(15,11,12,8))}</button>
                    <button class="layout-option" data-layout="3b" title="2 top + 1 bottom">${S(R(1,1,12,8)+R(15,1,12,8)+R(1,11,26,8))}</button>
                </div>
            </div>
            <!-- Row 4 -->
            <div class="pld-row">
                <span class="pld-num">4</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="4" title="2×2 grid">${S(R(1,1,12,8)+R(15,1,12,8)+R(1,11,12,8)+R(15,11,12,8))}</button>
                    <button class="layout-option" data-layout="4h" title="4 horizontal">${S(R(1,1,26,3.5)+R(1,5.5,26,3.5)+R(1,10,26,3.5)+R(1,14.5,26,3.5))}</button>
                    <button class="layout-option" data-layout="4v" title="4 vertical">${S(R(1,1,5.5,18)+R(8,1,5.5,18)+R(15,1,5.5,18)+R(22,1,5.5,18))}</button>
                    <button class="layout-option" data-layout="4t" title="1 top + 3 bottom">${S(R(1,1,26,8)+R(1,11,8,8)+R(10,11,8,8)+R(19,11,8,8))}</button>
                    <button class="layout-option" data-layout="4b" title="3 top + 1 bottom">${S(R(1,1,8,8)+R(10,1,8,8)+R(19,1,8,8)+R(1,11,26,8))}</button>
                    <button class="layout-option" data-layout="4r" title="3 left + 1 right">${S(R(1,1,12,5)+R(1,7.5,12,5)+R(1,14,12,5)+R(15,1,12,18))}</button>
                    <button class="layout-option" data-layout="4l" title="1 left + 3 right">${S(R(1,1,12,18)+R(15,1,12,5)+R(15,7.5,12,5)+R(15,14,12,5))}</button>
                    <button class="layout-option" data-layout="4tl" title="1 big + 3 small">${S(R(1,1,18,12)+R(21,1,6,12)+R(1,15,8,4)+R(10.5,15,8,4)+R(20,15,7,4))}</button>
                </div>
            </div>
            <!-- Row 5 -->
            <div class="pld-row">
                <span class="pld-num">5</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="5a" title="2 top + 3 bottom">${S(R(1,1,12,8)+R(15,1,12,8)+R(1,11,8,8)+R(10,11,8,8)+R(19,11,8,8))}</button>
                    <button class="layout-option" data-layout="5b" title="3 top + 2 bottom">${S(R(1,1,8,8)+R(10,1,8,8)+R(19,1,8,8)+R(1,11,12,8)+R(15,11,12,8))}</button>
                    <button class="layout-option" data-layout="5c" title="2 left + 3 right">${S(R(1,1,12,8)+R(1,11,12,8)+R(15,1,12,5)+R(15,7.5,12,5)+R(15,14,12,5))}</button>
                    <button class="layout-option" data-layout="5v" title="5 vertical">${S(R(1,1,4.4,18)+R(6.6,1,4.4,18)+R(12.2,1,4.4,18)+R(17.8,1,4.4,18)+R(23.4,1,4.4,18))}</button>
                    <button class="layout-option" data-layout="5h" title="5 horizontal">${S(R(1,1,26,2.8)+R(1,4.8,26,2.8)+R(1,8.6,26,2.8)+R(1,12.4,26,2.8)+R(1,16.2,26,2.8))}</button>
                </div>
            </div>
            <!-- Row 6 -->
            <div class="pld-row">
                <span class="pld-num">6</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="6" title="2×3 grid">${S(R(1,1,8,8)+R(10,1,8,8)+R(19,1,8,8)+R(1,11,8,8)+R(10,11,8,8)+R(19,11,8,8))}</button>
                    <button class="layout-option" data-layout="6b" title="3×2 grid">${S(R(1,1,12,5)+R(15,1,12,5)+R(1,7.5,12,5)+R(15,7.5,12,5)+R(1,14,12,5)+R(15,14,12,5))}</button>
                    <button class="layout-option" data-layout="6v" title="6 vertical">${S(R(1,1,3.5,18)+R(5.5,1,3.5,18)+R(10,1,3.5,18)+R(14.5,1,3.5,18)+R(19,1,3.5,18)+R(23.5,1,3.5,18))}</button>
                    <button class="layout-option" data-layout="6h" title="6 horizontal">${S(R(1,1,26,2.2)+R(1,4.2,26,2.2)+R(1,7.4,26,2.2)+R(1,10.6,26,2.2)+R(1,13.8,26,2.2)+R(1,17,26,2.2))}</button>
                </div>
            </div>
            <!-- Row 7 -->
            <div class="pld-row">
                <span class="pld-num">7</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="7a" title="3+3+1">${S(R(1,1,8,5)+R(10,1,8,5)+R(19,1,8,5)+R(1,7.5,8,5)+R(10,7.5,8,5)+R(19,7.5,8,5)+R(1,14,26,5))}</button>
                    <button class="layout-option" data-layout="7v" title="7 vertical">${S(R(1,1,3,18)+R(4.8,1,3,18)+R(8.6,1,3,18)+R(12.4,1,3,18)+R(16.2,1,3,18)+R(20,1,3,18)+R(23.8,1,3.2,18))}</button>
                </div>
            </div>
            <!-- Row 8 -->
            <div class="pld-row">
                <span class="pld-num">8</span>
                <div class="pld-icons">
                    <button class="layout-option" data-layout="8" title="2×4 grid">${S(R(1,1,5.5,8)+R(8,1,5.5,8)+R(15,1,5.5,8)+R(22,1,5.5,8)+R(1,11,5.5,8)+R(8,11,5.5,8)+R(15,11,5.5,8)+R(22,11,5.5,8))}</button>
                    <button class="layout-option" data-layout="8b" title="4×2 grid">${S(R(1,1,12,3.5)+R(15,1,12,3.5)+R(1,5.5,12,3.5)+R(15,5.5,12,3.5)+R(1,10,12,3.5)+R(15,10,12,3.5)+R(1,14.5,12,3.5)+R(15,14.5,12,3.5))}</button>
                    <button class="layout-option" data-layout="8v" title="8 vertical">${S(R(1,1,2.5,18)+R(4.3,1,2.5,18)+R(7.6,1,2.5,18)+R(10.9,1,2.5,18)+R(14.2,1,2.5,18)+R(17.5,1,2.5,18)+R(20.8,1,2.5,18)+R(24.1,1,2.9,18))}</button>
                    <button class="layout-option" data-layout="8h" title="8 horizontal">${S(R(1,1,26,1.5)+R(1,3.3,26,1.5)+R(1,5.6,26,1.5)+R(1,7.9,26,1.5)+R(1,10.2,26,1.5)+R(1,12.5,26,1.5)+R(1,14.8,26,1.5)+R(1,17.1,26,1.5))}</button>
                </div>
            </div>
            </div>

            <!-- Sync Settings -->
            <div class="sync-settings-section sync-section">
                <div class="sync-title">SYNC IN LAYOUT</div>
                <div class="sync-row">
                    <div class="sync-label"><span>Symbol</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="symbol-sync-toggle"></label>
                </div>
                <div class="sync-row">
                    <div class="sync-label"><span>Interval</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="interval-sync-toggle"></label>
                </div>
                <div class="sync-row">
                    <div class="sync-label"><span>Crosshair</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="crosshair-sync-toggle" checked></label>
                </div>
                <div class="sync-row">
                    <div class="sync-label"><span>Time</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="time-sync-toggle" checked></label>
                </div>
                <div class="sync-row">
                    <div class="sync-label"><span>Date range</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="daterange-sync-toggle"></label>
                </div>
                <div class="sync-row sync-row-border">
                    <div class="sync-label"><span>Drawings</span></div>
                    <label class="sync-toggle"><input type="checkbox" class="tv-native-checkbox" id="drawings-sync-toggle"></label>
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .layout-dropdown .pld-body {
                padding: 8px 10px 4px;
            }
            .layout-dropdown .pld-row {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 5px 0;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            .layout-dropdown .pld-row:last-child { border-bottom: none; }
            .layout-dropdown .pld-num {
                flex-shrink: 0;
                width: 16px;
                font-size: 11px;
                font-weight: 600;
                color: #787b86;
                line-height: 28px;
                text-align: center;
            }
            .layout-dropdown .pld-icons {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }
            .layout-option {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                padding: 3px;
                cursor: default;
                transition: all 0.12s ease;
                line-height: 0;
            }
            .layout-option:hover {
                border-color: rgba(41, 98, 255, 0.5);
                background: rgba(41, 98, 255, 0.08);
            }
            .layout-option.active {
                border-color: #2962ff;
                background: rgba(41, 98, 255, 0.15);
            }
            .layout-option svg {
                display: block;
                color: #636978;
            }
            .layout-option:hover svg {
                color: #b2b5be;
            }
            .layout-option.active svg {
                color: #d1d4dc;
            }
            body.light-mode .layout-option {
                border-color: rgba(0, 0, 0, 0.12);
            }
            body.light-mode .layout-option svg {
                color: #444444;
            }
            body.light-mode .layout-option:hover svg {
                color: #000000;
            }
            body.light-mode .layout-option.active svg {
                color: var(--sp-accent, #2962ff);
            }
            .sync-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 16px;
            }
            .sync-toggle input[type="checkbox"] {
                cursor: pointer;
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
        
        // Time sync toggle (one-shot on panel click — TradingView-style)
        const timeToggle = dropdown.querySelector('#time-sync-toggle');
        if (timeToggle) {
            timeToggle.checked = this.syncSettings.time;
            timeToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.time = e.target.checked;
                this._timeSyncLastTargetBar = {};
                this.saveSyncSettings();

                if (e.target.checked && this.panels.length > 1) {
                    const selectedPanel = this.panels[this.selectedPanelIndex];
                    if (selectedPanel) this.syncTimeToPanel(selectedPanel);
                }
            });
        }

        // Date range sync toggle (continuous scroll + zoom sync)
        const dateRangeToggle = dropdown.querySelector('#daterange-sync-toggle');
        if (dateRangeToggle) {
            dateRangeToggle.checked = this.syncSettings.dateRange;
            dateRangeToggle.addEventListener('change', (e) => {
                e.stopPropagation();
                this.syncSettings.dateRange = e.target.checked;
                this.saveSyncSettings();

                if (e.target.checked && this.panels.length > 1) {
                    const selectedPanel = this.panels[this.selectedPanelIndex];
                    if (selectedPanel?.chartInstance?.data?.length) {
                        const chart = selectedPanel.chartInstance;
                        const startIndex = chart.getVisibleStartIndex ? chart.getVisibleStartIndex() : 0;
                        const endIndex = chart.getVisibleEndIndex ? chart.getVisibleEndIndex() : chart.data.length - 1;
                        const startTimestamp = chart.data[Math.max(0, startIndex)]?.t;
                        const endTimestamp = chart.data[Math.min(chart.data.length - 1, endIndex)]?.t;
                        if (startTimestamp && endTimestamp) {
                            this.syncDateRange(selectedPanel, startTimestamp, endTimestamp);
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
        // Main chart: scope to canvas parent (V9 DOM has panel crosshairs before #chartWrapper)
        const mainRoot = window.chart && window.chart.canvas && window.chart.canvas.parentElement;
        const mainCrosshairV = mainRoot ? mainRoot.querySelector('.crosshair-vertical') : null;
        const mainCrosshairH = mainRoot ? mainRoot.querySelector('.crosshair-horizontal') : null;
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
        if (!this.syncSettings.symbol || (this.panels || []).length <= 1) return;
        
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            const pc = this._getPanelChartInstance(panel);
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
        if (!this.syncSettings.interval || (this.panels || []).length <= 1) return;
        
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            const pc = this._getPanelChartInstance(panel);
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
     * Time/Date-range sync should only happen between panels that show the
     * SAME instrument. Otherwise different sessions / holidays / data ranges
     * cause the follower to snap wildly, especially on higher timeframes
     * where a single source pan can map to a far-away bar in the target.
     * Returns true when the two charts represent the same pair.
     */
    _isSamePair(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        // Strict pair identity: REQUIRE both fileIds to be set and equal.
        // The previous version fell back to symbol comparison whenever either
        // side lacked a fileId. On higher timeframes the active panel can
        // briefly clear `currentFileId` while waiting for the aggregate to
        // build/load; during that window the symbol fallback could match two
        // different instruments (e.g., both panels reporting a stale symbol
        // from `window.chart`) and the panel manager would push panel0's
        // `offsetX` into the next pair's calendar — causing the chart to
        // slide off-screen. Symbol-only fallback also misfires when two panels
        // legitimately show the same symbol from different uploaded files
        // (different brokers / sessions). Strict fileId match avoids both
        // cases; cross-pair sync is correctly skipped.
        const fa = a.currentFileId != null ? String(a.currentFileId) : null;
        const fb = b.currentFileId != null ? String(b.currentFileId) : null;
        if (!fa || !fb) return false;
        return fa === fb;
    }

    _getPanelChartInstance(panel) {
        if (!panel) return null;
        if (panel.chartInstance) return panel.chartInstance;
        if (panel.isMainChart && typeof window !== 'undefined' && window.chart) return window.chart;
        return null;
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
     * Position a timestamp on all follower panels at a given fraction across the chart width
     * (0 = left edge, 0.5 = center, 1 = right edge). Each panel keeps its own zoom.
     */
    _positionOtherPanelsOnTimestamp(sourcePanel, timestamp, fraction) {
        if (!this.syncSettings.time || (this.panels || []).length <= 1) return;
        if (!Number.isFinite(timestamp)) return;

        this._isSyncing = true;
        const toRelease = [];
        const sourceChart = this._getPanelChartInstance(sourcePanel);
        try {
            this.panels.forEach(panel => {
                if (panel.index === sourcePanel.index) return;
                const chart = this._getPanelChartInstance(panel);
                if (!chart?.data?.length) return;
                // Skip cross-pair time sync — different instruments don't share a calendar.
                if (!this._isSamePair(sourceChart, chart)) return;

                chart._suppressPanelScrollSync = true;
                toRelease.push(chart);

                const targetIdx = chart.findGoToTargetIndex
                    ? chart.findGoToTargetIndex(chart.data, timestamp)
                    : this._bsearchTimestamp(chart.data, timestamp);

                const spacing = chart.getCandleSpacing ? chart.getCandleSpacing() : (chart.candleWidth + 2);
                const m = chart.margin || { l: 0, r: 60 };
                const chartWidth = chart.w - m.l - m.r;

                chart.offsetX = (chartWidth * fraction) - (targetIdx * spacing);
                if (chart.constrainOffset) chart.constrainOffset();
                if (chart.scheduleRender) chart.scheduleRender();

                this._timeSyncLastTargetBar[panel.index] = targetIdx;
            });
        } finally {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    toRelease.forEach(c => { c._suppressPanelScrollSync = false; });
                    this._isSyncing = false;
                });
            });
        }
    }

    /**
     * TradingView-style: when a panel is selected, show its right-edge time on all others.
     */
    syncTimeToPanel(sourcePanel) {
        const sourceChart = this._getPanelChartInstance(sourcePanel);
        if (!sourceChart?.data?.length) return;

        const endIndex = typeof sourceChart.getVisibleEndIndex === 'function'
            ? sourceChart.getVisibleEndIndex() : sourceChart.data.length - 1;
        const rightTs = sourceChart.data[Math.min(endIndex, sourceChart.data.length - 1)]?.t;
        if (!rightTs) return;
        this._positionOtherPanelsOnTimestamp(sourcePanel, rightTs, 0.85);
    }

    /**
     * Click on a bar → place that time at the same relative screen position on follower panels.
     */
    syncTimeToClickedTimestamp(sourcePanel, timestamp, screenFraction) {
        const frac = Number.isFinite(screenFraction) ? screenFraction : 0.5;
        this._positionOtherPanelsOnTimestamp(sourcePanel, timestamp, frac);
    }
    
    /**
     * Per-target discrete Time sync: for each follower panel, compute which bar index
     * the source's right-edge timestamp maps to in THAT panel's data. Only update
     * when that target bar index changes (so 5m targets jump every 5 minutes, 1m every minute).
     */
    _discreteTimeSyncToRightEdge(sourcePanel, rightEdgeTimestamp) {
        if (this._isSyncing) return;
        if (!this.syncSettings.time || (this.panels || []).length <= 1) return;
        if (!Number.isFinite(rightEdgeTimestamp)) return;

        let anyChanged = false;
        const toUpdate = [];

        const sourceChart = this._getPanelChartInstance(sourcePanel);
        this.panels.forEach(panel => {
            if (panel.index === sourcePanel.index) return;
            const chart = this._getPanelChartInstance(panel);
            if (!chart?.data?.length) return;
            // Skip cross-pair time sync — different instruments don't share a calendar.
            if (!this._isSamePair(sourceChart, chart)) return;

            const targetIdx = chart.findGoToTargetIndex
                ? chart.findGoToTargetIndex(chart.data, rightEdgeTimestamp)
                : this._bsearchTimestamp(chart.data, rightEdgeTimestamp);

            const lastIdx = this._timeSyncLastTargetBar[panel.index];
            if (lastIdx === targetIdx) return;

            this._timeSyncLastTargetBar[panel.index] = targetIdx;
            anyChanged = true;
            toUpdate.push({ chart, targetIdx });
        });

        if (!anyChanged) return;

        this._isSyncing = true;
        try {
            toUpdate.forEach(({ chart, targetIdx }) => {
                chart._suppressPanelScrollSync = true;

                const spacing = chart.getCandleSpacing ? chart.getCandleSpacing() : (chart.candleWidth + 2);
                const m = chart.margin || { l: 0, r: 60 };
                const chartWidth = chart.w - m.l - m.r;
                const visibleCandles = Math.max(1, Math.floor(chartWidth / spacing));

                chart.offsetX = -(targetIdx - visibleCandles + 1) * spacing;
                if (chart.constrainOffset) chart.constrainOffset();
                if (chart.scheduleRender) chart.scheduleRender();
            });
        } finally {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    toUpdate.forEach(({ chart }) => { chart._suppressPanelScrollSync = false; });
                    this._isSyncing = false;
                });
            });
        }
    }

    /**
     * Last data index with candle time <= ts (ascending by .t). Used for date-range scroll alignment.
     */
    _findLastIndexAtOrBefore(data, ts) {
        if (!data || data.length === 0) return 0;
        if (!Number.isFinite(ts)) return 0;
        let lo = 0;
        let hi = data.length - 1;
        let ans = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const t = data[mid]?.t || 0;
            if (t <= ts) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return Math.max(0, Math.min(ans, data.length - 1));
    }

    /**
     * Date-range sync: every panel shows the same wall-clock window [start, rangeEndExclusive).
     * Fits candles into the plot width (resize) + scroll so the span matches (e.g. 7×30m = same 3.5h on 1m).
     * @param {number} rangeEndExclusive - first instant after the last visible bar (source open + barMs).
     */
    syncScrollByVisibleTimeRange(sourcePanel, startTimestamp, rangeEndExclusive) {
        if (this._isSyncing) return;
        if (!this.syncSettings.dateRange || (this.panels || []).length <= 1) return;

        const sourceChart = this._getPanelChartInstance(sourcePanel);
        if (!sourceChart?.data?.length) return;
        if (!Number.isFinite(startTimestamp) || !Number.isFinite(rangeEndExclusive)) return;
        if (rangeEndExclusive <= startTimestamp) return;

        const toRelease = [];
        this._isSyncing = true;
        this._syncingDateRange = true;
        try {
            this.panels.forEach(panel => {
                if (panel.index === sourcePanel.index) return;
                const chart = this._getPanelChartInstance(panel);
                if (!chart?.data?.length) return;
                // Skip cross-pair date-range sync — different instruments would scroll wildly.
                if (!this._isSamePair(sourceChart, chart)) return;

                chart._suppressPanelScrollSync = true;
                toRelease.push(chart);

                const m = chart.margin || { l: 0, r: 60 };
                const chartWidth = chart.w - m.l - m.r;
                if (chartWidth <= 0) return;

                const iL = this._findLastIndexAtOrBefore(chart.data, startTimestamp);
                const iR = this._findLastIndexAtOrBefore(chart.data, rangeEndExclusive - 1);
                const iL2 = Math.max(0, Math.min(iL, chart.data.length - 1));
                const iR2 = Math.max(iL2, Math.min(iR, chart.data.length - 1));
                const numBars = Math.max(1, iR2 - iL2 + 1);

                // Desired spacing = chartWidth / numBars, but getCandleSpacing adds a gap.
                // Solve for candleWidth so that getCandleSpacing(cw) ≈ desiredSpacing.
                const desiredSpacing = chartWidth / numBars;
                let cw = desiredSpacing;
                if (typeof chart._getSpacingForCandleWidth === 'function') {
                    const s1 = chart._getSpacingForCandleWidth(cw);
                    if (s1 > 0) cw = cw * (desiredSpacing / s1);
                    const s2 = chart._getSpacingForCandleWidth(cw);
                    if (s2 > 0) cw = cw * (desiredSpacing / s2);
                }

                const allowedWidths = (chart.zoomLevel && Array.isArray(chart.zoomLevel.allowedWidths) && chart.zoomLevel.allowedWidths.length)
                    ? chart.zoomLevel.allowedWidths
                    : [0.2, 0.35, 0.5, 0.75, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
                const minW = allowedWidths[0];
                const maxW = allowedWidths[allowedWidths.length - 1];
                chart.candleWidth = Math.max(minW, Math.min(maxW, cw));

                let nearestIdx = 0;
                let minDiff = Math.abs(chart.candleWidth - allowedWidths[0]);
                for (let i = 1; i < allowedWidths.length; i++) {
                    const d = Math.abs(chart.candleWidth - allowedWidths[i]);
                    if (d < minDiff) { minDiff = d; nearestIdx = i; }
                }
                if (chart.zoomLevel) chart.zoomLevel.candleWidthIndex = nearestIdx;
                if (chart._candleWidthAtCache !== undefined) chart._candleWidthAtCache = null;

                // Right-edge anchoring (TradingView-style): last visible bar stays at right margin
                const spacing = chart.getCandleSpacing ? chart.getCandleSpacing() : chart.candleWidth;
                chart.offsetX = chartWidth - (iR2 + 1) * spacing;
                if (chart.constrainOffset) chart.constrainOffset();
                if (chart.scheduleRender) chart.scheduleRender();
                else if (chart.render) chart.render();
            });
        } finally {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    toRelease.forEach(c => { c._suppressPanelScrollSync = false; });
                    this._isSyncing = false;
                    this._syncingDateRange = false;
                });
            });
        }
    }

    /** @deprecated kept for backward compatibility */
    syncScroll(sourcePanel) {
        this.syncTimeToPanel(sourcePanel);
    }
    
    /**
     * Sync date range across all panels (same visible wall-clock window + fit zoom)
     */
    syncDateRange(sourcePanel, startTimestamp, endTimestampLastOpen) {
        if (!this.syncSettings.dateRange || (this.panels || []).length <= 1) return;

        const sourceChart = this._getPanelChartInstance(sourcePanel);
        if (!sourceChart?.data?.length) return;
        const barMs = typeof sourceChart.inferBarDurationMs === 'function'
            ? sourceChart.inferBarDurationMs()
            : 60000;
        const rangeEndExclusive = (Number.isFinite(endTimestampLastOpen) ? endTimestampLastOpen : startTimestamp) + barMs;
        this.syncScrollByVisibleTimeRange(sourcePanel, startTimestamp, rangeEndExclusive);
    }
    
    /**
     * Sync indicators from the selected panel to all others
     */
    syncIndicatorsNow() {
        if (!this.syncSettings.indicators || (this.panels || []).length <= 1) return;
        const src = this.panels[this.selectedPanelIndex];
        const srcChart = this._getPanelChartInstance(src);
        if (!src || !srcChart) return;
        const srcIndicators = srcChart.indicators || [];

        this.panels.forEach(panel => {
            if (panel.index === src.index) return;
            const pc = this._getPanelChartInstance(panel);
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
        if (!this.syncSettings.chartType || (this.panels || []).length <= 1) return;
        const src = this.panels[this.selectedPanelIndex];
        const srcChart = this._getPanelChartInstance(src);
        if (!src || !srcChart) return;
        const chartType = srcChart.chartSettings && srcChart.chartSettings.chartType
            ? srcChart.chartSettings.chartType : 'candlestick';

        this.panels.forEach(panel => {
            if (panel.index === src.index) return;
            const pc = this._getPanelChartInstance(panel);
            if (!pc || !pc.chartSettings) return;
            pc.chartSettings.chartType = chartType;
            if (typeof pc.render === 'function') pc.render();
        });
    }

    /**
     * Keep the Talaria logo at the bottom-left of the full chart area in multi-panel mode
     * (not clipped to panel 0). Single-panel: logo stays inside #chartWrapper.
     *
     * Multi-panel: the logo must live under #chart-container, not #panels-container.
     * #chartWrapper is a sibling of #panels-container with the same z-index but painted
     * later, so it covers the whole panels layer — a logo inside panels-container would
     * sit underneath the main chart (invisible in the bottom-left).
     */
    syncChartBrandPlacement(layout) {
        const brand = document.querySelector('.chart-brand');
        const wrapper = document.getElementById('chartWrapper');
        const pc = this.container || document.getElementById('panels-container');
        const chartCont = document.getElementById('chart-container');
        if (!brand || !wrapper || !pc) return;

        if (layout === '1') {
            if (brand.parentElement !== wrapper) {
                wrapper.appendChild(brand);
            }
            brand.classList.remove('chart-brand--multi');
            brand.style.zIndex = '';
        } else if (chartCont) {
            if (brand.parentElement !== chartCont) {
                chartCont.appendChild(brand);
            }
            brand.classList.add('chart-brand--multi');
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
        return lum > 195 ? '#d6dce6' : '#2a2e39';
    }

    getMultiPanelChromeFromMain() {
        const mc = typeof window !== 'undefined' ? window.chart : null;
        const bg = (mc && mc.chartSettings && mc.chartSettings.backgroundColor)
            ? mc.chartSettings.backgroundColor
            : (typeof document !== 'undefined' && document.body && document.body.classList.contains('light-mode')
                ? '#ffffff'
                : '#131722');
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
        const { bg } = this.getMultiPanelChromeFromMain();
        this.container.querySelectorAll('.chart-panel').forEach((el) => {
            el.style.background = bg;
        });
        const ow = document.getElementById('chartWrapper');
        if (ow && this.container.contains(ow)) {
            ow.style.background = bg;
        }
    }

    /**
     * Apply selected layout
     */
    applyLayout(layout) {
        console.log('Applying layout:', layout);
        this.currentLayout = layout;

        // Keep dropdown active state in sync
        const dropdown = document.getElementById('panel-layout-dropdown');
        if (dropdown) {
            dropdown.querySelectorAll('.layout-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.layout === layout);
            });
        }
        
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

            // Remove selection overlay and clear selected class from everything
            document.querySelectorAll('.panel-selection-frame').forEach(f => f.remove());
            document.querySelectorAll('.panel-selected').forEach(el => el.classList.remove('panel-selected'));
            
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
            // Keep container fully turned off in single-layout mode
            if (this.container) {
                this.container.style.display = 'none';
                this.container.innerHTML = '';
            }
            
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
            
            // Comprehensive restore of main chart functionality (next frame, no artificial delay)
            const _restoreMainChart = () => {
                if (!window.chart) return;
                const chart = window.chart;

                // Invalidate cached DPR so resize() always recalculates
                if (chart._lastResizeDpr !== undefined) chart._lastResizeDpr = 0;
                
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
                
                // Reset crosshair elements (must not use document — panel slots come first in DOM)
                const mainRoot = chart.canvas && chart.canvas.parentElement;
                const crosshairV = mainRoot ? mainRoot.querySelector('.crosshair-vertical') : null;
                const crosshairH = mainRoot ? mainRoot.querySelector('.crosshair-horizontal') : null;
                const priceLabel = mainRoot ? mainRoot.querySelector('.price-label') : null;
                const timeLabel = mainRoot ? mainRoot.querySelector('.time-label') : null;
                
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
            };

            // First pass: after DOM settles
            requestAnimationFrame(() => {
                _restoreMainChart();
                // Second pass: catch late reflows where container size wasn't final yet
                requestAnimationFrame(() => {
                    if (window.chart) {
                        if (window.chart._lastResizeDpr !== undefined) window.chart._lastResizeDpr = 0;
                        if (window.chart.resize) window.chart.resize();
                        if (window.chart.render) window.chart.render();
                    }
                });
            });
            
            // Dispatch event when returning to single panel mode
            window.dispatchEvent(new CustomEvent('returnedToSinglePanel', {
                detail: { layout: '1' }
            }));

            // Ensure global "active panel" context points to main chart immediately.
            window.dispatchEvent(new CustomEvent('panelSelected', {
                detail: {
                    panelIndex: 0,
                    timeframe: window.chart && window.chart.currentTimeframe ? window.chart.currentTimeframe : '1m',
                    panel: { index: 0, chartInstance: window.chart, isMainChart: true },
                    isMainChart: true
                }
            }));

            // Persist that user is now in single layout (panels stay off until explicitly re-selected).
            this.savePanelState();
            
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
            '3r': [
                { width: '50%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '0', top: '50%' },
                { width: '50%', height: '100%', left: '50%', top: '0' }
            ],
            '3t': [
                { width: '100%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '0', top: '50%' },
                { width: '50%', height: '50%', left: '50%', top: '50%' }
            ],
            '3b': [
                { width: '50%', height: '50%', left: '0', top: '0' },
                { width: '50%', height: '50%', left: '50%', top: '0' },
                { width: '100%', height: '50%', left: '0', top: '50%' }
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
            '4l': [ // 1 left + 3 right
                { width: '50%', height: '100%', left: '0', top: '0' },
                { width: '50%', height: '33.33%', left: '50%', top: '0' },
                { width: '50%', height: '33.33%', left: '50%', top: '33.33%' },
                { width: '50%', height: '33.33%', left: '50%', top: '66.66%' }
            ],
            '4tl': [ // 1 big top-left + 1 right + 2 bottom
                { width: '66.66%', height: '60%', left: '0', top: '0' },
                { width: '33.33%', height: '60%', left: '66.66%', top: '0' },
                { width: '50%', height: '40%', left: '0', top: '60%' },
                { width: '50%', height: '40%', left: '50%', top: '60%' }
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
                    
                    if (this.selectedPanelIndex !== 0) {
                        console.log('✅ Selecting main chart (panel 0)');
                        this.selectPanel(0);
                    } else {
                        console.log('ℹ️ Main chart already selected');
                    }
                };
                chartWrapper.addEventListener('mousedown', chartWrapper._panelClickHandler, true);
            }
            
            console.log(`📊 Panel 0: Main chart positioned at ${firstConfig.width} x ${firstConfig.height}`);
            
            // Trigger resize for main chart after positioning
            requestAnimationFrame(() => {
                if (window.chart && window.chart.resize) {
                    window.chart.resize();
                    window.chart.render();
                }
            });
        }
        
        // Create additional panels (starting from index 1)
        for (let i = 1; i < panelConfig.length; i++) {
            this.createPanel(panelConfig[i], i);
        }

        // After panels exist: park logo on #chart-container (above #chartWrapper paint order)
        this.syncChartBrandPlacement(layout);
        const brandNode = document.querySelector('.chart-brand');
        if (brandNode && chartCont) {
            chartCont.appendChild(brandNode);
        }
        
        console.log(`✅ ${this.panels.length} panels total (1 main + ${this.panels.length - 1} additional)`);
        
        // Auto-select first panel (main chart) immediately
        if (this.panels.length > 0) {
            this.selectPanel(0);
        }
        
        // Sync cursor type from main chart to all panels
        requestAnimationFrame(() => {
            if (window.chart && window.chart.cursorType) {
                window.chart.syncCursorTypeToAllCharts(window.chart.cursorType);
                console.log(`🖱️ Synced cursor type '${window.chart.cursorType}' to all panels`);
            }
        });
        
        window.dispatchEvent(new CustomEvent('panelsCreated', {
            detail: { panels: this.panels, layout: layout }
        }));

        this.refreshMultiPanelChrome();

        this.savePanelState();

        // Load any saved custom panel sizes, then create drag-to-resize handles
        requestAnimationFrame(() => {
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
            this._updateSelectionOverlay();
        });

        // Panel charts can be initialized while percentage layout still reports 0×0, so resize()
        // bails out once and never revisits. One delayed pass catches real dimensions.
        setTimeout(() => {
            if (typeof this.resizePanels === 'function') this.resizePanels();
        }, 350);
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
            background: ${chrome.bg};
            z-index: 100;
        `;
        
        console.log(`Creating panel ${index}:`, config);
        
        // Default timeframe for this panel
        const defaultTimeframes = ['1h', '15m', '5m', '1D', '4h', '30m', '1m', '1W'];
        const panelTimeframe = defaultTimeframes[index] || '1h';
        
        // Chart container within panel (same structure as main chart)
        const chartContainer = document.createElement('div');
        chartContainer.className = 'panel-chart-container';
        const _panelBg = (typeof window !== 'undefined' && window.chart && window.chart.chartSettings && window.chart.chartSettings.backgroundColor)
            ? window.chart.chartSettings.backgroundColor
            : (typeof document !== 'undefined' && document.body && document.body.classList.contains('light-mode') ? '#ffffff' : '#131722');
        chartContainer.style.cssText = `
            width: 100%;
            height: 100%;
            position: relative;
            background: ${_panelBg};
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
            width: 100%;
            height: 100%;
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
                <div class="ohlc-symbol-block" style="position: relative; display: flex; align-items: center; gap: 4px;">
                    <span class="ohlc-symbol-text" id="chartSymbol${index}">CHART</span>
                    <span class="ohlc-separator"> · </span>
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
            <div class="ohlc-legend-footer">
                <button type="button" class="ohlc-legend-chevron" id="ohlcCollapseBtn${index}" aria-label="Toggle indicator list" aria-expanded="true" style="pointer-events: auto;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"></polyline>
                    </svg>
                </button>
            </div>
        `;
        chartContainer.appendChild(ohlcInfo);
        
        // Setup collapse button for this panel's OHLC
        const collapseBtn = ohlcInfo.querySelector(`#ohlcCollapseBtn${index}`);
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ohlcInfo.classList.toggle('collapsed');
                const collapsed = ohlcInfo.classList.contains('collapsed');
                collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            });
        }
        
        // Add follow button for this panel
        const followBtn = document.createElement('button');
        followBtn.className = 'panel-follow-btn';
        followBtn.id = `panelFollow${index}`;
        followBtn.title = 'Follow Latest Candle';
        followBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4v16" fill="none" stroke-width="2"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/></svg>`;
        followBtn.style.display = 'none';
        followBtn.addEventListener('click', () => {
            const replay = window.chart && window.chart.replaySystem;
            if (replay && typeof replay.enableAutoScroll === 'function') {
                replay.enableAutoScroll();
            }
        });
        chartContainer.appendChild(followBtn);

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
        
        // Trigger resize for canvas with proper DPR scaling
        requestAnimationFrame(() => {
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
        });
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
        this._timeSyncLastTargetBar = {};

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

            this._updateSelectionOverlay();
            
            // Resolve the LIVE timeframe from the chart instance (not the stale snapshot)
            const liveTimeframe = (panel.chartInstance && panel.chartInstance.currentTimeframe)
                ? panel.chartInstance.currentTimeframe
                : panel.timeframe;

            // Clear drawing tools and hide crosshairs on non-selected panels.
            // Use _mirrored=true to avoid the mirror cascade clearing the
            // selected panel's tool as well.
            this.panels.forEach((p, i) => {
                if (i === index) return;
                const dm = p && p.chartInstance && p.chartInstance.drawingManager;
                if (dm && dm.currentTool && typeof dm.clearTool === 'function') {
                    dm.clearTool(true);
                }
                if (p && p.chartInstance && typeof p.chartInstance.hideCrosshair === 'function') {
                    p.chartInstance.hideCrosshair();
                }
            });
            if (window.chart && window.chart.drawingManager && window.chart.drawingManager.currentTool) {
                const isMainSelected = panel.chartInstance === window.chart;
                if (!isMainSelected) {
                    window.chart.drawingManager.clearTool(true);
                }
            }

            // Force resize + render on the selected panel so internal
            // dimensions (this.w / this.h) are up-to-date for crosshair bounds.
            if (panel.chartInstance) {
                const ci = panel.chartInstance;
                if (ci._lastResizeDpr !== undefined) ci._lastResizeDpr = 0;
                if (typeof ci.resize === 'function') ci.resize();
                if (typeof ci.render === 'function') ci.render();
            }
            
            console.log(`📊 Panel ${index} selected (TF: ${liveTimeframe})`);

            // Time sync: navigate all other panels to the same center point in time
            if (this.syncSettings.time) {
                this.syncTimeToPanel(panel);
            }
            
            // Dispatch event with live timeframe
            window.dispatchEvent(new CustomEvent('panelSelected', {
                detail: { 
                    panelIndex: index,
                    timeframe: liveTimeframe,
                    panel: panel,
                    isMainChart: panel.isMainChart
                }
            }));

            // Order draft preview (TP/SL/entry) must move to the selected chart; otherwise lines stay on the previous panel's SVG.
            try {
                const om = (typeof window !== 'undefined' && window.chart && window.chart.orderManager)
                    ? window.chart.orderManager
                    : (typeof window !== 'undefined' ? window.orderManager : null);
                if (om && typeof om.refreshDraftPreviewForActivePanel === 'function') {
                    requestAnimationFrame(() => {
                        try {
                            om.refreshDraftPreviewForActivePanel();
                        } catch (_e) { /* ignore */ }
                    });
                }
            } catch (_e) { /* ignore */ }
        }
    }
    
    _updateSelectionOverlay() {
        const chartContainer = document.getElementById('chart-container');
        if (!chartContainer) return;

        let overlay = chartContainer.querySelector('.panel-selection-frame');

        // In single-panel mode the ::after CSS handles the border; no overlay needed.
        if (this.panels.length <= 1) {
            if (overlay) overlay.remove();
            return;
        }

        const panel = this.panels[this.selectedPanelIndex];
        if (!panel || !panel.element) {
            if (overlay) overlay.remove();
            return;
        }

        const el = panel.element;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'panel-selection-frame';
            chartContainer.appendChild(overlay);
        }

        overlay.style.left   = el.style.left;
        overlay.style.top    = el.style.top;
        overlay.style.width  = el.style.width;
        overlay.style.height = el.style.height;
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
            userStorage.setItem(key, JSON.stringify(settings));
        } catch (e) {}
    }

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
            const saved = userStorage.getItem(key);
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
            userStorage.setItem('chart_panel_state', JSON.stringify(state));
        } catch (e) {}
    }

    loadPanelState() {
        try {
            const raw = userStorage.getItem('chart_panel_state');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    restorePanelChartState(panelIndex) {
        const state = this.loadPanelState();
        if (!state || !state.panels) {
            // No saved state — just make sure chart shows last candle
            const panel = this.panels[panelIndex];
            if (panel && panel.chartInstance) {
                this._schedulePostRestoreRender(panel.chartInstance);
            }
            return;
        }
        const ps = state.panels.find(p => p.index === panelIndex);
        if (!ps || ps.isMainChart) {
            const panel = this.panels[panelIndex];
            if (panel && panel.chartInstance) {
                this._schedulePostRestoreRender(panel.chartInstance);
            }
            return;
        }

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
                }).catch(() => {
                    this._schedulePostRestoreRender(pc);
                });
            }
        } else {
            this._schedulePostRestoreRender(pc);
        }
    }

    _schedulePostRestoreRender(pc) {
        requestAnimationFrame(() => {
            if (pc._lastResizeDpr !== undefined) pc._lastResizeDpr = 0;
            if (typeof pc.resize === 'function') pc.resize();
            pc._chartViewRestored = false;
            if (typeof pc.fitToView === 'function') pc.fitToView();
            if (typeof pc.render === 'function') pc.render();
            requestAnimationFrame(() => {
                if (pc._lastResizeDpr !== undefined) pc._lastResizeDpr = 0;
                if (typeof pc.resize === 'function') pc.resize();
                // Ensure last candle is visible after final resize
                if (pc.data && pc.data.length > 0) {
                    const m = pc.margin || { l: 0, r: 0 };
                    const cw = (pc.w || 0) - m.l - m.r;
                    const spacing = typeof pc.getCandleSpacing === 'function' ? pc.getCandleSpacing() : (pc.candleWidth + 2);
                    const lastCandleX = m.l + (pc.data.length - 1) * spacing + (pc.offsetX || 0);
                    if (lastCandleX < 0 || lastCandleX > (pc.w || 0) + spacing * 5) {
                        pc._chartViewRestored = false;
                        if (typeof pc.fitToView === 'function') pc.fitToView();
                    }
                }
                if (typeof pc.render === 'function') pc.render();
            });
        });
    }
    
    /**
     * Create resize handles between panels (percentage-based)
     */
    createResizeHandles() {
        this.resizeHandles.forEach(h => { if (h && h.parentNode) h.parentNode.removeChild(h); });
        this.resizeHandles = [];

        if (this.panels.length < 2) return;

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
            handle.style.cssText = `left:${xPct}%;top:${yPct}%;height:${sizePct}%;`;
        } else {
            handle.style.cssText = `left:${xPct}%;top:${yPct}%;width:${sizePct}%;`;
        }

        handle._resizeMeta = meta;
        handle._resizeType = type;

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

        handle.classList.add('dragging');
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
        this._updateSelectionOverlay();

        // Throttled canvas resize (~20fps) — panels clip via CSS overflow:hidden
        const now = performance.now();
        if (!this._lastLiveResize || now - this._lastLiveResize > 50) {
            this._lastLiveResize = now;
            panelSnapshots.forEach(snap => {
                if (!snap) return;
                const panel = this.panels[snap.idx];
                if (!panel || !panel.chartInstance) return;
                const ci = panel.chartInstance;
                if (ci._lastResizeDpr !== undefined) ci._lastResizeDpr = 0;
                if (typeof ci.resize === 'function') ci.resize();
                if (typeof ci.render === 'function') ci.render();
            });
        }
    }

    _endPercentResize() {
        if (!this.isResizing) return;
        this.isResizing = false;

        if (this._resizeRAF) { cancelAnimationFrame(this._resizeRAF); this._resizeRAF = null; }
        if (this._resizeOverlay) { this._resizeOverlay.remove(); this._resizeOverlay = null; }
        if (this.resizeHandle) this.resizeHandle.classList.remove('dragging');

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

        setTimeout(() => { this.createResizeHandles(); this._updateSelectionOverlay(); }, 30);
        this._savePanelSizes();
    }

    _savePanelSizes() {
        try {
            const sizes = this.panels.map(panel => {
                if (!panel.element) return null;
                return { left: panel.element.style.left, top: panel.element.style.top, width: panel.element.style.width, height: panel.element.style.height };
            });
            userStorage.setItem('chart_panel_sizes_' + this.currentLayout, JSON.stringify(sizes));
        } catch (e) { /* ignore */ }
    }

    _loadPanelSizes() {
        try {
            const saved = userStorage.getItem('chart_panel_sizes_' + this.currentLayout);
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
        try { userStorage.removeItem('chart_panel_sizes_' + this.currentLayout); } catch (e) { /* ignore */ }
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