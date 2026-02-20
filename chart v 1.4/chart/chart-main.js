/**
 * Main Chart Class - Core structure and initialization
 * This file contains the Chart class constructor and core properties
 * 
 * Additional functionality is loaded from:
 * - chart-settings.js (Settings modal)
 * - chart-data.js (Data loading)
 * - chart-render.js (Rendering)
 * - chart-interactions.js (Mouse/touch events)
 * - chart-ui.js (Menus, notifications)
 * - chart-tools.js (Drawing tools)
 */

class Chart {
    constructor() {
        console.log('🚀 Initializing Chart...');
        
        this.canvas = document.getElementById('chartCanvas');
        if (!this.canvas) {
            console.error('❌ Canvas element #chartCanvas not found!');
            throw new Error('Canvas element not found. Make sure the HTML is loaded.');
        }
        this.ctx = this.canvas.getContext('2d');
        this.svg = d3.select('#drawingSvg');
        if (this.svg.empty()) {
            console.error('❌ SVG element #drawingSvg not found!');
            throw new Error('SVG element not found. Make sure the HTML is loaded.');
        }
        
        // Ensure SVG is properly positioned
        this.svg
            .style('position', 'absolute')
            .style('top', '0')
            .style('left', '0')
            .style('z-index', '2')
            .style('pointer-events', 'none');
        
        // Create context menu
        this.contextMenu = d3.select('body')
            .append('div')
            .attr('class', 'chart-context-menu')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', 'rgba(19, 23, 34, 0.95)')
            .style('border', '1px solid #2a2e39')
            .style('border-radius', '4px')
            .style('padding', '8px 0')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '1000')
            .style('min-width', '160px');
        
        // Data properties
        this.rawData = [];
        this.data = [];
        this.candleWidth = 8;
        this.offsetX = 0;
        this.priceZoom = 1;
        this.priceOffset = 0;
        this.timeZoom = 1;
        this.autoScale = true;
        this.tool = null;
        this.drawings = [];
        this.xScale = null;
        this.yScale = null;
        this.volumeScale = null;
        this.xBandScale = null;
        this.margin = {t: 5, r: 70, b: 30, l: 0};
        this.volumeHeight = 0.15;
        this.selectedDrawing = null;
        this.isLoading = false;
        this.hoveredCandle = null;
        this.tooltipDiv = null;
        this.hoveredPrice = null;
        this.priceHoverThrottle = null;
        this.isZooming = false;
        this.magnetMode = false;
        this.currentTimeframe = '1m';

        // Enhanced movement settings
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
        this.currentFileId = null;
        
        // Performance optimizations for large datasets
        this.totalCandles = 0;
        this.loadedRanges = new Map();
        this.chunkSize = 5000;
        this.bufferSize = 1000;
        this.isLoadingChunk = false;
        this.renderPending = false;
        
        // Chart settings with defaults
        this.chartSettings = {
            backgroundColor: '#1e222d',
            gridColor: '#2a2e39',
            textColor: '#787b86',
            candleUpColor: '#089981',
            candleDownColor: '#f23645',
            showGrid: true,
            showVolume: false, // Volume is now controlled as an indicator
            showCrosshair: true,
            crosshairLocked: false,
            showMarks: false
        };
        
        console.log('✅ Chart initialized with modular architecture');
        
        // Initialize all modules
        this.init();
    }
    
    init() {
        // This will be called after all modules are loaded
        console.log('📦 Loading chart modules...');
        
        // Core initialization
        this.resize();
        this.createTooltip();
        
        // Initialize modules (methods added by separate files)
        if (typeof this.initSettings === 'function') {
            this.initSettings();
        }
        if (typeof this.initData === 'function') {
            this.initData();
        }
        if (typeof this.initInteractions === 'function') {
            this.initInteractions();
        }
        if (typeof this.initUI === 'function') {
            this.initUI();
        }
        if (typeof this.initDrawingTools === 'function') {
            this.initDrawingTools();
        }
        
        // Start rendering
        this.scheduleRender();
        window.addEventListener('resize', () => this.resize());
        
        console.log('✅ All modules loaded successfully');
    }
    
    resize() {
        const container = this.canvas.parentElement;
        void container.offsetHeight;
        
        const rect = container.getBoundingClientRect();
        const newW = Math.floor(rect.width);
        const newH = Math.floor(rect.height);
        
        if (newW !== this.w || newH !== this.h) {
            this.w = newW;
            this.h = newH;
            
            this.canvas.width = this.w;
            this.canvas.height = this.h;
            this.canvas.style.width = this.w + 'px';
            this.canvas.style.height = this.h + 'px';
            
            this.svg.attr('width', this.w).attr('height', this.h);
            this.svg.style('width', this.w + 'px').style('height', this.h + 'px');
            
            this.scheduleRender();
        }
    }
    
    createTooltip() {
        this.tooltipDiv = d3.select('body').append('div')
            .attr('class', 'chart-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', 'rgba(19, 23, 34, 0.95)')
            .style('color', '#d1d5db')
            .style('padding', '12px')
            .style('border-radius', '6px')
            .style('font-size', '13px')
            .style('pointer-events', 'none')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '1000')
            .style('border', '1px solid #2a2e39');
    }
    
    scheduleRender() {
        if (!this.renderPending) {
            this.renderPending = true;
            requestAnimationFrame(() => {
                if (typeof this.render === 'function') {
                    this.render();
                }
                this.renderPending = false;
            });
        }
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.Chart = Chart;
}

console.log('📄 chart-main.js loaded');
