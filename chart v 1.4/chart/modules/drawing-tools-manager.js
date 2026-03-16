/**
 * Drawing Tools Manager
 * Main coordinator for all drawing tools
 * Handles drawing lifecycle, event management, and persistence
 * 
 * @version 1.5.5
 * @updated 2026-01-14
 * @changelog
 *   - Fixed: Text dropdown live preview not working when typing
 *   - Fixed: Font size changes in text dropdown now update drawing in real-time
 *   - Changed text input handler to use queryAll for proper external dropdown support
 *   - Added findLinesAtPoint() for detecting lines (strokes only, not fills)
 *   - Added findStackedLines() to detect when >3 lines are stacked at a point
 *   - Added getStackedLinesAt(), getLinesAt(), getLastStackedLines() public API
 *   - Shift+Click on stacked lines selects all drawings
 *   - Fixed: Now detects ALL lines within same shape (Fib levels, channels, etc.)
 *   - Added lineIndex and Y-position sorting for stacked lines
 *   - STROKE-ONLY selection: Only click on lines/borders to select, fills are ignored
 *   - Fixed: Disabled pointer-events on all fill elements after rendering
 */

class DrawingToolsManager {
    constructor(chartInstance) {
        this.chart = chartInstance;
        this.svg = chartInstance.svg;
        this.drawings = [];
        this.selectedDrawing = null;
        this.selectedDrawings = []; // Multi-selection support
        this.currentTool = null;
        this.isDrawing = false;
        this.tempPoints = [];
        this.drawingState = new DrawingState();
        this.magnetMode = 'off'; // 'off', 'weak', 'strong'
        this.magnetKeyHeld = false; // Command/Ctrl key held for temporary magnet
        this.keepDrawingMode = false; // New: Keep drawing mode toggle
        this.eraserMode = false; // Eraser mode - click to delete drawings
        this.ctrlSelectMode = false; // Ctrl key held for hover-to-select mode
        this.riskRewardPreview = null;
        this.isDraggingFirstTwo = false;
        this.dragFirstTwoStart = null;
        this.dragFirstTwoStartScreen = null;
        
        // Rectangular selection
        this.isRectSelecting = false;
        this.rectSelectStart = null;
        this.rectSelectRect = null;
        
        // UI components
        this.settingsPanel = new DrawingSettingsPanel();
        this.textEditor = new InlineTextEditor();
        this.contextMenu = new DrawingContextMenu();
        this.toolbar = new DrawingToolbar();
        window.drawingToolbar = this.toolbar; // Expose for global openColorPicker function
        
        // Link toolbar to settings panel for restoration
        this.settingsPanel.toolbarManager = this.toolbar;
        this.pendingEmojiOptions = null;
        this.currentEmojiOptions = null;

        this._directResizeMoveHandler = null;
        this._directResizeUpHandler = null;
        this._directMoveMoveHandler = null;
        this._directMoveUpHandler = null;
        this._handleClickTimes = {};
        this._handleMouseDownCaptureHandler = null;
        this._setupHandleMouseDownCapture();
        
        // Undo/Redo manager
        this.history = null; // Will be initialized after manager is ready

        const instanceId = chartInstance.__drawingToolsManagerId || (chartInstance.__drawingToolsManagerId = ((window.__drawingToolsManagerCounter = (window.__drawingToolsManagerCounter || 0) + 1)));
        this._instanceKey = `drawingTools_${instanceId}`;

        this._rafRenderQueued = false;
        this._rafRenderSet = new Set();

        this._hoverHandleBoundDrawingId = null;
        this._hoverHandleBoundGroupNode = null;
        
        // Style persistence - remember last used style per tool type
        this.savedToolStyles = this.loadSavedToolStyles();

        // SVG layers
        this.drawingsGroup = null;
        this.tempGroup = null;
        
        // Tools that support angle snapping with Shift key
        this.angleSnapTools = ['trendline', 'ray', 'arrow', 'ruler', 'fibonacci-retracement', 'fibonacci-extension', 'polyline'];

        // Tool registry
        this.toolRegistry = {
            // Lines
            'trendline': { class: TrendlineTool, points: 2 },
            'horizontal': { class: HorizontalLineTool, points: 1 },
            'vertical': { class: VerticalLineTool, points: 1 },
            'ray': { class: RayTool, points: 2 },
            'horizontal-ray': { class: HorizontalRayTool, points: 1 },
            'extended-line': { class: ExtendedLineTool, points: 2 },
            'cross-line': { class: CrossLineTool, points: 1 },
            
            // Shapes
            'rectangle': { class: RectangleTool, points: 2 },
            'rotated-rectangle': { class: RotatedRectangleTool, points: 3 },
            'ellipse': { class: EllipseTool, points: 2 },
            'circle': { class: CircleTool, points: 2 },
            'triangle': { class: TriangleTool, points: 3 },
            'arc': { class: ArcTool, points: 2 },
            'curve': { class: CurveTool, points: 2 },
            'double-curve': { class: DoubleCurveTool, points: 2 },
            
            // Arrows
            'arrow': { class: ArrowTool, points: 2 },
            'arrow-marker': { class: ArrowMarkerTool, points: 2 },
            'arrow-mark-up': { class: ArrowMarkUpTool, points: 1 },
            'arrow-mark-down': { class: ArrowMarkDownTool, points: 1 },
            
            // Labels & Text
            'label': { class: LabelTool, points: 1 },
            'text': { class: TextTool, points: 1 },
            'notebox': { class: NoteBoxTool, points: 1 },
            'anchored-text': { class: AnchoredTextTool, points: 1 },
            'note': { class: NoteTool, points: 2 },
            'price-note': { class: PriceNoteTool, points: 2 },
            'pin': { class: PinTool, points: 1 },
            'callout': { class: CalloutTool, points: 2 },
            'comment': { class: CommentTool, points: 1 },
            'price-label': { class: PriceLabelTool, points: 1 },
            'price-label-2': { class: PriceLabel2Tool, points: 1 },
            'signpost-2': { class: Signpost2Tool, points: 1 },
            'flag-mark': { class: FlagMarkTool, points: 1 },
            
            // Freeform / Brushes
            'polyline': { class: PolylineTool, points: -2 }, // Point-by-point mode
            'path': { class: PathTool, points: -2 }, // Point-by-point mode (no fill)
            'brush': { class: BrushTool, points: -1 }, // Continuous drawing mode
            'highlighter': { class: HighlighterTool, points: -1 }, // Continuous drawing mode
            
            // Analysis
            'fibonacci-retracement': { class: FibonacciRetracementTool, points: 2 },
            'fibonacci-extension': { class: FibonacciExtensionTool, points: 2 },
            'ruler': { class: RulerTool, points: 2 },
            'date-price-range': { class: DatePriceRangeTool, points: 2 },
            'gann-box': { class: GannBoxTool, points: 2 },
            'anchored-vwap': { class: AnchoredVWAPTool, points: 1 },
            'volume-profile': { class: VolumeProfileTool, points: 2, dragFirstTwo: true },
            'fixed-range-volume-profile': { class: VolumeProfileTool, points: 2, dragFirstTwo: true },
            'anchored-volume-profile': { class: AnchoredVolumeProfileTool, points: 1 },
            
            // Positions
            'long-position': { class: LongPositionTool, points: 1, dragPreview: true },
            'short-position': { class: ShortPositionTool, points: 1, dragPreview: true },
            
            // Other
            'emoji': { class: EmojiStickerTool, points: 1 },
            'image': { class: ImageTool, points: 1 }
        };
        
        // Add pattern tools after base registry (only if classes loaded)
        if (typeof XABCDPatternTool !== 'undefined') {
            this.toolRegistry['bars-pattern'] = { class: BarsPatternTool, points: 2, dragFirstTwo: true };
            this.toolRegistry['xabcd-pattern'] = { class: XABCDPatternTool, points: 5 };
            this.toolRegistry['cypher-pattern'] = { class: CypherPatternTool, points: 5 };
            this.toolRegistry['head-shoulders'] = { class: HeadShouldersTool, points: 7 };
            this.toolRegistry['abcd-pattern'] = { class: ABCDPatternTool, points: 4 };
            this.toolRegistry['triangle-pattern'] = { class: TrianglePatternTool, points: 4 };
            this.toolRegistry['three-drives'] = { class: ThreeDrivesTool, points: 7 };
            this.toolRegistry['elliott-impulse'] = { class: ElliottImpulseTool, points: 6 };
            this.toolRegistry['elliott-correction'] = { class: ElliottCorrectionTool, points: 4 };
            this.toolRegistry['elliott-triangle'] = { class: ElliottTriangleTool, points: 6 };
            this.toolRegistry['elliott-double-combo'] = { class: ElliottDoubleComboTool, points: 4 };
            this.toolRegistry['elliott-triple-combo'] = { class: ElliottTripleComboTool, points: 6 };
            this.toolRegistry['cyclic-lines'] = { class: CyclicLinesTool, points: 2 };
            this.toolRegistry['time-cycles'] = { class: TimeCyclesTool, points: 3 };
            this.toolRegistry['sine-line'] = { class: SineLineTool, points: 2 };
        }
        
        // Add Fibonacci & Gann tools (only if classes loaded)
        if (typeof FibChannelTool !== 'undefined') {
            this.toolRegistry['fib-channel'] = { class: FibChannelTool, points: 3 };
            this.toolRegistry['fib-timezone'] = { class: FibTimeZoneTool, points: 2 };
            this.toolRegistry['fib-speed-fan'] = { class: FibSpeedFanTool, points: 2 };
            this.toolRegistry['trend-fib-time'] = { class: TrendFibTimeTool, points: 3 };
            this.toolRegistry['fib-circles'] = { class: FibCirclesTool, points: 2 };
            this.toolRegistry['fib-spiral'] = { class: FibSpiralTool, points: 2 };
            this.toolRegistry['fib-arcs'] = { class: FibArcsTool, points: 2 };
            this.toolRegistry['fib-wedge'] = { class: FibWedgeTool, points: 3 };
            this.toolRegistry['pitchfork'] = { class: PitchforkTool, points: 3 };
            this.toolRegistry['pitchfan'] = { class: PitchfanTool, points: 3 };
            this.toolRegistry['trend-fib-extension'] = { class: TrendFibExtensionTool, points: 3 };
            this.toolRegistry['gann-square-fixed'] = { class: GannSquareFixedTool, points: 2 };
            this.toolRegistry['gann-square'] = { class: GannSquareTool, points: 2 };
            this.toolRegistry['gann-fan'] = { class: GannFanTool, points: 2 };
        }
        
        // Add channel tools (only if classes loaded)
        if (typeof ParallelChannelTool !== 'undefined') {
            this.toolRegistry['parallel-channel'] = { class: ParallelChannelTool, points: 3 };
            this.toolRegistry['regression-trend'] = { class: RegressionTrendTool, points: 2 };
            this.toolRegistry['flat-top-bottom'] = { class: FlatTopBottomTool, points: 3 };
            this.toolRegistry['disjoint-channel'] = { class: DisjointChannelTool, points: 3 };
        }
        
        this.init();
    }

    _setupHandleMouseDownCapture() {
        if (this._handleMouseDownCaptureHandler) return;

        this._handleMouseDownCaptureHandler = (event) => {
            try {
                if (!event || !event.target) return;
                if (event.button !== 0) return;
                if (!this.svg || !this.svg.node) return;
                const svgNode = this.svg.node();
                if (!svgNode || (svgNode.contains && !svgNode.contains(event.target))) return;

                const targetEl = event.target;
                const handleEl = targetEl && targetEl.closest
                    ? targetEl.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle')
                    : null;
                if (!handleEl) return;

                const drawingGroup = handleEl.closest ? handleEl.closest('.drawing') : null;
                const drawingId = drawingGroup ? drawingGroup.getAttribute('data-id') : null;
                if (!drawingId) return;

                const drawing = (this.drawings || []).find(d => d && d.id === drawingId);
                if (!drawing || drawing.locked) return;

                const HANDLE_DBLCLICK_DELAY = 400;
                const now = Date.now();
                const role = handleEl.getAttribute && (handleEl.getAttribute('data-handle-role') || handleEl.getAttribute('data-point-index'));
                const key = `${drawingId}::${handleEl.classList && handleEl.classList.contains('custom-handle') ? 'custom' : 'handle'}::${role || 'unknown'}`;
                const last = (this._handleClickTimes && this._handleClickTimes[key]) ? this._handleClickTimes[key] : 0;
                const delta = now - last;

                if (delta < HANDLE_DBLCLICK_DELAY && delta > 50) {
                    if (this._handleClickTimes) this._handleClickTimes[key] = 0;

                    event.preventDefault();
                    event.stopPropagation();

                    if (this._directResizeMoveHandler) {
                        document.removeEventListener('mousemove', this._directResizeMoveHandler, true);
                    }
                    if (this._directResizeUpHandler) {
                        document.removeEventListener('mouseup', this._directResizeUpHandler, true);
                    }
                    this._directResizeMoveHandler = null;
                    this._directResizeUpHandler = null;

                    if (!drawing.selected || (this.selectedDrawings.length !== 1 || this.selectedDrawings[0] !== drawing)) {
                        this.deselectAll();
                        drawing.select();
                        this.selectedDrawing = drawing;
                        this.selectedDrawings = [drawing];
                    }

                    this.editDrawing(drawing, event.clientX, event.clientY);
                    return;
                }

                if (this._handleClickTimes) {
                    this._handleClickTimes[key] = now;
                }
            } catch (err) {
                console.error('Failed handle mousedown dblclick detection:', err);
            }
        };

        document.addEventListener('mousedown', this._handleMouseDownCaptureHandler, true);
    }

    scheduleRenderDrawing(drawing) {
        if (!drawing) return;
        if (!this._rafRenderSet) this._rafRenderSet = new Set();
        this._rafRenderSet.add(drawing);
        if (this._rafRenderQueued) return;
        this._rafRenderQueued = true;
        requestAnimationFrame(() => {
            this._rafRenderQueued = false;
            const drawingsToRender = Array.from(this._rafRenderSet || []);
            if (this._rafRenderSet) this._rafRenderSet.clear();
            drawingsToRender.forEach(d => {
                try {
                    const stillTracked = this.drawings.find(item => item === d || (item && d && item.id === d.id));
                    if (!stillTracked) {
                        if (d && d.group) {
                            d.group.remove();
                            d.group = null;
                        }
                        return;
                    }
                    this.renderDrawing(stillTracked);
                } catch (e) {
                }
            });
        });
    }

    _parseTimeframe(timeframe) {
        if (typeof timeframe !== 'string') return null;
        const tf = timeframe.trim();
        const m = tf.match(/^(\d+)\s*([a-zA-Z]+)$/);
        if (!m) return null;

        const value = parseInt(m[1], 10);
        if (!Number.isFinite(value)) return null;

        const unitRaw = m[2];
        const unitLower = unitRaw.toLowerCase();

        // Common variants
        if (unitLower === 'mo' || unitLower === 'mon' || unitLower === 'month' || unitLower === 'months') {
            return { value, unit: 'M' };
        }

        // Single-letter canonical units we use for ranges: s/m/h/d/w/M
        const unitChar = unitRaw.length === 1 ? unitRaw : unitRaw[0];
        if (unitChar === 'M') return { value, unit: 'M' };

        const u = unitChar.toLowerCase();
        if (u === 's' || u === 'm' || u === 'h' || u === 'd' || u === 'w') {
            return { value, unit: u };
        }

        return null;
    }

    _isVisibleForCurrentTimeframe(drawing) {
        if (!drawing || !drawing.visibility || !this.chart || !this.chart.currentTimeframe) return true;
        const currentTf = this.chart.currentTimeframe;

        // Legacy explicit false overrides always win
        if (drawing.visibility[currentTf] === false) return false;

        const ranges = drawing.visibility._ranges;
        if (!ranges) return true;

        const parsed = this._parseTimeframe(currentTf);
        if (!parsed) return true;

        const r = ranges[parsed.unit];
        if (!r) return true;
        if (r.enabled === false) return false;

        const minV = Number.isFinite(+r.min) ? +r.min : null;
        const maxV = Number.isFinite(+r.max) ? +r.max : null;
        if (minV === null || maxV === null) return true;

        return parsed.value >= minV && parsed.value <= maxV;
    }

    _isPositionDrawing(drawing) {
        if (!drawing) return false;
        const rawType = drawing.type || drawing.toolType || drawing.meta?.toolType || '';
        const compact = String(rawType).toLowerCase().replace(/[^a-z]/g, '');
        return compact === 'longposition' || compact === 'shortposition';
    }

    _isHiddenByGlobalVisibility(drawing) {
        if (!drawing || !this.chart) return false;

        // Global drawings toggle should hide every drawing type, including
        // long/short position tools.
        if (this.chart.drawingsHidden) {
            return true;
        }

        if (this._isPositionDrawing(drawing)) {
            return !!this.chart.positionsHidden;
        }
        return false;
    }

