/**
 * TileManager — LRU cache for binary tiles with prefetch support.
 * Each tile = 50,000 candles, 48 bytes each (6×float64 little-endian: t,o,h,l,c,v).
 * Tiles have Cache-Control: immutable so nginx/browser cache them automatically.
 */
class TileManager {
    constructor(apiBase, maxTiles = 100) {
        this.apiBase = apiBase;
        this.maxTiles = maxTiles;
        this._metaCache  = new Map();   // `${fileId}/${tf}` → meta
        this._tileCache  = new Map();   // `${fileId}/${tf}/${idx}` → candles[]
        this._order      = [];           // LRU order (oldest first)
        this._inflight   = new Map();   // key → Promise (dedup concurrent fetches)
        this._prefetchQ  = new Set();   // keys already scheduled for prefetch
    }

    async getMeta(fileId, tf) {
        const key = `${fileId}/${tf}`;
        if (this._metaCache.has(key)) return this._metaCache.get(key);
        try {
            const r = await fetch(`${this.apiBase}/file/${fileId}/tile-meta/${tf}`);
            if (!r.ok) return null;
            const meta = await r.json();
            this._metaCache.set(key, meta);
            return meta;
        } catch (e) {
            return null;
        }
    }

    async getTile(fileId, tf, tileIdx) {
        const key = `${fileId}/${tf}/${tileIdx}`;
        if (this._tileCache.has(key)) {
            this._lruTouch(key);
            return this._tileCache.get(key);
        }
        if (this._inflight.has(key)) return this._inflight.get(key);

        const promise = (async () => {
            try {
                const r = await fetch(`${this.apiBase}/file/${fileId}/tile/${tf}/${tileIdx}`);
                if (!r.ok) return [];
                const buf = await r.arrayBuffer();
                const candles = this._decodeBinary(buf);
                this._tileCache.set(key, candles);
                this._order.push(key);
                this._evictIfNeeded();
                return candles;
            } catch (e) {
                return [];
            } finally {
                this._inflight.delete(key);
                this._prefetchQ.delete(key);
            }
        })();

        this._inflight.set(key, promise);
        return promise;
    }

    prefetch(fileId, tf, tileIdxArray) {
        for (const idx of tileIdxArray) {
            const key = `${fileId}/${tf}/${idx}`;
            if (!this._tileCache.has(key) && !this._inflight.has(key) && !this._prefetchQ.has(key)) {
                this._prefetchQ.add(key);
                this.getTile(fileId, tf, idx);
            }
        }
    }

    invalidate(fileId) {
        const prefix = `${fileId}/`;
        for (const k of [...this._tileCache.keys()]) {
            if (k.startsWith(prefix)) this._tileCache.delete(k);
        }
        for (const k of [...this._metaCache.keys()]) {
            if (k.startsWith(prefix)) this._metaCache.delete(k);
        }
        this._order = this._order.filter(k => !k.startsWith(prefix));
    }

    _decodeBinary(buf) {
        const CANDLE_SIZE = 48;
        const count = Math.floor(buf.byteLength / CANDLE_SIZE);
        const view  = new DataView(buf);
        const out   = new Array(count);
        for (let i = 0; i < count; i++) {
            const off = i * CANDLE_SIZE;
            out[i] = {
                t: view.getFloat64(off,      true) | 0,
                o: view.getFloat64(off +  8, true),
                h: view.getFloat64(off + 16, true),
                l: view.getFloat64(off + 24, true),
                c: view.getFloat64(off + 32, true),
                v: view.getFloat64(off + 40, true),
            };
        }
        return out;
    }

    _lruTouch(key) {
        const i = this._order.indexOf(key);
        if (i > -1) this._order.splice(i, 1);
        this._order.push(key);
    }

    _evictIfNeeded() {
        while (this._tileCache.size > this.maxTiles && this._order.length > 0) {
            const oldest = this._order.shift();
            this._tileCache.delete(oldest);
        }
    }
}

class Chart {
    constructor(canvasElement = null, svgElement = null) {
        // Support both main chart and panel instances
        if (canvasElement) {
            this.canvas = canvasElement;
            this.isPanel = true;
        } else {
            this.canvas = document.getElementById('chartCanvas');
            this.isPanel = false;
        }
        
        if (!this.canvas) {
            console.error('❌ Canvas element not found!');
            throw new Error('Canvas element not found. Make sure the HTML is loaded.');
        }
        this.ctx = this.canvas.getContext('2d');
        
        if (svgElement) {
            this.svg = d3.select(svgElement);
        } else {
            this.svg = d3.select('#drawingSvg');
        }
        
        if (this.svg.empty()) {
            console.error('❌ SVG element not found!');
            throw new Error('SVG element not found. Make sure the HTML is loaded.');
        }
        
        // Ensure SVG is properly positioned
        // pointer-events should be 'none' by default to allow canvas interaction
        this.svg
            .style('position', 'absolute')
            .style('top', '0')
            .style('left', '0')
            .style('z-index', '2') // Above canvas but below UI elements
            .style('pointer-events', 'none'); // Allow clicks to pass through to canvas
        
        // Create context menu with unique ID for panels
        const menuId = this.isPanel ? `panel-context-menu-${Date.now()}` : 'main-context-menu';
        this.contextMenu = d3.select('body')
            .append('div')
            .attr('class', 'chart-context-menu')
            .attr('id', menuId)
            .style('position', 'fixed')  // Use fixed positioning for better panel support
            .style('visibility', 'hidden')
            .style('background', 'rgba(5, 0, 40, 0.97)')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '4px')
            .style('padding', '8px 0')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '10000')  // Higher z-index for panels
            .style('min-width', '160px');
        this.rawData = []; // Store raw data - will be populated from CSV
        this.data = []; // Working data (resampled based on timeframe)
        this.dataVersion = 0; // Increment whenever data changes (used for caching)
        this.candleWidth = 8;
        this.offsetX = 0;
        this.priceZoom = 1;
        this.priceOffset = 0;
        this.timeZoom = 1;
        this.autoScale = true;
        // Base price range used in manual mode so Y-axis stays independent of visible candles
        this.manualCenterPrice = null;
        this.manualRange = null;
        this.tool = null;
        this.drawings = [];
        this.syncDrawings = true; // Enable drawing sync across panels
        this.syncCrosshair = true; // Enable crosshair sync across panels
        this.currentCrosshairTimestamp = null; // Track crosshair timestamp for sync
        this.xScale = null;
        this.yScale = null;
        this.volumeScale = null;
        this.xBandScale = null;
        this.margin = {t: 5, r: 60, b: 30, l: 0}; // Left margin 0 for full width (sidebar overlays)
        this.volumeHeight = 0.15;
        this.selectedDrawing = null;
        this.isLoading = false;
        this.hoveredCandle = null;
        this.tooltipDiv = null;
        this.hoveredPrice = null;
        this.priceHoverThrottle = null;
        this.isZooming = false;
        this.magnetMode = 'off'; // Magnet mode for snapping to OHLC
        this.currentTimeframe = '1m'; // Track current timeframe

        this.activeTradingSessionId = null;
        this._sessionStateLoadedFor = null;
        this._pendingSessionStatePatch = null;
        this._sessionStateSaveTimer = null;

        // ═══════════════════════════════════════════════════════════════════
        // STEP 1 — TradingView State Definition
        // ═══════════════════════════════════════════════════════════════════
        
        // Time scale state
        this.timeScale = {
            start: 0,                    // First visible data index
            end: 0,                      // Last visible data index
            rightOffset: 50,             // Right margin in pixels (future space)
            rightOffsetCandles: 5,       // Candles worth of right padding
            locked: false,               // When true, horizontal zoom is disabled (toggle via double-click)
            lastLockTime: 0              // Timestamp of last lock to prevent immediate unlock
        };
        
        // Price scale state
        this.priceScale = {
            min: 0,
            max: 0,
            mode: 'linear',              // 'linear' or 'log'
            autoScale: true,
            tickSize: 0.01,              // Will be calculated from data
            padding: 0.05,               // 5% padding top/bottom
            locked: false,               // When true, vertical pan is disabled (toggle via double-click)
            lastLockTime: 0              // Timestamp of last lock to prevent immediate unlock
        };
        
        // Zoom level with quantized candle widths (Fibonacci-like)
        this.zoomLevel = {
            candleWidthIndex: 4,         // Index into allowedWidths (default = 8)
            allowedWidths: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
        };
        
        // Cursor tracking state
        this.cursor = {
            x: 0,
            y: 0,
            mode: 'chart',               // 'chart', 'priceAxis', 'timeAxis'
            dataIndex: 0,
            price: 0
        };
        
        // Drag/Pan state
        this.drag = {
            active: false,
            type: null,                  // 'pan', 'priceAxis', 'timeAxis', 'boxZoom'
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            startOffsetX: 0,
            startPriceOffset: 0,
            shiftKey: false,
            ctrlKey: false
        };
        
        // Box zoom state
        this.boxZoom = {
            active: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0
        };
        
        // Inertia/momentum state for smooth pan
        this.inertia = {
            active: false,
            velocityX: 0,
            velocityY: 0,
            friction: 0.92,              // Decay factor
            minVelocity: 0.5,            // Stop threshold
            lastTime: 0
        };
        
        // Rubber band state for boundary resistance
        this.rubberBand = {
            active: false,
            overshootX: 0,
            elasticity: 0.3,             // Resistance factor
            snapBackSpeed: 0.15          // Snap back animation speed
        };
        
        // Legacy movement settings (kept for compatibility)
        this.movement = {
            isDragging: false,
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            sensitivity: 1.0,
            velocityX: 0,
            velocityY: 0,
            lastTime: 0,
            friction: 0.92
        };

        // Enhanced zoom animation settings
        this.zoomAnimation = {
            targetCandleWidth: this.candleWidth,
            targetPriceZoom: this.priceZoom,
            targetOffsetX: this.offsetX,
            targetPriceOffset: this.priceOffset,
            smoothFactor: 0.15,
            active: false,
            zoomPoint: { x: 0, y: 0 },
            startTime: 0,
            duration: 300
        };
        
        // Backend API configuration
        this.apiUrl = window.CHART_API_URL || '/api';
        this.tileManager = new TileManager(this.apiUrl, 150);
        this.currentFileId = null;
        this.currentSymbol = null; // Store detected symbol from CSV
        this._RAW_DATA_CAP = 300_000; // ring buffer: max candles in memory
        
        // Performance optimizations for large datasets
        this.totalCandles = 0; // Total number of candles in dataset
        this.loadedRanges = new Map(); // Cache loaded data ranges
        this.chunkSize = 5000; // Load data in chunks
        this.bufferSize = 1000; // Buffer size for smooth scrolling
        this.isLoadingChunk = false;
        this.renderPending = false;
        this.renderThrottleTimer = null;
        
        // Performance metrics
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateInterval = 500; // Update FPS every 500ms
	        this.lastFpsUpdate = performance.now();
        
        // Removed duplicate inertia variables (now in this.movement)

        // Smooth zooming
        this.targetCandleWidth = this.candleWidth;
        this.targetPriceZoom = this.priceZoom;
        this.zoomEasingFactor = 0.2;
        
        // Drawing tool default settings - saved per tool type
        this.toolDefaults = {
            trendline: { color: '#2962ff', lineWidth: 2, opacity: 1 },
            horizontal: { color: '#2962ff', lineWidth: 2, opacity: 1 },
            vertical: { color: '#2962ff', lineWidth: 2, opacity: 1 },
            rectangle: { color: '#2962ff', lineWidth: 2, opacity: 1, fillColor: 'rgba(41, 98, 255, 0.1)', fillOpacity: 0.1 },
            fibonacci: { color: '#2962ff', lineWidth: 2, opacity: 1, fillColor: 'rgba(41, 98, 255, 0.1)', fillOpacity: 0.1 },
            text: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
            arrowUp: { color: '#2962ff', lineWidth: 3, size: 20 },
            arrowDown: { color: '#d32f2f', lineWidth: 3, size: 20 },
            channel: { color: '#2962ff', lineWidth: 2, opacity: 1 }
        };
        
        // Load saved tool defaults from localStorage
        this.loadToolDefaults();
        
        // Chart appearance settings - TradingView professional colors
        this.chartSettings = {
            // Chart Type
            chartType: 'candles', // 'candles', 'hollow', 'heikinashi', 'bars', 'line', 'area', 'baseline'
            
            // Background - Dark theme as default
            backgroundColor: '#050028',
            backgroundStyle: 'Solid', // 'Solid' or 'Gradient'
            
            // Grid
            gridColor: 'rgba(42, 46, 57, 0.6)',
            gridStyle: 'Vert and horz', // 'Vert and horz', 'Vertical', 'Horizontal', 'None'
            showGrid: true,
            gridPattern: 'solid',
            
            // Session breaks
            showSessionBreaks: false,
            sessionBreaksColor: '#5b9cf6',
            sessionBreaksPattern: 'solid',
            
            // Crosshair
            crosshairColor: 'rgba(120, 123, 134, 0.4)',
            crosshairPattern: 'dashed',
            showCrosshair: true,
            crosshairLocked: false,
            
            // Watermark
            showWatermark: false,
            watermarkColor: 'rgba(120, 123, 134, 0.1)',
            watermarkPattern: 'solid',
            
            // Scales
            scaleTextColor: '#ffffff',
            scaleTextSize: 12,
            scaleLinesColor: '#2a2e39',
            scaleLinePattern: 'solid',
            
            // Cursor (crosshair labels)
            cursorLabelTextColor: '#d1d4dc',
            cursorLabelBgColor: '#434651',
            
            // Candle colors - separate for body, border, and wick
            candleUpColor: '#089981',      // Legacy - still used as default
            candleDownColor: '#f23645',    // Legacy - still used as default
            bodyUpColor: '#089981',        // Body fill/outline for up candles
            bodyDownColor: '#f23645',      // Body fill for down candles
            borderUpColor: '#089981',      // Border for up candles
            borderDownColor: '#f23645',    // Border for down candles
            wickUpColor: '#089981',        // Wick for up candles
            wickDownColor: '#f23645',      // Wick for down candles
            showCandleBody: true,
            showCandleBorders: true,
            showCandleWick: true,
            colorBasedOnPreviousClose: false,
            
            // Volume
            volumeUpColor: 'rgba(8, 153, 129, 0.5)',
            volumeDownColor: 'rgba(242, 54, 69, 0.5)',
            showVolume: false, // Volume is now controlled as an indicator
            
            // Symbol settings
            symbolTitle: true,
            symbolTitleFormat: 'Description',
            symbolTextColor: '#d1d4dc',  // Symbol name and OHLC labels color (light for dark mode default)
            showChartValues: true,
            showBarChangeValues: true,
            
            // Indicator settings
            showIndicatorTitles: true,
            showIndicatorArguments: true,
            showIndicatorValues: true,
            showIndicatorBackground: true,
            indicatorBackgroundOpacity: 50,
            
            // Data modification
            sessionType: 'Extended trading hours',
            precision: 'Default',
            timezone: '(UTC-5) Toronto',
            
            // Price scale settings
            scaleModes: 'Visible on mouse over',
            lockPriceToBarRatio: false,
            priceToBarRatioValue: '1.2148145',
            scalesPlacement: 'Auto',
            
            // Price labels & lines
            noOverlappingLabels: true,
            showPlusButton: true,
            showCountdownToBarClose: false,
            symbolLabelDisplay: 'Value, line',
            symbolLabelValue: 'Value according to scale',
            symbolColor: '#009688',
            prevDayCloseDisplay: 'Hidden',
            prevDayColor: '#888888',
            indicatorsDisplay: 'Value',
            
            // Button visibility
            navigationButtonsVisibility: 'Visible on mouse over',
            paneButtonsVisibility: 'Visible on mouse over',
            
            showMarks: false
        };

        this._defaultChartSettings = JSON.parse(JSON.stringify(this.chartSettings));
	        
	        this.init();
	        this.animate(); // Start the animation loop
	    }
	
	    init() {
        console.log(`📊 Chart init() started (${this.isPanel ? 'Panel' : 'Main'})`);
        console.log('Canvas:', this.canvas);
        console.log('Canvas dimensions:', this.canvas.offsetWidth, 'x', this.canvas.offsetHeight);
        
        this.resize();
        console.log('✓ Resized - Canvas:', this.w, 'x', this.h);
        
        this.setupEvents();
        console.log('✓ Events setup');
        
        // Only setup UI controls for main chart
        if (!this.isPanel) {
            this.createTooltip();
            console.log('✓ Tooltip created');
            
            this.setupChartSettingsMenu();
            console.log('✓ Chart settings menu setup');
            
            this.setupCSVLoader();
            console.log('✓ CSV loader setup');
            
            this.setupFileSelector();
            console.log('✓ File selector setup');
            
            this.setupKeyboardShortcuts();
            console.log('✓ Keyboard shortcuts setup');
            
            this.setupDateSearch();
            console.log('✓ Date search setup');
            
            this.setupTimeframeButtons();
            console.log('✓ Timeframe buttons setup');
            
            this.setupOHLCCollapse();
            console.log('✓ OHLC collapse setup');
            
            this.setupChartClickToCloseMenus();
            console.log('✓ Chart click to close menus setup');
            
            // Initialize OHLC panel with default values
            this.updateChartOHLCSymbol('CHART');
            
            this.loadAvailableFiles();
            console.log('✓ Loading available files...');
            
            // Load saved drawings from localStorage
            this.loadDrawingsFromStorage();
            
            window.addEventListener('resize', () => this.resize());
        } else {
            // For panels, still setup canvas right-click context menu
            this.canvas.addEventListener('contextmenu', (e) => {
                // Only show context menu if not on a drawing
                if (!this.tool && !this.findDrawingAtPoint(e.offsetX, e.offsetY)) {
                    e.preventDefault();
                    this.showChartContextMenu(e.clientX, e.clientY, e.offsetX, e.offsetY);
                }
            });
        }
        
        // Initialize Drawing Tools Manager
        if (!this.isPanel) {
            // Main chart gets its own managers
            this.initDrawingTools();
            console.log('✓ Drawing Tools Manager initialized');
            
            // Initialize Replay System (only for main chart)
            this.initReplaySystem();
            console.log('✓ Replay System initialized');
        } else {
            // Panels get their own drawing manager but share replay/order systems
            this.initDrawingTools();
            console.log('✓ Panel Drawing Tools Manager initialized');
            
            // Panels will reference the main chart's replay and order systems
            console.log('✓ Panel chart - will use main chart replay/order systems');
        }
        
        // Initialize Indicators system
        if (typeof this.initIndicators === 'function') {
            this.initIndicators();
        }
        
        // Initialize Compare Overlay (only for main chart)
        if (!this.isPanel && typeof CompareOverlay !== 'undefined') {
            try {
                this.compareOverlay = new CompareOverlay(this);
                console.log('✓ Compare Overlay initialized');
            } catch (e) {
                console.error('Failed to initialize CompareOverlay:', e);
            }
        }
        
        this.fitToView(); // Position chart to show latest data on right
        this.render();
        console.log('✓ Initial render complete');
        
        // Force a re-render after a short delay to ensure chart is visible after page reload
        // Also re-measure canvas dimensions after page layout completes to fix squished/broken appearance
        setTimeout(() => {
            this.resize(); // Re-measure canvas after layout completes
            this.fitToView();
            this.render();
            console.log('✓ Delayed re-render complete (ensures visibility and correct dimensions)');
        }, 100);
        
        // Listen for timezone changes (only for main chart)
        if (!this.isPanel && window.timezoneManager) {
            window.timezoneManager.addListener(() => {
                console.log('🌍 Timezone changed, re-rendering chart');
                this.scheduleRender();
            });
        }
        
        // Check for backtesting mode from URL (only for main chart)
        if (!this.isPanel) {
            this.checkBacktestingMode();
        }
    }
    
    /**
     * Check if chart is loaded in backtesting mode and auto-start
     */
    async checkBacktestingMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        
        if (mode === 'backtest' || mode === 'propfirm') {
            const isPropFirm = mode === 'propfirm';
            console.log(`🎯 ${isPropFirm ? 'Prop Firm' : 'Backtesting'} mode detected from URL`);
            console.log('🔗 URL params:', window.location.search);
            
            // Show loading screen
            const loader = document.getElementById('backtestingLoader');
            if (loader) {
                loader.classList.add('active');
                this.updateLoaderProgress(0, 'Loading session data...');
            }
            
            const sessionId = urlParams.get('sessionId');

            let session = null;
            if (sessionId) {
                try {
                    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { credentials: 'include' });
                    if (res.ok) {
                        const payload = await res.json();
                        if (payload && payload.session && payload.session.config) {
                            session = payload.session.config;
                            try {
                                localStorage.setItem('backtestingSession', JSON.stringify(session));
                                localStorage.setItem('active_trading_session_id', String(sessionId));
                            } catch (e) {}
                            this.activeTradingSessionId = sessionId ? String(sessionId) : null;
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to load session from API, falling back to localStorage', e);
                }
            }

            // Load session data from localStorage (fallback)
            if (!session) {
                const sessionData = localStorage.getItem('backtestingSession');
                if (sessionData) {
                    session = JSON.parse(sessionData);
                }
            }

            if (session) {
                console.log(`📋 Loading ${isPropFirm ? 'prop firm' : 'backtesting'} session:`, session);
                
                // Store session data in chart
                this.backtestingSession = session;
                this.isPropFirmMode = isPropFirm;

                if (!this.activeTradingSessionId) {
                    try {
                        this.activeTradingSessionId = localStorage.getItem('active_trading_session_id');
                    } catch (e) {
                        this.activeTradingSessionId = null;
                    }
                }
                
                // Update loader
                this.updateLoaderProgress(10, 'Session loaded');
                this.updateLoaderStep(1, 'active');
                
                // Load data directly (no file selector needed in backtesting mode)
                console.log('⏳ Loading file data...');
                setTimeout(() => {
                    this.autoLoadBacktestingData(session);
                }, 500);
            } else {
                console.warn('⚠️ No backtesting session data found in localStorage');
                alert('Backtesting session not found. Redirecting to setup...');
                window.location.href = isPropFirm ? 'propfirm-backtest.html' : 'backtesting.html';
            }
        }
    }
    
    updateLoaderProgress(percent, message) {
        const progressBar = document.getElementById('loaderProgress');
        const subtitle = document.querySelector('.loader-subtitle');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        
        if (subtitle && message) {
            subtitle.textContent = message;
        }
    }
    
    updateLoaderStep(stepNumber, status) {
        const step = document.getElementById(`step${stepNumber}`);
        if (!step) return;
        
        const icon = step.querySelector('.loader-step-icon');
        
        if (status === 'active') {
            step.classList.add('active');
            step.classList.remove('completed');
            if (icon) icon.textContent = '🔄';
        } else if (status === 'completed') {
            step.classList.remove('active');
            step.classList.add('completed');
            if (icon) icon.textContent = '✅';
        }
    }
    
    hideLoader() {
        const loader = document.getElementById('backtestingLoader');
        if (loader) {
            setTimeout(() => {
                loader.classList.remove('active');
            }, 500);
        }
    }
    
    /**
     * Auto-load data and start replay for backtesting session
     */
    async autoLoadBacktestingData(session) {
        if (this.backtestingStarted) {
            console.log('⚠️ Backtesting already started, skipping...');
            return;
        }
        
        this.backtestingStarted = true;
        
        const urlParams = new URLSearchParams(window.location.search);
        const fileId = urlParams.get('fileId') || session.fileId;
        
        if (!fileId) {
            console.error('❌ No file ID provided');
            alert('No file specified for backtesting session.');
            this.backtestingStarted = false;
            return;
        }
        
        try {
            const displayTf = this.currentTimeframe || '1m';
            const replayRawTf = '1m';
            this.updateLoaderProgress(30, 'Loading chart data...');
            this.updateLoaderStep(1, 'completed');

            const result = await this._fetchSmartWindow(fileId, replayRawTf, session);
            
            if (!result || !result.data) {
                throw new Error('No data in response');
            }
            
            this.totalCandles = result.total;
            this._serverCursors = {
                firstTs: result.first_cursor,
                lastTs: result.last_cursor,
                hasMoreLeft: result.has_more_left,
                hasMoreRight: result.has_more_right
            };
            this._panLoading = false;
            
            this.loadedRanges.clear();
            this.parseCSVChunk(result.data, 0);
            this.loadedRanges.set(0, result.returned);
            this.currentFileId = fileId;
            
            console.log(`✅ Loaded ${this.rawData.length}/${result.total} raw candles at ${replayRawTf} (display: ${displayTf})`);
            this.updateLoaderProgress(70, 'Preparing chart...');
            
            if (session.fileName) {
                this.currentSymbol = session.fileName.replace('.csv', '').toUpperCase();
            } else if (session.symbol) {
                this.currentSymbol = session.symbol;
            } else if (session.symbols && session.symbols.length > 0) {
                this.currentSymbol = session.symbols[0].symbolName || 'UNKNOWN';
            } else {
                this.currentSymbol = `FILE_${fileId}`;
            }
            
            this.updateChartTitle(this.currentSymbol);
            this.updateDateRange();
            
            this.updateLoaderProgress(80, 'Calculating indicators...');
            this.updateLoaderStep(2, 'active');
            
            if (typeof this.recalculateIndicators === 'function') {
                this.recalculateIndicators();
            }
            
            this.updateLoaderStep(2, 'completed');
            this.updateLoaderProgress(90, 'Rendering chart...');
            
            this.fitToView();
            this.render();
            
            requestAnimationFrame(() => {
                this.render();
                this.updateLoaderProgress(95, 'Starting replay mode...');
                this.updateLoaderStep(3, 'active');
                setTimeout(() => {
                    this.startBacktestingReplay(session);
                }, 200);
            });
            
        } catch (error) {
            console.error('❌ Failed to load file data:', error);
            alert('Failed to load backtesting data: ' + error.message);
            this.backtestingStarted = false;
            this.hideLoader();
        }
    }
    
    /**
     * Fetch a window of candles from /smart endpoint.
     * Returns last N candles at the requested timeframe.
     */
    async _fetchSmartWindow(fileId, timeframe, session, anchor) {
        // In backtest mode, load from the START of the session range
        // so replay begins at the right place. Pan-loading fills the rest.
        const isBacktest = session && session.startDate;
        if (!anchor) anchor = isBacktest ? 'start' : 'end';

        // In backtest mode, load more data upfront so replay has a larger buffer
        const limit = isBacktest ? '50000' : '5000';
        const params = new URLSearchParams({
            timeframe: timeframe,
            limit: limit,
            anchor: anchor
        });

        if (session && session.startDate) {
            const ts = new Date(session.startDate).getTime();
            if (!isNaN(ts)) params.set('start_ts', String(ts));
        }
        if (session && session.endDate) {
            const ts = new Date(session.endDate).getTime();
            if (!isNaN(ts)) params.set('end_ts', String(ts));
        }

        const response = await fetch(`${this.apiUrl}/file/${fileId}/smart?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }
    
    /**
     * Switch to a different file/symbol without page reload
     */
    async loadFileData(fileId) {
        console.log(`🔄 Switching to file: ${fileId}`);
        
        try {
            const symbolDisplay = document.getElementById('symbolDisplay');
            if (symbolDisplay) symbolDisplay.textContent = 'Loading...';
            
            const session = this.backtestingSession || JSON.parse(localStorage.getItem('backtestingSession') || '{}');
            const isBacktestSession = !!(session && session.startDate);
            const requestTimeframe = isBacktestSession ? '1m' : (this.currentTimeframe || '1m');
            const result = await this._fetchSmartWindow(fileId, requestTimeframe, session);
            
            if (!result || !result.data) throw new Error('No data in response');
            
            this.rawData = [];
            this.data = [];
            this.totalCandles = result.total;
            this._serverCursors = {
                firstTs: result.first_cursor,
                lastTs: result.last_cursor,
                hasMoreLeft: result.has_more_left,
                hasMoreRight: result.has_more_right
            };
            this._panLoading = false;
            this.loadedRanges.clear();
            
            this.parseCSVChunk(result.data, 0);
            this.loadedRanges.set(0, result.returned);
            
            this.currentFileId = fileId;
            
            if (session.fileName) {
                this.currentSymbol = session.fileName.replace(/\.(csv|CSV)$/, '').toUpperCase();
            }
            
            this.updateChartTitle(this.currentSymbol);
            if (symbolDisplay) symbolDisplay.textContent = this.currentSymbol.substring(0, 15);
            
            if (typeof this.recalculateIndicators === 'function') {
                this.recalculateIndicators();
            }
            
            this.fitToView();
            this.render();
            
            if (window.replaySystem) {
                window.replaySystem.fullRawData = [...this.rawData];
                window.replaySystem.rawTimeframe = requestTimeframe;
                window.replaySystem.updateChartData();
            }
            
            console.log(`✅ Switched to ${this.currentSymbol} with ${this.rawData.length}/${result.total} candles at ${requestTimeframe}`);
            
        } catch (error) {
            console.error('❌ Failed to switch symbol:', error);
            alert('Failed to load symbol: ' + error.message);
        }
    }
    
    /**
     * Start replay mode for backtesting with date filtering
     */
    startBacktestingReplay(session) {
        if (!this.rawData || this.rawData.length === 0) {
            console.warn('⚠️ No data loaded yet');
            return;
        }
        
        console.log('🎬 Starting backtesting replay mode...');
        console.log('📋 Session:', session.sessionName);
        console.log('📁 File:', session.fileName);
        
        const startTime = new Date(session.startDate).getTime();
        const endTime = new Date(session.endDate).getTime();
        
        console.log(`📅 Session range: ${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`);
        console.log(`📊 Data loaded: ${this.rawData.length} candles`);
        if (this.rawData.length > 0) {
            console.log(`📅 Data range: ${new Date(this.rawData[0].t).toLocaleString()} to ${new Date(this.rawData[this.rawData.length - 1].t).toLocaleString()}`);
        }
        
        // Server already filtered data to session date range via start_ts/end_ts.
        // Do NOT slice rawData here — that would break pan-loading which needs
        // to append/prepend candles as the user scrolls through the full range.
        // Just use the data as-is and let pan-loading fill in more as needed.
        this.data = this.resampleData(this.rawData, this.currentTimeframe || '1m');
        console.log(`📊 Using ${this.data.length} candles for ${this.currentTimeframe} timeframe (source: 1m raw)`);
        
        // Recalculate indicators
        if (typeof this.recalculateIndicators === 'function') {
            this.recalculateIndicators();
            console.log('📈 Indicators recalculated');
        }
        
        // Fit to view and render
        this.fitToView();
        this.render();
        console.log('🎨 Chart rendered');
        
        // Auto-enter replay mode with first candle
        if (this.replaySystem) {
            console.log('⏳ Entering replay mode in 1 second...');
            setTimeout(() => {
                console.log('🎮 Starting replay system...');
                this.replaySystem.enterReplayMode();

                this.loadTradingSessionStateIfNeeded();
                
                // Complete loader and hide it
                this.updateLoaderProgress(100, 'Replay mode active!');
                this.updateLoaderStep(3, 'completed');
                
                setTimeout(() => {
                    this.hideLoader();
                }, 800);
                
                console.log('✅ Backtesting session started!');
                console.log(`💰 Starting balance: $${session.startBalance}`);
                console.log('🎯 Use the replay controls to navigate through time');
            }, 1000);
        } else {
            console.error('❌ Replay system not available!');
            alert('Replay system not loaded. Please refresh the page.');
            this.hideLoader();
        }
    }

    getActiveTradingSessionId() {
        if (this.activeTradingSessionId) return String(this.activeTradingSessionId);
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const fromUrl = urlParams.get('sessionId');
            if (fromUrl) return String(fromUrl);
        } catch (e) {}
        try {
            const fromStorage = localStorage.getItem('active_trading_session_id');
            if (fromStorage) return String(fromStorage);
        } catch (e) {}
        return null;
    }

    async loadTradingSessionStateIfNeeded() {
        const sessionId = this.getActiveTradingSessionId();
        if (!sessionId) return;
        if (this._sessionStateLoadedFor === String(sessionId)) return;

        try {
            const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, { credentials: 'include' });
            if (!res.ok) return;
            const payload = await res.json();
            const state = payload && payload.state ? payload.state : null;
            if (!state) return;

            this._sessionStateLoadedFor = String(sessionId);

            if (this.drawingManager && Array.isArray(state.drawings) && typeof this.drawingManager.loadDrawingsFromData === 'function') {
                this.drawingManager.loadDrawingsFromData(state.drawings);
            }

            if (this.orderManager && Array.isArray(state.journal)) {
                this.orderManager.tradeJournal = state.journal;
                if (typeof this.orderManager.updateJournalTab === 'function') {
                    this.orderManager.updateJournalTab();
                }
            }

            if (state.replay && typeof state.replay === 'object') {
                this._pendingReplayState = state.replay;
                if (this.replaySystem && this.replaySystem.isActive && typeof this.replaySystem.applyPersistedState === 'function') {
                    this.replaySystem.applyPersistedState(state.replay);
                    this._pendingReplayState = null;
                }
            }

            // Restore chart view (pan/zoom position)
            if (state.chartView && typeof state.chartView === 'object') {
                const v = state.chartView;
                if (typeof v.offsetX === 'number')       this.offsetX = v.offsetX;
                if (typeof v.candleWidth === 'number')   this.candleWidth = v.candleWidth;
                if (typeof v.priceOffset === 'number')   this.priceOffset = v.priceOffset;
                if (typeof v.priceZoom === 'number')     this.priceZoom = v.priceZoom;
                if (typeof v.autoScale === 'boolean')    this.autoScale = v.autoScale;
                if (typeof v.candleWidthIndex === 'number' && this.zoomLevel) {
                    this.zoomLevel.candleWidthIndex = v.candleWidthIndex;
                }
                if (v.timeframe && v.timeframe !== this.currentTimeframe) {
                    this.currentTimeframe = v.timeframe;
                    // Update TimeframeFavorites UI to sync button display
                    if (window.timeframeFavorites && typeof window.timeframeFavorites.selectTimeframe === 'function') {
                        window.timeframeFavorites.selectTimeframe(v.timeframe);
                    }
                    // Fallback: update timeframe button UI directly
                    document.querySelectorAll('.timeframe-btn, .sidebar-timeframe-btn, .sidebar-current-timeframe').forEach(b => {
                        b.classList.toggle('active', b.dataset.timeframe === v.timeframe);
                    });
                }
                // Set flag to prevent fitToView() from overriding the restored position
                this._chartViewRestored = true;
                this.scheduleRender();
                console.log('📍 Restored chart view from session state');
            }

            // Restore chart settings (colors, type, etc.)
            if (state.chartSettings && typeof state.chartSettings === 'object') {
                this.chartSettings = { ...this.chartSettings, ...state.chartSettings };
                if (typeof this.applyChartSettings === 'function') this.applyChartSettings();
                console.log('🎨 Restored chart settings from session state');
            }

            // Restore tool defaults (drawing colors/styles)
            if (state.toolDefaults && typeof state.toolDefaults === 'object') {
                Object.keys(state.toolDefaults).forEach(tool => {
                    if (this.toolDefaults[tool]) {
                        this.toolDefaults[tool] = { ...this.toolDefaults[tool], ...state.toolDefaults[tool] };
                    }
                });
                console.log('🖊️ Restored tool defaults from session state');
            }

            // Restore indicators
            if (Array.isArray(state.indicators) && state.indicators.length > 0) {
                this._pendingIndicatorsState = state.indicators;
                // Will be applied by persistIndicators restore logic once data is ready
                if (this.data && this.data.length > 0 && typeof this.addIndicator === 'function') {
                    this._applyPersistedIndicators();
                }
            }
        } catch (e) {
            console.warn('⚠️ Failed to load trading session state', e);
        }
    }

    _applyPersistedIndicators() {
        const list = this._pendingIndicatorsState;
        if (!Array.isArray(list) || list.length === 0) return;
        this._pendingIndicatorsState = null;
        // Clear current indicators silently before restoring
        if (this.indicators && Array.isArray(this.indicators.active)) {
            this.indicators.active = [];
            this.indicators.data = {};
        }
        list.forEach(snap => {
            if (!snap.type) return;
            try {
                const p = Object.assign({}, snap.params || {}, snap.style || {});
                const ind = this.addIndicator(snap.type, p);
                if (ind && snap.visible === false) ind.visible = false;
            } catch (e) {
                console.warn('⚠️ Could not restore indicator', snap.type, e);
            }
        });
        if (typeof this.render === 'function') this.render();
        console.log(`📈 Restored ${list.length} indicators from session state`);
    }

    scheduleSessionStateSave(patch) {
        const sessionId = this.getActiveTradingSessionId();
        if (!sessionId) return;
        if (this._sessionStateLoadedFor !== String(sessionId)) return;
        if (!patch || typeof patch !== 'object') return;

        this._pendingSessionStatePatch = Object.assign({}, this._pendingSessionStatePatch || {}, patch);

        if (this._sessionStateSaveTimer) return;

        this._sessionStateSaveTimer = setTimeout(() => {
            this._sessionStateSaveTimer = null;
            this.flushSessionStateSave();
        }, 800);
    }

    async flushSessionStateSave() {
        const sessionId = this.getActiveTradingSessionId();
        if (!sessionId) return;
        if (this._sessionStateLoadedFor !== String(sessionId)) return;
        const patch = this._pendingSessionStatePatch;
        if (!patch) return;
        this._pendingSessionStatePatch = null;

        try {
            await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                keepalive: true,
                body: JSON.stringify(patch)
            });
        } catch (e) {
            console.warn('⚠️ Failed to save trading session state', e);
        }
    }
    
    /**
     * Initialize Drawing Tools Manager
     */
    initDrawingTools() {
        try {
            this.drawingManager = new DrawingToolsManager(this);
            console.log('✅ Drawing Tools Manager created successfully');
            
            // Initialize Object Tree Manager
            if (typeof ObjectTreeManager !== 'undefined') {
                this.objectTreeManager = new ObjectTreeManager(this.drawingManager);
                
                // Store reference in drawing manager for callbacks
                this.drawingManager.objectTreeManager = this.objectTreeManager;
                
                console.log('✅ Object Tree Manager created successfully');
            }
            
            // Initialize Favorites Manager
            if (typeof FavoritesManager !== 'undefined') {
                this.favoritesManager = new FavoritesManager(this);
                
                // Store reference in drawing manager for syncing active state
                this.drawingManager.favoritesManager = this.favoritesManager;
                
                console.log('✅ Favorites Manager created successfully');
            }
        } catch (error) {
            console.error('❌ Failed to initialize Drawing Tools Manager:', error);
            console.log('Drawing tools will not be available');
        }
    }
    
    /**
     * Initialize Replay System
     */
    initReplaySystem() {
        try {
            if (typeof ReplaySystem !== 'undefined') {
                this.replaySystem = new ReplaySystem(this);
                console.log('✅ Replay System initialized successfully');
                
                // Initialize Order Manager for backtesting
                this.initOrderManager();

                setTimeout(() => {
                    this.loadTradingSessionStateIfNeeded();
                }, 0);

                if (!this._sessionStateUnloadHookInstalled) {
                    this._sessionStateUnloadHookInstalled = true;
                    window.addEventListener('pagehide', () => {
                        try {
                            this.flushSessionStateSave();
                        } catch (e) {}
                    });
                }
            }
        } catch (error) {
            console.error('❌ Failed to initialize Replay System:', error);
            console.log('Replay mode will not be available');
        }
    }
    
    /**
     * Initialize Order Manager for backtesting
     */
    initOrderManager() {
        try {
            if (typeof OrderManager !== 'undefined' && this.replaySystem) {
                this.orderManager = new OrderManager(this, this.replaySystem);
                console.log('✅ Order Manager initialized successfully');
            }
        } catch (error) {
            console.error('❌ Failed to initialize Order Manager:', error);
        }
    }
    
    createTooltip() {
        this.tooltipDiv = d3.select('body').append('div')
            .attr('class', 'chart-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('pointer-events', 'none');
    }
    
    setupChartSettingsMenu() {
        // Create full-screen settings modal
        this.settingsModal = d3.select('body').append('div')
            .attr('class', 'chart-settings-modal')
            .style('position', 'fixed')
            .style('top', '0')
            .style('left', '0')
            .style('width', '100%')
            .style('height', '100%')
            .style('background', 'rgba(0, 0, 0, 0.7)')
            .style('z-index', '9999')
            .style('display', 'none')
            .style('align-items', 'center')
            .style('justify-content', 'center');
        
        // Settings container
        const container = this.settingsModal.append('div')
            .attr('class', 'settings-container')
            .style('width', '90%')
            .style('max-width', '1000px')
            .style('height', '80vh')
            .style('background', '#ffffff')
            .style('border-radius', '12px')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('overflow', 'hidden')
            .style('box-shadow', '0 20px 60px rgba(0, 0, 0, 0.5)');
        
        // Header
        const header = container.append('div')
            .attr('class', 'settings-header')
            .style('padding', '20px 24px')
            .style('border-bottom', '1px solid #e8e8e8')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('background', '#ffffff');
        
        header.append('h2')
            .style('margin', '0')
            .style('font-size', '24px')
            .style('font-weight', '600')
            .style('color', '#131722')
            .text('Settings');
        
        const closeBtn = header.append('button')
            .attr('class', 'settings-close-btn')
            .style('background', 'none')
            .style('border', 'none')
            .style('font-size', '28px')
            .style('cursor', 'default')
            .style('color', '#131722')
            .style('padding', '0')
            .style('width', '32px')
            .style('height', '32px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('transition', 'all 0.2s ease')
            .html('✕')
            .on('click', () => this.hideSettingsMenu());
        
        closeBtn.on('mouseenter', function() {
            d3.select(this).style('background', '#f0f0f0').style('border-radius', '6px');
        }).on('mouseleave', function() {
            d3.select(this).style('background', 'none');
        });
        
        // Body
        const body = container.append('div')
            .attr('class', 'settings-body')
            .style('display', 'flex')
            .style('flex', '1')
            .style('overflow', 'hidden');
        
        // Sidebar
        this.settingsSidebar = body.append('div')
            .attr('class', 'settings-sidebar')
            .style('width', '280px')
            .style('background', '#f7f7f7')
            .style('border-right', '1px solid #e8e8e8')
            .style('overflow-y', 'auto');
        
        // Content area
        this.settingsContent = body.append('div')
            .attr('class', 'settings-content')
            .style('flex', '1')
            .style('padding', '24px')
            .style('overflow-y', 'auto')
            .style('background', '#ffffff');
        
        // Footer
        const footer = container.append('div')
            .attr('class', 'settings-footer')
            .style('padding', '16px 24px')
            .style('border-top', '1px solid #e8e8e8')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('background', '#ffffff');
        
        // Template dropdown with preview
        const templateWrapper = footer.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '12px');
        
        const templateSelect = templateWrapper.append('select')
            .attr('class', 'template-selector')
            .style('padding', '8px 32px 8px 12px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#ffffff')
            .style('font-size', '14px')
            .style('cursor', 'default')
            .html(this.getTemplateSelectorOptionsHtml());

        if (this._lastTemplateSelected) {
            templateSelect.property('value', this._lastTemplateSelected);
        }
        
        const chartInstance = this;
        
        // Template change - update preview and store for OK button
        templateSelect.on('change', () => {
            const templateName = templateSelect.property('value');
            if (templateName) {
                this._pendingTemplate = templateName;
                // Update the preview in Candles section if it exists
                if (this._updateThemePreview) {
                    const templates = this.getChartTemplates();
                    const template = templates[templateName];
                    if (template) {
                        this._updateThemePreview(template);
                    }
                }
            } else {
                this._pendingTemplate = null;
                // Reset preview to current settings
                if (this._updateThemePreview && this._themePreviewChartSettings) {
                    this._updateThemePreview(this._themePreviewChartSettings);
                }
            }
        });
        
        // Action buttons
        const actions = footer.append('div')
            .style('display', 'flex')
            .style('gap', '12px');
        
        actions.append('button')
            .attr('class', 'settings-btn-cancel')
            .style('padding', '10px 24px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#ffffff')
            .style('color', '#131722')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .style('cursor', 'default')
            .style('transition', 'all 0.2s ease')
            .text('Cancel')
            .on('click', () => this.hideSettingsMenu())
            .on('mouseenter', function() {
                d3.select(this).style('background', '#f0f0f0');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', '#ffffff');
            });
        
        actions.append('button')
            .attr('class', 'settings-btn-ok')
            .style('padding', '10px 24px')
            .style('border', 'none')
            .style('border-radius', '6px')
            .style('background', '#2962ff')
            .style('color', '#ffffff')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .style('cursor', 'default')
            .style('transition', 'all 0.2s ease')
            .text('Ok')
            .on('click', () => {
                // Apply pending template if one was selected
                if (this._pendingTemplate) {
                    this.applyTemplate(this._pendingTemplate);
                    this._pendingTemplate = null;
                }
                
                this.saveSettings();
                this.hideSettingsMenu();
                this.showNotification('Settings saved successfully! ✓');
                
                // Only sync to all panels if settings were opened from main chart
                // If opened from a panel, don't sync - already applied to that panel
                const sourceChart = this._settingsSourceChart || this;
                if (!sourceChart.isPanel && window.syncAllPanelSettings && typeof window.syncAllPanelSettings === 'function') {
                    setTimeout(() => {
                        window.syncAllPanelSettings();
                    }, 100);
                }
                
                // Clear the source chart reference
                this._settingsSourceChart = null;
            })
            .on('mouseenter', function() {
                d3.select(this).style('background', '#1e53e5');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', '#2962ff');
            });
        
        // Build sidebar navigation
        this.buildSettingsSidebar();
        
        // Show default category
        this.currentSettingsCategory = 'symbol';
        this.showSettingsCategory('symbol');
        
        // Load saved settings from localStorage
        this.loadSavedSettings();
        
        // Setup canvas right-click
        this.canvas.addEventListener('contextmenu', (e) => {
            // Only show context menu if not on a drawing
            if (!this.tool && !this.findDrawingAtPoint(e.offsetX, e.offsetY)) {
                e.preventDefault();
                // Use clientX/clientY for fixed positioning
                this.showChartContextMenu(e.clientX, e.clientY, e.offsetX, e.offsetY);
            }
        });
        
        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chart-context-menu') && 
                !e.target.closest('canvas')) {
                this.hideContextMenu();
            }
        });
    }
    
    saveSettings() {
        try {
            // 1. Save to localStorage immediately (instant, works offline)
            localStorage.setItem('chartSettings', JSON.stringify(this.chartSettings));
            console.log('✅ Chart settings saved to localStorage');
        } catch (error) {
            console.error('❌ Failed to save settings:', error);
        }
        
        // 2. Save to session state for backtesting sessions
        this.scheduleSessionStateSave({ chartSettings: this.chartSettings });
        
        // 3. Save to API for cross-device sync (background, debounced)
        this.scheduleSettingsSaveToAPI();
    }
    
    /**
     * Schedule API save with debouncing to avoid excessive requests
     */
    scheduleSettingsSaveToAPI() {
        // Clear existing timer
        if (this._settingsApiSaveTimer) {
            clearTimeout(this._settingsApiSaveTimer);
        }
        
        // Debounce API saves by 2 seconds
        this._settingsApiSaveTimer = setTimeout(() => {
            this.saveSettingsToAPI();
        }, 2000);
    }
    
    /**
     * Save chart settings to backend API for cross-device sync
     */
    async saveSettingsToAPI() {
        try {
            const symbol = this.currentFileId || 'default';
            const sessionId = typeof this.getActiveTradingSessionId === 'function'
                ? this.getActiveTradingSessionId()
                : null;
            
            const token = localStorage.getItem('token');
            if (!token) {
                // User not logged in, skip API save
                return;
            }
            
            const response = await fetch(`/api/chart/settings/${encodeURIComponent(symbol)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    settings: this.chartSettings,
                    session_id: sessionId
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Chart settings synced to cloud');
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - settings saved locally only');
            } else {
                console.warn('⚠️ Failed to sync settings to cloud:', response.statusText);
            }
        } catch (error) {
            console.warn('⚠️ Error syncing settings to cloud:', error.message);
            // Fail silently - localStorage still has the data
        }
    }
    
    /**
     * Load chart settings from backend API for cross-device sync
     */
    async loadSettingsFromAPI() {
        try {
            const symbol = this.currentFileId || 'default';
            const sessionId = typeof this.getActiveTradingSessionId === 'function'
                ? this.getActiveTradingSessionId()
                : null;
            
            const token = localStorage.getItem('token');
            if (!token) {
                // User not logged in, skip API load
                return null;
            }
            
            const url = new URL(`/api/chart/settings/${encodeURIComponent(symbol)}`, window.location.origin);
            if (sessionId) {
                url.searchParams.append('session_id', sessionId);
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.settings && Object.keys(result.settings).length > 0) {
                    return result.settings;
                }
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - using local settings only');
            }
            
            return null;
        } catch (error) {
            console.warn('⚠️ Error loading settings from cloud:', error.message);
            return null;
        }
    }
    
    async loadSavedSettings() {
        // Try loading from API first for cross-device sync
        const apiSettings = await this.loadSettingsFromAPI();
        
        try {
            if (apiSettings && Object.keys(apiSettings).length > 0) {
                // Use API data if available
                this.chartSettings = { ...this.chartSettings, ...apiSettings };
                console.log('📥 Chart settings loaded from cloud');
            } else {
                // Fall back to localStorage
                const saved = localStorage.getItem('chartSettings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    // Merge saved settings with defaults
                    this.chartSettings = { ...this.chartSettings, ...settings };
                    console.log('📥 Chart settings loaded from localStorage');
                } else {
                    // Only apply dark theme defaults if no saved settings exist
                    this.chartSettings.backgroundColor = '#050028';
                    this.chartSettings.scaleLinesColor = '#050028';
                    this.chartSettings.scaleTextColor = '#ffffff';
                    this.chartSettings.gridColor = 'rgba(42, 46, 57, 0.6)';
                    this.chartSettings.cursorLabelTextColor = '#d1d4dc';
                    this.chartSettings.cursorLabelBgColor = '#363a45';
                    this.chartSettings.symbolTextColor = '#d1d4dc';
                }
            }
            
            // Always apply chart settings (even with defaults)
            this.applyChartSettings();
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    
    getChartViewSnapshot() {
        return {
            offsetX: this.offsetX,
            candleWidth: this.candleWidth,
            candleWidthIndex: this.zoomLevel ? this.zoomLevel.candleWidthIndex : 4,
            priceOffset: this.priceOffset,
            priceZoom: this.priceZoom,
            autoScale: this.autoScale,
            timeframe: this.currentTimeframe || '1m',
            fileId: this.currentFileId || null,
        };
    }

    scheduleChartViewSave() {
        this.scheduleSessionStateSave({ chartView: this.getChartViewSnapshot() });
    }

    loadToolDefaults() {
        try {
            const saved = localStorage.getItem('toolDefaults');
            if (saved) {
                const savedDefaults = JSON.parse(saved);
                // Merge saved defaults with built-in defaults
                Object.keys(savedDefaults).forEach(tool => {
                    if (this.toolDefaults[tool]) {
                        this.toolDefaults[tool] = { ...this.toolDefaults[tool], ...savedDefaults[tool] };
                    }
                });
                console.log('✅ Tool defaults loaded from localStorage');
            }
        } catch (e) {
            console.error('Failed to load tool defaults:', e);
        }
    }
    
    saveToolDefaults() {
        try {
            localStorage.setItem('toolDefaults', JSON.stringify(this.toolDefaults));
            console.log('💾 Tool defaults saved');
        } catch (e) {
            console.error('Failed to save tool defaults:', e);
        }
        this.scheduleSessionStateSave({ toolDefaults: this.toolDefaults });
    }
    
    loadDrawingsFromStorage() {
        try {
            const saved = localStorage.getItem(`chart_drawings_${this.currentFileId || 'default'}`);
            if (saved) {
                this.drawings = JSON.parse(saved);
                console.log(`✅ Loaded ${this.drawings.length} drawings from localStorage`);
                console.log('📋 Drawing colors:', this.drawings.map((d, i) => `${i}: type=${d.type}, color=${d.color}`));
                
                // Only redraw if scales are ready, otherwise wait for next render
                if (this.xScale && this.yScale) {
                    console.log('✓ Scales ready, redrawing loaded drawings');
                    this.redrawDrawings();
                } else {
                    console.log('⏳ Scales not ready, will draw on next render');
                    this.scheduleRender();
                }
            }
        } catch (e) {
            console.error('Failed to load drawings from localStorage:', e);
            this.drawings = [];
        }
    }
    
    updateToolDefault(toolType, property, value) {
        if (this.toolDefaults[toolType]) {
            this.toolDefaults[toolType][property] = value;
            this.saveToolDefaults();
        }
    }
    
    updateToolDefaultsFromDrawing(drawing) {
        // Save this drawing's settings as defaults for future drawings of this type
        if (!this.toolDefaults[drawing.type]) return;
        
        // Save common properties
        if (drawing.color) this.toolDefaults[drawing.type].color = drawing.color;
        if (drawing.lineWidth) this.toolDefaults[drawing.type].lineWidth = drawing.lineWidth;
        if (drawing.opacity !== undefined) this.toolDefaults[drawing.type].opacity = drawing.opacity;
        
        // Save shape-specific properties
        if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
            if (drawing.fillColor) this.toolDefaults[drawing.type].fillColor = drawing.fillColor;
            if (drawing.fillOpacity !== undefined) this.toolDefaults[drawing.type].fillOpacity = drawing.fillOpacity;
        }
        
        // Save text-specific properties
        if (drawing.type === 'text') {
            if (drawing.fontSize) this.toolDefaults[drawing.type].fontSize = drawing.fontSize;
            if (drawing.fontWeight) this.toolDefaults[drawing.type].fontWeight = drawing.fontWeight;
        }
        
        // Save arrow size
        if (drawing.type === 'arrowUp' || drawing.type === 'arrowDown') {
            if (drawing.size) this.toolDefaults[drawing.type].size = drawing.size;
        }
        
        this.saveToolDefaults();
    }
    
    showNotification(message) {
        // Create notification element
        const notification = d3.select('body').append('div')
            .attr('class', 'chart-notification')
            .style('position', 'fixed')
            .style('top', '20px')
            .style('right', '20px')
            .style('background', 'rgba(41, 98, 255, 0.95)')
            .style('color', 'white')
            .style('padding', '12px 20px')
            .style('border-radius', '6px')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.3)')
            .style('z-index', '3000')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.3s ease')
            .text(message);
        
        // Animate in
        setTimeout(() => {
            notification
                .style('opacity', '1')
                .style('transform', 'translateY(0)');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification
                .style('opacity', '0')
                .style('transform', 'translateY(-10px)');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    ensureClearObjectsMenuStyles() {
        if (this.clearObjectsMenuStyleInjected) return;
        if (document.getElementById('clear-objects-menu-styles')) {
            this.clearObjectsMenuStyleInjected = true;
            return;
        }

        const style = document.createElement('style');
        style.id = 'clear-objects-menu-styles';
        style.textContent = `
.clear-objects-menu {
    position: absolute;
    min-width: 220px;
    background: rgba(5, 0, 40, 0.98);
    border: 1px solid #2a2e39;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    padding: 6px 0;
    z-index: 2000;
    display: none;
}
.clear-objects-menu.visible {
    display: block;
}
.clear-objects-menu__item {
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: #d1d4dc;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: default;
    transition: background 0.15s ease, color 0.15s ease;
    text-align: left;
}
.clear-objects-menu__item:hover {
    background: rgba(41, 98, 255, 0.12);
    color: #ffffff;
}
.clear-objects-menu__item.disabled {
    opacity: 0.4;
    cursor: default;
}
.clear-objects-menu__item.disabled:hover {
    background: transparent;
    color: #d1d4dc;
}
.clear-objects-menu__icon {
    font-size: 16px;
    width: 18px;
    text-align: center;
}
.clear-objects-menu__details {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.clear-objects-menu__primary {
    font-weight: 600;
}
.clear-objects-menu__secondary {
    font-size: 11px;
    color: #787b86;
}
        `;

        document.head.appendChild(style);
        this.clearObjectsMenuStyleInjected = true;
    }

    createClearObjectsMenu() {
        if (this.clearObjectsMenu) {
            return this.clearObjectsMenu;
        }

        this.ensureClearObjectsMenuStyles();

        const menu = document.createElement('div');
        menu.className = 'clear-objects-menu';
        const definitions = [
            {
                action: 'drawings',
                icon: '',
                secondary: 'Removes all drawing tools'
            },
            {
                action: 'indicators',
                icon: '',
                secondary: 'Removes all indicators'
            },
            {
                action: 'both',
                icon: '',
                secondary: 'Clears drawings and indicators'
            }
        ];

        this.clearObjectsMenuItems = {};

        definitions.forEach(def => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'clear-objects-menu__item';
            item.dataset.action = def.action;

            const icon = document.createElement('span');
            icon.className = 'clear-objects-menu__icon';
            icon.textContent = def.icon;
            item.appendChild(icon);

            const details = document.createElement('span');
            details.className = 'clear-objects-menu__details';

            const primary = document.createElement('span');
            primary.className = 'clear-objects-menu__primary';
            primary.dataset.role = `${def.action}-primary`;
            details.appendChild(primary);

            const secondary = document.createElement('span');
            secondary.className = 'clear-objects-menu__secondary';
            secondary.dataset.role = `${def.action}-secondary`;
            secondary.textContent = def.secondary;
            details.appendChild(secondary);

            item.appendChild(details);
            menu.appendChild(item);

            this.clearObjectsMenuItems[def.action] = {
                item,
                primary,
                secondary
            };
        });

        menu.addEventListener('click', (event) => {
            const target = event.target.closest('.clear-objects-menu__item');
            if (!target || target.classList.contains('disabled')) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.handleClearObjectsMenuAction(target.dataset.action);
        });

        document.body.appendChild(menu);
        this.clearObjectsMenu = menu;
        return menu;
    }

    toggleClearObjectsMenu(button) {
        if (this.clearObjectsMenuVisible) {
            this.hideClearObjectsMenu();
        } else {
            this.showClearObjectsMenu(button);
        }
    }

    showClearObjectsMenu(button) {
        const menu = this.createClearObjectsMenu();
        this.clearObjectsMenuButton = button;
        this.updateClearObjectsMenuCounts();

        const buttonRect = button.getBoundingClientRect();

        menu.style.display = 'block';
        menu.classList.add('visible');
        const menuRect = menu.getBoundingClientRect();

        let left = buttonRect.left + (buttonRect.width / 2) - (menuRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
        const top = buttonRect.bottom + 8;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        this.clearObjectsMenuVisible = true;
        document.addEventListener('mousedown', this.handleClearObjectsMenuOutsideClick, true);
    }

    hideClearObjectsMenu() {
        if (!this.clearObjectsMenu) return;
        this.clearObjectsMenu.classList.remove('visible');
        this.clearObjectsMenu.style.display = 'none';
        this.clearObjectsMenuVisible = false;
        document.removeEventListener('mousedown', this.handleClearObjectsMenuOutsideClick, true);
    }

    handleClearObjectsMenuOutsideClick(event) {
        if (!this.clearObjectsMenuVisible || !this.clearObjectsMenu) return;
        if (this.clearObjectsMenu.contains(event.target)) return;
        if (this.clearObjectsMenuButton && this.clearObjectsMenuButton.contains(event.target)) return;
        this.hideClearObjectsMenu();
    }
    
    // Setup chart click to close menus
    setupChartClickToCloseMenus() {
        const closeMenus = () => {
            if (this.clearObjectsMenuVisible) {
                this.hideClearObjectsMenu();
            }
        };
        
        // Listen on canvas
        if (this.canvas) {
            this.canvas.addEventListener('click', closeMenus);
            this.canvas.addEventListener('mousedown', closeMenus);
        }
        
        // Listen on chart container
        const chartContainer = document.getElementById('chartContainer');
        if (chartContainer) {
            chartContainer.addEventListener('click', (e) => {
                // Only close if clicking directly on container or canvas
                if (e.target === chartContainer || e.target === this.canvas || 
                    e.target.tagName === 'svg' || e.target.closest('#drawingSvg')) {
                    closeMenus();
                }
            });
        }
    }

    updateClearObjectsMenuCounts() {
        if (!this.clearObjectsMenu || !this.clearObjectsMenuItems) {
            return;
        }

        const { drawings, indicators } = this.getDrawingAndIndicatorCounts();

        const pluralize = (count, singular, plural = `${singular}s`) => {
            return `${count} ${count === 1 ? singular : plural}`;
        };

        const drawingItem = this.clearObjectsMenuItems.drawings;
        if (drawingItem) {
            drawingItem.primary.textContent = drawings > 0
                ? `Remove ${pluralize(drawings, 'drawing')}`
                : 'No drawings to remove';
            drawingItem.secondary.textContent = drawings > 0
                ? 'Removes all drawing tools'
                : 'Create a drawing to enable this action';
            drawingItem.item.classList.toggle('disabled', drawings === 0);
        }

        const indicatorItem = this.clearObjectsMenuItems.indicators;
        if (indicatorItem) {
            indicatorItem.primary.textContent = indicators > 0
                ? `Remove ${pluralize(indicators, 'indicator')}`
                : 'No indicators to remove';
            indicatorItem.secondary.textContent = indicators > 0
                ? 'Removes all chart indicators'
                : 'Add an indicator to enable this action';
            indicatorItem.item.classList.toggle('disabled', indicators === 0);
        }

        const bothItem = this.clearObjectsMenuItems.both;
        if (bothItem) {
            const any = drawings + indicators > 0;
            bothItem.primary.textContent = 'Remove drawings & indicators';
            bothItem.secondary.textContent = `${pluralize(drawings, 'drawing')} · ${pluralize(indicators, 'indicator')}`;
            bothItem.item.classList.toggle('disabled', !any);
        }
    }

    handleClearObjectsMenuAction(action) {
        const counts = this.getDrawingAndIndicatorCounts();
        let drawingsCleared = false;
        let indicatorsCleared = false;

        if (action === 'drawings') {
            drawingsCleared = this.clearOnlyDrawings({ confirmPrompt: false });
        } else if (action === 'indicators') {
            indicatorsCleared = this.clearOnlyIndicators({ confirmPrompt: false });
        } else if (action === 'both') {
            ({ drawingsCleared, indicatorsCleared } = this.clearDrawingsAndIndicators({ confirmPrompt: false }));
        }

        this.updateClearObjectsMenuCounts();
        this.hideClearObjectsMenu();

        if (action === 'drawings') {
            if (drawingsCleared) {
                this.showNotification('All drawings removed ✓');
            } else {
                this.showNotification('No drawings to remove');
            }
        } else if (action === 'indicators') {
            if (indicatorsCleared) {
                this.showNotification('All indicators removed ✓');
            } else {
                this.showNotification('No indicators to remove');
            }
        } else if (action === 'both') {
            if (drawingsCleared && indicatorsCleared) {
                this.showNotification('Drawings & indicators removed ✓');
            } else if (drawingsCleared) {
                this.showNotification('Drawings removed ✓');
            } else if (indicatorsCleared) {
                this.showNotification('Indicators removed ✓');
            } else {
                this.showNotification('Nothing to remove');
            }
        }
    }

    clearOnlyDrawings({ confirmPrompt = false } = {}) {
        let cleared = false;
        if (this.drawingManager && typeof this.drawingManager.clearDrawings === 'function') {
            cleared = this.drawingManager.clearDrawings({ confirmPrompt });
        } else if (Array.isArray(this.drawings) && this.drawings.length > 0) {
            this.svg.selectAll('*').remove();
            this.drawings = [];
            localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, JSON.stringify([]));
            this.scheduleRender();
            cleared = true;
        }
        return cleared;
    }

    clearOnlyIndicators({ confirmPrompt = false } = {}) {
        if (typeof this.clearIndicators === 'function') {
            return this.clearIndicators({ confirmPrompt });
        }

        if (!this.indicators || !Array.isArray(this.indicators.active)) {
            return false;
        }

        const count = this.indicators.active.length;
        if (count === 0) {
            return false;
        }

        if (confirmPrompt) {
            const confirmed = window.confirm(`Remove ${count} indicator${count === 1 ? '' : 's'}?`);
            if (!confirmed) {
                return false;
            }
        }

        this.indicators.active = [];
        this.indicators.data = {};

        if (typeof this.render === 'function') {
            this.render();
        }

        if (typeof this.updateOHLCIndicators === 'function') {
            this.updateOHLCIndicators();
        }

        console.log('🗑️ All indicators cleared (fallback)');
        return true;
    }

    clearDrawingsAndIndicators({ confirmPrompt = false } = {}) {
        const drawingsCleared = this.clearOnlyDrawings({ confirmPrompt });
        const indicatorsCleared = this.clearOnlyIndicators({ confirmPrompt });
        return { drawingsCleared, indicatorsCleared };
    }

    ensureVisibilityMenuStyles() {
        if (this.visibilityMenuStyleInjected) return;
        if (document.getElementById('visibility-menu-styles')) {
            this.visibilityMenuStyleInjected = true;
            return;
        }

        const style = document.createElement('style');
        style.id = 'visibility-menu-styles';
        style.textContent = `
.visibility-menu {
    position: absolute;
    min-width: 220px;
    background: rgba(5, 0, 40, 0.98);
    border: 1px solid #2a2e39;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    padding: 6px 0;
    z-index: 2000;
    display: none;
}
.visibility-menu.visible {
    display: block;
}
.visibility-menu__item {
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: #d1d4dc;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: default;
    transition: background 0.15s ease, color 0.15s ease;
    text-align: left;
}
.visibility-menu__item:hover {
    background: rgba(41, 98, 255, 0.12);
    color: #ffffff;
}
.visibility-menu__item.disabled {
    opacity: 0.4;
    cursor: default;
}
.visibility-menu__item.disabled:hover {
    background: transparent;
    color: #d1d4dc;
}
.visibility-menu__icon {
    font-size: 16px;
    width: 18px;
    text-align: center;
}
.visibility-menu__details {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}
.visibility-menu__primary {
    font-weight: 600;
}
.visibility-menu__secondary {
    font-size: 11px;
    color: #787b86;
}
        `;

        document.head.appendChild(style);
        this.visibilityMenuStyleInjected = true;
    }

    createVisibilityMenu() {
        if (this.visibilityMenu) {
            return this.visibilityMenu;
        }

        this.ensureVisibilityMenuStyles();

        let menu = document.getElementById('visibilityMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'visibilityMenu';
            document.body.appendChild(menu);
        }

        menu.className = 'visibility-menu';
        menu.innerHTML = '';

        const definitions = [
            { action: 'drawings', icon: '' },
            { action: 'indicators', icon: '' },
            { action: 'positions', icon: '' },
            { action: 'all', icon: '' }
        ];

        this.visibilityMenuItems = {};

        definitions.forEach(def => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'visibility-menu__item';
            item.dataset.action = def.action;

            const icon = document.createElement('span');
            icon.className = 'visibility-menu__icon';
            icon.textContent = def.icon;
            item.appendChild(icon);

            const details = document.createElement('span');
            details.className = 'visibility-menu__details';

            const primary = document.createElement('span');
            primary.className = 'visibility-menu__primary';
            primary.textContent = '—';
            details.appendChild(primary);

            const secondary = document.createElement('span');
            secondary.className = 'visibility-menu__secondary';
            secondary.textContent = '—';
            details.appendChild(secondary);

            item.appendChild(details);
            menu.appendChild(item);

            this.visibilityMenuItems[def.action] = {
                item,
                primary,
                secondary
            };
        });

        menu.addEventListener('click', (event) => {
            const target = event.target.closest('.visibility-menu__item');
            if (!target || target.classList.contains('disabled')) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.handleVisibilityMenuAction(target.dataset.action);
        });

        menu.style.display = 'none';
        menu.classList.remove('visible');

        this.visibilityMenu = menu;
        this.updateVisibilityMenuItems();
        return menu;
    }

    toggleVisibilityMenu(button) {
        if (this.visibilityMenuVisible) {
            this.hideVisibilityMenu();
        } else {
            this.hideClearObjectsMenu();
            this.showVisibilityMenu(button);
        }
    }

    showVisibilityMenu(button) {
        // Close any open tool dropdowns/menus so visibility is mutually exclusive
        try {
            const magnetDropdown = document.getElementById('magnetDropdown');
            if (magnetDropdown) {
                magnetDropdown.style.display = 'none';
            }

            document.querySelectorAll('.tool-dropdown').forEach(dd => dd.classList.remove('show'));
            document.querySelectorAll('.tool-group-btn[data-group]').forEach(btn => btn.classList.remove('dropdown-open'));
            document.querySelectorAll('.cursor-dropdown-arrow, .dropdown-arrow').forEach(arr => arr.classList.remove('dropdown-open'));
        } catch (e) {
            // Ignore dropdown closing errors
        }

        const menu = this.createVisibilityMenu();
        this.visibilityMenuButton = button;
        this.updateVisibilityMenuItems();

        const rect = button.getBoundingClientRect();

        menu.style.display = 'block';
        menu.classList.add('visible');
        const menuRect = menu.getBoundingClientRect();

        let left = rect.left + (rect.width / 2) - (menuRect.width / 2);
        left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
        const top = rect.bottom + 8;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        this.visibilityMenuVisible = true;
        document.addEventListener('mousedown', this.handleVisibilityMenuOutsideClick, true);
    }

    hideVisibilityMenu() {
        if (!this.visibilityMenu) return;
        this.visibilityMenu.classList.remove('visible');
        this.visibilityMenu.style.display = 'none';
        this.visibilityMenuVisible = false;
        this.visibilityMenuButton = null;
        document.removeEventListener('mousedown', this.handleVisibilityMenuOutsideClick, true);
    }

    handleVisibilityMenuOutsideClick(event) {
        if (!this.visibilityMenuVisible || !this.visibilityMenu) return;
        if (this.visibilityMenu.contains(event.target)) return;
        if (this.visibilityMenuButton && this.visibilityMenuButton.contains(event.target)) return;
        this.hideVisibilityMenu();
    }

    updateVisibilityMenuItems() {
        if (!this.visibilityMenuItems) return;

        const counts = this.getDrawingAndIndicatorCounts();
        const positions = this.getPositionsCount();
        const allHidden = this.drawingsHidden && this.indicatorsHidden && this.positionsHidden;
        const anyAvailable = (counts.drawings + counts.indicators + positions) > 0;

        const drawingsItem = this.visibilityMenuItems.drawings;
        if (drawingsItem) {
            const hasDrawings = counts.drawings > 0;
            drawingsItem.primary.textContent = this.drawingsHidden ? 'Show drawings' : 'Hide drawings';
            drawingsItem.secondary.textContent = hasDrawings
                ? (this.drawingsHidden ? 'Reveal all drawing tools' : 'Temporarily hide drawing tools')
                : 'No drawings available';
            drawingsItem.item.classList.toggle('disabled', !hasDrawings && !this.drawingsHidden);
        }

        const indicatorsItem = this.visibilityMenuItems.indicators;
        if (indicatorsItem) {
            const hasIndicators = counts.indicators > 0;
            indicatorsItem.primary.textContent = this.indicatorsHidden ? 'Show indicators' : 'Hide indicators';
            indicatorsItem.secondary.textContent = hasIndicators
                ? (this.indicatorsHidden ? 'Indicators are currently hidden' : 'Temporarily hide indicators')
                : 'No indicators available';
            indicatorsItem.item.classList.toggle('disabled', !hasIndicators && !this.indicatorsHidden);
        }

        const positionsItem = this.visibilityMenuItems.positions;
        if (positionsItem) {
            const hasPositions = positions > 0;
            positionsItem.primary.textContent = this.positionsHidden ? 'Show positions & orders' : 'Hide positions & orders';
            positionsItem.secondary.textContent = hasPositions
                ? (this.positionsHidden ? 'Positions are currently hidden' : 'Temporarily hide long/short positions')
                : 'No positions on chart';
            positionsItem.item.classList.toggle('disabled', !hasPositions && !this.positionsHidden);
        }

        const allItem = this.visibilityMenuItems.all;
        if (allItem) {
            allItem.primary.textContent = allHidden ? 'Show all objects' : 'Hide all objects';
            allItem.secondary.textContent = anyAvailable
                ? `Drawings: ${counts.drawings} · Indicators: ${counts.indicators} · Positions: ${positions}`
                : 'Nothing on chart yet';
            allItem.item.classList.toggle('disabled', !anyAvailable && !allHidden);
        }
    }

    handleVisibilityMenuAction(action) {
        const positionsCount = this.getPositionsCount();

        if (action === 'drawings') {
            if (!this.drawingsHidden && this.getDrawingAndIndicatorCounts().drawings === 0) {
                this.showNotification('No drawings to hide');
                this.updateVisibilityMenuItems();
                this.hideVisibilityMenu();
                return;
            }
            this.setDrawingsHidden(!this.drawingsHidden);
            this.showNotification(this.drawingsHidden ? 'Drawings hidden ✓' : 'Drawings shown ✓');
        } else if (action === 'indicators') {
            if (!this.indicatorsHidden && this.getDrawingAndIndicatorCounts().indicators === 0) {
                this.showNotification('No indicators to hide');
                this.updateVisibilityMenuItems();
                this.hideVisibilityMenu();
                return;
            }
            this.setIndicatorsHidden(!this.indicatorsHidden);
            this.showNotification(this.indicatorsHidden ? 'Indicators hidden ✓' : 'Indicators shown ✓');
        } else if (action === 'positions') {
            if (!this.positionsHidden && positionsCount === 0) {
                this.showNotification('No positions to hide');
                this.updateVisibilityMenuItems();
                this.hideVisibilityMenu();
                return;
            }
            this.setPositionsHidden(!this.positionsHidden);
            this.showNotification(this.positionsHidden ? 'Positions hidden ✓' : 'Positions shown ✓');
        } else if (action === 'all') {
            const anyItems = this.getDrawingAndIndicatorCounts().drawings + this.getDrawingAndIndicatorCounts().indicators + positionsCount;
            const currentlyAllHidden = this.drawingsHidden && this.indicatorsHidden && this.positionsHidden;

            if (!currentlyAllHidden) {
                if (anyItems === 0) {
                    this.showNotification('Nothing to hide');
                    this.updateVisibilityMenuItems();
                    this.hideVisibilityMenu();
                    return;
                }
                this.setDrawingsHidden(true);
                this.setIndicatorsHidden(true);
                this.setPositionsHidden(true);
                this.showNotification('All objects hidden ✓');
            } else {
                this.setDrawingsHidden(false);
                this.setIndicatorsHidden(false);
                this.setPositionsHidden(false);
                this.showNotification('All objects shown ✓');
            }
        }

        this.updateVisibilityMenuItems();
        this.hideVisibilityMenu();
    }

    setDrawingsHidden(hidden) {
        this.drawingsHidden = hidden;
        this.applyDrawingVisibilityStates();
    }

    setPositionsHidden(hidden) {
        this.positionsHidden = hidden;
        this.applyDrawingVisibilityStates();
    }

    setIndicatorsHidden(hidden) {
        this.indicatorsHidden = hidden;
        this.applyIndicatorVisibilityStates();
        this.updateVisibilityMenuItems();
    }

    applyDrawingVisibilityStates() {
        const hideAll = this.drawingsHidden;
        const hidePositions = this.positionsHidden;

        const drawingsList = this.drawingManager && Array.isArray(this.drawingManager.drawings)
            ? this.drawingManager.drawings
            : (Array.isArray(this.drawings) ? this.drawings : []);

        drawingsList.forEach(drawing => {
            if (!drawing || !drawing.group) return;
            const isPosition = drawing.type === 'long-position' || drawing.type === 'short-position';
            
            // Determine if this drawing should be hidden
            let shouldHide = false;
            if (hideAll) {
                shouldHide = true; // Hide everything
            } else if (isPosition && hidePositions) {
                shouldHide = true; // Hide only positions
            } else if (!isPosition && this.drawingsHidden) {
                shouldHide = true; // Hide only non-position drawings
            }
            
            drawing.group.style('display', shouldHide ? 'none' : null);
        });

        if (this.svg) {
            if (hideAll) {
                // Hide everything
                this.svg.selectAll('.drawing').style('display', 'none');
            } else {
                // First show all drawings
                this.svg.selectAll('.drawing').style('display', null);
                
                // Then hide positions if needed
                if (hidePositions) {
                    this.svg.selectAll('.drawing.long-position, .drawing.short-position').style('display', 'none');
                }
                
                // Then hide non-position drawings if needed
                if (this.drawingsHidden) {
                    this.svg.selectAll('.drawing').each(function() {
                        const classList = this.classList;
                        if (!classList.contains('long-position') && !classList.contains('short-position')) {
                            this.style.display = 'none';
                        }
                    });
                }
            }
        }

        if (this.drawingManager && this.drawingManager.tempGroup) {
            this.drawingManager.tempGroup.style('display', hideAll ? 'none' : null);
        }

        this.updateVisibilityMenuItems();
    }

    applyIndicatorVisibilityStates() {
        if (!this.indicators || !Array.isArray(this.indicators.active)) {
            return;
        }

        this.indicators.active.forEach(indicator => {
            if (!indicator) return;

            if (this.indicatorsHidden) {
                if (!indicator._hiddenState) {
                    indicator._hiddenState = {
                        visible: indicator.visible !== false,
                        data: indicator.data,
                        storedData: this.indicators.data ? this.indicators.data[indicator.id] : undefined
                    };
                }
                indicator.visible = false;
                indicator.data = [];
                if (this.indicators.data) {
                    this.indicators.data[indicator.id] = [];
                }
            } else if (indicator._hiddenState) {
                indicator.visible = indicator._hiddenState.visible;
                if (indicator._hiddenState.data !== undefined) {
                    indicator.data = indicator._hiddenState.data;
                }
                if (this.indicators.data && indicator._hiddenState.storedData !== undefined) {
                    this.indicators.data[indicator.id] = indicator._hiddenState.storedData;
                }
                delete indicator._hiddenState;
            } else {
                indicator.visible = true;
            }
        });

        this.bumpDataVersion();

        if (typeof this.render === 'function') {
            this.render();
        }

        if (typeof this.updateOHLCIndicators === 'function') {
            this.updateOHLCIndicators();
        }
    }

    getPositionsCount() {
        const drawingsList = this.drawingManager && Array.isArray(this.drawingManager.drawings)
            ? this.drawingManager.drawings
            : (Array.isArray(this.drawings) ? this.drawings : []);
        return drawingsList.reduce((count, drawing) => {
            if (!drawing) return count;
            const type = drawing.type || drawing.toolType;
            if (type === 'long-position' || type === 'short-position') {
                return count + 1;
            }
            return count;
        }, 0);
    }

    getDrawingAndIndicatorCounts() {
        let drawings = 0;
        if (this.drawingManager && Array.isArray(this.drawingManager.drawings)) {
            drawings = this.drawingManager.drawings.length;
        } else if (Array.isArray(this.drawings)) {
            drawings = this.drawings.length;
        }

        let indicators = 0;
        if (this.indicators && Array.isArray(this.indicators.active)) {
            indicators = this.indicators.active.length;
        }

        return { drawings, indicators };
    }
    
    buildSettingsSidebar() {
        const categories = [
            { id: 'symbol', icon: '', label: 'Symbol' },
            { id: 'candles', icon: '', label: 'Candles' },
            { id: 'scales', icon: '', label: 'Scales and lines' },
            { id: 'canvas', icon: '', label: 'Canvas' }
        ];
        
        categories.forEach(cat => {
            const item = this.settingsSidebar.append('div')
                .attr('class', 'settings-nav-item')
                .attr('data-category', cat.id)
                .style('padding', '16px 20px')
                .style('cursor', 'default')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('gap', '12px')
                .style('font-size', '15px')
                .style('color', '#131722')
                .style('transition', 'all 0.2s ease')
                .style('border-left', '3px solid transparent')
                .on('click', () => this.showSettingsCategory(cat.id))
                .on('mouseenter', function() {
                    if (!d3.select(this).classed('active')) {
                        d3.select(this).style('background', '#eeeeee');
                    }
                })
                .on('mouseleave', function() {
                    if (!d3.select(this).classed('active')) {
                        d3.select(this).style('background', 'transparent');
                    }
                });
            
            item.append('span')
                .style('font-size', '20px')
                .text(cat.icon);
            
            item.append('span')
                .text(cat.label);
        });
    }
    
    showSettingsCategory(categoryId) {
        // Update sidebar selection
        this.settingsSidebar.selectAll('.settings-nav-item')
            .classed('active', false)
            .style('background', 'transparent')
            .style('border-left-color', 'transparent');
        
        this.settingsSidebar.select(`[data-category="${categoryId}"]`)
            .classed('active', true)
            .style('background', '#ffffff')
            .style('border-left-color', '#2962ff');
        
        this.currentSettingsCategory = categoryId;
        
        // Clear and rebuild content
        this.settingsContent.html('');
        
        switch(categoryId) {
            case 'symbol':
                this.buildSymbolSettings();
                break;
            case 'candles':
                this.buildCandlesSettings();
                break;
            case 'scales':
                this.buildScalesSettings();
                break;
            case 'canvas':
                this.buildCanvasSettings();
                break;
        }
    }
    
    buildSymbolSettings() {
        const section = this.settingsContent.append('div');
        
        // Initialize settings if not present (already set in constructor)
        if (typeof this.chartSettings.symbolTitle === 'undefined') this.chartSettings.symbolTitle = true;
        if (typeof this.chartSettings.symbolTitleFormat === 'undefined') this.chartSettings.symbolTitleFormat = 'Description';
        if (typeof this.chartSettings.symbolTextColor === 'undefined') this.chartSettings.symbolTextColor = '#d1d4dc';
        if (typeof this.chartSettings.showChartValues === 'undefined') this.chartSettings.showChartValues = true;
        if (typeof this.chartSettings.showBarChangeValues === 'undefined') this.chartSettings.showBarChangeValues = true;
        if (typeof this.chartSettings.showIndicatorTitles === 'undefined') this.chartSettings.showIndicatorTitles = true;
        if (typeof this.chartSettings.showIndicatorArguments === 'undefined') this.chartSettings.showIndicatorArguments = true;
        if (typeof this.chartSettings.showIndicatorValues === 'undefined') this.chartSettings.showIndicatorValues = true;
        if (typeof this.chartSettings.showIndicatorBackground === 'undefined') this.chartSettings.showIndicatorBackground = true;
        if (typeof this.chartSettings.indicatorBackgroundOpacity === 'undefined') this.chartSettings.indicatorBackgroundOpacity = 50;
        
        // SYMBOL section
        section.append('h3')
            .style('margin', '0 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('SYMBOL');
        
        // Title
        const titleRow = this.addSettingRow(section);
        const { input: titleInput } = this.addCheckbox(titleRow, 'Title', this.chartSettings.symbolTitle);
        console.log('Title checkbox created, initial value:', this.chartSettings.symbolTitle);
        titleInput.on('change', () => {
            const newValue = titleInput.property('checked');
            console.log('Title checkbox changed to:', newValue);
            this.chartSettings.symbolTitle = newValue;
            this.scheduleRender();
        });
        const titleDropdown = this.addDropdown(titleRow, ['Description', 'Ticker', 'Ticker and description'], this.chartSettings.symbolTitleFormat);
        titleDropdown.on('change', () => {
            this.chartSettings.symbolTitleFormat = titleDropdown.property('value');
            this.scheduleRender();
        });
        
        // Symbol/OHLC text color
        const symbolColorRow = this.addSettingRow(section);
        symbolColorRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Text color');
        this.addColorPreview(symbolColorRow, this.chartSettings.symbolTextColor, 'symbolTextColor');
        
        // Chart values
        const chartValuesRow = this.addSettingRow(section);
        const { input: chartValuesInput } = this.addCheckbox(chartValuesRow, 'Chart values', this.chartSettings.showChartValues);
        chartValuesInput.on('change', () => {
            this.chartSettings.showChartValues = chartValuesInput.property('checked');
            this.scheduleRender();
        });
        
        // Bar change values
        const barChangeRow = this.addSettingRow(section);
        const { input: barChangeInput } = this.addCheckbox(barChangeRow, 'Bar change values', this.chartSettings.showBarChangeValues);
        barChangeInput.on('change', () => {
            this.chartSettings.showBarChangeValues = barChangeInput.property('checked');
            this.scheduleRender();
        });
        
        // Volume - Note: Now controlled via Indicators panel
        const volumeRow = this.addSettingRow(section);
        volumeRow.append('span')
            .style('font-size', '12px')
            .style('color', '#787b86')
            .text('Volume: Use Indicators panel to add/remove');
        // The checkbox is removed since volume is now controlled as an indicator
        
        // INDICATORS section
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('INDICATORS');
        
        // Titles
        const titlesRow = this.addSettingRow(section);
        const { input: titlesInput } = this.addCheckbox(titlesRow, 'Titles', this.chartSettings.showIndicatorTitles);
        titlesInput.on('change', () => {
            this.chartSettings.showIndicatorTitles = titlesInput.property('checked');
            this.scheduleRender();
        });
        
        // Arguments (indented)
        const argsRow = this.addSettingRow(section);
        argsRow.style('padding-left', '40px');
        const { input: argsInput } = this.addCheckbox(argsRow, 'Arguments', this.chartSettings.showIndicatorArguments);
        argsInput.on('change', () => {
            this.chartSettings.showIndicatorArguments = argsInput.property('checked');
            this.scheduleRender();
        });
        
        // Values
        const valuesRow = this.addSettingRow(section);
        const { input: valuesInput } = this.addCheckbox(valuesRow, 'Values', this.chartSettings.showIndicatorValues);
        valuesInput.on('change', () => {
            this.chartSettings.showIndicatorValues = valuesInput.property('checked');
            this.scheduleRender();
        });
        
        // Background with slider
        const bgRow = this.addSettingRow(section);
        const { input: bgInput } = this.addCheckbox(bgRow, 'Background', this.chartSettings.showIndicatorBackground);
        bgInput.on('change', () => {
            this.chartSettings.showIndicatorBackground = bgInput.property('checked');
            this.scheduleRender();
        });
        const bgSlider = this.addSliderControl(bgRow, this.chartSettings.indicatorBackgroundOpacity);
        bgSlider.on('input', () => {
            this.chartSettings.indicatorBackgroundOpacity = parseInt(bgSlider.property('value'));
            this.scheduleRender();
        });
    }
    
    buildCandlesSettings() {
        const section = this.settingsContent.append('div');
        const chartInstance = this;
        
        // Initialize settings if not present (already set in constructor)
        if (typeof this.chartSettings.colorBasedOnPreviousClose === 'undefined') this.chartSettings.colorBasedOnPreviousClose = false;
        if (typeof this.chartSettings.showCandleBody === 'undefined') this.chartSettings.showCandleBody = true;
        if (typeof this.chartSettings.showCandleBorders === 'undefined') this.chartSettings.showCandleBorders = true;
        if (typeof this.chartSettings.showCandleWick === 'undefined') this.chartSettings.showCandleWick = true;
        if (typeof this.chartSettings.sessionType === 'undefined') this.chartSettings.sessionType = 'Extended trading hours';
        if (typeof this.chartSettings.precision === 'undefined') this.chartSettings.precision = 'Default';
        if (typeof this.chartSettings.timezone === 'undefined') this.chartSettings.timezone = '(UTC-5) Toronto';
        
        // ===== THEME PREVIEW SECTION =====
        section.append('h3')
            .style('margin', '0 0 12px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('THEME PREVIEW');
        
        const previewContainer = section.append('div')
            .style('background', '#050028')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '8px')
            .style('padding', '12px')
            .style('margin-bottom', '24px');
        
        // Preview canvas
        const previewCanvas = previewContainer.append('canvas')
            .attr('width', 480)
            .attr('height', 200)
            .style('width', '100%')
            .style('height', '100%')
            .style('border-radius', '4px')
            .style('display', 'block');
        
        const previewCtx = previewCanvas.node().getContext('2d');
        
        // Draw preview function
        const drawThemePreview = (colors) => {
            const w = 480, h = 200;
            previewCtx.clearRect(0, 0, w, h);
            
            // Background
            previewCtx.fillStyle = colors.backgroundColor || '#050028';
            previewCtx.fillRect(0, 0, w, h);
            
            // Grid lines
            previewCtx.strokeStyle = colors.gridColor || 'rgba(255,255,255,0.1)';
            previewCtx.lineWidth = 0.5;
            for (let y = 20; y < h - 15; y += 28) {
                previewCtx.beginPath();
                previewCtx.moveTo(0, y);
                previewCtx.lineTo(w - 50, y);
                previewCtx.stroke();
            }
            for (let x = 20; x < w - 50; x += 45) {
                previewCtx.beginPath();
                previewCtx.moveTo(x, 0);
                previewCtx.lineTo(x, h - 20);
                previewCtx.stroke();
            }
            
            // Candles
            const candles = [
    { o: 100, c: 95, h: 105, l: 92 },
    { o: 95, c: 98, h: 102, l: 93 },
    { o: 98, c: 96, h: 101, l: 94 },
    { o: 96, c: 102, h: 105, l: 95 },
    { o: 102, c: 99, h: 104, l: 97 },
    { o: 99, c: 103, h: 106, l: 98 },
    { o: 103, c: 97, h: 105, l: 95 },
    { o: 97, c: 101, h: 103, l: 96 },
    { o: 101, c: 98, h: 102, l: 96 },
    { o: 98, c: 94, h: 100, l: 92 },
    { o: 94, c: 97, h: 99, l: 93 },
    { o: 97, c: 95, h: 98, l: 93 },
    { o: 95, c: 99, h: 102, l: 94 },
    { o: 99, c: 96, h: 101, l: 95 },
    { o: 96, c: 98, h: 100, l: 95 },
    { o: 98, c: 93, h: 99, l: 91 },
    { o: 93, c: 96, h: 98, l: 92 },
    { o: 96, c: 94, h: 97, l: 92 },
    { o: 94, c: 99, h: 102, l: 93 },
    { o: 99, c: 97, h: 101, l: 96 }
];
            candles.forEach((c, i) => {
                const x = 18 + i * 21;
                const bullish = c.c < c.o;
                const bodyColor = bullish ? (colors.bodyUpColor || '#26a69a') : (colors.bodyDownColor || '#ef5350');
                const wickColor = bullish ? (colors.wickUpColor || '#26a69a') : (colors.wickDownColor || '#ef5350');
                
                // Wick
                previewCtx.strokeStyle = wickColor;
                previewCtx.lineWidth = 1;
                previewCtx.beginPath();
                previewCtx.moveTo(x, c.h);
                previewCtx.lineTo(x, c.l);
                previewCtx.stroke();
                
                // Body
                previewCtx.fillStyle = bodyColor;
                const bodyTop = Math.min(c.o, c.c);
                const bodyHeight = Math.abs(c.c - c.o) || 2;
                previewCtx.fillRect(x - 6, bodyTop, 12, bodyHeight);
                
                // Border
                previewCtx.strokeStyle = bullish ? (colors.borderUpColor || bodyColor) : (colors.borderDownColor || bodyColor);
                previewCtx.strokeRect(x - 6, bodyTop, 12, bodyHeight);
            });
            
            // Price scale background
            previewCtx.fillStyle = colors.backgroundColor || '#050028';
            previewCtx.fillRect(w - 50, 0, 50, h);
            
            // Price scale text
            previewCtx.fillStyle = colors.scaleTextColor || '#787b86';
            previewCtx.font = '10px Roboto';
            previewCtx.textAlign = 'right';
            previewCtx.fillText('1.2400', w - 5, 30);
            previewCtx.fillText('1.2350', w - 5, 58);
            previewCtx.fillText('1.2300', w - 5, 86);
            previewCtx.fillText('1.2250', w - 5, 114);
            previewCtx.fillText('1.2200', w - 5, 142);
            
            // Time scale
            previewCtx.fillStyle = colors.scaleTextColor || '#787b86';
            previewCtx.font = '10px Roboto';
            previewCtx.textAlign = 'center';
            previewCtx.fillText('09:00', 60, h - 3);
            previewCtx.fillText('12:00', 180, h - 3);
            previewCtx.fillText('15:00', 300, h - 3);
            previewCtx.fillText('18:00', 420, h - 3);
        };
        
        // Draw initial preview
        drawThemePreview(this.chartSettings);
        
        // Store the preview function to update when footer template dropdown is changed
        this._updateThemePreview = drawThemePreview;
        this._themePreviewChartSettings = this.chartSettings;
        
        // ===== CANDLES SECTION =====
        section.append('h3')
            .style('margin', '0 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('CANDLES');
        
        // Body
        const bodyRow = this.addSettingRow(section);
        const { input: bodyInput } = this.addCheckbox(bodyRow, 'Body', this.chartSettings.showCandleBody);
        console.log('Body checkbox created, initial value:', this.chartSettings.showCandleBody);
        bodyInput.on('change', () => {
            const newValue = bodyInput.property('checked');
            console.log('Body checkbox changed to:', newValue);
            this.chartSettings.showCandleBody = newValue;
            this.scheduleRender();
        });
        const bodyColors = bodyRow.append('div').style('display', 'flex').style('gap', '8px');
        this.addColorPreview(bodyColors, this.chartSettings.bodyUpColor, 'bodyUpColor');
        this.addColorPreview(bodyColors, this.chartSettings.bodyDownColor, 'bodyDownColor');
        
        // Borders
        const bordersRow = this.addSettingRow(section);
        const { input: bordersInput } = this.addCheckbox(bordersRow, 'Borders', this.chartSettings.showCandleBorders);
        bordersInput.on('change', () => {
            this.chartSettings.showCandleBorders = bordersInput.property('checked');
            this.scheduleRender();
        });
        const borderColors = bordersRow.append('div').style('display', 'flex').style('gap', '8px');
        this.addColorPreview(borderColors, this.chartSettings.borderUpColor, 'borderUpColor');
        this.addColorPreview(borderColors, this.chartSettings.borderDownColor, 'borderDownColor');
        
        // Wick
        const wickRow = this.addSettingRow(section);
        const { input: wickInput } = this.addCheckbox(wickRow, 'Wick', this.chartSettings.showCandleWick);
        console.log('Wick checkbox created, initial value:', this.chartSettings.showCandleWick);
        wickInput.on('change', () => {
            const newValue = wickInput.property('checked');
            console.log('Wick checkbox changed to:', newValue);
            this.chartSettings.showCandleWick = newValue;
            this.scheduleRender();
        });
        const wickColors = wickRow.append('div').style('display', 'flex').style('gap', '8px');
        this.addColorPreview(wickColors, this.chartSettings.wickUpColor, 'wickUpColor');
        this.addColorPreview(wickColors, this.chartSettings.wickDownColor, 'wickDownColor');
        
        // DATA MODIFICATION section
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('DATA MODIFICATION');
        
        // Session
        const sessionRow = this.addSettingRow(section);
        sessionRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Session');
        const sessionDropdown = this.addDropdown(sessionRow, ['Extended trading hours', 'Regular trading hours'], this.chartSettings.sessionType);
        sessionDropdown.on('change', () => {
            this.chartSettings.sessionType = sessionDropdown.property('value');
            this.scheduleRender();
        });
        
        // Precision
        const precisionRow = this.addSettingRow(section);
        precisionRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Precision');
        const precisionDropdown = this.addDropdown(precisionRow, ['Default', '0', '1', '2', '3', '4', '5'], this.chartSettings.precision);
        precisionDropdown.on('change', () => {
            this.chartSettings.precision = precisionDropdown.property('value');
            this.scheduleRender();
        });
        
        // Timezone
        const timezoneRow = this.addSettingRow(section);
        timezoneRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Timezone');
        const timezoneDropdown = this.addDropdown(timezoneRow, ['(UTC-5) Toronto', '(UTC-8) Los Angeles', '(UTC) London', '(UTC+1) Paris'], this.chartSettings.timezone);
        timezoneDropdown.on('change', () => {
            this.chartSettings.timezone = timezoneDropdown.property('value');
            this.scheduleRender();
        });
    }
    
    buildScalesSettings() {
        const section = this.settingsContent.append('div');
        
        // Initialize settings if not present (already set in constructor)
        if (typeof this.chartSettings.scaleModes === 'undefined') this.chartSettings.scaleModes = 'Visible on mouse over';
        if (typeof this.chartSettings.lockPriceToBarRatio === 'undefined') this.chartSettings.lockPriceToBarRatio = false;
        if (typeof this.chartSettings.priceToBarRatioValue === 'undefined') this.chartSettings.priceToBarRatioValue = '1.2148145';
        if (typeof this.chartSettings.scalesPlacement === 'undefined') this.chartSettings.scalesPlacement = 'Auto';
        if (typeof this.chartSettings.noOverlappingLabels === 'undefined') this.chartSettings.noOverlappingLabels = true;
        if (typeof this.chartSettings.showPlusButton === 'undefined') this.chartSettings.showPlusButton = true;
        if (typeof this.chartSettings.showCountdownToBarClose === 'undefined') this.chartSettings.showCountdownToBarClose = false;
        if (typeof this.chartSettings.symbolLabelDisplay === 'undefined') this.chartSettings.symbolLabelDisplay = 'Value, line';
        if (typeof this.chartSettings.symbolLabelValue === 'undefined') this.chartSettings.symbolLabelValue = 'Value according to scale';
        if (typeof this.chartSettings.symbolColor === 'undefined') this.chartSettings.symbolColor = '#009688';
        if (typeof this.chartSettings.prevDayCloseDisplay === 'undefined') this.chartSettings.prevDayCloseDisplay = 'Hidden';
        if (typeof this.chartSettings.prevDayColor === 'undefined') this.chartSettings.prevDayColor = '#888888';
        if (typeof this.chartSettings.indicatorsDisplay === 'undefined') this.chartSettings.indicatorsDisplay = 'Value';
        
        // PRICE SCALE section
        section.append('h3')
            .style('margin', '0 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('PRICE SCALE');
        
        // Scale modes
        const scaleModesRow = this.addSettingRow(section);
        scaleModesRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '200px')
            .text('Scale modes (A and L)');
        const scaleModesDropdown = this.addDropdown(scaleModesRow, ['Visible on mouse over', 'Always visible', 'Always invisible'], this.chartSettings.scaleModes);
        scaleModesDropdown.on('change', () => {
            this.chartSettings.scaleModes = scaleModesDropdown.property('value');
            this.scheduleRender();
        });
        
        // Lock price to bar ratio
        const lockRatioRow = this.addSettingRow(section);
        const { input: lockRatioInput } = this.addCheckbox(lockRatioRow, 'Lock price to bar ratio', this.chartSettings.lockPriceToBarRatio);
        lockRatioInput.on('change', () => {
            this.chartSettings.lockPriceToBarRatio = lockRatioInput.property('checked');
            this.scheduleRender();
        });
        const ratioTextInput = this.addTextInput(lockRatioRow, this.chartSettings.priceToBarRatioValue);
        ratioTextInput.on('input', () => {
            this.chartSettings.priceToBarRatioValue = ratioTextInput.property('value');
        });
        
        // Scales placement
        const placementRow = this.addSettingRow(section);
        placementRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '200px')
            .text('Scales placement');
        const placementDropdown = this.addDropdown(placementRow, ['Auto', 'Left', 'Right'], this.chartSettings.scalesPlacement);
        placementDropdown.on('change', () => {
            this.chartSettings.scalesPlacement = placementDropdown.property('value');
            this.scheduleRender();
        });
        
        // PRICE LABELS & LINES section
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('PRICE LABELS & LINES');
        
        // No overlapping labels
        const noOverlapRow = this.addSettingRow(section);
        const { input: noOverlapInput } = this.addCheckbox(noOverlapRow, 'No overlapping labels', this.chartSettings.noOverlappingLabels);
        noOverlapInput.on('change', () => {
            this.chartSettings.noOverlappingLabels = noOverlapInput.property('checked');
            this.scheduleRender();
        });
        
        // Plus button
        const plusBtnRow = this.addSettingRow(section);
        const { input: plusBtnInput } = this.addCheckbox(plusBtnRow, 'Plus button', this.chartSettings.showPlusButton);
        plusBtnInput.on('change', () => {
            this.chartSettings.showPlusButton = plusBtnInput.property('checked');
            this.scheduleRender();
        });
        
        // Countdown to bar close
        const countdownRow = this.addSettingRow(section);
        const { input: countdownInput } = this.addCheckbox(countdownRow, 'Countdown to bar close', this.chartSettings.showCountdownToBarClose);
        countdownInput.on('change', () => {
            this.chartSettings.showCountdownToBarClose = countdownInput.property('checked');
            this.scheduleRender();
        });
        
        // Symbol
        const symbolRow = this.addSettingRow(section);
        symbolRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '200px')
            .text('Symbol');
        const symbolDisplayDropdown = this.addDropdown(symbolRow, ['Value, line', 'Value only', 'Line only'], this.chartSettings.symbolLabelDisplay);
        symbolDisplayDropdown.on('change', () => {
            this.chartSettings.symbolLabelDisplay = symbolDisplayDropdown.property('value');
            this.scheduleRender();
        });
        this.addColorPreview(symbolRow, this.chartSettings.symbolColor, 'symbolColor');
        
        // Second dropdown for symbol
        const symbolRow2 = this.addSettingRow(section);
        symbolRow2.style('padding-left', '220px');
        const symbolValueDropdown = this.addDropdown(symbolRow2, ['Value according to scale', 'Bid and ask', 'Last'], this.chartSettings.symbolLabelValue);
        symbolValueDropdown.on('change', () => {
            this.chartSettings.symbolLabelValue = symbolValueDropdown.property('value');
            this.scheduleRender();
        });
        
        // Previous day close
        const prevDayRow = this.addSettingRow(section);
        prevDayRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '200px')
            .text('Previous day close');
        const prevDayDropdown = this.addDropdown(prevDayRow, ['Hidden', 'Value, line', 'Value only', 'Line only'], this.chartSettings.prevDayCloseDisplay);
        prevDayDropdown.on('change', () => {
            this.chartSettings.prevDayCloseDisplay = prevDayDropdown.property('value');
            this.scheduleRender();
        });
        this.addColorPreview(prevDayRow, this.chartSettings.prevDayColor, 'prevDayColor');
        
        // Indicators and financials
        const indicatorsRow = this.addSettingRow(section);
        indicatorsRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '200px')
            .text('Indicators and financials');
        const indicatorsDropdown = this.addDropdown(indicatorsRow, ['Value', 'Value and name', 'Name only'], this.chartSettings.indicatorsDisplay);
        indicatorsDropdown.on('change', () => {
            this.chartSettings.indicatorsDisplay = indicatorsDropdown.property('value');
            this.scheduleRender();
        });
    }
    
    buildCanvasSettings() {
        const section = this.settingsContent.append('div');
        
        // Initialize settings if not present (already set in constructor)
        if (typeof this.chartSettings.gridPattern === 'undefined') this.chartSettings.gridPattern = 'solid';
        if (typeof this.chartSettings.gridColor === 'undefined') this.chartSettings.gridColor = 'rgba(42, 46, 57, 0.4)';
        if (typeof this.chartSettings.sessionBreaksPattern === 'undefined') this.chartSettings.sessionBreaksPattern = 'solid';
        if (typeof this.chartSettings.crosshairPattern === 'undefined') this.chartSettings.crosshairPattern = 'dashed';
        if (typeof this.chartSettings.watermarkPattern === 'undefined') this.chartSettings.watermarkPattern = 'solid';
        if (typeof this.chartSettings.watermarkColor === 'undefined') this.chartSettings.watermarkColor = 'rgba(120, 123, 134, 0.1)';
        if (typeof this.chartSettings.scaleLinePattern === 'undefined') this.chartSettings.scaleLinePattern = 'solid';
        if (typeof this.chartSettings.scaleTextColor === 'undefined') this.chartSettings.scaleTextColor = '#ffffff';
        if (typeof this.chartSettings.cursorLabelTextColor === 'undefined') this.chartSettings.cursorLabelTextColor = '#d1d4dc';
        if (typeof this.chartSettings.cursorLabelBgColor === 'undefined') this.chartSettings.cursorLabelBgColor = '#363a45';
        if (typeof this.chartSettings.navigationButtonsVisibility === 'undefined') this.chartSettings.navigationButtonsVisibility = 'Visible on mouse over';
        if (typeof this.chartSettings.paneButtonsVisibility === 'undefined') this.chartSettings.paneButtonsVisibility = 'Visible on mouse over';
        
        // CHART BASIC STYLES section
        section.append('h3')
            .style('margin', '0 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('CHART BASIC STYLES');

        // Template
        const templateRow = this.addSettingRow(section);
        templateRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Template');

        const inlineTemplateSelect = templateRow.append('select')
            .attr('class', 'template-selector')
            .style('padding', '8px 32px 8px 12px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#ffffff')
            .style('font-size', '14px')
            .style('cursor', 'default')
            .html(this.getTemplateSelectorOptionsHtml());

        if (this._lastTemplateSelected) {
            inlineTemplateSelect.property('value', this._lastTemplateSelected);
        }

        inlineTemplateSelect.on('change', () => {
            const templateName = inlineTemplateSelect.property('value');
            if (templateName) {
                this._lastTemplateSelected = templateName;
                this.applyTemplate(templateName);
            } else {
                this._lastTemplateSelected = null;
            }
        });
        
        // Background
        const bgRow = this.addSettingRow(section);
        bgRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Background');
        const bgDropdown = this.addDropdown(bgRow, ['Solid', 'Gradient'], this.chartSettings.backgroundStyle);
        bgDropdown.on('change', () => {
            this.chartSettings.backgroundStyle = bgDropdown.property('value');
            this.scheduleRender();
        });
        this.addColorPreview(bgRow, this.chartSettings.backgroundColor, 'backgroundColor');
        
        // Grid lines
        const gridRow = this.addSettingRow(section);
        gridRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Grid lines');
        const gridDropdown = this.addDropdown(gridRow, ['Vert and horz', 'Vertical', 'Horizontal', 'None'], this.chartSettings.gridStyle);
        gridDropdown.on('change', () => {
            this.chartSettings.gridStyle = gridDropdown.property('value');
            this.chartSettings.showGrid = gridDropdown.property('value') !== 'None';
            this.scheduleRender();
        });
        this.addColorPreview(gridRow, this.chartSettings.gridColor, 'gridColor');
        
        // Session breaks
        const sessionRow = this.addSettingRow(section);
        const { input: sessionInput } = this.addCheckbox(sessionRow, 'Session breaks', this.chartSettings.showSessionBreaks);
        sessionInput.on('change', () => {
            this.chartSettings.showSessionBreaks = sessionInput.property('checked');
            this.scheduleRender();
        });
        this.addColorStylePicker(sessionRow, this.chartSettings.sessionBreaksColor, 'sessionBreaksColor');
        
        // Crosshair
        const crosshairRow = this.addSettingRow(section);
        crosshairRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Crosshair');
        this.addColorStylePicker(crosshairRow, this.chartSettings.crosshairColor, 'crosshairColor');
        
        // Watermark
        const watermarkRow = this.addSettingRow(section);
        const { input: watermarkInput } = this.addCheckbox(watermarkRow, 'Watermark', this.chartSettings.showWatermark);
        watermarkInput.on('change', () => {
            this.chartSettings.showWatermark = watermarkInput.property('checked');
            this.scheduleRender();
        });
        this.addColorPreview(watermarkRow, this.chartSettings.watermarkColor, 'watermarkColor');
        
        // SCALES section
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('SCALES');
        
        // Text
        const textRow = this.addSettingRow(section);
        textRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Text');
        this.addColorPreview(textRow, this.chartSettings.scaleTextColor, 'scaleTextColor');
        const textSizeDropdown = this.addDropdown(textRow, ['8', '9', '10', '11', '12', '13', '14'], String(this.chartSettings.scaleTextSize));
        textSizeDropdown.on('change', () => {
            this.chartSettings.scaleTextSize = parseInt(textSizeDropdown.property('value'));
            this.scheduleRender();
        });
        
        // Lines
        const linesRow = this.addSettingRow(section);
        linesRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Lines');
        this.addPatternPicker(linesRow, 'scaleLinePattern', this.chartSettings.scaleLinePattern);
        
        // CURSOR LABELS section (crosshair price/time labels)
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('CURSOR LABELS');
        
        // Cursor label text color
        const cursorTextRow = this.addSettingRow(section);
        cursorTextRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Text');
        this.addColorPreview(cursorTextRow, this.chartSettings.cursorLabelTextColor, 'cursorLabelTextColor');
        
        // Cursor label background color
        const cursorBgRow = this.addSettingRow(section);
        cursorBgRow.append('span')
            .style('font-size', '15px')
            .style('color', '#d1d4dc')
            .style('min-width', '150px')
            .text('Background');
        this.addColorPreview(cursorBgRow, this.chartSettings.cursorLabelBgColor, 'cursorLabelBgColor');
        
        // BUTTONS section
        section.append('h3')
            .style('margin', '32px 0 20px 0')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('color', '#888')
            .style('text-transform', 'uppercase')
            .style('letter-spacing', '0.5px')
            .text('BUTTONS');
        
        // Navigation
        const navRow = this.addSettingRow(section);
        navRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Navigation');
        const navDropdown = this.addDropdown(navRow, ['Visible on mouse over', 'Always visible', 'Always invisible'], this.chartSettings.navigationButtonsVisibility);
        navDropdown.on('change', () => {
            this.chartSettings.navigationButtonsVisibility = navDropdown.property('value');
            this.scheduleRender();
        });
        
        // Pane
        const paneRow = this.addSettingRow(section);
        paneRow.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .style('min-width', '150px')
            .text('Pane');
        const paneDropdown = this.addDropdown(paneRow, ['Visible on mouse over', 'Always visible', 'Always invisible'], this.chartSettings.paneButtonsVisibility);
        paneDropdown.on('change', () => {
            this.chartSettings.paneButtonsVisibility = paneDropdown.property('value');
            this.scheduleRender();
        });
    }
    
    addColorPreview(container, color, setting) {
        const self = this;
        const preview = container.append('div')
            .attr('class', 'settings-color-preview')
            .attr('data-setting', setting)
            .style('width', '40px')
            .style('height', '40px')
            .style('background', color)
            .style('border', '2px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('cursor', 'default')
            .style('transition', 'all 0.2s ease')
            .style('flex-shrink', '0')
            .on('mouseenter', function() {
                d3.select(this).style('border-color', '#2962ff');
            })
            .on('mouseleave', function() {
                d3.select(this).style('border-color', '#e0e0e0');
            })
            .on('click', function(event) {
                event.stopPropagation();
                // Always read current color from settings
                const currentColor = self.chartSettings[setting] || color;
                self.showColorPalettePopup(d3.select(this), currentColor, (newColor) => {
                    d3.select(this).style('background', newColor);
                    // Apply to main chart settings (for UI consistency)
                    self.chartSettings[setting] = newColor;
                    // Apply to target chart (panel that opened settings)
                    self.applyChartSettings(setting, newColor);
                });
            });
    }
    
    showColorPalettePopup(previewElement, currentColor, onChange) {
        // Remove any existing palette
        d3.selectAll('.floating-color-palette').remove();
        
        // Parse current color for opacity
        let baseColor = currentColor;
        let opacity = 1;
        if (currentColor && currentColor.startsWith('rgba')) {
            const match = currentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                opacity = match[4] ? parseFloat(match[4]) : 1;
                baseColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
            }
        }
        
        const palette = d3.select('body').append('div')
            .attr('class', 'floating-color-palette')
            .style('position', 'fixed')
            .style('padding', '16px')
            .style('background', '#2a2e39')
            .style('border-radius', '8px')
            .style('z-index', '10002')
            .style('box-shadow', '0 8px 24px rgba(0,0,0,0.35)')
            .style('min-width', '280px');
        
        const rect = previewElement.node().getBoundingClientRect();
        let left = rect.right + 10;
        let top = rect.top;
        
        // Adjust if off-screen
        if (left + 300 > window.innerWidth) left = rect.left - 300;
        if (top + 400 > window.innerHeight) top = window.innerHeight - 410;
        
        palette.style('left', left + 'px').style('top', top + 'px');
        
        const colors = [
            ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'],
            ['#FF4444', '#FF9500', '#FFEB3B', '#4CAF50', '#00BCD4', '#00E5FF', '#2962FF', '#7B68EE', '#E040FB', '#FF4081'],
            ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#B2F5FF', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
            ['#FFAB91', '#FFCC80', '#FFF59D', '#A5D6A7', '#80DEEA', '#80E5FF', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'],
            ['#FF8A65', '#FFB74D', '#FFF176', '#81C784', '#4DD0E1', '#4DD5FF', '#64B5F6', '#9575CD', '#BA68C8', '#F06292'],
            ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#26C6DA', '#26D4FF', '#42A5F5', '#7E57C2', '#AB47BC', '#EC407A'],
            ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#00B8D4', '#1E88E5', '#5E35B1', '#8E24AA', '#D81B60'],
            ['#C62828', '#E65100', '#F57F17', '#2E7D32', '#00838F', '#00838F', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457']
        ];
        
        // Color grid
        const grid = palette.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(10, 1fr)')
            .style('gap', '4px');
        
        const updateSelectedSwatch = () => {
            grid.selectAll('.color-swatch').each(function() {
                const swatch = d3.select(this);
                const swatchColor = swatch.attr('data-color').toUpperCase();
                const currentBaseUpper = baseColor.toUpperCase();
                if (swatchColor === currentBaseUpper) {
                    swatch.style('border', '2px solid #ffffff').style('box-shadow', '0 0 0 1px #2a2e39');
                } else {
                    swatch.style('border', '2px solid transparent').style('box-shadow', 'none');
                }
            });
        };
        
        const updateOpacityGradient = () => {
            const hex = baseColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            opacitySlider.style('background', `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1))`);
        };
        
        const applyColor = () => {
            const hex = baseColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const finalColor = opacity < 1 ? `rgba(${r},${g},${b},${opacity})` : baseColor;
            onChange(finalColor);
            previewElement.style('background', finalColor);
            opacityValue.text(Math.round(opacity * 100) + '%');
        };
        
        colors.forEach(row => {
            row.forEach(color => {
                grid.append('div')
                    .attr('class', 'color-swatch')
                    .attr('data-color', color)
                    .style('width', '22px')
                    .style('height', '22px')
                    .style('background', color)
                    .style('border-radius', '3px')
                    .style('cursor', 'default')
                    .style('border', '2px solid transparent')
                    .style('transition', 'all 0.15s ease')
                    .on('mouseenter', function() {
                        d3.select(this).style('transform', 'scale(1.1)').style('border-color', '#ffffff');
                    })
                    .on('mouseleave', function() {
                        d3.select(this).style('transform', 'scale(1)');
                        updateSelectedSwatch();
                    })
                    .on('click', function() {
                        baseColor = color;
                        updateSelectedSwatch();
                        updateOpacityGradient();
                        applyColor();
                    });
            });
        });
        
        // Divider
        palette.append('div')
            .style('height', '1px')
            .style('background', '#3a3e49')
            .style('margin', '12px 0');
        
        // Recent colors row
        const recentRow = palette.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '6px');
        
        const recentColors = ['#131722', '#2962FF', '#1E3A5F', '#262B3E'];
        recentColors.forEach(color => {
            recentRow.append('div')
                .style('width', '22px')
                .style('height', '22px')
                .style('background', color)
                .style('border-radius', '3px')
                .style('cursor', 'default')
                .style('border', '2px solid transparent')
                .on('mouseenter', function() { d3.select(this).style('border-color', '#ffffff'); })
                .on('mouseleave', function() { d3.select(this).style('border-color', 'transparent'); })
                .on('click', function() {
                    baseColor = color;
                    updateSelectedSwatch();
                    updateOpacityGradient();
                    applyColor();
                });
        });
        
        // Add custom color button
        recentRow.append('div')
            .style('width', '22px')
            .style('height', '22px')
            .style('background', '#3a3e49')
            .style('border', '1px dashed #5a5e69')
            .style('border-radius', '3px')
            .style('cursor', 'default')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('color', '#8a8e99')
            .style('font-size', '16px')
            .text('+')
            .on('mouseenter', function() { d3.select(this).style('background', '#4a4e59').style('color', '#ffffff'); })
            .on('mouseleave', function() { d3.select(this).style('background', '#3a3e49').style('color', '#8a8e99'); })
            .on('click', function() {
                const input = document.createElement('input');
                input.type = 'color';
                input.value = baseColor;
                input.style.position = 'absolute';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.addEventListener('input', (e) => {
                    baseColor = e.target.value;
                    updateSelectedSwatch();
                    updateOpacityGradient();
                    applyColor();
                });
                input.click();
                setTimeout(() => document.body.removeChild(input), 5000);
            });
        
        // Opacity section
        const opacitySection = palette.append('div')
            .style('margin-top', '12px');
        
        opacitySection.append('div')
            .style('color', '#8a8e99')
            .style('font-size', '12px')
            .style('margin-bottom', '8px')
            .text('Opacity');
        
        const opacityControl = opacitySection.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '12px');
        
        const opacitySlider = opacityControl.append('input')
            .attr('type', 'range')
            .attr('min', '0')
            .attr('max', '100')
            .attr('value', Math.round(opacity * 100))
            .style('flex', '1')
            .style('-webkit-appearance', 'none')
            .style('height', '6px')
            .style('border-radius', '3px')
            .style('outline', 'none')
            .style('cursor', 'default')
            .on('input', function() {
                opacity = parseInt(this.value) / 100;
                applyColor();
            });
        
        const opacityValue = opacityControl.append('span')
            .style('color', '#d1d4dc')
            .style('font-size', '12px')
            .style('min-width', '40px')
            .style('text-align', 'right')
            .text(Math.round(opacity * 100) + '%');
        
        // Add slider thumb styles
        const styleId = 'color-picker-slider-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .floating-color-palette input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                .floating-color-palette input[type="range"]::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Initialize
        updateSelectedSwatch();
        updateOpacityGradient();
        
        // Close on click outside
        setTimeout(() => {
            d3.select('body').on('click.paletteClose', function(event) {
                if (!event.target.closest('.floating-color-palette')) {
                    palette.remove();
                    d3.select('body').on('click.paletteClose', null);
                }
            });
        }, 100);
    }
    
    addSettingRow(container) {
        return container.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'space-between')
            .style('padding', '12px 0')
            .style('border-bottom', '1px solid #f0f0f0')
            .style('gap', '12px');
    }
    
    addCheckbox(container, label, checked) {
        const wrapper = container.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '10px');
        
        const input = wrapper.append('input')
            .attr('type', 'checkbox')
            .property('checked', checked)  // Use .property() instead of .attr() for dynamic updates
            .style('width', '20px')
            .style('height', '20px')
            .style('cursor', 'default')
            .style('accent-color', '#2962ff');
        
        wrapper.append('span')
            .style('font-size', '15px')
            .style('color', '#131722')
            .text(label);
        
        // Return both wrapper and input for flexibility
        return { wrapper, input };
    }
    
    addCheckboxRow(container, label, checked) {
        const row = this.addSettingRow(container);
        this.addCheckbox(row, label, checked);
    }
    
    addDropdown(container, options, selected) {
        const select = container.append('select')
            .style('padding', '8px 32px 8px 12px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#ffffff')
            .style('color', '#131722')
            .style('font-size', '14px')
            .style('cursor', 'default')
            .style('min-width', '200px')
            .style('outline', 'none');
        
        options.forEach(opt => {
            select.append('option')
                .attr('value', opt)
                .attr('selected', opt === selected ? true : null)
                .text(opt);
        });
        
        return select;
    }
    
    addTextInput(container, value) {
        return container.append('input')
            .attr('type', 'text')
            .attr('value', value)
            .style('padding', '8px 12px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#f7f7f7')
            .style('color', '#888')
            .style('font-size', '14px')
            .style('width', '200px')
            .style('outline', 'none');
    }
    
    addSliderControl(container, value) {
        const sliderWrapper = container.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '12px')
            .style('flex', '1')
            .style('max-width', '300px');
        
        const slider = sliderWrapper.append('input')
            .attr('type', 'range')
            .attr('min', '0')
            .attr('max', '100')
            .attr('value', value)
            .style('flex', '1')
            .style('height', '6px')
            .style('border-radius', '3px')
            .style('outline', 'none')
            .style('cursor', 'default')
            .style('background', 'linear-gradient(to right, #e0e0e0 0%, #e0e0e0 50%, #2962ff 50%, #2962ff 100%)');
        
        return slider;
    }
    
    addColorStylePicker(container, color, setting) {
        const wrapper = container.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .style('padding', '8px 12px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', '#ffffff')
            .style('cursor', 'default')
            .style('transition', 'all 0.2s ease')
            .on('mouseenter', function() {
                d3.select(this).style('border-color', '#2962ff');
            })
            .on('mouseleave', function() {
                d3.select(this).style('border-color', '#e0e0e0');
            });
        
        const colorPreview = wrapper.append('div')
            .style('width', '32px')
            .style('height', '32px')
            .style('background', color)
            .style('border-radius', '4px');
        
        const lineStyle = wrapper.append('span')
            .style('color', '#888')
            .style('font-size', '18px')
            .text('----');
        
        // Add click handler to open color palette
        if (setting) {
            wrapper.on('click', () => {
                this.showColorPalettePopup(wrapper, color, (newColor) => {
                    colorPreview.style('background', newColor);
                    this.chartSettings[setting] = newColor;
                    this.scheduleRender();
                });
            });
        }
        
        return wrapper;
    }
    
    addPatternPicker(container, setting, currentValue) {
        const patterns = [
            { name: 'Solid', value: 'solid', style: 'background: #2962ff' },
            { name: 'Dashed', value: 'dashed', style: 'repeating-linear-gradient(90deg, #2962ff 0px, #2962ff 8px, transparent 8px, transparent 12px)' },
            { name: 'Dotted', value: 'dotted', style: 'repeating-linear-gradient(90deg, #2962ff 0px, #2962ff 3px, transparent 3px, transparent 6px)' }
        ];
        
        const currentPattern = patterns.find(p => p.value === currentValue) || patterns[0];
        
        const picker = container.append('div')
            .style('width', '40px')
            .style('height', '40px')
            .style('border', '1px solid #e0e0e0')
            .style('border-radius', '6px')
            .style('background', currentPattern.style)
            .style('cursor', 'default')
            .style('transition', 'all 0.2s ease')
            .on('mouseenter', function() {
                d3.select(this).style('border-color', '#2962ff');
            })
            .on('mouseleave', function() {
                d3.select(this).style('border-color', '#e0e0e0');
            });
        
        // Add click handler to cycle through patterns
        if (setting) {
            picker.on('click', () => {
                const currentIdx = patterns.findIndex(p => p.value === (this.chartSettings[setting] || 'solid'));
                const nextIdx = (currentIdx + 1) % patterns.length;
                const nextPattern = patterns[nextIdx];
                this.chartSettings[setting] = nextPattern.value;
                picker.style('background', nextPattern.style);
                this.scheduleRender();
            });
        }
        
        return picker;
    }
    
    showSettingsMenu(x, y) {
        // For panels, use the main chart's settings modal but track the source chart
        if (this.isPanel && window.chart && window.chart.settingsModal) {
            // Store reference to the panel that opened settings
            window.chart._settingsSourceChart = this;
            window.chart.settingsModal.style('display', 'flex');
            window.chart.showSettingsCategory('candles');
        } else if (this.settingsModal) {
            // Main chart opens its own settings
            this._settingsSourceChart = this;
            this.settingsModal.style('display', 'flex');
            this.showSettingsCategory('candles');
        }
    }
    
    hideSettingsMenu() {
        // Reset pending template
        this._pendingTemplate = null;
        
        // For panels, hide the main chart's settings modal
        if (this.isPanel && window.chart && window.chart.settingsModal) {
            window.chart.settingsModal.style('display', 'none');
        } else if (this.settingsModal) {
            this.settingsModal.style('display', 'none');
        }
    }
    
    applyChartSettings(settingKey = null, settingValue = null) {
        // Determine which chart to apply settings to
        const targetChart = this._settingsSourceChart || this;
        
        // If a specific setting was changed, only apply that to the target chart
        if (settingKey && settingValue !== null && targetChart !== this) {
            targetChart.chartSettings[settingKey] = settingValue;
        }
        
        // Apply background color to target chart
        targetChart.canvas.style.backgroundColor = targetChart.chartSettings.backgroundColor;
        
        // Only update container background for main chart
        if (!targetChart.isPanel) {
            const chartContainer = document.querySelector('.chart-container');
            if (chartContainer) {
                chartContainer.style.backgroundColor = targetChart.chartSettings.backgroundColor;
            }
        }
        
        // Apply crosshair colors (lines)
        const container = targetChart.isPanel ? targetChart.canvas.parentElement : document;
        const vLine = container.querySelector('.crosshair-vertical');
        const hLine = container.querySelector('.crosshair-horizontal');
        if (vLine) vLine.style.background = targetChart.chartSettings.crosshairColor;
        if (hLine) hLine.style.background = targetChart.chartSettings.crosshairColor;
        
        // Apply cursor label colors (price/time labels on crosshair)
        const priceLabel = container.querySelector('.price-label');
        const timeLabel = container.querySelector('.time-label');
        if (priceLabel) {
            priceLabel.style.color = targetChart.chartSettings.cursorLabelTextColor;
            priceLabel.style.background = targetChart.chartSettings.cursorLabelBgColor;
        }
        if (timeLabel) {
            timeLabel.style.color = targetChart.chartSettings.cursorLabelTextColor;
            timeLabel.style.background = targetChart.chartSettings.cursorLabelBgColor;
        }
        
        // Apply symbol/OHLC text color
        const ohlcInfo = container.querySelector('.ohlc-info');
        if (ohlcInfo) {
            // Apply to symbol text
            const symbolText = ohlcInfo.querySelector('.ohlc-symbol-text');
            if (symbolText) symbolText.style.color = targetChart.chartSettings.symbolTextColor;
            
            // Apply to OHLC labels and values
            ohlcInfo.querySelectorAll('.ohlc-label, .ohlc-value, .ohlc-change').forEach(el => {
                el.style.color = targetChart.chartSettings.symbolTextColor;
            });
            ohlcInfo.querySelectorAll('.ohlc-separator').forEach(el => {
                el.style.color = targetChart.chartSettings.symbolTextColor;
            });
            
            // Apply to timeframe text
            const timeframeText = ohlcInfo.querySelector('#chartTimeframe');
            if (timeframeText) timeframeText.style.color = targetChart.chartSettings.symbolTextColor;
            
            // Apply to Volume label
            const volumeLabel = ohlcInfo.querySelector('.volume-label');
            if (volumeLabel) volumeLabel.style.color = targetChart.chartSettings.symbolTextColor;
            
            // Apply to volume value
            const volumeValue = ohlcInfo.querySelector('.volume-value');
            if (volumeValue) volumeValue.style.color = targetChart.chartSettings.symbolTextColor;
        }
        
        // Re-render target chart to apply all settings
        targetChart.scheduleRender();

        // Apply Status Line visibility AFTER render (setTimeout ensures it runs after scheduleRender pipeline)
        const _tc = targetChart;
        const _idSuffix = (_tc.panelIndex !== undefined) ? _tc.panelIndex : '';
        setTimeout(function() {
            const el = document.getElementById('ohlcInfo' + _idSuffix) || document.querySelector('.ohlc-info');
            if (!el) return;
            const cs = _tc.chartSettings;

            const ohlcStats = el.querySelector('.ohlc-stats');
            if (ohlcStats) ohlcStats.style.display = cs.showChartValues !== false ? '' : 'none';

            const chartChangeEl = el.querySelector('#chartChange' + _idSuffix) || el.querySelector('.ohlc-change');
            if (chartChangeEl) chartChangeEl.style.display = cs.showBarChangeValues !== false ? '' : 'none';

            const symbolBlock = el.querySelector('.ohlc-symbol-block');
            if (symbolBlock) symbolBlock.style.display = cs.symbolTitle !== false ? '' : 'none';

            const ohlcIndicatorsEl = el.querySelector('#ohlcIndicators' + _idSuffix) || el.querySelector('#ohlcIndicators');
            if (ohlcIndicatorsEl) ohlcIndicatorsEl.style.display = cs.showIndicatorTitles !== false ? '' : 'none';
        }, 0);
        
        // Save panel-specific settings
        if (targetChart.isPanel && targetChart.panelIndex !== undefined && window.panelManager) {
            window.panelManager.savePanelSettings(targetChart.panelIndex);
        }
    }
    
    // Chart Templates
    getTemplateSelectorOptionsHtml() {
        let customOptions = '';
        const userTemplates = this.getUserChartTemplates();
        if (userTemplates && Object.keys(userTemplates).length) {
            customOptions += '<optgroup label="Custom">';
            Object.keys(userTemplates).forEach((id) => {
                const t = userTemplates[id];
                const label = (t && t.name) ? t.name : id;
                customOptions += `<option value="user:${id}">${label}</option>`;
            });
            customOptions += '</optgroup>';
        }

        return `
            <option value="">— Select Template —</option>
            ${customOptions}
            <optgroup label="Professional">
                <option value="tradingview-dark">TradingView Dark</option>
                <option value="tradingview-light">TradingView Light</option>
                <option value="binance">Binance</option>
                <option value="bloomberg">Bloomberg</option>
            </optgroup>
            <optgroup label="Dark Themes">
                <option value="classic-dark">Classic Dark</option>
                <option value="night-blue">Night Blue</option>
                <option value="midnight">Midnight Purple</option>
                <option value="crypto-green">Crypto Green</option>
                <option value="ocean">Ocean</option>
                <option value="gold">Gold Finance</option>
                <option value="forest">Forest</option>
            </optgroup>
            <optgroup label="Light Themes">
                <option value="sepia">Sepia Vintage</option>
                <option value="arctic">Arctic Ice</option>
                <option value="monochrome">Monochrome</option>
            </optgroup>
            <optgroup label="Creative">
                <option value="matrix">Matrix</option>
                <option value="neon">Neon Glow</option>
                <option value="sunset">Sunset</option>
                <option value="candy">Candy</option>
                <option value="blood">Blood Red</option>
                <option value="high-contrast">High Contrast</option>
            </optgroup>
        `;
    }

    getUserChartTemplates() {
        try {
            const raw = localStorage.getItem('chart_user_templates');
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed;
        } catch (e) {
            return {};
        }
    }

    saveUserChartTemplates(templates) {
        try {
            localStorage.setItem('chart_user_templates', JSON.stringify(templates || {}));
        } catch (e) {
        }
    }

    getCurrentChartColorTemplateSnapshot(name = 'Custom') {
        const keys = [
            'backgroundColor',
            'gridColor',
            'scaleTextColor',
            'scaleLinesColor',
            'symbolTextColor',
            'crosshairColor',
            'cursorLabelTextColor',
            'cursorLabelBgColor',
            'bodyUpColor',
            'bodyDownColor',
            'borderUpColor',
            'borderDownColor',
            'wickUpColor',
            'wickDownColor',
            'volumeUpColor',
            'volumeDownColor'
        ];

        const snapshot = { name: name };
        keys.forEach((k) => {
            if (this.chartSettings && typeof this.chartSettings[k] !== 'undefined') {
                snapshot[k] = this.chartSettings[k];
            }
        });
        return snapshot;
    }

    saveUserChartTemplate(templateName) {
        const name = (templateName || '').trim();
        if (!name) return null;

        const templates = this.getUserChartTemplates();

        const base = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'custom';

        let id = base;
        let i = 2;
        while (templates[id]) {
            id = `${base}-${i}`;
            i++;
        }

        templates[id] = this.getCurrentChartColorTemplateSnapshot(name);
        this.saveUserChartTemplates(templates);
        return `user:${id}`;
    }

    getChartTemplates() {
        return {
            'tradingview-dark': {
                name: 'TradingView Dark',
                backgroundColor: '#1e222d',
                gridColor: 'rgba(42, 46, 57, 0.6)',
                bodyUpColor: '#089981',
                bodyDownColor: '#f23645',
                borderUpColor: '#089981',
                borderDownColor: '#f23645',
                wickUpColor: '#089981',
                wickDownColor: '#f23645',
                scaleTextColor: '#d1d4dc',
                scaleLinesColor: '#050028',
                symbolTextColor: '#d1d4dc',
                crosshairColor: 'rgba(120, 123, 134, 0.4)',
                cursorLabelTextColor: '#d1d4dc',
                cursorLabelBgColor: '#434651',
                volumeUpColor: 'rgba(8, 153, 129, 0.5)',
                volumeDownColor: 'rgba(242, 54, 69, 0.5)'
            },
            'tradingview-light': {
                name: 'TradingView Light',
                backgroundColor: '#ffffff',
                gridColor: 'rgba(42, 46, 57, 0.1)',
                bodyUpColor: '#089981',
                bodyDownColor: '#f23645',
                borderUpColor: '#089981',
                borderDownColor: '#f23645',
                wickUpColor: '#089981',
                wickDownColor: '#f23645',
                scaleTextColor: '#131722',
                scaleLinesColor: '#f0f3fa',
                symbolTextColor: '#131722',
                crosshairColor: 'rgba(120, 123, 134, 0.3)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#131722',
                volumeUpColor: 'rgba(8, 153, 129, 0.5)',
                volumeDownColor: 'rgba(242, 54, 69, 0.5)'
            },
            'classic-dark': {
                name: 'Classic Dark',
                backgroundColor: '#050028',
                gridColor: 'rgba(255, 255, 255, 0.06)',
                bodyUpColor: '#26a69a',
                bodyDownColor: '#ef5350',
                borderUpColor: '#26a69a',
                borderDownColor: '#ef5350',
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
                scaleTextColor: '#d1d4dc',
                symbolTextColor: '#d1d4dc',
                crosshairColor: 'rgba(255, 255, 255, 0.3)',
                cursorLabelTextColor: '#d1d4dc',
                cursorLabelBgColor: '#2a2e39',
                volumeUpColor: 'rgba(38, 166, 154, 0.5)',
                volumeDownColor: 'rgba(239, 83, 80, 0.5)'
            },
            'night-blue': {
                name: 'Night Blue',
                backgroundColor: '#0d1421',
                gridColor: 'rgba(33, 150, 243, 0.1)',
                bodyUpColor: '#00e676',
                bodyDownColor: '#ff5252',
                borderUpColor: '#00e676',
                borderDownColor: '#ff5252',
                wickUpColor: '#00e676',
                wickDownColor: '#ff5252',
                scaleTextColor: '#90caf9',
                symbolTextColor: '#90caf9',
                crosshairColor: 'rgba(33, 150, 243, 0.4)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#1565c0',
                volumeUpColor: 'rgba(0, 230, 118, 0.4)',
                volumeDownColor: 'rgba(255, 82, 82, 0.4)'
            },
            'crypto-green': {
                name: 'Crypto Green',
                backgroundColor: '#0a1f1a',
                gridColor: 'rgba(0, 230, 118, 0.08)',
                bodyUpColor: '#00e676',
                bodyDownColor: '#ff1744',
                borderUpColor: '#00e676',
                borderDownColor: '#ff1744',
                wickUpColor: '#00e676',
                wickDownColor: '#ff1744',
                scaleTextColor: '#a5d6a7',
                symbolTextColor: '#a5d6a7',
                crosshairColor: 'rgba(0, 230, 118, 0.3)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#1b5e20',
                volumeUpColor: 'rgba(0, 230, 118, 0.4)',
                volumeDownColor: 'rgba(255, 23, 68, 0.4)'
            },
            'ocean': {
                name: 'Ocean',
                backgroundColor: '#0a1929',
                gridColor: 'rgba(0, 188, 212, 0.1)',
                bodyUpColor: '#00bcd4',
                bodyDownColor: '#ff6e40',
                borderUpColor: '#00bcd4',
                borderDownColor: '#ff6e40',
                wickUpColor: '#00bcd4',
                wickDownColor: '#ff6e40',
                scaleTextColor: '#b3e5fc',
                symbolTextColor: '#b3e5fc',
                crosshairColor: 'rgba(0, 188, 212, 0.4)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#006064',
                volumeUpColor: 'rgba(0, 188, 212, 0.4)',
                volumeDownColor: 'rgba(255, 110, 64, 0.4)'
            },
            'midnight': {
                name: 'Midnight Purple',
                backgroundColor: '#1a1a2e',
                gridColor: 'rgba(156, 39, 176, 0.1)',
                bodyUpColor: '#7c4dff',
                bodyDownColor: '#ff4081',
                borderUpColor: '#7c4dff',
                borderDownColor: '#ff4081',
                wickUpColor: '#7c4dff',
                wickDownColor: '#ff4081',
                scaleTextColor: '#ce93d8',
                symbolTextColor: '#ce93d8',
                crosshairColor: 'rgba(156, 39, 176, 0.4)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#4a148c',
                volumeUpColor: 'rgba(124, 77, 255, 0.4)',
                volumeDownColor: 'rgba(255, 64, 129, 0.4)'
            },
            'high-contrast': {
                name: 'High Contrast',
                backgroundColor: '#000000',
                gridColor: 'rgba(255, 255, 255, 0.15)',
                bodyUpColor: '#00ff00',
                bodyDownColor: '#ff0000',
                borderUpColor: '#00ff00',
                borderDownColor: '#ff0000',
                wickUpColor: '#00ff00',
                wickDownColor: '#ff0000',
                scaleTextColor: '#ffffff',
                symbolTextColor: '#ffffff',
                crosshairColor: 'rgba(255, 255, 255, 0.5)',
                cursorLabelTextColor: '#000000',
                cursorLabelBgColor: '#ffffff',
                volumeUpColor: 'rgba(0, 255, 0, 0.5)',
                volumeDownColor: 'rgba(255, 0, 0, 0.5)'
            },
            'matrix': {
                name: 'Matrix',
                backgroundColor: '#0d0d0d',
                gridColor: 'rgba(0, 255, 65, 0.08)',
                bodyUpColor: '#00ff41',
                bodyDownColor: '#003b00',
                borderUpColor: '#00ff41',
                borderDownColor: '#00ff41',
                wickUpColor: '#00ff41',
                wickDownColor: '#00ff41',
                scaleTextColor: '#00ff41',
                symbolTextColor: '#00ff41',
                crosshairColor: 'rgba(0, 255, 65, 0.4)',
                cursorLabelTextColor: '#000000',
                cursorLabelBgColor: '#00ff41',
                volumeUpColor: 'rgba(0, 255, 65, 0.5)',
                volumeDownColor: 'rgba(0, 100, 30, 0.5)'
            },
            'sepia': {
                name: 'Sepia Vintage',
                backgroundColor: '#f5f0e1',
                gridColor: 'rgba(139, 119, 101, 0.2)',
                bodyUpColor: '#5d4e37',
                bodyDownColor: '#8b4513',
                borderUpColor: '#5d4e37',
                borderDownColor: '#8b4513',
                wickUpColor: '#5d4e37',
                wickDownColor: '#8b4513',
                scaleTextColor: '#6b5344',
                symbolTextColor: '#3d2914',
                crosshairColor: 'rgba(139, 119, 101, 0.4)',
                cursorLabelTextColor: '#f5f0e1',
                cursorLabelBgColor: '#5d4e37',
                volumeUpColor: 'rgba(93, 78, 55, 0.5)',
                volumeDownColor: 'rgba(139, 69, 19, 0.5)'
            },
            'neon': {
                name: 'Neon Glow',
                backgroundColor: '#0a0a0a',
                gridColor: 'rgba(255, 0, 255, 0.1)',
                bodyUpColor: '#00ffff',
                bodyDownColor: '#ff00ff',
                borderUpColor: '#00ffff',
                borderDownColor: '#ff00ff',
                wickUpColor: '#00ffff',
                wickDownColor: '#ff00ff',
                scaleTextColor: '#ff00ff',
                symbolTextColor: '#00ffff',
                crosshairColor: 'rgba(255, 255, 0, 0.4)',
                cursorLabelTextColor: '#000000',
                cursorLabelBgColor: '#ffff00',
                volumeUpColor: 'rgba(0, 255, 255, 0.5)',
                volumeDownColor: 'rgba(255, 0, 255, 0.5)'
            },
            'sunset': {
                name: 'Sunset',
                backgroundColor: '#1a1a2e',
                gridColor: 'rgba(255, 107, 107, 0.1)',
                bodyUpColor: '#ffd93d',
                bodyDownColor: '#ff6b6b',
                borderUpColor: '#ffd93d',
                borderDownColor: '#ff6b6b',
                wickUpColor: '#ffd93d',
                wickDownColor: '#ff6b6b',
                scaleTextColor: '#f8b500',
                symbolTextColor: '#ffeaa7',
                crosshairColor: 'rgba(255, 107, 107, 0.4)',
                cursorLabelTextColor: '#1a1a2e',
                cursorLabelBgColor: '#ffd93d',
                volumeUpColor: 'rgba(255, 217, 61, 0.5)',
                volumeDownColor: 'rgba(255, 107, 107, 0.5)'
            },
            'arctic': {
                name: 'Arctic Ice',
                backgroundColor: '#e8f4f8',
                gridColor: 'rgba(0, 150, 199, 0.15)',
                bodyUpColor: '#0096c7',
                bodyDownColor: '#023e8a',
                borderUpColor: '#0096c7',
                borderDownColor: '#023e8a',
                wickUpColor: '#0096c7',
                wickDownColor: '#023e8a',
                scaleTextColor: '#0077b6',
                symbolTextColor: '#03045e',
                crosshairColor: 'rgba(0, 150, 199, 0.4)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#0077b6',
                volumeUpColor: 'rgba(0, 150, 199, 0.5)',
                volumeDownColor: 'rgba(2, 62, 138, 0.5)'
            },
            'gold': {
                name: 'Gold Finance',
                backgroundColor: '#1c1c1c',
                gridColor: 'rgba(212, 175, 55, 0.1)',
                bodyUpColor: '#d4af37',
                bodyDownColor: '#8b0000',
                borderUpColor: '#d4af37',
                borderDownColor: '#8b0000',
                wickUpColor: '#d4af37',
                wickDownColor: '#8b0000',
                scaleTextColor: '#d4af37',
                symbolTextColor: '#ffd700',
                crosshairColor: 'rgba(212, 175, 55, 0.4)',
                cursorLabelTextColor: '#1c1c1c',
                cursorLabelBgColor: '#d4af37',
                volumeUpColor: 'rgba(212, 175, 55, 0.5)',
                volumeDownColor: 'rgba(139, 0, 0, 0.5)'
            },
            'forest': {
                name: 'Forest',
                backgroundColor: '#1a2f1a',
                gridColor: 'rgba(34, 139, 34, 0.15)',
                bodyUpColor: '#90ee90',
                bodyDownColor: '#8b4513',
                borderUpColor: '#90ee90',
                borderDownColor: '#8b4513',
                wickUpColor: '#90ee90',
                wickDownColor: '#8b4513',
                scaleTextColor: '#90ee90',
                symbolTextColor: '#98fb98',
                crosshairColor: 'rgba(144, 238, 144, 0.4)',
                cursorLabelTextColor: '#1a2f1a',
                cursorLabelBgColor: '#90ee90',
                volumeUpColor: 'rgba(144, 238, 144, 0.5)',
                volumeDownColor: 'rgba(139, 69, 19, 0.5)'
            },
            'candy': {
                name: 'Candy',
                backgroundColor: '#2d1b4e',
                gridColor: 'rgba(255, 105, 180, 0.1)',
                bodyUpColor: '#ff69b4',
                bodyDownColor: '#00ced1',
                borderUpColor: '#ff69b4',
                borderDownColor: '#00ced1',
                wickUpColor: '#ff69b4',
                wickDownColor: '#00ced1',
                scaleTextColor: '#ff69b4',
                symbolTextColor: '#ffc0cb',
                crosshairColor: 'rgba(255, 105, 180, 0.4)',
                cursorLabelTextColor: '#2d1b4e',
                cursorLabelBgColor: '#ff69b4',
                volumeUpColor: 'rgba(255, 105, 180, 0.5)',
                volumeDownColor: 'rgba(0, 206, 209, 0.5)'
            },
            'monochrome': {
                name: 'Monochrome',
                backgroundColor: '#ffffff',
                gridColor: 'rgba(0, 0, 0, 0.1)',
                bodyUpColor: '#333333',
                bodyDownColor: '#999999',
                borderUpColor: '#333333',
                borderDownColor: '#999999',
                wickUpColor: '#333333',
                wickDownColor: '#999999',
                scaleTextColor: '#666666',
                symbolTextColor: '#000000',
                crosshairColor: 'rgba(0, 0, 0, 0.3)',
                cursorLabelTextColor: '#ffffff',
                cursorLabelBgColor: '#333333',
                volumeUpColor: 'rgba(51, 51, 51, 0.5)',
                volumeDownColor: 'rgba(153, 153, 153, 0.5)'
            },
            'blood': {
                name: 'Blood Red',
                backgroundColor: '#1a0a0a',
                gridColor: 'rgba(139, 0, 0, 0.15)',
                bodyUpColor: '#ff0000',
                bodyDownColor: '#8b0000',
                borderUpColor: '#ff0000',
                borderDownColor: '#8b0000',
                wickUpColor: '#ff0000',
                wickDownColor: '#8b0000',
                scaleTextColor: '#ff4444',
                symbolTextColor: '#ff6666',
                crosshairColor: 'rgba(255, 0, 0, 0.4)',
                cursorLabelTextColor: '#1a0a0a',
                cursorLabelBgColor: '#ff0000',
                volumeUpColor: 'rgba(255, 0, 0, 0.5)',
                volumeDownColor: 'rgba(139, 0, 0, 0.5)'
            },
            'binance': {
                name: 'Binance',
                backgroundColor: '#0b0e11',
                gridColor: 'rgba(71, 77, 87, 0.3)',
                bodyUpColor: '#0ecb81',
                bodyDownColor: '#f6465d',
                borderUpColor: '#0ecb81',
                borderDownColor: '#f6465d',
                wickUpColor: '#0ecb81',
                wickDownColor: '#f6465d',
                scaleTextColor: '#848e9c',
                symbolTextColor: '#eaecef',
                crosshairColor: 'rgba(234, 236, 239, 0.3)',
                cursorLabelTextColor: '#0b0e11',
                cursorLabelBgColor: '#f0b90b',
                volumeUpColor: 'rgba(14, 203, 129, 0.5)',
                volumeDownColor: 'rgba(246, 70, 93, 0.5)'
            },
            'bloomberg': {
                name: 'Bloomberg',
                backgroundColor: '#000000',
                gridColor: 'rgba(255, 136, 0, 0.1)',
                bodyUpColor: '#00ff00',
                bodyDownColor: '#ff0000',
                borderUpColor: '#00ff00',
                borderDownColor: '#ff0000',
                wickUpColor: '#00ff00',
                wickDownColor: '#ff0000',
                scaleTextColor: '#ff8800',
                symbolTextColor: '#ff8800',
                crosshairColor: 'rgba(255, 136, 0, 0.4)',
                cursorLabelTextColor: '#000000',
                cursorLabelBgColor: '#ff8800',
                volumeUpColor: 'rgba(0, 255, 0, 0.5)',
                volumeDownColor: 'rgba(255, 0, 0, 0.5)'
            }
        };
    }
    
    applyTemplate(templateName) {
        let template = null;
        let resolvedName = templateName;

        if (templateName && typeof templateName === 'string' && templateName.startsWith('user:')) {
            const id = templateName.slice(5);
            const userTemplates = this.getUserChartTemplates();
            template = userTemplates ? userTemplates[id] : null;
        } else {
            const templates = this.getChartTemplates();
            template = templates ? templates[templateName] : null;
        }

        if (!template) {
            console.warn('Template not found:', templateName);
            return;
        }

        this._lastTemplateSelected = resolvedName;

        // Apply all template settings to chartSettings
        Object.keys(template).forEach(key => {
            if (key !== 'name') {
                this.chartSettings[key] = template[key];
            }
        });
        
        // Refresh the current settings tab to show updated colors
        if (this.currentSettingsCategory) {
            this.showSettingsCategory(this.currentSettingsCategory);
        }
        
        // Apply settings to chart
        this.applyChartSettings();
        
        // Show notification
        this.showNotification(`Template "${template.name}" applied ✓`);
    }

    resetChartSettingsToDefault() {
        this.chartSettings = JSON.parse(JSON.stringify(this._defaultChartSettings || {}));
        try {
            localStorage.removeItem('chartSettings');
        } catch (e) {
        }
        this.applyChartSettings();
        if (typeof this.saveSettings === 'function') {
            this.saveSettings();
        }
        this.showNotification('Default settings restored ✓');
    }
    
    async loadAvailableFiles() {
        try {
            const response = await fetch(`${this.apiUrl}/files`);
            const data = await response.json();
            
            const fileSelect = document.getElementById('fileSelect');
            if (!fileSelect) return;
            
            fileSelect.innerHTML = '<option value="">-- Select a chart --</option>';
            
            data.files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.id;
                const date = new Date(file.upload_date).toLocaleDateString();
                option.textContent = `${file.original_name} (${file.row_count} candles, ${date})`;
                fileSelect.appendChild(option);
            });
        } catch (error) {
            console.error('❌ Failed to load files from server. Please upload a CSV file.', error);
            const fileSelect = document.getElementById('fileSelect');
            if (fileSelect) {
                fileSelect.innerHTML = '<option value="">⚠️ Server not running - Upload CSV to begin</option>';
            }
            // No fallback data - user must upload CSV
            this.render();
        }
    }
    
    setupFileSelector() {
        const fileSelect = document.getElementById('fileSelect');
        if (!fileSelect) {
            console.warn('⚠️ File selector element not found');
            return;
        }
        
        console.log('✓ File selector element found');
        fileSelect.addEventListener('change', async (e) => {
            const fileId = e.target.value;
            console.log(`📁 File selected: ${fileId}`);
            if (!fileId) return;
            
            this.currentFileId = fileId;
            await this.loadFileFromServer(fileId);
        });
    }
    
    async loadFileFromServer(fileId) {
        try {
            console.log(`📥 Loading file ID: ${fileId} from server...`);
            this.isLoading = true;
            this.currentFileId = fileId;
            
            // First request to get metadata and initial chunk
            const url = `${this.apiUrl}/file/${fileId}?offset=0&limit=${this.chunkSize}`;
            console.log(`📡 Fetching: ${url}`);
            
            const response = await fetch(url);
            console.log(`📡 Response status: ${response.status}`);
            
            const result = await response.json();
            console.log(`📦 Received data, total candles: ${result.total}, returned: ${result.returned}`);
            
            if (result.data) {
                this.totalCandles = result.total;
                this.loadedRanges.clear();
                
                console.log(`📝 Parsing CSV data (${result.data.length} chars)...`);
                
                // Parse initial chunk
                this.parseCSVChunk(result.data, 0);
                this.loadedRanges.set(0, this.chunkSize);
                
                console.log(`✅ Loaded initial chunk: ${result.returned}/${result.total} candles`);
                console.log(`📊 Raw data length: ${this.rawData.length}`);
                console.log(`📊 Working data length: ${this.data.length}`);
                
                // If dataset is small, load everything
                if (result.total <= this.chunkSize) {
                    console.log('📊 Small dataset - all data loaded');
                } else {
                    console.log(`📊 Large dataset detected (${result.total} candles) - using lazy loading`);
                }
                
                // Force render to show data
                console.log(' Forcing render...');
                this.scheduleRender();
            } else {
                console.error('❌ No data in response');
            }
            
            this.isLoading = false;
        } catch (error) {
            this.isLoading = false;
            console.error('❌ Failed to load file:', error);
            console.error('Error details:', error.message);
            alert('Failed to load chart data from server. Make sure Python backend is running.');
        }
    }
    
    /**
     * Parse CSV chunk and merge with existing data
     * Handles multiple formats: with/without headers, different date formats, etc.
     * @param {string} csv - CSV data
     * @param {number} startIndex - Starting index in the full dataset
     */
    parseCSVChunk(csv, startIndex) {
        try {
            const lines = csv.trim().split('\n').filter(line => line.trim().length > 0);
            if (lines.length < 1) return;
            
            // Try to parse first line to detect if it's a header or data
            const firstLine = lines[0].toLowerCase();
            const hasHeader = firstLine.includes('open') || firstLine.includes('high') || 
                             firstLine.includes('low') || firstLine.includes('close') ||
                             firstLine.includes('ticker') || firstLine.includes('time');
            
            const dataStartIdx = hasHeader ? 1 : 0;
            
            // Detect separator (comma, tab, semicolon, or whitespace)
            let separator = ',';
            if (lines[dataStartIdx].split('\t').length > 5) separator = '\t';
            else if (lines[dataStartIdx].split(';').length > 5) separator = ';';
            else if (lines[dataStartIdx].split(/\s+/).length > 5) separator = /\s+/;
            
            let timeIdx = -1, dateIdx = -1, openIdx = -1, highIdx = -1, lowIdx = -1, closeIdx = -1, volIdx = -1, tickerIdx = -1;
            let detectedSymbol = null;
            
            if (hasHeader) {
                const headers = lines[0].toLowerCase().split(separator).map(h => h.trim());
                timeIdx = headers.findIndex(h => h.includes('time') && !h.includes('date'));
                dateIdx = headers.findIndex(h => h.includes('date') || h.includes('dt'));
                openIdx = headers.findIndex(h => h.includes('open'));
                highIdx = headers.findIndex(h => h.includes('high'));
                lowIdx = headers.findIndex(h => h.includes('low'));
                closeIdx = headers.findIndex(h => h.includes('close'));
                volIdx = headers.findIndex(h => h.includes('vol'));
                tickerIdx = headers.findIndex(h => h.includes('ticker') || h.includes('symbol'));
                
                // Check if "time" column actually contains full datetime (e.g., "Gmt time")
                // by looking at first data row
                if (timeIdx >= 0 && dateIdx < 0 && lines.length > dataStartIdx) {
                    const firstDataRow = lines[dataStartIdx].split(separator).map(c => c.trim());
                    const timeValue = firstDataRow[timeIdx];
                    // If the "time" column contains date info (DD.MM.YYYY, YYYY-MM-DD, etc.), treat as dateIdx
                    if (timeValue && (timeValue.includes('.') || timeValue.includes('-') || timeValue.includes('/'))) {
                        dateIdx = timeIdx;
                        timeIdx = -1;
                    }
                }
                
                // Try to extract symbol from first data row if ticker column exists
                if (tickerIdx >= 0 && lines.length > dataStartIdx) {
                    const firstDataRow = lines[dataStartIdx].split(separator).map(c => c.trim());
                    detectedSymbol = firstDataRow[tickerIdx];
                }
            } else {
                // No header - assume standard format
                // Check if first column looks like a ticker symbol
                const firstCol = lines[0].split(separator)[0].trim();
                const hasTicker = firstCol.length < 10 && /^[A-Z]+$/.test(firstCol);
                
                if (hasTicker) {
                    // Format: TICKER, DATE, TIME, OPEN, HIGH, LOW, CLOSE, VOL
                    tickerIdx = 0;
                    dateIdx = 1;
                    timeIdx = 2;
                    openIdx = 3;
                    highIdx = 4;
                    lowIdx = 5;
                    closeIdx = 6;
                    volIdx = 7;
                    detectedSymbol = firstCol;
                } else {
                    // Format: DATETIME/DATE, OPEN, HIGH, LOW, CLOSE, VOL
                    dateIdx = 0;
                    openIdx = 1;
                    highIdx = 2;
                    lowIdx = 3;
                    closeIdx = 4;
                    volIdx = 5;
                }
            }
            
            // Store detected symbol
            if (detectedSymbol && startIndex === 0) {
                this.currentSymbol = detectedSymbol;
                console.log(`📊 Detected symbol: ${detectedSymbol}`);
            }
            
            // Parse new data
            const newData = [];
            for (let i = dataStartIdx; i < lines.length; i++) {
                const cols = lines[i].split(separator).map(c => c.trim());
                if (cols.length < 5) continue;
                
                // Parse timestamp
                let t;
                if (dateIdx >= 0 && timeIdx >= 0 && timeIdx !== dateIdx) {
                    // Separate date and time columns
                    const dateStr = cols[dateIdx];
                    const timeStr = cols[timeIdx];
                    t = this.parseDateTime(dateStr, timeStr);
                } else if (dateIdx >= 0) {
                    // Combined datetime column
                    t = this.parseDateTime(cols[dateIdx]);
                } else if (timeIdx >= 0) {
                    // Time column only - check if it's an epoch timestamp
                    const timeVal = cols[timeIdx];
                    if (/^\d+$/.test(timeVal)) {
                        // Numeric epoch timestamp
                        t = parseInt(timeVal, 10);
                        // Convert seconds to ms if needed
                        if (t < 10000000000) t *= 1000;
                    } else {
                        t = this.parseDateTime(timeVal);
                    }
                } else {
                    // No timestamp - use sequential time
                    t = Date.now() + (startIndex + i - dataStartIdx) * 60000;
                }
                
                // Parse OHLCV
                const o = parseFloat(cols[openIdx >= 0 ? openIdx : 1]);
                const h = parseFloat(cols[highIdx >= 0 ? highIdx : 2]);
                const l = parseFloat(cols[lowIdx >= 0 ? lowIdx : 3]);
                const c = parseFloat(cols[closeIdx >= 0 ? closeIdx : 4]);
                const v = volIdx >= 0 && cols[volIdx] ? parseFloat(cols[volIdx]) : 0;
                
                if (!isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c) && !isNaN(t)) {
                    newData.push({t, o, h, l, c, v});
                }
            }
            
            if (newData.length === 0) {
                console.error('❌ No valid data parsed from CSV');
                console.error('   Lines in CSV:', lines.length);
                console.error('   Data start index:', dataStartIdx);
                return;
            }
            
            // Merge with existing data
            if (startIndex === 0) {
                this.rawData = newData;
            } else {
                // Insert at correct position
                this.rawData = this.rawData.slice(0, startIndex).concat(newData, this.rawData.slice(startIndex + newData.length));
            }
            
            // Update working data
            this.data = this.resampleData(this.rawData, this.currentTimeframe);
            
            // Recalculate indicators with new data
            if (typeof this.recalculateIndicators === 'function') {
                this.recalculateIndicators();
            }
            
            console.log(`✅ Parsed ${newData.length} candles from CSV chunk`);
            console.log(`📊 Total rawData: ${this.rawData.length} candles`);
            console.log(`📊 Working data (${this.currentTimeframe}): ${this.data.length} candles`);
            
            // Update date range for date picker
            this.updateDateRange();
            
            // Update symbol selector if symbol was detected
            if (this.currentSymbol) {
                this.updateSymbolSelector(this.currentSymbol);
            }
            
            // On initial load (startIndex===0), position to show latest candles.
            // Do NOT call jumpToLatest() here — it resets candleWidth/zoom on every chunk
            // including pan-loads, which would destroy the user's current zoom level.
            if (startIndex === 0) {
                console.log('🎯 Auto-positioning to latest candles (initial load)...');
                // Force resize first so this.w/h are accurate before fitToView calculates offsetX.
                // Without this, fitToView may run with this.w=0 and compute a wrong offsetX.
                this.resize();
                this.fitToView();
                this.scheduleRender();
            }
            
            // Clear old drawings and load saved drawings ONLY when file changes (not on timeframe change)
            if (startIndex === 0 && this.drawingManager) {
                const fileChanged = this._lastLoadedFileId && this._lastLoadedFileId !== this.currentFileId;
                
                if (fileChanged) {
                    // File changed - clear old drawings from previous file
                    if (this.drawingManager.drawings.length > 0) {
                        console.log('🗑️ Clearing old drawings from previous file...');
                        this.drawingManager.drawings.forEach(d => d.destroy());
                        this.drawingManager.drawings = [];
                    }
                    
                    // Load drawings for the new file
                    if (typeof this.drawingManager.loadDrawings === 'function') {
                        console.log('🎨 Loading saved drawings for new file...');
                        this.drawingManager.loadDrawings();
                    }
                } else if (!this._lastLoadedFileId) {
                    // First load ever - load drawings
                    if (typeof this.drawingManager.loadDrawings === 'function') {
                        console.log('🎨 Loading saved drawings (initial load)...');
                        this.drawingManager.loadDrawings();
                    }
                }
                // On timeframe change (same file), do nothing - chartDataLoaded listener will handle refresh
                
                this._lastLoadedFileId = this.currentFileId;
            }
            
            // Notify that data has been updated (for panels)
            window.dispatchEvent(new CustomEvent('chartDataLoaded', {
                detail: { 
                    data: this.data,
                    rawData: this.rawData,
                    symbol: this.currentSymbol,
                    timeframe: this.currentTimeframe
                }
            }));
            
        } catch (error) {
            console.error('CSV Parse Error:', error);
            alert(`Failed to parse CSV: ${error.message}\n\nPlease check your CSV format.`);
        }
    }
    
    /**
     * Parse date/time in various formats
     * @param {string} dateStr - Date string (may include time)
     * @param {string} timeStr - Optional separate time string
     * @returns {number} Timestamp in milliseconds
     */
    parseDateTime(dateStr, timeStr = null) {
        try {
            // If separate date and time
            if (timeStr) {
                // Date format: YYYYMMDD or YYYY-MM-DD or DD.MM.YYYY
                let year, month, day;
                if (dateStr.includes('-')) {
                    [year, month, day] = dateStr.split('-');
                } else if (dateStr.includes('.')) {
                    // European format: DD.MM.YYYY
                    [day, month, year] = dateStr.split('.');
                } else {
                    year = dateStr.substring(0, 4);
                    month = dateStr.substring(4, 6);
                    day = dateStr.substring(6, 8);
                }
                
                // Time format: HHMMSS or HH:MM:SS
                let hour, minute, second = 0;
                if (timeStr.includes(':')) {
                    const parts = timeStr.split(':');
                    hour = parts[0];
                    minute = parts[1];
                    second = parts[2] || 0;
                } else {
                    hour = timeStr.substring(0, 2);
                    minute = timeStr.substring(2, 4);
                    second = timeStr.substring(4, 6) || 0;
                }
                
                return new Date(year, month - 1, day, hour, minute, second).getTime();
            } else {
                // Combined datetime
                
                // Try European format: DD.MM.YYYY HH:MM:SS.mmm
                if (dateStr.includes('.') && dateStr.includes(' ')) {
                    const [datePart, timePart] = dateStr.split(' ');
                    const [day, month, year] = datePart.split('.');
                    
                    if (year && month && day) {
                        const timeComponents = timePart.split(':');
                        const hour = parseInt(timeComponents[0]) || 0;
                        const minute = parseInt(timeComponents[1]) || 0;
                        // Handle seconds with milliseconds (e.g., "00.000")
                        const secondStr = timeComponents[2] || '0';
                        const second = parseFloat(secondStr) || 0;
                        
                        const timestamp = new Date(
                            parseInt(year), 
                            parseInt(month) - 1, 
                            parseInt(day), 
                            hour, 
                            minute, 
                            Math.floor(second)
                        ).getTime();
                        
                        if (!isNaN(timestamp)) {
                            return timestamp;
                        }
                    }
                }
                
                // Try standard parsing (ISO format, etc.)
                const timestamp = Date.parse(dateStr);
                if (!isNaN(timestamp)) {
                    return timestamp;
                }
                
                // Try YYYYMMDD format
                if (dateStr.length === 8 && /^\d+$/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    return new Date(year, month - 1, day).getTime();
                }
                
                return NaN;
            }
        } catch (error) {
            console.error('Date parse error:', error);
            return NaN;
        }
    }
    
    /**
     * Load data chunk based on visible range
     * @param {number} startIndex - Start index
     * @param {number} endIndex - End index
     */
    async loadDataRange(startIndex, endIndex) {
        if (this.isLoadingChunk) return;
        
        // Check if range is already loaded
        let needsLoad = false;
        for (let i = startIndex; i < endIndex; i += this.chunkSize) {
            if (!this.loadedRanges.has(i)) {
                needsLoad = true;
                break;
            }
        }
        
        if (!needsLoad) return;
        
        try {
            this.isLoadingChunk = true;
            const response = await fetch(`${this.apiUrl}/file/${this.currentFileId}/range?start_index=${startIndex}&end_index=${endIndex}`);
            const result = await response.json();
            
            if (result.data) {
                this.parseCSVChunk(result.data, startIndex);
                this.loadedRanges.set(startIndex, endIndex);
                console.log(`📦 Loaded range: ${startIndex}-${endIndex}`);
            }
            
            this.isLoadingChunk = false;
        } catch (error) {
            this.isLoadingChunk = false;
            console.error('Failed to load data range:', error);
        }
    }
    
    /**
     * Check if visible data needs to be loaded
     */
    checkAndLoadVisibleData() {
        if (!this.currentFileId || this.totalCandles <= this.chunkSize) return;
        
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const candleSpacing = this.getCandleSpacing();
        
        // Calculate visible range
        const visibleStart = Math.max(0, -Math.floor(this.offsetX / candleSpacing));
        const visibleEnd = Math.min(this.data.length, visibleStart + Math.ceil(cw / candleSpacing) + 2);
        
        // Add buffer
        const bufferStart = Math.max(0, visibleStart - this.bufferSize);
        const bufferEnd = Math.min(this.totalCandles, visibleEnd + this.bufferSize);
        
        // Load if needed
        this.loadDataRange(bufferStart, bufferEnd);
    }

    syncMagnetButton() {
        const magnetBtns = [document.getElementById('magnetMode'), document.getElementById('magnetModeToolbar')];
        let effectiveMode = this.magnetMode;

        if (this.drawingManager && typeof this.drawingManager.magnetMode !== 'undefined') {
            effectiveMode = this.drawingManager.magnetMode;
            this.magnetMode = effectiveMode;
        }

        if (effectiveMode === true) effectiveMode = 'weak';
        if (effectiveMode === false || effectiveMode == null) effectiveMode = 'off';

        const isActive = typeof effectiveMode === 'string' ? effectiveMode !== 'off' : !!effectiveMode;
        const modeLabel = (typeof effectiveMode === 'string' && isActive)
            ? (effectiveMode === 'weak' ? 'WEAK' : 'STRONG')
            : 'OFF';

        magnetBtns.forEach(magnetBtn => {
            if (magnetBtn) {
                magnetBtn.classList.toggle('active', isActive);
                magnetBtn.setAttribute('title', `Magnet Mode (${modeLabel})`);
            }
        });
    }

    // Get the current cursor style based on cursorType
    getCurrentCursorStyle() {
        // Default to 'cross' if cursorType not set
        const type = this.cursorType || 'cross';
        const cursorStyles = {
            'cross': 'crosshair',
            'dot': 'none',  // Hide cursor, custom dot indicator will replace it
            'arrow': 'default',
            'eraser': 'not-allowed'
        };
        return cursorStyles[type] || 'default';
    }

    setCursorType(type, skipSync = false) {
        console.log('🖱️ setCursorType called with:', type);
        this.cursorType = type;
        
        // Clear any active drawing tool when switching cursor types
        if (this.drawingManager && type !== 'eraser') {
            this.drawingManager.clearTool();
        }
        this.tool = null;
        
        // Define cursor styles for each type
        const cursorStyles = {
            'cross': 'crosshair',
            'dot': 'none',  // Hide cursor, custom dot indicator will replace it
            'arrow': 'default',
            'eraser': 'not-allowed'
        };
        
        const cursorStyle = cursorStyles[type] || 'default';
        
        // Apply cursor to canvas
        if (this.canvas) {
            this.canvas.style.cursor = cursorStyle;
        }
        
        // Apply cursor to chart wrapper (covers the whole chart area)
        const chartWrapper = this.isPanel ? this.canvas?.parentElement : document.querySelector('.chart-wrapper');
        if (chartWrapper) {
            chartWrapper.style.cursor = cursorStyle;
        }
        
        // Apply cursor to SVG overlay
        if (this.svg && this.svg.node()) {
            this.svg.node().style.cursor = cursorStyle;
        }
        
        // Reset SVG pointer-events to allow chart panning (cursor modes don't need to capture events)
        // Eraser mode is an exception - it needs to capture clicks on drawings
        // Allow pointer-events on SVG for shape hover interactions when not in drawing mode
        if (this.svg) {
            if (type === 'eraser') {
                this.svg.style('pointer-events', 'all');
            } else {
                // Allow shapes to receive hover events while letting canvas handle panning
                this.svg.style('pointer-events', 'none');
                // Individual shapes will have pointer-events: 'all' set on them
            }
        }
        
        // If eraser mode, enable eraser functionality and add click handler
        if (type === 'eraser') {
            console.log('🧹 Setting eraser mode ON, drawingManager exists:', !!this.drawingManager);
            if (this.drawingManager) {
                this.drawingManager.setEraserMode(true);
                console.log('🧹 Eraser mode set, current state:', this.drawingManager.eraserMode);
                // Clear any active drawing tool to prevent drawing
                this.tool = null;
            } else {
                console.warn('⚠️ DrawingManager not available for eraser mode');
            }
            // Add eraser click handler to SVG
            this.setupEraserClickHandler();
        } else {
            console.log('🧹 Setting eraser mode OFF');
            if (this.drawingManager) {
                this.drawingManager.setEraserMode(false);
            }
        }
        
        // Update crosshair visibility based on cursor type
        this.updateCrosshairVisibility(type);
        
        // Update the cursor dropdown UI (only need to do once, on main chart)
        if (!skipSync || this === window.chart) {
            this.updateCursorDropdownUI(type);
        }
        
        // Sync cursor type to all other charts (main + panels)
        if (!skipSync) {
            this.syncCursorTypeToAllCharts(type);
        }
        
        console.log('🖱️ Cursor type:', type);
    }
    
    /**
     * Update crosshair visibility based on cursor type
     */
    updateCrosshairVisibility(type) {
        // Crosshair lines are visible for 'cross' type only
        // Dot shows custom dot indicator, arrow and eraser show no crosshair
        const showLines = type === 'cross';
        
        // Get container for this chart - use same logic as updateCrosshair
        const container = this.isPanel ? this.canvas?.parentElement : document;
        if (!container) return;
        
        const vLine = container.querySelector('.crosshair-vertical');
        const hLine = container.querySelector('.crosshair-horizontal');
        const priceLabel = container.querySelector('.price-label');
        const timeLabel = container.querySelector('.time-label');
        
        // Store preference - actual show/hide happens in updateCrosshair based on mouse position
        this.showCrosshairLines = showLines;
        
        // If not showing lines, hide them now
        if (!showLines) {
            if (vLine) vLine.style.display = 'none';
            if (hLine) hLine.style.display = 'none';
            if (priceLabel) priceLabel.style.display = 'none';
            if (timeLabel) timeLabel.style.display = 'none';
        }
    }
    
    /**
     * Update cursor dropdown UI to show active cursor type
     */
    updateCursorDropdownUI(type) {
        const cursorDropdown = document.getElementById('cursor-dropdown');
        const cursorIcon = document.getElementById('cursorIcon');
        const cursorBtn = document.getElementById('cursorTool');
        
        if (cursorDropdown) {
            // Update selected state in dropdown
            const cursorOptions = cursorDropdown.querySelectorAll('.cursor-option');
            cursorOptions.forEach(option => {
                const optionType = option.getAttribute('data-cursor');
                if (optionType === type) {
                    option.classList.add('selected');
                    // Update main button icon
                    if (cursorIcon) {
                        const optionSvg = option.querySelector('svg');
                        if (optionSvg) {
                            cursorIcon.innerHTML = optionSvg.innerHTML;
                        }
                    }
                } else {
                    option.classList.remove('selected');
                }
            });
        }
        
        // Set cursor button as active
        if (cursorBtn) {
            cursorBtn.classList.add('active');
        }
    }
    
    /**
     * Sync cursor type to all other chart instances
     */
    syncCursorTypeToAllCharts(type) {
        // Sync to main chart if this is a panel
        if (window.chart && window.chart !== this) {
            window.chart.setCursorType(type, true); // skipSync to prevent loop
        }
        
        // Sync to all panel charts
        if (window.panelManager && window.panelManager.panels) {
            window.panelManager.panels.forEach(panel => {
                if (panel.chartInstance && panel.chartInstance !== this) {
                    panel.chartInstance.setCursorType(type, true); // skipSync to prevent loop
                }
            });
        }
    }
    
    /**
     * Setup click handler for eraser mode to delete drawings
     */
    setupEraserClickHandler() {
        if (!this.svg) return;
        
        const chartInstance = this;
        
        // Remove old handlers first
        this.svg.on('mousedown.eraser', null);
        this.svg.on('click.eraser', null);
        
        // Use click to handle eraser
        this.svg.on('click.eraser', function(event) {
            // Only handle if in eraser mode
            if (!chartInstance.drawingManager || !chartInstance.drawingManager.eraserMode) return;
            
            console.log('🧹 Eraser click detected');
            
            // Find if click was on a drawing element
            let target = event.target;
            let drawingId = null;
            
            // Walk up the DOM to find the drawing group with data-id
            let attempts = 0;
            while (target && target !== this && attempts < 10) {
                if (target.hasAttribute && target.hasAttribute('data-id')) {
                    drawingId = target.getAttribute('data-id');
                    console.log('🧹 Found drawing ID:', drawingId);
                    break;
                }
                target = target.parentElement;
                attempts++;
            }
            
            if (drawingId) {
                // STOP the event from reaching drawing tools
                event.stopPropagation();
                event.preventDefault();
                
                console.log('🧹 Attempting to erase:', drawingId);
                chartInstance.drawingManager.handleEraserClick(drawingId);
                // Re-render to update the display
                chartInstance.scheduleRender();
            } else {
                console.log('🧹 No drawing found at click position');
            }
        });
        
        this._eraserHandlerAttached = true;
        console.log('🧹 Eraser click handler attached');
    }

	    resize() {
	        const oldW = this.w;
	        const oldH = this.h;
	        
	        // Get dimensions from PARENT container (chart-wrapper), not canvas itself
	        const container = this.canvas.parentElement;
	        void container.offsetHeight; // Force reflow
	        
	        const dpr = window.devicePixelRatio || 1;
	        const rect = container.getBoundingClientRect();
	        
	        // Set canvas physical size
	        this.canvas.width = rect.width * dpr;
	        this.canvas.height = rect.height * dpr;
	        
	        // Set canvas display size
	        this.canvas.style.width = rect.width + 'px';
	        this.canvas.style.height = rect.height + 'px';
	        
	        // Scale context for high DPI displays
	        this.ctx.scale(dpr, dpr);
	        
	        // Update chart dimensions
	        this.w = rect.width;
	        this.h = rect.height;
	        this.svg.attr('width', this.w).attr('height', this.h);
	        this.svg.style('width', this.w + 'px').style('height', this.h + 'px');
	        
	        // Adjust offsetX to keep the visible center point the same
	        if (oldW && oldH) {
	            const deltaW = this.w - oldW;
	            const deltaH = this.h - oldH;
	            
	            // Adjust horizontal offset to keep the center of the chart view stable
	            this.offsetX += deltaW * 0.5;
	            
	            // Adjust price offset to keep the center of the price view stable
	            const m = this.margin;
	            const priceAreaHeight = oldH - m.t - m.b;
	            const newPriceAreaHeight = this.h - m.t - m.b;
	            
	            // Calculate the change in the vertical center of the price area
	            const centerPriceY = m.t + priceAreaHeight / 2;
	            const newCenterPriceY = m.t + newPriceAreaHeight / 2;
	            const deltaCenterY = newCenterPriceY - centerPriceY;
	            
	            // Convert pixel change to price offset change (only if priceZoom is set)
	            if (this.yScale) {
	                const pricePerPixel = (this.yScale.domain()[1] - this.yScale.domain()[0]) / priceAreaHeight;
	                this.priceOffset -= deltaCenterY * pricePerPixel;
	            }
	            
	            this.constrainOffset();
	        } else {
	            // Initial load
	            this.fitToView();
	        }
	        
	        this.scheduleRender();
	        
	        // Update follow button position after resize
	        if (this.replaySystem && this.replaySystem.isActive) {
	            this.replaySystem.updateAutoScrollIndicator();
	        }
	    }
    
    /**
     * Fit chart to show latest candles on the right edge
     */
    fitToView() {
        if (!this.data || this.data.length === 0) return;
        
        // Skip if chart view was already restored from session state
        // This preserves the user's scroll position when continuing a session
        if (this._chartViewRestored) {
            console.log('📍 fitToView skipped - chart view already restored from session');
            return;
        }
        
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        
        // Safeguard: if canvas width is invalid (0 or too small), skip positioning
        // This prevents the huge gap issue on page reload when layout isn't complete
        if (cw <= 0 || this.w <= 0) {
            console.warn('⚠️ fitToView skipped - canvas dimensions not ready:', { w: this.w, cw });
            return;
        }
        
        const candleSpacing = this.getCandleSpacing();
        
        // Calculate how many candles can fit on screen
        const visibleCandles = Math.floor(cw / candleSpacing);
        
        // If all data fits on screen, start from left
        if (this.data.length <= visibleCandles) {
            this.offsetX = 0;
        } else {
            // Position last candle near the right edge with small padding
            // Show ~90% of visible area filled (keeps last candle visible with breathing room)
            const padding = candleSpacing * 5; // ~5 candles worth of padding from right edge
            const lastCandleX = (this.data.length - 1) * candleSpacing;
            this.offsetX = cw - lastCandleX - padding;
        }
        
        console.log('📍 fitToView:', {
            dataLength: this.data.length,
            offsetX: this.offsetX,
            candleWidth: this.candleWidth,
            candleSpacing: candleSpacing
        });
        
        // Apply constraints to ensure valid position
        this.constrainOffset();
    }
    
    /**
     * Jump to latest candles (like TradingView double-click feature)
     * Resets zoom and shows the most recent data
     */
    jumpToLatest() {
        console.log('🎯 Jumping to latest candles...');
        
        // Clear the restored flag so fitToView() can reposition
        this._chartViewRestored = false;
        
        // Reset zoom
        this.candleWidth = 8;
        this.priceZoom = 1;
        this.priceOffset = 0;
        this.autoScale = true;
        
        // Position to show latest data
        this.fitToView();
        
        // Re-render
        this.scheduleRender();
        
        console.log('✅ Jumped to latest - showing last candles');
    }
    
    /**
     * Dispatch scroll/zoom sync event for panel synchronization
     */
    dispatchScrollSync() {
        if (!this.data || this.data.length === 0) return;
        // Allow main chart (panel 0) to sync to other panels too
        if (!window.panelManager || window.panelManager.currentLayout === '1') return;
        
        // Calculate visible range
        const spacing = this.getCandleSpacing();
        const visibleCandles = Math.floor((this.w - this.margin.l - this.margin.r) / spacing);
        const endIndex = Math.min(this.data.length - 1, Math.floor(-this.offsetX / spacing) + visibleCandles);
        const startIndex = Math.max(0, endIndex - visibleCandles);
        
        // Get timestamps for visible range (use .t property)
        const startTimestamp = this.data[startIndex]?.t || 0;
        const endTimestamp = this.data[endIndex]?.t || 0;
        
        // Find which panel this chart belongs to
        let sourcePanel = this.panel || null;
        if (!sourcePanel && window.panelManager) {
            const panels = window.panelManager.getPanels();
            for (const panel of panels) {
                if (panel.chartInstance === this) {
                    sourcePanel = panel;
                    break;
                }
            }
            // If this is main chart (window.chart), use panel 0
            if (!sourcePanel && this === window.chart && panels.length > 0) {
                sourcePanel = panels[0];
            }
        }
        
        if (!sourcePanel) return;
        window.dispatchEvent(new CustomEvent('chartScrolled', {
            detail: {
                chart: this,
                panel: sourcePanel,
                startIndex,
                endIndex,
                startTimestamp,
                endTimestamp,
                offsetX: this.offsetX,
                candleWidth: this.candleWidth
            }
        }));
    }
    
    /**
     * Extract symbol from filename
     * @param {string} filename - CSV filename
     * @returns {string|null} Extracted symbol or null
     */
    extractSymbolFromFilename(filename) {
        // Remove .csv extension
        const nameWithoutExt = filename.replace(/\.csv$/i, '');
        
        // Common patterns:
        // EURUSD1.csv -> EURUSD
        // GBPUSD_data.csv -> GBPUSD
        // EURUSD_2024.csv -> EURUSD
        // 20251028_194229_GBPUSD.csv -> GBPUSD
        
        // Try to find currency pairs or stock symbols (2-6 uppercase letters)
        const matches = nameWithoutExt.match(/[A-Z]{2,6}/g);
        if (matches && matches.length > 0) {
            // Return the last match (often the symbol is at the end)
            // or the longest match if multiple found
            return matches.reduce((a, b) => a.length >= b.length ? a : b);
        }
        
        // Try to extract from patterns like "Untitled spreadsheet" - use a generic name
        if (nameWithoutExt.toLowerCase().includes('untitled')) {
            return 'CHART';
        }
        
        // Use filename as-is if it's short and alphanumeric
        if (nameWithoutExt.length <= 10 && /^[A-Za-z0-9_-]+$/.test(nameWithoutExt)) {
            return nameWithoutExt.toUpperCase();
        }
        
        return null;
    }
    
    /**
     * Update the symbol selector dropdown with detected symbol
     * @param {string} symbol - Symbol to display
     */
    updateSymbolSelector(symbol) {
        const fileSelect = document.getElementById('fileSelect');
        if (!fileSelect) return;
        
        // Check if this symbol already exists in the dropdown
        let symbolExists = false;
        for (let i = 0; i < fileSelect.options.length; i++) {
            if (fileSelect.options[i].textContent.includes(symbol)) {
                symbolExists = true;
                fileSelect.selectedIndex = i;
                break;
            }
        }
        
        // If symbol doesn't exist, add it as a new option
        if (!symbolExists) {
            // Create new option for uploaded file
            const option = document.createElement('option');
            option.value = 'local_' + symbol;
            option.textContent = `${symbol} (Uploaded - ${this.rawData.length} candles)`;
            option.selected = true;
            
            // Insert after the first "Select Symbol..." option
            if (fileSelect.options.length > 0) {
                fileSelect.insertBefore(option, fileSelect.options[1]);
            } else {
                fileSelect.appendChild(option);
            }
        }
        
        // Update the logo/title to show the symbol
        this.updateChartTitle(symbol);
        
        console.log(`📊 Symbol selector updated: ${symbol}`);
    }
    
    /**
     * Update the chart title to show current symbol
     * @param {string} symbol - Symbol to display
     */
    updateChartTitle(symbol) {
        const symbolDisplay = document.getElementById('symbolDisplay');
        if (symbolDisplay) {
            // Format like "EURUSD - 5" or "GBPUSD - 1H"
            const timeframeMap = {
                '1m': '1',
                '5m': '5',
                '15m': '15',
                '30m': '30',
                '1h': '1H',
                '4h': '4H',
                '1d': '1D',
                '1w': '1W',
                '1mo': '1M'
            };
            const timeframeDisplay = timeframeMap[this.currentTimeframe] || this.currentTimeframe;
            symbolDisplay.textContent = `${symbol} - ${timeframeDisplay}`;
        }
        
        // Also update the on-chart OHLC panel
        this.updateChartOHLCSymbol(symbol);
    }
    
    /**
     * Update the on-chart OHLC panel symbol and timeframe
     * @param {string} symbol - Symbol to display
     */
    updateChartOHLCSymbol(symbol) {
        // Determine ID suffix for panel charts
        const idSuffix = (this.panelIndex !== undefined) ? this.panelIndex : '';
        
        const chartSymbol = document.getElementById('chartSymbol' + idSuffix);
        const chartTimeframe = document.getElementById('chartTimeframe' + idSuffix);
        
        if (chartSymbol && symbol) {
            chartSymbol.textContent = symbol;
        }
        
        if (chartTimeframe) {
            const timeframeMap = {
                '1m': '1m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1H',
                '4h': '4H',
                '1d': '1D',
                '1w': '1W',
                '1mo': '1M'
            };
            chartTimeframe.textContent = timeframeMap[this.currentTimeframe] || this.currentTimeframe;
        }
    }
    
    /**
     * Update toolbar OHLC display
     * @param {Object} candle - Candle data {o, h, l, c, v}
     */
    updateToolbarOHLC(candle) {
        // Skip UI updates for panel instances
        if (this.isPanel) return;
        
        const formatPrice = (price, decimalOverride) => {
            if (!isFinite(price)) return '—';
            const abs = Math.abs(price);
            let decimals;
            if (typeof decimalOverride === 'number') {
                decimals = decimalOverride;
            } else if (abs >= 1000) {
                decimals = 3;
            } else if (abs >= 1) {
                decimals = 4;
            } else {
                decimals = 5;
            }
            return Number(price).toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        };

        const updateTickets = (sellValue, buyValue) => {
            const sellElem = document.getElementById('sellPrice');
            const buyElem = document.getElementById('buyPrice');
            if (!sellElem || !buyElem) return;

            if (!isFinite(sellValue) || !isFinite(buyValue)) {
                sellElem.textContent = '—';
                buyElem.textContent = '—';
                return;
            }

            const ticketDecimals = Math.abs(buyValue) >= 1000 ? 3 : 4;
            sellElem.textContent = formatPrice(sellValue, ticketDecimals);
            buyElem.textContent = formatPrice(buyValue, ticketDecimals);
        };

        const openElem = document.getElementById('toolbarOpen');
        const highElem = document.getElementById('toolbarHigh');
        const lowElem = document.getElementById('toolbarLow');
        const closeElem = document.getElementById('toolbarClose');
        const changeElem = document.getElementById('toolbarChange');
        const volumeElem = document.getElementById('toolbarVolume');
        
        // Check if elements exist
        if (!openElem || !highElem || !lowElem || !closeElem) {
            return; // Elements don't exist, skip update
        }
        
        if (!candle) {
            // Clear toolbar if no candle
            openElem.textContent = '—';
            highElem.textContent = '—';
            lowElem.textContent = '—';
            closeElem.textContent = '—';
            if (changeElem) changeElem.textContent = '—';
            if (volumeElem) {
                volumeElem.textContent = 'Volume —';
                volumeElem.style.display = this.chartSettings.showVolume ? '' : 'none';
            }
            updateTickets(NaN, NaN);
            return;
        }
        
        // Update OHLC values
        openElem.textContent = formatPrice(candle.o);
        highElem.textContent = formatPrice(candle.h);
        lowElem.textContent = formatPrice(candle.l);
        closeElem.textContent = formatPrice(candle.c);
        
        // Calculate change
        const change = candle.c - candle.o;
        const changePercent = (change / candle.o) * 100;
        const changeText = `${change >= 0 ? '+' : ''}${formatPrice(change)} (${changePercent.toFixed(2)}%)`;
        if (changeElem) {
            changeElem.textContent = changeText;
            changeElem.className = change >= 0 ? 'ohlc-change positive' : 'ohlc-change negative';
        }
        
        // Update volume (only if showVolume is enabled)
        if (volumeElem) {
            if (this.chartSettings.showVolume) {
                const formatVolume = (vol) => {
                    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
                    if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
                    return vol.toFixed(0);
                };
                volumeElem.textContent = `Volume ${formatVolume(candle.v)}`;
                volumeElem.style.display = '';
            } else {
                volumeElem.style.display = 'none';
            }
        }

        // Update synthetic sell/buy tickets with a dynamic spread
        const midPrice = candle.c;
        const spread = Math.max(midPrice * 0.0005, 0.0001); // 5 bps minimum spread
        updateTickets(midPrice - spread, midPrice + spread);
    }
    
    /**
     * Constrain offsetX to prevent scrolling beyond data bounds
     * TradingView-style rubber-band resistance at boundaries
     */
    constrainOffset() {
        if (!this.data || this.data.length === 0) return;
        
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const candleSpacing = this.getCandleSpacing();
        const totalDataWidth = this.data.length * candleSpacing;
        
        // Right margin: Keep future space (TradingView style)
        const rightMarginCandles = 5;
        const rightMargin = rightMarginCandles * candleSpacing;
        
        // Max offset: First candle can go up to right edge minus margin
        const maxOffset = cw - rightMargin;
        
        // Min offset: Last candle stays at 30% from left (keeps chart usable)
        const lastCandleX = (this.data.length - 1) * candleSpacing;
        const minOffset = cw * 0.3 - lastCandleX;
        
        // Proactive pan-loading: trigger when viewport is NEAR the edge (like TradingView)
        const isReplayActive = this.replaySystem && this.replaySystem.isActive;
        const nearEdgeThreshold = 500 * candleSpacing;
        if (isReplayActive) {
            // Replay mode: only allow backward (scroll-left) pan-loading
            // Forward loading is handled by simpleStepForward
            if (this.offsetX > maxOffset - nearEdgeThreshold) {
                this.checkViewportLoadMore('backward');
            }
        } else {
            // Normal mode: trigger both directions based on viewport position
            if (this.offsetX > maxOffset - nearEdgeThreshold) {
                this.checkViewportLoadMore('backward');
            }
            if (this.offsetX < minOffset + nearEdgeThreshold) {
                this.checkViewportLoadMore('forward');
            }
        }

        // Apply soft constraint with elastic resistance at boundaries
        if (this.offsetX > maxOffset) {
            const overshoot = this.offsetX - maxOffset;
            const resistance = 0.3;
            this.offsetX = maxOffset + overshoot * resistance;
            if (this.movement) this.movement.velocityX *= 0.3;
        } else if (this.offsetX < minOffset) {
            const overshoot = minOffset - this.offsetX;
            const resistance = 0.2;
            this.offsetX = minOffset - overshoot * resistance;
            if (this.movement) this.movement.velocityX *= 0.3;
        }
        
        // Constrain candle width with quantized steps (TradingView style)
        // Use Fibonacci-like sequence for cleaner candle widths
        const allowedWidths = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
        const minWidth = allowedWidths[0];
        const maxWidth = allowedWidths[allowedWidths.length - 1];
        
        if (this.candleWidth < minWidth) this.candleWidth = minWidth;
        if (this.candleWidth > maxWidth) this.candleWidth = maxWidth;
        
        // Allow wider price zoom range
        const minZoom = 0.05;
        const maxZoom = 20;
        
        if (this.priceZoom < minZoom) {
            const overshoot = minZoom - this.priceZoom;
            this.priceZoom = minZoom - Math.pow(overshoot, 0.88);
            if (this.movement) this.movement.velocityY *= 0.5;
        } else if (this.priceZoom > maxZoom) {
            const overshoot = this.priceZoom - maxZoom;
            this.priceZoom = maxZoom + Math.pow(overshoot, 0.88);
            if (this.movement) this.movement.velocityY *= 0.5;
        }
        
        // Update animation targets if active
        if (this.zoomAnimation && this.zoomAnimation.active) {
            this.constrainZoomTargets();
        }
    }
    
    constrainZoomTargets() {
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const targetCandleSpacing = this.zoomAnimation.targetCandleWidth + 2;
        const totalDataWidth = this.data.length * targetCandleSpacing;
        
        const maxOffset = targetCandleSpacing * 2;
        const minOffset = cw - totalDataWidth - targetCandleSpacing * 2;
        
        this.zoomAnimation.targetOffsetX = Math.max(minOffset, Math.min(maxOffset, this.zoomAnimation.targetOffsetX));
        this.zoomAnimation.targetCandleWidth = Math.max(2, Math.min(100, this.zoomAnimation.targetCandleWidth));
        this.zoomAnimation.targetPriceZoom = Math.max(0.1, Math.min(10, this.zoomAnimation.targetPriceZoom));
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 3 — Rubber Band Snap-Back Animation
    // ═══════════════════════════════════════════════════════════════════
    applyRubberBandSnapBack() {
        if (!this.rubberBand || !this.data) return;
        
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const candleSpacing = this.getCandleSpacing();
        const rightMargin = (this.timeScale?.rightOffsetCandles || 5) * candleSpacing;
        const maxOffset = cw - rightMargin;
        const lastCandleX = (this.data.length - 1) * candleSpacing;
        const minOffset = cw * 0.3 - lastCandleX;
        
        // Snap back if out of bounds
        if (this.offsetX > maxOffset) {
            const diff = this.offsetX - maxOffset;
            this.offsetX -= diff * (this.rubberBand.snapBackSpeed || 0.15);
            if (Math.abs(this.offsetX - maxOffset) < 1) {
                this.offsetX = maxOffset;
            }
        } else if (this.offsetX < minOffset) {
            const diff = minOffset - this.offsetX;
            this.offsetX += diff * (this.rubberBand.snapBackSpeed || 0.15);
            if (Math.abs(this.offsetX - minOffset) < 1) {
                this.offsetX = minOffset;
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 8 — Box Zoom Apply
    // ═══════════════════════════════════════════════════════════════════
    applyBoxZoom() {
        if (!this.boxZoom || !this.data || this.data.length === 0) {
            this.boxZoom.active = false;
            return;
        }
        
        const m = this.margin;
        const x1 = Math.min(this.boxZoom.startX, this.boxZoom.endX);
        const x2 = Math.max(this.boxZoom.startX, this.boxZoom.endX);
        const y1 = Math.min(this.boxZoom.startY, this.boxZoom.endY);
        const y2 = Math.max(this.boxZoom.startY, this.boxZoom.endY);
        
        // Minimum size check
        if (x2 - x1 < 20 || y2 - y1 < 20) {
            this.boxZoom.active = false;
            return;
        }
        
        // Map rectangle to time range (data indices)
        const candleSpacing = this.getCandleSpacing();
        const startIdx = Math.floor((x1 - m.l - this.offsetX) / candleSpacing);
        const endIdx = Math.ceil((x2 - m.l - this.offsetX) / candleSpacing);
        
        // Calculate new candle width to fit selected range
        const chartWidth = this.w - m.l - m.r;
        const selectedCandles = Math.max(1, endIdx - startIdx);
        const newCandleWidth = Math.max(1, Math.min(89, chartWidth / selectedCandles - 2));
        
        // Map rectangle to price range
        if (this.yScale) {
            const priceTop = this.yScale.invert(y1);
            const priceBottom = this.yScale.invert(y2);
            
            // Calculate new price zoom and offset
            const currentRange = this.yScale.domain()[1] - this.yScale.domain()[0];
            const newRange = Math.abs(priceTop - priceBottom);
            const priceAreaHeight = this.h - m.t - m.b;
            
            if (newRange > 0) {
                // Add 5% padding
                const paddedRange = newRange * 1.1;
                const newZoom = this.priceZoom * (currentRange / paddedRange);
                
                this.priceZoom = Math.max(0.1, Math.min(20, newZoom));
                this.autoScale = false;
                this.priceScale.autoScale = false;
                
                // Center price offset on selection
                const centerPrice = (priceTop + priceBottom) / 2;
                const currentCenter = (this.yScale.domain()[0] + this.yScale.domain()[1]) / 2;
                this.priceOffset += (centerPrice - currentCenter);
            }
        }
        
        // Apply horizontal zoom
        this.candleWidth = newCandleWidth;
        
        // Center view on selection
        const centerIdx = (startIdx + endIdx) / 2;
        const newSpacing = this.getCandleSpacing();
        this.offsetX = chartWidth / 2 + m.l - centerIdx * newSpacing;
        
        // Update zoom level index to nearest
        const widths = this.zoomLevel.allowedWidths;
        let nearestIdx = 0;
        let minDiff = Math.abs(this.candleWidth - widths[0]);
        for (let i = 1; i < widths.length; i++) {
            const diff = Math.abs(this.candleWidth - widths[i]);
            if (diff < minDiff) {
                minDiff = diff;
                nearestIdx = i;
            }
        }
        this.zoomLevel.candleWidthIndex = nearestIdx;
        
        this.constrainOffset();
        this.boxZoom.active = false;
        this.scheduleRender();
        this.dispatchScrollSync();
        
        console.log('📦 Box zoom applied:', { startIdx, endIdx, newCandleWidth });
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 8 — Draw Box Zoom Rectangle
    // ═══════════════════════════════════════════════════════════════════
    drawBoxZoom() {
        if (!this.boxZoom || !this.boxZoom.active) return;
        
        const ctx = this.ctx;
        const x1 = Math.min(this.boxZoom.startX, this.boxZoom.endX);
        const x2 = Math.max(this.boxZoom.startX, this.boxZoom.endX);
        const y1 = Math.min(this.boxZoom.startY, this.boxZoom.endY);
        const y2 = Math.max(this.boxZoom.startY, this.boxZoom.endY);
        
        // Fill
        ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        
        // Border
        ctx.strokeStyle = 'rgba(41, 98, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
    }
    
    // Apply momentum/inertia after mouse release
    applyMomentum() {
        const velocityThreshold = 0.5;
        
        // Only apply momentum if velocity is significant
        if (Math.abs(this.movement.velocityX) < velocityThreshold && 
            Math.abs(this.movement.velocityY) < velocityThreshold) {
            this.movement.velocityX = 0;
            this.movement.velocityY = 0;
            return;
        }
        
        // Start momentum animation
        const animateMomentum = () => {
            // Check if velocity is still significant
            if (Math.abs(this.movement.velocityX) < 0.1 && 
                Math.abs(this.movement.velocityY) < 0.1) {
                this.movement.velocityX = 0;
                this.movement.velocityY = 0;
                
                // Update follow button visibility when momentum finishes
                if (this.replaySystem && this.replaySystem.isActive) {
                    this.replaySystem.updateAutoScrollIndicator();
                }
                return;
            }
            
            // Apply velocity to position
            this.offsetX += this.movement.velocityX;
            if (this.yScale) {
                const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
                const pricePerPixel = priceRange / (this.h - this.margin.t - this.margin.b);
                this.priceOffset += this.movement.velocityY * pricePerPixel;
            }
            
            // Apply friction to slow down
            this.movement.velocityX *= this.movement.friction;
            this.movement.velocityY *= this.movement.friction;
            
            this.constrainOffset();
            this.scheduleRender();
            
            // Continue animation
            requestAnimationFrame(animateMomentum);
        };
        
        animateMomentum();
    }

    setupCSVLoader() {
        const csvBtn = document.getElementById('loadCsv');
        const csvInput = document.getElementById('csvInput');
        if (!csvBtn || !csvInput) return;
        
        csvBtn.addEventListener('click', () => {
            console.log('📂 CSV Upload button clicked');
            csvInput.click();
        });
        csvInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
	            this.isLoading = true;
	            const originalHTML = csvBtn.innerHTML;
	            csvBtn.innerHTML = '<span style="font-size:12px;">⏳ Processing...</span>';
	            
	            // Read the file content locally as a fallback, as the server might not be running
	            const reader = new FileReader();
	            reader.onload = async (e) => {
	                const csvData = e.target.result;
	                
	                console.log(`📁 File loaded: ${file.name}`);
	                console.log(`📏 File size: ${csvData.length} characters`);
	                
	                try {
	                    // Use existing local parsing logic
	                    this.parseCSVChunk(csvData, 0);
	                    this.totalCandles = this.rawData.length;
	                    this.loadedRanges.clear();
	                    this.loadedRanges.set(0, this.totalCandles);
	                    
	                    // Try to extract symbol from filename if not detected from CSV
	                    if (!this.currentSymbol) {
	                        this.currentSymbol = this.extractSymbolFromFilename(file.name);
	                        if (this.currentSymbol) {
	                            console.log(`📊 Extracted symbol from filename: ${this.currentSymbol}`);
	                            this.updateSymbolSelector(this.currentSymbol);
	                        }
	                    }
	                    
	                    console.log(`✅ Successfully loaded "${file.name}"`);
	                    console.log(`📊 Total candles: ${this.rawData.length}`);
	                    console.log(`📊 Working data: ${this.data.length}`);
	                    
	                    this.jumpToLatest();
	                    this.scheduleRender();
	                    
	                    // Notify panels that new data is available
	                    window.dispatchEvent(new CustomEvent('chartDataLoaded', {
	                        detail: { 
	                            data: this.data,
	                            rawData: this.rawData,
	                            symbol: this.currentSymbol,
	                            timeframe: this.currentTimeframe
	                        }
	                    }));
	                } catch (error) {
	                    console.error('Local CSV processing error:', error);
	                    console.error('Stack trace:', error.stack);
	                    alert(`Failed to process CSV file locally: ${error.message}`);
	                } finally {
	                    csvBtn.innerHTML = originalHTML;
	                    this.isLoading = false;
	                    csvInput.value = ''; // Reset input
	                }
	            };
	            reader.onerror = (error) => {
	                console.error('File reading error:', error);
	                alert('Failed to read CSV file.');
	                csvBtn.innerHTML = originalHTML;
	                this.isLoading = false;
	                csvInput.value = ''; // Reset input
	            };
	            
	            // Start reading the file
	            reader.readAsText(file);
        });
    }
    
    setupKeyboardShortcuts() {
        // Use the new KeyboardShortcutsManager if available
        if (typeof KeyboardShortcutsManager !== 'undefined') {
            this.keyboardShortcuts = new KeyboardShortcutsManager(this);
            console.log('⌨️ TradingView-style keyboard shortcuts initialized');
        } else {
            // Fallback to basic shortcuts
            console.warn('⚠️ KeyboardShortcutsManager not found, using basic shortcuts');
            this.setupBasicKeyboardShortcuts();
        }
    }
    
    /**
     * Fallback basic keyboard shortcuts (if module not loaded)
     */
    setupBasicKeyboardShortcuts() {
        // Track CTRL key state for tooltip visibility (show only when CTRL is pressed)
        this.ctrlPressed = false;
        
        document.addEventListener('keydown', (e) => {
            // Track CTRL key for tooltip showing
            if (e.key === 'Control') {
                this.ctrlPressed = true;
            }
            
            // Escape - deselect tool
            if (e.key === 'Escape') {
                this.setTool('cursor');
                this.selectedDrawing = null;
                this.hideContextMenu();
            }
            // Delete/Backspace - delete selected drawing
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedDrawing !== null) {
                const deletedDrawing = this.drawings[this.selectedDrawing];
                this.drawings.splice(this.selectedDrawing, 1);
                this.selectedDrawing = null;
                this.hideContextMenu();
                // Sync deletion to other panels
                this.syncDrawingToOtherPanels(deletedDrawing, 'delete');
                // Save to localStorage
                localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, JSON.stringify(this.drawings));
                this.needsRender = true;
            }
            // Ctrl/Cmd + Z - undo last drawing
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (this.drawings.length > 0) {
                    this.drawings.pop();
                    // Save to localStorage
                    localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, JSON.stringify(this.drawings));
                    this.needsRender = true;
                }
            }
            // Home - jump to latest candles
            if (e.key === 'Home') {
                e.preventDefault();
                console.log('🏠 Home key pressed - jumping to latest');
                this.jumpToLatest();
            }
            // M - toggle magnet mode
            if (e.key === 'm' || e.key === 'M') {
                if (this.drawingManager) {
                    const mode = this.drawingManager.toggleMagnetMode();
                    this.magnetMode = mode;
                } else {
                    const current = this.magnetMode;
                    const normalized = current === true ? 'weak' : (current === false || current == null ? 'off' : current);
                    const modes = ['off', 'weak', 'strong'];
                    const idx = modes.indexOf(normalized);
                    this.magnetMode = modes[(idx + 1) % modes.length];
                }
                this.syncMagnetButton();
                console.log('🧲 Magnet mode:', this.magnetMode);
            }
            // Ctrl/Cmd + U - unlock all drawings
            if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
                e.preventDefault();
                let unlockedCount = 0;
                this.drawings.forEach(drawing => {
                    if (drawing.locked) {
                        drawing.locked = false;
                        unlockedCount++;
                    }
                });
                if (unlockedCount > 0) {
                    console.log(`🔓 Unlocked ${unlockedCount} drawing(s)`);
                    this.scheduleRender();
                } else {
                    console.log('ℹ️ No locked drawings found');
                }
            }
            // + or = to zoom in
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoomAtCenter(1.2);
            }
            // - to zoom out
            if (e.key === '-') {
                e.preventDefault();
                this.zoomAtCenter(0.8);
            }
            // Arrow keys for navigation
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.panBy(50, 0);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.panBy(-50, 0);
            }
            // Space to reset zoom
            if (e.key === ' ') {
                e.preventDefault();
                this.resetView();
            }
            // ? - show shortcuts help
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                if (this.keyboardShortcuts) {
                    this.keyboardShortcuts.showShortcutsHelp();
                }
            }
        });
        
        // Track CTRL key release - hide tooltip when CTRL is released
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                this.ctrlPressed = false;
                this.hideTooltip();
            }
        });
    }
  
    setupDateSearch() {
        const chart = this;
        const dateInput = document.getElementById('dateSearchInput');
        const timeInput = document.getElementById('timeSearchInput');
        const toggle = document.getElementById('goToMenuToggle');
        const menu = document.getElementById('goToMenu');
        const settingsModal = document.getElementById('goToSettingsModal');
        const settingsBody = document.getElementById('goToSettingsBody');
        const settingsSave = document.getElementById('goToSettingsSave');
        const settingsCancel = document.getElementById('goToSettingsCancel');
        const settingsCloseButtons = document.querySelectorAll('[data-go-to-settings-close]');

        console.log('📅 setupDateSearch: found elements', {
            dateInput: !!dateInput,
            timeInput: !!timeInput,
            toggle: !!toggle,
            menu: !!menu,
            settingsModal: !!settingsModal
        });

        if (!toggle || !menu) {
            console.warn('⚠️ Go To controls not found, skipping setupDateSearch');
            return;
        }

        this.dateSearchInput = dateInput || null;
        this.timeSearchInput = timeInput || null;

        this.goToPresets = this.loadGoToPresets();
        this.renderGoToMenu(menu);

        const openMenu = () => {
            // Move menu to body to escape any parent clipping
            if (menu.parentElement !== document.body) {
                document.body.appendChild(menu);
            }
            
            this.renderGoToMenu(menu);
            menu.classList.add('open');
            menu.style.position = 'fixed';
            menu.style.zIndex = '100000';

            const rect = toggle.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

            const menuWidth = menu.offsetWidth || 680;
            const menuHeight = menu.offsetHeight || 400;

            let left = rect.left;
            let top = rect.bottom + 8;

            // Keep menu within viewport
            if (left + menuWidth > viewportWidth - 8) {
                left = viewportWidth - menuWidth - 8;
            }
            if (left < 8) left = 8;

            if (top + menuHeight > viewportHeight - 8) {
                top = rect.top - menuHeight - 8;
            }
            if (top < 8) top = 8;

            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.visibility = 'visible';
            
            console.log('📅 Go To menu opened at', left, top);
        };

        const closeMenu = () => {
            menu.classList.remove('open');
            menu.style.visibility = '';
            menu.style.position = '';
            menu.style.left = '';
            menu.style.top = '';
        };

        const openSettingsModal = () => {
            if (!settingsModal || !settingsBody) return;
            this.renderGoToSettings(settingsBody);
            settingsModal.classList.add('open');
            settingsModal.setAttribute('aria-hidden', 'false');
        };

        const closeSettingsModal = () => {
            if (!settingsModal) return;
            settingsModal.classList.remove('open');
            settingsModal.setAttribute('aria-hidden', 'true');
        };

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.classList.contains('open')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        document.addEventListener('click', (e) => {
            if (!menu.classList.contains('open')) return;
            if (menu.contains(e.target) || toggle.contains(e.target)) return;
            closeMenu();
        });

        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-go-action]');
            if (!btn) return;

            const action = btn.dataset.goAction;
            
            if (action === 'close-menu') {
                closeMenu();
                return;
            }
            
            if (action === 'go-to-customize') {
                closeMenu();
                openSettingsModal();
                return;
            }

            closeMenu();
            this.handleGoToAction(action);
        });

        if (settingsSave) {
            settingsSave.addEventListener('click', () => {
                this.saveGoToSettings(settingsBody);
                closeSettingsModal();
                this.renderGoToMenu(menu);
            });
        }

        if (settingsCancel) {
            settingsCancel.addEventListener('click', () => {
                closeSettingsModal();
            });
        }

        settingsCloseButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                closeSettingsModal();
            });
        });

        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    closeSettingsModal();
                }
            });
        }

        this.updateDateRange();
        
        // Listen for timezone changes to update the menu label
        if (window.timezoneManager) {
            window.timezoneManager.addListener(() => {
                // Re-render Go To menu when timezone changes
                if (menu) {
                    this.renderGoToMenu(menu);
                }
            });
        }
    }

    loadGoToPresets() {
        const defaultPresets = {
            nextSession: {
                asian: { enabled: false, hour: 19, minute: 0 },
                london: { enabled: false, hour: 2, minute: 0 },
                newYork: { enabled: true, hour: 8, minute: 0 }
            },
            nextDayOpen: { enabled: true, hour: 17, minute: 0 },
            silverBullet: {
                london: { enabled: false, hour: 3, minute: 0 },
                nyAm: { enabled: false, hour: 10, minute: 0 },
                nyPm: { enabled: false, hour: 14, minute: 0 }
            }
        };

        try {
            const stored = window.localStorage.getItem('goToPresets');
            if (!stored) return defaultPresets;
            const parsed = JSON.parse(stored);
            return {
                nextSession: { ...defaultPresets.nextSession, ...(parsed.nextSession || {}) },
                nextDayOpen: { ...defaultPresets.nextDayOpen, ...(parsed.nextDayOpen || {}) },
                silverBullet: { ...defaultPresets.silverBullet, ...(parsed.silverBullet || {}) }
            };
        } catch (err) {
            console.warn('Failed to load go-to presets, using defaults', err);
            return defaultPresets;
        }
    }

    saveGoToSettings(settingsBody) {
        if (!settingsBody) return;
        const formData = new FormData(settingsBody.querySelector('form') || settingsBody);

        const readToggle = (name, fallback) => formData.get(`${name}-enabled`) === 'on' ? true : false;
        const readTime = (name, fallbackHour = 0, fallbackMinute = 0) => {
            const value = formData.get(`${name}-time`);
            if (!value) return { hour: fallbackHour, minute: fallbackMinute };
            const [h, m] = value.split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) {
                return { hour: h, minute: m };
            }
            return { hour: fallbackHour, minute: fallbackMinute };
        };

        this.goToPresets = {
            nextSession: {
                asian: { enabled: readToggle('next-session-asian'), ...readTime('next-session-asian', 19, 0) },
                london: { enabled: readToggle('next-session-london'), ...readTime('next-session-london', 2, 0) },
                newYork: { enabled: readToggle('next-session-ny'), ...readTime('next-session-ny', 8, 0) }
            },
            nextDayOpen: {
                enabled: readToggle('next-day-open'),
                ...readTime('next-day-open', 17, 0)
            },
            silverBullet: {
                london: { enabled: readToggle('silver-bullet-london'), ...readTime('silver-bullet-london', 3, 0) },
                nyAm: { enabled: readToggle('silver-bullet-ny-am'), ...readTime('silver-bullet-ny-am', 10, 0) },
                nyPm: { enabled: readToggle('silver-bullet-ny-pm'), ...readTime('silver-bullet-ny-pm', 14, 0) }
            }
        };

        try {
            window.localStorage.setItem('goToPresets', JSON.stringify(this.goToPresets));
        } catch (err) {
            console.warn('Failed to save go-to presets', err);
        }
    }

    renderGoToMenu(menu) {
        if (!menu) return;
        const chart = this;
        const presets = this.goToPresets || this.loadGoToPresets();
        
        // Helper to convert session time from base timezone (EST = -5) to current chart timezone
        const convertTimeToChartTz = (hour, minute, baseOffsetHours = -5) => {
            const tm = window.timezoneManager;
            if (!tm) return { hour, minute };
            
            const chartOffset = tm.getOffset();
            const diffHours = chartOffset - baseOffsetHours;
            
            let newHour = hour + diffHours;
            while (newHour < 0) newHour += 24;
            while (newHour >= 24) newHour -= 24;
            
            return { hour: newHour, minute };
        };
        
        // Format time helper
        const formatTime = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        
        // Convert all preset times
        const dayOpenConverted = convertTimeToChartTz(presets.nextDayOpen.hour, presets.nextDayOpen.minute);
        const asianConverted = convertTimeToChartTz(presets.nextSession.asian.hour, presets.nextSession.asian.minute);
        const londonConverted = convertTimeToChartTz(presets.nextSession.london.hour, presets.nextSession.london.minute);
        const nyConverted = convertTimeToChartTz(presets.nextSession.newYork.hour, presets.nextSession.newYork.minute);
        const sbLondonConverted = convertTimeToChartTz(presets.silverBullet.london.hour, presets.silverBullet.london.minute);
        const sbNyAmConverted = convertTimeToChartTz(presets.silverBullet.nyAm.hour, presets.silverBullet.nyAm.minute);
        const sbNyPmConverted = convertTimeToChartTz(presets.silverBullet.nyPm.hour, presets.silverBullet.nyPm.minute);
        
        const tzLabel = window.timezoneManager ? window.timezoneManager.getShortLabel() : 'UTC';

        const html = `
            <!-- Header -->
            <div class="go-to-menu-inputs">
                <!-- Date/Time Input -->
                <div class="go-to-input-group">
                    <div class="go-to-input-label">Date & Time <span class="tz-badge">${tzLabel}</span></div>
                    <div class="go-to-input-row">
                        <input type="date" id="goToDateInput" class="go-to-input" style="flex: 1.2;">
                        <input type="time" id="goToTimeInput" class="go-to-input" style="flex: 0.8;">
                        <button type="button" class="go-to-input-btn" id="goToDateBtn">Go</button>
                    </div>
                </div>
                <!-- Price Input -->
                <div class="go-to-input-group">
                    <div class="go-to-input-label">Price Level</div>
                    <div class="go-to-input-row">
                        <input type="number" step="any" id="goToPriceInput" class="go-to-input" placeholder="Enter price...">
                        <button type="button" class="go-to-input-btn" id="goToPriceBtn">Go</button>
                    </div>
                </div>
            </div>
            
            <!-- Quick Actions Grid -->
            <div class="go-to-quick-actions">
                ${presets.nextDayOpen.enabled ? `
                <button type="button" class="go-to-quick-btn" data-go-action="preset-next-day-open">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                    <span>Day Open</span>
                    <span class="time-badge">${formatTime(dayOpenConverted.hour, dayOpenConverted.minute)}</span>
                </button>` : ''}
                <button type="button" class="go-to-quick-btn" data-go-action="next-week-open">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 16l2 2 4-4"/></svg>
                    <span>Week Open</span>
                </button>
                <button type="button" class="go-to-quick-btn" data-go-action="next-month-open">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><circle cx="12" cy="16" r="2"/></svg>
                    <span>Month Open</span>
                </button>
                <button type="button" class="go-to-quick-btn" data-go-action="prev-high">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    <span>Prev High</span>
                </button>
                <button type="button" class="go-to-quick-btn" data-go-action="prev-low">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    <span>Prev Low</span>
                </button>
            </div>
            
            <!-- Sessions Section -->
            ${(presets.nextSession.asian.enabled || presets.nextSession.london.enabled || presets.nextSession.newYork.enabled) ? `
            <div class="go-to-section-title">Sessions</div>
            <div class="go-to-list">
                ${presets.nextSession.asian.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-asian">
                    <span>🌏 Asian Session</span>
                    <span class="item-time">${formatTime(asianConverted.hour, asianConverted.minute)}</span>
                </button>` : ''}
                ${presets.nextSession.london.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-london">
                    <span>🇬🇧 London Session</span>
                    <span class="item-time">${formatTime(londonConverted.hour, londonConverted.minute)}</span>
                </button>` : ''}
                ${presets.nextSession.newYork.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-new-york">
                    <span>🇺🇸 New York Session</span>
                    <span class="item-time">${formatTime(nyConverted.hour, nyConverted.minute)}</span>
                </button>` : ''}
            </div>` : ''}
            
            <!-- Silver Bullet Section -->
            ${(presets.silverBullet.london.enabled || presets.silverBullet.nyAm.enabled || presets.silverBullet.nyPm.enabled) ? `
            <div class="go-to-section-title">Silver Bullet</div>
            <div class="go-to-list">
                ${presets.silverBullet.london.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-sb-london">
                    <span>London SB</span>
                    <span class="item-time">${formatTime(sbLondonConverted.hour, sbLondonConverted.minute)}</span>
                </button>` : ''}
                ${presets.silverBullet.nyAm.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-sb-ny-am">
                    <span>NY AM SB</span>
                    <span class="item-time">${formatTime(sbNyAmConverted.hour, sbNyAmConverted.minute)}</span>
                </button>` : ''}
                ${presets.silverBullet.nyPm.enabled ? `
                <button type="button" class="go-to-list-item" data-go-action="preset-sb-ny-pm">
                    <span>NY PM SB</span>
                    <span class="item-time">${formatTime(sbNyPmConverted.hour, sbNyPmConverted.minute)}</span>
                </button>` : ''}
            </div>` : ''}
            
            <!-- Footer -->
            <div class="go-to-menu-footer">
                <button type="button" class="go-to-settings-btn go-to-menu-item" data-go-action="go-to-customize">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Settings
                </button>
            </div>
        `;

        menu.innerHTML = html;
        
        // Add close button handler
        const closeBtn = menu.querySelector('.go-to-menu-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                menu.classList.remove('open');
            });
        }
        
        // Price input handler
        const priceInput = menu.querySelector('#goToPriceInput');
        const priceBtn = menu.querySelector('#goToPriceBtn');
        if (priceInput && priceBtn) {
            const handlePriceJump = () => {
                const price = parseFloat(priceInput.value);
                if (!isNaN(price)) {
                    chart.jumpToPrice(price);
                    menu.classList.remove('open');
                }
            };
            priceBtn.addEventListener('click', handlePriceJump);
            priceInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handlePriceJump();
            });
        }
        
        // Date/Time input handler
        const dateInput = menu.querySelector('#goToDateInput');
        const timeInput = menu.querySelector('#goToTimeInput');
        const dateBtn = menu.querySelector('#goToDateBtn');
        
        // Set default values from current data (in current timezone)
        if (dateInput && this.data && this.data.length > 0) {
            const currentIndex = this.replaySystem?.currentIndex || this.data.length - 1;
            const currentBar = this.data[Math.min(currentIndex, this.data.length - 1)];
            if (currentBar) {
                // Convert to current timezone
                const tm = window.timezoneManager;
                const d = tm ? tm.convertToTimezone(currentBar.t) : new Date(currentBar.t);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dateInput.value = `${year}-${month}-${day}`;
                if (timeInput) {
                    timeInput.value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                }
            }
        }
        
        if (dateInput && dateBtn) {
            const handleDateJump = () => {
                let dateStr = dateInput.value;
                if (!dateStr) return;
                
                let timeStr = '00:00';
                if (timeInput && timeInput.value) {
                    timeStr = timeInput.value;
                }
                
                // Parse date/time as if it's in the selected timezone
                const [year, month, day] = dateStr.split('-').map(Number);
                const [hour, minute] = timeStr.split(':').map(Number);
                
                // Create a date in local time first
                const localDate = new Date(year, month - 1, day, hour, minute, 0);
                
                // Convert from selected timezone to UTC
                // The user entered a time in the chart's timezone, but Date() interprets it as local browser time
                // We need to adjust for the difference between browser timezone and chart timezone
                const tm = window.timezoneManager;
                let targetTimestamp = localDate.getTime();
                
                if (tm) {
                    // Get browser's local timezone offset in ms
                    const browserOffset = -localDate.getTimezoneOffset() * 60 * 1000;
                    // Get chart's timezone offset in ms
                    const chartOffset = tm.getOffsetMs();
                    // Adjust: remove browser offset, add chart offset to get the correct UTC time
                    targetTimestamp = targetTimestamp + browserOffset - chartOffset;
                }
                
                if (!isNaN(targetTimestamp)) {
                    chart.jumpToTimestamp(targetTimestamp);
                    menu.classList.remove('open');
                }
            };
            dateBtn.addEventListener('click', handleDateJump);
            dateInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleDateJump();
            });
            if (timeInput) {
                timeInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') handleDateJump();
                });
            }
        }
    }
    
    /**
     * Jump to price level
     */
    jumpToPrice(targetPrice) {
        if (!this.data || this.data.length === 0) {
            console.warn('No data loaded');
            return;
        }
        
        let sourceData = this.data;
        let usingReplay = false;
        let currentIndex = this.data.length - 1;
        
        if (this.replaySystem && this.replaySystem.isActive &&
            Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
            sourceData = this.replaySystem.fullRawData;
            usingReplay = true;
            currentIndex = this.replaySystem.currentIndex;
        }
        
        // Find next bar that touches this price
        let targetIndex = -1;
        for (let i = currentIndex + 1; i < sourceData.length; i++) {
            const bar = sourceData[i];
            if (bar.h >= targetPrice && bar.l <= targetPrice) {
                targetIndex = i;
                break;
            }
        }
        
        if (targetIndex === -1) {
            // Try searching backwards
            for (let i = currentIndex - 1; i >= 0; i--) {
                const bar = sourceData[i];
                if (bar.h >= targetPrice && bar.l <= targetPrice) {
                    targetIndex = i;
                    break;
                }
            }
        }
        
        if (targetIndex === -1) {
            console.log('📍 No bar found at price', targetPrice);
            return;
        }
        
        if (usingReplay) {
            this.replaySystem.currentIndex = targetIndex;
            this.replaySystem.updateChartData(true);
        } else {
            const targetBar = sourceData[targetIndex];
            const targetDate = new Date(targetBar.t);
            const dateStr = this.formatDateForInput(targetDate);
            this.jumpToDate(dateStr);
        }
        
        console.log('📍 Jumped to price', targetPrice, 'at index', targetIndex);
    }
    
    /**
     * Center the chart view on a specific price level (adjusts Y-axis only)
     */
    centerOnPrice(targetPrice) {
        if (!this.yScale) return;
        
        const domain = this.yScale.domain();
        const range = domain[1] - domain[0];
        const newMin = targetPrice - range / 2;
        const newMax = targetPrice + range / 2;
        
        // Temporarily disable auto-scale
        this.autoScale = false;
        this.yScale.domain([newMin, newMax]);
        this.scheduleRender();
        
        console.log('📍 Centered on price', targetPrice);
    }

    renderGoToSettings(container) {
        if (!container) return;
        const presets = this.goToPresets || this.loadGoToPresets();

        const renderToggleRow = (name, label, data) => {
            const timeValue = `${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')}`;
            return `
                <div class="go-to-settings-row${data.enabled ? '' : ' disabled'}" data-row-for="${name}">
                    <label>
                        <span class="go-to-toggle">
                            <input type="checkbox" name="${name}-enabled"${data.enabled ? ' checked' : ''}>
                            <span class="go-to-toggle-slider"></span>
                        </span>
                        <span>${label}</span>
                    </label>
                    <select name="${name}-time" class="go-to-settings-select"${data.enabled ? '' : ' disabled'}>
                        ${this.renderTimeOptions(timeValue)}
                    </select>
                </div>
            `;
        };

        const html = `
            <form class="go-to-settings-form">
                <div class="go-to-settings-section">
                    <div class="go-to-settings-section-title">Next session settings</div>
                    ${renderToggleRow('next-session-asian', 'Start of Asian Session (New York Time)', presets.nextSession.asian)}
                    ${renderToggleRow('next-session-london', 'Start of London Session (New York Time)', presets.nextSession.london)}
                    ${renderToggleRow('next-session-ny', 'Start of New York Session (New York Time)', presets.nextSession.newYork)}
                </div>
                <div class="go-to-settings-section">
                    <div class="go-to-settings-section-title">Next day open settings</div>
                    ${renderToggleRow('next-day-open', 'Next Day Open (New York Time)', presets.nextDayOpen)}
                </div>
                <div class="go-to-settings-section">
                    <div class="go-to-settings-section-title">Next silver bullet session settings</div>
                    ${renderToggleRow('silver-bullet-london', 'Start of Silver Bullet London Session (New York Time)', presets.silverBullet.london)}
                    ${renderToggleRow('silver-bullet-ny-am', 'Start of NY AM Session (New York Time)', presets.silverBullet.nyAm)}
                    ${renderToggleRow('silver-bullet-ny-pm', 'Start of NY PM Session (New York Time)', presets.silverBullet.nyPm)}
                </div>
            </form>
        `;

        container.innerHTML = html;

        container.querySelectorAll('.go-to-settings-row input[type="checkbox"]').forEach((toggle) => {
            toggle.addEventListener('change', (e) => {
                const row = e.target.closest('.go-to-settings-row');
                if (!row) return;
                const select = row.querySelector('select');
                if (!select) return;
                if (e.target.checked) {
                    row.classList.remove('disabled');
                    select.disabled = false;
                } else {
                    row.classList.add('disabled');
                    select.disabled = true;
                }
            });
        });
    }

    renderTimeOptions(selected = '08:00') {
        const options = [];
        for (let hour = 0; hour < 24; hour++) {
            const value = `${String(hour).padStart(2, '0')}:00`;
            options.push(`<option value="${value}"${selected === value ? ' selected' : ''}>${value}</option>`);
        }
        return options.join('');
    }

    getEnabledGoToItems() {
        const presets = this.goToPresets || this.loadGoToPresets();
        const items = [];

        const pushSession = (key, label, data) => {
            if (!data || !data.enabled) return;
            items.push({
                action: `preset-${key}`,
                label
            });
        };

        pushSession('next-session-asian', 'Start of Asian Session (New York Time)', presets.nextSession.asian);
        pushSession('next-session-london', 'Start of London Session (New York Time)', presets.nextSession.london);
        pushSession('next-session-ny', 'Start of New York Session (New York Time)', presets.nextSession.newYork);

        if (presets.nextDayOpen.enabled) {
            items.push({ action: 'preset-next-day-open', label: 'Next Day Open (New York Time)' });
        }

        pushSession('silver-bullet-london', 'Start of Silver Bullet London Session (New York Time)', presets.silverBullet.london);
        pushSession('silver-bullet-ny-am', 'Start of NY AM Session (New York Time)', presets.silverBullet.nyAm);
        pushSession('silver-bullet-ny-pm', 'Start of NY PM Session (New York Time)', presets.silverBullet.nyPm);

        return items;
    }

    handleGoToAction(action) {
        if (!action) return;

        if (action.startsWith('preset-')) {
            this.goToPreset(action.replace('preset-', ''));
            return;
        }

        // Handle menu actions
        switch (action) {
            case 'next-day-open':
                this.goToNextDayOpen();
                break;
            case 'next-ny-session':
            case 'new-york':
                this.goToNextNySession();
                break;
            case 'london':
                this.goToNextSession(2, 0); // 02:00
                break;
            case 'asian':
                this.goToNextSession(19, 0); // 19:00
                break;
            case 'silver-bullet':
                this.goToNextSession(10, 0); // 10:00
                break;
            case 'next-week-open':
                this.goToNextWeekOpen();
                break;
            case 'next-month-open':
                this.goToNextMonthOpen();
                break;
            case 'prev-high':
                this.goToPreviousDayHigh();
                break;
            case 'prev-low':
                this.goToPreviousDayLow();
                break;
            case 'prev-asian-high':
                this.goToPreviousAsianHigh();
                break;
            case 'prev-asian-low':
                this.goToPreviousAsianLow();
                break;
            case 'go-to-customize':
                // This is handled in the menu click handler
                break;
            default:
                console.warn('Unhandled go-to action', action);
        }
    }
    
    /**
     * Jump to next occurrence of a specific hour:minute
     */
    goToNextSession(targetHour, targetMinute = 0) {
        this.jumpToNextMatchingBar((current, candidate) => {
            const currentTs = current.t;
            const candidateTs = candidate.t;
            if (candidateTs <= currentTs) return false;
            
            const d = new Date(candidateTs);
            return d.getHours() === targetHour && d.getMinutes() >= targetMinute;
        }, { alertMessage: `No session found at ${targetHour}:${String(targetMinute).padStart(2, '0')}` });
    }
    
    /**
     * Jump to previous day's high
     */
    goToPreviousDayHigh() {
        const prevDayHigh = this.findPreviousDayHigh();
        if (prevDayHigh !== null) {
            this.jumpToPrice(prevDayHigh);
        }
    }
    
    /**
     * Jump to previous day's low
     */
    goToPreviousDayLow() {
        const prevDayLow = this.findPreviousDayLow();
        if (prevDayLow !== null) {
            this.jumpToPrice(prevDayLow);
        }
    }
    
    /**
     * Find previous day's high price
     */
    findPreviousDayHigh() {
        if (!this.data || this.data.length < 2) return null;
        
        const currentIndex = this.replaySystem?.currentIndex || this.data.length - 1;
        const currentBar = this.data[currentIndex];
        const currentDate = new Date(currentBar.t);
        const currentDay = currentDate.toDateString();
        
        let prevDayHigh = -Infinity;
        let foundPrevDay = false;
        
        for (let i = currentIndex - 1; i >= 0; i--) {
            const bar = this.data[i];
            const barDate = new Date(bar.t);
            const barDay = barDate.toDateString();
            
            if (barDay !== currentDay) {
                foundPrevDay = true;
                if (bar.h > prevDayHigh) prevDayHigh = bar.h;
            } else if (foundPrevDay) {
                break; // We've gone past the previous day
            }
        }
        
        return foundPrevDay ? prevDayHigh : null;
    }
    
    /**
     * Find previous day's low price
     */
    findPreviousDayLow() {
        if (!this.data || this.data.length < 2) return null;
        
        const currentIndex = this.replaySystem?.currentIndex || this.data.length - 1;
        const currentBar = this.data[currentIndex];
        const currentDate = new Date(currentBar.t);
        const currentDay = currentDate.toDateString();
        
        let prevDayLow = Infinity;
        let foundPrevDay = false;
        
        for (let i = currentIndex - 1; i >= 0; i--) {
            const bar = this.data[i];
            const barDate = new Date(bar.t);
            const barDay = barDate.toDateString();
            
            if (barDay !== currentDay) {
                foundPrevDay = true;
                if (bar.l < prevDayLow) prevDayLow = bar.l;
            } else if (foundPrevDay) {
                break;
            }
        }
        
        return foundPrevDay ? prevDayLow : null;
    }
    
    /**
     * Go to previous Asian session high
     */
    goToPreviousAsianHigh() {
        const asianHigh = this.findAsianSessionHigh();
        if (asianHigh !== null) {
            this.jumpToPrice(asianHigh);
        } else {
            console.log('No Asian session high found');
        }
    }
    
    /**
     * Go to previous Asian session low
     */
    goToPreviousAsianLow() {
        const asianLow = this.findAsianSessionLow();
        if (asianLow !== null) {
            this.jumpToPrice(asianLow);
        } else {
            console.log('No Asian session low found');
        }
    }
    
    /**
     * Find Asian session high (19:00 - 02:00)
     */
    findAsianSessionHigh() {
        if (!this.data || this.data.length < 2) return null;
        
        const currentIndex = this.replaySystem?.currentIndex || this.data.length - 1;
        let asianHigh = -Infinity;
        let found = false;
        
        for (let i = currentIndex - 1; i >= 0; i--) {
            const bar = this.data[i];
            const d = new Date(bar.t);
            const hour = d.getHours();
            
            // Asian session: 19:00 - 02:00
            if (hour >= 19 || hour < 2) {
                found = true;
                if (bar.h > asianHigh) asianHigh = bar.h;
            } else if (found) {
                break; // Finished the Asian session
            }
        }
        
        return found ? asianHigh : null;
    }
    
    /**
     * Find Asian session low (19:00 - 02:00)
     */
    findAsianSessionLow() {
        if (!this.data || this.data.length < 2) return null;
        
        const currentIndex = this.replaySystem?.currentIndex || this.data.length - 1;
        let asianLow = Infinity;
        let found = false;
        
        for (let i = currentIndex - 1; i >= 0; i--) {
            const bar = this.data[i];
            const d = new Date(bar.t);
            const hour = d.getHours();
            
            // Asian session: 19:00 - 02:00
            if (hour >= 19 || hour < 2) {
                found = true;
                if (bar.l < asianLow) asianLow = bar.l;
            } else if (found) {
                break;
            }
        }
        
        return found ? asianLow : null;
    }

    goToNextWeekOpen() {
        this.jumpToNextMatchingBar((current, candidate) => {
            const currentDate = new Date(current.t);
            const candidateDate = new Date(candidate.t);
            // Monday = 1, check if candidate is start of next week
            return candidateDate.getDay() === 1 && 
                   candidateDate.getHours() === 0 && 
                   candidateDate > currentDate;
        }, { alertMessage: 'No next week open found in data.' });
    }

    goToNextMonthOpen() {
        this.jumpToNextMatchingBar((current, candidate) => {
            const currentDate = new Date(current.t);
            const candidateDate = new Date(candidate.t);
            // First day of month
            return candidateDate.getDate() === 1 && 
                   candidateDate.getHours() === 0 && 
                   candidateDate > currentDate;
        }, { alertMessage: 'No next month open found in data.' });
    }

    openCustomDatePicker() {
        const dateStr = prompt('Enter date (YYYY-MM-DD HH:MM):');
        if (!dateStr) return;
        
        const targetDate = new Date(dateStr);
        if (isNaN(targetDate.getTime())) {
            alert('Invalid date format. Please use YYYY-MM-DD HH:MM');
            return;
        }
        
        this.jumpToDate(targetDate);
    }

    openPriceJump() {
        const priceStr = prompt('Enter price to jump to:');
        if (!priceStr) return;
        
        const targetPrice = parseFloat(priceStr);
        if (isNaN(targetPrice)) {
            alert('Invalid price');
            return;
        }
        
        // Find bar closest to this price
        this.jumpToNextMatchingBar((current, candidate) => {
            return candidate.h >= targetPrice && candidate.l <= targetPrice;
        }, { alertMessage: 'No bar found at this price level.' });
    }

    goToPreset(key) {
        const presets = this.goToPresets || this.loadGoToPresets();

        const findPreset = (lookupKey) => {
            // Session presets
            if (lookupKey === 'next-session-asian' || lookupKey === 'asian') return presets.nextSession.asian;
            if (lookupKey === 'next-session-london' || lookupKey === 'london') return presets.nextSession.london;
            if (lookupKey === 'next-session-ny' || lookupKey === 'new-york') return presets.nextSession.newYork;
            // Next day open
            if (lookupKey === 'next-day-open') return presets.nextDayOpen;
            // Silver bullet presets
            if (lookupKey === 'silver-bullet-london' || lookupKey === 'sb-london') return presets.silverBullet.london;
            if (lookupKey === 'silver-bullet-ny-am' || lookupKey === 'sb-ny-am') return presets.silverBullet.nyAm;
            if (lookupKey === 'silver-bullet-ny-pm' || lookupKey === 'sb-ny-pm') return presets.silverBullet.nyPm;
            return null;
        };

        const preset = findPreset(key);
        if (!preset) {
            console.warn('Preset not found:', key);
            return;
        }
        
        if (!preset.enabled) {
            console.log('Preset is disabled:', key);
            return;
        }

        if (key === 'next-day-open') {
            this.goToNextDayOpenCustom(preset.hour, preset.minute);
            return;
        }

        this.goToNextSessionCustom(preset.hour, preset.minute);
    }

    goToNextDayOpenCustom(hour, minute) {
        this.jumpToNextMatchingBar((current, candidate, indexData) => {
            const currentDate = new Date(current.t);
            const candidateDate = new Date(candidate.t);
            const candIsNextDay = this.isNextDay(currentDate, candidateDate);
            return candIsNextDay && candidateDate.getHours() === hour && candidateDate.getMinutes() >= minute;
        }, { alertMessage: 'No next day open found in data.', fallback: () => this.goToNextDayOpen() });
    }

    goToNextSessionCustom(hour, minute) {
        const targetMinutes = (hour * 60) + minute;

        this.jumpToNextMatchingBar((current, candidate) => {
            if (!candidate) return false;

            const candidateDate = new Date(candidate.t);
            const currentDate = new Date(current.t);

            const candidateMinutes = (candidateDate.getHours() * 60) + candidateDate.getMinutes();
            const currentMinutes = (currentDate.getHours() * 60) + currentDate.getMinutes();

            const sameDay = candidateDate.getFullYear() === currentDate.getFullYear()
                && candidateDate.getMonth() === currentDate.getMonth()
                && candidateDate.getDate() === currentDate.getDate();

            if (sameDay) {
                if (currentMinutes >= targetMinutes) {
                    return false; // already past target time today, wait for next day
                }
                return candidateMinutes >= targetMinutes;
            }

            return candidateMinutes >= targetMinutes;
        }, { alertMessage: 'No matching session found in data.' });
    }

    isNextDay(currentDate, candidateDate) {
        if (!currentDate || !candidateDate) return false;
        const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const candidateDay = new Date(candidateDate.getFullYear(), candidateDate.getMonth(), candidateDate.getDate());
        const diff = (candidateDay - currentDay) / (24 * 60 * 60 * 1000);
        return diff >= 1;
    }

    jumpToNextMatchingBar(matcher, { alertMessage = 'No matching time found.', fallback = null } = {}) {
        if (!this.data || this.data.length === 0) {
            alert('No data loaded. Please upload a CSV file first.');
            return;
        }

        let sourceData = this.data;
        let usingReplay = false;
        let currentIndex = this.data.length - 1;

        if (this.replaySystem && this.replaySystem.isActive &&
            Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
            sourceData = this.replaySystem.fullRawData;
            usingReplay = true;
            currentIndex = this.replaySystem.currentIndex;
        }

        if (!sourceData || sourceData.length === 0) {
            alert('No data available to jump.');
            return;
        }

        const currentBar = sourceData[Math.max(0, Math.min(currentIndex, sourceData.length - 1))];
        let targetIndex = -1;

        for (let i = currentIndex + 1; i < sourceData.length; i++) {
            const candidate = sourceData[i];
            if (matcher(currentBar, candidate, sourceData, i)) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            if (fallback) {
                fallback();
                return;
            }
            alert(alertMessage);
            return;
        }

        const targetBar = sourceData[targetIndex];
        const targetDate = new Date(targetBar.t);

        if (usingReplay) {
            this.replaySystem.currentIndex = targetIndex;
            this.replaySystem.updateChartData(true);
        } else {
            const dateStr = this.formatDateForInput(targetDate);
            const hh = String(targetDate.getHours()).padStart(2, '0');
            const mm = String(targetDate.getMinutes()).padStart(2, '0');
            const ss = String(targetDate.getSeconds()).padStart(2, '0');
            if (this.dateSearchInput) this.dateSearchInput.value = dateStr;
            if (this.timeSearchInput) this.timeSearchInput.value = `${hh}:${mm}:${ss}`;
            this.jumpToDate(dateStr);
        }
    }
    
    /**
     * Update the date input min/max based on available data
     */
    updateDateRange() {
        if (!this.dateSearchInput) return;
        
        // If no data, clear constraints and disable
        if (!this.data || this.data.length === 0) {
            this.dateSearchInput.removeAttribute('min');
            this.dateSearchInput.removeAttribute('max');
            this.dateSearchInput.setAttribute('title', 'No data loaded - please upload a CSV file');
            this.dateSearchInput.disabled = true;
            if (this.timeSearchInput) {
                this.timeSearchInput.disabled = true;
            }
            if (this.goToDateTimeBtn) {
                this.goToDateTimeBtn.disabled = true;
            }
            if (this.dateTimePickerToggle) {
                this.dateTimePickerToggle.disabled = true;
                this.dateTimePickerToggle.style.opacity = '0.5';
                this.dateTimePickerToggle.style.cursor = 'not-allowed';
            }
            return;
        }
        
        // Enable the inputs
        this.dateSearchInput.disabled = false;
        if (this.timeSearchInput) {
            this.timeSearchInput.disabled = false;
        }
        if (this.goToDateTimeBtn) {
            this.goToDateTimeBtn.disabled = false;
        }
        if (this.dateTimePickerToggle) {
            this.dateTimePickerToggle.disabled = false;
            this.dateTimePickerToggle.style.opacity = '';
            this.dateTimePickerToggle.style.cursor = 'pointer';
        }
        
        // Find min and max dates in the data
        let timestampsSource = this.data;
        if (this.replaySystem && Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
            // In replay mode, use the full replay dataset for date limits so the picker
            // can jump anywhere in the session, not just the currently visible slice.
            timestampsSource = this.replaySystem.fullRawData;
        }

        const timestamps = timestampsSource.map(d => d.t);
        const minTimestamp = Math.min(...timestamps);
        const maxTimestamp = Math.max(...timestamps);
        
        // Convert to YYYY-MM-DD format for date input
        const minDate = new Date(minTimestamp);
        const maxDate = new Date(maxTimestamp);
        
        const minDateStr = this.formatDateForInput(minDate);
        const maxDateStr = this.formatDateForInput(maxDate);
        
        // Set min and max attributes on the date input
        this.dateSearchInput.setAttribute('min', minDateStr);
        this.dateSearchInput.setAttribute('max', maxDateStr);
        
        // Set tooltip to show the date range
        const dateRangeText = `Available dates: ${minDate.toLocaleDateString()} to ${maxDate.toLocaleDateString()}`;
        this.dateSearchInput.setAttribute('title', dateRangeText);
        
        // Store range for custom picker
        this.dateRangeMin = minDate;
        this.dateRangeMax = maxDate;
        
        console.log(`📅 Date range updated: ${minDateStr} to ${maxDateStr}`);
        console.log(`   ${this.data.length} candles available`);
    }
    
    /**
     * Format date for HTML5 date input (YYYY-MM-DD)
     */
    formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    /**
     * Jump helpers for preset navigation (sessions, next day, etc.)
     */
    goToNextDayOpen() {
        if (!this.data || this.data.length === 0) {
            alert('No data loaded. Please upload a CSV file first.');
            return;
        }

        // Decide data source and current index
        let sourceData = this.data;
        let usingReplay = false;
        let currentIndex = this.data.length - 1;

        if (this.replaySystem && this.replaySystem.isActive &&
            Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
            sourceData = this.replaySystem.fullRawData;
            usingReplay = true;
            currentIndex = this.replaySystem.currentIndex;
        }

        if (!sourceData || sourceData.length === 0) {
            alert('No data available to jump.');
            return;
        }

        const currentBar = sourceData[Math.max(0, Math.min(currentIndex, sourceData.length - 1))];
        const currentDate = new Date(currentBar.t);
        const cY = currentDate.getFullYear();
        const cM = currentDate.getMonth();
        const cD = currentDate.getDate();

        let targetIndex = -1;
        for (let i = currentIndex + 1; i < sourceData.length; i++) {
            const d = new Date(sourceData[i].t);
            const y = d.getFullYear();
            const m = d.getMonth();
            const day = d.getDate();
            if (y > cY || (y === cY && m > cM) || (y === cY && m === cM && day > cD)) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            alert('No later day found in data.');
            return;
        }

        const targetBar = sourceData[targetIndex];
        const targetDate = new Date(targetBar.t);

        if (usingReplay) {
            this.replaySystem.currentIndex = targetIndex;
            this.replaySystem.updateChartData(true);
        } else {
            const dateStr = this.formatDateForInput(targetDate);
            const hh = String(targetDate.getHours()).padStart(2, '0');
            const mm = String(targetDate.getMinutes()).padStart(2, '0');
            const ss = String(targetDate.getSeconds()).padStart(2, '0');
            if (this.dateSearchInput) this.dateSearchInput.value = dateStr;
            if (this.timeSearchInput) this.timeSearchInput.value = `${hh}:${mm}:${ss}`;
            this.jumpToDate(dateStr);
        }
    }

    goToNextNySession() {
        if (!this.data || this.data.length === 0) {
            alert('No data loaded. Please upload a CSV file first.');
            return;
        }

        const SESSION_HOUR = 8;
        const SESSION_MINUTE = 0;

        let sourceData = this.data;
        let usingReplay = false;
        let currentIndex = this.data.length - 1;

        if (this.replaySystem && this.replaySystem.isActive &&
            Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
            sourceData = this.replaySystem.fullRawData;
            usingReplay = true;
            currentIndex = this.replaySystem.currentIndex;
        }

        if (!sourceData || sourceData.length === 0) {
            alert('No data available to jump.');
            return;
        }

        const currentBar = sourceData[Math.max(0, Math.min(currentIndex, sourceData.length - 1))];
        const currentTs = currentBar.t;

        let targetIndex = -1;
        for (let i = currentIndex + 1; i < sourceData.length; i++) {
            const bar = sourceData[i];
            if (!bar || typeof bar.t !== 'number') continue;
            if (bar.t <= currentTs) continue;

            const d = new Date(bar.t);
            const h = d.getHours();
            const m = d.getMinutes();
            if (h > SESSION_HOUR || (h === SESSION_HOUR && m >= SESSION_MINUTE)) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex === -1) {
            alert('No later New York session start found in data.');
            return;
        }

        const targetBar = sourceData[targetIndex];
        const targetDate = new Date(targetBar.t);

        if (usingReplay) {
            this.replaySystem.currentIndex = targetIndex;
            this.replaySystem.updateChartData(true);
        } else {
            const dateStr = this.formatDateForInput(targetDate);
            const hh = String(targetDate.getHours()).padStart(2, '0');
            const mm = String(targetDate.getMinutes()).padStart(2, '0');
            const ss = String(targetDate.getSeconds()).padStart(2, '0');
            if (this.dateSearchInput) this.dateSearchInput.value = dateStr;
            if (this.timeSearchInput) this.timeSearchInput.value = `${hh}:${mm}:${ss}`;
            this.jumpToDate(dateStr);
        }
    }

    /**
     * Jump to a specific date/time on the chart
     * @param {string} dateString - Date string in YYYY-MM-DD format
     */
    jumpToDate(dateString) {
        if (!this.data || this.data.length === 0) {
            alert('No data loaded. Please upload a CSV file first.');
            return;
        }

        try {
            // Build a full date-time string using optional time input
            let dateTimeString = dateString;
            if (this.timeSearchInput && this.timeSearchInput.value) {
                // Use selected time (HH:MM) in local timezone
                dateTimeString = `${dateString}T${this.timeSearchInput.value}`;
            }

            const targetDate = new Date(dateTimeString);
            const targetTimestamp = targetDate.getTime();

            // Validate the date/time
            if (isNaN(targetTimestamp)) {
                alert('Invalid date/time');
                return;
            }

            console.log(`📅 Jumping to: ${dateTimeString}`);
            console.log(`🕐 Target timestamp: ${targetTimestamp}`);

            // Choose data source: full replay data when replay is active, otherwise current chart data
            let sourceData = this.data;
            let usingReplay = false;

            if (this.replaySystem && this.replaySystem.isActive && Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
                sourceData = this.replaySystem.fullRawData;
                usingReplay = true;
            }

            if (!sourceData || sourceData.length === 0) {
                alert('No data available to jump.');
                return;
            }

            // Find the closest candle to the target timestamp
            let closestIndex = -1;
            let minDiff = Infinity;

            for (let i = 0; i < sourceData.length; i++) {
                const diff = Math.abs(sourceData[i].t - targetTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            if (closestIndex === -1) {
                alert('Could not find data for the specified date/time');
                return;
            }

            const closestCandle = sourceData[closestIndex];
            const closestDate = new Date(closestCandle.t);
            console.log(`🎯 Closest candle found at: ${closestDate.toLocaleString()}`);
            console.log(`📍 Index: ${closestIndex} of ${sourceData.length}`);

            // Check if the date is within a reasonable range
            const daysDiff = Math.abs(targetTimestamp - closestCandle.t) / (1000 * 60 * 60 * 24);
            if (daysDiff > 30) {
                const proceed = confirm(`The closest data found is ${Math.round(daysDiff)} days away from your selected date. Continue?`);
                if (!proceed) return;
            }

            if (usingReplay) {
                // When replay is active, move replay position and let replay system handle rendering & panel sync
                this.replaySystem.currentIndex = closestIndex;
                this.replaySystem.updateChartData(true);
            } else {
                // Normal mode: center the candle on screen
                const m = this.margin;
                const cw = this.w - m.l - m.r;
                const candleSpacing = this.getCandleSpacing();

                // Position the candle in the center of the chart
                const centerX = cw / 2;
                const candleX = closestIndex * candleSpacing;
                this.offsetX = centerX - candleX;

                // Reset zoom for better visibility
                this.candleWidth = 8;
                this.priceZoom = 1;
                this.priceOffset = 0;
                this.autoScale = true;

                // Apply constraints and render
                this.constrainOffset();
                this.scheduleRender();
            }

            console.log(`✅ Jumped to ${closestDate.toLocaleString()}`);

            // Show a brief notification
            if (typeof this.showNotification === 'function') {
                this.showNotification(`Jumped to ${closestDate.toLocaleDateString()} ${closestDate.toLocaleTimeString()}`);
            }

            // Update the toggle label to reflect actual jump target
            if (this.dateTimePickerLabel) {
                const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const w = weekdays[closestDate.getDay()];
                const m = monthsShort[closestDate.getMonth()];
                const d = String(closestDate.getDate()).padStart(2, '0');
                const y = closestDate.getFullYear();
                const hh = String(closestDate.getHours()).padStart(2, '0');
                const mm = String(closestDate.getMinutes()).padStart(2, '0');
                const ss = String(closestDate.getSeconds()).padStart(2, '0');
                this.dateTimePickerLabel.textContent = `${w}, ${m} ${d}, ${y} ${hh}:${mm}:${ss}`;
            }

        } catch (error) {
            console.error('Error jumping to date/time:', error);
            alert(`Failed to jump: ${error.message}`);
        }
    }
    
    /**
     * Jump to a specific timestamp (UTC milliseconds)
     * @param {number} targetTimestamp - Unix timestamp in milliseconds
     */
    jumpToTimestamp(targetTimestamp) {
        if (!this.data || this.data.length === 0) {
            alert('No data loaded. Please upload a CSV file first.');
            return;
        }

        try {
            console.log(`📅 Jumping to timestamp: ${targetTimestamp} (${new Date(targetTimestamp).toISOString()})`);

            // Choose data source: full replay data when replay is active
            let sourceData = this.data;
            let usingReplay = false;

            if (this.replaySystem && this.replaySystem.isActive && Array.isArray(this.replaySystem.fullRawData) && this.replaySystem.fullRawData.length > 0) {
                sourceData = this.replaySystem.fullRawData;
                usingReplay = true;
            }

            if (!sourceData || sourceData.length === 0) {
                alert('No data available to jump.');
                return;
            }

            // Find the closest candle to the target timestamp
            let closestIndex = -1;
            let minDiff = Infinity;

            for (let i = 0; i < sourceData.length; i++) {
                const diff = Math.abs(sourceData[i].t - targetTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            if (closestIndex === -1) {
                alert('Could not find data for the specified date/time');
                return;
            }

            const closestCandle = sourceData[closestIndex];
            
            // Display using timezone manager
            const tm = window.timezoneManager;
            const displayDate = tm ? tm.convertToTimezone(closestCandle.t) : new Date(closestCandle.t);
            console.log(`🎯 Closest candle found at: ${tm ? tm.formatTime(closestCandle.t, 'full') : displayDate.toLocaleString()}`);

            // Check if the date is within a reasonable range
            const daysDiff = Math.abs(targetTimestamp - closestCandle.t) / (1000 * 60 * 60 * 24);
            if (daysDiff > 30) {
                const proceed = confirm(`The closest data found is ${Math.round(daysDiff)} days away from your selected date. Continue?`);
                if (!proceed) return;
            }

            if (usingReplay) {
                this.replaySystem.currentIndex = closestIndex;
                this.replaySystem.updateChartData(true);
            } else {
                const m = this.margin;
                const cw = this.w - m.l - m.r;
                const candleSpacing = this.getCandleSpacing();
                const centerX = cw / 2;
                const candleX = closestIndex * candleSpacing;
                this.offsetX = centerX - candleX;
                this.candleWidth = 8;
                this.priceZoom = 1;
                this.priceOffset = 0;
                this.autoScale = true;
                this.constrainOffset();
                this.scheduleRender();
            }

            console.log(`✅ Jumped to ${tm ? tm.formatTime(closestCandle.t, 'full') : displayDate.toLocaleString()}`);

            if (typeof this.showNotification === 'function') {
                this.showNotification(`Jumped to ${tm ? tm.formatTime(closestCandle.t, 'datetime') : displayDate.toLocaleString()}`);
            }

        } catch (error) {
            console.error('Error jumping to timestamp:', error);
            alert(`Failed to jump: ${error.message}`);
        }
    }
    
    setupTimeframeButtons() {
        const buttons = document.querySelectorAll('.timeframe-btn');
        console.log(`✓ Found ${buttons.length} timeframe buttons`);
        
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const timeframe = e.target.dataset.timeframe;
                console.log(`⏱️ Timeframe clicked: ${timeframe}`);
                
                document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setTimeframe(timeframe);
            });
        });
    }
    
    /**
     * Setup OHLC panel collapse button
     */
    setupOHLCCollapse() {
        const collapseBtn = document.getElementById('ohlcCollapseBtn');
        const ohlcInfo = document.getElementById('ohlcInfo');
        
        if (!collapseBtn || !ohlcInfo) return;
        
        collapseBtn.addEventListener('click', () => {
            ohlcInfo.classList.toggle('collapsed');
            
            // Rotate arrow icon
            const svg = collapseBtn.querySelector('svg');
            if (ohlcInfo.classList.contains('collapsed')) {
                svg.style.transform = 'rotate(-90deg)';
            } else {
                svg.style.transform = 'rotate(0deg)';
            }
        });
    }
    
    /**
     * Resample data to a specific timeframe
     * @param {string} timeframe - Timeframe identifier (e.g., '1m', '5m', '1h', '1d')
     */
    setTimeframe(timeframe) {
        if (!this.rawData || this.rawData.length === 0) return;
        
        if (this.drawingManager && this.drawings && this.drawings.length > 0) {
            this.drawingManager.saveDrawings();
        }
        
        this.currentTimeframe = String(timeframe || '1m').toLowerCase().trim();
        timeframe = this.currentTimeframe;
        this.scheduleChartViewSave();
        
        if (this.replaySystem && this.replaySystem.isActive) {
            this.replaySystem.onTimeframeChange();
            return;
        }
        
        // Always fetch from server — viewport-based, like TradingView
        if (this.currentFileId) {
            this._loadTimeframeFromServer(timeframe);
            return;
        }
        
        // Fallback for non-file data (small local datasets)
        this.data = this.resampleData(this.rawData, timeframe);
        if (typeof this.recalculateIndicators === 'function') this.recalculateIndicators();
        if (this.compareOverlay && typeof this.compareOverlay.refreshForTimeframe === 'function') {
            this.compareOverlay.refreshForTimeframe(timeframe);
        }
        this.fitToView(); // position to last candle after timeframe change
        this.scheduleRender();
        this._fireChartDataLoaded();
    }
    
    /**
     * Load a timeframe window from the server (viewport-based).
     * Fetches last 5000 candles at the requested timeframe.
     */
    async _loadTimeframeFromServer(timeframe) {
        try {
            if (this.showLoader) this.showLoader('Changing timeframe...');
            
            const session = this.backtestingSession || {};
            const result = await this._fetchSmartWindow(this.currentFileId, timeframe, session);
            
            if (!result || !result.data) throw new Error('No data');
            
            this.rawData = [];
            this.data = [];
            this.totalCandles = result.total;
            this._serverCursors = {
                firstTs: result.first_cursor,
                lastTs: result.last_cursor,
                hasMoreLeft: result.has_more_left,
                hasMoreRight: result.has_more_right
            };
            this._panLoading = false;
            
            this.parseCSVChunk(result.data, 0);
            // NOTE: parseCSVChunk already resamples this.data to currentTimeframe
            // do NOT overwrite it with rawData here (that would break non-1m timeframes)
            
            if (typeof this.recalculateIndicators === 'function') this.recalculateIndicators();
            if (this.compareOverlay && typeof this.compareOverlay.refreshForTimeframe === 'function') {
                this.compareOverlay.refreshForTimeframe(timeframe);
            }
            
            this.fitToView(); // position to last candle after timeframe change
            this.scheduleRender();
            if (this.hideLoader) this.hideLoader();
            // NOTE: parseCSVChunk already dispatches chartDataLoaded internally,
            // so we do NOT call _fireChartDataLoaded() here to avoid double-refresh of drawings
            
            console.log(`✅ ${timeframe}: loaded ${this.rawData.length}/${result.total} candles`);
        } catch (error) {
            console.error('❌ Timeframe change failed:', error);
            if (this.hideLoader) this.hideLoader();
        }
    }
    
    /**
     * Fire chartDataLoaded event for drawings, replay, etc.
     */
    _fireChartDataLoaded() {
        window.dispatchEvent(new CustomEvent('chartDataLoaded', {
            detail: { 
                data: this.data,
                rawData: this.rawData,
                symbol: this.currentSymbol,
                timeframe: this.currentTimeframe
            }
        }));
    }
    
    /**
     * Pan-load: fetch older/newer candles when user scrolls to data edge.
     * Merges new candles into existing data seamlessly.
     * @param {string} direction - 'backward' (pan left) or 'forward' (pan right)
     */
    checkViewportLoadMore(direction) {
        if (this._panLoading) return;
        if (!this.currentFileId) return;
        if (!this._serverCursors) return;

        const session = this.backtestingSession || {};
        const sessionStartTs = session.startDate ? new Date(session.startDate).getTime() : null;
        const sessionEndTs = session.endDate ? new Date(session.endDate).getTime() : null;
        const hasSessionStart = Number.isFinite(sessionStartTs);
        const hasSessionEnd = Number.isFinite(sessionEndTs);
        
        // Check if there's more data in this direction
        if (direction === 'backward' && !this._serverCursors.hasMoreLeft) return;
        if (direction === 'forward' && !this._serverCursors.hasMoreRight) return;

        // Respect configured backtesting bounds
        if (direction === 'forward' && hasSessionEnd) {
            const lastCursorTs = Number(this._serverCursors.lastTs);
            if (Number.isFinite(lastCursorTs) && lastCursorTs >= sessionEndTs) {
                this._serverCursors.hasMoreRight = false;
                return;
            }
        }
        if (direction === 'backward' && hasSessionStart) {
            const firstCursorTs = Number(this._serverCursors.firstTs);
            if (Number.isFinite(firstCursorTs) && firstCursorTs <= sessionStartTs) {
                this._serverCursors.hasMoreLeft = false;
                return;
            }
        }
        
        // Debounce: don't fire again within 500ms of last load completing
        const now = Date.now();
        if (this._lastPanLoadTime && now - this._lastPanLoadTime < 500) return;
        
        this._panLoading = true;
        
        const isReplay = this.replaySystem && this.replaySystem.isActive && this.replaySystem.fullRawData;
        const replayRawTf = isReplay ? (this.replaySystem.rawTimeframe || '1m') : null;
        const tf = replayRawTf || this.currentTimeframe || '1m';
        const cursor = direction === 'backward' 
            ? this._serverCursors.firstTs 
            : this._serverCursors.lastTs;
        
        if (!cursor) { this._panLoading = false; return; }
        
        // Load 5000 candles per pan for faster deep scrolling
        const params = new URLSearchParams({
            timeframe: tf,
            limit: '5000',
            cursor: cursor,
            direction: direction
        });
        
        fetch(`${this.apiUrl}/file/${this.currentFileId}/candles?${params.toString()}`)
            .then(res => res.ok ? res.json() : null)
            .then(result => {
                if (!result || !result.data || !result.data.t) return;

                // Always update cursors/has-more flags, even when no candles were returned.
                // This prevents replay from repeatedly requesting beyond the end.
                if (direction === 'backward') {
                    this._serverCursors.firstTs = result.prev_cursor || this._serverCursors.firstTs;
                    if (typeof result.has_more_left === 'boolean') {
                        this._serverCursors.hasMoreLeft = result.has_more_left;
                    }
                } else {
                    this._serverCursors.lastTs = result.next_cursor || this._serverCursors.lastTs;
                    if (typeof result.has_more_right === 'boolean') {
                        this._serverCursors.hasMoreRight = result.has_more_right;
                    }
                }

                if (result.data.t.length === 0) return;
                
                const newCandles = [];
                for (let i = 0; i < result.data.t.length; i++) {
                    newCandles.push({
                        t: result.data.t[i],
                        o: result.data.o[i],
                        h: result.data.h[i],
                        l: result.data.l[i],
                        c: result.data.c[i],
                        v: result.data.v[i]
                    });
                }

                const boundedCandles = newCandles.filter(c => {
                    if (hasSessionStart && c.t < sessionStartTs) return false;
                    if (hasSessionEnd && c.t > sessionEndTs) return false;
                    return true;
                });

                if (boundedCandles.length === 0) {
                    if (direction === 'forward' && hasSessionEnd) {
                        this._serverCursors.hasMoreRight = false;
                    }
                    if (direction === 'backward' && hasSessionStart) {
                        this._serverCursors.hasMoreLeft = false;
                    }
                    return;
                }

                if (direction === 'forward' && hasSessionEnd) {
                    const hitSessionEnd = boundedCandles[boundedCandles.length - 1].t >= sessionEndTs;
                    if (hitSessionEnd) {
                        this._serverCursors.hasMoreRight = false;
                    }
                }
                if (direction === 'backward' && hasSessionStart) {
                    const hitSessionStart = boundedCandles[0].t <= sessionStartTs;
                    if (hitSessionStart) {
                        this._serverCursors.hasMoreLeft = false;
                    }
                }
                
                // In replay mode, merge into fullRawData (the master copy)
                // because replay overwrites rawData on every tick
                const masterData = isReplay ? this.replaySystem.fullRawData : this.rawData;
                
                // Merge: deduplicate by timestamp
                const existingTs = new Set(masterData.map(c => c.t));
                const uniqueNew = boundedCandles.filter(c => !existingTs.has(c.t));
                if (uniqueNew.length === 0) return;
                
                // Save replay position before modifying data
                let replayTs = null;
                if (isReplay) {
                    replayTs = this.replaySystem.fullRawData[this.replaySystem.currentIndex]?.t;
                }
                
                // Merge new candles into master data
                const merged = [...masterData, ...uniqueNew].sort((a, b) => a.t - b.t);
                
                if (isReplay) {
                    // Update replay system's master copy
                    this.replaySystem.fullRawData = merged;
                    this.replaySystem.replayStartTimestamp = merged[0]?.t;
                    this.replaySystem.replayEndTimestamp = merged[merged.length - 1]?.t;
                    // Restore currentIndex to the same timestamp
                    if (replayTs != null) {
                        const newIdx = merged.findIndex(c => c.t >= replayTs);
                        if (newIdx >= 0) this.replaySystem.currentIndex = newIdx;
                    }
                    // Let replay system re-slice for the current position
                    this.replaySystem.updateChartData(false);
                } else {
                    // Normal mode: update rawData directly
                    if (direction === 'backward') {
                        this.offsetX -= uniqueNew.length * this.getCandleSpacing();
                    }
                    // ── Ring buffer: cap rawData to avoid unbounded memory growth ──
                    let trimmed = merged;
                    const cap = this._RAW_DATA_CAP || 300_000;
                    if (merged.length > cap) {
                        if (direction === 'backward') {
                            // Loading older data → evict from the right (newest)
                            const evicted = merged.length - cap;
                            trimmed = merged.slice(0, cap);
                            this._serverCursors.hasMoreRight = true;
                            this._serverCursors.lastTs = String(trimmed[trimmed.length - 1].t);
                            this.offsetX += evicted * this.getCandleSpacing();
                        } else {
                            // Loading newer data → evict from the left (oldest)
                            trimmed = merged.slice(merged.length - cap);
                            this._serverCursors.hasMoreLeft = true;
                            this._serverCursors.firstTs = String(trimmed[0].t);
                        }
                    }
                    this.rawData = trimmed;
                    this.data = [...this.rawData];
                }

                // ── Prefetch next batch while user is still panning ──
                if (this.tileManager && this.currentFileId) {
                    const prefetchTf = tf;
                    this.tileManager.getMeta(this.currentFileId, prefetchTf).then(meta => {
                        if (!meta) return;
                        const TILE_SIZE = meta.tile_size || 50000;
                        if (direction === 'backward' && this._serverCursors.hasMoreLeft) {
                            const cursorTs = Number(this._serverCursors.firstTs);
                            const tileIdx = meta.tiles.findIndex(t => t.end_ts >= cursorTs);
                            if (tileIdx > 0) this.tileManager.prefetch(this.currentFileId, prefetchTf, [tileIdx - 1]);
                        } else if (direction === 'forward' && this._serverCursors.hasMoreRight) {
                            const cursorTs = Number(this._serverCursors.lastTs);
                            let tileIdx = -1;
                            for (let ti = meta.tiles.length - 1; ti >= 0; ti--) {
                                if (meta.tiles[ti].start_ts <= cursorTs) { tileIdx = ti; break; }
                            }
                            if (tileIdx >= 0 && tileIdx + 1 < meta.tile_count) {
                                this.tileManager.prefetch(this.currentFileId, prefetchTf, [tileIdx + 1]);
                            }
                        }
                    }).catch(() => {});
                }
                
                if (typeof this.recalculateIndicators === 'function') this.recalculateIndicators();
                this.scheduleRender();
                
                console.log(`📦 Pan ${direction}: +${uniqueNew.length} candles (master: ${isReplay ? this.replaySystem.fullRawData.length : this.rawData.length})`);
            })
            .catch(err => console.warn('Pan load failed:', err))
            .finally(() => { 
                this._panLoading = false; 
                this._lastPanLoadTime = Date.now();
            });
    }
    
    resampleData(data, timeframe) {
        if (data.length === 0) return [];

        const normalizedTf = String(timeframe || '').toLowerCase().trim();
        const monthMatch = normalizedTf.match(/^(\d+)mo$/);
        if (monthMatch) {
            const monthsPerBucket = Math.max(1, parseInt(monthMatch[1], 10));
            const monthly = [];
            let currentCandle = null;
            let currentBucketKey = null;

            for (let i = 0; i < data.length; i++) {
                const candle = data[i];
                const dt = new Date(candle.t);
                if (!Number.isFinite(dt.getTime())) continue;

                const year = dt.getUTCFullYear();
                const month = dt.getUTCMonth();
                const absoluteMonth = year * 12 + month;
                const bucketAbsoluteMonth = Math.floor(absoluteMonth / monthsPerBucket) * monthsPerBucket;
                const bucketYear = Math.floor(bucketAbsoluteMonth / 12);
                const bucketMonth = bucketAbsoluteMonth % 12;
                const bucketStart = Date.UTC(bucketYear, bucketMonth, 1);
                const bucketKey = `${bucketYear}-${bucketMonth}`;

                if (bucketKey !== currentBucketKey) {
                    if (currentCandle) {
                        monthly.push(currentCandle);
                    }
                    currentBucketKey = bucketKey;
                    currentCandle = {
                        t: bucketStart,
                        o: candle.o,
                        h: candle.h,
                        l: candle.l,
                        c: candle.c,
                        v: candle.v
                    };
                } else {
                    currentCandle.h = Math.max(currentCandle.h, candle.h);
                    currentCandle.l = Math.min(currentCandle.l, candle.l);
                    currentCandle.c = candle.c;
                    currentCandle.v += candle.v;
                }
            }

            if (currentCandle) {
                monthly.push(currentCandle);
            }

            return monthly;
        }
        
        // Parse timeframe to milliseconds
        const timeframeMs = this.parseTimeframe(timeframe);
        const resampled = [];
        
        let currentCandle = null;
        let currentBucketStart = Math.floor(data[0].t / timeframeMs) * timeframeMs;
        
        for (let i = 0; i < data.length; i++) {
            const candle = data[i];
            const candleBucket = Math.floor(candle.t / timeframeMs) * timeframeMs;
            
            if (candleBucket !== currentBucketStart) {
                if (currentCandle) {
                    resampled.push(currentCandle);
                }
                currentBucketStart = candleBucket;
                currentCandle = null;
            }
            
            if (!currentCandle) {
                currentCandle = {
                    t: currentBucketStart,
                    o: candle.o,
                    h: candle.h,
                    l: candle.l,
                    c: candle.c,
                    v: candle.v
                };
            } else {
                currentCandle.h = Math.max(currentCandle.h, candle.h);
                currentCandle.l = Math.min(currentCandle.l, candle.l);
                currentCandle.c = candle.c;
                currentCandle.v += candle.v;
            }
        }
        
        if (currentCandle) {
            resampled.push(currentCandle);
        }
        
        return resampled;
    }
    
    /**
     * Convert timeframe string to milliseconds
     * @param {string} timeframe - Timeframe identifier
     * @returns {number} Milliseconds
     */
    parseTimeframe(timeframe) {
        const units = {
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'mo': 30 * 24 * 60 * 60 * 1000
        };

        const normalized = String(timeframe || '').toLowerCase();
        const match = normalized.match(/(\d+)([a-z]+)/);
        if (!match) return 60 * 1000; // Default to 1 minute

        const value = parseInt(match[1], 10);
        const unit = match[2];
        const unitKey = units[unit] ? unit : (unit === 'm' && normalized.endsWith('mo') ? 'mo' : unit);
        const multiplier = units[unitKey] || units['m'];
        return value * multiplier;
    }

    parseCSV(csv) {
        try {
            // Use the same flexible parser as parseCSVChunk
            this.parseCSVChunk(csv, 0);
            
            if (this.rawData.length > 0) {
                console.log(`✅ Loaded ${this.rawData.length} candles from CSV file`);
            } else {
                throw new Error('No valid data found in CSV');
            }
        } catch (error) {
            console.error('CSV Parse Error:', error);
            alert(`Failed to parse CSV: ${error.message}\n\nSupported formats:\n- With headers: timestamp,open,high,low,close,volume\n- Without headers (6+ columns)\n- Separate date/time columns\n- Tab or comma separated`);
        }
    }


    /**
     * Get effective candle spacing based on zoom level
     * This ensures consistent spacing calculations throughout the chart
     */
    getCandleSpacing() {
        const FIXED_SPACING = 0;
        const effectiveSpacing = this.candleWidth <= 3 ? 0 : // No spacing when very zoomed out
                               this.candleWidth <= 5 ? 0 : // Minimal spacing when zoomed out
                               FIXED_SPACING; // Normal spacing otherwise
        return this.candleWidth + effectiveSpacing;
    }
    
    /**
     * Calculate scales for chart rendering
     */
    calculateScales() {
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const ch = this.h - m.t - m.b;
        // If volume is hidden, use full height for price chart
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const priceHeight = ch * (1 - effectiveVolumeHeight);
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        
        // Add buffer for smoother scrolling
        const bufferCandles = 20; // Number of extra candles to render on each side
        
        // Use consistent candle spacing
        const candleAndSpacing = this.getCandleSpacing();
        
        const visible = this.data.slice(
            Math.max(0, -Math.floor(this.offsetX / candleAndSpacing) - bufferCandles),
            Math.min(this.data.length, -Math.floor(this.offsetX / candleAndSpacing) + Math.ceil(cw / candleAndSpacing) + bufferCandles)
        );
        
        // FIX: If no visible candles, maintain last valid scales to prevent drawings from disappearing
        if (visible.length === 0) {
            // Only set default scales if we've never had valid data before
            if (!this.xScale || !this.yScale) {
                this.xScale = d3.scaleLinear().domain([0, 1]).range([m.l, this.w - m.r]);
                this.yScale = d3.scaleLinear().domain([0, 1]).range([this.h - m.b - volumeAreaHeight, m.t]);
                this.volumeScale = d3.scaleLinear().domain([0, 1]).range([this.h - m.b, this.h - m.b - volumeAreaHeight]);
            }
            // Otherwise, keep the existing scales so drawings remain visible
            return;
        }

        const prices = visible.flatMap(d => [d.h, d.l]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || maxPrice * 0.01;
        
        // Calculate chart height for price area
        const priceChartHeight = ch - volumeAreaHeight;
        
        // Dynamically calculate padding - smaller padding for better fit
        // Use 5% of price range as padding, but limit to reasonable visual space
        let paddingPercent = 0.05; // 5% padding by default for better centering
        if (this.priceZoom > 2) paddingPercent = 0.03;
        if (this.priceZoom > 5) paddingPercent = 0.02;
        const padding = priceRange * paddingPercent;
        
        // Apply price zoom and offset with improved calculations
        let domainMin, domainMax;

        if (this.autoScale && this.priceZoom === 1 && this.priceOffset === 0) {
            // Auto-scale mode: fit all visible data with symmetric padding
            domainMin = minPrice - padding;
            domainMax = maxPrice + padding;

            // Keep manual base in sync so that when user leaves auto-scale,
            // the Y range starts from this exact domain and then stays independent
            this.manualCenterPrice = (domainMin + domainMax) / 2;
            this.manualRange = domainMax - domainMin;
        } else {
            // Manual zoom/pan mode: Y-axis must NOT depend on which candles are visible.
            // Once we have a manual base range, keep it fixed and only apply priceZoom/priceOffset.
            if (this.manualCenterPrice == null || this.manualRange == null) {
                const autoMin = minPrice - padding;
                const autoMax = maxPrice + padding;
                this.manualCenterPrice = (autoMin + autoMax) / 2;
                this.manualRange = autoMax - autoMin;
            }

            const halfRange = (this.manualRange) / (2 * this.priceZoom);

            // Apply price offset for vertical panning relative to fixed base range
            domainMin = this.manualCenterPrice - halfRange + this.priceOffset;
            domainMax = this.manualCenterPrice + halfRange + this.priceOffset;
        }
        
        // ✅ FIX: Use same candleAndSpacing for xScale domain to keep X-axis synchronized
        this.xScale = d3.scaleLinear()
            .domain([Math.max(0, -Math.floor(this.offsetX / candleAndSpacing)), 
                     Math.max(0, -Math.floor(this.offsetX / candleAndSpacing)) + visible.length])
            .range([m.l, this.w - m.r]);
        
        this.yScale = d3.scaleLinear()
            .domain([domainMin, domainMax])
            .range([this.h - m.b - volumeAreaHeight, m.t]);
        
        const maxVolume = Math.max(...visible.map(d => d.v), 1);
        this.volumeScale = d3.scaleLinear()
            .domain([0, maxVolume])
            .range([this.h - m.b, this.h - m.b - volumeAreaHeight]);
        
        // Create scales object for order manager compatibility
        this.scales = {
            yScale: this.yScale,
            xScale: this.xScale,
            volumeScale: this.volumeScale
        };
        
    }

    /**
     * Schedule a render using requestAnimationFrame for throttling
     */
    scheduleRender() {
        this.renderPending = true;
        // Force immediate render for drawing updates
        if (this.selectedDrawing !== null) {
            this.render();
        }
    }

    bumpDataVersion() {
        this.dataVersion = (this.dataVersion ?? 0) + 1;
    }
    
    animateZoom() {
        // This function is kept for potential future use but is no longer used for wheel zoom
        // Wheel zoom is now instant for better responsiveness
        if (!this.zoomAnimation.active) return;
        
        const now = performance.now();
        const elapsed = now - this.zoomAnimation.startTime;
        const progress = Math.min(elapsed / this.zoomAnimation.duration, 1);
        
        // Easing function for smooth animation
        const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
        const ease = easeOutCubic(progress);
        
        // Interpolate all values
        this.candleWidth = this.interpolate(
            this.candleWidth,
            this.zoomAnimation.targetCandleWidth,
            ease
        );
        
        this.priceZoom = this.interpolate(
            this.priceZoom,
            this.zoomAnimation.targetPriceZoom,
            ease
        );
        
        this.offsetX = this.interpolate(
            this.offsetX,
            this.zoomAnimation.targetOffsetX,
            ease
        );
        
        this.priceOffset = this.interpolate(
            this.priceOffset,
            this.zoomAnimation.targetPriceOffset,
            ease
        );
        
        // Stop animation when complete
        if (progress >= 1) {
            this.zoomAnimation.active = false;
        }
        
        this.constrainOffset();
        this.scheduleRender();
    }
    
    interpolate(start, end, progress) {
        return start + (end - start) * progress;
    }

    zoomAtCenter(factor) {
        const rect = this.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Store old state
        const oldCandleWidth = this.candleWidth;
        
        // Apply zoom (minimum 2px to keep chart visible)
        this.candleWidth = Math.max(2, Math.min(100, this.candleWidth * factor));
        
        // Adjust offset to keep center point stable
        const centerDataIndex = this.pixelToDataIndex(centerX);
        const newCenterOffset = centerX - (centerDataIndex * this.getCandleSpacing());
        this.offsetX = newCenterOffset;
        
        this.constrainOffset();
        this.render();
    }
    
    panBy(dx, dy) {
        this.offsetX += dx;
        if (this.yScale) {
            const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
            const pricePerPixel = priceRange / (this.h - this.margin.t - this.margin.b);
            this.priceOffset -= dy * pricePerPixel;
        }
        this.constrainOffset();
        this.render();
    }
    
    resetView() {
        // Reset zoom levels
        this.candleWidth = 8;
        this.priceZoom = 1;
        this.priceOffset = 0;
        this.autoScale = true;
        
        // Reset position to show latest data
        this.fitToView();
        this.render();
    }
    
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        this.animateZoom();

        if (this.renderPending) {
            this.render();
            this.renderPending = false;
        }
        
        // Calculate FPS
        const now = performance.now();
        this.frameCount++;
        if (now - this.lastFpsUpdate > this.fpsUpdateInterval) {
            this.fps = (this.frameCount * 1000) / (now - this.lastFpsUpdate);
            this.lastFpsUpdate = now;
            this.frameCount = 0;
        }
    }

    render() {
        if (this.isLoading) return;
        
        // Ensure minimum dimensions to prevent rendering issues
        if (this.w < 200 || this.h < 150) {
            // Chart is too small to render properly
            this.ctx.clearRect(0, 0, this.w, this.h);
            this.ctx.fillStyle = '#050028';
            this.ctx.fillRect(0, 0, this.w, this.h);
            // Show message for very small size
            this.ctx.fillStyle = '#787b86';
            this.ctx.font = '12px Roboto';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Chart too small', this.w / 2, this.h / 2);
            return;
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.w, this.h);
        
        // If no data, show message
        if (!this.data || this.data.length === 0) {
            this.ctx.fillStyle = '#787b86';
            this.ctx.font = '16px Roboto';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No data to display. Please upload or select a CSV file.', this.w / 2, this.h / 2);
            return;
        }

        // IMPORTANT: Calculate scales FIRST before drawing anything
        this.calculateScales();

        // Build time-axis ticks ONCE – shared by drawGrid() and drawAxes() for perfect sync
        this._timeTicks = this._buildTimeTicks();

        const candleSpacing = this.getCandleSpacing();
        const firstVisibleIndex = Math.floor(-this.offsetX / candleSpacing);
        const numVisibleCandles = Math.ceil(this.w / candleSpacing);
        const startIdx = Math.max(0, firstVisibleIndex);
        const endIdx = Math.min(this.data.length, firstVisibleIndex + numVisibleCandles + 2);
        
        // Expose current visible range for indicator rendering
        this.visibleStartIndex = startIdx;
        this.visibleEndIndex = endIdx;
        
        const visible = this.data.slice(startIdx, endIdx);
        
        // Better check: Only show "no data" if we truly have no data, not if the chart is just very small
        if (visible.length === 0 && this.data.length === 0) {
            this.ctx.fillStyle = '#787b86';
            this.ctx.font = '16px Roboto';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('No data to display. Please upload or select a CSV file.', this.w / 2, this.h / 2);
            return;
        }
        
        // If we have data but chart is scrolled beyond visible range
        if (visible.length === 0 && this.data.length > 0) {
            // Still draw grid, axes, and drawings even when no candles are visible
            // This ensures drawings remain visible when scrolling past chart edges
            this.drawGrid();
            this.drawAxes();
            
            // Draw current price label using latest data candle
            if (this.data.length > 0) {
                const latestCandle = this.data[this.data.length - 1];
                this.drawCurrentPriceLabel([latestCandle]);
            }
            
            // Redraw drawings even when no candles are visible
            this.redrawDrawings();
            
            // Update order lines if order manager is active
            if (this.orderManager) {
                if (typeof this.orderManager.updateOrderLines === 'function') {
                    this.orderManager.updateOrderLines();
                }
                if (typeof this.orderManager.updateSLTPLines === 'function') {
                    this.orderManager.updateSLTPLines();
                }
                if (typeof this.orderManager.updatePreviewLinePositions === 'function') {
                    this.orderManager.updatePreviewLinePositions();
                }
                if (typeof this.orderManager.updateMfeMaeMarkers === 'function') {
                    this.orderManager.updateMfeMaeMarkers();
                }
            }
            return;
        }
        
        // Log first render with data
        if (!this.hasRenderedData) {
            console.log(` First render with data! Visible candles: ${visible.length}, Total: ${this.data.length}`);
            console.log('First visible candle:', visible[0]);
            this.hasRenderedData = true;
        }

        // Update left margin for overlay Y-axes BEFORE drawing
        if (this.compareOverlay && typeof this.compareOverlay.updateLeftMargin === 'function') {
            this.compareOverlay.updateLeftMargin();
        }

        // Draw grid lines and axes
        this.drawGrid();
        this.drawAxes();

        // Draw volume bars
        this.drawVolume(visible);

        // Draw candlesticks
        this.drawCandles(visible);

        // Draw compare overlays (other symbols on same chart)
        if (this.compareOverlay && typeof this.compareOverlay.drawOverlays === 'function') {
            try {
                this.compareOverlay.drawOverlays();
            } catch (e) {
                console.error('Error drawing overlays:', e);
            }
        }

        // Draw current price indicator (latest close price)
        this.drawCurrentPriceLabel(visible);
        
        // Update logo for current theme
        this.updateLogoForTheme();

        // Draw indicators (Overlay indicators like SMA, EMA, BB)
        if (typeof this.drawIndicators === 'function') {
            this.drawIndicators();
        }
        
        // Draw separate panel indicators (ATR, ADR, etc.)
        if (typeof this.renderSeparatePanelIndicators === 'function') {
            this.renderSeparatePanelIndicators();
        }

        // Price hover line removed - no longer needed

        // Redraw drawings
        this.redrawDrawings();
        
        // Update order lines if order manager is active
        // This happens AFTER scales are calculated in render()
        if (this.orderManager) {
            if (typeof this.orderManager.updateOrderLines === 'function') {
                this.orderManager.updateOrderLines();
            }
            if (typeof this.orderManager.updateSLTPLines === 'function') {
                this.orderManager.updateSLTPLines();
            }
            if (typeof this.orderManager.updatePreviewLinePositions === 'function') {
                this.orderManager.updatePreviewLinePositions();
            }
            if (typeof this.orderManager.updateMfeMaeMarkers === 'function') {
                this.orderManager.updateMfeMaeMarkers();
            }
        }

        // Draw secondary indicators (RSI, MACD, etc.) in their own panels
        if (typeof this.drawSecondaryIndicators === 'function') {
            this.drawSecondaryIndicators();
        }
        
        // Show loading indicator if loading data
        if (this.isLoadingChunk) {
            this.ctx.fillStyle = 'rgba(41, 98, 255, 0.8)';
            this.ctx.font = '12px Roboto';
            this.ctx.textAlign = 'left';
            this.ctx.fillText('Loading more data...', m.l + 10, m.t + 20);
        }
        
        // Draw box zoom selection rectangle (STEP 8)
        if (this.boxZoom && this.boxZoom.active) {
            this.drawBoxZoom();
        }
    }
    
    /**
     * Update performance info display
     */
    updatePerformanceInfo() {
        const perfInfo = document.getElementById('perfInfo');
        if (!perfInfo) return;
        
        const loadedCandles = this.rawData.length;
        const totalCandles = this.totalCandles || loadedCandles;
        const loadedPercent = totalCandles > 0 ? Math.round((loadedCandles / totalCandles) * 100) : 100;
        
        perfInfo.innerHTML = `<small>FPS: ${this.fps} | Loaded: ${loadedCandles.toLocaleString()}/${totalCandles.toLocaleString()} (${loadedPercent}%)</small>`;
    }
    
    /**
     * Draw grid lines for better readability
     * Improved pattern inspired by D3.js best practices
     */
    drawGrid() {
        // Skip if grid is disabled
        if (!this.chartSettings.showGrid || this.chartSettings.gridStyle === 'None') return;
        
        const m = this.margin;
        const cw = this.w - m.l - m.r;
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        const priceHeight = ch - volumeAreaHeight;
        
        if (!this.xScale || !this.yScale) return;
        
        const showHorizontal = this.chartSettings.gridStyle === 'Vert and horz' || this.chartSettings.gridStyle === 'Horizontal';
        const showVertical = this.chartSettings.gridStyle === 'Vert and horz' || this.chartSettings.gridStyle === 'Vertical';
        
        // Horizontal grid lines (price levels) - aligned with y-axis labels
        if (showHorizontal) {
            this.ctx.strokeStyle = this.chartSettings.gridColor;
            this.ctx.lineWidth = 1;
            
            // Use same tick calculation as y-axis to ensure alignment
            const numYTicks = Math.max(8, Math.min(15, Math.floor(ch / 60)));
            const yTicks = this.yScale.ticks(numYTicks);
            
            yTicks.forEach(price => {
                const y = this.yScale(price);
                
                // Only draw lines in the price area (not in volume area)
                if (y > m.t && y < m.t + priceHeight) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(m.l, y);
                    this.ctx.lineTo(this.w - m.r, y);
                    this.ctx.stroke();
                }
            });
        }
        
        // Vertical grid lines – use same tick positions as time-axis labels for perfect sync
        if (showVertical && this._timeTicks && this._timeTicks.length > 0) {
            this.ctx.strokeStyle = this.chartSettings.gridColor;
            this.ctx.lineWidth = 1;
            for (let i = 0; i < this._timeTicks.length; i++) {
                const x = this._timeTicks[i].x;
                if (x >= m.l && x <= this.w - m.r) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, m.t);
                    this.ctx.lineTo(x, this.h - m.b);
                    this.ctx.stroke();
                }
            }
        }
        
        // Volume section separator (only show if volume is visible)
        if (this.chartSettings.showVolume && volumeAreaHeight > 0) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(m.l, this.h - m.b - volumeAreaHeight);
            this.ctx.lineTo(this.w - m.r, this.h - m.b - volumeAreaHeight);
            this.ctx.stroke();
        }
    }
    
    /**
     * Draw axis labels and ticks
     */
    drawAxes() {
        const m = this.margin;
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        
        if (!this.xScale || !this.yScale) return;
        
        const axisLeft = !!this.priceAxisLeft;
        const axisW = axisLeft ? m.l : m.r;
        const axisX = axisLeft ? 0 : this.w - m.r;
        const axisBorderX = axisLeft ? m.l : this.w - m.r;
        const axisMidX = axisLeft ? m.l / 2 : this.w - m.r / 2;

        // Draw Y-axis background area
        this.ctx.fillStyle = this.chartSettings.backgroundColor || '#050028';
        this.ctx.fillRect(axisX, 0, axisW, this.h - m.b);
        
        // Draw X-axis background area (time axis on the bottom) - uses same background as chart
        this.ctx.fillStyle = this.chartSettings.backgroundColor || '#050028';
        this.ctx.fillRect(0, this.h - m.b, this.w, m.b);
        
        // Draw axis highlight zones (for selected drawings) - BEFORE labels so labels appear on top
        this.drawAxisHighlightZones();
        
        // Draw Y-axis border line
        this.ctx.strokeStyle = '#e0e3eb';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(axisBorderX, 0);
        this.ctx.lineTo(axisBorderX, this.h - m.b);
        this.ctx.stroke();
        
        // Draw X-axis border line (top edge of time axis) - subtle gray
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.h - m.b);
        this.ctx.lineTo(this.w, this.h - m.b);
        this.ctx.stroke();
        
        const scaleFont = `${this.chartSettings.scaleTextSize}px Roboto`;
        this.ctx.fillStyle = this.chartSettings.scaleTextColor;
        this.ctx.font = scaleFont;
        this.ctx.textAlign = 'center';
        
        // Y-axis (price) labels with improved formatting
        this.ctx.textAlign = 'center';
        const numYTicks = Math.max(8, Math.min(15, Math.floor(ch / 60)));
        const yTicks = this.yScale.ticks(numYTicks);
        const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
        const decimals = this.getPriceDecimals(priceRange);
        
        yTicks.forEach(price => {
            const y = this.yScale(price);
            if (y > m.t && y < this.h - m.b - volumeAreaHeight) {
                const text = price.toFixed(decimals);
                this.ctx.fillStyle = this.chartSettings.scaleTextColor;
                this.ctx.fillText(text, axisMidX, y + 4);
            }
        });
        
        // X-axis (time) labels – use pre-built ticks (synced with vertical grid lines)
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.chartSettings.scaleTextColor;
        if (this._timeTicks && this._timeTicks.length > 0) {
            for (let i = 0; i < this._timeTicks.length; i++) {
                const tick = this._timeTicks[i];
                const x = tick.x;
                this.ctx.strokeStyle = '#e0e3eb';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(x, this.h - m.b);
                this.ctx.lineTo(x, this.h - m.b + 5);
                this.ctx.stroke();
                this.ctx.fillStyle = this.chartSettings.scaleTextColor;
                this.ctx.font = scaleFont;
                this.ctx.fillText(tick.label, x, this.h - 10);
            }
        }
        this.ctx.font = scaleFont;

    }
    
    /**
     * Build time-axis tick list once per render frame.
     * Returns [{idx, x, label, isBoundary}] – used by both drawGrid() and drawAxes().
     */
    _buildTimeTicks() {
        if (!this.data || this.data.length === 0) return [];
        const m = this.margin;
        const candleSpacing = this.getCandleSpacing();
        const cw = this.w - m.l - m.r;
        const firstVisibleIdx = -this.offsetX / candleSpacing;
        const isReplayMode = this.replaySystem && this.replaySystem.isActive && this.replaySystem.fullRawData;
        const maxDataLength = isReplayMode ? this.replaySystem.fullRawData.length : this.data.length;
        const lastVisibleIdx     = firstVisibleIdx + cw / candleSpacing;
        const lastVisibleIdxData = Math.min(this.data.length - 1, lastVisibleIdx);
        const visibleBarsCount   = Math.ceil(Math.max(0, lastVisibleIdxData) - Math.max(0, firstVisibleIdx));

        // Detect timeframe from data
        let timeframe = this.currentTimeframe || '1m';
        let timeframeMs = 60000;
        if (this.data.length >= 2) {
            timeframeMs = this.data[1].t - this.data[0].t;
            const d = timeframeMs / 60000;
            if (d >= 37000) timeframe = '1mo';
            else if (d >= 10000) timeframe = '1w';
            else if (d >= 1380)  timeframe = '1d';
            else if (d >= 220)   timeframe = '4h';
            else if (d >= 55)    timeframe = '1h';
            else if (d >= 25)    timeframe = '30m';
            else if (d >= 13)    timeframe = '15m';
            else if (d >= 4)     timeframe = '5m';
            else                 timeframe = '1m';
        } else {
            const tfMap = {'1m':60000,'2m':120000,'3m':180000,'4m':240000,'5m':300000,'10m':600000,'15m':900000,'30m':1800000,'45m':2700000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000,'1w':604800000,'1mo':2592000000};
            timeframeMs = tfMap[timeframe] || 60000;
        }

        // Adaptive label interval (candles between ticks)
        let labelInterval;
        if (timeframe === '1m') {
            if (visibleBarsCount > 600) labelInterval = 180;
            else if (visibleBarsCount > 400) labelInterval = 60;
            else if (visibleBarsCount > 200) labelInterval = 30;
            else if (visibleBarsCount > 100) labelInterval = 15;
            else labelInterval = 5;
        } else if (timeframe === '5m') {
            if (visibleBarsCount > 300) labelInterval = 36;
            else if (visibleBarsCount > 150) labelInterval = 12;
            else if (visibleBarsCount > 75)  labelInterval = 6;
            else labelInterval = 3;
        } else if (timeframe === '15m') {
            if (visibleBarsCount > 200) labelInterval = 12;
            else if (visibleBarsCount > 100) labelInterval = 4;
            else labelInterval = 2;
        } else if (timeframe === '30m') {
            if (visibleBarsCount > 200) labelInterval = 12;
            else if (visibleBarsCount > 100) labelInterval = 6;
            else labelInterval = 2;
        } else if (timeframe === '1h') {
            if (visibleBarsCount > 400) labelInterval = 24;
            else if (visibleBarsCount > 200) labelInterval = 12;
            else if (visibleBarsCount > 100) labelInterval = 6;
            else if (visibleBarsCount > 50)  labelInterval = 3;
            else labelInterval = 1;
        } else if (timeframe === '4h') {
            if (visibleBarsCount > 150) labelInterval = 6;
            else if (visibleBarsCount > 75)  labelInterval = 3;
            else labelInterval = 1;
        } else if (timeframe === '1d') {
            if (visibleBarsCount > 150) labelInterval = 30;
            else if (visibleBarsCount > 75)  labelInterval = 7;
            else labelInterval = 1;
        } else if (timeframe === '1w') {
            if (visibleBarsCount > 120) labelInterval = 4;
            else if (visibleBarsCount > 60)  labelInterval = 2;
            else labelInterval = 1;
        } else if (timeframe === '1mo') {
            labelInterval = 1;
        } else {
            labelInterval = Math.max(1, Math.ceil(visibleBarsCount / 8));
        }

        const labelIntervalMs   = labelInterval * timeframeMs;
        const intervalMinutes   = labelIntervalMs / 60000;
        const isCalendarTf      = timeframe === '1w' || /mo$/i.test(timeframe);
        const isDailyOrHigher   = timeframeMs >= 86400000;
        const monthNames        = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const minSpacing        = 50;

        const scanFrom = Math.max(0, Math.floor(Math.max(0, firstVisibleIdx)));
        const scanTo   = Math.min(this.data.length - 1, Math.ceil(lastVisibleIdx));

        // Single pass – collect candidates
        const candidates = [];
        let prevDay = -1, prevMonth = -1, prevYear = -1;

        for (let idx = scanFrom; idx <= scanTo; idx++) {
            const candle = this.data[idx];
            if (!candle || !candle.t) continue;
            const tzDate = this.convertToTimezone(candle.t);
            const day = tzDate.getDate(), month = tzDate.getMonth(), year = tzDate.getFullYear();

            // Detect boundary
            let isBoundary = false, boundaryLabel = null;
            if (prevYear !== -1) {
                if (year !== prevYear)        { isBoundary = true; boundaryLabel = String(year); }
                else if (month !== prevMonth) { isBoundary = true; boundaryLabel = monthNames[month]; }
                else if (day !== prevDay)     { isBoundary = true; boundaryLabel = String(day); }
            }
            prevDay = day; prevMonth = month; prevYear = year;

            // Detect round-time alignment
            let isRound = false;
            if (isCalendarTf) {
                isRound = (idx - scanFrom) % Math.max(1, labelInterval) === 0;
            } else {
                const tot = tzDate.getHours() * 60 + tzDate.getMinutes();
                isRound = intervalMinutes > 0 && tot % intervalMinutes === 0;
            }

            if (!isBoundary && !isRound) continue;

            let label;
            if (isBoundary && boundaryLabel) {
                label = boundaryLabel;
            } else if (isDailyOrHigher) {
                label = monthNames[month] + ' ' + day;
            } else {
                label = String(tzDate.getHours()).padStart(2,'0') + ':' + String(tzDate.getMinutes()).padStart(2,'0');
            }
            candidates.push({ idx, isBoundary, label });
        }

        // Extrapolate future ticks
        const lastRealIdx = this.data.length - 1;
        if (this.data.length > 0 && !isCalendarTf && lastVisibleIdx > lastRealIdx) {
            const last = this.data[this.data.length - 1];
            const ltz  = this.convertToTimezone(last.t);
            const lMin = ltz.getHours() * 60 + ltz.getMinutes();
            const next = Math.ceil((lMin + 1) / intervalMinutes) * intervalMinutes;
            let futureIdx = lastRealIdx + Math.ceil(((next - lMin) * 60000) / timeframeMs);
            for (; futureIdx <= lastVisibleIdx; futureIdx += labelInterval) {
                const ri  = Math.round(futureIdx);
                const tz2 = this.convertToTimezone(last.t + (ri - lastRealIdx) * timeframeMs);
                const lbl = isDailyOrHigher
                    ? monthNames[tz2.getMonth()] + ' ' + tz2.getDate()
                    : String(tz2.getHours()).padStart(2,'0') + ':' + String(tz2.getMinutes()).padStart(2,'0');
                candidates.push({ idx: ri, isBoundary: false, label: lbl });
            }
        }

        // Sort and filter by minimum pixel spacing
        candidates.sort((a, b) => a.idx - b.idx);
        const ticks = [];
        let lastX = -Infinity;
        for (const c of candidates) {
            const x = this.dataIndexToPixel(c.idx);
            if (x < m.l + 20 || x > this.w - m.r - 20) continue;
            const gap = c.isBoundary ? minSpacing * 0.7 : minSpacing;
            if (x - lastX >= gap || lastX === -Infinity) {
                ticks.push({ idx: c.idx, x, label: c.label, isBoundary: c.isBoundary });
                lastX = x;
            }
        }
        return ticks;
    }

    /**
     * Get appropriate decimal places based on price range
     */
    getPriceDecimals(priceRange) {
        const override = this.chartSettings && this.chartSettings.pricePrecision;
        if (override && override !== 'default') {
            const n = parseInt(override, 10);
            if (!isNaN(n)) return n;
        }
        if (priceRange < 0.01) return 6;
        if (priceRange < 0.1) return 4;
        if (priceRange < 1) return 3;
        if (priceRange < 10) return 2;
        if (priceRange < 1000) return 2;
        return 0;
    }

    /**
     * Draw axis highlight zones for selected drawings (canvas-based, behind labels)
     */
    drawAxisHighlightZones() {
        // Check if there are any axis highlight zones to draw
        if (!this.axisHighlightZones || this.axisHighlightZones.length === 0) return;
        
        const m = this.margin;
        const backgroundColor = this.chartSettings?.backgroundColor || '#050028';
        const isLightTheme = this.isLightColor ? this.isLightColor(backgroundColor) : false;
        const zoneColor = isLightTheme ? '#e0e3eb' : '#2a2e39';
        
        this.ctx.fillStyle = zoneColor;
        this.ctx.globalAlpha = 0.9;
        
        this.axisHighlightZones.forEach(zone => {
            if (zone.type === 'price') {
                // Price axis zone (Y-axis on right)
                this.ctx.fillRect(this.w - m.r + 2, zone.y, 58, zone.height);
            } else if (zone.type === 'time') {
                // Time axis zone (X-axis on bottom)
                this.ctx.fillRect(zone.x, this.h - m.b + 4, zone.width, 20);
            }
        });
        
        this.ctx.globalAlpha = 1.0;
    }
    
    /**
     * Set axis highlight zones (called by drawing tools)
     */
    setAxisHighlightZones(zones) {
        this.axisHighlightZones = zones;
    }
    
    /**
     * Clear axis highlight zones
     */
    clearAxisHighlightZones() {
        this.axisHighlightZones = [];
    }

    /**
     * Draw current price label on the right side (live price indicator)
     */
    drawCurrentPriceLabel(visible) {
        if (!visible || visible.length === 0) return;
        if (!this.yScale) return;

        const m = this.margin;
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        
        // Find the last candle index that is actually visible (not in price axis area)
        let lastVisibleIdx = -1;
        const rightBound = this.w - m.r - this.candleWidth;
        for (let i = visible.length - 1; i >= 0; i--) {
            const idx = this.visibleStartIndex + i;
            const x = this.dataIndexToPixel(idx);
            if (x <= rightBound) {
                lastVisibleIdx = i; // Index within visible array
                break;
            }
        }
        if (lastVisibleIdx < 0) return;

        // Get the display data using cached HA from full data
        let displayCandle = visible[lastVisibleIdx];
        if (this.chartSettings.chartType === 'heikinashi') {
            if (!this._haCache || this._haCacheVersion !== this.dataVersion) {
                this._haCache = this.calculateHeikinAshi(this.data);
                this._haCacheVersion = this.dataVersion;
            }
            const dataIdx = (this.visibleStartIndex || 0) + lastVisibleIdx;
            displayCandle = this._haCache[dataIdx] || visible[lastVisibleIdx];
        }
        if (!displayCandle) return;
        
        // === USE REPLAY-SYNCED PRICE WHEN REPLAY IS ACTIVE ===
        // Keep the right-side price label consistent across all timeframes.
        let currentPrice = displayCandle.c; // Default when not in replay

        if (this.replaySystem && this.replaySystem.isActive) {
            let replayPrice = null;

            if (typeof this.replaySystem.getCurrentAnimatedPrice === 'function') {
                replayPrice = this.replaySystem.getCurrentAnimatedPrice();
            }

            if (!Number.isFinite(replayPrice) && this.replaySystem.isPlaying && this.replaySystem.animatingCandle) {
                replayPrice = this.replaySystem.animatingCandle.close;
            }

            if (!Number.isFinite(replayPrice) && this.replaySystem.fullRawData) {
                replayPrice = this.replaySystem.fullRawData[this.replaySystem.currentIndex]?.c;
            }

            if (Number.isFinite(replayPrice)) {
                currentPrice = replayPrice;
            }
        }

        if (!Number.isFinite(currentPrice)) return;
        const y = this.yScale(currentPrice);

        // Only draw if within price chart area (not in volume area)
        if (y < m.t || y > this.h - m.b - volumeAreaHeight) return;

        // Neutral gray color (like TradingView)
        const bgColor = '#787B86';
        
        // Format price with stable precision across timeframes.
        let decimals;
        const precisionSetting = this.chartSettings ? this.chartSettings.precision : 'Default';
        if (precisionSetting && precisionSetting !== 'Default') {
            const parsed = parseInt(precisionSetting, 10);
            decimals = Number.isFinite(parsed) ? Math.max(0, Math.min(8, parsed)) : 4;
        } else {
            const absPrice = Math.abs(Number(currentPrice));
            if (absPrice >= 1000) decimals = 3;
            else if (absPrice >= 1) decimals = 4;
            else decimals = 5;
        }
        const priceText = Number(currentPrice).toFixed(decimals);

        // Use fixed width matching the price axis area
        this.ctx.font = `500 ${this.chartSettings.scaleTextSize}px Roboto`;
        
        const axisLeft = !!this.priceAxisLeft;
        const axisW = axisLeft ? m.l : m.r;
        const labelWidth = axisW - 4;
        const labelX = axisLeft ? 2 : this.w - m.r;
        const radius = 2;
        
        // Check if in replay mode to combine labels
        const inReplayMode = this.replaySystem && this.replaySystem.isActive && this.replaySystem.tickProgress !== undefined;
        let countdownText = '';
        
        if (inReplayMode) {
            const timeframe = this.currentTimeframe || '1m';
            const totalSeconds = this.getTimeframeSeconds(timeframe);
            
            // Calculate progress through the DISPLAY candle (not just raw candle)
            // On higher TFs, we need to track progress across multiple raw candles
            const displayTfMs = totalSeconds * 1000;
            const rawTfMs = this.replaySystem.fullRawData && this.replaySystem.fullRawData.length > 1 ?
                (this.replaySystem.fullRawData[1].t - this.replaySystem.fullRawData[0].t) : 60000;
            const rawCandlesPerDisplay = Math.max(1, displayTfMs / rawTfMs);
            
            // Get current raw candle's position within display period
            const currentIndex = this.replaySystem.currentIndex || 0;
            const currentTimestamp = this.replaySystem.fullRawData && this.replaySystem.fullRawData[currentIndex] ?
                this.replaySystem.fullRawData[currentIndex].t : 0;
            const displayCandleStart = Math.floor(currentTimestamp / displayTfMs) * displayTfMs;
            
            // Count completed raw candles in current display period
            let completedRawCandles = 0;
            for (let i = currentIndex; i >= 0; i--) {
                if (this.replaySystem.fullRawData[i] && this.replaySystem.fullRawData[i].t >= displayCandleStart) {
                    completedRawCandles++;
                } else {
                    break;
                }
            }
            
            // Calculate total progress: completed raw candles + current tick progress
            const ticksPerCandle = this.replaySystem.currentTicksPerCandle || this.replaySystem.ticksPerCandle || 60;
            const currentRawProgress = this.replaySystem.tickProgress / ticksPerCandle;
            const progress = (completedRawCandles - 1 + currentRawProgress) / rawCandlesPerDisplay;
            
            const remainingSeconds = Math.ceil(totalSeconds * (1 - Math.min(1, progress)));
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            countdownText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        // Calculate total label height
        const priceHeight = 20;
        const countdownHeight = inReplayMode ? 18 : 0;
        const totalHeight = priceHeight + countdownHeight;
        const labelY = y - totalHeight / 2;

        // Draw single background rectangle with rounded corners
        this.ctx.fillStyle = bgColor;
        this.ctx.beginPath();
        this.ctx.moveTo(labelX + radius, labelY);
        this.ctx.lineTo(labelX + labelWidth - radius, labelY);
        this.ctx.arcTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + radius, radius);
        this.ctx.lineTo(labelX + labelWidth, labelY + totalHeight - radius);
        this.ctx.arcTo(labelX + labelWidth, labelY + totalHeight, labelX + labelWidth - radius, labelY + totalHeight, radius);
        this.ctx.lineTo(labelX + radius, labelY + totalHeight);
        this.ctx.arcTo(labelX, labelY + totalHeight, labelX, labelY + totalHeight - radius, radius);
        this.ctx.lineTo(labelX, labelY + radius);
        this.ctx.arcTo(labelX, labelY, labelX + radius, labelY, radius);
        this.ctx.closePath();
        this.ctx.fill();

        // Draw price text centered in top section
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `500 ${this.chartSettings.scaleTextSize}px Roboto`;
        this.ctx.fillText(priceText, labelX + labelWidth / 2, labelY + priceHeight / 2);

        // Draw countdown text in bottom section if in replay mode
        if (inReplayMode) {
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = `600 ${this.chartSettings.scaleTextSize - 1}px Roboto`;
            this.ctx.fillText(countdownText, labelX + labelWidth / 2, labelY + priceHeight + countdownHeight / 2);
        }

        // Draw horizontal dotted line across entire chart
        this.ctx.strokeStyle = bgColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]); // Dotted line
        this.ctx.beginPath();
        this.ctx.moveTo(m.l, y);
        this.ctx.lineTo(this.w - m.r, y);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line
    }
    
    /**
     * Get timeframe duration in seconds
     */
    getTimeframeSeconds(timeframe) {
        const normalized = String(timeframe || '').toLowerCase().trim();
        const map = {
            '1s': 1, '5s': 5, '10s': 10, '15s': 15, '30s': 30,
            '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
            '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '12h': 43200,
            '1d': 86400, '1w': 604800, '1mo': 2592000
        };
        if (map[normalized]) return map[normalized];

        const match = normalized.match(/^(\d+)\s*(mo|w|d|h|m|s)$/);
        if (!match) return 60;

        const value = parseInt(match[1], 10);
        const unit = match[2];
        const unitSeconds = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400,
            w: 604800,
            mo: 2592000
        };
        return value * (unitSeconds[unit] || 60);
    }
    
    /**
     * Update logo visibility based on current theme (light/dark)
     */
    updateLogoForTheme() {
        const logoDark = document.querySelector('.chart-brand .logo-dark');
        const logoLight = document.querySelector('.chart-brand .logo-light');
        
        if (!logoDark || !logoLight) return;
        
        // Check if background is light or dark based on actual backgroundColor
        const bgColor = this.chartSettings?.backgroundColor || '#050028';
        const isLightTheme = this.isLightColor(bgColor);
        
        if (isLightTheme) {
            // Light background - show dark/black logo
            logoDark.style.display = 'none';
            logoLight.style.display = 'block';
        } else {
            // Dark background - show light/white logo
            logoDark.style.display = 'block';
            logoLight.style.display = 'none';
        }
    }
    
    /**
     * Check if a color is light (high brightness)
     */
    isLightColor(color) {
        let r, g, b;
        
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
            }
        } else if (color.startsWith('rgb')) {
            const match = color.match(/\d+/g);
            if (match) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        } else {
            return false; // Default to dark theme
        }
        
        // Calculate brightness
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128;
    }
    
    /**
     * Convert a date to the selected timezone
     * Uses timezone manager if available, otherwise returns original date
     */
    convertToTimezone(timestamp) {
        if (window.timezoneManager) {
            return window.timezoneManager.convertToTimezone(timestamp);
        }
        return new Date(timestamp);
    }

    /**
     * Format time label based on timeframe and zoom level (TradingView style)
     */
    formatTimeLabel(date, visibleBarsCount) {
        // Convert to selected timezone
        const tzDate = this.convertToTimezone(date.getTime());
        const timeframe = this.currentTimeframe || '1m';
        
        // Format based on timeframe first, then adjust for zoom level
        if (timeframe === '1m') {
            // 1-minute timeframe: always show time
            if (visibleBarsCount > 200) {
                // Very zoomed out: show date and hour
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                const hours = String(tzDate.getHours()).padStart(2, '0');
                return `${month} ${day}, ${hours}`;
            } else {
                // Normal/zoomed in: show hour and minute (HH:MM format)
                const hours = String(tzDate.getHours()).padStart(2, '0');
                const minutes = String(tzDate.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        } else if (timeframe === '5m') {
            // 5-minute timeframe: show time
            if (visibleBarsCount > 150) {
                // Zoomed out: show date and hour
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                const hours = String(tzDate.getHours()).padStart(2, '0');
                return `${month} ${day}, ${hours}`;
            } else {
                // Normal/zoomed in: show hour and minute
                const hours = String(tzDate.getHours()).padStart(2, '0');
                const minutes = String(tzDate.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        } else if (timeframe === '15m' || timeframe === '30m') {
            // 15/30 minute timeframes - TradingView style
            const hours = String(tzDate.getHours()).padStart(2, '0');
            const minutes = String(tzDate.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        } else if (timeframe === '1h') {
            // 1-hour timeframe: show hours
            if (visibleBarsCount > 200) {
                // Very zoomed out: show date only
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                return `${month} ${day}`;
            } else if (visibleBarsCount > 100) {
                // Zoomed out: show date and hour
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                const hours = String(tzDate.getHours()).padStart(2, '0');
                return `${month} ${day}, ${hours}`;
            } else {
                // Normal/zoomed in: show hour only (HH:00 format)
                const hours = String(tzDate.getHours()).padStart(2, '0');
                return `${hours}:00`;
            }
        } else if (timeframe === '4h') {
            // 4-hour timeframe
            if (visibleBarsCount > 150) {
                // Zoomed out: show month and day
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                return `${month} ${day}`;
            } else {
                // Normal/zoomed in: show day and hour
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                const hours = String(tzDate.getHours()).padStart(2, '0');
                return `${month} ${day}, ${hours}`;
            }
        } else if (timeframe === '1d') {
            // Daily timeframe
            if (visibleBarsCount > 200) {
                // Zoomed out: show month and year
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const year = tzDate.getFullYear();
                return `${month} ${year}`;
            } else {
                // Normal/zoomed in: show month and day
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const day = tzDate.getDate();
                return `${month} ${day}`;
            }
        } else if (timeframe === '1w') {
            // Weekly timeframe
            if (visibleBarsCount > 100) {
                // Zoomed out: show year
                return String(tzDate.getFullYear());
            } else {
                // Normal/zoomed in: show month and year
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const year = tzDate.getFullYear();
                return `${month} ${year}`;
            }
        } else {
            // Monthly or other timeframes
            if (visibleBarsCount > 50) {
                // Zoomed out: show year
                return String(tzDate.getFullYear());
            } else {
                // Normal/zoomed in: show month and year
                const month = tzDate.toLocaleString('en-US', { month: 'short' });
                const year = tzDate.getFullYear();
                return `${month} ${year}`;
            }
        }
    }

    drawPriceHoverLine() {
        const m = this.margin;
        if (!this.yScale) return;
        
        const y = this.hoveredPrice;
        const price = this.yScale.invert(y);
        
        // Draw horizontal line
        this.ctx.strokeStyle = '#2962ff';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(m.l, y);
        this.ctx.lineTo(this.w - m.r, y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw price label with modern style
        const text = price.toFixed(2);
        this.ctx.font = `500 ${this.chartSettings.scaleTextSize}px Roboto`;
        this.ctx.textAlign = 'left';
        const textWidth = this.ctx.measureText(text).width;
        const labelW = textWidth + 8;
        const axisLeft = !!this.priceAxisLeft;
        const labelX = axisLeft ? 2 : this.w - m.r + 2;
        const textX  = axisLeft ? 6 : this.w - m.r + 6;
        
        // Draw label background - blue
        this.ctx.fillStyle = '#2962ff';
        this.ctx.fillRect(labelX, y - 8, labelW, 16);
        
        // Draw text - white on blue
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(text, textX, y + 4);
    }
    
    updatePriceHoverLine() {
        if (this.isZooming) return;
        
        if (this.priceHoverThrottle) return;
        
        this.priceHoverThrottle = requestAnimationFrame(() => {
            this.render();
            this.priceHoverThrottle = null;
        });
    }
    
    clearPriceHoverLine() {
        if (this.priceHoverThrottle) {
            cancelAnimationFrame(this.priceHoverThrottle);
            this.priceHoverThrottle = null;
        }
        this.scheduleRender();
    }
    
    drawVolume(visible) {
        // Skip if volume is disabled
        if (!this.chartSettings.showVolume) return;
        
        const m = this.margin;
        const candleSpacing = this.getCandleSpacing();
        
        // Get volume indicator colors and MA settings if available
        let upColor = this.chartSettings.volumeUpColor;
        let downColor = this.chartSettings.volumeDownColor;
        let showMA = false;
        let maPeriod = 20;
        let maColor = '#2962ff';
        
        if (this.indicators && this.indicators.active) {
            const volumeIndicator = this.indicators.active.find(ind => ind.type === 'volume' || ind.isVolume);
            if (volumeIndicator) {
                if (volumeIndicator.style) {
                    upColor = volumeIndicator.style.upColor || upColor;
                    downColor = volumeIndicator.style.downColor || downColor;
                    maColor = volumeIndicator.style.maColor || maColor;
                }
                if (volumeIndicator.params) {
                    showMA = volumeIndicator.params.showMA || false;
                    maPeriod = volumeIndicator.params.maPeriod || 20;
                }
            }
        }
        
        // Create clipping region to prevent drawing outside chart area (before price axis)
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m.l, m.t, this.w - m.l - m.r, this.h - m.t - m.b);
        this.ctx.clip();
        
        visible.forEach((d, i) => {
            // Use the actual sequential index from visibleStartIndex
            const idx = this.visibleStartIndex + i;
            
            // Use dataIndexToPixel for consistent positioning
            const x = this.dataIndexToPixel(idx);
            if (x < m.l - 10 || x > this.w - m.r + 10) return;
            
            const volumeY = this.volumeScale(d.v);
            const volumeHeight = (this.h - m.b) - volumeY;
            
            const isGreen = d.c >= d.o;
            this.ctx.fillStyle = isGreen ? upColor : downColor;
            // Use candleWidth for the bar width but maintain fixed spacing
            this.ctx.fillRect(x - this.candleWidth / 2, volumeY, this.candleWidth, volumeHeight);
        });
        
        // Draw Volume MA if enabled
        if (showMA && this.data && this.data.length >= maPeriod) {
            // Calculate volume MA for the full dataset
            const volumeMA = [];
            for (let i = 0; i < this.data.length; i++) {
                if (i < maPeriod - 1) {
                    volumeMA.push(null);
                } else {
                    let sum = 0;
                    for (let j = 0; j < maPeriod; j++) {
                        sum += this.data[i - j].v;
                    }
                    volumeMA.push(sum / maPeriod);
                }
            }
            
            // Draw the MA line
            this.ctx.strokeStyle = maColor;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            let started = false;
            const startIdx = this.visibleStartIndex || 0;
            
            for (let i = 0; i < visible.length; i++) {
                const dataIdx = startIdx + i;
                const maValue = volumeMA[dataIdx];
                
                if (maValue === null || maValue === undefined) continue;
                
                const x = this.dataIndexToPixel(dataIdx);
                if (x < m.l - 10 || x > this.w - m.r + 10) continue;
                
                const y = this.volumeScale(maValue);
                
                if (!started) {
                    this.ctx.moveTo(x, y);
                    started = true;
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    drawCandles(visible) {
        const m = this.margin;
        const chartType = this.chartSettings.chartType || 'candles';
        
        // Calculate chart area bounds (exclude volume area)
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        const priceAreaBottom = this.h - m.b - volumeAreaHeight;
        
        // Create clipping region to prevent drawing outside chart area
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m.l, m.t, this.w - m.l - m.r, priceAreaBottom - m.t);
        this.ctx.clip();
        
        // Transform data for Heikin Ashi if needed
        let chartData = visible;
        if (chartType === 'heikinashi') {
            // Calculate HA from full data for consistency with price line and OHLC
            if (!this._haCache || this._haCacheVersion !== this.dataVersion) {
                this._haCache = this.calculateHeikinAshi(this.data);
                this._haCacheVersion = this.dataVersion;
            }
            // Map visible candles to their HA equivalents from the cache
            const startIdx = this.visibleStartIndex || 0;
            chartData = [];
            for (let i = 0; i < visible.length; i++) {
                const dataIdx = startIdx + i;
                if (this._haCache && dataIdx < this._haCache.length) {
                    chartData.push(this._haCache[dataIdx]);
                } else {
                    chartData.push(visible[i]); // Fallback to raw candle
                }
            }
            // If cache didn't work, recalculate from visible
            if (chartData.length === 0 || !chartData[0]) {
                chartData = this.calculateHeikinAshi(visible);
            }
        }
        
        // Draw based on chart type
        switch (chartType) {
            case 'line':
                this.drawLineChart(chartData);
                break;
            case 'area':
                this.drawAreaChart(chartData);
                break;
            case 'baseline':
                this.drawBaselineChart(chartData);
                break;
            case 'bars':
                this.drawBarsChart(chartData);
                break;
            case 'hollow':
            case 'heikinashi':
            case 'candles':
            default:
                this.drawCandlesticks(chartData, chartType === 'hollow');
                break;
        }
        
        this.ctx.restore();
    }
    
    /**
     * Calculate Heikin Ashi values
     */
    calculateHeikinAshi(visible) {
        if (!visible || visible.length === 0) return visible;
        
        const haData = [];
        let prevHA = null;
        
        for (let i = 0; i < visible.length; i++) {
            const d = visible[i];
            const haClose = (d.o + d.h + d.l + d.c) / 4;
            const haOpen = prevHA ? (prevHA.o + prevHA.c) / 2 : (d.o + d.c) / 2;
            const haHigh = Math.max(d.h, haOpen, haClose);
            const haLow = Math.min(d.l, haOpen, haClose);
            
            const ha = { ...d, o: haOpen, h: haHigh, l: haLow, c: haClose };
            haData.push(ha);
            prevHA = ha;
        }
        
        return haData;
    }
    
    /**
     * Get display candle for OHLC (converts to Heikin Ashi if needed)
     * @param {number} dataIdx - Index in the data array
     * @returns {Object} - Candle with appropriate OHLC values for display
     */
    getDisplayCandle(dataIdx) {
        if (dataIdx < 0 || dataIdx >= this.data.length) return null;
        
        const rawCandle = this.data[dataIdx];
        if (!rawCandle) return null;
        
        // If not Heikin Ashi, return raw candle
        if (this.chartSettings.chartType !== 'heikinashi') {
            return rawCandle;
        }
        
        // Calculate Heikin Ashi up to and including this candle
        // Use cached HA data if available and still valid
        if (!this._haCache || this._haCacheVersion !== this.dataVersion) {
            this._haCache = this.calculateHeikinAshi(this.data);
            this._haCacheVersion = this.dataVersion;
        }
        
        return this._haCache[dataIdx] || rawCandle;
    }
    
    /**
     * Draw Line Chart
     */
    drawLineChart(visible) {
        if (!visible || visible.length === 0) return;
        
        const m = this.margin;
        this.ctx.strokeStyle = this.chartSettings.bodyUpColor;
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        visible.forEach((d, i) => {
            const idx = this.visibleStartIndex + i;
            const x = this.dataIndexToPixel(idx);
            const y = this.yScale(d.c);
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        this.ctx.stroke();
    }
    
    /**
     * Draw Area Chart
     */
    drawAreaChart(visible) {
        if (!visible || visible.length === 0) return;
        
        const m = this.margin;
        const ch = this.h - m.t - m.b;
        const effectiveVolumeHeight = this.chartSettings.showVolume ? this.volumeHeight : 0;
        const volumeAreaHeight = ch * effectiveVolumeHeight;
        const bottomY = this.h - m.b - volumeAreaHeight;
        
        // Draw fill
        this.ctx.beginPath();
        visible.forEach((d, i) => {
            const idx = this.visibleStartIndex + i;
            const x = this.dataIndexToPixel(idx);
            const y = this.yScale(d.c);
            
            if (i === 0) {
                this.ctx.moveTo(x, bottomY);
                this.ctx.lineTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        // Close the path
        const lastIdx = this.visibleStartIndex + visible.length - 1;
        const lastX = this.dataIndexToPixel(lastIdx);
        this.ctx.lineTo(lastX, bottomY);
        this.ctx.closePath();
        
        // Create gradient
        const gradient = this.ctx.createLinearGradient(0, m.t, 0, bottomY);
        gradient.addColorStop(0, this.chartSettings.bodyUpColor + '40');
        gradient.addColorStop(1, this.chartSettings.bodyUpColor + '05');
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        // Draw line on top
        this.drawLineChart(visible);
    }
    
    /**
     * Draw Baseline Chart - with filled areas above/below baseline
     */
    drawBaselineChart(visible) {
        if (!visible || visible.length === 0) return;
        
        const m = this.margin;
        
        // Calculate baseline (first candle close or average)
        const baseline = visible[0].c;
        const baselineY = this.yScale(baseline);
        
        // Collect points
        const points = visible.map((d, i) => {
            const idx = this.visibleStartIndex + i;
            return {
                x: this.dataIndexToPixel(idx),
                y: this.yScale(d.c),
                price: d.c
            };
        });
        
        // Draw filled area ABOVE baseline (green)
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, baselineY);
        points.forEach(p => {
            const y = Math.min(p.y, baselineY); // Clip to baseline
            this.ctx.lineTo(p.x, y);
        });
        this.ctx.lineTo(points[points.length - 1].x, baselineY);
        this.ctx.closePath();
        this.ctx.fillStyle = this.chartSettings.bodyUpColor + '30';
        this.ctx.fill();
        
        // Draw filled area BELOW baseline (red)
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, baselineY);
        points.forEach(p => {
            const y = Math.max(p.y, baselineY); // Clip to baseline
            this.ctx.lineTo(p.x, y);
        });
        this.ctx.lineTo(points[points.length - 1].x, baselineY);
        this.ctx.closePath();
        this.ctx.fillStyle = this.chartSettings.bodyDownColor + '30';
        this.ctx.fill();
        
        // Draw the price line with color segments
        this.ctx.lineWidth = 2;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            // Check if line crosses baseline
            const above1 = p1.price >= baseline;
            const above2 = p2.price >= baseline;
            
            if (above1 === above2) {
                // Same side - draw single segment
                this.ctx.strokeStyle = above2 ? this.chartSettings.bodyUpColor : this.chartSettings.bodyDownColor;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.stroke();
            } else {
                // Crosses baseline - split at crossing point
                const ratio = (baseline - p1.price) / (p2.price - p1.price);
                const crossX = p1.x + ratio * (p2.x - p1.x);
                
                // First segment
                this.ctx.strokeStyle = above1 ? this.chartSettings.bodyUpColor : this.chartSettings.bodyDownColor;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(crossX, baselineY);
                this.ctx.stroke();
                
                // Second segment
                this.ctx.strokeStyle = above2 ? this.chartSettings.bodyUpColor : this.chartSettings.bodyDownColor;
                this.ctx.beginPath();
                this.ctx.moveTo(crossX, baselineY);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.stroke();
            }
        }
        
        // Draw baseline (dashed line)
        this.ctx.strokeStyle = '#787b86';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(m.l, baselineY);
        this.ctx.lineTo(this.w - m.r, baselineY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    /**
     * Draw OHLC Bars Chart
     */
    drawBarsChart(visible) {
        const m = this.margin;
        const tickWidth = Math.max(3, this.candleWidth / 3);
        
        visible.forEach((d, i) => {
            const idx = this.visibleStartIndex + i;
            const x = this.dataIndexToPixel(idx);
            
            if (x < m.l - this.candleWidth * 2 || x > this.w - m.r + this.candleWidth * 2) return;
            
            const [yo, yc, yh, yl] = [this.yScale(d.o), this.yScale(d.c), this.yScale(d.h), this.yScale(d.l)];
            const isUp = d.c >= d.o;
            const color = isUp ? this.chartSettings.bodyUpColor : this.chartSettings.bodyDownColor;
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = Math.max(1, this.candleWidth / 8);
            
            // High-Low vertical line
            this.ctx.beginPath();
            this.ctx.moveTo(x, yh);
            this.ctx.lineTo(x, yl);
            this.ctx.stroke();
            
            // Open tick (left)
            this.ctx.beginPath();
            this.ctx.moveTo(x - tickWidth, yo);
            this.ctx.lineTo(x, yo);
            this.ctx.stroke();
            
            // Close tick (right)
            this.ctx.beginPath();
            this.ctx.moveTo(x, yc);
            this.ctx.lineTo(x + tickWidth, yc);
            this.ctx.stroke();
        });
    }
    
    /**
     * Draw Candlesticks (regular or hollow)
     */
    drawCandlesticks(visible, isHollow = false) {
        const m = this.margin;
        let drawn = 0;
        let skipped = 0;
        
        // Use getCandleSpacing for consistency
        const candleSpacing = this.getCandleSpacing();
        
        visible.forEach((d, i) => {
            // Use the actual sequential index from visibleStartIndex
            const idx = this.visibleStartIndex + i;
            
            // Calculate X position using our helper method
            const x = this.dataIndexToPixel(idx);
            
            // Extend left visible area to prevent popping, but stop at price axis on right
            const extendedMargin = this.candleWidth * 2;
            
            // Visibility check - don't draw candles in the price axis area
            if (x < m.l - extendedMargin || x > this.w - m.r - this.candleWidth) {
                skipped++;
                return;
            }

            const [yo, yc, yh, yl] = [this.yScale(d.o), this.yScale(d.c), this.yScale(d.h), this.yScale(d.l)];
            const isUp = d.c >= d.o;
            
            // Get separate colors for wick, body, and border
            const wickColor = isUp ? this.chartSettings.wickUpColor : this.chartSettings.wickDownColor;
            const bodyColor = isUp ? this.chartSettings.bodyUpColor : this.chartSettings.bodyDownColor;
            const borderColor = isUp ? this.chartSettings.borderUpColor : this.chartSettings.borderDownColor;

            // Calculate wick width - always crisp
            const wickWidth = Math.max(1, Math.min(2, Math.ceil(this.candleWidth / 8)));

            // Draw wick (high-low line) - centered and crisp (if enabled)
            if (this.chartSettings.showCandleWick !== false) {
                this.ctx.strokeStyle = wickColor;
                this.ctx.lineWidth = wickWidth;
                this.ctx.lineCap = 'butt';
                this.ctx.beginPath();
                this.ctx.moveTo(Math.round(x), yh);
                this.ctx.lineTo(Math.round(x), yl);
                this.ctx.stroke();
            }

            // Draw body with borders (use 60% width for spacing between candles, like overlay)
            const bodyWidth = this.candleWidth * 0.6;
            const bodyHeight = Math.abs(yc - yo);
            const bodyTop = Math.min(yo, yc);
            const bodyLeft = x - bodyWidth / 2;
            
            // Professional candle rendering
            if (bodyHeight < 1) {
                // Doji - draw as a horizontal line (if borders enabled)
                if (this.chartSettings.showCandleBorders !== false) {
                    this.ctx.strokeStyle = borderColor;
                    this.ctx.lineWidth = 1.5;
                    this.ctx.lineCap = 'butt';
                    this.ctx.beginPath();
                    this.ctx.moveTo(bodyLeft, Math.round(yo));
                    this.ctx.lineTo(bodyLeft + bodyWidth, Math.round(yo));
                    this.ctx.stroke();
                }
            } else {
                // Regular candle
                // For hollow candle mode, up candles are hollow, down candles are filled
                const shouldBeHollow = isHollow && isUp;
                
                if (isUp) {
                    // Draw body fill (if enabled)
                    if (this.chartSettings.showCandleBody !== false) {
                        if (shouldBeHollow) {
                            // Hollow style - clear inside and draw border
                            this.ctx.fillStyle = this.chartSettings.backgroundColor;
                            this.ctx.fillRect(
                                Math.round(bodyLeft),
                                Math.round(bodyTop),
                                Math.round(bodyWidth),
                                Math.round(bodyHeight)
                            );
                        } else {
                            // Filled with bodyUpColor
                            this.ctx.fillStyle = bodyColor;
                            this.ctx.fillRect(
                                Math.round(bodyLeft),
                                Math.round(bodyTop),
                                Math.round(bodyWidth),
                                Math.round(bodyHeight)
                            );
                        }
                    }
                    
                    // Draw border on top (if enabled or hollow mode)
                    if (this.chartSettings.showCandleBorders !== false || shouldBeHollow) {
                        this.ctx.strokeStyle = borderColor;
                        this.ctx.lineWidth = shouldBeHollow ? 2 : Math.max(1, Math.min(2, bodyWidth / 6));
                        this.ctx.strokeRect(
                            Math.round(bodyLeft) + 0.5,
                            Math.round(bodyTop) + 0.5,
                            Math.round(bodyWidth) - 1,
                            Math.round(bodyHeight) - 1
                        );
                    }
                } else {
                    // Down candle - filled with body color (if enabled)
                    if (this.chartSettings.showCandleBody !== false) {
                        this.ctx.fillStyle = bodyColor;
                        this.ctx.fillRect(
                            Math.round(bodyLeft),
                            Math.round(bodyTop),
                            Math.round(bodyWidth),
                            Math.round(bodyHeight)
                        );
                    }
                    
                    // Add border for definition (if enabled)
                    if (this.chartSettings.showCandleBorders !== false && bodyWidth >= 3) {
                        this.ctx.strokeStyle = borderColor;
                        this.ctx.lineWidth = 1;
                        this.ctx.strokeRect(
                            Math.round(bodyLeft) + 0.5,
                            Math.round(bodyTop) + 0.5,
                            Math.round(bodyWidth) - 1,
                            Math.round(bodyHeight) - 1
                        );
                    }
                }
            }
            drawn++;
        });
        
        if (drawn === 0 && visible.length > 0) {
            console.warn('⚠️ No candles drawn! All', visible.length, 'candles are outside viewport. Skipped:', skipped);
            console.log('   offsetX:', this.offsetX, 'Canvas width:', this.w);
        }
    }

    /**
     * Snap a price to the nearest OHLC value of a candle
     * @param {number} dataIdx - Data index
     * @param {number} price - Price to snap
     * @returns {number} Snapped price
     */
    snapToOHLC(dataIdx, price) {
        const mode = this.magnetMode;
        const isActive = (mode === true) || (typeof mode === 'string' && mode !== 'off');
        if (!isActive || dataIdx < 0 || dataIdx >= this.data.length) {
            return price;
        }
        
        const candle = this.data[Math.floor(dataIdx)];
        const ohlc = [candle.o, candle.h, candle.l, candle.c];
        
        // Find closest OHLC value
        let closest = ohlc[0];
        let minDist = Math.abs(price - closest);
        
        for (let i = 1; i < ohlc.length; i++) {
            const dist = Math.abs(price - ohlc[i]);
            if (dist < minDist) {
                minDist = dist;
                closest = ohlc[i];
            }
        }
        
        return closest;
    }

    addDraggableHandles(handles, drawingIdx, drawing) {
        const chart = this;
        handles.forEach((handle, handleIdx) => {
            const circle = this.svg.append('circle')
                .attr('cx', handle.x)
                .attr('cy', handle.y)
                .attr('r', 6)
                .attr('fill', '#ffa726')
                .attr('stroke', '#fff')
                .attr('stroke-width', 2)
                .style('cursor', 'grab')
                .style('pointer-events', 'all') // Ensure handles can capture events
                .on('mouseenter', function() {
                    d3.select(this)
                        .attr('r', 7)
                        .attr('fill', '#ff9800');
                })
                .on('mouseleave', function() {
                    d3.select(this)
                        .attr('r', 6)
                        .attr('fill', '#ffa726');
                })
                .call(d3.drag()
                    .on('start', (event) => {
                        circle.style('cursor', 'move');
                        event.sourceEvent.stopPropagation(); // Prevent shape drag
                        console.log('🎯 Handle drag started:', handle.type);
                    })
                    .on('drag', (event) => {
                        const newX = event.x;
                        const newY = event.y;
                        
                        // Update handle position
                        circle.attr('cx', newX).attr('cy', newY);
                        
                        const newIdx = chart.pixelToDataIndex(newX);
                        let newPrice = chart.yScale.invert(newY);
                        
                        // Apply magnet mode snapping
                        const mode = chart.magnetMode;
                        const isActive = (mode === true) || (typeof mode === 'string' && mode !== 'off');
                        if (isActive) {
                            const snapped = chart.snapToOHLC(newIdx, newPrice);
                            if (snapped !== null) {
                                newPrice = snapped;
                            }
                        }
                        
                        // Update the drawing in the array directly by index
                        if (handle.type === 'start') {
                            chart.drawings[drawingIdx].x1 = newIdx;
                            chart.drawings[drawingIdx].y1 = newPrice;
                        } else if (handle.type === 'end') {
                            chart.drawings[drawingIdx].x2 = newIdx;
                            chart.drawings[drawingIdx].y2 = newPrice;
                        }
                        
                        // Update the drawing element directly without full redraw
                        const drawingElement = chart.svg.select(`.drawing.${drawing.type}`);
                        if (drawing.type === 'trendline') {
                            const x1 = chart.dataIndexToPixel(drawing.x1);
                            const y1 = chart.yScale(drawing.y1);
                            const x2 = chart.dataIndexToPixel(drawing.x2);
                            const y2 = chart.yScale(drawing.y2);
                            drawingElement.attr('x1', x1).attr('y1', y1)
                                          .attr('x2', x2).attr('y2', y2);
                        } else if (drawing.type === 'rectangle') {
                            const x1 = chart.dataIndexToPixel(drawing.x1);
                            const y1 = chart.yScale(drawing.y1);
                            const x2 = chart.dataIndexToPixel(drawing.x2);
                            const y2 = chart.yScale(drawing.y2);
                            drawingElement.attr('x', Math.min(x1, x2))
                                          .attr('y', Math.min(y1, y2))
                                          .attr('width', Math.abs(x2 - x1))
                                          .attr('height', Math.abs(y2 - y1));
                        }
                    })
                    .on('end', (event) => {
                        circle.style('cursor', 'grab');
                        event.sourceEvent.stopPropagation();
                        
                        // Save to localStorage directly using index
                        try {
                            const drawingsData = JSON.stringify(chart.drawings);
                            localStorage.setItem(`chart_drawings_${chart.currentFileId || 'default'}`, drawingsData);
                            console.log('✅ Handle drag completed and saved');
                        } catch (e) {
                            console.error('Failed to save after resize:', e);
                        }
                        
                        chart.redrawDrawings();
                    })
                );
        });
    }
    
    /**
     * Convert pixel X coordinate to data index
     * @param {number} pixelX - Pixel X coordinate
     * @returns {number} Data index
     */
    pixelToDataIndex(pixelX) {
        // Calculate based on candle spacing directly
        const candleSpacing = this.getCandleSpacing();
        const adjustedX = pixelX - this.margin.l - this.offsetX;
        const idx = adjustedX / candleSpacing;
        return idx; // Return raw value for precise positioning
    }
    
    /**
     * Convert data index to pixel X coordinate
     * @param {number} dataIdx - Data index
     * @returns {number} Pixel X coordinate
     */
    dataIndexToPixel(dataIdx) {
        // Use same calculation as pixelToDataIndex but inverted
        const candleSpacing = this.getCandleSpacing();
        return this.margin.l + (dataIdx * candleSpacing) + this.offsetX;
    }
    
    /**
     * Get the index of the first visible candle
     * @returns {number} Start index
     */
    getVisibleStartIndex() {
        if (!this.data || this.data.length === 0) return 0;
        const startIdx = Math.floor(this.pixelToDataIndex(this.margin.l));
        return Math.max(0, startIdx);
    }
    
    /**
     * Get the index of the last visible candle
     * @returns {number} End index
     */
    getVisibleEndIndex() {
        if (!this.data || this.data.length === 0) return 0;
        const endIdx = Math.ceil(this.pixelToDataIndex(this.w - this.margin.r));
        return Math.min(this.data.length - 1, endIdx);
    }
    
    // First redrawDrawings() implementation removed as it was a duplicate

    setupEvents() {
        // Initialize variables for drawing and dragging
        let drag = false, lastX = 0, lastY = 0;
        let dragType = null;
        
        // Variables for drawing tools
        let drawStart = null; 
        let drawStartData = null;
        
        // Handle clicks outside context menu to close it
        document.addEventListener('click', (e) => {
            // Only hide if clicking outside both context menu and style editor
            if (!e.target.closest('.chart-context-menu') && 
                !e.target.closest('.drawing-style-editor')) {
                this.hideContextMenu();
            }
        });
        
        // Prevent default context menu
        this.svg.node().addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Store current tool state
            const previousTool = this.tool;
            
            // Temporarily disable drawing tool
            if (this.tool) {
                this.setTool(null);
            }
            
            const drawing = this.findDrawingAtPoint(e.offsetX, e.offsetY);
            if (drawing) {
                this.showContextMenu(e.pageX, e.pageY, drawing, previousTool);
            } else {
                this.hideContextMenu();
                // Restore tool only if no menu is shown
                if (previousTool) {
                    this.setTool(previousTool);
                }
            }
        });
        
        console.log('🖱️  Setting up TradingView-style mouse events...');
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 2 — Mouse Position Detection Helper
        // ═══════════════════════════════════════════════════════════════════
        const detectCursorMode = (mx, my) => {
            const m = this.margin;
            // Price axis (right side) - full width of price axis area
            if (mx > this.w - m.r && my > m.t && my < this.h - m.b) {
                return 'priceAxis';
            // Time axis (bottom) - full height of time axis area
            } else if (my > this.h - m.b && mx > m.l && mx < this.w - m.r) {
                return 'timeAxis';
            } else if (mx > m.l && mx < this.w - m.r && my > m.t && my < this.h - m.b) {
                return 'chart';
            }
            return 'outside';
        };
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 5 — Candle Width Quantization
        // ═══════════════════════════════════════════════════════════════════
        const snapToQuantizedWidth = (direction) => {
            const widths = this.zoomLevel.allowedWidths;
            let idx = this.zoomLevel.candleWidthIndex;
            idx = Math.max(0, Math.min(widths.length - 1, idx + direction));
            this.zoomLevel.candleWidthIndex = idx;
            return widths[idx];
        };
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 7 — Right Margin Logic
        // ═══════════════════════════════════════════════════════════════════
        const getRightOffset = () => {
            return this.timeScale.rightOffsetCandles * this.getCandleSpacing();
        };
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 9 — Smooth Inertia Animation Loop
        // ═══════════════════════════════════════════════════════════════════
        const runInertia = () => {
            if (!this.inertia.active) return;
            
            const now = performance.now();
            const dt = Math.min((now - this.inertia.lastTime) / 16.67, 2); // Normalize to ~60fps
            this.inertia.lastTime = now;
            
            // Apply velocity with friction
            this.inertia.velocityX *= Math.pow(this.inertia.friction, dt);
            this.inertia.velocityY *= Math.pow(this.inertia.friction, dt);
            
            // Apply movement
            this.offsetX += this.inertia.velocityX * dt;
            if (this.yScale && !this.autoScale) {
                const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
                const pricePerPixel = priceRange / (this.h - this.margin.t - this.margin.b);
                this.priceOffset += this.inertia.velocityY * dt * pricePerPixel;
            }
            
            // Check rubber band snap-back
            this.applyRubberBandSnapBack();
            
            this.constrainOffset();
            this.scheduleRender();
            
            // Stop when velocity is negligible
            const speed = Math.sqrt(this.inertia.velocityX ** 2 + this.inertia.velocityY ** 2);
            if (speed > this.inertia.minVelocity) {
                requestAnimationFrame(runInertia);
            } else {
                this.inertia.active = false;
                this.dispatchScrollSync();
            }
        };
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 3 — Rubber Band Resistance
        // ═══════════════════════════════════════════════════════════════════
        const applyRubberBandResistance = (dx, dy) => {
            const m = this.margin;
            const cw = this.w - m.l - m.r;
            const candleSpacing = this.getCandleSpacing();
            const rightMargin = getRightOffset();
            const maxOffset = cw - rightMargin;
            const lastCandleX = (this.data?.length || 1) * candleSpacing;
            const minOffset = cw * 0.3 - lastCandleX;
            
            let resistedDx = dx;
            
            // Apply resistance when overshooting
            if (this.offsetX > maxOffset) {
                const overshoot = this.offsetX - maxOffset;
                const resistance = 1 - Math.min(overshoot / 200, 0.8); // More overshoot = more resistance
                resistedDx = dx * resistance;
                this.rubberBand.active = true;
            } else if (this.offsetX < minOffset) {
                const overshoot = minOffset - this.offsetX;
                const resistance = 1 - Math.min(overshoot / 200, 0.8);
                resistedDx = dx * resistance;
                this.rubberBand.active = true;
            } else {
                this.rubberBand.active = false;
            }
            
            return { dx: resistedDx, dy };
        };
        
        // ═══════════════════════════════════════════════════════════════════
        // STEP 4 — Zoom Logic (CRITICAL) with Cursor Anchoring
        // ═══════════════════════════════════════════════════════════════════
        const handleWheel = (e) => {
            e.preventDefault();

            // No zoom if we have no data
            if (!this.data || this.data.length === 0) return;

            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const m = this.margin;
            
            // Update cursor state
            this.cursor.x = mx;
            this.cursor.y = my;
            this.cursor.mode = detectCursorMode(mx, my);

            // Zoom direction: 1 = zoom in, -1 = zoom out
            const zoomDirection = e.deltaY < 0 ? 1 : -1;
            // Use smaller base factors to slow zoom speed
            const basePriceZoomFactor = 1.06;   // vertical zoom
            const baseTimeZoomFactor = 1.04;    // horizontal zoom
            const priceZoomFactor = zoomDirection > 0 ? basePriceZoomFactor : 1 / basePriceZoomFactor;

            // Current spacing before any zoom
            const oldCandleSpacing = this.getCandleSpacing();

            const priceLocked = this.priceScale && this.priceScale.locked;
            const timeLocked = this.timeScale && this.timeScale.locked;

            // ─── Price axis → vertical (price) zoom only (Ctrl/Meta disabled) ───
            if (this.cursor.mode === 'priceAxis') {
                // When price scale is locked (after double-click), ignore wheel vertical zoom
                if (priceLocked) {
                    return;
                }

                this.autoScale = false;
                this.priceScale.autoScale = false;

                if (this.yScale) {
                    const oldZoom = this.priceZoom;
                    const newZoom = Math.max(0.1, Math.min(20, oldZoom * priceZoomFactor));

                    if (newZoom !== oldZoom) {
                        const priceAreaHeight = this.h - m.t - m.b;
                        const cursorRatio = priceAreaHeight > 0 ? (my - m.t) / priceAreaHeight : 0.5;
                        const domain = this.yScale.domain();
                        const currentRange = domain[1] - domain[0];
                        const zoomRatio = oldZoom / newZoom;
                        const newRange = currentRange * zoomRatio;
                        const rangeChange = newRange - currentRange;

                        this.priceZoom = newZoom;
                        this.priceOffset -= rangeChange * (0.5 - cursorRatio);
                    }
                }

                this.scheduleRender();
                this.dispatchScrollSync();
                return;
            }

            // ─── Time axis or chart area → horizontal (time) zoom / scroll ───
            if (this.cursor.mode === 'timeAxis' || this.cursor.mode === 'chart' || e.shiftKey || e.altKey) {
                // If time axis is locked, prevent any horizontal zoom
                if (timeLocked) {
                    return;
                }

                // Smooth horizontal zoom using a small factor, then snap zoom index
                const widths = this.zoomLevel.allowedWidths || [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
                const minWidth = widths[0];
                const maxWidth = widths[widths.length - 1];

                const timeZoomFactor = zoomDirection > 0 ? baseTimeZoomFactor : 1 / baseTimeZoomFactor;
                const oldWidth = this.candleWidth;
                const newWidth = Math.max(minWidth, Math.min(maxWidth, oldWidth * timeZoomFactor));

                // When price axis is UNLOCKED, using time wheel should freeze vertical auto-scale
                // so Y range stays fixed while we zoom time.
                if (!priceLocked) {
                    this.autoScale = false;
                    this.priceScale.autoScale = false;
                }

                this.candleWidth = newWidth;

                const newCandleSpacing = this.getCandleSpacing();

                // Anchor zoom on the LAST visible candle near the right edge (TradingView-style)
                const rightEdge = this.w - m.r;
                const indexAtRight = (rightEdge - m.l - this.offsetX) / oldCandleSpacing;
                const lastVisibleIndex = Math.max(0, Math.min(this.data.length - 1, Math.floor(indexAtRight)));

                const oldAnchorX = m.l + lastVisibleIndex * oldCandleSpacing + this.offsetX;
                this.offsetX = oldAnchorX - (m.l + lastVisibleIndex * newCandleSpacing);

                // Update zoomLevel index to nearest level so other logic stays consistent
                let nearestIdx = 0;
                let minDiff = Math.abs(newWidth - widths[0]);
                for (let i = 1; i < widths.length; i++) {
                    const diff = Math.abs(newWidth - widths[i]);
                    if (diff < minDiff) {
                        minDiff = diff;
                        nearestIdx = i;
                    }
                }
                this.zoomLevel.candleWidthIndex = nearestIdx;

                this.constrainOffset();
                this.scheduleRender();
                this.dispatchScrollSync();
                return;
            }

            // Fallback: if wheel is used outside axes, do nothing special

            // Debounced save after wheel zoom stops
            clearTimeout(this._wheelSaveTimer);
            this._wheelSaveTimer = setTimeout(() => this.scheduleChartViewSave(), 600);
        };

        this.canvas.addEventListener('wheel', handleWheel, { passive: false });
        if (this.svg && this.svg.node()) {
            this.svg.node().addEventListener('wheel', handleWheel, { passive: false, capture: true });
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3 — Pan Logic (mousedown)
        // ═══════════════════════════════════════════════════════════════════
        this.canvas.addEventListener('mousedown', e => {
            if (this.tool) return; // Drawing tool active
            
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const mode = detectCursorMode(mx, my);
            
            // Unlock axes IMMEDIATELY if clicking on them - before any other processing
            // Skip if we're currently processing a double-click event
            if (mode === 'priceAxis' && this.priceScale.locked && !this._isDoubleClicking) {
                console.log('🔓 Price scale UNLOCKED (immediate on mousedown)');
                this.priceScale.locked = false;
                e.preventDefault();
            } else if (mode === 'timeAxis' && this.timeScale.locked && !this._isDoubleClicking) {
                console.log('🔓 Time scale UNLOCKED (immediate on mousedown)');
                this.timeScale.locked = false;
                e.preventDefault();
            } else if (mode === 'priceAxis' || mode === 'timeAxis') {
                // Prevent text selection when dragging axes
                e.preventDefault();
            }
            
            // Stop any inertia
            this.inertia.active = false;
            
            // Initialize drag state
            this.drag.active = true;
            this.drag.startX = e.clientX;
            this.drag.startY = e.clientY;
            this.drag.lastX = e.clientX;
            this.drag.lastY = e.clientY;
            this.drag.startOffsetX = this.offsetX;
            this.drag.startPriceOffset = this.priceOffset;
            this.drag.shiftKey = e.shiftKey;
            this.drag.ctrlKey = e.ctrlKey || e.metaKey;
            
            // Legacy compatibility
            this.movement.isDragging = true;
            this.movement.lastX = e.clientX;
            this.movement.lastY = e.clientY;
            this.movement.startX = e.clientX;
            this.movement.startY = e.clientY;
            this.movement.lastTime = performance.now();
            
            // ─── STEP 8: Box Zoom (right-click) ───
            if (e.button === 2) {
                this.drag.type = 'boxZoom';
                this.boxZoom.active = true;
                this.boxZoom.startX = mx;
                this.boxZoom.startY = my;
                this.boxZoom.endX = mx;
                this.boxZoom.endY = my;
                return;
            }
            
            // Set drag type based on cursor location
            if (mode === 'priceAxis') {
                console.log('🎯 Setting drag type to priceAxis, locked:', this.priceScale.locked, 'detail:', e.detail);
                this.drag.type = 'priceAxis';
                this.autoScale = false;
                this.priceScale.autoScale = false;
                this.isZooming = true;
                // Ensure cursor is correct
                this.canvas.style.cursor = 'ns-resize';
            } else if (mode === 'timeAxis') {
                console.log('🎯 Setting drag type to timeAxis, locked:', this.timeScale.locked, 'detail:', e.detail);
                this.drag.type = 'timeAxis';
                this.isZooming = true;
            } else if (mode === 'chart') {
                this.drag.type = 'pan';
                // DON'T change autoScale here - preserve lock state from double-click
                // Update cursor to move during pan (unless in dot mode)
                const panCursor = this.cursorType === 'dot' ? 'none' : 'move';
                this.canvas.style.cursor = panCursor;
                if (this.svg && this.svg.node()) {
                    this.svg.node().style.cursor = panCursor;
                }
                
                if (this.replaySystem?.isActive && this.replaySystem.autoScrollEnabled) {
                    this.replaySystem.onUserPan();
                }
            }
        });

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3 — Pan Logic (mousemove) + STEP 2 — Cursor Mode Update
        // ═══════════════════════════════════════════════════════════════════
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            // Update cursor tracking
            this.cursor.x = mx;
            this.cursor.y = my;
            this.mouseX = mx;
            this.mouseY = my;
            
            // Re-render for indicator panel
            if (this.separatePanelInfo) {
                this.scheduleRender();
            }
            
            if (this.drag.active) {
                const now = performance.now();
                const dt = now - this.movement.lastTime;
                const dx = e.clientX - this.drag.lastX;
                const dy = e.clientY - this.drag.lastY;
                
                // Calculate velocity for inertia
                if (dt > 0) {
                    this.inertia.velocityX = dx / (dt / 16.67);
                    this.inertia.velocityY = dy / (dt / 16.67);
                }
                this.movement.lastTime = now;
                
                // Keep cursor style consistent with drag type (sticky behavior)
                if (this.drag.type === 'priceAxis') {
                    this.canvas.style.cursor = 'ns-resize';
                } else if (this.drag.type === 'timeAxis') {
                    this.canvas.style.cursor = 'ew-resize';
                }
                
                // ─── Chart Pan ───
                if (this.drag.type === 'pan') {
                    // Apply axis locking via modifier keys - DISABLED to prevent interference
                    // Shift = horizontal only, Ctrl/Meta = vertical only, default = both
                    // When time scale is locked, block horizontal pan entirely
                    let effectiveDx = this.timeScale.locked ? 0 : dx;
                    // When price scale is locked, block vertical pan entirely
                    let effectiveDy = this.priceScale.locked ? 0 : dy;
                    
                    // Apply rubber band resistance
                    const resisted = applyRubberBandResistance(effectiveDx, effectiveDy);
                    
                    this.offsetX += resisted.dx;
                    
                    // Vertical pan (only when NOT locked)
                    if (this.yScale && effectiveDy !== 0) {
                        this.autoScale = false;
                        this.priceScale.autoScale = false;
                        const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
                        const pricePerPixel = priceRange / (this.h - this.margin.t - this.margin.b);
                        this.priceOffset += resisted.dy * pricePerPixel;
                    }
                    
                    this.constrainOffset();
                    this.scheduleRender();
                    this.dispatchScrollSync();
                    
                    // Update follow button visibility after panning
                    if (this.replaySystem && this.replaySystem.isActive) {
                        this.replaySystem.updateAutoScrollIndicator();
                    }
                }
                // ─── Time Axis Drag Zoom ───
                else if (this.drag.type === 'timeAxis') {
                    // Like price axis: dx controls horizontal zoom, anchored at right edge
                    const sensitivity = 0.008;
                    const zoomFactor = 1 + dx * sensitivity;
                    const widths = this.zoomLevel.allowedWidths || [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
                    const minWidth = widths[0];
                    const maxWidth = widths[widths.length - 1];
                    const newWidth = Math.max(minWidth, Math.min(maxWidth, this.candleWidth * zoomFactor));

                    // Once user manually adjusts time scale, freeze vertical auto-scale (only if price scale is unlocked)
                    if (!this.priceScale.locked) {
                        this.autoScale = false;
                        this.priceScale.autoScale = false;
                    }
                    
                    // Anchor at right edge (last visible candle stays in place)
                    const m = this.margin;
                    const oldSpacing = this.getCandleSpacing();
                    const rightEdge = this.w - m.r;
                    const lastVisibleIdx = (rightEdge - m.l - this.offsetX) / oldSpacing;
                    
                    this.candleWidth = newWidth;
                    const newSpacing = this.getCandleSpacing();
                    
                    // Keep same candle at right edge
                    this.offsetX = rightEdge - m.l - lastVisibleIdx * newSpacing;
                    
                    this.constrainOffset();
                    this.scheduleRender();
                    this.dispatchScrollSync();
                }
                // ─── Price Axis Drag Zoom ───
                else if (this.drag.type === 'priceAxis' && this.yScale) {
                    const sensitivity = 0.008;
                    const zoomFactor = 1 - dy * sensitivity;
                    const newZoom = Math.max(0.1, Math.min(20, this.priceZoom * zoomFactor));
                    
                    // Anchor at cursor Y
                    const m = this.margin;
                    const priceAreaHeight = this.h - m.t - m.b;
                    const cursorRatio = (my - m.t) / priceAreaHeight;
                    
                    const oldRange = this.yScale.domain()[1] - this.yScale.domain()[0];
                    const newRange = oldRange * (this.priceZoom / newZoom);
                    const rangeChange = newRange - oldRange;
                    
                    this.priceOffset -= rangeChange * (0.5 - cursorRatio);
                    this.priceZoom = newZoom;
                    
                    this.scheduleRender();
                }
                // ─── STEP 8: Box Zoom drag ───
                else if (this.drag.type === 'boxZoom') {
                    this.boxZoom.endX = mx;
                    this.boxZoom.endY = my;
                    this.scheduleRender();
                }
                
                this.drag.lastX = e.clientX;
                this.drag.lastY = e.clientY;
            } else {
                // Update cursor based on mode
                const mode = detectCursorMode(mx, my);
                this.cursor.mode = mode;
                
                // Remove axis cursor classes first
                this.canvas.classList.remove('cursor-price-axis', 'cursor-time-axis');
                
                if (mode === 'priceAxis') {
                    this.canvas.classList.add('cursor-price-axis');
                } else if (mode === 'timeAxis') {
                    this.canvas.classList.add('cursor-time-axis');
                } else if (this.tool) {
                    this.canvas.style.cursor = 'crosshair';
                } else {
                    // Check if hovering over a shape - if so, don't override the shape's cursor
                    const svgElement = e.target.closest('svg');
                    const isHoveringShape = svgElement && e.target !== svgElement && 
                                          e.target.tagName !== 'svg' && 
                                          !e.target.classList.contains('chart-tooltip');
                    
                    const dm = this.drawingManager;
                    if (dm && dm._cursorOverInlineText) {
                        this.canvas.style.cursor = 'text';
                        if (this.svg && this.svg.node()) {
                            this.svg.node().style.cursor = 'text';
                        }
                    } else if (!isHoveringShape) {
                        this.canvas.style.cursor = this.getCurrentCursorStyle();
                    }
                }
            }
            
            this.updateCrosshair(e);
            this.updateTooltip(e);
        });

        // ═══════════════════════════════════════════════════════════════════
        // STEP 9 — Inertia on mouseup + STEP 8 — Box Zoom Apply
        // ═══════════════════════════════════════════════════════════════════
        // Shared mouseup handler to prevent code duplication
        const handleMouseUp = (e) => {
            const wasDragging = this.drag.active;
            const dragType = this.drag.type;
            
            // Handle box zoom
            if (dragType === 'boxZoom' && this.boxZoom.active) {
                this.applyBoxZoom();
                this.scheduleChartViewSave();
            }
            // Handle pan end - no inertia, stop immediately
            else if (dragType === 'pan' && wasDragging) {
                this.dispatchScrollSync();
                this.scheduleChartViewSave();
            }
            
            // Reset states
            this.drag.active = false;
            this.drag.type = null;
            this.boxZoom.active = false;
            this.movement.isDragging = false;
            this.isZooming = false;
            
            if (!this.tool) {
                this.canvas.style.cursor = this.getCurrentCursorStyle();
                if (this.svg && this.svg.node()) {
                    this.svg.node().style.cursor = this.getCurrentCursorStyle();
                }
            }
        };
        
        this.canvas.addEventListener('mouseup', handleMouseUp);
        
        // Add document-level mouseup to catch releases outside canvas/axis zones
        // This prevents stuck drag state when mouse is released outside the chart area
        document.addEventListener('mouseup', handleMouseUp);
        
        this.canvas.addEventListener('mouseleave', () => {
            this.drag.active = false;
            this.drag.type = null;
            this.boxZoom.active = false;
            this.inertia.active = false;
            this.canvas.style.cursor = 'default';
            // hideCrosshair is NOT called here — the document-level capture listener
            // calls updateCrosshair() on every move; its own boundary check hides the
            // crosshair when the mouse is genuinely outside the chart area.
            this.hideTooltip();
        });

        // Global capture-phase mousemove: updates the crosshair regardless of which
        // element owns the event (canvas, SVG overlay, resize handles, etc.).
        // This is the single source of truth for crosshair position.
        document.addEventListener('mousemove', (e) => {
            if (typeof this.updateCrosshair === 'function') this.updateCrosshair(e);
        }, true);
        
        // Prevent context menu for box zoom
        this.canvas.addEventListener('contextmenu', e => {
            if (this.boxZoom.active || this.drag.type === 'boxZoom') {
                e.preventDefault();
            }
        });

        // ═══════════════════════════════════════════════════════════════════
        // Double-click on Axis → Auto-scale and LOCK (TradingView style)
        // ═══════════════════════════════════════════════════════════════════
        this.canvas.addEventListener('dblclick', e => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const mode = this.cursor.mode || detectCursorMode(mx, my);
            
            if (mode === 'priceAxis') {
                // Set flag to prevent unlock during this double-click
                this._isDoubleClicking = true;
                setTimeout(() => this._isDoubleClicking = false, 100);
                
                // Reset to auto-scale and lock the price scale (stay at current position)
                this.autoScale = true;
                this.priceScale.autoScale = true;
                this.priceScale.locked = true;
                this.priceScale.lastLockTime = performance.now();
                this.priceZoom = 1;
                this.priceOffset = 0;

                console.log('🔒 Price scale AUTO-SCALED and LOCKED (double-click)');
                
                this.scheduleRender();
            } else if (mode === 'timeAxis') {
                // Auto-scale time axis: reset zoom only (stay at current position)
                // Do NOT lock the time scale - allow horizontal pan/zoom to continue
                this.candleWidth = 8;  // Default candle width
                this.zoomLevel.candleWidthIndex = 4;  // Index for width 8
                
                // Don't move to last candle - just reset zoom at current position
                this.constrainOffset();
                
                console.log('📊 Time scale AUTO-SCALED (double-click)');
                
                this.scheduleRender();
                this.dispatchScrollSync();
            }
        });

        // Drawing tools - Updated to use DrawingToolsManager with ALL new tools
        const allTools = [
            // Lines
            'trendline', 
            'horizontal', 
            'vertical', 
            'ray',
            'horizontal-ray',
            'extended-line',
            'cross-line',
            // Shapes
            'rectangle',
            'rotated-rectangle',
            'ellipse',
            'circle',
            'triangle',
            'arc',
            'curve',
            'double-curve',
            // Arrows
            'arrow',
            'arrow-marker',
            'arrow-mark-up',
            'arrow-mark-down',
            // Labels & Text
            'label',
            'text', 
            'notebox',
            'anchored-text',
            'note',
            'price-note',
            'pin',
            'callout',
            'comment',
            'price-label',
            'price-label-2',
            'signpost-2',
            'flag-mark',
            'image',
            // Freeform / Brushes
            'polyline',
            'path',
            'brush',
            'highlighter',
            // Analysis
            'fibonacci-retracement', 
            'fibonacci-extension',
            'ruler',
            'date-price-range',
            'price-range',
            'date-range',
            'gann-box',
            'anchored-vwap',
            'volume-profile',
            'anchored-volume-profile',
            // Positions
            'long-position',
            'short-position',
            // Patterns
            'bars-pattern',
            'xabcd-pattern',
            'cypher-pattern',
            'head-shoulders',
            'abcd-pattern',
            'triangle-pattern',
            'three-drives',
            // Elliott Waves
            'elliott-impulse',
            'elliott-correction',
            'elliott-triangle',
            'elliott-double-combo',
            'elliott-triple-combo',
            // Cycles
            'cyclic-lines',
            'time-cycles',
            'sine-line',
            // Advanced Fibonacci
            'fib-channel',
            'fib-timezone',
            'fib-speed-fan',
            'trend-fib-time',
            'fib-circles',
            'fib-spiral',
            'fib-arcs',
            'fib-wedge',
            'pitchfan',
            'trend-fib-extension',
            // Advanced Gann
            'gann-square-fixed',
            'gann-square',
            'gann-fan'
        ];

        allTools.forEach(tool => {
            const btnId = tool + 'Tool';
            const btn = document.getElementById(btnId);
            if (!btn) {
                console.warn(`Tool button not found: ${btnId}`);
                return;
            }
            btn.addEventListener('click', () => {
                // If we were in eraser cursor mode, turn it off when selecting any drawing tool
                // Do NOT call setCursorType('cross') here, because that would clear the
                // drawingManager tool we are about to set. Instead, manually reset eraser state
                // and cursor visuals.
                if (this.drawingManager && this.drawingManager.eraserMode) {
                    this.drawingManager.setEraserMode(false);
                    this.cursorType = 'cross';
                    const cursorStyle = this.getCurrentCursorStyle();

                    // Update canvas cursor
                    if (this.canvas) {
                        this.canvas.style.cursor = cursorStyle;
                    }

                    // Update chart wrapper cursor
                    const chartWrapper = this.isPanel ? this.canvas?.parentElement : document.querySelector('.chart-wrapper');
                    if (chartWrapper) {
                        chartWrapper.style.cursor = cursorStyle;
                    }

                    // Update SVG cursor
                    if (this.svg && this.svg.node()) {
                        this.svg.node().style.cursor = cursorStyle;
                    }

                    // Refresh crosshair visibility and cursor dropdown UI to reflect cross mode
                    if (typeof this.updateCrosshairVisibility === 'function') {
                        this.updateCrosshairVisibility('cross');
                    }
                    if (typeof this.updateCursorDropdownUI === 'function') {
                        this.updateCursorDropdownUI('cross');
                    }
                }

                if (this.drawingManager) {
                    this.drawingManager.setTool(tool);
                    // Update active state (but keep keepDrawingMode and magnetMode buttons as they are)
                    document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                } else {
                    this.setTool(tool); // Fallback to old method
                }
                this.syncMagnetButton();
            });
        });

        // Standalone emoji tool button (optional). Safe even if not present.
        const emojiBtn = document.getElementById('emojiToolStandalone');

        console.log('🔍 Drawing manager:', !!this.drawingManager);
        console.log('🔍 EmojiPickerPanel class:', typeof EmojiPickerPanel);
        
        if (emojiBtn && this.drawingManager) {
            // Initialize emoji picker
            if (typeof EmojiPickerPanel !== 'undefined') {
                const emojiPicker = new EmojiPickerPanel();
                console.log('✅ Emoji picker created:', emojiPicker);
                console.log('✅ Picker panel element:', emojiPicker.panel);
                
                // Wire up selection callback
                emojiPicker.onSelect = (options) => {
                    console.log('🎨 Emoji selected:', options);
                    if (this.drawingManager && typeof this.drawingManager.handleEmojiSelection === 'function') {
                        this.drawingManager.handleEmojiSelection(options);
                        // Update active state
                        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                        emojiBtn.classList.add('active');
                        // Hide picker after selection
                        emojiPicker.hide();
                        // Close the dropdown
                        document.querySelectorAll('.tool-dropdown').forEach(dd => {
                            dd.classList.remove('show');
                        });
                    }
                };
                
                // Toggle picker on button click
                emojiBtn.addEventListener('click', (event) => {
                    console.log('🖱️🖱️🖱️ EMOJI BUTTON CLICKED! 🖱️🖱️🖱️');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('🔍 Event:', event);
                    console.log('🔍 Picker object:', emojiPicker);
                    console.log('🔍 Picker visible before toggle:', emojiPicker.visible);
                    console.log('🔍 Calling toggle with button:', emojiBtn);
                    emojiPicker.toggle(emojiBtn);
                    console.log('🔍 Picker visible after toggle:', emojiPicker.visible);
                    console.log('🔍 Panel display:', emojiPicker.panel?.style.display);
                    console.log('🔍 Panel className:', emojiPicker.panel?.className);
                }, true);
                
                console.log('✅ Emoji picker initialized and event listener attached');
            } else {
                console.warn('⚠️ EmojiPickerPanel not loaded');
            }
        } else {
            if (!emojiBtn) console.warn('⚠️ Emoji button not found');
            if (!this.drawingManager) console.warn('⚠️ Drawing manager not found');
        }
        
        // Cursor tool - dropdown is handled by the Tool Group Dropdown Handler script
        // We only need to handle cursor option clicks here
        const cursorDropdown = document.getElementById('cursor-dropdown');
        const cursorIcon = document.getElementById('cursorIcon');
        const cursorBtn = document.getElementById('cursorTool');
        const chartInstance = this; // Store reference for event handlers
        
        // Current cursor type - default to 'cross' so crosshair lines show
        this.cursorType = this.cursorType || 'cross';
        this.showCrosshairLines = true; // Default to showing crosshair lines (cross mode)
        
        console.log('🖱️ Setting up cursor options, dropdown found:', !!cursorDropdown);
        
        // Cursor option handlers
        if (cursorDropdown) {
            const cursorOptions = cursorDropdown.querySelectorAll('.cursor-option');
            console.log('🖱️ Found cursor options:', cursorOptions.length);
            
            // Set 'cross' as selected by default in the UI
            cursorOptions.forEach(option => {
                if (option.getAttribute('data-cursor') === 'cross') {
                    option.classList.add('selected');
                } else {
                    option.classList.remove('selected');
                }
            });
            
            // Initialize cursor type to 'cross'
            chartInstance.setCursorType('cross');
            
            cursorOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    // Skip brush/highlighter tools - they have their own handler
                    if (option.hasAttribute('data-drawing-tool')) {
                        return;
                    }
                    
                    const cursorType = option.getAttribute('data-cursor');
                    if (!cursorType) return;
                    
                    console.log('🖱️ Cursor option clicked:', cursorType);
                    
                    // Set cursor type (this will handle tool clearing internally)
                    chartInstance.setCursorType(cursorType);
                    
                    // Update selected state in dropdown
                    cursorOptions.forEach(o => {
                        if (o.hasAttribute('data-cursor')) {
                            o.classList.remove('selected');
                        }
                    });
                    option.classList.add('selected');
                    
                    // Update main cursor button icon
                    if (cursorIcon) {
                        const optionSvg = option.querySelector('svg');
                        if (optionSvg) {
                            cursorIcon.innerHTML = optionSvg.innerHTML;
                        }
                    }
                    
                    // Set cursor button as active and deactivate other tools
                    if (cursorBtn) {
                        cursorBtn.classList.add('active');
                        document.querySelectorAll('.tool-group-btn:not(#cursorTool)').forEach(b => b.classList.remove('active'));
                    }
                    
                    // Close dropdown and remove dropdown-open states
                    cursorDropdown.classList.remove('show');
                    document.querySelectorAll('.tool-group-btn').forEach(btn => btn.classList.remove('dropdown-open'));
                    document.querySelectorAll('.dropdown-arrow').forEach(arrow => arrow.classList.remove('dropdown-open'));
                    
                    e.stopPropagation();
                });
            });
        }
        
        // Magnet mode toggle - handle both sidebar and toolbar buttons
        const magnetBtns = [document.getElementById('magnetMode'), document.getElementById('magnetModeToolbar')];
        magnetBtns.forEach(magnetBtn => {
            if (magnetBtn) {
                magnetBtn.addEventListener('click', () => {
                    if (this.drawingManager) {
                        const mode = this.drawingManager.toggleMagnetMode();
                        this.magnetMode = mode;
                    } else {
                        const current = this.magnetMode;
                        const normalized = current === true ? 'weak' : (current === false || current == null ? 'off' : current);
                        const modes = ['off', 'weak', 'strong'];
                        const idx = modes.indexOf(normalized);
                        this.magnetMode = modes[(idx + 1) % modes.length];
                    }
                    this.syncMagnetButton();
                    console.log('🧲 Magnet mode:', this.magnetMode);
                });
            }
        });

        // Keep Drawing mode toggle - handle both sidebar and toolbar buttons
        const keepDrawingBtns = [document.getElementById('keepDrawingMode'), document.getElementById('keepDrawingModeToolbar')];
        keepDrawingBtns.forEach(keepDrawingBtn => {
            if (keepDrawingBtn) {
                keepDrawingBtn.addEventListener('click', () => {
                    if (this.drawingManager) {
                        const isOn = this.drawingManager.toggleKeepDrawingMode();
                        // Update both buttons
                        keepDrawingBtns.forEach(btn => {
                            if (btn) {
                                btn.classList.toggle('active', isOn);
                                btn.setAttribute('title', `Keep Drawing Mode (${isOn ? 'ON' : 'OFF'})`);
                            }
                        });
                        console.log('✏️ Keep Drawing mode:', isOn ? 'ON' : 'OFF');
                    }
                });
            }
        });

        // Clear drawings - handle both sidebar and toolbar buttons
        const clearBtns = [document.getElementById('clearDrawings'), document.getElementById('clearDrawingsToolbar')];
        clearBtns.forEach(clearBtn => {
            if (clearBtn) {
                clearBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleClearObjectsMenu(clearBtn);
                });
            }
        });

        // Visibility menu - handle both sidebar and toolbar buttons
        const visibilityBtns = [document.getElementById('toggleVisibilityMenu'), document.getElementById('toggleVisibilityMenuToolbar')];
        visibilityBtns.forEach(visibilityBtn => {
            if (visibilityBtn) {
                visibilityBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleVisibilityMenu(visibilityBtn);
                });
            }
        });

        // Reset Zoom button (removed from UI)
        const resetZoomBtn = document.getElementById('resetZoom');
        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => {
                this.candleWidth = 8;
                this.priceZoom = 1;
                this.priceOffset = 0;
                this.autoScale = true;
                this.fitToView(); // Position to show latest data
                this.scheduleRender();
            });
        }
        
        // Jump to Latest button (removed from UI)
        const jumpLatestBtn = document.getElementById('jumpToLatest');
        if (jumpLatestBtn) {
            jumpLatestBtn.addEventListener('click', () => {
                console.log('🏠 Jump to Latest button clicked');
                this.jumpToLatest();
            });
        }
        
        // Test Interaction button
        const testBtn = document.getElementById('testInteraction');
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                console.log('🔍 TESTING CHART INTERACTION...');
                console.log('Canvas element:', this.canvas);
                console.log('Canvas display:', window.getComputedStyle(this.canvas).display);
                console.log('Canvas pointer-events:', window.getComputedStyle(this.canvas).pointerEvents);
                console.log('Canvas z-index:', window.getComputedStyle(this.canvas).zIndex);
                console.log('Canvas position:', window.getComputedStyle(this.canvas).position);
                console.log('Canvas dimensions:', this.canvas.offsetWidth, 'x', this.canvas.offsetHeight);
                console.log('Data loaded:', this.data.length, 'candles');
                
                // Force enable pointer events
                this.canvas.style.pointerEvents = 'auto';
                this.canvas.style.touchAction = 'none';
                console.log('✅ Forced pointer-events: auto');
                
                // Test by adding a one-time click listener
                const testClick = () => {
                    console.log('🎉 CANVAS CLICK WORKS!');
                    alert('Canvas is clickable! Mouse events are working.');
                    this.canvas.removeEventListener('click', testClick);
                };
                this.canvas.addEventListener('click', testClick);
                console.log('👉 Now click anywhere on the chart area...');
            });
        }

                let start = null, startData = null;
        
        // Handle SVG mousedown for drawing and selection
        this.svg.on('mousedown', (event) => {
            console.log('🖱️ SVG mousedown detected');
            
            // SKIP if in eraser mode - let eraser handler handle it
            if (this.drawingManager && this.drawingManager.eraserMode) {
                console.log('🧹 Eraser mode active - skipping drawing');
                return;
            }
            
            const [x, y] = d3.pointer(event);
            
            // Always stop propagation and prevent defaults for SVG interactions
            event.stopPropagation(); // Prevent canvas drag
            event.preventDefault(); // Prevent text selection
            
            // Ensure we have valid scales before proceeding
            if (!this.xScale || !this.yScale) {
                console.log('⚠️ Missing scales');
                return;
            }
            
            if (!this.tool || this.tool === 'cursor') {
                // Selection mode
                const foundDrawing = this.findDrawingAtPoint(x, y);
                if (foundDrawing) {
                    console.log('🎯 Drawing selected:', foundDrawing.drawing.type);
                    this.selectedDrawing = foundDrawing.index;
                    this.scheduleRender();
                    
                    // Show context menu on right-click only
                    if (event.button === 2) {
                        this.showContextMenu(event.clientX, event.clientY, foundDrawing, this.tool);
                    }
                } else {
                    console.log('   No drawing found - deselecting on canvas click');
                    this.selectedDrawing = null;
                    this.hideContextMenu();
                    this.scheduleRender(); // Update visual to show deselection
                }
            } else {
                // Drawing mode
                console.log('🖌️ Starting drawing with tool:', this.tool);
                
                // Calculate data coordinates - snap to candle center
                const dataIdx = Math.round(this.pixelToDataIndex(x));
                const snappedX = this.dataIndexToPixel(dataIdx);
                let price = this.yScale.invert(y);
                
                // Apply magnet mode snapping
                price = this.snapToOHLC(dataIdx, price);
                
                // Store start points - use snapped X for pixel position
                start = [snappedX, y];
                startData = {idx: dataIdx, price};
                console.log('Drawing started at:', {dataIdx, price});
            }
        });
        
        // Handle SVG mousemove for drawing preview and interaction
        this.svg.on('mousemove', (event) => {
            event.stopPropagation(); // Prevent canvas events while interacting with SVG
            event.preventDefault();
            
            // Always update crosshair so lines follow the cursor when SVG intercepts events
            if (typeof this.updateCrosshair === 'function') this.updateCrosshair(event);
            
            // Skip if no active drawing
            if (!start || !startData || !this.tool) return;
            
            // Get current pointer coordinates - snap to candle center
            const [rawX, y] = d3.pointer(event);
            const snapIdx = Math.round(this.pixelToDataIndex(rawX));
            const x = this.dataIndexToPixel(snapIdx);
            
            // Ensure we're within chart bounds
            const m = this.margin;
            if (rawX < m.l || rawX > this.w - m.r || y < m.t || y > this.h - m.b) return;
            
            // Remove previous preview
            this.svg.selectAll('.temp').remove();
            
            const colors = {
                stroke: '#2962ff',
                fill: 'rgba(41, 98, 255, 0.1)',
                strokeWidth: 2
            };
            
            // Ensure we have valid scales
            if (!this.yScale) return;
            
            try {
                switch (this.tool) {
                    case 'trendline': {
                        this.svg.append('line')
                            .attr('class', 'temp')
                            .attr('x1', start[0])
                            .attr('y1', start[1])
                            .attr('x2', x)
                            .attr('y2', y)
                            .attr('stroke', colors.stroke)
                            .attr('stroke-width', colors.strokeWidth);
                        break;
                    }
                    
                    case 'horizontal': {
                        this.svg.append('line')
                            .attr('class', 'temp')
                            .attr('x1', this.margin.l)
                            .attr('y1', start[1])
                            .attr('x2', this.w - this.margin.r)
                            .attr('y2', start[1])
                            .attr('stroke', colors.stroke)
                            .attr('stroke-width', colors.strokeWidth)
                            .attr('stroke-dasharray', '5,5');
                        break;
                    }
                    
                    case 'vertical': {
                        this.svg.append('line')
                            .attr('class', 'temp')
                            .attr('x1', x)
                            .attr('y1', this.margin.t)
                            .attr('x2', x)
                            .attr('y2', this.h - this.margin.b)
                            .attr('stroke', colors.stroke)
                            .attr('stroke-width', colors.strokeWidth)
                            .attr('stroke-dasharray', '5,5');
                        break;
                    }
                    
                    case 'rectangle': {
                        this.svg.append('rect')
                            .attr('class', 'temp')
                            .attr('x', Math.min(start[0], x))
                            .attr('y', Math.min(start[1], y))
                            .attr('width', Math.abs(x - start[0]))
                            .attr('height', Math.abs(y - start[1]))
                            .attr('fill', colors.fill)
                            .attr('stroke', colors.stroke)
                            .attr('stroke-width', colors.strokeWidth);
                        break;
                    }
                    
                    case 'fibonacci': {
                        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                        const group = this.svg.append('g')
                            .attr('class', 'temp');
                            
                        levels.forEach(level => {
                            const ly = start[1] + (y - start[1]) * level;
                            
                            // Main line
                            group.append('line')
                                .attr('x1', Math.min(start[0], x))
                                .attr('y1', ly)
                                .attr('x2', Math.max(start[0], x))
                                .attr('y2', ly)
                                .attr('stroke', colors.stroke)
                                .attr('stroke-width', level === 0 || level === 1 ? colors.strokeWidth : 1)
                                .attr('stroke-dasharray', level === 0 || level === 1 ? '' : '3,3')
                                .attr('opacity', 0.8);
                            
                            // Price label
                            const price = this.yScale.invert(ly);
                            group.append('text')
                                .attr('x', Math.max(start[0], x) + 5)
                                .attr('y', ly + 4)
                                .attr('fill', colors.stroke)
                                .attr('font-size', '11px')
                                .text(`${(level * 100).toFixed(1)}% - ${price.toFixed(2)}`);
                        });
                        break;
                    }
                }
            } catch (error) {
                console.error('Error drawing preview:', error);
                // Clean up on error
                this.svg.selectAll('.temp').remove();
            }
        });
        
        // Handle clicks on the SVG for drawing selection
        this.svg.on('click', (event) => {
            console.log('🖱️ SVG Click detected at:', d3.pointer(event));
            
            // SKIP if click originated from toolbar or UI elements
            if (event.target.closest('.tool-btn') || 
                event.target.closest('.tool-dropdown') || 
                event.target.closest('.tool-group-btn') ||
                event.target.closest('.toolbar')) {
                console.log('   ⏭️ Skipping - click from toolbar');
                return;
            }
            
            // SKIP if in eraser mode - eraser handler deals with clicks
            if (this.drawingManager && this.drawingManager.eraserMode) {
                return;
            }
            
            if (!this.tool) { // Only handle selection when not in drawing mode
                const [x, y] = d3.pointer(event);
                console.log('   Checking for drawings at:', {x, y});
                const foundDrawing = this.findDrawingAtPoint(x, y);
                
                if (foundDrawing) {
                    console.log('   ✅ Found drawing:', {
                        type: foundDrawing.drawing.type,
                        index: foundDrawing.index
                    });
                    this.selectedDrawing = foundDrawing.index;
                    event.stopPropagation(); // Only stop if we found a drawing
                } else {
                    console.log('   ❌ No drawing found - deselecting');
                    this.selectedDrawing = null;
                    // Don't stop propagation - let it bubble to canvas
                }
                
                this.scheduleRender();
            }
        });

        // NOTE: Removed duplicate mousedown handler as it's already handled above

        // Handle drawing completion on SVG mouseup
        this.svg.on('mouseup', (event) => {
            if (start && startData && this.tool) {  // Only handle if we're in drawing mode
                const [rawX, y] = d3.pointer(event);
                // Snap end point to candle center
                const endIdx = Math.round(this.pixelToDataIndex(rawX));
                const x = this.dataIndexToPixel(endIdx);
                let endPrice = this.yScale?.invert(y);
                
                if (!endPrice) return; // Safety check for yScale
                
                // Apply magnet mode snapping
                endPrice = this.snapToOHLC(endIdx, endPrice);
                
                // Check if this is a click-only tool (text, arrows) or drag tool
                const clickOnlyTools = ['text', 'arrowUp', 'arrowDown'];
                const isClickOnlyTool = clickOnlyTools.includes(this.tool);
                
                // Minimum distance check to prevent accidental clicks (only for drag tools)
                const minDistance = 5; // minimum pixels
                const dx = x - start[0];
                const dy = y - start[1];
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Create drawing if: it's a click-only tool OR distance is sufficient for drag tools
                if (isClickOnlyTool || distance >= minDistance) {
                    let newDrawing;
                    if (this.tool === 'trendline') {
                        newDrawing = {type: 'trendline', x1: startData.idx, y1: startData.price, x2: endIdx, y2: endPrice};
                    } else if (this.tool === 'horizontal') {
                        newDrawing = {type: 'horizontal', price: startData.price};
                    } else if (this.tool === 'vertical') {
                        newDrawing = {type: 'vertical', x: startData.idx};
                    } else if (this.tool === 'rectangle') {
                        newDrawing = {type: 'rectangle', x1: startData.idx, y1: startData.price, x2: endIdx, y2: endPrice};
                    } else if (this.tool === 'fibonacci') {
                        newDrawing = {type: 'fibonacci', x1: startData.idx, y1: startData.price, x2: endIdx, y2: endPrice};
                    } else if (this.tool === 'text') {
                        // Text tool - just single click
                        // Create text immediately and show inline editor
                        newDrawing = {type: 'text', x: startData.idx, y: startData.price, text: 'Text', fontSize: 16};
                        
                        // We'll show the inline editor after the drawing is created
                        this.pendingTextEdit = true;
                    } else if (this.tool === 'arrowUp') {
                        // Arrow up - just single click
                        newDrawing = {type: 'arrowUp', x: startData.idx, y: startData.price, size: 20};
                    } else if (this.tool === 'arrowDown') {
                        // Arrow down - just single click
                        newDrawing = {type: 'arrowDown', x: startData.idx, y: startData.price, size: 20};
                    } else if (this.tool === 'channel') {
                        newDrawing = {type: 'channel', x1: startData.idx, y1: startData.price, x2: endIdx, y2: endPrice};
                    }
                    
                    if (newDrawing) {
                        console.log('✏️ Drawing completed:', newDrawing.type);
                        
                        // Apply saved tool defaults for this tool type
                        const defaults = this.toolDefaults[newDrawing.type] || {};
                        newDrawing.color = defaults.color || '#2962ff';
                        newDrawing.lineWidth = defaults.lineWidth || 2;
                        newDrawing.opacity = defaults.opacity !== undefined ? defaults.opacity : 1;
                        newDrawing.locked = false; // Ensure new drawings are not locked
                        
                        console.log('New drawing created with color:', newDrawing.color, 'from defaults:', defaults.color);
                        
                        // Apply fill properties for shapes
                        if (newDrawing.type === 'rectangle' || newDrawing.type === 'fibonacci') {
                            newDrawing.fillColor = defaults.fillColor || 'rgba(41, 98, 255, 0.1)';
                            newDrawing.fillOpacity = defaults.fillOpacity !== undefined ? defaults.fillOpacity : 0.1;
                        }
                        
                        // Apply text-specific defaults
                        if (newDrawing.type === 'text') {
                            newDrawing.fontSize = defaults.fontSize || 16;
                            newDrawing.fontWeight = defaults.fontWeight || 'bold';
                        }
                        
                        // Apply arrow-specific defaults
                        if (newDrawing.type === 'arrowUp' || newDrawing.type === 'arrowDown') {
                            newDrawing.size = defaults.size || 20;
                        }
                        
                        this.drawings.push(newDrawing);
                        // Automatically select the new drawing
                        this.selectedDrawing = this.drawings.length - 1;
                        
                        // Sync drawing to other panels with same timeframe
                        this.syncDrawingToOtherPanels(newDrawing, 'add');
                        
                        // Save these settings as defaults for next time
                        this.updateToolDefaultsFromDrawing(newDrawing);
                        
                        // Save to localStorage
                        localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, JSON.stringify(this.drawings));
                        
                        // For text tool, enter inline edit mode immediately
                        if (this.pendingTextEdit) {
                            this.pendingTextEdit = false;
                            this.showInlineTextEditor(newDrawing, this.drawings.length - 1);
                        }
                        
                        this.redrawDrawings();
                    }
                    
                    // Automatically deactivate drawing tool after completion (except for text which handles it in editor)
                    if (!this.pendingTextEdit) {
                        this.setTool('cursor');
                    }
                }
                
                // Clear temporary drawing elements
                this.svg.selectAll('.temp').remove();
                if (!this.pendingTextEdit) {
                    this.scheduleRender();
                }
                
                // Reset drawing start points
                start = null;
                startData = null;
            }
        });
        
        // Add touch event support
        this.setupTouchEvents();
        
        // Make left sidebar draggable
        this.setupDraggableToolbox();
        
        console.log('✅ All mouse event listeners attached successfully!');
        console.log('   - Wheel (zoom)');
        console.log('   - Double-click (jump to latest)');
        console.log('   - Mouse down/move/up (pan and drag)');
        console.log('   - Mouse leave (cleanup)');
        console.log('   - Touch events (mobile support)');
        console.log('👉 Try: Mouse wheel to zoom, drag to pan, double-click price axis');
    }
    
    setupTouchEvents() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchLastX = 0;
        let touchLastY = 0;
        let isTouchDragging = false;
        let initialPinchDistance = 0;
        let initialCandleWidth = this.candleWidth;
        
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // Single touch - pan
                const touch = e.touches[0];
                touchStartX = touchLastX = touch.clientX;
                touchStartY = touchLastY = touch.clientY;
                isTouchDragging = true;
                this.movement.lastTime = performance.now();
                e.preventDefault();
            } else if (e.touches.length === 2) {
                // Two finger pinch - zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                initialCandleWidth = this.candleWidth;
                e.preventDefault();
            }
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isTouchDragging) {
                // Single touch pan
                const touch = e.touches[0];
                const now = performance.now();
                const deltaTime = now - this.movement.lastTime || 16;
                
                const dx = touch.clientX - touchLastX;
                const dy = touch.clientY - touchLastY;
                
                // Calculate velocity for momentum
                this.movement.velocityX = dx / (deltaTime / 16);
                this.movement.velocityY = dy / (deltaTime / 16);
                
                // Apply movement
                this.offsetX += dx;
                if (this.yScale) {
                    const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
                    const pricePerPixel = priceRange / (this.h - this.margin.t - this.margin.b);
                    this.priceOffset -= dy * pricePerPixel;
                }
                
                touchLastX = touch.clientX;
                touchLastY = touch.clientY;
                this.movement.lastTime = now;
                
                this.constrainOffset();
                this.scheduleRender();
                e.preventDefault();
            } else if (e.touches.length === 2) {
                // Pinch zoom
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                
                const scale = currentDistance / initialPinchDistance;
                this.candleWidth = Math.max(1, Math.min(100, initialCandleWidth * scale));
                
                this.constrainOffset();
                this.scheduleRender();
                e.preventDefault();
            }
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0 && isTouchDragging) {
                // Apply momentum
                this.applyMomentum();
                isTouchDragging = false;
            }
            if (e.touches.length < 2) {
                initialPinchDistance = 0;
            }
        }, { passive: false });
        
        this.canvas.addEventListener('touchcancel', () => {
            isTouchDragging = false;
            initialPinchDistance = 0;
            this.movement.velocityX = 0;
            this.movement.velocityY = 0;
        });
    }
    
    setupDraggableToolbox() {
        const sidebar = document.querySelector('.left-sidebar');
        if (!sidebar) return;
        
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        
        sidebar.addEventListener('mousedown', (e) => {
            // Only drag if clicking on the sidebar itself, not on buttons
            if (e.target.classList.contains('tool-btn') || 
                e.target.closest('.tool-btn')) {
                return;
            }
            
            isDragging = true;
            initialX = e.clientX - currentX;
            initialY = e.clientY - currentY;
            sidebar.style.cursor = 'move';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            // Keep within viewport bounds
            const rect = sidebar.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            
            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(44, Math.min(currentY, maxY)); // 44px for toolbar
            
            sidebar.style.left = currentX + 'px';
            sidebar.style.top = currentY + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                sidebar.style.cursor = 'move';
            }
        });
    }

    updateSVGPointerEvents() {
        // Update SVG pointer-events based on tool state
        // When drawing tool is active: SVG needs to capture all events for drawing
        // When no tool is active: SVG is transparent to allow canvas panning, shapes handle their own events
        const legacyToolActive = !!this.tool;
        const drawingManagerActive = !!(
            this.drawingManager && (
                this.drawingManager.currentTool ||
                this.drawingManager.eraserMode ||
                this.drawingManager.isRectSelecting ||
                this.drawingManager.drawingState?.isDrawing
            )
        );

        const orderPreviewActive = !!(
            this.orderManager &&
            this.orderManager.previewLines &&
            document.getElementById('orderPanel') &&
            document.getElementById('orderPanel').classList.contains('visible')
        );

        if (legacyToolActive || drawingManagerActive || orderPreviewActive) {
            this.svg.style('pointer-events', 'all'); // Capture all events for drawing
        } else {
            this.svg.style('pointer-events', 'none'); // Let canvas handle panning, shapes handle their own events
        }
    }

    redrawDrawings() {
        // Use new Drawing Tools Manager if available
        if (this.drawingManager && this.xScale && this.yScale) {
            this.drawingManager.redrawAll();
            return;
        }
        
        if (!this.xScale || !this.yScale) return;
        
        // Fallback to legacy drawing system
        // Store current drawings state before clearing
        const currentDrawings = [...this.drawings];
        
        // Remove all SVG elements EXCEPT order lines, SL, TP, and breakeven lines
        this.svg.selectAll('*:not(.order-line):not(.order-label):not(.sl-line):not(.sl-label):not(.sl-label-box):not(.sl-label-text):not(.sl-close-btn):not(.sl-price-box):not(.sl-price-text):not(.tp-line):not(.tp-label):not(.tp-label-box):not(.tp-label-text):not(.tp-close-btn):not(.tp-price-box):not(.tp-price-text):not(.be-line):not(.be-label-box):not(.be-label-text):not(.be-price-box):not(.be-price-text)').remove();
        
        // SVG pointer-events strategy:
        // - SVG layer should always be able to receive events when there are drawings
        // - Individual drawing elements will have pointer-events: all
        // - The setTool() function manages the overall SVG pointer-events state
        
        // Ensure drawings array is maintained
        this.drawings = currentDrawings;
        
        // Update pointer-events after clearing
        this.updateSVGPointerEvents();

        // Render all drawings
        this.drawings.forEach((drawing, idx) => {
            const isSelected = idx === this.selectedDrawing;
            
            // Build style from drawing properties (preserve custom colors)
            // Use explicit check to avoid issues with empty strings or other falsy values
            const style = {
                stroke: (drawing.color && drawing.color !== '') ? drawing.color : '#2962ff',
                fill: (drawing.fillColor && drawing.fillColor !== '') ? drawing.fillColor : 'rgba(41, 98, 255, 0.1)',
                strokeWidth: (drawing.lineWidth || 2) + (isSelected ? 1 : 0), // Add 1px when selected
                opacity: drawing.opacity !== undefined ? drawing.opacity : 1,
                fillOpacity: drawing.fillOpacity !== undefined ? drawing.fillOpacity : 0.1,
                cursor: drawing.locked ? 'not-allowed' : 'grab'
            };
            
            if (idx === 0 || idx === 1) {
                console.log(`Drawing ${idx}:`, {
                    type: drawing.type,
                    hasColor: !!drawing.color,
                    colorValue: drawing.color,
                    styleStroke: style.stroke
                });
            }
            
            // Note: Don't initialize properties here - they're set when drawing is created
            // and preserved through localStorage. This prevents overwriting custom colors.
            
            // Convert data coordinates to pixel coordinates
            const getCoords = (d) => {
                const x1 = this.dataIndexToPixel(d.x1);
                const x2 = this.dataIndexToPixel(d.x2);
                const y1 = this.yScale(d.y1);
                const y2 = this.yScale(d.y2);
                return { x1, y1, x2, y2 };
            };

            let element;
            switch (drawing.type) {
                case 'trendline': {
                    const { x1, y1, x2, y2 } = getCoords(drawing);
                    element = this.svg.append('line')
                        .attr('x1', x1).attr('y1', y1)
                        .attr('x2', x2).attr('y2', y2)
                        .attr('stroke', drawing.color || style.stroke)
                        .attr('stroke-width', drawing.lineWidth || style.strokeWidth)
                        .attr('opacity', drawing.opacity || style.opacity)
                        .style('cursor', drawing.locked ? 'not-allowed' : 'move')
                        .style('pointer-events', 'all')
                        .attr('class', 'trendline-drawing');

                    if (isSelected) {
                        this.addDraggableHandles([
                            {x: x1, y: y1, type: 'start'},
                            {x: x2, y: y2, type: 'end'}
                        ], idx, drawing);
                    }
                    break;
                }

                case 'horizontal': {
                    const y = this.yScale(drawing.price);
                    element = this.svg.append('line')
                        .attr('x1', this.margin.l)
                        .attr('y1', y)
                        .attr('x2', this.w - this.margin.r)
                        .attr('y2', y)
                        .attr('stroke', style.stroke)
                        .attr('stroke-width', style.strokeWidth)
                        .attr('stroke-dasharray', '5,5')
                        .style('cursor', 'default')
                        .style('pointer-events', 'all');
                    break;
                }

                case 'vertical': {
                    const x = this.dataIndexToPixel(drawing.x);
                    element = this.svg.append('line')
                        .attr('x1', x)
                        .attr('y1', this.margin.t)
                        .attr('x2', x)
                        .attr('y2', this.h - this.margin.b)
                        .attr('stroke', style.stroke)
                        .attr('stroke-width', style.strokeWidth)
                        .attr('stroke-dasharray', '5,5')
                        .style('cursor', 'default')
                        .style('pointer-events', 'all');
                    break;
                }

                case 'rectangle': {
                    const { x1, y1, x2, y2 } = getCoords(drawing);
                    element = this.svg.append('rect')
                        .attr('x', Math.min(x1, x2))
                        .attr('y', Math.min(y1, y2))
                        .attr('width', Math.abs(x2 - x1))
                        .attr('height', Math.abs(y2 - y1))
                        .attr('fill', drawing.fillColor || style.fill)
                        .attr('fill-opacity', drawing.fillOpacity || style.fillOpacity)
                        .attr('stroke', drawing.color || style.stroke)
                        .attr('stroke-width', drawing.lineWidth || style.strokeWidth)
                        .attr('opacity', drawing.opacity || style.opacity)
                        .style('cursor', drawing.locked ? 'not-allowed' : 'move')
                        .style('pointer-events', 'all')
                        .attr('class', 'rectangle-drawing');

                    if (isSelected) {
                        this.addDraggableHandles([
                            {x: x1, y: y1, type: 'start'},
                            {x: x2, y: y2, type: 'end'}
                        ], idx, drawing);
                    }
                    break;
                }

                case 'fibonacci': {
                    const { x1, y1, x2, y2 } = getCoords(drawing);
                    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                    element = this.svg.append('g')
                        .style('cursor', 'default')
                        .style('pointer-events', 'all')
                        .attr('class', 'fibonacci-drawing');

                    // Create background fill areas between levels
                    for (let i = 0; i < levels.length - 1; i++) {
                        const ly1 = y1 + (y2 - y1) * levels[i];
                        const ly2 = y1 + (y2 - y1) * levels[i + 1];
                        element.append('rect')
                            .attr('x', Math.min(x1, x2))
                            .attr('y', Math.min(ly1, ly2))
                            .attr('width', Math.abs(x2 - x1))
                            .attr('height', Math.abs(ly2 - ly1))
                            .attr('fill', drawing.fillColor || style.fill)
                            .attr('fill-opacity', (drawing.fillOpacity || style.fillOpacity) * (1 - levels[i]));
                    }

                    levels.forEach(level => {
                        const ly = y1 + (y2 - y1) * level;
                        element.append('line')
                            .attr('x1', Math.min(x1, x2))
                            .attr('y1', ly)
                            .attr('x2', Math.max(x1, x2))
                            .attr('y2', ly)
                            .attr('stroke', drawing.color || style.stroke)
                            .attr('stroke-width', level === 0 || level === 1 ? 
                                (drawing.lineWidth || style.strokeWidth) : 
                                (drawing.lineWidth || style.strokeWidth) - 1)
                            .attr('stroke-dasharray', level === 0 || level === 1 ? '' : '3,3')
                            .attr('opacity', drawing.opacity || style.opacity);

                        element.append('text')
                            .attr('x', Math.max(x1, x2) + 5)
                            .attr('y', ly + 4)
                            .attr('fill', style.stroke)
                            .attr('font-size', '11px')
                            .text(`${(level * 100).toFixed(1)}%`);
                    });
                    break;
                }

                case 'text': {
                    const x = this.dataIndexToPixel(drawing.x);
                    const y = this.yScale(drawing.y);
                    const fontSize = drawing.fontSize || 16;
                    const lineHeight = fontSize * 1.2; // 120% line height
                    
                    element = this.svg.append('text')
                        .attr('x', x)
                        .attr('y', y)
                        .attr('fill', drawing.color || '#ffffff')
                        .attr('font-size', fontSize)
                        .attr('font-weight', drawing.fontWeight || 'bold')
                        .attr('font-family', drawing.fontFamily || 'Arial, sans-serif')
                        .attr('text-anchor', 'middle')
                        .style('cursor', 'move')
                        .style('pointer-events', 'all')
                        .style('user-select', 'none')
                        .attr('class', 'text-drawing');
                    
                    // Split text into lines and create tspan for each
                    const lines = (drawing.text || 'Label').split('\n');
                    lines.forEach((line, i) => {
                        element.append('tspan')
                            .attr('x', x)
                            .attr('dy', i === 0 ? 0 : lineHeight)
                            .text(line);
                    });
                    
                    // Add double-click to edit text
                    element.on('dblclick', (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        this.showInlineTextEditor(drawing, idx);
                    });
                    
                    // Add background for better visibility
                    if (drawing.showBackground !== false) {
                        const bbox = element.node().getBBox();
                        this.svg.insert('rect', 'text.text-drawing')
                            .attr('x', bbox.x - 4)
                            .attr('y', bbox.y - 2)
                            .attr('width', bbox.width + 8)
                            .attr('height', bbox.height + 4)
                            .attr('fill', drawing.backgroundColor || 'rgba(0,0,0,0.7)')
                            .attr('rx', 3)
                            .style('pointer-events', 'all')
                            .style('cursor', 'move');
                    }
                    break;
                }

                case 'arrowUp': {
                    const x = this.dataIndexToPixel(drawing.x);
                    const y = this.yScale(drawing.y);
                    const size = drawing.size || 25;
                    const arrowColor = drawing.color || '#005dc8ff'; // Material green
                    const strokeWidth = drawing.lineWidth || 3;
                    
                    element = this.svg.append('g')
                        .attr('transform', `translate(${x},${y})`)
                        .style('cursor', 'move')
                        .style('pointer-events', 'all')
                        .attr('class', 'arrow-drawing');
                    
                    // Selection circle (only visible when selected)
                    if (isSelected) {
                        element.append('circle')
                            .attr('r', size * 0.8)
                            .attr('fill', 'none')
                            .attr('stroke', '#ffa726')
                            .attr('stroke-width', 2)
                            .attr('stroke-dasharray', '4,4');
                    }
                    
                    // Arrow shaft
                    element.append('line')
                        .attr('x1', 0).attr('y1', 0)
                        .attr('x2', 0).attr('y2', -size)
                        .attr('stroke', arrowColor)
                        .attr('stroke-width', strokeWidth)
                        .attr('stroke-linecap', 'round')
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Arrow head
                    element.append('polygon')
                        .attr('points', `0,${-size-5} ${-size/2.5},${-size*0.6} ${size/2.5},${-size*0.6}`)
                        .attr('fill', arrowColor)
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Add label if specified
                    if (drawing.label) {
                        element.append('text')
                            .attr('x', size)
                            .attr('y', -size/2)
                            .attr('fill', arrowColor)
                            .attr('font-size', '12px')
                            .attr('font-weight', 'bold')
                            .text(drawing.label);
                    }
                    break;
                }

                case 'arrowDown': {
                    const x = this.dataIndexToPixel(drawing.x);
                    const y = this.yScale(drawing.y);
                    const size = drawing.size || 25;
                    const arrowColor = drawing.color || '#d32f2f'; // Material red
                    const strokeWidth = drawing.lineWidth || 3;
                    
                    element = this.svg.append('g')
                        .attr('transform', `translate(${x},${y})`)
                        .style('cursor', 'move')
                        .style('pointer-events', 'all')
                        .attr('class', 'arrow-drawing');
                    
                    // Selection circle (only visible when selected)
                    if (isSelected) {
                        element.append('circle')
                            .attr('r', size * 0.8)
                            .attr('fill', 'none')
                            .attr('stroke', '#ffa726')
                            .attr('stroke-width', 2)
                            .attr('stroke-dasharray', '4,4');
                    }
                    
                    // Arrow shaft
                    element.append('line')
                        .attr('x1', 0).attr('y1', 0)
                        .attr('x2', 0).attr('y2', size)
                        .attr('stroke', arrowColor)
                        .attr('stroke-width', strokeWidth)
                        .attr('stroke-linecap', 'round')
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Arrow head
                    element.append('polygon')
                        .attr('points', `0,${size+5} ${-size/2.5},${size*0.6} ${size/2.5},${size*0.6}`)
                        .attr('fill', arrowColor)
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Add label if specified
                    if (drawing.label) {
                        element.append('text')
                            .attr('x', size)
                            .attr('y', size/2)
                            .attr('fill', arrowColor)
                            .attr('font-size', '12px')
                            .attr('font-weight', 'bold')
                            .text(drawing.label);
                    }
                    break;
                }

                case 'channel': {
                    const { x1, y1, x2, y2 } = getCoords(drawing);
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const offset = drawing.offset || 50; // Default channel width
                    
                    element = this.svg.append('g')
                        .style('cursor', 'move')
                        .style('pointer-events', 'all')
                        .attr('class', 'channel-drawing');
                    
                    // Fill between lines (draw first so it's behind)
                    element.append('polygon')
                        .attr('points', `${x1},${y1} ${x2},${y2} ${x2},${y2+offset} ${x1},${y1+offset}`)
                        .attr('fill', drawing.fillColor || style.fill)
                        .attr('fill-opacity', drawing.fillOpacity || 0.15)
                        .attr('stroke', 'none');
                    
                    // Main trendline
                    element.append('line')
                        .attr('x1', x1).attr('y1', y1)
                        .attr('x2', x2).attr('y2', y2)
                        .attr('stroke', drawing.color || style.stroke)
                        .attr('stroke-width', drawing.lineWidth || style.strokeWidth)
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Parallel line
                    element.append('line')
                        .attr('x1', x1).attr('y1', y1 + offset)
                        .attr('x2', x2).attr('y2', y2 + offset)
                        .attr('stroke', drawing.color || style.stroke)
                        .attr('stroke-width', drawing.lineWidth || style.strokeWidth)
                        .attr('opacity', drawing.opacity || 1);
                    
                    // Add middle line (optional)
                    if (drawing.showMiddleLine !== false) {
                        element.append('line')
                            .attr('x1', x1).attr('y1', y1 + offset/2)
                            .attr('x2', x2).attr('y2', y2 + offset/2)
                            .attr('stroke', drawing.color || style.stroke)
                            .attr('stroke-width', 1)
                            .attr('stroke-dasharray', '5,5')
                            .attr('opacity', 0.5);
                    }
                    
                    // Add handles for selected channel
                    if (isSelected) {
                        this.addDraggableHandles([
                            {x: x1, y: y1, type: 'start'},
                            {x: x2, y: y2, type: 'end'},
                            {x: x1, y: y1 + offset, type: 'offset1'},
                            {x: x2, y: y2 + offset, type: 'offset2'}
                        ], idx, drawing);
                    }
                    break;
                }
            }

            // Add common event handlers and hover effects
            if (element) {
                // Add dragging behavior
                const chart = this; // Store chart instance reference
                let dragStartData = null;
                let hasMoved = false; // Track if shape actually moved
                
                element.on('mousedown', function(event) {
                    console.log('🖱️ Mousedown on shape:', {
                        type: drawing.type,
                        locked: drawing.locked,
                        button: event.button
                    });
                    
                    if (drawing.locked) {
                        console.log('❌ Shape is locked, cannot drag');
                        return; // Don't drag if locked
                    }
                    if (event.button !== 0) {
                        console.log('❌ Not left mouse button');
                        return; // Only left mouse button
                    }
                    
                    event.stopPropagation();
                    event.preventDefault();
                    
                    const svgNode = chart.svg.node();
                    const [mouseX, mouseY] = d3.pointer(event, svgNode);
                    
                    // Store initial positions for dragging
                    dragStartData = {
                        x1: drawing.x1,
                        y1: drawing.y1,
                        x2: drawing.x2,
                        y2: drawing.y2,
                        mouseX: mouseX,
                        mouseY: mouseY,
                        price: drawing.price, // for horizontal lines
                        x: drawing.x, // for vertical lines, text, and arrows
                        y: drawing.y, // for text and arrows
                        type: drawing.type
                    };
                    
                    console.log('🎯 Shape drag started:', drawing.type, dragStartData);
                    
                    element.style('cursor', 'move');
                    
                    // Define event handlers with proper scope
                    const handleMouseMove = function(moveEvent) {
                        if (!dragStartData) return;
                        
                        hasMoved = true; // Mark that movement occurred
                        
                        moveEvent.stopPropagation();
                        moveEvent.preventDefault();
                        
                        // Get coordinates relative to the SVG
                        const svgNode = chart.svg.node();
                        const [currentX, currentY] = d3.pointer(moveEvent, svgNode);
                        
                        // Calculate pixel deltas
                        const dx = currentX - dragStartData.mouseX;
                        const dy = currentY - dragStartData.mouseY;
                        
                        // Convert current position to data coordinates
                        const currentDataX = chart.pixelToDataIndex(currentX);
                        const currentDataY = chart.yScale.invert(currentY);
                        
                        // Calculate data deltas from start position
                        const startDataX = chart.pixelToDataIndex(dragStartData.mouseX);
                        const startDataY = chart.yScale.invert(dragStartData.mouseY);
                        
                        const dDataX = currentDataX - startDataX;
                        const dDataY = currentDataY - startDataY;
                        
                        // Special handling for horizontal zones - move by price only
                        if (drawing.type === 'zone-horizontal') {
                            // Use inverted dDataY because moving down = lower prices
                            const adjustedDDataY = -dDataY;
                            
                            // Only adjust Y coordinates for horizontal zones
                            if (drawing.y1 !== undefined && drawing.y2 !== undefined) {
                                drawing.y1 = dragStartData.y1 - adjustedDDataY;
                                drawing.y2 = dragStartData.y2 - adjustedDDataY;
                                chart.saveDrawingChanges(drawing);
                                chart.redrawDrawings();
                                return;
                            }
                        }
                        
                        // Update drawing coordinates based on type
                        if (drawing.type === 'horizontal') {
                            drawing.price = dragStartData.price + dDataY;
                            // Update element position directly
                            const newY = chart.yScale(drawing.price);
                            element.attr('y1', newY).attr('y2', newY);
                        } else if (drawing.type === 'vertical') {
                            drawing.x = Math.round(dragStartData.x + dDataX);
                            // Update element position directly
                            const newX = chart.dataIndexToPixel(drawing.x);
                            element.attr('x1', newX).attr('x2', newX);
                        } else if (drawing.type === 'text' || drawing.type === 'arrowUp' || drawing.type === 'arrowDown') {
                            // Update position for text and arrows
                            drawing.x = Math.round(dragStartData.x + dDataX);
                            drawing.y = dragStartData.y + dDataY;
                            
                            const newX = chart.dataIndexToPixel(drawing.x);
                            const newY = chart.yScale(drawing.y);
                            
                            if (drawing.type === 'text') {
                                element.attr('x', newX).attr('y', newY);
                            } else {
                                // For arrows, update the transform
                                element.attr('transform', `translate(${newX},${newY})`);
                            }
                        } else {
                            drawing.x1 = Math.round(dragStartData.x1 + dDataX);
                            drawing.x2 = Math.round(dragStartData.x2 + dDataX);
                            drawing.y1 = dragStartData.y1 + dDataY;
                            drawing.y2 = dragStartData.y2 + dDataY;
                            
                            // Update element position directly
                            const newX1 = chart.dataIndexToPixel(drawing.x1);
                            const newX2 = chart.dataIndexToPixel(drawing.x2);
                            const newY1 = chart.yScale(drawing.y1);
                            const newY2 = chart.yScale(drawing.y2);
                            
                            if (drawing.type === 'trendline') {
                                element.attr('x1', newX1).attr('y1', newY1)
                                       .attr('x2', newX2).attr('y2', newY2);
                            } else if (drawing.type === 'rectangle') {
                                element.attr('x', Math.min(newX1, newX2))
                                       .attr('y', Math.min(newY1, newY2))
                                       .attr('width', Math.abs(newX2 - newX1))
                                       .attr('height', Math.abs(newY2 - newY1));
                            } else if (drawing.type === 'fibonacci') {
                                // For fibonacci, we need to update all the lines and rects
                                // Just update the data, will redraw on mouseup
                            }
                        }
                        
                        // Don't redraw during drag - just update the element directly
                        // This prevents the element from being recreated and losing the drag state
                    };

                    const handleMouseUp = function(upEvent) {
                        if (!dragStartData) return;
                        
                        upEvent.stopPropagation();
                        upEvent.preventDefault();
                        
                        // Clean up
                        const didMove = hasMoved;
                        dragStartData = null;
                        hasMoved = false;
                        element.style('cursor', 'grab');
                        
                        // Remove temporary event listeners
                        window.removeEventListener('mousemove', handleMouseMove, true);
                        window.removeEventListener('mouseup', handleMouseUp, true);
                        
                        if (didMove) {
                            chart.saveDrawingChanges(drawing);
                            chart.redrawDrawings();
                            console.log('✅ Shape drag completed');
                        }
                    };
                    
                    // Add temporary move and up handlers with capture phase
                    window.addEventListener('mousemove', handleMouseMove, true);
                    window.addEventListener('mouseup', handleMouseUp, true);
                });
                
                element
                    .attr('class', `drawing ${drawing.type}${isSelected ? ' selected' : ''}`);
                // Note: pointer-events already set to 'all' when element was created
                
                element.on('click', (event) => {
                    event.stopPropagation(); // Prevent bubbling
                    
                    console.log(`👆 Click event on shape ${idx}:`, {
                        hasMoved,
                        currentSelection: chart.selectedDrawing,
                        type: drawing.type
                    });
                    
                    // Don't change selection if we just finished dragging
                    if (hasMoved) {
                        console.log('   ⏭️ Skipping click - shape was dragged');
                        hasMoved = false;
                        return;
                    }
                    
                    // Toggle ONLY if clicking the same shape again, otherwise just select
                    const wasSelected = chart.selectedDrawing === idx;
                    if (wasSelected) {
                        // Clicking same shape = deselect
                        chart.selectedDrawing = null;
                        chart.hideContextMenu();
                        console.log('   🔵 Deselected shape:', idx);
                    } else {
                        // Clicking different shape = select it
                        console.log(`   🟢 Selecting shape ${idx} (previous: ${chart.selectedDrawing})`);
                        chart.selectedDrawing = idx;
                        // Show context menu automatically when selecting
                        chart.showContextMenu(event.clientX, event.clientY, {index: idx, drawing}, null);
                    }
                    
                    chart.scheduleRender(); // Redraw to update selection visuals
                });

                element.on('contextmenu', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('🖱️ Right-click on drawing');
                    chart.selectedDrawing = idx;
                    chart.showContextMenu(event.clientX, event.clientY, {index: idx, drawing}, null);
                    chart.scheduleRender();
                });
                
                this.addHoverEffects(element, isSelected, drawing.type);
            }
        });
    }

    setTool(tool) {
        const previousTool = this.tool;

        // If selecting a drawing tool, disable eraser mode
        if (tool && tool !== 'cursor' && this.drawingManager && this.drawingManager.eraserMode) {
            this.drawingManager.setEraserMode(false);
            this.cursorType = 'cross'; // Reset cursor type
        }

        // Handle tool selection
        if (tool === 'cursor') {
            this.tool = null;
        } else if (this.tool === tool) {
            this.tool = null; // Toggle off if same tool clicked
        } else {
            this.tool = tool;
        }
        
        // Update UI to reflect tool state
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (this.tool && this.tool !== 'cursor') {
            const btnId = this.tool + 'Tool';
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }

        this.syncMagnetButton();
        
        // Update SVG pointer-events based on tool state
        // Enable pointer-events if a tool is active OR if there are drawings to interact with
        this.updateSVGPointerEvents();
        
        // Update SVG class for drawing state
        this.svg.classed('drawing', !!this.tool && this.tool !== 'cursor');
        
        // Clear selected drawing when switching tools
        if (this.tool !== 'cursor') {
            this.selectedDrawing = null;
            this.hideContextMenu();
        }
        
        // Update cursor style based on tool
        if (this.tool) {
            this.canvas.style.cursor = 'crosshair'; // Drawing tools always use crosshair
        } else {
            this.canvas.style.cursor = this.getCurrentCursorStyle();
        }
        
        // Special handling for transitioning from drawing tool to cursor
        if (previousTool && !this.tool) {
            // Clear any temporary elements when disabling a tool
            this.svg.selectAll('.temp').remove();
            this.scheduleRender();
        }
    }
    
    updateCrosshair(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const m = this.margin;
        
        if (x < m.l || x > this.w - m.r || y < m.t || y > this.h - m.b) {
            this.hideCrosshair();
            this.currentCrosshairTimestamp = null;
            // Broadcast hide to other panels
            if (this.syncCrosshair) {
                this.broadcastCrosshairSync(null, null);
            }
            return;
        }
        
        // Get crosshair elements - for panels, find within the panel container
        const container = this.isPanel ? this.canvas.parentElement : document;
        const vLine = container.querySelector('.crosshair-vertical');
        const hLine = container.querySelector('.crosshair-horizontal');
        const priceLabel = container.querySelector('.price-label');
        const timeLabel = container.querySelector('.time-label');
        
        // Snap crosshair to candle center (like TradingView)
        const dataIdx = Math.round(this.pixelToDataIndex(x));
        const snappedX = this.dataIndexToPixel(dataIdx); // Already returns candle center
        
        // Show crosshair lines for 'cross' cursor type, eraser, drawing tool active, or drawing selected/moved
        // DON'T show lines for 'dot' or 'arrow' cursor types
        const _dm = this.drawingManager;
        const _drawingActive = !!(_dm && (_dm.currentTool || _dm.selectedDrawing || _dm.isDrawing || _dm.isDragging));
        const showLines = (this.cursorType === 'cross' || this.cursorType === 'eraser' || this.tool || _drawingActive) && this.cursorType !== 'dot';
        const crossColor = (this.chartSettings && this.chartSettings.crosshairColor) || 'rgba(120,123,134,0.4)';
        const crossPattern = (this.chartSettings && this.chartSettings.crosshairPattern) || 'dashed';
        const crossWidth = (this.chartSettings && this.chartSettings.crosshairWidth) || 1;
        const vBg = crossPattern === 'solid'
            ? crossColor
            : crossPattern === 'dotted'
                ? `repeating-linear-gradient(to bottom,${crossColor} 0px,${crossColor} 2px,transparent 2px,transparent 6px)`
                : `repeating-linear-gradient(to bottom,${crossColor} 0px,${crossColor} 6px,transparent 6px,transparent 10px)`;
        const hBg = crossPattern === 'solid'
            ? crossColor
            : crossPattern === 'dotted'
                ? `repeating-linear-gradient(to right,${crossColor} 0px,${crossColor} 2px,transparent 2px,transparent 6px)`
                : `repeating-linear-gradient(to right,${crossColor} 0px,${crossColor} 6px,transparent 6px,transparent 10px)`;
        if (vLine) {
            vLine.style.left = snappedX + 'px';
            vLine.style.width = crossWidth + 'px';
            vLine.style.height = 'calc(100% - 30px)';
            vLine.style.display = showLines ? 'block' : 'none';
            vLine.style.background = vBg;
        }
        if (hLine) {
            hLine.style.top = y + 'px';
            hLine.style.height = crossWidth + 'px';
            hLine.style.display = showLines ? 'block' : 'none';
            hLine.style.background = hBg;
        }
        
        // Show dot indicator for 'dot' cursor type
        let dotIndicator = container.querySelector('.cursor-dot-indicator');
        if (!dotIndicator && this.cursorType === 'dot') {
            dotIndicator = document.createElement('div');
            dotIndicator.className = 'cursor-dot-indicator';
            dotIndicator.style.cssText = 'position:absolute;width:10px;height:10px;border-radius:50%;background:#2962ff;border:2px solid #fff;pointer-events:none;z-index:10000;transform:translate(-50%,-50%);box-shadow:0 0 4px rgba(0,0,0,0.3);';
            // Append to proper container - use chart wrapper for main chart, panel container for panels
            const appendTarget = this.isPanel ? container : (document.querySelector('.chart-wrapper') || document.body);
            appendTarget.appendChild(dotIndicator);
            console.log('● Created dot indicator in:', appendTarget.className || appendTarget.tagName);
        }
        if (dotIndicator) {
            if (this.cursorType === 'dot' && !this.tool) {
                // Position relative to canvas
                const rect = this.canvas.getBoundingClientRect();
                const chartWrapper = document.querySelector('.chart-wrapper');
                const wrapperRect = chartWrapper ? chartWrapper.getBoundingClientRect() : {left: 0, top: 0};
                dotIndicator.style.left = (rect.left - wrapperRect.left + snappedX) + 'px';
                dotIndicator.style.top = (rect.top - wrapperRect.top + y) + 'px';
                dotIndicator.style.display = 'block';
            } else {
                dotIndicator.style.display = 'none';
            }
        }
        
        if (priceLabel && this.yScale) {
            const price = this.yScale.invert(y);
            // Format price with appropriate decimals
            let decimals = 2;
            if (price < 0.01) decimals = 6;
            else if (price < 1) decimals = 5;
            else if (price < 10) decimals = 4;
            else if (price < 1000) decimals = 3;
            priceLabel.textContent = price.toFixed(decimals);
            
            // Position label to match canvas current price label
            const m = this.margin;
            const _axisLeft = !!this.priceAxisLeft;
            const _axisW = _axisLeft ? m.l : m.r;
            priceLabel.style.left = (_axisLeft ? 2 : (this.w - m.r)) + 'px';
            priceLabel.style.right = 'auto';
            priceLabel.style.top = y + 'px';
            priceLabel.style.transform = 'translateY(-50%)';
            priceLabel.style.width = (_axisW - 4) + 'px';
            priceLabel.style.textAlign = 'center';
            priceLabel.style.display = (showLines || this.cursorType === 'dot' || this.cursorType === 'eraser') ? 'block' : 'none';
            // Enforce label colors from settings
            if (this.chartSettings.cursorLabelBgColor) priceLabel.style.background = this.chartSettings.cursorLabelBgColor;
            if (this.chartSettings.cursorLabelTextColor) priceLabel.style.color = this.chartSettings.cursorLabelTextColor;
        }
        
        // Update time label position with snapped X
        if (timeLabel) {
            timeLabel.style.left = (snappedX - 80) + 'px';
        }
        
        if (timeLabel && this.xScale && this.data.length > 0) {
            const dataIdx = Math.round(this.pixelToDataIndex(x));
            
            // Calculate timeframe interval from actual data (same as x-axis does)
            let timeframeMs = 60000; // Default 1 minute
            if (this.data.length >= 2) {
                timeframeMs = this.data[1].t - this.data[0].t;
            } else {
                // Auto-detect timeframe from data like x-axis does
                let timeframe = this.currentTimeframe || '1m';
                const tfMap = { '1m': 60000, '2m': 120000, '3m': 180000, '4m': 240000, '5m': 300000, '10m': 600000, '15m': 900000, '30m': 1800000, '45m': 2700000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '1w': 604800000, '1mo': 2592000000 };
                timeframeMs = tfMap[timeframe] || 60000;
            }
            
            // Calculate timestamp based on position (consistent with x-axis display)
            let timestamp = null;
            if (this.data.length > 0) {
                // Always calculate based on first candle + offset for consistency
                // This matches how x-axis positions labels
                const firstCandle = this.data[0];
                timestamp = firstCandle.t + (dataIdx * timeframeMs);
            }
            
            // Show time label if we have a valid timestamp
            if (timestamp && timestamp > 0) {
                const tzDate = this.convertToTimezone(timestamp);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const month = months[tzDate.getMonth()];
                const day = tzDate.getDate();
                const year = tzDate.getFullYear();
                const hours = String(tzDate.getHours()).padStart(2, '0');
                const minutes = String(tzDate.getMinutes()).padStart(2, '0');
                const seconds = String(tzDate.getSeconds()).padStart(2, '0');
                
                // Format based on timeframe - match x-axis label style
                let timeStr;
                const isDailyOrHigher = timeframeMs >= 86400000; // 1 day or more
                if (isDailyOrHigher) {
                    // Match x-axis format: "Apr 28" (no year)
                    timeStr = `${month} ${day}`;
                } else {
                    timeStr = `${month} ${day}, ${year}, ${hours}:${minutes}:${seconds}`;
                }
                
                timeLabel.textContent = timeStr;
                timeLabel.style.left = snappedX + 'px';
                timeLabel.style.transform = 'translateX(-50%)';
                timeLabel.style.display = (showLines || this.cursorType === 'dot' || this.cursorType === 'eraser') ? 'block' : 'none';
                // Enforce label colors from settings
                if (this.chartSettings.cursorLabelBgColor) timeLabel.style.background = this.chartSettings.cursorLabelBgColor;
                if (this.chartSettings.cursorLabelTextColor) timeLabel.style.color = this.chartSettings.cursorLabelTextColor;
            } else if (this.data.length === 0) {
                // Even with no data, show the label (will be empty but visible)
                timeLabel.style.display = (showLines || this.cursorType === 'dot' || this.cursorType === 'eraser') ? 'block' : 'none';
            }
            
            if (dataIdx >= 0 && dataIdx < this.data.length) {
                const candle = this.data[dataIdx];
                
                // Store and broadcast timestamp for panel sync
                this.currentCrosshairTimestamp = candle.t;
                if (this.syncCrosshair && this.yScale) {
                    const price = this.yScale.invert(y);
                    this.broadcastCrosshairSync(candle.t, price);
                }
                
                // Format prices based on value
                const formatPrice = (price) => {
                    if (price > 1000) return price.toFixed(2);
                    if (price > 1) return price.toFixed(4);
                    return price.toFixed(5);
                };
                
                // Determine ID suffix for panel charts
                // Main chart (panel 0 when in multi-layout, or no panel) uses no suffix
                // Other panels use their index as suffix
                const isMainChart = this === window.chart || this.panelIndex === 0;
                const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
                
                // Update OHLC values
                const openElem = document.getElementById('open' + idSuffix);
                const highElem = document.getElementById('high' + idSuffix);
                const lowElem = document.getElementById('low' + idSuffix);
                const closeElem = document.getElementById('close' + idSuffix);

                // Enforce showChartValues flag
                const ohlcStatsEl = openElem && openElem.closest('.ohlc-stats');
                if (ohlcStatsEl) ohlcStatsEl.style.display = this.chartSettings.showChartValues !== false ? '' : 'none';
                
                const ohlcElems = [openElem, highElem, lowElem, closeElem];
                const priceMap = [candle.o, candle.h, candle.l, candle.c];
                ohlcElems.forEach((elem, idx) => {
                    if (!elem) return;
                    elem.textContent = formatPrice(priceMap[idx]);
                    elem.style.color = this.chartSettings.symbolTextColor || '';
                    elem.classList.remove('up', 'down');
                    if (candle.c > candle.o) {
                        elem.classList.add('up');
                    } else if (candle.c < candle.o) {
                        elem.classList.add('down');
                    }
                });
                
                // Update change
                const change = candle.c - candle.o;
                const changePercent = (change / candle.o) * 100;
                const chartChangeElem = document.getElementById('chartChange' + idSuffix);
                if (chartChangeElem) {
                    chartChangeElem.textContent = `${change >= 0 ? '+' : ''}${formatPrice(Math.abs(change))} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
                    chartChangeElem.className = change >= 0 ? 'ohlc-change positive' : 'ohlc-change negative';
                    chartChangeElem.style.color = this.chartSettings.symbolTextColor || '';
                    // Enforce showBarChangeValues flag
                    chartChangeElem.style.display = this.chartSettings.showBarChangeValues !== false ? '' : 'none';
                }
                
                // Update volume (only if showVolume is enabled)
                // Main chart uses "volume", panels use "volumeValue0", "volumeValue1", etc.
                const volumeElem = document.getElementById(isMainChart ? 'volume' : 'volumeValue' + idSuffix);
                if (volumeElem) {
                    if (this.chartSettings.showVolume) {
                        const formatVolume = (vol) => {
                            if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + 'B';
                            if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
                            if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
                            return vol.toFixed(0);
                        };
                        volumeElem.textContent = formatVolume(candle.v || 0);
                        volumeElem.style.display = '';
                        
                        // Color volume based on candle direction (green for up, red for down)
                        if (candle.c >= candle.o) {
                            volumeElem.style.color = '#089981'; // Green for up
                        } else {
                            volumeElem.style.color = '#f23645'; // Red for down
                        }
                    } else {
                        volumeElem.style.display = 'none';
                    }
                }
            }
        }
    }
    
    hideCrosshair() {
        // Get crosshair elements - for panels, find within the panel container
        const container = this.isPanel ? this.canvas.parentElement : document;
        const vLine = container.querySelector('.crosshair-vertical');
        const hLine = container.querySelector('.crosshair-horizontal');
        const priceLabel = container.querySelector('.price-label');
        const timeLabel = container.querySelector('.time-label');
        const dotIndicator = container.querySelector('.cursor-dot-indicator');
        
        if (vLine) vLine.style.display = 'none';
        if (hLine) hLine.style.display = 'none';
        if (priceLabel) priceLabel.style.display = 'none';
        if (timeLabel) timeLabel.style.display = 'none';
        if (dotIndicator) dotIndicator.style.display = 'none';
    }
    
    updateTooltip(e) {
        // Skip for panel instances
        if (this.isPanel) return;
        
        // Only show tooltip when CTRL is pressed
        if (!e.ctrlKey && !this.ctrlPressed) {
            this.hideTooltip();
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const m = this.margin;
        
        // Check if mouse is in chart area (with some padding on the right for price axis)
        if (x < m.l || x > this.w - m.r - 20 || y < m.t || y > this.h - m.b) {
            this.hideTooltip();
            return;
        }
        
        if (!this.xScale || !this.data.length) return;
        
        const dataIdx = Math.round(this.pixelToDataIndex(x));
        if (dataIdx < 0 || dataIdx >= this.data.length) {
            this.hideTooltip();
            return;
        }
        
        const candle = this.data[dataIdx];
        
        // Get display candle (converts to Heikin Ashi if that chart type is active)
        const displayCandle = this.getDisplayCandle(dataIdx);
        
        // Update toolbar OHLC display with display candle values
        this.updateToolbarOHLC(displayCandle);
        
        // Calculate changes and ranges
        const changeAmount = candle.c - candle.o;
        const changePercent = ((candle.c - candle.o) / candle.o) * 100;
        const highLowRange = ((candle.h - candle.l) / candle.l) * 100;
        
        const date = new Date(candle.t);
        const dateStr = date.toLocaleDateString('en-US', { 
            weekday: 'short',
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });
        
        // Enhanced price formatting
        const formatPrice = (val) => {
            const decimals = val < 0.1 ? 6 : val < 1 ? 5 : val < 10 ? 4 : val < 100 ? 3 : 2;
            return val.toFixed(decimals);
        };
        
        // Enhanced volume formatting
        const formatVol = (val) => {
            if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
            if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
            if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
            return val.toFixed(0);
        };
        
        const isLightMode = document.body.classList.contains('light-mode');
        const labelColor = isLightMode ? '#64748b' : '#94a3b8';
        const valueColor = isLightMode ? '#1e293b' : '#f1f5f9';
        const borderColor = isLightMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
        
        const html = `
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid ${borderColor};">
                ${dateStr} ${timeStr}
            </div>
            <div style="display: grid; grid-template-columns: 60px 1fr; gap: 6px 16px; font-size: 13px;">
                <span style="color: ${labelColor};">Open:</span><span style="color: ${valueColor}; font-weight: 500;">$${formatPrice(candle.o)}</span>
                <span style="color: ${labelColor};">High:</span><span style="color: #22c55e; font-weight: 500;">$${formatPrice(candle.h)}</span>
                <span style="color: ${labelColor};">Low:</span><span style="color: #ef4444; font-weight: 500;">$${formatPrice(candle.l)}</span>
                <span style="color: ${labelColor};">Close:</span><span style="color: ${candle.c >= candle.o ? '#22c55e' : '#ef4444'}; font-weight: 500;">$${formatPrice(candle.c)}</span>
                <span style="color: ${labelColor};">Volume:</span><span style="color: ${valueColor}; font-weight: 500;">${formatVol(candle.v)}</span>
            </div>
        `;
        
        this.tooltipDiv
            .html(html)
            .style('visibility', 'visible')
            .style('left', (e.pageX + 15) + 'px')
            .style('top', (e.pageY - 15) + 'px');
    }
    
    hideTooltip() {
        // Skip for panel instances
        if (this.isPanel) return;
        
        if (this.tooltipDiv) {
            this.tooltipDiv.style('visibility', 'hidden');
        }
        // Clear toolbar OHLC when not hovering
        this.updateToolbarOHLC(null);
    }
    
    findNearestOHLCPrice(price) {
        if (!this.data.length) return null;
        
        // Get visible candles
        const candleSpacing = this.getCandleSpacing();
        const firstVisibleIndex = Math.floor(-this.offsetX / candleSpacing);
        const numVisibleCandles = Math.ceil(this.w / candleSpacing);
        const startIdx = Math.max(0, firstVisibleIndex);
        const endIdx = Math.min(this.data.length, firstVisibleIndex + numVisibleCandles + 2);
        
        let nearestPrice = null;
        let minDistance = Infinity;
        
        // Look through visible candles
        for (let i = startIdx; i < endIdx; i++) {
            const candle = this.data[i];
            const prices = [candle.o, candle.h, candle.l, candle.c];
            
            prices.forEach(p => {
                const distance = Math.abs(p - price);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPrice = p;
                }
            });
        }
        
        // Only snap if we're close enough (within 0.5% of price range)
        const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
        const snapThreshold = priceRange * 0.005;
        
        return minDistance <= snapThreshold ? nearestPrice : null;
    }
    
    findDrawingAtPoint(x, y) {
        const m = this.margin;
        
        // First check if point is within chart area
        if (x < m.l || x > this.w - m.r || y < m.t || y > this.h - m.b) {
            return null;
        }
        
        // Check drawings from top to bottom (last drawn on top)
        for (let i = this.drawings.length - 1; i >= 0; i--) {
            const drawing = this.drawings[i];
            if (this.isPointNearDrawing(x, y, drawing)) {
                return { index: i, drawing };
            }
        }
        return null;
    }
    
    isPointNearDrawing(x, y, drawing) {
        // Increase tolerance for touch/mobile
        const tolerance = 8;
        
        // Convert drawing coordinates to pixels
        const getCoords = (d) => {
            if (d.type === 'vertical') {
                return { x: this.dataIndexToPixel(d.x) };
            } else if (d.type === 'horizontal') {
                return { y: this.yScale(d.price) };
            } else {
                return {
                    x1: this.dataIndexToPixel(d.x1),
                    y1: this.yScale(d.y1),
                    x2: this.dataIndexToPixel(d.x2),
                    y2: this.yScale(d.y2)
                };
            }
        };
        
        switch (drawing.type) {
            case 'trendline': {
                const { x1, y1, x2, y2 } = getCoords(drawing);
                return this.distanceToLine(x, y, x1, y1, x2, y2) < tolerance;
            }
            
            case 'horizontal': {
                const { y: y1 } = getCoords(drawing);
                // Check if point is within tolerance vertically and within chart bounds horizontally
                return Math.abs(y - y1) < tolerance && 
                       x >= this.margin.l && 
                       x <= this.w - this.margin.r;
            }
            
            case 'vertical': {
                const { x: x1 } = getCoords(drawing);
                // Check if point is within tolerance horizontally and within chart bounds vertically
                return Math.abs(x - x1) < tolerance &&
                       y >= this.margin.t &&
                       y <= this.h - this.margin.b;
            }
            
            case 'rectangle': {
                const { x1, y1, x2, y2 } = getCoords(drawing);
                const left = Math.min(x1, x2);
                const right = Math.max(x1, x2);
                const top = Math.min(y1, y2);
                const bottom = Math.max(y1, y2);
                
                // Check if point is near rectangle border or inside it
                const nearBorder = 
                    // Near horizontal edges
                    ((Math.abs(y - top) < tolerance || Math.abs(y - bottom) < tolerance) &&
                     x >= left - tolerance && x <= right + tolerance) ||
                    // Near vertical edges
                    ((Math.abs(x - left) < tolerance || Math.abs(x - right) < tolerance) &&
                     y >= top - tolerance && y <= bottom + tolerance);
                     
                const inside = 
                    x >= left && x <= right && y >= top && y <= bottom;
                    
                return nearBorder || inside;
            }
            
            case 'fibonacci': {
                const { x1, y1, x2, y2 } = getCoords(drawing);
                const left = Math.min(x1, x2);
                const right = Math.max(x1, x2);
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                
                // Check if point is near any fibonacci level
                return levels.some(level => {
                    const ly = y1 + (y2 - y1) * level;
                    return (Math.abs(y - ly) < tolerance &&
                           x >= left - tolerance &&
                           x <= right + tolerance);
                });
            }
            
            default:
                return false;
        }
    }
    
    distanceToLine(x, y, x1, y1, x2, y2) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        
        let param = -1;
        if (len_sq != 0) {
            param = dot / len_sq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    showContextMenu(x, y, drawingInfo, previousTool) {
        this.hideContextMenu();
        this.selectedDrawing = drawingInfo.index;
        
        const drawing = drawingInfo.drawing;
        
        // Position menu with smart boundary detection
        const menuWidth = 200; // Approximate menu width
        const menuHeight = 400; // Maximum menu height
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // Adjust position to keep menu in viewport
        let menuX = x;
        let menuY = y;
        
        if (x + menuWidth > viewport.width) {
            menuX = x - menuWidth;
        }
        if (y + menuHeight > viewport.height) {
            menuY = viewport.height - menuHeight;
        }
        
        const menu = this.contextMenu
            .style('visibility', 'visible')
            .style('left', menuX + 'px')
            .style('top', menuY + 'px')
            .style('opacity', '0')
            .style('transform', 'scale(0.95)')
            .style('transition', 'all 0.1s ease-out')
            .html('');
            
        // Trigger reflow and add entrance animation
        setTimeout(() => {
            menu.style('opacity', '1')
                .style('transform', 'scale(1)');
        }, 0);
        
        // Store the previous tool state
        this._previousTool = previousTool;
        
        // Enhanced header with icon
        const headerIcon = {
            trendline: '📈',
            horizontal: '⭐',
            vertical: '⭐',
            rectangle: '⬛',
            fibonacci: '🔢'
        }[drawing.type] || '✏️';
        
        menu.append('div')
            .style('padding', '10px 16px')
            .style('border-bottom', '1px solid #2a2e39')
            .style('background', 'linear-gradient(to right, rgba(41,98,255,0.1), transparent)')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .html(`
                <span style="font-size: 16px;">${headerIcon}</span>
                <span style="color: #2962ff; font-weight: 600; font-size: 13px;">
                    ${drawing.type.toUpperCase()}
                </span>
            `);
            
        // Quick actions section
        const quickActions = menu.append('div')
            .style('padding', '8px')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(3, 1fr)')
            .style('gap', '4px');
            
        // Quick action buttons
        this.addQuickActionButton(quickActions, '🎨', 'Color', () => this.quickColorPicker(drawing));
        this.addQuickActionButton(quickActions, '📏', 'Width', () => this.quickLineWidth(drawing));
        if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
            this.addQuickActionButton(quickActions, '🔲', 'Opacity', () => this.quickOpacity(drawing));
        }
        
        // Clone and transform options
        this.addContextMenuDivider(menu);
        this.addContextMenuItem(menu, 'Clone Drawing', () => this.cloneDrawing(drawing));
        
        // Transform submenu
        const transformSubmenu = menu.append('div')
            .attr('class', 'context-submenu')
            .style('padding', '4px 0');
            
        this.addContextMenuItem(transformSubmenu, '🔄 Flip Horizontal', () => this.flipDrawing(drawing, 'horizontal'));
        
        if (drawing.type === 'trendline' || drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
            this.addContextMenuItem(transformSubmenu, '🔃 Flip Vertical', () => this.flipDrawing(drawing, 'vertical'));
        }
        
        // Extension options for trendlines
        if (drawing.type === 'trendline') {
            this.addContextMenuDivider(menu);
            const extendSubmenu = menu.append('div')
                .attr('class', 'context-submenu')
                .style('padding', '4px 0');
                
            this.addContextMenuItem(extendSubmenu, '⬅️ Extend Left', () => this.extendDrawing(drawing, 'left'));
            this.addContextMenuItem(extendSubmenu, '➡️ Extend Right', () => this.extendDrawing(drawing, 'right'));
            this.addContextMenuItem(extendSubmenu, '↔️ Extend Both', () => this.extendDrawing(drawing, 'both'));
        }
        
        this.scheduleRender();
    }
    
    hideContextMenu() {
        this.contextMenu.style('visibility', 'hidden');
        
        // Restore previous tool state if it exists
        if (this._previousTool) {
            this.setTool(this._previousTool);
            this._previousTool = null;
        }
    }
    
    showChartContextMenu(clientX, clientY, offsetX, offsetY) {
        // Hide ALL chart context menus (from all panels and main chart)
        d3.selectAll('.chart-context-menu').style('visibility', 'hidden');
        
        // Get price at cursor position with proper formatting
        let priceAtCursor = null;
        let priceText = null;
        if (this.yScale) {
            priceAtCursor = this.yScale.invert(offsetY);
            // Use same decimal formatting as price axis
            const priceRange = this.yScale.domain()[1] - this.yScale.domain()[0];
            const decimals = this.getPriceDecimals(priceRange);
            priceText = priceAtCursor.toFixed(decimals);
        }
        
        // Position menu using client coordinates (for fixed positioning)
        const menuWidth = 280;
        const menuHeight = 350;
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        let menuX = clientX;
        let menuY = clientY;
        
        if (clientX + menuWidth > viewport.width) {
            menuX = clientX - menuWidth;
        }
        if (clientY + menuHeight > viewport.height) {
            menuY = viewport.height - menuHeight;
        }
        
        const menu = this.contextMenu
            .style('visibility', 'visible')
            .style('left', menuX + 'px')
            .style('top', menuY + 'px')
            .style('opacity', '0')
            .style('transform', 'scale(0.95)')
            .style('transition', 'all 0.1s ease-out')
            .html('');
            
        setTimeout(() => {
            menu.style('opacity', '1')
                .style('transform', 'scale(1)');
        }, 0);
        
        // Add menu items
        if (priceAtCursor && priceText) {
            this.addContextMenuItem(menu, `Copy price ${priceText}`, () => {
                navigator.clipboard.writeText(priceText);
                this.showNotification(`Price ${priceText} copied to clipboard ✓`);
                this.hideContextMenu();
            });
            
            // Quick add alert at price (instant, no modal)
            this.addContextMenuItem(menu, `🔔 Add alert at ${priceText}`, () => {
                if (window.alertSystem) {
                    window.alertSystem.createAlert({
                        price: priceAtCursor,
                        condition: 'crossing',
                        expiration: 'every_time',
                        color: '#ff9800',
                        showPopup: true,
                        playSound: true
                    });
                } else {
                    this.showError('Alert system not initialized');
                }
                this.hideContextMenu();
            });
            
            this.addContextMenuItem(menu, '🔔 Add alert...', () => {
                if (window.alertSystem) {
                    window.alertSystem.createAlertAtPrice(priceAtCursor);
                } else {
                    this.showError('Alert system not initialized');
                }
                this.hideContextMenu();
            });
        }
        
        this.addContextMenuItem(menu, `Paste`, () => {
            navigator.clipboard.readText().then(text => {
                console.log('Pasted:', text);
                this.showNotification('Paste: ' + text);
            });
            this.hideContextMenu();
        });
        
        this.addContextMenuDivider(menu);
        
        // Toggle crosshair lock
        const crosshairText = this.chartSettings.crosshairLocked 
            ? 'Unlock vertical cursor line by time' 
            : 'Lock vertical cursor line by time';
        this.addContextMenuItem(menu, crosshairText, () => {
            this.chartSettings.crosshairLocked = !this.chartSettings.crosshairLocked;
            this.showNotification(this.chartSettings.crosshairLocked ? 'Crosshair locked ✓' : 'Crosshair unlocked ✓');
            this.hideContextMenu();
        });
        
        this.addContextMenuDivider(menu);
        
        this.addContextMenuItem(menu, 'Object Tree...', () => {
            this.showObjectTree();
            this.hideContextMenu();
        });
        
        this.addContextMenuDivider(menu);
        
        // Count indicators (for demo purposes)
        const indicatorCount = this.drawings.length;
        if (indicatorCount > 0) {
            this.addContextMenuItem(menu, `Remove ${indicatorCount} indicator${indicatorCount > 1 ? 's' : ''}`, () => {
                if (confirm(`Remove all ${indicatorCount} drawings/indicators?`)) {
                    this.drawings = [];
                    // Save to localStorage
                    localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, JSON.stringify([]));
                    this.scheduleRender();
                    this.showNotification('All drawings removed ✓');
                }
                this.hideContextMenu();
            });
        }
        
        this.addContextMenuDivider(menu);
        
        // Toggle marks on bars
        const marksText = this.chartSettings.showMarks 
            ? 'Hide marks on bars' 
            : 'Show marks on bars';
        this.addContextMenuItem(menu, marksText, () => {
            this.chartSettings.showMarks = !this.chartSettings.showMarks;
            this.scheduleRender();
            this.showNotification(this.chartSettings.showMarks ? 'Marks shown ✓' : 'Marks hidden ✓');
            this.hideContextMenu();
        });
        
        // Toggle trade markers (entry/exit signs)
        const showTradeMarkers = this.chartSettings.showTradeMarkers !== false; // default true
        const tradeMarkersText = showTradeMarkers 
            ? 'Hide trade markers' 
            : 'Show trade markers';
        this.addContextMenuItem(menu, tradeMarkersText, () => {
            this.chartSettings.showTradeMarkers = !showTradeMarkers;
            // Toggle visibility of all trade markers
            if (this.orderManager) {
                this.orderManager.toggleTradeMarkers(this.chartSettings.showTradeMarkers);
            }
            this.showNotification(this.chartSettings.showTradeMarkers ? 'Trade markers shown ✓' : 'Trade markers hidden ✓');
            this.hideContextMenu();
        });
        
        this.addContextMenuDivider(menu);
    }
    
    showObjectTree() {
        // Create object tree panel
        const panel = d3.select('body')
            .append('div')
            .attr('class', 'object-tree-panel')
            .style('position', 'fixed')
            .style('right', '20px')
            .style('top', '80px')
            .style('width', '240px')
            .style('max-height', '400px')
            .style('background', 'rgba(5, 0, 40, 0.98)')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '6px')
            .style('box-shadow', '0 8px 24px rgba(0,0,0,0.4)')
            .style('z-index', '2000')
            .style('overflow', 'hidden');
        
        // Header
        const header = panel.append('div')
            .style('padding', '10px 12px')
            .style('border-bottom', '1px solid #2a2e39')
            .style('background', 'linear-gradient(to right, rgba(41,98,255,0.1), transparent)')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center');
        
        header.append('div')
            .style('color', '#d1d4dc')
            .style('font-weight', '600')
            .style('font-size', '13px')
            .text('📊 Object Tree');
        
        header.append('div')
            .style('cursor', 'pointer')
            .style('color', '#787b86')
            .style('font-size', '18px')
            .text('✕')
            .on('click', () => panel.remove());
        
        // Content
        const content = panel.append('div')
            .style('padding', '10px')
            .style('max-height', '350px')
            .style('overflow-y', 'auto');
        
        if (this.drawings.length === 0) {
            content.append('div')
                .style('color', '#787b86')
                .style('text-align', 'center')
                .style('padding', '15px')
                .style('font-size', '13px')
                .text('No drawings or indicators');
        } else {
            this.drawings.forEach((drawing, idx) => {
                const item = content.append('div')
                    .style('padding', '8px 10px')
                    .style('margin-bottom', '6px')
                    .style('background', '#050028')
                    .style('border-radius', '4px')
                    .style('cursor', 'default')
                    .style('transition', 'all 0.2s')
                    .on('mouseenter', function() {
                        d3.select(this).style('background', '#2962ff');
                    })
                    .on('mouseleave', function() {
                        d3.select(this).style('background', '#050028');
                    })
                    .on('click', () => {
                        this.selectedDrawing = idx;
                        this.scheduleRender();
                    });
                
                const icon = {
                    trendline: '📈',
                    horizontal: '⭐',
                    vertical: '⭐',
                    rectangle: '⬛',
                    fibonacci: '🔢',
                    text: '📝'
                }[drawing.type] || '✏️';
                
                item.append('div')
                    .style('display', 'flex')
                    .style('justify-content', 'space-between')
                    .style('align-items', 'center')
                    .style('font-size', '13px')
                    .html(`
                        <span style="color: #d1d4dc;">
                            ${icon} ${drawing.type.charAt(0).toUpperCase() + drawing.type.slice(1)}
                        </span>
                        <span style="color: #787b86; font-size: 11px;">
                            ${drawing.locked ? '🔒' : ''}
                        </span>
                    `);
            });
        }
    }
    
    showInlineTextEditor(drawing, drawingIndex) {
        const dm = this.drawingManager;
        const textEditor = dm && dm.textEditor;
        if (textEditor && typeof textEditor.show === 'function') {
            const x = this.dataIndexToPixel(drawing.x);
            const y = this.yScale(drawing.y);
            const rect = this.canvas.getBoundingClientRect();
            const editX = rect.left + x + window.scrollX;
            const editY = rect.top + y - 20 + window.scrollY;

            textEditor.show(
                editX,
                editY,
                drawing.text || 'Text',
                (newText) => {
                    const normalized = (newText || '').replace(/\r\n/g, '\n').trim();
                    if (normalized) {
                        drawing.text = normalized;
                        this.saveDrawingChanges(drawing);
                        this.redrawDrawings();
                    } else {
                        this.drawings.splice(drawingIndex, 1);
                        this.scheduleRender();
                    }
                    this.setTool('cursor');
                },
                'Enter text…',
                {
                    width: 150,
                    height: 24,
                    padding: '0px',
                    fontSize: `${drawing.fontSize || 16}px`,
                    fontFamily: drawing.fontFamily || 'Arial, sans-serif',
                    fontWeight: drawing.fontWeight || 'bold',
                    color: drawing.color || '#ffffff',
                    textAlign: 'center',
                    hideSelector: drawing && drawing.id ? `.drawing[data-id="${drawing.id}"] text` : ''
                }
            );

            this.setTool('cursor');
            return;
        }

        // Remove any existing text editor
        d3.select('.inline-text-editor').remove();
        
        // Calculate position on screen
        const x = this.dataIndexToPixel(drawing.x);
        const y = this.yScale(drawing.y);
        const rect = this.canvas.getBoundingClientRect();
        
        // Create inline text input
        const editor = d3.select('body').append('div')
            .attr('class', 'inline-text-editor')
            .style('position', 'absolute')
            .style('left', (rect.left + x) + 'px')
            .style('top', (rect.top + y - 20) + 'px')
            .style('transform', 'translate(-50%, -50%)')
            .style('z-index', '10000')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('border', '2px solid #2962ff')
            .style('border-radius', '4px')
            .style('padding', '8px')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.5)');
        
        const input = editor.append('textarea')
            .attr('rows', '3')
            .text(drawing.text || 'Text')
            .style('background', 'transparent')
            .style('border', 'none')
            .style('outline', 'none')
            .style('color', drawing.color || '#ffffff')
            .style('font-size', (drawing.fontSize || 16) + 'px')
            .style('font-weight', drawing.fontWeight || 'bold')
            .style('font-family', drawing.fontFamily || 'Arial, sans-serif')
            .style('text-align', 'center')
            .style('min-width', '150px')
            .style('max-width', '300px')
            .style('padding', '8px')
            .style('resize', 'both')
            .style('overflow', 'auto');
        
        // Focus and select all text
        const inputNode = input.node();
        inputNode.focus();
        inputNode.select();
        
        // Handle save on Enter or blur
        const saveText = () => {
            const newText = inputNode.value.trim();
            if (newText) {
                drawing.text = newText;
                this.saveDrawingChanges(drawing);
                this.redrawDrawings();
            } else {
                // If empty, remove the drawing
                this.drawings.splice(drawingIndex, 1);
                this.scheduleRender();
            }
            editor.remove();
            this.setTool('cursor'); // Return to cursor mode
        };
        
        // Save on Ctrl+Enter or Escape to cancel
        input.on('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                // Ctrl+Enter or Cmd+Enter to save
                event.preventDefault();
                saveText();
            } else if (event.key === 'Escape') {
                // Escape to cancel - remove the drawing
                event.preventDefault();
                this.drawings.splice(drawingIndex, 1);
                this.scheduleRender();
                editor.remove();
                this.setTool('cursor');
            }
            // Regular Enter creates a new line (default behavior)
        });
        
        // Save on blur (click outside)
        input.on('blur', () => {
            setTimeout(saveText, 100); // Small delay to allow other events
        });
    }
    
    addContextMenuDivider(menu) {
        menu.append('div')
            .style('height', '1px')
            .style('background', '#2a2e39')
            .style('margin', '4px 0');
    }
    
    addContextMenuItem(menu, text, onClick, bold = false, color = '#d1d4dc') {
        menu.append('div')
            .attr('class', 'context-menu-item')
            .style('padding', '8px 16px')
            .style('cursor', 'default')
            .style('color', color)
            .style('font-size', '13px')
            .style('font-weight', bold ? '600' : '400')
            .style('white-space', 'nowrap')
            .style('transition', 'all 0.15s')
            .style('user-select', 'none')
            .html(text)
            .on('mouseenter', function() {
                d3.select(this)
                    .style('background', color === '#ef5350' ? 'rgba(239, 83, 80, 0.2)' : '#2962ff')
                    .style('padding-left', '20px');
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .style('background', 'none')
                    .style('padding-left', '16px');
            })
            .on('click', onClick);
    }
    
    showDrawingStyleEditor(drawing) {
        const chart = this; // Store reference for callbacks
        
        // Get the drawing index to ensure we're always working with the array reference
        const drawingIndex = this.drawings.findIndex(d => d === drawing);
        if (drawingIndex === -1) {
            console.error('Drawing not found in array!');
            return;
        }
        
        // Always use the drawing from the array to ensure we have the correct reference
        const actualDrawing = this.drawings[drawingIndex];
        
        console.log('🎨 Opening style editor for drawing:', {
            index: drawingIndex,
            type: actualDrawing.type,
            color: actualDrawing.color,
            sameReference: drawing === actualDrawing
        });
        
        // Create or show style editor panel with enhanced UI
        const styleEditor = d3.select('body')
            .append('div')
            .attr('class', 'drawing-style-editor')
            .style('position', 'fixed')
            .style('right', '20px')
            .style('top', '20px')
            .style('background', 'rgba(5, 0, 40, 0.98)')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '8px')
            .style('padding', '0')
            .style('width', '280px')
            .style('box-shadow', '0 8px 24px rgba(0,0,0,0.4)')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.2s ease-out');
            
        this.chartSettings = {
            backgroundColor: '#050028',
            gridColor: '#2a2e39',
            textColor: '#787b86',
            candleUpColor: '#089981',
            candleDownColor: '#f23645',
            showGrid: true,
            showVolume: true,
            showCrosshair: true,
            crosshairLocked: false,
            showMarks: false
        };
        
        // Clear objects menu state
        this.clearObjectsMenu = null;
        this.clearObjectsMenuVisible = false;
        this.clearObjectsMenuButton = null;
        this.clearObjectsMenuItems = null;
        this.clearObjectsMenuStyleInjected = false;
        this.handleClearObjectsMenuOutsideClick = this.handleClearObjectsMenuOutsideClick.bind(this);
        
        // Visibility menu state
        this.visibilityMenu = null;
        this.visibilityMenuVisible = false;
        this.visibilityMenuButton = null;
        this.visibilityMenuItems = null;
        this.visibilityMenuStyleInjected = false;
        this.drawingsHidden = false;
        this.indicatorsHidden = false;
        this.positionsHidden = false;
        this.handleVisibilityMenuOutsideClick = this.handleVisibilityMenuOutsideClick.bind(this);

        console.log('✅ Chart initialized with modular architecture');
            
        // Header with drawing type and icon
        const headerIcon = {
            trendline: '📈',
            horizontal: '⭐',
            vertical: '⭐',
            rectangle: '⬛',
            fibonacci: '🔢',
            text: '📝',
            arrowUp: '⬆️',
            arrowDown: '⬇️',
            channel: '📊'
        }[actualDrawing.type] || '✏️';
        
        const header = styleEditor.append('div')
            .style('padding', '16px')
            .style('border-bottom', '1px solid #2a2e39')
            .style('background', 'linear-gradient(to right, rgba(41,98,255,0.1), transparent)')
            .style('border-radius', '8px 8px 0 0');
            
        header.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .html(`
                <span style="font-size: 20px;">${headerIcon}</span>
                <span style="color: #d1d4dc; font-weight: 600; font-size: 16px;">
                    ${actualDrawing.type.charAt(0).toUpperCase() + actualDrawing.type.slice(1)} Style
                </span>
            `);
            
        // Main content area
        const content = styleEditor.append('div')
            .style('padding', '16px')
            .style('max-height', '70vh')
            .style('overflow-y', 'auto');
            
        // Style options based on drawing type
        if (actualDrawing.type === 'text') {
            // Text content editor
            const textEditorDiv = content.append('div')
                .style('margin-bottom', '16px');
            
            textEditorDiv.append('label')
                .style('display', 'block')
                .style('color', '#787b86')
                .style('font-size', '12px')
                .style('margin-bottom', '4px')
                .text('Text Content');
            
            const textarea = textEditorDiv.append('textarea')
                .attr('id', 'textContentInput')
                .attr('rows', '3')
                .text(actualDrawing.text || 'Text')
                .style('width', '100%')
                .style('padding', '8px')
                .style('background', '#050028')
                .style('border', '1px solid #2a2e39')
                .style('border-radius', '4px')
                .style('color', '#d1d4dc')
                .style('font-size', '14px')
                .style('font-family', 'inherit')
                .style('resize', 'vertical')
                .on('input', function() {
                    actualDrawing.text = this.value;
                    chart.saveDrawingChanges(actualDrawing);
                    chart.redrawDrawings();
                });
            
            // Divider
            content.append('div')
                .style('height', '1px')
                .style('background', '#2a2e39')
                .style('margin', '16px 0');
            
            // Text-specific controls
            this.addColorPicker(content, 'Text Color', actualDrawing.color || '#ffffff', (color) => {
                actualDrawing.color = color;
                this.saveDrawingChanges(actualDrawing);
                this.redrawDrawings();
            });
            
            this.addColorPicker(content, 'Background Color', actualDrawing.backgroundColor || 'rgba(0,0,0,0.7)', (color) => {
                actualDrawing.backgroundColor = color;
                this.saveDrawingChanges(actualDrawing);
                this.redrawDrawings();
            });
            
            this.addSlider(content, 'Font Size', actualDrawing.fontSize || 16, 8, 48, (size) => {
                actualDrawing.fontSize = size;
                this.saveDrawingChanges(actualDrawing);
                this.redrawDrawings();
            });
            
            // Font weight selector
            content.append('div')
                .style('margin-bottom', '12px')
                .html(`
                    <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 4px;">Font Weight</label>
                    <select id="fontWeightSelect" style="width: 100%; padding: 8px; background: #050028; border: 1px solid #2a2e39; border-radius: 4px; color: #d1d4dc; font-size: 14px;">
                        <option value="normal" ${(drawing.fontWeight || 'bold') === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="bold" ${(drawing.fontWeight || 'bold') === 'bold' ? 'selected' : ''}>Bold</option>
                    </select>
                `);
            
            d3.select('#fontWeightSelect').on('change', function() {
                drawing.fontWeight = this.value;
                chart.saveDrawingChanges(drawing);
                chart.redrawDrawings();
            });
            
            // Toggle background
            const toggleContainer = content.append('div')
                .style('margin-top', '12px')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('justify-content', 'space-between')
                .style('padding', '8px')
                .style('background', '#050028')
                .style('border-radius', '4px');
            
            toggleContainer.append('span')
                .style('color', '#787b86')
                .style('font-size', '12px')
                .text('Show Background');
            
            const checkbox = toggleContainer.append('input')
                .attr('type', 'checkbox')
                .attr('checked', drawing.showBackground !== false ? true : null)
                .style('cursor', 'default')
                .on('change', function() {
                    drawing.showBackground = this.checked;
                    chart.saveDrawingChanges(drawing);
                    chart.redrawDrawings();
                });
                
        } else if (drawing.type === 'trendline' || drawing.type === 'rectangle') {
            this.addColorPicker(content, 'Line Color', actualDrawing.color || '#2962ff', (color) => {
                console.log('🎨 Color picker changed to:', color);
                console.log('   Drawing index:', drawingIndex);
                actualDrawing.color = color;
                console.log('   Drawing after:', actualDrawing.color);
                console.log('   Array color:', chart.drawings[drawingIndex].color);
                chart.saveDrawingChanges(actualDrawing);
                chart.render();
            });
            
            this.addSlider(content, 'Line Width', actualDrawing.lineWidth || 2, 1, 10, (width) => {
                actualDrawing.lineWidth = width;
                chart.saveDrawingChanges(actualDrawing);
                chart.render();
            });
            
            this.addSlider(content, 'Line Opacity', (actualDrawing.opacity || 1) * 100, 0, 100, (opacity) => {
                actualDrawing.opacity = opacity / 100;
                chart.saveDrawingChanges(actualDrawing);
                chart.render();
            });
        }
        
        if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
            content.append('div')
                .style('height', '1px')
                .style('background', '#2a2e39')
                .style('margin', '16px 0');
                
            this.addColorPicker(content, 'Fill Color', drawing.fillColor || 'rgba(41, 98, 255, 0.1)', (color) => {
                drawing.fillColor = color;
                this.render();
            });
            
            this.addSlider(content, 'Fill Opacity', (drawing.fillOpacity || 0.1) * 100, 0, 100, (opacity) => {
                drawing.fillOpacity = opacity / 100;
                this.render();
            });
        }
        
        // Style presets section
        content.append('div')
            .style('margin-top', '16px')
            .style('padding-top', '16px')
            .style('border-top', '1px solid #2a2e39');
            
        content.append('h4')
            .style('margin', '0 0 8px 0')
            .style('color', '#787b86')
            .text('Quick Styles');
            
        const presets = content.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(4, 1fr)')
            .style('gap', '8px');
            
        // Add style presets
        const presetStyles = [
            { color: '#2962ff', name: 'Blue' },
            { color: '#26a69a', name: 'Green' },
            { color: '#ef5350', name: 'Red' },
            { color: '#ffa726', name: 'Orange' },
        ];
        
        presetStyles.forEach(preset => {
            const presetBtn = presets.append('div')
                .style('display', 'flex')
                .style('flex-direction', 'column')
                .style('align-items', 'center')
                .style('padding', '8px')
                .style('cursor', 'default')
                .style('border-radius', '4px')
                .style('transition', 'all 0.15s')
                .on('mouseenter', function() {
                    d3.select(this).style('background', 'rgba(41, 98, 255, 0.1)');
                })
                .on('mouseleave', function() {
                    d3.select(this).style('background', 'none');
                })
                .on('click', () => {
                    const updatedDrawing = {...drawing};
                    updatedDrawing.color = preset.color;
                    if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                        updatedDrawing.fillColor = d3.color(preset.color).copy({opacity: drawing.fillOpacity || 0.1});
                    }
                    this.saveDrawingChanges(updatedDrawing);
                    this.render();
                });
                
            presetBtn.append('div')
                .style('width', '24px')
                .style('height', '24px')
                .style('border-radius', '12px')
                .style('background', preset.color)
                .style('border', '2px solid #2a2e39');
                
            presetBtn.append('div')
                .style('font-size', '11px')
                .style('color', '#787b86')
                .style('margin-top', '4px')
                .text(preset.name);
        });
        
        // Buttons section
        const buttons = styleEditor.append('div')
            .style('padding', '16px')
            .style('border-top', '1px solid #2a2e39')
            .style('display', 'flex')
            .style('gap', '8px');
            
        // Reset button
        buttons.append('button')
            .style('flex', '1')
            .style('padding', '8px')
            .style('background', 'none')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '4px')
            .style('color', '#d1d4dc')
            .style('cursor', 'default')
            .style('transition', 'all 0.15s')
            .text('Reset')
            .on('mouseenter', function() {
                d3.select(this).style('background', 'rgba(42,46,57,0.5)');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', 'none');
            })
            .on('click', () => {
                // Reset to default styles
                drawing.color = '#2962ff';
                drawing.lineWidth = 2;
                drawing.opacity = 1;
                if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                    drawing.fillColor = 'rgba(41, 98, 255, 0.1)';
                    drawing.fillOpacity = 0.1;
                }
                this.render();
            });
            
        // Close button
        buttons.append('button')
            .style('flex', '1')
            .style('padding', '8px')
            .style('background', '#2962ff')
            .style('border', 'none')
            .style('border-radius', '4px')
            .style('color', '#fff')
            .style('cursor', 'default')
            .style('transition', 'all 0.15s')
            .text('Done')
            .on('mouseenter', function() {
                d3.select(this).style('background', '#1e88e5');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', '#2962ff');
            })
            .on('click', () => {
                styleEditor
                    .style('opacity', '0')
                    .style('transform', 'translateY(-10px)');
                    
                setTimeout(() => styleEditor.remove(), 200);
            });
            
        // Trigger entrance animation
        setTimeout(() => {
            styleEditor
                .style('opacity', '1')
                .style('transform', 'translateY(0)');
        }, 0);
    }
    
    addColorPicker(container, label, value, onChange) {
        const chart = this;
        const wrapper = container.append('div')
            .style('margin-bottom', '16px');
            
        const header = wrapper.append('div')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('margin-bottom', '8px');
            
        header.append('label')
            .style('color', '#d1d4dc')
            .style('font-size', '13px')
            .text(label);
            
        const preview = header.append('div')
            .style('width', '24px')
            .style('height', '24px')
            .style('border-radius', '4px')
            .style('background', value)
            .style('border', '2px solid #2a2e39')
            .style('cursor', 'default');
        
        // Create color palette
        const palette = wrapper.append('div')
            .attr('class', 'color-palette')
            .style('display', 'none')
            .style('padding', '12px')
            .style('background', '#050028')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '6px')
            .style('margin-top', '8px');
        
        // Define color palette (similar to TradingView)
        const colors = [
            // Row 1 - Grays
            ['#ffffff', '#e8e8e8', '#d1d1d1', '#b8b8b8', '#a0a0a0', '#888888', '#707070', '#585858', '#404040', '#000000'],
            // Row 2 - Bright colors
            ['#ff4444', '#ff9800', '#ffeb3b', '#4caf50', '#009688', '#00bcd4', '#2196f3', '#9c27b0', '#673ab7', '#e91e63'],
            // Row 3 - Light pastels
            ['#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
            // Row 4 - Medium pastels
            ['#ef9a9a', '#ffcc80', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90caf9', '#b39ddb', '#ce93d8', '#f48fb1'],
            // Row 5 - Saturated
            ['#e57373', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4dd0e1', '#64b5f6', '#9575cd', '#ba68c8', '#f06292'],
            // Row 6 - Vivid
            ['#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#009688', '#00bcd4', '#2196f3', '#9c27b0', '#ab47bc', '#ec407a'],
            // Row 7 - Deep
            ['#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#00796b', '#0097a7', '#1976d2', '#7b1fa2', '#8e24aa', '#c2185b'],
            // Row 8 - Dark
            ['#c62828', '#ef6c00', '#f9a825', '#2e7d32', '#00695c', '#00838f', '#0d47a1', '#6a1b9a', '#7b1fa2', '#ad1457'],
            // Row 9 - Darkest
            ['#b71c1c', '#e65100', '#f57f17', '#1b5e20', '#004d40', '#006064', '#01579b', '#4a148c', '#6a1b9a', '#880e4f']
        ];
        
        // Create color grid
        const grid = palette.append('div')
            .style('display', 'grid')
            .style('grid-template-columns', 'repeat(10, 1fr)')
            .style('gap', '6px')
            .style('margin-bottom', '12px');
        
        colors.forEach(row => {
            row.forEach(color => {
                grid.append('div')
                    .style('width', '24px')
                    .style('height', '24px')
                    .style('background', color)
                    .style('border-radius', '4px')
                    .style('cursor', 'default')
                    .style('border', color === value ? '2px solid #ffffff' : '2px solid transparent')
                    .style('transition', 'all 0.15s ease')
                    .on('mouseenter', function() {
                        if (color !== value) {
                            d3.select(this).style('transform', 'scale(1.1)');
                        }
                    })
                    .on('mouseleave', function() {
                        d3.select(this).style('transform', 'scale(1)');
                    })
                    .on('click', function() {
                        // Update all color swatches
                        grid.selectAll('div')
                            .style('border', c => c === color ? '2px solid #ffffff' : '2px solid transparent');
                        
                        preview.style('background', color);
                        onChange(color);
                        palette.style('display', 'none');
                        
                        // Force redraw
                        setTimeout(() => {
                            if (chart.redrawDrawings) chart.redrawDrawings();
                            if (chart.render) chart.render();
                        }, 10);
                    });
            });
        });
        
        // Add custom color button with opacity slider
        const footer = palette.append('div')
            .style('padding-top', '12px')
            .style('border-top', '1px solid #2a2e39');
        
        const customBtn = footer.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .style('cursor', 'default')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('transition', 'background 0.15s ease')
            .on('mouseenter', function() {
                d3.select(this).style('background', '#2a2e39');
            })
            .on('mouseleave', function() {
                d3.select(this).style('background', 'transparent');
            })
            .on('click', function() {
                customInput.node().click();
            });
        
        customBtn.append('div')
            .style('width', '32px')
            .style('height', '32px')
            .style('border', '2px solid #2a2e39')
            .style('border-radius', '4px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('color', '#787b86')
            .style('font-size', '20px')
            .text('+');
        
        customBtn.append('span')
            .style('color', '#d1d4dc')
            .style('font-size', '13px')
            .text('Custom Color');
        
        const customInput = palette.append('input')
            .attr('type', 'color')
            .style('opacity', '0')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .on('input', function() {
                const color = this.value;
                preview.style('background', color);
                onChange(color);
                palette.style('display', 'none');
            });
        
        // Toggle palette on preview click
        let paletteVisible = false;
        preview.on('click', function() {
            paletteVisible = !paletteVisible;
            palette.style('display', paletteVisible ? 'block' : 'none');
        });
    }
    
    addSlider(container, label, value, min, max, onChange) {
        const wrapper = container.append('div')
            .style('margin-bottom', '16px');
            
        const header = wrapper.append('div')
            .style('display', 'flex')
            .style('justify-content', 'space-between')
            .style('align-items', 'center')
            .style('margin-bottom', '8px');
            
        header.append('label')
            .style('color', '#d1d4dc')
            .style('font-size', '13px')
            .text(label);
            
        const valueDisplay = header.append('span')
            .style('color', '#787b86')
            .style('font-size', '13px')
            .text(value);
            
        const sliderContainer = wrapper.append('div')
            .style('position', 'relative')
            .style('height', '20px')
            .style('display', 'flex')
            .style('align-items', 'center');
            
        // Track background
        sliderContainer.append('div')
            .style('position', 'absolute')
            .style('left', '0')
            .style('right', '0')
            .style('height', '4px')
            .style('background', '#2a2e39')
            .style('border-radius', '2px');
            
        // Active track
        const activeTrack = sliderContainer.append('div')
            .style('position', 'absolute')
            .style('left', '0')
            .style('width', ((value - min) / (max - min) * 100) + '%')
            .style('height', '4px')
            .style('background', '#2962ff')
            .style('border-radius', '2px');
            
        // Thumb
        const thumb = sliderContainer.append('div')
            .style('position', 'absolute')
            .style('left', ((value - min) / (max - min) * 100) + '%')
            .style('width', '16px')
            .style('height', '16px')
            .style('background', '#2962ff')
            .style('border', '2px solid #fff')
            .style('border-radius', '8px')
            .style('transform', 'translateX(-8px)')
            .style('cursor', 'default')
            .style('transition', 'transform 0.1s');
            
        // Actual range input (invisible but functional)
        const input = sliderContainer.append('input')
            .attr('type', 'range')
            .attr('min', min)
            .attr('max', max)
            .attr('value', value)
            .style('position', 'absolute')
            .style('width', '100%')
            .style('height', '20px')
            .style('opacity', '0')
            .style('cursor', 'default')
            .on('input', function() {
                const val = +this.value;
                valueDisplay.text(val);
                activeTrack.style('width', ((val - min) / (max - min) * 100) + '%');
                thumb.style('left', ((val - min) / (max - min) * 100) + '%');
                onChange(val);
            })
            .on('mousedown', () => {
                thumb.style('transform', 'translateX(-8px) scale(1.2)');
            })
            .on('mouseup', () => {
                thumb.style('transform', 'translateX(-8px) scale(1)');
            });
    }
    
    cloneDrawing(drawing) {
        const clone = JSON.parse(JSON.stringify(drawing));
        // Offset the clone slightly
        if (clone.type === 'trendline' || clone.type === 'rectangle') {
            clone.x1 += 2;
            clone.x2 += 2;
            clone.y1 *= 1.01;
            clone.y2 *= 1.01;
        }
        this.drawings.push(clone);
        // Sync cloned drawing to other panels
        this.syncDrawingToOtherPanels(clone, 'add');
        this.hideContextMenu();
        this.render();
    }
    
    /**
     * Sync drawing to other panels with same timeframe
     * Only works for panel instances
     */
    syncDrawingToOtherPanels(drawing, action = 'add') {
        console.log(`🔍 syncDrawingToOtherPanels called:`, {
            isPanel: this.isPanel,
            hasPanel: !!this.panel,
            hasSyncSystem: !!window.panelDrawingSync,
            action: action,
            drawingType: drawing.type
        });
        
        // Only sync if this is a panel instance and sync system is available
        if (!this.isPanel || !this.panel || !window.panelDrawingSync) {
            console.log('⚠️ Sync skipped - not a panel or sync system not available');
            return;
        }
        
        // Call the global sync system
        console.log(`✅ Calling panelDrawingSync.syncDrawing for panel ${this.panel.index}`);
        window.panelDrawingSync.syncDrawing(this.panel, drawing, action);
    }
    
    addQuickActionButton(container, icon, label, onClick) {
        const button = container.append('div')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('padding', '8px')
            .style('cursor', 'default')
            .style('border-radius', '4px')
            .style('transition', 'all 0.15s ease')
            .on('mouseenter', function() {
                d3.select(this)
                    .style('background', 'rgba(41, 98, 255, 0.1)');
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .style('background', 'none');
            })
            .on('click', onClick);
            
        button.append('div')
            .style('font-size', '16px')
            .text(icon);
            
        button.append('div')
            .style('font-size', '11px')
            .style('color', '#787b86')
            .style('margin-top', '4px')
            .text(label);
            
        return button;
    }
    
    addHoverEffects(element, isSelected, type = 'basic') {
        const colors = {
            default: {
                stroke: '#2962ff',
                fill: 'rgba(41, 98, 255, 0.1)',
                strokeWidth: 2,
                opacity: 0.8,
                cursor: 'default'
            },
            hover: {
                stroke: '#ffa726',
                fill: 'rgba(255, 167, 38, 0.2)',
                strokeWidth: 3,
                opacity: 1,
                cursor: 'default'
            },
            selected: {
                stroke: '#ffa726',
                fill: 'rgba(255, 167, 38, 0.15)',
                strokeWidth: 3,
                opacity: 1,
                cursor: 'grab'
            }
        };

        const currentStyle = isSelected ? colors.selected : colors.default;

        function applyStyle(element, style, highlight = false) {
            console.log('Applying style:', { type, highlight, style });
            
            const effectiveStyle = highlight ? {
                ...style,
                strokeWidth: style.strokeWidth + (isSelected ? 0 : 1),
                opacity: 1
            } : style;

            switch (type) {
                case 'basic':
                case 'trendline':
                case 'horizontal':
                case 'vertical':
                    element
                        .transition().duration(100)
                        .attr('stroke', effectiveStyle.stroke)
                        .attr('stroke-width', effectiveStyle.strokeWidth)
                        .style('opacity', effectiveStyle.opacity);
                    break;
                    
                case 'rectangle':
                    element
                        .transition().duration(100)
                        .attr('stroke', effectiveStyle.stroke)
                        .attr('stroke-width', effectiveStyle.strokeWidth)
                        .attr('fill', effectiveStyle.fill)
                        .style('opacity', effectiveStyle.opacity);
                    break;
                    
                case 'fibonacci':
                    element.selectAll('line')
                        .transition().duration(100)
                        .attr('stroke', effectiveStyle.stroke)
                        .attr('stroke-width', (d, i) => 
                            (i === 0 || i === 6 ? effectiveStyle.strokeWidth : effectiveStyle.strokeWidth - 1))
                        .style('opacity', effectiveStyle.opacity);
                    
                    element.selectAll('text')
                        .transition().duration(100)
                        .attr('fill', effectiveStyle.stroke)
                        .style('opacity', effectiveStyle.opacity);
                    break;
            }
        }

        // Apply initial style
        applyStyle(element, currentStyle);

        // Add hover effects
        element
            .on('mouseenter', () => {
                console.log('🖱️ Drawing hover:', type);
                applyStyle(element, colors.hover, true);
                element.style('cursor', 'default');
            })
            .on('mouseleave', () => {
                applyStyle(element, currentStyle);
                element.style('cursor', null);
            });

        return element;
    }
    
    addDraggableHandles(points, drawingIndex, drawing) {
        points.forEach((point, i) => {
            // Create handle
            const handle = this.svg.append('circle')
                .attr('cx', point.x)
                .attr('cy', point.y)
                .attr('r', 6)
                .attr('fill', '#2196F3')
                .attr('stroke', 'white')
                .attr('stroke-width', 2)
                .attr('opacity', 0.9)
                .style('cursor', 'move')
                .on('mouseenter', function() {
                    d3.select(this)
                        .attr('r', 7)
                        .attr('fill', '#1976D2');
                })
                .on('mouseleave', function() {
                    d3.select(this)
                        .attr('r', 6)
                        .attr('fill', '#2196F3');
                })
                .call(d3.drag()
                    .on('drag', (event) => {
                        const newX = event.x;
                        const newY = event.y;
                        
                        // Update handle position
                        handle.attr('cx', newX).attr('cy', newY);
                        
                        // Convert pixel coordinates back to data coordinates
                        const dataIdx = this.pixelToDataIndex(newX);
                        const price = this.yScale.invert(newY);
                        
                        // Create a copy of the drawing with updated coordinates
                        const updatedDrawing = {...drawing};
                        
                        // Update drawing data
                        if (point.type === 'start') {
                            if (drawing.type === 'trendline' || drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                                updatedDrawing.x1 = dataIdx;
                                updatedDrawing.y1 = price;
                            } else if (drawing.type === 'horizontal') {
                                updatedDrawing.price = price;
                            } else if (drawing.type === 'vertical') {
                                updatedDrawing.x = dataIdx;
                            }
                        } else if (point.type === 'end') {
                            if (drawing.type === 'trendline' || drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                                updatedDrawing.x2 = dataIdx;
                                updatedDrawing.y2 = price;
                            }
                        }
                        
                        // Save the changes and redraw
                        this.saveDrawingChanges(updatedDrawing);
                        this.redrawDrawings();
                    }));
        });
    }

    quickColorPicker(drawing) {
        this.hideContextMenu();
        const input = document.createElement('input');
        input.type = 'color';
        input.value = drawing.color || '#2962ff';
        input.onchange = (e) => {
            drawing.color = e.target.value;
            // Update fillColor for rectangles and fibonacci with matching color but lower opacity
            if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                const color = d3.color(e.target.value);
                drawing.fillColor = color.copy({opacity: drawing.fillOpacity || 0.1});
            }
            // Save the changes to the drawings array
            const index = this.drawings.findIndex(d => d === drawing);
            if (index !== -1) {
                this.drawings[index] = {...drawing};
            }
            this.scheduleRender();
        };
        input.click();
    }
    
    quickLineWidth(drawing) {
        this.hideContextMenu();
        const width = prompt('Enter line width (1-10):', drawing.lineWidth || 2);
        if (width && !isNaN(width)) {
            drawing.lineWidth = Math.max(1, Math.min(10, parseInt(width)));
            // Save the changes to the drawings array
            const index = this.drawings.findIndex(d => d === drawing);
            if (index !== -1) {
                this.drawings[index] = {...drawing};
            }
            this.scheduleRender();
        }
    }
    
    quickOpacity(drawing) {
        this.hideContextMenu();
        const opacity = prompt('Enter opacity (0-100):', (drawing.opacity || 0.5) * 100);
        if (opacity && !isNaN(opacity)) {
            if (drawing.type === 'rectangle' || drawing.type === 'fibonacci') {
                drawing.fillOpacity = Math.max(0, Math.min(100, parseInt(opacity))) / 100;
            } else {
                drawing.opacity = Math.max(0, Math.min(100, parseInt(opacity))) / 100;
            }
            // Save the changes to the drawings array
            const index = this.drawings.findIndex(d => d === drawing);
            if (index !== -1) {
                this.drawings[index] = {...drawing};
            }
            this.scheduleRender();
        }
    }
    
    // Helper method to save drawing changes
    saveDrawingChanges(drawing) {
        // Try to find by reference first (most reliable)
        let index = this.drawings.findIndex(d => d === drawing);
        
        // If not found by reference, the drawing object might be a copy
        // In this case, just save the entire array since the drawing is already in it
        if (index === -1) {
            console.warn('Drawing not found by reference, saving entire array');
        } else {
            // Drawing was found - it's already updated in the array
            console.log('💾 Saving drawing:', {
                index,
                type: this.drawings[index].type,
                color: this.drawings[index].color,
                fillColor: this.drawings[index].fillColor,
                lineWidth: this.drawings[index].lineWidth
            });
        }
        
        // Save all drawings to localStorage
        try {
            const drawingsData = JSON.stringify(this.drawings);
            localStorage.setItem(`chart_drawings_${this.currentFileId || 'default'}`, drawingsData);
            console.log('💾 Drawings saved to localStorage:', this.drawings.length, 'drawings');
        } catch (e) {
            console.error('Failed to save drawings to localStorage:', e);
        }
        
        this.scheduleRender();
    }
    
    flipDrawing(drawing, direction) {
        this.hideContextMenu();
        if (direction === 'horizontal' && (drawing.type === 'trendline' || drawing.type === 'rectangle' || drawing.type === 'fibonacci')) {
            // Swap x coordinates
            const temp = drawing.x1;
            drawing.x1 = drawing.x2;
            drawing.x2 = temp;
        } else if (direction === 'vertical' && (drawing.type === 'trendline' || drawing.type === 'rectangle' || drawing.type === 'fibonacci')) {
            // Swap y coordinates
            const temp = drawing.y1;
            drawing.y1 = drawing.y2;
            drawing.y2 = temp;
        }
        this.scheduleRender();
    }
    
    toggleLock(drawing) {
        this.hideContextMenu();
        drawing.locked = !drawing.locked;
        this.scheduleRender();
    }
    
    extendDrawing(drawing, direction) {
        if (direction === 'left' || direction === 'both') {
            if (drawing.type === 'trendline') {
                const slope = (drawing.y2 - drawing.y1) / (drawing.x2 - drawing.x1);
                drawing.x1 -= 10;
                drawing.y1 = drawing.y2 - (slope * (drawing.x2 - drawing.x1));
            } else if (drawing.type === 'rectangle') {
                drawing.x1 -= 10;
            }
        }
        if (direction === 'right' || direction === 'both') {
            if (drawing.type === 'trendline') {
                const slope = (drawing.y2 - drawing.y1) / (drawing.x2 - drawing.x1);
                drawing.x2 += 10;
                drawing.y2 = drawing.y1 + (slope * (drawing.x2 - drawing.x1));
            } else if (drawing.type === 'rectangle') {
                drawing.x2 += 10;
            }
        }
        this.hideContextMenu();
        this.scheduleRender();
    }
    
    /**
     * Broadcast crosshair position to all other panels and main chart
     */
    broadcastCrosshairSync(timestamp, price = null) {
        if (!this.syncCrosshair) return;
        if (!window.panelManager) return;
        
        // If single panel layout, no need to broadcast
        if (window.panelManager.currentLayout === '1') return;
        
        // Check if there are any panels to sync to
        if (!window.panelManager.panels || window.panelManager.panels.length <= 1) return;
        
        // Check if crosshair sync is enabled in panel manager settings
        if (!window.panelManager.syncSettings.crosshair) return;
        
        // Find the candle at this timestamp to pass its data
        let candleData = null;
        if (this.data && this.data.length > 0) {
            const dataIdx = this.data.findIndex(c => c.t === timestamp);
            if (dataIdx >= 0) {
                candleData = this.data[dataIdx];
            }
        }
        
        // Get all chart instances (panels + main chart)
        const allCharts = [];
        
        // Add main chart if not the source
        if (window.chart && window.chart !== this) {
            allCharts.push(window.chart);
        }
        
        // Add panel chart instances
        window.panelManager.panels.forEach(panel => {
            if (panel.chartInstance && panel.chartInstance !== this) {
                allCharts.push(panel.chartInstance);
            }
        });
        
        // Broadcast to all other charts
        allCharts.forEach(chart => {
            if (chart && chart !== this) {
                chart.receiveCrosshairSync(timestamp, price, candleData);
            }
        });
    }
    
    /**
     * Receive crosshair sync from another panel
     * @param {number} timestamp - Candle timestamp
     * @param {number} price - Price at cursor (optional)
     * @param {object} sourceCandle - Candle data from source chart (for OHLC display)
     */
    receiveCrosshairSync(timestamp, price = null, sourceCandle = null) {
        if (!this.syncCrosshair) return;
        
        const container = this.isPanel ? this.canvas.parentElement : document;
        const vLine = container.querySelector('.crosshair-vertical');
        const hLine = container.querySelector('.crosshair-horizontal');
        const priceLabel = container.querySelector('.price-label');
        const timeLabel = container.querySelector('.time-label');
        
        // If timestamp is null, hide crosshair
        if (timestamp === null) {
            if (vLine) vLine.style.display = 'none';
            if (hLine) hLine.style.display = 'none';
            if (priceLabel) priceLabel.style.display = 'none';
            if (timeLabel) timeLabel.style.display = 'none';
            this.currentCrosshairTimestamp = null;
            return;
        }
        
        // Find the candle closest to this timestamp in this chart's data
        let candle = null;
        let candleIndex = -1;
        
        if (this.data && this.data.length > 0) {
            // Binary search for closest candle (faster for large datasets)
            let left = 0, right = this.data.length - 1;
            candleIndex = 0;
            
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                if (this.data[mid].t === timestamp) {
                    candleIndex = mid;
                    break;
                } else if (this.data[mid].t < timestamp) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
                // Keep track of closest
                if (Math.abs(this.data[mid].t - timestamp) < Math.abs(this.data[candleIndex].t - timestamp)) {
                    candleIndex = mid;
                }
            }
            candle = this.getDisplayCandle(candleIndex);
        }
        
        // If no local candle but we have source candle, use it for OHLC display
        if (!candle && sourceCandle) {
            this.updateOHLCFromCandle(sourceCandle);
            this.currentCrosshairTimestamp = timestamp;
            // Hide crosshair since we can't position it without local data
            if (vLine) vLine.style.display = 'none';
            if (hLine) hLine.style.display = 'none';
            if (priceLabel) priceLabel.style.display = 'none';
            if (timeLabel) timeLabel.style.display = 'none';
            return;
        }
        
        // No data at all - nothing to show
        if (!candle) return;
        const x = this.dataIndexToPixel(candleIndex);
        const m = this.margin;
        
        // Check if x is within visible bounds
        const isXVisible = x >= m.l && x <= this.w - m.r;
        
        // Vertical line styles (dashed like TradingView)
        const vBaseStyle = `
            position: absolute;
            top: ${m.t}px;
            width: 1px;
            height: ${this.h - m.t - m.b}px;
            background: repeating-linear-gradient(to bottom, #787b86 0px, #787b86 4px, transparent 4px, transparent 8px);
            pointer-events: none;
            z-index: 100;
        `;
        
        if (vLine) {
            if (isXVisible) {
                vLine.style.cssText = vBaseStyle + `left:${x}px;height:calc(100% - 30px);display:block;`;
            } else {
                // Hide if out of visible range
                vLine.style.display = 'none';
            }
        }
        
        // Horizontal line styles (dashed like TradingView)
        const hBaseStyle = `
            position: absolute;
            left: ${m.l}px;
            width: ${this.w - m.l - m.r}px;
            height: 1px;
            background: repeating-linear-gradient(to right, #787b86 0px, #787b86 4px, transparent 4px, transparent 8px);
            pointer-events: none;
            z-index: 100;
        `;
        
        if (hLine && this.yScale) {
            const displayPrice = price !== null ? price : (candle.h + candle.l) / 2;
            const y = this.yScale(displayPrice);
            
            if (y >= m.t && y <= this.h - m.b) {
                hLine.style.cssText = hBaseStyle + `top:${y}px;display:block;`;
                
                // Update price label with proper styling
                if (priceLabel) {
                    const formatPrice = (p) => {
                        if (p > 1000) return p.toFixed(2);
                        if (p > 1) return p.toFixed(4);
                        return p.toFixed(5);
                    };
                    priceLabel.textContent = formatPrice(displayPrice);
                    priceLabel.style.cssText = `
                        position: absolute;
                        right: 5px;
                        top: ${y - 10}px;
                        background: #363a45;
                        color: #d1d4dc;
                        padding: 2px 6px;
                        font-size: 11px;
                        border-radius: 2px;
                        z-index: 101;
                        display: block;
                    `;
                }
            } else {
                if (hLine) hLine.style.display = 'none';
                if (priceLabel) priceLabel.style.display = 'none';
            }
        }
        
        // Time label with proper styling
        if (timeLabel && isXVisible) {
            const date = new Date(candle.t);
            const timeStr = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            timeLabel.textContent = timeStr;
            timeLabel.style.cssText = `
                position: absolute;
                left: ${x - 50}px;
                bottom: 38px;
                background: #363a45;
                color: #d1d4dc;
                padding: 2px 6px;
                font-size: 11px;
                border-radius: 2px;
                white-space: nowrap;
                z-index: 101;
                display: block;
            `;
        } else if (timeLabel) {
            timeLabel.style.display = 'none';
        }
        
        this.currentCrosshairTimestamp = timestamp;
        
        // Update OHLC values for this panel based on the synced candle
        this.updateOHLCFromCandle(candle);
    }
    
    /**
     * Update OHLC display values from a candle (used for crosshair sync)
     */
    updateOHLCFromCandle(candle) {
        if (!candle) return;
        
        // Format prices based on value
        const formatPrice = (price) => {
            if (price > 1000) return price.toFixed(2);
            if (price > 1) return price.toFixed(4);
            return price.toFixed(5);
        };
        
        // Main chart (panel 0 when in multi-layout, or window.chart) uses no suffix
        // Other panels use their index as suffix
        const isMainChart = this === window.chart || this.panelIndex === 0;
        const idSuffix = (this.panelIndex !== undefined && this.panelIndex !== 0) ? this.panelIndex : '';
        
        // Update OHLC values
        const openElem = document.getElementById('open' + idSuffix);
        const highElem = document.getElementById('high' + idSuffix);
        const lowElem = document.getElementById('low' + idSuffix);
        const closeElem = document.getElementById('close' + idSuffix);

        // Enforce showChartValues flag
        const ohlcStatsEl2 = openElem && openElem.closest('.ohlc-stats');
        if (ohlcStatsEl2) ohlcStatsEl2.style.display = this.chartSettings.showChartValues !== false ? '' : 'none';
        
        const ohlcElems = [openElem, highElem, lowElem, closeElem];
        const priceMap = [candle.o, candle.h, candle.l, candle.c];
        ohlcElems.forEach((elem, idx) => {
            if (!elem) return;
            elem.textContent = formatPrice(priceMap[idx]);
            elem.style.color = this.chartSettings.symbolTextColor || '';
            elem.classList.remove('up', 'down');
            if (candle.c > candle.o) {
                elem.classList.add('up');
            } else if (candle.c < candle.o) {
                elem.classList.add('down');
            }
        });
        
        // Update change
        const change = candle.c - candle.o;
        const changePercent = (change / candle.o) * 100;
        const chartChangeElem = document.getElementById('chartChange' + idSuffix);
        if (chartChangeElem) {
            chartChangeElem.textContent = `${change >= 0 ? '+' : ''}${formatPrice(Math.abs(change))} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
            chartChangeElem.className = change >= 0 ? 'ohlc-change positive' : 'ohlc-change negative';
            chartChangeElem.style.color = this.chartSettings.symbolTextColor || '';
            // Enforce showBarChangeValues flag
            chartChangeElem.style.display = this.chartSettings.showBarChangeValues !== false ? '' : 'none';
        }
        
        // Update volume - only if volume indicator is active
        // Main chart uses "volume", panels use "volumeValue{index}"
        const volumeElem = document.getElementById(isMainChart ? 'volume' : 'volumeValue' + idSuffix);
        if (volumeElem && this.chartSettings.showVolume) {
            const formatVolume = (vol) => {
                if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + 'B';
                if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
                if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
                return vol.toFixed(0);
            };
            volumeElem.textContent = formatVolume(candle.v || 0);
            
            // Get volume indicator colors if available
            let upColor = '#089981';
            let downColor = '#f23645';
            if (this.indicators && this.indicators.active) {
                const volumeInd = this.indicators.active.find(ind => ind.type === 'volume' || ind.isVolume);
                if (volumeInd && volumeInd.style) {
                    // Extract color from rgba if needed
                    upColor = volumeInd.style.upColor || upColor;
                    downColor = volumeInd.style.downColor || downColor;
                }
            }
            
            // Color volume based on candle direction
            if (candle.c >= candle.o) {
                volumeElem.style.color = upColor.includes('rgba') ? '#089981' : upColor;
            } else {
                volumeElem.style.color = downColor.includes('rgba') ? '#f23645' : downColor;
            }
        }
    }
    
    /**
     * Broadcast drawing change to all other panels
     */
    broadcastDrawingChange(action, drawing, drawingIndex = null) {
        console.log(`✏️ Broadcast attempt: ${action}, isPanel=${this.isPanel}, syncEnabled=${window.panelManager?.syncSettings?.drawings}`);
        
        if (!window.panelManager || !window.panelManager.panels) {
            console.log('   ❌ No panel manager');
            return;
        }
        
        // Check if drawings sync is enabled in panel manager
        if (!window.panelManager.syncSettings.drawings) {
            console.log('   ❌ Drawings sync disabled');
            return;
        }
        
        // Only sync from panel charts
        if (!this.isPanel) {
            console.log('   ❌ Not a panel chart');
            return;
        }
        
        console.log(`✏️ Broadcasting drawing ${action} to ${window.panelManager.panels.length - 1} other panels`);
        
        // Serialize the drawing for sync
        const drawingData = typeof drawing.toJSON === 'function' ? drawing.toJSON() : drawing;
        
        // Get all panel chart instances
        window.panelManager.panels.forEach(panel => {
            if (panel.chartInstance && panel.chartInstance !== this) {
                console.log(`   → Sending to panel ${panel.index}`);
                panel.chartInstance.receiveDrawingChange(action, drawingData, drawingIndex);
            }
        });
    }
    
    /**
     * Receive and apply drawing change from another panel
     */
    receiveDrawingChange(action, drawing, drawingIndex = null) {
        console.log(`📥 Receive attempt: ${action}, hasDrawingManager=${!!this.drawingManager}`);
        
        if (!this.drawingManager) {
            console.log('   ❌ No drawing manager on this panel');
            return;
        }
        
        // Temporarily disable sync to prevent infinite loop
        const originalSetting = window.panelManager?.syncSettings?.drawings;
        if (window.panelManager?.syncSettings) {
            window.panelManager.syncSettings.drawings = false;
        }
        
        try {
            const dm = this.drawingManager;
            
            if (action === 'add') {
                // Clone the drawing data
                const drawingData = typeof drawing.toJSON === 'function' ? drawing.toJSON() : JSON.parse(JSON.stringify(drawing));
                console.log(`   Processing add: type=${drawingData.type}, id=${drawingData.id}`);
                
                // CRITICAL: Convert timestamp points to indices for THIS panel's data
                if (drawingData.coordinateSystem === 'timestamp' && drawingData.points && this.data && this.data.length > 0) {
                    console.log(`   Converting timestamps to indices for panel (TF: ${this.currentTimeframe}, data: ${this.data.length} candles)`);
                    if (typeof CoordinateUtils !== 'undefined' && CoordinateUtils.pointsFromTimestamps) {
                        // Preserve original timestamp points for storage
                        const originalTimestampPoints = drawingData.points.map(p => ({
                            timestamp: p.timestamp,
                            price: p.price || p.y
                        }));
                        
                        // Debug: Show what we're converting
                        console.log(`   Original timestamp: ${originalTimestampPoints[0]?.timestamp} (${new Date(originalTimestampPoints[0]?.timestamp).toISOString()})`);
                        console.log(`   Data range: ${this.data[0]?.t} - ${this.data[this.data.length-1]?.t}`);
                        
                        // Convert to index-based points for rendering (with correct timeframe)
                        drawingData.points = CoordinateUtils.pointsFromTimestamps(drawingData.points, this.data, this.currentTimeframe);
                        
                        console.log(`   Converted to index: ${drawingData.points[0]?.x}`);
                        
                        // Store original timestamps in a separate field
                        drawingData._originalTimestampPoints = originalTimestampPoints;
                    }
                }
                
                // Use drawing manager to create and add the drawing
                const toolInfo = dm.toolRegistry ? dm.toolRegistry[drawingData.type] : null;
                console.log(`   ToolInfo found: ${!!toolInfo}, hasFromJSON: ${!!(toolInfo?.class?.fromJSON)}`);
                
                if (toolInfo && toolInfo.class && toolInfo.class.fromJSON) {
                    const drawingObj = toolInfo.class.fromJSON(drawingData, this);
                    drawingObj.chart = this;
                    drawingObj.id = drawingData.id; // Keep same ID for sync
                    
                    // Restore timestamp points for proper multi-timeframe support
                    if (drawingData._originalTimestampPoints) {
                        drawingObj.timestampPoints = drawingData._originalTimestampPoints;
                        drawingObj.coordinateSystem = 'timestamp';
                    }
                    
                    // Add to drawings array
                    dm.drawings.push(drawingObj);
                    
                    // Only render if data and scales are ready
                    const tryRender = () => {
                        if (this.data && this.data.length > 0 && this.xScale && this.yScale) {
                            try {
                                dm.renderDrawing(drawingObj);
                                console.log(`   ✅ Rendered on panel`);
                            } catch (err) {
                                console.warn('   ⚠️ Render error:', err.message);
                            }
                            return true;
                        }
                        return false;
                    };
                    
                    if (!tryRender()) {
                        // Defer render - try a few times
                        console.log('   ⏳ Chart not ready, deferring render...');
                        let attempts = 0;
                        const retryRender = setInterval(() => {
                            attempts++;
                            if (tryRender() || attempts > 10) {
                                clearInterval(retryRender);
                            }
                        }, 200);
                    }
                    dm.saveDrawings();
                    
                    console.log(`📥 ✅ Received drawing: ${drawingData.type}`);
                } else {
                    console.log(`   ❌ Could not find tool info for type: ${drawingData.type}`);
                    console.log(`   Available tools:`, dm.toolRegistry ? Object.keys(dm.toolRegistry) : 'none');
                }
            } else if (action === 'remove') {
                // Find and remove drawing by ID
                const drawingId = drawing.id;
                const existingDrawing = dm.drawings.find(d => d.id === drawingId);
                if (existingDrawing) {
                    const index = dm.drawings.indexOf(existingDrawing);
                    dm.drawings.splice(index, 1);
                    existingDrawing.destroy();
                    dm.saveDrawings();
                    console.log(`📥 Removed drawing: ${drawingId}`);
                }
            } else if (action === 'update') {
                // Find and update drawing by ID
                const drawingId = drawing.id;
                const existingDrawing = dm.drawings.find(d => d.id === drawingId);
                if (existingDrawing) {
                    const drawingData = typeof drawing.toJSON === 'function' ? drawing.toJSON() : JSON.parse(JSON.stringify(drawing));
                    
                    // Convert timestamp points to indices for THIS panel's data
                    if (drawingData.coordinateSystem === 'timestamp' && drawingData.points && this.data && this.data.length > 0) {
                        if (typeof CoordinateUtils !== 'undefined' && CoordinateUtils.pointsFromTimestamps) {
                            // Preserve original timestamp points
                            const originalTimestampPoints = drawingData.points.map(p => ({
                                timestamp: p.timestamp,
                                price: p.price || p.y
                            }));
                            
                            // Convert to index-based points for rendering (with correct timeframe)
                            drawingData.points = CoordinateUtils.pointsFromTimestamps(drawingData.points, this.data, this.currentTimeframe);
                            
                            // Update drawing with new points
                            existingDrawing.points = drawingData.points;
                            existingDrawing.timestampPoints = originalTimestampPoints;
                        }
                    } else {
                        existingDrawing.points = drawingData.points;
                    }
                    
                    // Update style if changed
                    if (drawingData.style) {
                        Object.assign(existingDrawing.style, drawingData.style);
                    }
                    
                    dm.renderDrawing(existingDrawing);
                    dm.saveDrawings();
                    console.log(`📥 Updated drawing: ${drawingId}`);
                }
            } else if (action === 'clear') {
                // Clear all drawings
                dm.drawings.forEach(d => d.destroy());
                dm.drawings = [];
                dm.saveDrawings();
                console.log('📥 Cleared all drawings');
            }
            
        } finally {
            // Re-enable sync
            if (window.panelManager?.syncSettings) {
                window.panelManager.syncSettings.drawings = originalSetting;
            }
        }
    }
}

// Initialize chart when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing Trading Chart...');

    try {
        if (window.waitForD3 instanceof Promise) {
            await window.waitForD3;
        } else if (typeof window.d3 === 'undefined') {
            throw new Error('D3 library is not available on window');
        }
    } catch (error) {
        console.error('❌ Unable to initialize chart because D3 failed to load:', error);
        return;
    }

    // Expose Chart class globally for indicator modules
    window.Chart = Chart;
    
    const chartInstance = new Chart();
    window.chart = chartInstance;
    window.mainChart = chartInstance;
    console.log('✅ Chart initialized successfully');
    
    // Initialize timeframe favorites
    if (typeof TimeframeFavorites !== 'undefined') {
        window.timeframeFavorites = new TimeframeFavorites(chartInstance);
        console.log('✅ Timeframe favorites initialized');
    }
    
    // Setup axis cursor zones to forward events to canvas
    const priceAxisZone = document.getElementById('priceAxisZone');
    const timeAxisZone = document.getElementById('timeAxisZone');
    const chartCanvas = document.getElementById('chartCanvas');
    
    const forwardEvent = (e, zone) => {
        // Set cursor mode for chart
        if (zone === 'price') {
            chartInstance.cursor.mode = 'priceAxis';
        } else if (zone === 'time') {
            chartInstance.cursor.mode = 'timeAxis';
        }
        
        // Forward the event to canvas
        const newEvent = new MouseEvent(e.type, {
            bubbles: true,
            cancelable: true,
            clientX: e.clientX,
            clientY: e.clientY,
            button: e.button,
            buttons: e.buttons,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey
        });
        chartCanvas.dispatchEvent(newEvent);
    };
    
    if (priceAxisZone) {
        ['mousedown', 'mouseup', 'mousemove', 'wheel', 'dblclick'].forEach(type => {
            priceAxisZone.addEventListener(type, (e) => forwardEvent(e, 'price'));
        });
    }
    
    if (timeAxisZone) {
        ['mousedown', 'mouseup', 'mousemove', 'wheel', 'dblclick'].forEach(type => {
            timeAxisZone.addEventListener(type, (e) => forwardEvent(e, 'time'));
        });
    }
    
    console.log('✅ Axis cursor zones initialized');
    
    // Listen for panel creation events to ensure all tools work in multi-panel mode
    window.addEventListener('panelsCreated', (event) => {
        console.log('📊 Panels created, ensuring all tools are available:', event.detail);
        
        // The drawing manager is shared across all panels
        // All new tools (emoji, gann-box, anchored-vwap, volume-profile) are already registered
        // in the tool registry and will work automatically in any panel
        
        // Ensure emoji picker works with all panels
        const simplePicker = window.simplePicker;
        if (simplePicker && chartInstance.drawingManager) {
            console.log('✅ Emoji picker and advanced tools available for all panels');
        }
    });
});
