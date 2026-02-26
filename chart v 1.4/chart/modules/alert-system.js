/**
 * Alert System Module
 * TradingView-style price alerts with visual lines, notifications, and sounds
 */

class AlertSystem {
    constructor(chart) {
        this.chart = chart;
        this.alerts = [];
        this.storageKey = 'chart_alerts';
        this.isVisible = false;
        this.alertSound = null;
        this.checkInterval = null;
        this.lastPrices = {}; // Track last prices for crossing detection
        
        // Alert conditions
        this.conditions = {
            CROSSING: 'crossing',
            CROSSING_UP: 'crossing_up',
            CROSSING_DOWN: 'crossing_down',
            GREATER_THAN: 'greater_than',
            LESS_THAN: 'less_than',
            ENTERING_CHANNEL: 'entering_channel',
            EXITING_CHANNEL: 'exiting_channel'
        };
        
        // Alert expiration options
        this.expirations = {
            ONCE: 'once',
            EVERY_TIME: 'every_time',
            ONCE_PER_BAR: 'once_per_bar'
        };
        
        this.init();
    }
    
    init() {
        console.log('🔔 Initializing Alert System...');
        
        this.loadAlerts();
        this.setupUI();
        this.setupEventListeners();
        this.startAlertChecker();
        this.initAlertSound();
        
        console.log('✅ Alert System initialized with', this.alerts.length, 'alerts');
    }
    