    /**
     * Returns the top-most visible volume-profile drawing whose values label contains the point.
     */
    findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY, options = {}) {
        const includeLocked = !!(options && options.includeLocked);

        for (let i = this.drawings.length - 1; i >= 0; i--) {
            const drawing = this.drawings[i];
            if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) continue;
            if (drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) continue;
            if (!includeLocked && drawing.locked) continue;

            if (this.isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY)) {
                return drawing;
            }
        }

        return null;
    }

    /**
     * Initialize the drawing manager
     */
    init() {
        // Create SVG layers if they don't exist
        this.createSVGLayers();
        
        // Ensure SVG pointer-events is 'none' on init to allow canvas interactions
        // This prevents the SVG from blocking clicks after page refresh
        this.svg.style('pointer-events', 'none');
        this.svg.style('cursor', 'default');
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Setup toolbar callbacks
        this.setupToolbarCallbacks();
        
        // Load saved drawings (may fail silently if chart data isn't ready yet)
        this._drawingsLoaded = false;
        this.loadDrawings();
        
        // Listen for timeframe changes AND initial data load to refresh drawings
        let lastTimeframe = this.chart.currentTimeframe;
        window.__drawingToolsChartDataLoadedListeners = window.__drawingToolsChartDataLoadedListeners || {};
        const prevListener = window.__drawingToolsChartDataLoadedListeners[this._instanceKey];
        if (prevListener) {
            window.removeEventListener('chartDataLoaded', prevListener);
        }
        this._chartDataLoadedListener = (event) => {
            const newTimeframe = event.detail?.timeframe;

            // If drawings were not loaded yet (chart had no data during init), load them now
            if (!this._drawingsLoaded) {
                // [debug removed]
                requestAnimationFrame(() => this.loadDrawings());
                return;
            }

            if (newTimeframe && newTimeframe !== lastTimeframe) {
                // [debug removed]
                lastTimeframe = newTimeframe;
                
                // Refresh drawings after a small delay to ensure data is resampled
                requestAnimationFrame(() => {
                    if (this.drawings.length > 0) {
                        // [debug removed]
                        this.refreshDrawingsForTimeframe();
                        this.saveDrawings();
                    }
                });
            }
        };
        window.__drawingToolsChartDataLoadedListeners[this._instanceKey] = this._chartDataLoadedListener;
        window.addEventListener('chartDataLoaded', this._chartDataLoadedListener);
        
        // Initialize undo/redo manager
        if (typeof UndoRedoManager !== 'undefined') {
            this.history = new UndoRedoManager(this);
        } else {
            console.warn('⚠️ UndoRedoManager not found');
        }
        
        // [debug removed]
    }
    
    /**
     * Setup toolbar callbacks
     */
    setupToolbarCallbacks() {
        const self = this;
        
        // Style-change undo tracking: capture before state once per editing session
        let _styleBeforeState = null;
        let _styleBeforeId = null;
        let _styleTimer = null;

        const captureStyleBefore = (drawing) => {
            if (self.history && drawing && drawing.id !== _styleBeforeId) {
                _styleBeforeId = drawing.id;
                _styleBeforeState = self.history.captureState(drawing);
            }
        };

        const commitStyleChange = (drawing) => {
            clearTimeout(_styleTimer);
            _styleTimer = setTimeout(() => {
                if (self.history && _styleBeforeState && _styleBeforeId === drawing.id) {
                    self.history.recordModify(drawing, _styleBeforeState);
                    // Reset so next change session gets a fresh capture
                    _styleBeforeState = self.history.captureState(drawing);
                }
            }, 600);
        };

        // Expose so the toolbar can call captureStyleBefore before applying a change
        this.toolbar.onBeforeUpdate = captureStyleBefore;

        // Update callback
        this.toolbar.onUpdate = (drawing) => {
            commitStyleChange(drawing);
            self.renderDrawing(drawing);
            self.persistPositionToolDefaults(drawing);

            if (drawing) {
                self.saveToolStyle(drawing.type, drawing.style || {});
            }

            self.saveDrawings();
        };
        
        // Delete callback
        this.toolbar.onDelete = (drawing) => {
            // Discard any pending style timer
            clearTimeout(_styleTimer);
            _styleBeforeState = null;
            _styleBeforeId = null;
            self.deleteDrawing(drawing);
        };
        
        // Settings callback - opens settings panel
        this.toolbar.onSettings = (drawing) => {
            const rect = self.toolbar.toolbar.getBoundingClientRect();
            // Capture before state immediately (panel not yet open)
            const beforeState = self.history ? self.history.captureState(drawing) : null;
            self.settingsPanel.show(
                drawing,
                rect.left + rect.width / 2,
                rect.bottom + 10,
                (updatedDrawing) => {
                    if (self.history && beforeState) {
                        self.history.recordModify(updatedDrawing, beforeState);
                    }
                    self.renderDrawing(updatedDrawing);
                    self.persistPositionToolDefaults(updatedDrawing);
                    self.saveDrawings();
                }
            );
        };
        
        // Lock callback
        this.toolbar.onLock = (drawing) => {
            const beforeState = self.history ? self.history.captureState(drawing) : null;
            self.renderDrawing(drawing);
            self.saveDrawings();
            if (self.history && beforeState) {
                self.history.recordModify(drawing, beforeState);
            }
        };
        
        // More options callback - opens context menu (right-click menu)
        this.toolbar.onMoreOptions = (drawing, x, y) => {
            // Check if context menu is already open - if so, close it instead
            const existingMenu = document.querySelector('.tv-context-menu');
            if (existingMenu) {
                existingMenu.remove();
            } else {
                self.showContextMenu(drawing, x, y);
            }
        };

        if (typeof this.toolbar.onEmojiSelect === 'function') {
            this.toolbar.onEmojiSelect = (options) => {
                self.handleEmojiSelection(options);
            };
        }
    }

    /**
     * Create SVG layers for drawings
     */
    createSVGLayers() {
        // Keep SVG pointer-events: none to allow canvas panning
        // Individual drawing elements will handle their own events
        this.svg.style('pointer-events', 'none');
        
        // Create clip path definition for chart area (excludes price/time axes)
        let defs = this.svg.select('defs');
        if (defs.empty()) {
            defs = this.svg.append('defs');
        }
        
        // Create or update clip path for chart area
        let clipPath = defs.select('#chart-clip-path');
        if (clipPath.empty()) {
            clipPath = defs.append('clipPath')
                .attr('id', 'chart-clip-path');
            clipPath.append('rect')
                .attr('class', 'chart-clip-rect');
        }
        
        // Update clip rect dimensions
        this.updateClipPath();
        
        // Main drawings group with clipping
        this.drawingsGroup = this.svg.select('.drawings');
        if (this.drawingsGroup.empty()) {
            this.drawingsGroup = this.svg.append('g')
                .attr('class', 'drawings')
                .attr('clip-path', 'url(#chart-clip-path)')
                .style('pointer-events', 'none'); // Will enable per-element
        } else {
            this.drawingsGroup.attr('clip-path', 'url(#chart-clip-path)');
        }
        
        // Temporary drawing group (for live preview) with clipping
        this.tempGroup = this.svg.select('.temp-drawing');
        if (this.tempGroup.empty()) {
            this.tempGroup = this.svg.append('g')
                .attr('class', 'temp-drawing')
                .attr('clip-path', 'url(#chart-clip-path)')
                .style('pointer-events', 'none');
        } else {
            this.tempGroup.attr('clip-path', 'url(#chart-clip-path)');
        }

        // Unclipped labels group — text labels that must not be clipped by chart boundary
        this.labelsGroup = this.svg.select('.drawings-labels');
        if (this.labelsGroup.empty()) {
            this.labelsGroup = this.svg.append('g')
                .attr('class', 'drawings-labels')
                .style('pointer-events', 'none');
        }
    }
    
    /**
     * Update clip path dimensions based on chart margins
     */
    updateClipPath() {
        const m = this.chart.margin;
        const w = this.chart.w || this.chart.canvas?.width || 800;
        const h = this.chart.h || this.chart.canvas?.height || 600;
        
        // Full width so handles in the price-axis zone are not clipped;
        // clip only at the time-axis boundary (bottom).
        this.svg.select('.chart-clip-rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', w)
            .attr('height', h - m.b);
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const svg = this.svg;

        const openDrawingSettingsFromDoubleClick = (event) => {
            if (this.currentTool) return false;
            if (this.eraserMode) return false;

            const rawTargetNode = event?.target || null;
            const targetSel = rawTargetNode ? d3.select(rawTargetNode) : null;
            if (targetSel && targetSel.classed('inline-editable-text')) {
                return false;
            }

            const handleNode = rawTargetNode && rawTargetNode.closest
                ? rawTargetNode.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle')
                : null;
            const isVolumeProfileBoundaryHandle = !!(
                handleNode
                && handleNode.classList
                && handleNode.classList.contains('volume-profile-boundary-hit')
            );
            if (handleNode && !isVolumeProfileBoundaryHandle) {
                return false;
            }

            const valueLabelNode = rawTargetNode && rawTargetNode.closest
                ? rawTargetNode.closest('.volume-profile-values-label')
                : null;
            if (valueLabelNode) {
                const valueLabelDrawingGroup = valueLabelNode.closest('.drawing');
                const valueLabelDrawingId = valueLabelDrawingGroup
                    ? d3.select(valueLabelDrawingGroup).attr('data-id')
                    : null;
                const valueLabelDrawing = valueLabelDrawingId
                    ? this.drawings.find((d) => d && d.id === valueLabelDrawingId)
                    : null;

                if (valueLabelDrawing && this.isVolumeProfileToolType(valueLabelDrawing.type) && !valueLabelDrawing.locked) {
                    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                    if (typeof event.stopPropagation === 'function') event.stopPropagation();
                    if (typeof event.preventDefault === 'function') event.preventDefault();

                    this.selectDrawing(valueLabelDrawing);
                    this.editDrawing(valueLabelDrawing, event.pageX, event.pageY);
                    return true;
                }
            }

            const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
            if (!svgNode) return false;

            const svgRect = svgNode.getBoundingClientRect();
            const mouseX = event.clientX - svgRect.left;
            const mouseY = event.clientY - svgRect.top;
            const valueLabelDrawing = this.findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY);
            const drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true });

            let fallbackVolumeProfileDrawing = null;
            if ((!drawingsAtPoint || drawingsAtPoint.length === 0) && rawTargetNode && rawTargetNode.closest) {
                const volumeProfileHitNode = rawTargetNode.closest('.volume-profile-values-label, .volume-profile-boundary, .volume-profile-boundary-hit, .volume-profile-level-line');
                const domDrawingGroup = rawTargetNode.closest('.drawing');
                if (volumeProfileHitNode && domDrawingGroup) {
                    const domDrawingId = d3.select(domDrawingGroup).attr('data-id');
                    const domDrawing = this.drawings.find((d) => d && d.id === domDrawingId);
                    if (domDrawing && this.isVolumeProfileToolType(domDrawing.type)) {
                        fallbackVolumeProfileDrawing = domDrawing;
                    }
                }
            }

            if ((!drawingsAtPoint || drawingsAtPoint.length === 0) && !valueLabelDrawing && !fallbackVolumeProfileDrawing) return false;

            const drawing = valueLabelDrawing || drawingsAtPoint[0] || fallbackVolumeProfileDrawing;
            if (!drawing || drawing.locked) return false;

            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();

            this.selectDrawing(drawing);
            this.editDrawing(drawing, event.pageX, event.pageY);
            return true;
        };
        
        // Mouse events for drawing
        svg.on('mousedown.drawing', (event) => this.handleMouseDown(event));
        svg.on('mousemove.drawing', (event) => this.handleMouseMove(event));
        svg.on('mouseup.drawing', (event) => this.handleMouseUp(event));

        // Shift-release: immediately refresh preview to real mouse position
        document.addEventListener('keyup', (e) => {
            if (e.key !== 'Shift') return;
            if (!this.currentTool || !this.drawingState || !this.drawingState.isDrawing) return;
            if (!this._lastMouseEvent) return;
            const last = this._lastMouseEvent;
            const fakeEvent = {
                clientX: last.clientX,
                clientY: last.clientY,
                shiftKey: false,
                ctrlKey: last.ctrlKey,
                altKey: last.altKey,
                metaKey: last.metaKey,
                buttons: last.buttons,
                button: last.button,
                target: last.target,
                currentTarget: last.currentTarget
            };
            this.handleMouseMove(fakeEvent);
        });

        // Double-click anywhere on a drawing (use same geometric hit-test as selection)
        svg.on('dblclick.drawing', (event) => {
            const suppressUntil = Number(this._suppressNextDrawingDblClickUntil || 0);
            if (suppressUntil > 0 && Date.now() <= suppressUntil) {
                this._suppressNextDrawingDblClickUntil = 0;
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
                if (typeof event.preventDefault === 'function') event.preventDefault();
                return;
            }
            this._suppressNextDrawingDblClickUntil = 0;
            openDrawingSettingsFromDoubleClick(event);
        });
        
        // Right-click context menu
        svg.on('contextmenu.drawing', (event) => this.handleContextMenu(event));
        
        // Keyboard shortcuts
        d3.select(window).on('keydown.drawing', (event) => this.handleKeyDown(event));
        d3.select(window).on('keyup.drawing', (event) => this.handleKeyUp(event));
        // Reset modifier-key flags when window loses focus (prevents stuck magnetKeyHeld)
        d3.select(window).on('blur.drawing', () => { this.magnetKeyHeld = false; this.ctrlSelectMode = false; });
        
        // Canvas-level events for rectangular selection and deselection
        const canvas = document.getElementById('chartCanvas');
        if (canvas) {
            let suppressNextCanvasClick = false;

            const existing = canvas.__drawingToolsCanvasHandlers;
            if (existing) {
                canvas.removeEventListener('mousedown', existing.mousedown, true);
                canvas.removeEventListener('click', existing.click);
                canvas.removeEventListener('mousemove', existing.mousemove);
                canvas.removeEventListener('dblclick', existing.dblclick, true);
            }

            // Mousedown on canvas for rectangular selection
            const onMouseDown = (event) => {
                // Check for Ctrl+drag to start rectangular selection
                if (event.ctrlKey && !event.shiftKey && !this.currentTool) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    // [debug removed]
                    this.startRectangularSelection(event);
                    return;
                }

                // Make drag-start use the same geometric hover hit zone, even when the
                // cursor is not exactly on an SVG stroke target.
                if (event.button !== 0 || this.currentTool || this.isRectSelecting || event.shiftKey || event.altKey) {
                    return;
                }

                const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
                if (!svgNode) return;

                // Let Anchored VWAP anchor points use their own element drag behavior.
                // Avoid canvas-capture direct-drag hijacking (which can no-op for anchored-vwap).
                const rawTarget = event.target;
                const isAnchoredVwapAnchorTarget = !!(rawTarget && rawTarget.closest && rawTarget.closest('.anchored-vwap-anchor, .anchored-vwap-anchor-hit'));
                if (isAnchoredVwapAnchorTarget) return;

                const svgRect = svgNode.getBoundingClientRect();
                const mouseX = event.clientX - svgRect.left;
                const mouseY = event.clientY - svgRect.top;
                const includeVolumeProfileBodyHit = event.detail >= 2;
                let drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit });
                const topVolumeProfileValueLabelDrawing = this.findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY, { includeLocked: true });
                if (topVolumeProfileValueLabelDrawing && !drawingsAtPoint.includes(topVolumeProfileValueLabelDrawing)) {
                    drawingsAtPoint = [topVolumeProfileValueLabelDrawing, ...drawingsAtPoint];
                }
                if ((!drawingsAtPoint || drawingsAtPoint.length === 0) && event.detail >= 2) {
                    const openedFromDoubleClick = openDrawingSettingsFromDoubleClick(event);
                    if (openedFromDoubleClick) {
                        this._suppressNextDrawingDblClickUntil = Date.now() + 600;
                        suppressNextCanvasClick = true;
                        return;
                    }
                }
                if (!drawingsAtPoint || drawingsAtPoint.length === 0) return;
                const isVolumeProfileLevelLineHit = drawingsAtPoint.some((d) =>
                    this.isVolumeProfileLevelLineHit(d, mouseX, mouseY)
                );
                const isVolumeProfileHit = drawingsAtPoint.some((d) => d && this.isVolumeProfileToolType(d.type));
                const isVolumeProfileValuesLabelHit = drawingsAtPoint.some((d) =>
                    this.isVolumeProfileValuesLabelHit(d, mouseX, mouseY)
                );
                const isVolumeProfileValuesLabelTarget = !!(
                    rawTarget
                    && rawTarget.closest
                    && rawTarget.closest('.volume-profile-values-label')
                );
                const isVolumeProfileExplicitTarget = !!(
                    rawTarget
                    && rawTarget.closest
                    && rawTarget.closest('.volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-values-label, .volume-profile-level-line, .resize-handle, .resize-handle-hit, .resize-handle-group')
                );

                const now = Date.now();
                const valueLabelClickState = this._volumeProfileValueLabelClickState || null;
                const bestUnlockedVolumeProfile = drawingsAtPoint.find((d) =>
                    d && !d.locked && this.isVolumeProfileToolType(d.type)
                ) || null;
                const isFollowupValueLabelClick = !!(
                    valueLabelClickState
                    && bestUnlockedVolumeProfile
                    && valueLabelClickState.drawingId === bestUnlockedVolumeProfile.id
                    && (now - valueLabelClickState.time) <= 700
                    && Math.abs((valueLabelClickState.mouseX ?? 0) - mouseX) <= 24
                    && Math.abs((valueLabelClickState.mouseY ?? 0) - mouseY) <= 24
                );

                if (isFollowupValueLabelClick) {
                    this._volumeProfileValueLabelClickState = null;
                    this.selectDrawing(bestUnlockedVolumeProfile, false);
                    this.editDrawing(bestUnlockedVolumeProfile, event.pageX, event.pageY);
                    this._suppressNextDrawingDblClickUntil = Date.now() + 600;

                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                const isSecondClick = event.detail >= 2;
                if (isSecondClick) {
                    this._volumeProfileValueLabelClickState = null;
                    let openedFromDoubleClick = openDrawingSettingsFromDoubleClick(event);
                    if (!openedFromDoubleClick && (isVolumeProfileValuesLabelTarget || isVolumeProfileValuesLabelHit) && isVolumeProfileHit) {
                        const labelDrawing = drawingsAtPoint.find((d) =>
                            d && !d.locked && this.isVolumeProfileValuesLabelHit(d, mouseX, mouseY)
                        );
                        if (labelDrawing) {
                            this.selectDrawing(labelDrawing, false);
                            this.editDrawing(labelDrawing, event.pageX, event.pageY);
                            openedFromDoubleClick = true;
                        }
                    }
                    if (openedFromDoubleClick) {
                        // Prevent duplicate open from the browser's upcoming dblclick event.
                        // Keep this suppression short-lived so later true dblclicks still work.
                        this._suppressNextDrawingDblClickUntil = Date.now() + 600;
                    }
                    if (!openedFromDoubleClick) {
                        const best = drawingsAtPoint[0];
                        if (best && !best.locked) {
                            this.selectDrawing(best, false);
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                if ((isVolumeProfileValuesLabelTarget || isVolumeProfileValuesLabelHit) && isVolumeProfileHit) {
                    const labelDrawing = drawingsAtPoint.find((d) =>
                        d && !d.locked && this.isVolumeProfileValuesLabelHit(d, mouseX, mouseY)
                    );
                    const best = labelDrawing || drawingsAtPoint[0];

                    if (best && !best.locked) {
                        const clickState = this._volumeProfileValueLabelClickState || null;
                        const isSecondValueLabelClick = !!(
                            clickState
                            && clickState.drawingId === best.id
                            && (now - clickState.time) <= 700
                            && Math.abs((clickState.mouseX ?? 0) - mouseX) <= 24
                            && Math.abs((clickState.mouseY ?? 0) - mouseY) <= 24
                        );

                        if (isSecondValueLabelClick) {
                            this._volumeProfileValueLabelClickState = null;
                            this.selectDrawing(best, false);
                            this.editDrawing(best, event.pageX, event.pageY);
                            this._suppressNextDrawingDblClickUntil = Date.now() + 600;

                            event.preventDefault();
                            event.stopPropagation();
                            if (typeof event.stopImmediatePropagation === 'function') {
                                event.stopImmediatePropagation();
                            }
                            suppressNextCanvasClick = true;
                            return;
                        }

                        this._volumeProfileValueLabelClickState = {
                            drawingId: best.id,
                            time: now,
                            mouseX,
                            mouseY
                        };
                        this.selectDrawing(best, false);
                    } else {
                        this._volumeProfileValueLabelClickState = null;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                if (isVolumeProfileLevelLineHit) {
                    const best = drawingsAtPoint[0];
                    if (best && !best.locked) {
                        this.selectDrawing(best, false);
                        this._volumeProfileValueLabelClickState = {
                            drawingId: best.id,
                            time: now,
                            mouseX,
                            mouseY
                        };
                    } else {
                        this._volumeProfileValueLabelClickState = null;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                if (isVolumeProfileHit && !isVolumeProfileExplicitTarget) {
                    const best = drawingsAtPoint[0];
                    if (best && !best.locked) {
                        this.selectDrawing(best, false);
                        this._volumeProfileValueLabelClickState = {
                            drawingId: best.id,
                            time: now,
                            mouseX,
                            mouseY
                        };
                    } else {
                        this._volumeProfileValueLabelClickState = null;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                const selectedAtPoint = (this.selectedDrawings || []).filter(d => drawingsAtPoint.includes(d) && !d.locked);

                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') {
                    event.stopImmediatePropagation();
                }

                if (selectedAtPoint.length > 0) {
                    this._startDirectMoveDrag(selectedAtPoint, event);
                } else {
                    const best = drawingsAtPoint[0];
                    if (!best || best.locked) return;

                    this.selectDrawing(best, false);
                    this._startDirectMoveDrag(best, event);
                }

                suppressNextCanvasClick = true;
            };
            canvas.addEventListener('mousedown', onMouseDown, true);
            
            // Click on canvas to deselect all drawings
            const onClick = (event) => {
                if (suppressNextCanvasClick) {
                    suppressNextCanvasClick = false;
                    return;
                }

                // Skip if click originated from toolbar or UI elements
                if (event.target.closest('.tool-btn') || 
                    event.target.closest('.tool-dropdown') || 
                    event.target.closest('.tool-group-btn') ||
                    event.target.closest('.toolbar')) {
                    return;
                }
                
                if (!event.ctrlKey && this.selectedDrawings.length > 0 && !this.isRectSelecting) {
                    // [debug removed]
                    this.deselectAll();
                }
            };
            canvas.addEventListener('click', onClick);

            const onDblClick = (event) => {
                if (event.button !== 0) return;
                const suppressUntil = Number(this._suppressNextDrawingDblClickUntil || 0);
                if (suppressUntil > 0 && Date.now() <= suppressUntil) {
                    this._suppressNextDrawingDblClickUntil = 0;
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    return;
                }
                this._suppressNextDrawingDblClickUntil = 0;
                openDrawingSettingsFromDoubleClick(event);
            };
            canvas.addEventListener('dblclick', onDblClick, true);
            
            // Mousemove on canvas for proximity cursor change
            const onMouseMove = (event) => {
                if (!this.currentTool && !this.isRectSelecting) {
                    this.checkDrawingProximity(event);
                }
            };
            canvas.addEventListener('mousemove', onMouseMove);

            canvas.__drawingToolsCanvasHandlers = {
                mousedown: onMouseDown,
                click: onClick,
                mousemove: onMouseMove,
                dblclick: onDblClick
            };
        }
    }

    /**
     * Set the current drawing tool
     */
    setTool(toolName) {
        // [debug removed]
        // [debug removed]
        if (!this.toolRegistry[toolName]) {
            console.error(`Unknown tool: ${toolName}`);
            // [debug removed]
            return;
        }
        if (toolName === 'emoji' && !this.currentEmojiOptions) {
            console.warn('🎯 Select an emoji before activating the emoji tool.');
            return;
        }

        this.currentTool = toolName;
        this.deselectAll();
        this.drawingState.reset();
        this.isDraggingFirstTwo = false;  // Reset drag state for multi-point tools
        this.dragFirstTwoStart = null;
        this.dragFirstTwoStartScreen = null;
        
        // Update cursor
        this.svg.style('cursor', toolName ? 'crosshair' : 'default');
        this.svg.style('pointer-events', toolName ? 'all' : 'none');
        if (this.chart?.canvas) {
            this.chart.canvas.style.cursor = toolName ? 'crosshair' : 'default';
        }
        
        // Disable pointer events on all existing drawings when a tool is active
        if (toolName) {
            this.drawings.forEach(drawing => {
                if (drawing.group) {
                    drawing.group.style('pointer-events', 'none');
                    drawing.group.style('cursor', 'default');
                    // While in draw mode, existing drawings must not steal hover cursor or events.
                    drawing.group.selectAll('*')
                        .style('pointer-events', 'none')
                        .style('cursor', 'default');
                }
            });
        }
        
        // Sync with favorites toolbar
        if (this.favoritesManager && typeof this.favoritesManager.syncActiveState === 'function') {
            this.favoritesManager.syncActiveState(toolName);
        }
        this._updateAxisZonePointerEvents();
        
        // [debug removed]
    }

    /**
     * Clear current tool (cursor mode)
     */
    clearTool() {
        // [debug removed]
        this.currentTool = null;
        this.drawingState.reset();
        this.svg.style('cursor', 'default');
        
        // Clear any active drawing
        this.tempGroup.selectAll('*').remove();
        
        // Reset continuous drawing flags
        this.isDrawingPath = false;
        this.isDraggingFirstTwo = false;
        this.dragFirstTwoStart = null;
        this.dragFirstTwoStartScreen = null;
        
        // DON'T clear eraser mode here - eraser is a cursor type, not a drawing tool
        // Eraser mode is managed by setCursorType() in chart.js
        
        // Reset SVG pointer-events to allow chart panning
        this.svg.style('pointer-events', 'none');
        
        // Re-enable pointer events on STROKES ONLY - fills remain non-interactive
        this.drawings.forEach(drawing => {
            if (drawing.group) {
                // Keep group pointer-events none
                drawing.group.style('pointer-events', 'none');
                // Lines, text, handles use 'all'
                drawing.group.selectAll('line, polyline, text, .resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle')
                    .style('pointer-events', 'all');
                // Shape borders use visibleStroke to ignore transparent fill
                drawing.group.selectAll('.shape-border')
                    .style('pointer-events', 'visibleStroke');
                // Transparent hit areas should remain interactive on stroke (like rectangle edges)
                drawing.group.selectAll('.shape-border-hit')
                    .style('pointer-events', 'stroke');

                // Arrow tools: allow fill hit areas to be interactive
                drawing.group.selectAll('.arrow-fill-hit')
                    .style('pointer-events', 'all');
                // Other paths/polygons use visibleStroke
                drawing.group.selectAll('path:not(.shape-fill):not(.shape-border):not(.arrow-fill-hit), polygon:not(.shape-fill):not(.upper-fill):not(.lower-fill)')
                    .style('pointer-events', 'visibleStroke');
                // KEEP fill elements non-interactive
                drawing.group.selectAll('.shape-fill, .upper-fill, .lower-fill').style('pointer-events', 'none');
            }
        });
        
        // Clear UI active states from tool buttons
        document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tool-group-btn:not(#magnetMode):not(#magnetModeToolbar):not(#cursorTool)').forEach(b => b.classList.remove('active'));
        const cursorBtn = document.getElementById('cursorTool');
        if (cursorBtn) cursorBtn.classList.add('active');

        if (typeof window !== 'undefined' && typeof window.syncMagnetButton === 'function') {
            window.syncMagnetButton();
        }
        
        // Clear favorites toolbar active state
        if (this.favoritesManager && typeof this.favoritesManager.syncActiveState === 'function') {
            this.favoritesManager.syncActiveState(null);
        }

        if (this.chart?.canvas) {
            const cursorStyle = this.chart.getCurrentCursorStyle ? this.chart.getCurrentCursorStyle() : 'default';
            this.chart.canvas.style.cursor = cursorStyle;
        }
        this._updateAxisZonePointerEvents();
    }
    
    /**
     * Deactivate current drawing tool (used when switching panels)
     * Alias for clearTool() with more explicit naming
     */
    deactivateTool() {
        this.clearTool();
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(event) {
        // Ignore right-click - handled by contextmenu event
        if (event.button === 2) {
            return;
        }

        // If user is clicking on a resize handle, do not run drawing-mode logic.
        // This ensures Path/Polyline (point-by-point tools) can resize/move the last point
        // even when a tool remains active.
        const rawTargetNode = event && event.target ? event.target : null;
        const handleNode = rawTargetNode && rawTargetNode.closest
            ? rawTargetNode.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle')
            : null;
        const levelLineNode = rawTargetNode && rawTargetNode.closest
            ? rawTargetNode.closest('.volume-profile-level-line')
            : null;
        const valueLabelNode = rawTargetNode && rawTargetNode.closest
            ? rawTargetNode.closest('.volume-profile-values-label')
            : null;
        let isVolumeProfileLevelLineTarget = false;
        let isVolumeProfileValuesLabelTarget = false;
        if (levelLineNode) {
            const levelLineDrawingGroup = levelLineNode.closest('.drawing');
            if (levelLineDrawingGroup) {
                const levelLineDrawingId = d3.select(levelLineDrawingGroup).attr('data-id');
                const levelLineDrawing = this.drawings.find(d => d && d.id === levelLineDrawingId);
                isVolumeProfileLevelLineTarget = !!(levelLineDrawing && this.isVolumeProfileToolType(levelLineDrawing.type));
            }
        }
        if (valueLabelNode) {
            const valueLabelDrawingGroup = valueLabelNode.closest('.drawing');
            if (valueLabelDrawingGroup) {
                const valueLabelDrawingId = d3.select(valueLabelDrawingGroup).attr('data-id');
                const valueLabelDrawing = this.drawings.find(d => d && d.id === valueLabelDrawingId);
                isVolumeProfileValuesLabelTarget = !!(valueLabelDrawing && this.isVolumeProfileToolType(valueLabelDrawing.type));
            }
        }
        const isVolumeProfileBoundaryHandle = !!(handleNode && handleNode.classList && handleNode.classList.contains('volume-profile-boundary-hit'));
        const allowActiveToolHandleBypass = this.currentTool === 'polyline' || this.currentTool === 'path';
        if (handleNode && !isVolumeProfileBoundaryHandle && (!this.currentTool || allowActiveToolHandleBypass)) {
            return;
        }
        
        // [debug removed]
        
        if (!this.currentTool) {
            // Get mouse position in SVG coordinates
            const svgRect = this.svg.node().getBoundingClientRect();
            const mouseX = event.clientX - svgRect.left;
            const mouseY = event.clientY - svgRect.top;
            
            // Check for stacked lines (more than 3 lines at this point)
            const stackedLinesInfo = this.findStackedLines(mouseX, mouseY, 3);
            if (stackedLinesInfo.isStacked) {
                // [debug removed]
                // Store stacked lines info for potential UI display or selection
                this.lastStackedLines = stackedLinesInfo;
            }
            
            // Find all drawings at this point using geometric hit test
            const includeVolumeProfileBodyHit = event.detail >= 2;
            let drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit });
            const topVolumeProfileValueLabelDrawing = this.findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY, { includeLocked: true });
            if (topVolumeProfileValueLabelDrawing && !drawingsAtPoint.includes(topVolumeProfileValueLabelDrawing)) {
                drawingsAtPoint = [topVolumeProfileValueLabelDrawing, ...drawingsAtPoint];
            }

            if (!isVolumeProfileLevelLineTarget && drawingsAtPoint.length > 0) {
                isVolumeProfileLevelLineTarget = drawingsAtPoint.some((d) =>
                    this.isVolumeProfileLevelLineHit(d, mouseX, mouseY)
                );
            }

            if (!isVolumeProfileValuesLabelTarget && drawingsAtPoint.length > 0) {
                isVolumeProfileValuesLabelTarget = drawingsAtPoint.some((d) =>
                    this.isVolumeProfileValuesLabelHit(d, mouseX, mouseY)
                );
            }

            if (drawingsAtPoint.length > 0 && !event.shiftKey && !event.altKey) {
                const lineTypeSet = new Set([
                    'trendline',
                    'horizontal',
                    'vertical',
                    'ray',
                    'horizontal-ray',
                    'extended-line',
                    'cross-line',
                    'arrow',
                    'arrow-marker',
                    'arrow-mark-up',
                    'arrow-mark-down',
                    'curve',
                    'double-curve',
                    'polyline',
                    'path'
                ]);

                const isFibLikeType = (type) => !!type && (
                    type.startsWith('fibonacci-') ||
                    type.startsWith('fib-') ||
                    type.startsWith('trend-fib-') ||
                    type === 'pitchfork' ||
                    type === 'pitchfan'
                );

                const isPatternLikeType = (type) => !!type && (
                    type.includes('pattern') ||
                    type.startsWith('elliott-') ||
                    type === 'head-shoulders' ||
                    type === 'three-drives' ||
                    type === 'cyclic-lines' ||
                    type === 'time-cycles' ||
                    type === 'sine-line'
                );

                const allowsDirectMoveFromHitZone = (type) => (
                    lineTypeSet.has(type) || isFibLikeType(type) || isPatternLikeType(type)
                );

                const shapeTypeSet = new Set([
                    'rectangle',
                    'triangle',
                    'circle',
                    'ellipse'
                ]);

                const best = drawingsAtPoint[0];
                const bestZ = best ? this.drawings.indexOf(best) : -1;

                // If the top hit is a circle/ellipse, but a line also exists at this point,
                // prefer the line for direct-drag so you can move items behind circles without selecting.
                const bestIsCircleLike = best && (best.type === 'circle' || best.type === 'ellipse');
                if (bestIsCircleLike) {
                    const linesAtPoint = this.findLinesAtPoint(mouseX, mouseY)
                        .filter(info => info && info.drawing && allowsDirectMoveFromHitZone(info.drawing.type));

                    if (linesAtPoint.length > 0) {
                        linesAtPoint.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
                        const lineDrawing = linesAtPoint[0].drawing;
                        const lineZ = lineDrawing ? this.drawings.indexOf(lineDrawing) : -1;
                        const isLineBehindCircle = lineZ > -1 && bestZ > -1 && lineZ < bestZ;

                        if (lineDrawing && !lineDrawing.locked && isLineBehindCircle) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.selectDrawing(lineDrawing, false);
                            this._startDirectMoveDrag(lineDrawing, event);
                            return;
                        }
                    }
                }

                if (best && !best.locked && allowsDirectMoveFromHitZone(best.type)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectDrawing(best, false);
                    this._startDirectMoveDrag(best, event);
                    return;
                }

                // Make shapes draggable on first drag as well
                if (best && !best.locked && shapeTypeSet.has(best.type)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectDrawing(best, false);
                    this._startDirectMoveDrag(best, event);
                    return;
                }
            }

            // If multiple drawings overlap, start a direct move drag for the best hit immediately.
            // This avoids relying on DOM event targeting (which always hits the topmost SVG element),
            // allowing lines behind shapes to be dragged on the first attempt.
            if (drawingsAtPoint.length > 1 && !event.shiftKey && !event.altKey) {
                const best = drawingsAtPoint[0];
                const shouldBlockVolumeProfileTextDirectMove = (isVolumeProfileLevelLineTarget || isVolumeProfileValuesLabelTarget)
                    && best
                    && this.isVolumeProfileToolType(best.type);
                if (best && !best.locked && !shouldBlockVolumeProfileTextDirectMove) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectDrawing(best, false);
                    this._startDirectMoveDrag(best, event);
                    return;
                }
            }

            // If user already has a selection, and the mouse is over a selected drawing,
            // start a direct drag for that selection even if another drawing is on top.
            // This avoids relying on DOM event targeting (which always hits the topmost SVG element).
            if (this.selectedDrawings && this.selectedDrawings.length > 0 && drawingsAtPoint.length > 0) {
                const selectedAtPoint = this.selectedDrawings.filter(d => drawingsAtPoint.includes(d) && !d.locked);
                const hasSelectedVolumeProfileAtPoint = selectedAtPoint.some(d => this.isVolumeProfileToolType(d.type));
                const shouldBlockSelectedVolumeProfileTextDirectMove = (isVolumeProfileLevelLineTarget || isVolumeProfileValuesLabelTarget)
                    && hasSelectedVolumeProfileAtPoint;
                if (selectedAtPoint.length > 0 && !event.shiftKey && !shouldBlockSelectedVolumeProfileTextDirectMove) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._startDirectMoveDrag(selectedAtPoint, event);
                    return;
                }
            }
            
            // Check if clicking on existing drawing
            const target = d3.select(event.target);
            
            // Get all parent drawing groups (for nested drawings) - for handle detection
            const allDrawingGroups = [];
            let currentNode = target.node();
            while (currentNode) {
                if (currentNode.classList && currentNode.classList.contains('drawing')) {
                    allDrawingGroups.push(currentNode);
                }
                currentNode = currentNode.parentElement;
            }
            
            // Determine which drawing to select
            let drawing = null;
            let drawingGroup = null;
            
            // If stacked lines detected and Shift key is held, select all drawings with lines at this point
            if (stackedLinesInfo.isStacked && event.shiftKey) {
                // [debug removed]
                stackedLinesInfo.drawings.forEach((d, i) => {
                    this.selectDrawing(d, i > 0); // Add to selection for subsequent drawings
                });
                return;
            }
            
            if (drawingsAtPoint.length > 0) {
                if (event.altKey && drawingsAtPoint.length > 1) {
                    // Alt+Click: Cycle through overlapping drawings
                    const currentlySelected = drawingsAtPoint.find(d => d.selected);
                    
                    if (currentlySelected) {
                        // Cycle to next drawing
                        const currentIndex = drawingsAtPoint.indexOf(currentlySelected);
                        const nextIndex = (currentIndex + 1) % drawingsAtPoint.length;
                        drawing = drawingsAtPoint[nextIndex];
                        // [debug removed]
                    } else {
                        // No selection, start with first
                        drawing = drawingsAtPoint[0];
                    }
                } else {
                    // Normal click - select the topmost drawing (first in list)
                    drawing = drawingsAtPoint[0];
                }
                
                // Find the corresponding DOM group for handle detection
                if (drawing) {
                    drawingGroup = allDrawingGroups.find(g => 
                        d3.select(g).attr('data-id') === drawing.id
                    );
                }
            }
            
            const rawTargetNode = target.node();
            const resizeHandleNode = rawTargetNode && rawTargetNode.closest
                ? rawTargetNode.closest('.resize-handle, .resize-handle-hit, .resize-handle-group')
                : null;
            const customHandleNode = rawTargetNode && rawTargetNode.closest
                ? rawTargetNode.closest('.custom-handle')
                : null;

            // Fallback for volume-profile labels/boundaries/levels when geometric hit-testing misses
            // (notably anchored profiles where only edge/label clicks should select).
            if (!drawing && rawTargetNode && rawTargetNode.closest) {
                const volumeProfileHitNode = rawTargetNode.closest('.volume-profile-values-label, .volume-profile-boundary, .volume-profile-boundary-hit, .volume-profile-level-line');
                const domDrawingGroup = rawTargetNode.closest('.drawing');
                if (volumeProfileHitNode && domDrawingGroup) {
                    const domDrawingId = d3.select(domDrawingGroup).attr('data-id');
                    const domDrawing = this.drawings.find(d => d && d.id === domDrawingId);
                    if (domDrawing && this.isVolumeProfileToolType(domDrawing.type)) {
                        drawing = domDrawing;
                        drawingGroup = domDrawingGroup;
                    }
                }
            }

            // If a handle was clicked directly, resolve the drawing from the DOM group.
            // This avoids missing the drawing when geometric stroke-only hit testing fails
            // on transparent handle centers.
            if (!drawing && (resizeHandleNode || customHandleNode)) {
                const handleDrawingGroup = rawTargetNode && rawTargetNode.closest
                    ? rawTargetNode.closest('.drawing')
                    : null;
                if (handleDrawingGroup) {
                    const handleDrawingId = d3.select(handleDrawingGroup).attr('data-id');
                    const handleDrawing = this.drawings.find(d => d.id === handleDrawingId);
                    if (handleDrawing) {
                        drawing = handleDrawing;
                        drawingGroup = handleDrawingGroup;
                    }
                }
            }

            if (drawing) {

                if (resizeHandleNode || customHandleNode) {
                    event.preventDefault();
                    event.stopPropagation();

                    const stopDirectResizeListeners = () => {
                        if (this._directResizeMoveHandler) {
                            document.removeEventListener('mousemove', this._directResizeMoveHandler, true);
                        }
                        if (this._directResizeUpHandler) {
                            document.removeEventListener('mouseup', this._directResizeUpHandler, true);
                        }
                        this._directResizeMoveHandler = null;
                        this._directResizeUpHandler = null;
                    };

                    if (!drawing.selected || (this.selectedDrawings.length !== 1 || this.selectedDrawings[0] !== drawing)) {
                        this.deselectAll();
                        drawing.select();
                        this.selectedDrawing = drawing;
                        this.selectedDrawings = [drawing];
                    }

                    stopDirectResizeListeners();

                    if (customHandleNode) {
                        const role = customHandleNode.getAttribute('data-handle-role');
                        this.startCustomHandleDrag(drawing, role, { sourceEvent: event });

                        this._directResizeMoveHandler = (e) => {
                            if (this.chart && typeof this.chart.updateCrosshair === 'function') this.chart.updateCrosshair(e);
                            this.handleCustomHandleDrag({ sourceEvent: e });
                        };
                        this._directResizeUpHandler = (e) => {
                            stopDirectResizeListeners();
                            this.endCustomHandleDrag({ sourceEvent: e });
                        };
                    } else {
                        const role = resizeHandleNode.getAttribute('data-handle-role');
                        const idxAttr = resizeHandleNode.getAttribute('data-point-index');
                        const idx = idxAttr != null ? parseInt(idxAttr, 10) : NaN;

                        const baseProto = (typeof BaseDrawing !== 'undefined' && BaseDrawing.prototype) ? BaseDrawing.prototype : null;
                        const hasCustomOverride = baseProto
                            ? drawing.handleCustomHandleDrag !== baseProto.handleCustomHandleDrag
                            : (typeof drawing.handleCustomHandleDrag === 'function');
                        const hasPointOverride = baseProto
                            ? drawing.onPointHandleDrag !== baseProto.onPointHandleDrag
                            : (typeof drawing.onPointHandleDrag === 'function');

                        if (role && hasCustomOverride) {
                            this.startCustomHandleDrag(drawing, role, { sourceEvent: event });
                            this._directResizeMoveHandler = (e) => {
                                if (this.chart && typeof this.chart.updateCrosshair === 'function') this.chart.updateCrosshair(e);
                                this.handleCustomHandleDrag({ sourceEvent: e });
                            };
                            this._directResizeUpHandler = (e) => {
                                stopDirectResizeListeners();
                                this.endCustomHandleDrag({ sourceEvent: e });
                            };
                        } else if (!isNaN(idx) && hasCustomOverride && !hasPointOverride) {
                            this.startCustomHandleDrag(drawing, idx, { sourceEvent: event }, idx);
                            this._directResizeMoveHandler = (e) => {
                                if (this.chart && typeof this.chart.updateCrosshair === 'function') this.chart.updateCrosshair(e);
                                this.handleCustomHandleDrag({ sourceEvent: e });
                            };
                            this._directResizeUpHandler = (e) => {
                                stopDirectResizeListeners();
                                this.endCustomHandleDrag({ sourceEvent: e });
                            };
                        } else {
                            this.startHandleDrag(drawing, idx, { sourceEvent: event });
                            this._directResizeMoveHandler = (e) => {
                                if (this.chart && typeof this.chart.updateCrosshair === 'function') this.chart.updateCrosshair(e);
                                this.handleDrag({ sourceEvent: e });
                            };
                            this._directResizeUpHandler = (e) => {
                                stopDirectResizeListeners();
                                this.endHandleDrag(drawing);
                            };
                        }
                    }

                    document.addEventListener('mousemove', this._directResizeMoveHandler, true);
                    document.addEventListener('mouseup', this._directResizeUpHandler, true);
                    return;
                }

                // Pass shift key state for multi-selection
                this.selectDrawing(drawing, event.shiftKey);

                if (event.altKey && drawingsAtPoint.length > 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._startDirectMoveDrag(drawing, event);
                    return;
                }

                // If no handle was clicked, proceed with default behavior
                {
                    // Image tool: if no image yet, clicking the placeholder should open upload,
                    // and should NOT start a drag (which can trigger deselect/removal flows).
                    if (drawing.type === 'image' && (!drawing.style.imageUrl || drawing.style.imageUrl === '')) {
                        const targetEl = event.target;
                        const isImageEl = targetEl && targetEl.classList && (
                            targetEl.classList.contains('image-placeholder') ||
                            targetEl.classList.contains('image-content')
                        );
                        if (isImageEl && typeof drawing.triggerImageUpload === 'function') {
                            event.preventDefault();
                            event.stopPropagation();
                            drawing._keepEmpty = true;
                            if (!drawing._uploadDialogOpen) {
                                drawing.triggerImageUpload();
                            }
                            return;
                        }
                    }

                    // Do NOT start legacy pixel-based dragging here.
                    // Movement is handled by d3.drag() (setupDrawingDrag) to avoid competing drag systems.
                    event.preventDefault();
                    event.stopPropagation();
                }
            } else {
                // Clicked on empty space - deselect all (unless Shift is held)
                if (!event.shiftKey) {
                    // [debug removed]
                    this.deselectAll();
                }
            }
            return;
        }

        // If currently drawing polyline or path, just continue adding points
        // Right-click is used to finish the drawing (handled in handleContextMenu)

        let point = this.getDataPoint(event);
        
        const toolInfo = this.toolRegistry[this.currentTool];
        // [debug removed]
        
        if (!this.drawingState.isDrawing) {
            // [debug removed]
            this.drawingState.startDrawing(this.currentTool, toolInfo.points);
            this.riskRewardPreview = null;
            
            // Enable continuous drawing mode for freehand tools
            if (this.currentTool === 'brush' || this.currentTool === 'highlighter') {
                this.isDrawingPath = true;
                this.hidePathTooltip();
            }
            
            // Show tooltip for polyline and path (point-by-point mode)
            if (this.currentTool === 'polyline' || this.currentTool === 'path') {
                this.showPathTooltip();
            }
            
            // For dragFirstTwo tools: start drag mode for first two points
            if (toolInfo && toolInfo.dragFirstTwo) {
                this.isDraggingFirstTwo = true;
                this.dragFirstTwoStart = { ...point };
                this.dragFirstTwoStartScreen = {
                    x: Number(event.clientX),
                    y: Number(event.clientY)
                };
            }
        }
        
        // Apply Shift key angle constraint for supported tools when placing second+ point
        if (event.shiftKey && this.angleSnapTools.includes(this.currentTool) && this.drawingState.tempPoints.length > 0) {
            const referencePoint = this.drawingState.tempPoints[this.drawingState.tempPoints.length - 1];
            point = this.constrainToAngle(referencePoint, point);
        }
        
        // TradingView-style: Parallel channel 3rd point moves perpendicular to baseline
        if (this.currentTool === 'parallel-channel' && this.drawingState.tempPoints.length === 2) {
            const p0 = this.drawingState.tempPoints[0];
            const p1 = this.drawingState.tempPoints[1];
            const baseX = p1.x - p0.x;
            const baseY = p1.y - p0.y;
            const baseLen = Math.sqrt(baseX * baseX + baseY * baseY);
            
            if (baseLen > 0) {
                // Perpendicular unit vector
                const perpX = -baseY / baseLen;
                const perpY = baseX / baseLen;
                // Project mouse onto perpendicular direction
                const toMouseX = point.x - p0.x;
                const toMouseY = point.y - p0.y;
                const perpDist = toMouseX * perpX + toMouseY * perpY;
                point = { x: p0.x + perpX * perpDist, y: p0.y + perpY * perpDist };
            } else {
                point = { x: p0.x, y: point.y };
            }
        }
        
        // Flat-top-bottom: Third point locked vertically (same X as point 2, can move up/down)
        if (this.currentTool === 'flat-top-bottom' && this.drawingState.tempPoints.length === 2) {
            const p2 = this.drawingState.tempPoints[1];
            point = { x: p2.x, y: point.y };
        }
        
        // Disjoint-channel: After 2nd click, constrain third point and finalize
        if (this.currentTool === 'disjoint-channel' && this.drawingState.tempPoints.length === 2) {
            const p0 = this.drawingState.tempPoints[0];
            // Apply same constraint as preview: keep X same as first point
            point = { x: p0.x, y: point.y };
            // Auto-add the third point and finalize
            this.drawingState.addPoint(point);
            this.finalizeDrawing();
            return;
        }

        if (this.currentTool === 'date-price-range' && this.drawingState.tempPoints.length > 0) {
            const anchorPoint = this.drawingState.tempPoints[0];
            const rangeMode = this.getRangeToolMode();
            point = this.constrainDatePriceRangePoint(point, anchorPoint, rangeMode);
        }
        
        const isComplete = this.drawingState.addPoint(point);
        // [debug removed]
        
        // [debug removed]
        if (!toolInfo) {
            // [debug removed]
            this.updateTempDrawing();
        } else if (toolInfo.dragPreview) {
            // [debug removed]
            if (this.drawingState.tempPoints.length === 1) {
                const entry = { ...point };
                // [debug removed]
                const defaults = this.buildDefaultRiskReward(entry, this.currentTool === 'long-position');
                // [debug removed]
                this.riskRewardPreview = {
                    entry,
                    tool: this.currentTool,
                    previewPoints: defaults
                };
                this.drawingState.tempPoints = defaults.map(p => ({ ...p }));
                this.updateTempDrawing(defaults);
                // [debug removed]
                this.finalizeDrawing();
                return;
            }
        } else {
            // [debug removed]
            this.updateTempDrawing();
        }
        
        if (isComplete) {
            // [debug removed]
            this.finalizeDrawing();
        } else {
            // [debug removed]
        }
    }

    /**
     * Constrain a point to snap to specific angles (0°, 45°, 90°, etc.) relative to a reference point
     * This is used when holding Shift to draw perfect lines like TradingView
     * @param {Object} referencePoint - The anchor point {x, y}
     * @param {Object} targetPoint - The point to constrain {x, y}
     * @returns {Object} - The constrained point {x, y}
     */
    constrainToAngle(referencePoint, targetPoint) {
        const fallbackSnap = () => {
            const dx = targetPoint.x - referencePoint.x;
            const dy = targetPoint.y - referencePoint.y;
            const angle = Math.atan2(dy, dx);
            const distance = Math.sqrt(dx * dx + dy * dy);
            const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            return {
                x: referencePoint.x + distance * Math.cos(snapAngle),
                y: referencePoint.y + distance * Math.sin(snapAngle)
            };
        };

        const xScale = this.chart?.xScale;
        const yScale = this.chart?.yScale;
        if (!xScale || !yScale || typeof yScale !== 'function' || typeof yScale.invert !== 'function') {
            return fallbackSnap();
        }

        const toPixelX = (x) => {
            if (this.chart && typeof this.chart.dataIndexToPixel === 'function') {
                return this.chart.dataIndexToPixel(x);
            }
            return typeof xScale === 'function' ? xScale(x) : NaN;
        };

        const toDataX = (px) => {
            if (this.chart && typeof this.chart.pixelToDataIndex === 'function') {
                return this.chart.pixelToDataIndex(px);
            }
            return typeof xScale.invert === 'function' ? xScale.invert(px) : NaN;
        };

        const refPxX = toPixelX(referencePoint.x);
        const refPxY = yScale(referencePoint.y);
        const targetPxX = toPixelX(targetPoint.x);
        const targetPxY = yScale(targetPoint.y);

        if (
            !Number.isFinite(refPxX) ||
            !Number.isFinite(refPxY) ||
            !Number.isFinite(targetPxX) ||
            !Number.isFinite(targetPxY)
        ) {
            return fallbackSnap();
        }

        const dxPx = targetPxX - refPxX;
        const dyPx = targetPxY - refPxY;
        const distancePx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

        if (!Number.isFinite(distancePx) || distancePx === 0) {
            return { ...referencePoint };
        }

        const angle = Math.atan2(dyPx, dxPx);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const snappedPxX = refPxX + distancePx * Math.cos(snapAngle);
        const snappedPxY = refPxY + distancePx * Math.sin(snapAngle);

        const snappedX = toDataX(snappedPxX);
        const snappedY = yScale.invert(snappedPxY);

        if (!Number.isFinite(snappedX) || !Number.isFinite(snappedY)) {
            return fallbackSnap();
        }

        return {
            x: snappedX,
            y: snappedY
        };
    }

    /**
     * Snap a point to the nearest candle OHLC value (magnet mode)
     * This is used when holding Ctrl/Cmd to snap to candle prices like TradingView
     * @param {Object} point - The point to snap {x, y}
     * @returns {Object} - The snapped point {x, y}
     */
    snapToCandle(point) {
        const data = this.chart.data;
        if (!data || data.length === 0) return point;
        
        // Get the candle index (round to nearest candle)
        const candleIndex = Math.round(point.x);
        
        // If cursor is outside data range, don't snap — allow free placement
        if (candleIndex < 0 || candleIndex > data.length - 1) return point;
        
        const clampedIndex = candleIndex;
        const candle = data[clampedIndex];
        
        if (!candle) return point;
        
        // Get OHLC values
        const snapTargets = [
            { price: candle.open, name: 'open' },
            { price: candle.high, name: 'high' },
            { price: candle.low, name: 'low' },
            { price: candle.close, name: 'close' }
        ];
        
        // Add indicator values if snap to indicators is enabled
        const snapToIndicators = this.snapToIndicators || this.chart?.snapToIndicators || window.snapToIndicators;
        const indicators = this.chart?.indicators;
        
        if (snapToIndicators && indicators) {
            // [debug removed]
            const activeIndicators = indicators.active || [];
            const indicatorData = indicators.data || {};
            
            for (const ind of activeIndicators) {
                if (!ind) continue;
                // Only snap to overlay indicators (ones on the main chart)
                if (ind.overlay === false) continue;
                
                const indData = indicatorData[ind.id];
                if (!indData) {
                    // [debug removed]
                    continue;
                }
                
                // [debug removed]
                
                // Handle different indicator data formats
                if (ind.type === 'bb' || ind.type === 'bollinger') {
                    // Bollinger Bands have upper, middle, lower
                    if (indData.upper && indData.upper[clampedIndex] !== undefined) {
                        snapTargets.push({ price: indData.upper[clampedIndex], name: `${ind.name} Upper` });
                    }
                    if (indData.middle && indData.middle[clampedIndex] !== undefined) {
                        snapTargets.push({ price: indData.middle[clampedIndex], name: `${ind.name} Middle` });
                    }
                    if (indData.lower && indData.lower[clampedIndex] !== undefined) {
                        snapTargets.push({ price: indData.lower[clampedIndex], name: `${ind.name} Lower` });
                    }
                } else if (Array.isArray(indData)) {
                    // Simple line indicators (SMA, EMA, WMA, VWAP, etc.)
                    const value = indData[clampedIndex];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        snapTargets.push({ price: value, name: ind.name });
                        // [debug removed]
                    }
                } else if (typeof indData === 'object' && indData.values) {
                    // Some indicators might have a values array
                    const value = indData.values[clampedIndex];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        snapTargets.push({ price: value, name: ind.name });
                    }
                }
            }
        }
        
        // Find the nearest value to the mouse Y position
        let nearestPrice = point.y;
        let nearestName = '';
        let minDistance = Infinity;
        
        for (const level of snapTargets) {
            if (level.price === undefined || level.price === null || isNaN(level.price)) continue;
            const distance = Math.abs(level.price - point.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestPrice = level.price;
                nearestName = level.name;
            }
        }
        
        // [debug removed]
        
        return {
            x: clampedIndex,
            y: nearestPrice
        };
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(event) {
        // Track last mouse position for Shift-release preview refresh
        if (this.currentTool && this.drawingState && this.drawingState.isDrawing) {
            this._lastMouseEvent = event;
        }

        // Always keep crosshair visible when a tool is active, drawing is selected, or dragging
        if (this.chart && typeof this.chart.updateCrosshair === 'function' &&
            (this.currentTool || this.selectedDrawing || this.isDragging || this.isDrawing || this.isResizing)) {
            this.chart.updateCrosshair(event);
        }
        
        // Handle rectangular selection
        if (this.isRectSelecting) {
            this.updateRectangularSelection(event);
            return;
        }
        
        // Handle path tool continuous drawing
        if (this.isDrawingPath && this.drawingState.isDrawing) {
            const point = this.getDataPoint(event);
            this.drawingState.addPoint(point);
            this.updateTempDrawing();
            return;
        }
        
        // Handle dragging - use pixel-based transform for smooth movement
        if (this.isDragging && this.draggingDrawing && this.dragStartScreen) {
            // If mouse button is no longer pressed (e.g. mouseup happened outside SVG), end drag.
            // This prevents drawings from "sticking" to the cursor.
            if (event.buttons !== undefined && event.buttons === 0) {
                this.endDrag();
                return;
            }
            if (event.buttons !== undefined && (event.buttons & 1) === 0) {
                return;
            }
            const svgRect = this.svg.node().getBoundingClientRect();
            const currentScreenX = event.clientX - svgRect.left;
            const currentScreenY = event.clientY - svgRect.top;
            
            // Calculate pixel delta
            const pixelDx = currentScreenX - this.dragStartScreen.x;
            const pixelDy = currentScreenY - this.dragStartScreen.y;
            
            if (this.draggingMultiple && this.multiDragStartPositions) {
                // Move all selected drawings with pixel-based transform
                this.multiDragStartPositions.forEach(({ drawing, startTransform }) => {
                    if (drawing.group) {
                        const sx = (startTransform && Number.isFinite(startTransform.x)) ? startTransform.x : 0;
                        const sy = (startTransform && Number.isFinite(startTransform.y)) ? startTransform.y : 0;
                        drawing.group.attr('transform', `translate(${sx + pixelDx}, ${sy + pixelDy})`);
                    }
                });
            } else {
                // Move single drawing with pixel-based transform
                if (this.draggingDrawing.group && this.dragStartOriginalPos) {
                    const newX = this.dragStartOriginalPos.x + pixelDx;
                    const newY = this.dragStartOriginalPos.y + pixelDy;
                    this.draggingDrawing.group.attr('transform', `translate(${newX}, ${newY})`);
                }
            }
            return;
        }
        
        // Handle resizing
        if (this.isResizing && this.resizingDrawing) {
            if (event.buttons !== undefined && event.buttons === 0) {
                this.isResizing = false;
                this.resizingDrawing = null;
                this.resizingPointIndex = null;
                return;
            }
            const currentPoint = this.getDataPoint(event, this.resizingDrawing ? this.resizingDrawing.type : null);
            let handledByDrawing = false;
            if (typeof this.resizingDrawing.onPointHandleDrag === 'function') {
                handledByDrawing = this.resizingDrawing.onPointHandleDrag(this.resizingPointIndex, {
                    point: currentPoint,
                    scales: {
                        xScale: this.chart.xScale,
                        yScale: this.chart.yScale,
                        chart: this.chart
                    }
                }) === true;
            }

            if (!handledByDrawing) {
                this.resizingDrawing.points[this.resizingPointIndex] = currentPoint;
                this.resizingDrawing.meta.updatedAt = Date.now();
            }

            this.scheduleRenderDrawing(this.resizingDrawing);
            return;
        }
        
        // Handle custom handle dragging (for special resize handles)
        if (this.isCustomHandleDragging && this.customHandleDraggingDrawing) {
            if (event.buttons !== undefined && event.buttons === 0) {
                this.isCustomHandleDragging = false;
                this.customHandleDraggingDrawing = null;
                this.customHandleRole = null;
                return;
            }
            const svgRect = this.svg.node().getBoundingClientRect();
            const screenX = event.clientX - svgRect.left;
            const screenY = event.clientY - svgRect.top;
            const dataPoint = this.getDataPoint(event);
            
            const context = {
                screen: { x: screenX, y: screenY },
                data: dataPoint
            };
            
            if (typeof this.customHandleDraggingDrawing.handleCustomHandleDrag === 'function') {
                const handled = this.customHandleDraggingDrawing.handleCustomHandleDrag(
                    this.customHandleRole,
                    context
                );
                if (handled) {
                    this.scheduleRenderDrawing(this.customHandleDraggingDrawing);
                }
            }
            return;
        }
        
        // Check for line proximity cursor when no tool is active
        if (!this.currentTool && !this.drawingState.isDrawing) {
            this.checkDrawingProximity(event);
        }
        
        // Handle other tools' preview
        if (!this.currentTool || !this.drawingState.isDrawing) return;
        
        const toolInfo = this.toolRegistry[this.currentTool];
        let point = this.getDataPoint(event);
        
        // Apply Shift key angle constraint for supported tools
        if (event.shiftKey && this.angleSnapTools.includes(this.currentTool) && this.drawingState.tempPoints.length > 0) {
            const referencePoint = this.drawingState.tempPoints[this.drawingState.tempPoints.length - 1];
            point = this.constrainToAngle(referencePoint, point);
        }
        
        // TradingView-style: Parallel channel 3rd point preview moves perpendicular to baseline
        if (this.currentTool === 'parallel-channel' && this.drawingState.tempPoints.length === 2) {
            const p0 = this.drawingState.tempPoints[0];
            const p1 = this.drawingState.tempPoints[1];
            const baseX = p1.x - p0.x;
            const baseY = p1.y - p0.y;
            const baseLen = Math.sqrt(baseX * baseX + baseY * baseY);
            
            if (baseLen > 0) {
                // Perpendicular unit vector
                const perpX = -baseY / baseLen;
                const perpY = baseX / baseLen;
                // Project mouse onto perpendicular direction
                const toMouseX = point.x - p0.x;
                const toMouseY = point.y - p0.y;
                const perpDist = toMouseX * perpX + toMouseY * perpY;
                point = { x: p0.x + perpX * perpDist, y: p0.y + perpY * perpDist };
            } else {
                point = { x: p0.x, y: point.y };
            }
        }
        
        // Flat-top-bottom: Third point preview locked vertically (same X as point 2, can move up/down)
        if (this.currentTool === 'flat-top-bottom' && this.drawingState.tempPoints.length === 2) {
            const p2 = this.drawingState.tempPoints[1];
            point = { x: p2.x, y: point.y };
        }
        
        // Disjoint-channel: Third point preview follows mouse Y position closely
        if (this.currentTool === 'disjoint-channel' && this.drawingState.tempPoints.length === 2) {
            const p0 = this.drawingState.tempPoints[0];
            // Keep X same as first point, but Y follows mouse closely
            point = { x: p0.x, y: point.y };
        }

        if (this.currentTool === 'date-price-range' && this.drawingState.tempPoints.length > 0) {
            const anchorPoint = this.drawingState.tempPoints[0];
            const rangeMode = this.getRangeToolMode();
            point = this.constrainDatePriceRangePoint(point, anchorPoint, rangeMode);
        }
        
        if (
            toolInfo &&
            toolInfo.dragPreview &&
            this.riskRewardPreview &&
            this.drawingState.tempPoints.length >= 1
        ) {
            const previewPoints = this.buildRiskRewardPoints(
                this.riskRewardPreview.entry,
                this.getRiskRewardPreviewPoint(this.riskRewardPreview.entry, point, this.currentTool === 'long-position'),
                this.currentTool === 'long-position'
            );
            this.riskRewardPreview.previewPoints = previewPoints;
            this.updateTempDrawing(previewPoints);
            return;
        }
        
        // Create temp preview with current points + mouse position
        const previewPoints = [...this.drawingState.tempPoints, point];
        this.updateTempDrawing(previewPoints);
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp(event) {
        // Handle rectangular selection completion
        if (this.isRectSelecting) {
            this.completeRectangularSelection();
            return;
        }
        
        // Handle path tool completion
        if (this.isDrawingPath) {
            this.isDrawingPath = false;
            this.hidePathTooltip();
            if (this.drawingState.tempPoints.length > 1) {
                this.finalizeDrawing();
            } else {
                const isPersistentFreehandTool = this.currentTool === 'brush' || this.currentTool === 'highlighter';
                const hasSingleTapPoint = this.drawingState.tempPoints.length === 1;
                if (isPersistentFreehandTool && hasSingleTapPoint) {
                    // TradingView-like tap: persist a point for brush/highlighter on single click.
                    const tapPoint = this.drawingState.tempPoints[0];
                    if (tapPoint && Number.isFinite(tapPoint.x) && Number.isFinite(tapPoint.y)) {
                        this.drawingState.tempPoints = [tapPoint, { ...tapPoint }];
                        this.finalizeDrawing();
                    } else {
                        this.tempGroup.selectAll('*').remove();
                        this.drawingState.reset();
                        this.riskRewardPreview = null;
                    }
                } else if (isPersistentFreehandTool) {
                    // Keep brush/highlighter active after a tap with no valid point.
                    this.tempGroup.selectAll('*').remove();
                    this.drawingState.reset();
                    this.riskRewardPreview = null;
                } else {
                    this.cancelDrawing();
                }
            }
            return;
        }
        
        // Handle dragFirstTwo tool - on release, set point 2 and wait for point 3
        if (this.currentTool && this.isDraggingFirstTwo) {
            const toolInfo = this.toolRegistry[this.currentTool];
            if (toolInfo && toolInfo.dragFirstTwo && this.drawingState.tempPoints.length === 1) {
                const supportsClickAndDragPlacement = this.isCandleBoundTool(this.currentTool);
                if (supportsClickAndDragPlacement) {
                    const startScreen = this.dragFirstTwoStartScreen;
                    const currentScreenX = Number(event.clientX);
                    const currentScreenY = Number(event.clientY);
                    let draggedEnough = true;

                    if (
                        startScreen &&
                        Number.isFinite(startScreen.x) &&
                        Number.isFinite(startScreen.y) &&
                        Number.isFinite(currentScreenX) &&
                        Number.isFinite(currentScreenY)
                    ) {
                        const dragDistancePx = Math.hypot(currentScreenX - startScreen.x, currentScreenY - startScreen.y);
                        draggedEnough = dragDistancePx >= 4;
                    }

                    // No drag movement => keep first point and let next click place point 2.
                    if (!draggedEnough) {
                        this.isDraggingFirstTwo = false;
                        this.dragFirstTwoStart = null;
                        this.dragFirstTwoStartScreen = null;
                        this.updateTempDrawing();
                        return;
                    }
                }

                let point = this.getDataPoint(event);
                
                // Apply angle constraint if shift held
                if (event.shiftKey) {
                    const referencePoint = this.drawingState.tempPoints[0];
                    point = this.constrainToAngle(referencePoint, point);
                }
                
                // Add second point
                this.drawingState.addPoint(point);
                this.isDraggingFirstTwo = false;
                this.dragFirstTwoStart = null;
                this.dragFirstTwoStartScreen = null;
                // If the tool is a simple 2-point tool, finalize immediately on mouseup
                if (toolInfo.points === 2) {
                    this.finalizeDrawing();
                    return;
                }
                this.updateTempDrawing();
                return;
            }
        }
        
        if (this.currentTool) {
            const toolInfo = this.toolRegistry[this.currentTool];
            if (toolInfo && toolInfo.dragPreview && this.drawingState.isDrawing) {
                let preview = this.riskRewardPreview && this.riskRewardPreview.previewPoints;
                if (!preview && this.riskRewardPreview) {
                    const point = this.getDataPoint(event);
                    const isLong = this.currentTool === 'long-position';
                    const previewPoint = this.getRiskRewardPreviewPoint(this.riskRewardPreview.entry, point, isLong);
                    preview = this.buildRiskRewardPoints(this.riskRewardPreview.entry, previewPoint, isLong);
                }
                if (preview) {
                    this.drawingState.tempPoints = preview.map(p => ({ ...p }));
                    this.finalizeDrawing();
                    this.riskRewardPreview = null;
                    return;
                }
            }
        }

        // Handle drag/resize end
        if (this.isDragging) {
            this.endDrag();
        }
        if (this.isResizing) {
            this.isResizing = false;
            this.resizingDrawing = null;
            this.resizingPointIndex = null;
        }
    }

    /**
     * Handle context menu (right-click)
     */
    handleContextMenu(event) {
        // Don't show context menu during rectangular selection
        if (this.isRectSelecting) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // If chart consumed a right-drag gesture for box zoom, suppress context menu.
        if (this.chart && typeof this.chart.shouldSuppressRightClickContextMenu === 'function' && this.chart.shouldSuppressRightClickContextMenu(event)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        
        // If a persistent tool (brush/highlighter) is active, right-click deactivates it
        const persistentTools = ['brush', 'highlighter'];
        if (!this.drawingState.isDrawing && this.currentTool && persistentTools.includes(this.currentTool)) {
            // [debug removed]
            this.clearTool();
            // Update UI - remove active from all tools except the persistent cursor button
            document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tool-group-btn:not(#magnetMode):not(#magnetModeToolbar):not(#cursorTool)').forEach(b => b.classList.remove('active'));
            const cursorBtn = document.getElementById('cursorTool');
            if (cursorBtn) cursorBtn.classList.add('active');

            if (typeof window !== 'undefined' && typeof window.syncMagnetButton === 'function') {
                window.syncMagnetButton();
            }
            return;
        }
        
        // If drawing polyline or path, right-click finishes the drawing
        if ((this.currentTool === 'polyline' || this.currentTool === 'path') && this.drawingState.isDrawing) {
            this.hidePathTooltip();
            if (this.drawingState.tempPoints.length >= 2) {
                this.finalizeDrawing();
            } else {
                this.cancelDrawing();
            }
            return;
        }
        
        // For any other drawing in progress, right-click cancels it
        if (this.drawingState.isDrawing) {
            // [debug removed]
            this.cancelDrawing();
            return;
        }
        
        // Hide any existing chart context menus
        d3.selectAll('.chart-context-menu').style('visibility', 'hidden');
        
        const target = d3.select(event.target);
        
        // Get all parent drawing groups (for nested drawings)
        const allDrawingGroups = [];
        let currentNode = target.node();
        while (currentNode) {
            if (currentNode.classList && currentNode.classList.contains('drawing')) {
                allDrawingGroups.push(currentNode);
            }
            currentNode = currentNode.parentElement;
        }
        
        // Select the innermost (last in array) drawing group
        const drawingGroup = allDrawingGroups.length > 0 ? allDrawingGroups[0] : null;
        
        if (drawingGroup) {
            const drawingId = d3.select(drawingGroup).attr('data-id');
            const drawing = this.drawings.find(d => d.id === drawingId);
            
            if (drawing) {
                // [debug removed]
                this.showContextMenu(drawing, event.pageX, event.pageY);
            }
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        // Track Command/Ctrl key for multi-select hover mode
        // Note: magnetKeyHeld is no longer used for snap - event.metaKey/ctrlKey checked directly
        if (event.metaKey || event.ctrlKey) {
            this.magnetKeyHeld = true;
            // Enable Ctrl+hover to select mode (only Ctrl, not Command on Mac)
            if (event.ctrlKey && !this.currentTool) {
                this.ctrlSelectMode = true;
            }
        }
        
        // Delete key - delete selected drawing(s)
        if (event.key === 'Delete') {
            if (this.selectedDrawings.length > 0) {
                // Delete all selected drawings
                const drawingsToDelete = [...this.selectedDrawings];
                drawingsToDelete.forEach(drawing => this.deleteDrawing(drawing));
            } else if (this.selectedDrawing) {
                this.deleteDrawing(this.selectedDrawing);
            }
        }
        
        // Escape key - cancel current drawing or deselect
        if (event.key === 'Escape') {
            if (this.drawingState.isDrawing) {
                this.cancelDrawing();
            } else {
                this.deselectAll();
                this.clearTool();
            }
        }
        
        // Ctrl+Z - Undo (future feature)
        // Ctrl+Y - Redo (future feature)
    }

    /**
     * Handle key up events
     */
    handleKeyUp(event) {
        // Release Command/Ctrl key - disable temporary magnet and multi-select hover mode
        if (event.key === 'Meta' || event.key === 'Control') {
            this.magnetKeyHeld = false;
            this.ctrlSelectMode = false;
        }
    }

    /**
     * Get data point from mouse event
     * Returns {x: candleIndex, y: price}
     * For freehand tools (path, brush, highlighter), uses continuous coordinates for smooth curves
     */
    getDataPoint(event, toolTypeOverride = this.currentTool) {
        let [screenX, screenY] = d3.pointer(event, this.svg.node());
        const activeToolType = toolTypeOverride || this.currentTool;

        const isResizingVolumeProfileRightBoundary = this.isVolumeProfileToolType(activeToolType)
            && !!(
                this.isResizing
                && this.resizingDrawing
                && this.isVolumeProfileToolType(this.resizingDrawing.type)
                && this.resizingPointIndex === 1
            );
        const isInteractingWithExistingVolumeProfile = this.isVolumeProfileToolType(activeToolType)
            && !this.currentTool;
        const isInteractingWithExistingDatePriceRange = activeToolType === 'date-price-range'
            && !this.currentTool;
        const rangeInteractionDrawing = (this.isResizing && this.resizingDrawing && this.resizingDrawing.type === 'date-price-range')
            ? this.resizingDrawing
            : ((this.isDragging && this.draggingDrawing && this.draggingDrawing.type === 'date-price-range')
                ? this.draggingDrawing
                : ((this.isCustomHandleDrag && this.customHandleDrawing && this.customHandleDrawing.type === 'date-price-range')
                    ? this.customHandleDrawing
                    : null));
        const rangeInteractionMode = isInteractingWithExistingDatePriceRange
            ? this.getRangeToolMode(rangeInteractionDrawing)
            : 'both';
        const allowRangeVerticalOverflow = isInteractingWithExistingDatePriceRange
            && rangeInteractionMode !== 'time';

        // Clamp to chart inner area so no drawing point can go outside the chart
        if (this.chart) {
            const m = this.chart.margin;
            const minX = m.l;
            const maxX = this.chart.w - m.r;
            const maxY = this.chart.h - m.b;

            // For VP right-boundary resize, allow dragging past the container edge.
            screenX = isResizingVolumeProfileRightBoundary
                ? Math.max(minX, screenX)
                : Math.max(minX, Math.min(maxX, screenX));
            screenY = (isInteractingWithExistingVolumeProfile || allowRangeVerticalOverflow)
                ? screenY
                : Math.max(0, Math.min(maxY, screenY));
        }
        
        // Preserve legacy behavior: continuous coordinates are only for actively drawn freehand tools
        const isContinuousTool = this.currentTool === 'path' || 
                                  this.currentTool === 'brush' || 
                                  this.currentTool === 'highlighter';
        
        // Pass chart instance for accurate index calculation
        // Use continuous mode for freehand tools to get smooth curves
        let point = CoordinateUtils.screenToData(screenX, screenY, {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale
        }, this.chart, isContinuousTool);
        
        // Apply magnet mode only when explicitly active (not via stuck key flag)
        // Use event.metaKey/ctrlKey directly - never rely on potentially-stuck magnetKeyHeld flag
        const keyHeld = event && (event.metaKey || event.ctrlKey);
        const effectiveMagnetMode = keyHeld ? 'strong' : this.magnetMode;
        
        const activeRole = this.resizingHandleRole || (typeof this.customHandleRole === 'string' ? this.customHandleRole : null);
        const isSideHandle = (this.isResizing || this.isCustomHandleDrag) && activeRole && activeRole.startsWith('side-');
        if (!isContinuousTool && !isSideHandle && effectiveMagnetMode && effectiveMagnetMode !== 'off') {
            point = CoordinateUtils.snapToOHLC(
                point,
                this.chart.data,
                { xScale: this.chart.xScale, yScale: this.chart.yScale },
                effectiveMagnetMode
            );
        }

        point = this.clampPointToCandleRange(point, activeToolType);
        
        return point;
    }

    isVolumeProfileToolType(toolType) {
        return toolType === 'volume-profile'
            || toolType === 'fixed-range-volume-profile'
            || toolType === 'anchored-volume-profile';
    }

    isCandleBoundTool(toolType) {
        return toolType === 'volume-profile' || toolType === 'fixed-range-volume-profile';
    }

    clampPointToCandleRange(point, toolType = this.currentTool) {
        if (!point || !this.isCandleBoundTool(toolType) || !Number.isFinite(point.x)) {
            return point;
        }

        const data = this.chart && Array.isArray(this.chart.data) ? this.chart.data : [];
        if (data.length === 0) {
            return {
                ...point,
                x: Math.round(point.x)
            };
        }

        const roundedX = Math.round(point.x);

        // Fixed range VP: allow dragging the RIGHT boundary handle into future space
        // (beyond last loaded candle), while keeping left boundary constrained.
        if (this.isVolumeProfileToolType(toolType)) {
            const isResizingVolumeProfile = !!(
                this.isResizing &&
                this.resizingDrawing &&
                this.isVolumeProfileToolType(this.resizingDrawing.type)
            );

            if (isResizingVolumeProfile && this.resizingPointIndex === 1) {
                return {
                    ...point,
                    x: Math.max(0, roundedX)
                };
            }
        }

        return {
            ...point,
            x: Math.max(0, Math.min(data.length - 1, roundedX))
        };
    }

    clampDrawingPointsToCandleRange(drawing) {
        if (!drawing || !Array.isArray(drawing.points) || !this.isCandleBoundTool(drawing.type)) {
            return;
        }

        drawing.points = drawing.points.map(point => this.clampPointToCandleRange(point, drawing.type));
    }


    normalizeRangeMode(mode) {
        const value = String(mode || '').toLowerCase().trim();
        if (value === 'price') return 'price';
        if (value === 'time' || value === 'date') return 'time';
        return 'both';
    }

    getRangeToolMode(drawing = null) {
        if (drawing && drawing.type === 'date-price-range') {
            return this.normalizeRangeMode(drawing.style && drawing.style.rangeMode);
        }

        if (this.currentTool === 'date-price-range') {
            const savedStyle = this.getSavedToolStyle('date-price-range') || {};
            return this.normalizeRangeMode(savedStyle.rangeMode);
        }

        return 'both';
    }

    constrainDatePriceRangePoint(point, anchorPoint, mode = 'both') {
        if (!point || !anchorPoint) return point;

        const normalizedMode = this.normalizeRangeMode(mode);
        if (normalizedMode === 'price') {
            return {
                ...point,
                x: anchorPoint.x
            };
        }

        if (normalizedMode === 'time') {
            return {
                ...point,
                y: anchorPoint.y
            };
        }

        return point;
    }

    getConstrainedDragDelta(drawing, dx, dy) {
        const mode = this.getRangeToolMode(drawing);
        if (mode === 'price') {
            return { dx: 0, dy };
        }
        if (mode === 'time') {
            return { dx, dy: 0 };
        }
        return { dx, dy };
    }

    /**
     * Update temporary drawing preview
     */
    updateTempDrawing(points = null) {
        try {
            this.tempGroup.selectAll('*').remove();
            
            const previewPoints = points || this.drawingState.tempPoints;
            if (previewPoints.length === 0) return;
            
            const toolInfo = this.toolRegistry[this.currentTool];
            if (!toolInfo) return;
            
            // Create temporary instance for preview
            if (this.currentTool === 'emoji') {
                const options = this.currentEmojiOptions || this.pendingEmojiOptions || {};
                const previewOptions = { ...options, opacity: 0.85 };
                const tempEmoji = new EmojiStickerTool(previewPoints, previewOptions);
                tempEmoji.render(this.tempGroup, {
                    xScale: this.chart.xScale,
                    yScale: this.chart.yScale,
                    chart: this.chart
                });
                return;
            }

            // Use saved style for preview to match final drawing
            const savedStyle = this.getSavedToolStyle(this.currentTool) || {};
            const styleOverrides = {
                ...savedStyle,
                opacity: 0.85
            };

            if (this.currentTool === 'short-position') {
                styleOverrides.orientation = 'short';
            }

            const tempDrawing = new toolInfo.class(previewPoints, styleOverrides);
            
            // Apply saved style to preview for consistent appearance
            this.applySavedStyle(tempDrawing);
            
            // Pass isPreview flag for regression trend to show simple line while dragging
            const isPreview = this.drawingState.isDrawing;
            
            if (tempDrawing && typeof tempDrawing.render === 'function') {
                tempDrawing.render(this.tempGroup, {
                    xScale: this.chart.xScale,
                    yScale: this.chart.yScale,
                    chart: this.chart  // Pass chart for dataIndexToPixel
                }, isPreview);
            }
            
            // Disable pointer-events on preview so clicks pass through to SVG for adding more points
            this.tempGroup.selectAll('*').style('pointer-events', 'none');
        } catch (e) {
            console.error('❌ Drawing preview render failed for tool:', this.currentTool, e);
        }
    }

    /**
     * Finalize and save current drawing
     */
    finalizeDrawing() {
        // [debug removed]
        const toolInfo = this.toolRegistry[this.currentTool];
        if (!toolInfo) {
            // [debug removed]
            return;
        }

        // [debug removed]
        // Create the actual drawing
        const args = [this.drawingState.tempPoints];
        if (this.currentTool === 'emoji') {
            const options = this.currentEmojiOptions || this.pendingEmojiOptions || {};
            args.push(options);
        }

        const drawing = new toolInfo.class(...args);
        
        // Apply saved style for this tool type
        this.applySavedStyle(drawing);

        // For image tools, don't save if no image is uploaded
        if (this.currentTool === 'image' && 
            (!drawing.style.imageUrl || drawing.style.imageUrl === '')) {
            // [debug removed]
            // Add to drawings temporarily so it can be selected and edited
            drawing.chart = this.chart;
            // Mark as an empty image that can be auto-removed on deselect UNTIL the user opens settings.
            drawing._autoRemoveIfEmpty = true;
            drawing._keepEmpty = false;
            this.drawings.push(drawing);
            this.renderDrawing(drawing);
            // Select it so user can upload image via settings
            this.selectDrawing(drawing);
            
            // Clear temp drawing
            this.tempGroup.selectAll('*').remove();
            this.drawingState.reset();
            this.riskRewardPreview = null;
            this.isDraggingFirstTwo = false;
            this.dragFirstTwoStart = null;
            this.dragFirstTwoStartScreen = null;
            
            // Clear the tool so button deactivates
            this.clearTool();
            
            // Don't save to localStorage yet
            return;
        }

        // For text tools, prompt for text input
        if (this.currentTool === 'text' || this.currentTool === 'notebox') {
            const point = this.drawingState.tempPoints[0];
            // Use dataIndexToPixel for accurate positioning
            const x = this.chart.dataIndexToPixel ? 
                this.chart.dataIndexToPixel(point.x) : this.chart.xScale(point.x);
            const y = this.chart.yScale(point.y);

            // InlineTextEditor is positioned in page coordinates (absolute in body).
            // Convert SVG pixel coords to page coords so the editor appears exactly where the drawing will be.
            let editX = x;
            let editY = y;
            try {
                const svgNode = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : this.svg;
                if (svgNode && typeof svgNode.createSVGPoint === 'function' && typeof svgNode.getScreenCTM === 'function') {
                    const ctm = svgNode.getScreenCTM();
                    if (ctm) {
                        const pt = svgNode.createSVGPoint();
                        pt.x = x;
                        pt.y = y;
                        const screenPt = pt.matrixTransform(ctm);
                        editX = screenPt.x + window.scrollX;
                        editY = screenPt.y + window.scrollY;
                    }
                } else if (svgNode && typeof svgNode.getBoundingClientRect === 'function') {
                    const rect = svgNode.getBoundingClientRect();
                    editX = rect.left + window.scrollX + x;
                    editY = rect.top + window.scrollY + y;
                }
            } catch (e) {
                editX = x;
                editY = y;
            }

            const isNoteBox = this.currentTool === 'notebox';
            const defaultText = isNoteBox ? 'Note' : 'Text';
            const existingText = drawing.text && drawing.text !== defaultText ? drawing.text : '';
            const placeholder = isNoteBox ? 'Enter note text…' : 'Enter text…';

            this.textEditor.show(editX, editY, existingText, (text) => {
                const normalized = (text || '').replace(/\r\n/g, '\n');
                if (normalized && normalized.trim()) {
                    drawing.setText(normalized);
                    this.addDrawing(drawing);
                }
            }, placeholder, {
                hideSelector: '.temp-drawing text'
            });
        } 
        else {
            this.addDrawing(drawing);
        }
        
        // Clear temp drawing
        this.tempGroup.selectAll('*').remove();
        this.drawingState.reset();
        this.riskRewardPreview = null;
        this.isDraggingFirstTwo = false;  // Reset for next drawing
        this.dragFirstTwoStart = null;
        this.dragFirstTwoStartScreen = null;
        
        // Auto-deselect tool after drawing, with exceptions:
        // - Keep Drawing Mode: keep any tool active
        // - Brush & Highlighter: always behave like persistent drawing tools
        const persistentTools = ['brush', 'highlighter'];
        const shouldKeepTool = this.keepDrawingMode || persistentTools.includes(this.currentTool);

        if (!shouldKeepTool) {
            this.clearTool();
            // Update UI - remove active from all tools except the persistent cursor button
            document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tool-group-btn:not(#magnetMode):not(#magnetModeToolbar):not(#cursorTool)').forEach(b => b.classList.remove('active'));
            const cursorBtn = document.getElementById('cursorTool');
            if (cursorBtn) cursorBtn.classList.add('active');

            if (typeof window !== 'undefined' && typeof window.syncMagnetButton === 'function') {
                window.syncMagnetButton();
            }
            // Don't set cursor tool as active - let user click it to reactivate the last tool
        }
    }

    /**
     * Cancel current drawing
     */
    cancelDrawing() {
        this.tempGroup.selectAll('*').remove();
        this.drawingState.reset();
        this.riskRewardPreview = null;
        this.hidePathTooltip();
        
        // Reset continuous drawing flags
        this.isDrawingPath = false;
        this.isDraggingFirstTwo = false;
        
        // Deselect the current tool
        this.clearTool();
        
        // Reset SVG pointer-events to allow chart panning
        this.svg.style('pointer-events', 'none');
    }

    buildRiskRewardPoints(entry, current, isLong, rewardRatio = null) {
        const magnitude = Math.max(Math.abs(current.y - entry.y), 0.0000001);
        const ratioSource = rewardRatio !== null && rewardRatio !== undefined ? rewardRatio : current && current.rewardRatio;
        const ratioValue = Number(ratioSource);
        const normalizedRatio = Number.isFinite(ratioValue) && ratioValue > 0 ? ratioValue : 2;
        const clampedRatio = Math.max(0.01, Math.min(100, normalizedRatio));
        const stopY = isLong ? entry.y - magnitude : entry.y + magnitude;
        const targetY = isLong
            ? entry.y + (magnitude * clampedRatio)
            : entry.y - (magnitude * clampedRatio);
        const entryX = entry.x;

        return [
            { x: entryX, y: entry.y },
            { x: entryX, y: stopY },
            { x: entryX, y: targetY }
        ];
    }

    getPositionRiskDefaults(toolType) {
        const savedRisk = this.getSavedToolRiskSettings(toolType) || {};

        const parsedRatio = Number(savedRisk.rewardRatio);
        const rewardRatio = Number.isFinite(parsedRatio) && parsedRatio > 0
            ? Math.max(0.01, Math.min(100, parsedRatio))
            : 2;

        const parsedStopOffset = Number(savedRisk.stopTicks);
        const stopOffset = Number.isFinite(parsedStopOffset) && parsedStopOffset > 0
            ? Math.abs(parsedStopOffset)
            : null;

        return { rewardRatio, stopOffset };
    }

    capturePositionRiskSettings(drawing) {
        if (!drawing || (drawing.type !== 'long-position' && drawing.type !== 'short-position')) {
            return null;
        }

        if (typeof drawing.ensureRiskSettings === 'function') {
            drawing.ensureRiskSettings();
        }

        const existingRisk = (drawing.meta && drawing.meta.risk) ? drawing.meta.risk : {};
        const entry = Number(drawing.points && drawing.points[0] ? drawing.points[0].y : NaN);
        const stop = Number(drawing.points && drawing.points[1] ? drawing.points[1].y : NaN);
        const target = Number(drawing.points && drawing.points[2] ? drawing.points[2].y : NaN);

        const stopTicks = Number.isFinite(entry) && Number.isFinite(stop)
            ? Math.abs(entry - stop)
            : Number(existingRisk.stopTicks);
        const profitTicks = Number.isFinite(entry) && Number.isFinite(target)
            ? Math.abs(target - entry)
            : Number(existingRisk.profitTicks);

        const computedRatio = Number.isFinite(stopTicks) && stopTicks > 0 && Number.isFinite(profitTicks)
            ? (profitTicks / stopTicks)
            : Number(existingRisk.rewardRatio);

        return {
            riskMode: existingRisk.riskMode,
            riskPercent: existingRisk.riskPercent,
            riskAmountUSD: existingRisk.riskAmountUSD,
            lotSize: existingRisk.lotSize,
            leverage: existingRisk.leverage,
            rewardRatio: computedRatio,
            stopTicks,
            profitTicks
        };
    }

    persistPositionToolDefaults(drawing) {
        if (!drawing || (drawing.type !== 'long-position' && drawing.type !== 'short-position')) {
            return;
        }

        const riskSettings = this.capturePositionRiskSettings(drawing);
        if (!riskSettings) return;

        this.saveToolStyle(drawing.type, drawing.style || {}, { riskSettings });
    }

    buildDefaultRiskReward(entry, isLong) {
        const chart = this.chart;
        const toolType = isLong ? 'long-position' : 'short-position';
        const positionDefaults = this.getPositionRiskDefaults(toolType);

        // Calculate a reasonable default size based on visible price range
        let stopOffset;
        if (positionDefaults.stopOffset) {
            stopOffset = positionDefaults.stopOffset;
        } else if (chart && chart.yScale) {
            const domain = chart.yScale.domain();
            const priceRange = Math.abs(domain[1] - domain[0]);
            stopOffset = priceRange * 0.05; // 5% of visible range
        } else {
            const priceStep = chart && chart.priceIncrement ? chart.priceIncrement : 0.0001;
            stopOffset = priceStep * 100; // Fallback to larger default
        }

        const priceStep = chart && chart.priceIncrement ? chart.priceIncrement : 0.0001;
        stopOffset = Math.max(Math.abs(stopOffset), priceStep * 5);

        const targetOffset = stopOffset * positionDefaults.rewardRatio;
        const stopPrice = isLong ? entry.y - stopOffset : entry.y + stopOffset;
        const targetPrice = isLong ? entry.y + targetOffset : entry.y - targetOffset;
        // [debug removed]
        return [
            { x: entry.x, y: entry.y },
            { x: entry.x, y: stopPrice },
            { x: entry.x, y: targetPrice }
        ];
    }

    getRiskRewardPreviewPoint(entry, currentPoint, isLong) {
        const chart = this.chart;
        const toolType = isLong ? 'long-position' : 'short-position';
        const positionDefaults = this.getPositionRiskDefaults(toolType);
        const priceStep = chart && chart.priceIncrement ? chart.priceIncrement : 0.0001;
        const delta = Math.max(Math.abs(currentPoint.y - entry.y), priceStep * 5);
        const stopPrice = isLong ? entry.y - delta : entry.y + delta;
        return {
            x: entry.x,
            y: stopPrice,
            rewardRatio: positionDefaults.rewardRatio
        };
    }

    /**
     * Add a completed drawing
     */
    addDrawing(drawing) {
        // Set chart reference for timestamp conversion
        drawing.chart = this.chart;
        
        this.drawings.push(drawing);
        this.renderDrawing(drawing);
        this.persistPositionToolDefaults(drawing);
        this.saveDrawings();
        
        // Record for undo/redo
        if (this.history) {
            this.history.recordAdd(drawing);
        }
        
        // Broadcast to other panels in real-time
        if (this.chart.broadcastDrawingChange) {
            this.chart.broadcastDrawingChange('add', drawing);
        }
        
        // Refresh object tree if available
        if (this.objectTreeManager) {
            this.objectTreeManager.refresh();
        }
        
        // Auto-select the newly drawn shape to show resize handles immediately
        // Deselect all other drawings without triggering full redraw
        this.drawings.forEach(d => {
            if (d !== drawing) d.deselect();
        });
        this.toolbar.hide();
        
        // Select the new drawing and re-render to show handles
        drawing.select();
        this.selectedDrawing = drawing;
        this.selectedDrawings = [drawing];  // Update selectedDrawings array for deselect to work
        this.renderDrawing(drawing);

        // Show toolbar immediately after drawing is completed
        if (drawing.group && this.toolbar) {
            try {
                const node = drawing.group.node();
                const bbox = node ? node.getBBox() : null;
                if (bbox && bbox.width > 0) {
                    const svgRect = this.svg.node().getBoundingClientRect();
                    const x = svgRect.left + bbox.x + (bbox.width / 2);
                    const y = svgRect.top + bbox.y;
                    this.toolbar.show(drawing, x, y);
                }
            } catch (e) {}
        }
        
        // [debug removed]
    }

    /**
     * Render a single drawing
     */
    renderDrawing(drawing) {
        if (!drawing) return;

        const trackedDrawing = this.drawings.find(d => d === drawing || (d && drawing && d.id === drawing.id));
        if (!trackedDrawing) {
            if (drawing.group) {
                drawing.group.remove();
                drawing.group = null;
            }
            return;
        }
        drawing = trackedDrawing;

        // Ensure scales are available
        if (!this.chart.xScale || !this.chart.yScale) {
            console.warn('⚠️ Cannot render drawing - scales not ready');
            return;
        }
        
        // [debug removed]
        
        // Handle visibility
        if (drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) {
            // Hide the drawing
            if (drawing.group) {
                drawing.group.style('display', 'none');
            }
            if (typeof drawing.hideAxisHighlights === 'function') {
                drawing.hideAxisHighlights();
            }
            return;
        }
        
        // Check timeframe visibility (legacy per-tf and new _ranges)
        if (!this._isVisibleForCurrentTimeframe(drawing)) {
            if (drawing.group) {
                drawing.group.style('display', 'none');
            }
            if (typeof drawing.hideAxisHighlights === 'function') {
                drawing.hideAxisHighlights();
            }
            return;
        }
        
        // Show the drawing
        if (drawing.group) {
            drawing.group.style('display', null);
        }
        
        // Render with current scales AND chart instance for accurate pixel calculation
        drawing.render(this.drawingsGroup, {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale,
            chart: this.chart,  // Pass chart for dataIndexToPixel method
            labelsGroup: this.labelsGroup  // Unclipped group for text labels
        });
        
        // Always show axis highlights (labels visible regardless of selection state)
        if (typeof drawing.showAxisHighlights === 'function') {
            drawing.showAxisHighlights();
        }
        
        // Setup interaction handlers
        this.setupDrawingInteraction(drawing);
    }

    /**
     * Setup interaction for a drawing
     */
    setupDrawingInteraction(drawing) {
        if (!drawing.group) return;
        
        const self = this;
        
        drawing.group.style('pointer-events', 'none');
        
        // Enable pointer events on STROKE elements only (not fills)
        // For lines and text, use 'all'; for shape borders, use 'stroke' to ONLY detect stroke clicks
        drawing.group.selectAll('line:not(.shape-border-hit), polyline, text, circle:not(.pin-center-hole), ellipse, .resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle, .image-content, .image-placeholder')
            .style('pointer-events', 'all');
        
        // Shape borders use 'stroke' - ONLY responds to clicks on the actual stroke path
        drawing.group.selectAll('.shape-border:not(.shape-border-hit)')
            .style('pointer-events', 'stroke');
        
        // Hit areas also use stroke
        drawing.group.selectAll('.shape-border-hit:not(.text-body-hit)')
            .style('pointer-events', 'stroke');

        // Text/pin body hit areas should stay fully interactive (middle + border drag zone)
        drawing.group.selectAll('.text-body-hit, .pin-body-hit')
            .style('pointer-events', 'all');

        // Arrow tools: allow fill hit areas to be interactive
        drawing.group.selectAll('.arrow-fill-hit')
            .style('pointer-events', 'all');
        
        // Paths that are NOT fills should be clickable on stroke
        drawing.group.selectAll('path:not(.shape-fill):not(.shape-border):not(.arrow-fill-hit):not(.pin-body-hit), polygon:not(.shape-fill):not(.upper-fill):not(.lower-fill)')
            .style('pointer-events', 'stroke');

        // Anchored VWAP: allow selection from curve, but keep drag interaction on anchor handles.
        if (drawing.type === 'anchored-vwap') {
            drawing.group.selectAll('.anchored-vwap-curve')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');
            drawing.group.selectAll('.anchored-vwap-label')
                .style('pointer-events', 'none');
            drawing.group.selectAll('.anchored-vwap-anchor, .anchored-vwap-anchor-hit')
                .style('pointer-events', 'all')
                .style('cursor', 'ew-resize');
        }

        // Volume Profile tools: boundaries and level lines remain selectable,
        // but level lines should not start dragging.
        if (this.isVolumeProfileToolType(drawing.type)) {
            drawing.group.selectAll('line')
                .style('pointer-events', 'none')
                .style('cursor', 'default');

            drawing.group.selectAll('.volume-profile-boundary-hit')
                .style('pointer-events', 'stroke')
                .style('cursor', 'ew-resize');

            drawing.group.selectAll('.volume-profile-boundary')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            drawing.group.selectAll('.volume-profile-level-line')
                .style('pointer-events', 'stroke')
                .style('cursor', 'move');

            drawing.group.selectAll('.resize-handle, .resize-handle-hit, .resize-handle-group')
                .style('pointer-events', 'all');

            drawing.group.selectAll('.volume-profile-values-label')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        }
        
        // IMPORTANT: Ensure ALL fill elements have pointer-events disabled
        drawing.group.selectAll('.shape-fill, .upper-fill, .lower-fill')
            .style('pointer-events', 'none');
        
        // Explicitly disable pointer-events on any ellipse/circle fill elements
        drawing.group.selectAll('ellipse.shape-fill, circle.shape-fill')
            .style('pointer-events', 'none');

        // Pin center hole should not capture hover/drag; let pin body handle interactions
        drawing.group.selectAll('.pin-center-hole')
            .style('pointer-events', 'none');
        
        // Apply locked visual state
        if (drawing.locked) {
            drawing.group.classed('locked', true);
            drawing.group.style('opacity', '0.7');
        }
        
        // Double-click detection - store on drawing object to persist across re-renders
        const DOUBLE_CLICK_DELAY = 400; // ms
        
        // Select interactive elements (borders, lines, handles) - NOT fills or hit areas
        // STROKE-ONLY: Only lines/borders are clickable, NOT filled areas
        // Exclude .inline-editable-text elements - they handle their own click/dblclick events
        const isVolumeProfileType = this.isVolumeProfileToolType(drawing.type);
        const selector = drawing.type === 'anchored-vwap'
            ? '.anchored-vwap-curve, .anchored-vwap-anchor, .anchored-vwap-anchor-hit, .resize-handle, .custom-handle'
            : isVolumeProfileType
                ? '.volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-level-line, .volume-profile-values-label, .resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle'
                : '.arrow-fill-hit, .shape-border:not(.shape-border-hit), .shape-border-hit, line:not(.shape-border-hit), path:not(.shape-fill):not(.shape-border-hit), polyline, polygon:not(.upper-fill):not(.lower-fill):not(.shape-fill), circle:not(.shape-fill), ellipse:not(.shape-fill), text:not(.inline-editable-text), .resize-handle, .custom-handle, .image-content, .image-placeholder, .note-line, .note-line-hit';
        const interactiveElements = drawing.group.selectAll(selector);

        const isEmptyImageUploadTarget = (eventTarget) => {
            if (drawing.type !== 'image') return false;
            if (drawing.style.imageUrl && drawing.style.imageUrl !== '') return false;
            if (!eventTarget || !eventTarget.classList) return false;

            return eventTarget.classList.contains('image-placeholder') ||
                eventTarget.classList.contains('image-content');
        };

        const handleEmptyImageUploadInteraction = (event) => {
            if (!isEmptyImageUploadTarget(event?.target)) return false;
            if (typeof drawing.triggerImageUpload !== 'function') return false;

            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            drawing._keepEmpty = true;

            if (!drawing._uploadDialogOpen) {
                drawing.triggerImageUpload();
            }
            return true;
        };
        
        // [debug removed]
        if (drawing.type === 'regression-trend') {
            // [debug removed]
        }
        
        // Click handler function
        const handleClick = function(event) {
            // Skip if clicking on inline-editable text (let element's own click handler work)
            const targetSel = d3.select(event.target);
            if (targetSel.classed('inline-editable-text')) {
                return; // Let the element's own click handler handle it
            }

            if (handleEmptyImageUploadInteraction(event)) {
                if (!self._drawingClickTimes) {
                    self._drawingClickTimes = {};
                }
                self._drawingClickTimes[drawing.id] = 0;
                return;
            }
            
            // [debug removed]
            
            // STROKE-ONLY CHECK: Verify click is actually on a stroke, not fill area
            const svgRect = self.svg.node().getBoundingClientRect();
            const mouseX = event.clientX - svgRect.left;
            const mouseY = event.clientY - svgRect.top;
            
            // For shapes (rectangle, triangle, ellipse, circle), verify click is on stroke
            const shapeTypes = ['rectangle', 'triangle', 'ellipse', 'circle'];
            if (shapeTypes.includes(drawing.type)) {
                const isShapeBorderHit = targetSelection.classed('shape-border-hit');
                // Use the same geometric hit-test as hover/direct-drag so the hover zone matches selection.
                const drawingsAtPoint = self.findDrawingsAtPoint(mouseX, mouseY);
                const clickedOnStroke = isShapeBorderHit || drawingsAtPoint.some(d => d && d.id === drawing.id);
                
                if (!clickedOnStroke) {
                    // [debug removed]
                    return; // Don't select - click was on fill area
                }
            }
            
            // [debug removed]
            
            // If eraser mode, delete immediately and stop
            if (self.eraserMode) {
                event.stopPropagation();
                event.preventDefault();
                // [debug removed]
                self.deleteDrawing(drawing);
                // [debug removed]
                return;
            }
            
            event.stopPropagation();
            
            const now = Date.now();
            // Store click time on manager instead of drawing to persist across re-renders
            if (!self._drawingClickTimes) {
                self._drawingClickTimes = {};
            }
            const lastClickTime = self._drawingClickTimes[drawing.id] || 0;
            const timeSinceLastClick = now - lastClickTime;
            
            // [debug removed]
            
            // Double-click detection (within 400ms)
            if (timeSinceLastClick < DOUBLE_CLICK_DELAY && timeSinceLastClick > 50) {
                // Skip if clicking on inline-editable text (let element's dblclick handler work)
                const targetSel = d3.select(event.target);
                if (targetSel.classed('inline-editable-text')) {
                    self._drawingClickTimes[drawing.id] = 0;
                    return; // Let the element's own dblclick handler handle it
                }

                if (handleEmptyImageUploadInteraction(event)) {
                    self._drawingClickTimes[drawing.id] = 0;
                    return;
                }
                
                // [debug removed]
                
                if (!drawing.locked) {
                    self.selectDrawing(drawing);
                    self.editDrawing(drawing, event.pageX, event.pageY);
                    // [debug removed]
                }
                self._drawingClickTimes[drawing.id] = 0; // Reset
                return;
            }
            
            self._drawingClickTimes[drawing.id] = now;
            
            // Single click - select (with Shift for multi-select)
            if (!self.currentTool && !drawing.locked) {
                self.selectDrawing(drawing, event.shiftKey);
            }
        };
        
        // Double-click handler
        const handleDblClick = function(event) {
            // Skip if clicking on inline-editable text (let element's own handler work)
            const target = d3.select(event.target);
            if (target.classed('inline-editable-text')) {
                return; // Let the element's own dblclick handler handle it
            }

            if (handleEmptyImageUploadInteraction(event)) {
                if (!self._drawingClickTimes) {
                    self._drawingClickTimes = {};
                }
                self._drawingClickTimes[drawing.id] = 0;
                return;
            }
            
            event.stopPropagation();
            event.preventDefault();
            
            if (self.eraserMode) return;
            
            // [debug removed]
            
            if (!drawing.locked) {
                self.selectDrawing(drawing);
                self.editDrawing(drawing, event.pageX, event.pageY);
                // [debug removed]
            }
        };
        
        // Context menu handler
        const handleContextMenu = function(event) {
            if (self.chart && typeof self.chart.shouldSuppressRightClickContextMenu === 'function' && self.chart.shouldSuppressRightClickContextMenu(event)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            // Hide any existing chart context menus
            d3.selectAll('.chart-context-menu').style('visibility', 'hidden');
            if (!drawing.locked) {
                self.selectDrawing(drawing);
            }
            self.showContextMenu(drawing, event.pageX, event.pageY);
        };
        
        // Hover handlers
        const handleMouseEnter = function(event) {
            if (self.currentTool) return;
            
            // Ctrl+hover to select (multi-select mode)
            if (self.ctrlSelectMode && !drawing.locked) {
                self.selectDrawing(drawing, true);
            }
            
            // Check if hovering on inline-editable text - use move cursor
            const target = event?.target ? d3.select(event.target) : null;
            const rawTargetNode = event?.target || null;
            const isResizeTarget = !!(
                rawTargetNode &&
                rawTargetNode.closest &&
                rawTargetNode.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .anchored-vwap-anchor, .anchored-vwap-anchor-hit, .volume-profile-boundary-hit')
            );
            const isInlineEditable = target && target.classed('inline-editable-text');
            const isVolumeProfileLevelLineTarget = self.isVolumeProfileToolType(drawing.type)
                && target
                && target.classed('volume-profile-level-line');
            
            if (!drawing.locked) {
                if (isResizeTarget) {
                    drawing.group.style('cursor', 'ew-resize');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'ew-resize';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'ew-resize';
                } else if (isVolumeProfileLevelLineTarget) {
                    drawing.group.style('cursor', 'move');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'move';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'move';
                } else if (isInlineEditable) {
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'move';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'move';
                } else {
                    drawing.group.style('cursor', 'move');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'move';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'move';
                }
                SVGHelpers.applyHoverEffect(drawing.group, true);
                if (drawing.type === 'anchored-vwap' && drawing.group) {
                    drawing.group.selectAll('.anchored-vwap-line-markers').style('opacity', 1);
                }
            } else {
                drawing.group.style('cursor', 'not-allowed');
                if (self.chart?.canvas) self.chart.canvas.style.cursor = 'not-allowed';
                if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'not-allowed';
            }
        };
        
        const handleMouseLeave = function() {
            if (self.currentTool) return;

            if (self.isResizing || self.isCustomHandleDrag) {
                drawing.group.style('cursor', 'ew-resize');
                if (self.chart?.canvas) self.chart.canvas.style.cursor = 'ew-resize';
                if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'ew-resize';
                return;
            }

            if (self.isDragging || self.isDraggingFirstTwo) {
                drawing.group.style('cursor', 'move');
                if (self.chart?.canvas) self.chart.canvas.style.cursor = 'move';
                if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'move';
                return;
            }

            drawing.group.style('cursor', 'default');
            if (self.chart?.canvas) {
                const cursorStyle = self.chart.getCurrentCursorStyle ? self.chart.getCurrentCursorStyle() : 'default';
                self.chart.canvas.style.cursor = cursorStyle;
                if (self.chart.svg?.node()) self.chart.svg.node().style.cursor = cursorStyle;
            }
            SVGHelpers.applyHoverEffect(drawing.group, false);
            if (drawing.type === 'anchored-vwap' && drawing.group) {
                drawing.group.selectAll('.anchored-vwap-line-markers').style('opacity', drawing.selected ? 1 : 0);
            }
        };
        
        // Apply handlers to interactive elements
        interactiveElements
            .on('click', handleClick)
            .on('dblclick', handleDblClick)
            .on('contextmenu', handleContextMenu)
            .on('mouseenter', handleMouseEnter)
            .on('mouseleave', handleMouseLeave);
        
        // Setup drag to move entire drawing (not when locked)
        if (!drawing.locked) {
            this.setupDrawingDrag(drawing);
        }
        
        // Setup drag handlers for resize handles (if selected and not locked)
        // Exception: polyline, path, and double-curve tools always have draggable points
        // Skip if we're in the middle of an active resize operation
        if (!this._skipHandleSetup && !drawing.locked && (drawing.selected || drawing.type === 'polyline' || drawing.type === 'path' || drawing.type === 'double-curve')) {
            this.setupHandleDrag(drawing);
        }
    }
    
    /**
     * Setup drag behavior for moving entire drawing
     */
    setupDrawingDrag(drawing) {
        const self = this;
        let dragStartPoints = null;
        let startDataPoint = null;
        let beforeState = null;
        let multiDragStartPoints = null;

        const getDragDataPoint = (dragEvent) => {
            const src = (dragEvent && dragEvent.sourceEvent) ? dragEvent.sourceEvent : dragEvent;
            const ptr = d3.pointer(src, self.svg.node());
            const screenX = ptr[0];
            const screenY = ptr[1];
            const point = CoordinateUtils.screenToData(screenX, screenY, {
                xScale: self.chart.xScale,
                yScale: self.chart.yScale
            }, self.chart, false);
            return self.clampPointToCandleRange(point, drawing.type);
        };

        const setAnchoredVWAPMovingState = (targetDrawing, isMoving) => {
            if (!targetDrawing || targetDrawing.type !== 'anchored-vwap') return;
            targetDrawing._isActiveMoving = !!isMoving;
        };
        
        // Apply drag to interactive elements (not the group which has pointer-events: none)
        const isVolumeProfileType = this.isVolumeProfileToolType(drawing.type);
        const dragSelector = drawing.type === 'anchored-vwap'
            ? '.anchored-vwap-anchor, .anchored-vwap-anchor-hit, .resize-handle, .resize-handle-hit, .resize-handle-group'
            : isVolumeProfileType
                ? '.volume-profile-boundary-hit, .volume-profile-boundary, .resize-handle, .resize-handle-hit, .resize-handle-group'
                : '.shape-border, line, path, polyline, polygon:not(.upper-fill):not(.lower-fill):not(.shape-fill), text, rect:not(.shape-fill):not(.upper-fill):not(.lower-fill), circle:not(.shape-fill):not(.upper-fill):not(.lower-fill), ellipse:not(.shape-fill):not(.upper-fill):not(.lower-fill)';
        const dragElements = drawing.group.selectAll(dragSelector);
        const dragClickDistance = drawing.type === 'anchored-vwap' ? 1 : 4;
        
        dragElements.call(
            d3.drag()
                .clickDistance(dragClickDistance) // Keep anchored-vwap anchor drags responsive while preserving dblclick elsewhere
                .filter(function(event) {
                    // Only allow drag if not currently drawing and not clicking on a handle
                    const targetSelection = d3.select(event.target);
                    const isResizeHandle = targetSelection.classed('resize-handle') || targetSelection.classed('resize-handle-hit');
                    const isCustomHandle = targetSelection.classed('custom-handle');
                    const targetEl = event.target;
                    const isAnchoredVwapAnchorTarget = drawing.type === 'anchored-vwap' && !!(targetEl && targetEl.closest && targetEl.closest('.anchored-vwap-anchor, .anchored-vwap-anchor-hit'));

                    if (isAnchoredVwapAnchorTarget) {
                        return !self.currentTool;
                    }

                    const isAnyHandle = !!(targetEl && targetEl.closest && targetEl.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle'));
                    const isShapeFill = targetSelection.classed('shape-fill');
                    const isUpperFill = targetSelection.classed('upper-fill');
                    const isLowerFill = targetSelection.classed('lower-fill');
                    const isPositionZone = targetSelection.classed('position-zone');
                    const isRangeFillHit = targetSelection.classed('range-fill-hit');
                    const isRangeInfoBox = targetSelection.classed('range-info-box');
                    const isVolumeProfileSelectHit = targetSelection.classed('volume-profile-select-hit');
                    
                    // Block dragging from shape-fill elements completely
                    if (isShapeFill || isUpperFill || isLowerFill) {
                        return false;
                    }

                    // Selection-only helper zone for docked volume profile.
                    if (isVolumeProfileSelectHit) {
                        return false;
                    }
                    
                    // TradingView-style: only allow drag from edges (lines/strokes), not filled areas
                    // Exception: position-zone elements, emoji/text elements can be dragged
                    const tagName = event.target.tagName.toLowerCase();
                    const isLineElement = tagName === 'line' || tagName === 'path' || tagName === 'polyline';
                    const isTextElement = tagName === 'text' || tagName === 'tspan';  // Allow dragging text and tspan
                    const isShapeBorder = targetSelection.classed('shape-border');
                    const isEmojiElement = targetSelection.classed('emoji-glyph') || targetSelection.classed('emoji-background');
                    const isTextBodyHit = targetSelection.classed('text-body-hit');
                    const hasStroke = targetSelection.attr('stroke') && targetSelection.attr('stroke') !== 'none';

                    // For circle/ellipse, enforce border-only drag by checking distance to border.
                    // This matches the rectangle behavior (only draggable from edges) even when an
                    // invisible hit ring exists.
                    if (!self.currentTool && (drawing.type === 'circle' || drawing.type === 'ellipse') && !isPositionZone && !isTextElement && !isEmojiElement) {
                        const srcEvent = event.sourceEvent || event;
                        const svgNode = self.svg && self.svg.node ? self.svg.node() : null;
                        if (svgNode && srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                            const svgRect = svgNode.getBoundingClientRect();
                            const mouseX = srcEvent.clientX - svgRect.left;
                            const mouseY = srcEvent.clientY - svgRect.top;

                            const strokeWidth = parseFloat(targetSelection.attr('stroke-width')) || 2;
                            const baseTol = Math.max(4, strokeWidth / 2);

                            if (drawing.type === 'circle') {
                                const circleEl = (drawing.group && drawing.group.select)
                                    ? (drawing.group.select('circle.shape-border').node() || drawing.group.select('circle.shape-border-hit').node() || drawing.group.select('circle.shape-fill').node() || drawing.group.select('circle').node())
                                    : null;
                                if (circleEl) {
                                    const cx = parseFloat(circleEl.getAttribute('cx')) || 0;
                                    const cy = parseFloat(circleEl.getAttribute('cy')) || 0;
                                    const cr = parseFloat(circleEl.getAttribute('r')) || 0;
                                    if (cr > 0) {
                                        const dx = mouseX - cx;
                                        const dy = mouseY - cy;
                                        const dist = Math.sqrt(dx * dx + dy * dy);
                                        const distFromBorder = Math.abs(dist - cr);
                                        const tol = Math.min(baseTol, Math.max(0.5, cr - 1));
                                        if (distFromBorder > tol) {
                                            return false;
                                        }
                                    }
                                }
                            } else if (drawing.type === 'ellipse') {
                                const fillEllipse = (drawing.group && drawing.group.select)
                                    ? drawing.group.select('ellipse.shape-fill').node()
                                    : null;
                                if (fillEllipse) {
                                    const cx = parseFloat(fillEllipse.getAttribute('cx')) || 0;
                                    const cy = parseFloat(fillEllipse.getAttribute('cy')) || 0;
                                    const erx = parseFloat(fillEllipse.getAttribute('rx')) || 0;
                                    const ery = parseFloat(fillEllipse.getAttribute('ry')) || 0;
                                    if (erx > 0 && ery > 0) {
                                        const dx = (mouseX - cx) / erx;
                                        const dy = (mouseY - cy) / ery;
                                        const normalizedDist = Math.sqrt(dx * dx + dy * dy);
                                        const distFromBorder = Math.abs(normalizedDist - 1) * Math.min(erx, ery);
                                        const tol = Math.min(baseTol, Math.max(0.5, Math.min(erx, ery) - 1));
                                        if (distFromBorder > tol) {
                                            return false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Allow drag from: position zones, range tool hit areas, lines/paths,
                    // shape borders, stroked elements, or emoji/text
                    // Block drag from: filled areas and resize handles
                    const canDrag = isPositionZone || isRangeFillHit || isRangeInfoBox || isLineElement || isShapeBorder || isTextElement || isEmojiElement || isTextBodyHit || hasStroke;
                    
                    return !self.currentTool && !isResizeHandle && !isCustomHandle && !isAnyHandle && canDrag;
                })
                .on('start', function(event) {
                    event.sourceEvent.stopPropagation();

                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) {
                        self.chart.updateCrosshair(event.sourceEvent);
                    }
                    
                    // Select the drawing when starting to drag (if not already selected)
                    if (!drawing.selected) {
                        self.selectDrawing(drawing, event.sourceEvent.shiftKey);
                    }
                    
                    // Store original points and start position
                    dragStartPoints = drawing.points.map(p => ({...p}));
                    startDataPoint = getDragDataPoint(event);
                    
                    // Check if dragging multiple selected drawings
                    if (self.selectedDrawings.length > 1 && self.selectedDrawings.includes(drawing)) {
                        // Store initial state for all selected drawings
                        multiDragStartPoints = self.selectedDrawings.map(d => ({
                            drawing: d,
                            points: d.points.map(p => ({...p})),
                            beforeState: self.history ? self.history.captureState(d) : null
                        }));
                        multiDragStartPoints.forEach(item => {
                            setAnchoredVWAPMovingState(item.drawing, true);
                        });
                    } else {
                        multiDragStartPoints = null;
                        setAnchoredVWAPMovingState(drawing, true);
                        // Capture state for undo (single drawing)
                        if (self.history) {
                            beforeState = self.history.captureState(drawing);
                        }
                    }
                })
                .on('drag', function(event) {
                    if (!dragStartPoints || !startDataPoint) return;

                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) {
                        self.chart.updateCrosshair(event.sourceEvent);
                    }
                    
                    // Get current mouse position in data space
                    const currentDataPoint = getDragDataPoint(event);
                    
                    // Calculate offset
                    const dx = currentDataPoint.x - startDataPoint.x;
                    const dy = currentDataPoint.y - startDataPoint.y;
                    
                    // Check if dragging multiple drawings
                    if (multiDragStartPoints && multiDragStartPoints.length > 1) {
                        // Move all selected drawings together
                        multiDragStartPoints.forEach(item => {
                            const { dx: constrainedDx, dy: constrainedDy } = self.getConstrainedDragDelta(item.drawing, dx, dy);
                            item.drawing.points = item.points.map(p => ({
                                x: p.x + constrainedDx,
                                y: p.y + constrainedDy
                            }));
                            self.clampDrawingPointsToCandleRange(item.drawing);
                            self.renderDrawing(item.drawing);
                            
                            // Update axis highlights if drawing is selected
                            if (item.drawing.selected && typeof item.drawing.showAxisHighlights === 'function') {
                                item.drawing.showAxisHighlights();
                            }
                        });
                    } else {
                        // Move single drawing
                        const { dx: constrainedDx, dy: constrainedDy } = self.getConstrainedDragDelta(drawing, dx, dy);
                        drawing.points = dragStartPoints.map(p => ({
                            x: p.x + constrainedDx,
                            y: p.y + constrainedDy
                        }));
                        self.clampDrawingPointsToCandleRange(drawing);
                        
                        // Re-render
                        self.renderDrawing(drawing);
                        
                        // Update axis highlights if drawing is selected
                        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
                            drawing.showAxisHighlights();
                        }
                    }
                })
                .on('end', function(event) {
                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) {
                        self.chart.updateCrosshair(event.sourceEvent);
                    }

                    // Record modification for undo/redo
                    if (multiDragStartPoints && multiDragStartPoints.length > 1) {
                        // Record undo for all moved drawings
                        multiDragStartPoints.forEach(item => {
                            if (self.history && item.beforeState) {
                                const moved = item.drawing.points.some((p, i) => 
                                    p.x !== item.points[i].x || p.y !== item.points[i].y
                                );
                                if (moved) {
                                    self.history.recordModify(item.drawing, item.beforeState);
                                }
                            }
                            // Recalculate timestamps
                            if (typeof item.drawing.recalculateTimestamps === 'function') {
                                item.drawing.recalculateTimestamps();
                            }

                            setAnchoredVWAPMovingState(item.drawing, false);
                            if (item.drawing.type === 'anchored-vwap') {
                                self.renderDrawing(item.drawing);
                                if (item.drawing.selected && typeof item.drawing.showAxisHighlights === 'function') {
                                    item.drawing.showAxisHighlights();
                                }
                            }
                        });
                        multiDragStartPoints = null;
                    } else {
                        // Record undo for single drawing
                        if (self.history && beforeState && dragStartPoints) {
                            const moved = drawing.points.some((p, i) => 
                                p.x !== dragStartPoints[i].x || p.y !== dragStartPoints[i].y
                            );
                            if (moved) {
                                self.history.recordModify(drawing, beforeState);
                            }
                        }

                        setAnchoredVWAPMovingState(drawing, false);
                        if (drawing.type === 'anchored-vwap') {
                            self.renderDrawing(drawing);
                            if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
                                drawing.showAxisHighlights();
                            }
                        }

                        beforeState = null;
                    }
                    
                    dragStartPoints = null;
                    startDataPoint = null;
                    // Recalculate timestamps from new positions
                    drawing.recalculateTimestamps();
                    self.saveDrawings();
                    
                    // Broadcast update to other panels
                    const index = self.drawings.indexOf(drawing);
                    if (self.chart.broadcastDrawingChange && index > -1) {
                        self.chart.broadcastDrawingChange('update', drawing, index);
                    }
                    
                    // [debug removed]
                })
        );
    }

    _startDirectMoveDrag(drawingOrDrawings, event) {
        const stopDirectMoveListeners = () => {
            if (this._directMoveMoveHandler) {
                document.removeEventListener('mousemove', this._directMoveMoveHandler, true);
            }
            if (this._directMoveUpHandler) {
                document.removeEventListener('mouseup', this._directMoveUpHandler, true);
            }
            this._directMoveMoveHandler = null;
            this._directMoveUpHandler = null;
        };

        stopDirectMoveListeners();

        const drawings = (Array.isArray(drawingOrDrawings) ? drawingOrDrawings : [drawingOrDrawings])
            .filter(d => d && d.type !== 'anchored-vwap');
        if (!drawings || drawings.length === 0) return;

        const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
        if (svgNode && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
            const svgRect = svgNode.getBoundingClientRect();
            const startMouseX = event.clientX - svgRect.left;
            const startMouseY = event.clientY - svgRect.top;
            const shouldBlockVolumeProfileTextDirectMove = drawings.some((d) =>
                this.isVolumeProfileLevelLineHit(d, startMouseX, startMouseY)
                || this.isVolumeProfileValuesLabelHit(d, startMouseX, startMouseY)
            );
            if (shouldBlockVolumeProfileTextDirectMove) {
                return;
            }
        }

        const singleDragType = drawings.length === 1 ? drawings[0].type : null;
        const startPoint = this.getDataPoint(event, singleDragType);
        const startStates = drawings.map(d => ({
            drawing: d,
            points: d.points.map(p => ({ ...p })),
            beforeState: this.history ? this.history.captureState(d) : null
        }));
        let moved = false;

        this._directMoveMoveHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.chart && typeof this.chart.updateCrosshair === 'function') {
                this.chart.updateCrosshair(e);
            }

            const p = this.getDataPoint(e, singleDragType);
            const dx = p.x - startPoint.x;
            const dy = p.y - startPoint.y;

            if (dx !== 0 || dy !== 0) moved = true;

            startStates.forEach(item => {
                const { dx: constrainedDx, dy: constrainedDy } = this.getConstrainedDragDelta(item.drawing, dx, dy);
                item.drawing.points = item.points.map(pt => ({
                    x: pt.x + constrainedDx,
                    y: pt.y + constrainedDy
                }));
                this.clampDrawingPointsToCandleRange(item.drawing);

                this.renderDrawing(item.drawing);

                if (item.drawing.selected && typeof item.drawing.showAxisHighlights === 'function') {
                    item.drawing.showAxisHighlights();
                }
            });
        };

        this._directMoveUpHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            stopDirectMoveListeners();

            if (this.chart && typeof this.chart.updateCrosshair === 'function') {
                this.chart.updateCrosshair(e);
            }

            startStates.forEach(item => {
                if (moved && this.history && item.beforeState) {
                    this.history.recordModify(item.drawing, item.beforeState);
                }

                if (typeof item.drawing.recalculateTimestamps === 'function') {
                    item.drawing.recalculateTimestamps();
                }

                const index = this.drawings.indexOf(item.drawing);
                if (this.chart && this.chart.broadcastDrawingChange && index > -1) {
                    this.chart.broadcastDrawingChange('update', item.drawing, index);
                }
            });
        };

        document.addEventListener('mousemove', this._directMoveMoveHandler, true);
        document.addEventListener('mouseup', this._directMoveUpHandler, true);
    }

    /**
     * Setup drag behavior for resize handles
     */
    setupHandleDrag(drawing) {
        const self = this;
        
        const applyPointHandleDrag = (point, drawing, index) => {
            if (typeof drawing.onPointHandleDrag === 'function') {
                const context = {
                    point,
                    scales: {
                        xScale: self.chart.xScale,
                        yScale: self.chart.yScale,
                        chart: self.chart
                    }
                };
                const handled = drawing.onPointHandleDrag(index, context);
                if (handled) {
                    self._skipHandleSetup = true;
                    this.renderDrawing(drawing);
                    self._skipHandleSetup = false;
                    if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
                        drawing.showAxisHighlights();
                    }
                    return true;
                }
            }
            return false;
        };

        const handles = drawing.group.selectAll('.resize-handle, .resize-handle-hit, .resize-handle-group');
        
        handles.call(
            d3.drag()
                .filter(() => !self.currentTool)
                .on('start', function(event) {
                    event.sourceEvent.stopPropagation();
                    const handleRole = d3.select(this).attr('data-handle-role');
                    const index = parseInt(d3.select(this).attr('data-point-index'));
                    
                    const baseProto = (typeof BaseDrawing !== 'undefined' && BaseDrawing.prototype) ? BaseDrawing.prototype : null;
                    const hasCustomOverride = baseProto
                        ? drawing.handleCustomHandleDrag !== baseProto.handleCustomHandleDrag
                        : (typeof drawing.handleCustomHandleDrag === 'function');
                    const hasPointOverride = baseProto
                        ? drawing.onPointHandleDrag !== baseProto.onPointHandleDrag
                        : (typeof drawing.onPointHandleDrag === 'function');

                    if (handleRole && hasCustomOverride) {
                        self.resizingHandleRole = handleRole || null;
                        self.startCustomHandleDrag(drawing, handleRole, event, index);
                    } else if (!isNaN(index) && hasCustomOverride && !hasPointOverride) {
                        // Tools that rely on custom drag math but expose point-index handles.
                        self.resizingHandleRole = handleRole || null;
                        self.startCustomHandleDrag(drawing, index, event, index);
                    } else {
                        self.resizingHandleRole = handleRole || null;
                        self.startHandleDrag(drawing, index, event);
                    }
                    d3.select(this).style('cursor', 'ew-resize');
                })
                .on('drag', function(event) {
                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) self.chart.updateCrosshair(event.sourceEvent);
                    // Check if we're in custom handle drag mode
                    if (self.isCustomHandleDrag) {
                        self.handleCustomHandleDrag(event);
                        return;
                    }
                    
                    let point = self.getDataPoint(event.sourceEvent, drawing.type);
                    const index = self.resizingPointIndex;
                    
                    // Apply Shift key angle constraint for supported line tools
                    if (event.sourceEvent.shiftKey && self.angleSnapTools.includes(drawing.type)) {
                        const otherIndex = index === 0 ? 1 : 0;
                        if (drawing.points[otherIndex]) {
                            point = self.constrainToAngle(drawing.points[otherIndex], point);
                        }
                    }
                    
                    if (!applyPointHandleDrag(point, drawing, index)) {
                        self.handleDrag(event);
                    }
                })
                .on('end', function(event) {
                    d3.select(this).style('cursor', 'ew-resize');
                    // Check if we're ending a custom handle drag
                    if (self.isCustomHandleDrag) {
                        self.endCustomHandleDrag(event);
                    } else {
                        self.endHandleDrag(drawing);
                    }
                })
        );

        drawing.group.selectAll('.custom-handle').call(
            d3.drag()
                .filter(() => !self.currentTool)
                .on('start', function(event) {
                    event.sourceEvent.stopPropagation();
                    const role = d3.select(this).attr('data-handle-role');
                    self.startCustomHandleDrag(drawing, role, event);
                })
                .on('drag', function(event) {
                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) self.chart.updateCrosshair(event.sourceEvent);
                    self.handleCustomHandleDrag(event);
                })
                .on('end', function(event) {
                    self.endCustomHandleDrag(event);
                })
        );
    }

    /**
     * Start handle drag
     */
    startHandleDrag(drawing, pointIndex, event) {
        this.isResizing = true;
        this.resizingDrawing = drawing;
        this.resizingPointIndex = pointIndex;

        if (this.isVolumeProfileToolType(drawing.type)) {
            drawing._isActiveResizing = true;
            drawing._activeResizingPointIndex = Number.isFinite(pointIndex) ? pointIndex : null;
        }

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'ew-resize';
        this.svg.style('cursor', 'ew-resize');
        // Capture state for undo
        if (this.history) {
            this.resizeBeforeState = this.history.captureState(drawing);
        }
        // [debug removed]
    }

    /**
     * Handle drag event for resize handles
     */
    handleDrag(event) {
        if (!this.isResizing || !this.resizingDrawing) return;
        
        // Use sourceEvent for accurate mouse position
        const drawing = this.resizingDrawing;
        let point = this.getDataPoint(event.sourceEvent, drawing.type);
        const index = this.resizingPointIndex;
        
        // Validate index
        if (index === undefined || index === null || isNaN(index)) {
            console.warn('⚠️ Invalid resize point index:', index);
            return;
        }
        
        // Apply Shift key angle constraint for supported line tools
        if (event.sourceEvent.shiftKey && this.angleSnapTools.includes(drawing.type)) {
            // Get the other anchor point (for 2-point tools)
            const otherIndex = index === 0 ? 1 : 0;
            if (drawing.points[otherIndex]) {
                point = this.constrainToAngle(drawing.points[otherIndex], point);
            }
        }
        
        // Update point
        drawing.points[index] = point;
        
        // Re-render without recreating handles during active drag
        this._skipHandleSetup = true;
        this.renderDrawing(drawing);
        this._skipHandleSetup = false;
        
        // Update axis highlights if drawing is selected
        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
            drawing.showAxisHighlights();
        }
    }

    /**
     * End handle drag
     */
    endHandleDrag(drawing) {
        // Record modification for undo/redo
        if (this.history && this.resizeBeforeState) {
            this.history.recordModify(drawing, this.resizeBeforeState);
        }

        const isVolumeProfileResize = !!(drawing && this.isVolumeProfileToolType(drawing.type));
        if (isVolumeProfileResize) {
            drawing._isActiveResizing = false;
            drawing._activeResizingPointIndex = null;
        }
        
        this.isResizing = false;
        this.resizingDrawing = null;
        this.resizingPointIndex = null;
        this.resizingHandleRole = null;
        this.resizeBeforeState = null;

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        this.svg.style('cursor', '');

        if (isVolumeProfileResize) {
            this.renderDrawing(drawing);
        }

        // Recalculate timestamps from new positions
        drawing.recalculateTimestamps();
        this.persistPositionToolDefaults(drawing);
        this.saveDrawings();
        
        // Broadcast update to other panels
        const index = this.drawings.indexOf(drawing);
        if (this.chart.broadcastDrawingChange && index > -1) {
            this.chart.broadcastDrawingChange('update', drawing, index);
        }
        // [debug removed]
    }

    startCustomHandleDrag(drawing, handleRole, event, pointIndex) {
        this.isCustomHandleDrag = true;
        this.customHandleDrawing = drawing;
        this.customHandleRole = handleRole;

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'ew-resize';
        this.svg.style('cursor', 'ew-resize');
        this.customHandlePointIndex = pointIndex; // Store point index for arc/curve
        this.customHandleStart = this.collectHandleContext(event);
        // Capture state for undo
        if (this.history) {
            this.customHandleBeforeState = this.history.captureState(drawing);
        }
        // Call beginHandleDrag if the drawing has it
        if (typeof drawing.beginHandleDrag === 'function') {
            drawing.beginHandleDrag(handleRole, this.customHandleStart);
        }
        // [debug removed]
    }

    handleCustomHandleDrag(event) {
        if (!this.isCustomHandleDrag || !this.customHandleDrawing) return;
        const context = this.collectHandleContext(event);
        const drawing = this.customHandleDrawing;
        const handleRole = this.customHandleRole;
        
        // Add pointIndex to context for arc/curve sensitivity
        context.pointIndex = this.customHandlePointIndex;
        
        // Apply Shift key angle constraint for supported line tools
        if (context.shiftKey && this.angleSnapTools.includes(drawing.type)) {
            const pointIndex = context.pointIndex;
            const otherIndex = pointIndex === 0 ? 1 : 0;
            if (drawing.points[otherIndex]) {
                context.dataPoint = this.constrainToAngle(drawing.points[otherIndex], context.dataPoint);
                context.point = context.dataPoint;
            }
        }
        
        if (typeof drawing.handleCustomHandleDrag === 'function') {
            drawing.handleCustomHandleDrag(handleRole, context);
        }

        // Always re-render during drag
        this.scheduleRenderDrawing(drawing);
        
        // Dispatch event to sync UI with drawing style changes (e.g., font size during text resize)
        window.dispatchEvent(new CustomEvent('drawingStyleChanged', { 
            detail: { drawing, property: 'fontSize', value: drawing.style.fontSize } 
        }));
        
        // Update axis highlights if drawing is selected
        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
            drawing.showAxisHighlights();
        }
    }

    endCustomHandleDrag(event) {
        if (!this.isCustomHandleDrag || !this.customHandleDrawing) return;
        const context = this.collectHandleContext(event);
        const drawing = this.customHandleDrawing;
        const handleRole = this.customHandleRole;

        if (typeof drawing.endHandleDrag === 'function') {
            drawing.endHandleDrag(handleRole, context);
        }

        // Do a full re-render to finalize the resize
        this.renderDrawing(drawing);

        // Record modification for undo/redo
        if (this.history && this.customHandleBeforeState) {
            this.history.recordModify(drawing, this.customHandleBeforeState);
        }

        this.isCustomHandleDrag = false;
        // Recalculate timestamps from new positions
        drawing.recalculateTimestamps();
        this.customHandleDrawing = null;
        this.customHandleRole = null;
        this.customHandleStart = null;
        this.customHandleBeforeState = null;

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        this.svg.style('cursor', '');
        this.persistPositionToolDefaults(drawing);
        this.saveDrawings();
        
        // Broadcast update to other panels
        if (drawing) {
            const index = this.drawings.indexOf(drawing);
            if (this.chart.broadcastDrawingChange && index > -1) {
                this.chart.broadcastDrawingChange('update', drawing, index);
            }
        }
        // [debug removed]
    }

    collectHandleContext(event) {
        const sourceEvent = event.sourceEvent || event;
        const point = this.getDataPoint(sourceEvent);
        const [screenX, screenY] = d3.pointer(sourceEvent, this.svg.node());
        // Get scales from chart instance
        const scales = {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale,
            chart: this.chart
        };
        return {
            point,
            dataPoint: point,  // Alias for compatibility with box handle drag
            screen: { x: screenX, y: screenY },
            scales: scales,  // Include scales for handle calculations
            shiftKey: sourceEvent.shiftKey || false,
            ctrlKey: sourceEvent.ctrlKey || sourceEvent.metaKey || false
        };
    }

    /**
     * Start dragging entire drawing (or multiple drawings if multi-selected)
     */
    startDrag(drawing, event) {
        this.isDragging = true;
        this.draggingDrawing = drawing;
        this.dragStartPoint = this.getDataPoint(event);

        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'move';
        this.svg.style('cursor', 'move');
        
        // Store screen coordinates for smooth pixel-based dragging
        const svgRect = this.svg.node().getBoundingClientRect();
        this.dragStartScreen = {
            x: event.clientX - svgRect.left,
            y: event.clientY - svgRect.top
        };

        // Store original group transform so dragging uses delta translation (prevents jumps)
        const parseTranslate = (t) => {
            if (!t) return { x: 0, y: 0 };
            const m = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
            if (!m) return { x: 0, y: 0 };
            return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
        };
        this.dragStartOriginalPos = parseTranslate(drawing.group ? drawing.group.attr('transform') : null);
        
        // If dragging a drawing that's part of a multi-selection, drag all selected drawings
        if (this.selectedDrawings.length > 1 && this.selectedDrawings.includes(drawing)) {
            this.draggingMultiple = true;
            // Store initial positions for all selected drawings
            this.multiDragStartPositions = this.selectedDrawings.map(d => ({
                drawing: d,
                points: d.points.map(p => ({ ...p })),
                startTransform: (() => {
                    const parseTranslate = (t) => {
                        if (!t) return { x: 0, y: 0 };
                        const m = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                        if (!m) return { x: 0, y: 0 };
                        return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
                    };
                    return parseTranslate(d.group ? d.group.attr('transform') : null);
                })()
            }));
        } else {
            this.draggingMultiple = false;
        }
    }

    /**
     * End dragging
     */
    endDrag() {
        // Convert final pixel positions back to data coordinates
        if (this.draggingMultiple && this.multiDragStartPositions) {
            const scales = { xScale: this.chart.xScale, yScale: this.chart.yScale, chart: this.chart };
            this.multiDragStartPositions.forEach(({ drawing, points, startTransform }) => {
                // Get current transform
                const transform = drawing.group ? drawing.group.attr('transform') : null;
                if (transform) {
                    const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
                    if (match) {
                        const finalTx = parseFloat(match[1]);
                        const finalTy = parseFloat(match[2]);

                        const startTx = startTransform ? startTransform.x : 0;
                        const startTy = startTransform ? startTransform.y : 0;

                        // Pixel delta from drag
                        const pixelDx = finalTx - startTx;
                        const pixelDy = finalTy - startTy;

                        // Convert pixel delta to data delta using point[0] screen location
                        const p0 = points[0];
                        const origScreenX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p0.x) : scales.xScale(p0.x);
                        const origScreenY = scales.yScale(p0.y);
                        const dataX1 = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(origScreenX) : scales.xScale.invert(origScreenX);
                        const dataX2 = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(origScreenX + pixelDx) : scales.xScale.invert(origScreenX + pixelDx);
                        const dataY1 = scales.yScale.invert(origScreenY);
                        const dataY2 = scales.yScale.invert(origScreenY + pixelDy);
                        
                        const dx = dataX2 - dataX1;
                        const dy = dataY2 - dataY1;
                        
                        drawing.points = points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        drawing.meta.updatedAt = Date.now();
                    }
                }
                if (drawing.group) {
                    drawing.group.attr('transform', null);
                }
                this.renderDrawing(drawing);
            });
        } else if (this.draggingDrawing && this.dragStartOriginalPos) {
            // Get final transform position
            const transform = this.draggingDrawing.group.attr('transform');
            if (transform) {
                const match = transform.match(/translate\(([-\d.]+),\s*([ -\d.]+)\)/);
                if (match) {
                    const scales = { xScale: this.chart.xScale, yScale: this.chart.yScale, chart: this.chart };
                    
                    const finalTx = parseFloat(match[1]);
                    const finalTy = parseFloat(match[2]);

                    // Pixel delta from drag
                    const pixelDx = finalTx - this.dragStartOriginalPos.x;
                    const pixelDy = finalTy - this.dragStartOriginalPos.y;

                    // Convert pixel delta to data delta using point[0] screen location
                    const p0 = this.draggingDrawing.points[0];
                    const origScreenX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p0.x) : scales.xScale(p0.x);
                    const origScreenY = scales.yScale(p0.y);
                    const dataX1 = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(origScreenX) : scales.xScale.invert(origScreenX);
                    const dataX2 = this.chart.pixelToDataIndex ? this.chart.pixelToDataIndex(origScreenX + pixelDx) : scales.xScale.invert(origScreenX + pixelDx);
                    const dataY1 = scales.yScale.invert(origScreenY);
                    const dataY2 = scales.yScale.invert(origScreenY + pixelDy);
                    
                    const dx = dataX2 - dataX1;
                    const dy = dataY2 - dataY1;
                    
                    this.draggingDrawing.points = this.draggingDrawing.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    this.draggingDrawing.meta.updatedAt = Date.now();
                }
            }
            if (this.draggingDrawing && this.draggingDrawing.group) {
                this.draggingDrawing.group.attr('transform', null);
            }
            this.renderDrawing(this.draggingDrawing);
        }
        
        this.isDragging = false;
        this.draggingDrawing = null;
        this.dragStartPoint = null;
        this.dragStartScreen = null;
        this.dragStartOriginalPos = null;
        this.draggingMultiple = false;
        this.multiDragStartPositions = null;

        const canvas = document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        this.svg.style('cursor', '');
        this.saveDrawings();
    }

    /**
     * Select a drawing (or delete if in eraser mode)
     * @param {Object} drawing - The drawing to select
     * @param {Boolean} addToSelection - If true, add to selection instead of replacing (Shift/Ctrl)
     */
    selectDrawing(drawing, addToSelection = false) {
        // If eraser mode is active, delete the drawing instead of selecting
        if (this.eraserMode) {
            this.deleteDrawing(drawing); // Pass the drawing object, not ID
            // [debug removed]
            return;
        }
        
        // Multi-selection with Shift or Ctrl
        if (addToSelection) {
            // Check if already selected
            const index = this.selectedDrawings.indexOf(drawing);
            if (index > -1) {
                // Already selected - deselect it
                this.selectedDrawings.splice(index, 1);
                drawing.deselect();
                this.renderDrawing(drawing);
            } else {
                // Add to selection
                this.selectedDrawings.push(drawing);
                drawing.select();
                this.renderDrawing(drawing);
            }
            
            // Update primary selection
            this.selectedDrawing = this.selectedDrawings.length > 0 ? this.selectedDrawings[this.selectedDrawings.length - 1] : null;
            
            // Hide toolbar for multi-selection
            if (this.selectedDrawings.length > 1) {
                this.toolbar.hide();
            } else if (this.selectedDrawings.length === 1) {
                // Show toolbar for single selection
                const lastDrawing = this.selectedDrawings[0];
                if (lastDrawing.group) {
                    const bbox = lastDrawing.group.node().getBBox();
                    const svgRect = this.svg.node().getBoundingClientRect();
                    const x = svgRect.left + bbox.x + (bbox.width / 2);
                    const y = svgRect.top + bbox.y;
                    if (typeof this.toolbar.onBeforeUpdate === 'function') this.toolbar.onBeforeUpdate(lastDrawing);
                this.toolbar.show(lastDrawing, x, y);
                }
            }
        } else {
            // If this drawing is already the only selected drawing, don't deselectAll().
            // deselectAll() contains cleanup logic that can auto-remove empty ImageTool drawings.
            if (this.selectedDrawings.length === 1 && this.selectedDrawings[0] === drawing) {
                drawing.select();
                this.selectedDrawing = drawing;
                this.selectedDrawings = [drawing];
                this.renderDrawing(drawing);

                if (drawing.group) {
                    const bbox = drawing.group.node().getBBox();
                    const svgRect = this.svg.node().getBoundingClientRect();
                    const x = svgRect.left + bbox.x + (bbox.width / 2);
                    const y = svgRect.top + bbox.y;
                    if (typeof this.toolbar.onBeforeUpdate === 'function') this.toolbar.onBeforeUpdate(drawing);
                    this.toolbar.show(drawing, x, y);
                }
                return;
            }
            // Single selection - deselect all others
            this.deselectAll();
            drawing.select();
            this.selectedDrawing = drawing;
            this.selectedDrawings = [drawing];
            this.renderDrawing(drawing); // Re-render to show handles
            
            // Show floating toolbar
            if (drawing.group) {
                const bbox = drawing.group.node().getBBox();
                const svgRect = this.svg.node().getBoundingClientRect();
                
                // Position toolbar above the drawing
                const x = svgRect.left + bbox.x + (bbox.width / 2);
                const y = svgRect.top + bbox.y;
                if (typeof this.toolbar.onBeforeUpdate === 'function') this.toolbar.onBeforeUpdate(drawing);
                this.toolbar.show(drawing, x, y);
            }
        }
        
        // Refresh object tree if available
        if (this.objectTreeManager) {
            this.objectTreeManager.refresh();
        }
        this._updateAxisZonePointerEvents();
    }

    /**
     * Toggle axis cursor zone z-index based on drawing selection / active tool state.
     * When a drawing is selected or a tool is active, move the time-axis zone behind
     * the SVG layer (z-index 1) so it doesn't steal mouse events from drawings.
     */
    _updateAxisZonePointerEvents() {
        const active = this.selectedDrawings.length > 0 || !!this.currentTool;
        const timeZone = document.getElementById('timeAxisZone') || document.querySelector('.time-axis-zone');
        if (timeZone) {
            if (active) {
                timeZone.style.zIndex = '1';
            } else {
                timeZone.style.zIndex = '';
            }
        }
    }

    /**
     * Deselect all drawings
     */
    deselectAll() {
        // Before deselecting, remove any empty image tools that were never uploaded
        const emptyImageTools = this.selectedDrawings.filter(d => 
            d.type === 'image' && 
            (!d.style.imageUrl || d.style.imageUrl === '') &&
            !d._uploadDialogOpen &&
            d._autoRemoveIfEmpty &&
            !d._keepEmpty
        );
        
        emptyImageTools.forEach(d => {
            // [debug removed]
            const index = this.drawings.indexOf(d);
            if (index > -1) {
                this.drawings.splice(index, 1);
            }
            if (d.group) {
                d.group.remove();
            }
        });
        
        this.selectedDrawings.forEach(d => {
            d.deselect();
            this.renderDrawing(d);
        });
        this.selectedDrawing = null;
        this.selectedDrawings = [];
        this.toolbar.hide(); // Hide toolbar
        this.redrawAll();
        this._updateAxisZonePointerEvents();
    }

    /**
     * Edit drawing settings
     */
    editDrawing(drawing, x, y) {
        // Hide toolbar when opening settings panel
        this.toolbar.hide();

        // If user opens settings for an empty image, keep it (don't auto-delete on deselect).
        if (drawing && drawing.type === 'image') {
            drawing._keepEmpty = true;
        }
        
        this.settingsPanel.show(
            drawing,
            x,
            y,
            (updatedDrawing) => {
                this.renderDrawing(updatedDrawing);
                this.persistPositionToolDefaults(updatedDrawing);
                this.saveDrawings();
            },
            (drawingToDelete) => {
                this.deleteDrawing(drawingToDelete);
            }
        );
    }

    /**
     * Show context menu for drawing
     */
    showContextMenu(drawing, x, y) {
        this.contextMenu.show(x, y, drawing, {
            edit: (d) => this.editDrawing(d, x, y),
            duplicate: (d) => this.duplicateDrawing(d),
            copy: (d) => this.copyDrawing(d),
            bringToFront: (d) => this.bringToFront(d),
            sendToBack: (d) => this.sendToBack(d),
            lock: (d) => this.toggleLock(d),
            hide: (d) => this.toggleHide(d),
            delete: (d) => this.deleteDrawing(d)
        });
    }
    
    /**
     * Copy drawing to clipboard
     */
    copyDrawing(drawing) {
        try {
            // Use toJSON which is the standard method
            const data = drawing.toJSON ? drawing.toJSON() : {
                type: drawing.type,
                points: drawing.points,
                style: drawing.style
            };
            this.clipboardDrawing = JSON.parse(JSON.stringify(data));
            // [debug removed]
        } catch (err) {
            console.error('Failed to copy drawing:', err);
        }
    }
    
    /**
     * Paste drawing from clipboard
     */
    pasteDrawing() {
        if (!this.clipboardDrawing) {
            // [debug removed]
            return;
        }
        
        try {
            const toolInfo = this.toolRegistry[this.clipboardDrawing.type];
            if (!toolInfo) return;
            
            const newDrawing = toolInfo.class.fromJSON(this.clipboardDrawing);
            newDrawing.id = generateUUID();
            
            // Calculate small offset based on visible chart range
            const priceRange = this.chart.yScale.domain();
            const priceOffset = (priceRange[1] - priceRange[0]) * 0.02;
            
            newDrawing.points = newDrawing.points.map(p => ({
                x: p.x + 1,
                y: p.y - priceOffset
            }));
            
            this.addDrawing(newDrawing);
            this.selectDrawing(newDrawing);
            // [debug removed]
        } catch (err) {
            console.error('Failed to paste drawing:', err);
        }
    }
    
    /**
     * Toggle lock state of drawing
     */
    toggleLock(drawing) {
        drawing.locked = !drawing.locked;
        
        if (drawing.locked) {
            // When locked, only allow right-click for context menu
            if (drawing.group) {
                // Remove drag/resize but keep context menu
                drawing.group.classed('locked', true);
                drawing.group.style('opacity', '0.7');
            }
            // [debug removed]
        } else {
            // Re-enable full interaction
            if (drawing.group) {
                drawing.group.classed('locked', false);
                drawing.group.style('opacity', null);
            }
            // [debug removed]
        }
        
        this.saveDrawings();
        this.renderDrawing(drawing); // Re-render to apply lock state
    }
    
    /**
     * Toggle hide state of drawing
     */
    toggleHide(drawing) {
        const currentlyHidden = drawing.hidden === true || drawing.visible === false;
        const nextHidden = !currentlyHidden;

        // Keep both flags in sync: visible is persisted in toJSON/fromJSON,
        // while hidden is used by object-tree/context-menu hide toggles.
        drawing.hidden = nextHidden;
        drawing.visible = !nextHidden;

        if (nextHidden) {
            if (typeof drawing.deselect === 'function') {
                drawing.deselect();
            }
            if (this.selectedDrawing === drawing) {
                this.selectedDrawing = null;
            }
            const selectedIdx = this.selectedDrawings.indexOf(drawing);
            if (selectedIdx > -1) {
                this.selectedDrawings.splice(selectedIdx, 1);
            }
            if (this.selectedDrawings.length === 0) {
                this.toolbar.hide();
            }
        }

        this.renderDrawing(drawing);
        this.saveDrawings();
        
        // Refresh object tree if available
        if (this.objectTreeManager) {
            this.objectTreeManager.refresh();
        }
    }

    /**
     * Delete a drawing
     */
    deleteDrawing(drawing) {
        const index = this.drawings.indexOf(drawing);
        if (index > -1) {
            if (this._rafRenderSet) {
                this._rafRenderSet.delete(drawing);
            }

            // Record for undo/redo BEFORE removing
            if (this.history) {
                this.history.recordDelete(drawing, index);
            }
            
            // If this is an executed position tool, cancel any associated orders
            if ((drawing.type === 'long-position' || drawing.type === 'short-position') && 
                drawing.meta?.executed && 
                window.chart?.orderManager) {
                const orderManager = window.chart.orderManager;
                const entryPrice = drawing.points[0]?.y;
                
                if (entryPrice) {
                    // Find and cancel pending orders with matching entry price
                    if (orderManager.pendingOrders) {
                        const ordersToCancel = orderManager.pendingOrders.filter(order => 
                            Math.abs(order.entryPrice - entryPrice) < 0.00001 ||
                            (order.createdFromTool && order.toolType === drawing.type)
                        );
                        ordersToCancel.forEach(order => {
                            if (typeof orderManager.cancelPendingOrder === 'function') {
                                orderManager.cancelPendingOrder(order.id);
                            }
                        });
                        if (ordersToCancel.length > 0) {
                            // [debug removed]
                        }
                    }
                    
                    // Also remove order lines for open positions with matching entry price
                    if (orderManager.openPositions && orderManager.chart?.svg) {
                        const positionsToRemove = orderManager.openPositions.filter(order => 
                            Math.abs((order.openPrice || order.entryPrice) - entryPrice) < 0.00001 ||
                            (order.createdFromTool && order.toolType === drawing.type)
                        );
                        positionsToRemove.forEach(order => {
                            // Remove visual elements
                            orderManager.chart.svg.selectAll(`.order-line-${order.id}`).remove();
                            orderManager.chart.svg.selectAll(`.sl-line-${order.id}`).remove();
                            orderManager.chart.svg.selectAll(`.tp-line-${order.id}`).remove();
                            orderManager.chart.svg.selectAll(`.entry-marker-${order.id}`).remove();
                            
                            // Remove from orderLines array
                            if (orderManager.orderLines) {
                                orderManager.orderLines = orderManager.orderLines.filter(l => l.orderId !== order.id);
                            }
                            // [debug removed]
                        });
                    }
                    
                    // Remove all pending order visuals using orderLines array
                    if (orderManager.orderLines && orderManager.orderLines.length > 0) {
                        // Find order lines that match the entry price
                        const linesToRemove = orderManager.orderLines.filter(l => {
                            if (!l.isPending) return false;
                            // Check if this order's entry price matches
                            const order = orderManager.pendingOrders?.find(o => o.id === l.orderId);
                            if (order && Math.abs(order.entryPrice - entryPrice) < 0.0001) {
                                return true;
                            }
                            // Also check priceText content
                            if (l.priceText) {
                                try {
                                    const textPrice = parseFloat(l.priceText.text());
                                    if (!isNaN(textPrice) && Math.abs(textPrice - entryPrice) < 0.0001) {
                                        return true;
                                    }
                                } catch(e) {}
                            }
                            return false;
                        });
                        
                        linesToRemove.forEach(lineData => {
                            // [debug removed]
                            if (lineData.line) lineData.line.remove();
                            if (lineData.labelBox) lineData.labelBox.remove();
                            if (lineData.labelText) lineData.labelText.remove();
                            if (lineData.priceBox) lineData.priceBox.remove();
                            if (lineData.priceText) lineData.priceText.remove();
                            if (lineData.closeBtn) lineData.closeBtn.remove();
                            
                            // Also remove SL/TP lines
                            if (orderManager.removePendingSLTPLines) {
                                orderManager.removePendingSLTPLines(lineData.orderId);
                            }
                        });
                        
                        // Filter out removed lines
                        const removedIds = linesToRemove.map(l => l.orderId);
                        orderManager.orderLines = orderManager.orderLines.filter(l => 
                            !removedIds.includes(l.orderId) || !l.isPending
                        );
                    }
                    
                    // AGGRESSIVE FALLBACK: Remove ALL pending order visuals matching entry price
                    if (orderManager.chart?.svg) {
                        const svg = orderManager.chart.svg;
                        const entryPriceStr = entryPrice.toFixed(5);
                        // [debug removed]
                        
                        // Find ALL pending order price texts and check their content
                        svg.selectAll('.pending-order-price-text').each(function() {
                            const text = d3.select(this);
                            const textContent = text.text();
                            // [debug removed]
                            
                            // Check if price matches (with tolerance)
                            const textPrice = parseFloat(textContent);
                            if (!isNaN(textPrice) && Math.abs(textPrice - entryPrice) < 0.001) {
                                const className = text.attr('class') || '';
                                const match = className.match(/pending-(\d+)/);
                                if (match) {
                                    const orderId = match[1];
                                    // [debug removed]
                                    svg.selectAll(`.pending-${orderId}`).remove();
                                    svg.selectAll(`.pending-sl-${orderId}`).remove();
                                    svg.selectAll(`.pending-tp-${orderId}`).remove();
                                    svg.selectAll(`[class*="pending-${orderId}"]`).remove();
                                }
                            }
                        });
                        
                        // Also search by price box content
                        svg.selectAll('.pending-order-price-box').each(function() {
                            const box = d3.select(this);
                            const className = box.attr('class') || '';
                            const match = className.match(/pending-(\d+)/);
                            if (match) {
                                // Find the corresponding text
                                const orderId = match[1];
                                const priceText = svg.select(`.pending-order-price-text.pending-${orderId}`);
                                if (!priceText.empty()) {
                                    const textPrice = parseFloat(priceText.text());
                                    if (!isNaN(textPrice) && Math.abs(textPrice - entryPrice) < 0.001) {
                                        // [debug removed]
                                        svg.selectAll(`.pending-${orderId}`).remove();
                                        svg.selectAll(`[class*="pending-${orderId}"]`).remove();
                                    }
                                }
                            }
                        });
                    }
                    
                    // Update positions panel
                    if (typeof orderManager.updatePositionsPanel === 'function') {
                        orderManager.updatePositionsPanel();
                    }
                }
            }
            
            this.drawings.splice(index, 1);

            // If this drawing was being interacted with, clear drag/resize state immediately
            if (this.draggingDrawing === drawing) {
                this.isDragging = false;
                this.draggingDrawing = null;
                this.dragStartPoint = null;
                this.dragStartScreen = null;
                this.dragStartOriginalPos = null;
                this.draggingMultiple = false;
                this.multiDragStartPositions = null;
            }
            if (this.resizingDrawing === drawing) {
                this.isResizing = false;
                this.resizingDrawing = null;
                this.resizingPointIndex = null;
                this.resizeBeforeState = null;
            }
            if (this.customHandleDrawing === drawing || this.customHandleDraggingDrawing === drawing) {
                this.isCustomHandleDrag = false;
                this.isCustomHandleDragging = false;
                this.customHandleDrawing = null;
                this.customHandleDraggingDrawing = null;
                this.customHandleRole = null;
                this.customHandleStart = null;
                this.customHandleBeforeState = null;
            }
            if (this._hoveredDrawing === drawing) {
                this._hoveredDrawing = null;
            }
            if (this._hoverHandleBoundDrawingId === drawing.id) {
                this._hoverHandleBoundDrawingId = null;
                this._hoverHandleBoundGroupNode = null;
            }

            drawing.destroy();
            
            // Hide the drawing toolbar if it was showing this drawing
            if (this.toolbar && this.toolbar.currentDrawing === drawing) {
                this.toolbar.hide();
            }
            
            // Clear selection if deleted drawing was selected
            if (this.selectedDrawing === drawing) {
                this.selectedDrawing = null;
            }
            if (Array.isArray(this.selectedDrawings) && this.selectedDrawings.length > 0) {
                this.selectedDrawings = this.selectedDrawings.filter(d => d !== drawing);
                if (!this.selectedDrawing && this.selectedDrawings.length > 0) {
                    this.selectedDrawing = this.selectedDrawings[this.selectedDrawings.length - 1] || null;
                }
            }
            
            // Clear all axis highlights after deletion
            if (this.chart?.svg) {
                this.chart.svg.selectAll('.axis-highlight-group').remove();
                this.chart.svg.selectAll('.axis-highlight-price').remove();
                this.chart.svg.selectAll('.axis-highlight-price-text').remove();
                this.chart.svg.selectAll('.axis-highlight-time').remove();
                this.chart.svg.selectAll('.axis-highlight-time-text').remove();
                this.chart.svg.selectAll('[class*="axis-highlight"]').remove();
            }
            if (this.chart?.clearAxisHighlightZones) {
                this.chart.clearAxisHighlightZones();
            }
            
            this.saveDrawings();
            
            // Broadcast to other panels in real-time
            if (this.chart.broadcastDrawingChange) {
                this.chart.broadcastDrawingChange('remove', drawing, index);
            }
            
            // Refresh object tree if available
            if (this.objectTreeManager) {
                this.objectTreeManager.refresh();
            }
            
            // [debug removed]
        }
    }
    
    /**
     * Undo the last action
     */
    undo() {
        if (this.history) {
            return this.history.undo();
        }
        return false;
    }
    
    /**
     * Redo the last undone action
     */
    redo() {
        if (this.history) {
            return this.history.redo();
        }
        return false;
    }

    /**
     * Duplicate a drawing (Clone) - exact same position
     */
    duplicateDrawing(drawing) {
        try {
            const toolInfo = this.toolRegistry[drawing.type];
            if (!toolInfo) {
                console.error('Unknown drawing type:', drawing.type);
                return;
            }
            
            // Get JSON data from drawing
            const jsonData = drawing.toJSON ? drawing.toJSON() : {
                type: drawing.type,
                points: JSON.parse(JSON.stringify(drawing.points)),
                style: JSON.parse(JSON.stringify(drawing.style || {}))
            };
            
            const newDrawing = toolInfo.class.fromJSON(jsonData);
            newDrawing.id = generateUUID();
            
            // Offset clone slightly so it appears near the original
            const priceRange = this.chart.yScale ? this.chart.yScale.domain() : [0, 1];
            const domainSpan = (priceRange[1] - priceRange[0]);
            const priceOffset = Number.isFinite(domainSpan) && domainSpan !== 0 ? domainSpan * 0.015 : 0;
            const candleOffset = 3;
            newDrawing.points = newDrawing.points.map(p => ({
                ...p,
                x: Number.isFinite(p.x) ? p.x + candleOffset : p.x,
                y: Number.isFinite(p.y) && priceOffset !== 0 ? p.y - priceOffset : p.y
            }));
            
            this.addDrawing(newDrawing);
            this.selectDrawing(newDrawing); // Select the new clone
            // [debug removed]
        } catch (err) {
            console.error('Failed to clone drawing:', err);
        }
    }

    /**
     * Bring drawing to front
     */
    bringToFront(drawing) {
        // Move to end of array (renders last = on top)
        const index = this.drawings.indexOf(drawing);
        if (index > -1) {
            this.drawings.splice(index, 1);
            this.drawings.push(drawing);
            this.saveDrawings();
        }
        
        // Also update SVG immediately
        if (drawing.group) {
            drawing.group.raise();
        }
        
        // [debug removed]
    }

    /**
     * Send drawing to back
     */
    sendToBack(drawing) {
        // Move to start of array (renders first = behind)
        const index = this.drawings.indexOf(drawing);
        if (index > -1) {
            this.drawings.splice(index, 1);
            this.drawings.unshift(drawing);
            this.saveDrawings();
        }
        
        // Also update SVG immediately
        if (drawing.group) {
            drawing.group.lower();
        }
        
        // [debug removed]
    }

    /**
     * Redraw all drawings (called on zoom/pan)
     */
    redrawAll() {
        // Check if scales are available
        if (!this.chart.xScale || !this.chart.yScale) {
            console.warn('⚠️ Scales not ready for drawing');
            return;
        }
        
        // Update clip path dimensions in case chart was resized
        this.updateClipPath();
        
        // Clear existing SVG elements
        this.drawingsGroup.selectAll('*').remove();
        if (this.labelsGroup) {
            this.labelsGroup.selectAll('*').remove();
        }
        
        // Re-render all drawings with updated scales
        this.drawings.forEach(drawing => {
            this.renderDrawing(drawing);
        });
    }

    /**
 
     * @param {Object} options
     * @param {boolean} [options.confirmPrompt=true]
     * @returns {boolean} - True if drawings were cleared
     */
    clearDrawings({ confirmPrompt = true } = {}) {
        const count = this.drawings.length;
        if (count === 0) {
            return false;
        }

        if (confirmPrompt) {
            const confirmed = window.confirm(`Remove ${count} drawing${count === 1 ? '' : 's'}?`);
            if (!confirmed) {
                return false;
            }
        }

        this.drawings.forEach(drawing => drawing.destroy());
        this.drawings = [];
        this.selectedDrawing = null;
        this.toolbar.hide();
        if (this.drawingsGroup) {
            this.drawingsGroup.selectAll('*').remove();
        }
        
        // Clear all axis highlights
        if (this.chart?.svg) {
            this.chart.svg.selectAll('.axis-highlight-group').remove();
            this.chart.svg.selectAll('.axis-highlight-price').remove();
            this.chart.svg.selectAll('.axis-highlight-price-text').remove();
            this.chart.svg.selectAll('.axis-highlight-time').remove();
            this.chart.svg.selectAll('.axis-highlight-time-text').remove();
            this.chart.svg.selectAll('[class*="axis-highlight"]').remove();
        }
        if (this.chart?.clearAxisHighlightZones) {
            this.chart.clearAxisHighlightZones();
            if (this.chart.scheduleRender) {
                this.chart.scheduleRender();
            }
        }
        this.saveDrawings();
        
        // Broadcast to other panels in real-time
        if (this.chart.broadcastDrawingChange) {
            this.chart.broadcastDrawingChange('clear');
        }
        
        // [debug removed]
        return true;
    }

    /**
     * Returns true when the given screen-space point is inside a volume profile values label box.
     */
    isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }

        const labelNodes = drawing.group.selectAll('.volume-profile-values-label').nodes();
        if (!Array.isArray(labelNodes) || labelNodes.length === 0) {
            return false;
        }

        const labelPadX = 11;
        const labelPadY = 8;
        const clientPadX = 14;
        const clientPadY = 10;
        const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
        const svgRect = svgNode && typeof svgNode.getBoundingClientRect === 'function'
            ? svgNode.getBoundingClientRect()
            : null;
        const clientX = Number.isFinite(mouseX) && svgRect ? (svgRect.left + mouseX) : NaN;
        const clientY = Number.isFinite(mouseY) && svgRect ? (svgRect.top + mouseY) : NaN;

        for (const label of labelNodes) {
            if (!label) continue;

            let insideSvg = false;
            if (typeof label.getBBox === 'function') {
                let bb = null;
                try {
                    bb = label.getBBox();
                } catch (_) {
                    bb = null;
                }

                if (bb) {
                    insideSvg = mouseX >= (bb.x - labelPadX) && mouseX <= (bb.x + bb.width + labelPadX)
                        && mouseY >= (bb.y - labelPadY) && mouseY <= (bb.y + bb.height + labelPadY);
                }
            }

            if (insideSvg) {
                return true;
            }

            if (Number.isFinite(clientX) && Number.isFinite(clientY) && typeof label.getBoundingClientRect === 'function') {
                const rect = label.getBoundingClientRect();
                if (rect) {
                    const insideClient = clientX >= (rect.left - clientPadX) && clientX <= (rect.right + clientPadX)
                        && clientY >= (rect.top - clientPadY) && clientY <= (rect.bottom + clientPadY);
                    if (insideClient) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Clear all drawings (legacy alias)
     */
    clearAll() {
        this.clearDrawings();
    }

    /**
     * Get storage key for current symbol
     * SHARED across all timeframes - drawings appear on all timeframes
     */
    getStorageKey() {
        const fileId = this.chart.currentFileId || 'default';
        const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
            ? this.chart.getActiveTradingSessionId()
            : null;
        if (sessionId) {
            return `chart_drawings_s${sessionId}_${fileId}`;
        }
        return `chart_drawings_${fileId}`;
    }

    /**
     * Save drawings to localStorage and API (hybrid approach)
     */
    saveDrawings() {
        // Ensure all drawings have chart reference before saving
        this.drawings.forEach(d => {
            if (!d.chart) {
                d.chart = this.chart;
                // [debug removed]
            }
        });
        
        const data = this.drawings.map(d => d.toJSON());
        const key = this.getStorageKey();

        // 1. Save to localStorage immediately (instant, works offline)
        try {
            localStorage.setItem(key, JSON.stringify(data));
            // [debug removed]
        } catch (error) {
            console.warn('⚠️ Failed to save drawings to localStorage:', error?.message || error);
        }

        // 2. Save to session state for backtesting sessions
        const isUndoRedo = this.history && this.history.isPerformingUndoRedo;
        if (!isUndoRedo && this.chart && typeof this.chart.scheduleSessionStateSave === 'function') {
            try {
                this.chart.scheduleSessionStateSave({ drawings: data });
            } catch (error) {
                console.warn('⚠️ Failed to queue session state save for drawings:', error?.message || error);
            }
        }
        
        // 3. Save to API for cross-device sync (background, debounced)
        if (!isUndoRedo) {
            try {
                this.scheduleSaveToAPI(data);
            } catch (error) {
                console.warn('⚠️ Failed to schedule drawings API sync:', error?.message || error);
            }
        }
        
        // 4. Optional URL sync for drawings (disabled by default to avoid very long URLs / 414 errors)
        const shouldSyncDrawingsToUrl = (
            typeof window !== 'undefined' &&
            window &&
            window.__ENABLE_DRAWINGS_URL_SYNC__ === true
        );
        if (!isUndoRedo && shouldSyncDrawingsToUrl) {
            try {
                this.updateURLWithDrawings();
            } catch (error) {
                console.warn('⚠️ Failed to update URL with drawings:', error?.message || error);
            }
        }
        
        // Log coordinate system for each drawing
        data.forEach((d, i) => {
            // [debug removed]
        });

        try {
            window.dispatchEvent(new CustomEvent('drawingsChanged'));
        } catch (error) {
            console.warn('⚠️ Failed to dispatch drawingsChanged event:', error?.message || error);
        }
    }

    /**
     * Schedule API save with debouncing to avoid excessive requests
     */
    scheduleSaveToAPI(data) {
        // Clear existing timer
        if (this._apiSaveTimer) {
            clearTimeout(this._apiSaveTimer);
        }
        
        // Debounce API saves by 2 seconds
        this._apiSaveTimer = setTimeout(() => {
            this.saveDrawingsToAPI(data);
        }, 2000);
    }

    /**
     * Save drawings to backend API for cross-device sync
     */
    async saveDrawingsToAPI(data) {
        try {
            const symbol = this.chart.currentFileId || 'default';
            const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
                ? this.chart.getActiveTradingSessionId()
                : null;
            
            const token = localStorage.getItem('token');
            if (!token) {
                // User not logged in, skip API save
                return;
            }
            
            const response = await fetch(`/api/chart/drawings/${encodeURIComponent(symbol)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    drawings: data,
                    session_id: sessionId
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Drawings synced to cloud (${result.count} drawings)`);
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - drawings saved locally only');
            } else {
                console.warn('⚠️ Failed to sync drawings to cloud:', response.statusText);
            }
        } catch (error) {
            console.warn('⚠️ Error syncing drawings to cloud:', error.message);
            // Fail silently - localStorage still has the data
        }
    }

    /**
     * Load drawings from URL parameters (for sharing across tabs/browsers)
     * This allows drawings to persist even without localStorage or authentication
     */
    loadDrawingsFromURL() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const drawingsParam = urlParams.get('drawings');

            const allowUrlDrawingsSync = (
                typeof window !== 'undefined' &&
                window &&
                window.__ENABLE_DRAWINGS_URL_SYNC__ === true
            );

            // URL drawings sync is opt-in only. If disabled, clean stale parameter and ignore it.
            if (!allowUrlDrawingsSync) {
                if (drawingsParam) {
                    const url = new URL(window.location);
                    url.searchParams.delete('drawings');
                    window.history.replaceState({}, '', url);
                }
                return null;
            }
            
            if (!drawingsParam) {
                return null;
            }
            
            // Decode base64 and decompress
            const decompressed = this.decompressDrawings(drawingsParam);
            if (decompressed && Array.isArray(decompressed)) {
                console.log(`📥 Found ${decompressed.length} drawings in URL`);
                return decompressed;
            }
            
            return null;
        } catch (error) {
            console.warn('⚠️ Error loading drawings from URL:', error.message);
            return null;
        }
    }
    
    /**
     * Compress drawings for URL encoding
     */
    compressDrawings(drawings) {
        try {
            const json = JSON.stringify(drawings);
            // Use LZString compression if available, otherwise base64
            if (window.LZString) {
                return LZString.compressToEncodedURIComponent(json);
            } else {
                return btoa(encodeURIComponent(json));
            }
        } catch (error) {
            console.warn('Failed to compress drawings:', error);
            return null;
        }
    }
    
    /**
     * Decompress drawings from URL parameter
     */
    decompressDrawings(compressed) {
        try {
            let json;
            // Try LZString decompression first
            if (window.LZString) {
                json = LZString.decompressFromEncodedURIComponent(compressed);
            }
            // Fallback to base64
            if (!json) {
                json = decodeURIComponent(atob(compressed));
            }
            return JSON.parse(json);
        } catch (error) {
            console.warn('Failed to decompress drawings:', error);
            return null;
        }
    }
    
    /**
     * Update URL with current drawings (for sharing)
     */
    updateURLWithDrawings() {
        try {
            if (!this.drawings || this.drawings.length === 0) {
                // Remove drawings parameter if no drawings
                const url = new URL(window.location);
                url.searchParams.delete('drawings');
                window.history.replaceState({}, '', url);
                return;
            }
            
            // Compress and encode drawings
            const compressed = this.compressDrawings(this.drawings);
            if (!compressed) return;

            // Hard limit guard: avoid generating URLs that can exceed server/browser limits.
            // This protects refresh/navigation from 414 Request-URI Too Large.
            const MAX_DRAWINGS_PARAM_LENGTH = 1500;
            if (compressed.length > MAX_DRAWINGS_PARAM_LENGTH) {
                const url = new URL(window.location);
                url.searchParams.delete('drawings');
                window.history.replaceState({}, '', url);
                console.warn(`⚠️ Drawings URL sync skipped (${compressed.length} chars > ${MAX_DRAWINGS_PARAM_LENGTH}).`);
                return;
            }
            
            // Update URL without reloading page
            const url = new URL(window.location);
            url.searchParams.set('drawings', compressed);
            window.history.replaceState({}, '', url);
            
            console.log('🔗 URL updated with drawings (shareable link)');
        } catch (error) {
            console.warn('Failed to update URL with drawings:', error);
        }
    }

    normalizeLegacyRangeToolPayload(item) {
        if (!item || typeof item !== 'object') return;

        let inferredMode = null;
        if (item.type === 'price-range') {
            inferredMode = 'price';
        } else if (item.type === 'date-range') {
            inferredMode = 'time';
        } else if (item.type === 'date-price-range') {
            inferredMode = 'both';
        } else {
            return;
        }

        if (!item.style || typeof item.style !== 'object') {
            item.style = {};
        }

        if (item.style.rangeMode === undefined || item.style.rangeMode === null || item.style.rangeMode === '') {
            item.style.rangeMode = inferredMode;
        }

        item.type = 'date-price-range';
    }

    /**
     * Load drawings from backend API for cross-device sync
     */
    async loadDrawingsFromAPI() {
        try {
            const symbol = this.chart.currentFileId || 'default';
            const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
                ? this.chart.getActiveTradingSessionId()
                : null;
            
            const token = localStorage.getItem('token');
            if (!token) {
                // User not logged in, skip API load
                return null;
            }
            
            const url = new URL(`/api/chart/drawings/${encodeURIComponent(symbol)}`, window.location.origin);
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
                if (result.success && result.drawings && result.drawings.length > 0) {
                    return result.drawings;
                }
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - using local drawings only');
            }
            
            return null;
        } catch (error) {
            console.warn('⚠️ Error loading drawings from cloud:', error.message);
            return null;
        }
    }

    /**
     * Load drawings from API (cloud sync) or localStorage (fallback)
     * Converts timestamps to indices for current timeframe
     */
    async loadDrawings() {
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) {
            console.warn(`⚠️ Cannot load drawings yet - chart has no data`);
            return; // _drawingsLoaded stays false — listener will retry
        }

        let saved = null;
        
        // 1. Try loading from URL parameters first (for sharing across tabs/browsers)
        const urlDrawings = this.loadDrawingsFromURL();
        if (urlDrawings) {
            saved = JSON.stringify(urlDrawings);
            console.log('📥 Loaded drawings from URL (shared link)');
        }
        // 2. Try loading from API for cross-device sync (requires authentication)
        else {
            const apiDrawings = await this.loadDrawingsFromAPI();
            if (apiDrawings) {
                saved = JSON.stringify(apiDrawings);
                console.log('📥 Loaded drawings from cloud');
            }
            // 3. Fall back to localStorage
            else {
                const key = this.getStorageKey();
                saved = localStorage.getItem(key);
                if (!saved && key.includes('_s')) {
                    const fileId = this.chart.currentFileId || 'default';
                    const legacyKey = `chart_drawings_${fileId}`;
                    const legacy = localStorage.getItem(legacyKey);
                    if (legacy) {
                        saved = legacy;
                    }
                }
                if (saved) {
                    console.log('📥 Loaded drawings from localStorage');
                }
            }
        }
        
        // [debug removed]

        // Clear any existing drawings before loading to prevent duplicates
        // (can happen when loadDrawings is called multiple times via chartDataLoaded retry)
        if (this.drawings.length > 0) {
            this.drawings.forEach(d => { try { d.destroy(); } catch(e) {} });
            this.drawings = [];
            if (this.drawingsGroup) this.drawingsGroup.selectAll('*').remove();
        }

        // Mark as loaded regardless of whether there are saved drawings
        this._drawingsLoaded = true;

        if (!saved) {
            // [debug removed]
            return;
        }
        
        try {
            const data = JSON.parse(saved);
            // [debug removed]

            const normalizeDashPatterns = (node) => {
                if (!node) return;
                if (typeof node === 'string') return;
                if (Array.isArray(node)) {
                    node.forEach(normalizeDashPatterns);
                    return;
                }
                if (typeof node === 'object') {
                    Object.keys(node).forEach((k) => {
                        const v = node[k];
                        if (v === '5,5') {
                            node[k] = '10,6';
                        } else if (v && typeof v === 'object') {
                            normalizeDashPatterns(v);
                        }
                    });
                }
            };
            
            // CRITICAL: In replay mode, use full raw data then resample to full timeframe data
            const replaySystem = this.chart.replaySystem;
            const isReplayActive = replaySystem && replaySystem.isActive;
            let conversionData = this.chart.data;
            
            if (isReplayActive && replaySystem.fullRawData && replaySystem.fullRawData.length > 0) {
                // In replay mode, resample the FULL dataset to current timeframe
                try {
                    const fullResampled = this.chart.resampleData(replaySystem.fullRawData, this.chart.currentTimeframe);
                    conversionData = fullResampled;
                    // [debug removed]
                } catch (error) {
                    console.warn('⚠️ Failed to resample full data in replay mode, using current data:', error);
                }
            }
            
            data.forEach((item, index) => {
                this.normalizeLegacyRangeToolPayload(item);
                normalizeDashPatterns(item);
                const toolInfo = this.toolRegistry[item.type];
                if (toolInfo) {
                    // IMPORTANT: Preserve original timestamp points before conversion
                    let originalTimestampPoints = null;
                    if (item.coordinateSystem === 'timestamp' && item.points) {
                        // Save the original timestamps - these should NEVER change
                        originalTimestampPoints = item.points.map(p => ({
                            timestamp: p.timestamp,
                            price: p.price || p.y
                        }));
                        
                        // [debug removed]
                        // Convert to indices for rendering with correct timeframe
                        item.points = CoordinateUtils.pointsFromTimestamps(originalTimestampPoints, conversionData, this.chart.currentTimeframe);
                    }
                    
                    const drawing = toolInfo.class.fromJSON(item, this.chart);
                    drawing.chart = this.chart;
                    
                    // Restore the original timestamp points (critical for timeframe switching)
                    if (originalTimestampPoints) {
                        drawing.timestampPoints = originalTimestampPoints;
                    }
                    
                    this.drawings.push(drawing);
                    this.renderDrawing(drawing);
                } else {
                    console.error(`❌ Unknown tool type: ${item.type}`);
                }
            });
            
            // [debug removed]

            if (key.includes('_s')) {
                this.saveDrawings();
            }
            
            // Refresh object tree if available
            if (this.objectTreeManager) {
                this.objectTreeManager.refresh();
            }
        } catch (error) {
            console.error('❌ Failed to load drawings:', error);
        }
    }

    loadDrawingsFromData(data) {
        if (!Array.isArray(data)) return;
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) return;

        try {
            if (this.drawings && this.drawings.length > 0) {
                this.drawings.forEach(d => {
                    try { d.destroy(); } catch (e) {}
                });
                this.drawings = [];
            }
            if (this.drawingsGroup) {
                this.drawingsGroup.selectAll('*').remove();
            }

            const normalizeDashPatterns = (node) => {
                if (!node) return;
                if (typeof node === 'string') return;
                if (Array.isArray(node)) {
                    node.forEach(normalizeDashPatterns);
                    return;
                }
                if (typeof node === 'object') {
                    Object.keys(node).forEach((k) => {
                        const v = node[k];
                        if (v === '5,5') {
                            node[k] = '10,6';
                        } else if (v && typeof v === 'object') {
                            normalizeDashPatterns(v);
                        }
                    });
                }
            };

            const replaySystem = this.chart.replaySystem;
            const isReplayActive = replaySystem && replaySystem.isActive;
            let conversionData = this.chart.data;
            if (isReplayActive && replaySystem.fullRawData && replaySystem.fullRawData.length > 0) {
                try {
                    const fullResampled = this.chart.resampleData(replaySystem.fullRawData, this.chart.currentTimeframe);
                    conversionData = fullResampled;
                } catch (error) {}
            }

            data.forEach((item) => {
                this.normalizeLegacyRangeToolPayload(item);
                normalizeDashPatterns(item);
                const toolInfo = this.toolRegistry[item.type];
                if (!toolInfo) return;

                let originalTimestampPoints = null;
                if (item.coordinateSystem === 'timestamp' && item.points) {
                    originalTimestampPoints = item.points.map(p => ({
                        timestamp: p.timestamp,
                        price: p.price || p.y
                    }));
                    item.points = CoordinateUtils.pointsFromTimestamps(originalTimestampPoints, conversionData, this.chart.currentTimeframe);
                }

                const drawing = toolInfo.class.fromJSON(item, this.chart);
                drawing.chart = this.chart;
                if (originalTimestampPoints) {
                    drawing.timestampPoints = originalTimestampPoints;
                }
                this.drawings.push(drawing);
                this.renderDrawing(drawing);
            });

            if (this.objectTreeManager) {
                this.objectTreeManager.refresh();
            }
        } catch (e) {
            console.warn('⚠️ Failed to load drawings from data', e);
        }
    }

    /**
     * Export drawings as JSON
     */
    exportDrawings() {
        const data = this.drawings.map(d => d.toJSON());
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import drawings from JSON
     */
    importDrawings(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this.clearAll();
            data.forEach(item => {
                this.normalizeLegacyRangeToolPayload(item);
                const toolInfo = this.toolRegistry[item.type];
                if (toolInfo) {
                    const drawing = toolInfo.class.fromJSON(item);
                    this.addDrawing(drawing);
                }
            });
        } catch (error) {
            console.error('Failed to import drawings:', error);
        }
    }

    /**
     * Refresh drawings for new timeframe
     * Converts all drawings from their stored timestamps to indices for current timeframe
     */
    refreshDrawingsForTimeframe() {
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) {
            console.warn('⚠️ Cannot refresh drawings: no chart data available');
            return;
        }
        
        // [debug removed]
        // [debug removed]
        
        // CRITICAL: In replay mode, use full raw data then resample to full timeframe data
        // This ensures drawings with timestamps beyond current replay position are handled correctly
        const replaySystem = this.chart.replaySystem;
        const isReplayActive = replaySystem && replaySystem.isActive;
        let conversionData = this.chart.data;
        
        if (isReplayActive && replaySystem.fullRawData && replaySystem.fullRawData.length > 0) {
            // In replay mode, resample the FULL dataset to current timeframe
            // This gives us all candles needed for timestamp lookup
            try {
                const fullResampled = this.chart.resampleData(replaySystem.fullRawData, this.chart.currentTimeframe);
                conversionData = fullResampled;
                // [debug removed]
            } catch (error) {
                console.warn('⚠️ Failed to resample full data in replay mode, using current data:', error);
            }
        }
        
        // Instead of destroying and recreating, just update the points
        this.drawings.forEach((drawing, index) => {
            // Use the STORED timestamps (not recalculated ones)
            if (drawing.timestampPoints && drawing.timestampPoints.length > 0) {
                // Convert timestamps back to indices for the NEW timeframe data
                const newPoints = CoordinateUtils.pointsFromTimestamps(drawing.timestampPoints, conversionData, this.chart.currentTimeframe);
                
                // Update the drawing's points AND chart reference
                drawing.points = newPoints;
                drawing.chart = this.chart; // Update chart reference
                
                // Destroy old SVG elements
                if (drawing.group) {
                    drawing.group.remove();
                    drawing.group = null;
                }
                
                // Re-render with new points
                this.renderDrawing(drawing);
            }
        });
        
        // [debug removed]
        
        // Refresh object tree if available
        if (this.objectTreeManager) {
            this.objectTreeManager.refresh();
        }
    }

    /**
     * Toggle magnet mode - cycles through off -> weak -> strong -> off
     */
    toggleMagnetMode() {
        const modes = ['off', 'weak', 'strong'];
        const currentIndex = modes.indexOf(this.magnetMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.magnetMode = modes[nextIndex];
        // [debug removed]
        return this.magnetMode;
    }

    /**
     * Set magnet mode directly
     * @param {string} mode - 'off', 'weak', or 'strong'
     */
    setMagnetMode(mode) {
        if (['off', 'weak', 'strong'].includes(mode)) {
            this.magnetMode = mode;
            // [debug removed]
            return this.magnetMode;
        }
        return this.magnetMode;
    }

    /**
     * Toggle keep drawing mode
     */
    toggleKeepDrawingMode() {
        this.keepDrawingMode = !this.keepDrawingMode;
        // [debug removed]
        return this.keepDrawingMode;
    }

    /**
     * Handle emoji/sticker/icon selection from picker
     */
    handleEmojiSelection(options) {
        if (!options) {
            console.warn('Emoji selection payload missing.');
            return;
        }
        const resolved = EmojiStickerTool.resolveOptions(options);
        this.currentEmojiOptions = resolved;
        this.pendingEmojiOptions = resolved;
        this.setTool('emoji');
        // [debug removed]
    }

    /**
     * Set eraser mode - click on drawings to delete them
     */
    setEraserMode(enabled) {
        this.eraserMode = enabled;
        if (enabled) {
            this.clearTool();
            // Add eraser class to SVG for visual feedback
            if (this.svg) {
                this.svg.classed('eraser-mode', true);
            }
        } else {
            if (this.svg) {
                this.svg.classed('eraser-mode', false);
            }
        }
        // [debug removed]
    }

    /**
     * Handle eraser click on drawing
     */
    handleEraserClick(drawingId) {
        if (!this.eraserMode) return;
        const drawing = this.drawings.find(d => d.id === drawingId);
        if (drawing) {
            this.deleteDrawing(drawing); // Pass the drawing object, not ID
            // [debug removed]
        }
    }

    /**
     * Show tooltip for path/brush drawing
     */
    showPathTooltip() {
        // Remove existing tooltip if any
        this.hidePathTooltip();
        
        // Read theme accent color from CSS variables
        const root = document.documentElement;
        const accentRgb = getComputedStyle(root).getPropertyValue('--sp-accent-rgb').trim() || '41, 98, 255';
        const textColor = getComputedStyle(root).getPropertyValue('--sp-text').trim() || '#f3f6ff';

        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.id = 'path-drawing-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--sp-bg, #131722);
            color: ${textColor};
            padding: 9px 18px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.01em;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow:
                0 4px 12px rgba(0, 0, 0, 0.3),
                0 0 8px rgba(${accentRgb}, 0.5),
                0 0 20px rgba(${accentRgb}, 0.25);
            z-index: 10000;
            pointer-events: none;
            border: 1px solid rgba(${accentRgb}, 0.75);
        `;
        tooltip.textContent = 'Right click to end';
        
        document.body.appendChild(tooltip);
        this.pathTooltip = tooltip;
    }

    /**
     * Hide path drawing tooltip
     */
    hidePathTooltip() {
        if (this.pathTooltip) {
            this.pathTooltip.remove();
            this.pathTooltip = null;
        }
    }

    /**
     * Start rectangular selection (Ctrl+drag)
     */
    startRectangularSelection(event) {
        // Prevent default behavior and stop propagation
        event.preventDefault();
        event.stopPropagation();
        
        const rect = this.svg.node().getBoundingClientRect();
        this.rectSelectStart = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        this.isRectSelecting = true;
        
        // Enable SVG pointer-events temporarily for rectangular selection
        this.svg.style('pointer-events', 'all');
        
        // Create selection rectangle visual
        if (!this.rectSelectRect) {
            this.rectSelectRect = this.svg.append('rect')
                .attr('class', 'selection-rectangle')
                .style('fill', 'rgba(33, 150, 243, 0.1)')
                .style('stroke', '#2196F3')
                .style('stroke-width', '1')
                .style('stroke-dasharray', '4,4')
                .style('pointer-events', 'none');
        }
        
        // Set up document-level mouse event listeners for dragging
        const handleMouseMove = (e) => {
            if (this.isRectSelecting) {
                // Check if Ctrl is still held
                if (!e.ctrlKey) {
                    // [debug removed]
                    this.cancelRectangularSelection();
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                    document.removeEventListener('keyup', handleKeyUp);
                    return;
                }
                this.updateRectangularSelection(e);
            }
        };
        
        const handleMouseUp = (e) => {
            if (this.isRectSelecting) {
                this.completeRectangularSelection();
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('keyup', handleKeyUp);
            }
        };
        
        const handleKeyUp = (e) => {
            if (e.key === 'Control' && this.isRectSelecting) {
                // [debug removed]
                this.cancelRectangularSelection();
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('keyup', handleKeyUp);
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keyup', handleKeyUp);
        
        // [debug removed]
    }

    /**
     * Update rectangular selection during drag
     */
    updateRectangularSelection(event) {
        if (!this.isRectSelecting || !this.rectSelectStart) return;
        
        const rect = this.svg.node().getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        
        const x = Math.min(this.rectSelectStart.x, currentX);
        const y = Math.min(this.rectSelectStart.y, currentY);
        const width = Math.abs(currentX - this.rectSelectStart.x);
        const height = Math.abs(currentY - this.rectSelectStart.y);
        
        this.rectSelectRect
            .attr('x', x)
            .attr('y', y)
            .attr('width', width)
            .attr('height', height);
    }

    /**
     * Complete rectangular selection and select drawings within rectangle
     */
    completeRectangularSelection() {
        if (!this.isRectSelecting || !this.rectSelectRect) return;
        
        // Get rectangle bounds
        const x = parseFloat(this.rectSelectRect.attr('x'));
        const y = parseFloat(this.rectSelectRect.attr('y'));
        const width = parseFloat(this.rectSelectRect.attr('width'));
        const height = parseFloat(this.rectSelectRect.attr('height'));
        
        // Find drawings that intersect with the rectangle
        const selectedDrawings = [];
        this.drawings.forEach(drawing => {
            if (this.isDrawingInRectangle(drawing, x, y, width, height)) {
                selectedDrawings.push(drawing);
            }
        });
        
        // Deselect all first
        this.deselectAll();
        
        // Select all drawings within rectangle
        selectedDrawings.forEach(drawing => {
            this.selectDrawing(drawing, true); // true = add to selection
        });
        
        // [debug removed]
        
        // Clean up
        this.rectSelectRect.remove();
        this.rectSelectRect = null;
        this.rectSelectStart = null;
        this.isRectSelecting = false;
        
        // Restore SVG pointer-events to allow chart panning
        this.svg.style('pointer-events', 'none');
    }

    /**
     * Cancel rectangular selection (when Ctrl is released)
     */
    cancelRectangularSelection() {
        if (!this.isRectSelecting) return;
        
        // [debug removed]
        
        // Clean up selection rectangle visual
        if (this.rectSelectRect) {
            this.rectSelectRect.remove();
            this.rectSelectRect = null;
        }
        
        // Reset state
        this.rectSelectStart = null;
        this.isRectSelecting = false;
        
        // Restore SVG pointer-events to allow chart panning
        this.svg.style('pointer-events', 'none');
    }

    /**
     * Check if a drawing intersects with the selection rectangle
     */
    isDrawingInRectangle(drawing, rectX, rectY, rectWidth, rectHeight) {
        if (!drawing.group) return false;
        
        try {
            // Get bounding box of the drawing
            const bbox = drawing.group.node().getBBox();
            
            // Check if rectangles intersect
            const drawingLeft = bbox.x;
            const drawingRight = bbox.x + bbox.width;
            const drawingTop = bbox.y;
            const drawingBottom = bbox.y + bbox.height;
            
            const rectLeft = rectX;
            const rectRight = rectX + rectWidth;
            const rectTop = rectY;
            const rectBottom = rectY + rectHeight;
            
            // Rectangles intersect if they overlap on both axes
            const xOverlap = drawingLeft < rectRight && drawingRight > rectLeft;
            const yOverlap = drawingTop < rectBottom && drawingBottom > rectTop;
            
            return xOverlap && yOverlap;
        } catch (error) {
            console.warn('Error checking drawing intersection:', error);
            return false;
        }
    }

    /**
     * Find all drawings at a given point using geometric hit test
     * STROKE-ONLY: Only detects lines/strokes, NOT fills - click on line to select
     * @param {number} mouseX - X coordinate in SVG space
     * @param {number} mouseY - Y coordinate in SVG space
     * @param {Object} options
     * @param {boolean} options.includeVolumeProfileBodyHit - include VP bar-rect hits (level/boundary hits are always checked)
     * @returns {Array} - Array of drawings at this point, sorted by z-order (topmost first)
     */
    findDrawingsAtPoint(mouseX, mouseY, options = {}) {
        const baseHitTolerance = 10; // pixels - how close to a line to consider it a hit
        const includeVolumeProfileBodyHit = !!options.includeVolumeProfileBodyHit;
        const hitsById = new Map(); // drawingId -> { drawing, distance, z }
        
        const point = this.svg.node().createSVGPoint();
        point.x = mouseX;
        point.y = mouseY;
        
        // Only check strokes/lines - NO fill detection
        let z = 0;
        for (const drawing of this.drawings) {
            z++;
            if (!drawing.group || drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) continue;

            // Anchored VWAP: allow hit-testing from anchor and curve (for click/dblclick selection).
            if (drawing.type === 'anchored-vwap' && !hitsById.has(drawing.id)) {
                try {
                    let bestDistance = Infinity;
                    const anchor = Array.isArray(drawing.points) ? drawing.points[0] : null;
                    const xScale = this.chart && this.chart.xScale ? this.chart.xScale : null;
                    const yScale = this.chart && this.chart.yScale ? this.chart.yScale : null;

                    if (anchor && xScale && yScale) {
                        const anchorIndex = Math.round(anchor.x);
                        const anchorX = (this.chart && typeof this.chart.dataIndexToPixel === 'function')
                            ? this.chart.dataIndexToPixel(anchorIndex)
                            : xScale(anchorIndex);

                        let anchorYValue = anchor.y;
                        const cachedVwapPoints = drawing._cache && Array.isArray(drawing._cache.vwapPoints)
                            ? drawing._cache.vwapPoints
                            : null;
                        const hasChartData = Array.isArray(this.chart && this.chart.data) && this.chart.data.length > 0;
                        const hasMatchingCache = hasChartData && drawing._cache && drawing._cache.anchorIndex === anchorIndex;
                        if (hasMatchingCache && cachedVwapPoints && cachedVwapPoints.length > 0 && Number.isFinite(cachedVwapPoints[0].vwap)) {
                            anchorYValue = cachedVwapPoints[0].vwap;
                        }

                        const anchorY = yScale(anchorYValue);

                        if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
                            const dx = mouseX - anchorX;
                            const dy = mouseY - anchorY;
                            const distance = Math.sqrt((dx * dx) + (dy * dy));
                            const anchorHitTolerance = 20;

                            if (distance <= anchorHitTolerance) {
                                bestDistance = Math.min(bestDistance, distance);
                            }
                        }
                    }

                    const curveHitTolerance = 10;
                    const curveElements = drawing.group.selectAll('.anchored-vwap-curve').nodes();

                    for (const curve of curveElements) {
                        if (!curve) continue;

                        const curveSel = d3.select(curve);
                        const stroke = curveSel.attr('stroke') || curveSel.style('stroke');
                        const opacity = curveSel.style('opacity');
                        if (!stroke || stroke === 'none' || stroke === 'transparent' || opacity === '0') continue;

                        if (typeof curve.isPointInStroke === 'function' && curve.isPointInStroke(point)) {
                            bestDistance = Math.min(bestDistance, 0);
                            break;
                        }

                        if (typeof curve.getTotalLength === 'function' && typeof curve.getPointAtLength === 'function') {
                            const totalLength = curve.getTotalLength();
                            if (!Number.isFinite(totalLength) || totalLength <= 0) continue;

                            const sampleCount = Math.max(12, Math.min(220, Math.ceil(totalLength / 12)));
                            const step = totalLength / sampleCount;
                            let curveBestDistance = Number.POSITIVE_INFINITY;

                            for (let i = 0; i <= sampleCount; i++) {
                                const sample = curve.getPointAtLength(Math.min(totalLength, i * step));
                                const sx = sample?.x;
                                const sy = sample?.y;
                                if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

                                const dx = mouseX - sx;
                                const dy = mouseY - sy;
                                const distance = Math.sqrt((dx * dx) + (dy * dy));
                                if (distance < curveBestDistance) curveBestDistance = distance;
                                if (curveBestDistance <= curveHitTolerance) break;
                            }

                            if (curveBestDistance <= curveHitTolerance) {
                                bestDistance = Math.min(bestDistance, curveBestDistance);
                                break;
                            }
                        }
                    }

                    if (bestDistance !== Infinity) {
                        hitsById.set(drawing.id, { drawing, distance: bestDistance, z });
                    }
                } catch (error) {
                    console.warn('Error in anchored VWAP anchor hit test for drawing:', drawing.id, error);
                }

                continue;
            }

            // Arrow tools: allow fill-based hit testing
            if (!hitsById.has(drawing.id) && (drawing.type === 'arrow' || drawing.type === 'arrow-marker' || drawing.type === 'arrow-mark-up' || drawing.type === 'arrow-mark-down')) {
                try {
                    const fillHits = drawing.group.selectAll('.arrow-fill-hit').nodes();
                    for (const el of fillHits) {
                        if (!el) continue;

                        if (typeof el.isPointInFill === 'function') {
                            if (el.isPointInFill(point)) {
                                hitsById.set(drawing.id, { drawing, distance: 0, z });
                                break;
                            }
                        } else if (typeof el.getBBox === 'function') {
                            const bb = el.getBBox();
                            const inside = mouseX >= bb.x && mouseX <= (bb.x + bb.width)
                                && mouseY >= bb.y && mouseY <= (bb.y + bb.height);
                            if (inside) {
                                hitsById.set(drawing.id, { drawing, distance: 0, z });
                                break;
                            }
                        }
                    }
                    if (hitsById.has(drawing.id)) continue;
                } catch (error) {
                    console.warn('Error in arrow fill hit test for drawing:', drawing.id, error);
                }
            }

            const isFibLikeType = !!drawing.type && (
                drawing.type.startsWith('fibonacci-') ||
                drawing.type.startsWith('fib-') ||
                drawing.type.startsWith('trend-fib-') ||
                drawing.type === 'pitchfork' ||
                drawing.type === 'pitchfan'
            );

            const isPatternLikeType = !!drawing.type && (
                drawing.type.includes('pattern') ||
                drawing.type.startsWith('elliott-') ||
                drawing.type === 'head-shoulders' ||
                drawing.type === 'three-drives' ||
                drawing.type === 'cyclic-lines' ||
                drawing.type === 'time-cycles' ||
                drawing.type === 'sine-line'
            );

            const hitTolerance = (isFibLikeType || isPatternLikeType) ? 18 : baseHitTolerance;
            const minLineHitTolerance = (isFibLikeType || isPatternLikeType) ? 14 : 0;

            // Polyline/Path: allow vertex proximity hits so endpoints are easy to grab even if not exactly on the stroke
            if ((drawing.type === 'polyline' || drawing.type === 'path') && !hitsById.has(drawing.id)) {
                try {
                    const points = drawing.points || [];
                    if (points.length > 0) {
                        const xScale = this.chart && this.chart.xScale ? this.chart.xScale : null;
                        const yScale = this.chart && this.chart.yScale ? this.chart.yScale : null;
                        if (xScale && yScale) {
                            let best = Infinity;
                            const tol = Math.max(hitTolerance, 18);
                            for (let i = 0; i < points.length; i++) {
                                const p = points[i];
                                const px = this.chart && this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p.x) : xScale(p.x);
                                const py = yScale(p.y);
                                const dx = mouseX - px;
                                const dy = mouseY - py;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                if (dist < best) best = dist;
                                if (best <= 2) break;
                            }
                            if (best <= tol) {
                                hitsById.set(drawing.id, { drawing, distance: best, z });
                                continue;
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error in polyline/path vertex hover hit test:', drawing.id, error);
                }
            }

            if (drawing.type === 'bars-pattern') {
                if (typeof drawing.isPointInside === 'function') {
                    const scales = {
                        xScale: this.chart.xScale,
                        yScale: this.chart.yScale,
                        chart: this.chart
                    };
                    if (drawing.isPointInside(mouseX, mouseY, scales) && !hitsById.has(drawing.id)) {
                        hitsById.set(drawing.id, { drawing, distance: 0, z });
                        continue;
                    }
                }
            }

            // Risk/Reward tools: allow selecting/dragging by zone interior, not only stroke.
            if (!hitsById.has(drawing.id) && (drawing.type === 'long-position' || drawing.type === 'short-position')) {
                try {
                    const zoneRects = drawing.group.selectAll('.position-zone').nodes();
                    for (const rect of zoneRects) {
                        if (!rect) continue;

                        if (typeof rect.isPointInFill === 'function') {
                            if (rect.isPointInFill(point)) {
                                hitsById.set(drawing.id, { drawing, distance: 0, z });
                                break;
                            }
                        } else if (typeof rect.getBBox === 'function') {
                            const bb = rect.getBBox();
                            const inside = mouseX >= bb.x && mouseX <= (bb.x + bb.width)
                                && mouseY >= bb.y && mouseY <= (bb.y + bb.height);
                            if (inside) {
                                hitsById.set(drawing.id, { drawing, distance: 0, z });
                                break;
                            }
                        }
                    }
                    if (hitsById.has(drawing.id)) continue;
                } catch (error) {
                    console.warn('Error in risk/reward fill hit test for drawing:', drawing.id, error);
                }
            }

            // Volume Profile tools: select from boundaries/levels/labels.
            if (!hitsById.has(drawing.id) && this.isVolumeProfileToolType(drawing.type)) {
                try {
                    const allowProfileBodyZoneHit = false;
                    const allowProfileBarHit = includeVolumeProfileBodyHit;
                    let bestBoundaryDistance = Infinity;
                    const boundaryElements = drawing.group.selectAll('.volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-level-line').nodes();

                    for (const el of boundaryElements) {
                        if (!el) continue;

                        const x1 = parseFloat(el.getAttribute('x1'));
                        const y1 = parseFloat(el.getAttribute('y1'));
                        const x2 = parseFloat(el.getAttribute('x2'));
                        const y2 = parseFloat(el.getAttribute('y2'));
                        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

                        const elSel = d3.select(el);
                        const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                        const strokeWidth = parseFloat(elSel.attr('stroke-width') || elSel.style('stroke-width')) || 1;
                        const isBoundaryHit = elSel.classed('volume-profile-boundary-hit');
                        const tolerance = isBoundaryHit
                            ? Math.max(14, (strokeWidth / 2) + 0.5)
                            : Math.max(baseHitTolerance, (strokeWidth / 2) + 0.5);

                        if (distance <= tolerance) {
                            bestBoundaryDistance = Math.min(bestBoundaryDistance, distance);
                        }
                    }

                    if (bestBoundaryDistance !== Infinity) {
                        hitsById.set(drawing.id, { drawing, distance: bestBoundaryDistance, z });
                    }

                    // Also allow selecting from displayed candle value labels.
                    if (!hitsById.has(drawing.id) && this.isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY)) {
                        hitsById.set(drawing.id, { drawing, distance: 0, z });
                    }

                    // Keep background zone/body non-reactive.
                    if (allowProfileBodyZoneHit && !hitsById.has(drawing.id)) {
                        const isInsideRect = (rectNode, pad = 0) => {
                            if (!rectNode) return false;

                            const x = Number(rectNode.getAttribute('x'));
                            const y = Number(rectNode.getAttribute('y'));
                            const width = Number(rectNode.getAttribute('width'));
                            const height = Number(rectNode.getAttribute('height'));
                            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
                                return false;
                            }

                            return mouseX >= (x - pad) && mouseX <= (x + width + pad)
                                && mouseY >= (y - pad) && mouseY <= (y + height + pad);
                        };

                        // Hit test on the visible body itself (background and per-row bars).
                        const rangeRect = drawing.group.select('.volume-profile-range').node();
                        if (isInsideRect(rangeRect, 0.75)) {
                            hitsById.set(drawing.id, { drawing, distance: 0, z });
                        }
                    }

                    if (allowProfileBarHit && !hitsById.has(drawing.id)) {
                        const barRects = drawing.group.selectAll('rect').nodes();
                        for (const rect of barRects) {
                            if (!rect) continue;

                            const rectSel = d3.select(rect);
                            if (rectSel.classed('volume-profile-range')) continue;

                            const x = Number(rect.getAttribute('x'));
                            const y = Number(rect.getAttribute('y'));
                            const width = Number(rect.getAttribute('width'));
                            const height = Number(rect.getAttribute('height'));
                            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
                                continue;
                            }

                            const insideBar = mouseX >= (x - 0.75) && mouseX <= (x + width + 0.75)
                                && mouseY >= (y - 0.75) && mouseY <= (y + height + 0.75);
                            if (insideBar) {
                                hitsById.set(drawing.id, { drawing, distance: 0, z });
                                break;
                            }
                        }
                    }

                    if (allowProfileBodyZoneHit && !hitsById.has(drawing.id)) {
                        const boundaryLines = drawing.group.selectAll('.volume-profile-boundary').nodes();
                        if (Array.isArray(boundaryLines) && boundaryLines.length >= 2) {
                            const xValues = [];
                            let minY = Infinity;
                            let maxY = -Infinity;

                            boundaryLines.forEach((line) => {
                                if (!line) return;
                                const x1 = Number(line.getAttribute('x1'));
                                const x2 = Number(line.getAttribute('x2'));
                                const y1 = Number(line.getAttribute('y1'));
                                const y2 = Number(line.getAttribute('y2'));
                                if ([x1, x2, y1, y2].every(Number.isFinite)) {
                                    xValues.push(x1, x2);
                                    minY = Math.min(minY, y1, y2);
                                    maxY = Math.max(maxY, y1, y2);
                                }
                            });

                            if (xValues.length >= 2 && Number.isFinite(minY) && Number.isFinite(maxY)) {
                                const minX = Math.min(...xValues);
                                const maxX = Math.max(...xValues);
                                const isInsideProfileBody = mouseX >= minX && mouseX <= maxX
                                    && mouseY >= minY && mouseY <= maxY;

                                if (isInsideProfileBody) {
                                    hitsById.set(drawing.id, { drawing, distance: 0, z });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error in volume profile boundary hit test for drawing:', drawing.id, error);
                }

                continue;
            }
            
            // Special handling for tools that use isPointInside() (images, emojis, etc.)
            if (drawing.type === 'emoji' || drawing.type === 'image') {
                // [debug removed]
                if (typeof drawing.isPointInside === 'function') {
                    const scales = {
                        xScale: this.chart.xScale,
                        yScale: this.chart.yScale,
                        chart: this.chart
                    };
                    const isInside = drawing.isPointInside(mouseX, mouseY, scales);
                    // [debug removed]
                    if (isInside && !hitsById.has(drawing.id)) {
                        // [debug removed]
                        hitsById.set(drawing.id, { drawing, distance: 0, z });
                        continue;
                    }
                } else {
                    // [debug removed]
                }
            }
            
            try {
                const elements = drawing.group.selectAll('line, rect, circle, ellipse, polygon, polyline, path').nodes();
                let bestDistance = Infinity;
                for (const element of elements) {
                    const elementSel = d3.select(element);
                    const opacity = elementSel.style('opacity');
                    if (opacity === '0') continue;

                    if (drawing.type === 'date-price-range') {
                        if (elementSel.classed('range-fill-hit') || elementSel.classed('range-info-box')) {
                            continue;
                        }
                        if (element.tagName === 'line' && !elementSel.classed('range-mid-line-hit')) {
                            continue;
                        }
                    }

                    const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
                    const isHitArea = elementSel.classed('shape-border-hit');

                    const pointerEvents = elementSel.style('pointer-events') || elementSel.attr('pointer-events') || '';
                    const isTransparentStrokeHitArea = (stroke === 'transparent' || stroke === 'none' || !stroke) && pointerEvents === 'stroke';

                    if (!stroke || stroke === 'none' || stroke === 'transparent') {
                        if (!isHitArea && !isTransparentStrokeHitArea) continue;
                    }
                    
                    // Skip fill-only elements
                    const isFillElement = d3.select(element).classed('shape-fill') || 
                                          d3.select(element).classed('upper-fill') || 
                                          d3.select(element).classed('lower-fill');
                    if (isFillElement) continue;
                    
                    let isStrokeHit = false;
                    let hitDistance = Infinity;

                    // Prefer native stroke hit-testing so hover matches selectable zone exactly
                    if (typeof element.isPointInStroke === 'function') {
                        isStrokeHit = element.isPointInStroke(point);
                        if (isStrokeHit) hitDistance = 0;
                    }
                    
                    // For lines, check distance to line
                    if (!isStrokeHit && element.tagName === 'line') {
                        const x1 = parseFloat(element.getAttribute('x1'));
                        const y1 = parseFloat(element.getAttribute('y1'));
                        const x2 = parseFloat(element.getAttribute('x2'));
                        const y2 = parseFloat(element.getAttribute('y2'));
                        
                        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue;
                        
                        const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                        const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                        // Match actual stroke hit area (approx): stroke extends ~strokeWidth/2 from the path.
                        // For Fib/Elliott/Pattern tools, enforce a minimum tolerance so thin lines are easier to select.
                        const effectiveTolerance = Math.max((strokeWidth / 2) + 0.5, minLineHitTolerance);
                        
                        isStrokeHit = distance <= effectiveTolerance;
                        if (isStrokeHit) hitDistance = distance;
                    }
                    // Rect/circle/ellipse: compute border distance explicitly for stable overlap priority
                    else if (!isStrokeHit && element.tagName === 'rect') {
                        const rx = parseFloat(element.getAttribute('x')) || 0;
                        const ry = parseFloat(element.getAttribute('y')) || 0;
                        const rw = parseFloat(element.getAttribute('width')) || 0;
                        const rh = parseFloat(element.getAttribute('height')) || 0;
                        const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                        const effectiveTolerance = (strokeWidth / 2) + 0.5;
                        const distTop = this.pointToLineDistance(mouseX, mouseY, rx, ry, rx + rw, ry);
                        const distBottom = this.pointToLineDistance(mouseX, mouseY, rx, ry + rh, rx + rw, ry + rh);
                        const distLeft = this.pointToLineDistance(mouseX, mouseY, rx, ry, rx, ry + rh);
                        const distRight = this.pointToLineDistance(mouseX, mouseY, rx + rw, ry, rx + rw, ry + rh);
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        isStrokeHit = minDist <= effectiveTolerance;
                        if (isStrokeHit) hitDistance = minDist;
                    }
                    else if (!isStrokeHit && element.tagName === 'circle') {
                        const cx = parseFloat(element.getAttribute('cx')) || 0;
                        const cy = parseFloat(element.getAttribute('cy')) || 0;
                        const r = parseFloat(element.getAttribute('r')) || 0;
                        const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                        const effectiveTolerance = (strokeWidth / 2) + 0.5;
                        if (r > 0) {
                            const dx = mouseX - cx;
                            const dy = mouseY - cy;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const distFromBorder = Math.abs(dist - r);
                            const maxTol = Math.max(0.5, r - 1);
                            const tol = Math.min(effectiveTolerance, maxTol);
                            isStrokeHit = distFromBorder <= tol;
                            if (isStrokeHit) hitDistance = distFromBorder;
                        }
                    }
                    else if (!isStrokeHit && element.tagName === 'ellipse') {
                        const cx = parseFloat(element.getAttribute('cx')) || 0;
                        const cy = parseFloat(element.getAttribute('cy')) || 0;
                        const erx = parseFloat(element.getAttribute('rx')) || 0;
                        const ery = parseFloat(element.getAttribute('ry')) || 0;
                        const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                        const effectiveTolerance = (strokeWidth / 2) + 0.5;
                        if (erx > 0 && ery > 0) {
                            const ndx = (mouseX - cx) / erx;
                            const ndy = (mouseY - cy) / ery;
                            const normalizedDist = Math.sqrt(ndx * ndx + ndy * ndy);
                            const distFromBorder = Math.abs(normalizedDist - 1) * Math.min(erx, ery);
                            const maxTol = Math.max(0.5, Math.min(erx, ery) - 1);
                            const tol = Math.min(effectiveTolerance, maxTol);
                            isStrokeHit = distFromBorder <= tol;
                            if (isStrokeHit) hitDistance = distFromBorder;
                        }
                    }
                    
                    if (isStrokeHit) {
                        bestDistance = Math.min(bestDistance, hitDistance);
                    }
                }

                if (bestDistance !== Infinity && !hitsById.has(drawing.id)) {
                    hitsById.set(drawing.id, { drawing, distance: bestDistance, z });
                }
            } catch (error) {
                console.warn('Error in stroke hit test for drawing:', drawing.id, error);
                continue;
            }
        }
        
        // Sort by closest border first; if tied, prefer topmost (higher z)
        const hits = Array.from(hitsById.values());

        const lineTypeSet = new Set([
            'trendline',
            'horizontal',
            'vertical',
            'ray',
            'horizontal-ray',
            'extended-line',
            'cross-line',
            'arrow',
            'arrow-marker',
            'arrow-mark-up',
            'arrow-mark-down',
            'curve',
            'double-curve',
            'polyline',
            'path'
        ]);

        const isFibLikeDrawingType = (type) => !!type && (
            type.startsWith('fibonacci-') ||
            type.startsWith('fib-') ||
            type.startsWith('trend-fib-') ||
            type === 'pitchfork' ||
            type === 'pitchfan'
        );

        const isPatternLikeDrawingType = (type) => !!type && (
            type.includes('pattern') ||
            type.startsWith('elliott-') ||
            type === 'head-shoulders' ||
            type === 'three-drives' ||
            type === 'cyclic-lines' ||
            type === 'time-cycles' ||
            type === 'sine-line'
        );

        const isLineLikeDrawingType = (type) => (
            lineTypeSet.has(type) || isFibLikeDrawingType(type) || isPatternLikeDrawingType(type)
        );

        hits.sort((a, b) => {
            const aType = a.drawing && a.drawing.type;
            const bType = b.drawing && b.drawing.type;
            const aIsLine = isLineLikeDrawingType(aType);
            const bIsLine = isLineLikeDrawingType(bType);

            const aIsCircleLike = a.drawing && (a.drawing.type === 'circle' || a.drawing.type === 'ellipse');
            const bIsCircleLike = b.drawing && (b.drawing.type === 'circle' || b.drawing.type === 'ellipse');

            const aIsShapeLike = a.drawing && (a.drawing.type === 'rectangle' || a.drawing.type === 'triangle' || a.drawing.type === 'circle' || a.drawing.type === 'ellipse');
            const bIsShapeLike = b.drawing && (b.drawing.type === 'rectangle' || b.drawing.type === 'triangle' || b.drawing.type === 'circle' || b.drawing.type === 'ellipse');

            // For overlapping shapes, prefer the one that is BEHIND (lower z) so it can be dragged without selecting.
            if (aIsShapeLike && bIsShapeLike) {
                if (a.z !== b.z) return a.z - b.z;
            }

            if (aIsCircleLike && bIsCircleLike) {
                if (a.z !== b.z) return a.z - b.z;
            }

            // If a line and a circle/ellipse overlap, prefer the one that is BEHIND (lower z).
            // This allows dragging either object on first drag, even when overlapped.
            if ((aIsLine && bIsCircleLike) || (bIsLine && aIsCircleLike)) {
                if (a.z !== b.z) return a.z - b.z;
            }

            if (a.distance !== b.distance) return a.distance - b.distance;

            if (aIsLine !== bIsLine) return aIsLine ? -1 : 1;

            // If tied, prefer topmost (higher z)
            return b.z - a.z;
        });

        return hits.map(h => h.drawing);
    }
    
    /**
     * Find all individual lines at a point (not fills, only strokes)
     * Used to detect when multiple lines are stacked (>3 lines)
     * Detects ALL lines including multiple lines within the same shape
     * @param {number} mouseX - X coordinate in SVG space
     * @param {number} mouseY - Y coordinate in SVG space
     * @returns {Array} - Array of line info objects { drawing, element, drawingId, type, lineIndex }
     */
    findLinesAtPoint(mouseX, mouseY) {
        const hitTolerance = 8; // pixels - how close to a line to consider it a hit
        const linesAtPoint = [];
        
        for (const drawing of this.drawings) {
            if (!drawing.group || drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) continue;

            const drawingType = drawing.type || '';
            const isFibLikeDrawing = drawingType.startsWith('fibonacci-') || drawingType.startsWith('fib-') || drawingType.startsWith('trend-fib-') || drawingType === 'pitchfork' || drawingType === 'pitchfan';
            const isPatternLikeDrawing = drawingType.includes('pattern') || drawingType.startsWith('elliott-') || drawingType === 'head-shoulders' || drawingType === 'three-drives' || drawingType === 'cyclic-lines' || drawingType === 'time-cycles' || drawingType === 'sine-line';
            const lineHitTolerance = (isFibLikeDrawing || isPatternLikeDrawing) ? 14 : hitTolerance;
            
            try {
                // Get all line elements and paths with strokes (not fills)
                const lineElements = drawing.group.selectAll('line').nodes();
                const pathElements = drawing.group.selectAll('path').nodes();
                const polylineElements = drawing.group.selectAll('polyline').nodes();
                const polygonElements = drawing.group.selectAll('polygon').nodes();
                
                // Check ALL line elements within this drawing (important for Fib, channels, etc.)
                let lineIndex = 0;
                for (const element of lineElements) {
                    const isFibHit = d3.select(element).classed('fib-level-hit');
                    if (isFibHit) {
                        lineIndex++;
                        continue;
                    }

                    const elementSel = d3.select(element);
                    const opacity = elementSel.style('opacity');
                    if (opacity === '0') {
                        lineIndex++;
                        continue;
                    }

                    const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
                    if (stroke === 'transparent' || stroke === 'none') {
                        lineIndex++;
                        continue;
                    }
                    
                    const x1 = parseFloat(element.getAttribute('x1'));
                    const y1 = parseFloat(element.getAttribute('y1'));
                    const x2 = parseFloat(element.getAttribute('x2'));
                    const y2 = parseFloat(element.getAttribute('y2'));
                    
                    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
                        lineIndex++;
                        continue;
                    }
                    
                    // Check if mouseX is within the line's X range (for horizontal-ish lines)
                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const isWithinXRange = mouseX >= minX - lineHitTolerance && mouseX <= maxX + lineHitTolerance;
                    
                    if (isWithinXRange) {
                        const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                        const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                        const effectiveTolerance = Math.max(lineHitTolerance, strokeWidth * 2);
                        
                        if (distance <= effectiveTolerance) {
                            linesAtPoint.push({
                                drawing: drawing,
                                element: element,
                                drawingId: drawing.id,
                                type: 'line',
                                lineIndex: lineIndex,
                                distance: distance,
                                y: (y1 + y2) / 2 // Store Y position for sorting
                            });
                        }
                    }
                    lineIndex++;
                }
                
                // Check path elements (only stroke, not fill)
                let pathIndex = 0;
                for (const element of pathElements) {
                    const elementSel = d3.select(element);
                    const opacity = elementSel.style('opacity');
                    if (opacity === '0') {
                        pathIndex++;
                        continue;
                    }

                    const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
                    
                    // Skip if no stroke or transparent stroke
                    if (!stroke || stroke === 'transparent' || stroke === 'none') {
                        pathIndex++;
                        continue;
                    }
                    
                    // Skip fill-only elements and hit areas (we only want visible borders)
                    const isFillElement = d3.select(element).classed('shape-fill') || 
                                          d3.select(element).classed('upper-fill') || 
                                          d3.select(element).classed('lower-fill');
                    const isHitArea = d3.select(element).classed('shape-border-hit');
                    if (isFillElement || isHitArea) {
                        pathIndex++;
                        continue;
                    }
                    
                    // For ellipse border paths, use manual distance check (same as rectangle edges)
                    const isShapeBorder = d3.select(element).classed('shape-border');
                    if (isShapeBorder && drawing.type === 'ellipse') {
                        // Get ellipse parameters from the drawing's fill element
                        const fillEllipse = drawing.group.select('ellipse.shape-fill').node();
                        if (fillEllipse) {
                            const cx = parseFloat(fillEllipse.getAttribute('cx')) || 0;
                            const cy = parseFloat(fillEllipse.getAttribute('cy')) || 0;
                            const erx = parseFloat(fillEllipse.getAttribute('rx')) || 0;
                            const ery = parseFloat(fillEllipse.getAttribute('ry')) || 0;
                            
                            if (erx > 0 && ery > 0) {
                                const strokeWidth = parseFloat(d3.select(element).attr('stroke-width')) || 2;
                                // Use small tolerance - only actual stroke width + small buffer (like rectangle lines)
                                const effectiveTolerance = strokeWidth + 5;
                                
                                // Normalize point to unit circle space
                                const dx = (mouseX - cx) / erx;
                                const dy = (mouseY - cy) / ery;
                                const normalizedDist = Math.sqrt(dx * dx + dy * dy);
                                // Point is on border if normalized distance is close to 1
                                const distFromBorder = Math.abs(normalizedDist - 1) * Math.min(erx, ery);
                                
                                if (distFromBorder <= effectiveTolerance) {
                                    const bbox = element.getBBox();
                                    linesAtPoint.push({
                                        drawing: drawing,
                                        element: element,
                                        drawingId: drawing.id,
                                        type: 'path',
                                        lineIndex: pathIndex,
                                        y: bbox.y + bbox.height / 2
                                    });
                                }
                            }
                        }
                        pathIndex++;
                        continue;
                    }
                    
                    const point = this.svg.node().createSVGPoint();
                    point.x = mouseX;
                    point.y = mouseY;
                    
                    // Check if point is on the stroke
                    if (typeof element.isPointInStroke === 'function' && element.isPointInStroke(point)) {
                        const bbox = element.getBBox();
                        linesAtPoint.push({
                            drawing: drawing,
                            element: element,
                            drawingId: drawing.id,
                            type: 'path',
                            lineIndex: pathIndex,
                            y: bbox.y + bbox.height / 2
                        });
                    }
                    pathIndex++;
                }
                
                // Check polyline elements (stroke only)
                let polyIndex = 0;
                for (const element of polylineElements) {
                    const elementSel = d3.select(element);
                    const opacity = elementSel.style('opacity');
                    if (opacity === '0') {
                        polyIndex++;
                        continue;
                    }

                    const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
                    if (!stroke || stroke === 'transparent' || stroke === 'none') {
                        polyIndex++;
                        continue;
                    }
                    
                    const point = this.svg.node().createSVGPoint();
                    point.x = mouseX;
                    point.y = mouseY;
                    
                    if (typeof element.isPointInStroke === 'function' && element.isPointInStroke(point)) {
                        const bbox = element.getBBox();
                        linesAtPoint.push({
                            drawing: drawing,
                            element: element,
                            drawingId: drawing.id,
                            type: 'polyline',
                            lineIndex: polyIndex,
                            y: bbox.y + bbox.height / 2
                        });
                    }
                    polyIndex++;
                }

                let polygonIndex = 0;
                for (const element of polygonElements) {
                    const elementSel = d3.select(element);
                    const opacity = elementSel.style('opacity');
                    if (opacity === '0') {
                        polygonIndex++;
                        continue;
                    }

                    const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
                    if (!stroke || stroke === 'transparent' || stroke === 'none') {
                        polygonIndex++;
                        continue;
                    }

                    const point = this.svg.node().createSVGPoint();
                    point.x = mouseX;
                    point.y = mouseY;

                    if (typeof element.isPointInStroke === 'function' && element.isPointInStroke(point)) {
                        const bbox = element.getBBox();
                        linesAtPoint.push({
                            drawing: drawing,
                            element: element,
                            drawingId: drawing.id,
                            type: 'polygon',
                            lineIndex: polygonIndex,
                            y: bbox.y + bbox.height / 2
                        });
                    }
                    polygonIndex++;
                }
                
                // Check rect, circle, ellipse strokes (border only, not fill)
                const shapeElements = drawing.group.selectAll('rect, circle, ellipse').nodes();
                let shapeIndex = 0;
                for (const element of shapeElements) {
                    const opacity = d3.select(element).style('opacity');
                    if (opacity === '0') {
                        shapeIndex++;
                        continue;
                    }
                    
                    const stroke = d3.select(element).attr('stroke');
                    if (!stroke || stroke === 'transparent' || stroke === 'none') {
                        shapeIndex++;
                        continue;
                    }
                    
                    // Skip fill elements
                    const isFillElement = d3.select(element).classed('shape-fill') || 
                                          d3.select(element).classed('upper-fill') || 
                                          d3.select(element).classed('lower-fill');
                    if (isFillElement) {
                        shapeIndex++;
                        continue;
                    }
                    
                    const strokeWidth = parseFloat(d3.select(element).attr('stroke-width')) || 2;
                    const isShapeBorderHit = element.classList && element.classList.contains('shape-border-hit');
                    const effectiveTolerance = isShapeBorderHit
                        ? Math.max(hitTolerance, strokeWidth / 2)
                        : Math.max(hitTolerance, strokeWidth * 2);
                    let isOnBorder = false;
                    
                    // For rect, manually check distance to each edge
                    if (element.tagName === 'rect') {
                        const rx = parseFloat(element.getAttribute('x')) || 0;
                        const ry = parseFloat(element.getAttribute('y')) || 0;
                        const rw = parseFloat(element.getAttribute('width')) || 0;
                        const rh = parseFloat(element.getAttribute('height')) || 0;
                        
                        // Check distance to each of the 4 edges
                        const distTop = this.pointToLineDistance(mouseX, mouseY, rx, ry, rx + rw, ry);
                        const distBottom = this.pointToLineDistance(mouseX, mouseY, rx, ry + rh, rx + rw, ry + rh);
                        const distLeft = this.pointToLineDistance(mouseX, mouseY, rx, ry, rx, ry + rh);
                        const distRight = this.pointToLineDistance(mouseX, mouseY, rx + rw, ry, rx + rw, ry + rh);
                        
                        const minDist = Math.min(distTop, distBottom, distLeft, distRight);
                        isOnBorder = minDist <= effectiveTolerance;
                    }
                    // For ellipse, manually check distance to ellipse border
                    else if (element.tagName === 'ellipse') {
                        const cx = parseFloat(element.getAttribute('cx')) || 0;
                        const cy = parseFloat(element.getAttribute('cy')) || 0;
                        const erx = parseFloat(element.getAttribute('rx')) || 0;
                        const ery = parseFloat(element.getAttribute('ry')) || 0;
                        
                        if (erx > 0 && ery > 0) {
                            const maxTol = Math.max(0.5, Math.min(erx, ery) - 1);
                            const tol = Math.min(effectiveTolerance, maxTol);
                            // Normalize point to unit circle space
                            const dx = (mouseX - cx) / erx;
                            const dy = (mouseY - cy) / ery;
                            const normalizedDist = Math.sqrt(dx * dx + dy * dy);
                            // Point is on border if normalized distance is close to 1
                            const distFromBorder = Math.abs(normalizedDist - 1) * Math.min(erx, ery);
                            isOnBorder = distFromBorder <= tol;
                        }
                    }
                    // For circle, manually check distance to circle border
                    else if (element.tagName === 'circle') {
                        const cx = parseFloat(element.getAttribute('cx')) || 0;
                        const cy = parseFloat(element.getAttribute('cy')) || 0;
                        const cr = parseFloat(element.getAttribute('r')) || 0;
                        
                        if (cr > 0) {
                            const maxTol = Math.max(0.5, cr - 1);
                            const tol = Math.min(effectiveTolerance, maxTol);
                            const dx = mouseX - cx;
                            const dy = mouseY - cy;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const distFromBorder = Math.abs(dist - cr);
                            isOnBorder = distFromBorder <= tol;
                        }
                    }
                    
                    if (isOnBorder) {
                        const bbox = element.getBBox();
                        linesAtPoint.push({
                            drawing: drawing,
                            element: element,
                            drawingId: drawing.id,
                            type: element.tagName,
                            lineIndex: shapeIndex,
                            y: bbox.y + bbox.height / 2
                        });
                    }
                    shapeIndex++;
                }
            } catch (error) {
                console.warn('Error in line hit test for drawing:', drawing.id, error);
                continue;
            }
        }
        
        // Sort by Y position (top to bottom) so stacked lines are in order
        linesAtPoint.sort((a, b) => (a.y || 0) - (b.y || 0));
        
        return linesAtPoint;
    }
    
    /**
     * Check if there are multiple lines stacked at a point (more than threshold)
     * @param {number} mouseX - X coordinate in SVG space
     * @param {number} mouseY - Y coordinate in SVG space
     * @param {number} threshold - Minimum number of lines to consider as "stacked" (default: 3)
     * @returns {Object} - { isStacked: boolean, lines: Array, count: number }
     */
    findStackedLines(mouseX, mouseY, threshold = 3) {
        const lines = this.findLinesAtPoint(mouseX, mouseY);
        const isStacked = lines.length > threshold;
        
        if (isStacked) {
            // [debug removed]
        }
        
        return {
            isStacked: isStacked,
            lines: lines,
            count: lines.length,
            drawings: [...new Set(lines.map(l => l.drawing))] // Unique drawings
        };
    }
    
    /**
     * Get stacked lines at a client coordinate (for external use)
     * @param {number} clientX - Client X coordinate (from mouse event)
     * @param {number} clientY - Client Y coordinate (from mouse event)
     * @param {number} threshold - Minimum number of lines to consider as "stacked" (default: 3)
     * @returns {Object} - { isStacked: boolean, lines: Array, count: number, drawings: Array }
     */
    getStackedLinesAt(clientX, clientY, threshold = 3) {
        const svgRect = this.svg.node().getBoundingClientRect();
        const mouseX = clientX - svgRect.left;
        const mouseY = clientY - svgRect.top;
        return this.findStackedLines(mouseX, mouseY, threshold);
    }
    
    /**
     * Get all lines at a client coordinate (for external use)
     * Returns all lines (strokes only, not fills) from any shape at the given point
     * @param {number} clientX - Client X coordinate (from mouse event)
     * @param {number} clientY - Client Y coordinate (from mouse event)
     * @returns {Array} - Array of line info objects { drawing, element, drawingId, type }
     */
    getLinesAt(clientX, clientY) {
        const svgRect = this.svg.node().getBoundingClientRect();
        const mouseX = clientX - svgRect.left;
        const mouseY = clientY - svgRect.top;
        return this.findLinesAtPoint(mouseX, mouseY);
    }
    
    /**
     * Get the last detected stacked lines info (from the most recent click)
     * @returns {Object|null} - Last stacked lines info or null if none
     */
    getLastStackedLines() {
        return this.lastStackedLines || null;
    }

    /**
     * Returns true when the given screen-space point is on a volume profile level line,
     * and not closer to a draggable boundary handle/line.
     */
    isVolumeProfileLevelLineHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }

        const levelLines = drawing.group.selectAll('.volume-profile-level-line').nodes();
        if (!Array.isArray(levelLines) || levelLines.length === 0) {
            return false;
        }

        let bestLevelDistance = Infinity;

        for (const line of levelLines) {
            if (!line) continue;

            const x1 = parseFloat(line.getAttribute('x1'));
            const y1 = parseFloat(line.getAttribute('y1'));
            const x2 = parseFloat(line.getAttribute('x2'));
            const y2 = parseFloat(line.getAttribute('y2'));
            if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

            const lineSel = d3.select(line);
            const strokeWidth = parseFloat(lineSel.attr('stroke-width') || lineSel.style('stroke-width')) || 1;
            const tolerance = Math.max(8, (strokeWidth / 2) + 0.75);
            const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
            if (distance <= tolerance) {
                bestLevelDistance = Math.min(bestLevelDistance, distance);
            }
        }

        if (bestLevelDistance === Infinity) {
            return false;
        }

        const boundaryElements = drawing.group.selectAll('.volume-profile-boundary-hit, .volume-profile-boundary').nodes();
        let bestBoundaryDistance = Infinity;

        for (const el of boundaryElements) {
            if (!el) continue;

            const x1 = parseFloat(el.getAttribute('x1'));
            const y1 = parseFloat(el.getAttribute('y1'));
            const x2 = parseFloat(el.getAttribute('x2'));
            const y2 = parseFloat(el.getAttribute('y2'));
            if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

            const elSel = d3.select(el);
            const strokeWidth = parseFloat(elSel.attr('stroke-width') || elSel.style('stroke-width')) || 1;
            const isBoundaryHit = elSel.classed('volume-profile-boundary-hit');
            const tolerance = isBoundaryHit
                ? Math.max(14, (strokeWidth / 2) + 0.5)
                : Math.max(4, (strokeWidth / 2) + 0.5);
            const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
            if (distance <= tolerance) {
                bestBoundaryDistance = Math.min(bestBoundaryDistance, distance);
            }
        }

        if (bestBoundaryDistance !== Infinity && bestBoundaryDistance <= bestLevelDistance) {
            return false;
        }

        return true;
    }

    /**
     * Calculate distance from a point to a line segment
     * @param {number} px - Point X
     * @param {number} py - Point Y
     * @param {number} x1 - Line start X
     * @param {number} y1 - Line start Y
     * @param {number} x2 - Line end X
     * @param {number} y2 - Line end Y
     * @returns {number} - Distance in pixels
     */
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
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
        
        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check proximity to drawings and change cursor when over a line
     */
    checkDrawingProximity(event) {
        const svgRect = this.svg.node().getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const mouseY = event.clientY - svgRect.top;
        
        const canvas = document.getElementById('chartCanvas');
        if (!canvas) return;

        if (this.isResizing || this.isCustomHandleDrag) {
            canvas.style.cursor = 'ew-resize';
            this.svg.style('cursor', 'ew-resize');
            this._cursorOverLine = true;
            return;
        }

        if (this.isDragging || this.isDraggingFirstTwo) {
            canvas.style.cursor = 'move';
            this.svg.style('cursor', 'move');
            this._cursorOverLine = true;
            return;
        }

        const textHoverNodes = this.svg.selectAll('.inline-editable-text, .text-body-hit, .pin-body-hit').nodes();
        let isOverTextHitArea = false;
        for (let i = 0; i < textHoverNodes.length; i++) {
            const n = textHoverNodes[i];
            if (!n || typeof n.getBoundingClientRect !== 'function') continue;
            const r = n.getBoundingClientRect();
            if (
                event.clientX >= r.left &&
                event.clientX <= r.right &&
                event.clientY >= r.top &&
                event.clientY <= r.bottom
            ) {
                isOverTextHitArea = true;
                break;
            }
        }

        if (isOverTextHitArea) {
            canvas.style.cursor = 'move';
            this.svg.style('cursor', 'move');
            this._cursorOverInlineText = true;
            this._cursorOverLine = false;
            return;
        } else if (this._cursorOverInlineText) {
            canvas.style.cursor = '';
            this.svg.style('cursor', '');
            this._cursorOverInlineText = false;
        }
        
        // Check if cursor is over any drawing (use same geometric hit-test as selection)
        let drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true });
        const topVolumeProfileValueLabelDrawing = this.findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY, { includeLocked: true });
        if (topVolumeProfileValueLabelDrawing && !drawingsAtPoint.includes(topVolumeProfileValueLabelDrawing)) {
            drawingsAtPoint = [topVolumeProfileValueLabelDrawing, ...drawingsAtPoint];
        }

        if (drawingsAtPoint.length > 0) {
            const cursorStyle = 'move';
            canvas.style.cursor = cursorStyle;
            this.svg.style('cursor', cursorStyle);
            this._cursorOverLine = true;

            const hoveredDrawing = drawingsAtPoint[0];
            if (hoveredDrawing && hoveredDrawing.group) {
                // Clear previous hover
                if (this._hoveredDrawing && this._hoveredDrawing !== hoveredDrawing) {
                    if (this._hoveredDrawing.group) {
                        SVGHelpers.applyHoverEffect(this._hoveredDrawing.group, false);
                        if (!this._hoveredDrawing.selected) {
                            this._hoveredDrawing.group.selectAll('.resize-handle, .custom-handle').style('opacity', 0);
                            this._hoveredDrawing.group.selectAll('.resize-handle, .resize-handle-hit, .custom-handle')
                                .style('pointer-events', 'none');
                        }
                    }
                }

                // Apply hover effect + show handles (if not selected)
                SVGHelpers.applyHoverEffect(hoveredDrawing.group, true);
                if (!hoveredDrawing.selected) {
                    hoveredDrawing.group.selectAll('.resize-handle, .custom-handle').style('opacity', 1);
                    if (!this.drawingState || !this.drawingState.isDrawing) {
                        hoveredDrawing.group.selectAll('.resize-handle, .resize-handle-hit, .custom-handle')
                            .style('pointer-events', 'all');
                    }
                }

                const shouldBindHoverResize =
                    (!this.drawingState || !this.drawingState.isDrawing) &&
                    !this._skipHandleSetup &&
                    !this.isResizing &&
                    !hoveredDrawing.locked;

                if (shouldBindHoverResize && hoveredDrawing.group) {
                    const hasHandles = !hoveredDrawing.group
                        .selectAll('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle')
                        .empty();

                    if (hasHandles) {
                        const groupNode = hoveredDrawing.group && hoveredDrawing.group.node ? hoveredDrawing.group.node() : null;
                        const needsBind =
                            this._hoverHandleBoundDrawingId !== hoveredDrawing.id ||
                            this._hoverHandleBoundGroupNode !== groupNode;

                        if (needsBind) {
                            this.setupHandleDrag(hoveredDrawing);
                            this._hoverHandleBoundDrawingId = hoveredDrawing.id;
                            this._hoverHandleBoundGroupNode = groupNode;
                        }
                    }
                }
                this._hoveredDrawing = hoveredDrawing;
            }
        } else if (this._cursorOverLine) {
            // Was over a drawing, now moved away - reset cursor
            canvas.style.cursor = '';
            this.svg.style('cursor', '');
            this.svg.selectAll('.shape-fill').style('cursor', 'default');
            this._cursorOverLine = false;

            // Clear hover effect/handles from hovered drawing (if not selected)
            if (this._hoveredDrawing) {
                if (this._hoveredDrawing.group) {
                    SVGHelpers.applyHoverEffect(this._hoveredDrawing.group, false);
                    if (!this._hoveredDrawing.selected) {
                        this._hoveredDrawing.group.selectAll('.resize-handle, .custom-handle').style('opacity', 0);
                        this._hoveredDrawing.group.selectAll('.resize-handle, .resize-handle-hit, .custom-handle')
                            .style('pointer-events', 'none');
                    }
                }
                this._hoveredDrawing = null;
            }

            this._hoverHandleBoundDrawingId = null;
            this._hoverHandleBoundGroupNode = null;
        }
        
        // Handle axis cursor modes
        if (this.chart) {
            const mode = this.chart.cursor?.mode;
            if (mode === 'priceAxis') {
                canvas.classList.add('cursor-price-axis');
            } else if (mode === 'timeAxis') {
                canvas.classList.add('cursor-time-axis');
            }
        }
    }
    /**
     * Load saved tool styles from localStorage
     */
    loadSavedToolStyles() {
        try {
            const saved = localStorage.getItem('drawingToolStyles');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('Failed to load saved tool styles:', e);
            return {};
        }
    }
    
    /**
     * Save tool style to localStorage
     */
    saveToolStyle(toolType, style, options = {}) {
        if (!toolType || !style) return;
        
        // Clone style and remove non-persistent properties
        const styleToSave = { ...style };
        delete styleToSave.id;

        const isPositionTool = toolType === 'long-position' || toolType === 'short-position';
        const existingRiskSettings = this.getSavedToolRiskSettings(toolType);
        let riskSettingsToSave = existingRiskSettings;

        if (isPositionTool && options && options.riskSettings && typeof options.riskSettings === 'object') {
            const src = options.riskSettings;
            const normalized = {};

            if (src.riskMode === 'risk-percent' || src.riskMode === 'risk-usd') {
                normalized.riskMode = src.riskMode;
            }

            const riskPercent = Number(src.riskPercent);
            if (Number.isFinite(riskPercent)) {
                normalized.riskPercent = Math.max(0.0001, riskPercent);
            }

            const riskAmountUSD = Number(src.riskAmountUSD);
            if (Number.isFinite(riskAmountUSD)) {
                normalized.riskAmountUSD = Math.max(0, riskAmountUSD);
            }

            const lotSize = Number(src.lotSize);
            if (Number.isFinite(lotSize)) {
                normalized.lotSize = Math.max(0.01, lotSize);
            }

            const rewardRatio = Number(src.rewardRatio);
            if (Number.isFinite(rewardRatio) && rewardRatio > 0) {
                normalized.rewardRatio = Math.max(0.01, rewardRatio);
            }

            const stopTicks = Number(src.stopTicks);
            if (Number.isFinite(stopTicks) && stopTicks > 0) {
                normalized.stopTicks = Math.abs(stopTicks);
            }

            const profitTicks = Number(src.profitTicks);
            if (Number.isFinite(profitTicks) && profitTicks > 0) {
                normalized.profitTicks = Math.abs(profitTicks);
            }

            const leverage = Number(src.leverage);
            if (Number.isFinite(leverage)) {
                normalized.leverage = Math.max(1, leverage);
            }

            if (Object.keys(normalized).length > 0) {
                riskSettingsToSave = normalized;
            }
        }

        if (isPositionTool) {
            this.savedToolStyles[toolType] = { style: styleToSave };
            if (riskSettingsToSave && Object.keys(riskSettingsToSave).length > 0) {
                this.savedToolStyles[toolType].riskSettings = { ...riskSettingsToSave };
            }
        } else {
            this.savedToolStyles[toolType] = styleToSave;
        }
        
        try {
            localStorage.setItem('drawingToolStyles', JSON.stringify(this.savedToolStyles));
            // [debug removed]
        } catch (e) {
            console.warn('Failed to save tool style:', e);
        }
    }
    
    /**
     * Get saved style for a tool type
     */
    getSavedToolStyle(toolType) {
        const saved = this.savedToolStyles[toolType];
        if (!saved) return null;

        // New structured format (for tools that persist additional input settings)
        if (saved && typeof saved === 'object' && saved.style && typeof saved.style === 'object') {
            return saved.style;
        }

        // Legacy format (style object only)
        return saved;
    }

    /**
     * Get saved extra risk settings for position tools
     */
    getSavedToolRiskSettings(toolType) {
        const saved = this.savedToolStyles[toolType];
        if (!saved || typeof saved !== 'object' || !saved.riskSettings || typeof saved.riskSettings !== 'object') {
            return null;
        }
        return saved.riskSettings;
    }
    
    /**
     * Apply saved style to a drawing
     */
    applySavedStyle(drawing) {
        const savedStyle = this.getSavedToolStyle(drawing.type);
        if (savedStyle) {
            // Merge saved style into drawing style (don't overwrite everything)
            Object.keys(savedStyle).forEach(key => {
                // Skip certain properties that shouldn't be copied
                // For image tools, don't copy imageUrl - each new image should start empty
                const isImageTool = drawing.type === 'image';
                const isEmojiTool = drawing.type === 'emoji';
                const isEmojiIdentityField = isEmojiTool && (
                    key === 'glyph' ||
                    key === 'category' ||
                    key === 'fontFamily' ||
                    key === 'fontSize' ||
                    key === 'sizeInDataUnits'
                );

                if (key !== 'id' && key !== 'points' && !(isImageTool && key === 'imageUrl') && !isEmojiIdentityField) {
                    drawing.style[key] = savedStyle[key];
                }
            });
            // [debug removed]
        }

        // Apply persisted risk inputs for long/short position tools
        if ((drawing.type === 'long-position' || drawing.type === 'short-position') && typeof drawing.ensureRiskSettings === 'function') {
            const savedRiskSettings = this.getSavedToolRiskSettings(drawing.type);
            if (savedRiskSettings) {
                if (!drawing.meta) drawing.meta = {};
                drawing.meta.risk = {
                    ...(drawing.meta.risk || {}),
                    ...savedRiskSettings
                };
                drawing.ensureRiskSettings();
                if (typeof drawing.recalculateLotSizeFromRisk === 'function') {
                    drawing.recalculateLotSizeFromRisk();
                }
            }
        }
    }
}

// Export for use in chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawingToolsManager;
}
