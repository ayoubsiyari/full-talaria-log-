/**
 * Drawing Tools Manager
 * Main coordinator for all drawing tools
 * Handles drawing lifecycle, event management, and persistence
 * 
 * @version 1.5.11
 * @updated 2026-03-28
 * @changelog
 *   - Drawing titles: same tool type is numbered when multiple exist (e.g. Path 1, Path 2); single instance shows base name only. Custom names stored in meta.customDisplayName.
 *   - Fixed: Selecting another panel’s chart deselects drawings and hides the floating toolbar from the previous panel
 *   - Fixed: Magnet mode now disabled when resizing shapes - allows free resizing outside chart area
 *   - Fixed: Shapes behind Y-axis can no longer be detected/moved when mouse is over axis
 *   - Added boundary check in findDrawingsAtPoint() to exclude axis regions from hit detection
 *   - Previous fixes:
 *     - Text dropdown live preview not working when typing
 *     - Font size changes in text dropdown now update drawing in real-time
 *     - Changed text input handler to use queryAll for proper external dropdown support
 *     - Added findLinesAtPoint() for detecting lines (strokes only, not fills)
 *     - Added findStackedLines() to detect when >3 lines are stacked at a point
 *     - Added getStackedLinesAt(), getLinesAt(), getLastStackedLines() public API
 *     - Shift+Click on stacked lines selects all drawings
 *     - Now detects ALL lines within same shape (Fib levels, channels, etc.)
 *     - Added lineIndex and Y-position sorting for stacked lines
 *     - STROKE-ONLY selection: Only click on lines/borders to select, fills are ignored
 *     - Disabled pointer-events on all fill elements after rendering
 */

/** V9 React shell may live on parent/top while chart.js runs in an iframe — resolve hook across windows. */
function resolveV9OpenDrawingSettings() {
    if (typeof window === 'undefined') return null;
    // Iframe tiles must never open V9 settings locally (position:fixed is clipped to the tile).
    if (isMultichartIframeEmbed()) {
        return function multichartForwardV9DrawingSettings(drawing, x, y) {
            requestMultichartParentDrawingSettings(drawing, x, y);
            return true;
        };
    }
    const wins = [window];
    try {
        if (window.parent && window.parent !== window) wins.push(window.parent);
    } catch (_) { /* cross-origin */ }
    try {
        if (window.top && window.top !== window) wins.push(window.top);
    } catch (_) { /* cross-origin */ }
    for (let i = 0; i < wins.length; i++) {
        const w = wins[i];
        if (w && typeof w.__v9OpenDrawingSettings === 'function') {
            return w.__v9OpenDrawingSettings.bind(w);
        }
    }
    return null;
}

/** Multichart iframe tiles must never show legacy modals locally — parent opens settings. */
function isMultichartIframeEmbed() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    if (window.parent === window) return false;
    try {
        if (window.parent && window.parent.__multichartGrid) return true;
    } catch (_) { /* cross-origin */ }
    if (document.documentElement.classList.contains('multichart-embed')) return true;
    try {
        return new URLSearchParams(window.location.search || '').get('multichart') === '1';
    } catch (_q) {
        return false;
    }
}

/** Tell the multichart parent shell to hide the V9 quick bar after empty-canvas deselect. */
function notifyMultichartParentSelectionCleared(chartInstance) {
    if (typeof window === 'undefined') return;
    let panelId = null;
    try {
        if (chartInstance && typeof chartInstance._getMultichartPanelId === 'function') {
            panelId = chartInstance._getMultichartPanelId();
        }
    } catch (_) { /* ignore */ }
    try {
        if (window.parent && window.parent !== window && isMultichartIframeEmbed()) {
            window.parent.postMessage({
                type: 'multichart-drawing-deselected',
                source: panelId,
            }, '*');
        }
    } catch (_) { /* ignore */ }
    try {
        if (window.__multichartGrid) {
            window.dispatchEvent(new CustomEvent('talaria:v9-cleared-selection'));
        }
    } catch (_) { /* ignore */ }
}

function requestMultichartParentDrawingSettings(drawing, x, y) {
    let panelId = 'embed';
    try {
        panelId = new URLSearchParams(window.location.search).get('panelId') || panelId;
    } catch (_q) { /* ignore */ }
    const drawId = drawing && drawing.id != null ? drawing.id : null;
    const px = typeof x === 'number' && !isNaN(x) ? x : 0;
    const py = typeof y === 'number' && !isNaN(y) ? y : 0;
    try {
        const parent = window.parent;
        if (parent && parent !== window) {
            if (typeof parent.__multichartOpenShapeSettings === 'function') {
                parent.__multichartOpenShapeSettings(
                    panelId,
                    drawing && drawing.type ? drawing : drawId,
                    px,
                    py
                );
                return true;
            }
            const grid = parent.__multichartGrid;
            if (grid && typeof grid.openDrawingSettingsForPanel === 'function') {
                grid.openDrawingSettingsForPanel(
                    panelId,
                    drawing && drawing.type ? drawing : drawId,
                    px,
                    py
                );
                return true;
            }
        }
    } catch (_) { /* cross-origin */ }
    try {
        window.parent.postMessage({
            type: 'multichart-open-drawing-settings',
            source: panelId,
            drawingId: drawId,
            x: px,
            y: py,
        }, '*');
        return true;
    } catch (_pm) {
        return false;
    }
}

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
        this._liveSyncDrawingId = null;
        this._liveSyncBroadcasted = false;
        /** Last preview bend for curve/arc (preview render mutates temp instance; finalize must reuse it). */
        this._lastCurvePlacementPoints = null;

        /** Remote sync (session PATCH + cloud API) lags localStorage; drives toolbar save indicator */
        this._drawingsPendingTargets = { session: false, api: false };
        this._drawingsFlushAllInProgress = false;
        this._drawingsSaveBtn = null;
        
        // Rectangular selection
        this.isRectSelecting = false;
        this.rectSelectStart = null;
        this.rectSelectRect = null;
        
        // UI components
        this.settingsPanel = new DrawingSettingsPanel();
        this.settingsPanel.drawingManager = this;
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
        /** Drawings being moved via canvas geometric drag (not isDragging SVG path). */
        this._directMoveDrawings = null;
        /** Active d3 body-drag gestures (whole-shape move via setupDrawingDrag). */
        this._bodyDragDepth = 0;
        this._handleClickTimes = {};
        this._handleMouseDownCaptureHandler = null;
        this._setupHandleMouseDownCapture();
        this._setupCrossPanelDeselect();
        
        // Undo/Redo manager
        this.history = null; // Will be initialized after manager is ready

        const instanceId = chartInstance.__drawingToolsManagerId || (chartInstance.__drawingToolsManagerId = ((window.__drawingToolsManagerCounter = (window.__drawingToolsManagerCounter || 0) + 1)));
        this._instanceKey = `drawingTools_${instanceId}`;

        this._rafRenderQueued = false;
        this._rafRenderSet = new Set();

        this._hoverHandleBoundDrawingId = null;
        this._hoverHandleBoundGroupNode = null;
        /** After closing drawing settings (Apply/Close), ignore one stray canvas click so selection is not cleared. */
        this._suppressNextCanvasBgClick = false;
        this._suppressNextCanvasBgClickUntil = 0;
        
        // Style persistence - remember last used style per tool type
        this.savedToolStyles = this.loadSavedToolStyles();

        // SVG layers
        this.drawingsGroup = null;
        this.tempGroup = null;
        
        // Tools that support angle snapping with Shift key
        this.angleSnapTools = ['trendline', 'ray', 'arrow', 'ruler', 'fibonacci-retracement', 'fibonacci-extension', 'polyline'];
        // Box shapes: Shift + corner resize keeps square/circle proportions (see drawing-tools-shapes.js)
        this.boxShiftSnapTools = ['rectangle', 'ellipse', 'gann-box'];

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
                    const suppressUntil = Number(this._suppressNextDrawingDblClickUntil || 0);
                    if (suppressUntil > 0 && now <= suppressUntil) {
                        if (this._handleClickTimes) this._handleClickTimes[key] = now;
                        return;
                    }

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
                        this.deselectAll({ forSelectionChange: true });
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

    /**
     * When a drawing is selected on one panel, mousedown on a *different* chart’s canvas/SVG
     * must clear that selection and hide its toolbar (same UX as clicking empty space on the source chart).
     */
    _setupCrossPanelDeselect() {
        if (window.__drawingCrossPanelDeselectWired) return;
        window.__drawingCrossPanelDeselectWired = true;

        const collectCharts = () => {
            const out = [];
            const add = (ch) => {
                if (ch && out.indexOf(ch) === -1) out.push(ch);
            };
            try {
                add(window.chart);
                add(window.mainChart);
                const pm = window.panelManager;
                if (pm && Array.isArray(pm.panels)) {
                    pm.panels.forEach((p) => add(p && p.chartInstance));
                }
            } catch (e) {
                /* ignore */
            }
            return out;
        };

        const chartContainsTarget = (chart, target) => {
            if (!chart || !target) return false;
            const c = chart.canvas;
            if (c && (c === target || (c.contains && c.contains(target)))) return true;
            let svgNode = null;
            try {
                if (chart.svg && typeof chart.svg.node === 'function') svgNode = chart.svg.node();
            } catch (e) {
                /* ignore */
            }
            if (svgNode && (svgNode === target || (svgNode.contains && svgNode.contains(target)))) return true;
            return false;
        };

        const shouldIgnore = (t) => {
            if (!t || typeof t.closest !== 'function') return true;
            return !!(
                t.closest('.drawing-toolbar') ||
                t.closest('.tv-settings-modal') ||
                t.closest('.inline-text-editor') ||
                t.closest('.tv-context-menu') ||
                t.closest('#custom-color-picker')
            );
        };

        document.addEventListener(
            'mousedown',
            (e) => {
                if (e.button !== 0) return;
                const t = e.target;
                if (shouldIgnore(t)) return;

                const charts = collectCharts();
                let hitChart = null;
                for (let i = 0; i < charts.length; i++) {
                    if (chartContainsTarget(charts[i], t)) {
                        hitChart = charts[i];
                        break;
                    }
                }
                if (!hitChart) return;

                for (let i = 0; i < charts.length; i++) {
                    const ch = charts[i];
                    if (!ch || ch === hitChart) continue;
                    const dm = ch.drawingManager;
                    if (!dm || !dm.selectedDrawings || dm.selectedDrawings.length === 0) continue;
                    dm.deselectAll({ fromCanvasBackground: true });
                }
            },
            true
        );
    }

    /**
     * Call when the drawing settings modal closes (Apply / Cancel / Close). Prevents the next
     * click on the chart from running the "empty canvas" deselect path — common after the modal
     * is removed and the event hits the canvas (e.g. after choosing BE options and clicking Apply).
     * @param {number} [durationMs=650]
     */
    suppressNextCanvasBackgroundClick(durationMs = 650) {
        const ms = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 650;
        this._suppressNextCanvasBgClick = true;
        this._suppressNextCanvasBgClickUntil = Date.now() + ms;
    }

    _shouldSuppressCanvasBackgroundDeselect() {
        if (this._suppressNextCanvasBgClick) return true;
        const until = Number(this._suppressNextCanvasBgClickUntil || 0);
        return until > 0 && Date.now() <= until;
    }

    /** @returns {boolean} true when a background deselect was suppressed */
    _consumeCanvasBackgroundDeselectSuppress() {
        if (!this._shouldSuppressCanvasBackgroundDeselect()) return false;
        this._suppressNextCanvasBgClick = false;
        return true;
    }

    _isBoxShapeType(type) {
        return type === 'rectangle' || type === 'triangle' || type === 'circle' || type === 'ellipse'
            || type === 'rotated-rectangle';
    }

    /**
     * Deselect when the pointer is on true chart background (no drawing stroke under cursor).
     * @returns {boolean} true when deselect ran
     */
    _tryDeselectOnBackgroundPointer(event, mouseX, mouseY) {
        if (event?.shiftKey) return false;
        if (this._consumeCanvasBackgroundDeselectSuppress()) return false;
        if (!this.selectedDrawings?.length) return false;

        const hits = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true }) || [];
        if (hits.length > 0) return false;

        const onSelectedHandle = (this.selectedDrawings || []).some((d) =>
            d && this._isPointOnResizeHandle(d, mouseX, mouseY)
        );
        if (onSelectedHandle) return false;

        this.deselectAll({ fromCanvasBackground: true });
        return true;
    }

    /** Two-point line tools that support in-place geometry patch during handle drag. */
    _supportsLiveHandleGeometryPatch(drawing) {
        if (!drawing || !drawing.type) return false;
        return [
            'trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray',
            'extended-line', 'cross-line'
        ].includes(drawing.type);
    }

    /** Multi-point / bezier tools need a full live re-render while dragging a handle. */
    _needsFullRenderDuringHandleEdit(drawing) {
        if (!drawing || !drawing.type) return false;
        return ['path', 'polyline', 'curve', 'double-curve'].includes(drawing.type);
    }

    _getFullHandleEditRenderOpts(drawing) {
        const isDoubleCurve = drawing && drawing.type === 'double-curve';
        return {
            skipInteraction: true,
            liveRender: true,
            skipTimestampSync: true,
            drawingRenderOpts: {
                // Double curve: full rebuild each drag frame (document-level drag survives this).
                reuseGroup: !isDoubleCurve && !!(drawing && drawing.group && !drawing.group.empty()),
                skipHandles: isDoubleCurve ? false : true,
            }
        };
    }

    scheduleRenderDrawing(drawing) {
        if (!drawing) return;
        const isActiveResize = !!(this.isResizing && this.resizingDrawing === drawing);
        const isActiveCustom = !!(this.isCustomHandleDrag && this.customHandleDrawing === drawing);
        // Handle resize / custom-handle edit: patch simple lines in place; full live render for path/curve/etc.
        if (isActiveResize || isActiveCustom) {
            try {
                const stillTracked = this.drawings.find(item => item === drawing || (item && drawing && item.id === drawing.id));
                if (stillTracked && this.chart && this.chart.xScale && this.chart.yScale) {
                    const scales = {
                        xScale: this.chart.xScale,
                        yScale: this.chart.yScale,
                        chart: this.chart
                    };
                    if (isActiveResize
                        && this._supportsLiveHandleGeometryPatch(stillTracked)
                        && typeof stillTracked.patchLiveHandleResize === 'function'
                        && stillTracked.patchLiveHandleResize(scales, this.resizingPointIndex)) {
                        this._refreshAxisHighlightsDuringHandleEdit(stillTracked);
                        return;
                    }
                    this._skipHandleSetup = true;
                    this.renderDrawing(stillTracked, this._getFullHandleEditRenderOpts(stillTracked));
                    this._skipHandleSetup = false;
                }
            } catch (_) { /* ignore */ }
            return;
        }
        if (!this._rafRenderSet) this._rafRenderSet = new Set();
        this._rafRenderSet.add(drawing);
        if (this._rafRenderQueued) return;
        this._rafRenderQueued = true;
        requestAnimationFrame(() => {
            this._rafRenderQueued = false;
            if (this._isLiveDrawingInteraction()) {
                this._ensureDrawingsPlotClip();
            }
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
                    if (this.isResizing && this.resizingDrawing === stillTracked) {
                        const scales = {
                            xScale: this.chart.xScale,
                            yScale: this.chart.yScale,
                            chart: this.chart
                        };
                        if (this._supportsLiveHandleGeometryPatch(stillTracked)
                            && typeof stillTracked.patchLiveHandleResize === 'function'
                            && stillTracked.patchLiveHandleResize(scales, this.resizingPointIndex)) {
                            this._refreshAxisHighlightsDuringHandleEdit(stillTracked);
                            return;
                        }
                        this.renderDrawing(stillTracked, this._getFullHandleEditRenderOpts(stillTracked));
                        return;
                    }
                    if (this.isCustomHandleDrag && this.customHandleDrawing === stillTracked) {
                        this.renderDrawing(stillTracked, this._getFullHandleEditRenderOpts(stillTracked));
                        return;
                    }
                    this.renderDrawing(stillTracked, this._liveRenderDrawingOpts(stillTracked));
                } catch (e) {
                }
            });

            // Full chart.render → redrawAll destroys SVG groups and breaks d3 handle drags mid-edit.
            if (this._isLiveDrawingInteraction()
                && !this._isLiveHandleEditing()
                && !this._isDrawingGeometryMoveActive()
                && this.chart
                && this.chart.scheduleRender) {
                this.chart.scheduleRender();
            }
        });
    }

    _isLiveDrawingInteraction() {
        return !!((this._drawingLiveInteractionDepth || 0) > 0
            || this.isDragging || this.isResizing || this.isCustomHandleDrag
            || this._textInlineEditDrawing
            || this._isDrawingGeometryMoveActive());
    }

    /** Whole-shape move in progress (d3 body drag, legacy isDragging, or canvas direct move). */
    _isDrawingGeometryMoveActive() {
        return !!(
            this.isDragging
            || this._directMoveMoveHandler
            || (this._bodyDragDepth || 0) > 0
        );
    }

    /** Resize-handle or box-corner edit in progress (not whole-shape CSS move). */
    _isLiveHandleEditing() {
        return !!(
            (this.isResizing && this.resizingDrawing)
            || (this.isCustomHandleDrag && this.customHandleDrawing)
        );
    }

    beginTextInlineEdit(drawing) {
        if (!drawing) return;
        if (this._textInlineEditDrawing && this._textInlineEditDrawing !== drawing) {
            this.endTextInlineEdit(this._textInlineEditDrawing);
        }
        this._textInlineEditDrawing = drawing;
        drawing._inlineTextEditing = true;
        this._beginDrawingLiveInteraction();
        this._attachInlineEditMoveGuard(drawing);
    }

    endTextInlineEdit(drawing) {
        if (drawing) drawing._inlineTextEditing = false;
        const active = this._textInlineEditDrawing;
        if (!active) {
            this._detachInlineEditMoveGuard();
            return;
        }
        if (drawing && active !== drawing) return;
        this._textInlineEditDrawing = null;
        this._detachInlineEditMoveGuard();
        this._endDrawingLiveInteraction();
        if (drawing) this.renderDrawing(drawing);
    }

    _attachInlineEditMoveGuard(drawing) {
        if (!drawing || typeof document === 'undefined') return;
        this._detachInlineEditMoveGuard();
        const self = this;
        const handler = (event) => {
            const editing = self._textInlineEditDrawing;
            const editorEl = document.querySelector('.inline-text-editor--inline');
            if (!editing && !editorEl) return;
            const t = event.target;
            if (!t || !t.closest) return;
            if (t.closest('.inline-text-editor')) return;
            const active = editing || drawing;
            if (!active || !active.group) return;
            const groupNode = active.group.node();
            if (!groupNode || (!groupNode.contains(t) && t !== groupNode)) return;
            self._commitInlineTextEditorBeforeGeometryEdit();
        };
        this._inlineEditMoveGuardHandler = handler;
        this._inlineEditMoveGuardDrawing = drawing;
        const svgNode = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : null;
        const canvas = (this.chart && this.chart.canvas) || null;
        if (svgNode) svgNode.addEventListener('mousedown', handler, true);
        if (canvas && canvas !== svgNode) canvas.addEventListener('mousedown', handler, true);
    }

    _detachInlineEditMoveGuard() {
        const handler = this._inlineEditMoveGuardHandler;
        if (!handler) return;
        const svgNode = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : null;
        const canvas = (this.chart && this.chart.canvas) || null;
        if (svgNode) svgNode.removeEventListener('mousedown', handler, true);
        if (canvas && canvas !== svgNode) canvas.removeEventListener('mousedown', handler, true);
        this._inlineEditMoveGuardHandler = null;
        this._inlineEditMoveGuardDrawing = null;
    }

    _syncInlineTextEditorToDrawing(drawing) {
        if (!drawing || this._textInlineEditDrawing !== drawing) return;
        const helpers = typeof window !== 'undefined' ? window.DrawingTextHelpers : null;
        if (!helpers || typeof helpers.syncInlineEditorForDrawing !== 'function') return;
        try {
            helpers.syncInlineEditorForDrawing(drawing);
        } catch (_) { /* ignore */ }
    }

    /** Save/dismiss the HTML inline editor before move/resize so geometry edits never fight typing. */
    _commitInlineTextEditorBeforeGeometryEdit() {
        const hasDomEditor = typeof document !== 'undefined'
            && !!document.querySelector('.inline-text-editor--inline');
        const editing = this._textInlineEditDrawing;
        if (!editing && !hasDomEditor) return;

        if (hasDomEditor && this.textEditor && typeof this.textEditor.save === 'function') {
            try { this.textEditor.save(); } catch (_) { /* ignore */ }
        }
        if (this._textInlineEditDrawing) {
            this.endTextInlineEdit(this._textInlineEditDrawing);
        } else if (hasDomEditor) {
            if (this.textEditor && typeof this.textEditor.hide === 'function') {
                try { this.textEditor.hide(); } catch (_) { /* ignore */ }
            }
            this._detachInlineEditMoveGuard();
        }
    }

    /** Hot-path render options during move/resize (matches scheduleRenderDrawing / movement). */
    _liveRenderDrawingOpts(drawing) {
        const live = this._isLiveDrawingInteraction()
            || !!(drawing && drawing._inlineTextEditing);
        if (!live) return {};
        const skipTimestampSync = !!(drawing && this._isDrawingLiveEditing(drawing));
        return {
            skipInteraction: true,
            liveRender: true,
            skipTimestampSync,
            drawingRenderOpts: {
                reuseGroup: !!(drawing && drawing.group && !drawing.group.empty()),
                skipHandles: true
            }
        };
    }

    _beginDrawingLiveInteraction() {
        this._drawingLiveInteractionDepth = (this._drawingLiveInteractionDepth || 0) + 1;
        if (this._drawingLiveInteractionDepth > 1) return;
        // Shape move/resize must stay clipped to the plot — never relax container overflow here.
        // Chart pan alone relaxes clip via setDrawingsClipDuringChartPan() in chart.js.
        this._panClipRelaxed = false;
        this._ensureDrawingsPlotClip();
    }

    _endDrawingLiveInteraction() {
        if (!this._drawingLiveInteractionDepth) return;
        this._drawingLiveInteractionDepth -= 1;
        if (this._drawingLiveInteractionDepth > 0) return;
        this._ensureDrawingsPlotClip();
    }

    /** Move drawing by pixel delta with full re-render (avoids transform + overflow:hidden clip). */
    _applyLiveDrawingMovePixels(drawing, startPoints, pixelDx, pixelDy) {
        if (!drawing || !Array.isArray(startPoints) || !this.chart) return;
        const previewPoints = this._translatePointsByPixels(startPoints, pixelDx, pixelDy, drawing.type);
        if (!previewPoints) return;
        this._ensureDrawingsPlotClip();
        drawing.points = previewPoints.map((p) => ({ ...p }));
        this._syncRRToolExtrasDuringLiveDrag(drawing, startPoints, previewPoints);
        if (drawing.group) drawing.group.attr('transform', null);
        if (drawing.meta) drawing.meta.updatedAt = Date.now();
        this.scheduleRenderDrawing(drawing);
    }

    _isRiskRewardPositionDrawing(drawing) {
        return !!(drawing && (drawing.type === 'long-position' || drawing.type === 'short-position'));
    }

    _snapshotRRDragExtras(drawing) {
        if (!this._isRiskRewardPositionDrawing(drawing) || !drawing.meta) return null;
        const m = drawing.meta;
        const cloneArr = (arr) => (arr || []).map((r) => (r ? { ...r } : r));
        return {
            extraTargets: cloneArr(m.extraTargets),
            extraEntries: cloneArr(m.extraEntries),
            extraStops: cloneArr(m.extraStops),
            rrBreakevenLine: m.rrBreakevenLine ? { ...m.rrBreakevenLine } : null,
        };
    }

    _beginRRToolWholeDragSnapshot(drawing) {
        if (!this._isRiskRewardPositionDrawing(drawing)) return;
        drawing._rrDragExtraSnapshot = this._snapshotRRDragExtras(drawing);
        if (drawing.meta) delete drawing.meta._rrLiveDragExtrasSynced;
    }

    _clearRRToolWholeDragSnapshot(drawing) {
        if (!drawing) return;
        delete drawing._rrDragExtraSnapshot;
        if (drawing.meta) delete drawing.meta._rrLiveDragExtrasSynced;
    }

    /** Keep E2+/extra TP-SL ladder in sync while the whole RR tool moves (not only on drag release). */
    _syncRRToolExtrasDuringLiveDrag(drawing, startPoints, previewPoints) {
        if (!this._isRiskRewardPositionDrawing(drawing) || !drawing.meta) return;
        if (!drawing._rrDragExtraSnapshot) {
            drawing._rrDragExtraSnapshot = this._snapshotRRDragExtras(drawing);
        }
        const snap = drawing._rrDragExtraSnapshot;
        if (!snap) return;
        drawing.meta.extraTargets = snap.extraTargets.map((r) => (r ? { ...r } : r));
        drawing.meta.extraEntries = snap.extraEntries.map((r) => (r ? { ...r } : r));
        drawing.meta.extraStops = snap.extraStops.map((r) => (r ? { ...r } : r));
        drawing.meta.rrBreakevenLine = snap.rrBreakevenLine ? { ...snap.rrBreakevenLine } : null;
        const p0 = startPoints?.[0];
        const p1 = previewPoints?.[0];
        if (!p0 || !p1) return;
        const dy = p1.y - p0.y;
        if (dy === 0) return;
        if (typeof drawing.afterPointsMoveDelta === 'function') {
            drawing.afterPointsMoveDelta(0, dy);
            drawing.meta._rrLiveDragExtrasSynced = true;
        }
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

    /** Whether the drawing should render on the chart at the current timeframe (excludes global hide). */
    isDrawingVisibleOnChart(drawing) {
        if (!drawing) return false;
        if (drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) {
            return false;
        }
        return this._isVisibleForCurrentTimeframe(drawing);
    }

    _detachDrawingDom(drawing) {
        if (!drawing) return;
        if (drawing.group) {
            try { drawing.group.remove(); } catch (_) {}
            drawing.group = null;
        }
        if (typeof drawing.hideAxisHighlights === 'function') {
            try { drawing.hideAxisHighlights(); } catch (_) {}
        }
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
        this._bindToolStylesToPreferencesSync();

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
                if (this.drawings.length > 0) {
                    this.scheduleRefreshAfterTimeframe();
                }
            }
        };
        window.__drawingToolsChartDataLoadedListeners[this._instanceKey] = this._chartDataLoadedListener;
        window.addEventListener('chartDataLoaded', this._chartDataLoadedListener);

        window.__drawingToolsTimeframeChangedListeners = window.__drawingToolsTimeframeChangedListeners || {};
        const prevTfListener = window.__drawingToolsTimeframeChangedListeners[this._instanceKey];
        if (prevTfListener) {
            window.removeEventListener('timeframeChanged', prevTfListener);
        }
        this._timeframeChangedListener = () => {
            if (!this._drawingsLoaded || this.drawings.length === 0) return;
            this.scheduleRefreshAfterTimeframe({ force: true });
        };
        window.__drawingToolsTimeframeChangedListeners[this._instanceKey] = this._timeframeChangedListener;
        window.addEventListener('timeframeChanged', this._timeframeChangedListener);
        
        // Initialize undo/redo manager
        if (typeof UndoRedoManager !== 'undefined') {
            this.history = new UndoRedoManager(this);
        } else {
            console.warn('⚠️ UndoRedoManager not found');
        }

        this._setupDrawingsSaveStatusToolbar();
    }

    _setupDrawingsSaveStatusToolbar() {
        const btn = typeof document !== 'undefined' ? document.getElementById('drawingsSyncToolbarBtn') : null;
        if (!btn) {
            this._drawingsSaveToolbarRetries = (this._drawingsSaveToolbarRetries || 0) + 1;
            if (this._drawingsSaveToolbarRetries <= 25 && typeof window !== 'undefined') {
                setTimeout(() => this._setupDrawingsSaveStatusToolbar(), 300);
            }
            return;
        }
        if (!this._drawingsSaveToolbarClickBound) {
            this._drawingsSaveToolbarClickBound = () => {
                void this.flushDrawingsSyncNow();
            };
            btn.addEventListener('click', this._drawingsSaveToolbarClickBound);
        }
        this._drawingsSaveBtn = btn;
        this._syncDrawingsSaveUiFromTargets();
    }

    _syncDrawingsSaveUiFromTargets() {
        if (this._drawingsFlushAllInProgress) return;
        const p = this._drawingsPendingTargets;
        const busy = !!(p && p.api);
        const state = this._drawingsSaveError ? 'error' : (busy ? 'pending' : 'saved');
        this._setDrawingsSaveUi(state);
        if (typeof window !== 'undefined' && typeof window.talariaUpdateCloudSaveStatus === 'function') {
            window.talariaUpdateCloudSaveStatus({
                drawingsPending: busy,
                drawingsError: !!this._drawingsSaveError
            });
        }
    }

    _setDrawingsSaveUi(state) {
        const btn = this._drawingsSaveBtn || (typeof document !== 'undefined' ? document.getElementById('drawingsSyncToolbarBtn') : null);
        if (!btn) return;
        this._drawingsSaveBtn = btn;
        if (state === 'pending') {
            btn.classList.add('drawings-sync-pending');
            btn.classList.remove('drawings-sync-error');
            btn.setAttribute('data-tooltip', 'Saving to cloud… — click to save now');
            btn.setAttribute('aria-busy', 'true');
        } else if (state === 'error') {
            btn.classList.remove('drawings-sync-pending');
            btn.classList.add('drawings-sync-error');
            btn.setAttribute('data-tooltip', 'Cloud sync failed — click to retry');
            btn.setAttribute('aria-busy', 'false');
        } else {
            btn.classList.remove('drawings-sync-pending', 'drawings-sync-error');
            btn.setAttribute('data-tooltip', 'Saved — click to sync to cloud now');
            btn.setAttribute('aria-busy', 'false');
        }
    }

    _onSessionDrawingsSaveFinished() {
        if (this._drawingsFlushAllInProgress) return;
        if (this._drawingsPendingTargets) {
            this._drawingsPendingTargets.session = false;
        }
        this._syncDrawingsSaveUiFromTargets();
    }

    _onChartDrawingsApiSaveFinished() {
        if (this._drawingsFlushAllInProgress) return;
        if (this._drawingsPendingTargets) {
            this._drawingsPendingTargets.api = false;
        }
        this._syncDrawingsSaveUiFromTargets();
    }

    static get API_SAVE_DEBOUNCE_MS() {
        return 600;
    }

    /** After 401, skip cloud drawings API until a new token appears (avoids console spam). */
    static _drawingsCloudAuthBlocked = false;
    static _drawingsCloudAuthLastToken = null;
    static _drawingsAuthWarnAt = 0;

    _canUseDrawingsCloudApi() {
        if (typeof localStorage === 'undefined') return false;
        const token = localStorage.getItem('token');
        if (!token) {
            DrawingToolsManager._drawingsCloudAuthBlocked = false;
            DrawingToolsManager._drawingsCloudAuthLastToken = null;
            return false;
        }
        if (token !== DrawingToolsManager._drawingsCloudAuthLastToken) {
            DrawingToolsManager._drawingsCloudAuthLastToken = token;
            DrawingToolsManager._drawingsCloudAuthBlocked = false;
        }
        return !DrawingToolsManager._drawingsCloudAuthBlocked;
    }

    /** Mint journal JWT from cookie session (same as homepage syncJournalTokenFromSession). */
    async _recoverDrawingsCloudAuthFromSession() {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
            if (!res.ok) return false;
            const data = await res.json();
            const t = data && data.journal_token;
            if (typeof t !== 'string' || !t.trim()) return false;
            localStorage.setItem('token', t.trim());
            DrawingToolsManager._drawingsCloudAuthLastToken = t.trim();
            DrawingToolsManager._drawingsCloudAuthBlocked = false;
            return true;
        } catch (_) {
            return false;
        }
    }

    _onDrawingsApiUnauthorized() {
        if (typeof localStorage !== 'undefined') {
            try { localStorage.removeItem('token'); } catch (_) { /* ignore */ }
        }
        DrawingToolsManager._drawingsCloudAuthBlocked = true;
        DrawingToolsManager._drawingsCloudAuthLastToken = null;
        if (this._apiSaveTimer) {
            clearTimeout(this._apiSaveTimer);
            this._apiSaveTimer = null;
        }
        const now = Date.now();
        if (!DrawingToolsManager._drawingsAuthWarnAt || now - DrawingToolsManager._drawingsAuthWarnAt > 60000) {
            DrawingToolsManager._drawingsAuthWarnAt = now;
            console.warn('⚠️ Drawings cloud sync paused — sign in again to sync across devices');
        }
    }

    _isStorageQuotaError(error) {
        if (!error) return false;
        const name = error.name || '';
        const msg = String(error.message || error || '');
        return name === 'QuotaExceededError' || /quota/i.test(msg);
    }

    _physicalUserStorageKey(logicalKey) {
        if (typeof window !== 'undefined' && typeof window.userKey === 'function') {
            return window.userKey(logicalKey);
        }
        return logicalKey;
    }

    _evictStaleDrawingsCacheKeys(preserveLogicalKey) {
        if (typeof localStorage === 'undefined') return 0;
        const preserve = this._physicalUserStorageKey(preserveLogicalKey);
        const candidates = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k === preserve) continue;
            if (/^u\d+_chart_drawings_/.test(k) || (k.startsWith('chart_drawings_') && !/^u\d+_/.test(k))) {
                candidates.push(k);
            }
        }
        candidates.sort();
        let removed = 0;
        for (const k of candidates) {
            try {
                localStorage.removeItem(k);
                if (k.includes('chart_drawings_')) {
                    localStorage.removeItem(`${k}_meta`);
                }
                removed++;
            } catch (_) { /* ignore */ }
            if (removed >= 12) break;
        }
        return removed;
    }

    _notifyDrawingsCacheQuota() {
        const now = Date.now();
        if (this._drawingsQuotaToastAt && now - this._drawingsQuotaToastAt < 60000) return;
        this._drawingsQuotaToastAt = now;
        try {
            const hasToken = typeof localStorage !== 'undefined' && localStorage.getItem('token');
            const msg = hasToken
                ? 'Browser storage full — drawings still sync to your account'
                : 'Browser storage full — sign in to save drawings to the cloud';
            if (this.chart && typeof this.chart.showNotification === 'function') {
                this.chart.showNotification(msg, 'warning', 4500);
            }
        } catch (_) { /* ignore */ }
    }

    _writeDrawingsCache(logicalKey, jsonString) {
        try {
            userStorage.setItem(logicalKey, jsonString);
            return true;
        } catch (error) {
            if (!this._isStorageQuotaError(error)) {
                console.warn('⚠️ Failed to save drawings to localStorage:', error?.message || error);
                return false;
            }
            this._evictStaleDrawingsCacheKeys(logicalKey);
            try {
                userStorage.setItem(logicalKey, jsonString);
                this._notifyDrawingsCacheQuota();
                return true;
            } catch (retryErr) {
                console.warn('⚠️ Failed to save drawings to localStorage after cache eviction:', retryErr?.message || retryErr);
                this._notifyDrawingsCacheQuota();
                return false;
            }
        }
    }

    _getDrawingsCacheMetaKey(logicalKey) {
        return `${logicalKey}_meta`;
    }

    _readDrawingsCacheMeta(logicalKey) {
        try {
            const raw = userStorage.getItem(this._getDrawingsCacheMetaKey(logicalKey));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    _writeDrawingsCacheMeta(logicalKey, meta) {
        if (!meta || typeof meta !== 'object') return;
        try {
            userStorage.setItem(this._getDrawingsCacheMetaKey(logicalKey), JSON.stringify(meta));
        } catch (_) { /* ignore */ }
    }

    _parseUpdatedAtMs(value) {
        if (value == null) return 0;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
        const parsed = Date.parse(String(value));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    _readLocalDrawingsCache(logicalKey) {
        let raw = userStorage.getItem(logicalKey);
        if (!raw && logicalKey.includes('_s')) {
            const fileId = this.chart?.currentFileId || 'default';
            raw = userStorage.getItem(`chart_drawings_${fileId}`);
        }
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Server-first load with timestamp merge (chart_drawings API is canonical when logged in).
     */
    async _resolveDrawingsPayloadForLoad() {
        const key = this.getStorageKey();
        const hasToken = this._canUseDrawingsCloudApi();
        const localData = this._readLocalDrawingsCache(key);
        const localMeta = this._readDrawingsCacheMeta(key);
        const localMs = this._parseUpdatedAtMs(localMeta?.client_updated_at || localMeta?.updated_at);

        if (hasToken) {
            const apiResult = await this.loadDrawingsFromAPI();
            if (apiResult) {
                const serverMs = this._parseUpdatedAtMs(apiResult.updated_at);
                const serverDrawings = Array.isArray(apiResult.drawings) ? apiResult.drawings : [];

                if (localData && localMs > serverMs + 1500) {
                    console.log('📥 Loaded drawings from local cache (newer than server — re-syncing)');
                    this.scheduleSaveToAPI(localData, localMs);
                    return { data: localData, source: 'local' };
                }

                console.log(`📥 Loaded drawings from cloud (${serverDrawings.length} shapes)`);
                this._writeDrawingsCache(key, JSON.stringify(serverDrawings));
                this._writeDrawingsCacheMeta(key, {
                    updated_at: apiResult.updated_at || null,
                    client_updated_at: serverMs || Date.now()
                });
                return { data: serverDrawings, source: 'server' };
            }
        }

        if (localData) {
            console.log('📥 Loaded drawings from localStorage cache');
            return { data: localData, source: 'local' };
        }

        return { data: null, source: 'none' };
    }

    /**
     * Single save pipeline: local cache (instant) + debounced chart_drawings API POST.
     */
    persistDrawings(fileIdOverride = null) {
        this.saveDrawings(fileIdOverride);
    }

    /**
     * Flush debounced chart_drawings API save — used on tab hide / pagehide.
     */
    _flushScheduledSaveDrawings() {
        if (this._apiSaveTimer) {
            clearTimeout(this._apiSaveTimer);
            this._apiSaveTimer = null;
        }
        if (!this.chart || !Array.isArray(this.drawings)) return;
        const data = this.drawings.map((d) => this._serializeDrawingForStorage(d));
        this._saveDrawingsToAPIKeepalive(data);
    }

    _saveDrawingsToAPIKeepalive(data) {
        try {
            const symbol = this.chart.currentFileId || 'default';
            const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
                ? this.chart.getActiveTradingSessionId()
                : null;
            if (!this._canUseDrawingsCloudApi()) return;

            const token = localStorage.getItem('token');
            const body = JSON.stringify({
                drawings: data,
                session_id: sessionId,
                client_updated_at: this._readDrawingsCacheMeta(this.getStorageKey())?.client_updated_at || Date.now()
            });
            if (body.length > 60000) {
                void this.saveDrawingsToAPI(data);
                return;
            }
            fetch(`/api/chart/drawings/${encodeURIComponent(symbol)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body,
                keepalive: true
            }).catch(() => { /* ignore on unload */ });
        } catch (_) { /* ignore */ }
    }

    /**
     * Force immediate cloud + session sync (TradingView-style manual save). localStorage is already updated on each edit.
     */
    async flushDrawingsSyncNow() {
        if (!this.chart) return;
        const isUndoRedo = this.history && this.history.isPerformingUndoRedo;
        if (isUndoRedo) return;

        this.drawings.forEach(d => {
            this._ensureDrawingId(d);
            if (!d.chart) d.chart = this.chart;
        });
        const data = this.drawings.map((d) => this._serializeDrawingForStorage(d));
        const cacheKey = this.getStorageKey();
        this._writeDrawingsCache(cacheKey, JSON.stringify(data));

        this._drawingsFlushAllInProgress = true;
        try {
            if (this._apiSaveTimer) {
                clearTimeout(this._apiSaveTimer);
                this._apiSaveTimer = null;
            }
            this._drawingsSaveError = false;
            const meta = this._readDrawingsCacheMeta(cacheKey);
            await this.saveDrawingsToAPI(data, meta?.client_updated_at || Date.now());

            this._drawingsPendingTargets = { api: false };
            this._setDrawingsSaveUi('saved');
            try {
                if (typeof this.chart.showNotification === 'function') {
                    const hadRemote = !!(typeof localStorage !== 'undefined' && localStorage.getItem('token'));
                    this.chart.showNotification(hadRemote ? 'Drawings synced' : 'Saved locally');
                }
            } catch (_) { /* ignore */ }
        } catch (e) {
            console.warn('flushDrawingsSyncNow failed', e);
            this._drawingsSaveError = true;
            try {
                if (typeof this.chart.showNotification === 'function') {
                    this.chart.showNotification('Could not sync drawings — try again', 'error');
                }
            } catch (_) { /* ignore */ }
        } finally {
            this._drawingsFlushAllInProgress = false;
            this._syncDrawingsSaveUiFromTargets();
        }
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
            self._broadcastLiveEditUpdate(drawing);
        };
        
        // Delete callback
        this.toolbar.onDelete = (drawing) => {
            // Discard any pending style timer
            clearTimeout(_styleTimer);
            _styleBeforeState = null;
            _styleBeforeId = null;
            self.deleteDrawing(drawing);
        };
        
        // Settings callback - opens settings panel (same V9 hook as editDrawing / dblclick)
        this.toolbar.onSettings = (drawing, anchorX, anchorY) => {
            let liveDrawing = drawing;
            try {
                if (self.selectedDrawing) {
                    liveDrawing = self.selectedDrawing;
                } else if (drawing && drawing.id != null && Array.isArray(self.drawings)) {
                    const want = String(drawing.id);
                    const found = self.drawings.find(
                        (d) => d && d.id != null && String(d.id) === want
                    );
                    if (found) liveDrawing = found;
                }
            } catch (_) { /* ignore */ }
            const rect = self.toolbar.toolbar.getBoundingClientRect();
            const x =
                typeof anchorX === 'number' && !Number.isNaN(anchorX)
                    ? anchorX
                    : rect.left + rect.width / 2;
            const y =
                typeof anchorY === 'number' && !Number.isNaN(anchorY)
                    ? anchorY
                    : rect.bottom + 10;
            if (isMultichartIframeEmbed()) {
                self.editDrawing(liveDrawing, x, y);
                return;
            }
            // Multichart (any tile): same code path as dblclick / main-chart gear.
            try {
                if (typeof window !== 'undefined' && window.__multichartGrid) {
                    self.editDrawing(liveDrawing, x, y);
                    return;
                }
            } catch (_mc) { /* ignore */ }
            const v9Open = resolveV9OpenDrawingSettings();
            if (v9Open) {
                try {
                    const handled = v9Open(liveDrawing, x, y);
                    if (handled) {
                        if (self.toolbar && typeof self.toolbar.hide === 'function') self.toolbar.hide();
                        if (self.settingsPanel && typeof self.settingsPanel.hide === 'function') {
                            self.settingsPanel.hide();
                        }
                        if (liveDrawing && liveDrawing.type === 'image') liveDrawing._keepEmpty = true;
                        return;
                    }
                } catch (err) {
                    console.warn('[V9 toolbar settings] hook threw, falling back to legacy panel:', err);
                }
                if (liveDrawing && self._isTextDrawingType(liveDrawing.type)) {
                    console.warn('[V9] Text settings hook did not handle this drawing; legacy modal suppressed.');
                    return;
                }
            }
            if (typeof window !== 'undefined' && window.__multichartGrid) {
                return;
            }
            const beforeState = self.history ? self.history.captureState(liveDrawing) : null;
            self.settingsPanel.show(
                liveDrawing,
                x,
                y,
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
        
        const panelIdx = (this.chart && this.chart.panelIndex !== undefined) ? this.chart.panelIndex : '';
        const clipId = 'chart-clip-path' + (panelIdx !== '' && panelIdx !== 0 ? panelIdx : '');
        this._clipId = clipId;

        // Create clip path definition for chart area (excludes price/time axes)
        let defs = this.svg.select('defs');
        if (defs.empty()) {
            defs = this.svg.append('defs');
        }
        
        // Create or update clip path for chart area
        let clipPath = defs.select('#' + clipId);
        if (clipPath.empty()) {
            clipPath = defs.append('clipPath')
                .attr('id', clipId)
                .attr('clipPathUnits', 'userSpaceOnUse');
            clipPath.append('rect')
                .attr('class', 'chart-clip-rect');
        } else {
            clipPath.attr('clipPathUnits', 'userSpaceOnUse');
        }
        
        // Update clip rect dimensions
        this.updateClipPath();
        
        const clipUrl = 'url(#' + clipId + ')';

        // Main drawings group with clipping
        this.drawingsGroup = this.svg.select('.drawings');
        if (this.drawingsGroup.empty()) {
            this.drawingsGroup = this.svg.append('g')
                .attr('class', 'drawings')
                .attr('clip-path', clipUrl)
                .style('pointer-events', 'none');
        } else {
            this.drawingsGroup.attr('clip-path', clipUrl);
        }
        
        // Temporary drawing group (for live preview) with clipping
        this.tempGroup = this.svg.select('.temp-drawing');
        if (this.tempGroup.empty()) {
            this.tempGroup = this.svg.append('g')
                .attr('class', 'temp-drawing')
                .attr('clip-path', clipUrl)
                .style('pointer-events', 'none');
        } else {
            this.tempGroup.attr('clip-path', clipUrl);
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
    updateClipPath(panPadding = null) {
        const m = this.chart.margin;
        const w = this.chart.w || this.chart.canvas?.width || 800;
        const h = this.chart.h || this.chart.canvas?.height || 600;
        let clipX = m.l;
        let clipY = m.t;
        let clipW = w - m.l - m.r;
        let clipH = h - m.t - m.b;
        if (panPadding) {
            const padL = Math.max(0, Number(panPadding.left) || 0);
            const padR = Math.max(0, Number(panPadding.right) || 0);
            const padT = Math.max(0, Number(panPadding.top) || 0);
            const padB = Math.max(0, Number(panPadding.bottom) || 0);
            clipX -= padL;
            clipY -= padT;
            clipW += padL + padR;
            clipH += padT + padB;
        }
        this.svg.select('.chart-clip-rect')
            .attr('x', clipX)
            .attr('y', clipY)
            .attr('width', Math.max(1, clipW))
            .attr('height', Math.max(1, clipH));
    }

    /** Keep drawings clipped to the plot (excludes price/time axis margins). */
    _ensureDrawingsPlotClip() {
        if (!this.svg || this.svg.empty()) return;
        if (this.chart && typeof this.chart._syncAdaptivePriceAxisMargin === 'function') {
            try { this.chart._syncAdaptivePriceAxisMargin(); } catch (_) { /* ignore */ }
        }
        this.updateClipPath();
        this.svg.style('overflow', 'hidden');
        const clipUrl = this._clipUrl();
        if (!clipUrl) return;
        if (this.drawingsGroup && !this.drawingsGroup.empty()) {
            this.drawingsGroup.attr('clip-path', clipUrl);
        }
        if (this.tempGroup && !this.tempGroup.empty()) {
            this.tempGroup.attr('clip-path', clipUrl);
        }
    }

    _clipUrl() {
        return this._clipId ? `url(#${this._clipId})` : null;
    }

    /**
     * While chart pan uses CSS translate on drawing layers, a fixed clip-path cuts extended
     * lines/rectangles (handles stay, strokes vanish). Drop clip until pan ends.
     */
    setDrawingsClipDuringChartPan(active) {
        if (!this.svg || this.svg.empty()) return;
        const clipUrl = this._clipUrl();
        if (active) {
            if (this._panClipRelaxed) return;
            this._panClipRelaxed = true;
            if (this.drawingsGroup && !this.drawingsGroup.empty()) {
                this.drawingsGroup.attr('clip-path', null);
            }
            if (this.tempGroup && !this.tempGroup.empty()) {
                this.tempGroup.attr('clip-path', null);
            }
            return;
        }
        if (!this._panClipRelaxed) return;
        this._panClipRelaxed = false;
        this.updateClipPath();
        if (clipUrl) {
            if (this.drawingsGroup && !this.drawingsGroup.empty()) {
                this.drawingsGroup.attr('clip-path', clipUrl);
            }
            if (this.tempGroup && !this.tempGroup.empty()) {
                this.tempGroup.attr('clip-path', clipUrl);
            }
        }
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
            if (this._isTextAnnotationInlineEditTarget(rawTargetNode)) {
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
                const handleDrawingGroup = handleNode.closest ? handleNode.closest('.drawing') : null;
                const handleDrawingId = handleDrawingGroup ? handleDrawingGroup.getAttribute('data-id') : null;
                const handleDrawing = handleDrawingId
                    ? this.drawings.find((d) => d && d.id === handleDrawingId)
                    : null;
                const handleGroup = handleNode.closest ? handleNode.closest('.resize-handle-group') : null;
                const pointIdx = (handleNode.getAttribute && handleNode.getAttribute('data-point-index'))
                    || (handleGroup && handleGroup.getAttribute && handleGroup.getAttribute('data-point-index'));
                const isAnchoredVpAnchorHandle = !!(
                    handleDrawing
                    && handleDrawing.type === 'anchored-volume-profile'
                    && pointIdx === '0'
                );
                if (!isAnchoredVpAnchorHandle) {
                    return false;
                }
            }

            const levelLineNode = rawTargetNode && rawTargetNode.closest
                ? rawTargetNode.closest('.volume-profile-level-line')
                : null;
            if (levelLineNode) {
                const levelDrawingGroup = levelLineNode.closest('.drawing');
                const levelDrawingId = levelDrawingGroup
                    ? d3.select(levelDrawingGroup).attr('data-id')
                    : null;
                const levelDrawing = levelDrawingId
                    ? this.drawings.find((d) => d && d.id === levelDrawingId)
                    : null;

                if (levelDrawing && this.isVolumeProfileToolType(levelDrawing.type) && !levelDrawing.locked) {
                    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                    if (typeof event.stopPropagation === 'function') event.stopPropagation();
                    if (typeof event.preventDefault === 'function') event.preventDefault();

                    this.selectDrawing(levelDrawing);
                    this.editDrawing(levelDrawing, event.pageX, event.pageY);
                    return true;
                }
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

            const domResolvedDrawing = this._resolveDrawingFromDomTarget(rawTargetNode);
            if (domResolvedDrawing && !domResolvedDrawing.locked) {
                const skipGenericVpBodySettings = this.isVolumeProfileToolType(domResolvedDrawing.type)
                    && domResolvedDrawing.type !== 'anchored-volume-profile'
                    && !rawTargetNode?.closest?.('.volume-profile-level-line, .volume-profile-values-label');
                if (!skipGenericVpBodySettings) {
                    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                    if (typeof event.stopPropagation === 'function') event.stopPropagation();
                    if (typeof event.preventDefault === 'function') event.preventDefault();

                    this.selectDrawing(domResolvedDrawing);
                    this.editDrawing(domResolvedDrawing, event.pageX, event.pageY);
                    return true;
                }
            }

            const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
            if (!svgNode) return false;

            const [mouseX, mouseY] = this._eventCanvasLocalXY(event);
            for (let i = this.drawings.length - 1; i >= 0; i--) {
                const vpDrawing = this.drawings[i];
                if (!vpDrawing || !this.isCandleBoundTool(vpDrawing.type) || vpDrawing.locked) continue;
                if (!this.isVolumeProfileLevelLineHit(vpDrawing, mouseX, mouseY)) continue;

                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
                if (typeof event.preventDefault === 'function') event.preventDefault();

                this.selectDrawing(vpDrawing);
                this.editDrawing(vpDrawing, event.pageX, event.pageY);
                return true;
            }

            const valueLabelDrawing = this.findTopVolumeProfileValuesLabelDrawingAtPoint(mouseX, mouseY);
            const drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true });

            let fallbackVolumeProfileDrawing = null;
            if ((!drawingsAtPoint || drawingsAtPoint.length === 0) && rawTargetNode && rawTargetNode.closest) {
                const volumeProfileHitNode = rawTargetNode.closest('.volume-profile-values-label, .volume-profile-boundary, .volume-profile-boundary-hit, .volume-profile-level-line, .volume-profile-hitbox, .volume-profile-range');
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

            if (this.isVolumeProfileToolType(drawing.type) && drawing.type !== 'anchored-volume-profile') {
                const onLevelLine = this.isVolumeProfileLevelLineHit(drawing, mouseX, mouseY);
                const onValueLabel = this.isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY);
                if (!onLevelLine && !onValueLabel) {
                    return false;
                }
            }

            if (this._isTextDrawingType(drawing.type) && this._isTextAnnotationInteractionTarget(rawTargetNode)) {
                return false;
            }

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
        
        // Keyboard shortcuts — only bind for the main chart; panels route through getActiveChart()
        const kbSuffix = (this.chart && this.chart.panelIndex !== undefined && this.chart.panelIndex !== 0)
            ? '.drawing' + this.chart.panelIndex : '.drawing';
        d3.select(window).on('keydown' + kbSuffix, (event) => {
            const active = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : null;
            if (active && active.drawingManager && active.drawingManager !== this) return;
            this.handleKeyDown(event);
        });
        d3.select(window).on('keyup' + kbSuffix, (event) => {
            const active = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : null;
            if (active && active.drawingManager && active.drawingManager !== this) return;
            this.handleKeyUp(event);
        });
        d3.select(window).on('blur' + kbSuffix, () => { this.magnetKeyHeld = false; this.ctrlSelectMode = false; });
        
        // Canvas-level events for rectangular selection and deselection
        const canvas = (this.chart && this.chart.canvas) || (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        // Proximity hover + cursor: one listener on #chartWrapper (parent of canvas + drawingSvg).
        // Avoids duplicating checkDrawingProximity on both canvas mousemove and svg handleMouseMove.
        const chartWrapper = canvas && canvas.parentElement;
        if (chartWrapper) {
            const prevProx = chartWrapper.__drawingToolsProximityMove;
            if (typeof prevProx === 'function') {
                chartWrapper.removeEventListener('mousemove', prevProx);
            }
            const onChartWrapperMouseMove = (event) => {
                if (this.currentTool || this.isRectSelecting) return;
                if (this.drawingState && this.drawingState.isDrawing) return;
                this.checkDrawingProximity(event);
            };
            chartWrapper.addEventListener('mousemove', onChartWrapperMouseMove, { passive: true });
            chartWrapper.__drawingToolsProximityMove = onChartWrapperMouseMove;
        }
        if (canvas) {
            let suppressNextCanvasClick = false;

            const existing = canvas.__drawingToolsCanvasHandlers;
            if (existing) {
                canvas.removeEventListener('mousedown', existing.mousedown, true);
                canvas.removeEventListener('click', existing.click);
                if (typeof existing.mousemove === 'function') {
                    canvas.removeEventListener('mousemove', existing.mousemove);
                }
                canvas.removeEventListener('dblclick', existing.dblclick, true);
            }

            // Mousedown on canvas for drawing drag/select (Ctrl+marquee is handled by chart.js)
            const onMouseDown = (event) => {
                if (this._tryStartCtrlSelectionMove(event)) {
                    suppressNextCanvasClick = true;
                    return;
                }
                if (event.button === 0 && event.ctrlKey && !event.shiftKey && !this.currentTool && !this.isRectSelecting) {
                    const [ctrlMx, ctrlMy] = this._eventCanvasLocalXY(event);
                    const ctrlHits = this.findDrawingsAtPoint(ctrlMx, ctrlMy, { includeVolumeProfileBodyHit: true });
                    if (!ctrlHits || ctrlHits.length === 0) {
                        return;
                    }
                }

                // Make drag-start use the same geometric hover hit zone, even when the
                // cursor is not exactly on an SVG stroke target.
                if (event.button !== 0 || this.isRectSelecting || event.shiftKey || event.altKey) {
                    return;
                }
                // While actively placing a stroke, canvas is for placement only.
                if (this.drawingState && this.drawingState.isDrawing) {
                    return;
                }

                const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
                if (!svgNode) return;

                // Let Anchored VWAP anchor points use their own element drag behavior.
                // Avoid canvas-capture direct-drag hijacking (which can no-op for anchored-vwap).
                const rawTarget = event.target;
                const isAnchoredVwapAnchorTarget = !!(rawTarget && rawTarget.closest && rawTarget.closest('.anchored-vwap-anchor, .anchored-vwap-anchor-hit'));
                if (isAnchoredVwapAnchorTarget) return;

                const [mouseX, mouseY] = this._eventCanvasLocalXY(event);
                let drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true });
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

                // Zone fill blocks chart pan; level lines / boundaries / labels stay interactive.
                const hasInteractiveDrawingHit = (drawingsAtPoint || []).some((d) => {
                    if (!d) return false;
                    if (!this.isVolumeProfileToolType(d.type)) return true;
                    return this.isVolumeProfileInteractiveHit(d, mouseX, mouseY);
                });
                const volumeProfileZoneFillHit = (drawingsAtPoint || []).find((d) =>
                    d && this.isVolumeProfileToolType(d.type) && d.type !== 'anchored-volume-profile'
                    && this.isVolumeProfileZoneFillHit(d, mouseX, mouseY)
                );
                if (volumeProfileZoneFillHit && !this.currentTool) {
                    if (!volumeProfileZoneFillHit.locked) {
                        this.selectDrawing(volumeProfileZoneFillHit, false);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }
                if (drawingsAtPoint && drawingsAtPoint.length > 0 && !hasInteractiveDrawingHit) {
                    if (event.detail >= 2) {
                        const openedFromDoubleClick = openDrawingSettingsFromDoubleClick(event);
                        if (openedFromDoubleClick) {
                            this._suppressNextDrawingDblClickUntil = Date.now() + 600;
                            suppressNextCanvasClick = true;
                        }
                    }
                    return;
                }

                if (!drawingsAtPoint || drawingsAtPoint.length === 0) {
                    // Armed draw tool on empty chart — let SVG placement layer handle the click.
                    if (this.currentTool) return;
                    if (this._tryDeselectOnBackgroundPointer(event, mouseX, mouseY)) {
                        suppressNextCanvasClick = true;
                    }
                    return;
                }
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
                    && rawTarget.closest('.volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-values-label, .volume-profile-level-line, .volume-profile-hitbox, .volume-profile-range, .resize-handle, .resize-handle-hit, .resize-handle-group')
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
                    if (!openedFromDoubleClick && isVolumeProfileLevelLineHit) {
                        const levelDrawing = drawingsAtPoint.find((d) =>
                            d && !d.locked && this.isVolumeProfileLevelLineHit(d, mouseX, mouseY)
                        );
                        if (levelDrawing) {
                            this.selectDrawing(levelDrawing, false);
                            this.editDrawing(levelDrawing, event.pageX, event.pageY);
                            openedFromDoubleClick = true;
                        }
                    }
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
                        if (best) {
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
                    const best = drawingsAtPoint.find((d) =>
                        d && !d.locked && this.isVolumeProfileLevelLineHit(d, mouseX, mouseY)
                    ) || drawingsAtPoint[0];
                    if (best && !best.locked) {
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

                const isVolumeProfileBackgroundOnly = !!(
                    rawTarget
                    && rawTarget.closest
                    && rawTarget.closest('.volume-profile-hitbox, .volume-profile-range')
                    && !rawTarget.closest('.volume-profile-level-line, .volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-values-label, .resize-handle, .resize-handle-hit, .resize-handle-group')
                );
                if (isVolumeProfileBackgroundOnly && isVolumeProfileHit) {
                    const best = drawingsAtPoint.find((d) => d && this.isVolumeProfileToolType(d.type)) || drawingsAtPoint[0];
                    if (best && !best.locked) {
                        this.selectDrawing(best, false);
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
                    if (best && this.isVolumeProfileInteractiveHit(best, mouseX, mouseY) && !best.locked) {
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

                    if (best && this.isVolumeProfileInteractiveHit(best, mouseX, mouseY)) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }
                        suppressNextCanvasClick = true;
                    }
                    return;
                }

                const best = drawingsAtPoint[0];
                // Anchored VWAP curves span most of the chart — don't hijack pan/drag on the curve;
                // select on click so the V9 quick bar appears (anchor handle keeps its own drag path).
                if (best && best.type === 'anchored-vwap' && !this._isAnchoredVwapAnchorHit(best, mouseX, mouseY)) {
                    if (!best.locked) {
                        this.selectDrawing(best, false);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    suppressNextCanvasClick = true;
                    return;
                }

                const selectedAtPoint = this._getSelectedDrawingsAtPoint(mouseX, mouseY);
                const toMove = (this.selectedDrawings || []).filter((d) =>
                    d && !d.locked && !this._isHorizontalAnchorToolType(d.type)
                );

                if (selectedAtPoint.length > 0 && toMove.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    this._startDirectMoveDrag(toMove, event);
                    suppressNextCanvasClick = true;
                    return;
                }

                if (best && !best.locked && !this._isHorizontalAnchorToolType(best.type)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }
                    this.selectDrawing(best, false);
                    this._startDirectMoveDrag(best, event);
                    suppressNextCanvasClick = true;
                }
            };
            canvas.addEventListener('mousedown', onMouseDown, true);
            
            // Click on canvas to deselect all drawings
            const onClick = (event) => {
                if (suppressNextCanvasClick) {
                    suppressNextCanvasClick = false;
                    return;
                }
                if (this._consumeCanvasBackgroundDeselectSuppress()) {
                    return;
                }

                // Skip if click originated from toolbar or UI elements
                if (event.target.closest('.tool-btn') || 
                    event.target.closest('.tool-dropdown') || 
                    event.target.closest('.tool-group-btn') ||
                    event.target.closest('.toolbar')) {
                    return;
                }

                // RR + controls sit outside hit-tested zone; don't treat their click as "background".
                const clickTgt = event.target;
                if (clickTgt && typeof clickTgt.closest === 'function' && clickTgt.closest('.rr-plus-btn')) {
                    return;
                }
                
                if (!event.ctrlKey && this.selectedDrawings.length > 0 && !this.isRectSelecting) {
                    // [debug removed]
                    this.deselectAll({ fromCanvasBackground: true });
                }
            };
            canvas.addEventListener('click', onClick);

            const onDblClick = (event) => {
                if (event.button !== 0) return;
                const chart = this.chart;
                if (chart && typeof chart._detectCursorModeAt === 'function') {
                    const [mx, my] = chart._eventCanvasLocalXY(event);
                    const axisMode = chart._detectCursorModeAt(mx, my);
                    if (axisMode === 'priceAxis' || axisMode === 'timeAxis' || axisMode === 'separatePanelAxis') {
                        if (axisMode === 'priceAxis' && typeof chart._applyPriceAxisDoubleClickLock === 'function') {
                            chart._applyPriceAxisDoubleClickLock();
                        } else if (axisMode === 'timeAxis' && typeof chart._applyTimeAxisDoubleClickReset === 'function') {
                            chart._applyTimeAxisDoubleClickReset();
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }
                        return;
                    }
                }
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

            canvas.__drawingToolsCanvasHandlers = {
                mousedown: onMouseDown,
                click: onClick,
                dblclick: onDblClick
            };
        }
    }

    /**
     * Set the current drawing tool
     */
    setTool(toolName, _mirrored = false) {
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

        // Box-select (Ctrl+drag) hijacks mousemove; cancel it when switching to a drawing tool
        // so magnet (Ctrl) + draw works and previews are not stuck on the selection rectangle.
        if (this.isRectSelecting) {
            this.cancelRectangularSelection();
        }

        this.currentTool = toolName;
        this.deselectAll({ forSelectionChange: true });
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
            this._applyPlacementModePointerEvents();
        }
        
        // Sync with favorites toolbar
        if (this.favoritesManager && typeof this.favoritesManager.syncActiveState === 'function') {
            this.favoritesManager.syncActiveState(toolName);
        }
        this._updateAxisZonePointerEvents();

        // Multi-panel: arm the same drawing tool on all visible charts so first click
        // can draw immediately without pre-selecting a panel.
        if (!_mirrored && window.panelManager && window.panelManager.currentLayout !== '1') {
            const managers = [];
            if (window.chart && window.chart.drawingManager) managers.push(window.chart.drawingManager);
            if (Array.isArray(window.panelManager.panels)) {
                window.panelManager.panels.forEach((p) => {
                    const dm = p && p.chartInstance && p.chartInstance.drawingManager;
                    if (dm) managers.push(dm);
                });
            }
            managers.forEach((dm) => {
                if (!dm || dm === this || typeof dm.setTool !== 'function') return;
                if (dm.currentTool !== toolName) dm.setTool(toolName, true);
            });
        }
        
        // [debug removed]
    }

    /** True when placing a new drawing (armed tool or active in-progress shape). */
    _isPlacementModeActive() {
        return !!(this.currentTool || (this.drawingState && this.drawingState.isDrawing));
    }

    /** Make one finished drawing fully click-through (parent + all descendants). */
    _disableDrawingPointerEvents(drawing) {
        if (!drawing || !drawing.group) return;
        drawing.group.style('pointer-events', 'none');
        drawing.group.style('cursor', 'default');
        drawing.group.selectAll('*')
            .style('pointer-events', 'none')
            .style('cursor', 'default');
    }

    _disableAllDrawingsPointerEvents() {
        if (!Array.isArray(this.drawings)) return;
        this.drawings.forEach((d) => this._disableDrawingPointerEvents(d));
    }

    /** While drawing, finished shapes must not steal mousedown from the SVG placement layer. */
    _applyPlacementModePointerEvents() {
        if (!this._isPlacementModeActive()) return;
        this._disableAllDrawingsPointerEvents();
        if (this.drawingsGroup && !this.drawingsGroup.empty()) {
            this.drawingsGroup.style('pointer-events', 'none');
        }
        if (this.labelsGroup && !this.labelsGroup.empty()) {
            this.labelsGroup.style('pointer-events', 'none');
        }
        if (this.svg) {
            this.svg.style('cursor', 'crosshair');
            this.svg.style('pointer-events', 'all');
        }
        if (this.chart?.canvas) {
            this.chart.canvas.style.cursor = 'crosshair';
        }
    }

    /**
     * Clear current tool (cursor mode)
     */
    clearTool(_mirrored = false) {
        if (this.isRectSelecting) {
            this.cancelRectangularSelection();
        }
        this._clearLiveSyncPreview();
        this._clearCurvePlacementCache();
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
        if (this.drawingsGroup && !this.drawingsGroup.empty()) {
            this.drawingsGroup.style('pointer-events', null);
        }
        if (this.labelsGroup && !this.labelsGroup.empty()) {
            this.labelsGroup.style('pointer-events', null);
        }
        
        // Re-enable pointer events on STROKES ONLY - fills remain non-interactive
        this.drawings.forEach(drawing => {
            if (drawing.group) {
                // Keep group pointer-events none
                drawing.group.style('pointer-events', 'none');
                // Lines, text, handles use 'all'
                drawing.group.selectAll('line, polyline, text, .resize-handle-hit, .resize-handle-group, .custom-handle')
                    .style('pointer-events', 'all');
                drawing.group.selectAll('.resize-handle')
                    .style('pointer-events', 'none');
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

        // Mirror clear to all other panel drawing managers
        if (!_mirrored && window.panelManager && window.panelManager.currentLayout !== '1') {
            const allDms = [];
            if (window.chart && window.chart.drawingManager) allDms.push(window.chart.drawingManager);
            if (Array.isArray(window.panelManager.panels)) {
                window.panelManager.panels.forEach((p) => {
                    const dm = p && p.chartInstance && p.chartInstance.drawingManager;
                    if (dm) allDms.push(dm);
                });
            }
            allDms.forEach((dm) => {
                if (!dm || dm === this) return;
                if (dm.currentTool) dm.clearTool(true);
            });
        }
    }

    _nextLiveSyncId() {
        return `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    _isLiveSyncId(id) {
        return typeof id === 'string' && id.startsWith('live_');
    }

    _ensureDrawingId(drawing) {
        if (!drawing) return null;
        if (!drawing.id) {
            drawing.id = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }
        return drawing.id;
    }

    /**
     * True when cross-panel drawing sync is active (legacy panelManager OR
     * multichart iframe grid via sync-bridge). Live edit/move broadcasts were
     * gated only on panelManager, so multichart showed new shapes on peers
     * (finalize add has no gate) but not drag/resize updates.
     */
    _isCrossPanelDrawingSyncEnabled() {
        if (!this.chart || typeof this.chart.broadcastDrawingChange !== 'function') return false;
        if (window.panelManager && window.panelManager.syncSettings && window.panelManager.syncSettings.drawings) {
            return window.panelManager.currentLayout !== '1';
        }
        if (typeof window !== 'undefined') {
            if (window.__multichartHostBridge || window.__multichartBridge) return true;
            const grid = window.__multichartGrid;
            if (grid && grid.syncMode && grid.syncMode.drawings !== false) return true;
            if (document.documentElement && document.documentElement.classList.contains('multichart-embed')) {
                return !!window.__multichartBridge;
            }
        }
        return false;
    }

    _syncLivePreviewDrawing(tempDrawing) {
        if (!tempDrawing || !this.chart || !this.chart.broadcastDrawingChange) return;
        if (!this._isCrossPanelDrawingSyncEnabled()) return;

        if (!this._liveSyncDrawingId) this._liveSyncDrawingId = this._nextLiveSyncId();
        tempDrawing.id = this._liveSyncDrawingId;

        const payload = this._serializeDrawingForStorage(tempDrawing);
        payload.id = this._liveSyncDrawingId;

        this.chart.broadcastDrawingChange(this._liveSyncBroadcasted ? 'update' : 'add', payload);
        this._liveSyncBroadcasted = true;
    }

    _clearLiveSyncPreview() {
        if (!this._liveSyncDrawingId) {
            this._liveSyncBroadcasted = false;
            return;
        }
        if (this._liveSyncBroadcasted && this.chart && this.chart.broadcastDrawingChange) {
            this.chart.broadcastDrawingChange('remove', { id: this._liveSyncDrawingId });
        }
        this._liveSyncDrawingId = null;
        this._liveSyncBroadcasted = false;
    }

    _isCurveLikePlacementTool(type) {
        return type === 'curve' || type === 'arc';
    }

    _captureCurvePlacementFromPreview(tempDrawing) {
        if (!tempDrawing || !Array.isArray(tempDrawing.points) || tempDrawing.points.length < 3) {
            return;
        }
        this._lastCurvePlacementPoints = tempDrawing.points.map((p) => ({ x: p.x, y: p.y }));
    }

    /** Merge final click endpoints with control point from the last live preview render. */
    _mergeCurvePlacementEndpoints(endpoints) {
        if (!Array.isArray(endpoints) || endpoints.length < 2) return endpoints;
        const bent = this._lastCurvePlacementPoints;
        if (!Array.isArray(bent) || bent.length < 3) return endpoints.map((p) => ({ ...p }));
        return [
            { ...endpoints[0] },
            { ...bent[1] },
            { ...endpoints[endpoints.length - 1] }
        ];
    }

    _clearCurvePlacementCache() {
        this._lastCurvePlacementPoints = null;
    }

    _parseGroupTranslate(transform) {
        if (!transform) return { x: 0, y: 0 };
        const m = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (!m) return { x: 0, y: 0 };
        return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
    }

    _usesPointScreenAnchor(drawingType) {
        return drawingType === 'image' || drawingType === 'emoji';
    }

    /** Sync drag translate on main group (+ optional unclipped labels layer). Axis price/time chips stay on the scales — never CSS-translate them with the shape. */
    _applyDrawingDragTransform(drawing, transform) {
        if (!drawing) return;
        const t = transform || null;
        if (drawing.group) {
            drawing.group.attr('transform', t);
        }
        if (drawing.axisHighlightGroup && !drawing.axisHighlightGroup.empty()) {
            drawing.axisHighlightGroup.attr('transform', null);
        }
        if (this.labelsGroup && !this.labelsGroup.empty() && drawing.id) {
            const layer = this.labelsGroup.select(`[data-id="${drawing.id}"]`);
            if (!layer.empty()) {
                layer.attr('transform', t);
            }
        }
    }

    /** Repaint axis price/time labels at scale edges for preview point positions while dragging. */
    _refreshAxisHighlightsDuringDrag(drawing, previewPoints) {
        if (!drawing || typeof drawing.showAxisHighlights !== 'function') return;
        if (!drawing.selected) return;
        if (!Array.isArray(previewPoints) || previewPoints.length === 0) return;
        if (drawing.axisHighlightGroup && !drawing.axisHighlightGroup.empty()) {
            drawing.axisHighlightGroup.attr('transform', null);
        }
        try {
            drawing.showAxisHighlights({ live: true, pointsOverride: previewPoints });
        } catch (_) { /* ignore */ }
    }

    _scheduleAxisHighlightsDuringDrag(drawing, previewPoints) {
        if (!drawing) return;
        if (!this._axisHighlightDragPending) this._axisHighlightDragPending = new Map();
        if (!this._axisHighlightDragRaf) this._axisHighlightDragRaf = new Map();
        const key = String(drawing.id || drawing.type || 'drag');
        this._axisHighlightDragPending.set(key, { drawing, previewPoints });
        if (this._axisHighlightDragRaf.has(key)) return;
        const rafId = requestAnimationFrame(() => {
            this._axisHighlightDragRaf.delete(key);
            const pending = this._axisHighlightDragPending.get(key);
            if (!pending) return;
            this._refreshAxisHighlightsDuringDrag(pending.drawing, pending.previewPoints);
        });
        this._axisHighlightDragRaf.set(key, rafId);
    }

    /** Keep Y-axis endpoint labels in sync while resizing via blue handles. */
    _refreshAxisHighlightsDuringHandleEdit(drawing, pointsOverride) {
        if (!drawing || !drawing.selected) return;
        if (typeof drawing.showAxisHighlights !== 'function') return;
        const pts = Array.isArray(pointsOverride) ? pointsOverride : drawing.points;
        if (!Array.isArray(pts) || pts.length === 0) return;
        this._scheduleAxisHighlightsDuringDrag(drawing, pts);
    }

    _clearAxisHighlightDragState() {
        if (this._axisHighlightDragRaf) {
            this._axisHighlightDragRaf.forEach((rafId) => cancelAnimationFrame(rafId));
            this._axisHighlightDragRaf.clear();
        }
        if (this._axisHighlightDragPending) {
            this._axisHighlightDragPending.clear();
        }
    }

    /** Keep crosshair price/time labels glued to the pointer during whole-shape moves. */
    _refreshPointerChromeDuringGeometryDrag(event) {
        if (this.chart && typeof this.chart.updateCrosshair === 'function' && event) {
            this.chart.updateCrosshair(event);
        }
    }

    _clearDrawingDragTransform(drawing) {
        this._applyDrawingDragTransform(drawing, null);
    }

    /** Full geometry + handle rebuild after a committed whole-shape move (not live skipHandles path). */
    _renderDrawingAfterGeometryCommit(drawing) {
        if (!drawing) return;
        this.renderDrawing(drawing, { liveRender: false });
        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
            drawing.showAxisHighlights();
        }
        const om = this.chart?.orderManager;
        if (om && om._rrExecuteArmed && this._isRiskRewardPositionDrawing(drawing)
            && typeof om.syncOrderPanelFromSelectedRiskRewardTool === 'function') {
            om.syncOrderPanelFromSelectedRiskRewardTool();
        }
    }

    /**
     * Apply a pixel translate() on the SVG group back into drawing.points (single render at drag end).
     * @returns {boolean} true when points were updated
     */
    _drawingPointsChanged(startPoints, currentPoints) {
        if (!Array.isArray(startPoints) || !Array.isArray(currentPoints)) return false;
        if (startPoints.length !== currentPoints.length) return true;
        for (let i = 0; i < startPoints.length; i++) {
            const a = startPoints[i];
            const b = currentPoints[i];
            if (!a || !b) return true;
            if (a.x !== b.x || a.y !== b.y) return true;
        }
        return false;
    }

    _commitDrawingPointsIfChanged(drawing, startPoints) {
        if (!drawing || !Array.isArray(startPoints) || startPoints.length === 0) return false;
        if (!this._drawingPointsChanged(startPoints, drawing.points)) return false;
        this._clearDrawingDragTransform(drawing);
        this.clampDrawingPointsToCandleRange(drawing);
        this._syncHorizontalAnchorToolPointY(drawing);
        if (typeof drawing.afterPointsMoveDelta === 'function') {
            const p0 = startPoints[0];
            const c0 = drawing.points && drawing.points[0];
            if (p0 && c0 && !drawing.meta?._rrLiveDragExtrasSynced) {
                drawing.afterPointsMoveDelta(c0.x - p0.x, c0.y - p0.y);
            } else if (drawing.meta?._rrLiveDragExtrasSynced) {
                delete drawing.meta._rrLiveDragExtrasSynced;
            }
        }
        if (drawing.meta) drawing.meta.updatedAt = Date.now();
        return true;
    }

    _commitDrawingPixelDragDelta(drawing, startPoints, startTransform) {
        if (!drawing || !Array.isArray(startPoints) || startPoints.length === 0 || !drawing.group) {
            return false;
        }
        const transform = drawing.group.attr('transform');
        if (!transform) {
            return this._commitDrawingPointsIfChanged(drawing, startPoints);
        }

        const parsed = this._parseGroupTranslate(transform);
        const startTx = startTransform ? startTransform.x : 0;
        const startTy = startTransform ? startTransform.y : 0;
        const pixelDx = parsed.x - startTx;
        const pixelDy = parsed.y - startTy;

        if (pixelDx === 0 && pixelDy === 0) {
            return false;
        }

        drawing.group.attr('transform', null);
        this._clearDrawingDragTransform(drawing);

        const chart = this.chart;
        if (!chart || typeof chart.yScale !== 'function') return false;

        const scales = { xScale: chart.xScale, yScale: chart.yScale, chart };
        const p0 = startPoints[0];
        if (!p0) return false;

        const origScreenX = chart.dataIndexToPixel ? chart.dataIndexToPixel(p0.x) : scales.xScale(p0.x);
        const origScreenY = scales.yScale(p0.y);
        const dataX1 = chart.pixelToDataIndex ? chart.pixelToDataIndex(origScreenX) : scales.xScale.invert(origScreenX);
        const dataX2 = chart.pixelToDataIndex ? chart.pixelToDataIndex(origScreenX + pixelDx) : scales.xScale.invert(origScreenX + pixelDx);
        const dataY1 = scales.yScale.invert(origScreenY);
        const dataY2 = scales.yScale.invert(origScreenY + pixelDy);

        let dx = dataX2 - dataX1;
        let dy = dataY2 - dataY1;
        const constrained = this.getConstrainedDragDelta(drawing, dx, dy);
        dx = constrained.dx;
        dy = constrained.dy;

        drawing.points = startPoints.map((p) => this._normalizePointAfterPixelTranslate(
            { ...p, x: p.x + dx, y: p.y + dy },
            drawing.type
        ));
        if (typeof drawing.afterPointsMoveDelta === 'function') {
            if (!drawing.meta?._rrLiveDragExtrasSynced) {
                drawing.afterPointsMoveDelta(dx, dy);
            } else {
                delete drawing.meta._rrLiveDragExtrasSynced;
            }
        }
        this.clampDrawingPointsToCandleRange(drawing);
        this._syncHorizontalAnchorToolPointY(drawing);
        if (drawing.meta) drawing.meta.updatedAt = Date.now();
        return true;
    }

    _translatePointsByPixels(points, pixelDx, pixelDy, drawingType = null) {
        if (!Array.isArray(points) || !this.chart || !this.chart.yScale) return null;
        return points.map((pt) => {
            if (!pt) return pt;
            const baseX = Number(pt.x);
            const baseY = Number(pt.y);
            if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) return { ...pt };

            let pxX = Number.isFinite(pixelDx) ? pixelDx : 0;
            let pxY = Number.isFinite(pixelDy) ? pixelDy : 0;
            if (typeof this.chart.dataIndexToPixel === 'function') pxX += this.chart.dataIndexToPixel(baseX);
            else if (typeof this.chart.xScale === 'function') pxX += this.chart.xScale(baseX);
            if (typeof this.chart.yScale === 'function') pxY += this.chart.yScale(baseY);

            const x = (typeof this.chart.pixelToDataIndex === 'function')
                ? this.chart.pixelToDataIndex(pxX)
                : (this.chart.xScale && typeof this.chart.xScale.invert === 'function' ? this.chart.xScale.invert(pxX) : baseX);
            const y = (typeof this.chart.yScale.invert === 'function') ? this.chart.yScale.invert(pxY) : baseY;
            const out = { ...pt, x, y };
            return this._normalizePointAfterPixelTranslate(out, drawingType || this.currentTool);
        });
    }

    /** Throttled V9 Coordinates tab refresh while dragging/resizing (single- or multi-panel). */
    _notifyV9DrawingGeometryLive(drawing, pointsOverride = null) {
        if (!drawing || typeof window === 'undefined') return;
        const now = performance.now();
        if (this._lastV9GeomLiveNotify && (now - this._lastV9GeomLiveNotify) < 16) return;
        this._lastV9GeomLiveNotify = now;
        const points = Array.isArray(pointsOverride) ? pointsOverride : drawing.points;
        if (!Array.isArray(points) || points.length === 0) return;
        const id = drawing.id || this._ensureDrawingId(drawing);
        if (!id) return;
        try {
            window.dispatchEvent(new CustomEvent('v9DrawingGeometryLive', {
                detail: {
                    id,
                    type: drawing.type,
                    points: points.map((p) => (p ? { ...p } : p)),
                },
            }));
        } catch (_) { /* ignore */ }
    }

    _broadcastLiveEditUpdate(drawing, pointsOverride = null) {
        if (!drawing) return;
        this._notifyV9DrawingGeometryLive(drawing, pointsOverride);
        if (!this.chart || !this.chart.broadcastDrawingChange) return;
        if (!this._isCrossPanelDrawingSyncEnabled()) return;

        // Throttle: max ~60 fps for live edit broadcasts to keep UI responsive
        const now = performance.now();
        if (this._lastLiveEditBroadcast && (now - this._lastLiveEditBroadcast) < 16) return;
        this._lastLiveEditBroadcast = now;

        const ensuredId = this._ensureDrawingId(drawing);
        const payload = this._serializeDrawingForStorage(drawing);
        payload.id = drawing.id || payload.id || ensuredId;
        if (!payload.id) return;
        if (Array.isArray(pointsOverride)) payload.points = pointsOverride.map(p => ({ ...p }));
        this.chart.broadcastDrawingChange('update', payload);
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

        if (this._tryStartCtrlSelectionMove(event)) {
            return;
        }

        if (this.currentTool && this.isRectSelecting) {
            this.cancelRectangularSelection();
        }

        // First-click draw in multi-panel mode:
        // if this panel has no active tool yet, adopt the currently active tool
        // from main/selected chart and continue this same click as draw-start.
        if (!this.currentTool && window.panelManager && window.panelManager.currentLayout !== '1') {
            let inheritedTool = null;
            const mainDm = window.chart && window.chart.drawingManager;
            if (mainDm && mainDm.currentTool) inheritedTool = mainDm.currentTool;
            if (!inheritedTool && typeof window.panelManager.getSelectedPanel === 'function') {
                const sp = window.panelManager.getSelectedPanel();
                const sdm = sp && sp.chartInstance && sp.chartInstance.drawingManager;
                if (sdm && sdm.currentTool) inheritedTool = sdm.currentTool;
            }
            if (!inheritedTool && Array.isArray(window.panelManager.panels)) {
                for (const p of window.panelManager.panels) {
                    const dm = p && p.chartInstance && p.chartInstance.drawingManager;
                    if (dm && dm.currentTool) {
                        inheritedTool = dm.currentTool;
                        break;
                    }
                }
            }
            if (inheritedTool && typeof this.setTool === 'function') {
                this.setTool(inheritedTool, true);
            }
        }

        // Multi-panel UX: if user clicks another panel while a tool is active,
        // switch selection first, but continue this same click as draw-start.
        if (this.currentTool && window.panelManager && window.panelManager.currentLayout !== '1') {
            const chartPanelIndex = Number(this.chart && this.chart.panelIndex);
            const selectedPanelIndex = Number(window.panelManager.selectedPanelIndex);
            if (Number.isFinite(chartPanelIndex) && Number.isFinite(selectedPanelIndex) && chartPanelIndex !== selectedPanelIndex) {
                if (typeof window.panelManager.selectPanel === 'function') {
                    window.panelManager.selectPanel(chartPanelIndex);
                }
            }
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
        const allowActiveToolHandleBypass = this.currentTool === 'polyline' || this.currentTool === 'path'
            || this.currentTool === 'brush' || this.currentTool === 'highlighter';
        if (handleNode && !isVolumeProfileBoundaryHandle && (!this.currentTool || allowActiveToolHandleBypass)) {
            return;
        }
        
        // [debug removed]
        
        if (!this.currentTool) {
            // Same layout space as Chart (wrapper + __v9Zoom); raw SVG rect alone can mismatch selection vs hit-test.
            const [mouseX, mouseY] = this._eventCanvasLocalXY(event);

            const volumeProfilePanBlockDrawing = this.findVolumeProfilePanBlockDrawingAtPoint(mouseX, mouseY);
            if (volumeProfilePanBlockDrawing && this.isVolumeProfileChartPanBlockedAtPoint(mouseX, mouseY)) {
                if (!volumeProfilePanBlockDrawing.locked) {
                    this.selectDrawing(volumeProfilePanBlockDrawing, false);
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            const levelLineDrawingForClick = (() => {
                if (isVolumeProfileLevelLineTarget && levelLineNode) {
                    const g = levelLineNode.closest('.drawing');
                    const id = g ? d3.select(g).attr('data-id') : null;
                    return id ? this.drawings.find((d) => d && d.id === id) : null;
                }
                for (let i = this.drawings.length - 1; i >= 0; i--) {
                    const d = this.drawings[i];
                    if (d && this.isCandleBoundTool(d.type) && this.isVolumeProfileLevelLineHit(d, mouseX, mouseY)) {
                        return d;
                    }
                }
                return null;
            })();
            if (levelLineDrawingForClick && !levelLineDrawingForClick.locked && !event.shiftKey && !event.altKey) {
                const now = Date.now();
                const prev = this._volumeProfileLevelLineClickState || null;
                const isFollowupLevelLineClick = !!(
                    prev
                    && prev.drawingId === levelLineDrawingForClick.id
                    && (now - prev.time) <= 700
                    && Math.abs((prev.mouseX ?? 0) - mouseX) <= 24
                    && Math.abs((prev.mouseY ?? 0) - mouseY) <= 24
                );
                if (isFollowupLevelLineClick || event.detail >= 2) {
                    this._volumeProfileLevelLineClickState = null;
                    this.selectDrawing(levelLineDrawingForClick, false);
                    this.editDrawing(levelLineDrawingForClick, event.pageX, event.pageY);
                    this._suppressNextDrawingDblClickUntil = Date.now() + 600;
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                this._volumeProfileLevelLineClickState = {
                    drawingId: levelLineDrawingForClick.id,
                    time: now,
                    mouseX,
                    mouseY
                };
                this.selectDrawing(levelLineDrawingForClick, false);
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (event.detail >= 2) {
                const dblClickTarget = (event && event.target) ? event.target : null;
                const skipGenericDblSettings = this._isTextAnnotationInlineEditTarget(dblClickTarget);
                if (!skipGenericDblSettings) {
                    const domDrawing = this._resolveDrawingFromDomTarget(dblClickTarget);
                    const skipTextChromeSettings = domDrawing
                        && this._isTextDrawingType(domDrawing.type)
                        && this._isTextAnnotationInteractionTarget(dblClickTarget);
                    if (domDrawing && !domDrawing.locked && !skipTextChromeSettings) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }
                        this.selectDrawing(domDrawing, false);
                        this.editDrawing(domDrawing, event.pageX, event.pageY);
                        this._suppressNextDrawingDblClickUntil = Date.now() + 600;
                        return;
                    }
                }
            }
            
            // Check for stacked lines (more than 3 lines at this point)
            const stackedLinesInfo = this.findStackedLines(mouseX, mouseY, 3);
            if (stackedLinesInfo.isStacked) {
                // [debug removed]
                // Store stacked lines info for potential UI display or selection
                this.lastStackedLines = stackedLinesInfo;
            }
            
            // Find all drawings at this point using geometric hit test
            let drawingsAtPoint = this.findDrawingsAtPoint(mouseX, mouseY, { includeVolumeProfileBodyHit: true });
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
                    type === 'pitchfan' ||
                    type === 'gann-box' ||
                    type === 'gann-square-fixed' ||
                    type === 'gann-fan'
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
                const deferRRBest = best && (best.type === 'long-position' || best.type === 'short-position')
                    && this._findRiskRewardInteractiveHandleRole(best, mouseX, mouseY);
                if (best && !best.locked && !shouldBlockVolumeProfileTextDirectMove && !deferRRBest) {
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
            if (this.selectedDrawings && this.selectedDrawings.length > 0) {
                const selectedAtPoint = this._getSelectedDrawingsAtPoint(mouseX, mouseY);
                const hasSelectedVolumeProfileAtPoint = selectedAtPoint.some(d => this.isVolumeProfileToolType(d.type));
                const shouldBlockSelectedVolumeProfileTextDirectMove = (isVolumeProfileLevelLineTarget || isVolumeProfileValuesLabelTarget)
                    && hasSelectedVolumeProfileAtPoint;
                const deferRRSelected = selectedAtPoint.some((d) =>
                    (d.type === 'long-position' || d.type === 'short-position')
                    && this._findRiskRewardInteractiveHandleRole(d, mouseX, mouseY)
                );
                const toMove = (this.selectedDrawings || []).filter((d) =>
                    d && !d.locked && !this._isHorizontalAnchorToolType(d.type)
                );
                if (selectedAtPoint.length > 0 && toMove.length > 0 && !event.shiftKey && !shouldBlockSelectedVolumeProfileTextDirectMove && !deferRRSelected) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._startDirectMoveDrag(toMove, event);
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
            
            const clickTargetNode = target.node();
            const resizeHandleNode = clickTargetNode && clickTargetNode.closest
                ? clickTargetNode.closest('.resize-handle, .resize-handle-hit, .resize-handle-group')
                : null;
            const customHandleNode = clickTargetNode && clickTargetNode.closest
                ? clickTargetNode.closest('.custom-handle')
                : null;

            // Fallback for volume-profile labels/boundaries/levels when geometric hit-testing misses
            // (notably anchored profiles where only edge/label clicks should select).
            if (!drawing && clickTargetNode && clickTargetNode.closest) {
                const volumeProfileHitNode = clickTargetNode.closest('.volume-profile-values-label, .volume-profile-boundary, .volume-profile-boundary-hit, .volume-profile-level-line, .volume-profile-hitbox, .volume-profile-range');
                const domDrawingGroup = clickTargetNode.closest('.drawing');
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
                const handleDrawingGroup = clickTargetNode && clickTargetNode.closest
                    ? clickTargetNode.closest('.drawing')
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

            // RR + buttons are outside the zone geometry — findDrawingsAtPoint misses them; without this
            // mousedown falls through to "empty space" and deselects the tool before the click runs.
            const rrPlusBtnNode = clickTargetNode && clickTargetNode.closest
                ? clickTargetNode.closest('.rr-plus-btn')
                : null;
            if (!drawing && rrPlusBtnNode) {
                const plusDrawingGroup = clickTargetNode.closest('.drawing');
                if (plusDrawingGroup) {
                    const plusDrawingId = d3.select(plusDrawingGroup).attr('data-id');
                    const plusDrawing = this.drawings.find(d => d && d.id === plusDrawingId);
                    if (plusDrawing) {
                        drawing = plusDrawing;
                        drawingGroup = plusDrawingGroup;
                    }
                }
            }

            if (!drawing) {
                const domDrawing = this._resolveDrawingFromDomTarget(clickTargetNode);
                if (domDrawing) {
                    drawing = domDrawing;
                    if (clickTargetNode && clickTargetNode.closest) {
                        const g = clickTargetNode.closest('.drawing');
                        if (g) drawingGroup = g;
                    }
                }
            }

            if (drawing) {
                // Let + buttons handle activation on pointerdown/mousedown (click can be suppressed).
                if (clickTargetNode && clickTargetNode.closest && clickTargetNode.closest('.rr-plus-btn')) {
                    event.stopPropagation();
                    return;
                }


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

                let rrSyntheticHandle = null;
                if (!resizeHandleNode && !customHandleNode) {
                    const candidates = [];
                    if (drawing.type === 'long-position' || drawing.type === 'short-position') candidates.push(drawing);
                    if (Array.isArray(this.selectedDrawings)) {
                        this.selectedDrawings.forEach((d) => {
                            if (d && (d.type === 'long-position' || d.type === 'short-position')) candidates.push(d);
                        });
                    }
                    for (let i = 0; i < candidates.length; i++) {
                        const d = candidates[i];
                        if (!d || !drawingsAtPoint.includes(d)) continue;
                        const role = this._findRiskRewardInteractiveHandleRole(d, mouseX, mouseY);
                        if (role) {
                            rrSyntheticHandle = { drawing: d, role };
                            break;
                        }
                    }
                }

                if (rrSyntheticHandle) {
                    const rrD = rrSyntheticHandle.drawing;
                    const rrRole = rrSyntheticHandle.role;
                    event.preventDefault();
                    event.stopPropagation();
                    if (!rrD.selected
                        || (this.selectedDrawings.length !== 1 || this.selectedDrawings[0] !== rrD)) {
                        this.deselectAll({ forSelectionChange: true });
                        rrD.select();
                        this.selectedDrawing = rrD;
                        this.selectedDrawings = [rrD];
                    }
                    stopDirectResizeListeners();
                    this.startCustomHandleDrag(rrD, rrRole, { sourceEvent: event });
                    this._directResizeMoveHandler = (e) => {
                        if (this.chart && typeof this.chart.updateCrosshair === 'function') this.chart.updateCrosshair(e);
                        this.handleCustomHandleDrag({ sourceEvent: e });
                    };
                    this._directResizeUpHandler = (e) => {
                        stopDirectResizeListeners();
                        this.endCustomHandleDrag({ sourceEvent: e });
                    };
                    document.addEventListener('mousemove', this._directResizeMoveHandler, true);
                    document.addEventListener('mouseup', this._directResizeUpHandler, true);
                    return;
                }

                if (resizeHandleNode || customHandleNode) {
                    event.preventDefault();
                    event.stopPropagation();

                    if (!drawing.selected || (this.selectedDrawings.length !== 1 || this.selectedDrawings[0] !== drawing)) {
                        this.deselectAll({ forSelectionChange: true });
                        drawing.select({ skipAxisHighlights: true });
                        this.selectedDrawing = drawing;
                        this.selectedDrawings = [drawing];
                    }

                    stopDirectResizeListeners();

                    if (customHandleNode) {
                        const role = customHandleNode.getAttribute('data-handle-role');
                        const idxAttr = customHandleNode.getAttribute('data-point-index');
                        const idx = idxAttr != null ? parseInt(idxAttr, 10) : NaN;
                        this.startCustomHandleDrag(
                            drawing,
                            role || (Number.isFinite(idx) ? idx : null),
                            { sourceEvent: event },
                            Number.isFinite(idx) ? idx : undefined,
                        );

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
                            this._customHandlePointerSource = 'document';
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
                            this._customHandlePointerSource = 'document';
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
                            this._resizePointerSource = 'document';
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
                // Clicked on empty space - deselect on mousedown (one click; do not wait for click after pan)
                this._tryDeselectOnBackgroundPointer(event, mouseX, mouseY);
                // Ensure SVG is transparent so canvas can receive panning events
                this.svg.style('pointer-events', 'none');
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
            this._liveSyncDrawingId = this._nextLiveSyncId();
            this._liveSyncBroadcasted = false;
            
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

            this._applyPlacementModePointerEvents();
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
            if (this._isCurveLikePlacementTool(this.currentTool)) {
                this.updateTempDrawing(this.drawingState.tempPoints);
            }
            if (this.currentTool === 'image' || this.currentTool === 'emoji') {
                if (event) {
                    event.preventDefault();
                    if (typeof event.stopPropagation === 'function') event.stopPropagation();
                }
                this.suppressNextCanvasBackgroundClick(500);
            }
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

    /** Anchor index for Shift angle-snap while resizing (adjacent point, not always 0/1). */
    _shiftAngleAnchorIndex(drawing, pointIndex) {
        const len = drawing?.points?.length || 0;
        if (len < 2 || pointIndex == null || isNaN(pointIndex)) return null;
        if (len === 2) return pointIndex === 0 ? 1 : 0;
        if (pointIndex === 0) return 1;
        if (pointIndex === len - 1) return len - 2;
        return pointIndex - 1;
    }

    /** Bar-index anchors at handle drag-start (undo state uses timestamp JSON without x/y). */
    _captureShiftResizeAnchorPoints(drawing) {
        if (!drawing || !Array.isArray(drawing.points)) {
            this._shiftResizeAnchorPoints = null;
            return;
        }
        this._shiftResizeAnchorPoints = drawing.points.map((p) => (
            p && Number.isFinite(p.x) && Number.isFinite(p.y)
                ? { x: p.x, y: p.y }
                : null
        ));
    }

    _clearShiftResizeAnchorPoints() {
        this._shiftResizeAnchorPoints = null;
    }

    /** Fixed anchor at resize drag-start (stable while the handle moves). */
    _shiftAngleAnchorPoint(drawing, pointIndex) {
        const anchorIndex = this._shiftAngleAnchorIndex(drawing, pointIndex);
        if (anchorIndex == null) return null;

        const snapPts = this._shiftResizeAnchorPoints;
        const snapped = snapPts && snapPts[anchorIndex];
        if (snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.y)) {
            return { x: snapped.x, y: snapped.y };
        }

        const live = drawing.points && drawing.points[anchorIndex];
        if (live && Number.isFinite(live.x) && Number.isFinite(live.y)) {
            return { x: live.x, y: live.y };
        }

        return null;
    }

    _applyShiftAngleConstraintForResize(drawing, pointIndex, point, shiftKey) {
        if (!shiftKey || !drawing || !this.angleSnapTools.includes(drawing.type)) return point;
        const anchor = this._shiftAngleAnchorPoint(drawing, pointIndex);
        if (!anchor) return point;
        return this.constrainToAngle(anchor, point);
    }

    /** Skip integer bar snap while Shift+angle editing so the handle can move freely along the ray. */
    _isBoxShiftSnapTool(toolType) {
        return !!(toolType && this.boxShiftSnapTools && this.boxShiftSnapTools.includes(toolType));
    }

    /** Skip integer bar snap while Shift constrains geometry (lines + box shapes). */
    _deferBarIndexSnapDuringShiftEdit(drawing, shiftKey) {
        if (!shiftKey || !drawing) return false;
        return this.angleSnapTools.includes(drawing.type)
            || this._isBoxShiftSnapTool(drawing.type);
    }

    /** Match first-draw smoothness: no per-frame bar rounding while dragging handles. */
    _shouldDeferBarIndexSnapForPointer(activeToolType, event) {
        if (!activeToolType || !event) return false;
        if (this._isLiveHandleEditing()) {
            if (this._shouldSnapPointXToCandle(activeToolType)) {
                return true;
            }
        }
        if (event.shiftKey
            && (this.angleSnapTools.includes(activeToolType)
                || this._isBoxShiftSnapTool(activeToolType))) {
            return true;
        }
        return false;
    }

    /** Shift + first corner while placing a 2-point box (rectangle / ellipse preview). */
    _constrainBoxPlacementPoint(toolType, anchor, point) {
        if (!anchor || !point || !this._isBoxShiftSnapTool(toolType)) return point;
        const ax = anchor.x;
        const ay = anchor.y;
        const dx = point.x - ax;
        const dy = point.y - ay;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        if (!Number.isFinite(size) || size === 0) return { ...point };
        return {
            x: ax + (dx >= 0 ? size : -size),
            y: ay + (dy >= 0 ? size : -size)
        };
    }

    /** Assign one resize-handle point (angle snap + optional bar snap). */
    _assignResizePoint(drawing, pointIndex, point, shiftKey, event = null) {
        if (!drawing || !Array.isArray(drawing.points) || !point) return;
        if (pointIndex === undefined || pointIndex === null || isNaN(pointIndex)) return;

        point = this._applyShiftAngleConstraintForResize(drawing, pointIndex, point, shiftKey);
        const pointerEvent = event || { shiftKey: !!shiftKey };
        if (this._shouldDeferBarIndexSnapForPointer(drawing.type, pointerEvent)) {
            point = this.clampPointToCandleRange(point, drawing.type);
        } else {
            point = this._snapPointXForDrawingType(point, drawing.type);
        }
        drawing.points[pointIndex] = point;
        if (drawing.meta) drawing.meta.updatedAt = Date.now();
        this._refreshLiveTimestampForPoint(drawing, pointIndex);
    }

    /** Keep timestamp anchors aligned during live drag so a stray sync does not jump back. */
    _refreshLiveTimestampForPoint(drawing, pointIndex) {
        if (!drawing || pointIndex == null || isNaN(pointIndex)) return;
        if (!Array.isArray(drawing.timestampPoints) || !drawing.timestampPoints[pointIndex]) return;
        if (!this.chart || !Array.isArray(this.chart.data) || this.chart.data.length === 0) return;
        const p = drawing.points && drawing.points[pointIndex];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        if (typeof CoordinateUtils === 'undefined' || typeof CoordinateUtils.indexToTimestamp !== 'function') {
            return;
        }
        try {
            const timeframe = this.chart.currentTimeframe || null;
            const ts = CoordinateUtils.indexToTimestamp(p.x, this.chart.data, timeframe);
            if (ts == null) return;
            drawing.timestampPoints[pointIndex].timestamp = ts;
            drawing.timestampPoints[pointIndex].price = p.y;
        } catch (_) { /* ignore */ }
    }

    /** Shift + move: lock translation to 0°/45°/90° (TradingView-style). */
    _constrainPixelDeltaToSnapAngles(pixelDx, pixelDy) {
        const dx = Number(pixelDx) || 0;
        const dy = Number(pixelDy) || 0;
        if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        return {
            dx: dist * Math.cos(snapAngle),
            dy: dist * Math.sin(snapAngle)
        };
    }

    /**
     * Commit a leftover CSS translate on the drawing group into data points before resize.
     * Prevents handles staying at the pre-move origin while the stroke was visually offset.
     */
    _commitStaleDrawingGroupTransform(drawing) {
        if (!drawing?.group) return;
        const transform = drawing.group.attr('transform');
        if (!transform) return;
        const startPts = Array.isArray(drawing.points)
            ? drawing.points.map((p) => ({ ...p }))
            : null;
        if (!startPts || !startPts.length) return;
        this._commitDrawingPixelDragDelta(drawing, startPts, { x: 0, y: 0 });
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
    /**
     * Re-run placement preview (and crosshair) at the last pointer position after a modifier
     * key changes (Ctrl magnet, Shift angle snap) without requiring mouse movement.
     */
    _refreshPlacementPreviewFromLastPointer(keyState = {}) {
        const active = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : null;
        if (active && active.drawingManager && active.drawingManager !== this) return;

        const isDrawing = !!(this.currentTool && this.drawingState && this.drawingState.isDrawing);
        const isEditing = !!(this.isResizing || this.isCustomHandleDragging || this.isCustomHandleDrag);
        if (!isDrawing && !isEditing) return;
        if (!this._lastMouseEvent) return;

        const last = this._lastMouseEvent;
        const fakeEvent = {
            clientX: last.clientX,
            clientY: last.clientY,
            shiftKey: keyState.shiftKey !== undefined ? !!keyState.shiftKey : !!last.shiftKey,
            ctrlKey: keyState.ctrlKey !== undefined ? !!keyState.ctrlKey : !!last.ctrlKey,
            altKey: last.altKey,
            metaKey: keyState.metaKey !== undefined ? !!keyState.metaKey : !!last.metaKey,
            buttons: last.buttons,
            button: last.button,
            target: last.target,
            currentTarget: last.currentTarget
        };
        if (this.isResizing && this.resizingDrawing) {
            this._applyLiveResizeFromPointerEvent(fakeEvent);
            return;
        }
        if (this._runLiveHandleDragFromPointerEvent(fakeEvent, { force: true })) return;
        this.handleMouseMove(fakeEvent);
    }

    /**
     * Point-handle resize (trendline, ray, …) from pointer or Shift/Ctrl refresh.
     */
    _applyLiveResizeFromPointerEvent(event) {
        if (!this.isResizing || !this.resizingDrawing) return;
        const src = event && (event.sourceEvent || event);
        if (src) this._lastMouseEvent = src;
        if (event && event.buttons !== undefined && event.buttons === 0) {
            this.endHandleDrag(this.resizingDrawing);
            return;
        }
        const resizeDrawing = this.resizingDrawing;
        let currentPoint = this.getDataPoint(event, resizeDrawing.type);
        let handledByDrawing = false;
        if (typeof resizeDrawing.onPointHandleDrag === 'function') {
            currentPoint = this._applyShiftAngleConstraintForResize(
                resizeDrawing,
                this.resizingPointIndex,
                currentPoint,
                event.shiftKey
            );
            handledByDrawing = resizeDrawing.onPointHandleDrag(this.resizingPointIndex, {
                point: currentPoint,
                scales: {
                    xScale: this.chart.xScale,
                    yScale: this.chart.yScale,
                    chart: this.chart
                }
            }) === true;
        }
        if (!handledByDrawing) {
            this._assignResizePoint(
                resizeDrawing,
                this.resizingPointIndex,
                currentPoint,
                event.shiftKey,
                event
            );
        }
        this._syncHorizontalAnchorToolPointY(resizeDrawing);

        const scales = {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale,
            chart: this.chart
        };
        if (this._supportsLiveHandleGeometryPatch(resizeDrawing)
            && typeof resizeDrawing.patchLiveHandleResize === 'function'
            && resizeDrawing.patchLiveHandleResize(scales, this.resizingPointIndex)) {
            this._refreshAxisHighlightsDuringHandleEdit(resizeDrawing);
        } else {
            // Path, polyline, curve, etc.: full live re-render each frame (f619ece pattern).
            this._skipHandleSetup = true;
            const renderOpts = this._needsFullRenderDuringHandleEdit(resizeDrawing)
                ? this._getFullHandleEditRenderOpts(resizeDrawing)
                : { skipInteraction: true, liveRender: true, skipTimestampSync: true };
            this.renderDrawing(resizeDrawing, renderOpts);
            this._skipHandleSetup = false;
            this._refreshAxisHighlightsDuringHandleEdit(resizeDrawing);
        }
        this._broadcastLiveEditUpdate(resizeDrawing);
    }

    /**
     * Apply custom-handle resize from a pointer event (svg mousemove, Shift/Ctrl refresh, document drag).
     * @returns {boolean} true when the event was consumed
     */
    _runLiveHandleDragFromPointerEvent(event, options = {}) {
        if (!this.isCustomHandleDrag || !this.customHandleDrawing) return false;
        if (!options.force && this._customHandlePointerSource === 'd3') return false;
        const src = event && (event.sourceEvent || event);
        if (src) this._lastMouseEvent = src;
        if (event && event.buttons !== undefined && event.buttons === 0) {
            this.endCustomHandleDrag(event);
            return true;
        }
        this.handleCustomHandleDrag(event);
        return true;
    }

    handleMouseMove(event) {
        // Track last pointer for modifier-key preview refresh (Ctrl magnet, Shift snap)
        if ((this.currentTool && this.drawingState && this.drawingState.isDrawing)
            || this.isResizing || this.isCustomHandleDragging || this.isCustomHandleDrag) {
            this._lastMouseEvent = event;
        }

        // Always keep crosshair visible when a tool is active, drawing is selected, or dragging
        if (this.chart && typeof this.chart.updateCrosshair === 'function' &&
            (this.currentTool || this.selectedDrawing || this.isDragging || this.isDrawing
                || this.isResizing || this.isCustomHandleDrag)) {
            this.chart.updateCrosshair(event);
        }

        if (this.currentTool && this.isRectSelecting) {
            this.cancelRectangularSelection();
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
        
        // Handle dragging - CSS transform during move; commit points on mouseup.
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
            const [currentScreenX, currentScreenY] = this._eventCanvasLocalXY(event);
            
            // Calculate pixel delta
            let pixelDx = currentScreenX - this.dragStartScreen.x;
            let pixelDy = currentScreenY - this.dragStartScreen.y;
            if (event.shiftKey && this.draggingDrawing && this.angleSnapTools.includes(this.draggingDrawing.type)) {
                const snapped = this._constrainPixelDeltaToSnapAngles(pixelDx, pixelDy);
                pixelDx = snapped.dx;
                pixelDy = snapped.dy;
            }
            
            if (this.draggingMultiple && this.multiDragStartPositions) {
                this.multiDragStartPositions.forEach(({ drawing, points }) => {
                    if (!drawing || !Array.isArray(points)) return;
                    this._applyLiveDrawingMovePixels(drawing, points, pixelDx, pixelDy);
                    const previewPoints = this._translatePointsByPixels(points, pixelDx, pixelDy, drawing.type);
                    if (previewPoints) {
                        this._scheduleAxisHighlightsDuringDrag(drawing, previewPoints);
                        this._broadcastLiveEditUpdate(drawing, previewPoints);
                    }
                });
            } else if (this.draggingDrawing && Array.isArray(this.singleDragStartPoints)) {
                this._applyLiveDrawingMovePixels(
                    this.draggingDrawing,
                    this.singleDragStartPoints,
                    pixelDx,
                    pixelDy
                );
                const previewPoints = this._translatePointsByPixels(
                    this.singleDragStartPoints,
                    pixelDx,
                    pixelDy,
                    this.draggingDrawing.type
                );
                if (previewPoints) {
                    this._scheduleAxisHighlightsDuringDrag(this.draggingDrawing, previewPoints);
                    this._broadcastLiveEditUpdate(this.draggingDrawing, previewPoints);
                }
            }
            this._refreshPointerChromeDuringGeometryDrag(event);
            return;
        }

        // Box shapes (rectangle, ellipse, …) use isCustomHandleDrag — not legacy isCustomHandleDragging
        if (this._runLiveHandleDragFromPointerEvent(event)) {
            return;
        }
        
        // Handle resizing — d3 owns pointer moves; document listeners + modifier refresh use _applyLiveResizeFromPointerEvent
        if (this.isResizing && this.resizingDrawing) {
            if (event.buttons !== undefined && event.buttons === 0) {
                this.endHandleDrag(this.resizingDrawing);
                return;
            }
            if (this._resizePointerSource !== 'document') {
                return;
            }
            this._applyLiveResizeFromPointerEvent(event);
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
            const [screenX, screenY] = this._eventCanvasLocalXY(event);
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
                    this._broadcastLiveEditUpdate(this.customHandleDraggingDrawing);
                }
            }
            return;
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

        if (event.shiftKey && this.drawingState.tempPoints.length > 0 && this._isBoxShiftSnapTool(this.currentTool)) {
            point = this._constrainBoxPlacementPoint(
                this.currentTool,
                this.drawingState.tempPoints[0],
                point
            );
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
                    if (this._isCurveLikePlacementTool(this.currentTool)) {
                        this.updateTempDrawing(this.drawingState.tempPoints);
                    }
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
        if (this.isCustomHandleDrag && this.customHandleDrawing) {
            this.endCustomHandleDrag(event);
        } else if (this.isResizing && this.resizingDrawing) {
            this.endHandleDrag(this.resizingDrawing);
        }
    }

    /**
     * Handle context menu (right-click)
     */
    handleContextMenu(event) {
        // macOS: Ctrl+primary-click fires a synthetic contextmenu (secondary click).
        // User holds Ctrl for magnet while placing lines; do not open menus or run cleanup.
        if (this.currentTool && event.button === 0 && event.ctrlKey) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            return;
        }

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
            this.clearTool();
            document.querySelectorAll('.tool-btn:not(#keepDrawingMode):not(#magnetMode)').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tool-group-btn:not(#magnetMode):not(#magnetModeToolbar):not(#cursorTool)').forEach(b => b.classList.remove('active'));
            const cursorBtn = document.getElementById('cursorTool');
            if (cursorBtn) cursorBtn.classList.add('active');

            if (typeof window !== 'undefined' && typeof window.syncMagnetButton === 'function') {
                window.syncMagnetButton();
            }
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('v9DrawingToolCleared'));
                }
            } catch (_) {}
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
                // Deselect drawing first (TradingView style), then show context menu
                if (this.selectedDrawings.includes(drawing)) {
                    this.deselectAll();
                }
                this.showContextMenu(drawing, event.pageX, event.pageY);
            }
        } else {
            // Right-click on empty canvas: deselect all selected drawings then show chart menu
            if (this.selectedDrawings.length > 0) {
                this.deselectAll({ fromCanvasBackground: true });
            }
            if (this.chart && typeof this.chart.showChartContextMenu === 'function') {
                this.chart.showChartContextMenu(event.clientX, event.clientY, event.offsetX, event.offsetY);
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
            if (event.ctrlKey && !this.currentTool && !this._isDrawingGeometryMoveActive()) {
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
            if (this.isRectSelecting) {
                this.cancelRectangularSelection();
                return;
            }
            if (this.drawingState.isDrawing) {
                this.cancelDrawing();
            } else {
                this.deselectAll();
                this.clearTool();
            }
        }

        const mod = event.ctrlKey || event.metaKey;
        if (mod && this._isDrawingShortcutTarget(event)) {
            const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
            if (key === 'c' && !event.shiftKey && !event.altKey) {
                const drawing = this._getPrimarySelectedDrawingForClipboard();
                if (drawing && !drawing.locked) {
                    event.preventDefault();
                    this.copyDrawing(drawing);
                    try {
                        if (this.chart && typeof this.chart.showNotification === 'function') {
                            this.chart.showNotification('Drawing copied ✓');
                        }
                    } catch (_) { /* ignore */ }
                }
                return;
            }
            if (key === 'v' && !event.shiftKey && !event.altKey) {
                if (this.clipboardDrawing) {
                    event.preventDefault();
                    const pasted = this.pasteDrawing();
                    if (pasted) {
                        try {
                            if (this.chart && typeof this.chart.showNotification === 'function') {
                                this.chart.showNotification('Drawing pasted ✓');
                            }
                        } catch (_) { /* ignore */ }
                    }
                }
                return;
            }
        }
        
        if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Shift') {
            this._refreshPlacementPreviewFromLastPointer({
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey
            });
            if (this.chart && typeof this.chart.refreshCrosshairFromLastPointer === 'function') {
                this.chart.refreshCrosshairFromLastPointer({
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    shiftKey: event.shiftKey
                });
            }
        }

        // Ctrl+Z - Undo (future feature)
        // Ctrl+Y - Redo (future feature)
    }

    /**
     * Handle key up events
     */
    handleKeyUp(event) {
        if (event.key === 'Meta' || event.key === 'Control') {
            this.magnetKeyHeld = false;
            this.ctrlSelectMode = false;
        }

        if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Shift') {
            this._refreshPlacementPreviewFromLastPointer({
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey
            });
            if (this.chart && typeof this.chart.refreshCrosshairFromLastPointer === 'function') {
                this.chart.refreshCrosshairFromLastPointer({
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    shiftKey: event.shiftKey
                });
            }
        }
    }

    /**
     * Canvas-local CSS pixels (same as Chart.updateCrosshair). Prefer over d3.pointer(..., svg).
     */
    _eventCanvasLocalXY(event) {
        const unwrap = (ev) => (ev && ev.sourceEvent) ? ev.sourceEvent : ev;
        const raw = unwrap(event);
        if (this.chart && typeof this.chart._eventCanvasLocalXY === 'function' && raw) {
            return this.chart._eventCanvasLocalXY(raw);
        }
        const canvas = this.chart && this.chart.canvas;
        const fallback = () => {
            try {
                return d3.pointer(raw || event, this.svg.node());
            } catch (_) {
                return [0, 0];
            }
        };
        if (!canvas || !raw) return fallback();

        let cx = raw.clientX;
        let cy = raw.clientY;
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
            const t = (raw.touches && raw.touches[0]) || (raw.changedTouches && raw.changedTouches[0]);
            if (t) {
                cx = t.clientX;
                cy = t.clientY;
            }
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return fallback();

        const rect = (this.chart && typeof this.chart._pointerLayoutRect === 'function')
            ? this.chart._pointerLayoutRect()
            : (canvas.parentElement || canvas).getBoundingClientRect();
        const z = (this.chart && typeof this.chart._v9LayoutZoom === 'function')
            ? this.chart._v9LayoutZoom()
            : 1;
        return [(cx - rect.left) / z, (cy - rect.top) / z];
    }

    /** Layout-space XY from viewport client coords (matches `_eventCanvasLocalXY`; use for hit-testing when only x/y are available). */
    _clientXYToLayoutXY(clientX, clientY) {
        return this._eventCanvasLocalXY({ clientX, clientY });
    }

    /**
     * Resolve a drawing from a DOM click target (.drawing or axis highlight pill).
     * @param {Element|null} rawTargetNode
     * @returns {Object|null}
     */
    _resolveDrawingFromDomTarget(rawTargetNode) {
        if (!rawTargetNode || !rawTargetNode.closest) return null;

        const drawingGroup = rawTargetNode.closest('.drawing');
        if (drawingGroup) {
            const drawingId = d3.select(drawingGroup).attr('data-id');
            if (drawingId) {
                const drawing = this.drawings.find((d) => d && d.id === drawingId);
                if (drawing) return drawing;
            }
        }

        const axisNode = rawTargetNode.closest(
            '.axis-highlight-group, .axis-highlight-time, .axis-highlight-time-text, ' +
            '.axis-highlight-time-start, .axis-highlight-time-start-text, ' +
            '.axis-highlight-time-end, .axis-highlight-time-end-text, ' +
            '.axis-highlight-price, .axis-highlight-price-text'
        );
        if (!axisNode) return null;

        const axisGroup = axisNode.closest('.axis-highlight-group') || axisNode;
        const axisDrawingId = axisGroup.getAttribute && axisGroup.getAttribute('data-drawing-id');
        if (!axisDrawingId) return null;
        return this.drawings.find((d) => d && d.id === axisDrawingId) || null;
    }

    /**
     * Point-based stroke distance for simple line tools (works without live SVG nodes).
     * @returns {{ distance: number, tolerance: number }|null}
     */
    _distanceToLineDrawingStroke(drawing, mouseX, mouseY) {
        if (!drawing || !this.chart) return null;
        const type = drawing.type;
        const points = drawing.points;
        if (!Array.isArray(points) || points.length === 0) return null;

        const xScale = this.chart.xScale;
        const yScale = this.chart.yScale;
        if (!xScale || !yScale) return null;

        const toPx = (p) => {
            if (!p) return [NaN, NaN];
            const px = this.chart.dataIndexToPixel
                ? this.chart.dataIndexToPixel(p.x)
                : xScale(p.x);
            const py = yScale(p.y);
            return [px, py];
        };

        const strokeW = Number(drawing.style && drawing.style.strokeWidth) || 2;
        const baseTol = Math.max(12, Math.max(16, strokeW * 5));

        if (type === 'vertical' && points.length >= 1) {
            const [px] = toPx(points[0]);
            if (!Number.isFinite(px)) return null;
            return { distance: Math.abs(mouseX - px), tolerance: baseTol };
        }
        if (type === 'horizontal' && points.length >= 1) {
            const [, py] = toPx(points[0]);
            if (!Number.isFinite(py)) return null;
            return { distance: Math.abs(mouseY - py), tolerance: baseTol };
        }
        if (type === 'cross-line' && points.length >= 1) {
            const [px, py] = toPx(points[0]);
            if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
            return { distance: Math.min(Math.abs(mouseX - px), Math.abs(mouseY - py)), tolerance: baseTol };
        }
        if ((type === 'trendline' || type === 'ray' || type === 'horizontal-ray' || type === 'extended-line')
            && points.length >= 2) {
            const [x1, y1] = toPx(points[0]);
            const [x2, y2] = toPx(points[1]);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
            const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
            const tolerance = Math.max(10, (strokeW / 2) + 0.5);
            return { distance, tolerance };
        }
        return null;
    }

    /**
     * Get data point from mouse event
     * Returns {x: candleIndex, y: price}
     * For freehand tools (path, brush, highlighter), uses continuous coordinates for smooth curves
     */
    getDataPoint(event, toolTypeOverride = this.currentTool, options = {}) {
        let [screenX, screenY] = this._eventCanvasLocalXY(event);
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

        const allowsExtrabar = typeof CoordinateUtils !== 'undefined'
            && typeof CoordinateUtils.allowsExtrabarBarIndex === 'function'
            && CoordinateUtils.allowsExtrabarBarIndex(activeToolType);

        // Clamp to plot area (price pane). Shapes/lines/channels may use future bar padding.
        if (this.chart) {
            const m = this.chart.margin;
            const minX = m.l;
            const maxX = this.chart.w - m.r;
            const minY = typeof m.t === 'number' ? m.t : 0;
            const maxY = this.chart.h - m.b;
            const allowVerticalOverflow = allowsExtrabar
                || isInteractingWithExistingVolumeProfile
                || allowRangeVerticalOverflow;

            const allowHorizontalOverflow = allowsExtrabar
                || isResizingVolumeProfileRightBoundary;
            screenX = allowHorizontalOverflow
                ? Math.max(minX, screenX)
                : Math.max(minX, Math.min(maxX, screenX));
            screenY = allowVerticalOverflow
                ? screenY
                : Math.max(minY, Math.min(maxY, screenY));
        }
        const isFreehandStroke = activeToolType === 'path'
            || activeToolType === 'brush'
            || activeToolType === 'highlighter';
        const isContinuousTool = isFreehandStroke
            || this._usesPointScreenAnchor(activeToolType);
        
        // Pass chart instance for accurate index calculation
        // Use continuous mode for freehand tools to get smooth curves
        let point = CoordinateUtils.screenToData(screenX, screenY, {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale
        }, this.chart, isContinuousTool);
        
        // Ctrl/Meta strong magnet is disabled during whole-shape move; still works on resize handles.
        const suppressKeyMagnet = options.suppressKeyMagnet || this._isDrawingGeometryMoveActive();
        const keyHeld = !suppressKeyMagnet && event && (event.metaKey || event.ctrlKey);
        const effectiveMagnetMode = keyHeld ? 'strong' : this.magnetMode;
        
        // Only snap when cursor is within the loaded candle data range (no snap in empty/future area)
        const dataLen = this.chart && this.chart.data ? this.chart.data.length : 0;
        const isOverCandleData = dataLen > 0 && point.x >= 0 && point.x <= dataLen - 1;
        if (!isFreehandStroke && isOverCandleData && effectiveMagnetMode && effectiveMagnetMode !== 'off') {
            point = CoordinateUtils.snapToOHLC(
                point,
                this.chart.data,
                { xScale: this.chart.xScale, yScale: this.chart.yScale },
                effectiveMagnetMode
            );
        }

        point = this.clampPointToCandleRange(point, activeToolType);

        // Anchor X to whole bar indices for geometric tools (not freehand / text / pixel-anchored tools).
        // Defer during live handle edit + Shift so edit matches first-draw smoothness.
        if (!this._shouldDeferBarIndexSnapForPointer(activeToolType, event)
            && !isFreehandStroke
            && !this._isTextDrawingType(activeToolType)
            && !this._usesPointScreenAnchor(activeToolType)) {
            point = this.snapPointXToNearestCandle(point);
        }

        return point;
    }

    isVolumeProfileToolType(toolType) {
        return toolType === 'volume-profile'
            || toolType === 'fixed-range-volume-profile'
            || toolType === 'anchored-volume-profile';
    }

    isCandleBoundTool(toolType) {
        return toolType === 'volume-profile'
            || toolType === 'fixed-range-volume-profile'
            || toolType === 'anchored-vwap'
            || toolType === 'anchored-volume-profile';
    }

    _isHorizontalAnchorToolType(toolType) {
        return toolType === 'anchored-vwap' || toolType === 'anchored-volume-profile';
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

    /** Keep anchored VWAP / AVP anchor on a real candle close after drag or data shrink. */
    _syncHorizontalAnchorToolPointY(drawing) {
        if (!drawing || !this._isHorizontalAnchorToolType(drawing.type)) return;
        if (!Array.isArray(drawing.points) || !drawing.points[0]) return;
        const data = this.chart && Array.isArray(this.chart.data) ? this.chart.data : [];
        if (!data.length) return;
        const idx = Math.max(0, Math.min(data.length - 1, Math.round(drawing.points[0].x)));
        drawing.points[0].x = idx;
        const candle = data[idx];
        if (!candle) return;
        const close = Number(candle.c ?? candle.close);
        if (Number.isFinite(close)) {
            drawing.points[0].y = close;
        }
    }

    _isHorizontalAnchorElementTarget(toolType, targetEl) {
        if (!targetEl || !targetEl.closest) return false;
        if (toolType === 'anchored-vwap') {
            return !!targetEl.closest('.anchored-vwap-anchor, .anchored-vwap-anchor-hit');
        }
        if (toolType === 'anchored-volume-profile') {
            return !!targetEl.closest('.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"]');
        }
        return false;
    }

    _hideAnchoredVwapCurvesDuringMove(drawing) {
        if (!drawing || drawing.type !== 'anchored-vwap' || !drawing.group) return;
        drawing.group.selectAll('.anchored-vwap-curve, .anchored-vwap-band-fill, .anchored-vwap-line-markers, .anchored-vwap-line-point, .anchored-vwap-label')
            .remove();
        this._pruneAnchoredVwapMoveDom(drawing);
        if (typeof drawing.hideAxisHighlights === 'function') {
            drawing.hideAxisHighlights();
        }
    }

    _pruneAnchoredVwapMoveDom(drawing) {
        if (!drawing?.group) return;
        ['.anchored-vwap-anchor', '.anchored-vwap-anchor-hit', '.anchored-vwap-anchor-guide'].forEach((selector) => {
            const nodes = drawing.group.selectAll(selector).nodes();
            if (nodes.length > 1) {
                nodes.slice(1).forEach((node) => node.remove());
            }
        });
    }

    _syncAnchoredVwapAnchorDomDuringMove(drawing) {
        if (!drawing || drawing.type !== 'anchored-vwap' || !drawing.group || !this.chart) return false;
        const chart = this.chart;
        const anchor = Array.isArray(drawing.points) ? drawing.points[0] : null;
        const data = Array.isArray(chart.data) ? chart.data : [];
        if (!anchor || !data.length) return false;

        const anchorIndex = Math.max(0, Math.min(data.length - 1, Math.round(anchor.x)));
        anchor.x = anchorIndex;
        const candle = data[anchorIndex];
        if (candle) {
            const close = Number(candle.c ?? candle.close);
            if (Number.isFinite(close)) anchor.y = close;
        }

        const anchorX = typeof chart.dataIndexToPixel === 'function'
            ? chart.dataIndexToPixel(anchorIndex)
            : (chart.xScale ? chart.xScale(anchorIndex) : NaN);
        const anchorY = chart.yScale && Number.isFinite(anchor.y) ? chart.yScale(anchor.y) : NaN;
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return false;

        drawing.group.selectAll('.anchored-vwap-anchor, .anchored-vwap-anchor-hit')
            .attr('cx', anchorX)
            .attr('cy', anchorY);
        drawing.group.selectAll('.anchored-vwap-anchor-guide')
            .attr('x1', anchorX)
            .attr('x2', anchorX);
        this._pruneAnchoredVwapMoveDom(drawing);

        return true;
    }

    /** Snap anchored VWAP / AVP anchor to the bar under the pointer (live drag — no CSS transform). */
    _applyHorizontalAnchorPointFromEvent(drawing, sourceEvent, pointIndex = 0) {
        if (!drawing || !sourceEvent || !Array.isArray(drawing.points)) return false;
        let point = this.getDataPoint(sourceEvent, drawing.type);
        if (this._isHorizontalAnchorToolType(drawing.type)) {
            const [screenX] = this._eventCanvasLocalXY(sourceEvent);
            const chart = this.chart;
            if (chart && typeof chart.pixelToDataIndex === 'function') {
                let barIdx = Math.round(chart.pixelToDataIndex(screenX));
                const dataLen = chart.data ? chart.data.length : 0;
                if (dataLen > 0) {
                    barIdx = Math.max(0, Math.min(dataLen - 1, barIdx));
                }
                point = { ...point, x: barIdx };
            }
        }
        const context = {
            point,
            scales: {
                xScale: this.chart.xScale,
                yScale: this.chart.yScale,
                chart: this.chart
            }
        };
        let applied = false;
        if (typeof drawing.onPointHandleDrag === 'function') {
            applied = drawing.onPointHandleDrag(pointIndex, context) === true;
        }
        if (!applied) {
            drawing.points[pointIndex] = this._snapPointXForDrawingType(point, drawing.type);
            this._syncHorizontalAnchorToolPointY(drawing);
            applied = true;
        }
        if (drawing.meta) drawing.meta.updatedAt = Date.now();
        if (drawing.type === 'anchored-vwap' && drawing._cache) {
            drawing._cache.anchorIndex = null;
        }
        if (drawing.type === 'anchored-vwap' && drawing._isActiveMoving) {
            this._syncAnchoredVwapAnchorDomDuringMove(drawing);
            this._broadcastLiveEditUpdate(drawing);
            return applied;
        }
        this.scheduleRenderDrawing(drawing);
        this._broadcastLiveEditUpdate(drawing);
        return applied;
    }

    snapPointXToNearestCandle(point) {
        if (!point || !Number.isFinite(point.x)) return point;
        return {
            ...point,
            x: Math.round(point.x)
        };
    }

    /** Match getDataPoint: freehand + extrabar tools keep fractional bar index. */
    _shouldSnapPointXToCandle(drawingType) {
        if (!drawingType) return true;
        if (drawingType === 'path' || drawingType === 'brush' || drawingType === 'highlighter') {
            return false;
        }
        if (this._isTextDrawingType(drawingType)) {
            return false;
        }
        return true;
    }

    _snapPointXForDrawingType(point, drawingType) {
        if (!point) return point;
        let out = this.clampPointToCandleRange(point, drawingType);
        if (this._shouldSnapPointXToCandle(drawingType)) {
            out = this.snapPointXToNearestCandle(out);
        }
        return out;
    }

    _snapDrawingPointsX(drawing) {
        if (!drawing || !Array.isArray(drawing.points) || !this._shouldSnapPointXToCandle(drawing.type)) {
            return;
        }
        drawing.points = drawing.points.map((p) => this._snapPointXForDrawingType(p, drawing.type));
    }

    _normalizePointAfterPixelTranslate(point, drawingType) {
        if (!point) return point;
        return this._snapPointXForDrawingType(point, drawingType);
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
        if (drawing && this._isHorizontalAnchorToolType(drawing.type)) {
            return { dx, dy: 0 };
        }
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

            // Gann tools: live preview must match armed toolbar style (levels, colors, background).
            const gannUsesArmedPreview = (
                this.currentTool === 'gann-box'
                || this.currentTool === 'gann-square-fixed'
                || this.currentTool === 'gann-fan'
            );
            const fibArcsWedgeUsesArmedPreview = (
                this.currentTool === 'fib-arcs'
                || this.currentTool === 'fib-wedge'
            );
            const useFibDefaultPreview = this._isFibLikeDrawingType(this.currentTool)
                && !gannUsesArmedPreview
                && !fibArcsWedgeUsesArmedPreview
                && this.currentTool !== 'pitchfork';
            let styleOverrides;
            if (useFibDefaultPreview) {
                styleOverrides = { opacity: 0.85 };
            } else {
                const armedStyle = this.getArmedToolStyle(this.currentTool) || {};
                const savedStyle = this.getSavedToolStyle(this.currentTool) || {};
                const v9ArmedText = this._isTextDrawingType(this.currentTool)
                    && typeof window !== 'undefined'
                    && window.__v9ArmedDrawStyle
                    && window.__v9ArmedDrawStyle.tool === this.currentTool;
                styleOverrides = {
                    ...(v9ArmedText ? {} : savedStyle),
                    ...armedStyle,
                    opacity: 0.85
                };
                if (this.currentTool === 'short-position') {
                    styleOverrides.orientation = 'short';
                }
            }

            const tempDrawing = new toolInfo.class(previewPoints, styleOverrides);
            
            if (!useFibDefaultPreview) {
                this.applySavedStyle(tempDrawing);
            }
            if (gannUsesArmedPreview || fibArcsWedgeUsesArmedPreview) {
                this._applyArmedStyleExtras(tempDrawing);
            }
            
            // Pass isPreview flag for regression trend to show simple line while dragging
            const isPreview = this.drawingState.isDrawing;
            
            if (tempDrawing && typeof tempDrawing.render === 'function') {
                tempDrawing.render(this.tempGroup, {
                    xScale: this.chart.xScale,
                    yScale: this.chart.yScale,
                    chart: this.chart  // Pass chart for dataIndexToPixel
                }, isPreview);
            }
            if (this._isCurveLikePlacementTool(this.currentTool)) {
                this._captureCurvePlacementFromPreview(tempDrawing);
            }
            this._syncLivePreviewDrawing(tempDrawing);
            
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
        let placementPoints = this.drawingState.tempPoints.map((p) => ({ ...p }));
        if (this._isCurveLikePlacementTool(this.currentTool)) {
            placementPoints = this._mergeCurvePlacementEndpoints(placementPoints);
        }

        const args = [placementPoints];
        if (this.currentTool === 'emoji') {
            const options = this.currentEmojiOptions || this.pendingEmojiOptions || {};
            args.push(options);
        }

        const drawing = new toolInfo.class(...args);
        if (this._liveSyncDrawingId) {
            drawing.id = this._liveSyncDrawingId;
        } else {
            this._ensureDrawingId(drawing);
        }

        drawing.chart = this.chart;

        if (placementPoints.length >= 1 && typeof drawing.recalculateTimestamps === 'function') {
            try { drawing.recalculateTimestamps(); } catch (_) {}
        }

        if (placementPoints.length >= 3 && this._isCurveLikePlacementTool(this.currentTool)) {
            drawing._controlPointGenerated = true;
            drawing._needsScreenOffset = false;
        } else if (typeof drawing.finalizeDrawing === 'function') {
            drawing.finalizeDrawing();
        }

        if (typeof drawing._applyScreenSpaceBend === 'function' && this.chart?.xScale && this.chart?.yScale) {
            drawing._applyScreenSpaceBend({
                xScale: this.chart.xScale,
                yScale: this.chart.yScale,
                chart: this.chart
            });
        }

        this._clearCurvePlacementCache();

        // Apply saved style for this tool type
        this.applySavedStyle(drawing);
        this._applyArmedStyleExtras(drawing);

        // For image tools, don't save if no image is uploaded
        if (this.currentTool === 'image' && 
            (!drawing.style.imageUrl || drawing.style.imageUrl === '')) {
            // [debug removed]
            // Add to drawings temporarily so it can be selected and edited
            drawing.chart = this.chart;
            // Keep empty placeholder until user uploads or explicitly deletes — background
            // clicks after pan/placement were auto-removing it via deselectAll().
            drawing._autoRemoveIfEmpty = true;
            drawing._keepEmpty = true;
            this.drawings.push(drawing);
            // Select + render while tool is still armed (clearTool runs below).
            this.selectDrawing(drawing, false, { allowWhileArmed: true });
            this.renderDrawing(drawing);
            if (this.chart && typeof this.chart.scheduleRender === 'function') {
                this.chart.scheduleRender();
            }
            this.suppressNextCanvasBackgroundClick(500);
            try {
                if (typeof window !== 'undefined') {
                    const anchor = drawing.points && drawing.points[0] ? { ...drawing.points[0] } : null;
                    window.dispatchEvent(new CustomEvent('v9ImageDrawingPlaced', {
                        detail: {
                            id: drawing.id,
                            points: anchor ? [anchor] : [],
                        }
                    }));
                }
            } catch (_) {}
            
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

        if (typeof drawing.setText === 'function' && this._shouldAutoEditTextOnPlace(this.currentTool)) {
            drawing.setText('');
        }

        const autoEditOnPlace = this._shouldAutoEditTextOnPlace(this.currentTool);
        const placedDrawing = drawing;

        this.addDrawing(drawing);

        if (autoEditOnPlace) {
            placedDrawing._pendingAutoInlineEdit = true;
            requestAnimationFrame(() => {
                this.selectDrawing(placedDrawing, false, { allowWhileArmed: true });
                if (this.chart && typeof this.chart.render === 'function') {
                    this.chart.render();
                } else {
                    this.renderDrawing(placedDrawing);
                }
                this.beginTextInlineEdit(placedDrawing);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this._triggerAutoInlineEdit(placedDrawing);
                        placedDrawing._pendingAutoInlineEdit = false;
                    });
                });
            });
        } else {
            // Select the drawing synchronously so it is already selected when
            // clearTool() runs below. clearTool sees selectedDrawings.length > 0
            // and keeps SVG pointer-events:"all" via _updateAxisZonePointerEvents,
            // letting the user click empty space to deselect. The drawing stays
            // visible — only handles and the floating toolbar disappear on deselect.
            // Skip in keep-drawing-mode / persistent tools: user wants to keep drawing.
            const persistentTools = ['brush', 'highlighter'];
            const willKeepTool = this.keepDrawingMode || persistentTools.includes(this.currentTool);
            if (!willKeepTool) {
                this.selectDrawing(drawing, false, { allowWhileArmed: true });
            }
        }
        
        // Clear temp drawing
        this.tempGroup.selectAll('*').remove();
        this.drawingState.reset();
        this.riskRewardPreview = null;
        this.isDraggingFirstTwo = false;  // Reset for next drawing
        this.dragFirstTwoStart = null;
        this.dragFirstTwoStartScreen = null;
        this._liveSyncDrawingId = null;
        this._liveSyncBroadcasted = false;
        
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
            // Multichart: mirror post-draw deselect to every tile (legacy panelManager
            // path in clearTool() does not cover iframe peers).
            if (this.chart && typeof this.chart._broadcastMultichartClearDrawingTool === 'function') {
                this.chart._broadcastMultichartClearDrawingTool();
            }
            // Don't set cursor tool as active - let user click it to reactivate the last tool
        } else {
            this._applyPlacementModePointerEvents();
        }
    }

    /**
     * Cancel current drawing
     */
    cancelDrawing() {
        this._clearLiveSyncPreview();
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
        const priceStep = chart && chart.priceIncrement ? chart.priceIncrement : 0.0001;
        const minTicks = Math.max(priceStep * 5, 1e-12);
        const rewardRatio = positionDefaults.rewardRatio;

        // Fixed pixel leg on the stop side → stable on-screen size across zoom / timeframe.
        // Do not use persisted stopTicks here: a saved price distance made the next tool copy the
        // previous physical size. Reward ratio still comes from getPositionRiskDefaults.
        const RR_DEFAULT_STOP_LEG_PX = 72;
        if (
            chart
            && chart.yScale
            && typeof chart.yScale === 'function'
            && typeof chart.yScale.invert === 'function'
            && Number.isFinite(entry.y)
        ) {
            const ys = chart.yScale;
            const entryPx = ys(entry.y);
            if (Number.isFinite(entryPx)) {
                const stopPxDelta = RR_DEFAULT_STOP_LEG_PX;
                const targetPxDelta = stopPxDelta * rewardRatio;
                let stopPx;
                let targetPx;
                if (isLong) {
                    stopPx = entryPx + stopPxDelta;
                    targetPx = entryPx - targetPxDelta;
                } else {
                    stopPx = entryPx - stopPxDelta;
                    targetPx = entryPx + targetPxDelta;
                }
                let stopPrice = ys.invert(stopPx);
                let targetPrice = ys.invert(targetPx);
                if (isLong) {
                    if (!Number.isFinite(stopPrice) || stopPrice >= entry.y) stopPrice = entry.y - minTicks;
                    if (!Number.isFinite(targetPrice) || targetPrice <= entry.y) targetPrice = entry.y + minTicks * rewardRatio;
                } else {
                    if (!Number.isFinite(stopPrice) || stopPrice <= entry.y) stopPrice = entry.y + minTicks;
                    if (!Number.isFinite(targetPrice) || targetPrice >= entry.y) targetPrice = entry.y - minTicks * rewardRatio;
                }
                let stopOffset = Math.abs(entry.y - stopPrice);
                if (stopOffset < minTicks) {
                    stopOffset = minTicks;
                    stopPrice = isLong ? entry.y - stopOffset : entry.y + stopOffset;
                    targetPrice = isLong ? entry.y + stopOffset * rewardRatio : entry.y - stopOffset * rewardRatio;
                }
                return [
                    { x: entry.x, y: entry.y },
                    { x: entry.x, y: stopPrice },
                    { x: entry.x, y: targetPrice }
                ];
            }
        }

        let stopOffset;
        if (chart && chart.yScale) {
            const domain = chart.yScale.domain();
            const priceRange = Math.abs(domain[1] - domain[0]);
            stopOffset = priceRange * 0.05;
        } else {
            stopOffset = priceStep * 100;
        }

        stopOffset = Math.max(Math.abs(stopOffset), minTicks);
        const targetOffset = stopOffset * rewardRatio;
        const stopPrice = isLong ? entry.y - stopOffset : entry.y + stopOffset;
        const targetPrice = isLong ? entry.y + targetOffset : entry.y - targetOffset;
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
     * Human-readable title for lists, settings modal, and object tree.
     * Same tool type is numbered when there are 2+ instances (e.g. Path 1, Path 2).
     * A single instance uses the base name only (e.g. Path).
     */
    getDrawingDisplayTitle(drawing) {
        if (!drawing) return '';
        const meta = drawing.meta || {};
        if (typeof meta.customDisplayName === 'string' && meta.customDisplayName.trim()) {
            return meta.customDisplayName.trim();
        }

        const base = this.settingsPanel && typeof this.settingsPanel.getDrawingDisplayName === 'function'
            ? this.settingsPanel.getDrawingDisplayName(drawing.type)
            : (drawing.type || 'Drawing').replace(/-/g, ' ');

        const sameType = (this.drawings || []).filter(d => d && d.type === drawing.type);
        const ordinal = sameType.length <= 1 ? null : sameType.indexOf(drawing) + 1;
        const autoTitle = ordinal == null ? base : `${base} ${ordinal}`;

        const legacyName = typeof drawing.name === 'string' && drawing.name.trim();
        if (legacyName) {
            const legacyTrim = legacyName.trim();
            if (ordinal == null) {
                const m = legacyTrim.match(/^(.+?)\s+(\d+)$/);
                if (m && m[1].trim() === base) {
                    return base;
                }
            }
            if (legacyTrim === autoTitle) return autoTitle;
            return legacyTrim;
        }

        const preferTextTypes = new Set([
            'text', 'notebox', 'label', 'anchored-text', 'note', 'price-note',
            'price-label', 'price-label-2', 'pin', 'callout', 'comment', 'signpost-2', 'flag-mark'
        ]);
        const isFactoryPlaceholderTitle = (raw) => {
            const t = String(raw == null ? '' : raw).trim();
            if (!t) return true;
            if (/^add text$/i.test(t)) return true;
            if (/^type here$/i.test(t)) return true;
            if (t === 'text') return true;
            return false;
        };
        if (preferTextTypes.has(drawing.type) && drawing.text && String(drawing.text).trim()) {
            const t = String(drawing.text).trim();
            if (!isFactoryPlaceholderTitle(t)) {
                return t.length > 30 ? t.substring(0, 30) + '...' : t;
            }
        }

        return autoTitle;
    }

    /**
     * Add a completed drawing
     */
    addDrawing(drawing) {
        const hadLivePreview = this._liveSyncBroadcasted && this._isLiveSyncId(drawing && drawing.id);
        const livePreviewId = hadLivePreview ? drawing.id : null;
        if (hadLivePreview) {
            // Promote temporary live preview ID to a stable persisted drawing ID.
            drawing.id = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        } else {
            this._ensureDrawingId(drawing);
        }
        // Set chart reference for timestamp conversion
        drawing.chart = this.chart;

        // Persist new drawings in timestamp space so timeframe switches keep them visible
        // (same behavior expected from original chart).
        const fromClonePayload = !!drawing._fromClonePayload;
        if (
            drawing &&
            Array.isArray(drawing.points) &&
            this.chart &&
            Array.isArray(this.chart.data) &&
            this.chart.data.length > 0 &&
            typeof CoordinateUtils !== 'undefined' &&
            typeof CoordinateUtils.pointsToTimestamps === 'function'
        ) {
            try {
                const tsPoints = CoordinateUtils.pointsToTimestamps(
                    drawing.points,
                    this.chart.data,
                    this.chart.currentTimeframe
                );
                if (Array.isArray(tsPoints) && tsPoints.length > 0) {
                    drawing.timestampPoints = tsPoints;
                    drawing.coordinateSystem = 'timestamp';
                }
            } catch (_) {}
        }
        
        this.drawings.push(drawing);
        this.renderDrawing(drawing, fromClonePayload ? { skipTimestampSync: true } : undefined);
        if (fromClonePayload) {
            delete drawing._fromClonePayload;
        }
        this.persistPositionToolDefaults(drawing);
        this.saveDrawings();

        // Placement click can arrive as detail>=2; do not open settings on the same gesture.
        if (this.isVolumeProfileToolType(drawing.type)) {
            this._suppressNextDrawingDblClickUntil = Date.now() + 900;
            this.suppressNextCanvasBackgroundClick(650);
        }
        
        // Record for undo/redo
        if (this.history) {
            this.history.recordAdd(drawing);
        }
        
        // Broadcast to other panels in real-time
        if (this.chart.broadcastDrawingChange) {
            // Finalize handoff: remove temp live preview, then add stable drawing.
            if (hadLivePreview && livePreviewId) {
                this.chart.broadcastDrawingChange('remove', { id: livePreviewId });
            }
            this.chart.broadcastDrawingChange('add', drawing);
            // Settle pass: immediately re-apply finalized geometry on targets.
            // Helps panels that quantize/index-map differently on initial add.
            this.chart.broadcastDrawingChange('update', drawing);
        }
        
        // Refresh object tree if available
        if (this.objectTreeManager) {
            this.objectTreeManager.refresh();
        }
        
        // Brush/highlighter stay armed until right-click — do not auto-select the stroke
        // (V9 toolbar.show would clear the active draw tool).
        const keepFreehandToolArmed = this._isPersistentFreehandTool(this.currentTool)
            && this._isPersistentFreehandTool(drawing.type);

        if (!keepFreehandToolArmed) {
            // Auto-select the newly drawn shape to show resize handles immediately
            this.drawings.forEach(d => {
                if (d !== drawing) d.deselect();
            });

            drawing.select();
            this.selectedDrawing = drawing;
            this.selectedDrawings = [drawing];
            this.renderDrawing(drawing);

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
        } else {
            this.drawings.forEach((d) => {
                if (d && d.selected) {
                    d.deselect();
                    this.renderDrawing(d, { skipInteraction: true });
                }
            });
            this.toolbar.hide();
            this.selectedDrawing = null;
            this.selectedDrawings = [];
            this._applyPlacementModePointerEvents();
        }
        
        // [debug removed]
    }

    /**
     * Render a single drawing
     * @param {Object} drawing
     * @param {Object} [opts]
     * @param {boolean} [opts.skipInteraction=false] - Skip setupDrawingInteraction (hot path: pan/zoom redraws)
     */
    renderDrawing(drawing, opts = {}) {
        if (!drawing) return;
        const liveRender = !!opts.liveRender || this._isLiveDrawingInteraction();
        const skipInteraction = !!opts.skipInteraction || liveRender;
        const drawingRenderOpts = opts.drawingRenderOpts || (liveRender ? {
            reuseGroup: !!(drawing && drawing.group && !drawing.group.empty()),
            skipHandles: true
        } : null);
        
        // Set re-entry guard so hideAxisHighlights → scheduleRender doesn't re-enter
        // during the render cycle (stack overflow when scheduleRender is synchronous).
        const wasRendering = this.chart && this.chart._isRendering;
        if (this.chart) this.chart._isRendering = true;

        const trackedDrawing = this.drawings.find(d => d === drawing || (d && drawing && d.id === drawing.id));
        if (!trackedDrawing) {
            if (drawing.group) {
                drawing.group.remove();
                drawing.group = null;
            }
            if (this.chart) this.chart._isRendering = wasRendering;
            return;
        }
        drawing = trackedDrawing;

        // Anchor drag uses direct DOM updates — skip SVG rebuild so d3 drag stays bound.
        if (drawing.type === 'anchored-vwap' && drawing._isActiveMoving) {
            if (this.chart) this.chart._isRendering = wasRendering;
            return;
        }

        // Ensure scales are available
        if (!this.chart.xScale || !this.chart.yScale) {
            console.warn('⚠️ Cannot render drawing - scales not ready');
            if (this.chart) this.chart._isRendering = wasRendering;
            return;
        }
        
        // [debug removed]
        
        // Handle visibility (detach DOM so Objects Tree does not treat stale groups as "gone")
        if (drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) {
            this._detachDrawingDom(drawing);
            if (this.chart) this.chart._isRendering = wasRendering;
            return;
        }
        
        // Check timeframe visibility (legacy per-tf and new _ranges)
        const tfVisible = this._isVisibleForCurrentTimeframe(drawing);
        if (!tfVisible) {
            this._detachDrawingDom(drawing);
            if (this.chart) this.chart._isRendering = wasRendering;
            return;
        }
        
        // Show the drawing (full geometry rebuild after visibility hide — avoids stacked paths)
        let renderOpts = drawingRenderOpts;
        if (drawing.group) {
            const wasHidden = drawing.group.style('display') === 'none';
            drawing.group.style('display', null);
            if (wasHidden && renderOpts && renderOpts.reuseGroup) {
                renderOpts = { ...renderOpts, reuseGroup: false };
            }
        }

        if (!opts.skipTimestampSync && !this._isDrawingLiveEditing(drawing)) {
            const hasDragTransform = !!(drawing.group && drawing.group.attr('transform'));
            const skipSyncDuringCssMove = hasDragTransform && this._isDrawingGeometryMoveActive();
            if (!skipSyncDuringCssMove) {
                this._syncDrawingPointsFromTimestamps(drawing);
            }
        }

        const scales = {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale,
            chart: this.chart,
            labelsGroup: this.labelsGroup
        };

        // Render with current scales AND chart instance for accurate pixel calculation
        if (renderOpts) {
            drawing.render(this.drawingsGroup, scales, renderOpts);
        } else {
            drawing.render(this.drawingsGroup, scales);
        }

        if (liveRender && drawingRenderOpts && drawingRenderOpts.skipHandles) {
            if (typeof drawing._syncLiveTextChrome === 'function' && drawing.bbox) {
                drawing._syncLiveTextChrome(drawing.group, drawing.bbox);
            } else if (typeof drawing._syncTextHandlePositions === 'function' && drawing.bbox
                && typeof drawing._shouldCreateHandles === 'function'
                && drawing._shouldCreateHandles({ skipHandles: false })) {
                drawing._syncTextHandlePositions(drawing.group, drawing.bbox);
            } else if (typeof drawing._syncBoxHandlePositions === 'function') {
                drawing._syncBoxHandlePositions(drawing.group, scales);
            } else if (typeof drawing.updateHandlePositions === 'function') {
                drawing.updateHandlePositions(scales);
            }
            if (this._isLiveHandleEditing()) {
                this._raiseResizeHandles(drawing);
            }
        }
        
        if (typeof drawing.showAxisHighlights === 'function') {
            if (drawing.selected) {
                const hasDragTransform = !!(drawing.group && drawing.group.attr('transform'));
                const skipAxisDuringMove = this._isDrawingGeometryMoveActive() && hasDragTransform;
                const duringHandleEdit = this._isLiveHandleEditing()
                    && (this.resizingDrawing === drawing || this.customHandleDrawing === drawing);
                if (duringHandleEdit) {
                    this._refreshAxisHighlightsDuringHandleEdit(drawing);
                } else if (!skipAxisDuringMove) {
                    drawing.showAxisHighlights({ live: liveRender });
                }
            } else if (typeof drawing.hideAxisHighlights === 'function') {
                drawing.hideAxisHighlights();
            }
        }
        
        // Setup interaction handlers
        // Skip during hot-path redraws (pan/zoom): the SVG-level geometric hit-tester
        // (findDrawingsAtPoint / handleMouseDown) handles selection without per-element
        // event listeners. setupDrawingInteraction is called when a drawing is actually
        // selected (renderDrawing from selectDrawing) or first placed (addDrawing).
        if (!skipInteraction) {
            this.setupDrawingInteraction(drawing);
        } else if (!liveRender) {
            // Never run during live resize/move: it sets pointer-events:none on the
            // group and breaks handle dragging after the first animation frame.
            this._applyMinimalPointerEvents(drawing);
        }
        const textHelpers = typeof window !== 'undefined' ? window.DrawingTextHelpers : null;
        if (textHelpers && typeof textHelpers.refreshTextAnnotationTextCursors === 'function') {
            const inlineTextTypes = new Set(['text', 'note', 'notebox', 'anchored-text', 'callout', 'comment', 'pin', 'signpost-2']);
            if (inlineTextTypes.has(drawing.type)) {
                textHelpers.refreshTextAnnotationTextCursors(drawing);
                if (typeof textHelpers.refreshTextAnnotationHandlePointerEvents === 'function') {
                    textHelpers.refreshTextAnnotationHandlePointerEvents(drawing);
                }
            }
        }
        if (this._isPlacementModeActive()) {
            this._disableDrawingPointerEvents(drawing);
        }
        if (this._textInlineEditDrawing === drawing) {
            this._syncInlineTextEditorToDrawing(drawing);
            if (liveRender && !drawing.locked && drawing.group && !drawing.group.empty()) {
                try { this.setupDrawingDrag(drawing); } catch (_) { /* ignore */ }
            }
        }
        // Order panel preview lines are appended to the root SVG after .drawings — they stack on top
        // and steal drags from risk/reward / other tools unless we lift the drawing layers again.
        if (!liveRender) {
            this.raiseDrawingLayersAboveOrderPreviews();
        }
        
        // Restore re-entry guard
        if (this.chart) this.chart._isRendering = wasRendering;
    }

    /**
     * SVG paint order = DOM order. OrderManager preview TP/SL/Entry lines use svg.append() so they
     * end up above .drawings and block hits. Re-append drawing groups last so tools stay interactive.
     */
    raiseDrawingLayersAboveOrderPreviews() {
        if (!this.svg || this.svg.empty()) return;
        try {
            if (this.drawingsGroup && !this.drawingsGroup.empty()) {
                this.drawingsGroup.raise();
            }
            if (this.labelsGroup && !this.labelsGroup.empty()) {
                this.labelsGroup.raise();
            }
            if (this.tempGroup && !this.tempGroup.empty()) {
                this.tempGroup.raise();
            }
            // Drawing layers were just lifted above ALL order previews. The order preview
            // action badges (place ✓ / cancel ✕, delete-leg ✕, split +, SL/TP) must stay
            // clickable, so put them back on top. Without this, any chart re-render that
            // calls this method (pan/zoom, drawing edits) drops the multi-entry ✓/✕ and
            // delete-leg ✕ underneath the drawing layer and their clicks are swallowed.
            const om = this.chart?.orderManager;
            if (om && om.previewLines && typeof om._raiseEntryAnchoredPreviewBadgesToFront === 'function') {
                om._raiseEntryAnchoredPreviewBadgesToFront();
            }
        } catch (_e) {
            /* ignore */
        }
    }

    /**
     * Setup interaction for a drawing
     */
    /**
     * Lightweight pointer-events pass used during hot-path redraws (pan/zoom).
     * Only sets the top-level group to pointer-events:none and a single broad
     * selector for strokes — avoids the ~20 selectAll() calls in setupDrawingInteraction.
     * Full setupDrawingInteraction runs when a drawing is selected or first placed.
     */
    _applyMinimalPointerEvents(drawing) {
        if (!drawing.group) return;
        if (this._isPlacementModeActive()) {
            this._disableDrawingPointerEvents(drawing);
            return;
        }
        drawing.group.style('pointer-events', 'none');
        // Keep fills non-interactive and strokes reachable for the SVG hit layer
        drawing.group.selectAll('.shape-fill, .upper-fill, .lower-fill, .line-visible-path')
            .style('pointer-events', 'none');
    }

    setupDrawingInteraction(drawing) {
        if (!drawing.group) return;
        
        const self = this;
        
        drawing.group.style('pointer-events', 'none');
        
        // Enable pointer events on STROKE elements only (not fills)
        // For lines and text, use 'all'; for shape borders, use 'stroke' to ONLY detect stroke clicks
        drawing.group.selectAll('line:not(.shape-border-hit):not(.rr-entry-stroke):not(.rr-avg-zone-edge), polyline, text, circle:not(.pin-center-hole), ellipse, .resize-handle-hit, .resize-handle-group, .custom-handle, .image-content, .image-placeholder')
            .style('pointer-events', 'all');
        drawing.group.selectAll('.resize-handle')
            .style('pointer-events', 'none');
        // Channel tools with fill: move only from lines, not filled interior.
        if (this._isWedgeChannelStrokeOnlyType(drawing.type)) {
            drawing.group.selectAll('line:not(.shape-border-hit)')
                .style('pointer-events', 'stroke');
        }
        // Long/short R/R: informational labels (P&L pill, TP/SL captions) must not capture drags — the blanket
        // `text { pointer-events: all }` rule above would otherwise steal hits from .rr-primary-entry-drag-hit.
        if (drawing.type === 'long-position' || drawing.type === 'short-position') {
            drawing.group.selectAll('.rr-no-hit text, .rr-no-hit rect, .rr-no-hit tspan')
                .style('pointer-events', 'none');
            drawing.group.selectAll('.rr-mini-level-badge')
                .style('pointer-events', 'none');
            // Label pills: drag same level as the horizontal strip (custom-handle on top of badge only).
            drawing.group.selectAll('.rr-mini-badge-drag-hit')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            // Multi-entry: P&L / R:R pill on avg (middle) line — draggable for whole-tool move; ladder follows.
            drawing.group.selectAll('.rr-multi-pill-drag rect, .rr-multi-pill-drag text, .rr-multi-pill-drag tspan')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
            drawing.group.selectAll('.rr-avg-zone-edge')
                .style('pointer-events', 'none');
        }
        drawing.group.selectAll('.rr-plus-btn .rr-plus-hit')
            .style('pointer-events', 'all')
            .style('cursor', 'pointer');
        drawing.group.selectAll('.rr-plus-btn .rr-plus-visible')
            .style('pointer-events', 'none');
        
        // Shape borders use 'stroke' - ONLY responds to clicks on the actual stroke path
        // Risk/reward main entry line is .rr-entry-stroke: non-interactive; entry drag is
        // .rr-primary-entry-drag-hit (custom-handle line), same idea as TP dashed lines.
        drawing.group.selectAll('.shape-border:not(.shape-border-hit):not(.rr-entry-stroke)')
            .style('pointer-events', 'stroke');
        
        // Hit areas also use stroke
        drawing.group.selectAll('.shape-border-hit:not(.text-body-hit):not(.flag-body-hit)')
            .style('pointer-events', 'stroke');

        // Text/pin/flag body hit areas should stay fully interactive (middle + border drag zone)
        drawing.group.selectAll('.text-body-hit, .pin-body-hit, .flag-body-hit, .note-body-hit')
            .style('pointer-events', 'all');

        // Arrow tools: allow fill hit areas to be interactive
        drawing.group.selectAll('.arrow-fill-hit')
            .style('pointer-events', 'all');
        
        // Paths that are NOT fills should be clickable on stroke
        drawing.group.selectAll('path:not(.shape-fill):not(.shape-border):not(.arrow-fill-hit):not(.pin-body-hit):not(.line-visible-path), polygon:not(.shape-fill):not(.upper-fill):not(.lower-fill)')
            .style('pointer-events', 'stroke');

        // Anchored VWAP: allow selection from curve, but keep drag interaction on anchor handles.
        if (drawing.type === 'anchored-vwap') {
            drawing.group.selectAll('.anchored-vwap-curve, .anchored-vwap-band-fill, .anchored-vwap-line-markers')
                .style('pointer-events', 'none')
                .style('cursor', 'default');
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

            if (drawing.type === 'anchored-volume-profile') {
                // TradingView-like: only the anchor resize point is interactive — not the vertical line.
                drawing.group.selectAll('.volume-profile-level-line')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');
                drawing.group.selectAll('.volume-profile-values-label')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');
                drawing.group.selectAll('.volume-profile-boundary-hit, .volume-profile-anchor-boundary, .volume-profile-boundary')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');
                drawing.group.selectAll('.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"]')
                    .style('pointer-events', 'all')
                    .style('cursor', 'ew-resize');
            } else {
                drawing.group.selectAll('.volume-profile-boundary-hit')
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'ew-resize');

                drawing.group.selectAll('.volume-profile-boundary')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');

                drawing.group.selectAll('.volume-profile-level-line.shape-border-hit')
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'pointer');
                drawing.group.selectAll('.volume-profile-level-line:not(.shape-border-hit)')
                    .style('pointer-events', 'none')
                    .style('cursor', 'default');

                drawing.group.selectAll('.volume-profile-hitbox, .volume-profile-range')
                    .style('pointer-events', 'all')
                    .style('cursor', 'default');

                drawing.group.selectAll('.resize-handle-hit, .resize-handle-group')
                    .style('pointer-events', 'all');
                drawing.group.selectAll('.resize-handle')
                    .style('pointer-events', 'none');

                drawing.group.selectAll('.volume-profile-values-label')
                    .style('pointer-events', 'all')
                    .style('cursor', 'pointer');
            }
        }
        
        // IMPORTANT: Ensure ALL fill elements have pointer-events disabled
        drawing.group.selectAll('.shape-fill, .upper-fill, .lower-fill, .line-visible-path')
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
            : drawing.type === 'anchored-volume-profile'
                ? '.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"]'
            : isVolumeProfileType
                ? '.volume-profile-boundary-hit, .volume-profile-boundary, .volume-profile-level-line.shape-border-hit, .volume-profile-values-label, .resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle'
                : '.arrow-fill-hit, .shape-border:not(.shape-border-hit), .shape-border-hit, .flag-body-hit, line:not(.shape-border-hit), .fib-level-hit, .gann-level-hit, .pitchfork-level-hit, .pitchfork-handle-hit, .fib-trend-line, .fib-tz-anchor, .fib-arcs-trend, .fib-wedge-trend, path:not(.shape-fill):not(.shape-border-hit), polyline, polygon:not(.upper-fill):not(.lower-fill):not(.shape-fill), circle:not(.shape-fill):not(.rr-plus-hit):not(.rr-plus-visible), ellipse:not(.shape-fill), text:not(.inline-editable-text), .resize-handle, .resize-handle-hit, .custom-handle, .image-content, .image-placeholder, .note-line, .note-line-hit, .flag-stem-hit';
        const interactiveElements = drawing.group.selectAll(selector);

        if (this._isFibLikeDrawingType(drawing.type)) {
            drawing.group.style('pointer-events', 'none');
            interactiveElements.style('pointer-events', 'stroke');
            drawing.group.selectAll('.gann-box-hitbox, .gann-square-fixed-hitbox, .gann-fan-hitbox, .fib-wedge-hitbox')
                .style('pointer-events', 'all')
                .style('cursor', 'move');
        }

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
            // Risk/reward + buttons: let the tool's handler on the parent .rr-plus-btn run (bubble)
            if (event.target && event.target.closest && event.target.closest('.rr-plus-btn')) {
                return;
            }

            // Skip label/body hits — per-tool handlers own click/dblclick (incl. tspans)
            const targetSel = d3.select(event.target);
            if (self._isTextAnnotationInteractionTarget(event.target)) {
                if (self._drawingClickTimes) {
                    self._drawingClickTimes[drawing.id] = 0;
                }
                return;
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
            const [mouseX, mouseY] = self._eventCanvasLocalXY(event);
            
            // For shapes (rectangle, triangle, ellipse, circle), verify click is on stroke
            const shapeTypes = ['rectangle', 'triangle', 'ellipse', 'circle'];
            if (shapeTypes.includes(drawing.type)) {
                const isShapeBorderHit = targetSel.classed('shape-border-hit');
                // Use the same geometric hit-test as hover/direct-drag so the hover zone matches selection.
                const drawingsAtPoint = self.findDrawingsAtPoint(mouseX, mouseY);
                const clickedOnStroke = isShapeBorderHit || drawingsAtPoint.some(d => d && d.id === drawing.id);
                
                if (!clickedOnStroke) {
                    // [debug removed]
                    return; // Don't select - click was on fill area
                }
            }

            if (self._isFibLikeDrawingType(drawing.type)) {
                const onFibStroke = targetSel.classed('fib-level-hit')
                    || targetSel.classed('gann-level-hit')
                    || targetSel.classed('gann-fan-hitbox')
                    || targetSel.classed('gann-box-hitbox')
                    || targetSel.classed('gann-square-fixed-hitbox')
                    || targetSel.classed('pitchfork-level-hit')
                    || targetSel.classed('pitchfork-handle-hit')
                    || targetSel.classed('fib-circles-axis')
                    || targetSel.classed('fib-trend-line')
                    || targetSel.classed('fib-tz-anchor')
                    || targetSel.classed('fib-arcs-trend')
                    || targetSel.classed('fib-arcs-trend-hit')
                    || targetSel.classed('fib-wedge-trend')
                    || targetSel.classed('fib-wedge-trend-hit')
                    || targetSel.classed('fib-fan-anchor');
                const onGannBody = (drawing.type === 'gann-box' || drawing.type === 'gann-square-fixed' || drawing.type === 'gann-fan')
                    && (targetSel.classed('gann-box-hitbox') || targetSel.classed('gann-square-fixed-hitbox')
                        || targetSel.classed('gann-fan-hitbox')
                        || self._isPointOnGannToolBody(drawing, mouseX, mouseY))
                    && !self._isPointOnGannLevelAdjustHit(drawing, mouseX, mouseY);
                const onFibWedgeBody = drawing.type === 'fib-wedge'
                    && (targetSel.classed('fib-wedge-hitbox') || self._isPointInFibWedgeBody(drawing, mouseX, mouseY));
                const drawingsAtPoint = self.findDrawingsAtPoint(mouseX, mouseY);
                const clickedOnFibLine = onFibStroke
                    || onGannBody
                    || onFibWedgeBody
                    || self._isPointOnFibLikeStroke(drawing, mouseX, mouseY)
                    || drawingsAtPoint.some(d => d && d.id === drawing.id);
                if (!clickedOnFibLine) {
                    return;
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
            const suppressSettingsUntil = Number(self._suppressNextDrawingDblClickUntil || 0);
            if (
                timeSinceLastClick < DOUBLE_CLICK_DELAY
                && timeSinceLastClick > 50
                && !(suppressSettingsUntil > 0 && now <= suppressSettingsUntil)
            ) {
                if (self._isTextAnnotationInteractionTarget(event.target)) {
                    self._drawingClickTimes[drawing.id] = 0;
                    return;
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
            
            // Single click - select (with Shift for multi-select); locked = select only, no drag/resize
            if (!self.currentTool) {
                self.selectDrawing(drawing, event.shiftKey);
            }
        };
        
        // Double-click handler
        const handleDblClick = function(event) {
            const suppressUntil = Number(self._suppressNextDrawingDblClickUntil || 0);
            if (suppressUntil > 0 && Date.now() <= suppressUntil) {
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
                if (typeof event.preventDefault === 'function') event.preventDefault();
                return;
            }
            if (event.target && event.target.closest && event.target.closest('.rr-plus-btn')) {
                return;
            }
            if (self._isTextAnnotationInteractionTarget(event.target)) {
                return;
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
            // Deselect drawing first (TradingView style), then show context menu
            if (self.selectedDrawings.includes(drawing)) {
                self.deselectAll();
            } else if (!drawing.locked) {
                self.selectDrawing(drawing);
            }
            self.showContextMenu(drawing, event.pageX, event.pageY);
        };
        
        // Hover handlers
        const handleMouseEnter = function(event) {
            if (self.currentTool) return;
            
            // Ctrl+hover to select (multi-select mode)
            if (self.ctrlSelectMode && !drawing.locked && !self._isDrawingGeometryMoveActive()) {
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
            const textHelpers = typeof window !== 'undefined' ? window.DrawingTextHelpers : null;
            const isInlineTextTarget = textHelpers && typeof textHelpers.isTextAnnotationInlineTextNode === 'function'
                ? textHelpers.isTextAnnotationInlineTextNode(rawTargetNode)
                : isInlineEditable;
            const isVolumeProfileLevelLineTarget = self.isVolumeProfileToolType(drawing.type)
                && target
                && target.classed('volume-profile-level-line');
            
            if (!drawing.locked) {
                if (isResizeTarget) {
                    drawing.group.style('cursor', 'ew-resize');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'ew-resize';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'ew-resize';
                } else if (isVolumeProfileLevelLineTarget) {
                    drawing.group.style('cursor', 'pointer');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'pointer';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'pointer';
                } else if (self.isVolumeProfileToolType(drawing.type)) {
                    const srcEvent = event && (event.sourceEvent || event);
                    let panBlockCursor = 'default';
                    if (srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                        const [mx, my] = self._eventCanvasLocalXY(srcEvent);
                        if (self.isVolumeProfileChartPanBlockedAtPoint(mx, my)) {
                            panBlockCursor = 'default';
                        } else if (self.isVolumeProfileBoundaryHit(drawing, mx, my)) {
                            panBlockCursor = 'ew-resize';
                        } else {
                            panBlockCursor = 'default';
                        }
                    }
                    drawing.group.style('cursor', panBlockCursor);
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = panBlockCursor;
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = panBlockCursor;
                } else if (isInlineTextTarget) {
                    const hoverCursor = (textHelpers && typeof textHelpers.resolveTextAnnotationHoverCursor === 'function')
                        ? (textHelpers.resolveTextAnnotationHoverCursor(drawing, rawTargetNode) || 'move')
                        : (drawing.selected ? 'text' : 'move');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = hoverCursor;
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = hoverCursor;
                } else {
                    drawing.group.style('cursor', 'move');
                    if (self.chart?.canvas) self.chart.canvas.style.cursor = 'move';
                    if (self.chart?.svg?.node()) self.chart.svg.node().style.cursor = 'move';
                }
                SVGHelpers.applyHoverEffect(drawing.group, true);
                if (drawing.type === 'anchored-vwap' && drawing.group && !drawing._isActiveMoving) {
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
            if (drawing.type === 'anchored-vwap' && drawing.group && !drawing._isActiveMoving) {
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

        // Gann / fib wedge body hitboxes use shape-border-hit and are excluded from interactiveElements.
        if (this._isFibLikeDrawingType(drawing.type)) {
            drawing.group.selectAll('.gann-box-hitbox, .gann-square-fixed-hitbox, .gann-fan-hitbox, .fib-wedge-hitbox')
                .on('click', handleClick)
                .on('dblclick', handleDblClick)
                .on('contextmenu', handleContextMenu)
                .on('mouseenter', handleMouseEnter)
                .on('mouseleave', handleMouseLeave);
        }
        
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

        if (this._isPlacementModeActive()) {
            this._disableDrawingPointerEvents(drawing);
        }
    }
    
    /**
     * Setup drag behavior for moving entire drawing
     */
    _isAnnotationTextLabelDrawingType(type) {
        return type === 'note' || type === 'price-note' || type === 'callout' || type === 'comment'
            || type === 'pin' || type === 'signpost-2' || type === 'notebox' || type === 'text'
            || type === 'anchored-text';
    }

    /** Text & labels tools whose body/label DOM is edited via per-tool click handlers. */
    _isTextDrawingType(type) {
        return type === 'text'
            || type === 'note'
            || type === 'price-note'
            || type === 'callout'
            || type === 'comment'
            || type === 'signpost-2'
            || type === 'flag-mark'
            || type === 'pin'
            || type === 'notebox'
            || type === 'anchored-text'
            || type === 'label';
    }

    /** Open inline editor right after first placement (not for auto-priced labels). */
    _shouldAutoEditTextOnPlace(toolName) {
        return this._isTextDrawingType(toolName)
            && toolName !== 'price-note'
            && toolName !== 'price-label'
            && toolName !== 'price-label-2'
            && toolName !== 'flag-mark';
    }

    /**
     * True when the target is rendered text (text/tspan) — dblclick opens inline edit, not settings.
     */
    _isTextAnnotationInlineEditTarget(rawTargetNode) {
        if (!rawTargetNode) return false;
        const tag = (rawTargetNode.tagName || '').toLowerCase();
        if (tag === 'text') {
            try {
                return d3.select(rawTargetNode).classed('inline-editable-text');
            } catch (_) { /* ignore */ }
            return false;
        }
        if (tag === 'tspan' && rawTargetNode.closest) {
            const textParent = rawTargetNode.closest('text');
            if (textParent) {
                try {
                    return d3.select(textParent).classed('inline-editable-text');
                } catch (_) { /* ignore */ }
            }
        }
        return false;
    }

    /**
     * True when the target is label box fill/border or leader line — dblclick opens settings.
     */
    _isTextAnnotationChromeTarget(rawTargetNode) {
        if (!rawTargetNode || !rawTargetNode.closest) return false;
        return !!rawTargetNode.closest(
            '.note-body-hit, .text-body-hit, .comment-body-hit, .signpost-stem-hit, .signpost-label-fill, .note-line-hit, .note-line'
        );
    }

    /**
     * Per-tool native handlers own these targets (skip generic d3 click/dblclick on the same node).
     */
    _isTextAnnotationInteractionTarget(rawTargetNode) {
        return this._isTextAnnotationInlineEditTarget(rawTargetNode)
            || this._isTextAnnotationChromeTarget(rawTargetNode);
    }

    setupDrawingDrag(drawing) {
        // Empty image placeholder: upload-only until a file is chosen — skip move drag so the
        // same pointer gesture that placed the object cannot commit a spurious transform.
        if (drawing.type === 'image' && (!drawing.style.imageUrl || drawing.style.imageUrl === '')) {
            return;
        }

        const self = this;
        let dragStartPoints = null;
        let startDataPoint = null;
        let beforeState = null;
        let multiDragStartPoints = null;
        let bodyDragStartScreen = null;
        let bodyDragStartTransform = null;
        /** Cumulative constrained delta from drag start (single drawing whole-move). */
        let rrLastCumulative = { x: 0, y: 0 };
        /** Per-drawing cumulative constrained delta for multi-select whole-move (long/short extra levels). */
        let rrLastByDrawingId = null;

        const getDragDataPoint = (dragEvent) => {
            const src = (dragEvent && dragEvent.sourceEvent) ? dragEvent.sourceEvent : dragEvent;
            return self.getDataPoint(src, drawing.type, { suppressKeyMagnet: true });
        };

        const setAnchoredVWAPMovingState = (targetDrawing, isMoving) => {
            if (!targetDrawing || targetDrawing.type !== 'anchored-vwap') return;
            targetDrawing._isActiveMoving = !!isMoving;
        };
        
        // Apply drag to interactive elements (not the group which has pointer-events: none)
        const isVolumeProfileType = this.isVolumeProfileToolType(drawing.type);
        const dragSelector = drawing.type === 'anchored-vwap'
            ? '.anchored-vwap-anchor, .anchored-vwap-anchor-hit, .resize-handle, .resize-handle-hit, .resize-handle-group'
            : drawing.type === 'anchored-volume-profile'
                ? '.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"]'
            : isVolumeProfileType
                ? '.volume-profile-boundary-hit, .resize-handle, .resize-handle-hit, .resize-handle-group'
                : drawing.type === 'image'
                    ? '.image-content, .image-placeholder'
                    : '.shape-border, line:not(.rr-primary-entry-drag-hit):not(.rr-extra-drag-hit):not(.rr-avg-zone-edge):not(.fib-level-hit), path, polyline, polygon:not(.upper-fill):not(.lower-fill):not(.shape-fill), text, tspan, .inline-editable-text, .text-body-hit, .note-body-hit, rect:not(.shape-fill):not(.upper-fill):not(.lower-fill):not(.rr-primary-entry-drag-hit):not(.rr-extra-drag-hit):not(.rr-primary-leg-drag-hit):not(.rr-mini-badge-drag-hit), circle:not(.shape-fill):not(.upper-fill):not(.lower-fill):not(.rr-plus-hit):not(.rr-plus-visible), ellipse:not(.shape-fill):not(.upper-fill):not(.lower-fill)';
        const dragElements = drawing.group.selectAll(dragSelector);
        const dragClickDistance = drawing.type === 'anchored-vwap' ? 1 : (drawing.type === 'image' ? 6 : 4);
        let textBodyDragOverflowActive = false;
        let horizontalAnchorPointDrag = false;

        dragElements.on('.drag', null);

        const bodyDrag = d3.drag()
                .clickDistance(dragClickDistance) // Keep anchored-vwap anchor drags responsive while preserving dblclick elsewhere
                .filter(function(event) {
                    const src = event.sourceEvent || event;
                    // Multi-select + Ctrl uses canvas direct-move; single selection uses normal d3 body drag.
                    if (!self.currentTool && src && src.ctrlKey && !src.shiftKey
                        && Array.isArray(self.selectedDrawings) && self.selectedDrawings.length > 1
                        && self.selectedDrawings.includes(drawing)) {
                        return false;
                    }
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
                    if (!self.currentTool && !isAnyHandle && src && typeof src.clientX === 'number' && typeof src.clientY === 'number') {
                        const [mx, my] = self._eventCanvasLocalXY(src);
                        if (self._isPointOnResizeHandle(drawing, mx, my)) {
                            return false;
                        }
                    }
                    if (targetEl && targetEl.closest && targetEl.closest('.rr-plus-btn')) {
                        return false;
                    }
                    if (targetSelection.classed('gann-level-hit') && targetSelection.attr('data-gann-level-array')) {
                        return false;
                    }
                    const isShapeFill = targetSelection.classed('shape-fill');
                    const isUpperFill = targetSelection.classed('upper-fill');
                    const isLowerFill = targetSelection.classed('lower-fill');
                    const isPositionZone = targetSelection.classed('position-zone');
                    const isRrBodyDrag = targetSelection.classed('rr-body-drag');
                    const isRangeFillHit = targetSelection.classed('range-fill-hit');
                    const isRangeInfoBox = targetSelection.classed('range-info-box');
                    const isVolumeProfileSelectHit = targetSelection.classed('volume-profile-select-hit');
                    
                    // Block dragging from shape-fill elements completely
                    if (isShapeFill || isUpperFill || isLowerFill) {
                        return false;
                    }

                    // Zone background and level lines must not move the whole profile.
                    if (targetSelection.classed('volume-profile-hitbox') || targetSelection.classed('volume-profile-range')) {
                        return false;
                    }
                    if (targetSelection.classed('volume-profile-level-line')) {
                        return false;
                    }

                    if (isVolumeProfileType) {
                        const srcEvent = event.sourceEvent || event;
                        if (srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                            const [mx, my] = self._eventCanvasLocalXY(srcEvent);
                            if (self.isVolumeProfileChartPanBlockedAtPoint(mx, my)) {
                                return false;
                            }
                        }
                    }

                    // Selection-only helper zone for docked volume profile.
                    if (isVolumeProfileSelectHit) {
                        return false;
                    }

                    // TradingView-style: only allow drag from edges (lines/strokes), not filled areas
                    // Exception: position-zone elements, emoji/text elements can be dragged
                    const tagName = event.target.tagName.toLowerCase();
                    const isGannBoxBodyHit = targetSelection.classed('gann-box-hitbox')
                        || targetSelection.classed('gann-square-fixed-hitbox')
                        || targetSelection.classed('gann-fan-hitbox');
                    const isFibWedgeBodyHit = targetSelection.classed('fib-wedge-hitbox');
                    if (!self.currentTool && self._isFibLikeDrawingType(drawing.type) && !isAnyHandle && !isGannBoxBodyHit && !isFibWedgeBodyHit) {
                        const srcEvent = event.sourceEvent || event;
                        if (srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                            const [mouseX, mouseY] = self._eventCanvasLocalXY(srcEvent);
                            const onGannBody = (drawing.type === 'gann-box' || drawing.type === 'gann-square-fixed' || drawing.type === 'gann-fan')
                                && self._isPointOnGannToolBody(drawing, mouseX, mouseY)
                                && !self._isPointOnGannLevelAdjustHit(drawing, mouseX, mouseY);
                            const onFibWedgeBody = drawing.type === 'fib-wedge'
                                && self._isPointInFibWedgeBody(drawing, mouseX, mouseY);
                            if (!onGannBody && !onFibWedgeBody && !self._isPointOnFibLikeStroke(drawing, mouseX, mouseY)) {
                                return false;
                            }
                        }
                    }

                    if (targetSelection.classed('gann-fan-hitbox')) {
                        return !self.currentTool;
                    }

                    const isFibLevelHit = targetSelection.classed('fib-level-hit');
                    const isGannLevelHit = targetSelection.classed('gann-level-hit')
                        && !targetSelection.attr('data-gann-level-array');
                    const isGannBodyHit = isGannBoxBodyHit || isFibWedgeBodyHit;
                    const isFibTrendHit = targetSelection.classed('fib-circles-axis')
                        || targetSelection.classed('fib-trend-line')
                        || targetSelection.classed('fib-tz-anchor')
                        || targetSelection.classed('fib-arcs-trend')
                        || targetSelection.classed('fib-arcs-trend-hit')
                        || targetSelection.classed('fib-wedge-trend')
                        || targetSelection.classed('fib-wedge-trend-hit')
                        || targetSelection.classed('fib-fan-anchor');
                    const isLineElement = tagName === 'line' || tagName === 'path' || tagName === 'polyline';
                    const isTextElement = tagName === 'text' || tagName === 'tspan';  // Allow dragging text and tspan
                    const isShapeBorder = targetSelection.classed('shape-border');
                    const isEmojiElement = targetSelection.classed('emoji-glyph') || targetSelection.classed('emoji-background');
                    const isImageElement = drawing.type === 'image'
                        && (targetSelection.classed('image-content') || targetSelection.classed('image-placeholder'));
                    const isTextBodyHit = targetSelection.classed('text-body-hit');
                    const isNoteBodyHit = targetSelection.classed('note-body-hit');
                    const isInlineEditable = targetSelection.classed('inline-editable-text');
                    const hasStroke = targetSelection.attr('stroke') && targetSelection.attr('stroke') !== 'none';

                    if (self._isAnnotationTextLabelDrawingType(drawing.type)
                        && (isTextElement || isInlineEditable || isTextBodyHit || isNoteBodyHit)) {
                        return !self.currentTool && !isResizeHandle && !isCustomHandle && !isAnyHandle;
                    }

                    // Channel tools with fill: only drag from lines, not filled interior.
                    if (!self.currentTool && self._isWedgeChannelStrokeOnlyType(drawing.type)
                        && !isPositionZone && !isTextElement && !isEmojiElement) {
                        const srcEvent = event.sourceEvent || event;
                        const svgNode = self.svg && self.svg.node ? self.svg.node() : null;
                        if (svgNode && srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                            const [mouseX, mouseY] = self._eventCanvasLocalXY(srcEvent);
                            if (!self._isPointOnDrawingVisibleStroke(drawing, mouseX, mouseY)) {
                                return false;
                            }
                        }
                    }

                    // For circle/ellipse, enforce border-only drag by checking distance to border.
                    // This matches the rectangle behavior (only draggable from edges) even when an
                    // invisible hit ring exists.
                    if (!self.currentTool && (drawing.type === 'circle' || drawing.type === 'ellipse') && !isPositionZone && !isTextElement && !isEmojiElement) {
                        const srcEvent = event.sourceEvent || event;
                        const svgNode = self.svg && self.svg.node ? self.svg.node() : null;
                        if (svgNode && srcEvent && typeof srcEvent.clientX === 'number' && typeof srcEvent.clientY === 'number') {
                            const [mouseX, mouseY] = self._eventCanvasLocalXY(srcEvent);

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
                    const canDrag = isPositionZone || isRrBodyDrag || isRangeFillHit || isRangeInfoBox
                        || isFibLevelHit || isGannLevelHit || isGannBodyHit || isFibTrendHit || isLineElement || isShapeBorder
                        || isTextElement || isEmojiElement || isImageElement || isTextBodyHit || hasStroke;
                    
                    return !self.currentTool && !isResizeHandle && !isCustomHandle && !isAnyHandle && canDrag;
                })
                .on('start', function(event) {
                    event.sourceEvent.stopPropagation();
                    self._bodyDragDepth = (self._bodyDragDepth || 0) + 1;
                    self._commitInlineTextEditorBeforeGeometryEdit();

                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) {
                        self.chart.updateCrosshair(event.sourceEvent);
                    }

                    const targetEl = event.sourceEvent && event.sourceEvent.target;
                    horizontalAnchorPointDrag = self._isHorizontalAnchorToolType(drawing.type)
                        && self._isHorizontalAnchorElementTarget(drawing.type, targetEl);

                    if (horizontalAnchorPointDrag) {
                        if (!drawing.selected) {
                            self.selectDrawing(drawing, event.sourceEvent.shiftKey);
                        }
                        dragStartPoints = drawing.points.map(p => ({ ...p }));
                        self._bodyDragActiveDrawings = [drawing];
                        setAnchoredVWAPMovingState(drawing, true);
                        if (drawing.type === 'anchored-vwap') {
                            self._hideAnchoredVwapCurvesDuringMove(drawing);
                            self._syncAnchoredVwapAnchorDomDuringMove(drawing);
                        }
                        if (self.history) {
                            beforeState = self.history.captureState(drawing);
                        }
                        self._beginDrawingLiveInteraction();
                        return;
                    }
                    
                    // Select the drawing when starting to drag (if not already selected)
                    if (!drawing.selected) {
                        self.selectDrawing(drawing, event.sourceEvent.shiftKey);
                    }
                    
                    // Store original points and start position
                    dragStartPoints = drawing.points.map(p => ({...p}));
                    self._beginRRToolWholeDragSnapshot(drawing);
                    startDataPoint = getDragDataPoint(event);
                    const [bodySx, bodySy] = self._eventCanvasLocalXY(event.sourceEvent);
                    bodyDragStartScreen = { x: bodySx, y: bodySy };
                    bodyDragStartTransform = self._parseGroupTranslate(drawing.group ? drawing.group.attr('transform') : null);
                    
                    // Check if dragging multiple selected drawings
                    if (self.selectedDrawings.length > 1 && self.selectedDrawings.includes(drawing)) {
                        // Store initial state for all selected drawings
                        multiDragStartPoints = self.selectedDrawings.map(d => ({
                            drawing: d,
                            points: d.points.map(p => ({...p})),
                            beforeState: self.history ? self.history.captureState(d) : null,
                            startTransform: self._parseGroupTranslate(d.group ? d.group.attr('transform') : null)
                        }));
                        multiDragStartPoints.forEach((item) => self._beginRRToolWholeDragSnapshot(item.drawing));
                        self._bodyDragActiveDrawings = multiDragStartPoints.map((item) => item.drawing);
                    } else {
                        multiDragStartPoints = null;
                        self._bodyDragActiveDrawings = [drawing];
                        // Capture state for undo (single drawing)
                        if (self.history) {
                            beforeState = self.history.captureState(drawing);
                        }
                    }
                    rrLastCumulative = { x: 0, y: 0 };
                    rrLastByDrawingId = Object.create(null);
                    if (self._isTextDrawingType(drawing.type)) {
                        textBodyDragOverflowActive = true;
                    }
                    self._beginDrawingLiveInteraction();
                })
                .on('drag', function(event) {
                    if (horizontalAnchorPointDrag) {
                        self._applyHorizontalAnchorPointFromEvent(drawing, event.sourceEvent, 0);
                        return;
                    }

                    if (!dragStartPoints || !bodyDragStartScreen) return;

                    const [currentScreenX, currentScreenY] = self._eventCanvasLocalXY(event.sourceEvent);
                    let pixelDx = currentScreenX - bodyDragStartScreen.x;
                    let pixelDy = currentScreenY - bodyDragStartScreen.y;
                    if (event.sourceEvent?.shiftKey && self.angleSnapTools.includes(drawing.type)) {
                        const snapped = self._constrainPixelDeltaToSnapAngles(pixelDx, pixelDy);
                        pixelDx = snapped.dx;
                        pixelDy = snapped.dy;
                    }
                    if (self._isHorizontalAnchorToolType(drawing.type)) {
                        pixelDy = 0;
                    }

                    // Re-render from preview points (no CSS transform — transform breaks plot clip-path).
                    if (multiDragStartPoints && multiDragStartPoints.length > 1) {
                        multiDragStartPoints.forEach(item => {
                            if (!item.drawing || !Array.isArray(item.points)) return;
                            self._applyLiveDrawingMovePixels(item.drawing, item.points, pixelDx, pixelDy);
                            const previewPoints = self._translatePointsByPixels(
                                item.points,
                                pixelDx,
                                pixelDy,
                                item.drawing.type
                            );
                            if (previewPoints) {
                                self._scheduleAxisHighlightsDuringDrag(item.drawing, previewPoints);
                                self._notifyV9DrawingGeometryLive(item.drawing, previewPoints);
                            }
                        });
                    } else if (dragStartPoints) {
                        self._applyLiveDrawingMovePixels(drawing, dragStartPoints, pixelDx, pixelDy);
                        const previewPoints = self._translatePointsByPixels(
                            dragStartPoints,
                            pixelDx,
                            pixelDy,
                            drawing.type
                        );
                        if (previewPoints) {
                            self._scheduleAxisHighlightsDuringDrag(drawing, previewPoints);
                            self._notifyV9DrawingGeometryLive(drawing, previewPoints);
                        }
                    }
                    if (event.sourceEvent) {
                        self._refreshPointerChromeDuringGeometryDrag(event.sourceEvent);
                    }
                })
                .on('end', function(event) {
                    self._clearAxisHighlightDragState();
                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) {
                        self.chart.updateCrosshair(event.sourceEvent);
                    }

                    if (horizontalAnchorPointDrag) {
                        self._applyHorizontalAnchorPointFromEvent(drawing, event.sourceEvent, 0);
                        setAnchoredVWAPMovingState(drawing, false);
                        if (self.history && beforeState) {
                            self.history.recordModify(drawing, beforeState);
                        }
                        self._bodyDragDepth = Math.max(0, (self._bodyDragDepth || 0) - 1);
                        self._bodyDragActiveDrawings = null;
                        self._endDrawingLiveInteraction();
                        if (typeof drawing.recalculateTimestamps === 'function') {
                            drawing.recalculateTimestamps();
                        }
                        self.renderDrawing(drawing);
                        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
                            drawing.showAxisHighlights();
                        }
                        self.saveDrawings();
                        const idx = self.drawings.indexOf(drawing);
                        if (self.chart.broadcastDrawingChange && idx > -1) {
                            self.chart.broadcastDrawingChange('update', drawing, idx);
                        }
                        horizontalAnchorPointDrag = false;
                        dragStartPoints = null;
                        beforeState = null;
                        return;
                    }

                    // Record modification for undo/redo
                    if (multiDragStartPoints && multiDragStartPoints.length > 1) {
                        multiDragStartPoints.forEach(item => {
                            const didMove = self._commitDrawingPixelDragDelta(
                                item.drawing,
                                item.points,
                                item.startTransform
                            );
                            self._clearRRToolWholeDragSnapshot(item.drawing);
                            if (didMove && self.history && item.beforeState) {
                                self.history.recordModify(item.drawing, item.beforeState);
                            }
                            if (didMove) {
                                self._refreshDrawingTimestampAnchors(item.drawing);
                                self._renderDrawingAfterGeometryCommit(item.drawing);
                            }
                            setAnchoredVWAPMovingState(item.drawing, false);
                        });
                        multiDragStartPoints = null;
                    } else if (dragStartPoints) {
                        const didMove = self._commitDrawingPixelDragDelta(
                            drawing,
                            dragStartPoints,
                            bodyDragStartTransform
                        );
                        self._clearRRToolWholeDragSnapshot(drawing);
                        if (didMove && self.history && beforeState) {
                            self.history.recordModify(drawing, beforeState);
                        }
                        if (didMove) {
                            self._refreshDrawingTimestampAnchors(drawing);
                            self._renderDrawingAfterGeometryCommit(drawing);
                        }
                        setAnchoredVWAPMovingState(drawing, false);
                        beforeState = null;
                    }
                    
                    dragStartPoints = null;
                    startDataPoint = null;
                    bodyDragStartScreen = null;
                    bodyDragStartTransform = null;
                    textBodyDragOverflowActive = false;
                    self._bodyDragDepth = Math.max(0, (self._bodyDragDepth || 0) - 1);
                    self._bodyDragActiveDrawings = null;
                    self._endDrawingLiveInteraction();
                    self.saveDrawings();
                    
                    // Broadcast update to other panels
                    const index = self.drawings.indexOf(drawing);
                    if (self.chart.broadcastDrawingChange && index > -1) {
                        self.chart.broadcastDrawingChange('update', drawing, index);
                    }
                    
                    // [debug removed]
                });

        dragElements.call(bodyDrag);

        this._setupGannLevelDrag(drawing);
    }

    _isGannLevelAdjustDrawingType(type) {
        return type === 'gann-box' || type === 'gann-square-fixed' || type === 'gann-fan';
    }

    _isPointOnGannLevelAdjustHit(drawing, mouseX, mouseY) {
        if (!drawing?.group || !this._isGannLevelAdjustDrawingType(drawing.type)) return false;
        if (drawing.type === 'gann-fan') return false;

        const svgPoint = this.svg?.node?.()?.createSVGPoint?.();
        if (svgPoint) {
            svgPoint.x = mouseX;
            svgPoint.y = mouseY;
        }
        const lineHitTolerance = 14;

        for (const element of drawing.group.selectAll('line.gann-level-hit[data-gann-level-array], path.gann-level-hit[data-gann-level-array]').nodes()) {
            const elementSel = d3.select(element);
            if (elementSel.style('opacity') === '0') continue;

            if (svgPoint && typeof element.isPointInStroke === 'function' && element.isPointInStroke(svgPoint)) {
                return true;
            }

            const x1 = parseFloat(element.getAttribute('x1'));
            const y1 = parseFloat(element.getAttribute('y1'));
            const x2 = parseFloat(element.getAttribute('x2'));
            const y2 = parseFloat(element.getAttribute('y2'));
            if ([x1, y1, x2, y2].every(Number.isFinite)) {
                const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 16;
                if (distance <= Math.max(lineHitTolerance, (strokeWidth / 2) + 0.5)) return true;
            }
        }
        return false;
    }

    /** True when pointer is inside the Fib Wedge sector (whole-tool move, not level drag). */
    _isPointInFibWedgeBody(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'fib-wedge') return false;
        const scales = this._getGannDrawingScales();
        if (!scales || typeof drawing.isPointInsideBody !== 'function') return false;
        return drawing.isPointInsideBody(mouseX, mouseY, scales);
    }

    /** True when pointer is inside the Gann Box / Square / Fan body (whole-tool move, not level drag). */
    _isPointOnGannToolBody(drawing, mouseX, mouseY) {
        if (!drawing || !this._getGannDrawingScales()) return false;
        const scales = this._getGannDrawingScales();
        if (drawing.type === 'gann-fan') {
            const layout = typeof drawing.getPixelLayout === 'function'
                ? drawing.getPixelLayout(scales)
                : null;
            if (!layout) return false;
            const { x1, y1, xBound, yMin, yMax } = layout;
            if (![x1, y1, xBound, yMin, yMax].every(Number.isFinite)) return false;
            const px = mouseX;
            const py = mouseY;
            const inTri = (ax, ay, bx, by, cx, cy) => {
                const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
                const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
                const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
                const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
                const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
                return !(hasNeg && hasPos);
            };
            return inTri(x1, y1, xBound, yMin, xBound, yMax);
        }
        if (drawing.type === 'gann-box' || drawing.type === 'gann-square-fixed') {
            const layout = typeof drawing.getPixelLayout === 'function'
                ? drawing.getPixelLayout(scales)
                : null;
            if (!layout) return false;
            if (drawing.type === 'gann-box') {
                return mouseX >= layout.left && mouseX <= layout.right
                    && mouseY >= layout.top && mouseY <= layout.bottom;
            }
            const right = layout.left + layout.size;
            const bottom = layout.top + layout.size;
            return mouseX >= layout.left && mouseX <= right
                && mouseY >= layout.top && mouseY <= bottom;
        }
        return false;
    }

    _getGannDrawingScales() {
        if (!this.chart) return null;
        return { xScale: this.chart.xScale, yScale: this.chart.yScale, chart: this.chart };
    }

    _parseGannLevelHitMeta(targetSel) {
        if (!targetSel || !targetSel.attr) return null;
        const arrayKey = targetSel.attr('data-gann-level-array');
        const idxRaw = targetSel.attr('data-gann-level-index');
        const orient = targetSel.attr('data-gann-level-orient');
        if (!arrayKey || idxRaw == null || idxRaw === '') return null;
        const idx = parseInt(idxRaw, 10);
        if (!Number.isFinite(idx) || idx < 0) return null;
        return { arrayKey, idx, orient: orient || 'h' };
    }

    _clampGannUnitRatio(v) {
        return Math.max(0, Math.min(1, v));
    }

    _computeGannLevelValueFromPointer(drawing, meta, mouseX, mouseY) {
        const scales = this._getGannDrawingScales();
        if (!scales || !drawing || !meta) return null;
        const layout = typeof drawing.getPixelLayout === 'function'
            ? drawing.getPixelLayout(scales)
            : null;
        if (!layout) return null;

        const orient = meta.orient;
        let next = null;

        if (orient === 'h') {
            if (layout.height != null && layout.height > 0) {
                next = (mouseY - layout.top) / layout.height;
            } else if (layout.size != null && layout.size > 0) {
                next = (mouseY - layout.top) / layout.size;
            }
            return next != null && Number.isFinite(next) ? this._clampGannUnitRatio(next) : null;
        }
        if (orient === 'v') {
            if (layout.width != null && layout.width > 0) {
                next = (mouseX - layout.left) / layout.width;
            } else if (layout.size != null && layout.size > 0) {
                next = (mouseX - layout.left) / layout.size;
            }
            return next != null && Number.isFinite(next) ? this._clampGannUnitRatio(next) : null;
        }
        if (orient === 'fan-h' && layout.size > 0) {
            const sy = layout.sy || 1;
            next = (mouseY - layout.anchorY) / (sy * layout.size);
            return Number.isFinite(next) ? this._clampGannUnitRatio(next) : null;
        }
        if (orient === 'fan-v' && layout.size > 0) {
            const sx = layout.sx || 1;
            next = (mouseX - layout.anchorX) / (sx * layout.size);
            return Number.isFinite(next) ? this._clampGannUnitRatio(next) : null;
        }
        if (orient === 'fan-multiplier' && layout.xBound != null && layout.baseSlope != null) {
            const dx = layout.xBound - layout.x1;
            if (Math.abs(dx) < 1e-6) return null;
            const slope = (mouseY - layout.y1) / dx;
            if (!Number.isFinite(slope) || Math.abs(layout.baseSlope) < 1e-9) return null;
            next = slope / layout.baseSlope;
            return Number.isFinite(next) ? Math.max(0.001, Math.min(16, next)) : null;
        }
        return null;
    }

    _setupGannLevelDrag(drawing) {
        if (!this._isGannLevelAdjustDrawingType(drawing.type) || !drawing.group) return;
        // Gann Fan: only anchor handles + settings adjust levels (per-ray drag skews all rays).
        if (drawing.type === 'gann-fan') return;

        const self = this;
        const levelHits = drawing.group.selectAll('.gann-level-hit[data-gann-level-array]');
        levelHits.on('mousedown.gann-level-drag', null);

        levelHits.on('mousedown.gann-level-drag', function(event) {
            if (self.currentTool) return;
            if (event.ctrlKey) return;
            event.stopPropagation();
            event.preventDefault();

            const targetSel = d3.select(event.currentTarget);
            const dragMeta = self._parseGannLevelHitMeta(targetSel);
            if (!dragMeta) return;

            if (!drawing.selected) {
                self.selectDrawing(drawing, event.shiftKey);
            }

            const arr = drawing.style?.[dragMeta.arrayKey];
            const row = Array.isArray(arr) ? arr[dragMeta.idx] : null;
            if (!row) return;

            const startValue = parseFloat(row.value);
            const beforeState = self.history ? self.history.captureState(drawing) : null;
            let moved = false;

            const applyPointer = (ev) => {
                const [mx, my] = self._eventCanvasLocalXY(ev);
                const nextVal = self._computeGannLevelValueFromPointer(drawing, dragMeta, mx, my);
                if (nextVal == null || !Number.isFinite(nextVal)) return;
                const levels = drawing.style?.[dragMeta.arrayKey];
                if (!Array.isArray(levels) || !levels[dragMeta.idx]) return;
                const rounded = Math.round(nextVal * 1000) / 1000;
                if (Math.abs(parseFloat(levels[dragMeta.idx].value) - rounded) < 1e-6) return;
                const nextRow = { ...levels[dragMeta.idx], value: rounded };
                if (drawing.type === 'gann-fan' && dragMeta.arrayKey === 'fanLevels') {
                    const FanCls = typeof GannFanTool !== 'undefined' ? GannFanTool : null;
                    if (FanCls && typeof FanCls.labelForValue === 'function') {
                        const lbl = FanCls.labelForValue(rounded);
                        if (lbl) nextRow.label = lbl;
                    }
                }
                levels[dragMeta.idx] = nextRow;
                moved = true;
                self.renderDrawing(drawing, { skipInteraction: true });
                if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
                    drawing.showAxisHighlights();
                }
            };

            const onMove = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                applyPointer(ev);
            };

            const onUp = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);

                if (drawing.selected) {
                    self.setupDrawingInteraction(drawing);
                }

                if (moved && self.history && beforeState) {
                    self.history.recordModify(drawing, beforeState);
                }
                if (moved) {
                    self.saveDrawings();
                    const index = self.drawings.indexOf(drawing);
                    if (self.chart?.broadcastDrawingChange && index > -1) {
                        self.chart.broadcastDrawingChange('update', drawing, index);
                    }
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('drawingsChanged'));
                    }
                }
            };

            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);
        });
    }

    _startDirectMoveDrag(drawingOrDrawings, event) {
        this._stopDirectMoveDrag();
        this._cancelChartCtrlMarqueeIfActive();

        if (this.isDragging) {
            this.endDrag();
        }

        const drawings = (Array.isArray(drawingOrDrawings) ? drawingOrDrawings : [drawingOrDrawings])
            .filter(d => d && d.type !== 'anchored-vwap' && d.type !== 'anchored-volume-profile');
        if (!drawings || drawings.length === 0) return;

        drawings.forEach((d) => {
            if (d?.group?.attr('transform')) {
                this._commitStaleDrawingGroupTransform(d);
            }
        });

        const svgNode = this.svg && this.svg.node ? this.svg.node() : null;
        if (svgNode && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
            const [startMouseX, startMouseY] = this._eventCanvasLocalXY(event);
            const shouldBlockVolumeProfileTextDirectMove = drawings.some((d) =>
                this.isVolumeProfileChartPanBlockedAtPoint(startMouseX, startMouseY)
                || this.isVolumeProfileZoneFillHit(d, startMouseX, startMouseY)
                || this.isVolumeProfileLevelLineHit(d, startMouseX, startMouseY)
                || this.isVolumeProfileValuesLabelHit(d, startMouseX, startMouseY)
            );
            if (shouldBlockVolumeProfileTextDirectMove) {
                return;
            }
            // Single selection: stroke-only tools (Elliott, fib, etc.) must be grabbed on a visible stroke.
            // Multi-selection: move the whole group when any selected drawing is under the pointer —
            // do not require every selected stroke-only shape to contain the click (they rarely overlap).
            let shouldBlockStrokeOnlyToolBodyMove = false;
            if (drawings.length <= 1) {
                shouldBlockStrokeOnlyToolBodyMove = drawings.some((d) => {
                    if (d.type === 'gann-box' || d.type === 'gann-square-fixed') {
                        return this._isPointOnGannLevelAdjustHit(d, startMouseX, startMouseY);
                    }
                    return this._drawingRequiresStrokeOnlyDrag(d.type)
                        && !this._isPointOnDrawingVisibleStroke(d, startMouseX, startMouseY);
                });
            } else {
                shouldBlockStrokeOnlyToolBodyMove = drawings.some((d) =>
                    (d.type === 'gann-box' || d.type === 'gann-square-fixed')
                    && this._isPointOnGannLevelAdjustHit(d, startMouseX, startMouseY)
                );
            }
            if (shouldBlockStrokeOnlyToolBodyMove) {
                return;
            }
        }

        const [startScreenX, startScreenY] = this._eventCanvasLocalXY(event);
        const startScreen = { x: startScreenX, y: startScreenY };
        const startStates = drawings.map(d => ({
            drawing: d,
            points: d.points.map(p => ({ ...p })),
            beforeState: this.history ? this.history.captureState(d) : null,
            startTransform: this._parseGroupTranslate(d.group ? d.group.attr('transform') : null)
        }));
        startStates.forEach((item) => this._beginRRToolWholeDragSnapshot(item.drawing));
        this._directMoveDrawings = drawings;
        this._directMovePendingFrame = false;
        this._directMoveLastEvent = null;
        this._beginDrawingLiveInteraction();
        let moved = false;

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'move';
        if (this.svg) this.svg.style('cursor', 'move');

        const applyDirectMoveTransform = (ev) => {
            if (!ev || !this._directMoveMoveHandler) return;
            const [currentScreenX, currentScreenY] = this._eventCanvasLocalXY(ev);
            const pixelDx = currentScreenX - startScreen.x;
            const pixelDy = currentScreenY - startScreen.y;
            if (pixelDx !== 0 || pixelDy !== 0) moved = true;
            startStates.forEach(item => {
                if (!item.drawing || !Array.isArray(item.points)) return;
                this._applyLiveDrawingMovePixels(item.drawing, item.points, pixelDx, pixelDy);
                const previewPoints = this._translatePointsByPixels(
                    item.points,
                    pixelDx,
                    pixelDy,
                    item.drawing.type
                );
                if (previewPoints) {
                    this._scheduleAxisHighlightsDuringDrag(item.drawing, previewPoints);
                }
            });
        };

        this._directMoveMoveHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._directMoveLastEvent = e;
            if (this._directMovePendingFrame) return;
            this._directMovePendingFrame = true;
            requestAnimationFrame(() => {
                this._directMovePendingFrame = false;
                const ev = this._directMoveLastEvent;
                applyDirectMoveTransform(ev);
                this._refreshPointerChromeDuringGeometryDrag(ev);
            });
        };

        this._directMoveUpHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._directMovePendingFrame && this._directMoveLastEvent) {
                applyDirectMoveTransform(this._directMoveLastEvent);
            }
            this._stopDirectMoveDrag({ skipLiveInteractionEnd: true });

            if (this.chart && typeof this.chart.updateCrosshair === 'function') {
                this.chart.updateCrosshair(e);
            }

            startStates.forEach(item => {
                const didMove = this._commitDrawingPixelDragDelta(
                    item.drawing,
                    item.points,
                    item.startTransform
                );
                this._clearRRToolWholeDragSnapshot(item.drawing);
                if (didMove && moved && this.history && item.beforeState) {
                    this.history.recordModify(item.drawing, item.beforeState);
                }
                if (didMove) {
                    this._refreshDrawingTimestampAnchors(item.drawing);
                    this._renderDrawingAfterGeometryCommit(item.drawing);
                }

                const index = this.drawings.indexOf(item.drawing);
                if (didMove && this.chart && this.chart.broadcastDrawingChange && index > -1) {
                    this.chart.broadcastDrawingChange('update', item.drawing, index);
                }
            });

            if (moved) {
                this.saveDrawings();
            }
            this._endDrawingLiveInteraction();
        };

        document.addEventListener('mousemove', this._directMoveMoveHandler, true);
        document.addEventListener('mouseup', this._directMoveUpHandler, true);
    }

    /**
     * When the DOM target misses R/R handles (transparent strokes / zones pass-through), map (mx,my) to the
     * same handle roles as {@link BaseRiskRewardTool} (.rr-primary-entry-drag-hit, .rr-extra-drag-hit).
     * Includes primary entry, extra TP/SL/entry lines (E2, TP2, …) so they drag like multi-TP.
     */
    _findRiskRewardInteractiveHandleRole(drawing, mouseX, mouseY) {
        if (!drawing || (drawing.type !== 'long-position' && drawing.type !== 'short-position')) return null;
        if (!drawing.selected) return null;
        const meta = drawing.lastRenderMeta;
        const chart = this.chart;
        if (!meta || !Number.isFinite(meta.zoneX1) || !Number.isFinite(meta.zoneX2) || !chart || typeof chart.yScale !== 'function') {
            return null;
        }
        const x1 = meta.zoneX1;
        const x2Full = meta.zoneX2;
        // RR + buttons render outside the zone; primary entry hit can span to zoneX2.
        const x2NoPlus = meta.zoneX2;
        if (!(x2Full > x1)) return null;

        const hits = [];
        const pushHit = (role, py, halfH, xMax) => {
            if (Math.abs(mouseY - py) > halfH) return;
            if (mouseX < x1 || mouseX > xMax) return;
            hits.push({ role, dist: Math.abs(mouseY - py) });
        };

        const hasExtraEntries = (drawing.meta?.extraEntries || []).length > 0;
        // Match .rr-primary-entry-drag-hit vertical extent (see BaseRiskRewardTool.render).
        const primaryHalfH = hasExtraEntries ? 10 : 9;

        const p0 = drawing.points && drawing.points[0];
        if (p0 && Number.isFinite(p0.y)) {
            pushHit('rr-primary-entry', chart.yScale(p0.y), primaryHalfH, x2NoPlus);
        }

        const primaryLegHalfH = 8;
        const p1 = drawing.points && drawing.points[1];
        if (p1 && Number.isFinite(p1.y)) {
            pushHit('rr-primary-stop', chart.yScale(p1.y), primaryLegHalfH, x2Full);
        }
        const p2 = drawing.points && drawing.points[2];
        if (p2 && Number.isFinite(p2.y)) {
            pushHit('rr-primary-tp', chart.yScale(p2.y), primaryLegHalfH, x2Full);
        }

        const halfExtra = 4;
        const halfExtraTp = 12;
        const halfExtraEntry = 12;
        (drawing.meta?.extraTargets || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            pushHit(`rr-extra-target-${idx}`, chart.yScale(row.y), halfExtraTp, x2Full);
        });
        (drawing.meta?.extraEntries || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            pushHit(`rr-extra-entry-${idx}`, chart.yScale(row.y), halfExtraEntry, x2Full);
        });
        (drawing.meta?.extraStops || []).forEach((row, idx) => {
            if (!row || !Number.isFinite(row.y)) return;
            pushHit(`rr-extra-stop-${idx}`, chart.yScale(row.y), halfExtra, x2Full);
        });
        if (drawing.meta?.rrBreakevenLine && Number.isFinite(drawing.meta.rrBreakevenLine.y)) {
            pushHit('rr-be-line', chart.yScale(drawing.meta.rrBreakevenLine.y), halfExtra, x2Full);
        }

        if (!hits.length) return null;
        hits.sort((a, b) => a.dist - b.dist);
        // Closest handle wins so the primary entry line is draggable when it is nearer than E2/E3
        // (the old E2-preference override made the main entry feel stuck when levels were close).
        return hits[0].role;
    }

    /** Keep resize targets above rebuilt shape borders during live edits / hover. */
    _raiseResizeHandles(drawing) {
        if (!drawing?.group || drawing.group.empty()) return;
        drawing.group.selectAll('.resize-handle-group').raise();
        drawing.group.selectAll('.custom-handle').raise();
    }

    /** True when (mouseX, mouseY) is inside a visible resize-handle hit disc. */
    _isPointOnResizeHandle(drawing, mouseX, mouseY) {
        if (!drawing?.group || drawing.group.empty()) return false;
        const nodes = drawing.group.selectAll('.resize-handle-hit').nodes();
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node || !node.getAttribute) continue;
            const pe = node.style && node.style.pointerEvents;
            if (pe === 'none') continue;
            const cx = parseFloat(node.getAttribute('cx'));
            const cy = parseFloat(node.getAttribute('cy'));
            const r = parseFloat(node.getAttribute('r')) || 14;
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) continue;
            const dx = mouseX - cx;
            const dy = mouseY - cy;
            if ((dx * dx) + (dy * dy) <= r * r) return true;
        }
        return false;
    }

    _prepareDrawingForHandleDrag(drawing, event) {
        if (!drawing) return;
        if (!drawing.selected
            || this.selectedDrawings.length !== 1
            || this.selectedDrawings[0] !== drawing) {
            this.deselectAll({ forSelectionChange: true });
            drawing.select({ skipAxisHighlights: true });
            this.selectedDrawing = drawing;
            this.selectedDrawings = [drawing];
        }
        if (drawing.group && !drawing.group.empty()) {
            drawing.group.selectAll('.resize-handle').style('pointer-events', 'none');
            drawing.group.selectAll('.resize-handle-hit, .custom-handle').style('pointer-events', 'all');
            drawing.group.selectAll('.shape-border-hit').style('pointer-events', 'none');
            if (drawing.type === 'image') {
                drawing.group.selectAll('.image-content, .image-placeholder')
                    .style('pointer-events', 'none');
            }
            this._raiseResizeHandles(drawing);
        }
        if (this._hoveredDrawing === drawing) {
            this._hoveredDrawing = null;
            this._hoverHandleBoundDrawingId = null;
            this._hoverHandleBoundGroupNode = null;
        }
    }

    /**
     * Setup drag behavior for resize handles
     */
    setupHandleDrag(drawing) {
        const self = this;

        // Plain text is move/select only — no corner/side resize handles.
        if (drawing && drawing.type === 'text') return;

        const allowResizeHandleDragWhenToolActive = function (event) {
            if (!self.currentTool) return true;
            const src = (event && event.sourceEvent) ? event.sourceEvent : event;
            const t = src && src.target;
            const onDrawingHandle = !!(t && t.closest && t.closest(
                '.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle, .rr-plus-btn'
            ));
            if (onDrawingHandle) return true;
            if (self.currentTool !== 'brush' && self.currentTool !== 'highlighter') return false;
            return !!(t && t.closest && t.closest('.resize-handle, .resize-handle-hit, .resize-handle-group, .custom-handle'));
        };
        
        const applyPointHandleDrag = (point, drawing, index, shiftKey) => {
            if (typeof drawing.onPointHandleDrag === 'function') {
                point = self._applyShiftAngleConstraintForResize(drawing, index, point, shiftKey);
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
                    self.scheduleRenderDrawing(drawing);
                    return true;
                }
            }
            return false;
        };

        const handles = drawing.type === 'anchored-volume-profile'
            ? drawing.group.selectAll('.resize-handle-hit[data-point-index="0"], .resize-handle[data-point-index="0"]')
            : drawing.group.selectAll('.resize-handle-hit, .resize-handle');
        handles.on('.drag', null);

        handles.call(
            d3.drag()
                .filter(allowResizeHandleDragWhenToolActive)
                .on('start', function(event) {
                    event.sourceEvent.stopPropagation();
                    const isFreehandStroke = drawing.type === 'brush' || drawing.type === 'highlighter';
                    if (isFreehandStroke) {
                        self._prepareDrawingForHandleDrag(drawing, event);
                        self._beginDrawingLiveInteraction();
                        self._freehandHandleWholeMove = {
                            drawing,
                            startPoints: drawing.points.map(p => ({ ...p })),
                            startDataPoint: self.getDataPoint(event.sourceEvent, drawing.type),
                            beforeState: self.history ? self.history.captureState(drawing) : null
                        };
                        const cvs = (self.chart && self.chart.canvas) || document.getElementById('chartCanvas');
                        if (cvs) cvs.style.cursor = 'move';
                        self.svg.style('cursor', 'move');
                        d3.select(this).style('cursor', 'move');
                        return;
                    }
                    const handleRole = d3.select(this).attr('data-handle-role');
                    const index = parseInt(d3.select(this).attr('data-point-index'));
                    
                    const baseProto = (typeof BaseDrawing !== 'undefined' && BaseDrawing.prototype) ? BaseDrawing.prototype : null;
                    const hasCustomOverride = baseProto
                        ? drawing.handleCustomHandleDrag !== baseProto.handleCustomHandleDrag
                        : (typeof drawing.handleCustomHandleDrag === 'function');
                    const hasPointOverride = baseProto
                        ? drawing.onPointHandleDrag !== baseProto.onPointHandleDrag
                        : (typeof drawing.onPointHandleDrag === 'function');

                    self._prepareDrawingForHandleDrag(drawing, event);
                    if (handleRole && hasCustomOverride) {
                        self.resizingHandleRole = handleRole || null;
                        self._customHandlePointerSource = 'd3';
                        self.startCustomHandleDrag(drawing, handleRole, event, index);
                    } else if (!isNaN(index) && hasCustomOverride && !hasPointOverride) {
                        // Tools that rely on custom drag math but expose point-index handles.
                        self.resizingHandleRole = handleRole || null;
                        self._customHandlePointerSource = 'd3';
                        self.startCustomHandleDrag(drawing, index, event, index);
                    } else {
                        self.resizingHandleRole = handleRole || null;
                        self._resizePointerSource = 'd3';
                        self.startHandleDrag(drawing, index, event);
                    }
                    const rrPriceHandle = (drawing.type === 'long-position' || drawing.type === 'short-position')
                        && !isNaN(index) && index >= 0 && index <= 2;
                    d3.select(this).style('cursor', rrPriceHandle ? 'ns-resize' : 'ew-resize');
                })
                .on('drag', function(event) {
                    if (self._resizePointerSource === 'document') return;
                    if (self.chart && typeof self.chart.updateCrosshair === 'function' && event.sourceEvent) self.chart.updateCrosshair(event.sourceEvent);
                    const fm = self._freehandHandleWholeMove;
                    if (fm && fm.drawing === drawing) {
                        const cur = self.getDataPoint(event.sourceEvent, drawing.type);
                        const rawDx = cur.x - fm.startDataPoint.x;
                        const rawDy = cur.y - fm.startDataPoint.y;
                        const { dx: constrainedDx, dy: constrainedDy } = self.getConstrainedDragDelta(drawing, rawDx, rawDy);
                        drawing.points = fm.startPoints.map(p => ({
                            x: p.x + constrainedDx,
                            y: p.y + constrainedDy
                        }));
                        self.clampDrawingPointsToCandleRange(drawing);
                        self.scheduleRenderDrawing(drawing);
                        self._broadcastLiveEditUpdate(drawing);
                        return;
                    }
                    // Check if we're in custom handle drag mode
                    if (self.isCustomHandleDrag) {
                        const src = event.sourceEvent;
                        if (src) self._lastMouseEvent = src;
                        self.handleCustomHandleDrag(event);
                        return;
                    }
                    
                    const index = self.resizingPointIndex;
                    let point = self.getDataPoint(event.sourceEvent, drawing.type);

                    if (!applyPointHandleDrag(point, drawing, index, event.sourceEvent.shiftKey)) {
                        self._assignResizePoint(
                            drawing,
                            index,
                            point,
                            event.sourceEvent.shiftKey,
                            event.sourceEvent
                        );
                        self.scheduleRenderDrawing(drawing);
                        self._broadcastLiveEditUpdate(drawing);
                    }
                })
                .on('end', function(event) {
                    const fm = self._freehandHandleWholeMove;
                    if (fm && fm.drawing === drawing) {
                        if (self.history && fm.beforeState) {
                            const moved = drawing.points.some((p, i) =>
                                p.x !== fm.startPoints[i].x || p.y !== fm.startPoints[i].y
                            );
                            if (moved) {
                                self.history.recordModify(drawing, fm.beforeState);
                            }
                        }
                        if (typeof drawing.recalculateTimestamps === 'function') {
                            drawing.recalculateTimestamps();
                        }
                        self.persistPositionToolDefaults(drawing);
                        self.saveDrawings();
                        const di = self.drawings.indexOf(drawing);
                        if (self.chart && self.chart.broadcastDrawingChange && di > -1) {
                            self.chart.broadcastDrawingChange('update', drawing, di);
                        }
                        self._freehandHandleWholeMove = null;
                        self._endDrawingLiveInteraction();
                        const cvs = (self.chart && self.chart.canvas) || document.getElementById('chartCanvas');
                        if (cvs) cvs.style.cursor = '';
                        self.svg.style('cursor', '');
                        d3.select(this).style('cursor', null);
                        return;
                    }
                    d3.select(this).style('cursor', 'ew-resize');
                    // Check if we're ending a custom handle drag
                    if (self.isCustomHandleDrag) {
                        self.endCustomHandleDrag(event);
                    } else {
                        self.endHandleDrag(drawing);
                    }
                })
        );

        const customHandles = drawing.group.selectAll('.custom-handle');
        customHandles.on('.drag', null);
        customHandles.call(
            d3.drag()
                .filter(allowResizeHandleDragWhenToolActive)
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
    _resetResizeHandleDom(drawing) {
        if (!drawing?.group || drawing.group.empty() || !this.chart?.xScale || !this.chart?.yScale) return;
        drawing.group.selectAll('.resize-handle, .resize-handle-hit, .resize-handle-group').remove();
        const scales = {
            xScale: this.chart.xScale,
            yScale: this.chart.yScale,
            chart: this.chart
        };
        if (typeof drawing._recreateDirectResizeHandles === 'function') {
            drawing._recreateDirectResizeHandles(scales);
        } else if (typeof drawing.createHandles === 'function') {
            drawing.createHandles(drawing.group, scales);
        }
    }

    startHandleDrag(drawing, pointIndex, event) {
        this._commitInlineTextEditorBeforeGeometryEdit();
        this._commitStaleDrawingGroupTransform(drawing);
        const src = event && (event.sourceEvent || event);
        if (src) this._lastMouseEvent = src;
        this._beginDrawingLiveInteraction();
        this.isResizing = true;
        this.resizingDrawing = drawing;
        this.resizingPointIndex = pointIndex;
        if (this._supportsLiveHandleGeometryPatch(drawing)) {
            this._resetResizeHandleDom(drawing);
        }
        if (this._resizePointerSource === 'document') {
            if (drawing.group && !drawing.group.empty()) {
                drawing.group.selectAll('.resize-handle-hit, .resize-handle').on('.drag', null);
            }
        } else {
            this.setupHandleDrag(drawing);
        }

        if (this.isVolumeProfileToolType(drawing.type)) {
            drawing._isActiveResizing = true;
            drawing._activeResizingPointIndex = Number.isFinite(pointIndex) ? pointIndex : null;
        }

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'ew-resize';
        this.svg.style('cursor', 'ew-resize');
        this._captureShiftResizeAnchorPoints(drawing);
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
        const src = event && (event.sourceEvent || event);
        if (!src) return;
        this._applyLiveResizeFromPointerEvent(src);
    }

    /**
     * End handle drag
     */
    endHandleDrag(drawing) {
        if (!drawing || !this.isResizing || this.resizingDrawing !== drawing) return;

        // Record modification for undo/redo
        if (this.history && this.resizeBeforeState) {
            this.history.recordModify(drawing, this.resizeBeforeState);
        }

        this._snapDrawingPointsX(drawing);
        this._syncHorizontalAnchorToolPointY(drawing);

        const isVolumeProfileResize = !!(drawing && this.isVolumeProfileToolType(drawing.type));
        if (isVolumeProfileResize) {
            drawing._isActiveResizing = false;
            drawing._activeResizingPointIndex = null;
        }

        if (typeof drawing.recalculateTimestamps === 'function') {
            try { drawing.recalculateTimestamps(); } catch (_) { /* ignore */ }
        }

        this.isResizing = false;
        this.resizingDrawing = null;
        this.resizingPointIndex = null;
        this.resizingHandleRole = null;
        this.resizeBeforeState = null;
        this._resizePointerSource = null;
        this._clearShiftResizeAnchorPoints();
        this._clearAxisHighlightDragState();
        this._endDrawingLiveInteraction();

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        this.svg.style('cursor', '');

        if (drawing?.group && !drawing.group.empty()) {
            drawing.group.selectAll('.shape-border-hit')
                .style('pointer-events', 'stroke');
        }

        this.renderDrawing(drawing, { skipTimestampSync: true });

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
        this._commitInlineTextEditorBeforeGeometryEdit();
        this._commitStaleDrawingGroupTransform(drawing);
        const src = event && (event.sourceEvent || event);
        if (src) this._lastMouseEvent = src;
        this._beginDrawingLiveInteraction();
        this.isCustomHandleDrag = true;
        this.customHandleDrawing = drawing;
        this.customHandleRole = handleRole;

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        const hr = handleRole;
        const verticalRr = hr === 'rr-primary-entry'
            || hr === 'rr-primary-stop'
            || hr === 'rr-primary-tp'
            || hr === 'rr-be-line'
            || (typeof hr === 'string' && hr.startsWith('rr-extra-'));
        const cursor = verticalRr ? 'ns-resize' : 'ew-resize';
        if (canvas) canvas.style.cursor = cursor;
        this.svg.style('cursor', cursor);
        this.customHandlePointIndex = pointIndex; // Store point index for arc/curve
        this.customHandleStart = this.collectHandleContext(event);
        this._captureShiftResizeAnchorPoints(drawing);
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
        const sourceEvent = event && (event.sourceEvent || event);
        if (sourceEvent) this._lastMouseEvent = sourceEvent;

        const context = this.collectHandleContext(event);
        const drawing = this.customHandleDrawing;
        const handleRole = this.customHandleRole;
        
        // Add pointIndex to context for arc/curve sensitivity
        context.pointIndex = this.customHandlePointIndex;
        
        const pi = context.pointIndex;
        context.dataPoint = this._applyShiftAngleConstraintForResize(
            drawing,
            pi,
            context.dataPoint,
            context.shiftKey
        );
        context.point = context.dataPoint;
        
        if (typeof drawing.handleCustomHandleDrag === 'function') {
            drawing.handleCustomHandleDrag(handleRole, context);
            if (Array.isArray(drawing.points)) {
                drawing.points.forEach((_, i) => this._refreshLiveTimestampForPoint(drawing, i));
            }
        }
        // Bar snap runs once on endCustomHandleDrag — not each frame (avoids "stuck" edit).

        // Always re-render during drag (f619ece: synchronous full render for bezier/path tools).
        this._skipHandleSetup = true;
        this.renderDrawing(
            drawing,
            this._needsFullRenderDuringHandleEdit(drawing)
                ? this._getFullHandleEditRenderOpts(drawing)
                : { skipInteraction: true, liveRender: true, skipTimestampSync: true }
        );
        this._skipHandleSetup = false;
        this._broadcastLiveEditUpdate(drawing);
        
        // Dispatch event to sync UI with drawing style changes (e.g., font size during text resize)
        window.dispatchEvent(new CustomEvent('drawingStyleChanged', { 
            detail: { drawing, property: 'fontSize', value: drawing.style.fontSize } 
        }));
    }

    endCustomHandleDrag(event) {
        if (!this.isCustomHandleDrag || !this.customHandleDrawing) return;
        const context = this.collectHandleContext(event);
        const drawing = this.customHandleDrawing;
        const handleRole = this.customHandleRole;

        if (typeof drawing.endHandleDrag === 'function') {
            drawing.endHandleDrag(handleRole, context);
        }

        this._snapDrawingPointsX(drawing);

        // Record modification for undo/redo
        if (this.history && this.customHandleBeforeState) {
            this.history.recordModify(drawing, this.customHandleBeforeState);
        }

        if (typeof drawing.recalculateTimestamps === 'function') {
            try { drawing.recalculateTimestamps(); } catch (_) { /* ignore */ }
        }

        this.isCustomHandleDrag = false;
        this.customHandleDrawing = null;
        this.customHandleRole = null;
        this.customHandleStart = null;
        this.customHandleBeforeState = null;
        this._customHandlePointerSource = null;
        this._clearShiftResizeAnchorPoints();
        this._clearAxisHighlightDragState();
        this._endDrawingLiveInteraction();

        if (drawing?.group && !drawing.group.empty()) {
            drawing.group.selectAll('.shape-border-hit')
                .style('pointer-events', 'stroke');
            if (drawing.type === 'image') {
                drawing.group.selectAll('.image-content, .image-placeholder')
                    .style('pointer-events', 'all');
            }
        }

        this.renderDrawing(drawing, { skipTimestampSync: true });

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
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
        const toolTypeForPoint =
            (this.isCustomHandleDrag && this.customHandleDrawing && this.customHandleDrawing.type)
                ? this.customHandleDrawing.type
                : (this.isResizing && this.resizingDrawing && this.resizingDrawing.type)
                    ? this.resizingDrawing.type
                    : this.currentTool;
        const point = this.getDataPoint(sourceEvent, toolTypeForPoint);
        const [screenX, screenY] = this._eventCanvasLocalXY(sourceEvent);
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
        this._ensureDrawingId(drawing);
        this._commitInlineTextEditorBeforeGeometryEdit();
        this._commitStaleDrawingGroupTransform(drawing);
        this._beginDrawingLiveInteraction();
        this.isDragging = true;
        this.draggingDrawing = drawing;
        this.dragStartPoint = this.getDataPoint(event);

        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (event && typeof event.preventDefault === 'function') event.preventDefault();

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = 'move';
        this.svg.style('cursor', 'move');
        
        // Store screen coordinates for smooth pixel-based dragging (layout px — matches getDataPoint / V9 zoom)
        const [sx, sy] = this._eventCanvasLocalXY(event);
        this.dragStartScreen = { x: sx, y: sy };

        // Store original group transform so dragging uses delta translation (prevents jumps)
        const parseTranslate = (t) => {
            if (!t) return { x: 0, y: 0 };
            const m = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
            if (!m) return { x: 0, y: 0 };
            return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
        };
        this.dragStartOriginalPos = parseTranslate(drawing.group ? drawing.group.attr('transform') : null);
        this.singleDragStartPoints = drawing && Array.isArray(drawing.points)
            ? drawing.points.map(p => ({ ...p }))
            : null;
        this._beginRRToolWholeDragSnapshot(drawing);
        
        // If dragging a drawing that's part of a multi-selection, drag all selected drawings
        if (this.selectedDrawings.length > 1 && this.selectedDrawings.includes(drawing)) {
            this.draggingMultiple = true;
            // Store initial positions for all selected drawings
            this.multiDragStartPositions = this.selectedDrawings.map(d => {
                this._ensureDrawingId(d);
                this._beginRRToolWholeDragSnapshot(d);
                return ({
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
            })});
        } else {
            this.draggingMultiple = false;
            this.singleDragStartPoints = drawing && Array.isArray(drawing.points)
                ? drawing.points.map(p => ({ ...p }))
                : null;
        }
    }

    /**
     * End dragging
     */
    endDrag() {
        this._clearAxisHighlightDragState();
        if (this.draggingMultiple && this.multiDragStartPositions) {
            this.multiDragStartPositions.forEach(({ drawing, points, startTransform }) => {
                const didMove = this._commitDrawingPixelDragDelta(drawing, points, startTransform);
                this._clearRRToolWholeDragSnapshot(drawing);
                if (didMove) {
                    this._refreshDrawingTimestampAnchors(drawing);
                    this._renderDrawingAfterGeometryCommit(drawing);
                } else {
                    this._clearDrawingDragTransform(drawing);
                }
            });
        } else if (this.draggingDrawing && Array.isArray(this.singleDragStartPoints)) {
            const didMove = this._commitDrawingPixelDragDelta(
                this.draggingDrawing,
                this.singleDragStartPoints,
                this.dragStartOriginalPos || { x: 0, y: 0 }
            );
            this._clearRRToolWholeDragSnapshot(this.draggingDrawing);
            if (didMove) {
                this._refreshDrawingTimestampAnchors(this.draggingDrawing);
                this._renderDrawingAfterGeometryCommit(this.draggingDrawing);
            } else {
                this._clearDrawingDragTransform(this.draggingDrawing);
            }
        }
        
        this.isDragging = false;
        this.draggingDrawing = null;
        this.dragStartPoint = null;
        this.dragStartScreen = null;
        this.dragStartOriginalPos = null;
        this.draggingMultiple = false;
        this.multiDragStartPositions = null;
        this.singleDragStartPoints = null;
        this._endDrawingLiveInteraction();

        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        this.svg.style('cursor', '');
        this.saveDrawings();
    }

    /**
     * Pan the chart viewport to a drawing without opening the floating quick bar.
     */
    focusDrawingInViewport(drawing, options = {}) {
        if (!drawing) return false;
        const chart = this.chart;
        if (!chart) return false;

        let points = Array.isArray(drawing.points) ? drawing.points : [];
        if (points.length === 0 && typeof CoordinateUtils !== 'undefined'
            && typeof CoordinateUtils.resolveDrawingPoints === 'function') {
            try {
                points = CoordinateUtils.resolveDrawingPoints(drawing, chart) || [];
            } catch (_) { /* ignore */ }
        }

        const validPoints = points.filter((point) =>
            point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
        );
        if (validPoints.length === 0) return false;

        const avgIndex = validPoints.reduce((sum, point) => sum + Number(point.x), 0) / validPoints.length;
        const avgPrice = validPoints.reduce((sum, point) => sum + Number(point.y), 0) / validPoints.length;

        const candleSpacing = typeof chart.getCandleSpacing === 'function'
            ? chart.getCandleSpacing()
            : chart.candleWidth;
        const margin = chart.margin || { l: 0, r: 0 };
        const plotWidth = Number(chart.w) - Number(margin.l || 0) - Number(margin.r || 0);

        if (Number.isFinite(candleSpacing) && candleSpacing > 0 && Number.isFinite(plotWidth) && plotWidth > 0) {
            chart.offsetX = (plotWidth / 2) - (avgIndex * candleSpacing);
            if (typeof chart.constrainOffset === 'function') {
                chart.constrainOffset();
            }
        }

        if (Number.isFinite(avgPrice) && typeof chart.centerOnPrice === 'function') {
            chart.centerOnPrice(avgPrice);
        } else if (typeof chart.scheduleRender === 'function') {
            chart.scheduleRender();
        }

        if (options.select !== false && typeof this.selectDrawing === 'function') {
            this.selectDrawing(drawing, false, {
                suppressToolbar: true,
                allowWhileArmed: true,
                fromObjectTree: true
            });
        }
        return true;
    }

    /**
     * Select a drawing (or delete if in eraser mode)
     * @param {Object} drawing - The drawing to select
     * @param {Boolean} addToSelection - If true, add to selection instead of replacing (Shift/Ctrl)
     * @param {Object} [options]
     * @param {boolean} [options.suppressToolbar=false] - Select without floating quick bar / V9 rail sync
     * @param {boolean} [options.allowWhileArmed=false] - Allow selection while a draw tool is armed
     */
    selectDrawing(drawing, addToSelection = false, options = {}) {
        const allowWhileArmed = options.allowWhileArmed === true;
        const suppressToolbar = options.suppressToolbar === true;
        if (!allowWhileArmed && this._isPlacementModeActive()) {
            return;
        }
        if (addToSelection && this._isDrawingGeometryMoveActive()) {
            return;
        }
        // If eraser mode is active, delete the drawing instead of selecting
        if (this.eraserMode) {
            this.deleteDrawing(drawing); // Pass the drawing object, not ID
            // [debug removed]
            return;
        }

        const omDisarm = this.chart?.orderManager;
        if (omDisarm && typeof omDisarm.disarmRiskRewardToolExecute === 'function') {
            const onlyBefore = this.selectedDrawings.length === 1 ? this.selectedDrawings[0] : null;
            const reselectingSameOnly = !addToSelection && onlyBefore === drawing;
            if (!reselectingSameOnly) {
                omDisarm.disarmRiskRewardToolExecute();
            }
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
                if (!suppressToolbar && lastDrawing.group) {
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

                if (!suppressToolbar && drawing.group) {
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
            if (this.chart && typeof this.chart._requestMultichartClearDrawingUiOnOtherPanels === 'function') {
                this.chart._requestMultichartClearDrawingUiOnOtherPanels();
            }
            this.deselectAll({ forSelectionChange: true });
            drawing.select();
            this.selectedDrawing = drawing;
            this.selectedDrawings = [drawing];
            this.renderDrawing(drawing); // Re-render to show handles
            
            // Show floating toolbar
            if (!suppressToolbar && drawing.group) {
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
        if (this.chart && typeof this.chart.updateSVGPointerEvents === 'function') {
            this.chart.updateSVGPointerEvents();
        }

        const omSel = this.chart?.orderManager;
        if (omSel && typeof omSel.syncOrderPanelFromSelectedRiskRewardTool === 'function'
            && this.selectedDrawings?.length === 1) {
            const only = this.selectedDrawings[0];
            if (only && (only.type === 'long-position' || only.type === 'short-position')) {
                omSel.syncOrderPanelFromSelectedRiskRewardTool();
            }
        }
    }

    /**
     * Toggle SVG z-index and pointer-events based on drawing selection / active tool state.
     * When a drawing is selected or a tool is active, increase SVG z-index to 11
     * (above time-axis-zone z-index 10) and enable pointer-events so drawings can receive mouse events.
     */
    _updateAxisZonePointerEvents() {
        const toolActive = !!this.currentTool;
        const drawingSelected = this.selectedDrawings.length > 0;
        // Hovering an unselected drawing shows resize handles — same stacking as legacy vs axis zones (z 10).
        const hoverResizeHandles = !!(this._hoveredDrawing && !this._hoveredDrawing.selected);
        // Stay below V9 right chrome (Objects Tree / order rail @ z-index 30). z-index 11 used to paint over side panels.
        const activeZ = '8';
        const idleZ = !!(this.chart && this.chart.isPanel) ? '6' : '2';
        if (this.svg) {
            if (toolActive) {
                this.svg.style('z-index', activeZ);
                // Use 'all' so the entire SVG area captures events (including transparent regions)
                this.svg.style('pointer-events', 'all');
            } else if (drawingSelected) {
                this.svg.style('z-index', activeZ);
                // Per-element pointer-events on strokes/handles — empty plot passes through to canvas pan.
                this.svg.style('pointer-events', 'none');
            } else if (hoverResizeHandles) {
                this.svg.style('z-index', activeZ);
                // Root stays none — strokes/handles use pointer-events; lifts layer above .axis-cursor-zone.
                this.svg.style('pointer-events', 'none');
            } else {
                // Never clear z-index to '' on panels: panel canvas uses z-index 1; SVG default (auto)
                // stacks below it, so drawings vanish until a tool sets z-index again.
                const panel = !!(this.chart && this.chart.isPanel);
                this.svg.style('z-index', panel ? '6' : idleZ);
                this.svg.style('pointer-events', 'none');
            }
        }
    }

    /** @returns {boolean} */
    _isRiskRewardDrawing(d) {
        return !!(d && (d.type === 'long-position' || d.type === 'short-position'));
    }

    /**
     * Deselect all drawings.
     * Risk/reward tools only clear when the user clicks empty chart space (`fromCanvasBackground`)
     * or when selection is intentionally replaced (`forSelectionChange`), e.g. another drawing or tool.
     *
     * @param {{ fromCanvasBackground?: boolean, forSelectionChange?: boolean }} [options]
     */
    deselectAll(options = {}) {
        const fromCanvasBackground = options.fromCanvasBackground === true;
        const forSelectionChange = options.forSelectionChange === true;
        const selected = this.selectedDrawings || [];
        if (
            selected.some((d) => this._isRiskRewardDrawing(d)) &&
            !fromCanvasBackground &&
            !forSelectionChange
        ) {
            return;
        }

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
            this.renderDrawing(d, { skipInteraction: true });
        });
        this.selectedDrawing = null;
        this.selectedDrawings = [];
        this.toolbar.hide(); // Hide toolbar
        if (this.settingsPanel && typeof this.settingsPanel.hide === 'function') {
            this.settingsPanel.hide();
        }
        this.redrawAll();
        this._updateAxisZonePointerEvents();
        if (this.chart && typeof this.chart.updateSVGPointerEvents === 'function') {
            this.chart.updateSVGPointerEvents();
        }
        if (fromCanvasBackground) {
            notifyMultichartParentSelectionCleared(this.chart);
        }
        const omDeselect = this.chart?.orderManager;
        if (omDeselect && typeof omDeselect.disarmRiskRewardToolExecute === 'function') {
            omDeselect.disarmRiskRewardToolExecute();
        }
    }

    /**
     * Auto-trigger inline text editor after a drawing is placed.
     * Finds the .inline-editable-text element in the drawing group and
     * shows the editor overlaid on it. Falls back to the anchor point position.
     */
    _triggerAutoInlineEdit(drawing) {
        if (!drawing) return;

        const helpers = (typeof window !== 'undefined' && window.DrawingTextHelpers) || null;
        const placeholder = helpers ? helpers.TEXT_TOOL_PLACEHOLDER : 'Type here';
        const isPlaceholderText = helpers
            ? (t) => helpers.isTextToolPlaceholder(t)
            : (t) => !String(t || '').trim();

        const onSave = (typeof window !== 'undefined'
            && window.DrawingTextHelpers
            && typeof window.DrawingTextHelpers.createInlineTextSaveHandler === 'function')
            ? window.DrawingTextHelpers.createInlineTextSaveHandler(drawing)
            : (text, confirmed = false) => {
                const normalized = (text || '').replace(/\r\n/g, '\n');
                if (!normalized.trim() || isPlaceholderText(normalized)) {
                    if (confirmed) {
                        this.deleteDrawing(drawing);
                    } else {
                        drawing.setText('');
                    }
                    if (this.chart) this.chart.render();
                    return;
                }
                drawing.setText(normalized);
                if (this.chart) this.chart.render();
            };

        const storedText = drawing.text || '';
        const initialText = isPlaceholderText(storedText) ? '' : storedText;

        if (this._textInlineEditDrawing !== drawing) {
            this.beginTextInlineEdit(drawing);
        }

        const scheduleLive = helpers && typeof helpers.scheduleTextAnnotationLiveRender === 'function'
            ? helpers.scheduleTextAnnotationLiveRender
            : (d) => this.scheduleRenderDrawing(d);

        if (!drawing.group || drawing.group.empty()) {
            this.renderDrawing(drawing);
        }

        let editableNode = null;
        if (drawing.group) {
            editableNode = drawing.group.select('text.inline-editable-text').node();
            if (!editableNode) {
                editableNode = drawing.group.select('.inline-editable-text').node();
            }
        }

        const measured = (helpers && typeof helpers.measureTextAnnotationEditRect === 'function')
            ? helpers.measureTextAnnotationEditRect(drawing, editableNode)
            : null;
        let posNode = measured && measured.posNode ? measured.posNode : null;
        let rect = measured && measured.rect ? measured.rect : null;

        if (!posNode && drawing.group) {
            if (helpers && typeof helpers.resolveTextAnnotationEditBoxNode === 'function') {
                posNode = helpers.resolveTextAnnotationEditBoxNode(drawing, editableNode);
            } else if (drawing.type === 'note' && drawing.group) {
                const boxNode = drawing.group.select('rect.note-body-hit').node();
                if (boxNode && document.contains(boxNode)) posNode = boxNode;
            } else if (drawing.type === 'comment' && drawing.group) {
                const boxNode = drawing.group.select('rect.comment-body-hit').node();
                if (boxNode && document.contains(boxNode)) posNode = boxNode;
            }
        }
        if (!posNode) posNode = editableNode;
        if (!rect && posNode) {
            rect = posNode.getBoundingClientRect();
        }

        const wrapPaddingByType = {
            comment: 12,
            callout: 12,
            pin: 14,
            'signpost-2': 10,
            notebox: 8,
            note: 6,
            text: 6,
            'anchored-text': 6
        };
        const padding = wrapPaddingByType[drawing.type] || 6;

        if (posNode && rect && (rect.width > 0 || rect.height > 0)) {
            const liveOnInput = (newText) => {
                const next = (newText || '').replace(/\r\n/g, '\n');
                const textValue = isPlaceholderText(next) ? '' : next;
                if (helpers && typeof helpers.runTextAnnotationLiveInput === 'function') {
                    helpers.runTextAnnotationLiveInput(drawing, textValue, scheduleLive);
                } else {
                    drawing.setText(textValue);
                    if (typeof drawing._updatePlainTextLayout === 'function') {
                        drawing._updatePlainTextLayout();
                    } else if (typeof drawing._updateCommentBubble === 'function') {
                        drawing._updateCommentBubble();
                    } else {
                        scheduleLive(drawing);
                    }
                }
            };
            const commentLike = drawing.type === 'comment' || drawing.type === 'callout';
            const inlineOpts = (drawing.type === 'note' && helpers && typeof helpers.buildNoteInlineEditorOptions === 'function')
                ? helpers.buildNoteInlineEditorOptions(drawing, rect, {
                    focusOpts: { selectAllOnFocus: false, focusAtEnd: true },
                    initialText,
                    onInput: liveOnInput
                })
                : (helpers && typeof helpers.buildStandardInlineEditorOptions === 'function')
                ? helpers.buildStandardInlineEditorOptions(drawing, rect, {
                    focusOpts: { selectAllOnFocus: false, focusAtEnd: true },
                    padding,
                    placeholderMode: !String(initialText).trim(),
                    editorBackground: drawing.style.backgroundColor || drawing.style.fill,
                    editorPadding: commentLike ? `${padding}px` : '4px 8px',
                    editorBorderRadius: drawing.type === 'comment' ? '16px' : undefined,
                    onInput: liveOnInput
                })
                : {
                    inline: true,
                    placeholderMode: !String(initialText).trim(),
                    selectAllOnFocus: false,
                    focusAtEnd: true,
                    fontSize: `${drawing.style.fontSize || 13}px`,
                    fontFamily: drawing.style.fontFamily || 'Roboto, sans-serif',
                    fontWeight: drawing.style.fontWeight || 'normal',
                    fontStyle: drawing.style.fontStyle || 'normal',
                    color: drawing.style.textColor || '#FFFFFF',
                    textAlign: drawing.style.textAlign || 'left',
                    noWrap: drawing.style.wrapText !== true,
                    maxWidth: drawing.style.maxWidth || (drawing.type === 'comment' ? 280 : 180),
                    hideSelector: (helpers && typeof helpers.buildTextAnnotationInlineHideSelector === 'function')
                        ? helpers.buildTextAnnotationInlineHideSelector(drawing)
                        : `.drawing[data-id="${drawing.id}"] text`,
                    onInput: (newText) => {
                        const next = (newText || '').replace(/\r\n/g, '\n');
                        const textValue = isPlaceholderText(next) ? '' : next;
                        if (helpers && typeof helpers.runTextAnnotationLiveInput === 'function') {
                            helpers.runTextAnnotationLiveInput(drawing, textValue, scheduleLive);
                        } else {
                            drawing.setText(textValue);
                            if (typeof drawing._updatePlainTextLayout === 'function') {
                                drawing._updatePlainTextLayout();
                            } else if (typeof drawing._updateCommentBubble === 'function') {
                                drawing._updateCommentBubble();
                            } else {
                                scheduleLive(drawing);
                            }
                        }
                    }
                };
            this.textEditor.show(
                rect.left + window.scrollX,
                rect.top + window.scrollY,
                initialText,
                onSave,
                placeholder,
                inlineOpts
            );
            return;
        }

        // Fallback: no rendered text element yet (e.g. pin placed with empty initial text)
        if (drawing.points && drawing.points.length > 0) {
            const p = drawing.points[0];
            const svgNode = this.svg && typeof this.svg.node === 'function' ? this.svg.node() : this.svg;
            let fallbackX = this.chart.dataIndexToPixel ? this.chart.dataIndexToPixel(p.x) : this.chart.xScale(p.x);
            let fallbackY = this.chart.yScale(p.y);
            try {
                if (svgNode && typeof svgNode.createSVGPoint === 'function' && typeof svgNode.getScreenCTM === 'function') {
                    const ctm = svgNode.getScreenCTM();
                    if (ctm) {
                        const pt = svgNode.createSVGPoint();
                        pt.x = fallbackX;
                        pt.y = fallbackY;
                        const screenPt = pt.matrixTransform(ctm);
                        fallbackX = screenPt.x + window.scrollX;
                        fallbackY = screenPt.y + window.scrollY;
                    }
                }
            } catch (e) {}
            const fallbackInlineOpts = {
                inline: true,
                placeholderMode: !String(initialText).trim(),
                selectAllOnFocus: false,
                focusAtEnd: true,
                fontSize: `${drawing.style.fontSize || 13}px`,
                fontFamily: drawing.style.fontFamily || 'Roboto, sans-serif',
                fontWeight: drawing.style.fontWeight || 'normal',
                fontStyle: drawing.style.fontStyle || 'normal',
                color: drawing.style.textColor || '#FFFFFF',
                textAlign: drawing.style.textAlign || 'left',
                noWrap: drawing.style.wrapText !== true,
                maxWidth: drawing.style.maxWidth || 180,
                hideSelector: (helpers && typeof helpers.buildTextAnnotationInlineHideSelector === 'function')
                    ? helpers.buildTextAnnotationInlineHideSelector(drawing)
                    : `.drawing[data-id="${drawing.id}"] text`,
                onInput: (newText) => {
                    const next = (newText || '').replace(/\r\n/g, '\n');
                    const textValue = isPlaceholderText(next) ? '' : next;
                    if (helpers && typeof helpers.runTextAnnotationLiveInput === 'function') {
                        helpers.runTextAnnotationLiveInput(drawing, textValue, scheduleLive);
                    } else {
                        drawing.setText(textValue);
                        if (typeof drawing._updatePlainTextLayout === 'function') {
                            drawing._updatePlainTextLayout();
                        } else if (typeof drawing._updateCommentBubble === 'function') {
                            drawing._updateCommentBubble();
                        } else {
                            scheduleLive(drawing);
                        }
                    }
                }
            };
            this.textEditor.show(
                fallbackX - 60,
                fallbackY - 80,
                initialText,
                onSave,
                placeholder,
                fallbackInlineOpts
            );
        }
    }

    /**
     * Edit drawing settings
     */
    editDrawing(drawing, x, y) {
        if (this.settingsPanel && typeof this.settingsPanel.hide === 'function') {
            this.settingsPanel.hide();
        }

        // Multichart iframe: legacy modals are trapped inside the tile — ask the
        // parent shell to open the same global settings surface as the main chart.
        if (isMultichartIframeEmbed()) {
            requestMultichartParentDrawingSettings(drawing, x, y);
            return;
        }

        // Multichart host tile A: route through the grid so coords + dismiss match iframe path.
        try {
            const grid = typeof window !== 'undefined' ? window.__multichartGrid : null;
            if (grid && typeof grid.openDrawingSettingsForPanel === 'function') {
                const hostId = grid.hostPanelId || 'A';
                grid.openDrawingSettingsForPanel(hostId, drawing, x, y);
                return;
            }
        } catch (_grid) { /* ignore */ }

        // Single-chart / fallback: V9 hook then legacy modal on this document.
        const v9Open = resolveV9OpenDrawingSettings();
        if (v9Open && drawing) {
            try {
                const handled = v9Open(drawing, x, y);
                if (handled) {
                    if (this.toolbar && typeof this.toolbar.hide === 'function') this.toolbar.hide();
                    if (this.settingsPanel && typeof this.settingsPanel.hide === 'function') {
                        this.settingsPanel.hide();
                    }
                    if (drawing.type === 'image') drawing._keepEmpty = true;
                    return;
                }
            } catch (err) {
                console.warn('[V9 dblclick] hook threw, falling back to legacy panel:', err);
            }
            if (this._isTextDrawingType(drawing.type)) {
                console.warn('[V9] Text annotation settings require the V9 panel (legacy tv-settings-modal suppressed).');
                return;
            }
        }

        // Hide toolbar when opening settings panel
        this.toolbar.hide();

        // If user opens settings for an empty image, keep it (don't auto-delete on deselect).
        if (drawing && drawing.type === 'image') {
            drawing._keepEmpty = true;
        }

        if (typeof window !== 'undefined' && window.__multichartGrid) {
            try {
                const grid = window.__multichartGrid;
                if (grid && typeof grid.openDrawingSettingsForPanel === 'function') {
                    const hostId = grid.hostPanelId || 'A';
                    grid.openDrawingSettingsForPanel(hostId, drawing, x, y);
                }
            } catch (_grid) { /* ignore */ }
            return;
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
            if (!drawing) return;
            this.clipboardDrawing = this._buildDrawingClonePayload(drawing);
        } catch (err) {
            console.error('Failed to copy drawing:', err);
        }
    }

    _normalizeClipboardPayload(clip) {
        if (!clip || typeof clip !== 'object') return null;
        const out = JSON.parse(JSON.stringify(clip));
        if (out.coordinateSystem === 'timestamp' && Array.isArray(out.points) &&
            this.chart && Array.isArray(this.chart.data) && this.chart.data.length > 0 &&
            typeof CoordinateUtils !== 'undefined' &&
            typeof CoordinateUtils.pointsFromTimestamps === 'function') {
            const tsPts = out.points.map(p => ({
                timestamp: p.timestamp,
                price: p.price !== undefined ? p.price : p.y
            }));
            out.points = CoordinateUtils.pointsFromTimestamps(
                tsPts,
                this.chart.data,
                this.chart.currentTimeframe
            );
            out.coordinateSystem = 'index';
        }
        if (!Array.isArray(out.points) || out.points.length === 0) return null;
        out.points = out.points.map((p) => {
            if (!p || typeof p !== 'object') return null;
            const x = Number(p.x);
            const y = Number(p.price !== undefined ? p.price : p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return { x, y };
        }).filter(Boolean);
        if (out.points.length === 0) return null;
        if (this._isFreehandDrawingType(out.type)) {
            out.points = this._sanitizeFreehandClonePoints(out.points);
        }
        if (this._isFreehandDrawingType(out.type) && Array.isArray(out.timestampPoints) && out.timestampPoints.length > 0) {
            out.timestampPoints = out.timestampPoints.map((p) => ({
                timestamp: Number(p.timestamp),
                price: Number(p.price !== undefined ? p.price : p.y)
            })).filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.price));
        }
        return out;
    }

    _getPrimarySelectedDrawingForClipboard() {
        if (this.selectedDrawing) return this.selectedDrawing;
        if (Array.isArray(this.selectedDrawings) && this.selectedDrawings.length > 0) {
            return this.selectedDrawings[this.selectedDrawings.length - 1];
        }
        return null;
    }

    _isDrawingShortcutTarget(event) {
        const t = event && event.target;
        if (!t || typeof t.closest !== 'function') return true;
        const tag = (t.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
        if (t.isContentEditable) return false;
        if (t.closest('[contenteditable="true"]')) return false;
        if (t.closest('[data-sdrop] input, [data-sdrop] textarea, [data-sdrop] select')) return false;
        return true;
    }
    
    /**
     * Paste drawing from clipboard
     */
    pasteDrawing() {
        if (!this.clipboardDrawing) {
            // [debug removed]
            return false;
        }
        
        try {
            const clip = this._normalizeClipboardPayload(this.clipboardDrawing);
            if (!clip) {
                console.error('Failed to paste drawing: invalid clipboard points');
                return false;
            }

            const newDrawing = this._createDrawingFromClonePayload(clip);
            if (!newDrawing) return false;

            this.addDrawing(newDrawing);
            // While brush/highlighter stay armed, addDrawing clears selection — do not re-select
            // or the V9 quick bar sticks with nothing visibly selected on canvas.
            if (!this._isPersistentFreehandTool(this.currentTool)) {
                this.selectDrawing(newDrawing);
            }
            return true;
            // [debug removed]
        } catch (err) {
            console.error('Failed to paste drawing:', err);
            return false;
        }
    }
    
    /**
     * Set lock state on one drawing (does not persist — caller saves once).
     */
    setDrawingLock(drawing, locked) {
        if (!drawing) return;
        const next = !!locked;
        if (!!drawing.locked === next) return;
        drawing.locked = next;
        if (drawing.group) {
            drawing.group.classed('locked', next);
            drawing.group.style('opacity', next ? '0.7' : null);
        }
        this.renderDrawing(drawing);
    }

    /**
     * Lock or unlock many drawings at once (bulk lock/unlock for multi-select).
     */
    setDrawingsLock(drawings, locked) {
        const list = Array.isArray(drawings) ? drawings.filter(Boolean) : (drawings ? [drawings] : []);
        if (!list.length) return;
        let changed = false;
        list.forEach((drawing) => {
            const next = !!locked;
            if (!!drawing.locked === next) return;
            changed = true;
            this.setDrawingLock(drawing, next);
        });
        if (!changed) return;
        this.saveDrawings();
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('talaria-drawing-lock-changed', { detail: { locked: !!locked } }));
            }
        } catch (_) {}
    }

    /**
     * Toggle lock state of drawing
     */
    toggleLock(drawing) {
        if (!drawing) return;
        this.setDrawingLock(drawing, !drawing.locked);
        this.saveDrawings();
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('talaria-drawing-lock-changed', { detail: { locked: !!drawing.locked } }));
            }
        } catch (_) {}
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
        if (!drawing) return;
        this._ensureDrawingId(drawing);
        let liveDrawing = drawing;
        let index = this.drawings.indexOf(liveDrawing);
        if (index === -1 && liveDrawing.id != null) {
            const byId = this.drawings.find((d) => d && d.id === liveDrawing.id);
            if (byId) {
                liveDrawing = byId;
                index = this.drawings.indexOf(byId);
            }
        }
        if (index > -1) {
            drawing = liveDrawing;
            if (this._rafRenderSet) {
                this._rafRenderSet.delete(drawing);
            }

            // Record for undo/redo BEFORE removing
            if (this.history) {
                this.history.recordDelete(drawing, index);
            }
            
            // Risk/reward drawing deleted: cancel pending / strip visuals tied to this tool’s entry
            if ((drawing.type === 'long-position' || drawing.type === 'short-position') && 
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

                const otherRR = this.drawings.filter((d) => d !== drawing
                    && (d.type === 'long-position' || d.type === 'short-position'));
                if (otherRR.length === 0 && typeof orderManager.clearRiskRewardToolBreakevenPanelState === 'function') {
                    orderManager.clearRiskRewardToolBreakevenPanelState();
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
                this._resizePointerSource = null;
                this._clearShiftResizeAnchorPoints();
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

            if (typeof window !== 'undefined' && typeof window.__v9OnDrawingDeleted === 'function') {
                try {
                    window.__v9OnDrawingDeleted(drawing);
                } catch (_) {}
            }

            // Clear selection before hiding toolbar so we know if anything remains selected.
            if (this.selectedDrawing === drawing) {
                this.selectedDrawing = null;
            }
            if (Array.isArray(this.selectedDrawings) && this.selectedDrawings.length > 0) {
                this.selectedDrawings = this.selectedDrawings.filter(d => d !== drawing);
                if (!this.selectedDrawing && this.selectedDrawings.length > 0) {
                    this.selectedDrawing = this.selectedDrawings[this.selectedDrawings.length - 1] || null;
                }
            }

            const hasRemainingSelection =
                !!this.selectedDrawing ||
                (Array.isArray(this.selectedDrawings) && this.selectedDrawings.length > 0);
            const trackedDeleted =
                this.toolbar &&
                (this.toolbar.currentDrawing === drawing ||
                    (this.toolbar.currentDrawing &&
                        drawing.id != null &&
                        this.toolbar.currentDrawing.id != null &&
                        String(this.toolbar.currentDrawing.id) === String(drawing.id)));

            // Hide V9 quick bar / legacy toolbar when the deleted shape was selected.
            // V9 often skips legacy toolbar.show(), so currentDrawing may be null even while tlBarSelected is true.
            if (this.toolbar && (!hasRemainingSelection || trackedDeleted)) {
                this.toolbar.hide();
            }
            if (!hasRemainingSelection) {
                notifyMultichartParentSelectionCleared(this.chart);
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
                if (this.chart.scheduleRender) {
                    this.chart.scheduleRender();
                }
            }
            
            this.saveDrawings();
            
            // Broadcast to other panels in real-time
            if (this.chart.broadcastDrawingChange) {
                this.chart.broadcastDrawingChange('remove', { id: drawing.id }, index);
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
     * Resolve live bar-index points for clone/paste. toJSON() stores timestamps ({timestamp, price})
     * which must not be passed straight into fromJSON for in-memory duplication.
     */
    _isFreehandDrawingType(type) {
        return type === 'brush' || type === 'highlighter' || type === 'path';
    }

    _sanitizeFreehandClonePoints(points) {
        if (!Array.isArray(points) || points.length === 0) return points;
        if (typeof BaseDrawing !== 'undefined' && typeof BaseDrawing.sanitizeFreehandPoints === 'function') {
            return BaseDrawing.sanitizeFreehandPoints(points);
        }
        return points;
    }

    _applyClonePointOffset(drawing) {
        if (!drawing || !Array.isArray(drawing.points) || drawing.points.length === 0) return;
        const pts = drawing.points;
        const priceRange = this.chart && this.chart.yScale ? this.chart.yScale.domain() : [0, 1];
        const domainSpan = priceRange[1] - priceRange[0];
        const domainOffsetBase = Number.isFinite(domainSpan) && domainSpan !== 0 ? domainSpan : 0;

        if (this._isFreehandDrawingType(drawing.type) && pts.length >= 2) {
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (const p of pts) {
                if (p && Number.isFinite(p.x)) {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                }
                if (p && Number.isFinite(p.y)) {
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                }
            }
            const spanX = Number.isFinite(maxX - minX) ? maxX - minX : 0;
            const spanY = Number.isFinite(maxY - minY) ? maxY - minY : 0;
            const xOffset = Math.max(3, spanX * 0.1, 0.25);
            const yOffset = Math.max(
                domainOffsetBase * 0.025,
                spanY * 0.1,
                domainOffsetBase * 0.015
            );
            drawing.points = pts.map(p => ({
                x: Number.isFinite(p.x) ? p.x + xOffset : p.x,
                y: Number.isFinite(p.y) ? p.y - yOffset : p.y
            }));
            return;
        }

        const priceOffset = domainOffsetBase * 0.02;
        const candleOffset = 3;
        drawing.points = pts.map(p => ({
            x: Number.isFinite(p.x) ? p.x + candleOffset : p.x,
            y: Number.isFinite(p.y) ? p.y - priceOffset : p.y
        }));
    }

    _resolveDrawingIndexPoints(drawing) {
        if (!drawing) return [];
        const pts = drawing.points;
        if (Array.isArray(pts) && pts.length > 0 &&
            pts.every(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))) {
            return pts.map(p => ({ x: Number(p.x), y: Number(p.y) }));
        }
        if (Array.isArray(pts) && pts.length > 0 &&
            pts.every(p => p && Number.isFinite(p.timestamp)) &&
            this.chart && Array.isArray(this.chart.data) && this.chart.data.length > 0 &&
            typeof CoordinateUtils !== 'undefined' &&
            typeof CoordinateUtils.pointsFromTimestamps === 'function') {
            try {
                const normalized = pts.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price !== undefined ? p.price : p.y
                }));
                const converted = CoordinateUtils.pointsFromTimestamps(
                    normalized,
                    this.chart.data,
                    this.chart.currentTimeframe
                );
                if (Array.isArray(converted) && converted.length > 0 &&
                    converted.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
                    return converted.map(p => ({ x: p.x, y: p.y }));
                }
            } catch (_) { /* fall through */ }
        }
        const tsPts = drawing.timestampPoints;
        if (Array.isArray(tsPts) && tsPts.length > 0 &&
            this.chart && Array.isArray(this.chart.data) && this.chart.data.length > 0 &&
            typeof CoordinateUtils !== 'undefined' &&
            typeof CoordinateUtils.pointsFromTimestamps === 'function') {
            try {
                const normalized = tsPts.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price !== undefined ? p.price : p.y
                }));
                const converted = CoordinateUtils.pointsFromTimestamps(
                    normalized,
                    this.chart.data,
                    this.chart.currentTimeframe
                );
                if (Array.isArray(converted) && converted.length > 0 &&
                    converted.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
                    return converted.map(p => ({ x: p.x, y: p.y }));
                }
            } catch (_) { /* fall through */ }
        }
        return [];
    }

    _buildDrawingClonePayload(drawing) {
        let points = this._resolveDrawingIndexPoints(drawing);
        if (this._isFreehandDrawingType(drawing.type)) {
            points = this._sanitizeFreehandClonePoints(points);
        }
        const payload = {
            type: drawing.type,
            points: JSON.parse(JSON.stringify(points)),
            coordinateSystem: 'index',
            style: JSON.parse(JSON.stringify(drawing.style || {})),
            visible: drawing.visible !== false,
            meta: {
                ...(drawing.meta && typeof drawing.meta === 'object' ? drawing.meta : {}),
                createdAt: Date.now(),
                updatedAt: Date.now()
            },
            text: typeof drawing.text === 'string' ? drawing.text : ''
        };
        if (this._isFreehandDrawingType(drawing.type) && Array.isArray(drawing.timestampPoints) && drawing.timestampPoints.length > 0) {
            payload.timestampPoints = JSON.parse(JSON.stringify(drawing.timestampPoints));
        }
        if (drawing.visibility) {
            payload.visibility = JSON.parse(JSON.stringify(drawing.visibility));
        }
        if (drawing.baseScale != null) payload.baseScale = drawing.baseScale;
        if (drawing.levels) payload.levels = JSON.parse(JSON.stringify(drawing.levels));
        payload.locked = !!drawing.locked;
        return payload;
    }

    _createDrawingFromClonePayload(payload) {
        if (!payload || !payload.type) return null;
        const toolInfo = this.toolRegistry[payload.type];
        if (!toolInfo) return null;

        const data = JSON.parse(JSON.stringify(payload));
        const newDrawing = toolInfo.class.fromJSON(data, this.chart);
        newDrawing.id = generateUUID();
        newDrawing.coordinateSystem = 'index';

        if (this._isFreehandDrawingType(newDrawing.type) && Array.isArray(data.points) && data.points.length > 0) {
            newDrawing.points = this._sanitizeFreehandClonePoints(
                data.points.map((p) => ({
                    x: Number(p.x),
                    y: Number(p.price !== undefined ? p.price : p.y)
                })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            );
            if (Array.isArray(data.timestampPoints) && data.timestampPoints.length > 0) {
                newDrawing.timestampPoints = data.timestampPoints.map((p) => ({
                    timestamp: Number(p.timestamp),
                    price: Number(p.price !== undefined ? p.price : p.y)
                })).filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.price));
            } else {
                newDrawing.timestampPoints = null;
            }
        } else {
            newDrawing.timestampPoints = null;
        }

        this._applyClonePointOffset(newDrawing);

        if (this._isFreehandDrawingType(newDrawing.type) && Array.isArray(newDrawing.points) && newDrawing.points.length > 0) {
            newDrawing.points = this._sanitizeFreehandClonePoints(newDrawing.points);
            newDrawing._fromClonePayload = true;
        }
        return newDrawing;
    }

    /**
     * Duplicate a drawing (Clone) - exact same position
     */
    duplicateDrawing(drawing) {
        try {
            const jsonData = this._buildDrawingClonePayload(drawing);
            if (!Array.isArray(jsonData.points) || jsonData.points.length === 0) {
                console.error('Failed to clone drawing: no valid points');
                return;
            }

            const newDrawing = this._createDrawingFromClonePayload(jsonData);
            if (!newDrawing) return;

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

        if (this.chart && typeof this.chart.broadcastDrawingChange === 'function') {
            this.chart.broadcastDrawingChange('update', drawing);
        }
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

        if (this.chart && typeof this.chart.broadcastDrawingChange === 'function') {
            this.chart.broadcastDrawingChange('update', drawing);
        }
    }

    /**
     * Redraw all drawings (called on zoom/pan)
     * @param {Object} [options]
     * @param {boolean} [options.panFast] - skip rebuild while chart pan uses CSS translate
     * @param {boolean} [options.forceFull] - always rebuild (after pan ends)
     */
    redrawAll(options = {}) {
        // Check if scales are available
        if (!this.chart.xScale || !this.chart.yScale) {
            console.warn('⚠️ Scales not ready for drawing');
            return;
        }

        // Never tear down SVG groups mid-handle-drag (causes snap-back / stuck handles).
        if (!options.panFast && !options.forceFull) {
            if (this._isLiveHandleEditing() || this._isDrawingGeometryMoveActive()) {
                return;
            }
        }

        // Update clip path dimensions in case chart was resized
        this.updateClipPath();
        const clipUrl = this._clipUrl();
        if (clipUrl) {
            if (this.drawingsGroup && !this.drawingsGroup.empty()) {
                this.drawingsGroup.attr('clip-path', clipUrl);
            }
            if (this.tempGroup && !this.tempGroup.empty()) {
                this.tempGroup.attr('clip-path', clipUrl);
            }
        }
        
        // Set re-entry guard so hideAxisHighlights → scheduleRender doesn't re-enter
        // during the render cycle (would cause stack overflow when scheduleRender is synchronous)
        const wasRendering = this.chart._isRendering;
        this.chart._isRendering = true;
        
        // Drop stale group refs before clearing SVG (hidden-by-TF drawings skip renderDrawing).
        this.drawings.forEach((d) => { if (d) d.group = null; });

        // Clear existing SVG elements
        this.drawingsGroup.selectAll('*').remove();
        if (this.labelsGroup) {
            this.labelsGroup.selectAll('*').remove();
        }
        
        // Re-render all drawings with updated scales.
        // skipInteraction=true: skip the expensive ~20-selectAll setupDrawingInteraction
        // on unselected drawings (pan/zoom hot path). Selected drawings and tools that
        // always expose point handles must keep full setup so gear/dblclick/resize still
        // work after a redraw (SVG groups are recreated here).
        const panFast = !!options.panFast;
        this.drawings.forEach(drawing => {
            const needsFullInteraction = !panFast && (
                !!drawing.selected ||
                (this.selectedDrawings && this.selectedDrawings.includes(drawing)) ||
                drawing.type === 'polyline' ||
                drawing.type === 'path' ||
                drawing.type === 'double-curve'
            );
            const skipInteraction = this._isPlacementModeActive() || !needsFullInteraction;
            this.renderDrawing(drawing, { skipInteraction });
        });

        if (this._isPlacementModeActive()) {
            this._applyPlacementModePointerEvents();
        }
        
        this.chart._isRendering = wasRendering;
        
        this.raiseDrawingLayersAboveOrderPreviews();
    }

    /** Ensure SVG exists before pan translate (finger-down). */
    prepareDrawingsForChartPan() {
        if (!this.chart || !this.chart.xScale || !this.chart.yScale) return;
        this.updateClipPath();
        const hasDom = this.drawingsGroup
            && !this.drawingsGroup.empty()
            && !this.drawingsGroup.selectAll('.drawing').empty();
        if (!hasDom && this.drawings.length > 0) {
            const chart = this.chart;
            requestAnimationFrame(() => {
                if (!chart?.drag?.active || chart.drag.type !== 'pan') return;
                const stillMissing = this.drawingsGroup
                    && (this.drawingsGroup.empty()
                        || this.drawingsGroup.selectAll('.drawing').empty());
                if (stillMissing) {
                    this.redrawAll({ forceFull: true });
                }
            });
        }
    }

    /** Full geometry sync after pan ends (transform cleared by chart.js). */
    finalizeDrawingsAfterChartPan() {
        this._clearDrawingGroupPanTransforms();
        this.setDrawingsClipDuringChartPan(false);
    }

    /** Optional per-frame patch while chart applies group translate (no-op default). */
    patchDrawingsDuringChartPan(_dx, _ty) {}

    _ensureDrawingsPanLayer() {
        if (!this.drawingsGroup || this.drawingsGroup.empty()) return;
        this.drawingsPanLayer = this.drawingsGroup;
    }

    _clearDrawingGroupPanTransforms() {
        if (!this.drawingsGroup || this.drawingsGroup.empty()) return;
        this.drawingsGroup.selectAll('.drawing').attr('transform', null);
    }

    /**
 
     * @param {Object} options
     * @param {boolean} [options.confirmPrompt=true]
     * @returns {boolean} - True if drawings were cleared
     */
    clearDrawings({ confirmPrompt = true, skipBroadcast = false } = {}) {
        const count = this.drawings.length;
        if (count === 0) {
            if (this.drawingsGroup) {
                this.drawingsGroup.selectAll('*').remove();
            }
            try {
                this.saveDrawings();
            } catch (_) {}
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
        
        // Broadcast to other panels in real-time (skip when toolbar clears all charts explicitly)
        if (!skipBroadcast && this.chart.broadcastDrawingChange) {
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
        const zPx = (this.chart && typeof this.chart._v9LayoutZoom === 'function')
            ? this.chart._v9LayoutZoom()
            : 1;
        const clientX = Number.isFinite(mouseX) && svgRect ? (svgRect.left + mouseX * zPx) : NaN;
        const clientY = Number.isFinite(mouseY) && svgRect ? (svgRect.top + mouseY * zPx) : NaN;

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
     * SHARED across all panels of the same pair/session (mirror behavior)
     */
    getStorageKey(fileIdOverride = null) {
        if (this.chart && typeof this.chart.getDrawingsStorageKey === 'function') {
            return this.chart.getDrawingsStorageKey(fileIdOverride);
        }
        const fileId = fileIdOverride != null && String(fileIdOverride) !== ''
            ? String(fileIdOverride)
            : (this.chart.currentFileId || 'default');
        const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
            ? this.chart.getActiveTradingSessionId()
            : null;
        if (sessionId) {
            return `chart_drawings_s${sessionId}_${fileId}`;
        }
        return `chart_drawings_${fileId}`;
    }

    /** Candle series for timestamp↔index conversion — must match `chart.data` / `dataIndexToPixel`. */
    _getDrawingConversionData() {
        if (!this.chart || !Array.isArray(this.chart.data) || this.chart.data.length === 0) {
            return [];
        }
        return this.chart.data;
    }

    _getTimestampConversionOptions(drawing) {
        if (typeof CoordinateUtils === 'undefined'
            || typeof CoordinateUtils.buildTimestampResolveOptions !== 'function') {
            return null;
        }
        return CoordinateUtils.buildTimestampResolveOptions(drawing, this.chart);
    }

    /** Re-resolve bar indices from stored timestamps using the live replay slice. */
    _syncDrawingPointsFromTimestamps(drawing, options = {}) {
        if (!drawing || !this.chart) return;
        if (this._isDrawingLiveEditing(drawing)) return;
        if (!options.tfRefresh) {
            const chart = this.chart;
            if (typeof chart._isChartViewPanning === 'function' && chart._isChartViewPanning()) {
                return;
            }
            if (typeof chart._isWheelZoomBurst === 'function' && chart._isWheelZoomBurst()) {
                return;
            }
            if (typeof chart._isAxisZoomDragging === 'function'
                && chart._isAxisZoomDragging()
                && !chart._axisZoomFinalizePass) {
                return;
            }
        }
        if (!drawing.timestampPoints || drawing.timestampPoints.length === 0) return;
        if (typeof CoordinateUtils === 'undefined' || typeof CoordinateUtils.resolveDrawingPoints !== 'function') {
            return;
        }
        const dataLen = Array.isArray(this.chart.data) ? this.chart.data.length : 0;
        const lastIdx = dataLen > 0 ? dataLen - 1 : 0;
        const hasTimestampAnchors = drawing.timestampPoints && drawing.timestampPoints.length > 0;
        // After viewing a finer TF (e.g. 1m), bar indices are larger than the coarser
        // series length (e.g. 15m). Do not treat that as intentional extrabar placement —
        // always re-resolve from stored timestamps when anchors exist.
        if (!hasTimestampAnchors
            && typeof CoordinateUtils.allowsExtrabarBarIndex === 'function'
            && CoordinateUtils.allowsExtrabarBarIndex(drawing.type)
            && Array.isArray(drawing.points)
            && drawing.points.some((p) => p && Number.isFinite(p.x) && p.x > lastIdx + 0.001)) {
            return;
        }
        try {
            // TF refresh: skip replay clamp so multi-point tools keep geometry (clamp stacks
            // future anchors onto the last visible bar and lines/boxes disappear).
            const tsOpts = options.tfRefresh
                ? null
                : this._getTimestampConversionOptions(drawing);
            const resolved = CoordinateUtils.resolveDrawingPoints(drawing, this.chart, tsOpts);
            if (Array.isArray(resolved) && resolved.length > 0) {
                drawing.points = resolved;
                if (
                    typeof drawing.finalizeDrawing === 'function' &&
                    (drawing.type === 'arc' || drawing.type === 'curve') &&
                    drawing.points.length === 2
                ) {
                    drawing._controlPointGenerated = false;
                    drawing._needsScreenOffset = true;
                    drawing.finalizeDrawing();
                } else if (drawing.type === 'curve' && drawing.points.length >= 3) {
                    drawing._controlPointGenerated = true;
                }
            }
        } catch (_) { /* ignore */ }
    }

    /** True while the user is dragging/resizing — do not snap points back to stale timestamps. */
    _isDrawingLiveEditing(drawing) {
        if (!drawing) return false;
        if (Array.isArray(this._bodyDragActiveDrawings) && this._bodyDragActiveDrawings.includes(drawing)) {
            return true;
        }
        const liveDepth = this._drawingLiveInteractionDepth || 0;
        if (liveDepth > 0) {
            if (this.resizingDrawing === drawing) return true;
            if (this.customHandleDrawing === drawing) return true;
            if (this.customHandleDraggingDrawing === drawing) return true;
            if (this.draggingDrawing === drawing) return true;
            if (this._directMoveMoveHandler && Array.isArray(this._directMoveDrawings) && this._directMoveDrawings.includes(drawing)) {
                return true;
            }
            if (this.draggingMultiple && Array.isArray(this.selectedDrawings) && this.selectedDrawings.includes(drawing)) {
                return true;
            }
            if (this.drawingState && this.drawingState.currentDrawing === drawing) {
                return true;
            }
        }
        if (this._directMoveMoveHandler && Array.isArray(this._directMoveDrawings) && this._directMoveDrawings.includes(drawing)) {
            return true;
        }
        if (this.isDragging) {
            if (this.draggingDrawing === drawing) return true;
            if (this.draggingMultiple && Array.isArray(this.selectedDrawings) && this.selectedDrawings.includes(drawing)) {
                return true;
            }
        }
        if (this.isResizing && this.resizingDrawing === drawing) return true;
        if (this.isCustomHandleDrag && this.customHandleDrawing === drawing) return true;
        if (this.isCustomHandleDragging && this.customHandleDraggingDrawing === drawing) return true;
        if (this.drawingState && this.drawingState.isDrawing && this.drawingState.currentDrawing === drawing) {
            return true;
        }
        return false;
    }

    _refreshDrawingTimestampAnchors(drawing) {
        if (!drawing || typeof drawing.recalculateTimestamps !== 'function') return;
        try { drawing.recalculateTimestamps(); } catch (_) { /* ignore */ }
    }

    /** One-time capture of wall-clock anchors from current bar indices (legacy drawings). */
    _captureDrawingTimestampAnchors(drawing) {
        if (!drawing || !this.chart) return;
        if (drawing.timestampPoints && drawing.timestampPoints.length > 0) return;
        if (!Array.isArray(drawing.points) || drawing.points.length === 0) return;
        if (!Array.isArray(this.chart.data) || this.chart.data.length === 0) return;
        if (typeof CoordinateUtils === 'undefined'
            || typeof CoordinateUtils.pointsToTimestamps !== 'function') {
            return;
        }
        try {
            const tsPoints = CoordinateUtils.pointsToTimestamps(
                drawing.points,
                this.chart.data,
                this.chart.currentTimeframe
            );
            if (Array.isArray(tsPoints) && tsPoints.length > 0) {
                drawing.timestampPoints = tsPoints;
                drawing.coordinateSystem = 'timestamp';
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Persist lock even when a tool class overrides toJSON() without `locked`.
     */
    _serializeDrawingForStorage(drawing) {
        const json = (drawing && typeof drawing.toJSON === 'function')
            ? drawing.toJSON()
            : (drawing || {});
        json.locked = !!(drawing && drawing.locked);
        return json;
    }

    /** Restore lock after fromJSON() — many tool classes omit locked in fromJSON. */
    _applyLoadedDrawingLockState(drawing, item) {
        if (!drawing || !item) return;
        if (item.locked !== undefined && item.locked !== null) {
            drawing.locked = item.locked === true || item.locked === 1 || item.locked === 'true';
        }
    }

    /**
     * Save drawings to localStorage and API (hybrid approach)
     * @param {string|null} fileIdOverride — when set, persist under this dataset id (pair switch before chart.currentFileId updates).
     */
    saveDrawings(fileIdOverride = null) {
        // Ensure all drawings have chart reference before saving
        this.drawings.forEach(d => {
            this._ensureDrawingId(d);
            if (!d.chart) {
                d.chart = this.chart;
                // [debug removed]
            }
        });
        
        const data = this.drawings.map((d) => this._serializeDrawingForStorage(d));
        const key = this.getStorageKey(fileIdOverride);
        const clientUpdatedAt = Date.now();

        // 1. Local cache (instant UX)
        this._writeDrawingsCache(key, JSON.stringify(data));
        this._writeDrawingsCacheMeta(key, {
            ...(this._readDrawingsCacheMeta(key) || {}),
            client_updated_at: clientUpdatedAt
        });

        const isUndoRedo = this.history && this.history.isPerformingUndoRedo;
        const skipRemote = fileIdOverride != null
            && String(fileIdOverride) !== String(this.chart.currentFileId || '');

        // 2. Debounced POST /api/chart/drawings/{symbol} — canonical server store when logged in
        if (!isUndoRedo && !skipRemote) {
            try {
                this.scheduleSaveToAPI(data, clientUpdatedAt);
            } catch (error) {
                console.warn('⚠️ Failed to schedule drawings API sync:', error?.message || error);
            }
        }
        
        // Optional URL sync for drawings (disabled by default to avoid very long URLs / 414 errors)
        const shouldSyncDrawingsToUrl = (
            typeof window !== 'undefined' &&
            window &&
            window.__ENABLE_DRAWINGS_URL_SYNC__ === true
        );
        if (!isUndoRedo && !skipRemote && shouldSyncDrawingsToUrl) {
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

        if (!isUndoRedo && !skipRemote) {
            this._drawingsSaveError = false;
            // Cloud icon pulses only while the API request is in flight — not during debounce.
        }

        try {
            window.dispatchEvent(new CustomEvent('drawingsChanged'));
        } catch (error) {
            console.warn('⚠️ Failed to dispatch drawingsChanged event:', error?.message || error);
        }
    }

    /**
     * Schedule API save with debouncing to avoid excessive requests
     */
    scheduleSaveToAPI(data, clientUpdatedAt) {
        if (!this._canUseDrawingsCloudApi()) return;
        // Clear existing timer
        if (this._apiSaveTimer) {
            clearTimeout(this._apiSaveTimer);
        }

        this._pendingApiSaveClientUpdatedAt = clientUpdatedAt || Date.now();

        // Debounce API saves — local cache is instant; pulse only when fetch starts.
        this._apiSaveTimer = setTimeout(() => {
            if (!this.chart || !Array.isArray(this.drawings)) return;
            const fresh = this.drawings.map((d) => this._serializeDrawingForStorage(d));
            const key = this.getStorageKey();
            const meta = this._readDrawingsCacheMeta(key);
            this.saveDrawingsToAPI(fresh, meta?.client_updated_at || this._pendingApiSaveClientUpdatedAt);
        }, DrawingToolsManager.API_SAVE_DEBOUNCE_MS);
    }

    /**
     * Save drawings to backend API for cross-device sync (canonical store).
     */
    async saveDrawingsToAPI(data, clientUpdatedAt) {
        if (!this._canUseDrawingsCloudApi()) return;
        // Single-flight: overlapping debounced/flush saves in one tab must not 409 each other.
        if (this._drawingsApiSaveInFlight) {
            this._drawingsApiSaveQueued = true;
            return;
        }
        this._drawingsApiSaveInFlight = true;
        try {
            await this._saveDrawingsToAPIOnce(data, clientUpdatedAt);
        } finally {
            this._drawingsApiSaveInFlight = false;
            if (this._drawingsApiSaveQueued) {
                this._drawingsApiSaveQueued = false;
                if (this.chart && Array.isArray(this.drawings)) {
                    const fresh = this.drawings.map((d) => this._serializeDrawingForStorage(d));
                    void this.saveDrawingsToAPI(fresh, Date.now());
                }
            }
        }
    }

    async _saveDrawingsToAPIOnce(data, clientUpdatedAt, retryAfterAuthRefresh = false) {
        try {
            if (!this._canUseDrawingsCloudApi()) return;

            const symbol = this.chart.currentFileId || 'default';
            const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
                ? this.chart.getActiveTradingSessionId()
                : null;

            const token = localStorage.getItem('token');
            if (!token) {
                return;
            }

            this._drawingsPendingTargets = { api: true };
            this._syncDrawingsSaveUiFromTargets();

            const response = await fetch(`/api/chart/drawings/${encodeURIComponent(symbol)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    drawings: data,
                    session_id: sessionId,
                    client_updated_at: Date.now()
                })
            });

            if (response.ok) {
                DrawingToolsManager._drawingsCloudAuthBlocked = false;
                const result = await response.json();
                console.log(`✅ Drawings synced to cloud (${result.count} drawings)`);
                this._drawingsSaveError = false;
                const key = this.getStorageKey();
                const serverMs = this._parseUpdatedAtMs(result.updated_at) || Date.now();
                this._writeDrawingsCacheMeta(key, {
                    updated_at: result.updated_at || null,
                    client_updated_at: serverMs
                });
            } else if (response.status === 401) {
                if (!retryAfterAuthRefresh && await this._recoverDrawingsCloudAuthFromSession()) {
                    return this._saveDrawingsToAPIOnce(data, clientUpdatedAt, true);
                }
                this._onDrawingsApiUnauthorized();
            } else if (response.status === 413) {
                console.warn('⚠️ Drawings payload too large for cloud');
                this._drawingsSaveError = true;
                try {
                    if (this.chart && typeof this.chart.showNotification === 'function') {
                        this.chart.showNotification('Too many drawings to sync — remove some and retry', 'warning', 5000);
                    }
                } catch (_) { /* ignore */ }
            } else {
                console.warn('⚠️ Failed to sync drawings to cloud:', response.statusText);
                this._drawingsSaveError = true;
                try {
                    if (this.chart && typeof this.chart.showNotification === 'function') {
                        this.chart.showNotification('Could not save drawings to cloud — click cloud icon to retry', 'error', 4000);
                    }
                } catch (_) { /* ignore */ }
            }
        } catch (error) {
            console.warn('⚠️ Error syncing drawings to cloud:', error.message);
            this._drawingsSaveError = true;
        } finally {
            try {
                this._onChartDrawingsApiSaveFinished();
            } catch (_) { /* ignore */ }
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
    async loadDrawingsFromAPI(retryAfterAuthRefresh = false) {
        try {
            if (!this._canUseDrawingsCloudApi()) return null;

            const symbol = this.chart.currentFileId || 'default';
            const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
                ? this.chart.getActiveTradingSessionId()
                : null;
            
            const token = localStorage.getItem('token');
            if (!token) {
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
                DrawingToolsManager._drawingsCloudAuthBlocked = false;
                const result = await response.json();
                if (result.success) {
                    return {
                        drawings: Array.isArray(result.drawings) ? result.drawings : [],
                        updated_at: result.updated_at || null
                    };
                }
            } else if (response.status === 401) {
                if (!retryAfterAuthRefresh && await this._recoverDrawingsCloudAuthFromSession()) {
                    return this.loadDrawingsFromAPI(true);
                }
                this._onDrawingsApiUnauthorized();
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

        // Session GET /state may hydrate via loadDrawingsFromData before this runs — do not wipe them.
        if (this._drawingsLoaded) {
            if (this.chart && typeof this.chart._applyPendingSessionDrawingsAfterManagerLoad === 'function') {
                this.chart._applyPendingSessionDrawingsAfterManagerLoad();
            }
            return;
        }

        let saved = null;
        
        // 1. Try loading from URL parameters first (for sharing across tabs/browsers)
        const urlDrawings = this.loadDrawingsFromURL();
        if (urlDrawings) {
            saved = JSON.stringify(urlDrawings);
            console.log('📥 Loaded drawings from URL (shared link)');
        }
        // 2. Server-first load (chart_drawings API) with local cache merge
        else {
            const resolved = await this._resolveDrawingsPayloadForLoad();
            if (resolved.data) {
                saved = JSON.stringify(resolved.data);
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
            if (this.chart && typeof this.chart._applyPendingSessionDrawingsAfterManagerLoad === 'function') {
                this.chart._applyPendingSessionDrawingsAfterManagerLoad();
            }
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
            
            const conversionData = this._getDrawingConversionData();
            
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
                        item.points = CoordinateUtils.pointsFromTimestamps(
                            originalTimestampPoints,
                            conversionData,
                            this.chart.currentTimeframe,
                            this._getTimestampConversionOptions({ type: item.type })
                        );
                    }
                    
                    const drawing = toolInfo.class.fromJSON(item, this.chart);
                    drawing.chart = this.chart;
                    this._applyLoadedDrawingLockState(drawing, item);
                    
                    // Restore the original timestamp points (critical for timeframe switching)
                    if (originalTimestampPoints) {
                        drawing.timestampPoints = originalTimestampPoints;
                    }
                    this._syncDrawingPointsFromTimestamps(drawing);
                    
                    this.drawings.push(drawing);
                    this.renderDrawing(drawing);
                } else {
                    console.error(`❌ Unknown tool type: ${item.type}`);
                }
            });
            
            // [debug removed]

            const storageKey = this.getStorageKey();
            if (storageKey.includes('_s')) {
                try {
                    this.saveDrawings();
                } catch (_) { /* ignore */ }
            }
            
            // Refresh object tree if available
            if (this.objectTreeManager) {
                this.objectTreeManager.refresh();
            }
        } catch (error) {
            console.error('❌ Failed to load drawings:', error);
        }
        if (this.chart && typeof this.chart._applyPendingSessionDrawingsAfterManagerLoad === 'function') {
            this.chart._applyPendingSessionDrawingsAfterManagerLoad();
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

            const conversionData = this._getDrawingConversionData();

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
                    item.points = CoordinateUtils.pointsFromTimestamps(
                        originalTimestampPoints,
                        conversionData,
                        this.chart.currentTimeframe,
                        this._getTimestampConversionOptions({ type: item.type })
                    );
                }

                const drawing = toolInfo.class.fromJSON(item, this.chart);
                drawing.chart = this.chart;
                this._applyLoadedDrawingLockState(drawing, item);
                if (originalTimestampPoints) {
                    drawing.timestampPoints = originalTimestampPoints;
                }
                this._syncDrawingPointsFromTimestamps(drawing);
                this.drawings.push(drawing);
                this.renderDrawing(drawing);
            });

            if (this.objectTreeManager) {
                this.objectTreeManager.refresh();
            }

            this._drawingsLoaded = true;
            try {
                const serialized = this.drawings.map((d) => this._serializeDrawingForStorage(d));
                const cacheKey = this.getStorageKey();
                this._writeDrawingsCache(cacheKey, JSON.stringify(serialized));
                const meta = this._readDrawingsCacheMeta(cacheKey) || {};
                this._writeDrawingsCacheMeta(cacheKey, {
                    ...meta,
                    client_updated_at: meta.client_updated_at || Date.now()
                });
            } catch (_) { /* ignore */ }
        } catch (e) {
            console.warn('⚠️ Failed to load drawings from data', e);
        }
    }

    /**
     * Export drawings as JSON
     */
    exportDrawings() {
        const data = this.drawings.map((d) => this._serializeDrawingForStorage(d));
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
                    this._applyLoadedDrawingLockState(drawing, item);
                    this.addDrawing(drawing);
                }
            });
        } catch (error) {
            console.error('Failed to import drawings:', error);
        }
    }

    /**
     * Debounced post-TF-switch refresh (called from chart._endTimeframeSwitching).
     * Waits until chart.data is ready, re-resolves timestamp anchors, then full redraw.
     */
    scheduleRefreshAfterTimeframe(options = {}) {
        const force = !!options.force;
        if (this._tfRefreshScheduled && !force) return;
        this._tfRefreshScheduled = true;
        const token = (this._tfRefreshToken = (this._tfRefreshToken || 0) + 1);

        const attempt = (retriesLeft) => {
            const run = () => {
                if (token !== this._tfRefreshToken) return;

                const chart = this.chart;
                const replay = chart && chart.replaySystem;
                const switching = !!(chart && chart._timeframeSwitching)
                    || !!(replay && replay._timeframeChanging);
                const dataReady = chart
                    && Array.isArray(chart.data)
                    && chart.data.length > 0
                    && chart.xScale
                    && chart.yScale;

                if (switching || !dataReady) {
                    if (retriesLeft > 0) {
                        attempt(retriesLeft - 1);
                        return;
                    }
                    this._tfRefreshScheduled = false;
                    return;
                }

                this._tfRefreshScheduled = false;
                try {
                    this.refreshDrawingsForTimeframe();
                    if (chart.xScale && chart.yScale) {
                        this.redrawAll({ forceFull: true });
                    }
                    if (typeof chart.render === 'function') {
                        chart.render();
                    }
                } catch (_) { /* ignore */ }

                if (this.drawings.length > 0) {
                    try { this.saveDrawings(); } catch (_) { /* ignore */ }
                }
            };

            if (retriesLeft <= 8) {
                requestAnimationFrame(run);
            } else {
                setTimeout(run, 40);
            }
        };

        attempt(24);
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

        this.drawings.forEach((drawing) => {
            if (!drawing) return;
            drawing.chart = this.chart;

            if (!drawing.timestampPoints || drawing.timestampPoints.length === 0) {
                const lastIdx = this.chart.data.length - 1;
                const pointsNative = Array.isArray(drawing.points) && drawing.points.length > 0
                    && drawing.points.every((p) => p && Number.isFinite(p.x)
                        && p.x >= -1 && p.x <= lastIdx + 1);
                if (pointsNative) {
                    this._captureDrawingTimestampAnchors(drawing);
                }
            }

            if (drawing.timestampPoints && drawing.timestampPoints.length > 0) {
                this._syncDrawingPointsFromTimestamps(drawing, { tfRefresh: true });
            }

            if (drawing.group) {
                try { drawing.group.remove(); } catch (_) { /* ignore */ }
                drawing.group = null;
            }

            this.renderDrawing(drawing, { skipTimestampSync: true });
        });

        if (this.chart && typeof this.chart._clearPanDrawingsLayerTransform === 'function') {
            this.chart._clearPanDrawingsLayerTransform();
        }

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
            // chart.js reads `chart.magnetMode` for snapToOHLC / crosshair; keep in sync with dm.
            if (this.chart) {
                this.chart.magnetMode = mode;
                if (typeof this.chart.syncMagnetButton === 'function') {
                    try { this.chart.syncMagnetButton(); } catch (_) {}
                }
            }
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

    _isFibLikeDrawingType(type) {
        return !!type && (
            type.startsWith('fibonacci-') ||
            type.startsWith('fib-') ||
            type.startsWith('trend-fib-') ||
            type === 'pitchfork' ||
            type === 'pitchfan' ||
            type === 'gann-box' ||
            type === 'gann-fan' ||
            type === 'gann-square' ||
            type === 'gann-square-fixed'
        );
    }

    /**
     * Fib / pitchfan tools: hit-test level lines and trend anchors only (not zone fill / bbox).
     */
    _isPointOnFibLikeStroke(drawing, mouseX, mouseY) {
        if (!drawing?.group || !this._isFibLikeDrawingType(drawing.type)) return false;

        const svgPoint = this.svg?.node?.()?.createSVGPoint?.();
        if (svgPoint) {
            svgPoint.x = mouseX;
            svgPoint.y = mouseY;
        }
        const lineHitTolerance = 14;
        const circleHitTolerance = 14;
        const strokeSelectors = [
            'line.fib-level-hit',
            'line.pitchfork-level-hit',
            'line.pitchfork-handle-hit',
            'line.fib-circles-axis',
            'line.gann-level-hit',
            'line.fib-trend-line',
            'line.fib-tz-anchor',
            'line.fib-arcs-trend',
            'line.fib-arcs-trend-hit',
            'line.fib-wedge-trend',
            'line.fib-wedge-trend-hit',
            'line.fib-fan-anchor'
        ].join(', ');

        for (const element of drawing.group.selectAll(strokeSelectors).nodes()) {
            const elementSel = d3.select(element);
            if (elementSel.style('opacity') === '0') continue;

            if (svgPoint && typeof element.isPointInStroke === 'function' && element.isPointInStroke(svgPoint)) {
                return true;
            }

            const x1 = parseFloat(element.getAttribute('x1'));
            const y1 = parseFloat(element.getAttribute('y1'));
            const x2 = parseFloat(element.getAttribute('x2'));
            const y2 = parseFloat(element.getAttribute('y2'));
            if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) continue;

            const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
            const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
            const effectiveTolerance = Math.max(lineHitTolerance, (strokeWidth / 2) + 0.5);
            if (distance <= effectiveTolerance) return true;
        }

        const pathSelectors = 'path.fib-level-hit, path.fib-arcs-trend, path.fib-spiral-path, path.gann-level-hit';
        for (const element of drawing.group.selectAll(pathSelectors).nodes()) {
            const elementSel = d3.select(element);
            if (elementSel.style('opacity') === '0') continue;
            const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
            if (!stroke || stroke === 'none' || stroke === 'transparent') continue;
            if (svgPoint && typeof element.isPointInStroke === 'function' && element.isPointInStroke(svgPoint)) {
                return true;
            }
        }

        // Fib circles: level rings use ellipse.fib-level-hit (TradingView axis-aligned) or circle.fib-level-hit.
        for (const element of drawing.group.selectAll('ellipse.fib-level-hit, circle.fib-level-hit').nodes()) {
            const elementSel = d3.select(element);
            if (elementSel.style('opacity') === '0') continue;

            if (svgPoint && typeof element.isPointInStroke === 'function' && element.isPointInStroke(svgPoint)) {
                return true;
            }

            const cx = parseFloat(element.getAttribute('cx'));
            const cy = parseFloat(element.getAttribute('cy'));
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

            const tag = element.tagName && element.tagName.toLowerCase();
            if (tag === 'ellipse') {
                const rx = parseFloat(element.getAttribute('rx'));
                const ry = parseFloat(element.getAttribute('ry'));
                if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) continue;
                const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 10;
                const effectiveTolerance = Math.max(circleHitTolerance, (strokeWidth / 2) + 0.5);
                const nx = (mouseX - cx) / rx;
                const ny = (mouseY - cy) / ry;
                const dist = Math.sqrt(nx * nx + ny * ny);
                if (Math.abs(dist - 1) * Math.min(rx, ry) <= effectiveTolerance) return true;
                continue;
            }

            const r = parseFloat(element.getAttribute('r'));
            if (!Number.isFinite(r) || r <= 0) continue;

            const dx = mouseX - cx;
            const dy = mouseY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 10;
            const effectiveTolerance = Math.max(circleHitTolerance, (strokeWidth / 2) + 0.5);
            if (Math.abs(dist - r) <= effectiveTolerance) return true;
        }

        return false;
    }

    /** Pin / signpost / flag: filled body is non-stroke — use group bbox for click + dblclick hit tests. */
    _isPointInCompactLabelDrawingBody(drawing, mouseX, mouseY) {
        if (!drawing?.group) return false;
        const t = drawing.type;
        if (t !== 'flag-mark' && t !== 'signpost-2' && t !== 'pin') return false;
        return this._isPointInDrawingGroupBBox(drawing, mouseX, mouseY, 6);
    }

    _isPointInDrawingGroupBBox(drawing, mouseX, mouseY, pad = 8) {
        try {
            const node = drawing.group.node && drawing.group.node();
            if (!node || typeof node.getBBox !== 'function') return false;
            const bbox = node.getBBox();
            if (!bbox || bbox.width <= 0 || bbox.height <= 0) return false;
            return mouseX >= bbox.x - pad
                && mouseX <= bbox.x + bbox.width + pad
                && mouseY >= bbox.y - pad
                && mouseY <= bbox.y + bbox.height + pad;
        } catch (_) {
            return false;
        }
    }

    _isPatternLikeDrawingType(type) {
        return !!type && (
            type.includes('pattern') ||
            type.startsWith('elliott-') ||
            type === 'head-shoulders' ||
            type === 'three-drives' ||
            type === 'cyclic-lines' ||
            type === 'time-cycles' ||
            type === 'sine-line'
        );
    }

    _drawingRequiresStrokeOnlyDrag(type) {
        return this._isFibLikeDrawingType(type) || this._isPatternLikeDrawingType(type)
            || type === 'flat-top-bottom' || type === 'disjoint-channel'
            || type === 'parallel-channel' || type === 'regression-trend';
    }

    _isWedgeChannelStrokeOnlyType(type) {
        return type === 'flat-top-bottom' || type === 'disjoint-channel'
            || type === 'parallel-channel' || type === 'regression-trend';
    }

    _isPersistentFreehandTool(type) {
        return type === 'brush' || type === 'highlighter';
    }

    /**
     * True when (mx, my) is on a visible stroke (not fib-level-hit padding or zone fills).
     */
    _isPointOnDrawingVisibleStroke(drawing, mouseX, mouseY) {
        if (!drawing?.group) return false;

        const loose = this._drawingRequiresStrokeOnlyDrag(drawing.type);
        const wedgeChannel = this._isWedgeChannelStrokeOnlyType(drawing.type);
        const lineHitTolerance = wedgeChannel ? 10 : (loose ? 14 : 8);
        const minLineHitTolerance = wedgeChannel ? 10 : (loose ? 14 : 0);
        const point = (typeof DOMPoint !== 'undefined') ? new DOMPoint(mouseX, mouseY) : null;

        const elements = drawing.group.selectAll('line, path, polyline').nodes();
        for (const element of elements) {
            const elementSel = d3.select(element);
            if (elementSel.classed('fib-level-hit') || elementSel.classed('gann-level-hit')) {
                const x1 = parseFloat(element.getAttribute('x1'));
                const y1 = parseFloat(element.getAttribute('y1'));
                const x2 = parseFloat(element.getAttribute('x2'));
                const y2 = parseFloat(element.getAttribute('y2'));
                if ([x1, y1, x2, y2].every(Number.isFinite)) {
                    const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                    const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 16;
                    const effectiveTolerance = Math.max(lineHitTolerance, (strokeWidth / 2) + 0.5);
                    if (distance <= effectiveTolerance) return true;
                }
                continue;
            }
            if (elementSel.style('opacity') === '0') continue;

            const isHitLine = elementSel.classed('shape-border-hit');
            const stroke = elementSel.attr('stroke') || elementSel.style('stroke');
            if (!isHitLine && (!stroke || stroke === 'transparent' || stroke === 'none')) continue;
            if (elementSel.classed('shape-fill') || elementSel.classed('upper-fill') || elementSel.classed('lower-fill')) continue;
            if (isHitLine && !wedgeChannel) continue;

            if (element.tagName === 'line') {
                const x1 = parseFloat(element.getAttribute('x1'));
                const y1 = parseFloat(element.getAttribute('y1'));
                const x2 = parseFloat(element.getAttribute('x2'));
                const y2 = parseFloat(element.getAttribute('y2'));
                if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) continue;

                const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                const strokeWidth = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 2;
                const effectiveTolerance = Math.max(lineHitTolerance, minLineHitTolerance, (strokeWidth / 2) + 0.5);
                if (distance <= effectiveTolerance) return true;
                continue;
            }

            if (!isHitLine && point && typeof element.isPointInStroke === 'function' && element.isPointInStroke(point)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Selected drawings under (mx, my): stroke hit first, then visual bounds for fill/body drags.
     */
    _isPointInDrawingVisualBounds(drawing, mx, my) {
        const groupNode = drawing?.group?.node?.();
        if (!groupNode) return false;
        try {
            const br = groupNode.getBoundingClientRect();
            const z = (this.chart && typeof this.chart._v9LayoutZoom === 'function')
                ? this.chart._v9LayoutZoom()
                : 1;
            const layoutRect = (this.chart && typeof this.chart._pointerLayoutRect === 'function')
                ? this.chart._pointerLayoutRect()
                : (this.chart?.canvas?.parentElement || this.chart?.canvas)?.getBoundingClientRect();
            if (!layoutRect) return false;
            const clientX = layoutRect.left + mx * z;
            const clientY = layoutRect.top + my * z;
            return clientX >= br.left && clientX <= br.right
                && clientY >= br.top && clientY <= br.bottom;
        } catch (_) {
            return false;
        }
    }

    _isAnchoredVwapAnchorHit(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'anchored-vwap') return false;
        const anchor = Array.isArray(drawing.points) ? drawing.points[0] : null;
        const chart = this.chart;
        const yScale = chart && chart.yScale ? chart.yScale : null;
        if (!anchor || !yScale) return false;
        const anchorIndex = Math.max(0, Math.round(anchor.x));
        const anchorX = (chart && typeof chart.dataIndexToPixel === 'function')
            ? chart.dataIndexToPixel(anchorIndex)
            : (chart.xScale ? chart.xScale(anchorIndex) : NaN);
        let anchorYValue = anchor.y;
        const data = chart && Array.isArray(chart.data) ? chart.data : [];
        const candle = data[anchorIndex];
        if (candle) {
            const close = Number(candle.c ?? candle.close);
            if (Number.isFinite(close)) anchorYValue = close;
        }
        const anchorY = yScale(anchorYValue);
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return false;
        const dx = mouseX - anchorX;
        const dy = mouseY - anchorY;
        return Math.sqrt(dx * dx + dy * dy) <= 20;
    }

    /**
     * Selected drawings under (mx, my): stroke hit first, then bbox for fill/body drags.
     */
    _getSelectedDrawingsAtPoint(mx, my) {
        const selected = (this.selectedDrawings || []).filter((d) => d && !d.locked);
        if (selected.length === 0) return [];

        const strokeHits = this.findDrawingsAtPoint(mx, my, { includeVolumeProfileBodyHit: true }) || [];
        const strokeSelected = selected.filter((d) => strokeHits.includes(d));
        if (strokeSelected.length > 0) return strokeSelected;

        return selected.filter((d) => {
            if (d.type === 'anchored-vwap') {
                return this._isAnchoredVwapAnchorHit(d, mx, my);
            }
            if (d.type === 'anchored-volume-profile') {
                return this.isVolumeProfileAnchorBoundaryHit(d, mx, my);
            }
            if (this._isBoxShapeType(d.type)) {
                return this._isPointOnDrawingVisibleStroke(d, mx, my)
                    || this._isPointOnResizeHandle(d, mx, my);
            }
            if (this._drawingRequiresStrokeOnlyDrag(d.type)) {
                if (d.type === 'fib-wedge' && this._isPointInFibWedgeBody(d, mx, my)) return true;
                return this._isPointOnDrawingVisibleStroke(d, mx, my);
            }
            return this._isPointInDrawingVisualBounds(d, mx, my);
        });
    }

    /**
     * Padding around selected bounds so Ctrl near a selection starts move, not marquee.
     */
    _isPointNearAnySelectedDrawing(mx, my, padding = 20) {
        const selected = (this.selectedDrawings || []).filter((d) => d && !d.locked);
        if (selected.length === 0) return false;
        const z = (this.chart && typeof this.chart._v9LayoutZoom === 'function')
            ? this.chart._v9LayoutZoom()
            : 1;
        const pad = padding * z;
        return selected.some((d) => {
            if (d.type === 'anchored-vwap') {
                return this._isAnchoredVwapAnchorHit(d, mx, my);
            }
            if (d.type === 'anchored-volume-profile') {
                return this.isVolumeProfileAnchorBoundaryHit(d, mx, my);
            }
            if (this._drawingRequiresStrokeOnlyDrag(d.type)) {
                if (d.type === 'fib-wedge' && this._isPointInFibWedgeBody(d, mx, my)) return true;
                return this._isPointOnDrawingVisibleStroke(d, mx, my);
            }
            const groupNode = d?.group?.node?.();
            if (!groupNode) return false;
            try {
                const br = groupNode.getBoundingClientRect();
                const layoutRect = (this.chart && typeof this.chart._pointerLayoutRect === 'function')
                    ? this.chart._pointerLayoutRect()
                    : (this.chart?.canvas?.parentElement || this.chart?.canvas)?.getBoundingClientRect();
                if (!layoutRect) return false;
                const clientX = layoutRect.left + mx * z;
                const clientY = layoutRect.top + my * z;
                return clientX >= br.left - pad && clientX <= br.right + pad
                    && clientY >= br.top - pad && clientY <= br.bottom + pad;
            } catch (_) {
                return false;
            }
        });
    }

    _stopDirectMoveDrag(options = {}) {
        this._clearAxisHighlightDragState();
        const hadDirectMove = !!(this._directMoveMoveHandler || this._directMoveUpHandler);
        if (this._directMoveMoveHandler) {
            document.removeEventListener('mousemove', this._directMoveMoveHandler, true);
            this._directMoveMoveHandler = null;
        }
        if (this._directMoveUpHandler) {
            document.removeEventListener('mouseup', this._directMoveUpHandler, true);
            this._directMoveUpHandler = null;
        }
        this._directMoveDrawings = null;
        if (!options.skipLiveInteractionEnd && hadDirectMove && (this._drawingLiveInteractionDepth || 0) > 0) {
            this._endDrawingLiveInteraction();
        }
        this._directMovePendingFrame = false;
        this._directMoveLastEvent = null;
        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (canvas) canvas.style.cursor = '';
        if (this.svg) {
            const cursorStyle = this.chart?.getCurrentCursorStyle ? this.chart.getCurrentCursorStyle() : 'default';
            this.svg.style('cursor', cursorStyle);
        }
    }

    /**
     * Ctrl+drag on the current selection → move all selected drawings (not marquee).
     * @returns {boolean} true when the gesture was consumed
     */
    _tryStartCtrlSelectionMove(event) {
        if (!event || event.button !== 0 || !event.ctrlKey || event.shiftKey || this.currentTool || this.isRectSelecting) {
            return false;
        }
        const toMove = (this.selectedDrawings || []).filter((d) =>
            d && !d.locked && !this._isHorizontalAnchorToolType(d.type)
        );
        // Single selected shapes use d3 body drag (even with Ctrl held); direct-move is for multi-select.
        if (toMove.length <= 1) return false;

        const [mx, my] = this._eventCanvasLocalXY(event);
        const onSelection = this._getSelectedDrawingsAtPoint(mx, my).length > 0
            || this._isPointNearAnySelectedDrawing(mx, my);
        if (!onSelection) return false;

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
        this._startDirectMoveDrag(toMove, event);
        return true;
    }

    /**
     * Stop an in-progress chart Ctrl+marquee so it cannot fight a drawing move drag.
     */
    _cancelChartCtrlMarqueeIfActive() {
        const chart = this.chart;
        if (!chart) return;
        if (chart.ctrlMarqueeSelect) {
            chart.ctrlMarqueeSelect.active = false;
        }
        if (chart.drag && chart.drag.type === 'ctrlMarqueeSelect') {
            chart.drag.active = false;
            chart.drag.type = null;
        }
        if (typeof chart.scheduleRender === 'function') {
            chart.scheduleRender();
        }
    }

    /**
     * True when the cursor tool is active (no drawing tool armed).
     */
    _isCursorSelectMode() {
        return !this.currentTool;
    }

    /**
     * Whether a Ctrl+marquee gesture is in progress (chart canvas or legacy SVG rect).
     */
    isCtrlMarqueeGestureActive() {
        return !!(
            this.isRectSelecting
            || (this.chart && this.chart.ctrlMarqueeSelect && this.chart.ctrlMarqueeSelect.active)
        );
    }

    /**
     * Called by chart.js when Ctrl+drag marquee begins on the canvas.
     */
    prepareCtrlMarqueeSelectFromChart() {
        this.cancelRectangularSelection();
        this._stopDirectMoveDrag();
        if (this.isDragging) {
            this.endDrag();
        }
    }

    /**
     * Apply Ctrl+marquee selection from chart.js canvas coordinates.
     */
    completeCtrlMarqueeFromChart(rectX, rectY, rectWidth, rectHeight) {
        if (rectWidth < 3 && rectHeight < 3) return;
        if (this._directMoveMoveHandler) return;

        const selectedDrawings = [];
        this.drawings.forEach((drawing) => {
            if (this.isDrawingInRectangle(drawing, rectX, rectY, rectWidth, rectHeight)) {
                selectedDrawings.push(drawing);
            }
        });

        this.deselectAll({ forSelectionChange: true });
        selectedDrawings.forEach((drawing) => {
            this.selectDrawing(drawing, true);
        });
    }

    /**
     * Cancel an in-progress Ctrl+marquee initiated from chart.js.
     */
    cancelCtrlMarqueeSelectFromChart() {
        this.cancelRectangularSelection();
    }

    /**
     * Start rectangular selection (Ctrl+drag) — legacy SVG path; prefer chart.js marquee.
     */
    startRectangularSelection(event) {
        // Prevent default behavior and stop propagation
        event.preventDefault();
        event.stopPropagation();
        
        const [sx, sy] = this._eventCanvasLocalXY(event);
        this.rectSelectStart = { x: sx, y: sy };
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
        
        const [currentX, currentY] = this._eventCanvasLocalXY(event);
        
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
        this.deselectAll({ forSelectionChange: true });
        
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
     * @param {boolean} [options.includeVolumeProfileBodyHit] - legacy option (ignored); VP body/bar hits are always evaluated
     * @returns {Array} - Drawings at this point: closest stroke first; on ties, higher z (later in
     *     `this.drawings` / visually on top) wins so selection matches what you see.
     */
    findDrawingsAtPoint(mouseX, mouseY, options = {}) {
        const baseHitTolerance = 10; // pixels - how close to a line to consider it a hit
        const hitsById = new Map(); // drawingId -> { drawing, distance, z }
        
        // Check if mouse is outside the chart's visible area (in axis regions)
        // This prevents detecting shapes that are visually clipped behind the axes
        const m = this.chart?.margin;
        const w = this.chart?.w || this.chart?.canvas?.width || 800;
        const h = this.chart?.h || this.chart?.canvas?.height || 600;
        
        if (m) {
            const chartLeft = m.l;
            const chartRight = w - m.r;
            const chartTop = m.t;
            const chartBottom = h - m.b;
            
            // If mouse is in the Y-axis area (left) or right axis area, return empty
            if (mouseX < chartLeft || mouseX > chartRight || mouseY < chartTop || mouseY > chartBottom) {
                return [];
            }
        }
        
        const point = this.svg.node().createSVGPoint();
        point.x = mouseX;
        point.y = mouseY;
        
        // Only check strokes/lines - NO fill detection
        let z = 0;
        for (const drawing of this.drawings) {
            z++;
            if (drawing.visible === false || drawing.hidden === true || this._isHiddenByGlobalVisibility(drawing)) continue;
            if (!this._isVisibleForCurrentTimeframe(drawing)) continue;

            const pointStrokeHit = this._distanceToLineDrawingStroke(drawing, mouseX, mouseY);
            if (pointStrokeHit && !hitsById.has(drawing.id)) {
                if (pointStrokeHit.distance <= pointStrokeHit.tolerance) {
                    hitsById.set(drawing.id, { drawing, distance: pointStrokeHit.distance, z });
                    continue;
                }
            }

            if (!drawing.group) continue;

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

            const isFibLikeType = this._isFibLikeDrawingType(drawing.type);

            if (isFibLikeType && !hitsById.has(drawing.id) && this._isPointOnFibLikeStroke(drawing, mouseX, mouseY)) {
                hitsById.set(drawing.id, { drawing, distance: 0, z });
                continue;
            }
            if ((drawing.type === 'gann-box' || drawing.type === 'gann-square-fixed' || drawing.type === 'gann-fan') && !hitsById.has(drawing.id)) {
                if (this._isPointOnGannToolBody(drawing, mouseX, mouseY)
                    && !this._isPointOnGannLevelAdjustHit(drawing, mouseX, mouseY)) {
                    hitsById.set(drawing.id, { drawing, distance: 0, z });
                    continue;
                }
            }
            if (drawing.type === 'fib-wedge' && !hitsById.has(drawing.id)) {
                if (this._isPointInFibWedgeBody(drawing, mouseX, mouseY)) {
                    hitsById.set(drawing.id, { drawing, distance: 0, z });
                    continue;
                }
            }
            if (isFibLikeType && drawing.type !== 'pitchfork' && drawing.type !== 'pitchfan' && !hitsById.has(drawing.id)) {
                continue;
            }

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
                    const isAnchoredVolumeProfile = drawing.type === 'anchored-volume-profile';

                    // Anchored profile: handle + anchor line + body for hover/select/dblclick; only handle is interactive.
                    if (isAnchoredVolumeProfile) {
                        if (this.isVolumeProfileAnchorBoundaryHit(drawing, mouseX, mouseY)) {
                            hitsById.set(drawing.id, { drawing, distance: 0, z });
                        } else if (this.isVolumeProfileAnchoredAnchorLineHit(drawing, mouseX, mouseY)) {
                            hitsById.set(drawing.id, { drawing, distance: 1, z });
                        } else if (this.isVolumeProfileAnchoredBodyHit(drawing, mouseX, mouseY)) {
                            hitsById.set(drawing.id, { drawing, distance: 2, z });
                        }
                        continue;
                    }

                    // Allow clicking anywhere inside the profile body (not only near 1px boundaries).
                    const allowProfileBodyZoneHit = true;
                    const allowProfileBarHit = true;
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
            
            // Flag / signpost / pin: select and dblclick from filled body, not only thin strokes.
            if (!hitsById.has(drawing.id) && this._isPointInCompactLabelDrawingBody(drawing, mouseX, mouseY)) {
                hitsById.set(drawing.id, { drawing, distance: 0, z });
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

                    if (elementSel.classed('gann-box-hitbox')
                        || elementSel.classed('gann-fan-hitbox')
                        || elementSel.classed('gann-square-fixed-hitbox')
                        || elementSel.classed('fib-wedge-hitbox')) {
                        continue;
                    }

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
                    const strokeWidthAttr = parseFloat(elementSel.attr('stroke-width') || elementSel.style('stroke-width')) || 0;
                    const isTransparentStrokeHitArea = (stroke === 'transparent' || stroke === 'none' || !stroke)
                        && (pointerEvents === 'stroke' || pointerEvents === 'all' || strokeWidthAttr >= 8);

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

        const isFibLikeDrawingType = (type) => this._isFibLikeDrawingType(type);

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

        // One ordering for hit list + click selection: nearest stroke, then line tools over fills/blobs on ties,
        // then higher z (top of stack). Older logic inverted z for shape-vs-shape so [0] was the *back* shape —
        // that disagreed with "select topmost" and with Alt+click cycling.
        hits.sort((a, b) => {
            const aType = a.drawing && a.drawing.type;
            const bType = b.drawing && b.drawing.type;
            const aIsLine = isLineLikeDrawingType(aType);
            const bIsLine = isLineLikeDrawingType(bType);

            if (a.distance !== b.distance) return a.distance - b.distance;

            if (aIsLine !== bIsLine) return aIsLine ? -1 : 1;

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
            const isFibLikeDrawing = this._isFibLikeDrawingType(drawingType);
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
                    const elementSel = d3.select(element);
                    const isFibHit = elementSel.classed('fib-level-hit') || elementSel.classed('gann-level-hit')
                        || elementSel.classed('pitchfork-level-hit') || elementSel.classed('pitchfork-handle-hit');
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
                        const effectiveTolerance = Math.max(
                            lineHitTolerance,
                            isFibHit ? (strokeWidth / 2) + 0.5 : strokeWidth * 2
                        );
                        
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
        
        const uniqDrawings = [...new Set(lines.map(l => l.drawing).filter(Boolean))];
        uniqDrawings.sort((a, b) => {
            const ia = this.drawings.indexOf(a);
            const ib = this.drawings.indexOf(b);
            if (ia === -1 || ib === -1) return 0;
            return ib - ia;
        });

        return {
            isStacked: isStacked,
            lines: lines,
            count: lines.length,
            drawings: uniqDrawings
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
        const [mouseX, mouseY] = this._clientXYToLayoutXY(clientX, clientY);
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
        const [mouseX, mouseY] = this._clientXYToLayoutXY(clientX, clientY);
        return this.findLinesAtPoint(mouseX, mouseY);
    }
    
    /**
     * Get the last detected stacked lines info (from the most recent click)
     * @returns {Object|null} - Last stacked lines info or null if none
     */
    getLastStackedLines() {
        return this.lastStackedLines || null;
    }

    /** True when pointer is inside a fixed-range volume profile body (anchor box + extensions). */
    isVolumeProfileBodyInside(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }
        if (drawing.type === 'anchored-volume-profile') {
            return this.isVolumeProfileAnchoredBodyHit(drawing, mouseX, mouseY);
        }

        try {
            const insideRect = (rectNode, pad = 0) => {
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

            const hitbox = drawing.group.select('.volume-profile-hitbox').node();
            const range = drawing.group.select('.volume-profile-range').node();
            if (insideRect(hitbox, 0.75) || insideRect(range, 0.75)) {
                return true;
            }

            const boundaryLines = drawing.group.selectAll('.volume-profile-boundary').nodes();
            if (Array.isArray(boundaryLines) && boundaryLines.length >= 1) {
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
                if (xValues.length >= 1 && Number.isFinite(minY) && Number.isFinite(maxY)) {
                    const minX = Math.min(...xValues);
                    const maxX = Math.max(...xValues);
                    return mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
                }
            }
        } catch (_) {}
        return false;
    }

    findVolumeProfilePanBlockDrawingAtPoint(mouseX, mouseY) {
        if (!Array.isArray(this.drawings)) return null;
        for (let i = this.drawings.length - 1; i >= 0; i--) {
            const drawing = this.drawings[i];
            if (!drawing || !this.isCandleBoundTool(drawing.type)) continue;
            if (this.isVolumeProfileBodyInside(drawing, mouseX, mouseY)) {
                return drawing;
            }
        }
        return null;
    }

    /** Block chart pan/drag when the pointer is over fixed-range VP background (not level lines). */
    isVolumeProfileChartPanBlockedAtPoint(mouseX, mouseY) {
        const drawing = this.findVolumeProfilePanBlockDrawingAtPoint(mouseX, mouseY);
        if (!drawing) return false;
        if (this.isVolumeProfileLevelLineHit(drawing, mouseX, mouseY)) return false;
        if (this.isVolumeProfileBoundaryHit(drawing, mouseX, mouseY)) return false;
        if (this.isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY)) return false;
        return true;
    }

    /** Volume profile bar rects (not zone background). */
    isVolumeProfileBarHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }
        try {
            const barRects = drawing.group.selectAll('rect').nodes();
            for (const rect of barRects) {
                if (!rect) continue;
                if (d3.select(rect).classed('volume-profile-range')) continue;
                const x = Number(rect.getAttribute('x'));
                const y = Number(rect.getAttribute('y'));
                const width = Number(rect.getAttribute('width'));
                const height = Number(rect.getAttribute('height'));
                if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
                if (mouseX >= (x - 0.75) && mouseX <= (x + width + 0.75)
                    && mouseY >= (y - 0.75) && mouseY <= (y + height + 0.75)) {
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    /** Anchor / range boundary lines and resize handles. */
    isVolumeProfileBoundaryHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }
        const baseHitTolerance = 10;
        try {
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
                    : Math.max(baseHitTolerance, (strokeWidth / 2) + 0.5);
                const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                if (distance <= tolerance) {
                    bestBoundaryDistance = Math.min(bestBoundaryDistance, distance);
                }
            }
            return bestBoundaryDistance !== Infinity;
        } catch (_) {}
        return false;
    }

    /** Anchor resize handle only — not the vertical guide line (anchored volume profile). */
    isVolumeProfileAnchorBoundaryHit(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'anchored-volume-profile' || !drawing.group) {
            return false;
        }
        try {
            const handleNodes = drawing.group.selectAll(
                '.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"]'
            ).nodes();
            for (const node of handleNodes) {
                if (!node) continue;
                const cx = parseFloat(node.getAttribute('cx'));
                const cy = parseFloat(node.getAttribute('cy'));
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
                const r = parseFloat(node.getAttribute('r'));
                const hitR = (Number.isFinite(r) ? r : 14) + 4;
                const dx = mouseX - cx;
                const dy = mouseY - cy;
                if ((dx * dx) + (dy * dy) <= hitR * hitR) {
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    /** Vertical anchor guide line — hover reveals resize point (anchored volume profile). */
    isVolumeProfileAnchoredAnchorLineHit(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'anchored-volume-profile' || !drawing.group) {
            return false;
        }
        const baseHitTolerance = 10;
        try {
            const anchorLines = drawing.group.selectAll('.volume-profile-anchor-boundary').nodes();
            for (const el of anchorLines) {
                if (!el) continue;
                const x1 = parseFloat(el.getAttribute('x1'));
                const y1 = parseFloat(el.getAttribute('y1'));
                const x2 = parseFloat(el.getAttribute('x2'));
                const y2 = parseFloat(el.getAttribute('y2'));
                if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
                const elSel = d3.select(el);
                const strokeWidth = parseFloat(elSel.attr('stroke-width') || elSel.style('stroke-width')) || 1;
                const tolerance = Math.max(baseHitTolerance, (strokeWidth / 2) + 6);
                const distance = this.pointToLineDistance(mouseX, mouseY, x1, y1, x2, y2);
                if (distance <= tolerance) {
                    return true;
                }
            }
        } catch (_) {}
        return false;
    }

    shouldShowAnchoredVolumeProfileHoverHandle(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'anchored-volume-profile') return false;
        if (drawing.selected) return true;
        return this.isVolumeProfileAnchorBoundaryHit(drawing, mouseX, mouseY)
            || this.isVolumeProfileAnchoredAnchorLineHit(drawing, mouseX, mouseY);
    }

    /** Profile body/zone for anchored VP — select + dblclick settings only (not drag/resize). */
    isVolumeProfileAnchoredBodyHit(drawing, mouseX, mouseY) {
        if (!drawing || drawing.type !== 'anchored-volume-profile' || !drawing.group) {
            return false;
        }
        try {
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

            const rangeRect = drawing.group.select('.volume-profile-range').node();
            if (isInsideRect(rangeRect, 0.75)) {
                return true;
            }

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
                if (mouseX >= (x - 0.75) && mouseX <= (x + width + 0.75)
                    && mouseY >= (y - 0.75) && mouseY <= (y + height + 0.75)) {
                    return true;
                }
            }

            const boundaryLines = drawing.group.selectAll('.volume-profile-boundary').nodes();
            if (Array.isArray(boundaryLines) && boundaryLines.length >= 1) {
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
                if (xValues.length >= 1 && Number.isFinite(minY) && Number.isFinite(maxY)) {
                    const minX = Math.min(...xValues);
                    const maxX = Math.max(...xValues);
                    return mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
                }
            }
        } catch (_) {}
        return false;
    }

    /** True when the pointer is inside the VP zone fill but not on bars, boundaries, level lines, or labels. */
    isVolumeProfileZoneFillHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }
        if (drawing.type === 'anchored-volume-profile') {
            return false;
        }

        if (!this.isVolumeProfileBodyInside(drawing, mouseX, mouseY)) {
            return false;
        }

        return !this.isVolumeProfileInteractiveHit(drawing, mouseX, mouseY);
    }

    /** Bars, boundaries, level lines, and value labels — not empty zone fill. */
    isVolumeProfileInteractiveHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type)) return false;
        if (drawing.type === 'anchored-volume-profile') {
            return this.isVolumeProfileAnchorBoundaryHit(drawing, mouseX, mouseY);
        }
        if (this.isVolumeProfileBoundaryHit(drawing, mouseX, mouseY)) return true;
        if (this.isVolumeProfileLevelLineHit(drawing, mouseX, mouseY)) return true;
        if (this.isVolumeProfileValuesLabelHit(drawing, mouseX, mouseY)) return true;
        return false;
    }

    /**
     * Returns true when the given screen-space point is on a volume profile level line,
     * and not closer to a draggable boundary handle/line.
     */
    isVolumeProfileLevelLineHit(drawing, mouseX, mouseY) {
        if (!drawing || !this.isVolumeProfileToolType(drawing.type) || !drawing.group) {
            return false;
        }
        if (drawing.type === 'anchored-volume-profile') {
            return false;
        }

        const levelLines = drawing.group.selectAll('.volume-profile-level-line.shape-border-hit').nodes();
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
        if (this._isPlacementModeActive()) {
            return;
        }

        const [mouseX, mouseY] = this._eventCanvasLocalXY(event);
        
        const canvas = (this.chart && this.chart.canvas) || document.getElementById('chartCanvas');
        if (!canvas) return;

        if (this.isResizing || this.isCustomHandleDrag) {
            canvas.style.cursor = 'ew-resize';
            this.svg.style('cursor', 'ew-resize');
            this._cursorOverLine = true;
            return;
        }

        if (this.isDragging || this.isDraggingFirstTwo || this._isDrawingGeometryMoveActive()) {
            canvas.style.cursor = 'move';
            this.svg.style('cursor', 'move');
            this._cursorOverLine = true;
            return;
        }

        const textHoverNodes = this.svg.selectAll('.inline-editable-text, .text-body-hit, .pin-body-hit').nodes();
        const textHelpers = typeof window !== 'undefined' ? window.DrawingTextHelpers : null;
        let isOverTextHitArea = false;
        let textHoverCursor = 'move';
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
                if (n.classList && n.classList.contains('inline-editable-text') && textHelpers) {
                    const drawing = textHelpers.findDrawingFromDomNode(n, this);
                    if (drawing && textHelpers.canTextAnnotationOpenInlineEdit(drawing)) {
                        textHoverCursor = 'text';
                    }
                }
                break;
            }
        }

        if (isOverTextHitArea) {
            canvas.style.cursor = textHoverCursor;
            this.svg.style('cursor', textHoverCursor);
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
            const hoveredDrawing = drawingsAtPoint[0];
            let cursorStyle = 'move';
            if (hoveredDrawing && this._isPointOnResizeHandle(hoveredDrawing, mouseX, mouseY)) {
                cursorStyle = 'nwse-resize';
            } else if (hoveredDrawing && hoveredDrawing.type === 'anchored-volume-profile') {
                if (this.isVolumeProfileAnchorBoundaryHit(hoveredDrawing, mouseX, mouseY)
                    || this.isVolumeProfileAnchoredAnchorLineHit(hoveredDrawing, mouseX, mouseY)) {
                    cursorStyle = 'ew-resize';
                }
            }
            canvas.style.cursor = cursorStyle;
            this.svg.style('cursor', cursorStyle);
            this._cursorOverLine = true;

            if (hoveredDrawing && hoveredDrawing.group) {
                const showAvHoverHandle = this.shouldShowAnchoredVolumeProfileHoverHandle(
                    hoveredDrawing,
                    mouseX,
                    mouseY
                );

                // Clear previous hover
                if (this._hoveredDrawing && this._hoveredDrawing !== hoveredDrawing) {
                    if (this._hoveredDrawing.group) {
                        SVGHelpers.applyHoverEffect(this._hoveredDrawing.group, false);
                        if (!this._hoveredDrawing.selected) {
                            this._hoveredDrawing.group.selectAll('.resize-handle, .custom-handle').style('opacity', 0);
                            this._hoveredDrawing.group.selectAll('.resize-handle, .resize-handle-hit, .custom-handle')
                                .style('pointer-events', 'none');
                            this._hoveredDrawing.group.selectAll('.shape-border-hit')
                                .style('pointer-events', 'stroke');
                        }
                    }
                }

                // Apply hover effect + show handles (if not selected)
                SVGHelpers.applyHoverEffect(hoveredDrawing.group, true);
                if (!hoveredDrawing.selected) {
                    if (hoveredDrawing.type === 'anchored-volume-profile') {
                        if (showAvHoverHandle) {
                            hoveredDrawing.group.selectAll('.resize-handle[data-point-index="0"], .custom-handle')
                                .style('opacity', 1);
                            if (!this._isPlacementModeActive()) {
                                hoveredDrawing.group.selectAll('.resize-handle[data-point-index="0"]')
                                    .style('pointer-events', 'none');
                                hoveredDrawing.group.selectAll(
                                    '.resize-handle-hit[data-point-index="0"], .custom-handle'
                                ).style('pointer-events', 'all');
                            }
                        } else {
                            hoveredDrawing.group.selectAll('.resize-handle[data-point-index="0"], .custom-handle')
                                .style('opacity', 0);
                            hoveredDrawing.group.selectAll(
                                '.resize-handle[data-point-index="0"], .resize-handle-hit[data-point-index="0"], .custom-handle'
                            ).style('pointer-events', 'none');
                        }
                    } else {
                        hoveredDrawing.group.selectAll('.resize-handle, .custom-handle').style('opacity', 1);
                        if (!this._isPlacementModeActive()) {
                            hoveredDrawing.group.selectAll('.resize-handle').style('pointer-events', 'none');
                            hoveredDrawing.group.selectAll('.resize-handle-hit, .custom-handle')
                                .style('pointer-events', 'all');
                            hoveredDrawing.group.selectAll('.shape-border-hit')
                                .style('pointer-events', 'none');
                            this._raiseResizeHandles(hoveredDrawing);
                        }
                    }
                } else if (hoveredDrawing.type === 'anchored-volume-profile') {
                    hoveredDrawing.group.selectAll('.resize-handle[data-point-index="0"], .custom-handle')
                        .style('opacity', 1);
                }

                const shouldBindHoverResize =
                    !this._isPlacementModeActive() &&
                    !this._skipHandleSetup &&
                    !this.isResizing &&
                    !hoveredDrawing.locked &&
                    (hoveredDrawing.type !== 'anchored-volume-profile' || showAvHoverHandle);

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
                        this._hoveredDrawing.group.selectAll('.shape-border-hit')
                            .style('pointer-events', 'stroke');
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

        this._updateAxisZonePointerEvents();
    }
    /**
     * Load saved tool styles from localStorage
     */
    loadSavedToolStyles() {
        try {
            const saved = userStorage.getItem('drawingToolStyles');
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
            const payload = JSON.parse(JSON.stringify(this.savedToolStyles));
            if (typeof window !== 'undefined' && window.preferencesSync && typeof window.preferencesSync.updatePreference === 'function') {
                window.preferencesSync.updatePreference('drawing_tool_styles', payload);
            } else {
                userStorage.setItem('drawingToolStyles', JSON.stringify(this.savedToolStyles));
            }
        } catch (e) {
            console.warn('Failed to save tool style:', e);
        }
    }

    /**
     * Keep savedToolStyles aligned with preferences sync (cloud GET + userStorage) after refresh.
     */
    _bindToolStylesToPreferencesSync() {
        if (this._toolStylesPrefBound) return;
        this._toolStylesPrefBound = true;

        this._onDrawingToolStylesPreferencesLoaded = () => {
            try {
                const styles = window.preferencesSync && window.preferencesSync.get('drawing_tool_styles', null);
                if (styles && typeof styles === 'object' && Object.keys(styles).length > 0) {
                    this.savedToolStyles = JSON.parse(JSON.stringify(styles));
                } else {
                    this.savedToolStyles = this.loadSavedToolStyles();
                }
            } catch (e) {
                this.savedToolStyles = this.loadSavedToolStyles();
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('preferencesLoaded', this._onDrawingToolStylesPreferencesLoaded);
            if (window.preferencesSync && typeof window.preferencesSync.isReady === 'function' && window.preferencesSync.isReady()) {
                this._onDrawingToolStylesPreferencesLoaded();
            }
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
     * Baseline style patch for a tool type (light gray lines + fill) before V9/saved overrides.
     */
    getDefaultToolStylePatch(toolType) {
        if (!toolType || toolType === 'long-position' || toolType === 'short-position') {
            return {};
        }
        const stroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
            ? DRAWING_TOOL_DEFAULT_STROKE
            : '#8C8C8C';
        const fill = typeof DRAWING_TOOL_DEFAULT_FILL !== 'undefined'
            ? DRAWING_TOOL_DEFAULT_FILL
            : 'rgba(140, 140, 140, 0.2)';

        if (toolType === 'brush') {
            return {
                stroke,
                color: stroke,
                lineColor: stroke,
                strokeWidth: 2,
                opacity: 1,
                dashArray: '',
                strokeDasharray: '',
                showPriceLabel: false,
                showTimeLabel: false,
                startStyle: 'normal',
                endStyle: 'normal',
            };
        }

        if (toolType === 'highlighter') {
            const hlStroke = 'rgba(140, 140, 140, 0.35)';
            return {
                stroke: hlStroke,
                color: hlStroke,
                lineColor: hlStroke,
                strokeWidth: 20,
                opacity: 1,
                dashArray: '',
                strokeDasharray: '',
                showPriceLabel: false,
                showTimeLabel: false,
            };
        }

        if (toolType === 'note') {
            return {
                textColor: '#FFFFFF',
                fontSize: 12,
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textAlign: 'left',
                stroke: '#787b86',
                strokeWidth: 1,
                fill: 'rgba(50, 50, 50, 0.9)',
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                wrapText: false,
                maxWidth: 260,
            };
        }

        if (toolType === 'price-note') {
            const lineStroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
                ? DRAWING_TOOL_DEFAULT_STROKE
                : '#2962ff';
            return {
                textColor: '#FFFFFF',
                fontSize: 12,
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 'normal',
                fontStyle: 'normal',
                stroke: lineStroke,
                strokeWidth: 1,
                fill: '#2962ff',
                borderColor: 'none',
            };
        }

        const textTypographyBase = {
            fontFamily: 'Roboto, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
        };

        if (toolType === 'callout') {
            const anchorStroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
                ? DRAWING_TOOL_DEFAULT_STROKE
                : '#8C8C8C';
            return {
                ...textTypographyBase,
                textColor: '#F23645',
                fontSize: 14,
                fontFamily: 'Arial, sans-serif',
                textAlign: 'left',
                stroke: anchorStroke,
                backgroundColor: '#FFFFFF',
                borderColor: '#B2B5BE',
                wrapText: false,
                maxWidth: 280,
            };
        }

        if (toolType === 'comment') {
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 14,
                textAlign: 'center',
                backgroundColor: '#2962FF',
                borderColor: 'transparent',
                wrapText: false,
                maxWidth: 280,
            };
        }

        if (toolType === 'text') {
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 14,
                textAlign: 'left',
                fill: 'none',
                stroke: 'none',
                wrapText: false,
                maxWidth: 200,
                anchored: false,
            };
        }

        if (toolType === 'notebox') {
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 12,
                backgroundColor: 'rgba(41, 98, 255, 0.9)',
                wrapText: false,
                maxWidth: 200,
            };
        }

        if (toolType === 'anchored-text') {
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 12,
                backgroundColor: 'rgba(41, 98, 255, 0.9)',
                borderColor: '#B2B5BE',
                wrapText: false,
                maxWidth: 200,
            };
        }

        if (toolType === 'pin') {
            const pinStroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
                ? DRAWING_TOOL_DEFAULT_STROKE
                : '#2962ff';
            return {
                ...textTypographyBase,
                textColor: '#d1d4dc',
                fontSize: 14,
                fill: pinStroke,
                stroke: pinStroke,
                backgroundColor: '#363a45',
                borderColor: '#555',
                wrapText: false,
            };
        }

        if (toolType === 'signpost-2') {
            return {
                ...textTypographyBase,
                textColor: '#d1d4dc',
                fontSize: 13,
                fill: '#2e3238',
                stroke: '#787b86',
                borderColor: '#787b86',
                wrapText: false,
            };
        }

        if (toolType === 'price-label') {
            const lineStroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
                ? DRAWING_TOOL_DEFAULT_STROKE
                : '#2962ff';
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 12,
                stroke: lineStroke,
                strokeWidth: 1,
                fill: '#2962ff',
            };
        }

        if (toolType === 'price-label-2') {
            const lineStroke = typeof DRAWING_TOOL_DEFAULT_STROKE !== 'undefined'
                ? DRAWING_TOOL_DEFAULT_STROKE
                : '#2962ff';
            return {
                ...textTypographyBase,
                textColor: '#FFFFFF',
                fontSize: 14,
                fontWeight: 'bold',
                stroke: lineStroke,
                strokeWidth: 1,
                fill: '#2962ff',
            };
        }

        const textAnnotationTypes = new Set([
            'label', 'signpost', 'flag-mark', 'table', 'emoji', 'image',
        ]);
        if (textAnnotationTypes.has(toolType)) {
            return {
                textColor: '#FFFFFF',
                fontSize: 14,
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 'normal',
                fontStyle: 'normal',
                textAlign: 'left',
                fill: 'none',
                stroke: 'none',
                backgroundColor: 'transparent',
                showBackground: false,
                borderEnabled: false,
                borderColor: 'none',
            };
        }

        if (toolType === 'fib-wedge' || toolType === 'fib-arcs') {
            return {
                stroke,
                color: stroke,
                lineColor: stroke,
                strokeWidth: 1,
                opacity: 1,
                dashArray: '',
                strokeDasharray: '',
                levelsLineWidth: 1,
                levelsLineDasharray: '',
                showZones: true,
                backgroundOpacity: 0.12,
                trendLineEnabled: true,
                trendLineColor: stroke,
                trendLineWidth: 1,
                trendLineDasharray: '',
            };
        }

        const endpointArrowDefaults = (toolType === 'trendline' || toolType === 'curve' || toolType === 'path' || toolType === 'brush')
            ? { startStyle: 'normal', endStyle: toolType === 'brush' ? 'normal' : 'arrow' }
            : {};

        return {
            stroke,
            color: stroke,
            lineColor: stroke,
            strokeWidth: 2,
            opacity: 1,
            dashArray: '',
            strokeDasharray: '',
            borderDasharray: '',
            fill,
            backgroundColor: fill,
            showBackground: true,
            borderEnabled: true,
            borderColor: stroke,
            borderWidth: 1,
            middleLineColor: stroke,
            middleLineDash: '',
            showMiddleLine: false,
            ...(typeof AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES !== 'undefined' && AXIS_LABEL_DEFAULT_OFF_SHAPE_TYPES.has(toolType)
                || toolType === 'brush' || toolType === 'highlighter'
                ? { showPriceLabel: false, showTimeLabel: false }
                : {}),
            ...endpointArrowDefaults,
        };
    }

    /**
     * Reset per-timeframe visibility ranges to built-in defaults (all units enabled, full min/max span).
     */
    resetDrawingVisibilityToDefaults(drawing) {
        if (!drawing) return;
        drawing.visibility = {
            _ranges: {
                m: { enabled: true, min: 1, max: 60 },
                h: { enabled: true, min: 1, max: 24 },
                d: { enabled: true, min: 1, max: 366 },
                w: { enabled: true, min: 1, max: 260 },
                M: { enabled: true, min: 1, max: 120 },
                mo: { enabled: true, min: 1, max: 120 },
            },
        };
    }

    /**
     * Reset a drawing to built-in defaults (light gray stroke/fill) — "Apply default" in toolbar.
     */
    applyBuiltinDefaultStyleToDrawing(drawing) {
        if (!drawing || !drawing.type) return false;
        if (drawing.type === 'long-position' || drawing.type === 'short-position') return false;

        const tracked = this.drawings.find((d) => d === drawing || (d.id != null && drawing.id != null && d.id === drawing.id));
        if (!tracked) return false;
        drawing = tracked;

        const patch = this.getDefaultToolStylePatch(drawing.type);
        if (!drawing.style) drawing.style = {};

        const resetKeys = new Set([
            'stroke', 'color', 'lineColor', 'strokeWidth', 'opacity',
            'dashArray', 'strokeDasharray', 'borderDasharray', 'borderWidth',
            'fill', 'backgroundColor', 'showBackground', 'borderEnabled', 'borderColor',
            'middleLineColor', 'middleLineDash', 'middleLineWidth', 'showMiddleLine',
            'startStyle', 'endStyle', 'extendLeft', 'extendRight',
            'showPriceLabel', 'showTimeLabel',
            'showZones', 'backgroundOpacity', 'levelsLineWidth', 'levelsLineDasharray',
            'priceLevels', 'timeLevels', 'gridLevels', 'fanLevels', 'arcLevels',
        ]);
        for (const k of Object.keys(drawing.style)) {
            if (resetKeys.has(k)) delete drawing.style[k];
        }
        Object.assign(drawing.style, patch);
        this.resetDrawingVisibilityToDefaults(drawing);

        try {
            if (typeof window !== 'undefined'
                && typeof window.__v9RestoreDrawingLevelsAfterBuiltinDefault === 'function') {
                window.__v9RestoreDrawingLevelsAfterBuiltinDefault(drawing, this);
            }
        } catch (_) {}

        const tb = this.toolbar;
        try { tb && tb.onBeforeUpdate && tb.onBeforeUpdate(drawing); } catch (_) {}
        try {
            if (tb && typeof tb.onUpdate === 'function') tb.onUpdate(drawing);
            else this.renderDrawing(drawing);
        } catch (_) {
            try { this.renderDrawing(drawing); } catch (_) {}
        }
        if (drawing.selected && typeof drawing.showAxisHighlights === 'function') {
            try { drawing.showAxisHighlights(); } catch (_) {}
        }
        if (this.chart && typeof this.chart.scheduleRender === 'function') {
            this.chart.scheduleRender();
        }
        return true;
    }

    /**
     * Style for in-progress preview + new placements. Prefer V9 armed toolbar (window.__v9ArmedDrawStyle).
     */
    getArmedToolStyle(toolType) {
        const tool = toolType || this.currentTool;
        if (!tool) return {};
        const base = this.getDefaultToolStylePatch(tool);
        try {
            if (typeof window !== 'undefined' && window.__v9ArmedDrawStyle) {
                const armed = window.__v9ArmedDrawStyle;
                if (armed.tool === tool && armed.patch && typeof armed.patch === 'object') {
                    const patch = { ...armed.patch };
                    if (tool === 'image') {
                        patch.imageUrl = '';
                        patch.originalAspectRatio = null;
                        patch.widthInDataUnits = null;
                        patch.heightInDataUnits = null;
                    }
                    return { ...base, ...patch };
                }
            }
        } catch (_) {}
        const saved = this.getSavedToolStyle(tool);
        return saved && typeof saved === 'object' ? { ...base, ...saved } : { ...base };
    }

    _applyArmedStyleExtras(drawing) {
        if (!drawing) return;
        try {
            if (typeof window !== 'undefined' && typeof window.__v9ApplyPlacedDrawingExtras === 'function') {
                window.__v9ApplyPlacedDrawingExtras(drawing, this);
            }
        } catch (_) {}
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
        const armedStyle = this.getArmedToolStyle(drawing.type);
        if (armedStyle && typeof armedStyle === 'object') {
            const isImageTool = drawing.type === 'image';
            Object.keys(armedStyle).forEach((key) => {
                if (key !== 'id' && key !== 'points'
                    && !(isImageTool && (key === 'imageUrl' || key === 'originalAspectRatio'))) {
                    drawing.style[key] = armedStyle[key];
                }
            });
        }
        const savedStyle = this.getSavedToolStyle(drawing.type);
        const skipSavedForV9TextArm = this._isTextDrawingType(drawing.type)
            && typeof window !== 'undefined'
            && window.__v9ArmedDrawStyle
            && window.__v9ArmedDrawStyle.tool === drawing.type;
        if (savedStyle && !skipSavedForV9TextArm) {
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
                    if (drawing.type === 'pitchfork' && (key === 'extendRight' || key === 'extendLeft')) return;
                    drawing.style[key] = savedStyle[key];
                }
            });
            // Sync stroke from color: when stroke is still the default grey but color carries a
            // distinct template value, propagate it to stroke so the line renders in that color too.
            const _dfltStroke = '#787b86';
            const _sc = drawing.style.color;
            if ((!drawing.style.stroke || drawing.style.stroke === _dfltStroke) &&
                _sc && _sc !== 'none' && _sc !== _dfltStroke) {
                drawing.style.stroke = _sc;
            }
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

        if (drawing.type === 'pitchfork') {
            drawing.style.extendRight = true;
        }
    }
}

// Export for use in chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawingToolsManager;
}