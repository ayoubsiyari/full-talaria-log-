/**
 * Replay System Module
 * Implements TradingView-style candle-by-candle replay with draggable toolbar
 */

class ReplaySystem {
    constructor(chart) {
        this.chart = chart;
        this.isActive = false;
        this.isPlaying = false;
        this.currentIndex = 0;
        this.speed = 60;
        this.playInterval = null;
        this.fullRawData = null;
        this.fullData = null;
        this.rawTimeframe = '1m';
        this._fullRawDataMatchesTF = false;
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        /** True while play is stalled at the loaded forward edge waiting for more bars. */
        this._replayForwardEdgeWait = false;
        /** Bumped to invalidate stale tick timeout chains (prefetch must not stack loops). */
        this._activeTickLoop = 0;
        /** Bumped to invalidate stale candle-by-candle setInterval chains. */
        this._activeCandleLoop = 0;

        // === VIRTUAL TIME SYNC: Track replay position by timestamp, not index ===
        // This ensures all timeframes stay in sync when switching
        this.replayTimestamp = null;      // Current virtual replay time (milliseconds)
        this.replayStartTimestamp = null; // Starting timestamp of replay data
        this.replayEndTimestamp = null;   // Ending timestamp of replay data
        this.sessionStartIndex = 0;      // Minimum index the user can roll back to (backtest range floor)
        this.tickElapsedMs = 0;           // Elapsed milliseconds within current candle animation

        /** Throttle replay "session ended" / "already at end" toasts (many paths hit pause together). */
        this._replayToastAt = 0;

        /** True after Play until heavy start work finishes (V9 / large TF may take a moment). */
        this.isPlayStarting = false;
        this._playStartRaf1 = null;
        this._playStartRaf2 = null;
        /** Pending onTimeframeChange restore timer (cancelled on rapid TF toggles). */
        this._tfChangeRestoreTimer = null;
        this._tfChangeSeq = 0;

        // Tick animation state
        this.playbackMode = 'tick'; // 'tick' (animated) | 'candle' (no intra-candle animation)
        this.tickAnimationEnabled = true;
        this.tickInterval = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        // More steps = smaller price jumps per frame (smoother wicks, same wall-clock per candle)
        this.ticksPerCandle = 72;
        this.realTimeMode = true; // Real-time mode: 1min candle = 60 seconds at 1x speed
        
        // === DETERMINISTIC TICK PATH CACHE ===
        // Pre-generated tick paths for each candle, keyed by timestamp
        // This ensures consistent tick animation across all timeframes
        this.tickPathCache = {};  // { timestamp: [price0, ... priceN-1] } length === ticksPerCandle
        this.tickPathCacheBuilt = false;
        this.stepTimeframeOverride = null; // 'sync' | '1m' | '5m' | ...
        this._prngSeed = 12345; // Seeded PRNG state
        this._nextCandleTimer = null; // Tracks the between-candle timer so it can be cancelled
        this.useConstantTickInterval = true; // Keeps replay cadence stable (prevents stop/run feel)
        this.interCandleDelayMs = 8; // Tiny handoff delay between candles to keep UI responsive
        this.dataLoadRetryDelayMs = 120; // Retry delay when waiting for more server candles
        this.forwardLoadLatencyMs = 1500; // EWMA forward-load latency used to size replay prefetch runway
        this.edgeProbeRetryCount = 0; // Number of forced forward probes after local cursor says no-more-right
        this.minEdgeProbeRetries = 12; // Always allow a minimum number of recovery probes
        this.maxEdgeProbeRetries = 90; // Hard cap to prevent infinite waiting at true dataset/session end

        this.toolbar = null;
        this.handle = null;
        this.replayBtn = null;
        this.slider = null;
        this.timeLabel = null;
        this.followBtn = null;
        this.speedSelect = null;
        this.timeframeSelect = null;
        this.playbackModeSelect = null;
        this.playPauseBtn = null;
        this.stepForwardBtn = null;
        this.stepBackwardBtn = null;
        this.exitBtn = null;
        this.playIcon = null;
        this.pauseIcon = null;
        this.playTextEl = null;
        this.pauseTextEl = null;
        this.toolbarVisible = false;
        this._lastFollowIndicatorCheckTs = 0;
        this._lastFastModePrefetchTs = 0;
        this.replayRightPaddingRatio = 0.2;

        this.dragState = {
            isDragging: false,
            offsetX: 0,
            offsetY: 0,
        };

        this.storageKey = 'replayToolbarPosition';
        
        // Pick point mode (click on chart to set replay start)
        this.isPickingPoint = false;
        this.isGoingBack = false;
        this.cutLine = null;
        this.cutLineLabel = null;
        this.pickModeOverlay = null;

        /** When true, go-back pick UI spans every panel (multi-layout). */
        this._goBackMultiPanel = false;
        /** @type {Array<{chart: *, wrapper: HTMLElement, pickModeOverlay: HTMLElement, clickCaptureLayer: HTMLElement, cutLine: *, cutLineLabel: HTMLElement|null}>|null} */
        this._goBackEntries = null;

        this.init();
    }

    /** Map replay playhead to native bar index after a TF swap (timestamp-stable, no price patching). */
    syncCurrentIndexFromReplayTimestamp(ts) {
        if (!Number.isFinite(ts) || !Array.isArray(this.fullRawData) || !this.fullRawData.length) {
            return false;
        }
        const hit = this._findLastRawIndexAtOrBefore(this.fullRawData, ts);
        const floor = this.sessionStartIndex || 0;
        if (hit >= floor) {
            this.currentIndex = hit;
            const bar = this.fullRawData[hit];
            const next = this.fullRawData[hit + 1];
            const barT = bar && Number.isFinite(bar.t) ? bar.t : null;
            const barEnd = next && Number.isFinite(next.t) ? next.t : null;
            if (barT != null && ts >= barT && (barEnd == null || ts < barEnd)) {
                this.replayTimestamp = ts;
            } else if (barT != null) {
                this.replayTimestamp = barT;
            }
            return true;
        }
        if (hit >= 0) {
            this.currentIndex = floor;
            const bar = this.fullRawData[this.currentIndex];
            if (bar && Number.isFinite(bar.t)) this.replayTimestamp = bar.t;
            return true;
        }
        return false;
    }

    /**
     * Walk-forward slice must never extend past replayTimestamp — TF switches (1m↔1H) can
     * leave currentIndex ahead of the playhead and paint unreplayed 1m bars.
     */
    _clampCurrentIndexToReplayTimestamp() {
        if (!Number.isFinite(this.replayTimestamp) || !Array.isArray(this.fullRawData) || !this.fullRawData.length) {
            return;
        }
        const idxAtPlayhead = this._findLastRawIndexAtOrBefore(this.fullRawData, this.replayTimestamp);
        if (idxAtPlayhead < 0) return;
        const floorIdx = this.sessionStartIndex || 0;
        const capped = Math.min(Math.max(idxAtPlayhead, floorIdx), this.fullRawData.length - 1);
        if (this.currentIndex > capped) {
            this.currentIndex = capped;
        }
    }

    applyPersistedState(state) {
        if (!state || typeof state !== 'object') return false;
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) return false;

        try {
            const tfMatches = !state.timeframe || state.timeframe === this.chart.currentTimeframe;

            let ts = null;
            const rawTs = state.replayTimestamp;
            if (typeof rawTs === 'number' && Number.isFinite(rawTs)) {
                ts = rawTs;
            } else if (typeof rawTs === 'string') {
                const n = Number(rawTs);
                if (Number.isFinite(n)) {
                    ts = n;
                } else {
                    const parsed = Date.parse(rawTs);
                    if (Number.isFinite(parsed)) {
                        ts = parsed;
                    }
                }
            }

            let idx = null;
            if (ts !== null) {
                const hit = typeof this._findLastRawIndexAtOrBefore === 'function'
                    ? this._findLastRawIndexAtOrBefore(this.fullRawData, ts)
                    : -1;
                const smin = this.sessionStartIndex || 0;
                idx = hit < 0 ? smin : Math.max(hit, smin);
            } else if (tfMatches
                && typeof state.currentIndex === 'number'
                && Number.isFinite(state.currentIndex)) {
                // Fallback only when no wall-clock playhead was saved (legacy blobs).
                idx = Math.floor(state.currentIndex);
            }

            if (idx !== null) {
                const persistMinIdx = this.sessionStartIndex || 0;
                this.currentIndex = Math.min(Math.max(idx, persistMinIdx), this.fullRawData.length - 1);
                const bar = this.fullRawData[this.currentIndex];
                if (bar && Number.isFinite(bar.t)) {
                    const next = this.fullRawData[this.currentIndex + 1];
                    const barEnd = next && Number.isFinite(next.t) ? next.t : null;
                    if (ts !== null && ts >= bar.t && (barEnd == null || ts < barEnd)) {
                        this.replayTimestamp = ts;
                    } else {
                        this.replayTimestamp = bar.t;
                    }
                } else if (ts !== null) {
                    this.replayTimestamp = ts;
                }
                this.tickElapsedMs = typeof state.tickElapsedMs === 'number' ? state.tickElapsedMs : 0;
                this.speed = typeof state.speed === 'number' ? this.normalizeSpeed(state.speed) : this.speed;
                if (typeof state.playbackMode === 'string') {
                    this.setPlaybackMode(state.playbackMode, { restartPlayback: false });
                }
                this.isPlaying = false;
                this.updateSpeedButtonUI(this.speed);
                if (typeof window.updateSpeedDisplay === 'function') {
                    window.updateSpeedDisplay(this.speed);
                }
                if (!state.deferChartSync) {
                    this.updateChartData(true);
                }
                this._persistedPlayheadApplied = true;
                const om = this.chart && this.chart.orderManager;
                if (om) {
                    om._journalMarkerRestorePending = true;
                    om._lastJournalMarkerDataLen = 0;
                    if (typeof om._scheduleSessionMarkerRedraw === 'function') {
                        om._scheduleSessionMarkerRedraw();
                    }
                }
                return true;
            }
        } catch (e) {
            console.warn('⚠️ Failed to apply persisted replay state', e);
        }
        return false;
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.toolbar = document.getElementById('replayToolbar');
        this.handle = document.getElementById('replayToolbarHandle');
        this.replayBtn = document.getElementById('replayModeBtn');
        this.slider = document.getElementById('replaySlider');
        this.timeLabel = document.getElementById('replayCurrentTime');
        this.followBtn = document.getElementById('replayFollow');
        this.speedSelect = document.getElementById('replaySpeed');
        this.timeframeSelect = document.getElementById('replayTimeframe');
        this.playbackModeSelect = document.getElementById('replayPlaybackMode');
        this.playPauseBtn = document.getElementById('replayPlayPause');
        this.stepForwardBtn = document.getElementById('replayStepForward');
        this.stepBackwardBtn = document.getElementById('replayStepBackward');
        this.exitBtn = document.getElementById('replayExit');
        this.goBackBtn = document.getElementById('replayGoBack');
        
        // Speed selection bar and tick progress elements
        this.speedSelectBar = document.getElementById('speedSelectBar');
        this.tickProgressContainer = document.getElementById('tickProgressContainer');
        this.tickProgressFill = document.getElementById('tickProgressFill');
        
        if (this.playPauseBtn) {
            this.playIcon = this.playPauseBtn.querySelector('.play-icon');
            this.pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
            this.playTextEl = this.playPauseBtn.querySelector('.play-text');
            this.pauseTextEl = this.playPauseBtn.querySelector('.pause-text');
        }

        if (!this.toolbar || !this.replayBtn) {
            if (typeof window !== 'undefined' && window.__TALARIA_EMBED_LITE) {
                return;
            }
            console.error('❌ Replay toolbar elements missing');
            return;
        }
        if (!this.handle) {
            this.handle = this.toolbar;
        }

        this.attachPlaybackModeOptionEvents(this.toolbar);
        this.attachPlaybackModeTriggerEvents(this.toolbar);
        this.attachPlaybackModeOutsideClickHandler();
        this.syncPlaybackModeControls();

        this.attachButtonEvents();
        this.attachSliderEvents();
        this.attachDragEvents();
        this.attachSpeedButtonEvents();
        this.loadToolbarPosition();
        
