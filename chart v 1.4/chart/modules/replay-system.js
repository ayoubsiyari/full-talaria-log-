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

        // === VIRTUAL TIME SYNC: Track replay position by timestamp, not index ===
        // This ensures all timeframes stay in sync when switching
        this.replayTimestamp = null;      // Current virtual replay time (milliseconds)
        this.replayStartTimestamp = null; // Starting timestamp of replay data
        this.replayEndTimestamp = null;   // Ending timestamp of replay data
        this.tickElapsedMs = 0;           // Elapsed milliseconds within current candle animation

        // Tick animation state
        this.tickAnimationEnabled = true;
        this.tickInterval = null;
        this.animatingCandle = null;
        this.tickProgress = 0;
        this.ticksPerCandle = 60; // 60 ticks = 60 frames for real-time (1 frame per second at 1x)
        this.realTimeMode = true; // Real-time mode: 1min candle = 60 seconds at 1x speed
        
        // === DETERMINISTIC TICK PATH CACHE ===
        // Pre-generated tick paths for each candle, keyed by timestamp
        // This ensures consistent tick animation across all timeframes
        this.tickPathCache = {};  // { timestamp: [price0, price1, ...price59] }
        this.tickPathCacheBuilt = false;
        this._prngSeed = 12345; // Seeded PRNG state
        this._nextCandleTimer = null; // Tracks the between-candle 50ms delay so it can be cancelled

        this.toolbar = null;
        this.handle = null;
        this.replayBtn = null;
        this.slider = null;
        this.timeLabel = null;
        this.followBtn = null;
        this.speedSelect = null;
        this.timeframeSelect = null;
        this.playPauseBtn = null;
        this.stepForwardBtn = null;
        this.stepBackwardBtn = null;
        this.exitBtn = null;
        this.playIcon = null;
        this.pauseIcon = null;
        this.playTextEl = null;
        this.pauseTextEl = null;
        this.toolbarVisible = false;

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

        this.init();
    }

    applyPersistedState(state) {
        if (!state || typeof state !== 'object') return;
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) return;

        try {
            const idxFromState = typeof state.currentIndex === 'number' && Number.isFinite(state.currentIndex)
                ? Math.floor(state.currentIndex)
                : null;

            let idx = null;
            if (idxFromState !== null) {
                idx = idxFromState;
            } else {
                const rawTs = state.replayTimestamp;
                let ts = null;
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

                if (ts !== null) {
                    idx = 0;
                    for (let i = 0; i < this.fullRawData.length; i++) {
                        const t = this.fullRawData[i]?.t;
                        const tn = typeof t === 'number' ? t : (typeof t === 'string' ? Date.parse(t) : NaN);
                        if (Number.isFinite(tn) && tn >= ts) {
                            idx = i;
                            break;
                        }
                        idx = i;
                    }
                }
            }

            if (idx !== null) {
                this.currentIndex = Math.min(Math.max(idx, 0), this.fullRawData.length - 1);
                this.replayTimestamp = this.fullRawData[this.currentIndex]?.t || this.replayTimestamp;
                this.tickElapsedMs = typeof state.tickElapsedMs === 'number' ? state.tickElapsedMs : 0;
                this.speed = typeof state.speed === 'number' ? state.speed : this.speed;
                this.isPlaying = false;
                // Sync speed bar UI to the restored speed so it doesn't mismatch on first play
                this.updateSpeedButtonUI(this.speed);
                if (typeof window.updateSpeedDisplay === 'function') {
                    window.updateSpeedDisplay(this.speed);
                }
                this.updateChartData(false);
            }
        } catch (e) {
            console.warn('⚠️ Failed to apply persisted replay state', e);
        }
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

        if (!this.toolbar || !this.handle || !this.replayBtn) {
            console.error('❌ Replay toolbar elements missing');
            return;
        }

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
            this.stepForwardBtn.addEventListener('click', () => this.stepForward());
        }

        if (this.stepBackwardBtn) {
            this.stepBackwardBtn.addEventListener('click', () => this.stepBackward());
        }

        if (this.exitBtn) {
            this.exitBtn.addEventListener('click', () => this.exitReplayMode());
        }
        
        if (this.goBackBtn) {
            console.log('✅ Go Back button found, attaching listener');
            this.goBackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('🔙 Go Back button clicked!');
                this.goBackToPickPoint();
            });
        } else {
            console.log('❌ Go Back button NOT found');
        }

        if (this.speedSelect) {
            this.speedSelect.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                this.setSpeed(Number.isFinite(value) ? value : 1);
            });
        }

        if (this.timeframeSelect) {
            this.timeframeSelect.addEventListener('change', (e) => {
                console.log(`⏱️ Replay timeframe changed to ${e.target.value}`);
            });
        }

        if (this.followBtn) {
            this.followBtn.addEventListener('click', () => this.enableAutoScroll());
        }
    }
    
    /**
     * Attach event listeners for speed selection buttons
     */
    attachSpeedButtonEvents() {
        if (!this.speedSelectBar) {
            console.log('⚠️ Speed select bar not found');
            return;
        }
        
        console.log('✅ Attaching speed button events');
        
        const buttons = this.speedSelectBar.querySelectorAll('.speed-option');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseFloat(btn.dataset.speed);
                if (!isNaN(speed)) {
                    this.setSpeed(speed);
                    this.updateSpeedButtonUI(speed);
                    console.log(`🎚️ Speed set to ${speed}x`);
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
            const targetIndex = Math.round(percent * (this.fullRawData.length - 1));
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
            cursor: pointer;
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
            localStorage.removeItem('replayToolbarClonePosition');
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
            stepForwardBtn.addEventListener('click', () => this.stepForward());
        }
        
        // Step backward
        const stepBackwardBtn = clone.querySelector('#replayStepBackward');
        if (stepBackwardBtn) {
            stepBackwardBtn.id = 'replayStepBackwardClone';
            stepBackwardBtn.addEventListener('click', () => this.stepBackward());
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
    }

    saveFloatingClonePosition(left, top) {
        try {
            localStorage.setItem('replayToolbarClonePosition', JSON.stringify({ left, top }));
        } catch (err) {
            console.warn('⚠️ Failed to save floating clone position', err);
        }
    }

    loadFloatingClonePosition() {
        try {
            const stored = localStorage.getItem('replayToolbarClonePosition');
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
            localStorage.setItem(this.storageKey, JSON.stringify(position));
        } catch (err) {
            console.warn('⚠️ Failed to save replay toolbar position', err);
        }
    }

    loadToolbarPosition() {
        if (!this.toolbar) return;
        try {
            const stored = localStorage.getItem(this.storageKey);
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
        this.togglePlayUI(this.isPlaying);
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

    togglePlayUI(isPlaying) {
        console.log(`🎮 togglePlayUI(${isPlaying})`);
        
        // Update the SPEED BAR play button (main play button)
        const speedBtn = document.getElementById('speedSliderPlayBtn');
        if (speedBtn) {
            if (isPlaying) {
                speedBtn.classList.add('playing');
            } else {
                speedBtn.classList.remove('playing');
            }
            
            // Click animation
            speedBtn.classList.add('btn-clicked');
            setTimeout(() => speedBtn.classList.remove('btn-clicked'), 150);
            
            console.log(`✅ Speed bar button updated - playing: ${isPlaying}`);
        }
        
        // Also update the old replayPlayPause button if it exists (for backwards compatibility)
        const oldBtn = document.getElementById('replayPlayPause');
        if (oldBtn) {
            const playIcon = oldBtn.querySelector('.play-icon');
            const pauseIcon = oldBtn.querySelector('.pause-icon');
            const playText = oldBtn.querySelector('.play-text');
            const pauseText = oldBtn.querySelector('.pause-text');
            
            if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
            if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
            if (playText) playText.style.display = isPlaying ? 'none' : 'inline';
            if (pauseText) pauseText.style.display = isPlaying ? 'inline' : 'none';
            
            oldBtn.classList.toggle('replay-playing', isPlaying);
            oldBtn.classList.toggle('replay-paused', !isPlaying);
        }
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
        
        console.log('🎯 Entering Pick Point Mode...');
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
        console.log('❌ Exiting Pick Point Mode');
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
                cursor: pointer;
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
        
        // Label showing date/time at cut point
        this.cutLineLabel = document.createElement('div');
        this.cutLineLabel.id = 'replayCutLineLabel';
        this.cutLineLabel.style.cssText = `
            position: absolute;
            top: 10px;
            background: #2196f3;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            white-space: nowrap;
            pointer-events: none;
            z-index: 45;
            opacity: 0;
            transition: opacity 0.1s;
        `;
        if (chartWrapper) {
            chartWrapper.appendChild(this.cutLineLabel);
        }
        
        // Bind mouse handlers
        this.onPickModeMouseMove = this.handlePickModeMouseMove.bind(this);
        this.onPickModeClick = this.handlePickModeClick.bind(this);
    }
    
    /**
     * Handle mouse move in pick mode
     */
    handlePickModeMouseMove(e) {
        if (!this.isPickingPoint) return;
        
        const wrapper = this.chartWrapper || document.getElementById('chartWrapper') || this.chart.canvas?.parentElement;
        if (!wrapper) return;
        
        const rect = wrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Only show in chart area
        if (x < this.chart.margin.l || x > this.chart.w - this.chart.margin.r) {
            if (this.cutLine) this.cutLine.attr('opacity', 0);
            if (this.cutLineLabel) this.cutLineLabel.style.opacity = '0';
            return;
        }
        
        // Update cut line position
        if (this.cutLine) {
            this.cutLine
                .attr('x1', x)
                .attr('x2', x)
                .attr('opacity', 1);
        }
        
        // Update overlay based on mode
        if (this.pickModeOverlay) {
            if (this.isGoingBack) {
                // Go back mode: shade area to the RIGHT (candles to be removed)
                const rightWidth = this.chart.w - x;
                this.pickModeOverlay.style.left = 'auto';
                this.pickModeOverlay.style.right = '0';
                this.pickModeOverlay.style.width = rightWidth + 'px';
            } else {
                // Normal pick mode: shade area to the right (future data)
                const rightWidth = this.chart.w - x;
                this.pickModeOverlay.style.width = rightWidth + 'px';
            }
        }
        
        // Find candle index at this x position
        const candleIndex = this.getCandleIndexAtX(x);
        if (candleIndex >= 0 && this.chart.data[candleIndex]) {
            const candle = this.chart.data[candleIndex];
            const date = new Date(candle.t);
            const dateStr = this.formatDateTime(date);
            
            if (this.cutLineLabel) {
                if (this.isGoingBack) {
                    this.cutLineLabel.textContent = `⏪ Go back to: ${dateStr}`;
                } else {
                    this.cutLineLabel.textContent = `▶ Start from: ${dateStr}`;
                }
                this.cutLineLabel.style.left = (x + 10) + 'px';
                this.cutLineLabel.style.opacity = '1';
            }
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
        
        console.log(`🎯 Replay start point selected: index ${candleIndex}`);
        
        // Exit pick mode
        this.exitPickPointMode();
        
        // Start replay at selected index
        this.startReplayAtIndex(candleIndex);
    }
    
    /**
     * Get candle index at x position
     */
    getCandleIndexAtX(x) {
        if (!this.chart.data) return -1;
        
        // Use the chart's pixelToDataIndex method for accurate conversion
        if (this.chart.pixelToDataIndex) {
            let index = Math.round(this.chart.pixelToDataIndex(x));
            index = Math.max(0, Math.min(this.chart.data.length - 1, index));
            return index;
        }
        
        // Fallback: Use xScale if pixelToDataIndex not available
        if (!this.chart.xScale) return -1;
        
        const chartX = x - this.chart.margin.l;
        const candleWidth = this.chart.xScale.bandwidth ? this.chart.xScale.bandwidth() : 
            (this.chart.w - this.chart.margin.l - this.chart.margin.r) / this.chart.data.length;
        
        let index = Math.floor(chartX / candleWidth) + (this.chart.startIndex || 0);
        index = Math.max(0, Math.min(this.chart.data.length - 1, index));
        
        return index;
    }
    
    /**
     * Start replay at a specific candle index
     */
    startReplayAtIndex(candleIndex) {
        // === PROTECT: Don't reinitialize if during timeframe change ===
        if (this._timeframeChanging) {
            console.log('⚠️ startReplayAtIndex called during timeframe change - ignoring');
            return;
        }
        
        // Find the corresponding index in rawData
        const candle = this.chart.data[candleIndex];
        if (!candle) return;
        
        const targetTime = candle.t;
        let rawIndex = this.chart.rawData.findIndex(c => c.t >= targetTime);
        if (rawIndex < 0) rawIndex = this.chart.rawData.length - 1;
        
        console.log(`🎬 Starting replay at raw index ${rawIndex} (time: ${new Date(targetTime).toLocaleString()})`);
        
        this.isActive = true;
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        
        // Store full datasets
        this.fullRawData = [...this.chart.rawData];
        this.fullData = [...this.chart.data];
        this.rawTimeframe = this.detectRawTimeframeFromData(this.fullRawData);
        this._fullRawDataMatchesTF = false;
        
        // Set current index and initialize virtual timestamp
        this.currentIndex = rawIndex;
        this.replayStartTimestamp = this.fullRawData[0].t;
        this.replayEndTimestamp = this.fullRawData[this.fullRawData.length - 1].t;
        this.replayTimestamp = this.fullRawData[rawIndex].t;
        this.tickElapsedMs = 0;
        
        // === BUILD DETERMINISTIC TICK PATH CACHE ===
        // Pre-generate tick paths for all candles using seeded random
        // This ensures consistent tick animation across all timeframes
        this.buildTickPathCache();
        
        // Apply any pending speed set before replay was entered
        if (window._pendingReplaySpeed != null) {
            this.speed = window._pendingReplaySpeed;
            window._pendingReplaySpeed = null;
            this.updateSpeedButtonUI(this.speed);
        }
        
        // Show replay controls
        this.showToolbar();
        this.updateSliderRange();
        
        // Filter data and render
        this.updateChartData();
        
        console.log(`✅ Replay Mode Active - Starting at bar ${this.currentIndex}/${this.fullRawData.length}`);
    }
    
    /**
     * Go back to pick a new start point (within current visible data)
     */
    goBackToPickPoint() {
        console.log('🔙 Go Back mode activated');
        
        // Stop playback if playing
        if (this.isPlaying) {
            this.stop();
        }
        
        // Keep replay active, just enter pick mode to select earlier point
        this.isPickingPoint = true;
        this.isGoingBack = true; // Flag to know we're in "go back" mode
        
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
        
        // Bind handlers FIRST before creating overlay
        this.onGoBackClick = this.handleGoBackClick.bind(this);
        this.onPickModeMouseMove = this.handlePickModeMouseMove.bind(this);
        
        // Create overlay for pick mode (but only on visible area)
        this.createGoBackOverlay();
        
        // Create cut line elements
        this.createCutLine();
        
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
        const overlayColor = isLightMode ? 'rgba(244, 246, 250, 0.96)' : 'rgba(236, 240, 246, 0.88)';
        
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
        const instruction = document.createElement('div');
        instruction.id = 'replayPickInstruction';
        instruction.style.cssText = `
            position: fixed;
            bottom: 82px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
            background: linear-gradient(135deg, rgba(31, 37, 56, 0.96) 0%, rgba(43, 52, 78, 0.95) 100%);
            border: 1px solid rgba(145, 189, 255, 0.75);
            color: #f3f6ff;
            padding: 9px 18px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.01em;
            z-index: 10000;
            box-shadow:
                0 10px 24px rgba(0, 0, 0, 0.42),
                0 0 0 1px rgba(103, 166, 255, 0.65),
                0 0 22px rgba(79, 140, 255, 0.9),
                0 0 44px rgba(79, 140, 255, 0.5);
            text-shadow:
                0 0 12px rgba(165, 199, 255, 0.85),
                0 0 4px rgba(165, 199, 255, 0.65);
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(8px);
        `;
        instruction.innerHTML = `
            <span>Click on chart to rewind to that point</span>
            <button id="cancelPickMode" style="
                background: rgba(22, 34, 58, 0.72);
                border: 1px solid rgba(145, 189, 255, 0.65);
                color: #f3f6ff;
                padding: 7px 14px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.01em;
                text-shadow: 0 0 8px rgba(165, 199, 255, 0.55);
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 16px rgba(79, 140, 255, 0.28);
                transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(42, 62, 102, 0.8)'; this.style.borderColor='rgba(174, 213, 255, 0.95)'" 
               onmouseout="this.style.background='rgba(22, 34, 58, 0.72)'; this.style.borderColor='rgba(145, 189, 255, 0.65)'">Cancel (ESC)</button>
        `;
        document.body.appendChild(instruction);
        
        // Animate in
        requestAnimationFrame(() => {
            instruction.style.opacity = '1';
            instruction.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        // Cancel button
        document.getElementById('cancelPickMode').addEventListener('click', () => {
            this.exitGoBackMode();
        });
        
        // ESC key to cancel
        this.escKeyHandler = (e) => {
            if (e.key === 'Escape' && this.isPickingPoint) {
                this.exitGoBackMode();
            }
        };
        document.addEventListener('keydown', this.escKeyHandler);
    }
    
    /**
     * Handle click in go back mode - rewind to this point
     */
    handleGoBackClick(e) {
        if (!this.isPickingPoint || !this.isGoingBack) return;
        
        const wrapper = this.chartWrapper || document.getElementById('chartWrapper') || this.chart.canvas?.parentElement;
        if (!wrapper) return;
        
        const rect = wrapper.getBoundingClientRect();
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
        
        // Get the candle time from current visible data
        const candle = this.chart.data[candleIndex];
        if (!candle) return;
        
        const targetTime = candle.t;
        
        // Find corresponding index in fullRawData - need exact match
        let newRawIndex = this.fullRawData.findIndex(c => c.t === targetTime);
        
        // If no exact match, find closest
        if (newRawIndex < 0) {
            newRawIndex = this.fullRawData.findIndex(c => c.t >= targetTime);
        }
        if (newRawIndex < 0) newRawIndex = 0;
        
        // We want to KEEP this candle and remove everything after
        // So we set currentIndex to newRawIndex + 1 (to include the clicked candle)
        newRawIndex = newRawIndex + 1;
        
        console.log(`⏪ Going back to index ${newRawIndex} (time: ${new Date(targetTime).toLocaleString()})`);
        
        // Flash effect on the cut line before transitioning
        if (this.cutLine) {
            this.cutLine
                .attr('stroke', '#4caf50')
                .attr('stroke-width', 2);
        }
        
        // Brief delay for visual feedback then update
        setTimeout(() => {
            // Exit go back mode
            this.exitGoBackMode();
            
            // Update current index to go back
            this.currentIndex = newRawIndex;
            
            // Update chart data with smooth transition
            this.updateChartData();
            
            // Update time display
            this.updateTimeDisplay();
        }, 150);
    }
    
    /**
     * Exit go back mode
     */
    exitGoBackMode() {
        console.log('❌ Exiting Go Back Mode');
        this.isPickingPoint = false;
        this.isGoingBack = false;
        
        // Reset button appearance
        if (this.replayBtn) {
            this.replayBtn.classList.remove('picking');
            this.replayBtn.style.background = '';
            this.replayBtn.style.borderColor = '';
        }
        
        // Reset cursor
        if (this.chartWrapper) {
            this.chartWrapper.style.cursor = '';
        }
        
        // Remove overlay, cut line and capture layer
        this.removePickModeElements();
    }
    
    /**
     * Remove pick mode elements
     */
    removePickModeElements() {
        // Remove cut line
        if (this.cutLine) {
            this.cutLine.remove();
            this.cutLine = null;
        }
        
        // Remove cut line label
        if (this.cutLineLabel) {
            this.cutLineLabel.remove();
            this.cutLineLabel = null;
        }
        
        // Remove overlay
        if (this.pickModeOverlay) {
            this.pickModeOverlay.remove();
            this.pickModeOverlay = null;
        }
        
        // Remove click capture layer
        if (this.clickCaptureLayer) {
            this.clickCaptureLayer.removeEventListener('mousemove', this.onPickModeMouseMove);
            this.clickCaptureLayer.removeEventListener('click', this.onGoBackClick);
            this.clickCaptureLayer.remove();
            this.clickCaptureLayer = null;
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
     * @param {Object} options - Optional configuration {startAtBeginning: boolean}
     */
    enterReplayMode(options = {}) {
        // === PROTECT: Don't reinitialize if already active or during timeframe change ===
        if (this.isActive) {
            console.log('⚠️ enterReplayMode called but replay already active - ignoring');
            return;
        }
        if (this._timeframeChanging) {
            console.log('⚠️ enterReplayMode called during timeframe change - ignoring');
            return;
        }
        
        if (!this.chart.rawData || this.chart.rawData.length === 0) {
            alert('Please load data first');
            return;
        }

        console.log('🎬 Entering Replay Mode...');
        console.log(`📊 Chart data: ${this.chart.rawData.length} candles in rawData`);
        
        // Ensure chart is ready to render
        this.chart.isLoading = false;
        
        this.isActive = true;
        
        // Reset auto-scroll state
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        
        // Check if this is backtesting mode (from URL or options)
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const isBacktesting = mode === 'backtest' || mode === 'propfirm' || options.startAtBeginning;
        
        if (isBacktesting) {
            // Start at first candle for backtesting
            this.currentIndex = Math.min(10, this.chart.rawData.length - 1); // Show first 10 candles for context
            console.log(`📍 ${mode} mode: Starting at first candle`);
        } else {
            // Normal replay: start at 10% for context
            this.currentIndex = Math.floor(this.chart.rawData.length * 0.1);
            console.log('📍 Normal mode: Starting at 10% of data');
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

        // Apply persisted replay state (if loaded earlier) once fullRawData exists
        try {
            const pending = this.chart && this.chart._pendingReplayState ? this.chart._pendingReplayState : null;
            if (pending && typeof this.applyPersistedState === 'function') {
                this.applyPersistedState(pending);
                this.chart._pendingReplayState = null;
            }
        } catch (e) {}
        
        console.log(`💾 Stored ${this.fullRawData.length} candles, starting at index ${this.currentIndex}`);
        console.log(`⏱️ Virtual time: ${new Date(this.replayTimestamp).toISOString()}`);
        
        // === BUILD DETERMINISTIC TICK PATH CACHE ===
        // Pre-generate tick paths for all candles using seeded random
        // This ensures consistent tick animation across all timeframes
        this.buildTickPathCache();
        
        // Apply any pending speed set before replay was entered
        if (window._pendingReplaySpeed != null) {
            this.speed = window._pendingReplaySpeed;
            window._pendingReplaySpeed = null;
            this.updateSpeedButtonUI(this.speed);
        }
        
        // Show replay controls
        this.showToolbar();
        this.updateSliderRange();
        
        // Filter data and render
        this.updateChartData();
        
        console.log(`✅ Replay Mode Active - Starting at bar ${this.currentIndex}/${this.fullRawData.length}`);
    }

    /**
     * Exit replay mode
     */
    exitReplayMode() {
        console.log('🛑 Exiting Replay Mode...');
        
        this.isActive = false;
        this.stop();

        const floatingClone = document.getElementById('replayToolbarClone');
        if (floatingClone) {
            floatingClone.remove();
            localStorage.removeItem('replayToolbarClonePosition');
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
            
            if (typeof this.chart.recalculateIndicators === 'function') {
                this.chart.recalculateIndicators();
            }
            if (this.chart.drawingManager && typeof this.chart.drawingManager.redrawAll === 'function') {
                this.chart.drawingManager.redrawAll();
            }
            
            this.chart.scheduleRender();
        }
        
        // Hide control bar
        this.hideToolbar();
        
        console.log('✅ Replay Mode Exited');
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
        
        console.log(`🔄 Updating chart data to index ${this.currentIndex} of ${this.fullRawData.length}`);
        
        // Ensure currentIndex is valid
        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.fullRawData.length) this.currentIndex = this.fullRawData.length - 1;

        this.updateSliderRange();
        
        // Slice rawData to current position (minimum 1 candle)
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        this.chart.rawData = this.fullRawData.slice(0, sliceEnd);
        
        console.log(`📊 Sliced to ${this.chart.rawData.length} candles (from 0 to ${sliceEnd})`);
        
        if (this.chart.rawData.length === 0) {
            console.error('❌ Sliced data is empty! Restoring full data...');
            this.chart.rawData = [...this.fullRawData];
            return;
        }
        
        // Resample for current timeframe
        try {
            this.chart.data = this.chart.resampleData(this.chart.rawData, this.chart.currentTimeframe);
            if (typeof this.chart.bumpDataVersion === 'function') {
                this.chart.bumpDataVersion();
            }
        } catch (error) {
            console.error('❌ Error resampling data:', error);
            return;
        }
        
        // Recalculate indicators
        if (typeof this.chart.recalculateIndicators === 'function') {
            try {
                this.chart.recalculateIndicators();
            } catch (error) {
                console.warn('⚠️ Error recalculating indicators:', error);
            }
        }
        if (this.chart.drawingManager && typeof this.chart.drawingManager.redrawAll === 'function') {
            this.chart.drawingManager.redrawAll();
        }
        
        // Auto-scroll to show the latest candles (only if enabled and user hasn't manually panned)
        if (autoScroll && this.autoScrollEnabled) {
            const candleSpacing = this.chart.getCandleSpacing ? this.chart.getCandleSpacing() : 
                                 (this.chart.candleWidth + (this.chart.candleGap || 2));
            const m = this.chart.margin || { l: 0, r: 70 };
            const chartAreaW = this.chart.w - m.l - m.r;
            const numVisibleCandles = Math.floor(chartAreaW / candleSpacing);
            
            // Position offsetX so the latest candles are visible on the right side
            // Show last ~80% of visible area filled with candles (keeps last candle near right edge)
            const scrollPosition = Math.max(0, this.chart.data.length - Math.floor(numVisibleCandles * 0.8));
            this.chart.offsetX = -scrollPosition * candleSpacing;
            
            console.log(`📍 Auto-scroll: data=${this.chart.data.length}, visible=${numVisibleCandles}, offset=${this.chart.offsetX}`);
        } else {
            console.log(`📍 Keeping current view position (no auto-scroll)`);
        }
        
        // Update UI elements
        this.updateTimeDisplay();
        this.updateSlider();
        
        // Ensure chart is ready to render
        this.chart.isLoading = false;
        
        // Apply constraints
        if (typeof this.chart.constrainOffset === 'function') {
            this.chart.constrainOffset();
        }
        
        // Force render
        console.log('🎨 Forcing render at index', this.currentIndex);
        console.log('   - data.length:', this.chart.data.length);
        console.log('   - offsetX:', this.chart.offsetX);
        console.log('   - renderPending:', this.chart.renderPending);
        console.log('   - isLoading:', this.chart.isLoading);
        
        this.chart.renderPending = true;
        this.chart.render();
        
        console.log('   - render() called');
        
        // Force a reflow to commit the canvas changes
        if (this.chart.canvas) {
            void this.chart.canvas.offsetHeight;
            
            // Force canvas to flush by reading a pixel
            if (this.chart.ctx) {
                try {
                    void this.chart.ctx.getImageData(0, 0, 1, 1);
                } catch (e) {}
            }
        }

        setTimeout(() => {
            this.chart.renderPending = true;
            console.log('   - renderPending set again via setTimeout');
        }, 0);
        
        requestAnimationFrame(() => {
            this.chart.renderPending = true;
            console.log('   - renderPending set again via RAF');
        });
        
        // Update order manager positions after each candle
        if (this.chart.orderManager && typeof this.chart.orderManager.updatePositions === 'function') {
            this.chart.orderManager.updatePositions();
        }
        
        // Update follow button visibility based on whether last candle is visible
        this.updateAutoScrollIndicator();

        // Persist replay state per session
        if (this.chart && typeof this.chart.scheduleSessionStateSave === 'function' && this.isActive) {
            this.chart.scheduleSessionStateSave({
                replay: {
                    replayTimestamp: this.replayTimestamp,
                    currentIndex: this.currentIndex,
                    tickElapsedMs: this.tickElapsedMs,
                    speed: this.speed,
                    timeframe: this.chart.currentTimeframe,
                    isActive: true
                }
            });
        }
        
        console.log('✅ Chart update complete for index', this.currentIndex, '/', this.fullRawData.length);
    }

    /**
     * Toggle play/pause - debounced to prevent rapid toggling issues
     */
    togglePlay() {
        // Prevent rapid toggling (debounce 50ms - shorter for better responsiveness)
        const now = Date.now();
        if (this._lastToggleTime && (now - this._lastToggleTime) < 50) {
            console.log('⏸️ Toggle debounced, ignoring rapid call');
            return;
        }
        this._lastToggleTime = now;
        
        // Read current state and toggle
        const wasPlaying = this.isPlaying;
        console.log(`🔄 togglePlay called - wasPlaying: ${wasPlaying}`);
        
        if (wasPlaying) {
            this.pause();
        } else {
            this.play();
        }
        
        // Force sync UI to actual state after toggle (immediate)
        this.syncPlayPauseUI();
        
        // Also sync after a brief delay to catch any race conditions
        setTimeout(() => this.syncPlayPauseUI(), 20);
    }
    
    /**
     * Force sync play/pause button UI to actual isPlaying state
     */
    syncPlayPauseUI() {
        this.togglePlayUI(this.isPlaying);
        console.log(`🔄 UI synced to isPlaying: ${this.isPlaying}`);
    }

    /**
     * Start playback - tick animation for 0.5x, candle-by-candle for 1x+
     */
    play() {
        if (!this.isActive) {
            console.log('⚠️ Cannot play - replay not active');
            this.syncPlayPauseUI();
            return;
        }
        
        // Check if we're RESUMING from pause (have existing animation state)
        const isResuming = this.animatingCandle && this.tickProgress > 0;
        if (isResuming) {
            this._preserveTickProgress = true;
            console.log(`▶️ RESUMING from tick ${this.tickProgress}, price=${this.animatingCandle.close}`);
        }
        
        // Stop any existing playback first (will preserve state if _preserveTickProgress is set)
        this.stopAllPlayback();
        
        this.isPlaying = true;
        
        // Update button UI immediately
        this.togglePlayUI(true);
        
        // Always use tick animation for realistic candle building effect
        this.showTickProgress(false);
        this.startTickAnimation();
        
        if (!isResuming) {
            console.log(`▶️ Playing at ${this.speed}x speed with TICK animation`);
        }
    }
    
    /**
     * Stop all playback intervals and animations
     */
    stopAllPlayback() {
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
    startCandleByCandle() {
        if (!this.isActive || !this.isPlaying) {
            console.log('⚠️ Cannot start candle-by-candle - not active or not playing');
            this.syncPlayPauseUI();
            return;
        }
        
        console.log('🎬 Starting candle-by-candle mode at speed:', this.speed);
        
        // Calculate interval based on speed (candles per second)
        const interval = Math.max(20, 1000 / this.speed); // Min 20ms
        console.log('⏱️ Candle interval:', interval, 'ms');
        
        // Start immediately with first step
        this.simpleStepForward();
        
        this.playInterval = setInterval(() => {
            // Double-check state on each tick
            if (!this.isPlaying || !this.isActive) {
                clearInterval(this.playInterval);
                this.playInterval = null;
                this.syncPlayPauseUI();
                return;
            }
            
            if (this.currentIndex >= this.fullRawData.length - 1) {
                this.pause();
                return;
            }
            
            this.simpleStepForward();
        }, interval);
    }
    
    /**
     * Simple step forward - advances based on selected timeframe (respects sync dropdown)
     */
    simpleStepForward() {
        if (this._timeframeChanging) return;
        if (this.currentIndex >= this.fullRawData.length - 1) {
            // Before giving up, try to trigger pan-loading for more data
            if (this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
                console.log('⏳ Reached end of loaded data, requesting more...');
                this.chart.checkViewportLoadMore('forward');
                return; // Don't pause — data will arrive and we can continue
            }
            console.log('⏭️ Reached end of all data');
            this.pause();
            return;
        }
        
        // Proactively request more data when within 2000 candles of the end
        if (this.fullRawData.length - this.currentIndex < 2000 && 
            this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
            this.chart.checkViewportLoadMore('forward');
        }
        
        // Get the target index respecting timeframe selection
        const oldIndex = this.currentIndex;
        const targetIndex = this.calculateNextIndex();
        console.log(`🎯 simpleStepForward: ${oldIndex} -> ${targetIndex} (jumped ${targetIndex - oldIndex} candles)`);
        this.currentIndex = targetIndex;
        
        // === UPDATE VIRTUAL TIME: Sync replayTimestamp with new position ===
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        
        this.updateChartData(this.autoScrollEnabled);
    }
    
    /**
     * Calculate the next index based on selected timeframe (used by both play and step)
     */
    calculateNextIndex() {
        if (this.currentIndex >= this.fullRawData.length - 1) {
            return this.fullRawData.length - 1;
        }
        
        // Get timeframe from hidden select OR from the visible dropdown's selected option
        let selectedTimeframe = null;
        
        // Try hidden select first
        const hiddenSelect = this.timeframeSelect || document.getElementById('replayTimeframe');
        if (hiddenSelect && hiddenSelect.value) {
            selectedTimeframe = hiddenSelect.value;
        }
        
        // If not found, try reading from visible dropdown's selected option
        if (!selectedTimeframe) {
            const selectedOption = document.querySelector('#timeframeMenu .timeframe-option.selected');
            if (selectedOption) {
                selectedTimeframe = selectedOption.getAttribute('data-value');
            }
        }
        
        console.log(`📊 calculateNextIndex - selectedTimeframe: "${selectedTimeframe}"`);
        
        // If "sync" is selected, use the chart's current timeframe
        if (selectedTimeframe === 'sync') {
            selectedTimeframe = this.chart.currentTimeframe;
            console.log(`📊 Sync mode - using chart timeframe: ${selectedTimeframe}`);
        }
        
        if (!selectedTimeframe) {
            // No timeframe selector - advance by one raw candle
            console.log(`📊 No timeframe selected, advancing by 1`);
            return this.currentIndex + 1;
        }
        
        // Convert timeframe to milliseconds
        const tfMs = this.timeframeToMs(selectedTimeframe);
        console.log(`📊 Timeframe "${selectedTimeframe}" = ${tfMs}ms`);
        if (!tfMs) {
            return this.currentIndex + 1;
        }
        
        // Get current candle timestamp
        const currentTimestamp = this.fullRawData[this.currentIndex].t;
        
        // Calculate target timestamp (next timeframe boundary)
        const targetTimestamp = currentTimestamp + tfMs;
        
        // Check raw data candle interval (time between first two candles)
        let rawCandleIntervalMs = 60000; // default 1 minute
        if (this.fullRawData.length > 1) {
            rawCandleIntervalMs = this.fullRawData[1].t - this.fullRawData[0].t;
        }
        
        // Calculate how many raw candles to skip
        const candlesToSkip = Math.max(1, Math.round(tfMs / rawCandleIntervalMs));
        const targetIndex = Math.min(this.currentIndex + candlesToSkip, this.fullRawData.length - 1);
        
        console.log(`📊 Raw candle interval: ${rawCandleIntervalMs}ms, Skip ${candlesToSkip} candles, target index: ${targetIndex}`);
        
        return targetIndex;
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

        if (this.fullRawData.length - this.currentIndex < 2000 &&
            this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
            this.chart.checkViewportLoadMore('forward');
        }
        
        if (this.currentIndex >= this.fullRawData.length - 1) {
            if (this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
                this.chart.checkViewportLoadMore('forward');
                this._nextCandleTimer = setTimeout(() => {
                    this._nextCandleTimer = null;
                    if (this.isPlaying) this.startTickAnimation();
                }, 120);
                return;
            }
            this.pause();
            return;
        }
        
        // Determine timeframe for speed calculations
        let candleTimeframeMs = 60000; // Default 1 minute
        
        // Priority 1: Use chart's current timeframe setting (most reliable)
        if (this.chart.currentTimeframe) {
            candleTimeframeMs = this.timeframeToMs(this.chart.currentTimeframe) || 60000;
            console.log(`📊 Using chart timeframe: ${this.chart.currentTimeframe} = ${candleTimeframeMs}ms`);
        }
        // Priority 2: Detect from resampled display data (chart.data)
        else if (this.chart.data && this.chart.data.length > 1) {
            candleTimeframeMs = this.chart.data[1].t - this.chart.data[0].t;
            console.log(`📊 Detected from display data: ${candleTimeframeMs}ms`);
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
        const rawCandlesPerSecond = this.speed / rawCandleTimeframeSec;
        
        // Calculate how long each raw candle should take in REAL time
        const realTimeCandleDuration = rawCandleTimeframeMs / this.speed;
        
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
            
            console.log(`🚀 FAST MODE: Speed=${this.speed}x, ${rawCandlesPerSecond.toFixed(1)} raw candles/sec, ${this.candlesPerFrame} candles/frame, ${this.fastModeInterval}ms interval`);
            
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
            console.log(`🎬 startTickAnimation - _preserveTickProgress=${this._preserveTickProgress}, hasAnimatingCandle=${!!this.animatingCandle}, tickProgress=${this.tickProgress}`);
            
            if (!this._preserveTickProgress || !this.animatingCandle) {
                // Create new animating candle from scratch
                console.log(`   🆕 Creating NEW animatingCandle (preserve=${this._preserveTickProgress}, existing=${!!this.animatingCandle})`);
                this.animatingCandle = {
                    target: targetCandle,
                    open: targetCandle.o,
                    high: targetCandle.o,
                    low: targetCandle.o,
                    close: targetCandle.o,
                    targetHigh: targetCandle.h,
                    targetLow: targetCandle.l,
                    targetClose: targetCandle.c,
                    volume: 0,
                    targetVolume: targetCandle.v || 0,
                    t: targetCandle.t
                };
                this.tickProgress = 0;
                this.tickElapsedMs = 0;
            } else {
                // Keep existing animatingCandle and tickProgress
                console.log(`   ♻️ KEEPING existing animatingCandle (close=${this.animatingCandle.close}, tickProgress=${this.tickProgress})`);
            }
            
            this._preserveTickProgress = false;
            
            // Use 60 ticks for smooth animation
            this.currentTicksPerCandle = 60;
            
            // Base tick interval = candle duration / ticks
            const baseTickInterval = Math.max(16, realTimeCandleDuration / this.currentTicksPerCandle);
            
            // VOLUME-WEIGHTED TICK SPEED
            const volumeMultiplier = this.calculateVolumeMultiplier(targetCandle, nextIndex);
            
            this.volumeTickData = {
                baseInterval: baseTickInterval,
                volumeMultiplier: volumeMultiplier,
                candleVolume: targetCandle.v || 0,
                tickVolumes: this.generateVolumeDistribution(60, volumeMultiplier, targetCandle.t)
            };
            
            console.log(`🎬 SMOOTH MODE: Speed=${this.speed}x, Duration=${realTimeCandleDuration.toFixed(0)}ms, Interval=${baseTickInterval.toFixed(0)}ms`);
        }
        
        // Clear any existing tick interval
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        
        // Start tick/frame animation
        this.scheduleNextTick();
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
        
        console.log(`📊 Volume: ${targetCandle.v.toFixed(0)}, Avg: ${avgVolume.toFixed(0)}, Ratio: ${volumeRatio.toFixed(2)}, SpeedMult: ${multiplier.toFixed(2)}`);
        
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
    scheduleNextTick() {
        if (!this.isPlaying) {
            return;
        }
        
        // FAST MODE: Use calculated interval (variable for 1-60 candles/sec, 16ms for >60)
        if (this.fastMode) {
            const interval = this.fastModeInterval || 16;
            this.tickInterval = setTimeout(() => {
                this.animateTick();
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
            this.animateTick();
            
            // Schedule next tick if still animating
            if (this.isPlaying && this.animatingCandle && 
                this.tickProgress < (this.currentTicksPerCandle || 60)) {
                this.scheduleNextTick();
            }
        }, tickInterval);
    }
    
    /**
     * Animate a single tick using CACHED deterministic tick paths
     * Uses pre-generated tick paths for consistent animation across all timeframes
     * In FAST MODE: completes multiple candles per frame
     */
    animateTick() {
        if (!this.isPlaying) {
            this.stopTickAnimation();
            return;
        }
        
        // FAST MODE: Complete candles without tick animation
        if (this.fastMode) {
            this.animateFastMode();
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
            
            // Update volume progressively (use seeded random for consistency)
            const seededRandom = this.createSeededRandom(tc.t + this.tickProgress);
            target.volume = target.targetVolume * progress * (0.8 + seededRandom() * 0.4);
            
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
        if (this.tickProgress >= (this.currentTicksPerCandle || this.ticksPerCandle)) {
            this.completeTickAnimation();
        }
    }
    
    /**
     * FAST MODE: Complete multiple candles per frame for high-speed playback
     * Used when speed >= 60x (1 or more raw candles per second)
     */
    animateFastMode() {
        const candlesToComplete = this.candlesPerFrame || 1;
        
        for (let i = 0; i < candlesToComplete; i++) {
            // Check bounds
            if (this.currentIndex >= this.fullRawData.length - 1) {
                if (this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
                    this.chart.checkViewportLoadMore('forward');
                    if (this.isPlaying) {
                        setTimeout(() => {
                            if (this.isPlaying) this.animateFastMode();
                        }, 120);
                    }
                    return;
                }
                this.pause();
                return;
            }
            
            // Advance to next candle
            this.currentIndex++;
            
            // Update virtual time
            if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            }
        }
        
        // Reset tick state
        this.tickElapsedMs = 0;
        this.tickProgress = 0;
        this.animatingCandle = null;
        
        // Update chart - use lightweight update for FAST MODE
        this.updateChartDataFast();
        
        // Schedule next frame
        if (this.isPlaying) {
            this.scheduleNextTick();
        }
    }
    
    /**
     * Lightweight chart update for FAST MODE
     * Shows forming candle animation on non-1m timeframes
     */
    updateChartDataFast() {
        if (!this.fullRawData || this.fullRawData.length === 0) return;
        
        // Ensure currentIndex is valid
        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.fullRawData.length) this.currentIndex = this.fullRawData.length - 1;

        // Keep fast-mode rendering aligned with canonical resampleData()
        // so OHLC is identical to normal replay updates for all timeframes.
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        const slicedRaw = this.fullRawData.slice(0, sliceEnd);
        this.chart.rawData = slicedRaw;
        this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);
        
        // Bump data version
        if (typeof this.chart.bumpDataVersion === 'function') {
            this.chart.bumpDataVersion();
        }
        
        // Recalculate indicators
        if (typeof this.chart.recalculateIndicators === 'function') {
            try {
                this.chart.recalculateIndicators();
            } catch (error) {
                // Silent fail for performance
            }
        }
        
        // Auto-scroll if enabled
        if (this.autoScrollEnabled) {
            const candleSpacing = this.chart.getCandleSpacing ? this.chart.getCandleSpacing() : 
                                 (this.chart.candleWidth + (this.chart.candleGap || 2));
            const m = this.chart.margin || { l: 0, r: 70 };
            const chartAreaW = this.chart.w - m.l - m.r;
            const numVisibleCandles = Math.floor(chartAreaW / candleSpacing);
            const scrollPosition = Math.max(0, this.chart.data.length - Math.floor(numVisibleCandles * 0.8));
            this.chart.offsetX = -scrollPosition * candleSpacing;
        }
        
        // Update UI
        this.updateSlider();
        this.updateTimeDisplay();
        
        // Render
        this.chart.isLoading = false;
        if (typeof this.chart.constrainOffset === 'function') {
            this.chart.constrainOffset();
        }
        this.chart.renderPending = true;
        this.chart.render();
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
        
        console.log(`🔧 Building tick path cache for ${this.fullRawData.length} candles...`);
        const startTime = performance.now();
        
        this.tickPathCache = {};
        
        for (const candle of this.fullRawData) {
            // Use candle timestamp as seed for deterministic generation
            const path = this.generateRandomPath(candle.o, candle.h, candle.l, candle.c, 60, candle.t);
            this.tickPathCache[candle.t] = path;
        }
        
        this.tickPathCacheBuilt = true;
        const elapsed = performance.now() - startTime;
        console.log(`✅ Tick path cache built in ${elapsed.toFixed(1)}ms (${this.fullRawData.length} paths)`);
    }
    
    /**
     * Get tick path for a candle, using cache if available
     * @param {object} candle - The candle object with o,h,l,c,t
     * @returns {array} Array of 60 price values representing tick animation
     */
    getTickPath(candle) {
        if (!candle || !candle.t) return null;
        
        // Check cache first
        if (this.tickPathCache[candle.t]) {
            return this.tickPathCache[candle.t];
        }
        
        // Generate and cache if not found
        const path = this.generateRandomPath(candle.o, candle.h, candle.l, candle.c, 60, candle.t);
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
            ticksPerRawCandle: 60,
            totalTicks: aggregatedPath.length
        };
    }
    
    /**
     * Get current price based on virtual time (replayTimestamp + tickElapsedMs)
     * This ensures consistent price display across all timeframes
     * @returns {number|null} Current animated price or null if not available
     */
    getCurrentAnimatedPrice() {
        if (!this.isPlaying) return null;
        if (!this.fullRawData || this.fullRawData.length === 0) return null;

        // Prefer the actively animating candle path (source of truth during playback).
        if (this.animatingCandle && this.tickProgress > 0) {
            if (!this.animatingCandle.cachedPath) {
                this.animatingCandle.cachedPath = this.getTickPath(this.animatingCandle.target || this.animatingCandle);
            }
            const path = this.animatingCandle.cachedPath;
            const pathIndex = Math.min(Math.max(0, this.tickProgress - 1), path.length - 1);
            const price = path[pathIndex];
            if (Number.isFinite(price)) return price;
            if (Number.isFinite(this.animatingCandle.close)) return this.animatingCandle.close;
        }

        // Fallback when no intra-candle animation is available.
        const currentRaw = this.fullRawData[this.currentIndex];
        return currentRaw ? currentRaw.c : null;
    }
    
    /**
     * Generate a REALISTIC random price path with natural market volatility
     * Uses SEEDED random for deterministic output based on candle timestamp
     * Simulates real tick-by-tick movement with momentum, reversals, and noise
     * @param {number} open - Candle open price
     * @param {number} high - Candle high price  
     * @param {number} low - Candle low price
     * @param {number} close - Candle close price
     * @param {number} numTicks - Number of ticks to generate (default 60)
     * @param {number} seed - Seed for deterministic random (use candle timestamp)
     */
    generateRandomPath(open, high, low, close, numTicks, seed = Date.now()) {
        // Create seeded random function for deterministic output
        const random = this.createSeededRandom(seed);
        
        const path = [];
        const range = high - low;
        const isBullish = close >= open;
        const body = Math.abs(close - open);
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;
        
        // Dynamic volatility based on candle characteristics
        const baseVolatility = range / numTicks * (1.5 + random() * 2);
        
        // Track if we've touched high/low (must happen naturally)
        let touchedHigh = false;
        let touchedLow = false;
        
        // Random walk state
        let price = open;
        let velocity = 0;
        let acceleration = 0;
        
        // Market microstructure simulation
        const tickSize = range * 0.001; // Minimum price movement
        let lastDirection = 0;
        let directionStreak = 0;
        let inMomentumBurst = false;
        let burstDirection = 0;
        let burstTicksRemaining = 0;
        
        // Generate random "event" times (news spikes, order flow bursts)
        const numEvents = 2 + Math.floor(random() * 4);
        const eventTicks = [];
        for (let i = 0; i < numEvents; i++) {
            eventTicks.push({
                tick: Math.floor(random() * (numTicks - 5)) + 2,
                magnitude: 0.3 + random() * 0.7,
                direction: random() > 0.5 ? 1 : -1
            });
        }
        
        for (let t = 0; t < numTicks; t++) {
            const progress = t / (numTicks - 1);
            const remainingTicks = numTicks - t;
            
            // FINAL TICK: Must close at exact close price
            if (t === numTicks - 1) {
                path.push(close);
                continue;
            }
            
            // Check for event triggers (sudden volatility spikes)
            const event = eventTicks.find(e => e.tick === t);
            if (event) {
                inMomentumBurst = true;
                burstDirection = event.direction;
                burstTicksRemaining = 3 + Math.floor(random() * 5);
                velocity += event.magnitude * range * 0.1 * event.direction;
            }
            
            // Decay momentum burst
            if (inMomentumBurst) {
                burstTicksRemaining--;
                if (burstTicksRemaining <= 0) {
                    inMomentumBurst = false;
                }
            }
            
            // === PRICE PHYSICS ===
            
            // 1. Mean reversion towards eventual close (stronger near end)
            const closeAttraction = progress > 0.7 ? 
                (close - price) / remainingTicks * (1 + (progress - 0.7) * 3) :
                (close - price) / (remainingTicks + 20) * 0.3;
            
            // 2. Random acceleration (Brownian motion)
            const randomAccel = (random() - 0.5) * baseVolatility * 0.5;
            
            // 3. Momentum (velocity persistence with decay)
            velocity = velocity * 0.85 + randomAccel;
            
            // 4. Direction streak logic (markets tend to move in bursts)
            const currentDir = velocity > 0 ? 1 : -1;
            if (currentDir === lastDirection) {
                directionStreak++;
                // Longer streaks have higher chance of reversal
                if (directionStreak > 3 && random() < directionStreak * 0.08) {
                    velocity *= -0.5; // Reversal
                    directionStreak = 0;
                }
            } else {
                directionStreak = 1;
            }
            lastDirection = currentDir;
            
            // 5. Boundary awareness (natural pull towards high/low if not touched)
            if (!touchedHigh && progress > 0.3 && random() < 0.15) {
                velocity += (high - price) * 0.05;
            }
            if (!touchedLow && progress > 0.3 && random() < 0.15) {
                velocity += (low - price) * 0.05;
            }
            
            // 6. Apply forces
            let newPrice = price + velocity + closeAttraction;
            
            // 7. Add micro-noise (bid-ask bounce simulation)
            const microNoise = (random() - 0.5) * tickSize * 10;
            newPrice += microNoise;
            
            // 8. Enforce high/low boundaries with bounce
            if (newPrice >= high) {
                newPrice = high - random() * range * 0.02;
                touchedHigh = true;
                velocity = -Math.abs(velocity) * 0.3; // Bounce down
            }
            if (newPrice <= low) {
                newPrice = low + random() * range * 0.02;
                touchedLow = true;
                velocity = Math.abs(velocity) * 0.3; // Bounce up
            }
            
            // 9. Force touch high/low before candle ends if not yet touched
            if (!touchedHigh && remainingTicks < 10 && remainingTicks > 2) {
                if (random() < 0.3) {
                    newPrice = high - random() * range * 0.01;
                    touchedHigh = true;
                }
            }
            if (!touchedLow && remainingTicks < 10 && remainingTicks > 2) {
                if (random() < 0.3) {
                    newPrice = low + random() * range * 0.01;
                    touchedLow = true;
                }
            }
            
            // 10. Final clamp
            newPrice = Math.max(low, Math.min(high, newPrice));
            
            price = newPrice;
            path.push(price);
        }
        
        // Post-process: ensure high and low were actually touched
        // Use seeded random for deterministic placement
        if (!touchedHigh) {
            const highIdx = Math.floor(numTicks * (0.2 + random() * 0.5));
            if (highIdx < path.length - 1) path[highIdx] = high;
        }
        if (!touchedLow) {
            const lowIdx = Math.floor(numTicks * (0.2 + random() * 0.5));
            if (lowIdx < path.length - 1 && lowIdx !== path.indexOf(high)) path[lowIdx] = low;
        }
        
        return path;
    }
    
    /**
     * Update chart display with the currently animating candle
     */
    updateChartWithAnimatedCandle() {
        if (!this.animatingCandle || !this.chart) return;
        
        // Create animated data up to current index plus the forming candle
        const slicedRaw = this.fullRawData.slice(0, this.currentIndex + 1);
        
        // Add the animated candle
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
        
        // Only recalculate indicators every 10th tick to reduce lag
        if (this.tickProgress % 10 === 0 && this.chart.recalculateAllIndicators) {
            this.chart.recalculateAllIndicators();
        }
        
        // Auto-scroll if enabled (only check occasionally)
        if (this.autoScrollEnabled && this.tickProgress % 5 === 0) {
            this.chart.fitToView();
        }
        
        // Render immediately without scheduling for smoother animation
        if (this.chart.render) {
            this.chart.render();
        }
        
        // SYNC ANIMATED CANDLE TO ALL PANEL CHARTS
        // Update every 2nd tick to reduce lag while keeping panels in sync
        if (this.tickProgress % 2 === 0) {
            this.syncPanelChartsWithAnimatedCandle(slicedRaw, animatedCandle);
        }
        
        // Check order manager for SL/TP hits during tick animation
        // Only check every 3rd tick to reduce lag, but always check on final ticks
        const ticksNeeded = this.currentTicksPerCandle || this.ticksPerCandle;
        const isNearEnd = this.tickProgress > ticksNeeded * 0.8;
        if (this.chart.orderManager && typeof this.chart.orderManager.updatePositions === 'function') {
            if (this.tickProgress % 3 === 0 || isNearEnd) {
                this.chart.orderManager.updatePositions();
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
        
        console.log(`   💰 Animating candle close: ${animatedCandle.c}`);
        
        // Update chart data
        this.chart.rawData = slicedRaw;
        this.chart.data = this.chart.resampleData(slicedRaw, this.chart.currentTimeframe);
        
        // Bump data version if available
        if (typeof this.chart.bumpDataVersion === 'function') {
            this.chart.bumpDataVersion();
        }
        
        // Recalculate indicators
        if (typeof this.chart.recalculateIndicators === 'function') {
            try {
                this.chart.recalculateIndicators();
            } catch (error) {
                console.warn('⚠️ Error recalculating indicators:', error);
            }
        }
        
        // Update slider
        this.updateSliderRange();
        this.updateSlider();
        this.updateTimeDisplay();
        
        console.log(`   📊 Chart updated with animated candle, data.length=${this.chart.data.length}`);
    }
    
    /**
     * Sync all panel charts with the animated candle during tick animation
     */
    syncPanelChartsWithAnimatedCandle(slicedRaw, animatedCandle) {
        // Check if panel manager exists and has panels
        if (!window.panelManager || !window.panelManager.panels || window.panelManager.panels.length === 0) {
            return;
        }
        
        // Update each panel chart with the same animated data
        window.panelManager.panels.forEach((panel, index) => {
            if (panel.chartInstance && panel.chartInstance.isPanel) {
                try {
                    // Update raw data to same slice (includes animated candle)
                    panel.chartInstance.rawData = [...slicedRaw];
                    
                    // Resample to panel's timeframe
                    panel.chartInstance.data = panel.chartInstance.resampleData(
                        slicedRaw, 
                        panel.chartInstance.currentTimeframe
                    );
                    
                    // Recalculate indicators every 10th tick
                    if (this.tickProgress % 10 === 0 && typeof panel.chartInstance.recalculateIndicators === 'function') {
                        try {
                            panel.chartInstance.recalculateIndicators();
                        } catch (error) {
                            // Silent fail for indicator errors during animation
                        }
                    }
                    
                    // Auto-scroll panel if enabled (every 5th tick)
                    if (this.autoScrollEnabled && this.tickProgress % 5 === 0) {
                        if (panel.chartInstance.fitToView) {
                            panel.chartInstance.fitToView();
                        } else {
                            const candleSpacing = panel.chartInstance.getCandleSpacing ? 
                                                 panel.chartInstance.getCandleSpacing() : 
                                                 (panel.chartInstance.candleWidth + (panel.chartInstance.candleGap || 2));
                            const numVisibleCandles = Math.floor(panel.chartInstance.w / candleSpacing);
                            const scrollPosition = Math.max(0, panel.chartInstance.data.length - Math.floor(numVisibleCandles * 0.8));
                            panel.chartInstance.offsetX = -scrollPosition * candleSpacing;
                        }
                    }
                    
                    // Render panel
                    if (panel.chartInstance.render) {
                        panel.chartInstance.render();
                    }
                } catch (error) {
                    // Silent fail during animation to prevent lag
                }
            }
        });
    }
    
    /**
     * Complete the tick animation and move to next candle
     */
    completeTickAnimation() {
        this.stopTickAnimation();
        
        // ALWAYS advance by 1 raw candle for smooth animation on all TFs
        // The display timeframe only affects how data is shown, not playback
        this.currentIndex = this.currentIndex + 1;
        
        // === UPDATE VIRTUAL TIME: Set to the new candle's timestamp ===
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0; // Reset elapsed time for new candle
        }
        
        // Update slider and time display
        this.updateTimeDisplay();
        this.updateSlider();
        
        // Sync panel charts
        this.syncPanelCharts();
        
        // Start animation for next candle if still playing
        if (this.isPlaying && this.currentIndex < this.fullRawData.length - 1) {
            this._nextCandleTimer = setTimeout(() => {
                this._nextCandleTimer = null;
                if (this.isPlaying) this.startTickAnimation();
            }, 50);
        } else if (this.currentIndex >= this.fullRawData.length - 1) {
            if (this.chart._serverCursors && this.chart._serverCursors.hasMoreRight) {
                this.chart.checkViewportLoadMore('forward');
                if (this.isPlaying) {
                    this._nextCandleTimer = setTimeout(() => {
                        this._nextCandleTimer = null;
                        if (this.isPlaying) this.startTickAnimation();
                    }, 120);
                }
            } else {
                this.pause();
            }
        }
    }
    
    /**
     * Stop tick animation
     * If _preserveTickProgress is set, keeps animatingCandle and tickProgress intact
     */
    stopTickAnimation() {
        console.log(`🛑 stopTickAnimation called - _preserveTickProgress=${this._preserveTickProgress}, hasAnimatingCandle=${!!this.animatingCandle}`);
        
        if (this.tickInterval) {
            clearTimeout(this.tickInterval); // Changed to clearTimeout for volume-weighted scheduling
            this.tickInterval = null;
        }
        
        // Only clear animation state if NOT preserving for timeframe change
        if (!this._preserveTickProgress) {
            console.log(`   ❌ Clearing animatingCandle and tickProgress`);
            this.animatingCandle = null;
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
        } else {
            console.log(`   ✅ PRESERVING animatingCandle (close=${this.animatingCandle?.close}) and tickProgress=${this.tickProgress}`);
        }
        
        this.volumeTickData = null; // Clear volume data
        
        // Reset tick progress indicator
        this.updateTickProgress(0);
    }

    /**
     * Pause playback and normalize to canonical closed-candle state.
     */
    pause() {
        // Set state first
        this.isPlaying = false;
        
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

        // Discard partial intra-candle state on pause so timeframe switches
        // always compare using the same finalized raw candle snapshot.
        const hadPartialState = this.tickProgress > 0 || !!this.animatingCandle;
        if (hadPartialState) {
            this.animatingCandle = null;
            this.tickProgress = 0;
            this.tickElapsedMs = 0;
            if (this.fullRawData && this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            }
            if (this.isActive) {
                this.updateChartData(false);
            }
        }
        
        // Hide tick progress indicator
        this.showTickProgress(false);
        
        // Update button UI immediately
        this.togglePlayUI(false);
        
        console.log(`⏸️ Paused - tickProgress=${this.tickProgress}, animatingCandle.close=${this.animatingCandle?.close}`);
    }

    /**
     * Stop playback
     */
    stop() {
        this.pause();
    }

    /**
     * Step forward one bar (based on selected timeframe)
     */
    stepForward() {
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) {
            console.log('⏭️ Replay not active or no data');
            return;
        }
        
        if (this.currentIndex >= this.fullRawData.length - 1) {
            console.log('⏭️ Already at last candle');
            return;
        }

        console.log('🔧 DEBUG - timeframeSelect element:', this.timeframeSelect);
        console.log('🔧 DEBUG - timeframeSelect.value:', this.timeframeSelect ? this.timeframeSelect.value : 'NULL');
        
        let selectedTimeframe = this.timeframeSelect ? this.timeframeSelect.value : null;
        
        // If "sync" is selected, use the chart's current timeframe
        if (selectedTimeframe === 'sync') {
            selectedTimeframe = this.chart.currentTimeframe;
            console.log(`📊 Sync mode - using chart timeframe: ${selectedTimeframe}`);
        }
        
        console.log(`🔍 Step Forward - Selected TF: ${selectedTimeframe}, Current Index: ${this.currentIndex}`);
        
        if (!selectedTimeframe) {
            // No timeframe selector - advance by one raw candle
            this.currentIndex++;
            console.log(`⏭️ Step forward to index ${this.currentIndex}`);
            if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
                this.tickElapsedMs = 0;
            }
            this.updateChartData(this.autoScrollEnabled);
            return;
        }

        // Resample fullRawData to selected timeframe
        const resampledData = this.chart.resampleData(this.fullRawData, selectedTimeframe);
        console.log(`📊 Resampled data: ${resampledData.length} candles`);
        
        // Find current position timestamp
        const currentTimestamp = this.fullRawData[this.currentIndex].t;
        console.log(`⏰ Current timestamp: ${new Date(currentTimestamp).toISOString()}`);
        
        // Find which resampled candle we're currently in or past
        let currentResampledIndex = -1;
        for (let i = 0; i < resampledData.length; i++) {
            if (resampledData[i].t <= currentTimestamp) {
                currentResampledIndex = i;
                // Keep going to find the last one we're in or past
            } else {
                break;
            }
        }
        
        console.log(`📍 Current resampled index: ${currentResampledIndex}/${resampledData.length - 1}`);
        
        if (currentResampledIndex === -1 || currentResampledIndex >= resampledData.length - 1) {
            // Already at or past last candle of selected timeframe
            this.currentIndex = this.fullRawData.length - 1;
            console.log('⏭️ Already at last candle of selected timeframe');
            if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
                this.tickElapsedMs = 0;
            }
            this.updateChartData(this.autoScrollEnabled);
            return;
        }
        
        // Move to the END of the next resampled candle
        // Find the last raw candle before the candle AFTER next starts
        const nextResampledIndex = currentResampledIndex + 1;
        const nextNextIndex = nextResampledIndex + 1;
        
        let targetIndex;
        if (nextNextIndex < resampledData.length) {
            // Find last raw candle before the next-next resampled candle starts
            const boundaryTimestamp = resampledData[nextNextIndex].t;
            targetIndex = this.fullRawData.length - 1; // default to last
            for (let i = this.currentIndex + 1; i < this.fullRawData.length; i++) {
                if (this.fullRawData[i].t >= boundaryTimestamp) {
                    targetIndex = i - 1;
                    break;
                }
            }
        } else {
            // Next is the last resampled candle, go to end
            targetIndex = this.fullRawData.length - 1;
        }
        
        this.currentIndex = Math.max(this.currentIndex + 1, targetIndex);
        console.log(`⏭️ Step forward by ${selectedTimeframe} to index ${this.currentIndex} (${new Date(this.fullRawData[this.currentIndex].t).toISOString()})`);
        if (this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        this.updateChartData(this.autoScrollEnabled);
    }

    /**
     * Step backward one bar (based on selected timeframe)
     */
    stepBackward() {
        if (!this.isActive || !this.fullRawData || this.fullRawData.length === 0) {
            console.log('⏮️ Replay not active or no data');
            return;
        }
        
        if (this.currentIndex <= 0) {
            console.log('⏮️ Already at first candle');
            return;
        }

        let selectedTimeframe = this.timeframeSelect ? this.timeframeSelect.value : null;
        
        // If "sync" is selected, use the chart's current timeframe
        if (selectedTimeframe === 'sync') {
            selectedTimeframe = this.chart.currentTimeframe;
            console.log(`📊 Sync mode - using chart timeframe: ${selectedTimeframe}`);
        }
        
        console.log(`🔍 Step Backward - Selected TF: ${selectedTimeframe}, Current Index: ${this.currentIndex}`);
        
        if (!selectedTimeframe) {
            // No timeframe selector - go back by one raw candle
            this.currentIndex--;
            console.log(`⏮️ Step backward to index ${this.currentIndex}`);
            if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
                this.tickElapsedMs = 0;
            }
            this.updateChartData(this.autoScrollEnabled);
            return;
        }

        // Resample fullRawData to selected timeframe
        const resampledData = this.chart.resampleData(this.fullRawData, selectedTimeframe);
        console.log(`📊 Resampled data: ${resampledData.length} candles`);
        
        // Find current position timestamp
        const currentTimestamp = this.fullRawData[this.currentIndex].t;
        console.log(`⏰ Current timestamp: ${new Date(currentTimestamp).toISOString()}`);
        
        // Find which resampled candle we're currently in or past
        let currentResampledIndex = -1;
        for (let i = 0; i < resampledData.length; i++) {
            if (resampledData[i].t <= currentTimestamp) {
                currentResampledIndex = i;
                // Keep going to find the last one we're in or past
            } else {
                break;
            }
        }
        
        console.log(`📍 Current resampled index: ${currentResampledIndex}/${resampledData.length - 1}`);
        
        if (currentResampledIndex === -1 || currentResampledIndex <= 0) {
            // Already at first candle of selected timeframe
            this.currentIndex = 0;
            console.log('⏮️ Already at first candle of selected timeframe');
            if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
                this.tickElapsedMs = 0;
            }
            this.updateChartData(this.autoScrollEnabled);
            return;
        }
        
        // Move to the END of the previous resampled candle
        // Find the last raw candle before the current resampled candle starts
        const prevResampledIndex = currentResampledIndex - 1;
        const currentResampledStart = resampledData[currentResampledIndex].t;
        
        let targetIndex;
        // Find last raw candle before current resampled candle starts
        targetIndex = 0; // default to first
        for (let i = this.currentIndex - 1; i >= 0; i--) {
            if (this.fullRawData[i].t < currentResampledStart) {
                targetIndex = i;
                break;
            }
        }
        
        this.currentIndex = targetIndex;
        console.log(`⏮️ Step backward by ${selectedTimeframe} to index ${this.currentIndex} (${new Date(this.fullRawData[this.currentIndex].t).toISOString()})`);
        if (this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0;
        }
        this.updateChartData(this.autoScrollEnabled);
    }

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        this.speed = speed;
        console.log(`🎚️ Speed set to ${speed}x`);
        
        // Update button UI to show active state
        this.updateSpeedButtonUI(speed);
        
        // If playing, restart tick animation with new speed but PRESERVE progress
        if (this.isPlaying) {
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
        this.currentIndex = Math.max(0, Math.min(index, this.fullRawData.length - 1));
        
        // === UPDATE VIRTUAL TIME: Sync replayTimestamp with new position ===
        if (this.fullRawData && this.fullRawData[this.currentIndex]) {
            this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            this.tickElapsedMs = 0; // Reset elapsed time when seeking
        }
        
        const autoScroll = fromDrag ? false : this.autoScrollEnabled;
        this.updateChartData(autoScroll);
    }

    /**
     * Called when user manually pans the chart
     */
    onUserPan() {
        if (!this.isActive) return;
        
        console.log('👆 User manually panned - disabling auto-scroll');
        this.autoScrollEnabled = false;
        this.userHasPanned = true;
        
        // Show visual indicator that auto-scroll is disabled
        this.updateAutoScrollIndicator();
    }

    /**
     * Re-enable auto-scroll (follow mode)
     */
    enableAutoScroll() {
        console.log('🎯 Re-enabling auto-scroll');
        this.autoScrollEnabled = true;
        this.userHasPanned = false;
        
        // Immediately hide the follow button
        if (this.followBtn) {
            this.followBtn.style.display = 'none';
        }
        
        // Scroll to latest position
        this.updateChartData(true);
        
        // Update visual indicator after render completes
        requestAnimationFrame(() => {
            this.updateAutoScrollIndicator();
        });
    }

    /**
     * Check if the last candle is visible in the viewport
     */
    isLastCandleVisible() {
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) {
            console.log('⚠️ No chart or data available');
            return true;
        }
        
        const lastIndex = this.chart.data.length - 1;
        
        // Use getVisibleEndIndex method if available, otherwise fall back to property
        let visibleEnd;
        if (typeof this.chart.getVisibleEndIndex === 'function') {
            visibleEnd = this.chart.getVisibleEndIndex();
        } else {
            visibleEnd = this.chart.visibleEndIndex || 0;
        }
        
        console.log('📊 Last candle check - lastIndex:', lastIndex, 'visibleEnd:', visibleEnd, 'diff:', lastIndex - visibleEnd);
        
        // Last candle is visible if it's within the visible range (with small buffer)
        const isVisible = visibleEnd >= (lastIndex - 1);
        return isVisible;
    }

    /**
     * Update visual indicator for auto-scroll status
     */
    updateAutoScrollIndicator() {
        if (!this.followBtn) {
            console.log('⚠️ Follow button not found');
            return;
        }
        const followBtn = this.followBtn;
        
        // Only show during replay mode
        if (!this.isActive) {
            console.log('🔴 Follow button hidden - replay not active');
            followBtn.style.display = 'none';
            return;
        }
        
        // Check if last candle is visible
        const lastCandleVisible = this.isLastCandleVisible();
        console.log('👁️ Last candle visible:', lastCandleVisible);
        
        // Hide button when last candle is visible, show when scrolled away
        if (lastCandleVisible) {
            console.log('🔴 Follow button hidden - last candle visible');
            followBtn.style.display = 'none';
        } else {
            console.log('🟢 Follow button shown - scrolled away from last candle');
            followBtn.style.display = 'flex';
            followBtn.style.opacity = '1';
            // Position is handled by CSS (absolute positioning inside chart-wrapper)
        }
    }

    /**
     * Update time display with TradingView-style format: (Day) YYYY-MM-DD HH:MM:SS
     * Uses timezone manager if available
     */
    updateTimeDisplay() {
        if (!this.timeLabel || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        const currentBar = this.fullRawData[this.currentIndex];
        if (!currentBar || !currentBar.t) {
            return;
        }

        // Use timezone manager if available
        if (window.timezoneManager) {
            const timeStr = window.timezoneManager.formatTime(currentBar.t, 'full');
            this.timeLabel.textContent = timeStr;
            return;
        }

        // Fallback to local time
        const date = new Date(currentBar.t);
        
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
            const percent = (this.currentIndex / (this.fullRawData.length - 1)) * 100;
            progressFill.style.width = `${percent}%`;
        }
    }

    updateSliderRange() {
        if (!this.slider || !this.fullRawData || this.fullRawData.length === 0) {
            return;
        }

        const max = Math.max(0, this.fullRawData.length - 1);
        this.slider.min = 0;
        this.slider.max = max;
        this.slider.value = Math.min(this.currentIndex, max);
    }

    /**
     * Handle timeframe change during replay
     * Uses VIRTUAL TIME to maintain consistent price across all timeframes
     */
    onTimeframeChange() {
        if (!this.isActive) {
            console.log('⚠️ onTimeframeChange called but replay not active');
            return;
        }

        if (this._timeframeChanging) {
            return;
        }
        
        const newTimeframe = this.chart.currentTimeframe;
        
        // === CRITICAL: LOCK THE STATE DURING TIMEFRAME CHANGE ===
        this._timeframeChanging = true;
        
        const wasPlaying = this.isPlaying;
        const savedSpeed = this.speed;
        
        // === SAVE VIRTUAL TIME STATE ===
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
        
        // Get current animated price from tick path cache (deterministic!)
        let savedAnimatedPrice = null;
        const nextCandle = this.fullRawData[this.currentIndex + 1];
        if (nextCandle && this.tickPathCache[nextCandle.t] && savedTickProgress > 0) {
            const tickPath = this.tickPathCache[nextCandle.t];
            const pathIndex = Math.min(savedTickProgress - 1, tickPath.length - 1);
            savedAnimatedPrice = tickPath[pathIndex];
        } else if (this.animatingCandle) {
            savedAnimatedPrice = this.animatingCandle.close;
        }
        
        console.log(`🔄 TIMEFRAME CHANGE: ${newTimeframe}`);
        console.log(`   📍 STATE: index=${savedCurrentIndex}, tickProgress=${savedTickProgress}, price=${savedAnimatedPrice}`);
        
        // === STOP ANIMATION CLEANLY ===
        if (this.tickInterval) {
            clearTimeout(this.tickInterval);
            this.tickInterval = null;
        }
        this.isPlaying = false;
        this.animatingCandle = null;
        
        // Save view position
        const savedPriceOffset = this.chart.priceOffset;
        const savedPriceZoom = this.chart.priceZoom;
        
        // Update chart data with current position (client-side resample)
        this.updateChartData(false);
        
        // Fire event for drawings refresh
        window.dispatchEvent(new CustomEvent('chartDataLoaded', {
            detail: { 
                data: this.chart.data,
                rawData: this.chart.rawData,
                symbol: this.chart.currentSymbol,
                timeframe: this.chart.currentTimeframe
            }
        }));
        
        // Restore view position and state after a short delay
        setTimeout(() => {
            // Restore exact position
            this.currentIndex = savedCurrentIndex;
            if (Number.isFinite(savedReplayTimestamp)) {
                this.replayTimestamp = savedReplayTimestamp;
            } else if (this.fullRawData[this.currentIndex]) {
                this.replayTimestamp = this.fullRawData[this.currentIndex].t;
            }
            this.tickProgress = savedTickProgress;
            this.tickElapsedMs = savedTickElapsedMs;
            
            // Find containing candle in resampled data (last candle with t <= replay ts)
            // so timeframe switches never jump to a future candle.
            const replayTsForMapping = Number.isFinite(savedReplayTimestamp)
                ? savedReplayTimestamp
                : (this.replayTimestamp ?? this.fullRawData[this.currentIndex]?.t ?? null);
            let targetViewIndex = 0;
            for (let i = 0; i < this.chart.data.length; i++) {
                if (replayTsForMapping == null || this.chart.data[i].t <= replayTsForMapping) {
                    targetViewIndex = i;
                } else {
                    break;
                }
            }
            
            // Position view
            const candleSpacing = this.chart.getCandleSpacing ? this.chart.getCandleSpacing() : 
                                    (this.chart.candleWidth + (this.chart.candleGap || 2));
            this.chart.offsetX = this.chart.w / 2 - (targetViewIndex * candleSpacing) - candleSpacing / 2;
            this.chart.priceOffset = savedPriceOffset;
            this.chart.priceZoom = savedPriceZoom;
            
            if (typeof this.chart.constrainOffset === 'function') {
                this.chart.constrainOffset();
            }
            
            // === UPDATE LAST CANDLE WITH DETERMINISTIC PRICE ===
            // Only preserve intra-candle animated price while actively playing.
            if (wasPlaying && Number.isFinite(savedAnimatedPrice) && this.chart.data && this.chart.data.length > 0) {
                const lastCandle = this.chart.data[this.chart.data.length - 1];
                lastCandle.c = savedAnimatedPrice;
                if (savedAnimatedPrice > lastCandle.h) lastCandle.h = savedAnimatedPrice;
                if (savedAnimatedPrice < lastCandle.l) lastCandle.l = savedAnimatedPrice;
                console.log(`   💰 Set price from tick cache: ${savedAnimatedPrice}`);
            }
            
            this.chart.renderPending = true;
            this.chart.render();
            
            this.updateSlider();
            this.updateTimeDisplay();
            
            // === UNLOCK STATE ===
            this._timeframeChanging = false;
            
            console.log(`   ✅ TF CHANGE DONE: index=${this.currentIndex}, tickProgress=${this.tickProgress}`);
            
            // === RECREATE ANIMATING CANDLE STATE ===
            const nextCandle = this.fullRawData[this.currentIndex + 1];
            if (wasPlaying && nextCandle && savedTickProgress > 0) {
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
                    volume: (nextCandle.v || 0) * (savedTickProgress / 60),
                    targetVolume: nextCandle.v || 0,
                    t: nextCandle.t,
                    cachedPath: tickPath
                };
                
                for (let i = 0; i <= pathIndex; i++) {
                    this.animatingCandle.high = Math.max(this.animatingCandle.high, tickPath[i]);
                    this.animatingCandle.low = Math.min(this.animatingCandle.low, tickPath[i]);
                }
                
                console.log(`   🎯 Rebuilt animatingCandle: price=${currentPrice}, tickProgress=${savedTickProgress}`);
                this.updateChartWithAnimatedCandle();
            }
            
            // === RESUME PLAYBACK IF WAS PLAYING ===
            if (wasPlaying) {
                this._preserveTickProgress = true;
                this.speed = savedSpeed;
                console.log(`   ▶️ RESUME: tickProgress=${this.tickProgress}, price=${this.animatingCandle?.close}`);
                this.play();
            }
        }, 50);
    }
    
    /**
     * Synchronize all panel charts with current replay position
     */
    syncPanelCharts() {
        // Check if panel manager exists and has panels
        if (!window.panelManager || !window.panelManager.panels || window.panelManager.panels.length === 0) {
            return;
        }
        
        console.log(`🔄 Syncing ${window.panelManager.panels.length} panel charts with replay position ${this.currentIndex}`);
        
        // Get the sliced raw data (same as main chart)
        const sliceEnd = Math.max(this.currentIndex + 1, 1);
        const slicedRawData = this.fullRawData.slice(0, sliceEnd);
        
        // Update each panel chart
        window.panelManager.panels.forEach((panel, index) => {
            if (panel.chartInstance && panel.chartInstance.isPanel) {
                try {
                    // Update raw data to same slice
                    panel.chartInstance.rawData = slicedRawData;
                    
                    // Resample to panel's timeframe
                    panel.chartInstance.data = panel.chartInstance.resampleData(
                        slicedRawData, 
                        panel.chartInstance.currentTimeframe
                    );
                    
                    // Recalculate indicators if available
                    if (typeof panel.chartInstance.recalculateIndicators === 'function') {
                        try {
                            panel.chartInstance.recalculateIndicators();
                        } catch (error) {
                            console.warn(`⚠️ Error recalculating indicators for panel ${index}:`, error);
                        }
                    }
                    
                    // Auto-scroll panel if enabled
                    if (this.autoScrollEnabled) {
                        const candleSpacing = panel.chartInstance.getCandleSpacing ? 
                                             panel.chartInstance.getCandleSpacing() : 
                                             (panel.chartInstance.candleWidth + (panel.chartInstance.candleGap || 2));
                        const numVisibleCandles = Math.floor(panel.chartInstance.w / candleSpacing);
                        const scrollPosition = Math.max(0, panel.chartInstance.data.length - Math.floor(numVisibleCandles * 0.8));
                        panel.chartInstance.offsetX = -scrollPosition * candleSpacing;
                    }
                    
                    // Apply constraints
                    if (typeof panel.chartInstance.constrainOffset === 'function') {
                        panel.chartInstance.constrainOffset();
                    }
                    
                    // Render panel
                    panel.chartInstance.renderPending = true;
                    panel.chartInstance.render();
                    
                    console.log(`  ✅ Panel ${index} synced: ${panel.chartInstance.data.length} candles (${panel.chartInstance.currentTimeframe})`);
                } catch (error) {
                    console.error(`❌ Error syncing panel ${index}:`, error);
                }
            }
        });
        
        console.log(`✅ All panels synced to replay position ${this.currentIndex}`);
    }
}

// Export for use in main chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReplaySystem;
}

// Debug function for console
window.debugReplay = function() {
    console.log('=== REPLAY SYSTEM DEBUG ===');
    
    console.log('Toolbar element:', document.getElementById('replayToolbar'));
    console.log('Replay button:', document.getElementById('replayModeBtn'));
    console.log('Replay system instance:', window.chart && window.chart.replaySystem);
    console.log('=========================');
};