    /**
     * Initialize alert sound
     */
    initAlertSound() {
        // Create audio context for alert sounds
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio context not available');
        }
    }
    
    /**
     * Play alert sound
     */
    playAlertSound(type = 'default') {
        if (!this.audioContext) return;
        
        try {
            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Different sounds for different alert types
            switch (type) {
                case 'crossing_up':
                    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(1100, this.audioContext.currentTime + 0.1);
                    break;
                case 'crossing_down':
                    oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime + 0.1);
                    break;
                default:
                    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            }
            
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);
        } catch (e) {
            console.warn('Could not play alert sound:', e);
        }
    }
    
    /**
     * Setup UI elements
     */
    setupUI() {
        this.iconBtn = document.getElementById('alertsIconBtn');
        this.panel = document.getElementById('alertsContent');
        this.alertsList = document.getElementById('alertsList');
        this.alertBadge = document.getElementById('alertsBadge');
        
        // Create alert lines container if not exists
        if (!this.chart.svg.select('#alertLinesGroup').node()) {
            this.chart.svg.append('g')
                .attr('id', 'alertLinesGroup')
                .attr('class', 'alert-lines-group')
                .style('pointer-events', 'all');
        } else {
            // Ensure pointer-events is enabled
            this.chart.svg.select('#alertLinesGroup')
                .style('pointer-events', 'all');
        }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Icon button click
        if (this.iconBtn) {
            this.iconBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }
        
        // Add alert button
        const addAlertBtn = document.getElementById('addAlertBtn');
        if (addAlertBtn) {
            addAlertBtn.addEventListener('click', () => {
                this.showCreateAlertModal();
            });
        }
        
        // Close panel button
        const closeBtn = document.getElementById('closeAlertsPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hidePanel();
            });
        }
        
        // Listen for chart context menu events
        document.addEventListener('chartContextMenu', (e) => {
            if (e.detail && e.detail.price) {
                this.addContextMenuOption(e.detail);
            }
        });
    }
    
    /**
     * Toggle panel visibility
     */
    togglePanel() {
        if (this.isVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }
    
    /**
     * Show alerts panel
     */
    showPanel() {
        const unifiedPanel = document.getElementById('unifiedRightPanel');
        const panelTitle = document.getElementById('unifiedPanelTitle');
        
        // Hide all content panels
        document.querySelectorAll('.unified-panel-content').forEach(c => {
            c.classList.remove('active');
        });
        
        // Remove active from all sidebar buttons
        document.querySelectorAll('.right-sidebar-icon-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show alerts content
        if (this.panel) {
            this.panel.classList.add('active');
        }
        
        // Show unified panel
        if (unifiedPanel) {
            unifiedPanel.classList.add('visible');
        }
        
        // Update title
        if (panelTitle) {
            panelTitle.textContent = 'Alerts';
        }
        
        // Mark button as active
        if (this.iconBtn) {
            this.iconBtn.classList.add('active');
        }
        
        this.isVisible = true;
        this.refreshAlertsList();
    }
    
    /**
     * Hide alerts panel
     */
    hidePanel() {
        const unifiedPanel = document.getElementById('unifiedRightPanel');
        
        if (this.panel) {
            this.panel.classList.remove('active');
        }
        
        if (unifiedPanel) {
            unifiedPanel.classList.remove('visible');
        }
        
        if (this.iconBtn) {
            this.iconBtn.classList.remove('active');
        }
        
        this.isVisible = false;
    }
    
    /**
     * Create a new alert
     */
    createAlert(options) {
        const alert = {
            id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            symbol: options.symbol || this.getSymbolName(),
            price: parseFloat(options.price),
            condition: options.condition || this.conditions.CROSSING,
            message: options.message || `Price ${options.condition || 'crossing'} ${options.price}`,
            expiration: options.expiration || this.expirations.EVERY_TIME,
            active: true,
            triggered: false,
            triggeredCount: 0,
            lastTriggeredBar: null,
            color: options.color || '#ff9800',
            lineStyle: options.lineStyle || 'dashed',
            showPopup: options.showPopup !== false,
            playSound: options.playSound !== false,
            createdAt: Date.now(),
            upperPrice: options.upperPrice || null,
            lowerPrice: options.lowerPrice || null
        };
        
        this.alerts.push(alert);
        this.saveAlerts();
        this.renderAlertLines();
        this.refreshAlertsList();
        this.updateBadge();
        
        if (this.chart && typeof this.chart.showNotification === 'function') {
            this.chart.showNotification(`Alert created at ${this.formatPrice(alert.price)} ✓`);
        }
        
        console.log('🔔 Alert created:', alert);
        return alert;
    }
    
    /**
     * Get current symbol name
     */
    getSymbolName() {
        if (this.chart && this.chart.currentFileId) {
            return this.chart.currentFileId.split('_').pop() || 'SYMBOL';
        }
        return 'SYMBOL';
    }
    
    /**
     * Update an existing alert
     */
    updateAlert(alertId, updates) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            Object.assign(alert, updates);
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            console.log('🔔 Alert updated:', alert);
        }
    }
    
    /**
     * Delete an alert
     */
    deleteAlert(alertId) {
        const index = this.alerts.findIndex(a => a.id === alertId);
        if (index > -1) {
            this.alerts.splice(index, 1);
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
            
            if (this.chart && typeof this.chart.showNotification === 'function') {
                this.chart.showNotification('Alert deleted');
            }
        }
    }
    
    /**
     * Toggle alert active state
     */
    toggleAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.active = !alert.active;
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
        }
    }
    
    /**
     * Check all alerts against current price
     */
    checkAlerts() {
        if (!this.chart || !this.chart.data || this.chart.data.length === 0) return;
        
        const currentBar = this.chart.data[this.chart.data.length - 1];
        const currentPrice = currentBar.c;
        const symbol = this.getSymbolName();
        
        // Get last price for crossing detection
        const lastPrice = this.lastPrices[symbol] || currentPrice;
        
        this.alerts.forEach(alert => {
            if (!alert.active) return;
            
            let triggered = false;
            let triggerType = null;
            
            switch (alert.condition) {
                case this.conditions.CROSSING:
                    if ((lastPrice < alert.price && currentPrice >= alert.price) ||
                        (lastPrice > alert.price && currentPrice <= alert.price)) {
                        triggered = true;
                        triggerType = currentPrice > lastPrice ? 'crossing_up' : 'crossing_down';
                    }
                    break;
                    
                case this.conditions.CROSSING_UP:
                    if (lastPrice < alert.price && currentPrice >= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_up';
                    }
                    break;
                    
                case this.conditions.CROSSING_DOWN:
                    if (lastPrice > alert.price && currentPrice <= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_down';
                    }
                    break;
                    
                case this.conditions.GREATER_THAN:
                    if (currentPrice > alert.price && lastPrice <= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_up';
                    }
                    break;
                    
                case this.conditions.LESS_THAN:
                    if (currentPrice < alert.price && lastPrice >= alert.price) {
                        triggered = true;
                        triggerType = 'crossing_down';
                    }
                    break;
                    
                case this.conditions.ENTERING_CHANNEL:
                    if (alert.upperPrice && alert.lowerPrice) {
                        const wasOutside = lastPrice > alert.upperPrice || lastPrice < alert.lowerPrice;
                        const isInside = currentPrice <= alert.upperPrice && currentPrice >= alert.lowerPrice;
                        if (wasOutside && isInside) {
                            triggered = true;
                            triggerType = 'default';
                        }
                    }
                    break;
                    
                case this.conditions.EXITING_CHANNEL:
                    if (alert.upperPrice && alert.lowerPrice) {
                        const wasInside = lastPrice <= alert.upperPrice && lastPrice >= alert.lowerPrice;
                        const isOutside = currentPrice > alert.upperPrice || currentPrice < alert.lowerPrice;
                        if (wasInside && isOutside) {
                            triggered = true;
                            triggerType = currentPrice > alert.upperPrice ? 'crossing_up' : 'crossing_down';
                        }
                    }
                    break;
            }
            
            // Handle trigger based on expiration type
            if (triggered) {
                const currentBarTime = currentBar.t;
                
                if (alert.expiration === this.expirations.ONCE && alert.triggered) {
                    return; // Already triggered, ignore
                }
                
                if (alert.expiration === this.expirations.ONCE_PER_BAR && 
                    alert.lastTriggeredBar === currentBarTime) {
                    return; // Already triggered this bar
                }
                
                // Trigger the alert
                this.triggerAlert(alert, currentPrice, triggerType);
                alert.triggered = true;
                alert.triggeredCount++;
                alert.lastTriggeredBar = currentBarTime;
                
                // Deactivate if one-time alert
                if (alert.expiration === this.expirations.ONCE) {
                    alert.active = false;
                }
                
                this.saveAlerts();
                this.refreshAlertsList();
                this.updateBadge();
            }
        });
        
        // Update last price
        this.lastPrices[symbol] = currentPrice;
    }
    
    /**
     * Trigger an alert (show notification, play sound)
     */
    triggerAlert(alert, currentPrice, triggerType) {
        console.log('🔔 ALERT TRIGGERED:', alert.message, 'at price', currentPrice);
        
        // Play sound
        if (alert.playSound) {
            this.playAlertSound(triggerType);
        }
        
        // Show popup notification
        if (alert.showPopup) {
            this.showAlertNotification(alert, currentPrice);
        }
        
        // Flash the alert line
        this.flashAlertLine(alert);
        
        // Browser notification (if permitted)
        this.showBrowserNotification(alert, currentPrice);
    }
    
    /**
     * Show alert notification popup
     */
    showAlertNotification(alert, currentPrice) {
        const notification = document.createElement('div');
        notification.className = 'alert-notification';
        notification.innerHTML = `
            <div class="alert-notification-header">
                <span class="alert-notification-icon">🔔</span>
                <span class="alert-notification-symbol">${alert.symbol}</span>
                <button class="alert-notification-close">&times;</button>
            </div>
            <div class="alert-notification-body">
                <div class="alert-notification-message">${alert.message}</div>
                <div class="alert-notification-price">
                    <span>Alert: ${this.formatPrice(alert.price)}</span>
                    <span>Current: ${this.formatPrice(currentPrice)}</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Close button
        notification.querySelector('.alert-notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
    
    /**
     * Format price for display
     */
    formatPrice(price) {
        if (price === null || price === undefined) return '—';
        // Detect if forex (5 decimals) or other (2 decimals)
        const decimals = price < 100 ? 5 : 2;
        return price.toFixed(decimals);
    }
    
    /**
     * Flash alert line when triggered
     */
    flashAlertLine(alert) {
        const line = this.chart.svg.select(`#alert-line-${alert.id}`);
        if (line.node()) {
            line.classed('alert-line-flash', true);
            setTimeout(() => line.classed('alert-line-flash', false), 1000);
        }
    }
    
    /**
     * Show browser notification
     */
    showBrowserNotification(alert, currentPrice) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            new Notification(`${alert.symbol} Alert`, {
                body: `${alert.message}\nCurrent: ${this.formatPrice(currentPrice)}`,
                icon: 'modules/LOGO-04.png',
                tag: alert.id
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
    
    /**
     * Start the alert checker interval
     */
    startAlertChecker() {
        // Check alerts every 500ms
        this.checkInterval = setInterval(() => {
            this.checkAlerts();
        }, 500);
    }
    
    /**
     * Stop the alert checker
     */
    stopAlertChecker() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
    
    /**
     * Render alert lines on the chart using HTML overlay for interactivity
     */
    renderAlertLines() {
        if (!this.chart || !this.chart.svg) return;
        
        // Get the container element
        let containerEl = null;
        if (this.chart.container) {
            containerEl = typeof this.chart.container.node === 'function' 
                ? this.chart.container.node() 
                : this.chart.container;
        }
        if (!containerEl) {
            containerEl = document.getElementById('chart-container');
        }
        if (!containerEl) return;
        
        // Get or create HTML overlay container
        let overlay = document.getElementById('alertLinesOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'alertLinesOverlay';
            overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 50;';
            containerEl.appendChild(overlay);
        }
        
        // Clear existing overlays
        overlay.innerHTML = '';
        
        // Also render SVG lines (non-interactive, just visual)
        let group = this.chart.svg.select('#alertLinesGroup');
        if (group.empty()) {
            group = this.chart.svg.append('g')
                .attr('id', 'alertLinesGroup')
                .attr('class', 'alert-lines-group');
        }
        group.selectAll('*').remove();
        
        const yScale = this.chart.yScale;
        const width = this.chart.w;
        const margin = this.chart.margin;
        
        if (!yScale) return;
        
        const alertSystem = this;
        
        this.alerts.forEach(alert => {
            if (!alert.active) return;
            
            const y = yScale(alert.price);
            
            // Skip if price is outside visible range
            if (y < margin.t || y > this.chart.h - margin.b) return;
            
            // SVG line (visual only)
            const dashArray = alert.lineStyle === 'dashed' ? '8,4' : 
                              alert.lineStyle === 'dotted' ? '2,2' : 'none';
            
            group.append('line')
                .attr('class', 'alert-line')
                .attr('x1', margin.l)
                .attr('x2', width - margin.r)
                .attr('y1', y)
                .attr('y2', y)
                .attr('stroke', alert.color)
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', dashArray);
            
            // HTML overlay for label (interactive)
            const labelEl = document.createElement('div');
            labelEl.className = 'alert-label-overlay';
            labelEl.dataset.alertId = alert.id;
            const _axisLeft = !!(this.chart && this.chart.priceAxisLeft);
            const _labelRight = _axisLeft ? (width - margin.l + 5) : (margin.r + 5);
            labelEl.style.cssText = `
                position: absolute;
                right: ${_labelRight}px;
                top: ${y - 11}px;
                height: 22px;
                display: flex;
                align-items: center;
                background: ${alert.color};
                border-radius: 3px;
                padding: 0 6px 0 8px;
                gap: 6px;
                pointer-events: all;
                cursor: ns-resize;
                user-select: none;
                z-index: 51;
            `;
            
            labelEl.innerHTML = `
                <span style="color: #fff; font-size: 11px; font-weight: 600; white-space: nowrap;">🔔 ${this.formatPrice(alert.price)}</span>
                <button class="alert-delete-x" style="
                    width: 16px;
                    height: 16px;
                    border: none;
                    background: rgba(0,0,0,0.3);
                    color: #fff;
                    border-radius: 3px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    padding: 0;
                    line-height: 1;
                    transition: background 0.15s;
                ">✕</button>
            `;
            
            overlay.appendChild(labelEl);
            
            // Delete button click
            const deleteBtn = labelEl.querySelector('.alert-delete-x');
            deleteBtn.addEventListener('mouseenter', () => {
                deleteBtn.style.background = 'rgba(239, 68, 68, 0.9)';
            });
            deleteBtn.addEventListener('mouseleave', () => {
                deleteBtn.style.background = 'rgba(0,0,0,0.3)';
            });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                alertSystem.deleteAlert(alert.id);
            });
            
            // Drag to move alert - line moves with label in real-time
            const svgLine = group.select(`line.alert-line-${alert.id}`).node() 
                || group.selectAll('line').nodes().find((_, i) => i === this.alerts.filter(a => a.active).indexOf(alert));
            
            labelEl.addEventListener('mousedown', (e) => {
                if (e.target === deleteBtn) return;
                e.preventDefault();
                
                const currentAlert = alert;
                let startY = e.clientY;
                let currentTop = parseFloat(labelEl.style.top);
                
                // Find the corresponding SVG line
                const alertIndex = alertSystem.alerts.filter(a => a.active).indexOf(currentAlert);
                const lines = group.selectAll('line').nodes();
                const lineEl = lines[alertIndex];
                
                labelEl.style.opacity = '0.8';
                document.body.style.cursor = 'ns-resize';
                
                const priceSpan = labelEl.querySelector('span');
                
                const onMouseMove = (moveEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    const newTop = currentTop + deltaY;
                    const newY = newTop + 11; // Center of label
                    
                    // Move label
                    labelEl.style.top = newTop + 'px';
                    
                    // Move SVG line in real-time
                    if (lineEl) {
                        lineEl.setAttribute('y1', newY);
                        lineEl.setAttribute('y2', newY);
                    }
                    
                    // Update price text in real-time
                    const livePrice = yScale.invert(newY);
                    if (priceSpan) {
                        priceSpan.textContent = `🔔 ${alertSystem.formatPrice(livePrice)}`;
                    }
                };
                
                const onMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    
                    labelEl.style.opacity = '1';
                    document.body.style.cursor = '';
                    
                    // Calculate new price from Y position
                    const finalY = parseFloat(labelEl.style.top) + 11;
                    const newPrice = yScale.invert(finalY);
                    
                    // Update alert price
                    currentAlert.price = newPrice;
                    alertSystem.saveAlerts();
                    alertSystem.renderAlertLines();
                    alertSystem.refreshAlertsList();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
            
            // Double-click to edit
            labelEl.addEventListener('dblclick', (e) => {
                if (e.target !== deleteBtn) {
                    alertSystem.showEditAlertModal(alert);
                }
            });
            
            // Right-click context menu
            labelEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                alertSystem.showAlertContextMenu(e, alert);
            });
        });
    }
    
    /**
     * Show context menu for alert line
     */
    showAlertContextMenu(event, alert) {
        // Remove existing context menu
        document.querySelectorAll('.alert-context-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'alert-context-menu';
        menu.innerHTML = `
            <div class="alert-context-item" data-action="edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Alert
            </div>
            <div class="alert-context-item" data-action="toggle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${alert.active ? 
                        '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>' :
                        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
                </svg>
                ${alert.active ? 'Disable Alert' : 'Enable Alert'}
            </div>
            <div class="alert-context-divider"></div>
            <div class="alert-context-item delete" data-action="delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete Alert
            </div>
        `;
        
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        document.body.appendChild(menu);
        
        // Handle actions
        menu.querySelectorAll('.alert-context-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                switch (action) {
                    case 'edit':
                        this.showEditAlertModal(alert);
                        break;
                    case 'toggle':
                        this.toggleAlert(alert.id);
                        break;
                    case 'delete':
                        this.deleteAlert(alert.id);
                        break;
                }
                menu.remove();
            });
        });
        
        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    }
    
    /**
     * Show create alert modal
     */
    showCreateAlertModal(defaultPrice = null) {
        // Get current price if not provided
        if (defaultPrice === null && this.chart && this.chart.data && this.chart.data.length > 0) {
            defaultPrice = this.chart.data[this.chart.data.length - 1].c;
        }
        
        this.showAlertModal({
            title: 'Create Alert',
            price: defaultPrice,
            condition: this.conditions.CROSSING,
            expiration: this.expirations.EVERY_TIME,
            color: '#ff9800',
            showPopup: true,
            playSound: true
        });
    }
    
    /**
     * Show edit alert modal
     */
    showEditAlertModal(alert) {
        this.showAlertModal({
            title: 'Edit Alert',
            isEdit: true,
            alertId: alert.id,
            price: alert.price,
            condition: alert.condition,
            expiration: alert.expiration,
            message: alert.message,
            color: alert.color,
            showPopup: alert.showPopup,
            playSound: alert.playSound
        });
    }
    
    /**
     * Show alert modal (create/edit)
     */
    showAlertModal(options) {
        // Remove existing modal
        document.querySelectorAll('.alert-modal-overlay').forEach(m => m.remove());
        
        const modal = document.createElement('div');
        modal.className = 'alert-modal-overlay';
        modal.innerHTML = `
            <div class="alert-modal">
                <div class="alert-modal-header">
                    <h3>${options.title}</h3>
                    <button class="alert-modal-close">&times;</button>
                </div>
                <div class="alert-modal-body">
                    <div class="alert-form-group">
                        <label>Symbol</label>
                        <input type="text" id="alertSymbol" value="${this.getSymbolName()}" readonly>
                    </div>
                    <div class="alert-form-group">
                        <label>Price</label>
                        <input type="number" step="any" id="alertPrice" value="${options.price || ''}">
                    </div>
                    <div class="alert-form-group">
                        <label>Condition</label>
                        <select id="alertCondition">
                            <option value="crossing" ${options.condition === 'crossing' ? 'selected' : ''}>Crossing</option>
                            <option value="crossing_up" ${options.condition === 'crossing_up' ? 'selected' : ''}>Crossing Up</option>
                            <option value="crossing_down" ${options.condition === 'crossing_down' ? 'selected' : ''}>Crossing Down</option>
                            <option value="greater_than" ${options.condition === 'greater_than' ? 'selected' : ''}>Greater Than</option>
                            <option value="less_than" ${options.condition === 'less_than' ? 'selected' : ''}>Less Than</option>
                        </select>
                    </div>
                    <div class="alert-form-group">
                        <label>Trigger</label>
                        <select id="alertExpiration">
                            <option value="every_time" ${options.expiration === 'every_time' ? 'selected' : ''}>Every time</option>
                            <option value="once" ${options.expiration === 'once' ? 'selected' : ''}>Only once</option>
                            <option value="once_per_bar" ${options.expiration === 'once_per_bar' ? 'selected' : ''}>Once per bar</option>
                        </select>
                    </div>
                    <div class="alert-form-group">
                        <label>Message</label>
                        <input type="text" id="alertMessage" value="${options.message || ''}" placeholder="Optional alert message">
                    </div>
                    <div class="alert-form-group">
                        <label>Line Color</label>
                        <div class="alert-color-picker">
                            <input type="color" id="alertColor" value="${options.color || '#ff9800'}">
                            <div class="alert-color-presets">
                                <button class="alert-color-preset" data-color="#ff9800" style="background:#ff9800"></button>
                                <button class="alert-color-preset" data-color="#f44336" style="background:#f44336"></button>
                                <button class="alert-color-preset" data-color="#4caf50" style="background:#4caf50"></button>
                                <button class="alert-color-preset" data-color="#2196f3" style="background:#2196f3"></button>
                                <button class="alert-color-preset" data-color="#9c27b0" style="background:#9c27b0"></button>
                            </div>
                        </div>
                    </div>
                    <div class="alert-form-group alert-checkboxes">
                        <label class="alert-checkbox-label">
                            <input type="checkbox" id="alertShowPopup" ${options.showPopup ? 'checked' : ''}>
                            Show popup
                        </label>
                        <label class="alert-checkbox-label">
                            <input type="checkbox" id="alertPlaySound" ${options.playSound ? 'checked' : ''}>
                            Play sound
                        </label>
                    </div>
                </div>
                <div class="alert-modal-footer">
                    <button class="alert-modal-btn cancel">Cancel</button>
                    <button class="alert-modal-btn primary">${options.isEdit ? 'Update' : 'Create'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Color presets
        modal.querySelectorAll('.alert-color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('alertColor').value = btn.dataset.color;
            });
        });
        
        // Close handlers
        modal.querySelector('.alert-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.alert-modal-btn.cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // Submit handler
        modal.querySelector('.alert-modal-btn.primary').addEventListener('click', () => {
            const price = parseFloat(document.getElementById('alertPrice').value);
            const condition = document.getElementById('alertCondition').value;
            const expiration = document.getElementById('alertExpiration').value;
            const message = document.getElementById('alertMessage').value;
            const color = document.getElementById('alertColor').value;
            const showPopup = document.getElementById('alertShowPopup').checked;
            const playSound = document.getElementById('alertPlaySound').checked;
            
            if (isNaN(price)) {
                alert('Please enter a valid price');
                return;
            }
            
            if (options.isEdit) {
                this.updateAlert(options.alertId, {
                    price,
                    condition,
                    expiration,
                    message: message || `Price ${condition} ${price}`,
                    color,
                    showPopup,
                    playSound
                });
            } else {
                this.createAlert({
                    price,
                    condition,
                    expiration,
                    message: message || `Price ${condition} ${price}`,
                    color,
                    showPopup,
                    playSound
                });
            }
            
            modal.remove();
        });
        
        // Focus price input
        setTimeout(() => document.getElementById('alertPrice').focus(), 100);
    }
    
    /**
     * Refresh the alerts list in the panel
     */
    refreshAlertsList() {
        if (!this.alertsList) return;
        
        if (this.alerts.length === 0) {
            this.alertsList.innerHTML = `
                <div class="alerts-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <p>No alerts</p>
                    <span>Create your first alert using the button above or right-click on the chart</span>
                </div>
            `;
            return;
        }
        
        this.alertsList.innerHTML = this.alerts.map(alert => `
            <div class="alert-item ${alert.active ? '' : 'inactive'}" data-alert-id="${alert.id}">
                <div class="alert-item-color" style="background: ${alert.color}"></div>
                <div class="alert-item-content">
                    <div class="alert-item-header">
                        <span class="alert-item-symbol">${alert.symbol}</span>
                        <span class="alert-item-condition">${this.formatCondition(alert.condition)}</span>
                    </div>
                    <div class="alert-item-price">${this.formatPrice(alert.price)}</div>
                    ${alert.message ? `<div class="alert-item-message">${alert.message}</div>` : ''}
                    <div class="alert-item-meta">
                        <span class="alert-item-expiration">${this.formatExpiration(alert.expiration)}</span>
                        ${alert.triggeredCount > 0 ? `<span class="alert-item-count">Triggered ${alert.triggeredCount}x</span>` : ''}
                    </div>
                </div>
                <div class="alert-item-actions">
                    <button class="alert-item-btn toggle" title="${alert.active ? 'Disable' : 'Enable'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${alert.active ? 
                                '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' :
                                '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
                        </svg>
                    </button>
                    <button class="alert-item-btn edit" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="alert-item-btn delete" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        this.alertsList.querySelectorAll('.alert-item').forEach(item => {
            const alertId = item.dataset.alertId;
            
            item.querySelector('.toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleAlert(alertId);
            });
            
            item.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                const alert = this.alerts.find(a => a.id === alertId);
                if (alert) this.showEditAlertModal(alert);
            });
            
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteAlert(alertId);
            });
            
            // Click to jump to price
            item.addEventListener('click', () => {
                const alert = this.alerts.find(a => a.id === alertId);
                if (alert && this.chart && typeof this.chart.jumpToPrice === 'function') {
                    // Center on alert price
                    this.chart.centerOnPrice(alert.price);
                }
            });
        });
    }
    
    /**
     * Format condition for display
     */
    formatCondition(condition) {
        const names = {
            crossing: 'Crossing',
            crossing_up: 'Crossing Up',
            crossing_down: 'Crossing Down',
            greater_than: 'Greater Than',
            less_than: 'Less Than',
            entering_channel: 'Entering Channel',
            exiting_channel: 'Exiting Channel'
        };
        return names[condition] || condition;
    }
    
    /**
     * Format expiration for display
     */
    formatExpiration(expiration) {
        const names = {
            once: 'Once',
            every_time: 'Every time',
            once_per_bar: 'Once per bar'
        };
        return names[expiration] || expiration;
    }
    
    /**
     * Update badge count
     */
    updateBadge() {
        if (!this.alertBadge) return;
        
        const activeCount = this.alerts.filter(a => a.active).length;
        
        if (activeCount > 0) {
            this.alertBadge.textContent = activeCount;
            this.alertBadge.style.display = 'flex';
        } else {
            this.alertBadge.style.display = 'none';
        }
    }
    
    /**
     * Load alerts from storage
     */
    loadAlerts() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.alerts = JSON.parse(stored);
                console.log('📂 Loaded', this.alerts.length, 'alerts from storage');
            }
        } catch (e) {
            console.error('Failed to load alerts:', e);
            this.alerts = [];
        }
    }
    
    /**
     * Save alerts to storage
     */
    saveAlerts() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.alerts));
        } catch (e) {
            console.error('Failed to save alerts:', e);
        }
    }
    
    /**
     * Create alert from right-click on chart
     */
    createAlertAtPrice(price) {
        this.showCreateAlertModal(price);
    }
    
    /**
     * Get all active alerts
     */
    getActiveAlerts() {
        return this.alerts.filter(a => a.active);
    }
    
    /**
     * Clear all alerts
     */
    clearAllAlerts() {
        if (confirm('Delete all alerts? This cannot be undone.')) {
            this.alerts = [];
            this.saveAlerts();
            this.renderAlertLines();
            this.refreshAlertsList();
            this.updateBadge();
        }
    }
    
    /**
     * Destroy the alert system
     */
    destroy() {
        this.stopAlertChecker();
        this.chart.svg.select('#alertLinesGroup').remove();
    }
}

// Make globally available
window.AlertSystem = AlertSystem;

console.log('🔔 alert-system.js loaded');