        // Listen for timezone changes
        if (window.timezoneManager) {
            window.timezoneManager.addListener(() => {
                if (this.isActive) {
                    this.updateTimeDisplay();
                }
            });
        }
    }

    attachButtonEvents() {
        this.replayBtn.addEventListener('click', () => this.handleReplayButtonClick());

        if (this.playPauseBtn) {
            this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        }

        if (this.stepForwardBtn) {
            this.stepForwardBtn.addEventListener('click', () => this.requestStepForward());
        }

        if (this.stepBackwardBtn) {
            this.stepBackwardBtn.addEventListener('click', () => this.requestStepBackward());
        }

        if (this.exitBtn) {
            this.exitBtn.addEventListener('click', () => this.exitReplayMode());
        }
        
        if (this.goBackBtn) {
            this.goBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goBackToPickPoint();
            });
        } else {
        }

        if (this.speedSelect) {
            this.speedSelect.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                this.setSpeed(Number.isFinite(value) ? value : 1);
            });
        }

        if (this.timeframeSelect) {
            this.timeframeSelect.addEventListener('change', (e) => {
            });
        }

        if (this.playbackModeSelect) {
            this.playbackModeSelect.addEventListener('change', (e) => {
                this.setPlaybackMode(e.target.value);
            });
        }

        if (this.followBtn && !this.followBtn.dataset.replayFollowBound) {
            this.followBtn.dataset.replayFollowBound = '1';
            this.followBtn.addEventListener('click', () => this.enableAutoScroll());
        }

        // V9 mounts `#replayFollow` inside React `#chartWrapper` — can appear after ReplaySystem.setup().
        if (!this.followBtn) {
            let tries = 0;
            const iv = setInterval(() => {
                tries++;
                const btn =
                    document.getElementById('replayFollow') ||
                    document.querySelector('button[data-talaria-replay-follow="injected"]');
                if (btn && !btn.dataset.replayFollowBound) {
                    btn.dataset.replayFollowBound = '1';
                    btn.addEventListener('click', () => this.enableAutoScroll());
                    this.followBtn = btn;
                    clearInterval(iv);
                    try {
                        this.updateAutoScrollIndicator();
                    } catch (_) {}
                } else if (tries >= 60) {
                    clearInterval(iv);
                }
            }, 50);
        }
    }

    attachPlaybackModeOptionEvents(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        const modeButtons = root.querySelectorAll('.replay-mode-option');
        modeButtons.forEach((button) => {
            if (!button || button.dataset.modeBound === '1') return;

            button.dataset.modeBound = '1';
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const mode = button.dataset.mode === 'candle' ? 'candle' : 'tick';
                this.setPlaybackMode(mode);
                this.closePlaybackModeDropdowns();
            });
        });
    }

    attachPlaybackModeTriggerEvents(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        const triggerButtons = root.querySelectorAll('.replay-mode-trigger, .replay-mode-dropdown-arrow');
        triggerButtons.forEach((button) => {
            if (!button || button.dataset.modeTriggerBound === '1') return;

            button.dataset.modeTriggerBound = '1';
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const container = button.closest('.replay-playback-mode-settings');
                this.togglePlaybackModeDropdown(container);
            });
        });
    }

    togglePlaybackModeDropdown(container) {
        if (!container) return;

        const dropdown = container.querySelector('.replay-mode-dropdown');
        if (!dropdown) return;

        const isOpen = dropdown.classList.contains('show');
        this.closePlaybackModeDropdowns();

        if (isOpen) return;

        // Keep replay dropdowns and interval panels mutually exclusive.
        if (typeof window !== 'undefined' && typeof window._replayCloseIntervalPanels === 'function') {
            window._replayCloseIntervalPanels();
        }

        dropdown.classList.add('show');
        dropdown.style.display = 'flex';

        const arrow = container.querySelector('.replay-mode-dropdown-arrow');
        if (arrow) {
            arrow.classList.add('dropdown-open');
        }

        const trigger = container.querySelector('.replay-mode-trigger');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'true');
            trigger.classList.remove('active');
            trigger.classList.add('replay-open');
        }
    }

    attachPlaybackModeOutsideClickHandler() {
        if (this._playbackModeOutsideClickBound) return;
        this._playbackModeOutsideClickBound = true;

        document.addEventListener('click', (e) => {
            if (e.target.closest('.replay-playback-mode-settings')) return;
            this.closePlaybackModeDropdowns();
        });
    }

    closePlaybackModeDropdowns() {
        document.querySelectorAll('.replay-mode-dropdown').forEach((dropdown) => {
            dropdown.classList.remove('show');
            dropdown.style.display = 'none';
        });

        document.querySelectorAll('.replay-mode-dropdown-arrow').forEach((arrow) => {
            arrow.classList.remove('dropdown-open');
        });

        document.querySelectorAll('.replay-mode-trigger').forEach((button) => {
            button.setAttribute('aria-expanded', 'false');
            button.classList.remove('active');
            button.classList.remove('replay-open');
        });
    }
    
    /**
     * Attach event listeners for speed selection buttons
     */
    attachSpeedButtonEvents() {
        if (!this.speedSelectBar) {
            return;
        }
        
        
        const buttons = this.speedSelectBar.querySelectorAll('.speed-option');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseFloat(btn.dataset.speed);
                if (!isNaN(speed)) {
                    this.setSpeed(speed);
                    this.updateSpeedButtonUI(speed);
                }
            });
        });
    }
    
    /**
     * Update speed button UI to show active state
     */
    updateSpeedButtonUI(activeSpeed) {
        if (!this.speedSelectBar) return;
        
        const buttons = this.speedSelectBar.querySelectorAll('.speed-option');
        buttons.forEach(btn => {
            const speed = parseFloat(btn.dataset.speed);
            if (speed === activeSpeed) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    getPlaybackMode() {
        return this.playbackMode === 'candle' ? 'candle' : 'tick';
    }

    syncPlaybackModeControls() {
        const mode = this.getPlaybackMode();
        const modeSelects = document.querySelectorAll(
            '#replayPlaybackMode, #replayPlaybackModeClone, #replayPlaybackModeFloatingClone'
        );
        modeSelects.forEach(select => {
            if (select && select.value !== mode) {
                select.value = mode;
            }
        });

        const modeLabels = document.querySelectorAll('.replay-mode-current-label');
        modeLabels.forEach(label => {
            if (label) {
                label.textContent = mode === 'candle' ? 'Candle' : 'Tick';
            }
        });

        const modeButtons = document.querySelectorAll('.replay-mode-option');
        modeButtons.forEach((button) => {
            if (!button) return;

            const optionMode = button.dataset.mode === 'candle' ? 'candle' : 'tick';
            const isActive = optionMode === mode;

            button.classList.remove('active');
            button.classList.toggle('replay-selected', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    setPlaybackMode(mode, { restartPlayback = true } = {}) {
        const normalizedMode = mode === 'candle' ? 'candle' : 'tick';
        const previousMode = this.getPlaybackMode();
        const modeChanged = normalizedMode !== previousMode;

        this.playbackMode = normalizedMode;
        this.tickAnimationEnabled = normalizedMode === 'tick';
        this.syncPlaybackModeControls();

        if (!modeChanged) return;


        if (this.isPlaying && restartPlayback) {
            // Restart playback immediately so mode change applies without extra clicks.
            this._preserveTickProgress = false;
            this.animatingCandle = null;
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
            this.play();
        }
    }

    /**
     * Set replay step timeframe explicitly (used by V9 UI when hidden legacy
     * select is not present in the DOM).
     */
    setStepTimeframe(timeframe) {
        const prev = this.stepTimeframeOverride;
        if (timeframe == null) {
            this.stepTimeframeOverride = null;
        } else {
            const raw = String(timeframe).trim();
            if (!raw) {
                this.stepTimeframeOverride = null;
            } else {
                const lower = raw.toLowerCase();
                this.stepTimeframeOverride = lower === 'auto' ? 'sync' : lower;
            }
        }
        const norm = (v) => (v == null || v === '' ? null : String(v).toLowerCase());
        if (norm(prev) !== norm(this.stepTimeframeOverride) && this.isPlaying) {
            this._restartPlaybackAfterControlChange(true);
        }
    }

    /** INTERVAL finer than native master — advance replayTimestamp, keep coarse fullRawData (no refetch/swap). */
    _isSubBarStepMode() {
        if (!this._hasExplicitReplayStepInterval()) return false;
        const stepMs = this._resolveReplayStepTimeframeMs();
        const rawMs = this._getRawBarPeriodMs();
        if (!Number.isFinite(stepMs) || !Number.isFinite(rawMs) || stepMs <= 0 || rawMs <= 0) {
            return false;
        }
        return stepMs < rawMs * 0.92;
    }

    /** Re-arm play loop after MODE / INTERVAL change while playback is active. */
    _restartPlaybackAfterControlChange(skipImmediateStep = false) {
        if (!this.isActive || !this.isPlaying) return;
        this.stopAllPlayback();
        this.isPlaying = true;
        const useTickAnimation = this.getPlaybackMode() === 'tick' && !this._hasExplicitReplayStepInterval();
        if (useTickAnimation) {
            this.startTickAnimation();
        } else {
            this.animatingCandle = null;
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
            this.startCandleByCandle(!skipImmediateStep);
        }
    }

    /** True when V9 INTERVAL is a fixed TF (1m, 5m, …), not Auto/sync. */
    _hasExplicitReplayStepInterval() {
        const o = this.stepTimeframeOverride;
        return !!(o && String(o).trim() && String(o).toLowerCase() !== 'sync');
    }

    /** Play/step should advance by INTERVAL buckets (candle path), not raw tick bars. */
    _shouldStepByReplayInterval() {
        if (this.getPlaybackMode() === 'candle') return true;
        return this._hasExplicitReplayStepInterval();
    }

    /** Advance playhead one replay step (respects INTERVAL + candle mode). */
    _advanceReplayPlayheadOneStep() {
        if (this._shouldStepByReplayInterval()) {
            const targetIndex = this.calculateNextIndex();
            if (targetIndex > this.currentIndex) {
                this.currentIndex = targetIndex;
            } else if (this.currentIndex < this.fullRawData.length - 1) {
                this.currentIndex++;
            }
        } else if (this.currentIndex < this.fullRawData.length - 1) {
            this.currentIndex++;
        }
        this.edgeProbeRetryCount = 0;
        this._replayForwardEdgeWait = false;
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
    }
    
    /**
     * Show/hide tick progress indicator
     */
    showTickProgress(show) {
        if (this.tickProgressContainer) {
            this.tickProgressContainer.style.display = show ? 'flex' : 'none';
        }
    }
    
    /**
     * Update tick progress bar
     */
    updateTickProgress(progress) {
        if (this.tickProgressFill) {
            this.tickProgressFill.style.width = `${Math.min(100, progress * 100)}%`;
            if (progress > 0 && progress < 1) {
                this.tickProgressFill.classList.add('animating');
            } else {
                this.tickProgressFill.classList.remove('animating');
            }
        }
    }

    attachSliderEvents() {
        if (!this.slider) return;

        let isPointerDown = false;

        const updateFromPointer = (clientX) => {
            if (!this.slider || !this.fullRawData) return;
            const rect = this.slider.getBoundingClientRect();
            const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const sliderMin = this.sessionStartIndex || 0;
            const sliderMax = this.fullRawData.length - 1;
            const targetIndex = Math.round(sliderMin + percent * (sliderMax - sliderMin));
            this.seekTo(targetIndex, { fromDrag: true });
        };

        this.slider.addEventListener('pointerdown', (e) => {
            if (!this.isActive) return;
            isPointerDown = true;
            this.slider.setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX);
        });

        this.slider.addEventListener('pointermove', (e) => {
            if (!isPointerDown || !this.isActive) return;
            updateFromPointer(e.clientX);
        });

        this.slider.addEventListener('pointerup', (e) => {
            if (!this.isActive) return;
            isPointerDown = false;
            this.slider.releasePointerCapture(e.pointerId);
        });

        this.slider.addEventListener('click', (e) => {
            if (!this.isActive) return;
            updateFromPointer(e.clientX);
        });
    }

    attachDragEvents() {
        if (!this.handle || !this.toolbar) return;

        let floatingClone = null;

        const setOriginalOpacity = (opacity) => {
            if (this.toolbar) {
                this.toolbar.style.opacity = opacity;
            }
        };

        const onPointerDown = (e) => {
            // Check if there's already a floating clone
            const existingClone = document.getElementById('replayToolbarClone');
            if (existingClone) {
                // If clone exists, don't allow another drag
                return;
            }

            this.dragState.isDragging = true;
            const rect = this.toolbar.getBoundingClientRect();
            this.dragState.offsetX = e.clientX - rect.left;
            this.dragState.offsetY = e.clientY - rect.top;
            
            // Create a clone of the toolbar for dragging
            floatingClone = this.toolbar.cloneNode(true);
            floatingClone.id = 'replayToolbarClone';
            floatingClone.classList.add('dragging', 'floating-clone');
            floatingClone.style.position = 'fixed';
            floatingClone.style.left = `${rect.left}px`;
            floatingClone.style.top = `${rect.top}px`;
            floatingClone.style.transform = 'none';
            floatingClone.style.zIndex = '10001';
            floatingClone.style.opacity = '0.95';
            floatingClone.style.pointerEvents = 'none';
            
            document.body.appendChild(floatingClone);

            setOriginalOpacity('0.5');
            
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };

        const onPointerMove = (e) => {
            if (!this.dragState.isDragging || !floatingClone) return;
            const left = e.clientX - this.dragState.offsetX;
            const top = e.clientY - this.dragState.offsetY;
            floatingClone.style.left = `${left}px`;
            floatingClone.style.top = `${top}px`;
        };

        const onPointerUp = (e) => {
            if (!this.dragState.isDragging) return;
            
            this.dragState.isDragging = false;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            
            if (floatingClone) {
                const cloneRect = floatingClone.getBoundingClientRect();
                const originalRect = this.toolbar.getBoundingClientRect();
                
                // Check if dragged far enough from original position (at least 50px)
                const distance = Math.sqrt(
                    Math.pow(cloneRect.left - originalRect.left, 2) + 
                    Math.pow(cloneRect.top - originalRect.top, 2)
                );
                
                if (distance > 50) {
                    // Keep the clone as a floating toolbar
                    floatingClone.classList.remove('dragging');
                    floatingClone.style.pointerEvents = 'auto';
                    floatingClone.style.opacity = '1';
                    
                    // Add close button to the clone
                    this.addCloseButtonToClone(floatingClone);
                    
                    // Re-attach event handlers to clone buttons
                    this.attachCloneEventHandlers(floatingClone);
                    
                    // Save floating clone position
                    this.saveFloatingClonePosition(cloneRect.left, cloneRect.top);
                } else {
                    // Not dragged far enough, remove the clone
                    floatingClone.remove();
                    setOriginalOpacity('1');
                }
                
                floatingClone = null;
            }
        };

        this.handle.addEventListener('pointerdown', onPointerDown);
        
        // Also allow dragging from the entire toolbar content area
        this.toolbar.addEventListener('pointerdown', (e) => {
            // Only trigger if clicking on empty space, not on buttons
            if (e.target === this.toolbar || 
                e.target.classList.contains('replay-toolbar-content') ||
                e.target.classList.contains('replay-controls-group')) {
                onPointerDown(e);
            }
        });
    }

    addCloseButtonToClone(clone) {
        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'replay-clone-close-btn';
        closeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            background: transparent;
            border: none;
            color: #787b86;
            cursor:default;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
            transition: all 0.15s ease;
        `;
        
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(120, 123, 134, 0.2)';
            closeBtn.style.color = '#d1d4dc';
        });
        
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = '#787b86';
        });
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clone.remove();
            userStorage.removeItem('replayToolbarClonePosition');
            if (this.toolbar) {
                this.toolbar.style.opacity = '1';
            }
        });
        
        clone.style.position = 'fixed';
        clone.appendChild(closeBtn);
        
        // Make the clone draggable
        this.makeCloneDraggable(clone);
    }

    makeCloneDraggable(clone) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        
        const onMouseDown = (e) => {
            // Only drag from toolbar background, not buttons
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
                return;
            }
            
            isDragging = true;
            const rect = clone.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            clone.classList.add('dragging');
            e.preventDefault();
        };
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            const left = e.clientX - offsetX;
            const top = e.clientY - offsetY;
            clone.style.left = `${left}px`;
            clone.style.top = `${top}px`;
        };
        
        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            clone.classList.remove('dragging');
            
            // Save position
            const rect = clone.getBoundingClientRect();
            this.saveFloatingClonePosition(rect.left, rect.top);
        };
        
        clone.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    attachCloneEventHandlers(clone) {
        // Play/Pause button
        const playPauseBtn = clone.querySelector('#replayPlayPause');
        if (playPauseBtn) {
            playPauseBtn.id = 'replayPlayPauseClone';
            playPauseBtn.addEventListener('click', () => this.togglePlay());
        }
        
        // Step forward
        const stepForwardBtn = clone.querySelector('#replayStepForward');
        if (stepForwardBtn) {
            stepForwardBtn.id = 'replayStepForwardClone';
            stepForwardBtn.addEventListener('click', () => this.requestStepForward());
        }

        // Step backward
        const stepBackwardBtn = clone.querySelector('#replayStepBackward');
        if (stepBackwardBtn) {
            stepBackwardBtn.id = 'replayStepBackwardClone';
            stepBackwardBtn.addEventListener('click', () => this.requestStepBackward());
        }
        
        // Exit button
        const exitBtn = clone.querySelector('#replayExit');
        if (exitBtn) {
            exitBtn.id = 'replayExitClone';
            exitBtn.addEventListener('click', () => this.exitReplayMode());
        }
        
        // Go back button
        const goBackBtn = clone.querySelector('#replayGoBack');
        if (goBackBtn) {
            goBackBtn.id = 'replayGoBackClone';
            goBackBtn.addEventListener('click', () => {
                if (typeof this.goBack === 'function') {
                    this.goBack();
                }
            });
        }
        
        // Go To control
        const goToToggle = clone.querySelector('#goToMenuToggle');
        const goToMenu = clone.querySelector('#goToMenu');
        if (goToToggle && goToMenu) {
            goToToggle.id = 'goToMenuToggleClone';
            goToMenu.id = 'goToMenuClone';
            
            goToToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = goToMenu.style.display === 'block';
                goToMenu.style.display = isVisible ? 'none' : 'block';
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!goToToggle.contains(e.target) && !goToMenu.contains(e.target)) {
                    goToMenu.style.display = 'none';
                }
            });
        }
        
        // Speed slider play button
        const speedPlayBtn = clone.querySelector('#speedSliderPlayBtn');
        if (speedPlayBtn) {
            speedPlayBtn.id = 'speedSliderPlayBtnClone';
            speedPlayBtn.addEventListener('click', () => this.togglePlay());
        }
        
        // Speed slider
        const speedSlider = clone.querySelector('#replaySpeedSlider');
        if (speedSlider) {
            speedSlider.id = 'replaySpeedSliderClone';
            speedSlider.addEventListener('input', (e) => {
                if (typeof this.setSpeedFromSlider === 'function') {
                    this.setSpeedFromSlider(parseInt(e.target.value));
                }
            });
        }

        const playbackModeSelect = clone.querySelector('#replayPlaybackMode');
        if (playbackModeSelect) {
            playbackModeSelect.id = 'replayPlaybackModeClone';
            playbackModeSelect.value = this.getPlaybackMode();
            playbackModeSelect.addEventListener('change', (e) => {
                this.setPlaybackMode(e.target.value);
            });
        }

        clone.querySelectorAll('.replay-mode-option').forEach((button) => {
            button.removeAttribute('data-mode-bound');
        });
        clone.querySelectorAll('.replay-mode-trigger, .replay-mode-dropdown-arrow').forEach((button) => {
            button.removeAttribute('data-mode-trigger-bound');
        });

        this.attachPlaybackModeOptionEvents(clone);
        this.attachPlaybackModeTriggerEvents(clone);
        this.syncPlaybackModeControls();
    }

    saveFloatingClonePosition(left, top) {
        try {
            userStorage.setItem('replayToolbarClonePosition', JSON.stringify({ left, top }));
        } catch (err) {
            console.warn('⚠️ Failed to save floating clone position', err);
        }
    }

    loadFloatingClonePosition() {
        try {
            const stored = userStorage.getItem('replayToolbarClonePosition');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (err) {
            console.warn('⚠️ Failed to load floating clone position', err);
        }
        return null;
    }

    saveToolbarPosition() {
        if (!this.toolbar) return;
        const rect = this.toolbar.getBoundingClientRect();
        const position = { left: rect.left, top: rect.top };
        try {
            userStorage.setItem(this.storageKey, JSON.stringify(position));
        } catch (err) {
            console.warn('⚠️ Failed to save replay toolbar position', err);
        }
    }

    loadToolbarPosition() {
        if (!this.toolbar) return;
        try {
            const stored = userStorage.getItem(this.storageKey);
            if (!stored) return;
            const { left, top } = JSON.parse(stored);
            if (Number.isFinite(left) && Number.isFinite(top)) {
                this.toolbar.style.left = `${left}px`;
                this.toolbar.style.top = `${top}px`;
                this.toolbar.style.transform = 'translateX(0)';
            }
        } catch (err) {
            console.warn('⚠️ Failed to load replay toolbar position', err);
        }
    }

    showToolbar() {
        if (!this.toolbar) return;
        this.toolbar.classList.add('visible');
        this.toolbarVisible = true;
        this.updateReplayButtonState(true);
        this.syncPlayPauseButtonVisuals();
        this.syncPlaybackModeControls();
        // Always sync the speed bar UI to the actual running speed
        this.updateSpeedButtonUI(this.speed);
        if (typeof window.updateSpeedDisplay === 'function') {
            window.updateSpeedDisplay(this.speed);
        }
    }

    hideToolbar() {
        if (!this.toolbar) return;
        this.toolbar.classList.remove('visible');
        this.toolbarVisible = false;
        this.updateReplayButtonState(false);
    }

    updateReplayButtonState(active) {
        if (!this.replayBtn) return;
        this.replayBtn.classList.toggle('active', !!active);
    }

    /**
     * Cancel deferred play() start (e.g. user hit Pause before the next frame ran).
     */
    _cancelDeferredPlayStart() {
        if (this._playStartRaf1 != null) {
            cancelAnimationFrame(this._playStartRaf1);
            this._playStartRaf1 = null;
        }
        if (this._playStartRaf2 != null) {
            cancelAnimationFrame(this._playStartRaf2);
            this._playStartRaf2 = null;
        }
        this.isPlayStarting = false;
    }

    /**
     * Sync play / pause / loading spinner on speed-bar and legacy replay toolbar buttons.
     */
    syncPlayPauseButtonVisuals() {
        const loading = !!this.isPlayStarting;
        const playing = !!this.isPlaying;

        const applySpeedBtn = (btn) => {
            if (!btn) return;
            btn.classList.toggle('replay-play-btn-loading', loading);
            if (loading) return;
            if (playing) {
                btn.classList.add('playing');
            } else {
                btn.classList.remove('playing');
            }
        };

        applySpeedBtn(document.getElementById('speedSliderPlayBtn'));
        applySpeedBtn(document.getElementById('speedSliderPlayBtnClone'));

        const applyReplayToolbarBtn = (btn) => {
            if (!btn) return;
            btn.classList.toggle('replay-play-btn-loading', loading);
            if (loading) return;
            const playIcon = btn.querySelector('.play-icon');
            const pauseIcon = btn.querySelector('.pause-icon');
            const playText = btn.querySelector('.play-text');
            const pauseText = btn.querySelector('.pause-text');

            if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
            if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
            if (playText) playText.style.display = playing ? 'none' : 'inline';
            if (pauseText) pauseText.style.display = playing ? 'inline' : 'none';

            btn.classList.toggle('replay-playing', playing);
            btn.classList.toggle('replay-paused', !playing);
        };

        applyReplayToolbarBtn(document.getElementById('replayPlayPause'));
        applyReplayToolbarBtn(document.getElementById('replayPlayPauseClone'));
    }

    /**
     * Toggle replay mode on/off
     */
    toggleReplayMode() {
        if (!this.isActive) {
            this.enterReplayMode();
            return;
        }

        if (this.toolbarVisible) {
            this.hideToolbar();
        } else {
            this.showToolbar();
        }
    }

    handleReplayButtonClick() {
        if (this.isActive) {
            // Already in replay mode, exit
            this.exitReplayMode();
        } else if (this.isPickingPoint) {
            // Cancel pick mode
            this.exitPickPointMode();
        } else {
            // Enter pick point mode
            this.enterPickPointMode();
        }
    }
    
    /**
     * Enter pick point mode - show cut line that follows cursor
     */
    enterPickPointMode() {
        if (!this.chart.rawData || this.chart.rawData.length === 0) {
            alert('Please load data first');
            return;
        }
        
        this.isPickingPoint = true;
        
        // Update button appearance
        if (this.replayBtn) {
            this.replayBtn.classList.add('picking');
            this.replayBtn.style.background = 'rgba(33, 150, 243, 0.3)';
            this.replayBtn.style.borderColor = '#2196f3';
        }
        
        // Get the chart wrapper element
        this.chartWrapper = document.getElementById('chartWrapper') || 
                           document.querySelector('.chart-wrapper') ||
                           this.chart.canvas?.parentElement;
        
        // Create overlay for pick mode
        this.createPickModeOverlay();
        
        // Create cut line elements
        this.createCutLine();
        
        // Add mouse move listener
        if (this.chartWrapper) {
            this.chartWrapper.addEventListener('mousemove', this.onPickModeMouseMove);
            this.chartWrapper.addEventListener('click', this.onPickModeClick);
        }
        
        // Show instruction
        this.showPickModeInstruction();
    }
    
    /**
     * Exit pick point mode
     */
    exitPickPointMode() {
        this.isPickingPoint = false;
        
        // Reset button appearance
        if (this.replayBtn) {
            this.replayBtn.classList.remove('picking');
            this.replayBtn.style.background = '';
            this.replayBtn.style.borderColor = '';
        }
        
        // Remove overlay and cut line
        this.removePickModeElements();
        
        // Remove listeners
        if (this.chartWrapper) {
            this.chartWrapper.removeEventListener('mousemove', this.onPickModeMouseMove);
            this.chartWrapper.removeEventListener('click', this.onPickModeClick);
        }
    }
    
    /**
     * Show instruction for pick mode
     */
    showPickModeInstruction() {
        const instruction = document.createElement('div');
        instruction.id = 'replayPickInstruction';
        instruction.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(33, 150, 243, 0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        instruction.innerHTML = `
            <span style="font-size: 20px;">🎯</span>
            <span>Click on chart to set replay start point</span>
            <button id="cancelPickMode" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                cursor:default;
                font-size: 12px;
            ">Cancel (ESC)</button>
        `;
        document.body.appendChild(instruction);
        
        // Cancel button
        document.getElementById('cancelPickMode').addEventListener('click', () => {
            this.exitPickPointMode();
        });
        
        // ESC key to cancel
        this.escKeyHandler = (e) => {
            if (e.key === 'Escape' && this.isPickingPoint) {
                this.exitPickPointMode();
            }
        };
        document.addEventListener('keydown', this.escKeyHandler);
    }
    
    /**
     * Create the pick mode overlay
     */
    createPickModeOverlay() {
        // Get the chart wrapper element
        const chartWrapper = document.getElementById('chartWrapper') || 
                            document.querySelector('.chart-wrapper') ||
                            this.chart.canvas?.parentElement;
        
        if (!chartWrapper) {
            console.warn('Could not find chart wrapper for overlay');
            return;
        }
        
        // Create semi-transparent overlay on right side (future data area)
        this.pickModeOverlay = document.createElement('div');
        this.pickModeOverlay.id = 'replayPickOverlay';
        this.pickModeOverlay.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            width: 0;
            height: 100%;
            background: rgba(33, 150, 243, 0.1);
            pointer-events: none;
            z-index: 40;
            transition: width 0.05s ease-out;
        `;
        chartWrapper.appendChild(this.pickModeOverlay);
    }
    
    /**
     * Rollback / pick hover label — same shell as __TalariaToastStack (pinned above time axis).
     */
    _createCutLineLabelElement() {
        const el = document.createElement('div');
        el.id = 'replayCutLineLabel';
        el.className = 'replay-cut-line-label';
        el.setAttribute('role', 'status');
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        if (typeof window !== 'undefined' && window.__TalariaToastStack
            && typeof window.__TalariaToastStack.setPinned === 'function') {
            window.__TalariaToastStack.setPinned('replay-cut-line-label', el);
        } else if (typeof document !== 'undefined') {
            document.body.appendChild(el);
        }
        return el;
    }

    _updateCutLineLabel(labelEl, text, visible) {
        if (!labelEl) return;
        if (!visible || !text) {
            labelEl.style.opacity = '0';
            labelEl.style.visibility = 'hidden';
            return;
        }
        labelEl.textContent = text;
        labelEl.style.opacity = '1';
        labelEl.style.visibility = 'visible';
        if (typeof window !== 'undefined' && window.__TalariaToastStack
            && typeof window.__TalariaToastStack.relayout === 'function') {
            window.__TalariaToastStack.relayout();
        }
    }

    _disposeCutLineLabel(labelEl) {
        if (!labelEl) return;
        if (typeof window !== 'undefined' && window.__TalariaToastStack
            && typeof window.__TalariaToastStack.clearPinned === 'function') {
            window.__TalariaToastStack.clearPinned('replay-cut-line-label');
        } else {
            try { labelEl.remove(); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Create the vertical cut line
     */
    createCutLine() {
        // Get the chart wrapper element
        const chartWrapper = document.getElementById('chartWrapper') || 
                            document.querySelector('.chart-wrapper') ||
                            this.chart.canvas?.parentElement;
        
        // SVG cut line - use the overlayGroup or svgOverlay if available
        const svgElement = this.chart.svgOverlay || this.chart.svg;
        if (svgElement) {
            this.cutLine = svgElement.append('line')
                .attr('id', 'replayCutLine')
                .attr('class', 'replay-cut-line')
                .attr('y1', this.chart.margin.t)
                .attr('y2', this.chart.h - this.chart.margin.b)
                .attr('stroke', '#2196f3')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '6,3')
                .attr('opacity', 0)
                .style('pointer-events', 'none');
        }
        
        // Label showing date/time at cut point (toast-style, bottom-centered)
        this.cutLineLabel = this._createCutLineLabelElement();
        
        // Bind mouse handlers
        this.onPickModeMouseMove = this.handlePickModeMouseMove.bind(this);
        this.onPickModeClick = this.handlePickModeClick.bind(this);
    }
    
    /**
     * Handle mouse move in pick mode
     */
    /** Effective plot width when chart.w is unset (multichart iframe after load). */
    _chartPlotWidth(chart) {
        let w = Number(chart && chart.w) || 0;
        if (w >= 80) return w;
        try {
            const el = chart.canvas && chart.canvas.parentElement;
            const rw = el ? el.getBoundingClientRect().width : 0;
            if (Number.isFinite(rw) && rw >= 80) return rw;
        } catch (_) { /* ignore */ }
        return w;
    }

    handlePickModeMouseMove(e) {
        if (!this.isPickingPoint) return;

        if (this.isGoingBack && this._goBackMultiPanel) {
            const chart = e.currentTarget && e.currentTarget._goBackChart;
            if (!chart || !chart.canvas) return;
            const wrapper = chart.canvas.parentElement;
            if (!wrapper) return;
            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const snapped = this.resolveSnappedCutLineAtX(chart, x);
            if (!snapped) {
                this.hideAllGoBackVisualsMulti();
                return;
            }
            this.applyGoBackVisualsForTimestamp(snapped.timestamp, { candleIndex: snapped.candleIndex });
            return;
        }

        const wrapper = this.chartWrapper || document.getElementById('chartWrapper') || this.chart.canvas?.parentElement;
        if (!wrapper) return;
        
        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        const snapped = this.resolveSnappedCutLineAtX(this.chart, x);
        if (!snapped) {
            if (this.cutLine) this.cutLine.attr('opacity', 0);
            this._updateCutLineLabel(this.cutLineLabel, null, false);
            if (this.pickModeOverlay) this.pickModeOverlay.style.width = '0';
            return;
        }

        const lineX = snapped.x;
        const candleIndex = snapped.candleIndex;

        // Update cut line position (snapped to candle center)
        if (this.cutLine) {
            this.cutLine
                .attr('x1', lineX)
                .attr('x2', lineX)
                .attr('opacity', 1);
        }
        
        // Update overlay based on mode
        if (this.pickModeOverlay) {
            if (this.isGoingBack) {
                const shadeFromX = this._goBackShadeStartX(this.chart, candleIndex, lineX);
                const rightWidth = this.chart.w - shadeFromX;
                this.pickModeOverlay.style.left = 'auto';
                this.pickModeOverlay.style.right = '0';
                this.pickModeOverlay.style.width = rightWidth + 'px';
            } else {
                const rightWidth = this.chart.w - lineX;
                this.pickModeOverlay.style.width = rightWidth + 'px';
            }
        }
        
        if (candleIndex >= 0 && this.chart.data[candleIndex]) {
            const candle = this.chart.data[candleIndex];
            const dateStr = this.formatDateTime(new Date(candle.t));
            const msg = this.isGoingBack
                ? `Go back to: ${dateStr}`
                : `Start from: ${dateStr}`;
            this._updateCutLineLabel(this.cutLineLabel, msg, true);
        }
    }
    
    /**
     * Handle click in pick mode - start replay from this point
     */
    handlePickModeClick(e) {
        if (!this.isPickingPoint) return;
        
        const rect = this.chart.container.node().getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Only accept clicks in chart area
        if (x < this.chart.margin.l || x > this.chart.w - this.chart.margin.r) {
            return;
        }
        
        // Find the candle index at click position
        const candleIndex = this.getCandleIndexAtX(x);
        
        if (candleIndex < 0) {
            console.warn('Could not find candle at click position');
            return;
        }
        
        
        // Exit pick mode
        this.exitPickPointMode();
        
        // Start replay at selected index
        this.startReplayAtIndex(candleIndex);
    }
    
    /**
     * Get candle index at x position
     */
    getCandleIndexAtX(x) {
        return this.getCandleIndexAtXForChart(this.chart, x);
    }

    getCandleIndexAtXForChart(chart, x) {
        if (!chart || !chart.data) return -1;

        if (chart.pixelToDataIndex) {
            let index = Math.round(chart.pixelToDataIndex(x));
            index = Math.max(0, Math.min(chart.data.length - 1, index));
            return index;
        }

        if (!chart.xScale) return -1;

        const chartX = x - chart.margin.l;
        const candleWidth = chart.xScale.bandwidth ? chart.xScale.bandwidth() :
            (chart.w - chart.margin.l - chart.margin.r) / chart.data.length;

        let index = Math.floor(chartX / candleWidth) + (chart.startIndex || 0);
        index = Math.max(0, Math.min(chart.data.length - 1, index));

        return index;
    }

    /**
     * Snap pointer X to candle-center pixel (same rule as crosshair / multichart rollback).
     * @returns {{ x: number, candleIndex: number, timestamp: number }|null}
     */
    resolveSnappedCutLineAtX(chart, x) {
        if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) {
            return null;
        }

        const ml = (chart.margin && chart.margin.l) || 0;
        const plotW = this._chartPlotWidth(chart);
        const mr = (chart.margin && chart.margin.r) || 0;
        if (!Number.isFinite(x) || x < ml || x > plotW - mr) {
            return null;
        }

        const candleIndex = this.getCandleIndexAtXForChart(chart, x);
        if (candleIndex < 0 || !chart.data[candleIndex]) {
            return null;
        }

        const candle = chart.data[candleIndex];
        const floor = this.sessionStartIndex || 0;
        const floorTs = this.fullRawData && this.fullRawData[floor] ? this.fullRawData[floor].t : null;
        if (floorTs != null && candle.t < floorTs) {
            return null;
        }

        if (typeof chart.dataIndexToPixel !== 'function') {
            return null;
        }

        const snappedX = chart.dataIndexToPixel(candleIndex);
        if (!Number.isFinite(snappedX) || snappedX < ml || snappedX > plotW - mr) {
            return null;
        }

        return {
            x: snappedX,
            candleIndex,
            timestamp: candle.t,
        };
    }

    collectGoBackPanelEntries() {
        const out = [];
        // V9 MultichartGrid: host tile + iframe panels (same wall-clock cut on every tile).
        if (typeof window !== 'undefined' && window.__multichartGrid
            && typeof window.__multichartGrid.enumerateCharts === 'function') {
            try {
                const charts = window.__multichartGrid.enumerateCharts();
                if (Array.isArray(charts) && charts.length > 1) {
                    charts.forEach((c, i) => {
                        if (!c || !c.canvas) return;
                        let wrapper = null;
                        try {
                            wrapper = c.canvas.parentElement;
                            if (!wrapper) {
                                const doc = c.canvas.ownerDocument;
                                wrapper = doc && doc.getElementById('chartWrapper');
                            }
                        } catch (_) { /* cross-origin */ }
                        if (wrapper) out.push({ chart: c, wrapper, panelIndex: i });
                    });
                    if (out.length > 1) return out;
                }
            } catch (_) { /* ignore */ }
        }
        const pm = typeof window !== 'undefined' ? window.panelManager : null;
        if (pm && Array.isArray(pm.panels) && pm.panels.length > 1) {
            pm.panels.forEach((panel, i) => {
                const c = panel.chartInstance;
                if (!c || !c.canvas) return;
                const wrapper = c.canvas.parentElement;
                if (!wrapper) return;
                out.push({ chart: c, wrapper, panelIndex: i });
            });
            if (out.length > 0) {
                return out;
            }
        }
        const w = document.getElementById('chartWrapper') ||
            document.querySelector('.chart-wrapper') ||
            this.chart?.canvas?.parentElement;
        if (this.chart && w) {
            out.push({ chart: this.chart, wrapper: w, panelIndex: 0 });
        }
        return out;
    }

    findLastDataIndexAtOrBefore(chart, ts) {
        if (!chart || !chart.data || chart.data.length === 0) return -1;
        let idx = -1;
        for (let i = 0; i < chart.data.length; i++) {
            if (chart.data[i].t <= ts) idx = i;
            else break;
        }
        return idx;
    }

    /** Used by pick / go-back hover labels (timezone manager when available). */
    formatDateTime(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '—';
        if (typeof window !== 'undefined' && window.timezoneManager &&
            typeof window.timezoneManager.formatTime === 'function') {
            return window.timezoneManager.formatTime(d.getTime(), 'full');
        }
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[d.getDay()];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `(${dayName}) ${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    hideAllGoBackVisualsMulti() {
        if (!this._goBackEntries) return;
        this._goBackEntries.forEach((entry) => {
            if (entry.cutLine) entry.cutLine.attr('opacity', 0);
            if (entry.pickModeOverlay) entry.pickModeOverlay.style.width = '0';
            this._updateCutLineLabel(entry.cutLineLabel, null, false);
        });
    }

    _goBackShadeStartX(chart, candleIndex, centerX) {
        if (!chart || !Number.isFinite(centerX)) return centerX;
        if (!Number.isInteger(candleIndex) || candleIndex < 0) return centerX;
        const spacing = typeof chart.getCandleSpacing === 'function'
            ? chart.getCandleSpacing()
            : (chart.candleWidth != null ? chart.candleWidth + 2 : 8);
        const ml = (chart.margin && chart.margin.l) || 0;
        return Math.max(ml, centerX - spacing / 2);
    }

    applyGoBackVisualsForTimestamp(ts, options = {}) {
        if (!this._goBackEntries) return;
        const candleIndexOpt = options.candleIndex;
        this._goBackEntries.forEach((entry) => {
            const { chart, pickModeOverlay, cutLine, cutLineLabel } = entry;
            if (!chart.data || chart.data.length === 0) {
                if (cutLine) cutLine.attr('opacity', 0);
                if (pickModeOverlay) pickModeOverlay.style.width = '0';
                this._updateCutLineLabel(cutLineLabel, null, false);
                return;
            }
            let idx = Number.isInteger(candleIndexOpt) && candleIndexOpt >= 0
                ? candleIndexOpt
                : this.findLastDataIndexAtOrBefore(chart, ts);
            if (idx < 0) {
                if (cutLine) cutLine.attr('opacity', 0);
                if (pickModeOverlay) pickModeOverlay.style.width = '0';
                this._updateCutLineLabel(cutLineLabel, null, false);
                return;
            }
            let x;
            if (typeof chart.dataIndexToPixel === 'function') {
                x = chart.dataIndexToPixel(idx);
            } else {
                return;
            }
            const plotW = this._chartPlotWidth(chart);
            if (x < chart.margin.l || x > plotW - chart.margin.r) {
                if (cutLine) cutLine.attr('opacity', 0);
                if (pickModeOverlay) pickModeOverlay.style.width = '0';
                this._updateCutLineLabel(cutLineLabel, null, false);
                return;
            }
            if (cutLine) {
                cutLine.attr('x1', x).attr('x2', x).attr('opacity', 1);
            }
            if (pickModeOverlay) {
                const shadeFromX = this._goBackShadeStartX(chart, idx, x);
                const rightWidth = chart.w - shadeFromX;
                pickModeOverlay.style.left = 'auto';
                pickModeOverlay.style.right = '0';
                pickModeOverlay.style.width = `${rightWidth}px`;
            }
            if (cutLineLabel) {
                const dateStr = this.formatDateTime(new Date(ts));
                this._updateCutLineLabel(cutLineLabel, `Go back to: ${dateStr}`, true);
            }
        });
    }

    setupGoBackMultiPanelUI(entries) {
        this._goBackMultiPanel = true;
        this._goBackEntries = [];

        const isLightMode = document.body.classList.contains('light-mode');
        const overlayColor = isLightMode ? 'rgba(244, 246, 250, 0.10)' : 'rgba(236, 240, 246, 0.10)';

        document.querySelectorAll('.indicator-icon, .drawing-tool, .chart-annotation, [class*="indicator"], .svg-overlay, .drawings-layer').forEach(el => {
            el.dataset.originalPointerEvents = el.style.pointerEvents;
            el.style.pointerEvents = 'none';
        });

        entries.forEach((entry, i) => {
            const { chart, wrapper } = entry;
            const pickModeOverlay = document.createElement('div');
            pickModeOverlay.id = `replayPickOverlay-${i}`;
            pickModeOverlay.style.cssText = `
                position: absolute;
                top: 0;
                right: 0;
                width: 0;
                height: 100%;
                background: ${overlayColor};
                pointer-events: none;
                z-index: 40;
            `;
            wrapper.appendChild(pickModeOverlay);

            const clickCaptureLayer = document.createElement('div');
            clickCaptureLayer.id = `replayClickCapture-${i}`;
            clickCaptureLayer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 50;
                cursor: crosshair;
            `;
            clickCaptureLayer._goBackChart = chart;
            wrapper.appendChild(clickCaptureLayer);

            clickCaptureLayer.addEventListener('mousemove', this.onPickModeMouseMove);
            clickCaptureLayer.addEventListener('click', this.onGoBackClick);

            const svgElement = chart.svgOverlay || chart.svg;
            let cutLine = null;
            if (svgElement) {
                cutLine = svgElement.append('line')
                    .attr('id', `replayCutLine-${i}`)
                    .attr('class', 'replay-cut-line')
                    .attr('y1', chart.margin.t)
                    .attr('y2', chart.h - chart.margin.b)
                    .attr('stroke', '#2196f3')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '6,3')
                    .attr('opacity', 0)
                    .style('pointer-events', 'none');
            }

            let cutLineLabel = null;
            if (i === 0) {
                cutLineLabel = this._createCutLineLabelElement();
            }

            wrapper.style.cursor = 'crosshair';

            this._goBackEntries.push({
                chart,
                wrapper,
                pickModeOverlay,
                clickCaptureLayer,
                cutLine,
                cutLineLabel
            });
        });

        this.pickModeOverlay = this._goBackEntries[0] ? this._goBackEntries[0].pickModeOverlay : null;
        this.clickCaptureLayer = this._goBackEntries[0] ? this._goBackEntries[0].clickCaptureLayer : null;
        this.cutLine = this._goBackEntries[0] ? this._goBackEntries[0].cutLine : null;
        this.cutLineLabel = this._goBackEntries[0] ? this._goBackEntries[0].cutLineLabel : null;
    }
    
    /**
     * Start replay at a specific candle index
     */
    startReplayAtIndex(candleIndex) {
        // === PROTECT: Don't reinitialize if during timeframe change ===
        if (this._timeframeChanging) {
            return;
        }
        
        // Find the corresponding index in rawData
        const candle = this.chart.data[candleIndex];
        if (!candle) return;
        
        const targetTime = candle.t;
        let rawIndex = this.chart.rawData.findIndex(c => c.t >= targetTime);
        if (rawIndex < 0) rawIndex = this.chart.rawData.length - 1;
        
        
        this.isActive = true;
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        
        // Store full datasets
        this.fullRawData = [...this.chart.rawData];
        this.fullData = [...this.chart.data];
        this.rawTimeframe = this.detectRawTimeframeFromData(this.fullRawData);
        this._fullRawDataMatchesTF = false;
        
        // Set current index and initialize virtual timestamp (cannot roll before session floor)
        const floorIdx = this.sessionStartIndex || 0;
        this.currentIndex = Math.max(floorIdx, Math.min(rawIndex, this.chart.rawData.length - 1));
        this.replayStartTimestamp = this.fullRawData[0].t;
        this.replayEndTimestamp = this.fullRawData[this.fullRawData.length - 1].t;
        const startBar = this.fullRawData[this.currentIndex];
        this.replayTimestamp = (startBar && Number.isFinite(startBar.t)) ? startBar.t : this.replayStartTimestamp;
        this.tickElapsedMs = 0;
        
        // === BUILD DETERMINISTIC TICK PATH CACHE ===
        // Pre-generate tick paths for all candles using seeded random
        // This ensures consistent tick animation across all timeframes
        this.buildTickPathCache();
        
        // Apply any pending speed set before replay was entered
        if (window._pendingReplaySpeed != null) {
            this.speed = this.normalizeSpeed(window._pendingReplaySpeed);
            window._pendingReplaySpeed = null;
            this.updateSpeedButtonUI(this.speed);
        }
        
        // Show replay controls
        this.showToolbar();
        this.updateSliderRange();
        
        // Filter data and render
        this.updateChartData();
        
    }
    
    /**
     * Go back to pick a new start point (within current visible data)
     */
    isBackNavigationAllowed() {
        if (typeof window === 'undefined') return true;
        // Legacy index.html sets a frozen global from the session modal; V9 often only has chart/storage session.
        if (window.backtestingSettings && window.backtestingSettings.allowBackNavigation === false) {
            return false;
        }
        let sess = null;
        try {
            if (window.chart && window.chart.backtestingSession) {
                sess = window.chart.backtestingSession;
            } else if (window.userStorage && typeof window.userStorage.getItem === 'function') {
                sess = JSON.parse(window.userStorage.getItem('backtestingSession') || '{}');
            } else {
                sess = JSON.parse(localStorage.getItem('backtestingSession') || '{}');
            }
        } catch (_) {
            sess = {};
        }
        if (sess && this._isPropFirmSession(sess)) return false;
        if (sess && sess.allowBackNavigation === false) return false;
        if (sess && sess.rollback_allowed === false) return false;
        return true;
    }

    _isPropFirmSession(sess) {
        if (!sess || typeof sess !== 'object') return false;
        const type = String(sess.type || sess.session_type || '').toLowerCase();
        if (type === 'propfirm' || type.includes('prop')) return true;
        const mode = String(sess.trading_mode || sess.tradingMode || '').toLowerCase();
        if (mode.includes('prop')) return true;
        const cfg = sess.config;
        if (cfg && typeof cfg === 'object') {
            const cfgType = String(cfg.type || '').toLowerCase();
            if (cfgType === 'propfirm' || cfgType.includes('prop')) return true;
            const cfgMode = String(cfg.trading_mode || cfg.tradingMode || '').toLowerCase();
            if (cfgMode.includes('prop')) return true;
        }
        return false;
    }

    /** True when the React V9 shell owns replay chrome (skip legacy floating toasts). */
    _isV9ShellActive() {
        if (typeof window === 'undefined') return false;
        if (window.__TALARIA_V9_UI_REV__) return true;
        try {
            return !!document.querySelector('[data-v9-chrome="1"]');
        } catch (_) {
            return false;
        }
    }

    goBackToPickPoint() {
        if (!this.isBackNavigationAllowed()) {
            console.warn('🚫 Go Back blocked: back navigation disabled by session policy');
            return;
        }

        
        // Stop playback if playing
        if (this.isPlaying) {
            this.stop();
        }

        // Clear stale animation state so the price line snaps to the
        // current bar's close instead of showing a mid-tick price.
        this._savedTickState = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        this.tickElapsedMs = 0;
        
        // Keep replay active, just enter pick mode to select earlier point
        this.isPickingPoint = true;
        this.isGoingBack = true; // Flag to know we're in "go back" mode
        
        // Update button appearance
        if (this.replayBtn) {
            this.replayBtn.classList.add('picking');
            this.replayBtn.style.background = 'rgba(33, 150, 243, 0.3)';
            this.replayBtn.style.borderColor = '#2196f3';
        }
        
        // Bind handlers FIRST before creating overlay
        this.onGoBackClick = this.handleGoBackClick.bind(this);
        this.onPickModeMouseMove = this.handlePickModeMouseMove.bind(this);

        const goBackEntries = this.collectGoBackPanelEntries();
        if (goBackEntries.length > 1) {
            this.chartWrapper = goBackEntries[0].wrapper;
            this.setupGoBackMultiPanelUI(goBackEntries);
        } else {
            this.chartWrapper = document.getElementById('chartWrapper') ||
                document.querySelector('.chart-wrapper') ||
                this.chart.canvas?.parentElement;
            this.createGoBackOverlay();
            this.createCutLine();
        }

        // Show instruction
        this.showGoBackInstruction();
    }
    
    /**
     * Create overlay for go back mode
     */
    createGoBackOverlay() {
        // Get the chart wrapper element
        const chartWrapper = document.getElementById('chartWrapper') || 
                            document.querySelector('.chart-wrapper') ||
                            this.chart.canvas?.parentElement;
        
        if (!chartWrapper) {
            console.warn('Could not find chart wrapper for overlay');
            return;
        }
        
        // Detect light mode
        const isLightMode = document.body.classList.contains('light-mode');
        const overlayColor = isLightMode ? 'rgba(244, 246, 250, 0.10)' : 'rgba(236, 240, 246, 0.10)';
        
        this.pickModeOverlay = document.createElement('div');
        this.pickModeOverlay.id = 'replayPickOverlay';
        this.pickModeOverlay.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            width: 0;
            height: 100%;
            background: ${overlayColor};
            pointer-events: none;
            z-index: 40;
        `;
        chartWrapper.appendChild(this.pickModeOverlay);
        
        // Disable pointer-events on indicators/drawings during go-back mode
        document.querySelectorAll('.indicator-icon, .drawing-tool, .chart-annotation, [class*="indicator"], .svg-overlay, .drawings-layer').forEach(el => {
            el.dataset.originalPointerEvents = el.style.pointerEvents;
            el.style.pointerEvents = 'none';
        });
        
        // Create click capture layer to ensure clicks work
        this.clickCaptureLayer = document.createElement('div');
        this.clickCaptureLayer.id = 'replayClickCapture';
        this.clickCaptureLayer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            cursor: crosshair;
        `;
        chartWrapper.appendChild(this.clickCaptureLayer);
        
        // Add listeners to capture layer instead
        this.clickCaptureLayer.addEventListener('mousemove', this.onPickModeMouseMove);
        this.clickCaptureLayer.addEventListener('click', this.onGoBackClick);
        
        // Change cursor to crosshair
        chartWrapper.style.cursor = 'crosshair';
    }
    
    /**
     * Show instruction for go back mode
     */
    showGoBackInstruction() {
        // V9: replay bar already highlights Rollback (RB) — no legacy floating toast.
        if (this._isV9ShellActive()) {
            return;
        }

        const instruction = document.createElement('div');
        instruction.id = 'replayPickInstruction';
        instruction.className = 'replay-pick-instruction';
        instruction.style.cssText = `
            position: fixed;
            bottom: 82px;
            left: 50%;
            transform: translateX(-50%) translateY(8px);
            opacity: 0;
            background: rgba(10, 12, 22, 0.94);
            border: 1px solid rgba(140, 160, 255, 0.22);
            color: #b4c0e8;
            padding: 8px 14px;
            border-radius: 6px;
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0;
            z-index: 10000;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: opacity 0.2s ease, transform 0.2s ease;
        `;
        instruction.innerHTML = `
            <span>Click on chart to rewind to that point</span>
            <button type="button" id="cancelPickMode" style="
                background: rgba(74, 106, 255, 0.08);
                border: 1px solid rgba(140, 160, 255, 0.28);
                color: #8ca0ff;
                padding: 4px 10px;
                border-radius: 4px;
                cursor: default;
                font-family: inherit;
                font-size: 11px;
                font-weight: 500;
            ">Cancel (ESC)</button>
        `;
        document.body.appendChild(instruction);

        requestAnimationFrame(() => {
            instruction.style.opacity = '1';
            instruction.style.transform = 'translateX(-50%) translateY(0)';
        });

        document.getElementById('cancelPickMode').addEventListener('click', () => {
            this.exitGoBackMode();
            try {
                window.dispatchEvent(new CustomEvent('talariaReplayRollbackDone'));
            } catch (_) { /* ignore */ }
        });

        this.escKeyHandler = (e) => {
            if (e.key === 'Escape' && this.isPickingPoint) {
                this.exitGoBackMode();
                try {
                    window.dispatchEvent(new CustomEvent('talariaReplayRollbackDone'));
                } catch (_) { /* ignore */ }
            }
        };
        document.addEventListener('keydown', this.escKeyHandler);
    }
    
    /**
     * Rewind replay to a wall-clock cut point and notify multichart panels.
     * @param {number|string|Date} targetTimestamp
     * @param {{ sourceChart?: object, candleIndex?: number }} options
     * @returns {boolean}
     */
    applyReplayCutToWallClock(targetTimestamp, options = {}) {
        if (!this.isBackNavigationAllowed()) return false;
        if (!this.isActive || !Array.isArray(this.fullRawData) || this.fullRawData.length === 0) {
            return false;
        }

        const sourceChart = options.sourceChart || this.chart;
        const chart = this.chart;
        const ts = chart && typeof chart.normalizeTimestampMs === 'function'
            ? chart.normalizeTimestampMs(targetTimestamp)
            : Number(targetTimestamp);
        if (!Number.isFinite(ts)) return false;

        if (this.isPlaying) {
            if (typeof this.stop === 'function') this.stop();
            else if (typeof this.pause === 'function') this.pause();
        }
        this.isPlaying = false;
        this._savedTickState = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        this.tickElapsedMs = 0;

        const goBackFloor = this.sessionStartIndex || 0;
        let newRawIndex = goBackFloor;
        let orderCutoff = ts + 1;

        const candleIndex = options.candleIndex;
        if (Number.isInteger(candleIndex) && candleIndex >= 0
            && sourceChart && Array.isArray(sourceChart.data)
            && sourceChart.data[candleIndex]) {
            const candle = sourceChart.data[candleIndex];
            const cutAtMs = Number.isFinite(candle.t) ? candle.t : ts;
            orderCutoff = cutAtMs;

            let idx = typeof this._findLastRawIndexStrictlyBefore === 'function'
                ? this._findLastRawIndexStrictlyBefore(this.fullRawData, cutAtMs)
                : -1;
            if (idx < 0) idx = goBackFloor - 1;
            newRawIndex = Math.max(goBackFloor, Math.min(idx, this.fullRawData.length - 1));
        } else {
            const cutAtMs = ts;
            orderCutoff = cutAtMs;

            let idx = typeof this._findLastRawIndexStrictlyBefore === 'function'
                ? this._findLastRawIndexStrictlyBefore(this.fullRawData, cutAtMs)
                : -1;
            if (idx < 0) idx = goBackFloor - 1;
            newRawIndex = Math.max(goBackFloor, Math.min(idx, this.fullRawData.length - 1));
        }

        if (this.chart.orderManager && typeof this.chart.orderManager.forceCloseAllOrders === 'function') {
            this.chart.orderManager.forceCloseAllOrders(orderCutoff);
        }

        this.currentIndex = Math.max(newRawIndex, goBackFloor);
        const rawBar = this.fullRawData[this.currentIndex];
        if (rawBar && Number.isFinite(rawBar.t)) {
            this.replayTimestamp = rawBar.t;
        } else {
            this.replayTimestamp = ts;
        }

        this.updateChartData();
        if (typeof this.updateTimeDisplay === 'function') {
            this.updateTimeDisplay();
        }

        if (this.chart.orderManager && typeof this.chart.orderManager.redrawPreservedTradeMarkers === 'function') {
            setTimeout(() => this.chart.orderManager.redrawPreservedTradeMarkers(), 100);
        }

        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('talariaReplayCut', {
                    detail: {
                        timestamp: this.replayTimestamp,
                        orderCutoff,
                    },
                }));
            }
        } catch (_) { /* ignore */ }

        return true;
    }

    /**
     * Handle click in go back mode - rewind to this point
     */
    handleGoBackClick(e) {
        if (!this.isPickingPoint || !this.isGoingBack) return;

        if (!this.isBackNavigationAllowed()) {
            this.exitGoBackMode();
            return;
        }

        const sourceChart = (this._goBackMultiPanel && e.currentTarget && e.currentTarget._goBackChart)
            ? e.currentTarget._goBackChart
            : this.chart;
        if (!sourceChart || !sourceChart.canvas) return;

        const wrapper = sourceChart.canvas.parentElement;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const plotW = this._chartPlotWidth(sourceChart);
        const mr = (sourceChart.margin && sourceChart.margin.r) || 0;
        const ml = (sourceChart.margin && sourceChart.margin.l) || 0;

        if (x < ml || x > plotW - mr) {
            return;
        }

        const snapped = this.resolveSnappedCutLineAtX(sourceChart, x);
        if (!snapped) {
            console.warn('Could not find candle at click position');
            return;
        }

        const { candleIndex, timestamp } = snapped;
        const candle = sourceChart.data[candleIndex];
        if (!candle) return;

        const flashCutLines = () => {
            if (this._goBackMultiPanel && this._goBackEntries) {
                this._goBackEntries.forEach((ent) => {
                    if (ent.cutLine) {
                        ent.cutLine.attr('stroke', '#4caf50').attr('stroke-width', 2);
                    }
                });
            } else if (this.cutLine) {
                this.cutLine.attr('stroke', '#4caf50').attr('stroke-width', 2);
            }
        };
        flashCutLines();

        setTimeout(() => {
            this.applyReplayCutToWallClock(timestamp, { sourceChart, candleIndex });
            this.exitGoBackMode();
            try {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('talariaReplayRollbackDone'));
                }
            } catch (_) { /* ignore */ }
        }, 150);
    }
    
    /**
     * Exit go back mode
     */
    exitGoBackMode() {
        this.isPickingPoint = false;
        this.isGoingBack = false;
        
        // Reset button appearance
        if (this.replayBtn) {
            this.replayBtn.classList.remove('picking');
            this.replayBtn.style.background = '';
            this.replayBtn.style.borderColor = '';
        }
        
        if (this._goBackMultiPanel && this._goBackEntries) {
            this._goBackEntries.forEach((ent) => {
                if (ent.wrapper) ent.wrapper.style.cursor = '';
            });
        } else if (this.chartWrapper) {
            this.chartWrapper.style.cursor = '';
        }

        // Remove overlay, cut line and capture layer
        this.removePickModeElements();
    }
    
    /**
     * Remove pick mode elements
     */
    removePickModeElements() {
        if (this._goBackMultiPanel && this._goBackEntries) {
            this._goBackEntries.forEach((entry) => {
                if (entry.cutLine) {
                    entry.cutLine.remove();
                }
                if (entry.cutLineLabel) {
                    this._disposeCutLineLabel(entry.cutLineLabel);
                }
                if (entry.pickModeOverlay) {
                    entry.pickModeOverlay.remove();
                }
                if (entry.clickCaptureLayer) {
                    entry.clickCaptureLayer.removeEventListener('mousemove', this.onPickModeMouseMove);
                    entry.clickCaptureLayer.removeEventListener('click', this.onGoBackClick);
                    entry.clickCaptureLayer.remove();
                }
            });
            this._goBackEntries = null;
            this._goBackMultiPanel = false;
            this.cutLine = null;
            this.cutLineLabel = null;
            this.pickModeOverlay = null;
            this.clickCaptureLayer = null;
        } else {
            if (this.cutLine) {
                this.cutLine.remove();
                this.cutLine = null;
            }

            if (this.cutLineLabel) {
                this._disposeCutLineLabel(this.cutLineLabel);
                this.cutLineLabel = null;
            }

            if (this.pickModeOverlay) {
                this.pickModeOverlay.remove();
                this.pickModeOverlay = null;
            }

            if (this.clickCaptureLayer) {
                this.clickCaptureLayer.removeEventListener('mousemove', this.onPickModeMouseMove);
                this.clickCaptureLayer.removeEventListener('click', this.onGoBackClick);
                this.clickCaptureLayer.remove();
                this.clickCaptureLayer = null;
            }
        }
        
        // Restore pointer-events on indicators/drawings
        document.querySelectorAll('.indicator-icon, .drawing-tool, .chart-annotation, [class*="indicator"], .svg-overlay, .drawings-layer').forEach(el => {
            if (el.dataset.originalPointerEvents !== undefined) {
                el.style.pointerEvents = el.dataset.originalPointerEvents || '';
                delete el.dataset.originalPointerEvents;
            }
        });
        
        // Remove instruction
        const instruction = document.getElementById('replayPickInstruction');
        if (instruction) instruction.remove();
        
        // Remove ESC handler
        if (this.escKeyHandler) {
            document.removeEventListener('keydown', this.escKeyHandler);
        }
    }

    /**
     * Enter replay mode
     * @param {Object} [options] - Optional configuration
     * @param {boolean} [options.startAtBeginning] - Backtest-style session floor (URL/mode)
     * @param {boolean} [options.suppressInitialUpdateChartData] - Skip first `updateChartData()` so host can restore playhead (TF refetch); avoids SL/TP on session-start bar.
     * @param {boolean} [options.skipRealignAfterLayout] - Host owns viewport after TF refetch; skip internal realign loop.
     * @param {boolean} [options.preservePlayhead] - TF refetch: keep wall-clock playhead instead of resetting to session start.
     * @param {number} [options.initialReplayTimestamp] - Wall-clock ms to restore when preservePlayhead is set.
     * @param {number} [options.initialCurrentIndex] - Optional raw index hint from the prior TF.
     */
    enterReplayMode(options = {}) {
        // === PROTECT: Don't reinitialize if already active or during timeframe change ===
        if (this.isActive) {
            return;
        }
        if (this._timeframeChanging) {
            return;
        }
        
        if (!this.chart.rawData || this.chart.rawData.length === 0) {
            alert('Please load data first');
            return;
        }

        
        // Ensure chart is ready to render
        this.chart.isLoading = false;
        
        this.isActive = true;
        
        // Force indicator rebuild on the replay slice (not the pre-replay full dataset snapshot).
        if (this.chart) {
            this.chart._indCalcSnapshot = null;
            if (typeof this.chart._invalidateIndicatorLayerCache === 'function') {
                this.chart._invalidateIndicatorLayerCache();
            }
        }
        
        // Reset auto-scroll state
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        
        // Check if this is backtesting mode (from URL or options)
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const isBacktesting = mode === 'backtest' || mode === 'propfirm' || options.startAtBeginning;

        const rd = this.chart.rawData;
        let sessionStartMs = null;
        try {
            let sess = this.chart.backtestingSession;
            if (!sess && typeof window !== 'undefined' && window.userStorage) {
                sess = JSON.parse(window.userStorage.getItem('backtestingSession') || '{}');
            }
            const raw = sess && (sess.startDate || sess.start_date);
            if (raw) {
                const t = new Date(raw).getTime();
                if (Number.isFinite(t)) sessionStartMs = t;
            }
        } catch (e) { /* ignore */ }

        const preservePlayhead = !!options.preservePlayhead;
        const initialReplayTs = (typeof options.initialReplayTimestamp === 'number'
            && Number.isFinite(options.initialReplayTimestamp))
            ? options.initialReplayTimestamp
            : null;

        if (preservePlayhead && initialReplayTs != null && Array.isArray(rd) && rd.length > 0) {
            let idx = typeof this._findLastRawIndexAtOrBefore === 'function'
                ? this._findLastRawIndexAtOrBefore(rd, initialReplayTs)
                : -1;
            if (idx < 0 && typeof options.initialCurrentIndex === 'number'
                && Number.isFinite(options.initialCurrentIndex)) {
                idx = Math.min(Math.max(Math.floor(options.initialCurrentIndex), 0), rd.length - 1);
            }
            if (idx < 0) idx = 0;
            this.currentIndex = idx;
            this.replayTimestamp = rd[idx]?.t ?? initialReplayTs;

            let floorIdx = 0;
            if (sessionStartMs != null) {
                const floorHit = typeof this._findLastRawIndexAtOrBefore === 'function'
                    ? this._findLastRawIndexAtOrBefore(rd, sessionStartMs)
                    : -1;
                floorIdx = floorHit >= 0 ? floorHit : 0;
            }
            this.sessionStartIndex = floorIdx;
            if (this.currentIndex < this.sessionStartIndex) {
                this.currentIndex = this.sessionStartIndex;
                this.replayTimestamp = rd[this.currentIndex]?.t ?? this.replayTimestamp;
            }
        } else if (isBacktesting) {
            // Backtest replay begins at session start; pre-session history loads on pan-left.
            let startIdx = Math.min(10, rd.length - 1);
            if (sessionStartMs != null && Array.isArray(rd) && rd.length > 0) {
                let found = -1;
                for (let i = 0; i < rd.length; i++) {
                    const bar = rd[i];
                    if (bar && Number.isFinite(bar.t) && bar.t >= sessionStartMs) {
                        found = i;
                        break;
                    }
                }
                if (found >= 0) {
                    startIdx = found;
                } else {
                    startIdx = rd.length - 1;
                }
            }
            this.currentIndex = Math.max(0, startIdx);
            this.sessionStartIndex = this.currentIndex;
        } else {
            // Normal replay: start at 10% for context
            this.currentIndex = Math.floor(this.chart.rawData.length * 0.1);
            this.sessionStartIndex = 0;
        }
        
        // Store full datasets
        this.fullRawData = [...this.chart.rawData];
        this.fullData = [...this.chart.data];
        this.rawTimeframe = this.detectRawTimeframeFromData(this.fullRawData);
        this._fullRawDataMatchesTF = false;
        
        // === INITIALIZE VIRTUAL TIMESTAMP TRACKING ===
        this.replayStartTimestamp = this.fullRawData[0].t;
        this.replayEndTimestamp = this.fullRawData[this.fullRawData.length - 1].t;
        this.replayTimestamp = this.fullRawData[this.currentIndex].t;
        this.tickElapsedMs = 0;

        this._persistedPlayheadApplied = false;

        // Apply persisted replay state (if loaded earlier) once fullRawData exists
        try {
            const pending = this.chart && this.chart._pendingReplayState ? this.chart._pendingReplayState : null;
            if (pending && typeof this.applyPersistedState === 'function') {
                this.applyPersistedState(pending);
                this.chart._pendingReplayState = null;
            } else {
                this._persistedPlayheadApplied = true;
            }
        } catch (e) {
            this._persistedPlayheadApplied = true;
        }
        
        // Tick path cache is built lazily on demand via getTickPath()
        this.tickPathCache = {};
        this.tickPathCacheBuilt = false;
        
        // Apply any pending speed set before replay was entered
        if (window._pendingReplaySpeed != null) {
            this.speed = this.normalizeSpeed(window._pendingReplaySpeed);
            window._pendingReplaySpeed = null;
            this.updateSpeedButtonUI(this.speed);
        }
        
        // Show replay controls
        this.showToolbar();
        this.updateSliderRange();

        this._attachReplayFollowViewportListeners();
        
        if (!options.suppressInitialUpdateChartData) {
            // Filter data and render
            this.updateChartData();
            requestAnimationFrame(() => this.updateAutoScrollIndicator());
        }

        // Refresh-safety: on a hard refresh, enterReplayMode can fire before the
        // canvas has its real dimensions (chart.w === 0), AND the async session
        // state restore (loadTradingSessionStateIfNeeded) can overwrite offsetX,
        // candleWidth, priceOffset, priceZoom, autoScale with stale saved values
        // AFTER this function returns. Both leave candles off-screen until the
        // user double-clicks the time axis (jumpToLatest).
        // Run multiple alignment passes over ~2.5s to catch all late overwrites.
        let realignAttempts = 0;
        const realignAfterLayout = () => {
            if (!this.isActive) return;
            if (this.userHasPanned) return;
            try {
                if (typeof this.chart.resize === 'function') {
                    this.chart._lastResizeDpr = 0;
                    this.chart.resize();
                }
            } catch (e) { /* ignore */ }
            if (this.autoScrollEnabled) {
                this.chart.autoScale = true;
                this.chart.priceOffset = 0;
                this.chart.priceZoom = 1;
                const st = this.getReplayAutoScrollState(this.chart);
                if (st && Number.isFinite(st.offsetX)) {
                    this.chart.offsetX = st.offsetX;
                    if (typeof this.chart.constrainOffset === 'function') {
                        this.chart.constrainOffset();
                    }
                }
                this.chart.renderPending = true;
                if (typeof this.chart.render === 'function') this.chart.render();
            }
            if (++realignAttempts < 8) {
                setTimeout(realignAfterLayout, realignAttempts <= 3 ? 200 : 500);
            }
        };
        if (!options.skipRealignAfterLayout) {
            requestAnimationFrame(realignAfterLayout);
        }
    }

    /**
     * Exit replay mode
     */
    exitReplayMode() {
        this._flushReplayStateToSession();
        this.isActive = false;
        this.stop();

        const floatingClone = document.getElementById('replayToolbarClone');
        if (floatingClone) {
            floatingClone.remove();
            userStorage.removeItem('replayToolbarClonePosition');
        }
        if (this.toolbar) {
            this.toolbar.style.opacity = '1';
        }
        
        // Restore full data
        if (this.fullRawData) {
            this.chart.rawData = [...this.fullRawData];
            this.chart.data = this.chart.resampleData(this.chart.rawData, this.chart.currentTimeframe);
            if (typeof this.chart.bumpDataVersion === 'function') {
                this.chart.bumpDataVersion();
            }
            
            if (typeof this.chart.scheduleIndicatorRecalc === 'function') {
                this.chart.scheduleIndicatorRecalc('replay-restore', { force: true, immediate: true });
            } else if (typeof this.chart.recalculateIndicators === 'function') {
                this.chart.recalculateIndicators();
            }
            if (this.chart.drawingManager && typeof this.chart.drawingManager.redrawAll === 'function') {
                this.chart.drawingManager.redrawAll();
            }
            
            this._syncCompareOverlaysForReplay();
            this.chart.scheduleRender();
        }
        
        // Hide control bar
        this.hideToolbar();

        try {
            const injected = document.querySelector('button[data-talaria-replay-follow="injected"]');
            if (injected && injected.parentElement) injected.remove();
        } catch (_) {}

        this._detachReplayFollowViewportListeners();

        this.followBtn = null;
        this.updateAutoScrollIndicator();
    }

    getReplayAutoScrollState(chartInstance = this.chart) {
        if (!chartInstance || !Array.isArray(chartInstance.data)) return null;

        const candleSpacing = chartInstance.getCandleSpacing
            ? chartInstance.getCandleSpacing()
            : (chartInstance.candleWidth + (chartInstance.candleGap || 2));

        if (!Number.isFinite(candleSpacing) || candleSpacing <= 0) return null;

        // Internal layout width can lag the visible DOM (multi-panel split, first resize frame).
        // Returning null used to leave offsetX at 0 → viewport on the *left* of a long backtest
        // slice so min/max OHLC across the whole loaded window "explodes" the Y-axis (~years of FX range).
        let effectiveW = Number(chartInstance.w) || 0;
        if (effectiveW < 80) {
            try {
                const canvas = chartInstance.canvas;
                const el = canvas && canvas.parentElement;
                const rw = el ? el.getBoundingClientRect().width : 0;
                if (Number.isFinite(rw) && rw >= 80) effectiveW = rw;
            } catch (_e) { /* ignore */ }
        }
        // Conservative default: slightly underestimate width → scroll a touch further right so the
        // playhead sits near the edge instead of leaving the chart squashed to the full history range.
        if (effectiveW < 80) {
            effectiveW = 320;
        }

        const m = chartInstance.margin || { l: 0, r: 70 };
        const chartAreaW = Math.max(0, effectiveW - (m.l || 0) - (m.r || 0));
        const numVisibleCandles = Math.max(1, Math.floor(chartAreaW / candleSpacing));

        const configuredGapCandles = Math.max(
            0,
            Math.round(
                Number.isFinite(chartInstance.timeScale?.rightOffsetCandles)
                    ? chartInstance.timeScale.rightOffsetCandles
                    : 0
            )
        );
        const ratioGapCandles = Math.max(
            0,
            Math.floor(numVisibleCandles * (Number.isFinite(this.replayRightPaddingRatio) ? this.replayRightPaddingRatio : 0.2))
        );
        const rightGapCandles = Math.max(configuredGapCandles, ratioGapCandles);

        const targetVisibleCandles = Math.max(1, numVisibleCandles - rightGapCandles);
        // Anchor so the LAST loaded bar (the replay playhead — `data` is sliced to it)
        // sits at the right-anchored slot (targetVisibleCandles-1 from the left),
        // leaving rightGapCandles of empty space to its right, exactly like a full
        // window. When the loaded prefix is SHORTER than the window — e.g. just
        // switched to a higher timeframe early in the session, so only a few bars
        // exist up to the playhead — this goes NEGATIVE so offsetX shifts the data
        // RIGHT and the playhead stays right-anchored with empty space on the LEFT
        // (TradingView behavior). The old `Math.max(0, …)` floored it to 0, pinning
        // offsetX to 0 and squashing the few candles + playhead to the far LEFT with
        // empty future space on the right (the "TF switch drifts left" bug).
        const scrollPosition = chartInstance.data.length - targetVisibleCandles;

        return {
            offsetX: -scrollPosition * candleSpacing,
            numVisibleCandles,
            rightGapCandles,
            scrollPosition: Math.max(0, scrollPosition)
        };
    }

    /**
     * TradingView-style: place the replay playhead candle at horizontal center of the plot area.
     * Used on timeframe switch only — playback follow still uses getReplayAutoScrollState().
     */
    getReplayCenterPlayheadOffset(chartInstance = this.chart) {
        if (!chartInstance || !Array.isArray(chartInstance.data) || !chartInstance.data.length) {
            return null;
        }

        const candleSpacing = chartInstance.getCandleSpacing
            ? chartInstance.getCandleSpacing()
            : (chartInstance.candleWidth + (chartInstance.candleGap || 2));
        if (!Number.isFinite(candleSpacing) || candleSpacing <= 0) return null;

        let effectiveW = Number(chartInstance.w) || 0;
        if (effectiveW < 80) {
            try {
                const canvas = chartInstance.canvas;
                const el = canvas && canvas.parentElement;
                const rw = el ? el.getBoundingClientRect().width : 0;
                if (Number.isFinite(rw) && rw >= 80) effectiveW = rw;
            } catch (_e) { /* ignore */ }
        }
        if (effectiveW < 80) effectiveW = 320;

        const m = chartInstance.margin || { l: 60, r: 60 };
        const plotW = Math.max(1, effectiveW - (m.l || 0) - (m.r || 0));
        const centerX = (m.l || 0) + plotW / 2;

        const replayTs = Number.isFinite(this.replayTimestamp)
            ? this.replayTimestamp
            : (this.fullRawData && typeof this.currentIndex === 'number'
                ? this.fullRawData[this.currentIndex]?.t
                : null);

        let targetViewIndex = chartInstance.data.length - 1;
        for (let i = 0; i < chartInstance.data.length; i++) {
            if (replayTs == null || chartInstance.data[i].t <= replayTs) {
                targetViewIndex = i;
            } else {
                break;
            }
        }

        return centerX - (targetViewIndex * candleSpacing) - candleSpacing / 2;
    }

    /**
     * True when the user deliberately moved/zoomed the viewport away from replay follow.
     * Uses flags plus offset comparison so wheel / time-axis zoom count even without drag-pan.
     */
    _replayUserOwnsViewport(chartInstance = this.chart) {
        if (!this.isActive || !chartInstance) return false;
        if (this.userHasPanned || !this.autoScrollEnabled) return true;
        // TF-switch anchor lock while paused is not manual pan.
        if (chartInstance._tfSwitchAnchorLock && !this.isPlaying) return false;

        const st = typeof this.getReplayAutoScrollState === 'function'
            ? this.getReplayAutoScrollState(chartInstance)
            : null;
        if (!st || !Number.isFinite(st.offsetX)) return false;

        const spacing = chartInstance.getCandleSpacing
            ? chartInstance.getCandleSpacing()
            : (chartInstance.candleWidth + (chartInstance.candleGap || 2));
        if (!(Number.isFinite(spacing) && spacing > 0)) return false;

        return Math.abs((chartInstance.offsetX || 0) - st.offsetX) > spacing * 0.2;
    }

    /**
     * Snapshot the current viewport when starting playback so Play never snaps back
     * to follow mode after the user panned/zoomed away.
     */
    _capturePlaybackViewportLock() {
        const chart = this.chart;
        if (!this.isActive || !chart) {
            this._viewportLockForPlayback = null;
            return;
        }
        // Follow mode: chart must scroll with the playhead — never freeze the viewport.
        if (!this.userHasPanned && this.autoScrollEnabled) {
            this._viewportLockForPlayback = null;
            return;
        }
        if (!this._replayUserOwnsViewport(chart)) {
            this._viewportLockForPlayback = null;
            return;
        }
        this._viewportLockForPlayback = {
            offsetX: chart.offsetX,
            candleWidth: chart.candleWidth,
            priceZoom: chart.priceZoom,
            priceOffset: chart.priceOffset,
            autoScale: chart.autoScale,
            manualCenterPrice: chart.manualCenterPrice,
            manualRange: chart.manualRange,
        };
        this.autoScrollEnabled = false;
        this.userHasPanned = true;
    }

    /** True while the user is dragging/zooming — playback must not fight the viewport. */
    _isUserInteractingWithChart(chartInstance = this.chart) {
        const chart = chartInstance;
        if (!chart) return false;
        if (typeof chart._isChartViewPanning === 'function' && chart._isChartViewPanning()) return true;
        if (typeof chart._isWheelZoomBurst === 'function' && chart._isWheelZoomBurst()) return true;
        if (typeof chart._isAxisZoomDragging === 'function' && chart._isAxisZoomDragging()) return true;
        const drag = chart.drag;
        if (drag && drag.active) {
            const t = drag.type;
            if (t === 'pan' || t === 'timeAxis' || t === 'priceAxis' || t === 'boxZoom') return true;
        }
        return false;
    }

    /** Restore locked viewport after data updates / constrainOffset during manual playback. */
    _applyPlaybackViewportLock(chartInstance = this.chart) {
        const lock = this._viewportLockForPlayback;
        if (!lock || !this.isPlaying || !chartInstance) return;
        if (this._isUserInteractingWithChart(chartInstance)) return;
        chartInstance.offsetX = lock.offsetX;
        if (Number.isFinite(lock.candleWidth)) chartInstance.candleWidth = lock.candleWidth;
        if (Number.isFinite(lock.priceZoom)) chartInstance.priceZoom = lock.priceZoom;
        if (Number.isFinite(lock.priceOffset)) chartInstance.priceOffset = lock.priceOffset;
        chartInstance.autoScale = lock.autoScale;
        chartInstance.manualCenterPrice = lock.manualCenterPrice;
        chartInstance.manualRange = lock.manualRange;
    }

    /**
     * Align chart viewport to the replay playhead (right edge). Used after backtest TF refetch
     * and when starting playback so Y-axis auto-scale frames the playhead, not full 1D history.
     * Pass opts.centerPlayhead=true on timeframe switch to center the playhead (TradingView-style).
     */
    syncReplayViewportToPlayhead(chartInstance = this.chart, opts = {}) {
        if (!this.isActive || !chartInstance) return false;
        // TF-switch anchor lock (paused) — keep screen position unless forced.
        if (opts.forceRecenter !== true && chartInstance._tfSwitchAnchorLock && !this.isPlaying) {
            return false;
        }
        // Manual viewport — don't recenter on playhead unless explicitly forced.
        if (opts.forceRecenter !== true && this._replayUserOwnsViewport(chartInstance)) {
            return false;
        }

        let offsetX = null;
        if (opts.centerPlayhead) {
            offsetX = this.getReplayCenterPlayheadOffset(chartInstance);
        } else {
            const st = this.getReplayAutoScrollState(chartInstance);
            if (st && Number.isFinite(st.offsetX)) offsetX = st.offsetX;
        }
        if (!Number.isFinite(offsetX)) return false;

        chartInstance.offsetX = offsetX;
        if (opts.resetPriceScale !== false) {
            chartInstance.autoScale = true;
            chartInstance.priceOffset = 0;
            chartInstance.priceZoom = 1;
            chartInstance.manualCenterPrice = null;
            chartInstance.manualRange = null;
            if (chartInstance.priceScale) {
                chartInstance.priceScale.autoScale = true;
            }
        }
        if (typeof chartInstance.constrainOffset === 'function') {
            chartInstance.constrainOffset();
        }
        if (opts.render !== false) {
            chartInstance.renderPending = true;
            if (typeof chartInstance.render === 'function') {
                chartInstance.render();
            }
        }
        return true;
    }

    _syncCompareOverlaysForReplay() {
        const co = this.chart && this.chart.compareOverlay;
        if (co && typeof co.syncForReplay === 'function') {
            try { co.syncForReplay(); } catch (e) {
                console.warn('[replay] compare overlay sync failed', e);
            }
        }
    }

    /**
     * Paint after a replay data step. During play, one lite render (matches pan fast path);
     * paused/scrub keeps legacy flush so crosshair and overlays settle crisply.
     */
    _renderReplayChartUpdate() {
        const chart = this.chart;
        if (!chart) return;
        chart.renderPending = true;
        if (typeof chart.render === 'function') {
            chart.render();
        }
        if (this.isPlaying) return;
        if (chart.canvas) {
            void chart.canvas.offsetHeight;
            if (chart.ctx) {
                try {
                    void chart.ctx.getImageData(0, 0, 1, 1);
                } catch (_e) { /* ignore */ }
            }
        }
        setTimeout(() => {
            chart.renderPending = true;
        }, 0);
        requestAnimationFrame(() => {
            chart.renderPending = true;
        });
    }

    /**
     * Schedule indicator recalc for the current replay slice.
     * During play: sync recalc once per animation frame (same path as DEMA).
     * When paused: immediate sync pass for scrub position.
     */
    _scheduleReplayIndicatorRecalc() {
        const chart = this.chart;
        if (!chart || !chart.indicators || !chart.indicators.active || !chart.indicators.active.length) {
            return;
        }
        if (!Array.isArray(chart.data) || !chart.data.length) return;
        if (this._tfSwitchSkipHeavyIndicators) return;
        const passivePlay = chart._multichartPassivePlayActive === true;
        const effectivePlaying = this.isPlaying || passivePlay;
        if (!effectivePlaying
            && typeof chart._isChartViewPanning === 'function'
            && chart._isChartViewPanning()
            && typeof chart._deferIndicatorRecalcAfterZoomFill === 'function') {
            chart._deferIndicatorRecalcAfterZoomFill(120);
            return;
        }

        if (typeof chart.scheduleReplayIndicatorRecalc === 'function') {
            chart.scheduleReplayIndicatorRecalc(effectivePlaying);
            return;
        }

        const reason = effectivePlaying ? 'replay-tick' : 'replay-step';
        if (typeof chart.scheduleIndicatorRecalc === 'function') {
            chart.scheduleIndicatorRecalc(reason, { force: true, immediate: true });
        } else if (typeof chart.recalculateIndicators === 'function') {
            chart.recalculateIndicators();
        }
        if (typeof chart.updateOHLCIndicators === 'function') {
            try { chart.updateOHLCIndicators(); } catch (_) {}
        }
    }

    _flushReplayIndicatorRecalc() {
        const chart = this.chart;
        if (!chart || !chart.indicators || !chart.indicators.active || !chart.indicators.active.length) return;
        if (typeof chart._flushQueuedIndicatorRecalc === 'function') {
            chart._flushQueuedIndicatorRecalc();
        }
        if (chart._replayIndRecalcRaf != null) {
            cancelAnimationFrame(chart._replayIndRecalcRaf);
            chart._replayIndRecalcRaf = null;
        }
        if (chart._indicatorWorkerBusy) {
            chart._indicatorWorkerCoalesce = true;
        }
        if (typeof chart.scheduleReplayIndicatorRecalc === 'function') {
            chart.scheduleReplayIndicatorRecalc(false);
        } else if (typeof chart.scheduleIndicatorRecalc === 'function') {
            chart.scheduleIndicatorRecalc('replay-pause', { force: true, immediate: true });
        } else if (typeof chart.recalculateIndicators === 'function') {
            try { chart.recalculateIndicators(); } catch (_) {}
        }
        if (typeof chart.updateOHLCIndicators === 'function') {
            try { chart.updateOHLCIndicators(); } catch (_) {}
        }
    }

    /**
     * Update chart data based on current replay position
     * @param {boolean} autoScroll - Whether to auto-scroll to latest candles (default: true)
     */
    updateChartData(autoScroll = true) {
        if (!this.fullRawData || this.fullRawData.length === 0) {
            console.error('❌ No fullRawData available');
            return;
        }
        
        // Ensure currentIndex is valid (never before backtest session floor — all paths must honor this)
        const floorIdx = this.sessionStartIndex || 0;
        if (this.currentIndex < floorIdx) this.currentIndex = floorIdx;
        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.fullRawData.length) this.currentIndex = this.fullRawData.length - 1;

        this._clampCurrentIndexToReplayTimestamp();

        // Keep virtual replay time aligned with the current bar. Without this, multi-panel charts
        // that load a different pair (_panelFullRawData) still use a stale replayTimestamp in
        // syncPanelCharts() until the next play/tick advances it — so "go back" looked correct on
        // the main chart but other pairs kept future candles until play.
        const midTickAnimation = !!(this.animatingCandle && (this.tickProgress || 0) > 0);
        if (!midTickAnimation) {
            const curBar = this.fullRawData[this.currentIndex];
            if (curBar && Number.isFinite(curBar.t)) {
                const barT = curBar.t;
                const next = this.fullRawData[this.currentIndex + 1];
                const barEnd = next && Number.isFinite(next.t) ? next.t : null;
                const existing = Number.isFinite(this.replayTimestamp) ? this.replayTimestamp : null;
                if (existing != null && existing >= barT && (barEnd == null || existing < barEnd)) {
                    // Keep intraday playhead when native TF is coarser (e.g. 1m moment on 1D bar).
                } else {
                    this.replayTimestamp = barT;
                }
            }
        }

        this.updateSliderRange();
        
        // Slice rawData to current position (minimum 1 candle)
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        this.chart.rawData = this.fullRawData.slice(0, sliceEnd);
        
        if (this.chart.rawData.length === 0) {
            console.error('❌ Sliced data is empty! Restoring full data...');
            this.chart.rawData = [...this.fullRawData];
            return;
        }
        
        // Resample for current timeframe
        try {
            this.chart.data = this.chart.resampleData(this.chart.rawData, this.chart.currentTimeframe);
            if (typeof this.chart._trimLastDataBarToReplayPlayhead === 'function') {
                this.chart._trimLastDataBarToReplayPlayhead();
            }
            if (typeof this.chart.bumpDataVersion === 'function') {
                this.chart.bumpDataVersion();
            }
            this._syncCompareOverlaysForReplay();
        } catch (error) {
            console.error('❌ Error resampling data:', error);
            return;
        }
        
        // Recalculate indicators on every replay step (async worker while playing).
        try {
            this._scheduleReplayIndicatorRecalc();
        } catch (error) {
            console.warn('⚠️ Error recalculating indicators:', error);
        }
        if (this.chart.drawingManager && typeof this.chart.drawingManager.redrawAll === 'function') {
            const panning = typeof this.chart._isChartViewPanning === 'function' && this.chart._isChartViewPanning();
            if (!panning && !this.isPlaying) {
                this.chart.drawingManager.redrawAll();
            }
        }
        
        // Auto-scroll to show the latest candles (only if enabled and user hasn't manually panned)
        if (autoScroll && this.autoScrollEnabled && !this._viewportLockForPlayback
            && !this._timeframeChanging) {
            if (!this.isPlaying && this.chart._tfSwitchAnchorLock
                && typeof this.chart._reapplyTfSwitchAnchorLock === 'function') {
                this.chart._reapplyTfSwitchAnchorLock();
            } else {
                this.syncReplayViewportToPlayhead(this.chart, {
                    resetPriceScale: false,
                    render: false,
                    forceRecenter: this.isPlaying && !this.userHasPanned,
                });
            }
        }
        
        // Update UI elements
        this.updateTimeDisplay();
        this.updateSlider();
        
        // Ensure chart is ready to render
        this.chart.isLoading = false;
        
        // Apply constraints
        if (typeof this.chart.constrainOffset === 'function'
            && !this.chart._tfSwitchAnchorLock) {
            this.chart.constrainOffset();
        }
        this._applyPlaybackViewportLock(this.chart);
        this._renderReplayChartUpdate();

        if (typeof this.chart._syncReplayPlayheadCrosshairValues === 'function') {
            this.chart._syncReplayPlayheadCrosshairValues();
        }
        
        // Update order manager positions after each candle
        if (this.chart.orderManager && typeof this.chart.orderManager.updatePositions === 'function') {
            this.chart.orderManager.updatePositions();
        }
        
        // Sync all panel charts with the current replay position (main already aligned above)
        this.syncPanelCharts(true);
        
        // Update follow button visibility based on whether last candle is visible
        this.updateAutoScrollIndicator();

        this._persistReplayStateThrottled();

        if (this.isPlaying) {
            this._multichartBroadcastReplayFrame();
        }

        const om = this.chart && this.chart.orderManager;
        if (om && Array.isArray(om.tradeJournal) && om.tradeJournal.length > 0) {
            const len = this.chart.data?.length || 0;
            if (len > (om._lastJournalMarkerDataLen || 0)) {
                om._lastJournalMarkerDataLen = len;
            }
            if (Number.isFinite(Number(this.replayTimestamp))) {
                om._lastMarkerRedrawPlayhead = Number(this.replayTimestamp);
            }
            om._journalMarkerRestorePending = true;
            clearTimeout(om._replayMarkerSyncDebounce);
            om._replayMarkerSyncDebounce = setTimeout(() => {
                try {
                    if (typeof om._redrawJournalMarkersForReplayPlayhead === 'function') {
                        om._redrawJournalMarkersForReplayPlayhead();
                    }
                    if (om._journalMarkerRestorePending
                        && typeof om._syncJournalMarkersAfterSessionRestore === 'function') {
                        om._syncJournalMarkersAfterSessionRestore();
                    }
                } catch (_) {}
            }, 40);
        } else if (om && om._journalMarkerRestorePending
            && typeof om._syncJournalMarkersAfterSessionRestore === 'function') {
            clearTimeout(om._replayMarkerSyncDebounce);
            om._replayMarkerSyncDebounce = setTimeout(() => {
                try { om._syncJournalMarkersAfterSessionRestore(); } catch (_) {}
            }, 40);
        }

    }

    /**
     * Toggle play/pause - debounced to prevent rapid toggling issues
     */
    togglePlay() {
        // Prevent rapid toggling (debounce 50ms - shorter for better responsiveness)
        const now = Date.now();
        if (this._lastToggleTime && (now - this._lastToggleTime) < 50) {
            return;
        }
        this._lastToggleTime = now;
        
        // Read current state and toggle
        const wasPlaying = this.isPlaying;
        
        if (wasPlaying) {
            this.pause();
        } else {
            this.play();
        }

        this._showPlayPauseFeedback(wasPlaying);
        
        // Force sync UI to actual state after toggle (immediate)
        this.syncPlayPauseUI();
        
        // Also sync after a brief delay to catch any race conditions
        setTimeout(() => this.syncPlayPauseUI(), 20);
    }

    /**
     * Bottom toast: "Play" while replay runs, "Paused" when stopped.
     * play() sets isPlaying inside rAF — use wasPlaying + short delay so Space / toolbar stay accurate.
     */
    _showPlayPauseFeedback(wasPlaying) {
        const show = (playing) => {
            const message = playing ? '▶ Play' : '⏸ Paused';
            const stack = typeof window !== 'undefined' ? window.__TalariaToastStack : null;
            if (this._playPauseToastDismiss) {
                try { this._playPauseToastDismiss(); } catch (_) { /* ignore */ }
                this._playPauseToastDismiss = null;
            }
            if (stack && typeof stack.show === 'function') {
                this._playPauseToastDismiss = stack.show(message, { type: 'info', duration: 1500 });
                return;
            }
            const ch = this.chart;
            if (ch && typeof ch.showNotification === 'function') {
                ch.showNotification(message, 1500);
            }
        };

        if (wasPlaying) {
            show(false);
            return;
        }
        setTimeout(() => {
            show(!!(this.isPlaying || this.isPlayStarting));
        }, 50);
    }
    
    /**
     * Force sync play/pause button UI to actual isPlaying state
     */
    syncPlayPauseUI() {
        this.syncPlayPauseButtonVisuals();
    }

    /**
     * Small chart toast when backtest replay reaches the end of loaded data, or user hits Play at the end.
     * Throttled so tick + candle + fast-mode paths do not spam the same frame burst.
     */
    _maybeNotifyReplayToast(message) {
        const ch = this.chart;
        if (!ch || !message) return;
        const now = Date.now();
        if (now - (this._replayToastAt || 0) < 900) return;
        this._replayToastAt = now;
        const g = typeof globalThis !== 'undefined' ? globalThis
            : (typeof window !== 'undefined' ? window : null);
        const msgStr = String(message);
        try {
            const inMcIframe = !!(g && g.parent && g.parent !== g
                && (g.__multichartBridge
                    || /(?:^|[?&])multichart=1(?:&|$)/.test(String(g.location && g.location.search || ''))));
            if (inMcIframe && typeof g.parent.postMessage === 'function') {
                g.parent.postMessage({
                    type:    'multichart-global-toast',
                    message: msgStr,
                    source:  (ch && ch.multichartPanelId) || undefined,
                }, '*');
                return;
            }
            if (g && typeof g.__multichartDedupedReplayToast === 'function') {
                g.__multichartDedupedReplayToast(msgStr);
                return;
            }
            if (typeof ch.showNotification === 'function') {
                ch.showNotification(msgStr);
            }
        } catch (_) {}
    }

    _isAtLastLoadedBar() {
        return !!(this.fullRawData && this.fullRawData.length > 0
            && this.currentIndex >= this.fullRawData.length - 1);
    }

    _getBacktestSessionEndMs() {
        try {
            const sess = this.chart && this.chart.backtestingSession;
            if (sess && this.chart && typeof this.chart._getBacktestSessionEndMs === 'function') {
                return this.chart._getBacktestSessionEndMs(sess);
            }
            const r = sess && (sess.endDate || sess.end_date);
            if (r && this.chart && typeof this.chart._sessionEndToInclusiveUtcMs === 'function') {
                const t = this.chart._sessionEndToInclusiveUtcMs(r);
                return Number.isFinite(t) ? Math.floor(t) : null;
            }
            if (r) {
                const t = new Date(r).getTime();
                return Number.isFinite(t) ? t : null;
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    _getPlayheadBarEndMs() {
        const bar = this.fullRawData && this.fullRawData[this.currentIndex];
        const barTs = bar && Number.isFinite(bar.t) ? Number(bar.t) : Number(this.replayTimestamp);
        if (!Number.isFinite(barTs)) return null;

        let periodMs = 60000;
        if (this.fullRawData && this.fullRawData.length >= 2) {
            const step = Number(this.fullRawData[1].t) - Number(this.fullRawData[0].t);
            if (Number.isFinite(step) && step > 0) periodMs = step;
        } else if (this.chart && typeof this.chart.parseTimeframe === 'function') {
            const parsed = this.chart.parseTimeframe(this.rawTimeframe || this.chart.currentTimeframe || '1m');
            if (Number.isFinite(parsed) && parsed > 0) periodMs = parsed;
        }

        let barEndTs = barTs + periodMs;
        if (Array.isArray(this.fullRawData) && typeof this.currentIndex === 'number'
            && this.currentIndex + 1 < this.fullRawData.length) {
            const nextT = Number(this.fullRawData[this.currentIndex + 1].t);
            if (Number.isFinite(nextT) && nextT > barTs) barEndTs = nextT;
        }
        const ts = Number.isFinite(this.replayTimestamp) ? this.replayTimestamp : null;
        return Math.max(barEndTs, ts || 0);
    }

    _playheadReachedSessionEnd(sessionEndMs) {
        if (sessionEndMs == null || !Number.isFinite(Number(sessionEndMs))) return false;
        const playheadEnd = this._getPlayheadBarEndMs();
        return Number.isFinite(playheadEnd) && playheadEnd >= Number(sessionEndMs);
    }

    /**
     * True when replay is at the backtest session end — NOT merely at the last bar
     * of the currently fetched window (e.g. mid-session on 15m at Aug 2018).
     */
    _isAtBacktestSessionEnd(sessionEndMs) {
        if (!this.isActive) return false;
        if (sessionEndMs == null || !Number.isFinite(Number(sessionEndMs))) return false;
        if (!this._playheadReachedSessionEnd(sessionEndMs)) return false;
        if (!this._isAtLastLoadedBar()) return false;
        if (this.chart && this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
            return false;
        }
        return true;
    }

    /**
     * At the forward edge of loaded data: keep playback alive while more session bars
     * can still be fetched. Returns true when waiting (do not pause).
     */
    _handleForwardEdgeWhilePlaying(retryFn) {
        if (this.tryRequestForwardDataProbe()) {
            this._replayForwardEdgeWait = true;
            if (this.isPlaying && !this._nextCandleTimer && typeof retryFn === 'function') {
                this.scheduleForwardEdgeRetry(retryFn);
            }
            return true;
        }
        const sessionEndMs = this._getBacktestSessionEndMs();
        if (sessionEndMs != null && !this._playheadReachedSessionEnd(sessionEndMs)) {
            this._replayForwardEdgeWait = true;
            if (this.isPlaying && !this._nextCandleTimer && typeof retryFn === 'function') {
                this.scheduleForwardEdgeRetry(retryFn);
            }
            return true;
        }
        this._replayForwardEdgeWait = false;
        return false;
    }

    _finishPlaybackAtSessionEnd() {
        this.pause();
        this._notifyReplayReachedEndOfData();
    }

    /** True when Play should no-op with "already at end" (still allow forward data probes + mid-tick resume on last bar). */
    _playWouldBeNoOpAtSessionEnd() {
        if (!this.isActive || !this._isAtLastLoadedBar()) return false;
        const sessionEndMs = this._getBacktestSessionEndMs();
        if (sessionEndMs != null && !this._playheadReachedSessionEnd(sessionEndMs)) {
            return false;
        }
        const mode = this.getPlaybackMode();
        if (mode === 'tick') {
            const tpc = this.currentTicksPerCandle || this.ticksPerCandle || 72;
            if (this.animatingCandle && Number.isFinite(this.tickProgress) && this.tickProgress < tpc) {
                return false;
            }
            if (this._savedTickState && Number.isFinite(this._savedTickState.tickProgress)
                && this._savedTickState.tickProgress < tpc) {
                return false;
            }
        }
        if (this.tryRequestForwardDataProbe()) return false;
        return true;
    }

    /**
     * Call when playback auto-stops because there is no more data to advance into.
     */
    _notifyReplayReachedEndOfData() {
        const sessionEndMs = this._getBacktestSessionEndMs();
        if (sessionEndMs != null && !this._isAtBacktestSessionEnd(sessionEndMs)) {
            return;
        }
        this._maybeNotifyReplayToast('Backtest replay complete — you reached the end of this session.');
    }

    /**
     * Start playback using selected replay mode.
     */
    play() {
        if (!this.isActive) {
            this.syncPlayPauseUI();
            return;
        }

        const playbackMode = this.getPlaybackMode();
        const useTickAnimation = playbackMode === 'tick' && !this._hasExplicitReplayStepInterval();
        
        // Restore partial tick state saved during pause so animation continues
        // from where it was instead of restarting the candle.
        if (useTickAnimation && this._savedTickState) {
            this.animatingCandle = this._savedTickState.animatingCandle;
            this.tickProgress = this._savedTickState.tickProgress;
            this.tickElapsedMs = this._savedTickState.tickElapsedMs;
            this._savedTickState = null;
        }

        if (this._playWouldBeNoOpAtSessionEnd()) {
            this._maybeNotifyReplayToast('Already at the end of this backtest — step back or move the replay head to continue.');
            this.syncPlayPauseUI();
            return;
        }

        // TF-switch anchor lock is pause-only — release follow mode on Play.
        if (!this.userHasPanned) {
            if (typeof this.chart._clearTfSwitchAnchorLock === 'function') {
                this.chart._clearTfSwitchAnchorLock();
            }
            this.autoScrollEnabled = true;
            this.userHasPanned = false;
            this._viewportLockForPlayback = null;
            if (typeof this.syncReplayViewportToPlayhead === 'function') {
                this.syncReplayViewportToPlayhead(this.chart, {
                    resetPriceScale: false,
                    render: false,
                    forceRecenter: true,
                });
            }
        }

        this._capturePlaybackViewportLock();

        // Multichart: after per-panel TF changes the host may sit on the last loaded 1m bar
        // while the session still has data — prefetch forward before starting the play loop.
        if (typeof window !== 'undefined' && window.__multichartGrid
            && this.chart && typeof this.chart.checkViewportLoadMore === 'function'
            && this._isAtLastLoadedBar()) {
            const sessionEndMs = this._getBacktestSessionEndMs();
            if (sessionEndMs == null || !this._playheadReachedSessionEnd(sessionEndMs)) {
                try { this.chart.checkViewportLoadMore('forward', true); } catch (_pf) { /* ignore */ }
            }
        }

        // Tick mode can resume partial animation state. Candle mode always resumes on full candles.
        const isResumingTick = useTickAnimation && this.animatingCandle && this.tickProgress > 0;
        const preserveTick = !!isResumingTick;

        // Defer heavy start so the browser can paint a loading spinner on the play control first
        // (daily / large resamples can block the main thread for a noticeable moment).
        this._cancelDeferredPlayStart();
        this.isPlayStarting = true;
        this.syncPlayPauseButtonVisuals();

        this._playStartRaf1 = requestAnimationFrame(() => {
            this._playStartRaf1 = null;
            this._playStartRaf2 = requestAnimationFrame(() => {
                this._playStartRaf2 = null;
                try {
                    this._preserveTickProgress = preserveTick;
                    this.stopAllPlayback();

                    if (this.chart?.orderManager?._refreshAllGuardsToCurrentCandle) {
                        this.chart.orderManager._refreshAllGuardsToCurrentCandle();
                    }

                    this.isPlaying = true;

                    this.showTickProgress(false);

                    if (useTickAnimation) {
                        this.startTickAnimation();
                    } else {
                        this.animatingCandle = null;
                        this.tickProgress = 0;
                        this.tickElapsedMs = 0;
                        this.startCandleByCandle(true);
                    }

                    requestAnimationFrame(() => {
                        try {
                            this.updateAutoScrollIndicator();
                        } catch (_) {}
                    });
                } finally {
                    this.isPlayStarting = false;
                    this.syncPlayPauseButtonVisuals();
                }
            });
        });
    }
    
    /**
     * Stop all playback intervals and animations
     */
    stopAllPlayback() {
        this._activeTickLoop = (this._activeTickLoop || 0) + 1;
        this._activeCandleLoop = (this._activeCandleLoop || 0) + 1;
        if (this._nextCandleTimer) {
            clearTimeout(this._nextCandleTimer);
            this._nextCandleTimer = null;
        }
        this.stopTickAnimation();
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }
    
    /**
     * Start candle-by-candle playback (no tick animation)
     */
    startCandleByCandle(startImmediately = true) {
        if (!this.isActive || !this.isPlaying) {
            this.syncPlayPauseUI();
            return;
        }

        // Only one candle interval — prefetch / edge resume must not stack timers.
        this._activeCandleLoop = (this._activeCandleLoop || 0) + 1;
        const loopId = this._activeCandleLoop;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        if (this._nextCandleTimer) {
            clearTimeout(this._nextCandleTimer);
            this._nextCandleTimer = null;
        }

        const interval = this.getCandleStepIntervalMs();
        
        // Optionally advance immediately (used on first play).
        if (startImmediately) {
            this.simpleStepForward();
        }
        
        this.playInterval = setInterval(() => {
            if (loopId !== this._activeCandleLoop) {
                clearInterval(this.playInterval);
                this.playInterval = null;
                return;
            }
            // Double-check state on each tick
            if (!this.isPlaying || !this.isActive) {
                clearInterval(this.playInterval);
                this.playInterval = null;
                this.syncPlayPauseUI();
                return;
            }

            // While waiting on a forward-edge retry timer, skip interval ticks
            // so we don't continuously re-enter simpleStepForward in a tight loop.
            if (this._nextCandleTimer) {
                return;
            }

            if (this.currentIndex >= this.fullRawData.length - 1) {
                const waiting = this._handleForwardEdgeWhilePlaying(() => {
                    if (this.isPlaying) this.simpleStepForward();
                });
                if (waiting) return;
            }

            this.simpleStepForward();
        }, interval);
    }
    
    /**
     * Resolve the replay step timeframe (V9 interval / legacy select / chart TF).
     * @returns {string|null}
     */
    _resolveReplayStepTimeframe() {
        let selectedTimeframe = this.stepTimeframeOverride || null;
        if (selectedTimeframe) {
            selectedTimeframe = String(selectedTimeframe).trim();
        }
        const hiddenSelect = this.timeframeSelect || document.getElementById('replayTimeframe');
        if (!selectedTimeframe && hiddenSelect && hiddenSelect.value) {
            selectedTimeframe = hiddenSelect.value;
        }
        if (!selectedTimeframe) {
            const selectedOption = document.querySelector('#timeframeMenu .timeframe-option.selected');
            if (selectedOption) {
                selectedTimeframe = selectedOption.getAttribute('data-value');
            }
        }
        if (selectedTimeframe === 'sync' || !selectedTimeframe) {
            selectedTimeframe = this.chart?.currentTimeframe || null;
        }
        return selectedTimeframe || null;
    }

    /** Milliseconds of market time represented by one candle-by-candle step. */
    _resolveReplayStepTimeframeMs() {
        const tf = this._resolveReplayStepTimeframe();
        if (tf) {
            const ms = this.timeframeToMs(tf);
            if (Number.isFinite(ms) && ms > 0) return ms;
        }
        if (Array.isArray(this.fullRawData) && this.fullRawData.length > 1) {
            const dt = Math.abs(Number(this.fullRawData[1].t) - Number(this.fullRawData[0].t));
            if (Number.isFinite(dt) && dt > 0) return dt;
        }
        return 60000;
    }

    /**
     * Wall-clock delay between candle-by-candle steps.
     * Uses speed as steps-per-second (1000/speed) — snappy jumps with no tick animation.
     * Stale-interval guards (_activeCandleLoop, prefetch resume) prevent chart interaction
     * from stacking timers and running faster than this rate.
     */
    getCandleStepIntervalMs() {
        const speed = Math.max(1, Number(this.speed) || 1);
        return Math.max(20, Math.floor(1000 / speed));
    }
    
    /**
     * Simple step forward - advances based on selected timeframe (respects sync dropdown)
     */
    /** Advance playhead one INTERVAL step when step TF is finer than native master (1m on 1H). */
    _advanceSubBarStepForward() {
        const stepMs = this._resolveReplayStepTimeframeMs();
        let ts = Number.isFinite(this.replayTimestamp)
            ? this.replayTimestamp
            : Number(this.fullRawData[this.currentIndex]?.t);
        if (!Number.isFinite(ts) || !Number.isFinite(stepMs) || stepMs <= 0) return false;

        const nextTs = ts + stepMs;
        const lastBar = this.fullRawData[this.fullRawData.length - 1];
        const rawMs = this._getRawBarPeriodMs();
        const lastEnd = lastBar && Number.isFinite(lastBar.t) ? lastBar.t + rawMs : Infinity;
        if (nextTs >= lastEnd && this.currentIndex >= this.fullRawData.length - 1) {
            return false;
        }

        this.replayTimestamp = nextTs;
        if (typeof this.syncCurrentIndexFromReplayTimestamp === 'function') {
            this.syncCurrentIndexFromReplayTimestamp(nextTs);
        }
        this._clampCurrentIndexToReplayTimestamp();
        this.tickElapsedMs = 0;
        return true;
    }

    /** Step backward one INTERVAL when step TF is finer than native master. */
    _advanceSubBarStepBackward() {
        const stepMs = this._resolveReplayStepTimeframeMs();
        let ts = Number.isFinite(this.replayTimestamp)
            ? this.replayTimestamp
            : Number(this.fullRawData[this.currentIndex]?.t);
        if (!Number.isFinite(ts) || !Number.isFinite(stepMs) || stepMs <= 0) return false;

        const minIdx = this.sessionStartIndex || 0;
        const floorTs = Number(this.fullRawData[minIdx]?.t);
        const nextTs = ts - stepMs;
        if (Number.isFinite(floorTs) && nextTs < floorTs) {
            this.replayTimestamp = floorTs;
            this.currentIndex = minIdx;
            this.tickElapsedMs = 0;
            return true;
        }

        this.replayTimestamp = nextTs;
        if (typeof this.syncCurrentIndexFromReplayTimestamp === 'function') {
            this.syncCurrentIndexFromReplayTimestamp(nextTs);
        }
        this._clampCurrentIndexToReplayTimestamp();
        this.tickElapsedMs = 0;
        return true;
    }

    simpleStepForward() {
        if (this._timeframeChanging) return;
        if (this._isSubBarStepMode()) {
            if (this.currentIndex >= this.fullRawData.length - 1) {
                const ts = Number.isFinite(this.replayTimestamp) ? this.replayTimestamp : NaN;
                const rawMs = this._getRawBarPeriodMs();
                const lastBar = this.fullRawData[this.fullRawData.length - 1];
                const atEnd = lastBar && Number.isFinite(ts)
                    && ts >= lastBar.t + rawMs * 0.99;
                if (atEnd) {
                    if (this._handleForwardEdgeWhilePlaying(() => {
                        if (this.isPlaying) this.simpleStepForward();
                    })) return;
                    this._finishPlaybackAtSessionEnd();
                    return;
                }
            }
            const prevIdx = this.currentIndex;
            if (!this._advanceSubBarStepForward()) {
                if (this._handleForwardEdgeWhilePlaying(() => {
                    if (this.isPlaying) this.simpleStepForward();
                })) return;
                this._finishPlaybackAtSessionEnd();
                return;
            }
            this.edgeProbeRetryCount = 0;
            this._replayForwardEdgeWait = false;
            this.updateChartData(this.autoScrollEnabled && prevIdx !== this.currentIndex);
            return;
        }
        if (this.currentIndex >= this.fullRawData.length - 1) {
            if (this._handleForwardEdgeWhilePlaying(() => {
                if (this.isPlaying) this.simpleStepForward();
            })) {
                return;
            }
            this._finishPlaybackAtSessionEnd();
            return;
        }
        
        // Proactively request more data using speed-aware threshold
        const remainingCandles = this.fullRawData.length - this.currentIndex;
        const preloadThreshold = this.getForwardPrefetchThreshold();
        if (remainingCandles < preloadThreshold &&
            this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
            this.chart.checkViewportLoadMore('forward');
        }
        
        // Get the target index respecting timeframe selection
        const oldIndex = this.currentIndex;
        const targetIndex = this.calculateNextIndex();
        this.currentIndex = targetIndex;
        this.edgeProbeRetryCount = 0;
        this._replayForwardEdgeWait = false;
        
        // === UPDATE VIRTUAL TIME: Sync replayTimestamp with new position ===
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        
        this.updateChartData(this.autoScrollEnabled);
    }
    
    /** Milliseconds between consecutive rows in fullRawData (replay master). */
    _getRawBarPeriodMs() {
        if (Array.isArray(this.fullRawData) && this.fullRawData.length >= 2) {
            const dt = Math.abs(Number(this.fullRawData[1].t) - Number(this.fullRawData[0].t));
            if (Number.isFinite(dt) && dt > 0) return dt;
        }
        const tf = this.rawTimeframe || (this.chart && this.chart.currentTimeframe) || '1m';
        return this.timeframeToMs(tf) || 60000;
    }

    /** Raw bar count for one replay INTERVAL step (legacy _replayIntervalRawCandles). */
    _resolveReplayStepRawBars() {
        const selectedTimeframe = this._resolveReplayStepTimeframe();
        if (!selectedTimeframe) return 1;
        const tfMs = this.timeframeToMs(selectedTimeframe);
        const rawMs = this._getRawBarPeriodMs();
        if (!tfMs || !rawMs) return 1;
        return Math.max(1, Math.round(tfMs / rawMs));
    }

    /**
     * Calculate the next index based on selected timeframe (used by both play and step)
     */
    calculateNextIndex() {
        if (this.currentIndex >= this.fullRawData.length - 1) {
            return this.fullRawData.length - 1;
        }

        const stepBars = this._resolveReplayStepRawBars();
        if (stepBars <= 1) {
            return Math.min(this.currentIndex + 1, this.fullRawData.length - 1);
        }

        // Time-anchored advance when the step spans multiple raw bars — keeps bucket
        // alignment with resampleData (e.g. 1h step on 1m master lands on the hour).
        const selectedTimeframe = this._resolveReplayStepTimeframe();
        const tfMs = selectedTimeframe ? this.timeframeToMs(selectedTimeframe) : null;
        if (tfMs && tfMs > this._getRawBarPeriodMs()) {
            const currentTimestamp = this.fullRawData[this.currentIndex].t;
            const currentBucket = this._replayBucketStart(currentTimestamp, tfMs);
            const targetTimestamp = currentBucket + tfMs;
            const targetIndex = this._firstRawIndexAtOrAfter(targetTimestamp, this.currentIndex + 1);
            return Math.min(Math.max(targetIndex, this.currentIndex + 1), this.fullRawData.length - 1);
        }

        return Math.min(this.currentIndex + stepBars, this.fullRawData.length - 1);
    }

    /** Bucket start for replay step/resample (matches chart resampleData). */
    _replayBucketStart(ts, tfMs) {
        const t = Number(ts);
        const ms = Number(tfMs);
        if (!Number.isFinite(t) || !Number.isFinite(ms) || ms <= 0) return t;
        return Math.floor(t / ms) * ms;
    }

    /**
     * First index in fullRawData whose timestamp is >= ts, searching from
     * `fromIndex`. Binary search (fullRawData is time-sorted ascending).
     * Returns fullRawData.length if no bar reaches ts.
     */
    _firstRawIndexAtOrAfter(ts, fromIndex = 0) {
        const arr = this.fullRawData;
        if (!Array.isArray(arr) || !arr.length) return 0;
        let lo = Math.max(0, fromIndex | 0);
        let hi = arr.length; // exclusive
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (Number(arr[mid].t) < ts) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /**
     * Last index in fullRawData whose timestamp is <= ts (or 0). Binary search.
     */
    _lastRawIndexAtOrBeforeTs(ts) {
        const arr = this.fullRawData;
        if (!Array.isArray(arr) || !arr.length) return 0;
        let lo = 0;
        let hi = arr.length - 1;
        let ans = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (Number(arr[mid].t) <= ts) { ans = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        return ans;
    }

    /**
     * Calculate the previous index based on selected step timeframe (mirror of calculateNextIndex).
     */
    calculatePreviousIndex() {
        const minIdx = this.sessionStartIndex || 0;
        if (this.currentIndex <= minIdx) {
            return minIdx;
        }

        const stepBars = this._resolveReplayStepRawBars();
        if (stepBars <= 1) {
            return Math.max(minIdx, this.currentIndex - 1);
        }

        const selectedTimeframe = this._resolveReplayStepTimeframe();
        const tfMs = selectedTimeframe ? this.timeframeToMs(selectedTimeframe) : null;
        if (tfMs && tfMs > this._getRawBarPeriodMs()) {
            const currentTimestamp = this.fullRawData[this.currentIndex].t;
            const currentBucket = this._replayBucketStart(currentTimestamp, tfMs);
            const targetIndex = this._lastRawIndexAtOrBeforeTs(currentBucket - 1);
            return Math.max(minIdx, Math.min(targetIndex, this.currentIndex - 1));
        }

        return Math.max(minIdx, this.currentIndex - stepBars);
    }

    /**
     * Dynamic prefetch threshold (in raw candles) for forward replay.
     * Keeps enough buffered candles based on current replay speed so
     * pan-loading can finish before playback reaches the edge.
     */
    getForwardPrefetchThreshold() {
        const floor = Math.max(0, this.sessionStartIndex || 0);
        const bufferLen = Array.isArray(this.fullRawData)
            ? Math.max(0, this.fullRawData.length - floor)
            : 2000;
        // Prefetch when 80% of the loaded buffer is consumed (~20% remaining).
        const remainingTrigger = Math.ceil(bufferLen * 0.2);
        return Math.max(150, Math.min(2000, remainingTrigger));
    }

    getForwardEdgeRetryDelayMs() {
        const configured = Math.max(16, Number(this.dataLoadRetryDelayMs) || 120);
        const observedLoadMs = Math.max(300, Number(this.forwardLoadLatencyMs) || 1500);

        // Poll several times within the observed load window, but keep bounded.
        const adaptive = Math.round(observedLoadMs / 6);
        return Math.max(60, Math.min(450, Math.max(configured, adaptive)));
    }

    getAdaptiveEdgeProbeLimit() {
        const retryDelayMs = this.getForwardEdgeRetryDelayMs();
        const observedLoadMs = Math.max(300, Number(this.forwardLoadLatencyMs) || 1500);
        const minRetries = Math.max(1, Number(this.minEdgeProbeRetries) || 12);
        const maxRetries = Math.max(minRetries, Number(this.maxEdgeProbeRetries) || 90);

        // Wait up to ~3x observed load latency before treating edge as definitive.
        const adaptiveRetries = Math.ceil((observedLoadMs * 3) / Math.max(1, retryDelayMs));
        return Math.max(minRetries, Math.min(maxRetries, adaptiveRetries));
    }

    tryRequestForwardDataProbe() {
        const canLoadForward = !!(this.chart
            && typeof this.chart.checkViewportLoadMore === 'function'
            && this.chart.currentFileId);
        if (!canLoadForward) {
            return false;
        }

        // If a pan-load is already in flight, keep waiting without consuming retries.
        if (this.chart._panLoading) {
            return true;
        }

        const hasMoreRight = !!(this.chart._serverCursors && this.chart._serverCursors.hasMoreRight);
        if (hasMoreRight) {
            this.edgeProbeRetryCount = 0;
            return !!this.chart.checkViewportLoadMore('forward');
        }

        const retryLimit = this.getAdaptiveEdgeProbeLimit();
        if (this.edgeProbeRetryCount >= retryLimit) {
            return false;
        }

        // Force a probe when local hasMoreRight may be stale.
        const requested = !!this.chart.checkViewportLoadMore('forward', true);
        if (!requested && !this.chart._panLoading) {
            return false;
        }

        this.edgeProbeRetryCount += 1;
        if (this.edgeProbeRetryCount === 1 || this.edgeProbeRetryCount % 5 === 0 || this.edgeProbeRetryCount >= retryLimit) {
        }
        return true;
    }

    scheduleForwardEdgeRetry(retryFn) {
        if (this._nextCandleTimer) {
            clearTimeout(this._nextCandleTimer);
            this._nextCandleTimer = null;
        }

        const dataLoadRetryDelay = this.getForwardEdgeRetryDelayMs();
        this._nextCandleTimer = setTimeout(() => {
            this._nextCandleTimer = null;
            if (this.isPlaying && typeof retryFn === 'function') {
                retryFn();
            }
        }, dataLoadRetryDelay);
    }
    
    /**
     * Convert timeframe string to milliseconds
     */
    detectRawTimeframeFromData(data) {
        if (!Array.isArray(data) || data.length < 2) {
            return this.chart && this.chart.currentTimeframe ? this.chart.currentTimeframe : '1m';
        }

        const dt = Math.abs((data[1]?.t || 0) - (data[0]?.t || 0));
        if (!Number.isFinite(dt) || dt <= 0) {
            return this.chart && this.chart.currentTimeframe ? this.chart.currentTimeframe : '1m';
        }

        const known = [
            ['1m', 60 * 1000],
            ['5m', 5 * 60 * 1000],
            ['15m', 15 * 60 * 1000],
            ['30m', 30 * 60 * 1000],
            ['1h', 60 * 60 * 1000],
            ['4h', 4 * 60 * 60 * 1000],
            ['1d', 24 * 60 * 60 * 1000],
            ['1w', 7 * 24 * 60 * 60 * 1000],
            ['1mo', 30 * 24 * 60 * 60 * 1000]
        ];

        let bestTf = known[0][0];
        let bestDiff = Infinity;
        for (const [tf, ms] of known) {
            const diff = Math.abs(dt - ms);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestTf = tf;
            }
        }

        return bestTf;
    }

    timeframeToMs(tf) {
        if (!tf) return null;
        const tfLower = String(tf).toLowerCase().trim();

        // Handle short aliases
        if (tfLower === 'd') return 24 * 60 * 60 * 1000;
        if (tfLower === 'w') return 7 * 24 * 60 * 60 * 1000;
        if (tfLower === 'mo') return 30 * 24 * 60 * 60 * 1000;

        // Parse number + unit (supports m/h/d/w/mo)
        const match = tfLower.match(/^(\d+)\s*(mo|w|d|h|m)$/);
        if (!match) return null;

        const num = parseInt(match[1], 10);
        const unit = match[2];

        switch (unit) {
            case 'm': return num * 60 * 1000;
            case 'h': return num * 60 * 60 * 1000;
            case 'd': return num * 24 * 60 * 60 * 1000;
            case 'w': return num * 7 * 24 * 60 * 60 * 1000;
            case 'mo': return num * 30 * 24 * 60 * 60 * 1000;
            default: return null;
        }
    }
    
    /**
     * Start tick-by-tick animation for the forming candle
     * SMOOTH MODE: Animates ticks within each candle (speed <= 60x)
     * FAST MODE: Completes multiple candles per frame (speed > 60x)
     */
    startTickAnimation() {
        if (!this.isActive || !this.isPlaying) return;

        // Invalidate any prior tick timeout chain before starting a new one.
        this._activeTickLoop = (this._activeTickLoop || 0) + 1;
        const loopId = this._activeTickLoop;
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        if (this._nextCandleTimer) {
            clearTimeout(this._nextCandleTimer);
            this._nextCandleTimer = null;
        }

        if (!Array.isArray(this.fullRawData) || this.fullRawData.length === 0) {
            console.warn('⚠️ Cannot start tick animation - replay data unavailable');
            this.pause();
            return;
        }

        const remainingCandles = this.fullRawData.length - this.currentIndex;
        const preloadThreshold = this.getForwardPrefetchThreshold();
        if (remainingCandles < preloadThreshold &&
            this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
            this.chart.checkViewportLoadMore('forward');
        }
        
        if (this.currentIndex >= this.fullRawData.length - 1) {
            if (this._handleForwardEdgeWhilePlaying(() => this.startTickAnimation())) {
                return;
            }
            this._finishPlaybackAtSessionEnd();
            return;
        }
        this.edgeProbeRetryCount = 0;
        
        // Determine timeframe for speed calculations
        let candleTimeframeMs = 60000; // Default 1 minute
        
        // Priority 1: Use chart's current timeframe setting (most reliable)
        if (this.chart.currentTimeframe) {
            candleTimeframeMs = this.timeframeToMs(this.chart.currentTimeframe) || 60000;
        }
        // Priority 2: Detect from resampled display data (chart.data)
        else if (this.chart.data && this.chart.data.length > 1) {
            candleTimeframeMs = this.chart.data[1].t - this.chart.data[0].t;
        }
        // Priority 3: Fallback to raw data detection
        else if (this.fullRawData.length > 1 && this.currentIndex > 0) {
            candleTimeframeMs = this.fullRawData[this.currentIndex].t - this.fullRawData[this.currentIndex - 1].t;
        } else if (this.fullRawData.length > 1) {
            candleTimeframeMs = this.fullRawData[1].t - this.fullRawData[0].t;
        }
        
        // TIME COMPRESSION SPEED SYSTEM
        // Speed = how many seconds of market time pass per 1 real second
        // IMPORTANT: Always calculate based on RAW DATA timeframe (1m = 60sec)
        // This ensures consistent speed across all display timeframes
        // 60x = 1 raw candle/sec, 3600x = 60 raw candles/sec, 86400x = 1440 raw candles/sec
        
        // Get raw data timeframe (always 1m = 60000ms for this system)
        let rawCandleTimeframeMs = 60000; // Default 1 minute
        if (this.fullRawData && this.fullRawData.length > 1) {
            rawCandleTimeframeMs = this.fullRawData[1].t - this.fullRawData[0].t;
        }
        const rawCandleTimeframeSec = rawCandleTimeframeMs / 1000; // 60 seconds
        
        // Calculate RAW candles per second at this speed
        // rawCandlesPerSecond = speed / rawCandleTimeframeSec
        // At 60x: 60 / 60 = 1 raw candle/sec
        // At 3600x: 3600 / 60 = 60 raw candles/sec
        const rawCandlesPerSecond = this.getEffectivePlaybackSpeed() / rawCandleTimeframeSec;
        
        // Calculate how long each raw candle should take in REAL time
        const realTimeCandleDuration = rawCandleTimeframeMs / this.getEffectivePlaybackSpeed();
        
        // If MORE than 1 raw candle per second (>60x), use FAST MODE
        // At 60x or less, use SMOOTH MODE with tick animation
        if (rawCandlesPerSecond > 1) {
            // FAST MODE: Complete candles rapidly without tick animation
            this.fastMode = true;
            this.currentTicksPerCandle = 1;
            this.animatingCandle = null; // No animation in fast mode
            
            // Calculate timing:
            // - For 1-60 raw candles/sec: 1 candle per frame, variable frame interval
            // - For >60 raw candles/sec: multiple candles per frame at 60fps
            if (rawCandlesPerSecond <= 60) {
                // 1 candle per frame, adjust frame interval
                this.candlesPerFrame = 1;
                // frameInterval = 1000ms / rawCandlesPerSecond
                this.fastModeInterval = Math.max(16, Math.floor(1000 / rawCandlesPerSecond));
            } else {
                // Multiple candles per frame at 60fps (16ms)
                this.candlesPerFrame = Math.max(1, Math.round(rawCandlesPerSecond / 60));
                this.fastModeInterval = 16;
            }
            
            
            this.volumeTickData = {
                baseInterval: this.fastModeInterval,
                volumeMultiplier: 1,
                candleVolume: 0,
                tickVolumes: []
            };
        } else {
            // SMOOTH MODE: Animate ticks within each candle
            this.fastMode = false;
            this.candlesPerFrame = 1;
            
            // Get the next candle we're building towards
            const nextIndex = this.currentIndex + 1;
            const targetCandle = this.fullRawData[nextIndex];
            
            if (!targetCandle) {
                this.stepForward();
                return;
            }
            
            // Preserve existing animating candle state if flag is set
            
            if (!this._preserveTickProgress || !this.animatingCandle) {
                // Pre-fetch the tick path so the very first render already
                // shows a small movement from open (avoids a flat doji flash).
                const prePath = this.getTickPath(targetCandle);
                const seed0 = (prePath && prePath.length > 0) ? prePath[0] : targetCandle.o;
                this.animatingCandle = {
                    target: targetCandle,
                    open: targetCandle.o,
                    high: Math.max(targetCandle.o, seed0),
                    low: Math.min(targetCandle.o, seed0),
                    close: seed0,
                    targetHigh: targetCandle.h,
                    targetLow: targetCandle.l,
                    targetClose: targetCandle.c,
                    volume: 0,
                    targetVolume: targetCandle.v || 0,
                    t: targetCandle.t,
                    cachedPath: prePath
                };
                this.tickProgress = 0;
                this.tickElapsedMs = 0;
            } else {
                // Keep existing animatingCandle and tickProgress
            }
            
            this._preserveTickProgress = false;
            
            this.currentTicksPerCandle = this.ticksPerCandle || 72;
            
            // Base tick interval = candle duration / ticks
            const baseTickInterval = Math.max(16, realTimeCandleDuration / this.currentTicksPerCandle);

            if (this.useConstantTickInterval) {
                // Use fixed cadence to avoid perceived pause/surge behavior,
                // especially visible on larger display timeframes (e.g., 45m).
                this.volumeTickData = {
                    baseInterval: baseTickInterval,
                    volumeMultiplier: 1,
                    candleVolume: targetCandle.v || 0,
                    tickVolumes: null
                };
            } else {
                // Optional legacy mode with volume-weighted cadence.
                const volumeMultiplier = this.calculateVolumeMultiplier(targetCandle, nextIndex);
                this.volumeTickData = {
                    baseInterval: baseTickInterval,
                    volumeMultiplier: volumeMultiplier,
                    candleVolume: targetCandle.v || 0,
                    tickVolumes: this.generateVolumeDistribution(this.currentTicksPerCandle || 72, volumeMultiplier, targetCandle.t)
                };
            }
        }
        
        // Clear any existing tick interval (loop id bump above already dropped stale chains)
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        
        // Start tick/frame animation
        this.scheduleNextTick(loopId);
    }
    
    /**
     * Calculate volume multiplier for tick speed
     * High volume = faster ticks (lower multiplier), Low volume = slower ticks (higher multiplier)
     */
    calculateVolumeMultiplier(targetCandle, candleIndex) {
        if (!targetCandle.v || targetCandle.v === 0) {
            return 1.0; // No volume data, use normal speed
        }
        
        // Calculate average volume from recent candles (last 20)
        const lookback = 20;
        const startIdx = Math.max(0, candleIndex - lookback);
        let totalVolume = 0;
        let count = 0;
        
        for (let i = startIdx; i < candleIndex; i++) {
            if (this.fullRawData[i] && this.fullRawData[i].v) {
                totalVolume += this.fullRawData[i].v;
                count++;
            }
        }
        
        if (count === 0) return 1.0;
        
        const avgVolume = totalVolume / count;
        const volumeRatio = targetCandle.v / avgVolume;
        
        // Convert to speed multiplier:
        // High volume (2x avg) = 0.5x interval (faster ticks)
        // Normal volume (1x avg) = 1x interval
        // Low volume (0.5x avg) = 1.5x interval (slower ticks)
        // Clamp between 0.3 and 2.0 to avoid extreme speeds
        const multiplier = Math.max(0.3, Math.min(2.0, 1 / Math.sqrt(volumeRatio)));
        
        
        return multiplier;
    }
    
    /**
     * Generate random volume distribution for tick intervals within a candle
     * Creates realistic burst patterns (fast-slow-fast like real markets)
     */
    generateVolumeDistribution(numTicks, baseMultiplier, seed) {
        const random = this.createSeededRandom(seed || 54321);
        const distribution = [];
        
        // Random number of "burst" periods (1-4)
        const numBursts = 1 + Math.floor(random() * 4);
        const burstCenters = [];
        
        for (let i = 0; i < numBursts; i++) {
            burstCenters.push(Math.floor(random() * numTicks));
        }
        
        for (let t = 0; t < numTicks; t++) {
            let tickMultiplier = baseMultiplier;
            
            // Check proximity to burst centers
            for (const center of burstCenters) {
                const distance = Math.abs(t - center);
                if (distance < 8) {
                    // Near a burst = faster ticks (lower multiplier)
                    const burstEffect = (8 - distance) / 8 * 0.5;
                    tickMultiplier *= (1 - burstEffect);
                }
            }
            
            // Add deterministic variation (±20%)
            tickMultiplier *= (0.8 + random() * 0.4);
            
            // Clamp
            tickMultiplier = Math.max(0.2, Math.min(2.5, tickMultiplier));
            
            distribution.push(tickMultiplier);
        }
        
        return distribution;
    }
    
    /**
     * Schedule next tick with volume-weighted interval
     */
    scheduleNextTick(loopId = this._activeTickLoop) {
        if (!this.isPlaying) {
            return;
        }
        if (loopId !== this._activeTickLoop) {
            return;
        }
        
        // FAST MODE: Use calculated interval (variable for 1-60 candles/sec, 16ms for >60)
        if (this.fastMode) {
            const interval = this.fastModeInterval || 16;
            this.tickInterval = setTimeout(() => {
                if (loopId !== this._activeTickLoop) return;
                this.animateTick(loopId);
            }, interval);
            return;
        }
        
        // SMOOTH MODE: Need animating candle
        if (!this.animatingCandle) {
            return;
        }
        
        // Get tick-specific interval multiplier
        let intervalMultiplier = 1.0;
        if (this.volumeTickData && this.volumeTickData.tickVolumes) {
            const tickIdx = Math.min(this.tickProgress, this.volumeTickData.tickVolumes.length - 1);
            intervalMultiplier = this.volumeTickData.tickVolumes[tickIdx] || 1.0;
        }
        
        // Calculate this tick's interval
        const baseInterval = this.volumeTickData ? this.volumeTickData.baseInterval : 1000;
        const tickInterval = Math.max(16, baseInterval * intervalMultiplier);
        
        // Schedule next tick
        this.tickInterval = setTimeout(() => {
            if (loopId !== this._activeTickLoop) return;
            this.animateTick(loopId);
            
            // Schedule next tick if still animating
            if (this.isPlaying && this.animatingCandle && 
                this.tickProgress < (this.currentTicksPerCandle || this.ticksPerCandle || 72)) {
                this.scheduleNextTick(loopId);
            }
        }, tickInterval);
    }
    
    /**
     * Animate a single tick using CACHED deterministic tick paths
     * Uses pre-generated tick paths for consistent animation across all timeframes
     * In FAST MODE: completes multiple candles per frame
     */
    animateTick(loopId = this._activeTickLoop) {
        if (!this.isPlaying) {
            this.stopTickAnimation();
            return;
        }
        if (loopId !== this._activeTickLoop) {
            return;
        }
        
        // FAST MODE: Complete candles without tick animation
        if (this.fastMode) {
            this.animateFastMode(loopId);
            return;
        }
        
        // SMOOTH MODE: Animate ticks within a single candle
        if (!this.animatingCandle) {
            this.stopTickAnimation();
            return;
        }
        
        this.tickProgress++;
        const ticksNeeded = this.currentTicksPerCandle || this.ticksPerCandle;
        const progress = this.tickProgress / ticksNeeded;
        
        // === UPDATE VIRTUAL TIME: Track elapsed milliseconds within current candle ===
        const rawCandleIntervalMs = this.fullRawData && this.fullRawData.length > 1 ? 
            (this.fullRawData[1].t - this.fullRawData[0].t) : 60000;
        this.tickElapsedMs = Math.floor(progress * rawCandleIntervalMs);
        
        const target = this.animatingCandle;
        const tc = target.target; // target candle
        const open = tc.o;
        const close = tc.c;
        const high = tc.h;
        const low = tc.l;
        const range = high - low;
        
        if (this.tickProgress < ticksNeeded) {
            // === USE CACHED TICK PATH for deterministic animation ===
            // Get path from cache (uses candle timestamp as key)
            if (!target.cachedPath) {
                target.cachedPath = this.getTickPath(tc);
            }
            
            // Get price from cached path (deterministic across all timeframes)
            const pathIndex = Math.min(this.tickProgress - 1, target.cachedPath.length - 1);
            let currentPrice = target.cachedPath[pathIndex];
            
            // NO random noise - keep it deterministic!
            // The cached path already has realistic movement built in
            currentPrice = Math.max(low, Math.min(high, currentPrice));
            
            // Update candle values
            target.close = currentPrice;
            target.high = Math.max(target.high, currentPrice);
            target.low = Math.min(target.low, currentPrice);
            
            // Volume arrives in bursts, not linearly. A cumulative curve
            // is generated once per candle so the profile is deterministic.
            if (!target._volumeCurve) {
                const vRng = this.createSeededRandom(tc.t + 7919);
                const curve = new Array(ticksNeeded);
                let sum = 0;
                for (let vi = 0; vi < ticksNeeded; vi++) {
                    let tickVol = 0.5 + vRng() * 1.0;
                    if (vRng() < 0.20) tickVol *= 2 + vRng() * 2;
                    sum += tickVol;
                    curve[vi] = sum;
                }
                for (let vi = 0; vi < ticksNeeded; vi++) curve[vi] /= sum;
                target._volumeCurve = curve;
            }
            const volIdx = Math.min(this.tickProgress - 1, ticksNeeded - 1);
            target.volume = target.targetVolume * target._volumeCurve[volIdx];
            
        } else {
            // Final tick: set exact target values
            target.close = close;
            target.high = high;
            target.low = low;
            target.volume = tc.v || 0;
        }
        
        // Update chart with animated candle
        this.updateChartWithAnimatedCandle();
        
        // Check if animation is complete (ticksNeeded already defined above)
        if (this.tickProgress >= (this.currentTicksPerCandle || this.ticksPerCandle || 72)) {
            this.completeTickAnimation();
        }
    }
    
    /**
     * FAST MODE: Complete multiple candles per frame for high-speed playback
     * Used when speed >= 60x (1 or more raw candles per second)
     */
    animateFastMode(loopId = this._activeTickLoop) {
        if (loopId !== this._activeTickLoop) return;
        const candlesToComplete = this.candlesPerFrame || 1;

        // Proactive prefetch in FAST MODE (high-speed replay):
        // previously we only loaded when we hit the end, which caused visible pauses
        // while waiting on network responses.
        const canLoadForward = !!(this.chart && this.chart._serverCursors && this.chart._serverCursors.hasMoreRight);
        if (canLoadForward) {
            const remainingCandles = Math.max(0, this.fullRawData.length - this.currentIndex);
            const preloadThreshold = this.getForwardPrefetchThreshold();
            if (remainingCandles < preloadThreshold) {
                const now = Date.now();
                if (!this._lastFastModePrefetchTs || now - this._lastFastModePrefetchTs >= 90) {
                    this._lastFastModePrefetchTs = now;
                    this.chart.checkViewportLoadMore('forward');
                }
            }
        }
        
        for (let i = 0; i < candlesToComplete; i++) {
            // Check bounds
            if (this.currentIndex >= this.fullRawData.length - 1) {
                if (this._handleForwardEdgeWhilePlaying(() => this.startTickAnimation())) {
                    return;
                }
                this._finishPlaybackAtSessionEnd();
                return;
            }
            
            this._advanceReplayPlayheadOneStep();
        }
        
        // Reset tick state
        this.tickElapsedMs = 0;
        this.tickProgress = 0;
        this.animatingCandle = null;
        
        // Update chart - use lightweight update for FAST MODE
        this.updateChartDataFast();
        
        // Schedule next frame
        if (this.isPlaying) {
            this.scheduleNextTick(loopId);
        }
    }
    
    /**
     * Lightweight chart update for FAST MODE
     * Shows forming candle animation on non-1m timeframes
     */
    updateChartDataFast() {
        if (!this.fullRawData || this.fullRawData.length === 0) return;
        
        // Ensure currentIndex is valid (never before backtest session floor — all paths must honor this)
        const floorIdx = this.sessionStartIndex || 0;
        if (this.currentIndex < floorIdx) this.currentIndex = floorIdx;
        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.fullRawData.length) this.currentIndex = this.fullRawData.length - 1;

        this._clampCurrentIndexToReplayTimestamp();

        // Keep fast-mode rendering aligned with canonical resampleData()
        // so OHLC is identical to normal replay updates for all timeframes.
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        const slicedRaw = this.fullRawData.slice(0, sliceEnd);
        this.chart.rawData = slicedRaw;
        this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);
        if (typeof this.chart._trimLastDataBarToReplayPlayhead === 'function') {
            this.chart._trimLastDataBarToReplayPlayhead();
        }
        
        // Bump data version
        if (typeof this.chart.bumpDataVersion === 'function') {
            this.chart.bumpDataVersion();
        }
        this._syncCompareOverlaysForReplay();
        
        // Recalculate indicators
        try {
            this._scheduleReplayIndicatorRecalc();
        } catch (error) { /* silent */ }
        
        // Auto-scroll if enabled
        if (this.autoScrollEnabled && !this._viewportLockForPlayback && !this.userHasPanned) {
            const autoScrollState = this.getReplayAutoScrollState(this.chart);
            if (autoScrollState) {
                this.chart.offsetX = autoScrollState.offsetX;
            }
        } else if (this.autoScrollEnabled && !this._viewportLockForPlayback
            && !this._replayUserOwnsViewport(this.chart)) {
            const autoScrollState = this.getReplayAutoScrollState(this.chart);
            if (autoScrollState) {
                this.chart.offsetX = autoScrollState.offsetX;
            }
        }
        
        // Update UI
        this.updateSlider();
        this.updateTimeDisplay();
        
        // Render
        this.chart.isLoading = false;
        if (typeof this.chart.constrainOffset === 'function') {
            this.chart.constrainOffset();
        }
        this._applyPlaybackViewportLock(this.chart);
        this._renderReplayChartUpdate();

        if (typeof this.chart._syncReplayPlayheadCrosshairValues === 'function') {
            this.chart._syncReplayPlayheadCrosshairValues();
        }

        // Same as updateChartData: floating PnL / SL-TP logic must track the latest candle.
        if (this.chart.orderManager && typeof this.chart.orderManager.updatePositions === 'function') {
            this.chart.orderManager.updatePositions();
        }

        // Sync panels (throttle every 3rd update to keep fast mode responsive)
        if (!this._fastSyncCounter) this._fastSyncCounter = 0;
        if (++this._fastSyncCounter % 3 === 0) {
            this.syncPanelCharts(true);
        }

        this._multichartBroadcastReplayFrame();

        // Keep follow button responsive in fast mode (injected fixed overlay must stay aligned with #chartWrapper).
        const now = performance.now();
        const throttleMs = this.autoScrollEnabled ? 200 : 100;
        if (!this._lastFollowIndicatorCheckTs || now - this._lastFollowIndicatorCheckTs >= throttleMs) {
            this._lastFollowIndicatorCheckTs = now;
            this.updateAutoScrollIndicator();
        }

        this._persistReplayStateThrottled();
    }

    _buildReplaySessionPatch() {
        return {
            replay: {
                replayTimestamp: this.replayTimestamp,
                currentIndex: this.currentIndex,
                tickElapsedMs: this.tickElapsedMs,
                speed: this.speed,
                playbackMode: this.getPlaybackMode(),
                timeframe: this.chart.currentTimeframe,
                isActive: true
            }
        };
    }

    _persistReplayStateThrottled() {
        if (!this.chart || !this.isActive) return;
        const now = Date.now();
        const intervalMs = this.isPlaying ? 8000 : 2500;
        if (this._lastReplayPersistAt && now - this._lastReplayPersistAt < intervalMs) {
            return;
        }
        this._lastReplayPersistAt = now;
        const patch = this._buildReplaySessionPatch();
        if (typeof this.chart.scheduleReplaySessionStateSave === 'function') {
            this.chart.scheduleReplaySessionStateSave(patch);
        } else if (typeof this.chart.scheduleSessionStateSave === 'function') {
            this.chart.scheduleSessionStateSave(patch);
        }
    }

    _flushReplayStateToSession() {
        if (!this.chart || !this.isActive) return;
        const patch = this._buildReplaySessionPatch();
        if (typeof this.chart.flushReplaySessionStateSave === 'function') {
            this.chart.flushReplaySessionStateSave(patch);
        } else if (typeof this.chart.scheduleSessionStateSave === 'function') {
            this.chart.scheduleSessionStateSave(patch);
            if (typeof this.chart.flushSessionStateSave === 'function') {
                void this.chart.flushSessionStateSave();
            }
        }
    }
    
    /**
     * Seeded pseudo-random number generator (Linear Congruential Generator)
     * Returns a value between 0 and 1, deterministic based on seed
     * @param {number} seed - The seed value (will be modified)
     * @returns {function} A function that returns the next random number
     */
    createSeededRandom(seed) {
        let state = seed;
        return () => {
            // LCG parameters (same as glibc)
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }
    
    /**
     * Build tick path cache for all candles in fullRawData
     * This pre-generates deterministic tick paths so they're consistent across timeframes
     */
    buildTickPathCache() {
        if (!this.fullRawData || this.fullRawData.length === 0) {
            console.warn('⚠️ Cannot build tick path cache - no raw data');
            return;
        }
        
        const startTime = performance.now();
        
        this.tickPathCache = {};
        
        const n = this.ticksPerCandle || 72;
        for (const candle of this.fullRawData) {
            const path = this.generateRandomPath(candle.o, candle.h, candle.l, candle.c, n, candle.t);
            this.tickPathCache[candle.t] = path;
        }
        
        this.tickPathCacheBuilt = true;
        const elapsed = performance.now() - startTime;
    }
    
    /**
     * Get tick path for a candle, using cache if available
     * @param {object} candle - The candle object with o,h,l,c,t
     * @returns {array} Price samples for tick animation (length === ticksPerCandle)
     */
    getTickPath(candle) {
        if (!candle || !candle.t) return null;

        const n = this.ticksPerCandle || 72;
        const cached = this.tickPathCache[candle.t];
        if (cached && cached.length === n) return cached;

        const path = this.generateRandomPath(candle.o, candle.h, candle.l, candle.c, n, candle.t);
        this.tickPathCache[candle.t] = path;
        return path;
    }
    
    /**
     * Get aggregated tick path for higher timeframe candle
     * Concatenates tick paths from all underlying 1m candles
     * @param {number} displayCandleStart - Start timestamp of the display candle
     * @param {number} displayTimeframeMs - Duration of display timeframe in ms
     * @returns {object} { path: [], rawCandles: [], currentTickIndex: number }
     */
    getAggregatedTickPath(displayCandleStart, displayTimeframeMs) {
        if (!this.fullRawData || this.fullRawData.length === 0) return null;
        
        // Find all raw candles within this display period
        const displayCandleEnd = displayCandleStart + displayTimeframeMs;
        const rawCandles = this.fullRawData.filter(c => 
            c.t >= displayCandleStart && c.t < displayCandleEnd
        );
        
        if (rawCandles.length === 0) return null;
        
        // Concatenate tick paths from all raw candles
        const aggregatedPath = [];
        for (const rawCandle of rawCandles) {
            const tickPath = this.getTickPath(rawCandle);
            if (tickPath) {
                aggregatedPath.push(...tickPath);
            }
        }
        
        return {
            path: aggregatedPath,
            rawCandles: rawCandles,
            ticksPerRawCandle: this.ticksPerCandle || 72,
            totalTicks: aggregatedPath.length
        };
    }
    
    /**
     * Get current price based on virtual time (replayTimestamp + tickElapsedMs)
     * This ensures consistent price display across all timeframes
     * @returns {number|null} Current animated price or null if not available
     */
    getCurrentAnimatedPrice() {
        if (!this.fullRawData || this.fullRawData.length === 0) return null;

        if (this.animatingCandle) {
            if (this.tickProgress > 0) {
                if (!this.animatingCandle.cachedPath) {
                    this.animatingCandle.cachedPath = this.getTickPath(this.animatingCandle.target || this.animatingCandle);
                }
                const path = this.animatingCandle.cachedPath;
                const pathIndex = Math.min(Math.max(0, this.tickProgress - 1), path.length - 1);
                const price = path[pathIndex];
                if (Number.isFinite(price)) return price;
                if (Number.isFinite(this.animatingCandle.close)) return this.animatingCandle.close;
            }
            // When paused mid-candle, tickProgress is 0 but animatingCandle.close
            // holds the last animated price. Use it instead of snapping to open.
            if (!this.isPlaying && Number.isFinite(this.animatingCandle.close)) {
                return this.animatingCandle.close;
            }
            const openPx = Number.parseFloat(this.animatingCandle.open);
            if (Number.isFinite(openPx)) return openPx;
        }

        // Fallback when no intra-candle animation is available.
        const currentRaw = this.fullRawData[this.currentIndex];
        return currentRaw ? currentRaw.c : null;
    }
    
    /**
     * Deterministic intra-candle price path that respects OHLC logic.
     *
     * State-machine microstructure tick path.
     *
     * Four market states cycle randomly each candle:
     *   CHOP     – two-sided noise, indecisive
     *   BURST    – aggressive directional push
     *   STALL    – absorption / consolidation (tiny moves)
     *   PULLBACK – counter-trend retrace
     *
     * The candle is split into 3 segments between randomised anchors
     * (e.g. O→L→H→C or O→H→L→C). Each segment runs its own state
     * machine walk. Seeded RNG keeps it deterministic for pause/resume.
     */
    generateRandomPath(open, high, low, close, numTicks, seed = Date.now()) {
        const rng = this.createSeededRandom(seed);
        const n = Math.max(2, Math.floor(numTicks) || 2);

        if (![open, high, low, close].every(Number.isFinite)) return new Array(n).fill(open || 0);

        const range = high - low;
        if (range <= 0) {
            const p = new Array(n);
            for (let i = 0; i < n; i++) p[i] = open + (close - open) * (i / (n - 1));
            p[n - 1] = close;
            return p;
        }

        const isBullish = close >= open;
        const maxStep = range / (n * 0.13);
        const vol = range * 0.09;

        // Randomised anchor order (not always O→L→H→C)
        const visitLowFirst = isBullish ? (rng() < 0.60) : (rng() < 0.40);
        const anchors = visitLowFirst ? [open, low, high, close] : [open, high, low, close];

        // Budget per segment — proportional to distance with random jitter
        const dists = [];
        let totalDist = 0;
        for (let i = 0; i < anchors.length - 1; i++) {
            const d = Math.abs(anchors[i + 1] - anchors[i]) || range * 0.05;
            dists.push(d);
            totalDist += d;
        }
        const raw = dists.map(d => (d / totalDist) * n * (0.7 + rng() * 0.6));
        const rawSum = raw.reduce((a, b) => a + b, 0);
        const budgets = raw.map(b => Math.max(4, Math.round((b / rawSum) * (n - 1))));
        let budgetSum = budgets.reduce((a, b) => a + b, 0);
        while (budgetSum > n - 1) { budgets[budgets.indexOf(Math.max(...budgets))]--; budgetSum--; }
        while (budgetSum < n - 1) { budgets[budgets.indexOf(Math.min(...budgets))]++; budgetSum++; }

        // State-machine segment generator
        const segment = (start, end, ticks) => {
            if (ticks <= 1) return [start, end];
            const direction = end > start ? 1 : -1;
            const seg = [start];
            let px = start;
            let mom = 0;
            let state = 0;     // 0=CHOP 1=BURST 2=STALL 3=PULLBACK
            let stateDur = 0;

            for (let i = 1; i < ticks; i++) {
                const progress = i / ticks;
                const rem = ticks - i;
                const targetDrift = (end - px) / rem;

                stateDur++;
                const r = rng();
                if (state === 0) {
                    if      (r < 0.12 && rem > 4) { state = 1; stateDur = 0; }
                    else if (r < 0.20 && rem > 3) { state = 2; stateDur = 0; }
                    else if (r < 0.28 && rem > 5 && progress > 0.08) { state = 3; stateDur = 0; }
                } else if (state === 1 && stateDur > 2 + r * 3) {
                    state = r < 0.35 ? 2 : (r < 0.55 ? 3 : 0); stateDur = 0;
                } else if (state === 2 && stateDur > 1 + r * 3) {
                    state = r < 0.45 ? 1 : 0; stateDur = 0;
                } else if (state === 3 && stateDur > 2 + r * 3) {
                    state = r < 0.3 ? 1 : 0; stateDur = 0;
                }

                const noise = (rng() - 0.5) * 2;
                let delta = 0;

                if (state === 0) {        // CHOP — heavier two-sided noise
                    mom = mom * 0.25 + noise * 0.75;
                    delta = targetDrift * 0.30 + mom * vol * 0.8 + noise * vol * 0.65;
                    if (rng() < 0.12) delta += (rng() - 0.5) * vol * 1.4;
                } else if (state === 1) { // BURST — more aggressive
                    mom = mom * 0.75 + direction * 0.35;
                    delta = direction * vol * (1.1 + rng() * 1.6) + targetDrift * 0.20;
                    delta += noise * vol * 0.25;
                } else if (state === 2) { // STALL — small but alive
                    mom *= 0.08;
                    delta = noise * vol * 0.18 * (0.5 + rng());
                    if (rng() < 0.15) delta += (rng() - 0.5) * vol * 0.5;
                } else if (state === 3) { // PULLBACK — wilder counter-trend
                    mom = mom * 0.45 - direction * 0.55;
                    delta = -direction * vol * (0.6 + rng() * 1.2) + noise * vol * 0.5;
                }

                // Random micro-spikes on any state (bid/ask bounce)
                if (rng() < 0.08) delta += (rng() - 0.5) * vol * 1.8;

                delta += targetDrift * progress * progress * 1.6;

                // Repel from candle boundaries to prevent vibration at edges
                const edgeDist = range * 0.04;
                if (px - low < edgeDist && delta < 0)  delta *= 0.15;
                if (high - px < edgeDist && delta > 0)  delta *= 0.15;
                if (px <= low + range * 0.005) delta += range * 0.006;
                if (px >= high - range * 0.005) delta -= range * 0.006;

                delta = Math.max(-maxStep, Math.min(maxStep, delta));
                px = Math.max(low, Math.min(high, px + delta));
                seg.push(px);
            }
            seg.push(end);
            return seg;
        };

        // Build full path from segments
        const path = [];
        for (let s = 0; s < anchors.length - 1; s++) {
            const sub = segment(anchors[s], anchors[s + 1], budgets[s]);
            if (s === 0) {
                for (let j = 0; j < sub.length; j++) path.push(sub[j]);
            } else {
                for (let j = 1; j < sub.length; j++) path.push(sub[j]);
            }
        }

        // Pad or trim to exact length n
        while (path.length < n) path.push(close);
        if (path.length > n) path.length = n;
        path[n - 1] = close;

        // Smooth ensure high/low are touched
        let pMin = path[0], pMax = path[0], minI = 0, maxI = 0;
        for (let i = 1; i < n - 1; i++) {
            if (path[i] < pMin) { pMin = path[i]; minI = i; }
            if (path[i] > pMax) { pMax = path[i]; maxI = i; }
        }
        const sp = Math.max(4, Math.floor(n * 0.07));
        if (pMin > low + range * 0.003) {
            const gap = low - pMin;
            for (let j = -sp; j <= sp; j++) {
                const k = minI + j;
                // Never warp index 0: tick 1 reads path[0]; smoothing it off `open` caused a one-tick flicker at candle open.
                if (k <= 0 || k >= n - 1) continue;
                path[k] = Math.max(low, path[k] + gap * (1 - Math.abs(j) / (sp + 1)));
            }
        }
        if (pMax < high - range * 0.003) {
            const gap = high - pMax;
            for (let j = -sp; j <= sp; j++) {
                const k = maxI + j;
                if (k <= 0 || k >= n - 1) continue;
                path[k] = Math.min(high, path[k] + gap * (1 - Math.abs(j) / (sp + 1)));
            }
        }

        for (let i = 0; i < n; i++) path[i] = Math.max(low, Math.min(high, path[i]));
        path[n - 1] = close;
        path[0] = open;

        // ── Tick-grid snap ────────────────────────────────────────────────────
        // Futures/crypto only trade at discrete tick increments (NQ = 0.25, GC = 0.10,
        // CL = 0.01, BTCUSD = 0.1, USDJPY = 0.001, …). The state-machine walk above
        // produces continuous floats; without snapping, the forming candle's `close`
        // slides through values that never exist on a real exchange (e.g. NQ at
        // `20150.34` or `20151.02`). Snapping here makes the live price LINE advance
        // in realistic ticks: `20150.25 → 20150.50 → 20150.75 → …`.
        //
        // Guards:
        //   1. Only snap when the chart actually has a registered instrument — the
        //      fallback tick (`10^-precision`) on unknown symbols would introduce
        //      float-quantisation noise for data already stored at the native precision.
        //   2. Keep open/close EXACTLY as provided by the data (path endpoints are
        //      what everything else references; altering them would desync OHLC stats).
        //   3. Skip if tick ≥ half the candle range (would collapse the path to a
        //      single value and kill all intra-candle animation).
        try {
            const chart = this.chart;
            const tick = (chart && typeof chart.getTickSize === 'function') ? chart.getTickSize() : null;
            const hasRegistrySpec = !!(
                chart && chart.currentSymbol && typeof window !== 'undefined' && window.marketCalcEngine
                && (() => {
                    try {
                        const calc = window.marketCalcEngine.getCalculator(chart.currentSymbol);
                        return !!(calc && calc.specs
                            && (Number.isFinite(calc.specs.tickSize) || Number.isFinite(calc.specs.pipSize)));
                    } catch (_) { return false; }
                })()
            );
            if (hasRegistrySpec && Number.isFinite(tick) && tick > 0 && tick < range * 0.5) {
                for (let i = 1; i < n - 1; i++) {
                    const snapped = Math.round(path[i] / tick) * tick;
                    // Clamp inside OHLC range after snapping (edge points could round past high/low).
                    path[i] = Math.max(low, Math.min(high, snapped));
                }
            }
        } catch (_) { /* registry lookup failed — leave path unsnapped */ }

        return path;
    }
    
    /**
     * Update chart display with the currently animating candle.
     * Uses a cached slice to avoid copying fullRawData on every tick.
     */
    updateChartWithAnimatedCandle() {
        if (!this.animatingCandle || !this.chart) return;

        const detail = this._buildMultichartReplayFrameDetail();
        if (typeof this.applyMultichartMirrorFrame === 'function') {
            this.applyMultichartMirrorFrame(detail);
        }

        if (typeof window !== 'undefined' && window.__multichartGrid) {
            try {
                if (typeof window.__multichartManagerBroadcastReplay === 'function') {
                    window.__multichartManagerBroadcastReplay(detail);
                } else {
                    window.dispatchEvent(new CustomEvent('replayMultichartFrame', { detail }));
                }
            } catch (_) {}
        } else if (detail.animatedCandle && Array.isArray(this.chart.rawData)) {
            this.syncPanelChartsWithAnimatedCandle(this.chart.rawData, detail.animatedCandle);
        }

        if (this.tickProgress % 18 === 0 && this.chart.recalculateAllIndicators) {
            this.chart.recalculateAllIndicators();
        }

        if (this.chart.orderManager && typeof this.chart.orderManager.updatePositions === 'function') {
            this.chart.orderManager.updatePositions();
        }

        const tn = performance.now();
        if (!this._animFollowIndTs || tn - this._animFollowIndTs >= 90) {
            this._animFollowIndTs = tn;
            if (this.isActive && !this.isPickingPoint) {
                try { this.updateAutoScrollIndicator(); } catch (_) {}
            }
        }
    }
    
    /**
     * Update chart with animated candle specifically for timeframe change
     * This ensures the current price is preserved when switching timeframes
     */
    updateChartWithAnimatedCandleForTimeframeChange() {
        if (!this.animatingCandle || !this.chart) return;
        
        // Create animated data up to current index plus the forming candle
        const slicedRaw = this.fullRawData.slice(0, this.currentIndex + 1);
        
        // Add the animated candle with its current state
        const animatedCandle = {
            t: this.animatingCandle.t,
            o: this.animatingCandle.open,
            h: this.animatingCandle.high,
            l: this.animatingCandle.low,
            c: this.animatingCandle.close,
            v: this.animatingCandle.volume
        };
        slicedRaw.push(animatedCandle);
        
        
        // Update chart data
        this.chart.rawData = slicedRaw;
        this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);
        if (typeof this.chart._trimLastDataBarToReplayPlayhead === 'function') {
            this.chart._trimLastDataBarToReplayPlayhead();
        }
        
        // Bump data version if available
        if (typeof this.chart.bumpDataVersion === 'function') {
            this.chart.bumpDataVersion();
        }
        this._syncCompareOverlaysForReplay();
        
        // Recalculate indicators
        try {
            this._scheduleReplayIndicatorRecalc();
        } catch (error) {
            console.warn('⚠️ Error recalculating indicators:', error);
        }
        
        // Update slider
        this.updateSliderRange();
        this.updateSlider();
        this.updateTimeDisplay();
        
    }
    
    /**
     * Sync all panel charts with the animated candle during tick animation
     */
    syncPanelChartsWithAnimatedCandle(slicedRaw, animatedCandle) {
        if (!window.panelManager || !window.panelManager.panels || window.panelManager.panels.length === 0) {
            return;
        }
        
        const mainChart = this.chart;
        const mainSymbol = mainChart ? mainChart.currentSymbol : null;
        const replayTs = this.replayTimestamp;
        
        window.panelManager.panels.forEach((panel, index) => {
            const pc = panel.chartInstance;
            if (!pc || !pc.isPanel || pc === mainChart) return;
            
            try {
                const hasOwnData = Array.isArray(pc._panelFullRawData) && pc._panelFullRawData.length > 0;
                let appliedSlice = false;

                // Same instrument/file as main MUST use the main replay slice (currentIndex), not a
                // timestamp cut on _panelFullRawData — API / TF resampling can shift bar .t so
                // "last t <= replayTimestamp" still includes forward candles until play advances.
                if (this._panelSharesMainReplayDataset(pc, mainChart)) {
                    if (mainSymbol && pc.currentSymbol !== mainSymbol) {
                        pc.currentSymbol = mainSymbol;
                        if (mainChart) pc.currentFileId = mainChart.currentFileId;
                        if (typeof pc.updateChartOHLCSymbol === 'function') pc.updateChartOHLCSymbol(mainSymbol);
                        pc.priceZoom = 1;
                        pc.priceOffset = 0;
                        pc.autoScale = true;
                        if (pc.priceScale) pc.priceScale.autoScale = true;
                        pc.manualCenterPrice = null;
                        pc.manualRange = null;
                    }
                    pc.rawData = [...slicedRaw];
                    pc.data = pc.resampleData(slicedRaw, pc.currentTimeframe);
                    appliedSlice = true;
                } else if (hasOwnData) {
                    const idx = this._resolvePanelRawEndIndexForReplay(pc._panelFullRawData, replayTs);
                    const panelSlice = pc._panelFullRawData.slice(0, idx + 1);
                    pc.rawData = panelSlice;
                    pc.data = pc.resampleData(panelSlice, pc.currentTimeframe);
                    if (typeof pc._trimLastDataBarToReplayPlayhead === 'function') {
                        pc._trimLastDataBarToReplayPlayhead();
                    }
                    appliedSlice = true;
                }

                if (!appliedSlice) {
                    return;
                }

                if (this.tickProgress % 18 === 0) {
                    if (typeof pc.scheduleIndicatorRecalc === 'function') {
                        try { pc.scheduleIndicatorRecalc('live-tick'); } catch (e) {}
                    } else if (typeof pc.recalculateIndicators === 'function') {
                        try { pc.recalculateIndicators(); } catch (e) {}
                    }
                }

                if (this.autoScrollEnabled && this.tickProgress % 8 === 0) {
                    if (pc.fitToView) {
                        pc.fitToView();
                    } else {
                        const st = this.getReplayAutoScrollState(pc);
                        if (st) pc.offsetX = st.offsetX;
                    }
                }

                if (pc.render) pc.render();
            } catch (error) {
                // Silent fail during animation to prevent lag
            }
        });
    }
    
    /**
     * Complete the tick animation and move to next candle
     */
    completeTickAnimation() {
        this.stopTickAnimation();
        
        this._advanceReplayPlayheadOneStep();
        
        // Update slider and time display
        this.updateTimeDisplay();
        this.updateSlider();
        
        // Sync panel charts
        this.syncPanelCharts();

        try {
            this.updateAutoScrollIndicator();
        } catch (_) {}
        
        // Start animation for next candle if still playing
        if (this.isPlaying && this.currentIndex < this.fullRawData.length - 1) {
            if (this._nextCandleTimer) {
                clearTimeout(this._nextCandleTimer);
                this._nextCandleTimer = null;
            }
            const nextCandleDelay = this.useConstantTickInterval
                ? Math.max(0, Number(this.interCandleDelayMs) || 0)
                : 50;
            this._nextCandleTimer = setTimeout(() => {
                this._nextCandleTimer = null;
                if (this.isPlaying) this.startTickAnimation();
            }, nextCandleDelay);
        } else if (this.currentIndex >= this.fullRawData.length - 1) {
            if (!this._handleForwardEdgeWhilePlaying(() => this.startTickAnimation())) {
                this._finishPlaybackAtSessionEnd();
            }
        }
    }
    
    /**
     * Stop tick animation
     * If _preserveTickProgress is set, keeps animatingCandle and tickProgress intact
     */
    stopTickAnimation() {
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }

        if (!this._preserveTickProgress) {
            this.animatingCandle = null;
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
        }

        this._animSlice = null;
        this._animSliceIdx = -1;
        this.volumeTickData = null;
        this.updateTickProgress(0);
    }

    /**
     * Pause playback and normalize to canonical closed-candle state.
     */
    pause() {
        this._cancelDeferredPlayStart();
        this._viewportLockForPlayback = null;

        // Set state first
        this.isPlaying = false;
        this._activeTickLoop = (this._activeTickLoop || 0) + 1;
        this._activeCandleLoop = (this._activeCandleLoop || 0) + 1;
        
        // Stop active timers first
        if (this._nextCandleTimer) {
            clearTimeout(this._nextCandleTimer);
            this._nextCandleTimer = null;
        }
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }

        // Save partial tick state so resume can pick up where we left off.
        // The animated candle stays visible on screen (frozen in place).
        const hadPartialState = this.tickProgress > 0 || !!this.animatingCandle;
        if (hadPartialState) {
            this._savedTickState = {
                animatingCandle: this.animatingCandle,
                tickProgress: this.tickProgress,
                tickElapsedMs: this.tickElapsedMs
            };
            // Keep animatingCandle alive so the chart keeps showing the
            // partial candle.  Only clear the timer-driven fields.
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
        }
        
        // Hide tick progress indicator
        this.showTickProgress(false);
        
        // Update button UI immediately
        this.syncPlayPauseButtonVisuals();

        // Full-quality paint once play stops (play path uses lite render for speed).
        this._flushReplayIndicatorRecalc();
        if (this.chart && typeof this.chart.render === 'function') {
            this.chart.renderPending = false;
            try { this.chart.render(); } catch (_e) { /* ignore */ }
        }

        this._flushReplayStateToSession();
    }

    /**
     * Stop playback
     */
    stop() {
        this.pause();
    }

    /**
     * Manual step forward request from UI controls/clone.
     * Ensures replay does not continue running after a single-step action.
     */
    requestStepForward() {
        if (this.isPlaying) {
            this.pause();
        }
        this._savedTickState = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        this.stepForward();
    }

    /**
     * Manual step backward request from UI controls/clone.
     * Pauses active playback first for deterministic stepping.
     */
    requestStepBackward() {
        if (this.isPlaying) {
            this.pause();
        }
        this._savedTickState = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        this.stepBackward();
    }

    /**
     * Step forward one bar (based on selected timeframe)
     */
    stepForward() {
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }
        if (this._timeframeChanging) {
            return;
        }
        if (this._isSubBarStepMode()) {
            const prevIdx = this.currentIndex;
            if (!this._advanceSubBarStepForward()) {
                if (this.tryRequestForwardDataProbe()) return;
                return;
            }
            this.updateChartData(this.autoScrollEnabled && prevIdx !== this.currentIndex);
            this._syncMultichartAfterManualStep();
            return;
        }

        if (this.currentIndex >= this.fullRawData.length - 1) {
            if (this.tryRequestForwardDataProbe()) {
                return;
            }
            return;
        }

        const targetIndex = this.calculateNextIndex();
        if (targetIndex <= this.currentIndex) {
            if (this.tryRequestForwardDataProbe()) {
                return;
            }
            return;
        }

        this.currentIndex = targetIndex;
        if (this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        this.updateChartData(this.autoScrollEnabled);
        this._syncMultichartAfterManualStep();
    }

    /**
     * Step backward one bar (based on selected timeframe)
     */
    stepBackward() {
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        if (!this.isBackNavigationAllowed()) {
            console.warn('🚫 Step backward blocked: back navigation disabled by session policy');
            return;
        }

        if (this._isSubBarStepMode()) {
            const minIdx = this.sessionStartIndex || 0;
            const floorTs = Number(this.fullRawData[minIdx]?.t);
            const curTs = Number.isFinite(this.replayTimestamp)
                ? this.replayTimestamp
                : Number(this.fullRawData[this.currentIndex]?.t);
            if (Number.isFinite(floorTs) && Number.isFinite(curTs) && curTs <= floorTs) {
                return;
            }
            if (!this._advanceSubBarStepBackward()) return;
            this.updateChartData(this.autoScrollEnabled);
            this._syncMultichartAfterManualStep();
            return;
        }

        const minIdx = this.sessionStartIndex || 0;
        if (this.currentIndex <= minIdx) {
            return;
        }

        const targetIndex = this.calculatePreviousIndex();
        if (targetIndex >= this.currentIndex) {
            return;
        }

        this.currentIndex = targetIndex;
        if (this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        this.updateChartData(this.autoScrollEnabled);
        this._syncMultichartAfterManualStep();
    }

    /**
     * Set playback speed
     */
    normalizeSpeed(speed) {
        const n = Number(speed);
        if (!Number.isFinite(n)) return 1;
        return Math.max(1, Math.min(100, n));
    }

    /**
     * Tick-by-tick playback runs at 2× the slider speed; candle-by-candle uses the slider as-is.
     */
    getEffectivePlaybackSpeed() {
        const base = this.normalizeSpeed(this.speed);
        if (this.getPlaybackMode() === 'tick') {
            return Math.min(100, base * 2);
        }
        return base;
    }

    setSpeed(speed) {
        this.speed = this.normalizeSpeed(speed);
        
        // Update button UI to show active state
        this.updateSpeedButtonUI(this.speed);

        const playbackMode = this.getPlaybackMode();
        
        // If playing, restart the active playback mode with the new speed.
        if (this.isPlaying) {
            if (playbackMode === 'candle') {
                if (this._nextCandleTimer) {
                    clearTimeout(this._nextCandleTimer);
                    this._nextCandleTimer = null;
                }
                if (this.tickInterval) {
                    clearTimeout(this.tickInterval);
                    this.tickInterval = null;
                }
                if (this.playInterval) {
                    clearInterval(this.playInterval);
                    this.playInterval = null;
                }
                this.startCandleByCandle(false);
                return;
            }

            // Save current animation state before stopping
            const savedTickProgress = this.tickProgress;
            const savedTickElapsedMs = this.tickElapsedMs;
            const savedAnimatingCandle = this.animatingCandle ? { ...this.animatingCandle } : null;
            
            // Stop any existing animations (this clears tickProgress)
            if (this.tickInterval) {
                clearTimeout(this.tickInterval);
                this.tickInterval = null;
            }
            if (this.playInterval) {
                clearInterval(this.playInterval);
                this.playInterval = null;
            }
            
            // Restore saved state
            this.tickProgress = savedTickProgress;
            this.tickElapsedMs = savedTickElapsedMs;
            this.animatingCandle = savedAnimatingCandle;
            
            // Set flag to preserve progress in startTickAnimation
            this._preserveTickProgress = true;
            
            // Restart tick animation with new speed
            this.showTickProgress(false);
            this.startTickAnimation();
        }
    }

    /**
     * Seek to specific position
     */
    seekTo(index, { fromDrag = false } = {}) {
        const seekMinIdx = this.sessionStartIndex || 0;
        this.currentIndex = Math.max(seekMinIdx, Math.min(index, this.fullRawData.length - 1));
        
        // === UPDATE VIRTUAL TIME: Sync replayTimestamp with new position ===
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        // Clear stale animation state so the price line reflects the
        // seeked-to candle, not the old animation close.
        this.animatingCandle = null;
        this.tickProgress = 0;

        // Pre-arm guards before updateChartData so updatePositions() doesn't
        // fire SL/TP on the seeked-to candle's stale OHLC.  We use the raw
        // bar's timestamp (resampled candle time may differ, but this is a
        // safe upper bound that will be refreshed again after the chart updates).
        const om = this.chart?.orderManager;
        if (om && typeof om._refreshAllGuardsToCurrentCandle === 'function') {
            const rawBar = this.fullRawData[this.currentIndex];
            if (rawBar) {
                om._refreshAllGuardsToTimestamp(rawBar.t);
            }
        }
        
        const autoScroll = fromDrag ? false : this.autoScrollEnabled;
        this.updateChartData(autoScroll);

        // Final refresh with resampled candle data for precision
        if (om && typeof om._refreshAllGuardsToCurrentCandle === 'function') {
            om._refreshAllGuardsToCurrentCandle();
        }
    }

    /**
     * Seek replay to the bar matching a wall-clock / session timestamp (multi-instrument sync).
     * @param {number|string|Date} targetTimestamp
     * @param {{ preserveVisibleWindow?: boolean }} options — if true, do not auto-scroll the chart
     */
    goToReplayTimestamp(targetTimestamp, options = {}) {
        const preserveVisibleWindow = !!(options && options.preserveVisibleWindow);
        const centerOnCandle = !!(options && options.centerOnCandle);
        if (!this.isActive || !Array.isArray(this.fullRawData) || this.fullRawData.length === 0) {
            return false;
        }

        const chart = this.chart;
        const ts = chart && typeof chart.normalizeTimestampMs === 'function'
            ? chart.normalizeTimestampMs(targetTimestamp)
            : Number(targetTimestamp);
        if (!Number.isFinite(ts)) {
            return false;
        }

        // Replay display is a prefix through the last bar at/before wall-clock playhead.
        // findGoToTargetIndex returns the first bar on/after ts — when ts predates the
        // series that collapses to index 0 → one stretched candle on multichart pair switch.
        let idx = -1;
        if (typeof this._findLastRawIndexAtOrBefore === 'function') {
            idx = this._findLastRawIndexAtOrBefore(this.fullRawData, ts);
        }
        if (idx < 0 && chart && typeof chart.findGoToTargetIndex === 'function') {
            idx = chart.findGoToTargetIndex(this.fullRawData, ts);
        }
        if (idx < 0) {
            idx = this.fullRawData.findIndex(c => Number(c?.t) >= ts);
        }
        if (idx < 0) {
            idx = this.fullRawData.length - 1;
        }
        const minIdx = this.sessionStartIndex || 0;
        idx = Math.min(Math.max(idx, minIdx), this.fullRawData.length - 1);
        this.currentIndex = idx;
        this.replayTimestamp = this.fullRawData[idx]?.t ?? ts;
        this.tickElapsedMs = 0;
        this.animatingCandle = null;
        this.tickProgress = 0;

        // Pre-arm guards before chart update
        const om2 = this.chart?.orderManager;
        if (om2 && typeof om2._refreshAllGuardsToTimestamp === 'function') {
            const rawBar = this.fullRawData[idx];
            if (rawBar) om2._refreshAllGuardsToTimestamp(rawBar.t);
        }

        const autoScroll = (preserveVisibleWindow || centerOnCandle) ? false : this.autoScrollEnabled;
        this.updateChartData(autoScroll);

        // Final refresh with resampled candle data
        if (om2 && typeof om2._refreshAllGuardsToCurrentCandle === 'function') {
            om2._refreshAllGuardsToCurrentCandle();
        }

        if (centerOnCandle && chart && Array.isArray(chart.data) && chart.data.length > 0) {
            const candleSpacing = typeof chart.getCandleSpacing === 'function'
                ? chart.getCandleSpacing()
                : (chart.candleWidth + (chart.candleGap || 2));
            if (Number.isFinite(candleSpacing) && candleSpacing > 0) {
                const m = chart.margin || { l: 0, r: 70 };
                // Match getReplayAutoScrollState: chart.w is often 0 right after
                // loadFileData / pair-switch in a multichart iframe — using it
                // alone makes numVisible=1 and offsetX wrong → blank canvas until
                // the user hits play or resizes.
                let effectiveW = Number(chart.w) || 0;
                if (effectiveW < 80) {
                    try {
                        const canvas = chart.canvas;
                        const el = canvas && canvas.parentElement;
                        const rw = el ? el.getBoundingClientRect().width : 0;
                        if (Number.isFinite(rw) && rw >= 80) effectiveW = rw;
                    } catch (_e) { /* ignore */ }
                }
                if (effectiveW < 80) {
                    effectiveW = 320;
                }
                const chartAreaW = Math.max(0, effectiveW - (m.l || 0) - (m.r || 0));
                const numVisible = Math.max(1, Math.floor(chartAreaW / candleSpacing));
                const lastIdx = chart.data.length - 1;
                const scrollPos = Math.max(0, lastIdx - Math.floor(numVisible * 0.7));
                chart.offsetX = -scrollPos * candleSpacing;
                if (typeof chart.constrainOffset === 'function') chart.constrainOffset();
                chart.render();
            }
        }

        if (typeof this.updateSliderRange === 'function') this.updateSliderRange();
        if (typeof this.updateSlider === 'function') this.updateSlider();
        if (typeof this.updateTimeDisplay === 'function') this.updateTimeDisplay();
        return true;
    }

    /**
     * Called when user manually pans the chart
     */
    onUserPan() {
        if (!this.isActive) return;

        // Release frozen viewport so playback no longer snaps back after Play.
        this._viewportLockForPlayback = null;
        this.autoScrollEnabled = false;
        this.userHasPanned = true;
        if (this.chart && typeof this.chart._clearTfSwitchAnchorLock === 'function') {
            this.chart._clearTfSwitchAnchorLock();
        }

        // Show visual indicator that auto-scroll is disabled
        this.updateAutoScrollIndicator();
    }

    /**
     * Re-enable auto-scroll (follow mode)
     */
    enableAutoScroll() {
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        this._viewportLockForPlayback = null;

        const chart = this.chart;
        if (chart && typeof chart._isMultichartViewportJustReset === 'function'
            && chart._isMultichartViewportJustReset()) {
            if (this.isActive) {
                this.updateChartData(true);
            }
            requestAnimationFrame(() => {
                this.updateAutoScrollIndicator();
            });
            return;
        }

        // Reset zoom and scroll to latest candle (same as double-click on time axis).
        if (chart && typeof chart.jumpToLatest === 'function') {
            chart.jumpToLatest();
        }

        if (this.isActive) {
            this.updateChartData(true);
        }

        requestAnimationFrame(() => {
            this.updateAutoScrollIndicator();
        });
    }

    /**
     * Re-run follow replay across the main chart + panel tiles after layout has
     * settled. A single rAF is often too early: panel split / iframe width is still
     * 0 or stale, so getReplayAutoScrollState under-scrolls until the user clicks
     * the floating #replayFollow (enableAutoScroll) manually.
     */
    scheduleReplayFollowOnceLayoutSettled() {
        if (!this.isActive) return;
        if (this.userHasPanned) return;
        if (this._replayUserOwnsViewport(this.chart)) return;
        const chart = this.chart;
        if (chart && typeof chart._isMultichartViewportJustReset === 'function'
            && chart._isMultichartViewportJustReset()) {
            return;
        }
        const run = () => {
            if (this.userHasPanned) return;
            if (this._replayUserOwnsViewport(chart)) return;
            if (chart && typeof chart._isMultichartViewportJustReset === 'function'
                && chart._isMultichartViewportJustReset()) {
                return;
            }
            try {
                this.enableAutoScroll();
            } catch (_) { /* ignore */ }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    run();
                    setTimeout(run, 95);
                    setTimeout(run, 280);
                });
            });
        } else {
            setTimeout(run, 0);
            setTimeout(run, 120);
            setTimeout(run, 300);
        }
    }

    /**
     * Fixed overlay: pin `#replayFollow` to the chart wrapper’s bottom-right in viewport space.
     * Does not follow pan/scroll (unlike anchoring to the last bar’s X).
     */
    positionReplayFollowChrome(btn) {
        const wrap =
            document.getElementById('chartWrapper') ||
            document.querySelector('.chart-wrapper') ||
            this.chart?.canvas?.closest('#chartWrapper') ||
            this.chart?.canvas?.parentElement;
        if (!btn) return;
        if (!wrap) {
            btn.style.position = 'fixed';
            btn.style.right = '24px';
            btn.style.bottom = 'calc(120px + env(safe-area-inset-bottom, 0px))';
            btn.style.left = 'auto';
            btn.style.top = 'auto';
            btn.style.zIndex = '2147483646';
            return;
        }
        const r = wrap.getBoundingClientRect();
        const padR = 120;
        const padB = 70;
        const btnH = 36;
        const z = (typeof window !== 'undefined' && typeof window.__v9Zoom === 'number' && window.__v9Zoom > 0) ? window.__v9Zoom : 1;
        let topPx = Math.round(r.bottom - padB - btnH);

        // If stacked indicator panels exist, pin follow button to the main chart pane
        // (just above the top separator), so it never overlaps separate indicator panes.
        const spi = this.chart?.separatePanelInfo;
        if (spi && Number.isFinite(spi.top)) {
            const separatorTop = Math.round(r.top + spi.top * z);
            topPx = separatorTop - btnH - 8;
        }

        const minTop = Math.round(r.top + 8);
        const maxTop = Math.round(r.bottom - btnH - 8);
        topPx = Math.max(minTop, Math.min(maxTop, topPx));

        btn.style.position = 'fixed';
        btn.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right + padR))}px`;
        btn.style.top = `${topPx}px`;
        btn.style.left = 'auto';
        btn.style.bottom = 'auto';
        btn.style.zIndex = '2147483646';
    }

    /**
     * Resolve `#replayFollow`. If the V9 bundle is stale (no React node), inject a fixed button on
     * `document.body` so it cannot be removed by React re-renders inside `#chartWrapper`.
     */
    ensureReplayFollowButton() {
        const followIconSvg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none">' +
            '<rect x="1" y="1" width="22" height="22" rx="0" fill="#2962FF"/>' +
            '<path d="M9.5 6.5 L17.5 12 L9.5 17.5 Z" fill="#fff"/>' +
            '</svg>';
        let btn = this.followBtn;
        if (btn && document.body.contains(btn)) return btn;

        btn = document.getElementById('replayFollow');

        if (!btn) {
            btn = document.querySelector('button[data-talaria-replay-follow="injected"]');
        }

        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            // No id — avoids duplicate id="replayFollow" if V9 React mounts after injection.
            btn.dataset.talariaReplayFollow = 'injected';
            btn.className = 'replay-follow-float-btn';
            btn.title = '';
            btn.setAttribute('aria-label', 'Follow replay candle');
            btn.innerHTML = followIconSvg;
            Object.assign(btn.style, {
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                padding: '0',
                margin: '0',
                boxSizing: 'border-box',
                WebkitAppearance: 'none',
                appearance: 'none',
                font: 'inherit',
                outline: 'none',
                background: 'transparent',
                border: 'none',
                borderRadius: '0',
                color: '#fff',
                cursor:'default',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.35)',
                pointerEvents: 'auto',
                opacity: '0.5',
                transition: 'transform 0.12s ease, opacity 0.12s ease',
            });
            document.body.appendChild(btn);
        }

        if (!btn) return null;

        // Keep icon in sync even when button comes from React (#replayFollow).
        if (btn.innerHTML !== followIconSvg) {
            btn.innerHTML = followIconSvg;
        }

        if (!btn.dataset.replayFollowBound) {
            btn.dataset.replayFollowBound = '1';
            btn.addEventListener('click', () => this.enableAutoScroll());
        }
        this.followBtn = btn;
        return btn;
    }

    /** While replay is active, refresh follow-button visibility when the page scrolls or the chart is clipped/hidden. */
    _attachReplayFollowViewportListeners() {
        if (this._replayFollowViewportBound || typeof window === 'undefined') return;
        this._replayFollowViewportBound = () => {
            try {
                if (!this.isActive) return;
                this.updateAutoScrollIndicator();
            } catch (_) {}
        };
        window.addEventListener('scroll', this._replayFollowViewportBound, true);
        window.addEventListener('resize', this._replayFollowViewportBound);
    }

    _detachReplayFollowViewportListeners() {
        if (!this._replayFollowViewportBound || typeof window === 'undefined') return;
        try {
            window.removeEventListener('scroll', this._replayFollowViewportBound, true);
            window.removeEventListener('resize', this._replayFollowViewportBound);
        } catch (_) {}
        this._replayFollowViewportBound = null;
    }

    /**
     * Check if the replay head (last rendered candle) lies inside the drawable viewport for a chart instance.
     * Uses plot margins + `dataIndexToPixel` when available — avoids `getVisibleEndIndex()` overshoot on V9.
     * @param {*} [chartInstance] — defaults to main `this.chart`
     */
    isLastCandleVisible(chartInstance) {
        const chart = chartInstance !== undefined && chartInstance !== null ? chartInstance : this.chart;
        if (!chart || !chart.data || chart.data.length === 0) {
            return true;
        }

        const m = chart.margin || { l: 0, r: 70 };
        const spacing =
            typeof chart.getCandleSpacing === 'function'
                ? chart.getCandleSpacing()
                : chart.candleWidth + (chart.candleGap || 2);
        if (!Number.isFinite(spacing) || spacing <= 0) {
            return true;
        }

        const lastIdx = chart.data.length - 1;
        const lastX = typeof chart.dataIndexToPixel === 'function'
            ? chart.dataIndexToPixel(lastIdx)
            : (m.l + lastIdx * spacing + (chart.offsetX || 0));
        const plotLeft = m.l;
        const plotRight = chart.w - (m.r || 0);
        const slack = spacing * 1.75;
        return lastX >= plotLeft - slack && lastX <= plotRight + slack;
    }

    /**
     * True when `el` has real on-screen area and no hidden ancestor (collapse / display:none / scrolled away).
     */
    _isReplayFollowDomSurfaceVisible(el) {
        try {
            if (!el || typeof el.getBoundingClientRect !== 'function') return false;

            if (typeof el.checkVisibility === 'function') {
                if (
                    !el.checkVisibility({
                        checkOpacity: true,
                        checkVisibilityCSS: true,
                    })
                ) {
                    return false;
                }
            } else {
                let node = el;
                while (node && node !== document.documentElement) {
                    const pcs =
                        typeof window !== 'undefined' && window.getComputedStyle
                            ? window.getComputedStyle(node)
                            : null;
                    if (pcs) {
                        if (pcs.display === 'none' || pcs.visibility === 'hidden') return false;
                        if (Number.parseFloat(pcs.opacity || '1') === 0) return false;
                    }
                    node = node.parentElement;
                }
            }

            const cs =
                typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (
                cs &&
                (cs.display === 'none' ||
                    cs.visibility === 'hidden' ||
                    Number.parseFloat(cs.opacity || '1') === 0)
            ) {
                return false;
            }
            const r = el.getBoundingClientRect();
            if (!Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width < 12 || r.height < 12) {
                return false;
            }
            if (typeof window !== 'undefined') {
                if (r.bottom < -80 || r.top > window.innerHeight + 80) return false;
                if (r.right < -80 || r.left > window.innerWidth + 80) return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * True when the main chart tile has measurable on-screen area (hide overlay when chart is collapsed/off-screen).
     */
    _isReplayFollowChartSurfaceVisible() {
        const wrap =
            document.getElementById('chartWrapper') ||
            document.querySelector('#chart-container .chart-wrapper') ||
            document.querySelector('.chart-wrapper');
        const el = wrap || this.chart?.canvas?.closest('#chart-container');
        return this._isReplayFollowDomSurfaceVisible(el);
    }

    /** Per-panel chart tile: same visibility rules as the main follow overlay. */
    _isReplayFollowPanelSurfaceVisible(panel) {
        const el = panel?.chartContainer || panel?.element;
        return this._isReplayFollowDomSurfaceVisible(el);
    }

    /**
     * Update visual indicator for auto-scroll status
     */
    updateAutoScrollIndicator() {
        const btn = this.ensureReplayFollowButton();
        const hidePicking = this.isActive && this.isPickingPoint;
        const lastCandleHidden = !this.isLastCandleVisible();
        const chartSurfaceOk = this._isReplayFollowChartSurfaceVisible();
        // Show whenever the last candle is scrolled off-screen (replay or normal browsing).
        const showFollow = !hidePicking && lastCandleHidden && chartSurfaceOk;

        if (btn) {
            if (!showFollow) {
                btn.style.display = 'none';
                btn.classList.remove('replay-follow--attention');
            } else {
                this.positionReplayFollowChrome(btn);
                btn.style.display = 'flex';
                btn.style.visibility = 'visible';
                btn.classList.add('replay-follow--attention');
            }
        }

        // Panel follow buttons — show when last candle is off-screen.
        const pm = window.panelManager;
        if (pm && pm.panels) {
            pm.panels.forEach((panel, idx) => {
                const pBtn = document.getElementById(`panelFollow${idx}`);
                if (!pBtn) return;

                if (hidePicking) {
                    pBtn.style.display = 'none';
                    pBtn.classList.remove('replay-follow--attention');
                    return;
                }

                const pc = panel.chartInstance;
                if (!pc || !pc.data || pc.data.length === 0) {
                    pBtn.style.display = 'none';
                    pBtn.classList.remove('replay-follow--attention');
                    return;
                }

                const panelNeedsCatchUp = !this.isLastCandleVisible(pc);
                const panelSurfaceOk = this._isReplayFollowPanelSurfaceVisible(panel);
                const showPanelFollow = panelNeedsCatchUp && panelSurfaceOk;

                if (!showPanelFollow) {
                    pBtn.style.display = 'none';
                    pBtn.classList.remove('replay-follow--attention');
                } else {
                    pBtn.style.display = 'flex';
                    pBtn.style.visibility = 'visible';
                    pBtn.classList.add('replay-follow--attention');
                }
            });
        }
    }

    /**
     * True when this chart tile shows the same dataset as multichart host A.
     */
    _mirrorSharesHostDataset(chart, detail) {
        const hostFid = detail && detail.hostFileId != null ? String(detail.hostFileId) : '';
        const panelFid = chart && chart.currentFileId != null ? String(chart.currentFileId) : '';
        if (hostFid && panelFid) return hostFid === panelFid;
        if (panelFid
            && Array.isArray(chart._panelFullRawData) && chart._panelFullRawData.length > 0) {
            return false;
        }
        return true;
    }

    /**
     * Raw OHLC series for multichart mirror: independent pair tiles use `_panelFullRawData`.
     */
    _resolveMirrorRawSeries(chart, detail) {
        if (!chart) return null;
        if (!this._mirrorSharesHostDataset(chart, detail)
            && Array.isArray(chart._panelFullRawData) && chart._panelFullRawData.length > 0) {
            return chart._panelFullRawData;
        }
        if (Array.isArray(this.fullRawData) && this.fullRawData.length > 0) {
            return this.fullRawData;
        }
        if (Array.isArray(chart._panelFullRawData) && chart._panelFullRawData.length > 0) {
            return chart._panelFullRawData;
        }
        return null;
    }

    /**
     * Map wall-clock replay ts → index on an arbitrary raw series (not only fullRawData).
     */
    _syncMirrorPlayheadFromTimestamp(rawSeries, ts) {
        if (!Number.isFinite(ts) || !Array.isArray(rawSeries) || !rawSeries.length) {
            return false;
        }
        const hit = this._findLastRawIndexAtOrBefore(rawSeries, ts);
        const floor = this.sessionStartIndex || 0;
        if (hit >= floor) {
            this.currentIndex = hit;
            const bar = rawSeries[hit];
            const next = rawSeries[hit + 1];
            const barT = bar && Number.isFinite(bar.t) ? bar.t : null;
            const barEnd = next && Number.isFinite(next.t) ? next.t : null;
            if (barT != null && ts >= barT && (barEnd == null || ts < barEnd)) {
                this.replayTimestamp = ts;
            } else if (barT != null) {
                this.replayTimestamp = barT;
            }
            return true;
        }
        if (hit >= 0) {
            this.currentIndex = floor;
            const bar = rawSeries[this.currentIndex];
            if (bar && Number.isFinite(bar.t)) this.replayTimestamp = bar.t;
            return true;
        }
        return false;
    }

    /**
     * Tick-forming candle for a panel on its own pair during multichart play.
     */
    _buildIndependentPairAnimatedCandle(frd, ts, detail) {
        if (!Array.isArray(frd) || !frd.length || !Number.isFinite(ts)) return null;

        if (Number.isFinite(detail.tickElapsedMs)) {
            this.tickElapsedMs = Number(detail.tickElapsedMs);
        }
        if (Number.isFinite(detail.tickProgress)) {
            this.tickProgress = Number(detail.tickProgress);
        }

        const hit = this._findLastRawIndexAtOrBefore(frd, ts);
        if (hit < 0) return null;

        let formingIdx = hit;
        const bar = frd[hit];
        const next = frd[hit + 1];
        if (next && Number.isFinite(bar.t) && Number.isFinite(next.t) && ts >= bar.t && ts < next.t) {
            formingIdx = hit + 1;
        } else if ((this.tickProgress || 0) > 0 && hit + 1 < frd.length) {
            formingIdx = hit + 1;
        }

        const panelBar = frd[formingIdx];
        if (!panelBar) return null;

        this.currentIndex = Math.max(this.sessionStartIndex || 0, Math.max(0, formingIdx - 1));
        this.replayTimestamp = ts;

        const ticksNeeded = Number(detail.ticksPerCandle)
            || this.currentTicksPerCandle
            || this.ticksPerCandle
            || 72;
        const tp = Math.max(0, Math.min(Number(this.tickProgress) || 0, ticksNeeded));
        const path = typeof this.getTickPath === 'function' ? this.getTickPath(panelBar) : null;
        let currentPrice = Number(panelBar.c);
        if (path && path.length > 0 && tp > 0) {
            const pathIndex = Math.min(tp - 1, path.length - 1);
            currentPrice = path[pathIndex];
            currentPrice = Math.max(Number(panelBar.l), Math.min(Number(panelBar.h), currentPrice));
        }

        return {
            formingIdx,
            candle: {
                t: panelBar.t,
                o: Number(panelBar.o),
                h: Math.max(Number(panelBar.o), Number(panelBar.h), currentPrice),
                l: Math.min(Number(panelBar.o), Number(panelBar.l), currentPrice),
                c: currentPrice,
                v: Number(panelBar.v) || 0,
            },
        };
    }

    _finishMultichartMirrorRender(chart, opts) {
        if (!chart) return;
        chart.isLoading = false;

        const options = opts && typeof opts === 'object' ? opts : {};
        const lightPass = options.lightPass === true;
        const passivePlay = chart._multichartPassivePlayActive === true;
        const preserveUntil = chart._multichartPreserveViewportUntil;
        const nowPv = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        const preserveViewport = Number.isFinite(preserveUntil) && nowPv < preserveUntil;
        const savedOffsetX = chart.offsetX;
        const savedCandleWidth = chart.candleWidth;
        const bootLocked = !passivePlay
            && typeof chart._isMultichartBootViewportLocked === 'function'
            && chart._isMultichartBootViewportLocked();

        if (!lightPass && Array.isArray(chart.data) && chart.data.length > 0 && !bootLocked) {
            const m = chart.margin || { l: 60, r: 70 };
            const plotW = Math.max(1, (Number(chart.w) || 320) - m.l - m.r);
            const cs = chart.getCandleSpacing
                ? chart.getCandleSpacing()
                : (chart.candleWidth + (chart.candleGap || 2));
            const safeCs = Number.isFinite(cs) && cs > 0 ? cs : 8;
            const i0 = Math.max(0, -Math.floor((chart.offsetX || 0) / safeCs) - 5);
            const i1 = Math.min(
                chart.data.length,
                -Math.floor((chart.offsetX || 0) / safeCs) + Math.ceil(plotW / safeCs) + 5
            );
            const visibleBars = Math.max(0, i1 - i0);
            const needsRecovery = typeof chart._multichartViewportNeedsRecovery === 'function'
                && chart._multichartViewportNeedsRecovery();
            const needsScroll = needsRecovery
                || visibleBars === 0
                || (chart.data.length <= 30 && visibleBars < Math.min(3, chart.data.length));
            const explicitUserPan = this.userHasPanned || !this.autoScrollEnabled;
            const userOwnsViewport = visibleBars > 0 && (
                explicitUserPan
                || (this._replayUserOwnsViewport(chart) && !passivePlay)
            );
            if (userOwnsViewport
                && visibleBars <= 1
                && typeof chart._needsReplayHistoryLoadLeft === 'function'
                && chart._needsReplayHistoryLoadLeft()
                && typeof chart._scheduleReplayPanLoadLeft === 'function') {
                chart._scheduleReplayPanLoadLeft();
            }
            if (!userOwnsViewport && (needsScroll || this.autoScrollEnabled || passivePlay)) {
                const st = typeof this.getReplayAutoScrollState === 'function'
                    ? this.getReplayAutoScrollState(chart)
                    : null;
                if (needsRecovery && typeof chart._syncIndependentPanelViewportIfNeeded === 'function') {
                    chart._syncIndependentPanelViewportIfNeeded({
                        resetPriceScale: false,
                        render: false,
                    });
                } else if (st && Number.isFinite(st.offsetX)) {
                    if (!preserveViewport) {
                        chart.offsetX = st.offsetX;
                    }
                    chart._chartViewRestored = true;
                } else if (needsScroll && typeof chart.fitToView === 'function') {
                    chart._chartViewRestored = false;
                    chart.fitToView();
                }
            }
        }

        if (preserveViewport && Number.isFinite(savedOffsetX)) {
            chart.offsetX = savedOffsetX;
            if (Number.isFinite(savedCandleWidth) && savedCandleWidth > 0) {
                chart.candleWidth = savedCandleWidth;
            }
        }

        if (typeof chart.constrainOffset === 'function') chart.constrainOffset();
        try {
            this._scheduleReplayIndicatorRecalc();
        } catch (_indErr) { /* ignore */ }
        if (typeof chart.render === 'function') {
            if (passivePlay || lightPass) {
                chart.renderPending = false;
                chart.render();
            } else {
                chart.renderPending = true;
                chart.render();
            }
        }
        const tp = this.tickProgress || 0;
        if (chart.orderManager && typeof chart.orderManager.updatePositions === 'function'
                && (!lightPass || tp % 6 === 0)) {
            try { chart.orderManager.updatePositions(); } catch (_e) { /* ignore */ }
        }
        chart._mirrorLastFrameUsedParentRef = lightPass;
    }

    /**
     * Passive multichart panels: mirror forming-candle state for order SL/TP path checks only.
     * Does not start a local tick loop — tile A remains the sole playhead driver.
     */
    _syncMirrorAnimatingCandleState(detail, anim, pathTarget) {
        if (!anim || !Number.isFinite(Number(anim.t))) {
            this.animatingCandle = null;
            return;
        }
        if (detail && Number.isFinite(detail.tickElapsedMs)) {
            this.tickElapsedMs = Number(detail.tickElapsedMs);
        }
        if (detail && Number.isFinite(detail.tickProgress)) {
            this.tickProgress = Number(detail.tickProgress);
        }
        const formTs = Number(anim.t);
        const target = pathTarget && typeof pathTarget === 'object' ? pathTarget : {
            t: formTs,
            o: Number(anim.o),
            h: Number(anim.h),
            l: Number(anim.l),
            c: Number(anim.c),
            v: Number(anim.v) || 0,
        };
        this.animatingCandle = {
            target,
            open: Number(anim.o),
            high: Number(anim.h),
            low: Number(anim.l),
            close: Number(anim.c),
            t: formTs,
        };
    }

    /**
     * Same-pair, same-TF iframe panel: mirror the host's already-resampled
     * rawData/data by reference instead of re-slicing + resampling per frame.
     * Returns false (caller falls back to the resample path) when this panel is
     * the host, is an independent pair, the host TF differs, or host data is empty.
     * @returns {boolean}
     */
    _tryMirrorFrameFromParentData(chart, detail, ts, anim, hasAnim) {
        try {
            if (!chart
                || typeof chart._isMultichartEmbedPanel !== 'function'
                || !chart._isMultichartEmbedPanel()) {
                return false;
            }
            if (typeof window === 'undefined' || !window.parent || window.parent === window) {
                return false;
            }
            const parent = window.parent.chart;
            if (!parent || parent === chart) return false;

            const parentTf = String(parent.currentTimeframe || '').toLowerCase().trim();
            const myTf = String(chart.currentTimeframe || '').toLowerCase().trim();
            if (!parentTf || parentTf !== myTf) return false;

            const pData = parent.data;
            const pRaw = parent.rawData;
            if (!Array.isArray(pData) || pData.length === 0) return false;

            // Host updates these arrays in place every frame for the same replay
            // timestamp — sharing by reference is exactly what we want to paint.
            chart.rawData = pRaw;
            chart.data = pData;

            const preserveUntil = chart._multichartPreserveViewportUntil;
            const nowPv = (typeof performance !== 'undefined' && performance.now)
                ? performance.now()
                : Date.now();
            const preserveViewport = Number.isFinite(preserveUntil) && nowPv < preserveUntil;
            const passiveFollow = this.autoScrollEnabled && !this.userHasPanned && !preserveViewport;
            if (passiveFollow) {
                if (Number.isFinite(detail && detail.hostOffsetX)) {
                    chart.offsetX = Number(detail.hostOffsetX);
                } else if (Number.isFinite(parent.offsetX)) {
                    chart.offsetX = parent.offsetX;
                }
                chart._chartViewRestored = true;
            }

            const pIdx = Number(detail && detail.currentIndex);
            if (Number.isFinite(pIdx)) {
                this.currentIndex = Math.max(this.sessionStartIndex || 0, pIdx);
            }
            this.replayTimestamp = ts;
            if (Number.isFinite(detail && detail.tickElapsedMs)) {
                this.tickElapsedMs = Number(detail.tickElapsedMs);
            }
            if (Number.isFinite(detail && detail.tickProgress)) {
                this.tickProgress = Number(detail.tickProgress);
            }

            if (hasAnim) {
                const pathTarget = (Array.isArray(this.fullRawData)
                    && Number.isFinite(pIdx) && this.fullRawData[pIdx])
                    ? this.fullRawData[pIdx]
                    : null;
                this._syncMirrorAnimatingCandleState(detail, anim, pathTarget);
            } else {
                this.tickProgress = 0;
                this.animatingCandle = null;
            }

            if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();
            this._finishMultichartMirrorRender(chart, { lightPass: true });
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Multichart V9: apply one replay frame from parent tile A on this panel.
     * Resolves playhead by timestamp / forming-candle time — never copies parent index.
     * @returns {boolean} false when target bar is not in loaded fullRawData (caller may refetch)
     */
    applyMultichartMirrorFrame(detail) {
        if (!this.isActive || !detail || typeof detail !== 'object') return false;
        const chart = this.chart;
        const frd = this._resolveMirrorRawSeries(chart, detail);
        if (!chart || !Array.isArray(frd) || !frd.length) return false;

        const ts = Number(detail.timestamp);
        if (!Number.isFinite(ts)) return false;

        const sharesHostDataset = this._mirrorSharesHostDataset(chart, detail);
        const anim = detail.animatedCandle;
        const hasAnim = !!(anim && Number.isFinite(Number(anim.t)));

        // FAST PATH (iframe, same file + same TF as host): the host already
        // sliced + resampled this exact frame. Reuse its arrays by reference
        // instead of re-slicing + resampling per frame on every panel — this is
        // the single biggest replay-playback CPU saver in multichart.
        if (sharesHostDataset
            && this._tryMirrorFrameFromParentData(chart, detail, ts, anim, hasAnim)) {
            return true;
        }

        if (hasAnim && !sharesHostDataset) {
            const indep = this._buildIndependentPairAnimatedCandle(frd, ts, detail);
            if (!indep || !indep.candle) {
                if (detail._indepAnimFallback) return false;
                return this.applyMultichartMirrorFrame({
                    timestamp: detail.timestamp,
                    tickElapsedMs: detail.tickElapsedMs,
                    tickProgress: 0,
                    hostFileId: detail.hostFileId,
                    isPlaying: detail.isPlaying,
                    ticksPerCandle: detail.ticksPerCandle,
                    _indepAnimFallback: true,
                });
            }
            const baseIdx = Math.max(0, indep.formingIdx - 1);
            const sliced = frd.slice(0, baseIdx);
            sliced.push(indep.candle);
            chart.rawData = sliced;
            const tp = this.tickProgress || 0;
            // Independent panels resample 1m master → display TF; in-place last-bar
            // patches are only valid when display TF matches raw granularity (1m).
            chart.data = chart.resampleData(sliced, chart.currentTimeframe);
            if (typeof chart._trimLastDataBarToReplayPlayhead === 'function'
                && !(this.animatingCandle && (this.tickProgress || 0) > 0)) {
                chart._trimLastDataBarToReplayPlayhead();
            }
            if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();
            if (this.autoScrollEnabled && !this._replayUserOwnsViewport(chart) && tp > 0 && tp % 8 === 0 && chart.fitToView) {
                chart.fitToView();
            }
            const indepPathTarget = (indep.formingIdx >= 0 && frd[indep.formingIdx])
                ? frd[indep.formingIdx]
                : indep.candle;
            this._syncMirrorAnimatingCandleState(detail, anim, indepPathTarget);
            this._finishMultichartMirrorRender(chart);
            return true;
        }

        if (hasAnim) {
            const formTs = Number(anim.t);
            let targetIdx = -1;
            if (typeof chart.findGoToTargetIndex === 'function') {
                targetIdx = chart.findGoToTargetIndex(frd, formTs);
            }
            if (targetIdx < 0) {
                for (let i = 0; i < frd.length; i++) {
                    const bt = frd[i] && Number(frd[i].t);
                    if (Number.isFinite(bt) && Math.abs(bt - formTs) < 1000) {
                        targetIdx = i;
                        break;
                    }
                }
            }
            if (targetIdx < 0) return false;

            const baseIdx = Math.max(0, targetIdx - 1);
            this.currentIndex = Math.max(this.sessionStartIndex || 0, baseIdx);
            this.replayTimestamp = ts;
            if (Number.isFinite(detail.tickElapsedMs)) {
                this.tickElapsedMs = Number(detail.tickElapsedMs);
            }
            if (Number.isFinite(detail.tickProgress)) {
                this.tickProgress = Number(detail.tickProgress);
            }

            const animatedCandle = {
                t: formTs,
                o: Number(anim.o),
                h: Number(anim.h),
                l: Number(anim.l),
                c: Number(anim.c),
                v: Number(anim.v) || 0,
            };

            const sliced = frd.slice(0, targetIdx);
            sliced.push(animatedCandle);
            chart.rawData = sliced;

            const tp = this.tickProgress || 0;
            if (chart.data && chart.data.length > 0 && tp > 1) {
                const last = chart.data[chart.data.length - 1];
                last.h = Math.max(last.h, animatedCandle.h);
                last.l = Math.min(last.l, animatedCandle.l);
                last.c = animatedCandle.c;
                last.v = animatedCandle.v;
            } else {
                chart.data = chart.resampleData(sliced, chart.currentTimeframe);
                // During forming-candle animation, trim collapses the partial bar on
                // coarse TFs (15m+) back to the static playhead — skip until complete.
                if (typeof chart._trimLastDataBarToReplayPlayhead === 'function'
                    && !(this.animatingCandle && (this.tickProgress || 0) > 0)) {
                    chart._trimLastDataBarToReplayPlayhead();
                }
            }

            if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();
            if (this.autoScrollEnabled && !this._replayUserOwnsViewport(chart) && tp > 0 && tp % 8 === 0) {
                if (chart.fitToView) chart.fitToView();
            }
            const pathTarget = (Array.isArray(this.fullRawData) && targetIdx >= 0 && this.fullRawData[targetIdx])
                ? this.fullRawData[targetIdx]
                : ((targetIdx >= 0 && frd[targetIdx]) ? frd[targetIdx] : null);
            this._syncMirrorAnimatingCandleState(detail, anim, pathTarget);
        } else {
            const lastT = Number(frd[frd.length - 1]?.t);
            if (Number.isFinite(lastT) && ts > lastT) {
                return false;
            }

            this.tickElapsedMs = Number.isFinite(detail.tickElapsedMs)
                ? Number(detail.tickElapsedMs) : 0;
            this.tickProgress = 0;
            this.animatingCandle = null;

            let synced = false;
            if (sharesHostDataset && typeof this.syncCurrentIndexFromReplayTimestamp === 'function') {
                synced = this.syncCurrentIndexFromReplayTimestamp(ts);
            }
            if (!synced) {
                synced = this._syncMirrorPlayheadFromTimestamp(frd, ts);
            }
            if (!synced) {
                return false;
            }

            let sliceEnd;
            if (!sharesHostDataset) {
                sliceEnd = this._resolvePanelRawEndIndexForReplay(frd, ts) + 1;
            } else {
                sliceEnd = Math.max(this.currentIndex + 1, 1);
            }
            chart.rawData = frd.slice(0, sliceEnd);
            chart.data = chart.resampleData(chart.rawData, chart.currentTimeframe);
            if (typeof chart._trimLastDataBarToReplayPlayhead === 'function') {
                chart._trimLastDataBarToReplayPlayhead();
            }
            if (typeof chart.bumpDataVersion === 'function') chart.bumpDataVersion();
        }

        this._finishMultichartMirrorRender(chart);
        return true;
    }

    /**
     * Build replay frame payload for multichart mirror sync (host + iframes).
     */
    _buildMultichartReplayFrameDetail() {
        const detail = {
            timestamp: this.replayTimestamp,
            currentIndex: this.currentIndex,
            tickProgress: this.tickProgress,
            tickElapsedMs: this.tickElapsedMs,
            isPlaying: !!this.isPlaying,
            hostFileId: this.chart && this.chart.currentFileId != null
                ? String(this.chart.currentFileId)
                : null,
            ticksPerCandle: this.currentTicksPerCandle || this.ticksPerCandle || 72,
        };
        if (this.chart && this.autoScrollEnabled && !this.userHasPanned
                && Number.isFinite(this.chart.offsetX)) {
            detail.hostOffsetX = this.chart.offsetX;
        }
        if (this.animatingCandle && !this.fastMode && this.getPlaybackMode() === 'tick') {
            const ac = this.animatingCandle;
            detail.animatedCandle = {
                t: ac.t,
                o: ac.open,
                h: ac.high,
                l: ac.low,
                c: ac.close,
                v: ac.volume || 0,
            };
        }
        return detail;
    }

    /**
     * Multichart V9: parent tile A drives replay; host + iframe panels share one
     * mirror renderer (applyMultichartMirrorFrame) so tick animation matches.
     */
    _multichartBroadcastReplayFrame() {
        try {
            if (typeof window === 'undefined' || !window.__multichartGrid) return;
            if (!this.isActive) return;
            const detail = this._buildMultichartReplayFrameDetail();
            // Host tile A is already updated via updateChartData / updateChartWithAnimatedCandle.
            // Re-applying the static (non-animated) mirror on the host regresses currentIndex
            // after calculateNextIndex while iframes follow the broadcast — panel A lags B/C/D.
            const hasAnim = !!(detail.animatedCandle && Number.isFinite(Number(detail.animatedCandle.t)));
            if (hasAnim && typeof this.applyMultichartMirrorFrame === 'function') {
                this.applyMultichartMirrorFrame(detail);
            }
            if (typeof window.__multichartManagerBroadcastReplay === 'function') {
                window.__multichartManagerBroadcastReplay(detail);
            } else {
                window.dispatchEvent(new CustomEvent('replayMultichartFrame', { detail }));
            }
        } catch (_e) { /* ignore */ }
    }

    /**
     * After manual step forward/back while paused, mirror host playhead to iframe panels.
     * Play path already broadcasts every frame; paused steps only call updateChartData.
     */
    _syncMultichartAfterManualStep() {
        try {
            if (typeof window === 'undefined' || !window.__multichartGrid || !this.isActive) return;
            if (this.isPlaying) return;
            this._multichartBroadcastReplayFrame();
        } catch (_e) { /* ignore */ }
    }

    /**
     * Notify multichart iframes + forex news panel of virtual replay time.
     * V9 React replay bar has no legacy #replayCurrentTime — must not depend on timeLabel.
     */
    _dispatchReplayVirtualTimeChanged(displayTs) {
        if (!Number.isFinite(displayTs)) return;
        try {
            const sym = this.chart && this.chart.currentSymbol
                ? String(this.chart.currentSymbol)
                : '';
            window.dispatchEvent(new CustomEvent('replayVirtualTimeChanged', {
                detail: {
                    timestamp: displayTs,
                    symbol: sym,
                    currentIndex: this.currentIndex,
                }
            }));
        } catch (_e) { /* ignore */ }
    }

    /**
     * Update time display with TradingView-style format: (Day) YYYY-MM-DD HH:MM:SS
     * Uses timezone manager if available
     */
    updateTimeDisplay() {
        if (!this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        const displayTs = Number.isFinite(this.replayTimestamp)
            ? this.replayTimestamp
            : (this.fullRawData[this.currentIndex]?.t ?? null);
        if (!Number.isFinite(displayTs)) {
            return;
        }

        // Always broadcast — multichart B/C/D panels listen for this event.
        this._dispatchReplayVirtualTimeChanged(displayTs);

        if (!this.timeLabel) {
            return;
        }

        // Use timezone manager if available
        if (window.timezoneManager) {
            const timeStr = window.timezoneManager.formatTime(displayTs, 'full');
            this.timeLabel.textContent = timeStr;
            return;
        }

        // Fallback to local time
        const date = new Date(displayTs);
        
        // Get day of week abbreviation
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[date.getDay()];
        
        // Format date as YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        // Format time as HH:MM (24-hour, no seconds)
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        // Combine: (Day) YYYY-MM-DD HH:MM
        const timeStr = `(${dayName}) ${year}-${month}-${day} ${hours}:${minutes}`;

        this.timeLabel.textContent = timeStr;
    }

    /**
     * Update slider position
     */
    updateSlider() {
        if (!this.slider || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        this.slider.value = this.currentIndex;

        const progressFill = document.getElementById('replayProgressFill');
        if (progressFill) {
            const sliderMin = this.sessionStartIndex || 0;
            const range = Math.max(1, this.fullRawData.length - 1 - sliderMin);
            const percent = ((this.currentIndex - sliderMin) / range) * 100;
            progressFill.style.width = `${percent}%`;
        }
    }

    updateSliderRange() {
        if (!this.slider || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        const min = this.sessionStartIndex || 0;
        const max = Math.max(min, this.fullRawData.length - 1);
        this.slider.min = min;
        this.slider.max = max;
        this.slider.value = Math.max(Math.min(this.currentIndex, max), min);
    }

    /**
     * Order fills / SL-TP use one OrderManager; panel charts may defer to window.chart.
     * Matches chart.js `_getOrderManagerForSessionPersistence` fallback.
     * @param {object|null} [chartInstance]
     * @returns {object|null}
     */
    _resolveOrderManagerForReplayGuards(chartInstance) {
        const ch = chartInstance || this.chart;
        if (ch && ch.orderManager) return ch.orderManager;
        if (typeof window !== 'undefined' && window.chart && window.chart.orderManager) {
            return window.chart.orderManager;
        }
        return null;
    }

    /**
     * Handle timeframe change during replay
     * Uses VIRTUAL TIME to maintain consistent price across all timeframes
     * @param {Object} [initiatorChart] - Chart instance that called setTimeframe (defaults to main {@link #chart})
     * @param {Object} [options]
     * @param {Function} [options.onReady] - Called when resample + viewport are committed (lifts chart freeze overlay)
     */
    onTimeframeChange(initiatorChart, options = {}) {
        if (!this.isActive) {
            if (typeof options.onReady === 'function') {
                try { options.onReady(); } catch (_e) { /* ignore */ }
            }
            return;
        }

        // Rapid TF toggles: cancel a pending restore and run the latest switch (do not no-op).
        if (this._tfChangeRestoreTimer) {
            clearTimeout(this._tfChangeRestoreTimer);
            this._tfChangeRestoreTimer = null;
        }
        const changeSeq = ++this._tfChangeSeq;
        const onReady = typeof options.onReady === 'function' ? options.onReady : null;
        const signalReady = () => {
            if (changeSeq !== this._tfChangeSeq) return;
            if (onReady) {
                try { onReady(); } catch (_e) { /* ignore */ }
            }
        };

        const initiator = initiatorChart || this.chart;
        const isEmbedInitiator = typeof initiator._isMultichartEmbedPanel === 'function'
            && initiator._isMultichartEmbedPanel();

        // Follower panel (not the ReplaySystem's main chart ref): only resample/scroll that tile.
        if (initiator !== this.chart) {
            this._timeframeChanging = true;
            try {
                if (typeof this.syncPanelCharts === 'function') {
                    this.syncPanelCharts(true);
                }
                if (typeof initiator._ensureMultichartViewportVisible === 'function') {
                    initiator._ensureMultichartViewportVisible({
                        centerPlayhead: true,
                        resetPriceScale: true,
                        forceRecenter: true,
                        render: true,
                    });
                } else {
                    this.userHasPanned = false;
                    if (typeof this.syncReplayViewportToPlayhead === 'function') {
                        this.syncReplayViewportToPlayhead(initiator, {
                            centerPlayhead: true,
                            resetPriceScale: true,
                            forceRecenter: true,
                            render: false,
                        });
                    } else if (this.autoScrollEnabled) {
                        const st = this.getReplayAutoScrollState(initiator);
                        if (st) initiator.offsetX = st.offsetX;
                    }
                    if (typeof initiator.constrainOffset === 'function') {
                        initiator.constrainOffset();
                    }
                    initiator.renderPending = true;
                    if (typeof initiator.render === 'function') {
                        initiator.render();
                    }
                }
                const omFollow = this._resolveOrderManagerForReplayGuards(initiator);
                let followGuardTs = Number.isFinite(this.replayTimestamp) ? this.replayTimestamp : null;
                if (!Number.isFinite(Number(followGuardTs)) && this.fullRawData && typeof this.currentIndex === 'number') {
                    const fb = this.fullRawData[this.currentIndex];
                    followGuardTs = fb != null && Number.isFinite(fb.t) ? fb.t : null;
                }
                if (omFollow && typeof omFollow._refreshAllGuardsToTimestamp === 'function'
                    && Number.isFinite(Number(followGuardTs))) {
                    try { omFollow._refreshAllGuardsToTimestamp(Number(followGuardTs), Infinity); } catch (_gu) { /* ignore */ }
                } else if (omFollow && typeof omFollow._refreshAllGuardsToCurrentCandle === 'function') {
                    try { omFollow._refreshAllGuardsToCurrentCandle(); } catch (_gu2) { /* ignore */ }
                }
            } catch (e) {
                console.warn('replay onTimeframeChange (follower panel):', e);
            } finally {
                this._timeframeChanging = false;
                signalReady();
            }
            return;
        }

        // === LOCK during resample; unlock synchronously once bars + viewport are ready ===
        this._timeframeChanging = true;
        this._tfSwitchSkipHeavyIndicators = true;

        const wasPlaying = this.isPlaying;
        const savedSpeed = this.speed;

        const savedCurrentIndex = this.currentIndex;
        const savedTickProgress = this.tickProgress;
        const savedTickElapsedMs = this.tickElapsedMs;
        const activeAnimatedTs = (wasPlaying && this.animatingCandle && savedTickProgress > 0)
            ? this.animatingCandle.t
            : null;
        const savedReplayTimestamp = Number.isFinite(activeAnimatedTs)
            ? activeAnimatedTs
            : (Number.isFinite(this.replayTimestamp)
                ? this.replayTimestamp
                : (this.fullRawData[this.currentIndex]?.t ?? null));

        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        this.isPlaying = false;
        this.animatingCandle = null;

        const savedPriceOffset = this.chart.priceOffset;
        const savedPriceZoom = this.chart.priceZoom;

        const omPre = this._resolveOrderManagerForReplayGuards(this.chart);
        let guardTs = savedReplayTimestamp;
        if (!Number.isFinite(Number(guardTs))) {
            const rb = this.fullRawData && this.fullRawData[savedCurrentIndex];
            const tRaw = rb != null ? Number(rb.t) : NaN;
            guardTs = Number.isFinite(tRaw) ? tRaw : null;
        }
        // STRICT (Infinity): coarse TF resample must not fill pending orders / hit SL-TP on
        // already-elapsed playhead wicks (full 1H high/low includes unreplayed minutes).
        if (omPre && typeof omPre._refreshAllGuardsToTimestamp === 'function' && Number.isFinite(Number(guardTs))) {
            try { omPre._refreshAllGuardsToTimestamp(Number(guardTs), Infinity); } catch (_e) { /* ignore */ }
        } else if (omPre && typeof omPre._refreshAllGuardsToCurrentCandle === 'function') {
            try { omPre._refreshAllGuardsToCurrentCandle(); } catch (_e2) { /* ignore */ }
        }

        const restoreSavedPlayhead = () => {
            if (Number.isFinite(savedReplayTimestamp)
                && typeof this.syncCurrentIndexFromReplayTimestamp === 'function') {
                this.syncCurrentIndexFromReplayTimestamp(savedReplayTimestamp);
            } else {
                this.currentIndex = savedCurrentIndex;
                if (Number.isFinite(savedReplayTimestamp)) {
                    this.replayTimestamp = savedReplayTimestamp;
                } else if (this.fullRawData[this.currentIndex]) {
                    this.replayTimestamp = this.fullRawData[this.currentIndex].t;
                }
            }
            this._clampCurrentIndexToReplayTimestamp();
            this.tickProgress = savedTickProgress;
            this.tickElapsedMs = savedTickElapsedMs;
            if (!wasPlaying) {
                this.animatingCandle = null;
                this._savedTickState = null;
            }
        };

        restoreSavedPlayhead();

        try {
            this.updateChartData(false);
            if (!isEmbedInitiator) {
                this.chart.priceOffset = savedPriceOffset;
                this.chart.priceZoom = savedPriceZoom;
            }
            if (isEmbedInitiator && typeof this.chart._ensureMultichartViewportVisible === 'function') {
                // Match the single-chart TF-switch behavior in multichart panels:
                // re-frame the new timeframe on the replay playhead at the same
                // right-edge slot as the previous timeframe (centerPlayhead:false),
                // so switching TF in a panel always shows the same play position as
                // the one before — exactly like the host chart. Previously panels
                // used centerPlayhead:true (playhead centered), which made the panel
                // jump to a different on-screen position than the host on every TF
                // switch. forceRecenter still clears userHasPanned and the
                // blank-panel fallbacks inside _ensureMultichartViewportVisible
                // remain, so this can't leave a panel empty.
                const ok = this.chart._ensureMultichartViewportVisible({
                    centerPlayhead: false,
                    resetPriceScale: true,
                    forceRecenter: true,
                    render: true,
                });
                if (!ok && typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => {
                        this.chart._ensureMultichartViewportVisible({
                            centerPlayhead: false,
                            resetPriceScale: true,
                            forceRecenter: true,
                            render: true,
                        });
                    });
                }
            } else if (typeof this.syncReplayViewportToPlayhead === 'function') {
                const pendingVp = this.chart._tfSwitchViewport;
                const willRestoreViewport = pendingVp
                    && Number.isFinite(pendingVp.anchorTs);
                if (!willRestoreViewport) {
                    this.syncReplayViewportToPlayhead(this.chart, {
                        centerPlayhead: true,
                        resetPriceScale: false,
                        render: true,
                    });
                } else if (typeof this.chart.render === 'function') {
                    this.chart.renderPending = true;
                    this.chart.render();
                }
            } else if (typeof this.chart.render === 'function') {
                this.chart.renderPending = true;
                this.chart.render();
            }
            this.updateSlider();
            this.updateTimeDisplay();

            window.dispatchEvent(new CustomEvent('chartDataLoaded', {
                detail: {
                    chart: this.chart,
                    data: this.chart.data,
                    rawData: this.chart.rawData,
                    symbol: this.chart.currentSymbol,
                    timeframe: this.chart.currentTimeframe,
                },
            }));

            const omPost = this._resolveOrderManagerForReplayGuards(this.chart);
            if (omPost && typeof omPost._refreshAllGuardsToTimestamp === 'function' && Number.isFinite(Number(guardTs))) {
                try { omPost._refreshAllGuardsToTimestamp(Number(guardTs), Infinity); } catch (_e3) { /* ignore */ }
            }
        } catch (e) {
            console.warn('replay onTimeframeChange:', e);
        } finally {
            this._tfSwitchSkipHeavyIndicators = false;
            this._timeframeChanging = false;
            signalReady();
        }

        // Order checks only after playhead + walk-forward slice are restored (paused replay).
        if (!wasPlaying) {
            const guardTsAfter = Number.isFinite(Number(guardTs)) ? Number(guardTs) : null;
            const runPostTfFinalize = () => {
                if (changeSeq !== this._tfChangeSeq) return;
                restoreSavedPlayhead();
                try { this.updateChartData(false); } catch (_uc) { /* ignore */ }
                const omAfter = this._resolveOrderManagerForReplayGuards(this.chart);
                if (guardTsAfter != null && omAfter && typeof omAfter._refreshAllGuardsToTimestamp === 'function') {
                    try { omAfter._refreshAllGuardsToTimestamp(guardTsAfter, Infinity); } catch (_g) { /* ignore */ }
                }
                if (omAfter && typeof omAfter.updatePositions === 'function') {
                    try { omAfter.updatePositions(); } catch (_u) { /* ignore */ }
                }
            };
            if (typeof queueMicrotask === 'function') queueMicrotask(runPostTfFinalize);
            else setTimeout(runPostTfFinalize, 0);
        }

        // Defer play resume only — must not block TF unlock or overlay lift.
        if (wasPlaying) {
        this._tfChangeRestoreTimer = setTimeout(() => {
            this._tfChangeRestoreTimer = null;
            if (changeSeq !== this._tfChangeSeq) return;
            try {
                restoreSavedPlayhead();

                const nextCandle = this.fullRawData[this.currentIndex + 1];
                if (nextCandle && savedTickProgress > 0) {
                    const tickPath = this.getTickPath(nextCandle);
                    const pathIndex = Math.min(savedTickProgress - 1, tickPath.length - 1);
                    const currentPrice = pathIndex >= 0 ? tickPath[pathIndex] : nextCandle.o;

                    this.animatingCandle = {
                        target: nextCandle,
                        open: nextCandle.o,
                        high: Math.max(nextCandle.o, currentPrice),
                        low: Math.min(nextCandle.o, currentPrice),
                        close: currentPrice,
                        targetHigh: nextCandle.h,
                        targetLow: nextCandle.l,
                        targetClose: nextCandle.c,
                        volume: (nextCandle.v || 0) * (savedTickProgress / (this.ticksPerCandle || 72)),
                        targetVolume: nextCandle.v || 0,
                        t: nextCandle.t,
                        cachedPath: tickPath,
                    };

                    for (let i = 0; i <= pathIndex; i++) {
                        this.animatingCandle.high = Math.max(this.animatingCandle.high, tickPath[i]);
                        this.animatingCandle.low = Math.min(this.animatingCandle.low, tickPath[i]);
                    }

                    this.updateChartWithAnimatedCandle();
                }

                this._preserveTickProgress = true;
                this.speed = this.normalizeSpeed(savedSpeed);
                this.play();
            } catch (e) {
                console.warn('replay onTimeframeChange resume:', e);
            }
        }, 0);
        }
    }
    
    /**
     * Synchronize all panel charts with current replay position
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
     * Last raw bar index with t <= ts (sorted ascending by .t).
     * Used so every pair ends on the same wall-clock cut as main replayTimestamp.
     * @returns {number} index, or -1 if every bar has t > ts (no wall-clock overlap with replay time).
     */
    _findLastRawIndexAtOrBefore(data, ts) {
        if (!Array.isArray(data) || data.length === 0) return -1;
        if (!Number.isFinite(ts)) return Math.max(0, data.length - 1);
        let lo = 0;
        let hi = data.length - 1;
        let ans = -1;
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
        return ans;
    }

    /**
     * Last raw bar index with t < tExclusive (sorted ascending by .t).
     * Used for exclusive rollback cuts — hide the clicked candle and everything after.
     */
    _findLastRawIndexStrictlyBefore(data, tExclusive) {
        if (!Array.isArray(data) || data.length === 0) return -1;
        if (!Number.isFinite(tExclusive)) return Math.max(0, data.length - 1);
        let lo = 0;
        let hi = data.length - 1;
        let ans = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const t = data[mid]?.t || 0;
            if (t < tExclusive) {
                ans = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return ans;
    }

    /**
     * End index (inclusive) for a panel's raw series during replay when it has its own `_panelFullRawData`.
     * Always uses the same wall-clock cut as the main chart (`replayTimestamp`): last bar with t <= replayTs.
     * Progress-based fallbacks were removed — they desynced calendar dates across pairs. If no bar exists at/before
     * replay time (idx < 0), clamp to 0 so at least the series start shows; use overlapping session data for full sync.
     */
    _resolvePanelRawEndIndexForReplay(panelFullRawData, replayTs) {
        if (!Array.isArray(panelFullRawData) || panelFullRawData.length === 0) return 0;
        const idx = this._findLastRawIndexAtOrBefore(panelFullRawData, replayTs);
        if (idx < 0) return 0;
        return Math.min(idx, panelFullRawData.length - 1);
    }

    /**
     * Follower tiles should only ingest {@link #fullRawData} when they represent the **same dataset**
     * as `window.chart`. Otherwise sync used to overwrite a second pair with the main pair's bars
     * whenever `_panelFullRawData` was still empty — mixed prices and a collapsed Y-axis.
     */
    _panelSharesMainReplayDataset(pc, mainChart) {
        if (!pc || !mainChart) return false;
        const pf = pc.currentFileId != null && String(pc.currentFileId) !== '' ? String(pc.currentFileId) : '';
        const mf = mainChart.currentFileId != null && String(mainChart.currentFileId) !== '' ? String(mainChart.currentFileId) : '';
        if (pf && mf) return pf === mf;
        return false;
    }

    /**
     * Re-apply the replay prefix slice to the main chart (window.chart / panel 0).
     * refitMultiPanelViewports, layout open, and other hooks call {@link #syncPanelCharts} without
     * going through updateChartData — if we only update secondary panels, the main can keep a
     * merged/prefetched series and the Y-scale "explodes" (mixed price decades).
     * @param {Array} slicedRawData - same cut as fullRawData.slice(0, currentIndex + 1)
     */
    _realignMainChartWithReplaySlice(slicedRawData) {
        const mainChart = this.chart;
        if (!mainChart || !Array.isArray(slicedRawData) || slicedRawData.length === 0) return;
        const preserveViewport = this._viewportLockForPlayback
            || this._replayUserOwnsViewport(mainChart);
        try {
            if (!preserveViewport) {
                mainChart.priceZoom = 1;
                mainChart.priceOffset = 0;
                mainChart.autoScale = true;
                if (mainChart.priceScale) {
                    mainChart.priceScale.autoScale = true;
                    mainChart.priceScale.locked = false;
                }
                mainChart.manualCenterPrice = null;
                mainChart.manualRange = null;
            }
            mainChart._pendingChartViewSanityCheck = true;

            mainChart.rawData = slicedRawData;
            mainChart.data = mainChart.resampleData(slicedRawData, mainChart.currentTimeframe);
            if (typeof mainChart._trimLastDataBarToReplayPlayhead === 'function') {
                mainChart._trimLastDataBarToReplayPlayhead();
            }
            if (typeof mainChart.bumpDataVersion === 'function') mainChart.bumpDataVersion();
        } catch (e) {
            console.warn('replay: main chart resample in syncPanelCharts failed', e);
            return;
        }
        if (typeof mainChart.scheduleIndicatorRecalc === 'function') {
            try { mainChart.scheduleIndicatorRecalc('multichart-replay', { force: true }); } catch (_e) { /* ignore */ }
        } else if (typeof mainChart.recalculateIndicators === 'function') {
            try { mainChart.recalculateIndicators(); } catch (_e) { /* ignore */ }
        }
        if (mainChart.drawingManager && typeof mainChart.drawingManager.redrawAll === 'function') {
            try { mainChart.drawingManager.redrawAll(); } catch (_e) { /* ignore */ }
        }
        if (this.autoScrollEnabled && !this._replayUserOwnsViewport(mainChart)) {
            const st = this.getReplayAutoScrollState(mainChart);
            if (st) mainChart.offsetX = st.offsetX;
        }
        if (typeof mainChart.constrainOffset === 'function') {
            try { mainChart.constrainOffset(); } catch (_e) { /* ignore */ }
        }
        this._applyPlaybackViewportLock(mainChart);
        if (mainChart.orderManager && typeof mainChart.orderManager.updatePositions === 'function') {
            try { mainChart.orderManager.updatePositions(); } catch (_e) { /* ignore */ }
        }
        mainChart.renderPending = true;
        if (typeof mainChart.render === 'function') mainChart.render();
    }

    /**
     * Push the current replay slice to follower panel charts.
     * @param {boolean} [mainAlreadyAligned=false] - When true, {@link #updateChartData} or
     * {@link #updateChartDataFast} just set main rawData — skip re-touching panel 0.
     */
    syncPanelCharts(mainAlreadyAligned = false) {
        if (!window.panelManager || !window.panelManager.panels || window.panelManager.panels.length === 0) {
            return;
        }
        if (!this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        this._clampCurrentIndexToReplayTimestamp();
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        const slicedRawData = this.fullRawData.slice(0, sliceEnd);
        if (!mainAlreadyAligned && this.isActive) {
            this._realignMainChartWithReplaySlice(slicedRawData);
        }

        const replayTs = this.replayTimestamp;
        
        const mainChart = this.chart;
        const mainSymbol = mainChart ? mainChart.currentSymbol : null;
        const mainFileId = mainChart ? mainChart.currentFileId : null;
        
        window.panelManager.panels.forEach((panel, index) => {
            const pc = panel.chartInstance;
            if (!pc || !pc.isPanel) return;
            if (pc === mainChart) return;
            
            try {
                const hasOwnData = Array.isArray(pc._panelFullRawData) && pc._panelFullRawData.length > 0;
                let appliedSlice = false;
                const omPanel = pc.orderManager;
                const replayTsNum = Number(replayTs);
                const preArmPanelGuards = () => {
                    if (!omPanel || typeof omPanel._refreshAllGuardsToTimestamp !== 'function') return;
                    if (!Number.isFinite(replayTsNum)) return;
                    try {
                        omPanel._refreshAllGuardsToTimestamp(replayTsNum, -1);
                    } catch (_ePre) { /* ignore */ }
                };
                const postArmPanelGuards = () => {
                    if (!omPanel || typeof omPanel._refreshAllGuardsToCurrentCandle !== 'function') return;
                    try {
                        omPanel._refreshAllGuardsToCurrentCandle();
                    } catch (_ePost) { /* ignore */ }
                };

                // Same instrument/file as main: always use main's currentIndex slice. If we prefer
                // hasOwnData first, a refetched _panelFullRawData can have bar timestamps that still
                // pass "t <= replayTimestamp" for candles after the playhead — leaking forward data.
                if (this._panelSharesMainReplayDataset(pc, mainChart)) {
                    if (mainSymbol && pc.currentSymbol !== mainSymbol) {
                        pc.currentSymbol = mainSymbol;
                        pc.currentFileId = mainFileId;
                        if (typeof pc.updateChartTitle === 'function') pc.updateChartTitle(mainSymbol);
                        if (typeof pc.updateChartOHLCSymbol === 'function') pc.updateChartOHLCSymbol(mainSymbol);
                        pc.priceZoom = 1;
                        pc.priceOffset = 0;
                        pc.autoScale = true;
                        if (pc.priceScale) pc.priceScale.autoScale = true;
                        pc.manualCenterPrice = null;
                        pc.manualRange = null;
                        pc._chartViewRestored = false;
                    }
                    preArmPanelGuards();
                    pc.rawData = slicedRawData;
                    pc.data = pc.resampleData(slicedRawData, pc.currentTimeframe);
                    if (typeof pc._trimLastDataBarToReplayPlayhead === 'function') {
                        pc._trimLastDataBarToReplayPlayhead();
                    }
                    appliedSlice = true;
                } else if (hasOwnData) {
                    const idx = this._resolvePanelRawEndIndexForReplay(pc._panelFullRawData, replayTs);
                    const panelSlice = pc._panelFullRawData.slice(0, idx + 1);
                    preArmPanelGuards();
                    pc.rawData = panelSlice;
                    pc.data = pc.resampleData(panelSlice, pc.currentTimeframe);
                    if (typeof pc._trimLastDataBarToReplayPlayhead === 'function') {
                        pc._trimLastDataBarToReplayPlayhead();
                    }
                    appliedSlice = true;
                }

                if (!appliedSlice) {
                    return;
                }

                postArmPanelGuards();

                if (typeof pc.bumpDataVersion === 'function') pc.bumpDataVersion();
                
                if (typeof pc.scheduleIndicatorRecalc === 'function') {
                    try { pc.scheduleIndicatorRecalc('live-tick'); } catch (e) {}
                } else if (typeof pc.recalculateIndicators === 'function') {
                    try { pc.recalculateIndicators(); } catch (e) {}
                }
                
                if (this.autoScrollEnabled) {
                    const st = this.getReplayAutoScrollState(pc);
                    if (st) pc.offsetX = st.offsetX;
                }
                
                if (typeof pc.constrainOffset === 'function') pc.constrainOffset();
                
                pc.renderPending = true;
                pc.render();
                
            } catch (error) {
                console.error(`Error syncing panel ${index}:`, error);
            }
        });
    }
}

// Export for use in main chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReplaySystem;
}

if (typeof window !== 'undefined') {
    window.ReplaySystem = ReplaySystem;
}

// Debug function for console
window.debugReplay = function() {

};

// ─────────────────────────────────────────────────────────────────────────────
// Multi-panel replay diagnostics (opt-in)
//   In console:
//     __replayDiag()        → one-shot snapshot
//     __replayDiagOn()      → log per tick (throttled to ~1/sec)
//     __replayDiagOff()     → stop tick logging
// ─────────────────────────────────────────────────────────────────────────────
(function () {
    if (typeof window === 'undefined') return;

    function describeChart(c, label) {
        if (!c) return { label, missing: true };
        const data = Array.isArray(c.data) ? c.data : [];
        const raw = Array.isArray(c.rawData) ? c.rawData : [];
        const pfrd = Array.isArray(c._panelFullRawData) ? c._panelFullRawData : null;
        return {
            label,
            symbol: c.currentSymbol || null,
            fileId: c.currentFileId != null ? String(c.currentFileId) : null,
            tf: c.currentTimeframe || null,
            offsetX: Math.round(c.offsetX || 0),
            candleWidth: c.candleWidth,
            dataLen: data.length,
            firstT: data[0]?.t || null,
            lastT: data[data.length - 1]?.t || null,
            rawLen: raw.length,
            panelRawLen: pfrd ? pfrd.length : null,
            isPanel: !!c.isPanel,
            chartViewRestored: !!c._chartViewRestored,
            autoScroll: c.replaySystem ? !!c.replaySystem.autoScrollEnabled : null,
        };
    }

    window.__replayDiag = function () {
        const replay = window.chart && window.chart.replaySystem;
        const pm = window.panelManager;
        const out = {
            ts: new Date().toISOString(),
            replay: replay ? {
                isActive: !!replay.isActive,
                isPlaying: !!replay.isPlaying,
                currentIndex: replay.currentIndex,
                replayTimestamp: replay.replayTimestamp,
                replayTimestampISO: replay.replayTimestamp ? new Date(replay.replayTimestamp).toISOString() : null,
                fullRawDataLen: Array.isArray(replay.fullRawData) ? replay.fullRawData.length : 0,
                rawTimeframe: replay.rawTimeframe,
                fullRawFirstT: replay.fullRawData?.[0]?.t || null,
                fullRawLastT: replay.fullRawData?.[replay.fullRawData?.length - 1]?.t || null,
                tickProgress: replay.tickProgress,
                speed: replay.speed,
                autoScrollEnabled: replay.autoScrollEnabled,
                userHasPanned: replay.userHasPanned,
            } : null,
            main: describeChart(window.chart, 'main'),
            panels: pm && pm.panels
                ? pm.panels.map((p, i) => ({
                    index: i,
                    isMainChart: !!p.isMainChart,
                    timeframeMeta: p.timeframe,
                    ...describeChart(p.chartInstance, `panel${i}`),
                }))
                : null,
            sync: pm ? pm.syncSettings : null,
            layout: pm ? pm.currentLayout : null,
        };
        console.log('🩺 __replayDiag', out);
        return out;
    };

    let _diagTickHandle = null;
    let _diagLastLog = 0;
    window.__replayDiagOn = function (intervalMs) {
        const ms = Number.isFinite(intervalMs) ? intervalMs : 1000;
        window.__REPLAY_DIAG__ = true;
        if (_diagTickHandle) clearInterval(_diagTickHandle);
        _diagTickHandle = setInterval(() => {
            const now = Date.now();
            if (now - _diagLastLog < ms - 50) return;
            _diagLastLog = now;
            const replay = window.chart && window.chart.replaySystem;
            if (!replay || !replay.isActive) return;
            window.__replayDiag();
        }, Math.max(250, Math.floor(ms / 2)));
        console.log('🩺 replay diagnostics ON @', ms, 'ms');
    };
    window.__replayDiagOff = function () {
        window.__REPLAY_DIAG__ = false;
        if (_diagTickHandle) clearInterval(_diagTickHandle);
        _diagTickHandle = null;
        console.log('🩺 replay diagnostics OFF');
    };
})();
